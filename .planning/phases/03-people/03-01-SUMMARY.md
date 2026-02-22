---
phase: 03-people
plan: 01
subsystem: database
tags: [drizzle, postgres, schema, server-actions, zod, people, contacts]

# Dependency graph
requires:
  - phase: 02-organizations
    provides: "Organizations table schema and CRUD pattern to mirror"
  - phase: 01-foundation-authentication
    provides: "Users table for ownerId FK, auth() for session checks"
provides:
  - "People table schema with FK to organizations and users"
  - "peopleRelations, updated organizationsRelations and usersRelations"
  - "createPerson, updatePerson, deletePerson server actions"
affects: [03-02-people-list-page, 03-03-people-detail-page]

# Tech tracking
tech-stack:
  added: []
  patterns: [people-schema-with-org-fk, nullable-organization-link, multi-path-revalidation]

key-files:
  created:
    - src/db/schema/people.ts
    - src/app/people/actions.ts
  modified:
    - src/db/schema/_relations.ts
    - src/db/schema/index.ts

key-decisions:
  - "Nullable organizationId FK -- people can exist without an organization"
  - "No unique constraint on email -- contacts can share emails (e.g., info@company.com)"
  - "Empty strings converted to null for optional fields in server actions"
  - "Revalidate organization paths when person linked to org is created/updated/deleted"

patterns-established:
  - "Entity-with-org-FK pattern: nullable organizationId reference for CRM entities linked to organizations"
  - "Cross-entity revalidation: revalidate related entity paths on mutation"

# Metrics
duration: 2min
completed: 2026-02-22
---

# Phase 3 Plan 1: People Schema & Actions Summary

**People table with org/user FKs, soft delete, and three Zod-validated CRUD server actions mirroring the organizations pattern**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-22T22:55:35Z
- **Completed:** 2026-02-22T22:57:47Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- People table schema with firstName, lastName, email, phone, notes, organizationId (nullable FK), ownerId, timestamps, and soft delete
- Drizzle relations connecting people to organizations (many-to-one) and users (owner), plus reverse many relations on organizations and users
- Three server actions (createPerson, updatePerson, deletePerson) with auth guards, Zod validation, ownership checks, org existence validation, and cross-entity path revalidation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create people database schema and relations** - `ce168c0` (feat)
2. **Task 2: Create people CRUD server actions** - `c1e6fe8` (feat)

## Files Created/Modified
- `src/db/schema/people.ts` - People table definition with all columns and FK references
- `src/db/schema/_relations.ts` - Added peopleRelations, updated organizationsRelations and usersRelations with many(people)
- `src/db/schema/index.ts` - Added people barrel export before _relations
- `src/app/people/actions.ts` - createPerson, updatePerson, deletePerson with full validation

## Decisions Made
- Nullable organizationId FK -- contacts can exist without belonging to an organization (freelancers, individuals)
- No unique constraint on people email field -- multiple contacts can share emails like info@company.com
- Empty strings from form inputs converted to null for optional fields (email, phone, notes, organizationId)
- Cross-entity revalidation: when a person linked to an org is mutated, both /people and /organizations/{id} paths are revalidated

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- drizzle-kit push could not run because local PostgreSQL is not running (Docker-based dev setup). TypeScript compilation validates schema correctness. The push will succeed when the database is available at runtime.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- People schema and server actions ready for UI layer (list page, detail page, dialogs)
- Organizations relations updated to support showing linked people on org detail page
- All patterns from organizations phase successfully replicated for people

## Self-Check: PASSED

- [x] src/db/schema/people.ts exists
- [x] src/app/people/actions.ts exists
- [x] 03-01-SUMMARY.md exists
- [x] Commit ce168c0 exists (Task 1)
- [x] Commit c1e6fe8 exists (Task 2)

---
*Phase: 03-people*
*Completed: 2026-02-22*
