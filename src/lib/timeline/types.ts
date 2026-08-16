/**
 * The timeline entry contract every downstream plan in phase 35 renders against.
 *
 * This module is deliberately pure: no `db` import, no query, no runtime logic beyond
 * the single page-size constant. Plans 35-08 (assembler), 35-09 (server action),
 * 35-11/35-12 (rendering) and 35-13 all compile against these types, so a change here
 * is a compile-time break everywhere rather than a runtime surprise.
 */

// `import type` only — erased at compile, so the module stays runtime-free of `@/db`.
// `sources.ts:13` imports the same symbol the same way.
import type { EntityType } from "@/db/schema/custom-fields"

/** 20 entries per page, then a "Load more" affordance (D-07). */
export const TIMELINE_PAGE_SIZE = 20

/**
 * Phase 36 appends 'audit' here and one file to the assembler's source array —
 * nothing else in the union changes.
 *
 * NOT EDITED BY 36-10, deliberately. Adding 'audit' here fires the exhaustive `never`
 * check in `timeline-entry.tsx:57-62` the instant it lands, so the literal and the
 * renderer branch that satisfies it are added TOGETHER in 36-13. Splitting them would
 * leave `tsc` red at a plan boundary, and a phase whose intermediate states do not
 * typecheck cannot be verified plan by plan.
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

/**
 * Phase 36's audit display contract (36-UI-SPEC § Surface 1 → Data contract).
 *
 * Declared here in 36-10 but NOT yet joined to the `TimelineEntry` union below — see the
 * comment on `TimelineEntryKind`. `buildAuditFieldChanges` in `src/lib/audit/present.ts`
 * produces `AuditFieldChange[]`; the timeline source's hydrate (36-17) assembles the rest
 * of `AuditTimelineEntry`; `audit-entry.tsx` (36-13) renders it.
 */

/** Who or what performed the change. Never guessed — an unknown actor records `system`. */
export type AuditActorKind = 'user' | 'workflow_run' | 'api_key' | 'import' | 'system'

export type AuditAction = 'created' | 'updated' | 'deleted'

/** A single displayable value. `empty` is a first-class case, never an empty string. */
export type AuditValue =
  | { type: 'empty' }
  | { type: 'text'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'date'; iso: string; withTime: boolean }
  | { type: 'list'; items: string[] }
  /** A resolved foreign key. `label: null` → the referenced row is gone. */
  | { type: 'reference'; label: string | null }
  | { type: 'files'; count: number }
  /** Already-compacted JSON for anything the cases above do not cover. */
  | { type: 'json'; value: string }

export interface AuditFieldChange {
  /** React key + ordering identity: the column name, or `custom:<definitionId>`. */
  field: string
  /** Already resolved. Native columns are localized by the source; custom fields carry
   *  `customFieldDefinitions.name` VERBATIM — user-authored text is never translated. */
  label: string
  /** `null` on a `created` entry: there is no before. */
  from: AuditValue | null
  to: AuditValue
}

export interface AuditTimelineEntry extends TimelineEntryBase {
  kind: 'audit'
  action: AuditAction
  entityType: EntityType
  actorKind: AuditActorKind
  /** Only when actorKind === 'user'; null when that user row is gone. */
  actor: { id: string; name: string | null; email: string } | null
  /** Only when actorKind === 'workflow_run' and the workflow still exists. */
  workflowRun: { runId: string; workflowId: string; workflowName: string } | null
  /** Only when actorKind === 'api_key'; `apiKeys.name`. */
  apiKeyName: string | null
  /** Empty on `deleted`. May be empty on `updated` — see the UI-SPEC's defensive state. */
  changes: AuditFieldChange[]
}

/**
 * `AuditTimelineEntry` is deliberately ABSENT from this union in 36-10. It joins here in
 * 36-13, in the same commit as `timeline-entry.tsx`'s `case "audit"` branch, because the
 * `never` check in that file turns this one-line edit into a build break until the branch
 * exists. That guard is Phase 35 working as designed and is not to be defeated.
 */
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
