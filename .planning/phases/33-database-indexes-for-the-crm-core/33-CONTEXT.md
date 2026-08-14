# Phase 33: Database Indexes for the CRM Core - Context

**Gathered:** 2026-08-14
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — schema-only, no user-facing grey areas)

<domain>
## Phase Boundary

The v1.0 CRM tables stop sequential-scanning on their hottest queries.

In scope:
- Indexes on the five named core CRM foreign keys: `deals.organization_id`, `deals.person_id`, `deals.owner_id`, `activities.deal_id`, `people.organization_id`
- Indexes backing the `deleted_at` filter columns on deals, organizations, people, activities
- Indexes on `deals.stage_id` (kanban board query) and `activities.due_date` (reminder cron query)
- A single Drizzle migration delivering all of it

Out of scope:
- Query rewrites — the goal is index-backing the queries as they exist, not restructuring them
- Indexes on the v1.2 workflow tables (`workflows.ts`, `webhooks.ts`, `webhook-deliveries.ts` already define their own)
- Application behavior changes of any kind (SC-4: the suite must pass with **no test modifications**)

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — schema-only infrastructure phase. Constraints that follow from the codebase and success criteria:

- **Definition site:** declare indexes in the Drizzle schema files under `src/db/schema/` and generate the migration with `drizzle-kit generate`, rather than hand-writing SQL. Three existing schema files (`workflows.ts`, `webhooks.ts`, `webhook-deliveries.ts`) already use Drizzle's `index()` builder, so that is the established pattern. Hand-written SQL is justified only if `drizzle-kit generate` cannot express what is needed.
- **Single migration:** SC-3 says "via a single migration" — all index DDL lands in one generated migration file, not one per table.
- **Partial vs plain on `deleted_at`:** at the planner's discretion. A partial index (`WHERE deleted_at IS NULL`) is usually the better fit for a soft-delete filter and there is precedent in this repo (STATE.md records a partial index on `next_run_at WHERE active = true` from the v1.2 work). If Drizzle cannot generate the partial form cleanly, a plain index is acceptable — document which was chosen and why.
- **No behavior change:** do not modify any test, query, or server action. SC-4 is explicit.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Drizzle `index()` builder already used in `src/db/schema/workflows.ts`, `webhooks.ts`, `webhook-deliveries.ts` — copy that pattern
- 12 existing migrations in `drizzle/`, latest `0011_simple_darwin.sql`
- Precedent for a partial index in this project (v1.2: `next_run_at WHERE active = true`)

### Established Patterns
- Schema lives in `src/db/schema/` as one file per entity plus `_relations.ts` (which exists to avoid circular imports — do not add relations there for this phase)
- Migrations generated via `npm run db:generate`, applied via `npm run db:migrate`
- Postgres reachable at `localhost:5433` from the host, `postgres:5432` inside the Docker network

### Integration Points
- `src/db/schema/deals.ts`, `organizations.ts`, `people.ts`, `activities.ts` — the four tables gaining indexes
- `drizzle/` — one new generated migration
- No application code should need to change

</code_context>

<specifics>
## Specific Ideas

The four ROADMAP success criteria are the spec.

**Verification risk the planner must confront head-on:** SC-1 and SC-2 require `EXPLAIN ANALYZE` to show an *index scan where it previously showed a sequential scan*. Postgres will prefer a sequential scan on a small table regardless of whether an index exists, because a seq scan is genuinely cheaper there. If the dev database has only a handful of rows, these two criteria cannot be demonstrated by running `EXPLAIN ANALYZE` as-is, and a naive check would either falsely fail or get "fixed" by disabling seq scans, which proves nothing.

The plan must establish the row counts first and pick an honest strategy — most likely seeding enough representative rows to make the index the cheaper plan, and capturing before/after plans against the same dataset. Do not use `SET enable_seqscan = off` as the proof; it demonstrates only that an index is usable, not that the planner will choose it.

</specifics>

<deferred>
## Deferred Ideas

- Index tuning for the v1.2 workflow tables — they already declare their own indexes
- Query restructuring or denormalization for the kanban board — out of scope; this phase only adds indexes
- A repeatable performance benchmark harness — not required by PERF-01 or PERF-02

</deferred>
