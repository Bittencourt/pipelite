---
phase: 47-suite-trust-supply-chain
plan: 03
subsystem: test-infrastructure
tags: [quality-gates, ast-gate, vitest, hook-hygiene, anti-vacuity, QG-01]
requires:
  - "vitest base project (vitest.config.ts)"
  - "typescript as a direct devDependency (already present, nothing installed)"
provides:
  - "src/lib/__tests__/suite-hook-hygiene.test.ts — suite-wide TypeScript-AST gate forbidding dynamic import() inside any lifecycle hook"
  - "exported scanSource(fileName, sourceText) — the shared matcher the fixtures and the sweep both use"
  - "toggle.test.ts and recursion.test.ts on module-scope static imports"
affects:
  - "src/lib/execution/toggle.test.ts"
  - "src/lib/execution/recursion.test.ts"
  - "any future test file adding a hook-scoped dynamic import — now a suite failure"
tech-stack:
  added: []
  patterns:
    - "TypeScript compiler API (ts.createSourceFile / ts.forEachChild) as a test gate — first use in this repo"
    - "fixtures held as source STRINGS parsed through the sweep's own matcher, as a self-collision mitigation"
    - "exclusion list as a live control (deployment-docs-accuracy.test.ts:537-556 / :692-700 / :593-600)"
key-files:
  created:
    - "src/lib/__tests__/suite-hook-hygiene.test.ts"
  modified:
    - "src/lib/execution/toggle.test.ts"
    - "src/lib/execution/recursion.test.ts"
decisions:
  - "The single self-collision mitigation is FIXTURES-AS-SOURCE-STRINGS with NO path exclusion, plus a live control asserting the gate file IS enumerated and yields zero hits"
  - "The hook-import scope boundary is lexical: an import() inside a module-scope helper a hook merely calls is NOT a hit, stated in the header and held as a KNOWN_NEGATIVE"
  - "recursion.test.ts's vi.hoisted and vi.mock moved to module scope (Rule 2) — vitest 4.1 warns the nested form will become an error, and the new static import depends on that hoisting"
metrics:
  duration: "~24 min"
  completed: "2026-08-25"
  tasks: 3
  commits: 2
  tests_added: 39
---

# Phase 47 Plan 03: Suite Hook Hygiene Summary

A TypeScript-AST gate makes "a dynamic `import()` inside a lifecycle hook" a suite-wide failure, and the two instances that were actually dangerous are gone: `toggle.test.ts`'s first test went **1365.99 ms → 3.87 ms** and `recursion.test.ts`'s depth-enforcement first test **1100.02 ms → 2.82 ms**, both by moving the import to module scope where `vi.mock` hoisting already made it safe.

## What Was Built

| # | Task | Commit |
|---|------|--------|
| 1 | RED — the hook-hygiene AST gate, red on exactly two files | `02ee9fd` |
| 2 | GREEN — both hook imports hoisted to module scope | `7b2688d` |
| 3 | Negative control C-1 + the carve-out complement (no commit by design — the tree must end unmodified) | — |

`src/lib/__tests__/suite-hook-hygiene.test.ts` (723 lines, 39 tests) parses every `*.test.ts` / `*.test.tsx` under `src/` with `ts.createSourceFile` and reports every dynamic `import()` lexically inside `beforeEach` / `beforeAll` / `afterEach` / `afterAll`.

**This is one of the first two TypeScript-AST gates in this repository.** `from "typescript"` returned nothing outside `node_modules` before it. Everything *around* the parse — the file walk, the named floors, the matcher self-test, the `file:line` collector, the array-form assertion with a fix-naming failure message — is copied from `node-engines-floor.test.ts`, `no-standing-suppressions.test.ts` and `deployment-docs-accuracy.test.ts:239-261`. The visitor itself is 47-RESEARCH § Code Examples. Nothing was installed; `typescript` was already a direct devDependency.

### Anti-vacuity, all five forms

| Form | Instance in this gate |
|---|---|
| (a) Named floors, measurement in the doc-comment, set below it | `MIN_TEST_FILES = 150` (measured **176**), `MIN_HOOKS_PARSED = 140` (measured **151**) |
| (b) Matcher self-tests before the sweep | 6 KNOWN_POSITIVE + 6 KNOWN_NEGATIVE, `it.each`, asserting the **extracted value** (`hook:line`), not a boolean |
| (c) Known-present positive anchor | the carve-out live controls (below) — the sweep must still find hook imports somewhere |
| (d) **Floor the token, not just the count (WR-11)** | each of the four carved-out files must STILL yield a hook-scoped `import()` **and** must still have `vi.resetModules()` in that same hook; both `*-live` files must still yield a hit and still be `describe.skipIf(`-gated |
| (e) **Self-collision** | see below — one mitigation, stated as a decision |
| (f) Exclusion list as a live control | both lists asserted to still exhibit the excluded property, asserted disjoint, and asserted to name only files the walk actually visits |

Independently re-measured with a throwaway `node -e` walk over the same corpus: **176 files, 151 lifecycle hooks, 13 hook-scoped `import()` calls** — matching 47-RESEARCH's 175 (+1 for the new gate file) / 151 / 13 exactly.

### The self-collision mitigation, by name

**FIXTURES AS SOURCE STRINGS, PARSED THROUGH THE SWEEP'S OWN `scanSource`, WITH NO PATH EXCLUSION.**

Every fixture is an array of line strings joined at run time, so no contiguous run of forbidden source text exists anywhere in the file. A string literal is not a `CallExpression`, so the sweep is structurally incapable of seeing a fixture — and the fixtures still travel through the real matcher rather than a divergent second one.

47-PATTERNS warns explicitly against taking both mitigations, so the path exclusion was **not** added. Four assertions make that verifiable rather than assumed:

- `is enumerated by its own walk` — the gate file is in `TEST_FILES`.
- `is NOT path-excluded from its own sweep` — `expect(EXCLUDED_PATHS).not.toContain(GATE_PATH)`. If someone adds it, this goes red.
- `parses to zero lifecycle hooks, which proves every fixture is a string` — positive proof. This file shows a dozen hook bodies; if any were live code, `hooksSeen` would not be 0.
- `still physically contains the fixture source the parse cannot see` — the WR-11 token floor for this control. "Zero hits in the gate file" is also what an empty file, a wrong `GATE_PATH` or a truncated read produces; this asserts the needle is really present and the parse is really blind to it.

## Verbatim Evidence

### Task 1 — the RED, naming exactly the two files this plan fixes

```
 ❯ src/lib/__tests__/suite-hook-hygiene.test.ts (39 tests | 1 failed) 88ms
     ✓ MUST flag: 'beforeEach with a dynamic import — th…' 3ms
     ...
     × finds no hook-scoped import() outside the two documented carve-outs 12ms
     ✓ src/lib/execution/actions/__tests__/crm.test.ts still performs a hook-scoped import() with vi.resetModules() in that same hook 7ms
     ...

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/__tests__/suite-hook-hygiene.test.ts > no lifecycle hook performs a dynamic import() > finds no hook-scoped import() outside the two documented carve-outs
AssertionError: a lifecycle hook performs a dynamic import(). Every instance measured cost the whole module graph inside a 10 000 ms hookTimeout — 4121-4850 ms at 3x oversubscription for toggle.test.ts, 67% of it drizzle-orm/pg-core. vi.mock is hoisted above imports by vitest's transform, so move the import to MODULE SCOPE beside the vi.mock calls and reduce the hook to a synchronous vi.clearAllMocks(). Do NOT move it to beforeAll, do NOT raise hookTimeout, do NOT add retries. Offenders: src/lib/execution/recursion.test.ts:82: beforeEach (opened at :80) contains import("@/lib/triggers/create-run") | src/lib/execution/toggle.test.ts:64: beforeEach (opened at :61) contains import("@/app/workflows/actions"): expected [ …(2) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "src/lib/execution/recursion.test.ts:82: beforeEach (opened at :80) contains import(\"@/lib/triggers/create-run\")",
+   "src/lib/execution/toggle.test.ts:64: beforeEach (opened at :61) contains import(\"@/app/workflows/actions\")",
+ ]

 Test Files  1 failed (1)
      Tests  1 failed | 38 passed (39)
```

Exactly `recursion.test.ts:82` and `toggle.test.ts:64`, and nothing else. **`sentry.test.ts:185` was not named** — the KNOWN_NEGATIVE fixture for the measured regex false positive held, and the 38 passing tests include every floor, every fixture and every carve-out control, so the red is the sweep and not a broken walk.

### Task 2 — before/after, from `--reporter=json` `assertionResults[].duration`

```
BEFORE recursion.test.ts tests=13 firstTest="…getCurrentExecutionDepth returns 0 when not inside a workflow execution" 4.035480000000007ms total=1120.033245ms
BEFORE toggle.test.ts    tests=5  firstTest="toggleWorkflow returns error when not authenticated" 1365.985067ms total=1371.0815190000003ms
AFTER  recursion.test.ts tests=13 firstTest="…getCurrentExecutionDepth returns 0 when not inside a workflow execution" 6.535751000000346ms total=23.721646000000874ms
AFTER  toggle.test.ts    tests=5  firstTest="toggleWorkflow returns error when not authenticated" 3.865248999999949ms total=11.620799000000261ms
```

`recursion.test.ts`'s file-level first assertion belongs to an earlier `describe`, so the plan's actual subject — the first test of `createWorkflowRun with depth enforcement` — was extracted separately:

```
BEFORE 1100.016891ms passed | createWorkflowRun with depth enforcement creates a run with depth < 5 successfully
AFTER  2.8175460000002204ms passed | createWorkflowRun with depth enforcement creates a run with depth < 5 successfully
```

| Subject | Before | After | Threshold | Margin |
|---|---|---|---|---|
| `toggleWorkflow > returns error when not authenticated` | **1365.99 ms** | **3.87 ms** | ≤ 50 ms | 7.7 % of budget |
| `createWorkflowRun with depth enforcement > creates a run with depth < 5 successfully` | **1100.02 ms** | **2.82 ms** | ≤ 50 ms | 5.6 % of budget |
| `toggle.test.ts` whole file | 1371 ms | 11.6 ms | — | 118× |
| `recursion.test.ts` whole file | 1120 ms | 23.7 ms | — | 47× |

Test counts unchanged: toggle **5/5**, recursion **13/13**, 18 passed total.

**On the plan's noise caveat (phase hard rule 13):** a sibling agent (47-04) was running concurrently throughout, and the `≤ 50 ms` assertion was met with an order of magnitude to spare in both cases, so contention is not a confound here and no re-measurement is needed. The phase's authoritative before/after margin still comes from the isolated waves (47-02 and 47-06), not from these numbers.

The `vi.hoisted` block and the four `vi.mock` calls in `toggle.test.ts` are **byte-identical**, verified mechanically rather than by eyeball — old lines 3-52 compared against new lines 44-93:

```
old block lines 3-52 vs new block lines 44-93
BYTE-IDENTICAL: true
```

### Task 3 — Negative control C (hook half), green → red → green

**(1) GREEN on the fixed tree:**
```
 ✓ src/lib/__tests__/suite-hook-hygiene.test.ts (39 tests) 66ms

 Test Files  1 passed (1)
      Tests  39 passed (39)
```

**(2) RED** after temporarily re-adding `beforeEach(async () => { await import("@/app/workflows/actions") })` to `toggle.test.ts` — deliberately in a file the sweep enumerates, not a scratch fixture, because this control is about the SWEEP:
```
 FAIL  src/lib/__tests__/suite-hook-hygiene.test.ts > no lifecycle hook performs a dynamic import() > finds no hook-scoped import() outside the two documented carve-outs
AssertionError: a lifecycle hook performs a dynamic import(). … Offenders: src/lib/execution/toggle.test.ts:106: beforeEach (opened at :105) contains import("@/app/workflows/actions"): expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "src/lib/execution/toggle.test.ts:106: beforeEach (opened at :105) contains import(\"@/app/workflows/actions\")",
+ ]

 Test Files  1 failed (1)
      Tests  1 failed | 38 passed (39)
```
The failure message names the exact `file:line` of the re-added hook (`:106`) **and** the line the hook opened on (`:105`).

**(3) GREEN again** after `git checkout -- src/lib/execution/toggle.test.ts`:
```
 ✓ src/lib/__tests__/suite-hook-hygiene.test.ts (39 tests) 66ms

 Test Files  1 passed (1)
      Tests  39 passed (39)
```
`git status --porcelain src/lib/execution/toggle.test.ts` → empty.

### Task 3 — the carve-out complement, red → green

`vi.resetModules()` deleted from `crm.test.ts:95` on purpose. **Two** assertions went red — the per-file live control and its aggregate cross-check:

```
 FAIL  src/lib/__tests__/suite-hook-hygiene.test.ts > carve-out 1: the vi.resetModules() files still need their exemption > src/lib/execution/actions/__tests__/crm.test.ts still performs a hook-scoped import() with vi.resetModules() in that same hook
AssertionError: src/lib/execution/actions/__tests__/crm.test.ts is exempted because its hook calls vi.resetModules(), which makes the import cost per-test and the static form a semantic change. That reset is gone, so the reason for the exemption is gone: hoist the import to module scope and remove the file from RESET_MODULES_CARVE_OUT. Hooks without a reset: src/lib/execution/actions/__tests__/crm.test.ts:95: beforeEach (opened at :91) contains import("../index"): expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "src/lib/execution/actions/__tests__/crm.test.ts:95: beforeEach (opened at :91) contains import(\"../index\")",
+ ]

 FAIL  src/lib/__tests__/suite-hook-hygiene.test.ts > carve-out 1: the vi.resetModules() files still need their exemption > accounts for at least 4 suppressed hook imports in total
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 Test Files  1 failed (1)
      Tests  2 failed | 37 passed (39)
```

**This is the whole point of the control, and it is worth stating explicitly: the sweep itself stayed GREEN.** `crm.test.ts` is still path-excluded, so removing the reset made the exemption cover a file that no longer qualifies for it — invisible to the sweep, and exactly how an exclusion list rots into a silent hole. The live control is the only thing that catches it. The other three carved-out files stayed green in the same run, so the failure is the file that changed and not a broken detector.

**GREEN** after `git checkout -- src/lib/execution/actions/__tests__/crm.test.ts`:
```
 ✓ src/lib/__tests__/suite-hook-hygiene.test.ts (39 tests) 71ms

 Test Files  1 passed (1)
      Tests  39 passed (39)
```
`git status --porcelain` → empty for the whole tree.

## Verification

| Check | Result |
|---|---|
| `vitest run src/lib/__tests__/suite-hook-hygiene.test.ts` | **39 passed (39)**, sweep hit list `[]` |
| `vitest run toggle.test.ts recursion.test.ts` | **18 passed (18)** — 5 + 13, unchanged |
| `npm test` (base) | **4778 passed / 32 skipped**, 170 files + 2 skipped |
| `npm test` (rsc) | **8 passed (8)** |
| `npm run typecheck` | exit 0 |
| `npm run lint` | **0 errors**, 122 warnings (the worktree count; gate is errors, never the warning total) |
| `git status --porcelain` at end of task 3 | empty |

Baseline was **4739 passed / 32 skipped** across 169 files. 4739 + 39 new gate tests = **4778 exactly**, and 169 + 1 file = 170. No pre-existing test changed its result.

Forbidden shortcuts, asserted absent from both fixed files' non-comment source with `node -e` (never `grep | wc -l`, which is measurably wrong under `rtk`):

```
src/lib/execution/toggle.test.ts
   beforeAll absent / vi.resetModules absent / retry absent / hookTimeout absent / testTimeout absent
   await import( in code: absent
src/lib/execution/recursion.test.ts
   beforeAll absent / vi.resetModules absent / retry absent / hookTimeout absent / testTimeout absent
   await import( in code: absent
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — missing critical functionality] `recursion.test.ts`'s `vi.hoisted` and `vi.mock` moved to module scope**

- **Found during:** Task 2, in the BEFORE measurement run.
- **Issue:** vitest 4.1.11 emits two warnings for this file — *"A `vi.hoisted()` call … is not at the top level of the module … This will become an error in a future version"*, and the same for `vi.mock("@/db")`. The plan's edit-shape note describes the nested position as a fact to work around ("still hoisted to the top of the file by the transform"), which was written against the measurement, not against this warning.
- **Why it is a correctness requirement, not tidying:** the new module-scope `import { createWorkflowRun }` is safe **only because** that `vi.mock` is hoisted above it. Leaving the mock in the deprecated nested position makes the guarantee my fix depends on the thing vitest has announced it will stop honouring — and when it stops, the static import loads the real `@/db`, which throws without `DATABASE_URL`. The two also cannot move independently: `vi.mock`'s factory closes over the `vi.hoisted` destructured consts, so hoisting one without the other is a scope error.
- **Fix:** both blocks moved verbatim to module scope, above the `describe`, beside the new import. No factory body changed.
- **Files modified:** `src/lib/execution/recursion.test.ts`
- **Commit:** `7b2688d`
- **Verified:** both warnings gone from the run output; 13/13 still pass.

**2. [Rule 3 — blocking issue] Worktree base was stale**

Standard for this project (29 of 29 now). `git merge --ff-only c1fe056` from `a58b9e1`; never `reset --hard`. Not a code deviation, recorded because the plan files did not exist before it.

### Judgement calls worth recording

- **Fixture count.** The plan's behaviour spec named four positive shapes and three negative ones. Shipped 6 + 6: added *"two dynamic imports in one hook are two hits, not one"* and *"a hook with an explicit timeout argument is still a hook"* (the `beforeAll(…, 60000)` shape, which is exactly what the two `*-live` files use, so the detector must not be fooled by the second argument); and on the negative side a type-only `typeof import(...)` (an `ImportTypeNode`, not a `CallExpression` — `recursion.test.ts:78` was literally this before the fix) and `await importSeeds()` (a plain call whose name merely starts with `import`).
- **A both-directions self-test for the `vi.resetModules()` discriminator.** The carve-out live control is built on `hit.resetModulesInHook`, so a detector stuck on `true` would make the control vacuous and one stuck on `false` would make it permanently red. Asserted in both directions before it is trusted.
- **The static import's position in `toggle.test.ts`** is where the deleted `let` was (after the `vi.mock` calls), following 47-RESEARCH's proven replacement rather than moving it up beside the `vitest` import. It reads mocks-then-import, and it keeps the diff off the byte-identical block. `import/first` is not enabled in this config — confirmed by a clean lint run, not assumed.

## Known Stubs

None. No placeholder, empty-collection or "coming soon" value was introduced.

## Threat Flags

None. This plan adds one test file and edits two others; it introduces no network endpoint, auth path, file-access pattern or schema change. Nothing was installed — `typescript` was already a direct devDependency, so T-47-03-SC (supply chain) is satisfied by construction.

## What Is NOT Covered — read before trusting this gate

- **Commented-out violations are deliberately not hits.** An AST sweep for `CallExpression`s is inherently comment-blind. Stated in the header (S4, inverted); `db-test-isolation.test.ts:374-386` is the in-repo argument for keeping both raw and parsed forms.
- **The scope boundary is lexical.** An `import()` inside a module-scope helper a hook merely *calls* is not a hit. Following calls needs type resolution across the program, and every instance measured paid the cost in the hook's own first statement. Held as a KNOWN_NEGATIVE so it is a decision, not an accident. If a future defect hides behind a helper, widen the gate deliberately and record the measurement.
- **The four `vi.resetModules()` files still pay their import per test** (535 / 106 / 83 / 44 ms first-test). None is near its budget. 47-RESEARCH open question 1 — whether any of those resets is load-bearing — is still open and still out of scope.
- **SC-1b (no `expect()` over a clock-derived delta or ratio) is not in this file.** 47-VALIDATION sketched both AST sweeps living in one `suite-timing-hygiene.test.ts`; plan 47-03 splits the hook half into `suite-hook-hygiene.test.ts`, so the T1 elapsed-delta sweep belongs to its own plan. The two gates share the `scanSource`-shaped frame but not the file.
- **Negative control C's other half** — re-adding `expect(Date.now() - t).toBeLessThan(N)` — is the T1 gate's control and is not delivered here.

## Self-Check: PASSED

- `src/lib/__tests__/suite-hook-hygiene.test.ts` — FOUND
- `src/lib/execution/toggle.test.ts` — FOUND (modified)
- `src/lib/execution/recursion.test.ts` — FOUND (modified)
- `.planning/phases/47-suite-trust-supply-chain/47-03-SUMMARY.md` — FOUND
- commit `02ee9fd` — FOUND
- commit `7b2688d` — FOUND
- `STATE.md` / `ROADMAP.md` — untouched, as instructed (orchestrator owns them)
