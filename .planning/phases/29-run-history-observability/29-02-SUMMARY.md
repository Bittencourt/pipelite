---
phase: 29-run-history-observability
plan: 02
subsystem: ui
tags: [react, server-components, drizzle, pagination, workflow-runs]

requires:
  - phase: 29-run-history-observability
    provides: RunStatusBadge, formatDuration, workflowRuns schema, API routes
provides:
  - Runs list page with status filter and pagination
  - Workflow overview page with stats card and recent runs mini-table
  - StatusFilter client component for URL-based filtering
  - RunsTable server component with clickable rows
  - RunStatsCard with aggregate query (total, success rate, last run)
  - RecentRunsMini with 5 most recent runs
affects: [29-run-history-observability]

tech-stack:
  added: []
  patterns: [server-component-with-aggregate-sql, url-param-based-filtering]

key-files:
  created:
    - src/app/workflows/[id]/page.tsx
    - src/app/workflows/[id]/components/run-stats-card.tsx
    - src/app/workflows/[id]/components/recent-runs-mini.tsx
    - src/app/workflows/[id]/runs/page.tsx
    - src/app/workflows/[id]/runs/components/runs-table.tsx
    - src/app/workflows/[id]/runs/components/status-filter.tsx
  modified:
    - src/app/workflows/page.tsx

key-decisions:
  - "Relative time formatting inline helper rather than external library"
  - "SQL FILTER clause for aggregate success rate in single query"

patterns-established:
  - "URL-param-based server-side filtering with client Select component"
  - "Aggregate stats via Drizzle sql template with FILTER clause"

requirements-completed: [EXEC-02]

duration: 3min
completed: 2026-03-28
---

# Phase 29 Plan 02: Runs List & Workflow Overview Summary

**Runs list page with status filter/pagination and workflow overview page with aggregate stats card and recent runs mini-table**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T17:47:16Z
- **Completed:** 2026-03-28T17:50:19Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Runs list page with server-side status filtering (6 options), 20-row pagination, clickable rows linking to run detail
- Workflow overview page with stats card showing total runs, success rate, and relative last-run time from a single aggregate query
- Recent runs mini-table with 5 most recent runs and "View all runs" navigation link
- Updated workflows list page to link to overview instead of editor

## Task Commits

Each task was committed atomically:

1. **Task 1: Runs list page with table, filter, and pagination** - `080c998` (feat)
2. **Task 2: Workflow overview page with stats card, recent runs, and list page link update** - `1145482` (feat)

## Files Created/Modified
- `src/app/workflows/[id]/runs/page.tsx` - Server component runs list with auth, DB query, status filter, pagination
- `src/app/workflows/[id]/runs/components/runs-table.tsx` - Table component with status badge, duration, timestamps, empty state
- `src/app/workflows/[id]/runs/components/status-filter.tsx` - Client component Select dropdown updating URL params
- `src/app/workflows/[id]/page.tsx` - Workflow overview with name, description, active badge, edit link, stats, recent runs
- `src/app/workflows/[id]/components/run-stats-card.tsx` - Aggregate query card with total/success-rate/last-run
- `src/app/workflows/[id]/components/recent-runs-mini.tsx` - 5 most recent runs with "View all runs" link
- `src/app/workflows/page.tsx` - Updated link from /edit to overview page

## Decisions Made
- Used inline relative time formatter rather than importing a library (simple enough for "Xm/Xh/Xd ago" format)
- Used SQL FILTER clause in aggregate query for success rate (single DB round-trip for all stats)
- Failed run rows show truncated currentNodeId since node labels are not available at run level

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Run detail page (Plan 03) can build on runs list with row links already pointing to `/workflows/[id]/runs/[runId]`
- Overview page ready for additional sections as they're built

## Self-Check: PASSED

All 6 created files verified present. Both task commits (080c998, 1145482) verified in git log.

---
*Phase: 29-run-history-observability*
*Completed: 2026-03-28*
