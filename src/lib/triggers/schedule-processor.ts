import { db } from "@/db"
import { workflows } from "@/db/schema/workflows"
import { and, eq, lte } from "drizzle-orm"
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
 * Started once on server boot via instrumentation.ts.
 */
export function startScheduleProcessor(): void {
  console.log("[schedule-processor] Starting with initial delay of 10s")
  scheduleTick(INITIAL_DELAY)
}

function scheduleTick(delay: number): void {
  setTimeout(async () => {
    try {
      const count = await processScheduledWorkflows()
      if (count > 0) {
        console.log(`[schedule-processor] Processed ${count} scheduled workflow(s)`)
      }
    } catch (error) {
      console.error("[schedule-processor] Tick error:", error)
    }

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
      console.error(
        `[schedule-processor] Failed to create run for workflow ${workflow.id}:`,
        error
      )
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
        console.error(
          `[schedule-processor] Failed to update nextRunAt for workflow ${workflow.id}:`,
          error
        )
      }
    }
  }

  return claimed.length
}
