# Phase 33: Database Indexes for the CRM Core - Research

**Researched:** 2026-08-14
**Domain:** PostgreSQL 16 index design + Drizzle ORM schema-declared indexes
**Confidence:** HIGH — every claim below was measured against the live dev database or read out of installed package source. Nothing important rests on training data.

## Summary

The premise the CONTEXT file warned about does not hold. **The dev database is not small.** It carries 25,206 deals, 79,023 activities, 46,055 organizations and 38,345 people — real imported CRM data. `EXPLAIN ANALYZE` on both named queries today shows genuine sequential scans, and both flip to index scans the moment the indexes exist. **No seeding is required, and `SET enable_seqscan = off` is not needed and must not be used.** All BEFORE and AFTER plans in this document were captured today against that database; the AFTER plans came from creating the full candidate index set inside a transaction and rolling it back, so nothing was left behind (verified: zero leftover indexes).

The real risk is different and sharper than the one anticipated: **selectivity, not table size.** With the default `random_page_cost = 4`, the planner switches from bitmap index scan to sequential scan on `deals` somewhere between 15% and 19% of the table. The pipeline the kanban page actually loads by default (`BDR - Base Fria`, 2 stages, 3,753 live deals = 14.9%) sits *just* inside the winning side, with only a 4% cost margin. The largest pipeline (`Closer`, 61% of the table) correctly keeps a sequential scan even with a perfect index — and that is the planner being right, not a failure. SC-1 verification must therefore be pinned to the app's actual default pipeline (or a single stage), and the plan must state up front that a bitmap index scan counts as satisfying "index scan."

Two further measured findings change the shape of the work. First, a **composite index `(stage_id, position)` actively fails SC-1** — it is 8.5x larger than the single-column index (1696 kB vs 200 kB, because btree deduplication collapses the 55 distinct stage_ids but cannot collapse `position`), which pushes the bitmap scan cost above the seq scan and the planner rejects it. Use single-column. Second, this repo has a documented scar: the hand-written partial index `workflows_next_run_at_idx` added in `0009_trigger_array_migration.sql` was **silently dropped by the very next `drizzle-kit generate`** (`0010_pale_rocket_raccoon.sql:1`) because it lived in the snapshot but not in the schema file. That is the concrete justification for the CONTEXT decision to declare indexes in `src/db/schema/`.

**Primary recommendation:** Declare 11 single-column plain btree indexes across the four schema files using the existing `(table) => ({ nameIdx: index("table_column_idx").on(table.col) })` pattern, generate one migration with `npm run db:generate`, apply with `npm run db:migrate`, and verify SC-1/SC-2 against the `BDR - Base Fria` pipeline and the literal reminder-cron SQL. Do not use partial indexes, do not use composite indexes, do not use `CONCURRENTLY`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Index definition (source of truth) | Drizzle schema (`src/db/schema/*.ts`) | — | `drizzle-kit generate` diffs schema against `drizzle/meta/*_snapshot.json`; anything not in the schema gets DROPped on the next generate (proven by `0010`) |
| Index DDL delivery | `drizzle/0012_*.sql` (generated) | — | SC-3 requires "a single migration"; `drizzle-kit generate` emits all statements into one file separated by `--> statement-breakpoint` |
| Index DDL application | `drizzle-kit migrate` (`npm run db:migrate`) | — | Runs against `localhost:5433`; wraps all pending migrations in one transaction |
| Plan selection | PostgreSQL 16 planner | — | Not controllable from the app; SC-1/SC-2 are assertions about planner *choice*, so the phase must respect cost-model reality rather than force it |
| SC-1/SC-2 verification | `psql` inside the `postgres` container | — | `psql` is not installed on the host; the app has no EXPLAIN surface |
| Application behavior | Untouched | — | SC-4: no query, server action, or test may change |

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** All tooling (`drizzle-orm@0.45.1`, `drizzle-kit@0.31.9`, `postgres@3.4.8`, `vitest@4.0.18`) is already installed and pinned in `package.json`. No `npm install` step belongs in this plan. slopcheck was not run because there is nothing to check.

## Standard Stack

### Core (all already installed — verified from `node_modules/*/package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | 0.45.1 | `index()` builder in `pgTable`'s third argument | Already the repo's index-definition mechanism (`workflows.ts`, `webhooks.ts`, `webhook-deliveries.ts`) [VERIFIED: node_modules/drizzle-orm/package.json] |
| `drizzle-kit` | 0.31.9 | `generate` (schema → SQL migration), `migrate` (apply) | `npm run db:generate` / `npm run db:migrate` in `package.json` [VERIFIED: package.json] |
| PostgreSQL | 16.13 (postgres:16-alpine) | btree indexes, `EXPLAIN ANALYZE` | `SELECT version()` on the running container [VERIFIED: live query] |
| `postgres` (driver) | 3.4.8 | Connection driver `drizzle-kit migrate` selects | drizzle-kit probes for `pg` first, then `postgres` [VERIFIED: node_modules/drizzle-kit/bin.cjs] |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `psql` (in container) | Capture BEFORE/AFTER `EXPLAIN ANALYZE` | Only verification path; **not installed on the host** — must go through `sudo docker compose exec -T postgres psql -U pipelite -d pipelite` |
| `pg_indexes` / `pg_stat_user_indexes` | Prove SC-3 (every named column index-backed) | Machine-checkable assertion, better than reading the migration file |

### Alternatives Considered

| Instead of | Could Use | Verdict |
|------------|-----------|---------|
| Schema-declared `index()` | Hand-written SQL in a custom migration | **Rejected.** Proven to regress: `workflows_next_run_at_idx` was hand-written in `0009` and dropped by `0010`. CONTEXT already locks this. |
| Plain `index()` | Partial `index().where(...)` | **Rejected for this phase** — see "Partial vs plain" below. Drizzle *can* express it (verified), but it buys nothing measurable here and breaks one existing query. |
| Single-column `(stage_id)` | Composite `(stage_id, position)` | **Rejected — measured to FAIL SC-1.** Index grows 200 kB → 1696 kB, bitmap cost exceeds seq scan, planner picks Seq Scan. |
| `CREATE INDEX` | `CREATE INDEX CONCURRENTLY` (`.concurrently()`) | **Rejected — would break the migration.** `drizzle-kit migrate` wraps migrations in a transaction; Postgres forbids CONCURRENTLY inside a transaction block. |
| `npm run db:generate` | `npm run db:push` | **Rejected.** `db:push` writes no migration file → SC-3 ("via a single migration") unsatisfiable. |

**Installation:** none. No packages are added.

## Ground Truth: The Live Database

All figures measured 2026-08-14 against `pipelite-postgres-1` (PostgreSQL 16.13, healthy, up 5 days).

### Row counts [VERIFIED: live `count(*)`]

| Table | Rows | Live (`deleted_at IS NULL`) | Heap size | Index size |
|-------|------|------------------------------|-----------|------------|
| `activities` | 79,023 | 79,022 | 26 MB | 7752 kB |
| `organizations` | 46,055 | 46,054 | 13 MB | 4712 kB |
| `people` | 38,345 | 38,345 | 8824 kB | 3936 kB |
| `deals` | 25,206 | 25,194 | 19 MB | 2952 kB |
| `stages` | 73 | — | 24 kB | 32 kB |
| `pipelines` | 12 | 12 | — | — |
| `users` | 7 | — | — | — |
| `deal_assignees` | **0** | — | — | — |

**This is the single most important fact for the phase: the tables are large enough that both named queries already sequential-scan, and large enough that indexes measurably win. The CONTEXT file's small-table concern does not apply.**

### Indexes that exist today [VERIFIED: `pg_indexes`]

Exactly four, all primary keys:

```
activities    | activities_pkey    | UNIQUE btree (id)
deals         | deals_pkey         | UNIQUE btree (id)
organizations | organizations_pkey | UNIQUE btree (id)
people        | people_pkey        | UNIQUE btree (id)
```

Related tables that already help:

```
deal_assignees | deal_assignees_deal_id_user_id_pk | UNIQUE btree (deal_id, user_id)  -- covers deal_assignees.deal_id
stages         | pipeline_name_unique              | UNIQUE btree (pipeline_id, name) -- covers stages.pipeline_id
```

**Definitive have/need table for SC-3 (PERF-01's exact list):**

| # | Column | Already indexed? | Needed |
|---|--------|------------------|--------|
| 1 | `deals.stage_id` | No | `deals_stage_id_idx` |
| 2 | `deals.deleted_at` | No | `deals_deleted_at_idx` |
| 3 | `deals.organization_id` | No | `deals_organization_id_idx` |
| 4 | `deals.person_id` | No | `deals_person_id_idx` |
| 5 | `deals.owner_id` | No | `deals_owner_id_idx` |
| 6 | `activities.due_date` | No | `activities_due_date_idx` |
| 7 | `activities.deal_id` | No | `activities_deal_id_idx` |
| 8 | `activities.deleted_at` | No | `activities_deleted_at_idx` |
| 9 | `people.organization_id` | No | `people_organization_id_idx` |
| 10 | `people.deleted_at` | No | `people_deleted_at_idx` |
| 11 | `organizations.deleted_at` | No | `organizations_deleted_at_idx` |

**Zero of the eleven are incidentally covered.** Postgres creates indexes for PRIMARY KEY and UNIQUE constraints but never for FOREIGN KEY constraints — confirmed here: `deals` declares four FKs and has only `deals_pkey`. **11 new indexes, no more, no fewer.**

### Planner statistics [VERIFIED: `pg_stats`, `pg_class`]

`pg_stat_user_tables` reports `n_live_tup = 0` and `last_analyze`/`last_autoanalyze` as NULL — but this is a lost stats-collector file (the container restarted), not missing statistics. `pg_class.reltuples` is populated (deals 25191, activities 79022) and `pg_stats` has 14 rows for `deals`. **Planner statistics are present and accurate; `ANALYZE` is not required** (confirmed by the plans flipping correctly in the rolled-back experiment). Running `ANALYZE deals, organizations, people, activities` before capturing plans is harmless insurance and takes seconds.

Column statistics that drive index design:

| Table | Column | n_distinct | null_frac | correlation | Consequence |
|-------|--------|-----------|-----------|-------------|-------------|
| deals | stage_id | 55 | 0 | -0.11 | Good selectivity per stage; btree dedup makes the index tiny (200 kB) |
| deals | deleted_at | 0 | **1.0** | — | `IS NULL` matches ~everything → **non-selective, planner will never use it for the read path** |
| deals | organization_id | -0.775 | 0.163 | 0.02 | Near-unique → index highly effective |
| deals | person_id | -0.837 | 0.090 | 0.005 | Near-unique → index highly effective |
| deals | owner_id | **1** | 0 | 1 | **Every deal has the same owner in this dataset** → index will never be chosen here |
| activities | due_date | 1036 | 0 | **0.9985** | Physically clustered; range scans are extremely cheap |
| activities | completed_at | 326 | 0.054 | 0.9997 | 4,166 of 79,023 not completed |
| activities | deleted_at | 0 | 1.0 | — | Non-selective for `IS NULL` |
| activities | deal_id | -0.128 | 0.221 | -0.016 | ~6 activities per deal → index effective |
| people | organization_id | -0.471 | **0.520** | 0.0002 | Half have no org; index effective for the other half |
| organizations | deleted_at | 0 | 1.0 | — | Non-selective for `IS NULL` |

### Planner cost settings (all Postgres defaults) [VERIFIED: `pg_settings`]

```
random_page_cost                = 4          <-- default; pessimistic for SSD
seq_page_cost                   = 1
effective_cache_size            = 524288     (4 GB)
shared_buffers                  = 16384      (128 MB)
max_parallel_workers_per_gather = 2
default_statistics_target       = 100
enable_seqscan                  = on
```

DB collation: `en_US.utf8`.

## The Two Named Queries

### Query 1 — Kanban board

**Definition site:** `src/app/deals/page.tsx:104-145` (filter conditions built at 104-118, executed at 120-145).

```ts
// src/app/deals/page.tsx:104-123
const filterConditions = [
  sql`${deals.stageId} IN ${stageIds}`,
  isNull(deals.deletedAt),
  params.stage ? eq(deals.stageId, params.stage) : undefined,
  params.owner ? eq(deals.ownerId, params.owner) : undefined,
  params.assignee
    ? sql`${deals.id} IN (SELECT deal_id FROM deal_assignees WHERE user_id = ${params.assignee})`
    : undefined,
  params.dateFrom ? gte(deals.expectedCloseDate, new Date(params.dateFrom)) : undefined,
  params.dateTo ? lte(deals.expectedCloseDate, new Date(params.dateTo)) : undefined,
].filter(Boolean)

const allDeals = stageIds.length > 0
  ? await db.query.deals.findMany({
      where: and(...filterConditions),
      orderBy: [sql`${deals.position} ASC`],
      with: { organization: {...}, person: {...}, assignees: { with: { user: {...} } } },
    })
  : []
```

**Actual SQL emitted** (captured via `.toSQL()` against the real schema; abridged to the load-bearing tail):

```sql
select "deals".* , "deals_organization"."data" as "organization", ...
from "deals" "deals"
left join lateral (select ... from "organizations" ... where "deals_organization"."id" = "deals"."organization_id" limit $1) ... on true
left join lateral (select ... from "people"        ... where "deals_person"."id"       = "deals"."person_id"       limit $2) ... on true
left join lateral (select coalesce(json_agg(...), '[]'::json) from "deal_assignees" ... where "deals_assignees"."deal_id" = "deals"."id") ... on true
where ("deals"."stage_id" IN ($4, $5, ...) and "deals"."deleted_at" is null)
order by "deals"."position" ASC
```

Load-bearing facts:
- **It does filter `deleted_at IS NULL`** — always, unconditionally.
- `stage_id IN (...)` renders as a **literal parameter list**, which Postgres normalizes to `stage_id = ANY (...)`. It is *not* a subquery. This matters: the subquery form (`IN (SELECT id FROM stages WHERE ...)`) produces a different, worse plan (Hash Join), so verification must use the literal form.
- The three lateral joins hit `organizations.id`, `people.id`, `users.id` (all PKs) and `deal_assignees.deal_id` (leading column of its composite PK). **All four are already index-backed.** The only unindexed access path in the whole query is the outer `deals` scan.
- `ORDER BY position` is satisfied by a Sort node in every plan variant; no index can remove it (see the composite-index finding).
- `deal_assignees` has 0 rows, so that lateral is effectively free.

**Which pipeline does the page load by default?** No pipeline has `is_default = true`, so `allPipelines.find(p => p.isDefault)` is undefined and the code falls back to `allPipelines[0]`, ordered by `is_default DESC, name`. Verified against the DB: **`BDR - Base Fria`** (id `010edd01-e023-427e-b03b-3ed305b8f586`, 2 stages, 3,753 live deals).

Stage IDs for that pipeline (for the verification script):
```
'ad4d9fb5-92c7-4170-8e93-2163153a99d9', '01374f39-b838-4977-a48e-8fd126aa83f5'
```

### Query 2 — Activity reminder cron

**Definition site:** `src/app/api/internal/email/process/route.ts:32-49` (inside `processActivityReminders()`, invoked from the POST handler at line 17; the poll loop lives in `src/lib/email-processor.ts` and self-calls this route every 5 minutes).

```ts
// src/app/api/internal/email/process/route.ts:32-49
const dueActivities = await db
  .select({ id: activities.id, title: activities.title, dueDate: activities.dueDate,
            assigneeId: activities.assigneeId, ownerId: activities.ownerId })
  .from(activities)
  .where(and(
    isNull(activities.completedAt),
    isNull(activities.deletedAt),
    isNull(activities.reminderSentAt),
    gte(activities.dueDate, now),
    lte(activities.dueDate, oneHourFromNow)
  ))
```

**Actual SQL emitted:**

```sql
select "id", "title", "due_date", "assignee_id", "owner_id" from "activities"
where ("activities"."completed_at" is null
   and "activities"."deleted_at" is null
   and "activities"."reminder_sent_at" is null
   and "activities"."due_date" >= $1
   and "activities"."due_date" <= $2)
```

Load-bearing facts:
- **It does filter `deleted_at IS NULL`**, alongside two other `IS NULL` predicates.
- The selective predicate is the **range on `due_date`** — a 1-hour window out of a 2022→2030 span, with `correlation = 0.9985`. This is the ideal shape for a plain btree range scan.
- `due_date` is declared `timestamp('due_date', { mode: 'date' })` and every stored value is at `00:00:00`, so a mid-day 1-hour window matches **zero** rows. Estimated rows = 1. An index scan is a landslide win. Verified at both a zero-match window and a midnight-boundary window that matches one row.

## Measured BEFORE Plans (no indexes)

Captured 2026-08-14 with `EXPLAIN (ANALYZE, BUFFERS, COSTS)`. **Every one is a sequential scan. Nothing is incidentally already index-backed.**

| Query | Plan node | Est. cost | Exec time | Buffers |
|-------|-----------|-----------|-----------|---------|
| **Kanban, full query, BDR default pipeline** | `Parallel Seq Scan on deals` (Rows Removed by Filter: 10726 × 2 workers) | 2599.23 (deals node) | **659.663 ms** | 32315 total / **2414 on deals** |
| Kanban, 1 stage (3465 rows) | `Seq Scan on deals` (Rows Removed: 21741) | 2728.89 | 14.216 ms | 2414 |
| Kanban, `Closer` 10 stages (15415 rows) | `Seq Scan on deals` (Rows Removed: 9791) | 2791.89 | 25.302 ms | 2414 |
| **Activity reminder cron** | `Seq Scan on activities` (Rows Removed: **79023**) | **5071.99** | **24.502 ms** | **3294** |
| `people.organization_id = ?` | `Seq Scan on people` (Rows Removed: 38345) | 1582.78 | 35.047 ms | 1107 |
| `deals.organization_id = ?` | `Seq Scan on deals` (Rows Removed: 25205) | 2729.37 | 11.201 ms | 2418 |
| `activities.deal_id = ?` | `Seq Scan on activities` (Rows Removed: 79022) | 4282.26 | 23.560 ms | 3298 |

**SC-1 and SC-2 both start from a genuine sequential scan. Both are demonstrable.**

## Measured AFTER Plans (full 11-index set, created in a rolled-back transaction)

| Query | Plan node | Est. cost | Exec time | Buffers | vs BEFORE |
|-------|-----------|-----------|-----------|---------|-----------|
| **SC-1: Kanban, full query, BDR default** | `Parallel Bitmap Heap Scan on deals` ← **`Bitmap Index Scan on deals_stage_id_idx`** | 2594.65 | **210.351 ms** | 426 on deals | 3.1x faster, **5.7x fewer buffers** |
| Kanban, 1 stage | `Bitmap Heap Scan` ← `Bitmap Index Scan` | 2623.28 | 3.840 ms | — | 3.7x faster |
| **SC-2: reminder cron (zero matches)** | **`Index Scan using activities_due_date_idx`** | **12.21** | **0.094 ms** | **5** | **415x cheaper, 260x faster, 659x fewer buffers** |
| SC-2 variant: reminder cron at midnight boundary (1 real match) | `Index Scan using activities_due_date_idx` | 12.20 | 0.046 ms | — | same win |
| `people.organization_id = ?` | `Index Scan using people_organization_id_idx` | 8.91 | 0.316 ms | — | 111x faster |
| `deals.organization_id = ?` | `Index Scan using deals_organization_id_idx` | 8.91 | 0.112 ms | — | 100x faster |
| `activities.deal_id = ?` | `Bitmap Heap Scan` ← `Bitmap Index Scan on activities_deal_id_idx` | 28.28 | 0.220 ms | — | 107x faster |
| `deals.owner_id = ?` | **`Seq Scan` — index NOT chosen** | 2729.42 | 12.685 ms | — | unchanged (expected, see below) |
| `deals WHERE deleted_at IS NOT NULL` (trash path) | `Index Scan using deals_deleted_at_idx` | 8.30 | 0.109 ms | — | index genuinely used |
| `organizations WHERE deleted_at IS NULL ORDER BY name LIMIT 50` | `Seq Scan` — index not chosen | 2153.55 | 84.983 ms | — | unchanged (expected) |

**Cleanup verified:** after ROLLBACK, `SELECT count(*) FROM pg_indexes WHERE tablename IN (...) AND indexname NOT LIKE '%_pkey'` returned **0**. `git status` clean. Nothing was seeded, nothing was left behind.

**Cost of the index set:**
- Total added index footprint: **7328 kB** across 11 indexes.
- Total `CREATE INDEX` wall time: **≈1.08 s** for all eleven.
- Per-index sizes: `activities_deal_id_idx` 1328 kB, `people_organization_id_idx` 1208 kB, `deals_person_id_idx` 1280 kB, `deals_organization_id_idx` 1192 kB, `activities_due_date_idx` 568 kB, `activities_deleted_at_idx` 552 kB, `organizations_deleted_at_idx` 328 kB, `people_deleted_at_idx` 280 kB, `deals_owner_id_idx` 200 kB, `deals_stage_id_idx` 200 kB, `deals_deleted_at_idx` 192 kB.

## Resolving the Small-Table Problem

**The CONTEXT file's stated concern is void; a different concern replaces it.**

1. **Do not seed.** 25k deals and 79k activities already produce sequential scans, and indexes already win. Seeding would add risk (mutating a database holding real imported CRM data) for zero benefit. **Verdict: no seeding.**

2. **Do not use `SET enable_seqscan = off`.** The CONTEXT file's instruction is correct and I confirm it with evidence rather than deference: it is unnecessary, because the planner already chooses the index on the real data (measured above). Using it would also be actively misleading — `enable_seqscan = off` does not disable sequential scans, it applies a large cost penalty, so a plan produced under it tells you only that an index is *usable*, never that it is *preferred*. **Verdict: forbidden. There is no scenario in this phase that needs it.**

3. **The real risk is selectivity.** Measured crossover sweep on `deals` (25,206 rows, 2,414 heap pages, `random_page_cost = 4`), literal `IN` form, with a plain `stage_id` index:

   | Stages in filter | Matching rows | % of table | Chosen plan | Index cost | Seq cost |
   |------------------|---------------|-----------|-------------|-----------|----------|
   | 1 (`Reunião Agendada`) | 319 | 1.3% | **Bitmap Index Scan** | 893.47 | 2666.06 |
   | 3 | 1,526 | 6.1% | **Bitmap Index Scan** | 2273.33 | 2666.06 |
   | 5 | 1,967 | 7.8% | **Bitmap Index Scan** | 2468.99 | 2666.06 |
   | 2 (`BDR - Base Fria` = the app default) | 3,753 | **14.9%** | **Bitmap Index Scan** | 2613.98 | 2728.89 |
   | 8 (`Parcerias`) | 4,825 | 19.1% | Seq Scan | — | 2666.06 |
   | 10 (`Closer`) | 15,415 | 61.2% | Seq Scan | — | 2666.06 |

   **Crossover sits between ~15% and ~19% of the table.** The app's default pipeline lands at 14.9% — inside the winning region but with only a **4% cost margin** (2613.98 vs 2728.89). SC-1 passes, but not comfortably.

   Deals per pipeline (as % of the 25,206-row table): Closer 61.16%, Parcerias 19.14%, **BDR - Base Fria 14.89%**, Pós-Vendas (TYR) 2.44%, Prospecção Ativa (SDR) 1.11%, Funil Migração 0.46%, Inbound 0.32%, TYR II - Closer 0.30%, Teste 0.07%, Pós-Venda (TYR II) 0.04%, SaaS kill list 0.01%, UAT Pipeline 0.00%.

4. **Therefore the verification strategy is:**
   - Capture BEFORE plans **before** the migration is applied, against the **same** database, into a file committed with the phase. (The tables above are the authoritative baseline if that ordering slips — but capturing fresh is better.)
   - Pin SC-1 to the app's real default pipeline (`BDR - Base Fria`, the two stage IDs listed above), using the literal `IN (...)` form. Optionally also assert the single-stage case (`ad4d9fb5-...`, 1.3% → 3.7x faster) as a comfortable-margin corroboration.
   - Pin SC-2 to the exact reminder SQL with `now()` and `now() + interval '1 hour'`.
   - Explicitly accept `Bitmap Index Scan` / `Bitmap Heap Scan` as satisfying "index scan." SC-1's plan is `Parallel Bitmap Heap Scan` ← `Bitmap Index Scan on deals_stage_id_idx`. A verifier looking only for the literal string `Index Scan using` would report a false failure. SC-2's plan *is* a plain `Index Scan using activities_due_date_idx`.
   - Explicitly document that the `Closer` pipeline (61%) keeps its sequential scan and that this is correct. Do not treat it as a failure and do not try to fix it.
   - Do not assert anything about `deals.owner_id` — see next section.

5. **`deals.owner_id` cannot be demonstrated and must not be asserted.** `n_distinct = 1`: every deal in this dataset has the same owner, so `owner_id = ?` matches either 100% or 0% of rows and the planner correctly ignores the index (measured: `Seq Scan`, cost 2729.42, even with the index present). SC-3 requires only that the column is *index-backed*, which `pg_indexes` proves. The plan must verify SC-3 by catalog query, not by EXPLAIN.

6. **A tuning lever exists but is out of scope.** `random_page_cost = 4` is the Postgres default, calibrated for spinning disks. Lowering it to `1.1` (appropriate for SSD) would widen every index win and push the crossover well past 19%. That is a server configuration change, not an index, and it is outside the phase boundary ("indexes on ... a single Drizzle migration"). Note it as a future consideration; do not do it here.

## Partial vs Plain on `deleted_at` — Recommendation: PLAIN

Drizzle **can** express partial indexes in the installed version. Verified two ways:

- `node_modules/drizzle-orm/pg-core/indexes.d.ts` declares `IndexBuilder.where(condition: SQL): this` and an `IndexConfig.where?: SQL` documented as "Condition for partial index."
- I ran `drizzle-kit generate` (0.31.9) against a scratch copy of the real schema, diffed against the real `drizzle/meta` snapshots, in a throwaway output directory. It emitted:

```sql
CREATE INDEX "deals_stage_id_live_idx" ON "deals" USING btree ("stage_id") WHERE "deals"."deleted_at" is null;
CREATE INDEX "activities_reminder_idx" ON "activities" USING btree ("due_date") WHERE ("activities"."completed_at" is null and "activities"."deleted_at" is null and "activities"."reminder_sent_at" is null);
```

Both the `isNull(table.deletedAt)` / `and(...)` helper form and the raw `sql\`...\`` form produce correct output, and the snapshot records `"where": "..."`. Postgres accepts the table-qualified predicate and normalizes it (`pg_indexes` reports `WHERE (deleted_at IS NULL)`). **So the capability is there. It is simply the wrong choice here.** Reasons, all measured:

1. **It buys nothing on `deals.stage_id`.** Plain `(stage_id)` and partial `(stage_id) WHERE deleted_at IS NULL` produced **identical plans, identical cost (2613.98), and identical size (200 kB)**. Only 12 of 25,206 deals are soft-deleted, so the partial index excludes essentially nothing.

2. **It breaks an existing query.** `src/app/admin/pipelines/actions.ts:483-489` — the guard that blocks deleting a stage that still has deals — queries `stage_id` **without** a `deleted_at` filter:
   ```ts
   const existingDeals = await db.query.deals.findMany({
     where: and(eq(deals.stageId, id), isNotNull(deals.id)),
     limit: 1,
   })
   ```
   A partial index predicated on `deleted_at IS NULL` cannot serve this. The plain index can. Same size, strictly more general.

3. **A partial index *on* `deleted_at` predicated on `deleted_at IS NULL` would be degenerate** — a single-valued index over ~100% of rows, useless for anything. Do not write it.

4. **The plain `deleted_at` index is not dead weight** — it is measurably used for the *`IS NOT NULL`* direction: `SELECT id FROM deals WHERE deleted_at IS NOT NULL` chose `Index Scan using deals_deleted_at_idx`, cost 8.30, 0.109 ms. That is exactly the access pattern Phase 37 (Trash & Restore, TRASH-01/TRASH-03) needs. Total cost for all four: 192 + 552 + 328 + 280 = 1352 kB.

5. **Honest disclosure the plan must record:** a plain `deleted_at` index will **not** speed up the `deleted_at IS NULL` read path — `organizations WHERE deleted_at IS NULL ORDER BY name LIMIT 50` still (correctly) chose a Seq Scan with the index present. SC-3 asks for the columns to be "index-backed," which is satisfied. The plan should state plainly which direction the index serves rather than implying a soft-delete read speedup that does not exist.

**Also considered and declined:** a narrow partial index for the reminder cron, `activities (due_date) WHERE completed_at IS NULL AND deleted_at IS NULL AND reminder_sent_at IS NULL`. It is genuinely better in isolation — 64 kB vs 568 kB, cost 8.31 vs 12.21, and it eliminates the Filter node. But the plain `activities_due_date_idx` already satisfies SC-2 with a 415x cost reduction, matches SC-2's wording literally ("index scan on `activities.due_date`"), and serves the other `due_date` consumers (activity list/calendar views, and the weekly-digest overdue/upcoming counts at `route.ts:184-185`). Adding a second index on the same column is scope creep the phase does not need. **Verdict: plain `activities_due_date_idx` only.** If the planner wants a narrower one later, `reminder_sent_at IS NULL` for all 79,022 rows means it would help nothing today anyway.

**Net verdict: 11 plain, single-column btree indexes. Zero partial indexes. Zero composite indexes.**

## Architecture Patterns

### Data flow: how an index declaration becomes a chosen plan

```
src/db/schema/{deals,organizations,people,activities}.ts
    │  pgTable(name, columns, (table) => ({ nameIdx: index("...").on(table.col) }))
    ▼
npm run db:generate  ──▶ drizzle-kit 0.31.9
    │  reads schema via drizzle.config.ts { schema: "./src/db/schema/index.ts" }
    │  diffs against drizzle/meta/0011_snapshot.json
    ├──▶ drizzle/0012_<name>.sql          (11 × CREATE INDEX, --> statement-breakpoint separated)
    └──▶ drizzle/meta/0012_snapshot.json  + _journal.json entry
    ▼
npm run db:migrate  ──▶ drizzle-kit migrate
    │  selects `postgres` driver, delegates to drizzle-orm/postgres-js migrate()
    │  reads last row of drizzle.__drizzle_migrations (max created_at = 1774729567507 = 0011)
    │  session.transaction(): BEGIN → 11 × CREATE INDEX → INSERT record → COMMIT
    ▼
PostgreSQL 16.13 catalog (pg_index / pg_indexes)
    ▼
Planner cost model (random_page_cost=4, reltuples, pg_stats)
    ├──▶ deals @14.9% selectivity  → Bitmap Index Scan  (SC-1 ✅)
    ├──▶ deals @61% selectivity    → Seq Scan            (correct, not a failure)
    └──▶ activities due_date range → Index Scan          (SC-2 ✅)
```

### Component responsibilities

| File | Responsibility in this phase |
|------|------------------------------|
| `src/db/schema/deals.ts` | Declare 5 indexes: stage_id, deleted_at, organization_id, person_id, owner_id. Needs `index` added to the `drizzle-orm/pg-core` import and a third `pgTable` argument (currently has none). |
| `src/db/schema/activities.ts` | Declare 3: due_date, deal_id, deleted_at. Same import + third-argument change. |
| `src/db/schema/people.ts` | Declare 2: organization_id, deleted_at. Same. |
| `src/db/schema/organizations.ts` | Declare 1: deleted_at. Same. |
| `src/db/schema/_relations.ts` | **Do not touch.** CONTEXT is explicit. |
| `drizzle/0012_*.sql` | Generated, never hand-edited. |
| `drizzle/meta/0012_snapshot.json`, `_journal.json` | Generated; **must be committed** or the next generate will re-emit or drop. |
| Everything under `src/app/`, `src/lib/` | **Untouched.** SC-4. |

### Pattern: the repo's index declaration form

Copy `src/db/schema/webhooks.ts:20-22` and `src/db/schema/workflows.ts:24-27` exactly. The repo uses the **object** return form with camelCase property keys and snake_case `{table}_{column}_idx` index names:

```ts
// Source: src/db/schema/workflows.ts:24-27 (existing, in-repo)
export const workflows = pgTable(
  "workflows",
  { /* columns */ },
  (table) => ({
    activeIdx: index("workflows_active_idx").on(table.active),
    createdByIdx: index("workflows_created_by_idx").on(table.createdBy),
  })
)
```

Applied to `deals.ts` (note: the current file has no third argument at all, and the closing is `})` on the columns object — the shape changes to `}, (table) => ({ ... }))`):

```ts
import { pgTable, text, timestamp, numeric, jsonb, index } from "drizzle-orm/pg-core"
// ...
export const deals = pgTable('deals', {
  // ... existing columns unchanged ...
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  stageIdIdx:        index('deals_stage_id_idx').on(table.stageId),
  organizationIdIdx: index('deals_organization_id_idx').on(table.organizationId),
  personIdIdx:       index('deals_person_id_idx').on(table.personId),
  ownerIdIdx:        index('deals_owner_id_idx').on(table.ownerId),
  deletedAtIdx:      index('deals_deleted_at_idx').on(table.deletedAt),
}))
```

Both the object form (`(table) => ({...})`) and the array form (`(table) => ([...])`) work in drizzle-orm 0.45.1 — I generated a migration successfully with the array form, and the object form is proven by the existing `0008` migration. **Use the object form for repo consistency**, as CONTEXT instructs.

### Anti-patterns to avoid

- **Hand-writing the `CREATE INDEX` SQL.** `drizzle/0009_trigger_array_migration.sql:21` did exactly this and `drizzle/0010_pale_rocket_raccoon.sql:1` deleted it. Documented regression, in this repo, in this year.
- **Composite `(stage_id, position)` to "avoid the Sort."** Measured: 1696 kB index, planner picks Seq Scan, SC-1 fails. `ORDER BY position` across a multi-value `stage_id = ANY(...)` cannot be satisfied by a leading-`stage_id` index anyway.
- **`.concurrently()`.** `drizzle-kit migrate` runs inside a transaction; Postgres rejects `CREATE INDEX CONCURRENTLY` there. Would hard-fail the migration.
- **`npm run db:push`.** Applies the diff directly with no migration file. SC-3 requires a migration.
- **Editing the generated SQL or a snapshot by hand.** Snapshot drift is what produced the `0010` regression.
- **Indexing `stages.pipeline_id`.** Already covered by `pipeline_name_unique (pipeline_id, name)`. Out of the PERF-01 list anyway.
- **Indexing the v1.2 workflow tables.** Explicitly out of scope; they declare their own.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Index DDL | A custom `.sql` file | `index()` in schema + `db:generate` | Hand-written index SQL got dropped by the next generate — proven in `0010` |
| Index naming | Ad-hoc names | `{table}_{column}_idx` | Existing convention across `workflows`, `webhooks`, `webhook_deliveries` |
| Partial index predicate | Raw `sql` string | `isNull()` / `and()` from `drizzle-orm` | Both verified to emit correctly; typed helpers survive column renames. (Moot — plan recommends no partial indexes.) |
| Deciding whether an index will be used | Reasoning about it | `EXPLAIN (ANALYZE, BUFFERS, COSTS)` on the real data | Every intuition-level prediction in this research was wrong at least once — the composite index was expected to help and it broke SC-1 |
| Proving SC-3 | Reading the migration file | `SELECT ... FROM pg_indexes` | Catalog is the ground truth; a migration file can exist unapplied |
| Non-destructive index experiments | Creating and dropping indexes | `BEGIN; CREATE INDEX ...; EXPLAIN ...; ROLLBACK;` | `CREATE INDEX` (non-concurrent) is transactional in Postgres; verified zero leftovers |

**Key insight:** in this domain the code is trivial (11 one-line declarations) and the entire difficulty is in the planner's cost model, which is invisible from the source. Every design decision must be settled by running `EXPLAIN` against real data, never by reasoning about what "should" be faster.

## Common Pitfalls

### Pitfall 1: Verifying SC-1 against the wrong pipeline
**What goes wrong:** the verifier picks the `Closer` pipeline (or any pipeline over ~19% of the deals table) and sees a Seq Scan after the migration, concluding the phase failed.
**Why it happens:** SC-1's wording implies "the kanban board query" is one thing; it is actually parameterized by pipeline, and the plan legitimately changes with selectivity.
**How to avoid:** pin verification to the app's real default — `BDR - Base Fria`, stage IDs `ad4d9fb5-92c7-4170-8e93-2163153a99d9` and `01374f39-b838-4977-a48e-8fd126aa83f5` (14.9%, measured to flip). Document the `Closer` seq scan as expected-correct.
**Warning sign:** the plan output contains `Rows Removed by Filter: 9791`.

### Pitfall 2: Grepping for the literal string "Index Scan using"
**What goes wrong:** SC-1's post-index plan is `Parallel Bitmap Heap Scan on deals` with a child `Bitmap Index Scan on deals_stage_id_idx`. A check for `Index Scan using` fails; a check for `Seq Scan` absence also fails (the `stages` lookup and other nodes may seq-scan tiny tables).
**How to avoid:** assert on `Bitmap Index Scan on deals_stage_id_idx` (SC-1) and `Index Scan using activities_due_date_idx` (SC-2). Accept bitmap variants as index scans. SC-2 alone yields a plain `Index Scan`.
**Warning sign:** a verification script with a single hardcoded string match.

### Pitfall 3: BEFORE plans become uncapturable
**What goes wrong:** the migration is applied first, and SC-1/SC-2's "where it previously showed a sequential scan" clause can no longer be demonstrated. Dropping the indexes to re-capture is a second schema mutation and pollutes the story.
**How to avoid:** task ordering must be BEFORE-capture → schema edit → generate → migrate → AFTER-capture. Both plan sets go into one committed artifact.
**Fallback:** the BEFORE table in this document is the authoritative baseline, captured today against this exact database.

### Pitfall 4: Using the subquery form of the stage filter in verification
**What goes wrong:** `WHERE stage_id IN (SELECT id FROM stages WHERE pipeline_id = '...')` produces a `Hash Join` with a `Seq Scan on deals` at 19% selectivity, whereas the literal `IN ('a','b')` form the app actually emits produces a `Bitmap Index Scan`. Measured both.
**How to avoid:** use literal stage IDs, matching the parameterized list Drizzle emits from `sql\`${deals.stageId} IN ${stageIds}\``.
**Warning sign:** `Hash Cond: (deals.stage_id = stages.id)` in the plan.

### Pitfall 5: Adding a composite `(stage_id, position)` index
**What goes wrong:** looks like it should eliminate the Sort. Instead: 8.5x larger (1696 kB vs 200 kB, because `position` defeats btree deduplication), bitmap scan cost rises above seq scan, planner reverts to `Seq Scan`. **SC-1 fails.** Measured.
**How to avoid:** single-column only.

### Pitfall 6: A hand-written index disappearing on the next generate
**What goes wrong:** exactly what happened to `workflows_next_run_at_idx` — written directly into `0009`, recorded in `0009_snapshot.json`, absent from `workflows.ts`, therefore DROPped by `0010`. (`git log -S nextRunAtIdx` on `workflows.ts` returns nothing: the identifier never existed in the schema.)
**How to avoid:** declare in schema; never hand-write index DDL; always commit `drizzle/meta/`.
**Warning sign:** a `DROP INDEX` you did not ask for in a generated migration.

### Pitfall 7: `.concurrently()` breaking the migration
**What goes wrong:** `drizzle-kit migrate` selects the `postgres` driver and calls `drizzle-orm/postgres-js`'s `migrate()`, which runs `session.transaction(async tx => { ... })` around every pending statement (read from `node_modules/drizzle-orm/pg-core/dialect.js`). Postgres refuses `CREATE INDEX CONCURRENTLY` inside a transaction block.
**How to avoid:** never call `.concurrently()`. The default output is correct.
**Is it needed?** No. Total build time for all 11 indexes: **1.08 s**, taking `ShareLock` on each table — which blocks writes but **not reads**. For a single-instance self-hosted deploy applied at deploy time, this is irrelevant.

### Pitfall 8: Assuming `drizzle-kit generate` will emit extra DDL
**What goes wrong:** an unexpected `ALTER TABLE` or `DROP` lands in `0012` because the schema had drifted from the snapshot.
**Reality (verified):** I generated against a scratch copy of the real schema diffed against the real `drizzle/meta/0011_snapshot.json`. Output contained **only** `CREATE INDEX` statements. **The schema and snapshot 0011 are in sync; there is no drift.** All 28 tables the schema declares exist in the DB.
**How to avoid anyway:** read `0012_*.sql` after generating and reject anything that is not `CREATE INDEX`.

### Pitfall 9: Fearing that `db:migrate` will re-run old migrations
**What goes wrong:** `drizzle.__drizzle_migrations` holds only **4** rows for **12** migration files — 0000–0007 were applied via `db:push`, 0008–0011 via `db:migrate`. This looks alarming.
**Reality (verified):** the migrator compares `folderMillis` against the **single most recent** record only. Max recorded `created_at` = `1774729567507`, exactly `0011_simple_darwin`'s journal timestamp. A new `0012` will have a larger `folderMillis`, so **only `0012` runs**. No re-application, no conflict.

### Pitfall 10: Asserting `deals.owner_id` uses its index
**What goes wrong:** every deal in this dataset has the same owner (`n_distinct = 1`), so the planner correctly ignores the index. A verification step demanding an index scan there fails permanently.
**How to avoid:** verify SC-3 via `pg_indexes`, not via EXPLAIN. Same caveat applies to any assertion that `deleted_at IS NULL` reads get faster — they do not.

## Code Examples

### SC-1: capture the kanban plan (run inside the container)

```bash
sudo -v
sudo -n docker compose exec -T postgres psql -U pipelite -d pipelite -c "
EXPLAIN (ANALYZE, BUFFERS, COSTS)
SELECT id, title, position FROM deals
WHERE stage_id IN ('ad4d9fb5-92c7-4170-8e93-2163153a99d9','01374f39-b838-4977-a48e-8fd126aa83f5')
  AND deleted_at IS NULL
ORDER BY position ASC;"
```
Expected BEFORE: `Seq Scan on deals` … `Rows Removed by Filter: 21453`, cost ≈2729, buffers 2414.
Expected AFTER: `Bitmap Heap Scan on deals` ← `Bitmap Index Scan on deals_stage_id_idx`, cost ≈2614, buffers ≈426.

> `sudo -S` reads the password from stdin, so it conflicts with `psql -f -` / stdin redirection. Cache credentials with `sudo -v` first, then use `sudo -n`. For multi-statement scripts, write the file into the container (`sudo -n docker compose exec -T postgres bash -c 'cat > /tmp/x.sql' < local.sql`) and run `psql -f /tmp/x.sql`.

### SC-2: capture the reminder-cron plan

```bash
sudo -n docker compose exec -T postgres psql -U pipelite -d pipelite -c "
EXPLAIN (ANALYZE, BUFFERS, COSTS)
SELECT \"id\",\"title\",\"due_date\",\"assignee_id\",\"owner_id\" FROM \"activities\"
WHERE \"activities\".\"completed_at\" IS NULL
  AND \"activities\".\"deleted_at\" IS NULL
  AND \"activities\".\"reminder_sent_at\" IS NULL
  AND \"activities\".\"due_date\" >= now()
  AND \"activities\".\"due_date\" <= now() + interval '1 hour';"
```
Expected BEFORE: `Seq Scan on activities`, `Rows Removed by Filter: 79023`, cost 5071.99, buffers 3294.
Expected AFTER: `Index Scan using activities_due_date_idx`, cost 12.21, buffers 5.

### SC-3: prove all eleven columns are index-backed

```sql
WITH required(tbl, col) AS (VALUES
  ('deals','stage_id'), ('deals','deleted_at'), ('deals','organization_id'),
  ('deals','person_id'), ('deals','owner_id'),
  ('activities','due_date'), ('activities','deal_id'), ('activities','deleted_at'),
  ('people','organization_id'), ('people','deleted_at'),
  ('organizations','deleted_at'))
SELECT r.tbl, r.col,
       EXISTS (
         SELECT 1 FROM pg_index i
         JOIN pg_class  c ON c.oid = i.indrelid
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
         WHERE c.relname = r.tbl AND a.attname = r.col
       ) AS index_backed
FROM required r ORDER BY 1, 2;
```
All eleven rows must be `t`. Checks the **leading** index column, which is what the planner can use for an equality/range probe.

### Non-destructive index experimentation (used throughout this research)

```sql
BEGIN;
CREATE INDEX tmp_probe ON deals USING btree (stage_id);
EXPLAIN (ANALYZE, COSTS) SELECT ...;
SELECT pg_size_pretty(pg_relation_size('tmp_probe'));
ROLLBACK;   -- index is gone; verified 0 leftovers in pg_indexes
```

### Confirming the generated migration is index-only

```bash
node -e "console.log(require('fs').readFileSync('drizzle/0012_<name>.sql','utf8'))"
```
Every statement must start with `CREATE INDEX`. Expected shape (verified from a scratch generate):
```sql
CREATE INDEX "deals_stage_id_idx" ON "deals" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "deals_organization_id_idx" ON "deals" USING btree ("organization_id");--> statement-breakpoint
...
```

## Runtime State Inventory

This is a schema-migration phase, so runtime state matters even though no strings are being renamed.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| **Stored data** | None. Adding an index does not alter, move, or reinterpret a single row. Verified: 25,206 deals / 79,023 activities / 46,055 orgs / 38,345 people are read-only inputs to this phase. | None — **no data migration**, code/DDL only |
| **Live service config** | The dev Postgres volume `postgres_data` is the only stateful service holding schema. `drizzle.__drizzle_migrations` currently has 4 records (0008–0011); 0000–0007 were `db:push`ed and are unrecorded. Verified that this does **not** cause re-application: the migrator compares only against the max `created_at` (`1774729567507` = 0011). | None — `npm run db:migrate` will apply only `0012` |
| **OS-registered state** | None. No cron entries, systemd units, or scheduled tasks reference indexes. The reminder loop is an in-process `setTimeout` chain started from `instrumentation.ts` (`src/lib/email-processor.ts:13-16`) and needs no change. | None |
| **Secrets / env vars** | None. `DATABASE_URL`, `POSTGRES_*` in `.env` are unchanged. `INTERNAL_SECRET` gates the reminder route and is untouched. | None |
| **Build artifacts** | `drizzle/meta/0012_snapshot.json` and the `_journal.json` entry are **generated artifacts that must be committed**. Leaving them out is what produced the `0010` regression. A stale `.next/standalone` copy of the app exists but contains no schema state that affects this phase (and `vitest.config.ts` already excludes `.next/**`). | Commit `drizzle/0012_*.sql` **and** `drizzle/meta/` together in the same commit |
| **Production/other deployments** | Any deployment other than this dev container has its own DB and needs `npm run db:migrate` at deploy time. Lock window measured at **≈1.08 s** total (`ShareLock` per table: blocks writes, allows reads). | Note in the plan; no code change |

## Project Constraints (from CLAUDE.md)

There is **no `./CLAUDE.md`** in the project root (verified: file does not exist). The operative constraints come from the user's global memory and are binding:

- **Always use Docker; never a local dev server.** Do not run `npm run dev` / `next dev` / `pnpm dev`. This phase needs no dev server at all.
- **All `docker` commands require `sudo`** (password `$SUDO_PASSWORD`). `psql` is not on the host — go through `sudo docker compose exec -T postgres psql`.
- Postgres: `localhost:5433` from the host, `postgres:5432` inside the Docker network. App: `http://localhost:3001`.
- Migrations are run with `npx drizzle-kit migrate` (i.e. `npm run db:migrate`) against `localhost:5433`.
- Schema convention: `src/db/schema/` one file per entity plus `_relations.ts` (which exists to break circular imports — do not add to it here).
- Server-action return shape `{ success, error/id }` — not touched by this phase.

**Tooling gotcha (from the phase brief, confirmed in practice):** the `rtk` shell hook rewrites commands and swallows output — `npx vitest run` printed only `PASS (1) FAIL (0)`, and `wc -l` / `grep -c` return match summaries instead of counts. Use `rtk proxy "<cmd>" > file 2>&1` and read the file with `node -e`, or count via `node -e`. The plan's verification steps must account for this or they will appear to produce no output.

## User Constraints (from CONTEXT.md)

### Locked Decisions

> All implementation choices are at Claude's discretion — schema-only infrastructure phase. Constraints that follow from the codebase and success criteria:
>
> - **Definition site:** declare indexes in the Drizzle schema files under `src/db/schema/` and generate the migration with `drizzle-kit generate`, rather than hand-writing SQL. Three existing schema files (`workflows.ts`, `webhooks.ts`, `webhook-deliveries.ts`) already use Drizzle's `index()` builder, so that is the established pattern. Hand-written SQL is justified only if `drizzle-kit generate` cannot express what is needed.
> - **Single migration:** SC-3 says "via a single migration" — all index DDL lands in one generated migration file, not one per table.
> - **Partial vs plain on `deleted_at`:** at the planner's discretion. A partial index (`WHERE deleted_at IS NULL`) is usually the better fit for a soft-delete filter and there is precedent in this repo (STATE.md records a partial index on `next_run_at WHERE active = true` from the v1.2 work). If Drizzle cannot generate the partial form cleanly, a plain index is acceptable — document which was chosen and why.
> - **No behavior change:** do not modify any test, query, or server action. SC-4 is explicit.

### Claude's Discretion

Everything above is discretionary. Research resolves it as follows:
- Definition site: schema files, `drizzle-kit generate`. **`generate` can express partial indexes** (verified), so the hand-written-SQL escape hatch is not needed for any reason.
- Single migration: `0012_*.sql`, verified to contain only `CREATE INDEX` statements.
- **Partial vs plain: PLAIN, all eleven.** Not because Drizzle cannot do partial — it demonstrably can — but because on this data a partial index on `stage_id` is byte-for-byte the same size and cost as the plain one while breaking `admin/pipelines/actions.ts:483-489`, and a partial index on `deleted_at` predicated on `deleted_at IS NULL` would be degenerate. Rationale and measurements are in the "Partial vs plain" section above; the plan must carry that rationale into its own record.
- Correction for the record: the STATE.md partial-index precedent (`next_run_at WHERE active = true`) **no longer exists in the database.** It was hand-written into `0009` and dropped by `0010`. It is a cautionary precedent, not a supporting one.

### Specific Ideas (verification risk) — resolved

> Postgres will prefer a sequential scan on a small table regardless of whether an index exists … If the dev database has only a handful of rows, these two criteria cannot be demonstrated …

**The premise is false for this database.** 25,206 deals and 79,023 activities: both queries seq-scan today and both flip to index scans with no seeding. Full resolution in "Resolving the Small-Table Problem" above. The `SET enable_seqscan = off` prohibition is confirmed with reasoning, not just accepted. The residual risk is **selectivity** (crossover at ~15–19% of `deals`, default pipeline sitting at 14.9% with a 4% margin), which the plan must handle by pinning verification to the default pipeline and pre-accepting bitmap index scans.

### Deferred Ideas (OUT OF SCOPE)

> - Index tuning for the v1.2 workflow tables — they already declare their own indexes
> - Query restructuring or denormalization for the kanban board — out of scope; this phase only adds indexes
> - A repeatable performance benchmark harness — not required by PERF-01 or PERF-02

Research adds one more to defer: **lowering `random_page_cost` from 4 to ~1.1** for SSD. It would widen every index win and push the selectivity crossover well past 19%, but it is a server configuration change, not an index, and belongs outside this phase.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **PERF-01** | Core CRM foreign keys and hot filter columns are indexed — `deals.stage_id`, `deals.deleted_at`, `deals.organization_id`, `deals.person_id`, `deals.owner_id`, `activities.due_date`, `activities.deal_id`, `people.organization_id`, and the `deleted_at` columns on orgs/people/activities | Definitive have/need table: **all 11 are currently unindexed**, zero incidental coverage (`pg_indexes` shows only 4 pkeys). Exact declaration form given, matching `workflows.ts`. `pg_indexes` assertion query provided for verification. Caveat documented: `deals.owner_id` will not be *used* by the planner in this dataset (`n_distinct = 1`) but is still index-backed. |
| **PERF-02** | The kanban board query and the activity-reminder cron query use index scans rather than sequential scans, confirmed by `EXPLAIN ANALYZE` before and after | Both queries located and quoted with file:line (`src/app/deals/page.tsx:104-145`; `src/app/api/internal/email/process/route.ts:32-49`), actual emitted SQL captured via `.toSQL()`, BEFORE plans captured (both **Seq Scan**), AFTER plans captured (`Bitmap Index Scan on deals_stage_id_idx`; `Index Scan using activities_due_date_idx`) with cost/time/buffer deltas. Selectivity crossover measured, default pipeline identified, bitmap-vs-plain acceptance criterion stated. |

## State of the Art

| Old approach | Current approach | Impact here |
|--------------|------------------|-------------|
| `pgTable(name, cols, (table) => ({ key: index(...) }))` (object return) | `pgTable(name, cols, (table) => ([ index(...) ]))` (array return) | Both work in drizzle-orm 0.45.1; I generated a correct migration with the array form and the repo's `0008` proves the object form. **Use the object form for consistency** per CONTEXT. |
| Hand-written index SQL in migrations | Schema-declared indexes | Mandatory now, and this repo has the scar to prove it (`0009` → `0010`) |
| Assuming FKs are indexed | Explicitly index FKs | Postgres has never auto-indexed FK columns; this phase exists because of that |

**Deprecated / not applicable:**
- `drizzle-kit push` for schema changes in a repo that tracks migrations — bypasses the migration file that SC-3 requires.
- The `next_run_at WHERE active = true` partial index recorded in STATE.md — **no longer exists in the database** (dropped by `0010`). Do not cite it as a live precedent.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | `vitest.config.ts` (include `src/**/*.{test,spec}.*`; exclude `**/.next/**` + defaults; `@` → `./src`) |
| Quick run command | `npm test` (`vitest run`) |
| Full suite command | `npm test` — same; plus `npm run typecheck` (`tsc --noEmit`) and `npm run lint` |
| Current baseline | exit 0, 41 files, 461 passed / 4 skipped; `tsc --noEmit` and `eslint` both exit 0 |

### SC-4 is satisfiable with zero test changes — VERIFIED, not assumed

The brief asked me to verify rather than assume. I did:

- **18 test files import `@/db`.** **All 18 call `vi.mock("@/db", ...)`.** Counted programmatically (grep for `vi.mock("@/db"` → 18 files; grep for `@/db` in `*.test.ts` → the same 18 files). No test file connects to a real database.
- **Only `src/db/index.ts` calls `postgres(...)`** — a single file, and it is never imported unmocked by a test.
- Four tests go further and replace the schema module entirely: `vi.mock("@/db/schema", ...)` in `src/lib/execution/actions/__tests__/{crm,email,http,notification}.test.ts`. In those, the real `deals.ts`/`activities.ts` are not even loaded, so index declarations cannot affect them.
- Adding a third argument to `pgTable(...)` does not change the exported table object's column accessors or its `$inferSelect`/`$inferInsert` types, so `tsc --noEmit` is unaffected. The three schema files that already do this (`workflows.ts`, `webhooks.ts`, `webhook-deliveries.ts`) currently typecheck clean.

**Conclusion: adding indexes is invisible to the suite. SC-4 requires no test modification, and none is permitted.**

### Phase Requirements → Validation Map

| Req / SC | Behavior | Type | Command | Exists? |
|----------|----------|------|---------|---------|
| SC-4 / PERF-01 | Suite unchanged and green | automated unit | `npm test` | ✅ 41 files, 461 passed |
| SC-4 | No type regression from schema edits | automated | `npm run typecheck` | ✅ exits 0 |
| SC-4 | No lint regression | automated | `npm run lint` | ✅ exits 0 |
| SC-4 | No app source touched | automated | `git diff --stat` — must show only `src/db/schema/{deals,organizations,people,activities}.ts`, `drizzle/0012_*.sql`, `drizzle/meta/*` | n/a |
| SC-3 / PERF-01 | All 11 columns index-backed | automated SQL assertion | the `pg_indexes` CTE query in Code Examples — all 11 rows `t` | n/a (new script) |
| SC-3 | Exactly one migration file added | automated | `git status --short drizzle/` shows one new `.sql` | n/a |
| SC-3 | Migration contains only `CREATE INDEX` | manual review | read `drizzle/0012_*.sql` | n/a |
| **SC-1 / PERF-02** | Kanban: Seq Scan → index scan on `deals.stage_id` | **manual, DB-dependent** | `EXPLAIN (ANALYZE, BUFFERS, COSTS)` before + after, BDR default pipeline, literal `IN` | ❌ needs a captured artifact |
| **SC-2 / PERF-02** | Reminder cron: Seq Scan → `Index Scan using activities_due_date_idx` | **manual, DB-dependent** | `EXPLAIN (ANALYZE, BUFFERS, COSTS)` before + after, exact reminder SQL | ❌ needs a captured artifact |

**Why SC-1/SC-2 cannot be unit tests:** they are assertions about the PostgreSQL planner's choice on a specific dataset. Every DB-touching test mocks `@/db`, so vitest has no real-database access, and creating one would violate SC-4 (no test modifications) and the deferred-ideas boundary (no benchmark harness). The correct artifact is a committed before/after plan capture reviewed by `/gsd:verify-work`.

### Sampling Rate

- **Per task commit:** `npm test` (fast; ~seconds) + `npm run typecheck`
- **Per schema-file edit:** `npm run typecheck` (catches a malformed third argument immediately)
- **After `db:generate`:** read the generated SQL; assert index-only
- **After `db:migrate`:** run the `pg_indexes` assertion (SC-3) and capture AFTER plans (SC-1/SC-2)
- **Phase gate:** `npm test` + `npm run typecheck` + `npm run lint` all green, plus the before/after plan artifact, before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] A verification script (e.g. `.planning/phases/33-.../verify-plans.sql`) holding the two `EXPLAIN` statements and the `pg_indexes` assertion — must be runnable **before** the migration to capture BEFORE, and again after.
- [ ] A captured artifact (e.g. `33-PLANS.md`) with BEFORE and AFTER plans side by side, plus the explicit note that the `Closer` pipeline correctly keeps a Seq Scan and that `deals.owner_id` correctly does not use its index.
- [ ] No test framework work needed — vitest is installed and green; **no new test files, no test edits.**

### Ordering constraint (non-negotiable)

```
1. capture BEFORE plans        (must precede any DDL — otherwise SC-1/SC-2's "previously" clause is unprovable)
2. edit 4 schema files
3. npm run typecheck           (fast failure on malformed pgTable third argument)
4. npm run db:generate         (→ drizzle/0012_*.sql + meta snapshot)
5. review generated SQL        (must be CREATE INDEX only)
6. npm run db:migrate          (~1.08 s)
7. run pg_indexes assertion    (SC-3)
8. capture AFTER plans         (SC-1, SC-2)
9. npm test + typecheck + lint (SC-4)
10. commit schema + migration + meta + plan artifact together
```

## Security Domain

`security_enforcement` is not set in `.planning/config.json`, so it is treated as enabled. This phase adds btree indexes and touches no request path, so most categories are structurally inapplicable.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface touched. Auth.js JWT/Credentials unchanged. |
| V3 Session Management | no | No session code touched. |
| V4 Access Control | no | No authorization logic touched. Indexes are invisible to row visibility; the app's own `deleted_at IS NULL` filters remain the only soft-delete gate and are unchanged. |
| V5 Input Validation | no | No new user input. Index DDL is static and contains no interpolated values. |
| V6 Cryptography | no | No crypto. |
| V7 Error Handling & Logging | no | No new error paths. |
| V12 Data Protection | **partially** | Index leaves store copies of indexed column values (including `deleted_at` timestamps) in `base/` on disk. Same trust boundary as the heap; no new exposure. Backup/restore procedures (POLISH-02, Phase 43) rebuild indexes from the schema. |
| V14 Configuration | **yes** | Migration must be applied deterministically via the tracked `drizzle/` migration chain, not `db:push`. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard mitigation | Status here |
|---------|--------|---------------------|-------------|
| SQL injection via index DDL | Tampering | DDL is static, generated from the schema, no user input | N/A by construction |
| Migration drift between environments | Tampering | Single tracked migration + committed `drizzle/meta/` snapshot; `__drizzle_migrations` ledger | Addressed by design; `db:push` explicitly forbidden |
| Denial of service via migration lock | Availability | `CREATE INDEX` takes `ShareLock` (blocks writes, allows reads) for ≈1.08 s total | Measured; acceptable for single-instance self-hosted |
| Silent index loss on a later generate | Tampering | Declare in schema so the snapshot and schema agree | This is exactly the `0009` → `0010` regression; prevented by the locked decision |
| Soft-delete bypass | Information disclosure | Application-level `isNull(deletedAt)` predicates | **Unchanged** — no query is modified, so soft-delete semantics are byte-identical |
| Credentials in a verification script | Info disclosure | `psql -U pipelite` inside the container uses trust/local auth; do not hardcode `DATABASE_URL` in committed scripts | Note for the plan: the sudo password appears in shell history but must not be committed |

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + compose | Everything | ✓ | `pipelite-postgres-1` up 5 days (healthy), `pipelite-app-1` up 5 days | none needed |
| PostgreSQL | SC-1/SC-2/SC-3 | ✓ | 16.13 (postgres:16-alpine), `localhost:5433` | none needed |
| `psql` on the **host** | verification | **✗ not installed** | — | `sudo docker compose exec -T postgres psql -U pipelite -d pipelite` (used throughout this research) |
| `sudo` for docker | all DB access | ✓ | password `$SUDO_PASSWORD`; cache with `echo "$SUDO_PASSWORD" \| sudo -S -v` then use `sudo -n` | none |
| `drizzle-kit` | generate + migrate | ✓ | 0.31.9, `node_modules/.bin/drizzle-kit` | none |
| `drizzle-orm` | `index()` builder | ✓ | 0.45.1, `IndexBuilder.where()` present | none |
| `vitest` | SC-4 | ✓ | 4.0.18, `node_modules/.bin/vitest` | none |
| Node.js | tooling | ✓ | v24.13.1 | none |
| `tsx` | — | **✗ not in `node_modules/.bin`** | — | Not needed by this phase (`db:seed-activities` would need `npx tsx`, and it is not part of this work) |
| `psql` for multi-statement scripts | verification | ✓ via container | — | copy the file in (`bash -c 'cat > /tmp/x.sql'`) then `psql -f`; **do not** pipe SQL on stdin to `sudo -S`, the password read collides |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** host `psql` → containerised `psql` (proven working). `tsx` → not required.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | The dev DB's data distribution is representative enough of production that these index choices remain right there. Row counts and selectivity are facts about *this* database; production could have many pipelines each holding a small share (more index wins) or one giant pipeline (more correct seq scans). | Resolving the Small-Table Problem | Low. All 11 indexes are correct regardless; only which *plan* production picks varies. SC-1/SC-2 are graded against this database. |
| A2 | `Bitmap Index Scan` satisfies SC-1's "index scan." | SC-1 acceptance | Medium — it is a wording judgement, not a measurement. If a strict reader demands `Index Scan using`, SC-1 as literally worded is **not achievable** for the kanban query at any selectivity where the index wins, because a 3,753-row scattered fetch is inherently a bitmap plan. Flag for confirmation at plan time. |
| A3 | `deals.owner_id`'s `n_distinct = 1` reflects the dev import, not a product invariant. | Column statistics | Low. The index is correct either way; only the "cannot be demonstrated" note depends on it. |
| A4 | No other developer/branch will add a migration between now and this phase's execution, so the new file will be `0012`. | Architecture / ordering | Low. `git status` is clean and `master` is at `5a88626`. If a migration lands first, the number shifts; nothing else changes. |
| A5 | `drizzle-kit migrate` uses the `postgres` driver path (not `pg`). Inferred from `package.json` listing `postgres@3.4.8` and no `pg`, plus drizzle-kit's probe order (`pg` first, then `postgres`). Both paths wrap in a transaction, so the CONCURRENTLY conclusion holds either way. | Pitfall 7 | None — the conclusion is driver-independent. |

Everything else in this document is `[VERIFIED]` by live query, rolled-back experiment, or installed-source inspection.

## Open Questions

1. **Does `Bitmap Index Scan` count as SC-1's "index scan"?**
   - What we know: with the index present, the kanban query on the default pipeline plans as `Parallel Bitmap Heap Scan on deals` ← `Bitmap Index Scan on deals_stage_id_idx`. Buffers on the `deals` scan drop 2414 → 426; execution 660 ms → 210 ms. The index is unambiguously used.
   - What's unclear: SC-1's exact words are "shows an index scan." A plain `Index Scan using deals_stage_id_idx` is not achievable for a 3,753-row scattered result set at any selectivity where an index beats a seq scan — Postgres will always prefer the bitmap path there.
   - Recommendation: the plan should state this acceptance criterion explicitly up front so `/gsd:verify-work` does not false-fail. SC-2 is unambiguous (a literal `Index Scan`).

2. **Should SC-1 be verified on the default pipeline only, or on several?**
   - What we know: crossover is ~15–19%; `BDR - Base Fria` (the app default) is at 14.9% with a 4% cost margin; `Closer` at 61% correctly seq-scans.
   - Recommendation: verify the default pipeline (this is literally "the kanban board query" as the app runs it) **and** a single stage at 1.3% as a wide-margin corroboration; document the `Closer` seq scan as expected-correct.

3. **Should a narrow partial index be added for the reminder cron on top of `activities_due_date_idx`?**
   - What we know: `(due_date) WHERE completed_at IS NULL AND deleted_at IS NULL AND reminder_sent_at IS NULL` is 64 kB vs 568 kB and cost 8.31 vs 12.21.
   - What's unclear: whether the marginal gain justifies a 12th index outside the PERF-01 list. `reminder_sent_at IS NULL` is true for all 79,022 activities today, so it prunes almost nothing.
   - Recommendation: **no.** The plain index already delivers a 415x cost reduction and satisfies SC-2's wording literally. Revisit only if reminder volume grows.

4. **Is `random_page_cost = 4` worth changing?**
   - What we know: it is the Postgres default and the reason the crossover sits as low as ~15–19%. Lowering to 1.1 (SSD-appropriate) would widen every win.
   - Recommendation: out of scope (a server config change, not an index). Note it as a v1.4+ consideration.

## Sources

### Primary (HIGH confidence — measured or read from installed source)
- Live PostgreSQL 16.13 in `pipelite-postgres-1`: `count(*)`, `pg_indexes`, `pg_class`, `pg_stats`, `pg_stat_user_tables`, `pg_stat_user_indexes`, `pg_settings`, `pg_database`, `drizzle.__drizzle_migrations`, and `EXPLAIN (ANALYZE, BUFFERS, COSTS)` for 7 BEFORE and 10 AFTER plans. AFTER plans produced by creating candidate index sets inside `BEGIN … ROLLBACK`; zero leftovers confirmed.
- `node_modules/drizzle-orm/pg-core/indexes.d.ts` — `IndexBuilder.where(condition: SQL)`, `IndexConfig.where?: SQL`, `.concurrently()`
- `node_modules/drizzle-orm/pg-core/dialect.js` — `async migrate(...)` wraps all pending migrations in `session.transaction(...)`
- `node_modules/drizzle-kit/bin.cjs` — driver probe order (`pg` → `postgres` → `@vercel/postgres` → `@neondatabase/serverless`); `migrate` delegates to `drizzle-orm/postgres-js`'s `migrate`
- `drizzle-kit generate` (0.31.9) run against a scratch copy of the real schema diffed against real `drizzle/meta/0011_snapshot.json` — produced index-only SQL with correct `WHERE` clauses
- Drizzle `.toSQL()` on the real `db.query.deals.findMany(...)` and the real reminder `select(...)` (temporary test file, deleted; `git status` clean)
- Repo source: `src/app/deals/page.tsx`, `src/app/api/internal/email/process/route.ts`, `src/lib/email-processor.ts`, `src/app/admin/pipelines/actions.ts`, `src/db/schema/*.ts`, `src/db/index.ts`, `drizzle/0004`, `0008`, `0009`, `0010`, `0011`, `drizzle/meta/_journal.json`, `drizzle/meta/0009_snapshot.json`, `package.json`, `drizzle.config.ts`, `vitest.config.ts`, `tsconfig.json`, `docker-compose.yml`, `.env`
- `git log -S nextRunAtIdx -- src/db/schema/workflows.ts` → no results, proving the `0009` partial index was never schema-declared
- Test-mock audit: 18 files importing `@/db`, 18 calling `vi.mock("@/db")`; only `src/db/index.ts` calls `postgres(...)`
- `.planning/`: `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`, `33-CONTEXT.md`

### Secondary (MEDIUM confidence)
- Well-established PostgreSQL behaviours applied to the measured data: FK columns are not auto-indexed (corroborated by `pg_indexes` here), `CREATE INDEX` takes `ShareLock` while `CONCURRENTLY` cannot run in a transaction block (corroborated by the transaction-wrapping code read above), btree deduplication of low-cardinality keys (corroborated by the 200 kB vs 1696 kB measurement).

### Tertiary (LOW confidence)
- None. No claim in this document rests on unverified web search or training recall.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — all versions read from installed `package.json` files; nothing to install
- Row counts / existing indexes / statistics: **HIGH** — direct catalog queries against the live DB
- BEFORE plans: **HIGH** — captured today with `EXPLAIN (ANALYZE, BUFFERS, COSTS)`
- AFTER plans: **HIGH** — captured today from real index builds inside rolled-back transactions on the same data
- Selectivity crossover: **HIGH** — six-point sweep with real cost numbers
- Drizzle partial-index capability: **HIGH** — type declaration read *and* migration generated *and* SQL accepted by Postgres
- `CONCURRENTLY` incompatibility: **HIGH** — read from both `drizzle-orm`'s migrator and `drizzle-kit`'s driver selection
- SC-4 satisfiability: **HIGH** — 18/18 db-importing tests verified to mock `@/db`
- SC-1 acceptance wording (bitmap vs plain index scan): **MEDIUM** — the measurement is certain, the interpretation of SC-1's wording needs plan-time confirmation (see Open Question 1)

**Research date:** 2026-08-14
**Valid until:** 2026-09-13 (30 days) for the tooling and pattern findings. The **row counts and plan choices are a snapshot** — if the dev database is re-imported, re-seeded, or grows materially, re-run the crossover sweep before trusting the SC-1 margin, which is only 4%.
