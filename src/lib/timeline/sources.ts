import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "@/db"
import {
  activities,
  activityTypes,
  dealStageHistory,
  notes,
  stages,
  users,
} from "@/db/schema"
import type { EntityType } from "@/db/schema/custom-fields"

import type {
  ActivityTimelineEntry,
  NoteTimelineEntry,
  StageChangeTimelineEntry,
  TimelineCursor,
  TimelineEntry,
  TimelineEntryKind,
} from "./types"

/**
 * The pluggable timeline sources.
 *
 * The seam is at the SQL-FRAGMENT level, deliberately. A "run one query per source and
 * merge them in JS" seam would make the pre-limited `UNION ALL` impossible, and the
 * pre-limit is the entire measured optimisation (Merge Append over three branches that
 * each stop after n+1 rows: 1.0 ms warm, versus materialising the record's whole
 * history — T-35-26).
 *
 * SECURITY (T-35-01 / T-35-02): this is the only place in the phase where SQL is hand
 * composed. Table and column identifiers are written literally; EVERY value —
 * `entityType`, `entityId`, both cursor components and the limit — is a `${}` bind
 * parameter inside a drizzle `sql` template. No value is ever concatenated into the
 * statement text. `decodeCursor` validates its input but does not sanitise it, so
 * binding is the only control that actually closes the hole.
 */

/**
 * THE KEYSET INSTANT NEVER TOUCHES A JS `Date`, IN EITHER DIRECTION.
 *
 * Outbound, each branch renders its `created_at` with
 * `to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` as `occurred_at_key`, and that TEXT is
 * what the assembler puts in the cursor. Inbound, the cursor's text is bound and cast
 * straight back with `::timestamp`. Two reasons, both of which have already bitten this
 * module:
 *
 *   1. PRECISION. These columns default to `now()`, which yields microseconds
 *      (`21:33:08.478940` on the live database). A `Date` is millisecond-only, so a
 *      `Date` on this path emits `...478Z` — a bound strictly LESS than the cursor row's
 *      real instant, which makes the `(created_at, id)` comparison skip the `id`
 *      tiebreaker and silently drop every entry inside that millisecond from every
 *      subsequent page. On an audit surface, omitting history is the worst failure
 *      available.
 *   2. THE DRIVER. postgres.js serializes bind parameters itself and rejects a `Date`
 *      handed to a raw `sql` fragment outright — `TypeError: The "string" argument must
 *      be of type string ... Received an instance of Date`. Drizzle converts a `Date`
 *      automatically only when the parameter is attached to a typed column; these
 *      branches are hand-composed SQL, so nothing does that conversion. That shipped
 *      broken once: page one worked and every "Load more" threw.
 *
 * It also removes a `TZ` dependency. postgres.js parses OID 1114 with `new Date(x)`,
 * which V8 reads as LOCAL time, so a `Date`-based bound skewed by the process offset —
 * three hours under `TZ=America/Sao_Paulo`, which for positive offsets skips history
 * outright. `to_char` and `::timestamp` are both evaluated by Postgres against a column
 * that carries no time zone, so the wall clock is the wall clock regardless of `TZ`.
 *
 * The format string below is the ONE literal in this module that is not a `${}` bind, and
 * it is not a value: it is a compile-time constant that no request input can reach, it is
 * written exactly once here rather than at each of the three branches, and keeping it out
 * of the parameter list leaves `to_char`'s overload resolution unambiguous. `.US` always
 * emits six digits, so the rendering is fixed-width and therefore sorts lexicographically
 * exactly like the timestamp it renders.
 *
 * The suite mocks `@/db` and asserts the rendered SQL and its bound parameters, which is
 * precisely the part of all of this a mocked driver CAN see: no bound value is a `Date`,
 * and a microsecond instant survives encode -> decode -> bind byte for byte.
 *
 * @param column the branch's `created_at` reference, e.g. sql`n.created_at`.
 */
function instantKey(column: SQL): SQL {
  return sql`to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at_key`
}

/**
 * The cursor's own text instant, cast back to the column's type for the comparison.
 *
 * THE `::text` IN THE MIDDLE IS LOAD-BEARING. DO NOT "SIMPLIFY" IT TO `::timestamp`.
 *
 * A bare `$1::timestamp` lets Postgres resolve the otherwise-unspecified parameter's type
 * to `timestamp`, and postgres.js then serializes the value for that OID with
 * `(x instanceof Date ? x : new Date(x)).toISOString()`
 * (node_modules/postgres/src/types.js, `types.date.serialize`) — so the driver builds a JS
 * `Date` out of our string and truncates the microseconds right back off, on the wire,
 * after this module has done everything correctly. Measured against the live database:
 *
 *   SELECT $1::text            -> 2026-08-15T21:33:08.478005Z   (intact)
 *   SELECT $1::timestamp::text -> 2026-08-15 21:33:08.478       (driver truncated it)
 *   SELECT $1::text::timestamp -> 2026-08-15 21:33:08.478005    (intact)
 *
 * `::text` pins the parameter to OID 25, whose serializer is `'' + x`, and the
 * text -> timestamp cast then happens server-side where full precision survives. The
 * comparison still reads as a plain constant to the planner, so `notes_live_idx` is used
 * exactly as before (verified with EXPLAIN: the row comparison is pushed down to an
 * `Index Cond` on `created_at`).
 */
function bindInstant(instant: string): SQL {
  return sql`${instant}::text::timestamp`
}

/** The record whose timeline is being read. */
export interface TimelineTarget {
  entityType: EntityType
  entityId: string
}

export interface TimelineSource {
  kind: TimelineEntryKind
  appliesTo(entityType: EntityType): boolean
  /**
   * ONE pre-limited SELECT emitting exactly
   * (kind, id, occurred_at, occurred_at_key). Never NULL-padded.
   *
   * `occurred_at` is the timestamp the union sorts on; `occurred_at_key` is the SAME
   * instant rendered as full-precision text and is the only thing the cursor carries —
   * see `instantKey` above for why the two are not interchangeable.
   */
  branch(target: TimelineTarget, cursor: TimelineCursor | null, limit: number): SQL
  /** count(*) for the header badge. */
  countBranch(target: TimelineTarget): SQL
  /**
   * Two-step hydration: one batched typed read of the display columns for the given ids.
   *
   * A hydrate read is a READ PATH in its own right, not a private continuation of
   * `branch`. It is called directly from outside the assembler (the note server action
   * rehydrates a freshly written row through it), so it carries the soft-delete predicate
   * itself rather than inheriting one from the union — `notes_live_idx` is partial on that
   * predicate but an index encodes a filter, it does not enforce one (T-35-06). Returning
   * fewer rows than ids is therefore normal and the assembler drops the difference.
   */
  hydrate(ids: string[]): Promise<TimelineEntry[]>
}

// ---------------------------------------------------------------------------
// notes — the only source that applies to all four entity types
// ---------------------------------------------------------------------------

export const notesSource: TimelineSource = {
  kind: "note",

  appliesTo: () => true,

  branch({ entityType, entityId }, cursor, limit) {
    // Keyset rather than OFFSET (T-35-27): a concurrently inserted note has
    // created_at = now(), strictly newer than any cursor, so it can neither land inside
    // an already-fetched window nor push an unfetched entry past one.
    const keyset = cursor
      ? sql` AND (n.created_at, n.id) < (${bindInstant(cursor.instant)}, ${cursor.id})`
      : sql``

    return sql`(
      SELECT 'note' AS kind, n.id, n.created_at AS occurred_at,
             ${instantKey(sql`n.created_at`)}
      FROM ${notes} n
      WHERE n.entity_type = ${entityType}
        AND n.entity_id = ${entityId}
        AND n.deleted_at IS NULL${keyset}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ${limit}
    )`
  },

  countBranch({ entityType, entityId }) {
    return sql`
      SELECT count(*)::int AS count
      FROM ${notes} n
      WHERE n.entity_type = ${entityType}
        AND n.entity_id = ${entityId}
        AND n.deleted_at IS NULL
    `
  },

  async hydrate(ids) {
    if (ids.length === 0) return []

    const rows = await db
      .select({
        id: notes.id,
        content: notes.content,
        source: notes.source,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
        authorId: users.id,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(notes)
      .leftJoin(users, eq(notes.authorId, users.id))
      // T-35-06. Not redundant with the union's predicate: the union and this read are two
      // separate statements, so a note soft-deleted between them would otherwise be
      // hydrated and rendered. This is also the only predicate protecting the direct
      // callers of `notesSource.hydrate` outside the assembler.
      .where(and(inArray(notes.id, ids), isNull(notes.deletedAt)))

    return rows.map(
      (row): NoteTimelineEntry => ({
        kind: "note",
        id: row.id,
        occurredAt: row.createdAt,
        content: row.content,
        source: row.source,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        // A migrated note whose source record had no owner renders as "Unknown".
        author:
          row.authorId !== null && row.authorEmail !== null
            ? { id: row.authorId, name: row.authorName, email: row.authorEmail }
            : null,
      })
    )
  },
}

// ---------------------------------------------------------------------------
// activities — deals only
// ---------------------------------------------------------------------------

export const activitiesSource: TimelineSource = {
  kind: "activity",

  appliesTo: (entityType) => entityType === "deal",

  branch({ entityId }, cursor, limit) {
    const keyset = cursor
      ? sql` AND (a.created_at, a.id) < (${bindInstant(cursor.instant)}, ${cursor.id})`
      : sql``

    // created_at, NOT due_date: a history feed ordered by a FUTURE due date reads wrong.
    // created_at is the honest "when it happened".
    return sql`(
      SELECT 'activity' AS kind, a.id, a.created_at AS occurred_at,
             ${instantKey(sql`a.created_at`)}
      FROM ${activities} a
      WHERE a.deal_id = ${entityId}
        AND a.deleted_at IS NULL${keyset}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ${limit}
    )`
  },

  countBranch({ entityId }) {
    return sql`
      SELECT count(*)::int AS count
      FROM ${activities} a
      WHERE a.deal_id = ${entityId}
        AND a.deleted_at IS NULL
    `
  },

  async hydrate(ids) {
    if (ids.length === 0) return []

    const rows = await db
      .select({
        id: activities.id,
        title: activities.title,
        typeName: activityTypes.name,
        dueDate: activities.dueDate,
        completedAt: activities.completedAt,
        createdAt: activities.createdAt,
      })
      .from(activities)
      .leftJoin(activityTypes, eq(activities.typeId, activityTypes.id))
      // Same control as the notes hydration above (T-35-06).
      .where(and(inArray(activities.id, ids), isNull(activities.deletedAt)))

    return rows.map(
      (row): ActivityTimelineEntry => ({
        kind: "activity",
        id: row.id,
        occurredAt: row.createdAt,
        title: row.title,
        typeName: row.typeName,
        dueDate: row.dueDate,
        completedAt: row.completedAt,
      })
    )
  },
}

// ---------------------------------------------------------------------------
// deal stage history — deals only
// ---------------------------------------------------------------------------

export const stageChangeSource: TimelineSource = {
  kind: "stage_change",

  appliesTo: (entityType) => entityType === "deal",

  branch({ entityId }, cursor, limit) {
    const keyset = cursor
      ? sql` AND (h.created_at, h.id) < (${bindInstant(cursor.instant)}, ${cursor.id})`
      : sql``

    // No soft-delete predicate here, and that is not an omission: deal_stage_history has
    // no deleted_at column because history rows are immutable append-only facts.
    return sql`(
      SELECT 'stage_change' AS kind, h.id, h.created_at AS occurred_at,
             ${instantKey(sql`h.created_at`)}
      FROM ${dealStageHistory} h
      WHERE h.deal_id = ${entityId}${keyset}
      ORDER BY h.created_at DESC, h.id DESC
      LIMIT ${limit}
    )`
  },

  countBranch({ entityId }) {
    return sql`
      SELECT count(*)::int AS count
      FROM ${dealStageHistory} h
      WHERE h.deal_id = ${entityId}
    `
  },

  async hydrate(ids) {
    if (ids.length === 0) return []

    const fromStage = alias(stages, "from_stage")
    const toStage = alias(stages, "to_stage")

    const rows = await db
      .select({
        id: dealStageHistory.id,
        createdAt: dealStageHistory.createdAt,
        fromStageName: fromStage.name,
        fromStageColor: fromStage.color,
        toStageName: toStage.name,
        toStageColor: toStage.color,
        actorId: users.id,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(dealStageHistory)
      // from_stage_id is nullable — a deal created directly into a stage has no origin.
      .leftJoin(fromStage, eq(dealStageHistory.fromStageId, fromStage.id))
      .leftJoin(toStage, eq(dealStageHistory.toStageId, toStage.id))
      .leftJoin(users, eq(dealStageHistory.changedBy, users.id))
      .where(inArray(dealStageHistory.id, ids))

    return rows.map(
      (row): StageChangeTimelineEntry => ({
        kind: "stage_change",
        id: row.id,
        occurredAt: row.createdAt,
        fromStageName: row.fromStageName,
        fromStageColor: row.fromStageColor,
        // to_stage_id is NOT NULL with a real foreign key, so the join always matches.
        toStageName: row.toStageName ?? "",
        toStageColor: row.toStageColor ?? "",
        actor:
          row.actorId !== null && row.actorEmail !== null
            ? { id: row.actorId, name: row.actorName, email: row.actorEmail }
            : null,
      })
    )
  },
}

/**
 * The registry. Phase 36's audit log becomes a FOURTH entry in this array and nothing
 * else in the assembler changes — the union, the pre-limit, the keyset predicate and the
 * hydration loop are all driven off this list.
 */
export const TIMELINE_SOURCES: TimelineSource[] = [
  notesSource,
  activitiesSource,
  stageChangeSource,
]
