// Deals tarot until Death, lets the catch run, and checks the client's person has a bad time (and recovers on reset).
// Needs `bun serve.ts`. BROWSER=webkit for Safari.
import { chromium, webkit } from "playwright-core"

const out = new URL("../shots/", import.meta.url).pathname
const browser =
  process.env.BROWSER === "webkit"
    ? await webkit.launch()
    : await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
await page.goto("http://localhost:4321/", { waitUntil: "networkidle" })
const d = page.locator('[data-demo="rewind"]')
await d.scrollIntoViewIfNeeded()
const status = () => d.locator(".demo__bar .chip").first().textContent()
const settle = () =>
  page.waitForFunction(() => /waiting|done|error/.test(document.querySelector('[data-demo="rewind"] .demo__bar .chip').textContent), null, { timeout: 15000 })
const doomed = () => d.locator(".person").evaluate((el) => el.classList.contains("is-doomed"))

let dealt = 0
for (; dealt < 30; dealt++) {
  await d.getByRole("button", { name: /^Run/ }).click()
  await page.waitForTimeout(100)
  await settle()
  if (/waiting/.test(await status())) break // Death was drawn: the rewind question is up
}
console.log("spreads dealt until Death:", dealt + 1)
console.log("doomed before declining:", await doomed())
await d.getByRole("button", { name: "Let the catch run" }).click()
await page.waitForTimeout(100)
await settle()
await page.waitForTimeout(1300)
console.log("doomed after the catch ran:", await doomed(), "| status:", await status())
const actor = d.locator(".actor").first()
const box = await actor.boundingBox()
await page.screenshot({ path: out + "doomed.png", clip: { x: box.x - 20, y: box.y - 30, width: box.width + 40, height: box.height + 40 } })
await d.getByRole("button", { name: "Reset" }).click()
console.log("doomed after reset:", await doomed())
console.log(errors.length ? errors.join("\n") : "no page errors")
await browser.close()
