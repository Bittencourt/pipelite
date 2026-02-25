"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { activities, activityTypes, deals } from "@/db/schema"
import { eq, and, isNull, desc, asc } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

// Validation schema for activity data
const activitySchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or less"),
  typeId: z.string().min(1, "Activity type is required"),
  dealId: z.string().optional().nullable(),
  dueDate: z.date({ message: "Due date is required" }),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional().nullable(),
})

const updateActivitySchema = activitySchema.partial()

/**
 * Create a new activity
 * - Validates user is authenticated
 * - Validates activity type exists
 * - Validates deal exists if provided
 * - Returns success with activity ID or error
 */
export async function createActivity(
  data: z.infer<typeof activitySchema>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Validate input
  const validated = activitySchema.safeParse(data)
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
      ownerId: session.user.id,
      dueDate: validated.data.dueDate,
      notes: validated.data.notes || null,
    }).returning()

    revalidatePath("/activities")

    return { success: true, id: activity.id }
  } catch (error) {
    console.error("Failed to create activity:", error)
    return { success: false, error: "Failed to create activity" }
  }
}

/**
 * Update an existing activity
 * - Validates user is authenticated
 * - Verifies user owns the activity
 * - Validates type and deal if changing
 * - Returns success or error
 */
export async function updateActivity(
  id: string,
  data: z.infer<typeof updateActivitySchema>
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Validate input
  const validated = updateActivitySchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Check if activity exists and user owns it
  const activity = await db.query.activities.findFirst({
    where: and(
      eq(activities.id, id),
      isNull(activities.deletedAt)
    ),
  })

  if (!activity) {
    return { success: false, error: "Activity not found" }
  }

  if (activity.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
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

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (validated.data.title !== undefined) {
      updateData.title = validated.data.title
    }
    if (validated.data.typeId !== undefined) {
      updateData.typeId = validated.data.typeId
    }
    if (validated.data.dealId !== undefined) {
      updateData.dealId = validated.data.dealId || null
    }
    if (validated.data.dueDate !== undefined) {
      updateData.dueDate = validated.data.dueDate
    }
    if (validated.data.notes !== undefined) {
      updateData.notes = validated.data.notes || null
    }

    await db
      .update(activities)
      .set(updateData)
      .where(eq(activities.id, id))

    revalidatePath("/activities")
    revalidatePath(`/activities/${id}`)

    return { success: true }
  } catch (error) {
    console.error("Failed to update activity:", error)
    return { success: false, error: "Failed to update activity" }
  }
}

/**
 * Delete an activity (soft delete)
 * - Validates user is authenticated
 * - Verifies user owns the activity
 * - Sets deletedAt timestamp (soft delete)
 * - Returns success or error
 */
export async function deleteActivity(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Check if activity exists and user owns it
  const activity = await db.query.activities.findFirst({
    where: and(
      eq(activities.id, id),
      isNull(activities.deletedAt)
    ),
  })

  if (!activity) {
    return { success: false, error: "Activity not found" }
  }

  if (activity.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  try {
    // Soft delete - set deletedAt timestamp
    await db
      .update(activities)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(activities.id, id))

    revalidatePath("/activities")

    return { success: true }
  } catch (error) {
    console.error("Failed to delete activity:", error)
    return { success: false, error: "Failed to delete activity" }
  }
}

/**
 * Toggle activity completion
 * - Validates user is authenticated
 * - Verifies user owns the activity
 * - Toggles completedAt: null -> now or now -> null
 * - Returns success or error
 */
export async function toggleActivityCompletion(
  id: string
): Promise<{ success: true; completed: boolean } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Check if activity exists and user owns it
  const activity = await db.query.activities.findFirst({
    where: and(
      eq(activities.id, id),
      isNull(activities.deletedAt)
    ),
  })

  if (!activity) {
    return { success: false, error: "Activity not found" }
  }

  if (activity.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  try {
    // Toggle completion
    const newCompletedAt = activity.completedAt ? null : new Date()

    await db
      .update(activities)
      .set({
        completedAt: newCompletedAt,
        updatedAt: new Date(),
      })
      .where(eq(activities.id, id))

    revalidatePath("/activities")

    return { success: true, completed: newCompletedAt !== null }
  } catch (error) {
    console.error("Failed to toggle activity completion:", error)
    return { success: false, error: "Failed to toggle activity completion" }
  }
}

/**
 * Get activities with optional filters
 * - Validates user is authenticated
 * - Returns activities with relations (type, deal, owner)
 * - Filters out deleted activities
 * - Optional filters: typeId, dealId, ownerId, completed status
 * - Orders by dueDate ascending
 */
export async function getActivities(filters?: {
  typeId?: string
  dealId?: string
  ownerId?: string
  completed?: boolean
}): Promise<{ success: true; data: unknown[] } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    // Build where conditions
    const conditions = [isNull(activities.deletedAt)]
    
    if (filters?.typeId) {
      conditions.push(eq(activities.typeId, filters.typeId))
    }
    if (filters?.dealId) {
      conditions.push(eq(activities.dealId, filters.dealId))
    }
    if (filters?.ownerId) {
      conditions.push(eq(activities.ownerId, filters.ownerId))
    }
    if (filters?.completed === true) {
      conditions.push(isNull(activities.deletedAt)) // completedAt is not null - need different approach
    }

    const result = await db.query.activities.findMany({
      where: and(...conditions),
      with: {
        type: true,
        deal: true,
        owner: true,
      },
      orderBy: [asc(activities.dueDate)],
    })

    // Filter by completion status if specified (Drizzle doesn't have isNotNull easily)
    let filteredResults = result
    if (filters?.completed !== undefined) {
      filteredResults = result.filter(a => 
        filters.completed ? a.completedAt !== null : a.completedAt === null
      )
    }

    return { success: true, data: filteredResults }
  } catch (error) {
    console.error("Failed to get activities:", error)
    return { success: false, error: "Failed to get activities" }
  }
}

/**
 * Get a single activity by ID
 * - Validates user is authenticated
 * - Returns activity with relations or null
 */
export async function getActivityById(
  id: string
): Promise<{ success: true; data: unknown | null } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    const activity = await db.query.activities.findFirst({
      where: and(
        eq(activities.id, id),
        isNull(activities.deletedAt)
      ),
      with: {
        type: true,
        deal: true,
        owner: true,
      },
    })

    return { success: true, data: activity }
  } catch (error) {
    console.error("Failed to get activity:", error)
    return { success: false, error: "Failed to get activity" }
  }
}

/**
 * Get all activity types
 * - Validates user is authenticated
 * - Returns activity types ordered by name
 */
export async function getActivityTypes(): Promise<
  { success: true; data: unknown[] } | { success: false; error: string }
> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    const types = await db.query.activityTypes.findMany({
      orderBy: [asc(activityTypes.name)],
    })

    return { success: true, data: types }
  } catch (error) {
    console.error("Failed to get activity types:", error)
    return { success: false, error: "Failed to get activity types" }
  }
}
