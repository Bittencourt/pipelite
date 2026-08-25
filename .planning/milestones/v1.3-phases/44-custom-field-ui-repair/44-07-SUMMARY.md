---
phase: 44-custom-field-ui-repair
plan: 07
subsystem: ui
tags: [custom-fields, formula, react, client-state, tdd, wave-2]

# Dependency graph
requires:
  - phase: 44-custom-field-ui-repair (plan 02)
    provides: "saveFieldValues resolving { success, values } — the post-recalculation blob this plan sets into React state"
  - phase: 44-custom-field-ui-repair (plan 03)
    provides: "buildClientFieldValues — the db-free seeding helper this plan calls from the 'use client' component"
provides:
  - "custom-fields-section builds its formula evaluation map with buildClientFieldValues, so an unset source is a present null and renders blank instead of #ERROR"
  - "A successful save replaces localValues with the server's recomputed blob, ending the one-save-behind formula display"
  - "Source-read wiring gates proving the component calls the tested helper and the tested contract"
affects: [44-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wiring gates as comment-stripped source reads, when the behaviour is unit-tested elsewhere and rendering the component would require packages the phase forbids"
    - "Every source-read describe carries its own decoy test, so the gate cannot be satisfied by prose"
    - "Replace-not-merge for server-authoritative state: the response blob becomes the state, rather than being spread over the optimistic one"

key-files:
  created:
    - src/components/custom-fields/__tests__/custom-fields-section.test.ts
  modified:
    - src/components/custom-fields/custom-fields-section.tsx

key-decisions:
  - "The memo is anchored on the `allFieldValues =` assignment rather than on 'the first useMemo in the file', so a future second memo cannot make the gate read the wrong call"
  - "An exact `toEqual(['newValues','result.values','values','values'])` on the setLocalValues call sites, not a loose count — a fifth state write or a dropped revert both fail with a legible diff"
  - "No client-side filtering of formula keys and no test asserting the client never sends them; stripFormulaKeys is the single server-side enforcement point (T-34-04) and such a test would assert the opposite of the real contract"
  - "The `...entityAttributes` spread is banned outright by the gate, not just the exact old two-key literal — a reformatted or partially-restored spread still fails"

requirements-completed: [CFUI-02, CFUI-03]

# Metrics
duration: 9min
completed: 2026-08-15
---

# Phase 44 Plan 07: Client Wiring Summary

**The two lines that made the UI disagree with the database are gone: the evaluation map is now built by `buildClientFieldValues` (null-seeded, unwrapped, server-parity-asserted) and a successful save replaces `localValues` with the blob the server just computed.**

## What changed

`src/components/custom-fields/custom-fields-section.tsx` — 18 lines across three places, nothing else:

| Before | After |
|---|---|
| `useMemo(() => ({ ...entityAttributes, ...localValues }), [entityAttributes, localValues])` | `useMemo(() => buildClientFieldValues({ definitions, entityAttributes, values: localValues }), [definitions, entityAttributes, localValues])` |
| `Promise<{ success: boolean; error?: string }>` | `Promise<{ success: boolean; error?: string; values?: Record<string, unknown> }>` |
| `onValuesChange?.(newValues)` | `if (result.values) setLocalValues(result.values)` + `onValuesChange?.(result.values ?? newValues)` |

Untouched, deliberately: the optimistic `setLocalValues(newValues)` before the request, both
revert-to-`values` failure paths and their `console.error` calls, the `useCallback` dependency
array, the formula/non-formula render split, and all markup. `formula-field.tsx` was not modified —
its `isCachedResult` branch now displays a fresh wrapper because the state feeding it is fresh, and
44-04's `FORMULA_EVAL_OPTIONS` bound on the live branch is intact.

## Why CFUI-03 is actually closed

`definitions` in the call is the load-bearing argument. It produces the D-14 null seed — one present
key per active definition — and `formula-engine.ts` distinguishes an **absent** key (`Unknown field:
X`, surfaced as `#ERROR` in the UI) from a **present-and-null** one (blank). A record whose
`custom_fields` is `{}` therefore rendered an error for a field that visibly exists in the admin
list. The old spread had no seed and no `unwrapFormulaValue` pass, so it could not produce that
distinction no matter what it was given.

`definitions` was also added to the dependency array, since it is now read inside the callback.

## Why CFUI-02 Part B is actually closed

`localValues` is `useState(values)`, which permanently shadows the `values` prop — no RSC refresh can
reach it. Previously the only thing ever merged in was the key the user typed, so the
`{formula:true,...}` wrapper the component held was the one from page load: the displayed formula was
literally one save behind the stored one.

The server's blob **replaces** the state rather than being merged into it. That is the fix, not a
stylistic choice — a key-by-key merge would leave the stale wrapper in place for any formula field
the user did not personally edit. Per 44-02, `values` is present on every successful save, including
the D-05 path where `recalculateFormulas` throws (it falls back to the blob actually written), so the
truthy branch always taken on success is the intended one; the key is optional only because the
validation-failure path omits it.

`onValuesChange` receives the same authoritative blob, so a parent holding its own copy is not left
one save behind either.

## Tests

`src/components/custom-fields/__tests__/custom-fields-section.test.ts` — 14 tests, all green.

| Describe | Tests |
|---|---|
| the evaluation map is built by the shared helper (CFUI-03) | 6 |
| the server's recomputed values are authoritative after a save (CFUI-02) | 8 |

These are **source-read gates**, and the file header says at length why. Rendering a `'use client'`
component here is not possible: vitest runs with `environment: 'node'` and no DOM, so it would need
jsdom plus a testing library — packages this phase must not install (T-44-SC; RESEARCH's package
audit lists zero candidates). The behaviour is covered in the two places it belongs:
`client-field-values.test.ts` (16 tests: seeding, precedence, unwrapping, server parity) and
`custom-fields.test.ts` (the `values` contract and the wrapper round-trip). What was missing — and
what let both bugs survive — was any proof that the component *calls* that logic. That is what this
file is.

Both describes carry a decoy test proving a commented-out call does not satisfy the gate, and the
comment-stripper is shared with the CFUI-04/CFUI-05 gates via `./source-scan` so the three cannot
drift.

Two gates are deliberately non-obvious:

- The memo is located by the `allFieldValues =` assignment, not by "the first `useMemo`", so a future
  second memo cannot silently redirect the assertion.
- `setLocalValues` call sites are asserted as an exact ordered list
  `["newValues", "result.values", "values", "values"]`. A dropped revert path, a lost optimistic
  update, or an extra unreasoned state write each fail with a readable diff.

The gate also bans `...entityAttributes` anywhere in the file rather than matching only the exact old
literal, so a reformatted or partially-restored spread still fails.

## Verification

| Gate | Result |
|---|---|
| `vitest run custom-fields-section client-field-values` | 22 passed |
| `vitest run src/lib/custom-fields.test.ts` | 32 passed |
| `vitest run` (default project) | **863 passed, 0 failed** (baseline 777; 847 at this plan's start) |
| `vitest run --config vitest.rsc.config.ts` | 4 passed |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint src/components/custom-fields` | **0 errors** (4 pre-existing warnings, none in a file this plan touched) |
| `git diff custom-fields-section.tsx` | the memo, the save handler and the response type only |
| `package.json` | not modified by this plan |

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR |
|---|---|---|---|
| 1 — seed the evaluation map | `fbfbb88` `test(44-07)` — 5 failed / 1 passed | `d6fbac3` `feat(44-07)` — 22/22 | not needed |
| 2 — server-authoritative values | `9cd85ea` `test(44-07)` — 5 failed / 9 passed | `5d67635` `feat(44-07)` — 14/14 | not needed |

Both REDs were verified discriminating: every failure was on a wiring assertion (`no
buildClientFieldValues call site`, `expected +0 to be 1` on `result.values`), while the decoy guards
and the pins on unchanged behaviour (optimistic update, revert paths) passed from the start — which
is correct, since those describe behaviour this plan must not alter.

## Deviations from Plan

None. Both tasks executed as written; no deviation rule was invoked.

## Issues Encountered

**One flaky failure in a full-suite run, not caused by this plan and not fixed.** The first
`vitest run` after Task 2 reported `1 failed | 862 passed` — `src/lib/execution/condition-evaluator.test.ts`
› "resolveFieldPath — parsing is linear, not backtracking (T-34-20)", asserting a wall-clock ratio
`< 10` and measuring `25.5`. It is a load-sensitive timing assertion in a file this plan never
touched; it passes in isolation (70/70) and the immediately following full run was clean at
**863 passed, 0 failed**. Sibling executor 44-06 was running its own suites concurrently on the same
machine. Left alone per the executor scope boundary; worth noting for whoever owns that gate that it
is contention-sensitive.

## Concurrency note

Executor 44-06 was writing to this working tree throughout. Every commit here staged its two files by
name and the staged diff was inspected before each one; `git show --name-only` confirms all four
commits touch only `custom-fields-section.tsx` and its test file. The `package.json` change visible in
the phase range is 44-01's `test` script wiring — no dependency was added by anyone, and this plan did
not touch the file.

## Known Stubs

None. Both halves are fully wired; there is no placeholder value and no data source left unconnected.

## Threat Flags

None. No new endpoint, auth path, file access pattern or schema change. Register dispositions hold:
T-44-23 mitigated server-side (`stripFormulaKeys` before every write — no client-side filtering was
added, keeping one enforcement point); T-44-24 mitigated (the displayed formula is now the server's,
the browser evaluator is a pre-first-save fallback only); T-44-25 accepted unchanged (the blob is the
user's own already-readable record); T-44-26 mitigated by 44-04's bound, left intact; T-44-SC — **no
packages installed**.

## For the Next Plan

44-09 browser-verifies this. The two observable changes on a deal detail page:

1. A formula referencing a custom field that has never been set renders **blank**, not
   `#ERROR — Unknown field: X`.
2. Editing a formula's source field updates the formula's displayed value **on the same interaction**,
   with no reload — previously it showed the previous save's result.

Standing constraint carried forward from 44-03: `buildClientFieldValues` and `buildFormulaFieldValues`
must be changed together, enforced by the parity test.

## Self-Check: PASSED

- `src/components/custom-fields/custom-fields-section.tsx` — FOUND, contains `buildClientFieldValues` and `result.values`
- `src/components/custom-fields/__tests__/custom-fields-section.test.ts` — FOUND, 14 tests
- `.planning/phases/44-custom-field-ui-repair/44-07-SUMMARY.md` — FOUND
- Commits `fbfbb88`, `d6fbac3`, `9cd85ea`, `5d67635` — all FOUND in `git log`
- `src/components/custom-fields/formula-field.tsx` — untouched by all four commits, confirmed
