// Browser bundle of psychoscript for the page. The driver yields with setImmediate, which browsers lack.
if (typeof (globalThis as any).setImmediate !== "function") {
  const channel = new MessageChannel()
  const queue: Array<() => void> = []
  channel.port1.onmessage = () => queue.shift()?.()
  ;(globalThis as any).setImmediate = (f: () => void) => { queue.push(f); channel.port2.postMessage(0) }
}
export { Host, Runtime, toBytes, fromBytes, globalNames } from "../vendor/psychoscript/src/index.ts"
export { parse } from "../vendor/psychoscript/node_modules/acorn/dist/acorn.mjs"
