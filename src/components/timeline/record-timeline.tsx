/**
 * The record timeline card — a single drop-in section for all four detail pages.
 *
 * THIS FILE IS A SERVER COMPONENT. It carries no client directive, and it must not gain
 * one: page one of the timeline is fetched during the detail page's own render, so the
 * card arrives with its entries already painted. There is no skeleton and no spinner on
 * first paint (35-UI-SPEC "First paint is server-rendered"). Only Load more and the note
 * mutations are client round-trips.
 *
 * THE ONLY THINGS THIS MODULE MAY RENDER ARE CARD PRIMITIVES AND `TimelineList` (T-35-30)
 * The Phase 44 / CFUI-01 class-wide gate walks every non-test .tsx under src/ and fails if
 * a NON-client module renders a component that forwards its children into a Radix
 * `asChild` slot — because `SlotClone` silently discards whatever Flight hands it, and the
 * result is a control that renders nothing with no error anywhere. Every interactive piece
 * of this feature (composer, inline edit, delete dialog, Load more) hangs off the
 * `TimelineList` client subtree instead, and every prop below is a plain serializable
 * value: strings, booleans, dates, arrays of plain objects. No React element and no
 * function crosses this boundary.
 */

import { getTranslations } from "next-intl/server"

import { auth } from "@/auth"
import { TimelineList } from "@/components/timeline/timeline-list"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { EntityType } from "@/db/schema"
import { assembleTimeline, countTimeline } from "@/lib/timeline/assemble"
import { TIMELINE_PAGE_SIZE } from "@/lib/timeline/types"

interface RecordTimelineProps {
  entityType: EntityType
  entityId: string
}

export async function RecordTimeline({ entityType, entityId }: RecordTimelineProps) {
  const [t, session] = await Promise.all([getTranslations("notes"), auth()])

  // All four detail pages already require a session to render, so this is defensive
  // rather than expected. It is written as a guard and not as a non-null assertion
  // because an assertion that turned out to be wrong would throw inside the RSC render
  // and take the entire record page down over one optional section.
  if (!session?.user?.id) {
    return null
  }

  // The badge count is read with `countTimeline` rather than lifted off `page.total`, so
  // the header does not depend on the assembler's page shape. It is one index-only
  // `count(*)` per applicable source (0.480 ms measured in 35-08), issued concurrently
  // with the page read.
  const [page, total] = await Promise.all([
    assembleTimeline({ entityType, entityId, limit: TIMELINE_PAGE_SIZE }),
    countTimeline(entityType, entityId),
  ])

  return (
    <Card className="mt-6">
      <CardHeader>
        {/* `CardTitle`'s built-in `leading-none` is overridden at the call site, per the
            UI-SPEC typography table. The count treatment matches CustomFieldsSection. */}
        <CardTitle className="text-base leading-tight font-semibold">
          {t("timeline")}{" "}
          <span className="text-muted-foreground text-sm">({total})</span>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <TimelineList
          entityType={entityType}
          entityId={entityId}
          initialEntries={page.entries}
          initialCursor={page.nextCursor}
          hasMore={page.hasMore}
          currentUserId={session.user.id}
          isAdmin={session.user.role === "admin"}
        />
      </CardContent>
    </Card>
  )
}
