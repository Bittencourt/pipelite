---
phase: 49-mutation-layer-truth-after-commit
plan: 06
subsystem: api-files
tags: [security, idor, authorization, sec-04, sc-1, db-test, behavioural-proof]
requires:
  - "src/lib/api/file-access.ts (49-04)"
  - "src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts as 49-04 left it"
  - "src/app/import/import-owner-scope.db.test.ts:69-81 — the session-auth harness"
  - "scripts/dedup-db-test-setup.sh"
provides:
  - "src/app/api/files/__tests__/files-route-ownership.db.test.ts — SC-1's behavioural proof, 18 cells"
  - "the IDOR reproduced against real PostgreSQL and a real filesystem, on both verbs, with the victim's bytes in the response body"
  - "a behavioural measurement that the ownership term and the JSONB reference match are independent"
affects:
  - "nothing in production — no source file was permanently changed by this plan"
tech-stack:
  added: []
  patterns:
    - "vi.hoisted assigns process.env.UPLOAD_DIR BEFORE the route module evaluates, with a pre-flight cell that triangulates the resolution rather than trusting it"
    - "refusal assertions compare BYTES (Buffer.includes over the response body), never status alone"
    - "the DELETE-refusal barrier is the VICTIM's blob, asserted before the status"
    - "restoreFixtureRows rewrites the BYTES as well as customFields/deletedAt/ownerId"
    - "a deny-everything ablation plus a status-only anchor ablation, to measure what the anchors actually hold"
key-files:
  created:
    - src/app/api/files/__tests__/files-route-ownership.db.test.ts
  modified:
    - .planning/phases/49-mutation-layer-truth-after-commit/deferred-items.md
decisions:
  - "The plan's 'zero-byte body' is not achievable and would FAIL against correct code — the shipped refusal is a 29-byte JSON body by 49-04's deliberate anti-oracle decision. Asserted instead: zero bytes OF THE VICTIM'S FILE, plus byte-equality with the canonical refusal"
  - "A SECOND unreferenced blob was added at ORG_A/FIELD_OTHER/STORED_A_MAIN — without it the WRONG FIELD NAME cell answers 404 from existsSync and stays GREEN with the reference match removed entirely. Ablation 2 confirmed the cell now reddens"
  - "vi.hoisted names the upload directory but does not mkdtempSync it: there is no fs binding before the static imports, and reaching one costs two eslint ERRORS. Collision-freedom is preserved by a NON-recursive mkdirSync that throws EEXIST"
  - "Ablation 2 removes the reference match from the SHARED guard, so it covers both verbs — strictly wider than the plan's 'GET only', the same departure 49-04 recorded for its ablation C"
  - "Ablation 1 is a plain removal of the owner term leaving TWO terms, because 49-04 measured that requireScopedPredicate does not fire there (SEC-49-B). No guard had to be bypassed"
metrics:
  duration: ~32 min
  completed: 2026-08-26
  tasks: 2
  tests-added: 18
  commits: 3
---

# Phase 49 Plan 06: the behavioural SC-1 proof Summary

Two real users, three real records and six real files on a real disk now hold SC-1 against real
PostgreSQL: `GET` and `DELETE` on a foreign, trashed or unreferenced file return the canonical 404
carrying **none of the victim's bytes**, the victim's blob is still on disk afterwards, and removing
the ownership term from the resolver serves the victim's file contents straight back into the
response body.

## What was built

| Artifact | Cells | What it proves |
|---|---|---|
| `src/app/api/files/__tests__/files-route-ownership.db.test.ts` | 18 | 3 connection-guard self-assertions, 5 pre-flight premises, 2 positive anchors, 4 SC-1 refusals (both verbs, both directions), 1 trashed-record, 2 reference-match, 1 existence-oracle |

`@/auth` is the only mock. `@/db` is real, `fs` is real, `next/cache` is not mocked because this route
does not import it. `mintApiKey` is neither used nor imported — the route authenticates with `auth()`.

**No production file was permanently changed.** `git diff --exit-code -- src/app/api/files/
src/lib/api/file-access.ts` exits 0.

---

## THE FIRST RUN WAS GREEN, AND THAT IS NOT EVIDENCE

```
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

49-04 landed the fix in wave 2, so a natural red was not available to this plan. A green first run
against already-correct code is indistinguishable from a green first run against a file whose cells
cannot fail — and this phase has now found eighteen gates that could not fail. Everything below is
what makes the 18 green cells mean something.

---

## ABLATION 1 — THE OWNERSHIP TERM. The IDOR, reproduced against real PostgreSQL.

**ABLATION, not a production path.** `eq(source.ownerId, userId)` deleted outright from
`findOwnedRecordById`'s `terms` in `src/lib/api/file-access.ts`, leaving two terms. A plain removal
was the faithful form: 49-04 measured that `requireScopedPredicate` does **not** throw at that point
(`MANDATORY_SCOPE_TERMS` is 2 and 2 is not `< 2` — **SEC-49-B**), so nothing had to be bypassed for
the unscoped query to run. **Confirmed behaviourally here: the guard was silent and every cell ran.**

```
 ❯ |db| src/app/api/files/__tests__/files-route-ownership.db.test.ts (18 tests | 5 failed) 358ms
     × GET: A is refused B's file, and the response carries none of B's bytes 29ms
     × DELETE: A is refused B's file, and B's BLOB IS STILL ON DISK afterwards 23ms
     × SYMMETRY, GET: B is refused A's file too — the guard is not one-directional 19ms
     × SYMMETRY, DELETE: B is refused A's file, and A's blob survives 12ms
     × the missing-record 404 is BYTE-IDENTICAL to the foreign-record 404 19ms
```

### The disclosure — B's file CONTENTS in the response body, not a status code

```
 FAIL  |db| … > SC-1: a file belonging to a record the caller may not see returns no bytes > GET: A is refused B's file, and the response carries none of B's bytes
AssertionError: A requested B's file — the response body CONTAINS the victim's file contents. A status-code assertion would not have seen this; the bytes are the claim.: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true
```

### The destruction — B's blob GONE from the real filesystem

```
 FAIL  |db| … > DELETE: A is refused B's file, and B's BLOB IS STILL ON DISK afterwards
AssertionError: A's refused DELETE removed B's file anyway. The status code alone would not have shown this.: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false
```

`existsSync` on the victim's path returned `false` after A's request. The bytes were on disk before
the request — asserted in the same cell — and they were not there after it.

### Symmetry, both verbs

```
 FAIL  |db| … > SYMMETRY, GET: B is refused A's file too — the guard is not one-directional
AssertionError: B requested A's file — the response body CONTAINS the victim's file contents. A status-code assertion would not have seen this; the bytes are the claim.: expected true to be false

 FAIL  |db| … > SYMMETRY, DELETE: B is refused A's file, and A's blob survives
AssertionError: B's refused DELETE removed A's file anyway — the destructive verb is the worse half of this defect.: expected false to be true
```

### And the existence oracle opened, which the plan did not predict

```
 FAIL  |db| … > the answer is not an existence oracle > the missing-record 404 is BYTE-IDENTICAL to the foreign-record 404
AssertionError: expected 200 to be 404 // Object.is equality

- Expected
+ Received

- 404
+ 200
```

The foreign request became a **200** while the missing-record request stayed 404. So under the
ablation the status code alone tells a caller which record ids exist, on top of handing over the file.
This cell was written for the anti-oracle property and it turns out to double as a second detector
for the ownership term.

### WHICH CELLS DID NOT REDDEN — the measurement, not a footnote

**Red (5):** the four foreign-record cells (both verbs, both directions) and the existence-oracle
cell.

**Green (13), and each for a reason:**

| Cell | Why the ownership term is not what refuses it |
|---|---|
| UNREFERENCED FILENAME | the file is in A's OWN directory; only the JSONB reference match refuses it |
| WRONG FIELD NAME | same — the per-field match, not ownership |
| TRASHED RECORD | `isNull(deletedAt)` is still in the predicate, and ORG_T is A's own record anyway |
| both POSITIVE ANCHORS | A's own file; a widened predicate still finds it |
| PRE-FLIGHT (5) + connection guard (3) | premises, not route behaviour |

**That separation is the point.** The two guards are independent, measured, and the reference-match
cells prove work the ownership term does not do — which is the behavioural counterpart of 49-04's
unit-level ablation C.

**Restored.** `git diff --exit-code -- src/lib/api/file-access.ts` exit 0, `18 passed (18)`.

---

## ABLATION 2 — THE JSONB REFERENCE MATCH.

**ABLATION, not a production path.** The `recordReferencesStoredName` refusal removed from
`refuseUnlessOwnedAndReferenced`. Because 49-04 made that ONE shared guard for both verbs, this is
strictly **wider** than the plan's "from `GET` only" — the same deliberate departure 49-04 recorded
for its ablation C. No cell in this file requests an unreferenced name over `DELETE`, so the wider
ablation produces the same red set the narrow one would.

```
 ❯ |db| src/app/api/files/__tests__/files-route-ownership.db.test.ts (18 tests | 2 failed) 330ms
     × A is refused a file that is really on disk in A's OWN field directory but absent from A's JSONB 19ms
     × A is refused its OWN storedName under a DIFFERENT field that also exists on the record — the match is per FIELD 12ms
```
```
 FAIL  |db| … > the JSONB reference match, proven behaviourally > A is refused a file that is really on disk in A's OWN field directory but absent from A's JSONB
AssertionError: A requested an unreferenced file in its own directory — the response body CONTAINS the victim's file contents. A status-code assertion would not have seen this; the bytes are the claim.: expected true to be false

 FAIL  |db| … > A is refused its OWN storedName under a DIFFERENT field that also exists on the record — the match is per FIELD
AssertionError: A requested its own storedName under the wrong field — the response body CONTAINS the victim's file contents. A status-code assertion would not have seen this; the bytes are the claim.: expected true to be false
```

**The unreferenced file's bytes were served. The FOREIGN-RECORD CELLS STAYED GREEN — 16 passed.**
That is the expected shape and it is the behavioural proof that the reference match does work the
ownership term does not: an attacker who owns *a* record cannot reach a file that record does not
reference, and that refusal survives the ownership term being present or absent independently.

**This ablation also vindicated a fixture change this plan made to its own plan** (see Deviation 2).
Without the cross-field blob, the WRONG FIELD NAME cell would have answered 404 from `existsSync` and
stayed **green** right here — a check that could not fail.

**Restored.** `git diff --exit-code -- src/app/api/files/` exit 0, `18 passed (18)`.

---

## ABLATION 3 — THE POSITIVE ANCHORS. What they actually hold, measured in two steps.

The milestone rule is that a gate with no recorded red is not delivered, and the plan asks for one
more thing: weaken an anchor's content-equality assertion and see whether anything notices. Weakening
an assertion cannot by itself redden another cell, so that question was made answerable by pairing it
with a route that serves nothing — which is precisely the failure the anchors exist to catch.

### 3a — a route that REFUSES EVERYTHING (`return notFound()` above the resolver)

```
 ❯ |db| src/app/api/files/__tests__/files-route-ownership.db.test.ts (18 tests | 3 failed) 270ms
     × THE ROUTE RESOLVED THE TEMP UPLOAD_DIR, not the /tmp/uploads default — the cell that stops this whole file passing vacuously 24ms
     × GET: A's own referenced file comes back with its REAL BYTES, not merely a 200 8ms
     × DELETE: A's own SECOND referenced file is really unlinked from the real filesystem 8ms
```
```
AssertionError: expected 404 to be 200 // Object.is equality
```

**Every one of the 15 other cells passed against a route that serves nothing to anybody.** All four
SC-1 refusals, the trashed cell, both reference-match cells and the existence-oracle cell were green.
The anchors and the pre-flight cell are the only three things in this file that noticed.

### 3b — a route that answers **200 with ZERO BYTES** and never unlinks

`new NextResponse(Buffer.alloc(0), …)` in place of the file buffer, and `if (existsSync(filePath) &&
false)` around the `unlink`. This is the case a status-only anchor cannot see.

```
 ❯ |db| src/app/api/files/__tests__/files-route-ownership.db.test.ts (18 tests | 3 failed) 381ms
     × THE ROUTE RESOLVED THE TEMP UPLOAD_DIR, not the /tmp/uploads default … 38ms
     × GET: A's own referenced file comes back with its REAL BYTES, not merely a 200 16ms
     × DELETE: A's own SECOND referenced file is really unlinked from the real filesystem 19ms
```
```
 FAIL  |db| … > POSITIVE ANCHORS … > GET: A's own referenced file comes back with its REAL BYTES, not merely a 200
AssertionError: a 200 carrying zero bytes would satisfy a status-only anchor, and then every 'returns nothing' cell below would be satisfied by a route that returns nothing to anybody. The anchor asserts CONTENT for that reason.: expected false to be true

 FAIL  |db| … > DELETE: A's own SECOND referenced file is really unlinked from the real filesystem
AssertionError: the owner's own DELETE did not remove the file. Every 'the victim's blob survives' assertion in this file is satisfied by a DELETE that never unlinks anything; this is what rules that out.: expected true to be false
```

**Every status assertion in the file passed here.** The three reds are exactly the three
content/`existsSync` assertions.

### 3c — THE ANCHOR-WEAKENING OBSERVATION

With the 3b route still ablated, the three content assertions were removed and the status assertions
left in place (pre-flight `body.equals`, the GET anchor's `body.equals` + `byteLength`, the DELETE
anchor's `existsSync`-after):

```
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

**18/18 GREEN against a route that serves zero bytes to its rightful owner and never deletes
anything.** Nothing else in the file noticed. That is the record of why the anchors assert CONTENT
and a real `existsSync` rather than a status: those three assertions are the entire difference
between this proof and a file that is green no matter what the route does.

This observation **explains the shape of the anchors; it is not a defect in the shipped code.** The
route is correct; the ablation was applied to the test file and to the route to measure the test
file's own detection power.

**Restored.** `git checkout -- ` both files; `git diff --exit-code` clean over the whole tree.

---

## THE PRE-FLIGHT `UPLOAD_DIR` ASSERTION — result

The mechanical trap the plan named. `route.ts:14` reads `process.env.UPLOAD_DIR` at
module-evaluation time, so the assignment is made inside `vi.hoisted`. The resolution is then
**triangulated rather than trusted**, in four steps in one cell:

| Step | Assertion | Result |
|---|---|---|
| 1 | `process.env.UPLOAD_DIR` is still the hoisted value, and is not `/tmp/uploads` | pass |
| 2 | `/tmp/uploads/<ORG_A>/<field>/<storedName>` does **not** exist | pass — `/tmp/uploads` does not exist on this host at all |
| 3 | the temp path **does** exist | pass |
| 4 | the anchor GET returns 200 and its body equals the temp file's bytes | pass |

2 + 3 + 4 can only hold together if the module-level read resolved the temp directory. And the cell
is not vacuous: it was the first cell to redden in both halves of ablation 3.

`FILE_STORAGE` was also asserted (`process.env.FILE_STORAGE ?? "local"` is `"local"`), because under
`s3` every refusal in the file would pass for the wrong reason.

---

## SCOPE: `FILE_STORAGE=local` ONLY

**SC-1 is proven here for local storage and for nothing else.** Under `FILE_STORAGE=s3` the stored
`publicUrl` is `${S3_PUBLIC_URL}/${key}` (`src/app/api/upload/route.ts:89`), so no read traverses this
route and the guard has no traffic to protect there. **SEC-49-A owns that gap.** No cell in this plan
exercises the S3 arm, no S3 client was constructed, and nothing here may be cited as evidence about
S3. `FILE_STORAGE` is unset in this deployment, which is why `'local'` is the configuration under
test — and it is asserted, not assumed.

No root-level containment assertion was introduced anywhere: 49-04's field-directory boundary is
untouched, and this file makes no containment claim of its own beyond the behavioural
unreferenced-filename and wrong-field cells.

---

## Verification

| Check | Result |
|---|---|
| `vitest run --config vitest.db.config.ts .../files-route-ownership.db.test.ts` | **18 passed (18)** |
| whole db project | **252 passed**, 10 files passed, 1 file failed on a PRE-EXISTING hook defect (DEF-49-04) |
| db-project delta vs the wave-2 baseline of 234 | **+18 in 1 new file** — exactly this plan's cells |
| `vitest run` (base project) | **5652 passed / 32 skipped** over 184 files — baseline-equal, nothing moved |
| `vitest run --config vitest.rsc.config.ts` | **8 passed (8)** |
| `route-containment.test.ts` + `compose-uploads-persistence.test.ts` | **70 passed (70)** — 49-04's unit proof and the cross-tier `UPLOAD_DIR` gate both intact |
| `tsc --noEmit` | exit 0 |
| `eslint src` | **0 errors**, 118 warnings (identical to 49-04's recorded count; all pre-existing `no-unused-vars`) |
| `git diff --exit-code -- src/app/api/files/ src/lib/api/file-access.ts` | clean after every ablation |
| `git diff --exit-code` (whole tree) | clean |

**DEF-48-01 was respected:** every db run was read for its COUNTS. `npm run test:db`'s exit code was
never used as a gate — and DEF-49-04 below is very likely the reason that exit code is non-zero.

### Teardown, asserted rather than assumed

`afterAll` reported zero `filesown-` leftovers and baseline-equal counts on **every** run, including
the four FAILED ablation runs — no run reported a hook failure. Verified again afterwards from
outside the suite:

```
orgs=0 users=0 audit=0                        (pipelite_dedup_test, direct psql)
live_orgs_with_prefix=0 live_users_with_prefix=0   (pipelite — the live database, never touched)
```

The bytes are fixtures too, and a teardown that removes rows and leaves files behind is half a
teardown. `afterAll` removes the temp upload root recursively and asserts it is gone; confirmed from
outside:

```
$ ls -d /tmp/filesown-uploads-* 2>/dev/null
(no output)
```

No API key was minted by this plan, so no plaintext key exists to have been committed.

---

## Deviations from Plan

**1. [Rule 1 — a gate that would FAIL against correct code] "a zero-byte body" is not the achievable
claim, and asserting it literally would redden the shipped route**
- **Found during:** Task 1, writing the first refusal cell.
- **Issue:** `must_haves.truths[0]` and the Task 1 behaviour text both ask for "404 with a zero-byte
  body". The shipped route answers every refusal with
  `NextResponse.json({ error: 'File not found' }, { status: 404 })` — a **29-byte** JSON body, by
  49-04's deliberate anti-oracle decision, so that a foreign record is byte-indistinguishable from a
  missing one. `expect(body.byteLength).toBe(0)` would have been a cell that fails against correct
  code, and "fixing" it would have meant weakening the anti-oracle property SEC-48-A settled.
- **Fix:** the claim SC-1 actually needs is **zero bytes OF THE VICTIM'S FILE**. Every refusal
  asserts (a) `body.includes(victimBytes)` is `false`, (b) `body.equals(REFUSAL_BODY)`, and (c) the
  404. Ordered so the DISCLOSURE assertion fails first — 49-04's Deviation 3 measured that a
  status-first ordering masks the dangerous fact, and every red in this SUMMARY names the bytes as a
  direct consequence.
- **Threat register:** strengthens T-49-06-01 and T-49-06-05 rather than departing from them.
- **Commit:** 83873a6

**2. [Rule 2 — a cell that could not fail] a SECOND unreferenced blob, so the WRONG FIELD NAME cell
is load-bearing**
- **Found during:** Task 1, reasoning about what ablation 2 would redden.
- **Issue:** the plan seeds no bytes at `${ORG_A}/${FIELD_OTHER}/${STORED_A_MAIN}`. With that path
  empty, the WRONG FIELD NAME cell's 404 comes from the route's `existsSync` check, not from the
  per-field reference match — so the cell would have stayed **green with the reference match removed
  entirely**, which is exactly the class of defect this phase keeps finding.
- **Fix:** a cross-field blob with its own distinct contents, plus a barrier in the cell asserting
  those bytes are really there. The fixture is 4 referenced + **2** unreferenced blobs, with all three
  counts as named integers asserted against each other and against zero.
- **Confirmed:** ablation 2 reddened that cell, with `BYTES_CROSSFIELD` found in the response body.
  The strengthening was measured, not assumed.
- **Commit:** 83873a6

**3. [Deliberate departure] `vi.hoisted` names the upload directory; it does not `mkdtempSync` it**
- **Issue:** inside a hoisted factory the static imports have not been evaluated, so there is no `fs`
  binding. Reaching `mkdtempSync` means a bare `require("fs")` — **probed and confirmed to work** —
  but this repository's eslint makes it an ERROR
  (`@typescript-eslint/no-require-imports`; measured: `2 problems (2 errors, 0 warnings)` without
  suppressions). Suppressing two lint errors inside a security proof to obtain a directory name is a
  worse trade than naming the directory in the factory and creating it below.
- **What was preserved:** `mkdtempSync`'s actual property is collision-freedom, and it is *enforced*
  rather than assumed — the creation is a **non-recursive** `mkdirSync` on the leaf, so a colliding
  name throws `EEXIST` and aborts collection instead of silently sharing a directory. The
  load-bearing part of the plan's requirement — the env var assigned before module evaluation, and
  the resolution ASSERTED afterwards — is unchanged and is proven by the pre-flight cell.

**4. [Deliberate departure] ablation 2 covers both verbs, not `GET` alone**
- 49-04 made the guard ONE shared function for both verbs, precisely so the read cannot be fixed
  while the destructive verb is forgotten. Removing the reference match from "GET only" would have
  meant changing the guard's signature. The shared removal is strictly wider and answers both
  questions the plan asks of ablation 2. Same departure, same reason, as 49-04's ablation C.

**5. [Deliberate departure] ablation 3 was run in three parts rather than one**
- The plan asks to remove an anchor's content-equality assertion "and confirm nothing else in the
  file notices". Weakening an assertion cannot redden another cell, so as written the observation is
  unfalsifiable. It was made falsifiable by pairing it with a route that serves nothing (3a), then
  with the sharper case a status-only anchor genuinely cannot see — a 200 carrying zero bytes and a
  DELETE that never unlinks (3b) — and only then weakening the three content assertions (3c), which
  took the file to **18/18 green against that route**. That is a considerably stronger record than
  the plan's version and it is what the plan was reaching for.

**6. [Out of scope — logged, not fixed] DEF-49-04**
- The whole db project cannot be green: `src/lib/views/queries.db.test.ts`'s `afterAll` executes its
  leftover query for `saved_view_defaults` OUTSIDE the `if (table !== "saved_view_defaults")` guard,
  and that table has no `id` column, so the statement raises `42703`. Its 28 cells all pass;
  the hook is what fails. It reproduces on that file alone, it is a Phase 40 file (`f097b5b`), and it
  is a plausible cause of **DEF-48-01**. Recorded as **DEF-49-04** in `deferred-items.md`
  (commit a091de4). Fix attempts: **zero** — pre-existing failure in an unrelated subsystem.

**7. Verification commands were run from the WORKTREE root.** No `<automated>` block in this plan
carried an absolute path to the main repo. `npm run lint` was not used — `next lint` in this version
rejects `--max-warnings`; the gate was `./node_modules/.bin/eslint src`, read for the ERROR count (0),
never the warning total, which is not reproducible across trees.

---

## Threat Register Disposition

| Threat | Status | Evidence |
|---|---|---|
| T-49-06-01 Info disclosure, foreign `GET` | **mitigated** | 2 cells (both directions) with in-cell SQL + on-disk barriers; ablation 1 reddened both with the victim's CONTENTS in the body |
| T-49-06-02 Tampering, foreign `DELETE` | **mitigated** | 2 cells; ablation 1 recorded `existsSync` going `false` on the victim's blob |
| T-49-06-03 Unreferenced file in an owned directory | **mitigated** | 1 cell with the bytes asserted present before and after; ablation 2 served them |
| T-49-06-04 Trashed record's file | **mitigated** | 1 cell; barrier asserts the row is still in the table, owned by the caller, with a non-null `deleted_at` |
| T-49-06-05 Existence oracle | **mitigated** | the missing-record 404 body asserted byte-identical to the foreign-record 404 body; ablation 1 reddened it at 200-vs-404 |
| T-49-06-06 Every refusal satisfied by a route that serves nothing | **mitigated, MEASURED** | ablation 3a: 15/18 green against a deny-everything route. 3b: every status assertion green against an empty-200 route. 3c: **18/18 green** with the three content assertions weakened |
| T-49-06-07 The file passing against `/tmp/uploads` | **mitigated** | `vi.hoisted` + a 4-step triangulation cell that was the first to redden in both halves of ablation 3 |
| T-49-06-08 A cell's mutation cascading false reds | **mitigated** | `restoreFixtureRows` resets `customFields`/`deletedAt`/`ownerId` by direct SQL AND rewrites all six blobs, before every cell. Not hypothetical: the DELETE anchor unlinks a real file on every run, and ablation 1 destroyed the victim's blob in one cell while the next cell's barrier still passed |
| T-49-06-09 Teardown against `pipelite` | **mitigated** | module-scope `assertIsolatedConnection` with 4 self-assertions including the accept cell; confirmed afterwards by direct `psql` against `pipelite` (0 prefixed rows) |
| T-49-06-10 An ablated file left in the tree | **mitigated** | `git diff --exit-code` over both paths after each of the four ablations; whole tree clean |
| T-49-06-11 The S3 read path | **accepted, named, out of scope** | SEC-49-A; `FILE_STORAGE` asserted `local`; no S3 cell, no S3 claim |
| T-49-06-12 Two executors racing `dedup-db-test-setup.sh` | **mitigated** | this plan was alone in wave 3; the temp upload root is per-process and created non-recursively so a collision aborts rather than shares |

---

## What this does NOT deliver

- **No S3 coverage.** SEC-49-A. `FILE_STORAGE=local` is the only configuration SC-1 is proven for,
  and the ROADMAP is already amended to say so.
- **No traversal coverage.** The percent-encoded and `../` spellings are held by 49-04's unit cells
  and by `resolveContainedPath`'s direct-call cells. This file's containment-adjacent evidence is the
  behavioural unreferenced-filename and wrong-field cells; no root-level containment assertion was
  introduced, and 49-04's field-directory decision stands untouched.
- **No fix for SEC-49-B.** `requireScopedPredicate` still does not fire when a 3-term predicate loses
  its owner term; this plan CONFIRMED that behaviourally (ablation 1 ran to completion with two
  terms) but did not change `stage-scope.ts`. It remains a backlog item, and this file's own barriers
  are what caught the loss.
- **No entity type but `organization`.** The resolver walks four tables and 49-04 covers all four
  per-table at the unit level. This file proves the behaviour against real PostgreSQL for
  `organizations` only; the other three share one code path and one predicate shape.
- **No blob deletion on purge.** Plan 49-07 owns that.
- **DEF-48-05 / SEC-48-C not absorbed.** Not this phase's work.
- **No claim that the audit tombstone retains indefinitely.** `audit.retention_days = 90`.

## Follow-ups worth a backlog line

1. **DEF-49-04** — one-line fix, and it may be what makes `npm run test:db` exit non-zero on a green
   suite (DEF-48-01).
2. **The other three entity types have no behavioural file-route proof.** Extending the
   `SEEDED_BLOBS` fixture to a deal, a person and an activity is mechanical; it was left out because
   the plan scoped the fixture to organizations and the four tables share one predicate shape.

## Known Stubs

None. The file contains no placeholder value, no TODO marker and no unwired path; every cell drives
the real exported handler against real PostgreSQL and a real filesystem.

## Self-Check: PASSED

- `src/app/api/files/__tests__/files-route-ownership.db.test.ts` — FOUND
- `.planning/phases/49-mutation-layer-truth-after-commit/deferred-items.md` — FOUND
- commit `83873a6` — FOUND
- commit `a091de4` — FOUND
