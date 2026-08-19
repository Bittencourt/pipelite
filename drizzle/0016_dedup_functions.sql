-- ============================================================================
-- EXTENSIONS-AND-FUNCTIONS MIGRATION. Produced with `drizzle-kit generate
-- --custom` because `generate` diffs the Drizzle schema and can emit neither a
-- CREATE EXTENSION nor a CREATE FUNCTION — there is no way to declare either one
-- in `src/db/schema/`. This file is the first of its kind in this repository:
-- across 0000-0015 there is not one extension and not one function.
--
-- WHY HAND-WRITING THIS FILE DOES NOT VIOLATE PHASE 33 D-06. D-06 (stated at
-- length in 0014 and 0015) forbids hand-written INDEX schema statements in
-- migration SQL, because `drizzle-kit generate` owns the schema and silently
-- dropped a hand-written index in this repo once (0009 to 0010). This file
-- declares no table, alters no table and builds no index — Phase 39's columns,
-- indexes and tables all arrive through a normal `generate` in plan 39-05. What
-- is here is the extension and function layer, which `generate` does not manage
-- at all, never emits, and therefore cannot clobber. Do not generalise the
-- carve-out: no index definition is ever hand-written here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS
--
-- `pg_trgm` (1.6) supplies `similarity()` and the `gin_trgm_ops` operator class
-- that Phase 39's fuzzy name matching is built on. `unaccent` (1.1) supplies the
-- accent-folding dictionary. Both are TRUSTED on PostgreSQL 16, and the
-- `pipelite` role is additionally a superuser on this deployment, so neither
-- statement needs an operator present: the migration runs unattended when the
-- container applies migrations at boot.
--
-- IF NOT EXISTS makes both statements idempotent against a replayed migration.
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. public.immutable_unaccent(text)
--
-- READ THIS BEFORE CHANGING ANYTHING BELOW.
--
-- `unaccent(text)` as shipped by the extension is STABLE, not IMMUTABLE, because
-- the one-argument form resolves the dictionary through the current
-- `search_path` at call time. PostgreSQL refuses to index a STABLE function —
-- an index-building statement over `unaccent(lower(name)) gin_trgm_ops` is
-- rejected outright, and loudly:
--
--     ERROR:  functions in index expression must be marked IMMUTABLE
--
-- (This comment deliberately does not spell the index-creation keywords, so the
-- `grep -c` gate that counts real schema statements in this file stays exact —
-- the same habit 0014 and 0015 adopted for the same reason.)
--
-- This wrapper declares IMMUTABLE anyway. THE DATABASE TRUSTS THAT DECLARATION
-- AND DOES NOT VERIFY IT. The claim is true only for as long as the unaccent
-- dictionary file (`$SHAREDIR/tsearch_data/unaccent.rules`) does not change. If
-- a future PostgreSQL image ships a different rules file, index entries built
-- with the old one become stale, and the index is then SILENTLY WRONG — lookups
-- miss rows with no error anywhere. This is the documented and accepted
-- workaround for this use case because the dictionary is fixed for a given
-- PostgreSQL image, and this deployment pins `postgres:16-alpine`. If the image
-- major version is ever bumped, REINDEX every index built on this function.
--
-- The two-argument `unaccent(regdictionary, text)` form is genuinely immutable:
-- the dictionary is named explicitly rather than resolved through `search_path`.
-- Both the function and the dictionary are schema-qualified to `public`, so a
-- restricted or hostile `search_path` cannot repoint either one at a substitute
-- (T-39-14).
--
-- STRICT is safe here: every caller below wraps its argument in `coalesce`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1)
$$;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. public.dedup_norm_org(text)
--
-- Organization name normalization. Mirrors `normalizeOrgName` in
-- `src/lib/dedup/normalize.ts` character for character; the shared case table in
-- `src/lib/dedup/normalize.fixtures.ts` is the contract between the two, and
-- `scripts/dedup-checks.sql` Part 2 is where the SQL half is asserted.
--
-- The pipeline, in order, and the order is load-bearing:
--
--   a. `lower(immutable_unaccent(coalesce($1,'')))` — fold case and accents.
--      `Condominio`/`Condomínio` and `Suites`/`Suítes` must collapse to one
--      string; 36.4% of this deployment's 46,054 organizations carry a legal
--      suffix and a large fraction carry accents.
--   b. `[^a-z0-9]+` -> a single space — punctuation becomes token separation, so
--      `S.A.`, `S/A` and `S A` all reach step (c) as the two tokens `s a`.
--   c. THE TWO-TOKEN `s a` JOIN, AND IT RUNS BEFORE THE SUFFIX STRIP ON PURPOSE.
--      Step (b) has just shattered `S.A.` into `s` and `a`. The suffix pass in
--      step (d) strips WHOLE TOKENS, so it would not recognise either fragment.
--      Joining them back into the single token `sa` first is what lets `S.A.`,
--      `S/A` and a bare trailing `S A` all normalize identically. Reversing (c)
--      and (d) would leave `uniao de lojas leader s a` with its suffix intact.
--   d. Whole-token strip of the Brazilian legal suffixes. STANDALONE `s` AND
--      STANDALONE `a` ARE DELIBERATELY NOT IN THIS LIST AND MUST NEVER BE ADDED:
--      `a` is a Portuguese article (`CASA A CASA` must survive as three tokens)
--      and a lone `s` is a real name fragment (`LOJA S DO NORTE`). 39-RESEARCH
--      probed a version that stripped them and recorded it as wrong.
--   e. collapse runs of whitespace, then `btrim`.
--
-- Not STRICT: `coalesce` in step (a) is what turns NULL into the empty string,
-- and STRICT would short-circuit before it ever ran.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dedup_norm_org(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(public.immutable_unaccent(coalesce($1, ''))),
            '[^a-z0-9]+', ' ', 'g'
          ),
          '\ms a\M', 'sa', 'g'
        ),
        '\m(ltda|me|epp|eireli|sa|cia|mei)\M', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  )
$$;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. public.dedup_norm_person(text)
--
-- Person name normalization. The SAME pipeline as `dedup_norm_org` MINUS steps
-- (c) and (d) — no `s a` join, no legal-suffix strip — and that omission is the
-- entire reason two functions exist instead of one parameterised one.
--
-- `Sá` is a common Brazilian surname. Run through the organization suffix list,
-- `Jose de Sa` normalizes to `jose de`, which is not a name, matches other
-- truncated names, and corrupts every downstream comparison for everyone
-- carrying it. `Sa`, `Cia` and `Me` are all plausible person-name fragments; a
-- legal suffix is a property of a company name and of nothing else.
--
-- Mirrors `normalizePersonName` in `src/lib/dedup/normalize.ts`. Not STRICT, for
-- the same reason as above.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dedup_norm_person(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        lower(public.immutable_unaccent(coalesce($1, ''))),
        '[^a-z0-9]+', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  )
$$;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 5. THE BLOCKING RULE FOR PLAN 39-05, RECORDED HERE BECAUSE THIS IS WHERE THE
--    EXPRESSIONS LIVE.
--
-- An index built on one expression and a query written with a different one do
-- not produce an error. PostgreSQL simply declines to use the index and falls
-- back to a sequential scan. On this deployment's 46,054 organizations that is
-- the difference between a scan of roughly 20 seconds and one of roughly 26
-- minutes, with nothing in the logs and nothing in the result set to say so.
-- It is the classic failure mode for trigram matching and it is invisible to
-- every kind of test except one.
--
-- Therefore: every index Phase 39 builds on these functions MUST have its use
-- proven by EXPLAIN against the exact query the application issues (39-VALIDATION
-- V-2), and that proof lives in `scripts/dedup-checks.sql`. Do not assume; run
-- the EXPLAIN and read for a Bitmap Index Scan.
-- ----------------------------------------------------------------------------
