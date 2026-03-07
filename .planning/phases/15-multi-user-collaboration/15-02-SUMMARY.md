---
phase: 15-multi-user-collaboration
plan: 02
subsystem: components, server-actions
tags: [assignee-picker, deal-actions, authorization, drizzle]

# Dependency graph
requires:
  - phase: 15-multi-user-collaboration
    plan: 01
    provides: deal_assignees join table schema and dealAssignees Drizzle export
provides:
  - AssigneePicker reusable multi-select component
  - createDeal with assignee insertion into deal_assignees
  - updateDeal with atomic assignee replacement (delete + bulk insert)
  - admin authorization on all four deal mutation actions
affects:
  - 15-03 (deal dialog will wire AssigneePicker)
  - 15-04 (team view reads assignees)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Controlled multi-select via Popover + Command with toggle function
    - Atomic assignee replacement: delete all then bulk insert
    - Owner OR admin authorization pattern for deal mutations

key-files:
  created:
    - src/components/assignee-picker.tsx
  modified:
    - src/app/deals/actions.ts
    - src/app/deals/deal-dialog.tsx

key-decisions:
  - "AssigneePicker uses Popover + Command (not Select) to support search and multi-select"
  - "Assignee replacement in updateDeal is atomic delete-all + bulk insert rather than diff-based"
  - "deal-dialog.tsx passes assigneeIds: [] as placeholder until plan 03 adds picker UI"

# Metrics
duration: 2min
completed: 2026-03-07
---

# Phase 15 Plan 02: AssigneePicker Component and Deal Actions Summary

**AssigneePicker Popover+Command multi-select component and deal actions with assignee persistence and owner-or-admin authorization**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-07T18:37:03Z
- **Completed:** 2026-03-07T18:39:06Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `src/components/assignee-picker.tsx` — controlled Popover+Command multi-select with Check icon toggle, searchable CommandInput, and configurable placeholder
- Updated `src/app/deals/actions.ts` with `assigneeIds` field in dealSchema, `dealAssignees` import, assignee insertion in `createDeal`, atomic assignee replacement in `updateDeal`, and admin authorization on all four deal mutation actions (`updateDeal`, `deleteDeal`, `updateDealStage`, `reorderDeals`)
- Fixed `deal-dialog.tsx` to pass `assigneeIds: []` so existing dialog compiles while plan 03 adds the picker UI

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AssigneePicker component** - `b3d5cc6` (feat)
2. **Task 2: Update deal actions for assignees and authorization** - `58527a3` (feat)

## Files Created/Modified

- `src/components/assignee-picker.tsx` - New AssigneePicker: Popover+Command, toggle function, Check icon selection state, plural trigger label
- `src/app/deals/actions.ts` - Added dealAssignees import, assigneeIds to dealSchema, createDeal inserts assignees, updateDeal replaces assignees atomically, all 4 mutations check owner OR admin
- `src/app/deals/deal-dialog.tsx` - Added assigneeIds: [] to createDeal/updateDeal call (placeholder until plan 03)

## Decisions Made

- `AssigneePicker` uses `Popover + Command` rather than a Select because Command provides built-in text search (CommandInput) which is essential for large user lists
- Assignee replacement in `updateDeal` uses delete-all + bulk insert rather than a diff-based approach — simpler, atomic, no partial state possible
- `deal-dialog.tsx` passes `assigneeIds: []` as a placeholder so the existing dialog does not break; plan 03 will add the AssigneePicker UI and wire the real value

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added assigneeIds: [] to deal-dialog.tsx**
- **Found during:** Task 2 verification (TypeScript check)
- **Issue:** `deal-dialog.tsx` calls `createDeal`/`updateDeal` without `assigneeIds`, which is now required (has `.default([])` but TypeScript infers the input type still requires it)
- **Fix:** Added `assigneeIds: [] as string[]` to the `dealData` object in deal-dialog.tsx
- **Files modified:** `src/app/deals/deal-dialog.tsx`
- **Commit:** 58527a3

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor — the dialog fix was a one-line addition. Plan 03 will replace `[]` with the live AssigneePicker value when it wires the full dialog.

## Issues Encountered

None beyond the TypeScript error from deal-dialog, which was immediately fixed.

## User Setup Required

None.

## Next Phase Readiness

- `AssigneePicker` is ready for wiring into deal dialog (plan 15-03)
- `createDeal` and `updateDeal` accept and persist `assigneeIds`
- All deal mutations allow admin role in addition to owner
- No blockers for plan 15-03 or 15-04

---

*Phase: 15-multi-user-collaboration*
*Completed: 2026-03-07*

## Self-Check: PASSED

- src/components/assignee-picker.tsx: FOUND
- src/app/deals/actions.ts: FOUND
- commit b3d5cc6: FOUND
- commit 58527a3: FOUND
