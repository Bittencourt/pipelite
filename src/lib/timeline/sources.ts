import { eq, inArray, sql, type SQL } from "drizzle-orm"
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
 * Bind the cursor's instant as an ISO-8601 STRING cast back to `timestamp`, never as a
 * JS `Date`.
 *
 * The postgres.js driver serializes bind parameters itself and rejects a `Date` handed to
 * a raw `sql` fragment outright:
 *
 *   TypeError: The "string" argument must be of type string or an instance of Buffer or
 *   ArrayBuffer. Received an instance of Date
 *
 * Drizzle converts `Date` automatically when the parameter is attached to a typed column,
 * which is why every other query in this repo can pass one. These branches are hand-composed
 * SQL, so the conversion has to be explicit here.
 *
 * This failed ONLY on page two and later — page one has no cursor to bind — and the suite
 * mocks `@/db`, asserting the rendered SQL string rather than executing it, so no unit test
 * could observe it. `assemble.test.ts` now asserts that no bound parameter is a `Date`,
 * which is the part of this that a mocked driver CAN see.
 *
 * The columns are `timestamp` (no time zone). `toISOString()` renders the same wall clock
 * the driver read, with a `Z` that `::timestamp` discards, so the value round-trips exactly.
 */
function bindInstant(instant: Date): SQL {
  return sql`${instant.toISOString()}::timestamp`
}

/** The record whose timeline is being read. */
export interface TimelineTarget {
  entityType: EntityType
  entityId: string
}

export interface TimelineSource {
  kind: TimelineEntryKind
  appliesTo(entityType: EntityType): boolean
  /** ONE pre-limited SELECT emitting exactly (kind, id, occurred_at). Never NULL-padded. */
  branch(target: TimelineTarget, cursor: TimelineCursor | null, limit: number): SQL
  /** count(*) for the header badge. */
  countBranch(target: TimelineTarget): SQL
  /** Two-step hydration: one batched typed read of the display columns for the given ids. */
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
      ? sql` AND (n.created_at, n.id) < (${bindInstant(cursor.occurredAt)}, ${cursor.id})`
      : sql``

    return sql`(
      SELECT 'note' AS kind, n.id, n.created_at AS occurred_at
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
      .where(inArray(notes.id, ids))

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
      ? sql` AND (a.created_at, a.id) < (${bindInstant(cursor.occurredAt)}, ${cursor.id})`
      : sql``

    // created_at, NOT due_date: a history feed ordered by a FUTURE due date reads wrong.
    // created_at is the honest "when it happened".
    return sql`(
      SELECT 'activity' AS kind, a.id, a.created_at AS occurred_at
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
      .where(inArray(activities.id, ids))

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
      ? sql` AND (h.created_at, h.id) < (${bindInstant(cursor.occurredAt)}, ${cursor.id})`
      : sql``

    // No soft-delete predicate here, and that is not an omission: deal_stage_history has
    // no deleted_at column because history rows are immutable append-only facts.
    return sql`(
      SELECT 'stage_change' AS kind, h.id, h.created_at AS occurred_at
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
