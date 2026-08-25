---
phase: 37-trash-restore
plan: 06
subsystem: trash
tags: [dispatch, exhaustiveness, entity-types, restore, purge, type-safety]

# Dependency graph
requires:
  - plan: 37-02
    provides: "EntityType vocabulary, parseTrashTab / isTrashEntityType (the narrowing every untrusted caller must pass)"
  - plan: 37-04
    provides: "restoreDealMutation, purgeDealMutation, restoreActivityMutation, purgeActivityMutation"
  - plan: 37-05
    provides: "restorePersonMutation, purgePersonMutation, restoreOrganizationMutation, purgeOrganizationMutation"
provides:
  - "restoreRecordByType(entityType, id) -> Promise<RestoreResult>"
  - "purgeRecordByType(entityType, id) -> Promise<PurgeResult>"
  - "RestoreResult and PurgeResult, so a caller needs no import from the four mutation modules"
  - "one compile-checked place where a fifth entity type breaks the build"
affects:
  - "37-07 server actions (restoreWithLinked restores parents of different entity types)"
  - "37-11 REST routes (the type arrives as a path segment)"
  - "37-14 retention pruner (walks TRASH_PRUNE_ORDER)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Frozen Record<EntityType, fn> dispatch map, annotated AND `satisfies`-checked"
    - "Pass-through dispatch: returns the callee's own promise, so result identity survives"
    - "No runtime `if (!fn) throw` fallback — the closed union plus caller-side narrowing is the control"

key-files:
  created:
    - src/lib/trash/dispatch.ts
    - src/lib/trash/dispatch.test.ts
  modified: []

key-decisions:
  - "The maps stay module-private; the plan's `Object.keys(map).sort()` assertion is met behaviourally instead of by widening the export surface for a test's convenience"
  - "`satisfies RestoreMap` / `satisfies PurgeMap` added on top of the const annotation: Object.freeze defeats excess-property checking, so the annotation alone accepts a fifth key"
  - "restoreRecordByType is NOT async — it returns the mutation's own promise, which is what makes result identity and rejection propagation observable"

patterns-established:
  - "Exhaustive dispatch over EntityType: one map, both failure directions compile-checked, verified by temporarily breaking each"

requirements-completed: [TRASH-02, TRASH-03]

# Metrics
duration: 12min
completed: 2026-08-16
tasks_completed: 1
tests_added: 16
files_created: 2
---

# Phase 37 Plan 06: Trash Restore/Purge Dispatch Summary

**One frozen `Record<EntityType, fn>` map per operation routes an entity type to its restore or purge
mutation, forwarding the result by identity — so the server actions, the REST routes and the
retention pruner share one exhaustiveness check instead of three hand-maintained switches.**

## Performance

- **Duration:** ~12 min (15:34 → 15:46)
- **Tasks:** 1 (TDD, RED → GREEN)
- **Files created:** 2

## What Was Built

`src/lib/trash/dispatch.ts` — two module-private frozen maps and two four-line functions:

```
restoreRecordByType(entityType, id) -> RESTORE_BY_TYPE[entityType](id)
purgeRecordByType(entityType, id)   -> PURGE_BY_TYPE[entityType](id)
```

Everything interesting about this module is what it *refuses* to do:

- **No `try`/`catch`.** Each mutation already contains one and returns `{ success: false; error }`
  for anything it can describe. A rejection that escapes one is a genuine programming error, and
  catching it here would flatten it into something indistinguishable from an ordinary refusal.
- **No permission check.** Admin gating on purge and ownership on restore belong to 37-07 and
  37-11 — the boundaries that actually hold a caller identity. This matches the Phase 24 decision
  that mutations check entity existence and nothing more. A second check here would be two places
  to audit and one to forget.
- **No `if (!fn) throw` fallback.** `entityType` is the closed union and every untrusted value
  narrows through `parseTrashTab` or `isTrashEntityType` first (T-37-03). A fallback would make the
  compile-time exhaustiveness look advisory.
- **No wrapping.** The functions are not `async`; they return the mutation's own promise. That is
  what makes the identity assertions in the test suite meaningful rather than decorative.

## The one substantive correction: `Object.freeze` defeats excess-property checking

The plan specifies the maps as `const X: Readonly<Record<EntityType, fn>> = Object.freeze({...})`,
on the premise that the annotation is what makes a fifth entity type a compile error. **Half of that
is true, and the untrue half is the more dangerous one.**

Verified empirically, both directions, against the real project `tsc`:

| Mutation to the map | Annotation alone | Annotation + `satisfies` |
|---------------------|------------------|--------------------------|
| Remove `person` from `PURGE_BY_TYPE` | **TS2741** — caught | **TS2741 + TS1360** — caught |
| Add `note: purgeDealMutation` | **exit 0 — SILENTLY ACCEPTED** | **TS2353** — caught |

The object literal is an *argument to `Object.freeze`*, so `T` is inferred from the five-key literal
and the freshness that triggers excess-property checking is gone by the time `Readonly<T>` is
assigned to the annotated const. Without a fix, `dispatch.ts` would happily carry a live route for
an entity type with no trash surface at all, and the module's stated reason to exist would be half
false.

The fix is two named type aliases (`RestoreMap`, `PurgeMap`) used **both** as the const annotation
and as a `satisfies` clause on the literal. `satisfies` runs against the fresh literal, so it catches
the extra key; the annotation still catches the missing one. Both failures are now reproduced in the
doc comment so the next reader does not have to rediscover the asymmetry.

## Task Commits

| Task | Gate | Commit | Message |
|------|------|--------|---------|
| 1 | RED | `e6a7426` | test(37-06): add failing tests for the trash restore/purge dispatch |
| 1 | GREEN | `60d32f3` | feat(37-06): add the trash restore/purge dispatch map |

## TDD Gate Compliance

A real RED gate: the test file was committed while `dispatch.ts` did not exist, and the RED run
failed with `Cannot find module '/src/lib/trash/dispatch'` — not with an assertion failure, and not
with a passing test. `test(...)` precedes `feat(...)` in `git log`. No REFACTOR gate was needed.

## What the 16 tests actually pin

The type checker cannot catch the failure mode that matters most here. All eight mutations share one
signature, so `person: restorePersonMutation` and `person: restoreOrganizationMutation` typecheck
**identically** — a copy-pasted map entry pointing at the neighbouring entity is invisible to `tsc`
and would restore the wrong record. Every dispatch test therefore asserts both that the expected spy
was called and that **the other seven were not**, via a helper that iterates all eight rather than
spot-checking a couple.

Beyond that:

- **Result identity, not equality.** `expect(returned).toBe(result)` against a per-test object, so a
  dispatch that rebuilt an equal-looking result still fails. A `NOT_IN_TRASH` refusal is additionally
  asserted to arrive with its `error` string untouched — the client switches on that code.
- **Promise identity.** `expect(returned).toBe(spy.mock.results[0].value)` proves nothing was
  awaited and re-wrapped, which is the shape an added `try`/`catch` would take.
- **Rejections propagate** (`rejects.toBe(boom)`), on both functions.
- **A fifth type has no entry in either map**, asserted by casting one in and expecting a synchronous
  `TypeError` — which simultaneously pins the deliberate absence of a runtime fallback.
- The test's own wiring table carries `satisfies Record<EntityType, unknown>`, so a fifth entity type
  makes the **test file** fail to compile too; the table cannot silently stop covering the union.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The specified map declaration does not reject an extra key**

- **Found during:** Task 1, running the plan's own required check ("temporarily deleting one entry
  from either map must produce a type error"). Deleting a key behaved as specified; testing the
  opposite direction did not.
- **Issue:** `Object.freeze({...})` strips literal freshness, so excess-property checking never runs
  and `note: purgeDealMutation` compiled with exit 0.
- **Fix:** Added `satisfies RestoreMap` / `satisfies PurgeMap` on the literals, with the two type
  aliases extracted so the shape is written once per map. Both failure directions re-verified after
  the change (TS2741 and TS2353) and the file reverted to its correct form.
- **Files modified:** `src/lib/trash/dispatch.ts`
- **Commit:** `60d32f3` (found and fixed before the GREEN commit landed)

### Adapted, not auto-fixed

**2. [Instruction conflict] `Object.keys(map).sort()` vs. module-private maps**

The task's `<behavior>` asks the test to assert `Object.keys(...).sort()` equality on both maps,
while the same task's `<action>` requires the maps to be **module-private** and
`must_haves.artifacts.exports` lists exactly four exports, none of them a map. Both cannot be
followed literally.

Resolution: the maps stay private and the key sets are asserted **behaviourally** — all four types
are driven through both functions, the set that actually reached a mutation is compared to
`["activity", "deal", "organization", "person"]`, the two sets are compared to each other, and
exactly eight distinct spies are shown to have been called once each (so no entry doubles up on
another's mutation). A fifth type is separately shown to have no entry in either map. That is the
same fact, observed from outside, without widening the export surface to make a test convenient.

---

**Total deviations:** 1 auto-fixed (1 bug), 1 adaptation.
**Impact on plan:** None on scope. The module is strictly stronger than specified.

## Verification

| Check | Required | Result |
|-------|----------|--------|
| `npx vitest run src/lib/trash/dispatch.test.ts` | ≥10 tests, all 8 paths | **16 passed** |
| `npm run typecheck` | exit 0 | **exit 0** |
| `npm run lint` | 0 errors | **0 errors, 125 warnings** (baseline unchanged, none in `src/lib/trash`) |
| `npm test` (full) | — | **1565 passed / 4 skipped**, + **8** rsc (1549 baseline + 16 new) |
| `grep -c 'Record<EntityType' dispatch.ts` | ≥2 | **4** |
| `grep -c 'try {' dispatch.ts` | 0 | **0** |
| `grep -c 'session\|auth(' dispatch.ts` | 0 | **0** |
| Deleting a map entry is a type error | required | **TS2741** (`Property 'person' is missing`) + TS1360 |
| Adding a stray map key is a type error | not required | **TS2353** — only after the `satisfies` fix; see Deviations |

No flakes observed in the full run: `condition-evaluator.test.ts` and `toggle.test.ts` both passed.

## Threat Coverage

| Threat | Disposition | Where it lands |
|--------|-------------|----------------|
| T-37-03 (tampering via `entityType`) | mitigate | The parameter is the closed `EntityType` union; the map has exactly four keys, with both the missing-key and extra-key directions now compile errors, and a fifth type proven to have no entry at runtime |
| T-37-17 (result reshaping) | mitigate | The mutation's own promise and its own result object are returned; asserted with `toBe` on both, including for a `NOT_IN_TRASH` failure |
| T-37-01 (no permission check here) | accept | Deliberate and documented in the module header; the grep gate for `session` / `auth(` returns 0 |
| T-37-SC (package installs) | accept | Nothing installed |

## Known Stubs

None. Both functions are fully wired to real mutations; nothing returns placeholder data.

## Threat Flags

None. No network endpoint, permission path, file access or schema change was introduced — this plan
adds one pure routing module with no I/O of its own.

## Notes for Later Plans

- **Import this, do not re-switch.** A later plan that writes its own `entityType === "deal" ? … : …`
  re-opens exactly the drift this module exists to prevent, and does so where nothing type-checks it.
- **`dispatch.ts` is server-only.** Unlike its sibling `entity-types.ts` it imports the mutation
  layer at runtime and therefore pulls `@/db` (and `pg`) with it. Never import it from a
  `"use client"` component — import `entity-types.ts` there.
- **`restoreWithLinked` (37-07)** can now restore a record and its `TRASH_PARENTS` in one loop; the
  parents are of different entity types and that is precisely what this map makes uniform.
- **The pruner (37-14)** should iterate `TRASH_PRUNE_ORDER` and call `purgeRecordByType` — leaves
  first, so a parent is never purged while a sibling pass is still detaching from it.
- **Rejections reach you.** The dispatch swallows nothing, so a caller that wants a run to survive
  one bad record (the pruner) must wrap its own call.

## Self-Check: PASSED

Files:
- FOUND: `src/lib/trash/dispatch.ts`
- FOUND: `src/lib/trash/dispatch.test.ts`

Commits:
- FOUND: `e6a7426` test(37-06): add failing tests for the trash restore/purge dispatch
- FOUND: `60d32f3` feat(37-06): add the trash restore/purge dispatch map

Working tree clean; no tracked file deleted by either commit.

---
*Phase: 37-trash-restore*
*Completed: 2026-08-16*
