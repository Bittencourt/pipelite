import { CronExpressionParser } from "cron-parser"
import type { ScheduleTriggerConfig, TriggerConfig } from "./types"

/**
 * Compute the next run time for a schedule trigger.
 *
 * - mode "interval": adds intervalMinutes to fromDate (defaults to now)
 * - mode "cron": parses cronExpression and returns next occurrence after fromDate
 *
 * Returns null if configuration is invalid or incomplete.
 */
export function computeNextRun(
  config: ScheduleTriggerConfig,
  fromDate?: Date
): Date | null {
  const base = fromDate ?? new Date()

  if (config.mode === "interval") {
    if (!config.intervalMinutes) return null
    return new Date(base.getTime() + config.intervalMinutes * 60_000)
  }

  if (config.mode === "cron") {
    if (!config.cronExpression) return null
    try {
      const expr = CronExpressionParser.parse(config.cronExpression, {
        currentDate: base,
      })
      return expr.next().toDate()
    } catch {
      return null
    }
  }

  return null
}

/**
 * Extract the first schedule trigger from a triggers array.
 * Returns the trigger config and its index, or null if none found.
 */
export function getScheduleTrigger(
  triggers: TriggerConfig[]
): { trigger: ScheduleTriggerConfig; index: number } | null {
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].type === "schedule") {
      return { trigger: triggers[i] as ScheduleTriggerConfig, index: i }
    }
  }
  return null
}
