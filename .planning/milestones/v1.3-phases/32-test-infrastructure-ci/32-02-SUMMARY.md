---
phase: 32-test-infrastructure-ci
plan: 02
subsystem: testing
tags: [vitest, quickjs, formula-engine, drizzle, mocking, cascade-delete, eslint]

# Dependency graph
requires:
  - phase: 32-01
    provides: "`npm test` script and the vitest `exclude` config that keeps `.next/**` out of collection, so the suite is 41 files rather than 42"
  - phase: 32-03
    provides: "Non-JSX lint cleanup already merged into the base; this plan cleared the single remaining eslint error, which lived in formula-engine.ts"
provides:
  - "Green test suite: `npm test` exits 0 with 41 files, 455 passed, 4 skipped"
  - "Working null-safe carve-out in evaluateFormula — LOGIC.*/TEXT.* expressions now reach the QuickJS sandbox with null arguments instead of short-circuiting"
  - "Repaired deleteWorkflow test that stubs the db.select() cascade lookup"
  - "New regression test covering the workflow cascade-delete branch (steps -> runs -> workflow)"
  - "Zero eslint errors repo-wide (0 errors, 130 warnings) — this plan removed the last one"
affects: [ci-workflow, merge-gate, formula-engine, workflow-deletion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Null-safety flags in evaluateFormula are computed before the dependency loop that can return early"
    - "Drizzle query-builder chains are stubbed per-test, never in beforeEach, because vi.clearAllMocks() does not reset mockReturnValue implementations"

key-files:
  created: []
  modified:
    - src/lib/formula-engine.ts
    - src/lib/mutations/workflows.test.ts

key-decisions:
  - "Fixed the source for LOGIC.isBlank (D-04): usesNullSafeFunction was hoisted above the dependency loop and now gates the three null early-returns"
  - "Left the three error early-returns (Unknown entity / Field not found / Unknown field) ungated so missing-field errors still fire regardless of null-safety (T-32-05)"
  - "Deleted containsArithmeticOperation after removing its only caller, because eslint flagged it as unused — the plan permitted removal if eslint demanded it"
  - "Fixed the test for deleteWorkflow (D-05); src/lib/mutations/workflows.ts was not touched, its cascade is correct behaviour (T-32-07)"
  - "Final suite count is 455 passed / 459 total, not the 454 / 458 the plan predicted — the extra test is the D-06 cascade test the plan itself required"

patterns-established:
  - "Null-safe carve-out: any guard that suppresses an early return must be computed above the loop that returns"
  - "Cascade-delete coverage: assert the exact number of db.delete calls rather than only the success flag, so a silently dropped cascade step fails the test"

requirements-completed: [CI-03]

# Metrics
duration: 9min
completed: 2026-08-14
---

# Phase 32 Plan 02: Make the Test Suite Green Summary

**Fixed the dead `usesNullSafe` wiring in `evaluateFormula` so `LOGIC.isBlank(null)` returns `true`, repaired the stale `deleteWorkflow` mock that never stubbed the `db.select()` cascade lookup, and added a cascade-branch test — taking the suite from 2 failures to 41 files / 455 passed / 0 failed.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-08-14T13:16:30Z
- **Completed:** 2026-08-14T13:25:14Z
- **Tasks:** 3 (2 code tasks + 1 verification gate)
- **Files modified:** 2

## Accomplishments

- **Both known failures fixed at the layer that was actually wrong**, per D-04 and D-05 — one source bug, one stale test. No test was weakened, skipped, or deleted to reach green.
- **`npm test` now exits 0**: `Test Files 41 passed (41)`, `Tests 455 passed | 4 skipped (459)`.
- **Closed the cascade-delete coverage gap** SC-3 names explicitly (D-06): a new test drives two run rows through `runs.length > 0` and asserts exactly 3 `db.delete` calls.
- **Cleared the last eslint error in the repository.** `npm run lint` now exits 0 with 0 errors / 130 warnings. `formula-engine.ts` ended with zero messages at all — no errors *and* no warnings, since removing the dead helper also cleared the two pre-existing `no-unused-vars` warnings.
- **`npm run typecheck` exits 0.**

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire the null-safe carve-out in formula-engine (D-04)** — `a1db53a` (fix)
2. **Task 2: Repair the stale deleteWorkflow mock and cover the cascade branch (D-05, D-06)** — `140b734` (test)
3. **Task 3: Prove the whole suite is green end to end** — verification gate, no files modified, no commit

## Files Created/Modified

- `src/lib/formula-engine.ts` — Hoisted `const usesNullSafe = usesNullSafeFunction(expression)` above `extractDependencies`, gated the three null early-returns on `&& !usesNullSafe`, deleted the dead `hasArithmetic` assignment and the orphaned `containsArithmeticOperation` helper, and changed `let processedExpr` to `const`. Net **+9 / −19 lines**.
- `src/lib/mutations/workflows.test.ts` — Added a `mockDb.select` stub to `deletes existing workflow` (resolving `[]`, keeping it on the no-runs path) and added `cascades to run steps and runs before deleting the workflow`. Net **+28 lines**. 22 tests → 23.

## Decisions Made

**Source vs. test, per the locked decisions.** D-04 and D-05 pointed opposite directions and both were honoured: `formula-engine.ts` was the bug, `workflows.test.ts` was the staleness. `src/lib/formula-engine.test.ts` and `src/lib/mutations/workflows.ts` are both byte-identical to the base commit — `git diff --name-only 4548dd0 HEAD` lists exactly the two files in the plan's `files_modified`.

**Error returns deliberately left ungated (T-32-05).** Only the three `return { value: null, error: null }` sites got `&& !usesNullSafe`. The `Unknown entity`, `Field "..." not found`, and `Unknown field` returns are untouched, so a formula referencing a non-existent field still errors instead of silently reaching the sandbox. `handles missing field as null` and the unknown-entity tests confirm this — they still pass.

**Deleted `containsArithmeticOperation`.** Removing the dead `hasArithmetic` assignment left the helper with zero callers, and eslint immediately flagged it (`'containsArithmeticOperation' is defined but never used`). The plan said to keep the helper "unless eslint demands it" — eslint demanded it, so it went. This was a pure dead-code removal: the function was not exported and had exactly one caller, the line I had just deleted.

**Per-test `select` stubbing.** Both new stubs sit inside their `it()` bodies. The file's only `beforeEach` (line 42) calls `vi.clearAllMocks()`, which clears call history but *not* `mockReturnValue` implementations, so a hoisted stub would leak forward into `getWorkflow`/`listWorkflows` and create order-dependent failures. A comment in the file records this so the next editor does not "simplify" it into the `beforeEach`.

## Deviations from Plan

No deviation rules fired — no bugs, missing functionality, or blockers were encountered beyond the two the plan already diagnosed. Three acceptance criteria had arithmetic that did not match reality, however, and are recorded here for the verifier.

### Acceptance-criteria corrections (no code impact)

**1. Final test count is 455 / 459, not 454 / 458**
- **Found during:** Task 3
- **Detail:** The plan's `must_haves` and Task 3 both predicted `454 passed | 4 skipped (458)`. The researcher measured that figure with only the two *failure fixes* applied; it does not include the new D-06 cascade test the same plan mandates. Baseline was `2 failed | 452 passed | 4 skipped (458)` → fixing 2 gives 454/458 → adding 1 test gives **455/459**.
- **Resolution:** Recorded the actual numbers, as Task 3 explicitly instructs ("record the actual numbers in the SUMMARY rather than forcing them to match"). No test was added or removed to chase the predicted figure.

**2. `mockDb.select.mockReturnValue` appears 4 times, not 2**
- **Found during:** Task 2
- **Detail:** The criterion expected 2. Two of the four are **pre-existing** stubs in the `listWorkflows` describe block (lines 520 and 537), which the planner did not see — the plan's `read_first` only covered lines 1–30 and 440–465. I added exactly the 2 the plan called for.
- **Resolution:** The criterion's *intent* — "stubbed per-test, not hoisted" — is fully satisfied and was verified directly: the file has exactly one `beforeEach` (line 42, containing only `vi.clearAllMocks()`), and all four stubs are inside `it()` bodies.

**3. `npm test` output contains 8 lines matching `node_modules/`, not 0**
- **Found during:** Task 3
- **Detail:** The criterion's intent is "vitest collected nothing from `node_modules/`". That holds: all 41 collected files are under `src/` (verified programmatically — 41 test-file lines, 0 outside `src/`). The 8 matches are vitest-runner frames inside a **stack trace deliberately logged by a passing test** — `matcher.test.ts > does not throw when createWorkflowRun fails for one workflow` logs an `Error: DB error` to stderr on purpose. Likewise the word `failed` appears 4 times, all from execution-engine tests exercising failure paths and logging `[execution-engine] Run ... failed:`.
- **Resolution:** No action. A `grep` over combined stdout+stderr cannot distinguish collected files from logged stack traces; the stronger check (every collected file is under `src/`) was used instead.

---

**Total deviations:** 0 auto-fixed. 3 acceptance-criteria arithmetic corrections, all documented above, none requiring a code change.
**Impact on plan:** None. Every behavioural `must_have` was met. No scope creep — the diff touches only the two files listed in `files_modified`.

## Issues Encountered

- **No `node_modules` in the worktree**, as the environment notes warned. Resolved with `ln -sfn /home/pedro/programming/pipelite/node_modules ./node_modules`. Nothing was installed; `node_modules` is gitignored (`.gitignore:4`) and stayed out of both commits.
- **Worktree base was behind.** `git merge-base HEAD 4548dd0` returned HEAD itself, meaning the worktree branch predated the wave-1 merge. Corrected with the sanctioned `git reset --hard 4548dd0` from the startup branch check, which is what made the already-merged 32-01 vitest scoping and 32-03 lint work visible.
- **`rtk` hook corrupts `wc -l` / `grep -c`.** All counts in this summary were taken via `node -e` reading a redirected output file, per the environment notes. Compound shell commands with variable assignment plus redirection were also rejected by the worktree isolation guard, so every verification ran as a single plain command.
- **The repo-wide eslint error count was already 0 after my fix, not 13.** The environment notes said "14 remaining, of which 1 is yours… the other 13 were cleared by plans 32-03/32-04". The 14 figure predated the wave-1 merge; with 32-03/32-04 in the base, mine was the only one left. Clearing it took the repo to 0 errors, which means the D-03 hard lint gate is now satisfiable.

## User Setup Required

None — no external service configuration required. This plan installed zero packages and touches no credentials or database.

## Next Phase Readiness

- **Both CI gates this phase needs are now green simultaneously:** `npm test` exits 0, `npm run typecheck` exits 0, and `npm run lint` exits 0. Plans 32-05/32-06 (CI workflow + merge gate) can wire a hard-failing `ci` check without a warn-only ratchet, exactly as D-03 requires.
- **Watch item for the CI workflow:** the suite passes with `DATABASE_URL` unset, so no Postgres service container is needed (T-32-09). Confirmed here indirectly — the run used no database.
- **Residual lint debt:** 130 warnings remain repo-wide, 0 errors. If a future phase tightens the gate to `--max-warnings 0`, that is a separate, larger effort.

## Self-Check: PASSED

| Claim | Verification | Result |
|-------|-------------|--------|
| `src/lib/formula-engine.ts` modified | `test -f` + `git diff --name-only 4548dd0 HEAD` | FOUND |
| `src/lib/mutations/workflows.test.ts` modified | `test -f` + `git diff --name-only 4548dd0 HEAD` | FOUND |
| `32-02-SUMMARY.md` created **and tracked** | `git ls-tree -r HEAD --name-only` | FOUND in HEAD |
| Commit `a1db53a` (Task 1) | `git cat-file -t a1db53a` | `commit` |
| Commit `140b734` (Task 2) | `git cat-file -t 140b734` | `commit` |
| Commit `aeb0218` (summary) | `git cat-file -t aeb0218` | `commit` |
| `usesNullSafe` gates exactly 3 early-returns | `node -e` count of `&& !usesNullSafe` | 3 |
| `hasArithmetic` gone | `node -e` count | 0 |
| `toHaveBeenCalledTimes(3)` present once | `node -e` count | 1 |
| No new `.skip` / `.todo` / `.only` | `node -e` over `git diff -U0 4548dd0 HEAD` added lines | 0 of 39 added lines |
| STATE.md / ROADMAP.md untouched | `git diff --name-only 4548dd0 HEAD` | neither listed |
| `npm test` | re-run after all commits | exit 0, 41 files, 455 passed, 4 skipped |
| `npm run typecheck` | direct run | exit 0 |
| `npm run lint` | direct run | exit 0, 0 errors, 130 warnings |

---
*Phase: 32-test-infrastructure-ci*
*Completed: 2026-08-14*
