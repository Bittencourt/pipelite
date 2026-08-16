/**
 * The audit retention setting — the one `app_settings` key this phase introduces.
 *
 * Unlike `actor-context.ts` and `diff.ts`, this module DOES import the database. That is
 * correct and expected: it is a service, not a pure helper.
 *
 * Every exported function here is reachable from a background timer tick (the pruner,
 * 36-18) or from an admin page render. None of them may let an error escape: a pruner that
 * stops rescheduling after one bad read is a silently disabled retention policy, which is
 * the AUDIT-04 failure mode (T-36-19). So each one catches and returns its safe value.
 */

import { z } from "zod"
import { count, eq, min } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema/app-settings"
import { auditLog } from "@/db/schema/audit-log"

/** The single settings key this phase owns. Seeded by migration 0014 (36-03). */
export const AUDIT_RETENTION_KEY = "audit.retention_days"

/**
 * One day is the shortest window that is still a retention policy rather than a purge.
 * The lower bound is a control, not ergonomics: rejecting `<= 0` is what stops the
 * retention setting from being usable as a data-destruction primitive (T-36-07).
 */
export const RETENTION_MIN = 1

/** Ten years. Above this the setting is indistinguishable from "keep forever". */
export const RETENTION_MAX = 3650

/**
 * The single validation for both directions. `app_settings.value` is `jsonb` typed as
 * `unknown` (36-03), so a stored string, object, boolean or JSON null all arrive here and
 * all fail — no coercion anywhere. `z.number()` also rejects `NaN`.
 */
const retentionSchema = z.number().int().min(RETENTION_MIN).max(RETENTION_MAX)

/**
 * Reads the configured retention window, or `null`.
 *
 * `null` means DO NOTHING — never "use a default". The only consumer is the pruner, and
 * for the pruner `null` must mean delete nothing, because keeping data is always the safe
 * direction for an audit log.
 *
 * THE DEFAULT AND THE ABSENCE OF A DEFAULT ARE TWO DIFFERENT MECHANISMS. Both halves are
 * written here so neither is later "simplified" into the other:
 *
 *   1. The CONTEXT-locked 90-day default is real and IS implemented — as a SEEDED
 *      `app_settings` row in migration `0014` (36-03, `INSERT ... ON CONFLICT DO NOTHING`).
 *      A fresh deployment therefore prunes at 90 days with no admin action.
 *   2. There is deliberately NO code-level fallback in this function. This `null` is also
 *      what a corrupted, tampered, out-of-range or deliberately cleared row produces, and
 *      resuming deletion at 90 days in those cases is the wrong failure direction for an
 *      audit log (T-36-18, T-36-44).
 *
 * Default in data, fail closed in code. Adding a fallback here would collapse the two and
 * turn a corrupt row back into an unbounded delete.
 *
 * Fails closed on any error: logs and returns `null`, never propagating out of the tick.
 */
export async function readRetentionDays(): Promise<number | null> {
  try {
    const row = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, AUDIT_RETENTION_KEY),
    })

    if (!row) {
      return null
    }

    const parsed = retentionSchema.safeParse(row.value)

    if (!parsed.success) {
      console.warn(
        `[audit-settings] ${AUDIT_RETENTION_KEY} is not an integer in [${RETENTION_MIN}, ${RETENTION_MAX}] — retention is disabled until it is corrected`
      )
      return null
    }

    return parsed.data
  } catch (error) {
    console.error("[audit-settings] Failed to read the retention setting:", error)
    return null
  }
}

/** Discriminated result so a caller cannot mistake a failure for a success. */
export type WriteRetentionResult = { success: true } | { success: false; error: string }

/**
 * Upserts the retention window.
 *
 * Validation happens BEFORE any database call, so an out-of-range value never reaches
 * storage where a later read would have to defend against it. Returns a failure result on
 * a rejected write rather than propagating the error.
 */
export async function writeRetentionDays(days: number): Promise<WriteRetentionResult> {
  const parsed = retentionSchema.safeParse(days)

  if (!parsed.success) {
    return {
      success: false,
      error: `Retention must be a whole number of days between ${RETENTION_MIN} and ${RETENTION_MAX}.`,
    }
  }

  const value = parsed.data

  try {
    const updatedAt = new Date()

    await db
      .insert(appSettings)
      .values({ key: AUDIT_RETENTION_KEY, value, updatedAt })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt },
      })

    return { success: true }
  } catch (error) {
    console.error("[audit-settings] Failed to write the retention setting:", error)
    return { success: false, error: "Failed to save the retention setting." }
  }
}

/** What the retention window costs, for the `/admin/audit` readouts. */
export interface AuditStats {
  entryCount: number
  /** `null` on an empty table — there is no oldest entry, which is not the same as "now". */
  oldestEntryAt: Date | null
}

/**
 * Counts the audit log and finds its oldest entry in one aggregate query.
 *
 * Uses the drizzle builder rather than a raw fragment: there is no `ctid` or interval
 * arithmetic here, so nothing forces raw SQL and a fragment would only invite the
 * `Date`-binding hazard for no benefit.
 *
 * Degrades to the zero-state on failure — the admin page must render, not 500.
 */
export async function readAuditStats(): Promise<AuditStats> {
  try {
    const rows = await db
      .select({
        entryCount: count(),
        oldestEntryAt: min(auditLog.createdAt),
      })
      .from(auditLog)

    const row = rows[0]

    if (!row) {
      return { entryCount: 0, oldestEntryAt: null }
    }

    return {
      entryCount: Number(row.entryCount) || 0,
      oldestEntryAt: row.oldestEntryAt ?? null,
    }
  } catch (error) {
    console.error("[audit-settings] Failed to read audit log stats:", error)
    return { entryCount: 0, oldestEntryAt: null }
  }
}
