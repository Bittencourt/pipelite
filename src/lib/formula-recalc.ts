/**
 * Server-side recalculation of formula custom-field values.
 *
 * This is the shared helper D-01 mandates: every write path awaits it synchronously, in the
 * same request as the entity write and strictly BEFORE `crmBus.emit(...)`, so the webhook body
 * and the workflow-trigger envelope (both emit-time snapshots of the row object) carry the
 * recomputed values. It returns the merged blob precisely so the caller can fold it into the
 * payload it is about to emit (D-17).
 *
 * **Transaction boundary (resolving CONTEXT.md's Claude's-discretion item):** the recalc write
 * is a second `UPDATE` issued immediately after the entity write, NOT inside a transaction.
 * SC-1 still holds because the update completes before the response is sent. The mutation layer
 * uses no transactions today, so threading a `tx` through all 17 write paths would be scope
 * creep. The accepted consequence (threat T-34-11) is that a crash between the two writes
 * leaves the entity written with stale formula values — the same state as today, and
 * self-healing on the next save.
 *
 * Scope: one entity, plus exactly ONE hop of dependent children (plan 34-04). The cascade is
 * bounded by a single shared evaluation budget; see `FORMULA_EVALUATION_BUDGET`.
 */

import { db } from "@/db"
import {
  organizations,
  people,
  deals,
  activities,
  type EntityType,
  type CustomFieldDefinition,
  type FormulaConfig,
} from "@/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"

import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import {
  evaluateFormula,
  extractDependencies,
  detectCircularDependency,
} from "@/lib/formula-engine"
import { unwrapFormulaValue, sanitizeFormulaError, type FormulaWrapper } from "@/lib/formula-helpers"

/** Entity type to Drizzle table. Mirrors the private map in `custom-fields.ts`. */
const entityTables = {
  organization: organizations,
  person: people,
  deal: deals,
  activity: activities,
} as const

/* ---------------------------------------------------------------------------------------- *
 * Vocabulary
 * ---------------------------------------------------------------------------------------- */

/**
 * The cross-entity reference prefixes, e.g. `{{Organization.Revenue}}`.
 *
 * **This is a permanent formula-language API (D-08).** Full entity names only — there is
 * deliberately no `Org` short alias, because a full name never needs disambiguating as more
 * entity types appear, and renaming a prefix later would break every authored formula.
 *
 * No convention existed before this constant: `relatedEntities` was plumbed through three
 * components and passed by zero callers, so every dot-ref errored. An unknown prefix is NOT
 * special-cased here; it falls through to the engine's existing `Unknown entity: X` error,
 * which D-05 then persists as a visible error on the field.
 */
export const FORMULA_ENTITY_PREFIXES: Readonly<Record<string, EntityType>> = Object.freeze({
  Organization: "organization",
  Person: "person",
  Deal: "deal",
})

/**
 * The native (non-custom) row attributes a formula may reference, per entity type, mapped to
 * the Drizzle row property that holds them.
 *
 * This is the server-side source of truth. It intentionally mirrors the `entityAttributes` prop
 * that the four detail pages each build inline for the client-side live preview; keeping the
 * two in sync is a follow-up, not this plan's scope. `activity` had NO referenceable attributes
 * at all before this map (RESEARCH A4), which made activity formulas nearly useless.
 */
export const ENTITY_NATIVE_ATTRIBUTES: Readonly<Record<EntityType, Readonly<Record<string, string>>>> =
  Object.freeze({
    deal: Object.freeze({
      Value: "value",
      Title: "title",
      Notes: "notes",
      ExpectedCloseDate: "expectedCloseDate",
    }),
    organization: Object.freeze({
      Name: "name",
      Website: "website",
      Industry: "industry",
      Notes: "notes",
    }),
    person: Object.freeze({
      FirstName: "firstName",
      LastName: "lastName",
      Email: "email",
      Phone: "phone",
      Notes: "notes",
    }),
    activity: Object.freeze({
      Title: "title",
      Notes: "notes",
      DueDate: "dueDate",
      CompletedAt: "completedAt",
    }),
  })

/**
 * Flattened attribute-name to column-name map, derived from `ENTITY_NATIVE_ATTRIBUTES`.
 *
 * Scoping compares a formula's refs against `changedFields`, which carries **column** names
 * (`value`, `title`) while a formula ref is the **attribute** name (`Value`, `Title`). The
 * union across entity types is safe here: the per-entity maps agree wherever they overlap
 * (`Notes -> notes`, `Title -> title`), and an attribute belonging to another entity type can
 * never match, because that entity's column names never appear in this entity's
 * `changedFields`.
 */
export const NATIVE_ATTRIBUTE_COLUMNS: Readonly<Record<string, string>> = Object.freeze(
  Object.values(ENTITY_NATIVE_ATTRIBUTES).reduce<Record<string, string>>(
    (acc, attributes) => Object.assign(acc, attributes),
    {}
  )
)

/**
 * Resource bounds passed on EVERY server-side evaluation (threat T-34-02).
 *
 * D-18 is blocking here: `evaluateFormula`'s bound is an opt-in 4th argument and is completely
 * INERT unless passed. Plan 34-01 measured the failure mode — a `while(true)` expression does
 * not merely time out, it blocks the event loop in synchronous WASM so even the test runner's
 * own timeout cannot fire, wedging the worker. One bad admin-authored formula would therefore
 * pin a Node worker unreclaimably.
 *
 * 500 ms against the measured 0.876 ms in-container steady-state cost is ~570x headroom for a
 * single evaluation while still bounding a pathological expression. 8 MiB mirrors
 * `transform.ts`.
 */
export const FORMULA_EVAL_MEMORY_LIMIT_BYTES = 8 * 1024 * 1024
export const FORMULA_EVAL_TIMEOUT_MS = 500

const FORMULA_EVAL_OPTIONS = {
  memoryLimitBytes: FORMULA_EVAL_MEMORY_LIMIT_BYTES,
  timeoutMs: FORMULA_EVAL_TIMEOUT_MS,
} as const

/**
 * The coarse marker the v1 routes push into `changedFields` when they merge `custom_fields`
 * (e.g. `v1/deals/[id]/route.ts:251`). They do not diff individual keys, so this sentinel must
 * select every formula that reads any custom field — a safety net that trades a little
 * over-evaluation for never missing a recalculation.
 */
export const CHANGED_FIELDS_CUSTOM_SENTINEL = "customFields"

const CIRCULAR_DEPENDENCY_ERROR = "Circular dependency detected"

/* ---------------------------------------------------------------------------------------- *
 * Cascade vocabulary and bounds — D-03 / D-04 / D-09 / D-13
 * ---------------------------------------------------------------------------------------- */

/**
 * The maximum number of formula evaluations ONE call to `recalculateFormulas` may perform,
 * counting the saved entity's own formulas and every cascaded child together (D-04/D-13).
 *
 * **Do not "optimise" this away — the arithmetic is the whole point.**
 *
 * - 500 x 1.195 ms (host, RESEARCH) = 598 ms; 500 x 0.876 ms (measured IN THE CONTAINER by
 *   plan 34-01, the number that actually matters) = 438 ms. Both sit inside the ~2000 ms
 *   ceiling a synchronous request can absorb.
 * - It admits the entire measured single-hop worst case: the largest organization in the live
 *   data has 114 deals + 10 people = 124 child rows, so even 4 formulas each is 496.
 * - It rejects the two-hop case (organization -> deals -> activities, ~626 evaluations,
 *   ~750 ms) by construction, via `CASCADE_DEPTH`.
 * - A row-count cap would be strictly worse: it does not scale with formulas per entity, so
 *   200 rows x 5 formulas = 1000 evaluations would slip straight through it.
 *
 * The database is NOT the bottleneck — all four reverse lookups are index-backed by Phase 33
 * and EXPLAIN-verified at 0.909 ms for the worst-case 114-row fetch. QuickJS is.
 */
export const FORMULA_EVALUATION_BUDGET = 500

/**
 * How many hops of dependent children a save may recalculate (D-13).
 *
 * Fixed at 1, and enforced STRUCTURALLY rather than by a counter: children are recalculated
 * through `recalculateOneEntity`, which has no cascade step at all, so no amount of future
 * editing inside the per-entity path can accidentally add a second hop. A depth of 2 was
 * rejected on measurement, not taste: organization -> deals -> activities reaches ~626
 * evaluations (~750 ms) on the live data's worst organization.
 */
export const CASCADE_DEPTH = 1

/** One parent-to-child cascade direction, backed by a real foreign key and a Phase 33 index. */
export interface CascadeChildRelation {
  parent: EntityType
  child: EntityType
  /** The `FORMULA_ENTITY_PREFIXES` spelling a child formula must use, e.g. `Organization`. */
  prefix: string
  table: PgTable
  foreignKey: AnyPgColumn
  deletedAt: AnyPgColumn
}

/**
 * Every direction the cascade may walk. There is deliberately no `activity -> *` entry: an
 * activity is a leaf, which is half of why `CASCADE_DEPTH = 1` holds by construction.
 */
export const CASCADE_CHILD_RELATIONS: readonly CascadeChildRelation[] = Object.freeze([
  // deals_organization_id_idx (Phase 33) — Bitmap Index Scan, 114 rows, 0.909 ms.
  {
    parent: "organization",
    child: "deal",
    prefix: "Organization",
    table: deals,
    foreignKey: deals.organizationId,
    deletedAt: deals.deletedAt,
  },
  // people_organization_id_idx (Phase 33) — max fan-out 10, avg 1.02.
  {
    parent: "organization",
    child: "person",
    prefix: "Organization",
    table: people,
    foreignKey: people.organizationId,
    deletedAt: people.deletedAt,
  },
  // deals_person_id_idx (Phase 33) — max fan-out 29, avg 1.09.
  {
    parent: "person",
    child: "deal",
    prefix: "Person",
    table: deals,
    foreignKey: deals.personId,
    deletedAt: deals.deletedAt,
  },
  // activities_deal_id_idx (Phase 33) — max fan-out 117, avg 4.49, p99 33.
  {
    parent: "deal",
    child: "activity",
    prefix: "Deal",
    table: activities,
    foreignKey: activities.dealId,
    deletedAt: activities.deletedAt,
  },
] as const)

/** The `FORMULA_ENTITY_PREFIXES` spelling for an entity type, or `null` (activity has none). */
function prefixForEntityType(entityType: EntityType): string | null {
  for (const [prefix, type] of Object.entries(FORMULA_ENTITY_PREFIXES)) {
    if (type === entityType) return prefix
  }
  return null
}

/* ---------------------------------------------------------------------------------------- *
 * Small helpers
 * ---------------------------------------------------------------------------------------- */

function expressionOf(definition: CustomFieldDefinition): string {
  return (definition.config as FormulaConfig | null)?.expression || ""
}

function isFormulaDefinition(definition: CustomFieldDefinition): boolean {
  return definition.type === "formula" && expressionOf(definition).trim() !== ""
}

/** Deduped refs — `extractDependencies` deliberately does not dedupe (its own test pins that). */
function refsOf(definition: CustomFieldDefinition): Set<string> {
  return new Set(extractDependencies(expressionOf(definition)))
}

/**
 * Drop every value whose definition is formula-typed (threat T-34-04).
 *
 * The server is the sole writer of formula keys. Without this, any authenticated user could
 * `POST /api/custom-fields/save` (which replaces the whole blob with what the browser sent,
 * formula keys included) or any API key could pass `custom_fields`, and set an arbitrary value
 * on a server-derived field. Applied by `saveFieldValues` and the v1 route merges.
 *
 * Keys with no matching definition are left untouched — this function's job is not validation.
 */
export function stripFormulaKeys(
  values: Record<string, unknown>,
  definitions: CustomFieldDefinition[]
): Record<string, unknown> {
  const formulaNames = new Set(
    definitions.filter((d) => d.type === "formula").map((d) => d.name)
  )

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (formulaNames.has(key)) continue
    result[key] = value
  }
  return result
}

/* ---------------------------------------------------------------------------------------- *
 * Scoping — FORMULA-02 / SC-4
 * ---------------------------------------------------------------------------------------- */

export interface ScopeFormulasInput {
  definitions: CustomFieldDefinition[]
  changedFields: string[]
  /** Populated by the cross-entity cascade in plan 34-04: prefix -> changed field names. */
  changedRelatedFields?: Record<string, string[]>
}

export interface ScopeFormulasResult {
  /** The formulas that must be recomputed, in `position` order. */
  inScope: CustomFieldDefinition[]
  /** Every formula definition on the entity — needed for ordering and for seeding. */
  formulaDefs: CustomFieldDefinition[]
}

/**
 * Decide which formulas actually need recomputing. This early filter IS SC-4: a save that
 * touches nothing a formula reads must produce zero evaluations and zero writes.
 */
export function scopeFormulasToChangedFields({
  definitions,
  changedFields,
  changedRelatedFields,
}: ScopeFormulasInput): ScopeFormulasResult {
  const formulaDefs = definitions.filter(isFormulaDefinition)
  if (formulaDefs.length === 0) return { inScope: [], formulaDefs }

  const changed = new Set(changedFields)
  const hasCustomSentinel = changed.has(CHANGED_FIELDS_CUSTOM_SENTINEL)
  const formulaNames = new Set(formulaDefs.map((d) => d.name))
  const refsByName = new Map(formulaDefs.map((d) => [d.name, refsOf(d)] as const))

  const isDirectlyInScope = (definition: CustomFieldDefinition): boolean => {
    for (const ref of refsByName.get(definition.name) ?? []) {
      if (ref.includes(".")) {
        // Cross-entity ref: only the cascade knows whether the parent field changed.
        const [prefix, field] = ref.split(".")
        if (changedRelatedFields?.[prefix.trim()]?.includes(field.trim())) return true
        continue
      }

      // A same-entity ref by its own name (a custom field, or a native attribute spelled
      // exactly as changedFields spells it).
      if (changed.has(ref)) return true

      // A native attribute reference, matched through its column name.
      const column = NATIVE_ATTRIBUTE_COLUMNS[ref]
      if (column !== undefined && changed.has(column)) return true

      // The coarse sentinel selects any formula that reads a custom (non-native) field.
      if (hasCustomSentinel && column === undefined) return true
    }
    return false
  }

  const inScopeNames = new Set(formulaDefs.filter(isDirectlyInScope).map((d) => d.name))

  // D-10 chaining: a formula that reads an in-scope formula must be recomputed too, because
  // its input is about to change. Iterate to a fixed point; the loop is bounded by the formula
  // count and terminates even on a cyclic graph.
  let grew = true
  while (grew) {
    grew = false
    for (const definition of formulaDefs) {
      if (inScopeNames.has(definition.name)) continue
      for (const ref of refsByName.get(definition.name) ?? []) {
        if (ref.includes(".")) continue
        if (formulaNames.has(ref) && inScopeNames.has(ref)) {
          inScopeNames.add(definition.name)
          grew = true
          break
        }
      }
    }
  }

  return { inScope: formulaDefs.filter((d) => inScopeNames.has(d.name)), formulaDefs }
}

/* ---------------------------------------------------------------------------------------- *
 * Engine input construction — D-14 / Pitfall 1 / Pitfall 2
 * ---------------------------------------------------------------------------------------- */

export interface BuildFormulaFieldValuesInput {
  entityType: EntityType
  definitions: CustomFieldDefinition[]
  row?: Record<string, unknown> | null
}

/**
 * Build the `fieldValues` object handed to the engine, in a precedence order where later
 * writes win: native attributes, then a `null` for every active definition, then whatever the
 * row's JSONB actually holds.
 *
 * The `null` seeding pass is a **correctness requirement, not an optimisation** (D-14). The
 * engine errors with `Unknown field: X` when a referenced key is absent from `fieldValues`,
 * but returns a blank when the key is present and explicitly `null`. Rows here carry only a
 * handful of the 155 deal definitions, so without seeding roughly 90% of rows would persist a
 * fabricated error naming a field that visibly exists in the admin list.
 *
 * Stored values pass through `unwrapFormulaValue`, because a `{formula:true,...}` wrapper
 * reaching the sandbox makes arithmetic yield `NaN`, which surfaces as `null` — a silent blank
 * with no error at all.
 *
 * **D-15, multi_select arrays:** arrays pass through unchanged, so `{{Origem}} + 1` on
 * `["Outbound Manual"]` evaluates to the string `"Outbound Manual1"`. This is the sandbox's own
 * JS coercion and CONTEXT.md forbids changing evaluation semantics, so it is documented and
 * pinned by a test rather than fixed. Admins should use `TEXT.concat` or index into the array.
 */
export function buildFormulaFieldValues({
  entityType,
  definitions,
  row,
}: BuildFormulaFieldValuesInput): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  for (const [attribute, column] of Object.entries(ENTITY_NATIVE_ATTRIBUTES[entityType])) {
    values[attribute] = row?.[column] ?? null
  }

  for (const definition of definitions) {
    values[definition.name] = null
  }

  const stored = (row?.customFields ?? {}) as Record<string, unknown>
  for (const [key, value] of Object.entries(stored)) {
    values[key] = unwrapFormulaValue(value)
  }

  return values
}

export interface BuildRelatedEntitiesInput {
  parentType: EntityType
  parentRow: Record<string, unknown>
  parentDefinitions: CustomFieldDefinition[]
}

/**
 * Build the `relatedEntities` argument the engine resolves `{{Organization.Revenue}}` against.
 *
 * **This is the first code in the repository to populate that argument.** It was threaded
 * through three components and passed by ZERO callers, so every dot-ref has always errored with
 * `Unknown entity: X`. Cross-entity formulas become functional here.
 *
 * The value object is built by `buildFormulaFieldValues`, which means the parent's side of a
 * cross-entity reference gets exactly the same treatment as the same-entity path: native
 * attributes, then a `null` for every active definition (D-14 — an ABSENT key makes the engine
 * return `Field "X" not found on Organization`, whereas an explicit `null` propagates blank),
 * then the stored blob with every `{formula:true,...}` wrapper unwrapped.
 *
 * The key is the D-08 full entity name. There is no short `Org` alias, so `{{Org.Name}}` keeps
 * failing loudly with the engine's own `Unknown entity: Org` rather than silently working in
 * one spelling and not another. An entity type with no prefix (activity) is never a cascade
 * parent and yields `{}`.
 */
export function buildRelatedEntities({
  parentType,
  parentRow,
  parentDefinitions,
}: BuildRelatedEntitiesInput): Record<string, Record<string, unknown>> {
  const prefix = prefixForEntityType(parentType)
  if (!prefix) return {}

  return {
    [prefix]: buildFormulaFieldValues({
      entityType: parentType,
      definitions: parentDefinitions,
      row: parentRow,
    }),
  }
}

/* ---------------------------------------------------------------------------------------- *
 * Topological ordering — D-10
 * ---------------------------------------------------------------------------------------- */

export interface OrderFormulaDefinitionsResult {
  /** Dependency-first order; excludes anything implicated in a cycle. */
  ordered: CustomFieldDefinition[]
  /** Names that are in, or reach, a cycle. These are never evaluated. */
  cyclic: Set<string>
}

/**
 * Order formulas so a dependency is always evaluated before its dependent, and identify
 * cycles.
 *
 * Cycle detection REUSES `detectCircularDependency` from the engine rather than
 * reimplementing it (CONTEXT.md is explicit). Note that the only pre-existing caller,
 * `validateFormula`, builds a single-entry map and therefore can never observe a two-hop cycle;
 * building the full map is what makes the existing function useful.
 *
 * The `position` ordering that `getActiveFieldDefinitions` applied is preserved as the
 * tie-break, so the result is deterministic.
 */
export function orderFormulaDefinitions(
  formulaDefs: CustomFieldDefinition[]
): OrderFormulaDefinitionsResult {
  const byName = new Map(formulaDefs.map((d) => [d.name, d] as const))

  // Edges only between formulas in this set. A ref to a non-formula field, to a formula that
  // is not being recomputed, or to another entity is a leaf as far as ordering is concerned.
  const depMap = new Map<string, string[]>()
  for (const definition of formulaDefs) {
    const deps = [...refsOf(definition)].filter((ref) => !ref.includes(".") && byName.has(ref))
    depMap.set(definition.name, deps)
  }

  const cyclic = new Set<string>()
  for (const definition of formulaDefs) {
    if (detectCircularDependency(definition.name, depMap)) {
      cyclic.add(definition.name)
    }
  }

  const ordered: CustomFieldDefinition[] = []
  const visited = new Set<string>()

  const visit = (name: string): void => {
    if (visited.has(name)) return
    visited.add(name) // marked before recursing, so a cycle can never recurse infinitely
    for (const dep of depMap.get(name) ?? []) {
      if (!cyclic.has(dep)) visit(dep)
    }
    const definition = byName.get(name)
    if (definition && !cyclic.has(name)) ordered.push(definition)
  }

  for (const definition of formulaDefs) visit(definition.name)

  return { ordered, cyclic }
}

/* ---------------------------------------------------------------------------------------- *
 * The helper itself
 * ---------------------------------------------------------------------------------------- */

export interface RecalculateFormulasInput {
  entityType: EntityType
  entityId: string
  /** Column and/or custom-field names the caller just wrote. This is the SC-4 gate. */
  changedFields: string[]
  /** The written row, when the caller already has it from `.returning()`. Saves a read. */
  row?: Record<string, unknown> | null
  /** Prefix -> changed parent field names. Set by the cascade when recalculating a child. */
  changedRelatedFields?: Record<string, string[]>
  /** Parent rows keyed by the `FORMULA_ENTITY_PREFIXES` spelling, for dot-refs. */
  relatedEntities?: Record<string, Record<string, unknown>>
  /**
   * Per-invocation memo shared across a cascade so 114 children issue one definition query per
   * entity type rather than 114. Deliberately NOT a module-level cache: that would need
   * invalidation on every admin field mutation and would not hold across server instances.
   */
  definitionsCache?: Map<EntityType, CustomFieldDefinition[]>
  /**
   * Recalculate dependent child rows too (D-03). Defaults to `true`.
   *
   * Bulk importers pass `false`: a 100-row CSV batch would otherwise fan out 100 independent
   * single-hop cascades over the same parents, and the importer already recalculates every row
   * it touches.
   */
  cascade?: boolean
  /**
   * Lower the shared evaluation budget for this invocation. Defaults to
   * `FORMULA_EVALUATION_BUDGET`. Zero or negative means zero evaluations, NOT unlimited.
   */
  budget?: number
}

/**
 * The shared, decrementing evaluation allowance for one `recalculateFormulas` call.
 *
 * ONE counter for the saved entity and every cascaded child together — never one per child,
 * which is exactly how an "obviously bounded" cascade becomes a request-amplification
 * primitive (T-34-03).
 */
interface EvaluationBudget {
  /** The allowance this invocation started with, carried purely for the warning's diagnostics. */
  limit: number
  remaining: number
  /** Latched so a multi-relation cascade cannot warn twice about one invocation. */
  warned: boolean
}

export interface RecalculateFormulasResult {
  /** The merged blob, so the caller can emit a post-recalc payload (D-17). */
  customFields: Record<string, unknown>
  /** Evaluations actually performed. Plan 34-04 spends this against the cascade budget. */
  evaluations: number
}

async function loadDefinitions(
  entityType: EntityType,
  cache?: Map<EntityType, CustomFieldDefinition[]>
): Promise<CustomFieldDefinition[]> {
  const cached = cache?.get(entityType)
  if (cached) return cached

  const definitions = await getActiveFieldDefinitions(entityType)
  cache?.set(entityType, definitions)
  return definitions
}

async function loadRow(
  entityType: EntityType,
  entityId: string
): Promise<Record<string, unknown> | null> {
  const table = entityTables[entityType]
  const rows = await db.select().from(table).where(eq(table.id, entityId)).limit(1)
  return (rows[0] as Record<string, unknown> | undefined) ?? null
}

interface RecalculateOneResult extends RecalculateFormulasResult {
  /**
   * The formula names this pass rewrote. From a child's point of view these are changed parent
   * fields, so the cascade folds them into its changed set.
   */
  computedNames: string[]
  /** The row this pass worked from, so the cascade need not read it a second time. */
  row: Record<string, unknown> | null
}

/**
 * Recompute and persist ONE entity's in-scope formula fields. No cascade lives here, and that
 * is deliberate: it is what makes `CASCADE_DEPTH = 1` a structural property rather than a
 * convention (children are recalculated through this function, so they cannot cascade further).
 *
 * Resolves rather than rejects on any formula failure: a broken admin-authored formula must
 * never block a user's edit (D-05), so every failure mode becomes a stored error.
 */
async function recalculateOneEntity(
  input: RecalculateFormulasInput,
  budget: EvaluationBudget
): Promise<RecalculateOneResult> {
  const { entityType, entityId, changedFields, changedRelatedFields, relatedEntities } = input

  const definitions = await loadDefinitions(entityType, input.definitionsCache)
  const { inScope } = scopeFormulasToChangedFields({
    definitions,
    changedFields,
    changedRelatedFields,
  })

  // SC-4: nothing references what changed. No row read, no evaluation, no write.
  if (inScope.length === 0) {
    const existing = (input.row?.customFields ?? {}) as Record<string, unknown>
    return { customFields: existing, evaluations: 0, computedNames: [], row: input.row ?? null }
  }

  const row = input.row ?? (await loadRow(entityType, entityId))
  if (!row) {
    // The entity vanished between its write and this call; nothing to update.
    return { customFields: {}, evaluations: 0, computedNames: [], row: null }
  }

  const fieldValues = buildFormulaFieldValues({ entityType, definitions, row })
  const { ordered, cyclic } = orderFormulaDefinitions(inScope)

  const computed: Record<string, FormulaWrapper> = {}
  let evaluations = 0

  // Cycles are rejected BEFORE evaluation — a self-reference must not be handed to the sandbox.
  for (const name of cyclic) {
    computed[name] = { formula: true, value: null, error: CIRCULAR_DEPENDENCY_ERROR }
  }

  for (const definition of ordered) {
    // The shared budget is spent here, by the saved entity and by every cascaded child alike.
    if (budget.remaining <= 0) break
    budget.remaining -= 1

    let value: unknown = null
    let error: string | null = null

    try {
      const result = await evaluateFormula(
        expressionOf(definition),
        fieldValues,
        relatedEntities,
        // D-18: the bound is inert unless passed. Never call the engine without this.
        { ...FORMULA_EVAL_OPTIONS }
      )
      if (result.error) {
        error = sanitizeFormulaError(result.error)
      } else {
        value = result.value
      }
    } catch (thrown) {
      // A thrown engine error becomes a stored error, never a rejected promise (D-05).
      error = sanitizeFormulaError(thrown)
    }

    evaluations += 1
    computed[definition.name] = { formula: true, value: error ? null : value, error }

    // Feed the fresh value forward so the next formula in the order reads it (D-10 chaining).
    fieldValues[definition.name] = error ? null : value
  }

  // D-06: formula keys are overwritten unconditionally. An errored formula REPLACES whatever
  // was stored — silently retaining a previous value is the exact defect this phase removes.
  const existing = (row.customFields ?? {}) as Record<string, unknown>
  const computedNames = Object.keys(computed)

  // The budget can be exhausted before a single formula was computed (an explicit `budget: 0`,
  // or a cascade child reached after the allowance ran out). Writing an unchanged blob would be
  // a pointless UPDATE, so skip it.
  if (computedNames.length === 0) {
    return { customFields: existing, evaluations: 0, computedNames: [], row }
  }

  const merged: Record<string, unknown> = { ...existing, ...computed }

  const table = entityTables[entityType]
  await db
    .update(table)
    .set({ customFields: merged })
    .where(eq(table.id, entityId))
  // NOTE: `updatedAt` is deliberately NOT set. The entity's own write already bumped it, and a
  // second bump would make a derived-value refresh indistinguishable from a user edit in
  // Phase 36's audit log.

  return { customFields: merged, evaluations, computedNames, row }
}

/* ---------------------------------------------------------------------------------------- *
 * The depth-1 cascade — D-03 / D-04 / D-09 / D-13
 * ---------------------------------------------------------------------------------------- */

/**
 * The saved parent's changed field names AS A CHILD'S DOTTED REF SPELLS THEM.
 *
 * `changedFields` carries column names (`name`, `title`) while a formula ref carries the
 * attribute name (`Name`, `Title`), so each changed column is also mapped back through
 * `ENTITY_NATIVE_ATTRIBUTES`. The coarse `customFields` sentinel — which the v1 routes push
 * without diffing individual keys — expands to every non-formula definition name.
 *
 * `recomputedFormulaNames` is folded in as well: a parent formula that just produced a new
 * value is a genuine change to any child reading it, and omitting it would leave the child
 * holding a stale derived value, which is the exact defect this phase exists to remove. It is
 * precise rather than coarse — only formulas that were actually recomputed are included.
 */
function parentChangedRefNames(
  parentType: EntityType,
  changedFields: string[],
  definitions: CustomFieldDefinition[],
  recomputedFormulaNames: string[]
): Set<string> {
  const attributeByColumn = new Map<string, string>()
  for (const [attribute, column] of Object.entries(ENTITY_NATIVE_ATTRIBUTES[parentType])) {
    attributeByColumn.set(column, attribute)
  }

  const changed = new Set<string>(recomputedFormulaNames)

  for (const field of changedFields) {
    if (field === CHANGED_FIELDS_CUSTOM_SENTINEL) {
      for (const definition of definitions) {
        if (!isFormulaDefinition(definition)) changed.add(definition.name)
      }
      continue
    }

    changed.add(field)
    const attribute = attributeByColumn.get(field)
    if (attribute !== undefined) changed.add(attribute)
  }

  return changed
}

/** Does any of this child type's formulas read a parent field that just changed? */
function childReferencesChangedParentField(
  childDefinitions: CustomFieldDefinition[],
  prefix: string,
  changed: Set<string>
): boolean {
  for (const definition of childDefinitions) {
    if (!isFormulaDefinition(definition)) continue
    for (const ref of refsOf(definition)) {
      if (!ref.includes(".")) continue
      const [refPrefix, refField] = ref.split(".")
      if (refPrefix.trim() === prefix && changed.has(refField.trim())) return true
    }
  }
  return false
}

interface CascadeInput {
  input: RecalculateFormulasInput
  /** The parent's post-recalculation blob, so children read fresh values, not stored ones. */
  parentCustomFields: Record<string, unknown>
  parentRow: Record<string, unknown> | null
  recomputedFormulaNames: string[]
  definitionsCache: Map<EntityType, CustomFieldDefinition[]>
  budget: EvaluationBudget
}

/**
 * Recalculate the dependent child rows of a just-saved parent — exactly one hop (D-03/D-13).
 *
 * Resolves to the number of evaluations spent. Never throws: a failed child lookup or a child
 * evaluation blow-up must not turn a successful parent save into an error response (D-05's
 * spirit).
 */
async function cascadeToChildren({
  input,
  parentCustomFields,
  parentRow,
  recomputedFormulaNames,
  definitionsCache,
  budget,
}: CascadeInput): Promise<number> {
  const { entityType: parentType, entityId: parentId, changedFields } = input

  const relations = CASCADE_CHILD_RELATIONS.filter((relation) => relation.parent === parentType)
  if (relations.length === 0) return 0
  if (budget.remaining <= 0) return 0

  const parentDefinitions = await loadDefinitions(parentType, definitionsCache)
  const changed = parentChangedRefNames(
    parentType,
    changedFields,
    parentDefinitions,
    recomputedFormulaNames
  )
  if (changed.size === 0) return 0

  const changedList = [...changed]
  let evaluations = 0
  let related: Record<string, Record<string, unknown>> | null = null
  let row = parentRow

  for (const relation of relations) {
    const childDefinitions = await loadDefinitions(relation.child, definitionsCache)

    // FORMULA-02 / SC-4: no child formula reads anything that changed, so NO CHILD QUERY is
    // issued at all. This gate is what keeps the common save as cheap as it was before.
    if (!childReferencesChangedParentField(childDefinitions, relation.prefix, changed)) continue

    if (budget.remaining <= 0) break

    if (!row) row = await loadRow(parentType, parentId)
    if (!row) return evaluations

    related =
      related ??
      buildRelatedEntities({
        parentType,
        parentRow: { ...row, customFields: parentCustomFields },
        parentDefinitions,
      })

    let children: Record<string, unknown>[]
    try {
      // D-09: NO ownership predicate, deliberately. Recalculation is a derived-value refresh,
      // not a user edit — a stale computed value sitting on another user's row is precisely the
      // defect this phase removes, so the cascade must reach rows the actor could not edit.
      // Do not "fix" this into an access-control filter. Phase 36's audit log attributes these
      // writes to the system rather than to the acting user (CONTEXT.md D-09).
      // Index-backed by Phase 33; EXPLAIN-verified Bitmap Index Scan, 114 rows, 0.909 ms.
      children = (await db
        .select()
        .from(relation.table)
        .where(
          and(eq(relation.foreignKey, parentId), isNull(relation.deletedAt))
        )) as unknown as Record<string, unknown>[]
    } catch (thrown) {
      console.warn(
        `[formula-recalc] child lookup failed, parent=${parentType} parentId=${parentId} ` +
          `child=${relation.child}: ${sanitizeFormulaError(thrown)}`
      )
      continue
    }

    let processed = 0
    for (const child of children) {
      if (budget.remaining <= 0) break
      processed += 1

      try {
        const result = await recalculateOneEntity(
          {
            entityType: relation.child,
            entityId: String(child.id),
            // The child's OWN fields did not change; only its parent's did.
            changedFields: [],
            row: child,
            changedRelatedFields: { [relation.prefix]: changedList },
            relatedEntities: related,
            definitionsCache,
          },
          budget
        )
        evaluations += result.evaluations
      } catch (thrown) {
        console.warn(
          `[formula-recalc] child recalculation failed, child=${relation.child} ` +
            `childId=${String(child.id)}: ${sanitizeFormulaError(thrown)}`
        )
      }
    }

    if (processed < children.length && !budget.warned) {
      budget.warned = true
      // T-34-06: identifiers and counts only, never row contents or field values.
      console.warn(
        `[formula-recalc] evaluation budget exhausted, cascade truncated: ` +
          `parent=${parentType} parentId=${parentId} child=${relation.child} ` +
          `childrenFound=${children.length} childrenSkipped=${children.length - processed} ` +
          `budget=${budget.limit}`
      )
    }
  }

  return evaluations
}

/**
 * Recompute and persist an entity's formula fields, then refresh the dependent child rows that
 * read them — one hop, budget-capped (D-01/D-03/D-13).
 *
 * Resolves rather than rejects on any formula or cascade failure (D-05). The returned
 * `customFields` is the SAVED ENTITY's blob, for the caller to fold into the payload it is
 * about to emit (D-17); `evaluations` is the total spent, children included.
 */
export async function recalculateFormulas(
  input: RecalculateFormulasInput
): Promise<RecalculateFormulasResult> {
  // A budget of 0 or less means ZERO evaluations, never unlimited.
  const limit = Math.max(0, input.budget ?? FORMULA_EVALUATION_BUDGET)
  const budget: EvaluationBudget = { limit, remaining: limit, warned: false }
  const definitionsCache =
    input.definitionsCache ?? new Map<EntityType, CustomFieldDefinition[]>()

  const parent = await recalculateOneEntity({ ...input, definitionsCache }, budget)

  if (input.cascade === false) {
    return { customFields: parent.customFields, evaluations: parent.evaluations }
  }

  const cascaded = await cascadeToChildren({
    input,
    parentCustomFields: parent.customFields,
    parentRow: parent.row,
    recomputedFormulaNames: parent.computedNames,
    definitionsCache,
    budget,
  })

  return {
    customFields: parent.customFields,
    evaluations: parent.evaluations + cascaded,
  }
}
