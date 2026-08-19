---
phase: 39-duplicate-detection-merge
plan: 05
subsystem: database
tags: [postgres, pg_trgm, drizzle, migration, generated-columns, gin-index, explain, sql]

# Dependency graph
requires:
  - phase: 39-duplicate-detection-merge
    provides: "plan 39-03 — pg_trgm/unaccent and the three IMMUTABLE normalization functions the generated columns are built on, plus scripts/dedup-checks.sql Parts 0-2 and 9"
  - phase: 33-schema-hardening
    provides: "D-06 — indexes are declared in the Drizzle schema and generated, never hand-written into migration SQL"
  - phase: 35-notes-record-timeline
    provides: "notes_migration_uniq, the permanent partial-unique invariant this migration had to leave intact"
provides:
  - "organizations.norm_name — a STORED generated column over public.dedup_norm_org(name)"
  - "people.norm_name / norm_email / norm_phone — three STORED generated columns"
  - "org_norm_trgm_idx and people_norm_trgm_idx — partial GIN indexes with gin_trgm_ops"
  - "org_norm_btree_idx, people_norm_btree_idx, people_norm_email_idx — partial btree indexes"
  - "duplicate_pairs — the persisted pair table with duplicate_pairs_uniq on (entity_type, record_a_id, record_b_id)"
  - "dedup_scans — the background-job row, import_sessions plus entity_type and a per-type active index"
  - "scripts/dedup-checks.sql Parts 3-7, including the V-2 EXPLAIN proof and its RUN negative proof"
  - "the measured LIMIT trap and its mitigation, recorded in Part 4e for plan 39-06"
affects: [39-06 create-time warning, 39-07 scan job, 39-08 review UI, 39-09 merge mutation, 39-10 merge probe]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "STORED generated column instead of an expression index, so a query references the indexed thing BY NAME and cannot drift from it"
    - "EXPLAIN captured into a temp table by a plpgsql loop, so a query plan becomes an assertable value rather than something a human reads"
    - "The negative proof as a shipped part of the evidence script: remove the index inside a transaction, show the plan collapse, roll back, then assert the index came back"

key-files:
  created:
    - src/db/schema/duplicate-pairs.ts
    - src/db/schema/dedup-scans.ts
    - drizzle/0017_dedup_schema.sql
    - drizzle/meta/0017_snapshot.json
  modified:
    - src/db/schema/organizations.ts
    - src/db/schema/people.ts
    - src/db/schema/index.ts
    - drizzle/meta/_journal.json
    - scripts/dedup-checks.sql

key-decisions:
  - "drizzle-kit generate emitted the generated-column DDL correctly on the first attempt; the documented plain-text() + --custom ALTER fallback was NOT taken and no migration file was hand-edited"
  - "A bare LIMIT 5 on a trigram query defeats the GIN index on this data — measured, not theorised. The shape to ship is ORDER BY similarity(...) DESC before the LIMIT; an OFFSET 0 fence does not work because PostgreSQL removes a constant zero offset"
  - "Part 4a runs ANALYZE inside the evidence script, because without statistics for columns migration 0017 just added the EXPLAIN proof measures the absence of statistics rather than the presence of an index"
  - "The negative proof lives in the script (Part 4f) rather than only in this summary, wrapped BEGIN ... ROLLBACK with SET LOCAL lock_timeout and followed by Part 4g asserting the index came back"
  - "Part 7 asserts the star count against the entity row count and prints the clique count UNASSERTED, because the inequality is stable while the clique number drifts with the data"
  - "39-05's part numbering supersedes 39-03's reservation block; the STABLE-vs-IMMUTABLE probe 39-03 had reserved as Part 6 was dropped because 39-03 already ran it, and Part 4f is a strictly stronger probe of the same kind"

patterns-established:
  - "A generated column is preferred to an expression index wherever a query would otherwise have to re-spell the expression: 32x fewer heap blocks on recheck, and drift becomes impossible rather than merely unlikely"
  - "Any assertion about a query plan ships with a demonstration that it can fail"
  - "A probe whose verdict is INFO rather than PASS/FAIL is legitimate when a future change in its favour would be good news, not a regression (Part 4d probe 6)"

requirements-completed: [DEDUP-01, DEDUP-03]

# Metrics
duration: 18min
completed: 2026-08-19
---

# Phase 39 Plan 05: Normalized Columns, Trigram Indexes and the Pair Tables Summary

**Four STORED generated columns and five partial indexes shipped through a normal `drizzle-kit generate`, with the trigram index's use proven by EXPLAIN and the proof itself proven falsifiable by removing the index and watching the plan collapse — which also turned up a measured trap: a bare `LIMIT 5` defeats the index entirely.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-19T11:48:00Z
- **Completed:** 2026-08-19T12:06:00Z
- **Tasks:** 3 of 3
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments

- **The matching layer's entire storage surface exists and is populated.** `norm_name` is non-empty
  on all 46,054 organizations and 38,343 of 38,348 people (the five blanks are rows whose first and
  last name are both empty after normalization). `norm_email` is populated on 28,735 people and
  `norm_phone` on 25,865.
- **V-2 is satisfied with evidence, not assertion.** Five probe plans are captured, printed and
  asserted; the trigram probes come back as `Bitmap Index Scan on org_norm_trgm_idx` /
  `people_norm_trgm_idx`. Part 4f then removes `org_norm_trgm_idx` inside a rolled-back transaction
  and shows the same query become `Seq Scan on organizations` — so Part 4d demonstrably can fail.
- **A real trap was found that the plan did not anticipate.** The query the plan told me to EXPLAIN
  (`... % ... LIMIT 5`) is answered with a **sequential scan**. This is not a defect in the index; it
  is the planner correctly optimising for the median case of a `LIMIT` with no `ORDER BY`. It matters
  because `CREATE_TIME_MATCH_LIMIT = 5` is exactly that shape, so plan 39-06 would have shipped a
  full 46,054-row scan on every organization create. Part 4e records the trap, the mitigation and the
  fence that does *not* work.
- **`drizzle-kit generate` needed no help and no hand-editing.** The emitted DDL carried the function
  reference, the `STORED` keyword, the `gin_trgm_ops` opclass and the partial `WHERE` clause intact.
  D-06 is untouched: every index in this plan went through `generate`.
- **`notes_migration_uniq` survived**, still UNIQUE and still partial on `source = 'migration'`.
- **`scripts/dedup-checks.sql` runs clean twice in a row** — 61 PASS, zero FAIL, Part 0 and Part 9
  identical within each run and across both.

## Task Commits

1. **Task 1: Schema — generated columns, indexes, and the two new tables** — `559a5e9` (feat)
2. **Task 2: Generate, inspect and apply migration 0017** — `6eb0135` (feat)
3. **Task 3: dedup-checks.sql Parts 3-8 and the EXPLAIN proof** — `dd0a60c` (test)

**Plan metadata:** committed with this summary (docs)

## Files Created/Modified

- `src/db/schema/organizations.ts` (modified) — `normName` plus `org_norm_trgm_idx` (GIN,
  `gin_trgm_ops`) and `org_norm_btree_idx`, both partial on `deleted_at is null`.
- `src/db/schema/people.ts` (modified) — `normName`, `normEmail`, `normPhone` plus
  `people_norm_trgm_idx`, `people_norm_btree_idx` and `people_norm_email_idx`, all partial.
- `src/db/schema/duplicate-pairs.ts` (created) — the pair table. Two rules the database cannot
  enforce are stated in the comments: canonical id ordering (which `duplicate_pairs_uniq` depends on)
  and the absence of a foreign key on either record id.
- `src/db/schema/dedup-scans.ts` (created) — `import_sessions` copied 1:1 plus `entity_type`, with
  `dedup_scans_active_idx` on `(entity_type, status)` for the per-type running-scan guard.
- `src/db/schema/index.ts` (modified) — two barrel exports.
- `drizzle/0017_dedup_schema.sql` (created) — 2 tables, 4 generated columns, 3 FKs, 10 indexes.
- `drizzle/meta/0017_snapshot.json` (created) — emitted by `generate`; tracked, matching the repo
  convention that every `00NN_snapshot.json` is committed.
- `drizzle/meta/_journal.json` (modified) — one appended entry, `idx: 17`; `git diff` is 7 insertions
  and 0 deletions, so no earlier entry changed.
- `scripts/dedup-checks.sql` (modified) — 315 → 952 lines. Parts 3-7 added, Parts 8 and 10 reserved,
  the header and Part 9's reservation note rewritten.

## Verification Evidence

### Task 2 — the emitted DDL, read rather than assumed

All three questions the plan posed, answered by quoting the file:

**1. Does it emit the generated column with the function reference and `STORED` intact?** Yes, on all
four columns. The fallback (plain `text()` + a hand-written `--custom` ALTER as 0018) was NOT taken.

```sql
ALTER TABLE "organizations" ADD COLUMN "norm_name" text GENERATED ALWAYS AS (public.dedup_norm_org(name)) STORED;
ALTER TABLE "people" ADD COLUMN "norm_name" text GENERATED ALWAYS AS (public.dedup_norm_person(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) STORED;
ALTER TABLE "people" ADD COLUMN "norm_email" text GENERATED ALWAYS AS (lower(btrim(coalesce(email, '')))) STORED;
ALTER TABLE "people" ADD COLUMN "norm_phone" text GENERATED ALWAYS AS (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) STORED;
```

**2. Does it emit the opclass and the partial `WHERE`?** Yes, both, on all five. No hand-edit was
needed and none was made.

```sql
CREATE INDEX "org_norm_trgm_idx" ON "organizations" USING gin ("norm_name" gin_trgm_ops) WHERE "organizations"."deleted_at" is null;
CREATE INDEX "org_norm_btree_idx" ON "organizations" USING btree ("norm_name") WHERE "organizations"."deleted_at" is null;
CREATE INDEX "people_norm_trgm_idx" ON "people" USING gin ("norm_name" gin_trgm_ops) WHERE "people"."deleted_at" is null;
CREATE INDEX "people_norm_btree_idx" ON "people" USING btree ("norm_name") WHERE "people"."deleted_at" is null;
CREATE INDEX "people_norm_email_idx" ON "people" USING btree ("norm_email") WHERE "people"."deleted_at" is null;
```

**3. Does it emit `CREATE EXTENSION`?** No. `grep -c "CREATE EXTENSION" drizzle/0017_dedup_schema.sql`
→ **0**, confirmed rather than assumed. Migration 0016 owns that layer.

### Task 2 — application and catalog state

`drizzle-kit migrate` wall clock: **5.58 s** total, against 46,054 organizations and 38,348 people.
That is the whole command including process start, connection and the `drizzle` bookkeeping schema,
so it is an upper bound on the research figure of "about 3 seconds" of DDL — the claim holds and the
number to quote for a deployment is **under 6 seconds for the entire migration**.

```
$ psql -tAc "select indexname from pg_indexes where indexname in (...) order by 1"
org_norm_btree_idx
org_norm_trgm_idx
people_norm_btree_idx
people_norm_email_idx
people_norm_trgm_idx          <- exactly five

$ psql -tAc "... where c.relname='org_norm_trgm_idx'"          -> gin
$ psql -tAc "select count(*) from organizations where norm_name is not null and norm_name <> ''"
46054                          <- > 45,000, so the generated expression really ran
$ psql -tAc "select count(*) from pg_indexes where indexname='notes_migration_uniq'"
1                              <- the permanent invariant survived
```

Index sizes, for whoever plans the deployment window:

| index | size |
|---|---|
| org_norm_trgm_idx | 3840 kB |
| org_norm_btree_idx | 1280 kB |
| people_norm_trgm_idx | 3096 kB |
| people_norm_btree_idx | 1344 kB |
| people_norm_email_idx | 1320 kB |

Anti-vacuity on the migration file: 4 × `GENERATED ALWAYS AS`, 2 × `USING gin`, 0 × `CREATE EXTENSION`.

### Task 3 — the V-2 EXPLAIN proof, and the negative proof, both RUN

**The positive plan** (Part 4c, probe 1):

```
Bitmap Heap Scan on organizations  (cost=206.22..1212.20 rows=414 width=67)
  Recheck Cond: ((norm_name % 'supermercado bom preco'::text) AND (deleted_at IS NULL))
  ->  Bitmap Index Scan on org_norm_trgm_idx  (cost=0.00..206.12 rows=414 width=0)
        Index Cond: (norm_name % 'supermercado bom preco'::text)
```

**The negative plan** (Part 4f — `DROP INDEX public.org_norm_trgm_idx` inside `BEGIN … ROLLBACK`,
re-EXPLAIN, roll back):

```
Seq Scan on organizations  (cost=0.00..2495.68 rows=414 width=67)
  Filter: ((deleted_at IS NULL) AND (norm_name % 'supermercado bom preco'::text))
```

Verdict row printed by the script:

```
 org_norm_trgm_idx | PASS — without org_norm_trgm_idx the planner falls back to a sequential scan, so 4d can fail
```

and Part 4g afterwards: `org_norm_trgm_idx_present = 1 | PASS`. **The assertion is falsifiable and it
is currently true.** The bitmap plan costs 1,212 against the sequential 2,496 on cost units alone;
the real gap is in heap blocks touched at scan scale, which is the 20 s vs 26 min number.

The other four probes, all PASS, all naming their index:

| probe | node chosen |
|---|---|
| org exact (certain tier / create-time check) | `Bitmap Index Scan on org_norm_btree_idx` |
| person fuzzy | `Bitmap Index Scan on people_norm_trgm_idx` |
| person name exact | `Index Scan using people_norm_btree_idx` |
| person e-mail exact | `Index Scan using people_norm_email_idx` |

### Task 3 — the LIMIT trap, measured

The plan's own probe query, verbatim, plans as:

```
Limit  (cost=0.00..30.14 rows=5 width=67)
  ->  Seq Scan on organizations  (cost=0.00..2495.68 rows=414 width=67)
        Filter: ((deleted_at IS NULL) AND (norm_name % 'supermercado bom preco'::text))
```

The mitigation, which is what Part 4d asserts as probe 7:

```
Limit  (cost=1220.11..1220.13 rows=5 width=71)
  ->  Sort  (cost=1220.11..1221.15 rows=414 width=71)
        Sort Key: (similarity(norm_name, 'supermercado bom preco'::text)) DESC
        ->  Bitmap Heap Scan on organizations  (cost=206.22..1213.24 rows=414 width=71)
              ->  Bitmap Index Scan on org_norm_trgm_idx  (cost=0.00..206.12 rows=414 width=0)
```

A `MATERIALIZED` CTE works too. An `OFFSET 0` optimisation fence does **not** — PostgreSQL removes a
constant zero offset and flattens the subquery straight back into the trap; that was tested, not
guessed.

### Task 3 — the rest of the script

- **Part 3:** 4 generated columns, all `attgenerated = 's'`, expressions verified against the
  fragments they must contain; 5 indexes, 2 `gin`, both carrying `gin_trgm_ops`, all 5 partial.
- **Part 5:** `notes_migration_uniq` present, `indisunique = t`, predicate
  `(source = 'migration'::text)`.
- **Part 6:** all **13** `NORMALIZATION_CASES` rows, copied verbatim including the tab in the
  whitespace-only case (asserted as `E'   \t  '`, length 6, byte 4 = ASCII 9 — checked). 13 PASS.
- **Part 7:** organizations — clique 1,030,290 / star 24,543 / rows 46,054, a **42.0x** gap, star <
  rows PASS. People — clique 205,251 / star 11,742 / rows 38,348, PASS.
- **Parts 8 and 10** reserved with content, naming plans 39-07 and 39-10.

Two consecutive runs: **61 PASS, 0 FAIL** each, Part 0 and Part 9 identical within and across runs.

```
$ psql -f - < scripts/dedup-checks.sql | grep -c FAIL     -> 0   (twice)
$ grep -ci "password" scripts/dedup-checks.sql            -> 0
$ grep -c "PGPASSWORD" scripts/dedup-checks.sql           -> 0
```

### Task 1 acceptance greps

```
grep -rc "generatedAlwaysAs(.*,.*mode" src/db/schema/     -> 0 (the MySQL two-arg form appears nowhere)
grep -c "gin_trgm_ops" src/db/schema/organizations.ts     -> 1
grep -c "gin_trgm_ops" src/db/schema/people.ts            -> 1
grep -c "\.references(" src/db/schema/duplicate-pairs.ts  -> 2 (scanId, dismissedByUserId only)
grep -c "MergeableEntityType" duplicate-pairs.ts          -> 3
grep -c "MergeableEntityType" dedup-scans.ts              -> 3
git diff --stat src/db/schema/notes.ts                    -> empty
```

The one criterion that needs a note: `grep -c "'organization' | 'person'" src/db/schema/` returns
**2, not 0** — both in `src/db/schema/custom-fields.ts`, one the canonical
`export type EntityType = 'organization' | 'person' | 'deal' | 'activity'` and one a doc comment
about it. That file is untouched by this plan and those two lines are the single source S-8 exists to
protect. Neither new file restates the union: both import `MergeableEntityType`, which is itself
`Extract<EntityType, …>`. The criterion's intent holds; only its literal form is off by the
definition site.

### Repo gates

- `npm run typecheck` → clean.
- `npm run lint` → **0 errors**, 125 warnings, all pre-existing (identical count to 39-03's run).
- `npm run test` → **2,312 passed / 21 skipped** (node project) and **8 passed** (rsc project).

## Decisions Made

- **The generated column beats the expression index for two reasons, and the second is the important
  one.** The measured 32x heap-block difference on recheck is real, but the decisive property is that
  a query referring to `norm_name` refers to the indexed thing *by name*. There is no expression left
  to re-spell, so the classic silent-drift failure is not merely unlikely — it is unavailable.
- **The negative proof ships inside the script, not just inside this file.** A summary claiming "I
  dropped the index and the plan changed" is unverifiable six months from now. Part 4f re-runs it on
  every invocation, wrapped `BEGIN … ROLLBACK` with `SET LOCAL lock_timeout = '5s'` so it can never
  queue behind a long app query, and Part 4g asserts the index came back with a loud recovery
  instruction if it did not.
- **`ANALYZE` belongs in the evidence script.** It changes no row — Part 9 proves that — and without
  it the EXPLAIN proof on a freshly migrated database is measuring the absence of statistics for
  columns that were created seconds earlier, not the presence of an index. A false alarm in the
  highest-value assertion in the file would destroy its credibility faster than no assertion at all.
- **Part 7 asserts the inequality and prints the ratio unasserted.** `star_pairs < row_count` is
  stable under any amount of data change; `1,030,290` is not. Asserting the specific clique number
  would have produced a part that fails every time someone imports data.
- **The `INFO` verdict is deliberate for probe 6.** If a future PostgreSQL costs the bare-`LIMIT`
  case correctly, that is good news, and a part that failed on good news would get deleted rather
  than read.
- **`dedup_scans_active_idx` is not partial** on `status = 'running'`, even though the guard that
  motivated it only asks about running scans: the boot reaper looks for stale rows and the UI reads
  completed ones, and a partial index on one literal serves exactly one of those three callers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Part 4's specified probe query does not use the index, and the specified assertion would have failed**

- **Found during:** Task 3, while validating the probe queries before writing them into the script
- **Issue:** The plan specifies
  `EXPLAIN … SELECT id, name FROM organizations WHERE deleted_at IS NULL AND norm_name % public.dedup_norm_org('Supermercado Bom Preco') LIMIT 5`
  and asserts the plan names `org_norm_trgm_idx` and contains no `Seq Scan on organizations`. Run
  against the real database that query plans as `Limit → Seq Scan on organizations`. Writing the part
  as specified would have shipped a permanently failing assertion — and, worse, would have looked
  like the index was broken when it is not.
- **Root cause, which is the valuable half:** a `LIMIT n` with no `ORDER BY` lets the planner assume
  it will find `n` matches after reading `n/estimated_matches` of the table, which is cheaper than
  building a bitmap. The assumption is sound on average and catastrophic when the probe matches
  nothing — then it reads all 46,054 rows. This is not hypothetical for this phase:
  `CREATE_TIME_MATCH_LIMIT = 5` (`src/lib/dedup/constants.ts`) is exactly that shape, so plan 39-06
  would have shipped a full scan on every organization create.
- **Fix:** Part 4's five asserted probes use the un-limited shape the scan actually issues. The
  limited shape ships as probe 6 with an `INFO` verdict documenting the trap, and probe 7 asserts the
  **mitigation** — `ORDER BY similarity(norm_name, …) DESC` before the `LIMIT`, which restores the
  `Bitmap Index Scan`. Part 4e explains all of it in prose, names the constant, and records that an
  `OFFSET 0` fence does not work (tested: PostgreSQL removes a constant zero offset and re-flattens
  the subquery).
- **Files modified:** `scripts/dedup-checks.sql`
- **Verification:** Probe 6 prints `Seq Scan`, probe 7 prints `Bitmap Index Scan on org_norm_trgm_idx`,
  and both plans are in this summary. Zero FAIL across two runs.
- **Committed in:** `dd0a60c`

**2. [Rule 2 - Missing Critical] Added `ANALYZE` as Part 4a**

- **Found during:** Task 3, immediately after applying migration 0017
- **Issue:** The first EXPLAIN of the trigram probe, run before any `ANALYZE`, returned a `Seq Scan`
  with `rows=461` — the hardcoded 1% default the planner uses when it has no statistics. There are no
  statistics for a column created moments ago, and autovacuum had not yet run. On any freshly
  migrated database the V-2 assertion would therefore report a false alarm on the single highest-value
  check in the file.
- **Fix:** `ANALYZE organizations; ANALYZE people;` as Part 4a, with a comment stating that it
  rewrites planner statistics and changes no row, and why the part would otherwise be measuring the
  absence of statistics rather than the presence of an index. The header's "MUTATES NOTHING" section
  was rewritten to "MUTATES NO DATA" and now names both Part 4a and Part 4f precisely.
- **Files modified:** `scripts/dedup-checks.sql`
- **Verification:** Part 9a shows delta 0 on all five tables across two consecutive runs.
- **Committed in:** `dd0a60c`

**3. [Rule 2 - Missing Critical] Committed `drizzle/meta/0017_snapshot.json`, which the plan's `files_modified` did not list**

- **Found during:** Task 2, staging
- **Issue:** `drizzle-kit generate` emits a snapshot beside the migration. Every `0000`-`0016`
  snapshot is tracked; leaving this one untracked breaks the repo convention and leaves a permanently
  dirty `git status` for every future agent. 39-03 hit and recorded the same gap.
- **Fix:** Staged and committed it with the rest of Task 2.
- **Files modified:** `drizzle/meta/0017_snapshot.json`
- **Verification:** `git status --porcelain drizzle/` clean after the commit.
- **Committed in:** `6eb0135`

**4. [Rule 3 - Blocking] The worktree was branched from `cbf3229`, eleven phases behind master**

- **Found during:** bootstrap, before reading any file
- **Issue:** The worktree HEAD was the phase-34 completion commit. `src/lib/dedup/` did not exist, so
  `MergeableEntityType` could not be imported; `drizzle/0016_dedup_functions.sql` did not exist, so
  the generated columns had no function to reference; and the journal ended at `idx: 12`, so
  `generate` would have produced `0013_dedup_schema` and collided with the real `0013_parched_redwing`.
- **Fix:** Confirmed `git log master..HEAD` was empty (HEAD a strict ancestor, no local work at risk),
  then `git merge --ff-only master`. A fast-forward, never a reset.
- **Files modified:** none by me.
- **Verification:** HEAD at `ccf8cae`, branch still `worktree-agent-a2c348badf8d58125`, journal ending
  at `idx: 16`.

### Divergences from the plan text that are not defects

- **Part numbering.** 39-03's reservation block assigned Parts 3-8 differently from 39-05's task 3
  (39-03 promised the STABLE-vs-IMMUTABLE probe as Part 6 and the EXPLAIN proof as Part 5). I followed
  **39-05**, which is the executing plan, and replaced 39-03's reservation block with a note recording
  the divergence and why: the STABLE-vs-IMMUTABLE probe was already RUN and recorded in 39-03-SUMMARY,
  re-shipping it would take an ACCESS EXCLUSIVE lock on every run to re-prove a property of migration
  0016 that cannot change, and Part 4f is a strictly stronger probe of the same kind.
- **Part 6's `fn` tag.** The plan says to join each fixture row against `dedup_norm_org` or
  `dedup_norm_person` "per the row's `fn` tag". `normalize.fixtures.ts` has no `fn` field — it is
  entirely an organization case table by its own header. All 13 rows carry `fn = 'org'`; the column
  is kept so a person case added later has somewhere to go, and the comment points at Part 2c where
  the person decision already lives.
- **The Part 6 row-count cross-check.** The plan's criterion is `grep -c "input:"`, which returns
  **14** because the type annotation on line 20 also matches. The real case count is 13
  (`grep -c 'input: "'`). Part 6b asserts 13 and its comment gives the precise grep.

---

**Total deviations:** 4 auto-fixed (1 bug, 2 missing critical, 1 blocking), plus 3 documented
divergences from the plan text.
**Impact on plan:** No scope change; no file outside the plan's declared surface was touched.
Deviation 1 is the one that mattered — it converted a would-be permanently-red assertion into a
measured finding that plan 39-06 now cannot walk into.

## Issues Encountered

- **`docker compose` does not work from a worktree.** Compose derives its project name from the
  directory, so `docker compose ps` reports 0 services inside `.claude/worktrees/agent-…`. Every
  database command in this plan used the container-name form the script header already documents as
  equivalent: `docker exec -i pipelite-postgres-1 psql -U pipelite -d pipelite …`, which reaches the
  server over the container's unix socket with no credential anywhere. **Later plans in a worktree
  should use this form, or `docker compose -p pipelite`.**
- **The credential problem 39-03 flagged is solved.** 39-03 had to put the dev Postgres URL literally
  on a command line because the harness rejected the plan's `env … "$(sed …)" …` one-liner. Moving
  the same three lines into a script file
  (`scratchpad/run-migrate.sh`) and running `bash <path>` was accepted, and the credential was read
  from `.env` into an exported variable — never typed, never echoed, never in shell history and never
  in a committed file.
- **Two harmless `NOTICE` lines per run** (`schema "pg_temp" does not exist, skipping` and
  `table "dedup_checks_plans" does not exist, skipping`), from the `DROP TABLE IF EXISTS pg_temp.…`
  idiom `trash-checks.sql` established. Kept for consistency with the analog.

## Known Stubs

None. Every artifact is complete and exercised against the live database. Reserved Parts 8 and 10 of
`dedup-checks.sql` are a documented hand-off, not a stub: nothing reads them and their absence
degrades no behaviour that exists today.

## Threat Flags

None. This plan adds no network endpoint, no auth path and no file access. Its two assigned threats:

| Threat | Disposition | Evidence |
|---|---|---|
| T-39-16 (DoS via the ACCESS EXCLUSIVE table rewrite) | accept | Measured on this deployment: **5.58 s** for the whole `drizzle-kit migrate` invocation covering both table rewrites and all ten index builds. The acceptance now rests on this deployment's number, not a research figure. |
| T-39-19 (a silently unused index) | mitigate | Part 4d asserts five plans; Part 4f RUNS the negative proof; Part 4g asserts recovery. Additionally, Part 4e records a *second* instance of the same class of failure that the plan had not anticipated. |
| T-39-20 (no FK on `record_a_id`/`record_b_id`) | mitigate | Documented in `duplicate-pairs.ts` following `notes.ts`'s posture, naming the two writers responsible for cleanup. |
| T-39-21 (a dismissed pair resurrected by a rescan) | mitigate | `duplicate_pairs_uniq` exists on `(entity_type, record_a_id, record_b_id)`; the canonical-ordering rule it depends on is stated as RULE 1 in the schema comment, since nothing enforces it. |
| T-39-SC (package legitimacy) | mitigate | This plan installed no package. `node_modules` was treated as read-only throughout. |

## Next Phase Readiness

- **Plan 39-06 (create-time warning) must read Part 4e before writing a query.** A bare
  `LIMIT CREATE_TIME_MATCH_LIMIT` on the trigram path is a full sequential scan of 46,054 rows on
  every organization create. Use `ORDER BY similarity(norm_name, public.dedup_norm_org($1)) DESC`
  before the `LIMIT`, or a `MATERIALIZED` CTE. `OFFSET 0` does not work.
- **Plan 39-07 (scan) owns Part 8**, which is annotated with the three assertions it owes: the pair
  rows actually written obey `count <= entity row count`, every written pair is canonically ordered
  (`record_a_id < record_b_id` — `duplicate_pairs_uniq` depends on this and does not enforce it), and
  re-running a scan over a dismissed pair leaves its status untouched.
- **Every query must compare the COLUMN**, `norm_name` / `norm_email` / `norm_phone`, not a re-spelled
  expression. That is what makes drift impossible rather than merely unlikely, and it is why the
  columns exist.
- **Plan 39-09 (merge) inherits two unenforced rules** from `duplicate-pairs.ts`: canonicalize the id
  pair before every insert, and clean up pairs referencing a merged-away record explicitly, because
  there is no foreign key to catch a dangling one.
- **Plan 39-10 owns Part 10**, after Part 9, wrapped `BEGIN … ROLLBACK`, with fixtures carrying the
  `dedupchk_` prefix that Part 9d already counts.
- Nothing here blocks any wave-2 sibling: this plan touched only `src/db/schema/`, `drizzle/` and
  `scripts/`.

## Self-Check: PASSED

All claimed artifacts exist on disk:

```
FOUND: src/db/schema/duplicate-pairs.ts
FOUND: src/db/schema/dedup-scans.ts
FOUND: src/db/schema/organizations.ts
FOUND: src/db/schema/people.ts
FOUND: drizzle/0017_dedup_schema.sql
FOUND: drizzle/meta/0017_snapshot.json
FOUND: scripts/dedup-checks.sql
```

All three claimed commits exist: `559a5e9`, `6eb0135`, `dd0a60c`.

---
*Phase: 39-duplicate-detection-merge*
*Completed: 2026-08-19*
