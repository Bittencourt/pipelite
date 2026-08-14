---
phase: 34-formula-reactivity
plan: 07
subsystem: mutations
tags: [tdd, formula, recalc-before-emit, cascade-parent, d-01, d-03, d-05, d-17, t-34-04, t-34-19]

# Dependency graph
requires:
  - plan: 34-02
    provides: customFields actually persisted and shallow-merged by the person/organization mutations
  - plan: 34-03
    provides: recalculateFormulas, stripFormulaKeys, ENTITY_NATIVE_ATTRIBUTES, definitionsCache
  - plan: 34-04
    provides: the depth-1 cascade and the single shared 500-evaluation budget an organization save spends
provides:
  - "createPersonMutation / updatePersonMutation recalculate before crmBus.emit (D-01/D-17)"
  - "createOrganizationMutation / updateOrganizationMutation recalculate before crmBus.emit — the cascade's primary trigger (D-03)"
  - "PUT /api/v1/organizations/[id] performs ONE write, through the mutation; its second db.update is removed (T-34-19)"
  - "stripFormulaKeys applied to caller-supplied customFields on all four entry points (T-34-04)"
  - "First route-level test file for the v1 organizations [id] endpoint"
affects: [34-09, 34-10, 34-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-mutation definitionsCache: the T-34-04 strip's definition read is handed to recalculateFormulas through definitionsCache, so one save issues one definition query, not two"
    - "Emit-time payload rebuild: `{ ...row, customFields: recalced.customFields }` — the stored row object is never mutated, the emitted snapshot is"
    - "Recalc failure returns the pre-recalc blob rather than rejecting, so the write path has exactly one success shape (D-05)"

key-files:
  created:
    - src/app/api/v1/organizations/[id]/__tests__/route.test.ts
  modified:
    - src/lib/mutations/people.ts
    - src/lib/mutations/organizations.ts
    - src/lib/mutations/people.test.ts
    - src/lib/mutations/organizations.test.ts
    - src/app/api/v1/organizations/[id]/route.ts

key-decisions:
  - "The create path's changedFields uses the PERSISTED (post-strip) custom field keys, not the caller's raw keys — a key the server just stripped was not written, so listing it as changed would be a lie the scoping would act on"
  - "The mutations' RETURN value keeps the raw database row; only the emitted payload carries post-recalc customFields. Folding the recalc into the return would have broken two pre-existing plan 34-02 assertions, and the brief forbids weakening an existing test. Consequence recorded under Known Limitations"
  - "stripCallerFormulaKeys fails OPEN (logs, persists the caller's blob) if the definition read itself throws — the recalculation that immediately follows overwrites every in-scope formula key anyway, and D-05 forbids formula machinery blocking a user's edit"
  - "A route-level test file was added (outside the plan's files_modified) because the executor brief requires proving by test that a PUT ends with the recomputed value; a source scan for `db.update(` alone cannot show that"

patterns-established:
  - "Pattern: mutation-local ENTITY / NATIVE_COLUMNS / DefinitionsCache trio, so the create path's changedFields is derived from ENTITY_NATIVE_ATTRIBUTES rather than hard-coded"
  - "Pattern: mock @/lib/formula-recalc with importOriginal so ENTITY_NATIVE_ATTRIBUTES stays REAL in the test — a drift between the map and the create path cannot pass silently"

requirements-completed: [FORMULA-01, FORMULA-02]

# Metrics
duration: 9min
tasks_completed: 2
files_changed: 6
tests_added: 35
completed: 2026-08-14
---

# Phase 34 Plan 07: Person and Organization Recalc-Before-Emit Summary

**Every person and organization save now recomputes its formula fields before the event leaves the process, and the organization API's second write — the one that would have overwritten those fresh values with the caller's raw blob — is gone.**

## What Changed

Four entry points gained the plan 34-06 call-site shape, between the `.returning()` write and `crmBus.emit`:

```ts
const customFields = await recalcCustomFieldsForEmit(id, changedFields, row, definitionsCache)
crmBus.emit("organization.updated", buildEventPayload(
  id, "updated",
  { ...updatedOrg, customFields } as unknown as Record<string, unknown>,
  userId,
  changedFields.length > 0 ? changedFields : null,
))
```

`recalcCustomFieldsForEmit` and `stripCallerFormulaKeys` are small module-local wrappers in each file (they differ only in their `ENTITY` constant and log text), so every call site is bounded, cached and failure-isolated identically without a new shared module — `src/lib/formula-recalc.ts` belongs to plans 34-03/34-04 and was not touched.

`PUT /api/v1/organizations/[id]` lost 20 lines: `custom_fields` now enters `mutationData` as `customFields`, and the route's own `db.update(organizations)` plus its extra re-fetch are deleted. The route reads twice (ownership check, response) and writes zero times.

## Task Commits

1. **Task 1 RED — 35 failing recalc-before-emit tests** — `f706abf` (test)
2. **Task 2 GREEN — wire the four mutations and collapse the org route's double write** — `bea0241` (feat)

No REFACTOR commit: the GREEN implementation needed no cleanup pass.

## The Two Blocking Requirements

### D-17 — ordering, asserted by invocation order and mutation-checked

Four `invocationCallOrder` assertions per test file (`expect(mockRecalc.mock.invocationCallOrder[0]).toBeLessThan(mockEmit.mock.invocationCallOrder[0])`), plus a payload assertion per entry point that the emitted `data.customFields` deep-equals the mocked recalc result and **is not** the pre-recalc row's blob (the two fixtures are deliberately different objects, so the assertion cannot be vacuous).

Following plan 34-03's precedent, the guard was **mutation-checked** rather than trusted: the update path's recalc was temporarily moved to after the emit — the exact D-17 defect — and the suite went to **2 failed / 23 passed**, failing precisely the ordering assertion and the payload assertion. The file was restored from a scratchpad backup and returned to 25/25.

### T-34-19 — the second write is removed, not left idempotent

Left in place, that write would have landed *after* `updateOrganizationMutation`'s recalculation and set `customFields` to `{ ...existing, ...custom_fields }` — the caller's raw blob, silently replacing every freshly computed formula wrapper. That is a client-controlled overwrite of server-derived data, not untidiness.

Proven three ways in `src/app/api/v1/organizations/[id]/__tests__/route.test.ts`:

- `expect(mockDb.update).not.toHaveBeenCalled()` on a PUT carrying `custom_fields`;
- the response body's `custom_fields.Score` equals the recomputed `{ formula: true, value: 42, error: null }` and **not** the `999` the caller sent;
- `findFirst` called exactly twice, so removing the block did not trade one write for an extra read.

Plus the plan's source scan: `db\.update\(` occurs **0** times in the route.

## D-18 Compliance

This plan introduces **no new `evaluateFormula` call site**. Every evaluation still runs through the single bounded call inside `recalculateFormulas`, which passes `FORMULA_EVAL_OPTIONS` (8 MiB / 500 ms) — pinned by plan 34-03's two dedicated tests and plan 34-04's cascade-wide loop assertion, all 69 of which still pass. There is therefore no way for a person or organization save to reach an unbounded evaluation.

## D-03 / D-09 — the organization is the cascade parent

`cascade` is left at its default `true` and is asserted to be so (`expect(recalcInput().cascade).not.toBe(false)`), because an organization save is the only one that fans out to two child tables and the largest measured case (114 deals + 10 people) is exactly what the 500-evaluation budget was sized against. `changedFields` is passed through **verbatim** — asserted with `toEqual(["name"])` — because the cascade decides child fan-out from that list; pre-filtering here would silently narrow it, and embellishing it would defeat SC-4.

Ownership is not consulted anywhere on this path: plan 34-04 owns the cascade query, and D-09 makes the refresh owner-independent by design.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run` people + organizations + org route + formula-recalc | exit 0 — **123 passed** (23 + 25 + 6 + 69) |
| `npm test` | exit 0 — 45 files, **617 passed / 4 skipped** (baseline 44 files, 582/4; +35 = exactly the new tests) |
| `npx tsc --noEmit` | exit 0, no output |
| `npx eslint .` | exit 0 — **0 errors**, 128 warnings (unchanged pre-existing baseline) |
| `db.update(` count in `organizations/[id]/route.ts` | **0** — `single-write OK` |
| `recalculateFormulas` in non-comment source of both mutations | two `ok` lines |
| `invocationCallOrder` occurrences per test file | people **4**, organizations **4** |
| `git diff -U0` removed lines in the two existing test files | **0** — append-only; no existing test weakened or deleted |
| `git diff --name-only -- deals.ts activities.ts formula-recalc.ts custom-fields.ts src/lib/execution` | **empty** — nothing owned by plans 34-06 / 34-08 / 34-12 touched |
| File deletions in either commit | none |
| Untracked files left behind | none |
| `package.json` / `package-lock.json` diff | empty — zero new dependencies (T-34-SC) |

### The RED gate failed for the right reasons

31 failures, 23 passes, every failure a direct consequence of the missing recalc or the surviving double write — not mock wiring:

- 6 x `expected "vi.fn()" to be called 1 times, but got 0 times` (recalc never called);
- 5 x `Cannot read properties of undefined (reading '0')` — `mock.calls[0][0]` on an empty call list;
- 4 x `actual value must be number or bigint, received "undefined"` — `invocationCallOrder[0]` on an uncalled spy;
- 4 x deep-equal failures showing the **pre-recalc** blob in the emitted payload;
- 4 x `stripFormulaKeys` never called; 4 x `console.error` never called;
- 1 x `Cannot read properties of undefined (reading 'set')` at `route.ts:123` — the double write itself.

The 23 RED passes are the assertions that must hold in both states (delete-does-not-recalculate, the 34-02 persistence block, the pre-existing emit tests, and the route's 404 path).

## Confirmation Required by the Plan's Output Section

All three POST paths were read and are **mutation-routed with no direct write of their own** — they are covered transitively:

| Route | Evidence |
|---|---|
| `POST /api/v1/organizations` (`route.ts:96`) | `createOrganizationMutation(...)`; zero `db.insert` / `db.update` in the file |
| `POST /api/v1/organizations/batch` (`batch/route.ts:56`) | `createOrganizationMutation(...)` per row; zero `db.insert` / `db.update` |
| `POST /api/v1/activities` (`activities/route.ts:168`) | `createActivityMutation(...)`; zero `db.insert` / `db.update`. (The mutation itself belongs to plan 34-06.) |

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] A route-level test file was created, outside the plan's `files_modified`**

- **Found during:** Task 1.
- **Issue:** The plan proves the double-write removal with a source scan for `db.update(`. That shows the write is gone but says nothing about the *behaviour* the removal exists to protect — that a PUT carrying `custom_fields` ends with the recomputed value rather than the caller's. The executor brief made that proof blocking.
- **Fix:** Created `src/app/api/v1/organizations/[id]/__tests__/route.test.ts` (6 tests), mirroring the repo's only existing route-test idiom (`src/app/api/v1/workflows/__tests__/runs-routes.test.ts`): `withApiAuth` mocked to pass through, `db` and the mutation mocked. No other plan owns this path (plan 34-06 owns `api/v1/activities`), so the parallel-execution boundary is respected.
- **Files created:** `src/app/api/v1/organizations/[id]/__tests__/route.test.ts`
- **Commit:** `f706abf`

**2. [Decision] Definitions are loaded via `getActiveFieldDefinitions` and handed to the recalc through `definitionsCache`**

- **Found during:** Task 2.
- **Issue:** `stripFormulaKeys(values, definitions)` needs definitions, which the mutation layer never loaded. The naive fix reads them twice per save (once to strip, once inside `recalculateFormulas`).
- **Resolution:** Each mutation creates one `DefinitionsCache`, populates it on the strip, and passes it in — exactly what plan 34-06's action text prescribes ("if that requires a definitions read on the create path, pass the resulting array in through `definitionsCache`"). Pinned by a test asserting `getActiveFieldDefinitions` is called **once** and that the recalc input's `definitionsCache` already holds the entity type. The read only happens when the caller actually supplied `customFields`.
- **Note:** this imports `@/lib/custom-fields`, which plan 34-08 is concurrently modifying. Only `getActiveFieldDefinitions` is used, and 34-08's plan does not change its signature. The file itself was not touched.

**3. [Decision] The create path's `changedFields` uses persisted keys, not the caller's raw keys**

- **Found during:** Task 2.
- **Rationale:** the plan says "the keys of the caller's `customFields`". After the T-34-04 strip, a formula key the caller sent was **not** written. Reporting it as changed would feed the scoping a field that did not change. Using `Object.keys(customFieldsToPersist)` is strictly more precise and still satisfies the plan's test (`changedFields` contains `Origem`).

No Rule 1 (bug) and no Rule 4 (architectural) deviations. No packages installed. No database row read or written — both suites are DB-free via `vi.mock("@/db")`.

## Threat Model Coverage

| Threat | Disposition | Status |
|---|---|---|
| **T-34-19** Tampering — the org route's double write | mitigate | **Closed.** The write is deleted, not neutralised. Three behavioural tests plus the `db.update(` source scan. |
| **T-34-04** Tampering — client-set formula keys | mitigate | `stripFormulaKeys` on all four entry points, before the plan 34-02 insert/merge, and on the `custom_fields` now routed through `updateOrganizationMutation`. Four tests assert the caller's object is what gets stripped. |
| **T-34-03** DoS — organization save amplification | mitigate | Inherited intact from plan 34-04: one shared 500-evaluation budget, `CASCADE_DEPTH = 1`, dotted-ref gate before any child query. `cascade` asserted not to be disabled. |
| **T-34-02** DoS — unbounded evaluation | mitigate | No new `evaluateFormula` call site; every evaluation still carries the D-18 bounds. |
| **T-34-05** Tampering — cascade writes to another owner's rows | accept | D-09, unchanged. This plan adds no ownership predicate and removes none. |
| **T-34-17** Repudiation — recalc failure visibility | mitigate | Failures log with a `[formula-recalc]` prefix and the save still succeeds; four tests assert both halves, including the prefix. |
| **T-34-SC** Tampering — npm installs | accept | Zero packages. |

**Threat surface scan:** no new endpoint, auth path, file access or schema change. `PUT /api/v1/organizations/[id]` keeps its Zod schema, its `withApiAuth` wrapper, its owner-scoped `findFirst` and its response shape byte-for-byte; the only change is where the `custom_fields` write happens. Nothing to flag.

## Known Stubs

None. No placeholder values, hardcoded empties feeding UI, or TODO/FIXME markers were introduced.

## Known Limitations (deliberate, not defects)

- **A create's RESPONSE body is pre-recalc.** `createOrganizationMutation` / `createPersonMutation` still return the raw `.returning()` row, so `POST /api/v1/organizations` echoes the un-computed blob in its 201 while the stored value and the emitted event are correct; the next `GET` is right. Changing the return would have broken two plan 34-02 assertions that compare the result against the fixture by identity, and the brief forbids weakening an existing test. The `PUT` path does not have this gap — it re-reads after the mutation. Worth a follow-up once plan 34-06 settles on the same question for deals.
- **`stripCallerFormulaKeys` fails open.** If the definition query throws, the caller's blob is persisted unstripped (logged). The recalculation that immediately follows overwrites every in-scope formula key, so the exposure is narrow; the alternative — failing the user's save because a definitions read blipped — contradicts D-05.
- **Soft deletes do not recalculate**, so a child of a deleted organization keeps its stale derived value until its own next save. Recorded for plan 34-11.
- **Two near-identical helper pairs** now exist, one per mutation module (and plans 34-06 / 34-09 will add more). Extracting them belongs with whoever owns `formula-recalc.ts`, not with a plan forbidden from touching it.

## Next Plan Readiness

- **Plan 34-09 / 34-10** can copy the call-site shape verbatim from `organizations.ts`; the `definitionsCache`-shared-with-strip trick is the part worth reusing.
- **Plan 34-11** should record two cross-phase notes: the create-response staleness above, and the D-09 system-attribution question for Phase 36's audit log.
- **Merge note for the orchestrator:** this branch touches only `src/lib/mutations/{people,organizations}.{ts,test.ts}` and `src/app/api/v1/organizations/[id]/**`. Disjoint from 34-06 (deals/activities), 34-08 (`custom-fields.ts`) and 34-12 (`condition-evaluator.ts`). `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally not modified.

## Self-Check: PASSED

Files verified present on disk:
- `src/lib/mutations/people.ts` — FOUND
- `src/lib/mutations/organizations.ts` — FOUND
- `src/lib/mutations/people.test.ts` — FOUND (23 tests)
- `src/lib/mutations/organizations.test.ts` — FOUND (25 tests)
- `src/app/api/v1/organizations/[id]/route.ts` — FOUND
- `src/app/api/v1/organizations/[id]/__tests__/route.test.ts` — FOUND (6 tests)

Commits verified in `git log`:
- `f706abf` — FOUND (`test(34-07)`)
- `bea0241` — FOUND (`feat(34-07)`)

RED-before-GREEN ordering verified: `f706abf` is the parent of `bea0241`.
No file deletions in either commit (`git diff --diff-filter=D HEAD~2 HEAD` empty).
No untracked files left behind (`git status --porcelain -uall` clean).

## TDD Gate Compliance

Gate sequence satisfied. RED: `test(34-07)` `f706abf`, verified failing with 31 failures, every one a missing-recalc or double-write consequence and none a mock-wiring `TypeError`; all 23 pre-existing/invariant assertions still passed. GREEN: `feat(34-07)` `bea0241`, 54/54 across the three files. No REFACTOR gate needed.

---
*Phase: 34-formula-reactivity*
*Completed: 2026-08-14*
