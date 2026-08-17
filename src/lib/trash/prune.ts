/**
 * The trash retention pruner — TRASH-03's automatic half.
 *
 * Structure copied from `src/lib/audit/prune.ts:45-93`: a self-scheduling `setTimeout` chain
 * rather than a repeating timer, so a slow tick can never overlap the next one — the next one is
 * not scheduled until this one has finished.
 *
 * Purging on trash-page load was rejected as the trigger: a page-load hook cannot guarantee a
 * record ever leaves trash, because nobody is obliged to open the page.
 *
 * Started once on server boot via `instrumentation.ts`. The startup log line below is
 * LOAD-BEARING OPERATIONAL EVIDENCE, not decoration: Next.js standalone tracing has already
 * omitted `instrumentation.js` from this repo's production Docker image once (2026-08-08),
 * silently killing every processor while every unit test still passed. `Dockerfile:24` still ends
 * in a suppressed failure, so the absence of a `[trash-prune]` line in `docker compose logs app`
 * remains the only way that class of breakage is detected.
 */

import { sql } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"

import { db } from "@/db"
import { activities, deals, organizations, people } from "@/db/schema"
import type { EntityType } from "@/db/schema/custom-fields"
import { runWithActor } from "@/lib/audit/actor-context"
import { purgeRecordByType } from "@/lib/trash/dispatch"
import { TRASH_PRUNE_ORDER } from "@/lib/trash/entity-types"
import { readTrashRetentionDays } from "@/lib/trash/settings"

/** Let the server finish booting before the first tick — nothing here is time-critical. */
export const INITIAL_DELAY = 60_000

/**
 * Daily. Retention is a window measured in days, and the `trash.retention.windowHelp` copy the
 * admin reads already promises "once a day", so a tighter cadence would only add lock pressure
 * without changing when any record actually leaves.
 */
export const TICK_INTERVAL = 24 * 60 * 60 * 1000

/**
 * Deliberately far smaller than the audit pruner's 5,000.
 *
 * That module deletes from one table with one bulk statement. A trash purge is an ORDERED
 * MULTI-STATEMENT TEARDOWN inside its own transaction per row, so the per-record cost is orders
 * of magnitude higher and a 5,000-row batch would be a very long series of write transactions.
 *
 * WHAT THE TEARDOWN ACTUALLY COVERS, stated exhaustively so nobody has to infer it (an earlier
 * revision of this comment overstated it, which is how the gap below went unnoticed):
 *
 *   - the record's own row, and its `notes` rows (polymorphic, no foreign key, so explicit);
 *   - `deal_assignees` and `deal_stage_history`, for a deal only;
 *   - the foreign keys of LIVE children, nulled rather than cascaded: `activities.deal_id` for a
 *     deal, `deals.person_id` for a person, `deals.organization_id` AND `people.organization_id`
 *     for an organization (two statements — the widest teardown). An activity detaches nothing.
 *
 * Custom-field VALUES need no statement of their own: they live in the record's own `customFields`
 * JSONB column and go with the row.
 *
 * NOT COVERED — UPLOADED FILE BLOBS ARE NOT REMOVED. A file custom field stores its bytes under
 * `${UPLOAD_DIR}/${entityId}/${fieldName}/${storedName}` and is referenced only from that JSONB
 * column, so purging the row destroys the REFERENCE and leaves the BYTES on disk (or in S3). The
 * blob therefore survives a "permanent" delete and stays reachable to anyone holding its URL.
 * This is a known scope gap, deliberately not closed here: irreversible disk deletion inside the
 * most dangerous code path in the phase needs its own plan, and doing it wrong is unrecoverable.
 * Tracked as follow-up work — see `.planning/STATE.md`. Do not read the batch size below, or
 * anything else in this module, as evidence that blobs are handled.
 *
 * This is a TUNABLE and it has not been measured. It should be timed once against a seeded batch
 * of real records and adjusted; 200 is a conservative starting point chosen to keep one batch
 * well under a second of database work rather than from a measurement.
 */
export const BATCH_SIZE = 200

/**
 * ⇒ at most 5,000 records per entity type per day, ⇒ at most one bounded window of write locks.
 *
 * The cap is a denial-of-service control (T-37-06): it is what stops one tick from holding write
 * locks across all four CRM tables for an unbounded stretch. Its cost is STARVATION — if the
 * delete rate exceeds the cap, trash grows faster than it drains. That is accepted BECAUSE the
 * tick logs its total every time, so the shortfall is visible rather than silent.
 */
export const MAX_BATCHES_PER_TICK = 25

/**
 * Where each entity type's expired rows live.
 *
 * `Readonly<Record<EntityType, …>>` plus `satisfies`: a fifth entity type is a compile error here
 * rather than a table this pruner silently never visits. The columns are drizzle references, not
 * hand-written identifiers, so a renamed column follows automatically instead of becoming a
 * runtime SQL error inside a background timer where nobody is watching.
 */
interface ExpirySource {
  readonly table: PgTable
  readonly id: PgColumn
  readonly deletedAt: PgColumn
}

const EXPIRY_SOURCE: Readonly<Record<EntityType, ExpirySource>> = Object.freeze({
  deal: { table: deals, id: deals.id, deletedAt: deals.deletedAt },
  person: { table: people, id: people.id, deletedAt: people.deletedAt },
  organization: {
    table: organizations,
    id: organizations.id,
    deletedAt: organizations.deletedAt,
  },
  activity: { table: activities, id: activities.id, deletedAt: activities.deletedAt },
} satisfies Record<EntityType, ExpirySource>)

/** Every purge this module performs is attributed to this actor, explicitly. */
const SYSTEM_ACTOR = Object.freeze({ kind: "system", userId: null } as const)

/**
 * Start the daily trash retention pruner. Called exactly once, from `instrumentation.ts`.
 */
export function startTrashPruner(): void {
  console.log("[trash-prune] Starting with initial delay of 60s, ticking daily")
  scheduleTick(INITIAL_DELAY)
}

/**
 * Module-private on purpose: the chain owns its own cadence, and an exported version would let a
 * caller start a second, overlapping chain — two chains purging the same tables concurrently is
 * exactly the lock contention the batch cap exists to prevent.
 */
function scheduleTick(delay: number): void {
  setTimeout(async () => {
    try {
      const days = await readTrashRetentionDays()

      if (days === null) {
        // FAILS CLOSED — purge nothing at all, and issue no query at all. `null` is what an
        // unset, cleared, corrupted, out-of-range or pre-migration settings row produces, and
        // keeping a trashed record is always the recoverable direction while deleting it is not.
        //
        // There is deliberately no code-level day fallback here and none may ever be added: the
        // 30-day default is a SEEDED `app_settings` row from migration 0015, so a fallback would
        // turn a tampered row back into an unbounded permanent delete (T-37-05).
        console.log("[trash-prune] retention unset or invalid — nothing purged")
      } else {
        let total = 0

        // LEAVES FIRST, and fixed. An activity hangs off a deal, a deal off an organization and
        // a person, a person off an organization. Walking the types in this order is what stops
        // a parent being purged while a later pass is still detaching children from it. The
        // order is read from `TRASH_PRUNE_ORDER` — a literal array — rather than from
        // `Object.keys(EXPIRY_SOURCE)`, so a correctness property never depends on the
        // incidental order somebody typed an object literal in.
        for (const entityType of TRASH_PRUNE_ORDER) {
          total += await pruneEntityType(entityType, days)
        }

        // Logged EVERY tick, even at zero. This line is the only signal that the cap is starving
        // the delete rate, which is the accepted failure mode of bounding the work per tick.
        console.log(`[trash-prune] purged ${total} record(s) older than ${days}d`)
      }
    } catch (error) {
      console.error("[trash-prune] Tick error:", error)
    }

    // OUTSIDE the try. A pruner that stops rescheduling after one bad tick is a silently
    // disabled retention policy — precisely the failure mode of the setting it implements.
    scheduleTick(TICK_INTERVAL)
  }, delay)
}

/** Purge up to `MAX_BATCHES_PER_TICK` batches of one entity type; returns how many went. */
async function pruneEntityType(entityType: EntityType, days: number): Promise<number> {
  let purged = 0

  for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch++) {
    const ids = await selectExpiredIds(entityType, days)

    let purgedInBatch = 0

    for (const id of ids) {
      // Each record's teardown is wrapped on its own, so one undeletable row does not abort the
      // rest of the batch. The failing record is named by IDENTIFIER only — never by content.
      try {
        const result = await runWithActor(SYSTEM_ACTOR, () => purgeRecordByType(entityType, id))

        if (result.success) {
          purgedInBatch++
        } else {
          console.error(`[trash-prune] Refused to purge ${entityType} ${id}: ${result.error}`)
        }
      } catch (error) {
        console.error(`[trash-prune] Failed to purge ${entityType} ${id}:`, error)
      }
    }

    purged += purgedInBatch

    if (ids.length < BATCH_SIZE) {
      break // caught up — a short batch means nothing older is left in this table
    }

    if (purgedInBatch === 0) {
      // No progress. The next batch query is the same `LIMIT` over the same rows, so a
      // permanently undeletable record at the head would otherwise spin the full cap here and
      // starve every entity type after this one. Stop and let tomorrow's tick try again.
      console.error(
        `[trash-prune] a full batch of ${entityType} purged nothing — stopping this table for this tick`
      )
      break
    }
  }

  return purged
}

/**
 * One capped batch of ids whose record is past the retention window.
 *
 * The cutoff is computed SERVER-SIDE by Postgres from a bound day count. Never bind a JS `Date`
 * into a raw fragment instead: postgres.js throws `ERR_INVALID_ARG_TYPE`, and the near-miss
 * `${date}::timestamp` form lets Postgres resolve the parameter to a timestamp OID and the driver
 * re-serialise through a `Date`, truncating microseconds (T-37-18, STATE.md Phase 35).
 *
 * The audit pruner's physical-row-address subselect is NOT copied here, and copying it would be a
 * mistake rather than an optimisation: that form belongs to a single-statement bulk delete, and
 * this is a select feeding a per-row transactional teardown. `*_deleted_at_idx` (migration 0012)
 * serves this predicate directly.
 */
async function selectExpiredIds(entityType: EntityType, days: number): Promise<string[]> {
  const source = EXPIRY_SOURCE[entityType]

  const rows = await db.execute(sql`
    SELECT ${source.id} FROM ${source.table}
    WHERE ${source.deletedAt} < now() - make_interval(days => ${days})
    LIMIT ${BATCH_SIZE}
  `)

  return toIds(rows)
}

/**
 * postgres.js hands back a row list; a driver swap would hand back `{ rows }`. Anything else
 * still degrades to "found nothing this batch" — which stops the loop — rather than to an
 * exception inside a background timer, and a row without a string id is skipped rather than
 * passed to a purge as `undefined`.
 *
 * But the degradation is LOGGED, and that log line is the point. Returning `[]` silently makes a
 * tick whose driver shape changed emit `purged 0 record(s)` — byte-identical to a tick with an
 * empty trash — so a retention policy that has stopped running looks exactly like one with
 * nothing to do. This module's header exists because a silently non-running processor already
 * shipped in this repo once; an unrecognised shape here is that same failure one level deeper,
 * and it must announce itself.
 */
function toIds(result: unknown): string[] {
  const rows = Array.isArray(result)
    ? result
    : Array.isArray((result as { rows?: unknown })?.rows)
      ? ((result as { rows: unknown[] }).rows)
      : null

  if (rows === null) {
    // Shape only — never the value, which could carry record content into the log.
    console.error(
      "[trash-prune] unrecognised expiry-query result shape — purging nothing this batch; " +
        `expected an array or { rows: [] }, got ${result === null ? "null" : typeof result}`
    )
    return []
  }

  const ids: string[] = []

  for (const row of rows) {
    const id = (row as { id?: unknown } | null)?.id

    if (typeof id === "string") {
      ids.push(id)
    }
  }

  return ids
}
