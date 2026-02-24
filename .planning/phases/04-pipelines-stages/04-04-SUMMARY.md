---
phase: 04-pipelines-stages
plan: 04
subsystem: pipelines
tags: [dnd-kit, drag-and-drop, stage-configurator, dialogs, color-picker]
---

# Phase 4 Plan 4: Pipeline Detail & Stage Configurator Summary

**One-liner:** Pipeline detail page with drag-and-drop stage reordering, stage CRUD dialogs, and color picker UI using dnd-kit.

## Metadata

| Property       | Value                                 |
| -------------- | ------------------------------------- |
| Phase          | 04-pipelines-stages                   |
| Plan           | 04-04                                 |
| Type           | execute                               |
| Wave           | 4                                     |
| Depends On     | 04-02                                 |
| Completed      | 2026-02-23                            |
| Duration       | ~10 min                               |

## Commits

| Commit  | Type | Description |
| ------- | ---- | ----------- |
| 7b1cfbb | feat | Install dnd-kit and create pipeline detail page |
| 9c05572 | feat | Create drag-and-drop stage configurator |
| 1e26600 | feat | Create stage CRUD dialogs |
| 2659d26 | fix  | Add session callback to authConfig for middleware |

## Files Modified

| File | Action | Purpose |
| ---- | ------ | ------- |
| package.json | modified | Added @dnd-kit/react and @dnd-kit/dom |
| src/app/admin/pipelines/[id]/page.tsx | created | Pipeline detail page with stages list |
| src/app/admin/pipelines/[id]/stage-configurator.tsx | created | Drag-and-drop stage reordering component |
| src/app/admin/pipelines/[id]/stage-dialog.tsx | created | Create/edit stage dialog with color picker |
| src/app/admin/pipelines/[id]/delete-stage-dialog.tsx | created | Delete stage confirmation dialog |
| src/auth/config.ts | modified | Added session callback for middleware auth |

## Tasks Completed

### Task 1: Install dnd-kit and create pipeline detail page
- Installed @dnd-kit/react and @dnd-kit/dom packages
- Created async server component for pipeline detail page
- Query pipeline by id with stages ordered by position
- Page structure with breadcrumb, header, and stage configurator

### Task 2: Create drag-and-drop stage configurator
- Created StageConfigurator client component with DragDropProvider
- SortableStage component with visual feedback (opacity, scale)
- Horizontal layout with color dots and type badges
- Optimistic update on drag with reorderStages action call

### Task 3: Create stage CRUD dialogs
- StageDialog with create/edit modes
- ColorPicker component with 8 predefined colors
- Type selector with Won/Lost uniqueness enforcement
- DeleteStageDialog with warnings for terminal stages

### Task 4: Human Verification Checkpoint
- User verified all functionality passes
- Auth bug discovered and fixed during verification

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Auth middleware session callback missing**

- **Found during:** Task 4 verification
- **Issue:** Middleware couldn't read user role from session, causing admin routes to fail
- **Fix:** Added session callback to authConfig.ts to populate session.user from JWT token
- **Files modified:** src/auth/config.ts
- **Commit:** 2659d26

## Key Decisions

1. **@dnd-kit/react with DragDropProvider** - Modern drag-and-drop library with clean API for sortable lists
2. **Optimistic updates** - Immediate visual feedback on drag before server confirms
3. **Gap-based positioning preserved** - Stage reordering uses existing gap-averaging logic from 04-02
4. **Inline ColorPicker** - Simple button grid rather than complex popover component
5. **Type uniqueness client-side check** - Disable Won/Lost options if already exists (server validates too)

## Tech Stack

### Added
- @dnd-kit/react - Drag and drop for React
- @dnd-kit/dom - DOM utilities for dnd-kit

### Patterns Established
- DragDropProvider pattern for sortable lists
- ColorPicker as inline button grid component
- Dialog composition with mode prop (create/edit)

## Success Criteria

- [x] Pipeline detail page shows all stages in order
- [x] Stages display with color dots and type badges
- [x] Drag-and-drop reordering works with optimistic update
- [x] Create stage dialog has name, description, color picker, type selector
- [x] Color picker shows 8 predefined colors
- [x] Won/Lost type options disabled if already exists
- [x] Edit stage dialog pre-fills all values
- [x] Delete stage dialog shows warning for won/lost stages
- [x] Delete blocked if deals exist (server-side check)
- [x] All mutations refresh the stage list
- [x] Human verification checkpoint passed

## Next Phase Readiness

**Phase 4 Complete.** Pipelines and stages management is fully functional:
- Pipeline list with CRUD operations
- Pipeline detail page with stage configurator
- Drag-and-drop stage reordering
- Stage CRUD with color picker and type validation
- Won/Lost stage uniqueness enforced

**Ready for Phase 5:** Deals & Pipeline Management
- Create deal with pipeline/stage assignment
- Deal list views and filtering
- Deal detail page
- Stage movement and pipeline transfer
