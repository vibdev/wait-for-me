// Local preview: bun serve.ts, then open http://localhost:4321
const root = new URL("./site/", import.meta.url).pathname
Bun.serve({
  port: Number(process.env.PORT ?? 4321),
  async fetch(req) {
    let path = decodeURIComponent(new URL(req.url).pathname)
    if (path.endsWith("/")) path += "index.html"
    const file = Bun.file(root + path.replace(/^\/+/, "").replace(/\.\.+/g, ""))
    return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 })
  },
})
console.log("http://localhost:" + (process.env.PORT ?? 4321))
