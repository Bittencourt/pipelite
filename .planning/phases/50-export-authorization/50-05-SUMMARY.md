---
phase: 50-export-authorization
plan: 05
subsystem: export-authorization
tags: [sec-03, selectivity, export, i18n, source-gate, enumeration]
requires:
  - "50-01 decideSelectivity / exportAllowance (src/lib/export/export-selectivity.ts)"
  - "50-02 views.export.tooBroad copy in all three locales"
  - "50-04 countExportMatches (src/lib/export/export-count.ts)"
provides:
  - "ViewExportResult member { success: false; error: 'too_broad'; matched: number; total: number }"
  - "the selectivity refusal between guardExportInput and fetchFilteredData"
  - "the views.export.tooBroad toast branch in saved-views-bar.tsx"
  - "src/lib/export/__tests__/export-call-sites.test.ts — the repo-wide six-call-site enumeration gate"
affects:
  - "src/lib/views/export-action.ts"
  - "src/components/views/saved-views-bar.tsx"
  - "50-06 (the live behavioural proof consumes the too_broad payload)"
tech-stack:
  added: []
  patterns:
    - "per-error-code payload on a discriminated action result (extends the existing too_many/max shape)"
    - "repo-walk source gate with a measured named-integer corpus floor (third instance; reused from suite-hook-hygiene.test.ts)"
    - "sorted toEqual over a path SET so the failure output names the offending file"
key-files:
  created:
    - "src/lib/export/__tests__/export-call-sites.test.ts (416 lines, 10 cells)"
  modified:
    - "src/lib/views/export-action.ts"
    - "src/components/views/saved-views-bar.tsx"
    - "src/lib/export/__tests__/view-filters.test.ts"
    - "src/components/views/__tests__/saved-views-bar-wiring.test.ts"
decisions:
  - "no admin branch anywhere on the path; the bound applies to every authenticated user and the shipped E-9 gate is byte-identical"
  - "EXPORT_ROW_CAP kept unchanged; its exact re-entry threshold is 125,003 rows, not the round 125,000"
  - "a Rule 2 detector (cell 15) was added because the plan's own ablation 3 proved dropping the toast values is invisible"
metrics:
  duration: "~35 min"
  completed: "2026-08-27"
  tasks: 3
  commits: 7
---

# Phase 50 Plan 05: Wire the Selectivity Rule into the Export Action — Summary

A broad view export is now refused between the cheap sync guard and the read, carrying the two
numbers the count produced; the bar renders them in the user's language on a branch a named gate can
see; and the six `fetchFilteredData` call sites are pinned repo-wide with a seventh added on purpose
and watched fail.

## What shipped

| # | Change | File |
|---|---|---|
| 1 | `too_broad` union member + the count/decide/refuse block between the guard and the fetch | `src/lib/views/export-action.ts` |
| 2 | extended ordering cell, call-count cell, payload cell | `src/lib/export/__tests__/view-filters.test.ts` |
| 3 | `too_broad` toast branch before the generic fallback | `src/components/views/saved-views-bar.tsx` |
| 4 | `EXPORT_KEYS` 3 → 4, plus new cell 15 (Rule 2) | `src/components/views/__tests__/saved-views-bar-wiring.test.ts` |
| 5 | the repo-wide enumeration gate, 10 cells | `src/lib/export/__tests__/export-call-sites.test.ts` (new) |

**Commits**, in order: `f86f3d7` (RED) → `2884124` (GREEN) → `f954b50` (RED) → `df82a72` (GREEN) →
`e40a6a9` (Rule 2 detector) → `69d406f` (enumeration gate) → `4de96a4` (numeric correction).

## Success criteria

- **A broad export is refused between the guard and the fetch, carrying the counted numbers.** Yes.
  Ordering asserted structurally as `authAt < guardAt < countAt < decideAt < fetchAt`, each index
  `> -1` first.
- **Deleting the refusal reddens two independent named assertions, both observed.** Yes — and it is
  five assertions across two files, not two. Transcripts below (T1-A1, T3-F2).
- **`export-action.ts` contains no `admin`/`role` token; the shipped E-9 gate green and
  byte-identical.** Verified two ways: `git diff -U0` on the test file removes exactly 3 lines, all
  inside the ordering cell I was told to extend; and md5 of the three shipped cells is unchanged.

  | shipped cell | md5 before | md5 after |
  |---|---|---|
  | no-admin (was `:961-972`, now `:1150-1161`) | `ad65650aec05e2ec09c68d125cc58b4e` | `ad65650aec05e2ec09c68d125cc58b4e` |
  | cap (was `:974-989`, now `:1163-1178`) | `a726748a1edc18b43278d8dc16ac68da` | `a726748a1edc18b43278d8dc16ac68da` |
  | recordExport (was `:1005-1037`, now `:1194-1226`) | `3fc10e413c6107c65c3347229a2c3e18` | `3fc10e413c6107c65c3347229a2c3e18` |

- **`maxRows: EXPORT_ROW_CAP`, the literal `format`/`includeCustomFields`, `filters: guarded.filters`
  and the awaited `recordExport` unchanged and green.** Yes, and ablation 5 proves the cap cell
  still fires.
- **The client renders `views.export.tooBroad` with both numbers on a branch the shipped gate sees.**
  Yes, plus a new cell that can see the *values* being dropped, which the shipped gate cannot.
- **Six call sites, each classified, seventh added and observed failing.** Yes, twice (a server
  action and an API route).
- **The `EXPORT_ROW_CAP` consequence recorded with its re-entry threshold, cap kept.** Yes, at the
  exact 125,003.

## Fourteen ablation transcripts

### Task 1 — the action and the ordering gate

Baseline before any change: `view-filters.test.ts` **54 passed (54)**.
RED after adding the three cells, before touching the action: **3 failed | 53 passed (56)**.

**T1-A1 — delete the `decideSelectivity` call and the `too_broad` return. BOTH HALVES.**

Half one, the reddened cells (3 of them):

```
AssertionError: src/lib/views/export-action.ts never calls decideSelectivity: expected -1 to be greater than -1
 ❯ view-filters.test.ts:1052:70   (the extended ordering cell)

AssertionError: src/lib/views/export-action.ts does not call decideSelectivity exactly once.:
  expected [] to have a length of 1 but got +0
 ❯ view-filters.test.ts:1106:7    (the call-count cell)

AssertionError: src/lib/views/export-action.ts has no single `return { … error: "too_broad" … }`.
  The refusal is what the client turns into views.export.tooBroad; without it a broad export falls
  through to the generic failure toast and the user is told the product is broken.:
  expected [] to have a length of 1 but got +0
 ❯ view-filters.test.ts:1134:7    (the payload cell)
```

Half two, the four shipped gates under the SAME sabotage — each run individually with `-t`:

```
-t "contains NO admin gate"            Test Files 1 passed (1)   Tests 1 passed | 55 skipped (56)
-t "passes EXPORT_ROW_CAP as maxRows"  Test Files 1 passed (1)   Tests 1 passed | 55 skipped (56)
-t "records the export AFTER the fetch" Test Files 1 passed (1)  Tests 1 passed | 55 skipped (56)
```

(the ordering cell's two ORIGINAL halves, `authAt < fetchAt` and `guardAt < fetchAt`, are inside the
extended cell and both still evaluate true — the cell falls on the `decideAt > -1` anti-vacuity
guard, not on either original comparison.)

And the whole repository under the same sabotage:

```
Test Files  1 failed | 186 passed (187)
Tests       3 failed | 5749 passed | 4 skipped (5756)
```

**One file red out of 187.** Before this plan, the same sabotage — removing the entire SEC-03
control — reddened *nothing at all*. That is the measurement that justifies the call-count cell
existing.

**T1-A2 — move the count above `guardExportInput`.**

```
AssertionError: src/lib/views/export-action.ts counts BEFORE it guards. Every request the guard
  already refuses for free — an empty map, a blank search, a crafted entityType — would now cost two
  count queries first. view-export-guard.ts:18-19 exists to keep that refusal database-free.:
  expected 1216 to be less than 1095
 ❯ view-filters.test.ts:1069:7
Test Files  1 failed (1)   Tests  1 failed | 55 passed (56)
```

**T1-A3 — return `{ matched: 0, total: 0 }`.**

```
AssertionError: expected '\n      success: false,\n      error:…' to match
  /matched:\s*[A-Za-z_$][A-Za-z0-9_$]*\.…/
- Expected: /matched:\s*[A-Za-z_$][A-Za-z0-9_$]*\.matched\b/
+ Received: "\n      success: false,\n      error: \"too_broad\",\n      matched: 0,\n      total: 0,\n    "
 ❯ view-filters.test.ts:1140:21
Test Files  1 failed (1)   Tests  1 failed | 55 passed (56)
```

**T1-A4 — add a `session.user.role === "admin"` short-circuit. The shipped E-9 gate, driven red on
purpose and restored immediately.**

```
AssertionError: src/lib/views/export-action.ts mentions the admin role. E-9: "Export is available to
  every authenticated user, not admin-gated. That is Decision 2's direct consequence: the guard
  replaces the gate." An admin gate added here would silently un-widen a recorded widening, and it
  would do so invisibly, because this deployment's two admin accounts would still pass every test.:
  expected true to be false // Object.is equality
 ❯ view-filters.test.ts:1159:7
Test Files  1 failed (1)   Tests  1 failed | 55 passed (56)
```

**T1-A5 — thread the computed allowance through `maxRows` instead of returning early. The design
the phase rejected; its red is the evidence that rejecting it was necessary.**

```
AssertionError: expected '{\n    entityType: input.entityType,\…' to contain 'maxRows: EXPORT_ROW_CAP'
- Expected: maxRows: EXPORT_ROW_CAP
+ Received: {
+     entityType: input.entityType,
+     format: "csv",
+     includeCustomFields: true,
+     filters: guarded.filters,
+     maxRows: exportAllowance(counts.total),
+   }
 ❯ view-filters.test.ts:1168:22
Test Files  1 failed (1)   Tests  2 failed | 54 passed (56)
```

Two cells, not one: the payload cell also falls, because threading the allowance loses the exact
`matched` the message needs — which is the second half of the argument for rejecting the design.

Restored: `git diff --exit-code -- src/` exit 0; 56/56 green; `tsc --noEmit` 0 errors.

### Task 2 — the toast

RED after adding `"export.tooBroad"` to `EXPORT_KEYS`, before touching the component:
**1 failed | 14 passed (15)**, with the assertion `expected '"use client"\n\n\n\nimport { ChevronD…'
to contain 't("export.tooBroad"'`.

**T2-A1 — remove the `too_broad` branch so it falls through to `tBulk("error.exportFailed")`. This
is the SC-3-shaped failure.**

```
AssertionError: src/components/views/saved-views-bar.tsx: views.export.tooBroad is never referenced.
  An unreferenced key is a sentence that was written, translated into three locales, and then never
  shown. […]: expected '"use client"\n\n\n\nimport { ChevronD…' to contain 't("export.tooBroad"'
 ❯ saved-views-bar-wiring.test.ts:833:9
Test Files  1 failed (1)   Tests  1 failed | 14 passed (15)
```

**T2-A2 — keep the branch, call `t("export.refused")` instead. Does anything ELSE notice?**

```
Test Files  1 failed (1)   Tests  1 failed | 14 passed (15)     (cell 14, same key assertion)
tsc --noEmit                TSC_EXIT=0
whole base suite            Test Files 1 failed | 186 passed (187)
                            Tests 1 failed | 5751 passed | 4 skipped (5756)
```

**Nothing else notices, and that is the correct division of labour but must be said rather than
assumed.** `tsc` accepts a `values` object on a key that ignores it. The DISTINCTNESS of the two
sentences — that `refused` says "no filter was applied" and `tooBroad` says "matches {matched} of
{total}" — is proven by 50-02's `export-too-broad-copy.test.ts` and `locale-parity.test.ts`, not by
this file. This file proves only that the component references the key.

**T2-A3 — pass no values: `t("export.tooBroad")`. THE PLAN ASKED FOR THIS OUTCOME AS A FINDING, AND
IT IS SILENT.** See the finding section below.

```
tsc --noEmit                             TSC_EXIT=0
saved-views-bar-wiring.test.ts           Test Files 1 passed (1)   Tests 15 passed (15)
whole base suite                         Test Files 187 passed (187)
                                         Tests 5752 passed | 4 skipped (5756)
```

**T2-A4 — add `"export.doesNotExist"` to `EXPORT_KEYS`. The anti-vacuity check on the list itself.**

```
AssertionError: src/components/views/saved-views-bar.tsx: views.export.doesNotExist is never
  referenced. […]: expected '"use client"\n\n\n\nimport { ChevronD…' to contain
  't("export.doesNotExist"'
Test Files  1 failed (1)   Tests  1 failed | 15 passed (16)
```

The loop reads the component, not the list.

**T2-A5 and T2-A6 — the two falsifications of the NEW cell 15** (added as a Rule 2 deviation, see
below):

```
(a) both values dropped:
AssertionError: src/components/views/saved-views-bar.tsx: the tooBroad toast does not pass `matched`
  from the action's result. MEASURED: dropping both values throws nothing, fails no type check and
  reddens no other test in 187 files — it renders the raw template, "This filter matches {matched}
  of {total} records", to the user in both the development and production use-intl builds.:
  expected '"export.tooBroad"' to match /matched:\s*result\.matched\b/
 ❯ saved-views-bar-wiring.test.ts:908:9

(b) total replaced by a client-side literal:
AssertionError: […] does not pass `total` from the action's result […]:
  expected '"export.tooBroad", { matched: result.…' to match /total:\s*result\.total\b/
+ Received: "\"export.tooBroad\", { matched: result.matched, total: 0 }"
Test Files  1 failed (1)   Tests  1 failed | 15 passed (16)
```

### Task 3 — the enumeration gate

**T3-F1 — a real seventh call site. THE FALSIFICATION THE PHASE OBJECTIVE ASKED FOR.**

Created `src/app/organizations/scratch-export.ts` — a genuine `"use server"` action that imports
`fetchFilteredData` and calls it with no filters and no cap:

```
AssertionError: the set of production files calling fetchFilteredData has changed. Every one of them
  reads rows out of a customer table, so each needs a stated bound (SEC-03). If you added a call
  site: bound it, then add it to EXPECTED_CALL_SITES together with its classification in cell 3. Do
  NOT add the path without the classification.: expected [ …(7) ] to deeply equal [ …(6) ]

  [
    "src/app/activities/actions.ts",
    "src/app/admin/export/actions.ts",
    "src/app/deals/actions.ts",
    "src/app/organizations/actions.ts",
+   "src/app/organizations/scratch-export.ts",
    "src/app/people/actions.ts",
    "src/lib/views/export-action.ts",
  ]
 ❯ export-call-sites.test.ts:256:7
Test Files  1 failed (1)   Tests  1 failed | 9 passed (10)
```

The failure NAMES the file, which is why the assertion is a sorted `toEqual` and not a count.

And what else noticed an unbounded, unguarded, un-audited whole-table export action:

```
whole base suite   Test Files 1 failed | 187 passed (188)
                   Tests 1 failed | 5762 passed | 4 skipped (5767)
tsc --noEmit       TSC_EXIT=0
```

**Nothing but this gate.** Scratch file deleted; gate green at **10 passed (10)**; `ls
src/app/organizations/` confirms it is gone.

**T3-F2 — delete the `decideSelectivity(` call from site 1. A1 now reddens TWO files.**

```
AssertionError: src/lib/views/export-action.ts lost its decideSelectivity call. The count still runs
  and its answer is now discarded, so `search=a` walks out 96.09% of the customer table again.:
  expected [] to have a length of 1 but got +0
 ❯ export-call-sites.test.ts:296:7                                        (cell 3a)

AssertionError: decideSelectivity is called from more than one production file (or from none). A
  second caller is a second view-export path, and only the one in src/lib/views/export-action.ts is
  bounded by all three controls this phase relies on.: expected [] to deeply equal
  [ 'src/lib/views/export-action.ts' ]                                    (cell 4)

export-call-sites.test.ts   Tests 2 failed | 8 passed (10)
view-filters.test.ts        Tests 3 failed | 53 passed (56)
```

**The useful outcome, stated:** ablation A1 went from reddening 3 assertions in 1 file to reddening
**5 assertions across 2 independent files**. The two detectors do not share a helper, a corpus or a
read: `view-filters.test.ts` reads one file by path, `export-call-sites.test.ts` finds it by walking
the tree. Deleting one file's gate does not silence the other.

**T3-F3 — remove the role refusal from `src/app/admin/export/actions.ts`.**

```
AssertionError: src/app/admin/export/actions.ts no longer reads a role. It performs an UNCAPPED,
  UNFILTERED fetch on a whole entity table; the role refusal is the only thing standing in front of
  it.: expected false to be true // Object.is equality
Test Files  1 failed (1)   Tests  1 failed | 9 passed (10)

whole base suite   Test Files 1 failed | 187 passed (188)
                   Tests 1 failed | 5762 passed | 4 skipped (5767)
```

**Only cell 3b noticed.** Turning the admin full export into an unbounded export reachable by any
authenticated session reddened *nothing* in this repository before this plan. That is a
pre-existing detector gap this plan happens to close, and it is a real exposure shape whose detector
should exist regardless of SEC-03.

**T3-F4 — break the walk. TWO VERSIONS, because the first one did not exercise the cell.**

(a) `SRC_ROOT = "src-does-not-exist"` — the plan predicted "cell 1 RED on the corpus floor". That is
**not what happens**:

```
⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯
Error: ENOENT: no such file or directory, scandir '…/src-does-not-exist'
 ❯ walkProductionFiles export-call-sites.test.ts:154:23
Test Files  1 failed (1)   Tests  no tests
```

The walk runs at module scope, so it throws during collection and **no cell runs at all**. Loud and
non-zero, but the floor cell's own red is NOT observed by this ablation. So:

(b) `SRC_ROOT = "src/lib/export"` — a REAL directory with a small corpus, which is the failure shape
a pruning bug or a stopped recursion actually produces:

```
AssertionError: the production walk under src/lib/export/ found only 7 files, below the floor of 400
  (measured: 532). A wrong root, a pruning bug or a recursion that stopped recursing yields an empty
  corpus — and an EMPTY corpus satisfies every negative assertion in this file perfectly.:
  expected 7 to be greater than or equal to 400
 ❯ export-call-sites.test.ts:231:7

× 1. the walk found a real corpus — the floor under every cell below
× 2. EXACTLY these six production files call fetchFilteredData — both directions
× 4. guardExportInput, countExportMatches and decideSelectivity have ONE production caller each
× 5. NO file under src/app/api calls fetchFilteredData (M-14)
Test Files  1 failed (1)   Tests  4 failed | 6 passed (10)
```

All four walk-dependent cells fall, **including cell 5's own `MIN_API_FILES` floor** — which is the
one that would otherwise have passed vacuously on an empty set. Cells 3a/3b/3c stay green because
they read named paths directly rather than through the walk; that is deliberate and now stated.

**T3-F5 — add a `fetchFilteredData(` call under `src/app/api`.**

Created `src/app/api/v1/scratch-export-route/route.ts`, a real `GET` handler:

```
AssertionError: the set of production files calling fetchFilteredData has changed […]:
  expected [ …(7) ] to deeply equal [ …(6) ]
+   "src/app/api/v1/scratch-export-route/route.ts",                        (cell 2)

AssertionError: these src/app/api files call fetchFilteredData:
  src/app/api/v1/scratch-export-route/route.ts. M-14 forbids an export route; a route would need its
  own guard, its own cap and its own selectivity rule, and every one of them would be a second copy
  free to drift.: expected [ Array(1) ] to deeply equal []
 ❯ export-call-sites.test.ts:414:7                                         (cell 5)
```

Both cells red, as predicted. File and directory removed;
`git ls-files --others --exclude-standard -- src/` prints nothing; `git diff --exit-code -- src/`
exits 0.

## Findings

### FINDING 1 — the plan's predicted pre-Task-2 red DOES NOT EXIST

The plan states: *"Run the whole base suite — `saved-views-bar-wiring.test.ts` will be red until Task
2, because the component does not yet handle the new code; confirm the red is ONLY that and record
it, so Task 2's green means something."*

Measured immediately after Task 1's implementation commit, with the component untouched:

```
whole base suite               Test Files 187 passed (187)
                               Tests 5752 passed | 4 skipped (5756)
saved-views-bar-wiring.test.ts Test Files 1 passed (1)   Tests 15 passed (15)
tsc --noEmit                   0 errors
```

**Fully green.** The premise is wrong for two independent reasons, and both matter:

1. `saved-views-bar-wiring.test.ts` is a SOURCE-READING gate. Adding a union member to the action
   does not change the component's source, so it has nothing to see.
2. `tsc` does not require exhaustiveness on the `result.error` chain, because the chain ends in an
   unconditional `else` branch. A new refusal code is not a type error.

**So the consequence, which is the part worth keeping:** adding a new refusal code to
`ViewExportResult` and shipping *only* the server half reddens **nothing** — no test, no type check.
The user silently receives the generic "Failed to export" message, which is exactly threat
T-50-05-09 and exactly the SC-3 collapse the phase is trying to prevent. The single thing standing
between that outcome and production is the hand-maintained `EXPORT_KEYS` array. That is a thin
defence for a security-message path, and it is recorded as **DEF-50-09** below.

### FINDING 2 — dropping the toast's interpolation values is completely silent, and the WORST mutation is the invisible one

Task 2's ablation 3, as measured above: `tsc` 0 errors, 187 files / 5,752 tests green, cell 14 green.

The plan asked for the outcome to be reported. It is worse than merely silent, so it was measured
rather than described. Run directly against `use-intl`'s own ESM builds
(`node_modules/use-intl/dist/esm/{development,production}/core.js`), **identical in both builds**:

| mutation | rendered output |
|---|---|
| `t("export.tooBroad", { matched, total })` — correct | `This filter matches 44254 of 46054 records — too many to export. Narrow it and try again.` |
| `t("export.tooBroad")` — both values dropped | `This filter matches {matched} of {total} records — too many to export. Narrow it and try again.` |
| `t("export.tooBroad", { matched: 7 })` — one dropped | `views.export.tooBroad` |
| key absent from the catalog | `views.export.doesNotExist` |

**Dropping BOTH values produces fluent, plausible English with two literal braces in it — and
nothing detects it. Dropping ONE degrades to a visibly broken key path.** So the more damaging
mutation is the more invisible one, which is the opposite of the usual ordering and precisely the
shape a reviewer skims past. SC-3 asks that a refused user be told why and by how much;
`{matched} of {total}` tells them neither.

**Action taken (deviation Rule 2):** cell 15 was added to `saved-views-bar-wiring.test.ts`, reading
the call's arguments via `callArguments` and requiring `matched: result.matched` and
`total: result.total`. Two reds recorded above (T2-A5, T2-A6).

**Also independently re-confirms DEF-50-03:** the output is `44254`, not `44,254`. `{matched}` is a
simple ICU argument and is NOT locale-formatted. Third measurement, same answer.

**And a delta against DEF-50-04, offered narrowly.** DEF-50-04 records that `use-intl`'s
missing-value behaviour is build-dependent — key path in dev, template in prod. At this tree's
version, measured through `createTranslator` on both dist builds, **the two builds behave
identically** for every one of the four shapes above. This does *not* refute DEF-50-04: that finding
came from a Next.js render, and a `createTranslator` call is not a full render path (no
`NextIntlClientProvider`, no React error boundary, no `onError` wiring from the app config). Recorded
so 50-08 can decide which instrument to trust rather than inheriting either claim.

### FINDING 3 — four private copies of the same id parser, under two names

While writing cell 3c, the assertion `callSites(src, "parseIdList")` went **RED against correct
code** on three of four bulk files. Measured cause:

| file | parser name | line |
|---|---|---|
| `src/app/organizations/actions.ts` | `parseIdList` | 248 |
| `src/app/people/actions.ts` | `parseBulkIds` | 235 |
| `src/app/deals/actions.ts` | `parseBulkIds` | 204 |
| `src/app/activities/actions.ts` | `parseBulkIds` | 175 |

Four module-private copies, all `(raw: unknown): string[] | null`, under two names, and **nothing in
the repository asserts they agree**. Each is the narrow-and-dedupe step in front of an export read,
so a divergence between them is a divergence between four security bounds.

The gate was corrected honestly rather than loosened: the parser name became a fourth column in
`BULK_SITES`, so each site's assertion names the parser that site actually uses. Consolidation is
out of scope — recorded as **DEF-50-10** below.

### FINDING 4 — a numeric imprecision in my own output, caught before sign-off

My first draft of the action's comment wrote the cap's re-entry point as *"~125,000 rows
(`50,000 / 0.40`)"*, following the plan's own `~125,000`. That is the **DEF-50-01 error class
exactly**: the cap fires at `matched >= 50,001`, selectivity refuses above `floor(total × 0.40)`, so
the cap only reaches a request selectivity would have admitted once `floor(total × 0.40) >= 50,001`,
i.e. `total >= 125,002.5`, i.e. **`total >= 125,003`** — which is the integer plan 50-01 measured and
which `deferred-items.md` records. Corrected in `4de96a4`.

Note the shape: the round number is *derivable* by the obvious arithmetic and *wrong*, which is the
same trap as 31,609 vs 31,608.

### FINDING 5 — the "break the walk" ablation as specified did not exercise the cell it named

Recorded in T3-F4 above. The plan said pointing the walk at a nonexistent directory would produce
"cell 1 RED on the corpus floor". It produces a collection-time `ENOENT` throw and **zero cells
run** — loud, but not the floor cell firing. A second version against a real-but-small directory was
required to observe the floor cell's own red. Worth generalising: for any gate whose corpus is built
at module scope, "point it somewhere invalid" tests the *filesystem*, not the *floor*.

## Deviations from Plan

**1. [Rule 2 - Missing critical detector] cell 15 in `saved-views-bar-wiring.test.ts`**
- **Found during:** Task 2, ablation 3
- **Issue:** dropping the toast's interpolation values is invisible to `tsc` and to all 187 test
  files, and renders a plausible-looking sentence with literal braces to the user. SC-3 requires the
  numbers; nothing enforced their presence.
- **Fix:** a cell asserting `matched: result.matched` and `total: result.total` in the call's
  arguments, with both reds observed.
- **Files:** `src/components/views/__tests__/saved-views-bar-wiring.test.ts`
- **Commit:** `e40a6a9`

**2. [Rule 1 - Bug in my own output] the cap's re-entry threshold**
- **Found during:** final review, before SUMMARY
- **Issue:** `~125,000` instead of the measured `125,003` — the DEF-50-01 rounding class.
- **Fix:** exact integer plus its derivation, citing 50-01.
- **Files:** `src/lib/views/export-action.ts`
- **Commit:** `4de96a4`

**3. [Rule 1 - Bug in the plan's spec, corrected in-plan] the id-parser name in cell 3c**
- **Found during:** Task 3, first run
- **Issue:** the gate assumed one parser name and went red against correct code; there are four
  copies under two names.
- **Fix:** parser name is now a per-site column in `BULK_SITES`.
- **Files:** `src/lib/export/__tests__/export-call-sites.test.ts`
- **Commit:** `69d406f` (corrected before the commit landed)

**4. [Process error, self-inflicted] cell 15 was lost once to `git checkout --`**
- After writing cell 15 I ran `git checkout -- src/components/views/__tests__/saved-views-bar-wiring.test.ts`
  to restore ablation 4, and destroyed the uncommitted cell. It was rewritten from context and
  committed *before* re-running the ablation. **This is the fourth recorded instance of this exact
  loss in this project** (three Phase 49 plans, per the execution brief). The brief warned about it
  in bold and I did it anyway. The rule that would have prevented it is not "be careful" — it is
  *never run a restore command on a file whose new content is not yet in a commit*, which is
  mechanically checkable and should be a hook, not a habit.

**No other deviations.** No package was installed. No `Date.now()` and no elapsed-time assertion was
added. No locale JSON was edited. `BULK_KEYS`, `REQUIRED_BULK_KEYS` and the
`tBulk("error.tooMany")` zero-occurrence assertion are untouched. `views.export.disabledReason` is
untouched.

## Where this brief or the plan disagreed with what I measured

| Claim | Source | Measured |
|---|---|---|
| `saved-views-bar-wiring.test.ts` is red until Task 2 | 50-05-PLAN Task 1 action | **False.** Fully green: 187 files / 5,752 tests, `tsc` 0. See Finding 1 |
| pointing the walk at a missing directory reddens the corpus-floor cell | 50-05-PLAN Task 3 ablation 4 | **False.** Collection-time ENOENT, zero cells run. Needed a real-but-small root. See Finding 5 |
| the cap re-enters at ~125,000 rows | 50-05-PLAN objective | 125,003 exactly (50-01's figure). See Finding 4 |
| sites 3-6 "each contain `BULK_MAX_IDS` or the ids-only signature" via one parser | inferred from the plan's read_first list | four parsers, two names. See Finding 3 |
| `view-filters.test.ts:722-813` holds the five shipped gates | 50-05-PLAN interfaces table | line numbers are stale — the describe is at `:936`, the gates at `:947-1037`. The plan's *content* description was exact; only the offsets had drifted (the file grew to 1,038 lines after 50-04). No consequence |
| base suite 5,750 passed / 4 skipped / 187 files | execution brief | Confirmed exactly (5,752 after my +2 cells at Task 1). The brief's figures were right and STATE.md's are stale, as it said |
| `audit_log` at 214 total / 0 export | execution brief | Confirmed, and preserved — see below |

The brief carried no wrong file paths this time.

## The verified standing gate, final state

| Gate | Result |
|---|---|
| `vitest run` (base) | **188 files, 5,763 passed \| 4 skipped (5,767)** — baseline 187/5,750, +1 file, +13 cells |
| `vitest run --config vitest.rsc.config.ts` | **2 files, 8 passed** |
| `vitest run --config vitest.live.config.ts` | **3 files, 47 passed** |
| `dedup-db-test-setup.sh` + `vitest run --config vitest.db.config.ts` | **13 files, 299 passed, EXIT 0** |
| `tsc --noEmit` | **0 errors** (EXIT 0) |
| `eslint .` | **0 errors** (118 warnings; EXIT 0 — gated on errors, per the lint-warning-count hazard) |
| `git diff --exit-code -- src/` | **exit 0** |
| `git ls-files --others --exclude-standard -- src/` | **empty** |

New cell counts: `view-filters.test.ts` 54 → **56**; `saved-views-bar-wiring.test.ts` 15 → **16**;
`export-call-sites.test.ts` **10** (new).

### `audit_log` left exactly where it was found

```
before test:live   total 214 | export_rows 0
after  test:live   total 214 | export_rows 0
final              total 214 | export_rows 0
```

Nothing was written, so nothing had to be deleted by id. **SC-5's `0 → 1` transition on
`entity_type='export'` is still available to plan 50-06 as its own observation.**

## What this plan does NOT prove

Stated plainly, because the gates here are structural and could be mistaken for behavioural:

- **No row was ever refused by running code in this plan.** Every assertion reads source. That a
  `search=a` organizations export actually returns `too_broad` with `matched=44254, total=46054`
  against the live database is **plan 50-06's** work (SC-1/SC-3), and 50-04 already proved the count
  half against real data.
- **No toast was rendered in a browser.** Cell 15 proves the two values are passed at the call site;
  it does not prove sonner displays them, or that the sentence fits the toast width in pt-BR.
- **The `deleted_at` term in `export-count.ts`'s base predicate is not covered here** and cannot be
  covered against this database — DEF-50-07: zero soft-deleted rows across all four tables
  (188,619 rows). This plan adds no live cell, so it inherits none of that vacuity, but it also
  closes none of it.
- **`MIN_EXPORT_ROWS = 1_000` is not exercised by anything this plan touched.** The fraction
  dominates all four live tables.
- **Cell 3b asserts the admin path READS a role and refuses; it does not prove the refusal is
  correct.** `!== "admin"` vs `=== "admin"` would both satisfy it. A behavioural test of the admin
  export is out of scope and no such test exists — noted under DEF-50-11.

## Known Stubs

None. Every branch added is wired end to end: the action returns the payload, the component consumes
both fields, and the copy exists in all three locales (landed by 50-02).

## Threat Flags

None. No new endpoint, no new auth path, no new file access, no schema change. The one new file is a
test. The threat register's ten `mitigate` dispositions are each addressed by a cell with a recorded
red, except T-50-05-01's behavioural half, which the register itself assigns to 50-06.

## New deferred items proposed

**DEF-50-09 — a new `ViewExportResult` error code can ship with no client handling and reden
nothing.** Measured in Finding 1: `tsc` does not require exhaustiveness (the chain ends in an
unconditional fallback) and the wiring gate reads source, so the server half alone is green
everywhere. The user gets "Failed to export" — threat T-50-05-09 realised. The only defence is the
hand-maintained `EXPORT_KEYS` array. **Suggested owner:** a plan that derives the required key set
from the union's members (e.g. a source-parsed assertion that every `error: "<code>"` literal in
`export-action.ts` has a matching `result.error === "<code>"` branch in the bar), or that makes the
fallback a `never`-checked exhaustive switch so `tsc` carries it.

**DEF-50-10 — four private copies of the id-list parser under two names, none asserted to agree.**
Finding 3. `parseIdList` (organizations) and three `parseBulkIds`. Each guards an export read.
**Suggested owner:** whoever next touches the bulk actions. Consolidate into `src/lib/bulk/` beside
`BULK_MAX_IDS`, in one commit, deleting all four copies. Do not consolidate three and leave one.

**DEF-50-11 — removing the admin export's role refusal reddened only the cell this plan wrote.**
Finding, T3-F3: before `69d406f`, turning `src/app/admin/export/actions.ts` into an unbounded
whole-table export reachable by any authenticated session was green across 187 files and `tsc`. Cell
3b now catches its *absence*, but nothing anywhere proves the refusal is the right way round.
**Suggested owner:** a behavioural test of `getExportData` with a non-admin session.

**Observation, not an item:** the repo now has **three** independent `src/` walks
(`suite-hook-hygiene.test.ts`, `suite-timing-hygiene.test.ts`, and this plan's
`export-call-sites.test.ts`). This file's header states that no fourth should be written and that a
shared helper should be promoted instead. 50-08 may want to make that call.

---

## HANDOFF

*For the orchestrator. This plan made no edits to `STATE.md` or `ROADMAP.md`.*

### STATE.md

- **Current position:** phase 50, plan 05 complete. Wave 4 done.
- **Suite baseline — REPLACE the stale figures with these:**
  - base: **188 files, 5,763 passed | 4 skipped (5,767)**
  - rsc: **2 files, 8 passed**
  - live: **3 files, 47 passed**
  - db: **13 files, 299 passed, EXIT 0**
  - `tsc --noEmit`: **0 errors**; `eslint .`: **0 errors / 118 warnings**
- **Decisions to record:**
  1. No admin branch on the view-export path. The selectivity bound applies to every authenticated
     user; `src/app/admin/export/actions.ts` remains the separate role-gated unbounded path. E-9
     preserved as *bounded rather than refused*. The shipped no-admin gate is byte-identical
     (md5s in this SUMMARY).
  2. `EXPORT_ROW_CAP = 50_000` kept and unreachable from the view path below **125,003** rows
     (50-01's measured figure, not the round 125,000). Defence in depth; do not remove as dead code.
  3. The `too_broad` refusal returns before `recordExport`, so refusals write no audit row. WR-04's
     limitation is unchanged and now stated in the action's own comment.
- **Blockers:** none.
- **Session:** stopped at `50-05-PLAN.md` complete; next is `50-06`.

### ROADMAP.md

Phase 50: **5 of N plans complete** (50-01 … 50-05). SEC-03's call site, message and non-regression
enumeration are delivered; the behavioural proof (SC-1/SC-3/SC-5) is 50-06's.

### REQUIREMENTS.md

`SEC-03` — **not yet complete.** This plan delivers the structural half. The success criteria SC-1,
SC-3 and SC-5 are behavioural and belong to 50-06. Do **not** check `SEC-03` off on this plan's
commit; 50-06 should be the plan that marks it.

### deferred-items.md

Append **DEF-50-09**, **DEF-50-10** and **DEF-50-11** as drafted above. Note that this plan
independently re-confirmed **DEF-50-03** (numbers are not locale-formatted; third measurement) and
recorded a narrow, non-refuting **delta against DEF-50-04** (both `use-intl` dist builds behave
identically through `createTranslator`; the dev/prod split DEF-50-04 records came from a Next.js
render and this measurement does not reach that path).

### For plan 50-06 specifically

- `audit_log` is at **214 total / 0 with `entity_type='export'`** — untouched, verified three times.
  The `0 → 1` transition is yours.
- The refusal payload is `{ success: false, error: "too_broad", matched, total }` on
  `ViewExportResult`. `matched` and `total` come straight from `countExportMatches`.
- **The activities allowance is 31,608 and 31,609 is the smallest refused count** (DEF-50-01). That
  number does not appear anywhere in this plan's output, so nothing here needs re-checking against
  it — but 50-06 consumes it.
- Read Finding 1 before writing anything: a new error code with no client branch is green
  everywhere, so 50-06's live cells should not be the only thing standing behind the toast.

## Self-Check: PASSED

Created files:

```
FOUND: src/lib/export/__tests__/export-call-sites.test.ts
FOUND: .planning/phases/50-export-authorization/50-05-SUMMARY.md
```

Commits (all present in `git log efd7d6b..HEAD`):

```
FOUND: f86f3d7  test(50-05): assert the selectivity call, its order and its payload in the action
FOUND: 2884124  feat(50-05): refuse a too-broad view export between the guard and the fetch
FOUND: f954b50  test(50-05): require the bar to reference views.export.tooBroad
FOUND: df82a72  feat(50-05): show the too_broad refusal with both counted numbers
FOUND: e40a6a9  test(50-05): assert the tooBroad toast passes both counted numbers
FOUND: 69d406f  test(50-05): pin the six fetchFilteredData call sites repo-wide
FOUND: 4de96a4  docs(50-05): state the cap's re-entry threshold as the exact 125,003
```

TDD gate sequence: `test(...)` → `feat(...)` present for both Task 1 and Task 2. Task 3 is a
gate-only task and has a `test(...)` commit with no paired `feat(...)`, which is correct — it adds a
detector for existing code and its five falsifications are its REDs.

Tree state at sign-off: `git diff --exit-code -- src/` exit 0;
`git ls-files --others --exclude-standard -- src/` empty; no scratch file survives.
