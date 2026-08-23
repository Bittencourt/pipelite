import { db } from "@/db"
import { sql, and, eq } from "drizzle-orm"
import { workflowRuns, workflowRunSteps } from "@/db/schema/workflows"
import { executeRun } from "./engine"
import { maybeAlertOnRunFailure } from "./failure-alert"

/**
 * WFOPS-03's alert is wired from THIS file, and from three places in it, because this is where a
 * run reaches a terminal failed state without anybody watching. Two failure classes are
 * deliberately still NOT covered, and both are accepted rather than overlooked:
 *
 *   - Recursion-limit failures are inserted already-`failed` by `createWorkflowRun`
 *     (src/lib/triggers/create-run.ts), so the processor never claims them and never sees them.
 *   - Synchronous webhook-response runs are claimed and executed inline by the inbound webhook
 *     route, so they never reach the processor either.
 *
 * Closing either one means putting email latency, and email exceptions, inside a live HTTP
 * request -- which is the whole reason the hook lives in a background processor. Both gaps are
 * written up in the deployment docs (docs/admin/deployment/) instead of being closed here.
 */

/**
 * Alert on a run's failure without ever letting the alert become the outage.
 *
 * One wrapper, three call sites, so the resilience lives in exactly one place. `safeSend`
 * RETHROWS on transport failure, and an escaping rejection inside `processPendingRuns`' drain
 * loop would abort the tick and leave every remaining pending run unclaimed until the next poll.
 * `await` inside `try` catches both shapes that matter -- a rejected promise AND a synchronous
 * throw before a promise is ever returned, which a bare `void maybeAlertOnRunFailure(id)` would
 * not.
 */
async function alertOnRunFailure(runId: string): Promise<void> {
  try {
    await maybeAlertOnRunFailure(runId)
  } catch (error) {
    console.error(
      `[execution-processor] Failure alert for run ${runId} threw; continuing the tick:`,
      error
    )
  }
}

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

  const reclaimedRows = reclaimed as unknown as Record<string, unknown>[] | undefined
  const count = reclaimedRows?.length ?? 0
  if (count > 0) {
    console.log(`[execution-processor] Reclaimed ${count} stale running run(s)`)
  }

  // ALERT SITE 3. A run killed by the execution lease never passes through executeRun at all --
  // its process died mid-run -- so no other call site can see it. That is precisely the "fails
  // silently forever" case WFOPS-03 is named for, so the ids the RETURNING above already yields
  // get alerted over here. Same `?? []` tolerance as the count line: postgres-js does not always
  // hand back a plain array.
  for (const row of reclaimedRows ?? []) {
    await alertOnRunFailure(row.id as string)
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

    // ALERT SITE 1, and note where it sits: AFTER the try/catch, not inside either half.
    //
    // executeRun does not throw when a run fails. It calls failRun() internally
    // (./engine.ts:551-562) and returns normally, so there is no failure path to hook and the
    // catch above only ever sees an unexpected exception -- a DB outage or a bug. The alert
    // therefore DETECTS: it is called unconditionally with nothing but an id, and
    // maybeAlertOnRunFailure re-reads the run's terminal status, its dryRun flag and its error
    // itself. A call placed inside the catch would never fire for the ordinary failed run, which
    // is the only case this requirement is actually about.
    await alertOnRunFailure(run.id as string)
  }

  return count
}

/**
 * Resume waiting runs whose delay has elapsed.
 *
 * Queries workflow_run_steps with status "waiting" and resume_at <= now,
 * transitions them to "running", and calls executeRun which picks up
 * from the run's currentNodeId.
 *
 * The claim is transactional and the step transition is GUARDED. It was neither, and delay
 * resume was the one claim path in this file that was not multi-instance safe: the
 * `SELECT ... FOR UPDATE SKIP LOCKED` below ran through `db.execute` on a transaction-free
 * postgres-js client (src/db/index.ts:1-13), so its row locks were released at the end of that
 * statement, and the follow-up step `UPDATE` carried no status predicate. Two instances could
 * therefore both select the same ready step and both call executeRun, duplicating the run's
 * remaining steps and every side effect after the delay.
 *
 * Both halves are needed and neither is decoration. The transaction makes the SELECT's locks
 * actually hold until the claims are written; the guard in the write is what a loser can detect.
 * That is the same atomic-claim protocol claimWorkflowRun (src/lib/triggers/create-run.ts:65-73)
 * and processPendingRuns already use: whichever side wins the UPDATE owns the step, and the other
 * sees zero affected rows and backs off.
 *
 * executeRun runs OUTSIDE the transaction, after the claims commit. A run's execution can take
 * seconds and issues its own writes; holding the step locks across it would serialize the whole
 * table behind one slow workflow.
 */
export async function processWaitingRuns(): Promise<number> {
  const claimedRunIds = await db.transaction(async (tx) => {
    const readySteps = await tx.execute(sql`
      SELECT wrs.id, wrs.run_id
      FROM workflow_run_steps wrs
      WHERE wrs.status = 'waiting'
        AND wrs.resume_at <= NOW()
      FOR UPDATE SKIP LOCKED
    `)

    if (!readySteps || (readySteps as unknown[]).length === 0) {
      return [] as string[]
    }

    const runIds: string[] = []

    for (const step of readySteps as Record<string, unknown>[]) {
      const stepId = step.id as string
      const runId = step.run_id as string

      // Transition step to completed (delay elapsed) -- and claim it while doing so. The
      // `status = 'waiting'` predicate is the claim: exactly one instance can match it.
      const claimedStep = await tx
        .update(workflowRunSteps)
        .set({ status: "completed" as const, completedAt: new Date() })
        .where(and(eq(workflowRunSteps.id, stepId), eq(workflowRunSteps.status, "waiting")))
        .returning({ id: workflowRunSteps.id })

      // Zero rows means another instance claimed this step first. Back off from THIS step and
      // carry on with the rest -- `continue`, never `break`: a lost claim says nothing about the
      // other elapsed delays in this batch, and breaking would strand them until the next tick.
      if (!claimedStep || claimedStep.length === 0) {
        continue
      }

      // Transition run back to running. Reset started_at: it still holds the
      // original claim time (pre-delay, possibly hours ago), and the stale-run
      // reclaim measures the execution lease against started_at -- without the
      // reset a legitimately resumed run would be reclaimed immediately.
      await tx
        .update(workflowRuns)
        .set({ status: "running" as const, startedAt: new Date() })
        .where(eq(workflowRuns.id, runId))

      runIds.push(runId)
    }

    return runIds
  })

  let count = 0

  for (const runId of claimedRunIds) {
    try {
      await executeRun(runId)
      count++
    } catch (error) {
      console.error(
        `[execution-processor] Error resuming run ${runId}:`,
        error
      )
    }

    // ALERT SITE 2, outside the try/catch for the same reason as site 1. This is the case where
    // the alert earns the most: a run that fails hours after its delay elapsed, when whoever
    // triggered it stopped watching long ago.
    await alertOnRunFailure(runId)
  }

  return count
}
