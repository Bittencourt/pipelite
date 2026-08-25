---
phase: 47-suite-trust-supply-chain
plan: 02
subsystem: testing
tags: [vitest, json-reporter, pass-set-diff, anti-vacuity-floor, cpu-oversubscription, flake-margin, sc-1]

# Dependency graph
requires:
  - phase: 47-suite-trust-supply-chain
    provides: "47-01's vitest 4.1.11 floor — the BEFORE and AFTER margins must be measured under the same runner, so this plan runs on the vitest-bumped but otherwise unfixed tree"
  - phase: 46-migration-chain-toolchain-floor
    provides: "the 4739/32 suite baseline, the lint-gate-on-errors rule, and the `IDENTICAL (both empty — proves nothing)` reporting form at migrate-from-zero.mjs:1072 that this plan's differ reuses verbatim"
provides:
  - "scripts/suite-repeatability.sh — N iterations of BOTH vitest projects at the default worker count, one JSON report per project per iteration plus a summary.txt of exit code, wall time and parsed counts"
  - "scripts/diff-pass-sets.mjs — a dependency-free pass-set differ with three anti-vacuity floors, all three OBSERVED red"
  - ".planning/phases/47-suite-trust-supply-chain/measure/ — the load-induction instrument, kept so 47-06 re-measures with the SAME tool rather than an equivalent probe"
  - "the phase's BEFORE margin record at a measured >= 3x oversubscription: toggle 33.4-49.6% of hookTimeout, recursion 27.3-35.3%, linearity ratio 79.9% of its 80 threshold"
  - "the ten-run pass-set baseline on the unfixed tree (10/10 identical, 4747 identities), explicitly labelled a regression guard and NOT the SC-1 evidence"
affects: [47-03, 47-04, 47-05, 47-06, 47-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "an evidence-producing harness and the program that grades it are separate executables, so the thing that produces a number cannot also decide whether the number is good"
    - "anti-vacuity floors evaluated AFTER the report is printed (report-then-fail, migrate-from-zero.mjs:1138-1152), so an operator always sees what was compared before being told why it does not count"
    - "load multiplier stated as SAMPLED runnable/cores from /proc/loadavg field 4, never as spinners/cores — the latter understates it because the workload contributes its own threads"
    - "process survivor counting by walking /proc/*/cmdline for an exact match, because a `pgrep -f` pattern matches its own caller's command line"

key-files:
  created:
    - scripts/suite-repeatability.sh
    - scripts/diff-pass-sets.mjs
    - .planning/phases/47-suite-trust-supply-chain/measure/README.md
    - .planning/phases/47-suite-trust-supply-chain/measure/spin.mjs
    - .planning/phases/47-suite-trust-supply-chain/measure/run-under-load.sh
    - .planning/phases/47-suite-trust-supply-chain/measure/extract-margins.mjs
    - .planning/phases/47-suite-trust-supply-chain/measure/ratio-with-load.sh
    - .planning/phases/47-suite-trust-supply-chain/measure/ratio-under-load.mjs
  modified: []

key-decisions:
  - "The differ's floor is checked on the PASSED count, not on the identity-set size, so a directory full of file-level collect failures cannot satisfy it — collect failures add identities but not passes"
  - "MIN_REFERENCE_PASS_SET = 4000 against a measured 4747; a floor set AT the measurement misdiagnoses legitimate shrinkage as a truncated report, which is the failure the floor exists to prevent arriving through the floor"
  - "Added MIN_ITERATIONS = 2 beyond the plan's requirement: one run diffed against itself is IDENTICAL by construction, which is a third way to get a vacuous green out of a set comparison"
  - "The differ FATALs on a half-written iteration (base report present, rsc absent) rather than diffing it, because `npm test` is two commands and a base-only pass set silently omits the 8 RSC tests while still printing a verdict"
  - "The load multiplier is reported as sampled runnable/cores (3.00x-5.75x, median 3.50x), not as spinners/availableParallelism (2.00x); the 1-minute load average is recorded but is explicitly not the figure, because it lags"
  - "The ratio probe uses 11 spinners where the suite run uses 8, because the probe is single-threaded and the suite contributes its own workers — the same total oversubscription needs a different spinner count"
  - "The measurement probes were moved from /tmp into the phase directory (Rule 2): the plan makes 47-06 responsible for beating these numbers, which is only meaningful if both halves of the pair come from the same instrument"

patterns-established:
  - "Falsify a set-comparison gate three ways: truncate the reference only (DIFFERS + floor), truncate BOTH sides identically (IDENTICAL printed, floor still red), and hand it two empty sets (the both-empty string, floor red). Only the second proves the floor is what stops the vacuous green"
  - "State an induced load as a measured multiplier with the sampling method named, and cross-check it against an independent quantity (wall-time inflation) before using it in a claim"

requirements-completed: []

# Metrics
duration: 57min
completed: 2026-08-25
---

# Phase 47 Plan 02: SC-1 Measurement Harness and the BEFORE Margin Summary

**A two-program repeatability harness (`suite-repeatability.sh` produces reports, `diff-pass-sets.mjs` grades them) whose three anti-vacuity floors were each observed red, plus the phase's BEFORE margin measured at a sampled 3.00x-5.75x CPU oversubscription: the linearity assertion's ratio reached 63.92 against its 80 threshold — 79.9% of budget consumed by contention alone, worse than the 66% research recorded.**

## Performance

- **Duration:** 57 min
- **Started:** 2026-08-25T08:01:00Z
- **Completed:** 2026-08-25T08:58:00Z
- **Tasks:** 2
- **Files created:** 8 (2 repo scripts, 6 phase-directory measurement artifacts)
- **Files modified:** 0 — **no test file, no config file and no manifest was touched.** This plan measures.

## Accomplishments

- `scripts/suite-repeatability.sh` (193 lines) and `scripts/diff-pass-sets.mjs` (410 lines), both dependency-free, both headed by an explicit statement of what they do **not** prove.
- **Three anti-vacuity floors, all three observed red with verbatim output below** — including the decisive control the plan asked for: two reports truncated *identically*, where the differ printed `IDENTICAL (57 tests)` and was stopped only by the floor.
- The ten-run pass-set guard reproduced on the unfixed tree: **10/10 identical, 4747 identities, 9 min 16 s** — and labelled, here and in both scripts' headers, as a regression guard rather than evidence.
- The **BEFORE margin** recorded for all three timing-sensitive assertions across **two independent 3-iteration runs (n=6)** at a sampled ≥3x, plus the linearity ratio across **20 repetitions** at a sampled 3.25x-3.50x.
- The instrument committed into the phase directory with the exact reproduction commands, so 47-06 re-runs it instead of re-deriving it.

## Task Commits

1. **Task 1: harness + differ, differ's floor proven red** — `1b644e6` (feat)
2. **Task 2: BEFORE margin at ≥3x + ten-run baseline** — `696e0af` (chore — see Deviations; the task measures rather than changes code, so its commit carries the reproducible instrument)

**Plan metadata:** see the final `docs(47-02)` commit.

---

# Part 1 — The differ's own floor, observed red

The plan required this to be **observed, not reasoned about**. It was falsified three ways. All output below is verbatim.

## Control 1 — reference truncated to two `testResults` entries

Setup (`/tmp/p47-02/truncated` is a copy of the green smoke directory):

```
truncated testResults 171 -> 2 (top-level counters left untouched on purpose)
```

Leaving `numPassedTests: 4739` intact in the document is deliberate: a differ that trusted the
top-level counter instead of walking `assertionResults[]` would have reported a full suite.

```
$ node scripts/diff-pass-sets.mjs /tmp/p47-02/truncated
-> 2 iteration(s) in /tmp/p47-02/truncated, repo root /home/pedro/programming/pipelite

run    files  assertions  passed  collect-failures  identities
01        4         57     57                0         57
02      173       4779   4747                0       4747

PASS-SET DIFF vs run 01 (base + rsc unioned)
  run 02: DIFFERS
     EXTRA   src/app/__tests__/record-dialog-note-failure.test.ts :: CR-03: a failed first note keeps the dialog open and the draft alive 'activity' dialog arms the reset guard the moment the record exists, before the note round trip
     EXTRA   src/app/__tests__/record-dialog-note-failure.test.ts :: CR-03: a failed first note keeps the dialog open and the draft alive 'activity' dialog bails out of the reset-on-open effect while a create is pending
     EXTRA   src/app/__tests__/record-dialog-note-failure.test.ts :: CR-03: a failed first note keeps the dialog open and the draft alive 'activity' dialog clears the id on close, on open going false, and on an edit target
     EXTRA   src/app/__tests__/record-dialog-note-failure.test.ts :: CR-03: a failed first note keeps the dialog open and the draft alive 'activity' dialog holds the id in a ref, so setting it cannot re-run the effect that resets the form
     EXTRA   src/app/__tests__/record-dialog-note-failure.test.ts :: CR-03: a failed first note keeps the dialog open and the draft alive 'activity' dialog keeps the dialog open on the note-failure branch: no handleClose, refresh, return
     EXTRA   src/app/__tests__/record-dialog-note-failure.test.ts :: CR-03: a failed first note keeps the dialog open and the draft alive 'activity' dialog only consults the remembered id on the create path
     EXTRA   src/app/__tests__/record-dialog-note-failure.test.ts :: CR-03: a failed first note keeps the dialog open and the draft alive 'activity' dialog remembers the created record so a retry updates instead of creating a second one
     EXTRA   src/app/__tests__/record-dialog-note-failure.test.ts :: CR-03: a failed first note keeps the dialog open and the draft alive 'deal' dialog arms the reset guard the moment the record exists, before the note round trip
     EXTRA   src/app/__tests__/record-dialog-note-failure.test.ts :: CR-03: a failed first note keeps the dialog open and the draft alive 'deal' dialog bails out of the reset-on-open effect while a create is pending
     EXTRA   src/app/__tests__/record-dialog-note-failure.test.ts :: CR-03: a failed first note keeps the dialog open and the draft alive 'deal' dialog clears the id on close, on open going false, and on an edit target
     EXTRA   … and 4680 more

ANTI-VACUITY FLOORS
  iterations           = 2 (floor 2) PASS
  reference pass set   = 57 (floor 4000) FAIL

FATAL: run 02 passed a DIFFERENT set of tests than run 01 — 0 missing, 4690 extra
FATAL: MIN_REFERENCE_PASS_SET floor violated: reference run 01 has only 57 passing tests, below the floor of 4000 (measured 4747 = 4739 base + 8 rsc). Every verdict above was computed against a reference that is not the full suite, so IDENTICAL would mean the runs agree about a fragment. This is a tripwire for a report set that yielded nothing, not an assertion about how large the suite or the run count should be. If the measurement legitimately moved, lower the floor AND record the new measurement in the comment beside it.

FATAL: this pass-set comparison does NOT certify the suite (2 problem(s) above). Note that vitest's own exit codes are deliberately not what this verdict is based on — a truncated report exits 0 and compares equal to another truncated report.
EXIT=1
```

## Control 2 — the decisive one: BOTH runs truncated identically

Control 1 is a weaker test than it looks: the *diff itself* went red, so the floor was never
load-bearing. Truncating both sides identically removes that help and leaves the floor as the only
thing standing between a truncated pair and a clean exit.

```
$ node -e '… both base reports truncated to 2 testResults entries each'
both base reports truncated to 2 testResults entries each

$ node scripts/diff-pass-sets.mjs /tmp/p47-02/truncated-both
-> 2 iteration(s) in /tmp/p47-02/truncated-both, repo root /home/pedro/programming/pipelite

run    files  assertions  passed  collect-failures  identities
01        4         57     57                0         57
02        4         57     57                0         57

PASS-SET DIFF vs run 01 (base + rsc unioned)
  run 02: IDENTICAL (57 tests)

ANTI-VACUITY FLOORS
  iterations           = 2 (floor 2) PASS
  reference pass set   = 57 (floor 4000) FAIL

FATAL: MIN_REFERENCE_PASS_SET floor violated: reference run 01 has only 57 passing tests, below the floor of 4000 (measured 4747 = 4739 base + 8 rsc). Every verdict above was computed against a reference that is not the full suite, so IDENTICAL would mean the runs agree about a fragment. This is a tripwire for a report set that yielded nothing, not an assertion about how large the suite or the run count should be. If the measurement legitimately moved, lower the floor AND record the new measurement in the comment beside it.

FATAL: this pass-set comparison does NOT certify the suite (1 problem(s) above). Note that vitest's own exit codes are deliberately not what this verdict is based on — a truncated report exits 0 and compares equal to another truncated report.
EXIT=1
```

**`IDENTICAL (57 tests)` printed, exit 1 anyway.** Without the floor this run exits 0 and reports
that two 57-test fragments agree — the exact `IDENTICAL (both empty — proves nothing)` failure shape
from Phase 46, one step short of empty.

## Control 3 — two empty pass sets, synthetic fixture

```
$ node -e '… 4 synthetic reports with testResults: [] and success: true'
wrote 4 synthetic reports with testResults: [] and success: true

$ node scripts/diff-pass-sets.mjs /tmp/p47-02/empty-fixture
-> 2 iteration(s) in /tmp/p47-02/empty-fixture, repo root /home/pedro/programming/pipelite

run    files  assertions  passed  collect-failures  identities
01        0          0      0                0          0
02        0          0      0                0          0

PASS-SET DIFF vs run 01 (base + rsc unioned)
  run 02: IDENTICAL (both empty — proves nothing)

ANTI-VACUITY FLOORS
  iterations           = 2 (floor 2) PASS
  reference pass set   = 0 (floor 4000) FAIL

FATAL: run 02 and the reference are BOTH EMPTY. Set identity over nothing is not a result; either the reports are truncated or the harness never ran a test.
FATAL: MIN_REFERENCE_PASS_SET floor violated: reference run 01 has only 0 passing tests, below the floor of 4000 (measured 4747 = 4739 base + 8 rsc). Every verdict above was computed against a reference that is not the full suite, so IDENTICAL would mean the runs agree about a fragment. This is a tripwire for a report set that yielded nothing, not an assertion about how large the suite or the run count should be. If the measurement legitimately moved, lower the floor AND record the new measurement in the comment beside it.

FATAL: this pass-set comparison does NOT certify the suite (2 problem(s) above). Note that vitest's own exit codes are deliberately not what this verdict is based on — a truncated report exits 0 and compares equal to another truncated report.
EXIT=1
```

The reports carry `success: true` on purpose. The differ reached its verdict from the parsed
document, not the flag.

## Three further guards, also observed red

```
--- CONTROL: single iteration (MIN_ITERATIONS) ---
ANTI-VACUITY FLOORS
  iterations           = 1 (floor 2) FAIL
  reference pass set   = 4747 (floor 4000) PASS
FATAL: MIN_ITERATIONS floor violated: 1 iteration(s) found, 2 required. A run diffed against itself is IDENTICAL by construction. …
EXIT=1

--- CONTROL: half-written iteration (base only, rsc absent) ---
FATAL: iteration 01 has only the base report. `npm test` is two commands and the harness writes both; comparing a half-written iteration would silently drop one project's tests from the pass set while still printing a verdict.
EXIT=1

--- CONTROL: empty directory ---
FATAL: no run-NN-{base,rsc}.json reports in /tmp/p47-02/nothing. This differ reads what scripts/suite-repeatability.sh writes; an empty directory would otherwise compare nothing to nothing and report success.
EXIT=1

--- CONTROL: harness refuses a non-empty output directory (T-47-02-01) ---
FATAL: /tmp/p47-02/smoke is not empty. Reports from two different runs in one
       directory would be read as one experiment. Name a fresh directory.
EXIT=1
```

## Restored — the same directory, untouched, green

```
$ node scripts/diff-pass-sets.mjs /tmp/p47-02/smoke
-> 2 iteration(s) in /tmp/p47-02/smoke, repo root /home/pedro/programming/pipelite

run    files  assertions  passed  collect-failures  identities
01      173       4779   4747                0       4747
02      173       4779   4747                0       4747

PASS-SET DIFF vs run 01 (base + rsc unioned)
  run 02: IDENTICAL (4747 tests)

ANTI-VACUITY FLOORS
  iterations           = 2 (floor 2) PASS
  reference pass set   = 4747 (floor 4000) PASS

OK: all 2 iterations produced the SAME pass set (4747 identities, 4747 passing).
OK: reminder — this is a cheap regression guard, NOT the evidence for SC-1. The same check was 16/16 green on the unfixed tree; the evidence is the margin each timing-sensitive assertion leaves against its budget under induced load.
EXIT=0
```

**Reference pass-set size measured: 4747 = 4739 (base) + 8 (rsc).** `MIN_REFERENCE_PASS_SET` is set
to **4000**, below it, per `migrate-from-zero.mjs:116-121`.

---

# Part 2 — The ten-run guard. THIS IS NOT THE EVIDENCE FOR SC-1.

**Stated plainly, as the plan requires: this check was already green on the unfixed tree before any
work in this phase began.** 47-RESEARCH ran the same shape 16 times — 10 idle, 3 at 2x, 3 at 3x
oversubscription — and got 16/16 identical pass sets, 4739 passed / 32 skipped, zero failures.
ROADMAP SC-1 was **amended** for exactly that reason. The ten runs below reproduce that result on
the vitest-4.1.11 tree. They are a **cheap regression guard** and they are **not evidence that any
flake was fixed**. Do not cite this table as proof of anything.

Command: `bash scripts/suite-repeatability.sh 10 /tmp/p47-02/ten` then
`node scripts/diff-pass-sets.mjs /tmp/p47-02/ten`. Started 08:11:38Z, finished 08:20:54Z —
**9 min 16 s**, matching research's 9.4 min.

| run | base wall | rsc wall | passed | failed | skipped | verdict |
|---|---|---|---|---|---|---|
| 01 | 52.751 s | 0.863 s | 4739 | 0 | 32 | GREEN |
| 02 | 52.419 s | 0.844 s | 4739 | 0 | 32 | GREEN |
| 03 | 52.873 s | 0.928 s | 4739 | 0 | 32 | GREEN |
| 04 | 52.519 s | 1.205 s | 4739 | 0 | 32 | GREEN |
| 05 | 55.053 s | 0.935 s | 4739 | 0 | 32 | GREEN |
| 06 | 52.668 s | 0.975 s | 4739 | 0 | 32 | GREEN |
| 07 | 57.491 s | 1.069 s | 4739 | 0 | 32 | GREEN |
| 08 | 55.820 s | 0.911 s | 4739 | 0 | 32 | GREEN |
| 09 | 55.429 s | 0.870 s | 4739 | 0 | 32 | GREEN |
| 10 | 58.607 s | 0.953 s | 4739 | 0 | 32 | GREEN |

RSC project: 8 passed / 8 in every run. Base wall time 52.419-58.607 s.

Differ's verdict, verbatim:

```
run    files  assertions  passed  collect-failures  identities
01      173       4779   4747                0       4747
… (runs 02-10 identical, all 4747)

PASS-SET DIFF vs run 01 (base + rsc unioned)
  run 02: IDENTICAL (4747 tests)
  run 03: IDENTICAL (4747 tests)
  run 04: IDENTICAL (4747 tests)
  run 05: IDENTICAL (4747 tests)
  run 06: IDENTICAL (4747 tests)
  run 07: IDENTICAL (4747 tests)
  run 08: IDENTICAL (4747 tests)
  run 09: IDENTICAL (4747 tests)
  run 10: IDENTICAL (4747 tests)

ANTI-VACUITY FLOORS
  iterations           = 10 (floor 2) PASS
  reference pass set   = 4747 (floor 4000) PASS

OK: all 10 iterations produced the SAME pass set (4747 identities, 4747 passing).
DIFF_EXIT=0
```

**Zero file-level collect failures in all 10 runs**, so the differ's collect-failure branch
contributed nothing here — it is present for the case where it does.

The pass set also held at load: the two 3-iteration loaded runs in Part 3 were diffed as well and
both reported `IDENTICAL (4747 tests)`. That is the same non-discriminating result, at 3x.

Honest note the plan asked for: the out-of-scope `auth.setup.ts` flake belongs to Playwright
(`test:e2e`), which `npm test` never invokes, so it cannot have perturbed any run above.

---

# Part 3 — The BEFORE margin. THIS is the evidence for SC-1 as amended.

## The induced load, as a measured number

`availableParallelism() === 4`. Spinner count **8** (2 × cores) for the suite runs.

`spinners / availableParallelism = 8 / 4 = 2.00x` — and that figure is an **understatement**,
because vitest contributes its own workers. The authoritative multiplier is **field 4 of
`/proc/loadavg` (runnable / total), sampled every 10 s throughout each run, divided by 4 cores**:

| figure | run A (`/tmp/p47-02/before-3x`) | run B (`/tmp/p47-02/before-3x-b`) |
|---|---|---|
| `spinners / cores` | 2.00x | 2.00x |
| 1-min loadavg, steady state | 10.80 – 15.80 → **2.70x – 3.95x**, median 3.46x | 10.60 – 14.23 → **2.65x – 3.56x**, median 3.26x |
| **runnable / cores (authoritative)** | 10 – 23 → **2.50x – 5.75x, median 3.50x** | 12 – 23 → **3.00x – 5.75x, median 3.50x** |
| steady-state samples | 49 | 44 |
| base-run wall time | 171.4 / 178.4 / 179.2 s | 158.3 / 159.0 / 163.0 s |
| idle base-run wall time, same tree | 52.4 – 58.6 s | 52.4 – 58.6 s |
| **wall-time inflation** | **3.05x – 3.42x** | **2.70x – 3.11x** |

The wall-time inflation is an *independent* confirmation of the multiplier and agrees with the
sampled runnable count. Research's 3x condition produced 161-165 s base runs; these produced
158-179 s. **The load reproduced.**

Every spinner died in the trap: `-> trap fired: 8 spinners signalled; surviving spinner processes =
0`, both runs. Confirmed independently afterwards by walking `/proc/*/cmdline`:

```
surviving spinner processes (exact cmdline match on "node /tmp/p47-02/spin.mjs"): 0
/proc/loadavg runnable/total = 3/2247  (1-min avg 5.10, still decaying from the probe)
```

## The three timing-sensitive assertions — BEFORE

Pooled across **both** loaded runs (n=6 base reports), extracted from
`assertionResults[].duration` by `measure/extract-margins.mjs`. vitest attributes a `beforeEach`
cost to the **first test** of the file, which is why the two hook subjects are named by their first
test. Budgets are vitest's defaults, in force because `vitest.config.ts` overrides neither:
**hookTimeout 10 000 ms, testTimeout 5 000 ms.**

| assertion | budget | min | median | max | % of budget (min/median/**max**) | worst-case margin |
|---|---|---|---|---|---|---|
| `toggle.test.ts` first test — `returns error when not authenticated` (the `:61` `beforeEach`) | hookTimeout 10 000 ms | 3336 ms | 3621 ms | **4958 ms** | 33.4% / 36.2% / **49.6%** | **2.02x** |
| `recursion.test.ts` — `creates a run with depth < 5 successfully` (the `:82` `beforeEach`) | hookTimeout 10 000 ms | 2730 ms | 3240 ms | **3530 ms** | 27.3% / 32.4% / **35.3%** | **2.83x** |
| `condition-evaluator.test.ts` — `scales linearly, not quadratically, with path length` | testTimeout 5 000 ms | 199 ms | 619 ms | **834 ms** | 4.0% / 12.4% / **16.7%** | **5.99x** |

Raw values, ms, in report order (run A then run B):

```
toggle    : 4510.651, 3531.531, 3677.805 | 4957.741, 3336.464, 3564.001
recursion : 2730.172, 3524.734, 3189.962 | 3289.767, 2775.911, 3529.596
linearity : 834.192,   489.483,  655.467 |  604.814,  199.270,  632.560
```

The idle counterpart, from the same ten-run reports (n=10, no spinners):

| assertion | budget | min | median | max | % of budget (max) | worst-case margin |
|---|---|---|---|---|---|---|
| `toggle.test.ts` first test | 10 000 ms | 1015 ms | 1382 ms | 2553 ms | 25.5% | 3.92x |
| `recursion.test.ts` first depth test | 10 000 ms | 803 ms | 1074 ms | 1924 ms | 19.2% | 5.20x |
| `condition-evaluator.test.ts` linearity test | 5 000 ms | 133 ms | 184 ms | 280 ms | 5.6% | 17.89x |

Both agree with research (idle toggle 1211-1669 / loaded 4121-4850; idle recursion 879-1314 /
loaded 2453-3263). **Contention alone moves the toggle hook from 25.5% to 49.6% of its budget and
the recursion hook from 19.2% to 35.3%.**

## The ratio itself — the number that actually discriminates

The linearity assertion does not compare a duration to a budget; it compares `large / small` to
**80**. `measure/ratio-under-load.mjs` replicates `condition-evaluator.test.ts:613-636` verbatim
(best-of-5, `time(2000)` warm-up discarded, `small = max(time(8000), 0.05)`, `large = time(128000)`)
against the real `resolveFieldPath`, outside vitest so it inherits no worker scheduling.

The probe is **single-threaded**, so it needs **11** spinners rather than 8 to reach the same total
oversubscription. Sampled during the probe: **runnable 13-17 of 4 cores = 3.25x - 4.25x**. The
1-minute average read 8.6-10.6 (2.15x-2.65x) and is *not* the figure — it had not caught up.

| condition | reps | min | median | max | worst-case margin (80 / max) | % of the 80 threshold consumed |
|---|---|---|---|---|---|---|
| idle, no spinners | 10 | 7.61 | 18.86 | 21.36 | 3.75x | 26.7% |
| **11 spinners, sample 1** | 10 | 15.93 | 49.50 | 53.60 | **1.49x** | **67.0%** |
| **11 spinners, sample 2** | 10 | 18.11 | 49.46 | **63.92** | **1.25x** | **79.9%** |
| **pooled at ≥3x** | **20** | **15.93** | **49.48** | **63.92** | **1.25x** | **79.9%** |

Per-repetition detail of the worst sample (verbatim):

```
-> availableParallelism = 4 ; spinners = 11 ; probe adds 1 runnable thread
-> /proc/loadavg at probe start: 8.59 7.45 7.23 14/2286 616424
rep  1  small=2.834ms  large=76.569ms  ratio=27.01  PASS (< 80)
rep  2  small=1.382ms  large=88.336ms  ratio=63.92  PASS (< 80)
rep  3  small=1.434ms  large=71.099ms  ratio=49.59  PASS (< 80)
rep  4  small=1.364ms  large=68.663ms  ratio=50.34  PASS (< 80)
rep  5  small=1.453ms  large=76.440ms  ratio=52.60  PASS (< 80)
rep  6  small=1.429ms  large=70.490ms  ratio=49.32  PASS (< 80)
rep  7  small=1.363ms  large=66.566ms  ratio=48.85  PASS (< 80)
rep  8  small=1.423ms  large=25.780ms  ratio=18.11  PASS (< 80)
rep  9  small=1.380ms  large=46.850ms  ratio=33.94  PASS (< 80)
rep 10  small=1.427ms  large=74.009ms  ratio=51.85  PASS (< 80)

UNDER 11 SPINNERS on 4 cores: reps=10  min=18.11  median=49.46  max=63.92  worst-margin=1.25x  budget-consumed=79.9%  failures=0/10
-> /proc/loadavg at probe end:   8.87 7.52 7.25 13/2284 616759
-> trap fired: 11 spinners signalled; surviving spinner processes = 0
```

**This is the BEFORE number 47-06 must beat: 63.92 against a threshold of 80 — 79.9% of the budget
consumed by scheduler contention with a *correct* implementation, worse than the 52.51 / 66% that
47-RESEARCH recorded.** The assertion never failed in 20 repetitions, which is precisely the point:
it does not fail, it *drifts*, and one more contention step is red. The pass set does not see this.
The margin does.

## Exact reproduction command, for 47-06

```bash
# ten-run guard at idle (~9 min 16 s) — a regression guard, not evidence
bash scripts/suite-repeatability.sh 10 /tmp/p47-06/ten
node scripts/diff-pass-sets.mjs /tmp/p47-06/ten

# the margin, at >= 3x — two fresh directories (the harness refuses a non-empty one)
bash .planning/phases/47-suite-trust-supply-chain/measure/run-under-load.sh /tmp/p47-06/after-3x   3
bash .planning/phases/47-suite-trust-supply-chain/measure/run-under-load.sh /tmp/p47-06/after-3x-b 3
node .planning/phases/47-suite-trust-supply-chain/measure/extract-margins.mjs /tmp/p47-06/after-3x   "8 spinners on 4 cores (run A)"
node .planning/phases/47-suite-trust-supply-chain/measure/extract-margins.mjs /tmp/p47-06/after-3x-b "8 spinners on 4 cores (run B)"
node .planning/phases/47-suite-trust-supply-chain/measure/extract-margins.mjs /tmp/p47-06/ten        "IDLE (n=10, no spinners)"

# the ratio itself, at >= 3x — 11 spinners, NOT 8 (the probe is single-threaded)
bash .planning/phases/47-suite-trust-supply-chain/measure/ratio-with-load.sh 10 11
```

`measure/README.md` carries the same commands plus the reasoning about the multiplier.

---

## Files Created

| File | What it does |
|---|---|
| `scripts/suite-repeatability.sh` | 193 lines. N iterations × both vitest projects at the default worker count. Refuses a non-empty output directory, FATALs on a missing/empty/unparseable report, exits non-zero if any project run was RED, and reaches its verdict from the parsed `success`/`numPassedTests` rather than from vitest's exit code. |
| `scripts/diff-pass-sets.mjs` | 410 lines, zero dependencies. `buildPassSet` / `diffPassSets` / `MIN_REFERENCE_PASS_SET` exported; entry point fenced on `import.meta.main === true` with the FATAL-on-`undefined` branch. Unions base+rsc per iteration, records file-level collect failures, samples MISSING/EXTRA at 10 lines per direction, and evaluates its floors after printing the table. |
| `measure/README.md` | the exact reproduction commands and why the multiplier is stated as sampled runnable/cores |
| `measure/spin.mjs` | one single-core busy loop |
| `measure/run-under-load.sh` | spinners + `/proc/loadavg` sampling + the harness; trap kills spinners and FATALs on a survivor |
| `measure/extract-margins.mjs` | the three probes' durations as a percentage of budget, with a floor: an unmatched probe exits 1 |
| `measure/ratio-with-load.sh` | 11 spinners, 75 s ramp, load sampling, the probe, trap cleanup |
| `measure/ratio-under-load.mjs` | `condition-evaluator.test.ts:613-636` replicated verbatim outside vitest |

## Source assertions the plan required, all verified with `node -e`

```
scripts/suite-repeatability.sh
  lines                : 193      (min_lines 60)
  forbidden tokens     : none     (neither `test:db` nor `db.config` appears)
  worker/retry flags   : none     (no --pool, --maxWorkers, --minWorkers, --no-file-parallelism, --retry)
  npx occurrences      : 0
  node_modules/.bin/vitest : true
  set -euo pipefail        : true
  both reporters           : true
  rsc config invoked       : true

scripts/diff-pass-sets.mjs
  lines                : 410      (min_lines 80)
  forbidden tokens     : none
  worker/retry flags   : none
  npx occurrences      : 0
  imports              : ["node:fs","node:path","node:url"]   non-node: none
  import.meta.main guard : true    FATAL on undefined : true
  exports buildPassSet / diffPassSets / MIN_REFERENCE_PASS_SET : true / true / true
  reads assertionResults : true

OK: all source assertions hold
```

Counted with `node`, never `grep … | wc -l`. Neither script mentions the database-backed vitest
project, so `db-test-isolation.test.ts`'s token sweeps cannot be tripped; **no npm script was added**,
so its per-script assertions and its `scripts.test` anchor are untouched.

## Plan's own automated verifies

```
$ bash scripts/suite-repeatability.sh 2 /tmp/p47-02/smoke && node scripts/diff-pass-sets.mjs /tmp/p47-02/smoke
OK: 2 iterations x 2 projects, 4 reports in /tmp/p47-02/smoke, all GREEN.      # exit 0
OK: all 2 iterations produced the SAME pass set (4747 identities, 4747 passing). # exit 0
# directory contents: run-01-base.json run-01-rsc.json run-02-base.json run-02-rsc.json summary.txt
# summary.txt carries an exit code AND a wall time per project per iteration:
run=01 project=base exit=0 wall=52.822s success=true files=171 total=4771 passed=4739 failed=0 skipped=32 verdict=GREEN
run=01 project=rsc  exit=0 wall=0.956s  success=true files=2   total=8    passed=8    failed=0 skipped=0  verdict=GREEN
run=02 project=base exit=0 wall=52.650s success=true files=171 total=4771 passed=4739 failed=0 skipped=32 verdict=GREEN
run=02 project=rsc  exit=0 wall=0.867s  success=true files=2   total=8    passed=8    failed=0 skipped=0  verdict=GREEN

$ node -e "…the three named assertions must be located with numeric durations…"   # task 2's verify, verbatim
durations extracted for 6 assertion instances                                     # exit 0
```

## Final gates

| Gate | Result |
|---|---|
| `npm test` | **4739 passed / 32 skipped** (169 files + 2 skipped), RSC **8/8** — exit 0 |
| `npm run typecheck` | exit 0, no output |
| `npm run lint` | **0 errors**, 124 warnings — exactly the master baseline. Gated on errors, never the warning total |
| `git status --porcelain` | clean; **no test file, config file or manifest modified** |
| surviving spinner processes | **0** (exact `/proc/*/cmdline` match) |
| compose stack | app / mailhog / postgres running, `/api/health` → **200** |

## Decisions Made

1. **The floor is checked on the PASSED count, not the identity-set size.** File-level collect
   failures add identities but not passes, so a directory full of collect failures cannot satisfy a
   floor placed on identities.
2. **`MIN_REFERENCE_PASS_SET = 4000` against a measured 4747.** Per `migrate-from-zero.mjs:116-121`:
   a floor set at the measurement fatals on legitimate shrinkage with a message that misdiagnoses it
   as a parse failure, and the next person lowers the number without understanding it.
3. **`MIN_ITERATIONS = 2` added beyond the plan.** A run diffed against itself is IDENTICAL by
   construction — a third route to a vacuous green out of a set comparison, alongside empty and
   truncated.
4. **A half-written iteration is FATAL, not diffable.** `npm test` is two commands; a base-only pass
   set omits the 8 RSC tests while still printing a verdict.
5. **The multiplier is the sampled runnable count, not the spinner ratio.** `spinners / cores` is
   2.00x and wrong; `runnable / cores` is 3.00x-5.75x and is corroborated by 2.7x-3.4x wall-time
   inflation. The 1-minute load average is recorded but is explicitly not the figure — it lags, and
   during the short ratio probe it never caught up (8.6 while the runnable count said 14).
6. **The ratio probe uses 11 spinners, the suite run 8.** The probe is single-threaded; the suite
   brings its own workers. Copying the spinner count across would have measured the ratio at ~2.5x
   while calling it 3x — and it did, on the first attempt (max 47.37 / 59.2% at 2.5x versus 63.92 /
   79.9% at 3.5x). The first attempt is reported above as sample 1 only after being re-run at the
   higher load.
7. **The harness and the grader are two programs.** The thing that produces the evidence does not
   decide whether the evidence is good.

## Deviations from Plan

### Auto-fixed / auto-added

**1. [Rule 2 — Missing critical] The measurement instrument was moved from `/tmp` into the phase directory**
- **Found during:** Task 2
- **Issue:** The plan makes 47-06 responsible for re-measuring and beating these numbers, and the
  phase hard rules require the numbers to be *reproducible by it*. The probes as written lived in
  `/tmp/p47-02/`, which will not survive. A before/after pair whose two halves come from two
  independently hand-written probes is not a comparison — it is two anecdotes.
- **Fix:** Six files committed under
  `.planning/phases/47-suite-trust-supply-chain/measure/` (`README.md`, `spin.mjs`,
  `run-under-load.sh`, `extract-margins.mjs`, `ratio-with-load.sh`, `ratio-under-load.mjs`), with
  hardcoded absolute paths replaced by resolution from `BASH_SOURCE` / `import.meta.url`, and the
  exact reproduction commands in the README.
- **Verification:** The committed copies were re-run and reproduce the same numbers — and the
  **authoritative run B measurements in Part 3 were produced by the committed artifact, not by the
  `/tmp` copy.** `measure/extract-margins.mjs` on run A's reports returns byte-identical values to
  the `/tmp` version.
- **Committed in:** `696e0af`
- **Note on file scope:** the plan's verification says `git status --porcelain` lists only the two
  new script files. That is satisfied for **source**: nothing under `src/`, no config and no manifest
  changed. The six added files are phase evidence under `.planning/`, in the same category as this
  SUMMARY, and `.planning` is gitignored so each was force-added individually.

**2. [Rule 1 — Bug in my own verification] `pgrep -f` reported phantom spinner survivors**
- **Found during:** Task 2, checking the acceptance criterion "no spinner process survives"
- **Issue:** `pgrep -fc 'p47-02/spin.mjs'` returned **2** after the trap had already killed every
  spinner. The pattern matched the *caller's own* command line — the bash invocation and a `node -e`
  checker whose source text contained the pattern. Reporting "2 survivors" would have been a false
  failure; worse, the inverse mistake (a checker that always matches itself and is therefore never
  zero) is the vacuous-gate shape in reverse.
- **Fix:** Survivor counting now walks `/proc/*/cmdline` and requires an **exact** match against
  `node <abs path>/spin.mjs`, with the target string assembled from fragments in the ad-hoc checker
  so it cannot match itself. Applied in both committed wrapper scripts' traps.
- **Verification:** `surviving spinner processes (exact cmdline match on "node /tmp/p47-02/spin.mjs"): 0`
  with `/proc/loadavg` runnable = 3/2247, i.e. an idle machine.
- **Committed in:** `696e0af`

**3. [Rule 2 — Missing critical] Two extra floors and one wording fix in the differ**
- **Found during:** Task 1
- **Issue:** The plan named one floor (`MIN_REFERENCE_PASS_SET`) and the both-empty verdict. Two
  further routes to a vacuous green existed: a directory with a single iteration, and a directory of
  base-only reports. Separately, the shared `FLOOR_ADVICE` sentence read "if the suite legitimately
  shrank", which is meaningless when appended to an iteration-count floor.
- **Fix:** Added `MIN_ITERATIONS` and the half-iteration FATAL; generalised `FLOOR_ADVICE` to "if the
  measurement legitimately moved" so it reads correctly for both floors.
- **Verification:** Both new guards observed red (Part 1, "Three further guards").
- **Committed in:** `1b644e6` (the wording fix landed pre-commit)

---

**Total deviations:** 3 (2 missing-critical, 1 bug in my own verification instrument).
**Impact on plan:** No scope creep into source. Zero test, config or manifest files touched. Two of
the three deviations strengthen falsifiability, which is the phase's purpose; the third makes the
BEFORE half of the SC-1 pair reproducible by 47-06, which the phase hard rules require.

## Issues Encountered

1. **The first ratio measurement was at the wrong load and was re-run.** Using the suite's 8 spinners
   for the single-threaded probe gave a sampled runnable count of 10/4 = 2.5x, below the required 3x,
   and a correspondingly softer max of 47.37 (59.2% of budget). Diagnosed from the sampled runnable
   count, not assumed. Re-run at 11 spinners → 3.25x-4.25x → max 63.92 (79.9%). **Both are reported;
   the 2.5x figure is labelled as such and is not used as the BEFORE number.** This is the concrete
   reason the SUMMARY states the multiplier as a sampled quantity rather than as "under load".
2. **`--reporter=json` alone would have hidden a startup error.** Handled as the plan directed
   (`--reporter=json --outputFile=… --reporter=default` everywhere) and reinforced by never branching
   on the exit code alone. Not encountered as a failure, because it was designed out.
3. **`.planning` is gitignored but tracked.** Each new file under it was force-added individually;
   no directory was force-added.

## Known Stubs

None. Both scripts are complete and were exercised end to end, including every failure path
described above.

## Threat Flags

None. No network endpoint, auth path, file-access pattern or schema was added. Against the plan's
threat register:

- **T-47-02-01 (Tampering, output directory):** mitigated and demonstrated — the harness `mkdir -p`s
  the caller-named directory, writes only `run-NN-{base,rsc}.json` and `summary.txt`, deletes
  nothing, and FATALs on a non-empty target. Observed firing (Part 1).
- **T-47-02-02 (Repudiation, IDENTICAL over nothing):** mitigated and demonstrated three ways
  (Part 1), including the decisive both-sides-truncated control.
- **T-47-02-03 (DoS, deliberate oversubscription):** spinner count bounded at 2× (suite) and 3×−1
  (probe) `availableParallelism`, killed from a trap that FATALs on a survivor, survivor count
  asserted **0** by exact `/proc/*/cmdline` match. No container, database or network involved.
- **T-47-02-04 (Information disclosure):** accepted as planned — paths are made repo-relative before
  entering a pass set; no `.env` value, token or credential is read or written by either script.
- **T-47-02-SC (supply chain):** **nothing was installed.** `scripts/diff-pass-sets.mjs` imports
  `node:fs`, `node:path`, `node:url` and nothing else, asserted over the source text. `package.json`
  and `package-lock.json` are unmodified, leaving the SEC-05 track free to run in parallel.

## Next Phase Readiness

- **47-03 / 47-04 / 47-05** can proceed. This plan added no npm script and did not touch
  `package.json`, `vitest.config.ts` or any test file, so nothing it did constrains those plans.
- **47-06 owns the AFTER half.** It must re-run `measure/run-under-load.sh`,
  `measure/extract-margins.mjs` and `measure/ratio-with-load.sh` — not equivalents — and beat:
  toggle **49.6%** of hookTimeout, recursion **35.3%**, and the linearity ratio **63.92 / 80 =
  79.9%**. Research expects the toggle/recursion hoisting fix to take those two to ~3 ms (0.03% of
  budget) and the counter replacement to make the ratio irrelevant rather than merely smaller.
- **Note for 47-04:** `measure/extract-margins.mjs` locates the linearity probe by the test title
  `scales linearly, not quadratically, with path length`. When 47-04 deletes or renames that test the
  probe's floor will FATAL, deliberately. Update the title in the same commit; do not delete the
  probe, because the AFTER claim is "the ratio no longer decides anything", and showing the ratio
  still drifting while the new counter does not is the strongest form of that claim. The comment in
  the file says so.
- **Also note for 47-04:** `measure/ratio-under-load.mjs` is the third place in the repo that calls
  `performance.now()`. 47-VALIDATION hazard 2 warns that deleting
  `condition-evaluator.test.ts:620,622` removes the repo's only two call sites and would starve a
  clock-call floor. This file is under `.planning/`, not `src/`, so it does **not** change that
  count for any `src/**` sweep — do not let it appear to.
- Repo clean, compose stack up, `/api/health` 200, machine idle.

## State Updates — one step deliberately not taken

`requirements mark-complete QG-01` was **not** run, for the reason 47-01 recorded and which still
holds: QG-01 is claimed by 47-02…47-06 and 47-13, and this plan measured the defect rather than
fixing it. Checking QG-01 off after recording a BEFORE margin would mark a requirement complete on
the strength of evidence that the defect is still present. It belongs to `/gsd:verify-phase 47`.

---
*Phase: 47-suite-trust-supply-chain*
*Completed: 2026-08-25*

## Self-Check: PASSED

Verified 2026-08-25 after writing this SUMMARY.

```
FOUND:   scripts/suite-repeatability.sh                                        (193 lines, claimed 193)
FOUND:   scripts/diff-pass-sets.mjs                                            (410 lines, claimed 410)
FOUND:   .planning/phases/47-suite-trust-supply-chain/measure/README.md
FOUND:   .planning/phases/47-suite-trust-supply-chain/measure/spin.mjs
FOUND:   .planning/phases/47-suite-trust-supply-chain/measure/run-under-load.sh
FOUND:   .planning/phases/47-suite-trust-supply-chain/measure/extract-margins.mjs
FOUND:   .planning/phases/47-suite-trust-supply-chain/measure/ratio-with-load.sh
FOUND:   .planning/phases/47-suite-trust-supply-chain/measure/ratio-under-load.mjs
FOUND:   .planning/phases/47-suite-trust-supply-chain/47-02-SUMMARY.md
FOUND:   commit 1b644e6
FOUND:   commit 696e0af
```

No missing items. Every number in Parts 1-3 is a verbatim paste from a command run in this session;
no figure was carried over from 47-RESEARCH except where explicitly labelled as research's.
