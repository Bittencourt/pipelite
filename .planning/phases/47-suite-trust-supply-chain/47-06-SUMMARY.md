---
phase: 47-suite-trust-supply-chain
plan: 06
subsystem: testing
tags: [sc-1, margin-measurement, cpu-oversubscription, before-after-pair, counted-operations, determinism, pass-set-diff, regression-guard]

# Dependency graph
requires:
  - phase: 47-suite-trust-supply-chain
    provides: "47-02's committed load-induction instrument (measure/spin.mjs, run-under-load.sh, extract-margins.mjs, ratio-with-load.sh) and the BEFORE margin record it produced on this machine — the AFTER half had to come from the same files, not an equivalent probe"
  - phase: 47-suite-trust-supply-chain
    provides: "47-03's hoisting of the toggle and recursion hook imports — the two subjects whose margin this plan measures"
  - phase: 47-suite-trust-supply-chain
    provides: "47-04's counted-operations replacement for the elapsed-ratio assertion, including the recorded integer 23 730 at n=500"
  - phase: 47-suite-trust-supply-chain
    provides: "47-05's SC-1b timing-hygiene gate and the removal of the last two elapsed-time assertions"
provides:
  - "the phase's AFTER margin record at a measured 2.50x-9.00x oversubscription (runnable medians 3.75x and 4.25x): toggle 0.2-0.7% of hookTimeout, recursion 0.0-0.4%, against 33.4-49.6% and 27.3-35.3% BEFORE"
  - "the linearity row closed as a CATEGORY CHANGE, evidenced by the BEFORE instrument's own FATAL rather than by a smaller ratio"
  - "the counted aggregate proven load-invariant: 400 repeats under load, ONE distinct integer (23 730), against the deleted ratio's 11.44-55.85 spread at the same load"
  - "the post-fix ten-run pass-set record (10/10 IDENTICAL, 4853 identities) with its +106 delta against 47-02 accounted for exactly, and explicitly labelled a regression guard"
  - "D-47-06-A — the module-import-cost defect is still live in ~146 test BODIES against HALF the budget; four assertions in three files observed timing out"
  - "measure/extract-margins.mjs repaired and extended: the stale linearity probe repointed at the counted replacement, plus the three test-body subjects, floor re-proven red"
affects: [47-09, 47-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "a before/after pair is only a measurement if both halves come from the same committed instrument; when the instrument's own floor FATALs because the subject was deleted, that FATAL is the finding, not an obstacle to route around"
    - "state an induced load as a SAMPLED runnable count from /proc/loadavg field 4 divided by cores, never as spinners/availableParallelism — the runner brings its own workers"
    - "when a timing assertion is replaced by a counted one, measure BOTH at the same load: the improvement is the deleted quantity's residual spread next to the counter's zero spread"
    - "a gate whose corpus is narrower than the defect class leaves the remainder ungated; measure the population the gate does not cover before calling the class closed"

key-files:
  created: []
  modified:
    - .planning/phases/47-suite-trust-supply-chain/measure/extract-margins.mjs
    - .planning/phases/47-suite-trust-supply-chain/deferred-items.md

decisions:
  - "Recorded the BEFORE instrument's FATAL verbatim BEFORE repairing it, so the linearity row's evidence is the tool refusing to measure a deleted assertion rather than a number chosen by hand"
  - "Did NOT fix the three timing out test-body imports this plan discovered — editing the tree mid-measurement would invalidate the pair the plan exists to produce. Logged as D-47-06-A instead"
  - "Corrected the plan's own expectation rather than restating it: ~7x load WAS reproducible on this machine (peaks 7.75x and 9.00x) and real timeouts DID occur, so the honest limitation is the opposite of the one the plan predicted"

metrics:
  duration: 51m
  completed: 2026-08-25
---

# Phase 47 Plan 06: SC-1 AFTER Margin Measurement Summary

**The margin moved by two orders of magnitude on the two assertions the phase fixed, and the phase's
central claim about them is now safe — but the same measurement found the identical defect alive in
~146 test bodies against half the budget, and produced the first RED `npm test` runs anyone has
observed on the fixed tree.**

Both halves of that sentence come from the same six under-load base reports, produced by 47-02's
committed instrument re-run unchanged.

---

## 1. The load that was actually induced, as a computed number

Same machine, same instrument, same spinner count (8) as 47-02. The multiplier is **sampled
`/proc/loadavg` field 4 (runnable) divided by `availableParallelism()`**, not
`spinners / availableParallelism`, which reads a flat 2.00x and is the wrong number because vitest
contributes its own workers.

| figure | 47-02 run A | 47-02 run B | **47-06 run A** | **47-06 run B** |
|---|---|---|---|---|
| `availableParallelism()` | 4 | 4 | 4 | 4 |
| spinners | 8 | 8 | 8 | 8 |
| `spinners / cores` (understatement) | 2.00x | 2.00x | 2.00x | 2.00x |
| 1-min loadavg / cores, steady state | 2.70x-3.95x, med 3.46x | 2.65x-3.56x, med 3.26x | 1.91x-5.09x, med **4.00x** | 1.91x-5.53x, med **4.19x** |
| **runnable / cores (authoritative)** | 2.50x-5.75x, med **3.50x** | 3.00x-5.75x, med **3.50x** | **2.50x-9.00x, med 3.75x** | **2.75x-7.75x, med 4.25x** |
| load samples taken | — | — | 73 | 91 |
| base-run wall time | 171-179 s | 158-163 s | **223 / 229 / 255 s** | **279 / 360 / 246 s** |
| idle base-run wall time, same tree | 52.4-58.6 s | — | **56.9-62.4 s** (n=10) | — |
| wall-time inflation vs idle | ≈3.1x | ≈3.0x | **≈3.9x** | **≈4.9x** |

**The >=3x floor was cleared with room to spare, and the AFTER load was HARSHER than the BEFORE
load** — median 3.75x/4.25x against 3.50x/3.50x, and wall-time inflation 3.9x/4.9x against
3.1x/3.0x. That direction matters: every AFTER margin below is therefore a conservative figure
against its BEFORE counterpart, not a flattered one.

Independent corroboration of the multiplier, exactly as 47-02 used it: idle base-run wall time
56.9-62.4 s (n=10, and within 47-02's 52.4-58.6 s band) against 223-360 s loaded.

**One ambient-load caveat, stated rather than buried.** A first idle control run taken before the
measurement clocked **84.4 s** rather than ~58 s, because an unrelated user process (`julia`, ~89% of
one core) was running. It had exited by the time the ten-run and the under-load runs were taken; the
ten idle iterations at 56.9-62.4 s are the figure used above and are the ones comparable to 47-02.
The 84.4 s reading is reported here only so it is not mistaken for the idle baseline.

### Zero load generators survived

Counted by walking `/proc/*/cmdline` for an **exact** match — the fix 47-02 inherited after
`pgrep -fc` reported 2 phantom survivors on an idle machine by matching its own caller's command line:

```
-> trap fired: 8 spinners signalled; surviving spinner processes = 0        (run A)
-> trap fired: 8 spinners signalled; surviving spinner processes = 0        (run B)
-> trap fired: 11 spinners signalled; surviving spinner processes = 0       (determinism probe)
-> trap fired: 11 spinners signalled; surviving spinner processes = 0       (ratio probe)
```

Final check after all work, both an exact match and a looser `spin.mjs$` sweep:

```
exact target: node /home/pedro/programming/pipelite/.planning/phases/47-suite-trust-supply-chain/measure/spin.mjs
surviving spinner processes = 0
any spin.mjs processes = 0
```

---

## 2. The comparison table the plan asked for, filled in

Every AFTER figure comes from `measure/extract-margins.mjs` reading
`assertionResults[].duration` out of the same reports. Budgets are vitest's defaults, in force
because `vitest.config.ts` overrides neither: **hookTimeout 10 000 ms, testTimeout 5 000 ms.**

| Metric | BEFORE (47-02, at a measured >=3x) | AFTER (47-06, same instrument, harsher load) |
|---|---|---|
| linearity assertion margin | ratio max **63.92** / 80 threshold = **79.9% of budget** | **THE ASSERTION NO LONGER EXISTS.** Not a smaller ratio — a category change. See §3. |
| `toggle` first test (the `beforeEach`) | 3336 / 3621 / **4958 ms** = 33.4% / 36.2% / **49.6%** | **17.7 / 23.4 / 61.7 ms** = 0.2% / 0.2% / **0.6%** (run A); **15.6 / 44.8 / 74.7 ms** = 0.2% / 0.4% / **0.7%** (run B) |
| `recursion` first test of the depth describe | 2730 / 3240 / **3530 ms** = 27.3% / 32.4% / **35.3%** | **2.6 / 11.4 / 37.2 ms** = 0.0% / 0.1% / **0.4%** (run A); **2.1 / 12.5 / 14.9 ms** = 0.0% / 0.1% / **0.1%** (run B) |
| assertions over an elapsed-time expression | 3 live (47-RESEARCH §4) | **0**, from the gate, hit list `[]` |
| dynamic imports inside lifecycle hooks | 6 in scope (13 total) | **0** outside the two documented carve-outs, from the gate, hit list `[]` |
| ten-run pass-set diff | 10/10 IDENTICAL (already green — not evidence) | **10/10 IDENTICAL**, 4853 identities. Still not evidence. §5. |

### Per-assertion detail, all three load conditions

`toggle.test.ts` — `returns error when not authenticated`, budget **hookTimeout 10 000 ms**:

| condition | n | min | median | max | % of budget (min/med/**max**) | worst-case margin |
|---|---|---|---|---|---|---|
| BEFORE, >=3x (47-02) | 6 | 3336 ms | 3621 ms | **4958 ms** | 33.4% / 36.2% / **49.6%** | 2.02x |
| AFTER, idle | 10 | 3.6 ms | 5.6 ms | **7.4 ms** | 0.0% / 0.1% / **0.1%** | **1342.94x** |
| AFTER, run A (med 3.75x) | 3 | 17.7 ms | 23.4 ms | **61.7 ms** | 0.2% / 0.2% / **0.6%** | **162.20x** |
| AFTER, run B (med 4.25x) | 3 | 15.6 ms | 44.8 ms | **74.7 ms** | 0.2% / 0.4% / **0.7%** | **133.84x** |

`recursion.test.ts` — `creates a run with depth < 5 successfully`, budget **hookTimeout 10 000 ms**:

| condition | n | min | median | max | % of budget (min/med/**max**) | worst-case margin |
|---|---|---|---|---|---|---|
| BEFORE, >=3x (47-02) | 6 | 2730 ms | 3240 ms | **3530 ms** | 27.3% / 32.4% / **35.3%** | 2.83x |
| AFTER, idle | 10 | 1.4 ms | 2.1 ms | **11.8 ms** | 0.0% / 0.0% / **0.1%** | **844.99x** |
| AFTER, run A (med 3.75x) | 3 | 2.6 ms | 11.4 ms | **37.2 ms** | 0.0% / 0.1% / **0.4%** | **268.94x** |
| AFTER, run B (med 4.25x) | 3 | 2.1 ms | 12.5 ms | **14.9 ms** | 0.0% / 0.1% / **0.1%** | **669.02x** |

Raw values, ms, in report order:

```
toggle    run A: 17.746, 23.409, 61.651   run B: 15.572, 74.719, 44.756
recursion run A:  2.561, 11.386, 37.183   run B: 14.947, 12.450,  2.069
```

**Both are a small, stated fraction of budget: the worst single observation across six loaded base
runs is 0.7% for `toggle` and 0.4% for `recursion`.** Worst-case margin went 2.02x -> 133.84x and
2.83x -> 268.94x. Neither figure needed rounding away, and neither failed to improve.

The replacement assertions' own cost, for completeness — these are COUNTED assertions, so their
duration is cost, never the property being asserted:

| assertion (budget testTimeout 5000 ms) | idle max | run A max | run B max | worst % of budget |
|---|---|---|---|---|
| `DETERMINISM: 20 repeats give exactly ONE integer` | 278.1 ms | 443.1 ms | 821.2 ms | **16.4%** |
| `FLATNESS: ops per character does not grow across a 16x input span` | 330.7 ms | 370.7 ms | 753.7 ms | **15.1%** |

All seven counted/structural assertions in the replacement describe passed in **all six** loaded base
runs:

```
PASS n=6  min=  5.5ms med= 13.5ms max= 37.5ms | the counted set is the pathological set, minus the input that is correctly rejected
PASS n=6  min= 60.9ms med=174.1ms max=198.0ms | FLOOR: reads at least 1 counted character per input character
PASS n=6  min= 17.6ms med= 81.0ms max=339.7ms | CEILING: reads at most 6 counted characters per input character
PASS n=6  min= 74.9ms med=335.4ms max=753.7ms | FLATNESS: ops per character does not grow across a 16x input span
PASS n=6  min=  0.6ms med=  0.7ms max=  6.2ms | EARLY REJECTION: the quote storm costs a constant, independent of n
PASS n=6  min=309.7ms med=652.8ms max=821.2ms | DETERMINISM: 20 repeats give exactly ONE integer
PASS n=6  min= 43.2ms med=105.8ms max=148.4ms | COERCIONS: the parser never coerces the path to a primitive
```

---

## 3. The linearity row is a category change, and the BEFORE instrument proved it

**No ratio is printed for it, because the assertion it belonged to was deleted.** 47-04 replaced
`condition-evaluator.test.ts`'s elapsed-RATIO assertion with counted operations. Reporting a smaller
ratio would be reporting a margin for something that no longer decides anything.

The evidence for that row is not prose. It is 47-02's own instrument, re-run **unchanged**, refusing
to produce a measurement — its FLOOR ("a probe that matches nothing is an extraction failure, not a
clean measurement") firing on the deleted subject in all six loaded base reports and all ten idle
ones:

```
FATAL: run-01-base.json: probe "condition-evaluator.test.ts linearity assertion" matched nothing — the extraction proves nothing
FATAL: run-02-base.json: probe "condition-evaluator.test.ts linearity assertion" matched nothing — the extraction proves nothing
FATAL: run-03-base.json: probe "condition-evaluator.test.ts linearity assertion" matched nothing — the extraction proves nothing
FATAL: 3 probe extraction failure(s) — this is not a measurement
EXIT=1
```

The same run still printed the `toggle` and `recursion` margins, so nothing was lost by letting it
fail: the instrument reported what exists and refused to invent what does not.

### The category change, measured on both sides at the same load

The strong claim is not "the number got smaller". It is that a **load-sensitive continuous quantity
was replaced by a load-invariant integer**. Both sides were measured, at the same induced load, with
the committed probes:

| | the DELETED elapsed ratio (`measure/ratio-with-load.sh`, 11 spinners, runnable med **3.50x**) | the counted aggregate that replaced it (`n=500`, 20 repeats x 20 invocations, 11 spinners, runnable **3.25x-5.75x**) |
|---|---|---|
| repetitions of identical work | 10 | **400** |
| distinct values observed | **10 of 10** | **1 of 400** |
| range | **11.44 — 55.85** (a **4.88x spread**) | **23 730 — 23 730** (spread **0**) |
| median | 49.55 | 23 730 |
| worst-case margin vs its bound | **1.43x** (69.8% of the 80 threshold consumed) | **not applicable — the value cannot move** |

The deleted assertion's quantity, still drifting under load on the fixed tree:

```
rep  1  small=2.105ms  large=24.086ms  ratio=11.44  PASS (< 80)
rep  2  small=1.483ms  large=64.692ms  ratio=43.62  PASS (< 80)
rep  3  small=1.303ms  large=70.004ms  ratio=53.71  PASS (< 80)
rep  4  small=1.235ms  large=61.318ms  ratio=49.63  PASS (< 80)
rep  5  small=1.230ms  large=53.691ms  ratio=43.64  PASS (< 80)
rep  6  small=1.294ms  large=64.002ms  ratio=49.46  PASS (< 80)
rep  7  small=1.231ms  large=64.166ms  ratio=52.13  PASS (< 80)
rep  8  small=1.339ms  large=60.354ms  ratio=45.07  PASS (< 80)
rep  9  small=1.255ms  large=70.108ms  ratio=55.85  PASS (< 80)
rep 10  small=1.224ms  large=61.097ms  ratio=49.92  PASS (< 80)

UNDER 11 SPINNERS on 4 cores: reps=10  min=11.44  median=49.55  max=55.85  worst-margin=1.43x  budget-consumed=69.8%  failures=0/10
```

**This is the sentence SC-1 is closed with.** The ratio is still consuming ~70% of the threshold it
used to be compared against, and still varying 4.88x across ten runs of identical work — on the
FIXED tree, at 3.50x. Nothing about the machine got better. What changed is that no assertion reads
that quantity any more.

### The counted aggregate under load: ONE integer, and it is 47-04's integer

**Primary instrument** (the committed assertion): `DETERMINISM: 20 repeats give exactly ONE integer`
passed in all six loaded base runs — **120 repeats under load, one distinct integer per run**.
That assertion fails if `distinct.size !== 1`, so a pass is the measurement.

**Corroborating** (to make the integer itself visible, since the committed assertion prints its
counts only on failure): a probe importing the real exported `tokenizeFieldPath` through the same
counting facade, run 20 times under 11 spinners:

```
invocations: 20   repeats each: 20  => total repeats: 400
DISTINCT INTEGERS across ALL invocations: 1 -> 23730
runnable during probe: 13-23 of 4 cores = 3.25x - 5.75x, median 3.25x
-> trap fired: 11 spinners signalled; surviving spinner processes = 0
```

Per invocation, without exception: `counted characters 23730`, `ops per input char 1.5238`,
`coercions 0`, `DISTINCT INTEGERS 1`.

**The distinct-value count across 20 repeats under load is `1`.** The integer is **23 730** — bit for
bit the value 47-04 recorded at `DETERMINISM_N = 500`, and `1.5238` ops/char against 47-04's measured
`1.5238` at the same n (its `1.518` figure is the n=2000 aggregate). The probe carries its own floor:
it exits 1 if the counting seam reads zero characters, so "one distinct integer" cannot be the vacuous
constant 0.

---

## 4. SC-1b's structural rows, from the gates rather than from prose

```
 ✓ src/lib/__tests__/suite-hook-hygiene.test.ts (39 tests) 477ms
 ✓ src/lib/__tests__/suite-timing-hygiene.test.ts (46 tests) 111ms
 Test Files  2 passed (2)
      Tests  85 passed (85)
```

| structural row | count | the assertion that produced it |
|---|---|---|
| assertions over a clock-derived elapsed delta or ratio | **0** | `suite-timing-hygiene.test.ts` > `no test asserts on a clock-derived elapsed delta or ratio (SC-1b)` > `finds no elapsed-time assertion anywhere in the corpus` — plus `applies an empty exclusion list, and the emptiness is the assertion` |
| hook-scoped dynamic `import()` outside the two carve-outs | **0** | `suite-hook-hygiene.test.ts` > `no lifecycle hook performs a dynamic import()` > `finds no hook-scoped import() outside the two documented carve-outs` |

Both hit lists are empty, and both gates floor what they count so an empty hit list cannot come from
a broken scan:

- timing gate: `enumerates at least 150 test files under src/`, `parses at least 7000 expect() call
  expressions`, `still finds at least 25 Date.now call sites — the token floor`, and
  `finds zero performance.now call sites in the corpus, and that is why it is not floored`.
- hook gate: `enumerates at least 150 test files under src/`, `parses at least 140 lifecycle-hook call
  expressions`, `accounts for at least 4 suppressed hook imports in total`, and both carve-out lists
  asserted still-necessary and disjoint.

Both gates also sweep themselves and assert they parse to zero hooks / zero clock calls, which is what
proves their own fixtures are strings rather than live code.

---

## 5. The ten-run pass-set guard — a REGRESSION GUARD, NOT THE EVIDENCE

Run at idle on the unmodified tree. `bash scripts/suite-repeatability.sh 10 /tmp/p47-06/ten` then
`node scripts/diff-pass-sets.mjs /tmp/p47-06/ten`.

| run | base passed | base failed | base skipped | rsc | base wall | verdict |
|---|---|---|---|---|---|---|
| 01 | 4845 | 0 | 32 | 8/8 | 57.224 s | GREEN |
| 02 | 4845 | 0 | 32 | 8/8 | 58.366 s | GREEN |
| 03 | 4845 | 0 | 32 | 8/8 | 57.852 s | GREEN |
| 04 | 4845 | 0 | 32 | 8/8 | 57.918 s | GREEN |
| 05 | 4845 | 0 | 32 | 8/8 | 60.472 s | GREEN |
| 06 | 4845 | 0 | 32 | 8/8 | 57.312 s | GREEN |
| 07 | 4845 | 0 | 32 | 8/8 | 56.903 s | GREEN |
| 08 | 4845 | 0 | 32 | 8/8 | 58.942 s | GREEN |
| 09 | 4845 | 0 | 32 | 8/8 | 57.923 s | GREEN |
| 10 | 4845 | 0 | 32 | 8/8 | 62.420 s | GREEN |

Differ verdict:

```
PASS-SET DIFF vs run 01 (base + rsc unioned)
  run 02: IDENTICAL (4853 tests)   ...   run 10: IDENTICAL (4853 tests)

ANTI-VACUITY FLOORS
  iterations           = 10 (floor 2) PASS
  reference pass set   = 4853 (floor 4000) PASS

OK: all 10 iterations produced the SAME pass set (4853 identities, 4853 passing).
OK: reminder — this is a cheap regression guard, NOT the evidence for SC-1. The same check was 16/16
    green on the unfixed tree; the evidence is the margin each timing-sensitive assertion leaves
    against its budget under induced load.
```

### The +106 pass-set delta, accounted for exactly

47-02's BEFORE reference was **4747** identities (4739 base + 8 rsc). This plan's is **4853**
(4845 base + 8 rsc). The delta is **+106**, and it reconciles to zero:

| source | tests | plan |
|---|---|---|
| `src/lib/__tests__/suite-hook-hygiene.test.ts` (new file) | **+39** | 47-03 |
| `src/lib/__tests__/suite-timing-hygiene.test.ts` (new file) | **+46** | 47-05 |
| `src/lib/execution/condition-evaluator.test.ts`, net | **+21** | 47-04 |
| **total** | **+106** | |

The condition-evaluator figure is a net: `it(` sites went **52 -> 73** between `c1fe056` (47-02's
final commit) and HEAD — the counted describe and the AST structural describe added, the elapsed-ratio
test removed. `4747 + 39 + 46 + 21 = 4853`, exactly. **No unexplained rise (which would be a
measurement error) and no unexplained drop (which would be a regression).** 47-05 removed two
elapsed-time *assertions* but no *tests*, consistent with a zero contribution here.

### Stated in as many words, because the criterion requires it

**This ten-run check is NOT the evidence for SC-1, and it never was.** It was already green before
any work on this phase began — 16/16 identical pass sets in research on the UNFIXED tree (10 idle,
3 at 2x, 3 at 3x), and 10/10 in 47-02, also unfixed. A check that is green before and after a fix
discriminates nothing. ROADMAP SC-1 was amended for exactly this reason, and keeping the original
wording would have shipped a seventh vacuous gate inside the phase built to delete them. It is
retained because it is cheap and would catch a gross regression. **The evidence is §2's margin table
and §3's category change.**

This plan produced the sharpest demonstration of that available: **the ten-run guard was 10/10
IDENTICAL on the very tree that goes RED at 3x oversubscription** (§6). Idle repeatability and
loaded correctness are different properties, and only one of them was ever being measured.

### The differ's floor, re-proven red

The floor was observed red in 47-02; a floor that stopped working between plans is precisely the
failure mode this phase exists to catch, so it was re-run. `run-01-base.json` was truncated to one
assertion per file in a **copy** of the report directory (the evidence set was not touched):

```
truncated reference to 173 assertions, 171 passing

ANTI-VACUITY FLOORS
  iterations           = 10 (floor 2) PASS
  reference pass set   = 179 (floor 4000) FAIL

FATAL: run 02 passed a DIFFERENT set of tests than run 01 — 0 missing, 4674 extra
   ... (runs 03-10 identical form) ...
FATAL: MIN_REFERENCE_PASS_SET floor violated: reference run 01 has only 179 passing tests, below the
       floor of 4000 (measured 4747 = 4739 base + 8 rsc). Every verdict above was computed against a
       reference that is not the full suite, so IDENTICAL would mean the runs agree about a fragment.
FATAL: this pass-set comparison does NOT certify the suite (10 problem(s) above). Note that vitest's
       own exit codes are deliberately not what this verdict is based on — a truncated report exits 0
       and compares equal to another truncated report.
TRUNCATED_EXIT=1
```

**Exit 1, as required.** Note the differ reported *both* problems — the diff and the floor — rather
than letting the floor be the only signal.

---

## 6. THE FINDING: the defect class is not closed, and the suite goes RED at 3x

**This is the most important thing this plan produced, and it is not good news.** It is recorded here
in full and as `D-47-06-A` in `deferred-items.md`.

Three of the six loaded base runs were **RED**:

```
run A  run=01 base wall=223.027s success=false passed=4844 failed=1  RED
run A  run=02 base wall=229.108s success=true  passed=4845 failed=0  GREEN
run A  run=03 base wall=254.918s success=true  passed=4845 failed=0  GREEN
run B  run=01 base wall=279.493s success=false passed=4843 failed=2  RED
run B  run=02 base wall=359.583s success=false passed=4841 failed=4  RED
run B  run=03 base wall=245.745s success=true  passed=4845 failed=0  GREEN
```

Four distinct assertions failed, all timeout-shaped against **testTimeout 5000 ms**, and **none of
them is one of the two assertions this phase fixed**:

| file :: assertion | reds | max observed | % of testTimeout 5000 ms |
|---|---|---|---|
| `src/app/api/health/__tests__/route.test.ts` :: `empty registry returns 503 with all ten workers present and dead …` | 2 | **9339 ms** | **186.8%** |
| `src/app/workflows/__tests__/replay-carries-dry-run.test.ts` :: `replaying a run whose dryRun is true …` | 3 | **5934 ms** | **118.7%** |
| `src/lib/execution/engine.test.ts` :: `walks a linear 3-node graph and completes the run` | 1 | **5782 ms** | **115.6%** |
| `src/app/workflows/__tests__/replay-carries-dry-run.test.ts` :: `still selects the dry_run column …` | 1 | **6897 ms** | **137.9%** |

Their full margin curve, now probed by the repaired instrument:

| subject (budget testTimeout 5000 ms) | idle max | run A max | run B max | worst % of budget | worst margin |
|---|---|---|---|---|---|
| `replay-carries-dry-run` first test | 1699 ms (34.0%) | 5111 ms (102.2%) | **5934 ms (118.7%)** | **118.7%** | **0.84x** |
| health `route.test.ts` first importing test | 918 ms (18.4%) | 2617 ms (52.3%) | **9339 ms (186.8%)** | **186.8%** | **0.54x** |
| `engine.test.ts` first test | 1149 ms (23.0%) | 2126 ms (42.5%) | **5782 ms (115.6%)** | **115.6%** | **0.86x** |

**The mechanism is the one 47-03 diagnosed, in a place 47-03's gate does not look.** 47-03 hoisted
the dynamic imports out of the two lifecycle **hooks** in scope, and `suite-hook-hygiene.test.ts` now
holds that population at zero. That gate is green and it is not vacuous — but **its corpus is
lifecycle hooks only.** The same first-import-pays-module-load pattern lives in test **bodies**:

```
test files scanned                     177
files containing `await import(`         22   (11 sites are string fixtures inside the gate itself)
total `await import(` sites             157   (~146 real)
```

- `src/app/workflows/__tests__/replay-carries-dry-run.test.ts:97` — `await import("../actions")` in
  the first test body. `vi.mock` already hoists above imports, so 47-03's static-import fix applies
  unchanged.
- `src/lib/execution/engine.test.ts:215` — `await import("./engine")` in the first test body; 30
  sites in that file.
- `src/app/api/health/__tests__/route.test.ts:67` — a module-scope helper returning
  `await import("@/app/api/health/route")`, called from the test bodies.

**A hook import is billed against hookTimeout 10 000 ms. A test-body import is billed against
testTimeout 5 000 ms.** The population that was not covered therefore sits against **half the
budget**, which makes it strictly *more* fragile than the population that was fixed. Even at idle,
`replay-carries-dry-run`'s first test consumes 23.1-34.0% of its budget, against `toggle`'s 0.1%.

**Not fixed here, deliberately.** This plan is the AFTER half of a before/after pair; its plan
specifies `files_modified: []`. Editing the tree mid-measurement would have invalidated the
comparison the plan exists to produce, and would have replaced a measured finding with an unmeasured
change. `D-47-06-A` names the three-part fix (hoist, extend the gate's corpus from hooks to bodies,
re-measure) and records that the gate extension cannot simply forbid all test-body `await import(` —
21 files use it legitimately with `vi.resetModules()` / `vi.doMock`.

---

## 7. The honest limitation — and a correction to the one the plan predicted

The plan required this section to state that **~7x load was not reproducible on this machine, so the
evidence is a margin curve at 3x plus a category change, not an observed timeout that stopped
happening.**

**That is not what happened, and restating it would be false.** The measurement is reported as taken:

- **~7x WAS reached.** Sampled runnable peaks were **9.00x** (run A) and **7.75x** (run B) — above the
  ~7x the plan named as the level at which real timeouts appear, and the level attributed to the
  multi-worktree executor environment that bit Phases 44 and 45. This machine produced it because its
  ambient load ran higher than 47-02's, not because more spinners were used (8, as in 47-02).
- **Real timeouts DID occur** — four distinct assertions, three RED base runs (§6).
- **None of them was `toggle.test.ts` or `recursion.test.ts`.** At the load level that used to put
  `toggle`'s hook at 49.6% of budget, it now sits at **0.7%**, while three previously unexamined
  first-tests blew through a budget half the size.

So the evidence for the two fixed subjects is **stronger** than the plan hoped for: not merely a
margin curve at 3x, but a margin curve through 7.75x-9.00x at which other assertions in the same runs
demonstrably timed out while these two did not come within two orders of magnitude of their budget.
The `~7x` figure is corroborated rather than assumed.

**What genuinely remains unproven, stated plainly:**

1. **No BEFORE timeout was observed to stop happening.** 47-02 got 0 timeouts in 16 runs on the
   unfixed tree, so there was never a reproducible red for the fix to eliminate. The BEFORE/AFTER
   claim is about margin (49.6% -> 0.7%) and about category (a drifting ratio -> a fixed integer),
   never about a red turning green. The Phase 44/45 failures remain historical reports, not
   reproductions.
2. **The load was not held constant within a run.** Runnable spanned 2.50x-9.00x, so the min/median/max
   columns mix load levels. This inflates the *max* column, which is the conservative direction, and
   is why the sampled distribution is published alongside every figure rather than a single number.
3. **n is 3 per loaded run.** Six loaded base runs total. Adequate for a two-orders-of-magnitude
   effect; not adequate for anything subtle.
4. **`npm test` is not green under load on this tree.** SC-1's margin criterion is met for the two
   assertions in scope. The suite as a whole is not trustworthy at 3x, for the reason in §6. Anyone
   citing this SUMMARY as "the suite is now reliable under load" is citing it wrongly.
5. **The out-of-scope `auth.setup.ts` flake cannot explain any of the above.** It belongs to
   Playwright (`npm run test:e2e`), which `npm test` never invokes. It is not a candidate explanation
   for any anomaly in these reports.

---

## 8. Verification

| check | result |
|---|---|
| `npm test` (both projects) | **4845 passed / 32 skipped**, RSC **8/8** — matches the stated baseline |
| `npm run typecheck` | **exit 0**, no output |
| `npm run lint` | **0 errors** / 124 warnings — gated on errors, matching the baseline warning count |
| plan's task-1 automated verify (5 files) | **194 passed** across 5 files |
| both structural gates | **85 passed**, hit lists `[]` |
| ten-run pass-set diff | **10/10 IDENTICAL**, 4853 identities, both floors PASS |
| truncated-reference control | **exit 1**, floor violated as required |
| repaired instrument's own floor | **exit 1** when a probe title is broken on purpose |
| spinner survivors, exact `/proc/*/cmdline` match | **0** (and 0 for any `spin.mjs`) |
| `git status --porcelain` | empty before every commit |

The task-2 automated verify assertion also passed against the ten-run reports: 20 JSON reports
(10 iterations x 2 projects), all `success: true`, smallest `numPassedTests` = 8 (the RSC project).

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 47-04 left the committed BEFORE instrument pointing at an assertion it had deleted**

- **Found during:** Task 1, on the first run of `measure/extract-margins.mjs`.
- **Issue:** `extract-margins.mjs`'s own header states: *"If 47-04 renames the linearity test, update
  the title here in the SAME commit — a silently unmatched probe is exactly the vacuous-gate shape
  this phase exists to delete."* 47-04 replaced the elapsed-ratio assertion and did not update the
  probe. The instrument therefore exited 1 on every report directory, permanently.
- **Why it is a bug and not a finding to leave alone:** the FATAL text reads *"the extraction proves
  nothing"*, which is wrong in the AFTER world — the assertion is gone by design. A future re-run
  (47-13, or a verifier) would read a designed deletion as a broken measurement.
- **Fix, in this order, so no evidence was lost:** (a) ran the instrument UNCHANGED and recorded its
  FATAL verbatim as the linearity row's evidence (§3); (b) only then repointed the probe at the two
  most expensive members of 47-04's counted describe, `DETERMINISM` and `FLATNESS`; (c) recorded the
  deletion, the verbatim FATAL and the never-print-a-ratio-again rule as a comment block in the file;
  (d) re-proved the floor red by breaking a probe title on purpose.
- **Files modified:** `.planning/phases/47-suite-trust-supply-chain/measure/extract-margins.mjs`
- **Commit:** `a5c8222`

**2. [Rule 2 - Missing critical functionality] the instrument did not probe the suite's actual worst-case timing margin**

- **Found during:** Task 1, after four assertions timed out under load.
- **Issue:** the three files whose first tests now hold the suite's worst timing margin (up to 186.8%
  of budget) were not probed by anything, so the population would have been described in prose and
  never re-measured.
- **Fix:** added the three test-body subjects as probes in the same commit as the repair. Because the
  reports already existed, their full idle/run-A/run-B margin curve came at zero extra measurement
  cost, and any future re-measure is a one-command re-run.
- **Files modified:** same file.
- **Commit:** `a5c8222`

### Deliberately NOT fixed

**`D-47-06-A` — the ~146 test-body `await import(` sites, and the three files observed timing out.**
Fixing them would have modified the tree this plan exists to measure, replacing a measured finding
with an unmeasured change and invalidating the before/after pair. Logged in `deferred-items.md` with
the mechanism, the observed numbers, the three-part fix and the caveat that the gate extension cannot
simply forbid all test-body dynamic imports. **Commit:** `d784be2`

### Corrections to the plan's own text, made rather than absorbed

- The plan (and its `<interfaces>` block) instructed the SUMMARY to state that **~7x load is not
  reproducible on this machine**. It was reproduced — 9.00x and 7.75x peaks — and real timeouts
  occurred. §7 records what was measured and marks the plan's expectation as corrected, rather than
  repeating a limitation that did not apply.
- The plan's objective cites the BEFORE baselines as `ratio 52.5 / 80`, `toggle 4121-4850 ms`,
  `recursion 2453-3263 ms`. Those are 47-CONTEXT's research figures. The like-for-like BEFORE values —
  same machine, same instrument, same multiplier — are 47-02's: `ratio 63.92`, `toggle 3336-4958 ms`,
  `recursion 2730-3530 ms`. §2 uses 47-02's, because a pair must come from one instrument.

### Authentication gates

None. This plan touched no authenticated surface.

---

## Threat Flags

None. This plan added no network endpoint, auth path, file-access pattern or schema change. Its two
modified files are a measurement script and a planning document, both under `.planning/`. Only test
names, durations and repo-relative paths were recorded; no `.env` value or secret was read
(T-47-06-04, disposition `accept`, holds as written).

Threat register dispositions, as executed:

| Threat ID | Disposition | How it was honoured |
|---|---|---|
| T-47-06-01 | mitigate | Same instrument, machine, spinner count (8) and runner (vitest 4.1.11, unmoved since 47-01). Multiplier recomputed and recorded from sampled `/proc/loadavg` field 4. Every deviation — the harsher ambient load, the 84.4 s contaminated control, the repaired probe — is stated in §1, §3 and Deviations rather than absorbed. |
| T-47-06-02 | mitigate | §5 states in as many words that the ten-run check was already green on the unfixed tree and is a guard, not evidence. The differ's own floor was re-proven red, output recorded. |
| T-47-06-03 | mitigate | Spinner count bounded at 47-02's 8 (11 for the two single-threaded probes, per `ratio-with-load.sh`'s stated reasoning). All four trap-killed, survivors asserted 0 by exact `/proc/*/cmdline` match. No container, database or network involved. |
| T-47-06-04 | accept | Only test names, durations and repo-relative paths recorded. |
| T-47-06-SC | mitigate | Nothing installed. No `npm install`, `npm ci` or `npm audit fix`. No source file modified. |

---

## Commits

| commit | what |
|---|---|
| `a5c8222` | `fix(47-06)`: repoint the stale margin probe at the counted replacement; add the three test-body subjects; floor re-proven red |
| `d784be2` | `docs(47-06)`: log `D-47-06-A`, the test-body import-cost defect |

Tasks 1 and 2 are measurement-only — the plan's `files_modified` is `[]` — so they produced no
source commit of their own. Their output is this SUMMARY, the report sets under `/tmp/p47-06/`, and
the two deviation commits above.

---

## Verdict on ROADMAP SC-1 (amended)

**MET for the two assertions the criterion names, and the criterion's structural half (SC-1b) is
green. NOT a statement that the suite is trustworthy under load.**

- `toggle.test.ts`'s `beforeEach`: **49.6% -> 0.7%** of hookTimeout at a harsher measured load.
  Worst-case margin 2.02x -> 133.84x.
- `recursion.test.ts`'s `beforeEach`: **35.3% -> 0.4%**. Worst-case margin 2.83x -> 268.94x.
- The linearity assertion: **deleted**, and its replacement is a load-invariant integer — 400 repeats
  under load, one distinct value, 23 730 — measured next to the deleted quantity's surviving 4.88x
  spread at the same load.
- SC-1b: **0** elapsed-time assertions and **0** ungated hook-scoped dynamic imports, both from gates
  with floors, both hit lists empty.
- The ten-run guard: 10/10 IDENTICAL, delta accounted for exactly, and labelled a guard.

**Outstanding, and it belongs to SC-1's spirit even though not to its letter:** `D-47-06-A`. The
criterion says *"no timing-sensitive assertion may consume a dangerous share of its budget under
induced load"* — measured suite-wide, three assertions consume **115.6%, 118.7% and 186.8%**. The
phase closed the two subjects it named and built two non-vacuous gates; it did not close the defect
class. A verifier should treat SC-1 as met-as-scoped and `D-47-06-A` as the open remainder.

---

## Self-Check: PASSED

| claim | verification |
|---|---|
| `47-06-SUMMARY.md` exists | FOUND |
| `measure/extract-margins.mjs` modified | FOUND, contains the `DETERMINISM: 20 repeats give exactly ONE integer` probe (1 match) and no longer contains the deleted `scales linearly, not quadratically` title (0 matches) |
| `deferred-items.md` carries `D-47-06-A` | FOUND (1 match) |
| commit `a5c8222` exists | FOUND |
| commit `d784be2` exists | FOUND |

No file or commit claimed above is absent.
