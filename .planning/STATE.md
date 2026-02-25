# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** API-complete CRM core that handles fundamentals well — pipelines, orgs, people, deals, activities, and custom fields. Advanced features can be built externally via the API.
**Current focus:** Phase 6 - Activities & Timeline

## Current Position

Phase: 6 of 10 (Activities & Timeline) - In progress
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-02-25 — Completed 06-01 (Activity Data Layer)

Progress: [████████████████] 100% (20/20 plans in current roadmap)

## Performance Metrics

**Velocity:**
- Total plans completed: 20
- Average duration: 5min
- Total execution time: 1.9 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-authentication | 6/6 | 30min | 5min |
| 02-organizations | 3/3 | 34min | 11min |
| 03-people | 3/3 | 6min | 2min |
| 04-pipelines-stages | 4/4 | 35min | 9min |
| 05-deals-kanban | 3/3 | 30min | 10min |
| 06-activities | 1/3 | 8min | 8min |

**Recent Trend:**
- 06-01: 8min (5 tasks, 6 files, 5 commits)
- 05-03: 15min (4 tasks, 4 files, 8 commits)
- 05-02: 5min (1 task, 1 file)
- 05-01: 10min (5 tasks, 5 files)
- 04-04: 5min (2 tasks, 2 files)

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
- [03-03] Select dropdown uses watch/setValue instead of Controller for simpler radix integration
- [03-03] Linked people on org detail shown as bordered rows with name links and email
- [04-02] Gap-based positioning for stage reordering (averages neighbors, avoids full renumbering)
- [04-02] Won/lost stage uniqueness constraint (exactly one terminal stage per type per pipeline)
- [04-03] AlertDialog used for delete confirmation (destructive action pattern vs regular Dialog)
- [04-03] Set-as-default action without confirmation (non-destructive, easily reversible)
- [04-04] @dnd-kit/react for drag-and-drop with optimistic updates
- [04-04] Inline ColorPicker as button grid (simple, accessible)
- [05-01] Numeric position field for deals (vs integer for stages) for more precise gap-based positioning
- [05-01] At least one of org/person constraint enforced in action validation, not DB constraint
- [05-01] Position defaults to 10000 for new deals, increments by 10000
- [05-02] DealDialog uses watch/setValue for Select components (same pattern as people dialogs)
- [05-03] closestCorners collision detection for kanban columns (not closestCenter)
- [05-03] PointerSensor with 5px distance constraint for drag activation
- [05-03] Optimistic updates with error recovery and state sync via useEffect
- [05-03] Won/Lost stages in collapsed footer row (not drag targets)
- [05-03] Pipeline switching via query param for shareable URLs
- [06-01] Activities completedAt timestamp for completion status (null = not done)
- [06-01] Fixed IDs for default activity types (call, meeting, task, email)
- [06-01] Optional dealId FK allows activities to exist independently of deals

### Pending Todos

None yet.

### Blockers/Concerns

Issues that affect future work:

- Database migration needs to be run when PostgreSQL is available: `npx drizzle-kit migrate`

## Session Continuity

Last session: 2026-02-25 08:57 UTC
Stopped at: Completed 06-01-PLAN.md (Activity Data Layer)
Resume file: None

**Phase 6 in progress.** Activity data layer complete with schema, relations, CRUD actions, and seed script. Ready for 06-02 (Activities List UI).

---
*State initialized: 2026-02-22*
