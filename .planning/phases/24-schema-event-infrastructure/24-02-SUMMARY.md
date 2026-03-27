---
phase: 24-schema-event-infrastructure
plan: 02
subsystem: api, events
tags: [drizzle, zod, crm-events, mutations, refactoring]

requires:
  - phase: 24-01
    provides: "CRM event bus singleton (crmBus) with typed emit/on/off"
provides:
  - "Deal mutations (create, update, delete, updateStage, reorder) in src/lib/mutations/deals.ts"
  - "People mutations (create, update, delete) in src/lib/mutations/people.ts"
  - "Barrel export at src/lib/mutations/index.ts"
  - "CRM events emitted on all deal and people write operations"
affects: [24-04, 25-triggers, 26-execution-engine]

tech-stack:
  added: []
  patterns:
    - "Mutation function pattern: pure DB + event emission, no HTTP/session context"
    - "Server actions as thin wrappers: auth + mutation + revalidatePath"
    - "API routes emit CRM events via crmBus.emit instead of direct triggerWebhook"
    - "Changed field detection: compare old vs new values, pass changedFields array in event payload"

key-files:
  created:
    - src/lib/mutations/deals.ts
    - src/lib/mutations/deals.test.ts
    - src/lib/mutations/people.ts
    - src/lib/mutations/people.test.ts
    - src/lib/mutations/index.ts
  modified:
    - src/app/deals/actions.ts
    - src/app/people/actions.ts
    - src/app/api/v1/deals/route.ts
    - src/app/api/v1/deals/[id]/route.ts
    - src/app/api/v1/deals/batch/route.ts
    - src/app/api/v1/people/route.ts
    - src/app/api/v1/people/[id]/route.ts
    - src/app/api/v1/people/batch/route.ts

key-decisions:
  - "updateDealMutation returns newAssigneeUserIds and dealTitle so server action can handle email notifications"
  - "API routes emit events directly via crmBus instead of delegating to mutation functions (API routes have different auth patterns)"
  - "Ownership checks remain in server actions and API routes, mutations only check entity existence"

patterns-established:
  - "Mutation extraction: business logic in src/lib/mutations/{entity}.ts, server actions/routes become thin wrappers"
  - "Event emission in mutations: crmBus.emit after successful DB write with full payload including changedFields"
  - "Stage change detection: compare old vs new stageId, emit both deal.updated and deal.stage_changed"

requirements-completed: []

duration: 8min
completed: 2026-03-27
---

# Phase 24 Plan 02: Deal & People Mutation Extraction Summary

**Deal and people business logic extracted to shared mutation functions with CRM event emission on all write operations, eliminating direct triggerWebhook calls**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-27T01:21:35Z
- **Completed:** 2026-03-27T01:29:55Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Extracted 5 deal mutations (createDeal, updateDeal, deleteDeal, updateDealStage, reorderDeals) to src/lib/mutations/deals.ts
- Extracted 3 people mutations (createPerson, updatePerson, deletePerson) to src/lib/mutations/people.ts
- All deal and people write operations now emit typed CRM events via crmBus
- Deal stage changes emit both deal.updated and deal.stage_changed with old/new stage IDs
- Eliminated all direct triggerWebhook calls from deal and people files (server actions + API routes)
- 11 tests covering mutation operations, event emission, and input validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract deal mutations with event emission** - `58d835b` (feat)
2. **Task 2: Extract people mutations with event emission** - `798db80` (feat)

## Files Created/Modified
- `src/lib/mutations/deals.ts` - Deal mutation functions with Zod validation and CRM event emission
- `src/lib/mutations/deals.test.ts` - 7 tests for deal mutations (create, update, delete, stage change, reorder)
- `src/lib/mutations/people.ts` - People mutation functions with Zod validation and CRM event emission
- `src/lib/mutations/people.test.ts` - 4 tests for people mutations (create, update, delete)
- `src/lib/mutations/index.ts` - Barrel export for all mutations
- `src/app/deals/actions.ts` - Refactored to thin wrapper (auth + mutation + revalidate + email)
- `src/app/people/actions.ts` - Refactored to thin wrapper (auth + mutation + revalidate)
- `src/app/api/v1/deals/route.ts` - Replaced triggerWebhook with crmBus.emit
- `src/app/api/v1/deals/[id]/route.ts` - Replaced triggerWebhook with crmBus.emit, added changedFields tracking
- `src/app/api/v1/deals/batch/route.ts` - Replaced triggerWebhook with crmBus.emit
- `src/app/api/v1/people/route.ts` - Replaced triggerWebhook with crmBus.emit
- `src/app/api/v1/people/[id]/route.ts` - Replaced triggerWebhook with crmBus.emit, added changedFields tracking
- `src/app/api/v1/people/batch/route.ts` - Replaced triggerWebhook with crmBus.emit

## Decisions Made
- updateDealMutation returns newAssigneeUserIds and dealTitle so the server action can handle email notifications without re-querying
- API routes emit CRM events directly via crmBus instead of using mutation functions, because API routes have fundamentally different auth patterns (pipeline ownership vs entity ownership) and response formatting (RFC7807)
- Ownership/authorization checks remain in server actions and API routes; mutations only verify entity existence

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Mutation extraction pattern established, ready for remaining entities (orgs, activities) in Plan 04
- CRM events now flowing through bus for deal and people operations
- Webhook subscriber (from Plan 01) receives these events automatically

---
*Phase: 24-schema-event-infrastructure*
*Completed: 2026-03-27*

## Self-Check: PASSED
