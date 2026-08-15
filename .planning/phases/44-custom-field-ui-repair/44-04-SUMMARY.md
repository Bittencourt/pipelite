---
phase: 44-custom-field-ui-repair
plan: 04
subsystem: custom-fields
tags: [custom-fields, formula, quickjs, security, dos, client-server-parity]

# Dependency graph
requires:
  - phase: 34-formula-reactivity (plan 01)
    provides: "FORMULA_EVAL_MEMORY_LIMIT_BYTES / FORMULA_EVAL_TIMEOUT_MS and the measured D-18 justification for them"
  - phase: 34-formula-reactivity (plan 05)
    provides: "ENTITY_NATIVE_ATTRIBUTES — the server's native-attribute vocabulary per entity type"
provides:
  - "Activity formulas can resolve Title, Notes, DueDate and CompletedAt in the browser"
  - "FORMULA_EVAL_MEMORY_LIMIT_BYTES / FORMULA_EVAL_TIMEOUT_MS / FORMULA_EVAL_OPTIONS exported from the client-safe formula-engine.ts"
  - "Both browser evaluateFormula call sites carry the server's 8 MiB / 500 ms QuickJS bounds"
  - "A parity gate over all four detail pages against ENTITY_NATIVE_ATTRIBUTES"
  - "A call-site count gate that fails on any future unbounded browser evaluator call"
  - "source-scan.ts — string-aware comment stripping and call-argument extraction for source-read gates"
affects: [44-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bound constants hosted in the client-safe module and re-exported by the server-only module, so one existing server test pins both sides against drift"
    - "Source-read gates parameterised over every instance of a pattern (all four detail pages, both call sites) so a FUTURE omission fails, not just the one being fixed"
    - "String-aware comment stripping before any source-read assertion, so prose can never satisfy a gate"
    - "Fail-fast precondition before entering the QuickJS sandbox, because an unbounded runaway wedges the runner instead of failing it"

key-files:
  created:
    - src/components/custom-fields/__tests__/entity-attributes-parity.test.ts
    - src/components/custom-fields/__tests__/client-formula-bounds.test.ts
    - src/components/custom-fields/__tests__/source-scan.ts
  modified:
    - src/app/activities/[id]/page.tsx
    - src/lib/formula-engine.ts
    - src/lib/formula-recalc.ts
    - src/components/custom-fields/formula-field.tsx
    - src/components/custom-fields/formula-editor.tsx

key-decisions:
  - "The bound constants moved to formula-engine.ts and are re-exported from formula-recalc.ts rather than duplicated — formula-recalc.test.ts's untouched 8 MiB / 500 ms assertions therefore guard the client side too (T-44-13)"
  - "The comment-stripping helper was extracted to a shared source-scan.ts rather than duplicated across the two gates, because both depend on identical stripping semantics and silent drift between them would weaken both"
  - "The runaway test asserts FORMULA_EVAL_OPTIONS.timeoutMs is a positive finite number BEFORE evaluating — observed during RED that a missing bound hangs the vitest worker permanently instead of failing it"
  - "The justification comment in formula-engine.ts avoids the literal database module specifier, so the plan's client-safety grep cannot be satisfied (or polluted) by prose"
  - "FORMULA_EVAL_OPTIONS is frozen; the server call site keeps its existing spread, leaving server behaviour byte-identical"

requirements-completed: [CFUI-04, CFUI-05]

# Metrics
duration: 17min
completed: 2026-08-15
---

# Phase 44 Plan 04: Client/Server Evaluator Parity Summary

**The browser formula evaluator now shares the server's native-attribute vocabulary and its QuickJS resource bounds — an activity formula can resolve `{{Title}}`/`{{DueDate}}`, and an admin-authored `while(true)` can no longer pin every viewer's tab.**

## What was built

### CFUI-04 — activity detail page passes `entityAttributes`

`src/app/activities/[id]/page.tsx` handed `CustomFieldsSection` no `entityAttributes` prop, so
the browser's live evaluation had no native activity fields in scope while Postgres held the
correct value. The other three detail pages passed theirs. Added the four attributes
(`Title`, `Notes`, `DueDate`, `CompletedAt`) matching `ENTITY_NATIVE_ATTRIBUTES.activity`. All
four columns were already selected by `getActivity` — no new query, no reshaping.

The gate (`entity-attributes-parity.test.ts`) is parameterised over **all four** pages and
asserts the `entityAttributes` key set equals `Object.keys(ENTITY_NATIVE_ATTRIBUTES[entityType])`
exactly — no missing key, no extra key. A fifth detail page that forgets the prop, or an existing
page that drifts one key from the server map, fails here rather than in a browser session.

### CFUI-05 — browser evaluator bounded like the server

`evaluateFormula`'s resource bound is an opt-in 4th argument and is completely inert unless
passed. Phase 34's D-18 passes it on every server call site; both browser call sites passed
nothing.

The constants could not simply be imported from `formula-recalc.ts` because that module imports
the database client and is not client-safe — which is precisely *why* the browser sites shipped
unbounded. So:

1. `FORMULA_EVAL_MEMORY_LIMIT_BYTES`, `FORMULA_EVAL_TIMEOUT_MS` and a frozen
   `FORMULA_EVAL_OPTIONS` now live in `formula-engine.ts` (client-safe), carrying the full D-18
   justification.
2. `formula-recalc.ts` imports and **re-exports** both named constants. This is load-bearing:
   `formula-recalc.test.ts` imports them from `@/lib/formula-recalc` and pins them to 8 MiB /
   500 ms, so those existing assertions are now the drift alarm for both sides (T-44-13).
3. `formula-field.tsx` (live evaluation) and `formula-editor.tsx` (preview) both pass
   `FORMULA_EVAL_OPTIONS`.

Two independent gates: a **call-site count** gate (every `evaluateFormula(` under
`src/components/custom-fields/` must pass the options; count of bounded calls equals count of
call sites, and is non-zero) and a **behavioural** gate proving the runaway expression
terminates under those exact bounds.

## Verification results

| Check | Result |
|---|---|
| `npx vitest run entity-attributes-parity client-formula-bounds` | 18/18 pass |
| `npx vitest run formula-recalc.test formula-engine.test` | 178/178 pass, `formula-recalc.test.ts` **unmodified** |
| `npx vitest run` (full suite) | 843 passed, 4 skipped, 0 failed, exit 0 |
| `npx tsc --noEmit` | clean for this plan's files |
| `npx eslint src/lib src/components src/app/activities` | 0 errors (45 pre-existing warnings, none in touched files) |
| `grep -rn "@/db" src/lib/formula-engine.ts` | no matches — module stays client-safe |

Baseline was 777 (plan) / 783 observed at start; the suite finished at 843 passing with zero
failures. No regression.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Runaway gate could hang CI instead of failing it**
- **Found during:** Task 2, RED phase
- **Issue:** The first RED run of `client-formula-bounds.test.ts` did not fail — it **hung**, and
  had to be killed after 180s. With `FORMULA_EVAL_OPTIONS` not yet exported, the 4th argument was
  `undefined`, so the runaway expression ran unbounded and blocked the vitest worker's event loop
  inside synchronous WASM. This is exactly the failure mode `formula-recalc.ts` documents ("even
  the test runner's own timeout cannot fire") — observed first-hand rather than inherited. A gate
  that wedges CI when the invariant it guards is broken is strictly worse than one that fails.
- **Fix:** Added a precondition asserting `FORMULA_EVAL_OPTIONS?.timeoutMs` is a positive finite
  number *before* entering the sandbox. RED then completed in 5s. If the export is ever deleted,
  the suite now fails fast instead of hanging.
- **Files modified:** `src/components/custom-fields/__tests__/client-formula-bounds.test.ts`
- **Commit:** 60c090c

**2. [Rule 3 - Blocking issue] Doc comment polluted the client-safety grep**
- **Found during:** Task 2, final verification
- **Issue:** The plan's verification step `grep -rn "@/db" src/lib/formula-engine.ts` must return
  nothing. My justification comment named the module specifier literally to explain why the
  constants moved, so the grep matched two lines of prose. A real database import added later
  would have been indistinguishable from the comment in that signal.
- **Fix:** Reworded to "the server-only database client", preserving the explanation while
  keeping the grep signal pure. The stricter machine check remains the test's
  `expect(source).not.toMatch(/["']@\/db/)` over comment-stripped source.
- **Files modified:** `src/lib/formula-engine.ts`
- **Commit:** 34d2120

### Additive deviation

**3. [Rule 2] Extracted `source-scan.ts` instead of duplicating the scanner**
- The plan described each test file doing its own comment stripping. Both gates depend on
  *identical* stripping semantics (a comment must never satisfy either), and ~50 duplicated lines
  that can drift apart would quietly weaken both. Extracted `stripComments`, `readStrippedSource`
  and `callArguments` into `src/components/custom-fields/__tests__/source-scan.ts` (not a
  `.test.ts`, so vitest's include glob ignores it). Both gates import it.
- String-awareness in the stripper is not decoration: an `href="https://…"` in a page source
  would otherwise be truncated as a line comment, swallowing any JSX prop on that line.
- A meta-test in `client-formula-bounds.test.ts` proves a commented-out bounded call does **not**
  satisfy the gate.

No architectural changes were required; no packages were installed (T-44-SC holds).

## Authentication gates

None encountered.

## Known Stubs

None. No placeholder values, empty literals or TODOs were introduced.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change was introduced.
The activity native attributes (`Title`, `Notes`, `DueDate`, `CompletedAt`) are already rendered
on the same page to the same authenticated user — T-44-14, accepted in the plan.

## Notes for later plans

- **44-07** owns `formula-field.tsx`'s `isCachedResult` branch; that branch was deliberately left
  untouched here. The live-evaluation branch it falls through to is now bounded, so 44-07 inherits
  the bound for free.
- `source-scan.ts` is available to any future source-read gate in this phase; prefer it over a new
  ad-hoc stripper.
- Concurrent wave-1 agents were active in the same working tree throughout. All commits staged
  files individually; no `git add -A` was used.

## Self-Check: PASSED

All 9 claimed files exist on disk; all 5 claimed commits exist in git history.
