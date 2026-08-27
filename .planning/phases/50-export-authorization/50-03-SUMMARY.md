---
phase: 50-export-authorization
plan: 03
subsystem: test-infrastructure
tags: [vitest-project, live-database, gate-falsification, unrun-tests]
requires:
  - "50-01 (src/lib/export/export-selectivity.ts on the base commit, asserted present at startup)"
provides:
  - "vitest.live.config.ts — the FOURTH vitest project: the -live glob, DATABASE_URL from .env behind a loopback fence, serial execution"
  - "npm run test:live — 28 tests over 2 files against real PostgreSQL, exit 0"
  - "ten falsified isolation cells in db-test-isolation.test.ts covering the live project"
affects:
  - "50-06 (SC-5's only behavioural proof now RUNS; the entity_type='export' counter is left at 0 for its 0 -> 1 observation)"
  - "50-07 (owns the ci.yml half; this plan deliberately asserts nothing about ci.yml)"
  - "50-08 (sign-off: the 32-skipped figure is now 4, and the arithmetic is below)"
tech-stack:
  added: []
  patterns:
    - "a fourth vitest project whose config file must be NAMED on the command line, so it cannot be invoked by accident"
    - "a loopback fence that THROWS at config load, before collection, for a project that writes"
key-files:
  created:
    - vitest.live.config.ts
  modified:
    - vitest.config.ts
    - package.json
    - vitest.db.config.ts
    - src/lib/mutations/__tests__/db-test-isolation.test.ts
    - src/lib/__tests__/suite-hook-hygiene.test.ts
    - src/lib/__tests__/suite-timing-hygiene.test.ts
    - src/lib/export/formatters-live.test.ts
    - src/lib/audit/export-events-live.test.ts
decisions:
  - "Route B confirmed by measurement, not by assumption: neither live file was renamed, and all four path-naming gates stayed green with every assertion unweakened"
  - "The `?? \"\"` in the provisioning cell is a FIX for a measured defect that falsification 1 exposed: the cell was red for the wrong reason"
  - "Both live files' own RUN IT WITH blocks were corrected, because the exclusion made their documented command exit 1"
metrics:
  duration: "~35 min"
  completed: 2026-08-27
  tasks: 2
  commits: 3
---

# Phase 50 Plan 03: The 28 Tests That Had Never Run Summary

A fourth vitest project (`npm run test:live`) supplies `DATABASE_URL` behind a loopback fence, so the
28 tests that had never executed in any project on any machine now run and pass against the real
`pipelite` database — **28 passed across 2 files, exit 0** — while the base suite's skipped count
drops from **32 to exactly 4** with its `passed` count unmoved, and ten falsified cells keep the new
project unreachable from `npm test`.

---

## 1. THE BEFORE TRANSCRIPTS

The claim "these tests now run" is meaningless without a measured "they did not". All three recorded
at base commit `3e88d6b`, from the worktree root, before any source change.

```
$ ./node_modules/.bin/vitest run src/lib/export/formatters-live.test.ts
 RUN  v4.1.11 /home/pedro/programming/pipelite/.claude/worktrees/agent-a676d2e4663fcbd70

 Test Files  1 skipped (1)
      Tests  24 skipped (24)
   Start at  11:10:04
   Duration  682ms (transform 89ms, setup 0ms, import 390ms, tests 0ms, environment 0ms)

EXIT=0
```

```
$ ./node_modules/.bin/vitest run src/lib/audit/export-events-live.test.ts
 RUN  v4.1.11 /home/pedro/programming/pipelite/.claude/worktrees/agent-a676d2e4663fcbd70

 Test Files  1 skipped (1)
      Tests  4 skipped (4)
   Start at  11:10:09
   Duration  429ms (transform 66ms, setup 0ms, import 84ms, tests 0ms, environment 0ms)
```

```
$ ./node_modules/.bin/vitest run
 Test Files  187 passed | 2 skipped (189)
      Tests  5735 passed | 32 skipped (5767)
   Start at  11:10:14
   Duration  67.32s
```

**Note on the base baseline versus the brief.** The brief said "5,735 passed / 32 skipped over 187
files". The passed/skipped test counts match exactly. The file line is **187 passed + 2 skipped =
189 total** — the two skipped files being precisely the two absorbed here. `STATE.md:30` remains
stale (it says 5,659 / 184); `50-MEASUREMENTS.md`'s wave-1 figure of 5,696 / 185 was correct at
`9f8cfb4` and has since grown by the two wave-1 plans' own cells.

---

## 2. THE AFTER TRANSCRIPT, WITH ITS EXIT CODE

```
$ npm run test:live > /tmp/live-run.log 2>&1; echo "TESTLIVE_EXIT=$?"
TESTLIVE_EXIT=0

> vitest run --config vitest.live.config.ts
 RUN  v4.1.11 /home/pedro/programming/pipelite/.claude/worktrees/agent-a676d2e4663fcbd70
 Test Files  2 passed (2)
      Tests  28 passed (28)
   Start at  11:13:20
   Duration  13.91s (transform 448ms, setup 0ms, import 546ms, tests 12.97s, environment 0ms)
```

**Both integers asserted, deliberately: 28 passed AND 2 files.** An include glob that matched nothing
would report `0 passed` and also exit 0, which is why "green" was never the criterion. Reproduced
four times across the plan (first run, exit-code run, post-prose-edit run, final standing gate) with
identical counts.

---

## 3. THE COUNT RECONCILES — 32 − 28 = 4, EXACTLY

```
$ ./node_modules/.bin/vitest run          # after the exclusion
 Test Files  187 passed (187)
      Tests  5735 passed | 4 skipped (5739)
```

| measure | BEFORE | AFTER | delta | reading |
|---|---|---|---|---|
| tests passed | 5,735 | 5,735 | **0** | the 28 were SKIPPED, not passing. Removing them from the project must not move `passed`, and it did not. |
| tests skipped | 32 | **4** | −28 | exactly the 28 absorbed |
| tests total | 5,767 | 5,739 | −28 | closes |
| files passed | 187 | 187 | 0 | |
| files skipped | 2 | **0** | −2 | the two skipped files were exactly these two |
| files total | 189 | 187 | −2 | closes |

**The four that remain, named by path, read at source:**

| file | line | test |
|---|---|---|
| `src/app/settings/notifications/actions.test.ts` | 158 | `it.skip('upserts preferences for user (requires DB)', () => {})` |
| `src/app/admin/users/actions.test.ts` | 64 | `it.skip('creates invite record and sends email (requires DB)', () => {})` |
| `src/app/admin/users/actions.test.ts` | 65 | `it.skip('rejects if email already has active user (requires DB)', () => {})` |
| `src/app/admin/users/actions.test.ts` | 66 | `it.skip('rejects if pending invite exists (requires DB)', () => {})` |

24 + 4 + 4 = 32. **Nothing rounded, nothing unaccounted for.** These four are empty-bodied stubs, not
gated suites — no project can make them run, and they are out of scope here.

*(The base suite's final figure is **5,745 passed / 4 skipped over 187 files**: 5,735 plus the ten new
isolation cells this plan adds. That is the only movement in `passed`, and it is additive.)*

---

## 4. THE DATABASE IS EXACTLY AS IT WAS — FOUR COUNTS

`export-events-live.test.ts` inserts audit rows and deletes them by the uuids it read back from its
own probe. Verified by direct SQL rather than by trusting the file's comment:

| moment | `audit_log` total | `entity_type='export'` |
|---|---|---|
| immediately BEFORE the first live run | **214** | **0** |
| immediately AFTER it | **214** | **0** |
| BEFORE the final standing-gate live run | **214** | **0** |
| AFTER it | **214** | **0** |

Command form (from the MAIN repo path — a worktree has no `docker-compose.yml`):

```
$ rtk proxy docker compose --project-directory /home/pedro/programming/pipelite \
    -f /home/pedro/programming/pipelite/docker-compose.yml \
    exec -T postgres psql -U pipelite -d pipelite \
    -c "select count(*) total, count(*) filter (where entity_type='export') as export_rows from audit_log;"
 total | export_rows
-------+-------------
   214 |           0
(1 row)
```

Also checked after the deliberately-RED run of that file (§7, M-2), where the failure occurs *after*
`created.push(row.id)`: still **214 / 0**. No row leaked, no row was deleted by `entity_type`, and
**the `entity_type='export'` counter is left at 0** so that SC-5 (plan 50-06) owns the 0 → 1
transition as its own observation.

---

## 5. THE OBSERVED ACTIVITY STATUS TRIPLE

The plan pre-diagnosed this as the most likely red. It was not red — the recorded partition still
holds exactly:

```
$ … psql -c "select count(*) filter (where completed_at is not null) as completed,
             count(*) filter (where completed_at is null and due_date >= now()) as pending,
             count(*) filter (where completed_at is null and due_date <  now()) as overdue,
             count(*) as total from activities where deleted_at is null;"
 completed | pending | overdue | total
-----------+---------+---------+-------
     74857 |      14 |    4151 | 79022
(1 row)
```

**74,857 + 14 + 4,151 = 79,022.** Identical to the triple recorded in `formatters-live.test.ts:311`
and in `50-MEASUREMENTS.md`. **No expectation inside either live file was changed** — nothing was
updated and nothing was relaxed to an inequality. The exact-sum assertion at `:301` passed as written.

**A finding about how that triple is read.** The file logs it with `console.log` and its comment says
it is "Recorded for the summary". Under **vitest 4.1.11's default reporter that log never appears** —
not in a piped run, not with `--silent=false`, not in a file-redirected run, not for a single-file
invocation. The triple above therefore comes from SQL, which is the stronger source anyway. Worth
knowing before anybody relies on that `console.log` as an output channel.

---

## 6. ROUTE A WAS REJECTED, AND THE REASON IS ON THE RECORD

Renaming the two files to `*.db.test.ts` would have pointed them at `pipelite_dedup_test`, which
`scripts/dedup-db-test-setup.sh` provisions `--schema-only`. Confirmed at source in this plan's own
`test:db` transcript: `OK: pipelite_dedup_test is ready and empty.` — **it starts EMPTY every run.**

Four assertions that would have broken or gone vacuous:

| assertion | file:line | on an empty database |
|---|---|---|
| `expect(liveIds[entityType]!.length).toBeGreaterThan(0)` | `formatters-live.test.ts:117` | FAILS — no ids to read |
| `maxRows: 100` → `expect(result.error).toBe("too_many")` | `:202-210` | FAILS — needs >100 organizations; live has 46,054 |
| `completed + pending + overdue === baseline.activities` | `:262-313` | VACUOUS — 0 + 0 + 0 === 0 |
| `search:"a"` strictly between 0 and `baseline.organizations` | `:245-250` | FAILS — cannot be `> 0` and `< 0` |

So Route A required rewriting the assertions, which changes what they prove. Route B changes the
ENVIRONMENT, not the files.

**And the four shipped gates that name these two paths by exact string stayed GREEN with every
assertion unweakened — verified, not assumed:**

| gate | what it names | status |
|---|---|---|
| `suite-hook-hygiene.test.ts` `SKIPPED_LIVE_FILES` (both paths) | each still contains `describe.skipIf(` | GREEN, assertion untouched |
| `suite-hook-hygiene.test.ts` same list | each still performs a dynamic `import()` | GREEN, assertion untouched |
| `suite-timing-hygiene.test.ts:1643` `PERMITTED_BACKSTOPS` | `formatters-live.test.ts` declares a 60 000 ms backstop | GREEN, the `60000` value untouched |
| `no-standing-suppressions.test.ts:61` `DELIBERATE` | `export-events-live.test.ts` | GREEN, **file not edited at all** |

```
$ ./node_modules/.bin/vitest run \
    src/lib/mutations/__tests__/db-test-isolation.test.ts \
    src/lib/__tests__/suite-hook-hygiene.test.ts \
    src/lib/__tests__/suite-timing-hygiene.test.ts \
    src/types/__tests__/no-standing-suppressions.test.ts
 Test Files  4 passed (4)
      Tests  187 passed (187)
```

`SKIPPED_LIVE_FILES`, `PERMITTED_BACKSTOPS` and `DELIBERATE` all **retain their entries**. What moved
was prose (§9).

---

## 7. RUNNING IS NOT THE SAME AS MEANINGFUL — TWO RECORDED REDS

The plan's own subject is 28 checks that never ran, so "they run and pass" is not sufficient: a test
that runs and passes unconditionally is the same defect wearing a different hat. Both files were
broken **at the production code**, not at the assertion, and the reds recorded verbatim.

### M-1 — the 24-test file detects the exact historical defect it was written for

`src/lib/export/formatters.ts:371` changed from `if (filters?.ids)` to
`if (filters?.ids && filters.ids.length)` — precisely the T-38-01 shape the file's own comment at
`:309-310` labels "an admin-gate bypass".

```
$ ./node_modules/.bin/vitest run --config vitest.live.config.ts src/lib/export/formatters-live.test.ts
M1_EXIT=1
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |live| src/lib/export/formatters-live.test.ts > fetchFilteredData against the live database > organization > returns ZERO rows for an empty id list, never the whole table
AssertionError: expected 46054 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 46054

 ❯ src/lib/export/formatters-live.test.ts:180:28

 FAIL  |live| src/lib/export/formatters-live.test.ts > fetchFilteredData against the live database > BULK PATH: an empty id list still yields zero rows even with a cap in play
AssertionError: expected false to be true // Object.is equality

 ❯ src/lib/export/formatters-live.test.ts:236:28

 Test Files  1 failed (1)
      Tests  2 failed | 22 passed (24)
```

`expected 46054 to be +0` — an empty id list walking out the entire organizations table. **This is
the defect these tests exist to catch, and for the first time in their existence they were in a
position to catch it.** Restored; `git diff --exit-code -- src/lib/export/formatters.ts` → 0.

### M-2 — the 4-test file, which is SC-5's only real proof, detects a row-shape change

`src/lib/audit/export-events.ts:98` changed from `rowCount: { from: null, to: input.rowCount }` to
`to: 0`. Chosen so the failure lands *after* `created.push(row.id)`, so no row could leak.

```
$ ./node_modules/.bin/vitest run --config vitest.live.config.ts src/lib/audit/export-events-live.test.ts
M2_EXIT=1
 ❯ |live| src/lib/audit/export-events-live.test.ts (4 tests | 1 failed) 1096ms
     × postgres accepts the row, entity_type 'export' included 25ms

 FAIL  … > recordExport against the live database > postgres accepts the row, entity_type 'export' included
AssertionError: expected { …(3) } to deeply equal { exportedEntityType: { …(2) }, …(2) }

@@ -7,8 +7,8 @@
     "rowCount": {
       "from": null,
-      "to": 44254,
+      "to": 0,
     },
   }

 ❯ src/lib/audit/export-events-live.test.ts:107:25
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```

`recordExport` swallows every error by design (`export-events.ts:106-115`), so this class of change
is invisible to every other test in the repository. Restored; `git diff --exit-code -- src/` → 0;
`audit_log` re-read at **214 / 0**.

---

## 8. NINE ABLATIONS, EACH RESTORED, EACH RED RECORDED

### Task 1, ablation 1 — widen the live include to the base corpus

`include: ['src/**/*.test.?(c|m)[jt]s?(x)']`. Run with `vitest list` (collect, do not execute) so
nothing could write:

```
$ ./node_modules/.bin/vitest list --config vitest.live.config.ts --json=/tmp/live-widened.json
LIST_EXIT=1

Error: refusing to run: connection names database "pipelite", not "pipelite_dedup_test". "pipelite" is the DEVELOPMENT database and holds ~189k rows of real CRM data; no import is ever run against it. Run `npm run test:db`.
 ❯ assertIsolatedConnection src/app/import/import-owner-scope.db.test.ts:125:11
… (repeated for custom-field-definition-fixture, dedup-formula, activities-scope, stages-scope,
   runs-owner-scope and the rest of the 13 *.db.test.ts files)
```

**Collection ABORTED — no JSON was produced.** The interesting number, counted structurally rather
than from a pipe:

```
$ node -e '…recursive readdir over src/…'
WIDENED_GLOB_MATCHES=204 files
  of which -live=2  .db.test=13  .rsc.test=2
NARROW_GLOB_MATCHES=2 files: src/lib/audit/export-events-live.test.ts, src/lib/export/formatters-live.test.ts
```

**The glob is load-bearing: 2 files versus 204.** A finding worth keeping — the widened form is loud
today *only because* the 13 `*.db.test.ts` files carry their own module-load `assertIsolatedConnection`
fences, which refuse a connection naming `pipelite`. Those fences are a genuine second line of defence
and they fired. But they do not exist in CI, where no database exists to refuse anything — which is
why the include length is also gated in the base project (§8, F5).

### Task 1, ablation 2 — remove the `-live` entry from the base exclude

```
$ ./node_modules/.bin/vitest run
BASE_ABLATED_EXIT=0
 Test Files  187 passed | 2 skipped (189)
      Tests  5735 passed | 32 skipped (5767)
```

**32 skipped again, and 189 files again — byte-identical to the BEFORE baseline.** This is the
ablation that proves the exclusion is what changed the count, and note what it also proves: the
ablated state **exits 0**. Nothing in the suite's own output complains. Restored.

### Task 1, ablation 3 — a non-loopback `DATABASE_URL`

```
$ DATABASE_URL='postgresql://u:p@db.example.com:5432/x' npm run test:live
FENCE_EXIT=1
failed to load config from …/vitest.live.config.ts
⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: LiveProjectRefusedNonLoopbackHost: DATABASE_URL points at "db.example.com". This project WRITES to the database it is given (src/lib/audit/export-events-live.test.ts inserts and deletes audit_log rows), so it may only ever be aimed at the operator's own machine. Permitted hosts: localhost, 127.0.0.1, ::1, [::1].
    at fencedConnection (…/vitest.live.config.ts:55:11)
    at Object.<anonymous> (…/vitest.live.config.ts:61:15)
```

A **named** throw at config load, exit 1, before a single file is collected and long before
postgres.js opens a socket. The fence is not decoration. It also establishes empirically that
`process.loadEnvFile()` does **not** override an already-exported variable — otherwise `.env`'s
loopback value would have masked the sabotage and the fence would have been unreachable.

### Task 2 — the six cell falsifications

All six red, each naming the offending script or glob. **No cell came back green under its own
sabotage**; one came back red for the *wrong reason*, which is recorded as a finding and fixed.

**F1 — delete `test:live` from `package.json`:**

```
 FAIL  … > the live vitest project is unreachable from `npm test` > `test:live` exists as its own opt-in script, so the live project is invocable at all
AssertionError: package.json has no `test:live` script, so the 28 live-database tests are unrunnable and the negatives below describe a project nobody can reach: expected undefined to be defined
 ❯ src/lib/mutations/__tests__/db-test-isolation.test.ts:749:7
 Test Files  1 failed (1)
      Tests  1 failed | 35 passed (36)
```

**Cells 2, 3 and 4 stayed GREEN under this sabotage — which is exactly why cell 1 exists.** Without
it, deleting `test:live` returns the 28 tests to never running while the describe stays green: the
plan's own defect, reproduced inside its own gate.

**F1 also exposed a real defect in the provisioning cell (fixed in `68433bb`).** On the first run the
sabotage produced *two* reds, and the second was useless:

```
 FAIL  … > `test:live` does NOT provision the db project's database
AssertionError: `test:live` runs the db project's provisioning script, which drops and rebuilds pipelite_dedup_test. Remove it — the live project needs no provisioning.: the given combination of arguments (undefined and string) is invalid for this assertion. You can use an array, a map, an object, a set, a string, or a weakset instead of a string
```

A reader would have been sent to a provisioning problem that did not exist. `?? ""` makes the cell
silent on the missing-script case, which is cell 1's job and cell 1's message. Re-measured under the
same sabotage: exactly one red, cell 1.

**F2 — `scripts.test` gains ` && npm run test:live`:** cells 2 AND 3 red.

```
 FAIL  … > the `test` script names neither the live config nor the live script
AssertionError: `npm test` reaches the live vitest project. CI has no Docker and no populated database, so the required `ci` check would never pass and every pull request would become unmergeable — and locally, every contributor running `npm test` would be writing audit_log rows to the operator's real database.: expected 'vitest run && vitest run --config vit…' not to contain 'test:live'
 ❯ …:768:11

 FAIL  … > no other script chains the live project into a broader one
AssertionError: script "test" reaches the live vitest project, which writes to the operator's real audit_log. Nobody running "npm run test" is expecting that.
 ❯ …:784:13
      Tests  2 failed | 34 passed (36)
```

**F3 — a `test:all` aggregate chaining `test:live`:**

```
 FAIL  … > no other script chains the live project into a broader one
AssertionError: script "test:all" reaches the live vitest project, which writes to the operator's real audit_log. Nobody running "npm run test:all" is expecting that.
      Tests  2 failed | 34 passed (36)
```

The offending script is **named**. The incumbent db cell fired on the same script for `test:db`,
which is the pair behaving as designed.

**F4 — `test:live` prepends `bash scripts/dedup-db-test-setup.sh &&`:**

```
 FAIL  … > `test:live` does NOT provision the db project's database
AssertionError: `test:live` runs the db project's provisioning script, which drops and rebuilds pipelite_dedup_test. Remove it — the live project needs no provisioning.: expected 'bash scripts/dedup-db-test-setup.sh &…' not to contain 'dedup-db-test-setup.sh'
      Tests  1 failed | 35 passed (36)
```

**F5 — a second glob in the live include:**

```
 FAIL  … > the live vitest project claims exactly the -live glob > includes NOTHING but -live.test files
AssertionError: vitest.live.config.ts's include must claim the -live glob and nothing else. Widened, this project runs the whole mocked corpus against the operator's real database.: expected [ …(2) ] to have a length of 1 but got 2
      Tests  1 failed | 35 passed (36)
```

Ablation 1 of Task 1, made permanent — and now caught in the base project, in CI.

**F6 — remove the `-live` entry from the base exclude:**

```
 FAIL  … > the base vitest project excludes the -live glob > has a -live.test entry in test.exclude
AssertionError: vitest.config.ts's test.exclude has no -live.test entry, so the two live files are collected by the base project again. They self-skip today, so nothing goes red — that is exactly why this is asserted here rather than left to the suite's own output.: expected false to be true
      Tests  1 failed | 35 passed (36)
```

After all nine: `git diff --exit-code -- src/` → 0, `git diff --exit-code` → 0, no untracked files.

---

## 9. THE THREE CONSTRAINTS `db-test-isolation.test.ts` IMPOSES — VERIFIED AT SOURCE, NOT ASSUMED

The brief listed three and asked for them to be measured rather than trusted. All three are real, all
three read at source, and none is tripped:

| constraint claimed | verified at | verdict | how this plan stays clear |
|---|---|---|---|
| `ci.yml` contains ZERO raw occurrences of `test:db` and of `db.config`, comments included | `:441-444`, over `readFileSync` — the comment above it says "Read RAW, comments included, deliberately" | **TRUE** | `vitest.live.config.ts` and `test:live` contain neither substring; and **`ci.yml` was not touched at all** — confirmed by `git diff --name-only 3e88d6b..HEAD` |
| job `ci` declares EXACTLY one service | `:469-490`, over PARSED yaml (`ciJob().services`) | **TRUE** | `ci.yml` untouched; 50-07 owns it |
| the db project's `include` has length EXACTLY 1 and every pattern contains `db.test` | `:641-647` (now shifted by this plan's insertion) | **TRUE** | **no glob was added to `vitest.db.config.ts`**; the fourth project got its own config file |

Two further constraints the plan named and this plan also satisfies: no script other than `test:db`
may contain `test:db` or `db.config` (`:422-432` — `test:live` contains neither, and that incumbent
cell is green), and the base `exclude` keeps its `db.test` entry, its `rsc.test` entry and the
`configDefaults.exclude` spread (`:613-623` — the `-live` entry is ADDITIVE and all three incumbents
are re-asserted by the new cell).

**Ten cells were written, covering the six claims the plan specified** (finer granularity, nothing
merged away): script exists · `test` clear · no other script · no provisioning · include length 1 ·
exclude spreads defaults · `fileParallelism` **and** `sequence.concurrent` · the loopback fence named
in source · base exclude has `-live` · base exclude keeps `db.test`/`rsc.test`/`configDefaults`.

**Deliberately NOT written, with the reason in a comment in the file:** nothing here asserts anything
about `ci.yml`. 50-07 owns the workflow edit and the `MIN_CI_STEPS` bump, and both must move in the
same commit — a floor whose prose enumerates a step list the workflow does not have yet is the exact
half-state Phase 46 was burned by.

---

## 10. FIVE COMMENTS THAT HAD BECOME FALSE, CORRECTED IN THE SAME COMMITS

The plan named three. Two more were discovered by measurement.

1. **`suite-hook-hygiene.test.ts`, `SKIPPED_LIVE_FILES` header.** Said the files are skipped "with
   `DATABASE_URL` unset — the state of the base vitest project". They are now EXCLUDED from that
   project and RUN in a fourth one. The reason was rewritten and 50-03 named; **both assertions are
   character-identical** and both still pass.
2. **`suite-timing-hygiene.test.ts:1645`, the `why` field.** Called `formatters-live.test.ts` "an
   opt-in, entirely skipped live-database suite". Corrected; the `60000` value and the assertion did
   not move.
3. **`vitest.db.config.ts` header, ONE phrase.** It said it was "the only one in this repository that
   talks to a real database" — now false. Corrected to "the first of the two", with the change
   flagged in place. Nothing else in that config was restructured; this plan does not own it.
4. **`formatters-live.test.ts`'s own RUN IT WITH block** — *not in the plan, found by measurement.*
   It documented `DATABASE_URL=… ./node_modules/.bin/vitest run src/lib/export/formatters-live.test.ts`,
   which relied on the base project collecting the file. It no longer does:

   ```
   $ ./node_modules/.bin/vitest run src/lib/export/formatters-live.test.ts
   DIRECT_EXIT=1
   No test files found, exiting with code 1
   filter: src/lib/export/formatters-live.test.ts
   include: src/**/*.{test,spec}.?(c|m)[jt]s?(x)
   exclude:  **/node_modules/**, **/.git/**, **/.next/**, **/*.rsc.test.?(c|m)[jt]s?(x), **/*.db.test.?(c|m)[jt]s?(x), **/*-live.test.?(c|m)[jt]s?(x)
   ```

   Corrected to `npm run test:live`, plus the single-file form
   `vitest run --config vitest.live.config.ts <path>` which does work. Leaving a documented command
   that exits 1 is the same defect class this plan exists to remove.
5. **`export-events-live.test.ts`'s RUN IT WITH block** — same problem, same correction.

Neither live file was renamed. Neither lost `describe.skipIf(`. Neither lost a 60 000 ms timeout. No
`Date.now()` and no elapsed-time assertion was introduced anywhere (constraint 8 —
`suite-timing-hygiene` propagates clock taint by variable NAME, and its exclusion list is still
asserted EMPTY and green).

---

## 11. THE FULL STANDING GATE

All from the worktree root, at HEAD `68433bb`:

| gate | result | exit |
|---|---|---|
| `./node_modules/.bin/vitest run` | **5,745 passed / 4 skipped over 187 files** | 0 |
| `vitest run --config vitest.rsc.config.ts` | **8 passed / 2 files** | 0 |
| `npm run test:live` | **28 passed / 2 files** | **0** |
| `npm run test:db` | **299 passed / 13 files**, `pipelite_dedup_test is ready and empty` | **0** |
| `./node_modules/.bin/tsc --noEmit` | no output | 0 |
| `./node_modules/.bin/eslint` | **0 errors** (118 warnings, not gated — not reproducible across trees) | 0 |
| `npm run db:check-migrations` | `OK: the migration chain builds a complete schema from zero` | 0 |
| `npm run security:audit` | `OK: 47 advisories evaluated … every critical/high carries a disposition` | 0 |
| `git diff --exit-code` / `-- src/` | clean, no untracked files | 0 |
| `.github/workflows/ci.yml` | **untouched** (`git diff --name-only 3e88d6b..HEAD`) | — |

---

## 12. DEVIATIONS FROM PLAN

### Auto-fixed

**1. [Rule 1 — Bug] The provisioning cell reported the wrong problem.**
- **Found during:** Task 2, falsification 1.
- **Issue:** with `test:live` absent, `expect(scripts["test:live"], "<provisioning message>")` threw
  vitest's "the given combination of arguments (undefined and string) is invalid" — red for a reason
  unrelated to its message.
- **Fix:** `?? ""`, plus a comment recording the measurement that motivated it.
- **Commit:** `68433bb`.

**2. [Rule 2 — Missing correctness] Two shipped RUN IT WITH blocks documented a command that now
exits 1.**
- **Found during:** Task 2, while verifying the hook-hygiene prose claim rather than asserting it.
- **Issue:** both live files told the reader to invoke them by path under the base config; the new
  exclusion makes that "No test files found", exit 1.
- **Fix:** corrected to `npm run test:live` and the single-file `--config` form; the correction and
  its reason recorded in each header.
- **Commit:** `823da55`.

### Two premises in the orchestrator's brief were wrong, and were measured rather than trusted

Per DEF-50-03's lesson (three documents agreeing is not evidence):

- The brief gives the audit file's path as **`src/lib/export/export-events-live.test.ts`**. It is
  **`src/lib/audit/export-events-live.test.ts`**. The PLAN has it right.
- The brief gives the isolation gate as **`src/lib/__tests__/db-test-isolation.test.ts`**. It is
  **`src/lib/mutations/__tests__/db-test-isolation.test.ts`**. The PLAN has it right.

Both were caught by `ls` before any edit. Recorded because a later plan copying the brief's paths
would edit a file that does not exist — or create one.

### Nothing else deviated

No architectural change, no package installed (the new config imports only `vitest/config` and
`path`), no checkpoint, no authentication gate, no blocked task.

---

## 13. FINDINGS WORTH CARRYING FORWARD

1. **The ablated state exits 0.** Ablation 2 restored 32 skipped and the suite still exited 0 with no
   complaint. Nothing in vitest's own output objects to 28 tests silently not running — which is why
   the exclusion is gated in the base project rather than left to the suite's report. This is the
   general shape of the defect this milestone keeps finding: the absence of a signal is not a signal.
2. **`console.log` from a passing test is invisible under vitest 4.1.11's default reporter** — piped,
   redirected, `--silent=false` or single-file. `formatters-live.test.ts:312` logs the activity triple
   "for the summary"; it cannot be read that way. Read it by SQL.
3. **`process.loadEnvFile()` does not override an already-exported variable.** Established by ablation
   3: had it overridden, the fence would have been unreachable and would have looked like it worked.
4. **The 13 `*.db.test.ts` files' module-load `assertIsolatedConnection` fences are a real second line
   of defence**, and they fired under ablation 1 — aborting collection with named errors rather than
   running. They do not exist in CI, so they complement the config-level gate rather than replacing it.
5. **A cell can be red for the wrong reason**, and that is a defect of the same family as a cell that
   cannot be red. Only sabotage finds it: F1 was designed to produce one red and produced two.

---

## 14. HANDOFF — text for STATE.md and ROADMAP.md (this plan edited NEITHER)

**Do not paste blindly; the orchestrator owns both files.**

**Suite baseline to replace `STATE.md:30`** (measured at HEAD `68433bb`, worktree root):

```
Suite: 5,745 passed / 4 skipped over 187 files (base) · 8/8 rsc · 299/13 db (EXIT 0)
       · 28/2 live (EXIT 0, new — `npm run test:live`, opt-in, requires Docker)
       tsc 0 · eslint 0 errors
```

The previous `32 skipped` figure is retired. **32 − 28 = 4**, and the four remaining are empty
`it.skip('… requires DB')` stubs at `src/app/settings/notifications/actions.test.ts:158` and
`src/app/admin/users/actions.test.ts:64-66`. No project can make those run.

**A NEW standing scheduling rule, for the phase-dispatch logic rather than for STATE's prose:**
`npm run test:live` writes to the REAL `audit_log`. Any plan that runs it must be **alone in its
wave**, exactly as any plan owning a `*.db.test.ts` is alone because `dedup-db-test-setup.sh` drops
and rebuilds every schema in `pipelite_dedup_test`. This plan's frontmatter records it as
`live_test_owner: true`.

**For ROADMAP.md:** the "24 unrun `formatters-live.test.ts` tests" gap carried since Phase 40 is
closed, and the true figure was **28**, not 24 — the 4-test `export-events-live.test.ts` was never
counted in the roadmap and is the more consequential half, being SC-5's only behavioural proof.
**The CI half is NOT delivered:** `.github/workflows/ci.yml` is untouched here by design (50-07 owns
it), so this control is **DELIVERED LOCALLY and NOT DELIVERED on the real runner** — the Phase 47
formulation, and the honest one, since `origin/master` sits at `a58b9e1`, four phases behind.

**For `deferred-items.md`, if the orchestrator wants them numbered:** findings 2 and 5 of §13 are the
two that a later plan could trip over — the invisible `console.log`, and the red-for-the-wrong-reason
class. Neither is a defect in shipped behaviour and neither blocks anything.

**Requirements:** `SEC-03` is the plan's declared requirement. This plan makes its proofs RUN; it does
not itself implement the selectivity rule (50-04) or prove the criteria (50-06). Marking SEC-03
complete on the strength of this plan alone would overstate it.

---

## 15. KNOWN STUBS

None. This plan added no placeholder value, no hardcoded empty collection and no "coming soon" path.
The one `?? ""` it introduced is a fault-isolation fix in a test assertion, documented at the point of
use with the measurement that motivated it (§8, F1).

## Threat Flags

None. No network endpoint, auth path, file-access pattern or schema change was introduced. The one new
trust boundary — a vitest project reachable to the real `pipelite` database — is the plan's declared
subject and is covered by T-50-03-01 through T-50-03-09, all of which were driven and observed.

## Self-Check: PASSED

Verified at HEAD `efb56f0`:

- `vitest.live.config.ts` exists on disk AND in the commit (`git cat-file -e HEAD:vitest.live.config.ts`)
- `50-03-SUMMARY.md` exists on disk AND in the commit
- all four commits present in `git log --all`: `a3598f2`, `823da55`, `68433bb`, `efb56f0`
- `git diff --exit-code` clean, no untracked files
- `.github/workflows/ci.yml` absent from `git diff --name-only 3e88d6b..HEAD`
- `STATE.md` and `ROADMAP.md` absent from the same list
