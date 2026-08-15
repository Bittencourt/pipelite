/**
 * Shared source-scanning helper for the CFUI-04 / CFUI-05 source-read gates.
 *
 * Both gates hinge on the SAME property: a match must come from real code, never from prose in a
 * comment. `entity-attributes-parity.test.ts` would otherwise accept a commented-out
 * `entityAttributes={{...}}`, and `client-formula-bounds.test.ts` would otherwise be satisfied by
 * the words "FORMULA_EVAL_OPTIONS" appearing in a file header — which makes the gate
 * self-invalidating. One implementation so the two cannot drift apart.
 *
 * Not a `.test.ts`, so vitest's include glob does not try to run it.
 */
import { readFileSync } from "node:fs"

/**
 * Remove `//` line comments and block comments, respecting string and template literals.
 *
 * String-awareness is not decoration: `href="https://..."` in a page source would otherwise be
 * truncated as a line comment, silently swallowing the rest of the line and any JSX prop on it.
 */
export function stripComments(source: string): string {
  let out = ""
  let i = 0
  let quote: string | null = null

  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]

    if (quote) {
      out += ch
      if (ch === "\\") {
        out += next ?? ""
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch
      out += ch
      i += 1
      continue
    }

    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1
      continue
    }

    if (ch === "/" && next === "*") {
      i += 2
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1
      i += 2
      continue
    }

    out += ch
    i += 1
  }

  return out
}

/** Read a repo-relative source file with comments stripped. */
export function readStrippedSource(path: string): string {
  return stripComments(readFileSync(path, "utf8"))
}

/**
 * Return the argument text of every `${callee}(...)` call in `source`, using string-aware brace
 * matching so a `)` inside a string literal cannot close the argument list early.
 *
 * The source is expected to already be comment-stripped.
 */
export function callArguments(source: string, callee: string): string[] {
  const calls: string[] = []
  const marker = `${callee}(`
  let searchFrom = 0

  for (;;) {
    const markerAt = source.indexOf(marker, searchFrom)
    if (markerAt === -1) break

    // Do not match `myEvaluateFormula(` when looking for `evaluateFormula(`.
    const before = markerAt === 0 ? "" : source[markerAt - 1]
    if (/[A-Za-z0-9_$]/.test(before)) {
      searchFrom = markerAt + marker.length
      continue
    }

    let i = markerAt + marker.length
    const start = i
    let depth = 1
    let quote: string | null = null

    while (i < source.length && depth > 0) {
      const ch = source[i]

      if (quote) {
        if (ch === "\\") {
          i += 2
          continue
        }
        if (ch === quote) quote = null
        i += 1
        continue
      }

      if (ch === '"' || ch === "'" || ch === "`") quote = ch
      else if (ch === "(") depth += 1
      else if (ch === ")") depth -= 1

      i += 1
    }

    if (depth !== 0) throw new Error(`unterminated ${callee}( call in source`)

    calls.push(source.slice(start, i - 1))
    searchFrom = i
  }

  return calls
}
