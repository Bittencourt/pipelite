/**
 * THE MERGE SCREEN'S LAYOUT AND WIRING CONTRACT, READ OUT OF THE SOURCE.
 *
 * Four of the rules this file gates are ABSENCES, and an absence is the one kind of rule a type
 * checker cannot hold and a unit test cannot render: this repo has no jsdom (39-VALIDATION V-7), so
 * nothing here mounts a component. What it asserts is that the merge screen's SHAPE is the one
 * 39-UI-SPEC settled on, because each of those shapes was chosen over a specific alternative that
 * would have failed in a specific measured way:
 *
 *   R-3 — no unprefixed two-column grid, no `<table>`. The resolved discretion item: a stacked
 *         per-field option list, never a side-by-side comparison of two records. At 320px this app
 *         has 241px of usable width, which gives each of two columns about 112px; and column
 *         headers scroll away, which hurts at 1920px too.
 *   M-9 — the submit row is pinned to nothing. Phase 45's D-45-02 is an OPEN UAT item about a bar
 *         attached to the viewport occluding content, and a second one would compound it.
 *   M-7 — the confirmation has no trigger component. Radix's `SlotClone` renders `null` for an
 *         `asChild` child that crossed the RSC boundary, silently (CFUI-01).
 *   M-5 — nothing in the picker is cut short. A truncated website makes the choice unmakeable.
 *   M-4 — one resolver for a field's name, so the picker and the timeline entry that records the
 *         merge use the same word. One is the receipt for the other.
 *
 * EVERY READ IS COMMENT-STRIPPED (`readStrippedSource`). The prose above and in both source files
 * names several of the forbidden tokens, and a gate a comment can satisfy is not a gate (K-6).
 *
 * EVERY NEGATIVE ASSERTION HAS AN ANTI-VACUITY PARTNER. "No unprefixed two-column grid" is
 * satisfied by deleting the grid; "nothing pinned in the submit row" is satisfied by deleting the
 * submit row. Each pair below asserts the thing is there AND that it has the required shape.
 */
import { describe, expect, it } from "vitest"

import { callArguments, readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const FORM_PATH = "src/app/duplicates/[pairId]/merge-form.tsx"
const PAGE_PATH = "src/app/duplicates/[pairId]/page.tsx"

const formSource = readStrippedSource(FORM_PATH)
const pageSource = readStrippedSource(PAGE_PATH)

const SOURCES = [
  { path: FORM_PATH, source: formSource },
  { path: PAGE_PATH, source: pageSource },
] as const

/** Every occurrence of `needle`, as a count. */
function count(source: string, needle: string): number {
  return source.split(needle).length - 1
}

/**
 * The characters immediately before every `grid-cols-2` in `source`.
 *
 * A REGEX THAT CAPTURES THE PREFIX, not a substring count: `expect(source).not.toContain(
 * "grid-cols-2")` would fail on the permitted `sm:grid-cols-2`, and a count comparison would pass
 * the day somebody added one of each. The prefix run stops at whitespace, so a class earlier in the
 * same attribute cannot be mistaken for a breakpoint.
 */
function gridColsPrefixes(source: string): string[] {
  const prefixes: string[] = []
  const pattern = /(\S{0,4})grid-cols-2/g

  for (;;) {
    const match = pattern.exec(source)
    if (match === null) break
    prefixes.push(match[1] ?? "")
  }

  return prefixes
}

/**
 * The text between `from` and the first `to` after it, or `null`.
 *
 * Used to scope a negative assertion to the region it is about (the 45-06 precedent:
 * `deleted-at-wiring.test.ts` brace-matches a branch so its negative cannot be answered by
 * unrelated code elsewhere in the file). Both delimiters are asserted present by the callers, so a
 * rename produces a failure rather than an empty region that passes everything.
 */
function regionBetween(source: string, from: string, to: string): string | null {
  const start = source.indexOf(from)
  if (start === -1) return null

  const end = source.indexOf(to, start + from.length)
  if (end === -1) return null

  return source.slice(start, end + to.length)
}

/**
 * The `<Card>`…`</Card>` that holds the submit row.
 *
 * Located FROM the submit key rather than from a position in the file, so reordering the sections
 * cannot silently move this gate onto a different card.
 */
function submitRowRegion(source: string): string | null {
  const anchor = source.indexOf('merge.submit")')
  if (anchor === -1) return null

  const start = source.lastIndexOf("<Card>", anchor)
  const end = source.indexOf("</Card>", anchor)
  if (start === -1 || end === -1) return null

  return source.slice(start, end + "</Card>".length)
}

/**
 * Every `useEffect(` argument list in `source`.
 *
 * `callArguments` is string-aware, so a paren inside a string literal cannot close the list early.
 * The merge form has no effects at all, which is asserted DIRECTLY below rather than left to a loop
 * over an empty list — a per-body assertion that never runs is not evidence of anything.
 */
function effectArguments(source: string): string[] {
  return callArguments(source, "useEffect")
}

describe("R-3: nothing puts two records side by side below sm", () => {
  for (const { path, source } of SOURCES) {
    it(`${path} has no unprefixed two-column grid`, () => {
      const unprefixed = gridColsPrefixes(source).filter(
        (prefix) => !/(sm|md|lg|xl|2xl):$/.test(prefix)
      )

      expect(
        unprefixed,
        `${path}: a two-column grid with no breakpoint prefix would put two values side by side ` +
          `at 320px, where each column is about 112px wide. 39-UI-SPEC M-1 rejects side-by-side ` +
          `columns outright; the permitted form is one FIELD's two options at sm and up.`
      ).toEqual([])
    })

    it(`${path} renders no table`, () => {
      // A table whose columns are "record A" and "record B" is the same defect wearing different
      // markup, and R-3 names it explicitly.
      expect(count(source, "<table"), `${path} renders a <table`).toBe(0)
    })
  }

  it("the permitted sm-prefixed two-up IS present, so the assertions above are not vacuous", () => {
    // Without this, deleting every grid from the form would satisfy every assertion above.
    expect(count(formSource, "sm:grid-cols-2")).toBeGreaterThan(0)
  })
})

describe("M-9: the submit row is not pinned to the viewport", () => {
  const region = submitRowRegion(formSource)

  it("the submit row region is locatable and holds the submit control", () => {
    // Anti-vacuity for both assertions below: deleting the submit row would otherwise pass them.
    expect(region, `${FORM_PATH}: could not locate the submit row`).not.toBeNull()
    expect(region ?? "").toContain('merge.submit")')
    expect((region ?? "").length).toBeGreaterThan(0)
  })

  it("the submit row is attached to nothing", () => {
    const scoped = region ?? ""

    for (const forbidden of ["sticky", "fixed"]) {
      expect(
        count(scoped, forbidden),
        `${FORM_PATH}: the submit row uses "${forbidden}". Phase 45's D-45-02 is an OPEN UAT ` +
          `item about a bar attached to the viewport occluding content at 1280px and at 320px in ` +
          `es-ES; adding a second one while that is unresolved would compound a live defect (M-9).`
      ).toBe(0)
    }
  })
})

describe("M-7: the confirmation has no trigger component", () => {
  it("declares no AlertDialogTrigger", () => {
    expect(
      count(formSource, "AlertDialogTrigger"),
      `${FORM_PATH}: an asChild trigger whose child crossed the RSC boundary renders as null, ` +
        `silently — the CFUI-01 defect. The dialog is controlled by state instead.`
    ).toBe(0)
  })

  it("still has a dialog to confirm with", () => {
    // Anti-vacuity: removing the whole dialog would satisfy the assertion above.
    expect(count(formSource, "AlertDialogAction")).toBeGreaterThan(0)
    expect(count(formSource, "AlertDialogCancel")).toBeGreaterThan(0)
  })

  it('spends variant="destructive" on exactly two things, both of them read', () => {
    /*
     * TWO, and each one inspected rather than counted blind:
     *
     *   1. the dialog's confirm action — a merge's consequence is a record leaving every list and
     *      landing in Trash, which is what the bulk delete, the single delete and the purge all
     *      look like (C-2);
     *   2. the gone-state Alert — M-8's "one of these records is no longer available".
     *
     * Anything else on this screen wearing the destructive colour would be spending the surface's
     * strongest signal on something that is not destroying data.
     */
    expect(count(formSource, 'variant="destructive"')).toBe(2)

    const dialogAction = regionBetween(formSource, "<AlertDialogAction", ">")
    expect(dialogAction ?? "").toContain('variant="destructive"')

    const goneAlert = regionBetween(formSource, "<Alert variant=", "</Alert>")
    expect(goneAlert ?? "").toContain('variant="destructive"')
    expect(goneAlert ?? "").toContain('merge.gone")')
  })
})

describe("M-5: no value in the picker is cut short", () => {
  for (const forbidden of ["truncate", "line-clamp"]) {
    it(`the form uses no ${forbidden}`, () => {
      expect(
        count(formSource, forbidden),
        `${FORM_PATH}: a value the user is choosing BETWEEN must be readable whole — a shortened ` +
          `website makes the choice unmakeable (M-5, § Typography).`
      ).toBe(0)
    })
  }

  it("an empty side renders the word for emptiness, inside the option card", () => {
    const optionCard = regionBetween(formSource, "function OptionCard(", "function FieldRow(")

    expect(optionCard, `${FORM_PATH}: could not locate the option card`).not.toBeNull()
    expect(
      optionCard ?? "",
      `${FORM_PATH}: a blank option looks unclickable and is indistinguishable from a render bug, ` +
        `and choosing emptiness is a legitimate answer (M-5).`
    ).toContain('value.empty")')
    // The wrapping class pair that makes it read as an absence rather than as typed text.
    expect(optionCard ?? "").toContain("italic")
  })

  it("values wrap rather than overflow", () => {
    expect(count(formSource, "break-words")).toBeGreaterThan(0)
    // R-4: a flex or grid child's default `min-width: auto` is the mechanism behind every overflow
    // Phase 45 measured, and it is what stops a long unbroken value from wrapping at all.
    expect(count(formSource, "min-w-0")).toBeGreaterThan(0)
  })
})

describe("M-4: one resolver for a field's name", () => {
  it("the form holds no field-label map of its own", () => {
    expect(
      count(formSource, "AUDIT_FIELD_LABELS"),
      `${FORM_PATH}: a second field-label map is what makes a user be asked about "Site" and then ` +
        `told about "Website". The label arrives resolved from the server (M-4).`
    ).toBe(0)
  })

  it("the form spells no native field-label key", () => {
    // Built rather than written out, because this file's own header would otherwise satisfy the
    // assertion it is describing — the grep trap this phase hit four times.
    const nativeLabelKeyPrefix = "audit." + "field."

    expect(count(formSource, nativeLabelKeyPrefix)).toBe(0)
  })

  it("the label the form renders is the one the server resolved", () => {
    // Anti-vacuity for both assertions above: they would also pass if the form rendered no labels.
    expect(count(formSource, "field.label")).toBeGreaterThan(0)
  })
})

describe("the server owns the field set and the defaults", () => {
  it("page.tsx builds the groups and the defaults, from one call site each", () => {
    // Call SITES, not lines: `grep -c` would also count the import statement, and both functions
    // are deliberately invoked twice from a single site so the two survivor orientations cannot
    // stop agreeing about how an orientation is built.
    expect(callArguments(pageSource, "buildMergeFieldGroups")).toHaveLength(1)
    expect(callArguments(pageSource, "resolveMergeDefaults")).toHaveLength(1)
  })

  it("the client component computes neither", () => {
    expect(
      count(formSource, "buildMergeFieldGroups"),
      `${FORM_PATH}: the comparable field set is the server's decision. A client that computed it ` +
        `would be the client deciding which keys a merge may write (T-39-04).`
    ).toBe(0)
    expect(count(formSource, "resolveMergeDefaults")).toBe(0)
  })

  it("the form receives both orientations and chooses between them", () => {
    // Anti-vacuity: the two absences above would also hold in a form that partitioned nothing at
    // all. This is the mechanism that replaces the client-side recomputation.
    expect(count(formSource, "orientations")).toBeGreaterThan(0)
    expect(count(pageSource, "buildOrientation(")).toBeGreaterThan(1)
  })
})

describe("no state is written from an effect", () => {
  it("the form declares no effects at all", () => {
    /*
     * ASSERTED DIRECTLY, because the per-body loop below runs zero times and a loop that never
     * executes proves nothing. The survivor toggle recomputes every field default in its CHANGE
     * HANDLER: `react-hooks/set-state-in-effect` is an error in this repo, and an effect would also
     * be the wrong mechanism — this is the consequence of one event, not a synchronisation of two
     * states.
     */
    expect(count(formSource, "useEffect")).toBe(0)
    expect(effectArguments(formSource)).toHaveLength(0)
  })

  for (const [index, body] of effectArguments(formSource).entries()) {
    it(`effect ${index} writes no state`, () => {
      expect(body).not.toMatch(/\bset[A-Z]\w*\(/)
    })
  }
})

describe("the page renders a refusal or a form, never both", () => {
  it("the refusal contains no form", () => {
    const goneState = regionBetween(pageSource, "const goneState = (", "if (pairId === null)")

    expect(goneState, `${PAGE_PATH}: could not locate the refusal`).not.toBeNull()
    expect(
      goneState ?? "",
      `${PAGE_PATH}: the M-8 refusal must render no form — there is nothing to merge.`
    ).not.toContain("<MergeForm")
    expect(goneState ?? "").toContain('merge.gone")')
    expect(goneState ?? "").toContain('merge.backToList")')
  })

  it("the other branch does render the form", () => {
    // Anti-vacuity: a page that rendered no form anywhere would satisfy the assertion above.
    expect(count(pageSource, "<MergeForm")).toBe(1)
  })

  it("both refusal paths return it", () => {
    // A malformed id and a pair with nothing to merge. Two returns, one rendering: telling them
    // apart would say more about the database than this screen has any reason to.
    expect(count(pageSource, "return goneState")).toBe(2)
  })
})

describe("the route's authorization", () => {
  it("the page adds no role check of its own", () => {
    /*
     * `layout.tsx` is the authority for the whole subtree and renders for every nested route, this
     * one included. The check being absent HERE is the design; the check being present in
     * `./actions.ts` is what covers the half a layout cannot reach, and that is asserted below.
     */
    expect(count(pageSource, 'role !== "admin"')).toBe(0)
  })

  it("the merge action re-checks the role itself", () => {
    const actionsSource = readStrippedSource("src/app/duplicates/[pairId]/actions.ts")

    expect(
      count(actionsSource, 'role !== "admin"'),
      `a server action is a POST endpoint the browser can invoke with no page render involved, so ` +
        `no layout redirect can protect it (T-39-01).`
    ).toBe(1)

    // And the order: session, role, then everything else. `runWithActor` opens LAST, so a refused
    // call establishes no actor at all (T-36-02).
    const authAt = actionsSource.indexOf("auth()")
    const adminAt = actionsSource.indexOf('role !== "admin"')
    const actorAt = actionsSource.indexOf("runWithActor(")
    const membershipAt = actionsSource.indexOf("membersMatch")

    expect(authAt).toBeGreaterThan(-1)
    expect(adminAt).toBeGreaterThan(authAt)
    expect(membershipAt).toBeGreaterThan(adminAt)
    expect(actorAt).toBeGreaterThan(membershipAt)
  })

  it("the merge action re-validates pair membership independently of the mutation", () => {
    const actionsSource = readStrippedSource("src/app/duplicates/[pairId]/actions.ts")

    // The pair row is re-read here and the two ids are checked against it. `mergeRecordsMutation`
    // checks the same thing again, deliberately: this layer covers a crafted POST, the other covers
    // a future call site that never passes through this file (T-39-02, V-9).
    expect(count(actionsSource, "duplicatePairs.recordAId")).toBeGreaterThan(0)
    expect(actionsSource).toContain("survivorId !== loserId")
    expect(actionsSource).toContain("members.includes(survivorId)")
    expect(actionsSource).toContain("members.includes(loserId)")
  })

  it("the entity type is read from the pair, never taken from the caller", () => {
    const actionsSource = readStrippedSource("src/app/duplicates/[pairId]/actions.ts")

    // A caller-supplied entity type would point the merge's reads and writes at the wrong table.
    expect(actionsSource).toContain("entityType: pair.entityType")
    expect(count(actionsSource, "input?.entityType")).toBe(0)
  })

  it("a tampered pair and a stale screen get the same answer", () => {
    const actionsSource = readStrippedSource("src/app/duplicates/[pairId]/actions.ts")

    /*
     * T-39-37. `NOT_FOUND`, `SAME_RECORD` and `NOT_IN_PAIR` are three facts to the mutation and
     * must be ONE fact to the browser: a response that could tell "that pair does not contain that
     * id" apart from "one of these records is deleted" is an oracle for probing which id was wrong.
     * The mapping is written as a single test against `FAILED`, so the other three cannot diverge
     * without this assertion changing.
     */
    expect(actionsSource).toContain('result.error === "FAILED" ? "FAILED" : "PAIR_GONE"')
    expect(count(actionsSource, '"NOT_IN_PAIR"')).toBe(0)
    expect(count(actionsSource, '"NOT_FOUND"')).toBe(0)
  })
})

describe("every string the merge screen shows comes from the catalog", () => {
  for (const { path, source } of SOURCES) {
    it(`${path} renders no hardcoded sentence`, () => {
      /*
       * The same scan plan 39-11 recorded over its own files: a JSX text child that starts with a
       * capital and continues in lower case is English prose in the source. It cannot catch every
       * literal, which is why the plan also requires each string in these files to be read by hand
       * — recorded in the summary — but it does catch the common regression.
       */
      const matches = source.match(/>[A-Z][a-z]+ [a-z]/g) ?? []

      expect(matches, `${path} appears to render a hardcoded sentence`).toEqual([])
    })
  }

  it("the form resolves its strings through the catalog", () => {
    // Anti-vacuity: a file that rendered nothing would pass the scan above.
    expect(count(formSource, "useTranslations(")).toBeGreaterThan(0)
    expect(count(formSource, 't("merge.')).toBeGreaterThan(0)
  })
})
