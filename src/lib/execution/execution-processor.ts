import { db } from "@/db"
import { sql } from "drizzle-orm"
import { eq } from "drizzle-orm"
import { workflowRuns, workflowRunSteps } from "@/db/schema/workflows"
import { executeRun } from "./engine"

const INITIAL_DELAY = 5_000 // 5 seconds - let server finish booting
const POLL_INTERVAL = 5_000 // 5 seconds - execution should be responsive

/**
 * Execution lease: a run claimed as 'running' executes inline within a single
 * processor tick, so any run still 'running' after this long belongs to a
 * process that crashed or restarted mid-run. 5 minutes is generous headroom
 * over the longest legitimate run (actions are HTTP calls / DB writes that
 * complete in seconds) while still unblocking a stuck workflow queue quickly.
 * Keep in sync with the INTERVAL literal in reclaimStaleRuns.
 */
const STALE_RUN_TIMEOUT_MINUTES = 5

/**
 * Self-scheduling execution processor loop.
 *
 * Polls DB for pending workflow runs, claims them atomically with serial
 * enforcement (1 concurrent run per workflow), and executes them.
 * Also resumes waiting runs whose delay has elapsed.
 *
 * Uses setTimeout chaining (not setInterval) to prevent overlap.
 * Started once on server boot via instrumentation.ts.
 */
export function startExecutionProcessor(): void {
  console.log("[execution-processor] Starting with initial delay of 5s")
  scheduleTick(INITIAL_DELAY)
}

function scheduleTick(delay: number): void {
  setTimeout(async () => {
    try {
      // Reclaim runs stranded in 'running' (e.g. after a server restart)
      // BEFORE claiming: serial enforcement skips any workflow that still has
      // a 'running' run, so a stranded run would block its workflow forever.
      await reclaimStaleRuns()
      const pendingCount = await processPendingRuns()
      const waitingCount = await processWaitingRuns()
      if (pendingCount > 0 || waitingCount > 0) {
        console.log(
          `[execution-processor] Processed ${pendingCount} pending, ${waitingCount} waiting run(s)`
        )
      }
    } catch (error) {
      console.error("[execution-processor] Tick error:", error)
    }

    // Always schedule the next tick
    scheduleTick(POLL_INTERVAL)
  }, delay)
}

/**
 * Reclaim runs stuck in 'running' longer than the execution lease
 * (STALE_RUN_TIMEOUT_MINUTES, measured against started_at).
 *
 * A process crash/restart mid-run leaves the run 'running' forever; serial
 * enforcement (NOT EXISTS status IN ('running','waiting')) then blocks every
 * future pending run of that workflow. We mark such runs FAILED rather than
 * re-queueing them: their side effects (emails, HTTP calls, CRM writes) may
 * already have fired and we cannot know where execution stopped, so a re-run
 * would duplicate them. Orphaned 'running' steps are failed as well so the
 * run detail UI doesn't show a step spinning forever.
 */
export async function reclaimStaleRuns(): Promise<number> {
  // Fail orphaned in-flight steps of stale runs first (while the parent runs
  // are still identifiable by status = 'running').
  await db.execute(sql`
    UPDATE workflow_run_steps
    SET status = 'failed',
        completed_at = NOW(),
        output = '{"error": "Abandoned: parent run reclaimed after exceeding its execution lease"}'::jsonb
    WHERE status = 'running'
      AND run_id IN (
        SELECT id FROM workflow_runs
        WHERE status = 'running'
          AND started_at < NOW() - make_interval(mins => ${STALE_RUN_TIMEOUT_MINUTES})
      )
  `)

  const staleError = `Run was stuck in running state past the ${STALE_RUN_TIMEOUT_MINUTES}-minute execution lease (server likely restarted mid-run); reclaimed to unblock the workflow queue`
  const reclaimed = await db.execute(sql`
    UPDATE workflow_runs
    SET status = 'failed',
        error = ${staleError},
        completed_at = NOW()
    WHERE status = 'running'
      AND started_at < NOW() - make_interval(mins => ${STALE_RUN_TIMEOUT_MINUTES})
    RETURNING id
  `)

  const count = (reclaimed as unknown as unknown[])?.length ?? 0
  if (count > 0) {
    console.log(`[execution-processor] Reclaimed ${count} stale running run(s)`)
  }
  return count
}

/**
 * Atomically claim pending runs with serial enforcement.
 *
 * Uses UPDATE...RETURNING with a subquery that ensures no other run for the
 * same workflow is currently running or waiting. Drains the queue by looping
 * until no more runs can be claimed.
 */
export async function processPendingRuns(): Promise<number> {
  let count = 0

  while (true) {
    const claimed = await db.execute(sql`
      UPDATE workflow_runs
      SET status = 'running', started_at = NOW()
      WHERE id = (
        SELECT wr.id
        FROM workflow_runs wr
        WHERE wr.status = 'pending'
          AND NOT EXISTS (
            SELECT 1
            FROM workflow_runs wr2
            WHERE wr2.workflow_id = wr.workflow_id
              AND wr2.status IN ('running', 'waiting')
          )
        ORDER BY wr.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `)

    if (!claimed || (claimed as unknown[]).length === 0) {
      break
    }

    const run = (claimed as Record<string, unknown>[])[0]
    count++

    try {
      await executeRun(run.id as string)
    } catch (error) {
      console.error(
        `[execution-processor] Error executing run ${run.id}:`,
        error
      )
    }
  }

  return count
}

/**
 * Resume waiting runs whose delay has elapsed.
 *
 * Queries workflow_run_steps with status "waiting" and resume_at <= now,
 * transitions them to "running", and calls executeRun which picks up
 * from the run's currentNodeId.
 */
export async function processWaitingRuns(): Promise<number> {
  const readySteps = await db.execute(sql`
    SELECT wrs.id, wrs.run_id
    FROM workflow_run_steps wrs
    WHERE wrs.status = 'waiting'
      AND wrs.resume_at <= NOW()
    FOR UPDATE SKIP LOCKED
  `)

  if (!readySteps || (readySteps as unknown[]).length === 0) {
    return 0
  }

  let count = 0

  for (const step of readySteps as Record<string, unknown>[]) {
    const stepId = step.id as string
    const runId = step.run_id as string

    // Transition step to completed (delay elapsed)
    await db
      .update(workflowRunSteps)
      .set({ status: "completed" as const, completedAt: new Date() })
      .where(eq(workflowRunSteps.id, stepId))

    // Transition run back to running. Reset started_at: it still holds the
    // original claim time (pre-delay, possibly hours ago), and the stale-run
    // reclaim measures the execution lease against started_at -- without the
    // reset a legitimately resumed run would be reclaimed immediately.
    await db
      .update(workflowRuns)
      .set({ status: "running" as const, startedAt: new Date() })
      .where(eq(workflowRuns.id, runId))

    try {
      await executeRun(runId)
      count++
    } catch (error) {
      console.error(
        `[execution-processor] Error resuming run ${runId}:`,
        error
      )
    }
  }

  return count
}
