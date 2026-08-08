---
phase: 24-schema-event-infrastructure
plan: 01
subsystem: database, events
tags: [drizzle, postgresql, eventemitter, webhooks, workflow-schema]

requires: []
provides:
  - "Four workflow tables (workflows, workflow_runs, workflow_run_steps, workflow_templates)"
  - "Typed CRM event bus singleton (crmBus) with 13 event types"
  - "Webhook bus subscriber registered at app startup"
affects: [24-02, 24-03, 24-04, 25-triggers, 26-execution-engine]

tech-stack:
  added: []
  patterns:
    - "CrmEventBus singleton via globalThis for hot-reload safety"
    - "Typed emit/on/off using CrmEventMap generic constraint"
    - "Idempotent subscriber registration with boolean guard"

key-files:
  created:
    - src/db/schema/workflows.ts
    - src/lib/events/types.ts
    - src/lib/events/bus.ts
    - src/lib/events/index.ts
    - src/lib/events/subscribers/webhook.ts
    - src/lib/events/bus.test.ts
    - src/lib/events/subscribers/webhook.test.ts
    - drizzle/0008_cuddly_sprite.sql
  modified:
    - src/db/schema/index.ts
    - src/db/schema/_relations.ts
    - instrumentation.ts

key-decisions:
  - "Used globalThis singleton pattern for CrmEventBus (same as DB connection pattern)"
  - "Added removeAllListeners method to bus for clean test isolation"
  - "Webhook subscriber uses _resetForTesting export for test cleanup"

patterns-established:
  - "CRM event emission: crmBus.emit('entity.action', payload) with typed CrmEventPayload"
  - "Bus subscriber registration: idempotent function called in instrumentation.ts register()"

requirements-completed: []

duration: 5min
completed: 2026-03-27
---

# Phase 24 Plan 01: Schema & Event Infrastructure Summary

**Four workflow Drizzle tables with migration, typed CRM event bus (13 events), and webhook bus subscriber registered at startup**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-27T01:13:49Z
- **Completed:** 2026-03-27T01:18:32Z
- **Tasks:** 1
- **Files modified:** 11

## Accomplishments
- Created workflows, workflow_runs, workflow_run_steps, workflow_templates tables with proper indexes and foreign keys
- Built typed CRM event bus with emit/on/off/removeAllListeners wrapping Node.js EventEmitter
- Defined 13 CRM event types including DealStageChangedPayload with old/new stage
- Webhook subscriber bridges all bus events to existing triggerWebhook function
- 7 tests covering bus emit/on/off, multi-listener, webhook mapping, and idempotent registration

## Task Commits

Each task was committed atomically:

1. **Task 1a: Event bus + webhook subscriber (TDD)** - `96261c1` (feat)
2. **Task 1b: Workflow schema + migration + instrumentation** - `9d1090e` (feat)

## Files Created/Modified
- `src/db/schema/workflows.ts` - Four workflow tables with types (Workflow, WorkflowRun, WorkflowRunStep, WorkflowTemplate)
- `src/lib/events/types.ts` - CrmEventMap, CrmEventPayload, DealStageChangedPayload, CrmEventName
- `src/lib/events/bus.ts` - CrmEventBus class with globalThis singleton
- `src/lib/events/index.ts` - Barrel export for events module
- `src/lib/events/subscribers/webhook.ts` - registerWebhookSubscriber bridging bus to triggerWebhook
- `src/lib/events/bus.test.ts` - 4 tests for event bus core
- `src/lib/events/subscribers/webhook.test.ts` - 3 tests for webhook subscriber
- `drizzle/0008_cuddly_sprite.sql` - Migration creating 4 tables, 6 indexes, 3 FKs
- `src/db/schema/index.ts` - Added workflow barrel export
- `src/db/schema/_relations.ts` - Added workflow relations (workflows, workflowRuns, workflowRunSteps)
- `instrumentation.ts` - Added registerWebhookSubscriber call at startup

## Decisions Made
- Used globalThis singleton pattern for CrmEventBus, consistent with the project's existing database connection pattern for hot-reload safety
- Added removeAllListeners method to CrmEventBus to enable clean test isolation between test runs
- Split task into two commits: event bus + tests first, then schema + migration + instrumentation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Drizzle migrate command failed via npm (DNS resolution for 'postgres' hostname). Applied migration SQL directly via docker exec and registered in drizzle migration tracking table manually.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Event bus ready for mutation functions to emit CRM events (Plan 02)
- Workflow schema ready for CRUD operations (Plan 04)
- Webhook subscriber already registered, will receive events once mutations start emitting

---
*Phase: 24-schema-event-infrastructure*
*Completed: 2026-03-27*
