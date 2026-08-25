---
phase: 39-duplicate-detection-merge
plan: 10
subsystem: testing
tags: [dedup, merge, database-test, vitest-project, ci-isolation, constraints]
requires:
  - "src/lib/mutations/dedup.ts (39-09) — mergeRecordsMutation, the subject under test"
  - "src/lib/dedup/field-groups.ts (39-02/39-09) — MERGE_EXCLUDED_COLUMNS, asserted against the catalog"
  - "drizzle/0017_dedup_schema.sql (39-05) — the four GENERATED ALWAYS columns"
  - "scripts/dedup-checks.sql Parts 0-9 (39-03, 39-05, 39-07) — appended to, not rewritten"
  - "src/db/schema/notes.ts (Phase 35) — notes_migration_uniq, the constraint this plan exercises"
provides:
  - "src/lib/mutations/dedup.db.test.ts — the first database-backed test in the repository (39-VALIDATION V-1, SC-4)"
  - "vitest.db.config.ts + the `test:db` script — a third vitest project, opt-in only"
  - "scripts/dedup-db-test-setup.sh — an isolated pipelite_dedup_test database, provisioned from a schema dump"
  - "src/lib/mutations/__tests__/db-test-isolation.test.ts — the CI-side gate on all of the above (39-VALIDATION V-5)"
  - "scripts/dedup-checks.sql Part 10 — the tool-independent SQL proof of B4"
affects:
  - "39-15 (the calling server action inherits a merge proven against a real Postgres)"
  - "any future database-backed test — the third project and the provisioning script are the pattern"
tech-stack:
  added: []
  patterns:
    - "a third vitest project, reachable only by naming its config file on the command line"
    - "an isolated database built from `pg_dump --schema-only` of the dev database, never from the migration chain"
    - "a module-scope connection guard that refuses the development database BY NAME"
key-files:
  created:
    - src/lib/mutations/dedup.db.test.ts
    - src/lib/mutations/__tests__/db-test-isolation.test.ts
    - vitest.db.config.ts
    - scripts/dedup-db-test-setup.sh
  modified:
    - vitest.config.ts
    - package.json
    - scripts/dedup-checks.sql
decisions:
  - "the suite runs against a DEDICATED pipelite_dedup_test database, not against the development database with prefixed fixtures — the plan's stated strategy, overridden"
  - "the isolated schema comes from `pg_dump --schema-only`, because `drizzle-kit migrate` was measured NOT to replay onto an empty database (42P01 on import_sessions)"
  - "registerAuditSubscriber() is called in beforeAll, so the loser's `deleted` tombstone is proven to come from the BUS rather than assumed absent"
  - "Test 5's failure lever is a prefix-scoped BEFORE UPDATE trigger on notes, not a concurrent soft delete: only the trigger fails the merge AFTER a write has happened"
  - "Part 10 carries its own before/after count pair (10a/10f) because Part 9 re-counts notes and Part 10 writes to notes"
metrics:
  duration: ~75 min across three sessions (two interrupted by API 529s)
  tasks: 3
  files_changed: 7
  completed: 2026-08-19
---

# Phase 39 Plan 10: The Real-Database Merge Tests Summary

The repository's first database-backed test: `mergeRecordsMutation` run against a real PostgreSQL
with the real `notes_migration_uniq` in place, in a third vitest project that the required CI check
provably cannot reach — plus the same proof again in pure SQL, so B4 survives the removal of either.

## What Landed

**Task 1 — the third vitest project and the CI gate** (`9d2bb65`)

`vitest.db.config.ts` (`name: 'db'`, `include: ['src/**/*.db.test.?(c|m)[jt]s?(x)']`,
`fileParallelism: false`, 60s timeouts). `vitest.config.ts` excludes `**/*.db.test.?(c|m)[jt]s?(x)`
beside the incumbent `*.rsc.test.*` entry, in the same voice. `package.json` gains `test:db`;
`test` is untouched and `.github/workflows/ci.yml` is byte-identical.

`src/lib/mutations/__tests__/db-test-isolation.test.ts` runs in the BASE project — so in CI — and
asserts the three separation controls with **comment-blind array parsing**: both configs necessarily
spell `db.test` out in prose, so a bare `toContain("db.test")` on the raw file would pass with the
exclusion deleted. `ci.yml` is read RAW instead, deliberately, so a commented-out
`run: npm run test:db` fails the gate while it is still a comment.

**Task 2 — `dedup.db.test.ts`** (`fafc511`, then `94f761d`)

1,498 lines, 22 tests, all green. The ten behaviours the plan specifies, plus twelve more that fell
out of writing them: the no-collision half of B4 (the demotion's `EXISTS` scope), the
`superseded`-pair sweep, the `insert().values([])` skip, the pre-write `NOT_FOUND` refusal, the
`SAME_RECORD` guard, and six guard assertions.

`94f761d` is the isolation rework — see Deviation 1. The suite now runs against
`pipelite_dedup_test`, provisioned by `scripts/dedup-db-test-setup.sh`.

**Task 3 — `dedup-checks.sql` Part 10** (`5e76f63`)

Two probes against two REAL organizations selected by query and printed. Parts 0-9 untouched; the
file's own index entry for Part 10 updated from "RESERVED" to what it now does.

## Acceptance Criteria — Measured

| Gate | Result |
|------|--------|
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors** (125 pre-existing warnings, none in touched files) |
| `npm test` (both base projects) | **2579 passed / 21 skipped** (123 files), then **8 passed** (2 files) |
| `npm run test:db` | **22 passed** (1 file), against `pipelite_dedup_test` |
| `dedup-checks.sql` — occurrences of `FAIL` | **0** |
| `dedup-checks.sql` — errors on stderr | **exactly 1**, the expected 23505 |
| `git diff --stat .github/workflows/ci.yml` | **empty** — byte-identical to the phase base |

**The exclusion, proven by file count.** Base project before this plan: **122 files / 2584 tests**.
After: **123 files / 2600 tests**. The delta is exactly `db-test-isolation.test.ts` (16 tests);
`dedup.db.test.ts` exists on disk, matches the base `include` glob, and is **not** among the 123 —
which is the exclusion working. `npm run test:db` was also run before the test file existed and
reported "No test files found" with the right glob echoed, confirming the project resolved before
anything depended on it.

### Row counts — the development database is untouched

Captured before the first fixture was written and again after the final full run of everything:

| Table | Before | After |
|-------|-------:|------:|
| `organizations` | 46,054 | **46,054** |
| `people` | 38,348 | **38,348** |
| `deals` | 25,195 | **25,195** |
| `notes` | 75,236 | **75,236** |
| `duplicate_pairs` | 0 | **0** |
| `dedup_scans` | 0 | **0** |
| `audit_log` | 213 | **213** |

`audit_log` is included and matches exactly, which is stronger than Part 9a's carve-out needed to be.
`notes WHERE source='user' AND entity_type='organization'` is **0 before and 0 after** the SQL run —
the sharpest single number available, because Part 10's guarded sequence demotes a note to
`source='user'` inside the transaction it rolls back.

Nothing in this plan ever issued a `TRUNCATE`, `DROP TABLE` or `DELETE` against `pipelite`.

### The isolated database, after the suite

Row-count parity, all six tables, printed by the suite itself:

```
{"organizations":{"before":0,"after":0},"people":{"before":0,"after":0},
 "deals":{"before":0,"after":0},"notes":{"before":0,"after":0},
 "duplicate_pairs":{"before":0,"after":0},"audit_log":{"before":0,"after":0}}
```

Nineteen leftover queries, every one **0** — by id and by name for `organizations`, `people`,
`deals` and `notes`, by id and both record columns for `duplicate_pairs`, by `entity_id` and
`actor_user_id` for `audit_log`, plus `activities` and the four base rows (`users`, `pipelines`,
`stages`, `activity_types`). Zero surviving `dedupdbt-` triggers or functions.

Part 9 of `dedup-checks.sql` was **byte-identical across two consecutive full runs** (`diff` clean).

## Negative Proofs — All RUN

**1. THE ONE THAT MATTERS. Note demotion removed from `src/lib/mutations/dedup.ts`.**

Replaced the demotion `UPDATE` with `const demotedNotes: { id: string }[] = []` and re-ran. Test 1
and Test 8 both went red with a real driver error, not an assertion about one:

```
[dedup-merge] merge failed: DrizzleQueryError: Failed query: update "notes"
  set "entity_id" = $1, "updated_at" = $2
  where ("notes"."entity_type" = $3 and "notes"."entity_id" = $4) returning "id"
  cause: PostgresError: duplicate key value violates unique constraint "notes_migration_uniq"
    code: '23505',
    detail: 'Key (entity_type, entity_id)=(organization, dedupdbt-org-mt07nm9g-1) already exists.',
    table_name: 'notes',
    constraint_name: 'notes_migration_uniq',
```

```
× merges successfully, demoting the loser's migration note instead of colliding
  AssertionError: expected { success: false, error: 'FAILED' } to deeply equal { success: true, …(2) }
× reparents deals.person_id, reassigns notes, and treats organizationId as a picker field
  AssertionError: expected { success: false, error: 'FAILED' } to match object { success: true, movedChildren: 3 }
```

Worth recording: the plan predicted Test 1 would fail. **Test 8 failed too**, and that is the more
informative half — the person merge hits the same collision, so B4 is not an organization-only
problem and the mocked suite could not have told us either way. Restored; 22/22 green.

**2. The guard, pointed at a non-loopback host.** `E2E_DATABASE_URL=…@db.internal.example.com…`:

```
Error: refusing to run: connection host "db.internal.example.com" is not loopback.
src/lib/mutations/dedup.db.test.ts creates and hard-deletes fixture rows and runs only
against a local development machine.
 Test Files  1 failed (1)
      Tests  no tests
```

"no tests" is the assertion: collection aborted, no test body ran, no statement was ever sent.

**3. The guard, pointed at the DEVELOPMENT database.** Temporarily changed the config to forward
`process.env.E2E_DATABASE_URL` as `DATABASE_URL` — the exact mistake the arrangement exists to
prevent, and one that passes every host check there is:

```
Error: refusing to run: connection names database "pipelite", not "pipelite_dedup_test".
"pipelite" is the DEVELOPMENT database and holds real records; this suite hard-deletes its
fixtures and must never be pointed at it. Run `npm run test:db`, which provisions the
isolated database via scripts/dedup-db-test-setup.sh and derives the connection string for it.
 Test Files  1 failed (1)
      Tests  no tests
```

The same sabotage also turned the CI-side gate red, which is the point of having two layers:

```
× names the isolated database and DERIVES the URL rather than reusing E2E_DATABASE_URL
  AssertionError: expected 'import { defineConfig, configDefaults…'
    not to match /(?<!\w)DATABASE_URL\s*:\s*process\.env\.E2E_…/
```

**4. `test:db` chained into `test`.** Appended `&& npm run test:db` to the `test` script:

```
× the `test` script names neither the db config nor the db script
  AssertionError: expected 'vitest run && vitest run --config vit…' not to contain 'test:db'
× no other script chains the db project into a broader one
  AssertionError: script "test" reaches the db vitest project
```

**5. The lookbehind is not vacuous.** After fixing Deviation 5 the anchored regex was re-sabotaged
to confirm it still catches the real mistake — it does (proof 3's second block). A fix that made the
gate pass by making it toothless would have been worse than the bug.

## Deviations from Plan

### 1. [Rule 4 — resolved by standing instruction] The suite runs against a dedicated database, not the development one

- **Found during:** Task 2, before the first run
- **Conflict:** the plan is explicit that this file runs against the development database —
  "The database this runs against holds 46,054 organizations and 38,348 people of real data.
  Fixtures must be additive and self-cleaning" — and inherits 45-08's rule of prefixed fixtures
  hard-deleted in `afterEach`. The executor's standing shared-database instruction is equally
  explicit and stricter: *never* `TRUNCATE`, `DROP` or `DELETE FROM` any table in the `pipelite`
  development database, in a test, a setup hook or a teardown; isolate with a rolled-back
  transaction or a separately named test database. A prefixed `DELETE` is still a `DELETE`.
- **Why a rolled-back transaction is not available:** `mergeRecordsMutation` opens its own
  `db.transaction` on the module-level client. Wrapping it in an outer transaction would need
  `max: 1` on the pool, at which point drizzle's `transaction()` blocks forever waiting for the
  connection the outer `BEGIN` is holding. The only way to get an outer transaction is to mock the
  client, which is the thing this plan exists to stop doing.
- **Fix:** the second sanctioned option. `scripts/dedup-db-test-setup.sh` provisions
  `pipelite_dedup_test`; `vitest.db.config.ts` derives `DATABASE_URL` from `E2E_DATABASE_URL` by
  replacing only the database name; `assertIsolatedConnection` re-derives host and database name at
  module scope and refuses `pipelite` by name with an explanation. The fixture discipline the plan
  asked for is kept in full — prefix, `afterEach` teardown, leftover check, count parity — because
  it makes failures legible, not because the data is precious. The parity check actually got
  *stronger*: `audit_log` no longer needs Part 9a's carve-out, because nothing else writes to this
  database.
- **What is not lost:** the schema is the real schema, dumped from the real database, so
  `notes_migration_uniq`, the three `dedup_norm_*` functions and the four `GENERATED ALWAYS` columns
  are the real ones. Negative proof 1 is the evidence — a real 23505 from the real index.
- **Files:** `scripts/dedup-db-test-setup.sh`, `vitest.db.config.ts`,
  `src/lib/mutations/dedup.db.test.ts`, `src/lib/mutations/__tests__/db-test-isolation.test.ts`,
  `package.json`
- **Commit:** `94f761d`

### 2. [Rule 1 — Bug] `drizzle-kit migrate` does not replay onto an empty database

- **Found during:** Task 2, provisioning the isolated database — the obvious first attempt
- **Issue:** one of the early migrations runs
  `ALTER TABLE "import_sessions" ADD COLUMN "user_id" text` against a table no earlier migration
  creates; `import_sessions` was introduced with `db:push`. A fresh `drizzle-kit migrate` aborts:
  `PostgresError: relation "import_sessions" does not exist`, code `42P01`.
- **Fix:** `pg_dump --schema-only --no-owner --no-privileges` of the development database piped into
  the test database, entirely inside the container. More faithful as well as more robust: it carries
  the extensions, the functions, the generated columns and the partial indexes exactly as the
  running deployment has them. Recorded in the script's header with the measured error, so nobody
  "improves" it back to `migrate`.
- **Note for a future phase:** this is a latent defect in the migration chain itself. A genuinely
  fresh deployment cannot be built with `drizzle-kit migrate` today. Out of scope here; logged.
- **Commit:** `94f761d`

### 3. [Rule 1 — Bug] Resetting only `public` left drizzle's own schema behind

- **Found during:** Task 2, the SECOND run of `npm run test:db` — the first passed
- **Issue:** `DROP SCHEMA public CASCADE` does not touch the `drizzle` schema that holds migration
  bookkeeping, and the dump recreates it, so the reload failed with `schema "drizzle" already
  exists`. A once-only success would have been the worst outcome: idempotence that only holds on a
  fresh database is not idempotence.
- **Fix:** the fenced `DO` block enumerates every non-system schema from `pg_namespace` and drops
  each. A schema added by a future migration needs no edit. The `current_database()` assertion sits
  above the loop, so the widened blast radius is still confined to `pipelite_dedup_test`.
- **Commit:** `94f761d`

### 4. [Rule 1 — stale plan expectation] The loser gains `merged`, and its `deleted` row comes from the bus

- **Found during:** Task 2, writing Test 4
- **Issue:** the plan asks Test 4 to assert "the loser gains exactly one `audit_log` row with
  `action = 'deleted'`". 39-09 deliberately made the loser's in-transaction row `merged`
  (`__mergedInto` / `__mergedIntoName` / `__mergedChildren`); the `deleted` tombstone is written by
  the audit subscriber off the post-commit `crmBus.emit`, as it is for every other soft delete.
- **Fix:** both are asserted, because the pair of them *is* the decision — exactly one `merged` and
  exactly one `deleted`, never two `deleted`. Getting the second one required calling
  `registerAuditSubscriber()` in `beforeAll`: it is registered by `instrumentation.ts` in the running
  app and by nothing at import time, so a test process that omits it is silently a *weaker* model of
  production than the mocked suite. The subscriber's insert is fire-and-forget by design, so
  `mergeAsUser` polls for the tombstone after every successful merge — which also stops the teardown
  from racing an in-flight `INSERT` and leaving a row no assertion saw.
- **Commit:** `fafc511`

### 5. [Rule 1 — Bug] The new CI gate's negative regex matched the line it was meant to allow

- **Found during:** Task 2, `npm test` — 1 failed out of 2600
- **Issue:** `/DATABASE_URL\s*:\s*process\.env\.E2E_DATABASE_URL/` also matches the legitimate
  `E2E_DATABASE_URL: process.env.E2E_DATABASE_URL` forwarding line, because `DATABASE_URL` is a
  suffix of `E2E_DATABASE_URL`. The gate failed on a correct config.
- **Fix:** a `(?<!\w)` lookbehind on both the negative and its positive counterpart, with the reason
  recorded at the assertion. Then re-sabotaged to confirm the anchored form still catches the real
  mistake (negative proof 5) — the failure mode of "fixing" a false positive is a gate that no
  longer fires.
- **Commit:** `94f761d`

### 6. [Rule 2 — Missing critical coverage] Test 5 uses the trigger lever, and keeps the other one as its own test

- **Found during:** Task 2, writing Test 5
- **Issue:** the plan's preferred lever is soft-deleting the loser from a second connection between
  the pre-read and the transaction. That is caught by the merge's own `FOR UPDATE` re-read and
  throws **before any write**, so there is nothing to roll back and a non-transactional
  implementation would pass. It is not an atomicity proof.
- **Fix:** the plan's documented alternative — a `BEFORE UPDATE` trigger on `notes`, created and
  dropped inside the test — which fails the merge at step c, *after* the deal and people
  reparenting at step b. Rolling those back is the property under test. The trigger carries a
  `WHEN (old.entity_id like 'dedupdbt-%')` clause so the running app and the parallel sibling
  executor are untouched while it exists, `SET LOCAL lock_timeout` keeps the DDL from queueing
  behind them, the drop is in a `finally`, and `afterAll` asserts no `dedupdbt-` trigger or function
  survived. The concurrent-delete lever is kept as a separate test, because it proves a different
  and also real thing (the `NOT_FOUND` code for 39-UI-SPEC M-8's "one record already gone").
- **Commit:** `fafc511`

### 7. [Rule 1 — Bug] Two type errors in the first draft

- `reason: "exactName"` is not a member of `DedupReason` (`"email" | "nameIdentity" |
  "similarName" | "similarNamePhone"`). The organization certain-tier reason is `nameIdentity`.
- `auditActionCount(ids, action: string)` cannot be passed to `eq(auditLog.action, …)`, which takes
  the `AuditAction` union. Narrowed, which also means a typo like `"merge"` is now a compile error
  rather than a query that quietly counts zero.
- **Commit:** `fafc511`

### 8. [Rule 1 — Bug] Apostrophes inside psql `\echo`

- **Found during:** Task 3, reading the first run's output
- **Issue:** shell-style `'"'"'` escaping renders verbatim in psql, so the prose read
  `deployment"'"s`. psql takes the rest of a single-quoted meta-command argument literally.
- **Fix:** reworded the five affected lines to avoid apostrophes, which is what every other `\echo`
  in the 1,800-line file already does. Re-ran and confirmed zero artifacts.
- **Commit:** `5e76f63`

### 9. [Rule 3 — Blocking] Part 10 needs its own before/after pair

- **Issue:** the plan says "let Part 9's re-count prove nothing changed", but Part 10 sits **after**
  Part 9 — by Part 9's own design note, precisely because it writes to a table Part 9 counts. Part 9
  cannot cover it.
- **Fix:** 10a snapshots four counts outside any transaction and 10f re-compares them, mirroring
  Part 8's 8a/8r structure. `notes_org_user` is the load-bearing one: the guarded sequence demotes a
  note to `source='user'`, so a rollback that failed to hold shows up as +1 there even if the totals
  matched. Measured 0 → 0.
- **Commit:** `5e76f63`

### 10. Twenty-two tests rather than ten

The plan names ten behaviours. All ten are covered; twelve more assertions were added where writing
one made an adjacent gap obvious — the `EXISTS`-scoped half of the demotion (without it every merge
would silently downgrade provenance that never collided), the `superseded`-pair sweep, the
generated-column catalog cross-check against `MERGE_EXCLUDED_COLUMNS`, the empty-child-list skip,
and the guard's own six cases. Not a deviation so much as a note on the count.

## Authentication Gates

None.

## Known Stubs

None.

## Known Limitations (recorded, not defects)

- **`npm run test:db` needs Docker and rebuilds the test schema on every invocation.** ~2s of
  provisioning before a ~4s suite. Deliberate: a test database that can go stale relative to the
  development schema would eventually prove something about a schema nobody runs.
- **The migration chain cannot build a fresh database** (Deviation 2). Nothing in this phase depends
  on it, and the provisioning script routes around it, but it is a real latent defect and a good
  first task for whichever phase next needs a clean deployment.
- **`createScanState`'s running-scan guard is still read-then-write.** No test here asserts
  single-flight as a guarantee, per the carry-forward, and migration 0018 was deliberately not
  generated. The journal still ends at `idx: 17`.
- **The isolated database has no formula custom fields**, because the development database has none
  either (169 definitions, zero of type `formula`). The merge's post-commit recalculation therefore
  runs and finds nothing to do in these tests. The budget behaviour it implements is asserted in
  39-09's mocked suite, which is the right place for it.

## Threat Flags

None. Every file touched is covered by the plan's `<threat_model>`. T-39-30 ("a test mutating real
records") is now mitigated more strongly than the register anticipated: the mitigation is a separate
database rather than a careful teardown, and both the wiring and the refusal are gated by tests.

## Self-Check: PASSED

Files:
- `src/lib/mutations/dedup.db.test.ts` — FOUND
- `src/lib/mutations/__tests__/db-test-isolation.test.ts` — FOUND
- `vitest.db.config.ts` — FOUND
- `scripts/dedup-db-test-setup.sh` — FOUND
- `scripts/dedup-checks.sql` (Part 10 present, Parts 0-9 unmodified) — FOUND

Commits, all four verified in `git log`:
- `9d2bb65` — the third vitest project, gated out of CI
- `fafc511` — `dedup.db.test.ts`
- `94f761d` — the isolated database
- `5e76f63` — `dedup-checks.sql` Part 10

Not modified, as required: `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`,
`.github/workflows/ci.yml`, and every `dependencies` / `devDependencies` entry in `package.json`
(the diff is one line, in `scripts`). No `npm install` was run. `src/app/duplicates/**` untouched.
