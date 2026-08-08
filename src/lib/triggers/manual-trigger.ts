import { db } from "@/db"
import { workflows } from "@/db/schema/workflows"
import { eq } from "drizzle-orm"
import { createWorkflowRun } from "./create-run"
import type { TriggerEnvelope } from "./types"

interface TriggerManualRunParams {
  workflowId: string
  userId: string
  entityType?: string
  entityId?: string
  entityData?: Record<string, unknown>
}

type TriggerManualRunResult =
  | { success: true; runId: string }
  | { success: false; error: string; code?: "workflow_inactive" }

/**
 * Trigger a manual workflow run.
 * Creates a workflow run with trigger_type "manual" and optional entity data.
 * Inactive workflows are rejected, matching every other trigger path
 * (webhook 404s inactive, schedule and CRM matcher only consider active).
 */
export async function triggerManualRun(
  params: TriggerManualRunParams
): Promise<TriggerManualRunResult> {
  const { workflowId, userId, entityType, entityId, entityData } = params

  const workflow = await db.query.workflows.findFirst({
    where: eq(workflows.id, workflowId),
  })

  if (!workflow) {
    return { success: false, error: "Workflow not found" }
  }

  if (!workflow.active) {
    return {
      success: false,
      error: "Workflow is not active",
      code: "workflow_inactive",
    }
  }

  const envelope: TriggerEnvelope = {
    trigger_type: "manual",
    trigger_id: "manual",
    timestamp: new Date().toISOString(),
    data: {
      triggeredBy: userId,
      ...(entityType && { entity: entityType }),
      ...(entityId && { entityId }),
      ...(entityData && { record: entityData }),
    },
  }

  const run = await createWorkflowRun(workflowId, envelope)

  return { success: true, runId: run.id }
}
