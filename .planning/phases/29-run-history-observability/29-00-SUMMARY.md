---
phase: 29-run-history-observability
plan: 00
subsystem: testing
tags: [vitest, tdd, api-tests, workflow-runs]

# Dependency graph
requires: []
provides:
  - 15 RED test stubs for run history serialization, formatting, and API routes
affects: [29-run-history-observability]

# Tech tracking
tech-stack:
  added: []
  patterns: [TDD RED phase - test stubs before production code]

key-files:
  created:
    - src/lib/api/__tests__/serialize-run.test.ts
    - src/lib/workflows/__tests__/format.test.ts
    - src/app/api/v1/workflows/__tests__/runs-routes.test.ts
  modified: []

key-decisions:
  - "Used dynamic imports in API route tests to capture module-not-found errors at test level"
  - "Mock withApiAuth as pass-through function for route handler testing"
  - "Promise.resolve for Next.js async route params pattern"

patterns-established:
  - "API route test pattern: vi.mock auth + db, dynamic import of route handler, NextRequest construction"

requirements-completed: [EXEC-02, EXEC-04, API-03]

# Metrics
duration: 2min
completed: 2026-03-28
---

# Phase 29 Plan 00: Test Stubs Summary

**15 failing TDD test stubs covering serializeRun/Step, formatDuration, and runs API routes**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-28T17:36:41Z
- **Completed:** 2026-03-28T17:39:06Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- 5 test stubs for serializeRun and serializeRunStep (snake_case conversion, ISO dates, null handling)
- 5 test stubs for formatDuration (null, ms, seconds, minutes, running duration)
- 5 test stubs for runs API routes (pagination, status filter, 404s, inline steps)

## Task Commits

Each task was committed atomically:

1. **Task 1: Test stubs for serializeRun, serializeRunStep, and formatDuration** - `93e6841` (test)
2. **Task 2: Test stubs for API route handlers** - `9b3484a` (test)

## Files Created/Modified
- `src/lib/api/__tests__/serialize-run.test.ts` - 5 tests for run/step serialization to snake_case with ISO dates
- `src/lib/workflows/__tests__/format.test.ts` - 5 tests for human-readable duration formatting
- `src/app/api/v1/workflows/__tests__/runs-routes.test.ts` - 5 tests for runs list and detail API endpoints

## Decisions Made
- Used dynamic imports in API route tests so each test captures module-not-found errors individually
- Mocked withApiAuth as a pass-through function that provides userId and keyId to handlers
- Used Promise.resolve for Next.js async route params (matching Next.js 16 pattern)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 15 test stubs ready for Plans 01-03 to implement production code against
- Tests will go GREEN as serialization functions, format utilities, and API routes are built

## Self-Check: PASSED

All 3 test files exist. Both task commits verified (93e6841, 9b3484a).

---
*Phase: 29-run-history-observability*
*Completed: 2026-03-28*
