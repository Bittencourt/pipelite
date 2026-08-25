---
phase: 46-migration-chain-toolchain-floor
plan: 04
subsystem: database
tags: [drizzle-kit, postgres, migrations, catalog-equivalence, negative-control, operational-script]

# Dependency graph
requires:
  - phase: 46-01-migration-chain-repair
    provides: "the repaired drizzle/0006 that creates import_sessions and webhook_deliveries — the chain this plan proves builds a complete database"
  - phase: 46-02-host-connection-string
    provides: ".env describing the host (localhost:5433), so this script resolves a reachable server with no inline DATABASE_URL override"
  - phase: 39-db-test-isolation
    provides: "scripts/dedup-db-test-setup.sh — the three-fence scratch-database design this script translates from bash to Node"
provides:
  - "GATE B: scripts/migrate-from-zero.mjs — builds a throwaway database with `drizzle-kit migrate` alone and asserts its CATALOG, never the child's exit code"
  - "npm run db:check-migrations — the operator- and CI-facing entry point, chained into no aggregate script"
  - "Assertion set A: unconditional snapshot equivalence (36 tables / 293 table.column pairs / 41 declared index names as a SUBSET of pg_indexes' 81) — runs where no reference database exists"
  - "Assertion set B: ten catalog dimensions against a reachable reference, with a seven-branch reference-resolution ladder in which a partially-populated reference is FATAL rather than a skip"
  - "Recorded RED observations for NC-1 (loud, 42P01) and NC-2 (silent, migrate exits 0 while the check exits 1)"
affects: [46-05-ci-wiring, 46-06-container-boot, any phase needing a database built from the chain]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Catalog-level schema equivalence through the postgres driver — no psql, no pg_dump, no dump-text normalisation"
    - "Three-fence scratch-database lifecycle with the DROP and every client.end() in a `finally`, and SIGINT/SIGTERM routed through it"
    - "Reference-resolution ladder where every skip prints its own reason and a partial reference is FATAL"

key-files:
  created:
    - scripts/migrate-from-zero.mjs
  modified:
    - package.json
    - eslint.config.mjs
    - drizzle/0006_import-sessions-user-id.sql  # TRANSIENTLY, by NC-1 and NC-2; restored, tree clean

key-decisions:
  - "The child migrate's exit code is RECORDED and never branched on — NC-2 is the proof that this is the load-bearing choice"
  - "Assertion set A (snapshot) is unconditional so the gate keeps teeth in CI, where no reference database exists at all"
  - "A reference with 1..35 public tables is FATAL with or without --require-reference: a misconfiguration must never be able to disguise itself as an absence"
  - "SIGINT/SIGTERM handlers exist so an operator's Ctrl-C runs the `finally` instead of leaking a database; DROP uses WITH (FORCE) so a killed child's connection cannot block cleanup"
  - "eslint's existing NON-APPLICATION SURFACES exemption gained `scripts/**` rather than a third override block — the phase-42 gate counts the override key and expects 2"
  - "The per-dimension diff enumeration is capped at 20 with the full count always stated; uncapped it was 52KB and buried the 42P01"

patterns-established:
  - "Operational Node script shape: five-section all-caps JSDoc header, `-> …` progress echoes, per-problem FATAL diagnoses on stderr, terminal `OK: …`, exit 1 on any FATAL"
  - "Identifier fences for generated database names: pattern test + reference-name inequality + reserved-name deny list, re-checked immediately before every interpolation"

requirements-completed: [DEPLOY-01]

# Metrics
duration: 25min
completed: 2026-08-25
---

# Phase 46 Plan 04: From-Zero Migration Check Summary

**`npm run db:check-migrations` builds a throwaway database with `drizzle-kit migrate` and nothing else, then proves it equivalent to the drizzle snapshot and to the live database across ten catalog dimensions — and it goes red on a missing table while the child migrate still exits 0, which is the whole reason it is not an exit-code check.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-25
- **Tasks:** 2 (1 committed + 1 follow-up fix commit; task 2 produces no commit by design)
- **Files modified:** 3 tracked (1 created, 2 modified) + 1 transiently edited and restored

## Accomplishments

- **The behavioural half of DEPLOY-01 exists and can fail.** `scripts/migrate-from-zero.mjs` (772 lines) creates `pipelite_migchk_<pid>_<epoch>`, migrates it from zero, asserts the catalog, and removes it in a `finally`.
- **Equivalence is proved, not inferred.** Ten catalog dimensions, all IDENTICAL against the live database: 36 tables, 293 columns, 81 indexes, 83 constraints, 9 enums, 38 functions, 3 extensions, 0/0/0 triggers/sequences/views. These match the research figures exactly, re-measured here rather than taken as literals.
- **NC-2 discharged with the decisive combination:** the spawned `drizzle-kit migrate` **EXIT CODE 0**, printing `[✓] migrations applied successfully!` with 20 ledger rows, while `db:check-migrations` **EXIT CODE 1** reporting 35 against 36 and naming `webhook_deliveries`.
- **NC-1 discharged with `42P01` reaching the terminal verbatim**, `migrate exit code: 1`, and the rollback state reported honestly as `public tables: 0 | drizzle schema tables: 1 | drizzle.__drizzle_migrations rows: 0`.
- **Both fences observed refusing**, and five reference-resolution branches exercised end to end, including the partially-populated-reference FATAL.
- **No database leaked on any path** — nominal, `--require-reference`, both negative controls, and a run interrupted mid-migrate with SIGINT.

## Task Commits

1. **Task 1: Write `scripts/migrate-from-zero.mjs` and wire `db:check-migrations`** — `a83500d` (feat)
2. **Follow-up found while exercising the gate: cap the per-dimension diff report** — `fbd7fda` (fix)
3. **Task 2: NC-1 and NC-2** — no commit by design; tree left clean at `fbd7fda`

## Files Created/Modified

- `scripts/migrate-from-zero.mjs` (created, 772 lines) — plain ESM, bare `node`, `postgres` driver only. Five-section all-caps JSDoc header in the `dedup-db-test-setup.sh:1-59` register; whole-line `.env` parsing; three fences; child-process migrate with `DATABASE_URL` in the environment and never on argv; assertion sets A and B; seven-branch reference resolution; `finally` cleanup with signal handling.
- `package.json` (modified, +1) — `"db:check-migrations": "node scripts/migrate-from-zero.mjs"` in the `db:` namespace block. No aggregate script mentions it (verified: 0 other scripts contain the string).
- `eslint.config.mjs` (modified, +9/-1) — `scripts/**` added to the EXISTING "NON-APPLICATION SURFACES" `no-console` exemption, with its rationale written into the same comment block. See the deviation note.
- `drizzle/0006_import-sessions-user-id.sql` — edited twice by task 2 and restored with `git checkout --` each time. `git status --porcelain` is empty.

## Verification

| Check | Result |
|---|---|
| `npm run db:check-migrations` from the repo root, NO inline `DATABASE_URL` prefix | **exit 0**, resolved `localhost:5433/pipelite` from `.env` |
| `migrate exit code` reported | **0** |
| `public tables` | **36** |
| Assertion set A | 36/36 tables, 293/293 table.column pairs, 41/41 snapshot index names present (81 indexes in total) — all IDENTICAL |
| Assertion set B | **RAN** (branch 6), all ten dimensions IDENTICAL — table below |
| `npm run db:check-migrations -- --require-reference` | **exit 0** |
| Scratch-DB leak check after every run | `pipelite_migchk%` list **EMPTY**, every time |
| Fence 1 proof (name hardcoded to `pipelite`) | **FATAL, exit 1, no connection opened**; `pipelite` still present with 36 tables |
| Fence 2 proof (name equal to `REFERENCE_DB`) | **FATAL, exit 1** |
| Branch 3 (reference absent) / with `--require-reference` | SKIPPED, exit 0 / **FATAL, exit 1** |
| Branch 4 (reference has 0 public tables — the CI shape) / with `--require-reference` | SKIPPED, exit 0 / **FATAL, exit 1** |
| Branch 5 (reference has 1 of 36 public tables) | **FATAL, exit 1** — with no `--require-reference` given |
| Interrupted run (`timeout -s INT 1`) | child killed, `finally` fired, `removed pipelite_migchk_…`, no leak |
| `ordinal_position` outside `//` comment lines | **0** |
| `table_schema` occurrences / all qualified to `'public'` | **5 / yes** |
| Destructive-token lines mentioning `REFERENCE_DB` | **0** |
| `node -e "…scripts['db:check-migrations']"` | `node scripts/migrate-from-zero.mjs` |
| `npx vitest run src/lib/mutations/__tests__/db-test-isolation.test.ts` | **PASS 16 / FAIL 0** |
| `npm test` | **168 files passed, 2 skipped; 4682 tests passed, 32 skipped** + rsc 2 files / 8 tests |
| `npm run typecheck` | **0** |
| `npm run lint` | **0 errors**, 124 warnings (the main-tree baseline) |
| `git status --porcelain` at end | **empty** |

## The nominal run, verbatim

```
$ npm run db:check-migrations

> node scripts/migrate-from-zero.mjs
-> connection: localhost:5433/pipelite (from .env)
-> scratch database: pipelite_migchk_3742599_1787629753412
-> reference database (read with SELECT only): pipelite
-> snapshot reference: drizzle/meta/0019_snapshot.json — 36 tables, 293 table.column pairs, 41 declared index names, 20 journal entries
-> created pipelite_migchk_3742599_1787629753412
-> running `drizzle-kit migrate` against the scratch database — output verbatim:
No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/pedro/programming/pipelite/drizzle.config.ts'
Using 'postgres' driver for database querying
[⣷] applying migrations...[✓] migrations applied successfully!
-> migrate exit code: 0
-> public tables: 36 | drizzle schema tables: 1 | drizzle.__drizzle_migrations rows: 20
-> A/tables: 36 built / 36 declared — IDENTICAL
-> A/columns: 293 built / 293 declared — IDENTICAL
-> A/indexes: 41 / 41 snapshot index names present (81 indexes in total) — IDENTICAL
-> reference: DATABASE_URL -> localhost:5433/pipelite (36 public tables)
-> B/reference equivalence against pipelite:
   dimension    reference  from-zero  verdict
   tables              36         36  IDENTICAL
   columns            293        293  IDENTICAL
   indexes             81         81  IDENTICAL
   constraints         83         83  IDENTICAL
   enums                9          9  IDENTICAL
   functions           38         38  IDENTICAL
   extensions           3          3  IDENTICAL
   triggers             0          0  IDENTICAL
   sequences            0          0  IDENTICAL
   views                0          0  IDENTICAL
-> removed pipelite_migchk_3742599_1787629753412
OK: the migration chain builds a complete schema from zero
EXIT=0
```

The spinner frames were collapsed to one for readability; nothing else is edited. The research figures (36/293/81/83/9/38/3/0/0/0) were treated as claims to re-measure, not as literals to assert, and they hold.

## Fence proof — the V5 identifier control

`const scratchName = "pipelite"` hardcoded in place of the generated name, then run. Observed:

```
$ docker exec pipelite-postgres-1 psql -U pipelite -d pipelite -tAc "select count(*) from information_schema.tables where table_schema='public'"
36

$ npm run db:check-migrations

> pipelite@0.1.0 db:check-migrations
> node scripts/migrate-from-zero.mjs

FATAL: refusing to touch "pipelite": a scratch database name must match /^pipelite_migchk_[a-z0-9_]+$/. This script provisions throwaway databases and nothing else.
EXIT=1

$ docker exec pipelite-postgres-1 psql -U pipelite -d postgres -tAc "select datname from pg_database order by 1"
pipelite
pipelite_dedup_test
postgres
template0
template1

$ docker exec pipelite-postgres-1 psql -U pipelite -d pipelite -tAc "select count(*) from information_schema.tables where table_schema='public'"
36
```

**No `DROP DATABASE` was issued and no connection was even opened** — `assertScratchName` runs immediately after the name is computed and before `connect()`, so the fatal is thrown outside the `try` that owns the create/DROP pair. The development database is intact with all 36 tables.

**Fence 2 was proved independently**, because fence 1 shadows it for the name `pipelite`. The scratch name was hardcoded to `pipelite_migchk_fenceproof` (which passes the pattern) and `REFERENCE_DATABASE_URL` was pointed at a database of that same name:

```
FATAL: refusing to touch "pipelite_migchk_fenceproof": it is the reference database, which this script only ever reads with SELECT.
EXIT=1
```

## Negative Controls

Both controls were run against a clean tree at `fbd7fda`, invoking `node scripts/migrate-from-zero.mjs` directly rather than through `npm run`. That is deliberate: `npm run` relays the child's stdout and stderr over two separate pipes and interleaves them non-deterministically, which moved the `42P01` block to the end of the capture. Run directly, the diagnosis appears exactly where the operator sees it. ANSI colour codes were stripped; nothing else is edited, and the long enumerations are shown as the script itself capped them.

### NC-1 — the loud class: delete the `CREATE TABLE "import_sessions"` block

```
$ git diff --stat drizzle/
 drizzle/0006_import-sessions-user-id.sql | 9 ---------
 1 file changed, 9 deletions(-)

$ node scripts/migrate-from-zero.mjs
-> connection: localhost:5433/pipelite (from .env)
-> scratch database: pipelite_migchk_3751497_1787629900352
-> reference database (read with SELECT only): pipelite
-> snapshot reference: drizzle/meta/0019_snapshot.json — 36 tables, 293 table.column pairs, 41 declared index names, 20 journal entries
-> created pipelite_migchk_3751497_1787629900352
-> running `drizzle-kit migrate` against the scratch database — output verbatim:
No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/pedro/programming/pipelite/drizzle.config.ts'
Using 'postgres' driver for database querying
[⣷] applying migrations...DrizzleQueryError: Failed query:
ALTER TABLE "import_sessions" ADD COLUMN "user_id" text;
params:
    at PostgresJsPreparedQuery.queryWithCache (/home/pedro/programming/pipelite/node_modules/src/pg-core/session.ts:73:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async <anonymous> (/home/pedro/programming/pipelite/node_modules/src/pg-core/dialect.ts:102:7)
    at async scope (file:///home/pedro/programming/pipelite/node_modules/postgres/src/index.js:260:18)
    at async sql.begin (file:///home/pedro/programming/pipelite/node_modules/postgres/src/index.js:243:14)
    at async PgDialect.migrate (/home/pedro/programming/pipelite/node_modules/src/pg-core/dialect.ts:95:3)
    at async migrate (/home/pedro/programming/pipelite/node_modules/src/postgres-js/migrator.ts:10:2) {
  query: '\nALTER TABLE "import_sessions" ADD COLUMN "user_id" text;',
  params: [],
  cause: PostgresError: relation "import_sessions" does not exist
      at ErrorResponse (file:///home/pedro/programming/pipelite/node_modules/postgres/src/connection.js:815:30)
      at handle (file:///home/pedro/programming/pipelite/node_modules/postgres/src/connection.js:489:6)
      at Socket.data (file:///home/pedro/programming/pipelite/node_modules/postgres/src/connection.js:324:9)
      at Socket.emit (node:events:508:28)
      at addChunk (node:internal/streams/readable:559:12)
      at readableAddChunkPushByteMode (node:internal/streams/readable:510:3)
      at Readable.push (node:internal/streams/readable:390:5)
      at TCP.onStreamRead (node:internal/stream_base_commons:189:23) {
    severity_local: 'ERROR',
    severity: 'ERROR',
    code: '42P01',
    file: 'namespace.c',
    line: '434',
    routine: 'RangeVarGetRelidExtended'
  }
}
-> migrate exit code: 1
-> public tables: 0 | drizzle schema tables: 1 | drizzle.__drizzle_migrations rows: 0
-> A/tables: 0 built / 36 declared — DIFFERS
-> A/columns: 0 built / 293 declared — DIFFERS
-> A/indexes: 0 / 41 snapshot index names present (0 indexes in total) — DIFFERS
-> reference: DATABASE_URL -> localhost:5433/pipelite (36 public tables)
-> B/reference equivalence against pipelite:
   dimension    reference  from-zero  verdict
   tables              36          0  DIFFERS
   columns            293          0  DIFFERS
   indexes             81          0  DIFFERS
   constraints         83          0  DIFFERS
   enums                9          0  DIFFERS
   functions           38          0  DIFFERS
   extensions           3          1  DIFFERS
   triggers             0          0  IDENTICAL
   sequences            0          0  IDENTICAL
   views                0          0  IDENTICAL
-> removed pipelite_migchk_3751497_1787629900352

FATAL: the migration chain does not create 36 table(s) the snapshot declares: accounts, activities, activity_types, api_keys, app_settings, audit_log, custom_field_definitions, deal_assignees, deal_stage_history, deals, dedup_scans, digest_log, domain_whitelist, duplicate_pairs, http_templates, import_sessions, notes, notification_preferences, organizations, people, pipeline_visibility, pipelines, rejected_signups, saved_view_defaults, saved_views, sessions, stages, user_invites, users, verification_tokens, webhook_deliveries, webhooks, workflow_run_steps, workflow_runs, workflow_templates, workflows. A from-zero install is short these tables; application code touching them raises 42P01 at runtime, behind a migrate that may well have exited 0.
FATAL: 293 table.column pair(s) the snapshot declares are absent from the built database:
      absent: accounts.access_token
      … [18 more shown] …
      … and 273 more
FATAL: 41 index name(s) the snapshot declares are absent from the built database: activities_deal_id_idx, … , workflows_created_by_idx
FATAL: catalog dimension "tables" differs between pipelite and the migration-built database — 36 only in pipelite, 0 only in the built database:
      only in pipelite: accounts
      … [18 more shown] …
      … and 16 more
FATAL: catalog dimension "columns" differs between pipelite and the migration-built database — 293 only in pipelite, 0 only in the built database:
      only in pipelite: accounts|access_token|text|-|-|YES|-|NEVER|-
      … and 273 more
FATAL: catalog dimension "indexes" differs between pipelite and the migration-built database — 81 only in pipelite, 0 only in the built database:
      … and 61 more
FATAL: catalog dimension "constraints" differs between pipelite and the migration-built database — 83 only in pipelite, 0 only in the built database:
      … and 63 more
FATAL: catalog dimension "enums" differs between pipelite and the migration-built database — 9 only in pipelite, 0 only in the built database:
      only in pipelite: stage_type=lost
      only in pipelite: stage_type=open
      only in pipelite: stage_type=won
      only in pipelite: user_role=admin
      only in pipelite: user_role=member
      only in pipelite: user_status=approved
      only in pipelite: user_status=pending_approval
      only in pipelite: user_status=pending_verification
      only in pipelite: user_status=rejected
FATAL: catalog dimension "functions" differs between pipelite and the migration-built database — 38 only in pipelite, 0 only in the built database:
      only in pipelite: dedup_norm_org|text
      … and 18 more
FATAL: catalog dimension "extensions" differs between pipelite and the migration-built database — 2 only in pipelite, 0 only in the built database:
      only in pipelite: pg_trgm
      only in pipelite: unaccent

FATAL: the migration chain does NOT build the schema this repository declares (10 problem(s) above). Note that the child migrate's exit code is reported above and is deliberately NOT what this verdict is based on — a chain missing a table nothing else references exits 0 and still ships a broken install.

CHECK_EXIT=1
```

**Every clause of NC-1's acceptance criteria is met:**

- the script's own exit code is **1**
- the child migrate's exit code is reported as **1** (`-> migrate exit code: 1`)
- the literal `42P01` and the literal `import_sessions` both reach the terminal — stderr was not swallowed
- the post-failure state is reported as **`public tables: 0`** with **`drizzle schema tables: 1`** and **`drizzle.__drizzle_migrations rows: 0`**. The `public` qualifier is intact and was not "fixed" to tolerate the surviving ledger table; `__drizzle_migrations` is reported through `pg_class`/`pg_namespace` as a separate diagnostic so the two can never be confused.

Leak check and restore:

```
$ docker exec pipelite-postgres-1 psql -U pipelite -d postgres -tAc "select datname from pg_database where datname like 'pipelite_migchk%'"
(empty)
$ git checkout -- drizzle/0006_import-sessions-user-id.sql
$ git status --porcelain drizzle/
(empty)
$ node scripts/migrate-from-zero.mjs
… OK: the migration chain builds a complete schema from zero
EXIT=0
```

The `finally` fired on the failing path — that is the second thing NC-1 proves.

### NC-2 — the silent class. THIS IS THE ONE THAT MATTERS

`CREATE TABLE "webhook_deliveries"` **and** its `CREATE INDEX "webhook_deliveries_status_next_attempt_idx"` removed, leaving everything else intact:

```
$ cat -n drizzle/0006_import-sessions-user-id.sql
     1  CREATE TABLE "import_sessions" (
     2          "id" text PRIMARY KEY NOT NULL,
     3          "status" text DEFAULT 'idle' NOT NULL,
     4          "progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
     5          "cancelled" boolean DEFAULT false NOT NULL,
     6          "created_at" timestamp DEFAULT now() NOT NULL,
     7          "updated_at" timestamp DEFAULT now() NOT NULL
     8  );
     9  --> statement-breakpoint
    10  ALTER TABLE "import_sessions" ADD COLUMN "user_id" text;--> statement-breakpoint
    11  ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

$ node scripts/migrate-from-zero.mjs
-> connection: localhost:5433/pipelite (from .env)
-> scratch database: pipelite_migchk_3752729_1787629919019
-> reference database (read with SELECT only): pipelite
-> snapshot reference: drizzle/meta/0019_snapshot.json — 36 tables, 293 table.column pairs, 41 declared index names, 20 journal entries
-> created pipelite_migchk_3752729_1787629919019
-> running `drizzle-kit migrate` against the scratch database — output verbatim:
No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/pedro/programming/pipelite/drizzle.config.ts'
Using 'postgres' driver for database querying
[⣷] applying migrations...[✓] migrations applied successfully!
-> migrate exit code: 0
-> public tables: 35 | drizzle schema tables: 1 | drizzle.__drizzle_migrations rows: 20
-> A/tables: 35 built / 36 declared — DIFFERS
-> A/columns: 283 built / 293 declared — DIFFERS
-> A/indexes: 40 / 41 snapshot index names present (79 indexes in total) — DIFFERS
-> reference: DATABASE_URL -> localhost:5433/pipelite (36 public tables)
-> B/reference equivalence against pipelite:
   dimension    reference  from-zero  verdict
   tables              36         35  DIFFERS
   columns            293        283  DIFFERS
   indexes             81         79  DIFFERS
   constraints         83         82  DIFFERS
   enums                9          9  IDENTICAL
   functions           38         38  IDENTICAL
   extensions           3          3  IDENTICAL
   triggers             0          0  IDENTICAL
   sequences            0          0  IDENTICAL
   views                0          0  IDENTICAL
-> removed pipelite_migchk_3752729_1787629919019

FATAL: the migration chain does not create 1 table(s) the snapshot declares: webhook_deliveries. A from-zero install is short these tables; application code touching them raises 42P01 at runtime, behind a migrate that may well have exited 0.
FATAL: 10 table.column pair(s) the snapshot declares are absent from the built database:
      absent: webhook_deliveries.created_at
      absent: webhook_deliveries.http_status
      absent: webhook_deliveries.id
      absent: webhook_deliveries.next_attempt_at
      absent: webhook_deliveries.payload
      absent: webhook_deliveries.response_body
      absent: webhook_deliveries.retry_count
      absent: webhook_deliveries.status
      absent: webhook_deliveries.updated_at
      absent: webhook_deliveries.webhook_id
FATAL: 1 index name(s) the snapshot declares are absent from the built database: webhook_deliveries_status_next_attempt_idx
FATAL: catalog dimension "tables" differs between pipelite and the migration-built database — 1 only in pipelite, 0 only in the built database:
      only in pipelite: webhook_deliveries
FATAL: catalog dimension "columns" differs between pipelite and the migration-built database — 10 only in pipelite, 0 only in the built database:
      only in pipelite: webhook_deliveries|created_at|timestamp without time zone|-|-|NO|now()|NEVER|-
      only in pipelite: webhook_deliveries|http_status|integer|-|32|YES|-|NEVER|-
      only in pipelite: webhook_deliveries|id|text|-|-|NO|-|NEVER|-
      only in pipelite: webhook_deliveries|next_attempt_at|timestamp without time zone|-|-|YES|-|NEVER|-
      only in pipelite: webhook_deliveries|payload|jsonb|-|-|NO|-|NEVER|-
      only in pipelite: webhook_deliveries|response_body|text|-|-|YES|-|NEVER|-
      only in pipelite: webhook_deliveries|retry_count|integer|-|32|NO|0|NEVER|-
      only in pipelite: webhook_deliveries|status|text|-|-|NO|'pending'::text|NEVER|-
      only in pipelite: webhook_deliveries|updated_at|timestamp without time zone|-|-|NO|now()|NEVER|-
      only in pipelite: webhook_deliveries|webhook_id|text|-|-|NO|-|NEVER|-
FATAL: catalog dimension "indexes" differs between pipelite and the migration-built database — 2 only in pipelite, 0 only in the built database:
      only in pipelite: webhook_deliveries_pkey :: CREATE UNIQUE INDEX webhook_deliveries_pkey ON public.webhook_deliveries USING btree (id)
      only in pipelite: webhook_deliveries_status_next_attempt_idx :: CREATE INDEX webhook_deliveries_status_next_attempt_idx ON public.webhook_deliveries USING btree (status, next_attempt_at)
FATAL: catalog dimension "constraints" differs between pipelite and the migration-built database — 1 only in pipelite, 0 only in the built database:
      only in pipelite: webhook_deliveries|webhook_deliveries_pkey|PRIMARY KEY (id)

FATAL: the migration chain does NOT build the schema this repository declares (7 problem(s) above). Note that the child migrate's exit code is reported above and is deliberately NOT what this verdict is based on — a chain missing a table nothing else references exits 0 and still ships a broken install.

CHECK_EXIT=1
```

**THE TWO NUMBERS THIS CONTROL EXISTS FOR:**

| | value |
|---|---|
| spawned `drizzle-kit migrate` **EXIT CODE** | **0** |
| `db:check-migrations` **EXIT CODE** | **1** |

The child not only exited 0, it printed `[✓] migrations applied successfully!` and wrote **20** rows into `drizzle.__drizzle_migrations` — a complete, successful, fully-recorded run of all twenty migrations. Every gate this repository could have built on an exit code, on a success-line grep, or on a ledger-row count passes here. This one does not: it counts 35 public tables against the snapshot's 36 and names the missing one.

**Runtime blast radius, restated because "migrate succeeded" is exactly the signal that let this defect ship:** `src/lib/api/webhooks/deliver.ts:61` does `db.insert(webhookDeliveries)`. On a migration-built install in this state every single webhook delivery raises `42P01` at runtime, behind a green migrate and a green deploy.

Leak check and restore:

```
$ docker exec pipelite-postgres-1 psql -U pipelite -d postgres -tAc "select datname from pg_database where datname like 'pipelite_migchk%'"
(empty)
$ git checkout -- drizzle/0006_import-sessions-user-id.sql
$ git status --porcelain drizzle/
(empty)
$ node scripts/migrate-from-zero.mjs
…
   tables              36         36  IDENTICAL
   columns            293        293  IDENTICAL
   indexes             81         81  IDENTICAL
   constraints         83         83  IDENTICAL
   enums                9          9  IDENTICAL
   functions           38         38  IDENTICAL
   extensions           3          3  IDENTICAL
   triggers             0          0  IDENTICAL
   sequences            0          0  IDENTICAL
   views                0          0  IDENTICAL
-> removed pipelite_migchk_3753412_1787629929764
OK: the migration chain builds a complete schema from zero
EXIT=0

$ git status --porcelain
(empty)
$ git log --oneline -2
fbd7fda fix(46-04): cap the per-dimension diff report so the diagnosis stays visible
a83500d feat(46-04): add the from-zero migration check
```

Task 2 produced no commit, as designed.

## Scratch-database hygiene

`pipelite_migchk%` was checked after the nominal run, after `--require-reference`, after both fence proofs, after all five reference-branch runs, after a SIGINT-interrupted run and after both negative controls. It was **EMPTY every time**.

The interrupt proof, in full — SIGINT delivered one second in, while `drizzle-kit migrate` was still running:

```
$ timeout -s INT 1 node scripts/migrate-from-zero.mjs
-> scratch database: pipelite_migchk_3720889_1787629410956
-> created pipelite_migchk_3720889_1787629410956
-> running `drizzle-kit migrate` against the scratch database — output verbatim:
No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/pedro/programming/pipelite/drizzle.config.ts'
Using 'postgres' driver for database querying

-> SIGINT received — removing the scratch database before exiting
-> migrate exit code: -1 (SIGINT)
-> removed pipelite_migchk_3720889_1787629410956
FATAL: interrupted — abandoning the run, the scratch database goes with it
```

**Surviving database list at the end of this plan** — identical to the list before it started:

```
$ docker exec pipelite-postgres-1 psql -U pipelite -d postgres -tAc "select datname from pg_database order by 1"
pipelite
pipelite_dedup_test
postgres
template0
template1
```

## Reference-resolution ladder, all branches exercised

| Branch | Condition | Observed |
|---|---|---|
| 1 | `REFERENCE_DATABASE_URL` set | used as the reference; also the vehicle for the fence-2 proof |
| 3 | candidate database does not exist | `SKIPPED: reference equivalence — database pipelite_no_such_db does not exist`, exit **0**; with `--require-reference`, **FATAL exit 1** |
| 4 | candidate exists with **0** public tables (the CI shape) | `SKIPPED: reference equivalence — postgres has 0 public tables, so it is not a populated reference (this is the expected state in CI)`, exit **0**; with `--require-reference`, **FATAL exit 1** |
| 5 | candidate exists with **1** of 36 public tables | **FATAL exit 1** with no `--require-reference` given: *"That is a partially-populated database, not an absent one, and this script will not pretend it is missing."* |
| 6 | candidate has ≥ 36 public tables | ten dimensions run, all IDENTICAL |

Branch 4 is what plan 46-05's CI job will take, and assertion set A stays authoritative there — the CI run still asserts 36 tables, 293 table.column pairs and 41 index names against the snapshot. That is the whole reason set A is unconditional.

## Decisions Made

1. **The child's exit code is recorded and never branched on.** NC-2 is the evidence: an exit-code-shaped check is vacuous for the silent class *by construction*, and the check must reach the catalog even after a failed migrate — which is also how NC-1 gets to report the honest `public tables: 0`.
2. **Assertion set A is unconditional and set B is conditional**, not the other way around. CI has no reference database; a gate whose only teeth are in set B would be permanently skipped there, which is a vacuous gate wearing a skip line as a disguise.
3. **A partially-populated reference is FATAL with or without `--require-reference`.** Branches 3 and 4 describe *absence*; branch 5 describes *misconfiguration*. Letting a misconfiguration take the absence path is precisely how a skip becomes a silent pass.
4. **`ordinal_position` is absent from the code, and the only mention of it is on `//` comment lines** explaining why it must stay absent. Prose alone would not survive the first executor who sees ~12 `activities`/`deals` differences and starts weakening things.
5. **`DROP DATABASE … WITH (FORCE)`** (PostgreSQL 16.13 in `pipelite-postgres-1`). Without `FORCE`, a killed migrate's still-open connection blocks the cleanup and the interrupted-run case leaks exactly the database the `finally` exists to remove.
6. **Signal handlers rather than bare `finally`.** Node's default SIGINT handling terminates the process before any `finally` runs, so the `finally` alone would not have survived an operator's Ctrl-C. This is why the interrupt case is a recorded observation and not an argument.
7. **Reserved-name deny list beyond `pipelite`.** `postgres`, `template0` and `template1` are also refused. The pattern already excludes them; the list is there so the refusal reads as intentional to the next editor.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `no-console` made `npm run lint` fail with 16 errors**

- **Found during:** Task 1, at the first lint run
- **Issue:** `eslint.config.mjs:38` sets `"no-console": "error"` repo-wide (phase 42 / OBS-01). A terminal-facing operational script is nothing but console output, so the new file produced 16 errors against a 0-error baseline — the plan's own acceptance criterion.
- **Fix:** Added `"scripts/**"` to the **existing** "NON-APPLICATION SURFACES" exemption's glob list rather than creating a third override block, and extended that block's comment to name `scripts/**` and state why (an operator-facing CLI outside `src/`, same category as the `drizzle/**` seed script; its output *is* its interface, and there is no logger to bypass because it never runs inside the server). A third block would have broken the phase-42 acceptance gate that counts the override key and expects **2** — verified still 2 after the edit. The comment was worded to avoid reproducing that token, per the standing house rule.
- **Files modified:** `eslint.config.mjs`
- **Verification:** `npm run lint` → **124 problems, 0 errors** (the main-tree baseline); override-key count still 2.
- **Committed in:** `a83500d`

**2. [Rule 1 - Bug] The uncapped failure report was 52KB and buried the diagnosis**

- **Found during:** Task 2, on the first NC-1 run
- **Issue:** When the chain aborts, *every* catalog dimension differs by its entire contents at once — 293 columns, 83 constraints, 81 indexes, 38 functions. The report enumerated all of them in both directions, producing 52KB of derived noise in which the child's `42P01` — the one line that actually diagnoses the run — was unfindable. A diagnostic nobody can read is a diagnostic nobody uses.
- **Fix:** Capped the enumeration at 20 values per direction with an `… and N more` tail. The **count is always stated in full**, and differences are still reported **by name** in both directions, so the plan's "never as a count" requirement is strengthened rather than weakened: it now states both the count and a named sample.
- **Files modified:** `scripts/migrate-from-zero.mjs`
- **Verification:** NC-1 re-run against the capped gate is legible end to end (reproduced above); NC-2's report is under the cap and therefore complete and unabridged.
- **Committed in:** `fbd7fda` — a separate `fix(46-04)` commit rather than an amend, so that history is not rewritten. Both recorded negative controls were then run against this final gate, which is why `git log --oneline -1` points at `fbd7fda` rather than at task 1's commit. Task 2 itself still produced no commit, which is what that criterion protects.

### Deliberate additions beyond the plan

**3. [Rule 2 - Missing critical] SIGINT/SIGTERM handling, without which the interrupt criterion could not be met**

- **Found during:** Task 1, preparing the acceptance criterion "run it again after deliberately interrupting a run mid-flight to prove the `finally` fires"
- **Issue:** A `finally` does **not** fire on SIGINT. Node's default handler terminates the process immediately, so an operator's Ctrl-C during the ~3s migrate would have leaked a fully-built 36-table database every time. The criterion as written could not have been satisfied by the plan's design.
- **Fix:** Handlers for SIGINT and SIGTERM that kill the child, set an `interrupted` flag, and let the `finally` run; a second signal exits immediately. Cleanup uses `WITH (FORCE)` so the killed child's connection cannot block the removal, and the final verdict refuses to print `OK` when the run was interrupted.
- **Files modified:** `scripts/migrate-from-zero.mjs`
- **Verification:** `timeout -s INT 1` mid-migrate → child killed, `removed pipelite_migchk_…`, `FATAL: interrupted`, `pipelite_migchk%` list empty. Reproduced above.
- **Committed in:** `a83500d`

**4. [Rule 2 - Missing critical] Fence 2 proved independently, and branches 3/4/5 exercised**

- **Found during:** Task 1
- **Issue:** The plan's fence proof hardcodes the name to `pipelite`, which fence **1** (the pattern) rejects first — so fence 2 (`name !== REFERENCE_DB`) would have shipped never having been observed. Likewise, the seven-branch reference ladder is where "this must never become a silent pass" actually lives, and none of its branches were in the acceptance criteria.
- **Fix:** Ran a second fence proof with a pattern-valid name equal to the reference name, and exercised branches 3, 4 and 5 (each with and without `--require-reference` where applicable). All recorded above.
- **Files modified:** none
- **Verification:** see the ladder table; five FATALs and two SKIPs observed, each with its own message.
- **Committed in:** n/a — observations only

---

**Total deviations:** 4 (1 Rule-3 blocking, 1 Rule-1 bug, 2 Rule-2 additions)
**Impact on plan:** No scope creep. One eslint-config line was the price of a terminal-facing script in a `no-console` repo; the other three make the gate legible, interrupt-safe, and actually observed at every fence and branch it claims to have.

## Issues Encountered

- **`npm run` reorders a child's stdout and stderr.** The first NC-1 capture through `npm run db:check-migrations > file 2>&1` placed the entire `42P01` block *after* the final `-> removed …` line, because npm relays the script's two streams over separate pipes. Invoking `node scripts/migrate-from-zero.mjs` directly preserves the interleaving. Worth knowing for anyone reproducing these controls, and worth knowing for plan 46-05's CI job: the exit code is unaffected either way, but the log ordering is not.
- **`grep … | wc -l` remains unreliable here** (recorded in 46-01). Every count in this SUMMARY was recomputed with `node` reading the file directly, including the `ordinal_position`, `table_schema` and destructive-token acceptance greps.
- **The `pipelite_partialref` database created for the branch-5 proof was removed** in the same command that created it; the final database list above confirms it.

## Known Stubs

None. Every code path in the script is reachable and each was observed: the nominal path, both fences, all reference branches, the interrupt path, and both negative controls.

## Threat Flags

None. This plan opened no network endpoint, added no dependency, and touched no auth or file-access path. Its one trust boundary — DDL against the shared cluster — is dispositioned `mitigate` in the plan's register (T-46-04-01 … 05) and each mitigation was **observed** rather than reasoned about: the identifier fences by two deliberate FATALs, the credential rule by the connection string never appearing on any argv or in any log line (only `host:port/db`), the cleanup guarantee by an empty `pipelite_migchk%` list after every one of a dozen runs including an interrupted one, and the stderr rule by NC-1's verbatim `42P01`.

## User Setup Required

None. `npm run db:check-migrations` works from the repository root with no inline `DATABASE_URL` prefix — which is itself a second, independent proof of DEPLOY-02.

## Next Phase Readiness

- **Plan 46-05 (CI wiring) is unblocked.** The script exits 0/1 cleanly, needs no `psql`, no `pg_dump` and no Docker, and takes branch 4 (`SKIPPED … 0 public tables … expected state in CI`) when a workflow's Postgres service hands it the `postgres` maintenance database — with assertion set A still fully authoritative there.
- **46-05's destructive-statement scan will pass as written.** No line in `scripts/migrate-from-zero.mjs` carrying a `drop`/`truncate`/`delete` token mentions `REFERENCE_DB` (verified: 0). The reference database name is held in a constant of exactly that name, as the plan specified, so the line-oriented scan has something to key on.
- **Plan 46-06 (container boot / SC-2) inherits a proven claim:** a database built by the chain alone is catalog-identical to the running deployment's, including the four `GENERATED ALWAYS` columns, the three dedup functions and all three extensions.
- **Deferred, unchanged:** converting `scripts/dedup-db-test-setup.sh` to build from the repaired chain. Its header (reconciled in 46-01) already points at `npm run db:check-migrations` as the behavioural proof, and that command now exists.

## Self-Check: PASSED

Files claimed created/modified, verified present on disk:

- `scripts/migrate-from-zero.mjs` — FOUND (772 lines)
- `package.json` — FOUND, `db:check-migrations` → `node scripts/migrate-from-zero.mjs`
- `eslint.config.mjs` — FOUND, `scripts/**` present, override-key count 2
- `drizzle/0006_import-sessions-user-id.sql` — FOUND, restored, `git status --porcelain` empty

Commits claimed, verified in `git log`:

- `a83500d` — FOUND (`feat(46-04): add the from-zero migration check`)
- `fbd7fda` — FOUND (`fix(46-04): cap the per-dimension diff report so the diagnosis stays visible`)

No missing items.

---
*Phase: 46-migration-chain-toolchain-floor*
*Completed: 2026-08-25*
