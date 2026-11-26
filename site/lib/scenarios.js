// The programs and host functions the page runs. Shared by the page and the local tests.

const fail = (kind, message) => Object.assign(new Error(message), { kind })

export const SECRET = "demo-only-secret: a real server keeps this out of the page"

// --- MRTR ---

export const ouija = {
  label: "Ouija",
  blurb: "The spirit (you) answers one letter per round trip. Type GOODBYE to let go.",
  code: `// One letter per round trip. Nothing on the server remembers the message.
let message = ""
while (true) {
  const { letter } = await elicit(\`The planchette drifts… \${message || "…"}\`, { letter: "string" })
  if (letter.trim().toUpperCase() === "GOODBYE") break
  message += letter.trim().toUpperCase()
}
return await interpret(message)`,
  tools: () => ({
    interpret: (message) => {
      const readings = {
        MRTR: "I gotta slow down on this stuff",
        HI: "Who said that?",
        BOO: "A traditionalist",
        OPENCODE: "Buncha hacks if you ask me",
      }
      return { spirit: message, reading: readings[message] ?? (message ? "the spirit is being vague" : "the spirit said nothing") }
    },
  }),
  suggest: (prop, asked) => (prop === "letter" ? ["M", "R", "T", "R", "GOODBYE"][asked] ?? "GOODBYE" : undefined),
}

// --- rewind ---

export const tarot = {
  label: "Tarot",
  blurb: "No fate, can you stop Death from being dealt?",
  code: `const deck = ["The Sun", "The Moon", "The Fool", "The Tower", "Death", "Death"]
const spread = []
for (const position of ["past", "present", "future"]) {
  try {
    const card = deck[Math.floor(Math.random() * deck.length)]
    if (card === "Death") throw new Error(\`Death, in your \${position}\`)
    spread.push(\`\${position}: \${card}\`)
  } catch (e) {
    spread.push(\`\${position}: \${e.message}\`)
  }
}
return spread`,
  tools: () => ({}),
}

// --- missing functions ---

export const alice = {
  label: "Wonderland",
  blurb: "I do mean impassible. Nothing's impossible!",
  code: `// Down the rabbit hole.
let height = 150 // centimeters
for (const bottle of ["DRINK ME", "EAT ME", "DRINK ME"]) {
  height = await potion(bottle, height)
}
let unbirthdays = 0
for (let day = 1; day <= 365; day++) {
  if (await isUnbirthday(day)) unbirthdays++
}
return { height, unbirthdays, riddle: await whyIsARavenLikeAWritingDesk() }`,
  tools: () => ({}),
  modelAnswers: {
    potion: { implementation: `(bottle, cm) => Math.round((bottle === "DRINK ME" ? cm / 6 : cm * 11) * 10) / 10` },
    isUnbirthday: { implementation: `(day) => day !== 124 // Alice's birthday, May 4th` },
    whyIsARavenLikeAWritingDesk: {
      value: "Because it can produce a few notes, though they are very flat; and it is never put with the wrong end in front!",
    },
  },
}

// Kept for the server tests: plain, predictable versions of each flow.
export const mrtr = {
  code: `const { name } = await elicit("Who is the table for?", { name: "string" })
const { guests } = await elicit(\`How many guests, \${name}?\`, { guests: "integer" })
const slot = await findSlot({ guests, after: "19:00" })
return await book({ name, guests, time: slot })`,
  tools: () => ({
    findSlot: ({ guests }) => (guests > 8 ? "21:30" : "19:15"),
    book: ({ name, guests, time }) => ({ confirmation: `TBL-${String(name).slice(0, 3).toUpperCase()}${guests}`, time }),
  }),
}

export const rewind = {
  code: `const cart = await getCart()
let receipt
try {
  const { amount } = await elicit(\`Cart is $\${cart.total}. How much on the card?\`, { amount: "number" })
  await holdStock(cart.items)
  receipt = await charge(amount)
} catch (e) {
  return { ok: false, reason: e.message }
}
return { ok: true, receipt }`,
  tools: () => {
    let holds = 0
    return {
      getCart: () => ({ items: ["tea", "mug"], total: 84 }),
      holdStock: (items) => ({ hold: ++holds, items }),
      charge: (amount) => {
        if (!(amount > 0)) throw fail("BadAmount", `can't charge ${amount}`)
        if (amount > 100) throw fail("LimitExceeded", `card limit is $100, asked for $${amount}`)
        return { charged: amount, id: `ch_${Math.round(amount * 100)}` }
      },
    }
  },
}

export const handback = {
  code: `const issues = await listIssues({ label: "bug" })
const { pick } = await elicit("Which issue should be fixed first?", {
  pick: { type: "string", enum: issues.map((i) => i.id) },
})
return await assign(pick, "me")`,
  tools: () => ({
    listIssues: () => [
      { id: "PS-12", title: "suspend() during for-await drops the iterator", comments: 9 },
      { id: "PS-31", title: "Typo in README", comments: 0 },
      { id: "PS-40", title: "Snapshot grows with each resume", comments: 4 },
    ],
    assign: (id, who) => ({ assigned: id, to: who }),
  }),
  modelAnswer: { pick: "PS-12" },
}

export const missing = {
  code: `const posts = await getPosts()
const out = []
for (const post of posts) {
  out.push({ slug: await slugify(post.title), minutes: await readingTime(post.words) })
}
return out`,
  tools: () => ({
    getPosts: () => [
      { title: "Pause anywhere!", words: 900 },
      { title: "A Pause Is a Value", words: 1450 },
      { title: "Teleporting  a running program", words: 300 },
    ],
  }),
  modelAnswers: {
    slugify: { implementation: `(title) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")` },
    readingTime: { implementation: `(words) => Math.max(1, Math.round(words / 230))` },
  },
}
