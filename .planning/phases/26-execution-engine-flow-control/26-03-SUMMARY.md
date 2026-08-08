---
phase: 26-execution-engine-flow-control
plan: 03
subsystem: execution
tags: [asynclocalstorage, recursion-guard, workflow-toggle, server-action, drizzle]

requires:
  - phase: 26-01
    provides: "execution types, condition evaluator, delay resolver, workflow_runs.depth column"
provides:
  - "AsyncLocalStorage-based recursion depth tracking (getCurrentExecutionDepth, runWithExecutionDepth)"
  - "createWorkflowRun depth enforcement (fails at >= 5 levels)"
  - "toggleWorkflow server action with waiting-run cancellation"
affects: [26-execution-engine-flow-control, 27-action-nodes]

tech-stack:
  added: [node:async_hooks AsyncLocalStorage]
  patterns: [AsyncLocalStorage for cross-async-boundary context propagation, server action with bulk status update]

key-files:
  created:
    - src/lib/execution/recursion.ts
    - src/lib/execution/recursion.test.ts
    - src/lib/execution/toggle.test.ts
  modified:
    - src/lib/triggers/create-run.ts
    - src/app/workflows/actions.ts

key-decisions:
  - "AsyncLocalStorage chosen for depth tracking -- propagates across async boundaries without explicit parameter threading"
  - "Recursion limit of 5 levels -- immediate failed-status creation prevents runaway chains"
  - "toggleWorkflow cancels waiting runs via bulk UPDATE...RETURNING for atomic count"

patterns-established:
  - "AsyncLocalStorage context pattern: runWithExecutionDepth wraps workflow execution to track depth"
  - "Server action bulk cancellation: UPDATE with AND conditions + .returning() for count"

requirements-completed: [EXEC-01]

duration: 3min
completed: 2026-03-28
---

# Phase 26 Plan 03: Toggle & Recursion Guard Summary

**Workflow toggle server action with waiting-run cancellation and AsyncLocalStorage-based recursion depth tracking (max 5 levels)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T01:50:44Z
- **Completed:** 2026-03-28T01:53:38Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- AsyncLocalStorage-based execution depth tracking across async boundaries
- createWorkflowRun enforces recursion depth limit of 5 -- creates failed runs at the limit
- toggleWorkflow server action enables/disables workflows with auth check
- Disabling a workflow cancels all waiting runs with clear error message and returns count
- 14 tests covering depth tracking, nesting, enforcement, toggle auth, and cancellation

## Task Commits

Each task was committed atomically:

1. **Task 1: Recursion depth tracking with AsyncLocalStorage** - `c218040` (feat, TDD)
2. **Task 2: Toggle workflow server action with waiting-run cancellation** - `dbc33f4` (feat, TDD)

## Files Created/Modified
- `src/lib/execution/recursion.ts` - AsyncLocalStorage depth tracking (getCurrentExecutionDepth, runWithExecutionDepth, MAX_RECURSION_DEPTH)
- `src/lib/execution/recursion.test.ts` - 9 tests for depth tracking and createWorkflowRun depth enforcement
- `src/lib/execution/toggle.test.ts` - 5 tests for toggleWorkflow server action
- `src/lib/triggers/create-run.ts` - Added depth parameter and recursion limit enforcement
- `src/app/workflows/actions.ts` - Added toggleWorkflow server action with waiting-run cancellation

## Decisions Made
- AsyncLocalStorage chosen for depth tracking -- propagates across async boundaries without explicit parameter threading
- Recursion limit of 5 levels with immediate failed-status creation prevents runaway workflow chains
- toggleWorkflow uses bulk UPDATE...RETURNING for atomic waiting-run cancellation with count

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed vi.mock hoisting for DB mock in recursion tests**
- **Found during:** Task 1 (recursion depth tests)
- **Issue:** vi.mock factory couldn't access variables declared outside due to hoisting -- mockInsert was undefined
- **Fix:** Used vi.hoisted() to declare mock functions before vi.mock factory runs
- **Files modified:** src/lib/execution/recursion.test.ts
- **Verification:** All 9 tests pass
- **Committed in:** c218040

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Standard vitest mock hoisting fix. No scope creep.

## Issues Encountered
- Pre-existing `execution-processor.test.ts` (untracked, from future plan 26-02) fails due to missing module -- not related to this plan's changes

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Recursion guard ready for use in execution engine processor (plan 26-02)
- Toggle action ready for UI integration
- Existing trigger matcher already filters by active=true, no changes needed

---
*Phase: 26-execution-engine-flow-control*
*Completed: 2026-03-28*
