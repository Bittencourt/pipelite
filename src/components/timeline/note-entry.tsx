"use client"

/**
 * One note in the record timeline: attribution, timestamp, body, and — for the author or
 * an admin — inline edit and delete.
 *
 * PERMISSIONS ARE COSMETIC HERE (T-35-03)
 * `canManage` only decides whether the Edit and Delete buttons are PAINTED. It is not the
 * access control and must never be treated as one. Enforcement lives server-side in
 * `editNote` / `deleteNote` (plan 35-09, via the shared `isAuthorOrAdmin` predicate) and
 * in the /api/v1 note routes (plan 35-10). A future reader who finds a way around the
 * hidden button has found nothing: the server still says no. Do not weaken either server
 * check on the grounds that "the UI already hides it".
 *
 * BODY RENDERING (T-35-05)
 * The note body is arbitrary user text — including text migrated from an external
 * Pipedrive import — rendered as a React TEXT child inside a <p>. React escapes it.
 * Raw-HTML injection props must never appear in this file — it is grep-gated to zero
 * occurrences — because there is no sanitizer and no markdown renderer in this repo, rich
 * text being deliberately out of scope (D-03).
 * `whitespace-pre-wrap` preserves the line breaks that ARE the content, and `break-words`
 * stops a pasted 200-character URL blowing out the card.
 */

import { Loader2, Pencil, Trash2 } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { editNote } from "@/app/notes/actions"
import { DeleteNoteDialog } from "@/components/timeline/delete-note-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RelativeTime } from "@/components/ui/relative-time"
import { Textarea } from "@/components/ui/textarea"
import type { NoteTimelineEntry } from "@/lib/timeline/types"

/**
 * The fourth copy of this helper in the repo (deal-card.tsx, and two siblings). A fourth
 * copy is tolerable; a fourth copy that BEHAVES differently is not, so this is byte-for-byte
 * the deal-card.tsx logic. Its signature requires an email, which is exactly why the
 * unknown-author branch below never calls it rather than passing an empty string.
 */
function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

interface NoteEntryProps {
  entry: NoteTimelineEntry
  /** Cosmetic only — see the module comment. */
  canManage: boolean
  onUpdated: (entry: NoteTimelineEntry) => void
  onDeleted: (noteId: string) => void
}

export function NoteEntry({ entry, canManage, onUpdated, onDeleted }: NoteEntryProps) {
  const t = useTranslations("notes")
  const format = useFormatter()
  const [isPending, startTransition] = useTransition()

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(entry.content)
  const [deleteOpen, setDeleteOpen] = useState(false)

  /**
   * The optimistic body. null means "show what the props say". A successful save clears it
   * so the server's entry — handed up through `onUpdated` and back down as a new prop —
   * REPLACES it rather than being merged into it, the custom-fields-section.tsx idiom.
   * A failure clears it too, which is what restores the previous text.
   */
  const [optimisticContent, setOptimisticContent] = useState<string | null>(null)

  const content = optimisticContent ?? entry.content

  /**
   * Derived, never stored. `NoteTimelineEntry` carries no `edited` boolean: a stored flag
   * could drift from the timestamps it claims to describe.
   */
  const wasEdited = entry.updatedAt.getTime() > entry.createdAt.getTime()

  const authorName = entry.author?.name ?? entry.author?.email ?? t("unknownAuthor")
  const initials = entry.author ? getInitials(entry.author.name, entry.author.email) : null

  const absoluteTimestamp = format.dateTime(entry.createdAt, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  })

  function startEditing() {
    setDraft(content)
    setIsEditing(true)
  }

  function cancelEditing() {
    // Nothing is lost that the user did not just type, so no confirmation.
    setDraft(content)
    setIsEditing(false)
  }

  function handleSave() {
    const next = draft.trim()
    if (!next) return

    const previous = content
    setOptimisticContent(next)
    setIsEditing(false)

    startTransition(async () => {
      try {
        const result = await editNote(entry.id, next)

        if (result.success) {
          onUpdated(result.note)
          setOptimisticContent(null)
          return
        }

        setOptimisticContent(previous === entry.content ? null : previous)
        setDraft(previous)
        setIsEditing(true)
        toast.error(t("error.editFailed"))
      } catch {
        // A thrown action and a `success: false` action are the same event to the user.
        setOptimisticContent(previous === entry.content ? null : previous)
        setDraft(previous)
        setIsEditing(true)
        toast.error(t("error.editFailed"))
      }
    })
  }

  return (
    <div className="flex gap-2">
      <div className="w-8 shrink-0">
        <Avatar className="size-8">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm leading-tight font-semibold">{authorName}</span>
          <time
            dateTime={entry.createdAt.toISOString()}
            title={absoluteTimestamp}
            className="text-muted-foreground text-xs"
          >
            <RelativeTime date={entry.createdAt} />
          </time>
          {wasEdited ? (
            <span className="text-muted-foreground text-xs">{t("edited")}</span>
          ) : null}
          {entry.source === "migration" ? (
            // A native `title`, not a Radix Tooltip: tooltip.tsx is not vendored in this
            // repo and components.json declares an empty `registries` object, so pulling
            // one would contradict the UI-SPEC Registry Safety section. `title` costs
            // nothing and is keyboard- and screen-reader-reachable.
            <Badge variant="secondary" title={t("migratedTooltip")}>
              {t("migrated")}
            </Badge>
          ) : null}
        </div>

        {isEditing ? (
          <div className="mt-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={isPending}
              className="min-h-16 text-sm leading-normal"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelEditing}
                disabled={isPending}
              >
                {t("cancelEdit")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={isPending || !draft.trim()}
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("saveEdit")}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-normal break-words whitespace-pre-wrap">{content}</p>
        )}
      </div>

      {canManage ? (
        <>
          {/*
            Always visible, never a hover-only reveal — a hover reveal is unreachable on
            touch, and this matches the row-action precedent in activity-list.tsx.
          */}
          <div className="flex shrink-0 items-start gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("editNote")}
              onClick={startEditing}
              disabled={isEditing || isPending}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("deleteNote")}
              onClick={() => setDeleteOpen(true)}
              disabled={isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/*
            Rendering the dialog from THIS module is safe under CFUI-01 because this file
            is a client module. It is also a non-definer, so the gate never engages.
          */}
          <DeleteNoteDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            noteId={entry.id}
            onDeleted={onDeleted}
          />
        </>
      ) : null}
    </div>
  )
}
