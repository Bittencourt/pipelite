---
phase: 24-schema-event-infrastructure
plan: 04
subsystem: api
tags: [mutations, event-bus, webhooks, organizations, activities, refactor]

# Dependency graph
requires:
  - phase: 24-schema-event-infrastructure (plan 02)
    provides: "Deal & people mutation pattern with CRM event emission"
provides:
  - "Shared org mutations (create/update/delete) with CRM event emission"
  - "Shared activity mutations (create/update/delete/toggle) with CRM event emission"
  - "Zero direct triggerWebhook calls in src/app/"
  - "All 4 CRM entity mutations extracted to src/lib/mutations/"
affects: [25-workflow-trigger-engine, 26-execution-engine]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Mutation extraction pattern applied to all 4 CRM entities"]

key-files:
  created:
    - src/lib/mutations/organizations.ts
    - src/lib/mutations/organizations.test.ts
    - src/lib/mutations/activities.ts
    - src/lib/mutations/activities.test.ts
  modified:
    - src/lib/mutations/index.ts
    - src/app/organizations/actions.ts
    - src/app/activities/actions.ts
    - src/app/api/v1/organizations/route.ts
    - src/app/api/v1/organizations/[id]/route.ts
    - src/app/api/v1/organizations/batch/route.ts
    - src/app/api/v1/activities/route.ts
    - src/app/api/v1/activities/[id]/route.ts
    - src/app/api/v1/pipelines/route.ts
    - src/app/api/v1/pipelines/[id]/route.ts
    - src/app/api/v1/stages/route.ts
    - src/app/api/v1/stages/[id]/route.ts
    - src/app/api/v1/custom-field-definitions/route.ts
    - src/app/api/v1/custom-field-definitions/[id]/route.ts

key-decisions:
  - "Activity API route PUT emits events directly via crmBus (API has different field mapping than mutations)"
  - "Pipeline/stage/custom-field-definition triggerWebhook calls simply removed (config entities, not CRM data)"
  - "Org batch route creates orgs one-by-one via mutation for individual event emission"

patterns-established:
  - "All 4 CRM entities (deal, person, org, activity) follow mutation extraction pattern"
  - "Webhook delivery exclusively bus-driven via subscriber"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-03-27
---

# Phase 24 Plan 04: Org/Activity Mutation Extraction Summary

**Organization and activity mutations extracted with CRM event emission; all triggerWebhook calls eliminated from src/app/**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-27T01:32:15Z
- **Completed:** 2026-03-27T01:38:30Z
- **Tasks:** 2
- **Files modified:** 21

## Accomplishments
- Extracted organization mutations (create/update/delete) with automatic CRM event emission
- Extracted activity mutations (create/update/delete/toggleCompletion) with automatic CRM event emission
- Refactored all remaining API routes to eliminate direct triggerWebhook calls
- Zero triggerWebhook references remain in src/app/ (only in deliver.ts definition and webhook subscriber)
- All 35 mutation tests pass across all entities (deals, people, orgs, activities, workflows)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract organization and activity mutations (RED)** - `9c5812d` (test)
2. **Task 1: Extract organization and activity mutations (GREEN)** - `16682a6` (feat)
3. **Task 2: Refactor API routes and eliminate triggerWebhook** - `de883a8` (feat)

## Files Created/Modified
- `src/lib/mutations/organizations.ts` - Shared org mutations with event emission
- `src/lib/mutations/organizations.test.ts` - Unit tests for org mutations (5 tests)
- `src/lib/mutations/activities.ts` - Shared activity mutations with event emission
- `src/lib/mutations/activities.test.ts` - Unit tests for activity mutations (9 tests)
- `src/lib/mutations/index.ts` - Updated barrel with org/activity exports
- `src/app/organizations/actions.ts` - Thin wrapper (auth + revalidation)
- `src/app/activities/actions.ts` - Thin wrapper (auth + revalidation + read-only queries)
- `src/app/api/v1/organizations/**` - Use mutations instead of inline writes
- `src/app/api/v1/activities/**` - Emit events via bus instead of triggerWebhook
- `src/app/api/v1/pipelines/**` - triggerWebhook removed
- `src/app/api/v1/stages/**` - triggerWebhook removed
- `src/app/api/v1/custom-field-definitions/**` - triggerWebhook removed

## Decisions Made
- Activity API route PUT handler emits events directly via crmBus rather than using updateActivityMutation, because the API has different field mapping (snake_case) and custom_fields merge logic
- Pipeline, stage, and custom-field-definition webhook calls simply removed (they are configuration entities, not CRM data entities, and don't need event bus integration)
- Organization batch route creates orgs individually via mutation to ensure each gets its own CRM event emission

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cleaned legacy triggerWebhook comment references in deals/people routes**
- **Found during:** Task 2
- **Issue:** Comments in already-refactored deals/people routes still mentioned "triggerWebhook", causing grep to report non-zero results
- **Fix:** Updated comments to remove the word "triggerWebhook"
- **Files modified:** people/route.ts, people/[id]/route.ts, people/batch/route.ts, deals/route.ts, deals/batch/route.ts
- **Committed in:** de883a8

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor comment cleanup. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 CRM entity mutations extracted to src/lib/mutations/
- CRM event bus emits events for all entity CRUD operations
- Webhook delivery is exclusively bus-driven
- Phase 24 complete -- ready for Phase 25 (Workflow Trigger Engine)

---
*Phase: 24-schema-event-infrastructure*
*Completed: 2026-03-27*
