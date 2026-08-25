---
phase: 48-rest-api-authorization
plan: 04
subsystem: api
tags: [drizzle, postgres, sql, authorization, pagination, rest-api, vitest]

# Dependency graph
requires:
  - phase: 40-saved-views
    provides: "the exported-predicate-builder pattern (`visibleViewsPredicate`) and the compiled-SQL assertion idiom that reads the statement rather than the source"
provides:
  - "`ownedStagesPredicate(userId, pipelineId)` in `src/lib/api/stage-scope.ts` — the single owner-scoping predicate for stage reads on `/api/v1`"
  - "`GET /api/v1/stages` rewritten as a joined, owner-scoped select that paginates AFTER authorizing"
  - "Deletion of the raw SQL membership fragment built from a JavaScript array (QG-03 root cause)"
  - "`src/app/api/v1/stages/__tests__/in-clause.test.ts` — compiled-SQL and route-binding assertions, 10 tests"
affects: [48-05, 48-07, 48-08, 48-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Owner scoping lives in an exported predicate builder under `src/lib/api/`, not inline in a `route.ts` (Next.js validates the route export surface)"
    - "One predicate expression feeds both the page `where` and the count `where`, asserted by identical compiled render"
    - "Route-binding assertions drive the handler with a chainable db stub that records method ORDER, so 'paginate after authorize' is checkable"

key-files:
  created:
    - src/lib/api/stage-scope.ts
    - src/app/api/v1/stages/__tests__/in-clause.test.ts
  modified:
    - src/app/api/v1/stages/route.ts

key-decisions:
  - "Took the join fix, not the minimal `inArray` fix: adopting the count query's `innerJoin` in the list query deletes the pipeline-id array entirely, closing QG-03 at the root and closing F3 in the same edit"
  - "`inArray` never appears in the fixed route — the array it would operate on no longer exists — so any gate written against an `inArray` call site would bind to nothing"
  - "No `.length > 0` guard added: drizzle-orm 0.45.2 renders `inArray(col, [])` as the literal `false` rather than throwing, and after this fix neither form appears"
  - "No offset ceiling added to `parsePagination` — that would hide the defect behind a different behaviour change"
  - "The pipeline-ownership 404 check at :34-41 is KEPT even though the new predicate makes it redundant; the redundancy preserves the 404-for-unknown-or-foreign-pipeline_id contract"
  - "The `expand.has('pipeline')` gate is KEPT: the pipeline row is now always joined, so that gate is the only thing keeping it out of a bare response"
  - "The old raw fragment is quoted in full in `stage-scope.ts` but deliberately NOT re-quoted inside `route.ts` or the test file, so a textual scan of the `/api/v1` corpus sees zero occurrences"

patterns-established:
  - "Compiled-SQL assertion via `new PgDialect().sqlToQuery(expr)` is not a source grep: it reads the statement that would be sent, so comments and identifier names are invisible to it"
  - "`db.select()` returns a FRESH recorded builder per call, so 'the page query's where' and 'the count query's where' are told apart structurally rather than by call order"
  - "Every negative assertion (`not.toContain`, `not.toMatch`) is preceded by a positive FLOOR on the same string, so an empty render cannot satisfy it vacuously"

requirements-completed: [QG-03, SEC-02]

# Metrics
duration: 15min
completed: 2026-08-25
---

# Phase 48 Plan 04: Stage List Scoping Summary

**`GET /api/v1/stages` rewritten as an `innerJoin`ed, owner-scoped select that paginates after authorizing, deleting the JavaScript pipeline-id array whose empty case emitted `IN ()` and returned SQLSTATE 42601.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-25T19:06:00Z
- **Completed:** 2026-08-25T19:21:17Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 rewritten)

## Accomplishments

- **QG-03 closed at the root.** The route no longer builds a JavaScript array of pipeline ids and no
  longer issues a second `pipelines` query. There is no runtime-sized list to render into the
  statement, therefore no empty-membership case, therefore no `42601`.
- **F3 closed in the same edit.** The page and the total are now computed from ONE predicate
  expression over the same join, and `offset`/`limit` are applied *after* the `where`. The measured
  symptom — `?limit=5` returning `data: []` alongside `meta.total: 1` for the stage's own owner — is
  covered by an assertion that fails on the pre-fix shape.
- **`ownedStagesPredicate` extracted** to `src/lib/api/stage-scope.ts` under exactly that pinned name,
  ready for plans 48-05 and 48-08 to add to the Q10 gate's `AUTHORIZERS` set.
- **No foreign row is read at all.** T-48-04-02 was information disclosure via a global page filtered
  in JavaScript; the scope is now in the join, so rows the caller does not own never cross the
  database boundary.
- **10 tests, all of which can fail** — proven by two ablations below plus the two-stage RED.

## Task Commits

1. **Task 1: compiled-SQL and route-binding assertions, observed RED** — `82d1a86` (test)
2. **Task 2: extract `ownedStagesPredicate`, rewrite the list query** — `c291dc8` (feat)
3. **Task 3: two ablations** — no code change (tree restored clean); transcripts recorded below and
   committed with this SUMMARY.

## Files Created/Modified

- `src/lib/api/stage-scope.ts` *(created)* — exports exactly one symbol, `ownedStagesPredicate(userId, pipelineId?)`,
  returning `and(eq(pipelines.ownerId, userId), isNull(pipelines.deletedAt), ...(pipelineId ? [eq(stages.pipelineId, pipelineId)] : []))`
  typed as drizzle's `SQL`. Header records why one definition exists, what raw fragment it replaced,
  and that the caller id is always a bound parameter.
- `src/app/api/v1/stages/route.ts` *(modified)* — GET rewritten. Deleted: `stageConditions`,
  `withOptions`, the global `db.query.stages.findMany` page, the whole `if (!pipelineId)` block
  (the id array, the second `pipelines.findMany`, the JS post-filter), and the now-unused `StageWith`
  / `StageExpanded` types. Added: a joined `db.select({ stage, pipeline })` with
  `innerJoin → where(ownedStagesPredicate) → orderBy → offset → limit`. The count query keeps its join
  and `count(*)` and now calls the same predicate. POST untouched. The 404 check untouched.
- `src/app/api/v1/stages/__tests__/in-clause.test.ts` *(created)* — 3 predicate tests + 7 route-binding tests.

## The RED observations, verbatim

### RED stage 1 — Task 1, module unresolved, route untouched

```
 RUN  v4.1.11 /home/pedro/programming/pipelite/.claude/worktrees/agent-ac71c3a80cf3aaefd

 ❯ src/app/api/v1/stages/__tests__/in-clause.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/api/v1/stages/__tests__/in-clause.test.ts [ src/app/api/v1/stages/__tests__/in-clause.test.ts ]
Error: Cannot find package '@/lib/api/stage-scope' imported from /home/pedro/programming/pipelite/.claude/worktrees/agent-ac71c3a80cf3aaefd/src/app/api/v1/stages/__tests__/in-clause.test.ts
 ❯ src/app/api/v1/stages/__tests__/in-clause.test.ts:66:1
     64|
     65| import { db } from "@/db"
     66| import { ownedStagesPredicate } from "@/lib/api/stage-scope"
       | ^
     67| import { GET } from "@/app/api/v1/stages/route"
     68|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  no tests
   Start at  16:10:08
   Duration  2.93s (transform 169ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)
```

`git diff --exit-code -- src/app/api/v1/stages/route.ts` exited 0 at this point — the route was
untouched.

### RED stage 2 — Task 2, `stage-scope.ts` created, route still unfixed

Sequenced deliberately (the plan's acceptance criteria anticipate it) so the route-binding assertions
produce received values rather than a module-resolution error.

```
 ❯ src/app/api/v1/stages/__tests__/in-clause.test.ts (10 tests | 6 failed) 131ms
     × issues no pipelines list query: the array that produced IN () no longer exists 42ms
     × computes the page and the total from ONE predicate (F3) 13ms
     × applies the pipeline filter to both queries when pipeline_id is supplied 5ms
     × joins pipelines and paginates AFTER the ownership predicate 4ms
     × returns the owner's own stage for a small limit, with a matching total 9ms
     × omits the joined pipeline unless expand=pipeline is requested 13ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/api/v1/stages/__tests__/in-clause.test.ts > GET /api/v1/stages — the route is bound to the predicate > issues no pipelines list query: the array that produced IN () no longer exists
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
...
Number of calls: 1

 ❯ src/app/api/v1/stages/__tests__/in-clause.test.ts:263:49
    261|     await GET(stagesRequest())
    262|
    263|     expect(mockDb.query.pipelines.findMany).not.toHaveBeenCalled()
       |                                                 ^
```

The three predicate-shape tests were GREEN here and the six route-binding tests were RED — exactly the
split the plan predicted, and the received call count of 1 for `pipelines.findMany` is the array's
existence being observed directly.

### GREEN — after the rewrite

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

## Task 3 — Ablations, verbatim

**Neither ablation is the SC-5 proof.** SC-5 is behavioural — `GET /api/v1/stages?offset=<stage_count>`
returning **500 today and 200 with `data: []` after** — and it is **owned by plan 48-07**, against a
real PostgreSQL and a rebuilt image. 48-VALIDATION control **F** (restoring the raw fragment and
observing `42601` return) lives there too. Invoked directly the way this test file does, the handler
would *reject* rather than return a 500, because `withApiAuth` has no try/catch — so no HTTP 500 is
observable at this level and none is asserted. **The two ablations below prove only that the
CI-visible structural assertions are load-bearing.**

### Ablation G1 — reinstate the defect

Restored the pre-fix GET: the global `db.query.stages.findMany` page, the `if (!pipelineId)` block,
the pipeline-id array and the raw membership fragment; the count query left correct.

```
 ❯ src/app/api/v1/stages/__tests__/in-clause.test.ts (10 tests | 6 failed) 135ms
     × issues no pipelines list query: the array that produced IN () no longer exists 55ms
     × computes the page and the total from ONE predicate (F3) 22ms
     × applies the pipeline filter to both queries when pipeline_id is supplied 4ms
     × joins pipelines and paginates AFTER the ownership predicate 6ms
     × returns the owner's own stage for a small limit, with a matching total 10ms
     × omits the joined pipeline unless expand=pipeline is requested 14ms

 FAIL  ... > issues no pipelines list query: the array that produced IN () no longer exists
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
...
Number of calls: 1
 ❯ src/app/api/v1/stages/__tests__/in-clause.test.ts:263:49

 FAIL  ... > computes the page and the total from ONE predicate (F3)
AssertionError: expected [ +0 ] to have a length of 2 but got 1

- Expected
+ Received

- 2
+ 1

 ❯ src/app/api/v1/stages/__tests__/in-clause.test.ts:274:22

 FAIL  ... > applies the pipeline filter to both queries when pipeline_id is supplied
AssertionError: expected [ +0 ] to have a length of 2 but got 1

- Expected
+ Received

- 2
+ 1

 ❯ src/app/api/v1/stages/__tests__/in-clause.test.ts:294:22

 FAIL  ... > joins pipelines and paginates AFTER the ownership predicate
AssertionError: expected [ +0 ] to have a length of 2 but got 1

- Expected
+ Received

- 2
+ 1

 ❯ src/app/api/v1/stages/__tests__/in-clause.test.ts:309:22

 FAIL  ... > returns the owner's own stage for a small limit, with a matching total
AssertionError: expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0

 ❯ src/app/api/v1/stages/__tests__/in-clause.test.ts:332:23

 FAIL  ... > omits the joined pipeline unless expand=pipeline is requested
TypeError: Cannot convert undefined or null to object
```

Expected reds observed: `pipelines.findMany was not called` (received 1 call), and the
"page and count render the same predicate" assertion (only one `db.select` builder existed at all,
because the page was not a `db.select` query). Restored.

### Ablation G2 — drift the two predicates

Kept the join in both queries, but gave the count query its own inline `and(...)` omitting the
`isNull(pipelines.deletedAt)` guard.

```
 ❯ src/app/api/v1/stages/__tests__/in-clause.test.ts (10 tests | 2 failed) 48ms
     × computes the page and the total from ONE predicate (F3) 11ms
     × applies the pipeline filter to both queries when pipeline_id is supplied 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  ... > computes the page and the total from ONE predicate (F3)
AssertionError: expected '("pipelines"."owner_id" = $1 and "pip…' to be '"pipelines"."owner_id" = $1' // Object.is equality

Expected: ""pipelines"."owner_id" = $1"
Received: "("pipelines"."owner_id" = $1 and "pipelines"."deleted_at" is null)"

 ❯ src/app/api/v1/stages/__tests__/in-clause.test.ts:286:21

 FAIL  ... > applies the pipeline filter to both queries when pipeline_id is supplied
AssertionError: expected '("pipelines"."owner_id" = $1 and "pip…' to be '("pipelines"."owner_id" = $1 and "sta…' // Object.is equality

Expected: "("pipelines"."owner_id" = $1 and "stages"."pipeline_id" = $2)"
Received: "("pipelines"."owner_id" = $1 and "pipelines"."deleted_at" is null and "stages"."pipeline_id" = $2)"

 ❯ src/app/api/v1/stages/__tests__/in-clause.test.ts:301:21

 Test Files  1 failed (1)
      Tests  2 failed | 8 passed (10)
```

**Exactly the two identical-render assertions reddened; the other eight stayed green.** That is the
point of G2: the F3 half of this plan is covered independently of the QG-03 half, and it is covered by
comparing the two compiled statements rather than by any behavioural side effect. Note the diff is a
real SQL difference — the count would have included stages of soft-deleted pipelines while the page
would not. Restored.

### Restore proof

```
$ git diff --exit-code
DIFF_EXIT=0
$ ./node_modules/.bin/vitest run "src/app/api/v1/stages/__tests__/in-clause.test.ts"
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

## Verification

| Gate | Result |
|------|--------|
| `vitest run src/app/api/v1/stages/__tests__/in-clause.test.ts` | 10 passed |
| Base project (`vitest.config.ts`) | **173 files passed / 2 skipped; 5247 passed / 32 skipped** — baseline was 172 / 5237, so exactly +1 file and +10 tests, no new failures |
| RSC project (`vitest.rsc.config.ts`) | 2 files, 8 passed (baseline 8/8) |
| `tsc --noEmit` | exit 0 |
| `npm run lint` | **0 errors**, 122 warnings (the worktree baseline; gated on errors, never the warning total) |
| `git diff --exit-code` after both ablations | exit 0 |

Source counts, recomputed with `node -e` (never `wc -l` — `rtk` miscounts pipes in this environment):

| Check | `route.ts` | `in-clause.test.ts` | `stage-scope.ts` |
|-------|-----------|---------------------|------------------|
| `pipelineIds` | 0 | 0 | 1 (in the header autopsy, by design) |
| raw ``sql`…IN…` `` template | 0 | 0 | 1 (same) |
| `db.query.pipelines.findMany` | 0 | — | — |
| `inArray` | 0 | 0 | 0 |
| `ownedStagesPredicate(ctx.userId` | **2** | — | — |
| `innerJoin(pipelines` | 2 | — | — |
| `StageWith` / `StageExpanded` | 0 | — | — |
| exported symbols | — | — | **1** (`ownedStagesPredicate`) |

## Decisions Made

- **Join fix over minimal `inArray` fix**, per the plan's constraint 1. The alternative fixes the 500
  and leaves F3 untouched.
- **The old fragment is quoted only in `src/lib/api/stage-scope.ts`.** The plan's Task 2 action asks
  the module header to record what it replaced; its Task 2 acceptance criteria simultaneously require
  **zero** occurrences of `pipelineIds` and of the templated `IN` in `route.ts`. Both are satisfied by
  putting the autopsy in the library module and having the route (and the test file) point at it
  rather than restate it. This also keeps a future textual scan of the `/api/v1` corpus clean.
- **A fresh recorded builder per `db.select()` call**, rather than one shared stub. See deviations.

## Deviations from Plan

### 1. [Test design] `db.select()` returns a fresh recorded builder per call, not one shared stub

- **Found during:** Task 1
- **Plan text:** "Mock `@/db` with a single recursive chainable stub … whose methods each record their
  arguments into a module-scope call log and return the stub itself."
- **What was built:** the same recursive chainable stub, but `db.select()` mints a new one per call and
  every recorded call is tagged with that builder's index. The call log is still module-scope and still
  records method ORDER as well as arguments.
- **Why:** with one shared stub, "the page query's `where`" and "the count query's `where`" can only be
  told apart by call ordinal — and the identical-render assertion would then pass just as happily if
  **one** query ran and called `where` twice, which is precisely the claim being made. Fresh builders
  make the "two queries, one predicate" claim structural, and let the test carry an explicit FLOOR
  (`expect(builders).toHaveLength(2)`) before comparing renders. Ablation G1 confirms the floor is
  load-bearing: it reddens on its own when only one builder exists.
- **Files:** `src/app/api/v1/stages/__tests__/in-clause.test.ts`
- **Committed in:** `82d1a86`

### 2. [Rule 2 - Missing coverage] Three assertions added beyond the plan's `<behavior>` list

- **Found during:** Task 1
- **Added:** (a) `db.query.stages.findMany` is also not called — the relational page query is gone, not
  just the pipelines one; (b) the `expand=pipeline` mapping, bare vs expanded — the pipeline row is now
  *always* joined, so the `expand` gate became the only thing keeping it out of a bare response and is
  newly load-bearing; (c) the 404 contract for an unknown or foreign `pipeline_id`, with
  `db.select` asserted not called — the plan's constraint 7 keeps that check and nothing else pinned it.
- **Why:** (b) in particular is a *new* responsibility created by this plan's own edit. Leaving it
  unasserted would let a later cleanup delete the guard and start leaking pipeline rows into every bare
  list response.
- **Files:** `src/app/api/v1/stages/__tests__/in-clause.test.ts`
- **Committed in:** `82d1a86`

---

**Total deviations:** 2 (1 test-design improvement, 1 added coverage). No production-code deviation —
the fix shape is exactly the one the plan decided.
**Impact on plan:** none on scope. Both changes make the assertions harder to satisfy vacuously.

## Issues Encountered

- **The worktree branched from a stale base** (`a58b9e1`, 28-of-28 pattern). Fast-forwarded with
  `git merge --ff-only ae514ed` per the standing instruction; never `reset --hard`.
- **First draft of the route comment reintroduced the forbidden tokens textually.** Writing the
  autopsy inline meant `route.ts` contained the literal `pipelineIds` and a templated ``sql`…IN…` ``,
  which would have failed Task 2's own zero-occurrence criteria while the code was correct. Caught by
  running the `node -e` counts rather than assuming; both comments now point at `stage-scope.ts`.
  A reminder that a source-count gate cannot distinguish code from prose — which is the same reason
  this phase forbids proving SC-5 by grepping route text.

## Threat Model Coverage

| Threat | Disposition | Where it landed |
|--------|-------------|-----------------|
| T-48-04-01 DoS via `IN ()` / `42601` | mitigated | array deleted; predicate is a static join condition. **Behavioural proof owed by plan 48-07** |
| T-48-04-02 Info disclosure via JS post-filter | mitigated | `innerJoin` + predicate scope the read; no foreign row is fetched |
| T-48-04-03 Self-denial (`data: []`, `total: 1`) | mitigated | pagination after the predicate; asserted by the method-ordering record |
| T-48-04-04 Page/total drift | mitigated | one predicate, two `where`s; identical-render assertion, ablated in G2 |
| T-48-04-05 Injection | mitigated / **restated** | fragment deleted. For NON-empty arrays drizzle expanded values into placeholders, so this was an **availability and robustness** defect, not SQL injection. Recorded in `stage-scope.ts` so it is not overstated later |
| T-48-04-06 Predicate correct but unused | mitigated | route's captured `where` is rendered and compared to the helper's own render |
| T-48-04-07 A future raw `IN` over a JS array elsewhere | **accepted, owner named** | out of this route's scope; the Q10 gate (48-08) is a presence gate over authorization, not over SQL construction. Not silently assumed covered |

No new threat surface introduced: no new endpoint, no new auth path, no schema change. The route's
trust boundaries narrowed.

## Next Phase Readiness

- **`ownedStagesPredicate` is available at `src/lib/api/stage-scope.ts` under the pinned name** for
  plans 48-05 and 48-08 to add to the Q10 `AUTHORIZERS` set. It is called twice in
  `src/app/api/v1/stages/route.ts`, both times as `ownedStagesPredicate(ctx.userId, pipelineId)`.
- **Plan 48-07 owes SC-5**: `GET /api/v1/stages?offset=<stage_count>` must be observed 500 before and
  200 with `data: []` after, against a rebuilt image. `docker compose restart` runs the OLD image —
  the container must be **rebuilt**, or the observation is vacuous.
- **Plan 48-07 also owes 48-VALIDATION control F**: restore the raw fragment against a real PostgreSQL
  and observe `42601` return.
- No blockers. `stages/[id]/` was not touched (owned by plan 48-03); `route-authorization.test.ts` was
  not touched (owned by plan 48-05).

## User Setup Required

None — no external service configuration required.

## Known Stubs

None. No hardcoded empty value, placeholder string or unwired data source was introduced. The
`expand.has("pipeline")` guard is a deliberate API contract, not a stub, and is asserted in both
directions.

## Self-Check: PASSED

- `src/lib/api/stage-scope.ts` — FOUND
- `src/app/api/v1/stages/route.ts` — FOUND
- `src/app/api/v1/stages/__tests__/in-clause.test.ts` — FOUND
- `.planning/phases/48-rest-api-authorization/48-04-SUMMARY.md` — FOUND
- commit `82d1a86` — FOUND in `git log --all`
- commit `c291dc8` — FOUND in `git log --all`

---
*Phase: 48-rest-api-authorization*
*Completed: 2026-08-25*
