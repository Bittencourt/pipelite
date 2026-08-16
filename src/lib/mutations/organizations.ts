import { db } from "@/db"
import { organizations, auditLog } from "@/db/schema"
import type { EntityType, CustomFieldDefinition } from "@/db/schema"
import { eq, and, isNull, isNotNull } from "drizzle-orm"
import { z } from "zod"
import { crmBus } from "@/lib/events"
import type { CrmEventPayload } from "@/lib/events"
import { getCurrentActor } from "@/lib/audit/actor-context"
import type { AuditActor } from "@/lib/audit/actor-context"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import {
  recalculateFormulas,
  stripFormulaKeys,
  ENTITY_NATIVE_ATTRIBUTES,
  CHANGED_FIELDS_CUSTOM_SENTINEL,
} from "@/lib/formula-recalc"

// ---- Zod Schemas ----

export const organizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  website: z.string().url("Invalid website URL").optional().or(z.literal("")),
  industry: z.string().max(50, "Industry must be 50 characters or less").optional(),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
})

export const updateOrganizationSchema = organizationSchema.partial()

// ---- Mutation Input Types ----

interface CreateOrganizationInput {
  name: string
  website?: string
  industry?: string
  notes?: string
  customFields?: Record<string, unknown>
  userId: string
}

// ---- Formula recalculation helpers (D-01 / D-03 / D-17 / T-34-04) ----

const ENTITY: EntityType = "organization"

/**
 * The organization native attribute COLUMN names, derived from the plan 34-03 single source of
 * truth rather than hard-coded. `changedFields` carries column names (`name`), while a formula
 * ref is the attribute name (`Name`); the helper's scoping maps between the two.
 */
const NATIVE_COLUMNS = Object.values(ENTITY_NATIVE_ATTRIBUTES[ENTITY])

type DefinitionsCache = Map<EntityType, CustomFieldDefinition[]>

/** One definition read per mutation, shared with `recalculateFormulas` via `definitionsCache`. */
async function loadDefinitions(cache: DefinitionsCache): Promise<CustomFieldDefinition[]> {
  const cached = cache.get(ENTITY)
  if (cached) return cached

  const definitions = await getActiveFieldDefinitions(ENTITY)
  cache.set(ENTITY, definitions)
  return definitions
}

/**
 * Drop formula-typed keys from caller-supplied custom fields (threat T-34-04).
 *
 * The server is the sole writer of formula values. Without this, any API caller could set an
 * arbitrary value on a server-derived field simply by naming it in `customFields`.
 *
 * If the definition read itself fails we log and persist the caller's blob unchanged rather than
 * failing the user's save: the recalculation that follows overwrites every in-scope formula key
 * anyway, and D-05 forbids formula machinery blocking an edit.
 */
async function stripCallerFormulaKeys(
  values: Record<string, unknown>,
  cache: DefinitionsCache
): Promise<Record<string, unknown>> {
  try {
    return stripFormulaKeys(values, await loadDefinitions(cache))
  } catch (error) {
    console.error(
      "[formula-recalc] failed to load organization field definitions for the formula-key strip:",
      error
    )
    return values
  }
}

/**
 * Recalculate this organization's formulas and return the blob to emit with (D-01 / D-17).
 *
 * MUST be awaited between the row write and `crmBus.emit`: the webhook payload and the
 * workflow-trigger envelope are emit-time snapshots of the row object, so recalculating after
 * the emit would ship stale values even though the stored value is correct.
 *
 * This is also the cascade's primary trigger (D-03): the organization is the only entity with
 * two child relations (deals and people), and the largest measured fan-out in the live data is
 * one organization with 114 deals plus 10 people. The cascade is therefore left at its default
 * `true`, bounded by plan 34-04's single shared 500-evaluation budget — never one budget per
 * child — and by `CASCADE_DEPTH = 1`. Ownership is deliberately ignored (D-09): a stale derived
 * value on another user's deal is exactly the defect this phase removes.
 *
 * Resolves rather than rejects on failure (D-05) — the entity write already succeeded and a
 * broken admin-authored formula must never block a user's edit. The failure is logged, never
 * swallowed.
 */
async function recalcCustomFieldsForEmit(
  entityId: string,
  changedFields: string[],
  row: Record<string, unknown>,
  cache: DefinitionsCache
): Promise<Record<string, unknown>> {
  try {
    const recalced = await recalculateFormulas({
      entityType: ENTITY,
      entityId,
      changedFields,
      // From `.returning()`, so the helper does not re-read the row it was just handed.
      row,
      definitionsCache: cache,
    })
    // `null` = recalculation could not describe the entity, not "no custom fields".
    return recalced.customFields ?? ((row.customFields ?? {}) as Record<string, unknown>)
  } catch (error) {
    console.error(
      "[formula-recalc] organization recalculation failed; emitting the pre-recalc blob:",
      error
    )
    return (row.customFields ?? {}) as Record<string, unknown>
  }
}

// ---- Helpers ----

/**
 * `previous` is the row exactly as it stood BEFORE this write, taken from the unprojected
 * existence-check `findFirst` every mutation below already runs — so it costs no extra query.
 * A subscriber fires after the write has landed and cannot recover a former value for itself;
 * carrying it on the payload is the only way before-values can exist at all.
 *
 * Creates pass nothing: a create has no before-state, and the optional parameter says so.
 * Deletes MUST pass it — `data` is literally `{ id }` there, so `previous` is the sole source
 * of state for the tombstone.
 */
/**
 * The four actor columns of an `audit_log` row, from an actor captured SYNCHRONOUSLY at the
 * calling function's entry.
 *
 * Restore and purge write their audit row directly rather than through the bus subscriber,
 * because CONTEXT.md locks that no `organization.restored` / `organization.purged` event type
 * exists. That makes this file responsible for the rule
 * `src/lib/events/subscribers/audit.ts:78-83` states: NEVER borrow a user id from a payload —
 * that field describes the record being written, not the identity that wrote it. Absence of an
 * actor is recorded honestly as `system`.
 */
function auditActorColumns(actor: AuditActor | undefined) {
  return {
    actorKind: actor?.kind ?? "system",
    actorUserId: actor?.userId ?? null,
    workflowRunId: actor?.workflowRunId ?? null,
    importSessionId: actor?.importSessionId ?? null,
  }
}

function buildEventPayload(
  entityId: string,
  action: "created" | "updated" | "deleted",
  data: Record<string, unknown>,
  userId: string,
  changedFields: string[] | null = null,
  previous?: Record<string, unknown>
): CrmEventPayload {
  return {
    entity: "organization",
    entityId,
    action,
    data,
    previous,
    changedFields,
    userId,
    timestamp: new Date().toISOString(),
  }
}

// ---- Mutations ----

export async function createOrganizationMutation(
  input: CreateOrganizationInput
): Promise<{ success: true; id: string; organization: typeof organizations.$inferSelect } | { success: false; error: string }> {
  // Validate input via Zod
  const validated = organizationSchema.safeParse({
    name: input.name,
    website: input.website,
    industry: input.industry,
    notes: input.notes,
    customFields: input.customFields,
  })

  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  const definitionsCache: DefinitionsCache = new Map()

  try {
    // T-34-04: strip client-set formula keys before they reach the column.
    const customFieldsToPersist = validated.data.customFields !== undefined
      ? await stripCallerFormulaKeys(validated.data.customFields, definitionsCache)
      : {}

    const [organization] = await db.insert(organizations).values({
      name: validated.data.name,
      website: validated.data.website || null,
      industry: validated.data.industry || null,
      notes: validated.data.notes || null,
      ownerId: input.userId,
      // custom_fields is never SQL NULL in this database — default to {}.
      customFields: customFieldsToPersist,
    }).returning()

    // A create writes every field, so `changedFields` is the full native column list plus the
    // custom field keys actually persisted. Not a wildcard — FORMULA-02 must still hold.
    const customFields = await recalcCustomFieldsForEmit(
      organization.id,
      [...NATIVE_COLUMNS, ...Object.keys(customFieldsToPersist)],
      organization as unknown as Record<string, unknown>,
      definitionsCache,
    )

    // Emit CRM event — after the recalculation, never before (D-17).
    crmBus.emit("organization.created", buildEventPayload(
      organization.id,
      "created",
      { ...organization, customFields } as unknown as Record<string, unknown>,
      input.userId,
    ))

    return { success: true, id: organization.id, organization }
  } catch (error) {
    console.error("Failed to create organization:", error)
    return { success: false, error: "Failed to create organization" }
  }
}

export async function updateOrganizationMutation(
  id: string,
  data: z.infer<typeof updateOrganizationSchema>,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Validate input
  const validated = updateOrganizationSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Check if organization exists
  const organization = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, id), isNull(organizations.deletedAt)),
  })

  if (!organization) {
    return { success: false, error: "Organization not found" }
  }

  const definitionsCache: DefinitionsCache = new Map()

  try {
    // Build update data and track changed fields
    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    const changedFields: string[] = []

    if (validated.data.name !== undefined) {
      updateData.name = validated.data.name
      if (validated.data.name !== organization.name) changedFields.push("name")
    }
    if (validated.data.website !== undefined) {
      const newWebsite = validated.data.website || null
      updateData.website = newWebsite
      if (newWebsite !== organization.website) changedFields.push("website")
    }
    if (validated.data.industry !== undefined) {
      const newIndustry = validated.data.industry || null
      updateData.industry = newIndustry
      if (newIndustry !== organization.industry) changedFields.push("industry")
    }
    if (validated.data.notes !== undefined) {
      const newNotes = validated.data.notes || null
      updateData.notes = newNotes
      if (newNotes !== organization.notes) changedFields.push("notes")
    }
    if (validated.data.customFields !== undefined) {
      // Shallow-merge onto the stored blob so an unrelated edit cannot wipe keys.
      // T-34-04: strip client-set formula keys before the merge.
      updateData.customFields = {
        ...(organization.customFields ?? {}),
        ...(await stripCallerFormulaKeys(validated.data.customFields, definitionsCache)),
      }
      changedFields.push("customFields")
    }

    const [updatedOrg] = await db
      .update(organizations)
      .set(updateData)
      .where(eq(organizations.id, id))
      .returning()

    // `changedFields` is passed through verbatim: the plan 34-04 cascade decides the deal and
    // people fan-out from it, so pre-filtering or embellishing it here would change scoping.
    const customFields = await recalcCustomFieldsForEmit(
      id,
      changedFields,
      updatedOrg as unknown as Record<string, unknown>,
      definitionsCache,
    )

    // Emit CRM event — after the recalculation, never before (D-17).
    crmBus.emit("organization.updated", buildEventPayload(
      id,
      "updated",
      { ...updatedOrg, customFields } as unknown as Record<string, unknown>,
      userId,
      changedFields.length > 0 ? changedFields : null,
      // The pre-write row, from the existence check at the top of this function.
      organization as unknown as Record<string, unknown>,
    ))

    return { success: true }
  } catch (error) {
    console.error("Failed to update organization:", error)
    return { success: false, error: "Failed to update organization" }
  }
}

export async function deleteOrganizationMutation(
  id: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Check if organization exists
  const organization = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, id), isNull(organizations.deletedAt)),
  })

  if (!organization) {
    return { success: false, error: "Organization not found" }
  }

  try {
    await db
      .update(organizations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(organizations.id, id))

    // No recalculation here: a soft delete is not a save. (Deals and people of a deleted
    // organization keeping a stale derived value is a known limitation for plan 34-11.)
    // Emit CRM event. `data` is `{ id }` here, so `previous` is the ONLY state a subscriber can
    // build a tombstone from — omitting it would silently produce an audit row with no detail.
    crmBus.emit("organization.deleted", buildEventPayload(
      id,
      "deleted",
      { id },
      userId,
      null,
      organization as unknown as Record<string, unknown>,
    ))

    return { success: true }
  } catch (error) {
    console.error("Failed to delete organization:", error)
    return { success: false, error: "Failed to delete organization" }
  }
}

/**
 * Bring a trashed organization back to live state (TRASH-02).
 *
 * Three deliberate divergences from the delete this mirrors:
 *
 *  1. The existence predicate INVERTS to `isNotNull(deletedAt)`. A live record is not restorable.
 *  2. A miss returns the discriminated code `"NOT_IN_TRASH"`, never prose. The UI has two
 *     different strings for "already purged / already restored" and "restore failed"; telling a
 *     user to retry a record that no longer exists makes them retry forever.
 *  3. Nothing is emitted on the bus. No `organization.restored` event type is introduced
 *     (CONTEXT.md), and emitting `organization.created` would be a lie to every subscriber.
 *     Because there is no event, the audit row is written directly here, not by the subscriber.
 *
 * Restore DOES recalculate where the delete deliberately skips it — the delete's skip is what
 * leaves the stale derived values recorded for plan 34-11, and restore is the repair point.
 */
export async function restoreOrganizationMutation(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Captured synchronously at entry, before any promise exists — the reason is documented at
  // src/lib/events/subscribers/audit.ts:48-56.
  const actor = getCurrentActor()

  const organization = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, id), isNotNull(organizations.deletedAt)),
  })

  if (!organization) {
    return { success: false, error: "NOT_IN_TRASH" }
  }

  try {
    await db
      .update(organizations)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(organizations.id, id))

    // This is the widest and most consequential recalculation in the phase. The cascade walks
    // organization→deal and organization→person (`CASCADE_CHILD_RELATIONS`), which is exactly
    // the direction that repairs dot-reference formulas on the children a trashed organization
    // left holding stale values. It works ONLY after the parent is live: `cascadeToChildren`
    // filters `isNull(relation.deletedAt)`, so the walk must follow the update, never precede it.
    //
    // `changedFields` MUST be broad — an empty list, or `['deletedAt']`, evaluates zero formulas
    // silently, because `deletedAt` is not a referenceable attribute for any entity type and
    // `scopeFormulasToChangedFields` is the SC-4 gate.
    try {
      await recalculateFormulas({
        entityType: ENTITY,
        entityId: id,
        changedFields: [CHANGED_FIELDS_CUSTOM_SENTINEL, ...NATIVE_COLUMNS],
      })
    } catch (error) {
      // D-05: formula machinery never blocks a user's write, and the restore has already landed.
      console.error("[formula-recalc] organization restore recalculation failed:", error)
    }

    // A lost audit row must not roll back a restore the user can already see, so this failure is
    // logged rather than propagated.
    try {
      await db.insert(auditLog).values({
        entityType: ENTITY,
        entityId: id,
        action: "updated",
        changes: { deletedAt: { from: organization.deletedAt, to: null } },
        ...auditActorColumns(actor),
      })
    } catch (error) {
      console.error("[audit] failed to record organization restore:", error)
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to restore organization:", error)
    return { success: false, error: "Failed to restore organization" }
  }
}
