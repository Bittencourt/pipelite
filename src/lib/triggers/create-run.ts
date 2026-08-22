import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { workflowRuns } from "@/db/schema/workflows"
import type { WorkflowRun } from "@/db/schema/workflows"
import type { TriggerEnvelope } from "./types"
import { getCurrentExecutionDepth, MAX_RECURSION_DEPTH } from "@/lib/execution/recursion"

/**
 * The two run properties a caller may set that are NOT derivable from the trigger envelope.
 *
 * Both are OPTIONAL and the parameter carrying them is optional too, because five call sites — the
 * inbound webhook route, the schedule processor, the CRM matcher, the manual trigger and the tests —
 * pass neither and must keep compiling and behaving exactly as they do today.
 */
export interface CreateWorkflowRunOptions {
  /**
   * WFOPS-02. A test run: the engine reads this column on every entry and simulates the
   * side-effecting node types. It is set HERE, at insert, and never taken from a client payload —
   * `startDryRun` passes the literal `true`.
   */
  dryRun?: boolean
  /**
   * WFOPS-01. The run this one is a replay of. DIAGNOSTIC, never a guard: `depth` is reset to 0 for
   * a replay, so the recursion guard cannot see the chain, and this column is the only record the
   * replay happened (T-41-12). No chain-length check is derived from it anywhere.
   */
  replayedFromRunId?: string
}

/**
 * Create a new workflow run with "pending" status and the provided trigger envelope.
 * This is the shared entry point used by all trigger types (CRM event, schedule, webhook, manual).
 *
 * If depth is not provided, reads the current execution depth from AsyncLocalStorage.
 * Runs at depth >= MAX_RECURSION_DEPTH are immediately created as failed to prevent infinite loops.
 *
 * `options` carries the dry-run flag and the replay lineage (see `CreateWorkflowRunOptions`). It is
 * spread CONDITIONALLY into both inserts: an absent option writes no key at all, rather than an
 * explicit `undefined`. That distinction is load-bearing at the driver boundary — `dry_run` is
 * `NOT NULL DEFAULT false`, and the default can only apply when the column is omitted.
 */
export async function createWorkflowRun(
  workflowId: string,
  triggerEnvelope: TriggerEnvelope,
  depth?: number,
  options?: CreateWorkflowRunOptions
): Promise<WorkflowRun> {
  const effectiveDepth = depth ?? getCurrentExecutionDepth()

  // Built once and spread into BOTH branches. Never `{ dryRun: options?.dryRun }`: see the note
  // above about the NOT NULL column default.
  const extra: { dryRun?: boolean; replayedFromRunId?: string } = {}
  if (options?.dryRun === true) extra.dryRun = true
  if (typeof options?.replayedFromRunId === "string" && options.replayedFromRunId !== "") {
    extra.replayedFromRunId = options.replayedFromRunId
  }

  if (effectiveDepth >= MAX_RECURSION_DEPTH) {
    // BRANCH 1 — THE RECURSION SHORT-CIRCUIT, AND THE BRANCH THAT GETS FORGOTTEN.
    //
    // It carries `extra` for the same reason branch 2 does, and more urgently: this row is inserted
    // ALREADY `failed`, so nothing downstream ever revisits it to add the flags. An unmarked dry run
    // that trips the limit shows in the runs list as a real failure, and plan 41-08's alert path
    // would then email the workflow's author about a test run. An unmarked replay loses its only
    // record of what it replayed.
    const [run] = await db
      .insert(workflowRuns)
      .values({
        workflowId,
        status: "failed",
        triggerData: triggerEnvelope as unknown as Record<string, unknown>,
        depth: effectiveDepth,
        error: `Recursion limit reached (${MAX_RECURSION_DEPTH} levels)`,
        completedAt: new Date(),
        ...extra,
      })
      .returning()

    return run
  }

  // BRANCH 2 — the normal pending insert.
  const [run] = await db
    .insert(workflowRuns)
    .values({
      workflowId,
      status: "pending",
      triggerData: triggerEnvelope as unknown as Record<string, unknown>,
      depth: effectiveDepth,
      ...extra,
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
