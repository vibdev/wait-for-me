// A stateless MCP server with one tool, `run`, that executes a program on psychoscript.
//
// Whenever the program has to wait on something outside the server (a person, or the model that called the tool),
// the server suspends the VM, seals the snapshot into the response, and forgets the request. The next request
// carries the snapshot back and the program continues where it stopped. Nothing is kept between requests.
//
//   responder: "client"  waits become MRTR InputRequiredResults (elicitation/create), per SEP-2322.
//   responder: "model"   waits become ordinary tool results with a `token`; the model continues with `resume`.
//
// try/catch blocks are checkpointed (see rewrite.js). When a catch is reached, the server can rewind the run to the
// checkpoint taken just before that try and ask whether to run the block again or let the catch handle it.

import { rewrite } from "./rewrite.js"
import { sealer, sha256, toB64, fromB64, StateError } from "./seal.js"

const PROTOCOL_TTL_MS = 10 * 60 * 1000

/** Turns `{ amount: "number" }` into a JSON Schema; passes a real `{ type: "object", ... }` schema through. */
export function toSchema(fields) {
  if (fields && fields.type === "object") return fields
  const properties = {}
  for (const [name, type] of Object.entries(fields ?? { answer: "string" }))
    properties[name] = typeof type === "string" ? { type } : type
  return { type: "object", properties, required: Object.keys(properties) }
}

const stripLine = (args) => {
  const last = args.at(-1)
  if (last && typeof last === "object" && "__line" in last) return { args: args.slice(0, -1), line: last.__line }
  return { args, line: undefined }
}

const callIndex = (key) => Number(String(key).split(":").pop())

export function createServer(ps, options) {
  const { secret, responder = "client", tools = {}, ttlMs = PROTOCOL_TTL_MS, limits = { timeoutMs: 5000 } } = options
  const box = sealer(secret)
  const parkNames = new Set(["elicit"])
  const known = new Set([...ps.globalNames, ...Object.keys(tools), "elicit", "console"])

  /**
   * Runs from fresh code or a snapshot until the program finishes or reaches a host call that parks. `resolve`
   * answers parked calls by host-call key (a resumed run re-issues the call it was suspended in, with the same key).
   */
  async function step({ code, snap, resolve, env, emit }) {
    let stop
    const stopped = new Promise((r) => (stop = r))
    const once = { ...resolve }

    const park = (kind, call, data) => {
      const key = String(call.key)
      if (key in once) {
        const r = once[key]
        delete once[key]
        if (r.throw) throw ps.Host.fail("Error", r.throw)
        return r.value
      }
      stop({ kind, key, ...data })
      return new Promise(() => {})
    }
    const parkFn = (f) => ps.Host.fn(f, { type: "async", idempotent: true })

    const globals = () => {
      const g = {
        elicit: parkFn((raw, call) => {
          const { args, line } = stripLine(raw)
          return park("elicit", call, { line, message: String(args[0] ?? ""), schema: toSchema(args[1]) })
        }),
        __checkpoint: parkFn(([id], call) => park("checkpoint", call, { id: Number(id) })),
        __caught: parkFn(([id, error], call) => park("caught", call, { id: Number(id), error })),
      }
      for (const [name, impl] of Object.entries(tools)) {
        g[name] = ps.Host.fn(
          async (args, call) => {
            const t0 = performance.now()
            try {
              const value = await impl(...args)
              emit({ type: "host", name, args, value, ms: performance.now() - t0, n: callIndex(call.key) })
              return value
            } catch (error) {
              emit({ type: "host", name, args, error: error.message, ms: performance.now() - t0, n: callIndex(call.key) })
              throw ps.Host.fail(error.kind ?? "Error", error.message)
            }
          },
          { type: "async", idempotent: true },
        )
      }
      // Functions the program calls but nobody wrote. With the model as responder, the model fills them in.
      for (const name of env.missing ?? []) {
        g[name] = parkFn(async (raw, call) => {
          const { args, line } = stripLine(raw)
          const impl = env.impls?.[name]
          // The call the run was suspended in is re-issued on resume; it takes the answer it was given.
          if (impl === undefined || String(call.key) in once) return park("missing", call, { line, name, args })
          const value = await runImplementation(impl, args)
          emit({ type: "impl", name, args, value: value.ok ? value.value : undefined, error: value.ok ? undefined : value.error.message })
          if (!value.ok) throw ps.Host.fail("Error", value.error.message)
          return value.value
        })
      }
      return g
    }

    const runtime = ps.Runtime.make({ limits, globals })
    const t0 = performance.now()
    const program = snap ? runtime.resume(ps.fromBytes(snap)) : runtime.program(code)
    if (snap) emit({ type: "resume", bytes: snap.length, ms: performance.now() - t0 })
    const running = program.run()
    const first = await Promise.race([running.then((result) => ({ result })), stopped.then((s) => ({ stop: s }))])
    if (first.result) return { result: first.result }
    const t1 = performance.now()
    const outcome = await program.suspend()
    await running.catch(() => {})
    if (!outcome.state) throw new Error(`suspend failed: ${JSON.stringify(outcome)}`)
    const bytes = ps.toBytes(outcome.state)
    return { stop: first.stop, bytes, suspendMs: performance.now() - t1 }
  }

  /** A model-written function runs in its own sandbox: same VM, no globals at all, a short time limit. */
  async function runImplementation(source, args) {
    const runtime = ps.Runtime.make({ limits: { timeoutMs: 1000 }, globals: () => ({ __args: ps.Host.fn(() => args) }) })
    // Newlines around the source, so a trailing `// comment` can't swallow the closing paren.
    return runtime.execute(`const __f = (\n${source}\n);\nreturn await __f(...__args())`)
  }

  /** Drives the run until it finishes or needs someone outside the server. */
  async function drive(env, start, emit) {
    let next = start
    for (let guard = 0; guard < 500; guard++) {
      const r = await step({ ...next, env, emit })
      if (r.result) {
        emit({ type: "done", result: r.result })
        return { done: r.result }
      }
      const { stop, bytes } = r
      if (stop.kind === "checkpoint") {
        env.checkpoints[stop.id] = { key: stop.key, snap: toB64(bytes) }
        emit({ type: "checkpoint", id: stop.id, bytes: bytes.length, ms: r.suspendMs, line: env.tries[stop.id]?.line })
        next = { snap: bytes, resolve: { [stop.key]: { value: null } } }
        continue
      }
      if (stop.kind === "caught" && !env.checkpoints[stop.id]) {
        next = { snap: bytes, resolve: { [stop.key]: { value: null } } }
        continue
      }
      emit({ type: "suspend", kind: stop.kind, bytes: bytes.length, ms: r.suspendMs, line: stop.line ?? env.tries[stop.id]?.catchLine })
      return { pending: stop, bytes }
    }
    throw new Error("too many checkpoints in one request")
  }

  /** The question a pending stop asks, as an ElicitRequest. */
  function elicitation(env, pending) {
    if (pending.kind === "elicit")
      return { method: "elicitation/create", params: { mode: "form", message: pending.message, requestedSchema: pending.schema } }
    const t = env.tries[pending.id]
    return {
      method: "elicitation/create",
      params: {
        mode: "form",
        message:
          `The try block at line ${t.line} threw: ${pending.error?.message}. ` +
          `Accept to rewind to line ${t.line} and run the block again; decline to let the catch at line ${t.catchLine} handle it.`,
        requestedSchema: { type: "object", properties: {} },
      },
    }
  }

  async function respond(env, outcome, emit) {
    if (outcome.done) {
      const r = outcome.done
      return r.ok
        ? { resultType: "complete", content: [{ type: "text", text: JSON.stringify(r.value) }], structuredContent: { value: r.value } }
        : { resultType: "complete", isError: true, content: [{ type: "text", text: `${r.error.kind}: ${r.error.message}` }] }
    }
    const { pending, bytes } = outcome
    env.round = (env.round ?? 0) + 1
    const state = {
      v: 1,
      codeHash: env.codeHash,
      exp: Date.now() + ttlMs,
      round: env.round,
      tries: env.tries,
      missing: env.missing,
      impls: env.impls,
      checkpoints: env.checkpoints,
      pending,
      snap: toB64(bytes),
    }
    const requestState = await box.seal(state)
    emit({ type: "seal", bytes: requestState.length, snapshot: bytes.length, checkpoints: Object.keys(env.checkpoints).length })

    if (responder === "client") {
      const id = `${pending.kind === "elicit" ? "ask" : "rewind"}_${callIndex(pending.key)}`
      env.inputKey = id
      return { resultType: "input_required", inputRequests: { [id]: elicitation(env, pending) }, requestState }
    }
    return handback(pending, env, requestState)
  }

  /** responder "model": the wait becomes a tool result the calling model reads and answers with `resume`. */
  function handback(pending, env, token) {
    let text, ask
    if (pending.kind === "elicit") {
      text = `The program paused at line ${pending.line}: elicit(${JSON.stringify(pending.message)}). Answer it yourself by calling resume with the token and a value matching the schema.`
      ask = { kind: "elicit", line: pending.line, message: pending.message, schema: pending.schema }
    } else if (pending.kind === "missing") {
      text =
        `The program called ${pending.name}(${pending.args.map((a) => JSON.stringify(a)).join(", ")}) at line ${pending.line}, ` +
        `but ${pending.name} doesn't exist. Call resume with the token and either a value to return from this call, ` +
        `or an implementation (a JavaScript function expression) to use for this and every later call.`
      ask = { kind: "missing", line: pending.line, name: pending.name, args: pending.args }
    } else {
      const t = env.tries[pending.id]
      text = `The try block at line ${t.line} threw: ${pending.error?.message}. Call resume with action "accept" to rewind to line ${t.line} and run it again, or "decline" to let the catch handle it.`
      ask = { kind: "rewind", line: t.line, error: pending.error }
    }
    return {
      resultType: "complete",
      content: [{ type: "text", text }],
      structuredContent: { status: "paused", ...ask, token },
    }
  }

  async function openState(token, codeHash) {
    const state = await box.open(token)
    if (state.v !== 1) throw new StateError("requestState is from another version")
    if (Date.now() > state.exp) throw new StateError("requestState has expired")
    if (codeHash !== undefined && state.codeHash !== codeHash)
      throw new StateError("requestState belongs to a different tools/call (the code changed)")
    return state
  }

  /** Answers to the pending stop, as the `resolve` map for step(). */
  async function resolution(state, answer, emit) {
    const p = state.pending
    const env = state
    if (p.kind === "elicit") {
      // From the model, a bare `value` is the answer.
      if (answer.action === undefined && answer.value !== undefined) answer = { action: "accept", content: answer.value }
      if (answer.action === "accept") return { snap: fromB64(state.snap), resolve: { [p.key]: { value: answer.content ?? {} } } }
      const verb = answer.action === "decline" ? "declined" : "cancelled"
      return { snap: fromB64(state.snap), resolve: { [p.key]: { throw: `elicitation ${verb}: ${p.message}` } } }
    }
    if (p.kind === "caught") {
      if (answer.action === "accept") {
        const cp = env.checkpoints[p.id]
        emit({ type: "rewind", id: p.id, line: env.tries[p.id].line, bytes: fromB64(cp.snap).length })
        return { snap: fromB64(cp.snap), resolve: { [cp.key]: { value: null } } }
      }
      return { snap: fromB64(state.snap), resolve: { [p.key]: { value: null } } }
    }
    if (p.kind === "missing") {
      if (answer.implementation !== undefined) {
        env.impls = { ...env.impls, [p.name]: String(answer.implementation) }
        const r = await runImplementation(answer.implementation, p.args)
        emit({ type: "impl", name: p.name, args: p.args, value: r.ok ? r.value : undefined, error: r.ok ? undefined : r.error.message })
        return { snap: fromB64(state.snap), resolve: { [p.key]: r.ok ? { value: r.value } : { throw: r.error.message } } }
      }
      return { snap: fromB64(state.snap), resolve: { [p.key]: { value: answer.value ?? null } } }
    }
    throw new StateError(`unknown pending kind ${p.kind}`)
  }

  async function callRun(params, emit) {
    const code = String(params.arguments?.code ?? "")
    const codeHash = await sha256(code)
    if (!params.requestState) {
      const parsed = rewrite(ps.parse, code, { known, parks: parkNames })
      emit({ type: "rewrite", code: parsed.code, tries: parsed.tries, missing: parsed.missing })
      const env = {
        codeHash,
        tries: parsed.tries,
        missing: responder === "model" ? parsed.missing : [],
        impls: {},
        checkpoints: {},
      }
      return respond(env, await drive(env, { code: parsed.code }, emit), emit)
    }
    const state = await openState(params.requestState, codeHash)
    emit({ type: "open", bytes: params.requestState.length, round: state.round })
    const inputKey = `${state.pending.kind === "elicit" ? "ask" : "rewind"}_${callIndex(state.pending.key)}`
    const answer = params.inputResponses?.[inputKey]
    if (!answer) {
      // MRTR: if the client didn't answer, ask again rather than fail.
      return { resultType: "input_required", inputRequests: { [inputKey]: elicitation(state, state.pending) }, requestState: params.requestState }
    }
    const next = await resolution(state, answer, emit)
    return respond(state, await drive(state, next, emit), emit)
  }

  async function callResume(params, emit) {
    const args = params.arguments ?? {}
    const state = await openState(args.token)
    emit({ type: "open", bytes: String(args.token).length, round: state.round })
    const next = await resolution(state, args, emit)
    return respond(state, await drive(state, next, emit), emit)
  }

  const toolList = () => {
    const list = [
      {
        name: "run",
        description:
          "Run a JavaScript program. Host functions: elicit(message, fields), " + Object.keys(tools).join(", ") + ".",
        inputSchema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
      },
    ]
    if (responder === "model")
      list.push({
        name: "resume",
        description: "Continue a paused program with the token from its last result.",
        inputSchema: {
          type: "object",
          properties: {
            token: { type: "string" },
            value: {},
            implementation: { type: "string" },
            action: { enum: ["accept", "decline"] },
          },
          required: ["token"],
        },
      })
    return list
  }

  /** Handles one JSON-RPC request. `onEvent` sees what happened inside (not part of the protocol). */
  async function handle(request, { onEvent = () => {} } = {}) {
    const emit = (e) => onEvent({ t: performance.now(), ...e })
    const reply = (result) => ({ jsonrpc: "2.0", id: request.id, result })
    const fail = (code, message) => ({ jsonrpc: "2.0", id: request.id, error: { code, message } })
    try {
      if (request.method === "tools/list") return reply({ resultType: "complete", tools: toolList() })
      if (request.method !== "tools/call") return fail(-32601, `Method not found: ${request.method}`)
      const { name } = request.params ?? {}
      if (name === "run") return reply(await callRun(request.params, emit))
      if (name === "resume" && responder === "model") return reply(await callResume(request.params, emit))
      return fail(-32602, `Unknown tool: ${name}`)
    } catch (error) {
      if (error instanceof StateError) return fail(-32602, error.message)
      if (error?.name === "SyntaxError" || /Unexpected|SyntaxError/.test(error?.message ?? ""))
        return reply({ resultType: "complete", isError: true, content: [{ type: "text", text: `SyntaxError: ${error.message}` }] })
      return fail(-32603, String(error?.message ?? error))
    }
  }

  return { handle, tools: toolList }
}
