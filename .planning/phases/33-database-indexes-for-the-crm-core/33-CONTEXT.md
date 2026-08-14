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

### Acceptance & Verification (locked after research)
- **D-01**: `Bitmap Heap Scan` ← `Bitmap Index Scan using deals_stage_id_idx` **satisfies SC-1**. A plain `Index Scan` node is physically unachievable at any selectivity where the index wins (a ~3,753-row scattered fetch is inherently a bitmap plan). This acceptance must be stated explicitly in the plan and in verification so `/gsd:verify-work` cannot false-fail on node-name wording. SC-2 is unaffected and does produce a literal `Index Scan`.
- **D-02**: All eleven indexes are **plain, not partial**. Drizzle 0.45.1 can express partial indexes, but on this data a partial `(stage_id) WHERE deleted_at IS NULL` is byte-identical in size and cost to the plain form **and** breaks the stage-delete guard at `src/app/admin/pipelines/actions.ts:483-489`, which queries `stage_id` with no `deleted_at` filter.
- **D-03**: Do **not** use `.concurrently()`. `drizzle-kit migrate` wraps migrations in `session.transaction()`, and Postgres forbids `CREATE INDEX CONCURRENTLY` inside a transaction — it would hard-fail the migration.
- **D-04**: Do **not** create a composite `(stage_id, position)` index. Measured: `position` defeats btree deduplication, the index grows 200 kB → 1696 kB, bitmap cost exceeds seq scan, and the planner reverts to `Seq Scan` — it would actively fail SC-1.
- **D-05**: `deals.owner_id` cannot be demonstrated via `EXPLAIN` (`n_distinct = 1` — every deal shares one owner, so the planner correctly ignores the index). Verify SC-3 by `pg_indexes` catalog assertion across all eleven columns, not by EXPLAIN.
- **D-06**: Indexes are declared in the Drizzle **schema files** and generated, never hand-written into migration SQL. `workflows_next_run_at_idx` was hand-written into `0009` and silently dropped by `0010` because it existed in the snapshot but never in `workflows.ts` — that scar is why. STATE.md's "partial index precedent" no longer exists in the database; treat it as a cautionary tale, not a pattern.
- **D-07**: BEFORE-capture of both `EXPLAIN ANALYZE` plans must happen **before** the migration is applied, or SC-1/SC-2's "previously showed a sequential scan" clause becomes unprovable. Task ordering is non-negotiable.
- **D-08**: `random_page_cost = 4` (SSD-inappropriate default) is why the selectivity crossover sits at 15–19%. Out of scope — it is server config, not an index.

### Claude's Discretion
All implementation choices are at Claude's discretion — schema-only infrastructure phase. Constraints that follow from the codebase and success criteria:

- **Definition site:** declare indexes in the Drizzle schema files under `src/db/schema/` and generate the migration with `drizzle-kit generate`, rather than hand-writing SQL. Three existing schema files (`workflows.ts`, `webhooks.ts`, `webhook-deliveries.ts`) already use Drizzle's `index()` builder, so that is the established pattern. Hand-written SQL is justified only if `drizzle-kit generate` cannot express what is needed.
- **Single migration:** SC-3 says "via a single migration" — all index DDL lands in one generated migration file, not one per table.
- ~~**Partial vs plain on `deleted_at`:** at the planner's discretion.~~ **SUPERSEDED by D-02** — research measured this and locked it to plain indexes. Not a discretionary choice.
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

**The small-table risk originally recorded here is VOID — research measured the live DB.** It holds 25,206 deals / 79,023 activities / 46,055 orgs / 38,345 people. Both named queries genuinely sequential-scan today and both flip to index-driven plans with **no seeding needed**. Do not seed — the dev database contains real imported CRM data.

`SET enable_seqscan = off` remains prohibited: it only applies a cost penalty, so it proves an index is *usable*, never that the planner *prefers* it.

**The real risk is selectivity, not table size.** The measured crossover on `deals` sits between 15% and 19% of the table. The pipeline the kanban page actually loads is `BDR - Base Fria` (no pipeline has `is_default = true`, so the code falls through to `allPipelines[0]`) at 14.9% — inside the winning region but with only a **4% cost margin**. The `Closer` pipeline at 61% correctly keeps a seq scan; that is the planner being right, not a failure. Verification must therefore be pinned to the specific stage IDs the research doc lists, not run against an arbitrary pipeline.

</specifics>

<deferred>
## Deferred Ideas

- Index tuning for the v1.2 workflow tables — they already declare their own indexes
- Query restructuring or denormalization for the kanban board — out of scope; this phase only adds indexes
- A repeatable performance benchmark harness — not required by PERF-01 or PERF-02

</deferred>
