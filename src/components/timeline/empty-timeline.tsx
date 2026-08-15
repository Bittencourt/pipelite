"use client"

/**
 * What a record's timeline says when nothing has happened to it yet.
 *
 * TWO VARIANTS, BECAUSE THE PROMISE DIFFERS
 * A deal's timeline merges three sources — notes, activities and stage changes — so its
 * empty copy can honestly promise all three will appear here. Organizations, people and
 * activities only have the notes source (`appliesTo` in `src/lib/timeline/sources.ts`), so
 * promising them activities and stage changes would be a cheque the product cannot cash.
 * Hence `full` vs `notesOnly` rather than one string.
 *
 * THE COMPOSER STAYS ON SCREEN
 * Both bodies end by pointing at the composer ("Write the first note above"), which only
 * works because the timeline card renders `NoteComposer` ABOVE this component and never
 * hides it when the entry list is empty. If a caller ever swaps the whole card content for
 * this component, the copy starts lying.
 */

import { useTranslations } from "next-intl"

interface EmptyTimelineProps {
  /** 'full' for deals; 'notesOnly' for organizations, people and activities. */
  variant: "full" | "notesOnly"
}

export function EmptyTimeline({ variant }: EmptyTimelineProps) {
  const t = useTranslations("notes")

  const heading = variant === "full" ? t("empty.heading") : t("emptyNotes.heading")
  const body = variant === "full" ? t("empty.body") : t("emptyNotes.body")

  return (
    <div className="py-12 text-center">
      <p className="text-sm leading-tight font-semibold">{heading}</p>
      <p className="text-muted-foreground mt-2 text-sm leading-normal">{body}</p>
    </div>
  )
}
