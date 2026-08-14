---
phase: 34-formula-reactivity
plan: 04
subsystem: formula-engine
tags: [tdd, formula, cascade, budget, cross-entity, d-03, d-04, d-09, d-13, d-18, sc-4]

# Dependency graph
requires:
  - plan: 34-01
    provides: evaluateFormula's opt-in 4th options parameter, and the 0.876 ms in-container MS_PER_EVAL the budget is sized against
  - plan: 34-03
    provides: recalculateFormulas core, scopeFormulasToChangedFields (already honouring changedRelatedFields), buildFormulaFieldValues, definitionsCache
provides:
  - "recalculateFormulas now cascades one hop: a parent save refreshes the dependent child rows whose formulas dot-reference the changed parent field"
  - "FORMULA_EVALUATION_BUDGET (500) — one shared, decrementing counter across the parent and every child"
  - "CASCADE_DEPTH (1) — enforced structurally, not by a counter"
  - "CASCADE_CHILD_RELATIONS — the four Phase 33 index-backed reverse lookups, as data"
  - "buildRelatedEntities — the first code in the repo to populate the engine's relatedEntities argument (D-08)"
  - "RecalculateFormulasInput.cascade?: boolean (default true) and .budget?: number (default 500)"
affects: [34-05, 34-06, 34-07, 34-08, 34-09, 34-10, 34-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Structural depth limiting: children are recalculated through a private recalculateOneEntity that has no cascade step, so a second hop is unreachable rather than merely unintended"
    - "Gate-before-query: the dotted-ref intersection is tested against child DEFINITIONS before any child ROW query is issued, so the common save costs zero extra queries"
    - "One shared mutable budget object threaded through the parent and every child, decremented immediately before each evaluation"
    - "Latched warning flag so a multi-relation cascade warns at most once per invocation"

key-files:
  created: []
  modified:
    - src/lib/formula-recalc.ts
    - src/lib/formula-recalc.test.ts

key-decisions:
  - "FORMULA_EVALUATION_BUDGET stays at 500 — 500 x 0.876 ms (plan 34-01's in-container measurement) = 438 ms, comfortably inside the ~2000 ms ceiling, so no downward adjustment was required"
  - "The cascade selects the FULL child row rather than the plan's { id, customFields } projection, because a child formula mixing its own native attribute with a parent ref would otherwise evaluate that attribute as null — a silent wrong answer. The Bitmap Heap Scan already reads the heap tuple, so the extra columns cost no additional IO"
  - "The parent's just-recomputed formula names are folded into the changed set, so a child reading {{Organization.Score}} refreshes when the parent's own Score formula changes. Precise, not coarse: only formulas actually recomputed are included"
  - "Ownership absence is pinned by TWO tests — a behavioural one (a child owned by someone else is still recalculated) and a source scan asserting no ownerId/owner_id token survives outside comments"
  - "The 600-row budget fixture runs 500 REAL QuickJS evaluations rather than a stub, and completes in ~600 ms"

patterns-established:
  - "Table-aware db.select stub: .from(table) records WHICH table was asked for, and .where(...) is both awaitable and .limit()-able, so one mock serves the parent row read and the cascade fan-out query while letting negatives assert 'the deals table was never queried'"

requirements-completed: [FORMULA-01, FORMULA-02]

# Metrics
duration: 22min
tasks_completed: 2
files_changed: 2
tests_added: 27
completed: 2026-08-14
---

# Phase 34 Plan 04: Bounded Depth-1 Cross-Entity Cascade Summary

**Saving a parent now refreshes the child rows whose formulas reference it — one hop, four index-backed reverse lookups, a single shared 500-evaluation budget, and zero child queries when nothing a child reads actually changed.**

## What Changed

`recalculateFormulas` split into three layers:

```
recalculateFormulas(input)                 <- public; owns the budget object and the cache
  |- recalculateOneEntity(input, budget)   <- private; ONE entity, no cascade step exists here
  '- cascadeToChildren({...})              <- private; exactly one hop, never throws
       '- recalculateOneEntity(child, budget)   <- same shared budget, so depth 2 is unreachable
```

`CASCADE_DEPTH = 1` is therefore a structural property, not a counter someone can forget to decrement: children are recalculated by a function that has no cascade in it.

New public surface on `src/lib/formula-recalc.ts`:

```ts
export const FORMULA_EVALUATION_BUDGET = 500
export const CASCADE_DEPTH = 1
export const CASCADE_CHILD_RELATIONS: readonly CascadeChildRelation[]
export function buildRelatedEntities({ parentType, parentRow, parentDefinitions })
  -> Record<string, Record<string, unknown>>

// added to RecalculateFormulasInput (both optional, both backward compatible)
cascade?: boolean   // default true; bulk importers pass false
budget?: number     // default FORMULA_EVALUATION_BUDGET; 0 or negative means ZERO, not unlimited
```

`RecalculateFormulasResult.evaluations` is now the **total including cascaded children**; `customFields` remains the saved entity's own blob, for the D-17 emit.

## Task Commits

1. **Task 1 RED — cascade, fan-out and budget tests** — `e684528` (test), verified failing: 20 failures, all confined to the new `cross-entity cascade` block plus the one 34-03 assertion this plan updates (see Deviation 1). 49 of the pre-existing tests still passed in the RED state.
2. **Task 2 GREEN — the bounded depth-1 cascade** — `1f2491c` (feat), 69/69 pass.

No REFACTOR commit: the GREEN implementation needed no cleanup pass.

## The Budget: 500, Unchanged, With the Arithmetic

The plan required cross-checking `FORMULA_EVALUATION_BUDGET` against the container-measured `MS_PER_EVAL` from `34-01-SUMMARY.md` and lowering it if `MS_PER_EVAL x 500 > 2000 ms`:

```
500 x 0.876 ms (measured in-container, plan 34-01)  =  438 ms   <- the number that matters
500 x 1.195 ms (host figure, RESEARCH)              =  598 ms
ceiling                                             = 2000 ms
```

**No adjustment was needed.** 500 stands, and the doc comment on the constant carries the full justification verbatim so a future reader cannot "optimise" it away:

- it admits the entire measured single-hop worst case (worst organization = 114 deals + 10 people = 124 rows; even 4 formulas each = 496);
- it rejects the 2-hop case (~626 evaluations, ~750 ms) by construction via `CASCADE_DEPTH`;
- a row-count cap would be strictly worse, because it does not scale with formulas per entity (200 rows x 5 formulas = 1000 evaluations would slip straight through).

## How Each Locked Decision Landed

| Decision | Implementation | Pinned by |
|---|---|---|
| **D-03** (cascade exists) | `CASCADE_CHILD_RELATIONS` — four entries, each commented with its Phase 33 index; one indexed `and(eq(fk, parentId), isNull(deletedAt))` select per affected child type | Fan-out test: 3 child rows -> exactly 3 evaluations, 3 child updates, `queriedTables === ['deal']` |
| **D-04 / D-13** (bounded, warns loudly) | One `EvaluationBudget { limit, remaining, warned }` object threaded through the parent and every child; decremented immediately before each evaluation; `warned` latched | 600-row fixture: exactly 500 evaluations, exactly one `console.warn`, message asserted fragment-by-fragment |
| **D-13** (depth 1) | Structural — children go through `recalculateOneEntity`, which contains no cascade; `activity` appears only as a child in the relations table | An organization save with deal AND activity formulas present queries `['deal']` and never `activity` |
| **D-09** (ignore ownership) | No ownership predicate on the cascade query, with a comment telling the next reviewer not to "fix" it into an access-control filter | Two tests: a child owned by `u-somebody-else` IS recalculated, plus a source scan asserting zero `ownerId`/`owner_id` tokens outside comments |
| **D-08** (full entity names) | `buildRelatedEntities` keys by the `FORMULA_ENTITY_PREFIXES` spelling; no alias table | `{{Org.Name}}` stores the engine's `Unknown entity: Org`; `Object.keys(related) === ['Organization']` |
| **D-14** (seed nulls) | `buildRelatedEntities` delegates to `buildFormulaFieldValues`, so the parent's side of a dot-ref gets identical null-seeding and wrapper-unwrapping | `related.Organization.Unfilled === null` (seeded) while `{{Organization.Nope}}` still errors with `Field "Nope" not found on Organization` |
| **D-18** (bounds are inert unless passed) | The cascade adds NO new `evaluateFormula` call site — children reuse the single bounded call inside `recalculateOneEntity` | A cascade-specific test loops every `evalSpy` call and asserts `call[3]` carries both bounds; the 34-03 equivalents still pass |
| **D-05 / D-06** | The cascade never throws: a failed child lookup and a failed child recalculation are each caught, warned, and stepped over | Child-query-throws test: the parent's own `Score` is still computed and persisted, and the call resolves |
| **FORMULA-02 / SC-4** | The dotted-ref intersection is tested against child DEFINITIONS before any child ROW query | Five negative tests assert `queriedTables === []`, not merely unchanged values |

## SC-4 Is Proven by Query Count, Not by Values

The new block adds five negative assertions that would fail if the cascade over-triggered, each asserting on **which table was queried**:

- organization `industry` changes, the only deal formula is `{{Organization.Name}}` -> zero child queries, zero evaluations, zero updates (the assertion RESEARCH named explicitly);
- organization save when no child type has any `Organization.` dot-ref -> zero child queries;
- activity save -> zero child queries in every case, while the activity's own formula still recalculates (proving the parent path is untouched);
- deal `notes` changes while the only activity formula is `{{Deal.Title}}` -> zero child queries; the same fixture with `title` changing DOES cascade, pinning the native-attribute-to-column mapping through the dotted-ref path;
- `cascade: false` -> zero child queries.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run src/lib/formula-recalc.test.ts` | exit 0 — **69 passed** (42 from plan 34-03 + 27 new) |
| `npx vitest run` recalc + engine + helpers | exit 0 — **145 passed** |
| `npm test` | exit 0 — 43 files, **563 passed / 4 skipped** (baseline 536/4; +27 = exactly the new tests) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint src/lib/formula-recalc.ts src/lib/formula-recalc.test.ts` | exit 0, **0 errors, 0 warnings** |
| Required exports present | `exports OK` |
| `[formula-recalc]` prefix, non-comment lines | 3 occurrences (budget warning, child-lookup failure, child-recalc failure) |
| `ownerId`/`owner_id`, non-comment lines | **0** — D-09 |
| `git diff --name-only -- src/lib/formula-engine.ts src/lib/formula-helpers.ts` | **empty** — neither touched; Phase 32's H-01 regression guards intact (67/67 engine tests) |
| `git diff -- package.json package-lock.json` | **empty** — zero new dependencies (T-34-SC) |
| 600-row budget test | ~0.6 s, far inside its 20 s insurance timeout; whole file runs in 2.67 s |
| File deletions in either commit | none |
| Untracked files left behind | none |

### The RED gate failed for the right reasons

20 failures, and every one is a missing-cascade or missing-export failure, not mock wiring:

- `expected undefined to be 500` (the constant did not exist);
- `expected [] to deeply equal ['deal']` (no child query was issued);
- `expected "vi.fn()" to be called 500 times, but got 0 times`;
- `buildRelatedEntities is not a function`;
- the three `TypeError: Cannot read properties of undefined` cases are all `updates[0]` on an empty updates array — a direct consequence of no cascade having run.

The three negative-scoping tests passed in the RED state by design: they assert zero child queries, which must hold in both states, and their positive counterparts failed.

Every vitest invocation was wrapped in `timeout`. No infinite-loop formula was written, so nothing could wedge the runner as it did in plan 34-01.

## Deviations from Plan

**1. [Rule 1 - Bug] One plan 34-03 test assertion had to be updated: definitions are queried once per ENTITY TYPE, not once per invocation**

- **Found during:** Task 1 RED.
- **Issue:** `"memoises definitions through the supplied cache across invocations"` asserted `expect(mockGetDefs).toHaveBeenCalledTimes(1)` across two `deal` saves sharing one cache. The cascade must load the CHILD type's definitions to decide whether any child formula dot-references a changed parent field — that gate is what lets it skip the child row query — so a `deal` save now also loads `activity` definitions. The count legitimately becomes 2. There is no way to test child dot-refs without child definitions, so this is inherent to the feature, not an implementation choice.
- **Fix:** the assertion was **strengthened**, not weakened: it now asserts `mockGetDefs.mock.calls.map(c => c[0])` equals `['deal', 'activity']` — one query per entity type, in order, with no repeats. Without the shared cache it would be 4. A comment on the line records why. This is the only removed line in the whole test diff (`git diff -U0` shows exactly 1 `-` line); the plan-34-03 suite is otherwise byte-identical, and new imports were appended as separate statements rather than folded into the existing import block for that reason.
- **Files modified:** `src/lib/formula-recalc.test.ts`
- **Commit:** `e684528`

**2. [Rule 2 - Missing critical functionality] The cascade selects the full child row, not the plan's `{ id, customFields }` projection**

- **Found during:** Task 2.
- **Issue:** With a narrow projection, `buildFormulaFieldValues` resolves the child's own native attributes (`Title`, `Value`, `Notes`, ...) to `null`, because the columns are simply absent from the fetched row. A child formula mixing its own attribute with a parent ref — `{{Deal.Title}} + " / " + {{Title}}` — would then store a value computed from a fabricated null. That is a silent wrong answer, which is the exact defect class this phase exists to remove.
- **Fix:** `db.select().from(child).where(...)` with no projection. Cost is nil: the EXPLAIN in RESEARCH is a **Bitmap Heap Scan**, so the heap tuple is already read; extra columns add no IO and do not change the plan. The `deletedAt` predicate and the index usage are unchanged.
- **Side benefit:** the acceptance criterion `grep -c 'ownerId'` returns **0** rather than "only in a projection", so the D-09 guard is unambiguous.
- **Files modified:** `src/lib/formula-recalc.ts`
- **Commit:** `1f2491c`

**3. [Rule 2 - Missing critical functionality] A parent's freshly recomputed formula values are treated as changed parent fields**

- **Found during:** Task 2.
- **Issue:** The plan's changed-set recipe covers `changedFields` plus native-column reverse mapping plus the `customFields` sentinel. It does not cover the parent's own formula outputs. So `{{Organization.Score}}` on a deal would never refresh when the organization's `Score` formula recomputed — leaving a stale derived value on the child, which is precisely the defect D-03 targets.
- **Fix:** `recalculateOneEntity` returns `computedNames`, and `parentChangedRefNames` folds them into the changed set. This is precise rather than coarse: only formulas that were actually recomputed are included, so it cannot over-trigger.
- **Test added (beyond the plan's list):** `"cascades a parent's freshly recomputed formula value to its children"` — the parent's `Score` recomputes from 0 to 20 and the child's `{{Organization.Score}} + 1` stores 21, reading the FRESH value rather than the stored one.
- **Files modified:** `src/lib/formula-recalc.ts`, `src/lib/formula-recalc.test.ts`
- **Commit:** `1f2491c`

**4. [Deviation] The `{{Organization.Nope}}` and `{{Org.Name}}` error tests use two-ref expressions**

- **Found during:** Task 1.
- **Issue:** As written, a child formula whose ONLY ref is `{{Organization.Nope}}` is never in scope — `Nope` is not a changed parent field — so no evaluation happens and no error could ever be stored. The tests would have asserted on a value that is never written. Same for `{{Org.Name}}`, whose `Org` prefix matches no `changedRelatedFields` key.
- **Fix:** both fixtures use `{{Organization.Name}} + {{Organization.Nope}}` / `{{Organization.Name}} + {{Org.Name}}`. The first ref puts the formula in scope; the second reaches the engine's cross-entity branch and produces the documented error. This tests strictly more than the plan asked (scoping AND the engine error), and pins the D-08 spelling as the only working one.
- **Files modified:** `src/lib/formula-recalc.test.ts`
- **Commit:** `e684528`

**5. [Deviation] The D-09 "no ownership predicate" assertion is behavioural + source scan, not a `.where()` argument inspection**

- **Found during:** Task 1. The plan explicitly permits this fallback.
- **Rationale:** Walking a Drizzle `SQL` object graph to prove `owner_id` is absent is brittle and would break on any drizzle-orm internals change. Instead: a behavioural test (a child owned by `u-somebody-else` IS recalculated — a false negative is impossible) plus a source scan of `formula-recalc.ts` for `ownerId`/`owner_id` outside comment lines, reusing the guard idiom plan 34-03 established for `formula-helpers.ts`.
- **Note for downstream plans:** do not add an `ownerId` projection or variable to `formula-recalc.ts` — the source scan is deliberately crude and will go red.

No Rule 4 (architectural) deviations. No packages installed. No database row read or written — the suite is DB-free via `vi.mock("@/db")`.

## Threat Model Coverage

| Threat | Disposition | Status |
|---|---|---|
| **T-34-03** DoS — cascade request amplification | mitigate | **Active.** One shared budget across parent + children, `CASCADE_DEPTH = 1` structural, measured ceiling ~438 ms in-container. The dotted-ref gate means the common save issues zero child queries. Pinned by the 600-row fixture asserting exactly 500 evaluations. |
| **T-34-05** Tampering/EoP — cascade child writes | accept | Per D-09. Scope is strictly limited: only keys whose definition `type === 'formula'` are written (`computed` contains nothing else), only on rows reachable by a real foreign key from the saved parent, only one hop. Non-derived fields are never touched. Phase 36 audit-log attribution remains plan 34-11's cross-phase note. |
| **T-34-02** DoS — per-child evaluation | mitigate | The cascade adds **no new `evaluateFormula` call site**; children reuse the single bounded call. Asserted by a cascade-specific D-18 test. |
| **T-34-06** Info disclosure — budget warning | mitigate | The warning carries entity types, the parent id and counts only. No row contents, no field values. The two failure warnings pass their message through `sanitizeFormulaError` first. |
| **T-34-12** Info disclosure — cross-entity value leakage | accept | Intended semantics of a cross-entity formula (D-03/D-08); both rows are already readable through the existing REST API. No new surface. |
| **T-34-13** DoS — child query cost | mitigate | All four reverse lookups index-backed by Phase 33 and named in code comments. `deletedAt IS NULL` retained. No full scan is possible. |
| **T-34-SC** Tampering — npm installs | accept | Zero packages; `package.json`/`package-lock.json` diff empty. |

**Threat surface scan:** no new endpoint, auth path, file access or schema change. The new reads are indexed FK selects on existing tables; the new writes are `UPDATE ... SET custom_fields` keyed by primary key through parameterised Drizzle `eq`. Nothing to flag.

## Known Stubs

None. No placeholder values, hardcoded empties feeding UI, or TODO/FIXME markers were introduced.

## Known Limitations (deliberate, not defects)

- **Still nothing calls `recalculateFormulas`.** Plans 34-06 through 34-10 wire the 17 write paths; until then the cascade is exercised only by its tests.
- **A partially-budgeted child is left partially computed.** If the allowance runs out mid-child (say 2 remaining against 3 formulas), that child's first two formulas are written and the rest keep their previous values. It counts as processed, so the warning's `childrenSkipped` slightly understates the shortfall. Self-healing on the next save, and unreachable in practice at 500 with the measured fan-out.
- **The cascade re-reads a child's definitions per entity type, per invocation.** Correct and cheap (0.190 ms, memoised through `definitionsCache`), but there is no cross-request cache — deliberately, per plan 34-03's T-34-10 note.
- **Evaluation results are not memoised across rows.** 114 deals with the same formula still run 114 sandboxes. CONTEXT.md defers batch memoisation, and RESEARCH records context reuse (a ~5x win) as a deferred lever.

## Next Plan Readiness

- **Plan 34-05 (readers)** is unaffected — this plan touched neither `formula-helpers.ts` nor any reader.
- **Plans 34-06..34-09 (write paths):** call `recalculateFormulas` after the write and before `crmBus.emit`. The cascade is **on by default** — you get it for free, and `result.evaluations` now includes children. Note the parent's own save should not be considered complete until this resolves (it awaits child writes).
- **Plan 34-10 (importers):** pass `cascade: false` per row, and consider a lowered `budget` for large batches. Both options are live and tested.
- **Plan 34-11:** the D-09 acceptance (system-attributed cascade writes in Phase 36's audit log) is unchanged and still needs recording as a cross-phase note.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally not modified — the orchestrator owns Phase 34's wave bookkeeping, as in plans 34-01 through 34-03.

## Self-Check: PASSED

Files verified present on disk:
- `src/lib/formula-recalc.ts` — FOUND (958 lines)
- `src/lib/formula-recalc.test.ts` — FOUND (1,547 lines, 69 tests)

Commits verified in `git log`:
- `e684528` — FOUND (`test(34-04)`)
- `1f2491c` — FOUND (`feat(34-04)`)

RED-before-GREEN ordering verified: `e684528` precedes `1f2491c`.
No file deletions in either commit (`git diff --diff-filter=D HEAD~2 HEAD` empty).
No untracked files left behind (`git status --porcelain -uall` clean).
Only the two files in the plan's `files_modified` were changed.

## TDD Gate Compliance

Gate sequence satisfied. RED: `test(34-04)` `e684528`, verified failing with 20 failures confined to the new cascade block plus the one updated 34-03 assertion, every failure a missing-export or missing-cascade failure rather than mock wiring. GREEN: `feat(34-04)` `1f2491c`, 69/69 pass. No REFACTOR gate needed.

---
*Phase: 34-formula-reactivity*
*Completed: 2026-08-14*
