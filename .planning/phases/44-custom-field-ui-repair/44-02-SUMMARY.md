---
phase: 44-custom-field-ui-repair
plan: 02
subsystem: custom-fields
tags: [custom-fields, formula, api, save-path, security, tdd]

# Dependency graph
requires:
  - phase: 34-formula-reactivity (plan 03)
    provides: "recalculateFormulas returning { customFields, evaluations } — the blob this plan stops discarding (D-17)"
  - phase: 34-formula-reactivity (plan 03)
    provides: "stripFormulaKeys — the T-34-04 mitigation this plan re-pins for the wrapper-object shape"
provides:
  - "saveFieldValues resolves { success: true, values } — the post-recalculation customFields blob, ready for the client to merge"
  - "values falls back to the written blob when recalculateFormulas throws, so the caller never receives undefined (D-05 preserved)"
  - "POST /api/custom-fields/save now answers with the recomputed values, with no route change"
  - "Explicit coverage that client-held {formula:true,...} wrappers are stripped server-side on the way back in"
affects: [44-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Seed-then-overwrite for a swallowed try/catch: initialise the result local with the safe fallback BEFORE the try, so the catch needs no recovery logic and stays byte-identical"
    - "Additive return-type widening (new optional key) rather than a breaking shape change — the single caller needed no edit and the new key flows through NextResponse.json automatically"

key-files:
  created: []
  modified:
    - src/lib/custom-fields.ts
    - src/lib/custom-fields.test.ts

key-decisions:
  - "`values` is seeded with `next` (the blob actually written) before the try, not inside the catch — the catch block stays literally unchanged, which is what keeps the D-05 review surface at zero"
  - "The returned object is `result.customFields` by reference, not a copy — asserted with toBe. The caller sets it into React state and never mutates it, and copying would only hide an aliasing bug rather than prevent one"
  - "`values` is optional in the type so the validation-failure path is untouched; a failed save returns { success: false, error } with no `values` key at all, asserted directly"
  - "Two pre-existing assertions used `toEqual({ success: true })`, which is exact-shape and structurally incompatible with an added key. Loosened to `expect(result.success).toBe(true)` in the RED commit — the intent of both tests (recalc still ran / D-05 still succeeds) is unchanged and each retains its own specific follow-up assertions"
  - "Task 2 is test-only by design: stripFormulaKeys is name-based and value-shape agnostic, so the wrapper-object case was already handled. The test exists because plan 44-07 makes that case the production norm, and RESEARCH Pitfall 3 warns the naive test asserts the opposite"

requirements-completed: [CFUI-02]

# Metrics
duration: 16min
completed: 2026-08-15
---

# Phase 44 Plan 02: Post-Recalculation Payload Summary

**`saveFieldValues` now hands back the `customFields` blob `recalculateFormulas` already computed and previously threw away, so the save path finally answers with data the client can display instead of a bare `{ success: true }`.**

## The exact contract 44-07 consumes

```ts
export async function saveFieldValues(
  entityType: EntityType,
  entityId: string,
  values: Record<string, unknown>
): Promise<{ success: boolean; error?: string; values?: Record<string, unknown> }>
```

Three resolution shapes, all pinned by test:

| Situation | Resolves |
|-----------|----------|
| Happy path | `{ success: true, values: <recalculateFormulas' customFields, by reference> }` |
| `recalculateFormulas` throws | `{ success: true, values: <the blob just written — stripped post + carried-over stored formula wrappers> }` |
| Validation failure | `{ success: false, error: "..." }` — **no `values` key**, no DB write, no recalculation |

`values` is never `undefined` on a successful save, so 44-07's `if (result.values) setLocalValues(result.values)` takes the truthy branch on both success paths. It is typed optional only because the failure path omits it.

`src/app/api/custom-fields/save/route.ts` was **not modified** (last touched in phase 07). It already does `NextResponse.json(result)`, so the new key reaches the browser for free — confirmed by `tsc --noEmit` rather than by an edit.

## What changed

`src/lib/custom-fields.ts` — the only production edit, 14 lines:

- Return type widened additively with the optional `values` key.
- A `let recalculated: Record<string, unknown> = next` seeded **before** the `try`.
- The awaited `recalculateFormulas(...)` result captured and its `.customFields` assigned inside the `try`.
- `return { success: true, values: recalculated }`.

Untouched, deliberately: validation ordering, `stripFormulaKeys`, the D-06 carry-over, `diffChangedFields`, the `db.update` call, and the entire `catch` block including its `console.error`. No `crmBus` emit was added — the module's own doc comment explains why that absence is intentional, and this plan does not disturb it.

## D-05 is intact and now cheaper to reason about

The requirement is that a broken admin-authored formula must never block a user's edit. The `catch` still swallows and still logs with the `[formula-recalc]` prefix. The change *strengthens* the guarantee: previously a swallow left the client with nothing; now it leaves the client with the blob that genuinely reached Postgres, including the carried-over stored wrapper for the formula field. Seeding the local before the `try` rather than assigning inside the `catch` is what let the catch block stay literally unchanged.

Covered by `mockRejectedValueOnce(new Error("boom"))` in two tests: one asserting `success === true` plus `values` deep-equalling the captured `db.update(...).set(...)` payload, one asserting the fallback still carries `Margin`'s stored wrapper.

## Security — T-34-04 does not regress

Plan 44-07 will merge the server's `values` into `localValues`, which means the client's *next* save POSTs full `{ formula: true, value: N, error: null }` wrapper objects back. The pre-existing T-34-04 coverage only posted a scalar (`Margin: 999999`), so the wrapper-object shape — the one that will actually occur in production after this phase — was untested.

Four new assertions close that:

- A posted wrapper claiming `value: 999999` never overwrites the stored `value: 60`.
- `stripFormulaKeys` is called with the posted values and the loaded definitions, and its invocation order is asserted to precede `db.update(...).set(...)`.
- A non-formula key posted alongside the wrapper is written normally — stripping does not over-reach.
- Posting a wrapper cannot force a recalculation (`changedFields` stays empty).

Per RESEARCH Pitfall 3, these assert that wrappers **are present in the POST and stripped server-side**. No test claims the client never sends formula keys — that assertion would be wrong and 44-07 would break it by design.

Threat register dispositions all hold: T-44-04 mitigated and now asserted for the wrapper shape; T-44-05 mitigated (validation still precedes every read and write, and the failure path is asserted to produce no `values` and no write); T-44-06 accepted unchanged (the blob returned is the caller's own record, already readable via the detail page); T-44-07 mitigated (D-05 above); T-44-SC — **no packages were installed**.

## Tests

10 new tests, 32 in the file, all green.

- `saveFieldValues — returns the recomputed blob (CFUI-02)` — 6 tests
- `saveFieldValues — client-held wrappers are stripped on the way back in (T-34-04 / Pitfall 3)` — 4 tests

Full suite: **843 passed, 0 failed, 4 skipped** across 55 files — above the 777 baseline (the delta is this plan's 10 plus concurrent Wave-1 plans' tests). `tsc --noEmit` clean. `eslint src/lib` 0 errors.

## TDD Gate Compliance

| Gate | Commit | Note |
|------|--------|------|
| RED | `be98861` `test(44-02)` | 3 failures, all `expected undefined` on the new `values` key |
| GREEN | `e13bf08` `feat(44-02)` | 28/28 |
| REFACTOR | — | Not needed; the implementation is 14 lines with no duplication to extract |

The Task 2 commit `4606584` is a `test(...)` with no paired `feat`. This is correct and not a skipped gate: Task 2's `<files>` lists only the test file. `stripFormulaKeys` matches on field *name* and ignores value shape (`formula-recalc.ts:302-316`), so the wrapper-object case was already mitigated — the test pins behaviour that 44-07 will make load-bearing. It was verified discriminating: it asserts the persisted `value` is `60`, so a bypassed strip writing `999999` would fail it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two pre-existing exact-shape assertions were incompatible with the added key**

- **Found during:** Task 1, RED
- **Issue:** `custom-fields.test.ts:171` and `:360` asserted `expect(result).toEqual({ success: true })`. `toEqual` is exact on defined keys, so adding `values` would have failed both — the plan's "every pre-existing test still passes" was unachievable as literally written.
- **Fix:** Loosened both to `expect(result.success).toBe(true)`. Neither test is about the return shape (one asserts `recalculateFormulas` ran with empty `changedFields`, the other asserts the D-05 log prefix), and both keep their specific assertions. The new CFUI-02 block now owns shape coverage explicitly.
- **Files modified:** `src/lib/custom-fields.test.ts`
- **Commit:** `be98861`

### Out of scope, not fixed

- `src/lib/custom-fields.ts:2` has a pre-existing `@typescript-eslint/no-unused-vars` **warning** for the unused `FieldConfig` import, on a line this plan did not touch. 0 errors, so the verification gate passes; not fixed, as it predates this plan and is unrelated to the change.

### Concurrency note

Other Wave-1 executors were writing to the same working tree throughout. Two intermediate full-suite runs showed failures (`probe.rsc.test.tsx`, then `client-formula-bounds.test.ts`) in untracked files belonging to those plans, mid-RED; both went green once their owners committed, and the final run is clean. Every `git add` here named individual paths, and the one uncommitted diff was verified as 63 insertions / 0 deletions — exactly this plan's Task 2 block — before staging. No other agent's work was swept into these commits.

## Known Stubs

None. Both tasks are complete and no placeholder values were introduced.

## Threat Flags

None. No new endpoint, auth path, file access pattern, or schema change — the only new surface is an additional key on an existing authenticated response, already dispositioned as T-44-06 (accept).

## For the Next Plan

44-07 consumes this. The merge is:

```ts
const result = await saveCustomFields(entityType, entityId, newValues)
if (result.success) {
  if (result.values) setLocalValues(result.values)
  onValuesChange?.(result.values ?? newValues)
}
```

`result.values` is a fresh object from the server on every save, so setting it into state is safe. Once that lands, `localValues` holds formula wrappers and every subsequent save POSTs them back — which the Task 2 tests already prove is handled.

## Self-Check: PASSED

- Files verified on disk: `src/lib/custom-fields.ts`, `src/lib/custom-fields.test.ts`, `.planning/phases/44-custom-field-ui-repair/44-02-SUMMARY.md`
- Commits verified in git: `be98861`, `e13bf08`, `4606584`
- `values: recalculated` present in the implementation; both new describe blocks present in the test file

