"use client"

/**
 * One stage change in a deal's timeline: who moved it, and between which two stages.
 *
 * SHARED SKELETON (UI-SPEC § Layout & Composition)
 * Identical outer structure to `note-entry.tsx` and `activity-entry.tsx` — a `w-8 shrink-0`
 * rail, a `gap-2`, and a `min-w-0 flex-1` content column whose first line is
 * `flex flex-wrap items-center gap-2`. The feed only reads as one list because all three
 * kinds share this grid.
 *
 * NO NEW HUES (UI-SPEC § Color)
 * Stage badges are coloured through the existing pastel `stageColors` map from
 * `src/app/deals/[id]/page.tsx:80-89`, reproduced verbatim below including its `slate`
 * fallback. Light-mode-only, reused as-is; do not add a hue, a hex, or a token here.
 *
 * STAGE NAMES (T-35-05)
 * Stage names are user-authored text rendered as React TEXT children, which React escapes.
 * Raw-HTML injection props must never appear in this file — it is grep-gated to zero
 * occurrences.
 *
 * NO ROW ACTIONS
 * A stage change is a fact about the past. Only notes are manageable from the timeline.
 */

import { ArrowRight } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { Fragment, type ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { RelativeTime } from "@/components/ui/relative-time"
import type { StageChangeTimelineEntry } from "@/lib/timeline/types"

/** Verbatim from `src/app/deals/[id]/page.tsx:80-89`. Zero new hues (UI-SPEC § Color). */
const stageColors: Record<string, string> = {
  slate: "bg-slate-100 text-slate-800",
  blue: "bg-blue-100 text-blue-800",
  emerald: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  rose: "bg-rose-100 text-rose-800",
  violet: "bg-violet-100 text-violet-800",
  cyan: "bg-cyan-100 text-cyan-800",
  orange: "bg-orange-100 text-orange-800",
}

function stageClass(color: string | null): string {
  return stageColors[color ?? "slate"] ?? stageColors.slate
}

/**
 * NUL-delimited so they can never collide with translated prose. `notes.entry.stageChanged`
 * is "moved this deal from {from} to {to}", and the two stage names have to render as
 * coloured badges rather than plain words — but next-intl placeholders only accept
 * string/number/Date, never a React element (`RichTranslationValues` admits elements only
 * for TAG functions, and this message has no tags).
 *
 * So the message is formatted with these sentinels standing in for the names, then split
 * back apart and the badges dropped into the holes. This keeps the localized WORD ORDER
 * authoritative — es-ES says "movió este trato de {from} a {to}" and pt-BR says "moveu este
 * negócio de {from} para {to}" — instead of hardcoding an English "from … to …" shape in
 * JSX and interpolating around it.
 */
const FROM_SLOT = "\u0000from\u0000"
const TO_SLOT = "\u0000to\u0000"

/**
 * Splits `sentence` on whichever sentinel appears next and interleaves the matching node.
 * Written as an index scan rather than a regex because the sentinels are control characters
 * and a control-character regex is a lint error for good reason.
 */
function fillSlots(sentence: string, slots: Record<string, ReactNode>): ReactNode[] {
  const out: ReactNode[] = []
  let rest = sentence
  let key = 0

  while (rest.length > 0) {
    let nextToken: string | null = null
    let nextIndex = -1

    for (const token of Object.keys(slots)) {
      const index = rest.indexOf(token)
      if (index !== -1 && (nextIndex === -1 || index < nextIndex)) {
        nextIndex = index
        nextToken = token
      }
    }

    if (nextToken === null) {
      // Plain strings in a React array need no key.
      out.push(rest)
      break
    }

    if (nextIndex > 0) out.push(rest.slice(0, nextIndex))
    out.push(<Fragment key={key++}>{slots[nextToken]}</Fragment>)
    rest = rest.slice(nextIndex + nextToken.length)
  }

  return out
}

interface StageChangeEntryProps {
  entry: StageChangeTimelineEntry
}

export function StageChangeEntry({ entry }: StageChangeEntryProps) {
  const t = useTranslations("notes")
  const format = useFormatter()

  const actorName = entry.actor?.name ?? entry.actor?.email ?? t("unknownAuthor")

  const absoluteTimestamp = format.dateTime(entry.occurredAt, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  })

  const toBadge = (
    <Badge variant="secondary" className={`${stageClass(entry.toStageColor)} font-normal`}>
      {entry.toStageName}
    </Badge>
  )

  return (
    <div className="flex gap-2">
      <div className="w-8 shrink-0">
        <div className="bg-muted flex size-8 items-center justify-center rounded-full">
          <ArrowRight className="text-muted-foreground h-4 w-4" aria-hidden="true" />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm leading-tight font-semibold">{actorName}</span>
          <time
            dateTime={entry.occurredAt.toISOString()}
            title={absoluteTimestamp}
            className="text-muted-foreground text-xs"
          >
            <RelativeTime date={entry.occurredAt} />
          </time>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm leading-normal">
          {entry.fromStageName === null ? (
            /*
              The deal was created directly into a stage, so there is no origin to name.
              `notes.entry.stageChanged` is a two-placeholder sentence with no one-stage
              variant, and dropping a clause out of a translated string is not something
              that survives contact with another locale's word order — so the destination
              badge stands alone. Line 1 already carries the actor and the timestamp, which
              is the whole of what is known.
            */
            toBadge
          ) : (
            <span className="inline-flex flex-wrap items-center gap-1">
              {fillSlots(t("entry.stageChanged", { from: FROM_SLOT, to: TO_SLOT }), {
                [FROM_SLOT]: (
                  <Badge
                    variant="secondary"
                    className={`${stageClass(entry.fromStageColor)} font-normal`}
                  >
                    {entry.fromStageName}
                  </Badge>
                ),
                [TO_SLOT]: toBadge,
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
