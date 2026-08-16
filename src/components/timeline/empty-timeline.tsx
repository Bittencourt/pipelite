"use client"

/**
 * What a record's timeline says when it has nothing to show.
 *
 * THE FIRST TWO VARIANTS DIFFER BECAUSE THE PROMISE DIFFERS
 * A deal's timeline merges three sources — notes, activities and stage changes — so its
 * empty copy can honestly promise all three will appear here. Organizations, people and
 * activities only have the notes source (`appliesTo` in `src/lib/timeline/sources.ts`), so
 * promising them activities and stage changes would be a cheque the product cannot cash.
 * Hence `full` vs `notesOnly` rather than one string.
 *
 * THE THIRD VARIANT EXISTS BECAUSE "NOTHING HAPPENED" CAN BE A LIE (36-UI-SPEC § Surface 4)
 * A record whose ONLY history is field changes shows an empty list while the audit filter is
 * off. Rendering the copy above over hidden audit rows would be the UI misreporting its own
 * data, and it is the single most likely way this feature misleads someone. `hiddenHistory`
 * therefore names the count and names the control, so the way out is on screen and
 * quantified. It never says "no history".
 *
 * ALL THREE COEXIST AND ALL THREE ARE REACHABLE. `full` / `notesOnly` are for a record with
 * no history of ANY kind — including one read with the filter ON, where they are still
 * correct — and `hiddenHistory` only when the filtered list is empty AND the audit total is
 * above zero. None of these branches is dead code; none may be merged away.
 *
 * THE COMPOSER STAYS ON SCREEN
 * The first two bodies end by pointing at the composer ("Write the first note above"), which
 * only works because the timeline card renders `NoteComposer` ABOVE this component and never
 * hides it when the entry list is empty. If a caller ever swaps the whole card content for
 * this component, the copy starts lying.
 */

import { useTranslations } from "next-intl"

type EmptyTimelineProps =
  | {
      /** 'full' for deals; 'notesOnly' for organizations, people and activities. */
      variant: "full" | "notesOnly"
      hiddenCount?: never
    }
  | {
      /** The filtered list is empty, but audit entries exist behind the closed toggle. */
      variant: "hiddenHistory"
      /**
       * Required by this variant, and required for a reason: the body quantifies what is
       * hidden. A union rather than an optional prop, so the count cannot be forgotten.
       */
      hiddenCount: number
    }

export function EmptyTimeline({ variant, hiddenCount }: EmptyTimelineProps) {
  const t = useTranslations("notes")
  const tAudit = useTranslations("audit")

  const isHidden = variant === "hiddenHistory"

  const heading = isHidden
    ? tAudit("filter.emptyHidden.heading")
    : variant === "full"
      ? t("empty.heading")
      : t("emptyNotes.heading")

  const body = isHidden
    ? tAudit("filter.emptyHidden.body", { count: hiddenCount ?? 0 })
    : variant === "full"
      ? t("empty.body")
      : t("emptyNotes.body")

  return (
    <div className="py-12 text-center">
      <p className="text-sm leading-tight font-semibold">{heading}</p>
      <p className="text-muted-foreground mt-2 text-sm leading-normal">{body}</p>
    </div>
  )
}
