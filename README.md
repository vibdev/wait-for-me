# Wait for me

Live: https://vibdev.github.io/wait-for-me/

A static page (GitHub Pages-ready, everything in `site/`) showing psychoscript suspend/resume behind MCP's
multi round-trip requests (SEP-2322): MRTR elicitation, rewind-on-catch, and handing a paused run back to the model.

Setup (tests and the bundle need psychoscript's source next to the site):

```sh
git clone https://github.com/anomalyco/psychoscript vendor/psychoscript
git -C vendor/psychoscript checkout bf492e1
git -C vendor/psychoscript apply ../../build/psychoscript-safari-bigint.patch
(cd vendor/psychoscript && bun install) && (cd tools && bun install)
```

```sh
bun test test/flows.test.js                 # end-to-end flows against psychoscript source
PS=bundle bun test test/flows.test.js       # same flows against the browser bundle
bun test/browserish.js                      # bundle with setImmediate/Buffer deleted
bun serve.ts                                # http://localhost:4321
cd tools && bun browser-check.mjs           # click through every demo in Chrome (BROWSER=webkit, URL=<live url>)
```

Rebuild the browser bundle after updating `vendor/psychoscript`:

```sh
cd vendor/psychoscript && bun install && \
  bun build ../../build/vendor-entry.ts --target=browser --format=esm --minify --outfile ../../site/vendor/psychoscript.js
```

- `site/lib/server.js`: stateless MCP server (`tools/call run`, plus `resume` in model mode)
- `site/lib/rewrite.js`: acorn rewrite that adds try checkpoints, catch hooks, and stubs for undefined functions
- `site/lib/seal.js`: requestState = gzip + base64url + HMAC-SHA256, TTL, bound to a hash of the code
- `site/lib/demo.js`: the client UI; a new server object handles each request
- `spike/`: the first throwaway experiments

## Local patch to psychoscript (Safari)

`vendor/psychoscript` carries `build/psychoscript-safari-bigint.patch`. Upstream builds `1n << 2^20` (a 2^20+1-bit BigInt)
at module load in `src/runtime/limits.ts`; Safari's JavaScriptCore caps BigInts at 2^20 bits and throws
`RangeError: Out of memory: BigInt generated from this operation is too big`, so nothing loads. The patch checks the
bound with shifts instead. Apply it after updating the vendored copy (`git -C vendor/psychoscript apply ../../build/psychoscript-safari-bigint.patch`)
until it's fixed upstream. `BROWSER=webkit bun tools/browser-check.mjs` runs the page in Safari's engine.
