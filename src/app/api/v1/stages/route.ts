import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { parsePagination } from "@/lib/api/pagination"
import { parseExpand } from "@/lib/api/expand"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { serializeStage, serializePipeline } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { stages, pipelines } from "@/db/schema"
import { eq, and, isNull, asc, sql } from "drizzle-orm"
import { z } from "zod"

const createStageSchema = z.object({
  name: z.string().min(1, "Name is required"),
  pipeline_id: z.string().min(1, "Pipeline ID is required"),
  color: z.string().optional(),
  type: z.enum(["open", "won", "lost"]).optional(),
  description: z.string().optional().nullable(),
})

// GET /api/v1/stages - List stages with pagination and filters
export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { offset, limit } = parsePagination(req)
    const expand = parseExpand(req)
    const searchParams = req.nextUrl.searchParams

    // Filter by pipeline_id
    const pipelineId = searchParams.get("pipeline_id")

    // First, verify pipeline ownership if filtering by pipeline_id
    if (pipelineId) {
      const pipeline = await db.query.pipelines.findFirst({
        where: and(eq(pipelines.id, pipelineId), eq(pipelines.ownerId, ctx.userId), isNull(pipelines.deletedAt)),
      })
      if (!pipeline) {
        return Problems.notFound("Pipeline")
      }
    }

    // Build conditions for stages
    const stageConditions = pipelineId ? [eq(stages.pipelineId, pipelineId)] : []

    // Build with options based on expand
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let withOptions: any = undefined
    if (expand.has("pipeline")) {
      withOptions = { pipeline: true }
    }

    // Query stages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stageList = await db.query.stages.findMany({
      where: stageConditions.length > 0 ? and(...stageConditions) : undefined,
      orderBy: [asc(stages.position)],
      offset,
      limit,
      with: withOptions,
    }) as any[]

    // Filter to only stages from user's pipelines (when no specific pipeline filter)
    let userStages = stageList
    if (!pipelineId) {
      const pipelineIds = [...new Set(stageList.map(s => s.pipelineId))]
      const userPipelines = await db.query.pipelines.findMany({
        where: and(
          sql`${pipelines.id} IN ${pipelineIds}`,
          eq(pipelines.ownerId, ctx.userId),
          isNull(pipelines.deletedAt)
        ),
        columns: { id: true },
      })
      const userPipelineIds = new Set(userPipelines.map(p => p.id))
      userStages = stageList.filter(s => userPipelineIds.has(s.pipelineId))
    }

    // Get total count for user's stages
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(stages)
      .innerJoin(pipelines, eq(stages.pipelineId, pipelines.id))
      .where(and(
        eq(pipelines.ownerId, ctx.userId),
        isNull(pipelines.deletedAt),
        ...(pipelineId ? [eq(stages.pipelineId, pipelineId)] : [])
      ))
      .then(rows => rows[0]?.count ?? 0)

    // Serialize with expand
    const data = userStages.map(stage => {
      const serialized: Record<string, unknown> = serializeStage(stage)
      
      if (expand.has("pipeline") && stage.pipeline) {
        serialized.pipeline = serializePipeline(stage.pipeline as Parameters<typeof serializePipeline>[0])
      }
      
      return serialized
    })

    return paginatedResponse(data, Number(countResult), offset, limit)
  })
}

// POST /api/v1/stages - Create a new stage
export async function POST(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return Problems.validation([{ field: "body", code: "invalid_json", message: "Invalid JSON body" }])
    }

    const parsed = createStageSchema.safeParse(body)
    if (!parsed.success) {
      return Problems.validation(
        parsed.error.issues.map(issue => ({
          field: issue.path.join(".") || "body",
          code: issue.code,
          message: issue.message,
        }))
      )
    }

    const { name, pipeline_id, color, type, description } = parsed.data

    // Verify pipeline exists and user owns it
    const pipeline = await db.query.pipelines.findFirst({
      where: and(eq(pipelines.id, pipeline_id), eq(pipelines.ownerId, ctx.userId), isNull(pipelines.deletedAt)),
    })
    if (!pipeline) {
      return Problems.validation([{ field: "pipeline_id", code: "not_found", message: "Pipeline not found or access denied" }])
    }

    // Get max position for ordering
    const existingStages = await db.query.stages.findMany({
      where: eq(stages.pipelineId, pipeline_id),
    })
    const maxPosition = existingStages.length > 0
      ? Math.max(...existingStages.map(s => s.position)) + 1000
      : 1000

    const now = new Date()
    const [stage] = await db.insert(stages).values({
      name,
      pipelineId: pipeline_id,
      color: color || "blue",
      type: type || "open",
      description: description || null,
      position: maxPosition,
      createdAt: now,
      updatedAt: now,
    }).returning()

    // Trigger webhook
    triggerWebhook(ctx.userId, "stage.created", "stage", stage.id, "created", serializeStage(stage))

    return createdResponse(serializeStage(stage))
  })
}
