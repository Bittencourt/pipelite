# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** API-complete CRM core that handles fundamentals well — pipelines, orgs, people, deals, activities, and custom fields. Advanced features can be built externally via the API.
**Current focus:** Phase 2 - Organizations (Complete)

## Current Position

Phase: 2 of 10 (Organizations)
Plan: 3 of 3 in current phase
Status: Phase complete
Last activity: 2026-02-22 — Completed 02-03 (Organization CRUD Dialogs)

Progress: [█████████░] 90% (9/10 plans in current roadmap)

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: 5min
- Total execution time: 1.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-authentication | 6/6 | 30min | 5min |
| 02-organizations | 3/3 | 34min | 11min |

**Recent Trend:**
- 02-03: 15min (2 tasks, 9 files)
- 02-02: 6min (2 tasks, 5 files)
- 02-01: 13min (2 tasks, 4 files)

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

### Pending Todos

None yet.

### Blockers/Concerns

Issues that affect future work:

None yet.

## Session Continuity

Last session: 2026-02-22 20:27 UTC
Stopped at: Completed 02-03-PLAN.md
Resume file: None

**Phase 2 complete.** Ready for next phase transition.

---
*State initialized: 2026-02-22*
