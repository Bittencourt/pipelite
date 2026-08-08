import { addMinutes, addHours, addDays } from "date-fns"
import { resolveFieldPath } from "./condition-evaluator"
import type { DelayConfig, ExecutionContext } from "./types"

const MAX_DELAY_DAYS = 30

/**
 * Cap a computed resumeAt date to 30 days from now.
 */
function capAt30Days(date: Date): Date {
  const maxDate = addDays(new Date(), MAX_DELAY_DAYS)
  return date > maxDate ? maxDate : date
}

/**
 * Resolve a delay config against the execution context.
 * Returns null if the delay should be skipped (past time in "until" mode).
 * Throws on invalid input.
 */
export function resolveDelay(
  config: DelayConfig,
  context: ExecutionContext
): Date | null {
  const now = new Date()

  switch (config.mode) {
    case "fixed": {
      const duration = config.duration ?? 0
      const unit = config.unit ?? "minutes"
      let resumeAt: Date
      switch (unit) {
        case "minutes":
          resumeAt = addMinutes(now, duration)
          break
        case "hours":
          resumeAt = addHours(now, duration)
          break
        case "days":
          resumeAt = addDays(now, duration)
          break
        default:
          throw new Error(`Invalid delay unit: ${unit}`)
      }
      return capAt30Days(resumeAt)
    }

    case "until": {
      const untilTime = config.untilTime
      if (!untilTime) {
        throw new Error("Invalid untilTime: untilTime is required for 'until' mode")
      }
      const parsed = new Date(untilTime)
      if (isNaN(parsed.getTime())) {
        throw new Error(`Invalid untilTime: '${untilTime}' is not a valid datetime`)
      }
      if (parsed <= now) {
        return null
      }
      return capAt30Days(parsed)
    }

    case "field": {
      const fieldPath = config.fieldPath
      if (!fieldPath) {
        throw new Error("fieldPath is required for 'field' mode")
      }
      const value = resolveFieldPath(context, fieldPath)
      if (value == null) {
        throw new Error(`Delay field path '${fieldPath}' not found in execution context`)
      }
      const parsed = new Date(String(value))
      if (isNaN(parsed.getTime())) {
        throw new Error(
          `Delay field path '${fieldPath}' does not contain a valid date: '${value}'`
        )
      }
      if (parsed <= now) {
        return null
      }
      return capAt30Days(parsed)
    }

    default:
      throw new Error(`Unknown delay mode: ${(config as DelayConfig).mode}`)
  }
}
