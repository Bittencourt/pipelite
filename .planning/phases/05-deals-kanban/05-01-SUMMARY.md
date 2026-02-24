---
phase: 05-deals-kanban
plan: 01
subsystem: database
tags: [drizzle, postgres, schema, server-actions, deals]

# Dependency graph
requires:
  - phase: 04-pipelines-stages
    provides: Stages table for deal FK relationships
  - phase: 03-people
    provides: People table for deal FK relationships
  - phase: 02-organizations
    provides: Organizations table for deal FK relationships

provides:
  - Deals table with entity relationships (stage, org, person, owner)
  - Currency formatting utility
  - Deal CRUD server actions with gap-based positioning

affects:
  - 05-02: Deal kanban UI components
  - 05-03: Deal detail view
  - 06-activities: Deal-related activities

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gap-based positioning for drag-drop reordering"
    - "Soft delete with deletedAt timestamp"
    - "At least one of org/person constraint (action-level validation)"

key-files:
  created:
    - src/db/schema/deals.ts
    - src/lib/currency.ts
    - src/app/deals/actions.ts
  modified:
    - src/db/schema/_relations.ts
    - src/db/schema/index.ts

key-decisions:
  - "Numeric position field for deals (vs integer for stages) for more precise gap-based positioning"
  - "At least one of org/person constraint enforced in action validation, not DB constraint"
  - "Position defaults to 10000 for new deals, increments by 10000"

# Metrics
duration: 10min
completed: 2026-02-24
---

# Phase 5 Plan 1: Deals Data Layer Summary

**Database schema, relations, currency utility, and server actions for deal management with drag-drop positioning**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-24T11:51:20Z
- **Completed:** 2026-02-24T12:01:30Z
- **Tasks:** 5
- **Files modified:** 5

## Accomplishments

- Deals table schema with FKs to stages, organizations, people, and users
- Full relations setup enabling Drizzle ORM queries with `with:` syntax
- Currency formatting utility with $X,XXX format (whole dollars only)
- Complete CRUD actions plus drag-drop reordering with gap-based positioning
- Database migration generated (needs DB connection to apply)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create deals schema** - `c096f10` (feat)
2. **Task 2: Add deals relations** - `7b3ae7e` (feat)
3. **Task 3: Create currency utility** - `9a27f5a` (feat)
4. **Task 4: Create deal server actions** - `a97cadc` (feat)
5. **Task 5: Generate migration** - `0168cb2` (feat)

**Additional fixes:**
- `9034ffa` (fix) - Add deal existence check to deleteStage action

**Plan metadata:** To be committed after summary creation

## Files Created/Modified

- `src/db/schema/deals.ts` - Deals table definition with FKs to stages, orgs, people, users
- `src/db/schema/_relations.ts` - Added dealsRelations and deals to all related entity relations
- `src/db/schema/index.ts` - Export deals schema
- `src/lib/currency.ts` - Currency formatting utility ($X,XXX format)
- `src/app/deals/actions.ts` - Deal CRUD and reordering actions
- `drizzle/0000_large_nick_fury.sql` - Database migration (generated)

## Decisions Made

- **Numeric position field**: Used `numeric` type for deals position (vs `integer` for stages) to allow more precise gap-based positioning during drag-drop operations
- **Action-level validation**: At least one of org/person constraint enforced in action validation, not as a DB constraint - provides better error messages and flexibility
- **Position increment**: New deals start at position 10000, increment by 10000 - allows many insertions without renumbering
- **Soft delete pattern**: Consistent with other entities using deletedAt timestamp

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added deal existence check to deleteStage action**

- **Found during:** Task 5 (migration generation)
- **Issue:** The deleteStage action had a TODO comment from Phase 4 to check for existing deals before deletion
- **Fix:** Added deal existence check that prevents deleting stages with existing deals
- **Files modified:** src/app/admin/pipelines/actions.ts
- **Verification:** TypeScript compiles successfully
- **Commit:** 9034ffa

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Critical data integrity check. Prevents orphaned deals if stage is deleted.

## Issues Encountered

- **Database migration not applied**: The migration was generated successfully but PostgreSQL was not running locally. Migration file is ready to apply when database is available:
  ```bash
  npx drizzle-kit migrate
  ```

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Deals data layer complete with all CRUD operations
- Drag-drop reordering uses gap-based positioning (averages neighbors)
- Ready for 05-02: Deal kanban UI components
- Note: Run `npx drizzle-kit migrate` when database is available to create deals table

---
*Phase: 05-deals-kanban*
*Completed: 2026-02-24*
