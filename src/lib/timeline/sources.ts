import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "@/db"
import {
  activities,
  activityTypes,
  auditLog,
  customFieldDefinitions,
  dealStageHistory,
  deals,
  notes,
  organizations,
  people,
  stages,
  users,
  workflowRuns,
  workflows,
} from "@/db/schema"
import type { AuditChanges } from "@/db/schema/audit-log"
import type { EntityType, LookupConfig } from "@/db/schema/custom-fields"
import {
  CUSTOM_FIELD_PREFIX,
  buildAuditFieldChanges,
  type AuditReferenceColumn,
  type AuditResolution,
} from "@/lib/audit/present"

import type {
  ActivityTimelineEntry,
  AuditTimelineEntry,
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

// ---------------------------------------------------------------------------
// audit log — every entity type, and the only source the consumer can switch off
// ---------------------------------------------------------------------------

/** The four CRM entity types, as a runtime list. `audit_log` also stores a fifth. */
const CRM_ENTITY_TYPES: readonly EntityType[] = ["organization", "person", "deal", "activity"]

/**
 * `audit_log.entity_type` is `EntityType | "import_session"`. An import summary row carries a
 * SESSION id, not a record id, so it belongs to no record timeline. `assertEntityType`
 * (assemble.ts) already makes such a row unreachable through the union — the narrowing here is
 * for the hydrate's own signature, which takes ids and not a target, and it is written
 * explicitly rather than assumed.
 */
function isCrmEntityType(value: string): value is EntityType {
  return (CRM_ENTITY_TYPES as readonly string[]).includes(value)
}

/** The tables a stored reference id can point at. */
type ReferenceTable = "activityType" | "activity" | "deal" | "organization" | "person" | "stage" | "user"

/**
 * Which table each audited foreign key points at.
 *
 * `Record<AuditReferenceColumn, ...>` and NOT `Record<string, ...>`: `AuditReferenceColumn` is
 * derived from `AUDIT_REFERENCE_COLUMNS` in `@/lib/audit/present`, the very list that decides a
 * value is a reference at all. A column added there without a table here fails to compile,
 * instead of rendering "no longer available" for a reference the display layer knows is one.
 */
const REFERENCE_TABLES: Record<AuditReferenceColumn, ReferenceTable> = {
  stageId: "stage",
  organizationId: "organization",
  personId: "person",
  dealId: "deal",
  ownerId: "user",
  assigneeId: "user",
  typeId: "activityType",
}

/** A custom `lookup` field stores an id of its configured target entity. */
const LOOKUP_TABLES: Record<EntityType, ReferenceTable> = {
  organization: "organization",
  person: "person",
  deal: "deal",
  activity: "activity",
}

/** One custom field definition, reduced to what the display layer asks for. */
interface DefinitionInfo {
  id: string
  name: string
  type: string
  position: number
  /** Set only for `lookup`, and only when its config names a target entity. */
  lookupTable: ReferenceTable | null
}

/**
 * The display label for one referenced row.
 *
 * NO SOFT-DELETE PREDICATE, and that is deliberate — the same posture
 * `readRunChangedRecords` takes (src/lib/audit/linked-records.ts:82-91). A `deleted_at is null`
 * filter here would turn "the owner you set this to, who has since left" into "no longer
 * available", which is a worse answer than the truth: the audit row records what the field was
 * set to, and the row's later fate does not change what happened.
 */
async function readReferenceLabels(
  table: ReferenceTable,
  ids: string[]
): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  const keep = (id: string, label: string | null) => {
    const trimmed = (label ?? "").trim()
    if (trimmed.length > 0) labels.set(id, trimmed)
  }

  switch (table) {
    case "user": {
      const rows = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, ids))
      // A user with no display name is shown by email — the same fallback the audit entry's
      // own actor line uses, so one person reads the same way in both places.
      for (const row of rows) keep(row.id, row.name ?? row.email)
      break
    }
    case "stage": {
      const rows = await db
        .select({ id: stages.id, name: stages.name })
        .from(stages)
        .where(inArray(stages.id, ids))
      for (const row of rows) keep(row.id, row.name)
      break
    }
    case "organization": {
      const rows = await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(inArray(organizations.id, ids))
      for (const row of rows) keep(row.id, row.name)
      break
    }
    case "person": {
      // No single title column; `${firstName} ${lastName}` is the display name the rest of the
      // product uses (fetch-entities.ts:48-52). Not a new rule.
      const rows = await db
        .select({ id: people.id, firstName: people.firstName, lastName: people.lastName })
        .from(people)
        .where(inArray(people.id, ids))
      for (const row of rows) keep(row.id, `${row.firstName} ${row.lastName}`)
      break
    }
    case "deal": {
      const rows = await db
        .select({ id: deals.id, title: deals.title })
        .from(deals)
        .where(inArray(deals.id, ids))
      for (const row of rows) keep(row.id, row.title)
      break
    }
    case "activity": {
      const rows = await db
        .select({ id: activities.id, title: activities.title })
        .from(activities)
        .where(inArray(activities.id, ids))
      for (const row of rows) keep(row.id, row.title)
      break
    }
    case "activityType": {
      const rows = await db
        .select({ id: activityTypes.id, name: activityTypes.name })
        .from(activityTypes)
        .where(inArray(activityTypes.id, ids))
      for (const row of rows) keep(row.id, row.name)
      break
    }
  }

  return labels
}

/** The subset of an audit row the resolution is built from. */
interface AuditChangeSource {
  entityType: EntityType
  changes: AuditChanges | null
}

/**
 * Read the custom field definitions for every entity type present in this page.
 *
 * ONE query for the whole page, and none at all when the page holds no custom field change.
 * `deleted_at is null` matches how every other reader of this table is written
 * (deals/[id]/page.tsx:73-77, admin/fields/actions.ts:29-33); a definition deleted after the
 * entry was written falls through to `present.ts`'s documented path, which labels the change
 * with the name the key itself carries rather than dropping it.
 */
async function readDefinitions(entityTypes: EntityType[]): Promise<DefinitionInfo[]> {
  const rows = await db
    .select({
      id: customFieldDefinitions.id,
      name: customFieldDefinitions.name,
      type: customFieldDefinitions.type,
      position: customFieldDefinitions.position,
      config: customFieldDefinitions.config,
    })
    .from(customFieldDefinitions)
    .where(
      and(
        inArray(customFieldDefinitions.entityType, entityTypes),
        isNull(customFieldDefinitions.deletedAt)
      )
    )

  return rows.map((row): DefinitionInfo => {
    const target =
      row.type === "lookup" ? (row.config as LookupConfig | null)?.targetEntity : undefined

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      // `position` is `numeric`, which the driver hands back as a string.
      position: Number.parseFloat(row.position),
      lookupTable: target === undefined ? null : LOOKUP_TABLES[target],
    }
  })
}

/**
 * Everything `buildAuditFieldChanges` would otherwise need a query for, for a WHOLE page.
 *
 * BATCHED, NOT LOOPED (T-36-38). A page is 20 entries and this runs inside the record detail
 * page's own render, so a per-entry resolution would be dozens of sequential round trips on a
 * server-rendered path. The cost is fixed instead: one definitions read (skipped when the page
 * changed no custom field) plus one read per REFERENCED TABLE, issued concurrently — at most
 * seven, typically zero or one.
 */
async function buildAuditResolution(rows: AuditChangeSource[]): Promise<AuditResolution> {
  const resolution: AuditResolution = {
    references: new Map(),
    customFieldNames: new Map(),
    customFieldTypes: new Map(),
    customFieldPositions: new Map(),
  }

  const hasCustomChange = rows.some((row) =>
    Object.keys(row.changes ?? {}).some((key) => key.startsWith(CUSTOM_FIELD_PREFIX))
  )

  const definitionByName = new Map<string, DefinitionInfo>()

  if (hasCustomChange) {
    const entityTypes = [...new Set(rows.map((row) => row.entityType))]

    for (const definition of await readDefinitions(entityTypes)) {
      resolution.customFieldNames.set(definition.id, definition.name)
      resolution.customFieldTypes.set(definition.id, definition.type)
      resolution.customFieldPositions.set(definition.id, definition.position)
      // Every id in one hydrated page belongs to ONE record and therefore to one entity type
      // (the union branch filters on `(entity_type, entity_id)`), so keying by name alone
      // cannot collide across entity types in practice. `present.ts` reverse-looks-up by name
      // for the same reason.
      definitionByName.set(definition.name, definition)
    }
  }

  /** Which table this change key's stored ids point at, or null when they are not ids. */
  const tableFor = (changeKey: string): ReferenceTable | null => {
    if (changeKey.startsWith(CUSTOM_FIELD_PREFIX)) {
      const definition = definitionByName.get(changeKey.slice(CUSTOM_FIELD_PREFIX.length))
      return definition?.lookupTable ?? null
    }

    return (REFERENCE_TABLES as Record<string, ReferenceTable | undefined>)[changeKey] ?? null
  }

  // `${changeKey}:${id}` is the key `present.ts` looks references up by, so a native `ownerId`
  // and a custom lookup are resolved through one code path.
  const pending = new Map<ReferenceTable, Set<string>>()
  const wanted: { key: string; table: ReferenceTable; id: string }[] = []

  for (const row of rows) {
    for (const [changeKey, stored] of Object.entries(row.changes ?? {})) {
      const table = tableFor(changeKey)
      if (table === null) continue

      for (const value of [stored?.from, stored?.to]) {
        if (typeof value !== "string" || value === "") continue

        wanted.push({ key: `${changeKey}:${value}`, table, id: value })
        const ids = pending.get(table)
        if (ids) ids.add(value)
        else pending.set(table, new Set([value]))
      }
    }
  }

  const resolved = await Promise.all(
    [...pending].map(async ([table, ids]): Promise<[ReferenceTable, Map<string, string>]> => [
      table,
      await readReferenceLabels(table, [...ids]),
    ])
  )

  const labelsByTable = new Map(resolved)

  for (const { key, table, id } of wanted) {
    // An id whose row is gone maps to null, which the renderer prints as "no longer
    // available". The id itself is never shown (T-36-22).
    resolution.references.set(key, labelsByTable.get(table)?.get(id) ?? null)
  }

  return resolution
}

export const auditSource: TimelineSource = {
  kind: "audit",

  // TRUE FOR ALL FOUR ENTITY TYPES, and that is what makes an organization, person or
  // activity timeline a union for the first time: with the scope on, `assemble.test.ts`'s
  // "no UNION ALL for organization, person and activity" assertion is falsified in KIND, not
  // in degree. It still holds with the scope off, which is why that assertion is scoped by the
  // flag rather than deleted.
  appliesTo: () => true,

  branch({ entityType, entityId }, cursor, limit) {
    const keyset = cursor
      ? sql` AND (al.created_at, al.id) < (${bindInstant(cursor.instant)}, ${cursor.id})`
      : sql``

    // No soft-delete predicate here, and that is NOT an omission: `audit_log` has no
    // `deleted_at` column at all, because audit rows are immutable append-only facts — exactly
    // like `deal_stage_history` above (audit-log.ts:58-64). The only supported deletion is the
    // retention pruner. This is why the `deleted_at is null` count assertion stays at 2 with
    // the audit branch present.
    //
    // The predicate and the ordering are the shape `audit_log_entity_idx`
    // (entity_type, entity_id, created_at DESC) was declared for.
    return sql`(
      SELECT 'audit' AS kind, al.id, al.created_at AS occurred_at,
             ${instantKey(sql`al.created_at`)}
      FROM ${auditLog} al
      WHERE al.entity_type = ${entityType}
        AND al.entity_id = ${entityId}${keyset}
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT ${limit}
    )`
  },

  countBranch({ entityType, entityId }) {
    return sql`
      SELECT count(*)::int AS count
      FROM ${auditLog} al
      WHERE al.entity_type = ${entityType}
        AND al.entity_id = ${entityId}
    `
  },

  async hydrate(ids) {
    if (ids.length === 0) return []

    const rows = await db
      .select({
        id: auditLog.id,
        entityType: auditLog.entityType,
        action: auditLog.action,
        changes: auditLog.changes,
        actorKind: auditLog.actorKind,
        createdAt: auditLog.createdAt,
        actorId: users.id,
        actorName: users.name,
        actorEmail: users.email,
        runId: workflowRuns.id,
        workflowId: workflows.id,
        workflowName: workflows.name,
      })
      .from(auditLog)
      // All three actor references are nullable and mutually exclusive in practice, so every
      // join is a LEFT join and at most one of them matches per row.
      .leftJoin(users, eq(auditLog.actorUserId, users.id))
      .leftJoin(workflowRuns, eq(auditLog.workflowRunId, workflowRuns.id))
      // One hop further than the run: the entry links to the RUN page, which is addressed by
      // `/workflows/{workflowId}/runs/{runId}`, so the run alone cannot build the href.
      .leftJoin(workflows, eq(workflowRuns.workflowId, workflows.id))
      // No soft-delete predicate: `audit_log` has no such column (see `branch` above).
      .where(inArray(auditLog.id, ids))

    const entries = rows.filter((row) => isCrmEntityType(row.entityType))

    const resolution = await buildAuditResolution(
      entries.map((row) => ({
        // Narrowed by the filter above; TypeScript cannot carry that through `.filter`.
        entityType: row.entityType as EntityType,
        changes: row.changes,
      }))
    )

    return entries.map((row): AuditTimelineEntry => {
      const entityType = row.entityType as EntityType

      return {
        kind: "audit",
        id: row.id,
        occurredAt: row.createdAt,
        action: row.action,
        entityType,
        actorKind: row.actorKind,
        // The guard shape the stage-change hydrate uses: a null actor renders as "Unknown
        // user". The `actorKind` test in front of it is what stops an `api_key` row — which
        // stores the KEY OWNER in `actor_user_id` — from being attributed to that person as
        // though they had made the change themselves.
        actor:
          row.actorKind === "user" && row.actorId !== null && row.actorEmail !== null
            ? { id: row.actorId, name: row.actorName, email: row.actorEmail }
            : null,
        // Populated only when the workflow STILL EXISTS. A deleted workflow renders as the
        // plain kind label with no link — never a link that leads nowhere.
        workflowRun:
          row.actorKind === "workflow_run" &&
          row.runId !== null &&
          row.workflowId !== null &&
          row.workflowName !== null
            ? { runId: row.runId, workflowId: row.workflowId, workflowName: row.workflowName }
            : null,
        // ALWAYS NULL, AND HONESTLY SO. `audit_log` carries no api key reference — it has
        // `actor_user_id`, `workflow_run_id` and `import_session_id` and nothing else
        // (audit-log.ts:53-55), and the subscriber stores the key's OWNER in `actor_user_id`
        // for this kind. Resolving a name through that owner would pick an arbitrary one of
        // that user's keys and print it as fact, which is precisely the confidently-wrong
        // attribution this phase refuses to make. The renderer already degrades a null to the
        // "API key" kind label. Recording a key id on the audit row is a schema change and
        // belongs to whichever plan is willing to make it.
        apiKeyName: null,
        changes: buildAuditFieldChanges(entityType, row.action, row.changes ?? {}, resolution),
      }
    })
  },
}

/**
 * The registry.
 *
 * Phase 35 predicted that Phase 36's audit log would be a fourth entry here "and nothing else
 * in the assembler changes". The fourth entry landed; the second half of that prediction did
 * not, and it is rewritten rather than left standing. This array is now filtered on TWO
 * dimensions: `appliesTo(entityType)`, which is each source's own statement about where it
 * makes sense, and a CONSUMER-SUPPLIED scope (`includeAudit`, assemble.ts), which is the
 * reader's statement about what they want to see. The audit source needed the second dimension
 * because it applies to every entity type and is nonetheless off by default, so `appliesTo`
 * alone could never leave it out.
 *
 * Everything else the prediction named still holds: the union, the pre-limit, the keyset
 * predicate and the hydration loop are all driven off this list.
 */
export const TIMELINE_SOURCES: TimelineSource[] = [
  notesSource,
  activitiesSource,
  stageChangeSource,
  auditSource,
]
