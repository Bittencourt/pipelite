import { and, eq } from "drizzle-orm"
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

/**
 * Atomically claim a pending workflow run for in-process (synchronous) execution.
 *
 * The execution processor polls for runs with status "pending" and claims them
 * with `UPDATE ... WHERE status = 'pending'`. A caller that wants to execute a
 * run itself (e.g. the inbound webhook route waiting on a webhook_response node)
 * MUST claim the run through this helper first, using the exact same status
 * protocol: flip "pending" -> "running" atomically. Whichever side wins the
 * UPDATE owns the run; the other side sees zero affected rows and backs off.
 *
 * Returns true if this caller claimed the run (and may execute it), false if
 * the run was not claimable (already claimed by the processor, or created in a
 * non-pending state such as the recursion-limit "failed" short-circuit).
 */
export async function claimWorkflowRun(runId: string): Promise<boolean> {
  const claimed = await db
    .update(workflowRuns)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.status, "pending")))
    .returning({ id: workflowRuns.id })

  return claimed.length > 0
}
