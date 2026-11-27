// Clicks through every demo in real Chrome and screenshots the page. Needs `bun serve.ts` running.
import { chromium, webkit } from "playwright-core"
// BROWSER=webkit runs Safari's engine instead of Chrome.

const out = new URL("../shots/", import.meta.url).pathname
await Bun.$`mkdir -p ${out}`
const browser = process.env.BROWSER === "webkit"
  ? await webkit.launch()
  : await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" })
const errors = []
async function open(width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`))
  await page.goto(process.env.URL ?? "http://localhost:4321/", { waitUntil: "networkidle" })
  return page
}
const page = await open(1280)
const demo = (name) => page.locator(`[data-demo="${name}"]`)
const waitStatus = (name, re) => page.waitForFunction(([n, r]) => new RegExp(r).test(document.querySelector(`[data-demo="${n}"] .demo__bar .chip`).textContent), [name, re.source], { timeout: 15000 })
const text = async (name, sel) => (await demo(name).locator(sel).last().textContent())?.trim()

// Drives one demo to the end: runs it, then keeps pressing the main button of each turn (Accept, Rewind & retry,
// Send as the model) with the page's suggested answers until the run finishes. Returns the result text.
async function drive(name, { variant, shot } = {}) {
  const d = demo(name)
  if (variant) await d.getByRole("button", { name: variant, exact: true }).click()
  await d.getByRole("button", { name: /^Run/ }).click()
  for (let round = 0; round < 40; round++) {
    await waitStatus(name, /waiting|done|error/)
    const status = await d.locator(".demo__bar .chip").first().textContent()
    if (!/waiting/.test(status)) break
    if (round === 1 && shot) await d.screenshot({ path: out + shot })
    const btn = d.locator(".turn").getByRole("button", { name: /^(Accept|↺ Rewind|Monkey Patch)/ })
    await btn.click()
    await waitStatus(name, /running|done|error/).catch(() => {})
    await page.waitForTimeout(150)
  }
  await waitStatus(name, /done|error/)
  return (await text(name, ".result")).replace(/\s+/g, " ")
}

console.log("ouija:", await drive("mrtr"))
await demo("mrtr").screenshot({ path: out + "ouija.png" })
console.log("tarot:", await drive("rewind"))
await demo("rewind").screenshot({ path: out + "tarot.png" })
console.log("alice:", await drive("missing"))
await demo("missing").screenshot({ path: out + "alice.png" })

// frog divider: no tongue until hovered
const frog = page.locator(".frog").first()
await frog.scrollIntoViewIfNeeded()
await page.mouse.move(0, 0)
await page.waitForTimeout(600)
// Hidden at rest (Chrome used to paint a round-capped dot at the fly end), visible when hovered.
const tongue = () =>
  frog.locator(".frog__tongue").evaluate((el) => {
    const s = getComputedStyle(el)
    return `${s.visibility}, dashoffset ${getComputedStyle(el.querySelector(".frog__lick")).strokeDashoffset}`
  })
console.log("frog tongue at rest:", await tongue())
await frog.screenshot({ path: out + "frog-rest.png" })
await frog.hover()
await page.waitForTimeout(900)
console.log("frog tongue hovered:", await tongue())
await frog.screenshot({ path: out + "frog.png" })
await page.mouse.move(0, 0)

await page.evaluate(() => scrollTo(0, 0))
await page.screenshot({ path: out + "top.png" })
await page.screenshot({ path: out + "full.png", fullPage: true })

// phone width
const phone = await open(390)
await phone.screenshot({ path: out + "phone-top.png" })
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth)
console.log("phone horizontal overflow px:", overflow)
await phone.locator('[data-demo="rewind"]').getByRole("button", { name: "Run ▸" }).click()
await phone.waitForTimeout(1500)
await phone.locator('[data-demo="rewind"]').screenshot({ path: out + "phone-rewind.png" })

console.log(errors.length ? errors.join("\n") : "no console errors")
await browser.close()
