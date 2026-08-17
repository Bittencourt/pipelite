# Phase 38 — Deferred Items

Out-of-scope discoveries logged during execution. Nothing here was fixed; each entry names the
plan that found it and why it is not that plan's work.

## From plan 38-03

### `condition-evaluator.test.ts` T-34-20 linearity assertion is flaky under full-suite load

- **File:** `src/lib/execution/condition-evaluator.test.ts:616`
- **Test:** `resolveFieldPath — parsing is linear, not backtracking (T-34-20) > scales linearly, not quadratically, with path length`
- **Symptom:** `expected 13.34 to be less than 10` — the assertion is a wall-clock ratio
  (`large / small`) with a 10x tolerance.
- **Reproduction:** fails under `npm test` (84 files in parallel), passes on
  `vitest run src/lib/execution/condition-evaluator.test.ts` in isolation, twice each way.
- **Why out of scope for 38-03:** plan 38-03 touches only `src/lib/mutations/deals.ts` and
  `src/lib/mutations/activities.ts` (both additive, 0 deleted lines) and their two suites.
  Neither file is in this test's import graph, and the assertion measures parser timing, not
  mutation behaviour. This is pre-existing timing jitter, not a regression this plan introduced.
- **Suggested fix, if it is ever picked up:** replace the wall-clock ratio with a step-count or
  operation-count assertion, which is what the test actually means to pin. A timing ratio under
  parallel test-runner load will keep going red at random.
