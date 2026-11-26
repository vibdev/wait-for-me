// Renders the social preview card (site/art/og.png, 1200×630): the masthead with the sun's third eye open, plus a line
// saying what the page shows. Needs `bun serve.ts`.
import { chromium } from "playwright-core"

const out = new URL("../site/art/og.png", import.meta.url).pathname
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.goto(process.env.URL ?? "http://localhost:4321/", { waitUntil: "networkidle" })
await page.locator(".sun__eye").click({ force: true })
await page.addStyleTag({
  content: `
    .masthead { height: 630px; box-sizing: border-box; display: grid; place-content: center; padding: 0 210px 110px 0; border: 0 }
    .masthead__sun { width: 430px; right: -70px; top: -70px; animation: none; rotate: -6deg }
    .masthead__cloud { animation: none !important; transform: none !important }
    .masthead__cloud--a { top: 9% } .masthead__cloud--b { left: 6%; bottom: 9% } .masthead__cloud--c { right: 42%; bottom: 12% }
    .masthead__plate { scale: 1.12 }
    .og-line { position: absolute; left: 0; right: 0; margin: 0 auto; bottom: 150px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; max-width: 980px; flex-wrap: nowrap }
    .og-line span { font: 600 17px/1 ui-monospace, "SF Mono", Menlo, monospace; background: var(--paper, #fffaf0);
      border: 2.5px solid var(--ink, #1d1614); border-radius: 999px; padding: 9px 14px; box-shadow: 3px 3px 0 var(--ink, #1d1614) }
  `,
})
await page.evaluate(() => {
  const line = document.createElement("div")
  line.className = "og-line"
  for (const t of ["pause mid-line", "seal it in requestState", "rewind the catch", "let the model finish it"]) {
    const s = document.createElement("span")
    s.textContent = t
    line.append(s)
  }
  document.querySelector(".masthead__plate").after(line)
  scrollTo(0, 0)
})
await page.waitForTimeout(2500)
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } })
console.log(out)
await browser.close()
