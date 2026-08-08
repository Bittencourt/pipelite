import { NextRequest } from "next/server"
import { withApiAuth } from "@/lib/api/auth"
import { parsePagination } from "@/lib/api/pagination"
import { paginatedResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeRun } from "@/lib/api/serialize"
import { db } from "@/db"
import { workflowRuns, workflows } from "@/db/schema/workflows"
import type { WorkflowStatus } from "@/db/schema/workflows"
import { eq, and, desc, count } from "drizzle-orm"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req) => {
    const { id } = await params
    const { offset, limit } = parsePagination(req)
    const status = req.nextUrl.searchParams.get("status")

    // Verify workflow exists
    const workflow = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.id, id))
      .limit(1)

    if (workflow.length === 0) {
      return Problems.notFound("Workflow")
    }

    // Build where clause with optional status filter
    const where = status
      ? and(eq(workflowRuns.workflowId, id), eq(workflowRuns.status, status as WorkflowStatus))
      : eq(workflowRuns.workflowId, id)

    // Query runs and count in parallel
    const [runs, [{ total }]] = await Promise.all([
      db
        .select()
        .from(workflowRuns)
        .where(where)
        .orderBy(desc(workflowRuns.createdAt))
        .offset(offset)
        .limit(limit),
      db
        .select({ total: count() })
        .from(workflowRuns)
        .where(where),
    ])

    return paginatedResponse(runs.map(serializeRun), total, offset, limit)
  })
}
