import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parsePagination } from "@/lib/api/pagination"
import { paginatedResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeRun } from "@/lib/api/serialize"
import { getWorkflow } from "@/lib/mutations/workflows"
import { db } from "@/db"
import { workflowRuns } from "@/db/schema/workflows"
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
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params
    const { offset, limit } = parsePagination(req)
    const status = req.nextUrl.searchParams.get("status")
    const showDryRuns = req.nextUrl.searchParams.get(DRY_RUN_PARAM) === DRY_RUN_PARAM_VALUE

    // SEC-48-A. Resolve the workflow SCOPED TO THE CALLER, and answer a workflow that is not
    // theirs with 404 — the house pattern of every sibling under `workflows/`
    // (`workflows/[id]/route.ts:29,:68,:93` and `workflows/[id]/run/route.ts:24`, all
    // `getWorkflow(id, context.userId)` then `Problems.notFound("Workflow")`).
    //
    // THIS USED TO BE AN EXISTENCE CHECK ONLY — `where(eq(workflows.id, id))`, no owner term — so
    // any valid API key could list any workflow's runs. That is not a leak of run metadata:
    // `workflow_runs.trigger_data` holds the envelope of the record that triggered the run and
    // `serializeRun` returns it VERBATIM (`src/lib/api/serialize.ts:212`), so a listed run is
    // another owner's CRM row on the wire. It is the READ half of CR-05: with the trigger matcher
    // now owner-scoped an attacker's workflow no longer aggregates other owners' rows, but a
    // victim's OWN workflow's runs were still readable by anybody. See DEF-48-07 / SEC-48-E.
    //
    // 404 RATHER THAN 403, deliberately, and for two reasons. It matches the sibling workflow
    // routes, so this subsystem has one answer rather than two; and 403-for-real / 404-for-unknown
    // is an existence oracle over every workflow id in the deployment. The db test asserts the
    // foreign and the nonexistent responses are BYTE-IDENTICAL, which is what makes "does not
    // confirm the existence of another owner's workflow" a measurement rather than a claim.
    // (`pipelines/{id}` and `webhooks/{id}` answer 403; those are their siblings' convention, not
    // this one's. WR-06's soft-deleted-parent-is-404 rule does not arise here: `workflows` has no
    // `deleted_at` column and `deleteWorkflow` is a hard cascade.)
    const workflow = await getWorkflow(id, context.userId)

    if (!workflow) {
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
