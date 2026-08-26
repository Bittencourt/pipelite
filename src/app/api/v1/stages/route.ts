import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { parsePagination } from "@/lib/api/pagination"
import { parseExpand } from "@/lib/api/expand"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { serializeStage, serializePipeline } from "@/lib/api/serialize"

import { db } from "@/db"
import { stages, pipelines } from "@/db/schema"
import { ownedStagesPredicate } from "@/lib/api/stage-scope"
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

    // The page. PAGINATION IS APPLIED AFTER THE OWNERSHIP PREDICATE, and that order is the fix.
    //
    // The previous shape paginated a GLOBAL `stages` page and then enforced ownership in
    // JavaScript, which broke twice over. It denied legitimate owners — measured, `?limit=5`
    // returned `data: []` with `meta.total: 1` for the stage's own owner, because the page was
    // scoped by nothing while the total below was scoped correctly. And to run that post-filter it
    // built a JavaScript array of the page's pipeline ids and interpolated that array into a raw
    // SQL membership fragment; `parsePagination` puts no ceiling on `offset`, so any offset past
    // the end of the table emptied the page, emptied the array, emitted an empty membership list
    // and returned a 500 (`42601`) to any caller who asked for it. The full autopsy, with the
    // fragment quoted, is in the header of `src/lib/api/stage-scope.ts` — it is deliberately not
    // re-quoted inside this route file.
    //
    // Scoping in the JOIN removes both: no foreign row is read at all, and no runtime-sized list
    // is rendered into the statement.
    const rows = await db
      .select({ stage: stages, pipeline: pipelines })
      .from(stages)
      .innerJoin(pipelines, eq(stages.pipelineId, pipelines.id))
      .where(ownedStagesPredicate(ctx.userId, pipelineId))
      // WR-02: `stages.id` is a TIEBREAKER, not decoration. `position` is unique only WITHIN a
      // pipeline — `POST /api/v1/stages` below assigns 1000 to the first stage of every pipeline and
      // `max + 1000` thereafter — so every pipeline a caller owns contributes a stage at 1000, one
      // at 2000, and so on. `LIMIT`/`OFFSET` over a sort with ties is UNSPECIFIED in PostgreSQL: the
      // same row may appear on two pages and another on none, while `meta.total` reports the true
      // count in both responses. A client paging until it has `total` rows then either loops forever
      // or stops with a set that is missing a stage. Under the default `limit=50` this was invisible
      // for small accounts, which is how it survived. The primary key makes the order TOTAL.
      .orderBy(asc(stages.position), asc(stages.id))
      .offset(offset)
      .limit(limit)

    // The total, over the SAME join and the SAME predicate expression — so a total that does not
    // bound its own page is now structurally impossible rather than merely unintended.
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(stages)
      .innerJoin(pipelines, eq(stages.pipelineId, pipelines.id))
      .where(ownedStagesPredicate(ctx.userId, pipelineId))
      .then(rows => rows[0]?.count ?? 0)

    // Serialize with expand. The pipeline row is now ALWAYS joined, so this `expand` gate is the
    // only thing keeping it out of a bare response — it is retained deliberately.
    const data = rows.map(row => {
      const serialized: Record<string, unknown> = serializeStage(row.stage)

      if (expand.has("pipeline") && row.pipeline) {
        serialized.pipeline = serializePipeline(row.pipeline)
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

    return createdResponse(serializeStage(stage))
  })
}
