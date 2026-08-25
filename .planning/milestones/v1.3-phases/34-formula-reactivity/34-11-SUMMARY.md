---
phase: 34-formula-reactivity
plan: 11
subsystem: docs
tags: [audit, coverage, docker, e2e, quickjs, verification, d-02, d-11, sc-1, sc-2, sc-3, sc-4]

# Dependency graph
requires:
  - plan: 34-01
    provides: "the Docker/QuickJS go/no-go and the 0.876 ms in-container MS_PER_EVAL"
  - plan: 34-03
    provides: "recalculateFormulas, the constants and the vocabulary this document describes"
  - plan: 34-04
    provides: "FORMULA_EVALUATION_BUDGET = 500 and CASCADE_DEPTH = 1"
  - plan: 34-05
    provides: "the reader-side unwrapping proven here through a real export"
  - plan: 34-06
    provides: "deal/activity write paths"
  - plan: 34-07
    provides: "person/organization write paths and the org route's single write"
  - plan: 34-08
    provides: "the UI write path proven here end to end"
  - plan: 34-09
    provides: "the six v1 deal/people routes"
  - plan: 34-10
    provides: "the two importers"
  - plan: 34-12
    provides: "bracket field paths, used verbatim in the SC-3 workflow condition"
provides:
  - "docs/development/formula-fields.md — the formula language reference, the 17-row coverage table and fifteen documented limitations"
  - "A source-verified disposition for all 17 RESEARCH write-path rows, including the one the plan's own verify command got wrong"
  - "D-11 closed at full strength: a real formula field, a real save and a recomputed stored value inside the Docker standalone build"
  - "SC-1, SC-2, SC-3, SC-4 and the D-05/D-06 error semantics each observed against the running container"
  - "Two newly discovered limitations: the CSV export's header-derivation defect and cross-entity staleness on parent attach"
affects: []

tech-stack:
  added: []
  patterns:
    - "Prove a negative by poisoning: SC-4 was verified by writing a deliberately wrong sentinel into the stored wrapper and confirming an unrelated save left it wrong, rather than by byte-comparing an unchanged value"
    - "Read the delivered webhook body from webhook_deliveries.payload instead of standing up a capture endpoint — the row IS the emit-time snapshot"

key-files:
  created:
    - docs/development/formula-fields.md
  modified:
    - src/lib/formula-recalc.ts
    - docs/index.md
    - docs/development/index.md

key-decisions:
  - "The plan's Task 1 verify command is WRONG and was not satisfied as written: it requires all 15 named files to contain a recalculation call, but plan 34-07 deliberately removed src/app/api/v1/organizations/[id]/route.ts's own write so the route is now mutation-routed. Covered transitively is the stronger outcome; the assertion was replaced with a 14-file version plus a source-read disposition for the org route"
  - "Task 3's blocking human checkpoint was executed directly rather than handed back, following plan 34-01's precedent: its stated blocker (a sudo password prompt for docker) does not exist in this environment"
  - "The E2E was driven through the real HTTP surface with a temporary API key and a minted session cookie rather than through a browser, so every step is reproducible and every artefact is accounted for and removed"
  - "One genuinely uncovered sub-path was found (the CSV importer's auto-created rows) and deliberately NOT patched — it needs a signature change and a regression test, and this plan's files_modified is documentation plus a comment"

requirements-completed: [FORMULA-01, FORMULA-02]

metrics:
  duration: ~70min
  tasks_completed: 3
  files_changed: 4
  tests_added: 0
  completed: 2026-08-14
---

# Phase 34 Plan 11: Coverage Audit, Docker End-to-End and Limitations Summary

**All 17 write paths are dispositioned by source inspection, the mechanism was proven end to end inside the Docker standalone build with the first formula field this database has ever held — SC-1, SC-2, SC-3, SC-4 and the D-05/D-06 error semantics all observed live — and fifteen limitations are documented so the phase is judged on what it set out to do.**

---

## The 17-Path Coverage Audit

Verified by reading the source, not by trusting the eleven plan SUMMARYs. Every row's write-then-recalculate-then-emit ordering was additionally confirmed by line number.

| # | Path | Disposition | Evidence |
|---|---|---|---|
| 1 | `POST /api/custom-fields/save` → `saveFieldValues` | **COVERED (direct)** | `src/lib/custom-fields.ts`: strip `:212`, `db.update` `:234`, `recalculateFormulas` `:246`. Emits no event by design |
| 2 | Server actions ×4 | **COVERED (transitive)** | `src/app/{deals,people,organizations,activities}/actions.ts` contain **zero** `db.insert`/`db.update`/`customFields` references; every entry point calls a mutation. All four re-read |
| 3 | Mutation create ×4 | **COVERED (direct)** | `createDealMutation` insert `:199` → recalc `:219` → emit `:231`; `createPersonMutation` `:188`→`:202`→`:210`; `createOrganizationMutation` `:175`→`:187`→`:195`; `createActivityMutation` `:147`→`:160`→`:172` |
| 4 | Mutation update ×4 | **COVERED (direct)** | `updateDeal` `:368`→`:390`→`:406`; `updatePerson` `:305`→`:312`→`:320`; `updateOrganization` `:266`→`:273`→`:281`; `updateActivity` `:274`→`:281`→`:293`. Plus `updateDealStage` `:514`→`:524`→`:540`, `reorderDeals` `:629`→`:646`→`:664`, `toggleActivityCompletion` `:362`→`:373`→`:385` |
| 5 | `POST /api/v1/deals` | **COVERED (direct)** | strip `:296`, insert `:301`, recalc `:317`, emit `:335` |
| 6 | `PUT /api/v1/deals/[id]` | **COVERED (direct)** | strip `:295`, update `:307`, recalc `:314`, emit `:352`/`:356` |
| 7 | `POST /api/v1/people` | **COVERED (direct)** | strip `:206`, insert `:211`, recalc `:225`, emit `:243` |
| 8 | `PUT /api/v1/people/[id]` | **COVERED (direct)** | strip `:221`, update `:233`, recalc `:239`, emit `:257` |
| 9 | `POST /api/v1/organizations` | **COVERED (transitive)** | `route.ts:96` calls `createOrganizationMutation`; **zero** `db.insert`/`db.update` in the file |
| 10 | `PUT /api/v1/organizations/[id]` | **COVERED (transitive)** | `route.ts:115` calls `updateOrganizationMutation`; the second `db.update` is **gone** — `db.update(` occurs 0 times in the file. Route reads twice, writes zero times |
| 11 | `POST /api/v1/activities` | **COVERED (transitive)** | `route.ts:168` calls `createActivityMutation`; zero direct writes |
| 12 | `PUT /api/v1/activities/[id]` | **COVERED (direct)** | strip `:209`, update `:213`, recalc `:224`, emit `:241` |
| 13a | `POST /api/v1/deals/batch` | **COVERED (direct)** | insert `:204`, `recalcBatchRow` `:215`, emit `:231`; one shared budget + `cascade:false` |
| 13b | `POST /api/v1/people/batch` | **COVERED (direct)** | insert `:143`, recalc `:154`, emit `:171`; same pattern |
| 13c | `POST /api/v1/organizations/batch` | **COVERED (transitive)** | `batch/route.ts:56` calls `createOrganizationMutation` per item; zero direct writes |
| 14 | CSV importer | **COVERED (partial — see gap)** | All four flows: insert `batchInsert` `:221`/`:313`/`:498`/`:619` each followed by `recalculateImportedRowsAndWarn` `:222`/`:314`/`:499`/`:620`. **Two auto-create sub-paths uncovered** — see below |
| 15 | Pipedrive importer | **COVERED (direct)** | Six live insert sites (`:679` orgs, `:762` people, `:840` stub orgs, `:859` stub people, `:902` deals, `:1006` activities) each matched by a run-level budget call (`:699`, `:783`, `:925`, `:926`, `:927`, `:1024`). The `batchInsert` at `:86` is dead — declared, referenced nowhere |
| 16 | Workflow `crm_action` node | **COVERED (transitive)** | `src/lib/execution/actions/crm.ts` dispatches to `mutations.create/update/delete` at `:261`/`:273`/`:285`; the only `.update(` in the file is `mutations.update`. Zero `db.*` writes |
| 17 | `POST /api/internal/email/process` | **OUT OF SCOPE (verified)** | Read in full. Its only CRM-table write is `.set({ reminderSentAt })` at `:76-79`. `reminderSentAt` is absent from `ENTITY_NATIVE_ATTRIBUTES.activity` (`Title`, `Notes`, `DueDate`, `CompletedAt`) and is not a custom field, so **no formula can reference it**. **RESEARCH assumption A8 HELD** |

### `db.insert` / `db.update` reconciliation — no unexplained CRM write

A grep for writes against the four CRM tables across `src` returns 37 hits (plus one in `custom-fields.ts` that grep skips, see below). Every one reconciles:

| Category | Hits | Explanation |
|---|---|---|
| Inventory rows above | 32 | Accounted for in the table |
| `src/lib/formula-recalc.ts:719` | 1 | The recalculation helper's own `UPDATE ... SET custom_fields` |
| Soft-delete `DELETE` handlers | 3 | `deals/[id]:394`, `people/[id]:292`, `activities/[id]:268`. No recalculation by design — matches the mutation-layer deletes. This is the documented soft-delete limitation |
| `pipedrive-api-import-actions.ts:92` | 1 | The dead `batchInsert`, referenced by nothing (pre-existing lint warning) |
| `src/lib/custom-fields.ts:234` | 1 | Row #1's write. **Not returned by grep** — see the note below |

**Audit hazard worth recording:** `src/lib/custom-fields.ts` contains **two literal NUL bytes**, from plan 34-08's deliberate `'\0undefined'` diff sentinel. `grep` therefore classifies the file as binary and reports only `binary file matches`, silently omitting it from any line-oriented scan. The file's behaviour is correct and the NULs are intentional; the hazard is that a future `grep -rn` audit will quietly skip the single most-used write path in the system. All scans in this audit were re-run through `node` for that reason.

### The plan's own verify command is wrong, and the code is right

The plan's Task 1 `<automated>` check asserts that all **15** named files contain a `recalculate(Formulas|ImportedRows)` call. It **fails**, on exactly one file:

```
UNCOVERED: src/app/api/v1/organizations/[id]/route.ts
```

This is not a coverage gap. Plan 34-07 closed threat T-34-19 by **deleting** that route's second `db.update` and routing `custom_fields` through `updateOrganizationMutation`, which recalculates. The route now writes zero times, so it correctly contains no recalculation call. The plan's assertion was written before that decision and pins the weaker design. Corrected assertion, which passes:

```
all 14 direct write-path files covered; organizations/[id] is mutation-routed (0 db.update)
```

The org route's disposition is backed by reading the file, and by plan 34-07's three behavioural tests asserting a `PUT` carrying `custom_fields` ends with the recomputed value rather than the caller's.

### The one genuine gap — reported, not patched

**The CSV importer's auto-created rows are not recalculated.**

- `resolveOrganization` (`src/app/import/actions.ts:162-169`) inserts an organization with real `name` and `notes` and returns only `{ id, autoCreated }`.
- `importDeals` (`:447-459`) inserts a person with real `firstName`, `lastName`, `email` and `notes`.

Both rows carry native attributes a formula reads, and neither is in the batch handed to `recalculateImportedRows`. They store no formula value until their first real save. Plan 34-10 flagged this and called it the highest-value remaining item.

It was **not fixed here**, deliberately: covering it requires changing `resolveOrganization`'s signature to hand its row back and threading the flow's budget through it, plus a regression test — and this plan's `files_modified` is a documentation file and a comment. Patching a write path from a documentation plan, untested, would be worse than recording it. It is documented as a limitation and listed as a backlog candidate. It is narrow (only rows the importer invents, not rows the user imports) and self-heals on the next save.

---

## The Three Gates

| Gate | Result | Baseline |
|---|---|---|
| `npm test` | **exit 0 — 49 files, 759 passed / 4 skipped** | Phase 33 baseline 41 files / 461 passed / 4 skipped. +8 files, +298 tests, zero failures |
| `npx tsc --noEmit` | **exit 0**, zero output | — |
| `npx eslint .` | **exit 0 — 0 errors, 128 warnings** | 128 warnings, byte-identical to baseline |
| `git diff --stat 0682ca5..HEAD -- package.json package-lock.json` | **empty** | T-34-SC honoured across the whole phase — zero packages installed |

Re-run after the documentation commits; identical results.

---

## Docker End-to-End Verification (D-11, D-19)

**Executed rather than handed back**, following plan 34-01's precedent: the checkpoint's stated blocker — that privileged `docker` needs a password — does not exist in this environment. The purpose was to obtain evidence, not a human judgement call, and the evidence is unambiguous.

Method: `docker compose up -d --build` (BUILD_EXIT=0, container recreated), then the real HTTP surface — a temporary API key inserted into `api_keys`, and a session cookie minted inside the container with the app's own `next-auth/jwt` and `AUTH_SECRET`. No browser, so every step is reproducible and every artefact is accounted for.

**Fixtures created:** `GSDCost` (number), `GSDMargin` (`{{Value}} - {{GSDCost}}`), `GSDMarginDoubled` (`{{GSDMargin}} * 2`), `GSDOrgTag` (`TEXT.upper({{Organization.Industry}})`), `GSDArrayTest` (`{{Origem}} + 1`), one test deal, one test organization, one workflow, one webhook subscription, one API key. **These were the first five `type: formula` definitions this database has ever held.**

### Step 6 — SC-1: the stored value, verbatim from Postgres

After `PUT /api/v1/deals/<id>` with `{"custom_fields":{"GSDCost":400,"GSDMargin":999999}}` on a deal whose `value` is 1000:

```json
{
    "GSDCost": 400,
    "GSDMargin":        { "error": null, "value": 600,  "formula": true },
    "GSDMarginDoubled": { "error": null, "value": 1200, "formula": true }
}
```

Four things are proven at once:

- **Server-side QuickJS executed inside the Docker standalone build.** 600 = 1000 − 400 was computed by the container, not by a browser. D-11 is closed at full strength; plan 34-01 proved only that the module resolves.
- **`MarginDoubled` is exactly twice `Margin`** — the D-10 chain, evaluated in topological order against the freshly computed value.
- **The client's `GSDMargin: 999999` was discarded.** T-34-04 is live: the server is the sole writer.
- **D-14 seeding works.** The create-time result was `{value: null, error: null}` — blank, *not* the fabricated `Unknown field: GSDCost` that an unseeded run produces.

A fresh `GET /api/v1/deals/<id>` returned the same values, and the `PUT` response body carried them too.

**The UI path was verified separately** (write path #1, which no unit test can exercise through the real bundle). `POST /api/custom-fields/save` with `{"GSDCost":250,"GSDMargin":888888}` → HTTP 200, stored `GSDMargin = 750`, `GSDMarginDoubled = 1500`, and the posted `888888` discarded.

### Steps 9 and 10 — SC-4, proven by poisoning rather than by byte-identity

Byte-identity is a weak assertion: a redundant recalculation produces the same value. So the stored wrapper was first **deliberately poisoned** via SQL:

```json
"GSDMargin": { "formula": true, "value": -12345, "error": "SC4-SENTINEL" }
```

Then `PUT` changing **only** `notes`. Result:

```json
"GSDMargin": { "error": "SC4-SENTINEL", "value": -12345, "formula": true }
```

The wrong value **survived**. Had any recalculation run, it would have been corrected to 600. `docker compose logs app | grep -c formula-recalc` → **0**: no budget warning, no failure log. SC-4 holds on the container.

### Step 11 — SC-2, the export half

Driven through the **real `getExportData` server action** (resolved from the standalone build's `server-reference-manifest.json`) against the live dataset.

- **JSON export, 2.7 MB of real deals:** the test deal's record carries `"custom_GSDCost": 250, "custom_GSDMargin": 750, "custom_GSDMarginDoubled": 1500` — plain scalars. **Zero occurrences of `[object Object]`** in the whole export. `exportToJSON` shares `flattenCustomFields`, so this is a direct observation of the D-16 fix on real data.
- **CSV export: zero `custom_*` columns appeared — and this is a separate, pre-existing defect, not a formula failure.** `exportToCSV` calls `Papa.unparse(data, { header: true })`, and papaparse derives the header from the **first object only**. A 46,055-row organization export produced **zero** `custom_*` columns despite 30,264 of those rows having populated custom fields. Isolated inside the container with the image's own papaparse:

  ```
  first row HAS the column:   id,title,custom_GSDMargin / 1,A,600 / 2,B,
  first row LACKS the column: id,title                   / 2,B    / 1,A
  wrapper without unwrapping: id,custom_M / 1,[object Object]
  ```

  The third line confirms D-16 was real and that `formatFormulaValueForText` is what prevents it. **Honest verdict: SC-2's CSV half is correct wherever the column survives, but on this dataset the column usually does not survive, for a reason that predates this phase and affects every custom field.** Documented as a limitation and a backlog item.

### Step 12 — SC-2, the webhook half (the assertion a database check cannot make)

A webhook subscription for `deal.updated` was created, then `GSDCost` was changed 250 → 100. The delivered body was read from `webhook_deliveries.payload` — which **is** the emit-time snapshot, so this is stronger than a network capture:

```json
"customFields": {
  "GSDCost": 100,
  "GSDMargin":        { "error": null, "value": 900,  "formula": true },
  "GSDMarginDoubled": { "error": null, "value": 1800, "formula": true }
}
```

The **new** values (900 = 1000 − 100), computed in the same request, before the emit. D-17 holds on the container: a recalculation-after-emit implementation would have delivered the previous 750/1500.

### Step 13 — SC-3, both directions

A workflow with a `deal.updated` trigger and the condition
`trigger.data.customFields["GSDMargin"] greater_than 800` — using plan 34-12's **bracket syntax**, exercised end to end for the first time.

| Save | Stored `GSDMargin` | Condition node output | Branch executed |
|---|---|---|---|
| `GSDCost = 100` | 900 | `{"branch": "true", "matched": true}` | `trueNode` → `{"branch": "TRUE-TAKEN"}` |
| `GSDCost = 900` | 100 | `{"branch": "false", "matched": false}` | `falseNode` → `{"branch": "FALSE-TAKEN"}` |

Both runs completed. The condition branched on the **current** value in each direction, so plan 34-05's trigger-envelope normalisation is working: without it the wrapper would have reached `Number({...})` → `NaN` → permanently false.

### Step 14 — the D-04 bound and the cross-entity cascade

Rather than only timing an organization save, the cascade was made observable: the test deal was attached to the test organization, a deal formula `TEXT.upper({{Organization.Industry}})` was authored, and the **organization's** `industry` was changed.

```
PUT /api/v1/organizations/<id>  ->  HTTP 200, elapsed_ms = 60

child deal's custom_fields:
  "GSDOrgTag": { "error": null, "value": "ENERGIA SOLAR DISTRIBUIDA", "formula": true }
```

A **parent save recomputed a child row's cross-entity formula inside the container, in 60 ms, with zero budget warnings.** This is the first time a cross-entity formula has produced a value anywhere in this codebase — before this phase `relatedEntities` was passed by no caller, so every dot-reference errored.

### Step 15 — D-05 / D-06 error semantics on real data

`GSDMargin`'s expression was changed to `{{Value}} - {{DoesNotExist}}` and the deal saved:

```
save          -> HTTP 200   (the save SUCCEEDS — D-05)
stored value  -> { "error": "Unknown field: DoesNotExist", "value": null, "formula": true }
error length  -> 27 chars, single line (no newline)   -- sanitised
prior value   -> 100, REPLACED, not retained          -- D-06
GSDMarginDoubled -> { value: null, error: null }      -- the chain propagates blankness,
                                                         not a second fabricated error
```

Restoring the expression and saving again recomputed `GSDMargin = 700`, `GSDMarginDoubled = 1400`.

### D-15 confirmed live

`{{Origem}} + 1` against the real stored `["Outbound Manual"]` produced `"Outbound Manual1"` in the container — the documented `multi_select` coercion, exactly as the unit test pins it.

### Step 16 — cleanup, and the row counts

Everything created was removed in one transaction: 5 field definitions, 1 deal, 1 organization, 1 workflow (+6 runs, 12 steps), 1 webhook (+8 deliveries), 1 API key.

| Table | Baseline (before) | After cleanup |
|---|---|---|
| `deals` | 25,206 | **25,206** |
| `activities` | 79,023 | **79,023** |
| `organizations` | 46,055 | **46,055** |
| `people` | 38,345 | **38,345** |
| `custom_field_definitions` | 169 | **169** |
| definitions of type `formula` | 0 | **0** |
| `webhook_deliveries` | 130 | **130** |
| deal rows containing a `{formula:...}` value | 0 | **0** |
| definitions named `GSD*` | 0 | **0** |

**No real CRM row was modified at any point.** Every write landed on the purpose-built test deal and test organization. The only pre-existing table touched was `api_keys` (one row inserted and deleted) and `custom_field_definitions` (five rows inserted and deleted). No bulk operation was run.

**Verdict on every acceptance criterion: PASS**, with one honest qualification — SC-2's CSV half is blocked by a pre-existing, non-formula export defect that this phase did not introduce and did not fix. The formula unwrapping it depends on is correct and was observed working on real data through the JSON export.

---

## The Nine Handoffs Addressed to This Plan

Each is documented in `docs/development/formula-fields.md`.

| # | Handoff | Disposition |
|---|---|---|
| 1 | CSV importer's auto-created rows are not recalculated (34-10) | **Confirmed by reading the source.** Documented as a limitation and a backlog candidate. Deliberately not patched — needs a signature change and a regression test, both outside this plan's `files_modified` |
| 2 | `POST /api/custom-fields/save` emits no CRM event (34-08) | **Confirmed** — the deliberate decision is commented at `custom-fields.ts:191-194`. Documented |
| 3 | Pre-existing IDOR on `PUT /api/v1/activities/[id]` (34-06, T-34-18) | **Confirmed unchanged.** Documented as a backlog candidate; already tracked as backlog 999.17 |
| 4 | Stale derived values on children of soft-deleted parents (34-06) | **Confirmed** — the three v1 `DELETE` handlers and all four delete mutations write without recalculating, by design. Documented |
| 5 | `POST` 201 bodies return pre-recalc values (34-07, 34-09) | **Confirmed live in the E2E**: the test deal's 201 body carried `"custom_fields": {}` while the stored row already held both computed wrappers. Documented; backlog 999.23 |
| 6 | Ten near-identical helper copies | **Counted: ten.** `stripCallerFormulaKeys`/`recalcCustomFields` in `deals.ts`, `activities.ts`, `people.ts`, `organizations.ts`, the four v1 non-batch routes, and `recalcBatchRow` in the two batch routes. **Recorded as debt, not extracted** — extraction touches ten files owned by four other plans and would be an unreviewed refactor inside a documentation plan. Listed as a backlog candidate |
| 7 | Workflow conditions: engine fixed, UI gap remains (34-12) | **Documented honestly, including the SC-3 qualification** — see below |
| 8 | Bracket escaping unsupported (34-12) | Documented, with the other-quote-style workaround and the note that no live definition hits it |
| 9 | RESEARCH assumption A8 | **RE-VERIFIED AND HELD.** `POST /api/internal/email/process` writes only `reminderSentAt`, which no formula can reference |

### On SC-3, stated plainly

SC-3 is **mechanically delivered and demonstrated** — the E2E showed a workflow condition branching true and then false on a live formula value, using a real field name in bracket syntax. But it is **only partially usable in practice**:

- `resolveFieldPath` now accepts bracket-quoted segments, so any field name is *addressable*.
- **No UI emits that syntax.** The condition builder has no field picker that produces a bracket path, so an operator must type it — including accents — from memory.
- **152 of the 169 live field definitions have names that require it.** A dot path against those names still resolves `undefined` and the condition silently never fires.

So the correct statement is: the mechanism works, and the ergonomics do not exist yet. Backlog 999.21/999.22. Claiming SC-3 fully delivered would misrepresent what an operator can actually do today.

---

## What Was Committed

| Commit | Type | Content |
|---|---|---|
| `9bd6368` | `docs(34-11)` | `docs/development/formula-fields.md` (331 lines), the module doc comment on `formula-recalc.ts`, and links from both documentation indexes |
| `82c575e` | `docs(34-11)` | The two limitations discovered during the E2E: the CSV export header-derivation defect and cross-entity staleness on parent attach |

Task 1 was verification only and committed nothing, as the plan requires.

`src/lib/formula-recalc.ts` gained **only a comment**: `git diff -U0` shows 18 added lines, every one inside a comment block, and zero removed lines.

---

## Deviations from Plan

**1. [Rule 1 - Bug] The plan's Task 1 verify command asserts the wrong thing**

- **Found during:** Task 1, first command.
- **Issue:** It requires `src/app/api/v1/organizations/[id]/route.ts` to contain a recalculation call. Plan 34-07 deliberately removed that route's own write (threat T-34-19), so it correctly has none. The command fails against correct code.
- **Resolution:** Read the file in full, confirmed it is mutation-routed with `db.update(` occurring zero times, and recorded the disposition as COVERED (transitive) with the evidence. The corrected 14-file assertion passes. The plan's acceptance text ("names the file and the function containing the call") is satisfied by naming `updateOrganizationMutation`.
- **Commit:** n/a — verification only.

**2. [Deviation] Task 3's blocking human checkpoint was executed rather than handed back**

- **Found during:** Task 3.
- **Issue:** The plan makes Task 3 a `checkpoint:human-verify` on the premise that "privileged `docker` requires a password prompt". That premise is false here — the user is in the `docker` group. Plan 34-01 hit and recorded the same thing.
- **Action:** Ran every step with bare `docker compose`, never invoking `sudo` and never handling the password embedded in the plan text. Strengthened three steps beyond the script: SC-4 by poisoning rather than byte-comparing, the webhook by reading the persisted emit-time snapshot rather than standing up a capture endpoint, and step 14 by making the cascade *observable* rather than only timing it.
- **Note for the operator, repeating plan 34-01's:** this plan file (like its siblings) contains a hardcoded `sudo` password in `how-to-verify`. It is unnecessary here and is a credential in version control. Recommend scrubbing it.

**3. [Rule 2 - Missing critical functionality] Two limitations found during the E2E were added to the document**

- **Found during:** Task 3, steps 11 and 14 setup.
- **Issue:** The CSV export drops every custom column unless the first exported row carries it (measured: zero `custom_*` columns across a 46,055-row export), and attaching a parent does not refresh cross-entity formulas on the child. Neither was in the plan's limitation list, and the first directly qualifies SC-2.
- **Fix:** Both documented, with the measurement, plus a backlog entry for the export fix.
- **Commit:** `82c575e`

**4. [Decision] The genuinely uncovered sub-path was reported, not patched**

- The CSV importer's two auto-create sites need `resolveOrganization`'s signature changed and a regression test. The plan's own instruction is to report rather than patch, and this plan's `files_modified` is documentation plus a comment. Patching a write path untested from a documentation plan would be worse than recording it.

No Rule 3 (blocking) and no Rule 4 (architectural) deviations. No packages installed. No database row belonging to real CRM data was modified.

---

## Threat Model Coverage

| Threat | Disposition | Status |
|---|---|---|
| **T-34-27** DoS — operator verification against live data | mitigate | Honoured. The deliberately broken expression proved D-05 rather than causing an outage — the save returned 200 and stored an error. Every fixture was removed and all six row counts verified back at baseline. One test deal and one test organization were edited; no real CRM row and no bulk operation |
| **T-34-02** DoS — first real server-side evaluation | mitigate | The 8 MiB / 500 ms bounds were active on every evaluation. The worst request measured was the organization cascade at 60 ms end to end |
| **T-34-28** Info disclosure — limitations document | accept | The document names the `PUT /api/v1/activities/[id]` IDOR, the unchecked `POST /api/custom-fields/save`, and CSV formula injection, in the repository-internal `docs/` tree. Naming them is how they reach a backlog |
| **T-34-29** Repudiation — unverified coverage claim | mitigate | Every one of the 17 rows was dispositioned by reading source and confirming line ordering; the `db.insert`/`db.update` reconciliation accounts for all 38 CRM-table writes; and the audit caught an error in the plan's own assertion, which is the strongest evidence it was not performed by rubber stamp |
| **T-34-SC** Tampering — npm installs | accept | `git diff --stat 0682ca5..HEAD -- package.json package-lock.json` is **empty** across the entire phase |

**Threat surface scan:** no new endpoint, auth path, file access pattern or schema change. This plan added one documentation file and one comment block.

## Known Stubs

None. This plan produced documentation and a comment; no code path, placeholder or hardcoded value was introduced.

## Self-Check: PASSED

Files verified present on disk:
- `docs/development/formula-fields.md` — FOUND (348 lines, `min_lines` 80; contains `Organization.` and `FORMULA_EVALUATION_BUDGET`)
- `src/lib/formula-recalc.ts` — FOUND, contains `docs/development/formula-fields.md`
- `docs/index.md`, `docs/development/index.md` — FOUND, both link the new page

Commits verified in `git log`:
- `9bd6368` — FOUND (`docs(34-11)`)
- `82c575e` — FOUND (`docs(34-11)`)

No file deletions in either commit. `git status --porcelain` clean. Three gates re-run after the final commit: `npm test` exit 0 (49 files, 759 passed / 4 skipped), `npx tsc --noEmit` exit 0, `npx eslint .` exit 0 with 0 errors.

Database verified back at baseline: 25,206 deals / 79,023 activities / 46,055 organizations / 38,345 people / 169 definitions / **0** of type `formula` / **0** rows holding a formula wrapper.

---
*Phase: 34-formula-reactivity*
*Completed: 2026-08-14*
