import { db } from "@/db"
import { people, organizations, auditLog } from "@/db/schema"
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

export const personSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50, "First name must be 50 characters or less"),
  lastName: z.string().min(1, "Last name is required").max(50, "Last name must be 50 characters or less"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().max(30, "Phone must be 30 characters or less").optional().or(z.literal("")),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional().or(z.literal("")),
  organizationId: z.string().optional().or(z.literal("")),
  customFields: z.record(z.string(), z.unknown()).optional(),
})

export const updatePersonSchema = personSchema.partial()

// ---- Mutation Input Types ----

interface CreatePersonInput {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  notes?: string
  organizationId?: string
  customFields?: Record<string, unknown>
  userId: string
}

// ---- Formula recalculation helpers (D-01 / D-17 / T-34-04) ----

const ENTITY: EntityType = "person"

/**
 * The person native attribute COLUMN names, derived from the plan 34-03 single source of truth
 * rather than hard-coded. `changedFields` carries column names (`firstName`), while a formula
 * ref is the attribute name (`FirstName`); the helper's scoping maps between the two.
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
      "[formula-recalc] failed to load person field definitions for the formula-key strip:",
      error
    )
    return values
  }
}

/**
 * Recalculate this person's formulas and return the blob to emit with (D-01 / D-17).
 *
 * MUST be awaited between the row write and `crmBus.emit`: the webhook payload and the
 * workflow-trigger envelope are emit-time snapshots of the row object, so recalculating after
 * the emit would ship stale values even though the stored value is correct.
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
      "[formula-recalc] person recalculation failed; emitting the pre-recalc blob:",
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
 * because CONTEXT.md locks that no `person.restored` / `person.purged` event type exists. That
 * makes this file responsible for the rule `src/lib/events/subscribers/audit.ts:78-83` states:
 * NEVER borrow a user id from a payload — that field describes the record being written, not the
 * identity that wrote it. Absence of an actor is recorded honestly as `system`.
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
    entity: "person",
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

export async function createPersonMutation(
  input: CreatePersonInput
): Promise<{ success: true; id: string; person: typeof people.$inferSelect } | { success: false; error: string }> {
  // Validate input via Zod
  const validated = personSchema.safeParse({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    notes: input.notes,
    organizationId: input.organizationId,
    customFields: input.customFields,
  })

  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Validate organization exists if provided
  const organizationId = validated.data.organizationId || null
  if (organizationId) {
    const org = await db.query.organizations.findFirst({
      where: and(
        eq(organizations.id, organizationId),
        isNull(organizations.deletedAt)
      ),
    })
    if (!org) {
      return { success: false, error: "Organization not found" }
    }
  }

  const definitionsCache: DefinitionsCache = new Map()

  try {
    // T-34-04: strip client-set formula keys before they reach the column.
    const customFieldsToPersist = validated.data.customFields !== undefined
      ? await stripCallerFormulaKeys(validated.data.customFields, definitionsCache)
      : {}

    const [person] = await db.insert(people).values({
      firstName: validated.data.firstName,
      lastName: validated.data.lastName,
      email: validated.data.email || null,
      phone: validated.data.phone || null,
      notes: validated.data.notes || null,
      organizationId,
      ownerId: input.userId,
      // custom_fields is never SQL NULL in this database — default to {}.
      customFields: customFieldsToPersist,
    }).returning()

    // A create writes every field, so `changedFields` is the full native column list plus the
    // custom field keys actually persisted. Not a wildcard — FORMULA-02 must still hold.
    const customFields = await recalcCustomFieldsForEmit(
      person.id,
      [...NATIVE_COLUMNS, ...Object.keys(customFieldsToPersist)],
      person as unknown as Record<string, unknown>,
      definitionsCache,
    )

    // Emit CRM event — after the recalculation, never before (D-17).
    crmBus.emit("person.created", buildEventPayload(
      person.id,
      "created",
      { ...person, customFields } as unknown as Record<string, unknown>,
      input.userId,
    ))

    return { success: true, id: person.id, person }
  } catch (error) {
    console.error("Failed to create person:", error)
    return { success: false, error: "Failed to create person" }
  }
}

export async function updatePersonMutation(
  id: string,
  data: z.infer<typeof updatePersonSchema>,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Validate input
  const validated = updatePersonSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Check if person exists
  const person = await db.query.people.findFirst({
    where: and(eq(people.id, id), isNull(people.deletedAt)),
  })

  if (!person) {
    return { success: false, error: "Person not found" }
  }

  // Validate organization exists if provided
  const organizationId = validated.data.organizationId !== undefined
    ? (validated.data.organizationId || null)
    : undefined
  if (organizationId) {
    const org = await db.query.organizations.findFirst({
      where: and(
        eq(organizations.id, organizationId),
        isNull(organizations.deletedAt)
      ),
    })
    if (!org) {
      return { success: false, error: "Organization not found" }
    }
  }

  const definitionsCache: DefinitionsCache = new Map()

  try {
    // Build update data and track changed fields
    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    const changedFields: string[] = []

    if (validated.data.firstName !== undefined) {
      updateData.firstName = validated.data.firstName
      if (validated.data.firstName !== person.firstName) changedFields.push("firstName")
    }
    if (validated.data.lastName !== undefined) {
      updateData.lastName = validated.data.lastName
      if (validated.data.lastName !== person.lastName) changedFields.push("lastName")
    }
    if (validated.data.email !== undefined) {
      const newEmail = validated.data.email || null
      updateData.email = newEmail
      if (newEmail !== person.email) changedFields.push("email")
    }
    if (validated.data.phone !== undefined) {
      const newPhone = validated.data.phone || null
      updateData.phone = newPhone
      if (newPhone !== person.phone) changedFields.push("phone")
    }
    if (validated.data.notes !== undefined) {
      const newNotes = validated.data.notes || null
      updateData.notes = newNotes
      if (newNotes !== person.notes) changedFields.push("notes")
    }
    if (organizationId !== undefined) {
      updateData.organizationId = organizationId
      if (organizationId !== person.organizationId) changedFields.push("organizationId")
    }
    if (validated.data.customFields !== undefined) {
      // Shallow-merge onto the stored blob so an unrelated edit cannot wipe keys.
      // T-34-04: strip client-set formula keys before the merge.
      updateData.customFields = {
        ...(person.customFields ?? {}),
        ...(await stripCallerFormulaKeys(validated.data.customFields, definitionsCache)),
      }
      changedFields.push("customFields")
    }

    const [updatedPerson] = await db
      .update(people)
      .set(updateData)
      .where(eq(people.id, id))
      .returning()

    // `changedFields` is passed through verbatim: the plan 34-04 cascade decides child fan-out
    // from it, so pre-filtering or embellishing it here would change scoping semantics.
    const customFields = await recalcCustomFieldsForEmit(
      id,
      changedFields,
      updatedPerson as unknown as Record<string, unknown>,
      definitionsCache,
    )

    // Emit CRM event — after the recalculation, never before (D-17).
    crmBus.emit("person.updated", buildEventPayload(
      id,
      "updated",
      { ...updatedPerson, customFields } as unknown as Record<string, unknown>,
      userId,
      changedFields.length > 0 ? changedFields : null,
      // The pre-write row, from the existence check at the top of this function.
      person as unknown as Record<string, unknown>,
    ))

    return { success: true }
  } catch (error) {
    console.error("Failed to update person:", error)
    return { success: false, error: "Failed to update person" }
  }
}

export async function deletePersonMutation(
  id: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Check if person exists
  const person = await db.query.people.findFirst({
    where: and(eq(people.id, id), isNull(people.deletedAt)),
  })

  if (!person) {
    return { success: false, error: "Person not found" }
  }

  try {
    await db
      .update(people)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(people.id, id))

    // No recalculation here: a soft delete is not a save. (A deleted person's children keeping
    // a stale derived value is a known limitation recorded for plan 34-11.)
    // Emit CRM event. `data` is `{ id }` here, so `previous` is the ONLY state a subscriber can
    // build a tombstone from — omitting it would silently produce an audit row with no detail.
    crmBus.emit("person.deleted", buildEventPayload(
      id,
      "deleted",
      { id },
      userId,
      null,
      person as unknown as Record<string, unknown>,
    ))

    return { success: true }
  } catch (error) {
    console.error("Failed to delete person:", error)
    return { success: false, error: "Failed to delete person" }
  }
}

/**
 * Bring a trashed person back to live state (TRASH-02).
 *
 * Three deliberate divergences from the delete this mirrors:
 *
 *  1. The existence predicate INVERTS to `isNotNull(deletedAt)`. A live record is not restorable.
 *  2. A miss returns the discriminated code `"NOT_IN_TRASH"`, never prose. The UI has two
 *     different strings for "already purged / already restored" and "restore failed"; telling a
 *     user to retry a record that no longer exists makes them retry forever.
 *  3. Nothing is emitted on the bus. No `person.restored` event type is introduced (CONTEXT.md),
 *     and emitting `person.created` would be a lie to every subscriber. Because there is no
 *     event, the audit row is written directly here instead of by the bus subscriber.
 *
 * Restore DOES recalculate where the delete deliberately skips it — the delete's skip is what
 * leaves the stale derived values recorded for plan 34-11, and restore is the repair point.
 */
export async function restorePersonMutation(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Captured synchronously at entry, before any promise exists — the reason is documented at
  // src/lib/events/subscribers/audit.ts:48-56.
  const actor = getCurrentActor()

  const person = await db.query.people.findFirst({
    where: and(eq(people.id, id), isNotNull(people.deletedAt)),
  })

  if (!person) {
    return { success: false, error: "NOT_IN_TRASH" }
  }

  try {
    await db
      .update(people)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(people.id, id))

    // AFTER the update, never before: `cascadeToChildren` filters the child relation's null
    // `deletedAt`, so the person→deal direction only re-enters the cascade once the parent is
    // live. `changedFields` MUST be broad — an empty list, or `['deletedAt']`, evaluates zero
    // formulas silently, because `deletedAt` is not a referenceable attribute for any entity
    // type and `scopeFormulasToChangedFields` is the SC-4 gate.
    try {
      await recalculateFormulas({
        entityType: ENTITY,
        entityId: id,
        changedFields: [CHANGED_FIELDS_CUSTOM_SENTINEL, ...NATIVE_COLUMNS],
      })
    } catch (error) {
      // D-05: formula machinery never blocks a user's write, and the restore has already landed.
      console.error("[formula-recalc] person restore recalculation failed:", error)
    }

    // A lost audit row must not roll back a restore the user can already see, so this failure is
    // logged rather than propagated.
    try {
      await db.insert(auditLog).values({
        entityType: ENTITY,
        entityId: id,
        action: "updated",
        changes: { deletedAt: { from: person.deletedAt, to: null } },
        ...auditActorColumns(actor),
      })
    } catch (error) {
      console.error("[audit] failed to record person restore:", error)
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to restore person:", error)
    return { success: false, error: "Failed to restore person" }
  }
}
