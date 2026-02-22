# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** API-complete CRM core that handles fundamentals well — pipelines, orgs, people, deals, activities, and custom fields. Advanced features can be built externally via the API.
**Current focus:** Phase 1 - Foundation & Authentication

## Current Position

Phase: 1 of 10 (Foundation & Authentication)
Plan: 4 of 6 in current phase
Status: Executing
Last activity: 2026-02-22 — Completed 01-04 (Login, Password Reset & Logout)

Progress: [████░░░░░░] 40%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 6min
- Total execution time: 0.37 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-authentication | 4/6 | 22min | 6min |

**Recent Trend:**
- 01-01: 9min (3 tasks, 41 files)
- 01-02: 5min (3 tasks, 13 files)
- 01-03: 3min (3 tasks, 6 files)
- 01-04: 5min (3 tasks, 15 files)

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

### Pending Todos

None yet.

### Blockers/Concerns

Issues that affect future work:

None yet.

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 01-04-PLAN.md
Resume file: None

---
*State initialized: 2026-02-22*
