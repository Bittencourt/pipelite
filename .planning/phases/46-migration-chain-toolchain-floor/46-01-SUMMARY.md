---
phase: 46-migration-chain-toolchain-floor
plan: 01
subsystem: database
tags: [drizzle, drizzle-kit, postgres, migrations, vitest, static-gate, ddl]

# Dependency graph
requires:
  - phase: 33-index-generation-rule
    provides: "the 'never hand-write index SQL into a migration' rule, whose scope this plan had to establish it does not violate"
  - phase: 39-db-test-isolation
    provides: "scripts/dedup-db-test-setup.sh, the pg_dump --schema-only workaround whose stated rationale this plan reconciles"
provides:
  - "GATE A: src/lib/__tests__/migration-chain-integrity.test.ts — a DB-free static gate proving every table the final drizzle snapshot declares is created by some migration, and that nothing touches a table before its CREATE TABLE in journal order"
  - "A repaired drizzle/0006_import-sessions-user-id.sql that creates import_sessions and webhook_deliveries; the chain now emits 36 CREATE TABLE statements against a 36-table snapshot"
  - "A reconciled scripts/dedup-db-test-setup.sh header that no longer asserts the chain cannot replay"
  - "Verified-safe PREPEND precedent for editing an already-applied migration (drizzle skips by timestamp, never by hash)"
affects: [46-04-migrate-from-zero, 46-06-container-boot, any phase needing a clean database built from the chain]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static chain-integrity gate: journal-ordered SQL walk diffed against the tail snapshot"
    - "Local stripSqlComments (SQL `--` and `/* */`) proved by fixture in both directions"
    - "Matcher self-test + three MIN_* floors + named-tag enumeration as layered anti-vacuity"

key-files:
  created:
    - src/lib/__tests__/migration-chain-integrity.test.ts
  modified:
    - drizzle/0006_import-sessions-user-id.sql
    - scripts/dedup-db-test-setup.sh

key-decisions:
  - "Repaired 0006 by PREPEND, not renumber — PgDialect.migrate skips on `last.created_at < entry.when` and never compares the stored hash, so editing an already-applied file is invisible to the live database"
  - "user_id deliberately absent from CREATE TABLE import_sessions; the two original trailing ALTERs add it, reproducing the live database's physical column order"
  - "Restoring the webhook_deliveries index does NOT violate the Phase 33 rule — the index is declared in src/db/schema/webhook-deliveries.ts AND recorded in drizzle/meta/0006_snapshot.json, so it reproduces generated output"
  - "The gate's primary assertion is a snapshot-set difference, not an exit code, because the webhook_deliveries class produces a migrate that exits 0"
  - "SQL comments stripped locally rather than via the house readStrippedSource helper, which does not understand `--`"

patterns-established:
  - "Chain-integrity gate: parse _journal.json, walk drizzle/<tag>.sql in idx order maintaining a running created-set, diff against Object.values(tail snapshot .tables).map(t => t.name)"
  - "Anti-vacuity in three layers, all asserted before the scans they protect: fixture-proved matchers, MIN_* floors carrying their measured number, and required tags named individually"

requirements-completed: [DEPLOY-01]

# Metrics
duration: 22min
completed: 2026-08-25
---

# Phase 46 Plan 01: Migration Chain Repair Summary

**A DB-free static gate that catches both the loud (`42P01`) and the silent (migrate exits 0 at 35-vs-36 tables) classes of missing-table defect, written and observed RED first, then the PREPEND repair to `drizzle/0006` that turns it green and brings the chain to 36 `CREATE TABLE` statements.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-25T03:00:24Z
- **Completed:** 2026-08-25T03:22:41Z
- **Tasks:** 3 (2 committed, 1 negative control producing no commit by design)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- **GATE A exists and can fail.** `src/lib/__tests__/migration-chain-integrity.test.ts` (550 lines) sits in the base vitest project — the one CI runs — and was observed red against the unfixed chain before any repair was made.
- **Both missing tables restored.** `drizzle/0006_import-sessions-user-id.sql` grew from 2 lines to 25 by pure prepend; the chain now emits **36** `CREATE TABLE` statements against a 36-table tail snapshot (34 before).
- **`drizzle-kit generate` is still a no-op** — "No schema changes, nothing to migrate 😴", `git status --porcelain drizzle/` empty. That is the proof the restored DDL is *right* rather than merely plausible.
- **NC-5 discharged three times**, including the pure silent-class control where only the snapshot-set assertion goes red and the ordering assertion stays green — the observation that proves the gate is stronger than an exit code.
- **The dedup script's stale prose is gone** in the same commit as the repair, so the repo no longer carries a measured-sounding claim that a fixed defect is current.

## Task Commits

1. **Task 1: Write GATE A and observe it RED against the unfixed chain** — `e478f97` (test)
2. **Task 2: Repair the chain by PREPEND + reconcile the dedup script comment** — `a9db389` (fix)
3. **Task 3: NC-5 negative control** — no commit by design; tree left clean at `a9db389`

## Files Created/Modified

- `src/lib/__tests__/migration-chain-integrity.test.ts` (created, 550 lines) — GATE A. Parses `drizzle/meta/_journal.json`, walks each `drizzle/<tag>.sql` in `idx` order, and asserts (a) every table in `drizzle/meta/0019_snapshot.json` is created by some migration, in both directions, and (b) no `ALTER TABLE X` / `REFERENCES "public"."X"` / `CREATE INDEX … ON X` appears before `X`'s `CREATE TABLE`.
- `drizzle/0006_import-sessions-user-id.sql` (modified, +23/-0) — `CREATE TABLE "import_sessions"`, `CREATE TABLE "webhook_deliveries"` and `CREATE INDEX "webhook_deliveries_status_next_attempt_idx"` prepended above the two original `ALTER`s, which are unchanged context lines in the diff.
- `scripts/dedup-db-test-setup.sh` (modified, +21/-9, comment only) — the `WHY A SCHEMA DUMP RATHER THAN drizzle-kit migrate` block rewritten.

## Verification

| Check | Result |
|---|---|
| `npx vitest run src/lib/__tests__/migration-chain-integrity.test.ts` | **PASS 28 / FAIL 0** |
| `git diff --stat HEAD~1 -- src/lib/__tests__/migration-chain-integrity.test.ts` | **empty** — the gate was not edited to make it pass |
| `CREATE TABLE` count in `drizzle/0006_…sql` | **2** |
| `ALTER TABLE` count in `drizzle/0006_…sql` | **2** |
| `user_id` inside the `CREATE TABLE "import_sessions"` body | **0** occurrences |
| `CREATE TABLE` statements across all 20 `drizzle/*.sql` | **36** (34 before) |
| `npm run db:generate` | `36 tables` … `No schema changes, nothing to migrate 😴` |
| `git status --porcelain drizzle/` after generate | **empty** |
| `npx vitest run src/lib/mutations/__tests__/db-test-isolation.test.ts` | **PASS** (all five gated literals intact, destructive scan clean) |
| `npx vitest run src/lib/__tests__/` | **PASS 86 / FAIL 0** — proves the new file is collected by the base project |
| `npm test` | **167 files passed, 2 skipped; 4633 tests passed, 32 skipped** + rsc project 2 files / 8 tests passed |
| `npm run typecheck` | **0** |
| `npm run lint` | **0 errors**, 122 warnings (unchanged worktree baseline) |
| `grep -c 'does NOT replay' scripts/dedup-db-test-setup.sh` | **0** |

## Task 1 — the verbatim RED observation

Run against the **unfixed** chain, before `drizzle/0006` was touched. Note that all 26 matcher, comment-stripping, floor and enumeration assertions **pass** in the same run — the matchers are proved even while the scans fail.

```
$ npx vitest run src/lib/__tests__/migration-chain-integrity.test.ts
Exit code 1
PASS (26) FAIL (2)

1. the chain creates every table the final snapshot declares leaves no snapshot table uncreated
   AssertionError: the final snapshot (drizzle/meta/0019_snapshot.json) declares tables that NO migration in drizzle/meta/_journal.json creates: import_sessions, webhook_deliveries. Two consequences, and only one of them is visible: a table that some migration also ALTERs or REFERENCEs aborts a from-zero `drizzle-kit migrate` with 42P01 and rolls the whole chain back to zero tables; a table nothing else touches lets migrate exit 0 and ships a database that is silently short a table until application code inserts into it. Fix the chain — add the missing CREATE TABLE to the migration that should always have carried it — never this assertion.: expected [ 'import_sessions', …(1) ] to deeply equal []
       at /home/pedro/programming/pipelite/.claude/worktrees/agent-a5d67c3e5d938cccf/src/lib/__tests__/migration-chain-integrity.test.ts:518:7

2. no migration touches a table before its CREATE TABLE has no ALTER / REFERENCES / CREATE INDEX ON ahead of the table's creation
   AssertionError: migrations touch tables that no EARLIER migration creates. drizzle-kit runs the chain in journal order inside ONE transaction, so each of these aborts a from-zero build with 42P01 and rolls every prior migration back:
   drizzle/0006_import-sessions-user-id.sql:1: [import_sessions] ALTER TABLE "import_sessions" ADD COLUMN "user_id" text;
   drizzle/0006_import-sessions-user-id.sql:2: [import_sessions] ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
   drizzle/0014_sloppy_slapstick.sql:22: [import_sessions] ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_import_session_id_import_sessions_id_fk" FOREIGN KEY ("import_session_id") REFERENCES "public"."import_sessions"("id") ON DELETE no action ON UPDATE no action;: expected [ …(3) ] to deeply equal []
       at /home/pedro/programming/pipelite/.claude/worktrees/agent-a5d67c3e5d938cccf/src/lib/__tests__/migration-chain-integrity.test.ts:548:7
```

The JSON reporter for the same run recorded `"numTotalTests":28,"numPassedTests":26,"numFailedTests":2,"success":false`.

## Negative Controls

**NC-5 — `migration-chain-integrity`: remove one `CREATE TABLE` from a migration; expect that table reported as never-created.**

Run against the **repaired** tree at `a9db389`. Three observations rather than the two the plan called for — see the deviation note below for why.

### NC-5 (a) — delete the `CREATE TABLE "webhook_deliveries"` block, leave its index

```
$ npx vitest run src/lib/__tests__/migration-chain-integrity.test.ts
Exit code 1
PASS (26) FAIL (2)

1. the chain creates every table the final snapshot declares leaves no snapshot table uncreated
   AssertionError: the final snapshot (drizzle/meta/0019_snapshot.json) declares tables that NO migration in drizzle/meta/_journal.json creates: webhook_deliveries. Two consequences, and only one of them is visible: a table that some migration also ALTERs or REFERENCEs aborts a from-zero `drizzle-kit migrate` with 42P01 and rolls the whole chain back to zero tables; a table nothing else touches lets migrate exit 0 and ships a database that is silently short a table until application code inserts into it. Fix the chain — add the missing CREATE TABLE to the migration that should always have carried it — never this assertion.: expected [ 'webhook_deliveries' ] to deeply equal []
       at /home/pedro/programming/pipelite/.claude/worktrees/agent-a5d67c3e5d938cccf/src/lib/__tests__/migration-chain-integrity.test.ts:518:7

2. no migration touches a table before its CREATE TABLE has no ALTER / REFERENCES / CREATE INDEX ON ahead of the table's creation
   AssertionError: migrations touch tables that no EARLIER migration creates. drizzle-kit runs the chain in journal order inside ONE transaction, so each of these aborts a from-zero build with 42P01 and rolls every prior migration back:
   drizzle/0006_import-sessions-user-id.sql:10: [webhook_deliveries] CREATE INDEX "webhook_deliveries_status_next_attempt_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");: expected [ Array(1) ] to deeply equal []
       at /home/pedro/programming/pipelite/.claude/worktrees/agent-a5d67c3e5d938cccf/src/lib/__tests__/migration-chain-integrity.test.ts:548:7
```

Both assertions fire. The plan predicted only the snapshot-set one, on the reasoning that nothing references `webhook_deliveries` — but the repair itself restored an index ON that table, so post-repair it *is* referenced. This is a genuine strengthening: the `CREATE INDEX … ON` arm of the ordering scan is now exercised by real chain text, which the pre-repair tree never did.

### NC-5 (a′) — the pure silent class: delete the `CREATE TABLE` block **and** its index

This reproduces the exact pre-repair state of `webhook_deliveries`: no migration creates it and **no migration references it**, so `drizzle-kit migrate` exits **0** and quietly ships 35 tables against a 36-table snapshot.

```
$ npx vitest run src/lib/__tests__/migration-chain-integrity.test.ts
Exit code 1
PASS (27) FAIL (1)

1. the chain creates every table the final snapshot declares leaves no snapshot table uncreated
   AssertionError: the final snapshot (drizzle/meta/0019_snapshot.json) declares tables that NO migration in drizzle/meta/_journal.json creates: webhook_deliveries. Two consequences, and only one of them is visible: a table that some migration also ALTERs or REFERENCEs aborts a from-zero `drizzle-kit migrate` with 42P01 and rolls the whole chain back to zero tables; a table nothing else touches lets migrate exit 0 and ships a database that is silently short a table until application code inserts into it. Fix the chain — add the missing CREATE TABLE to the migration that should always have carried it — never this assertion.: expected [ 'webhook_deliveries' ] to deeply equal []
       at /home/pedro/programming/pipelite/.claude/worktrees/agent-a5d67c3e5d938cccf/src/lib/__tests__/migration-chain-integrity.test.ts:518:7
```

**This is the load-bearing control of the whole plan.** Exactly ONE assertion is red — the snapshot-set difference. The ordering assertion is green, and a real `drizzle-kit migrate` would exit 0. Any gate built on an exit code, or on the ordering scan alone, passes here. This one does not.

Restore and re-run:

```
$ git checkout -- drizzle/0006_import-sessions-user-id.sql
$ git status --porcelain drizzle/
(empty)
$ npx vitest run src/lib/__tests__/migration-chain-integrity.test.ts
PASS (28) FAIL (0)
```

### NC-5 (b) — delete the `CREATE TABLE "import_sessions"` block (the loud class)

```
$ npx vitest run src/lib/__tests__/migration-chain-integrity.test.ts
Exit code 1
PASS (26) FAIL (2)

1. the chain creates every table the final snapshot declares leaves no snapshot table uncreated
   AssertionError: the final snapshot (drizzle/meta/0019_snapshot.json) declares tables that NO migration in drizzle/meta/_journal.json creates: import_sessions. Two consequences, and only one of them is visible: a table that some migration also ALTERs or REFERENCEs aborts a from-zero `drizzle-kit migrate` with 42P01 and rolls the whole chain back to zero tables; a table nothing else touches lets migrate exit 0 and ships a database that is silently short a table until application code inserts into it. Fix the chain — add the missing CREATE TABLE to the migration that should always have carried it — never this assertion.: expected [ 'import_sessions' ] to deeply equal []
       at /home/pedro/programming/pipelite/.claude/worktrees/agent-a5d67c3e5d938cccf/src/lib/__tests__/migration-chain-integrity.test.ts:518:7

2. no migration touches a table before its CREATE TABLE has no ALTER / REFERENCES / CREATE INDEX ON ahead of the table's creation
   AssertionError: migrations touch tables that no EARLIER migration creates. drizzle-kit runs the chain in journal order inside ONE transaction, so each of these aborts a from-zero build with 42P01 and rolls every prior migration back:
   drizzle/0006_import-sessions-user-id.sql:15: [import_sessions] ALTER TABLE "import_sessions" ADD COLUMN "user_id" text;
   drizzle/0006_import-sessions-user-id.sql:16: [import_sessions] ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
   drizzle/0014_sloppy_slapstick.sql:22: [import_sessions] ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_import_session_id_import_sessions_id_fk" FOREIGN KEY ("import_session_id") REFERENCES "public"."import_sessions"("id") ON DELETE no action ON UPDATE no action;: expected [ …(3) ] to deeply equal []
       at /home/pedro/programming/pipelite/.claude/worktrees/agent-a5d67c3e5d938cccf/src/lib/__tests__/migration-chain-integrity.test.ts:548:7
```

Red in **both** assertions, as the plan predicted, and the ordering hits carry their real `file:line` — including the cross-file one at `drizzle/0014_sloppy_slapstick.sql:22`, which proves the running created-set genuinely spans migrations rather than being reset per file.

Restore and re-run:

```
$ git checkout -- drizzle/0006_import-sessions-user-id.sql
$ git status --porcelain drizzle/
(empty)
$ npx vitest run src/lib/__tests__/migration-chain-integrity.test.ts
PASS (28) FAIL (0)

$ git status --porcelain
(empty)
$ git log --oneline -3
a9db389 fix(46-01): restore the two lost CREATE TABLEs to migration 0006
e478f97 test(46-01): add failing migration-chain-integrity gate
fd7e245 chore(46): begin phase execution
```

Task 3 produced no commit, as designed.

## Decisions Made

1. **PREPEND, not renumber.** `PgDialect.migrate` (`node_modules/drizzle-orm/pg-core/dialect.js:44-71`) skips on `last.created_at < entry.when` and never reads the stored hash back for comparison. This deployment's ledger high-water is `1787441440793`, far above `0006`'s `when` of `1774267074360`, so the edited file is unreachable on the live database. A renumber would have rewritten 14 filenames plus `_journal.json` for no benefit.
2. **`user_id` stays out of the `CREATE TABLE`.** The two original `ALTER`s add the column and its FK afterwards, reproducing the live database's physical column order (`id, status, progress, cancelled, created_at, updated_at, user_id`). Putting it in the `CREATE` would have produced a column-order divergence that plan 46-04's catalog comparison would then be tempted to weaken away.
3. **The restored index does not trip the Phase 33 rule.** That rule targets an index existing *only* in SQL, which a later `generate` then silently drops. This one is declared at `src/db/schema/webhook-deliveries.ts:20-21` and recorded in `drizzle/meta/0006_snapshot.json`, so restoring it reproduces generated output — confirmed by `db:generate` still emitting nothing.
4. **The gate reads no exit code.** Its primary assertion is a set difference between the tail snapshot and the walked `CREATE TABLE`s, because a clean exit is precisely what the `webhook_deliveries` class already produced.
5. **A local `stripSqlComments` rather than the house `readStrippedSource`.** The shared helper understands `//` and `/* */`, not SQL `--`, and the chain carries real `--` prose in `0009` and `0013`.
6. **The mirror assertion was added unprompted** — "creates no table the final snapshot does not declare". A migration creating a table the tail snapshot never learned about is the same hand-editing failure pointing the other way, and it costs one `it`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] A fixture in my own gate proved nothing**

- **Found during:** Task 1, at the first RED run
- **Issue:** The plan's `<behavior>` spec called for a fixture asserting that a line which is entirely a `--` comment containing `CREATE TABLE "ghost" (` is not counted as a create. I wrote it as `createdTable(fixture)` → `"ghost"` un-stripped, `null` stripped. The un-stripped half failed: `CREATE_TABLE_RE` is anchored `^\s*` and `--` is not whitespace, so a `--`-prefixed line can never match with or without stripping. The fixture "passed" the stripped half for a reason unrelated to stripping — a self-satisfying assertion, which is exactly the vacuity class this phase exists to eliminate.
- **Fix:** Replaced with three fixtures that isolate where stripping actually carries weight: a **block** comment for `createdTable` and for `alteredTable` (a `/* … */` block does not prefix its inner lines, so those lines reach the anchored matchers looking exactly like DDL), and a `--` line comment for `referencedTables` (the one matcher with no line anchor, so a `--` sentence merely describing a foreign key would be reported as a chain-order violation — and the chain really does carry `--` prose). Extended the file header to state that the anchors and the stripper are complementary rather than redundant, and which fixture proves which.
- **Files modified:** `src/lib/__tests__/migration-chain-integrity.test.ts`
- **Verification:** All 5 `stripSqlComments` assertions pass; the two scan assertions remained the only failures in the recorded RED run.
- **Committed in:** `e478f97` (Task 1 commit — the correction landed before the commit, so the RED output recorded above is from the corrected gate)

### Deliberate additions beyond the plan

**2. [Rule 2 — Missing critical] NC-5 run a third time, for the pure silent class**

- **Found during:** Task 3
- **Issue:** The plan's control (a) — "delete the `CREATE TABLE "webhook_deliveries"` block" — predicted "no chain-order hit for this one, which is precisely why the snapshot-set assertion is what catches the silent class". That prediction was written against the *pre-repair* tree. Post-repair, `0006` also carries `CREATE INDEX … ON "webhook_deliveries"`, so deleting only the `CREATE TABLE` leaves a reference behind and the ordering assertion fires too. Run literally, control (a) therefore does **not** demonstrate the silent class at all.
- **Fix:** Ran control (a) literally and recorded it, then ran a third control (a′) that also removes the index — reproducing the true pre-repair state where nothing creates *and* nothing references the table. That run is red in exactly one assertion, with the ordering scan green, which is the observation the plan actually wanted.
- **Files modified:** none (working tree restored after each half)
- **Verification:** `git status --porcelain` empty, gate 28/28 green, `git log --oneline -1` still `a9db389`
- **Committed in:** n/a — Task 3 produces no commit by design

---

**Total deviations:** 2 (1 Rule-1 bug in the gate's own fixture, 1 Rule-2 addition of a third negative control)
**Impact on plan:** Both strengthen the gate rather than widening scope. No production code beyond the planned three files was touched.

## Issues Encountered

- **`grep … | wc -l` is unreliable in this environment.** The `rtk` shell hook rewrites `grep` and its piped output is a filtered summary, not raw matches: `grep -h 'CREATE TABLE' drizzle/*.sql | wc -l` returned `19` for a tree that genuinely contains 36. All counts in this SUMMARY were recomputed with `node` reading the files directly. Anyone verifying this plan's numbers should do the same rather than trusting a piped `grep` count.
- **`npx drizzle-kit generate` does not work here** — the hook rewrites it to `npm run drizzle-kit generate`, which fails with `Missing script`. Used the existing `npm run db:generate` script instead, which is the same command.
- The worktree was stale (branched from `a58b9e1`, 15 commits behind), as it has been on every previous occasion. Corrected with `git merge --ff-only fd7e245` before any work.

## Known Stubs

None.

## Threat Flags

None. This plan executed no DDL, opened no network surface, added no dependency, and touched no auth or file-access path. The one trust-boundary interaction — editing an already-applied migration — was dispositioned `accept` in the plan's threat register on measured evidence (`T-46-01-01`), and that evidence was re-confirmed here: `db:generate` emitting nothing proves the restored DDL matches the snapshots the live database was actually built from.

## User Setup Required

None.

## Next Phase Readiness

- **Plan 46-04 (`scripts/migrate-from-zero.mjs`) is unblocked.** The chain now creates all 36 snapshot tables, so a from-zero `drizzle-kit migrate` should exit 0 with a complete database. RESEARCH measured exactly that against this DDL: 20 ledger rows, 36 public tables, and all ten catalog dimensions identical to the live database including the four `GENERATED ALWAYS` columns and 81/81 indexes.
- **Plan 46-04's NC-1 and NC-2 have a working template** — NC-5 (b) and NC-5 (a′) here are their static twins, and the same two edits to `drizzle/0006` produce them.
- **One caution for 46-04:** exclude `ordinal_position` from the column comparison. The `user_id` ordering decision above is what makes `import_sessions` match, but RESEARCH measured ~12 unrelated order differences on `activities` and `deals` from historical `db:push` operations.
- **Deferred, unchanged:** converting `scripts/dedup-db-test-setup.sh` to build its database from the repaired chain. Its header now says so explicitly, and `db-test-isolation.test.ts:221-229` still asserts the `--schema-only` path.

---
*Phase: 46-migration-chain-toolchain-floor*
*Completed: 2026-08-25*
