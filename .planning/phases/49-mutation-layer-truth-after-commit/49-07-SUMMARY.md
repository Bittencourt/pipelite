---
phase: 49-mutation-layer-truth-after-commit
plan: 07
subsystem: mutations
tags: [purge, blob-deletion, post-commit, EISDIR, db-test, vitest, postgres, SEC-04, SC-2]

# Dependency graph
requires:
  - phase: 49-mutation-layer-truth-after-commit
    provides: "49-01's mintFieldDefinition fixture and the executed EISDIR seam; 49-02's collectFileFieldRefs / deleteEntityFiles with their field-directory containment and call-time env read; 49-04's entity-resolving file route; 49-06's session-auth db-test harness"
provides:
  - "Post-commit, best-effort blob deletion in all four purge mutations, with a mismatch log carrying { entityType, id, expected, deleted } and no filename"
  - "src/lib/trash/purge-blobs.db.test.ts — 21 cells: four entity types against real bytes, the URL going dark, and an injected EISDIR failure that leaves the purge committed"
  - "The cost of widening PurgeResult MEASURED: 11 of 11 exact assertions break (org 3, people 3, deals 3, activities 2)"
  - "prune.ts's 'UPLOADED FILE BLOBS ARE NOT REMOVED' block retired and replaced by a pointer at the four mutations"
  - "Two defects found in this plan's own proof, both reddening a CORRECT implementation"
affects: [49-08, 49-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Post-commit best-effort side effect: numbered comment naming why it is outside, one try/catch per concern, catch body exactly one log.error with a literal scope"
    - "Mismatch as a LOG rather than a widened return type, with the widening cost measured as a count instead of cited"
    - "A restore helper that re-INSERTS rows a cell destroyed, re-LINKS foreign keys a cell nulled, and rewrites the bytes a cell unlinked"
    - "Spy call capture COPIED OUT before mockRestore(), because mockRestore clears mock.calls"

key-files:
  created:
    - src/lib/trash/purge-blobs.db.test.ts
  modified:
    - src/lib/mutations/organizations.ts
    - src/lib/mutations/people.ts
    - src/lib/mutations/deals.ts
    - src/lib/mutations/activities.ts
    - src/lib/trash/prune.ts

key-decisions:
  - "The mismatch is a LOG, not a widened PurgeResult — and the decision now carries a MEASURED number: 11 of 11 exact toEqual assertions break under the widening, plus all six result-shape assertions in this plan's own file."
  - "The injected-failure cell asserts the ROW IS GONE before it asserts the log, because the row is the criterion and the log is the evidence."
  - "The mismatch-log assertion precedes the barrier assertion, so the first red names the absent post-commit block rather than a subsidiary property of one that exists."
  - "The db test is a SIBLING in src/lib/trash/, overriding 49-VALIDATION.md's __tests__/ path: that module has no __tests__/ directory and all six of its tests are siblings."
  - "vi.hoisted IS required for UPLOAD_DIR despite 49-02's call-time env read, because this file also drives the file route, which reads it at module scope. The plan said otherwise."
  - "The URL positive anchor is taken while the record is LIVE, not while trashed: 49-04's resolver carries isNull(deletedAt), so the plan's literal wording would have failed against correct code."
  - ".planning/STATE.md was deliberately NOT modified — the orchestrator owns it after the wave. The exact replacement text is handed off below."

patterns-established:
  - "When a threshold matcher trips suite-timing-hygiene over a path derived from Date.now(), replace it with the EXACT assertion the gate prescribes — which is also the stronger claim — never weaken the gate"
  - "Driving a 'never rethrow' ablation in three escalating forms, because the first two are contained and prove the containment rather than the rule"

requirements-completed: [SEC-04]

# Metrics
duration: 27min
completed: 2026-08-26
---

# Phase 49 Plan 07: SC-2 — Post-Commit Blob Deletion Summary

**A purge now removes the bytes in all four entity types, and an `EISDIR` failure injected into the middle of that deletion leaves the purge committed, the other blob deleted, and a two-number mismatch on the record — measured, not reasoned.**

## Performance

- **Duration:** ~27 min
- **Started:** 2026-08-26T13:06:00Z
- **Completed:** 2026-08-26T13:34:00Z
- **Tasks:** 2 (TDD: RED then GREEN)
- **Files modified:** 6 (1 created, 5 modified)

## Task Commits

1. **Task 1 (RED): the behavioural proof, reproducing the surviving blob** — `6139f0d` (test)
2. **Task 2 (GREEN): the four post-commit blocks and the retired comment** — `3576cbb` (feat)

No REFACTOR commit: the four blocks are deliberately near-identical and collapsing them into a shared helper would move the deletion out of the four files a reader looks in, which is the opposite of what constraint 8 asks for.

**TDD gate sequence verified in git log:** `test(49-07)` at `6139f0d`, then `feat(49-07)` at `3576cbb`. Both gates present, in order.

---

## THE PRE-FIX LEAK, ALL FOUR ENTITY TYPES, VERBATIM

`./node_modules/.bin/vitest run --config vitest.db.config.ts src/lib/trash/purge-blobs.db.test.ts` against the UNMODIFIED mutations:

```
 Test Files  1 failed (1)
      Tests  6 failed | 15 passed (21)
```

The four per-entity cells, each naming its own entity and its own absolute path:

```
 × SC-2 — after a purge, the record's blobs are gone from disk > purging a organization removes its bytes, leaves the neighbour's, and returns an unchanged result shape
   → SC-2: the purge committed but /tmp/purgeblob-uploads-2535345-1787749998292-acmnospq/purgeblob-org/Anexos Ação/3f1c0d4e-6b21-4f77-a0aa-000000000101.pdf is still on disk — the blob survived a permanent delete and stays reachable to anyone holding its URL.: expected true to be false // Object.is equality
 × … > purging a person …
   → SC-2: the purge committed but …/purgeblob-person/Documento Pessoal/3f1c0d4e-6b21-4f77-a0aa-000000000103.pdf is still on disk …: expected true to be false
 × … > purging a deal …
   → SC-2: the purge committed but …/purgeblob-deal/Contrato Assinado/3f1c0d4e-6b21-4f77-a0aa-000000000104.pdf is still on disk …: expected true to be false
 × … > purging a activity …
   → SC-2: the purge committed but …/purgeblob-activity/Comprovante/3f1c0d4e-6b21-4f77-a0aa-000000000105.pdf is still on disk …: expected true to be false
```

The URL cell, and the injected-failure cell:

```
 × SC-2 — the URL that served the blob serves nothing afterwards > answers 200 with the bytes while the record is live, and 404 with the bytes gone after the purge
   → the URL going dark is NOT the criterion — the bytes being gone is. This is the half plan 49-07 delivers.: expected true to be false

 × SC-2 — an injected storage failure leaves the purge COMMITTED and logs the mismatch > keeps the row deleted, logs expected/deleted with no filename, and still deletes the other blob
AssertionError: no mismatch line was logged. The count going short is the ONLY evidence a blob survived a committed purge; without this line the failure is silent.: expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0
```

### WHICH ASSERTIONS PASSED ANYWAY — the plan asked, and the answer matters

All **15** other cells passed against the unfixed code, and two groups of them are load-bearing:

- **The result-shape and row-gone assertions PASSED.** `expect(result).toEqual({ success: true, detached: N })` and `countById(table, id) === 0` were already correct in every one of the six purge cells before this plan touched anything. The purge itself was never broken — the transaction, the detach counts and the audit row all did what they claim. **The defect was exactly and only that the bytes were left behind.** That distinction is why the fix is additive and why `PurgeResult` did not need to move.
- **Every pre-flight floor passed**, including the four `collectFileFieldRefs` counts (2/1/1/1) and the nine `existsSync` checks — so the reds above are reds about real files, not about an empty set.

### THE URL-GOES-DARK CELL: ONE HALF WAS ALREADY TRUE, AND IT IS NOT THIS PLAN'S ACHIEVEMENT

Before the fix, that cell's `expect(after.status).toBe(404)` **passed**. The route already refused: `findOwnedRecordById` (`src/lib/api/file-access.ts:150-163`) carries `isNull(source.deletedAt)` and cannot resolve a row that no longer exists, which is plan 49-04's work proven behaviourally by 49-06. **This plan claims no credit for the 404.**

The half this plan delivers is the assertion beside it — `existsSync(target) === false` — which was the sixth red. Stated plainly: before this plan the URL was unreachable over a file that was still there for anyone who could read the disk, restore a backup, or reconfigure the route. Both halves are asserted in one cell precisely so neither can be mistaken for the other.

---

## THE MISMATCH LOG, CAPTURED VERBATIM

Observed by a one-off probe on the test's own assertion (`expect(mismatch.raw).toBe("PROBE_SHOW_RAW")`), applied and removed in the same session:

```
{"level":"error","scope":"mutations/organizations","msg":"Purged record's blobs were not all deleted","ts":"2026-08-26T13:20:59.146Z","entityType":"organization","id":"purgeblob-org","expected":2,"deleted":1}
```

`expected: 2`, `deleted: 1`, shortfall pinned to the named `SABOTAGED_REF_COUNT = 1`. **No filename, no `storedName`, no `path`** — T-37-30, and asserted three ways rather than trusted: two `not.toContain` checks on the fixture's stored names, one on its `filename`, and an exhaustive `toEqual` over the whole field set so a future edit that added a `paths` key could not slip past a substring search.

---

## THE FOUR ABLATIONS, EACH RED RECORDED VERBATIM

Every one applied AFTER `3576cbb` was committed — 49-03 and 49-04 both lost uncommitted work to `git checkout --` after an ablation, two for two. `git diff --exit-code` is clean after each.

### A1 — the deletion moved INSIDE the transaction

The ablation is the PLACEMENT. A throw is added with it, and that is not a second ablation: `deleteEntityFiles` never rejects by 49-02's design, so an inside-the-transaction deletion has **no observable consequence at all** without one, and the placement decision would be untestable. The throw is what makes the rollback visible.

```
AssertionError: expected { success: false, …(1) } to deeply equal { success: true, detached: 1 }

- Expected
+ Received

  {
-   "detached": 1,
-   "success": true,
+   "error": "Failed to purge organization",
+   "success": false,
  }
 ❯ src/lib/trash/purge-blobs.db.test.ts:1249:20
```

And with that assertion deferred by a labelled probe, so the ROLLBACK itself is on the record rather than only the returned failure:

```
AssertionError: SC-2's criterion: a storage failure must not roll back, block or misreport a committed purge. If this row is still here, a blob nobody can delete has made a record un-purgeable forever.: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1
```

**`expected 1 to be +0`: the organization is still in the database.** An undeletable blob made the record permanently un-purgeable. This is the assertion that carries SC-2, and this is the observation that proves it can fail.

### A2 — the mismatch `log.error` removed

Exactly the predicted split, and the two concerns are demonstrably independent:

```
 ✓ purging a organization removes its bytes, leaves the neighbour's, and returns an unchanged result shape
 ✓ purging a person …
 ✓ purging a deal …
 ✓ purging a activity …
 ✓ answers 200 with the bytes while the record is live, and 404 with the bytes gone after the purge
 × keeps the row deleted, logs expected/deleted with no filename, and still deletes the other blob
   → no mismatch line was logged. …: expected [] to have a length of 1 but got +0
```

All four blob-gone cells and the URL cell stay **green**; only the log-content cell reddens. Deletion and evidence are separate properties and each has its own red.

### A3 — "never rethrow", in three escalating forms, because the first two are CONTAINED

This is where the plan's single prediction was too coarse, and driving it properly is what produced the finding.

**A3a — `throw error` from the `catch`:**

```
 Test Files  1 passed (1)
      Tests  21 passed (21)
```

**Fully green. Nothing reddens.** The `catch` is **UNREACHABLE**: `deleteEntityFiles` swallows every failure internally and returns a short count, so no exception ever arrives there. The catch is honest belt-and-braces against a future change to that contract, but its "never rethrow" property **is not covered by a red observation and this SUMMARY does not claim it is.**

**A3b — `throw` from the reachable mismatch branch, catch left intact:**

```
 × keeps the row deleted, logs expected/deleted with no filename, and still deletes the other blob
   → no mismatch line was logged. …: expected [] to have a length of 1 but got +0
```

The result-shape assertion **passed** — the throw was caught by the inner `catch`, which logged `"Post-purge blob deletion failed"` (no `expected`/`deleted` fields, so correctly filtered out). This is evidence for the one-try-per-concern shape rather than against it: the deletion concern's failure could not escape.

**A3c — `throw` from the mismatch branch AND `throw error` from the catch, so the failure escapes:**

```
AssertionError: expected { success: false, …(1) } to deeply equal { success: true, detached: 1 }

- Expected
+ Received

  {
-   "detached": 1,
-   "success": true,
+   "error": "Failed to purge organization",
+   "success": false,
  }
```

And with the result assertion deferred, the cell got **past** `countById === 0` to the log assertion — so under A3c **the row IS gone** while the caller is told the purge failed. That is the precise distinction from A1, and it is the defect the "never rethrow" rule exists to prevent: a committed purge reported as a failure, so the operator retries a delete that already happened.

| Ablation | Row after the purge | Returned result |
|---|---|---|
| A1 (inside the transaction) | **still present** — rolled back | `{ success: false }` |
| A3c (rethrow escapes) | **gone** — committed | `{ success: false }` |
| shipped code | **gone** — committed | `{ success: true, detached: 1 }` + mismatch log |

### A4 — `PurgeResult` widened with `blobsDeleted`: the COUNT

The plan's own words: "this is not a defect hunt — it is the measurement that justifies the log-only decision with a number instead of a citation."

```
 Test Files  4 failed (4)
      Tests  11 failed | 210 passed (221)
```

**11 of 11.** The entire blast radius, not a subset:

| File | Broken | Assertion lines |
|---|---|---|
| `organizations.test.ts` | 3 | 968, 1010, 1063 |
| `people.test.ts` | 3 | 936, 996, 1017 |
| `deals.test.ts` | 3 | 1011, 1095, 1127 |
| `activities.test.ts` | 2 | 878, 898 |
| **total** | **11** | |

Cross-validated two ways: `vitest` reported `11 failed`, and an independent `node` AST-free line scan over the four files counted the same 3/3/3/2 split at the same line numbers the plan cites. No count in this SUMMARY comes from a `grep | wc -l` pipe.

Verbatim, the first of the eleven:

```
 FAIL  src/lib/mutations/activities.test.ts > purgeActivityMutation > deletes notes then the activity, in that ORDER, in one transaction
AssertionError: expected { success: true, detached: +0, …(1) } to deeply equal { success: true, detached: +0 }

- Expected
+ Received

  {
+   "blobsDeleted": 0,
    "detached": 0,
    "success": true,
  }
 ❯ src/lib/mutations/activities.test.ts:878:20
```

`dispatch.test.ts` and `prune.test.ts` stayed **green** under the widening (41 passed) — the type is declared there but nothing in either file reads the success arm's key set, so those two files would NOT have caught it. **The eleven are the whole detection surface, plus the six result-shape assertions in this plan's own file, which also reddened:**

```
 ❯ |db| src/lib/trash/purge-blobs.db.test.ts (21 tests | 6 failed)
AssertionError: expected { success: true, detached: 1, …(1) } to deeply equal { success: true, detached: 1 }
+   "blobsDeleted": 2,
```

So the per-cell `toEqual` is not decorative: it is a second, independent detector for an accidental widening, in the one file whose whole subject is the code that would do the widening.

---

## TWO DEFECTS IN THIS PLAN'S OWN PROOF — BOTH WOULD HAVE REDDENED CORRECT CODE

All six plans in this phase so far found a defect in their own plan. This one found two in its own *test*, and both were found by running rather than by reading.

### D1 — `mockRestore()` clears `mock.calls`, so the payload was read from an emptied spy

The first GREEN run reported **20 passed / 1 failed**, and the one red was:

```
AssertionError: no mismatch line was logged. …: expected [] to have a length of 1 but got +0
```

**Against a correct implementation that HAD logged the mismatch.** In Vitest, `mockRestore()` is `mockReset()` plus restoring the original implementation, and `mockReset()` clears `mock.calls`. Reading `errorSpy.mock.calls` in the assertion — after a `finally { errorSpy.mockRestore() }` — reads an empty array, always.

**This was a gate that could only ever be RED.** That is as useless as one that can only ever be green, and it is worse in one specific way: the obvious "fix" is to weaken the assertion to `toHaveBeenCalled()`, which would have passed for the wrong reason and deleted the two-number check that carries T-49-07-04. Fixed by copying the calls out inside the `finally` before the restore, with the measurement recorded in a comment at the site so it cannot come back.

### D2 — `suite-timing-hygiene` correctly flagged the barrier's `toBeGreaterThan(0)`

The first full base-suite run went **1 failed | 5651 passed**:

```
 FAIL  src/lib/__tests__/suite-timing-hygiene.test.ts > no test asserts on a clock-derived elapsed delta or ratio (SC-1b) > finds no elapsed-time assertion anywhere in the corpus
AssertionError: … Offenders: src/lib/trash/purge-blobs.db.test.ts:1123: [tainted/threshold] expect(readFileSync(neighbourPath).byteLength).toBeGreaterThan(0): expected [ Array(1) ] to deeply equal []
```

**The gate is right by its own rules, and the taint chain is real:** `Date.now()` sits in the `vi.hoisted` upload-directory name → `uploadEnv` → `UPLOAD_ROOT` → `blobPath` becomes a tainted function → `neighbourPath` is a tainted binding → a THRESHOLD matcher over it is a clock-derived margin.

That gate's house rule is "assert the property instead — assert exactly", never weaken the gate, never exclude by path. Applied literally, and the replacement is the **stronger** claim: byte equality against the neighbour's known contents rather than a non-zero length. A truncated-but-non-empty neighbour file passed the old form and fails the new one. Recorded at `Subject.neighbourBytes` so the next reader does not "simplify" it back.

---

## THE FIXTURE, AND WHY IT MANUFACTURES EVERYTHING

The premise held under a third measurement. Immediately after this plan's final run, against the LIVE database:

```
 live_orgs | live_file_defs
-----------+----------------
         0 |              0
```

Zero `purgeblob-` rows anywhere in `pipelite` (it was never written to), and still **zero live `type='file'` definitions** — so the reason this file mints its own subject is unchanged from 49-01's measurement of 169 live definitions, 0 `file`, and 0 descriptors across 188,619 rows on both the `%storedName%` and `%publicUrl%` probes.

What the file seeds: one user, one pipeline, one stage, one activity type, **four `type='file'` definitions** through 49-01's `mintFieldDefinition`, **four soft-deleted purge subjects**, **four LIVE neighbours** of the matching type, and **nine real files** on a `vi.hoisted` temp root.

The four minted definitions are **fixture faithfulness, not a load-bearing dependency**, and the file's header says so rather than implying more: neither `collectFileFieldRefs` nor the file route reads `custom_field_definitions` — both walk the JSONB by shape, deliberately, so a blob whose definition was soft-deleted or retyped is still found. The definitions exist because a record carrying a file value for a field that was never defined is a subject the product could not have produced.

**Named-integer floors**, all consumed by both the seed and the assertions: `ORG_REF_COUNT = 2`, `PERSON/DEAL/ACTIVITY_REF_COUNT = 1`, `SEEDED_BLOB_TOTAL = 9`, `SEEDED_FILE_DEFINITIONS = 4`, `SABOTAGED_REF_COUNT = 1`, `ORG_DELETED_UNDER_SABOTAGE = 1`.

**The detach counts are three non-zero and one zero on purpose.** Each subject has a live neighbour pointing at it (a person at the organization, a deal at the person, an activity at the deal), so `ORG/PERSON/DEAL_DETACHED = 1` and only `ACTIVITY_DETACHED = 0` — which is the value `activities.ts` spells as a literal. A `detached` that was always 0 would leave the per-cell `toEqual` unable to tell a correct count from a missing one.

**The barrier for the injected failure is the OTHER descriptor on the SAME record, deleted by the SAME purge** — not the neighbour's blob and not a second purge. `trigger-owner-scope.db.test.ts:780-829` measured what a barrier taken from the wrong row costs, and it is cited at the site.

**Teardown removes the bytes as well as the rows**, which is the third fixture hazard `49-PATTERNS.md` names and the one this file was most exposed to. `afterAll` sweeps eleven tables with per-table leftover predicates (`audit_log` and `notes` by their fixture LINKS, since both ids are generated UUIDs), asserts both halves per table, then `rmSync`es the upload root and asserts it is gone. Verified out of band after the final run:

```
$ ls -d /tmp/purgeblob-uploads-*
/usr/bin/ls: cannot access '/tmp/purgeblob-uploads-*': No such file or directory

pipelite_dedup_test: orgs=0 defs=0 usrs=0 audit=0
```

---

## THE S3 CASE IS SEC-49-A AND IS **NOT** PROVEN HERE

Stated explicitly because the plan requires it. `FILE_STORAGE` is unset in every environment this phase can reach, which means `'local'` — asserted in the pre-flight describe rather than assumed, because under `s3` every local `existsSync` assertion in this file would pass for the wrong reason.

`deleteEntityFiles` has an S3 branch and 49-02 covers it with a mocked `@aws-sdk/client-s3`. **No cell in this plan exercises it, no bucket is configured, and nothing here may be cited as evidence about an S3 blob surviving a purge.** SEC-49-A owns that exposure.

Also not repeated anywhere in this plan's output: the retired "recoverable indefinitely" claim (DEF-48-05 / SEC-48-C). `audit.retention_days = 90` is a measurement in this phase's own record (49-01).

---

## Verification

| Check | Result |
|---|---|
| `vitest run --config vitest.db.config.ts …purge-blobs.db.test.ts` | **21 passed / 21** |
| full db project (`vitest run --config vitest.db.config.ts`) | **12 files / 273 passed, EXIT 0** (baseline 11 / 252, +1 file +21 tests) |
| base suite (`vitest run`) | **5652 passed / 32 skipped over 184 files** — exactly the baseline, unchanged |
| RSC project | **8 passed / 8** |
| four mutation test files + `dispatch.test.ts` + `prune.test.ts` + `log-scope-format.test.ts` | **7 files / 271 passed** |
| 49-02's two helper files + 49-04's `route-containment.test.ts` | **3 files / 95 passed** |
| `suite-timing-hygiene` + `suite-hook-hygiene` | **2 files / 137 passed** |
| `tsc --noEmit` | exit **0** |
| `npm run lint` | **0 errors** (118 warnings — the baseline total; the warning total is not a gate) |
| `git diff --exit-code` | clean after all four ablations and both probes restored |
| live `pipelite` fixture rows | **0** — never written to |
| leftover `/tmp/purgeblob-uploads-*` | **none** |

**DEF-48-01 is closed and the db project's exit code is now gated on.** `npm run test:db` and the direct `vitest` invocation both exit **0** on a green suite (root cause found by 49-06, commit `37202ce`). The plan's constraint 14 — "never gate on its exit code" — is superseded; counts AND exit code are both read here.

The base suite being **identical** to the baseline (5652 / 184 files, not 5653 or 185) is the positive confirmation that the `.db.test.ts` file is collected by the db project only.

---

## Deviations from Plan

### 1. [Rule 1 — Bug] `vi.hoisted` is required for `UPLOAD_DIR`, contradicting the plan's own instruction

- **Found during:** Task 1
- **Issue:** The plan's `<action>` says to point `process.env.UPLOAD_DIR` at a `mkdtempSync` directory **in `beforeAll`** and to note that no `vi.hoisted` is needed because 49-02 made `deleteEntityFiles` read the env at call time. That half is true and it is why the purge path needs no help. But the same file drives the file download route for the URL-goes-dark cell, and `route.ts:14` reads `process.env.UPLOAD_DIR` at **module-evaluation** time. A `beforeAll` assignment arrives too late, the route would resolve `/tmp/uploads`, find nothing, and answer **404 to the positive anchor** — failing against correct code while the 404-after-purge assertion beside it passed for the wrong reason.
- **Fix:** The assignment moved into `vi.hoisted`, following 49-06's measured `require`-inside-a-hoisted-factory constraint (no `mkdtempSync`; collision-freedom preserved by a non-recursive `mkdirSync` that throws `EEXIST`). A pre-flight cell then **serves a live neighbour's blob through the route and compares the bytes**, so "the route resolved this root" is asserted rather than trusted.
- **Files modified:** `src/lib/trash/purge-blobs.db.test.ts`
- **Verification:** the pre-flight cell `serves a LIVE neighbour's blob through the route` passes; the URL anchor returns 200 with the exact bytes
- **Committed in:** `6139f0d`

### 2. [Rule 1 — Bug] The URL positive anchor cannot be taken while the record is trashed

- **Found during:** Task 1
- **Issue:** The plan says "before the purge, the same request as the owner returns 200 with the bytes". Taken literally that **cannot pass against correct code**: the subject must be soft-deleted for `purgeOrganizationMutation` to accept it at all, and `findOwnedRecordById` carries `isNull(source.deletedAt)` — 49-04's deliberate trashed-record decision — so a trashed record already answers 404.
- **Fix:** The anchor is taken while the record is LIVE (`deletedAt` nulled by direct SQL), the record is then returned to the trash by direct SQL, and only then purged. The reasoning is written into the cell.
- **Files modified:** `src/lib/trash/purge-blobs.db.test.ts`
- **Verification:** the cell is green, and its 404 half was independently confirmed to be green BEFORE the fix (i.e. already true, and not claimed)
- **Committed in:** `6139f0d`

### 3. [Rule 1 — Bug] `mockRestore()` clears `mock.calls` — a gate that could only be red

- **Found during:** Task 2
- **Issue:** See **D1** above. The mismatch-log assertion read `errorSpy.mock.calls` after `mockRestore()`, which clears it, so the cell reported `expected [] to have a length of 1 but got +0` against a correct implementation.
- **Fix:** Copy the calls out inside the `finally`, before the restore. Comment records the measurement at the site.
- **Files modified:** `src/lib/trash/purge-blobs.db.test.ts`
- **Verification:** 21/21 green; A2 confirms the assertion still reddens when the log is genuinely absent, so the fix did not neuter it
- **Committed in:** `3576cbb`

### 4. [Rule 1 — Bug] `suite-timing-hygiene` flagged the barrier's threshold matcher

- **Found during:** Task 2
- **Issue:** See **D2** above. `expect(readFileSync(neighbourPath).byteLength).toBeGreaterThan(0)` is a threshold matcher over a value the gate's taint analysis correctly traces to the `Date.now()` in the hoisted directory name.
- **Fix:** Replaced with byte equality against the neighbour's known contents — the fix that gate prescribes, and the stronger claim. The gate was not weakened, not excluded by path, and not given an escape hatch.
- **Files modified:** `src/lib/trash/purge-blobs.db.test.ts`
- **Verification:** `suite-timing-hygiene` + `suite-hook-hygiene` 137 passed; base suite back to the 5652 baseline
- **Committed in:** `3576cbb`

### 5. [Rule 4-adjacent — deferred to the orchestrator] `.planning/STATE.md` NOT modified

- **Found during:** Task 2
- **Issue:** The plan lists `.planning/STATE.md` in `files_modified` and its `must_haves` require the limitation entry to stop describing an open gap. **The orchestrator brief explicitly instructs this executor not to modify `STATE.md` or `ROADMAP.md`** — those are owned after the wave. 49-01 hit the identical conflict and made the identical call.
- **Fix:** Not modified. The exact replacement text is handed off below so the orchestrator can apply it verbatim. The **source-side** half of the same requirement — `prune.ts`'s comment — IS done in `3576cbb`, and a repository-wide search confirms no other source comment claims blobs survive a purge.
- **Files modified:** none
- **Verification:** `rtk proxy grep -rl` over `src/` for the gap prose matches only `prune.ts`, and only its new pointer text
- **Committed in:** n/a — handoff below

### 6. [Rule 2 — Missing critical coverage] The "never rethrow" ablation needed three forms, not one

- **Found during:** Task 2
- **Issue:** The plan asks to "rethrow from the `catch` and record which cells redden". Driven as written, **nothing reddens** — 21/21 green — because the `catch` is unreachable given 49-02's contract that `deleteEntityFiles` never rejects. Accepting that as the ablation would have left "never rethrow" recorded as a gate with a green observation, i.e. as NOT DELIVERED.
- **Fix:** Recorded A3a's green honestly and added **A3b** (throw from the reachable branch — contained by the inner catch) and **A3c** (throw plus rethrow, so the failure escapes and reddens the result shape while the row stays gone). A3c is the observation that actually proves the rule, and the A1-vs-A3c table makes the two failure modes distinguishable.
- **Files modified:** none permanently (all restored; `git diff --exit-code` clean)
- **Verification:** transcripts under A3 above
- **Committed in:** documentation only, in this SUMMARY

### 7. [Rule 2 — Missing critical coverage] An exhaustive `toEqual` over the log payload

- **Found during:** Task 2
- **Issue:** The plan asks that the captured line not contain either descriptor's `storedName` or `filename`. Three substring checks rule out three specific strings; they would not catch a future edit that added a `paths` or `storedNames` key to the payload, which is the same T-37-30 violation by another name.
- **Fix:** Added `expect(mismatch.fields).toEqual({ … })` over the whole field set with `ts: expect.any(String)`. Any added key is now a red.
- **Files modified:** `src/lib/trash/purge-blobs.db.test.ts`
- **Verification:** green; and it was the assertion used (via a labelled probe) to capture the payload verbatim
- **Committed in:** `3576cbb`

### 8. [Rule 2 — Missing critical coverage] The mismatch-log assertion moved BEFORE the barrier

- **Found during:** Task 1
- **Issue:** First written with the barrier first, which made the pre-fix red read "the loop abandoned every ref after the first failure" — a subsidiary property of a block that exists — when the actual defect was that no block existed at all. The plan's own `<behavior>` order puts MISMATCH LOGGED before BARRIER; the first draft did not follow it.
- **Fix:** Reordered to the plan's order. The pre-fix red now reads "no mismatch line was logged". Reasoning written into the cell, citing the measured hazard in `trigger-owner-scope.db.test.ts`.
- **Files modified:** `src/lib/trash/purge-blobs.db.test.ts`
- **Verification:** both orderings were run; the transcripts of each are above
- **Committed in:** `6139f0d`

---

**Total deviations:** 8 — four Rule 1 (bugs, all in this plan's own proof or plan text), three Rule 2 (missing critical coverage), one deferred to the orchestrator by explicit instruction. **No Rule 4 architectural situations arose.** **Impact:** the production change is exactly what the plan specifies; every deviation strengthens the proof or corrects the plan's own text.

---

## HANDOFF: the exact `.planning/STATE.md` replacement

The current entry is at `.planning/STATE.md:675`, beginning `- **A purge does not delete uploaded file blobs**`. Replace that single bullet with:

> - **A purge deletes uploaded file blobs, post-commit** (Phase 37 review CR-01, closed in Phase 49). A file custom field stores its bytes under `${UPLOAD_DIR}/${entityId}/${fieldName}/${storedName}` and is referenced only from the record's `customFields` JSONB. **The read path was closed first:** `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts` now resolves and owner-scopes the entity before serving on both `GET` and `DELETE` (plan 49-04), proven behaviourally against real PostgreSQL and real bytes by plan 49-06. **The bytes are now removed too:** all four purge mutations collect the record's blob refs before their transaction and unlink them AFTER the commit, best-effort, never rethrowing — a storage failure leaves the purge committed and logs a `{ entityType, id, expected, deleted }` mismatch carrying identifiers and counts only, never a filename (T-37-30). `src/lib/trash/prune.ts` owns no transaction and delegates; its comment now points at the four mutations rather than documenting a gap. Proven behaviourally per entity type, including an injected `EISDIR` failure, in `src/lib/trash/purge-blobs.db.test.ts` (plan 49-07). **Still open: the S3 blob (SEC-49-A).** `deleteEntityFiles`'s S3 branch exists and is mock-covered, but `FILE_STORAGE` is unset in every reachable environment and no bucket is configured, so it is not proven behaviourally and no claim is made for it; under `FILE_STORAGE=s3` the stored `publicUrl` also bypasses the route entirely, so the read guard has no traffic to protect there. The now-empty `${UPLOAD_DIR}/${entityId}/` directory tree is deliberately not pruned — `rmdir` racing a concurrent upload is a real hazard for a marginal gain in inodes.

Force-add as an INDIVIDUAL file (`git add -f .planning/STATE.md`) — `.planning/` is gitignored-but-tracked.

---

## Issues Encountered

- **The worktree was stale by 32 commits**, as it has been for every executor in this project. Corrected with `merge --ff-only` (never `reset --hard`) and verified by asserting four files only the expected base contains — `delete-entity-files.ts`, `files-route-ownership.db.test.ts`, `custom-field-definition-fixture.ts`, `collect-file-field-refs.ts`.
- **`rtk` output mangling** hit twice: a `grep -n "notNull"` over two schema files returned a restructured summary rather than matched lines, and a `grep -c` returned counts without context. Worked around with `cat` for whole files and `rtk proxy grep` for exact output. **No count in this SUMMARY comes from a `grep | wc -l` pipe** — the eleven is from `vitest`'s own tally cross-checked against a `node` line scan.
- **A compound `for` loop and a `tsc … | tail` pipeline were both refused by the worktree isolation guard** ("too complex to verify that it stays inside the worktree"). Split into plain commands.
- **`docker compose exec` must be run from the main repo path**, not the worktree: the worktree has no `docker-compose.yml`, and from inside it the postgres service reads as "not running".

## Known Stubs

None. Every cell described in the plan's `<behavior>` block exists and passes, and the four post-commit blocks are complete — no `TODO`, no placeholder, no hardcoded empty value. The one property NOT covered by a red observation is named explicitly rather than stubbed: the inner `catch`'s "never rethrow" is unreachable through this seam (A3a), and A3c covers the reachable form.

## Threat Flags

None. No new network endpoint, no new auth path, no schema change. The file-access pattern this plan adds is a `unlink` through 49-02's existing containment helper, whose field-directory boundary this plan neither weakened nor bypassed.

| Threat ID | Mitigation status |
|---|---|
| T-49-07-01 (bytes surviving a permanent delete) | four post-commit blocks; leak reproduced first per entity type, then green |
| T-49-07-02 (irreversible deletion inside the transaction) | block sits between the transaction and the return; **A1 drives it and reddens the criterion, with the rollback observed as `expected 1 to be +0`** |
| T-49-07-03 (a storage failure making a record un-purgeable) | never rethrows; the cell asserts the ROW IS GONE before the log; **A3c is the red** |
| T-49-07-04 (a partial deletion with no evidence) | `{ expected: 2, deleted: 1 }` asserted as numbers; **A2 is the red** |
| T-49-07-05 (a filename in a log line) | three `not.toContain` checks plus an exhaustive `toEqual` over the field set |
| T-49-07-06 (passing on an empty ref set) | four minted `file` definitions, nine real files, `collectFileFieldRefs` floors of 2/1/1/1 asserted before any blob-gone assertion |
| T-49-07-07 (the injection silently succeeding) | option (A) per 49-01's execution; `chmod` not used; `await expect(unlink(path)).rejects.toThrow(/EISDIR/)` asserted BEFORE anything relies on it |
| T-49-07-08 (a barrier from the wrong purge) | the second descriptor on the SAME record in the SAME purge; the measured race is cited at the site |
| T-49-07-09 (a widened `PurgeResult`) | log-only by decision, **cost measured at 11 of 11**; six per-cell `toEqual`s are a second detector |
| T-49-07-10 (the purge taking the field directory) | four live neighbours, byte-equality asserted intact after every purge |
| T-49-07-11 (`prune.ts` / `STATE.md` stating a closed gap) | `prune.ts` rewritten as a pointer in `3576cbb`; `STATE.md` handed off above by explicit orchestrator instruction |
| T-49-07-12 (the S3 blob) | **accept, named.** SEC-49-A. No cell, no claim |
| T-49-07-13 (two executors racing `dedup-db-test-setup.sh`) | alone in wave 4 among db-test owners |

## Next Phase Readiness

- **49-08 (SC-3)** — unaffected by this plan's source changes; `dedup.ts` is untouched. It shares `mintFieldDefinition` and must mint its own `formula` definition; the premise that it has to is re-confirmed above (0 live `file` definitions, and 49-01's 0 live `formula` definitions).
- **49-09 (sign-off)** — four ablations plus two self-found proof defects are recorded verbatim above, so this plan's gates are DELIVERED under the milestone rule. Note what is deliberately **not** claimed: the S3 case (SEC-49-A), the 404-after-purge (49-04/49-06's work), and the inner `catch`'s never-rethrow property (unreachable, A3a green).
- **One item for the orchestrator:** the `STATE.md` bullet replacement above. The source-side half is committed; the register-side half is not, by instruction.

## Self-Check: PASSED

Files claimed, verified on disk:

- `src/lib/trash/purge-blobs.db.test.ts` — FOUND
- `src/lib/mutations/organizations.ts`, `people.ts`, `deals.ts`, `activities.ts` — FOUND, all four carrying `deleteEntityFiles` and `collectFileFieldRefs`
- `src/lib/trash/prune.ts` — FOUND, no sentence claiming blobs are not removed
- `.planning/phases/49-mutation-layer-truth-after-commit/49-07-SUMMARY.md` — this file

Commits claimed, verified in `git log --oneline --all`: `6139f0d`, `3576cbb`.

`git diff --diff-filter=D 6139f0d~1 HEAD` reports **no deleted files** — nothing was destroyed across the two commits. Working tree clean (`git diff --exit-code` exit 0); no untracked files outside `.planning/`.

---
*Phase: 49-mutation-layer-truth-after-commit*
*Completed: 2026-08-26*
