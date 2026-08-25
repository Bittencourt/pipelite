# Phase 47 SC-1 measurement harness — the exact instrument, kept so 47-06 can re-run it

ROADMAP success criterion SC-1 was **amended** because the original ten-run pass-set
criterion could not fail: 16/16 identical pass sets on the *unfixed* tree, including at 3x
CPU oversubscription. The criterion is now the **margin** each timing-sensitive assertion
leaves against its budget under induced load, recorded **before** (47-02) and **after**
(47-06).

A before/after pair is only meaningful if both halves come from the same instrument. These
files are that instrument. `47-02-SUMMARY.md` carries the BEFORE numbers they produced.
**47-06 must re-run these files, not re-derive an equivalent probe.**

## The four files

| File | What it does |
|---|---|
| `spin.mjs` | one single-core busy loop; N copies induce the oversubscription |
| `run-under-load.sh` | starts spinners, samples `/proc/loadavg`, runs `scripts/suite-repeatability.sh`, kills spinners from a trap and FATALs if any survives |
| `extract-margins.mjs` | pulls the three timing-sensitive assertions' durations out of the JSON reports and reports each as a percentage of the budget in force |
| `ratio-with-load.sh` + `ratio-under-load.mjs` | replicates `condition-evaluator.test.ts:613-636` exactly, outside vitest, and prints the ratio the assertion compares against 80 |

## Exact reproduction — the commands 47-02 ran

```bash
# (a) TEN-RUN REGRESSION GUARD at idle. ~9 min 16 s measured.
#     NOT the evidence for SC-1 — see the header of scripts/diff-pass-sets.mjs.
bash scripts/suite-repeatability.sh 10 /tmp/p47-02/ten
node scripts/diff-pass-sets.mjs /tmp/p47-02/ten

# (b) THE MARGIN, at >= 3x. Run it TWICE into two fresh directories; the harness refuses a
#     non-empty one on purpose. ~8.5 min each.
bash .planning/phases/47-suite-trust-supply-chain/measure/run-under-load.sh /tmp/p47-06/after-3x   3
bash .planning/phases/47-suite-trust-supply-chain/measure/run-under-load.sh /tmp/p47-06/after-3x-b 3

node .planning/phases/47-suite-trust-supply-chain/measure/extract-margins.mjs \
     /tmp/p47-06/after-3x "8 spinners on 4 cores (run A)"
node .planning/phases/47-suite-trust-supply-chain/measure/extract-margins.mjs \
     /tmp/p47-06/after-3x-b "8 spinners on 4 cores (run B)"

# The idle counterpart comes free from step (a)'s reports:
node .planning/phases/47-suite-trust-supply-chain/measure/extract-margins.mjs \
     /tmp/p47-02/ten "IDLE (n=10, no spinners)"

# (c) THE RATIO ITSELF, at >= 3x. 11 spinners, not 8 — see the header of ratio-with-load.sh.
bash .planning/phases/47-suite-trust-supply-chain/measure/ratio-with-load.sh 10 11
```

## The load-induction method, and how the multiplier is stated

`spinners / availableParallelism` **understates** the real figure for the suite runs, because
vitest contributes its own workers. The authoritative number is **field 4 of `/proc/loadavg`
— runnable / total** — divided by the core count, sampled every 10 s throughout the run by
`run-under-load.sh` and written next to the report directory. The 1-minute load average is
recorded too but **lags by design**; never read it in the first minute.

Measured on 2026-08-25, 4 cores (`availableParallelism() === 4`), 8 spinners:

| figure | run A | run B |
|---|---|---|
| `spinners / cores` | 2.00x | 2.00x |
| 1-min loadavg / cores (steady state) | 2.70x – 3.95x, median 3.46x | 2.65x – 3.56x, median 3.26x |
| **runnable / cores (authoritative)** | **2.50x – 5.75x, median 3.50x** | **3.00x – 5.75x, median 3.50x** |
| base-run wall time | 171 – 179 s | 158 – 163 s |
| idle base-run wall time, same tree | 52.4 – 58.6 s | — |

The wall-time inflation (≈3.1x) is an independent confirmation of the multiplier.

## Constraints these scripts obey, and why

- **No worker-count, pool, file-parallelism or repeat-on-failure flag** reaches vitest. The
  default worker count IS the measurement.
- **Both vitest projects** run every iteration. `npm test` is two commands; a harness that
  runs only the first silently omits the 8 RSC tests.
- **`--reporter=json --outputFile=… --reporter=default`**, never `--reporter=json` alone —
  alone it suppresses console output and a startup error looks like a clean run.
- **The verdict never comes from an exit code alone**, always from the parsed `success` /
  `numPassedTests`.
- **Spinners die from a trap** and the survivor count is asserted zero, so a failure part-way
  cannot leave the machine loaded for the next measurement. The survivor count is taken by
  walking `/proc/*/cmdline` for an exact match, **not** with `pgrep -f`: a `pgrep -f` pattern
  matches the caller's own command line and reports phantom survivors (observed here).
- **Counting is done with `node`, never `grep … | wc -l`**, which returns a wrong count in
  this environment.
