import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { singleResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeRun, serializeRunStep } from "@/lib/api/serialize"
import { getWorkflow } from "@/lib/mutations/workflows"
import { db } from "@/db"
import { workflowRuns, workflowRunSteps } from "@/db/schema/workflows"
import { eq, and } from "drizzle-orm"

interface RouteParams {
  params: Promise<{ id: string; runId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id, runId } = await params

    // SEC-48-A. The callback used to be written `async () => …` — no `context` parameter at all —
    // so the caller's identity was not even IN SCOPE in the function that returned the row, and
    // any valid API key could read any run of any workflow. `serializeRun` returns
    // `trigger_data` verbatim and `serializeRunStep` does the same for a step's `input` and
    // `output`, so this served another owner's CRM row AND whatever their automation recorded
    // about it. It is the READ half of CR-05 — see DEF-48-07 / SEC-48-E.
    //
    // The ownership decision is the sibling routes' one: `getWorkflow(id, context.userId)` then
    // `Problems.notFound("Workflow")` (`workflows/[id]/route.ts:29,:68,:93`,
    // `workflows/[id]/run/route.ts:24`). 404 and not 403 because 403-for-real / 404-for-unknown
    // would confirm that another owner's workflow id exists; the db test asserts the two
    // responses are byte-identical.
    //
    // ORDER IS LOAD-BEARING: the workflow is resolved BEFORE the run is read, so a run belonging
    // to a workflow the caller does not own is never loaded, let alone serialized.
    const workflow = await getWorkflow(id, context.userId)

    if (!workflow) {
      return Problems.notFound("Workflow")
    }

    // Query run. The `workflowId` term is retained ALONGSIDE the ownership check above, not
    // replaced by it: it is what stops a caller reading an arbitrary run id through their OWN
    // workflow's URL. Dropping it while adding the owner check would trade one cross-owner read
    // for another, and the db test has a cell for exactly that.
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.workflowId, id)))
      .limit(1)

    if (!run) {
      return Problems.notFound("Workflow run")
    }

    // Query steps ordered by creation time (ascending)
    const steps = await db
      .select()
      .from(workflowRunSteps)
      .where(eq(workflowRunSteps.runId, runId))
      .orderBy(workflowRunSteps.createdAt)

    return singleResponse({
      ...serializeRun(run),
      steps: steps.map(serializeRunStep),
    })
  })
}
