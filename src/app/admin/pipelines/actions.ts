"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { pipelines, stages } from "@/db/schema"
import { eq, and, isNull, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

// Default stages for new pipelines
const DEFAULT_STAGES = [
  { name: 'Lead', color: 'slate', type: 'open' as const },
  { name: 'Qualified', color: 'blue', type: 'open' as const },
  { name: 'Proposal', color: 'amber', type: 'open' as const },
  { name: 'Negotiation', color: 'emerald', type: 'open' as const },
  { name: 'Won', color: 'emerald', type: 'won' as const },
  { name: 'Lost', color: 'rose', type: 'lost' as const },
]

// Validation schemas
const createPipelineSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
})

const updatePipelineSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less").optional(),
})

/**
 * Create a new pipeline with default stages
 * - Validates user is authenticated AND is admin
 * - Creates pipeline with default stages in a transaction
 * - Returns success with pipeline ID or error
 */
export async function createPipeline(
  data: z.infer<typeof createPipelineSchema>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()

  // Verify admin role
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  // Validate input
  const validated = createPipelineSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  try {
    // Use transaction to create pipeline and default stages atomically
    const result = await db.transaction(async (tx) => {
      // Create the pipeline
      const [pipeline] = await tx.insert(pipelines).values({
        name: validated.data.name,
        ownerId: session.user.id,
        isDefault: 0,
      }).returning()

      // Create default stages with positions 10, 20, 30, 40, 50, 60
      await tx.insert(stages).values(
        DEFAULT_STAGES.map((stage, index) => ({
          pipelineId: pipeline.id,
          name: stage.name,
          color: stage.color,
          type: stage.type,
          position: (index + 1) * 10,
        }))
      )

      return pipeline
    })

    revalidatePath("/admin/pipelines")

    return { success: true, id: result.id }
  } catch (error) {
    console.error("Failed to create pipeline:", error)
    return { success: false, error: "Failed to create pipeline" }
  }
}

/**
 * Update an existing pipeline
 * - Validates user is authenticated AND is admin
 * - Updates pipeline name
 * - Returns success or error
 */
export async function updatePipeline(
  id: string,
  data: z.infer<typeof updatePipelineSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify admin role
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  // Validate input
  const validated = updatePipelineSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Check if pipeline exists and is not soft-deleted
  const pipeline = await db.query.pipelines.findFirst({
    where: and(
      eq(pipelines.id, id),
      isNull(pipelines.deletedAt)
    ),
  })

  if (!pipeline) {
    return { success: false, error: "Pipeline not found" }
  }

  try {
    await db
      .update(pipelines)
      .set({
        ...validated.data,
        updatedAt: new Date(),
      })
      .where(eq(pipelines.id, id))

    revalidatePath("/admin/pipelines")
    revalidatePath(`/admin/pipelines/${id}`)

    return { success: true }
  } catch (error) {
    console.error("Failed to update pipeline:", error)
    return { success: false, error: "Failed to update pipeline" }
  }
}

/**
 * Delete a pipeline (soft delete)
 * - Validates user is authenticated AND is admin
 * - Sets deletedAt timestamp (soft delete)
 * - Returns success or error
 */
export async function deletePipeline(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify admin role
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  // Check if pipeline exists and is not already deleted
  const pipeline = await db.query.pipelines.findFirst({
    where: and(
      eq(pipelines.id, id),
      isNull(pipelines.deletedAt)
    ),
  })

  if (!pipeline) {
    return { success: false, error: "Pipeline not found" }
  }

  try {
    // Soft delete - set deletedAt timestamp
    await db
      .update(pipelines)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pipelines.id, id))

    revalidatePath("/admin/pipelines")

    return { success: true }
  } catch (error) {
    console.error("Failed to delete pipeline:", error)
    return { success: false, error: "Failed to delete pipeline" }
  }
}

/**
 * Set a pipeline as the default
 * - Validates user is authenticated AND is admin
 * - Unsets isDefault on all pipelines, then sets on target
 * - Returns success or error
 */
export async function setDefaultPipeline(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify admin role
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  // Check if pipeline exists and is not deleted
  const pipeline = await db.query.pipelines.findFirst({
    where: and(
      eq(pipelines.id, id),
      isNull(pipelines.deletedAt)
    ),
  })

  if (!pipeline) {
    return { success: false, error: "Pipeline not found" }
  }

  try {
    // Use transaction to ensure atomicity
    await db.transaction(async (tx) => {
      // Unset isDefault on all pipelines
      await tx.update(pipelines).set({ isDefault: 0 })
      
      // Set isDefault on target pipeline
      await tx
        .update(pipelines)
        .set({ 
          isDefault: 1,
          updatedAt: new Date(),
        })
        .where(eq(pipelines.id, id))
    })

    revalidatePath("/admin/pipelines")

    return { success: true }
  } catch (error) {
    console.error("Failed to set default pipeline:", error)
    return { success: false, error: "Failed to set default pipeline" }
  }
}
