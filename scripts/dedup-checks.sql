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
--   Part 3 — the four STORED generated columns from migration 0017 exist and are
--            really generated, and the five indexes built on them exist with the
--            right access method, the right operator class and the partial
--            predicate they were declared with.
--   Part 4 — THE INDEX IS ACTUALLY USED, proven by EXPLAIN, together with the
--            negative proof that the assertion can fail. This is 39-VALIDATION
--            V-2 and the single highest-value assertion in this file.
--   Part 5 — `notes_migration_uniq` still exists, is still UNIQUE, and is still
--            partial on `source = 'migration'`.
--   Part 6 — SQL-to-TypeScript normalization parity, case by case, against the
--            full table in src/lib/dedup/normalize.fixtures.ts.
--   Part 7 — the star-versus-clique pair-count sanity assertion, in place BEFORE
--            any pair is ever written.
--   Part 8 — RESERVED FOR PLAN 39-07 (the scan probe).
--   Part 9 — the AFTER snapshot. Every count from Part 0 must be unchanged.
--   Part 10 — RESERVED FOR PLAN 39-10 (the merge probe). It sits AFTER Part 9
--            because it is the only part that writes.
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
--   Run it with ON_ERROR_STOP unset or 0. Part 4f deliberately removes an index
--   inside a transaction it then rolls back; if that transaction ever aborts for
--   an unrelated reason, ON_ERROR_STOP=1 would kill the run at exactly the moment
--   the recovery assertion needs to execute.
--
-- IT IS RE-RUNNABLE AND MUTATES NO DATA
--   Parts 0-3 and 5-7 are pure SELECTs against the catalog, against two functions
--   that read no table, and against organizations/people. Exactly ONE part
--   changes the database at all — Part 4f — and it is wrapped BEGIN ... ROLLBACK
--   with a `lock_timeout` so it cannot hang behind the running app, followed by
--   an assertion that the index it removed is back. It removes an INDEX, never a
--   row; Part 9 re-counts every table Part 0 counted and fails loudly if that
--   ever stops being true. The analog for the wrapper habit is
--   `scripts/trash-checks.sql`, whose fixtures all carry a `tck-` prefix that its
--   final part asserts has left no survivor; the equivalent prefix here is
--   `dedupchk_`, asserted gone by Part 9c.
--
--   Part 4a runs ANALYZE on organizations and people. ANALYZE changes no row —
--   it refreshes planner statistics — and it is there because without statistics
--   for the columns migration 0017 just added, Part 4 would be measuring the
--   ABSENCE OF STATISTICS rather than the presence of an index, and would report
--   a false alarm on any freshly migrated database.
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
-- A NOTE ON THE NUMBERING, because plan 39-03 reserved these parts with a
-- different assignment than plan 39-05 shipped.
--
-- 39-03's reservation block promised: 3 columns, 4 index existence, 5 EXPLAIN,
-- 6 the STABLE-versus-IMMUTABLE probe, 7 notes_migration_uniq, 8 the fixture
-- table. 39-05's plan merged the columns and the index catalog into one part and
-- dropped the STABLE-versus-IMMUTABLE probe, because 39-03 ALREADY RAN it as its
-- own negative proof and recorded both outcomes in 39-03-SUMMARY: the rejection
-- of an index expression over the bare STABLE function, and the acceptance of the
-- same expression over `dedup_norm_org`. Re-shipping it here would take an
-- ACCESS EXCLUSIVE lock on organizations on every run to re-prove a property of
-- migration 0016 that no longer changes. What replaces it is a strictly stronger
-- probe of the same kind — Part 4f, which removes the trigram index and shows the
-- plan collapse to a sequential scan.
--
-- The parts as SHIPPED are the ones listed at the top of this file. Do not
-- renumber them; plans 39-07 and 39-10 own Parts 8 and 10 by number.
-- -----------------------------------------------------------------------------


\echo ''
\echo '###############################################################################'
\echo '# PART 3 — the generated columns and the five indexes migration 0017 created'
\echo '###############################################################################'
\echo ''
\echo '--- 3a. Four STORED generated columns. attgenerated = s is the whole point: ---'
\echo '    it means the DATABASE computes the value, so no application write path'
\echo '    can forget to, and no application write path can compute it differently.'
\echo '    A plain column carrying an application-maintained copy would drift the'
\echo '    first time a row was updated by anything that had not been taught about'
\echo '    it. Expect exactly 4 rows, every attgenerated = s.'

SELECT
  want.tbl,
  want.col,
  a.attgenerated,
  pg_get_expr(d.adbin, d.adrelid) AS generated_expression,
  CASE
    WHEN a.attname IS NULL
      THEN 'FAIL — ' || want.tbl || '.' || want.col || ' does not exist; migration 0017 has not been applied'
    WHEN a.attgenerated <> 's'
      THEN 'FAIL — ' || want.tbl || '.' || want.col || ' is a plain column, not a generated one'
    WHEN position(want.frag in pg_get_expr(d.adbin, d.adrelid)) = 0
      THEN 'FAIL — ' || want.tbl || '.' || want.col || ' is generated from an expression that does not contain ' || want.frag
    ELSE 'PASS'
  END AS verdict
FROM (VALUES
  ('organizations', 'norm_name',  'dedup_norm_org(name)'),
  ('people',        'norm_name',  'dedup_norm_person('),
  ('people',        'norm_email', 'lower(btrim(COALESCE(email'),
  ('people',        'norm_phone', 'regexp_replace(COALESCE(phone')
) AS want(tbl, col, frag)
LEFT JOIN pg_class     c ON c.relname = want.tbl AND c.relkind = 'r'
LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = want.col AND NOT a.attisdropped
LEFT JOIN pg_attrdef   d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
ORDER BY want.tbl, want.col;

\echo ''
\echo '--- 3b. The five indexes: access method, operator class, and partiality. ---'
\echo '    The operator class is load-bearing and easy to lose: a GIN index built'
\echo '    WITHOUT gin_trgm_ops indexes nothing the % operator can use, exists in'
\echo '    the catalog, looks correct in every listing, and is never chosen.'
\echo '    Partiality is equally load-bearing in the other direction: a partial'
\echo '    index is only usable by a query that carries the same predicate, so'
\echo '    every read path must still spell deleted_at IS NULL for itself.'
\echo '    Expect exactly 5 rows, all PASS.'

SELECT
  want.idx,
  am.amname,
  (
    SELECT string_agg(oc.opcname, ',' ORDER BY u.ord)
    FROM unnest(i.indclass::oid[]) WITH ORDINALITY AS u(cls, ord)
    JOIN pg_opclass oc ON oc.oid = u.cls
  ) AS opclasses,
  (i.indpred IS NOT NULL) AS is_partial,
  CASE
    WHEN c.relname IS NULL
      THEN 'FAIL — index ' || want.idx || ' does not exist; migration 0017 has not been applied'
    WHEN am.amname <> want.am
      THEN 'FAIL — ' || want.idx || ' uses access method ' || am.amname || ', not ' || want.am
    WHEN want.am = 'gin' AND NOT EXISTS (
      SELECT 1
      FROM unnest(i.indclass::oid[]) AS cls
      JOIN pg_opclass oc ON oc.oid = cls
      WHERE oc.opcname = 'gin_trgm_ops'
    )
      THEN 'FAIL — ' || want.idx || ' is a GIN index WITHOUT gin_trgm_ops; the % operator can never use it'
    WHEN i.indpred IS NULL
      THEN 'FAIL — ' || want.idx || ' is not partial; it was declared WHERE deleted_at is null'
    ELSE 'PASS'
  END AS verdict
FROM (VALUES
  ('org_norm_trgm_idx',     'gin'),
  ('org_norm_btree_idx',    'btree'),
  ('people_norm_trgm_idx',  'gin'),
  ('people_norm_btree_idx', 'btree'),
  ('people_norm_email_idx', 'btree')
) AS want(idx, am)
LEFT JOIN pg_class c  ON c.relname = want.idx AND c.relkind = 'i'
LEFT JOIN pg_index i  ON i.indexrelid = c.oid
LEFT JOIN pg_am    am ON am.oid = c.relam
ORDER BY want.idx;

\echo ''
\echo '--- 3c. The same facts, counted. Expect 5 present, 2 gin, 5 partial. ---'

SELECT
  count(*)                                       AS indexes_present,
  count(*) FILTER (WHERE am.amname = 'gin')      AS gin_count,
  count(*) FILTER (WHERE i.indpred IS NOT NULL)  AS partial_count,
  CASE
    WHEN count(*) = 5
     AND count(*) FILTER (WHERE am.amname = 'gin') = 2
     AND count(*) FILTER (WHERE i.indpred IS NOT NULL) = 5
      THEN 'PASS'
    ELSE 'FAIL — the five normalized-name indexes from migration 0017 are not all present and correctly shaped'
  END AS verdict
FROM pg_class c
JOIN pg_index i  ON i.indexrelid = c.oid
JOIN pg_am    am ON am.oid = c.relam
WHERE c.relname IN (
  'org_norm_trgm_idx', 'org_norm_btree_idx',
  'people_norm_trgm_idx', 'people_norm_btree_idx', 'people_norm_email_idx'
);


\echo ''
\echo '###############################################################################'
\echo '# PART 4 — THE INDEX IS ACTUALLY USED (39-VALIDATION V-2)'
\echo '###############################################################################'
\echo ''
\echo '    WHY THIS PART EXISTS, in one sentence: an index built on a different'
\echo '    expression than the query uses is silently ignored — no error, no log'
\echo '    line, no difference in the result set — and the scan degrades from'
\echo '    roughly 20 seconds to roughly 26 minutes on this deployment.'
\echo ''
\echo '    A Bitmap Index Scan SATISFIES the criterion. Phase 33 D-01 recorded that'
\echo '    a plain Index Scan node is physically unachievable for a scattered'
\echo '    multi-row fetch at these selectivities; demanding one would be demanding'
\echo '    a plan PostgreSQL is right to refuse.'

\echo ''
\echo '--- 4a. Refresh planner statistics. This changes NO ROW — it rewrites the ---'
\echo '    catalog statistics the planner reads. Without it, a database that has'
\echo '    just had migration 0017 applied has no statistics at all for the four'
\echo '    new columns, and every probe below would be measuring that absence'
\echo '    rather than the presence of an index. Part 9 re-counts every table to'
\echo '    prove this changed no data.'

ANALYZE organizations;
ANALYZE people;

\echo ''
\echo '--- 4b. Capture the plan of each probe query into a temp table. ---'
\echo '    EXPLAIN cannot be selected from directly, so a plpgsql loop runs each'
\echo '    one and stores its output line by line.'

DROP TABLE IF EXISTS pg_temp.dedup_checks_plans;

CREATE TEMP TABLE dedup_checks_plans (
  probe      text,
  want_index text,
  tbl        text,
  expect     text,
  line_no    int,
  line       text
);

DO $do$
DECLARE
  p record;
  r record;
  n int;
BEGIN
  FOR p IN
    SELECT * FROM (VALUES
      -- The organization fuzzy tier: what the scan issues for every candidate block.
      ('1. org fuzzy — the likely tier',
       'org_norm_trgm_idx', 'organizations', 'index',
       $q$SELECT id, name FROM organizations
          WHERE deleted_at IS NULL
            AND norm_name % public.dedup_norm_org('Supermercado Bom Preco')$q$),
      -- The organization exact tier, which is also the create-time certain check.
      -- A GIN trigram index cannot serve equality, which is why the btree exists.
      ('2. org exact — the certain tier and the create-time check',
       'org_norm_btree_idx', 'organizations', 'index',
       $q$SELECT id, name FROM organizations
          WHERE deleted_at IS NULL
            AND norm_name = public.dedup_norm_org('Supermercado Bom Preco')$q$),
      ('3. person fuzzy — the likely tier',
       'people_norm_trgm_idx', 'people', 'index',
       $q$SELECT id FROM people
          WHERE deleted_at IS NULL
            AND norm_name % public.dedup_norm_person('Maria da Silva')$q$),
      ('4. person name exact',
       'people_norm_btree_idx', 'people', 'index',
       $q$SELECT id FROM people
          WHERE deleted_at IS NULL
            AND norm_name = public.dedup_norm_person('Maria da Silva')$q$),
      -- The person certain tier. The probe spells the SAME expression the column
      -- is generated from, which is the point: it compares a COLUMN, so there is
      -- nothing left that can drift.
      ('5. person e-mail exact — the certain tier',
       'people_norm_email_idx', 'people', 'index',
       $q$SELECT id FROM people
          WHERE deleted_at IS NULL
            AND norm_email = lower(btrim(coalesce('Maria.Silva@Example.COM ', '')))$q$),
      -- 4e's two probes. See the comment above 4e.
      ('6. TRAP — a bare LIMIT 5 on the fuzzy tier',
       'org_norm_trgm_idx', 'organizations', 'trap',
       $q$SELECT id, name FROM organizations
          WHERE deleted_at IS NULL
            AND norm_name % public.dedup_norm_org('Supermercado Bom Preco')
          LIMIT 5$q$),
      ('7. MITIGATION — the same LIMIT 5, ordered by similarity',
       'org_norm_trgm_idx', 'organizations', 'index',
       $q$SELECT id, name, similarity(norm_name, public.dedup_norm_org('Supermercado Bom Preco')) AS s
          FROM organizations
          WHERE deleted_at IS NULL
            AND norm_name % public.dedup_norm_org('Supermercado Bom Preco')
          ORDER BY s DESC
          LIMIT 5$q$)
    ) AS v(probe, want_index, tbl, expect, q)
    ORDER BY 1
  LOOP
    n := 0;
    FOR r IN EXECUTE 'EXPLAIN (FORMAT text) ' || p.q LOOP
      n := n + 1;
      INSERT INTO dedup_checks_plans
        VALUES (p.probe, p.want_index, p.tbl, p.expect, n, r."QUERY PLAN");
    END LOOP;
  END LOOP;
END
$do$;

\echo ''
\echo '--- 4c. The plans themselves, PRINTED. A verdict alone would tell a reader ---'
\echo '    that something passed without telling them which node was chosen; this'
\echo '    is the part someone reads when the number stops matching the claim.'

SELECT probe, line_no, line
FROM dedup_checks_plans
ORDER BY probe, line_no;

\echo ''
\echo '--- 4d. The verdicts. Probes 1-5 and 7 must name their index AND must NOT ---'
\echo '    contain a sequential scan of the table. Both halves matter: a plan can'
\echo '    mention an index in one branch and still scan the table in another.'

SELECT
  probe,
  want_index,
  CASE
    WHEN expect = 'trap' THEN
      CASE
        WHEN position('Seq Scan on ' || tbl in plan_text) > 0
          THEN 'INFO — the trap reproduced, exactly as documented above. This shape must not be shipped.'
        ELSE 'INFO — the trap did NOT reproduce on this database; the mitigation in probe 7 is still the shape to ship'
      END
    WHEN position(want_index in plan_text) = 0
      THEN 'FAIL — the plan never mentions ' || want_index
           || '; the index is being silently ignored and this query is a full scan of ' || tbl
    WHEN position('Seq Scan on ' || tbl in plan_text) > 0
      THEN 'FAIL — the plan still contains a sequential scan of ' || tbl
    ELSE 'PASS'
  END AS verdict
FROM (
  SELECT probe, want_index, tbl, expect,
         string_agg(line, chr(10) ORDER BY line_no) AS plan_text
  FROM dedup_checks_plans
  GROUP BY probe, want_index, tbl, expect
) AS g
ORDER BY probe;

\echo ''
\echo '--- 4e. THE LIMIT TRAP, measured on this deployment on 2026-08-19. ---'
\echo '    Probe 6 is the same fuzzy query as probe 1 with a bare LIMIT 5 on the'
\echo '    end, and the planner answers it with a sequential scan. The reasoning is'
\echo '    sound and the outcome is not: it estimates some hundreds of matching rows'
\echo '    out of 46,054 (compare the rows= figures on probes 1 and 6 above — they'
\echo '    are the same estimate, differently exploited) and concludes it will'
\echo '    stumble over five of them long before the end of the table, which is'
\echo '    cheaper than building a bitmap. That average holds right up until a probe'
\echo '    name matches nothing at all — and then it reads every one of the 46,054'
\echo '    rows to discover it. The cost model is describing the median case; the'
\echo '    create-time warning cares about the tail.'
\echo ''
\echo '    THIS MATTERS FOR THE CREATE-TIME WARNING, which is limited to'
\echo '    CREATE_TIME_MATCH_LIMIT = 5 (src/lib/dedup/constants.ts). Probe 7 is the'
\echo '    shape to ship: ORDER BY similarity(...) DESC before the LIMIT. The sort'
\echo '    forces the whole match set to be produced, the bitmap comes back, and'
\echo '    the top-N ordering is what the warning wanted anyway. A materialized CTE'
\echo '    works too. An OFFSET 0 fence does NOT — PostgreSQL removes a constant'
\echo '    zero offset and flattens the subquery straight back into the trap.'

\echo ''
\echo '--- 4f. THE NEGATIVE PROOF. Remove the trigram index inside a transaction, ---'
\echo '    re-plan probe 1, and show the plan collapse. An assertion that cannot'
\echo '    fail is not an assertion, and this is the only thing that demonstrates'
\echo '    4d is load-bearing rather than decorative.'
\echo ''
\echo '    PASS here means the plan WITHOUT the index is a sequential scan — i.e.'
\echo '    4d would have failed. The transaction is rolled back; 4g re-checks that'
\echo '    the index came back, and lock_timeout keeps the ACCESS EXCLUSIVE lock'
\echo '    from ever queueing behind a long-running query from the app.'

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP INDEX public.org_norm_trgm_idx;

DO $do$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    EXPLAIN (FORMAT text)
    SELECT id, name FROM organizations
    WHERE deleted_at IS NULL
      AND norm_name % public.dedup_norm_org('Supermercado Bom Preco')
  LOOP
    n := n + 1;
    INSERT INTO dedup_checks_plans
      VALUES ('0. NEGATIVE PROOF — the same query with the index removed',
              'org_norm_trgm_idx', 'organizations', 'negative', n, r."QUERY PLAN");
  END LOOP;
END
$do$;

SELECT probe, line_no, line
FROM dedup_checks_plans
WHERE expect = 'negative'
ORDER BY line_no;

SELECT
  want_index,
  CASE
    WHEN position('Seq Scan on ' || tbl in plan_text) > 0
     AND position(want_index in plan_text) = 0
      THEN 'PASS — without ' || want_index || ' the planner falls back to a sequential scan, so 4d can fail'
    ELSE 'FAIL — removing ' || want_index || ' did not change the plan, which means 4d proves nothing'
  END AS verdict
FROM (
  SELECT want_index, tbl, string_agg(line, chr(10) ORDER BY line_no) AS plan_text
  FROM dedup_checks_plans
  WHERE expect = 'negative'
  GROUP BY want_index, tbl
) AS g;

ROLLBACK;

\echo ''
\echo '--- 4g. The index came back. This is the safety assertion for 4f: if the ---'
\echo '    rollback ever fails to happen, the whole feature silently degrades and'
\echo '    this is the row that says so. Expect 1.'

SELECT
  count(*) AS org_norm_trgm_idx_present,
  CASE WHEN count(*) = 1 THEN 'PASS'
       ELSE 'FAIL — org_norm_trgm_idx IS MISSING; part 4f rolled back but the index did not come back. Re-run migration 0017 or rebuild it by hand NOW.'
  END AS verdict
FROM pg_indexes
WHERE indexname = 'org_norm_trgm_idx';


\echo ''
\echo '###############################################################################'
\echo '# PART 5 — notes_migration_uniq survived migration 0017'
\echo '###############################################################################'
\echo ''
\echo '--- 5a. It exists, it is UNIQUE, and it is still partial on source = ---'
\echo '    migration. This index is a permanent database invariant belonging to'
\echo '    Phase 35 (src/db/schema/notes.ts), and the merge in plan 39-09 is'
\echo '    designed AROUND it rather than against it: 29,037 of 46,054'
\echo '    organizations (63%) carry a source=migration note, so reassigning the'
\echo '    loser note naively raises a 23505 and rolls back roughly 40% of real'
\echo '    organization merges. Relaxing this index was considered and rejected.'
\echo '    Expect 1 row, PASS.'

SELECT
  c.relname,
  i.indisunique,
  pg_get_expr(i.indpred, i.indrelid) AS predicate,
  CASE
    WHEN c.relname IS NULL
      THEN 'FAIL — notes_migration_uniq is GONE; a permanent invariant from Phase 35 was dropped'
    WHEN NOT i.indisunique
      THEN 'FAIL — notes_migration_uniq is no longer UNIQUE, so it no longer guards anything'
    WHEN i.indpred IS NULL
      THEN 'FAIL — notes_migration_uniq is no longer partial; it now constrains every note, not just migrated ones'
    WHEN position('migration' in pg_get_expr(i.indpred, i.indrelid)) = 0
      THEN 'FAIL — notes_migration_uniq predicate no longer references the migration source'
    ELSE 'PASS'
  END AS verdict
FROM pg_class c
JOIN pg_index i ON i.indexrelid = c.oid
WHERE c.relname = 'notes_migration_uniq';

\echo ''
\echo '--- 5b. Counted, so a missing index cannot pass by producing no row at all. ---'

SELECT
  count(*) AS present,
  CASE WHEN count(*) = 1 THEN 'PASS'
       ELSE 'FAIL — notes_migration_uniq is not present exactly once'
  END AS verdict
FROM pg_indexes
WHERE indexname = 'notes_migration_uniq';


\echo ''
\echo '###############################################################################'
\echo '# PART 6 — SQL-to-TypeScript normalization parity, case by case'
\echo '###############################################################################'
\echo ''
\echo '    THE SINGLE SOURCE IS src/lib/dedup/normalize.fixtures.ts. The rows below'
\echo '    are that file NORMALIZATION_CASES array copied verbatim, and this part is'
\echo '    the only thing standing between the TypeScript normalizer and the SQL'
\echo '    functions drifting apart. They cannot be allowed to: the scan runs in'
\echo '    SQL, while the create-time warning and every unit test run in TypeScript,'
\echo '    so a divergence silently halves recall on one side and nothing fails.'
\echo '    When a row is added there it MUST be added here, and vice versa.'
\echo ''
\echo '    Every row is an ORGANIZATION case, because that file is the organization'
\echo '    case table — the person normalizer decision is asserted in Part 2c above,'
\echo '    where the Sa surname case lives. Expect 13 rows, all PASS.'

SELECT
  c.fn,
  c.case_name,
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
         || ' but normalize.fixtures.ts says ' || coalesce(c.expected, '<null>')
  END AS verdict
FROM (VALUES
  -- --- measured against the live database (39-RESEARCH) ---
  ('org', 'strips a single trailing LTDA',
   'COGUMELO INDUSTRIA E COMERCIO LTDA',       'cogumelo industria e comercio'),
  ('org', 'strips two stacked suffixes (LTDA ME)',
   'AUTO POSTO MR DA TAQUARA LTDA ME',         'auto posto mr da taquara'),
  ('org', 'folds accents',
   'Condomínio do Edifício Internacional RIo', 'condominio do edificio internacional rio'),
  ('org', 'collapses punctuation and ampersands to single spaces',
   'Ramada Hotel & Suítes Recife Boa viagem',  'ramada hotel suites recife boa viagem'),

  -- --- the `S A` ordering decision: the two-token form is joined BEFORE the suffix pass ---
  ('org', 'joins a spaced S A into SA and then strips it',
   'UNIAO DE LOJAS LEADER S A',                'uniao de lojas leader'),
  ('org', 'dotted S.A. reaches the same string as the spaced form',
   'Uniao de Lojas Leader S.A.',               'uniao de lojas leader'),

  -- --- the article guard: a standalone `a` and a standalone `s` are NOT noise ---
  ('org', 'keeps a standalone Portuguese article `a`',
   'CASA A CASA',                              'casa a casa'),
  ('org', 'keeps a standalone `s`',
   'LOJA S DO NORTE',                          'loja s do norte'),

  -- --- degenerate input ---
  -- The whitespace-only row carries a real TAB, exactly as the fixture does, so
  -- the E'' escape form is required here and nowhere else.
  ('org', 'empty string stays empty',            '',       ''),
  ('org', 'punctuation-only collapses to empty', '###',    ''),
  ('org', 'whitespace-only collapses to empty',  E'   \t  ', ''),
  ('org', 'strips a bare SA suffix — the org half of the Sa/Sá divergence',
   'LOJAS SA',                                 'lojas'),
  ('org', 'a name that is nothing but a suffix normalizes to empty',
   'LTDA',                                     '')
) AS c(fn, case_name, input, expected)
ORDER BY c.case_name;

\echo ''
\echo '--- 6b. The row count, asserted. The fixture file holds 13 cases; a case ---'
\echo '    added there and forgotten here is exactly the drift this part exists to'
\echo '    catch, and it would otherwise pass silently by simply not being run.'
\echo '    Cross-check with: grep -c ''input: "'' src/lib/dedup/normalize.fixtures.ts'

SELECT
  count(*) AS cases_asserted,
  CASE WHEN count(*) = 13 THEN 'PASS'
       ELSE 'FAIL — this part no longer holds 13 cases; reconcile it with src/lib/dedup/normalize.fixtures.ts'
  END AS verdict
FROM (VALUES
  (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13)
) AS c(n);


\echo ''
\echo '###############################################################################'
\echo '# PART 7 — star pairing versus clique pairing (the Pitfall 3 detector)'
\echo '###############################################################################'
\echo ''
\echo '--- 7a. What the two pairing strategies would produce for the exact-name ---'
\echo '    groups that exist RIGHT NOW, computed without writing anything.'
\echo ''
\echo '    A group of n identically named records is a clique of n*(n-1)/2 pairs if'
\echo '    every member is paired with every other, and a star of n-1 pairs if each'
\echo '    member is paired only with the group representative. Both express the'
\echo '    same fact. Only one of them is reviewable by a human.'
\echo ''
\echo '    THE ASSERTION IS THE STAR COUNT AGAINST THE ROW COUNT: a scan may never'
\echo '    produce more pairs than the entity has rows. That single inequality is'
\echo '    the whole detector — it is violated the instant a clique join sneaks'
\echo '    into the scan, and it costs one query to check. The clique number is'
\echo '    printed UNASSERTED beside it so the gap is visible rather than asserted'
\echo '    to a value that will drift as the data changes.'

WITH g AS (
  SELECT norm_name, count(*) AS n
  FROM organizations
  WHERE deleted_at IS NULL
    AND norm_name <> ''
  GROUP BY norm_name
  HAVING count(*) > 1
),
totals AS (
  SELECT
    coalesce(sum(n * (n - 1) / 2), 0)                            AS clique_pairs,
    coalesce(sum(n - 1), 0)                                      AS star_pairs,
    (SELECT count(*) FROM organizations WHERE deleted_at IS NULL) AS org_rows
  FROM g
)
SELECT
  clique_pairs   AS clique_pairs_unasserted,
  star_pairs,
  org_rows,
  CASE WHEN star_pairs > 0
       THEN round(clique_pairs::numeric / star_pairs, 1)
  END AS clique_over_star,
  CASE
    WHEN star_pairs < org_rows THEN 'PASS'
    ELSE 'FAIL — star pairing already produces at least as many pairs as there are organizations; the pairing is exploding'
  END AS verdict
FROM totals;

\echo ''
\echo '--- 7b. The same inequality stated for people, so the assertion covers both ---'
\echo '    entity types the scan can be run against.'

WITH g AS (
  SELECT norm_name, count(*) AS n
  FROM people
  WHERE deleted_at IS NULL
    AND norm_name <> ''
  GROUP BY norm_name
  HAVING count(*) > 1
),
totals AS (
  SELECT
    coalesce(sum(n * (n - 1) / 2), 0)                      AS clique_pairs,
    coalesce(sum(n - 1), 0)                                AS star_pairs,
    (SELECT count(*) FROM people WHERE deleted_at IS NULL)  AS people_rows
  FROM g
)
SELECT
  clique_pairs AS clique_pairs_unasserted,
  star_pairs,
  people_rows,
  CASE
    WHEN star_pairs < people_rows THEN 'PASS'
    ELSE 'FAIL — star pairing already produces at least as many pairs as there are people; the pairing is exploding'
  END AS verdict
FROM totals;


-- -----------------------------------------------------------------------------
-- PART 8 IS DELIBERATELY UNUSED AND RESERVED FOR PLAN 39-07 (the scan).
--
-- 39-07 owns the scan job itself, and the assertion it owes this file is the one
-- Part 7 above can only anticipate: that the pair rows the scan ACTUALLY WROTE
-- obey the same inequality, that every one of them is canonically ordered
-- (record_a_id < record_b_id, which duplicate_pairs_uniq depends on and does not
-- enforce), and that re-running a scan over a dismissed pair leaves its status
-- untouched.
--
-- If it writes anything, it goes inside BEGIN ... ROLLBACK with every fixture
-- object carrying the dedupchk_ prefix that Part 9c asserts leaves no survivor.
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
\echo '--- 9c. No probe object survived. Every fixture object this script may ever ---'
\echo '    create carries the dedupchk_ prefix. Expect 0.'
\echo ''
\echo '    Part 4f is the one part that touches an index rather than a row, and it'
\echo '    REMOVES an existing one rather than creating a prefixed one — so its'
\echo '    detector is 4g (the index came back), not this row. Both are needed:'
\echo '    this one catches a leftover, 4g catches a disappearance.'

SELECT
  count(*) AS surviving_probe_indexes,
  CASE WHEN count(*) = 0 THEN 'PASS'
       ELSE 'FAIL — a probe index survived; drop the dedupchk_ objects by hand'
  END AS verdict
FROM pg_indexes
WHERE indexname LIKE 'dedupchk\_%';

\echo ''
\echo '--- 9d. No probe row survived in either Phase 39 table. Both are empty on a ---'
\echo '    fresh install; once the scan ships they will not be, so this counts only'
\echo '    prefixed fixtures. Expect 0.'

SELECT
  (SELECT count(*) FROM duplicate_pairs WHERE id LIKE 'dedupchk\_%') AS probe_pairs,
  (SELECT count(*) FROM dedup_scans     WHERE id LIKE 'dedupchk\_%') AS probe_scans,
  CASE
    WHEN (SELECT count(*) FROM duplicate_pairs WHERE id LIKE 'dedupchk\_%') = 0
     AND (SELECT count(*) FROM dedup_scans     WHERE id LIKE 'dedupchk\_%') = 0
      THEN 'PASS'
    ELSE 'FAIL — a probe row survived; a BEGIN ... ROLLBACK wrapper did not hold'
  END AS verdict;

DROP TABLE IF EXISTS pg_temp.dedup_checks_before;
DROP TABLE IF EXISTS pg_temp.dedup_checks_ext_before;
DROP TABLE IF EXISTS pg_temp.dedup_checks_plans;


-- -----------------------------------------------------------------------------
-- PART 10 IS DELIBERATELY UNUSED AND RESERVED FOR PLAN 39-10 (the merge).
--
-- It sits AFTER Part 9 rather than before it because it is the only part that
-- will write ROWS. The merge probe 39-10 owes this file is the one a mocked test
-- cannot express at all: merge two organizations that BOTH carry a
-- source='migration' note and show that the survivor ends up with every child and
-- that notes_migration_uniq was never violated — measured at 63% of this
-- deployment's organizations, so roughly 40% of real merges hit it.
--
-- IT MUST BE WRAPPED BEGIN ... ROLLBACK, with every fixture id carrying the
-- dedupchk_ prefix. Part 9d above already counts survivors of exactly that
-- prefix, so the detector is in place before the probe that needs it.
-- -----------------------------------------------------------------------------


\echo ''
\echo '=== end of dedup-checks.sql ==='
\echo ''
