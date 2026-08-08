"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { activities, activityTypes } from "@/db/schema"
import { eq, and, isNull, asc, or, ilike } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  createActivityMutation,
  updateActivityMutation,
  deleteActivityMutation,
  toggleActivityCompletionMutation,
  activitySchema,
  updateActivitySchema,
} from "@/lib/mutations/activities"

/**
 * Create a new activity
 * - Validates user is authenticated
 * - Delegates to mutation layer for validation, insert, and event emission
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

  const result = await createActivityMutation({
    ...data,
    userId: session.user.id,
  })

  if (!result.success) {
    return result
  }

  revalidatePath("/activities")

  return { success: true, id: result.id }
}

/**
 * Update an existing activity
 * - Validates user is authenticated
 * - Verifies user owns the activity
 * - Delegates to mutation layer for update and event emission
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

  // Check ownership
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

  const result = await updateActivityMutation(id, data, session.user.id)

  if (!result.success) {
    return result
  }

  revalidatePath("/activities")
  revalidatePath(`/activities/${id}`)

  return { success: true }
}

/**
 * Delete an activity (soft delete)
 * - Validates user is authenticated
 * - Verifies user owns the activity
 * - Delegates to mutation layer for delete and event emission
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

  // Check ownership
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

  const result = await deleteActivityMutation(id, session.user.id)

  if (!result.success) {
    return result
  }

  revalidatePath("/activities")

  return { success: true }
}

/**
 * Toggle activity completion
 * - Validates user is authenticated
 * - Verifies user owns the activity
 * - Delegates to mutation layer for toggle and event emission
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

  // Check ownership
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

  const result = await toggleActivityCompletionMutation(id, session.user.id)

  if (!result.success) {
    return result
  }

  revalidatePath("/activities")

  return { success: true, completed: result.completed }
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
  assigneeId?: string
  completed?: boolean
  search?: string
  limit?: number
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
    if (filters?.assigneeId) {
      conditions.push(eq(activities.assigneeId, filters.assigneeId))
    }
    if (filters?.completed === true) {
      conditions.push(isNull(activities.deletedAt)) // completedAt is not null - need different approach
    }
    if (filters?.search) {
      conditions.push(
        or(
          ilike(activities.title, `%${filters.search}%`),
          ilike(activities.notes, `%${filters.search}%`)
        )!
      )
    }

    const result = await db.query.activities.findMany({
      where: and(...conditions),
      with: {
        type: true,
        deal: true,
        owner: true,
        assignee: {
          columns: { id: true, name: true, email: true },
        },
      },
      orderBy: [asc(activities.dueDate)],
      limit: filters?.limit,
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
