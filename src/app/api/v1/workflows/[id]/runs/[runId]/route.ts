import { NextRequest } from "next/server"
import { withApiAuth } from "@/lib/api/auth"
import { singleResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeRun, serializeRunStep } from "@/lib/api/serialize"
import { db } from "@/db"
import { workflowRuns, workflowRunSteps } from "@/db/schema/workflows"
import { eq, and } from "drizzle-orm"

interface RouteParams {
  params: Promise<{ id: string; runId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async () => {
    const { id, runId } = await params

    // Query run (validates both workflowId and runId)
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
