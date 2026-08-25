# Phase 36 — Deferred Items

Out-of-scope discoveries logged during execution. Not fixed by the plan that found them.

## `condition-evaluator.test.ts` — wall-clock linear-vs-quadratic assertion is machine-speed-dependent

**Found independently by 36-05, 36-11, and 36-15.** Logged once here; the three SUMMARYs each
record their own sighting.

- **File:** `src/lib/execution/condition-evaluator.test.ts:616`
- **Test:** `resolveFieldPath — parsing is linear, not backtracking (T-34-20) > scales linearly, not quadratically, with path length`
- **Symptom:** `expected <ratio> to be less than 10` — observed at 11.57 (36-05), 33.2 (36-11),
  and once more during a 69-file parallel run (36-15). The assertion compares wall-clock time for
  a long path against a short one and requires a ratio under 10×.
- **Reproduction is inconsistent:** 36-05 and 36-15 saw it only under full-suite parallel load and
  could not reproduce it in isolation (3/3 and 2/2 green respectively); 36-11 reported reproducing
  it in isolation. Either way it is a timing threshold, not a behaviour change.
- **Pre-existing and unrelated to Phase 36:** none of the three plans touch
  `condition-evaluator.ts` or its test. The parser is still linear — a 2-microsecond baseline is
  dominated by JIT warm-up and scheduler noise.
- **Why deferred:** this is a Phase 34 test-design decision, not a Phase 36 one.
- **Suggested fix (not applied):** count parser steps instead of measuring elapsed time; or assert
  against a warmed baseline with a much larger `small` workload; or take the best of N samples.

## `actor-context.test.ts` — concurrency case fails intermittently under full-suite load

- **Found during:** 36-08 verification
- **Test:** `src/lib/audit/actor-context.test.ts > concurrency > keeps two concurrent scopes from observing each other's actor`
- **Symptom:** fails 1 in ~1185 under full-suite load; passes 6/6 in isolation.
- **Owner:** belongs to 36-01, untouched by the plan that found it.
- **Why deferred:** same class as the above — load-sensitive rather than a correctness signal.
