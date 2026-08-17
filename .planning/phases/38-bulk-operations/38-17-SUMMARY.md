---
phase: 38-bulk-operations
plan: 17
subsystem: ui
tags: [tanstack-table, row-selection, bulk-operations, activities, next-intl, drizzle]

# Dependency graph
requires:
  - phase: 38-bulk-operations
    provides: "38-07 useSelectColumn, 38-09 BulkFailureReport, 38-10 BulkActionBar, 38-14 the three Activities bulk server actions"
  - phase: 37-trash
    provides: "readTrashRetentionDays() with its no-code-level-fallback contract"
  - phase: 35
    provides: "the measured revalidatePath re-render behaviour and the onRecordSaved callback name"
provides:
  - "Activities list selection: a per-row checkbox column plus a page-scoped select-all header"
  - "rowSelection LIFTED to ActivitiesClient, so the bar and its 80px spacer mount after Load More"
  - "selectedIds intersected with the loaded ids, defending against phantom selection keys"
  - "selection cleared on a filter-signature string rather than on the activities data array"
  - "a separate approved-and-not-deleted bulkOwners list for reassign, distinct from the pre-existing owners pool"
  - "retentionDays threaded to the bulk delete dialog with no numeric default"
affects: [38-20 browser UAT, 38 verification, future activities list work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lifted TanStack rowSelection: the child owns useReactTable, the parent owns the state and the submitted id set"
    - "Clear-on-filter written as React's adjust-state-when-a-prop-changes rather than useEffect + setState"
    - "Two queries against one table in one Promise.all rather than narrowing a shared array's predicate"

key-files:
  created: []
  modified:
    - src/app/activities/page.tsx
    - src/app/activities/activity-list.tsx
    - src/app/activities/activities-client.tsx

key-decisions:
  - "rowSelection lives in ActivitiesClient, not ActivityList: the parent owns Load More and the filter props, so the bar's spacer stays below the button (T-38-38)"
  - "columnsWithSelect is a plain array literal, not useMemo: the pre-existing columns array is rebuilt every render so the memo could never hit, and it cost a new exhaustive-deps lint warning"
  - "The clear-on-filter reset uses the adjust-state-on-prop-change pattern because react-hooks/set-state-in-effect is an ERROR in this repo; the trigger is still the filter signature and nothing else"
  - "handleOutcome rewrites the previous selection map (delete succeeded, set failed) rather than rebuilding it from the result, so rows ticked while a request was in flight survive"
  - "A second users query for bulkOwners; the pre-existing deletedAt-only query is untouched because it feeds ActivityFilters and ActivityDialog"

patterns-established:
  - "Parent-owned selection for surfaces whose pagination control lives above the table component"
  - "Phantom-key intersection (rowSelection truthy keys ∩ loaded ids) as the id-derivation contract"

requirements-completed: [BULK-01, BULK-02, BULK-03, BULK-04]

# Metrics
duration: 22min
completed: 2026-08-17
---

# Phase 38 Plan 17: Activities Surface Wiring Summary

**Activities list bulk selection with `rowSelection` lifted to `ActivitiesClient` — `getRowId`-keyed checkboxes in the table, the bar and its spacer mounted after Load More, and a separate approved-owners list for reassign.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-17T15:11:30Z
- **Completed:** 2026-08-17T15:33:18Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- `ActivityList` prepends the shared select column, keyed with `getRowId: (row) => row.id`, and reads its empty-state `colSpan` from the table.
- `ActivitiesClient` owns the selection: the bar and its `h-20` spacer sit AFTER the Load More button, so the fixed bar never covers the button.
- Selection clears only on a filter-signature string, so a bulk action's `revalidatePath` re-render cannot wipe the failed-record selection.
- Reassign targets come from a second, separate query filtered on `deleted_at IS NULL` AND `status = 'approved'`; the pre-existing owners array (two consumers) is byte-for-byte unchanged.
- Full suite matches the wave-3 baseline exactly: main **2048 passed / 21 skipped**, rsc **8 passed**, typecheck **0 errors**, lint **0 errors / 125 warnings**.

## Task Commits

1. **Task 1: page.tsx — retentionDays and a separate bulkOwners list** — `c05dc71` (feat)
2. **Task 2: activity-list.tsx — lifted selection state and the prepended select column** — `038d4d8` (feat)
3. **Task 3: activities-client.tsx — own the selection, mount bar, spacer and report** — `d60968d` (feat)

## Files Created/Modified

- `src/app/activities/page.tsx` — adds `readTrashRetentionDays()` and a second `users.findMany` to the existing `Promise.all`; passes `bulkOwners` and `retentionDays` to `ActivitiesClient`.
- `src/app/activities/activity-list.tsx` — `ActivityListProps` gains `rowSelection` / `onRowSelectionChange`; prepends `useSelectColumn`; `getRowId`, `enableRowSelection`, `state`, `onRowSelectionChange` added to `useReactTable`; empty-state `colSpan` read from the table.
- `src/app/activities/activities-client.tsx` — declares the lifted selection, derives `selectedIds`, clears on a filter signature, mounts `BulkFailureReport` above the list and `BulkActionBar` after Load More, and wires the three Activities bulk actions.

## Acceptance-criteria evidence

### Task 1 greps

| Check | Expected | Actual |
|---|---|---|
| `readTrashRetentionDays` | ≥ 1 | 2 (import + call) |
| `retentionDays={` | 1 | 1 |
| `bulkOwners={` | 1 | 1 |
| `eq(users.status, "approved")` | 1 | 1 |
| `users.findMany` | 2 | 2 |
| `components/bulk` | 0 | 0 |
| numeric default (`?? N` / `\|\| N`, comments stripped) | 0 | 0 |

**The pre-existing users query and the `owners` mapping are provably untouched.** `git diff src/app/activities/page.tsx` contains no `-`/`+` line inside either. The pre-existing query appears only as diff CONTEXT:

```
@@ -113,4 +121,23 @@
       orderBy: [users.name],
     }),
+    /* … A SECOND, SEPARATE users query … */
+    db.query.users.findMany({
+      where: and(isNull(users.deletedAt), eq(users.status, "approved")),
...
     readTrashRetentionDays(),
   ])
```

and the mapping likewise:

```
@@ -171,4 +198,11 @@
   }))                                  ← end of the untouched `owners` map, context only
 
+  // Reassign targets for the bulk action bar only …
+  const bulkOwners = bulkOwnersResult.map((u) => ({
+    id: u.id,
+    name: u.name || "Unknown",
+  }))
+
   // Users list for assignee select and filter (same pool as owners)
```

The only edits to the existing `Promise.all` are the destructuring shape (four names → six, same order) and two appended array entries. `owners` and `usersForAssignee` still map `ownersResult`.

### Task 2 greps

| Check | Expected | Actual |
|---|---|---|
| `getRowId: (row) => row.id` | 1 | 1 |
| `enableRowSelection: true` | 1 | 1 |
| `onRowSelectionChange` | ≥ 2 | 3 (prop type, destructure, table option) |
| `useState` | unchanged | **5 before → 5 after** — no selection state declared here |
| `useSelectColumn` | 1 (intent: wired once) | **2** — import + the single call site. `grep -c` counts LINES, so an import plus a use can never be 1; the criterion's intent (exactly one call) holds. A third match initially came from my own explanatory comment and the comment was REWORDED rather than the check weakened. |
| `columnsWithSelect` | ≥ 2 | 2 |
| `colSpan={columns.length}` | 0 | 0 |
| `getAllLeafColumns` | 1 | 1 |
| `getFilteredRowModel` | unchanged | **2 before → 2 after** |
| `BulkActionBar\|BulkFailureReport\|h-20` | 0 | 0 |
| `getPaginationRowModel\|getSelectedRowModel` | 0 | 0 |
| `bg-red-50` | unchanged | **1 before → 1 after**; the diff has no hunk inside the overdue banner |
| `git status --porcelain src/app/globals.css src/components/ui/table.tsx` | empty | empty (zero CSS added) |

### Task 3 greps and JSX order

| Check | Expected | Actual |
|---|---|---|
| `BulkActionBar` | ≥ 2 | 2 |
| `BulkFailureReport` | ≥ 2 | 2 |
| the three bulk actions | ≥ 6 | 6 (3 import lines + 3 prop lines) |
| `entityType="activity"` | 1 | 1 (singular) |
| `rowSelection` | ≥ 4 | 5 |
| `onSuccess` | 0 | 0 |

**JSX line order in `activities-client.tsx` (post-commit):**

| Element | Line |
|---|---|
| `<ActivityFilters` | 279 |
| `<BulkFailureReport` | 292 |
| `<ActivityList` | 311 |
| `Load More` button label | 322 |
| `<BulkActionBar` | 333 |

Report **above** the list; bar **after** the Load More block — so the bar's `h-20` spacer is the last thing in the stack, which is exactly what the lift bought (T-38-38).

**Clear-on-filter trigger.** The reset is written as React's adjust-state-when-a-prop-changes block, so the *effective* dependency is `filterSignature` alone and `activities` cannot reach it:

```tsx
const filterSignature = useMemo(
  () => JSON.stringify({ search, ...activeFilters }),
  [search, activeFilters]          // ← the only dep array involved; no `activities`
)

const [lastFilterSignature, setLastFilterSignature] = useState(filterSignature)
if (lastFilterSignature !== filterSignature) {
  setLastFilterSignature(filterSignature)
  setRowSelection({})
}
```

**`handleOutcome` control flow**, in order, in one explicit `setRowSelection`:

1. `setRowSelection(prev => …)` — copy `prev`, `delete` every id in `next.succeeded`, then set every `next.failed[].id` to `true`. Copying rather than rebuilding from the result also preserves rows the user ticked while the request was in flight.
2. `setOutcome(next.failed.length > 0 ? next : null)` — a clean run clears any earlier report; a partial one names the records.
3. `handleRefresh()` — this file's pre-existing refresh handler, called by its existing name. `onSuccess` count is 0; the Phase 35 rename to `onRecordSaved` is not undone.

**`ActivityFilters` and `ActivityDialog` prop lists unchanged.** `<ActivityDialog>` has **no diff hunk at all** — its `owners`-free prop list (`activityTypes`, `deals`, `users`, `onRecordSaved`) is untouched. `<ActivityFilters>` appears only as unchanged context in the hunk that inserts the report below it:

```
@@ -162,8 +282,22 @@
               assignees={users.map(u => ({ id: u.id, name: u.name || u.email }))}
               search={search}
             />                            ← ActivityFilters closes, unmodified
 
+            {/* report … */}
+            {outcome !== null && outcome.failed.length > 0 && (
+              <BulkFailureReport … />
+            )}
+
             {hasActiveFilters && activities.length === 0 ? (
```

`bulkOwners` is referenced exactly twice in the file: the props interface/destructure and `owners={bulkOwners}` on the bar.

## Verification results

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 125 warnings — **exactly** the wave-3 baseline |
| `vitest run "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"` | 14 passed |
| `vitest run src/components/bulk/ src/app/activities/ src/messages/locale-parity.test.ts` | 137 passed |
| `npm test` (full) | main **2048 passed / 21 skipped**, rsc **8 passed** — baseline exactly |
| `git status --porcelain src/app/globals.css src/components/ui/table.tsx` | empty |

## Decisions Made

- **`columnsWithSelect` is not memoised.** See Deviations #1.
- **Clear-on-filter uses the render-time adjustment pattern.** See Deviations #2.
- **`handleOutcome` rewrites the previous map instead of rebuilding from the result.** The plan said "removing every id in `succeeded` and PRESERVING every id in `failed`"; rebuilding only from `failed` would additionally have dropped any row the user ticked while the action was in flight (the table's checkboxes are not disabled during a request — only the bar's buttons are). Copy-then-delete-then-set implements the plan's sentence literally and has no such hole.
- **The bar is mounted inside the non-empty branch of the existing ternary**, as the last child after the Load More block. The other branch is the "filters match nothing" empty state, where a selection cannot exist — the filter change that produced it already cleared it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dropped the `useMemo` around `columnsWithSelect` to keep the lint gate at baseline**

- **Found during:** Task 2 (activity-list.tsx)
- **Issue:** The plan specified `useMemo(() => [selectColumn, ...columns], [selectColumn, columns])`. `columns` in this file is a plain array literal rebuilt on every render (it closes over `togglingId`, `t`, `format` and three handlers), so the memo could never hit — and `react-hooks/exhaustive-deps` flagged it: `"The 'columns' array makes the dependencies of useMemo Hook change on every render"`. Lint went from the measured 125 warnings to 126. This repo's gate is a measured count, so a new warning is a regression.
- **Fix:** `const columnsWithSelect = [selectColumn, ...columns]` with a comment recording why the hook is deliberately absent. The alternative — wrapping `columns` itself in `useMemo` — would have meant adding six-plus dependencies to a 170-line column array the plan explicitly said to leave alone.
- **Files modified:** `src/app/activities/activity-list.tsx`
- **Verification:** lint back to 0 errors / 125 warnings; `columnsWithSelect` still appears twice; selection state is external (lifted), so rebuilding the column array costs no selection.
- **Committed in:** `038d4d8`

**2. [Rule 3 - Blocking] Clear-on-filter written as adjust-state-on-prop-change instead of `useEffect`**

- **Found during:** Task 3 (activities-client.tsx)
- **Issue:** The plan specified `useEffect(() => { setRowSelection({}) }, [filterSignature])`. `react-hooks/set-state-in-effect` is an **error** in this repo (it is what failed plan 38-08's first attempt), so that literal code would not have passed the lint gate. The three existing suppressions of that rule are all logged deferrals; adding a fourth in new code would be debt created on purpose.
- **Fix:** React's documented render-time adjustment (`lastFilterSignature` sentinel + `if` block), the same shape `bulk-reassign-dialog.tsx:103-107` already uses in this phase. The trigger and the guarantee are identical: the reset runs only on the render where the signature actually changed, and nothing derived from `activities` can reach it. No `eslint-disable` added.
- **Files modified:** `src/app/activities/activities-client.tsx`
- **Verification:** lint 0 errors; the only value the reset reads is `filterSignature`, whose own `useMemo` deps are `[search, activeFilters]`.
- **Committed in:** `d60968d`

**3. [Rule 1 - Bug] Reworded my own comment after it collided with an acceptance grep**

- **Found during:** Task 2 verification
- **Issue:** `grep -c 'useSelectColumn'` returned 3 because an explanatory comment mentioned the hook by name — the comment/grep collision that has now fired thirteen times across phases 37-38.
- **Fix:** Reworded the comment to "the shared hook". The check was NOT weakened.
- **Files modified:** `src/app/activities/activity-list.tsx`
- **Verification:** count is now 2 (import + the one call site).
- **Committed in:** `038d4d8`

---

**Total deviations:** 3 auto-fixed (2 blocking lint-gate collisions, 1 comment/grep collision)
**Impact on plan:** No scope creep. Both blocking deviations preserve the plan's intent exactly — the same trigger, the same array, no suppression comments — and were forced by repo-level gates the plan text predated. Every threat-register mitigation landed as written.

## Issues Encountered

- **The three tasks are not individually typecheck-clean, by construction.** Each task edits exactly one file, and the new contract spans all three (`page.tsx` → `ActivitiesClient` → `ActivityList`). Any commit order leaves the middle commits with a props mismatch. All three edits were therefore made and gated together, then committed in plan order (1 → 2 → 3); the gates were run against the complete set, and `d60968d` is the first commit at which typecheck passes. Verifiers checking out `c05dc71` or `038d4d8` in isolation will see the expected transient TS2322/TS2741 on the two call sites.

## Known Stubs

None. Every prop the bar and the report need is wired to a real source: `retentionDays` from `readTrashRetentionDays()`, `owners` from a live query, and the three actions imported directly from `./actions` with no reshaping closures.

## Threat Flags

None. The three files introduce no new endpoint, auth path, file access or schema change. `page.tsx` imports nothing from `src/components/bulk/` (count 0) and passes only plain serializable values; the RSC boundary gate is green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for plan 38-20's browser UAT. Behaviour that only a browser can prove and that this plan could not: the header checkbox selecting every loaded row after Load More, the bar not covering the Load More button, the 320px wrap contract on this surface, and the failed-rows-stay-selected path after a partial failure.
- One thing a UAT should deliberately try: select rows, press Load More, then confirm the previously-checked rows are still the same records (the `getRowId` guarantee).
- No blockers.

## Self-Check: PASSED

- All three modified files exist on disk.
- All three task commits (`c05dc71`, `038d4d8`, `d60968d`) exist in `git log --all`.
- No file deletions in the three commits (`git diff --diff-filter=D HEAD~3 HEAD` is empty); no untracked files left behind.

---
*Phase: 38-bulk-operations*
*Completed: 2026-08-17*
