# Deferred Items — Phase 36

Out-of-scope discoveries logged during execution. Not fixed by the plan that found them.

## `condition-evaluator.test.ts` perf-ratio assertion is machine-speed-dependent

- **Found during:** 36-11 Task 3 (`npm test` verification)
- **Test:** `resolveFieldPath — parsing is linear, not backtracking (T-34-20) > scales linearly, not quadratically, with path length` (`src/lib/execution/condition-evaluator.test.ts:616`)
- **Symptom:** `expected 33.2 to be less than 10` — the assertion compares wall-clock time for a
  long path against a short one and requires a ratio under 10×.
- **Pre-existing and unrelated:** 36-11 touches only `src/lib/events/subscribers/audit.{ts,test.ts}`
  and `instrumentation.ts`. Neither `condition-evaluator.ts` nor its test was modified. The failure
  reproduces in isolation (`npx vitest run src/lib/execution/condition-evaluator.test.ts`), so it is
  not contention from the parallel run either.
- **Why deferred:** a timing ratio on a 2-microsecond baseline is dominated by JIT warm-up and
  scheduler noise on this machine; the parser is still linear. Fixing it means either raising the
  tolerance or replacing wall-clock with an operation counter — a Phase 34 test-design decision, not
  a Phase 36 one.
- **Suggested fix:** count parser steps instead of measuring elapsed time, or assert the ratio
  against a warmed baseline with a much larger `small` workload.
