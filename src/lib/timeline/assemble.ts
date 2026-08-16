import { sql, type SQL } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import type { EntityType } from "@/db/schema/custom-fields"

import { decodeCursor, encodeCursor } from "./cursor"
import {
  TIMELINE_SOURCES,
  type TimelineSource,
  type TimelineTarget,
} from "./sources"
import {
  TIMELINE_PAGE_SIZE,
  type TimelineCursor,
  type TimelineEntry,
  type TimelinePage,
} from "./types"

/**
 * The record timeline assembler.
 *
 * ONE statement, three pre-limited branches for a deal and a single notes branch for
 * every other entity type, merged by Postgres rather than by JS. `buildTimelineQuery` is
 * PURE so the shape, the pre-limit and the parameter binding are all assertable without
 * a database.
 */

/**
 * SECURITY (T-35-01): entity_type reaches a SQL predicate, so it is validated against the
 * four literals BEFORE any fragment is composed. Everything else is a bind parameter.
 */
const entityTypeSchema = z.enum(["organization", "person", "deal", "activity"])

function assertEntityType(value: EntityType): EntityType {
  const parsed = entityTypeSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(`Unsupported timeline entity type: ${JSON.stringify(value)}`)
  }
  return parsed.data
}

/**
 * THE REGISTRY IS FILTERED ON TWO DIMENSIONS, NOT ONE.
 *
 * `appliesTo(entityType)` is the SOURCE's statement about where it makes sense — a stage
 * change is meaningless on a person. `includeAudit` is the CONSUMER's statement about what
 * they want to read, and it is the dimension Phase 35 did not have. The audit source applies
 * to all four entity types, so without a second dimension there would be no way to leave it
 * out, and leaving it out is the default (36-CONTEXT § Post-Research Addendum, measured: 15 of
 * the top 21 merged entries on a busy record would otherwise be audit rows).
 *
 * With the scope OFF the returned list is exactly Phase 35's, which is what keeps the default
 * statement byte-identical to the plan that phase measured — including the single-source case
 * for organization, person and activity, where `buildTimelineQuery` emits no `UNION ALL` at
 * all.
 */
function applicableSources(entityType: EntityType, includeAudit: boolean): TimelineSource[] {
  return TIMELINE_SOURCES.filter(
    (source) => source.appliesTo(entityType) && (source.kind !== "audit" || includeAudit)
  )
}

/** ids are UUIDs, but keying the hydration map by kind too makes a collision impossible. */
function entryKey(kind: string, id: string): string {
  return `${kind}:${id}`
}

/**
 * Compose the timeline statement WITHOUT executing it.
 *
 * @param limit the page size. Every branch and the outer clause are emitted at
 * `limit + 1` — the extra row is what derives `hasMore`, and it is discarded.
 * @param includeAudit whether the record's field-change history is part of this timeline.
 * DEFAULTS TO FALSE at every level of this module, so a caller that has not been taught about
 * the scope gets Phase 35's statement unchanged rather than an audit-dominated feed.
 */
export function buildTimelineQuery(
  entityType: EntityType,
  entityId: string,
  cursor: TimelineCursor | null,
  limit: number = TIMELINE_PAGE_SIZE,
  includeAudit: boolean = false
): SQL {
  const target: TimelineTarget = {
    entityType: assertEntityType(entityType),
    entityId,
  }
  const fetchLimit = limit + 1

  const branches = applicableSources(target.entityType, includeAudit).map((source) =>
    source.branch(target, cursor, fetchLimit)
  )

  // One applicable source means no union at all. A one-branch UNION ALL is a degenerate
  // union, not a simpler one.
  const body =
    branches.length === 1 ? branches[0] : sql.join(branches, sql` UNION ALL `)

  // `occurred_at_key` is carried through the outer SELECT unchanged and is NOT sorted on:
  // the sort belongs to the typed timestamp, the key exists only so the cursor can leave
  // this statement at the column's own precision instead of through a JS `Date` (see
  // `instantKey` in ./sources).
  return sql`SELECT kind, id, occurred_at, occurred_at_key FROM (${body}) AS t
    ORDER BY "occurred_at" DESC, "id" DESC
    LIMIT ${fetchLimit}`
}

/**
 * Read one page of the merged timeline.
 *
 * `cursor` is the ENCODED value the client sent back. `decodeCursor` returns `null` for
 * absent AND for malformed input, so a hostile cursor degrades to page 1 rather than to
 * a 500 (T-35-20).
 */
export async function assembleTimeline(params: {
  entityType: EntityType
  entityId: string
  cursor?: string | null
  limit?: number
  /** Off unless the caller asks. A cursor minted under one scope is never valid under the
   *  other — the keyset is applied PER BRANCH, so replaying an audit-off cursor with audit on
   *  would silently omit every audit entry newer than it. Toggling is a fresh page 1. */
  includeAudit?: boolean
}): Promise<TimelinePage> {
  const entityType = assertEntityType(params.entityType)
  const limit = params.limit ?? TIMELINE_PAGE_SIZE
  const cursor = decodeCursor(params.cursor)
  const includeAudit = params.includeAudit ?? false

  const query = buildTimelineQuery(entityType, params.entityId, cursor, limit, includeAudit)

  const [result, counts] = await Promise.all([
    db.execute(query),
    countTimeline(entityType, params.entityId, includeAudit),
  ])

  const rows = result as unknown as Record<string, unknown>[]
  const hasMore = rows.length > limit
  const kept = hasMore ? rows.slice(0, limit) : rows

  // The union's own order. Hydration must be merged back into THIS, not concatenated
  // per kind.
  const positions = kept.map((row) => ({
    kind: String(row.kind),
    id: String(row.id),
    // The full-precision text instant, straight from the statement. Never re-derived from
    // `row.occurred_at`, which the driver has already turned into a millisecond `Date`.
    instant: typeof row.occurred_at_key === "string" ? row.occurred_at_key : "",
  }))

  const idsByKind = new Map<string, string[]>()
  for (const position of positions) {
    const existing = idsByKind.get(position.kind)
    if (existing) existing.push(position.id)
    else idsByKind.set(position.kind, [position.id])
  }

  // One batched read per PRESENT kind — a page of notes issues no activity or
  // stage-history query at all.
  const hydrated = await Promise.all(
    applicableSources(entityType, includeAudit)
      .filter((source) => idsByKind.has(source.kind))
      .map((source) => source.hydrate(idsByKind.get(source.kind) ?? []))
  )

  const byKey = new Map<string, TimelineEntry>()
  for (const entry of hydrated.flat()) {
    byKey.set(entryKey(entry.kind, entry.id), entry)
  }

  const entries = positions
    .map((position) => byKey.get(entryKey(position.kind, position.id)))
    // Drops any position the hydration read did NOT return. That is what turns the
    // hydrate-side `deleted_at IS NULL` predicate (T-35-06, sources.ts) into a visible
    // behaviour: a row soft-deleted between the union and the hydration read comes back
    // from neither, so it is omitted rather than rendered as a hole. This filter is not
    // itself the soft-delete control — remove the predicate in `hydrate` and the row is
    // returned and rendered, with nothing here to catch it.
    .filter((entry): entry is TimelineEntry => entry !== undefined)

  const oldest = positions[positions.length - 1]

  return {
    entries,
    hasMore,
    // No key means no cursor. Emitting one built from a missing instant would produce a
    // value `decodeCursor` rejects, which silently restarts paging at page 1 — a stuck
    // "Load more" is a better failure than a repeating one.
    nextCursor:
      hasMore && oldest && oldest.instant
        ? encodeCursor({ instant: oldest.instant, id: oldest.id })
        : null,
    total: counts.total,
  }
}

/**
 * TWO NUMBERS, EACH WITH ONE FIXED MEANING, NEITHER EVER STALE.
 *
 * `total` counts what the list can ACTUALLY SHOW under the current scope, because it is the
 * number the card header renders directly above that list. It MUST move when the toggle
 * moves: a fixed "everything that ever happened" count would render `Timeline (59)` above a
 * list the reader exhausts at 12 by pressing Load more until it disappears — a defect the user
 * can see and cannot explain.
 *
 * `auditTotal` is the audit source's own count REGARDLESS of the scope, because the toggle's
 * own label reports it in both states ("Show field changes (47)") and because a record whose
 * only history is audit entries must not be told that nothing has happened.
 */
export interface TimelineCounts {
  total: number
  auditTotal: number
}

/**
 * The header badge count: one `count(*)` per applicable source. Measured 0.480 ms with zero
 * heap fetches (index-only where the index covers the predicate).
 *
 * ONE PASS FOR BOTH NUMBERS. Every count that either number needs is issued together, so the
 * audit count is never a second round trip taken after the total is already known. This does
 * mean the default scope now issues one more count than Phase 35 did — the audit one — and
 * that is deliberate: the toggle label needs it on every render, in both states, and reading
 * it lazily would be a second render pass that could disagree with the first.
 */
export async function countTimeline(
  entityType: EntityType,
  entityId: string,
  includeAudit: boolean = false
): Promise<TimelineCounts> {
  const target: TimelineTarget = {
    entityType: assertEntityType(entityType),
    entityId,
  }

  // Every source that could contribute to EITHER number: the scoped-in ones plus audit.
  // `auditSource.appliesTo` is true for all four entity types, so this is exactly the
  // scope-on list, and the scope is applied to the SUM below rather than to the queries.
  const counted = await Promise.all(
    applicableSources(target.entityType, true).map(async (source) => {
      const result = (await db.execute(
        source.countBranch(target)
      )) as unknown as Record<string, unknown>[]
      return { kind: source.kind, count: Number(result[0]?.count ?? 0) }
    })
  )

  const auditTotal = counted
    .filter((entry) => entry.kind === "audit")
    .reduce((sum, entry) => sum + entry.count, 0)

  const total = counted
    .filter((entry) => entry.kind !== "audit" || includeAudit)
    .reduce((sum, entry) => sum + entry.count, 0)

  return { total, auditTotal }
}
