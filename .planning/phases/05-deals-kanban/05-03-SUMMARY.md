---
phase: 05-deals-kanban
plan: 03
subsystem: ui
tags: [react, dnd-kit, drag-drop, kanban, sortable, droppable]

# Dependency graph
requires:
  - phase: 05-01
    provides: Deals schema, server actions (createDeal, updateDeal, deleteDeal, updateDealStage), formatCurrency utility
  - phase: 05-02
    provides: DealDialog component for create/edit operations
provides:
  - Full kanban board with drag-drop between stages
  - Column headers with deal counts and total values
  - Inline card expansion with edit/delete actions
  - Won/Lost footer row (collapsed display)
  - Pipeline selector dropdown
  - Optimistic updates with error recovery

affects:
  - Future phases that need deal visualization
  - Activities will reference deals from this view

# Tech tracking
tech-stack:
  added:
    - "@dnd-kit/core"
    - "@dnd-kit/sortable"
    - "@dnd-kit/utilities"
  patterns:
    - "DndContext with closestCorners for collision detection"
    - "useSortable for draggable cards"
    - "useDroppable for empty column support"
    - "DragOverlay for drag preview"
    - "Optimistic updates with server sync"
    - "Gap-based positioning for deal ordering"

key-files:
  created:
    - src/app/deals/page.tsx
    - src/app/deals/kanban-board.tsx
    - src/app/deals/kanban-column.tsx
    - src/app/deals/deal-card.tsx
  modified: []

key-decisions:
  - "closestCorners collision detection for stacked columns (not closestCenter)"
  - "PointerSensor with 5px distance constraint for drag activation"
  - "Optimistic updates with error recovery and revert on failure"
  - "Won/Lost stages shown in collapsed footer row, not as drag targets"
  - "Pipeline switching via query param for shareable URLs"

patterns-established:
  - "useDroppable on column content for empty column drop support"
  - "useSortable on card with CSS.Transform for smooth animations"
  - "Inline card expansion with edit/delete buttons"
  - "Server data syncs to local state via useEffect"

# Metrics
duration: 15min
completed: 2026-02-24
---

# Phase 5 Plan 3: Kanban Board Summary

**Complete kanban board with drag-drop between stages, inline card expansion, pipeline switching, and Won/Lost footer row.**

## Performance

- **Duration:** 15 min
- **Tasks:** 4
- **Files created:** 4
- **Commits:** 8 (4 task commits + 4 orchestrator fixes)

## Accomplishments

- Created deals page server component with pipeline query param support
- Built kanban board with DndContext, closestCorners, and drag handlers
- Implemented columns with useDroppable for empty column support
- Created deal cards with useSortable, inline expansion, edit/delete
- Added Won/Lost footer row for terminal stages
- Pipeline selector dropdown with URL sync
- Optimistic updates with error recovery

## Task Commits

Each task was committed atomically:

1. **Task 1: Create deals page server component** - `e5ec23f` (feat)
2. **Task 2: Create kanban board client component** - `4a81805` (feat)
3. **Task 3: Create kanban column component** - `665a85f` (feat)
4. **Task 4: Create deal card component** - `8e2a22a` (feat)

**Orchestrator fixes during checkpoint:**

5. **fix(05-03): add onClick handler to Add Deal button** - `0d97b73`
6. **fix(05-03): read pipeline query param for pipeline switching** - `6bb63ac`
7. **fix(05-03): sync dealsByStage state when server data refreshes** - `83d7cac`
8. **fix(05-03): orchestrator corrections** - `c63ff53`

## Files Created/Modified

- `src/app/deals/page.tsx` - Server component fetching deals and passing to kanban board
- `src/app/deals/kanban-board.tsx` - Main kanban board with DndContext, drag handlers, DragOverlay
- `src/app/deals/kanban-column.tsx` - Column component with useDroppable, stage header
- `src/app/deals/deal-card.tsx` - Card with useSortable, inline expansion, edit/delete

## Decisions Made

- **closestCorners collision:** Using closestCorners instead of closestCenter for better handling of stacked columns
- **PointerSensor constraint:** 5px distance before drag starts to prevent accidental drags on click
- **Optimistic updates:** Deal moves immediately in UI, reverts on server error
- **Won/Lost in footer:** Terminal stages displayed in collapsed row below kanban, not as drag targets
- **Pipeline via query param:** Pipeline switching updates URL for shareable links

## Deviations from Plan

### Orchestrator Fixes (Post-Checkpoint)

The following issues were discovered during human verification and fixed by the orchestrator:

**1. Add Deal button missing onClick handler**
- **Found during:** Verification step 2
- **Issue:** "Add Deal" button in page header had no onClick handler
- **Fix:** Added onClick handler to open DealDialog in create mode
- **Commit:** 0d97b73

**2. Pipeline switching not working**
- **Found during:** Verification step 12
- **Issue:** Pipeline selector dropdown didn't actually switch the displayed pipeline
- **Fix:** Read pipeline query param from searchParams and pass to KanbanBoard
- **Commit:** 6bb63ac

**3. State sync after server refresh**
- **Found during:** Testing create/update/delete operations
- **Issue:** Local dealsByStage state wasn't syncing when server data refreshed after mutations
- **Fix:** Added useEffect to sync local state when server data changes
- **Commit:** 83d7cac

**4. Minor corrections**
- **Fix:** Additional minor corrections for proper component integration
- **Commit:** c63ff53

## User Verification Passed

All verification steps completed successfully:
- [x] Add Deal button opens dialog
- [x] Pipeline switching works with URL sync
- [x] Create/update/delete deals works
- [x] Changes reflect immediately without manual refresh
- [x] Drag-drop between stages works
- [x] Stage headers show counts and values

## Next Phase Readiness

- Phase 5 complete - deals kanban is fully functional
- Ready for Phase 6: Activities & Timeline
- All deal operations tested and working

---
*Phase: 05-deals-kanban*
*Completed: 2026-02-24*
