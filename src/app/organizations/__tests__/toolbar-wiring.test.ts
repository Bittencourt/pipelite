/**
 * THE L-10 / R-4 / R-5 TOOLBAR GATE — a source read over both list-page toolbars.
 *
 * This plan adds a THIRD control to two rows that carried two, and Phase 45 already paid for what
 * happens when that lands on a non-wrapping row: `/deals` and `/activities` measured 412px and
 * 356/425/430px against a 305px client width and needed a rebuild. The classes that prevent it
 * (`flex-wrap`, `gap-2`, and `min-w-0` on the growing search cluster) look like decoration to a
 * later reader with a tidying instinct, so they are asserted rather than merely commented.
 *
 * WHAT THIS TEST IS NOT. It does not measure anything. No browser runs here, so it cannot know
 * that either toolbar actually fits at 320px — it knows only that the classes which make fitting
 * POSSIBLE are present. **The 320px measurement of both toolbars belongs to plan 39-17**, and this
 * file is deliberately not written in a way that could be mistaken for that proof.
 *
 * Every assertion is SCOPED to the extracted toolbar region rather than made against the whole
 * file, and every assertion names its file — a gate that passes because the string appears
 * somewhere else in a 450-line component is not a gate. `readStrippedSource` removes comments
 * first, so the prose above (which names all three classes) cannot satisfy anything below.
 */
import { describe, it, expect } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

interface Toolbar {
  /** Human name used in every failure message. */
  label: string
  path: string
  /** The `?type=` value this page's entry point must point at. */
  typeParam: string
  /** A fragment of the page's own search placeholder, for the anti-vacuity check. */
  searchMarker: string
}

const TOOLBARS: Toolbar[] = [
  {
    label: "organizations/data-table.tsx",
    path: "src/app/organizations/data-table.tsx",
    typeParam: "organizations",
    searchMarker: "Search organizations",
  },
  {
    label: "people/data-table.tsx",
    path: "src/app/people/data-table.tsx",
    typeParam: "people",
    searchMarker: "Search people",
  },
]

/**
 * The toolbar row: the FIRST `<div className="flex flex-wrap …">` inside the component's returned
 * tree, plus its contents up to the matching close.
 *
 * Extracted by brace/tag depth rather than by a line range, because a line range silently drifts
 * the moment anything above the row grows.
 */
function extractToolbarRegion(source: string, label: string): { openingTag: string; body: string } {
  const marker = '<div className="flex flex-wrap'
  const start = source.indexOf(marker)
  if (start === -1) {
    throw new Error(
      `${label}: no wrapping toolbar row found — the row's opening tag does not carry flex-wrap ` +
        `(R-5). A third control on a non-wrapping row is the Phase 45 defect this gate exists for.`
    )
  }

  const tagEnd = source.indexOf(">", start)
  if (tagEnd === -1) throw new Error(`${label}: unterminated toolbar opening tag`)

  const openingTag = source.slice(start, tagEnd + 1)

  // Walk forward counting `<div` / `</div` so a nested cluster cannot close the region early.
  let depth = 1
  let i = tagEnd + 1
  while (i < source.length && depth > 0) {
    if (source.startsWith("<div", i)) {
      depth += 1
      i += 4
      continue
    }
    if (source.startsWith("</div", i)) {
      depth -= 1
      i += 5
      continue
    }
    i += 1
  }
  if (depth !== 0) throw new Error(`${label}: unterminated toolbar row`)

  return { openingTag, body: source.slice(start, i) }
}

/** The body of the `{isAdmin && ( … )}` conditional, by paren depth. */
function extractAdminConditional(region: string): string {
  const marker = "{isAdmin && ("
  const start = region.indexOf(marker)
  if (start === -1) throw new Error("no {isAdmin && (…)} conditional in the toolbar region")

  let depth = 1
  let i = start + marker.length
  const bodyStart = i
  while (i < region.length && depth > 0) {
    const ch = region[i]
    if (ch === "(") depth += 1
    else if (ch === ")") depth -= 1
    i += 1
  }
  if (depth !== 0) throw new Error("unterminated {isAdmin && (…)} conditional")

  return region.slice(bodyStart, i - 1)
}

describe.each(TOOLBARS)("$label — the L-10 toolbar", (toolbar) => {
  /*
   * Read and extracted INSIDE each test, not at suite scope.
   *
   * At suite scope a missing `flex-wrap` throws during collection, which reports as a whole-file
   * error with no test name and no indication of WHICH of the two toolbars regressed. That is a
   * worse gate than a failing assertion: the point of this file is to tell a future reader which
   * page they broke. `readStrippedSource` is cheap and both files are small.
   */
  const read = () => {
    const source = readStrippedSource(toolbar.path)
    const region = extractToolbarRegion(source, toolbar.label)
    return { source, ...region }
  }

  it(`${toolbar.label}: the toolbar row wraps and gaps (R-5)`, () => {
    const { openingTag } = read()
    // Asserted on the OPENING TAG, not on the file: `flex-wrap` elsewhere in a 450-line component
    // says nothing about this row.
    expect(openingTag).toContain("flex-wrap")
    expect(openingTag).toContain("gap-2")
    expect(openingTag).toContain("justify-between")
  })

  it(`${toolbar.label}: the search cluster carries min-w-0 (R-4)`, () => {
    const { body } = read()
    // `min-width: auto` is the default that refuses to shrink, and it is the mechanism behind every
    // overflow Phase 45 measured. Scoped to the region so the class has to be on this row.
    expect(body).toContain("min-w-0")
    expect(body).toContain("flex-1")
  })

  it(`${toolbar.label}: the toolbar region is non-empty and still holds its search input`, () => {
    const { body } = read()
    // ANTI-VACUITY. Without this, deleting the whole row would satisfy nothing above by accident
    // and satisfy the class assertions by making them unreachable — the extractor would throw, but
    // a future refactor that keeps an empty wrapping div would not.
    expect(body.length).toBeGreaterThan(200)
    expect(body).toContain("<Input")
    expect(body).toContain(toolbar.searchMarker)
    expect(body).toContain("<Button")
  })

  it(`${toolbar.label}: dedup.findDuplicates appears EXACTLY once`, () => {
    const { source } = read()
    // The 45-09 counting precedent: a duplicated control is how two copies of the same button
    // silently drift apart, and one of them stops being maintained.
    const occurrences = source.split("findDuplicates").length - 1
    expect(occurrences).toBe(1)
  })

  it(`${toolbar.label}: the /duplicates href appears exactly once, with type=${toolbar.typeParam}`, () => {
    const { source } = read()
    const hrefs = source.split("/duplicates?type=").length - 1
    expect(hrefs).toBe(1)
    expect(source).toContain(`/duplicates?type=${toolbar.typeParam}`)
  })

  it(`${toolbar.label}: the entry point is INSIDE the admin conditional (T-39-01)`, () => {
    const { body } = read()
    const conditional = extractAdminConditional(body)
    expect(conditional).toContain("findDuplicates")
    expect(conditional).toContain(`/duplicates?type=${toolbar.typeParam}`)
    // Outline, per L-10: the primary "Add …" action on this row keeps the solid variant.
    expect(conditional).toContain('variant="outline"')
  })

  it(`${toolbar.label}: the admin flag arrives as a prop, never from auth() in a client file`, () => {
    const { source } = read()
    expect(source).not.toContain("auth()")
    expect(source).toContain("isAdmin")
  })
})
