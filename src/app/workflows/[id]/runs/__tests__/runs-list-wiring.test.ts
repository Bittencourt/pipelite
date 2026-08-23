/**
 * THE RUNS-LIST DRY-RUN WIRING GATE (plan 41-10) — a source read over five files.
 *
 * WHAT IT PROVES, and none of it is cosmetic:
 *
 *   1. G-8 / T-41-58 — `dry-run-badge.tsx` NEVER gains a client directive. It renders only `Badge`
 *      with a plain string child, so no React element crosses the RSC boundary into a Radix slot
 *      (the T-36-32 defect class, gated repo-wide by CFUI-01 and stated verbatim in this same tree
 *      at `runs/[runId]/components/run-changed-records.tsx:4-7`).
 *   2. C-41-2 — the badge is `variant="outline"` + `border-dashed`, not a colour. `variant="secondary"`
 *      is taken by `pending`, and a new palette pair would be the seventh in a directory that
 *      already ships six (C-41-1).
 *   3. T-41-54 — dry runs are hidden by a SQL predicate in a NEGATED conditional, so the DEFAULT
 *      branch (no param at all) is the one that hides them. An inverted condition would reveal test
 *      runs by default, which is exactly what CONTEXT forbids.
 *   4. T-41-55 — ONE `whereClause` feeds both the rows query and the `count()`, or the page shows
 *      "1-20 of 340" over 12 rows.
 *   5. The URL contract is IMPORTED, not retyped. `SHOW_DRY_RUNS_PARAM` / `SHOW_DRY_RUNS_VALUE` and
 *      `parseRunsSearchParams` live in `src/lib/workflows/runs-filter.ts`; a second copy of the
 *      whitelist or of the `"dryRun"` literal is the T-37-03 defect class this extraction removed.
 *   6. T-41-59 — a shown test run carries the badge beside its status badge, and no test run reaches
 *      the workflow overview's Recent Runs at all.
 *
 * `readStrippedSource` runs first, so the prose above — which names every identifier below — cannot
 * satisfy anything. Every negative assertion is preceded by a non-empty read of the file, because a
 * missing file makes every "does not contain" assertion pass vacuously.
 *
 * WHAT THIS TEST IS NOT: it executes no page and touches no database, so it cannot know that a dry
 * run is actually absent from a rendered list. It knows the predicate has the shape that makes it
 * absent, and that the shape's default branch requires no URL param. The behavioural proof is
 * manual, against the container, and recorded in 41-10-SUMMARY.md.
 */
import { describe, expect, it } from "vitest"

import {
  enclosingConditional,
  readStrippedSource,
  tagIndexes,
} from "@/components/custom-fields/__tests__/source-scan"
import { readFileSync } from "node:fs"

const BADGE = "src/app/workflows/[id]/runs/components/dry-run-badge.tsx"
const STATUS_BADGE = "src/app/workflows/[id]/runs/components/run-status-badge.tsx"
const PAGE = "src/app/workflows/[id]/runs/page.tsx"
const FILTER = "src/app/workflows/[id]/runs/components/status-filter.tsx"
const TABLE = "src/app/workflows/[id]/runs/components/runs-table.tsx"
const MINI = "src/app/workflows/[id]/components/recent-runs-mini.tsx"
const STATS = "src/app/workflows/[id]/components/run-stats-card.tsx"

/** The SQL predicate that hides test runs. Both the page and the overview must carry it. */
const HIDE_PREDICATE = "eq(workflowRuns.dryRun, false)"

/**
 * The filter row's R-4 container class, verbatim.
 *
 * Asserted as one exact string rather than as three separate `toContain`s: `flex` without
 * `flex-wrap` is the overflow this rule exists to prevent, and a gate that accepts each token
 * independently accepts a row that has them on different elements.
 */
const R4_ROW = 'className="mb-4 flex flex-wrap items-center gap-2"'

/**
 * The number of `{ value: … }` entries in `status-filter.tsx`'s `statuses` array TODAY, read from
 * the file before this plan's edit: "all" plus the five run statuses.
 *
 * ANTI-VACUITY / the reason this is a named constant: the assertion below is "unchanged", and an
 * "unchanged" assertion against a number nobody wrote down is an assertion against whatever the
 * file happens to say.
 */
const SELECT_OPTIONS_BEFORE = 6

/** The Status cell's stacking container in `runs-table.tsx` — the badge goes INSIDE this. */
const STATUS_CELL_STACK = 'className="flex flex-col gap-1"'

/**
 * `runs-table.tsx`'s column shape TODAY, read from the file before this plan's edit: Status,
 * Duration, Started At, Completed At — four heads, four cells.
 *
 * Named constants for the same anti-vacuity reason as `SELECT_OPTIONS_BEFORE`. Counted with
 * `tagIndexes`, which matches whole tag names, so `<TableHeader` is not five `<TableHead`s.
 */
const TABLE_HEADS_BEFORE = 4
const TABLE_CELLS_BEFORE = 4

/**
 * The number of `className=` occurrences in `recent-runs-mini.tsx` BEFORE this plan's edit, read
 * from the file: five.
 *
 * This is the number that makes D-A7 checkable. The claim is "query-only": the file gains a `where`
 * condition and renders NOTHING new. An unchanged class-attribute count is the cheapest evidence of
 * that, and it is only evidence if the before-number was written down rather than re-read.
 */
const MINI_CLASSNAMES_BEFORE = 5

/** The first non-comment token of a client module — `bulk-dialogs-wiring.test.ts:61`, inverted here. */
const CLIENT_DIRECTIVE = /^\s*(['"])use client\1/

/** Any hardcoded Tailwind palette utility. C-41-1: the new code adds none. */
const PALETTE = /-(red|green|emerald|blue|amber|violet|rose)-[0-9]/

/**
 * Read a file's stripped source AND assert it is non-empty in the same breath.
 *
 * ANTI-VACUITY. Every "does not contain" assertion in this file is only meaningful over a file that
 * exists and has content: `readFileSync` on a missing path throws (which reads as a failure, good),
 * but an EMPTY file would satisfy every negative assertion silently.
 */
function read(path: string): string {
  const source = readStrippedSource(path)

  expect(
    source.trim().length,
    `${path}: the file is empty, so every "does not contain" assertion below would pass vacuously.`
  ).toBeGreaterThan(0)

  return source
}

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

/**
 * Is `marker`'s line preceded — within `window` lines, itself included — by a line matching `test`?
 *
 * WHY LINE PROXIMITY AND NOT `enclosingConditional` HERE. That helper matches the JSX
 * `{… && ( … )}` form; the page's predicate is a plain `if (…) statement`, so the helper would throw
 * on a perfectly correct implementation and the throw would read as a broken test rather than as a
 * broken implementation. `views-page-wiring.test.ts` wrote a local `ifStatement` extractor for the
 * same gap, but it finds the `if` whose TEST contains the marker — here the marker is in the BODY.
 * So: proximity, with the negation and the flag's identity both baked into the regex, which is what
 * the assertion is actually about.
 */
function precededBy(source: string, marker: string, test: RegExp, window: number): boolean {
  const lines = source.split("\n")
  const at = lines.findIndex((line) => line.includes(marker))
  if (at === -1) return false

  return lines.slice(Math.max(0, at - window), at + 1).some((line) => test.test(line))
}

/** The RAW source — no comment stripping. A directive must be the FIRST statement. */
function readRaw(path: string): string {
  const source = readFileSync(path, "utf8")

  expect(
    source.trim().length,
    `${path}: the file is empty, so the client-directive assertion would pass vacuously.`
  ).toBeGreaterThan(0)

  return source
}

describe("dry-run-badge.tsx — the server-safe dashed badge (G-8, C-41-2)", () => {
  it("1. G-8 / T-41-58: the RAW source carries no client directive", () => {
    /*
     * ASSERTED AGAINST THE RAW SOURCE, not the stripped one. A directive is only a directive when it
     * is the first statement in the module, and comment stripping can move the first statement.
     */
    const raw = readRaw(BADGE)

    expect(
      CLIENT_DIRECTIVE.test(raw),
      `${BADGE}: this file must stay a SERVER component. It renders only Badge with a plain string ` +
        `child, so no React element ever crosses the RSC boundary into a Radix slot — the T-36-32 ` +
        `defect class, stated verbatim at runs/[runId]/components/run-changed-records.tsx:4-7 and ` +
        `gated repo-wide by CFUI-01. Adding "use client" here to hang an onClick off the badge ` +
        `breaks that constraint for the whole runs table, which is a server tree.`
    ).toBe(false)
  })

  it("2. C-41-2: outline + border-dashed, translated, and no colour of its own", () => {
    const source = read(BADGE)

    expect(source, `${BADGE}: the badge must be variant="outline" (C-41-2).`).toContain(
      'variant="outline"'
    )
    expect(
      source,
      `${BADGE}: the badge is distinguished by BORDER STYLE, not hue — border-dashed is this app's ` +
        `existing idiom for provisional content (runs-table.tsx renders its empty state in ` +
        `"rounded-lg border border-dashed"), and it survives a monochrome display, which a colour ` +
        `pair does not.`
    ).toContain("border-dashed")

    expect(
      source,
      `${BADGE}: variant="secondary" is already taken by "pending" in run-status-badge.tsx, so a ` +
        `test run and a pending run would be indistinguishable (C-41-2).`
    ).not.toContain('variant="secondary"')

    expect(
      PALETTE.test(source),
      `${BADGE}: zero new palette utilities (C-41-1). run-status-badge.tsx already ships six pairs ` +
        `in this directory; the new code adds none. variant="outline" is border-border/text-foreground, ` +
        `token-only, so it is theme-correct for free.`
    ).toBe(false)

    expect(
      source,
      `${BADGE}: the label must be translated. UI-SPEC § i18n Scope: every string THIS PHASE ` +
        `authors goes through getTranslations, even though the surrounding /workflows tree is ` +
        `English literals. run-changed-records.tsx is the in-tree precedent for the ` +
        `next-intl/server import.`
    ).toContain("getTranslations")
  })

  it("3. the label is a translator call, not a quoted English sentence", () => {
    const source = read(BADGE)

    /*
     * Scoped to JSX TEXT rather than the whole file: an English word inside an import path or a
     * className is not copy. The badge's only child must be `{t(...)}`.
     */
    expect(
      source,
      `${BADGE}: the badge's child must be the translator call, not a literal. UI-SPEC § i18n Scope.`
    ).toMatch(/>\s*\{\s*t\(/)
  })

  it("4. run-status-badge.tsx is NOT extended — dryRun is not a WorkflowStatus", () => {
    const source = read(STATUS_BADGE)

    expect(
      source,
      `${STATUS_BADGE}: its Record<Status, …> map must stay intact and exhaustive-by-type.`
    ).toContain("Record<Status,")

    expect(
      source,
      `${STATUS_BADGE}: dryRun is NOT a WorkflowStatus, and this map is exhaustive-by-type on ` +
        `purpose. Dry-run-ness is an ORTHOGONAL dimension: folding it in as a sixth entry would ` +
        `make "failed" and "test" mutually exclusive, when a failed test run is the most ` +
        `interesting row on the page. The badge lives in its own component and renders BESIDE the ` +
        `status badge, never instead of it.`
    ).not.toContain("dryRun")

    expect(
      source,
      `${STATUS_BADGE}: same rule, snake_case spelling — the column name must not appear here either.`
    ).not.toContain("dry_run")
  })
})

describe("runs/page.tsx — the SQL filter, one whereClause, and the R-4 row", () => {
  it("5. the inline parse was REPLACED by parseRunsSearchParams, not duplicated", () => {
    const source = read(PAGE)

    expect(
      source,
      `${PAGE}: the page must read its params through parseRunsSearchParams from ` +
        `@/lib/workflows/runs-filter. status-filter.tsx WRITES these params and this page READS ` +
        `them; two copies of the vocabulary is the T-37-03 defect class — a toggle that sets a ` +
        `param the query ignores.`
    ).toContain("parseRunsSearchParams")

    expect(
      source,
      `${PAGE}: the local VALID_STATUSES set must be GONE. Leaving it beside the imported parser ` +
        `is two whitelists to keep in sync, which is the exact defect the extraction removed.`
    ).not.toContain("VALID_STATUSES")

    expect(
      source,
      `${PAGE}: the searchParams type must admit ?dryRun= or the reveal param is a type error at ` +
        `the only place it is read.`
    ).toContain("dryRun?: string")
  })

  it("6. T-41-54: the hide predicate lives in a NEGATED conditional, so the DEFAULT hides", () => {
    const source = read(PAGE)

    expect(
      source,
      `${PAGE}: the filter must be in SQL. A client-side filter would still ship dry-run rows to ` +
        `the browser AND would break the pagination count, which is computed from the same predicate.`
    ).toContain(HIDE_PREDICATE)

    /*
     * PROXIMITY, NOT `enclosingConditional` — see `precededBy`'s header for why. The regex carries
     * both halves of what matters: the `!` and the identifier it negates.
     */
    expect(
      precededBy(source, HIDE_PREDICATE, /if\s*\(\s*!\s*showDryRuns\s*\)/, 2),
      `${PAGE}: ${HIDE_PREDICATE} must sit inside "if (!showDryRuns)". The DEFAULT branch — no URL ` +
        `param at all — is the one that has to be unmistakable: 41-CONTEXT locks dry runs as ` +
        `"filtered out of the runs list by default". An inverted condition reveals test runs by ` +
        `default and hides real ones, and both halves of that are silent.`
    ).toBe(true)

    expect(
      source,
      `${PAGE}: the predicate must compare against false, never against NULL. dry_run is ` +
        `NOT NULL DEFAULT false (migration 0019), which is what makes "= false" match every ` +
        `pre-migration row; over a nullable column "NULL = false" is NULL and the list would come ` +
        `back EMPTY.`
    ).not.toContain("isNull(workflowRuns.dryRun)")
  })

  it("7. T-41-55: ONE whereClause feeds both the rows query and the count()", () => {
    const source = read(PAGE)

    expect(
      occurrences(source, "whereClause"),
      `${PAGE}: whereClause must be built once and used twice (assignment + two .where calls). ` +
        `A second, differently-built predicate for the count() shows "1-20 of 340" over 12 rows.`
    ).toBeGreaterThanOrEqual(3)

    expect(
      source,
      `${PAGE}: the total must still come from count() over the same predicate as the rows.`
    ).toContain("count()")
  })

  it("8. R-4: the filter row wraps at 320px", () => {
    const source = read(PAGE)

    expect(
      source,
      `${PAGE}: the filter row must be ${R4_ROW} (UI-SPEC R-4). The container has 241px of content ` +
        `at the 320px gate; the w-[180px] Select fits, and the checkbox+label must be allowed to ` +
        `wrap to a second line rather than push the row wide.`
    ).toContain(R4_ROW)
  })
})

describe("status-filter.tsx — the reveal checkbox (V-41-1)", () => {
  it("9. the toggle is a Checkbox BESIDE the Select, never a sixth SelectItem", () => {
    const source = read(FILTER)

    expect(source, `${FILTER}: the toggle must be a Checkbox.`).toContain("Checkbox")

    expect(
      occurrences(source, "{ value: "),
      `${FILTER}: the statuses array must still have exactly ${SELECT_OPTIONS_BEFORE} entries. ` +
        `Dry-run-ness is ORTHOGONAL to status: folding it into the Select would make "failed" and ` +
        `"test" mutually exclusive, when a failed test run is the most interesting row on the page.`
    ).toBe(SELECT_OPTIONS_BEFORE)

    /*
     * V-41-1: "Show test runs" is a SUBORDINATE MODIFIER of the status filter, so it comes after it
     * in source order and lands on the line below after the 320px wrap. A checkbox that appears
     * before the thing it modifies reads as a page-level control.
     */
    const selectAt = source.indexOf("<Select")
    const checkboxAt = source.indexOf("<Checkbox")

    expect(selectAt, `${FILTER}: no <Select> found — the status filter itself is missing.`).toBeGreaterThan(-1)
    expect(checkboxAt, `${FILTER}: no <Checkbox> found — the reveal toggle is missing.`).toBeGreaterThan(-1)
    expect(
      selectAt,
      `${FILTER}: the Checkbox must come AFTER the Select in source order (V-41-1). It modifies ` +
        `that filter; rendered first it reads as a page-level control, and after a 320px wrap it ` +
        `would sit ABOVE the thing it modifies.`
    ).toBeLessThan(checkboxAt)
  })

  it("10. the toggle resets to page 1, exactly as handleChange does", () => {
    const source = read(FILTER)

    expect(
      occurrences(source, 'params.delete("page")'),
      `${FILTER}: page must be deleted in BOTH handlers — the status Select and the dry-run ` +
        `checkbox. Without it, a user on page 4 of the unfiltered list lands on page 4 of a ` +
        `newly-filtered one, which is usually empty and reads as "there are no test runs".`
    ).toBe(2)
  })

  it("11. the URL contract is IMPORTED from runs-filter.ts, not retyped", () => {
    const source = read(FILTER)

    expect(
      source,
      `${FILTER}: use SHOW_DRY_RUNS_PARAM from @/lib/workflows/runs-filter.`
    ).toContain("SHOW_DRY_RUNS_PARAM")
    expect(
      source,
      `${FILTER}: use SHOW_DRY_RUNS_VALUE from @/lib/workflows/runs-filter. The parser matches the ` +
        `literal "1" STRICTLY — ?dryRun=2 must not reveal anything — so the writer has to set that ` +
        `exact byte.`
    ).toContain("SHOW_DRY_RUNS_VALUE")

    expect(
      source,
      `${FILTER}: the param name must not be retyped as a literal. The two ends of this URL ` +
        `contract cannot be allowed to drift: a re-typed "dryRun" here is a toggle that silently ` +
        `does nothing the day the constant changes.`
    ).not.toContain('"dryRun"')
  })

  it("12. i18n: the new string is translated and the existing English labels are untouched", () => {
    const source = read(FILTER)

    expect(
      source,
      `${FILTER}: the new label goes through useTranslations (UI-SPEC § i18n Scope).`
    ).toContain("useTranslations")
    expect(
      source,
      `${FILTER}: the label is workflows.dryRun.showInList, already shipped in all three locales.`
    ).toContain("showInList")

    expect(
      source,
      `${FILTER}: the EXISTING English status labels are left alone. UI-SPEC § i18n Scope declares ` +
        `the seam: this phase translates only the strings it authors, so a translated ` +
        `"Show test runs" sits beside an English "All statuses". That is the trade, not a bug, and ` +
        `translating the rest of the /workflows tree is unrelated scope.`
    ).toContain("All statuses")
  })
})

describe("runs-table.tsx — the badge beside the status badge (T-41-59)", () => {
  it("13. the badge is rendered ONCE, and only for a dry run", () => {
    const source = read(TABLE)

    expect(source, `${TABLE}: DryRunBadge must be imported.`).toContain("DryRunBadge")
    expect(
      occurrences(source, "<DryRunBadge"),
      `${TABLE}: exactly one render site. Two would double-badge every test run.`
    ).toBe(1)

    /*
     * `enclosingConditional` matches the `{… && ( … )}` JSX form, which is the shape this file
     * already uses twice. It THROWS when the marker is not inside one, and a throw here means the
     * badge is unconditional — so the throw is caught and re-reported as that finding rather than
     * as a broken test.
     */
    let enclosing: { test: string; body: string } | null = null
    try {
      enclosing = enclosingConditional(source, "<DryRunBadge", TABLE)
    } catch {
      enclosing = null
    }

    expect(
      enclosing,
      `${TABLE}: <DryRunBadge is not inside a {… && ( … )} conditional, so it renders ` +
        `UNCONDITIONALLY — every real run would carry a "Test run" badge, which is worse than no ` +
        `badge at all. Write it as {run.dryRun && (<DryRunBadge />)}; a ternary, an extracted const ` +
        `or an internal early return all defeat this gate.`
    ).not.toBeNull()

    expect(
      enclosing?.test ?? "",
      `${TABLE}: the badge's conditional must test the run's dryRun flag and nothing else. Its ` +
        `test is: ${enclosing?.test?.trim() ?? "(none)"}.`
    ).toContain("dryRun")
  })

  it("13b. WR-05: the pagination links carry the filter instead of reverting it", () => {
    const source = read(TABLE)

    expect(
      source,
      `${TABLE}: both page links were written \`?page=\${page ± 1}\`, which DISCARDS ?status= and ` +
        `?dryRun=. An operator who ticks "Show test runs" on a workflow with 25 runs of which 8 ` +
        `are tests sees "Page 1 of 2", clicks Next, and lands on ?page=2 with test runs hidden ` +
        `again — where the filtered set has 17 rows and one page, so the table renders EMPTY with ` +
        `no pagination row at all and nothing to say the toggle was dropped.`
    ).not.toMatch(/runs\?page=/)

    expect(
      source,
      `${TABLE}: build the query string with buildRunsListHref from @/lib/workflows/runs-filter. ` +
        `That module exists because the two ends of this vocabulary must agree byte for byte; a ` +
        `third end that WRITES it must not restate the literals.`
    ).toContain("buildRunsListHref")

    for (const literal of ['"status"', '"dryRun"', '"page"']) {
      expect(
        source,
        `${TABLE}: no param literal of its own — ${literal} belongs to runs-filter.ts.`
      ).not.toContain(literal)
    }

    expect(
      source,
      `${TABLE}: the filter must arrive as props. This is a server component with no ` +
        `useSearchParams, and page.tsx has already parsed all three values.`
    ).toContain("showDryRuns")
  })

  it("14. it stacks inside the existing Status cell, AFTER the status badge", () => {
    const source = read(TABLE)

    const stackAt = source.indexOf(STATUS_CELL_STACK)
    const statusAt = source.indexOf("<RunStatusBadge")
    const dryAt = source.indexOf("<DryRunBadge")

    expect(stackAt, `${TABLE}: the Status cell's flex flex-col gap-1 stack is gone.`).toBeGreaterThan(-1)
    expect(statusAt, `${TABLE}: <RunStatusBadge is gone.`).toBeGreaterThan(-1)
    expect(dryAt, `${TABLE}: <DryRunBadge is not rendered.`).toBeGreaterThan(-1)

    expect(
      stackAt,
      `${TABLE}: the badge must sit INSIDE the existing flex flex-col gap-1 stack, which adds no ` +
        `width to the table (UI-SPEC: Table already ships its own overflow-x-auto, so no new scroll ` +
        `container is needed or wanted).`
    ).toBeLessThan(dryAt)

    expect(
      statusAt,
      `${TABLE}: the STATUS is the primary reading — an operator opens this page to see whether a ` +
        `run failed. The dashed badge is an orthogonal second dimension and renders BESIDE it, ` +
        `after it, never instead of it.`
    ).toBeLessThan(dryAt)

    const cellEnd = source.indexOf("</TableCell", dryAt)
    expect(cellEnd, `${TABLE}: the badge is not inside any TableCell.`).toBeGreaterThan(-1)
    expect(
      dryAt,
      `${TABLE}: the badge must close before the Status cell does — it belongs in that cell, not in ` +
        `Duration or a new column of its own.`
    ).toBeLessThan(cellEnd)
  })

  it("15. no new column, no new palette utility, and the failed-node hint is untouched", () => {
    const source = read(TABLE)

    expect(
      tagIndexes(source, "TableHead").length,
      `${TABLE}: the column count must stay ${TABLE_HEADS_BEFORE}. The badge stacks inside the ` +
        `Status cell; a fifth column would widen a table that is already at the 320px limit.`
    ).toBe(TABLE_HEADS_BEFORE)

    expect(
      tagIndexes(source, "TableCell").length,
      `${TABLE}: the cell count must stay ${TABLE_CELLS_BEFORE} for the same reason.`
    ).toBe(TABLE_CELLS_BEFORE)

    expect(
      source,
      `${TABLE}: the existing failed-at-node hint must survive verbatim — it shares the cell the ` +
        `badge was added to, and it is the one thing on the row that says WHERE a failure happened.`
    ).toContain("{run.status === \"failed\" && run.currentNodeId && (")

    /*
     * ANTI-VACUITY: the region is only a region once the marker exists. Asserted first, so a missing
     * badge cannot make "no palette near the badge" pass by having nothing to look at.
     */
    const dryAt = source.indexOf("<DryRunBadge")
    expect(dryAt, `${TABLE}: <DryRunBadge is not rendered.`).toBeGreaterThan(-1)

    expect(
      PALETTE.test(source.slice(Math.max(0, dryAt - 200), dryAt + 200)),
      `${TABLE}: no palette utility around the new render site (C-41-1). The badge carries its own ` +
        `token-only styling; the call site adds none.`
    ).toBe(false)
  })
})

describe("recent-runs-mini.tsx — D-A7, a query-only edit (T-41-59)", () => {
  it("16. the overview's Recent Runs filters test runs out too", () => {
    const source = read(MINI)

    expect(
      source,
      `${MINI}: without eq(workflowRuns.dryRun, false) here, a dry run appears in the workflow ` +
        `overview's Recent Runs — unbadged, indistinguishable from a real run, and it pushes a real ` +
        `run out of the top 5. This is the SECOND place runs are listed, and 41-CONTEXT's "filtered ` +
        `out of the runs list by default" has to hold in both.`
    ).toContain("dryRun")

    expect(
      source,
      `${MINI}: the single-condition where must become a two-condition and(...) — import and from ` +
        `drizzle-orm rather than chaining a second .where(), which drizzle would OVERWRITE.`
    ).toContain("and(")
  })

  it("16b. WR-03: the stats card directly above it excludes test runs as well", () => {
    const source = read(STATS)

    expect(
      source,
      `${STATS}: this card renders at page.tsx:59, IMMEDIATELY ABOVE RecentRunsMini at :60, and ` +
        `its query had no dryRun predicate while its neighbour filtered them out. One successful ` +
        `production run and four failed test runs render "Total Runs 5 · Success Rate 20% · Last ` +
        `Run 2m ago" above a Recent Runs list showing one row from three days ago — the operator's ` +
        `headline health metric for the workflow becomes a readout of their own testing, and the ` +
        `disagreement between two adjacent panels reads as a bug in the page.`
    ).toContain(HIDE_PREDICATE)

    expect(
      source,
      `${STATS}: the single-condition where must become a two-condition and(...) — chaining a ` +
        `second .where() does not conjoin in drizzle, it OVERWRITES.`
    ).toContain("and(")
  })

  it("17. D-A7: it renders NOTHING new — no element, no class, no copy", () => {
    const source = read(MINI)

    expect(
      occurrences(source, "className="),
      `${MINI}: the class-attribute count must stay at ${MINI_CLASSNAMES_BEFORE}. D-A7: this file ` +
        `is deliberately ABSENT from UI-SPEC's Surface Inventory, whose completeness rule makes an ` +
        `addition a scope violation rather than an improvement. This edit is a DATA FILTER, not a ` +
        `UI addition — it renders no new element, changes no class string and adds no copy — so it ` +
        `IMPLEMENTS the dry-run decision in the second place runs are listed rather than violating ` +
        `the inventory. If this count moved, the edit stopped being query-only and the exemption ` +
        `no longer applies.`
    ).toBe(MINI_CLASSNAMES_BEFORE)

    expect(
      source,
      `${MINI}: no badge here. Test runs are ABSENT from this list, so there is nothing to badge — ` +
        `and rendering one would be the out-of-inventory surface D-A7 promises this is not.`
    ).not.toContain("DryRunBadge")
  })

  it("18. the top-5 shape is unchanged", () => {
    const source = read(MINI)

    expect(source, `${MINI}: limit(5) must be unchanged — this is a mini list, not a page.`).toContain(
      "limit(5)"
    )
    expect(
      source,
      `${MINI}: the newest-first ordering must be unchanged.`
    ).toContain("orderBy(desc(workflowRuns.createdAt))")

    expect(
      PALETTE.test(source),
      `${MINI}: no palette utility added (C-41-1) — and none can be, since nothing here is rendered ` +
        `that was not rendered before.`
    ).toBe(false)
  })
})
