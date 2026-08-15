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
 * The keyset paging position: the (occurredAt, id) pair of the OLDEST entry already
 * returned. `id` breaks ties when two entries share a millisecond. Never sent to the
 * browser in this shape — see `encodeCursor` in ./cursor.
 */
export interface TimelineCursor {
  occurredAt: Date
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
