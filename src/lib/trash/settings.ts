/**
 * The trash retention setting — the second `app_settings` key in the codebase, after
 * `audit.retention_days` (Phase 36).
 *
 * Like `src/lib/audit/settings.ts`, this module DOES import the database. That is correct
 * and expected: it is a service, not a pure helper.
 *
 * Every exported function here is reachable from a background timer tick (the trash pruner)
 * or from an admin page render. None of them may let an error escape: a pruner that stops
 * rescheduling after one bad read is a silently disabled retention policy, and an admin page
 * that 500s is an admin who cannot see or change the window.
 */

import { z } from "zod"
import { count, eq, isNotNull, min } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema/app-settings"
import { activities, deals, organizations, people } from "@/db/schema"

/** The settings key this phase owns. Seeded by migration 0015 (37-01). */
export const TRASH_RETENTION_KEY = "trash.retention_days"

/**
 * One day is the shortest window that is still a retention policy rather than a purge.
 * The lower bound is a control, not ergonomics: rejecting `<= 0` is what stops the
 * retention setting from being usable as a data-destruction primitive (T-37-04).
 */
export const RETENTION_MIN = 1

/**
 * One year. Trash is a recovery buffer, not an archive: a ceiling far above this would let a
 * deployment satisfy the letter of "trash is purged" while never actually purging anything.
 *
 * This number is duplicated in two places that cannot import it — the `max` attribute of the
 * retention `Input` and the `trash.retention.windowHelp` copy ("between 1 and 365"). The test
 * asserts the literal so a change here shows up as a failure rather than as a UI that
 * silently disagrees with its own validator.
 */
export const RETENTION_MAX = 365

/**
 * The single validation for both directions. `app_settings.value` is `jsonb` typed as
 * `unknown`, so a stored string, object, boolean or JSON null all arrive here and all fail —
 * no coercion anywhere. `z.number()` also rejects `NaN`.
 */
const retentionSchema = z.number().int().min(RETENTION_MIN).max(RETENTION_MAX)

/**
 * Reads the configured retention window, or `null`.
 *
 * `null` means DO NOTHING — never "use a default". The consumer is the pruner, and for the
 * pruner `null` must mean destroy nothing, because keeping a trashed record is always the
 * recoverable direction and deleting it is not.
 *
 * THE DEFAULT AND THE ABSENCE OF A DEFAULT ARE TWO DIFFERENT MECHANISMS. Both halves are
 * written out here so neither is later "simplified" into the other:
 *
 *   1. The CONTEXT-locked thirty-day default is real and IS implemented — as a SEEDED
 *      `app_settings` row in migration `0015` (`INSERT ... ON CONFLICT DO NOTHING`). A fresh
 *      deployment therefore purges trash on a month-long window with no admin action.
 *   2. There is deliberately NO code-level fallback in this function, and none may ever be
 *      added. This `null` is also what a corrupted, tampered, out-of-range or deliberately
 *      cleared row produces, and silently resuming permanent deletion on a month-long window
 *      in those cases is the wrong failure direction (T-37-05).
 *
 * Default in data, fail closed in code. A nullish-coalescing fallback here would collapse the
 * two and turn a corrupt row back into an unbounded delete.
 *
 * Fails closed on any error: logs and returns `null`, never propagating out of the tick.
 */
export async function readTrashRetentionDays(): Promise<number | null> {
  try {
    const row = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, TRASH_RETENTION_KEY),
    })

    if (!row) {
      return null
    }

    const parsed = retentionSchema.safeParse(row.value)

    if (!parsed.success) {
      // Identifiers and bounds only — never the stored value itself (T-37-09).
      console.warn(
        `[trash-settings] ${TRASH_RETENTION_KEY} is not an integer in [${RETENTION_MIN}, ${RETENTION_MAX}] — trash purging is disabled until it is corrected`
      )
      return null
    }

    return parsed.data
  } catch (error) {
    console.error("[trash-settings] Failed to read the retention setting:", error)
    return null
  }
}

/** Discriminated result so a caller cannot mistake a failure for a success. */
export type WriteTrashRetentionResult = { success: true } | { success: false; error: string }

/**
 * Upserts the retention window.
 *
 * Validation happens BEFORE any database call, so an out-of-range value never reaches storage
 * where a later read would have to defend against it (T-37-04). The tests assert the ABSENCE
 * of a database call for 0, -1, 366 and 1.5 — a `false` result alone would not prove the
 * value never landed. Returns a failure result on a rejected write rather than propagating.
 */
export async function writeTrashRetentionDays(days: number): Promise<WriteTrashRetentionResult> {
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
      .values({ key: TRASH_RETENTION_KEY, value, updatedAt })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt },
      })

    return { success: true }
  } catch (error) {
    console.error("[trash-settings] Failed to write the retention setting:", error)
    return { success: false, error: "Failed to save the retention setting." }
  }
}

/** What the retention window costs, for the `/admin/trash` readouts. */
export interface TrashStats {
  trashedCount: number
  /**
   * `null` means TRASH IS EMPTY — there is no oldest deletion, which is not the same as
   * "now". A caller that renders this must branch on the null, not format it.
   */
  oldestDeletedAt: Date | null
}

/**
 * Counts everything currently in trash and finds its oldest deletion.
 *
 * Diverges from `readAuditStats` in exactly one way: it aggregates FOUR tables instead of
 * one — `deals`, `people`, `organizations` and `activities`, the four that carry a nullable
 * `deleted_at` and a btree index on it (migration 0012) — in parallel, and folds the results.
 * The try/catch shape, the `Number(...) || 0` coercion and the degrade-to-zero-state posture
 * are copied verbatim.
 *
 * `isNotNull(table.deletedAt)` is written out explicitly on every one of the four reads.
 * An index predicate does not enforce itself (Phase 35), and the trash surface is the only
 * place in the codebase that INVERTS the live-record predicate — so dropping the `where`
 * would silently count every live record as trash rather than erroring.
 *
 * These stats are global and deliberately NOT owner-scoped: `/admin/trash` is admin-only.
 *
 * Degrades to the zero-state on failure — the admin page must render, not 500.
 */
export async function readTrashStats(): Promise<TrashStats> {
  try {
    const results = await Promise.all([
      db
        .select({ rowCount: count(), oldest: min(deals.deletedAt) })
        .from(deals)
        .where(isNotNull(deals.deletedAt)),
      db
        .select({ rowCount: count(), oldest: min(people.deletedAt) })
        .from(people)
        .where(isNotNull(people.deletedAt)),
      db
        .select({ rowCount: count(), oldest: min(organizations.deletedAt) })
        .from(organizations)
        .where(isNotNull(organizations.deletedAt)),
      db
        .select({ rowCount: count(), oldest: min(activities.deletedAt) })
        .from(activities)
        .where(isNotNull(activities.deletedAt)),
    ])

    let trashedCount = 0
    let oldestDeletedAt: Date | null = null

    for (const rows of results) {
      const row = rows[0]

      if (!row) {
        continue
      }

      trashedCount += Number(row.rowCount) || 0

      const oldest = row.oldest ?? null

      if (oldest !== null && (oldestDeletedAt === null || oldest < oldestDeletedAt)) {
        oldestDeletedAt = oldest
      }
    }

    return { trashedCount, oldestDeletedAt }
  } catch (error) {
    console.error("[trash-settings] Failed to read trash stats:", error)
    return { trashedCount: 0, oldestDeletedAt: null }
  }
}
