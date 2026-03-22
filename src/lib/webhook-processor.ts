const INITIAL_DELAY = 5_000 // 5 seconds - let server finish booting
const POLL_INTERVAL = 60_000 // 60 seconds between ticks

/**
 * Self-scheduling webhook processor loop.
 *
 * Uses setTimeout chaining (not setInterval) to prevent overlap:
 * the next tick is only scheduled after the current tick completes.
 *
 * Started once on server boot via instrumentation.ts.
 */
export function startWebhookProcessor(): void {
  console.log("[webhook-processor] Starting with initial delay of 5s")
  scheduleTick(INITIAL_DELAY)
}

function scheduleTick(delay: number): void {
  setTimeout(async () => {
    try {
      const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
      const response = await fetch(`${baseUrl}/api/internal/webhooks/process`, {
        method: "POST",
        headers: {
          "X-Internal-Secret": process.env.INTERNAL_SECRET ?? "",
        },
      })

      if (response.ok) {
        const result = await response.json()
        if (result.processed > 0 || result.cleaned > 0) {
          console.log(
            `[webhook-processor] Processed ${result.processed}, cleaned ${result.cleaned}`
          )
        }
      } else {
        console.error(
          `[webhook-processor] Process route returned ${response.status}`
        )
      }
    } catch (error) {
      console.error("[webhook-processor] Tick error:", error)
    }

    // Always schedule the next tick
    scheduleTick(POLL_INTERVAL)
  }, delay)
}
