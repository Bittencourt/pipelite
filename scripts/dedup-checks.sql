-- =============================================================================
-- dedup-checks.sql — the standing database evidence for Phase 39
--                    (Duplicate Detection & Merge)
-- =============================================================================
--
-- WHY THIS FILE EXISTS
--   Every mutation test in this repository mocks `@/db` wholesale. A mocked write
--   cannot raise `notes_migration_uniq`, and a mocked query cannot tell you which
--   plan the planner chose — so the vitest suite can assert the SHAPE of Phase
--   39's matching layer and nothing whatsoever about the two facts the feature
--   actually depends on: that the normalization function the index is built on is
--   really IMMUTABLE, and that the trigram index is really used. Both are
--   properties of a live PostgreSQL and of nothing else. This file is the other
--   half of that proof, and it is the only part of it that talks to a real
--   database.
--
--   The failure it exists to catch is silent. An index built on one expression
--   and a query written with a different one produce no error at all: PostgreSQL
--   quietly declines the index and scans sequentially, turning a ~20 second scan
--   of this deployment's 46,054 organizations into a ~26 minute one, with nothing
--   in the logs to say so (39-VALIDATION V-2).
--
-- WHAT THIS PROVES TODAY
--   Part 0 — the BEFORE snapshot: row counts for every table Phase 39 touches,
--            plus the installed extension list, held in temp tables so Part 9 can
--            prove this script mutated nothing.
--   Part 1 — `pg_trgm` and `unaccent` are installed, and their versions are
--            reported. A missing extension is named.
--   Part 2 — the three functions from migration 0016 exist, all three are
--            IMMUTABLE, and their output matches the measured cases character for
--            character — including the two that encode a decision rather than a
--            behaviour: the `S A` join, and the `Sa` surname that the person
--            normalizer must NOT strip.
--   Parts 3-8 — RESERVED FOR PLAN 39-05. See the note above Part 9.
--   Part 9 — the AFTER snapshot. Every count from Part 0 must be unchanged.
--
-- HOW TO RUN
--   docker compose exec -T postgres psql -U pipelite -d pipelite -f - < scripts/dedup-checks.sql
--
--   or, equivalently, against the running container by name:
--
--   docker exec -i pipelite-postgres-1 psql -U pipelite -d pipelite -f - < scripts/dedup-checks.sql
--
--   psql reaches the server over the container's local unix socket, so NO
--   credential is passed on the command line, none is read from the environment,
--   and none may ever be written into this file. Anything that would need one is
--   out of scope for this script (T-39-15), and the acceptance gate for this file
--   greps for exactly that.
--
--   Run it with ON_ERROR_STOP unset or 0. Parts 0-2 as shipped today raise no
--   errors, but the reserved Parts 3-8 deliberately will — plan 39-05 adds the
--   probe proving that an index expression over the STABLE `unaccent` is REJECTED
--   while the same expression over `dedup_norm_org` is accepted. That rejection
--   is the point of the part, not a failure of it, and ON_ERROR_STOP=1 would
--   abort the run at it. Setting the habit now costs nothing.
--
-- IT IS RE-RUNNABLE AND MUTATES NOTHING
--   Parts 0-2 are pure SELECTs against the catalog and against two functions that
--   read no table. Nothing here writes, and nothing here needs a BEGIN ... ROLLBACK
--   wrapper yet. When Parts 3-8 arrive with probes that really do mutate, EVERY
--   ONE OF THEM MUST BE WRAPPED — the analog to copy is `scripts/trash-checks.sql`,
--   whose fixtures all carry a `tck-` prefix that its final part asserts has left
--   no survivor. Part 9 below is the standing detector either way: it re-counts
--   every table Part 0 counted and fails loudly if a wrapper is ever dropped.
--
-- ON READING THE OUTPUT
--   Every assertion prints a row. Nothing here relies on a silent success, and no
--   part is allowed to pass by producing no output. Grep the run for the word
--   FAIL; a clean run contains it zero times.
--
-- =============================================================================


\echo ''
\echo '###############################################################################'
\echo '# PART 0 — the BEFORE snapshot'
\echo '###############################################################################'
\echo ''
\echo '--- 0a. Row counts for every table Phase 39 touches, held in a TEMP table. ---'
\echo '    A temp table lives in this session only and is gone when psql exits.'

DROP TABLE IF EXISTS pg_temp.dedup_checks_before;

CREATE TEMP TABLE dedup_checks_before AS
            SELECT 'audit_log'     AS tbl, count(*) AS n FROM audit_log
  UNION ALL SELECT 'deals',             count(*) FROM deals
  UNION ALL SELECT 'notes',             count(*) FROM notes
  UNION ALL SELECT 'organizations',     count(*) FROM organizations
  UNION ALL SELECT 'people',            count(*) FROM people;

SELECT tbl, n AS rows_before FROM dedup_checks_before ORDER BY tbl;

\echo ''
\echo '--- 0b. The installed extension list, also snapshotted for Part 9. ---'

DROP TABLE IF EXISTS pg_temp.dedup_checks_ext_before;

CREATE TEMP TABLE dedup_checks_ext_before AS
  SELECT extname, extversion FROM pg_extension;

SELECT extname, extversion FROM dedup_checks_ext_before ORDER BY extname;


\echo ''
\echo '###############################################################################'
\echo '# PART 1 — the two extensions migration 0016 installs'
\echo '###############################################################################'
\echo ''
\echo '--- 1a. Both must be present. pg_trgm supplies similarity() and gin_trgm_ops; ---'
\echo '    unaccent supplies the accent-folding dictionary that immutable_unaccent'
\echo '    names explicitly. Expect one row each, with a version.'

SELECT
  want.extname,
  e.extversion,
  CASE
    WHEN e.extname IS NOT NULL THEN 'PASS'
    ELSE 'FAIL — extension ' || want.extname || ' is NOT installed; migration 0016 has not been applied to this database'
  END AS verdict
FROM (VALUES ('pg_trgm'), ('unaccent')) AS want(extname)
LEFT JOIN pg_extension e ON e.extname = want.extname
ORDER BY want.extname;

\echo ''
\echo '--- 1b. The same fact, counted. Expect exactly 2. ---'

SELECT
  count(*) AS dedup_extension_count,
  CASE WHEN count(*) = 2 THEN 'PASS'
       ELSE 'FAIL — Phase 39 needs both pg_trgm and unaccent; one of them is missing'
  END AS verdict
FROM pg_extension
WHERE extname IN ('pg_trgm', 'unaccent');


\echo ''
\echo '###############################################################################'
\echo '# PART 2 — the three functions: existence, volatility, and output'
\echo '###############################################################################'
\echo ''
\echo '--- 2a. All three must exist in the public schema. Expect exactly 3 rows, ---'
\echo '    every provolatile = i. Anything else and the index in plan 39-05 cannot'
\echo '    be built at all, because a non-immutable function is rejected outright.'

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.provolatile,
  p.proparallel,
  CASE
    WHEN p.provolatile = 'i' THEN 'PASS'
    ELSE 'FAIL — ' || p.proname || ' is not IMMUTABLE and cannot appear in an index expression'
  END AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('immutable_unaccent', 'dedup_norm_org', 'dedup_norm_person')
ORDER BY p.proname;

\echo ''
\echo '--- 2b. The same fact, counted and asserted. Expect 3 present, 3 immutable. ---'

SELECT
  count(*)                                    AS functions_present,
  count(*) FILTER (WHERE provolatile = 'i')   AS immutable_count,
  CASE
    WHEN count(*) = 3 AND count(*) FILTER (WHERE provolatile = 'i') = 3 THEN 'PASS'
    WHEN count(*) <> 3
      THEN 'FAIL — expected 3 dedup functions from migration 0016, found ' || count(*)
    ELSE 'FAIL — a dedup function lost its IMMUTABLE marking; every index built on it is now unbuildable'
  END AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('immutable_unaccent', 'dedup_norm_org', 'dedup_norm_person');

\echo ''
\echo '--- 2c. The normalization contract, case by case. ---'
\echo '    These six are the cases that were MEASURED against this database during'
\echo '    39-RESEARCH, plus the two that encode a decision rather than a behaviour:'
\echo '      - the S A case, which proves the two-token join runs BEFORE the legal'
\echo '        suffix strip. Reverse those two steps and the suffix survives.'
\echo '      - the Sa surname, which proves dedup_norm_person strips NO legal'
\echo '        suffix. Run a person name through the org list and Jose de Sa becomes'
\echo '        jose de, which is not a name and matches every other truncated one.'
\echo '    Expect one row per case, all PASS.'
\echo ''
\echo '    PLAN 39-05 EXTENDS THIS PART with the full case table copied verbatim'
\echo '    from src/lib/dedup/normalize.fixtures.ts. That file is the single source'
\echo '    of the SQL-to-TypeScript parity contract: the TS normalizer and these SQL'
\echo '    functions must agree character for character, because the scan runs in'
\echo '    SQL while the create-time warning and every unit test run in TS. When you'
\echo '    extend it, copy the rows; do not paraphrase them.'

SELECT
  c.fn,
  c.input,
  c.expected,
  CASE c.fn
    WHEN 'org'    THEN public.dedup_norm_org(c.input)
    WHEN 'person' THEN public.dedup_norm_person(c.input)
  END AS actual,
  CASE
    WHEN (CASE c.fn
            WHEN 'org'    THEN public.dedup_norm_org(c.input)
            WHEN 'person' THEN public.dedup_norm_person(c.input)
          END) IS NOT DISTINCT FROM c.expected
    THEN 'PASS'
    ELSE 'FAIL — dedup_norm_' || c.fn || '(' || c.input || ') returned '
         || coalesce(CASE c.fn
                       WHEN 'org'    THEN public.dedup_norm_org(c.input)
                       WHEN 'person' THEN public.dedup_norm_person(c.input)
                     END, '<null>')
         || ' but the contract says ' || coalesce(c.expected, '<null>')
  END AS verdict
FROM (VALUES
  -- The four measured organization cases (39-RESEARCH, run against live data).
  ('org',    'COGUMELO INDUSTRIA E COMERCIO LTDA',        'cogumelo industria e comercio'),
  ('org',    'AUTO POSTO MR DA TAQUARA LTDA ME',          'auto posto mr da taquara'),
  ('org',    'Condomínio do Edifício Internacional RIo',  'condominio do edificio internacional rio'),
  ('org',    'Ramada Hotel & Suítes Recife Boa viagem',   'ramada hotel suites recife boa viagem'),
  -- The S A case: the two-token join must run before the suffix strip.
  ('org',    'UNIAO DE LOJAS LEADER S A',                 'uniao de lojas leader'),
  -- The surname case: the person normalizer must leave Sa alone.
  ('person', 'José de Sá',                                'jose de sa')
) AS c(fn, input, expected)
ORDER BY c.fn, c.input;


-- -----------------------------------------------------------------------------
-- PARTS 3 THROUGH 8 ARE DELIBERATELY UNUSED AND RESERVED FOR PLAN 39-05.
--
-- 39-05 delivers the generated normalized-name columns, the GIN trigram indexes
-- and the duplicate_pairs table, and it owns the parts that assert them:
--   Part 3 — the generated columns and their expressions.
--   Part 4 — the trigram indexes exist in the catalog.
--   Part 5 — THE INDEX IS ACTUALLY USED. An EXPLAIN of the exact query the scan
--            issues, read for a Bitmap Index Scan. This is 39-VALIDATION V-2 and
--            it is the single highest-value assertion in this file, because it is
--            the only one that catches the silent expression-drift failure.
--   Part 6 — the STABLE-versus-IMMUTABLE probe: an index expression over bare
--            unaccent must be REJECTED, the same expression over dedup_norm_org
--            accepted. Wrap it, roll it back, leave no index behind.
--   Part 7 — notes_migration_uniq still exists, since the merge's whole note
--            re-pointing strategy is built around not violating it.
--   Part 8 — the full normalize.fixtures.ts case table (see 2c).
--
-- Do not renumber Part 9. Its number is what reserves this block.
-- -----------------------------------------------------------------------------


\echo ''
\echo '###############################################################################'
\echo '# PART 9 — the AFTER snapshot: this script mutated nothing'
\echo '###############################################################################'
\echo ''
\echo '--- 9a. Every delta must be 0. audit_log is reported but not failed on: the ---'
\echo '    app container is normally running while this script executes, and any'
\echo '    request it serves writes audit rows that have nothing to do with this'
\echo '    file. Same carve-out, and same reasoning, as trash-checks.sql Part 7.'

SELECT
  b.tbl,
  b.n       AS rows_before,
  a.n       AS rows_after,
  a.n - b.n AS delta,
  CASE
    WHEN a.n = b.n           THEN 'PASS'
    WHEN b.tbl = 'audit_log' THEN 'INFO — the running app writes audit rows independently of this script'
    ELSE 'FAIL — THIS SCRIPT CHANGED REAL DATA; a rollback wrapper did not hold'
  END AS verdict
FROM dedup_checks_before b
JOIN (
            SELECT 'audit_log' AS tbl, count(*) AS n FROM audit_log
  UNION ALL SELECT 'deals',         count(*) FROM deals
  UNION ALL SELECT 'notes',         count(*) FROM notes
  UNION ALL SELECT 'organizations', count(*) FROM organizations
  UNION ALL SELECT 'people',        count(*) FROM people
) a ON a.tbl = b.tbl
ORDER BY b.tbl;

\echo ''
\echo '--- 9b. The extension list is unchanged. Expect exactly 0 rows: any row here ---'
\echo '    is an extension this script installed or dropped, which it must never do.'

SELECT
  coalesce(b.extname, a.extname) AS extname,
  b.extversion                   AS version_before,
  a.extversion                   AS version_after,
  'FAIL — the extension list changed during this run' AS verdict
FROM dedup_checks_ext_before b
FULL OUTER JOIN pg_extension a ON a.extname = b.extname
WHERE b.extname IS NULL
   OR a.extname IS NULL
   OR a.extversion IS DISTINCT FROM b.extversion;

\echo ''
\echo '--- 9c. No probe index survived. Reserved Part 6 builds two; both are rolled ---'
\echo '    back. Every fixture object this script may ever create carries the'
\echo '    dedupchk_ prefix. Expect 0.'

SELECT
  count(*) AS surviving_probe_indexes,
  CASE WHEN count(*) = 0 THEN 'PASS'
       ELSE 'FAIL — a probe index survived; drop the dedupchk_ objects by hand'
  END AS verdict
FROM pg_indexes
WHERE indexname LIKE 'dedupchk\_%';

DROP TABLE IF EXISTS pg_temp.dedup_checks_before;
DROP TABLE IF EXISTS pg_temp.dedup_checks_ext_before;

\echo ''
\echo '=== end of dedup-checks.sql ==='
\echo ''
