---
phase: 04
plan: 01
subsystem: database
tags: [schema, drizzle, pipelines, stages, relations, colors]
completed: 2026-02-22
duration: 5min
---

# Phase 04 Plan 01: Pipeline & Stage Schema Summary

**One-liner:** Database schema for pipelines, stages, and visibility with typed stage enum, color utility, and admin navigation update.

## What Was Built

### 1. Pipeline and Stage Database Schema
- **pipelines table**: Core pipeline entity with id, name, isDefault flag, ownerId, timestamps, and soft delete
- **stages table**: Stage entity linked to pipeline via FK, with name, description, color key, type enum, and position
- **stageTypeEnum**: PostgreSQL enum with 'open', 'won', 'lost' values for deal progression states
- **pipelineVisibility table**: Junction table for pipeline-user visibility with composite primary key
- **Unique constraint**: On (pipelineId, name) to prevent duplicate stage names within a pipeline

### 2. Database Relations
- **pipelinesRelations**: One-to-one with users (owner), one-to-many with stages
- **stagesRelations**: One-to-one with pipelines

### 3. Stage Colors Utility
- **STAGE_COLORS**: 8 color palette (slate, blue, emerald, amber, rose, violet, cyan, orange)
- **StageColor type**: Type-safe color key
- **getNextColor()**: Returns least-used color for auto-assigning new stages

### 4. Admin Navigation
- Added "Pipelines" link to admin sidebar with Layers icon

## Files Modified

| File | Action | Purpose |
|------|--------|---------|
| src/db/schema/pipelines.ts | Created | Pipeline, stage, and visibility schema |
| src/db/schema/_relations.ts | Modified | Added pipeline and stage relations |
| src/db/schema/index.ts | Modified | Export pipelines schema |
| src/lib/stage-colors.ts | Created | Color palette utility for stages |
| src/components/admin-sidebar.tsx | Modified | Added Pipelines navigation |

## Decisions Made

1. **isDefault as integer**: Used integer (0/1) instead of boolean for simple toggle matching SQLite compatibility patterns
2. **Gap-based positioning**: Position uses integers (10, 20, 30...) to allow inserting stages without reordering
3. **8-color palette**: Selected visually distinct Tailwind colors suitable for stage indicators
4. **No pipelineVisibility relations**: Junction tables often don't need explicit relations; can be added later if needed

## Verification

- [x] All tables compile without TypeScript errors
- [x] Relations follow established patterns from organizations/people
- [x] Stage colors utility exports all required items
- [x] Admin sidebar renders with Pipelines link

## Next Phase Readiness

Ready for 04-02: Pipeline CRUD operations (create, read, update, delete pipelines via admin UI).

## Deviations from Plan

None - plan executed exactly as written.
