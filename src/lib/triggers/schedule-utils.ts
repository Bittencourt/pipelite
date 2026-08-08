import { CronExpressionParser } from "cron-parser"
import type { ScheduleTriggerConfig, TriggerConfig } from "./types"

/**
 * Compute the next run time for a schedule trigger.
 *
 * - mode "interval": adds intervalMinutes to fromDate (defaults to now)
 * - mode "cron": parses cronExpression and returns next occurrence after fromDate.
 *   Cron expressions are evaluated in the trigger's optional `timezone` (an IANA
 *   string, e.g. "America/Sao_Paulo", read defensively from the config); when
 *   absent or invalid the timezone defaults to UTC explicitly, so behavior no
 *   longer depends on the server/container timezone.
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
    const cronExpression = config.cronExpression
    if (!cronExpression) return null

    // The shared schema doesn't declare `timezone` yet; read it defensively.
    const rawTimezone = (config as Record<string, unknown>).timezone
    const timezone =
      typeof rawTimezone === "string" && rawTimezone.length > 0
        ? rawTimezone
        : "UTC"

    const parseInTimezone = (tz: string): Date | null => {
      try {
        const expr = CronExpressionParser.parse(cronExpression, {
          currentDate: base,
          tz,
        })
        const next = expr.next().toDate()
        return Number.isNaN(next.getTime()) ? null : next
      } catch {
        return null
      }
    }

    // Invalid timezone strings fall back to UTC rather than killing the
    // schedule (a null here would leave nextRunAt unset forever).
    const next = parseInTimezone(timezone)
    if (next) return next
    return timezone !== "UTC" ? parseInTimezone("UTC") : null
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
