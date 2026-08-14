---
phase: 33-database-indexes-for-the-crm-core
plan: 03
subsystem: database
tags: [drizzle-kit, migration, postgres, btree, explain-analyze, pg_indexes, performance]

requires:
  - phase: 33-01
    provides: the committed BEFORE plan capture and the reusable verify-plans.sql
  - phase: 33-02
    provides: the eleven schema-declared index declarations that db:generate diffs
provides:
  - "drizzle/0012_typical_radioactive_man.sql — the single generated migration carrying all eleven CREATE INDEX statements"
  - "Eleven live btree indexes across deals / activities / people / organizations, catalog-proven"
  - "33-PLANS.md completed with side-by-side BEFORE/AFTER captures, a Deltas table, SC-1..SC-4 verdicts and a Not-gaps list"
affects: [phase-37-trash-and-restore, phase-38-bulk-operations, phase-43-deployment-docs]

tech-stack:
  added: []
  patterns:
    - "Blocking content gate on generated migration SQL before any db:migrate is permitted"
    - "Live-catalog verification (pg_indexes) rather than tsc/type-level proof, because Drizzle types come from schema files and cannot show whether a migration ran"

key-files:
  created:
    - drizzle/0012_typical_radioactive_man.sql
    - drizzle/meta/0012_snapshot.json
  modified:
    - drizzle/meta/_journal.json
    - .planning/phases/33-database-indexes-for-the-crm-core/33-PLANS.md

key-decisions:
  - "Generated SQL was hard-gated (11 CREATE INDEX, nothing else) with zero database connections BEFORE db:migrate was allowed to run"
  - "SQL, snapshot and journal entry committed in one commit (D-06) so a future generate cannot drop the indexes"
  - "drizzle.__drizzle_migrations left at its historical 4-row state and not 'fixed' — the migrator compares against max created_at, so only 0012 ran (4 -> 5)"
  - "DATABASE_URL overridden inline for the single db:migrate invocation; no tracked env file was edited"

patterns-established:
  - "Whole-phase scope anchors must be validated as the true pre-phase commit, not taken on faith from a plan note"

requirements-completed: [PERF-01, PERF-02]

duration: 21min
completed: 2026-08-14
---

# Phase 33 Plan 03: Migration, Application and AFTER Capture Summary

**One generated migration (`0012_typical_radioactive_man.sql`) put eleven plain btree indexes live, flipping the kanban query from `Seq Scan on deals` to `Bitmap Index Scan on deals_stage_id_idx` (2414 → 426 buffers) and the reminder cron from `Seq Scan on activities` to a literal `Index Scan using activities_due_date_idx` (cost 5072.02 → 12.21, 3294 → 5 buffers) — with all 25,206 deals / 79,023 activities / 46,055 orgs / 38,345 people untouched.**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-08-14T16:03:00Z
- **Completed:** 2026-08-14T16:24:00Z
- **Tasks:** 3
- **Files created/modified:** 4

## Accomplishments

- **Generated** the migration from the schema (never hand-authored) and **hard-gated it before any DB connection**: exactly 11 `CREATE INDEX` statements, every statement beginning with `CREATE INDEX`, and zero occurrences of `CONCURRENTLY` (D-03), `WHERE` (D-02), `DROP`, `ALTER TABLE`, `CREATE TABLE` or `ADD COLUMN`. No statement names both `stage_id` and `position` (D-04). No existing migration `0000`–`0011` was modified. Confirmed at gate time that the DB was still pristine: `PRE=0|4`.
- **Applied** it: `npm run db:migrate` exit 0, only `0012` ran, ledger 4 → 5 rows.
- **Proved the result against the live catalog**, not against types: `GUARD=25206|79023|46055|38345|11|5|4` and the non-pkey index name set matching the expected eleven exactly, with no extras and none missing.
- **Q4 returns eleven `index_backed = t`** including `deals.owner_id` — the only proof path that column will ever have (D-05).
- **Re-ran `verify-plans.sql` byte-identically** (`git diff` on it is empty) and completed `33-PLANS.md` with the AFTER captures, a Deltas table, a Verdicts table quoting all four ROADMAP criteria, and a Not-gaps list.

## Measured BEFORE → AFTER

| Statement | BEFORE | AFTER | Delta |
|-----------|--------|-------|-------|
| **Q1** kanban, BDR - Base Fria (14.9%) | `Seq Scan on deals`, cost **2729.07**, **2414** buffers | `Bitmap Heap Scan on deals` ← `Bitmap Index Scan on deals_stage_id_idx`, cost **2613.98**, **426** buffers | −4.2% cost, **5.7× fewer buffers** |
| **Q2** kanban, single stage (~1.3%) | `Seq Scan on deals`, cost 2729.07, 2414 buffers | `Bitmap Index Scan on deals_stage_id_idx`, cost **2623.28**, **392** buffers | 6.2× fewer buffers |
| **Q3** reminder cron | `Seq Scan on activities`, cost **5072.02**, **3294** buffers, 79,023 rows removed | literal `Index Scan using activities_due_date_idx`, cost **12.21**, **5** buffers | **415× cheaper, 659× fewer buffers** |
| **Q4** catalog | eleven `f` | eleven `t` | SC-3 closed |

Every cost figure landed on the `33-RESEARCH.md` prediction to the decimal (2613.98 / 2623.28 / 12.21), and the measured index footprint came in at exactly the predicted **7328 kB**. Execution times, reported for interest only and not graded: 13.243 → 4.103 ms, 11.789 → 3.116 ms, 15.197 → 0.055 ms.

## Verdicts

- **SC-1 ✅** — kanban moved from `Seq Scan on deals` to an index-driven bitmap plan on `deals_stage_id_idx`. Per **D-01** the bitmap node form satisfies "index scan"; a plain `Index Scan` node is physically unachievable for a ~3,753-row scattered fetch and must not be required. Q2 corroborates at far wider margin.
- **SC-2 ✅** — literal `Index Scan using activities_due_date_idx`, cost 5072.02 → 12.21.
- **SC-3 ✅** — eleven `index_backed = t` via exactly one generated migration; `deals.owner_id` catalog-proven only (D-05).
- **SC-4 ✅** — `npm test` exit 0 at the exact baseline (41 files, 461 passed / 4 skipped), `typecheck` exit 0, `lint` exit 0, and the whole-phase diff touches zero `*.test.ts` files.

## Task Commits

1. **Task 1: Generate the migration and hard-gate its contents** — `95a7288` (feat)
2. **Task 2: [BLOCKING] Apply the migration and assert the catalog** — `dcf626d` (chore, `--allow-empty`)
3. **Task 3: Capture AFTER plans and close SC-1..SC-4** — `27745e5` (docs)

Task 2 produced no repo changes — its effect is entirely in the database — so its commit is an empty marker recording the DDL application boundary between the BEFORE capture (`48dc3d3`) and the AFTER capture (`27745e5`). That makes D-07's ordering auditable from git history alone.

## Files Created/Modified

- `drizzle/0012_typical_radioactive_man.sql` — 11 `CREATE INDEX` statements, `--> statement-breakpoint` separated
- `drizzle/meta/0012_snapshot.json` — the snapshot keeping schema and migration history in agreement
- `drizzle/meta/_journal.json` — new entry `idx: 12`, `when: 1786722221685`
- `.planning/phases/33-database-indexes-for-the-crm-core/33-PLANS.md` — AFTER captures, Deltas, Verdicts, Not gaps

## Decisions Made

- Left `drizzle.__drizzle_migrations` at its historical 4-row state rather than backfilling the 8 `db:push`-era migrations. The migrator compares `folderMillis` against the single max `created_at` (`1774729567507` = 0011), so only `0012` could run — confirmed by the ledger going exactly 4 → 5.
- Recorded the reversal path in `33-PLANS.md`: drizzle-kit has no down migrations, so manual reversal is `DROP INDEX` on the eleven names **plus** removing the schema declarations, or the next generate recreates them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npm run db:migrate` could not reach the database**

- **Found during:** Task 2
- **Issue:** The plan stated `db:migrate` "connects to `localhost:5433` per `drizzle.config.ts`". It does not. `drizzle.config.ts` reads `process.env.DATABASE_URL`, and `.env` sets it to `postgresql://pipelite:…@postgres:5432/pipelite` — the **Docker-network** hostname, unresolvable from the host. The first run failed with `getaddrinfo EAI_AGAIN postgres` on `CREATE SCHEMA IF NOT EXISTS "drizzle"`. `.env.local` was no better (`localhost:5432`, the wrong port). Verified via `docker compose ps` that Postgres is published on host port **5433** and that 5432 is `ECONNREFUSED`.
- **Fix:** Exported `DATABASE_URL=postgresql://pipelite:…@localhost:5433/pipelite` for that single invocation only. **No tracked file was edited** — `.env` and `.env.local` are untouched, since changing them would alter app runtime configuration and fall outside the phase scope.
- **Verification:** `db:migrate` exit 0; the failed first attempt left the DB provably untouched (`0|4` non-pkey indexes / ledger rows checked immediately afterwards), so nothing partial was applied.
- **Committed in:** `dcf626d` (no file changes; the fix was an invocation-time env var)

**2. [Rule 1 - Bug] The whole-phase scope anchor `5a88626` is the wrong commit**

- **Found during:** Task 3
- **Issue:** The plan anchored the scope check at `5a88626`, described as "the commit immediately preceding this phase". It is an ancestor of HEAD, so the plan's stated fallback ("if not an ancestor, substitute") never triggered — but `5a88626` is `docs: create milestone v1.3 roadmap`, dated 2026-08-13, which predates **the entire execution of Phase 32**. Diffing from it attributed ~30 Phase 32 files to Phase 33, including five `*.test.ts` files, producing four spurious `TEST FILE TOUCHED IN PHASE (SC-4)` failures against a phase that touched no test at all.
- **Fix:** Substituted the true pre-phase-33 commit `a12ef32` (`docs(32): capture backlog 999.17-999.19…`, the last Phase 32 commit; every commit after it is Phase 33 planning or execution). The check is unchanged in substance and strictly narrower.
- **Verification:** `git diff --name-only a12ef32..HEAD` outside `.planning/` returns exactly seven paths — the four schema files, `drizzle/0012_typical_radioactive_man.sql`, `drizzle/meta/0012_snapshot.json`, `drizzle/meta/_journal.json` — and zero `*.test.ts`. SC-4's scope clause is genuinely satisfied, which the original anchor would have falsely denied.
- **Files modified:** none in the repo (verification logic only)
- **Committed in:** n/a

**3. [Rule 1 - Bug] Two self-inflicted false positives in the Task 3 assertion**

- **Found during:** Task 3
- **Issue:** (a) The Q4 `index_backed = t` row count was extracted by splitting the AFTER section on `---`, which truncated at psql's own `---------+------` table rule and counted 0 rows instead of 11. (b) The "no `Hash Cond`" check scanned the whole AFTER section, so it matched my own explanatory prose asserting the *absence* of a hash join.
- **Fix:** (a) Split on the next `## ` heading and match full data rows with an anchored per-line regex, plus an added assertion that no `f` row survives. (b) Scope the hash-join check to the fenced plan block of Q1 only, and reword the artifact prose to describe the condition instead of quoting it.
- **Verification:** Corrected assertion prints PASS with 11 `t` rows detected and 0 `f` rows.
- **Files modified:** `33-PLANS.md` (prose wording only)
- **Committed in:** `27745e5`

---

**Total deviations:** 3 auto-fixed (1 blocking environment/config, 2 verification-logic bugs)
**Impact on plan:** No change to what was built. The migration, its contents, the applied state and the captured evidence are all exactly as specified. Deviation 2 is the significant one — the plan's own scope check would have reported a false SC-4 failure had it been run verbatim.

## Issues Encountered

- The first `db:migrate` attempt failed at the very first statement (schema creation), so the transaction never opened and no `CREATE INDEX` was attempted. Confirmed by an immediate catalog re-check before retrying, exactly as the plan's "do not retry blindly" instruction requires.
- The `rtk` hook wraps `npm` output in ANSI escapes; all gate output was captured to files, ANSI-stripped, and judged from vitest's summary lines rather than free text.

## Database Integrity

Final live guard: `GUARD=25206|79023|46055|38345|11` — deals **25206**, activities **79023**, organizations **46055**, people **38345**, all identical to the pre-phase counts; **11** non-pkey indexes; `drizzle.__drizzle_migrations` at **5**; `random_page_cost` still **4** (D-08). Across the entire phase, zero rows were inserted, altered, removed or truncated, no `ANALYZE` was run, and no server configuration was changed. The only database mutation was the `CREATE INDEX` DDL in migration 0012.

## Self-Check: PASSED

- `drizzle/0012_typical_radioactive_man.sql` — FOUND
- `drizzle/meta/0012_snapshot.json` — FOUND
- `drizzle/meta/_journal.json` — FOUND (last entry `idx: 12`)
- `.planning/phases/33-database-indexes-for-the-crm-core/33-PLANS.md` — FOUND (BEFORE + AFTER + Deltas + Verdicts + Not gaps)
- Commits `95a7288`, `dcf626d`, `27745e5` — all FOUND

## User Setup Required

None — no external service configuration required. **Deploy note:** any other environment needs `npm run db:migrate` at deploy time, with a ~1.08 s write-blocking `ShareLock` window.

## Next Phase Readiness

- Phase 37 (Trash & Restore) inherits the four `deleted_at` indexes, which are measurably used for the `IS NOT NULL` direction its TRASH-01/TRASH-03 access pattern needs.
- Phase 43 (backup/restore docs) should note that indexes are rebuilt from the schema, not shipped as leaf data.
- **Pre-existing issue worth flagging, not fixed here (out of scope):** neither `.env` nor `.env.local` holds a `DATABASE_URL` usable from the host, so `npm run db:migrate` cannot be run from the host without an inline override. A future phase may want `.env.local` corrected to port 5433.

---
*Phase: 33-database-indexes-for-the-crm-core*
*Completed: 2026-08-14*
