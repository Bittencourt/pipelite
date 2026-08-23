import { log } from "@/lib/log"
import { recordTick, registerProcessor } from "@/lib/observability/heartbeat"

const INITIAL_DELAY = 15_000 // 15 seconds - let server finish booting (after webhook processor)
const POLL_INTERVAL = 5 * 60_000 // 5 minutes between ticks

/**
 * Self-scheduling email processor loop.
 *
 * Uses setTimeout chaining (not setInterval) to prevent overlap:
 * the next tick is only scheduled after the current tick completes.
 *
 * Handles activity reminders (due within 1 hour) and weekly digest (Monday morning).
 * Started once on server boot via instrumentation.ts. Whether that actually happened is now
 * reportable rather than only greppable: `registerProcessor` below puts this worker in the
 * heartbeat registry that `GET /api/health` reads off a hard-coded roster, so a processor that
 * never started reads `alive: false` instead of reading as nothing at all.
 */
export function startEmailProcessor(): void {
  // The delay is a FIELD, not prose: "initial delay of 15s" could not stay true through an edit
  // of INITIAL_DELAY, and this can.
  log.info("email-processor", "Starting", { initialDelayMs: INITIAL_DELAY })
  // This module's own constants are passed IN rather than imported OUT by the health route — the
  // registry is dependency-free so that reading it does not drag `fetch` and this module's graph
  // into the route bundle, and passing them keeps the staleness bound tied to the real cadence.
  registerProcessor("email-processor", POLL_INTERVAL, INITIAL_DELAY)
  scheduleTick(INITIAL_DELAY)
}

function scheduleTick(delay: number): void {
  setTimeout(async () => {
    try {
      // Self-call: this route lives in the same server process, so localhost
      // is always correct — NEXTAUTH_URL may point at a public domain.
      const baseUrl = `http://localhost:${process.env.PORT ?? 3000}`
      const response = await fetch(`${baseUrl}/api/internal/email/process`, {
        method: "POST",
        headers: {
          "X-Internal-Secret": process.env.INTERNAL_SECRET ?? "",
        },
      })

      if (response.ok) {
        const result = await response.json()
        if (result.reminders > 0 || result.digests > 0) {
          // Counts only — never a recipient. The line this replaced carried neither, and this one
          // must not start: `src/lib/email/send.ts` is where an address legitimately appears.
          log.info("email-processor", "Processed queue", {
            reminders: result.reminders,
            digests: result.digests,
          })
        }
      } else {
        log.error("email-processor", "Process route returned non-OK", {
          status: response.status,
        })
      }
    } catch (error) {
      log.error("email-processor", "Tick error", { err: error })
    }

    // OUTSIDE the try, for the same reason as the reschedule below: a tick that ERRORED still ran.
    // Inside it, a processor failing every tick would read as DEAD at /api/health, so a real
    // outage and a real bug would produce the same signal.
    recordTick("email-processor")

    // Always schedule the next tick
    scheduleTick(POLL_INTERVAL)
  }, delay)
}

/**
 * Check if the given date falls in the Monday morning digest window (8-9 UTC).
 * Exported for testability.
 */
export function isMondayMorning(date: Date): boolean {
  return date.getUTCDay() === 1 && date.getUTCHours() >= 8 && date.getUTCHours() < 9
}

/**
 * Get the week boundaries for the digest.
 * weekStart = previous Monday 00:00 UTC
 * weekEnd = previous Sunday 23:59:59.999 UTC
 * Exported for testability.
 */
export function getWeekBoundaries(date: Date): { weekStart: Date; weekEnd: Date } {
  // "This Monday" at 00:00 UTC
  const thisMonday = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ))

  // Previous Monday = thisMonday - 7 days
  const weekStart = new Date(thisMonday)
  weekStart.setUTCDate(weekStart.getUTCDate() - 7)

  // Previous Sunday = thisMonday - 1 ms
  const weekEnd = new Date(thisMonday.getTime() - 1)

  return { weekStart, weekEnd }
}
