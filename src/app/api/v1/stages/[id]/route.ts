import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { parseExpand } from "@/lib/api/expand"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { serializeStage, serializePipeline } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { stages, pipelines } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { z } from "zod"

const updateStageSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  type: z.enum(["open", "won", "lost"]).optional(),
  description: z.string().nullable().optional(),
  position: z.number().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

// Helper to verify stage ownership through pipeline
async function verifyStageOwnership(stageId: string, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stage = await db.query.stages.findFirst({
    where: eq(stages.id, stageId),
    with: { pipeline: true } as any,
  }) as any

  if (!stage) {
    return { stage: null, owned: false }
  }

  if (!stage.pipeline || stage.pipeline.ownerId !== userId || stage.pipeline.deletedAt) {
    return { stage, owned: false }
  }

  return { stage, owned: true }
}

// GET /api/v1/stages/:id - Get a single stage
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params
    const expand = parseExpand(req)

    // Build with options based on expand
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let withOptions: any = undefined
    if (expand.has("pipeline")) {
      withOptions = { pipeline: true }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stage = await db.query.stages.findFirst({
      where: eq(stages.id, id),
      with: withOptions,
    }) as any

    if (!stage) {
      return Problems.notFound("Stage")
    }

    // Verify ownership through pipeline
    if (!stage.pipeline || stage.pipeline.ownerId !== ctx.userId || stage.pipeline.deletedAt) {
      return Problems.forbidden()
    }

    const serialized: Record<string, unknown> = serializeStage(stage)
    
    if (expand.has("pipeline") && stage.pipeline) {
      serialized.pipeline = serializePipeline(stage.pipeline as Parameters<typeof serializePipeline>[0])
    }

    return singleResponse(serialized)
  })
}

// PUT /api/v1/stages/:id - Update a stage
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params

    const { stage: existingStage, owned } = await verifyStageOwnership(id, ctx.userId)

    if (!existingStage) {
      return Problems.notFound("Stage")
    }

    if (!owned) {
      return Problems.forbidden()
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return Problems.validation([{ field: "body", code: "invalid_json", message: "Invalid JSON body" }])
    }

    const parsed = updateStageSchema.safeParse(body)
    if (!parsed.success) {
      return Problems.validation(
        parsed.error.issues.map(issue => ({
          field: issue.path.join(".") || "body",
          code: issue.code,
          message: issue.message,
        }))
      )
    }

    const updates = parsed.data
    const now = new Date()

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: now,
    }

    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.color !== undefined) updateData.color = updates.color
    if (updates.type !== undefined) updateData.type = updates.type
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.position !== undefined) updateData.position = updates.position

    const [updatedStage] = await db.update(stages)
      .set(updateData)
      .where(eq(stages.id, id))
      .returning()

    // Trigger webhook
    triggerWebhook(ctx.userId, "stage.updated", "stage", updatedStage.id, "updated", serializeStage(updatedStage))

    return singleResponse(serializeStage(updatedStage))
  })
}

// DELETE /api/v1/stages/:id - Delete a stage (note: stages don't have soft delete)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params

    const { stage: existingStage, owned } = await verifyStageOwnership(id, ctx.userId)

    if (!existingStage) {
      return Problems.notFound("Stage")
    }

    if (!owned) {
      return Problems.forbidden()
    }

    // Hard delete (stages don't have soft delete in the schema)
    await db.delete(stages).where(eq(stages.id, id))

    // Trigger webhook
    triggerWebhook(ctx.userId, "stage.deleted", "stage", id, "deleted", { id })

    return noContentResponse()
  })
}
