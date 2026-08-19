---
phase: 39-duplicate-detection-merge
plan: 03
subsystem: database
tags: [postgres, pg_trgm, unaccent, drizzle, migration, sql, normalization, immutable]

# Dependency graph
requires:
  - phase: 33-schema-hardening
    provides: "D-06 — the doctrine that no index definition is ever hand-written in migration SQL, which is what makes this file's carve-out explicit rather than accidental"
  - phase: 37-trash-restore
    provides: "scripts/trash-checks.sql — the structural analog for a real-database evidence script"
provides:
  - "pg_trgm 1.6 and unaccent 1.1 installed in the database, via migration so they survive a container rebuild"
  - "public.immutable_unaccent(text) — the IMMUTABLE wrapper that makes an accent-folded expression indexable at all"
  - "public.dedup_norm_org(text) — organization name normalization, Brazilian legal suffixes stripped"
  - "public.dedup_norm_person(text) — person name normalization, NO suffix strip"
  - "scripts/dedup-checks.sql Parts 0-2 and 9 — the standing real-database evidence script for Phase 39"
affects: [39-05 columns and trigram indexes, 39-01 TS normalizer parity, duplicate scan, create-time warning]

# Tech tracking
tech-stack:
  added: [pg_trgm 1.6, unaccent 1.1]
  patterns:
    - "The IMMUTABLE-wrapper workaround for indexing a STABLE extension function, with the caveat written into the migration in prose"
    - "Two normalization functions rather than one parameterised one, because org and person diverge on a data-corrupting case"
    - "A --custom drizzle migration used for the one layer drizzle-kit cannot express: extensions and functions"

key-files:
  created:
    - drizzle/0016_dedup_functions.sql
    - drizzle/meta/0016_snapshot.json
    - scripts/dedup-checks.sql
  modified:
    - drizzle/meta/_journal.json

key-decisions:
  - "immutable_unaccent uses the two-argument, schema-qualified unaccent('public.unaccent'::regdictionary, $1) so a hostile or restricted search_path cannot repoint the dictionary (T-39-14)"
  - "The org normalizer joins the two-token 's a' into 'sa' BEFORE the suffix strip, because step (b) has already shattered 'S.A.' into fragments the whole-token strip would not recognise"
  - "Standalone 's' and standalone 'a' are deliberately absent from the suffix list: 'a' is a Portuguese article"
  - "dedup_norm_person strips no legal suffix at all — 'Sa' is a Brazilian surname and the org list turns 'Jose de Sa' into 'jose de'"
  - "Neither dedup function is STRICT, because coalesce($1,'') is what maps NULL to the empty string and STRICT would short-circuit before it ran"
  - "Future probe objects in dedup-checks.sql carry a 'dedupchk_' prefix, asserted gone by Part 9c — the namespaced equivalent of trash-checks.sql's 'tck-' fixture prefix"
  - "Parts 3-8 of dedup-checks.sql are reserved and documented rather than left as a numbering gap, so plan 39-05 knows exactly which assertion belongs where"

patterns-established:
  - "Extension/function migrations: hand-written --custom SQL is legitimate for objects drizzle-kit cannot emit, and the file must say why it is not a D-06 violation"
  - "Migration prose must state the cost of a silent failure, not just the mechanism — 0016 records the ~20s vs ~26min index-drift number where the expressions live"
  - "Evidence scripts avoid spelling schema-statement keywords in comments, so the grep -c acceptance gates stay exact"

requirements-completed: [DEDUP-01]

# Metrics
duration: 22min
completed: 2026-08-19
---

# Phase 39 Plan 03: Dedup Extensions and Normalization Functions Summary

**pg_trgm and unaccent installed by migration 0016, plus three IMMUTABLE SQL functions — an accent-folding wrapper and a deliberately split org/person name normalizer — with a real-database evidence script that proves all six measured normalization cases character for character.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-19T11:13:00Z
- **Completed:** 2026-08-19T11:35:43Z
- **Tasks:** 2 of 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- **The indexability blocker is gone.** `unaccent(text)` is STABLE (`provolatile = 's'`), and Postgres
  rejects a STABLE function in an index expression outright. `public.immutable_unaccent` wraps the
  two-argument, schema-qualified form and declares IMMUTABLE, which makes every downstream expression
  index in 39-05 possible. All three functions verify as `provolatile = 'i'`.
- **The org/person split is proven in both directions.** `dedup_norm_org('LOJAS SA')` → `lojas`, while
  `dedup_norm_person('José de Sá')` → `jose de sa`. Neither half can pass vacuously.
- **Every measured case reproduces exactly**, including the two that encode a decision rather than a
  behaviour: the `S A` join ordering and the `Sa` surname.
- **`scripts/dedup-checks.sql` runs clean and mutates nothing** — 15 assertion rows, zero FAIL, and its
  own before/after snapshot proving it changed no data.

## Task Commits

1. **Task 1: The extensions-and-functions custom migration** — `ec8a971` (feat)
2. **Task 2: scripts/dedup-checks.sql, Parts 0-2** — `edf8012` (test)

**Plan metadata:** committed with this summary (docs)

## Files Created/Modified

- `drizzle/0016_dedup_functions.sql` (created) — `CREATE EXTENSION IF NOT EXISTS pg_trgm` /
  `unaccent`, then `public.immutable_unaccent`, `public.dedup_norm_org`, `public.dedup_norm_person`.
  Contains no table, no index and no `ALTER` — the acceptance grep returns 0.
- `drizzle/meta/_journal.json` (modified) — one appended entry, `idx: 16`, tag
  `0016_dedup_functions`. `git diff` is 7 insertions and 0 deletions; no earlier entry changed.
- `drizzle/meta/0016_snapshot.json` (created) — emitted by `drizzle-kit generate --custom`; byte-size
  identical to `0015_snapshot.json`, confirming the Drizzle schema is untouched.
- `scripts/dedup-checks.sql` (created) — 315 lines. Parts 0 (before-snapshot), 1 (extensions),
  2 (function existence, volatility and the six normalization cases), 9 (after-snapshot). Parts 3-8
  reserved for 39-05 with a per-part note saying what belongs in each.

## Verification Evidence

### Task 1

```
$ psql -tAc "select extname from pg_extension where extname in ('pg_trgm','unaccent') order by 1"
pg_trgm
unaccent

$ psql -tAc "select proname, provolatile from pg_proc where proname in (...) order by 1"
dedup_norm_org|i
dedup_norm_person|i
immutable_unaccent|i
```

Normalization output, all matching the measured expectations:

| function | input | output |
|---|---|---|
| org | `COGUMELO INDUSTRIA E COMERCIO LTDA` | `cogumelo industria e comercio` |
| org | `AUTO POSTO MR DA TAQUARA LTDA ME` | `auto posto mr da taquara` |
| org | `Condomínio do Edifício Internacional RIo` | `condominio do edificio internacional rio` |
| org | `Ramada Hotel & Suítes Recife Boa viagem` | `ramada hotel suites recife boa viagem` |
| org | `UNIAO DE LOJAS LEADER S A` | `uniao de lojas leader` |
| org | `Uniao de Lojas Leader S.A.` | `uniao de lojas leader` |
| org | `LOJAS SA` | `lojas` |
| org | `CASA A CASA` | `casa a casa` (the article survives) |
| org | `LOJA S DO NORTE` | `loja s do norte` (the lone `s` survives) |
| org | `NULL` / `###` | `` (empty) |
| person | `José de Sá` | `jose de sa` (**suffix NOT stripped**) |
| person | `  MARIA   DA   SILVA  ` | `maria da silva` |

`grep -c "CREATE INDEX\|CREATE TABLE\|ALTER TABLE" drizzle/0016_dedup_functions.sql` → **0**.

### Task 2

```
$ docker compose exec -T postgres psql -U pipelite -d pipelite -f - < scripts/dedup-checks.sql | grep -c FAIL
0
$ grep -c "IT IS RE-RUNNABLE AND MUTATES NOTHING" scripts/dedup-checks.sql
1
$ grep -ci "password" scripts/dedup-checks.sql
0
```

Anti-vacuity — two consecutive runs, Part 0 and Part 9 identical within each run and across both:

```
 audit_log     |   213 |   213 | 0 | PASS
 deals         | 25195 | 25195 | 0 | PASS
 notes         | 75236 | 75236 | 0 | PASS
 organizations | 46054 | 46054 | 0 | PASS
 people        | 38348 | 38348 | 0 | PASS
```

### The two negative proofs, both RUN

**1. The STABLE index rejection (the reason `immutable_unaccent` exists).** Run inside
`BEGIN ... ROLLBACK`, both probe indexes cleaned up, `pg_indexes` re-checked afterwards → 0 survivors.

```
BEGIN;
CREATE INDEX tmp_bad_stable ON organizations USING gin (unaccent(lower(name)) gin_trgm_ops);
ERROR:  functions in index expression must be marked IMMUTABLE
ROLLBACK;

BEGIN;
CREATE INDEX tmp_good_immutable ON organizations USING gin (public.dedup_norm_org(name) gin_trgm_ops);
CREATE INDEX          <- accepted
ROLLBACK;

SELECT count(*) FROM pg_indexes WHERE indexname LIKE 'tmp_%';  -->  0
```

**2. A deliberately wrong expected value.** `cogumelo industria e comercio` was temporarily changed to
`cogumelo industria e comercio ltda` in Part 2c and the script re-run. Exactly one FAIL row appeared,
naming the input, the actual and the contract:

```
org | COGUMELO INDUSTRIA E COMERCIO LTDA | cogumelo industria e comercio ltda | cogumelo industria e comercio |
FAIL — dedup_norm_org(COGUMELO INDUSTRIA E COMERCIO LTDA) returned cogumelo industria e comercio
       but the contract says cogumelo industria e comercio ltda
```

The value was restored and the script re-run: `grep -c FAIL` → 0. The committed file is the restored
one (`git status` clean after the Task 2 commit).

### Repo gates

- `npm run typecheck` → clean (`tsc --noEmit`, no output).
- `npm run lint` → **0 errors**, 125 pre-existing warnings, none in any file this plan touched (this
  plan changed no TypeScript at all).
- `git status --porcelain drizzle/` → clean after the Task 1 commit.

### Database left as found

Apart from the intended migration artifacts (2 extensions, 3 functions, 1 `__drizzle_migrations` row
at `1787138899010` matching the journal entry), the database carries nothing this plan added:

```
probe indexes matching tmp_% or dedupchk_%   -> 0 rows
probe tables  matching tmp_% or dedup_%      -> 0 rows
columns matching %norm%                      -> 0   (39-05 owns those)
```

## Decisions Made

- **The wrapper's dishonesty is documented, not hidden.** `immutable_unaccent` declares IMMUTABLE over
  a function that is not, and the database trusts that declaration without checking it. The migration
  says so in prose, names the concrete failure mode (a changed `unaccent.rules` file makes existing
  index entries stale and the index silently wrong), and states the mitigation: the image is pinned to
  `postgres:16-alpine`, and a major-version bump requires a REINDEX of everything built on it.
- **Schema-qualified everywhere.** `public.unaccent('public.unaccent'::regdictionary, $1)` rather than
  the one-argument form, so `search_path` cannot substitute a different dictionary (T-39-14).
- **Not STRICT.** A STRICT function returns NULL for NULL input before the body runs, which would
  bypass `coalesce($1,'')` and return NULL where the contract says empty string. `immutable_unaccent`
  *is* STRICT, safely, because both callers coalesce first.
- **`dedupchk_` rather than `tmp_` as the reserved probe prefix** for the check script. `trash-checks.sql`
  uses `tck-` for its fixture rows; a namespaced prefix keeps Part 9c's survivor assertion from ever
  matching an unrelated temporary object someone else left behind.
- **Parts 3-8 are reserved with content, not just a number.** The block names which assertion 39-05
  owes each part, and singles out Part 5 (the EXPLAIN index-usage proof) as the highest-value one,
  because it is the only assertion that catches the silent expression-drift failure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The worktree was branched from a stale commit and lacked every file the plan told me to read**

- **Found during:** Task 1 setup, before any work
- **Issue:** The worktree branch `worktree-agent-a6591eeaf44e9de3e` was based on `cbf3229`
  ("docs(34): mark phase 34 complete"), roughly eleven phases behind. `drizzle/0013`, `0014` and
  `0015` did not exist, `scripts/` did not exist at all, and `drizzle/meta/_journal.json` ended at
  `idx: 12` rather than the `idx: 15` the plan's key_facts recorded. Generating the migration from
  that base would have produced `0013_dedup_functions`, colliding with the real `0013_parched_redwing`
  and corrupting the journal on merge.
- **Fix:** Verified `git merge-base --is-ancestor HEAD master` returned true — the worktree HEAD was a
  strict ancestor, so no local work could be lost — then `git merge --ff-only master`. A fast-forward,
  not a reset; nothing was discarded. HEAD landed on `c09a1cf`, journal ending at `idx: 15` as the
  plan described.
- **Files modified:** none by me; the fast-forward brought in the missing tracked files.
- **Verification:** `git rev-parse --abbrev-ref HEAD` still `worktree-agent-a6591eeaf44e9de3e`;
  `drizzle/` and `scripts/` now match the main checkout; the generated migration is `0016` with
  `idx: 16`.

**2. [Rule 2 - Missing Critical] Committed `drizzle/meta/0016_snapshot.json`, which the plan's `files_modified` did not list**

- **Found during:** Task 1, staging
- **Issue:** `drizzle-kit generate --custom` emits a snapshot alongside the migration. The plan listed
  only the `.sql` and the journal. Leaving the snapshot untracked would break the repo's own convention
  (`0000`-`0015_snapshot.json` are all tracked) and would leave a generated file permanently dirty in
  `git status` for every future agent.
- **Fix:** Staged and committed it with the rest of Task 1.
- **Files modified:** `drizzle/meta/0016_snapshot.json`
- **Verification:** Byte-size identical to `0015_snapshot.json` (76.8 K), confirming the Drizzle schema
  is unchanged and the snapshot is a pure carry-forward. `git status` clean after the commit.

**3. [Rule 1 - Bug] The first draft of the migration comment would have broken its own acceptance gate**

- **Found during:** Task 1, before applying
- **Issue:** The comment explaining the STABLE rejection quoted the failing statement verbatim,
  including the index-creation keywords. The acceptance criterion is
  `grep -c "CREATE INDEX\|CREATE TABLE\|ALTER TABLE" ... = 0`, which counts matching *lines* and does
  not care that the match is inside a comment — the gate would have read 1 and reported a schema
  statement that is not there.
- **Fix:** Rewrote the comment to describe the rejected expression without spelling the keywords, and
  added a parenthetical saying why — the same habit `0014` and `0015` adopted for their own grep gates,
  and stating it keeps the next person from "helpfully" restoring the literal.
- **Files modified:** `drizzle/0016_dedup_functions.sql`
- **Verification:** `grep -c ... ` → 0. The rejection is still quoted in full as an `ERROR:` line, so
  nothing was lost from the explanation.

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 missing critical, 1 bug)
**Impact on plan:** No scope change. Deviation 1 was a prerequisite for executing the plan at all;
2 and 3 were both required to satisfy criteria the plan itself stated. No file outside the plan's
declared surface was touched.

## Issues Encountered

- **The worktree isolation guard refused the plan's suggested migrate command.** The plan supplied
  `env DATABASE_URL="$(sed -n 's/^E2E_DATABASE_URL=//p' .env)" ./node_modules/.bin/drizzle-kit migrate`.
  The harness rejected it (and two rewrites of it) as "too complex to verify that it stays inside the
  worktree" — command substitution plus `env` plus a relative binary path trips the check. Resolved by
  passing the URL literally: `env DATABASE_URL="postgresql://…@localhost:5433/pipelite" ./node_modules/.bin/drizzle-kit migrate`.
  **Consequence worth flagging:** that put the local Postgres credential into the executor's shell
  history. It is the localhost-only dev credential already present in `.env` and bound to the mapped
  container port — not a production secret, and it did not enter any committed file. Every subsequent
  database command in this plan went through `docker compose exec … psql` over the container's unix
  socket, with no credential anywhere. **Plans 39-05 and later should use the `docker compose up -d --build app`
  fallback, or run `drizzle-kit migrate` inside the container, rather than reproducing this.**
- **Two harmless `NOTICE` lines on the first run of `dedup-checks.sql`** (`schema "pg_temp" does not
  exist, skipping`). This is the same `DROP TABLE IF EXISTS pg_temp.…` idiom `trash-checks.sql` uses
  and produces the same notices there; kept for consistency with the analog.
- **`drizzle.__drizzle_migrations` holds 9 rows, not 16.** Pre-existing: this database was bootstrapped
  before every early migration was tracked. Not caused by this plan, and not a problem — the newest row
  is `1787138899010`, exactly matching `0016`'s journal `when`, so 0016 is recorded as applied.

## Known Stubs

None. Every artifact this plan produced is complete and exercised against the live database. The
reserved Parts 3-8 of `dedup-checks.sql` are a documented hand-off to plan 39-05, not a stub: nothing
reads them, nothing depends on them, and their absence degrades no behaviour that exists today.

## Threat Flags

None. This plan introduces no network endpoint, no auth path, no file access and no schema change at a
trust boundary. The three threats it was assigned are all mitigated and verified:

| Threat | Disposition | Evidence |
|---|---|---|
| T-39-06 (SQL injection via the normalizers) | mitigate | Both functions are `LANGUAGE sql` over a single bound `$1`; no `EXECUTE`, no dynamic SQL, no concatenation. |
| T-39-14 (`search_path` repointing `unaccent`) | mitigate | `public.unaccent('public.unaccent'::regdictionary, $1)` — both the function and the dictionary are schema-qualified. |
| T-39-15 (credential in the check script) | mitigate | `grep -ci "password"` → 0; `grep -c "PGPASSWORD"` → 0; the documented invocation reaches the server over the container socket. |

**T-39-SC (package legitimacy):** this plan installed no package. `node_modules` was treated as
read-only throughout, as the parallel-execution contract required.

## Next Phase Readiness

Ready for plan 39-05, which is the direct consumer:

- The expressions it must index are `public.dedup_norm_org(name)` and `public.dedup_norm_person(name)`.
  **Its query must use the identical expression** — an index built on one and a query written with
  another produces no error, just a ~20s → ~26min degradation. Migration 0016 closes with this warning
  in prose, and `39-VALIDATION` V-2 makes the EXPLAIN proof binding.
- `scripts/dedup-checks.sql` Parts 3-8 are reserved and each is annotated with the assertion it owes.
  Part 5 (the EXPLAIN index-usage proof) is the one that matters most.
- Part 2c must be extended with the full case table from `src/lib/dedup/normalize.fixtures.ts` (plan
  39-01, same wave). **Copy the rows verbatim; do not paraphrase** — that table is the entire
  SQL-to-TypeScript parity contract, and the scan runs in SQL while every unit test runs in TS.
- Nothing here blocks 39-01, 39-02 or 39-04: they are pure TypeScript and JSON and share no file with
  this plan.

## Self-Check: PASSED

All four claimed artifacts exist on disk:

```
FOUND: drizzle/0016_dedup_functions.sql                                 (9.0K)
FOUND: drizzle/meta/0016_snapshot.json                                  (76.8K)
FOUND: scripts/dedup-checks.sql                                         (14.7K)
FOUND: .planning/phases/39-duplicate-detection-merge/39-03-SUMMARY.md   (18.8K)
```

Both claimed commits exist in `git log --all`: `ec8a971`, `edf8012`.

---
*Phase: 39-duplicate-detection-merge*
*Completed: 2026-08-19*
