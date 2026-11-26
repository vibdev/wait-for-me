// Source rewriting, done before the program is compiled. Every insertion stays on its line, so line numbers in the
// rewritten program match the original listing.
//
//   try { ... } catch (e) { ... }
//     becomes
//   await __checkpoint(0); try { ... } catch (__e0) { await __caught(0, __describe(__e0)); let e = __e0; ... }
//
// Calls to parking functions (elicit, and functions the program calls but nobody defined) get a trailing
// `{ __line: N }` argument so the server can say where the program is waiting.

/** Walks an ESTree node, calling enter(node, ancestors) for each. */
function walk(node, enter, ancestors = []) {
  if (!node || typeof node.type !== "string") return
  enter(node, ancestors)
  ancestors.push(node)
  for (const key in node) {
    if (key === "loc" || key === "start" || key === "end") continue
    const child = node[key]
    if (Array.isArray(child)) for (const c of child) walk(c, enter, ancestors)
    else if (child && typeof child.type === "string") walk(child, enter, ancestors)
  }
  ancestors.pop()
}

const FUNCTION = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"])

function patternNames(pattern, out) {
  if (!pattern) return
  switch (pattern.type) {
    case "Identifier": out.add(pattern.name); break
    case "ObjectPattern": for (const p of pattern.properties) patternNames(p.type === "RestElement" ? p.argument : p.value, out); break
    case "ArrayPattern": for (const e of pattern.elements) patternNames(e, out); break
    case "RestElement": patternNames(pattern.argument, out); break
    case "AssignmentPattern": patternNames(pattern.left, out); break
  }
}

/** Every name the program declares anywhere (a coarse but safe scope model: shadowing anywhere counts). */
function declaredNames(ast) {
  const names = new Set()
  walk(ast, (n) => {
    if (n.type === "VariableDeclarator") patternNames(n.id, names)
    if ((n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") && n.id) names.add(n.id.name)
    if (FUNCTION.has(n.type)) {
      if (n.id) names.add(n.id.name)
      for (const p of n.params) patternNames(p, names)
    }
    if (n.type === "CatchClause") patternNames(n.param, names)
    if (n.type === "ImportSpecifier" || n.type === "ImportDefaultSpecifier" || n.type === "ImportNamespaceSpecifier")
      names.add(n.local.name)
  })
  return names
}

/**
 * Rewrites `code`. `known` is every global the program may use (built-ins and host functions). `parks` are host
 * functions that may pause the run. Returns the new code, the try blocks it instrumented, and `missing`: functions
 * the program calls that it never declares and no global provides.
 */
export function rewrite(parse, code, { known, parks, checkpoints = true }) {
  const ast = parse(code, {
    ecmaVersion: "latest",
    sourceType: "script",
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    locations: true,
  })
  const declared = declaredNames(ast)
  const missing = new Set()
  const edits = [] // { at, remove, text }
  const tries = []

  // `await` is legal at top level and in async functions only.
  const canAwait = (ancestors) => {
    for (let i = ancestors.length - 1; i >= 0; i--) if (FUNCTION.has(ancestors[i].type)) return ancestors[i].async
    return true
  }

  walk(ast, (node, ancestors) => {
    if (node.type === "CallExpression" && node.callee.type === "Identifier") {
      const name = node.callee.name
      const isMissing = !declared.has(name) && !known.has(name)
      if (isMissing) missing.add(name)
      if ((parks.has(name) || isMissing) && !declared.has(name)) {
        const close = node.end - 1 // the ")"
        const before = code.slice(node.callee.end, close).trimEnd()
        const sep = node.arguments.length === 0 ? "" : before.endsWith(",") ? " " : ", "
        edits.push({ at: close, remove: 0, text: `${sep}{ __line: ${node.loc.start.line} }` })
      }
    }
    if (checkpoints && node.type === "TryStatement" && node.handler && canAwait(ancestors)) {
      const id = tries.length
      const h = node.handler
      tries.push({ id, line: node.loc.start.line, endLine: node.block.loc.end.line, catchLine: h.loc.start.line })
      const tmp = `__e${id}`
      edits.push({ at: node.start, remove: 0, text: `await __checkpoint(${id}); ` })
      if (h.param) {
        const original = code.slice(h.param.start, h.param.end)
        edits.push({ at: h.param.start, remove: h.param.end - h.param.start, text: tmp })
        edits.push({ at: h.body.start + 1, remove: 0, text: ` await __caught(${id}, __describe(${tmp})); let ${original} = ${tmp};` })
      } else {
        edits.push({ at: h.start, remove: h.body.start - h.start, text: `catch (${tmp}) ` })
        edits.push({ at: h.body.start + 1, remove: 0, text: ` await __caught(${id}, __describe(${tmp}));` })
      }
    }
  })

  edits.sort((a, b) => b.at - a.at)
  let out = code
  for (const e of edits) out = out.slice(0, e.at) + e.text + out.slice(e.at + e.remove)
  if (tries.length) {
    // A plain helper so the error crosses to the host as data (Error objects don't copy their message).
    out =
      `const __describe = (e) => ({ name: e?.name ?? "Error", message: e?.message ?? String(e) }); ` + out
  }
  return { code: out, tries, missing: [...missing] }
}
