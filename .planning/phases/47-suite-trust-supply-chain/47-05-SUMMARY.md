---
phase: 47-suite-trust-supply-chain
plan: 05
subsystem: testing
tags: [vitest, typescript-compiler-api, ast, taint-analysis, fixpoint, anti-vacuity, quality-gates]

# Dependency graph
requires:
  - phase: 47-01
    provides: vitest 4.1.11 (the SEC-05 bump this gate runs under)
  - phase: 47-04
    provides: "the deletion of the elapsed quotient, and the correction that `performance.now()` survives in NON-TEST src — which is what this plan's clock-call floor is scoped around"
  - phase: 47-03
    provides: "`suite-hook-hygiene.test.ts` — the sibling AST gate whose house style, single self-collision mitigation and `EXCLUDED_PATHS` assertion this file matches deliberately"
provides:
  - "`src/lib/__tests__/suite-timing-hygiene.test.ts` — the SC-1b gate: a parsed-AST def-use taint sweep to a FIXPOINT over all 177 test files for `expect()` over a clock-derived delta or ratio"
  - "the exported `scanSource(fileName, sourceText, maxIterations)` matcher, whose `maxIterations` cap exists solely to let the self-test prove the fixpoint is load-bearing"
  - "the repository's stated boundary between a liveness backstop and an elapsed-time assertion, in the repo as prose AND asserted present"
  - "a live control asserting all six permitted `{ timeout: N }` backstops survive, so a sweep that removes them goes red instead of green"
  - "the deletion of the last two elapsed-time assertions in the suite (SC-1b closed)"
  - "negative control C (timing half) observed red twice — inline delta and bound-variable ratio — with the v1 ablation measured at 0 on the same file"
  - "a measured answer to 47-04's open question about a third AST gate: `typescript` costs ~525 ms per WORKER PROCESS, not per gate (0.2 ms on re-import); the parse is what scales, at ~850 ms per independent sweep"
affects: [47-10, 47-09, quality-gates, suite-timing-hygiene]

# Tech tracking
tech-stack:
  added: []  # nothing installed; `typescript` was already a direct devDependency at 5.9.3
  patterns:
    - "def-use taint propagation to a FIXPOINT over a TypeScript AST, with an injectable iteration cap so the fixpoint's necessity is asserted rather than assumed"
    - "matcher CLASSIFICATION reported on every hit and asserted by fixture, so the two matcher lists are load-bearing values rather than documentation"
    - "an out-of-scope file used as a LIVE CONTROL: the health route proves the `performance.now` branch against real source and proves 'reads a clock' != 'asserts on a clock delta' in the same assertion"
    - "an exclusion list that is deliberately EMPTY, applied live in the sweep and asserted empty, so adding an entry is a red-going act"

key-files:
  created:
    - src/lib/__tests__/suite-timing-hygiene.test.ts
  modified:
    - src/components/custom-fields/__tests__/client-formula-bounds.test.ts
    - src/lib/formula-engine.test.ts

key-decisions:
  - "the corpus is WIDER than `npm test` on purpose — it includes `*.rsc.test.*` (which `npm test` runs) and `*.db.test.*` (which it does not), because the base project's include GLOB matches both and a sweep whose corpus differs from the project's glob is a gate about a different tree"
  - "the clock-call floor is on `Date.now` ONLY and scoped to test files; `performance.now` is proven by fixture AND by a live control over `src/app/api/health/route.ts` instead of by a floor that would sit at zero"
  - "the exact-equality boundary is the CONJUNCTION of the two candidates — permitted only when the matcher is exact AND the file installs a fake clock — which is narrower than either alone"
  - "an UNRECOGNISED matcher is flagged, because a rule whose default is 'ignore' grows a hole every time vitest adds a matcher"
  - "ONE self-collision mitigation: fixtures as source strings through the sweep's own `scanSource`, no path exclusion, plus a live control that this file is enumerated and yields zero"

patterns-established:
  - "Pattern: prove a fixpoint by ABLATION — cap the loop at one pass inside the test and assert the miss, then run it uncapped and assert the find. 'The code has a loop' is not evidence that the loop matters."
  - "Pattern: when a rule must not fire on a shape another gate ships, hold THAT GATE'S EXACT EXPRESSION as a KNOWN_NEGATIVE fixture, so the two gates are proven not to fight before the second one exists."
  - "Pattern: report a hit's classification, not just its location, and assert the classification — it turns constant lists from documentation into values that can go red."

requirements-completed: [QG-01]

# Metrics
duration: 34min
completed: 2026-08-25
---

# Phase 47 Plan 05: Suite Timing-Hygiene Gate Summary

**"A test asserts on elapsed time" is now a suite-wide failure, enforced by a def-use taint sweep that propagates to a fixpoint across all 177 test files — and the last two elapsed assertions are deleted, leaving the `{ timeout: N }` liveness backstops that actually carried the property. The gate was observed red twice against deliberately re-added assertions, and the taint fixpoint is proven necessary by ablation rather than by inspection: capped at one pass it MISSES the bound-variable ratio, and a v1-style inline matcher reports 0 on a real file that provably contains one.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-08-25T09:52:00Z
- **Completed:** 2026-08-25T10:26:00Z
- **Tasks:** 3 (2 committed; task 3 is a recorded-evidence task with nothing to commit by design)
- **Files created:** 1 · **modified:** 2

## Accomplishments

- **SC-1b is closed and falsifiable.** The suite contains zero `expect()` over a clock-derived delta or ratio, and the gate that says so has been observed red on both shapes it must catch.
- **The taint fixpoint is proven load-bearing, not asserted to exist.** `scanSource` takes a `maxIterations` cap for one reason: a standing test runs the matcher capped at a single pass, asserts the bound-variable ratio is MISSED, then runs it uncapped and asserts it is FOUND. This is the defect 47-RESEARCH's own v1 scanner had, made into a permanent control.
- **The v1 failure was reproduced on real code, with a number.** While the bound-variable ratio control was live in `formula-engine.test.ts`, a v1-style inline matcher over that same file reported **0** clock calls inside any `expect(...)`, while the fixpoint reported 1. A gate that cannot see the defect it was written for is a vacuous gate, and that is now a measured fact rather than a warning.
- **The two new gates are proven not to fight.** The exact expression plan 47-10 will ship — `expect(new Date(entry.expires).getTime()).toBeGreaterThan(Date.now())` — is a passing KNOWN_NEGATIVE fixture here, alongside both `users/actions.test.ts` shapes.
- **47-04's `performance.now()` correction was applied, not just read.** The floor is on `Date.now` only, and the two surviving non-test call sites are used as a LIVE CONTROL rather than exempted in a comment.
- **47-04's open question about a third AST gate is answered with numbers.** `typescript` costs ~525 ms on first import in a process and **0.2 ms** on every later import in that same process. The cost is per WORKER, not per gate. The parse is what scales.

## Task Commits

1. **Task 1: RED — the elapsed-time taint gate, red on exactly two assertions** — `fcdde68` (test)
2. **Task 2: GREEN — delete both redundant elapsed assertions, keep the backstops** — `17e56c4` (test)
3. **Task 3: negative control C, timing half** — no commit by design. Both control bodies were installed in a real swept file, observed red, and reverted with `git checkout`; the deliverable is the verbatim evidence below, and `git status --porcelain` is empty.

## Files Created/Modified

- **`src/lib/__tests__/suite-timing-hygiene.test.ts`** — NEW, 1326 lines / 64 KB, 46 tests. Well above the plan's `min_lines: 250`.
- `src/components/custom-fields/__tests__/client-formula-bounds.test.ts` — the 15 000 ms elapsed bound and its now-unused clock read deleted; the stale `formula-engine.test.ts:398` cross-reference re-pointed at the sibling test **by name**; the rationale extended. Test count unchanged at 9.
- `src/lib/formula-engine.test.ts` — the 5 000 ms elapsed bound and its clock read deleted; a one-line note in the local register (single quotes, matching the file). Test count unchanged at 70.

---

## TASK 1 — THE VERBATIM RED, NAMING EXACTLY THE TWO OFFENDERS

```
 RUN  v4.1.11 /home/pedro/programming/pipelite

 ❯ src/lib/__tests__/suite-timing-hygiene.test.ts (45 tests | 1 failed) 71ms
     ✓ MUST flag: '(i) a bound-variable elapsed RATIO — …' 4ms
     ✓ MUST flag: '(ii) the inline delta client-formula-…' 1ms
     ✓ MUST flag: '(iii) the inline delta formula-engine…' 1ms
     ✓ MUST flag: '(iv) a performance.now RATIO — the br…' 1ms
     ✓ MUST flag: '(v) two bound deltas divided — negati…' 1ms
     ✓ MUST flag: '(vi) an exact-equality delta with NO …' 1ms
     ✓ MUST NOT flag: '(a) a frozen-clock exact delta — http…' 1ms
     ✓ MUST NOT flag: '(b) algebraically exact on one captur…' 1ms
     ✓ MUST NOT flag: '(c) a future timestamp compared to th…' 1ms
     ✓ MUST NOT flag: '(d) the exact allowlist-expiry assert…' 1ms
     ✓ MUST NOT flag: '(e) a future timestamp passed INTO a …' 0ms
     ✓ MUST NOT flag: '(f) an event-loop-yield timer — recur…' 0ms
     ✓ still parses the clock call and the assertion in the negative fixture: '(a) …' 1ms
     ✓ still parses the clock call and the assertion in the negative fixture: '(b) …' 1ms
     ✓ still parses the clock call and the assertion in the negative fixture: '(c) …' 0ms
     ✓ still parses the clock call and the assertion in the negative fixture: '(d) …' 0ms
     ✓ still parses the clock call and the assertion in the negative fixture: '(e) …' 0ms
     ✓ still parses the clock call and the assertion in the negative fixture: '(f) …' 0ms
     ✓ MISSES the bound-variable ratio at one pass and FINDS it at the fixpoint 2ms
     ✓ reports the taint chain it followed, not just a verdict 1ms
     ✓ does not taint through an addition, which is the whole discriminating rule 2ms
     ✓ enumerates at least 150 test files under src/ 0ms
     ✓ parses at least 7000 expect() call expressions 0ms
     ✓ still finds at least 25 Date.now call sites — the token floor 0ms
     ✓ finds zero performance.now call sites in the corpus, and that is why it is not floored 0ms
     ✓ enumerates every file this gate names, by exact path 1ms
     ✓ parses each named file without a syntax error swallowing its contents 0ms
     ✓ includes the rsc and db projects' files, because the base include glob matches them 0ms
     ✓ never walks outside src/, and never into .planning/ 0ms
     ✓ excludes non-test source that legitimately reads a clock, and proves the distinction 4ms
     × finds no elapsed-time assertion anywhere in the corpus 16ms
     ✓ applies an empty exclusion list, and the emptiness is the assertion 0ms
     ✓ 'src/components/custom-fields/__tests_…' still declares a 30000 ms backstop 1ms
     ✓ 'src/lib/formula-engine.test.ts' still declares a 10000 ms backstop 0ms
     ✓ 'src/lib/execution/actions/__tests__/t…' still declares a 10000 ms backstop 0ms
     ✓ 'src/lib/formula-recalc.test.ts' still declares a 5000 ms backstop 0ms
     ✓ 'src/lib/formula-recalc.test.ts' still declares a 20000 ms backstop 0ms
     ✓ 'src/lib/export/formatters-live.test.ts' still declares a 60000 ms backstop 0ms
     ✓ still parses at least 20 explicit timeouts in total 0ms
     ✓ finds no explicit timeout that the boundary statement would call an assertion 0ms
     ✓ is enumerated by its own walk 0ms
     ✓ is NOT path-excluded from its own sweep 0ms
     ✓ parses to zero clock calls and zero hits, which proves every fixture is a string 42ms
     ✓ still physically contains the fixture source the parse cannot see 3ms
     ✓ states the boundary this repository now enforces, in the file, as prose 1ms
```

The sweep assertion, verbatim:

```
 FAIL  src/lib/__tests__/suite-timing-hygiene.test.ts > no test asserts on a clock-derived elapsed delta or ratio (SC-1b) > finds no elapsed-time assertion anywhere in the corpus
AssertionError: a test asserts on a clock-derived elapsed delta or ratio. Measured under 3x CPU oversubscription, the assertion this rule was written for consumed 66% of its threshold from contention alone with the code under test unchanged, and it failed twice in Phase 44's parallel waves while passing every serial run. THE FIX IS TO DELETE THE ASSERTION AND KEEP THE { timeout: N }: a timeout is a liveness backstop whose failure means "this hung", an elapsed assertion is a margin whose failure means "the machine was busy". If the elapsed bound is the only thing asserting the property, assert the property instead — freeze the clock and assert exactly, count operations, or assert that the call returns at all. Do NOT raise the threshold, add retries, raise testTimeout/hookTimeout, mark the file serial-only, or exclude it by path. Offenders: src/components/custom-fields/__tests__/client-formula-bounds.test.ts:129: [delta] expect(Date.now() - start).toBeLessThan(15000) | src/lib/formula-engine.test.ts:403: [delta] expect(Date.now() - start).toBeLessThan(5000): expected [ …(2) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "src/components/custom-fields/__tests__/client-formula-bounds.test.ts:129: [delta] expect(Date.now() - start).toBeLessThan(15000)",
+   "src/lib/formula-engine.test.ts:403: [delta] expect(Date.now() - start).toBeLessThan(5000)",
+ ]

 Test Files  1 failed (1)
      Tests  1 failed | 44 passed (45)
   Duration  3.28s (transform 230ms, setup 0ms, import 2.90s, tests 92ms, environment 0ms)
```

**Exactly the two named offenders and nothing else.** No `http.test.ts:559`, no `users/actions.test.ts` line, no `audit/prune.test.ts`, no subscriber. The hand triage in 47-RESEARCH §4 is reproduced by the rule, with no path exclusion carrying any of it.

(The `[delta]` label became `[delta/threshold]` later in task 1 when the matcher classification was made explicit — see Deviation 1. The offender list is otherwise identical, and the post-change red appears under control C below.)

### The rule reproduces the triage STRUCTURALLY, which is stronger than the plan predicted

47-RESEARCH's over-broad v2 reported **12 raw hits of which 4 were real**. The rule as specified reports only **3 raw hits** on this tree before the matcher discriminator runs at all:

| # | file:line | kind | matcher | fake clock in file | verdict |
|---|---|---|---|---|---|
| 1 | `client-formula-bounds.test.ts:129` | delta | `toBeLessThan` | no | **FLAGGED** |
| 2 | `formula-engine.test.ts:403` | delta | `toBeLessThan` | no | **FLAGGED** |
| 3 | `http.test.ts:559` | delta | `toBe` | **yes** | permitted |

Hits 5-12 of the research table never reach the matcher stage: the `expect()` argument in each is a property-access call, an element access or a boolean, not a subtraction or a division, so the *structural* half of the rule already excludes them. The addition rule then keeps the taint from ever reaching `expiresAt`. **The discriminating rule is doing the work at two independent levels**, which is why hit 3 is the only one the matcher discriminator has to judge.

---

## POST-DELETION CORPUS COUNTS

Measured with `node -e` and with the committed AST walk. **Never with `wc -l`**, which miscounts in this environment.

| Measurement | AST (this gate's walk) | Raw text | Floor pinned |
|---|---|---|---|
| test files under `src/` | **177** (174 `.test.ts`, 3 `.test.tsx`, 0 `.spec.*`) | 177 | `MIN_TEST_FILES = 150` |
| `expect()` call expressions | **8183** | 8231 | `MIN_EXPECT_CALLS = 7000` |
| `Date.now` call sites | **34** (was 38 before the deletions) | 62 | `MIN_DATE_NOW_CALLS = 25` |
| `performance.now` call sites | **0** | 5 | *deliberately not floored* |
| explicit test/hook timeouts | **24** in 6 files | — | `MIN_EXPLICIT_TIMEOUTS = 20` |
| total AST nodes walked | 320 678 | — | — |

`performance.now(` in the corpus is **0**, as the plan required. The `Date.now` token floor of 25 sits below the post-deletion measurement of 34 and was confirmed against it — no adjustment was needed.

**The raw-vs-AST column is itself evidence.** Raw text finds 62 `Date.now` and 5 `performance.now`; the parse finds 34 and 0. The 28 and 5 differences are this gate's own header prose and its fixture strings. A grep-shaped gate would have been wrong by exactly that much, and its clock-call floor would have been satisfied by its own documentation. This is the fifteen-times-repeated Phases 37-38 collision handled rather than discovered — and handled by *parsing* rather than by avoiding the words, which is the opposite of 47-04's approach and correct for the opposite reason: 47-04's subject was scanned by this gate, whereas this gate is scanned only by itself, and it parses.

### The clock-call floor's SCOPE, stated

The floor is scoped to **`src/**/*.{test,spec}.*` — test files only** — and it floors **`Date.now` only**.

`performance.now` is not floored over that corpus because there are zero call sites in it: 47-04 removed the only two in any test file. **Three of this phase's planning documents (`47-RESEARCH.md §4`, `47-PATTERNS.md:544-548`, `47-VALIDATION.md:86-88`) say that deletion removed the repository's only two call sites. It removed the only two in any TEST file.** Two remain in non-test source, at `src/app/api/health/route.ts:111` and `:121` — Phase 42's DB-probe latency field.

Rather than widen the corpus to all of `src/**` (which would need a floor of `>= 2` plus an exemption for the health route — and an exemption indistinguishable from the one a real defect would ask for), the gate keeps the narrow corpus and turns the health route into a **live control**:

```
✓ excludes non-test source that legitimately reads a clock, and proves the distinction
```

That single test asserts the route is NOT in the corpus, that the detector still finds **>= 2** `performance.now` call sites in it, that it contains **0** `expect()` calls, and that it yields zero hits. So the `performance.now` branch is proven against real source as well as by KNOWN_POSITIVE fixture (iv), and **"reads a clock" is shown to be a different claim from "asserts on a clock delta"** — the health route computes `Math.round(performance.now() - start)`, a clock-derived delta, and is correctly not a violation because there is no assertion anywhere in it. If the two were the same thing, this gate would be demanding that a health endpoint stop reporting latency.

The three further `performance.now` occurrences in `.planning/phases/47-suite-trust-supply-chain/measure/` are unreachable by construction (the walk roots at `src/`), and that is asserted rather than assumed:

```
✓ never walks outside src/, and never into .planning/ 0ms
```

### The corpus scope for `*.db.test.ts` / `*.rsc.test.ts` — STATED, not silent

Both are **IN** the corpus, deliberately, and a standing test asserts it. `vitest.config.ts`'s include is `src/**/*.{test,spec}.?(c|m)[jt]s?(x)`, which *matches* both; they are removed from the base project by `test.exclude`, not by the glob. The rsc project is part of `npm test`. The db project is not, but SC-1b's claim is about the repository's tests rather than about one command, and `src/lib/mutations/dedup.db.test.ts:399`'s `Date.now()` deadline poll loop is a clock READ with no `expect()` over a delta — so including that project costs nothing and closes a hole instead of opening one. Keeping this corpus identical to the sibling hook gate's is also deliberate.

---

## THE SELF-COLLISION MITIGATION, BY NAME

**There is exactly one: every fixture is held as a source STRING and parsed through the sweep's own `scanSource` (`ts.createSourceFile`), and this file is NOT path-excluded from its own sweep.**

A string literal is not a `CallExpression`, so the sweep is structurally incapable of seeing a fixture — while the fixtures still travel the real matcher rather than a divergent copy of it. This is the same single mitigation 47-03 chose for the hook gate, kept identical on purpose.

Four standing assertions make it a proof rather than a claim:

```
✓ is enumerated by its own walk
✓ is NOT path-excluded from its own sweep
✓ parses to zero clock calls and zero hits, which proves every fixture is a string
✓ still physically contains the fixture source the parse cannot see
```

- `EXCLUDED_PATHS` is `[]`, **applied live in the sweep filter** so it cannot rot into decoration, asserted `toEqual([])`, and asserted `.not.toContain(GATE_PATH)` — matching 47-03, so adding an exclusion later goes red.
- Zero path-based exclusions of any test file, counted with `node -e`: the declaration is `const EXCLUDED_PATHS: readonly string[] = []` and it contains **0** `.test.ts` path literals.
- The parse counts **0** `Date.now` and **0** `performance.now` in this file, which is the positive proof that no fixture became live code — while its raw text contains 37 and 23 occurrences respectively.
- Fixtures are stored as arrays of lines joined at run time, so no contiguous run of forbidden source text exists anywhere in the file; the "still physically contains" control checks line by line.

**Both mitigations were NOT taken.** A gate that path-excludes itself *and* stringifies its fixtures has two independent reasons to be green and no way to tell which is load-bearing, and the header says so.

---

## THE 47-10 CROSS-CHECK — THE TWO NEW GATES DO NOT FIGHT

Plan 47-10's audit-policy gate will assert every allowlist entry's expiry is still in the future, in a shape structurally identical to `src/app/admin/users/actions.test.ts:59` — a designated false positive here. That exact expression is a **passing KNOWN_NEGATIVE fixture** in this file:

```
✓ MUST NOT flag: '(d) the exact allowlist-expiry assert…' 1ms
```

Fixture (d) is, verbatim, `expect(new Date(entry.expires).getTime()).toBeGreaterThan(Date.now())`. Its sibling floor confirms the parse really saw the clock call and the assertion in it, so it passes by judgement rather than by parse failure. Two further fixtures pin the neighbouring shapes: (c) is `users/actions.test.ts:59` and (b) is `users/actions.test.ts:37`.

The rule is also asserted at the taint level, not only through the hit list:

```
✓ does not taint through an addition, which is the whole discriminating rule 2ms
```

That test asserts `now` IS tainted and `later` (`now + 7 * 864e5`) is NOT, plus the complement — that a subtraction DOES taint both names — so a taint pass that propagated nothing could not satisfy it. **If a future edit taints addition, this goes red before any KNOWN_NEGATIVE does, and with the reason attached.**

---

## NEGATIVE CONTROL C — THE TIMING HALF, BOTH SHAPES

### (0) GREEN before, verbatim

```
 RUN  v4.1.11 /home/pedro/programming/pipelite

 ✓ src/lib/__tests__/suite-timing-hygiene.test.ts (46 tests) 55ms

 Test Files  1 passed (1)
      Tests  46 passed (46)
   Start at  07:18:37
   Duration  2.94s (transform 190ms, setup 0ms, import 2.65s, tests 55ms, environment 0ms)
```

### (1) RED — the INLINE DELTA, re-added to a real swept file

`const t = Date.now()` and `expect(Date.now() - t).toBeLessThan(5000)` installed into `src/lib/formula-engine.test.ts`'s interrupt test. Verbatim:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/__tests__/suite-timing-hygiene.test.ts > no test asserts on a clock-derived elapsed delta or ratio (SC-1b) > finds no elapsed-time assertion anywhere in the corpus
AssertionError: a test asserts on a clock-derived elapsed delta or ratio. Measured under 3x CPU oversubscription, the assertion this rule was written for consumed 66% of its threshold from contention alone with the code under test unchanged, and it failed twice in Phase 44's parallel waves while passing every serial run. THE FIX IS TO DELETE THE ASSERTION AND KEEP THE { timeout: N }: a timeout is a liveness backstop whose failure means "this hung", an elapsed assertion is a margin whose failure means "the machine was busy". If the elapsed bound is the only thing asserting the property, assert the property instead — freeze the clock and assert exactly, count operations, or assert that the call returns at all. Do NOT raise the threshold, add retries, raise testTimeout/hookTimeout, mark the file serial-only, or exclude it by path. Offenders: src/lib/formula-engine.test.ts:409: [delta/threshold] expect(Date.now() - t).toBeLessThan(5000): expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "src/lib/formula-engine.test.ts:409: [delta/threshold] expect(Date.now() - t).toBeLessThan(5000)",
+ ]

 ❯ src/lib/__tests__/suite-timing-hygiene.test.ts:1155:7

 Test Files  1 failed (1)
      Tests  1 failed | 45 passed (46)
   Start at  07:18:52
   Duration  3.03s (transform 181ms, setup 0ms, import 2.75s, tests 69ms, environment 0ms)
```

**The exact `file:line` is named: `src/lib/formula-engine.test.ts:409`**, classified `delta/threshold`.

### (2) GREEN after reverting, verbatim

```
$ git checkout -- src/lib/formula-engine.test.ts
$ git status --porcelain src/lib/formula-engine.test.ts
(empty)

 ✓ src/lib/__tests__/suite-timing-hygiene.test.ts (46 tests) 57ms

 Test Files  1 passed (1)
      Tests  46 passed (46)
   Start at  07:19:00
   Duration  3.46s (transform 209ms, setup 0ms, import 3.18s, tests 57ms, environment 0ms)
```

### (3) RED — the BOUND-VARIABLE RATIO, the shape v1 could not see

Installed into the same real swept file:

```typescript
    const t0 = Date.now()
    await evaluateFormula('{{A}} + 1', { A: 1 })
    const a = Date.now() - t0
    const t1 = Date.now()
    const result = await evaluateFormula(/* the runaway expression */)
    const b = Date.now() - t1
    expect(b / a).toBeLessThan(80)
```

Verbatim:

```
 FAIL  src/lib/__tests__/suite-timing-hygiene.test.ts > no test asserts on a clock-derived elapsed delta or ratio (SC-1b) > finds no elapsed-time assertion anywhere in the corpus
AssertionError: a test asserts on a clock-derived elapsed delta or ratio. Measured under 3x CPU oversubscription, the assertion this rule was written for consumed 66% of its threshold from contention alone with the code under test unchanged, and it failed twice in Phase 44's parallel waves while passing every serial run. THE FIX IS TO DELETE THE ASSERTION AND KEEP THE { timeout: N }: a timeout is a liveness backstop whose failure means "this hung", an elapsed assertion is a margin whose failure means "the machine was busy". If the elapsed bound is the only thing asserting the property, assert the property instead — freeze the clock and assert exactly, count operations, or assert that the call returns at all. Do NOT raise the threshold, add retries, raise testTimeout/hookTimeout, mark the file serial-only, or exclude it by path. Offenders: src/lib/formula-engine.test.ts:413: [ratio/threshold] expect(b / a).toBeLessThan(80): expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "src/lib/formula-engine.test.ts:413: [ratio/threshold] expect(b / a).toBeLessThan(80)",
+ ]

 ❯ src/lib/__tests__/suite-timing-hygiene.test.ts:1155:7

 Test Files  1 failed (1)
      Tests  1 failed | 45 passed (46)
   Start at  07:19:19
   Duration  2.87s (transform 180ms, setup 0ms, import 2.56s, tests 76ms, environment 0ms)
```

**`src/lib/formula-engine.test.ts:413`, classified `ratio/threshold`.** No clock call appears inside that `expect(...)` at all — both operands are bound names — which is precisely the shape 47-RESEARCH's v1 scanner could not see.

### (3b) THE V1 ABLATION, MEASURED ON THAT SAME LIVE RED

Run against `src/lib/formula-engine.test.ts` while the ratio control was still on disk, with a v1-style matcher that looks for clock calls appearing INLINE inside `expect(...)`:

```
V1 ABLATION on the control body — clock calls appearing INLINE inside expect(...): 0
expect() calls parsed in the file: 82
```

**A v1 scanner reports 0 on a file that provably contains a live elapsed-ratio assertion. The fixpoint reports 1.** That is the vacuous-gate failure mode reproduced on real code rather than argued from a fixture, and it is why the fixpoint is not optional.

The same property is enforced permanently *inside* the file, by ablation:

```
✓ MISSES the bound-variable ratio at one pass and FINDS it at the fixpoint 2ms
```

That test runs `scanSource(..., 1)` — the fixpoint capped at a single pass — and asserts the hit list is EMPTY, then runs it uncapped and asserts the extracted `12:ratio:threshold`, and asserts the loop took more than one iteration (measured: 3, i.e. 2 productive passes plus one to confirm). If the loop is ever flattened, this goes red with the reason written on it. Measured single-pass behaviour across all six positives:

```
SINGLE-PASS MISSED   (i) bound-variable RATIO — the shape v1 missed
SINGLE-PASS flagged  (ii) inline delta, 15000
SINGLE-PASS flagged  (iii) inline delta, 5000
SINGLE-PASS flagged  (iv) performance.now variant of (i)
SINGLE-PASS flagged  (v) bound-variable delta pair divided
SINGLE-PASS flagged  (vi) exact-equality delta with NO fake clock
```

Only fixture (i) — whose taint travels through a function's return value — needs the fixpoint. That is stated in the file, and the fixture carries a `needsFixpoint: true` marker the control reads, so the control cannot silently start testing a different fixture.

### (4) GREEN after reverting, verbatim

```
$ git checkout -- src/lib/formula-engine.test.ts
$ git status --porcelain src/lib/formula-engine.test.ts
(empty)
$ git status --porcelain
(empty)

 ✓ src/lib/__tests__/suite-timing-hygiene.test.ts (46 tests) 52ms

 Test Files  1 passed (1)
      Tests  46 passed (46)
   Start at  07:19:43
   Duration  2.89s (transform 195ms, setup 0ms, import 2.59s, tests 52ms, environment 0ms)
```

### The complement, stated explicitly

The GREEN runs at (0), (2) and (4) are the positive controls for both reds. Without them, a sweep that reported a violation unconditionally would have passed every RED above while proving nothing. It is also enforced permanently in-file: six KNOWN_NEGATIVE fixtures must come back empty, and each is paired with a floor asserting the parse still saw its clock call and its `expect()` — so `toEqual([])` cannot be satisfied by a parse that returned nothing.

---

## THE TWO DELETIONS

### `client-formula-bounds.test.ts`

Deleted `:129` (`expect(Date.now() - start).toBeLessThan(15000)`) and the now-unused `const start = Date.now()` at `:119`. **The stale cross-reference at `:117-118` naming `formula-engine.test.ts:398` was re-pointed in the same commit** — at the sibling *test* by name rather than by line, since that file's line numbers shifted in this very commit. A stale `file:line` pointer is the small lie that costs the next reader an hour, and re-pointing it at a line number would only have deferred the problem.

Kept: `{ timeout: 30000 }`, both `FORMULA_EVAL_OPTIONS?.timeoutMs` preconditions, and `expect(result).toBeDefined()`.

### `formula-engine.test.ts`

Deleted `:403` and the `const start = Date.now()` at `:396`. Kept `{ timeout: 10000 }` and `expect(result.error).not.toBeNull()`. Single quotes, matching the local file.

### `http.test.ts` — untouched, verified

```
$ git diff -- src/lib/execution/actions/__tests__/http.test.ts
(empty)
```

Its `:559` delta is legitimate — the clock is frozen by `vi.useFakeTimers({ shouldAdvanceTime: false })` — and KNOWN_NEGATIVE fixture (a) is what protects it from a future "cleanup".

### Source verification, all counted with `node -e`

| Check | Result |
|---|---|
| `Date.now` in `client-formula-bounds.test.ts` | **0** |
| `Date.now` in the whole of `formula-engine.test.ts` | **0** |
| `{ timeout: 30000 }` still in `client-formula-bounds.test.ts` | present |
| `{ timeout: 10000 }` still in `formula-engine.test.ts` | present |
| `expect(result).toBeDefined()` still present | present |
| `expect(result.error).not.toBeNull()` still present | present |
| `FORMULA_EVAL_OPTIONS?.timeoutMs` preconditions | 2, both present |
| stale `formula-engine.test.ts:398` pointer | **0** |
| `git diff -- .../http.test.ts` | empty |

### Test counts before and after — assertions removed, tests not removed

| File | Before | After |
|---|---|---|
| `src/lib/formula-engine.test.ts` | 70 | **70** |
| `src/components/custom-fields/__tests__/client-formula-bounds.test.ts` | 9 | **9** |
| combined | 79 passed | **79 passed** |

The runaway-expression test still costs what it did (519 ms before, 514 ms after) — the assertion was redundant, not load-bearing.

---

## THE BOUNDARY STATEMENT IS NOW IN THE REPOSITORY, AND ASSERTED

Verbatim in the gate's header, from 47-RESEARCH §4:609-611:

> "a test may rely on vitest's ambient or an explicit `{ timeout: N }` as a liveness backstop against a hang, but must not **assert** an elapsed-time threshold."

Two standing assertions keep it there and keep it meaningful:

```
✓ states the boundary this repository now enforces, in the file, as prose 1ms
✓ still parses at least 20 explicit timeouts in total 0ms
```

…plus a live control per permitted backstop, asserted by FILE and by VALUE rather than by line number:

| File | ms | Status |
|---|---|---|
| `client-formula-bounds.test.ts` | 30000 | ✓ present |
| `formula-engine.test.ts` | 10000 | ✓ present |
| `execution/actions/__tests__/transform.test.ts` | 10000 | ✓ present |
| `formula-recalc.test.ts` | 5000 | ✓ present |
| `formula-recalc.test.ts` | 20000 | ✓ present |
| `export/formatters-live.test.ts` | 60000 | ✓ present |

Deleting an elapsed assertion is only correct **because** the backstop beside it remains, so the gate that forbids the assertion also asserts the backstops survive. A future sweep that "removes all the timeouts" turns this red rather than leaving the suite able to hang forever under a green gate.

A complement guards the other direction: `finds no explicit timeout that the boundary statement would call an assertion` fails on any sub-second test/hook timeout, because a backstop tighter than the work it guards is a margin wearing a timeout's clothes — which is exactly what the deleted 15 000 ms assertion was, being tighter than its own test's 30 000 ms.

---

## THIRD-AST-GATE COST — MEASURED, NOT ASSUMED

47-04 asked for this explicitly: *"a third and fourth AST gate would be worth measuring rather than assuming."*

### The `typescript` import does NOT scale with the number of gates

| Run | first import | second import in the same process | same instance |
|---|---|---|---|
| 1 | 525.0 ms | **0.206 ms** | true |
| 2 | 548.8 ms | **0.149 ms** | true |
| 3 | 501.1 ms | **0.173 ms** | true |

`typescript@5.9.3` costs **~525 ms once per worker PROCESS** and ~0.2 ms for every additional gate that imports it in that same process. **The cost is per worker, not per gate.** With `availableParallelism() = 4` on this machine, the whole-suite upper bound for `typescript` module load is ~4 × 525 ms ≈ 2.1 s spread across parallel workers, regardless of whether there are two AST gates or six.

### The PARSE is what scales, and it is now attributed

| Component | Measured (3 runs) |
|---|---|
| `typescript` module load | 502 / 522 / 650 ms |
| walk 177 files | 5.1 / 5.2 / 5.5 ms |
| read all 177 sources | 18.5 / 23.5 / 23.7 ms |
| parse + full AST walk (320 678 nodes) | 769 / 864 / 878 ms |
| **sweep total, excluding the module load** | **798 / 887 / 906 ms** |

So a *third independent sweep* costs roughly **~850 ms of parse work**, paid at module-scope import time — and that, not the `import`, is the number a fourth gate should be judged against.

### Per-file isolated cost

| File | tests | import | tests | total |
|---|---|---|---|---|
| `suite-timing-hygiene.test.ts` (this gate) | 46 | 2.61 s | 55 ms | 2.86 s |
| `suite-hook-hygiene.test.ts` (47-03, AST) | 39 | 2.10 s | 78 ms | 2.44 s |
| `node-engines-floor.test.ts` (static, no AST) | 20 | 0.27 s | 71 ms | 0.60 s |

### Full base-suite wall time, three consecutive runs

| Run | Duration | transform | import (sum) | tests | pass set |
|---|---|---|---|---|---|
| 1 | 58.43 s | 10.25 s | 102.91 s | 19.66 s | 4845 / 32 skipped |
| 2 | 56.39 s | 9.33 s | 99.44 s | 17.56 s | 4845 / 32 skipped |
| 3 | 54.48 s | 9.09 s | 96.10 s | 17.24 s | 4845 / 32 skipped |

Mean **56.4 s**, spread **3.95 s**. 47-04 recorded 52.8 s (after its gate) and 55.8 s (before it). **The third AST gate's ~850 ms of marginal parse work is inside a run-to-run noise band that is itself ~4 s wide**, so it is not distinguishable at the suite level — but it is now a measured quantity rather than an inference from an unmoved total. All three runs produced an identical pass set.

**Recommendation for a fourth gate:** share ONE parse of the corpus across the sweeps rather than starting a fourth independent one. The `import` cost is already amortised by Node's module cache (0.2 ms) and needs no attention; the ~850 ms parse is the term that grows linearly. Two sweeps at ~1.7 s of aggregate parse work is fine; five would be ~4.3 s and would start to show.

---

## FINAL VERIFICATION

| Gate | Result |
|---|---|
| `npm test` — base project | **4845 passed / 32 skipped**, 171 files passed / 2 skipped |
| `npm test` — rsc project | **8 passed (8)** — 8/8 |
| `npm run typecheck` | exit 0, no output |
| `npm run lint` | **0 errors** / 124 warnings — the exact baseline, none from any file touched here |
| `git status --porcelain` | empty |
| `docker compose ps` | 3 services up (`app`, `postgres` healthy, `mailhog`) |

Suite total went 4799 → **4845 passed** (+46, all of them this gate's own tests) with skips unchanged at 32. The two edited files kept their exact test counts, confirming assertions were removed and tests were not.

---

## Decisions Made

1. **The corpus is wider than `npm test`, deliberately and assertedly.** `*.rsc.test.*` and `*.db.test.*` are both in, because the base project's include *glob* matches them and they are removed only by `test.exclude`. A sweep whose corpus silently differs from the project's own glob is a gate about a different tree. Keeping it identical to the sibling hook gate's corpus is a second reason.
2. **The clock-call floor is `Date.now` only, scoped to test files, with the health route as a live control** rather than widening the corpus and adding an exemption. An exemption for a legitimate clock read is indistinguishable from the exemption a real defect would ask for; a live control is not.
3. **The exact-equality boundary is the CONJUNCTION of the two candidate boundaries** — permitted only when the matcher is exact AND the file installs a fake clock. Measured: on this tree that variant and the threshold-only variant produce the identical verdict, so the stricter one is free. Both halves are pinned by fixtures, (a) and (vi), which are complements of each other.
4. **An unrecognised matcher is FLAGGED.** A rule whose default is "ignore" grows a hole every time vitest adds a matcher. Asserted by its own test using `toSatisfy` in a fake-timers file — the worst case, where a permissive default would silently disable the gate.
5. **The rule was implemented to the letter, including its known narrowness.** A delta divided by a constant (`expect(elapsed / 1000)`) is not flagged. That is stated in the header as a deliberate scope boundary with instructions to widen it deliberately if it ever appears, because every widening here is a chance to break a correct assertion in another gate — 47-10's being the concrete case.
6. **The liveness backstops are asserted by file and by VALUE, never by line.** 47-RESEARCH's line numbers for them had already rotted (see Deviation 3); a value-based assertion survives ordinary editing while still failing if the backstop is deleted.
7. **The fixpoint's necessity is proven by ablation, not by inspection.** `scanSource` takes a `maxIterations` cap for that one purpose. "The code contains a loop" is not evidence that the loop matters.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `THRESHOLD_MATCHERS` was declared but never used — a dead constant documenting a rule the code decided some other way**

- **Found during:** Task 1, at the lint check
- **Issue:** the first draft expressed the boundary as `permitted = exact && fakeClock`, which is behaviourally correct but makes `THRESHOLD_MATCHERS` unreachable. `npm run lint` reported a new `no-unused-vars` warning (125 vs the 124 baseline), and — worse than the warning — the header stated a three-way rule that the code decided two-way. A constant that documents a rule without participating in it is the same class of defect as a comment that argues for a deleted assertion: the next reader trusts it and it is not load-bearing.
- **Fix:** introduced `classifyMatcher()` returning `"threshold" | "exact" | "unrecognised"`, reported `matcherClass` on every hit, threaded it into `formatHit`, and changed the KNOWN_POSITIVE fixtures to assert the extracted `line:kind:matcherClass` rather than `line:kind`. Both matcher lists are now values the fixtures can falsify — emptying `THRESHOLD_MATCHERS` turns five positives red. Added a dedicated test for the unrecognised-matcher default, which had no coverage at all.
- **Files modified:** `src/lib/__tests__/suite-timing-hygiene.test.ts`
- **Verification:** lint back to 0 errors / **124** warnings with none from this file; the six positives now pin their classification
- **Committed in:** `fcdde68`

**2. [Rule 2 - Missing Critical] Added two KNOWN_POSITIVE fixtures and three taint-level assertions the plan did not list**

- **Found during:** Task 1
- **Issue:** the plan specified four positives and six negatives. Writing the matcher exposed three gaps. (a) The exact-equality permission had a KNOWN_NEGATIVE but **no complement** — nothing asserted that the *same shape without a fake clock* is still flagged, so "exact equality is permitted" was a hole rather than a boundary. (b) Control C's second-half shape (`expect(b / a)` over two bound deltas) was going to be exercised only once, transiently, in task 3 — with no permanent fixture, so the shape the whole taint pass exists for would have had no standing test. (c) Nothing asserted the taint *state*: a matcher can reach the right verdict by the wrong route, and the addition rule is the single distinction protecting another gate, so it deserved a direct assertion rather than being inferred from six negatives passing.
- **Fix:** added KNOWN_POSITIVE (v) (the bound-delta ratio) and (vi) (exact equality with no fake clock); added `reports the taint chain it followed, not just a verdict` (asserting the exact tainted name and function sets); added `does not taint through an addition, which is the whole discriminating rule` **with its complement**, so a taint pass that propagated nothing cannot satisfy it.
- **Files modified:** `src/lib/__tests__/suite-timing-hygiene.test.ts`
- **Verification:** all twelve fixtures plus the three taint assertions green; (vi) is the assertion that would go red if the fake-clock condition were dropped
- **Committed in:** `fcdde68`

**3. [Rule 1 - Bug] Corrected three rotted `file:line` references in the permitted-backstop list, and one claim that was simply false**

- **Found during:** Task 1, while building the liveness-backstop control
- **Issue:** the plan and 47-RESEARCH §4 list the permitted backstops as `formula-recalc.test.ts:450,470` (5000) and `:1311,1353` (20000), plus *"the two skipped `*-live` files' 60 s `beforeAll` timeouts"*. Measured by AST on this tree: the `formula-recalc.test.ts` timeouts are at **:467, :489** (5000) and **:1350, :1381** (20000) — the file has grown. And **`src/lib/audit/export-events-live.test.ts` has NO explicit timeout at all**; its `beforeAll` at `:47` carries none. The claim that both `*-live` files have 60 s `beforeAll` timeouts is true only of `formatters-live.test.ts:106`. Encoding any of that as written would have produced a control that was either permanently red or asserting something untrue about a file it named.
- **Fix:** the control asserts by FILE and by VALUE rather than by line, which is immune to the growth that rotted the numbers, and `export-events-live.test.ts` is not asserted to have a timeout it does not have. The measured inventory (24 explicit timeouts across six files, including `queries.db.test.ts`'s 60 000 ms `beforeAll`/`afterAll` which the research list omits) is recorded in the constant's doc-comment.
- **Files modified:** `src/lib/__tests__/suite-timing-hygiene.test.ts`
- **Verification:** all six backstop controls green; `MIN_EXPLICIT_TIMEOUTS = 20` against a measured 24
- **Committed in:** `fcdde68`

**4. [Rule 2 - Missing Critical] Added the fixpoint ABLATION control, and the `maxIterations` parameter it needs**

- **Found during:** Task 1
- **Issue:** the plan's acceptance criterion reads *"the taint propagation is a loop to a fixpoint, not a single pass (asserted by the KNOWN_POSITIVE (i) fixture passing, which a single pass cannot)"*. That inference is correct but it is **not asserted by anything**: fixture (i) passing is consistent with a single pass that happens to work for some other reason, and nobody re-deriving it later can check the claim without rewriting the scanner. Given that this phase exists because six gates shipped unable to fail, "the fixpoint matters — trust the parenthetical" was not good enough for the file's single most important mechanism.
- **Fix:** added a `maxIterations` parameter to `scanSource` whose only purpose is ablation, and a test that runs the matcher capped at one pass (asserting the MISS), then uncapped (asserting the extracted find), then asserts the iteration count exceeded one. Marked fixture (i) with `needsFixpoint: true` and had the control select it by that marker, so it cannot silently start testing a different fixture. Measured and recorded: 3 iterations, and only fixture (i) of the six needs more than one.
- **Files modified:** `src/lib/__tests__/suite-timing-hygiene.test.ts`
- **Verification:** the control is green; verified out-of-band that a single pass misses (i) and flags the other five
- **Committed in:** `fcdde68`

**5. [Rule 2 - Missing Critical] Turned the health-route scope decision into a live control instead of a header paragraph**

- **Found during:** Task 1, applying 47-04's `performance.now()` correction
- **Issue:** the plan asked me to state the scope and the exemption in the SUMMARY. Stating it only in prose leaves the `performance.now` branch of the detector proven by a single fixture, and leaves the load-bearing distinction between "reads a clock" and "asserts on a clock delta" as an argument rather than a check. Both are things a future edit can quietly falsify.
- **Fix:** added `excludes non-test source that legitimately reads a clock, and proves the distinction`, which asserts the route is out of the corpus, that the detector still finds >= 2 `performance.now` call sites *in real source*, that the file contains 0 `expect()` calls, and that it yields zero hits. Added `never walks outside src/, and never into .planning/` so the phase's own measurement harnesses are provably unreachable. Added `finds zero performance.now call sites in the corpus, and that is why it is not floored`, which tells a future author to ADD a floor rather than delete an assertion if a test file starts reading that clock again.
- **Files modified:** `src/lib/__tests__/suite-timing-hygiene.test.ts`
- **Verification:** three controls green; the `performance.now` branch is now proven twice, by fixture and against real source
- **Committed in:** `fcdde68`

**6. [Rule 1 - Bug] Updated three floor doc-comments whose measurements went stale within the plan**

- **Found during:** Task 2
- **Issue:** the floors were pinned in task 1 against a 176-file / 8143-`expect()` tree — i.e. before this gate itself entered the corpus, and before the deletions. After both, the tree is 177 files / 8183 `expect()`. The floors themselves were unaffected (150 and 7000), but a recorded measurement that no longer matches the tree is a floor nobody can re-derive — the exact defect 47-04 recorded as its own deviation 4.
- **Fix:** updated the doc-comments and the failure messages to 177 files (174 `.test.ts` + 3 `.test.tsx`) and 8183 `expect()`, keeping the earlier figure and the research figure beside them so the drift is visible rather than overwritten. Confirmed the `Date.now` floor of 25 against the post-deletion measurement of 34.
- **Files modified:** `src/lib/__tests__/suite-timing-hygiene.test.ts`
- **Verification:** `node -e` recount; all floors green
- **Committed in:** `17e56c4`

---

**Total deviations:** 6 auto-fixed (3 bugs, 3 missing-critical anti-vacuity additions)
**Impact on plan:** every one exists to stop this plan shipping the eighth gate that cannot fail. No scope creep — nothing was added outside the three files the plan names, nothing was installed, and no forbidden remediation (`retries`, serial-only marking, raised `hookTimeout`/`testTimeout`) was used or considered.

## Issues Encountered

- **`rtk` hazards, all three confirmed again.** `grep -n "" file | sed -n` produced *empty output with exit 0* — the redirect-elision failure mode — so numbered line reads went through the `Read` tool and every count in this document came from `node -e`. No `wc -l` was used anywhere. `./node_modules/.bin/vitest` was invoked directly throughout rather than through `npm run`, so the red/green interleaving above is in true order.
- **Heredoc file creation was avoided entirely**, per the recorded hazard; the gate and the three measurement harnesses were written with the `Write` tool.
- **No worktree.** This plan ran sequentially in the main tree on `master`, so none of the usual worktree hazards (stale base, missing bootstrap symlinks, the 124-vs-122 lint warning divergence) applied. Lint was gated on **errors (0)**, and the warning total happened to match the master baseline exactly.
- **`npm install` / `npm ci` were not run**, per the hard rule following 47-07's dependency work. `typescript@5.9.3` was already a direct devDependency.

## User Setup Required

None.

## Next Phase Readiness

- **ROADMAP SC-1b is closed and falsifiable.** The suite has zero elapsed-time assertions, the gate enforcing that has been observed red on both the inline delta and the bound-variable ratio, and the v1 failure mode is reproduced with a measured 0-vs-1 on real code.
- **Negative control C's timing half is delivered.** 47-03 delivered its hook half; control C is now complete. Controls A and B are 47-04's, delivered. **D and E remain** — D belongs to 47-10's `audit-policy.test.ts`, E to the required GitHub `ci` check.
- **47-10 can proceed without a collision.** Its expiry assertion is already a passing KNOWN_NEGATIVE fixture here, and the addition rule that keeps it green is asserted directly at the taint level, not merely implied by the fixture. **When writing that gate, keep the assertion in the `expect(new Date(x).getTime()).toBeGreaterThan(Date.now())` shape.** A rewrite into `expect(new Date(x).getTime() - Date.now()).toBeGreaterThan(0)` WOULD be flagged by this gate — correctly, since that is a clock delta against a threshold — and fixture (d) is what documents the safe form.
- **For any future AST gate:** the `import` is free after the first one in a worker (0.2 ms), the ~850 ms corpus parse is not. A fourth gate should share one parse rather than starting another sweep.
- **Untouched, deliberately:** `http.test.ts` (verified by empty diff), `condition-evaluator.test.ts` (47-04's), `toggle.test.ts` / `recursion.test.ts` (47-03's).
- **Measurement harnesses** are at `.planning/phases/47-suite-trust-supply-chain/measure/` (`proto-timing-taint.mjs`, `proto-fixtures.mjs`, `typescript-load-cost.mjs`, `sweep-cost.mjs`). Untracked and gitignored, kept as reproducible evidence beside 47-02's `ratio-under-load.mjs`.

## Self-Check: PASSED

- `src/lib/__tests__/suite-timing-hygiene.test.ts` — FOUND (66 026 bytes, 1326 lines, above the plan's `min_lines: 250`)
- `src/components/custom-fields/__tests__/client-formula-bounds.test.ts` — FOUND, modified
- `src/lib/formula-engine.test.ts` — FOUND, modified
- `.planning/phases/47-suite-trust-supply-chain/47-05-SUMMARY.md` — FOUND
- commit `fcdde68` — FOUND in `git log --oneline --all`
- commit `17e56c4` — FOUND in `git log --oneline --all`
- `git status --porcelain` — empty before this summary commit; no negative-control body committed

Artifact contract from the plan's frontmatter, verified: `from "typescript"` present (1 occurrence); `ts.createSourceFile` called (4 occurrences); `shouldAdvanceTime` present in KNOWN_NEGATIVE fixture (a); ZERO path-based test-file exclusions (`EXCLUDED_PATHS` is `[]`, containing 0 `.test.ts` literals); the boundary statement present in the header and asserted present.

**STATE.md and ROADMAP.md are updated by this plan's own run** (sequential execution, no wave orchestrator): plan counter advanced to 06, progress recalculated to 12/19 (63%), the 47-05 metric recorded, three decisions added, and `roadmap.update-plan-progress 47` run (13 plans / 6 SUMMARYs, In Progress).

**REQUIREMENTS.md was deliberately NOT changed. `QG-01` stays Pending.** SC-2 (47-04) and SC-1b (47-05) are closed, but SC-1's AFTER margin belongs to 47-06 and SEC-05 to 47-08 onwards. This plan's frontmatter lists `requirements-completed: [QG-01]` because that is the requirement it advances; checking the box would be a false claim about the phase, and this milestone exists to delete claims of exactly that kind.

---
*Phase: 47-suite-trust-supply-chain*
*Completed: 2026-08-25*
