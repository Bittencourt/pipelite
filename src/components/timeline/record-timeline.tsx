/**
 * The record timeline card — a single drop-in section for all four detail pages.
 *
 * THIS FILE IS A SERVER COMPONENT. It carries no client directive, and it must not gain
 * one: page one of the timeline is fetched during the detail page's own render, so the
 * card arrives with its entries already painted. There is no skeleton and no spinner on
 * first paint (35-UI-SPEC "First paint is server-rendered"). Only Load more and the note
 * mutations are client round-trips.
 *
 * THE ONLY THINGS THIS MODULE MAY RENDER ARE CARD PRIMITIVES, PLAIN DOM ELEMENTS,
 * `TimelineList` AND `AuditFilterToggle` (T-35-30, T-36-32)
 * The Phase 44 / CFUI-01 class-wide gate walks every non-test .tsx under src/ and fails if
 * a NON-client module renders a component that forwards its children into a Radix
 * `asChild` slot — because `SlotClone` silently discards whatever Flight hands it, and the
 * result is a control that renders nothing with no error anywhere. Every interactive piece
 * of this feature (composer, inline edit, delete dialog, Load more, the filter toggle) hangs
 * off a client module instead, and every prop below is a plain serializable
 * value: strings, booleans, numbers, dates, arrays of plain objects. No React element and no
 * function crosses this boundary.
 *
 * ONE FLAG, ONE RENDER, FOUR CONSUMERS (36-UI-SPEC § Surface 4)
 * The header count, the entries, `hasMore`/the cursor and the toggle's own state are all
 * computed HERE from the single `includeAudit` boolean the page derived from `?changes=1`.
 * They cannot disagree, because there is no second copy of the scope anywhere. That is the
 * whole reason the scope lives in the URL rather than in React state: the count sits in this
 * server-rendered header, so client-side scope state would leave it stale the moment the
 * switch moved.
 */

import { getTranslations } from "next-intl/server"

import { auth } from "@/auth"
import { AuditFilterToggle } from "@/components/timeline/audit-filter-toggle"
import { TimelineList } from "@/components/timeline/timeline-list"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { EntityType } from "@/db/schema"
import {
  assembleTimeline,
  countTimeline,
  type TimelineCounts,
} from "@/lib/timeline/assemble"
import { TIMELINE_PAGE_SIZE, type TimelinePage } from "@/lib/timeline/types"

interface RecordTimelineProps {
  entityType: EntityType
  entityId: string
  /** The audit scope for this render, derived from the record URL's `?changes=1`. */
  includeAudit: boolean
}

/**
 * The one place `?changes=1` becomes a boolean, shared by all four detail pages so the
 * derivation cannot drift between them.
 *
 * SECURITY (T-36-41): the param is compared to the literal `"1"` and is a boolean before it
 * goes anywhere near `applicableSources`. Every other value — including an array, which is
 * what Next hands back for a repeated param — is false. Nothing from the URL is composed
 * into SQL; the scope selects from a closed set of registered sources.
 */
export function readAuditScope(
  searchParams: Record<string, string | string[] | undefined> | undefined
): boolean {
  return searchParams?.changes === "1"
}

export async function RecordTimeline({
  entityType,
  entityId,
  includeAudit,
}: RecordTimelineProps) {
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
  //
  // GUARDED FOR THE SAME REASON THE SESSION CHECK ABOVE IS.
  // These four-to-five queries can throw — a connection blip, a statement timeout, or
  // `assertEntityType` — and an unguarded throw inside an RSC render takes the ENTIRE
  // record detail page down over one optional section. There is no error.tsx or
  // global-error.tsx anywhere under src/app/, so the user would get Next.js's default
  // full-page error rather than a degraded record page. Before this phase the notes block
  // was a column already present in the page's own query and could not fail
  // independently; now it can, so it degrades to an inline message instead.
  // `countTimeline` returns BOTH numbers in one pass, so the toggle's own count costs no
  // extra round trip: `total` is scoped by the flag and is what the header renders, and
  // `auditTotal` ignores the flag because the toggle's label reports it in both states.
  let page: TimelinePage
  let counts: TimelineCounts
  try {
    ;[page, counts] = await Promise.all([
      assembleTimeline({
        entityType,
        entityId,
        limit: TIMELINE_PAGE_SIZE,
        includeAudit,
      }),
      countTimeline(entityType, entityId, includeAudit),
    ])
  } catch (error) {
    // Logged in full server-side; the client is told only that the section failed.
    console.error("RecordTimeline read failed:", error)
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base leading-tight font-semibold">
            {t("timeline")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm leading-normal">
            {t("error.timelineUnavailable")}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        {/* `CardTitle`'s built-in `leading-none` is overridden at the call site, per the
            UI-SPEC typography table. The count treatment matches CustomFieldsSection.

            THE COUNT IS FLAG-SCOPED AND MOVES WITH THE TOGGLE. A fixed "everything that
            ever happened" number would render `Timeline (59)` above a list the reader
            exhausts at 12 by pressing Load more until it disappears — a header number that
            does not match what it sits on top of is a defect the user can see and cannot
            explain. The hidden volume is not lost: the toggle reports it in both states. */}
        <CardTitle className="text-base leading-tight font-semibold">
          {t("timeline")}{" "}
          <span className="text-muted-foreground text-sm">({counts.total})</span>
        </CardTitle>

        {/* Fills `CardHeader`'s already-existing `grid-cols-[1fr_auto]` action slot, so this
            needs no new layout CSS. Only booleans and numbers cross into the client module
            — no React element reaches a Radix `asChild` slot from here (T-36-32). */}
        <AuditFilterToggle checked={includeAudit} auditTotal={counts.auditTotal} />
      </CardHeader>

      <CardContent>
        {/*
          THE KEY IS THE CURSOR TRAP'S MITIGATION (T-36-37), NOT A RE-RENDER HINT.
          `TimelineList` seeds its state from the server render ONCE and deliberately does
          not re-seed from later props, so that a `revalidatePath` after a note mutation
          cannot drop appended pages. That rule stays on. But a scope change MUST discard
          already-loaded pages: a cursor minted under one scope, replayed under the other,
          silently omits every audit entry newer than it. Keying on the scope remounts the
          subtree, which is exactly the semantics wanted and the smallest correct change.
        */}
        <TimelineList
          key={includeAudit ? "audit" : "default"}
          entityType={entityType}
          entityId={entityId}
          initialEntries={page.entries}
          initialCursor={page.nextCursor}
          hasMore={page.hasMore}
          includeAudit={includeAudit}
          auditTotal={counts.auditTotal}
          currentUserId={session.user.id}
          isAdmin={session.user.role === "admin"}
        />
      </CardContent>
    </Card>
  )
}
