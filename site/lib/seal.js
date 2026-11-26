// requestState is attacker-controlled input (MRTR spec), and ours carries a whole running program, so it's sealed:
// JSON -> gzip -> base64url, then an HMAC-SHA256 over that. Works the same in browsers and Bun.

const enc = new TextEncoder()
const dec = new TextDecoder()

export function toB64(bytes) {
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
export function fromB64(text) {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())
}
export const gzip = (bytes) => pipe(bytes, new CompressionStream("gzip"))
export const gunzip = (bytes) => pipe(bytes, new DecompressionStream("gzip"))

export async function sha256(text) {
  return toB64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text))))
}

export class StateError extends Error {}

export function sealer(secret) {
  const key = crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ])
  return {
    async seal(payload) {
      const body = toB64(await gzip(enc.encode(JSON.stringify(payload))))
      const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await key, enc.encode(body)))
      return `${body}.${toB64(mac)}`
    },
    async open(token) {
      const [body, mac] = String(token).split(".")
      if (!body || !mac) throw new StateError("requestState is malformed")
      const ok = await crypto.subtle.verify("HMAC", await key, fromB64(mac), enc.encode(body)).catch(() => false)
      if (!ok) throw new StateError("requestState failed verification (was it edited?)")
      return JSON.parse(dec.decode(await gunzip(fromB64(body))))
    },
  }
}
