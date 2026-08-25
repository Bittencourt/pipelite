---
phase: 38-bulk-operations
plan: 07
subsystem: ui
tags: [tanstack-table, row-selection, checkbox, next-intl, accessibility, vitest]

# Dependency graph
requires:
  - phase: 38-bulk-operations
    provides: "38-01 — the bulk.* i18n keys (bulk.selectRow, bulk.selectAllLoaded) in all three locale files"
  - phase: 38-bulk-operations
    provides: "38-05 — the additive MinusIcon branch in checkbox.tsx that makes an indeterminate CheckedState visually distinct"
provides:
  - "buildSelectColumn — a pure, hook-free ColumnDef factory for the shared row-selection checkbox column"
  - "useSelectColumn — the 'use client' hook that resolves the two accessible names via useTranslations('bulk') and memoises the column"
  - "SelectColumnLabels — the resolved-label interface that keeps the factory pure"
  - "17 node-environment tests pinning the column definition contract with no DOM library"
affects: [38-15, 38-16, 38-17, 38-19, 38-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure factory + thin translated hook: the testable logic takes resolved label functions, the hook is the only i18n-touching layer"
    - "Column definitions as unit-testable data: render functions are invoked with hand-built context stubs and their returned element objects read, never rendered"

key-files:
  created:
    - src/components/bulk/select-column.tsx
    - src/components/bulk/select-column.test.ts
  modified: []

key-decisions:
  - "The select column lives in src/components/bulk/, not in organizations/columns.tsx or people/columns.tsx — this removes the Phase 43 POLISH-01 retype collision entirely and is what lets the accessible name be translated at all, since both page.tsx files import the STATIC columns array"
  - "Only the page-scoped TanStack selection variants are used, so the toggled set can never exceed the rows the user can see (Activities filters client-side)"
  - "The header checkbox is disabled, not hidden, on an empty result, so column widths do not jump between an empty and a non-empty response"
  - "The row checkbox's accessible name identifies the record ('Select Acme Ltda'), never the row index"
  - "buildSelectColumn is deliberately hook-free so its contract is assertable under vitest's node environment; no DOM-emulating environment or render-testing library was added"

patterns-established:
  - "Resolved-labels interface: a component factory takes (name: string) => string callbacks rather than a translator, so the factory is pure and the hook is a three-line wrapper"
  - "Element-object assertions: a render function's output is inspected by reading .props on the returned object, giving real coverage of props like aria-label and checked with zero DOM"

requirements-completed: [BULK-01]

# Metrics
duration: 9min
completed: 2026-08-17
---

# Phase 38 Plan 07: Shared Select Column Summary

**One hook-free `buildSelectColumn` factory plus a `useSelectColumn` wrapper produce the single row-selection checkbox column for Organizations, People and Activities — page-scoped select-all, tri-state header, record-naming `aria-label`s — pinned by 17 tests that never touch a DOM.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-08-17T14:13:30Z
- **Completed:** 2026-08-17T14:22:31Z
- **Tasks:** 2
- **Files created:** 2 (0 modified)

## Accomplishments

- `src/components/bulk/select-column.tsx` exports `SelectColumnLabels`, `buildSelectColumn<T>` and `useSelectColumn<T>` exactly as plans 38-15/38-16/38-17 will import them by name.
- The column definition matches the § Surface 1 contract precisely: `id: "select"`, `size: 44`, `enableSorting: false`, `enableHiding: false`, both checkboxes in a `flex items-center justify-center p-2` wrapper, cell wrapper stopping click propagation.
- Select-all is page-scoped by construction — only `getIsAllPageRowsSelected` / `getIsSomePageRowsSelected` / `toggleAllPageRowsSelected` appear in the file, and zero occurrences of the row-model-ignoring variants (T-38-22 mitigated).
- The some-but-not-all header state passes the literal `"indeterminate"`, which the plan-38-05 `MinusIcon` branch renders as a dash rather than a check (T-38-17 mitigated).
- `src/components/bulk/select-column.test.ts` runs 17 tests in vitest's `node` environment with no DOM library, no renderer and no dependency added — proving a column definition is unit-testable as data.
- Full suite went 1778 → 1795 passing (+17, the exact new count), 21 skipped, plus the 8 rsc tests. `npm run typecheck` 0 errors; `npm run lint` 0 errors / 125 pre-existing warnings — baseline unchanged.

## Task Commits

1. **Task 1: buildSelectColumn and useSelectColumn** — `7858fd9` (feat)
2. **Task 2: Pure unit coverage of the column definition contract** — `d4e6ae7` (test)

## Files Created/Modified

- `src/components/bulk/select-column.tsx` — the shared column: `SelectColumnLabels` (the resolved-label interface), `buildSelectColumn<T>` (pure factory returning `ColumnDef<T, unknown>`), `useSelectColumn<T>` (translated, `useMemo`-stabilised wrapper).
- `src/components/bulk/select-column.test.ts` — 17 pure tests across three describes: definition contract (id, size, flags, both templates), the row checkbox (accessible name derivation, selected state, `getCanSelect` gating, boolean coercion, `stopPropagation` guard), the header checkbox (tri-state `checked`, loaded-count naming, empty-result disabled state, boolean coercion).

Neither `src/app/organizations/columns.tsx` nor `src/app/people/columns.tsx` was touched, which is the whole point of the module's location — Phase 43's POLISH-01 retype has no merge surface with this phase.

## Decisions Made

- **Test file is `.ts`, not `.tsx`.** The stubs are plain objects and the assertions read `.props` off returned element objects, so no JSX is needed in the test. Keeping it `.ts` makes it structurally impossible to accidentally author a render.
- **Context stubs are hand-built and cast with `as unknown as` inside the test only**, with a comment saying so. A real `Table` instance cannot be built here (`useReactTable` is a hook), and the two templates touch only four table methods and four row methods.
- **Two boolean-coercion tests were added beyond the plan's enumerated assertions.** `onCheckedChange("indeterminate")` must reach `toggleSelected(true)` / `toggleAllPageRowsSelected(true)`; without the `!!` coercion the string would flow into selection state. Cheap to pin, and it is the one place a Radix `CheckedState` can leak into TanStack.
- **A second row-naming test** (two rows differing only by name produce two different labels) was added because a single-row assertion cannot distinguish `getLabel(row.original)` from a constant.

## Deviations from Plan

### Acceptance criteria adjusted (not weakened)

**1. Task 1's `grep -c 'useTranslations' … is 1` is arithmetically unsatisfiable as written**
- **Found during:** Task 1 verification
- **Issue:** The same task's action mandates `import { useTranslations } from "next-intl"`. `grep -c` counts matching *lines*, so the import line plus the single call line make the count 2, not 1. The only way to reach 1 would be a namespace import (`import * as intl from "next-intl"`), which is non-idiomatic for this repo and contradicts the action text.
- **Resolution:** Satisfied the criterion's *intent* rather than its arithmetic — there is exactly **one** `useTranslations` call site, inside `useSelectColumn`, and `buildSelectColumn` calls no hook at all (verified by reading both function bodies; the pure factory's own test imports it under `environment: 'node'` and passes, which would be impossible if it touched a hook). Measured count: 2 lines = 1 import + 1 call.
- **Files modified:** none (no code change needed)
- **Verification:** `grep -o 'useTranslations' select-column.tsx | wc -l` is 2; both occurrences read directly; 17 tests importing the factory pass in a node environment.

### Comment wording constrained by the source gates

**2. [Rule 3 - Blocking] Three comments had to be reworded to avoid tripping this plan's own greps**
- **Found during:** Tasks 1 and 2
- **Issue:** The plan's own prose, if pasted into a comment, trips the plan's own gates — exactly the Phase 37 failure mode the phase notes warn about. `grep -c 'getIsAllRowsSelected\|getIsSomeRowsSelected\|toggleAllRowsSelected'` must be 0, so a comment naming those functions would fail. `grep -cE 'jsdom|happy-dom|@testing-library|react-dom'` must be 0 in the test, yet the plan asks the header comment to state "there is no jsdom, no happy-dom and no @testing-library". And `grep -c 'useSelectColumn'` must be 0 in the test, yet the comment must explain why the hook is out of scope.
- **Fix:** Reworded the comments, never the gates. The source says "the variants that ignore the row model" instead of naming them; the test header says "no DOM-emulating vitest environment and no React render-testing library … and no renderer is imported"; the test refers to "the translated hook alongside it" rather than by name. All three constraints are still stated in full, in prose that survives the gate.
- **Files modified:** `src/components/bulk/select-column.tsx`, `src/components/bulk/select-column.test.ts`
- **Verification:** All Task 1 and Task 2 grep gates measured; every one at its required value except the arithmetically impossible one above.

---

**Total deviations:** 1 criterion satisfied by intent, 1 comment-wording constraint (Rule 3). Zero functional deviations.
**Impact on plan:** None. Every behavioural requirement in the plan and in § Surface 1 is implemented as specified; no scope creep, no dependency, no shared file touched.

## Threat Register Disposition

| Threat ID | Disposition | Evidence |
|-----------|-------------|----------|
| T-38-22 | mitigated | Page variants only: 3 occurrences of the page-scoped selection functions, 0 of the row-model-ignoring variants. |
| T-38-17 | mitigated | `checked` is `getIsAllPageRowsSelected() \|\| (getIsSomePageRowsSelected() && "indeterminate")`; a test asserts the literal `"indeterminate"` for the some-but-not-all case and `true`/`false` for the other two. |
| T-38-23 | mitigated | `onClick={(event) => event.stopPropagation()}` on the cell wrapper; a test invokes it and asserts `stopPropagation` was called once. |
| T-38-21 | mitigated | Imports are exactly `react` (`useMemo`), `@tanstack/react-table` (type-only), `next-intl` and `@/components/ui/checkbox`. Zero references to any server-only dispatch module. |
| T-38-SC | accepted | `git diff --stat package.json package-lock.json` is empty. No package installed, no registry fetch. |

## Known Stubs

None. The module is fully wired internally; it has no consumer yet **by design** — prepending it into the three tables is the explicit scope of plans 38-15 (Organizations), 38-16 (People) and 38-17 (Activities), and plan 38-19's `select-wiring.test.ts` is the gate that proves they did it (including the load-bearing `getRowId`). Until those land, `grep -rn "useSelectColumn" src/` finds only this module, which is the expected wave-2 state and not a stub.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema change. The module is a client-side column definition with no I/O.

## Issues Encountered

- The worktree forked from a stale commit (`cbf3229`, an end-of-phase-34 commit) rather than current HEAD — the same defect the phase notes flagged for all five wave-1 agents. The mandated `git reset --hard 2dcfcb6` corrected it; `MinusIcon` was then confirmed present in `checkbox.tsx` before any work began.
- `rtk`'s grep proxy mangles multi-match output into an unreadable aggregate, which made the acceptance-criteria greps unverifiable inline. Resolved by putting the gates in a single scratchpad shell script and running it once — every criterion is measured, not eyeballed.

## Next Phase Readiness

- `useSelectColumn` is ready for plans 38-15, 38-16 and 38-17 to consume as `const selectColumn = useSelectColumn<Organization>((o) => o.name)` followed by `useMemo(() => [selectColumn, ...columns], [selectColumn, columns])`.
- Those three plans still owe the two things this module cannot supply for them: `getRowId: (row) => row.id` on each `useReactTable` call (without it TanStack keys selection by row *index*, and cumulative `Load More` would silently retarget the selection onto different records), and the `loadedIds`-intersected `selectedIds` derivation. Plan 38-19's wiring gate is what enforces both.
- The `size: 44` value is only read by Activities (`style={{ width: header.getSize() }}`); Organizations and People auto-size the column. Nothing further is required of them.

## Self-Check: PASSED

- `src/components/bulk/select-column.tsx` — FOUND
- `src/components/bulk/select-column.test.ts` — FOUND
- `.planning/phases/38-bulk-operations/38-07-SUMMARY.md` — FOUND
- Commit `7858fd9` — FOUND
- Commit `d4e6ae7` — FOUND
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` — untouched (no status entry)

---
*Phase: 38-bulk-operations*
*Completed: 2026-08-17*
