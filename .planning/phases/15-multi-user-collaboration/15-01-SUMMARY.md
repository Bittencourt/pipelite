---
phase: 15-multi-user-collaboration
plan: 01
subsystem: database
tags: [drizzle, postgres, schema, migrations, relations]

# Dependency graph
requires:
  - phase: 01-foundation-authentication
    provides: users table schema for FK references
  - phase: 05-deals-kanban
    provides: deals table schema for FK references
  - phase: 06-activities
    provides: activities table schema for adding assigneeId column
provides:
  - deal_assignees join table for many-to-many deal assignments
  - assigneeId nullable FK on activities for single-user assignment
  - Drizzle relations for deal.assignees, activity.assignee, user.dealAssignments
affects:
  - 15-02
  - 15-03
  - 15-04
  - all subsequent phase 15 plans

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Join table pattern with composite PK for many-to-many relationships
    - relationName disambiguation for multiple FK relations to same table

key-files:
  created:
    - src/db/schema/deal-assignees.ts
    - drizzle/0005_happy_joseph.sql
  modified:
    - src/db/schema/activities.ts
    - src/db/schema/_relations.ts
    - src/db/schema/index.ts

key-decisions:
  - "dealAssignees uses pgTable with composite primaryKey([dealId, userId]) following Drizzle v2 array syntax"
  - "assignee relation on activitiesRelations uses relationName: 'assignedActivities' to disambiguate two one(users) relations"
  - "Migration applied directly via psql because drizzle-kit migrate tried to replay all migrations (tracking table empty)"

patterns-established:
  - "Multiple FKs to same table require relationName on both the one() call and the many() call in usersRelations"
  - "New schema files must be exported from index.ts BEFORE export * from './_relations'"

# Metrics
duration: 4min
completed: 2026-03-07
---

# Phase 15 Plan 01: Database Schema for Multi-User Collaboration Summary

**deal_assignees join table with composite PK and nullable assigneeId FK on activities, with full Drizzle relational query support and migration applied**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-07T18:31:29Z
- **Completed:** 2026-03-07T18:34:49Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Created `deal_assignees` join table with `deal_id`, `user_id`, `assigned_at` columns and composite PK
- Added nullable `assignee_id` FK column to `activities` table referencing `users`
- Updated Drizzle relations: `usersRelations` (dealAssignments, assignedActivities), `dealsRelations` (assignees), `activitiesRelations` (assignee with relationName), new `dealAssigneesRelations`
- Migration applied to running database — both DB changes confirmed via psql

## Task Commits

Each task was committed atomically:

1. **Task 1: Create deal-assignees schema and update index** - `98cb317` (feat)
2. **Task 2: Add assigneeId to activities and update all relations** - `2b4ef86` (feat)
3. **Task 3: Run Drizzle migration** - `9e2ad83` (chore)

## Files Created/Modified
- `src/db/schema/deal-assignees.ts` - New join table: dealAssignees with composite PK, dealId/userId/assignedAt
- `src/db/schema/activities.ts` - Added nullable assigneeId FK referencing users
- `src/db/schema/_relations.ts` - Added dealAssignees import, dealAssigneesRelations, updated users/deals/activities relations
- `src/db/schema/index.ts` - Added export for deal-assignees before _relations
- `drizzle/0005_happy_joseph.sql` - Migration: CREATE TABLE deal_assignees, ALTER TABLE activities ADD COLUMN assignee_id

## Decisions Made
- `dealAssignees` uses Drizzle v2 array syntax for composite PK: `(t) => [primaryKey({ columns: [t.dealId, t.userId] })]`
- `assignee` relation on `activitiesRelations` uses `relationName: 'assignedActivities'` to disambiguate two `one(users, ...)` relations on the same table (existing `owner` + new `assignee`)
- `usersRelations.assignedActivities` uses matching `relationName: 'assignedActivities'` on the `many(activities, ...)` side
- Migration applied directly via psql because `drizzle-kit migrate` attempted to replay all prior migrations (the `drizzle.__drizzle_migrations` tracking table was empty — migrations had been applied by Docker startup, not tracked)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Applied migration directly via psql instead of drizzle-kit migrate**
- **Found during:** Task 3 (Run Drizzle migration)
- **Issue:** `drizzle-kit migrate` failed with "type user_role already exists" because the `__drizzle_migrations` tracking table was empty — all prior migrations (0000-0004) had been applied by the Docker container but not recorded in the tracking table. drizzle-kit tried to replay all 5 migrations from the beginning.
- **Fix:** Extracted the SQL from migration 0005 and applied it directly via `docker compose exec postgres psql` against the running database
- **Files modified:** No additional files — the generated migration SQL file (0005_happy_joseph.sql) was committed as planned
- **Verification:** psql `\d deal_assignees` confirmed table exists with correct columns and composite PK; `\d activities | grep assignee` confirmed assignee_id column with FK constraint
- **Committed in:** 9e2ad83 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking issue)
**Impact on plan:** Fix was necessary to complete migration. The migration SQL itself is identical to plan — only the application method changed.

## Issues Encountered
- drizzle migration tracking table (`drizzle.__drizzle_migrations`) had 0 rows despite all prior migrations being applied to the database. This is a known Docker image build pattern — migrations run at app startup but not tracked via drizzle-kit's own mechanism. Applied new migration directly via psql as a one-time fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `deal_assignees` table ready for deal assignment server actions (plan 15-02)
- `activities.assignee_id` column ready for activity assignment UI (plan 15-03)
- All Drizzle relational queries can load `deal.assignees` with nested user data and `activity.assignee` without ambiguity
- No blockers for subsequent phase 15 plans

---
*Phase: 15-multi-user-collaboration*
*Completed: 2026-03-07*
