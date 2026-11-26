// Frame pacing while the page scrolls through the masthead, and how far the cloud lags the scroll. Needs `bun serve.ts`.
import { chromium } from "playwright-core"
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: false,
  args: ["--window-position=-2400,0"],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(process.env.URL ?? "http://localhost:4321/", { waitUntil: "networkidle" })
for (const label of ["calm", "scary"]) {
  if (label === "scary") await page.locator(".sun__eye").click({ force: true }), await page.waitForTimeout(1500)
  await page.evaluate(() => scrollTo(0, 0))
  await page.waitForTimeout(300)
  const timing = page.evaluate(
    () =>
      new Promise((done) => {
        const t = []
        const start = performance.now()
        const tick = (now) => (t.push(now), now - start < 1600 ? requestAnimationFrame(tick) : done(t))
        requestAnimationFrame(tick)
      }),
  )
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 12), await page.waitForTimeout(16)
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -12), await page.waitForTimeout(16)
  const t = await timing
  const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b)
  const long = d.filter((x) => x > 20).length
  console.log(`${label}: ${d.length} frames, median ${d[d.length >> 1].toFixed(1)}ms, p95 ${d[Math.floor(d.length * 0.95)].toFixed(1)}ms, worst ${d.at(-1).toFixed(1)}ms, >20ms: ${long}`)
}
await browser.close()
