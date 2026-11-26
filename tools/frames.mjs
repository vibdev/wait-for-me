// Measures frame pacing in the masthead for 2s, calm and opened. Needs `bun serve.ts`.
import { chromium } from "playwright-core"
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: false, args: ["--window-position=-2400,0"] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto("http://localhost:4321/", { waitUntil: "networkidle" })
const measure = () => page.evaluate(() => new Promise((done) => {
  const t = []; const start = performance.now()
  const tick = (now) => { t.push(now); now - start < 2000 ? requestAnimationFrame(tick) : done(t) }
  requestAnimationFrame(tick)
})).then((t) => {
  const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b)
  return `${d.length} frames, median ${d[d.length >> 1].toFixed(1)}ms, p95 ${d[Math.floor(d.length * 0.95)].toFixed(1)}ms, worst ${d.at(-1).toFixed(1)}ms`
})
console.log("calm:  ", await measure())
await page.locator(".sun__eye").click({ force: true }); await page.waitForTimeout(1500)
console.log("opened:", await measure())
const tf = () => page.locator(".masthead__cloud--a").evaluate((el) => getComputedStyle(el).transform)
await page.mouse.wheel(0, 300); await page.waitForTimeout(400)
console.log("cloud after scroll:", await tf(), "| marble transform:", await page.locator(".masthead__marble").evaluate((el) => getComputedStyle(el).transform))
await browser.close()
