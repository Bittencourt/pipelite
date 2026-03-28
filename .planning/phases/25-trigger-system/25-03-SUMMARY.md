---
phase: 25-trigger-system
plan: 03
subsystem: triggers
tags: [cron, schedule, cron-parser, setTimeout, polling, workflow-automation]

# Dependency graph
requires:
  - phase: 25-trigger-system (plan 01)
    provides: trigger types, ScheduleTriggerConfig schema, createWorkflowRun utility, workflows.nextRunAt column
provides:
  - computeNextRun utility for cron/interval next-run computation
  - getScheduleTrigger extractor for triggers arrays
  - Schedule processor with atomic DB claim and overlap queuing
  - instrumentation.ts registration for boot-time schedule processing
affects: [26-execution-engine, workflow-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [atomic-claim-via-update-returning, overlap-queuing-via-pending-status, self-scheduling-setTimeout]

key-files:
  created:
    - src/lib/triggers/schedule-utils.ts
    - src/lib/triggers/schedule-utils.test.ts
    - src/lib/triggers/schedule-processor.ts
    - src/lib/triggers/schedule-processor.test.ts
  modified:
    - instrumentation.ts

key-decisions:
  - "Overlap queuing: always create pending runs even if previous run is active (no skip, no parallel)"
  - "Atomic claim via UPDATE...RETURNING sets nextRunAt to null to prevent duplicate processing"
  - "cron-parser v5 API: CronExpressionParser.parse() with .next().toDate() for cron mode"

patterns-established:
  - "Atomic claim pattern: UPDATE...RETURNING with null sentinel for schedule processor"
  - "Schedule utilities separated from processor for testability and reuse"

requirements-completed: [TRIG-04]

# Metrics
duration: 3min
completed: 2026-03-28
---

# Phase 25 Plan 03: Schedule Processor Summary

**DB-backed schedule processor with atomic claim, cron/interval computation via cron-parser v5, and overlap queuing as pending runs**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T00:43:41Z
- **Completed:** 2026-03-28T00:46:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- computeNextRun handles both interval (add minutes) and cron (cron-parser v5) modes with null safety
- Schedule processor atomically claims due workflows via UPDATE...RETURNING, preventing duplicate runs
- Overlap queuing: always creates pending runs per user decision (execution engine handles ordering)
- Registered in instrumentation.ts with 10s initial delay and 30s poll interval
- 19 tests covering both utilities and processor behavior

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1: Schedule utilities** - `0ea75e0` (test: RED) + `c071b07` (feat: GREEN)
2. **Task 2: Schedule processor** - `ec6fc7c` (test: RED) + `e937510` (feat: GREEN + instrumentation.ts)

## Files Created/Modified
- `src/lib/triggers/schedule-utils.ts` - computeNextRun (interval/cron) and getScheduleTrigger extractor
- `src/lib/triggers/schedule-utils.test.ts` - 12 unit tests for schedule utilities
- `src/lib/triggers/schedule-processor.ts` - Atomic claim processor with self-scheduling setTimeout
- `src/lib/triggers/schedule-processor.test.ts` - 7 unit tests for processor behavior
- `instrumentation.ts` - Added startScheduleProcessor() registration

## Decisions Made
- Used cron-parser v5 API (CronExpressionParser.parse) rather than v4 parseExpression
- Atomic claim sets nextRunAt to null as sentinel, then recomputes after run creation
- Overlap queuing: always create pending runs even if previous run is active (per user decision)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schedule processor ready for integration with Phase 26 execution engine
- Pending runs are queued in workflow_runs table for the execution engine to pick up in order
- All 4 trigger types now have their processing infrastructure (CRM event via subscriber, schedule via processor, webhook and manual via API routes from plan 04)

---
*Phase: 25-trigger-system*
*Completed: 2026-03-28*
