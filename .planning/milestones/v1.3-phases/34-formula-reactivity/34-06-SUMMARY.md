---
phase: 34-formula-reactivity
plan: 06
subsystem: mutations
tags: [tdd, formula, recalc, crm-events, d-01, d-05, d-17, sc-4, t-34-04]

# Dependency graph
requires:
  - plan: 34-02
    provides: customFields actually persisted on create and shallow-merged on update, plus the `!== undefined` guard the strip/recalc pair hangs off
  - plan: 34-03
    provides: recalculateFormulas, stripFormulaKeys, ENTITY_NATIVE_ATTRIBUTES, and the D-18 bounds passed internally on every evaluateFormula call
  - plan: 34-04
    provides: the depth-1 cascade and the single shared 500-evaluation budget, both on by default
provides:
  - "The canonical recalc-before-emit call-site shape for plans 34-07, 34-09 and 34-10 to replicate verbatim"
  - "Recalc wired into all seven non-delete deal/activity mutation entry points plus PUT /api/v1/activities/[id] (RESEARCH inventory rows #2, #3, #4, #12, #16)"
  - "stripFormulaKeys applied at five write paths — the first live application of the T-34-04 control"
  - "A per-module `recalcCustomFields` wrapper implementing D-05 failure isolation with a [formula-recalc] log prefix"
affects: [34-07, 34-09, 34-10, 34-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recalc-before-emit: await recalculateFormulas on the .returning() row, then build the emitted payload from { ...row, customFields: recalced }"
    - "One `definitionsCache` per request, seeded by the stripFormulaKeys read so the definition query never runs twice in a single mutation"
    - "Ordering is asserted with invocationCallOrder, never inferred from argument contents"

key-files:
  created: []
  modified:
    - src/lib/mutations/deals.ts
    - src/lib/mutations/activities.ts
    - src/lib/mutations/deals.test.ts
    - src/lib/mutations/activities.test.ts
    - src/app/api/v1/activities/[id]/route.ts

key-decisions:
  - "The tests assert on the EMITTED payload, not the persisted blob: the mocked helper resolves with a blob deliberately unequal to every fixture's stored value, so a recalc-after-emit implementation cannot pass"
  - "updateDealStageMutation and reorderDealsMutation have no .returning(), so the post-write object the mutation already builds for its payload is passed as `row` — no .returning() was added, which would have broken the existing chain stubs for no benefit"
  - "reorderDealsMutation updates exactly ONE deal, not many (the plan assumed a loop); the shared definitionsCache is still created so the shape survives if the path ever fans out"
  - "toggleActivityCompletionMutation passes changedFields ['completed', 'completedAt'] to the recalc while its event still emits ['completed'] — 'completedAt' is the column CompletedAt maps to, so scoping can actually select the formula"
  - "The PUT /api/v1/activities/[id] response now serializes the post-recalc blob, so the caller's own response agrees with the row a subsequent GET returns"
  - "Definition-load failure on the strip path is allowed to propagate into the mutation's existing catch (fail closed) rather than writing unstripped client values (fail open)"

patterns-established:
  - "Pattern: `recalcCustomFields(input, fallback)` — a module-local wrapper that resolves to the recomputed blob or, on rejection, logs `[formula-recalc]` and returns the pre-recalc blob"

requirements-completed: [FORMULA-01, FORMULA-02]

# Metrics
duration: 16min
tasks_completed: 2
files_changed: 5
tests_added: 28
completed: 2026-08-14
---

# Phase 34 Plan 06: Recalc-Before-Emit in the Deal and Activity Write Paths Summary

**Eight write paths now recompute formula values and fold them into the event payload before `crmBus.emit` fires — so the webhook body and the workflow-trigger envelope, both emit-time snapshots of the row object, carry the computed value rather than whatever a browser last wrote.**

## The Call-Site Shape (plans 34-07, 34-09 and 34-10 replicate this)

```ts
// 1. Strip client-supplied formula keys BEFORE the write (T-34-04), and keep the
//    definitions so the recalculation does not read them a second time.
const definitionsCache = new Map<EntityType, CustomFieldDefinition[]>()
if (validated.data.customFields !== undefined) {
  const definitions = await getActiveFieldDefinitions("deal")
  definitionsCache.set("deal", definitions)
  updateData.customFields = {
    ...(deal.customFields ?? {}),
    ...stripFormulaKeys(validated.data.customFields, definitions),
  }
  changedFields.push("customFields")
}

// 2. Write the row.
const [updatedDeal] = await db.update(deals).set(updateData).where(eq(deals.id, id)).returning()

// 3. Recalculate — AFTER the write, STRICTLY BEFORE the emit (D-01 / D-17).
const recalculatedCustomFields = await recalcCustomFields(
  {
    entityType: "deal",
    entityId: id,
    changedFields,                                              // the SC-4 gate, passed straight through
    row: updatedDeal as unknown as Record<string, unknown>,     // from .returning(); no re-read
    definitionsCache,
  },
  (updatedDeal.customFields ?? {}) as Record<string, unknown>,  // D-05 fallback
)
const eventData = { ...updatedDeal, customFields: recalculatedCustomFields } as unknown as Record<string, unknown>

// 4. Emit from the POST-recalc object. Reuse `eventData` for every event this path emits.
crmBus.emit("deal.updated", buildEventPayload(id, "updated", eventData, userId, changedFields.length > 0 ? changedFields : null))
```

And the wrapper each module defines once (D-05 / T-34-17):

```ts
async function recalcCustomFields(
  input: RecalculateFormulasInput,
  fallback: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const { customFields } = await recalculateFormulas(input)
    return customFields
  } catch (error) {
    console.error("[formula-recalc] deal recalculation failed:", error)
    return fallback
  }
}
```

Two notes for the replicating plans:

- **Do not add `.returning()` to a write that lacks one.** `updateDealStageMutation` and `reorderDealsMutation` have none, and every existing chain stub in the suite would break. They already build a post-write object for their payload (`{ ...deal, stageId, position }`); hoist it into a `rowAfterUpdate` const and pass that as `row`.
- **When a path emits two events, call the helper once** and reuse the single `eventData` in both, including inside the `DealStageChangedPayload` spread. The tests assert `toHaveBeenCalledTimes(1)` alongside both payload checks.

## Coverage

| Entry point | Recalc | changedFields passed to the recalc | Emits |
|---|---|---|---|
| `createDealMutation` | yes | `ENTITY_NATIVE_ATTRIBUTES.deal` columns + supplied custom-field keys | `deal.created` |
| `updateDealMutation` | yes, once | the mutation's own `changedFields` | `deal.updated` (+ `deal.stage_changed`) |
| `deleteDealMutation` | **no** | — | `deal.deleted` |
| `updateDealStageMutation` | yes, once | `["stageId"]` | `deal.updated` + `deal.stage_changed` |
| `reorderDealsMutation` | yes | `["position"]`, plus `"stageId"` when the stage moved | both, only when the stage moved |
| `createActivityMutation` | yes | `ENTITY_NATIVE_ATTRIBUTES.activity` columns + supplied keys | `activity.created` |
| `updateActivityMutation` | yes | the mutation's own `changedFields` | `activity.updated` |
| `deleteActivityMutation` | **no** | — | `activity.deleted` |
| `toggleActivityCompletionMutation` | yes | `["completed", "completedAt"]` | `activity.updated` (event `changedFields` still `["completed"]`) |
| `PUT /api/v1/activities/[id]` | yes | route `changedFields` + `Object.keys(custom_fields)` | `activity.updated` |

`stripFormulaKeys` is applied on all five paths that accept caller-supplied custom fields: both creates, both updates, and the v1 route merge.

## Why the Tests Assert on the Payload, Not the Row

RESEARCH Pitfall 3: `events/subscribers/webhook.ts:19` forwards `payload.data` verbatim, and `triggers/matcher.ts:88` builds `envelope.data = { ...payload.data, ... }`. Both are snapshots taken at emit time; neither re-reads. A test asserting only on the persisted blob passes under BOTH orderings — SC-1 would hold while SC-2 and SC-3 silently failed.

So the mocked helper resolves with `{ Margin: { formula: true, value: 1035, error: null } }`, which is deliberately unequal to every fixture's stored `{ Origem: ["Inbound"] }`. Each emit test asserts the payload's `customFields` **equals the recalc result and does not equal the stored blob**. On top of that, every non-delete entry point carries an explicit ordering assertion:

```ts
expect(vi.mocked(recalculateFormulas).mock.invocationCallOrder[0]).toBeLessThan(
  vi.mocked(crmBus.emit).mock.invocationCallOrder[0]
)
```

`invocationCallOrder` appears **10 times in `deals.test.ts` and 6 times in `activities.test.ts`** (requirement: 4+ each). The stage-change case compares against `invocationCallOrder[1]`, so the recalc is proven to precede the *second* emit too.

## D-18 Was Verified, Not Assumed

The plan flags D-18 as blocking: `evaluateFormula`'s resource bound is an opt-in 4th argument and is inert unless passed. This plan introduces **no new `evaluateFormula` call site** — it only calls `recalculateFormulas`. I read `formula-recalc.ts:679-685` to confirm the single engine call inside `recalculateOneEntity` passes `{ ...FORMULA_EVAL_OPTIONS }` (8 MiB / 500 ms) as the 4th argument, and that plan 34-03's suite pins it with a loop over every call's `mock.calls[i][3]`. `git diff --name-only -- src/lib/formula-engine.ts src/lib/formula-recalc.ts` is empty, so that guarantee is untouched.

Consequently no unbounded-formula test was written here and nothing in this plan could wedge a worker as plan 34-01 did. Every vitest invocation was still wrapped in `timeout`.

## SC-4 Holds by Construction on the Drag Paths

`ENTITY_NATIVE_ATTRIBUTES.deal` is `{ Value, Title, Notes, ExpectedCloseDate }` — it contains neither `stageId` nor `position`. So `updateDealStageMutation` (`["stageId"]`) and `reorderDealsMutation` (`["position"]`) hit `scopeFormulasToChangedFields`'s early return: zero row reads, zero evaluations, zero writes. The calls are retained deliberately so the paths stay correct if the native attribute map ever grows, and the reorder test asserts `changedFields` does **not** contain `"stageId"` on a same-stage move so the scope cannot silently widen.

## Task Commits

1. **Task 1 RED — recalc-before-emit tests** — `6b9ca61` (`test(34-06)`), verified failing: **26 failed / 28 passed** across the two files.
2. **Task 2 GREEN — recalc wired into all eight paths** — `291a81f` (`feat(34-06)`), 54/54 pass.

No REFACTOR commit: the GREEN implementation needed no cleanup pass.

### The RED gate failed for the right reasons

All 26 failures were missing-recalc failures, never mock wiring. Distinct messages:

| Count | Message | Cause |
|---|---|---|
| 8 | `expected "vi.fn()" to be called 1 times, but got 0 times` | `recalculateFormulas` never called |
| 5 | `actual value must be number or bigint, received "undefined"` | `invocationCallOrder[0]` undefined — no recalc invocation exists |
| 4 | `expected { Origem: ['Inbound'] } to deeply equal { Margin: ... }` | the emit carried the PRE-recalc blob |
| 3 | `Cannot read properties of undefined (reading '0')` | `mock.calls[0]` on an empty calls array |
| 4 | `expected "vi.fn()" to be called with arguments: ...` | `stripFormulaKeys` never called |
| 2 | `expected "error" to be called at least once` | no `console.error` on the D-05 path |

The two `deleteDeal`/`deleteActivity` "does NOT recalculate" guards passed in the RED state by design — they must hold in both states, and their positive counterparts failed.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run src/lib/mutations/deals.test.ts src/lib/mutations/activities.test.ts src/lib/formula-recalc.test.ts` | exit 0 — **123 passed** (28 + 26 + 69) |
| `npm test` | exit 0 — 44 files, **610 passed / 4 skipped** (baseline 582/4; +28 = exactly the new tests) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | exit 0 — **0 errors, 128 warnings** (identical to baseline) |
| `npx eslint` on the five touched files | 0 errors, 1 warning — the pre-existing unused `ctx` in the route's GET handler, untouched |
| recalc present in all three source files (comment lines stripped) | three `ok` lines |
| `git diff --name-only -- src/lib/formula-recalc.ts src/lib/formula-engine.ts` | **empty** — this plan consumes the helper, it does not change it |
| `git diff --name-only -- src/lib/mutations/people.ts src/lib/mutations/organizations.ts src/lib/custom-fields.ts src/lib/execution/condition-evaluator.ts` | **empty** — files owned by the concurrent plans 34-07, 34-08 and 34-12 |
| `git diff -U0` removed lines in the two test files at the RED commit | **0** — no existing test was weakened or deleted |
| `git diff --diff-filter=D --name-only 0682ca5 HEAD` | **empty** — no file deletions |
| `git status --porcelain -uall` | clean — no untracked files (the `node_modules` symlink is gitignored) |
| Files changed vs the base commit | exactly the five in the plan's `files_modified` |

## Deviations from Plan

**1. [Rule 1 - Bug] `reorderDealsMutation` updates ONE deal, not many**

- **Found during:** Task 1.
- **Issue:** The plan says "`reorderDealsMutation`, which processes multiple deals: assert `recalculateFormulas` is called once per affected deal". Reading `deals.ts:521-524`, the mutation issues a single `db.update` against `deals.id = dealId`; the other deals in the stage keep their positions (this is a fractional-position reorder, not a renumbering pass). "Once per affected deal" is therefore "once".
- **Resolution:** one recalc call, asserted with `toHaveBeenCalledTimes(1)`. The shared `definitionsCache` is still created before the call and the test still asserts every call receives the same instance (`new Set(caches).size === 1`), so the shape is already correct if the path ever grows a loop.
- **Files modified:** `src/lib/mutations/deals.ts`, `src/lib/mutations/deals.test.ts`.
- **Commits:** `6b9ca61`, `291a81f`.

**2. [Rule 3 - Blocking] `updateDealStageMutation` and `reorderDealsMutation` have no `.returning()`**

- **Found during:** Task 2.
- **Issue:** The plan's pattern reads `row: <the .returning() row>`, but these two mutations call `db.update(...).set(...).where(...)` with no `.returning()`. Adding one would break every existing chain stub in the suite (`whereFn` resolves `undefined`, so `.returning()` would throw), which the brief forbids.
- **Fix:** each already constructs its post-write payload object inline, twice. Hoisted into a single `rowAfterUpdate` const and passed as `row`. This removes a duplicated literal, keeps the DB round-trips unchanged, and the test asserts `args.row` matches `{ id, stageId }` post-write rather than the stale pre-write row.
- **Files modified:** `src/lib/mutations/deals.ts`.
- **Commit:** `291a81f`.

**3. [Rule 2 - Missing critical functionality] `PUT /api/v1/activities/[id]` now returns the post-recalc blob**

- **Found during:** Task 2.
- **Issue:** The plan specifies the emit only. Left alone, the route would emit the recomputed `customFields` while returning the pre-recalc value in its own HTTP response — so a caller doing `PUT` then `GET` would see two different values for the same field, one of them the value this phase exists to eliminate.
- **Fix:** `serializeActivity(recalculatedActivity)` instead of `serializeActivity(updatedActivity)`, reusing the object already built for the emit. No auth check added or removed; no field the caller controls added.
- **Files modified:** `src/app/api/v1/activities/[id]/route.ts`.
- **Commit:** `291a81f`.

**4. [Decision] `toggleActivityCompletionMutation` passes `["completed", "completedAt"]` to the recalc**

- **Found during:** Task 2.
- **Issue:** The mutation pushes the literal `"completed"` into its event's `changedFields`, but `"completed"` is not a column — `ENTITY_NATIVE_ATTRIBUTES.activity.CompletedAt` maps to `completedAt`. Passing only `"completed"` would scope every `{{CompletedAt}}` formula out, so completing an activity would never refresh a formula over its completion date — a silent SC-4 false negative in the opposite direction.
- **Resolution:** the recalc receives both spellings; the event's own `changedFields` is unchanged at `["completed"]`, and a test pins that it stayed that way.
- **Files modified:** `src/lib/mutations/activities.ts`, `src/lib/mutations/activities.test.ts`.
- **Commit:** `291a81f`.

**5. [Decision] A definitions-load failure fails the write closed**

- **Found during:** Task 2.
- **Issue:** `stripFormulaKeys` needs `getActiveFieldDefinitions`. If that query throws, the choice is to (a) fall through to the mutation's existing catch and return `{ success: false }`, or (b) persist the caller's values unstripped.
- **Resolution:** (a). The definitions query and the entity write hit the same connection, so a failure there almost certainly fails the write anyway; and (b) would turn a transient DB error into a T-34-04 bypass. Not wrapped in its own try/catch, so the existing per-mutation catch handles it.

No Rule 4 (architectural) deviations. No packages installed (`git diff -- package.json package-lock.json` empty, T-34-SC). No database row was read or written — both suites are DB-free via `vi.mock("@/db")`, and `@/lib/custom-fields` and `@/lib/formula-recalc` are mocked in the mutation tests.

## Threat Model Coverage

| Threat | Disposition | Status |
|---|---|---|
| **T-34-04** Tampering — client-set formula keys | mitigate | **Now live for the first time.** `stripFormulaKeys` applied on both creates, both updates and the v1 route merge, before the value reaches the JSONB blob. Pinned by four tests asserting both the call argument and that the stripped object is what reaches `values(...)`/`set(...)` |
| **T-34-03** DoS — reorder fan-out | mitigate | `["position"]` is absent from `ENTITY_NATIVE_ATTRIBUTES.deal`, so the helper early-returns with zero evaluations; one shared `definitionsCache` per reorder; plan 34-04's 500-evaluation budget still applies per call |
| **T-34-17** Repudiation — recalc failure visibility | mitigate | Every rejection is logged with a `[formula-recalc]` prefix, never swallowed. Asserted by two D-05 tests that spy on `console.error` |
| **T-34-18** EoP — missing ownership check on `PUT /api/v1/activities/[id]` | accept | Untouched. No auth check added or removed, no new caller-controlled field beyond what plan 34-02 already enabled, and formula keys are now stripped on that path. Still needs recording as a backlog item in plan 34-11 |
| **T-34-05** Tampering — cascade from a deal save | accept | Per D-09. The cascade is on by default, so a deal save can now refresh activity rows the actor does not own. Bounded at depth 1 and by the shared budget |
| **T-34-02** DoS — unbounded evaluation | mitigate | No new `evaluateFormula` call site; the bounds live in `recalculateFormulas` and were re-read to confirm, not assumed (see the D-18 section) |
| **T-34-SC** Tampering — npm installs | accept | Zero new packages |

**Threat surface scan:** no new endpoint, auth path, file access, or schema change. The v1 route's request and response shapes are unchanged apart from `custom_fields` now reflecting server-computed values. Nothing to flag.

## Known Stubs

None. No placeholder values, hardcoded empties feeding UI, or TODO/FIXME markers were introduced.

## Known Limitations (deliberate, not defects)

- **`createDealMutation`/`createActivityMutation` still return the PRE-recalc row** in their `{ success: true, deal }` / `{ success: true, activity }` result. The database row and the emitted payload are both correct; only the in-process return value lags. Changing it would alter the mutation's observable return, which the plan forbids, and would break the existing `toEqual({ success: true, id, deal })` assertions. Server actions re-read on the next render, so no user-visible staleness follows.
- **The definitions query runs on the create/update paths only when the caller supplies `customFields`.** An update that touches only native columns therefore does not pay for it up front — but `recalculateFormulas` will still load definitions itself through the (empty) cache when it needs them.
- **The recalc write remains a second `UPDATE` outside any transaction** (T-34-11, accepted in plan 34-03). Unchanged here.
- **The remaining write paths are still unwired** — `people`/`organizations` mutations (34-07), `saveFieldValues` (34-08), the other v1 routes (34-09) and the importers (34-10).

## Next Plan Readiness

- **Plan 34-07 (people/organizations)** — copy the call-site shape above verbatim. Both modules already compute `changedFields` and both updates use `.returning()`, so the pattern applies without the `rowAfterUpdate` workaround. Note `organizations` is a cascade PARENT, so its saves will fan out to deals and people; the budget is shared and automatic.
- **Plans 34-09 / 34-10** — the same shape; importers should additionally pass `cascade: false` per plan 34-04.
- **Plan 34-11** — two items to record: the pre-existing IDOR on `PUT /api/v1/activities/[id]` (T-34-18), and that soft deletes leave children holding stale derived values (a comment in both delete mutations points at 34-11).
- `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally not modified — the orchestrator owns Phase 34's wave bookkeeping, as in plans 34-01 through 34-04.

## Self-Check: PASSED

Files verified present on disk and modified:
- `src/lib/mutations/deals.ts` — FOUND
- `src/lib/mutations/activities.ts` — FOUND
- `src/lib/mutations/deals.test.ts` — FOUND (28 tests)
- `src/lib/mutations/activities.test.ts` — FOUND (26 tests)
- `src/app/api/v1/activities/[id]/route.ts` — FOUND

Commits verified in `git log`:
- `6b9ca61` — FOUND (`test(34-06)`)
- `291a81f` — FOUND (`feat(34-06)`)

RED-before-GREEN ordering verified: `6b9ca61` is the parent of `291a81f`.
No file deletions in either commit. No untracked files left behind.
`git diff --name-only 0682ca5 HEAD` lists exactly the five files in `files_modified` and nothing else.

## TDD Gate Compliance

Gate sequence satisfied. RED: `test(34-06)` `6b9ca61`, verified failing with 26 failures, every one a missing-recalc, missing-strip or missing-log failure rather than mock wiring. GREEN: `feat(34-06)` `291a81f`, 54/54 pass in the two files and 610 across the suite. No REFACTOR gate needed.

---
*Phase: 34-formula-reactivity*
*Completed: 2026-08-14*
</content>
</invoke>
