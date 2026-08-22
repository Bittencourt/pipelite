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

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"
import { readFileSync } from "node:fs"

const BADGE = "src/app/workflows/[id]/runs/components/dry-run-badge.tsx"
const STATUS_BADGE = "src/app/workflows/[id]/runs/components/run-status-badge.tsx"
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
