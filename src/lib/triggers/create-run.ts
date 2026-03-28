import { db } from "@/db"
import { workflowRuns } from "@/db/schema/workflows"
import type { WorkflowRun } from "@/db/schema/workflows"
import type { TriggerEnvelope } from "./types"

/**
 * Create a new workflow run with "pending" status and the provided trigger envelope.
 * This is the shared entry point used by all trigger types (CRM event, schedule, webhook, manual).
 */
export async function createWorkflowRun(
  workflowId: string,
  triggerEnvelope: TriggerEnvelope
): Promise<WorkflowRun> {
  const [run] = await db
    .insert(workflowRuns)
    .values({
      workflowId,
      status: "pending",
      triggerData: triggerEnvelope as unknown as Record<string, unknown>,
    })
    .returning()

  return run
}
