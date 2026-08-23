import { db } from "@/db"
import { workflows } from "@/db/schema/workflows"
import { and, eq, lte } from "drizzle-orm"
import { log } from "@/lib/log"
import { recordTick, registerProcessor } from "@/lib/observability/heartbeat"
import { createWorkflowRun } from "./create-run"
import { computeNextRun, getScheduleTrigger } from "./schedule-utils"
import type { TriggerConfig } from "./types"

const INITIAL_DELAY = 10_000 // 10 seconds - let server finish booting
const POLL_INTERVAL = 30_000 // 30 seconds between ticks

/**
 * Self-scheduling schedule processor loop.
 *
 * Polls DB for workflows with next_run_at <= now(), claims them atomically,
 * creates pending workflow runs, and computes next execution times.
 *
 * Uses setTimeout chaining (not setInterval) to prevent overlap.
 * Started once on server boot via instrumentation.ts. Whether that actually happened is now
 * reportable rather than only greppable: `registerProcessor` below puts this worker in the
 * heartbeat registry that `GET /api/health` reads off a hard-coded roster, so a processor that
 * never started reads `alive: false` instead of reading as nothing at all.
 */
export function startScheduleProcessor(): void {
  // The delay is a FIELD, not prose: "initial delay of 10s" could not stay true through an edit
  // of INITIAL_DELAY, and this can.
  log.info("schedule-processor", "Starting", { initialDelayMs: INITIAL_DELAY })
  // This module's own constants are passed IN rather than imported OUT by the health route — the
  // registry is dependency-free so that reading it does not drag `db` and `drizzle` into the route
  // bundle, and passing them keeps the staleness bound tied to the real cadence.
  registerProcessor("schedule-processor", POLL_INTERVAL, INITIAL_DELAY)
  scheduleTick(INITIAL_DELAY)
}

function scheduleTick(delay: number): void {
  setTimeout(async () => {
    try {
      const count = await processScheduledWorkflows()
      if (count > 0) {
        log.info("schedule-processor", "Processed scheduled workflows", { processed: count })
      }
    } catch (error) {
      log.error("schedule-processor", "Tick error", { err: error })
    }

    // OUTSIDE the try, for the same reason as the reschedule below: a tick that ERRORED still ran.
    // Inside it, a processor failing every tick would read as DEAD at /api/health, so a real
    // outage and a real bug would produce the same signal.
    recordTick("schedule-processor")

    // Always schedule the next tick
    scheduleTick(POLL_INTERVAL)
  }, delay)
}

/**
 * Atomically claim workflows due for execution and create pending runs.
 *
 * Uses UPDATE...RETURNING to prevent duplicate claims across instances.
 * Always creates a "pending" workflow run, even if a previous run is still active.
 * The execution engine (Phase 26) picks up pending runs in order.
 */
export async function processScheduledWorkflows(): Promise<number> {
  const now = new Date()

  // Capture scheduled times BEFORE the claim nulls them. UPDATE...RETURNING
  // yields post-update rows, so nextRunAt would already be null there and the
  // envelope's scheduledAt would silently fall back to claim time.
  const due = await db
    .select({ id: workflows.id, nextRunAt: workflows.nextRunAt })
    .from(workflows)
    .where(and(eq(workflows.active, true), lte(workflows.nextRunAt, now)))

  const scheduledAtById = new Map<string, Date>()
  for (const row of due) {
    if (row.nextRunAt) scheduledAtById.set(row.id, row.nextRunAt)
  }

  // Atomic claim: set nextRunAt to null for all due workflows, returning claimed rows
  const claimed = await db
    .update(workflows)
    .set({ nextRunAt: null })
    .where(
      and(
        eq(workflows.active, true),
        lte(workflows.nextRunAt, now)
      )
    )
    .returning()

  for (const workflow of claimed) {
    const triggers = (workflow.triggers ?? []) as TriggerConfig[]
    const schedule = getScheduleTrigger(triggers)
    const scheduledAt = scheduledAtById.get(workflow.id) ?? now

    // Create a pending run unconditionally (queuing, never skipping).
    // Each workflow is isolated: one failure must never abort the rest of the
    // batch or leave this workflow's nextRunAt null (silently dead).
    let runCreated = false
    try {
      await createWorkflowRun(workflow.id, {
        trigger_type: "schedule",
        trigger_id: schedule ? String(schedule.index) : "0",
        timestamp: new Date().toISOString(),
        data: {
          scheduledAt: scheduledAt.toISOString(),
        },
      })
      runCreated = true
    } catch (error) {
      log.error("schedule-processor", "Failed to create run for workflow", {
        workflowId: workflow.id,
        err: error,
      })
    }

    // Compute and store next run time -- always, even when run creation failed
    if (schedule) {
      try {
        let nextRunAt: Date | null
        if (runCreated) {
          // Anchor the next occurrence to the scheduled time (not processing
          // time) so interval schedules don't drift forward each fire.
          nextRunAt = computeNextRun(schedule.trigger, scheduledAt)
          if (nextRunAt && nextRunAt.getTime() <= Date.now()) {
            // More than one period behind (e.g. downtime): re-anchor from now
            // to avoid an immediate catch-up burst.
            nextRunAt = computeNextRun(schedule.trigger)
          }
        } else {
          // Run creation failed: restore the original scheduled time so the
          // claim retries on the next poll cycle instead of dying.
          nextRunAt = scheduledAt
        }
        if (nextRunAt) {
          await db
            .update(workflows)
            .set({ nextRunAt })
            .where(eq(workflows.id, workflow.id))
        }
      } catch (error) {
        log.error("schedule-processor", "Failed to update nextRunAt for workflow", {
          workflowId: workflow.id,
          err: error,
        })
      }
    }
  }

  return claimed.length
}
