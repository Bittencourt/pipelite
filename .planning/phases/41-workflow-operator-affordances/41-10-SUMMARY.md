---
phase: 41-workflow-operator-affordances
plan: 10
subsystem: ui
tags: [next-intl, drizzle, shadcn, server-components, source-scan-gate, url-params]

# Dependency graph
requires:
  - phase: 41-01
    provides: "workflow_runs.dry_run as NOT NULL DEFAULT false (migration 0019) — what makes `= false` match every pre-migration row"
  - phase: 41-02
    provides: "src/lib/workflows/runs-filter.ts — parseRunsSearchParams, SHOW_DRY_RUNS_PARAM, SHOW_DRY_RUNS_VALUE"
  - phase: 41-03
    provides: "workflows.dryRun.badge and workflows.dryRun.showInList in all three locales"
provides:
  - "Dry runs hidden from BOTH places runs are listed, by a SQL predicate whose default branch needs no URL param"
  - "?dryRun=1 reveals them and resets to page 1; ?dryRun=2 reveals nothing (strict equality in the shared parser)"
  - "DryRunBadge — a server-safe, translated, outline+dashed badge rendered beside RunStatusBadge"
  - "runs/page.tsx now consumes the shared URL vocabulary; its duplicate VALID_STATUSES whitelist is deleted"
  - "The runs filter row wraps at 320px (R-4), with the checkbox subordinate to the status Select (V-41-1)"
  - "src/app/workflows/[id]/runs/__tests__/runs-list-wiring.test.ts — an 18-case wiring gate over five files"
affects: [41-13, 41-14, 41-15, workflow-runs-list, dry-run]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The URL vocabulary is imported by BOTH ends (reader and writer), never retyped"
    - "Filter accumulator (`conditions[]` + `and(...conditions)`) instead of a two-branch ternary, so a third dimension is one line"
    - "Orthogonal status dimensions get their own component beside the status badge, never a sixth entry in an exhaustive-by-type map"

key-files:
  created:
    - "src/app/workflows/[id]/runs/components/dry-run-badge.tsx"
    - "src/app/workflows/[id]/runs/__tests__/runs-list-wiring.test.ts"
  modified:
    - "src/app/workflows/[id]/runs/page.tsx"
    - "src/app/workflows/[id]/runs/components/status-filter.tsx"
    - "src/app/workflows/[id]/runs/components/runs-table.tsx"
    - "src/app/workflows/[id]/components/recent-runs-mini.tsx"
    - "src/components/ui/checkbox-indeterminate.test.ts"

key-decisions:
  - "The filter is in SQL, not the client: a client-side filter would still ship dry-run rows to the browser and would disagree with the count()"
  - "One whereClause feeds both the rows query and the count(), so pagination totals cannot diverge (T-41-55)"
  - "A Checkbox, not a sixth SelectItem — dry-run-ness is orthogonal to status, and a failed test run is the most interesting row on the page"
  - "The badge is variant=outline + border-dashed (C-41-2), token-only, distinguishable from `skipped` by border style rather than hue"
  - "recent-runs-mini.tsx is a QUERY-ONLY edit (D-A7), not an out-of-inventory UI surface — asserted by a pinned className= count"
  - "The page's if (!showDryRuns) predicate is gated by line proximity, not enclosingConditional, because the predicate is an if STATEMENT and not JSX"

patterns-established:
  - "Anti-vacuity read helper: readStrippedSource + a non-empty assertion in one function, so no negative assertion can pass over a missing or empty file"
  - "precededBy(source, marker, regex, window): the if-STATEMENT counterpart to enclosingConditional, with the negation baked into the regex"
  - "A 'renders nothing new' claim is checked by pinning the pre-edit className= count as a named constant"

requirements-completed: [WFOPS-02]

# Metrics
duration: 42min
completed: 2026-08-23
---

# Phase 41 Plan 10: Dry runs hidden, revealed, and badged — Summary

**A persisted dry run is now absent from both runs lists by a SQL predicate whose default branch needs no URL param, revealed by one page-resetting "Show test runs" checkbox, and badged `outline`+`border-dashed` beside its status badge when shown.**

## Performance

- **Duration:** ~42 min
- **Started:** 2026-08-22T23:26Z
- **Completed:** 2026-08-23T00:08Z
- **Tasks:** 3 (all TDD, RED recorded before every implementation)
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- `runs/page.tsx` now reads its params through `parseRunsSearchParams` from the shared module; the duplicate local `VALID_STATUSES` whitelist is **deleted**, closing the T-37-03 two-copies defect the extraction existed to remove.
- Dry runs are excluded by `eq(workflowRuns.dryRun, false)` inside `if (!showDryRuns)`, so the **default** — no param at all — is what hides them. `?dryRun=1` reveals; `?dryRun=2`, `?dryRun=true` and a bare `?dryRun` do not, because the shared parser compares strictly against `SHOW_DRY_RUNS_VALUE`.
- One `whereClause` still feeds both the rows query and the `count()`, so pagination totals agree with the rows shown (T-41-55).
- `DryRunBadge` is an async **server** component with no client directive: it renders only `Badge` with a plain string child, so no React element crosses the RSC boundary into a Radix slot (T-41-58 / CFUI-01).
- The filter row is `mb-4 flex flex-wrap items-center gap-2` (R-4) and the checkbox comes **after** the Select in source order (V-41-1), so after a 320px wrap it lands on the line **below** the filter it modifies.
- `recent-runs-mini.tsx` filters test runs out of the workflow overview's Recent Runs too (D-A7), so a dry run cannot push a real run out of the top 5.
- An 18-case source-scan gate over five files, every negative assertion preceded by a non-empty read.

## Task Commits

1. **Task 1: DryRunBadge, the server-safe dashed badge** — `0050997` (test, RED) → `a04a1ac` (feat, GREEN)
2. **Task 2: The SQL filter, the R-4 container, and the reveal checkbox** — `b69dcfa` (test, RED) → `fad3ebd` (feat, GREEN)
3. **Task 3: Badge in the runs table + the overview query filter** — `066db9a` (test, RED) → `4c00d51` (feat, GREEN)
4. **Rule 3 deviation:** `1eee321` (test — Checkbox consumer census 11 → 12)

No REFACTOR commits: nothing needed cleaning after GREEN in any of the three cycles.

## RED counts (recorded before each implementation, as the plan requires)

| Task | Gate result at RED | Notes |
|------|--------------------|-------|
| 1 | **3 failed / 1 passed of 4** | Case 4 (`run-status-badge.tsx` is not extended) passes by design — it is a *non-interference* regression guard over an unmodified file, not a driver. |
| 2 | **7 failed / 5 passed of 12** | The 4 task-1 cases plus case 7 (T-41-55, one `whereClause` + `count()`) which the pre-existing page already satisfied — also a regression guard, and it kept holding after the accumulator rewrite. |
| 3 | **4 failed / 14 passed of 18** | Cases 17 and 18 (D-A7 "renders nothing new" and the top-5 shape) pass at RED because the file is untouched at that point. That is exactly what they are for: they must go on passing *after* the edit, which is the whole content of the D-A7 claim. |

Final: **18/18 green.**

## Anti-vacuity constants written down (as the plan requires)

- **`recent-runs-mini.tsx` `className=` count BEFORE the edit: 5.** Pinned as `MINI_CLASSNAMES_BEFORE`. The D-A7 claim is "query-only", and an unchanged class-attribute count is the cheapest available evidence for it — but only if the before-number was recorded rather than re-read from the edited file. It is still 5.
- `SELECT_OPTIONS_BEFORE = 6` (the `statuses` array: `all` + five run statuses), `TABLE_HEADS_BEFORE = 4`, `TABLE_CELLS_BEFORE = 4`. `TableHead`/`TableCell` are counted with `tagIndexes`, which matches whole tag names — a raw `indexOf` scan would count `<TableHeader` as a fifth `<TableHead`.

## `enclosingConditional` vs. the line-proximity fallback (as the plan requires)

- **`page.tsx` — the LINE-PROXIMITY FALLBACK was used.** The predicate is a plain `if (!showDryRuns) conditions.push(...)` **statement**, not JSX, so `enclosingConditional` (which looks for `&& (`) would have thrown on a perfectly correct implementation — and a throw reads as a broken test rather than as a broken implementation. A local `precededBy(source, marker, /if\s*\(\s*!\s*showDryRuns\s*\)/, 2)` is used instead, with both halves of what matters baked into the regex: the `!` and the identifier it negates. `views-page-wiring.test.ts`'s local `ifStatement` extractor was considered and rejected: it finds the `if` whose **test** contains the marker, and here the marker is in the **body**.
- **`runs-table.tsx` — `enclosingConditional` WAS used**, wrapped in the try/catch idiom from `manage-views-dialog-wiring.test.ts:430-436`. A throw is re-reported as "the badge renders unconditionally", which would put a "Test run" badge on every real run. The implementation is written in the `{run.dryRun && ( … )}` form the gate reads — deliberately not a ternary, not an extracted `const`, not an internal early return.

## D-A7 restated, so the UI checker does not flag `recent-runs-mini.tsx`

`src/app/workflows/[id]/components/recent-runs-mini.tsx` **is deliberately absent from 41-UI-SPEC's Surface Inventory**, whose completeness rule says an addition is a scope violation rather than an improvement. This edit is **not** a UI addition. It adds exactly one thing — a second condition in a drizzle `where`:

```ts
.where(and(eq(workflowRuns.workflowId, workflowId), eq(workflowRuns.dryRun, false)))
```

It renders **no new element**, changes **no class string**, adds **no copy**, and imports **no badge**. Gate cases 17 and 18 assert all four (the pinned `className=` count of 5, the absence of `DryRunBadge`, and the unchanged `limit(5)` / `orderBy`). So it **implements** 41-CONTEXT's *"filtered out of the runs list by default"* in the second place runs are listed, rather than violating the inventory. Without it a dry run appears in the workflow overview's Recent Runs — unbadged, indistinguishable from a real run — and pushes a real run out of the top 5.

## Files Created/Modified

- `src/app/workflows/[id]/runs/components/dry-run-badge.tsx` — **new.** Async server component; `<Badge variant="outline" className="border-dashed">{t("badge")}</Badge>` via `getTranslations("workflows.dryRun")`. Header records C-41-2's three rejected options, the server-component constraint (copied in substance from `run-changed-records.tsx:4-7`), and why `run-status-badge.tsx` was not extended.
- `src/app/workflows/[id]/runs/__tests__/runs-list-wiring.test.ts` — **new.** 18 cases over five files. New app-tree `__tests__/` dir, matching `src/app/organizations/__tests__/` and `src/app/trash/__tests__/`.
- `src/app/workflows/[id]/runs/page.tsx` — `dryRun?: string` admitted; `VALID_STATUSES` deleted; `parseRunsSearchParams` destructured; `where` accumulator; R-4 row class.
- `src/app/workflows/[id]/runs/components/status-filter.tsx` — `handleDryRunToggle` (copies `handleChange`'s shape including `params.delete("page")`), `Checkbox` + `Label` after the `Select`, `useTranslations("workflows.dryRun")`, `SHOW_DRY_RUNS_PARAM`/`SHOW_DRY_RUNS_VALUE` imported.
- `src/app/workflows/[id]/runs/components/runs-table.tsx` — imports and renders `<DryRunBadge />` under `{run.dryRun && ( … )}` inside the existing `flex flex-col gap-1` Status cell. No new `TableHead`, no new `TableCell`, no scroll container.
- `src/app/workflows/[id]/components/recent-runs-mini.tsx` — the D-A7 query-only `and(...)`.
- `src/components/ui/checkbox-indeterminate.test.ts` — census constant 11 → 12 (see deviation 1).

## Decisions Made

- **`status-filter.tsx` returns a fragment now**, with the checkbox+label in a small `flex items-center gap-2` group. The page's R-4 row is the flex container, so the fragment keeps the Select and the checkbox as two direct children that can wrap independently — which is what makes V-41-1's "wraps onto the line below" true rather than aspirational.
- **`onCheckedChange={(checked) => handleDryRunToggle(checked === true)}`.** Radix hands back `CheckedState` (`boolean | "indeterminate"`); collapsing at the call site keeps `handleDryRunToggle(checked: boolean)` the plain shape the plan specified, and it is also what makes the indeterminate branch unreachable (see deviation 1).
- **The existing English status labels were left alone** (UI-SPEC § i18n Scope). The runs list now shows a translated "Show test runs" beside an English "All statuses". That is the declared seam; case 12 asserts `"All statuses"` is still present so nobody "fixes" it as unrelated scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The Checkbox consumer census went red the moment `status-filter.tsx` imported `Checkbox`**

- **Found during:** Task 3 (discovered by the full-suite run after the task-3 commit)
- **Issue:** `src/components/ui/checkbox-indeterminate.test.ts` pins the number of non-bulk modules importing `Checkbox` at an exact count — deliberately, so an N+1th consumer forces a human to check whether it can reach Radix's indeterminate state. Adding the reveal checkbox made it 12 against an expected 11, failing the suite.
- **Fix:** Performed the hand-check the count exists to force, then bumped `EXPECTED_CONSUMER_COUNT` 11 → 12 with a comment recording the finding, following the precedent 40-08 set in the same file. **The new consumer cannot reach the mixed branch:** its `checked` is `searchParams.get(SHOW_DRY_RUNS_PARAM) === SHOW_DRY_RUNS_VALUE` — a strict boolean by construction of `===`, with no third state available to a URL param that is either exactly `"1"` or absent — and its `onCheckedChange` collapses `CheckedState` with `checked === true` before the handler sees it. Not allow-listed: allow-listing is for phase-38 selection surfaces and would buy a free slot in the count rather than prove anything.
- **Files modified:** `src/components/ui/checkbox-indeterminate.test.ts` (the constant and its comment only)
- **Verification:** `npx vitest run src/components/ui/checkbox-indeterminate.test.ts` → 13/13; full suite → 0 failures
- **Committed in:** `1eee321`
- **Note on the plan's `git diff --name-only src/components/ui/` criterion:** that criterion (G-7 / T-41-SC) exists to prove **no shadcn component was installed or modified** — no registry command was run and `git diff --name-only 'src/components/ui/*.tsx'` **is empty**. The only file touched under that directory is a `.test.ts` census constant, which is the census working as designed. Flagging that as a registry violation would make the census unsatisfiable for any plan that adds a checkbox.

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep. The census bump was mandatory to keep the suite green and its whole purpose is the hand-check that was performed.

## Deferred Issues

- **`src/app/workflows/[id]/runs/page.tsx` imports `sql` from `drizzle-orm` and never uses it.** Pre-existing at the wave-1 base (the old file did not use it either), so it is outside this task's scope boundary and was left alone; it is one of the repo's 125 existing lint warnings. Recorded here rather than in a new `deferred-items.md` because six other executors are live in parallel worktrees and a fresh shared file is a six-way merge conflict. Whoever next edits that import list should drop `sql`.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run "src/app/workflows/[id]/runs/__tests__/runs-list-wiring.test.ts"` | **18/18 pass** |
| `npx vitest run src/lib/workflows/` | pass (unchanged — 143 cases alongside the gate) |
| `npx vitest run src/messages/locale-parity.test.ts` | **22/22 pass** (no message file was edited) |
| Full `npx vitest run` | **4029 passed / 32 skipped / 0 failed** (baseline 4011 + the 18 new cases) |
| `npx vitest run --config vitest.rsc.config.ts` | **8/8 pass** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors, 125 warnings** (≤127) |
| `git diff --name-only src/components/ui/` | one `.test.ts` census constant; **no component file** — see deviation 1 |
| `dry-run-badge.tsx` client directive | none (asserted against the RAW source) |
| `run-status-badge.tsx` | unmodified, and asserted to contain no `dryRun` / `dry_run` |

**Not verified here, and deliberately:** the gate executes no page and touches no database, so it knows the predicate has the shape that makes a dry run absent — not that a rendered list omits one. The behavioural proof (start a dry run, confirm it is absent, tick the box, confirm it appears badged, confirm the overview never shows it) belongs to phase verification against the container. The Docker `app` service is `build: .` with no volumes, so it cannot see worktree files at all; a live check from here would have exercised the merged main image, not this code.

## Issues Encountered

- **The worktree branched from a stale base — five for five now.** `git merge-base HEAD c747ed3` returned `aa01de2`, so the worktree was reset to `c747ed3` before any work. Without that, `src/lib/workflows/runs-filter.ts` would not have existed and this plan would have re-typed the constants it was told to import.
- **The shared `~/.local/share/rtk/tee/` log directory is not per-worktree.** A log read back by timestamp turned out to belong to another executor's run (75 replay/runs-filter cases, none of them mine). All test counts in this SUMMARY come from `vitest --reporter=json --outputFile`, which vitest writes itself, rather than from a shared tee log or a shell redirect.

## Next Phase Readiness

- `DryRunBadge` is exported from `src/app/workflows/[id]/runs/components/dry-run-badge.tsx` and is ready for **41-14's** R-1 cluster on the run-detail header (`<h1>` + `RunStatusBadge` + `DryRunBadge`). It takes no props and is `async` — compose it in JSX from a server component; do not `await` it manually.
- `parseRunsSearchParams` now has a live consumer, so **41-11**'s server actions can rely on the URL vocabulary being read in exactly one place.
- Nothing in this plan blocks another wave-2 plan. `src/messages/*` was not touched, no migration was generated, and Docker was not restarted.

---
*Phase: 41-workflow-operator-affordances*
*Completed: 2026-08-23*
