# Phase 38 — Deferred Items

Out-of-scope discoveries logged during execution. Nothing here was fixed; each entry names the
plan that found it and why it is not that plan's work.

## From plan 38-03

### ~~`condition-evaluator.test.ts` T-34-20 linearity assertion is flaky under full-suite load~~ — **RESOLVED**

> **Fixed by the orchestrator in `0c0fc0e`, after plans 38-01, 38-02 and 38-03 each hit it
> independently in one wave** (Phase 37 had already recorded it as a live CI-flake risk on master).
> The diagnosis below is correct but understates the cause: the problem was not merely "tolerance too
> tight", it was that a 4x input span gives linear a 4x prediction and quadratic a 16x prediction, so
> a 10x ceiling sat only 2.5x above linear — and measured jitter reached 15.6x, i.e. ABOVE quadratic's
> own prediction. The test could not distinguish the defect it existed to catch from the load it ran
> under, at any tolerance.
>
> The fix widens the input span to 16x (8000 → 128000), which pushes the predictions to 16x linear
> and 256x quadratic, and makes both windows large enough that real work dominates the ~0.9ms of
> fixed overhead that made the old 4000-element measurement mostly constant. Ceiling set to 80x.
>
> Measured on this machine: **13.8x idle, 21.0x under concurrent full-suite load, 186.2x for a
> deliberately quadratic scanner.** Verified 3/3 in isolation and 2/2 under load. The suggested
> step-count rewrite below was considered and rejected as unnecessary — it would require
> instrumenting `resolveFieldPath` itself, and the widened span already yields clean separation.

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
