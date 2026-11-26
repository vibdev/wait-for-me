// End-to-end checks of the page's server against the real VM. Each tools/call goes to a brand-new server instance,
// so nothing survives between requests except what's in requestState.
// Run with PS=bundle to test the browser bundle instead of psychoscript's source.
import { describe, expect, test } from "bun:test"
import { createServer } from "../site/lib/server.js"
import * as S from "../site/lib/scenarios.js"

const ps =
  process.env.PS === "bundle"
    ? await import("../site/vendor/psychoscript.js")
    : await (async () => {
        const src = await import("../vendor/psychoscript/src/index.ts")
        const { parse } = await import("../vendor/psychoscript/node_modules/acorn/dist/acorn.mjs")
        return { ...src, parse }
      })()

let id = 0
function fresh(scenario, responder = "client") {
  // A new server per request: stateless. Tools keep their own side-effect log across requests, like a real backend.
  const tools = scenario.tools()
  return (req, events = []) =>
    createServer(ps, { secret: S.SECRET, responder, tools }).handle({ jsonrpc: "2.0", id: ++id, ...req }, { onEvent: (e) => events.push(e) })
}
const call = (code, extra = {}) => ({ method: "tools/call", params: { name: "run", arguments: { code }, ...extra } })

describe("MRTR elicitation", () => {
  test("two questions, three requests, then a booking", async () => {
    const send = fresh(S.mrtr)
    let r = (await send(call(S.mrtr.code))).result
    expect(r.resultType).toBe("input_required")
    const [k1] = Object.keys(r.inputRequests)
    expect(r.inputRequests[k1].params.requestedSchema.properties.name.type).toBe("string")
    r = (await send(call(S.mrtr.code, { requestState: r.requestState, inputResponses: { [k1]: { action: "accept", content: { name: "Ada" } } } }))).result
    const [k2] = Object.keys(r.inputRequests)
    expect(r.inputRequests[k2].params.message).toBe("How many guests, Ada?")
    r = (await send(call(S.mrtr.code, { requestState: r.requestState, inputResponses: { [k2]: { action: "accept", content: { guests: 4 } } } }))).result
    expect(r.resultType).toBe("complete")
    expect(r.structuredContent.value).toEqual({ confirmation: "TBL-ADA4", time: "19:15" })
  })

  test("a missing answer re-asks instead of failing", async () => {
    const send = fresh(S.mrtr)
    const r1 = (await send(call(S.mrtr.code))).result
    const r2 = (await send(call(S.mrtr.code, { requestState: r1.requestState }))).result
    expect(r2.resultType).toBe("input_required")
    expect(Object.keys(r2.inputRequests)).toEqual(Object.keys(r1.inputRequests))
  })

  test("tampered or mismatched state is rejected", async () => {
    const send = fresh(S.mrtr)
    const r1 = (await send(call(S.mrtr.code))).result
    const bad = r1.requestState.slice(0, 20) + (r1.requestState[20] === "A" ? "B" : "A") + r1.requestState.slice(21)
    expect((await send(call(S.mrtr.code, { requestState: bad }))).error.message).toMatch(/verification/)
    expect((await send(call(S.mrtr.code + " ", { requestState: r1.requestState }))).error.message).toMatch(/different/)
  })

  test("declining an elicitation throws inside the program", async () => {
    const send = fresh(S.mrtr)
    const r1 = (await send(call(S.mrtr.code))).result
    const [k] = Object.keys(r1.inputRequests)
    const r2 = (await send(call(S.mrtr.code, { requestState: r1.requestState, inputResponses: { [k]: { action: "decline" } } }))).result
    expect(r2.isError).toBe(true)
    expect(r2.content[0].text).toMatch(/declined/)
  })
})

describe("error rewind", () => {
  async function toCatch(send) {
    let r = (await send(call(S.rewind.code))).result
    const [k] = Object.keys(r.inputRequests)
    const events = []
    r = (await send(call(S.rewind.code, { requestState: r.requestState, inputResponses: { [k]: { action: "accept", content: { amount: 250 } } } }), events)).result
    return { r, events }
  }

  test("a caught error rewinds to the try, which asks again", async () => {
    const send = fresh(S.rewind)
    const { r, events } = await toCatch(send)
    expect(events.find((e) => e.type === "host" && e.name === "charge").error).toMatch(/limit/)
    const [k] = Object.keys(r.inputRequests)
    expect(k).toStartWith("rewind_")
    expect(r.inputRequests[k].params.message).toMatch(/line 3 threw: card limit/)
    const ev = []
    const r2 = (await send(call(S.rewind.code, { requestState: r.requestState, inputResponses: { [k]: { action: "accept" } } }), ev)).result
    expect(ev.some((e) => e.type === "rewind" && e.line === 3)).toBe(true)
    const [k2] = Object.keys(r2.inputRequests)
    expect(r2.inputRequests[k2].params.message).toMatch(/How much on the card/)
    const r3 = (await send(call(S.rewind.code, { requestState: r2.requestState, inputResponses: { [k2]: { action: "accept", content: { amount: 84 } } } }))).result
    expect(r3.structuredContent.value).toEqual({ ok: true, receipt: { charged: 84, id: "ch_8400" } })
  })

  test("declining the rewind lets the catch run", async () => {
    const send = fresh(S.rewind)
    const { r } = await toCatch(send)
    const [k] = Object.keys(r.inputRequests)
    const r2 = (await send(call(S.rewind.code, { requestState: r.requestState, inputResponses: { [k]: { action: "decline" } } }))).result
    expect(r2.structuredContent.value).toEqual({ ok: false, reason: "card limit is $100, asked for $250" })
  })

  test("catch without a binding, nested in an async function", async () => {
    const code = `async function go() { try { await charge(500) } catch { return "caught" } }\nreturn await go()`
    const send = fresh(S.rewind)
    const r = (await send(call(code))).result
    const [k] = Object.keys(r.inputRequests)
    expect(k).toStartWith("rewind_")
    const r2 = (await send(call(code, { requestState: r.requestState, inputResponses: { [k]: { action: "decline" } } }))).result
    expect(r2.structuredContent.value).toBe("caught")
  })
})

describe("hand back to the model", () => {
  const resume = (args) => ({ method: "tools/call", params: { name: "resume", arguments: args } })

  test("an elicitation becomes a tool result the model answers", async () => {
    const send = fresh(S.handback, "model")
    const r = (await send(call(S.handback.code))).result
    expect(r.resultType).toBe("complete")
    expect(r.structuredContent).toMatchObject({ status: "paused", kind: "elicit", line: 2 })
    expect(r.structuredContent.schema.properties.pick.enum).toEqual(["PS-12", "PS-31", "PS-40"])
    const r2 = (await send(resume({ token: r.structuredContent.token, value: S.handback.modelAnswer }))).result
    expect(r2.structuredContent.value).toEqual({ assigned: "PS-12", to: "me" })
  })

  test("a missing function is written by the model once, then reused", async () => {
    const send = fresh(S.missing, "model")
    let r = (await send(call(S.missing.code))).result
    expect(r.structuredContent).toMatchObject({ kind: "missing", name: "slugify", args: ["Pause anywhere!"], line: 4 })
    r = (await send(resume({ token: r.structuredContent.token, ...S.missing.modelAnswers.slugify }))).result
    expect(r.structuredContent).toMatchObject({ kind: "missing", name: "readingTime", args: [900] })
    const events = []
    r = (await send(resume({ token: r.structuredContent.token, ...S.missing.modelAnswers.readingTime }), events)).result
    expect(r.structuredContent.value).toEqual([
      { slug: "pause-anywhere", minutes: 4 },
      { slug: "a-pause-is-a-value", minutes: 6 },
      { slug: "teleporting-a-running-program", minutes: 1 },
    ])
    expect(events.filter((e) => e.type === "impl").length).toBe(5) // 1 for this resume + 4 reused calls
  })

  test("a plain value answers just that call", async () => {
    const send = fresh(S.missing, "model")
    const r = (await send(call(S.missing.code))).result
    const r2 = (await send(resume({ token: r.structuredContent.token, value: "first-post" }))).result
    expect(r2.structuredContent).toMatchObject({ kind: "missing", name: "readingTime" })
    const r3 = (await send(resume({ token: r2.structuredContent.token, value: 4 }))).result
    expect(r3.structuredContent).toMatchObject({ kind: "missing", name: "slugify", args: ["A Pause Is a Value"] })
  })
})

describe("the page's programs", () => {
  // Answers each elicitation with `answer(request, round)` until the run completes.
  async function play(scenario, answer, { maxRounds = 30 } = {}) {
    const send = fresh(scenario)
    const sizes = []
    let r = (await send(call(scenario.code))).result
    for (let round = 0; r.resultType === "input_required"; round++) {
      if (round > maxRounds) throw new Error("too many rounds")
      const [k, req] = Object.entries(r.inputRequests)[0]
      sizes.push(r.requestState.length)
      r = (await send(call(scenario.code, { requestState: r.requestState, inputResponses: { [k]: answer(req, round, k) } }))).result
    }
    return { r, sizes }
  }

  test("ouija: a loop spells MRTR one round trip at a time", async () => {
    const letters = ["m", "R", "t", "R", "goodbye"]
    const { r } = await play(S.ouija, (req, round) => ({ action: "accept", content: { letter: letters[round] } }))
    expect(r.structuredContent.value.spirit).toBe("MRTR") // the reading is copy; only the spelling is checked
    expect(typeof r.structuredContent.value.reading).toBe("string")
  })

  test("tarot: rewinding redraws, so you can always escape Death", async () => {
    const { r } = await play(S.tarot, () => ({ action: "accept" }), { maxRounds: 200 })
    expect(r.structuredContent.value).toHaveLength(3)
    for (const line of r.structuredContent.value) expect(line).not.toMatch(/Death/)
  })

  test("tarot: declining the rewind lets the catch record Death", async () => {
    for (let i = 0; i < 50; i++) {
      const { r } = await play(S.tarot, () => ({ action: "decline" }))
      if (r.structuredContent.value.some((l) => l.includes("Death"))) return
    }
    throw new Error("never drew Death in 50 spreads")
  })

  test("alice: written once, reused 365 times, riddle answered with a value", async () => {
    const send = fresh(S.alice, "model")
    const resume = (args) => ({ method: "tools/call", params: { name: "resume", arguments: args } })
    let r = (await send(call(S.alice.code))).result
    const asked = []
    while (r.structuredContent?.status === "paused") {
      asked.push(r.structuredContent.name)
      r = (await send(resume({ token: r.structuredContent.token, ...S.alice.modelAnswers[r.structuredContent.name] }))).result
    }
    expect(asked).toEqual(["potion", "isUnbirthday", "whyIsARavenLikeAWritingDesk"])
    expect(r.structuredContent.value).toEqual({
      height: 45.8,
      unbirthdays: 364,
      riddle: S.alice.modelAnswers.whyIsARavenLikeAWritingDesk.value,
    })
  })
})
