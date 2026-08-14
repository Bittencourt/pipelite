---
phase: 25-trigger-system
plan: 01
subsystem: database, api
tags: [zod, drizzle, triggers, cron-parser, jsonb, workflow]

# Dependency graph
requires:
  - phase: 24-schema-event-infrastructure
    provides: workflows table, workflowRuns table, CRM event types
provides:
  - Trigger config Zod schemas (crm_event, schedule, webhook, manual)
  - TriggerEnvelope interface for workflow run trigger data
  - createWorkflowRun shared utility
  - Migrated workflows schema with triggers array, next_run_at, webhook_secret
  - cron-parser library installed
affects: [25-02-crm-event-listener, 25-03-schedule-poller, 25-04-webhook-receiver]

# Tech tracking
tech-stack:
  added: [cron-parser@5.5.0]
  patterns: [discriminated-union-zod-schemas, trigger-envelope-pattern, triggers-array-column]

key-files:
  created:
    - src/lib/triggers/types.ts
    - src/lib/triggers/types.test.ts
    - src/lib/triggers/create-run.ts
    - src/lib/triggers/create-run.test.ts
    - drizzle/0009_trigger_array_migration.sql
  modified:
    - src/db/schema/workflows.ts
    - src/lib/mutations/workflows.ts
    - src/lib/mutations/workflows.test.ts
    - src/lib/api/serialize.ts
    - src/app/api/v1/workflows/route.ts
    - src/app/api/v1/workflows/[id]/route.ts

key-decisions:
  - "Manual migration SQL to safely wrap existing trigger data in array before dropping column"
  - "Partial index on next_run_at WHERE active=true for efficient schedule polling"
  - "workflowTemplates table keeps singular trigger column (separate concern, not in scope)"

patterns-established:
  - "TriggerEnvelope: standardized shape for all trigger types when creating workflow runs"
  - "Triggers array: workflows support multiple triggers per workflow (max 20)"

requirements-completed: [TRIG-03]

# Metrics
duration: 7min
completed: 2026-03-28
---

# Phase 25 Plan 01: Trigger Foundation Summary

**Trigger type Zod schemas (4 types), workflows trigger->triggers array migration, and createWorkflowRun utility with cron-parser installed**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-28T00:36:04Z
- **Completed:** 2026-03-28T00:43:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Four trigger type Zod schemas with discriminated union validation (crm_event, schedule, webhook, manual)
- Safe database migration from singular trigger (jsonb) to triggers array (jsonb[]) with data preservation
- createWorkflowRun utility for inserting pending workflow_run rows with trigger envelope
- cron-parser library installed for future schedule trigger support

## Task Commits

Each task was committed atomically:

1. **Task 1: Install cron-parser, create trigger types and Zod schemas** - `13f41c8` (feat)
2. **Task 2: Schema migration and createWorkflowRun utility** - `6f326db` (feat)

## Files Created/Modified
- `src/lib/triggers/types.ts` - Trigger config Zod schemas and TriggerEnvelope type
- `src/lib/triggers/types.test.ts` - 20 tests covering all trigger type validation
- `src/lib/triggers/create-run.ts` - Shared utility to create workflow_run rows
- `src/lib/triggers/create-run.test.ts` - 3 tests for createWorkflowRun
- `drizzle/0009_trigger_array_migration.sql` - Safe migration: trigger -> triggers array + new columns
- `src/db/schema/workflows.ts` - Updated schema with triggers array, nextRunAt, webhookSecret
- `src/lib/mutations/workflows.ts` - Updated to use triggers (plural)
- `src/lib/mutations/workflows.test.ts` - Updated mock data for triggers array
- `src/lib/api/serialize.ts` - serializeWorkflow uses triggers (plural)
- `src/app/api/v1/workflows/route.ts` - API schema uses triggers array
- `src/app/api/v1/workflows/[id]/route.ts` - API schema uses triggers array

## Decisions Made
- Created manual migration SQL instead of drizzle-kit generate to ensure safe data transformation (wrapping existing trigger object in array)
- Added partial index on next_run_at for efficient schedule polling (WHERE active=true AND next_run_at IS NOT NULL)
- Left workflowTemplates table with singular trigger column (separate concern, templates not yet in active use)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Docker container npm install failed due to permissions; installed cron-parser on host instead (host-mounted node_modules shared with container)
- drizzle-kit generate requires interactive input for column renames; created migration manually with proper data transformation

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All trigger types defined and validated with Zod
- createWorkflowRun utility ready for CRM event listener (25-02), schedule poller (25-03), and webhook receiver (25-04)
- Database schema migrated with triggers array column and supporting indexes

---
*Phase: 25-trigger-system*
*Completed: 2026-03-28*
