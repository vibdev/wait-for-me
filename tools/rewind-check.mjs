// Hovers the "rewind" word and checks the letters end up in reverse order. Needs `bun serve.ts`. BROWSER=webkit for Safari.
import { chromium, webkit } from "playwright-core"

const out = new URL("../shots/", import.meta.url).pathname
const browser =
  process.env.BROWSER === "webkit"
    ? await webkit.launch()
    : await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
await page.goto("http://localhost:4321/", { waitUntil: "networkidle" })
const word = page.locator(".rewind").first()
await word.scrollIntoViewIfNeeded()
await page.mouse.move(0, 0)
await page.waitForTimeout(300)
const reading = () =>
  word.evaluate((el) =>
    [...el.querySelectorAll(".rewind__l")]
      .map((l) => [l.getBoundingClientRect().left, l.textContent])
      .sort((a, b) => a[0] - b[0])
      .map((x) => x[1])
      .join(""),
  )
const box = await word.boundingBox()
const clip = { x: box.x - 60, y: box.y - 20, width: box.width + 120, height: box.height + 40 }
console.log("aria-label:", await word.getAttribute("aria-label"), "| at rest reads:", await reading())
await page.screenshot({ path: out + "rewind-rest.png", clip })
await word.hover()
await page.waitForTimeout(220)
await page.screenshot({ path: out + "rewind-mid.png", clip })
await page.waitForTimeout(800)
console.log("hovered reads:", await reading())
await page.screenshot({ path: out + "rewind-done.png", clip })
await page.mouse.move(0, 0)
await page.waitForTimeout(900)
console.log("after leaving reads:", await reading())
console.log(errors.length ? errors.join("\n") : "no page errors")
await browser.close()
