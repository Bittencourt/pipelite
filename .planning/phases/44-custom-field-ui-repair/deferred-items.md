# Phase 44 — Deferred Items

Out-of-scope discoveries logged during execution. Not fixed; recorded so they are not lost.

---

## D1 — `condition-evaluator.test.ts` ReDoS scaling assertion is flaky

**Found during:** 44-01 Task 2 verification (full-suite run)
**File:** `src/lib/execution/condition-evaluator.test.ts`
**Test:** `resolveFieldPath — parsing is linear, not backtracking (T-34-20) > scales linearly, not quadratically, with path length`
**Origin:** Phase 34, commit `912043a` (`test(34-12): assert ReDoS guard by scaling ratio, not wall-clock`)

Measured 2026-08-15: run in isolation on the unchanged file, **2 of 3 runs passed, 1 failed**. It also
failed once inside a full-suite run and passed on the next. The assertion compares a wall-clock
*ratio* between two path lengths, so it is sensitive to machine load — and this machine was running
several phase-44 executors concurrently.

**Not caused by 44-01.** This plan touched only `vitest.config.ts` (added one `exclude` glob),
`package.json` (the `test` script), two new test files and one `.d.ts`. None of those can change the
timing behaviour of a pure-function benchmark.

**Suggested follow-up (separate phase):** replace the wall-clock ratio with a deterministic proxy —
e.g. a step counter inside the parser, or an operation-count budget — so the ReDoS guard is asserted
without a timing dependency. `T-34-20` is a real invariant worth guarding; only the measurement is
unreliable.
