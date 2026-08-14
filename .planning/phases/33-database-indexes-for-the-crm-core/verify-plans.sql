-- =============================================================================
-- Phase 33 - Database Indexes for the CRM Core
-- verify-plans.sql : reusable, read-only plan + catalog capture script
--
-- This file is executed UNCHANGED twice: once in plan 33-01 (before any index
-- exists) and once in plan 33-03 (after the generated migration is applied).
-- Byte-identical execution is what makes the BEFORE/AFTER comparison sound by
-- construction rather than by narration.
-- =============================================================================
--
-- SAFETY
--   Strictly read-only. Contains no DDL, no data-modifying statements, and no
--   transaction-control statements. Safe to run against this database, which
--   holds real imported customer CRM data (25,206 deals / 79,023 activities /
--   46,055 organizations / 38,345 people). Not a single row is touched.
--
-- PLANNER TOGGLES ARE DELIBERATELY ABSENT
--   No planner GUC is set anywhere in this file. In particular, the well-known
--   trick of switching the sequential-scan planner toggle off is NOT used here.
--   That toggle does not actually forbid sequential scans, it merely applies a
--   large cost penalty, so a plan produced under it proves only that an index is
--   USABLE - never that the planner genuinely PREFERS it. This phase's success
--   criteria are assertions about planner preference, so the planner is left
--   entirely at its defaults (random_page_cost = 4, per D-08).
--
-- ANALYZE IS DELIBERATELY ABSENT
--   No standalone ANALYZE statement is run. Planner statistics were verified
--   present and accurate via pg_class.reltuples and pg_stats, and re-collecting
--   them would shift the recorded costs and break comparability with the
--   33-RESEARCH.md baseline and between the two runs of this script.
--
-- CREDENTIALS
--   None. The in-container `psql -U pipelite` uses local trust auth, so no
--   connection string and no password appears anywhere in this file.
--
-- USAGE (identical both times, from the repo root):
--   echo "<sudo-pw>" | sudo -S -v
--   sudo -n docker compose exec -T postgres bash -c 'cat > /tmp/33-verify-plans.sql' \
--     < .planning/phases/33-database-indexes-for-the-crm-core/verify-plans.sql
--   sudo -n docker compose exec -T postgres psql -U pipelite -d pipelite \
--     -f /tmp/33-verify-plans.sql
-- =============================================================================


\echo ''
\echo '=============================================================================='
\echo 'Q1 / SC-1 - kanban, BDR - Base Fria default pipeline, 14.9% selectivity'
\echo '=============================================================================='
-- The kanban board query as src/app/deals/page.tsx:104-145 actually issues it.
-- The stage list MUST be a literal value list: that is what Drizzle emits from
-- sql`${deals.stageId} IN ${stageIds}`, which Postgres normalises to
-- stage_id = ANY (...). The subquery form over the stages table must NOT be used
-- (RESEARCH.md Pitfall 4) - it produces a Hash Join over a sequential scan of
-- deals and would misrepresent the plan the application actually gets.
-- `BDR - Base Fria` is the pipeline the page loads by default (no pipeline has
-- is_default = true, so allPipelines[0] wins): 2 stages, 3,753 live deals =
-- 14.9% of the table, inside the index-winning region with a 4% cost margin.
-- Expected without indexes: a sequential scan on deals, cost ~2729, ~2414 buffers.
-- Expected with indexes:    Bitmap Heap Scan on deals fed by
--                           Bitmap Index Scan on deals_stage_id_idx (D-01).
EXPLAIN (ANALYZE, BUFFERS, COSTS)
SELECT id, title, position
FROM deals
WHERE stage_id IN ('ad4d9fb5-92c7-4170-8e93-2163153a99d9','01374f39-b838-4977-a48e-8fd126aa83f5')
  AND deleted_at IS NULL
ORDER BY position ASC;


\echo ''
\echo '=============================================================================='
\echo 'Q2 / SC-1 corroboration - single stage, strictly lower selectivity than Q1'
\echo '=============================================================================='
-- Identical to Q1 but narrowed to one stage (~1.3% of the table), i.e. strictly
-- lower selectivity than Q1 and therefore a far wider cost margin for the index.
-- This exists only to corroborate Q1; NO specific row count is asserted for it,
-- and it is not itself a success criterion.
EXPLAIN (ANALYZE, BUFFERS, COSTS)
SELECT id, title, position
FROM deals
WHERE stage_id IN ('ad4d9fb5-92c7-4170-8e93-2163153a99d9')
  AND deleted_at IS NULL
ORDER BY position ASC;


\echo ''
\echo '=============================================================================='
\echo 'Q3 / SC-2 - activity-reminder cron query'
\echo '=============================================================================='
-- The exact SQL Drizzle emits from src/app/api/internal/email/process/route.ts:32-49.
-- Note: due_date is stored at 00:00:00 for every row in this dataset, so a
-- mid-day 1-hour window legitimately matches ZERO rows while a run near the
-- midnight boundary matches one. Both are valid and both yield the same plan
-- shape - the selective predicate is the range on due_date either way
-- (n_distinct 1036, correlation 0.9985, a 1-hour window out of a 2022-2030 span).
-- Expected without indexes: sequential scan on activities, cost 5071.99, ~3294 buffers.
-- Expected with indexes:    a literal Index Scan using activities_due_date_idx,
--                           cost ~12.21, ~5 buffers.
EXPLAIN (ANALYZE, BUFFERS, COSTS)
SELECT "id", "title", "due_date", "assignee_id", "owner_id"
FROM "activities"
WHERE "activities"."completed_at" IS NULL
  AND "activities"."deleted_at" IS NULL
  AND "activities"."reminder_sent_at" IS NULL
  AND "activities"."due_date" >= now()
  AND "activities"."due_date" <= now() + interval '1 hour';


\echo ''
\echo '=============================================================================='
\echo 'Q4 / SC-3 - catalog assertion: all eleven target columns index-backed?'
\echo '=============================================================================='
-- Joins pg_index / pg_class / pg_attribute on a.attnum = i.indkey[0], so it tests
-- the LEADING index column - the only position the planner can use for an
-- equality or range probe.
--
-- This is the ONLY admissible proof for deals.owner_id (D-05): that column has
-- n_distinct = 1 in this dataset - every deal shares one owner - so the planner
-- correctly ignores its index forever and no plan capture can ever demonstrate
-- it. SC-3 asks that the column be index-backed, which is a catalog fact rather
-- than a plan-choice fact.
--
-- Required result: eleven rows reading `f` before the migration is applied, and
-- eleven rows reading `t` afterwards. Anything else fails SC-3.
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
