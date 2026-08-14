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
- **D-02**: Both entry points must be covered. Phase 32 established that the v1 API routes diverge from the mutation layer (they emit `crmBus` events directly and have their own auth patterns), so wiring only the mutations would leave the API path stale. Enumerate every write path and prove each is covered.

### Cross-Entity Dependencies
- **D-03**: Cross-entity refs (`{{Org.Rev}}` — dot-prefixed, per `extractDependencies`) DO cascade: saving a parent recalculates dependent child rows whose formulas reference the changed field. Same-entity-only was rejected as leaving a known correctness hole the goal's wording covers.
- **D-04**: The cascade MUST be **bounded** — an explicit batch size / affected-row cap, with a logged warning when the bound is exceeded rather than silently truncating or silently running for minutes. Sizing matters: the live dataset holds 46,055 organizations, 38,345 people, 25,206 deals and 79,023 activities, so one organization save can legitimately implicate thousands of deals. The planner picks the concrete bound and justifies it; it must not be unbounded (SC-4's anti-fan-out intent).

### Failure Semantics
- **D-05**: A formula that errors during recalc **stores the error and lets the entity save succeed** — persist `{ formula: true, value: null, error: '...' }`, the shape `formula-field.tsx` already understands (see its `value` prop comment). A broken admin-authored formula must never block a user's edit, and the error must be visible rather than swallowed.
- **D-06**: Do NOT skip silently and retain the previous value — that knowingly preserves a stale value, which is the exact defect this phase removes.

### Method
- **D-07**: **TDD mode for the recalculation logic.** Write failing tests first for dependency scoping, the cross-entity cascade, the bound, and error persistence; then implement. The ROADMAP frames this phase as "TDD-heavy against `formula-engine.test.ts`", and Phase 32's H-01 regression — a real null-propagation bug that survived a fully green 455-test suite because no test covered the combination — is direct evidence that this area needs test pressure ahead of the code.

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
