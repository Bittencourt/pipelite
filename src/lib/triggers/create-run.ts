import { db } from "@/db"
import { workflowRuns } from "@/db/schema/workflows"
import type { WorkflowRun } from "@/db/schema/workflows"
import type { TriggerEnvelope } from "./types"
import { getCurrentExecutionDepth, MAX_RECURSION_DEPTH } from "@/lib/execution/recursion"

/**
 * Create a new workflow run with "pending" status and the provided trigger envelope.
 * This is the shared entry point used by all trigger types (CRM event, schedule, webhook, manual).
 *
 * If depth is not provided, reads the current execution depth from AsyncLocalStorage.
 * Runs at depth >= MAX_RECURSION_DEPTH are immediately created as failed to prevent infinite loops.
 */
export async function createWorkflowRun(
  workflowId: string,
  triggerEnvelope: TriggerEnvelope,
  depth?: number
): Promise<WorkflowRun> {
  const effectiveDepth = depth ?? getCurrentExecutionDepth()

  if (effectiveDepth >= MAX_RECURSION_DEPTH) {
    const [run] = await db
      .insert(workflowRuns)
      .values({
        workflowId,
        status: "failed",
        triggerData: triggerEnvelope as unknown as Record<string, unknown>,
        depth: effectiveDepth,
        error: `Recursion limit reached (${MAX_RECURSION_DEPTH} levels)`,
        completedAt: new Date(),
      })
      .returning()

    return run
  }

  const [run] = await db
    .insert(workflowRuns)
    .values({
      workflowId,
      status: "pending",
      triggerData: triggerEnvelope as unknown as Record<string, unknown>,
      depth: effectiveDepth,
    })
    .returning()

  return run
}
