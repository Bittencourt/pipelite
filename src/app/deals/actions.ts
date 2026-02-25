"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { deals, stages, organizations, people } from "@/db/schema"
import { eq, and, isNull, sql, desc } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

// Validation schema for deal data
const dealSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or less"),
  value: z.number().min(0).optional().nullable(),
  stageId: z.string().min(1, "Stage is required"),
  organizationId: z.string().optional().nullable(),
  personId: z.string().optional().nullable(),
  expectedCloseDate: z.date().optional().nullable(),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional().nullable(),
})

const updateDealSchema = dealSchema.partial()

/**
 * Create a new deal
 * - Validates user is authenticated
 * - Validates at least one of org/person is set
 * - Validates stage exists and is not deleted
 * - Validates org/person exist if provided
 * - Generates position (max position + 10000 or 10000 if first in stage)
 * - Returns success with deal ID or error
 */
export async function createDeal(
  data: z.infer<typeof dealSchema>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Validate input
  const validated = dealSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Validate at least one of org/person is set
  if (!validated.data.organizationId && !validated.data.personId) {
    return { success: false, error: "At least one of organization or person is required" }
  }

  try {
    // Validate stage exists and is not deleted
    const stage = await db.query.stages.findFirst({
      where: eq(stages.id, validated.data.stageId),
      with: {
        pipeline: true,
      },
    })

    if (!stage || stage.pipeline.deletedAt) {
      return { success: false, error: "Stage not found" }
    }

    // Validate organization exists if provided
    if (validated.data.organizationId) {
      const org = await db.query.organizations.findFirst({
        where: and(
          eq(organizations.id, validated.data.organizationId),
          isNull(organizations.deletedAt)
        ),
      })
      if (!org) {
        return { success: false, error: "Organization not found" }
      }
    }

    // Validate person exists if provided
    if (validated.data.personId) {
      const person = await db.query.people.findFirst({
        where: and(
          eq(people.id, validated.data.personId),
          isNull(people.deletedAt)
        ),
      })
      if (!person) {
        return { success: false, error: "Person not found" }
      }
    }

    // Get existing deals in stage to calculate position
    const existingDeals = await db.query.deals.findMany({
      where: and(
        eq(deals.stageId, validated.data.stageId),
        isNull(deals.deletedAt)
      ),
      orderBy: [desc(deals.position)],
    })

    // Calculate position (add 10000 to max position, or start at 10000 if empty)
    const maxPosition = existingDeals[0]?.position ?? 0
    const position = (parseFloat(maxPosition) + 10000).toString()

    const [deal] = await db.insert(deals).values({
      title: validated.data.title,
      value: validated.data.value !== undefined ? validated.data.value?.toString() : null,
      stageId: validated.data.stageId,
      organizationId: validated.data.organizationId || null,
      personId: validated.data.personId || null,
      ownerId: session.user.id,
      position,
    }).returning()

    revalidatePath("/deals")
    revalidatePath(`/deals/${stage.pipelineId}`)

    return { success: true, id: deal.id }
  } catch (error) {
    console.error("Failed to create deal:", error)
    return { success: false, error: "Failed to create deal" }
  }
}

/**
 * Update an existing deal
 * - Validates user is authenticated
 * - Verifies user owns the deal
 * - Validates at least one of org/person is set if both being changed
 * - Returns success or error
 */
export async function updateDeal(
  id: string,
  data: z.infer<typeof updateDealSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Validate input
  const validated = updateDealSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Check if deal exists and user owns it
  const deal = await db.query.deals.findFirst({
    where: and(
      eq(deals.id, id),
      isNull(deals.deletedAt)
    ),
  })

  if (!deal) {
    return { success: false, error: "Deal not found" }
  }

  if (deal.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  // Validate at least one of org/person is set after update
  const newOrgId = validated.data.organizationId !== undefined 
    ? validated.data.organizationId 
    : deal.organizationId
  const newPersonId = validated.data.personId !== undefined 
    ? validated.data.personId 
    : deal.personId

  if (!newOrgId && !newPersonId) {
    return { success: false, error: "At least one of organization or person is required" }
  }

  try {
    // Validate organization exists if changing
    if (validated.data.organizationId) {
      const org = await db.query.organizations.findFirst({
        where: and(
          eq(organizations.id, validated.data.organizationId),
          isNull(organizations.deletedAt)
        ),
      })
      if (!org) {
        return { success: false, error: "Organization not found" }
      }
    }

    // Validate person exists if changing
    if (validated.data.personId) {
      const person = await db.query.people.findFirst({
        where: and(
          eq(people.id, validated.data.personId),
          isNull(people.deletedAt)
        ),
      })
      if (!person) {
        return { success: false, error: "Person not found" }
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (validated.data.title !== undefined) {
      updateData.title = validated.data.title
    }
    if (validated.data.value !== undefined) {
      updateData.value = validated.data.value?.toString() ?? null
    }
    if (validated.data.stageId !== undefined) {
      updateData.stageId = validated.data.stageId
    }
    if (validated.data.organizationId !== undefined) {
      updateData.organizationId = validated.data.organizationId || null
    }
    if (validated.data.personId !== undefined) {
      updateData.personId = validated.data.personId || null
    }
    if (validated.data.expectedCloseDate !== undefined) {
      updateData.expectedCloseDate = validated.data.expectedCloseDate
    }
    if (validated.data.notes !== undefined) {
      updateData.notes = validated.data.notes || null
    }

    await db
      .update(deals)
      .set(updateData)
      .where(eq(deals.id, id))

    revalidatePath("/deals")
    revalidatePath(`/deals/${id}`)

    return { success: true }
  } catch (error) {
    console.error("Failed to update deal:", error)
    return { success: false, error: "Failed to update deal" }
  }
}

/**
 * Delete a deal (soft delete)
 * - Validates user is authenticated
 * - Verifies user owns the deal
 * - Sets deletedAt timestamp (soft delete)
 * - Returns success or error
 */
export async function deleteDeal(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Check if deal exists and user owns it
  const deal = await db.query.deals.findFirst({
    where: and(
      eq(deals.id, id),
      isNull(deals.deletedAt)
    ),
  })

  if (!deal) {
    return { success: false, error: "Deal not found" }
  }

  if (deal.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  try {
    // Soft delete - set deletedAt timestamp
    await db
      .update(deals)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deals.id, id))

    revalidatePath("/deals")

    return { success: true }
  } catch (error) {
    console.error("Failed to delete deal:", error)
    return { success: false, error: "Failed to delete deal" }
  }
}

/**
 * Move deal to a new stage
 * - Validates user is authenticated
 * - Verifies user owns the deal
 * - Updates stageId and recalculates position in new stage
 * - Returns success or error
 */
export async function updateDealStage(
  id: string,
  stageId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Check if deal exists and user owns it
  const deal = await db.query.deals.findFirst({
    where: and(
      eq(deals.id, id),
      isNull(deals.deletedAt)
    ),
  })

  if (!deal) {
    return { success: false, error: "Deal not found" }
  }

  if (deal.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  try {
    // Validate new stage exists
    const newStage = await db.query.stages.findFirst({
      where: eq(stages.id, stageId),
      with: {
        pipeline: true,
      },
    })

    if (!newStage || newStage.pipeline.deletedAt) {
      return { success: false, error: "Stage not found" }
    }

    // Get existing deals in new stage to calculate position
    const existingDeals = await db.query.deals.findMany({
      where: and(
        eq(deals.stageId, stageId),
        isNull(deals.deletedAt)
      ),
      orderBy: [desc(deals.position)],
    })

    // Calculate position (add 10000 to max position, or start at 10000 if empty)
    const maxPosition = existingDeals[0]?.position ?? 0
    const position = (parseFloat(maxPosition) + 10000).toString()

    await db
      .update(deals)
      .set({
        stageId,
        position,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, id))

    revalidatePath("/deals")

    return { success: true }
  } catch (error) {
    console.error("Failed to update deal stage:", error)
    return { success: false, error: "Failed to update deal stage" }
  }
}

/**
 * Reorder deals with drag-drop support using gap-based positioning
 * - Validates user is authenticated
 * - Handles move within same stage or to different stage
 * - Uses gap-based positioning (averages neighbors)
 * - Returns success or error
 */
export async function reorderDeals(
  dealId: string,
  targetStageId: string,
  targetIndex: number
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    // Get the deal being moved
    const deal = await db.query.deals.findFirst({
      where: and(
        eq(deals.id, dealId),
        isNull(deals.deletedAt)
      ),
    })

    if (!deal) {
      return { success: false, error: "Deal not found" }
    }

    if (deal.ownerId !== session.user.id) {
      return { success: false, error: "Not authorized" }
    }

    // Validate target stage exists
    const targetStage = await db.query.stages.findFirst({
      where: eq(stages.id, targetStageId),
      with: {
        pipeline: true,
      },
    })

    if (!targetStage || targetStage.pipeline.deletedAt) {
      return { success: false, error: "Stage not found" }
    }

    // Fetch all deals in target stage, ordered by position
    const allDealsInStage = await db.query.deals.findMany({
      where: and(
        eq(deals.stageId, targetStageId),
        isNull(deals.deletedAt)
      ),
      orderBy: [sql`${deals.position} ASC`],
    })

    // If moving to same stage, filter out the deal being moved
    let targetDeals = allDealsInStage
    if (deal.stageId === targetStageId) {
      targetDeals = allDealsInStage.filter(d => d.id !== dealId)
    }

    // Clamp targetIndex to valid range
    const clampedIndex = Math.max(0, Math.min(targetIndex, targetDeals.length))

    // Calculate new position using gap-based approach
    let newPosition: string

    if (targetDeals.length === 0) {
      // No other deals in stage, use default position
      newPosition = '10000'
    } else if (clampedIndex === 0) {
      // Moving to first position: halve the first deal's position
      const firstPos = parseFloat(targetDeals[0].position)
      newPosition = (firstPos / 2).toString()
    } else if (clampedIndex >= targetDeals.length) {
      // Moving to last position: add 10000 to last deal's position
      const lastPos = parseFloat(targetDeals[targetDeals.length - 1].position)
      newPosition = (lastPos + 10000).toString()
    } else {
      // Moving somewhere in between: average neighbors
      const prevPos = parseFloat(targetDeals[clampedIndex - 1].position)
      const nextPos = parseFloat(targetDeals[clampedIndex].position)
      newPosition = ((prevPos + nextPos) / 2).toString()
    }

    // Update the deal with new position and potentially new stage
    await db
      .update(deals)
      .set({
        stageId: targetStageId,
        position: newPosition,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, dealId))

    revalidatePath("/deals")

    return { success: true }
  } catch (error) {
    console.error("Failed to reorder deals:", error)
    return { success: false, error: "Failed to reorder deals" }
  }
}
