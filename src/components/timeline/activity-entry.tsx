"use client"

/**
 * One activity in the record timeline: its type icon, its title as a link to the activity,
 * and whether it is still due or already done.
 *
 * SHARED SKELETON (UI-SPEC § Layout & Composition)
 * The outer structure here is byte-for-byte the one in `note-entry.tsx` — a `w-8 shrink-0`
 * rail, a `gap-2`, and a `min-w-0 flex-1` content column whose first line is
 * `flex flex-wrap items-center gap-2`. The three entry kinds only read as ONE chronological
 * feed if their rows line up on the same grid, so this is a contract, not a coincidence.
 * Changing the skeleton here without changing it in the two siblings breaks SC-2.
 *
 * NO NEW HUES (UI-SPEC § Color)
 * The type badge is coloured through the existing `colorMap` from `activity-list.tsx`,
 * reproduced verbatim below including its `bg-gray-100` fallback. These classes are
 * light-mode-only in the current codebase; this phase reuses them AS-IS rather than adding
 * new instances of that problem. Do not add a hue, a hex, or a token here.
 *
 * TITLE RENDERING (T-35-05)
 * Activity titles are arbitrary user text rendered as a React TEXT child, which React
 * escapes. Raw-HTML injection props must never appear in this file — it is grep-gated to
 * zero occurrences.
 *
 * NO ROW ACTIONS
 * Only notes are manageable from the timeline. An activity is edited on the activity
 * surface, which is exactly what the title link goes to.
 */

import { CheckSquare, Mail, Phone, Users } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { RelativeTime } from "@/components/ui/relative-time"
import type { ActivityTimelineEntry } from "@/lib/timeline/types"

/**
 * `ActivityTimelineEntry` carries `typeName` (activityTypes.name) but not the type's stored
 * `icon` column, so this keys on the NAME where `activity-list.tsx` keys on the icon field.
 * The pairing is the same one that file produces: Call → Phone, Meeting → Users,
 * Task → CheckSquare, Email → Mail.
 */
const typeIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Call: Phone,
  Meeting: Users,
  Task: CheckSquare,
  Email: Mail,
}

/** Verbatim from `activity-list.tsx:99-104`. Zero new hues (UI-SPEC § Color). */
const colorMap: Record<string, string> = {
  Call: "bg-blue-100 text-blue-800",
  Meeting: "bg-purple-100 text-purple-800",
  Task: "bg-green-100 text-green-800",
  Email: "bg-amber-100 text-amber-800",
}

/** The same fallback `activity-list.tsx:252` uses for an unrecognised type name. */
const FALLBACK_COLOR = "bg-gray-100 text-gray-800"

interface ActivityEntryProps {
  entry: ActivityTimelineEntry
}

export function ActivityEntry({ entry }: ActivityEntryProps) {
  const t = useTranslations("notes")
  const format = useFormatter()

  // A custom activity type the four built-ins do not cover still gets a rail icon rather
  // than an empty circle.
  const Icon = (entry.typeName ? typeIconMap[entry.typeName] : undefined) ?? CheckSquare
  const colorClass = (entry.typeName ? colorMap[entry.typeName] : undefined) ?? FALLBACK_COLOR

  const absoluteTimestamp = format.dateTime(entry.occurredAt, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  })

  const dueDate = format.dateTime(entry.dueDate, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

  return (
    <div className="flex gap-2">
      <div className="w-8 shrink-0">
        <div className="bg-muted flex size-8 items-center justify-center rounded-full">
          <Icon className="text-muted-foreground h-4 w-4" aria-hidden="true" />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {/*
            One of the three sanctioned uses of --primary in this card (UI-SPEC § Color):
            a link from a timeline entry to the record it describes.
          */}
          <Link
            href={`/activities/${entry.id}`}
            className="text-primary text-sm leading-tight font-semibold hover:underline"
          >
            {entry.title}
          </Link>
          <time
            dateTime={entry.occurredAt.toISOString()}
            title={absoluteTimestamp}
            className="text-muted-foreground text-xs"
          >
            <RelativeTime date={entry.occurredAt} />
          </time>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {/*
            Exactly one of these two ever renders. A completed activity says so and drops
            the due date, because a date that has already been met is noise in a history feed.
          */}
          <span className="text-sm leading-normal">
            {entry.completedAt
              ? t("entry.activityCompleted")
              : t("entry.activityDue", { date: dueDate })}
          </span>
          {entry.typeName ? (
            <Badge variant="secondary" className={`${colorClass} gap-1 font-normal`}>
              <Icon className="h-3 w-3" aria-hidden="true" />
              {entry.typeName}
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  )
}
