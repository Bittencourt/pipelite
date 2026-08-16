/**
 * The audit retention pruner — the ONLY deletion path for `audit_log`.
 *
 * Structure copied from `src/lib/execution/execution-processor.ts:30-56`: a self-scheduling
 * `setTimeout` chain rather than a repeating interval timer, so a slow tick can never overlap
 * the next one — the next one is not scheduled until this one has finished. The
 * delete-and-log body is the analog of `src/lib/import/import-session-cleanup.ts:15-47` with two
 * deliberate divergences — that module counts via `.returning({ id })` (which the `ctid` form
 * cannot use) and computes its cutoff as a JS `Date` at `:19` (which must not be copied; see
 * `deleteBatch`).
 *
 * Started once on server boot via `instrumentation.ts`. The startup log line below is
 * load-bearing operational evidence: Next.js standalone tracing has already omitted
 * `instrumentation.js` from this repo's production Docker image once, silently killing every
 * processor. No `[audit-prune]` line in `docker compose logs app` is how that is detected.
 */

import { sql } from "drizzle-orm"
import { db } from "@/db"
import { readRetentionDays } from "@/lib/audit/settings"

/** Let the server finish booting before the first tick — nothing here is time-critical. */
export const INITIAL_DELAY = 60_000

/** Daily. Retention is a window measured in days; there is nothing to gain from tighter. */
export const TICK_INTERVAL = 24 * 60 * 60 * 1000

/** Measured: 17.8 ms per batch against a 1,000,000-row table with the `created_at` index. */
export const BATCH_SIZE = 5_000

/**
 * ⇒ at most 100k rows deleted per day, ⇒ at most ~0.4 s of DELETE per tick.
 *
 * The cap is a denial-of-service control (T-36-39): it is what stops one tick from taking a
 * long write lock on the largest table in the schema. Its cost is starvation — if the steady
 * write rate exceeds 100k rows/day the table grows forever. That is accepted BECAUSE the tick
 * logs its total every time, so the shortfall is visible rather than silent (T-36-09).
 */
export const MAX_BATCHES_PER_TICK = 20

/**
 * Start the daily retention pruner. Idempotent per process only in the sense that it is called
 * exactly once, from `instrumentation.ts`.
 */
export function startAuditPruner(): void {
  console.log("[audit-prune] Starting with initial delay of 60s, ticking daily")
  scheduleTick(INITIAL_DELAY)
}

/**
 * Module-private on purpose: the chain owns its own cadence, and an exported `scheduleTick`
 * would let a caller start a second, overlapping chain.
 */
function scheduleTick(delay: number): void {
  setTimeout(async () => {
    try {
      const days = await readRetentionDays()

      if (days === null) {
        // FAILS CLOSED — delete nothing at all. `null` is what an unset, cleared, corrupted,
        // out-of-range or pre-migration settings row produces, and keeping data is always the
        // safe direction for an audit log. There is deliberately no `?? 90` here: the 90-day
        // default is a SEEDED `app_settings` row from migration 0014, and a code-level
        // fallback would turn a tampered row back into an unbounded delete (T-36-18).
        //
        // The privacy trade-off is real and points the other way: the retention window is the
        // only expiry mechanism for the former values stored in `changes`. It is accepted,
        // because the setting is repairable from /admin and an over-broad delete is not.
        console.log("[audit-prune] retention unset or invalid — no rows deleted")
      } else {
        let total = 0

        for (let i = 0; i < MAX_BATCHES_PER_TICK; i++) {
          const deleted = await deleteBatch(days, BATCH_SIZE)
          total += deleted

          if (deleted < BATCH_SIZE) {
            break // caught up — a short batch means nothing older is left
          }
        }

        // Logged every tick, even at zero: this line is the only signal that the pruner is
        // falling behind the write rate, which is the starvation failure mode of the cap.
        console.log(`[audit-prune] deleted ${total} row(s) older than ${days}d`)
      }
    } catch (error) {
      console.error("[audit-prune] Tick error:", error)
    }

    // Always schedule the next tick
    scheduleTick(TICK_INTERVAL)
  }, delay)
}

/**
 * Delete one capped batch of expired rows and return how many went.
 *
 * The `ctid` form is not a micro-optimisation. Measured on a 1,000,000-row probe in steady
 * state (1% of rows past the window, which is what a daily tick actually faces):
 *
 *   - `ctid IN (SELECT ctid … LIMIT 5000)`, `created_at` index → Bitmap Index Scan → Tid Scan,
 *     **17.8 ms**
 *   - `id IN (SELECT id … ORDER BY created_at LIMIT 5000)`, `created_at` index → **311.5 ms**,
 *     because the planner hashes the subselect and then sequentially scans all 1,005,000 rows
 *     to probe it (Hash Semi Join + full Seq Scan)
 *   - `ctid IN (…)` with no index → **395.7 ms**, a Seq Scan removing 1,000,000 rows by filter
 *
 * The `id IN` form is what a careful engineer reaches for first and it is the second-worst
 * option EVEN WITH the index. Do not simplify this back to it, and do not drop
 * `audit_log_created_at_idx`.
 *
 * The cutoff is computed SERVER-SIDE by Postgres from a bound day count — see the statement
 * below, which is the single source of truth for that expression. Never bind a JS `Date` into
 * a raw fragment instead: postgres.js throws
 * `ERR_INVALID_ARG_TYPE`, and the near-miss `${date}::timestamp` form lets Postgres resolve the
 * parameter to OID 1114 and the driver re-serialise through a `Date`, truncating microseconds
 * (T-36-37). `LIMIT` also cannot sit on the `DELETE` itself — it is invalid in Postgres — which
 * is the other reason the bound is expressed in the subselect.
 */
async function deleteBatch(days: number, limit: number): Promise<number> {
  const result = await db.execute(sql`
    DELETE FROM audit_log
    WHERE ctid IN (
      SELECT ctid FROM audit_log
      WHERE created_at < now() - make_interval(days => ${days})
      LIMIT ${limit}
    )
  `)

  return affectedRows(result)
}

/**
 * postgres.js returns a row list carrying `count`; `rowCount` is checked as well so a driver
 * swap degrades to "deleted nothing this batch" (which stops the loop) rather than to an
 * exception or, worse, an infinite-looking full-batch reading.
 */
function affectedRows(result: unknown): number {
  const row = result as { count?: unknown; rowCount?: unknown } | null

  if (row && typeof row.count === "number") return row.count
  if (row && typeof row.rowCount === "number") return row.rowCount

  return 0
}
