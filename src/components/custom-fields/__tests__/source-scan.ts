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
 *
 * SECOND HALF OF THIS FILE: THE JSX EXTRACTORS.
 *
 * `openingTagAt`, `tagIndexes`, `elementRegion` and `enclosingConditional` were written for plan
 * 40-08's save-dialog gate, module-private, after that plan recorded why it could not import the
 * equivalents from `src/app/organizations/__tests__/toolbar-wiring.test.ts`: those are module-private
 * there AND hard-wired to that file's marker, the literal `'<div className="flex flex-wrap'`. 40-08's
 * SUMMARY closed with the condition for promoting them — "if a third 40-* gate needs these, promote
 * all four into `source-scan.ts` in ONE commit and delete both copies". Plan 40-09's manage-dialog
 * gate is that third consumer, so they live here now and 40-08's gate imports them.
 *
 * They are here rather than in a new file because the property they exist for is the SAME property
 * the three functions above exist for: an assertion must read real code and never prose. A scoped
 * assertion is the other half of that guarantee — `stripComments` stops a comment satisfying a gate,
 * and `elementRegion` stops the WRONG ELEMENT satisfying it. One module so the two halves cannot
 * drift apart, and so no fourth brace matcher gets written by the next plan that needs one.
 *
 * All four take an OPTIONAL `file` label used only in their throw messages. They are shared helpers
 * and cannot know which file a caller read; passing the path keeps a malformed-source failure
 * self-locating, exactly as it was when these lived beside a single `COMPONENT` constant.
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

/* ------------------------------------------------------------------------- *
 * THE JSX EXTRACTORS — promoted verbatim from plan 40-08's save-dialog gate.
 * ------------------------------------------------------------------------- */

/** `"path/to/file: "` when a caller named its file, `""` when it did not. */
function where(file: string): string {
  return file === "" ? "" : `${file}: `
}

/**
 * The opening tag that starts at `at`, up to the `>` that closes it.
 *
 * String-aware AND brace-depth-aware: an arrow function in a prop (`onSubmit={(e) => …}`) contains
 * a `>` that is not the end of the tag, and a naive `indexOf(">")` would truncate the tag right
 * before the className it is being asked about.
 */
export function openingTagAt(source: string, at: number, label: string, file = ""): string {
  let i = at
  let depth = 0
  let quote: string | null = null

  while (i < source.length) {
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

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch
      i += 1
      continue
    }

    if (ch === "{") depth += 1
    else if (ch === "}") depth -= 1
    else if (ch === ">" && depth === 0) return source.slice(at, i + 1)

    i += 1
  }

  throw new Error(`${where(file)}unterminated opening tag for ${label}`)
}

/**
 * Every offset where `<${tagName}` begins as a WHOLE tag name.
 *
 * The boundary check is what stops `<Dialog` matching `<DialogContent` and `<RadioGroup` matching
 * `<RadioGroupItem` — an assertion scoped to the wrong element is not scoped at all.
 */
export function tagIndexes(source: string, tagName: string): number[] {
  const found: number[] = []
  const marker = `<${tagName}`
  let from = 0

  for (;;) {
    const at = source.indexOf(marker, from)
    if (at === -1) break

    const after = source[at + marker.length]
    if (after !== undefined && /[A-Za-z0-9_]/.test(after)) {
      from = at + marker.length
      continue
    }

    found.push(at)
    from = at + marker.length
  }

  return found
}

/**
 * The `<${tagName}> … </${tagName}>` region, by TAG DEPTH rather than by a line range.
 *
 * A line range silently drifts the moment anything above the element grows; depth counting does
 * not, and a nested copy of the same tag cannot close the region early.
 *
 * Scoping to a tag that is not the FIRST of its name in the file — a `<div>` among many — is done by
 * slicing the source at that element's own opening tag and calling this on the slice. That is why
 * there is no "nth occurrence" parameter: the slice already says which one.
 *
 * SELF-CLOSING TAGS: `<div />` is a complete element, not an open. Counting it as an open leaves
 * depth stuck above zero for the rest of the file and the region throws `unterminated`. Plan 40-12
 * hit this on `kanban-board.tsx`, whose pipeline row holds a `<div />` placeholder for the
 * `pipelines.length <= 1` case. Whether a tag self-closes is decided from the END of the real
 * opening tag via `openingTagAt` — brace- and string-aware — because a `>` inside `className={a > b}`
 * is not the end of the tag and a `/` inside `href="a/"` is not a self-close.
 *
 * The returned region ends at the closing tag's NAME and excludes its final `>`; that predates this
 * function's promotion into this module and several gates read regions on that basis, so it is
 * deliberately left alone.
 */
export function elementRegion(source: string, tagName: string, file = ""): string {
  const [at] = tagIndexes(source, tagName)
  if (at === undefined) throw new Error(`${where(file)}no <${tagName}> found`)

  const open = `<${tagName}`
  const close = `</${tagName}`
  const label = `<${tagName}>`

  // A self-closing ROOT is the entire region — there is no closing tag to walk to.
  const rootTag = openingTagAt(source, at, label, file)
  if (rootTag.endsWith("/>")) return rootTag

  let depth = 1
  let i = at + rootTag.length

  while (i < source.length && depth > 0) {
    if (source.startsWith(close, i)) {
      depth -= 1
      i += close.length
      continue
    }
    if (source.startsWith(open, i)) {
      const tag = openingTagAt(source, i, label, file)
      if (!tag.endsWith("/>")) depth += 1
      i += tag.length
      continue
    }
    i += 1
  }

  if (depth !== 0) throw new Error(`${where(file)}unterminated <${tagName}> region`)

  return source.slice(at, i)
}

/**
 * The `{<test> && ( … )}` JSX conditional that ENCLOSES `marker`, split into its test and its body,
 * extracted by paren depth.
 *
 * The final containment check is not decoration: without it, a marker that moved out of the
 * conditional would still find the nearest preceding `&& (` and the gate would happily assert
 * things about a branch the marker no longer lives in.
 */
export function enclosingConditional(
  source: string,
  marker: string,
  file = ""
): { test: string; body: string } {
  const at = source.indexOf(marker)
  if (at === -1) throw new Error(`${where(file)}${marker} not found in the source`)

  const arrow = source.lastIndexOf("&& (", at)
  if (arrow === -1) {
    throw new Error(`${where(file)}${marker} is not inside a {… && ( … )} conditional`)
  }

  const brace = source.lastIndexOf("{", arrow)
  if (brace === -1) {
    throw new Error(
      `${where(file)}no JSX expression container opens the conditional around ${marker}`
    )
  }

  let depth = 1
  let i = arrow + "&& (".length
  const bodyStart = i

  while (i < source.length && depth > 0) {
    const ch = source[i]
    if (ch === "(") depth += 1
    else if (ch === ")") depth -= 1
    i += 1
  }

  if (depth !== 0) throw new Error(`${where(file)}unterminated conditional around ${marker}`)

  const body = source.slice(bodyStart, i - 1)

  if (!body.includes(marker)) {
    throw new Error(
      `${where(file)}the conditional found before ${marker} does not contain it — the extraction ` +
        `latched onto an unrelated branch, so nothing below would be scoped to the right one.`
    )
  }

  return { test: source.slice(brace + 1, arrow), body }
}
