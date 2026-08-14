# Phase 34: Formula Reactivity - Context

**Gathered:** 2026-08-14
**Status:** Ready for planning

<domain>
## Phase Boundary

A formula field's stored value is correct everywhere it is read, not just where it is rendered.

**The root cause, confirmed by scouting:** `evaluateFormula` is called from exactly two places, and both are client components — `src/components/custom-fields/formula-field.tsx:66` (`'use client'`) and `src/components/custom-fields/formula-editor.tsx:62` (the admin preview). Nothing on the server ever recomputes the stored JSONB value. `src/app/api/custom-fields/save/route.ts` contains zero formula handling. So every non-UI reader — REST API, CSV export, webhook payload, workflow condition — sees whatever value was last written by a browser, or nothing at all.

In scope:
- Server-side recalculation of formula custom-field values on entity save
- Dependency-aware scoping so unrelated saves do not trigger recalc (FORMULA-02 / SC-4)
- Bounded cross-entity dependent recalculation
- Correct values in API responses, CSV exports, webhook payloads, and workflow condition evaluation

Out of scope:
- Changing the formula language, its functions, or its evaluation semantics
- Removing client-side evaluation — the live-preview UX in `formula-field.tsx` stays
- Formula field definition/authoring UI (`src/app/admin/fields/`)
- Recalculating formulas on a schedule or on read

</domain>

<decisions>
## Implementation Decisions

### Recalculation Hook Point
- **D-01**: Recalculation lives in a **shared helper** (e.g. `recalculateFormulas()`) invoked **synchronously in the same request as the save**, called from BOTH the mutation layer (`src/lib/mutations/*`) AND the v1 API routes that bypass it. Not a `crmBus` subscriber — a subscriber runs after the write, so a `GET` immediately after a save could still read a stale value, which SC-1 explicitly forbids. Not a Postgres trigger/generated column — formulas execute in QuickJS in TypeScript, and reimplementing the engine in PL/pgSQL would create a second engine to keep in sync.
- **D-02**: Both entry points must be covered — and research proved "mutations + v1 routes" is **not enough**. There are **17 server-side write paths**, and covering only those two still misses the **UI path (`saveFieldValues`, the most-used one), the CSV importer, and the Pipedrive importer** — all three write `customFields` directly. The plan must work from the full inventory in RESEARCH.md, not from this two-item shorthand.

### Cross-Entity Dependencies
- **D-03**: Cross-entity refs (`{{Org.Rev}}` — dot-prefixed, per `extractDependencies`) DO cascade: saving a parent recalculates dependent child rows whose formulas reference the changed field. Same-entity-only was rejected as leaving a known correctness hole the goal's wording covers.
- **D-04**: The cascade MUST be **bounded** — an explicit batch size / affected-row cap, with a logged warning when the bound is exceeded rather than silently truncating or silently running for minutes. Sizing matters: the live dataset holds 46,055 organizations, 38,345 people, 25,206 deals and 79,023 activities, so one organization save can legitimately implicate thousands of deals. The planner picks the concrete bound and justifies it; it must not be unbounded (SC-4's anti-fan-out intent).

### Failure Semantics
- **D-05**: A formula that errors during recalc **stores the error and lets the entity save succeed** — persist `{ formula: true, value: null, error: '...' }`, the shape `formula-field.tsx` already understands (see its `value` prop comment). A broken admin-authored formula must never block a user's edit, and the error must be visible rather than swallowed.
- **D-06**: Do NOT skip silently and retain the previous value — that knowingly preserves a stale value, which is the exact defect this phase removes.

### Method
- **D-07**: **TDD mode for the recalculation logic.** Write failing tests first for dependency scoping, the cross-entity cascade, the bound, and error persistence; then implement. The ROADMAP frames this phase as "TDD-heavy against `formula-engine.test.ts`", and Phase 32's H-01 regression — a real null-propagation bug that survived a fully green 455-test suite because no test covered the combination — is direct evidence that this area needs test pressure ahead of the code.

### Locked After Research (2026-08-14)

Research materially changed the picture. **The phase is greenfield in the data:** the live DB holds 169 active custom field definitions, **exactly 0 of type `formula`**, and **0 stored `{formula:...}` values** across all 189k rows. There is no stale data to repair — this phase builds the capability correctly so the first authored formula field behaves right. The test suite is the only exerciser until someone authors one.

- **D-08**: Cross-entity refs use the **full entity name** — `{{Organization.Revenue}}`, `{{Person.X}}`, `{{Deal.X}}`, `{{Activity.X}}`. Not the short `Org.` form that appears in docstrings/fixtures. This is a permanent formula-language API; full names never need disambiguating as entities grow. Define the prefix vocabulary explicitly — none exists today, and `relatedEntities` is currently passed by **zero** callers, so `{{Org.Rev}}` always errors.
- **D-09**: The cascade **ignores ownership** — recalculate all dependent rows regardless of who owns them. Recalculation is a derived-value refresh, not a user edit; leaving another user's deal holding a stale computed value is precisely the defect this phase removes. A save may therefore write rows the actor could not otherwise edit. Acceptable for derived data; Phase 36's audit log should attribute these writes to the system, not the user.
- **D-10**: **Formula-to-formula chaining is supported.** Unwrap the `{formula:true,value,error}` wrapper when a formula references another formula field. Today this silently evaluates to blank with no error — a silent wrong answer. The unwrap is required regardless to stop that, so chains come nearly free. Requires topological ordering within a recalc pass; reuse the existing `detectCircularDependency` (`formula-engine.ts:313`) to guard cycles rather than reimplementing.
- **D-11**: **Verify QuickJS/WASM inside the Docker standalone build EARLY**, as one of the first tasks, and add `serverExternalPackages` for the QuickJS package pre-emptively. Research could not confirm `getQuickJS()` initializes there (privileged docker was unavailable; MEDIUM-LOW confidence). If it fails in Docker, server-side evaluation is unshippable and the entire phase mechanism collapses — that must be discovered first, not last.
- **D-12**: **Fixing the mutation-layer `customFields` drop is IN SCOPE as a prerequisite.** The mutation layer accepts `customFields` in its Zod schemas but **silently discards it** — none of the four `db.insert` calls include the column, so `POST /api/v1/organizations` and `POST /api/v1/activities` lose custom fields entirely today. FORMULA-01 cannot hold via the API path until this is fixed. Treat it as a prerequisite task with its own regression test, not an incidental edit.
- **D-13**: The **D-04 bound is 500 total evaluations with cascade depth 1**, per measured cost (~1.2 ms per QuickJS evaluation, 18.5 ms cold start). This admits the entire measured single-hop worst case (114 deals for the largest organization = 0.909 ms of DB lookup) and rejects the 2-hop case (~626 evaluations) by construction. The planner may adjust with justification, but must keep an explicit bound and a logged warning on exceed.

### Engine traps that will silently poison stored values (measured — the plan MUST handle each)
- **D-14**: A referenced field whose **JSONB key is absent** returns `error: 'Unknown field: X'`, whereas an explicit `null` returns blank. `fieldValues` must therefore be seeded with **every definition name defaulting to `null`** before evaluation, or roughly 90% of rows would store fabricated errors.
- **D-15**: `multi_select` array values **string-concatenate** under arithmetic (`['x'] + 1` → `'x1'`). Decide and document the coercion rather than letting it surface as a nonsense value.
- **D-16**: `Papa.unparse` renders a wrapper value as **`[object Object]`** (reproduced against the installed papaparse 5.5.3). **SC-2 requires a reader change** — `flattenCustomFields` must unwrap formula wrappers. Do not assume the readers are already correct.
- **D-17**: The webhook payload and the workflow-trigger envelope are **emit-time snapshots of the row object**. Recalculation must complete **before** `crmBus.emit`, not after, or SC-2/SC-3 fail despite a correct stored value.

### Claude's Discretion
- Whether recalculation runs inside the same DB transaction as the entity write, or immediately after it in the same request — provided SC-1 holds (a subsequent GET sees recomputed values).
- Whether to build a stored dependency index or call `extractDependencies` at recalc time. Note `detectCircularDependency` already exists in `formula-engine.ts:313` and should be reused, not reimplemented.
- The concrete bound value for D-04 and how the warning is surfaced.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `evaluateFormula(expression, fieldValues, relatedEntities)` — `src/lib/formula-engine.ts:151`. Already accepts a `relatedEntities` argument, so cross-entity evaluation is supported at the engine level.
- `extractDependencies(expression)` — `formula-engine.ts:300`. Returns raw ref strings (`Price`, `Org.Rev`) from `{{...}}`. Cross-entity refs are dot-prefixed. Note it does no validation and no dedup.
- `detectCircularDependency(field, dependencies, ...)` — `formula-engine.ts:313`. Already implemented; reuse it.
- `src/lib/formula-helpers.ts` — inspect for existing shared logic before adding new helpers.
- Mutation layer: `src/lib/mutations/{deals,people,organizations,activities}.ts` — the established reuse point (introduced in v1.2, per STATE.md).
- `src/lib/events/subscribers/` — pattern for event subscribers, if any post-save work is genuinely async.

### Established Patterns
- Custom fields are a JSONB column per entity; formula values are stored as `{ formula: true, value, error }` objects
- Server actions return `{ success: true/false, error/id }`
- Mutations check entity existence; ownership checks stay in server actions / API routes
- Tests mock `@/db` via `vi.mock("@/db")` — all 18 DB-touching test files do this

### Integration Points
- `src/lib/mutations/*.ts` — the primary hook (D-01)
- `src/app/api/v1/{deals,people,organizations,activities}/**` — the secondary hook that must not be forgotten (D-02)
- `src/app/api/custom-fields/save/route.ts` — currently has no formula handling at all
- CSV export, webhook payload builders, and workflow condition evaluation are **readers** — they should need no changes once the stored value is correct. Verify that rather than assuming it.

</code_context>

<specifics>
## Specific Ideas

- Phase 32 fixed a real null-propagation bug in `formula-engine.ts` (the `usesNullSafe` carve-out is now **per field reference**, not per expression). Do not regress it — the 6 regression tests added there must stay green.
- The `formula-field.tsx` client component keeps doing live preview as the user types. This phase adds a server-side source of truth; it does not remove the client path.
- SC-4 is a negative assertion and needs a test that would FAIL if recalc over-triggered — e.g. saving a field no formula references must produce zero formula evaluations. Assert on evaluation count, not just on final values.

</specifics>

<deferred>
## Deferred Ideas

- Recalculating formulas on read, or a background reconciliation job to repair historical stale values already in the database — this phase fixes the write path; pre-existing stale rows are a separate migration/backfill concern
- Formula dependency visualization in the admin UI
- Caching or memoizing evaluation across a batch

</deferred>
