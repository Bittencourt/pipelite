import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { parseExpand } from "@/lib/api/expand"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { serializePipeline, serializeStage } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { pipelines } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { z } from "zod"

const updatePipelineSchema = z.object({
  name: z.string().min(1).optional(),
  is_default: z.boolean().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/v1/pipelines/:id - Get a single pipeline
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params
    const expand = parseExpand(req)

    // Build with options based on expand
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let withOptions: any = undefined
    if (expand.size > 0) {
      withOptions = {}
      if (expand.has("owner")) withOptions.owner = true
      if (expand.has("stages")) withOptions.stages = true
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline = await db.query.pipelines.findFirst({
      where: and(eq(pipelines.id, id), isNull(pipelines.deletedAt)),
      with: withOptions,
    }) as any

    if (!pipeline) {
      return Problems.notFound("Pipeline")
    }

    // Verify ownership
    if (pipeline.ownerId !== ctx.userId) {
      return Problems.forbidden()
    }

    const serialized: Record<string, unknown> = serializePipeline(pipeline)
    
    if (expand.has("owner") && pipeline.owner) {
      serialized.owner = {
        id: pipeline.owner.id,
        name: pipeline.owner.name,
        email: pipeline.owner.email,
      }
    }
    
    if (expand.has("stages") && pipeline.stages) {
      serialized.stages = pipeline.stages.map(serializeStage)
    }

    return singleResponse(serialized)
  })
}

// PUT /api/v1/pipelines/:id - Update a pipeline
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params

    // Fetch existing pipeline
    const existingPipeline = await db.query.pipelines.findFirst({
      where: and(eq(pipelines.id, id), isNull(pipelines.deletedAt)),
    })

    if (!existingPipeline) {
      return Problems.notFound("Pipeline")
    }

    // Verify ownership
    if (existingPipeline.ownerId !== ctx.userId) {
      return Problems.forbidden()
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return Problems.validation([{ field: "body", code: "invalid_json", message: "Invalid JSON body" }])
    }

    const parsed = updatePipelineSchema.safeParse(body)
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
    
    // Handle is_default specially
    if (updates.is_default !== undefined) {
      if (updates.is_default) {
        // Unset any existing default first
        await db.update(pipelines)
          .set({ isDefault: 0 })
          .where(and(eq(pipelines.ownerId, ctx.userId), eq(pipelines.isDefault, 1)))
      }
      updateData.isDefault = updates.is_default ? 1 : 0
    }

    const [updatedPipeline] = await db.update(pipelines)
      .set(updateData)
      .where(eq(pipelines.id, id))
      .returning()

    // Trigger webhook
    triggerWebhook(ctx.userId, "pipeline.updated", "pipeline", updatedPipeline.id, "updated", serializePipeline(updatedPipeline))

    return singleResponse(serializePipeline(updatedPipeline))
  })
}

// DELETE /api/v1/pipelines/:id - Soft delete a pipeline
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params

    // Fetch existing pipeline
    const existingPipeline = await db.query.pipelines.findFirst({
      where: and(eq(pipelines.id, id), isNull(pipelines.deletedAt)),
    })

    if (!existingPipeline) {
      return Problems.notFound("Pipeline")
    }

    // Verify ownership
    if (existingPipeline.ownerId !== ctx.userId) {
      return Problems.forbidden()
    }

    // Soft delete
    await db.update(pipelines)
      .set({ deletedAt: new Date() })
      .where(eq(pipelines.id, id))

    // Trigger webhook
    triggerWebhook(ctx.userId, "pipeline.deleted", "pipeline", id, "deleted", { id })

    return noContentResponse()
  })
}
