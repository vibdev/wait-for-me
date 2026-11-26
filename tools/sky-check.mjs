// Checks the masthead: the third-eye morph (with View Transitions), clouds on scroll. Needs `bun serve.ts` running.
import { chromium, webkit } from "playwright-core"
// BROWSER=webkit runs Safari's engine instead of Chrome.

const out = new URL("../shots/", import.meta.url).pathname
const browser = process.env.BROWSER === "webkit"
  ? await webkit.launch()
  : await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
await page.goto("http://localhost:4321/", { waitUntil: "networkidle" })

const sunBox = async () => page.locator(".masthead__sun").boundingBox()
await page.screenshot({ path: out + "sun-calm.png", clip: { x: 880, y: 0, width: 400, height: 330 } })
console.log("view transitions:", await page.evaluate(() => typeof document.startViewTransition))

await page.locator(".sun__eye").click({ force: true })
await page.waitForTimeout(350)
await page.screenshot({ path: out + "sun-mid.png", clip: { x: 880, y: 0, width: 400, height: 330 } })
await page.waitForTimeout(1500)
console.log("scary:", await page.evaluate(() => document.querySelector(".masthead").classList.contains("is-scary")), "| aria-pressed", await page.locator(".sun__eye").getAttribute("aria-pressed"))
await page.screenshot({ path: out + "sun-scary-top.png" })
await page.screenshot({ path: out + "sun-scary.png", clip: { x: 880, y: 0, width: 400, height: 330 } })

// keyboard closes it
await page.locator(".sun__eye").focus()
await page.keyboard.press("Enter")
await page.waitForTimeout(1200)
console.log("closed by keyboard:", !(await page.evaluate(() => document.querySelector(".masthead").classList.contains("is-scary"))))

// scroll moves clouds
const cloudX = () => page.locator(".masthead__cloud--a").evaluate((el) => getComputedStyle(el).transform)
const before = await cloudX()
await page.mouse.wheel(0, 300)
await page.waitForTimeout(400)
console.log("cloud transform", before, "→", await cloudX())
await page.screenshot({ path: out + "scrolled.png" })
console.log(errors.length ? errors.join("\n") : "no console errors")
await browser.close()
