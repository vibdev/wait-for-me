// <span class="rewind">rewind</span>: on hover the letters play backwards into their mirrored places, last letter
// first, like tape running in reverse. Screen readers still get the word as written.

for (const el of document.querySelectorAll(".rewind")) {
  const word = el.textContent
  el.setAttribute("aria-label", word)
  el.textContent = ""
  const letters = [...word].map((ch) => {
    const span = document.createElement("span")
    span.className = "rewind__l"
    span.setAttribute("aria-hidden", "true")
    span.textContent = ch
    el.append(span)
    return span
  })

  // Each letter's distance to where it sits in the reversed word. Measured, so it works in any font.
  const measure = () => {
    const widths = letters.map((l) => l.getBoundingClientRect().width)
    const n = letters.length
    let x = 0
    letters.forEach((l, i) => {
      const after = widths.slice(i + 1).reduce((a, b) => a + b, 0) // in reverse, the later letters come first
      l.style.setProperty("--dx", `${after - x}px`)
      l.style.setProperty("--lift", i % 2 ? "0.22em" : "-0.22em")
      l.style.setProperty("--delay", `${(n - 1 - i) * 35}ms`)
      x += widths[i]
    })
  }
  measure()
  document.fonts?.ready.then(measure)
  addEventListener("resize", measure)

  // Touch has no hover: a tap toggles it.
  el.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "mouse") el.classList.toggle("is-rewinding")
  })
}
