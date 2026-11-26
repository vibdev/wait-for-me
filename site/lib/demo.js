// The page's demos. Each one is an MCP client talking to a stateless server (lib/server.js) running the real
// psychoscript VM. Every request goes to a brand-new server object; only the messages carry anything across.

import * as ps from "../vendor/psychoscript.js"
import { createServer } from "./server.js"
import * as S from "./scenarios.js"

// Each demo has one or more variants (programs) to switch between. A variant brings its code, tools, and the
// answers the page suggests: `suggest` prefills the person's form, `modelAnswers` scripts the model.
const DEMOS = {
  mrtr: {
    title: "Ask the client",
    sub: "MRTR elicitation",
    responder: "client",
    variants: [S.ouija],
  },
  rewind: {
    title: "Rewind on catch",
    sub: "try/catch checkpoints",
    responder: "client",
    variants: [S.tarot],
  },
  missing: {
    title: "Down the rabbit hole",
    sub: "the model writes what's missing",
    responder: "model",
    variants: [S.alice],
  },
}

/** What the scripted model sends back for a paused run. */
const modelReply = (paused, v) =>
  paused.kind === "missing"
    ? v.modelAnswers?.[paused.name] ?? { value: null }
    : paused.kind === "elicit"
      ? { value: v.modelAnswers?.elicit ?? {} }
      : { action: "decline" }

const DELAY = 380
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fmt = (n) => n.toLocaleString("en-US")
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    if (k === "class") el.className = v
    else if (k === "html") el.innerHTML = v
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? "" : v)
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid)
  return el
}

/** JSON for display: long strings (requestState, tokens, code) are shortened. */
function pretty(value) {
  return JSON.stringify(
    value,
    (_, v) => (typeof v === "string" && v.length > 90 ? `${v.slice(0, 40)}…${v.slice(-12)} (${fmt(v.length)} chars)` : v),
    2,
  )
}

// --- the listing ---

const KEYWORDS = new Set(
  "const let var await async return try catch finally for of in if else function new throw while break continue".split(" "),
)
function highlightLine(line, hosts) {
  let out = ""
  const re = /(\/\/.*$)|("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([\s\S])/g
  for (const m of line.matchAll(re)) {
    const [t, c, s, n, w] = m
    if (c) out += `<span class="tok-c">${esc(t)}</span>`
    else if (s) out += `<span class="tok-s">${esc(t)}</span>`
    else if (n) out += `<span class="tok-n">${esc(t)}</span>`
    else if (w && KEYWORDS.has(w)) out += `<span class="tok-k">${t}</span>`
    else if (w && hosts.has(w)) out += `<span class="tok-h">${t}</span>`
    else out += esc(t)
  }
  return out
}

// --- art ---

const serverFace = () =>
  h("span", {
    class: "server-face",
    html: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M20 50 v8 M44 50 v8" stroke="#ee5a8f" stroke-width="6" stroke-linecap="round"/>
      <path d="M20 52 v2 M44 52 v2" stroke="#1fa7a0" stroke-width="6"/>
      <rect x="8" y="10" width="48" height="42" rx="7" fill="#fffaf0" stroke="#1d1614" stroke-width="3"/>
      <rect x="14" y="16" width="36" height="26" rx="5" fill="#1d1614"/>
      <g class="eyes-shut" stroke="#6cc7b6" stroke-width="2.5" stroke-linecap="round" fill="none"><path d="M21 28 q4 3 8 0 M35 28 q4 3 8 0"/><path d="M29 36 h6"/></g>
      <g class="eyes-open" fill="none" stroke="#6cc7b6" stroke-width="2.5"><circle cx="25" cy="27" r="4"/><circle cx="39" cy="27" r="4"/><circle cx="25" cy="27" r="1" fill="#6cc7b6"/><circle cx="39" cy="27" r="1" fill="#6cc7b6"/><ellipse cx="32" cy="36" rx="2.5" ry="2.5"/></g>
      <path d="M26 10 l-5 -7 M38 10 l5 -7" stroke="#1d1614" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="21" cy="3" r="2.5" fill="#f9bb2d" stroke="#1d1614" stroke-width="1.5"/><circle cx="43" cy="3" r="2.5" fill="#ee5a8f" stroke="#1d1614" stroke-width="1.5"/>
    </svg>`,
  })
// The person on the client side. When they let Death stand (decline a rewind), they get `is-doomed`: pale, X eyes,
// a shudder, and a small ghost leaving the top of their head. Reset brings them back.
const personFace = () =>
  h("span", {
    class: "person",
    html: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M12 60 q0 -18 20 -18 q20 0 20 18" fill="#1fa7a0" stroke="#1d1614" stroke-width="3"/>
      <circle class="person__skin" cx="32" cy="26" r="14" fill="#f6e3bd" stroke="#1d1614" stroke-width="3"/>
      <g class="person__fine">
        <path d="M26 25 v2 M38 25 v2" stroke="#1d1614" stroke-width="3" stroke-linecap="round"/>
        <path d="M27 32 q5 4 10 0" stroke="#1d1614" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      </g>
      <g class="person__doomed" stroke="#1d1614" stroke-linecap="round" fill="none">
        <path d="M23.5 23.5 l5 5 M28.5 23.5 l-5 5 M35.5 23.5 l5 5 M40.5 23.5 l-5 5" stroke-width="2.5"/>
        <path d="M26 34 q1.5 -2 3 0 t3 0 t3 0 t3 0" stroke-width="2.2"/>
        <path d="M44 17 q2 4 0 6 q-2 -2 0 -6 z" fill="#6cc7b6" stroke-width="1.2"/>
      </g>
      <path d="M18 22 q4 -14 16 -10 q10 -2 12 10" fill="#7b3fa6" stroke="#1d1614" stroke-width="3" stroke-linejoin="round"/>
      <g class="person__ghost">
        <path d="M26 14 q0 -12 6 -12 q6 0 6 12 l-2 -2 -2 2 -2 -2 -2 2 -2 -2 z" fill="#fffaf0" stroke="#1d1614" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="30" cy="6" r="1.2" fill="#1d1614"/><circle cx="34" cy="6" r="1.2" fill="#1d1614"/>
        <ellipse cx="32" cy="10" rx="1.3" ry="1.6" fill="#1d1614"/>
      </g>
    </svg>`,
  })
const sunFace = () => h("img", { src: "art/sun.svg", alt: "", width: 54, height: 54 })

// --- one demo ---

export function mount(root, name) {
  const cfg = DEMOS[name]
  if (!cfg) return
  let v = cfg.variants[0]
  let code = v.code
  let tools = v.tools()
  let rpc = 0
  let run = 0 // bumps on reset so stale async work stops touching the DOM
  let asked = 0
  let flags = new Map() // line -> label
  let lastTries = []
  const hosts = () => new Set(["elicit", ...Object.keys(tools)])

  // bar
  const status = h("span", { class: "chip" }, "idle")
  const reqChip = h("span", { class: "chip" }, "0 requests")
  const stateChip = h("span", { class: "chip", hidden: true })
  const runBtn = h("button", { class: "btn", type: "button", onclick: () => start() }, "Run ▸")
  const resetBtn = h("button", { class: "btn btn--ghost", type: "button", onclick: () => reset() }, "Reset")
  // Variant switcher, when there's more than one program to try.
  const tabs =
    cfg.variants.length > 1
      ? h(
          "span",
          { class: "tabs", role: "group", "aria-label": "program" },
          cfg.variants.map((variant, i) =>
            h(
              "button",
              {
                class: "tab",
                type: "button",
                "aria-pressed": String(i === 0),
                onclick: (ev) => {
                  if (variant === v) return
                  v = variant
                  code = v.code
                  for (const t of ev.currentTarget.parentElement.children) t.setAttribute("aria-pressed", String(t === ev.currentTarget))
                  blurb.textContent = v.blurb ?? ""
                  if (!editor.hidden) toggleEdit()
                  else reset()
                },
              },
              variant.label,
            ),
          ),
        )
      : null
  const blurb = h("p", { class: "demo__blurb" }, v.blurb ?? "")
  const bar = h(
    "div",
    { class: "demo__bar" },
    h("span", { class: "demo__title" }, cfg.title, h("small", {}, cfg.sub)),
    tabs,
    status,
    reqChip,
    stateChip,
    runBtn,
    resetBtn,
  )

  // code
  const listing = h("pre", { class: "listing", "aria-label": "program" })
  const editor = h("textarea", { class: "editor", spellcheck: "false", hidden: true, "aria-label": "edit program" })
  const editBtn = h("button", { class: "btn btn--ghost", type: "button", onclick: () => toggleEdit() }, "Edit")
  const codebar = h(
    "div",
    { class: "demo__codebar" },
    editBtn,
    h("span", {}, cfg.responder === "client" ? "The program the model sent to run." : "The model's program. It can call things that don't exist."),
  )
  const codeCol = h("div", { class: "demo__code" }, listing, editor, codebar)

  // wire
  const face = serverFace()
  const person = cfg.responder === "model" ? sunFace() : personFace()
  let doomNext = false // the next response is the catch running after a declined rewind
  const packet = h("span", { class: "packet", "aria-hidden": "true" })
  const actors = h(
    "div",
    { class: "actors" },
    h("span", { class: "actor" }, person, cfg.responder === "model" ? "Model" : h("span", {}, "Client + ", h("span", { class: "person__you" }, "you"))),
    packet,
    h("span", { class: "actor" }, face, "Server"),
  )
  const messages = h("ol", { class: "messages", "aria-live": "polite" })
  const turn = h("div", { class: "turn", hidden: true })
  const result = h("div", { class: "result", hidden: true })
  const wire = h("div", { class: "demo__wire" }, actors, messages, turn, result)

  // log
  const logList = h("ol")
  const log = h("details", { class: "log", open: true }, h("summary", {}, "Inside the server"), logList)

  root.append(bar, blurb, h("div", { class: "demo__body" }, codeCol, wire), log)
  renderListing()

  function renderListing(marks = {}) {
    const hs = hosts()
    listing.innerHTML = ""
    code.split("\n").forEach((line, i) => {
      const n = i + 1
      const ln = h("span", { class: "ln", html: highlightLine(line, hs) || " " })
      if (marks.tryLines?.has(n)) ln.classList.add("is-try")
      if (marks.caught === n) ln.classList.add("is-caught")
      if (marks.paused === n) ln.classList.add("is-paused")
      if (flags.has(n)) ln.append(h("span", { class: "flag" }, flags.get(n)))
      listing.append(ln)
    })
  }

  function toggleEdit() {
    if (editor.hidden) {
      editor.value = code
      editor.hidden = false
      listing.hidden = true
      editBtn.textContent = "Done"
    } else {
      code = editor.value
      editor.hidden = true
      listing.hidden = false
      editBtn.textContent = "Edit"
      reset()
    }
  }

  function setStatus(text, kind) {
    status.textContent = text
    status.className = "chip" + (kind ? ` chip--${kind}` : "")
  }

  function reset() {
    doomNext = false
    person.classList.remove("is-doomed")
    run++
    tools = v.tools()
    rpc = 0
    asked = 0
    flags = new Map()
    lastTries = []
    messages.innerHTML = ""
    logList.innerHTML = ""
    turn.hidden = true
    result.hidden = true
    stateChip.hidden = true
    reqChip.textContent = "0 requests"
    runBtn.disabled = false
    face.classList.remove("is-awake")
    setStatus("idle")
    renderListing()
  }

  async function start() {
    if (!editor.hidden) toggleEdit()
    reset()
    runBtn.disabled = true
    await exchange({ method: "tools/call", params: { name: "run", arguments: { code } } })
  }

  function logLine(kind, text, cls = "") {
    logList.append(h("li", {}, h("span", { class: `k ${cls}` }, kind), h("span", { class: "v" }, text)))
    logList.scrollTop = 1e9
  }

  const short = (v) => {
    const s = JSON.stringify(v)
    return s === undefined ? "undefined" : s.length > 60 ? s.slice(0, 57) + "…" : s
  }

  // A model-written function called many times in a row gets one log line with a count, not hundreds.
  let lastImpl
  function repeatImpl(e) {
    const li = logList.lastElementChild
    if (lastImpl && lastImpl.name === e.name && !e.error && li === lastImpl.li) {
      lastImpl.n++
      li.lastElementChild.textContent = `${e.name}(${e.args.map(short).join(", ")}) → ${short(e.value)}   ×${lastImpl.n}`
      return true
    }
    return false
  }

  function onEvent(e) {
    switch (e.type) {
      case "rewrite":
        lastTries = e.tries
        logLine(
          "rewrite",
          [
            e.tries.length ? `${e.tries.length} try block${e.tries.length > 1 ? "s" : ""} get checkpoints` : "no try blocks",
            e.missing.length ? `undefined: ${e.missing.join(", ")}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        )
        break
      case "host":
        logLine("host call", `${e.name}(${e.args.map(short).join(", ")}) → ${e.error ? "threw: " + e.error : short(e.value)}`, e.error ? "k--err" : "")
        break
      case "impl":
        if (repeatImpl(e)) break
        logLine("model code", `${e.name}(${e.args.map(short).join(", ")}) → ${e.error ? "threw: " + e.error : short(e.value)}`, e.error ? "k--err" : "")
        lastImpl = e.error ? undefined : { name: e.name, n: 1, li: logList.lastElementChild }
        break
      case "checkpoint":
        flags.set(e.line, `⚑ checkpoint ${fmt(e.bytes)} B`)
        logLine("checkpoint", `before the try at line ${e.line} · ${fmt(e.bytes)} B · ${e.ms.toFixed(1)} ms`, "k--snap")
        break
      case "suspend":
        logLine("suspend", `${e.kind === "caught" ? "catch reached" : "waiting"} at line ${e.line} · ${fmt(e.bytes)} B snapshot · ${e.ms.toFixed(1)} ms`, "k--snap")
        break
      case "seal":
        logLine("seal", `requestState: gzip + HMAC → ${fmt(e.bytes)} chars${e.checkpoints ? ` (holds ${e.checkpoints} checkpoint${e.checkpoints > 1 ? "s" : ""} too)` : ""}`, "k--snap")
        break
      case "open":
        logLine("verify", `signature ok, not expired, same call · round ${e.round}`)
        break
      case "resume":
        logLine("resume", `from ${fmt(e.bytes)} B · ${e.ms.toFixed(1)} ms`, "k--snap")
        break
      case "rewind":
        flags.set(e.line, "↺ rewound here")
        logLine("rewind", `back to the checkpoint before line ${e.line}`, "k--snap")
        break
      case "done":
        logLine("done", e.result.ok ? short(e.result.value) : `${e.result.error.kind}: ${e.result.error.message}`, e.result.ok ? "" : "k--err")
        break
    }
  }

  async function fly(dir) {
    packet.classList.remove("go-right", "go-left")
    void packet.offsetWidth
    packet.classList.add(dir === "right" ? "go-right" : "go-left")
    await sleep(DELAY)
    packet.classList.remove("go-right", "go-left")
  }

  function addMessage(dir, body, label, text, state) {
    const kind = dir === "in" ? (body.error ? "error" : body.result?.resultType === "input_required" ? "input" : body.result?.isError ? "error" : "done") : ""
    const li = h(
      "li",
      { class: `msg msg--${dir}${kind ? ` msg--${kind}` : ""}` },
      h(
        "details",
        {},
        h("summary", {}, h("span", { class: "msg__label" }, label), state ? h("span", { class: "state-chip" }, state) : null, h("span", { class: "msg__text" }, text)),
        h("pre", {}, pretty(body)),
      ),
    )
    messages.append(li)
    messages.scrollTop = 1e9
  }

  async function exchange(req) {
    const mine = run
    const request = { jsonrpc: "2.0", id: ++rpc, ...req }
    const p = request.params
    const isRetry = !!p.requestState
    const outLabel = `→ tools/call ${p.name}`
    const outText =
      p.name === "resume"
        ? Object.keys(p.arguments).filter((k) => k !== "token").map((k) => `${k}: ${short(p.arguments[k])}`).join(", ")
        : isRetry
          ? `retry with ${Object.keys(p.inputResponses ?? {}).join(", ") || "no answers"}`
          : `${code.split("\n").length} lines of code`
    const outState = isRetry ? `state ${fmt(p.requestState.length)}` : p.arguments?.token ? `token ${fmt(p.arguments.token.length)}` : null
    addMessage("out", request, outLabel, outText, outState)
    reqChip.textContent = `${rpc} request${rpc > 1 ? "s" : ""}`
    turn.hidden = true
    setStatus("running", "live")
    await fly("right")
    if (mine !== run) return
    logLine("request", `#${request.id}: a new server instance, knowing nothing`, "k--req")
    face.classList.add("is-awake")
    const events = []
    const server = createServer(ps, { secret: S.SECRET, responder: cfg.responder, tools })
    const response = await server.handle(request, { onEvent: (e) => (events.push(e), onEvent(e)) })
    if (mine !== run) return
    await fly("left")
    face.classList.remove("is-awake")
    if (mine !== run) return
    receive(response, events)
  }

  function marksFrom(events, response) {
    const marks = { tryLines: new Set() }
    const s = events.findLast((e) => e.type === "suspend")
    if (s && s.kind === "caught") {
      const t = lastTries.find((t) => t.catchLine === s.line)
      if (t) for (let l = t.line; l < t.catchLine; l++) marks.tryLines.add(l)
      marks.caught = s.line
    } else if (s) marks.paused = s.line
    if (response.result?.structuredContent?.status === "paused" && response.result.structuredContent.kind !== "rewind")
      marks.paused = response.result.structuredContent.line
    return marks
  }

  function receive(response, events) {
    renderListing(marksFrom(events, response))
    if (doomNext) {
      doomNext = false
      person.classList.add("is-doomed")
    }
    if (response.error) {
      addMessage("in", response, "← error", response.error.message)
      return finish(response.error.message, true)
    }
    const r = response.result
    if (r.resultType === "input_required") {
      const [key, ask] = Object.entries(r.inputRequests)[0]
      stateChip.hidden = false
      stateChip.textContent = `requestState ${fmt(r.requestState.length)} chars`
      addMessage("in", response, "← input_required", ask.params.message, `state ${fmt(r.requestState.length)}`)
      setStatus("waiting for you", "wait")
      return showForm(key, ask, r.requestState)
    }
    if (r.structuredContent?.status === "paused") {
      addMessage("in", response, "← tool result: paused", r.content[0].text, `token ${fmt(r.structuredContent.token.length)}`)
      stateChip.hidden = false
      stateChip.textContent = `token ${fmt(r.structuredContent.token.length)} chars`
      setStatus("waiting for the model", "wait")
      return showModelTurn(r)
    }
    addMessage("in", response, r.isError ? "← result: error" : "← result", r.content[0].text)
    finish(r.isError ? r.content[0].text : JSON.stringify(r.structuredContent.value, null, 2), r.isError)
  }

  function finish(text, isError) {
    result.hidden = false
    result.className = "result" + (isError ? " result--error" : "")
    result.textContent = text
    setStatus(isError ? "error" : "done", isError ? "err" : "live")
    runBtn.disabled = false
    runBtn.textContent = "Run again ▸"
  }

  // The client's side of an elicitation: a form generated from requestedSchema.
  function showForm(key, ask, requestState) {
    const schema = ask.params.requestedSchema ?? { properties: {} }
    const props = Object.entries(schema.properties ?? {})
    const isRewind = key.startsWith("rewind_")
    const fields = props.map(([prop, s]) => {
      const value = v.suggest?.(prop, asked)
      let input
      if (s.enum) input = h("select", { name: prop }, s.enum.map((v) => h("option", { value: v, selected: v === value }, v)))
      else if (s.type === "boolean") input = h("input", { type: "checkbox", name: prop, checked: !!value })
      else input = h("input", { name: prop, type: s.type === "integer" || s.type === "number" ? "number" : "text", step: s.type === "number" ? "any" : undefined, value: value ?? "", required: true })
      const hint = v.hint?.(prop)
      return { prop, s, input, el: h("label", {}, prop, input, hint ? h("span", { class: "turn__hint" }, hint) : null) }
    })
    const read = () => {
      const content = {}
      for (const { prop, s, input } of fields) {
        if (s.type === "boolean") content[prop] = input.checked
        else if (s.type === "integer") content[prop] = Math.trunc(Number(input.value))
        else if (s.type === "number") content[prop] = Number(input.value)
        else content[prop] = input.value
      }
      return content
    }
    const send = (action) => {
      asked++
      if (isRewind && action === "decline") doomNext = true // you let the catch run. consequences.
      const answer = action === "accept" && props.length ? { action, content: read() } : { action }
      exchange({ method: "tools/call", params: { name: "run", arguments: { code }, inputResponses: { [key]: answer }, requestState } })
    }
    const form = h(
      "form",
      { onsubmit: (ev) => (ev.preventDefault(), send("accept")) },
      fields.map((f) => f.el),
      h(
        "div",
        { class: "turn__actions" },
        isRewind
          ? [
              h("button", { class: "btn btn--teal", type: "submit" }, "↺ Rewind & retry"),
              h("button", { class: "btn btn--pink", type: "button", onclick: () => send("decline") }, "Let the catch run"),
            ]
          : [
              h("button", { class: "btn", type: "submit" }, "Accept"),
              h("button", { class: "btn btn--ghost", type: "button", onclick: () => send("decline") }, "Decline"),
            ],
      ),
    )
    turn.replaceChildren(
      h("div", { class: "turn__who" }, isRewind ? "The client asks you: the block threw" : "The client asks you"),
      h("p", { class: "turn__q" }, ask.params.message),
      form,
    )
    turn.hidden = false
    form.querySelector("input,select,button")?.focus({ preventScroll: true })
  }

  // The model's side of a hand-back: it reads the tool result and calls resume.
  function showModelTurn(r) {
    const paused = r.structuredContent
    const area = h("textarea", { spellcheck: "false", "aria-label": "the model's resume arguments" })
    area.value = JSON.stringify(modelReply(paused, v), null, 2)
    const err = h("p", { class: "turn__hint", hidden: true })
    const send = () => {
      let args
      try {
        args = JSON.parse(area.value)
      } catch (e) {
        err.hidden = false
        err.textContent = `Not JSON: ${e.message}`
        return
      }
      exchange({ method: "tools/call", params: { name: "resume", arguments: { token: paused.token, ...args } } })
    }
    turn.replaceChildren(
      h("div", { class: "turn__who" }, "The model reads the result and calls resume"),
      h("p", { class: "turn__hint" }, "Edit if you think you know better."),
      h("label", {}, "resume arguments", area),
      err,
      h("div", { class: "turn__actions" }, h("button", { class: "btn", type: "button", onclick: send }, "Monkey Patch ▸")),
    )
    turn.hidden = false
  }
}
