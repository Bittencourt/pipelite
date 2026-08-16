# Phase 36 — Deferred Items

Out-of-scope discoveries logged during execution. Not fixed by the plan that found them.

## From 36-05

### `condition-evaluator.test.ts` — flaky linear-vs-quadratic timing assertion

- **File:** `src/lib/execution/condition-evaluator.test.ts:616`
- **Test:** `resolveFieldPath — parsing is linear, not backtracking (T-34-20) > scales linearly, not quadratically, with path length`
- **Symptom:** `AssertionError: expected 11.569746767963789 to be less than 10`
- **When:** Once, during a full `npx vitest run src/lib/execution` pass while other worker
  processes were competing for CPU. Passed on every subsequent run, in isolation (3/3) and in
  the full 1169-test suite.
- **Why deferred:** Pre-existing, untouched by 36-05, and unrelated to the actor context. The
  assertion compares a wall-clock ratio against a fixed threshold of 10, so it is sensitive to
  scheduler noise under parallel load rather than to any behaviour change.
- **Suggested fix (not applied):** raise the threshold, or take the best of N samples, so the
  test measures the asymptotic property it names rather than the machine's current load.
