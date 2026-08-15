"use client"

/**
 * The client half of the record timeline: it owns the entry list, applies every note
 * mutation in place, and runs the Load-more state machine.
 *
 * THERE IS NO PRECEDENT FOR THIS IN THE REPO
 * `src/app/activities/activities-client.tsx` looks like an analog and is not one. Its
 * "Load More" NAVIGATES — it pushes a `?page=N+1` query onto the Next.js router — and lets
 * the RSC re-render a longer list. That cannot work here: the record timeline is one
 * section of a detail
 * page, a navigation would reset the composer draft and any in-progress inline edit, and
 * the assembler pages by keyset rather than by page number. So this component appends to
 * client state instead, and every state that appending implies is implemented below.
 *
 * ALL FOUR LOAD-MORE STATES ARE MANDATORY (T-35-33)
 *   idle       button rendered, enabled, `notes.loadMore`
 *   in flight  SAME button, disabled, Loader2 + `notes.loadingMore`
 *   failed     button returns to idle AND `toast.error(notes.error.loadMoreFailed)` fires
 *   exhausted  button not rendered at all — no "that's all" terminal text
 * The failure branch is the one that is easy to skip and the one that matters most: a
 * silent no-op tells the user this record has no more history, which is a lie about an
 * audit surface. The failure branch also leaves `cursor` and `more` untouched, so pressing
 * the button again retries the SAME page rather than skipping it.
 *
 * WHY PLAIN STATE RATHER THAN REACT'S OPTIMISTIC HOOK
 * That hook has zero uses in this repo. The manual local-state-plus-revert idiom
 * (`custom-fields-section.tsx`, and `note-entry.tsx` in this same phase) is the
 * established pattern, and introducing a second one here would be an undeclared
 * convention change in a plan that is not about state management. The hook's name is
 * kept out of this file entirely, because the plan gates its absence with a raw grep.
 *
 * `onUpdated` IS LOAD-BEARING (35-11)
 * `NoteEntry` clears its optimistic override the instant it calls `onUpdated`, on the
 * assumption that THIS component applies the returned entry to its own state. If
 * `handleUpdated` ignored the callback, a successful edit would visibly snap back to the
 * pre-edit text.
 */

import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { loadMoreTimeline } from "@/app/notes/actions"
import { EmptyTimeline } from "@/components/timeline/empty-timeline"
import { NoteComposer } from "@/components/timeline/note-composer"
import { TimelineEntryRow } from "@/components/timeline/timeline-entry"
import { Button } from "@/components/ui/button"
import type { EntityType } from "@/db/schema"
import type { NoteTimelineEntry, TimelineEntry } from "@/lib/timeline/types"

interface TimelineListProps {
  entityType: EntityType
  entityId: string
  /** Page one, already fetched on the server. There is no initial loading state. */
  initialEntries: TimelineEntry[]
  initialCursor: string | null
  hasMore: boolean
  /** From the session, server-side. Drives `canManage`, which is cosmetic only. */
  currentUserId: string
  isAdmin: boolean
}

export function TimelineList({
  entityType,
  entityId,
  initialEntries,
  initialCursor,
  hasMore,
  currentUserId,
  isAdmin,
}: TimelineListProps) {
  const t = useTranslations("notes")

  // Seeded from the server render, then owned entirely here. A later server render (the
  // `revalidatePath` in the note actions) hands down fresh props, but this state is
  // deliberately NOT re-seeded from them: re-seeding would drop appended pages and could
  // race an optimistic prepend into rendering the same note twice.
  const [entries, setEntries] = useState<TimelineEntry[]>(initialEntries)
  const [cursor, setCursor] = useState<string | null>(initialCursor)
  const [more, setMore] = useState(hasMore)
  const [loading, setLoading] = useState(false)

  function handleAdded(entry: NoteTimelineEntry) {
    // Newest first, and never twice — see `handleLoadMore` for why the id filter exists.
    setEntries((previous) => [entry, ...previous.filter((e) => e.id !== entry.id)])
  }

  function handleUpdated(entry: NoteTimelineEntry) {
    setEntries((previous) => previous.map((e) => (e.id === entry.id ? entry : e)))
  }

  function handleDeleted(noteId: string) {
    setEntries((previous) => previous.filter((e) => e.id !== noteId))
  }

  async function handleLoadMore() {
    // `cursor` is null exactly when there is no next page, so the button is not rendered
    // in that case; this guard is belt-and-braces for a double click mid-flight.
    if (loading || cursor === null) return

    setLoading(true)

    try {
      const result = await loadMoreTimeline(entityType, entityId, cursor)

      if (result.success) {
        const page = result.page

        setEntries((previous) => {
          // Keyset paging makes a duplicate structurally unlikely, but an optimistically
          // prepended note plus an in-flight page fetch is a real interleaving, and a
          // repeated React key is a visible bug. The dedupe key and the key= below are
          // deliberately the same value.
          const seen = new Set(previous.map((e) => e.id))
          return [...previous, ...page.entries.filter((e) => !seen.has(e.id))]
        })

        // The encoded cursor is passed back verbatim on the next press; this component
        // never decodes or inspects it (T-35-02).
        setCursor(page.nextCursor)
        setMore(page.hasMore)
        return
      }

      // A `success: false` result and a thrown action are the same event to the user, and
      // NEITHER advances the cursor — so the retry fetches the page that failed.
      toast.error(t("error.loadMoreFailed"))
    } catch {
      toast.error(t("error.loadMoreFailed"))
    } finally {
      setLoading(false)
    }
  }

  const canLoadMore = more && cursor !== null

  return (
    <div>
      {/*
        Rendered ALWAYS, including over an empty list: both `EmptyTimeline` bodies end with
        "Write the first note above", which is only true while the composer is on screen.
      */}
      <NoteComposer entityType={entityType} entityId={entityId} onAdded={handleAdded} />

      <div className="mt-4 border-t pt-4">
        {entries.length === 0 ? (
          // A deal merges notes, activities and stage changes; the other three entity
          // types only have the notes source (`appliesTo` in sources.ts).
          <EmptyTimeline variant={entityType === "deal" ? "full" : "notesOnly"} />
        ) : (
          // An ordered list, newest first, so the DOM order and the visual order agree
          // (35-UI-SPEC Accessibility Contract). The renderers all emit a plain div; the
          // <ol>/<li> structure belongs here.
          <ol className="space-y-4">
            {entries.map((entry, index) => (
              <li key={entry.id} className="relative">
                {index < entries.length - 1 ? (
                  // The decorative connector: from the bottom of this row's 32px rail icon
                  // (top-8) down through the 16px `space-y-4` gap (-bottom-4) to the top of
                  // the next icon. Purely visual, and omitted after the last loaded entry
                  // so the rail never dangles into empty space.
                  <div
                    aria-hidden="true"
                    className="bg-border absolute top-8 -bottom-4 left-4 w-px"
                  />
                ) : null}

                <TimelineEntryRow
                  entry={entry}
                  // Cosmetic only. `editNote` / `deleteNote` re-check with
                  // `isAuthorOrAdmin` server-side, as do the /api/v1 routes (T-35-34).
                  canManage={
                    entry.kind === "note" &&
                    (isAdmin || entry.author?.id === currentUserId)
                  }
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                />
              </li>
            ))}
          </ol>
        )}

        {canLoadMore ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={handleLoadMore}
            disabled={loading}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {loading ? t("loadingMore") : t("loadMore")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
