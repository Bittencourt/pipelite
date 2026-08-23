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

/**
 * Opt back IN to test runs: `?dry_run=true`. Snake_case because that is this API's parameter
 * convention (`stage_id`, `entity_type`, `workflow_run_id`), not the UI list's camelCase `dryRun=1`.
 */
const DRY_RUN_PARAM = "dry_run"
const DRY_RUN_PARAM_VALUE = "true"

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req) => {
    const { id } = await params
    const { offset, limit } = parsePagination(req)
    const status = req.nextUrl.searchParams.get("status")
    const showDryRuns = req.nextUrl.searchParams.get(DRY_RUN_PARAM) === DRY_RUN_PARAM_VALUE

    // Verify workflow exists
    const workflow = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.id, id))
      .limit(1)

    if (workflow.length === 0) {
      return Problems.notFound("Workflow")
    }

    // Build where clause with optional status filter.
    //
    // TEST RUNS ARE HIDDEN BY DEFAULT (WR-02), the same posture as the UI list and
    // `recent-runs-mini.tsx`. A machine consumer cannot be asked to know that a new kind of run
    // exists: a monitoring integration polling `?status=failed` would count every failed test run
    // as a production failure. This is back-compatible for every run that predates the column,
    // because `dry_run` is `NOT NULL DEFAULT false` — the pre-phase corpus is entirely real runs.
    const conditions = [eq(workflowRuns.workflowId, id)]
    if (status) conditions.push(eq(workflowRuns.status, status as WorkflowStatus))
    if (!showDryRuns) conditions.push(eq(workflowRuns.dryRun, false))
    const where = and(...conditions)

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
