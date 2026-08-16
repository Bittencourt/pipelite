import { db } from "@/db"
import { activities, activityTypes, deals } from "@/db/schema"
import type { CustomFieldDefinition, EntityType } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { z } from "zod"
import { crmBus } from "@/lib/events"
import type { CrmEventPayload } from "@/lib/events"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import {
  recalculateFormulas,
  stripFormulaKeys,
  ENTITY_NATIVE_ATTRIBUTES,
  type RecalculateFormulasInput,
} from "@/lib/formula-recalc"

// ---- Zod Schemas ----

export const activitySchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or less"),
  typeId: z.string().min(1, "Activity type is required"),
  dealId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.date({ message: "Due date is required" }),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional().nullable(),
  customFields: z.record(z.string(), z.unknown()).optional(),
})

export const updateActivitySchema = activitySchema.partial()

// ---- Mutation Input Types ----

interface CreateActivityInput {
  title: string
  typeId: string
  dealId?: string | null
  assigneeId?: string | null
  dueDate: Date
  notes?: string | null
  customFields?: Record<string, unknown>
  userId: string
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
function buildEventPayload(
  entityId: string,
  action: "created" | "updated" | "deleted",
  data: Record<string, unknown>,
  userId: string,
  changedFields: string[] | null = null,
  previous?: Record<string, unknown>
): CrmEventPayload {
  return {
    entity: "activity",
    entityId,
    action,
    data,
    previous,
    changedFields,
    userId,
    timestamp: new Date().toISOString(),
  }
}

/**
 * The native columns a create writes. A create genuinely changes every field, so a formula over
 * any of them must run — but this is still a precise list, not a wildcard, so FORMULA-02/SC-4
 * keeps holding for the update and completion-toggle paths.
 */
const ACTIVITY_NATIVE_COLUMNS = Object.values(ENTITY_NATIVE_ATTRIBUTES.activity)

/**
 * Recalculate this activity's formula custom fields and return the blob to emit (D-01/D-17).
 *
 * The caller MUST await this before `crmBus.emit`: the webhook body and the workflow-trigger
 * envelope are emit-time snapshots of the row object, never a re-read, so recalculating after
 * the emit would leave both carrying stale values even though the stored row was correct.
 *
 * Resolves rather than rejects on failure (D-05): a broken admin-authored formula must never
 * block a user's edit. The failure is logged, not swallowed (T-34-17).
 */
async function recalcCustomFields(
  input: RecalculateFormulasInput,
  fallback: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const { customFields } = await recalculateFormulas(input)
    return customFields
  } catch (error) {
    console.error("[formula-recalc] activity recalculation failed:", error)
    return fallback
  }
}

// ---- Mutations ----

export async function createActivityMutation(
  input: CreateActivityInput
): Promise<{ success: true; id: string; activity: typeof activities.$inferSelect } | { success: false; error: string }> {
  // Validate input via Zod
  const validated = activitySchema.safeParse({
    title: input.title,
    typeId: input.typeId,
    dealId: input.dealId,
    assigneeId: input.assigneeId,
    dueDate: input.dueDate,
    notes: input.notes,
    customFields: input.customFields,
  })

  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  try {
    // Validate activity type exists
    const type = await db.query.activityTypes.findFirst({
      where: eq(activityTypes.id, validated.data.typeId),
    })

    if (!type) {
      return { success: false, error: "Activity type not found" }
    }

    // Validate deal exists if provided
    if (validated.data.dealId) {
      const deal = await db.query.deals.findFirst({
        where: and(
          eq(deals.id, validated.data.dealId),
          isNull(deals.deletedAt)
        ),
      })
      if (!deal) {
        return { success: false, error: "Deal not found" }
      }
    }

    // T-34-04: the server is the sole writer of formula keys, so a client-supplied value for a
    // formula-typed field is dropped before it can reach the JSONB blob. The definitions are
    // handed to the recalculation through `definitionsCache` so they are not read twice.
    const definitionsCache = new Map<EntityType, CustomFieldDefinition[]>()
    let customFieldsToPersist: Record<string, unknown> = {}
    if (validated.data.customFields !== undefined) {
      const definitions = await getActiveFieldDefinitions("activity")
      definitionsCache.set("activity", definitions)
      customFieldsToPersist = stripFormulaKeys(validated.data.customFields, definitions)
    }

    const [activity] = await db.insert(activities).values({
      title: validated.data.title,
      typeId: validated.data.typeId,
      dealId: validated.data.dealId || null,
      assigneeId: validated.data.assigneeId || null,
      ownerId: input.userId,
      dueDate: validated.data.dueDate,
      notes: validated.data.notes || null,
      // custom_fields is never SQL NULL in this database — default to {}.
      customFields: customFieldsToPersist,
    }).returning()

    // Recalculate BEFORE the emit (D-17), never after.
    const recalculatedCustomFields = await recalcCustomFields(
      {
        entityType: "activity",
        entityId: activity.id,
        changedFields: [...ACTIVITY_NATIVE_COLUMNS, ...Object.keys(customFieldsToPersist)],
        row: activity as unknown as Record<string, unknown>,
        definitionsCache,
      },
      (activity.customFields ?? {}) as Record<string, unknown>,
    )

    // Emit CRM event
    crmBus.emit("activity.created", buildEventPayload(
      activity.id,
      "created",
      { ...activity, customFields: recalculatedCustomFields } as unknown as Record<string, unknown>,
      input.userId,
    ))

    return { success: true, id: activity.id, activity }
  } catch (error) {
    console.error("Failed to create activity:", error)
    return { success: false, error: "Failed to create activity" }
  }
}

export async function updateActivityMutation(
  id: string,
  data: z.infer<typeof updateActivitySchema>,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Validate input
  const validated = updateActivitySchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Check if activity exists
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), isNull(activities.deletedAt)),
  })

  if (!activity) {
    return { success: false, error: "Activity not found" }
  }

  try {
    // Validate activity type if changing
    if (validated.data.typeId) {
      const type = await db.query.activityTypes.findFirst({
        where: eq(activityTypes.id, validated.data.typeId),
      })
      if (!type) {
        return { success: false, error: "Activity type not found" }
      }
    }

    // Validate deal if changing
    if (validated.data.dealId !== undefined && validated.data.dealId !== null) {
      const deal = await db.query.deals.findFirst({
        where: and(
          eq(deals.id, validated.data.dealId),
          isNull(deals.deletedAt)
        ),
      })
      if (!deal) {
        return { success: false, error: "Deal not found" }
      }
    }

    // Build update data and track changed fields
    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    const changedFields: string[] = []
    // Shared with the recalculation below, so the definition query runs at most once.
    const definitionsCache = new Map<EntityType, CustomFieldDefinition[]>()

    if (validated.data.title !== undefined) {
      updateData.title = validated.data.title
      if (validated.data.title !== activity.title) changedFields.push("title")
    }
    if (validated.data.typeId !== undefined) {
      updateData.typeId = validated.data.typeId
      if (validated.data.typeId !== activity.typeId) changedFields.push("typeId")
    }
    if (validated.data.dealId !== undefined) {
      updateData.dealId = validated.data.dealId || null
      if ((validated.data.dealId || null) !== activity.dealId) changedFields.push("dealId")
    }
    if (validated.data.dueDate !== undefined) {
      updateData.dueDate = validated.data.dueDate
      changedFields.push("dueDate")
    }
    if (validated.data.notes !== undefined) {
      const newNotes = validated.data.notes || null
      updateData.notes = newNotes
      if (newNotes !== activity.notes) changedFields.push("notes")
    }
    if (validated.data.assigneeId !== undefined) {
      updateData.assigneeId = validated.data.assigneeId || null
      if ((validated.data.assigneeId || null) !== activity.assigneeId) changedFields.push("assigneeId")
    }
    if (validated.data.customFields !== undefined) {
      // T-34-04: drop client-supplied formula keys before they reach the blob.
      const definitions = await getActiveFieldDefinitions("activity")
      definitionsCache.set("activity", definitions)
      // Shallow-merge onto the stored blob so an unrelated edit cannot wipe keys.
      updateData.customFields = {
        ...(activity.customFields ?? {}),
        ...stripFormulaKeys(validated.data.customFields, definitions),
      }
      changedFields.push("customFields")
    }

    const [updatedActivity] = await db
      .update(activities)
      .set(updateData)
      .where(eq(activities.id, id))
      .returning()

    // Recalculate before the emit (D-17). FORMULA-02/SC-4: `changedFields` is passed straight
    // through as the recalc scope, so an edit no formula reads produces zero evaluations.
    const recalculatedCustomFields = await recalcCustomFields(
      {
        entityType: "activity",
        entityId: id,
        changedFields,
        row: updatedActivity as unknown as Record<string, unknown>,
        definitionsCache,
      },
      (updatedActivity.customFields ?? {}) as Record<string, unknown>,
    )

    // Emit CRM event
    crmBus.emit("activity.updated", buildEventPayload(
      id,
      "updated",
      { ...updatedActivity, customFields: recalculatedCustomFields } as unknown as Record<string, unknown>,
      userId,
      changedFields.length > 0 ? changedFields : null,
      // The pre-write row, from the existence check at the top of this function.
      activity as unknown as Record<string, unknown>,
    ))

    return { success: true }
  } catch (error) {
    console.error("Failed to update activity:", error)
    return { success: false, error: "Failed to update activity" }
  }
}

export async function deleteActivityMutation(
  id: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Check if activity exists
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), isNull(activities.deletedAt)),
  })

  if (!activity) {
    return { success: false, error: "Activity not found" }
  }

  try {
    // No formula recalculation here: a soft delete is not a save. Children of a deleted parent
    // keeping a stale derived value is a known limitation, recorded in plan 34-11.
    await db
      .update(activities)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(activities.id, id))

    // Emit CRM event. `data` is `{ id }` here, so `previous` is the ONLY state a subscriber can
    // build a tombstone from — omitting it would silently produce an audit row with no detail.
    crmBus.emit("activity.deleted", buildEventPayload(
      id,
      "deleted",
      { id },
      userId,
      null,
      activity as unknown as Record<string, unknown>,
    ))

    return { success: true }
  } catch (error) {
    console.error("Failed to delete activity:", error)
    return { success: false, error: "Failed to delete activity" }
  }
}

export async function toggleActivityCompletionMutation(
  id: string,
  userId: string,
): Promise<{ success: true; completed: boolean } | { success: false; error: string }> {
  // Check if activity exists
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), isNull(activities.deletedAt)),
  })

  if (!activity) {
    return { success: false, error: "Activity not found" }
  }

  try {
    // Toggle completion
    const newCompletedAt = activity.completedAt ? null : new Date()

    const [updatedActivity] = await db
      .update(activities)
      .set({
        completedAt: newCompletedAt,
        updatedAt: new Date(),
      })
      .where(eq(activities.id, id))
      .returning()

    // Recalculate before the emit (D-17). The event's own changedFields stays `["completed"]`;
    // the recalc scope additionally carries `completedAt`, which is the column the CompletedAt
    // native attribute maps to, so a formula over {{CompletedAt}} is genuinely in scope here.
    const recalculatedCustomFields = await recalcCustomFields(
      {
        entityType: "activity",
        entityId: id,
        changedFields: ["completed", "completedAt"],
        row: updatedActivity as unknown as Record<string, unknown>,
        definitionsCache: new Map<EntityType, CustomFieldDefinition[]>(),
      },
      (updatedActivity.customFields ?? {}) as Record<string, unknown>,
    )

    // Emit CRM event
    crmBus.emit("activity.updated", buildEventPayload(
      id,
      "updated",
      { ...updatedActivity, customFields: recalculatedCustomFields } as unknown as Record<string, unknown>,
      userId,
      ["completed"],
      // The pre-toggle row — this is what makes `completedAt: null -> <date>` visible.
      activity as unknown as Record<string, unknown>,
    ))

    return { success: true, completed: newCompletedAt !== null }
  } catch (error) {
    console.error("Failed to toggle activity completion:", error)
    return { success: false, error: "Failed to toggle activity completion" }
  }
}
