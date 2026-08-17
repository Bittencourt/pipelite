---
phase: 38-bulk-operations
plan: 15
subsystem: ui
tags: [tanstack-table, row-selection, bulk-operations, next-intl, rsc-boundary, organizations]

# Dependency graph
requires:
  - phase: 38-bulk-operations
    provides: "useSelectColumn (38-07), BulkFailureReport (38-09), BulkActionBar + dialogs (38-10), the three Organizations bulk server actions (38-11)"
  - phase: 37-trash
    provides: "readTrashRetentionDays() — the fail-closed retention read, no code-level default"
  - phase: 35-notes
    provides: "the measured revalidatePath re-render behaviour recorded in handleRecordSaved, and the onSuccess -> onRecordSaved rename"
provides:
  - "Organizations is the first wired bulk surface and the reference implementation for People (38-16) and Activities (38-17)"
  - "TanStack rowSelection keyed on the record id via getRowId, surviving Load More's cumulative rows array"
  - "The prepended shared translated checkbox column, composed in data-table.tsx and NOT in columns.tsx"
  - "The defensive selectedIds derivation (rowSelection keys intersected with loadedIds)"
  - "The lint-safe clear-on-search pattern that replaces the plan's useEffect (binding on all sibling surfaces)"
  - "The bar/spacer-last and report-above-the-table mount order, verified by line number"
affects: [38-16-people, 38-17-activities, 38-18-deals-kanban, 38-19-source-gates, 38-20-uat, 43-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "rowSelection + getRowId: (row) => row.id + enableRowSelection on an existing useReactTable call, with getCoreRowModel and meta untouched"
    - "selectedIds = truthy rowSelection keys INTERSECTED with a Set of loaded ids — never table.getSelectedRowModel()"
    - "clear-on-filter via React's adjust-state-on-prop-change (prevSearch sentinel), NOT useEffect — the repo lints setState-in-effect as an error"
    - "empty-state colSpan read from table.getAllLeafColumns().length, not from the columns prop"
    - "module-scope getLabel function so useSelectColumn's memo is not defeated by an inline arrow"
    - "server page passes only plain serializable bulk props (retentionDays, bulkOwners); no bulk component is imported into the RSC"

key-files:
  created: []
  modified:
    - src/app/organizations/page.tsx
    - src/app/organizations/data-table.tsx

key-decisions:
  - "The clear-on-search effect the plan specified verbatim (useEffect(() => setRowSelection({}), [search])) is a LINT ERROR in this repo (react-hooks/set-state-in-effect); proven empirically with a throwaway probe file, then implemented as React's adjust-state-on-prop-change pattern which satisfies the same contract with a stricter guarantee"
  - "The bar is mounted literally last in the root stack — after Load More AND after the two dialogs, which contribute no layout — so its own h-20 spacer can only affect what sits below everything"
  - "A search change clears the SELECTION but deliberately not the failure report: SC-3 forbids swallowing named failures, and a user may well search in order to find one of the failed records"
  - "handleOutcome re-asserts failed ids rather than only skipping succeeded ones, so the reconciliation is correct even for a failed id absent from the previous map"
  - "getLabel for the checkbox column is a module-scope function, not an inline arrow, so useSelectColumn's useMemo is not invalidated on every render"

patterns-established:
  - "Reference wiring for a bulk surface: state block -> prevSearch sentinel -> selectColumn -> columnsWithSelect -> loadedIds/selectedIds -> table config -> report above table -> bar last"
  - "Comment hygiene for source gates: every explanatory block uses `*`-prefixed lines so a comment-stripping scan sees none of it, and no comment names a symbol a gate asserts absent"

requirements-completed: [BULK-01, BULK-02, BULK-03, BULK-04]

# Metrics
duration: 17min
completed: 2026-08-17
---

# Phase 38 Plan 15: Organizations Surface Wiring Summary

**Organizations is now a fully wired bulk surface: id-keyed TanStack `rowSelection` behind a prepended translated checkbox column, a phantom-proof `selectedIds` derivation, the failure report above the table and the floating bar plus its spacer last in the stack — with `columns.tsx`, all CSS and every shared bulk component untouched.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-08-17T15:13:40Z
- **Completed:** 2026-08-17T15:30:15Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- `page.tsx` now reads the retention window and a separate approved-users list in the same `Promise.all` as the list fetch, and passes both to the table as plain serializable props. No bulk component crosses into the server file.
- `data-table.tsx` enables `rowSelection` with `getRowId: (row) => row.id`, which is what makes "select three rows, press Load More, still read three selected" true against a cumulative rows array — and what stops a reorder or removal from silently retargeting a destructive action (T-38-36).
- `selectedIds` is the intersection of `rowSelection`'s truthy keys with the loaded ids, so a key TanStack failed to prune after a delete cannot inflate the count or reach a submit (T-38-37).
- The failure report mounts above the table and the bar mounts last, so the bar's own `h-20` spacer can only ever change what sits below everything (T-38-38).
- `handleOutcome` drops succeeded ids and re-asserts failed ids in one explicit `setRowSelection` call, so a partial failure leaves the retry one click away with no re-picking.
- The full suite is unchanged from baseline: main 2048 passed / 21 skipped, rsc 8 passed, typecheck 0 errors, lint 0 errors / 125 pre-existing warnings.

## Task Commits

1. **Task 1: page.tsx — retentionDays and bulkOwners props** — `3560f25` (feat)
2. **Task 2: data-table.tsx — rowSelection, the select column, and the colSpan fix** — `db35467` (feat)
3. **Task 3: data-table.tsx — mount the bar, the spacer and the failure report** — `31d2b45` (feat)

## Files Created/Modified

- `src/app/organizations/page.tsx` — added `readTrashRetentionDays()` and a new approved-users query to the existing fetch, now a three-way `Promise.all`; passes `retentionDays={retentionDays}` and `bulkOwners={bulkOwners}`. The `leftJoin`, `PAGE_SIZE`, the cumulative `limit` arithmetic and the `hasMore` slice are byte-identical.
- `src/app/organizations/data-table.tsx` — `rowSelection` and `outcome` state, the `prevSearch` clear sentinel, the prepended `selectColumn`, `columnsWithSelect`, `loadedIds`/`selectedIds`, the extended `useReactTable` call, the table-derived empty-state `colSpan`, `handleOutcome`, and the two mounts.

## Requested Verifications

**Task 1 — the live retention value.** `readTrashRetentionDays()` reads **30** from this database:

```
docker exec pipelite-postgres-1 psql -U pipelite -d pipelite \
  -c "select value from app_settings where key='trash.retention_days'"
 value
-------
 30
```

That is migration 0015's seeded row, i.e. the default-in-data half of the Phase 37 contract, not a code fallback. `grep -vE '^\s*[*/]' page.tsx | grep -cE '\?\? *[0-9]|\|\| *[0-9]'` is **0** — there is no numeric default anywhere in the file. `docker compose exec` could not be used from the worktree (no `.env` there, so compose resolves an empty `POSTGRES_USER`); `docker exec` against the container directly is the equivalent and needs no sudo.

**Task 2 — the clear-on-filter dependency array.** There is no dependency array, because there is no effect: the clear is a render-phase adjustment keyed on the `search` STRING (`data-table.tsx:125-129`).

```ts
const [prevSearch, setPrevSearch] = useState(search)
if (prevSearch !== search) {
  setPrevSearch(search)
  setRowSelection({})
}
```

The plan's literal form is a lint ERROR in this repo — see Deviations below. The contract the criterion protects holds and is strictly stronger: the reset is keyed on `search` and nothing else, `data` is not read, and the clear happens during the same render that first sees the new search, so no paint can show the old selection against the new result set.

**Task 3 — JSX mount order, by line number.**

| Element | Line | Relative position |
|---------|------|-------------------|
| `<BulkFailureReport ...>` | 324 | after the search/Add row (303-317), **before** `<Table>` (333) |
| `Load More` button | 400-406 | — |
| `<BulkActionBar ...>` | 437 | **after** Load More, and last in the root stack |

The bar sits after the two dialogs as well as after Load More. `OrganizationDialog` and `DeleteDialog` render Radix portals and contribute no layout, so "after Load More" and "literally last" are the same position in flow — and being literally last is the stronger reading of the spacer rule.

**Task 3 — `handleOutcome` control flow** (`data-table.tsx:232-256`):

1. `const succeeded = new Set(next.succeeded)`.
2. One `setRowSelection((prev) => ...)`: copy forward every truthy key of `prev` that is **not** in `succeeded`, then set every `next.failed[].id` to `true`. Failed ids are re-asserted rather than merely skipped, so the result is correct even for a failed id that was somehow absent from `prev`.
3. `setOutcome(next.failed.length > 0 ? next : null)` — a clean run clears any earlier report.
4. `refresh?.()`, the same optional-parent-hook convention as `handleRecordSaved`. No `router.refresh()` (the action's own `revalidatePath` already re-renders the tree) and no `onSuccess` anywhere (`grep -c onSuccess` is 0).

**Task 3 — every `useEffect` in the file and its dependency array.** There are **zero** `useEffect` calls in `data-table.tsx`. The single textual match at line 120 is inside a `*`-prefixed comment explaining why the effect form was rejected. So no effect calls `setRowSelection({})`, and none can key on `data` or `outcome`.

**Acceptance-criteria counts** (`grep -c` counts LINES, so two of the stated numbers are arithmetically unreachable — intent satisfied, exact figure recorded):

| Criterion | Stated | Observed | Note |
|-----------|--------|----------|------|
| `readTrashRetentionDays` in page.tsx | ≥1 | 3 | import, call, one comment mention |
| `retentionDays={` / `bulkOwners={` in page.tsx | 1 / 1 | 1 / 1 | — |
| `eq(users.status, "approved")` | 1 | 1 | — |
| numeric default (comment-stripped) | 0 | 0 | — |
| `PAGE_SIZE = 50` | 1 | 1 | arithmetic untouched, confirmed by diff |
| `components/bulk` in page.tsx | 0 | 0 | RSC boundary clean (T-38-26) |
| `getRowId: (row) => row.id` | 1 | 1 | — |
| `enableRowSelection: true` | 1 | 1 | — |
| `onRowSelectionChange: setRowSelection` | 1 | 1 | — |
| `useSelectColumn` | 1 | **3** | import + comment + call. An imported-and-used symbol cannot occupy one line; intent (the shared hook is used) satisfied |
| `columnsWithSelect` | ≥2 | 2 | — |
| `colSpan={columns.length}` / `getAllLeafColumns` | 0 / 1 | 0 / 1 | — |
| `getSelectedRowModel` | 0 | 0 | tripped at 1 on my own comment; the COMMENT was reworded, the gate was not weakened |
| `getPaginationRowModel` | 0 | 0 | — |
| `BulkActionBar` / `BulkFailureReport` | ≥2 / ≥2 | 2 / 2 | — |
| three bulk actions | ≥6 | 6 | three imports + three usages |
| `onSuccess` | 0 | 0 | Phase 35 rename intact |
| `retentionDays` in data-table.tsx | ≥2 | **3** | prop declaration, destructure, pass-through |

**Untouched-file assertions.** `git status --porcelain src/app/organizations/columns.tsx src/app/globals.css src/components/ui/table.tsx src/components/bulk/` is empty. Zero CSS added; the bulk row treatment is entirely the already-present `data-state={row.getIsSelected() && "selected"}` plus `table.tsx:60`, which starts working the moment `rowSelection` is enabled. `data-selected` (the keyboard cursor) was not touched and no ring or border was added to a bulk-selected row.

## Verification Results

| Gate | Result |
|------|--------|
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 125 warnings (exactly the pre-existing baseline) |
| `npm test` (main) | 94 files, **2048 passed / 21 skipped** — baseline |
| `npm test` (rsc) | 2 files, **8 passed** — baseline |
| `vitest run src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` | 14 passed |
| `vitest run src/components/bulk/ src/app/organizations/` | 120 passed |
| `vitest run src/messages/locale-parity.test.ts` | 6 passed |

## Decisions Made

- **Failure report survives a search change; the selection does not.** § Surface 7 names exactly three things that clear the report — the Dismiss button, the next bulk result, and `onClear` — and a search change is not one of them. Clearing it on a keystroke would also be the swallowing SC-3 forbids, and searching is a plausible way for a user to go *find* a record that failed. The selection clears; the named failures stay named.
- **The bar is mounted after the dialogs, not merely after Load More.** Both dialogs are portalled and contribute no layout, so this is the same position in flow with a stronger guarantee for the `h-20` spacer.
- **`getOrganizationLabel` is module-scope.** `useSelectColumn` memoises on the `getLabel` identity, so the plan's inline `(o) => o.name` would hand it a fresh identity every render and rebuild the whole column model on every paint. Same contract, no churn.
- **`bulkOwners`, not `owners`.** Unmistakably the bulk picker's list, so it can never be conflated with a future owner *filter* on this surface.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1's typecheck gate required the receiving props to exist**

- **Found during:** Task 1 (page.tsx props)
- **Issue:** Task 1's own verification is `npm run typecheck`, but `page.tsx` cannot pass `retentionDays` / `bulkOwners` to a `DataTableProps` that does not declare them — `tsc` fails, so the task could not be verified in isolation.
- **Fix:** Added the two prop *declarations* (and their doc comments) to `DataTableProps` in Task 1's commit. Only the interface — they are not destructured until Task 3, so no unused-variable warning appears either.
- **Files modified:** `src/app/organizations/data-table.tsx` (interface only)
- **Verification:** `npm run typecheck` 0 errors and `npm run lint` 0 errors at the Task 1 commit.
- **Committed in:** `3560f25` (Task 1 commit)

**2. [Rule 1 - Bug] The plan's clear-on-filter `useEffect` is a lint ERROR in this repo**

- **Found during:** Task 2 (table wiring)
- **Issue:** The plan, `<interfaces>` and 38-UI-SPEC § Interaction Contract all specify `useEffect(() => { setRowSelection({}) }, [search])` verbatim. That exact code fails `react-hooks/set-state-in-effect`, which is an **error** here — so following the plan literally would have failed the plan's own `npm run lint` acceptance criterion. Verified empirically rather than assumed, with a throwaway `src/app/organizations/lint-probe.tsx` containing precisely that effect:

  ```
  src/app/organizations/lint-probe.tsx:9:5
  >  9 |     setRowSelection({})
       |     ^^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
    react-hooks/set-state-in-effect
  ✖ 1 problem (1 error, 0 warnings)
  ```

  The probe file was deleted immediately and is in no commit (`git status` clean afterwards; it appears in no diff).
- **Fix:** Implemented as React's documented adjust-state-on-a-prop-change pattern with a `prevSearch` sentinel. The protected contract is preserved exactly — the clear keys on the search STRING and never on the `data` array, so a bulk action's own `revalidatePath` cannot wipe the failed-id selection (T-38-33) — and is strictly stronger, since the reset lands in the same render that first sees the new search instead of one paint later.
- **Files modified:** `src/app/organizations/data-table.tsx`
- **Verification:** `npm run lint` 0 errors; `npm run typecheck` 0 errors; the full suite at baseline.
- **Committed in:** `db35467` (Task 2 commit)

**3. [Rule 1 - Bug] A comment named a symbol an acceptance criterion asserts absent**

- **Found during:** Task 2 (table wiring)
- **Issue:** `grep -c 'getSelectedRowModel' data-table.tsx` returned **1** — my own explanatory comment ("never derived from `table.getSelectedRowModel()`") rather than any code. This is the comment/grep collision that has now fired thirteen times across Phases 37-38.
- **Fix:** Reworded the comment to "the table's own selected-row model, whose accessor is asserted absent from this file by a source gate". The gate was **not** weakened.
- **Files modified:** `src/app/organizations/data-table.tsx` (comment only)
- **Verification:** the grep now returns 0.
- **Committed in:** `db35467` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** No scope creep and no change to any contract. Deviation 2 is the only substantive one: the plan's literal code could not coexist with the plan's own lint gate, so the pattern changed while the guarantee it protects (keyed on `search`, never on `data`) did not.

## Issues Encountered

- **`docker compose exec` is unusable from an agent worktree.** The worktree has no `.env`, so compose resolves `POSTGRES_USER` and friends to empty strings and reports `service "postgres" is not running`. `docker exec pipelite-postgres-1 psql -U pipelite -d pipelite` is the working equivalent and needs no sudo. Worth reusing on the three sibling surface plans.
- **The worktree forked from a stale commit again** (`cbf3229` instead of `dd7fd4d`) — the fifteenth consecutive occurrence. The prescribed `git reset --hard` corrected it before any work started.
- **Transient lint warning between tasks.** `selectedIds` was "assigned but never used" (126 warnings) after Task 2, since its consumer arrives in Task 3. Warnings-only, and back to the 125 baseline at Task 3.

## Notes for Downstream Plans

- **38-16 / 38-17 / 38-18 will hit the identical lint wall.** Do not copy `useEffect(() => setRowSelection({}), [search])` into `people/data-table.tsx`, `activity-list.tsx` or `kanban-board.tsx` — it does not lint. Copy the `prevSearch` sentinel from `data-table.tsx:125-129`. On Deals the same shape applies to the pipeline id rather than to a search string.
- **38-19's source gate must not assert that a `useEffect` exists.** There is no effect in this file, by necessity. Assert the *contract* instead: that `data` does not appear in any clear-on-filter dependency position, and that `setRowSelection({})` outside `handleOutcome`/`onClear` is reached only from a `search` comparison. A comment-blind scan (`readStrippedSource`) will find zero `useEffect` here.
- **`people/data-table.tsx` is byte-identical to this file modulo the rename**, so 38-16 is a mechanical transposition of these three commits: the module-scope label function, the state block, the `prevSearch` sentinel, the `columnsWithSelect` memo, the derivation, the five `useReactTable` keys, the `getAllLeafColumns` colSpan, `handleOutcome`, and the two mounts in this order.
- **Cosmetic, for 38-20 UAT:** `BulkFailureReport` carries its own `mb-4` and here sits inside a `space-y-4` stack, so the gap between the report and the table is 32px rather than 16px. Fixing it would mean editing a shared component four surfaces consume, which this plan is forbidden to touch. Flagged, not changed.

## Known Stubs

None. Every prop the bar and the report need is wired to a real source: `retentionDays` to `readTrashRetentionDays()`, `bulkOwners` to a live filtered users query, and the three action props to the actual server actions from 38-11. No hardcoded empty array, no placeholder copy, no component receiving mock data.

## Threat Flags

None. The two edited files introduce no new endpoint, no new auth path, no file access and no schema change. Every security-relevant surface they touch is already in the plan's threat register (T-38-06, T-38-10, T-38-26, T-38-33, T-38-36, T-38-37, T-38-38), and all seven `mitigate` dispositions are implemented and evidenced above.

## User Setup Required

None — no external service configuration required. The retention window is already seeded at 30 days.

## Next Phase Readiness

- Organizations is the reference implementation the three remaining surface plans copy from; the two subtlest rules of the phase (`getRowId`, and the bar mounted last) are landed and evidenced by line number.
- Behaviour is deliberately unproven here: there is no jsdom/happy-dom/@testing-library in this repo and none may be added, so selection behaviour, the indeterminate header state, the 320px wrap and the partial-failure retry are all plan 38-20's browser UAT. Wiring is proven by source and by the unchanged baseline suite.
- No blockers. `STATE.md` and `ROADMAP.md` were deliberately not touched — the orchestrator owns those writes after the wave.

## Self-Check: PASSED

- Files claimed as modified exist: `src/app/organizations/page.tsx`, `src/app/organizations/data-table.tsx`.
- Commits claimed exist on this branch: `3560f25`, `db35467`, `31d2b45`.
- No file deletions in any of the three commits (`git diff --diff-filter=D HEAD~1 HEAD` empty after each).
- No untracked files left behind (the lint probe was removed; `git status --short` shows only the SUMMARY before its own commit).
- No shared orchestrator artifact touched: `STATE.md` and `ROADMAP.md` are unmodified.

---
*Phase: 38-bulk-operations*
*Completed: 2026-08-17*
