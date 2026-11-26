// Runs the rewind flow on the browser bundle with Node-only globals removed.
delete globalThis.setImmediate; delete globalThis.Buffer; delete globalThis.require
const ps = await import("../site/vendor/psychoscript.js")
const { createServer } = await import("../site/lib/server.js")
const S = await import("../site/lib/scenarios.js")
const tools = S.rewind.tools()
const send = (p) => createServer(ps, { secret: S.SECRET, tools }).handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "run", arguments: { code: S.rewind.code }, ...p } })
let r = (await send({})).result
for (const answer of [{ action: "accept", content: { amount: 250 } }, { action: "accept" }, { action: "accept", content: { amount: 84 } }]) {
  const [k] = Object.keys(r.inputRequests); console.log(k, "state", r.requestState.length, "chars")
  r = (await send({ requestState: r.requestState, inputResponses: { [k]: answer } })).result
}
console.log(typeof globalThis.setImmediate, JSON.stringify(r.structuredContent))
process.exit(0) // the shim's MessageChannel keeps Bun's loop alive; browsers don't care
