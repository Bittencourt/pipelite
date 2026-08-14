---
phase: 34-formula-reactivity
plan: 03
subsystem: formula-engine
tags: [tdd, formula, jsonb, quickjs, scoping, topological-sort, d-18, sc-4]

# Dependency graph
requires:
  - plan: 34-01
    provides: evaluateFormula's opt-in 4th options parameter (8 MiB / 500 ms bounds)
  - plan: 34-02
    provides: customFields actually persisted by the mutation layer, so recalc has a blob to merge into
provides:
  - "recalculateFormulas(input) — the D-01 single-entity core: scoping, seeding, unwrap, ordering, error persistence, JSONB write"
  - "scopeFormulasToChangedFields — the FORMULA-02/SC-4 gate (returns { inScope, formulaDefs })"
  - "buildFormulaFieldValues — D-14 null seeding + native attributes + wrapper unwrap"
  - "orderFormulaDefinitions — D-10 topological order over a full dep map, reusing detectCircularDependency"
  - "stripFormulaKeys — the T-34-04 control for every write path"
  - "ENTITY_NATIVE_ATTRIBUTES / NATIVE_ATTRIBUTE_COLUMNS / FORMULA_ENTITY_PREFIXES — the D-08 vocabulary, server-side and in one place"
  - "FORMULA_EVAL_MEMORY_LIMIT_BYTES / FORMULA_EVAL_TIMEOUT_MS — the constants every call site must pass (D-18)"
  - "isFormulaWrapper / unwrapFormulaValue / formatFormulaValueForText / sanitizeFormulaError — DB-free wrapper primitives"
affects: [34-04, 34-05, 34-06, 34-07, 34-08, 34-09, 34-10, 34-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scope-before-read: the SC-4 early return fires before any row read, evaluation or write"
    - "Seed-then-override fieldValues: native attributes, then every definition name -> null, then the stored blob unwrapped"
    - "Feed-forward chaining: each evaluated value is written back into fieldValues so the next formula in topological order reads it fresh"
    - "Wrapper primitives live in a DB-free module so CSV/webhook/trigger readers can import them without pulling the db client"

key-files:
  created:
    - src/lib/formula-recalc.ts
    - src/lib/formula-recalc.test.ts
    - src/lib/formula-helpers.test.ts
  modified:
    - src/lib/formula-helpers.ts

key-decisions:
  - "NATIVE_ATTRIBUTE_COLUMNS is the FLAT union across entity types, not a per-entity map — this keeps scopeFormulasToChangedFields' documented signature (no entityType parameter) and is safe because the per-entity maps agree wherever they overlap and a foreign entity's column names never appear in this entity's changedFields"
  - "Cycle rejection is conservative: detectCircularDependency reports true for any name that REACHES a cycle, not only names inside it, so a formula reading a cyclic formula also stores the circular error rather than a garbage value"
  - "Recalc is a second UPDATE outside any transaction (T-34-11 accepted); no tx parameter was added because it would have cost a threaded signature change across all 17 write paths for no SC-1 benefit"
  - "recalculateFormulas returns { customFields: {}, evaluations: 0 } without writing when the row cannot be resolved — defensive, since the entity could have been deleted between its write and this call"
  - "Task 1 was split into RED and GREEN commits rather than the plan's single feat commit, so the plan-level TDD gate holds for the wrapper primitives too"

patterns-established:
  - "Pattern: prove a negative with a mutation check — the D-18 assertion was verified by temporarily deleting the 4th argument and confirming 2 tests fail"

requirements-completed: [FORMULA-01, FORMULA-02]

# Metrics
duration: 14min
tasks_completed: 3
files_changed: 4
tests_added: 51
completed: 2026-08-14
---

# Phase 34 Plan 03: Single-Entity Formula Recalculation Core Summary

**`recalculateFormulas()` now recomputes one entity's in-scope formula fields correctly and provably narrowly — dependency-scoped to zero evaluations when nothing relevant changed, seeded so an unfilled field stores a blank instead of a fabricated error, chained through unwrapped wrappers in topological order, and bounded on every single call.**

## The Exported Signature (plans 34-04 through 34-10 all call this)

```ts
export async function recalculateFormulas(
  input: RecalculateFormulasInput
): Promise<RecalculateFormulasResult>

export interface RecalculateFormulasInput {
  entityType: EntityType
  entityId: string
  /** Column and/or custom-field names the caller just wrote. This is the SC-4 gate. */
  changedFields: string[]
  /** The written row, when the caller already has it from `.returning()`. Saves a read. */
  row?: Record<string, unknown> | null
  /** Prefix -> changed parent field names. Populated by the cascade in plan 34-04. */
  changedRelatedFields?: Record<string, string[]>
  /** Parent rows keyed by the FORMULA_ENTITY_PREFIXES spelling, for dot-refs. */
  relatedEntities?: Record<string, Record<string, unknown>>
  /** Per-invocation memo so a cascade issues one definition query per entity type. */
  definitionsCache?: Map<EntityType, CustomFieldDefinition[]>
}

export interface RecalculateFormulasResult {
  /** The merged blob, so the caller can emit a post-recalc payload (D-17). */
  customFields: Record<string, unknown>
  /** Evaluations actually performed. Plan 34-04 spends this against the cascade budget. */
  evaluations: number
}
```

Call it **after the entity write and strictly before `crmBus.emit(...)`**, folding `result.customFields` into the emitted payload. `changedRelatedFields` and `definitionsCache` are already accepted and honoured, so plan 34-04 adds no signature change.

Supporting exports, all from `src/lib/formula-recalc.ts`:

```ts
scopeFormulasToChangedFields({ definitions, changedFields, changedRelatedFields? })
  -> { inScope: CustomFieldDefinition[]; formulaDefs: CustomFieldDefinition[] }
buildFormulaFieldValues({ entityType, definitions, row })  -> Record<string, unknown>
orderFormulaDefinitions(formulaDefs)  -> { ordered: CustomFieldDefinition[]; cyclic: Set<string> }
stripFormulaKeys(values, definitions) -> Record<string, unknown>
ENTITY_NATIVE_ATTRIBUTES, NATIVE_ATTRIBUTE_COLUMNS, FORMULA_ENTITY_PREFIXES
FORMULA_EVAL_MEMORY_LIMIT_BYTES (8 MiB), FORMULA_EVAL_TIMEOUT_MS (500), CHANGED_FIELDS_CUSTOM_SENTINEL
```

And from `src/lib/formula-helpers.ts` (DB-free, safe for readers and the client bundle):

```ts
FORMULA_WRAPPER_KEY, FormulaWrapper, FORMULA_ERROR_MAX_LENGTH (200), FORMULA_ERROR_FALLBACK
isFormulaWrapper(value), unwrapFormulaValue(value), formatFormulaValueForText(value),
sanitizeFormulaError(message)
```

## Task Commits

1. **Task 1 RED — wrapper primitive tests** — `ae0dd11` (test)
2. **Task 1 GREEN — DB-free wrapper primitives and error sanitisation** — `78f2a65` (feat)
3. **Task 2 RED — the 42-test single-entity recalculation suite** — `7a80619` (test)
4. **Task 3 GREEN — recalculateFormulas core** — `1ae956a` (feat)

No refactor commit: the GREEN implementation needed no cleanup pass.

## How Each Locked Decision Landed

| Decision | Implementation | Pinned by |
|---|---|---|
| **D-18** (bounds are inert unless passed) | Every `evaluateFormula` call passes `{ memoryLimitBytes, timeoutMs }` from one shared `FORMULA_EVAL_OPTIONS` const | Two tests: the first call's `mock.calls[0][3]`, and a loop asserting **every** call carries it |
| **D-14** (seed nulls) | `buildFormulaFieldValues` writes `null` for every active definition name before overlaying the stored blob | A formula over a defined-but-unfilled field stores `error: null`, asserted exactly |
| **D-10** (chaining) | Wrappers unwrapped into `fieldValues`; topological order; each result fed forward; `detectCircularDependency` reused over a **full** multi-entry dep map | Order asserted via `mock.calls[0][0]` / `[1][0]`; `Doubled` = 2 x freshly computed `Margin`; self-reference and two-hop cycle both error |
| **D-05 / D-06** | Errors sanitised and stored as `{formula:true,value:null,error}`; formula keys overwritten unconditionally; helper resolves, never rejects | A prior stored `999` is asserted **replaced** by the error wrapper |
| **D-08** | `FORMULA_ENTITY_PREFIXES` = `Organization`/`Person`/`Deal` only; four native-attribute maps extracted server-side, activity gaining `Title`/`Notes`/`DueDate`/`CompletedAt` | Exact `toEqual` on the prefix map plus an explicit "no `Org` alias" assertion |
| **D-15** | Arrays pass through unchanged; documented in the `buildFormulaFieldValues` doc comment with the `TEXT.concat` workaround | `["Outbound Manual"] + 1` pinned as `"Outbound Manual1"` |
| **T-34-04** | `stripFormulaKeys` exported for plans 34-07 through 34-10 | Removes formula keys, preserves unknown keys, does not mutate the input |
| **T-34-06** | `sanitizeFormulaError`: first line only, 200-char cap, fallback for empty/null/undefined | Multi-line 400-char message stored with no newline, no `at foo`, length <= 201 |

## SC-4 Is Proven by Call Count, Not by Values

The suite carries **15 `toHaveBeenCalledTimes(0)` assertions**. The five that matter most:

- a formula referencing `Price`/`Cost` when only `notes` changed — 0 evaluations **and** `db.update` never called
- a **ten-field bulk save** touching nothing any formula reads — 0
- no formula-typed definitions at all, with a non-empty `changedFields` — 0
- `Doubled = {{Value}} * 2` when `title` changed (native-attribute discrimination) — 0
- the `customFields` sentinel against a purely native-attribute formula — 0

The early return fires **before** the row read, so a test also asserts `db.select` is never called when nothing is in scope.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run src/lib/formula-recalc.test.ts src/lib/formula-helpers.test.ts src/lib/formula-engine.test.ts` | exit 0 — **118 passed** (42 + 9 + 67) |
| `npm test` | exit 0 — 43 files, **536 passed / 4 skipped** (baseline 485/4; +51 = exactly the new tests) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | exit 0 — **0 errors**, 128 warnings (unchanged pre-existing baseline) |
| `git diff --name-only -- src/lib/formula-engine.ts` | **empty** — the engine was not touched; Phase 32's H-01 per-reference carve-out and its regression tests are intact (67/67) |
| `git diff HEAD --stat -- package.json package-lock.json` | **empty** — zero new dependencies (T-34-SC) |
| Ten required exports present, no `Org` alias | `exports OK` |
| `detectCircularDependency` reused, not reimplemented | 2 non-comment occurrences |
| `formula-helpers.ts` diff | append-only, **0 removed lines**; 0 `@/db` references |

### The D-18 assertion was mutation-checked

Rather than trusting that the resource-bound test would catch an omission, I temporarily deleted the 4th argument from the single call site and re-ran the suite: **2 tests failed** (`mock.calls[0][3]` undefined). The file was restored from a scratchpad backup and the suite returned to 42/42. D-18's guard demonstrably bites, which is what the plan asked for — "a test that would fail if a call site omitted them".

### RED gates were verified to fail for the right reason

- Task 1 RED: 8 failed / 1 passed, every failure `TypeError: sanitizeFormulaError is not a function` — missing exports, not mock wiring. (The 1 pass is the source-scan guard, which must hold in both states.)
- Task 2 RED: `Cannot find module './formula-recalc'`, 0 tests collected — the expected RED state for a brand-new module. `tsc` reported only that error plus three `TS7006` implicit-`any`s that are direct consequences of the unresolved import; all four cleared in GREEN.

No infinite-loop test was written, so nothing could wedge the runner as it did in plan 34-01. Every vitest invocation was wrapped in `timeout` regardless.

## Deviations from Plan

**1. [Deviation] Task 1 was split into a RED commit and a GREEN commit**
- **Found during:** Task 1
- **Issue:** The plan specifies a single `feat(34-03)` commit for Task 1, but the task is typed `tdd` and the plan is `type: tdd`, and the executor brief requires failing tests before implementation.
- **Action:** Wrote and ran the tests first (`ae0dd11`, verified failing), then implemented (`78f2a65`). The plan's commit message is used verbatim on the GREEN commit.
- **Files modified:** none beyond the plan's list.
- **Commits:** `ae0dd11`, `78f2a65`

**2. [Rule 1 - Bug] The Test-5 source scan initially failed on my own doc comment**
- **Found during:** Task 1 GREEN
- **Issue:** Test 5 greps `formula-helpers.ts` for `/@\/db/`. My module doc comment explained *why* the module has no `@/db` import — and the literal string in the prose tripped the regex. The test was correct; the source was not.
- **Fix:** Reworded the comment to say "imports no database client" and "a database-alias import", preserving the explanation without the literal token.
- **Files modified:** `src/lib/formula-helpers.ts`
- **Commit:** `78f2a65` (fixed before the GREEN commit)
- **Note for downstream plans:** this crude source scan is the agreed guard for the module's DB-free property. Do not write the database path alias into prose in that file.

**3. [Decision] `NATIVE_ATTRIBUTE_COLUMNS` is a flat union, not a per-entity map**
- **Found during:** Task 3
- **Issue:** The plan describes `ENTITY_NATIVE_ATTRIBUTES` as per-entity attribute-to-column and `NATIVE_ATTRIBUTE_COLUMNS` as "derived from the above — attribute name to column name". Taken per-entity the two constants would be structurally identical, and `scopeFormulasToChangedFields`'s documented signature has no `entityType` parameter to index one with.
- **Resolution:** `NATIVE_ATTRIBUTE_COLUMNS` is the flat union across all four entity types, derived programmatically from `ENTITY_NATIVE_ATTRIBUTES` (the single source of truth). Safe because the per-entity maps agree wherever they overlap (`Notes -> notes`, `Title -> title`) and another entity's column names can never appear in this entity's `changedFields`. Documented in the constant's doc comment.

No Rule 4 (architectural) deviations. No packages installed. No database row read or written — the suite is DB-free via `vi.mock("@/db")`.

## Known Limitations (deliberate, not defects)

- **No cross-entity cascade yet.** `changedRelatedFields` and `relatedEntities` are honoured for *scoping and evaluation* of dot-refs, but nothing here looks up child rows or spends an evaluation budget. That is plan 34-04.
- **Nothing calls `recalculateFormulas` yet.** Plans 34-06 through 34-10 wire the 17 write paths; until then the helper is exercised only by its tests. `stripFormulaKeys` is likewise exported but not yet applied, so T-34-04 remains open exactly as plan 34-02 recorded.
- **A custom field named exactly like a native attribute** (e.g. a custom field called `Notes`) is not selected by the coarse `customFields` sentinel, because the ref resolves as a native attribute first. No such collision exists in the live 169 definitions.
- **`DATE.today()`-style formulas remain non-deterministic** (Pitfall 10) — correct at save time, stale the next day. CONTEXT.md defers scheduled/read-time recalculation.

## Threat Model Coverage

| Threat | Disposition | Status |
|---|---|---|
| T-34-01 EoP — host bindings in the sandbox | mitigate | Honoured. Only JSON-serialisable data reaches `fieldValues`/`relatedEntities`; no `vm.newFunction` callback added, `FORMULA_FUNCTIONS` untouched. |
| T-34-02 DoS — unbounded CPU | mitigate | **Now active at the only server-side call site.** Bounds passed on every call, asserted by two tests and mutation-checked. Cycles are rejected before evaluation, so a self-reference cannot recurse. |
| T-34-04 Tampering — client-set formula keys | mitigate | `stripFormulaKeys` delivered and tested; application to write paths is plans 34-07..34-10. |
| T-34-06 Info disclosure — error strings | mitigate | `sanitizeFormulaError` applied to both the engine's returned error and the outer catch. |
| T-34-10 DoS — definition lookup | accept | One query per invocation, memoised per cascade via `definitionsCache`. No module-level cache. |
| T-34-11 Tampering — write ordering | accept | Recorded in the module doc comment: recalc is a second UPDATE outside any transaction; self-healing on the next save. |
| T-34-SC Tampering — npm installs | accept | Zero packages; `package.json`/`package-lock.json` diff empty. |

**Threat surface scan:** no new endpoint, auth path, file access, or schema change. The one new write is an `UPDATE ... SET custom_fields` on an existing column, keyed by primary key through a parameterised Drizzle `eq`. Nothing to flag.

## Known Stubs

None. No placeholder values, hardcoded empties feeding UI, or TODO/FIXME markers were introduced.

## Next Phase Readiness

- **Plan 34-04 (cascade) is unblocked.** Build on `changedRelatedFields`, `relatedEntities` and `definitionsCache` — all three already accepted and honoured. `result.evaluations` is the counter to spend against the 500-evaluation budget (0.876 ms/eval in-container, so 500 ~ 438 ms).
- **Plan 34-05 (readers) is unblocked.** Import `formatFormulaValueForText` / `unwrapFormulaValue` from `@/lib/formula-helpers`; it stays free of the db client by test, so `flattenCustomFields` and the trigger envelope can use it safely.
- **Plans 34-06..34-10 (write paths):** call `recalculateFormulas` after the write and before the emit, fold `customFields` into the payload, and apply `stripFormulaKeys` to client-supplied values. The v1 routes already push the `"customFields"` sentinel, which the scoping honours as a safety net.
- **Still open from 34-02's handoff:** the redundant `custom_fields` merge at `src/app/api/v1/organizations/[id]/route.ts:120-130`, owned by plan 34-07. Untouched here.
- `.planning/STATE.md` was intentionally not modified — Phase 34's wave bookkeeping is being maintained by the orchestrator (`2606c90`), and plans 34-01/34-02 likewise left it alone.

## Self-Check: PASSED

Files verified present on disk:
- `src/lib/formula-recalc.ts` — FOUND (535 lines, min_lines 200)
- `src/lib/formula-recalc.test.ts` — FOUND (841 lines, 42 tests, min_lines 200)
- `src/lib/formula-helpers.test.ts` — FOUND (9 tests)
- `src/lib/formula-helpers.ts` — FOUND, append-only

Commits verified in `git log`:
- `ae0dd11` — FOUND
- `78f2a65` — FOUND
- `7a80619` — FOUND
- `1ae956a` — FOUND

RED-before-GREEN ordering verified for both TDD pairs: `ae0dd11` precedes `78f2a65`; `7a80619` precedes `1ae956a`.
No file deletions in any of the four commits (`git diff --diff-filter=D` empty for each).
No untracked files left behind (`git status --porcelain -uall` clean).

## TDD Gate Compliance

Gate sequence satisfied twice. Wrapper primitives: `test(34-03)` `ae0dd11` (verified failing, 8 failures) -> `feat(34-03)` `78f2a65` (9/9 pass). Recalculation core: `test(34-03)` `7a80619` (verified failing, module unresolved, 0 tests collected) -> `feat(34-03)` `1ae956a` (42/42 pass). No REFACTOR gate needed in either case.

---
*Phase: 34-formula-reactivity*
*Completed: 2026-08-14*
