---
phase: 46-migration-chain-toolchain-floor
plan: 05
subsystem: infra
tags: [ci, github-actions, service-container, migrations, gate-re-anchoring, negative-control, yaml]

# Dependency graph
requires:
  - phase: 46-03-toolchain-floor
    provides: "the ci.yml this plan extends — node-version: 24, the reconciled binding-floor comment, and both action SHA pins"
  - phase: 46-04-from-zero-migration-check
    provides: "scripts/migrate-from-zero.mjs and `npm run db:check-migrations` — the check this plan wires onto the required job, plus the measured fact that it takes reference branch 4 in CI"
  - phase: 39-db-test-isolation
    provides: "src/lib/mutations/__tests__/db-test-isolation.test.ts — the gate whose blunt proxy this plan re-anchors"
provides:
  - "`npm run db:check-migrations` runs on the REQUIRED `ci` check, so a migration-chain regression cannot be merged (DEPLOY-01 SC-3)"
  - "A postgres:16-alpine service on the `ci` job, its tag asserted RELATIONALLY against docker-compose.yml rather than duplicated as a literal"
  - "db-test-isolation.test.ts control 3 re-anchored: four parsed, per-step assertions replacing two whole-file negatives, with both anti-vacuity anchor blocks byte-identical"
  - "The destructive-statement scan extended to scripts/migrate-from-zero.mjs with a per-file comment stripper and a new anti-vacuity floor the original scan lacked"
  - "Three observed negative controls: missing consumer step, mismatched service image, violating destructive line"
affects: [46-06-container-boot, any future ci.yml change, any future operational script issuing DDL]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Re-anchor a proxy assertion to the invariant it stood for, in the same commit that falsifies the proxy — never delete, never weaken"
    - "Relational cross-file pin: the CI service image is READ from docker-compose.yml and compared, so two files cannot drift"
    - "Consumer-anchored resource assertion: a provisioned service is asserted together with the step that uses it, because a service with no consumer is a gate that cannot fail"
    - "Per-file comment syntax in a multi-file source scan, with a line-count-preserving stripper so a failure can quote a line number"

key-files:
  created: []
  modified:
    - src/lib/mutations/__tests__/db-test-isolation.test.ts
    - .github/workflows/ci.yml

key-decisions:
  - "Route A, unchanged from CONTEXT: the check lands on the existing required `ci` job rather than a new workflow, because a new check-run name is not in the master ruleset and could go red without blocking a merge"
  - "The `if: ${{ !cancelled() }}` assertion lives in the SAME `it` as the consumer assertion, so exactly two `it`s are red in the task-1 RED run rather than three"
  - "The per-step enumeration is ADDITIVE to the raw whole-file negatives, not a replacement — parsed `run:` values cannot see a commented-out step, and that case is exactly what the raw scan covers"
  - "A line-count-preserving, quote-aware C-style stripper was written rather than reusing `readStrippedSource`, because that helper collapses block comments and the scan must be able to quote a line NUMBER"
  - "The CI service is documented in-file as a deliberate exception to the SHA-pinning rule, because an unexplained exception in a file where everything else is SHA-pinned invites someone to 'fix' it"

patterns-established:
  - "Anti-vacuity floor for a negative source scan: assert the scanned file is non-empty AND that at least one NON-comment line carries the keyword being guarded"
  - "A failure message that names both observed values on a relational assertion, so the reader does not have to open two files to see the mismatch"

requirements-completed: []

# Metrics
duration: 9min
completed: 2026-08-25
---

# Phase 46 Plan 05: CI Wiring Summary

**The from-zero migration check now runs on the REQUIRED `ci` job, and the blunt proxy that would have gone red on that change was re-anchored — in the commit before it — to four parsed, per-step assertions of the invariant it had only ever stood in for.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-08-25T04:03:05Z
- **Completed:** 2026-08-25T04:12:00Z
- **Tasks:** 2 (both implementation, no checkpoints)
- **Files modified:** 2 (0 created)

## Accomplishments

- **DEPLOY-01 SC-3's "repeatable check" became a merge gate.** `npm run db:check-migrations` was runnable before this plan and nothing ran it. It now runs on `ci` — the check-run name the master ruleset requires — so a migration-chain regression fails a required check rather than waiting for someone to remember the command.
- **Replaced a proxy with the thing it was a proxy for, and made it strictly stronger.** The old assertion was `ci.yml` contains neither `services:` nor `postgres`. It is now: the `ci` job declares exactly one service; that service's image EQUALS `docker-compose.yml`'s `services.postgres.image` (read from both files, never typed twice); exactly one step runs `npm run db:check-migrations` and carries `if: ${{ !cancelled() }}`; and NO step's `run` mentions the database-backed vitest project, asserted step by step with the offending step NAMED. The old whole-file negative could only say "the token is somewhere in this file."
- **Kept the two anti-vacuity anchor blocks byte-identical** and verified it from the diff, not from memory. The raw `test:db` / `db.config` whole-file negatives were not relaxed to make room; the parsed per-step assertions are additive to them, and the file now says why both forms are kept (parsed `run:` values cannot see a commented-out step; that is the raw scan's job).
- **Extended the destructive-statement scan to the second script that issues DDL** against the operator's cluster, with the correct per-file comment stripper — and added the anti-vacuity floor the original scan never had.
- **Proved the CI path end to end on a real `postgres:16-alpine` container** using the exact image, credentials and `DATABASE_URL` shape the workflow declares, rather than reasoning about it.

## Task Commits

1. **Task 1: Replace the blunt proxy with the real invariant, extend the destructive scan, observe RED** — `9457938` (test)
2. **Task 2: Add the Postgres service and the from-zero check step to the required `ci` job** — `aa39784` (feat)

## Files Created/Modified

- `src/lib/mutations/__tests__/db-test-isolation.test.ts` — **+369 / −21**. Header control 3 rewritten with a `WHY CONTROL 3 CHANGED IN PHASE 46` section; `parse` from `yaml` imported; `ciJob()`, `ciSteps()`, `stepLabel()`, `composePostgresImage()` accessors added in the `compose-uploads-persistence.test.ts:86-95` throw-that-names-what-it-saw style; `DESTRUCTIVE_SCAN_SUBJECTS` + `codeLines()` added; the destructive scan moved into its own `describe` and driven by `it.each`. 16 tests → 21 tests.
- `.github/workflows/ci.yml` — **+63 / −0. A pure addition.** A `services:` block on the `ci` job and a `Migration chain check` step after `Test`. Nothing existing was modified — the diff contains zero deletions, which is the strongest available proof that `name: ci`, `node-version: 24`, both SHA pins, the `persist-credentials: false` comment, the "deliberately no path filter" comment, the `permissions` block and the `concurrency` block all survive unchanged.

## The Job Graph, Stated Explicitly

`ci.yml` declares **one job**, `ci`, whose `name:` is `ci`. It has no `needs:`, no matrix and no other job — there is no graph to speak of, which is the point: no new check-run name was introduced, so the master ruleset needs no edit.

Parsed with `yaml` (not grepped):

```
jobs: [ 'ci' ]
job ci name: ci
services: [ 'postgres' ]
service image: postgres:16-alpine
compose image: postgres:16-alpine
images equal: true
steps: [
  '(uses actions/checkout)',
  '(uses actions/setup-node)',
  'Install dependencies',
  'Typecheck',
  'Lint',
  'Test',
  'Migration chain check'
]
if conditions: [ '-', '-', '-', '-', '${{ !cancelled() }}', '${{ !cancelled() }}', '${{ !cancelled() }}' ]
```

The file parses as valid YAML — the parse above is itself the proof; a malformed document would have thrown before printing a single line.

## 46-03's Work Verified Unchanged

Counted with `node -e` string splits, never `grep -c` (which this environment's shell hook has been measured returning wrong counts from):

| Token in `ci.yml` | Expected | Observed |
|---|---|---|
| `node-version: 24` | 1 | **1** |
| `name: ci` | 1 | **1** |
| `3d3c42e5aac5ba805825da76410c181273ba90b1` (actions/checkout v7.0.1) | 2 (header note + `uses:`) | **2** |
| `820762786026740c76f36085b0efc47a31fe5020` (actions/setup-node v7.0.0) | 2 (header note + `uses:`) | **2** |
| `npm run db:check-migrations` | 1 | **1** |
| `if: ${{ !cancelled() }}` | 3 (Lint, Test, Migration chain check) | **3** |
| `test:db` | 0 | **0** |
| `db.config` | 0 | **0** |

Independently: `git diff HEAD~1 -- .github/workflows/ci.yml` reports **63 insertions, 0 deletions**. No pre-existing line could have changed.

### The S7 collision that had to be worked around

`db-test-isolation.test.ts` asserts `ci.yml` contains **zero** occurrences of `db.config`. The natural comment to write in the workflow — "no step invokes the `vitest.db.config.ts` project" — contains `db.config` as a substring and would have turned that surviving negative red. Per S7 the **prose was reworded, never the gate**: the workflow's comment says "the database-backed vitest project" throughout and names no config filename.

## Task 1 — Observed RED, Verbatim

`./node_modules/.bin/vitest run src/lib/mutations/__tests__/db-test-isolation.test.ts` against the **unedited** `ci.yml`, exit code **1**:

```
 ❯ src/lib/mutations/__tests__/db-test-isolation.test.ts (21 tests | 2 failed) 58ms
     ✓ the `test` script names neither the db config nor the db script 2ms
     ✓ `test:db` exists as its own opt-in script, so the db project is invocable at all 0ms
     ✓ no other script chains the db project into a broader one 1ms
     ✓ contains zero occurrences of `test:db` and zero of `db.config` 0ms
     ✓ still runs `npm test` — the anti-vacuity anchor for the two negatives above 0ms
     × provisions exactly one service, on the image docker-compose.yml pins 23ms
     × runs the from-zero migration check — the consumer that makes that service load-bearing 7ms
     ✓ has NO step that reaches the database-backed vitest project — asserted step by step 7ms
     ✓ has a db.test entry in test.exclude 1ms
     ✓ still has the rsc.test entry — the anti-vacuity anchor for the exclude array 1ms
     ✓ would otherwise match the db files — which is WHY the exclusion is required 1ms
     ✓ has a db.test entry in test.include 0ms
     ✓ includes NOTHING but db.test files 1ms
     ✓ spreads vitest's default exclude rather than replacing it 0ms
     ✓ runs its files serially — one database, shared fixtures 0ms
     ✓ names the isolated database and DERIVES the URL rather than reusing E2E_DATABASE_URL 0ms
     ✓ the provisioning script rebuilds only the test database and only READS the source 0ms
     ✓ 'scripts/dedup-db-test-setup.sh' really contains destructive statements outside its comments — the scan's floor 1ms
     ✓ 'scripts/migrate-from-zero.mjs' really contains destructive statements outside its comments — the scan's floor 3ms
     ✓ 'scripts/dedup-db-test-setup.sh' never aims a destructive statement at '$SOURCE_DB' 0ms
     ✓ 'scripts/migrate-from-zero.mjs' never aims a destructive statement at 'REFERENCE_DB' 4ms

EXIT=1
```

**Exactly the two `it`s the plan predicted.** Every other `it` passes in that same red run — including both kept-verbatim raw-read blocks, the new per-step enumeration, the base-project exclude assertions, and all four halves of the extended destructive scan.

The two failure bodies:

```
 FAIL  … > provisions exactly one service, on the image docker-compose.yml pins
AssertionError: job `ci` must declare exactly one service — the Postgres the from-zero migration check needs. Parsed services: (none): expected [] to have a length of 1 but got +0
 ❯ src/lib/mutations/__tests__/db-test-isolation.test.ts:399:7

 FAIL  … > runs the from-zero migration check — the consumer that makes that service load-bearing
AssertionError: no step of job `ci` runs `npm run db:check-migrations`. Steps parsed: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1, actions/setup-node@820762786026740c76f36085b0efc47a31fe5020, Install dependencies, Typecheck, Lint, Test: expected [] to have a length of 1 but got +0
 ❯ src/lib/mutations/__tests__/db-test-isolation.test.ts:422:7
```

### The gate was not edited to chase green

After task 2's `ci.yml` change the same command exits **0** with **21 passed**, and:

```
$ git diff --stat HEAD -- src/lib/mutations/__tests__/db-test-isolation.test.ts
(empty)
```

The test file has been byte-identical since commit `9457938`. Green was reached by changing the subject, not the assertion.

### The kept-verbatim blocks, verified from the diff

`git diff -U0` on the test file was searched for any `+`/`−` line touching the two anchor blocks. The only hit is a **new** line (the per-step enumeration's `not.toContain("test:db")`), not a change to the originals. The blocks as they stand today:

```typescript
  it("contains zero occurrences of `test:db` and zero of `db.config`", () => {
    expect(workflow).not.toContain("test:db")
    expect(workflow).not.toContain("db.config")
  })

  it("still runs `npm test` — the anti-vacuity anchor for the two negatives above", () => {
    // An emptied, renamed or path-filtered ci.yml would satisfy both negatives perfectly.
    // These three assertions are what make the absence meaningful: the workflow exists, it
    // is the `ci` check the master ruleset requires, and it still runs the test suite.
    expect(workflow).toContain("npm test")
    expect(workflow).toContain("name: ci")
    expect(workflow).toContain("npm run typecheck")
  })
```

Byte-identical to `:123-135` of the pre-plan file. And the proxy is **gone, not commented out**:

| Token in the test file | Expected | Observed |
|---|---|---|
| `not.toContain("services:")` | 0 | **0** |
| `not.toContain("postgres")` | 0 | **0** |
| `migrate-from-zero` | ≥ 1 | **3** |

## Is the replacement weaker than what it replaced?

The one question this plan could get wrong. Stated case by case:

| What the proxy caught | Does the replacement still catch it? |
|---|---|
| A `services:` block appearing in `ci.yml` | **Yes, and better.** A second service now fails the exactly-one assertion by name; the proxy failed on the *first* one, which is the change that was actually correct to make. |
| A `postgres` mention anywhere in the file | **Deliberately no longer forbidden** — that was the point of the change. What it stood for is asserted directly instead. |
| A step invoking the db vitest project | **Yes, three independent ways.** (1) the surviving raw `test:db` / `db.config` whole-file negatives, untouched; (2) the new per-step enumeration over parsed `run:` values, which names the offending step; (3) the base project still excludes the `*.db.test.*` glob — the real mechanism, asserted unchanged. |
| Nothing — the proxy said nothing about whether CI's database was *used* | **Newly caught.** A Postgres service with no consumer now fails. |
| Nothing — the proxy said nothing about which image | **Newly caught.** The tag is compared against `docker-compose.yml`. |
| Nothing — the proxy said nothing about the step aborting the job | **Newly caught.** `if: ${{ !cancelled() }}` is asserted. |

Net: three assertions added, one intentionally retired, zero surviving assertions weakened.

## Negative Controls

Three reds, each observed by breaking something on purpose and each restored afterwards.

### NC-A — the Postgres service with no consumer

The `Migration chain check` step was deleted from `ci.yml`, leaving the service in place. This is exactly the "provisioned resource nobody uses" state the consumer assertion exists to catch.

```
 ❯ src/lib/mutations/__tests__/db-test-isolation.test.ts (21 tests | 1 failed) 66ms
     ✓ contains zero occurrences of `test:db` and zero of `db.config` 0ms
     ✓ still runs `npm test` — the anti-vacuity anchor for the two negatives above 0ms
     ✓ provisions exactly one service, on the image docker-compose.yml pins 22ms
     × runs the from-zero migration check — the consumer that makes that service load-bearing 14ms
     ✓ has NO step that reaches the database-backed vitest project — asserted step by step 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  … > runs the from-zero migration check — the consumer that makes that service load-bearing
AssertionError: no step of job `ci` runs `npm run db:check-migrations`. Steps parsed: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1, actions/setup-node@820762786026740c76f36085b0efc47a31fe5020, Install dependencies, Typecheck, Lint, Test: expected [] to have a length of 1 but got +0
 ❯ src/lib/mutations/__tests__/db-test-isolation.test.ts:422:7
```

**Exactly one red, and it is the consumer — the `services` assertion still PASSES**, which is the whole point: without the consumer anchor, this state would ship green. Restored; 21 passed.

### NC-B — the service image drifted from docker-compose.yml

`image: postgres:16-alpine` → `postgres:17-alpine` in `ci.yml` only.

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  … > provisions exactly one service, on the image docker-compose.yml pins
AssertionError: job `ci` service "postgres" runs image postgres:17-alpine while docker-compose.yml pins postgres:16-alpine. One pin, read from both files — change both or neither.: expected 'postgres:17-alpine' to be 'postgres:16-alpine' // Object.is equality

Expected: "postgres:16-alpine"
Received: "postgres:17-alpine"

 ❯ src/lib/mutations/__tests__/db-test-isolation.test.ts:407:7

 Test Files  1 failed (1)
      Tests  1 failed | 20 passed (21)
```

The message names **both** observed values, so the reader does not have to open two files. Restored; 21 passed.

### NC-C — a destructive statement aimed at the reference database

A line was inserted into `scripts/migrate-from-zero.mjs` immediately after its legitimate scratch-database drop:

```javascript
    await admin.unsafe(`DROP DATABASE IF EXISTS "${REFERENCE_DB}" WITH (FORCE)`)
```

```
 FAIL  … > no operational script aims a destructive statement at a database it may only read > 'scripts/migrate-from-zero.mjs' never aims a destructive statement at 'REFERENCE_DB'
AssertionError: scripts/migrate-from-zero.mjs:556 aims a destructive statement at REFERENCE_DB: await admin.unsafe(`DROP DATABASE IF EXISTS "${REFERENCE_DB}" WITH (FORCE)`): expected '    await admin.unsafe(`DROP DATABASE…' not to match /\bREFERENCE_DB\b/

- Expected:
/\bREFERENCE_DB\b/

+ Received:
"    await admin.unsafe(`DROP DATABASE IF EXISTS \"${REFERENCE_DB}\" WITH (FORCE)`)"

 ❯ src/lib/mutations/__tests__/db-test-isolation.test.ts:589:15
```

It names the **file and the line number** — which is why the stripper preserves the line count instead of reusing `readStrippedSource`. Restored with `git checkout --`; 21 passed.

### NC-D (extra) — the new anti-vacuity floor itself

Not required by the plan, but the floor is the assertion most likely to be silently useless, so it was proved too. The `.mjs` subject's `path` was temporarily pointed at `vitest.config.ts` (1559 chars, zero destructive keywords — a file that would satisfy the negative *vacuously*):

```
 FAIL  … > 'vitest.config.ts' really contains destructive statements outside its comments — the scan's floor
AssertionError: vitest.config.ts yielded no destructive statement on any non-comment line. Either the script stopped issuing DDL (in which case delete it from this scan deliberately) or the cstyle comment stripper is blanking real code.: expected 0 to be greater than 0
 ❯ src/lib/mutations/__tests__/db-test-isolation.test.ts:574:9
```

The floor catches both failure shapes it was written for: a file with nothing to guard, and a comment stripper that blanked real code. Restored.

## The CI Step, Proved on a Real Container

**I cannot run GitHub Actions from here.** What I could do was reproduce the CI step's exact conditions locally: the same image, the same credentials, the same `DATABASE_URL`, an empty maintenance database, and no `.env` influence.

```
$ docker run -d --name gsd-ci-pg-sim \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres \
    -p 55432:5432 \
    --health-cmd "pg_isready -U postgres" --health-interval 5s --health-timeout 5s --health-retries 10 \
    postgres:16-alpine
$ docker inspect -f '{{.State.Health.Status}}' gsd-ci-pg-sim
healthy
```

Then the step's own command, invoked as `node scripts/…` directly rather than through `npm run` so the interleaving is faithful (46-04 measured that `npm run` relays stdout and stderr over separate pipes and reorders them; exit codes are unaffected either way, and the exit code is what the CI job reads):

```
-> connection: localhost:55432/postgres (from process.env.DATABASE_URL)
-> scratch database: pipelite_migchk_3812094_1787630901261
-> reference database (read with SELECT only): postgres
-> snapshot reference: drizzle/meta/0019_snapshot.json — 36 tables, 293 table.column pairs, 41 declared index names, 20 journal entries
-> created pipelite_migchk_3812094_1787630901261
-> running `drizzle-kit migrate` against the scratch database — output verbatim:
No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/pedro/programming/pipelite/drizzle.config.ts'
Using 'postgres' driver for database querying
[✓] migrations applied successfully!
-> migrate exit code: 0
-> public tables: 36 | drizzle schema tables: 1 | drizzle.__drizzle_migrations rows: 20
-> A/tables: 36 built / 36 declared — IDENTICAL
-> A/columns: 293 built / 293 declared — IDENTICAL
-> A/indexes: 41 / 41 snapshot index names present (81 indexes in total) — IDENTICAL
SKIPPED: reference equivalence — postgres has 0 public tables, so it is not a populated reference (this is the expected state in CI)
-> removed pipelite_migchk_3812094_1787630901261
OK: the migration chain builds a complete schema from zero
EXIT=0
```

**`public tables: 36`, assertion set A green in all three dimensions, and the explicit `SKIPPED: reference equivalence` line** — 46-04's predicted branch 4, a stated skip rather than a silent pass. The container was removed afterwards (`docker ps -a --filter name=gsd-ci-pg-sim` → 0 rows).

## What Remains UNPROVEN Until CI Runs For Real

Stated plainly rather than claimed. **No GitHub Actions run has happened for this change.** Nothing has been pushed; both commits are local on `master`. Specifically NOT proved:

1. **That the real `ci` check goes green.** The run URL and `gh run view` conclusion the plan asked for do not exist yet, and no evidence is fabricated in their place.
2. **That GitHub's service-container plumbing behaves as declared** — that `ports: - 5432:5432` publishes on the runner's `localhost` as expected, and that the `--health-*` options are accepted in the `options:` string form. The local reproduction used `docker run` with the identical flags, which exercises Docker's side but not the runner's YAML-to-Docker translation.
3. **That `npm ci` on a clean GitHub checkout leaves `drizzle-kit` invocable by the script.** Locally the tree came from `npm install`; `Install dependencies` runs `npm ci`. The lockfile is the same input, so this is very likely, but it was not observed.
4. **Timing.** The service is healthy before the first step on paper; the migration step is the *seventh* step, minutes later, so a race is implausible — but "implausible" is not "measured".

**How to close the gap:** push the branch, open a pull request, and read the `ci` check's `Migration chain check` step log. It should show `public tables: 36`, three `IDENTICAL` lines and the `SKIPPED: reference equivalence` line, and the job should conclude success. If it does not, the correct response is to fix the workflow — not to relax the gate that this plan just re-anchored.

## Acceptance Verification

| Check | Expected | Observed |
|---|---|---|
| Task-1 run exits non-zero on exactly 2 `it`s | 2 | **2** (services mapping, consumer step) |
| All other `it`s pass in that red run | yes | **19 passed** |
| `:123-126` / `:128-135` unchanged | unchanged | **byte-identical, verified from the diff** |
| `not.toContain("services:")` in the test file | 0 | **0** |
| `not.toContain("postgres")` in the test file | 0 | **0** |
| `migrate-from-zero` in the test file | ≥ 1 | **3** |
| Task-2 run exits zero, test file unedited | empty diff | **empty** |
| `ci.yml` parses; one service; new step by name | yes | **`['postgres']`, `Migration chain check`** |
| CI service image === compose image | `true` | **`true`** (both `postgres:16-alpine`) |
| `npm run db:check-migrations` in ci.yml | 1 | **1** |
| `test:db` / `db.config` in ci.yml | 0 / 0 | **0 / 0** |
| `name: ci` in ci.yml | 1 | **1** |
| `if: ${{ !cancelled() }}` in ci.yml | 3 | **3** |
| NC-A recorded verbatim, restored | yes | **yes** |
| NC-B recorded verbatim, restored | yes | **yes** |
| NC-C recorded verbatim, restored | yes | **yes** |
| Real GitHub `ci` run green | — | **NOT RUN — see the section above** |
| `npm test` | green | **4687 passed / 32 skipped across 170 files; rsc 8/8** |
| `npm run typecheck` | exit 0 | **exit 0** |
| `npm run lint` | 0 errors | **124 problems (0 errors, 124 warnings)** — the unchanged main-tree baseline |

## Decisions Made

- **The `!cancelled()` assertion shares an `it` with the consumer assertion.** The plan listed four assertions but required exactly *two* red `it`s in the task-1 run. A standalone fourth `it` would have been red too (no such step exists yet), making three. They belong together anyway: "the check runs, and it reports rather than aborting the job" is one claim about one step.
- **`toHaveLength(1)` on the consumer, not "at least one".** Two steps running the same check would mean someone duplicated it; the exact count says so.
- **A bespoke line-preserving stripper instead of `readStrippedSource`.** That helper deletes block comments outright, collapsing line numbers, and the scan's whole value is being able to say `scripts/migrate-from-zero.mjs:556`. The new `codeLines()` blanks comments in place, tracks `/* */` across lines, and is quote-aware so `postgresql://…` inside a template literal is not mistaken for a comment.
- **`\bREFERENCE_DB\b` with both word boundaries.** `REFERENCE_DATABASE_URL` is a legitimate env var in the same file; an unanchored pattern would have flagged it. (Same class of bug the script's own header records at `:108-112` and 46-02 hit for real.)
- **`POSTGRES_DB: postgres`** — the maintenance database. This is what puts the script on reference branch 4 (`0 public tables → SKIPPED`), which 46-04 named as the intended CI behaviour and which keeps assertion set A fully authoritative there.
- **Health check retries 10 × 5s, not compose's 5.** A GitHub runner's first-ever pull of the image competes with nothing locally cached; a slightly longer window costs nothing and an intermittently-red required check is worse than no check.
- **The step is last, after `Test`.** It is the slowest gate and the one most likely to be affected by an earlier failure's cause; with `!cancelled()` every gate reports regardless of order, so ordering is purely about reading the log top to bottom.

## Deviations from Plan

**None — plan executed exactly as written.** Three notes, none of which change scope or intent:

1. **The plan's `<verify>` block calls `npx vitest`.** `npx <tool>` is rewritten into a nonexistent npm script by this environment's shell hook (recorded in 46-03's SUMMARY), so vitest was invoked as `./node_modules/.bin/vitest`. Identical binary, identical arguments.
2. **The plan's acceptance criteria use `grep -c`.** `grep -c` and `grep | wc -l` have been measured unreliable in this environment since 46-01. Every count in this SUMMARY was recomputed with `node -e` string splits.
3. **NC-D was added.** The plan required three negative controls; a fourth proves the new anti-vacuity floor can itself go red. It costs one temporary edit and closes the one assertion in the amendment that could otherwise have shipped unobserved.

**Total deviations:** 0
**Impact on plan:** None.

## Known Stubs

None. Every assertion added in this plan was observed both green and red, except the three enumerated in **What Remains UNPROVEN** — which are properties of GitHub's runner, not of code in this repository, and which are explicitly recorded as unproven rather than claimed.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change. The plan's register is closed as written:

- **T-46-05-01** (a required check that never passes) — *mitigated*: no new check-run name; the step carries `!cancelled()`; the per-step enumeration asserts the mechanism that would actually strand the job, and the base project still excludes the `*.db.test.*` glob.
- **T-46-05-02** (a gate weakened to green) — *mitigated*: the proxy was replaced by four direct assertions, both anchor blocks are byte-identical and verified so from the diff, and both new assertions were observed red on purpose.
- **T-46-05-03** (an unpinned external image) — *accepted as planned*: a service container takes an image tag, not a SHA-pinnable action. The tag equals `docker-compose.yml`'s and is asserted relationally so the two cannot drift; the exception is documented in `ci.yml` so it is not mistaken for an oversight; the container holds only a database created and dropped within the job.
- **T-46-05-04** (credentials in logs) — *mitigated*: throwaway user/password on an ephemeral container, no repository secret referenced, the script never prints its connection string (confirmed again in the local run above — only `host:port/db`), `persist-credentials: false` untouched.
- **T-46-05-05** (a destructive statement reaching a reference database) — *mitigated and OBSERVED*: NC-C above.
- **T-46-05-SC** — nothing was installed. No package-manager invocation of any kind.

## User Setup Required

None locally. **One action is needed for this plan's value to be realised:** push the branch and confirm the `ci` check passes on GitHub hardware. Until then the gate exists but has never executed in the environment it was written for.

## Next Phase Readiness

- **DEPLOY-01 SC-3 is structurally complete** — the check exists (46-04) and is now enforced (46-05). It is not marked as a completed requirement here, because the requirement also carries SC-2 (`/api/health` 200 against the migration-built database), which is plan 46-06's.
- **Plan 46-06 is unblocked.** This plan touched no migration, no `Dockerfile`, no `.env`, no `docker-compose.yml` and no docs.
- **A note for whoever next edits `ci.yml`:** the workflow is now read by two gates, `db-test-isolation.test.ts` (job name, services, per-step `run:` values) and `node-engines-floor.test.ts` (`node-version`, which throws unless exactly one `actions/setup-node` step exists in job `ci`). Restructuring the job means re-anchoring both readers, not deleting them.
- **Deferred, unchanged:** converting `scripts/dedup-db-test-setup.sh` to build from the repaired chain; converting `Dockerfile`'s `npm install --legacy-peer-deps` to `npm ci`.

---
*Phase: 46-migration-chain-toolchain-floor*
*Completed: 2026-08-25*

## Self-Check: PASSED

Files claimed modified, verified present on disk: `src/lib/mutations/__tests__/db-test-isolation.test.ts`, `.github/workflows/ci.yml`. Commits claimed, verified in `git log --oneline --all`: `9457938` (`test(46-05): assert the CI/db-project invariant directly instead of by proxy`), `aa39784` (`feat(46-05): run the from-zero migration check on the required ci job`). No missing items.
