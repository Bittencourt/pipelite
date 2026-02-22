# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** API-complete CRM core that handles fundamentals well — pipelines, orgs, people, deals, activities, and custom fields. Advanced features can be built externally via the API.
**Current focus:** Phase 3 - People (In Progress)

## Current Position

Phase: 3 of 10 (People)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-22 — Completed 03-02 (People List Page & Navigation)

Progress: [██████████] 100% (11/13 plans in current roadmap)

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: 5min
- Total execution time: 1.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-authentication | 6/6 | 30min | 5min |
| 02-organizations | 3/3 | 34min | 11min |
| 03-people | 2/3 | 4min | 2min |

**Recent Trend:**
- 03-02: 2min (2 tasks, 8 files)
- 03-01: 2min (2 tasks, 4 files)
- 02-03: 15min (2 tasks, 9 files)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [01-01] Relations defined in _relations.ts to avoid circular imports between schema files
- [01-01] Simplified db client to single pool; drizzle-kit handles its own migration connection
- [01-01] nodemailer v7 used despite next-auth beta peer dep on v6 (backward-compatible)
- [01-02] JWT strategy instead of database sessions -- Credentials provider always uses JWT; session callback fetches fresh DB user data for mutable state
- [01-02] Adapter type cast to resolve @auth/core version mismatch between @auth/drizzle-adapter and next-auth
- [01-02] Fire-and-forget lastUsedAt update in API key validation to avoid blocking on non-critical write
- [01-03] Domain whitelist checked BEFORE user existence check to prevent email enumeration
- [01-03] First user auto-promoted to admin role (self-hosted bootstrapping pattern)
- [01-03] Verification tokens stored as SHA-256 hash; raw token sent via email
- [01-03] Anti-enumeration: same response message whether email exists or not
- [01-04] Remember me implemented via custom JWT expiry (30 days) set in jwt callback
- [01-04] Kept Geist fonts from scaffold instead of switching to Inter
- [01-04] Auth layout min-height adjusted for NavHeader (calc(100vh-3.5rem))
- [01-05] Fire-and-forget approval email without await to avoid blocking
- [01-05] Soft delete on rejection: deletedAt + status:rejected rather than hard delete
- [01-06] API keys shown in full exactly once on creation/regeneration
- [02-01] Text IDs with crypto.randomUUID() matching users table pattern
- [02-01] Soft delete pattern with deletedAt timestamp (consistent with users)
- [02-01] Ownership via ownerId foreign key to users table
- [02-01] Return object pattern: { success: true/false, error/id } for all actions
- [02-02] Followed admin/users data-table pattern for consistency
- [02-02] Owner name fetched via left join in server component
- [02-03] Separate client component for detail page dialog state
- [02-03] table.meta pattern for passing callbacks to column cells
- [03-01] Nullable organizationId FK -- people can exist without an organization
- [03-01] No unique constraint on people email -- contacts can share emails
- [03-01] Empty strings converted to null for optional fields in server actions
- [03-01] Cross-entity revalidation: mutating person revalidates linked org paths
- [03-02] Org join filtered by deletedAt in join condition to hide soft-deleted orgs from people list
- [03-02] Stub dialogs with typed props for compilation; Plan 03 replaces with real implementations
- [03-02] Organizations passed as prop to DataTable for future person dialog dropdown

### Pending Todos

None yet.

### Blockers/Concerns

Issues that affect future work:

None yet.

## Session Continuity

Last session: 2026-02-22 23:02 UTC
Stopped at: Completed 03-02-PLAN.md
Resume file: None

**Phase 3 in progress.** People list page and navigation complete, dialogs and detail page next (Plan 03).

---
*State initialized: 2026-02-22*
