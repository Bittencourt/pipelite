import { log } from "@/lib/log"
import { recordTick, registerProcessor } from "@/lib/observability/heartbeat"

const INITIAL_DELAY = 5_000 // 5 seconds - let server finish booting
const POLL_INTERVAL = 60_000 // 60 seconds between ticks

/**
 * Self-scheduling webhook processor loop.
 *
 * Uses setTimeout chaining (not setInterval) to prevent overlap:
 * the next tick is only scheduled after the current tick completes.
 *
 * Started once on server boot via instrumentation.ts. Whether that actually happened is now
 * reportable rather than only greppable: `registerProcessor` below puts this worker in the
 * heartbeat registry that `GET /api/health` reads off a hard-coded roster, so a processor that
 * never started reads `alive: false` instead of reading as nothing at all.
 */
export function startWebhookProcessor(): void {
  // The delay is a FIELD, not prose: "initial delay of 5s" could not stay true through an edit
  // of INITIAL_DELAY, and this can.
  log.info("webhook-processor", "Starting", { initialDelayMs: INITIAL_DELAY })
  // This module's own constants are passed IN rather than imported OUT by the health route — the
  // registry is dependency-free so that reading it does not drag `fetch` and this module's graph
  // into the route bundle, and passing them keeps the staleness bound tied to the real cadence.
  registerProcessor("webhook-processor", POLL_INTERVAL, INITIAL_DELAY)
  scheduleTick(INITIAL_DELAY)
}

function scheduleTick(delay: number): void {
  setTimeout(async () => {
    try {
      // Self-call: this route lives in the same server process, so localhost
      // is always correct — NEXTAUTH_URL may point at a public domain.
      const baseUrl = `http://localhost:${process.env.PORT ?? 3000}`
      const response = await fetch(`${baseUrl}/api/internal/webhooks/process`, {
        method: "POST",
        headers: {
          "X-Internal-Secret": process.env.INTERNAL_SECRET ?? "",
        },
      })

      if (response.ok) {
        const result = await response.json()
        if (result.processed > 0 || result.cleaned > 0) {
          log.info("webhook-processor", "Processed queue", {
            processed: result.processed,
            cleaned: result.cleaned,
          })
        }
      } else {
        log.error("webhook-processor", "Process route returned non-OK", {
          status: response.status,
        })
      }
    } catch (error) {
      log.error("webhook-processor", "Tick error", { err: error })
    }

    // OUTSIDE the try, for the same reason as the reschedule below: a tick that ERRORED still ran.
    // Inside it, a processor failing every tick would read as DEAD at /api/health, so a real
    // outage and a real bug would produce the same signal.
    recordTick("webhook-processor")

    // Always schedule the next tick
    scheduleTick(POLL_INTERVAL)
  }, delay)
}
