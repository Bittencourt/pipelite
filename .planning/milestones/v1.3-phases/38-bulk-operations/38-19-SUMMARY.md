---
phase: 38-bulk-operations
plan: 19
subsystem: testing
tags: [source-gate, vitest, anti-vacuity, comment-stripping, tanstack-table, dnd-kit, bulk-operations]

# Dependency graph
requires:
  - phase: 38-bulk-operations
    provides: "The four surface wirings landed by plans 38-15 (organizations), 38-16 (people), 38-17 (activities) and 38-18 (deals kanban), plus the shared readStrippedSource / stripComments / callArguments helpers"
provides:
  - "One comment-blind cross-surface source gate covering all four bulk surfaces across seven modules at once — the rules no single-surface plan could own"
  - "A mechanical proof that record-id keying, safe clear positions, the table-derived empty-state span and column prepending hold on all three list tables simultaneously"
  - "A mechanical proof that the deal card stops all three propagation channels the dnd-kit sensors listen on, and that its primary-ring count is still exactly two"
  - "A mechanical proof that the bar mounts after Load More and the failure report before the list on every surface that has both"
  - "A mechanical proof that all six of 38-CONTEXT's Deferred Ideas are absent from every surface, with two of them detected by a scoped rather than a blanket rule"
  - "A mechanical proof that neither organizations/columns.tsx nor people/columns.tsx carries any selection wiring — the phase's designed-out collision with Phase 43 POLISH-01"
  - "An ifStatements + effectCalls extractor pair that asserts the clear-on-filter CONTRACT rather than the useEffect shape, so it stays honest on the three surfaces that have no effect at all"
  - "The phase-wide gate record: full suite, typecheck, lint, zero new suppressions, zero dependency changes, four repo-wide gates individually confirmed"
affects: [38-20, bulk-operations-verification, phase-43-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-surface source gate owned by its own wave-5 plan, because a rule spanning four files that land in one wave cannot live inside any of them"
    - "Assert the clear-on-filter CONTRACT (the collection is absent from whatever position decides the clear) rather than the useEffect SHAPE, so the gate survives React's adjust-state-on-prop-change pattern"
    - "String-aware closingIndex + ifStatements extractor for render-time guards, paired with a useEffect dependency extractor, so both clear shapes are covered by one rule"
    - "Raw-vs-stripped proof chosen from a LIVE collision (kanban-board's doc comment names the token its own file is gated at zero occurrences for) rather than a synthetic one"
    - "Scoped colour exclusion pinned to the debt that justifies it, so cleaning the debt turns the gate red and forces the exclusion out with it"
    - "Two vocabulary tables with a mutual-exclusion assertion, so a token cannot end up simultaneously required and forbidden"

key-files:
  created:
    - src/components/bulk/__tests__/select-wiring.test.ts
  modified: []

key-decisions:
  - "Asserted the clear-on-filter CONTRACT, not a useEffect. react-hooks/set-state-in-effect is an ERROR in this repo, so plans 38-15/16/17 shipped React's adjust-state-on-prop-change pattern and people/data-table.tsx now contains ZERO useEffect calls. A dependency-array-only gate would have passed those three files by finding nothing — a false pass. The gate checks both an effect's dependency array AND a render-time guard's condition, and separately asserts at least one clear position was located per owner."
  - "Excluded test files from the src/components/bulk colour walk. The three existing bulk wiring gates each declare their own copy of FORBIDDEN_COLOURS and BARE_LABELS as literals, so scanning them would make the assertion fail on its own vocabulary. The exclusion is asserted, not implicit: one test proves the walk picked up no test file."
  - "Excluded activity-list.tsx from the colour scan and PINNED the exclusion to its cause. The overdue banner's pre-existing non-token colours are asserted still present, so cleaning them up turns the gate red and forces the exclusion to be deleted with them, rather than leaving a permanent free pass."
  - "Detected the Activities-assignee and tabular-Deals deferred ideas with SCOPED rules. A blanket zero-occurrence ban on assigneeId would flag activity-list.tsx's pre-existing single-record field and kanban-board's assigneeIds dialog prop; a blanket ban on useReactTable is the wrong shape because the three tables need it. The gate bans assigneeId in activities-client.tsx (the module that owns the Activities bulk path) and bans useReactTable in the three /deals modules."
  - "Left 38-18's checkbox-indeterminate.test.ts allow-list and its EXPECTED_CONSUMER_COUNT of 10 untouched. Bumping the count to 12 would produce a gate asserting this phase's own tri-state select-all must never be tri-state. Re-ran it green (13 tests) as evidence rather than editing it."
  - "Verified getRowId with a back-referencing regex rather than callArguments, because getRowId is a property with an arrow value, not a call. callArguments is used for the useEffect extraction instead, so both shared helpers are exercised."

metrics:
  duration: ~35 min
  completed: 2026-08-17
  tasks: 2
  files-created: 1
  files-modified: 0
  tests-added: 37
---

# Phase 38 Plan 19: Cross-Surface Gate + Phase-Wide Sweep Summary

One comment-blind gate now asserts, across all four bulk surfaces at once, the four wiring mistakes that were each invisible in a single file's diff and each shipped green under `npm test` — and the whole phase is confirmed green with zero new suppressions and zero dependency changes.

## What Was Built

### Task 1 — `src/components/bulk/__tests__/select-wiring.test.ts` (37 tests)

Commit `f8fccb4`. Reads seven surface modules through the shared string-aware
`readStrippedSource`; `grep -c readFileSync` on the file is **0** and `grep -c readStrippedSource` is
**13** (acceptance asked for ≥7 and 0 respectively).

**The seven module paths, all present in the file:**

| # | Path |
|---|------|
| 1 | `src/app/organizations/data-table.tsx` |
| 2 | `src/app/people/data-table.tsx` |
| 3 | `src/app/activities/activity-list.tsx` |
| 4 | `src/app/activities/activities-client.tsx` |
| 5 | `src/app/deals/deal-card.tsx` |
| 6 | `src/app/deals/kanban-column.tsx` |
| 7 | `src/app/deals/kanban-board.tsx` |

Plus two extra reads for the headline claim: `src/app/organizations/columns.tsx` and
`src/app/people/columns.tsx`.

**Anti-vacuity, all three requirements plus the ordering constraint:**

| Requirement | Where | Lines |
|---|---|---|
| 1. Files were found and read (seven non-empty, table-driven, each path named) | `describe("anti-vacuity: every surface module was actually read")` | 405–435 |
| 2. POSITIVE MARKERS, before every negative | `describe("anti-vacuity: positive markers…")` | 437–469 |
| 3. The stripping is proven to run | `describe("anti-vacuity: the comment stripping demonstrably ran")` | 471–501 |
| 4. Two vocabulary tables, each iterated | `RECOGNISED` (11 entries) / `LEFT_ALONE` (6 entries), tests at | 503–541 |

**Ordering:** the positive-marker tests occupy lines 438–469. The first substantive negative
assertion is the recognised-vocabulary test at line 504, and every lettered assertion (A–J) runs from
line 543 onward. The only `.not.toContain` before line 504 is line 481, which is itself the
stripping-proof half of anti-vacuity requirement 3 rather than a substantive negative.

**Positive markers asserted:** `useReactTable` on each of the three list surfaces, `useSortable` on
`deal-card.tsx`, `justify-between` on `kanban-column.tsx`'s header row, `useSensors` on
`kanban-board.tsx`.

**Stripping-proof form used — a REAL raw-vs-stripped comparison, not the synthetic fallback.**
`kanban-board.tsx`'s doc comment explaining the phase's one exception to
selection-lives-in-`rowSelection` says *"there is no `useReactTable` on this surface"* out loud — and
`useReactTable` is exactly the token assertion I gates at **zero occurrences on that very file**. So a
raw-text version of assertion I would fail on prose alone. The test asserts the raw source contains
the token and the stripped source does not. A direct `stripComments` exercise is kept alongside it
(including the `https://` non-truncation case), so both forms are present.

> **A first attempt at this proof used `[data]` from `people/data-table.tsx`'s doc comment and FAILED**
> — `[data]` is also live code there, in `useMemo(() => new Set(data.map(...)), [data])`. That is the
> fifteenth comment/grep collision of Phases 37–38 and the first one to fire in the *reverse*
> direction. Recorded because it is a real trap: a token that appears in a comment is not automatically
> absent from the code.

**The ten substantive assertion groups:**

| | Assertion | How |
|---|---|---|
| A | Record-id keying on all three tables | `getRowId` present; a back-referencing regex `/getRowId:\s*\(\s*(\w+)\s*\)\s*=>\s*\1\.id\b/` proves the argument resolves to the row's own `id`; plus `enableRowSelection: true` and `onRowSelectionChange`. **Regex, not `callArguments`** — `getRowId` is a property with an arrow value, not a call |
| B | No `getSelectedRowModel` | Zero occurrences across all seven stripped sources |
| C | No clear off a server-supplied collection | `effectCalls` (via `callArguments(source, "useEffect")`) checks every clearing effect's dependency array; `ifStatements` (via a string-aware `closingIndex`) checks every render-time guard's condition; a third test asserts ≥1 clear position was actually located per owner and that its key identifier is present |
| D | Empty-state span reads the table | zero `colSpan={columns.length}`; ≥1 `getAllLeafColumns` |
| E | Select column prepended | `[selectColumn, ...columns]` present; `...columns, selectColumn` absent |
| F | The deal card's three stops + ring count | `onClick={(e) => e.stopPropagation()}`, `onPointerDown`, `onKeyDown`, ≥3 `stopPropagation`; `bg-primary/5` present; `ring-2 ring-primary` count is **exactly 2** |
| G | Bar/spacer and report mount order | source-index comparison, with each anchor asserted `> -1` first |
| H | Kanban cap and boundary | `selectAllInStageCapped`, `BULK_MAX_IDS`, `indeterminate`, `disabled={deals.length === 0}` on the column; `BULK_MAX_IDS`, `useState<Set<string>>`, `entityType="deal"` on the board |
| I | Every Deferred Idea absent | 11-entry `RECOGNISED` table swept across all seven, plus two scoped rules |
| J | Colour and copy hygiene, scoped | `FORBIDDEN_COLOURS` + `HEX_LITERAL` over the 5 runtime modules under `src/components/bulk/` plus `deal-card.tsx` and `kanban-column.tsx`; `BARE_LABELS` + `tCommon` over the bulk modules |

**The Load More / list anchor tokens, resolved per file as the plan asked:**

| Surface | Load More token | List anchor |
|---|---|---|
| `src/app/organizations/data-table.tsx` | `Load More` | `<Table>` |
| `src/app/people/data-table.tsx` | `Load More` | `<Table>` |
| `src/app/activities/activities-client.tsx` | `Load More` | `<ActivityList` |

All three surfaces render the literal text `Load More` inside an outline `Button`; no per-file token
divergence was needed. Ordering is compared against `<BulkActionBar` and `<BulkFailureReport` as JSX
element openers rather than bare identifiers, because the bare names also appear in the import blocks
near the top of every file — a bare-identifier comparison would have compared against the import and
inverted the result.

**All six Deferred Ideas (38-CONTEXT § Deferred Ideas) proven absent:**

| Deferred idea | Detector |
|---|---|
| Bulk edit of arbitrary fields, incl. custom fields | `bulkEditField`, `bulkUpdateFields` — zero across all seven |
| Bulk stage moves on the kanban | `bulkStage`, `moveToStage` — zero across all seven |
| A digest email on bulk reassign | `reassignDigest` — zero across all seven |
| Filter-wide "select all N matching" | `selectAllMatching`, `selectAllFiltered`, `getPaginationRowModel` — zero across all seven |
| Bulk reassignment of Activity `assigneeId` | `bulkReassignActivityAssignee` globally, **plus** `assigneeId` scoped to `activities-client.tsx` |
| A tabular Deals view | `useReactTable` scoped to the three `/deals` modules |

The last two are SCOPED on purpose and the reason is asserted in the `LEFT_ALONE` table: a blanket
`assigneeId` ban would flag `activity-list.tsx`'s pre-existing single-record field and
`kanban-board.tsx`'s `assigneeIds` dialog prop, and a blanket `useReactTable` ban contradicts
assertion A.

**Headline claim proven.** `describe("the phase designed out its collision with the Phase 43 columns
retype")` asserts both `columns.tsx` modules still export `ColumnDef` (positive marker) and carry
**none** of `useSelectColumn`, `components/bulk`, `components/ui/checkbox`, `rowSelection` — while
both data tables DO call `useSelectColumn`. Corroborated from git:
`git log --oneline -- src/app/organizations/columns.tsx src/app/people/columns.tsx` returns
`f5692b9`, `b1c21f0`, `600c2d4`, `cdaad58`, `e846034` — Phases 12, 03 and 02. **No Phase 38 commit
touches either file.**

### Task 2 — Phase-wide gate run

No file changed; every gate was already green, so this task produced no separate code commit and its
evidence is recorded here.

| Gate | Result |
|---|---|
| `npm test` — main project | **2086 passed / 21 skipped** (95 files passed, 1 skipped) |
| `npm test` — rsc project | **8 passed** |
| **Total passing** | **2094** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**, 125 warnings |
| `git diff <phase-base> -- src \| grep -c '^+.*@ts-expect-error'` | **0** |
| `git diff <phase-base> -- src \| grep -c '^+.*eslint-disable'` | **0** |
| `git diff --stat <phase-base> -- package.json package-lock.json` | **empty** |
| `src/lib/export/formatters-live.test.ts` under `npm test` | **17 SKIPPED** (no `DATABASE_URL` in the hermetic run) |
| same, with `DATABASE_URL=postgresql://pipelite:pipelite@localhost:5433/pipelite` | **17 PASSED** (2.1s) |
| `src/lib/audit/no-mutation-coupling.test.ts` | **29 passed** |
| `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` | **14 passed** |
| `src/messages/locale-parity.test.ts` | **6 passed** |
| `src/components/ui/checkbox-indeterminate.test.ts` (38-18's allow-list, unmodified) | **13 passed** |

**Passing-count delta.** The plan's baseline is the Phase 37 close-out figure of 1703, so the delta is
**+391** and the count is strictly greater as required. The more useful comparison is against this
plan's own base commit `894ea4f` (waves 1–4 already merged): **2049 + 8 = 2057 → 2094**, a delta of
**+37**, which is exactly the 37 tests this plan adds and attributes the whole increase to
`select-wiring.test.ts`. The remaining +354 belongs to plans 38-01 through 38-18.

**The `@ts-expect-error` / `eslint-disable` / dependency diffs were taken against `a48c7b2`** — the
commit immediately before `3e5de7a docs(phase-38): begin phase 38 execution` — not against `master`.
The plan's literal command (`git diff master`) is a no-op here because Phase 38's waves 1–4 are
already merged into `master`, so it would only ever have seen this plan's single new file and would
have reported 0 for reasons unrelated to the phase. Diffed against the true phase base, the phase's
53 changed files and 11,350 insertions contain **zero** added type suppressions, **zero** added lint
suppressions and **zero** dependency changes. Phase 43 (POLISH-01) does not inherit a fifteenth
suppression.

**`src/lib/execution/condition-evaluator.test.ts` did not fail.** The known Phase 34 wall-clock
ratio flake stayed green inside the full parallel run, so no isolated re-run was needed. Recorded
because a future run may not be as lucky and the attribution matters: it is a Phase 34 file and out
of this phase's scope.

## Requirement Mapping — every BULK ID to a green automated command

| ID | Green command | Evidence |
|---|---|---|
| BULK-01 (row + header selection, tri-state, page-scoped) | `./node_modules/.bin/vitest run src/components/bulk/__tests__/select-wiring.test.ts` (assertions A, E, F, H) and `./node_modules/.bin/vitest run src/components/ui/checkbox-indeterminate.test.ts` | 37 passed; 13 passed |
| BULK-02 (bulk delete, capped, per-record failures) | `./node_modules/.bin/vitest run src/components/bulk/__tests__/select-wiring.test.ts` (assertions B, C, G, H) and `npm test` | 37 passed; 2094 passed |
| BULK-03 (bulk reassign owner) | `./node_modules/.bin/vitest run src/components/bulk/__tests__/select-wiring.test.ts` (assertions C, G, I) and `./node_modules/.bin/vitest run src/lib/audit/no-mutation-coupling.test.ts` | 37 passed; 29 passed |
| BULK-04 (scoped CSV export) | `DATABASE_URL=… ./node_modules/.bin/vitest run src/lib/export/formatters-live.test.ts` and `npm test` | 17 passed; 2094 passed |
| BULK-01..04 (copy parity) | `./node_modules/.bin/vitest run src/messages/locale-parity.test.ts` | 6 passed |

## Negative Proofs — four directions demonstrated and reverted

Each mutation was applied, the gate was run, the named failure was observed, and the mutation was
reverted. `git status --short` afterwards showed **only** the new untracked test file, which is also
the proof that every revert was byte-exact.

**Proof 1 — index-keyed `getRowId`.** `people/data-table.tsx`: `getRowId: (row) => row.id` →
`getRowId: (_row, index) => String(index)`.

> ✗ `declares getRowId, resolving to the row's own id`
> AssertionError: src/app/people/data-table.tsx declares getRowId but its argument does not resolve
> to the row's own id. TanStack's default row id is the row INDEX, and these rows arrays are
> CUMULATIVE across Load More … With index keys any reorder or removal silently retargets the
> selection onto DIFFERENT records, and the next action would be a bulk delete of records the user
> never picked (T-38-36)

**Proof 2 — Activities clear keyed on the server array.** `activities-client.tsx`: the render-time
guard replaced with `useEffect(() => { setLastFilterSignature(filterSignature); setRowSelection({}) }, [activities])`
(and `useEffect` added to the React import).

> ✗ `keeps the forbidden collection out of every clearing effect's dependency array`
> AssertionError: src/app/activities/activities-client.tsx clears its selection from an effect keyed
> on "activities". Phase 35 measured against Next 16.1.6 that revalidatePath re-renders the CURRENT
> client tree … A clear keyed on the server-supplied collection would therefore fire in the middle of
> a bulk action and wipe the failed-record selection SC-3 requires to SURVIVE the call (T-38-33)
> — expected [ 'activities' ] to not include 'activities'

**Proof 3 — the deal card's key stop removed.** `deal-card.tsx`: `onKeyDown={(e) => e.stopPropagation()}`
deleted from the checkbox wrapper.

> ✗ `stops the Space key KeyboardSensor would consume`
> AssertionError: the checkbox wrapper must stop keydown: the card root carries useSortable's
> attributes, including the KeyboardSensor binding, so Space on a focused card starts a KEYBOARD DRAG
> — and Space is also how a keyboard user toggles a checkbox. Without this stop keyboard selection is
> IMPOSSIBLE, which makes it an accessibility requirement rather than an optimisation (T-38-41)

**Proof 4 — the bar mounted above Load More.** `organizations/data-table.tsx`: the `<BulkActionBar>`
element moved from last-in-stack to immediately before the `{hasMore && (` block.

> ✗ `mounts the action bar after the Load More affordance`
> AssertionError: src/app/organizations/data-table.tsx mounts the bulk action bar BEFORE its Load
> More affordance. the bar is `fixed`, so it renders an h-20 sibling spacer to buy back the space it
> covers. Mounted above the Load More block, that spacer injects 80px into the MIDDLE of the page and
> the fixed bar covers the very button the spacer exists to keep reachable — the exact defect T-38-38
> describes — expected 8111 to be greater than 8928

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] The stripping-proof token had to be re-chosen**
- **Found during:** Task 1, first gate run
- **Issue:** The first raw-vs-stripped proof asserted `people/data-table.tsx`'s stripped source does
  not contain `[data]`, on the strength of the doc comment that writes *"A `[data]`-keyed clear
  would therefore fire…"*. It failed: `[data]` is also live code in that file, as the dependency
  array of `useMemo(() => new Set(data.map((r) => r.id)), [data])`.
- **Fix:** Re-anchored the proof on `kanban-board.tsx` and the token `useReactTable`, which appears
  ONLY in that file's doc comment and is gated at zero occurrences on that very file by assertion I —
  a strictly stronger proof, because the collision it demonstrates is one this gate would actually
  have suffered.
- **Files modified:** `src/components/bulk/__tests__/select-wiring.test.ts`
- **Commit:** `f8fccb4`

### Plan Instructions Adjusted, With Reasons

**1. Assertion C is implemented as TWO extractors, not one.** The plan offered a dependency-array
regex with a fallback to forbidden dependency-array literals. Neither would have worked on three of
the four owners: `organizations/data-table.tsx`, `people/data-table.tsx` and `activities-client.tsx`
contain **no `useEffect` at all** (`react-hooks/set-state-in-effect` is an ERROR in this repo, so
38-15/16/17 shipped React's adjust-state-on-prop-change pattern instead), so an effect-only gate
would have passed all three by finding nothing. The gate therefore checks effect dependency arrays
**and** render-time guard conditions, and adds a third test asserting at least one clear position was
located per owner so neither extractor can pass vacuously. This follows the corrected 38-UI-SPEC.

**2. The colour walk over `src/components/bulk/` skips test files.** The plan said "every file under
`src/components/bulk/` (walk the directory)". Taken literally the walk picks up
`__tests__/bulk-action-bar-wiring.test.ts`, `__tests__/bulk-dialogs-wiring.test.ts`,
`__tests__/bulk-failure-report-wiring.test.ts` and `select-column.test.ts` — the first three each
declare their own copy of `FORBIDDEN_COLOURS`, `BARE_LABELS` and a `tCommon` regex as string
literals, so the assertion would have failed on other gates' vocabulary tables and on its own. The
exclusion mirrors `checkbox-indeterminate.test.ts`'s `isTestFile` predicate and is itself asserted:
one test proves the walk returned ≥5 modules and that none of them is a test file.

**3. The suppression and dependency diffs use `a48c7b2`, not `master`.** Explained in Task 2 above:
`git diff master` would have reported 0 for the wrong reason.

**4. `getRowId` is checked with a regex rather than `callArguments`.** The plan allowed either.
`getRowId` is an object property whose value is an arrow function, not a call expression, so
`callArguments` does not apply to it. `callArguments` is used for the `useEffect` extraction instead,
so the helper is still exercised by this gate.

### Deliberately Not Done

- **38-18's `checkbox-indeterminate.test.ts` was not touched.** Its `EXPECTED_CONSUMER_COUNT` stays
  at 10 with the named, hand-checked `PHASE_38_SELECTION_CONSUMERS` allow-list and its 13th
  assertion that every allow-listed path is a live `Checkbox` importer. Bumping the count to 12 would
  produce a gate asserting this phase's own tri-state select-all must never be tri-state. Re-ran
  green (13 tests) as evidence instead.
- **No production file was modified.** All four negative proofs were reverted byte-exactly;
  `git diff --stat master -- src` reports exactly one changed file, the new gate.

## Authentication Gates

None.

## Known Stubs

None. This plan adds a test file only; every assertion in it reads a live source file and every
vocabulary entry is exercised.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change — the plan's only
artifact is a source-reading test.

## Notes For Plan 38-20 (browser UAT, wave 6)

- **Everything mechanical is now green**, so 38-20's remaining scope is the manual-only rows of
  38-VALIDATION.md § Manual-Only Verifications. Nothing in this plan reduces that list.
- **The 320px bar check** still needs the Phase 37 same-origin-iframe method; note that the app
  `<header>` already overflows at 320px on every route (37-UAT G5, pre-existing) and must not be
  attributed to the bulk bar.
- **The mixed 9-succeed/3-fail reassign** still needs the second restored user.
- `formatters-live.test.ts` needs `DATABASE_URL` to be more than a skip. It passes against the Docker
  Postgres on `localhost:5433`; the hermetic `npm test` run legitimately skips all 17.

## Self-Check: PASSED

- `src/components/bulk/__tests__/select-wiring.test.ts` — FOUND
- `.planning/phases/38-bulk-operations/38-19-SUMMARY.md` — FOUND
- Commit `f8fccb4` — FOUND in `git log`
