# Phase 34: Formula Reactivity - Research

**Researched:** 2026-08-14
**Domain:** Server-side derived-field recomputation (dependency-scoped write-path recalc) over a JSONB custom-field store, with a QuickJS-sandboxed expression engine
**Confidence:** HIGH for the write-path inventory, the stored-shape finding, the fan-out numbers, and the QuickJS cost (all measured against the live DB / installed packages). MEDIUM for the Next.js standalone-Docker WASM behaviour (one datapoint each way; needs an explicit runtime probe task).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Recalculation Hook Point**
- **D-01**: Recalculation lives in a **shared helper** (e.g. `recalculateFormulas()`) invoked **synchronously in the same request as the save**, called from BOTH the mutation layer (`src/lib/mutations/*`) AND the v1 API routes that bypass it. Not a `crmBus` subscriber — a subscriber runs after the write, so a `GET` immediately after a save could still read a stale value, which SC-1 explicitly forbids. Not a Postgres trigger/generated column — formulas execute in QuickJS in TypeScript, and reimplementing the engine in PL/pgSQL would create a second engine to keep in sync.
- **D-02**: Both entry points must be covered. Phase 32 established that the v1 API routes diverge from the mutation layer (they emit `crmBus` events directly and have their own auth patterns), so wiring only the mutations would leave the API path stale. Enumerate every write path and prove each is covered.

**Cross-Entity Dependencies**
- **D-03**: Cross-entity refs (`{{Org.Rev}}` — dot-prefixed, per `extractDependencies`) DO cascade: saving a parent recalculates dependent child rows whose formulas reference the changed field. Same-entity-only was rejected as leaving a known correctness hole the goal's wording covers.
- **D-04**: The cascade MUST be **bounded** — an explicit batch size / affected-row cap, with a logged warning when the bound is exceeded rather than silently truncating or silently running for minutes. Sizing matters: the live dataset holds 46,055 organizations, 38,345 people, 25,206 deals and 79,023 activities, so one organization save can legitimately implicate thousands of deals. The planner picks the concrete bound and justifies it; it must not be unbounded (SC-4's anti-fan-out intent).

**Failure Semantics**
- **D-05**: A formula that errors during recalc **stores the error and lets the entity save succeed** — persist `{ formula: true, value: null, error: '...' }`, the shape `formula-field.tsx` already understands (see its `value` prop comment). A broken admin-authored formula must never block a user's edit, and the error must be visible rather than swallowed.
- **D-06**: Do NOT skip silently and retain the previous value — that knowingly preserves a stale value, which is the exact defect this phase removes.

**Method**
- **D-07**: **TDD mode for the recalculation logic.** Write failing tests first for dependency scoping, the cross-entity cascade, the bound, and error persistence; then implement. The ROADMAP frames this phase as "TDD-heavy against `formula-engine.test.ts`", and Phase 32's H-01 regression — a real null-propagation bug that survived a fully green 455-test suite because no test covered the combination — is direct evidence that this area needs test pressure ahead of the code.

### Claude's Discretion
- Whether recalculation runs inside the same DB transaction as the entity write, or immediately after it in the same request — provided SC-1 holds (a subsequent GET sees recomputed values).
- Whether to build a stored dependency index or call `extractDependencies` at recalc time. Note `detectCircularDependency` already exists in `formula-engine.ts:313` and should be reused, not reimplemented.
- The concrete bound value for D-04 and how the warning is surfaced.

### Deferred Ideas (OUT OF SCOPE)
- Recalculating formulas on read, or a background reconciliation job to repair historical stale values already in the database — this phase fixes the write path; pre-existing stale rows are a separate migration/backfill concern
- Formula dependency visualization in the admin UI
- Caching or memoizing evaluation across a batch
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FORMULA-01 | Formula field values are recalculated server-side when any entity field is saved, so stored JSONB values are correct in API responses, CSV exports, webhook payloads, and workflow condition evaluation | §Write-Path Inventory (the 13 paths that must call the helper), §Reader Audit (which readers are actually sufficient and which are **not** — the CSV export needs a change), §QuickJS Viability (proves server-side evaluation is possible and how much it costs) |
| FORMULA-02 | Formula recalculation only runs for formulas whose referenced source fields actually changed (dependency-aware, prevents fan-out during bulk saves) | §Dependency Resolution (one 0.19 ms query gets every definition; `extractDependencies` gives the ref set), §Cross-Entity Cascade (all four reverse lookups are index-backed; measured fan-out), §SC-4 Negative Test Design |
</phase_requirements>

## Summary

The phase is **greenfield in the data, not in the code**. I queried the live database: there are **169 active custom field definitions and exactly zero of type `formula`**, and **zero JSONB values anywhere matching `{ formula: ... }`** across all 25,206 deals / 38,345 people / 46,055 organizations / 79,023 activities. So there is no stale historical data to repair (consistent with CONTEXT.md deferring backfill) and no existing stored shape to stay compatible with. The phase is purely "make the write path correct from now on," and the test suite is the only exerciser of the new code until someone authors a formula field.

The write-path inventory is worse than "mutations plus v1 routes." **The mutation layer accepts `customFields` in its Zod schemas and then silently drops it** — none of the four `db.insert(...)` calls in `src/lib/mutations/{deals,people,organizations,activities}.ts` include a `customFields` column. Custom fields are actually written by five other mechanisms: `saveFieldValues()` (the UI path, which replaces the whole JSONB blob wholesale and emits no `crmBus` event at all), four v1 collection/`[id]` routes doing their own `db.insert`/`db.update`, the CSV importer, the Pipedrive importer, and (for `custom_fields`-less creates) three batch routes. Thirteen distinct paths need coverage; a full table is below. Note that formulas can reference **native** entity attributes (`{{Value}}`, `{{Title}}`, `{{Name}}`…), so even a create that carries no custom fields at all still needs recalc.

Three engine behaviours I measured will otherwise silently poison the stored values, and the plan must handle each: (1) a referenced field whose **key is absent** from `fieldValues` returns `error: 'Unknown field: X'`, whereas an explicit `null` returns blank — and in this dataset most rows carry only a handful of the 155 deal keys, so the recalc **must seed `fieldValues` with every active definition name defaulting to `null`** or ~90% of rows get a fabricated error; (2) a formula referencing another formula whose stored value is the `{ formula: true, value, error }` wrapper evaluates to **silent blank, no error** (measured), so wrappers must be unwrapped before evaluation and formulas must be evaluated in dependency order; (3) `multi_select` values are stored as arrays in this DB and `['x'] + 1` yields `'x1'` (measured). Separately, **the CSV export will emit `[object Object]` for any wrapper-shaped value** (measured with the installed papaparse) — SC-2 therefore requires a change to `flattenCustomFields`, not just a correct stored value. And because both the webhook payload and the workflow trigger envelope are snapshots of the row taken at `crmBus.emit(...)` time, recalc must complete **before** the emit, not after it.

**Primary recommendation:** Build `src/lib/formula-recalc.ts` exporting one async `recalculateFormulas({ entityType, entityId, changedFields, tx? })` that (a) loads all active definitions for the entity type in the single existing 0.19 ms query, (b) filters to `type === 'formula'` definitions whose `extractDependencies()` ref set intersects `changedFields`, (c) seeds `fieldValues` from every active definition name plus a per-entity native-attribute map, unwrapping any `{ formula: true }` wrappers, (d) evaluates in topological order via the existing `detectCircularDependency`, (e) writes the merged `customFields` JSONB **before** the caller emits its `crmBus` event, and (f) walks exactly one hop of index-backed child lookups under a hard 500-evaluation budget, logging a warning naming the parent id and the truncated count when the budget trips. Call it from all 13 write paths. Unwrap wrappers in `flattenCustomFields` for SC-2.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Formula expression evaluation (sandbox) | API / Backend (Node process) | Browser (live preview only) | QuickJS is a WASM sandbox that runs identically in both; the stored value must be produced by the server so non-UI readers see it. The client copy stays for the as-you-type preview (explicitly in scope per CONTEXT.md). |
| Dependency scoping (which formulas to run) | API / Backend | — | Requires the full set of definitions and the `changedFields` list, both server-only. |
| Definition lookup (`custom_field_definitions`) | Database / Storage | — | One indexed-enough (169-row) table read per recalc; measured 0.19 ms. |
| Reverse child lookup for the cascade | Database / Storage | — | Index-backed FK scans added in Phase 33 (`deals_organization_id_idx` etc.). |
| Stored value persistence | Database / Storage | — | JSONB `custom_fields` column per entity table; this is the single source of truth SC-1..SC-3 read. |
| Value presentation (formatting, `#ERROR`) | Browser / Client | Frontend Server (SSR) | `formula-field.tsx` already renders the wrapper shape; unchanged by this phase. |
| CSV / webhook / API serialisation of formula values | API / Backend | — | `flattenCustomFields`, `serialize*`, and the trigger envelope all live server-side and all read the stored JSONB. One of them (CSV) needs a change. |
| Live preview as the user types | Browser / Client | — | Explicitly retained; not the source of truth. |

## Standard Stack

No new packages. Everything this phase needs is already installed and already in use.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `quickjs-emscripten` | 0.32.0 (verified in `node_modules`) | Sandboxed expression evaluation | Already the engine behind `src/lib/formula-engine.ts` and `src/lib/execution/actions/transform.ts`. CONTEXT.md forbids changing evaluation semantics, so this is fixed. [VERIFIED: local node_modules + measured] |
| `drizzle-orm` | 0.45.1 | JSONB read/write, indexed reverse lookups, `tx` for optional transactional recalc | Project ORM. [VERIFIED: package.json] |
| `postgres` (postgres.js) | 3.4.8 | Driver | Project driver. [VERIFIED: package.json] |
| `vitest` | 4.0.18 | Test runner; TDD per D-07 | Project runner; confirmed QuickJS works under it (63 formula tests, 258 ms). [VERIFIED: measured] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.3.6 | Validate the recalc helper's input shape if exposed at a boundary | Only if the helper gets an HTTP entry point; the internal helper does not need it. |
| `papaparse` | 5.5.3 | CSV export serialisation | Already used by `exportToCSV`; relevant only because it is what turns a wrapper object into `[object Object]`. [VERIFIED: measured] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Synchronous in-request recalc (D-01) | `crmBus` subscriber | **Rejected by D-01.** Also independently disqualified: the subscriber receives `payload.data`, a snapshot taken at emit time, so it could not fix the webhook/trigger payload even if it fixed the row. |
| QuickJS in TypeScript | Postgres generated column / trigger | **Rejected by D-01.** Would require a second expression engine. |
| Fresh QuickJS context per evaluation (status quo) | One reused context per recalc batch | 1.195 ms → 0.245 ms per evaluation (measured, ~5x). **CONTEXT.md defers batch memoisation**, so keep per-evaluation contexts; recorded here because it is the lever if the D-04 bound proves too tight later. |
| Computing dependencies at recalc time | A stored dependency index table | At 169 definitions and 0.19 ms per lookup, an index table is pure overhead. Recommend recalc-time `extractDependencies`. (Claude's-discretion item resolved.) |

**Installation:**
```bash
# none — no new dependencies
```

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** Every library it touches (`quickjs-emscripten`, `drizzle-orm`, `postgres`, `papaparse`, `zod`, `vitest`) is already a direct dependency in `package.json` and already imported by shipped source. No slopcheck gate is required because no new package name enters the tree.

Versions confirmed by reading `node_modules/*/package.json` and `package.json` directly, not from training data:

| Package | Registry | Declared | Installed | Already imported by |
|---------|----------|----------|-----------|---------------------|
| `quickjs-emscripten` | npm | `^0.32.0` | 0.32.0 | `src/lib/formula-engine.ts`, `src/lib/execution/actions/transform.ts` |
| `papaparse` | npm | `^5.5.3` | (declared) | `src/lib/export/formatters.ts` |
| `drizzle-orm` | npm | `^0.45.1` | (declared) | everywhere |
| `vitest` | npm (dev) | `^4.0.18` | 4.0.18 | 41 test files |

## Architecture Patterns

### System Architecture Diagram

```
                        WRITE PATHS (13 — see inventory table)
  ┌──────────────────────┐  ┌────────────────────┐  ┌──────────────────────┐
  │ UI: custom-fields    │  │ UI/workflow:       │  │ REST: v1 routes      │
  │ POST /api/custom-    │  │ server actions ->  │  │ POST/PUT deals,      │
  │ fields/save          │  │ mutations/*        │  │ people, orgs,        │
  │ -> saveFieldValues() │  │ (drops customFields│  │ activities, batch/*  │
  └──────────┬───────────┘  │  today!)           │  └──────────┬───────────┘
             │              └─────────┬──────────┘             │
  ┌──────────┴──────────────┐         │        ┌───────────────┴─────────────┐
  │ CSV import actions      │         │        │ Pipedrive API importer      │
  │ (batchInsert)           │         │        │ (batchInsert)               │
  └──────────┬──────────────┘         │        └───────────────┬─────────────┘
             └────────────────────────┼────────────────────────┘
                                      v
                    ╔═════════════════════════════════════════╗
                    ║  recalculateFormulas()  [NEW, D-01]     ║
                    ║  src/lib/formula-recalc.ts              ║
                    ╚═════════════════════════════════════════╝
                                      │
       ┌──────────────────────────────┼──────────────────────────────┐
       v                              v                              v
 (1) load defs                (2) scope by deps              (3) build inputs
 SELECT * FROM               extractDependencies(expr)       native attrs map
 custom_field_definitions    ∩ changedFields                 + every def name -> null
 WHERE entity_type=$1        -> nothing? RETURN (SC-4)       + unwrap {formula:...}
 AND deleted_at IS NULL      -> dot-refs? mark cascade       ------------------
 (169 rows, 0.19 ms)                                         topo order via
                                                             detectCircularDependency
                                      │
                                      v
                    (4) for each in-scope formula, in order:
                        evaluateFormula(expr, fieldValues, relatedEntities)
                        QuickJS: ~1.2 ms warm, 18.5 ms one-time cold
                        error -> { formula:true, value:null, error } (D-05)
                                      │
                                      v
                    (5) UPDATE <table> SET custom_fields = merged
                        ---- MUST HAPPEN BEFORE crmBus.emit ----
                                      │
                    (6) cascade, 1 hop, index-backed, budget-capped
                        org  -> deals   (deals_organization_id_idx)
                        org  -> people  (people_organization_id_idx)
                        person -> deals (deals_person_id_idx)
                        deal -> activities (activities_deal_id_idx)
                        budget exceeded -> console.warn(parentId, childType, count)
                                      │
       ┌──────────────────────────────┼──────────────────────────────┐
       v                              v                              v
  crmBus.emit(...)              READERS (post-write)            subsequent GET
  payload.data = row            ┌──────────────────────────┐    reads JSONB
       │                        │ serialize* -> API JSON   │    directly
       ├─> webhook subscriber   │   OK, passes JSONB thru  │      SC-1 OK
       │   payload snapshot     ├──────────────────────────┤
       │      SC-2 OK iff       │ flattenCustomFields      │
       │      recalc ran first  │ -> CSV: [object Object]  │
       └─> workflow-trigger     │   *** NEEDS FIX ***      │
           trigger.data = row   ├──────────────────────────┤
             -> condition-      │ toPipedriveFormat        │
                evaluator       │   same defect            │
                SC-3 needs      └──────────────────────────┘
                .value path
```

### Recommended Project Structure

```
src/lib/
├── formula-engine.ts        # UNCHANGED — do not regress the Phase 32 per-reference carve-out
├── formula-helpers.ts       # validateFormula (currently dead code; see Pitfall 9)
├── formula-recalc.ts        # NEW — recalculateFormulas() + entity native-attribute map
├── formula-recalc.test.ts   # NEW — the D-07 TDD target
├── custom-fields.ts         # saveFieldValues() gains a recalc call
├── export/formatters.ts     # flattenCustomFields() gains wrapper unwrapping (SC-2)
└── mutations/
    ├── deals.ts             # writes customFields (currently dropped!) + recalc before emit
    ├── people.ts            # ditto
    ├── organizations.ts     # ditto
    └── activities.ts        # ditto
```

### Pattern 1: One shared helper, called synchronously, before the event emit

**What:** A single `recalculateFormulas()` in `src/lib/formula-recalc.ts`, awaited by every write path immediately after the entity row is written and **strictly before** `crmBus.emit(...)`.

**When to use:** Every one of the 13 write paths in the inventory.

**Why the ordering is load-bearing:** `src/lib/events/subscribers/webhook.ts:19` forwards `payload.data` verbatim to `triggerWebhook`, and `src/lib/triggers/matcher.ts` builds `envelope.data = { ...payload.data, ... }`. Both are **snapshots of the row object captured at emit time**. If recalc runs after the emit, the webhook body and the workflow trigger data carry pre-recalc values and SC-2/SC-3 fail even though the DB row is right.

**Example (shape, from the existing mutation pattern at `src/lib/mutations/deals.ts:289`):**
```ts
// Source: existing pattern in src/lib/mutations/deals.ts:289-317
const [updatedDeal] = await db.update(deals).set(updateData).where(eq(deals.id, id)).returning()

// NEW: recalc before the emit, and fold the result into the row we emit
const recalced = await recalculateFormulas({
  entityType: "deal",
  entityId: id,
  changedFields,           // already tracked by every mutation
  row: updatedDeal,
})

crmBus.emit("deal.updated", buildEventPayload(
  id,
  "updated",
  { ...updatedDeal, customFields: recalced.customFields } as unknown as Record<string, unknown>,
  userId,
  changedFields.length > 0 ? changedFields : null,
))
```

### Pattern 2: Seed `fieldValues` with every definition name, defaulting to `null`

**What:** Before calling `evaluateFormula`, build `fieldValues` as `{ ...nativeAttributes, ...Object.fromEntries(allDefNames.map(n => [n, null])), ...unwrap(storedCustomFields) }`.

**When to use:** Always. This is not an optimisation, it is a correctness requirement.

**Why:** Measured behaviour of the current engine (`src/lib/formula-engine.ts:191`):

| `fieldValues` | Result |
|---|---|
| key absent | `{ value: null, error: 'Unknown field: X' }` |
| `{ X: null }` | `{ value: null, error: null }` (blank — correct) |
| `{ X: undefined }` | `{ value: null, error: null }` (blank) |

In the live DB, `deals` has 155 active definitions but the median row carries a handful of keys (top key `Origem` appears on 18,415 of 25,206 rows; most keys appear on under 5,000). Without seeding, nearly every row would persist a fabricated `Unknown field:` error under D-05.

### Pattern 3: Unwrap wrapper values, then evaluate in topological order

**What:** Any stored value shaped `{ formula: true, value, error }` must be replaced with its `.value` before it enters `fieldValues`. Formula-to-formula references must be ordered so a dependency is evaluated before its dependent.

**Why:** Measured — `evaluateFormula('{{Margin}} * 2', { Margin: { formula: true, value: 100, error: null } })` returns `{ value: null, error: null }`: **silently blank, with no error at all**. The failure is invisible.

**Ordering:** Reuse `detectCircularDependency(field, depMap)` from `formula-engine.ts:313` (D-07 / Claude's discretion says reuse, do not reimplement) to reject cycles, then emit a topological order over the formula-only subgraph. Note `formula-helpers.ts:87` builds a `depMap` with only **one** entry, so `detectCircularDependency` can never see a two-hop cycle there — building the full map is new work.

### Pattern 4: Index-backed, single-hop, budget-capped cascade

**What:** Resolve "which child rows depend on this parent" by intersecting definition dot-refs with `changedFields`, then running one indexed FK query per affected child entity type.

```ts
// Source: query shape verified by EXPLAIN ANALYZE against the live DB
// Bitmap Index Scan on deals_organization_id_idx, 114 rows, 0.909 ms total
const children = await db
  .select({ id: deals.id, customFields: deals.customFields })
  .from(deals)
  .where(and(eq(deals.organizationId, parentId), isNull(deals.deletedAt)))
```

**Why single-hop:** two hops (`organization -> deals -> activities`) reaches ~512 activities on the worst organization (114 deals x 4.49 activities/deal average), which at 1.2 ms/evaluation blows any reasonable request budget. Recommend depth 1 with an explicit code comment recording the choice.

### Anti-Patterns to Avoid

- **Recalc after `crmBus.emit`** — the webhook and trigger payloads are emit-time snapshots. SC-2/SC-3 fail silently.
- **Trusting client-supplied formula values** — `saveFieldValues` replaces the whole JSONB blob with what the browser posted (`src/lib/custom-fields.ts:135`), and `CustomFieldsSection` posts `{ ...localValues, [field]: value }` which *includes* the formula key. The v1 `custom_fields` merge has the same hole. Formula keys must be **stripped from client input and written only by the server**. An API caller can currently set any value on a formula field.
- **Reimplementing `detectCircularDependency` or the null carve-out** — the Phase 32 H-01 fix made `usesNullSafe` a **per-field-reference** decision (`isReferenceUsedInArithmetic`, `formula-engine.ts:134`). Six regression tests guard it. Do not touch `formula-engine.ts` evaluation logic.
- **Recalcing on every save unconditionally** — directly violates FORMULA-02/SC-4. The `changedFields` intersection is the gate, and every mutation already computes `changedFields`.
- **Assuming the mutation layer persists `customFields`** — it does not. Adding recalc without also fixing the drop would recalc against a blob that was never written.
- **Deriving `changedFields` for the UI path from nothing** — `saveFieldValues(entityType, entityId, values)` receives the full replacement blob with no diff. It must diff against the current row (it already has to read it, or can use `UPDATE ... RETURNING`) to produce a `changedFields` list, or SC-4 cannot hold for the most common save path.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Expression evaluation | A new parser/evaluator | `evaluateFormula` (`formula-engine.ts:151`) | CONTEXT.md forbids changing semantics; 63 tests including 6 H-01 regression guards depend on the exact behaviour. |
| Extracting `{{refs}}` | A new regex | `extractDependencies` (`formula-engine.ts:300`) | Already tested. **But it does not dedupe** (its own test asserts `['Value','Value']`) — dedupe at the call site. |
| Cycle detection | A new DFS | `detectCircularDependency` (`formula-engine.ts:313`) | Explicitly named in CONTEXT.md as reuse-not-reimplement. |
| Sandboxing | `eval`, `new Function`, `vm` module | QuickJS via `quickjs-emscripten` | Admin-authored expressions are untrusted input executing in the server process. The project already made this decision twice (`formula-engine.ts`, `transform.ts`). |
| Reverse FK lookups | A full table scan or an in-memory join | Indexed `WHERE <fk> = $1` | Phase 33 shipped `deals_organization_id_idx`, `deals_person_id_idx`, `people_organization_id_idx`, `activities_deal_id_idx`. All four cascade directions are already index-backed; measured 0.909 ms for the worst case. |
| Definition lookup | A cache layer | `getActiveFieldDefinitions()` (`custom-fields.ts:15`) | Measured 0.190 ms for the whole 169-row table. A cache would add invalidation bugs for no win. |
| Entity-table dispatch | A new switch | The `entityTables` map at `custom-fields.ts:7` | Already maps `organization|person|deal|activity` to the Drizzle table. |

**Key insight:** every primitive this phase needs already exists in the codebase; the new code is almost entirely *orchestration and scoping*. The risk is not in the algorithms, it is in (a) missing one of the 13 write paths and (b) feeding the engine badly shaped inputs.

## Write-Path Inventory (Research Task 1)

Definitive table. "Goes through mutations" and "writes custom fields" verified by reading each file, not inferred.

| # | Path | Entry point | Goes through mutation layer? | Writes `customFields` today? | Recalc needed | Notes |
|---|------|-------------|------------------------------|------------------------------|---------------|-------|
| 1 | `POST /api/custom-fields/save` | `src/app/api/custom-fields/save/route.ts:24` -> `saveFieldValues` (`custom-fields.ts:123`) | No | **Yes — the only path that does today** | **YES** | Replaces the entire blob. Emits **no `crmBus` event at all**, so no webhook/workflow fires for a UI custom-field edit. Has no `changedFields` — must diff. |
| 2 | Server actions: `createDeal/updateDeal/...` | `src/app/{deals,people,organizations,activities}/actions.ts` | Yes | **No** — actions never pass `customFields` | YES (native-attribute formulas) | All four action files delegate 100% to mutations; none reference `customFields`. |
| 3 | Mutation layer create x4 | `mutations/{deals:149,people:90,organizations:70,activities:98}.ts` | (is the layer) | **No — silently dropped.** Zod schema accepts `customFields`, the `db.insert(...).values({...})` omits the column. | YES | **Bug to fix in this phase or the recalc has nothing to merge into.** |
| 4 | Mutation layer update x4 | `mutations/{deals:290,people:185,organizations:139,activities:198}.ts` | (is the layer) | No | YES | `changedFields` already computed here — free input for FORMULA-02. |
| 5 | `POST /api/v1/deals` | `v1/deals/route.ts:228` `db.insert(deals)` | **No — direct insert** | Yes (`customFields: custom_fields \|\| {}`) | YES | Diverges exactly as D-02 warns. |
| 6 | `PUT /api/v1/deals/[id]` | `v1/deals/[id]/route.ts:255` `db.update(deals)` | **No — direct update** | Yes (merge at `:247`) | YES | Pushes `"customFields"` into `changedFields`. |
| 7 | `POST /api/v1/people` | `v1/people/route.ts:134` `db.insert(people)` | **No** | Yes (`:144`) | YES | |
| 8 | `PUT /api/v1/people/[id]` | `v1/people/[id]/route.ts:179` `db.update(people)` | **No** | Yes (merge at `:170`) | YES | |
| 9 | `POST /api/v1/organizations` | `v1/organizations/route.ts:96` `createOrganizationMutation` | **Yes** | **No — `custom_fields` is passed to the mutation and dropped there.** Silent data loss today. | YES | |
| 10 | `PUT /api/v1/organizations/[id]` | `v1/organizations/[id]/route.ts:109` mutation, then a **separate** `db.update` at `:123` | Partly | Yes, via the separate update | YES | Two writes per request; recalc must run after the second one. |
| 11 | `POST /api/v1/activities` | `v1/activities/route.ts:168` `createActivityMutation` | **Yes** | **No — dropped in the mutation.** | YES | |
| 12 | `PUT /api/v1/activities/[id]` | `v1/activities/[id]/route.ts:205` `db.update(activities)` | **No** | Yes (merge at `:199`) | YES | (Pre-existing, out of scope: this route does **no ownership check** — recorded in the Phase 32 review as an IDOR.) |
| 13a | `POST /api/v1/deals/batch` | `v1/deals/batch/route.ts:174` `db.insert(deals)` | No | **No — `custom_fields` not even in the item schema** | YES | New rows still need native-attribute formulas populated. Emits one `deal.created` per row. |
| 13b | `POST /api/v1/people/batch` | `v1/people/batch/route.ts:113` `db.insert(people)` | No | No | YES | |
| 13c | `POST /api/v1/organizations/batch` | `v1/organizations/batch/route.ts` -> per-item mutation | Yes | No | YES | |
| 14 | CSV importer | `src/app/import/actions.ts:143,232,414,532` `batchInsert` | **No** | **Yes** — `extractCustomFields` on `custom_*` columns | YES (batched, bound-sensitive) | 100-row batches. This is the path most likely to trip the D-04 budget. |
| 15 | Pipedrive API importer | `src/lib/import/pipedrive-api-import-actions.ts:89,904` `batchInsert` / `db.insert(activities)` | **No** | **Yes** (`:616,693,822,912`) | YES (batched) | Same batching concern. |
| 16 | Workflow `crm_action` node | `src/lib/execution/actions/crm.ts:261,273` -> mutations | Yes | No (mutations drop it) | Covered transitively via #3/#4 | `interpolatedFields` could carry `customFields`; it would be dropped. Covering the mutation layer covers this. |
| 17 | `POST /api/internal/email/process` | `route.ts:77` `db.update(activities)` | No | No (sets `completedAt`-type fields only) | Probably not | Verify: if it changes a field a formula reads, it needs the call too. Low risk. |

**Consolidated answer to D-02:** covering "the mutation layer + the v1 routes" gets paths 2,3,4,5,6,7,8,9,10,11,12,13,16. It **misses** #1 (the UI path — the single most-used one), #14 and #15 (both importers). All three write `customFields` directly and none go through mutations. The plan must name them explicitly.

## Stored Shape of Formula Values Today (Research Task 2)

Queried live (`postgresql://pipelite@localhost:5433/pipelite`, read-only, zero rows mutated).

```
custom_field_definitions:      169 total, 0 soft-deleted
  by entity_type:              deal 155, organization 8, person 6, activity 0
  of type 'formula':           0        <-- none exist
```

```
custom_fields JSONB population:
  organizations: total=46055  null=0  empty={} =15791  populated=30264
  people:        total=38345  null=0  empty={} =20605  populated=17740
  deals:         total=25206  null=0  empty={} =3640   populated=21566
  activities:    total=79023  null=0  empty={} =79023  populated=0
```

```
Rows containing any value shaped { formula: ... }:
  organizations: 0    people: 0    deals: 0    activities: 0
```

Representative real values (note the arrays — `multi_select`):
```
deals   {"Origem":["Outbound Manual"],"Segmento":["Condomínios"],
         "Tem solução de solar?":["Sim"],"Tipo de Proposta Desativado":["GD"]}
orgs    {"CNPJ / CPF":"23466509000120"}
people  {"Contato 2 (Nome)":"Daniel","Contato 2 (telefone)":"(21) 98841-0318"}
```

**Answer:** the JSONB key for a formula field is **absent everywhere**, because no formula definition exists. The phase is therefore **"keep values fresh"** for a store that is currently empty of formula values — not also "repopulate historical values." When an admin creates the first formula field, existing rows will have no value for it until each row is next saved; CONTEXT.md explicitly defers that backfill. **The planner should state this in the plan** so nobody mistakes a blank formula column on old rows for a phase failure. The corollary is that the automated test suite is the only exerciser of the new code path until someone authors a formula field, which raises the bar on test quality (consistent with D-07).

`custom_fields` is never SQL `NULL` — always at least `{}`. So the recalc can assume an object.

## Dependency Resolution & Definition Storage (Research Task 3)

**Schema** (`src/db/schema/custom-fields.ts`):
```ts
export type FormulaConfig = { expression: string; resultType?: 'text' | 'number' | 'date' | 'boolean' }
customFieldDefinitions = pgTable('custom_field_definitions', {
  id, entityType: text().$type<EntityType>(), name: text(), type: text().$type<FieldType>(),
  config: jsonb().$type<FieldConfig>(), required, position, showInList,
  createdAt, updatedAt, deletedAt,
})
```
`FieldConfig` is the union `SelectConfig | LookupConfig | FormulaConfig | FileConfig | null`, so reading a formula expression is `(def.config as FormulaConfig | null)?.expression` — the pattern already used at `formula-field.tsx:46`.

**"All formula definitions for entity type X" is one query** — the existing `getActiveFieldDefinitions(entityType)` (`custom-fields.ts:15`) already returns exactly that set, filtered on `deleted_at IS NULL` and ordered by `position`. Filter in JS on `type === 'formula'`.

**Cost, measured:**
```
EXPLAIN ANALYZE SELECT * FROM custom_field_definitions
                WHERE entity_type='deal' AND deleted_at IS NULL ORDER BY position;

Sort (cost=12.75..13.14 rows=155) (actual time=0.148..0.155 rows=155)
  -> Seq Scan on custom_field_definitions (actual time=0.010..0.046 rows=155)
     Rows Removed by Filter: 14
Execution Time: 0.190 ms
```
Seq Scan on a 169-row table is optimal; there is no index other than the PK and none is warranted.

**Caching: not warranted.** 0.19 ms against a ~1.2 ms per-evaluation cost is under 16% of a single evaluation. A module-level cache would need invalidation on every `createFieldDefinition`/`updateFieldDefinition`/`deleteFieldDefinition`/`restoreFieldDefinition` in `src/app/admin/fields/actions.ts` and would break across Next.js server instances. **Recommend a per-recalc-invocation memo only** (so a cascade over 114 children issues one definition query per entity type, not 114) — that is a local variable, not a cache.

**`resultType` is never written.** `field-dialog.tsx:109` builds `config = { expression }` with no `resultType`. The unused `FormulaEditor` component would have set `resultType: 'number'` but is dead code (see Pitfall 9). So the recalc **cannot rely on `resultType`** for coercion; treat it as optional and absent.

## Cross-Entity Dependency Direction (Research Task 4)

### What entity prefixes are actually supported: **none are defined.**

This is the biggest gap in D-03. `evaluateFormula`'s third parameter is `relatedEntities?: Record<string, Record<string, unknown>>`, keyed by an arbitrary string, and `extractDependencies('{{Org.Rev}}')` returns the raw string `'Org.Rev'`. The engine splits on `.` and looks up `relatedEntities['Org']` (`formula-engine.ts:179`), returning `error: 'Unknown entity: Org'` if absent.

**The `relatedEntities` prop is threaded through three components and never passed by any caller.** Verified by grep: it appears in `formula-field.tsx`, `field-renderer.tsx`, `custom-fields-section.tsx` and `formula-engine.ts` — and in **zero** call sites. All four detail pages (`deals/[id]/page.tsx:252`, `organizations/[id]/page.tsx:189`, `people/[id]/page.tsx:196`, `activities/[id]/page.tsx:252`) render `<CustomFieldsSection>` **without** `relatedEntities`. So cross-entity formulas are **dead today** — `{{Org.Rev}}` always errors in the UI, which is presumably why nobody has authored one.

**Consequence for planning:** the plan must *define* the prefix vocabulary. There is no precedent to follow. Recommendation, derived from the `entityAttributes` naming already in use (see below) and from `LookupConfig.targetEntity`:

| Formula prefix | Resolves to | Reverse lookup query | Index (Phase 33) |
|---|---|---|---|
| `Organization.<field>` | the row's `organizationId` parent | `deals WHERE organization_id = $1`, `people WHERE organization_id = $1` | `deals_organization_id_idx`, `people_organization_id_idx` |
| `Person.<field>` | the row's `personId` parent | `deals WHERE person_id = $1` | `deals_person_id_idx` |
| `Deal.<field>` | the row's `dealId` parent | `activities WHERE deal_id = $1` | `activities_deal_id_idx` |

Accept a short alias set (`Org`, `Organization`) only if the plan documents it; a single canonical spelling is cleaner. Whatever is chosen must be reflected in the (currently non-existent) authoring help text at `field-dialog.tsx:237`, which today says only "Functions: MATH, TEXT, DATE, LOGIC" and does not mention dot notation at all — while the dead `FormulaEditor` says "Use dot notation for related entities: `{{Organization.Revenue}}`". `Organization` is the better choice for consistency with that dead-but-documented string and with `EntityType`.

### The native-attribute vocabulary that *does* exist

`CustomFieldsSection`'s `entityAttributes` prop (`custom-fields-section.tsx:29`, merged into `allFieldValues` at `:50`) is the de facto contract for referencing native columns:

| Entity | Attributes exposed to formulas today | Source |
|---|---|---|
| deal | `Value` (number), `Title`, `Notes`, `ExpectedCloseDate` (Date) | `deals/[id]/page.tsx:257` |
| organization | `Name`, `Website`, `Industry`, `Notes` | `organizations/[id]/page.tsx:194` |
| person | `FirstName`, `LastName`, `Email`, `Phone`, `Notes` | `people/[id]/page.tsx:201` |
| activity | **none — `entityAttributes` is not passed** | `activities/[id]/page.tsx:252` |

This map is duplicated inline in four page files and must be **extracted into a shared server-side function** in `formula-recalc.ts`, or the server and client will disagree about what `{{Value}}` means. The activity gap should be filled (recommend `Title`, `Notes`, `DueDate`, `CompletedAt`) or explicitly deferred.

I verified the engine handles these shapes: `DATE.year(new Date('2026-06-15'))` -> `2026`, and `'1000.00' * 2` -> `2000` (deal `value` is a `numeric` column, so Drizzle hands back a string — arithmetic still works).

### Measured fan-out (live data)

```
deals per organization:      max 114   avg 1.08   p99 3    (19,515 orgs have >=1 deal)
   top: 114, 90, 33, 28, 23
people per organization:     max  10   avg 1.02   p99 2
deals per person:            max  29   avg 1.09
activities per deal:         max 117   avg 4.49   p99 33
```

### Is the reverse lookup indexed? **Yes — measured.**

```
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, custom_fields FROM deals
WHERE organization_id = '34df4307-...' AND deleted_at IS NULL;   -- the worst org, 114 deals

Bitmap Heap Scan on deals (cost=5.30..382.35 rows=114) (actual time=0.773..0.846 rows=114)
  Recheck Cond: (organization_id = '34df4307-...')
  Filter: (deleted_at IS NULL)
  Heap Blocks: exact=22
  Buffers: shared hit=22 read=3
  -> Bitmap Index Scan on deals_organization_id_idx (actual time=0.761 rows=114)
Execution Time: 0.909 ms
```

Phase 33's indexes make every cascade direction cheap. **The DB is not the bottleneck — QuickJS is.** 114 rows cost 0.9 ms to fetch and 137 ms to evaluate one formula each.

### Realistic worst case

| Scenario | Rows touched | Evaluations (1 formula/row) | Wall time @1.2 ms |
|---|---|---|---|
| Typical org save (p99) | 3 deals + 2 people | 5 | 6 ms |
| Worst org save, 1 formula | 114 deals + 10 people | 124 | ~149 ms |
| Worst org save, 3 formulas | 124 rows | 372 | ~446 ms (measured 342 evals = 442 ms) |
| Worst deal save -> activities | 117 activities | 117 | ~140 ms |
| **2-hop org -> deals -> activities** | 114 + ~512 | ~626 | **~750 ms** |
| CSV import, 100-row batch, 3 formulas | 100 | 300 | ~360 ms per batch |

## QuickJS on the Server (Research Task 5)

### Does it work in a Node server context? **Yes, with a caveat about the Docker standalone build.**

Two independent confirmations:

1. **Existing production precedent.** `src/lib/execution/actions/transform.ts:1` does `import { getQuickJS } from "quickjs-emscripten"` and calls it at `:92`, registered as the `javascript_transform` workflow action. That module is reached only from the server (execution engine -> action registry), bootstrapped by `instrumentation.ts`. STATE.md records the workflow engine verified end-to-end in Docker on 2026-08-08. So the project has already shipped server-side QuickJS.
2. **Direct measurement in plain Node** (v24.13.1, `quickjs-emscripten` 0.32.0) — see numbers below — and under vitest (`environment: 'node'`): `src/lib/formula-engine.test.ts` runs 63 tests, ~50 of them real QuickJS evaluations, in **258 ms**, exit 0.

**The caveat, which the plan must probe rather than assume.** `quickjs-emscripten` 0.32 uses the `wasmfile` variant family: the WASM is a **separate `.wasm` file** resolved at runtime via `new URL("emscripten-module.wasm", import.meta.url)` + `readFileSync` (confirmed by grepping `node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.mjs`). In the current build output:
- `.next/static/media/emscripten-module.*.wasm` — 4 files present (client asset emission)
- `.next/server/**` and `.next/standalone/**` — **zero `.wasm` files**
- `.next/server/app/deals/[id]/page.js.nft.json` lists 8 quickjs entries, **all `.js` chunks, no `.wasm`**
- `.next/server/instrumentation.js.nft.json` lists only 3 files and no quickjs at all
- `quickjs-emscripten` is **not** in `next.config.ts`'s `serverExternalPackages` (which lists only `["argon2", "pipedrive"]`)

Mitigating factors: the Dockerfile does `COPY --from=builder /app/node_modules ./node_modules` (the **full** `node_modules`, so the real `.wasm` exists on disk in the runner image) and `COPY .next/static ./.next/static`. And the Dockerfile already carries a hand-rolled post-build copy step for exactly this class of standalone-tracing gap (instrumentation chunks). Note the current build artifact is dated **Mar 23** and predates Phases 32/33, so it is weak evidence either way.

**Recommendation for the plan:** add an early task that (a) adds `quickjs-emscripten` to `serverExternalPackages` in `next.config.ts` *or* proves it is unnecessary, and (b) after `docker compose up --build`, saves an entity through the UI with a formula field defined and confirms the recalculated value lands in Postgres. Do not defer this to the end — if `getQuickJS()` throws in the container, every write path fails and the failure mode is a 500 on save.

### Measured per-evaluation cost

Environment: Node v24.13.1, `quickjs-emscripten` 0.32.0, host machine (not the container). Method: mirrored `evaluateFormula`'s exact hot path (`newContext` -> inject `FORMULA_FUNCTIONS` -> inject a 22-key `fields` object -> eval `MATH.round((fields["Price"] - fields["Discount"]) * 1.15)` -> `dump` -> `dispose`).

| Measurement | Result |
|---|---|
| `getQuickJS()` first call (WASM compile) | **18.51 ms**, once per process |
| `getQuickJS()` subsequent calls | 0.006 ms (module-level cached) |
| First evaluation (JIT warmup) | 37.4 ms |
| 10 evaluations | 93.4 ms total -> 9.34 ms each |
| 100 evaluations | 209.3 ms -> 2.09 ms each |
| 342 evaluations | 442.5 ms -> **1.29 ms each** |
| 1000 evaluations | 1194.9 ms -> **1.195 ms each** |
| `newContext` + `dispose` alone, x500 | 0.399 ms each |
| `newContext` + `FORMULA_FUNCTIONS` + `dispose`, x500 | 0.956 ms each |
| 1000 evaluations reusing **one** context | 244.9 ms -> **0.245 ms each** (~5x faster) |

**Interpretation:** the steady-state cost is **~1.2 ms per evaluation**, and ~80% of it is context creation plus re-injecting the 50-line `FORMULA_FUNCTIONS` prelude — not the expression itself. The first request to a cold server pays an extra ~55 ms (18.5 cold start + 37 first-eval warmup); subsequent requests do not.

### Is N formulas x M rows viable in a request? Yes, up to a few hundred.

Budget guidance: a synchronous save should not add more than ~500 ms. At 1.2 ms/evaluation that is **~400 evaluations**.

**Recommended D-04 bound: a hard cap of 500 total evaluations per `recalculateFormulas()` invocation (≈600 ms measured), combined with cascade depth 1.**

Justification the planner can cite:
- 500 evaluations x 1.195 ms = 598 ms — measured, not estimated.
- It admits the **entire** measured worst case for a single hop (worst org = 124 child rows; even 4 formulas each = 496).
- It rejects the 2-hop case (~626 evaluations, ~750 ms) by construction via the depth limit, so the cap rarely trips.
- It is expressible as a simple decrementing counter threaded through the walk, which makes the SC-4 "no evaluation happened" assertion and the "budget exceeded" assertion the *same* instrumentation.
- The warning should name the parent entity type + id, the child entity type, the number of children found, and the number skipped — enough to diagnose from logs without a repro. Recommend `console.warn` with a `[formula-recalc]` prefix, matching the existing `[workflow-trigger]` / `[formula-recalc]` logging convention in `matcher.ts`.

A row-count-only cap (e.g. "200 rows") is worse: it does not scale with the number of formulas per entity, so 200 rows x 5 formulas = 1000 evaluations = 1.2 s slips through.

## Reader Audit (Research Task 6)

Verdict: **two of four readers are fine; the CSV export is broken and the workflow condition path is fragile.**

| Reader | File | Reads stored JSONB? | Recomputes? | Sufficient with a correct stored value? |
|---|---|---|---|---|
| REST API responses | `src/lib/api/serialize.ts:40,61,83,104` — `custom_fields: <entity>.customFields` | Yes, verbatim | No | **YES.** SC-1 holds with no change. |
| Webhook payload | `events/subscribers/webhook.ts:19` -> `api/webhooks/deliver.ts:31` | Yes, but via `payload.data` — an **emit-time snapshot of the row object** | No | **Only if recalc runs before `crmBus.emit`.** No code change needed in the reader; a strict ordering requirement on every writer. |
| CSV / JSON export | `src/lib/export/formatters.ts:20` `flattenCustomFields` -> `custom_${key}: value` -> `Papa.unparse` | Yes, verbatim | No | **NO — needs a change.** See below. |
| Pipedrive CSV/JSON export | `src/lib/export/pipedrive.ts` (passes `custom_*` keys through, `String(value)`) | Yes | No | **NO — same defect.** |
| Workflow condition evaluator | `execution/condition-evaluator.ts:16` `resolveFieldPath` walks dot paths over `context` | Yes, via `trigger.data` — also an **emit-time snapshot** (`triggers/matcher.ts` builds `data: { ...payload.data, ... }`) | No | **Fragile.** See below. |

### The CSV defect (measured, blocks SC-2)

`flattenCustomFields` copies the JSONB value unchanged, and `Papa.unparse` stringifies objects. Verified with the installed papaparse 5.5.3:

```
input rows: custom_Margin = { formula: true, value: 1035, error: null }
            custom_Margin = { formula: true, value: null, error: 'Unknown field: Nope' }
            custom_Margin = 1035

output:
id,name,custom_Margin
1,Acme,[object Object]
2,Beta,[object Object]
3,Gamma,1035
```

SC-2 says "a CSV export ... produced right after a save carry the recalculated values." `[object Object]` does not. **The plan must unwrap the wrapper in `flattenCustomFields`** (and check `pipedrive.ts`'s `String(value)` path):

```ts
// in flattenCustomFields, per value
const v = isFormulaWrapper(value) ? value.error ? `#ERROR: ${value.error}` : value.value : value
```

Storing a bare scalar on success and the wrapper only on error is *not* a sufficient alternative: (a) D-05 mandates the wrapper for errors, so `[object Object]` still leaks for every errored formula; (b) `formula-field.tsx:50` uses `'formula' in value` to decide whether to trust the cached value — a bare scalar makes the client re-evaluate on every render, discarding the whole point of the stored value. Keep the wrapper, fix the reader.

### The workflow condition fragility (affects SC-3)

`resolveFieldPath` splits the configured path on `.` and walks. So reaching a formula value requires a path like `trigger.data.customFields.Margin.value`. Two problems, both pre-existing:

1. **The `.value` hop is required.** Without it, `fieldValue` is the wrapper object and `evaluateOperator('greater_than', ...)` does `Number({...})` -> `NaN` -> `false`. A condition would silently never fire. SC-3 says the condition must "branch on the current value" — the plan should either (a) document that the path must end in `.value` and surface that in the condition-builder UI, or (b) normalise formula wrappers to their `.value` when building the trigger envelope in `matcher.ts`. **(b) is cleaner and cheaper** and does not change the stored shape.
2. **Field names with spaces, dots, or punctuation are unreachable** by dot-notation regardless. This dataset's names include `"E-mail de Contato 1"`, `"Consumo Médio em MWh"`, `"CNPJ / CPF"`, `"Tem solução de solar?"`. This is a pre-existing limitation of `resolveFieldPath` affecting *all* custom fields, not just formulas — flag it, do not fix it in this phase.

Also note the key casing is inconsistent between writers: mutations emit the raw camelCase row (`customFields`), while `v1/deals/route.ts:249` and `v1/people/route.ts:153` emit `serializeDeal(deal)` / `serializePerson(person)` (snake_case `custom_fields`). So the correct condition path differs depending on which write path fired the event. Pre-existing; worth a note in the plan because it directly affects how an SC-3 test must be written.

## Runtime State Inventory

This is not a rename/refactor phase, but the same discipline applies to "what already holds a formula value outside the code."

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — 0 formula definitions and 0 `{ formula: ... }` JSONB values across all four entity tables (46,055 orgs / 38,345 people / 25,206 deals / 79,023 activities). Verified by `jsonb_each` scan. | None. No backfill (also deferred by CONTEXT.md). |
| Live service config | **None** — no external service holds formula expressions. The only formula config lives in `custom_field_definitions.config` in Postgres, which is in the primary DB and covered by normal backup. | None. |
| OS-registered state | **None** — no cron/systemd/scheduler entry references formulas. Processors are bootstrapped in-process by `instrumentation.ts`. | None. |
| Secrets / env vars | **None** — no formula-related env var. `FILE_STORAGE`, `DATABASE_URL` etc. are unrelated. | None. |
| Build artifacts | **`.next/` is stale (BUILD_ID dated Mar 23)** and contains 4 client `emscripten-module.*.wasm` assets but **no server-side `.wasm`**. `.next/standalone` has quickjs `ssr/` chunks only. | Rebuild in Docker as part of the runtime probe task; do not draw conclusions from the current artifact. |
| Client-side cached values | `CustomFieldsSection` keeps `localValues` in React state (`custom-fields-section.tsx:47`) and posts the whole blob back on every field save — **including the formula key**. | The recalc must overwrite formula keys server-side and strip them from client input. This is a code change, not a data migration. |

## Common Pitfalls

### Pitfall 1: A missing JSONB key produces a fabricated error, not a blank
**What goes wrong:** `{{Consumo Médio em MWh}} * 2` on a deal that has never had that field filled in stores `{ formula: true, value: null, error: 'Unknown field: Consumo Médio em MWh' }` under D-05.
**Why it happens:** `formula-engine.ts:191` — `if (!(dep in fields))` returns an error; only an explicit `null` (`:200`) returns blank. Measured.
**How to avoid:** seed `fieldValues` with `null` for every active definition name (Pattern 2).
**Warning signs:** most rows show `#ERROR` in the UI for a formula that looks correct; the error text names a field that visibly exists in the admin field list.

### Pitfall 2: A formula referencing another formula silently evaluates to blank
**What goes wrong:** `{{Margin}} * 2` where `Margin` is stored as `{ formula: true, value: 100, error: null }` returns `{ value: null, error: null }` — blank, **no error**. Measured.
**Why it happens:** the wrapper object is JSON-injected into the sandbox, arithmetic on it yields `NaN`, and `vm.dump` of `NaN` surfaces as `null`.
**How to avoid:** unwrap wrappers before building `fieldValues`, and evaluate formulas in topological order so `Margin` is computed before its dependent.
**Warning signs:** a formula-over-formula shows Empty with no error. The `field-dialog.tsx:244` chip list excludes formula fields, so this only happens when a user hand-types the reference — but nothing prevents it.

### Pitfall 3: Recalc after `crmBus.emit` fails SC-2 and SC-3 while the DB row is correct
**What goes wrong:** the webhook body and the workflow trigger envelope carry pre-recalc values; a manual DB check "proves" the fix works.
**Why it happens:** `webhook.ts:19` passes `payload.data`; `matcher.ts` spreads `...payload.data`. Both are emit-time snapshots of a JS object, not re-reads.
**How to avoid:** recalc, then build the event payload from the post-recalc `customFields`.
**Warning signs:** SC-1 passes, SC-2/SC-3 fail. A test that only asserts on the DB row cannot detect this — the SC-2/SC-3 tests must assert on the emitted payload.

### Pitfall 4: Wrapper objects serialise to `[object Object]` in CSV
**What goes wrong:** SC-2's CSV half fails. Measured with papaparse 5.5.3.
**How to avoid:** unwrap in `flattenCustomFields` (and check `export/pipedrive.ts`).
**Warning signs:** the export column is populated but every cell reads `[object Object]`.

### Pitfall 5: The mutation layer never writes `customFields`, so recalc merges into nothing
**What goes wrong:** `createDealMutation({ customFields: {...} })` validates the field and drops it. Nine of the seventeen write paths route through a mutation.
**Why it happens:** the Zod schemas at `mutations/{deals:19,people:17,organizations:15,activities:17}.ts` accept `customFields`, but the `db.insert(...).values({...})` calls at `:149/:90/:70/:98` omit the column entirely. Verified by reading all four.
**How to avoid:** fix the drop as part of this phase (it is a prerequisite for D-02, and it is silent data loss on `POST /api/v1/organizations` and `POST /api/v1/activities` today).
**Warning signs:** `POST /api/v1/organizations` with `custom_fields` returns 201 and `custom_fields: {}`.

### Pitfall 6: `extractDependencies` does not dedupe or validate
**What goes wrong:** `{{A}} + {{A}}` yields `['A','A']` (its own test asserts this), so a naive counter double-counts evaluations against the D-04 budget and a naive `changedFields` intersection does redundant work.
**How to avoid:** `new Set(extractDependencies(expr))` at the call site. Do not change the function — its test pins the duplicate behaviour.

### Pitfall 7: `multi_select` values are arrays and arithmetic on them string-concatenates
**What goes wrong:** `{{Origem}} + 1` where `Origem = ['Outbound Manual']` yields `'Outbound Manual1'` (measured), not an error and not blank.
**Why it happens:** JS array-to-primitive coercion inside the sandbox.
**How to avoid:** nothing in this phase — CONTEXT.md forbids changing evaluation semantics. **Document it.** It matters because the live DB stores every `multi_select` as an array (`{"Origem":["Outbound Manual"]}`), and `multi_select` is one of the most common field types here.

### Pitfall 8: `saveFieldValues` has no `changedFields` and replaces the whole blob
**What goes wrong:** the UI path (path #1, the most-used one) either recalcs unconditionally — violating SC-4 — or does not recalc at all.
**Why it happens:** `saveFieldValues(entityType, entityId, values)` receives a full replacement object and does `db.update(table).set({ customFields: values })` with no read of the prior state.
**How to avoid:** read the current `customFields` (or use `UPDATE ... RETURNING` plus the pre-image), diff the keys, and pass the diff as `changedFields`. Also strip formula keys from the incoming `values` so the client cannot write them.
**Warning signs:** SC-4's negative test passes for the API path and fails for the UI path.

### Pitfall 9: `validateFormula` and `FormulaEditor` are dead code — expressions are wholly unvalidated
**What goes wrong:** the recalc receives arbitrary garbage: self-references, cycles, unknown fields, syntax errors.
**Why it happens:** `FormulaEditor` (which calls `validateFormula`) is exported from `components/custom-fields/index.ts:15` and **imported by nothing**. The live authoring UI is `field-dialog.tsx`, which at `:109` does `config = { expression }` with zero validation, and whose available-field chip list at `:244` merely *discourages* formula-to-formula references.
**How to avoid:** D-05 already covers it — every failure mode must persist an error and let the save succeed. Do not assume any invariant about the expression. Optionally wire `validateFormula` into `field-dialog.tsx`, but that touches the authoring UI which CONTEXT.md puts out of scope.
**Warning signs:** an admin can save `{{Self}}` on a field named `Self`, or `LOGIC.if(` unbalanced.

### Pitfall 10: `DATE.today()` / `DATE.now()` make formulas non-deterministic
**What goes wrong:** `DATE.diffDays(DATE.today(), {{Start Date}})` — one of the five documented `FORMULA_EXAMPLES` — is correct at save time and stale the next day. No save-triggered recalc can fix that.
**How to avoid:** nothing in this phase. CONTEXT.md explicitly defers "recalculating formulas on a schedule or on read." **Name this limitation in the plan** so the phase is not judged against it during verification.

### Pitfall 11: Do not regress the Phase 32 H-01 fix
**What goes wrong:** touching `formula-engine.ts` reintroduces `null`-coerced-to-`0` in mixed expressions, turning a blank currency field into a plausible money figure.
**Why it happens:** the carve-out is decided **per field reference** via `isReferenceUsedInArithmetic` (`:134`), deliberately narrower than the whole-expression version the review originally proposed. The adjacency rule "never look past a `)`" is load-bearing.
**How to avoid:** treat `formula-engine.ts` as frozen. The 6 regression tests at `formula-engine.test.ts:50-104` must stay green.

## Code Examples

### Loading formula definitions (existing helper, verified 0.190 ms)
```ts
// Source: src/lib/custom-fields.ts:15
export async function getActiveFieldDefinitions(entityType: EntityType) {
  return db.select()
    .from(customFieldDefinitions)
    .where(and(
      eq(customFieldDefinitions.entityType, entityType),
      isNull(customFieldDefinitions.deletedAt)
    ))
    .orderBy(customFieldDefinitions.position)
}
```

### Reading a formula expression from a definition
```ts
// Source: src/components/custom-fields/formula-field.tsx:46
const config = definition.config as FormulaConfig | null
const expression = config?.expression || ''
// NB: config.resultType is never written by field-dialog.tsx — do not depend on it.
```

### Evaluating (engine signature, unchanged)
```ts
// Source: src/lib/formula-engine.ts:151
export async function evaluateFormula(
  expression: string,
  fieldValues?: Record<string, unknown>,
  relatedEntities?: RelatedEntities   // { [entityPrefix]: { [fieldName]: value } }
): Promise<{ value: unknown; error: string | null }>
```

### The stored wrapper shape the client already understands
```ts
// Source: src/components/custom-fields/formula-field.tsx:50-57
const isCachedResult = typeof value === 'object' && value !== null && 'formula' in value
if (isCachedResult) {
  const cached = value as { formula: true; value: unknown; error: string | null }
  setCalculatedValue(cached.value)
  setError(cached.error)
}
```

### Reverse child lookup (EXPLAIN-verified index usage)
```ts
// Bitmap Index Scan on deals_organization_id_idx — 114 rows, 0.909 ms
const children = await db
  .select({ id: deals.id, customFields: deals.customFields })
  .from(deals)
  .where(and(eq(deals.organizationId, orgId), isNull(deals.deletedAt)))
```

### Existing mock pattern the new tests must follow
```ts
// Source: src/lib/mutations/deals.test.ts:1-25 (all 18 DB-touching test files use this shape)
vi.mock("@/db", () => ({
  db: {
    query: { deals: { findFirst: vi.fn(), findMany: vi.fn() } },
    insert: vi.fn(), update: vi.fn(), delete: vi.fn(), select: vi.fn(),
  },
}))
vi.mock("@/lib/events", () => ({ crmBus: { emit: vi.fn() } }))
```

## SC-4 Negative Test Design (Research Task 7)

SC-4 requires proving recalc does **not** run for an irrelevant change. Asserting on final values cannot do this — an unnecessary recalc produces the *same* value.

**Recommended: assert on `evaluateFormula` call count via `vi.mock("@/lib/formula-engine")`.** This is mockable and consistent with the existing patterns.

```ts
// src/lib/formula-recalc.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    query: {
      deals: { findFirst: vi.fn(), findMany: vi.fn() },
      organizations: { findFirst: vi.fn() },
    },
  },
}))

// The whole point of the test: count evaluations.
vi.mock("@/lib/formula-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/formula-engine")>()
  return {
    ...actual,                                   // keep the REAL extractDependencies
    evaluateFormula: vi.fn(actual.evaluateFormula), // spy, real behaviour
  }
})

import { evaluateFormula } from "@/lib/formula-engine"
import { recalculateFormulas } from "./formula-recalc"

const evalSpy = evaluateFormula as unknown as ReturnType<typeof vi.fn>
beforeEach(() => vi.clearAllMocks())

it("does not evaluate anything when no formula references the changed field", async () => {
  // definitions: one formula "Margin" = {{Price}} - {{Cost}}
  // changedFields: ["notes"]
  await recalculateFormulas({ entityType: "deal", entityId: "d1", changedFields: ["notes"] })
  expect(evalSpy).toHaveBeenCalledTimes(0)   // FAILS if recalc over-triggers
})

it("evaluates exactly once when the changed field is referenced", async () => {
  await recalculateFormulas({ entityType: "deal", entityId: "d1", changedFields: ["Price"] })
  expect(evalSpy).toHaveBeenCalledTimes(1)
})
```

**Why `importOriginal` + spy rather than a bare stub:** it keeps `extractDependencies` and `detectCircularDependency` real, so the scoping logic under test is exercised against the actual dependency parser — the exact class of gap that let the Phase 32 H-01 bug through a green suite.

**What is mockable, given the existing patterns:**
- `@/db` — yes; all 18 DB-touching test files already mock it as a plain object of `vi.fn()` chains.
- `@/lib/events` — yes; `{ crmBus: { emit: vi.fn() } }` is the established shape.
- `@/lib/formula-engine` — yes, and cheaply: it has **no DB imports**, only `quickjs-emscripten`. It can be spied with real behaviour intact (`importOriginal`), or fully stubbed for pure-count tests.
- `quickjs-emscripten` — do **not** mock it. It runs in 258 ms for 63 tests; real evaluation is affordable and far more valuable.

**Additional assertions the D-07 test set needs:**
1. Bulk-save scoping — changing 10 irrelevant fields at once still yields 0 evaluations.
2. Cross-entity scoping — saving `organization.industry` when the only deal formula references `{{Organization.Name}}` yields 0 evaluations and issues **no** child query.
3. Cascade — saving `organization.name` when a deal formula references `{{Organization.Name}}` runs exactly `childCount` evaluations.
4. Bound — with a stubbed child list of 600 rows and a 500 budget, exactly 500 evaluations run and `console.warn` fires once naming the parent id and the skipped count (`vi.spyOn(console, 'warn')`).
5. Error persistence (D-05/D-06) — an expression that errors writes `{ formula: true, value: null, error: <msg> }` and the enclosing write still returns `{ success: true }`; assert the previous value was **replaced**, not retained.
6. Ordering — recalc completes before `crmBus.emit` (assert the `customFields` inside the emitted payload equals the recomputed value, per Pitfall 3).
7. Blank vs error — a formula over a field absent from the JSONB stores `value: null, error: null` (not `Unknown field:`), proving Pattern 2 is implemented.
8. Wrapper unwrapping — a formula over another formula's stored wrapper produces the numeric result, not blank.
9. CSV — `flattenCustomFields` on a wrapper yields the scalar, and `Papa.unparse` of the row does not contain `[object Object]`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Formula null carve-out decided per **expression** | Decided per **field reference** (`isReferenceUsedInArithmetic`) | Phase 32, commit `ec4e974` | Any recalc built on assumptions from before that commit will look wrong. 6 regression tests guard it. Read the code, not the review's proposed fix (the implementation deliberately departed from it). |
| CRM entity FKs unindexed | 11 single-column btrees on the four CRM tables | Phase 33, migration `drizzle/0012_typical_radioactive_man.sql` | Makes every cross-entity reverse lookup cheap — 0.909 ms for the worst-case 114-row fetch. Without Phase 33 the cascade would have been a Seq Scan over 25,206 deals per parent save. |
| `trigger` (singular) on workflows | `triggers` array | v1.2 | Not directly relevant, but `matcher.ts` iterates the array — relevant if an SC-3 test constructs a workflow fixture. |
| Direct `triggerWebhook` calls scattered in routes | `crmBus` -> `registerWebhookSubscriber` | Phase 24 | Means there is exactly one place the webhook payload is built, and it is an emit-time snapshot. |

**Deprecated / dead code in this area:**
- `FormulaEditor` (`src/components/custom-fields/formula-editor.tsx`) — exported, imported by nothing. The live authoring UI is `field-dialog.tsx`.
- `validateFormula` (`src/lib/formula-helpers.ts:65`) — only caller is the dead `FormulaEditor`. So no formula is validated anywhere today.
- `FormulaConfig.resultType` — declared in the schema type, never written by the live authoring path.
- `relatedEntities` prop chain (`custom-fields-section` -> `field-renderer` -> `formula-field`) — plumbed, never supplied. Cross-entity formulas do not work at all today.

## Project Constraints (from CLAUDE.md)

No project-level `./CLAUDE.md` exists (verified). The global user instructions and the auto-memory impose:

| Directive | Source | Effect on this phase |
|---|---|---|
| **Always use Docker, never a local dev server.** Start with `docker compose up -d`; app on `http://localhost:3001`; never `npm run dev` / `next dev`. | auto-memory | The runtime probe task (QuickJS WASM in the standalone build) must be done in Docker. `sudo` is required for `docker` and prompts for a password in this environment — the plan should surface that as an operator step, not an automated one. |
| Postgres on host port **5433**, user/db `pipelite` (no `postgres` user). | auto-memory | Any verification query in the plan must use `-U pipelite`. |
| Migrations via `npx drizzle-kit migrate`. | auto-memory | This phase needs **no migration** — no schema change (the JSONB column and the definitions table already exist). |
| Server actions return `{ success: true/false, error/id }`. | auto-memory | The recalc helper is internal; if any action's shape changes, keep the convention. |
| Mutation layer (`src/lib/mutations/`) is the established reuse point. | auto-memory / STATE.md | D-01's shared helper should live in `src/lib/`, called from mutations — consistent with the existing layering. |
| Tests mock `@/db` via `vi.mock("@/db")`. | CONTEXT.md / verified in all 18 DB-touching files | The SC-4 test design above follows this. |
| `rtk` shell hook corrupts/swallows output. | environment notes | All research commands here were redirected to files and read back with `node -e`; the plan's verification steps should do the same, and use `rtk proxy` for `vitest`/`git` when raw output matters. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Everything | ✓ | v24.13.1 (host); `node:20-alpine` in Docker | — |
| PostgreSQL (live data) | Fan-out measurement, verification queries | ✓ | reachable at `localhost:5433` as `pipelite` | — |
| `postgres` npm driver | Direct read-only DB inspection from a script | ✓ | 3.4.8 | — |
| `quickjs-emscripten` | Formula evaluation | ✓ | 0.32.0 | none — the phase is impossible without it |
| vitest | D-07 TDD | ✓ | 4.0.18, `environment: 'node'` | — |
| `psql` CLI | Ad-hoc SQL | ✗ | — | Used a `node` + `postgres` driver script instead (worked) |
| Docker CLI **without a password prompt** | Rebuilding and probing the standalone image | ✗ | `sudo -n docker compose ps` -> `sudo: a password is required` | Per environment rules I did not supply a password. The app itself **is running** (HTTP 200 on `http://localhost:3001`), so the container is up — only privileged docker commands are blocked from this session. |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:**
- `psql` — replaced by a `node` script using the already-installed `postgres` driver. All queries in this document were run that way.
- Privileged `docker` — the standalone-build WASM probe must be an operator-executed step in the plan, not an automated task. Flag it as `checkpoint:human-verify`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | `vitest.config.ts` — `environment: 'node'`, `globals: false`, `include: ['src/**/*.{test,spec}.?(c\|m)[jt]s?(x)']`, `exclude: [...configDefaults.exclude, '**/.next/**']`, alias `@ -> ./src` |
| Quick run command | `npx vitest run src/lib/formula-recalc.test.ts` (measured 0.87 s wall for the comparable 63-test formula-engine file) |
| Full suite command | `npm test` (= `vitest run`) — current baseline **41 files / 461 passed / 4 skipped, exit 0** |
| Other gates | `npx tsc --noEmit` exit 0; `npx eslint` 0 errors (128 warnings) |
| Reporter caveat | `--reporter=basic` **does not exist** in vitest 4 and hard-fails with `ERR_LOAD_URL`. Use the default reporter. Wrap in `rtk proxy` when raw timing output matters (the `rtk` hook otherwise collapses it to `PASS (n) FAIL (0)`). |
| No DB needed | The Phase 32 review verified the full suite passes under `env -i` with no `DATABASE_URL`. Keep the new tests DB-free by mocking `@/db`. |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FORMULA-01 | `recalculateFormulas` writes the recomputed wrapper into the entity's `customFields` JSONB | unit | `npx vitest run src/lib/formula-recalc.test.ts` | ❌ Wave 0 |
| FORMULA-01 | Every mutation calls the helper before `crmBus.emit`, and the emitted payload carries the recomputed value | unit | `npx vitest run src/lib/mutations/deals.test.ts src/lib/mutations/people.test.ts src/lib/mutations/organizations.test.ts src/lib/mutations/activities.test.ts` | ✅ (extend) |
| FORMULA-01 | The UI path (`saveFieldValues`) recalcs and strips client-supplied formula keys | unit | `npx vitest run src/lib/custom-fields.test.ts` | ❌ Wave 0 |
| FORMULA-01 | v1 route write paths recalc (deals/people/orgs/activities, collection + `[id]` + batch) | unit | `npx vitest run "src/app/api/v1/**/__tests__/*.test.ts"` | ❌ Wave 0 (only `workflows/__tests__/runs-routes.test.ts` exists as a precedent) |
| FORMULA-01 / SC-2 | `flattenCustomFields` unwraps the wrapper so CSV contains the scalar, never `[object Object]` | unit | `npx vitest run src/lib/export/formatters.test.ts` | ❌ Wave 0 |
| FORMULA-01 / SC-3 | A workflow condition over a formula field branches on the current value | unit | `npx vitest run src/lib/execution/condition-evaluator.test.ts src/lib/triggers/matcher.test.ts` | ✅ (extend) |
| FORMULA-02 / SC-4 | Zero evaluations when no formula references any changed field (incl. a 10-field bulk change) | unit (spy on call count) | `npx vitest run src/lib/formula-recalc.test.ts` | ❌ Wave 0 |
| FORMULA-02 | Cross-entity cascade fires only when a dot-ref matches a changed parent field, and issues no child query otherwise | unit | `npx vitest run src/lib/formula-recalc.test.ts` | ❌ Wave 0 |
| FORMULA-02 / D-04 | Evaluation budget caps the cascade and logs exactly one warning naming the parent and skipped count | unit (`vi.spyOn(console,'warn')`) | `npx vitest run src/lib/formula-recalc.test.ts` | ❌ Wave 0 |
| D-05 / D-06 | An erroring formula persists `{ formula:true, value:null, error }`, replaces any prior value, and the save still succeeds | unit | `npx vitest run src/lib/formula-recalc.test.ts` | ❌ Wave 0 |
| Regression | The Phase 32 per-reference null carve-out still holds | unit | `npx vitest run src/lib/formula-engine.test.ts` | ✅ (must stay green, 63 tests) |
| Runtime | `getQuickJS()` succeeds inside the Docker standalone build and a real save persists the value | manual-only | operator: `sudo docker compose up -d --build`, create a formula field, save a deal, verify JSONB via `psql -U pipelite` | ❌ `checkpoint:human-verify` |

**Manual-only justification:** the Next.js standalone WASM-tracing question cannot be answered by vitest — vitest resolves modules through vite, not through the Next.js server bundler, so a green unit test says nothing about the container. It also needs privileged `docker` (unavailable to an automated task in this environment).

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/formula-recalc.test.ts` plus the specific file touched (sub-second each).
- **Per wave merge:** `npm test && npx tsc --noEmit && npx eslint` — the three gates the repo already enforces in CI.
- **Phase gate:** full suite green (≥461 passing, no regressions) before `/gsd:verify-work`, plus the Docker runtime checkpoint signed off.

### Wave 0 Gaps
- [ ] `src/lib/formula-recalc.test.ts` — covers FORMULA-01, FORMULA-02, D-04, D-05, D-06 (the primary D-07 TDD target)
- [ ] `src/lib/custom-fields.test.ts` — covers the UI write path (`saveFieldValues`), which has **no test file at all** today
- [ ] `src/lib/export/formatters.test.ts` — covers SC-2's CSV half; **no test file at all** today
- [ ] `src/app/api/v1/{deals,people,organizations,activities}/__tests__/*.test.ts` — covers D-02's API half; only `v1/workflows/__tests__/runs-routes.test.ts` exists as a mocking precedent to copy
- [ ] Extend `src/lib/mutations/{deals,people,organizations,activities}.test.ts` with recalc-before-emit assertions
- [ ] Extend `src/lib/triggers/matcher.test.ts` / `src/lib/execution/condition-evaluator.test.ts` for SC-3
- [ ] No framework install needed — vitest 4.0.18 is configured and green

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json`, so this section applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | Existing: `auth()` in server actions / `withApiAuth` in v1 routes. This phase adds no new endpoint. |
| V3 Session Management | no | Unchanged. |
| V4 Access Control | **yes** | The recalc cascade reads and **writes child rows the saving user may not own**. `deals`/`people`/`organizations` all carry `ownerId` and the v1 routes filter on it, but `PUT /api/v1/activities/[id]` already does no ownership check (a pre-existing IDOR recorded in the Phase 32 review). Decide and document: does the cascade respect `ownerId`, or is a formula value an owner-independent derived fact? Recommend the latter (a derived value must be correct regardless of who triggered the save) but **state it explicitly** — silently writing to another user's rows is otherwise an access-control surprise. |
| V5 Input Validation | **yes** | Two inputs are untrusted: (a) the admin-authored **expression** — unvalidated today (`validateFormula` is dead code), executed in QuickJS; (b) the client-posted **formula field value** — currently writable by any authenticated user via `POST /api/custom-fields/save` and by any API key via `custom_fields`. **Strip formula keys from all client input; the server is the sole writer.** |
| V6 Cryptography | no | None involved. |
| V7 Error Handling & Logging | **yes** | D-05 persists error strings into user-visible JSONB. Those strings come from QuickJS (`e.message`) and from the engine's own messages (`Unknown field: X`). Do not let raw stack traces or DB errors reach the stored `error` field. The D-04 warning must not log full row contents. |
| V11 Business Logic | **yes** | The D-04 budget is the DoS control. Unbounded cascade + 1.2 ms/evaluation is a request-amplification primitive: one cheap `PUT /api/v1/organizations/{id}` could otherwise fan out to thousands of evaluations. |
| V12 Files/Resources | no | No file handling. |

### Known Threat Patterns for Next.js 16 + Drizzle + QuickJS

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Sandbox escape / prototype pollution via an admin-authored expression | Elevation of Privilege | QuickJS WASM isolate with no host bindings — the existing `formula-engine.ts` injects only JSON data and a closed function library. Do **not** add `vm.newFunction` host callbacks. |
| Unbounded CPU via a pathological expression (e.g. a tight loop) | Denial of Service | **Gap.** `transform.ts:97,104` sets an 8 MB memory limit and a 5 s interrupt handler; `formula-engine.ts` sets **neither**. On the client that costs one tab; on the server it blocks a Node worker. Recommend the plan add `runtime.setMemoryLimit` + `setInterruptHandler` to the server recalc path (this is a *hardening* addition around the call, not a change to evaluation semantics, so it does not conflict with CONTEXT.md's scope fence). |
| Request amplification via the cascade | Denial of Service | The D-04 evaluation budget. This is the primary control and is already a locked decision. |
| Client writing arbitrary values to a server-derived field | Tampering | Strip formula keys from `saveFieldValues` input and from the v1 `custom_fields` merge. |
| SQL injection via a field name used in a query | Tampering | Not applicable — field names are JSONB **keys**, never SQL identifiers. Drizzle parameterises the FK lookups. |
| Cross-tenant write via the cascade | Tampering / Elevation | See V4 above — decide and document the `ownerId` policy for cascaded child writes. |
| Error strings leaking internals into JSONB / API responses | Information Disclosure | Persist only the engine's own message or `e.message`; never a stack or a DB error. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `getQuickJS()` succeeds when called from a route handler / server action in the Next.js **standalone Docker** build. Precedent (`transform.ts`) and full-`node_modules` copying support it; the absence of any `.wasm` in `.next/server`/`.next/standalone` and the missing `serverExternalPackages` entry argue against it. Could not test — privileged `docker` is unavailable in this session. | QuickJS on the Server | **High.** Every write path 500s on save. Mitigation: make it an early `checkpoint:human-verify` task and pre-emptively add `quickjs-emscripten` to `serverExternalPackages`. |
| A2 | ~1.2 ms/evaluation measured on the host holds within ~2x inside `node:20-alpine` in Docker. | QuickJS on the Server | Medium — the D-04 bound of 500 would correspond to ~1.2 s rather than ~0.6 s. Re-measure inside the container during the A1 checkpoint and adjust the constant. |
| A3 | `Organization` / `Person` / `Deal` are the right dot-prefixes. **No convention exists** — `relatedEntities` is never populated by any caller, so nothing is established. Chosen for consistency with the dead `FormulaEditor`'s help text and with `EntityType`. | Cross-Entity Dependency Direction | Medium — a later change is a breaking change to every authored formula. Should be confirmed with the user before it becomes a locked decision. |
| A4 | Extending the activity native-attribute map (`Title`, `Notes`, `DueDate`, `CompletedAt`) is desirable. Activities currently expose **none**. | Cross-Entity Dependency Direction | Low — could be deferred, but leaving activities with zero referenceable native attributes makes activity formulas nearly useless. |
| A5 | A cascaded formula recalculation on a child row owned by another user is acceptable (derived-fact semantics). | Security Domain / V4 | Medium — if wrong, the cascade must filter on `ownerId`, which changes both the query and the fan-out numbers. Needs an explicit user decision. |
| A6 | Adding `setMemoryLimit` / `setInterruptHandler` around the server-side evaluation counts as hardening the *call site*, not changing *evaluation semantics*, and is therefore in scope. | Security Domain | Low — if the user disagrees, drop it and record the unbounded-CPU risk as a backlog item. |
| A7 | The current `.next/` build (BUILD_ID dated Mar 23) is not representative of what Phase 32/33 produces. | Runtime State Inventory | Low — only affects how much weight to give the "no `.wasm` in the server output" observation. |
| A8 | `POST /api/internal/email/process` (write path #17) does not touch any field a formula reads, so it needs no recalc call. | Write-Path Inventory | Low — verify while implementing; adding the call is one line. |

## Open Questions

1. **What is the canonical cross-entity prefix vocabulary?**
   - What we know: `extractDependencies` returns raw dot strings; `evaluateFormula` looks up `relatedEntities[prefix]` with an arbitrary key; the dead `FormulaEditor` documents `{{Organization.Revenue}}`; the live `field-dialog.tsx` documents no dot notation at all; **no caller ever passes `relatedEntities`**, so cross-entity formulas are non-functional today.
   - What's unclear: whether to use `Organization`/`Person`/`Deal`, accept aliases like `Org`, or make it configurable.
   - Recommendation: single canonical spelling `Organization` / `Person` / `Deal`; update the help text in `field-dialog.tsx:237`; reject unknown prefixes with the engine's existing `Unknown entity:` error (which D-05 then persists). Confirm with the user during planning since it is effectively a permanent API.

2. **Should the cascade respect `ownerId`?**
   - What we know: all four tables have `ownerId`; the v1 routes filter on it; `PUT /api/v1/activities/[id]` does not (pre-existing IDOR).
   - What's unclear: whether a derived value on another user's row should be updated by this user's save.
   - Recommendation: yes, update it (correctness of a derived fact is owner-independent), but document the decision and do not extend it to any *non*-derived field.

3. **Should formula-to-formula chains be supported in this phase?**
   - What we know: the authoring UI's chip list excludes formula fields, but nothing prevents hand-typing one; the current behaviour is a silent blank (measured); `detectCircularDependency` exists but the only caller builds a single-entry map so it cannot see a real cycle.
   - Recommendation: support them (unwrap + topological order). The unwrap is required anyway to avoid the silent-blank trap, and the topological sort is ~20 lines reusing the existing cycle check. Cap chain depth at the same evaluation budget.

4. **How should the D-04 warning be surfaced beyond `console.warn`?**
   - What we know: the codebase's only convention is prefixed `console.log`/`console.error` (`[workflow-trigger]`, `[formula-recalc]` would match). Phase 42 is "Observability — structured logging."
   - Recommendation: `console.warn('[formula-recalc] ...')` now, with a note that Phase 42 will structure it. Do not build a logging abstraction here.

5. **Does the phase also fix the `customFields` drop in the mutation layer?**
   - What we know: it is silent data loss on `POST /api/v1/organizations` and `POST /api/v1/activities` today, and the recalc has nothing to merge into without it.
   - Recommendation: yes — it is a prerequisite, not scope creep. Call it out as its own task so verification can see it.

## Sources

### Primary (HIGH confidence — direct measurement / source reading in this session)
- Live Postgres (`postgresql://pipelite@localhost:5433/pipelite`, read-only): definition counts by type and entity, `custom_fields` population per table, `jsonb_each` scan for `{ formula: ... }` values, fan-out aggregates (`max`/`avg`/`percentile_cont(0.99)`), `pg_indexes` catalog, two `EXPLAIN (ANALYZE, BUFFERS)` plans. **Zero rows mutated.**
- Benchmark of `quickjs-emscripten` 0.32.0 in Node v24.13.1, mirroring `evaluateFormula`'s hot path: cold start, first eval, 10/100/342/1000-eval loops, context-creation breakdown, reused-context comparison.
- `npx vitest run src/lib/formula-engine.test.ts` via `rtk proxy` — 63 passed, 258 ms, exit 0.
- Throwaway probe test (created, run, **deleted**; working tree verified clean) measuring: wrapper-object arithmetic, array arithmetic, `Date` object handling, absent-vs-`undefined`-vs-`null` keys, numeric-string arithmetic.
- `Papa.unparse` with the installed papaparse 5.5.3 on a wrapper-shaped value -> `[object Object]`.
- Source files read in full or in the relevant range: `src/lib/formula-engine.ts`, `src/lib/formula-helpers.ts`, `src/lib/custom-fields.ts`, `src/db/schema/custom-fields.ts`, `src/lib/mutations/{deals,people,organizations,activities}.ts`, `src/lib/mutations/index.ts`, `src/app/api/custom-fields/save/route.ts`, `src/app/api/v1/{deals,people,organizations,activities}/route.ts` + `[id]/route.ts` + `batch/route.ts`, `src/app/import/actions.ts`, `src/lib/import/pipedrive-api-import-actions.ts` (index), `src/lib/execution/actions/crm.ts`, `src/lib/execution/actions/transform.ts`, `src/lib/execution/condition-evaluator.ts`, `src/lib/events/{types.ts,subscribers/webhook.ts,subscribers/workflow-trigger.ts}`, `src/lib/triggers/matcher.ts`, `src/lib/api/webhooks/deliver.ts`, `src/lib/api/serialize.ts`, `src/lib/export/formatters.ts`, `src/components/custom-fields/{formula-field,formula-editor,custom-fields-section}.tsx`, `src/app/admin/fields/[entityType]/field-dialog.tsx`, `src/app/{deals,people,organizations,activities}/[id]/page.tsx` (CustomFieldsSection call sites), `src/app/{deals,people,organizations,activities}/actions.ts`, `next.config.ts`, `vitest.config.ts`, `package.json`, `Dockerfile`, `instrumentation.ts`.
- Build-output inspection: `.next/server/app/deals/[id]/page.js.nft.json`, `.next/server/instrumentation.js.nft.json`, `.next/server/chunks/ssr/*quickjs*`, `.next/static/media/*.wasm`, `.next/standalone/**`.
- Package internals: `node_modules/quickjs-emscripten/package.json`, `node_modules/@jitl/quickjs-wasmfile-release-sync/{package.json,dist/index.mjs,dist/emscripten-module.mjs}`.
- Planning docs: `.planning/phases/34-formula-reactivity/34-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/config.json`, `.planning/phases/32-test-infrastructure-ci/32-REVIEW.md`.

### Secondary (MEDIUM confidence)
- Phase 32 review's H-01 fix-pass narrative, corroborated against the current `formula-engine.ts` source (the implementation deliberately departs from the review's proposed fix — the source is authoritative).
- STATE.md's record that the workflow engine (and therefore `transform.ts`'s server-side QuickJS import path) was verified end-to-end in Docker on 2026-08-08. Supports A1 but does not prove a `javascript_transform` node actually executed in the container.

### Tertiary (LOW confidence — flagged for validation)
- Whether Next.js 16 / Turbopack emits and correctly resolves the QuickJS `.wasm` asset for server-side chunks in a `output: "standalone"` build. Evidence in this repo is contradictory; **must be probed at runtime** (A1).
- Docker-container evaluation cost relative to the host measurement (A2).

## Metadata

**Confidence breakdown:**
- Write-path inventory: **HIGH** — every one of the 17 rows read from source; no inference.
- Stored shape / greenfield finding: **HIGH** — direct SQL against all four tables including a `jsonb_each` value scan.
- Dependency resolution cost: **HIGH** — `EXPLAIN ANALYZE`, 0.190 ms.
- Cross-entity fan-out and index coverage: **HIGH** — aggregates plus `EXPLAIN (ANALYZE, BUFFERS)` on the worst-case row; `pg_indexes` catalog read.
- QuickJS per-evaluation cost: **HIGH** for the host (five loop sizes, breakdown by phase).
- QuickJS in the Docker standalone build: **MEDIUM/LOW** — contradictory evidence, untestable in this session, mitigated by an explicit checkpoint.
- Reader audit: **HIGH** — CSV defect reproduced with the installed papaparse; snapshot semantics read from source.
- Engine input-shape pitfalls (missing key, wrapper, arrays): **HIGH** — all measured against the real module.
- Cross-entity prefix vocabulary: **LOW** — no convention exists; a decision, not a finding (A3).
- Standard stack: **HIGH** — no new packages; versions read from `node_modules` and `package.json`.

**Research date:** 2026-08-14
**Valid until:** 2026-09-13 (30 days). Earlier invalidation triggers: any change to `formula-engine.ts`, any new custom field definition of type `formula` (which would falsify the greenfield finding), a `next`/`quickjs-emscripten` upgrade, or a new CRM write path.

**Scratch artifacts:** all measurement scripts were written under the session scratchpad (outside the repo). The one file created inside the repo — `src/lib/__research_probe.test.ts` — was deleted immediately after the run; `git status --porcelain` is empty. No database row was inserted, updated, or deleted; no source file was modified; no migration was created.
