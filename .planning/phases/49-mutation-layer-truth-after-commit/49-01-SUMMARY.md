---
phase: 49-mutation-layer-truth-after-commit
plan: 01
subsystem: testing
tags: [vitest, postgres, drizzle, custom-fields, fixture, db-test, fs-unlink, EISDIR]

# Dependency graph
requires:
  - phase: 48-rest-api-authorization
    provides: "api-key-fixture.ts (the shared-fixture-module convention) and the activities-scope.db.test.ts harness skeleton, both copied here"
provides:
  - "mintFieldDefinition / removeFieldDefinitions — the subject-manufacturing fixture for custom_field_definitions, with a caller-supplied id and a hard-delete teardown that returns its row count"
  - "A behavioural proof that getActiveFieldDefinitions is UNCACHED: a definition inserted mid-run is returned by the very next call"
  - "The three zero-counts RE-MEASURED against the running database, plus the A4 publicUrl follow-up research named and did not run"
  - "The storage-failure injection seam EXECUTED: unlink-on-a-directory raises EISDIR at uid 1000 AND uid 0, so plan 49-07 needs no fallback"
  - "A negative control retiring research option (B): chmod 0500 RESOLVES as root"
affects: [49-05, 49-07, 49-08, 49-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared test-fixture module with a REQUIRED caller-supplied id and no crypto.randomUUID fallback"
    - "Teardown that returns its own row count, so a caller asserts a named-integer floor on it rather than trusting it"
    - "Pre-mint counts captured in beforeAll and asserted in a cell, making a baseline floor order-independent"

key-files:
  created:
    - src/lib/__tests__/custom-field-definition-fixture.ts
    - src/lib/__tests__/custom-field-definition-fixture.db.test.ts
  modified:
    - .planning/phases/49-mutation-layer-truth-after-commit/49-VALIDATION.md

key-decisions:
  - "Plan 49-07 must use research option (A), the directory seam — EISDIR confirmed at uid 1000 and uid 0. Option (B) is retired by measurement, not preference."
  - "dedup.db.test.ts is deliberately NOT modified. Its parity constraint never materialises because this fixture cleans up completely; proven by running that file (22 passed)."
  - "The fixture module lives in src/lib/__tests__/ so all three consumers can import it without reaching into another feature's test directory; the -fixture.ts suffix is collected by no vitest project."
  - "afterAll's leftover predicate counts by id prefix IGNORING deleted_at (the house pattern, and the stronger choice), which changes which half a soft-delete sabotage reddens — recorded rather than papered over."

patterns-established:
  - "Anti-vacuity matched pair: remove a floor and show the suite goes GREEN against the very condition the floor exists to catch, then restore it and show it is the ONLY cell that reddens"
  - "Isolating sabotage: to prove two teardown halves are not redundant, sabotage with a leak the other half CANNOT see (an unprefixed row) rather than one both can"

requirements-completed: [SEC-04, DATA-01, DATA-02]

# Metrics
duration: 12min
completed: 2026-08-26
---

# Phase 49 Plan 01: Fixture and Premise Verification Summary

**A shared `custom_field_definitions` fixture with a caller-supplied id and a self-check that proves `getActiveFieldDefinitions` is uncached, plus the three zero-counts re-measured and the `EISDIR` injection seam executed at two uids instead of reasoned about.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-26T11:33:50Z
- **Completed:** 2026-08-26T11:49:30Z
- **Tasks:** 2 (Task 2 was TDD: RED then GREEN)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- **The premise held under re-measurement.** All three zero-counts are still zero, and the A4
  follow-up probe research named but never ran is now run. **Plans 49-05, 49-07 and 49-08 may
  proceed on the measured premise** — no proof needs re-designing.
- **The MEDIUM-confidence seam is now EXECUTED, not reasoned.** `unlink` on a directory raises
  `EISDIR` at **both** uid 1000 (the uid vitest actually runs as) and uid 0. Research's
  "regardless of uid" claim is confirmed at the one uid that would have broken it.
- **Research option (B) is retired by measurement.** `chmod 0500` on the parent directory
  **resolves** as root — it would have produced a *successful* deletion inside a test named for a
  failure path.
- **The fixture exists and its behaviour is proven, not assumed** — 14 cells against real
  PostgreSQL, including the uncached-reader hand-off that three later proofs silently depend on.
- **Four red observations recorded verbatim**, one more than the plan required, and one of them
  corrects a wrong prediction in the plan itself.

## Task Commits

1. **Task 1: Re-measure the three zero-counts and EXECUTE the storage-failure seam** — `ab3529b` (docs)
2. **Task 2 (RED): the fixture's failing self-check** — `bd6d5c3` (test)
3. **Task 2 (GREEN): the fixture module** — `ff7e5ae` (feat)

No REFACTOR commit: the GREEN implementation is 157 lines with no duplication to remove, and a
refactor commit with no change is noise.

**TDD gate sequence verified in git log:** `test(49-01)` at `bd6d5c3`, then `feat(49-01)` at
`ff7e5ae`. Both gates present, in order.

## Files Created/Modified

- `src/lib/__tests__/custom-field-definition-fixture.ts` (created) — `mintFieldDefinition` and
  `removeFieldDefinitions`. Nothing else is exported.
- `src/lib/__tests__/custom-field-definition-fixture.db.test.ts` (created) — 14 cells: the guard's
  four self-assertions, three baseline-floor cells, three hand-off cells, the soft-delete
  discrimination, two teardown cells, and a round-trip cell.
- `.planning/phases/49-mutation-layer-truth-after-commit/49-VALIDATION.md` (modified) — the three
  Preconditions checkboxes ticked with their measured values, plus a new subsection carrying (c),
  (d), (e) and the seam observation.

---

## THE FIVE MEASUREMENTS, VERBATIM

Each is shown beside the statement that produced it. All run as
`docker compose exec -T postgres psql -U pipelite -d pipelite` through `rtk proxy` so the output is
not mangled. **The live `pipelite` database was READ-ONLY in this plan — `select` only.**

### (a) The full live type distribution

`select type, count(*) from custom_field_definitions where deleted_at is null group by type order by 2 desc`

```
     type      | count
---------------+-------
 text          |    62
 multi_select  |    56
 single_select |    28
 number        |    12
 date          |    11
(5 rows)
```

`formula` and `file` appear as an **absence** in a distribution, not as a zero I asserted. The
totals, taken in the same statement:

```
 total_live | formula_live | file_live
------------+--------------+-----------
        169 |            0 |         0
```

**169 live, 0 formula, 0 file — matching research exactly.** The plan's own verify query returns
the combined figure:

```
$ ... -t -c "select coalesce(sum(case when type in ('formula','file') then 1 else 0 end),0)
             from custom_field_definitions where deleted_at is null"
        0
```

### (b) + (c) The descriptor probes, including the A4 follow-up

`Assumptions Log A4` warned that a file descriptor written **without** a `storedName` key would
evade probe (b), and named "repeat the query for `'%publicUrl%'`" as the cheapest check — which
research did not run. Both probes were run side by side:

```
      tbl      | storedname | publicurl | rows_total
---------------+------------+-----------+------------
 people        |          0 |         0 |      38348
 deals         |          0 |         0 |      25195
 activities    |          0 |         0 |      79022
 organizations |          0 |         0 |      46054
(4 rows)
```

**A4 is resolved by measurement rather than left as an assumption.** Zero on both probes across
**188,619 rows**. There is no `publicUrl`-only descriptor shape hiding from the `storedName` probe,
so SC-2 genuinely has no live subject and must manufacture one.

### (d) Retention settings

`select key, value from app_settings where key in ('audit.retention_days','trash.retention_days')`

```
         key          | value
----------------------+-------
 audit.retention_days | 90
 trash.retention_days | 30
(2 rows)
```

`audit.retention_days = 90` is now a measurement **in this phase's own record**, not a citation of
the ROADMAP amendment. The retired "indefinitely" claim is not repeated anywhere in this plan's
output. (`trash.retention_days = 30` was not required but comes free from the same statement.)

### (e) Storage configuration

```
$ docker compose exec -T app printenv FILE_STORAGE
printenv FILE_STORAGE exit=1          <- UNSET, which means 'local'

$ docker compose exec -T app printenv UPLOAD_DIR
/app/uploads

$ docker compose exec -T app ls -la /app/uploads
total 8
drwxr-xr-x    2 nextjs   nodejs        4096 Aug 26 02:46 .
drwxr-xr-x    1 root     root          4096 Aug 26 06:58 ..
```

`FILE_STORAGE` unset → `'local'`, so SC-1's local-only scope is the scope that matters here. The
upload directory is **empty**, so nothing pre-exists on disk to confuse an SC-2 fixture.

### STOP CONDITION: NOT TRIGGERED

Every figure the stop condition names is zero. **Plans 49-05, 49-07 and 49-08 may proceed on the
measured premise.** Each must still manufacture its own subject — the premise being *confirmed* is
exactly what makes that necessary.

---

## THE INJECTION SEAM — EXECUTED

`49-RESEARCH.md` § Assumptions Log **A1** was the one MEDIUM-confidence claim in the document:
`unlink` on a directory raising `EISDIR` "on Linux at any uid" was *reasoned from POSIX, not
executed*. Plan 49-07's entire injected-failure proof rests on it. It has now been run.

**Observed verbatim:**

```
SEAM LIVE: code=EISDIR errno=-21 syscall=unlink msg=EISDIR: illegal operation on a directory, unlink '/tmp/seam-Dt6hCu/blob.pdf' uid=1000
SEAM LIVE: code=EISDIR errno=-21 syscall=unlink uid=0
```

- **uid 1000** is the uid the vitest process actually runs as. Confirmed rather than assumed:
  `node -e "process.getuid()"` → `1000`, `id -u` → `1000`, under `vitest/4.1.11 node-v24.13.1`.
- **uid 0** was exercised inside the container (`docker compose exec --user root app`) because root
  is the one uid at which a permission-based seam would silently pass. `EISDIR` fires there too.

**Conclusion, stated as the observation rather than the prediction:** the seam requires only a
deterministic rejection, and the observed code is `EISDIR` (`errno=-21`), which is what research
predicted. **Plan 49-07 must use research option (A) — the directory seam. No fallback is needed
and option (C) is not required for the local proof.** The S3 branch remains behaviourally
unreachable in this environment (SEC-49-A); a plan must not claim it.

### Negative control: research option (B) is DEAD as root

Executed so that "(A) over (B)" is a measurement rather than a preference. Research flagged the
caveat; nobody had run it:

```
OPTION B DEAD: unlink RESOLVED despite chmod 0500 parent, uid=0
```

A `chmod 0500` seam under a root test process **succeeds at deleting the file**. A test named "the
purge survives a storage failure" built on it would have asserted a mismatch that never happened —
a gate that cannot fail, which is the exact failure mode this milestone is trying to stamp out.
**49-07 must not use option (B).**

---

## THE FOUR RED OBSERVATIONS

The plan asked for three. A fourth was added because the plan's prediction about R2 turned out to
be wrong for this implementation, and the observation that actually proves the point needed a
different sabotage.

### R1 — the insert disabled: the hand-off cells go RED, they do not pass on an empty array

Sabotage: `mintFieldDefinition`'s `db.insert` made unreachable.

```
FAIL > the uncached reader picks up a definition inserted mid-run … > returns the minted FORMULA definition, with its expression round-tripped
AssertionError: `getActiveFieldDefinitions` did not return a definition written after this process
started. Every Phase 49 proof that mints a subject mid-run depends on this hand-off; if it fails,
those proofs assert against a definition list that never contained their subject.:
expected [] to have a length of 1 but got +0

FAIL > … > returns the minted FILE definition, whose name contains no forward slash
AssertionError: expected [] to have a length of 1 but got +0

FAIL > … > CALLER-SUPPLIED ID IS WHAT LANDED — no row acquired a UUID from the column default
AssertionError: expected +0 to be 2 // Object.is equality

 Test Files  1 failed (1)
      Tests  6 failed | 8 passed (14)
```

`expected [] to have a length of 1` is the point: the cells assert a **length**, so an empty result
fails instead of vacuously satisfying a "contains no foreign row"-shaped check.

### R2 — the teardown soft-deletes: the plan's predicted split did NOT occur, and here is what did

Sabotage: `removeFieldDefinitions` changed from `db.delete` to `db.update({deletedAt})`.

The plan predicted "`afterAll`'s baseline-count half goes red while the leftover half does not."
**That is not what happened, and the difference is a property of this file's design rather than a
mistake in either place.** Run from a clean table:

```
 ❯ src/lib/__tests__/custom-field-definition-fixture.db.test.ts (14 tests | 3 failed)
     × hard-deletes the 2 minted rows and reports that number back
     × is idempotent: a second sweep removes nothing and says so
     × finds the minted ids by a direct LIKE on the production table name

⎯⎯ Failed Suites 1 ⎯⎯
AssertionError: expected 3 to be +0 // Object.is equality
 ❯ custom-field-definition-fixture.db.test.ts:220:33
    219|   // Half 1: nothing of ours is left.
    220|   expect(await countPrefixed()).toBe(0)

 Test Files  1 failed (1)
      Tests  3 failed | 11 passed (14)
```

**Half 1 is what reddened, at line 220 — not half 2.** The reason: this file's leftover predicate
counts by id prefix **ignoring `deleted_at`**, exactly as `activities-scope.db.test.ts`'s
`LEFTOVER_PREDICATE` does. That is the house pattern and the stronger choice — a leftover check that
filtered on `deleted_at is null` would be *blind* to a soft-deleted leak, which is the very leak in
question. The plan's predicted split would only occur in a file that made that weaker choice.
Recorded rather than papered over, and recorded rather than "fixed" by weakening the predicate.

**A cascade worth naming**, observed on the following run: a soft-delete teardown makes the NEXT
run fail at `beforeAll`, because clean-first no longer removes anything and the mint collides with
the primary key:

```
Caused by: PostgresError: duplicate key value violates unique constraint "custom_field_definitions_pkey"
Serialized Error: { code: '23505', detail: 'Key (id)=(cfdfix-def-formula) already exists.', … }
 ❯ mintFieldDefinition src/lib/__tests__/custom-field-definition-fixture.ts:119:3
 ❯ |db| … (14 tests | 14 skipped)
```

This is the concrete cost of a teardown that reports success without achieving it: not one red cell,
but a whole file that cannot collect. It is also why `removeFieldDefinitions` returns its count.

### R3 — the observation that actually proves the two halves are not redundant

Because R2 reddened both halves, an isolating sabotage was needed. Sabotage: `mintFieldDefinition`
additionally inserts a row **with no `id`**, letting the column's
`$defaultFn(() => crypto.randomUUID())` fire — i.e. simulating precisely the hazard the module's
"caller supplies the id" rule exists to prevent.

```
 ❯ src/lib/__tests__/custom-field-definition-fixture.db.test.ts (14 tests | 1 failed)
     × hard-deletes the 2 minted rows and reports that number back

⎯⎯ Failed Suites 1 ⎯⎯
AssertionError: expected 3 to be +0 // Object.is equality
 ❯ custom-field-definition-fixture.db.test.ts:226:39
    226|   expect(await countAllDefinitions()).toBe(baselineTotal)
```

**Half 1 (line 220) PASSED. Half 2 (line 226) went RED.** An unprefixed leftover is invisible to a
prefix sweep and visible only to the total-count comparison. The two halves are therefore
demonstrably not redundant — and the leak they differ on is the exact one the fixture's id rule
guards against.

### R4 — the baseline floor: a matched pair, not just "nothing notices"

The plan asked to delete the floor's assertion and confirm nothing else notices. Done, and then
strengthened into a pair by planting the row the floor exists to catch.

**Half one — floor removed, a pre-existing `type='formula'` row planted in the isolated table:**

```
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

**Fully green with somebody else's formula definition sitting in the table.** No other cell notices,
because the hand-off cells filter by the minted id and would happily "find their definition" beside a
foreign one. This is the vacuity the floor exists to prevent, reproduced.

**Half two — floor restored, same planted row still present:**

```
 ❯ src/lib/__tests__/custom-field-definition-fixture.db.test.ts (14 tests | 1 failed)
     × held ZERO live formula definitions before the fixture minted one

AssertionError: if the isolated database already held a formula definition, 'the reader returns the
minted definition' would pass without the fixture having worked at all — the reader would simply be
returning somebody else's row. This is the floor that rules that out.: expected 1 to be +0

 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
```

The floor is the **only** cell that reddens. So it is not decorative, and it is not redundant with
anything else in the file — which is a stronger statement than the plan asked for.

The planted row was removed afterwards; `git diff --exit-code` is clean and the table is back to 0.

---

## Verification

| Check | Result |
|---|---|
| `vitest run --config vitest.db.config.ts …fixture.db.test.ts` | **14 passed / 14** |
| `npm test` (base) | **5546 passed / 32 skipped over 180 files** — exactly the baseline, unchanged |
| `npm test` (RSC) | **8 passed / 8** |
| full db project (`npm run test:db`) | **211 passed / 0 failed** (baseline 197 + 14 new) |
| `dedup.db.test.ts` run alone | **22 passed** — no leak reported |
| `tsc --noEmit` | exit **0** |
| `npm run lint` | **0 errors** (118 warnings; the warning total is not a gate — not reproducible across trees) |
| `git diff --exit-code` | clean after all four sabotages restored |
| base project collects the fixture module? | **No** — `vitest list --filesOnly` finds neither new file |
| db project collects the db test? | **Yes, exactly one:** `[db] src/lib/__tests__/custom-field-definition-fixture.db.test.ts` |

The base suite being **identical** to the baseline (5546/180 files, not 5547 or 181) is the positive
confirmation that the `-fixture.ts` suffix and the `*.db.test.*` exclusion both work as claimed —
the count would have moved if either file had been collected there.

**DEF-48-01 confirmed still live and correctly ignored.** `npm run test:db` exits non-zero on a
green suite; the only failure is the known one, in a teardown hook, in a file this plan does not
touch:

```
 Test Files  1 failed | 8 passed (9)
      Tests  211 passed (211)

 FAIL |db| src/lib/views/queries.db.test.ts
Error: Failed query: select count(*)::int as n from "saved_view_defaults" where id::text like $1
Caused by: PostgresError: column "id" does not exist   { code: '42703' }
```

**211 tests passed, 0 tests failed.** Counts read, exit code ignored, exactly as the constraint
requires.

## Decisions Made

1. **49-07 uses research option (A).** Decided on the observation (`EISDIR` at uid 1000 and uid 0),
   not the prediction. Option (B) is excluded by its own executed negative control.
2. **`dedup.db.test.ts` is deliberately left untouched.** `49-PATTERNS.md` § 11 warns that adding
   `custom_field_definitions` to its `TOUCHED_TABLES` is a two-sided change, and the orchestrator
   brief warned it "will report a leak it did not cause." **It does not** — verified by running that
   file (22 passed) and the whole db project (211 passed). The constraint is conditional on a plan
   minting definitions *from inside* `dedup.db.test.ts`; this plan's fixture cleans up completely
   (hard delete, asserted by a returned count AND a baseline-equal total), so nothing leaks into that
   file's view. A later plan that mints from inside it must do that work there, and this file's
   header says so.
3. **`src/lib/__tests__/` for the fixture module**, stated in its header rather than picked
   silently: it follows `api-key-fixture.ts`'s precedent of living inside a `__tests__/` directory,
   and it is import-reachable from all three consumers without any of them reaching into another
   feature's test directory.
4. **The leftover predicate ignores `deleted_at`** (house pattern, stronger). Consequence for R2
   documented above rather than the predicate weakened to match a prediction.
5. **The pre-mint counts are captured in `beforeAll` and asserted in a cell**, rather than queried
   inside the cell. The seed runs in the same hook, so by the time any `it` body executes the
   definition exists; recording the number at the only moment it is meaningful keeps the floor
   order-independent.
6. **No REFACTOR commit.** Nothing to remove.

## Deviations from Plan

### 1. [Rule 2 — Missing critical coverage] A fourth red observation, because the plan's R2 prediction was wrong

- **Found during:** Task 2, red observations
- **Issue:** The plan predicted the soft-delete sabotage would redden `afterAll`'s baseline half
  while leaving the leftover half green, thereby proving the halves non-redundant. Measured, it
  reddens the **leftover** half — because this file's leftover predicate ignores `deleted_at`, which
  is the house pattern and the stronger choice. The plan's intended demonstration therefore did not
  occur, and accepting the sabotage as-is would have left "the two halves are not redundant" as an
  unproven claim with a red observation misfiled beside it.
- **Fix:** Recorded R2's actual result verbatim, then added **R3** — an isolating sabotage (an
  unprefixed row, simulating the `$defaultFn` hazard) that half 1 structurally cannot see. Half 1
  passed, half 2 reddened, and the non-redundancy is now measured rather than asserted.
- **Files modified:** none permanently (sabotages restored; `git diff --exit-code` clean)
- **Verification:** transcripts under R2 and R3 above
- **Committed in:** documentation only, in this SUMMARY

### 2. [Rule 2 — Missing critical coverage] Two extra executed controls beyond the plan's five measurements

- **Found during:** Task 1
- **Issue:** The plan asked only that the seam be run "a second time as the same uid the vitest
  process runs as". Two adjacent claims were still un-executed: research's "regardless of uid"
  wording, and option (B)'s "succeeds anyway as root" caveat. Either could silently change 49-07's
  design.
- **Fix:** Ran the seam at **uid 0** as well as uid 1000, and ran option (B)'s `chmod 0500` seam at
  uid 0. The first confirms the uid-independence claim at the uid that would break it; the second
  retires option (B) by measurement.
- **Files modified:** `49-VALIDATION.md` (records both)
- **Verification:** `SEAM LIVE … uid=0` and `OPTION B DEAD … uid=0`, both quoted above
- **Committed in:** `ab3529b`

### 3. [Rule 2 — Missing critical functionality] An idempotency cell and a `position` round-trip assertion

- **Found during:** Task 2
- **Issue:** The plan's behaviour spec did not require either. `removeFieldDefinitions` is called
  three times per run (clean-first, the teardown cell, `afterAll`), so repeat-safety is a
  correctness requirement rather than a nicety — and a teardown that reported a count it had not
  achieved would be invisible without a second sweep. Separately, `position` is `numeric(20,10)`,
  which drizzle surfaces as a **string**; the fixture's default has to be a value the column
  accepts, and an unasserted default is how that breaks later for a consumer that never touches it.
- **Fix:** Added "is idempotent: a second sweep removes nothing and says so" (asserts the second
  call returns exactly 0) and a `typeof position === "string"` round-trip assertion.
- **Files modified:** `src/lib/__tests__/custom-field-definition-fixture.db.test.ts`
- **Verification:** both cells green; the idempotency cell independently reddened under R2
  (`expected 2 to be +0`), so it is not decorative
- **Committed in:** `bd6d5c3`

---

**Total deviations:** 3, all Rule 2 (missing critical coverage). **No Rule 4 situations arose.**
**Impact on plan:** additive only. No scope creep — every addition is a control over something this
plan or a downstream plan already depends on. One plan prediction is corrected by measurement.

## Issues Encountered

- **The soft-delete sabotage polluted the isolated table and cascaded into the next run** (23505 at
  `beforeAll`, 14 skipped). Resolved by hard-deleting the `cfdfix-%` rows directly and re-running
  the sabotage from a clean table so the transcript above is an accurate single-run record rather
  than a picture of accumulated damage. Worth knowing for anyone repeating this: a sabotage that
  breaks teardown must be cleaned up out-of-band before the next observation, or the second
  transcript describes the first sabotage.
- **The worktree was stale by 30 commits**, as it has been for every executor in this project.
  Corrected with `merge --ff-only` (never `reset --hard`, since sibling executors 49-02 and 49-03
  are live) and verified by asserting `49-09-PLAN.md` exists.
- **`rtk` output mangling** hit once: a `grep -n "^## "` over `49-RESEARCH.md` returned a
  restructured summary rather than the matched lines. Worked around with `rtk proxy grep` for exact
  output and the Read tool for file contents. No count in this SUMMARY comes from a pipe.

## Known Stubs

None. Both new files are complete: the fixture exports exactly the two functions the plan specifies,
and every cell described in the plan's `<behavior>` block exists and passes.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change at a trust boundary.
The threat register's own mitigations are all in place and asserted:

| Threat ID | Mitigation status |
|---|---|
| T-49-01-01 (hard delete against the live database) | `assertIsolatedConnection` copied verbatim, invoked at module scope, asserted by 4 cells including the accept cell |
| T-49-01-02 (self-check passing on a pre-existing definition) | BASELINE FLOOR cells; **proven non-vacuous by R4's matched pair** |
| T-49-01-03 (proceeding on research's counts) | all five measurements re-run; STOP condition evaluated and not triggered |
| T-49-01-04 (unexecuted POSIX claim) | executed at uid 1000 and uid 0; option (B) retired by its own control |
| T-49-01-05 (a leaked `cfdfix-` definition activating the formula path) | hard delete + returned count + two-part `afterAll`; **R3 proves the second half is not redundant** |
| T-49-01-06 (a credential in a committed command) | no command in this plan carries one; `docker` needs no `sudo` here |
| T-49-01-07 (the fixture module collected as a suite) | `vitest list --filesOnly` finds it in neither project; base suite count unchanged at 5546 |

## Next Phase Readiness

**Wave 1's foundation is delivered and the two facts downstream plans were told to stop re-deriving
are pinned:**

- **49-05 (SC-4)** — import `mintFieldDefinition` from
  `src/lib/__tests__/custom-field-definition-fixture`. The uncached-reader hand-off it depends on is
  proven behaviourally. It must manufacture its formula definition; the premise that it has to is
  confirmed.
- **49-07 (SC-2)** — use **research option (A)**, the directory seam. `EISDIR` (`errno=-21`) at both
  uid 1000 and uid 0. Do **not** use option (B). The S3 branch stays out of scope (SEC-49-A).
- **49-08 (SC-3)** — same fixture; mint a `formula` definition with a `config.expression`. Field
  names must contain no `/`.
- **49-09 (sign-off)** — four red observations are recorded verbatim above, so this plan's gates are
  DELIVERED under the milestone rule. Note that DEF-48-05 / SEC-48-C was **not** absorbed, S3
  coverage is **not** claimed, and the "recoverable indefinitely" claim is **not** repeated.

**One caveat to carry forward:** `STATE.md` and `ROADMAP.md` were deliberately **not** modified —
this executor ran in a worktree alongside 49-02 and 49-03, and the orchestrator owns those writes
after the wave completes.

## Self-Check: PASSED

All four claimed files exist on disk:

- `src/lib/__tests__/custom-field-definition-fixture.ts` (7.4K)
- `src/lib/__tests__/custom-field-definition-fixture.db.test.ts` (19.4K)
- `.planning/phases/49-mutation-layer-truth-after-commit/49-01-SUMMARY.md` (28.0K)
- `.planning/phases/49-mutation-layer-truth-after-commit/49-VALIDATION.md` (15.1K)

All four claimed commits exist in `git log --oneline --all`: `ab3529b`, `bd6d5c3`, `ff7e5ae`,
`6dcf729`. `git diff --diff-filter=D ab3529b~1 HEAD` reports **no deleted files** — nothing was
destroyed across the four commits. Working tree clean; no untracked files outside `.planning/`.

---
*Phase: 49-mutation-layer-truth-after-commit*
*Completed: 2026-08-26*
