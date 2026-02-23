# Phase 4 Plan 2: Pipeline & Stage Server Actions Summary

---
phase: 04-pipelines-stages
plan: 02
subsystem: backend
tags: [server-actions, crud, pipelines, stages, admin, zod, revalidation]
---

## One-Liner

Complete server actions for pipeline and stage CRUD operations with gap-based drag-and-drop reordering, admin authorization, and transactional default stage creation.

## Status

Complete

## What Was Done

### Task 1: Pipeline CRUD Actions
Created four pipeline management actions:
- `createPipeline`: Creates pipeline with 6 default stages (Lead, Qualified, Proposal, Negotiation, Won, Lost) in a single transaction with positions 10-60
- `updatePipeline`: Updates pipeline name with admin role validation
- `deletePipeline`: Soft delete using `deletedAt` timestamp
- `setDefaultPipeline`: Atomic operation that unsets all defaults then sets target

### Task 2: Stage CRUD Actions
Created three stage management actions:
- `createStage`: Validates won/lost uniqueness (only one per pipeline), auto-assigns color using `getNextColor()`, calculates position at end
- `updateStage`: Validates name uniqueness within pipeline, won/lost type constraints on type change
- `deleteStage`: Hard delete with TODO placeholder for Phase 5 deal existence check

### Task 3: Stage Reordering Action
Created `reorderStages` action with gap-based positioning:
- Calculates new position by averaging neighbor positions
- Edge case handling: first position (halves), last position (adds 10)
- Returns early if no position change needed
- Clamps newIndex to valid range

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Gap-based positioning for reordering | Avoids full table updates; fractional positions scale indefinitely |
| Auto-assign color with getNextColor | Ensures visual variety without manual selection |
| Won/lost stage uniqueness constraint | Business rule: exactly one terminal stage per type |
| Soft delete for pipelines | Preserves data integrity for existing deals |
| Transaction for createPipeline | Ensures pipeline+stages atomicity |

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/app/admin/pipelines/actions.ts` | Created | 580-line server actions file with 8 exports |

## Key Patterns Used

- **Admin role check**: `session.user.role === "admin"` on all actions
- **Return object pattern**: `{ success: true, id } | { success: false, error }`
- **Empty strings to null**: Optional fields converted via `|| null`
- **Zod validation**: Separate schemas for create/update operations
- **revalidatePath**: Cache invalidation for list and detail pages
- **db.transaction**: For atomic multi-table operations

## Exports Summary

```typescript
// Pipeline actions
export async function createPipeline(data: { name: string })
export async function updatePipeline(id: string, data: { name?: string })
export async function deletePipeline(id: string)
export async function setDefaultPipeline(id: string)

// Stage actions
export async function createStage(data: { pipelineId, name, description?, color?, type })
export async function updateStage(id: string, data: { name?, description?, color?, type? })
export async function deleteStage(id: string)
export async function reorderStages(pipelineId: string, stageId: string, newIndex: number)
```

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Ready for Phase 4 Plan 3 (Pipeline list UI). The backend actions are complete and follow established patterns from organizations/people modules.

## Metrics

| Metric | Value |
|--------|-------|
| Duration | 16min |
| Tasks | 3/3 |
| Commits | 3 |
| Lines added | 580 |

---
*Completed: 2026-02-22*
