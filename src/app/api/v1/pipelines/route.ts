import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { parsePagination } from "@/lib/api/pagination"
import { parseExpand } from "@/lib/api/expand"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { serializePipeline, serializeStage } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { pipelines } from "@/db/schema"
import { eq, and, isNull, desc, sql } from "drizzle-orm"
import { z } from "zod"

const createPipelineSchema = z.object({
  name: z.string().min(1, "Name is required"),
  is_default: z.boolean().optional(),
})

// GET /api/v1/pipelines - List pipelines with pagination
export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { offset, limit } = parsePagination(req)
    const expand = parseExpand(req)

    // Query pipelines owned by the user
    const conditions = [eq(pipelines.ownerId, ctx.userId), isNull(pipelines.deletedAt)]

    // Build with options based on expand
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let withOptions: any = undefined
    if (expand.size > 0) {
      withOptions = {}
      if (expand.has("owner")) withOptions.owner = true
      if (expand.has("stages")) withOptions.stages = true
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [pipelineList, countResult] = await Promise.all([
      db.query.pipelines.findMany({
        where: and(...conditions),
        orderBy: [desc(pipelines.isDefault), desc(pipelines.createdAt)],
        offset,
        limit,
        with: withOptions,
      }) as Promise<any[]>,
      db.select({ count: sql<number>`count(*)` })
        .from(pipelines)
        .where(and(...conditions))
        .then(rows => rows[0]?.count ?? 0),
    ])

    // Serialize with expand
    const data = pipelineList.map(pipeline => {
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
      
      return serialized
    })

    return paginatedResponse(data, Number(countResult), offset, limit)
  })
}

// POST /api/v1/pipelines - Create a new pipeline
export async function POST(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return Problems.validation([{ field: "body", code: "invalid_json", message: "Invalid JSON body" }])
    }

    const parsed = createPipelineSchema.safeParse(body)
    if (!parsed.success) {
      return Problems.validation(
        parsed.error.issues.map(issue => ({
          field: issue.path.join(".") || "body",
          code: issue.code,
          message: issue.message,
        }))
      )
    }

    const { name, is_default } = parsed.data
    const now = new Date()

    // If setting as default, unset any existing default first
    if (is_default) {
      await db.update(pipelines)
        .set({ isDefault: 0 })
        .where(and(eq(pipelines.ownerId, ctx.userId), eq(pipelines.isDefault, 1)))
    }

    const [pipeline] = await db.insert(pipelines).values({
      name,
      isDefault: is_default ? 1 : 0,
      ownerId: ctx.userId,
      createdAt: now,
      updatedAt: now,
    }).returning()

    // Trigger webhook
    triggerWebhook(ctx.userId, "pipeline.created", "pipeline", pipeline.id, "created", serializePipeline(pipeline))

    return createdResponse(serializePipeline(pipeline))
  })
}
