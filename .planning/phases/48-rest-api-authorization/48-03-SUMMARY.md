---
phase: 48-rest-api-authorization
plan: 03
subsystem: api
tags: [rest-api, authorization, drizzle, relational-queries, vitest, idor, rfc7807]

# Dependency graph
requires:
  - phase: 47-suite-trust-supply-chain
    provides: the anti-vacuity discipline (ablate every gate; a gate that cannot fail is worse than no gate)
provides:
  - "GET /api/v1/stages/:id authorizes through the file's own verifyStageOwnership helper — the authorization read is no longer caller-controlled"
  - "src/app/api/v1/stages/[id]/__tests__/route.test.ts — the first test coverage this route file has ever had"
  - "a with-aware Drizzle findFirst mock that models relational loading, self-tested before anything depends on it"
  - "two recorded ablations proving which SC-4 cells are sensitive to SEC-02 and which are merely regression guards"
affects: [48-05 route-authorization regression gate, 48-04 stages list scope, any future /api/v1 per-record read]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "authorization reads are unconditional; only the response projection is caller-controlled"
    - "a mocked relational db must honour `with`, and that behaviour is asserted before any route assertion depends on it"
    - "green-today cells are labelled REGRESSION GUARD in the test source, never presented as defect proof"

key-files:
  created:
    - "src/app/api/v1/stages/[id]/__tests__/route.test.ts"
  modified:
    - "src/app/api/v1/stages/[id]/route.ts"

key-decisions:
  - "The fix is deletion, not addition: the GET calls the pre-existing verifyStageOwnership helper unchanged. The helper body is byte-identical to the committed version (505 bytes, verified programmatically), so PUT and DELETE behaviour is untouched."
  - "Only `owner + no expand -> 200` is presented as evidence that SEC-02 is fixed. The other three SC-4 cells pass identically before and after the fix and are labelled regression guards in the test source, in this summary, and nowhere counted as proof."
  - "The db mock strips the `pipeline` relation unless the call's `with` requests it. A with-blind mock would have made SEC-02 unreproducible — the unfixed route would have returned 200 and the suite could never have gone red."
  - "403 retained for non-owners; not changed to 404. The existence-leak tension is recorded in 48-CONTEXT and deliberately deferred."
  - "The `expand.has(\"pipeline\") &&` projection guard is now load-bearing rather than belt-and-braces, is commented as such in the route, and has its own assertion (SC-4c) plus its own ablation (S2)."

patterns-established:
  - "No input may decide what an authorization predicate can see: the `with` that loads the relation the check compares against is constructed inside the helper, never from the query string."
  - "Ablate before believing: every claim about which cells detect a defect was measured by reinstating the defect and reading the run, not inferred from the diff."

requirements-completed: [SEC-02]

# Metrics
duration: 18min
completed: 2026-08-25
---

# Phase 48 Plan 03: Stage GET Authorization Summary

**`GET /api/v1/stages/:id` stopped 403-ing its own owner: the route now reads ownership through the file's unchanged `verifyStageOwnership` helper instead of a `with` clause the caller controlled via `?expand=pipeline`, with all four SC-4 cells asserted, three of them explicitly labelled regression guards, and both ablations measured.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-08-25T19:02:37Z
- **Completed:** 2026-08-25T19:20:28Z
- **Tasks:** 3
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- **SEC-02 fixed.** The GET's `withOptions` (built from `?expand=pipeline`), its own `findFirst`, and its byte-for-byte copy of the helper's predicate are all deleted. The GET is now the PUT/DELETE prologue plus a projection. The legitimate owner gets 200 without `?expand`.
- **The route file has test coverage for the first time.** 13 assertions across the four SC-4 cells, the SC-4c leak guard, a four-case db-mock self-test, and two 404-before-403 cells.
- **The SC-4 vacuity trap (CONTEXT C3) was handled, not rediscovered.** Ablation S1 measured that both non-owner cells stay green while the defect is reinstated — so their passing is not, and is never presented as, evidence.
- **The fix's own leak is guarded and the guard is proven sensitive.** Ablation S2 turned SC-4c red alone.

## Task Commits

1. **Task 1: Write the four-cell test with a with-aware db mock, observe SC-4a RED** — `00882f0` (test)
2. **Task 2: Make the GET call verifyStageOwnership, observe GREEN** — `a72caf4` (fix)
3. **Task 3: Two ablations (S1 reinstate the defect, S2 remove the leak guard)** — no code change by construction; both ablations were applied, measured, and reverted with `git checkout --` on the single route file. `git diff --exit-code` exits 0. The deliverable is the transcripts below, committed with this SUMMARY.

## Files Created/Modified

- `src/app/api/v1/stages/[id]/__tests__/route.test.ts` (NEW, 340 lines) — the four SC-4 cells with the three guards labelled in their `describe` titles, the SC-4c leak assertion, the structural `with.pipeline === true` assertion, a four-case self-test of the db mock, and 404-before-403 cells.
- `src/app/api/v1/stages/[id]/route.ts` (MODIFIED, +14 / −12, GET only) — `withOptions`, the GET-local `findFirst` and the copied predicate replaced by `const { stage, owned } = await verifyStageOwnership(id, ctx.userId)`; two comments added recording the rule the fix encodes and the newly load-bearing projection guard.

## The evidence, and what is NOT evidence

| Cell | Caller | `?expand` | Before fix | After fix | Status |
|------|--------|-----------|-----------|-----------|--------|
| **SC-4a** | **owner** | **no** | **403** | **200** | **THE PROOF — the only cell sensitive to SEC-02** |
| SC-4a (structural) | owner | no | `with.pipeline` = `undefined` | `true` | **THE PROOF — the read is no longer caller-controlled** |
| SC-4a′ | owner | yes | 200 | 200 | regression guard |
| SC-4b | non-owner | no | 403 **for the wrong reason** | 403 via the real comparison | **regression guard — NOT evidence** |
| SC-4b′ | non-owner | yes | 403 | 403 | regression guard |
| SC-4c | owner | no | (unreachable: 403) | no `pipeline` key | guards the leak the FIX creates |

**Stated explicitly, as the plan requires:** the `non-owner + no expand → 403` cell passed in the ablated state and in the fixed state — measured, both runs below. It is therefore insensitive to SEC-02 and is **never presented as evidence that SEC-02 was fixed**. It is retained solely so that deleting the ownership check later turns it red.

## Task 1 — RED, verbatim

Route file untouched at this point (`git diff --exit-code -- "src/app/api/v1/stages/[id]/route.ts"` → exit 0).

```
 ✓ db mock self-test — findFirst honours `with` > omits the pipeline relation entirely when `with` is undefined 4ms
 ✓ db mock self-test — findFirst honours `with` > omits the pipeline relation when `with` is present but does not request it 1ms
 ✓ db mock self-test — findFirst honours `with` > returns a populated pipeline relation when `with: { pipeline: true }` is passed 1ms
 ✓ db mock self-test — findFirst honours `with` > returns undefined when the row does not exist, regardless of `with` 2ms
 × SC-4a — owner, NO ?expand → 200 [THE DEFECT PROOF, red before the fix] > returns 200 to the stage's legitimate owner without ?expand=pipeline 17ms
   → expected 403 to be 200 // Object.is equality
 × SC-4a — owner, NO ?expand → 200 [THE DEFECT PROOF, red before the fix] > reads ownership through an UNCONDITIONAL relation load: a bare GET's findFirst carries with.pipeline === true 3ms
   → expected undefined to be true // Object.is equality
 × SC-4c — owner, NO ?expand → body has no `pipeline` key [guards the fix's own leak] > does not project the pipeline object when the caller did not ask to expand it 3ms
   → expected 403 to be 200 // Object.is equality
 ✓ SC-4a' — owner, ?expand=pipeline → 200 + expanded pipeline [REGRESSION GUARD, green before AND after] > returns 200 and the expanded pipeline to the owner 3ms
 ✓ SC-4b — non-owner, NO ?expand → 403 [REGRESSION GUARD — 403 today for the WRONG reason, NOT evidence] > returns 403 to a caller who does not own the stage's pipeline 2ms
 ✓ SC-4b — non-owner, NO ?expand → 403 [REGRESSION GUARD — 403 today for the WRONG reason, NOT evidence] > 403s because the row EXISTS and is foreign, not because the row is absent 2ms
 ✓ SC-4b' — non-owner, ?expand=pipeline → 403 [REGRESSION GUARD, green before AND after] > returns 403 to a non-owner even when the relation is explicitly requested 2ms
 ✓ lookup — a missing stage is still 404, decided before the ownership verdict > returns 404 with an ENTITY_NOT_FOUND problem type when the stage does not exist 1ms
 ✓ lookup — a missing stage is still 404, decided before the ownership verdict > returns 404 rather than 403 even when ?expand=pipeline is requested 1ms

 Test Files  1 failed (1)
      Tests  3 failed | 10 passed (13)
```

```
AssertionError: expected 403 to be 200 // Object.is equality
- Expected
+ Received
- 200
+ 403
 ❯ src/app/api/v1/stages/[id]/__tests__/route.test.ts:220:29

AssertionError: expected undefined to be true // Object.is equality
- Expected:
true
+ Received:
undefined
 ❯ src/app/api/v1/stages/[id]/__tests__/route.test.ts:231:34
```

**Which cell went red, precisely:** the two `SC-4a` assertions (status 403 where 200 was expected; `with.pipeline` `undefined` where `true` was expected). `SC-4c` also failed, but on its **status precondition** (403 ≠ 200) rather than on the leak assertion — pre-fix the leak assertion is unreachable, which is why S2 rather than the RED run is what proves SC-4c sensitive. Every other cell was green.

## Task 2 — GREEN

```
 Test Files  1 passed (1)
      Tests  13 passed (13)
```

Source acceptance criteria, recomputed with `node -e` (never `wc -l`, per the measured `rtk` count hazard):

```
verifyStageOwnership(id, ctx.userId): 3      ← one each in GET, PUT, DELETE
db.query.stages.findFirst CALLS:     1      ← inside verifyStageOwnership only
                          TYPE refs: 1      ← the StageWith type alias at :26
withOptions occurrences:             0      ← no conditional `with` construction remains
helper byte-identical:               true   (505 bytes vs 505 bytes)
```

- `./node_modules/.bin/tsc --noEmit` → exit 0, no output.
- `npm run lint` → `✖ 122 problems (0 errors, 122 warnings)`. **0 errors**, which is the gate; the warning total is the known worktree baseline and is never gated on.
- `eslint` restricted to the two touched files → 1 warning, `'and' is defined but never used` at `route.ts:10:14`, and it is **pre-existing**: `and(` appears 0 times in the committed HEAD version too. Not introduced here; out of scope per the scope boundary.

## Task 3 — Ablation S1: reinstate the caller-controlled `with`

The `verifyStageOwnership` call in the GET was replaced by the deleted `withOptions` + `findFirst` + copied predicate.

```
 ✓ db mock self-test — findFirst honours `with` > omits the pipeline relation entirely when `with` is undefined 20ms
 ✓ db mock self-test — findFirst honours `with` > omits the pipeline relation when `with` is present but does not request it 1ms
 ✓ db mock self-test — findFirst honours `with` > returns a populated pipeline relation when `with: { pipeline: true }` is passed 2ms
 ✓ db mock self-test — findFirst honours `with` > returns undefined when the row does not exist, regardless of `with` 4ms
 × SC-4a — owner, NO ?expand → 200 [THE DEFECT PROOF, red before the fix] > returns 200 to the stage's legitimate owner without ?expand=pipeline 83ms
   → expected 403 to be 200 // Object.is equality
 × SC-4a — owner, NO ?expand → 200 [THE DEFECT PROOF, red before the fix] > reads ownership through an UNCONDITIONAL relation load: a bare GET's findFirst carries with.pipeline === true 21ms
   → expected undefined to be true // Object.is equality
 × SC-4c — owner, NO ?expand → body has no `pipeline` key [guards the fix's own leak] > does not project the pipeline object when the caller did not ask to expand it 13ms
   → expected 403 to be 200 // Object.is equality
 ✓ SC-4a' — owner, ?expand=pipeline → 200 + expanded pipeline [REGRESSION GUARD, green before AND after] > returns 200 and the expanded pipeline to the owner 7ms
 ✓ SC-4b — non-owner, NO ?expand → 403 [REGRESSION GUARD — 403 today for the WRONG reason, NOT evidence] > returns 403 to a caller who does not own the stage's pipeline 5ms
 ✓ SC-4b — non-owner, NO ?expand → 403 [REGRESSION GUARD — 403 today for the WRONG reason, NOT evidence] > 403s because the row EXISTS and is foreign, not because the row is absent 5ms
 ✓ SC-4b' — non-owner, ?expand=pipeline → 403 [REGRESSION GUARD, green before AND after] > returns 403 to a non-owner even when the relation is explicitly requested 7ms
 ✓ lookup — a missing stage is still 404, decided before the ownership verdict > returns 404 with an ENTITY_NOT_FOUND problem type when the stage does not exist 4ms
 ✓ lookup — a missing stage is still 404, decided before the ownership verdict > returns 404 rather than 403 even when ?expand=pipeline is requested 3ms
```

**The load-bearing observation, in one run:** `owner + no expand → 200` went RED while **both non-owner cells stayed GREEN**. That is the measured proof that the two non-owner cells could not have detected SEC-02, and it is why the `non-owner + no expand → 403` cell is reported here as a regression guard and never as evidence that SEC-02 was fixed.

Restored with `git checkout -- "src/app/api/v1/stages/[id]/route.ts"`; `git diff --exit-code` → 0.

## Task 3 — Ablation S2: remove the projection leak guard

`if (expand.has("pipeline") && stage.pipeline)` → `if (stage.pipeline)`.

```
 ✓ db mock self-test — findFirst honours `with` > omits the pipeline relation entirely when `with` is undefined 8ms
 ✓ db mock self-test — findFirst honours `with` > omits the pipeline relation when `with` is present but does not request it 1ms
 ✓ db mock self-test — findFirst honours `with` > returns a populated pipeline relation when `with: { pipeline: true }` is passed 7ms
 ✓ db mock self-test — findFirst honours `with` > returns undefined when the row does not exist, regardless of `with` 1ms
 ✓ SC-4a — owner, NO ?expand → 200 [THE DEFECT PROOF, red before the fix] > returns 200 to the stage's legitimate owner without ?expand=pipeline 15ms
 ✓ SC-4a — owner, NO ?expand → 200 [THE DEFECT PROOF, red before the fix] > reads ownership through an UNCONDITIONAL relation load: a bare GET's findFirst carries with.pipeline === true 6ms
 × SC-4c — owner, NO ?expand → body has no `pipeline` key [guards the fix's own leak] > does not project the pipeline object when the caller did not ask to expand it 23ms
   → expected [ 'id', 'pipeline_id', 'name', …(7) ] to not include 'pipeline'
 ✓ SC-4a' — owner, ?expand=pipeline → 200 + expanded pipeline [REGRESSION GUARD, green before AND after] > returns 200 and the expanded pipeline to the owner 2ms
 ✓ SC-4b — non-owner, NO ?expand → 403 [REGRESSION GUARD — 403 today for the WRONG reason, NOT evidence] > returns 403 to a caller who does not own the stage's pipeline 3ms
 ✓ SC-4b — non-owner, NO ?expand → 403 [REGRESSION GUARD — 403 today for the WRONG reason, NOT evidence] > 403s because the row EXISTS and is foreign, not because the row is absent 2ms
 ✓ SC-4b' — non-owner, ?expand=pipeline → 403 [REGRESSION GUARD, green before AND after] > returns 403 to a non-owner even when the relation is explicitly requested 2ms
 ✓ lookup — a missing stage is still 404, decided before the ownership verdict > returns 404 with an ENTITY_NOT_FOUND problem type when the stage does not exist 2ms
 ✓ lookup — a missing stage is still 404, decided before the ownership verdict > returns 404 rather than 403 even when ?expand=pipeline is requested 2ms

 Test Files  1 failed (1)
      Tests  1 failed | 12 passed (13)
```

**SC-4c went red alone; every other cell stayed green.** The fix's own regression risk — a bare GET leaking the pipeline object now that the relation is always loaded — is genuinely covered, and the assertion that covers it is genuinely able to fail.

Restored; `git diff --exit-code` → 0; the file passes 13/13.

## Verification

| Gate | Result |
|------|--------|
| `./node_modules/.bin/vitest run "src/app/api/v1/stages/[id]/__tests__/route.test.ts"` | **13 passed (13)** |
| `./node_modules/.bin/vitest run` (base project) | **173 files passed / 2 skipped; 5250 passed / 32 skipped** |
| `./node_modules/.bin/vitest run --config vitest.rsc.config.ts` | **2 files, 8 passed (RSC 8/8)** |
| `./node_modules/.bin/tsc --noEmit` | **exit 0, no output** |
| `npm run lint` | **0 errors** (122 warnings, worktree baseline; 0 new in the touched files) |
| `git diff --exit-code` after both ablations | **exit 0** |

**Base suite delta against the stated baseline (172 files / 5237 passed / 32 skipped):** +1 file, +13 tests, +0 failures — exactly the contribution of the new test file. No pre-existing test changed state.

## Decisions Made

- **The helper was not touched.** 48-PATTERNS had already verified that the GET's `:74` predicate is byte-for-byte the helper's `:46`; the fix is therefore the GET calling the helper, not the helper being adapted to the GET. Verified programmatically rather than by eye: the helper's source between its opening line and closing brace is byte-identical to the committed version (505 bytes both sides).
- **The `and` import stays unused.** It was already unused before this plan (`and(` appears 0 times at HEAD). Removing it is out of scope per the scope boundary — pre-existing warnings in a file are not this task's changes.
- **`StageWith` and `StageExpanded` were left in place.** Both are still used by the helper; lint reports no error for them.
- **SC-4c's pre-fix status is honestly reported.** It failed in the RED run on its 200 precondition, not on the leak assertion, because pre-fix the owner never reaches a 200 body. Ablation S2 — not the RED run — is what establishes the assertion can fail for the right reason.

## Deviations from Plan

None — plan executed exactly as written. No deviation rule was triggered; no auto-fixes were required.

## Issues Encountered

- **Stale worktree base (the systematic one).** The worktree branched from `a58b9e1`, not the expected `ae514ed`. Resolved with `git merge --ff-only ae514ed…` per the standing instruction; `git reset --hard` was not used.
- **`vi.mock` factory hoisting vs. the mutable fixture.** The mock's implementation needs a per-test fixture, which a hoisted factory cannot see through a plain `let`. Resolved with `vi.hoisted()` for both the state object and the implementation factory, and the implementation is re-installed in `beforeEach` so that no reset semantics can silently turn the mock `with`-blind — the single failure that would make every assertion in the file vacuous.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern, or schema change was introduced; the change removes a caller-controlled input from an authorization predicate and adds no new surface. The threat register's `accept` entry (T-48-03-06: a 403 confirms the stage exists) is unchanged and remains deferred per 48-CONTEXT.

## Known Stubs

None.

## Next Phase Readiness

- SEC-02 is closed for `GET /api/v1/stages/:id`. GET, PUT and DELETE now reach exactly one authorization predicate through exactly one helper call each — the shape 48-05's route-level authorization regression gate will need to recognise.
- `src/app/api/v1/stages/route.ts` (the list endpoint, QG-03 and the paginate-before-authorize bug) is untouched here and remains 48-04's.
- The `with`-aware db mock in this file is the reusable answer to "how do you make a mocked relational read able to expose a missing relation" — worth copying rather than re-deriving for any other route whose predicate reads a relation.

## Self-Check: PASSED

- `src/app/api/v1/stages/[id]/__tests__/route.test.ts` — FOUND on disk
- `.planning/phases/48-rest-api-authorization/48-03-SUMMARY.md` — FOUND on disk
- commit `00882f0` (Task 1, test) — FOUND in `git log --all`
- commit `a72caf4` (Task 2, fix) — FOUND in `git log --all`
- Task 3 produced no commit by construction (both ablations reverted); `git diff --exit-code` → 0

---
*Phase: 48-rest-api-authorization*
*Completed: 2026-08-25*
