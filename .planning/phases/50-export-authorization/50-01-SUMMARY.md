---
phase: 50
plan: 01
subsystem: export-authorization
tags: [SEC-03, selectivity, pure-function, measurement, ablation]
requires:
  - "src/lib/export/view-export-guard.ts (read only — unmodified)"
  - "src/components/custom-fields/__tests__/source-scan.ts (readStrippedSource)"
provides:
  - "MAX_EXPORT_FRACTION = 0.40 (measured)"
  - "MIN_EXPORT_ROWS = 1_000 (policy floor, documented as NOT measured)"
  - "exportAllowance(total): max(MIN_EXPORT_ROWS, floor(total * MAX_EXPORT_FRACTION))"
  - "decideSelectivity({matched, total}): SelectivityDecision — pure, sync, no I/O"
  - "SelectivityDecision type — refusal carries matched, total, allowance"
  - ".planning/phases/50-export-authorization/50-MEASUREMENTS.md — the re-measured live baseline"
affects:
  - "50-04 (export-count.ts imports decideSelectivity; allowance is 31,608 NOT 31,609)"
  - "50-06 (SC-4 ladder must use the strictly-increasing eight-step date list)"
  - "50-08 (sign-off must carry the EXPORT_ROW_CAP consequence)"
tech-stack:
  added: []
  patterns:
    - "pure/IO split: arithmetic here, the count in export-count.ts (50-04)"
    - "parsed-function-body extraction for scoped structural assertions"
    - "stripped source for token negatives, RAW source for the one documentation assertion"
key-files:
  created:
    - "src/lib/export/export-selectivity.ts"
    - "src/lib/export/__tests__/export-selectivity.test.ts"
    - ".planning/phases/50-export-authorization/50-MEASUREMENTS.md"
  modified: []
decisions:
  - "The (0,0) cell alone cannot detect a division — a (1,0) cell was ADDED as the real detector"
  - "The plan's 'both bodies mention MIN_EXPORT_ROWS and Math.floor' resolved per-body rather than by inlining the rule twice"
  - "RESEARCH §8's allowance column used Math.round; the activities allowance is 31,608, not 31,609"
metrics:
  duration: "~25 min"
  completed: "2026-08-27"
  tasks: 2
  commits: 3
  tests_added: 27
  suite: "5696 -> 5723 passed / 32 skipped over 186 files"
---

# Phase 50 Plan 01: The Pure Selectivity Rule and the Plan-Time Measurements Summary

A pure, synchronous `decideSelectivity` that refuses an export iff `matched > max(1000, floor(total ×
0.40))` — with the live baseline re-measured a third time (nothing moved), the RESEARCH allowance
figure corrected from 31,609 to 31,608, and five ablations recorded red including one that proves the
gate-laundering relocation is otherwise completely invisible.

**Tasks:** 2/2. **Commits:** `94cd0f0`, `fdd5b2d`, plus this one.

---

## What was built

| Artifact | Lines | What it is |
|---|---|---|
| `src/lib/export/export-selectivity.ts` | 189 | The rule. No `@/db`, no session, no viewer. |
| `src/lib/export/__tests__/export-selectivity.test.ts` | 489 | 27 cells, failing for six distinct reasons. |
| `.planning/phases/50-export-authorization/50-MEASUREMENTS.md` | 475 | The re-measured baseline every later plan reads. |

No call site changed. `guardExportInput` is untouched and still synchronous.

---

## Task 1 — the third measurement. **NOTHING MOVED.**

Command form, used for every figure (a worktree has no `docker-compose.yml`, so
`--project-directory` with an absolute `-f` is required or postgres reads as "not running"):

```
rtk proxy docker compose \
  --project-directory /home/pedro/programming/pipelite \
  -f /home/pedro/programming/pipelite/docker-compose.yml \
  exec -T postgres psql -U pipelite -d pipelite -c "<sql>"
```

### Volumes and the audit trail

```
       tbl        | count
------------------+-------
 audit_log_total  |   214
 audit_log_export |     0
 deals            | 25195
 people           | 38348
 activities       | 79022
 organizations    | 46054
(6 rows)
```

### Users (50-06 needs a real non-admin)

```
                  id                  |             email              |  role  |  status
--------------------------------------+--------------------------------+--------+----------
 06365957-e44b-4cc6-a6db-211b467138a5 | pipelite-e2e@local.test        | admin  | approved
 ef4acac9-e860-4e71-9db5-ddaa2808cb9f | prbitt@gmail.com               | admin  | approved
 efe6ba7c-a08a-4fe1-bc5d-02b507d6f534 | emily.davis@pipelite.local     | member | approved
 07572f1b-49e3-4325-b4af-7fc68b736f7f | james.wilson@pipelite.local    | member | approved
 d9ed59bc-5b69-4fad-a3fe-3d2454e7c706 | laura.garcia@pipelite.local    | member | approved
 b1939ede-9fd7-42bc-9d94-1656b99d1c6c | mark.chen@pipelite.local       | member | approved
 164b4196-6cf7-4671-8b4a-9739721fd0d3 | mateus.aristimunho@visagio.com | member | approved
 bc79ecfe-0f9f-4772-bf8f-1ce9a184179f | pedrobittencourt87@gmail.com   | member | approved
 f40b7e37-52cb-4a9b-972a-19a410fc6f25 | pipelite-e2e-member@local.test | member | approved
 fc27b469-0a33-4ce5-9332-c165c213107c | sarah.johnson@pipelite.local   | member | approved
(10 rows)
```

### SC-1's headline (three-column ILIKE, the export fetcher's own predicate)

```
 matched_a | total |  pct
-----------+-------+-------
     44254 | 46054 | 96.09
(1 row)
```

### SC-2's subject, the zero-match anchor, and why 0.50 was rejected

```
 term | matched | total |  pct
------+---------+-------+-------
 ltda |   13355 | 46054 | 29.00
 zzzz |       0 | 46054 |  0.00
 u    |   23495 | 46054 | 51.02
(3 rows)
```

### The worst case — one owner, the whole table

```
               owner_id               | count
--------------------------------------+-------
 ef4acac9-e860-4e71-9db5-ddaa2808cb9f | 25195
(1 row)
```

**`/deals` with `owner=ef4acac9-e860-4e71-9db5-ddaa2808cb9f` returns 25,195 of 25,195 = 100.00%,
UNDER the 50,000 cap.** This, not `search=a` at 96.09%, is the worst live instance of WR-04. SC-1
should name it. `/activities` with the same owner is 79,022 (100%) and is refused today only by the
accident of exceeding the cap — remove 29,023 activities and that refusal disappears.

### The two keys that cannot carry an SC-2 proof, and the cap's live branch

```
              m               | count
------------------------------+-------
 deal_assignees_total         |     0
 activities_assignee_not_null |     0
 activities_completed         | 74857
(3 rows)
```

An SC-2 proof on `assignee` asserts against an **empty** set; one on `owner` asserts against the
**whole** set (which the rule must refuse). Build SC-2 on `search=ltda` (13,355).

### SC-4's ladder — and the flat sequence, CONFIRMED

```
   dateto   | matched |  pct
------------+---------+-------
 2023-01-18 |   22111 | 27.98
 2023-02-09 |   23683 | 29.97
 2023-03-10 |   26200 | 33.16
 2023-04-15 |   28942 | 36.63
 2023-05-15 |   30117 | 38.11
 2023-06-08 |   31479 | 39.84
 2023-06-09 |   31530 | 39.90
 2023-06-10 |   31530 | 39.90
 2023-06-11 |   31530 | 39.90
 2023-06-12 |   31612 | 40.00
 2023-06-13 |   31679 | 40.09
(11 rows)
```

```
 due_date_null |       min_due       |       max_due       | total
---------------+---------------------+---------------------+-------
             0 | 2022-01-13 00:00:00 | 2030-05-07 00:00:00 | 79022
(1 row)
```

**2023-06-09, -06-10 and -06-11 all return exactly 31,530 — three consecutive daily widenings that
add ZERO rows.** Confirmed as the plan predicted. Last admitted DATE is `2023-06-11`; first refused
is `2023-06-12`. **50-06 must use this strictly-increasing eight-step ladder and must NOT insert
06-10 or 06-11**, because a step that changes no count would pass identically against a rule that
ignored `dateTo` between those dates:

`2023-01-18` 22,111 → `2023-02-09` 23,683 → `2023-03-10` 26,200 → `2023-04-15` 28,942 →
`2023-05-15` 30,117 → `2023-06-08` 31,479 → `2023-06-09` **31,530 last ADMITTED** → `2023-06-12`
**31,612 first REFUSED**.

### Derived allowances

```
organizations 46054 allowance= 18421
people        38348 allowance= 15339
deals         25195 allowance= 10078
activities    79022 allowance= 31608
```

Zero-based supporting figures for the doc comment (`stage=FlyWheel` 10,495 / 41.66%,
`type=Call` 35,821 / 45.33%, `type=Task` 33,529 / 42.43%) were measured and all match; the full
transcripts are in `50-MEASUREMENTS.md` §§4-7.

### DELTA — every figure judged

**20 figures MATCH exactly.** Volumes (4), `audit_log` (2), `search=a`, `search=ltda`, `search=u`,
`stage=FlyWheel`, `type=Call`, `type=Task`, `status=completed`, `deal_assignees`,
`activities.assignee_id`, the deals owner concentration, `due_date` nulls, the `due_date` range, and
all eleven ladder dates. One figure is NEW (`search=zzzz` = 0, the zero-match anchor). One
**DIFFERS**:

#### **D-1 — RESEARCH §8's `allowance` column was computed with `Math.round`, not `Math.floor`.**

`50-RESEARCH.md:774` states the allowance at 0.40 as **31,609**. The locked rule is
`floor(total × 0.40)`, which is **31,608**. Reproduced across the whole table:

```
0.1000 floor= 7902  round= 7902
0.1500 floor= 11853 round= 11853
0.2000 floor= 15804 round= 15804
0.2500 floor= 19755 round= 19756   <- §8 says 19,756
0.3000 floor= 23706 round= 23707   <- §8 says 23,707
0.3333 floor= 26340 round= 26341   <- §8 says 26,338 (neither; wrong by a third amount)
0.4000 floor= 31608 round= 31609   <- §8 says 31,609
0.5000 floor= 39511 round= 39511
```

**What it does not change:** the crossing bracket. 31,530 ≤ 31,608 still ADMITTED, 31,612 > 31,608
still REFUSED. SC-4's ladder stands.

**What it does change — and this is the loud part.** **50-04 and 50-06 must assert
`exportAllowance(79_022) === 31_608`.** A plan that copied 31,609 out of §8 as "the allowance" would
have gone RED against **correct** code — the nineteen-times-repeated defect of this milestone, in its
inverted form. 31,609 is the smallest REFUSED count, which is a genuinely useful number and a
different one. This plan asserts **both**, adjacent, so the distinction cannot be missed.

#### D-2 — the flat ladder days

RESEARCH §8 names `2023-06-09` as "last ADMITTED"; measured, 06-10 and 06-11 are also admitted at the
same count, so the last admitted DATE is 06-11. A precision correction, not a measurement change.

### Suite baseline — resolved by observation

| measure | STATE.md:30 | task env block | **MEASURED** | verdict |
|---|---|---|---|---|
| base tests | 5,659 / 32 | 5,696 / 32 | **5,696 passed / 32 skipped (5,728)** | **env block RIGHT, STATE stale by 37** |
| base files | 184 (+2) | 185 | **185 passed / 2 skipped (187)** | env block RIGHT |
| rsc | 8/8 | 8/8 | **2 files / 8 passed** | both right |
| `tsc --noEmit` | 0 | 0 | **exit 0** | both right |
| eslint | — | 0 err / 117 warn | **0 errors / 118 warnings** | errors right; **warning total differs by 1 — gate on errors only** |
| `test:db` | 288 / 13 | 299 / 13 EXIT 0 | **299 passed / 13 files, EXIT 0** | **env block RIGHT, STATE stale by 11** |

`npm run test:db` exits **0** on green — DEF-48-01 is closed (`37202ce`); the Phase 49 plans'
constraint text saying otherwise is stale.

### CONSEQUENCE to carry to 50-08 sign-off: the rule makes `EXPORT_ROW_CAP` unreachable

```
50001 of 79022 = 63.27% allowance(79022)= 31608 -> selectivity refuses first: true
completed 74857 of 79022 = 94.73% refused by selectivity: true
smallest total where a >cap set can still be within allowance: 125003 allowance= 50001
```

A >50,000-row set on a 79,022-row table is 63.27%, so selectivity refuses it first. The cap's **one**
live branch (`activities status=completed`, 74,857 / 94.73%) is now refused by selectivity, and the
cap becomes reachable again only above **125,003** rows.

**The cap is NOT to be removed** — it is defence in depth and fires again as the tables grow.
**`view-filters.test.ts:766-773` is NOT to be touched.** Recorded so sign-off states this
deliberately rather than discovering a "vacuous cap" and deleting a control.

---

## Task 2 — the rule, and five recorded reds

### RED transcript 1 — before the module existed (the weakest possible red)

```
 ❯ src/lib/export/__tests__/export-selectivity.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/export/__tests__/export-selectivity.test.ts [ ... ]
Error: Cannot find module '../export-selectivity' imported from /home/pedro/programming/pipelite/.claude/worktrees/agent-abb2099eb9f44799f/src/lib/export/__tests__/export-selectivity.test.ts
 ❯ src/lib/export/__tests__/export-selectivity.test.ts:32:1

 Test Files  1 failed (1)
      Tests  no tests
```

**0 tests ran.** A resolution error proves only that the import path is spelled right, which is why
the plan required a second red with the cells as the subject.

### RED transcript 2 — the cells as the subject

```
 ❯ src/lib/export/__tests__/export-selectivity.test.ts (27 tests | 1 failed) 113ms
     × states plainly that MIN_EXPORT_ROWS is a policy floor and NOT a measurement 55ms

 FAIL  ... > the constants document what is measured and what is not > states plainly that MIN_EXPORT_ROWS is a policy floor and NOT a measurement
AssertionError: expected '/**\n * THE MINIMUM SELECTIVITY RULE …' to match /policy floor/

- Expected:
/policy floor/

+ Received:
"/**
 * THE MINIMUM SELECTIVITY RULE (SEC-03). REFUSE AN EXPORT THAT NARROWS ALMOST NOTHING.
...

 Test Files  1 failed (1)
      Tests  1 failed | 26 passed (27)
```

A real red, and a useful one: the documentation gate demanded lowercase `policy floor` while the
module states it in capitals. Resolved by making that half case-insensitive (the requirement is the
statement, not its casing) and keeping `NOT measured` case-**sensitive** on purpose, because the
emphasis is the point — a lowercase "not measured" buried mid-sentence is precisely the footnote
treatment the comment exists to avoid. Both halves and the reasoning are in the test file.

### GREEN

```
 Test Files  1 passed (1)
      Tests  27 passed (27)
```

### The pure/IO split, verified rather than asserted

`vitest.config.ts` loads no env and has no setup file. A throwaway probe (added, run, deleted, never
committed) reported the actual value seen inside a base-project test under `env -u DATABASE_URL`:

```
AssertionError: expected 'undefined' to be '__REPORT_THE_ACTUAL_VALUE__' // Object.is equality
Expected: "__REPORT_THE_ACTUAL_VALUE__"
Received: "undefined"
```

`DATABASE_URL` is genuinely `undefined`, and the unit file passes 27/27 in that environment. The
split is real, not merely intended.

---

## The five ablations

`--reporter=verbose` (valid on vitest 4.1.11; `--reporter=basic` is not) gives the per-cell
breakdown, which is what makes ablation 1's claim checkable rather than rhetorical.

### Ablation 1 — delete `MIN_EXPORT_ROWS` from `exportAllowance` (pure fraction)

```
 ❯ src/lib/export/__tests__/export-selectivity.test.ts (27 tests | 7 failed) 31ms
     × is exactly MIN_EXPORT_ROWS at total = 0, and is not NaN 10ms
     × ADMITS 5 of 10 — a pure fraction would refuse it (5 > 4) 4ms
     × ADMITS 999 of 2,000 — a pure fraction would refuse it (999 > 800) 1ms
     × still REFUSES 1,001 of 2,000 — the floor does not swallow the rule 1ms
     × ADMITS 1 of 0 — the cell that DOES see a division, and the floor at zero 1ms
     × extracted two real function bodies, not two empty strings 2ms
     × computes the allowance by MULTIPLICATION with the floor applied outside it 1ms
```

```
AssertionError: expected +0 to be 1000 // Object.is equality
```
```
 FAIL  ... > ADMITS 5 of 10 — a pure fraction would refuse it (5 > 4)
AssertionError: expected { ok: false, matched: 5, …(2) } to deeply equal { ok: true }
```
```
 FAIL  ... > extracted two real function bodies, not two empty strings
   → expected '\n  return Math.floor(total * MAX_EXP…' to contain 'MIN_EXPORT_ROWS'
```

**THE A4 FINDING, PROVEN CELL BY CELL. Every live-anchored cell stayed GREEN:**

```
 ✓ is 18,421 on the live organizations table (46,054 rows)
 ✓ is 31,608 on the live activities table (79,022 rows) — NOT RESEARCH §8's 31,609
 ✓ floors rather than rounds, so the allowance is never above the fraction
 ✓ sits BETWEEN the export SC-1 refuses and the export SC-2 must still permit
 ✓ ADMITS exactly the allowance on the activities table (31,608 of 79,022)
 ✓ REFUSES one row above the allowance (31,609 of 79,022)
 ✓ brackets 50-06's live dateTo crossing in arithmetic first (31,530 vs 31,612)
 ✓ REFUSES SC-1's 44,254 of 46,054, carrying all three numbers the message needs
 ✓ ADMITS SC-2's 13,355 of 46,054 — the bound is not a removal of the feature
 ✓ REFUSES the REAL worst case: 25,195 of 25,195 deals under the 50,000 cap
```

**The floor is invisible to every live-data proof this phase will ever write.** Delete it and the
live cells applaud. The small-N unit cells are the only detector that exists — which is the entire
justification for the pure/IO split, now evidence rather than argument.

### Ablation 2 — rewrite the decision as `matched / total > MAX_EXPORT_FRACTION`

```
 ❯ src/lib/export/__tests__/export-selectivity.test.ts (27 tests | 4 failed) 53ms
     × ADMITS 5 of 10 — a pure fraction would refuse it (5 > 4) 21ms
     × ADMITS 999 of 2,000 — a pure fraction would refuse it (999 > 800) 2ms
     × ADMITS 1 of 0 — the cell that DOES see a division, and the floor at zero 4ms
     × contains NO division operator in either function body 1ms
```

```
 FAIL  ... > ADMITS 1 of 0 — the cell that DOES see a division, and the floor at zero
AssertionError: expected { ok: false, matched: 1, …(2) } to deeply equal { ok: true }
```
```
 FAIL  ... > contains NO division operator in either function body
AssertionError: expected true to be false // Object.is equality
 ❯ src/lib/export/__tests__/export-selectivity.test.ts:390:40
    390|     expect(decisionBody.includes("/")).toBe(false)
```

**`(0, 0)` STAYED GREEN — which is the vacuity this plan contained. See Deviations D-A below.**

### Ablation 3 — `MAX_EXPORT_FRACTION = 0.99`

```
 ❯ src/lib/export/__tests__/export-selectivity.test.ts (27 tests | 9 failed) 106ms
     × is 18,421 on the live organizations table (46,054 rows) 39ms
     × is 31,608 on the live activities table (79,022 rows) — NOT RESEARCH §8's 31,609 3ms
     × sits BETWEEN the export SC-1 refuses and the export SC-2 must still permit 4ms
     × exposes the two constants as the locked values 8ms
     × still REFUSES 1,001 of 2,000 — the floor does not swallow the rule 2ms
     × REFUSES one row above the allowance (31,609 of 79,022) 6ms
     × brackets 50-06's live dateTo crossing in arithmetic first (31,530 vs 31,612) 1ms
     × REFUSES SC-1's 44,254 of 46,054, carrying all three numbers the message needs 2ms
     × REFUSES the REAL worst case: 25,195 of 25,195 deals under the 50,000 cap 6ms
```

```
 FAIL  ... > REFUSES SC-1's 44,254 of 46,054, carrying all three numbers the message needs
AssertionError: expected { ok: true } to deeply equal { ok: false, matched: 44254, …(2) }

- Expected
+ Received

  {
-   "allowance": 18421,
-   "matched": 44254,
-   "ok": false,
-   "total": 46054,
```
```
 FAIL  ... > sits BETWEEN the export SC-1 refuses and the export SC-2 must still permit
AssertionError: expected 45593 to be less than 44254
 ❯ src/lib/export/__tests__/export-selectivity.test.ts:188:41
    188|     expect(exportAllowance(ORGS_TOTAL)).toBeLessThan(ORGS_SEARCH_A)
```

**SC-1's defect literally returns**: 44,254 of 46,054 comes back `{ ok: true }`.

### Ablation 4 — `MAX_EXPORT_FRACTION = 0.01` (the SC-2-shaped failure)

```
 ❯ src/lib/export/__tests__/export-selectivity.test.ts (27 tests | 11 failed) 33ms
     × is 18,421 on the live organizations table (46,054 rows) 9ms
     × is 31,608 on the live activities table (79,022 rows) — NOT RESEARCH §8's 31,609 1ms
     × floors rather than rounds, so the allowance is never above the fraction 1ms
     × sits BETWEEN the export SC-1 refuses and the export SC-2 must still permit 1ms
     × exposes the two constants as the locked values 1ms
     × ADMITS exactly the allowance on the activities table (31,608 of 79,022) 3ms
     × REFUSES one row above the allowance (31,609 of 79,022) 1ms
     × brackets 50-06's live dateTo crossing in arithmetic first (31,530 vs 31,612) 1ms
     × REFUSES SC-1's 44,254 of 46,054, carrying all three numbers the message needs 1ms
     × ADMITS SC-2's 13,355 of 46,054 — the bound is not a removal of the feature 1ms
     × REFUSES the REAL worst case: 25,195 of 25,195 deals under the 50,000 cap 1ms
```

```
 FAIL  ... > ADMITS SC-2's 13,355 of 46,054 — the bound is not a removal of the feature
AssertionError: expected { ok: false, matched: 13355, …(2) } to deeply equal { ok: true }

- Expected
+ Received

  {
-   "ok": true,
+   "allowance": 1000,
+   "matched": 13355,
```
```
 FAIL  ... > sits BETWEEN the export SC-1 refuses and the export SC-2 must still permit
AssertionError: expected 1000 to be greater than 13355
 ❯ src/lib/export/__tests__/export-selectivity.test.ts:189:41
    189|     expect(exportAllowance(ORGS_TOTAL)).toBeGreaterThan(ORGS_SEARCH_LT…
```

The feature is gone and every refusal still works. **Line 188 reddens at 0.99 and line 189 at 0.01 —
different ablations, adjacent lines.** Neither direction alone would be a gate; that is why both are
asserted.

### Ablation 5 — the gate-laundering move

`viewer?: { role: string }` added to the input and `if (input.viewer?.role === "admin") return { ok:
true }` inserted before the rule. Optional, so it compiles and every existing caller is unaffected —
which is exactly how the real move would be made.

```
$ ./node_modules/.bin/tsc --noEmit
TSC_EXIT=0
```

```
 ❯ src/lib/export/__tests__/export-selectivity.test.ts (27 tests | 1 failed) 25ms
     × contains NO admin gate and NO role token — the E-9 invariant, asserted one module away 9ms

 FAIL  ... > contains NO admin gate and NO role token — the E-9 invariant, asserted one module away
AssertionError: src/lib/export/export-selectivity.ts mentions the admin role. There is NO admin branch in this phase: view-filters.test.ts:736-747 forbids one in export-action.ts, and moving it here to keep that gate green would be gate-laundering. /admin/export is already a separate role-gated unbounded export.: expected true to be false // Object.is equality
```

And the shipped gate, under the same ablation:

```
$ ./node_modules/.bin/vitest run src/lib/export/__tests__/view-filters.test.ts
 Test Files  1 passed (1)
      Tests  49 passed (49)
```

**THE LAUNDERING IS PROVEN.** With an admin branch living in this module:

| observer | verdict under ablation 5 |
|---|---|
| `view-filters.test.ts` (the shipped E-9 gate) | **49/49 GREEN** |
| `tsc --noEmit` | **0 errors** |
| 26 of this file's 27 cells | **GREEN** |
| the new no-admin-token cell | **RED — the only observer that notices** |

The escape is closed from both sides. Without this one cell the relocation is invisible to the entire
toolchain.

**No ablation came back green.** All five reddened, and each reddened the cells the plan predicted
plus, in three cases, more.

---

## Deviations from Plan

### D-A. [Rule 1 — vacuous gate in the plan] The `(0, 0)` cell cannot detect a division; a `(1, 0)` cell was ADDED

**Found during:** Task 2, writing the behavior block. **Confirmed by:** ablation 2.

The plan specified: *"`(0, 0)` → ADMITTED, and every numeric field on the returned object passes
`Number.isNaN` as false. RED if the rule divides."* Both halves fail as written:

1. **`(0, 0)` does not redden on a division.** `0 / 0` is `NaN`, `NaN > 0.4` is `false`, so the
   division ablation ADMITS — the cell stays green. Ablation 2's transcript above confirms it: the
   `(0,0)` cell is absent from the four failures.
2. **The NaN sweep was vacuous.** A `{ ok: true }` decision has **no numeric fields at all**, so
   "every numeric field passes `Number.isNaN`" iterates an empty set. A gate that iterates nothing
   cannot fail.

Left alone, this would have been the phase's twentieth unfalsifiable check — and it would have been
cited as the empty-table proof.

**Fixed three ways, all committed:**

- **Added a `(1, 0)` cell** — the real discriminator. It separates all three candidate spellings:
  correct → allowance 1,000 → `1 > 1000` false → ADMITTED; floor deleted → allowance 0 → refused;
  division → `1/0 = Infinity > 0.4` → refused. **It is the only behavioural cell in the file that
  reddens on ablation 2.**
- **Moved the NaN sweep onto a REFUSED payload** (`44,254 / 46,054`), which has three real numeric
  fields, and strengthened it to `isNaN` + `isFinite` + `isInteger` per field.
- **Labelled `(0, 0)` honestly in the test file**, naming which cells are and are not the detector,
  so a later reader cannot mistake it for one. The plan's must-have truth ("total = 0 admits,
  produces no NaN anywhere") is still asserted — it is simply no longer the *evidence* for the
  no-division claim.

### D-B. [Rule 3 — plan ambiguity resolved] The structural body assertion, per-body rather than combined

The plan asked that *"the extracted bodies of `exportAllowance` and `decideSelectivity` … mention
`MIN_EXPORT_ROWS` and `Math.floor`, and contain NO `/`."* Read literally, `decideSelectivity`'s body
would have to mention both tokens — which is only achievable by **inlining the arithmetic a second
time**, giving two places the rule is written and a way for the verdict and the reported allowance to
disagree.

Resolved per-body, which preserves the intent (no division, no empty extraction) without duplicating
the rule:

| body | asserted |
|---|---|
| both | non-empty, and contains no `/` |
| `exportAllowance` | matches `/Math\.max\(MIN_EXPORT_ROWS/` (the plan's own `key_links` pattern), contains `Math.floor`, `MAX_EXPORT_FRACTION`, `*` |
| `decideSelectivity` | contains `exportAllowance` (it must USE the rule, not reinvent it), contains `>`, does **not** contain `>=` |

The `>=` negative is an addition: it pins the strictness structurally as well as behaviourally.

### D-C. [Rule 2 — hardening] The body extractor steps over the parameter list, and refuses to guess

`decideSelectivity`'s parameter is an inline object type — `input: { matched: number; total: number
}` — so the first `{` after the function name belongs to the **signature**. A naive `indexOf("{")`
would have extracted that type as "the body", and `not.toContain("/")` would then have passed against
a string containing no arithmetic. The extractor paren-matches the parameter list first, and **throws
rather than extracting** if the return-type annotation ever gains a brace. It also throws (not
returns `""`) for an absent function, which is asserted.

### D-D. [documented] `--reporter=verbose` used for the ablations

The plan forbids `--reporter=basic` (invalid on vitest 4.1.11). `verbose` is valid and is what makes
ablation 1's "every live cell stayed green" claim a transcript rather than an inference.

**No architectural deviations. No package installed** (T-50-01-SC: `Math` and the existing `vitest`
are the whole toolchain).

---

## Notes for later plans

- **`exportAllowance(79_022)` is `31_608`.** Not 31,609. See D-1. **50-04 and 50-06.**
- **50-06's ladder:** the eight strictly-increasing dates above. Do not insert 06-10 or 06-11.
- **SC-2 must be built on `search=ltda`** (13,355), never `owner` (whole set) or `assignee` (empty).
- **SC-5 needs a positive observation** — `audit_log` 214 → 215 and `entity_type='export'` 0 → 1. An
  "unchanged" assertion passes today.
- **SC-1 should name `/deals` + `owner=ef4acac9…` at 100.00%**, not `search=a` at 96.09%.
- **`EXPORT_ROW_CAP` becomes unreachable below 125,003 rows** — carry to 50-08, do not remove the cap,
  do not touch `view-filters.test.ts:766-773`.
- **`view-filters.test.ts` is byte-identical to base** (`git diff 9f8cfb4 HEAD` on it is empty).
- Small observation for the next gate author: my own header comment contains the *words*
  `Date.now()` / `performance.now()` while stating their absence, so a naive grep gate on this file
  would report a clock read. `suite-timing-hygiene.test.ts` parses the AST instead and is green — a
  live demonstration of why it does that.

---

## HANDOFF — STATE.md / ROADMAP.md text for the orchestrator

**This plan edited neither file.** The orchestrator owns both. Exact text to apply:

### STATE.md

- **Advance:** Current Plan 50-01 → 50-02.
- **Correct the stale baseline at `:30`.** It reads **5,659 / 32 over 184+2 files** and **db 288 /
  13**; the tree at base commit `9f8cfb4` measures **5,696 passed / 32 skipped over 185 files** and
  **db 299 / 13, EXIT 0**. Replace with the post-plan values:

  ```
  Suite baseline: 5723 passed / 32 skipped over 186 files (base) + 8/8 (rsc);
  tsc --noEmit 0; eslint 0 errors; test:db 299 passed / 13 files, EXIT 0.
  Measured 2026-08-27 at 50-01. STATE's previous 5659/184 and db 288 were stale
  by 37 base and 11 db tests.
  ```

- **Performance metric row:** `50 | 01 | ~25 min | 2 tasks | 3 files`
- **Decisions to add:**
  - `50-01: MAX_EXPORT_FRACTION = 0.40, measured — inside the 12.66 pp gap between search=ltda (29.00%, admitted) and stage=FlyWheel (41.66%, refused); 0.50 rejected for sitting 1.02 pp below search=u (51.02%).`
  - `50-01: MIN_EXPORT_ROWS = 1,000 is a POLICY FLOOR, not a measurement, and the code says so. No live database here can reach the branch it guards (smallest table 25,195 rows; binding point 2,500).`
  - `50-01: the allowance is a MULTIPLICATION — max(MIN_EXPORT_ROWS, floor(total * MAX_EXPORT_FRACTION)) — so total = 0 needs no special case.`
  - `50-01: NO admin branch. The pure module asserts its own absence of admin/role tokens, closing the gate-laundering relocation that view-filters.test.ts:736-747 alone cannot see.`
- **Blocker / correction to record:**
  - `DEF-50-01: 50-RESEARCH.md:774 states the 0.40 allowance as 31,609; it was computed with Math.round. The locked rule is Math.floor, so the activities allowance is 31,608 and 31,609 is the smallest REFUSED count. 50-04 and 50-06 must use 31,608. Recorded in 50-MEASUREMENTS.md DELTA D-1.`
- **Session:** `Stopped At: Completed 50-01-PLAN.md` · `Resume File: None`

### ROADMAP.md

- Phase 50 progress row: **1 of 8 plans complete**.
- Requirement **SEC-03**: still in progress — 50-01 delivered the decision function only; no call
  site is wired until 50-04.

### REQUIREMENTS.md

**Do not mark SEC-03 complete.** This plan built the arithmetic; nothing calls it yet.

---

## Verification

| check | result |
|---|---|
| `vitest run src/lib/export/__tests__/export-selectivity.test.ts` | **27 passed (27)** |
| same, with `env -u DATABASE_URL` | **27 passed (27)**, `DATABASE_URL` proven `undefined` |
| `vitest run` (base) | **186 passed / 2 skipped (188) files; 5723 passed / 32 skipped (5755)** |
| `vitest run --config vitest.rsc.config.ts` | **2 files / 8 passed** |
| `tsc --noEmit` | **exit 0** |
| `eslint` | **0 errors** / 118 warnings |
| `npm run test:db` | **299 passed / 13 files, EXIT 0** |
| `git diff --exit-code -- src/` | **clean (0)** after all five ablations |
| `git diff 9f8cfb4 HEAD -- view-filters.test.ts` | **empty — byte-identical** |
| untracked files | **none** |
| `Date.now` / `performance.now` in either new file | **0 call sites** (1 mention, in a comment stating their absence) |

Baseline was 5,696; 27 cells added; 5,723 measured. Exact.

---

## Self-Check: PASSED

Files:
- FOUND: `src/lib/export/export-selectivity.ts` (189 lines, ≥ 90 required, contains `MIN_EXPORT_ROWS`)
- FOUND: `src/lib/export/__tests__/export-selectivity.test.ts` (489 lines, ≥ 200 required)
- FOUND: `.planning/phases/50-export-authorization/50-MEASUREMENTS.md` (475 lines, contains `46054`)

Commits:
- FOUND: `94cd0f0` docs(50-01): re-measure the live baseline at execution time
- FOUND: `fdd5b2d` feat(50-01): the pure minimum selectivity rule (SEC-03)

`key_links` pattern `Math\.max\(MIN_EXPORT_ROWS` — present in `exportAllowance` and asserted by the
structural cell.

No STATE.md or ROADMAP.md edits. No `git clean`, no `git stash`, no blanket reset; every restore was
`git checkout -- <single file>` after the work was committed.
