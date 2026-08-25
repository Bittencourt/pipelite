---
phase: 34-formula-reactivity
plan: 13
subsystem: export
tags: [tdd, gap-closure, papaparse, csv, export, import, budget, sc-2, formula-01, d-03, d-08, d-10, d-13, d-18, t-34-03]

# Dependency graph
requires:
  - plan: 34-05
    provides: "flattenCustomFields / formatFormulaValueForText — the unwrapping whose value this plan finally gets into the CSV file, and the assert-on-real-Papa.unparse-output test idiom reused here"
  - plan: 34-10
    provides: "recalculateImportedRows — the bounded, cascade-free, failure-isolated batch helper reused verbatim for the auto-created rows, and the run-level budget closure pattern"
  - plan: 34-11
    provides: "The audit that measured both gaps: 46,055 rows / 30,264 populated / zero custom_* columns, and the two unrecalculated insert sites read from source"
provides:
  - "deriveCsvColumns — union-of-keys CSV header derivation, natives in first-seen order, customs sorted; used by exportToCSV AND exportToPipedriveCSV"
  - "SC-2's CSV half: a custom column populated by ANY row survives to the file, regardless of row order"
  - "createCsvImportFormulaBudget — ONE decrementing evaluation allowance per CSV import action, shared by the primary batch and both auto-create sites"
  - "FORMULA-01 write-path completeness: 17 of 17 paths now recalculate; the two CSV-importer auto-create sub-paths are closed"
  - "src/app/import/actions.ts's first test file — 11 DB-free tests over a 634-line server-action module"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derive the CSV header from the union of all rows, never from row 1 — papaparse's `header: true` default is a data-loss primitive on heterogeneous rows"
    - "Deterministic column ordering by UTF-16 code unit, not localeCompare: field names carry diacritics and localeCompare's result depends on the ambient ICU locale"
    - "A budget closure per unit of user-initiated work, threaded through every call site inside it — the same shape plan 34-10 gave the Pipedrive importer, now needed by the CSV importer because one action recalculates more than one batch"

key-files:
  created:
    - src/lib/export/csv-columns.ts
    - src/app/import/actions.test.ts
  modified:
    - src/lib/export/formatters.ts
    - src/lib/export/formatters.test.ts
    - src/lib/export/pipedrive.ts
    - src/app/import/actions.ts

key-decisions:
  - "deriveCsvColumns lives in its own dependency-free module rather than in formatters.ts: pipedrive.ts needs it and formatters.ts already imports pipedrive.ts, so defining it there would make the two mutually importing — and formatters.ts pulls the drizzle client in at module scope. formatters.ts re-exports it so the public surface is unchanged"
  - "exportToPipedriveCSV was fixed too, beyond the stated scope: it calls Papa.unparse with the identical `header: true` default on the identical data, so it was losing the identical columns. Fixing one and not the other would have left half the export surface silently dropping custom fields"
  - "Custom columns are sorted by UTF-16 code unit, not localeCompare — 169 live field names include `Consumo Médio em MWh`, and a locale-sensitive sort is not reproducible across environments"
  - "Auto-created PARENTS are recalculated before the child batch: a child formula may reference a parent field (D-08) including a parent formula field (D-10), so the parent must hold its computed value first"
  - "loadImportDefinitions and recalculateImportedRowsAndWarn were folded into one per-action budget closure rather than adding a third helper — an action now recalculates up to three batches, and three helpers each defaulting the budget is exactly the bound-multiplication D-13 forbids"

requirements-completed: [FORMULA-01]

# Metrics
duration: 13min
tasks_completed: 2
files_changed: 6
tests_added: 18
completed: 2026-08-15
---

# Phase 34 Plan 13: Verification Gap Closure Summary

**The two gaps `34-VERIFICATION.md` recorded as `partial` are closed: a CSV export now carries every custom column any row populates rather than only those row 1 happened to hold, and the CSV importer's two auto-created row types are recalculated out of the same evaluation allowance as the rows the user uploaded.**

---

## Gap A — SC-2: the CSV header was derived from row 1 alone

### The defect, reproduced before it was fixed

```
$ node -e "Papa.unparse([{id:'1',title:'A'},{id:'2',title:'B',custom_M:600}],{header:true})"
"id,title\r\n1,A\r\n2,B"          <- custom_M is gone, for every row
```

That is the whole bug. `Papa.unparse(data, { header: true })` reads the key set off the
**first object only**. On the live dataset the first exported organization happened to carry
no custom fields, so a **46,055-row export emitted zero `custom_*` columns while 30,264 of
those rows held values**. Every user exporting their CRM was losing all custom fields unless
row 1 populated them.

### The fix

`deriveCsvColumns(rows)` walks **every** row and returns:

| Segment | Order | Why |
|---|---|---|
| Non-`custom_` keys | first-seen | This is exactly the order the `flatten*` functions have always emitted. Same columns, same positions — an export's column order is a user-visible contract |
| `custom_` keys | sorted, UTF-16 code units | Without a sort the order would depend on which row was serialised first and on JSONB key insertion order, so two exports of the same data could differ. `localeCompare` was rejected: 169 live field names include diacritics (`Consumo Médio em MWh`) and its result depends on the ambient ICU locale |

The list is passed to `Papa.unparse` as `columns`. An empty dataset falls back to the old call
because papaparse throws `Option columns is empty` on `columns: []` — verified against the
installed 5.5.3, not assumed.

**`exportToPipedriveCSV` got the same treatment.** It calls `Papa.unparse` with the identical
default over the identical data and `toPipedriveFormat` copies only the `custom_` keys a given
row actually holds, so it was dropping the identical columns. Fixing one export path and
leaving the other would have closed half of a defect.

### Why the tests could not have passed by accident

Every fixture puts **row 1 WITHOUT custom fields and a later row WITH them**. The reverse
ordering passes against the broken code and proves nothing, which is precisely how this defect
survived plan 34-05's suite — its fixtures all had the custom field on row 1.

Assertions are on the **real `Papa.unparse` output string, re-parsed with `Papa.parse`**, so
they read the actual cell rather than a substring coincidence (the idiom 34-05 established).

The RED run failed 4 of the 7 new tests, each with `expected [...] to include 'custom_Margin'`
— the column absent from the header entirely, exactly the predicted failure. Three of the seven
are guards that had to keep passing (native ordering, empty dataset, Pipedrive native mapping).

| Test | Entity | Asserts |
|---|---|---|
| custom column from a LATER row | organization | header contains it; row 2's cell is `1035`; row 1's cell is `""` (empty, not missing) |
| union across different rows | deal | `custom_Alpha` and `custom_Zeta` both present, each carrying its own row's value including `#ERROR: …` |
| native order and position | deal | `headers.slice(0, n)` deep-equals `Object.keys(flattenDeal(row, false))`; nothing interleaved |
| deterministic custom order | deal | rows fed forward and reversed produce the identical `["custom_Alpha","custom_Mid","custom_Zeta"]` |
| empty dataset | — | still `""`, no papaparse throw |
| Pipedrive: later-row column | deal | header contains it; value survives |
| Pipedrive: native mapping order | deal | mapping order and position unchanged |

---

## Gap B — FORMULA-01: the CSV importer's auto-created rows

### What was uncovered

`resolveOrganization` inserts an organization with a real `name` and `notes`; `importDeals`
inserts a person with a real `firstName`, `lastName`, `email` and `notes`. Both are rows the
importer **invents**, both carry native attributes a formula reads, and neither was ever handed
to `recalculateImportedRows`. They stored nothing until their next real save.

### The fix, and the constraint that shaped it

`resolveOrganization` now returns `{ id, autoCreated, row? }` — the inserted row, not just its
id, so the recalculation needs no re-read. Both call sites collect those rows; `importDeals`
collects its auto-created people the same way (that insert already had `.returning()`).

**The budget is the load-bearing part.** `recalculateFormulas` builds a fresh internal
allowance on every invocation, so three call sites each defaulting to
`FORMULA_EVALUATION_BUDGET` would be 1,500 evaluations per import — the bound multiplied by the
number of call sites, which is the exact failure D-13/T-34-03 exist to prevent.
`createCsvImportFormulaBudget(warnings)` therefore holds `remaining` for the whole server
action:

```
importDeals, 2 rows, 2 auto-created orgs + 2 auto-created people:
  recalculate("organization", 2 rows)  budget: 500  -> spends 20 -> remaining 480
  recalculate("person",       2 rows)  budget: 480  -> spends 20 -> remaining 460
  recalculate("deal",         2 rows)  budget: 460  -> spends 20 -> remaining 440
```

That ladder is asserted arithmetically (`budget[i] === 500 - Σ spent before i`), plus a
strictly-decreasing check with a distinct-values assertion so a reset to the full bound
part-way through cannot pass.

**Ordering is parents-first**, and deliberately so: a child formula may reference a parent field
(D-08) including a parent formula field (D-10), so the organization must hold its computed value
before the people and deals pointing at it compute theirs. Two tests pin the order, each first
asserting both entity types are present so `indexOf(-1)` cannot make the comparison vacuous —
the RED run caught exactly that weakness and both tests were strengthened before the RED commit.

### The locked decisions, honoured by reuse rather than reimplementation

| Decision | How it holds |
|---|---|
| **D-03** `cascade: false` | Inherited: `recalculateImportedRows` hardcodes it and `RecalculateImportedRowsInput` has no `cascade` field. A test asserts every call from `actions.ts` passes **no** `cascade` key, so the helper's guarantee cannot be overridden from here. The helper's own suite loops every `recalculateFormulas` call and asserts `cascade === false` |
| **D-13** one shared budget | The ladder assertions above |
| **D-18** bounded evaluation | **Verified by reading `formula-recalc.ts`, not assumed**: exactly one server-side `evaluateFormula` call site exists, at `:697`, and it passes `{ ...FORMULA_EVAL_OPTIONS }` as the 4th argument. This plan adds no second path — a source-scan test asserts `actions.ts` contains neither `evaluateFormula` nor `recalculateFormulas(` |
| **T-34-25** silent partial recalc | The shortfall sentence still lands in the action's user-visible `warnings` array, now from inside the budget closure so all three batches report through one place |
| **T-34-04** upload-injected formula keys | Untouched: all four `stripFormulaKeys` call sites are unchanged |

### Write-path inventory: 17 of 17

Row #14 of RESEARCH's table (`CSV importer`) was the last **COVERED (partial)** entry. It is
now covered in full. The audit's "one genuine gap" is closed.

---

## Task Commits

| Commit | Type | Content |
|---|---|---|
| `44c9acd` | `docs(34-13)` | `34-13-PLAN.md`, written and committed before any code |
| `83acec9` | `test(34-13)` | Gap A RED — 4 failing, each `expected [...] to include 'custom_Margin'` |
| `da0edac` | `fix(34-13)` | Gap A GREEN — `csv-columns.ts`, both CSV export paths. 16/16 pass |
| `7b4c215` | `test(34-13)` | Gap B RED — 7 failing: no org/person recalc call exists, `budget` is `undefined` |
| `89c1fa2` | `fix(34-13)` | Gap B GREEN — the per-action budget closure and both auto-create sites. 11/11 pass |

No REFACTOR commit: neither GREEN implementation needed a cleanup pass.

---

## The Four Gates

| Gate | Result | Baseline |
|---|---|---|
| `npm test` | **exit 0 — 50 files, 777 passed / 4 skipped** | 49 files, 759/4. **+1 file, +18 tests** — exactly the 7 export + 11 import tests added. Zero existing tests changed behaviour |
| `npx tsc --noEmit` | **exit 0**, zero output | — |
| `npx eslint .` | **exit 0 — 0 errors, 128 warnings** | 128 warnings, count byte-identical to baseline |
| `npm run build` | **exit 0** — compiled in 65s, all 53 static pages, every route emitted | Confirms the new `csv-columns.ts` module boundary introduces no circular-import regression |

**Zero packages installed** — `package.json` / `package-lock.json` untouched.
**Zero database rows read or written** — both suites mock `@/db` outright. No import was run
against the live 189k-row dataset and no export was run against it.

---

## Deviations from Plan

**1. [Rule 3 - Blocking] `deriveCsvColumns` moved to its own module to avoid a circular import**

- **Found during:** Task 1 GREEN, immediately after wiring `exportToPipedriveCSV`.
- **Issue:** The plan places `deriveCsvColumns` in `formatters.ts` and exports it from there.
  But `formatters.ts` already imports `toPipedriveFormat`/`exportToPipedriveCSV` from
  `pipedrive.ts`, so having `pipedrive.ts` import back from `formatters.ts` makes the two
  mutually importing — and `formatters.ts` pulls the drizzle client in at module scope. This
  codebase has already paid for one such cycle (the `custom-fields`/`formula-recalc` cycle that
  plan 34-08 had to resolve for the production build).
- **Fix:** The implementation lives in a new, import-free `src/lib/export/csv-columns.ts`.
  Both `formatters.ts` and `pipedrive.ts` import it; `formatters.ts` re-exports it so the
  public surface named in the plan is unchanged. `npm run build` exit 0 confirms no regression.
- **Files:** `src/lib/export/csv-columns.ts` (created), `formatters.ts`, `pipedrive.ts`
- **Commit:** `da0edac`

**2. [Rule 2 - Missing critical functionality] `exportToPipedriveCSV` was fixed too**

- **Found during:** Task 1, reading `pipedrive.ts` before writing the tests.
- **Issue:** The objective names `formatters.ts:211`. But `exportToPipedriveCSV` calls
  `Papa.unparse(pipedriveData, { header: true })` — the identical call, over rows produced by
  `toPipedriveFormat`, which copies only the `custom_` keys each row actually holds. It was
  dropping the identical columns from the identical data. Leaving it would have meant closing
  half of a user-facing data-loss defect while a sibling export path kept exhibiting it.
- **Fix:** Same `deriveCsvColumns` derivation, with two tests (later-row column survives;
  Pipedrive native mapping order and position unchanged).
- **Files:** `src/lib/export/pipedrive.ts`
- **Commit:** `da0edac`

**3. [Rule 2 - Missing critical functionality] Two ordering tests were strengthened before the RED commit**

- **Found during:** Task 2 RED, reading the first RED run rather than only its exit code.
- **Issue:** `expect(order.indexOf("organization")).toBeLessThan(order.indexOf("person"))`
  **passed** against the broken code — `indexOf` returns `-1` for the absent entry and `-1 < 0`.
  Two of the eleven tests were therefore vacuous and would have been committed as passing RED
  tests that assert nothing.
- **Fix:** Both now assert `expect(order).toContain(...)` for every entity type first. They
  correctly moved to failing (RED went from 5 failures to 7) and pass after the GREEN.
- **Files:** `src/app/import/actions.test.ts`
- **Commit:** `7b4c215` (strengthened before commit, so the committed RED is honest)

**4. [Deviation] `loadImportDefinitions` and `recalculateImportedRowsAndWarn` were replaced, not extended**

- **Found during:** Task 2 GREEN.
- **Issue:** Both helpers assume one recalculation per action. An action now performs up to
  three, and neither helper can thread a budget between them — extending them would have meant
  three call sites each defaulting to `FORMULA_EVALUATION_BUDGET`.
- **Action:** Folded into `createCsvImportFormulaBudget`, which owns `remaining`, the
  per-entity-type definition memoisation and the T-34-25 warning. Net −48/+108 lines in
  `actions.ts`. All four flows still recalculate; `importOrganizations` and `importActivities`
  have a regression test and full-suite coverage respectively.
- **Note:** plan 34-10's SUMMARY records an acceptance criterion counting `recalculateImportedRows`
  occurrences in `actions.ts` as `>= 4`. That criterion was prose in a completed plan, not an
  executable assertion — no test in the suite counts occurrences, and the full suite is green.
  It is superseded: the helper is now called once from one place, threading one budget, which is
  the stronger property that criterion was proxying for.

No Rule 1 (bug) beyond the two gaps themselves and no Rule 4 (architectural) deviations.

---

## Threat Model Coverage

| Threat | Disposition | Status |
|---|---|---|
| **T-34-03** DoS — import amplification | mitigate | **Strengthened.** Previously one allowance per action covering one batch; now one allowance per action covering up to three, so adding the auto-create recalculations did not raise the ceiling by a single evaluation |
| **T-34-02** DoS — unbounded CPU per evaluation | mitigate | This plan adds **no** `evaluateFormula` call site. Confirmed by reading `formula-recalc.ts:697` (the only one, and it passes `FORMULA_EVAL_OPTIONS`) and pinned by a source-scan test over `actions.ts` |
| **T-34-24** DoS — one bad row aborting an import | mitigate | Unchanged: per-row try/catch inside the reused helper. The auto-created rows inherit it |
| **T-34-25** Repudiation — silent partial recalculation | mitigate | Unchanged mechanism, now reporting for all three batches through one place |
| **T-34-04** Tampering — formula keys in an uploaded file | mitigate | All four `stripFormulaKeys` call sites untouched |
| **T-34-14** CSV formula injection | accept | Unchanged and explicitly not widened: this plan changes **which columns** appear, never how a cell is quoted or escaped. papaparse's quoting is untouched — the pre-existing punctuated-key quoting test (a key containing a comma, a quote and a newline) still passes |
| **T-34-SC** Tampering — npm installs | accept | Zero packages; both lockfile and manifest untouched |

**Threat surface scan:** no new endpoint, auth path, file access pattern or schema change. Gap
A changes an in-memory column list; Gap B adds `UPDATE ... SET custom_fields` writes keyed by
primary key through the parameterised Drizzle `eq` that `recalculateFormulas` already performed
for every other row the importer writes. Nothing to flag.

---

## Known Stubs

None. No placeholder value, hardcoded empty, mock data source or debt marker was introduced.
Both fixes are wired to real data paths and proven against real `Papa.unparse` output and real
call arguments.

---

## Known Limitations (deliberate, not defects)

- **Custom column order changes for exports where row 1 was already representative.** Before,
  custom columns appeared in row 1's JSONB key order; now they are sorted. This is the point —
  the previous order was unspecified and irreproducible — but a downstream consumer pinned to
  positional column indices rather than header names would see a different arrangement. Native
  columns, which every documented consumer uses, are unchanged in order and position.
- **A wide, sparse export gets wider.** Unioning keys means an organization export now carries
  a column for every custom field any of the 46,055 rows populates, with empty cells elsewhere.
  That is the correct trade — a present-but-empty cell is recoverable, a dropped column is not.
- **The auto-created rows spend the allowance before the primary batch.** Parents-first is
  required for correctness (D-08/D-10), so on an import that exhausts the budget the invented
  rows are recalculated and some uploaded rows are not. The shortfall is reported to the user
  and those rows self-heal on their next save, as before.
- **Gap A was pre-existing and is not formula-specific.** It affected every custom field in
  every CSV export since the feature shipped. Fixing it is what SC-2's literal wording required,
  but the phase's formula-unwrapping work was already correct — it simply could not reach the
  file.
- **SC-3's UI ergonomics gap is untouched** and remains a human scope decision, as
  `34-VERIFICATION.md` records. Out of this plan's mandate.

---

## Self-Check: PASSED

Files verified present on disk:
- `src/lib/export/csv-columns.ts` — FOUND (58 lines)
- `src/lib/export/formatters.ts` — FOUND, modified
- `src/lib/export/formatters.test.ts` — FOUND, modified (16 tests)
- `src/lib/export/pipedrive.ts` — FOUND, modified
- `src/app/import/actions.ts` — FOUND, modified
- `src/app/import/actions.test.ts` — FOUND (11 tests)
- `.planning/phases/34-formula-reactivity/34-13-PLAN.md` — FOUND

Commits verified in `git log`: `44c9acd`, `83acec9`, `da0edac`, `7b4c215`, `89c1fa2` — all five resolve.

RED-before-GREEN ordering verified in both cases: `83acec9` precedes `da0edac`; `7b4c215`
precedes `89c1fa2`.

**No file deletions in any commit** (`git diff --diff-filter=D --name-only 62f47cc..HEAD` is
empty). **No existing test weakened, skipped or deleted** — the only removed line across the
whole range in `formatters.test.ts` is the `./pipedrive` import statement, replaced by a wider
one; `git diff --numstat` reports `146 / 1` for that file and `353 / 0` for the new import test
file. `git status` clean.

Four gates re-run after the final code commit: `npm test` exit 0 (50 files, 777 passed / 4
skipped), `npx tsc --noEmit` exit 0, `npx eslint .` exit 0 with 0 errors / 128 warnings,
`npm run build` exit 0.

## TDD Gate Compliance

Gate sequence satisfied twice. Task 1 — RED `83acec9` (4 failing, verified failing for the
predicted reason), GREEN `da0edac` (16/16). Task 2 — RED `7b4c215` (7 failing, verified),
GREEN `89c1fa2` (11/11). No REFACTOR gate needed for either.

---
*Phase: 34-formula-reactivity*
*Completed: 2026-08-15*
