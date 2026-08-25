---
phase: 34-formula-reactivity
plan: 10
subsystem: import
tags: [tdd, formula, import, budget, cascade-off, d-02, d-03, d-04, d-13, t-34-03, t-34-04, t-34-24, t-34-25, t-34-26]

# Dependency graph
requires:
  - plan: 34-03
    provides: recalculateFormulas, stripFormulaKeys, ENTITY_NATIVE_ATTRIBUTES, and the D-18 bounds passed internally at the engine's single call site
  - plan: 34-04
    provides: the `cascade` and `budget` options on RecalculateFormulasInput, and FORMULA_EVALUATION_BUDGET = 500
  - plan: 34-06
    provides: the canonical recalc call-site shape (definitionsCache donated by the strip's definition read)
provides:
  - "recalculateImportedRows — one shared, decrementing evaluation budget across a whole import, cascade off, failure-isolated per row"
  - "The CSV importer's batchInsert now .returning()s inserted rows"
  - "All four CSV entity flows and all four Pipedrive entity blocks (plus the auto-created stubs) recalculate what they wrote"
  - "First application of stripFormulaKeys to file-uploaded and third-party-API-sourced values (T-34-04)"
affects: [34-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Budget threading, not budget re-issuing: `remaining` is carried forward across rows and, in the Pipedrive importer, across entity blocks — recalculateFormulas builds a fresh internal allowance per call, so anything that does not thread multiplies the bound"
    - "The importers own no formula logic: one helper call per entity flow, so neither 550-line server-action file grows a second copy of the bound"
    - "Source-scan guard asserting the helper adds no evaluateFormula call site, keeping D-18's bounds unbypassable"

key-files:
  created:
    - src/lib/import/formula-recalc-batch.ts
    - src/lib/import/formula-recalc-batch.test.ts
  modified:
    - src/app/import/actions.ts
    - src/lib/import/pipedrive-api-import-actions.ts

key-decisions:
  - "The Pipedrive importer gets a RUN-level budget closure rather than a per-entity-block one: a run writes four entity types in sequence, so a per-block allowance would silently multiply the D-13 bound by four. The CSV importer needs no equivalent because each of its four flows is a separate server action, so per-flow already means per-run"
  - "The counts in the returned summary reconcile — `recalculated + skipped === rows.length` — with budget-exhausted and failed rows both counted as skipped, while the exhaustion warning fires only on the budget branch so a single broken formula cannot masquerade as a budget problem"
  - "Pipedrive's auto-created org/person stubs are recalculated too (beyond the plan's four blocks): they carry real native attributes a formula may read, and their rows were already in hand from an existing `.returning()`"
  - "The dead `batchInsert` in pipedrive-api-import-actions.ts was left untouched — it is referenced by nothing (pre-existing lint warning), so the plan's `.returning()` instruction for it would have edited unreachable code"

patterns-established:
  - "Pattern: keep a naive acceptance grep honest by naming the wrapper after what it wraps (`recalculateImportedRowsAndWarn`) instead of inlining the call four times"

requirements-completed: [FORMULA-01, FORMULA-02]

# Metrics
duration: 21min
tasks_completed: 2
files_changed: 4
tests_added: 16
completed: 2026-08-14
---

# Phase 34 Plan 10: Bounded Import Batch Recalculation Summary

**The two highest-volume write paths in the system now recalculate the rows they write, under ONE evaluation allowance for the entire import run rather than one per row — and a `custom_Margin` column in an uploaded file can no longer seed a server-derived value.**

## The Exported Surface

```ts
// src/lib/import/formula-recalc-batch.ts
export interface ImportedRow extends Record<string, unknown> {
  id: string
  customFields?: Record<string, unknown> | null
}

export async function recalculateImportedRows(input: {
  entityType: EntityType
  rows: ImportedRow[]
  budget?: number                                        // default FORMULA_EVALUATION_BUDGET
  definitionsCache?: Map<EntityType, CustomFieldDefinition[]>
}): Promise<{ recalculated: number; skipped: number; evaluations: number }>
```

## Task Commits

1. **Task 1 RED — 16 helper tests** — `6b48168` (test), verified failing: module unresolved, 0 tests collected.
2. **Task 1 GREEN — the bounded batch helper** — `e6eedf1` (feat), 16/16 pass.
3. **Task 2 — both importers wired** — `5e4a4de` (feat).

No REFACTOR commit: the GREEN implementation needed no cleanup pass.

## The Budget Is One Counter, and the Arithmetic Is Why

`recalculateFormulas` constructs a **fresh** `EvaluationBudget` on every invocation (plan 34-04,
`formula-recalc.ts:934`). So the naive wiring — call it per imported row and let it default —
gives every row its own 500. For the CSV importer's stated worst case that is not a rounding
error:

```
5,000-row import x 500 evaluations per row  = 2,500,000 evaluations
2,500,000 x 0.876 ms (measured in-container) = ~36 minutes of pure sandbox time
```

...while every individual call still looks "bounded". The helper therefore threads `remaining`:

```
row 1: budget: 500  -> spends 200 -> remaining 300
row 2: budget: 300  -> spends 200 -> remaining 100
row 3: budget: 100  -> spends 200 -> remaining -100
rows 4, 5: never handed to the engine; counted as skipped; ONE warning
```

That exact ladder is asserted by a multi-row fixture (`toEqual([500, 300, 100])`), and the
5-row exhaustion case asserts `recalculateFormulas` was called exactly three times with
`{ recalculated: 3, skipped: 2, evaluations: 600 }` and exactly one `console.warn`.

**The Pipedrive importer needed the same reasoning one level up.** A run writes organizations,
people, deals and activities in sequence, so a per-block allowance would have multiplied the
D-13 bound by the number of entity types the run happened to cover. `createImportFormulaBudget()`
holds `remaining` for the whole run and every block spends from it. The CSV importer needs no
equivalent: its four flows are four separate server actions, so one flow already *is* one import
run.

## How Each Locked Decision Landed

| Decision | Implementation | Pinned by |
|---|---|---|
| **D-02** (importers are uncovered) | Four CSV flows + four Pipedrive blocks + the two stub creations all call the helper | Two source scans in the plan's acceptance criteria; `recalculateImportedRows` appears 7x in `actions.ts` |
| **D-03** (cascade off for imports) | `cascade: false` on every row, with the O(n) -> O(n x children) amplification argument in a code comment telling the next reader not to "fix" it | Test 3 loops every call and asserts `cascade === false`; plan 34-04's own suite proves `cascade: false` issues zero child queries |
| **D-04 / D-13** (bounded, warns loudly) | One decrementing counter per import; `Math.max(0, ...)` so `budget: 0` means zero, not unlimited | The 500/300/100 ladder, the 5-row exhaustion case, and a `budget: 0` case asserting zero calls and one warning |
| **D-05 / T-34-24** (one bad row must not abort) | Per-row try/catch, `console.error`, loop continues | A rejecting middle row still leaves 3 calls made, `{ recalculated: 2, skipped: 1 }`, one `console.error`, and **no** budget warning |
| **D-14** (seed nulls) | Delegated — the full inserted row is passed as `row`, so `buildFormulaFieldValues` does its native-attribute + null-seeding + unwrap pass exactly as for an interactive save. Verified by reading `formula-recalc.ts:412-433`, not assumed | Plan 34-03's seeding tests; this plan adds no second path into the engine |
| **D-18** (bounds are inert unless passed) | The helper adds **no** `evaluateFormula` call site — every evaluation still goes through `recalculateFormulas`, the single place that passes `FORMULA_EVAL_OPTIONS` (`formula-recalc.ts:679-685`, verified by reading) | A source scan asserting the token `evaluateFormula` does not appear in the helper's non-comment lines |
| **T-34-04** (injection via a file or a third party) | `stripFormulaKeys` applied to all four `extractCustomFields` outputs and all four Pipedrive field mappings | Acceptance scan over non-comment lines in both importers |
| **T-34-25** (silent partial recalculation) | `skipped > 0` pushes a sentence into the CSV importer's existing user-visible `warnings` array, alongside the `console.warn` | The warnings mechanism is the pre-existing one; no new return field was invented |
| **T-34-26** (workflow fan-out on import) | No CRM event publishing added; the deliberate absence is now documented in a module comment | `grep -c 'crmBus' src/app/import/actions.ts` returns **0** |

## No Double-Recalculation

Verified by reading, not assumed. Neither importer touches the mutation layer:

- `src/app/import/actions.ts` imports `db` and the schema tables directly; every write is a
  local `batchInsert` or a bare `db.insert`. It imports nothing from `@/lib/mutations`.
- `src/lib/import/pipedrive-api-import-actions.ts` likewise inserts row-by-row against the
  tables. It imports nothing from `@/lib/mutations`.

So the recalculation added here is each row's **first and only** one — plans 34-06 and 34-07
wired the mutation layer, which these paths bypass entirely (RESEARCH's consolidated D-02
answer). No guard against a second pass was needed.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run src/lib/import/formula-recalc-batch.test.ts` | exit 0 — **16 passed** |
| `npm test` | exit 0 — 47 files, **719 passed / 4 skipped** (baseline 46 files, 703/4; +1 file, +16 = exactly the new tests) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | exit 0 — **0 errors, 128 warnings** (byte-identical to the baseline count) |
| `npx eslint src/app/import src/lib/import` | 0 errors, 20 warnings — all pre-existing `no-unused-vars` |
| Helper shape scan (`cascade: false`, `[formula-recalc]`, the export) | `shape OK` |
| Both importers contain `recalculateImportedRows` and `stripFormulaKeys` (non-comment lines) | two `ok` lines |
| `recalculateImportedRows` occurrences in `actions.ts` | **7** (>= 4 required) |
| `grep -c 'crmBus' src/app/import/actions.ts` | **0** |
| New `any` / `@ts-expect-error` / `eslint-disable` in the diff | **none** (grep exits 1) |
| File deletions across the three commits | none |
| Untracked files left behind | none (the `node_modules` symlink is gitignored) |
| Database rows touched | **zero** — the suite is DB-free via `vi.mock("@/db")`; no import was run against the live 189k-row dataset |

### The RED gate failed for the right reason

`Cannot find module '/src/lib/import/formula-recalc-batch'`, 0 tests collected — the expected
RED state for a brand-new module, matching plan 34-03's Task 2 RED exactly. No assertion could
have passed accidentally because none ran.

Every vitest invocation was wrapped in `timeout`. No infinite-loop formula was written, and the
helper's tests stub `recalculateFormulas` entirely, so no QuickJS context is created at all.

## Deviations from Plan

**1. [Deviation] `batchInsert` in `pipedrive-api-import-actions.ts` is dead code and was left untouched**

- **Found during:** Task 2, reading before editing.
- **Issue:** The plan directs "apply the same `batchInsert` `.returning()` change at `:83-91`" to
  the Pipedrive importer. That function is **referenced by nothing** — `grep -n batchInsert` on
  the file returns only the declaration, and eslint has been reporting
  `'batchInsert' is defined but never used` as a pre-existing warning. The file's real writes are
  per-row `db.insert(...).returning()` loops (organizations, people, deals) and one per-row
  `db.insert(activities)` with no `.returning()`.
- **Action:** Left the dead function exactly as it was (deleting it is out of scope per the
  scope boundary — it is a pre-existing warning unrelated to this task) and instead wired the
  four **real** insert sites, adding `.returning()` to the activities insert so its row ids are
  available. The CSV importer's `batchInsert` **is** live and did get the `.returning()` change.
- **Files modified:** `src/lib/import/pipedrive-api-import-actions.ts`

**2. [Rule 2 - Missing critical functionality] Pipedrive gets a RUN-level budget, not a per-block one**

- **Found during:** Task 2.
- **Issue:** The plan says to "call `recalculateImportedRows` after each entity's insert, sharing
  one `definitionsCache` per entity type across the whole import run" — it shares the cache
  across the run but says nothing about sharing the **budget**. Four blocks each defaulting to
  `FORMULA_EVALUATION_BUDGET` would be 4 x 500 = 2,000 evaluations per run (plus 2 more for the
  stubs = 3,000), which is precisely the "bound that scales with the amount of work" failure
  T-34-03 exists to prevent.
- **Fix:** `createImportFormulaBudget()` holds `remaining` and the per-entity-type caches for the
  whole run; each block calls `formulaBudget.recalculate(entityType, rows)`, which passes what is
  left and subtracts what was spent. The CSV importer needed no equivalent — each of its flows is
  a separate server action.
- **Files modified:** `src/lib/import/pipedrive-api-import-actions.ts`
- **Commit:** `5e4a4de`

**3. [Rule 2 - Missing critical functionality] Pipedrive's auto-created stubs are recalculated too**

- **Found during:** Task 2.
- **Issue:** The deals block auto-creates stub organizations and stub people for orphan
  references. They are rows this importer writes, and although they carry no custom fields from
  Pipedrive they do carry real native attributes (`name`, `notes`) that a formula such as
  `{{Name}} + " (stub)"` reads. Leaving them out would have written rows with a permanently
  blank formula value.
- **Fix:** The stub rows (already in hand from the existing `.returning()`) are collected and
  recalculated from the same run-wide budget.
- **Files modified:** `src/lib/import/pipedrive-api-import-actions.ts`
- **Commit:** `5e4a4de`

**4. [Deviation] The CSV per-flow wrapper is named `recalculateImportedRowsAndWarn`**

- **Found during:** Task 2, running the plan's acceptance criteria.
- **Issue:** The plan's own action requires the warning text to be built once and pushed into
  each flow's `warnings` array, which naturally factors into one wrapper. But its acceptance
  criterion counts literal `recalculateImportedRows` occurrences in `actions.ts` and requires
  >= 4 ("one per entity flow"). A wrapper named anything else would have made a correct
  implementation fail a correct criterion.
- **Fix:** The wrapper is named for exactly what it does — `recalculateImportedRowsAndWarn` — so
  the criterion counts 7 and the warning text still lives in one place.

**5. [Rule 1 - Bug] The module comment recording the no-CRM-events decision could not contain the token**

- **Found during:** Task 2.
- **Issue:** The plan asks for a comment recording that emitting no CRM event is deliberate,
  AND for `grep -c 'crmBus' src/app/import/actions.ts` to return 0. Writing the identifier in
  prose satisfies the first and breaks the second — the same collision plan 34-03 hit when its
  DB-free source scan tripped on its own doc comment.
- **Fix:** The comment says "the CRM event bus" and explicitly warns the next reader not to write
  the identifier into prose there either. The reasoning (5,000 rows would become 5,000 workflow
  executions, T-34-26) is preserved verbatim.
- **Files modified:** `src/app/import/actions.ts`
- **Commit:** `5e4a4de`

No Rule 4 (architectural) deviations. No packages installed. No database row read or written.

## Write-Path Inventory: What Is Now Covered

Against RESEARCH's 17-row table, for plan 34-11's audit to close.

| # | Path | Status after this plan |
|---|---|---|
| 1 | `POST /api/custom-fields/save` (UI path) | Covered by plan 34-08 |
| 2 | Entity server actions | Covered transitively via the mutation layer (34-06/34-07) |
| 3 | Mutation layer create x4 | Covered — 34-06 (deal, activity), 34-07 (person, organization) |
| 4 | Mutation layer update x4 | Covered — same two plans |
| 5–8 | `POST`/`PUT` v1 deals and people | Plan 34-09 (executing in parallel with this one) |
| 9–11 | v1 organizations and activities | Covered — 34-06 (`PUT /api/v1/activities/[id]`), 34-07 (`PUT /api/v1/organizations/[id]`); the mutation-routed POSTs via #3 |
| 12 | `PUT /api/v1/activities/[id]` | Covered by 34-06 |
| 13a–c | v1 batch routes | **Still open** — verify in 34-11 |
| **14** | **CSV importer** | **Covered by this plan** — all four flows |
| **15** | **Pipedrive API importer** | **Covered by this plan** — all four blocks plus the auto-created stubs |
| 16 | Workflow `crm_action` node | Covered transitively via #3/#4 |
| 17 | `POST /api/internal/email/process` | Deliberately uncovered — RESEARCH A8 assessed it as touching no field a formula reads. **34-11 should confirm** rather than inherit the assumption |

### Deliberately uncovered by this plan (for 34-11)

- **The CSV importer's own auto-created rows.** `resolveOrganization` (`actions.ts`) creates an
  organization for an unmatched `organizationName`, and `importDeals` creates a person for an
  unmatched `personEmail`. Both are rows this module writes and both set real native attributes
  (`name`/`notes`, `firstName`/`lastName`/`email`/`notes`), so a formula over those attributes
  stores nothing on them until their next save. They were left out because covering them means
  changing `resolveOrganization`'s signature to hand its row back and threading the flow's budget
  through it — a shape change the plan did not scope. The Pipedrive equivalents (its stubs) ARE
  covered, because their rows were already in hand. This is the one place the two importers now
  differ, and it is the single highest-value item on 34-11's list.
- **The v1 batch routes (#13a–c).** Not named by any executed plan so far.

## Threat Model Coverage

| Threat | Disposition | Status |
|---|---|---|
| **T-34-03** DoS — import amplification | mitigate | **Active.** One decrementing counter per import run in both importers, `cascade: false` everywhere. Worst case is now `FORMULA_EVALUATION_BUDGET` x 0.876 ms = ~438 ms of sandbox time per import, whatever the file size, with the shortfall reported to the user. |
| **T-34-04** Tampering — `custom_Margin` in an uploaded CSV | mitigate | **Active.** `stripFormulaKeys` on all four `extractCustomFields` outputs. This is its first application to a file-uploaded value. |
| **T-34-07** Tampering — Pipedrive-sourced values | mitigate | **Active.** Same control on all four Pipedrive field mappings. Pipedrive values still enter the sandbox only as JSON-serialisable data with no host bindings (T-34-01). |
| **T-34-24** DoS — one bad row aborting an import | mitigate | Per-row try/catch; the failing row is logged and stepped over, and the helper resolves. Asserted by a rejecting-middle-row test. |
| **T-34-25** Repudiation — silent partial recalculation | mitigate | `console.warn` plus a sentence in the CSV importer's user-visible `warnings` array naming the count and telling the user the rows self-heal on next save. |
| **T-34-26** DoS — workflow fan-out on import | accept | No CRM event publishing added; the absence is now a documented decision rather than an accident. `grep -c 'crmBus'` = 0. |
| **T-34-02** DoS — unbounded CPU per evaluation | mitigate | This plan adds **no** `evaluateFormula` call site; a source scan enforces it, so D-18's bounds cannot be bypassed by the import path. |
| **T-34-SC** Tampering — npm installs | accept | Zero packages; `package.json` / `package-lock.json` untouched. |

**Threat surface scan:** no new endpoint, auth path, file access or schema change. The new writes
are the `UPDATE ... SET custom_fields` that `recalculateFormulas` already performed for the
interactive paths, keyed by primary key through a parameterised Drizzle `eq`. The one changed
read pattern is `getActiveFieldDefinitions`, once per entity type per import. Nothing to flag.

## Known Stubs

None. No placeholder values, hardcoded empties feeding UI, or TODO/FIXME markers were introduced.

## Known Limitations (deliberate, not defects)

- **The CSV importer's auto-created orgs/people are not recalculated** — see the uncovered list
  above. They self-heal on their first real save.
- **A partially-budgeted row is left partially computed.** If the allowance runs out mid-row, that
  row's first formulas are written and the rest keep their previous values; it still counts as
  recalculated. Inherited from plan 34-04's per-child behaviour and self-healing on next save.
- **The Pipedrive importer surfaces budget exhaustion only in the server log.** Its progress state
  has an errors/review-items channel rather than a `warnings` array, and pushing a formula notice
  into `addImportError` would misreport a successful import as errored. The CSV importer, which
  has a real `warnings` array, does surface it.
- **Evaluation results are not memoised across imported rows.** 5,000 rows with the same formula
  still create 5,000 sandboxes — which is exactly why the budget matters. CONTEXT.md defers batch
  memoisation and RESEARCH records context reuse (~5x) as a deferred lever.
- **The importers remain event-free**, so an import triggers no workflow and no webhook. Unchanged
  pre-existing behaviour, now documented (T-34-26).

## Next Plan Readiness

- **Plan 34-11 (audit):** the inventory table above is the handoff. Three items need its
  attention — the CSV importer's auto-created rows, the v1 batch routes (#13a–c), and confirming
  RESEARCH assumption A8 about `POST /api/internal/email/process` rather than inheriting it.
- **No conflict with plan 34-09**, which executed in parallel: this plan touched only
  `src/lib/import/**` and `src/app/import/actions.ts`, and none of the six
  `src/app/api/v1/{deals,people}/**` route files.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally not modified — the
  orchestrator owns Phase 34's wave bookkeeping, as in plans 34-01 through 34-07.

## Self-Check: PASSED

Files verified present on disk:
- `src/lib/import/formula-recalc-batch.ts` — FOUND (148 lines)
- `src/lib/import/formula-recalc-batch.test.ts` — FOUND (290 lines, 16 tests)
- `src/app/import/actions.ts` — FOUND, modified
- `src/lib/import/pipedrive-api-import-actions.ts` — FOUND, modified

Commits verified in `git log`:
- `6b48168` — FOUND (`test(34-10)`)
- `e6eedf1` — FOUND (`feat(34-10)`)
- `5e4a4de` — FOUND (`feat(34-10)`)

RED-before-GREEN ordering verified: `6b48168` precedes `e6eedf1`.
No file deletions in any of the three commits.
Only the four files in the plan's `files_modified` were changed.

## TDD Gate Compliance

Gate sequence satisfied. RED: `test(34-10)` `6b48168`, verified failing with the module
unresolved and 0 tests collected. GREEN: `feat(34-10)` `e6eedf1`, 16/16 pass. No REFACTOR gate
needed. Task 2 is typed `auto` in the plan and is covered by the helper's suite plus the full
719-test regression run.

---
*Phase: 34-formula-reactivity*
*Completed: 2026-08-14*
