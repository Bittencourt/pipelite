---
phase: 34-formula-reactivity
plan: 09
subsystem: api-v1
tags: [tdd, formula, recalc-before-emit, rest-api, batch-budget, d-02, d-05, d-13, d-17, t-34-03, t-34-04]

# Dependency graph
requires:
  - plan: 34-03
    provides: recalculateFormulas, stripFormulaKeys, ENTITY_NATIVE_ATTRIBUTES, definitionsCache
  - plan: 34-04
    provides: FORMULA_EVALUATION_BUDGET, the `budget` and `cascade` inputs, and `evaluations` in the result
  - plan: 34-06
    provides: the canonical recalc-before-emit call-site shape and the recalcCustomFields wrapper
  - plan: 34-07
    provides: the v1 route-test idiom and the fail-open stripCallerFormulaKeys decision
provides:
  - "All six v1 deal/people write routes recalculate before crmBus.emit (D-02, inventory rows #5, #6, #7, #8, #13a, #13b)"
  - "The first test files for the v1 deals and people CRM routes — 39 tests"
  - "The batch-budget threading pattern: ONE FORMULA_EVALUATION_BUDGET decremented per row across a 100-row request (T-34-03)"
  - "stripFormulaKeys applied on four more caller-facing write paths (T-34-04)"
affects: [34-10, 34-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Batch budget threading: one `remainingBudget` initialised to FORMULA_EVALUATION_BUDGET before the loop, passed as `budget` per row and decremented by the row's returned `evaluations`"
    - "Two-array discipline on PUT: the EVENT keeps its coarse `customFields` sentinel while the RECALC receives sentinel + precise persisted key names"
    - "Batch rows pass `cascade: false` — a row inserted by this request has no children yet"

key-files:
  created:
    - src/app/api/v1/deals/__tests__/formula-recalc.test.ts
    - src/app/api/v1/people/__tests__/formula-recalc.test.ts
  modified:
    - src/app/api/v1/deals/route.ts
    - src/app/api/v1/deals/[id]/route.ts
    - src/app/api/v1/deals/batch/route.ts
    - src/app/api/v1/people/route.ts
    - src/app/api/v1/people/[id]/route.ts
    - src/app/api/v1/people/batch/route.ts

key-decisions:
  - "All six routes needed DIRECT wiring: every one performs its own db.insert/db.update and emits on crmBus itself, so none was covered transitively by plans 34-06/34-07. Verified by reading each file, not assumed"
  - "PUT responses now carry the post-recalc value (matching PUT /api/v1/activities/[id] and PUT /api/v1/organizations/[id]); POST 201 bodies deliberately stay pre-recalc, because that is backlog 999.23 and it is being decided once for all four entities"
  - "The recalc scope uses the POST-STRIP persisted key names, not the caller's raw keys — a key the server just stripped was never written, so listing it as changed would be a lie the scoping would act on (plan 34-07's decision 3)"
  - "stripCallerFormulaKeys fails OPEN on a definitions-read failure, unlike the mutation layer's fail-closed: these routes have no try/catch that would turn a throw into anything but a new 500, and the plan forbids changing status codes"
  - "The batch item schemas accept no custom_fields at all, so no strip is needed there; the batch recalc scope is exactly the entity's native columns"

patterns-established:
  - "Pattern: `recalcBatchRow(input, fallback)` returns the full RecalculateFormulasResult (not just the blob) so the caller can spend `evaluations` against a request-wide budget; a failed row reports 0 evaluations and cannot corrupt the arithmetic"

requirements-completed: [FORMULA-01, FORMULA-02]

# Metrics
duration: 34min
tasks_completed: 2
files_changed: 8
tests_added: 39
completed: 2026-08-14
---

# Phase 34 Plan 09: Recalc-Before-Emit in the Six v1 Deal and People Routes Summary

**The entire REST write surface for deals and people now recomputes formula values before the event leaves the process — and a 100-row batch spends one 500-evaluation budget instead of a hundred of them.**

## Route Dispositions — All Six Needed Direct Wiring

The brief required determining per route whether it was mutation-routed (covered transitively by plans 34-06/34-07) or writes and emits directly. **Every one of the six writes directly.** Not one delegates to the mutation layer, so none was already covered and none double-recalculates.

| Route | Disposition | Own write | Recalc call | Strip call | First emit |
|---|---|---|---|---|---|
| `POST /api/v1/deals` | **directly wired** | `db.insert(deals)` | `route.ts:317` | `:296` | `:335` |
| `PUT /api/v1/deals/[id]` | **directly wired** | `db.update(deals)` | `[id]/route.ts:314` | `:295` | `:352` (`stage_changed`), `:356` (`updated`) |
| `POST /api/v1/deals/batch` | **directly wired** | `db.insert(deals)` | `batch/route.ts:215` | n/a — schema has no `custom_fields` | `:231` |
| `POST /api/v1/people` | **directly wired** | `db.insert(people)` | `route.ts:225` | `:206` | `:243` |
| `PUT /api/v1/people/[id]` | **directly wired** | `db.update(people)` | `[id]/route.ts:239` | `:221` | `:257` |
| `POST /api/v1/people/batch` | **directly wired** | `db.insert(people)` | `batch/route.ts:154` | n/a — schema has no `custom_fields` | `:171` |

For plan 34-11's coverage audit: in every row the recalc line number is strictly less than the emit line number, and that ordering is additionally proven at runtime by `invocationCallOrder` rather than by source position.

**Exactly zero double-recalculation.** No route calls a mutation, so no path can reach `recalculateFormulas` twice. Contrast `POST /api/v1/organizations`, `POST /api/v1/organizations/batch` and `POST /api/v1/activities`, which plan 34-07 recorded as mutation-routed and therefore deliberately left alone — the six here are the complement of that set.

## The Batch Budget (D-13 / T-34-03)

Both batch routes create ONE `definitionsCache` and ONE `remainingBudget` before the loop:

```ts
const definitionsCache = new Map<EntityType, CustomFieldDefinition[]>()
let remainingBudget = FORMULA_EVALUATION_BUDGET

for (const deal of inserted) {
  const { customFields, evaluations } = await recalcBatchRow({
    /* ... */ definitionsCache, cascade: false, budget: remainingBudget,
  }, fallback)
  remainingBudget = Math.max(0, remainingBudget - evaluations)
  crmBus.emit("deal.created", { /* ... */ data: serializeDeal({ ...deal, customFields }) })
}
```

Without this, 100 rows x a fresh 500-evaluation allowance = **50,000 evaluations** in one request (~44 s at the measured 0.876 ms). Three assertions pin it per entity:

- the first row's `budget` equals the real `FORMULA_EVALUATION_BUDGET` (imported through `importOriginal`, not a fixture constant);
- the second row's `budget` is **strictly less** than the first's, and equals `500 - evaluations`;
- `new Set(caches).size === 1`, so the definitions memo is one instance, not one per row.

`cascade: false` is asserted on every call, guarded by a `toHaveBeenCalledTimes(2)` immediately above the loop so it cannot pass vacuously against zero calls (that vacuous pass was caught in the RED run and fixed before the RED commit).

The two `cascade: false` comments differ deliberately, as the plan required. A deal has no activities yet. A person **is** a genuine cascade parent — deals reference people via `deals_person_id_idx` — but a person created by this same request has no deals yet, so the hop would be pure cost.

## D-17 Was Mutation-Checked, Not Trusted

Following plan 34-07's precedent, the ordering guard was verified by introducing the exact defect: in `POST /api/v1/deals` the recalc block was moved to **after** `crmBus.emit` and the emit switched to the pre-recalc row. The suite went to **2 failed / 18 passed**, failing precisely:

- `recalculates exactly once, for the inserted deal, BEFORE crmBus.emit` (the `invocationCallOrder` comparison), and
- `emits the post-recalc blob under the snake_case custom_fields key` (the payload comparison).

The file was restored with `git checkout -- <that one file>` and the two suites returned to 39/39. This proves the guards are load-bearing rather than incidentally satisfied.

The mocked helper resolves with a blob deliberately unequal to every fixture's stored `{ Origem: ["Inbound"] }`, so every payload assertion checks both `toEqual(RECALC_RESULT)` and `not.toEqual(STORED_CUSTOM_FIELDS)` — an implementation emitting the pre-recalc blob cannot pass by accident.

## Key-Casing Divergence Preserved (T-34-23)

Three different emit shapes exist across these six routes and all three were left exactly as found:

| Route | Emitted shape | Asserted key |
|---|---|---|
| `POST /api/v1/deals`, both batches, `POST`/`PUT /api/v1/people` | `serialize*(...)` | snake_case `custom_fields` |
| `PUT /api/v1/deals/[id]` | raw camelCase row | `customFields` |

The deal PUT is the odd one out because its existing in-file comment explains that workflow templates like `{{trigger.data.stageId}}` must behave identically via UI and REST. The deals test asserts `data.customFields` there and `data.custom_fields` (plus `data.customFields` being `undefined`) on POST, so a future "harmonisation" of either would fail loudly.

## D-18 Compliance — Verified by Reading, Not Assumed

This plan introduces **zero** new `evaluateFormula` call sites (source scan across all six routes: 0 occurrences). Every evaluation still runs through the single bounded call inside `recalculateOneEntity`, which I re-read at `formula-recalc.ts:679-685` to confirm it passes `{ ...FORMULA_EVAL_OPTIONS }` (8 MiB / 500 ms) as the 4th argument, exactly as plan 34-06 did. `git diff --name-only -- src/lib/formula-recalc.ts src/lib/formula-engine.ts` is empty, so that guarantee is untouched by this plan.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run` both new files | exit 0 — **39 passed** (20 deals + 19 people) |
| `npm test` | exit 0 — **48 files, 742 passed / 4 skipped** (baseline 46 files, 703/4; +2 files, +39 = exactly the new tests) |
| `npx tsc --noEmit` | exit 0, zero output |
| `npx eslint .` | exit 0 — **0 errors, 128 warnings** (byte-identical to the baseline count) |
| `npx eslint src/app/api/v1/deals` | 0 errors, 8 warnings — all pre-existing unused imports (`NextResponse`, `pipelines`, `sql`, `CrmEventPayload`, `stages`), none introduced here |
| `recalculateFormulas` in non-comment source of all six routes | six `ok` lines |
| Both batch routes: `cascade: false` + `budget` present | `batch guards OK` x2 |
| D-17 mutation check on `POST /api/v1/deals` | 2 failures, exactly the ordering + payload assertions |
| `evaluateFormula` occurrences across the six routes | **0** |
| `git diff --name-only -- src/lib src/app/import src/app/api/v1/organizations src/app/api/v1/activities` | **empty** — nothing owned by plans 34-06/34-07/34-10 touched |
| `git diff -U0` removed lines in test files | **0** — both files are new; no existing test weakened or deleted |
| `git diff --diff-filter=D --name-only f361ce8 HEAD` | **empty** — no file deletions |
| `git diff -- package.json package-lock.json` | **empty** — zero new dependencies (T-34-SC) |
| `git status --porcelain -uall` | clean — the `node_modules` symlink is gitignored |
| Files changed vs base | exactly the eight in `files_modified` |

### The RED gates failed for the right reasons

**Deals — 19 failed / 1 passed.** **People — 18 failed / 1 passed.** Every failure is a missing-recalc, missing-strip or missing-log consequence; not one is mock wiring:

| Deals | People | Message | Cause |
|---|---|---|---|
| 4 | 3 | `expected "vi.fn()" to be called 1 times, but got 0 times` | `recalculateFormulas` never called |
| 1 | 2 | `expected "vi.fn()" to be called 2 times, but got 0 times` | the batch loop never recalculated |
| 4 | 4 | `expected { Origem: [...] } to deeply equal { Origem: [...], …(1) }` | the emit carried the PRE-recalc blob |
| 4 | 4 | `Cannot read properties of undefined (reading '0')` | `mock.calls[0]` on an empty calls array |
| 2 | 2 | `expected "vi.fn()" to be called with arguments` | `stripFormulaKeys` never called |
| 2 | 2 | `expected "error" to be called at least once` | no `console.error` on the D-05 path |
| 1 | 1 | `expected undefined to be defined` | no shared `definitionsCache` existed |

The single pass in each file is the same test — the 999.23 documented behaviour that the 201 body stays pre-recalc, which must hold in **both** states by design, while its positive counterparts (the emitted payload) failed.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Both PUT routes now RESPOND with the post-recalc value**

- **Found during:** Task 1.
- **Issue:** The plan specifies the emit only. Left alone, each PUT would emit the recomputed `customFields` while returning the pre-recalc blob in its own HTTP response — so a caller doing `PUT` then `GET` would see two different values for the same field, one of them the exact value this phase exists to eliminate.
- **Fix:** a single `recalculatedDeal` / `recalculatedPerson` object feeds both the emit and the `serialize*` response. This is the same call the plan already mandates, reused; no extra query, no extra evaluation. It matches what plan 34-06 did for `PUT /api/v1/activities/[id]` (its deviation 3) and what `PUT /api/v1/organizations/[id]` does via its re-fetch, so all four entities' PUTs now agree.
- **Deliberately NOT extended to POST:** backlog 999.23 (captured at the base commit `f361ce8`) says the create-response staleness is to be decided **once for all four entities**. Unilaterally fixing it on two of the four would deepen the inconsistency it records. Both test files pin the current 201 behaviour with an explicit comment so a future 999.23 fix is a visible, deliberate change rather than a silent one.
- **Files modified:** `src/app/api/v1/deals/[id]/route.ts`, `src/app/api/v1/people/[id]/route.ts`.
- **Commits:** `c9ae78e`, `bd79e58`.

**2. [Decision] `stripCallerFormulaKeys` fails OPEN on these routes, unlike the mutation layer**

- **Found during:** Task 1.
- **Issue:** plan 34-06 chose fail-closed for the mutation layer (a definitions-read failure propagates into the mutation's existing catch and returns `{ success: false }`); plan 34-07 chose fail-open. The two precedents conflict.
- **Resolution:** fail-open here, with a `[formula-recalc]` log. `POST /api/v1/deals` and both `POST` batch handlers have **no try/catch at all**, so a throw would surface as a brand-new 500 on a route that has no such failure mode today — and the plan explicitly forbids changing HTTP status codes. Plan 34-07's rationale also applies: the recalculation that immediately follows overwrites every in-scope formula key regardless, so the exposure window is narrow.

**3. [Decision] The recalc scope uses post-strip persisted keys, not the caller's raw keys**

- **Found during:** Task 1.
- **Rationale:** the plan's action text says `...Object.keys(custom_fields ?? {})`. After the T-34-04 strip, a formula key the caller sent was **not** written, so reporting it as changed would feed the scoping a field that did not change. `Object.keys(customFieldsToPersist)` is strictly more precise and still satisfies the plan's assertion that the precise names reach the recalc. Both test files assert the stripped key is absent (`not.toContain("Margin")` / `not.toContain("Seniority")`).

**4. [Deviation] Test counts are 20 and 19, against the plan's "at least 12" each**

- The extra cases are the D-05 failure-isolation paths, the batch `definitionsCache` identity check, the 999.23 documentation test, and the people-specific `organizationId` scoping case.

No Rule 1 (bug) and no Rule 4 (architectural) deviations. No packages installed. No database row was read or written — both suites are DB-free via `vi.mock("@/db")`, and `@/lib/formula-recalc`, `@/lib/custom-fields`, `@/lib/events` and `@/lib/api/auth` are all mocked. No Docker container was started.

## Threat Model Coverage

| Threat | Disposition | Status |
|---|---|---|
| **T-34-04** Tampering — client-set formula keys on the REST surface | mitigate | **Now live on all four caller-facing routes** (both POSTs, both PUTs). Four tests assert both the `stripFormulaKeys` argument and that the stripped object is what reaches `values(...)`/`set(...)`. The two batch routes accept no `custom_fields` in their Zod schemas at all, so there is nothing to strip |
| **T-34-03** DoS — batch amplification | mitigate | One `FORMULA_EVALUATION_BUDGET` per request, decremented by each row's actual `evaluations`, plus `cascade: false`. Six assertions across the two files. A failed row reports 0 evaluations so it cannot corrupt the arithmetic |
| **T-34-22** DoS — batch size | accept | `MAX_BATCH_SIZE = 100` unchanged in both Zod schemas; the shared evaluation budget bounds formula cost independently of row count |
| **T-34-15** Tampering — branching on an attacker-chosen value | mitigate | Follows from T-34-04: formula keys are stripped from input and written only by the server, so an API caller cannot post a value that steers a workflow condition on a formula field |
| **T-34-17** Repudiation — recalc failure visibility | mitigate | Every rejection logs with the `[formula-recalc]` prefix and the route returns its normal status (D-05). Six tests assert status, emit and the log prefix together |
| **T-34-23** Info disclosure — emitted key casing | accept | Preserved exactly: five routes emit snake_case via `serialize*`, `PUT /api/v1/deals/[id]` emits the raw camelCase row. Both spellings are normalised by plan 34-05's trigger envelope. Tests assert the specific spelling per route so a "harmonisation" fails loudly |
| **T-34-02** DoS — unbounded evaluation | mitigate | Zero new `evaluateFormula` call sites; the D-18 bounds were re-read at `formula-recalc.ts:679-685`, not assumed |
| **T-34-05** Tampering — cascade writes to another owner's rows | accept | Per D-09. The non-batch routes leave `cascade` at its default `true`; the batch routes disable it. No ownership predicate added or removed anywhere |
| **T-34-SC** Tampering — npm installs | accept | Zero new packages |

**Threat surface scan:** no new endpoint, auth path, file access or schema change. All six routes keep their `withApiAuth` wrapper, Zod schema, owner-scoped filters, status codes and response *shapes* byte-for-byte; only the *values* of `custom_fields` on the two PUT responses changed, and only from stale to correct. Nothing to flag.

## Known Stubs

None. No placeholder values, hardcoded empties feeding UI, or TODO/FIXME markers were introduced.

## Known Limitations (deliberate, not defects)

- **The four POST routes still echo pre-recalc values in their 201/200 bodies.** Backlog 999.23; pinned by a test in each file so the eventual fix is deliberate. The stored row, the emitted event and any subsequent GET are all correct, so SC-1 holds.
- **Six near-identical helper copies now exist** (`stripCallerFormulaKeys` / `recalcCustomFields` / `recalcBatchRow`), on top of the four plans 34-06 and 34-07 added. Extracting them into a shared `src/app/api/v1/_lib/` module was out of this plan's `files_modified` and would have collided with the concurrently-running plan 34-10. This is the strongest candidate for a phase-34 cleanup and is worth recording in plan 34-11.
- **The batch routes' `custom_fields` gap is unchanged.** Neither `dealItemSchema` nor `personItemSchema` accepts `custom_fields`, so a batch-created row starts with an empty blob and its formulas compute over native attributes only. Widening the schema is a feature change, not this plan's scope.
- **The recalc write remains a second `UPDATE` outside any transaction** (T-34-11, accepted in plan 34-03). Unchanged here.
- **Pre-existing lint warnings in these files were left alone** (unused `NextResponse`, `pipelines`, `sql`, `CrmEventPayload`, `stages` imports). Out of scope per the executor's scope boundary; removing them would touch lines this plan has no business changing.

## Next Plan Readiness

- **Plan 34-10 (importers)** — the batch-budget threading pattern above is directly reusable for a CSV/Pipedrive import loop, which has exactly the same amplification shape but with far more rows. Note `recalcBatchRow` returns the full result (not just the blob) precisely so `evaluations` can be spent.
- **Plan 34-11** should record three items: (a) the six duplicated route helpers awaiting extraction, (b) backlog 999.23 now has two more affected routes but the same single decision, and (c) `POST /api/v1/{deals,people}/batch` cannot carry custom fields at all.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally **not** modified — the orchestrator owns Phase 34's wave bookkeeping, as in plans 34-01 through 34-07.
- **Merge note:** this branch touches only `src/app/api/v1/{deals,people}/**`. Disjoint from plan 34-10 (`src/lib/import/*`, `src/app/import/actions.ts`) and from everything plans 34-06/34-07 own.

## Self-Check: PASSED

Files verified present on disk:
- `src/app/api/v1/deals/route.ts` — FOUND
- `src/app/api/v1/deals/[id]/route.ts` — FOUND
- `src/app/api/v1/deals/batch/route.ts` — FOUND
- `src/app/api/v1/people/route.ts` — FOUND
- `src/app/api/v1/people/[id]/route.ts` — FOUND
- `src/app/api/v1/people/batch/route.ts` — FOUND
- `src/app/api/v1/deals/__tests__/formula-recalc.test.ts` — FOUND (20 tests)
- `src/app/api/v1/people/__tests__/formula-recalc.test.ts` — FOUND (19 tests)

Commits verified in `git log`:
- `4629ffd` — FOUND (`test(34-09)`, deals RED)
- `c9ae78e` — FOUND (`feat(34-09)`, deals GREEN)
- `b466b44` — FOUND (`test(34-09)`, people RED)
- `bd79e58` — FOUND (`feat(34-09)`, people GREEN)

RED-before-GREEN ordering verified for both tasks: `4629ffd` is the parent of `c9ae78e`, and `b466b44` is the parent of `bd79e58`.
No file deletions in any commit. No untracked files left behind. Only the eight files in `files_modified` were changed.

## TDD Gate Compliance

Gate sequence satisfied twice. **Task 1** — RED: `test(34-09)` `4629ffd`, verified failing 19/20, every failure a missing-recalc/strip/log consequence; GREEN: `feat(34-09)` `c9ae78e`, 20/20. **Task 2** — RED: `test(34-09)` `b466b44`, verified failing 18/19 on the same failure taxonomy; GREEN: `feat(34-09)` `bd79e58`, 39/39 across both files. No REFACTOR gate was needed in either task.

---
*Phase: 34-formula-reactivity*
*Completed: 2026-08-14*
