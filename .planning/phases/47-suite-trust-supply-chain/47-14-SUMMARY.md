---
phase: 47-suite-trust-supply-chain
plan: 14
subsystem: test-infrastructure
tags: [quality-gates, ast-gate, vitest, test-body-hygiene, anti-vacuity, oversubscription, QG-01, D-47-06-A]

# Dependency graph
requires:
  - phase: 47-suite-trust-supply-chain
    provides: "47-03's suite-hook-hygiene.test.ts — the AST sweep, the fixtures-as-strings self-collision mitigation and the carve-out-as-live-control pattern this plan extends rather than replaces"
  - phase: 47-suite-trust-supply-chain
    provides: "47-05's measured `typescript` cost model (~525 ms per PROCESS on first import, 0.2 ms after; ~850 ms per independent corpus parse) — the reason the fourth scope shares the existing walk"
  - phase: 47-suite-trust-supply-chain
    provides: "47-06's D-47-06-A defect record and the three timing-out assertions, plus measure/extract-margins.mjs already repointed at them"
  - phase: 47-suite-trust-supply-chain
    provides: "47-02's committed load-induction instrument (spin.mjs, run-under-load.sh, extract-margins.mjs) and scripts/diff-pass-sets.mjs"
provides:
  - "suite-hook-hygiene.test.ts covering THREE scopes over ONE parse: lifecycle hooks, test callbacks, and same-file helpers transitively reachable from either"
  - "106 test-scope dynamic imports hoisted to module-scope statics across 7 files, with per-file test counts proven identical"
  - "D-47-06-A closed: 6/6 full base-suite runs GREEN at a sampled median 3.50x CPU oversubscription (range 2.50x-6.25x), against 47-06's 3-of-6 RED"
  - "the three named assertions at 0.3-2.3% of testTimeout 5000 ms, against 115.6-186.8% before"
  - "two new carve-outs (module-registry manipulation; untyped next/dist/compiled path), each a live control"
  - "the unreachable-helper boundary as an ASSERTED decision, not an accident (saved-views.test.ts:58)"
affects:
  - "src/lib/__tests__/suite-hook-hygiene.test.ts"
  - "any future test file adding a dynamic import in a test body or a helper a test calls — now a suite failure"
  - "7 test files now on module-scope static imports"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "one TypeScript-AST parse, several scopes: a fourth gate shares the existing corpus walk instead of starting a second sweep (47-05's cost model applied)"
    - "same-file, name-based, TRANSITIVE call-graph resolution inside a test-file AST gate — the widening 47-03's header authorised and left conditional on a measurement"
    - "an exclusion list whose justification is asserted live, one assertion per DISTINCT reason (four lists, four different properties)"
    - "a stated scope boundary reported as its own observable (unreachableHelperImports) so 'no hits' can be told apart from 'the pass broke'"
    - "vi.hoisted + static import as the replacement for a per-test dynamic import whose stated reason was mock-factory TDZ"

key-files:
  created:
    - ".planning/phases/47-suite-trust-supply-chain/47-14-SUMMARY.md"
  modified:
    - "src/lib/__tests__/suite-hook-hygiene.test.ts"
    - "src/lib/execution/failure-alert.test.ts"
    - "src/lib/execution/execution-processor.test.ts"
    - "src/lib/execution/engine.test.ts"
    - "src/app/workflows/__tests__/replay-carries-dry-run.test.ts"
    - "src/app/api/health/__tests__/route.test.ts"
    - "src/lib/log.test.ts"
    - "src/lib/import/formula-recalc-batch.test.ts"

decisions:
  - "The gate follows same-file helper calls TRANSITIVELY, reversing 47-03's lexical boundary — because the worst assertion in the repository (route.test.ts, 186.8% of budget) hid two calls deep and a lexical gate would have left it ungated. 47-03's header made this conditional on exactly such a measurement."
  - "src/db/schema/saved-views.test.ts was NOT hoisted. Its import sits in a function whose own comment says 'Never called'; it costs zero, and a static import would load the real @/db at collection with no DATABASE_URL. Expressed as the gate's unreachable-helper boundary WITH a live assertion on the site, not as a path exclusion."
  - "src/lib/audit/no-mutation-coupling.test.ts was NOT modified: it has no real site. The plan's line-scan counted a comment and a string literal inside another gate's fixture table."
  - "Two NEW carve-out lists rather than widening one: MODULE_INSTANCE_CARVE_OUT (file-level vi.resetModules/vi.doMock) and UNTYPED_COMPILED_CARVE_OUT (next/dist/compiled path with no type declarations). Different reasons need different live controls."
  - "The one deliberate cross-scope overlap (crm/http exempt in BOTH scopes) is asserted to be real — each must carry both a hook hit and a test hit — rather than left as an unexplained list collision."
  - "Three files needed vi.hoisted before a static import was legal; the vi.hoisted block and the vi.mock factories moved as ONE unit because the factories close over its bindings."

metrics:
  duration: "~78 min"
  completed: "2026-08-25"
  tasks: 3
  commits: 3
  tests_added: 36
---

# Phase 47 Plan 14: Close D-47-06-A — Test-Body Import Hygiene Summary

**The phase goal now holds where it previously failed.** 47-06 measured `npm test` going RED in **3 of
6** full-suite runs at a sampled 2.50x-9.00x CPU oversubscription, on three assertions that were
*not* the two the phase had fixed. After this plan: **6 of 6 GREEN** at a sampled median **3.50x**
(range 2.50x-6.25x), pass sets **6/6 IDENTICAL** at 4941 identities, and the three named assertions
sitting at **0.3%-2.3%** of their 5000 ms `testTimeout` where they had been at **115.6%-186.8%**.

The population is now gated, so it cannot regrow: `suite-hook-hygiene.test.ts` covers test bodies and
test-called helpers as well as lifecycle hooks, over **one** parse of **one** corpus.

## What Was Built

| # | Task | Commit |
|---|------|--------|
| 1 | RED — corpus extended to test bodies + reachable helpers, observed red on the pre-hoist tree | `81d410c` |
| 2 | GREEN — 106 test-scope dynamic imports hoisted to module-scope statics across 7 files | `97b878c` |
| 3 | Re-measurement under a verified >=3x load; 6/6 green (no tree change) | — (evidence only) |

---

## 1. THE POPULATION, RE-VERIFIED BY AST — AND THE PLAN'S TABLE WAS WRONG IN THREE PLACES

Phase hard rule 1 says to trust the plan's measured table **but re-verify it**. Re-verified with a
`node` + `typescript` AST walk (never `grep | wc -l`, which is measurably wrong under `rtk`), and the
plan's `node -e` **line** scan turned out to be a line scan: it cannot tell code from a comment or
from a string literal, which is the same weakness that made this gate parse rather than grep in the
first place.

| plan's table (line scan) | AST truth | why they differ |
|---|---|---|
| 157 sites / 22 files | 157 textual occurrences, **128 real call expressions** | comments and string fixtures counted |
| **112 hoistable / 9 files** | **106 hoistable / 7 files** | see the three rows below |
| `no-mutation-coupling.test.ts` — 2 sites | **0 real sites** | `:126` is prose in a comment; `:556` is a **string literal** inside that gate's own fixture table |
| `log.test.ts` — 2 sites | **1** (`:50`, in `loadLog()`) | `:36` is prose in the file header |
| `formula-recalc-batch.test.ts` — 1 site at `:28` | **1**, but at `:283` | `:28` is `typeof import(...)`, an `ImportTypeNode` erased at runtime — not a call. The real site is `import("node:fs")` at `:283` |
| `saved-views.test.ts` — 1 site | 1, **deliberately not hoisted** | see §4 |

Full AST census of the corpus, before the fix:

```
files=178  hooksSeen=151  testCallbacksSeen=3735
hook-scope hits    11   (all four already carved out, sweep green — unchanged by this plan)
test-scope hits   106   (7 files) -> HOISTED
carved out         17   (send 7, http 5, crm 4, sentry 1) + 2 rsc + 1 skipped-live
unreachable         1   (saved-views.test.ts:58, asserted as such)
```

---

## 2. TASK 1 — THE EXTENDED GATE, OBSERVED RED ON THE PRE-HOIST TREE

**A gate nobody has watched fail is not a gate.** Verbatim, on the pre-hoist tree at commit `81d410c`:

```
 RUN  v4.1.11 /home/pedro/programming/pipelite/.claude/worktrees/agent-aae2e5a7b67616259

 ❯ src/lib/__tests__/suite-hook-hygiene.test.ts (73 tests | 1 failed) 966ms
     × finds no test-budget import() outside the documented carve-outs 50ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/__tests__/suite-hook-hygiene.test.ts > no test body performs or reaches a dynamic import() > finds no test-budget import() outside the documented carve-outs
AssertionError: a test body performs a dynamic import(), or calls a helper that does. This population is billed against testTimeout 5000 ms — HALF the hook budget — and 47-06 measured three of six full-suite runs going RED on it at a sampled 2.50x-9.00x oversubscription: route.test.ts at 9339 ms (186.8% of budget), replay-carries-dry-run at 5934 ms (118.7%), engine.test.ts at 5782 ms (115.6%). vi.mock is hoisted above imports by vitest's transform, so move the import to MODULE SCOPE beside the vi.mock calls and delete the loader helper. Do NOT raise testTimeout, do NOT add retries, do NOT mark the file serial-only — each of those makes the symptom rarer while leaving a gate whose failure mode is machine load rather than code behaviour. If the file genuinely needs a fresh module instance per test, add it to MODULE_INSTANCE_CARVE_OUT with a written reason — the live control there will hold you to it. Offenders: src/app/api/health/__tests__/route.test.ts:67: helper loadRoute (opened at :66) reachable from test contains import("@/app/api/health/route") | src/app/workflows/__tests__/replay-carries-dry-run.test.ts:97: test it (opened at :95) contains import("../actions") | ... | src/lib/log.test.ts:50: helper loadLog (opened at :49) reachable from test contains import("./log"): expected [ …(106) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "src/app/api/health/__tests__/route.test.ts:67: helper loadRoute (opened at :66) reachable from test contains import(\"@/app/api/health/route\")",
+   "src/app/workflows/__tests__/replay-carries-dry-run.test.ts:97: test it (opened at :95) contains import(\"../actions\")",
+   "src/app/workflows/__tests__/replay-carries-dry-run.test.ts:112: test it (opened at :110) contains import(\"../actions\")",
+   "src/app/workflows/__tests__/replay-carries-dry-run.test.ts:125: test it (opened at :123) contains import(\"../actions\")",
+   "src/app/workflows/__tests__/replay-carries-dry-run.test.ts:137: test it (opened at :135) contains import(\"../actions\")",
+   "src/app/workflows/__tests__/replay-carries-dry-run.test.ts:147: test it (opened at :144) contains import(\"../actions\")",
+   "src/lib/execution/engine.test.ts:215: test it (opened at :197) contains import(\"./engine\")",
    ... 98 more, tallied by file below ...
+   "src/lib/execution/failure-alert.test.ts:622: test it (opened at :621) contains import(\"./failure-alert\")",
+   "src/lib/import/formula-recalc-batch.test.ts:283: test it (opened at :282) contains import(\"node:fs\")",
+   "src/lib/log.test.ts:50: helper loadLog (opened at :49) reachable from test contains import(\"./log\")",
+ ]

 ❯ src/lib/__tests__/suite-hook-hygiene.test.ts:1251:7

 Test Files  1 failed (1)
      Tests  1 failed | 72 passed (73)
   Duration  8.80s
```

The offender list is **exactly 106 entries, tallied by file:**

```
 35  src/lib/execution/failure-alert.test.ts
 33  src/lib/execution/execution-processor.test.ts
 30  src/lib/execution/engine.test.ts
  5  src/app/workflows/__tests__/replay-carries-dry-run.test.ts
  1  src/app/api/health/__tests__/route.test.ts
  1  src/lib/import/formula-recalc-batch.test.ts
  1  src/lib/log.test.ts
---
106  TOTAL
```

Reproducible verbatim with `git checkout 81d410c && ./node_modules/.bin/vitest run
src/lib/__tests__/suite-hook-hygiene.test.ts`.

**Read what is NOT in that list, because it is the evidence the red is the sweep and not a broken
walk.** All three of 47-06's timing-out files are named, and the 72 passing tests in the same run
include every floor, all 15 positive and 9 negative fixtures, all four carve-out live controls, the
hook sweep (still green, still zero offenders), the unreachable-helper boundary control, and all five
self-collision controls. Absent from the list: `sentry.test.ts` (module-registry carve-out),
`send.test.ts`, `http.test.ts`, `crm.test.ts`, the two `*.rsc.test.tsx` files, `export-events-live`
(skipped-live), and `saved-views.test.ts` (unreachable helper). One assertion red, everything that
could mask it green.

### The gate now covers three scopes over one parse

| scope | what it is | budget |
|---|---|---|
| `hook` | `import()` lexically inside `beforeEach`/`beforeAll`/`afterEach`/`afterAll` | `hookTimeout` 10 000 ms |
| `test` | `import()` lexically inside an `it`/`test` callback, any modifier chain | `testTimeout` **5000 ms** |
| `helper` | `import()` inside a same-file named function reachable (transitively) from either | whichever reached it |

Modifier chains are handled by walking the property-access chain down to the roots `it` / `test`, so
`it.each`, `test.only`, `test.concurrent.each` and any future vitest modifier are covered without
editing a list. `describe` is deliberately not a root: code in a `describe` body runs at collection
time, under no budget.

### Anti-vacuity, and where the new floors came from

| Form | Instance | measured | floor |
|---|---|---|---|
| (a) named floors, measurement in an adjacent doc-comment, set below it | `MIN_TEST_FILES` | 178 | 150 |
| | `MIN_HOOKS_PARSED` | 151 | 140 |
| | **`MIN_TEST_CALLBACKS_PARSED`** (new — the floor for this whole extension) | **3735** | 3000 |
| (b) matcher self-tests before the sweep | 15 KNOWN_POSITIVE + 9 KNOWN_NEGATIVE, asserting the extracted value `scope container:line` | — | — |
| (c) known-present positive anchor | the four carve-out live controls | — | — |
| (d) **floor the token, not the count (WR-11)** | `MIN_CARVED_OUT_TEST_IMPORTS` | 17 | 17 |
| | `MIN_UNTYPED_COMPILED_IMPORTS` | 2 | 2 |
| | `MIN_CARVED_OUT_HOOK_IMPORTS` | 4 | 4 |
| (e) self-collision | see below | — | — |
| (f) exclusion list as a live control | four lists, four distinct asserted properties | — | — |

Two extra both-directions discriminator self-tests were added, on the same reasoning 47-03 gave for
`resetModulesInScope`: the file-level `vi.resetModules()`/`vi.doMock()` counter is asserted to report
`[1, 1]` when they are present and `[0, 0]` when they are not, because a counter stuck high makes
carve-out 2's control vacuous and one stuck at zero makes it permanently red.

### The self-sweep hazard: unchanged mitigation, STRONGER proof

The mitigation is exactly as 47-03 left it — **fixtures as source strings through the sweep's own
`scanSource`, no path exclusion** — and `expect(EXCLUDED_PATHS).not.toContain(GATE_PATH)` is
preserved, now extended to assert the gate file is absent from each of the four lists individually.

The positive proof got better. 47-03 could only assert `hooksSeen === 0` for the gate file. Now the
same control asserts `hooksSeen === 0` **and `testCallbacksSeen > 10`** — the body detector
demonstrably *is* looking at this file, counts the ~40 real test callbacks it declares, and still
finds zero hits, while the WR-11 token floor proves the forbidden fixture lines are physically
present line by line. "Zero hits here" can no longer be confused with "the detector skipped this
file".

One new self-control was added for 47-05's cost model, so the next scope cannot quietly start a
second sweep: the file's own source is asserted to contain exactly **one** `import ts from
"typescript"`, exactly **one** `const CORPUS = TEST_FILES.map(`, and exactly **one**
`const TEST_FILES = walkTestFiles(`.

### Why helpers are followed now, when 47-03 deliberately did not

47-03 stated its boundary as lexical, held it as a KNOWN_NEGATIVE, and named the condition for
changing it: *"If a future defect hides behind a helper, widen this gate deliberately and record the
measurement — do not assume it is already covered."*

That is precisely what happened. The worst assertion in the repository — `route.test.ts` at **9339 ms,
186.8% of a 5000 ms budget**, the only one observed at nearly 2x over — reaches its import **two
calls deep**: the test body calls `callGet()`, which calls `loadRoute()`, which performs the
`import()`. A lexical gate leaves the single most fragile assertion in the tree ungated. So that
KNOWN_NEGATIVE became a KNOWN_POSITIVE of that exact two-level shape, and the boundary moved with its
own new fixtures:

- an `import()` in a named function **nothing reachable calls** is not a hit (the `saved-views` case);
- a helper reachable only from **another uncalled helper** is not a hit (transitivity must not become
  reachability-from-anywhere);
- only **bare-identifier** calls are edges; `obj.method()` is not followed;
- one flat name space per file; a shadowed name resolves to the last declaration.

---

## 3. TASK 2 — THE HOIST

### Per-file test counts, before and after, from `--reporter=json`

Not by eyeball. `assertionResults[]` counted per file, in one run each, on the same machine minutes
apart.

| file | before | after | Δ | first-test duration before → after |
|---|---|---|---|---|
| `src/app/api/health/__tests__/route.test.ts` | **19** | **19** | 0 | 11.50 ms → 20.79 ms |
| `src/app/workflows/__tests__/replay-carries-dry-run.test.ts` | **5** | **5** | 0 | **2991.83 ms → 4.14 ms** |
| `src/lib/execution/engine.test.ts` | **37** | **37** | 0 | **1135.39 ms → 20.40 ms** |
| `src/lib/execution/execution-processor.test.ts` | **37** | **37** | 0 | 74.88 ms → 7.11 ms |
| `src/lib/execution/failure-alert.test.ts` | **38** | **38** | 0 | 103.01 ms → 3.87 ms |
| `src/lib/import/formula-recalc-batch.test.ts` | **16** | **16** | 0 | 7.64 ms → 5.15 ms |
| `src/lib/log.test.ts` | **24** | **24** | 0 | 42.10 ms → 13.64 ms |
| **TOTAL** | **176** | **176** | **0** | — |

`route.test.ts`'s file-level first assertion is not the one 47-06 probed; its probed assertion went
**1189.80 ms (23.8% of budget) → 12.87 ms (0.3%)** in the same pair.

### `vi.hoisted` was required in three files, and the two blocks moved together

`failure-alert.test.ts`, `execution-processor.test.ts` and `engine.test.ts` each carried a note
saying a static import was impossible. **The note was right about the mechanism and wrong about the
conclusion.** A static import *is* hoisted above plain module-scope `const mockDb = …`, so the
`@/db` factory would read `mockDb` inside its TDZ and throw `Cannot access 'mockDb' before
initialization` — which vitest surfaces as a 0-test collection failure that reads exactly like a
missing module. `vi.hoisted` is the answer to that specific problem: its callback is lifted above the
imports too.

This is 47-03's `recursion.test.ts` lesson applied a second time: the `vi.hoisted` block and the
`vi.mock` factories **cannot move independently**, because the factories close over its bindings, so
each pair moved as one unit. **Zero nested-`vi.mock` / nested-`vi.hoisted` warnings** in any of the
touched files — checked by scanning the run output for `hoisted|top level|future version|Warning`,
which returned nothing.

### Three files needed more than a line deletion

- **`route.test.ts`** took a **namespace** import (`import * as healthRoute`), not a named one,
  because its closed-verb-surface test asserts that `POST`/`PUT`/`PATCH`/`DELETE` are *absent* from
  the module — which needs the whole namespace object. Two tests also became synchronous, since
  nothing in them awaits any more.
- **`engine.test.ts`**'s `await import("./actions/transform")` is a **side-effect** import that
  registers the `javascript_transform` handler; it is now a module-scope `import "./actions/transform"`
  so registration happens once at collection.
- **`log.test.ts`** collapsed 24 `const log = await loadLog()` lines into one module-scope
  `import { log } from "./log"`. Every one of the 24 was verified identical in shape and followed by a
  blank line before the mechanical edit.

### The headers were rewritten, not left lying

Four of the seven files carried doc-comments asserting that the dynamic form was deliberate. Leaving
them would have made the files claim something false. Each now records the mechanism, the
measurement that reversed the trade, and what was given up:

- `route.test.ts` traded a "N tests, N failed" RED-run diagnostic for a 0.54x → 42.74x margin. The
  diagnostic is worth little — a collection error names the file, and every assertion fails either
  way.
- `log.test.ts` traded the same diagnostic, and the header now notes that with no `vi.resetModules()`
  in the file, 23 of its 24 loads were already cache hits.

---

## 4. TWO FILES DELIBERATELY NOT HOISTED — AN HONEST CARVE-OUT BEATS A BROKEN HOIST

### `src/db/schema/saved-views.test.ts:58` — the import never executes

`await import("../index")` sits inside `_ownerAttributionTypechecks()`, a function whose **own
doc-comment says "Never called — its value is that it must typecheck."** It costs exactly zero at run
time, and hoisting it to a static `import { db } from "../index"` would load the **real** `@/db` at
collection in a project with no `DATABASE_URL`. The plan's line scan could not see that, and forcing
the hoist would have produced a defect dressed as a speedup (plan rule 9).

It is **not** handled with a path exclusion. It is the gate's stated unreachable-helper boundary, and
the boundary is asserted rather than assumed:

```
expect(entry.unreachableHelperImports.map(h => `${h.container}:${h.line}`))
  .toEqual(["_ownerAttributionTypechecks:58"])
expect(entry.hits).toEqual([])
```

If that function is ever deleted, renamed or *called*, the assertion goes red and someone has to
think, instead of an exemption silently covering a live import. "No hits" and "the helper pass stopped
running" are now distinguishable.

### `src/lib/audit/no-mutation-coupling.test.ts` — there was nothing there

Zero real sites. Not modified, and not carved out either — there is nothing to exempt.

### The other two carve-outs added

| list | files | asserted live property |
|---|---|---|
| `MODULE_INSTANCE_CARVE_OUT` | `send.test.ts`, `http.test.ts`, `crm.test.ts`, `sentry.test.ts` | still calls `vi.resetModules()` **or** `vi.doMock()` (file level) **AND** still has >=1 test-scope `import()` |
| `UNTYPED_COMPILED_CARVE_OUT` | the two `*.rsc.test.tsx` Flight-serializer files | still has a test-reachable `import()` **AND** its specifier is still under `next/dist/compiled/` |

The rsc pair is the honest-carve-out case: the deep compiled path ships no type declarations (hence
the `as unknown as FlightServer` cast at the boundary), so a static import does not typecheck. They
are also excluded from the base project by `vitest.config.ts`, run in the 8-test rsc project, and
have never been observed near a timeout.

`crm.test.ts` and `http.test.ts` appear in **both** the hook list and the module-registry list. That
overlap is asserted to be **real** — each must actually carry a hook-budget hit *and* a test-budget
hit — rather than left as an unexplained collision between two lists that are otherwise asserted
disjoint.

---

## 5. TASK 3 — RE-MEASURED UNDER A VERIFIED LOAD

Ran with 47-02's committed instrument, unchanged, exactly as 47-06 did. No tree change.

### The oversubscription actually achieved, sampled — not assumed

`spinners / availableParallelism` reads **2.00x** here and is the wrong number, because vitest brings
its own workers. The authoritative figure is **field 4 of `/proc/loadavg` (runnable/total) divided by
the core count**, sampled every 10 s throughout each batch by the harness.

| figure | run A (54 samples) | run B (53 samples) |
|---|---|---|
| `spinners / cores` (understatement) | 2.00x | 2.00x |
| 1-min loadavg / cores, steady state | 0.48x–3.53x, median **3.30x** | 2.62x–3.67x, median **3.41x** |
| **runnable / cores (AUTHORITATIVE)** | 2.75x–5.75x, median **3.50x** | 2.50x–6.25x, median **3.50x** |
| samples below 3x | 2/54 (4%) | 2/53 (4%) |
| base-run wall time | 175.165–177.584 s | 171.060–173.801 s |

**Corroborated by wall-time inflation:** 47-02 measured the idle base run at 52.4–58.6 s on this
machine; 171–178 s under load is **≈3.0–3.4x**, independently consistent with the sampled runnable
median of 3.50x. The 1-min average is recorded but lags by design — run A's 0.48x minimum is its
first sample, taken before the spinners had been running a minute.

**On the noisy-neighbour caveat.** Two sibling executors (47-10, 47-11) were running full suites in
adjacent worktrees during this plan, so the machine was not quiet. That is why the multiplier is
reported as a sampled distribution with its sample count rather than a single number, and why 4% of
samples sat below 3x. At the moment run A started, an exact `/proc/*/cmdline` enumeration found **no
sibling vitest process alive**, so the induced load is attributable to the 8 spinners plus the suite's
own workers; the medians of the two batches agreeing exactly at 3.50x, on batches taken 9 minutes
apart, is further evidence the reading is the instrument and not a neighbour.

### Six full base-suite runs under that load — ALL GREEN

```
run=01 project=base exit=0 wall=177.584s success=true files=174 total=4965 passed=4933 failed=0 skipped=32 verdict=GREEN
run=02 project=base exit=0 wall=175.328s success=true files=174 total=4965 passed=4933 failed=0 skipped=32 verdict=GREEN
run=03 project=base exit=0 wall=175.165s success=true files=174 total=4965 passed=4933 failed=0 skipped=32 verdict=GREEN
run=04 project=base exit=0 wall=172.514s success=true files=174 total=4965 passed=4933 failed=0 skipped=32 verdict=GREEN   (batch B run 01)
run=05 project=base exit=0 wall=173.801s success=true files=174 total=4965 passed=4933 failed=0 skipped=32 verdict=GREEN   (batch B run 02)
run=06 project=base exit=0 wall=171.060s success=true files=174 total=4965 passed=4933 failed=0 skipped=32 verdict=GREEN   (batch B run 03)
# red projects 0   (both batches)
```

All six rsc runs green too (8/8, 2.799–4.154 s). Pass sets, graded by `scripts/diff-pass-sets.mjs`
over all six merged iterations:

```
run    files  assertions  passed  collect-failures  identities
01..06  176       4973     4941          0            4941      (identical rows)

PASS-SET DIFF vs run 01 (base + rsc unioned)
  run 02..06: IDENTICAL (4941 tests)

ANTI-VACUITY FLOORS
  iterations           = 6 (floor 2) PASS
  reference pass set   = 4941 (floor 4000) PASS

OK: all 6 iterations produced the SAME pass set (4941 identities, 4941 passing).
```

**Against 47-06's record on the same instrument: `run A 01 RED, run B 01 RED, run B 02 RED` — 3 of 6.
Now 0 of 6.** As `diff-pass-sets.mjs` says of itself, an identical pass set is a regression guard and
not the evidence; the evidence is the margin below.

### The three named assertions, before and after — same instrument, same probes

`measure/extract-margins.mjs` re-run unchanged; all 7 probes located in all 6 reports (its floor
would have FATAL'd otherwise).

| assertion (budget `testTimeout` 5000 ms) | BEFORE, 47-06 @2.50–9.00x | AFTER, n=6 @2.50–6.25x (median 3.50x) | worst-case margin |
|---|---|---|---|
| `route.test.ts` :: `empty registry returns 503 …` | **9339 ms = 186.8%** | min 33.18 / median 45.47 / **max 116.97 ms = 2.3%** | 0.54x → **42.74x** |
| `replay-carries-dry-run.test.ts` :: `replaying a run whose dryRun is true …` | **5934 ms = 118.7%** | min 12.84 / median 18.10 / **max 22.32 ms = 0.4%** | 0.84x → **223.99x** |
| `engine.test.ts` :: `walks a linear 3-node graph …` | **5782 ms = 115.6%** | min 26.95 / median 36.89 / **max 73.27 ms = 1.5%** | 0.86x → **68.24x** |

Every one of the 18 observations is below 2.3% of budget. The worst single reading in six loaded runs
is 116.97 ms against 5000 ms.

A same-machine, same-hour focused pair on the seven files gives the same picture from the other
direction — 1189.80 ms (23.8%) → 12.87 ms (0.3%); 2991.83 ms (59.8%) → 4.14 ms (0.1%); 1135.39 ms
(22.7%) → 20.40 ms (0.4%). The lower BEFORE numbers there are simply a lighter load than 47-06's; the
authoritative pair is the table above, because both halves come from the same committed instrument.

47-03's two hook subjects, probed in the same reports, stayed where 47-06 left them: `toggle` max
19.70 ms = **0.2%** of `hookTimeout`, `recursion` max 15.18 ms = **0.2%**. Nothing regressed.

### Zero load generators left alive, proven by exact `/proc/*/cmdline` match

Both batches' traps reported `surviving spinner processes = 0`. Verified again afterwards, walking
`/proc` and comparing the whole command line for **equality**:

```
match(exact) "node …/measure/spin.mjs" -> 0 process(es)
COUNT=0
```

And the reason `pgrep -fc` must not be used, demonstrated rather than asserted — the same walk with
substring matching reports two phantoms that are the *query itself*:

```
match(contains) "spin.mjs" -> 2 process(es)
  2192986  /bin/bash -c source /home/pedro/.claude/shell-snapshots/…
  2192995  node /tmp/p47-14/procs.mjs contains spin.mjs
COUNT=2
```

---

## 6. Verification

| Check | Result |
|---|---|
| `vitest run src/lib/__tests__/suite-hook-hygiene.test.ts` | **75 passed (75)**, both sweeps `[]` |
| the extended gate observed RED pre-hoist | **1 failed / 72 passed (73)**, 106 offenders, verbatim in §2 |
| `npm test` — base | **4933 passed / 32 skipped** (172 files passed, 2 skipped) |
| `npm test` — rsc | **8 passed (8)** |
| `npm run typecheck` | exit 0 |
| `npm run lint` | **0 errors**, 122 warnings — the worktree baseline, unchanged |
| 6 full base-suite runs at a sampled median 3.50x | **6/6 GREEN**, pass sets 6/6 IDENTICAL (4941) |
| `extract-margins.mjs` on all 6 reports | all 7 probes located in all 6, no FATAL |
| surviving `spin.mjs` processes, exact cmdline match | **0** |
| `git status --porcelain` | empty |
| compose stack | up — app (5 h), postgres (healthy), mailhog |

**Test-count arithmetic.** The plan's floor is 4845; the base commit `e6a8a3e` this worktree branched
from was already at **4897**, because waves 4-6 added tests after 47-06 measured. This plan adds
**+36** to the gate (39 → 75) and changes no other count: 4897 + 36 = **4933**, exactly what the six
loaded runs report. Verified directly rather than inferred — the pre-47-14 gate file was checked out
from `e6a8a3e` into place, run, and reported **39 passed (39)**; then restored with
`git checkout -- <file>`.

**One extra control worth recording:** that pre-47-14 gate, the hooks-only version, is **still green
on the hoisted tree** (39/39). The hoists introduced no new hook-scope import anywhere — proven by the
old gate, not only by the new one.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — bug] The gate's own prose spelled a compiler-suppression directive, taking three
assertions in another gate red**

- **Found during:** Task 2, in the first full `npm test`.
- **Issue:** `src/types/__tests__/no-standing-suppressions.test.ts` counts occurrences of that
  directive over **RAW, un-stripped** source, deliberately (its header explains that a
  comment-stripping read would make it pass on the untouched tree forever). My carve-out doc-comment
  and one failure message spelled it literally, twice, which inflated the repo-wide count from 2 to 4
  and produced: `expected 4 to be 2` on `keeps exactly two occurrences across test files`,
  `expected [ …(3) ] to deeply equal [ …(2) ]` on `keeps them in exactly the two files D-1 names`, and
  `expected 4 to be 2` on `counts exactly two repo-wide under src/`.
- **Fix:** both mentions reworded to describe the directive instead of spelling it, per that gate's
  own S6 rule (*reword the prose, never weaken the assertion*) and its explicit instruction to name
  the directive by description rather than spelling. **No assertion in either gate was touched.** The
  replacement sentence records the incident, so the next person who wants to mention it finds the
  reason.
- **Files modified:** `src/lib/__tests__/suite-hook-hygiene.test.ts`
- **Commit:** `97b878c`
- **Verified:** both gates green together, 89 passed (89).

**2. [Rule 1 — bug] A new unused binding added a lint warning**

- **Found during:** Task 2 lint check. 122 → **123** warnings.
- **Issue:** `mockExecute` was destructured out of `execution-processor.test.ts`'s new `vi.hoisted`
  block, but nothing in that file reads it directly — it exists only as `mockDb.execute`. Before the
  change it was a genuine module-scope const consumed on the next line, so the warning is new.
- **Fix:** dropped from the destructuring, with a comment saying why. Back to **122 warnings, 0
  errors** — the worktree baseline (master reads 124; the difference is `.planning`'s untracked files,
  which is why the gate is on errors and never on a warning total).
- **Commit:** `97b878c`

**3. [Rule 2 — missing critical functionality] `vi.hoisted` conversion in three files**

- **Found during:** Task 2.
- **Why it is a correctness requirement, not tidying:** without it the static import is **illegal** —
  the `@/db` mock factory reads `mockDb` in its TDZ and vitest reports a 0-test collection failure
  that reads exactly like a missing module. This is 47-03's `recursion.test.ts` finding a second time,
  and the same constraint applies: the `vi.hoisted` block and the `vi.mock` factories close over each
  other and cannot move independently.
- **Files modified:** `failure-alert.test.ts`, `execution-processor.test.ts`, `engine.test.ts`
- **Commit:** `97b878c`
- **Verified:** 38/38, 37/37, 37/37 — unchanged; zero hoisting warnings.

**4. [Rule 3 — blocking issue] Worktree base was stale**

Standard for this project (30 of 30 now). `git merge --ff-only e6a8a3e` from `a58b9e1`; never
`reset --hard`. Recorded because the plan files did not exist before it.

### Scope judgements that differ from the plan, and why

**5. The gate follows helper calls transitively — beyond the plan's literal wording**

The plan's task 1 says "flags `await import(` appearing anywhere inside a test callback body". Taken
literally, that leaves **`route.test.ts:67` ungated** — the 186.8%-of-budget assertion, the worst in
the repository, and one of the three the plan exists to fix — because its import is two calls deep in
`callGet()` → `loadRoute()`. Same for `log.test.ts:50` and `sentry.test.ts:104`. The plan's own
`files_modified` list includes those files, so the intent is clear; the line scan it was written from
simply could not tell a helper from a body. Widening is also exactly what 47-03's header authorised,
conditional on a recorded measurement, and the measurement exists (§2).

**6. `saved-views.test.ts` and `no-mutation-coupling.test.ts` are not in the hoisted set**

See §4. 106 sites / 7 files instead of the plan's 112 / 9. The difference is entirely the plan's line
scan counting comments and string literals, plus one genuine uncalled-helper exemption.

**7. Two new carve-out lists rather than one, and a third asserted overlap**

The plan describes "the carve-out" singular, keyed on `vi.resetModules()`/`vi.doMock()`. The rsc
Flight-serializer pair needs a **different** reason (an untyped compiled path that cannot be statically
imported), and a live control can only assert the property it is actually about. One list per reason;
the `crm`/`http` cross-scope overlap asserted real rather than papered over.

**8. Two `route.test.ts` tests became synchronous**

Removing the dynamic import left `async` callbacks with nothing to await. Left as `async` they would
be misleading; the assertion contents are unchanged.

---

## Known Stubs

None. No placeholder, empty-collection, mock-data or "coming soon" value was introduced. Every
carve-out list added is asserted non-empty and asserted to still describe its files.

## Threat Flags

None. This plan edits eight test files and no production code: no network endpoint, auth path,
file-access pattern or schema change. Nothing was installed — `typescript` was already a direct
devDependency, so the supply-chain surface is unchanged.

On the plan's own threat register:

- **T-47-14-01 (a hoist silently changes test behaviour)** — mitigated as specified: the file-level
  `vi.resetModules()`/`vi.doMock()` carve-out, per-file counts proven identical via `--reporter=json`
  (176 = 176), and six full green suites. **Residual risk accepted:** a test that now passes for the
  wrong reason because a module instance is shared where it previously was not. The detection is
  deliberately conservative (whole file, not per test), and none of the seven hoisted files calls
  either reset, so in all seven the module was *already* cached across tests — the dynamic form was
  buying nothing but cost.
- **T-47-14-02 (the extended gate is vacuous)** — mitigated by the three parse floors, the WR-11 token
  floors, and by **watching it fail** on the pre-hoist tree before trusting it (§2).
- **T-47-14-03 (the carve-out becomes a silent hole)** — mitigated by four live controls, one per
  distinct reason, plus the asserted overlap and the "excluded but not enumerated" check.

## What Is NOT Covered — read before trusting this gate

- **Commented-out violations are still deliberately not hits.** An AST sweep for `CallExpression`s is
  comment-blind. Unchanged from 47-03, stated in the header.
- **Helper resolution is same-file, name-based and bare-call only.** `obj.method()` and
  `this.method()` are not edges, and a shadowed name resolves to the last declaration. A defect hidden
  behind a method call, or behind a cross-file helper, is not covered — widen deliberately and record
  the measurement, as 47-03 asked and this plan did.
- **`import()` directly in a `describe` body is not a hit.** It runs at collection, under no budget.
  Held as a KNOWN_NEGATIVE so it is a decision.
- **The four `vi.resetModules()` hook files still pay their import per test** (535 / 106 / 83 / 44 ms
  first-test, 47-03's numbers). None is near its budget. Whether any of those resets is load-bearing
  is still 47-RESEARCH open question 1, still open, still out of scope.
- **17 test-scope imports remain in the module-registry carve-out** and 2 in the rsc pair. They are
  measured, asserted and bounded — not fixed.
- **6/6 green at 3.50x is not 6/6 green at 9x.** 47-06 saw peaks of 7.75x and 9.00x; the peaks here
  were 5.75x and 6.25x. What is proven is that the three assertions that failed at 2.50–9.00x now sit
  at 0.3–2.3% of budget, which is a 42x–224x margin — a category change, not a nudge. Nothing here
  proves no *other* assertion can time out at some higher load; it proves this population no longer
  can at any plausible one.
- **The pass-set diff is a regression guard, not the evidence.** The same check was 16/16 green on the
  unfixed tree. The evidence is the margin table.

## Self-Check: PASSED

- `src/lib/__tests__/suite-hook-hygiene.test.ts` — FOUND (modified)
- `src/lib/execution/failure-alert.test.ts` — FOUND (modified)
- `src/lib/execution/execution-processor.test.ts` — FOUND (modified)
- `src/lib/execution/engine.test.ts` — FOUND (modified)
- `src/app/workflows/__tests__/replay-carries-dry-run.test.ts` — FOUND (modified)
- `src/app/api/health/__tests__/route.test.ts` — FOUND (modified)
- `src/lib/log.test.ts` — FOUND (modified)
- `src/lib/import/formula-recalc-batch.test.ts` — FOUND (modified)
- `.planning/phases/47-suite-trust-supply-chain/47-14-SUMMARY.md` — FOUND
- commit `81d410c` (`test(47-14)`) — FOUND, and it precedes `97b878c`
- commit `97b878c` (`fix(47-14)`) — FOUND
- `STATE.md` / `ROADMAP.md` — untouched, as instructed (the orchestrator owns them)
