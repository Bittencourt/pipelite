---
phase: 38-bulk-operations
plan: 16
subsystem: people-list-surface
tags: [bulk-operations, tanstack-table, row-selection, rsc-boundary, people]
requires:
  - "38-07: useSelectColumn (src/components/bulk/select-column.tsx)"
  - "38-09: BulkFailureReport (src/components/bulk/bulk-failure-report.tsx)"
  - "38-10: BulkActionBar (src/components/bulk/bulk-action-bar.tsx)"
  - "38-12: bulkDeletePeople / bulkReassignPersonOwner / exportSelectedPeople (src/app/people/actions.ts)"
  - "readTrashRetentionDays (src/lib/trash/settings.ts)"
provides:
  - "People list bulk selection: id-keyed rowSelection, prepended checkbox column, bar + spacer + failure report mounted"
  - "retentionDays and bulkOwners as plain serializable props from people/page.tsx"
affects:
  - "38-19 (surface parity gate) — this is one of the four wired surfaces"
  - "38-20 (browser UAT) — SC-1/SC-2/SC-3 on the People surface are now exercisable"
tech-stack:
  added: []
  patterns:
    - "TanStack rowSelection with getRowId keyed on the record id (first occurrence in this repo)"
    - "React adjust-state-during-render for clear-on-filter, because setState-in-effect is a lint error here"
    - "Defensive selectedIds = truthy rowSelection keys ∩ loadedIds"
key-files:
  created: []
  modified:
    - src/app/people/page.tsx
    - src/app/people/data-table.tsx
decisions:
  - "Clear-on-filter is implemented as React's adjust-state-during-render pattern, not the useEffect the plan specified: the effect form is a hard lint ERROR in this repo (react-hooks/set-state-in-effect), proven empirically before deviating"
  - "BulkActionBar is the final child of the root space-y-4 stack (after the two dialogs, which portal out of flow), satisfying both 'LAST element of the root stack' and 'AFTER the Load More block'"
  - "columns.tsx deliberately untouched, so the Phase 43 POLISH-01 retype has no file collision with this plan"
metrics:
  duration: ~20 min
  tasks: 3
  files-modified: 2
  completed: 2026-08-17
---

# Phase 38 Plan 16: People Surface Wiring Summary

Selection is live on the People list: id-keyed TanStack `rowSelection`, the shared checkbox column prepended, and the bulk bar, its `h-20` spacer and the per-record failure report mounted — with the retention window and an approved-only owners pool threaded from the server page as plain values.

## What Was Built

**`src/app/people/page.tsx`** — three independent reads in one `Promise.all`: the existing `getPeople`, `readTrashRetentionDays()`, and a NEW separate `db.query.users.findMany` filtered on `isNull(users.deletedAt)` AND `eq(users.status, "approved")`, mapped to `{ id, name: u.name || "Unknown" }` and passed as `bulkOwners`. `retentionDays` is passed straight through as `number | null`. The `PAGE_SIZE` constant, the cumulative `limit = PAGE_SIZE * pageNum + 1`, the `hasMore` slice and the owner `leftJoin` are byte-identical to before — the cumulative rows array is exactly what makes "selection persists across Load More" true.

**`src/app/people/data-table.tsx`** — `rowSelection` state, `getRowId: (row) => row.id`, `enableRowSelection: true`, `onRowSelectionChange: setRowSelection`, `columns: columnsWithSelect` (the shared column PREPENDED via `useSelectColumn`), the defensive `loadedIds`/`selectedIds` derivation, the empty-state `colSpan` read from `table.getAllLeafColumns().length`, clear-on-search, and the three mounts.

### Task commits

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | page.tsx — retentionDays and bulkOwners props | `611796d` | `src/app/people/page.tsx`, `src/app/people/data-table.tsx` (props interface only) |
| 2 | data-table.tsx — rowSelection, select column, colSpan | `1254621` | `src/app/people/data-table.tsx` |
| 3 | data-table.tsx — mount the bar, spacer and failure report | `af888ed` | `src/app/people/data-table.tsx` |

## Recorded Evidence (the plan's per-task acceptance criteria)

### Effect inventory — the criterion that mattered most

**`grep -c 'useEffect' src/app/people/data-table.tsx` is `0`. The file contains NO effect at all.**

So the answer to "record each effect's dependency array; none may contain `data` or `outcome`" is: there are zero effects, therefore zero effects that could clear the selection off a server-supplied array. T-38-33 is closed structurally rather than by inspection of a dependency list.

The clear-on-filter logic lives at `data-table.tsx:79-83`:

```tsx
const [prevSearch, setPrevSearch] = useState(search)
if (search !== prevSearch) {
  setPrevSearch(search)
  setRowSelection({})
}
```

The comparison value is `search` and nothing else. `data` cannot enter it — there is no dependency array to widen.

### `handleOutcome` control flow (`data-table.tsx:200-208`)

```tsx
const handleOutcome = (next: BulkOutcome) => {
  setRowSelection((prev) => {
    const remaining = { ...prev }
    for (const id of next.succeeded) delete remaining[id]
    return remaining
  })
  setOutcome(next.failed.length > 0 ? next : null)
  refresh?.()
}
```

1. **One explicit `setRowSelection`**, in the handler, never an effect. It copies the previous map and deletes only the ids in `next.succeeded`. Failed ids are preserved *by construction* — the loop never touches them. Preserving-by-omission rather than rebuilding-from-`failed` is deliberate: rebuilding would silently drop any id that was selected and appeared in neither list (a record trashed between render and submit, say), which is a selection the user made and the server never reported on.
2. `setOutcome(next.failed.length > 0 ? next : null)` — a fully successful action clears any previous report; a partial one replaces it.
3. `refresh?.()`, matching this file's `handleRecordSaved` convention exactly. `onSuccess` count in the file: **0** (the Phase 35 rename to `onRecordSaved` is intact).

### JSX mount order (line numbers as required)

| Element | Line | Position |
| ------- | ---- | -------- |
| root `<div className="space-y-4">` | 259 | — |
| search / Add Person row | 260-274 | first child |
| **`<BulkFailureReport`** | **282** | after the search row, **BEFORE** the table |
| table wrapper `<div className="rounded-md border"` | 290 | — |
| `{hasMore && (` … `Load More` … `)}` | 352-365 | — |
| `<PersonDialog` / `<DeleteDialog` | 367 / 374 | Radix portals, zero layout contribution |
| **`<BulkActionBar`** | **393** | **AFTER Load More, last child of the root stack** |

The bar is the final element, so its own `h-20` sibling spacer sits below everything — nothing above the fold moves when a selection appears (T-38-38). This is the layout defect plan 38-10 found and the reason the mount point is a criterion rather than a preference.

### Grep criteria

| Criterion | Required | Actual | |
| --------- | -------- | ------ | - |
| `readTrashRetentionDays` in page.tsx | ≥1 | 3 | ✅ |
| `retentionDays={` in page.tsx | 1 | 1 | ✅ |
| `bulkOwners={` in page.tsx | 1 | 1 | ✅ |
| `eq(users.status, "approved")` in page.tsx | 1 | 1 | ✅ |
| numeric default regex (comments stripped) | 0 | 0 | ✅ |
| `components/bulk` in page.tsx | 0 | 0 | ✅ (see Comment/Grep Collisions) |
| `getRowId: (row) => row.id` | 1 | 1 | ✅ |
| `enableRowSelection: true` | 1 | 1 | ✅ |
| `onRowSelectionChange: setRowSelection` | 1 | 1 | ✅ |
| `columnsWithSelect` | ≥2 | 2 | ✅ |
| `colSpan={columns.length}` | 0 | 0 | ✅ |
| `getAllLeafColumns` | 1 | 1 | ✅ |
| `getSelectedRowModel` | 0 | 0 | ✅ |
| `getPaginationRowModel` | 0 | 0 | ✅ |
| `BulkActionBar` | ≥2 | 2 | ✅ |
| `BulkFailureReport` | ≥2 | 2 | ✅ |
| three bulk action names | ≥6 | 6 | ✅ |
| `entityType="person"` | 1 | 1 | ✅ |
| `onSuccess` | 0 | 0 | ✅ |
| `useSelectColumn` | 1 | **2** | ⚠️ arithmetically impossible — see below |
| `git status --porcelain columns.tsx` | empty | empty | ✅ |
| `git status --porcelain globals.css table.tsx` | empty | empty | ✅ |

**`grep -c 'useSelectColumn'` cannot be 1.** `grep -c` counts LINES: the import statement is one line and the call site is another, so 2 is the arithmetic floor for a hook that is imported and used. The INTENT — exactly one usage of the shared hook, one select column, prepended once — is satisfied: line 34 is the import, line 163 is the single call. I reworded my own explanatory comment (which mentioned the hook by name) down to a paraphrase specifically to reach the floor rather than weaken the check.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] The plan's `useEffect(() => { setRowSelection({}) }, [search])` is a lint ERROR in this repo**

- **Found during:** Task 2
- **Issue:** The plan (and `38-PATTERNS.md:703`) specify a `useEffect` keyed on `[search]`. `react-hooks/set-state-in-effect` is an **error**, not a warning, under `eslint-config-next` 16 here, and the plan's own `npm run lint` 0-errors gate would have failed. I proved it rather than assumed it — a throwaway probe component containing exactly the specified effect produced:
  ```
  10:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders
        ...  react-hooks/set-state-in-effect
  ```
  (Probe deleted immediately; it never entered a commit.)
- **Fix:** React's documented adjust-state-when-a-prop-changes pattern (`data-table.tsx:79-83`), which is strictly stronger for this purpose: it clears the selection *during* the render that carries the new `search`, so no frame ever paints the stale selection, and it has no dependency array that a future edit could widen to include `data`.
- **Files modified:** `src/app/people/data-table.tsx`
- **Commit:** `1254621`
- **Effect on the acceptance criterion:** the criterion "the effect's dependency array is `[search]`" is satisfied in intent and superseded in form — the file has no effect. The prohibition it exists to enforce (never key on `data`) is now structural.

**2. [Rule 3 — Blocking] The two new props were declared in Task 1, not Task 3**

- **Found during:** Task 1
- **Issue:** Task 1's own gate is `npm run typecheck`, and `page.tsx` passing `retentionDays` / `bulkOwners` to a `DataTable` whose props interface does not accept them is a type error. Task 1 could not be committed green with the interface change deferred to Task 3.
- **Fix:** Added both fields to `DataTableProps` in Task 1's commit *without destructuring them* (destructuring an unused parameter would have tripped `no-unused-vars`). Task 3 destructures and consumes them.
- **Files modified:** `src/app/people/data-table.tsx`
- **Commit:** `611796d`

### Comment/Grep Collisions (the thirteenth and fourteenth firings)

The env brief warned this has fired twelve times across phases 37-38. It fired twice more here, and both times **the comment was reworded and the gate left alone**:

1. `grep -c 'components/bulk' src/app/people/page.tsx` came back **1**, from my own JSX comment reading "nothing from `src/components/bulk/` is imported into this server file" — the comment asserting the property was the only thing violating the check for it. Reworded to "no bulk UI module is imported into this server file" → 0.
2. `grep -c 'useSelectColumn'` came back **3** (import, call, and a comment naming the hook). Comment paraphrased to "the shared select-column hook" → 2, the arithmetic floor.

## The Rename-Normalised Twin Diff

The plan asks for `diff <(sed 's/Organization/Person/g; s/organizations/people/g' organizations/data-table.tsx) people/data-table.tsx` in full, with every remaining line justified. Two findings, one of which is a correction to the phase docs.

### Finding A — `38-PATTERNS.md:625`'s "identical" claim is wrong, and was already wrong at base

Run against the **unmodified base commit** (`dd7fd4d`), before I touched anything, the normalised diff is **already non-empty**: 21 differing line pairs. The naive `sed` renames the *type* and the *route*, but not local identifiers, the dialog module name, or the two dialog props. The pre-existing differences at base are:

| Line (base) | Organizations | People | Why it differs |
| ----------- | ------------- | ------ | -------------- |
| import | `./organization-dialog` | `./person-dialog` | module filename; `sed` renames the component, not the file |
| state | `editingOrg` / `setEditingOrg` | `editingPerson` / `setEditingPerson` | local identifier abbreviation |
| state | `orgToDelete` / `setOrgToDelete` | `personToDelete` / `setPersonToDelete` | same |
| handlers ×6 | `(org)`, `org.id`, `!orgToDelete` | `(person)`, `person.id`, `!personToDelete` | parameter naming |
| `<PersonDialog>` | `organization={editingOrg}` | `person={editingPerson}` | each dialog's own prop name |
| `<DeleteDialog>` | `organizationName={orgToDelete?.name \|\| ""}` | `personName={personToDelete ? \`${firstName} ${lastName}\` : ""}` | **genuine surface difference**: organizations have one `name` column, people have `firstName`/`lastName` |

So "byte-identical modulo the rename" holds only under a `sed` that also renames local identifiers and the dialog filename. The two files are *structurally* twins, not textually. I did not "fix" this — normalising local variable names on a surface another agent is editing concurrently would be a gratuitous conflict, and the abbreviation is not a defect.

### Finding B — the twin in this worktree is the PRE-wiring version, so the post-edit diff is not comparable as the plan imagines

Plan 38-15 is wiring `src/app/organizations/data-table.tsx` **in a parallel worktree right now**. In my worktree that file is untouched at `dd7fd4d` (`git status --porcelain src/app/organizations/data-table.tsx` → empty). The post-edit normalised diff is therefore *my entire patch* plus the pre-existing rename noise, and it cannot show "only the genuine surface differences" until both branches are merged.

**Post-edit diff, quantified:** 190 added lines, 21 removed lines.

- The **21 removed lines** are exactly: the 16 pre-existing rename lines from Finding A, plus 5 lines my patch rewrote — `import { useState, useRef } from "react"` (widened to add `useMemo`/`useCallback`), `import { deletePerson } from "./actions"` (widened to a multiline import of the four actions), the `export function DataTable({ … })` signature (two props added), `columns,` in the table options (→ `columns: columnsWithSelect`), and `colSpan={columns.length}` (→ `table.getAllLeafColumns().length`). **No pre-existing difference was disturbed and none was added.**
- The **190 added lines** are the wiring described in "What Was Built", commit-by-commit in `611796d` / `1254621` / `af888ed`. Pasting them here would reproduce the diff already in git, so they are enumerated by change rather than by line.

**Consequence for plan 38-19 (the parity gate), and the one real risk I could not design out:** the plan text for both surfaces says "the LAST element of the root stack, AFTER the `Load More` block", while `38-PATTERNS.md:706` says only "after the `Load More` block". Those permit two placements — final child of the stack (mine, line 393, after the two portalled dialogs) or immediately after the `hasMore` block and before the dialogs. Both satisfy every stated criterion and both are layout-identical, because Radix dialogs portal out of normal flow and contribute no height. I could not coordinate with the parallel agent, so **if 38-19 asserts byte parity between the twins, this is the line to reconcile** — and the reconciliation is a one-line move on whichever surface, with no behavioural consequence either way.

## Threat Mitigations Applied

| Threat ID | How it is closed here |
| --------- | --------------------- |
| T-38-36 | `getRowId: (row) => row.id` at `data-table.tsx:234`, with the reason in-file. TanStack's default is the row index and `data` is cumulative across Load More, so index keys would retarget a selection onto other records |
| T-38-37 | `selectedIds` = truthy `rowSelection` keys ∩ `loadedIds` (`:177-181`). `getSelectedRowModel` count: 0 |
| T-38-33 | No `useEffect` in the file at all; the clear compares `search` during render, and `handleOutcome` removes succeeded ids explicitly |
| T-38-06 | `where: and(isNull(users.deletedAt), eq(users.status, "approved"))` as a NEW separate query — no existing dropdown's predicate was changed, and `deals/page.tsx`'s `deletedAt`-only shape was left alone as the anti-analog it is |
| T-38-10 | `retentionDays` passed through untouched; the comment-stripped numeric-default regex over `page.tsx` returns 0 |
| T-38-26 | `page.tsx` imports no bulk UI module (grep 0) and passes only plain values; `rsc-boundary.test.tsx` 14/14 green |
| T-38-38 | Bar is the final child of the root stack; its `h-20` spacer sits below the last row and the Load More button. Line numbers recorded above |
| T-38-39 | Twin diff run and analysed in full above, including the correction that the "identical" claim never held textually |
| T-38-SC | Zero packages installed. `node_modules` was symlinked from the main checkout as instructed |

## Verification Results

| Gate | Result |
| ---- | ------ |
| `npm run typecheck` | **0 errors**, no new `@ts-expect-error` |
| `npm run lint` | **0 errors, 125 warnings** — exactly the pre-existing baseline |
| `npm test` (main project) | **2048 passed / 21 skipped** — exactly baseline |
| `npm test` (rsc project) | **8 passed** — exactly baseline |
| `vitest run "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"` | 14/14 green |
| `vitest run src/messages/locale-parity.test.ts` | 6/6 green |
| `vitest run src/components/bulk/` | 86/86 green |
| `vitest run src/app/people/` | 38/38 green (`bulk-actions.test.ts`) |
| `vitest run src/app/__tests__/record-dialog-note-failure.test.ts` | 58/58 green — the CR-03 call-site gate still recognises this file |
| `git status --porcelain src/app/people/columns.tsx src/app/globals.css src/components/ui/table.tsx` | empty — zero new CSS, no `columns.tsx` collision with Phase 43 POLISH-01 |
| `git diff --name-only dd7fd4d HEAD` | exactly `src/app/people/page.tsx`, `src/app/people/data-table.tsx` (+ this SUMMARY) |
| Per-commit deletion check | no file deletions in any of the three commits |

## Known Stubs

None. Every mount is wired to a real server action and real server-supplied data; nothing renders from a hardcoded empty value or placeholder string.

## What Is NOT Proven Here

This repo has no DOM test environment (both vitest projects are `environment: 'node'`; no jsdom, happy-dom or @testing-library, and none may be added). So the following are wired and type-checked but **not behaviourally verified** — they are plan 38-20's browser UAT, and plan 38-19's comment-stripped source gate:

- The header checkbox selecting every loaded row, and its indeterminate state.
- Selecting three rows, pressing Load More, still reading three selected.
- Changing the search clearing the selection.
- The bar never covering the last row or the Load More button at any viewport, including 320px.
- After a partial failure, the succeeded rows deselecting and the failed rows staying selected.

## Self-Check: PASSED

- `src/app/people/page.tsx` — FOUND, modified
- `src/app/people/data-table.tsx` — FOUND, modified
- `.planning/phases/38-bulk-operations/38-16-SUMMARY.md` — FOUND
- Commit `611796d` — FOUND in `git log`
- Commit `1254621` — FOUND in `git log`
- Commit `af888ed` — FOUND in `git log`
