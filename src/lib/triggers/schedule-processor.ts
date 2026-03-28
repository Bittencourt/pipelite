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
  // Atomic claim: set nextRunAt to null for all due workflows, returning claimed rows
  const claimed = await db
    .update(workflows)
    .set({ nextRunAt: null })
    .where(
      and(
        eq(workflows.active, true),
        lte(workflows.nextRunAt, new Date())
      )
    )
    .returning()

  for (const workflow of claimed) {
    const triggers = (workflow.triggers ?? []) as TriggerConfig[]
    const schedule = getScheduleTrigger(triggers)

    // Create a pending run unconditionally (queuing, never skipping)
    await createWorkflowRun(workflow.id, {
      trigger_type: "schedule",
      trigger_id: schedule ? String(schedule.index) : "0",
      timestamp: new Date().toISOString(),
      data: {
        scheduledAt: workflow.nextRunAt?.toISOString() ?? new Date().toISOString(),
      },
    })

    // Compute and store next run time
    if (schedule) {
      const nextRunAt = computeNextRun(schedule.trigger)
      if (nextRunAt) {
        await db
          .update(workflows)
          .set({ nextRunAt })
          .where(eq(workflows.id, workflow.id))
      }
    }
  }

  return claimed.length
}
