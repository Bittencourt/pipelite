---
phase: 44-custom-field-ui-repair
plan: 01
subsystem: testing
tags: [vitest, rsc, react-server, react-flight, radix-ui, custom-fields, test-infrastructure]

# Dependency graph
requires:
  - phase: 44-custom-field-ui-repair
    provides: "44-RESEARCH R7/R9/R10/R11 (MAX_ROW_SIZE=3200, SlotClone silent null, the n=20/n=21 bisect, the slim-projection disproof)"
provides:
  - "A second vitest project (vitest.rsc.config.ts) resolving React under the react-server export condition, reachable from `npm test`"
  - "field-dialog-boundary.rsc.test.tsx — the SC-5 gate, driving the REAL Flight serializer Next ships"
  - "rsc-boundary.test.tsx — the Radix asChild silent-null mechanism, with a control that isolates the fault to SlotClone"
  - "src/types/react-server-dom-webpack.d.ts — ambient types for the vendored, undeclared Flight server"
  - "The *.rsc.test.* naming convention and the base-project exclusion that keeps it single-project"
affects: [44-06 structural AddFieldButton repair, 44-08 payload projection (adds a second *.rsc.test.tsx)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-config vitest split: base config plus vitest.rsc.config.ts, chained by the `test` script"
    - "ssr.resolve.conditions (not resolve.conditions alone) is what applies an export condition to vitest test files"
    - "Assert boundary contracts against the shipped serializer, never a mock"
    - "Mutation-verify a regression gate before committing it"

key-files:
  created:
    - "vitest.rsc.config.ts"
    - "src/app/admin/fields/[entityType]/__tests__/field-dialog-boundary.rsc.test.tsx"
    - "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"
    - "src/types/react-server-dom-webpack.d.ts"
  modified:
    - "vitest.config.ts"
    - "package.json"

key-decisions:
  - "Used the plan's FALLBACK form (separate vitest.rsc.config.ts + compound `test` script), not the inline `test.projects` form — the inline form does not apply the react-server condition to bare `react` on vitest 4.0.18 (measured twice)"
  - "ssr.resolve.conditions was required in addition to resolve.conditions; without it react/jsx-dev-runtime resolves to the client variant and React's internals mismatch"
  - "Fixture rows are declared as a local DefRow interface, not imported from @/db/schema — importing drizzle into the react-server project buys nothing"
  - "n=21 is committed as a fixture value with an explicit comment that it is never a production invariant (RESEARCH A1)"
  - "The slim-projection failure at n=155 is asserted, not just documented, so D-44-01 cannot be quietly re-litigated"

patterns-established:
  - "Real-serializer gates: when a bug is a decision made inside a vendored bundle, the test must load that bundle"
  - "Falsifiability check: mutate the fixture to the pre-fix shape, watch the gate go red, restore — before committing"
  - "Condition-scoped test projects: a file needing react-dom/server and a file needing react-server cannot share a project; encode that in the filename"

requirements-completed: []

# Metrics
duration: 17min
completed: 2026-08-15
---

# Phase 44 Plan 01: RSC Test Infrastructure and the SC-5 Flight Gate Summary

**A second vitest project resolving React under `react-server` now runs `*.rsc.test.tsx` from `npm test`, carrying a regression gate that drives Next's own Flight serializer to prove an element child defers to `$L<id>` past `MAX_ROW_SIZE` while the repaired data-only shape never does.**

## Which vitest project form was used

**The fallback: a separate `vitest.rsc.config.ts` plus a compound `test` script.** Plan 44-08 adds a
second `*.rsc.test.tsx` — it needs no config change, only the `*.rsc.test.tsx` filename.

```
"test": "vitest run && vitest run --config vitest.rsc.config.ts"
```

The preferred inline `test.projects: [...]` form was tried first and **does not work on vitest 4.0.18**:

| Attempt | Result |
|---|---|
| `projects: [...]` with `resolve.conditions: ['react-server']` on the rsc project | `The "react" package in this environment is not configured correctly. The "react-server" condition must be enabled...` — thrown by `react-server-dom-webpack-server.edge.development.js:5537` |
| Same, plus `ssr.resolve.conditions` on the rsc project | `react/jsx-dev-runtime` now resolved to the `.react-server` variant, but bare `react` still did not — same refusal, thrown one layer earlier |
| Separate `vitest.rsc.config.ts`, `resolve.conditions` only | Same refusal |
| Separate `vitest.rsc.config.ts`, `resolve.conditions` **+ `ssr.resolve.conditions`** | ✅ green |

**`ssr.resolve.conditions` is the load-bearing setting** and is not in the research or plan text: vitest
transforms test files in the SSR environment, so that is where `react` and `react/jsx-dev-runtime` are
resolved. `resolve.conditions` alone is not enough on this Vite version. Both are set, and the config
carries this history as a comment so the next person does not repeat the bisect.

An intermediate attempt using `pool: 'forks'` + `execArgv: ['--conditions=react-server']` (what Next
itself does at runtime) also worked, but was removed once `ssr.resolve.conditions` proved sufficient —
fewer moving parts, and no dependency on the pool implementation.

## What Was Built

### Task 1 — the react-server project and the SC-5 gate (`9daafc4`)

`vitest.config.ts` keeps its single-project shape and gains one exclusion,
`'**/*.rsc.test.?(c|m)[jt]s?(x)'`. Without it the base `include` matches those files and they run in
**both** projects, failing in the base one. Verified single-project: `npx vitest run field-dialog-boundary`
in the base project reports `No test files found`, while the rsc config runs it.

`field-dialog-boundary.rsc.test.tsx` serializes through
`next/dist/compiled/react-server-dom-webpack/server.edge.js` — the exact bundle production uses — and
probes for `/"children":"\$L/`, the literal string found in the live `/admin/fields/deal` payload:

| Assertion | Shape | Deferred? |
|---|---|---|
| 1 | 20 full definition rows + element child | no (plus a `toContain('Add Field')` sanity check so it cannot pass vacuously) |
| 2 | 21 full definition rows + element child | **yes** — the measured threshold, commented as a fixture value only |
| 3 | slim `{id,name,type}` × 155 + element child | **yes** — D-44-01's disproof, now an assertion |
| 4 | 155 full definition rows, **no element child** | no — and no `$L` anywhere in the payload; asserts `Campo de teste 154` is present so all 155 rows really crossed |

All four reproduce the research measurements exactly.

### Task 2 — the Radix mechanism test (`a9629fc`)

`rsc-boundary.test.tsx` runs in the base project (it needs `react-dom/server`, which cannot load under
`react-server` — hence the filename that deliberately misses the `*.rsc.test.*` pattern). Three
assertions: a real element renders `Add Field`; a `flightLazy` child renders the **empty string**; the
same `flightLazy` value renders fine as an ordinary `div` child. The third exists so the second cannot
be explained away as "lazies do not render here" — it isolates the fault to `SlotClone`.

Left at exactly three assertions; 44-06 appends the structural and authorization-placement gates that
must go RED first.

## The gate was mutation-verified, not assumed

The orchestrator's non-negotiable was that the gate must genuinely fail if the fix were reverted.
Before committing, assertion 4's fixture was flipped from `dataOnly(defs(155))` to
`withElementChild(defs(155))` — i.e. the pre-fix shape, an element child alongside the live 155-row
data prop:

```
× never defers an element when no element crosses the boundary - the repaired shape
  AssertionError: expected true to be false
  1 failed | 3 passed, exit 1
```

The fixture was then restored and the file re-run green. The gate discriminates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The inline `test.projects` form does not apply the react-server condition**
- **Found during:** Task 1
- **Issue:** The plan's preferred single-config form failed with React's configuration refusal, exactly the symptom the plan predicted.
- **Fix:** Switched to the plan's spelled-out fallback (`vitest.rsc.config.ts` + compound `test` script). No improvisation beyond the config keys needed to make it work.
- **Files modified:** `vitest.config.ts`, `vitest.rsc.config.ts`, `package.json`
- **Commit:** `9daafc4`

**2. [Rule 3 - Blocking] `ssr.resolve.conditions` needed beyond `resolve.conditions`**
- **Found during:** Task 1
- **Issue:** Even the standalone config with `resolve.conditions: ['react-server']` (the form 44-RESEARCH reported as green) still hit the refusal. Test files are transformed in the SSR environment, so SSR resolution is what picks the React variant.
- **Fix:** Added `ssr.resolve.conditions: ['react-server', 'node', 'import', 'module', 'default']`, with a comment explaining why.
- **Files modified:** `vitest.rsc.config.ts`
- **Commit:** `9daafc4`

**3. [Rule 3 - Blocking] TS7016 on the vendored Flight serializer**
- **Found during:** Task 1 (`npx tsc --noEmit`)
- **Issue:** `next/dist/compiled/react-server-dom-webpack/server.edge.js` ships no declarations, so importing it is an implicit-`any` error under `strict`. The plan forbids `any`, and an in-file `declare module` is illegal in a module file.
- **Fix:** Added `src/types/react-server-dom-webpack.d.ts` declaring only `renderToReadableStream`, alongside the existing `src/types/next-auth.d.ts`. One new file beyond the plan's `files_modified` list; the alternative (`@ts-expect-error` or a dynamic specifier) would have been weaker typing, not stronger.
- **Files modified:** `src/types/react-server-dom-webpack.d.ts` (new)
- **Commit:** `9daafc4`

### Notes, not deviations

- **JSX instead of `React.createElement`.** The research harness used `createElement` with `as any` to
  get an array into a `data-*` prop. TypeScript does not type-check hyphenated JSX attribute names, so
  plain JSX gets the same element with **no cast and no `any`**. Prop order is identical (`children`
  last, as JSX always emits) — verified by reproducing all four measured thresholds.
- **No packages installed.** `package.json` `dependencies` and `devDependencies` are byte-identical;
  only the `test` script changed.

## Deferred Issues

`src/lib/execution/condition-evaluator.test.ts` → `scales linearly, not quadratically, with path length`
(Phase 34 T-34-20) is **flaky**: 2 of 3 isolated runs passed, and it failed once in a full-suite run then
passed on the next. It asserts a wall-clock *ratio* and this machine was running several phase-44
executors concurrently. Unrelated to anything 44-01 touched. Logged in
`.planning/phases/44-custom-field-ui-repair/deferred-items.md`; **not fixed** (out of scope).

## Verification

| Gate | Result |
|---|---|
| `npm test` (both projects, one command) | **exit 0** — base: 55 files / 843 passed / 4 skipped; rsc: 1 file / 4 passed |
| Regression baseline (777) | 847 total, no regressions |
| `npx vitest run --config vitest.rsc.config.ts` | 4/4 green |
| `npx vitest run rsc-boundary` | 3/3 green |
| `*.rsc.test.tsx` runs in exactly one project | base project: `No test files found` for `field-dialog-boundary` |
| `npx tsc --noEmit` | clean for this plan's files |
| `npx eslint src/app/admin/fields` | **0 errors** (3 pre-existing warnings in `field-dialog.tsx` / `actions.ts`, untouched here) |
| Mutation check on the SC-5 gate | fails red with the pre-fix shape, green when restored |

The base-suite counts exceed the plan's expectation because sibling Wave 1 plans (44-02..44-05) committed
into the same working tree during this run; their files were never staged by this plan.

## Threat Model Coverage

| Threat | Disposition | How it landed |
|---|---|---|
| T-44-01 (DoS — the header trigger vanishing) | mitigate | The gate fails when an element child rides alongside a growable data prop — mutation-proven, not assumed |
| T-44-02 (Tampering — a gate passing under the wrong resolution conditions) | mitigate | `*.rsc.test.*` excluded from the base project and shown to resolve to zero files there; the rsc project would throw React's refusal if the condition were lost, so it cannot silently degrade to a client-React run |
| T-44-03 (Info disclosure — fixtures) | accept | All fixture data is synthetic (`Campo de teste N`, `0e2b1c9a-…` UUIDs). No real definitions, no secrets, no tokens |
| T-44-SC (package installs) | mitigate | Zero packages installed; `dependencies` and `devDependencies` unchanged |

## Self-Check: PASSED

All six code artifacts exist on disk; both task commits (`9daafc4`, `a9629fc`) are present in
`git log`. The only `package.json` change is the `test` script — no dependency lines added or removed.
