/**
 * CFUI-02 / CFUI-03 wiring gates for `custom-fields-section.tsx`.
 *
 * WHY THESE ARE SOURCE-READ GATES AND NOT INTERACTIVE TESTS
 * --------------------------------------------------------
 * Nothing interactive about this component is reachable here. It is a `'use client'` React
 * component, and the repo runs vitest with `environment: 'node'` and no DOM: rendering it would
 * require jsdom plus a testing library, and phase 44 must install NO packages (RESEARCH
 * § Package Legitimacy Audit lists zero candidates; the threat register pins T-44-SC on exactly
 * that). Adding a renderer to satisfy a test would be a larger, riskier change than the two lines
 * under test.
 *
 * So the *behaviour* is verified in three places, and this file is deliberately only the third:
 *
 *  1. `src/lib/client-field-values.test.ts` — the seeding, precedence, wrapper-unwrapping and
 *     server-parity semantics of `buildClientFieldValues` (16 tests, plan 44-03).
 *  2. `src/lib/custom-fields.test.ts` — that a successful `saveFieldValues` resolves with the
 *     recomputed `values` blob, and that client-held `{formula:true,...}` wrappers posted back are
 *     stripped server-side (plan 44-02).
 *  3. This file — that the component actually CALLS that tested logic.
 *
 * (3) is the specific link that was missing and that let CFUI-02 and CFUI-03 survive: the helper
 * behaviour was never in doubt once extracted, the call site was. Browser verification of the
 * rendered result is plan 44-09.
 *
 * Precedent for source-read assertions in this repo: the D-18 gate at `custom-fields.test.ts:405`,
 * `entity-attributes-parity.test.ts` (CFUI-04) and `client-formula-bounds.test.ts` (CFUI-05).
 * Comment-stripping is shared with those two via `./source-scan`, so prose in a file header can
 * never satisfy a gate — each describe below carries a decoy test proving that.
 */
import { describe, it, expect } from "vitest"
import { callArguments, readStrippedSource, stripComments } from "./source-scan"

const SECTION = "src/components/custom-fields/custom-fields-section.tsx"

/** Comment-stripped source of the component under test. */
function sectionSource(): string {
  return readStrippedSource(SECTION)
}

/**
 * The argument text of the `useMemo(...)` call that `allFieldValues` is assigned from.
 *
 * Anchored on the assignment rather than on "the first useMemo in the file", so a future second
 * memo cannot make this gate read the wrong call.
 */
function allFieldValuesMemoArguments(source: string): string {
  const assignment = source.search(/\ballFieldValues\s*=/)
  expect(assignment, `no \`allFieldValues =\` assignment in ${SECTION} — did it get renamed?`)
    .toBeGreaterThan(-1)

  const calls = callArguments(source.slice(assignment), "useMemo")
  expect(calls.length, "`allFieldValues` is not assigned from a useMemo call").toBeGreaterThan(0)
  return calls[0]
}

/**
 * The final top-level array literal of an argument list — a `useMemo` call's dependency array.
 * Depth-aware so a nested array inside the callback body is not mistaken for the deps.
 */
function trailingArrayLiteral(args: string): string | null {
  let depth = 0
  let quote: string | null = null
  let lastOpen = -1

  for (let i = 0; i < args.length; i += 1) {
    const ch = args[i]

    if (quote) {
      if (ch === "\\") {
        i += 1
        continue
      }
      if (ch === quote) quote = null
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") quote = ch
    else if (ch === "[") {
      if (depth === 0) lastOpen = i
      depth += 1
    } else if (ch === "]") depth -= 1
    else if (ch === "{" || ch === "(") depth += 1
    else if (ch === "}" || ch === ")") depth -= 1
  }

  if (lastOpen === -1) return null
  return args.slice(lastOpen, args.lastIndexOf("]") + 1)
}

describe("the evaluation map is built by the shared helper (CFUI-03)", () => {
  it("imports buildClientFieldValues from the client-safe module", () => {
    // `@/lib/client-field-values` is the db-free mirror of the server's buildFormulaFieldValues.
    // Importing from `@/lib/formula-recalc` instead would drag `@/db` into the browser bundle.
    const source = sectionSource()

    expect(source).toMatch(
      /import\s*\{[^}]*\bbuildClientFieldValues\b[^}]*\}\s*from\s*["']@\/lib\/client-field-values["']/
    )
    expect(source, "a client component must never import the db-touching recalc module")
      .not.toMatch(/from\s*["']@\/lib\/formula-recalc["']/)
  })

  it("builds allFieldValues with buildClientFieldValues", () => {
    const args = allFieldValuesMemoArguments(sectionSource())

    expect(
      args,
      "`allFieldValues` must come from the helper the parity suite covers, not from an inline map"
    ).toMatch(/\bbuildClientFieldValues\s*\(/)
  })

  it("passes definitions, entityAttributes and localValues to the helper", () => {
    // The helper takes ONE object argument (44-03), not three positional ones. `definitions` is
    // what produces the D-14 null seed: without it an unset formula source is an ABSENT key and
    // the engine answers `Unknown field: X` — the literal CFUI-03 symptom.
    const calls = callArguments(sectionSource(), "buildClientFieldValues")
    expect(calls.length, "no buildClientFieldValues call site").toBe(1)

    const [args] = calls
    expect(args, "the D-14 null seed needs the active definitions").toMatch(/\bdefinitions\b/)
    expect(args, "natives must still take part in evaluation").toMatch(/\bentityAttributes\b/)
    expect(args, "the helper's `values` key must receive the component's local values")
      .toMatch(/\bvalues\s*:\s*localValues\b/)
  })

  it("no longer merges the map with a raw spread", () => {
    const source = sectionSource()

    // The old body — `{ ...entityAttributes, ...localValues }` — has no null seed and no wrapper
    // unwrapping, which is the whole of CFUI-03.
    expect(source, "the raw entityAttributes/localValues spread is what CFUI-03 replaces")
      .not.toMatch(/\.\.\.\s*entityAttributes/)
    expect(source).not.toMatch(/\{\s*\.\.\.\s*entityAttributes\s*,\s*\.\.\.\s*localValues\s*,?\s*\}/)
  })

  it("lists definitions in the memo's dependency array", () => {
    // definitions is now read inside the callback; omitting it staleness-locks the seed to the
    // definition list from first render.
    const deps = trailingArrayLiteral(allFieldValuesMemoArguments(sectionSource()))

    expect(deps, "the allFieldValues memo has no dependency array").not.toBeNull()
    expect(deps).toMatch(/\bdefinitions\b/)
    expect(deps).toMatch(/\bentityAttributes\b/)
    expect(deps).toMatch(/\blocalValues\b/)
  })

  it("does not count a commented-out call as wiring", () => {
    // Guards the gate itself: this whole file is source-reading, so prose must never satisfy it.
    const decoy = `
      // const allFieldValues = useMemo(() => buildClientFieldValues({ definitions }), [definitions])
      /* buildClientFieldValues({ definitions, entityAttributes, values: localValues }) */
      const allFieldValues = useMemo(() => ({ ...entityAttributes, ...localValues }), [localValues])
    `
    const stripped = stripComments(decoy)

    expect(callArguments(stripped, "buildClientFieldValues")).toEqual([])
    expect(stripped).toMatch(/\.\.\.\s*entityAttributes/)
  })
})

describe("the server's recomputed values are authoritative after a save (CFUI-02)", () => {
  /**
   * `localValues` is `useState(values)`, which permanently shadows the `values` prop — a fresh RSC
   * payload can never reach it. Before this change the only thing ever merged in was the key the
   * user typed, so the `{formula:true,...}` wrapper the component held stayed the one from page
   * load: the displayed formula was literally one save behind. Plan 44-02 made `saveFieldValues`
   * resolve with the post-recalculation blob; these gates pin that the component takes it.
   *
   * Note for reviewers: after this, `localValues` holds wrapper objects and the NEXT save POSTs
   * them back. That is expected and safe — `stripFormulaKeys` runs server-side before every write
   * (T-34-04) and carries the stored wrapper over (D-06), with explicit coverage in
   * `custom-fields.test.ts`. No client-side filtering is added here on purpose; the server is the
   * single enforcement point, and a gate asserting the client never sends formula keys would be
   * asserting the opposite of the real contract.
   */
  const setLocalValuesArguments = () =>
    callArguments(sectionSource(), "setLocalValues").map((args) => args.trim())

  it("types the fetch wrapper's response with the optional values key", () => {
    // The route already does NextResponse.json(result); only the client-side type was too narrow,
    // so `result.values` would not even compile.
    expect(sectionSource()).toMatch(
      /Promise<\{[^}]*\bvalues\?:\s*Record<\s*string\s*,\s*unknown\s*>[^}]*\}>/
    )
  })

  it("replaces localValues with the blob the server just computed", () => {
    const args = setLocalValuesArguments()

    expect(
      args.filter((a) => /^result\.values$/.test(a)),
      "the server's values must REPLACE localValues, not be merged key-by-key into it — merging " +
        "is what leaves a stale formula wrapper in place"
    ).toHaveLength(1)
  })

  it("sets the server's values only after the request resolves", () => {
    const source = sectionSource()
    const request = source.search(/await\s+saveCustomFields\s*\(/)
    const authoritative = source.search(/setLocalValues\s*\(\s*result\.values\s*\)/)

    expect(request, "no awaited saveCustomFields call").toBeGreaterThan(-1)
    expect(authoritative).toBeGreaterThan(request)
  })

  it("keeps the optimistic update before the request", () => {
    const source = sectionSource()
    const optimistic = source.search(/setLocalValues\s*\(\s*newValues\s*\)/)
    const request = source.search(/await\s+saveCustomFields\s*\(/)

    expect(optimistic, "the optimistic setLocalValues(newValues) is gone — typing would lag")
      .toBeGreaterThan(-1)
    expect(optimistic).toBeLessThan(request)
    expect(setLocalValuesArguments().filter((a) => /^newValues$/.test(a))).toHaveLength(1)
  })

  it("notifies onValuesChange with the server's values, falling back to the optimistic blob", () => {
    const calls = callArguments(sectionSource(), "onValuesChange?.")

    expect(calls, "onValuesChange must still fire on success").toHaveLength(1)
    expect(
      calls[0].trim(),
      "the parent must be told what the server stored, not what the client guessed"
    ).toMatch(/^result\.values\s*\?\?\s*newValues$/)
  })

  it("still reverts to the values prop on both failure paths", () => {
    // Unchanged recovery behaviour: `result.success === false` and a thrown fetch.
    const source = sectionSource()

    expect(
      setLocalValuesArguments().filter((a) => /^values$/.test(a)),
      "both revert-to-prop paths must survive"
    ).toHaveLength(2)
    expect(source.match(/console\.error\(\s*['"]Failed to save field:['"]/g) ?? []).toHaveLength(2)
    expect(source, "the thrown-fetch recovery path is gone").toMatch(/catch\s*\(/)
  })

  it("makes exactly four setLocalValues calls", () => {
    // optimistic + authoritative + two reverts. A fifth means an extra state write nobody
    // reasoned about; a third means one of the four above was dropped.
    expect(setLocalValuesArguments()).toEqual(["newValues", "result.values", "values", "values"])
  })

  it("does not count a commented-out merge as wiring", () => {
    const decoy = `
      // if (result.values) setLocalValues(result.values)
      /* onValuesChange?.(result.values ?? newValues) */
      if (result.success) { onValuesChange?.(newValues) }
    `
    const stripped = stripComments(decoy)

    expect(callArguments(stripped, "setLocalValues")).toEqual([])
    expect(callArguments(stripped, "onValuesChange?.")).toEqual(["newValues"])
  })
})
