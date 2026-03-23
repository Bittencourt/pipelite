---
phase: 20-import-state-reliability
plan: 01
subsystem: database
tags: [drizzle, jsonb, import, state-management, crash-recovery]

requires:
  - phase: 18-pipedrive-import
    provides: import_sessions table schema and in-memory state module
  - phase: 19-webhook-reliability
    provides: instrumentation.ts startup hook pattern
provides:
  - DB-backed import state CRUD functions (async Drizzle queries)
  - Startup cleanup for stale import sessions
  - userId column on import_sessions for audit trail
affects: [20-02, pipedrive-import-actions, progress-step]

tech-stack:
  added: []
  patterns: [DB-backed state management replacing in-memory Map, startup cleanup via instrumentation.ts]

key-files:
  created:
    - src/lib/import/import-session-cleanup.ts
    - drizzle/0006_import-sessions-user-id.sql
  modified:
    - src/lib/import/pipedrive-import-state.ts
    - src/db/schema/import-sessions.ts
    - src/db/schema/_relations.ts
    - instrumentation.ts

key-decisions:
  - "All state functions async with direct DB queries, no in-memory cache"
  - "clearImportState is no-op -- sessions kept for audit trail"
  - "Errors stored without details field in JSONB to keep size small"
  - "Startup cleanup wrapped in try-catch, logs error but does not throw"

patterns-established:
  - "DB-backed state: read-modify-write on JSONB progress column for atomic updates"
  - "Startup cleanup: one-shot cleanup function called from instrumentation.ts register()"

requirements-completed: [IMPORT-01, IMPORT-02]

duration: 4min
completed: 2026-03-23
---

# Phase 20 Plan 01: Import State DB Migration Summary

**DB-backed import state via Drizzle queries against import_sessions, replacing in-memory Map with startup cleanup for crash recovery**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-23T11:57:14Z
- **Completed:** 2026-03-23T12:01:02Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Rewrote all import state functions from in-memory Map to async Drizzle DB queries
- Added userId column to import_sessions schema with FK to users table
- Created startup cleanup module that transitions stale running sessions to error, deletes old idle/expired sessions
- Hooked cleanup into instrumentation.ts for automatic execution on app boot

## Task Commits

Each task was committed atomically:

1. **Task 1: Add userId column to import_sessions schema + generate migration** - `26c9a80` (feat)
2. **Task 2: Rewrite pipedrive-import-state.ts to DB-backed + create cleanup module + hook into instrumentation.ts** - `ba5c7b5` (feat)

## Files Created/Modified
- `src/db/schema/import-sessions.ts` - Added userId column referencing users table
- `src/db/schema/_relations.ts` - Added importSessionsRelations and many relation on users
- `drizzle/0006_import-sessions-user-id.sql` - Migration for user_id column
- `src/lib/import/pipedrive-import-state.ts` - Full rewrite from Map to Drizzle queries
- `src/lib/import/import-session-cleanup.ts` - New cleanup module for stale sessions
- `instrumentation.ts` - Added cleanup call on startup

## Decisions Made
- All state functions are async with direct DB queries -- no in-memory cache layer
- clearImportState is a no-op since sessions are kept for future audit trail (IMPORT-03)
- Errors stored in JSONB without the `details` field to control JSONB size
- Startup cleanup uses try-catch (logs and swallows errors) -- next restart will retry
- createImportState requires userId parameter (callers pass session.user.id)
- Migration applied via direct SQL + drizzle-kit push (drizzle-kit migrate had issues with empty migration journal)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration generation included full table CREATE statements**
- **Found during:** Task 1
- **Issue:** drizzle-kit generate produced migration with CREATE TABLE for webhook_deliveries and import_sessions (re-creating existing tables) because previous migrations used `drizzle-kit push` instead of `drizzle-kit migrate`
- **Fix:** Manually edited migration SQL to only ALTER TABLE ADD COLUMN + ADD CONSTRAINT, then applied via direct SQL and drizzle-kit push
- **Files modified:** drizzle/0006_import-sessions-user-id.sql
- **Verification:** Column confirmed via psql \d import_sessions
- **Committed in:** 26c9a80

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix was necessary to apply schema migration. No scope creep.

## Issues Encountered
- drizzle-kit migrate failed because the migration journal was empty (previous schema changes used push). Fixed by applying ALTER directly and running push to sync state.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All state functions are now async -- callers in pipedrive-api-import-actions.ts have expected type errors (4 errors)
- Plan 02 will update all callers to await the new async functions and pass userId
- TypeScript compilation is clean except for the expected caller errors

## Self-Check: PASSED

All files exist. All commits verified.

---
*Phase: 20-import-state-reliability*
*Completed: 2026-03-23*
