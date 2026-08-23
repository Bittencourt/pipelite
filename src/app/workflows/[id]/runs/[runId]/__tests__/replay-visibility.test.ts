/**
 * G-6 — THE REPLAY CONTROL IS ABSENT ON A NON-FAILED RUN, NOT DISABLED. Plus the three container
 * and ordering claims plan 41-13 makes about the same header.
 *
 * WHAT THIS TEST IS NOT, AND IT MATTERS MORE THAN USUAL HERE:
 *
 *   - IT RENDERS NOTHING. It mounts no component, opens no browser, sets no viewport and reads no
 *     computed style. It is a STATIC read of `page.tsx`'s source with comments stripped.
 *   - IT MEASURES NOTHING. Every width in the comments below came from a measurement someone else
 *     took (UI-SPEC § Responsive: 241px of content on a `container` page at a 305px client width);
 *     nothing here reproduces one.
 *   - It can only see rules expressed as class TOKENS and JSX SHAPE. A layout broken by something
 *     other than a class string, or a visibility rule expressed in CSS, is invisible to it.
 *
 * WHY THIS FORM RATHER THAN A RENDER TEST. UI-SPEC's G-6 asks for a component test — render with
 * `status: "completed"`, assert no `replay.action` in the tree. That is unimplementable in this
 * repo, and not for want of trying (41-RESEARCH C-1): there is no `@testing-library/react`, no
 * `jsdom`, no `happy-dom` and no `@vitejs/plugin-react` in the dependency tree, `vitest.config.ts`
 * sets `environment: "node"` globally, no file under `src/` carries a `@vitest-environment` pragma,
 * and there are zero React render tests to copy. Adding a DOM environment for one assertion is a
 * dependency decision, not a plan-level one. So the gate is reshaped onto this repo's
 * `enclosingConditional` source-scan idiom, which asserts the SAME claim — the control's render is
 * gated on exactly `run.status === "failed"` and carries no `disabled` — one layer lower down.
 *
 * THAT RESHAPING CONSTRAINS THE IMPLEMENTATION, AND THE CONSTRAINT IS LOAD-BEARING.
 * `enclosingConditional` (`source-scan.ts:284-330`) understands exactly one shape, `{<test> && ( …
 * )}`, and THROWS on a ternary, on an extracted `const replayControl = …`, or on an early return.
 * A throw out of a helper reads as a broken TEST rather than a broken implementation, which is why
 * every call below goes through `conditional()` — it converts the throw into a failure message that
 * names the three shapes. The render site must be written literally
 * `{run.status === "failed" && ( … )}`. Relatedly, `src/lib/workflows/replay.ts` deliberately
 * exports NO constant for the `"failed"` literal: a `REPLAYABLE_RUN_STATUS` would make this scan
 * permanently unsatisfiable. It looks like an oversight and it is a decision.
 *
 * ANTI-VACUITY. Every negative assertion below is preceded by a positive one proving the source was
 * actually read and is actually this page — the phase-39 defect class, where a gate went green
 * because `readFileSync` had been pointed at a moved file. `readStrippedSource` is used everywhere
 * rather than `readFileSync` for the other half of that: this file's own prose names every
 * identifier it asserts, so an un-stripped read would let a COMMENT satisfy the gate.
 */
import { describe, expect, it } from "vitest"

import {
  enclosingConditional,
  readStrippedSource,
} from "@/components/custom-fields/__tests__/source-scan"

const PAGE = "src/app/workflows/[id]/runs/[runId]/page.tsx"

const read = () => readStrippedSource(PAGE)

/**
 * The exact conditional test the replay render site must carry, compared VERBATIM below.
 *
 * `enclosingConditional` returns everything between the opening `{` and the `&& (`, so the raw
 * value carries a trailing space from `{run.status === "failed" && (`. It is trimmed before the
 * comparison and nothing else about it is normalised — the point of the assertion is that the
 * expression is this and only this.
 */
const REPLAY_GUARD = 'run.status === "failed"'

/*
 * R-1 and R-2's class strings, asserted HERE and not only in plan 41-15's cross-file gate: this is
 * the plan that CHANGES them, and a plan should be able to prove its own claim.
 *
 * UI-SPEC quotes R-1 at `page.tsx:145` and R-2 at `:152`; both drifted by three lines (41-RESEARCH
 * C-3) and the real sites are `:148` and `:154`. Every CLASS STRING it quotes is correct, which is
 * why these are keyed on the string and never on the line number.
 */
const R1_ROW = 'className="flex flex-wrap items-center justify-between gap-3"'
const R1_OLD = 'className="flex items-center gap-3"'
const R2_ROW = 'className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground"'
const R2_OLD = 'className="flex items-center gap-4 text-sm text-muted-foreground"'

/** UI-SPEC's reason, quoted so a failure explains itself rather than pointing at a line. */
const ABSENT_NOT_DISABLED =
  `Not disabled — absent. A disabled button on every completed run is noise on a page that has ` +
  `no other action. UI-SPEC § Interaction Contract 1, from 41-CONTEXT: "Cancelled and completed ` +
  `runs get no replay control."`

/** The three shapes that make `enclosingConditional` throw, named so the failure is legible. */
const SHAPE = (marker: string, thrown: string | null) =>
  `${PAGE}: could not extract the {… && ( … )} conditional around ${marker} — the helper threw ` +
  `"${thrown}". This is a failure of the IMPLEMENTATION'S SHAPE, not of the helper. ` +
  `enclosingConditional understands one form and throws on three others: a TERNARY ` +
  `(cond ? <X/> : null), an EXTRACTED CONST (const control = …; then {control}), and an EARLY ` +
  `RETURN. Write the render site literally as {${REPLAY_GUARD} && ( … )}. See ` +
  `source-scan.ts:284-330 and 41-RESEARCH C-1.`

/**
 * `enclosingConditional`, with its throw converted into a legible assertion failure.
 *
 * Without this wrapper a shape violation surfaces as an opaque helper error at collection time and
 * the next reader goes looking for a bug in the gate.
 */
function conditional(source: string, marker: string): { test: string; body: string } {
  let result: { test: string; body: string } | null = null
  let thrown: string | null = null

  try {
    result = enclosingConditional(source, marker, PAGE)
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error)
  }

  expect(thrown, SHAPE(marker, thrown)).toBeNull()

  // Unreachable once the assertion above holds; narrows the type for every caller.
  return result as { test: string; body: string }
}

describe("run detail page — the replay control's visibility and the header's containers", () => {
  it("0. anti-vacuity: the source is this page, read and stripped", () => {
    const source = read()

    expect(source.length).toBeGreaterThan(0)
    // Named so a moved or renamed page fails HERE rather than turning every negative below green.
    expect(source).toContain("RunDetailPage")
    expect(source).toContain("workflowRuns")
  })

  it("1. G-6 first half: the control renders on exactly and only a failed run", () => {
    const source = read()
    const replay = conditional(source, "<ReplayRunButton")

    /*
     * VERBATIM with `toBe`, not `toContain`. An OR-ed second clause —
     * `run.status === "failed" || isAdmin` — is exactly the loop a `toContain` permits, and it
     * would render a replay button that `replayWorkflowRun` then refuses (T-41-75). The same
     * lesson is recorded at `views-page-wiring.test.ts:132-138`. Only whitespace is normalised.
     */
    expect(
      replay.test.trim(),
      `${PAGE}: the replay control's render must be gated on exactly ${REPLAY_GUARD} (G-6, ` +
        `T-41-75). Its test is: ${replay.test.trim()}`
    ).toBe(REPLAY_GUARD)

    // Anti-vacuity on the extraction: an empty branch would satisfy the test above and render
    // nothing at all.
    expect(replay.body).toContain("<ReplayRunButton")
  })

  it("2. G-6 second half: the control is absent on a non-failed run, never disabled", () => {
    const source = read()

    expect(source).toContain("RunDetailPage")
    expect(source).toContain("<ReplayRunButton")

    expect(
      source,
      `${PAGE}: <ReplayRunButton carries a disabled prop. ${ABSENT_NOT_DISABLED}`
    ).not.toMatch(/<ReplayRunButton[^>]*disabled/)
  })

  it("3. the lineage line renders only when replayedFromRunId is set", () => {
    const source = read()
    const lineage = conditional(source, "replay.lineage")

    expect(
      lineage.test,
      `${PAGE}: the lineage line must render only when the origin column is set — a run that is ` +
        `not a replay has no origin to link. Its test is: ${lineage.test.trim()}`
    ).toContain("replayedFromRunId")
  })

  it("4. V-41-1: the lineage line is TERTIARY — below the title cluster, never beside the title", () => {
    const source = read()

    const metadataRowAt = source.indexOf(R2_ROW)
    const lineageAt = source.indexOf("replay.lineage")

    /*
     * BOTH OFFSETS ASSERTED PRESENT FIRST. Written as a bare `toBeGreaterThan` this row passes
     * VACUOUSLY while either is missing, because `indexOf` returns -1 and every real offset is
     * greater than -1 — the trap measured on a real RED run at `views-page-wiring.test.ts:161-174`.
     */
    expect(metadataRowAt).toBeGreaterThan(-1)
    expect(lineageAt).toBeGreaterThan(-1)

    expect(
      lineageAt,
      `${PAGE}: the lineage line must sit inside the metadata row BELOW the title cluster, not ` +
        `beside the <h1> (UI-SPEC V-41-1). The run title + RunStatusBadge cluster is the primary ` +
        `anchor and this phase must not disturb it; lineage is metadata typography.`
    ).toBeGreaterThan(metadataRowAt)
  })

  it("5. the dry-run badge renders only for a dry run, and BESIDE the status badge", () => {
    const source = read()
    const dryRun = conditional(source, "<DryRunBadge")

    expect(
      dryRun.test,
      `${PAGE}: the dry-run badge must render only when the run is a dry run. Its test is: ` +
        `${dryRun.test.trim()}`
    ).toContain("dryRun")

    const statusAt = source.indexOf("<RunStatusBadge")
    const badgeAt = source.indexOf("<DryRunBadge")

    expect(statusAt).toBeGreaterThan(-1)
    expect(badgeAt).toBeGreaterThan(-1)

    expect(
      statusAt,
      `${PAGE}: RunStatusBadge must come BEFORE DryRunBadge. Dry-run-ness is an ORTHOGONAL ` +
        `dimension to status (dry-run-badge.tsx:24-28) — the dashed badge sits beside the status, ` +
        `never instead of it, and a failed test run is the most interesting row on the page.`
    ).toBeLessThan(badgeAt)
  })

  it("6. R-1: the header row wraps and is two clusters, and the old non-wrapping row is gone", () => {
    const source = read()

    expect(source).toContain("RunDetailPage")

    expect(
      source,
      `${PAGE}: R-1 — the header row must be ${R1_ROW}. It gains a third item (DryRunBadge) and a ` +
        `fourth (the replay button); four items in a non-wrapping 241px row overflow with ` +
        `certainty, and the item pushed off is the status badge the operator came to read ` +
        `(T-41-79). justify-between + flex-wrap is the pattern run-changed-records.tsx:119 uses.`
    ).toContain(R1_ROW)

    /*
     * THE NEGATIVE MATTERS AS MUCH AS THE POSITIVE: a wrapper added AROUND the untouched old row
     * satisfies the positive while leaving the overflow exactly where it was.
     */
    expect(
      source,
      `${PAGE}: R-1 — the old non-wrapping header row ${R1_OLD} is still present. Adding the new ` +
        `wrapper around it does not fix the overflow; the row itself must be restructured.`
    ).not.toContain(R1_OLD)
  })

  it("7. R-2: the metadata row wraps, and the old non-wrapping row is gone", () => {
    const source = read()

    expect(source).toContain("RunDetailPage")

    expect(
      source,
      `${PAGE}: R-2 — the metadata row must be ${R2_ROW}. It gains a third item (the lineage ` +
        `line) and its two existing items already measure close to 241px in es-ES. This is the ` +
        `exact defect fixed in commit c082430 — "wrap the activities stats row".`
    ).toContain(R2_ROW)

    expect(
      source,
      `${PAGE}: R-2 — the old non-wrapping metadata row ${R2_OLD} is still present.`
    ).not.toContain(R2_OLD)
  })

  it("8. non-regression: the failed-node panel, the step list and the changed-records panel survive", () => {
    const source = read()

    expect(source).toContain("RunDetailPage")

    // The pre-existing failed-node conditional, verbatim. A header refactor that folded the two
    // `run.status === "failed"` tests into one would silence the "Failed at:" panel.
    expect(source).toContain('{run.status === "failed" && run.currentNodeId && (')

    // The changed-records panel is criterion 2's only proof and must not be disturbed by a header
    // refactor.
    expect(source).toContain("<RunStepList")
    expect(source).toContain("<RunChangedRecords")
  })

  it("9. C-41-1: no palette utility was added to this page", () => {
    const source = read()

    expect(source).toContain("RunDetailPage")

    /*
     * The page already contains `bg-destructive/10` and `text-destructive`. Those are semantic
     * TOKENS, not palette utilities, and they stay — the regex below deliberately does not see
     * them. What it does see is a hardcoded hue-plus-shade pair, of which this directory already
     * has six and this phase adds none.
     */
    expect(
      source,
      `${PAGE}: a hardcoded palette utility was added. UI-SPEC C-41-1: the code this phase adds ` +
        `introduces no new palette colour. Use a semantic token.`
    ).not.toMatch(/-(red|green|emerald|blue|amber|violet|rose)-[0-9]/)
  })
})
