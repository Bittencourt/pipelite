---
phase: 29-run-history-observability
plan: 03
subsystem: ui
tags: [react, next.js, collapsible, workflow-runs, json-viewer]

requires:
  - phase: 29-01
    provides: RunStatusBadge, formatDuration, workflow schema with runs/steps tables
provides:
  - Run detail page at /workflows/[id]/runs/[runId]
  - JsonViewer collapsible JSON display component
  - StepDetail expandable row with status icons and error display
  - RunStepList vertical step list with skipped node detection
affects: [29-04, 29-05]

tech-stack:
  added: []
  patterns: [skipped-node-detection-via-workflow-node-diff, collapsible-step-detail]

key-files:
  created:
    - src/app/workflows/[id]/runs/[runId]/page.tsx
    - src/app/workflows/[id]/runs/[runId]/components/json-viewer.tsx
    - src/app/workflows/[id]/runs/[runId]/components/step-detail.tsx
    - src/app/workflows/[id]/runs/[runId]/components/run-step-list.tsx
  modified: []

key-decisions:
  - "Skipped nodes detected by comparing workflow.nodes against executed step records"
  - "JsonViewer uses simple JSON.stringify with pre tag, no external library"
  - "Failed steps auto-expand on page load via useState default"

patterns-established:
  - "Skipped node detection: compare workflow definition nodes vs executed step nodeIds"
  - "Step list pattern: Collapsible rows with status icons, duration, and JsonViewer for data"

requirements-completed: [EXEC-03, EXEC-04]

duration: 3min
completed: 2026-03-28
---

# Phase 29 Plan 03: Run Detail Page Summary

**Run detail page with expandable step list, per-node input/output JSON viewer, error display, and skipped branch node detection**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T17:48:18Z
- **Completed:** 2026-03-28T17:51:11Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- JsonViewer component with collapsible JSON display, null-data guard, and accessibility (role=region, aria-label)
- StepDetail component with status icons (6 states), auto-expand on failure, opacity-50 for skipped, border-l-4 destructive for failed
- Run detail page that loads run + workflow + steps, builds node label map, detects skipped nodes, and shows run-level error banner

## Task Commits

Each task was committed atomically:

1. **Task 1: JsonViewer component** - `4b7d145` (feat)
2. **Task 2: StepDetail and RunStepList presentation components** - `cda94c2` (feat)
3. **Task 3: Run detail page with data loading, skipped detection, and wiring** - `8682e83` (feat)

## Files Created/Modified
- `src/app/workflows/[id]/runs/[runId]/components/json-viewer.tsx` - Collapsible JSON display with pre formatting
- `src/app/workflows/[id]/runs/[runId]/components/step-detail.tsx` - Expandable step row with status icons, error display, input/output viewers
- `src/app/workflows/[id]/runs/[runId]/components/run-step-list.tsx` - Server component rendering StepDetail per step with empty state
- `src/app/workflows/[id]/runs/[runId]/page.tsx` - Run detail page with auth, data loading, skipped detection, error banner

## Decisions Made
- Skipped nodes detected by comparing workflow.nodes array against executed step nodeIds -- synthetic entries appended at end of step list
- JsonViewer uses JSON.stringify with pre tag (no external library per research recommendation)
- Failed steps auto-expand via useState(status === "failed") default
- Import path fix: RunStatusBadge referenced from ../components/ relative path (one level up from [runId]/)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed RunStatusBadge import path in page.tsx**
- **Found during:** Task 3 (Run detail page)
- **Issue:** Plan suggested `../../components/run-status-badge` but correct relative path from `[runId]/page.tsx` is `../components/run-status-badge`
- **Fix:** Changed import path to correct relative reference
- **Files modified:** src/app/workflows/[id]/runs/[runId]/page.tsx
- **Verification:** `npx tsc --noEmit` shows no errors in this file
- **Committed in:** 8682e83 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minor import path correction. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Run detail page complete, ready for workflow detail stats card and mini-table (Plan 04/05)
- All components (RunStatusBadge, formatDuration, JsonViewer, StepDetail, RunStepList) available for reuse

---
*Phase: 29-run-history-observability*
*Completed: 2026-03-28*
