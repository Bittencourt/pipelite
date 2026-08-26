---
phase: 48-rest-api-authorization
plan: 07
subsystem: testing
tags: [postgres, drizzle, api-keys, pagination, authorization, vitest, sqlstate-42601]

requires:
  - phase: 48-04
    provides: "ownedStagesPredicate and the rewritten GET /api/v1/stages that paginates AFTER the ownership join — the deletion this plan proves behaviourally"
  - phase: 48-06
    provides: "src/app/api/v1/__tests__/api-key-fixture.ts mintApiKey, the real-API-key harness reused unchanged"
provides:
  - "The behavioural proof of the amended SC-5: an offset at or past the global stage count resolves 200 with an empty page against real PostgreSQL, through the real withApiAuth, with the offset read from a live count(*)"
  - "The F3 proof from both directions, with named-integer floors on every count"
  - "The proof that pagination is applied INSIDE the caller's own records — two pages of 2 whose union is exactly the caller's seeded set"
  - "Control F recorded verbatim: the shipped raw-IN fragment restored, SQLSTATE 42601 reproduced, then re-fixed, tree clean"
  - "A second *-scope.db.test.ts harness, so the two-owner real-key pattern is now a pattern rather than one file"
affects: [48-10, 50-export-authorization, any-future-v1-list-route-with-pagination]

tech-stack:
  added: []
  patterns:
    - "A behavioural proof whose boundary value is READ FROM THE DATABASE rather than written down, so it cannot decay as the table changes"
    - "Interleaved fixture positions, so a 6-row fixture still reproduces a global-pagination defect that contiguous per-owner blocks would hide"
    - "An audit-log assertion placed BEFORE teardown, where the teardown cannot cover for it"

key-files:
  created:
    - src/app/api/v1/stages/stages-scope.db.test.ts
  modified: []

key-decisions:
  - "SC-5 is proven by a request and a response, never by reading route source: plan 48-04 closed QG-03 by DELETION, so a gate written against the membership call site would bind to nothing and report clean on an empty file"
  - "The boundary offset is read from `select count(*)::int from stages` rather than hard-coded at 73 — research recorded the live threshold moving as one fixture row came and went"
  - "Control F needed no invented ablation: the negative control is code that actually shipped, restored with `git checkout c291dc8^ -- route.ts`"
  - "A_POSITIONS and B_POSITIONS are INTERLEAVED (1000/1500/2000/2500/3000/4000) so a 6-stage fixture reproduces the F3 global-pagination defect; contiguous per-owner blocks would have hidden it and control F would have shown only 4 reddenings instead of 7"
  - "route.ts was NOT modified by this plan. Task 3's deliverable is a transcript, and its acceptance criterion is that `git diff --exit-code` exits 0 afterwards"
  - "REQUIREMENTS.md and BACKLOG.md were deliberately left untouched: plan 48-09, running in a parallel worktree in this same wave, owns the QG-03 and BACKLOG 999.18 text edits"

patterns-established:
  - "Live-derived boundary values: any assertion about 'past the end' reads the end from SQL, and states in its own message why a hard-coded boundary is a test that decays"
  - "Guarded empty seed: `if (rows.length > 0)` around the fixture insert is load-bearing, not housekeeping — without it a control variant that empties SEED_PLAN dies in the hook and SKIPS every assertion it exists to redden"
  - "Floor messages name the vacuity they rule out, in the assertion, not in a comment"

requirements-completed: [QG-03, SEC-02]

duration: 41min
completed: 2026-08-26
---

# Phase 48 Plan 07: Stage-Scope Behavioural Proof Summary

**QG-03 was recorded as unreachable in three places and was a live HTTP 500 reachable with one query
parameter; this plan proves the fix the only way it can be proven — a real request at an offset read
from a live `count(*)`, against real PostgreSQL, through the real `withApiAuth` — and reproduces the
shipped defect verbatim (`42601 syntax error at or near ")"`) before re-fixing it.**

## Performance

- **Duration:** 41 min
- **Started:** 2026-08-26T01:23Z
- **Completed:** 2026-08-26T02:04Z
- **Tasks:** 3 of 3
- **Files created:** 1 (`src/app/api/v1/stages/stages-scope.db.test.ts`, 745 lines, 25 tests in 6 blocks)
- **Files modified:** 0 — `src/app/api/v1/stages/route.ts` is byte-identical to its 48-04 state

## Task Commits

| Task | Commit    | What landed                                                                 |
| ---- | --------- | --------------------------------------------------------------------------- |
| 1    | `e0e1aa5` | harness + the SC-5 offset-past-the-end proof (16 tests)                     |
| 2    | `bd8d4c9` | the F3 block, both cross-check directions, the pagination window (25 tests)  |
| 3    | —         | control F: a run, a transcript, and a restore. No net tree change by design. |

## 1. What was built

### `src/app/api/v1/stages/stages-scope.db.test.ts` (745 lines, 25 tests)

Six blocks:

1. **the connection guard** (4) — module-scope `assertIsolatedConnection` refuses `pipelite` BY NAME
   and any non-loopback host, plus the anti-vacuity fourth test that a guard throwing on everything
   would also satisfy the three refusals.
2. **the fixture set** (3) — exactly 6 prefixed stages, 2 pipelines, 2 users, 2 api_keys; and the
   discriminator asserted rather than left as arithmetic: `A_OWNED !== SEEDED_TOTAL`.
3. **authentication through the real `withApiAuth`** (4) — a minted key reaches the handler and
   returns 200; a fabricated Bearer and a missing header return 401; and the identity that reaches the
   route is the key's user, proven by two structurally identical requests differing only in which
   `api_keys` digest they match.
4. **SC-5 (amended)** (5) — the global-count FLOOR, the boundary proof, the far-offset proof, the
   `meta.total` companion, and B's key on the same path.
5. **F3** (7) — owner-page ceiling and floor, page-and-total-agree, both cross-check directions, both
   filtered paths, and the pagination window.
6. **table accounting** (1) — a read wrote no `audit_log` row, asserted before teardown.

Fixture shape, all named constants shared by the seed and the assertions: user A with 1 pipeline and
`A_OWNED = 4` stages, user B with 1 pipeline and `B_OWNED = 2`, `SEEDED_TOTAL = 6`. Both users are
`role: "member"` — an admin bypass would make the cross-checks permanently unfalsifiable.

### The one design decision that made control F worth having

`A_POSITIONS = [1000, 2000, 3000, 4000]` and `B_POSITIONS = [1500, 2500]` are **interleaved**. The
pre-48-04 route paginated the GLOBAL list, so the global order matters: `A, B, A, B, A, A`. At
`?limit=5` A's JavaScript-filtered page holds **3** of its 4 stages; at `?limit=2&offset=0` it holds
**1** of 2. Had each owner been given a contiguous block, both would have returned the right count and
control F would have reddened 4 tests instead of 7 — the F3 half of the plan would have had no
negative control at all.

## 2. Why SC-5 had to be amended, and why the amendment is stronger

ROADMAP SC-5 read: *"proven by removing the `stageList` non-empty guard and observing the query still
be correct."* **There is no such guard.** `stages/route.ts:69` was `if (!pipelineId)` — the absence of
a FILTER PARAMETER, not the non-emptiness of a list. BACKLOG 999.18, REQUIREMENTS QG-03 and the
ROADMAP note all compounded the error by recording the defect as unreachable.

Two proof shapes were unavailable, for different reasons, and both are stated in the file's header:

| Shape | Why it cannot prove SC-5 |
| --- | --- |
| A substituted query builder | The defect was a **syntactically invalid statement**. Nothing but a real PostgreSQL parser rejects `IN ()`. Under a fake builder the broken and fixed routes are indistinguishable — both "work". |
| A source-text assertion over `route.ts` | Plan 48-04 closed QG-03 **by deletion**. A gate looking for the membership call site binds to nothing: it reports clean on the fixed route, on a merely-reformatted broken route, and on an empty file. 48-CONTEXT forbids it by name. |

What is left is a request and a response — and, crucially, a negative control that requires **no
invented ablation**, because the defect is reproduced by restoring code that actually shipped.

**Scope limit, stated so 48-10 is not double-counted:** invoked directly the defective handler
**REJECTS**; it does not return HTTP 500. `withApiAuth` (`src/lib/api/auth.ts:22-77`) has no
try/catch, so a database error propagates out of the returned promise and it is Next.js, in the
container, that maps it onto a status. **The HTTP-level 200 after a real container rebuild is owned by
plan 48-10, not by this file.**

## 3. Control F — the shipped defect, reproduced

**Method:** `git checkout c291dc8^ -- src/app/api/v1/stages/route.ts` (the exact pre-48-04 file as
shipped), run the suite, capture, then `git checkout HEAD -- src/app/api/v1/stages/route.ts`.

### Result: 7 failed | 18 passed (25)

```
 FAIL  |db| src/app/api/v1/stages/stages-scope.db.test.ts > SC-5 (amended) … > THE PROOF: A's request at exactly the global stage count RESOLVES with 200 and an empty page
Error: Failed query: select "id" from "pipelines" "pipelines" where ("pipelines"."id" IN () and "pipelines"."owner_id" = $1 and "pipelines"."deleted_at" is null)
params: stgscope-user-a
 ❯ PostgresJsPreparedQuery.queryWithCache ../../../node_modules/src/pg-core/session.ts:73:10
 ❯ src/app/api/v1/stages/route.ts:71:29
     69|     if (!pipelineId) {
     70|       const pipelineIds = [...new Set(stageList.map(s => s.pipelineId)…
     71|       const userPipelines = await db.query.pipelines.findMany({
       |                             ^
     72|         where: and(
     73|           sql`${pipelines.id} IN ${pipelineIds}`,
 ❯ listAs src/app/api/v1/stages/stages-scope.db.test.ts:337:20

Caused by: PostgresError: syntax error at or near ")"

Serialized Error: { severity_local: 'ERROR', severity: 'ERROR', code: '42601', position: '70',
  file: 'scan.l', routine: 'scanner_yyerror',
  query: 'select "id" from "pipelines" "pipelines" where ("pipelines"."id" IN () and "pipelines"."owner_id" = $1 and "pipelines"."deleted_at" is null)',
  parameters: [ 'stgscope-user-a' ], args: [ 'stgscope-user-a' ], types: [ +0 ] }
```

### Comparison against the research container log — they MATCH

`48-RESEARCH.md § Q6 "Measured, against the running container"`, verbatim:

```
Failed query: select "id" from "pipelines" "pipelines"
  where ("pipelines"."id" IN () and "pipelines"."owner_id" = $1 and "pipelines"."deleted_at" is null)
params: p48res-userA
cause: syntax error at or near ")"
  severity: 'ERROR', code: '42601', position: '70', file: 'scan.l', routine: 'scanner_yyerror'
```

| Field | Research (container, HTTP) | Control F (test process, direct invoke) | Match |
| --- | --- | --- | --- |
| statement text | `… where ("pipelines"."id" IN () and "pipelines"."owner_id" = $1 and "pipelines"."deleted_at" is null)` | identical, character for character | **yes** |
| `cause` / message | `syntax error at or near ")"` | `syntax error at or near ")"` | **yes** |
| `code` | `42601` | `42601` | **yes** |
| `position` | `70` | `70` | **yes** |
| `file` / `routine` | `scan.l` / `scanner_yyerror` | `scan.l` / `scanner_yyerror` | **yes** |
| bound parameter | `p48res-userA` | `stgscope-user-a` | fixture user differs, as expected |
| surfaced as | HTTP **500** (Next.js converted it) | a **rejected promise** (no try/catch in `withApiAuth`) | **differs, and predicted** — constraint 3; 48-10 owns the HTTP assertion |

Every field that describes the DEFECT is identical. The only two differences are the fixture identity
and the layer at which the error surfaces, both of which were stated in advance.

### Which of Task 2's assertions reddened, and which did not

| # | Test | Failure | Cause |
| --- | --- | --- | --- |
| 1 | SC-5 · THE PROOF (boundary) | rejection | `42601` |
| 2 | SC-5 · THE PROOF (far offset) | rejection | `42601` |
| 3 | SC-5 · COMPANION (`meta.total` 4) | rejection | `42601` |
| 4 | SC-5 · B's key | rejection | `42601` (params `stgscope-user-b`) |
| 5 | F3 · OWNER PAGE ceiling | `expected […(3)] to have a length of 4 but got 3` | global pagination, then a JS post-filter |
| 6 | F3 · PAGE AND TOTAL AGREE | `expected […(3)] to have a length of 4 but got 3` | same |
| 7 | F3 · PAGINATION AFTER AUTHORIZATION | `expected [ { id: 'stgscope-stage-a-1', …(8) } ] to have a length of 2 but got 1` | same, one page deep |

**The measured expectation held: the owner-page assertions reddened too.** The plan predicted this and
it is what the interleaved positions were for.

**What did NOT redden, recorded because it is the more useful finding.** Both cross-check directions
PASSED under the restored shape, as did both filtered paths:

- The cross-checks use `?limit=100`. A wide-enough page loads all 6 global stages, and the pre-fix
  JavaScript post-filter *did* correctly discard B's rows. **The cross-checks prove the ownership
  scope; they are blind to the pagination-order defect.** They are two different properties and both
  blocks are needed — a file with only the cross-checks would have shipped green over F3.
- `?pipeline_id=…` takes the `if (!pipelineId)` false branch, so the raw fragment is never reached at
  all. Both filtered-path tests are therefore regression guards, not defect proofs, and this summary
  should not be read as claiming otherwise.

### The failing run leaked nothing

`afterAll` runs regardless of test outcome, and the transcript contains no hook or suite-level
failure. Confirmed independently against the isolated database after the failing run:

```
$ docker exec pipelite-postgres-1 psql -U pipelite -d pipelite_dedup_test -tAc "…"
stages=0 pipelines=0 users=0 api_keys=0 audit_log=0
```

### Restore

```
$ git checkout HEAD -- src/app/api/v1/stages/route.ts
$ git diff --exit-code -- src/app/api/v1/stages/route.ts   # exit 0
$ ./node_modules/.bin/vitest run --config vitest.db.config.ts src/app/api/v1/stages/stages-scope.db.test.ts
 Test Files  1 passed (1)
      Tests  25 passed (25)
$ git diff --exit-code                                     # exit 0
```

**Control F needed no invented ablation.** The criterion moves from *a rejection carrying `42601`* to
*a resolved 200 with an empty page*, and the "before" state is the file that shipped. That is the
strongest available shape of negative control, and it is precisely why SC-5 was amended away from
ablating a guard that never existed.

## 4. Two more gates broken on purpose, before they were trusted

This phase's rule is that a gate with no recorded red observation is not delivered. Control F covers
the route; these two cover the *test's own* anti-vacuity machinery.

### RED-PROBE-1 — the empty-page assertion is not trivially satisfied

Replaced `const boundary = await globalStageCount()` with a hard `0` in THE PROOF. Verbatim:

```
 FAIL  … > THE PROOF: A's request at exactly the global stage count RESOLVES with 200 and an empty page
AssertionError: expected [ …(4) ] to deeply equal []

- []
+ [
+   { … "id": "stgscope-stage-a-1", "pipeline_id": "stgscope-pipeline-a", "position": 1000, … },
+   { … "id": "stgscope-stage-a-2", … "position": 2000, … },
+   { … "id": "stgscope-stage-a-3", … "position": 3000, … },
+   { … "id": "stgscope-stage-a-4", … }
+ ]
```

So the empty page is a consequence of the offset being past the end, not of the route returning
nothing to anybody. Reverted; 16/16 green.

### RED-PROBE-2 — the FLOOR, falsified against an empty table

`SEED_PLAN`'s two `ids` arrays were emptied — a change to the DATA and to nothing else. Result:
**6 failed | 10 passed**, and the two that matter:

```
 FAIL  … > FLOOR: the stages table is not empty, which is what makes 'past the end' mean anything
AssertionError: an EMPTY stages table makes the offset-past-the-end proof below vacuous: with zero
stages, `offset: 0` is already past the end, so the empty page it returns is not evidence that the
empty-membership defect is gone. This floor is what forces the boundary offset to be a real boundary
inside a populated table.: expected 0 to be greater than 0
 ❯ src/app/api/v1/stages/stages-scope.db.test.ts:531:7
```

…while **`THE PROOF` and `THE PROOF, not pinned to the boundary` both PASSED.** That is the whole
argument for the floor, demonstrated rather than asserted: on an empty table the SC-5 proof is
vacuously green, and the floor is the only thing standing between this file and a tenth gate that
cannot fail.

Same probe surfaced a real bug in the harness — see deviation 1.

## 5. Verification evidence

| Check | Command | Result |
| --- | --- | --- |
| db suite | `./node_modules/.bin/vitest run --config vitest.db.config.ts src/app/api/v1/stages/stages-scope.db.test.ts` | **25 passed (25)**, 1 file |
| typecheck | `./node_modules/.bin/tsc --noEmit` | **exit 0** |
| lint | `./node_modules/.bin/eslint src/app/api/v1/stages/stages-scope.db.test.ts` | **no output — 0 errors, 0 warnings** |
| tree clean after control F | `git diff --exit-code` / `git diff --cached --exit-code` | **exit 0** / **exit 0** |
| route untouched | `git diff --exit-code -- src/app/api/v1/stages/route.ts` | **exit 0** |
| base project does not collect this file | `vitest list src/app/api/v1/stages/` then a `node -e` substring check | **`false`** — not collected |
| isolation gate still green | `./node_modules/.bin/vitest run src/lib/mutations/__tests__/db-test-isolation.test.ts` | **26 passed (26)** |
| isolated DB left as found | `psql -d pipelite_dedup_test` count of all 5 touched tables | **all 0** |

Source-property counts, taken with `node -e` because `grep … | wc -l` is mangled by the `rtk` hook:

| Property | Required | Measured |
| --- | --- | --- |
| module-substitution helper occurrences | 0 | **0** |
| `assertIsolatedConnection` | present | 8 |
| `mintApiKey` | present | 3 |
| `await import(` in a test body | 0 | **0** |
| `readFileSync` (a source-text gate over `route.ts`) | 0 | **0** |
| `offset=<digit>` in **code** | 0 | **0** — the only two in the file are lines 14-15 of the header essay, quoting the container transcript |
| file length | ≥ 220 | **745** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] The fixture insert needed an empty-rows guard**

- **Found during:** Task 1, RED-PROBE-2
- **Issue:** a bare `db.insert(stages).values(rows)` **throws** on an empty array —
  `Error: values() must be called with at least one value`. The first attempt at RED-PROBE-2 therefore
  died in `beforeAll` and reported `16 tests | 16 skipped`. A control variant that skips every
  assertion it exists to redden is not a control, it is a crash, and it would have silently
  invalidated any future E-style "point it at a degenerate dataset" run — including the one 48-06
  established as this phase's idiom.
- **Fix:** `if (rows.length > 0) { await db.insert(stages).values(rows) }`, with a comment naming the
  measured error and stating why the guard is load-bearing rather than housekeeping.
- **Verification:** the same probe then produced the intended `6 failed | 10 passed` with the FLOOR's
  message rendered.
- **Committed in:** `e0e1aa5`

**2. [Rule 2 - Missing critical] `audit_log` added to `TOUCHED_TABLES`, and asserted before teardown**

- **Found during:** Task 1
- **Issue:** the plan named four tables (`users`, `api_keys`, `pipelines`, `stages`). `audit_log` is
  written by a *subscriber* rather than by a route, so it is the table a fixture sweep is most likely
  to forget, and a touched table absent from the baseline set is a hole in the guarantee `afterAll`
  exists to give. But adding it to `removeFixtures` creates its own vacuity: the baseline half would
  then pass **even if every read had been audited**.
- **Fix:** added to `TOUCHED_TABLES`, to `LEFTOVER_PREDICATE` (keyed on `entity_id` / `actor_user_id`,
  because `audit_log.id` is a generated UUID and an id-prefix check there reports zero however many
  rows leak), and to `removeFixtures` — *plus* a sixth describe block asserting
  `countLeftovers("audit_log") === 0` **before** teardown, where such a row would still exist.
- **Verification:** passes; the assertion is non-vacuous by construction of where it sits.
- **Committed in:** `e0e1aa5` / `bd8d4c9`

### Deviations of record (no fix required)

**3. Task 3 produced no commit, by design.** Its acceptance criterion is that
`git diff --exit-code` exits 0 afterwards, i.e. that `route.ts` is byte-identical to its 48-04 state.
Its deliverable is §3 of this document. `route.ts` appears in the plan's `files_modified` because the
control temporarily rewrites it; the plan's own `<action>` requires the restore.

**4. `REQUIREMENTS.md` and `BACKLOG.md` were deliberately not touched.** Plan **48-09** is running in a
parallel worktree in this same wave and its `files_modified` claims both files, specifically to correct
the "QG-03 is unreachable" claim this plan disproves. Editing them here would have produced a merge
conflict over the same paragraphs. The `requirements-completed` frontmatter above records `QG-03` and
`SEC-02` for the orchestrator; the prose corrections belong to 48-09.

**5. The unused-symbol churn between the two task commits is real, not cosmetic.** `PAGE_WINDOW`,
`FIRST_PAGE_OFFSET` and the `and`/`eq` imports were written during Task 1 and removed before its
commit, because they had no consumer until Task 2 and lint reported them. Task 2 reintroduced the two
constants (with `A_PAGE_COUNT`) alongside their uses. Both commits are lint-clean at 0 errors and
0 warnings; neither is a snapshot of a file that was mid-edit.

**6. Tasks 1 and 2 wrote one file; the RED probes ran between them.** The harness-plus-SC-5 state was
run to green (16/16), probed red twice, restored, linted, typechecked and committed as `e0e1aa5`; the
F3 block was then added, re-run (25/25) and committed as `bd8d4c9`. Both commits describe their tree
accurately.

**Total deviations:** 2 auto-fixed (both Rule 2) + 4 recorded. No file outside the plan's
`files_modified` was changed, and the one pre-existing source file in that list —
`src/app/api/v1/stages/route.ts` — is byte-identical to its 48-04 state.

## Issues Encountered

- **Worktree base was stale — 29th consecutive occurrence.** `merge-base` was `a58b9e1`, not the
  expected `4926730`. Corrected with `git merge --ff-only 4926730`, never `reset --hard`, and verified
  by asserting `48-08-SUMMARY.md` exists rather than by comparing SHAs alone.
- **`rtk` mangling, as recorded.** `grep … | wc -l` is unreliable for a count gate, so every source
  count in §5 was taken with `node -e`. Two chained commands were also refused by the worktree
  isolation guard as "too complex to verify" and had to be split.
- **Shared `pipelite_dedup_test`.** `scripts/dedup-db-test-setup.sh` drops and rebuilds every schema in
  that database, which would destroy a concurrent db-test run. 48-09's `files_modified` was checked
  first and contains no `*.db.test.ts`, so the rebuild was safe. **Any future wave that schedules two
  db-test plans in parallel will corrupt both.**
- **DEF-48-01 still stands** (`npm run test:db` exits non-zero on a green suite, because
  `queries.db.test.ts`'s teardown queries a non-existent `id` column on `saved_view_defaults`). This
  plan ran the single file directly and never gated on the script's exit code. Unchanged by this work.

## Threat Model — dispositions delivered

| Threat ID | Disposition | Delivered by |
| --- | --- | --- |
| T-48-07-01 | mitigate | SC-5 block: boundary + far offset, offset read from a live `count(*)`; reproduced by control F with `42601` |
| T-48-07-02 | mitigate | both cross-check directions, each asserting absence in the response AND presence in the table by direct SQL |
| T-48-07-03 | mitigate | owner-page ceiling and floor, page-and-total-agree, and the pagination window — all three reddened under control F |
| T-48-07-04 | mitigate | the global-count FLOOR, **falsified in RED-PROBE-2**: with an empty table the SC-5 proof passes and only the floor reddens |
| T-48-07-05 | mitigate | no source-text gate exists in this file (`readFileSync` count 0); the header states why one would bind to nothing |
| T-48-07-06 | mitigate | module-scope `assertIsolatedConnection`, with its refusals AND its acceptance both asserted |
| T-48-07-07 | mitigate | control F's failing run left `stages=0 pipelines=0 users=0 api_keys=0 audit_log=0`, confirmed by direct `psql` |
| T-48-07-08 | accept | unchanged — an offset ceiling was rejected in 48-04 because it hides the defect behind a different behaviour change; the behavioural test is the guard, and it now exists |

## Threat Flags

None. No network endpoint, auth path, file access pattern or schema change was introduced — one test
file was added and no production module was modified.

## Known Stubs

None.

## Next Phase Readiness

**For 48-10 (sign-off):** the HTTP-level assertion is explicitly *not* delivered here and is owed.
This file proves the direct-invocation contract — a rejection carrying `42601` becomes a resolved 200
with an empty page. 48-10 must rebuild the container (`docker compose up -d --build`, never
`restart`, per the recorded observation that `restart` runs the OLD image) and confirm
`GET /api/v1/stages?limit=5&offset=<live count>` returns **HTTP 200** with `{"data":[],…}` where it
previously returned 500.

**For 48-09:** QG-03 is disproven as "unreachable". The evidence to cite is §3 of this document: the
statement text, `42601`, and `position: '70'` reproduced from shipped code.

**Pattern available for reuse:** `stages-scope.db.test.ts` is the second `*-scope.db.test.ts`. The
two-owner / two-real-key / floor-ceiling-discriminator-crosscheck shape is now a pattern, and Phase 50's
export-authorization work can copy either file rather than inventing a third harness.

## Self-Check: PASSED

| Claim | Check | Result |
| --- | --- | --- |
| `src/app/api/v1/stages/stages-scope.db.test.ts` exists | `ls -la` | FOUND, 37.5K |
| `.planning/phases/48-rest-api-authorization/48-07-SUMMARY.md` exists | `ls -la` | FOUND, 25.4K |
| commit `e0e1aa5` exists | `git log --oneline` | FOUND |
| commit `bd8d4c9` exists | `git log --oneline` | FOUND |
| working tree clean | `git diff --exit-code` | exit 0 |
| nothing untracked or staged | `git status --short` | empty |

`468029b` is this document's own commit; the row above is omitted because it could not exist at the
time this table was written. It is verifiable in `git log` after the amend that added this section.
