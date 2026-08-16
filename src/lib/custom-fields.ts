import { db } from "@/db"
import { customFieldDefinitions, organizations, people, deals, activities, type EntityType, type FieldConfig, type CustomFieldDefinition } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import type { SelectConfig, LookupConfig } from "@/db/schema"
import { crmBus } from "@/lib/events/bus"
import type { CrmEventPayload } from "@/lib/events/types"
// `formula-recalc` imports `getActiveFieldDefinitions` from this module, so the two form an
// import cycle. It is safe: every binding involved is a hoisted function declaration and
// neither module reads the other at module-evaluation time.
import { recalculateFormulas, stripFormulaKeys } from "@/lib/formula-recalc"

// Entity table mapping
const entityTables = {
  organization: organizations,
  person: people,
  deal: deals,
  activity: activities,
} as const

// Get active field definitions for an entity type
export async function getActiveFieldDefinitions(entityType: EntityType) {
  return db.select()
    .from(customFieldDefinitions)
    .where(and(
      eq(customFieldDefinitions.entityType, entityType),
      isNull(customFieldDefinitions.deletedAt)
    ))
    .orderBy(customFieldDefinitions.position)
}

// Validate field values against definitions
export async function validateFieldValues(
  entityType: EntityType,
  values: Record<string, unknown>
): Promise<{ valid: boolean; errors: string[] }> {
  const definitions = await getActiveFieldDefinitions(entityType)
  const errors: string[] = []
  
  for (const def of definitions) {
    const value = values[def.name]
    
    // Check required fields
    if (def.required && (value === undefined || value === null || value === '')) {
      errors.push(`${def.name} is required`)
      continue
    }
    
    // Skip validation for empty optional fields
    if (value === undefined || value === null || value === '') continue
    
    // Type-specific validation
    switch (def.type) {
      case 'number':
        if (typeof value !== 'number' && isNaN(Number(value))) {
          errors.push(`${def.name} must be a number`)
        }
        break
      
      case 'url':
        if (typeof value === 'string' && value) {
          try {
            new URL(value)
          } catch {
            errors.push(`${def.name} must be a valid URL`)
          }
        }
        break
      
      case 'single_select':
      case 'multi_select': {
        const config = def.config as SelectConfig | null
        if (config?.options) {
          const validOptions = config.options
          if (def.type === 'single_select') {
            // Only validate string values — legacy numeric IDs from old imports
            // are non-string and are allowed through so users can overwrite them.
            if (typeof value === 'string' && !validOptions.includes(value)) {
              errors.push(`${def.name} must be one of: ${validOptions.join(', ')}`)
            }
          } else {
            const values = Array.isArray(value) ? value : [value]
            for (const v of values) {
              // Only validate string elements; skip numeric legacy IDs.
              if (typeof v === 'string' && !validOptions.includes(v)) {
                errors.push(`${def.name} contains invalid option: ${v}`)
              }
            }
          }
        }
        break
      }
      
      case 'lookup': {
        const config = def.config as LookupConfig | null
        if (config?.targetEntity && value) {
          const targetTable = entityTables[config.targetEntity]
          const existing = await db.select({ id: targetTable.id })
            .from(targetTable)
            .where(eq(targetTable.id, value as string))
            .limit(1)
          
          if (existing.length === 0) {
            errors.push(`${def.name} references a non-existent ${config.targetEntity}`)
          }
        }
        break
      }
    }
  }
  
  return { valid: errors.length === 0, errors }
}

// Get custom field values for an entity
export async function getFieldValues(
  entityType: EntityType,
  entityId: string
): Promise<Record<string, unknown>> {
  const table = entityTables[entityType]
  const result = await db.select({ customFields: table.customFields })
    .from(table)
    .where(eq(table.id, entityId))
    .limit(1)
  
  return (result[0]?.customFields as Record<string, unknown>) || {}
}

/**
 * A key-order-independent, deep string form of a JSONB value, for change detection.
 *
 * Reference comparison is not an option here: `multi_select` values are arrays, so `===` would
 * report every array-valued field as changed on every save and silently defeat the SC-4 scoping
 * for the commonest field type in this database.
 */
function stableStringify(value: unknown): string {
  if (value === undefined) return '\u0000undefined'
  const json = JSON.stringify(value, (_key, inner) => {
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const sorted: Record<string, unknown> = {}
      for (const key of Object.keys(inner as Record<string, unknown>).sort()) {
        sorted[key] = (inner as Record<string, unknown>)[key]
      }
      return sorted
    }
    return inner
  })
  return json ?? '\u0000undefined'
}

/**
 * The custom-field names whose value differs between the posted blob and the stored pre-image.
 *
 * A key present in one and absent from the other is a change (a deletion is a change), and
 * values present in both are compared deeply.
 */
function diffChangedFields(
  posted: Record<string, unknown>,
  previous: Record<string, unknown>
): string[] {
  const keys = new Set([...Object.keys(posted), ...Object.keys(previous)])
  const changed: string[] = []

  for (const key of keys) {
    const inPosted = Object.prototype.hasOwnProperty.call(posted, key)
    const inPrevious = Object.prototype.hasOwnProperty.call(previous, key)

    if (inPosted !== inPrevious) {
      changed.push(key)
      continue
    }
    if (stableStringify(posted[key]) !== stableStringify(previous[key])) {
      changed.push(key)
    }
  }

  return changed
}

/**
 * Save custom field values for an entity — the UI write path, and the most-used write path in
 * the whole application (`POST /api/custom-fields/save`).
 *
 * `CustomFieldsSection` posts a FULL REPLACEMENT blob (`{ ...localValues, [field]: value }`),
 * which has two consequences this function has to handle:
 *
 *  - The posted blob includes formula-typed keys, so without stripping, any authenticated user
 *    could hand-write a value into a server-derived field (T-34-04). They are removed here, and
 *    the stored wrapper is carried over so the strip does not delete the derived value instead
 *    (D-06 / T-34-20).
 *  - There is no `changedFields` from the caller, so it is derived by diffing against a
 *    pre-image. Recalculating unconditionally would violate SC-4 on the busiest path there is.
 *
 * This function DOES emit a `{entity}.updated` `crmBus` event, carrying the full row before the
 * write as `previous` and the full row after it as `data`. That emit is what makes a custom-field
 * edit auditable at all: the audit subscriber is fed exclusively by the bus, and this is the
 * dominant edit surface on this dataset (169 live field definitions).
 *
 * The decision is recorded in `.planning/phases/36-audit-log/36-CONTEXT.md`
 * § Post-Research Addendum. Its accepted consequence is a real, deliberate behaviour change:
 * custom-field-only saves now fire webhooks and workflow triggers for the FIRST time. Existing
 * workflows may begin reacting to saves they previously never saw. This is planned, not
 * incidental — do not "fix" the emit away on the assumption that it is a bug.
 *
 * `recalculateFormulas` is deliberately left silent (`src/lib/formula-recalc.ts`): keeping the
 * depth-1 formula cascade off the bus is what stops one user edit fanning out into a burst of
 * derived-value events.
 *
 * Returns the post-recalculation blob as `values` (CFUI-02). `recalculateFormulas` already
 * computes it; without handing it back, the caller's local state can never learn the new formula
 * wrapper and the display stays pinned to page-load state until a reload.
 */
export async function saveFieldValues(
  entityType: EntityType,
  entityId: string,
  values: Record<string, unknown>,
  /**
   * The authenticated user behind this save, supplied by the caller.
   *
   * Deliberately NOT read from the AsyncLocalStorage actor context. The emitted payload's
   * `userId` feeds webhook consumers and workflow trigger templates, so it must come from the
   * same place every other emit site in the codebase gets it — the caller's session — rather
   * than from an ambient value whose absence would silently produce an unattributed event.
   */
  actorUserId: string
): Promise<{ success: boolean; error?: string; values?: Record<string, unknown> }> {
  // Validate first — before any read or write, exactly as before.
  const validation = await validateFieldValues(entityType, values)
  if (!validation.valid) {
    return { success: false, error: validation.errors.join('; ') }
  }

  // One definition query, reused for the strip, the diff and the recalculation.
  const definitions = await getActiveFieldDefinitions(entityType)
  const previous = await getFieldValues(entityType, entityId)

  // T-34-04: the server is the sole writer of formula keys.
  const posted = stripFormulaKeys(values, definitions)

  // D-06 / T-34-20: the post is a full replacement, so every stored formula value has to be
  // carried over explicitly. Without this, stripping would wipe every derived value on every
  // save — the inverse of the staleness this phase exists to remove.
  const formulaNames = new Set(
    definitions.filter((d) => d.type === 'formula').map((d) => d.name)
  )
  const carriedOver: Record<string, unknown> = {}
  const previousNonFormula: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(previous)) {
    if (formulaNames.has(key)) carriedOver[key] = value
    else previousNonFormula[key] = value
  }

  const next: Record<string, unknown> = { ...carriedOver, ...posted }

  // FORMULA-02 / SC-4: a precise changed-key list, so saving a field no formula reads costs
  // zero evaluations on this path too.
  const changedFields = diffChangedFields(posted, previousNonFormula)

  const table = entityTables[entityType]

  // The `previous` row for the audit diff, read once, before the write.
  //
  // Unprojected on purpose: the emitted payload's `previous` has to be the same SHAPE as its
  // `data`, and `data` is a full raw row at every other emit site in the codebase. Synthesising
  // it from `getFieldValues` alone would give a `{customFields}` stub that no diff could compare
  // against a full row.
  const previousRowResult = await db.select()
    .from(table)
    .where(eq(table.id, entityId))
    .limit(1)
  const previousRow = previousRowResult[0] as Record<string, unknown> | undefined

  // Hoisted so the emitted `data` carries the value actually persisted, not a second `new Date()`
  // a few milliseconds later.
  const writtenAt = new Date()

  await db.update(table)
    .set({
      customFields: next,
      updatedAt: writtenAt,
    })
    .where(eq(table.id, entityId))

  // CFUI-02: seeded with the blob actually written, so the caller always gets something
  // truthful to merge — including on the D-05 swallow path below, where no recalculation ran.
  let recalculated: Record<string, unknown> = next

  try {
    // `row` is deliberately omitted. `getFieldValues` selects only `customFields`, so a row
    // built here would be missing every native attribute ({{Value}}, {{Title}}, ...) and would
    // fabricate errors on any formula reading one. The helper's own primary-key lookup runs
    // after the update above, so it sees both the persisted blob and the real columns.
    const result = await recalculateFormulas({
      entityType,
      entityId,
      changedFields,
      definitionsCache: new Map<EntityType, CustomFieldDefinition[]>([[entityType, definitions]]),
    })
    // LAYERED over `next`, never assigned from `result.customFields` alone.
    //
    // `recalculateFormulas` has two no-op paths that return a blob which does NOT contain the
    // values this save just wrote: the SC-4 fast path (`formula-recalc.ts:663`) returns
    // `input.row?.customFields ?? {}`, and `row` is deliberately omitted above, so it returns
    // `{}` whenever no formula references the changed field. That is the COMMON case — editing
    // any custom field that nothing computes from.
    //
    // Assigning it directly made the emitted `data.customFields` empty, so the audit diff saw
    // `{}` before and `{}` after, produced no change map, and the subscriber's
    // "an update that changed nothing writes no row" guard discarded the event. The value was
    // persisted but NOTHING was audited — and the same empty blob went to every webhook and
    // workflow trigger. Observed in the running container on 2026-08-16: editing a plain text
    // custom field wrote the value and produced zero audit rows.
    //
    // On the success path `result.customFields` is `{ ...existing, ...computed }` where
    // `existing` is the post-write blob, so spreading it over `next` is a no-op there and this
    // stays correct in both directions.
    recalculated = { ...next, ...result.customFields }
  } catch (error) {
    // D-05: a broken admin-authored formula must never block a user's edit. Unchanged — the
    // fallback to `next` above is what makes swallowing safe for the caller.
    console.error(
      `[formula-recalc] saveFieldValues failed, entityType=${entityType} entityId=${entityId}:`,
      error
    )
  }

  // Emitted AFTER the recalculation and AFTER the D-05 catch, so `data` carries the
  // post-recalculation blob — and emitted on the D-05 swallow path too, because the write landed
  // either way and an unlogged write is exactly the failure this is here to remove.
  //
  // Guarded on the pre-read only: this function is reachable with an arbitrary `entityId` from the
  // request body, and `db.update` against a row that does not exist silently affects nothing. With
  // no row there is no write to audit, and emitting anyway would push a fabricated entityId into
  // every workflow trigger and webhook subscriber.
  if (previousRow) {
    const payload: CrmEventPayload = {
      entity: entityType,
      entityId,
      action: "updated",
      data: { ...previousRow, customFields: recalculated, updatedAt: writtenAt },
      previous: previousRow,
      // Passed through as the bare custom-field names the diff produced. The codebase has no
      // `customFields.`-prefixed convention for THIS field: `createDealMutation` puts bare names
      // in `changedFields`, and the workflow trigger's field filter is a free-text list matched by
      // exact membership, so a user filtering on a field types its own name. (The `customFields.`
      // namespacing in `src/lib/audit/diff.ts` applies to the audit CHANGE MAP, a different shape.)
      changedFields: changedFields.length > 0 ? changedFields : null,
      userId: actorUserId,
      timestamp: new Date().toISOString(),
    }
    crmBus.emit(`${entityType}.updated`, payload)
  }

  return { success: true, values: recalculated }
}

// Get field definitions with values for rendering
export async function getFieldsWithValues(
  entityType: EntityType,
  entityId: string
) {
  const [definitions, values] = await Promise.all([
    getActiveFieldDefinitions(entityType),
    getFieldValues(entityType, entityId),
  ])
  
  return definitions.map(def => ({
    ...def,
    value: values[def.name] ?? null,
  }))
}
