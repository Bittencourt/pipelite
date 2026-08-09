import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { createdResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { getWorkflow } from "@/lib/mutations/workflows"
import { triggerManualRun } from "@/lib/triggers/manual-trigger"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * REST API trigger endpoint.
 * Requires API key authentication via Bearer token.
 *
 * POST /api/v1/workflows/{id}/run
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params

    // Look up workflow, scoped to the authed user so a non-owner can't run
    // (or probe the existence of) another user's workflow.
    const workflow = await getWorkflow(id, context.userId)
    if (!workflow) {
      return Problems.notFound("Workflow")
    }

    // Inactive workflows cannot be run via the REST trigger, consistent with
    // every other trigger path (webhook, schedule, CRM events).
    if (!workflow.active) {
      return Problems.conflict(
        "Workflow is not active. Activate the workflow before triggering a run."
      )
    }

    // Parse optional body for trigger data
    let body: Record<string, unknown> = {}
    try {
      const text = await req.text()
      if (text) {
        body = JSON.parse(text)
      }
    } catch {
      return Problems.validation([
        { field: "body", code: "invalid_json", message: "Invalid JSON body" },
      ])
    }

    // Trigger manual run
    const result = await triggerManualRun({
      workflowId: id,
      userId: context.userId,
      entityType: body.entityType as string | undefined,
      entityId: body.entityId as string | undefined,
      entityData: body.data as Record<string, unknown> | undefined,
    })

    if (!result.success) {
      // Covers the race where the workflow was deactivated between the check
      // above and the trigger call.
      if (result.code === "workflow_inactive") {
        return Problems.conflict(
          "Workflow is not active. Activate the workflow before triggering a run."
        )
      }
      return Problems.notFound("Workflow")
    }

    return createdResponse({ run_id: result.runId, status: "pending" })
  })
}
