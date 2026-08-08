import { db } from "@/db"
import { activities, activityTypes, deals } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { z } from "zod"
import { crmBus } from "@/lib/events"
import type { CrmEventPayload } from "@/lib/events"

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

function buildEventPayload(
  entityId: string,
  action: "created" | "updated" | "deleted",
  data: Record<string, unknown>,
  userId: string,
  changedFields: string[] | null = null
): CrmEventPayload {
  return {
    entity: "activity",
    entityId,
    action,
    data,
    changedFields,
    userId,
    timestamp: new Date().toISOString(),
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

    const [activity] = await db.insert(activities).values({
      title: validated.data.title,
      typeId: validated.data.typeId,
      dealId: validated.data.dealId || null,
      assigneeId: validated.data.assigneeId || null,
      ownerId: input.userId,
      dueDate: validated.data.dueDate,
      notes: validated.data.notes || null,
    }).returning()

    // Emit CRM event
    crmBus.emit("activity.created", buildEventPayload(
      activity.id,
      "created",
      activity as unknown as Record<string, unknown>,
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

    const [updatedActivity] = await db
      .update(activities)
      .set(updateData)
      .where(eq(activities.id, id))
      .returning()

    // Emit CRM event
    crmBus.emit("activity.updated", buildEventPayload(
      id,
      "updated",
      updatedActivity as unknown as Record<string, unknown>,
      userId,
      changedFields.length > 0 ? changedFields : null,
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
    await db
      .update(activities)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(activities.id, id))

    // Emit CRM event
    crmBus.emit("activity.deleted", buildEventPayload(
      id,
      "deleted",
      { id },
      userId,
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

    // Emit CRM event
    crmBus.emit("activity.updated", buildEventPayload(
      id,
      "updated",
      updatedActivity as unknown as Record<string, unknown>,
      userId,
      ["completed"],
    ))

    return { success: true, completed: newCompletedAt !== null }
  } catch (error) {
    console.error("Failed to toggle activity completion:", error)
    return { success: false, error: "Failed to toggle activity completion" }
  }
}
