"use client"

/**
 * The audit filter toggle: the control that decides whether a record's field-change
 * history is part of its timeline.
 *
 * WHY A SWITCH AND NOT A GHOST BUTTON — THIS IS AN ACCESSIBILITY CHOICE, NOT A STYLING ONE
 * Radix renders `role="switch"` with `aria-checked`, so the on/off state is programmatically
 * determinable with no bespoke ARIA. An icon button would have needed `aria-pressed` invented
 * at the call site, and the label would have had to live in a tooltip. The label here is a
 * real, VISIBLE `<Label htmlFor>` — never `sr-only` — because the control changes what the
 * card below it contains and a reader should not have to hover to find out what it does.
 *
 * WHY THE STATE IS IN THE URL AND NOT IN REACT (36-UI-SPEC § Surface 4)
 * The header count, the `<ol>` contents, `hasMore` and the cursor are then all computed by
 * ONE server render from ONE flag, so they cannot disagree. It also makes the choice
 * shareable, bookmarkable, and survivable across reload and back/forward.
 *
 * `replace`, NOT `push`
 * The toggle selects a view scope rather than a destination. Pushing would mean four
 * back-presses to leave a record someone had flipped the switch on twice, which is a history
 * stack nobody asked for.
 *
 * PERSISTENCE IS PER URL, ON PURPOSE
 * Nothing is written to `localStorage` or to a user preference row. A reading choice made
 * about one record is not a statement about all records, and a sticky preference would hand
 * an audit-dominated timeline to a user who once opened changes on a single deal — precisely
 * the failure the OFF default exists to prevent.
 *
 * THE TOGGLE RENDERS AT ZERO
 * With no audit history it shows `(0)` rather than disappearing. A control that appears and
 * vanishes between records is worse than one that honestly reports nothing to show.
 *
 * THE FILLED ON STATE IS A DECLARED FOURTH ACCENT (36-UI-SPEC § Color)
 * `switch.tsx` hardcodes `data-[state=checked]:bg-primary`, so an enabled toggle is
 * accent-filled inside a card where Phase 35 declared three accents. It is declared rather
 * than left to appear undeclared: the filled state is 32×18px and is ABSENT in the default
 * state, so the card as it first paints still carries exactly Phase 35's three.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { CardAction } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface AuditFilterToggleProps {
  /** The current scope, derived on the server from `?changes=1`. */
  checked: boolean
  /**
   * The record's audit-entry count REGARDLESS of the scope. It is reported in both states,
   * which is what stops the hidden volume from vanishing when the switch is off.
   */
  auditTotal: number
}

/** The search param this control owns. `"1"` is the only truthy value. */
const SCOPE_PARAM = "changes"

export function AuditFilterToggle({ checked, auditTotal }: AuditFilterToggleProps) {
  const t = useTranslations("audit")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Owned HERE rather than routed through the composer's existing live region. See the
  // SUMMARY's declared deviation: that region lives in `note-composer.tsx`, is bound to
  // note-add state, and sits inside the `TimelineList` subtree this toggle remounts — so a
  // message put there would be discarded by the very navigation that caused it.
  const [announcement, setAnnouncement] = useState("")

  function handleCheckedChange(next: boolean) {
    // Every other param on the record's URL is preserved; this control owns exactly one.
    const params = new URLSearchParams(searchParams.toString())

    if (next) {
      params.set(SCOPE_PARAM, "1")
    } else {
      params.delete(SCOPE_PARAM)
    }

    // No reset-to-empty first (the idiom in `note-composer.tsx`): the two messages alternate,
    // so the live region's content genuinely changes on every toggle and it always speaks.
    setAnnouncement(next ? t("filter.announceShown") : t("filter.announceHidden"))

    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <CardAction className="flex items-center gap-2">
      <Label
        htmlFor="timeline-audit-filter"
        className="text-muted-foreground gap-1 text-xs"
      >
        {t("filter.label")}
        {/* The card header already renders its own count this way. */}
        <span>({auditTotal})</span>
      </Label>

      <Switch
        id="timeline-audit-filter"
        size="sm"
        checked={checked}
        onCheckedChange={handleCheckedChange}
        // The control changes the contents of the list below it, not of its own subtree.
        aria-controls="record-timeline-list"
      />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </CardAction>
  )
}
