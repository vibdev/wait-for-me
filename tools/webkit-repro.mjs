// Loads the page in Playwright's WebKit (Safari's engine) and reports errors with stacks.
import { webkit } from "playwright-core"
const browser = await webkit.launch()
const page = await browser.newPage()
page.on("pageerror", (e) => console.log("pageerror:", e.message, "\n", e.stack))
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()))
await page.goto("http://localhost:4321/", { waitUntil: "networkidle" })
await page.waitForTimeout(500)
const r = await page.evaluate(async () => {
  try { const ps = await import("/vendor/psychoscript.js"); return "import ok " + Object.keys(ps).join(",") } catch (e) { return "import failed: " + e + "\n" + e.stack }
})
console.log(r)
await page.locator('[data-demo="mrtr"]').getByRole("button", { name: "Run ▸" }).click()
await page.waitForTimeout(2500)
console.log("status:", await page.locator('[data-demo="mrtr"] .demo__bar .chip').first().textContent())
console.log("result:", await page.locator('[data-demo="mrtr"] .msg').last().textContent())
await browser.close()
