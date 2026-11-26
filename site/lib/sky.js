// The masthead's moving parts: clouds that drift with scroll, and a sun whose third eye opens something worse.

const INK = "#1d1614"
const C = 170 // the sun's center in its 340×340 viewBox
const MAW = { x: 170, y: 196 } // where the mouth opens

const polar = (r, a) => [C + r * Math.cos(a), C + r * Math.sin(a)]
const f = (n) => n.toFixed(1)

function rays() {
  let out = ""
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI * 2) / 16
    const L = i % 2 === 0 ? 150 : 118
    const w = 0.17
    const p = (r, da) => polar(r, a + da)
    const [b1, b2, tip, c1, c2] = [p(70, -w), p(70, w), p(L, 0.1), p(L * 0.75, -w * 0.2), p(L * 0.75, w * 1.3)]
    const [s1, s2, s3] = [p(78, 0), p(L * 0.55, -0.04), p(L * 0.82, 0.07)]
    out +=
      `<g class="sun__ray" style="--i:${i}">` +
      `<path d="M${f(b1[0])} ${f(b1[1])} Q${f(c1[0])} ${f(c1[1])} ${f(tip[0])} ${f(tip[1])} Q${f(c2[0])} ${f(c2[1])} ${f(b2[0])} ${f(b2[1])} Z" fill="#f9bb2d" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M${f(s1[0])} ${f(s1[1])} Q${f(s2[0])} ${f(s2[1])} ${f(s3[0])} ${f(s3[1])}" stroke="#f26a21" stroke-width="6" stroke-linecap="round" fill="none" opacity=".8"/>` +
      `</g>`
  }
  return out
}

/** A ring of teeth pointing at the throat: `n` triangles between radii r1 (gum) and r2 (tip). */
function teeth(n, r1, r2, fill) {
  let out = ""
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n
    const half = Math.PI / n
    const pt = (r, da) => `${f(MAW.x + r * Math.cos(a + da))} ${f(MAW.y + r * Math.sin(a + da))}`
    out += `<path d="M${pt(r1, -half * 0.92)} L${pt(r2, 0.05)} L${pt(r1, half * 0.92)} Z" fill="${fill}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`
  }
  return out
}

/** The spiral into the dark, drawn as a few arms. */
function spiral() {
  let out = ""
  for (let arm = 0; arm < 4; arm++) {
    let d = ""
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const r = 2 + t * 16
      const a = arm * (Math.PI / 2) + t * Math.PI * 2.2
      d += `${t === 0 ? "M" : "L"}${f(MAW.x + r * Math.cos(a))} ${f(MAW.y + r * Math.sin(a))} `
    }
    out += `<path d="${d}" stroke="#7b2030" stroke-width="2" fill="none" opacity=".9"/>`
  }
  return out
}

export function sunMarkup() {
  return `<svg viewBox="0 0 340 340" class="sun" aria-hidden="false" role="img" aria-label="A sun">
  <defs>
    <radialGradient id="throat" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#000"/><stop offset=".55" stop-color="#2a070c"/><stop offset="1" stop-color="#5a1220"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ee5a8f" stop-opacity=".9"/><stop offset="1" stop-color="#ee5a8f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <g class="sun__rays">${rays()}</g>
  <circle cx="170" cy="170" r="78" fill="#f9bb2d" stroke="${INK}" stroke-width="5"/>
  <circle cx="170" cy="170" r="66" fill="#fbc94a"/>

  <g class="sun__calm">
    <path d="M133 162 q12 9 24 0 M183 162 q12 9 24 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="132" cy="190" r="9" fill="#f26a21" opacity=".35"/><circle cx="208" cy="190" r="9" fill="#f26a21" opacity=".35"/>
    <path d="M152 198 q18 16 36 0 q-18 7 -36 0 z" fill="#b4232a" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  </g>

  <g class="sun__scary">
    <g class="sun__squeeze" stroke="${INK}" stroke-width="3.5" fill="none" stroke-linecap="round">
      <path d="M128 146 q16 4 30 10"/><path d="M212 146 q-16 4 -30 10"/>
      <path d="M130 153 q14 2 26 6" stroke-width="2.5"/><path d="M210 153 q-14 2 -26 6" stroke-width="2.5"/>
      <path d="M118 140 l-9 -5 M117 149 l-11 0 M120 157 l-9 5" stroke-width="2.5"/>
      <path d="M222 140 l9 -5 M223 149 l11 0 M220 157 l9 5" stroke-width="2.5"/>
      <path d="M156 128 q-4 -6 -10 -8 M184 128 q4 -6 10 -8" stroke-width="2.5"/>
    </g>
    <g class="sun__maw">
      <circle cx="${MAW.x}" cy="${MAW.y}" r="44" fill="#e0566f" stroke="${INK}" stroke-width="4"/>
      <circle cx="${MAW.x}" cy="${MAW.y}" r="39" fill="#8e1b2b"/>
      <g class="sun__teeth sun__teeth--outer">${teeth(22, 39, 28, "#fffaf0")}</g>
      <circle cx="${MAW.x}" cy="${MAW.y}" r="27" fill="#6d1422" stroke="${INK}" stroke-width="1.5"/>
      <g class="sun__teeth sun__teeth--inner">${teeth(16, 26, 18, "#f6e3bd")}</g>
      <circle cx="${MAW.x}" cy="${MAW.y}" r="18" fill="url(#throat)"/>
      <g class="sun__spiral">${spiral()}</g>
    </g>
  </g>

  <g class="sun__eye" role="button" tabindex="0" aria-label="Touch the sun's third eye" aria-pressed="false">
    <circle class="sun__eye-glow" cx="170" cy="130" r="18" fill="url(#glow)"/>
    <circle cx="170" cy="130" r="16" fill="transparent"/>
    <path class="sun__gem" d="M170 120 l6 10 -6 10 -6 -10 z" fill="#ee5a8f" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <circle class="sun__pupil" cx="170" cy="130" r="2.4" fill="${INK}"/>
  </g>
</svg>`
}

function mountSun(host) {
  host.innerHTML = sunMarkup()
  const eye = host.querySelector(".sun__eye")
  const masthead = host.closest(".masthead")
  const toggle = () => {
    const scary = !masthead.classList.contains("is-scary")
    const apply = () => {
      masthead.classList.toggle("is-scary", scary)
      eye.setAttribute("aria-pressed", String(scary))
      eye.setAttribute("aria-label", scary ? "Close the sun's third eye" : "Touch the sun's third eye")
    }
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
    if (document.startViewTransition && !reduce) {
      document.documentElement.dataset.vt = scary ? "open" : "close"
      document.startViewTransition(apply).finished.finally(() => delete document.documentElement.dataset.vt)
    } else apply()
  }
  eye.addEventListener("click", toggle)
  eye.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      toggle()
    }
  })
}

function parallax(masthead) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)")
  let queued = false
  const update = () => {
    queued = false
    const y = Math.min(scrollY, masthead.offsetHeight + 200)
    masthead.style.setProperty("--scroll", reduce.matches ? "0" : String(y))
  }
  addEventListener("scroll", () => {
    if (!queued) (queued = true), requestAnimationFrame(update)
  }, { passive: true })
  update()
}

/** The section divider: a frog whose tongue is the page's rainbow, reaching for a fly it never quite gets. */
export function frogMarkup() {
  // The tongue's midline: out of the mouth, down and right, then ten even waves.
  const mid = "M52 66 C66 70 80 56 96 56 q12 -6 24 0" + " t24 0".repeat(9)
  const stripes = [
    [-8, "#f26a21"],
    [-4, "#f9bb2d"],
    [0, "#1fa7a0"],
    [4, "#ee5a8f"],
    [8, "#7b3fa6"],
  ]
  const lick = `pathLength="1" class="frog__lick"`
  return `<svg viewBox="0 0 372 92" class="frog__svg">
  <g class="frog__fly">
    <ellipse cx="349" cy="24" rx="6" ry="3.5" fill="#fffaf0" stroke="${INK}" stroke-width="1.4" transform="rotate(-25 349 24)"/>
    <ellipse cx="357" cy="23" rx="6" ry="3.5" fill="#fffaf0" stroke="${INK}" stroke-width="1.4" transform="rotate(25 357 23)"/>
    <ellipse cx="353" cy="30" rx="4.5" ry="3.6" fill="${INK}"/>
    <path d="M338 36 q-4 2 -8 0 M340 42 q-4 2 -8 0" stroke="${INK}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".5"/>
  </g>
  <ellipse cx="30" cy="84" rx="12" ry="6" fill="#7cb83a" stroke="${INK}" stroke-width="2.5"/>
  <ellipse cx="66" cy="84" rx="12" ry="6" fill="#7cb83a" stroke="${INK}" stroke-width="2.5"/>
  <circle cx="28" cy="30" r="14" fill="#7cb83a" stroke="${INK}" stroke-width="2.5"/>
  <circle cx="66" cy="30" r="14" fill="#7cb83a" stroke="${INK}" stroke-width="2.5"/>
  <ellipse cx="47" cy="58" rx="40" ry="26" fill="#7cb83a" stroke="${INK}" stroke-width="2.5"/>
  <path d="M17 34 a11 11 0 0 1 22 0 M55 34 a11 11 0 0 1 22 0" fill="#7cb83a"/>
  <ellipse cx="47" cy="70" rx="24" ry="11" fill="#c5e17a" opacity=".7"/>
  <circle cx="24" cy="54" r="3" fill="#4f8a2a"/><circle cx="74" cy="48" r="2.5" fill="#4f8a2a"/><circle cx="64" cy="76" r="2" fill="#4f8a2a"/>
  <g class="frog__eyes">
    <circle cx="28" cy="29" r="9" fill="#fffaf0" stroke="${INK}" stroke-width="2"/>
    <circle cx="66" cy="29" r="9" fill="#fffaf0" stroke="${INK}" stroke-width="2"/>
    <circle cx="29" cy="30" r="6" fill="#f9bb2d"/><circle cx="67" cy="30" r="6" fill="#f9bb2d"/>
    <circle cx="29" cy="30" r="4" fill="none" stroke="#ee5a8f" stroke-width="1.5"/><circle cx="67" cy="30" r="4" fill="none" stroke="#ee5a8f" stroke-width="1.5"/>
    <ellipse class="frog__pupil" cx="29" cy="30" rx="3.6" ry="2" fill="${INK}"/>
    <ellipse class="frog__pupil" cx="67" cy="30" rx="3.6" ry="2" fill="${INK}"/>
  </g>
  <circle cx="20" cy="62" r="5" fill="#ee5a8f" opacity=".45"/><circle cx="78" cy="58" r="5" fill="#ee5a8f" opacity=".45"/>
  <path class="frog__smile" d="M16 56 q34 20 66 0" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path class="frog__lip" d="M18 58 q10 10 24 8" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <ellipse class="frog__mouth" cx="50" cy="63" rx="12" ry="8" fill="#6d1422" stroke="${INK}" stroke-width="2.5"/>
  <g class="frog__tongue" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${mid}" stroke="${INK}" stroke-width="24" ${lick}/>
    ${stripes.map(([dy, color]) => `<path d="${mid}" transform="translate(0 ${dy})" stroke="${color}" stroke-width="4.6" ${lick}/>`).join("\n    ")}
  </g>
</svg>`
}

function mountFrogs() {
  for (const frog of document.querySelectorAll(".frog")) {
    frog.innerHTML = frogMarkup()
    // Mouse: the tongue is out while hovered (CSS). Touch has no hover, so a tap toggles it.
    frog.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "mouse") frog.classList.toggle("is-licking")
    })
  }
}
mountFrogs()

const masthead = document.querySelector(".masthead")
if (masthead) {
  const sun = masthead.querySelector(".masthead__sun")
  if (sun) mountSun(sun)
  parallax(masthead)
}
