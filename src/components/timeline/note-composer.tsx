"use client"

/**
 * The inline note composer that sits at the top of every record timeline.
 *
 * THE TYPED TEXT IS SACRED (T-35-31)
 * A failed save must never cost the user what they wrote. The draft is cleared in exactly
 * ONE place — the success branch — and both a `success: false` result and a thrown action
 * land in the same handler, which retains the text and re-enables the controls. The copy
 * behind `notes.error.saveFailed` promises the text is still in the box, so the code has
 * to keep that promise.
 *
 * NO SUCCESS TOAST
 * 35-UI-SPEC "Copy rules": the note appearing at the top of the timeline is the
 * confirmation. A toast on top of a visible result is noise. The only feedback a sighted
 * user gets is the new entry; the only feedback a screen-reader user gets is the
 * `aria-live` region below.
 *
 * ENTER IS A NEWLINE, NOT A SUBMIT
 * Line breaks are preserved content in this phase (D-03), so a bare Enter must insert one.
 * Only Cmd/Ctrl+Enter submits, and `preventDefault` fires only in that combined case.
 */

import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { addNote } from "@/app/notes/actions"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { EntityType } from "@/db/schema"
import type { NoteTimelineEntry } from "@/lib/timeline/types"

interface NoteComposerProps {
  entityType: EntityType
  entityId: string
  onAdded: (entry: NoteTimelineEntry) => void
}

export function NoteComposer({ entityType, entityId, onAdded }: NoteComposerProps) {
  const t = useTranslations("notes")
  const textareaId = useId()
  const [isPending, startTransition] = useTransition()

  const [draft, setDraft] = useState("")
  const [announcement, setAnnouncement] = useState("")

  // Trimmed only for the emptiness test and for what is sent. The state itself keeps the
  // user's text exactly as typed, internal line breaks included.
  const trimmed = draft.trim()
  const canSubmit = trimmed.length > 0 && !isPending

  function handleSubmit() {
    if (!canSubmit) return

    // Reset first so a second add re-announces: an aria-live region only speaks when its
    // content actually changes, and setting the identical string again is silent.
    setAnnouncement("")

    startTransition(async () => {
      try {
        const result = await addNote(entityType, entityId, trimmed)

        if (result.success) {
          // The ONLY place the draft is cleared.
          setDraft("")
          onAdded(result.note)
          setAnnouncement(t("announceAdded"))
          return
        }

        toast.error(t("error.saveFailed"))
      } catch {
        // A thrown action and a `success: false` action are the same event to the user,
        // and neither one touches the draft.
        toast.error(t("error.saveFailed"))
      }
    })
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div>
      <Label htmlFor={textareaId} className="sr-only">
        {t("composerPlaceholder")}
      </Label>
      <Textarea
        id={textareaId}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("composerPlaceholder")}
        disabled={isPending}
        className="min-h-16 text-sm leading-normal"
      />

      <div className="mt-2 flex justify-end gap-2">
        {/*
          The one primary-filled element in the timeline card. Everything else here —
          Load more, Edit, Delete — is outline, ghost or muted by design.
        */}
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {isPending ? t("adding") : t("addNote")}
        </Button>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}
