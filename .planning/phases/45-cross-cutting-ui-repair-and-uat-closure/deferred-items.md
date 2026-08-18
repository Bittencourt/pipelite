# Phase 45 — Deferred Items

Out-of-scope discoveries logged during execution. Not fixed here.

## D-45-01 — `src/lib/execution/toggle.test.ts` intermittently times out its `beforeEach` hook under parallel workers

**Found:** 2026-08-18, during 45-06's `npm run test` gate.

**Symptom:**

```
FAIL src/lib/execution/toggle.test.ts > toggleWorkflow > returns error when not authenticated
Error: Hook timed out in 10000ms.
  ❯ src/lib/execution/toggle.test.ts:61:3   (beforeEach)
```

**Measured:** in isolation the whole file passes in 6.57 s, with that single test taking **3.75 s**
of vitest's 10 s default `hookTimeout`. Under the full suite's parallel workers it crossed the
threshold in 2 of 5 consecutive `npm run test` runs on this machine; the other 3 runs were clean
(2178 passed / 21 skipped, exit 0). Nothing in 45-06 touches `src/lib/execution/` — the failure is
a wall-clock margin, not a behaviour change.

**Why deferred:** out of 45-06's scope boundary (a Phase 25/26 file), and it is the same class of
defect STATE.md already records for `src/lib/execution/condition-evaluator.test.ts` T-34-20 — a
wall-clock assertion that fails under vitest's own workers and passes in isolation. Both are live
CI-flake risks on master and both want the same fix: raise the budget or remove the dependence on
wall-clock, in the phase that owns the file. Do not chase either one per-phase.

**Suggested owner:** whichever phase next touches `src/lib/execution/`. Fix the two together.
