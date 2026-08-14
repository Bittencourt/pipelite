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
 * Scope: ONE entity. The cross-entity cascade, the child lookups and the evaluation budget are
 * plan 34-04's work; `changedRelatedFields` is accepted here already so that plan adds no
 * signature change.
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
import { eq } from "drizzle-orm"

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
  /** Prefix -> changed parent field names. Populated by the cascade in plan 34-04. */
  changedRelatedFields?: Record<string, string[]>
  /** Parent rows keyed by the `FORMULA_ENTITY_PREFIXES` spelling, for dot-refs. */
  relatedEntities?: Record<string, Record<string, unknown>>
  /**
   * Per-invocation memo shared across a cascade so 114 children issue one definition query per
   * entity type rather than 114. Deliberately NOT a module-level cache: that would need
   * invalidation on every admin field mutation and would not hold across server instances.
   */
  definitionsCache?: Map<EntityType, CustomFieldDefinition[]>
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

/**
 * Recompute and persist one entity's in-scope formula fields.
 *
 * Resolves rather than rejects on any formula failure: a broken admin-authored formula must
 * never block a user's edit (D-05), so every failure mode becomes a stored error.
 */
export async function recalculateFormulas(
  input: RecalculateFormulasInput
): Promise<RecalculateFormulasResult> {
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
    return { customFields: existing, evaluations: 0 }
  }

  const row = input.row ?? (await loadRow(entityType, entityId))
  if (!row) {
    // The entity vanished between its write and this call; nothing to update.
    return { customFields: {}, evaluations: 0 }
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
  const merged: Record<string, unknown> = { ...existing, ...computed }

  const table = entityTables[entityType]
  await db
    .update(table)
    .set({ customFields: merged })
    .where(eq(table.id, entityId))
  // NOTE: `updatedAt` is deliberately NOT set. The entity's own write already bumped it, and a
  // second bump would make a derived-value refresh indistinguishable from a user edit in
  // Phase 36's audit log.

  return { customFields: merged, evaluations }
}
