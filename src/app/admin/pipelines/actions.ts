"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { pipelines, stages } from "@/db/schema"
import { eq, and, isNull, sql, desc } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { STAGE_COLORS, getNextColor, type StageColor } from "@/lib/stage-colors"

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

// Stage type
type StageType = 'open' | 'won' | 'lost'

// Stage validation schemas
const createStageSchema = z.object({
  pipelineId: z.string().min(1, "Pipeline is required"),
  name: z.string().min(1, "Name is required").max(50, "Name must be 50 characters or less"),
  description: z.string().max(200, "Description must be 200 characters or less").optional(),
  color: z.enum(Object.keys(STAGE_COLORS) as [StageColor, ...StageColor[]]).optional(),
  type: z.enum(['open', 'won', 'lost']).default('open'),
})

const updateStageSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name must be 50 characters or less").optional(),
  description: z.string().max(200, "Description must be 200 characters or less").optional().or(z.literal("")),
  color: z.enum(Object.keys(STAGE_COLORS) as [StageColor, ...StageColor[]]).optional(),
  type: z.enum(['open', 'won', 'lost']).optional(),
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

// ============================================================================
// Stage CRUD Actions
// ============================================================================

/**
 * Create a new stage
 * - Validates user is authenticated AND is admin
 * - Validates won/lost uniqueness (only one per pipeline)
 * - Auto-assigns color using getNextColor if not provided
 * - Calculates position at end of pipeline
 * - Returns success with stage ID or error
 */
export async function createStage(
  data: z.infer<typeof createStageSchema>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()

  // Verify admin role
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  // Validate input
  const validated = createStageSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  try {
    // Check pipeline exists and is not deleted
    const pipeline = await db.query.pipelines.findFirst({
      where: and(
        eq(pipelines.id, validated.data.pipelineId),
        isNull(pipelines.deletedAt)
      ),
    })

    if (!pipeline) {
      return { success: false, error: "Pipeline not found" }
    }

    // Check stage name uniqueness within pipeline
    const existingStage = await db.query.stages.findFirst({
      where: and(
        eq(stages.pipelineId, validated.data.pipelineId),
        eq(stages.name, validated.data.name)
      ),
    })

    if (existingStage) {
      return { success: false, error: "Stage name must be unique within pipeline" }
    }

    // If type is won or lost, check no other stage of same type exists
    if (validated.data.type === 'won' || validated.data.type === 'lost') {
      const existingTypeStage = await db.query.stages.findFirst({
        where: and(
          eq(stages.pipelineId, validated.data.pipelineId),
          eq(stages.type, validated.data.type)
        ),
      })

      if (existingTypeStage) {
        return { success: false, error: `A ${validated.data.type} stage already exists in this pipeline` }
      }
    }

    // Get existing stages to calculate position and color
    const existingStages = await db.query.stages.findMany({
      where: eq(stages.pipelineId, validated.data.pipelineId),
      orderBy: [desc(stages.position)],
    })

    // Calculate position (add 10 to max position, or start at 10 if empty)
    const maxPosition = existingStages[0]?.position ?? 0
    const position = maxPosition + 10

    // Auto-assign color if not provided
    const existingColors = existingStages
      .map(s => s.color as StageColor)
      .filter((c): c is StageColor => c in STAGE_COLORS)
    const color = validated.data.color || getNextColor(existingColors)

    const [stage] = await db.insert(stages).values({
      pipelineId: validated.data.pipelineId,
      name: validated.data.name,
      description: validated.data.description || null,
      color,
      type: validated.data.type as StageType,
      position,
    }).returning()

    revalidatePath(`/admin/pipelines/${validated.data.pipelineId}`)

    return { success: true, id: stage.id }
  } catch (error) {
    console.error("Failed to create stage:", error)
    return { success: false, error: "Failed to create stage" }
  }
}

/**
 * Update an existing stage
 * - Validates user is authenticated AND is admin
 * - Validates name uniqueness within pipeline if changing name
 * - Validates won/lost uniqueness if changing type
 * - Returns success or error
 */
export async function updateStage(
  id: string,
  data: z.infer<typeof updateStageSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify admin role
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  // Validate input
  const validated = updateStageSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  try {
    // Check stage exists and pipeline is not deleted
    const stage = await db.query.stages.findFirst({
      where: eq(stages.id, id),
      with: {
        pipeline: true,
      },
    })

    if (!stage || stage.pipeline.deletedAt) {
      return { success: false, error: "Stage not found" }
    }

    // If changing name, check uniqueness within pipeline
    if (validated.data.name && validated.data.name !== stage.name) {
      const existingStage = await db.query.stages.findFirst({
        where: and(
          eq(stages.pipelineId, stage.pipelineId),
          eq(stages.name, validated.data.name)
        ),
      })

      if (existingStage) {
        return { success: false, error: "Stage name must be unique within pipeline" }
      }
    }

    // If changing type to won or lost, verify no other stage has that type
    if ((validated.data.type === 'won' || validated.data.type === 'lost') && 
        validated.data.type !== stage.type) {
      const existingTypeStage = await db.query.stages.findFirst({
        where: and(
          eq(stages.pipelineId, stage.pipelineId),
          eq(stages.type, validated.data.type),
          sql`${stages.id} != ${id}`
        ),
      })

      if (existingTypeStage) {
        return { success: false, error: `A ${validated.data.type} stage already exists in this pipeline` }
      }
    }

    // Build update object, converting empty strings to null for optional fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (validated.data.name !== undefined) {
      updateData.name = validated.data.name
    }
    if (validated.data.description !== undefined) {
      updateData.description = validated.data.description || null
    }
    if (validated.data.color !== undefined) {
      updateData.color = validated.data.color
    }
    if (validated.data.type !== undefined) {
      updateData.type = validated.data.type
    }

    await db.update(stages).set(updateData).where(eq(stages.id, id))

    revalidatePath(`/admin/pipelines/${stage.pipelineId}`)

    return { success: true }
  } catch (error) {
    console.error("Failed to update stage:", error)
    return { success: false, error: "Failed to update stage" }
  }
}

/**
 * Delete a stage
 * - Validates user is authenticated AND is admin
 * - TODO: Check for existing deals before deletion (Phase 5)
 * - Hard deletes the stage
 * - Returns success or error
 */
export async function deleteStage(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify admin role
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  try {
    // Check stage exists
    const stage = await db.query.stages.findFirst({
      where: eq(stages.id, id),
    })

    if (!stage) {
      return { success: false, error: "Stage not found" }
    }

    // TODO: Check for existing deals in Phase 5
    // const deals = await db.query.deals.findMany({
    //   where: eq(deals.stageId, id),
    // })
    // if (deals.length > 0) {
    //   return { success: false, error: "Cannot delete stage with existing deals. Reassign deals first." }
    // }

    // Hard delete the stage
    await db.delete(stages).where(eq(stages.id, id))

    revalidatePath(`/admin/pipelines/${stage.pipelineId}`)

    return { success: true }
  } catch (error) {
    console.error("Failed to delete stage:", error)
    return { success: false, error: "Failed to delete stage" }
  }
}
