/**
 * The timeline entry contract every downstream plan in phase 35 renders against.
 *
 * This module is deliberately pure: no `db` import, no query, no runtime logic beyond
 * the single page-size constant. Plans 35-08 (assembler), 35-09 (server action),
 * 35-11/35-12 (rendering) and 35-13 all compile against these types, so a change here
 * is a compile-time break everywhere rather than a runtime surprise.
 */

/** 20 entries per page, then a "Load more" affordance (D-07). */
export const TIMELINE_PAGE_SIZE = 20

/**
 * Phase 36 appends 'audit' here and one file to the assembler's source array —
 * nothing else in the union changes.
 */
export type TimelineEntryKind = 'note' | 'activity' | 'stage_change'

/**
 * The keyset paging position: the (instant, id) pair of the OLDEST entry already
 * returned. `id` breaks ties when two entries carry the BIT-IDENTICAL instant. Never sent
 * to the browser in this shape — see `encodeCursor` in ./cursor.
 *
 * `instant` IS A STRING AND MUST NEVER BECOME A `Date`.
 * The three `created_at` columns are `timestamp` and default to `now()`, which yields
 * MICROSECONDS (`2026-08-15 21:33:08.478940`). A JS `Date` holds milliseconds, so putting
 * one anywhere on this round trip truncates `.478940` to `.478`. The truncated bound is
 * strictly LESS than the cursor row's real instant, so `(created_at, id) < (bound, id)`
 * never reaches the `id` tiebreaker and every entry inside that millisecond is excluded
 * from the next page — permanently, because the same cursor is what the next "Load more"
 * sends. Postgres renders this value with `to_char` and Postgres parses it back with
 * `::timestamp`; no JS date parsing sits in between, which is also what keeps the bound
 * independent of the Node process's `TZ`.
 *
 * Format: `YYYY-MM-DDTHH:MM:SS.ffffffZ`. Fixed width, so it sorts lexicographically
 * exactly as the timestamp it renders. The trailing `Z` is an ISO-8601 shape marker that
 * `::timestamp` discards — these columns carry no time zone and this value is a wall
 * clock, not an instant in UTC.
 */
export interface TimelineCursor {
  instant: string
  id: string
}

interface TimelineEntryBase {
  id: string
  /** The single field the merged timeline sorts on, descending. */
  occurredAt: Date
}

export interface NoteTimelineEntry extends TimelineEntryBase {
  kind: 'note'
  content: string
  source: 'user' | 'migration'
  createdAt: Date
  /** `> createdAt` drives the "edited" marker. */
  updatedAt: Date
  /** null → rendered as "Unknown" (a migrated note whose source record had no owner). */
  author: { id: string; name: string | null; email: string } | null
}

export interface ActivityTimelineEntry extends TimelineEntryBase {
  kind: 'activity'
  /** activities.title */
  title: string
  /** activityTypes.name — keys the existing icon + pastel map in activity-list.tsx. */
  typeName: string | null
  /** activities.dueDate (notNull in the schema). */
  dueDate: Date
  completedAt: Date | null
}

export interface StageChangeTimelineEntry extends TimelineEntryBase {
  kind: 'stage_change'
  /** null when the deal was created directly into a stage. */
  fromStageName: string | null
  /** stages.color — keys the existing pastel `stageColors` map in the deal detail page. */
  fromStageColor: string | null
  toStageName: string
  toStageColor: string
  actor: { id: string; name: string | null; email: string } | null
}

export type TimelineEntry =
  | NoteTimelineEntry
  | ActivityTimelineEntry
  | StageChangeTimelineEntry

export interface TimelinePage {
  entries: TimelineEntry[]
  hasMore: boolean
  /** The ENCODED cursor of the OLDEST returned entry, or null when there is no next page. */
  nextCursor: string | null
  total: number
}
