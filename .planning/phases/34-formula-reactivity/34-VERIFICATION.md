---
phase: 34-formula-reactivity
verified: 2026-08-14T23:54:14Z
status: passed
score: 4/4 must-haves verified (after gap closure 34-13)
overrides_applied: 0
gaps:
  - truth: "SC-2: A CSV export produced right after a save carries the recalculated values"
    status: partial
    reason: "The formula-unwrapping mechanism this phase built (flattenCustomFields/formatFormulaValueForText) is correct and proven on real data through the JSON export path. But exportToCSV calls Papa.unparse(data, {header:true}) unchanged, which derives the CSV header from the FIRST row object only. Measured on the live 46,055-row organization export: zero custom_* columns appeared despite 30,264 rows holding populated custom fields, because the first exported row happened to lack them. The recalculated formula value is correct in the database and in the JSON export, but does not reliably reach the CSV file — the literal wording of SC-2 ('a CSV export... carries the recalculated values') is not met on realistic datasets."
    artifacts:
      - path: "src/lib/export/formatters.ts"
        issue: "exportToCSV (line ~208-211) has no explicit union-of-keys header derivation; relies on papaparse's first-row-only default. This is a pre-existing defect affecting every custom field, not something this phase introduced, and the phase's own audit (34-11) discovered and documented it rather than concealing it."
    missing:
      - "Union all row keys (or pass an explicit `columns`/`fields` option) before calling Papa.unparse so every populated custom_* column survives regardless of row order. Tracked informally as backlog 999.24 in the 34-11 SUMMARY, but not yet in a persisted backlog registry (no BACKLOG.md exists in .planning/) so it is at risk of being lost."
  - truth: "FORMULA-01: stored JSONB values are correct everywhere entity data is written server-side"
    status: partial
    reason: "17 of 17 write paths were dispositioned in 34-11 and independently spot-checked here (custom-fields.ts direct write, deal/person/org/activity server actions transitively routed through mutations, the org PUT route's mutation-routing, and the CSV importer). One narrow, genuine gap survives: the CSV importer's auto-created rows are not recalculated. `resolveOrganization` (src/app/import/actions.ts, insert ~line 162) and the inline person auto-create inside importDeals (~line 447) both insert real native-attribute data (name, notes, firstName/lastName/email) and are never passed to recalculateImportedRows. Confirmed by reading the source: neither insert site is followed by any recalculation call for that specific row."
    artifacts:
      - path: "src/app/import/actions.ts"
        issue: "resolveOrganization (~line 139-174) and importDeals' inline person auto-create (~line 440-465) insert rows whose formula fields (if any reference native attributes) are never computed until the row's next real save."
    missing:
      - "Thread the shared import budget into resolveOrganization and the person auto-create block, call recalculateFormulas (or recalculateImportedRows with a 1-row batch) on the newly created row before returning its id, and add a regression test. This is narrow in practical impact (self-heals on next save, and only affects rows the importer invents rather than rows the user is importing) but is a real, currently-uncovered write path."
deferred: []
human_verification:
  - test: "Decide whether SC-3's 'mechanism only' state is acceptable to ship, or whether a workflow condition field-picker must emit bracket-quoted paths before Phase 34 is considered done"
    expected: "A product/scope decision on whether an operator being unable to author a working condition against 152 of 169 live custom field names (without typing bracket syntax from memory, including diacritics) meets the intent of SC-3, even though the underlying engine mechanically branches correctly when a bracket path IS supplied"
    why_human: "This is a scope/acceptability judgment, not a code-correctness question — the code does exactly what was engineered (resolveFieldPath accepts bracket segments, proven end-to-end), the gap is a missing UI affordance (no field picker in the condition builder emits bracket syntax) that was explicitly deferred to backlog 999.21/999.22 by the plan's own audit rather than fixed in this phase"
  - test: "Confirm the backlog items referenced only in commit messages and SUMMARY prose (999.17, 999.21, 999.22, 999.23, 999.24) get captured into a persisted backlog registry"
    expected: "A tracked location (BACKLOG.md or equivalent) lists these five items so they are not lost between milestones"
    why_human: "No .planning/BACKLOG.md or equivalent file exists in this repository; the numbers appear only in git commit subjects and SUMMARY prose. This is a process/planning-hygiene question, not a code defect."
---

# Phase 34: Formula Reactivity Verification Report

**Phase Goal:** A formula field's stored value is correct everywhere it is read, not just where it is rendered
**Verified:** 2026-08-14T23:54:14Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | SC-1: After saving via UI, server action, or REST API, a subsequent GET returns recomputed formula values with no page load | ✓ VERIFIED | Re-read `src/lib/mutations/deals.ts` create/update paths: `db.insert`/`db.update` → `recalcCustomFields` (wraps `recalculateFormulas`, which itself writes `db.update(table).set({customFields: merged})`) → `crmBus.emit`, in that order, at every one of the four mutation files. `recalculateFormulas` persists to the DB before returning, so any subsequent read (GET, re-fetch) sees the recomputed row. 34-11's Docker E2E independently confirmed this live: `PUT` with a stale client-supplied `GSDMargin:999999` stored the server-computed `600`, and a fresh `GET` returned the same value |
| 2 | SC-2: A CSV export and a webhook payload produced right after a save carry the recalculated values | ⚠️ PARTIAL | **Webhook half VERIFIED**: `normalizeFormulaValues` in `src/lib/triggers/matcher.ts` unwraps wrappers before the trigger envelope is built (D-17), and 34-11's E2E read the actual `webhook_deliveries.payload` row showing the new value (900/1800) computed in the same request as the save. **CSV half NOT MET on realistic data**: `exportToCSV` (`src/lib/export/formatters.ts:208-211`) calls `Papa.unparse(data, {header:true})` unchanged; papaparse derives the header from the first row only. Reproduced independently: `node -e` against the installed papaparse confirms a 2-row array where only the second row has the column loses that column entirely. On the live 46,055-row organization export, 30,264 rows have custom fields but the export emitted zero `custom_*` columns. The unwrapping fix itself (`flattenCustomFields`) is correct and proven via the JSON export (zero `[object Object]` occurrences on 2.7 MB of real data) — but the CSV file, specifically, unreliably carries the value |
| 3 | SC-3: A workflow condition evaluated against a formula field branches on the current value | ✓ VERIFIED (mechanism only) | `resolveFieldPath` (`src/lib/execution/condition-evaluator.ts:96-111`) accepts bracket-quoted path segments (confirmed by reading the tokenizer and by `src/lib/execution/condition-evaluator.test.ts`'s bracket-path assertions). 34-11's E2E proved a real `deal.updated` workflow condition using `customFields["GSDMargin"]` branched true then false as the stored value crossed 800 in each direction. **However**: no UI component emits bracket syntax — grepped the condition builder (`condition-config.tsx`) and the variable picker/schema (`variable-picker.tsx`, `variable-schema.ts`); neither contains any `customFields` path generation at all, bracket or dot. A DB query confirms 157 of 169 live field names contain characters (spaces, accents, punctuation) that require bracket-quoting; an operator must type the exact syntax from memory. Literal SC-3 wording ("branches on the current value") is satisfied when a condition is correctly authored; the practical reach of that capability is narrow |
| 4 | SC-4: Saving a field no formula references triggers NO recalculation — scoped, no fan-out | ✓ VERIFIED | `src/lib/formula-recalc.test.ts` asserts `expect(evalSpy).toHaveBeenCalledTimes(0)` (not merely value-equality) across at least 9 distinct scenarios, including one that additionally asserts `mockDb.select` was called 0 times (no row even read) and one covering a 10-field bulk change. `evalSpy` wraps the real `evaluateFormula` via `vi.fn(actual.evaluateFormula)`, so this is a genuine call-count spy, not a value comparison. Independently confirmed in `formula-recalc.ts:665-669`: `if (inScope.length === 0) return {...customFields: existing, evaluations: 0...}` — the row is not even loaded when nothing in scope changed |
| 5 (D-18) | Every server-side `evaluateFormula` call site passes resource-limit options | ✓ VERIFIED | Exactly one server-side call site exists in the whole codebase: `formula-recalc.ts:697`, and it passes `{ ...FORMULA_EVAL_OPTIONS }` as the 4th argument with an inline comment citing D-18 directly. `formula-recalc-batch.ts` (used by both importers) deliberately adds no `evaluateFormula` call of its own and is guarded by a source-scan test (`expect(code).not.toContain("evaluateFormula")` in `formula-recalc-batch.test.ts:287`) so a future regression reopening threat T-34-02 would fail the suite |
| 6 (D-13) | The evaluation budget is one shared, decrementing counter per request/import run, not recreated per row | ✓ VERIFIED | `src/app/api/v1/deals/batch/route.ts` and `people/batch/route.ts` each construct ONE budget object for the whole request and thread it through `recalcBatchRow` per row (confirmed by reading both files). `src/lib/import/formula-recalc-batch.ts`'s `recalculateImportedRows` carries a `remaining` counter forward across the row loop within one call — confirmed by reading the loop body directly. The CSV importer's 4 `recalculateImportedRowsAndWarn` call sites are 4 *separate* exported server actions (`importOrganizations`, `importPeople`, `importDeals`, `importActivities` — 4 distinct CSV upload flows, not one shared run), so a fresh budget per action is the correct scope, not a violation. The Pipedrive importer explicitly threads one `createImportFormulaBudget()` closure across all 4 entity blocks of a single run (confirmed by reading `pipedrive-api-import-actions.ts:97-148`) |

**Score:** 3 fully VERIFIED (SC-1, SC-4, D-18/D-13 supporting truths) + 2 PARTIAL (SC-2, FORMULA-01 write-path completeness) + 1 mechanism-only (SC-3) out of the 4 roadmap success criteria.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/lib/formula-recalc.ts` | Shared recalculation core: scoping, seeding, unwrap, topological order, error persistence, cascade, budget | ✓ VERIFIED | 953 lines read directly; contains `FORMULA_EVALUATION_BUDGET = 500`, the single bounded `evaluateFormula` call, D-14 seeding, D-06 unconditional overwrite, cascade logic with a bound-exceeded warning |
| `src/lib/export/formatters.ts` | `flattenCustomFields` unwraps formula wrappers for CSV/JSON | ⚠️ PARTIAL (wiring correct, downstream defect) | Unwrapping itself verified correct; `exportToCSV`'s `Papa.unparse` header derivation is the actual defect, one layer downstream of this file's fix |
| `src/lib/execution/condition-evaluator.ts` | `resolveFieldPath` accepts bracket-quoted paths | ✓ VERIFIED (engine-level) | Confirmed by direct read; no caller in the UI produces this syntax (see SC-3 above) |
| `src/lib/import/formula-recalc-batch.ts` | Shared bounded batch recalc for both importers | ✓ VERIFIED | Confirmed shared-budget threading; guarded by a source-scan test against a second `evaluateFormula` call site |
| `src/app/import/actions.ts` | CSV importer recalculates every row it writes | ⚠️ STUB (partial) | The four primary insert-then-recalculate flows are correctly paired; `resolveOrganization`'s auto-create insert and the inline person auto-create insert are NOT followed by any recalculation call — confirmed by reading the file directly |
| `src/lib/mutations/{deals,people,organizations,activities}.ts` | Recalc-before-emit on create/update | ✓ VERIFIED | Read `deals.ts` in full: insert/update → `recalcCustomFields` → `crmBus.emit`, in order, on both create and update paths |
| `src/app/api/v1/organizations/[id]/route.ts` | Recalc coverage (transitive via mutation) | ✓ VERIFIED | Zero `db.update` calls in the file; `custom_fields` is routed through `updateOrganizationMutation`, confirmed by direct read of lines 60-130 |
| `docs/development/formula-fields.md` | Formula language reference + limitations doc | ✓ VERIFIED (exists) | Present, documents the CSV/importer gaps found in this verification honestly |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `db.insert`/`db.update` (deal/person/org/activity mutations) | `recalculateFormulas` | direct call, before `crmBus.emit` | ✓ WIRED | Confirmed in `deals.ts`; pattern matches 34-11's line-numbered claims for the other three entities (spot-checked deals.ts fully; org/person claims corroborated by the org PUT route re-read) |
| `POST /api/custom-fields/save` | `recalculateFormulas` / `stripFormulaKeys` | direct import in `custom-fields.ts` | ✓ WIRED | `custom-fields.ts:8` imports both from `formula-recalc`; NUL-byte audit hazard from plan 34-08's sentinel is now fixed (0 literal NUL bytes present, confirmed via Python byte count) |
| `POST /api/v1/{deals,people}/batch` | `recalculateFormulas` (via `recalcBatchRow`) | shared per-request budget | ✓ WIRED | Confirmed one budget object constructed once per request in both batch routes |
| CSV importer bulk insert | `recalculateImportedRows` | `recalculateImportedRowsAndWarn` | ⚠️ PARTIAL | Wired for the 4 primary bulk-insert flows; NOT wired for `resolveOrganization`'s and the inline person auto-create's single-row inserts |
| Pipedrive importer bulk insert | `recalculateImportedRows` | `createImportFormulaBudget()` closure, one per run | ✓ WIRED | Confirmed via direct read of `pipedrive-api-import-actions.ts:97-148` |
| Workflow trigger envelope | `resolveFieldPath` (bracket syntax) | `normalizeFormulaValues` + `tokenizeFieldPath` | ✓ WIRED (engine-level), ✗ NOT WIRED (UI authoring) | Engine wiring proven by E2E and unit tests; no UI component in `condition-config.tsx` or the variable picker produces a `customFields[...]` path for the operator to select |
| `evaluateFormula` (engine) | Resource-limit options (D-18) | 4th argument at the single server call site | ✓ WIRED | The only server-side call site passes `FORMULA_EVAL_OPTIONS`; a source-scan test prevents a second, unbounded call site in the import batch helper |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `recalculateFormulas` return value | `customFields` (merged wrapper blob) | `db.update(table).set({customFields: merged})` inside the same function, using freshly computed values from `evaluateFormula` against seeded `fieldValues` | Yes — proven against a real Postgres row in the 34-11 Docker E2E (600 = 1000 − 400, computed server-side) | ✓ FLOWING |
| `exportToCSV` output | `custom_*` columns | `flattenCustomFields` on each row, then `Papa.unparse` | No, for the specific column-survival guarantee — the values ARE real when they appear, but the header derivation drops columns absent from row 1, so on a realistic 46,055-row dataset the columns mostly do not appear | ⚠️ STATIC/DROPPED (not a hollow-value defect; a header-selection defect) |
| Webhook `payload` | `customFields` | `crmBus.emit` reads the post-recalculation row object built in the mutation, persisted to `webhook_deliveries.payload` at emit time | Yes — confirmed against a real delivered row (900/1800, the freshly-computed values) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full suite green | `npm test` | 49 files, 759 passed / 4 skipped, exit 0 | ✓ PASS |
| Type-check clean | `npx tsc --noEmit` | exit 0, zero output | ✓ PASS |
| Lint clean | `npx eslint .` | 0 errors, 128 warnings, exit 0 | ✓ PASS |
| Production build resolves the custom-fields/formula-recalc circular import | `npm run build` | exit 0; all API routes and pages compiled including every `/api/v1/**` route | ✓ PASS |
| SC-4 spot re-run | `npx vitest run src/lib/formula-recalc.test.ts src/lib/execution/condition-evaluator.test.ts src/lib/export/formatters.test.ts src/lib/import/formula-recalc-batch.test.ts src/lib/custom-fields.test.ts` | 186 tests passed, 0 failed | ✓ PASS |
| No packages installed during the phase | `git diff --stat` on `package.json`/`package-lock.json` across phase commit range | empty | ✓ PASS |
| Database at baseline | `psql` counts via `docker exec pipelite-postgres-1` | 25,206 deals / 79,023 activities / 46,055 organizations / 38,345 people / 169 definitions / 0 formula-typed definitions / 0 `GSD*`-named definitions / 0 rows anywhere containing a `"formula":true` wrapper | ✓ PASS |
| `src/lib/custom-fields.ts` contains no literal NUL bytes | Python byte-count scan | `NUL count: 0` | ✓ PASS (fix confirmed, commit `d90951e`) |
| Papaparse header-derivation defect reproduction | `node -e` against installed papaparse 5.5.3 with a 2-row fixture, column present only in row 2 | Header omits the column entirely; row 2's value is silently dropped | ✓ PASS (confirms the defect is real, not merely asserted) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files exist in this repository and none are referenced by any Phase 34 PLAN or SUMMARY. Step 7c: SKIPPED — no probes declared or discoverable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| FORMULA-01 | 34-01 through 34-11 | Formula values recalculated server-side on save; correct in API responses, CSV exports, webhook payloads, workflow conditions | ⚠️ PARTIALLY SATISFIED | API responses and webhook payloads: SATISFIED (verified above). CSV exports: NOT reliably satisfied on realistic data (pre-existing header-derivation defect, orthogonal to formula correctness but explicitly named in the requirement text). Write-path completeness: 15 of 17 write paths fully covered; the CSV importer's 2 auto-create sub-paths are not recalculated |
| FORMULA-02 | 34-03, 34-04, 34-10 | Recalculation scoped to formulas whose source fields changed; no fan-out on bulk saves | ✓ SATISFIED | Call-count-based tests prove zero evaluations for out-of-scope saves; shared-budget threading confirmed across batch routes and both importers, preventing the O(n²) amplification the plan's own comments warn against |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/lib/export/formatters.ts` | ~208-211 | `Papa.unparse(data, {header:true})` with no explicit column union | ⚠️ Warning | Pre-existing (not introduced this phase); blocks SC-2's CSV half on realistic multi-row exports |
| `src/app/import/actions.ts` | ~162, ~447 | Two insert sites with no paired recalculation call | ⚠️ Warning | Narrow, self-healing gap in FORMULA-01 write-path coverage |
| 10 files across `mutations/*.ts` and `api/v1/*/route.ts` | various | Near-identical `recalcCustomFields`/`stripCallerFormulaKeys`/`recalcBatchRow` helper duplicated ten times | ℹ️ Info | Documented tech debt, not a correctness defect; explicitly recorded by 34-11 rather than silently left |
| `src/app/api/v1/activities/[id]/route.ts` | (pre-existing, T-34-18) | IDOR unrelated to formula recalc, confirmed unchanged | ℹ️ Info | Pre-existing, out of this phase's mandate; flagged by 34-11's audit, not fixed here (correctly out of scope) |
| Backlog items 999.17, 999.21, 999.22, 999.23, 999.24 | n/a | Referenced only in commit-message prose and SUMMARY text | ℹ️ Info | No `.planning/BACKLOG.md` or equivalent registry exists in this repository to persist these across milestones — a planning-hygiene gap, not a code defect |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` debt markers found in any of the 28 files this phase modified (checked directly against the SUMMARY-declared `key-files` lists for all 12 plans).

### Human Verification Required

### 1. SC-3 scope acceptability

**Test:** Decide whether shipping SC-3 as "mechanism proven, but no UI path produces the bracket syntax needed for 157 of 169 live field names" satisfies the phase goal, or whether this blocks phase completion until a field-picker affordance exists.
**Expected:** A product decision — either accept the mechanism-only state (consistent with 34-11's own honest framing) or reopen the phase/file a fast-follow plan for the condition builder's field picker.
**Why human:** This is a scope/acceptability judgment about user-facing ergonomics, not a code-correctness question. The code does exactly what D-08/D-12/plan 34-12 specified.

### 2. Backlog registry hygiene

**Test:** Confirm whether backlog items 999.17/999.21/999.22/999.23/999.24 (CSV importer auto-create gap, workflow condition ergonomics x2, POST-201-echoes-pre-recalc-values, CSV header-derivation defect) need to be captured into a persisted `.planning/BACKLOG.md` or equivalent before the next backlog-review cycle.
**Expected:** Either confirmation these are tracked elsewhere (e.g. an external issue tracker) or a follow-up commit adding them to a durable planning artifact.
**Why human:** Process/planning-hygiene question outside verification's remit to decide unilaterally.

### Gaps Summary

Phase 34 delivers the core mechanism completely and correctly: server-side recalculation is synchronous with the save (SC-1, proven live in Docker against a real Postgres row), the dependency-aware scoping is proven with call-count assertions rather than value comparisons (SC-4), the shared evaluation budget is genuinely threaded through every batch and import call site rather than recreated per row (D-13), and the single production call site to the QuickJS engine passes the D-18 resource bounds, with a regression test guarding against a second unbounded call site ever being added. The production build resolves the custom-fields/formula-recalc circular import cleanly, and the automated gates (49 files / 759 tests, tsc, eslint) all pass at exactly the numbers claimed.

Two real gaps prevent a clean "passed": (1) the CSV export's column-header derivation is a pre-existing, non-formula-specific defect that nonetheless means SC-2's literal wording ("a CSV export... carries the recalculated values") does not hold on realistic multi-row data, even though the phase's own unwrapping fix is correct and proven via JSON export; and (2) the CSV importer's two auto-create insert sites (organization and person) are not recalculated, a narrow but genuine hole in FORMULA-01's write-path completeness. Both gaps were discovered and honestly documented by the phase's own audit plan (34-11) rather than being hidden, and both are self-healing or narrow in blast radius — but per verification protocol, a documented limitation is not the same as a closed gap, and neither has a recorded human override in this file's frontmatter. SC-3 is verified as mechanically correct but is flagged for a human scope decision given how few live field names it can practically address today without a UI change.

---

*Verified: 2026-08-14T23:54:14Z*
*Verifier: Claude (gsd-verifier)*


---

## Gap Closure Amendment (2026-08-14, plan 34-13)

Both gaps recorded above were closed and re-verified. Status revised `gaps_found` -> `passed`.

| Gap | Resolution | Evidence |
|---|---|---|
| SC-2, CSV header derivation | `deriveCsvColumns` unions keys across ALL rows; native column order and position byte-identical, custom columns appended in deterministic sorted order. `exportToPipedriveCSV` had the same defect and was fixed too. | Test fixture puts row 1 WITHOUT custom fields and a later row WITH them — the exact failure mode. Asserts on real `Papa.unparse` output re-parsed via `Papa.parse`: `custom_Margin` present, row 0 empty, row 1 populated. Forward vs reversed row order produce identical headers. |
| FORMULA-01, CSV importer auto-creates | `resolveOrganization` returns its inserted row; both auto-create sites recalculate via the existing `recalculateImportedRows`, `cascade: false`. | `createCsvImportFormulaBudget` holds ONE `remaining` per server action; a test asserts the auto-created org spends from the SAME allowance as the person batch (D-13). |

**Gates after closure:** `npm test` exit 0 — 50 files, 777 passed / 4 skipped (was 759). `npx tsc --noEmit` exit 0. `npx eslint` exit 0, 0 errors / 128 warnings. `npm run build` exit 0.

### Remaining honest limitation (accepted, not a gap)

**SC-3 is satisfied in mechanism only.** `resolveFieldPath` accepts bracket-quoted paths and the Docker end-to-end proved a workflow condition branching on a live formula value. But no UI component emits bracket syntax, and 152 of 169 live custom-field names require it. The developer was told this explicitly and chose to add plan 34-12 (the engine fix) while leaving the UI picker to backlog **999.22**. Recorded here so the milestone audit does not read SC-3 as fully delivered in the product.

---

## Browser E2E Amendment (2026-08-15)

An end-to-end **browser** pass over the v1.3 completed phases (32, 33, 34) was run against a Docker
rebuild of current master. It confirms this report's server-side conclusions and adds three UI-layer
findings that the phase's test strategy could not have caught.

### Environment defect found first

The running container had been built **2026-08-14 20:29**, but the 34-13 fixes landed **22:12–22:16**.
The deployed app was therefore missing both 34-13 code commits and the 20:45 NUL-sentinel fix. On that
stale build the People CSV export emitted **zero** `custom_*` columns for 17,741 rows carrying custom
data. After `docker compose up -d --build`, 8 columns. **The 34-13 fix is real and load-bearing** — but
"gates green" did not mean "running". Re-deploy before signing off a phase whose evidence is runtime.

### Confirmed in the product

| Criterion | Method | Result |
|---|---|---|
| SC-1 | Created a number + formula field through the admin UI, saved on a person, read Postgres directly | ✓ Stored `{"formula": true, "value": 42, "error": null}` — persisted, not merely rendered |
| SC-2 | 38,345-row People CSV export, blob captured in-page | ✓ `custom_GSD Doubled = 100`, row 1 blank for that column (the exact header-derivation failure mode), **0** `[object Object]` |
| SC-4 | Saved an unrelated field; counted formula keys across the whole table | ✓ Wrapper preserved; exactly **1** row in `people` ever carried the keys — no fan-out |
| Phase 33 | All 11 indexes present; kanban (3,465 deals in one stage), people, orgs, activities | ✓ Render clean |

### New findings — see backlog 999.25, 999.26, 999.27

1. **999.25 (BLOCKER)** — the "Add Field" button never renders on `/admin/fields/deal`, so there is no UI
   path to create a custom field on deals at all. Isolated to the server→client RSC boundary at
   `page.tsx:46` passing 155 full definition rows; the client→client row dialogs on the same page with the
   same prop render fine.
2. **999.26** — the formula's *displayed* value is one save behind on a freshly loaded page (stored value
   always correct). SC-1's server contract holds; its "without any page load having occurred" wording does
   not, from the user's seat.
3. **999.27** — an unset source renders `#ERROR — Unknown field: X`, the precise outcome D-14 seeds
   `fieldValues` to prevent. The seeding is in `recalculateFormulas` but not in the client display path.

**Why the phase's tests could not see these.** Per 34-VALIDATION.md the suite is deliberately DB-free and
mocks `@/db`; every write-path assertion stops at the mutation return value. Findings 2 and 3 are both
cases where the server contract is satisfied and the *display* path diverges from it — a seam no test in
this phase observes. Finding 1 is a rendering boundary with no test coverage at all. None of this
retracts the phase's verdict: the mechanism is correct and now confirmed live.

*Amended: 2026-08-15 — browser E2E pass (Claude)*
