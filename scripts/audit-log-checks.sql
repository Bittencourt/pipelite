-- =============================================================================
-- audit-log-checks.sql — the standing evidence script for migration 0014
-- =============================================================================
--
-- WHAT THIS PROVES
--   Part 1 — all four audit_log indexes exist in the catalog, with the two
--            partial predicates intact.
--   Part 2 — audit_log has NO updated_at and NO deleted_at column. The table's
--            immutability is a schema property, not a convention (T-36-12).
--   Part 3 — the locked 90-day retention default is present in app_settings as
--            DATA. If a future migration or a botched restore drops it, the
--            pruner silently stops and this script is what says so (T-36-43).
--   Part 4 — the retention prune statement is valid and its plan uses the
--            created_at index rather than a sequential scan (T-36-09).
--
-- HOW TO RUN
--   docker compose -p pipelite exec -T postgres psql -U pipelite -d pipelite -f - < scripts/audit-log-checks.sql
--
--   psql runs on the container's unix socket, so no password is passed and none
--   may ever be added to this file or to the command line.
--
-- IT IS RE-RUNNABLE AND MUTATES NOTHING
--   Parts 1-3 are pure SELECTs. Part 4 is an EXPLAIN ANALYZE of a DELETE, which
--   really does execute the delete — so it is wrapped in BEGIN ... ROLLBACK and
--   removes nothing. Do not unwrap it.
--
-- =============================================================================

\echo ''
\echo '=== PART 1 — index catalog: the four declared indexes must be listed ==='
\echo '    (audit_log_pkey also appears: pg_indexes counts the primary key index,'
\echo '     so the honest total for this table is FIVE rows, four of them ours.)'
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'audit_log'
ORDER BY indexname;

\echo ''
\echo '=== PART 1b — the four declared indexes, counted. Expect exactly 4. ==='
SELECT count(*) AS declared_index_count
FROM pg_indexes
WHERE tablename = 'audit_log'
  AND indexname IN (
    'audit_log_entity_idx',
    'audit_log_workflow_run_idx',
    'audit_log_created_at_idx',
    'audit_log_import_session_idx'
  );

\echo ''
\echo '=== PART 2 — immutability: audit_log columns. Expect NO updated_at, NO deleted_at. ==='
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'audit_log'
ORDER BY ordinal_position;

\echo ''
\echo '=== PART 2b — the mutability columns, counted. Expect exactly 0 rows. ==='
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'audit_log'
  AND column_name IN ('updated_at', 'deleted_at');

\echo ''
\echo '=== PART 3 — the seeded retention default. Expect exactly one row, value 90. ==='
SELECT key, value, updated_at
FROM app_settings
WHERE key = 'audit.retention_days';

\echo ''
\echo '=== PART 4 — the prune plan. Wrapped in a rolled-back transaction: deletes nothing. ==='
\echo '    Measured on a 1,000,000-row probe (36-RESEARCH Pitfall 4): with'
\echo '    audit_log_created_at_idx a 5,000-row batch is 17.8 ms via Bitmap Index'
\echo '    Scan -> Tid Scan; without it, 395.7 ms via Seq Scan. On a small or empty'
\echo '    table the planner may legitimately choose a different node — what this'
\echo '    part proves TODAY is that the index exists and the statement is valid.'
BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
DELETE FROM audit_log
WHERE ctid IN (
  SELECT ctid FROM audit_log
  WHERE created_at < now() - make_interval(days => 90)
  LIMIT 5000
);
ROLLBACK;

\echo ''
\echo '=== PART 5 — table size, for context on what the retention window costs. ==='
SELECT
  (SELECT count(*) FROM audit_log)                     AS total_rows,
  (SELECT min(created_at) FROM audit_log)              AS oldest_entry,
  pg_size_pretty(pg_total_relation_size('audit_log'))  AS total_size;
\echo ''
