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

function applicableSources(entityType: EntityType): TimelineSource[] {
  return TIMELINE_SOURCES.filter((source) => source.appliesTo(entityType))
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
 */
export function buildTimelineQuery(
  entityType: EntityType,
  entityId: string,
  cursor: TimelineCursor | null,
  limit: number = TIMELINE_PAGE_SIZE
): SQL {
  const target: TimelineTarget = {
    entityType: assertEntityType(entityType),
    entityId,
  }
  const fetchLimit = limit + 1

  const branches = applicableSources(target.entityType).map((source) =>
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
}): Promise<TimelinePage> {
  const entityType = assertEntityType(params.entityType)
  const limit = params.limit ?? TIMELINE_PAGE_SIZE
  const cursor = decodeCursor(params.cursor)

  const query = buildTimelineQuery(entityType, params.entityId, cursor, limit)

  const [result, total] = await Promise.all([
    db.execute(query),
    countTimeline(entityType, params.entityId),
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
    applicableSources(entityType)
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
    total,
  }
}

/**
 * The header badge count: one `count(*)` per applicable source, summed. Measured
 * 0.480 ms with zero heap fetches (index-only where the index covers the predicate).
 */
export async function countTimeline(
  entityType: EntityType,
  entityId: string
): Promise<number> {
  const target: TimelineTarget = {
    entityType: assertEntityType(entityType),
    entityId,
  }

  const counts = await Promise.all(
    applicableSources(target.entityType).map(async (source) => {
      const result = (await db.execute(
        source.countBranch(target)
      )) as unknown as Record<string, unknown>[]
      return Number(result[0]?.count ?? 0)
    })
  )

  return counts.reduce((sum, count) => sum + count, 0)
}
