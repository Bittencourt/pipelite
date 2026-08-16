---
phase: 36-audit-log
plan: 03
subsystem: database-schema
tags: [audit-log, app-settings, migration, retention, indexes]
requires: []
provides:
  - "audit_log table (append-only, four indexes, no updated_at/deleted_at)"
  - "app_settings key/value table with JSONB value"
  - "AuditEntityType, AuditAction, AuditActorKind, AuditChanges, AuditLogRow, AppSettingRow types"
  - "auditLogRelations (actorUser, workflowRun, importSession)"
  - "seeded app_settings row: audit.retention_days = 90"
  - "scripts/audit-log-checks.sql standing evidence script"
affects:
  - "36-08 (settings read path), 36-09 (linked records), 36-11 (subscriber), 36-12 (importer), 36-15 (REST), 36-17 (timeline source), 36-18 (pruner)"
tech-stack:
  added: []
  patterns:
    - "polymorphic entityId with no FK and deliberately no parent-existence check"
    - "partial index via index(...).on(...).where(sql`... is not null`)"
    - "hand-added idempotent data seed in generated migration SQL (DDL vs data carve-out)"
    - "worktree-safe migration apply via docker cp + docker exec"
key-files:
  created:
    - src/db/schema/audit-log.ts
    - src/db/schema/app-settings.ts
    - drizzle/0014_sloppy_slapstick.sql
    - drizzle/meta/0014_snapshot.json
    - scripts/audit-log-checks.sql
  modified:
    - src/db/schema/index.ts
    - src/db/schema/_relations.ts
    - drizzle/meta/_journal.json
decisions:
  - "AuditActorKind declared in src/db/schema/audit-log.ts, not imported from @/lib/audit/actor-context — that module does not exist yet (36-01 is a wave-1 sibling with no dependency edge). 36-01 should import this type rather than redeclare it."
  - "The 90-day retention default is seeded as DATA by migration 0014, never as a code fallback — the two mechanisms are complementary (T-36-43 + T-36-44)."
  - "No backfill: audit_log starts empty and that is the honest starting point."
metrics:
  duration: ~25 min
  completed: 2026-08-16
---

# Phase 36 Plan 03: audit_log and app_settings Schema + Migration 0014 Summary

Created the append-only `audit_log` table with its four generate-emitted indexes and the new
`app_settings` key/value table, applied migration `0014` to the live database via the
worktree-safe `docker cp` + `docker exec` path, and seeded the CONTEXT-locked 90-day retention
default as data — proven idempotent and proven not to overwrite an operator's chosen value.

## What Was Built

**`src/db/schema/audit-log.ts`** — `audit_log` with ten columns and four indexes, all declared in
the third `pgTable` argument so `drizzle-kit generate` owns every piece of DDL:

| Index | Columns | Form | Purpose |
|-------|---------|------|---------|
| `audit_log_entity_idx` | `(entity_type, entity_id, created_at DESC)` | full | record timeline branch |
| `audit_log_workflow_run_idx` | `(workflow_run_id)` | partial `is not null` | run → records list (36-09) |
| `audit_log_created_at_idx` | `(created_at)` | full | retention prune scan (36-18) |
| `audit_log_import_session_idx` | `(import_session_id)` | partial `is not null` | import summary lookup (36-12) |

Three deviation comments are written into the file because each records a decision a later reader
would otherwise reverse:

1. **No `updatedAt`, no `deletedAt`.** Audit rows are immutable append-only facts; the only
   permitted deletion is the retention pruner (T-36-12). Every other CRM table carries both, so
   the absence would read as an oversight without the comment.
2. **`entityId` carries no FK *and* deliberately no parent-existence check.** This is the explicit
   OPPOSITE of `notes.ts:16-20`, where the mutation-layer check is the only defence. An audit row
   for a deleted record must survive that record; a referential guard here would erase exactly the
   evidence the log exists to keep.
3. **`AuditEntityType = EntityType | "import_session"`** — the four CRM literals are imported from
   `./custom-fields` and widened by union, never restated (D-01). The fifth literal exists because
   36-CONTEXT locks one summary audit row per import session; that row is about a session, not a
   CRM record. `assertEntityType` in `src/lib/timeline/assemble.ts:33-41` validates against the
   four CRM literals before any fragment is composed, so an `import_session` row is unreachable
   from every record timeline by construction.

**`src/db/schema/app-settings.ts`** — a new table shape for this codebase. Header comment records
that no key/value settings table existed before, that `notification-preferences.ts` is the
near-miss (typed boolean columns keyed by user — the shape 36-CONTEXT rejected), and that this
phase introduces the table plus exactly one key. `value` is `jsonb().$type<unknown>()` so every
read path must narrow and validate, which is what lets 36-08's `readRetentionDays` fail closed.

**`drizzle/0014_sloppy_slapstick.sql`** — two `CREATE TABLE`, three `ALTER TABLE ... FOREIGN KEY`,
four `CREATE INDEX` (all emitted by `generate`), plus one hand-added `INSERT ... ON CONFLICT
("key") DO NOTHING` seeding `audit.retention_days = 90`, preceded by a four-point comment block
covering why it exists, why it is data and not a code fallback, why it does not violate Phase 33
D-06, and why it does nothing on conflict rather than upserting.

**`scripts/audit-log-checks.sql`** — five parts: the index catalog, a counted assertion of the four
declared indexes, the `information_schema.columns` immutability proof, the seeded retention row,
the rolled-back `EXPLAIN (ANALYZE, BUFFERS)` prune plan, and a table-size context read.

## Decision: where `AuditActorKind` lives

The plan offered a choice and asked which was taken. **Declared in `src/db/schema/audit-log.ts`.**

The reason is not a schema→lib cycle — there is none in principle, since 36-01's
`actor-context.ts` is pure `AsyncLocalStorage` and imports no schema. The reason is that
`src/lib/audit/actor-context.ts` **does not exist yet**: 36-01 and 36-03 are wave-1 siblings with
`depends_on: []`, executing in parallel worktrees, so importing from it would not typecheck here.

The literals match 36-01's `<interfaces>` block exactly:
`"user" | "workflow_run" | "api_key" | "import" | "system"`. The file comment instructs 36-01 to
**import** this type rather than redeclare it, keeping `actor-context.ts` the single *runtime*
source (`runWithActor`, `getCurrentActor`, `AuditActor`) while the type has one definition. If
36-01 lands a second copy, that is a drift to reconcile in verification.

## No Backfill — Stated Explicitly

`audit_log` is **empty** and there is deliberately no backfill. There is no before-state to
reconstruct for the ~188,629 existing records (25,206 deals, 29,037 organizations, 46,198
activities, 75,235 notes, plus people), so an empty table is the honest starting point. A verifier
opening an old record will see an empty change history — that is correct, not a bug. History
accrues from the moment 36-11's subscriber goes live.

## Migration Apply — the worktree-safe path

`.env` is gitignored and **absent** from this worktree. `docker compose up -d --build` would
interpolate every `${VAR}` to the empty string and crash-loop the user's live application (the
35-03 Rule-3 deviation). The Phase 35 path was reused instead:

```
docker cp drizzle/0014_sloppy_slapstick.sql pipelite-app-1:/app/drizzle/
docker cp drizzle/meta/_journal.json        pipelite-app-1:/app/drizzle/meta/
docker cp drizzle/meta/0014_snapshot.json   pipelite-app-1:/app/drizzle/meta/
docker exec pipelite-app-1 sh -c 'cd /app && npx drizzle-kit migrate'
```

All three artifacts md5-verified identical host↔container before applying:

```
--- md5 host ---                          --- md5 container ---
239878510988ec4dd90eda0d3c40673d  0014_sloppy_slapstick.sql   239878510988ec4dd90eda0d3c40673d
42349afa8a7c82632a184ffe6d28164f  meta/_journal.json          42349afa8a7c82632a184ffe6d28164f
0a990852ddcc6ecc073c5806aa72cb8c  meta/0014_snapshot.json     0a990852ddcc6ecc073c5806aa72cb8c
```

```
[✓] migrations applied successfully!
```

**Step 3 — entrypoint no-op confirmed.** `docker compose -p pipelite restart app`, then
`docker compose -p pipelite logs app`:

```
app-1  | Running database migrations...
app-1  | [✓] migrations applied successfully!Starting application...
app-1  | ▲ Next.js 16.1.6
app-1  | ✓ Ready in 253ms
```

`drizzle.__drizzle_migrations` holds 7 rows; the entrypoint applied nothing new. `curl
http://localhost:3001/` returns `200` — the live app is healthy after the restart.

## DDL Ownership — a second `generate` is a no-op

```
$ ./node_modules/.bin/drizzle-kit generate
audit_log 10 columns 4 indexes 3 fks
app_settings 3 columns 0 indexes 0 fks

No schema changes, nothing to migrate 😴
```

Run **after** the Step 1b hand-edit, proving the appended data statement does not provoke
regeneration and that no DDL drifted from the schema files. Grep gate held:

```
CREATE TABLE = 2
CREATE INDEX = 4      <- unchanged by the hand-edit
IS NOT NULL   = 2     (case-insensitive; see Deviation 1)
ON CONFLICT   = 1
audit.retention_days = 1
```

## Idempotency Proof — all three steps, recorded

**Step 1 — re-run the seed statement verbatim.** Expect `INSERT 0 0`, value still 90:

```
INSERT 0 0
         key          | value |        updated_at
----------------------+-------+---------------------------
 audit.retention_days | 90    | 2026-08-16 02:23:58.66473
(1 row)
```

**Step 2 — operator sets 30, seed re-runs, must NOT overwrite:**

```
UPDATE 1
         key          | operator_chose
----------------------+----------------
 audit.retention_days | 30
(1 row)

INSERT 0 0
         key          | after_reseed
----------------------+--------------
 audit.retention_days | 30
(1 row)
```

**Step 3 — restored to 90:**

```
UPDATE 1
         key          | restored
----------------------+----------
 audit.retention_days | 90
(1 row)
```

The seed is idempotent (`INSERT 0 0` on replay) and never clobbers an operator's choice — the
value stayed at 30 through a full re-run of the migration statement.

## `\d audit_log` in the container

```
                               Table "public.audit_log"
      Column       |            Type             | Collation | Nullable |   Default
-------------------+-----------------------------+-----------+----------+-------------
 id                | text                        |           | not null |
 entity_type       | text                        |           | not null |
 entity_id         | text                        |           | not null |
 action            | text                        |           | not null |
 changes           | jsonb                       |           | not null | '{}'::jsonb
 actor_kind        | text                        |           | not null |
 actor_user_id     | text                        |           |          |
 workflow_run_id   | text                        |           |          |
 import_session_id | text                        |           |          |
 created_at        | timestamp without time zone |           | not null | now()
Indexes:
    "audit_log_pkey" PRIMARY KEY, btree (id)
    "audit_log_created_at_idx" btree (created_at)
    "audit_log_entity_idx" btree (entity_type, entity_id, created_at DESC NULLS LAST)
    "audit_log_import_session_idx" btree (import_session_id) WHERE import_session_id IS NOT NULL
    "audit_log_workflow_run_idx" btree (workflow_run_id) WHERE workflow_run_id IS NOT NULL
Foreign-key constraints:
    "audit_log_actor_user_id_users_id_fk" FOREIGN KEY (actor_user_id) REFERENCES users(id)
    "audit_log_import_session_id_import_sessions_id_fk" FOREIGN KEY (import_session_id) REFERENCES import_sessions(id)
    "audit_log_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id)
```

```
                        Table "public.app_settings"
   Column   |            Type             | Collation | Nullable | Default
------------+-----------------------------+-----------+----------+---------
 key        | text                        |           | not null |
 value      | jsonb                       |           | not null |
 updated_at | timestamp without time zone |           | not null | now()
Indexes:
    "app_settings_pkey" PRIMARY KEY, btree (key)
```

## `scripts/audit-log-checks.sql` — full output, verbatim

```
=== PART 1 — index catalog: the four declared indexes must be listed ===
    (audit_log_pkey also appears: pg_indexes counts the primary key index,
     so the honest total for this table is FIVE rows, four of them ours.)
          indexname           |                                                              indexdef
------------------------------+-------------------------------------------------------------------------------------------------------------------------------------
 audit_log_created_at_idx     | CREATE INDEX audit_log_created_at_idx ON public.audit_log USING btree (created_at)
 audit_log_entity_idx         | CREATE INDEX audit_log_entity_idx ON public.audit_log USING btree (entity_type, entity_id, created_at DESC NULLS LAST)
 audit_log_import_session_idx | CREATE INDEX audit_log_import_session_idx ON public.audit_log USING btree (import_session_id) WHERE (import_session_id IS NOT NULL)
 audit_log_pkey               | CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id)
 audit_log_workflow_run_idx   | CREATE INDEX audit_log_workflow_run_idx ON public.audit_log USING btree (workflow_run_id) WHERE (workflow_run_id IS NOT NULL)
(5 rows)


=== PART 1b — the four declared indexes, counted. Expect exactly 4. ===
 declared_index_count
----------------------
                    4
(1 row)


=== PART 2 — immutability: audit_log columns. Expect NO updated_at, NO deleted_at. ===
    column_name    |          data_type          | is_nullable | column_default
-------------------+-----------------------------+-------------+----------------
 id                | text                        | NO          |
 entity_type       | text                        | NO          |
 entity_id         | text                        | NO          |
 action            | text                        | NO          |
 changes           | jsonb                       | NO          | '{}'::jsonb
 actor_kind        | text                        | NO          |
 actor_user_id     | text                        | YES         |
 workflow_run_id   | text                        | YES         |
 import_session_id | text                        | YES         |
 created_at        | timestamp without time zone | NO          | now()
(10 rows)


=== PART 2b — the mutability columns, counted. Expect exactly 0 rows. ===
 column_name
-------------
(0 rows)


=== PART 3 — the seeded retention default. Expect exactly one row, value 90. ===
         key          | value |         updated_at
----------------------+-------+----------------------------
 audit.retention_days | 90    | 2026-08-16 02:24:36.384572
(1 row)


=== PART 4 — the prune plan. Wrapped in a rolled-back transaction: deletes nothing. ===
    Measured on a 1,000,000-row probe (36-RESEARCH Pitfall 4): with
    audit_log_created_at_idx a 5,000-row batch is 17.8 ms via Bitmap Index
    Scan -> Tid Scan; without it, 395.7 ms via Seq Scan. On a small or empty
    table the planner may legitimately choose a different node — what this
    part proves TODAY is that the index exists and the statement is valid.
BEGIN
                                                      QUERY PLAN
----------------------------------------------------------------------------------------------------------------------
 Delete on audit_log  (cost=16.24..30.32 rows=0 width=0) (actual time=0.005..0.007 rows=0 loops=1)
   ->  Hash Semi Join  (cost=16.24..30.32 rows=83 width=36) (actual time=0.004..0.006 rows=0 loops=1)
         Hash Cond: (audit_log.ctid = "ANY_subquery".ctid)
         ->  Seq Scan on audit_log  (cost=0.00..12.50 rows=250 width=6) (actual time=0.004..0.004 rows=0 loops=1)
         ->  Hash  (cost=15.21..15.21 rows=83 width=36) (never executed)
               ->  Subquery Scan on "ANY_subquery"  (cost=0.00..15.21 rows=83 width=36) (never executed)
                     ->  Limit  (cost=0.00..14.38 rows=83 width=6) (never executed)
                           ->  Seq Scan on audit_log audit_log_1  (cost=0.00..14.38 rows=83 width=6) (never executed)
                                 Filter: (created_at < (now() - '90 days'::interval))
 Planning:
   Buffers: shared hit=199 read=4
 Planning Time: 3.130 ms
 Execution Time: 0.208 ms
(13 rows)

ROLLBACK

=== PART 5 — table size, for context on what the retention window costs. ===
 total_rows | oldest_entry | total_size
------------+--------------+------------
          0 |              | 48 kB
(1 row)
```

**On Part 4's plan node.** The plan shows a `Seq Scan`, not the measured `Bitmap Index Scan →
Tid Scan`. This is expected and is not a missing index: the table has **0 rows** and occupies one
page, so a sequential scan is strictly cheaper than any index access and the planner correctly
picks it. Part 1 proves `audit_log_created_at_idx` exists; Part 4 proves the prune statement is
valid and plans. The 17.8 ms figure was measured on a 1M-row probe in 36-RESEARCH and will be
re-observable once the table has volume. 36-18 should re-run this script after the log has
accrued rows and confirm the plan flips to `Bitmap Index Scan`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `grep -c "IS NOT NULL"` acceptance criterion is case-sensitive against lowercase generated SQL**

- **Found during:** Task 3, Step 1
- **Issue:** The criterion reads `grep -c "IS NOT NULL" drizzle/0014_*.sql` returns `2`. Drizzle
  emits the partial predicate in the **lowercase** form it received from the schema file
  (`WHERE "audit_log"."workflow_run_id" is not null`), so the case-sensitive grep returns `0` and
  the gate would fail against a perfectly correct migration.
- **Fix:** Ran the gate case-insensitively (`grep -ci`), which returns `2`. Neither the schema nor
  the generated SQL was altered to satisfy a grep — changing `sql\`... is not null\`` to uppercase
  purely to match a criterion's casing would be tail-wagging-dog. Postgres itself normalises the
  predicate to `IS NOT NULL` in `pg_indexes.indexdef`, which is what `scripts/audit-log-checks.sql`
  Part 1 shows.
- **Files modified:** none
- **Commit:** `715d090`

**2. [Rule 1 - Bug] Task 3's automated `<verify>` expects `pg_indexes` count `4`; the true value is `5`**

- **Found during:** Task 3, Step 2
- **Issue:** `SELECT count(*) FROM pg_indexes WHERE tablename='audit_log'` returns **5**, not 4 —
  `pg_indexes` includes the primary-key index `audit_log_pkey`. The plan's verify command
  (`| grep -q '^4$'`) would report failure on a fully correct schema, and the Part 1 criterion
  "must list all four" would read as a discrepancy to a verifier who counts the rows.
- **Fix:** `scripts/audit-log-checks.sql` shows the full five-row catalog (with an inline comment
  explaining the pkey row) **and** adds Part 1b, which counts the four declared indexes by name and
  returns exactly `4`. The equivalent verify is
  `... WHERE tablename='audit_log' AND indexname LIKE 'audit_log%_idx'` → `4`, confirmed.
- **Files modified:** `scripts/audit-log-checks.sql`
- **Commit:** `715d090`

**3. [Rule 3 - Blocking] `npx` resolves to `npm run` in this environment**

- **Found during:** Task 3, Step 1
- **Issue:** `npx drizzle-kit generate` failed with `npm error Missing script: "drizzle-kit"` — an
  environment-level `npx` interception rewrote it to `npm run`.
- **Fix:** Invoked the local binary directly: `./node_modules/.bin/drizzle-kit generate`. Identical
  binary, identical config resolution. Inside the container `npx drizzle-kit migrate` works
  normally and was used as the plan specifies.
- **Files modified:** none
- **Commit:** n/a (tooling invocation only)

**4. [Rule 2 - Missing critical] Seed comment block was polluting its own grep gates**

- **Found during:** Task 3, Step 1b
- **Issue:** The first draft of the four-point comment block spelled out `CREATE INDEX` and
  `ON CONFLICT` in prose, which pushed `grep -c "CREATE INDEX"` to `5` and `grep -c "ON CONFLICT"`
  to `2`. That does not just fail the criterion — it **destroys the D-06 regression detector**, so
  a future hand-written index in this file would no longer move the count.
- **Fix:** Reworded the prose to avoid the literal DDL keywords, with an inline note saying why the
  comments deliberately avoid spelling them. Counts are back to `CREATE INDEX = 4`,
  `ON CONFLICT = 1`.
- **Files modified:** `drizzle/0014_sloppy_slapstick.sql`
- **Commit:** `715d090`

### Context Files Not Found

`36-PATTERNS.md` is referenced by this plan's `<context>` and by the executor prompt, but no such
file exists in `.planning/phases/36-audit-log/`. The two analogs it points at
(`deal-stage-history.ts:12-26` for the immutability posture, `notes.ts:11-46` for the polymorphic
keying and partial-index form) were read directly instead, and both are reflected in the schema
file's comments. Flagging it because other plans in this phase cite the same file.

## Threat Model Coverage

| Threat ID | Disposition | Where mitigated |
|-----------|-------------|-----------------|
| T-36-12 | mitigate | No `updated_at` / `deleted_at` on `audit_log`; asserted by checks Part 2/2b (0 rows) |
| T-36-13 | mitigate | Real FK `audit_log_workflow_run_id_workflow_runs_id_fk`, confirmed in `\d audit_log` |
| T-36-09 | mitigate | `audit_log_created_at_idx` present, emitted by `generate`, listed in checks Part 1 |
| T-36-43 | mitigate | `audit.retention_days = 90` seeded as data; idempotency proven; asserted by checks Part 3 |
| T-36-44 | mitigate | Default is data only. `app_settings.value` is `$type<unknown>()`, forcing 36-08 to narrow and fail closed. No `?? 90` anywhere in this plan's output. |
| T-36-SC | accept | Zero packages added |

## Known Stubs

None. Both tables are real, applied, and queryable; the one seeded row is real data.

## For the Next Plan

- `import { auditLog, appSettings, type AuditLogRow, type AuditEntityType, type AuditAction, type AuditActorKind, type AuditChanges, type AppSettingRow } from "@/db/schema"` resolves.
- **36-01:** import `AuditActorKind` from `@/db/schema/audit-log` instead of redeclaring it.
- **36-08:** the retention row already exists at 90. Do **not** add a `?? 90` fallback — the seed
  is the default, and `readRetentionDays` must fail closed to `null` on a cleared, corrupted or
  out-of-range row.
- **36-18:** use the `ctid IN (SELECT ctid ... LIMIT n)` prune form. The `id IN (SELECT id ORDER BY
  created_at LIMIT n)` form a careful engineer reaches for first is 311.5 ms even *with* the index
  (Hash Semi Join + full Seq Scan) versus 17.8 ms for the `ctid` form.
- **36-17:** an `import_session` audit row must never reach a record timeline;
  `assertEntityType` already blocks it, but any new query path must preserve that.

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Declare `audit_log` and `app_settings` with all indexes | `88648c8` |
| 2 | Barrel exports + `auditLogRelations` | `7bbeaf1` |
| 3 | Generate + apply migration 0014, seed retention, checks script | `715d090` |

## Verification

| Check | Result |
|-------|--------|
| `npm run typecheck` | pass (`tsc --noEmit`, 0 errors) |
| `npm run lint` | 0 errors, 125 pre-existing warnings, none in the new files |
| `npm test` | 66 files / 1128 tests passed, 4 skipped |
| `grep -c "index(" src/db/schema/audit-log.ts` | `4` |
| non-comment `deletedAt|updatedAt` in `audit-log.ts` | `0` |
| `grep -c "AuditEntityType"` | `3` (>= 3) |
| `grep -c "import_session"` | `4` (>= 1) |
| `grep -c "is not null"` in schema | `2` |
| `grep -c "audit-log\|app-settings" src/db/schema/index.ts` | `2` |
| `grep -c "auditLogRelations" _relations.ts` | `1` |
| `one(` in the `auditLogRelations` block | `3` |
| `ls drizzle/0014_*.sql` | exactly one file |
| `grep -c "CREATE INDEX"` in 0014 | `4` (unchanged after the hand-edit) |
| `grep -ci "IS NOT NULL"` in 0014 | `2` |
| `grep -c "0014" drizzle/meta/_journal.json` | `1` |
| `grep -c "ON CONFLICT"` / `"audit.retention_days"` | `1` / `1` |
| second `drizzle-kit generate` | "No schema changes, nothing to migrate" |
| `SELECT value FROM app_settings WHERE key='audit.retention_days'` | `90` |
| declared indexes in `pg_indexes` | `4` (`+ audit_log_pkey` = 5 total) |
| `updated_at`/`deleted_at` on `audit_log` | 0 rows |
| entrypoint migrate after restart | no-op, app `Ready in 253ms`, `curl localhost:3001` → `200` |

## Self-Check: PASSED

Files verified present on disk:
- `FOUND: src/db/schema/audit-log.ts`
- `FOUND: src/db/schema/app-settings.ts`
- `FOUND: drizzle/0014_sloppy_slapstick.sql`
- `FOUND: drizzle/meta/0014_snapshot.json`
- `FOUND: scripts/audit-log-checks.sql`

Commits verified in `git log`:
- `FOUND: 88648c8`
- `FOUND: 7bbeaf1`
- `FOUND: 715d090`

The `node_modules` symlink created for `drizzle-kit` resolution was removed before staging and
appears in no commit (`git log --name-only c55205f..HEAD | grep -c node_modules` → `0`).

STATE.md and ROADMAP.md were **not** touched — the orchestrator owns those.
