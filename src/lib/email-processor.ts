const INITIAL_DELAY = 15_000 // 15 seconds - let server finish booting (after webhook processor)
const POLL_INTERVAL = 5 * 60_000 // 5 minutes between ticks

/**
 * Self-scheduling email processor loop.
 *
 * Uses setTimeout chaining (not setInterval) to prevent overlap:
 * the next tick is only scheduled after the current tick completes.
 *
 * Handles activity reminders (due within 1 hour) and weekly digest (Monday morning).
 * Started once on server boot via instrumentation.ts.
 */
export function startEmailProcessor(): void {
  console.log("[email-processor] Starting with initial delay of 15s")
  scheduleTick(INITIAL_DELAY)
}

function scheduleTick(delay: number): void {
  setTimeout(async () => {
    try {
      const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
      const response = await fetch(`${baseUrl}/api/internal/email/process`, {
        method: "POST",
        headers: {
          "X-Internal-Secret": process.env.INTERNAL_SECRET ?? "",
        },
      })

      if (response.ok) {
        const result = await response.json()
        if (result.reminders > 0 || result.digests > 0) {
          console.log(
            `[email-processor] Reminders: ${result.reminders}, Digests: ${result.digests}`
          )
        }
      } else {
        console.error(
          `[email-processor] Process route returned ${response.status}`
        )
      }
    } catch (error) {
      console.error("[email-processor] Tick error:", error)
    }

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
