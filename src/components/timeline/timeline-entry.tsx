"use client"

/**
 * The one place that maps a `TimelineEntry` to the component that draws it.
 *
 * THIS FILE OWNS NO LAYOUT. It is a dispatcher. Every visual decision — the rail, the
 * content column, the typography, the badges — lives in the three renderers, which is what
 * keeps their row skeletons identical and the merged feed reading as ONE list (SC-2). If a
 * Tailwind class ever shows up in this file, a layout decision has leaked out of the
 * renderer that should own it.
 *
 * EXHAUSTIVENESS IS THE POINT (T-35-32)
 * The default branch assigns the narrowed entry to `never`. Phase 36 appended 'audit' to
 * `TimelineEntryKind`, and the moment it did, THIS FILE FAILED `tsc` until the new kind got
 * a branch. That is deliberate: without it, an unhandled kind would fall through to
 * `return null` and audit rows would silently vanish from the feed — a history surface
 * quietly omitting history, with nothing in the logs to say so. A compile error is the
 * cheapest possible version of that bug. The guard stays for the kind after this one: do
 * not add a `default: return null` that swallows the union and do not weaken the `never`.
 */

import { ActivityEntry } from "@/components/timeline/activity-entry"
import { AuditEntry } from "@/components/timeline/audit-entry"
import { NoteEntry } from "@/components/timeline/note-entry"
import { StageChangeEntry } from "@/components/timeline/stage-change-entry"
import type { NoteTimelineEntry, TimelineEntry } from "@/lib/timeline/types"

interface TimelineEntryRowProps {
  entry: TimelineEntry
  /** Cosmetic only — the server enforces note permissions. See `note-entry.tsx`. */
  canManage: boolean
  onUpdated: (entry: NoteTimelineEntry) => void
  onDeleted: (noteId: string) => void
}

export function TimelineEntryRow({
  entry,
  canManage,
  onUpdated,
  onDeleted,
}: TimelineEntryRowProps) {
  switch (entry.kind) {
    case "note":
      return (
        <NoteEntry
          entry={entry}
          canManage={canManage}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
        />
      )

    case "activity":
      return <ActivityEntry entry={entry} />

    case "stage_change":
      return <StageChangeEntry entry={entry} />

    // `entry` only: an audit entry is a fact about the past with no row actions, so it
    // needs neither `canManage` nor the two callbacks (36-UI-SPEC § The dispatcher edit).
    case "audit":
      return <AuditEntry entry={entry} />

    default: {
      // Adding a kind to the union without adding a branch above is a compile error here.
      const unhandled: never = entry
      void unhandled
      return null
    }
  }
}
