---
phase: 29-run-history-observability
plan: 01
subsystem: api
tags: [rest-api, serializer, workflow-runs, badge-component, vitest]

# Dependency graph
requires:
  - phase: 28-workflow-editor
    provides: workflow schema (workflowRuns, workflowRunSteps tables)
provides:
  - serializeRun and serializeRunStep functions for snake_case API output
  - formatDuration utility for human-readable durations
  - RunStatusBadge shared UI component for 6 workflow statuses
  - GET /api/v1/workflows/:id/runs (paginated, filterable)
  - GET /api/v1/workflows/:id/runs/:runId (with steps inline)
affects: [29-02, 29-03, run-history-ui, workflow-detail-page]

# Tech tracking
tech-stack:
  added: []
  patterns: [run-serializer-pattern, status-badge-pattern]

key-files:
  created:
    - src/lib/workflows/format.ts
    - src/app/workflows/[id]/runs/components/run-status-badge.tsx
    - src/app/api/v1/workflows/[id]/runs/route.ts
    - src/app/api/v1/workflows/[id]/runs/[runId]/route.ts
    - src/lib/api/__tests__/serialize-run.test.ts
    - src/lib/workflows/__tests__/format.test.ts
    - src/app/api/v1/workflows/__tests__/runs-routes.test.ts
  modified:
    - src/lib/api/serialize.ts

key-decisions:
  - "RunStatusBadge is a server component (no 'use client' needed) for simple presentation"
  - "Steps ordered by createdAt ascending in run detail endpoint"

patterns-established:
  - "Run serializer pattern: snake_case keys with toIsoString for timestamps"
  - "Status badge pattern: config map with variant/className per status"

requirements-completed: [API-03, EXEC-04]

# Metrics
duration: 6min
completed: 2026-03-28
---

# Phase 29 Plan 01: Backend Data Layer & Shared Components Summary

**REST API endpoints for workflow run history with serializers, duration formatter, and status badge component -- 17 tests passing**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-28T17:37:34Z
- **Completed:** 2026-03-28T17:43:32Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- serializeRun and serializeRunStep added to serialize.ts with full snake_case output
- formatDuration handles null, sub-second (ms), sub-minute (s), and minute ranges
- RunStatusBadge renders all 6 statuses (completed, failed, running, waiting, pending, skipped) with aria-labels
- GET /api/v1/workflows/:id/runs with pagination, optional status filter, workflow existence check
- GET /api/v1/workflows/:id/runs/:runId returns run with steps array inline
- 17 tests across 3 test files all passing GREEN

## Task Commits

Each task was committed atomically:

1. **Task 1: Serializers, formatDuration, and RunStatusBadge** - `0bfec11` (feat)
2. **Task 2: REST API routes for runs list and run detail** - `b2c5ab4` (feat)

## Files Created/Modified
- `src/lib/api/serialize.ts` - Added serializeRun and serializeRunStep functions
- `src/lib/workflows/format.ts` - formatDuration utility for human-readable durations
- `src/app/workflows/[id]/runs/components/run-status-badge.tsx` - RunStatusBadge with 6 status variants
- `src/app/api/v1/workflows/[id]/runs/route.ts` - GET runs list with pagination and status filter
- `src/app/api/v1/workflows/[id]/runs/[runId]/route.ts` - GET run detail with steps inline
- `src/lib/api/__tests__/serialize-run.test.ts` - 5 serializer tests
- `src/lib/workflows/__tests__/format.test.ts` - 8 formatDuration tests
- `src/app/api/v1/workflows/__tests__/runs-routes.test.ts` - 4 API route tests

## Decisions Made
- RunStatusBadge is a server component (no "use client" directive) since it is pure presentation with no hooks or event handlers
- Steps in run detail endpoint ordered by createdAt ascending (chronological execution order)
- Wave-0 test files created alongside implementation since 29-00 dependency did not include them

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Merged feat/workflows branch into worktree**
- **Found during:** Task 1 (reading workflow schema)
- **Issue:** Worktree was far behind feat/workflows and lacked workflow schema (workflows.ts) and serializeWorkflow
- **Fix:** Merged feat/workflows into the worktree branch to get all prerequisite code
- **Files modified:** Multiple (merge commit)
- **Verification:** Schema file exists, all imports resolve

**2. [Rule 3 - Blocking] Created test files referenced by plan verification**
- **Found during:** Task 1 and Task 2
- **Issue:** Plan verification referenced test files at __tests__/ paths that did not exist (29-00 did not create them)
- **Fix:** Created all 3 test files with proper coverage alongside implementation
- **Files modified:** 3 test files
- **Verification:** All 17 tests pass GREEN

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary to execute in the worktree environment. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in src/lib/execution/recursion.test.ts and toggle.test.ts (10 errors) -- unrelated to this plan, not fixed (out of scope)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Serializers, formatDuration, and RunStatusBadge are ready for UI plans (29-02, 29-03)
- API routes are functional and tested, ready to be consumed by client components
- No blockers for downstream plans

## Self-Check: PASSED

- All 8 files verified present on disk
- Both task commits (0bfec11, b2c5ab4) verified in git log

---
*Phase: 29-run-history-observability*
*Completed: 2026-03-28*
