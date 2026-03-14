---
phase: 18-db-infrastructure
plan: 01
subsystem: database
tags: [drizzle, postgres, schema, migration, jsonb, webhook-deliveries, import-sessions]

# Dependency graph
requires: []
provides:
  - webhook_deliveries table in postgres with composite index on (status, next_attempt_at)
  - import_sessions table in postgres with jsonb progress column and cancelled boolean
  - Drizzle schema files and TypeScript types for both tables
  - barrel exports in src/db/schema/index.ts for both new tables
affects:
  - 19-webhook-reliability
  - 20-import-state-reliability

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Schema-first: create Drizzle schema file, update barrel, apply via Docker restart (drizzle-kit push --force)"
    - "No forward-dependency types: progress stays plain jsonb until Phase 20 defines ImportProgressState"
    - "No FK constraints at schema layer for queue tables: Phase 19 owns webhook delivery relationships"

key-files:
  created:
    - src/db/schema/webhook-deliveries.ts
    - src/db/schema/import-sessions.ts
  modified:
    - src/db/schema/index.ts

key-decisions:
  - "No FK from webhook_deliveries.webhookId to webhooks.id — Phase 19 owns delivery relationships"
  - "progress column kept as plain jsonb (no generic type parameter) — Phase 20 defines ImportProgressState"
  - "Migration applied via Docker restart (drizzle-kit push --force in docker-entrypoint.sh), not drizzle-kit migrate"

patterns-established:
  - "Queue table pattern: text id with crypto.randomUUID(), status enum type, composite index for queue scans"
  - "Session table pattern: jsonb progress column + cancelled boolean for cancellable async operations"

# Metrics
duration: ~20min
completed: 2026-03-14
---

# Phase 18 Plan 01: DB Infrastructure Summary

**Drizzle schema files for `webhook_deliveries` and `import_sessions` tables with composite index on (status, next_attempt_at), applied to the running database via Docker restart**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-14
- **Completed:** 2026-03-14
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 3

## Accomplishments

- Created `webhook_deliveries` table with 10 columns including JSONB payload, http_status, retry_count, next_attempt_at, and a composite index on (status, next_attempt_at) for efficient queue scans in Phase 19
- Created `import_sessions` table with 6 columns including JSONB progress and boolean cancelled flag, ready for Phase 20's durable import state
- Both tables live in the running database with correct schema; TypeScript compiles cleanly and app starts without errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create webhook-deliveries and import-sessions schema files** - `6eface1` (feat)
2. **Task 2: Export new tables from schema barrel and apply migration via Docker restart** - `821e858` (feat)
3. **Task 3: Verify tables and app health** - checkpoint (human-approved, no code commit)

## Files Created/Modified

- `src/db/schema/webhook-deliveries.ts` - webhookDeliveries table definition with WebhookDeliveryStatus type, composite index, and TypeScript inference types
- `src/db/schema/import-sessions.ts` - importSessions table definition with ImportSessionStatus type and jsonb progress column
- `src/db/schema/index.ts` - added barrel exports for both new schema files

## Decisions Made

- No FK from `webhook_deliveries.webhookId` to `webhooks.id` — Phase 19 owns the delivery business logic and will wire relationships as needed; plain text column avoids a constraint that could break queue operations
- `progress` column left as plain `jsonb` with no generic type parameter — Phase 20 will define `ImportProgressState`; adding it now would create a forward dependency on a type that doesn't exist yet
- Migration applied via Docker restart (entrypoint runs `drizzle-kit push --force`) rather than a separate migration file — consistent with the project's existing migration approach

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 19 (Webhook Reliability): `webhook_deliveries` table ready; composite index on (status, next_attempt_at) enables efficient `WHERE status = 'pending' AND next_attempt_at <= NOW()` queue scans. Open blocker: cron trigger mechanism (Docker cron vs pg-boss self-scheduling) still needs decision during plan-phase.
- Phase 20 (Import State Reliability): `import_sessions` table ready; JSONB progress column and cancelled boolean in place. Phase 20 will define the `ImportProgressState` type and migrate in-memory Map state to DB-backed sessions.

---
*Phase: 18-db-infrastructure*
*Completed: 2026-03-14*
