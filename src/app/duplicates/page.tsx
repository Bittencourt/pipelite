/**
 * `/duplicates` — the pairs a scan found, per entity type, with all state in the URL (DEDUP-01).
 *
 * ONE SERVER RENDER OWNS EVERYTHING. The active tab's page of pairs, both tab counts and the scan
 * row that decides which emptiness the user is looking at are produced here, in one render, from one
 * viewer. That is what makes it impossible for a tab to read `Organizations (12)` above three cards:
 * the counts and the rows share `pairScope` inside `queries.ts` rather than two hand-written clauses
 * that happen to agree today (39-UI-SPEC L-1, the `/trash` precedent).
 *
 * ONLY THE ACTIVE TAB IS QUERIED FOR ROWS. The other contributes two cheap scoped `count(*)`s and
 * nothing else.
 *
 * NOTHING HERE THROWS. `countPairs`, `listPairs`, `getLatestScan` and `readOrgIdentityFields` all fail
 * closed inside their own modules, and `/duplicates` has no `error.tsx` above it — that posture is the
 * only thing between one unhappy query and a dead page (S-5).
 *
 * FOUR THINGS AN EMPTY TAB CAN BE, AND THEY ARE FOUR DIFFERENT SENTENCES. Never scanned, scanned and
 * found nothing, everything dismissed, and — not an emptiness at all — the read failed. `listPairs`
 * returns `{ ok: false }` rather than an empty success precisely so the fourth is distinguishable
 * from the other three; reporting a failed read as "no duplicates found" would tell an admin their
 * data is clean on the strength of a broken query.
 *
 * SPLIT (CFUI-01). This module is a server component. Everything stateful — the tab bar's
 * `router.push`, the identity-field selects and their transition, the toasts — lives in
 * `duplicates-tabs.tsx` and `identity-fields-form.tsx`, both of which carry the client directive on
 * their first line. Only plain serializable values cross: a string-literal tab, a record of numbers or
 * `null`, and two string arrays.
 *
 * THE ADMIN CHECK BELOW IS DEFENCE IN DEPTH, NOT THE AUTHORITY. `layout.tsx` is the authority and
 * gates every render in the subtree. This page re-checks anyway for the reason
 * `src/app/admin/fields/[entityType]/page.tsx` does under the already-gated `/admin` layout (T-44-19,
 * and gated by that route's own test): a layout and its page render CONCURRENTLY in the App Router, so
 * without this the four reads below would still execute for a non-admin whose response is about to be
 * thrown away as a redirect. It costs one `auth()` and it means a refused visitor costs zero queries.
 *
 * WHAT PLAN 39-13 ADDED HERE. The scan panel (the CTA, the progress bar, the cancel button, the four
 * P-4 renderings) and the pair cards. Plan 39-11 deliberately stopped short of both so that ITS diff
 * read as a security boundary rather than as a layout; this is the layout half, and it changes no
 * control. Every string it adds comes from the catalog and every write it triggers goes through the
 * same six gated actions.
 */

import { eq } from "drizzle-orm"
import { CopyCheck } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import type { ReactNode } from "react"

import { auth } from "@/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { db } from "@/db"
import { users } from "@/db/schema"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import { readOrgIdentityFields } from "@/lib/dedup/identity-settings"
import { countPairs, listPairs } from "@/lib/dedup/queries"
import { calculateScanProgress, getLatestScan } from "@/lib/dedup/scan-state"

import type { ScanProgressPayload } from "./actions"
import { DuplicatesTabs } from "./duplicates-tabs"
import { IdentityFieldsForm } from "./identity-fields-form"
import { ScanPanel } from "./scan-panel"
import {
  DUPLICATE_TAB_TO_ENTITY,
  parseDuplicatePage,
  parseDuplicateTab,
  parseShowDismissed,
  type DuplicateTab,
} from "./url-params"

/**
 * A link that changes ONE view flag and drops the cursor.
 *
 * `page` is deliberately not carried across a view switch: a page-3 cursor into the open list means
 * nothing in the dismissed list, and would render an empty panel the user cannot explain. The tab is
 * preserved because the dismissed view is per tab.
 */
/**
 * The organization custom-field LABELS the identity selects offer.
 *
 * WRAPPED BECAUSE `getActiveFieldDefinitions` IS THE ONE READ ON THIS PAGE THAT CAN THROW — it is a
 * bare `db.select()` with no guard of its own, unlike the four dedup reads, which all fail closed
 * inside their own modules. `/duplicates` has no `error.tsx` above it, so an unguarded rejection here
 * would take the whole page down over a settings card (S-5).
 *
 * PROJECTED TO NAMES BEFORE THE BOUNDARY. Only labels cross into the client component; the full
 * definition rows carry config blobs, timestamps and positions that no client code on this route
 * reads, and Flight would serialize every byte of them (the D-44-02 precedent).
 */
async function readOrgFieldNames(): Promise<string[]> {
  try {
    const definitions = await getActiveFieldDefinitions("organization")

    return definitions.map((definition) => definition.name)
  } catch (error) {
    console.error("[duplicates-page] could not read the organization field definitions:", error)
    return []
  }
}

/**
 * The display name of the user who started a scan, for 39-UI-SPEC P-6's `dedup.scan.startedBy`.
 *
 * RESOLVED HERE RATHER THAN IN THE POLL, and that is a cost decision as much as a layering one. The
 * starter of a given scan never changes, so one lookup per page render is enough; resolving it inside
 * `getScanProgress` would repeat it every second for every viewer watching. The scan panel is keyed
 * by the scan id, so a different scan remounts the panel with a freshly resolved name.
 *
 * A NAME, NOT AN ID. Plan 39-11 deliberately kept the starter's user id out of the poll payload
 * (`startedByViewer` is a boolean for exactly that reason); this returns the label P-6's sentence
 * needs and nothing else. Every viewer of this route is an admin, and `name` falls back to `email`
 * because `users.name` is nullable while `email` is not.
 *
 * FAILS CLOSED TO `null`, like every other read on this page: an unresolvable name costs the sentence,
 * not the page. The cancel control's absence does NOT depend on this value — it depends on
 * `startedByViewer` — so a failed lookup cannot hand anyone a control they should not have.
 */
async function readStarterName(userId: string | null): Promise<string | null> {
  if (userId === null) return null

  try {
    const row = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { name: true, email: true },
    })

    return row?.name ?? row?.email ?? null
  } catch (error) {
    console.error("[duplicates-page] could not resolve the scan starter's name:", error)
    return null
  }
}

function viewHref(tab: DuplicateTab, dismissed: boolean): string {
  const sp = new URLSearchParams({ type: tab })

  if (dismissed) {
    sp.set("dismissed", "1")
  }

  return `/duplicates?${sp.toString()}`
}

/**
 * The shape all three emptinesses share — `empty-timeline.tsx`'s centred block, with the centred
 * `size-8 text-muted-foreground` icon the UI-SPEC's empty-state contract requires.
 *
 * A server component taking an element in `action`. That is safe here and would not be if `Button`
 * were a client module: nothing crosses an RSC boundary, because this component, its caller and
 * `Button` itself all render on the server (`button.tsx` carries no client directive). An element
 * handed to a Radix `asChild` slot ACROSS the boundary is silently dropped, which is the CFUI-01
 * defect — worth stating at the one place in this file that passes an element as a prop.
 */
function EmptyPanel({
  icon: Icon,
  heading,
  body,
  action,
}: {
  icon: LucideIcon
  heading: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="py-12 text-center">
      <Icon className="text-muted-foreground mx-auto size-8" aria-hidden="true" />
      <p className="mt-4 text-sm leading-tight font-semibold">{heading}</p>
      {body === undefined ? null : (
        <p className="text-muted-foreground mt-2 text-sm leading-normal">{body}</p>
      )}
      {action === undefined ? null : <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export default async function DuplicatesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string; dismissed?: string }>
}) {
  const params = await searchParams

  /**
   * THE INPUT-VALIDATION CONTROL (T-37-03, T-39-31). No raw search-param value reaches a query: the
   * tab is narrowed against two frozen literals, the page to a whole number at or above 1, and
   * `dismissed` to exactly `1`. Anything unrecognised silently becomes the default — never an error,
   * never an empty shell. The parsers live in `url-params.ts` and are the SAME ones
   * `duplicates-tabs.tsx` writes back through, so the panel and the tab bar cannot disagree about
   * what a valid tab is.
   */
  const tab = parseDuplicateTab(params.type)
  const page = parseDuplicatePage(params.page)
  const showDismissed = parseShowDismissed(params.dismissed)
  const entityType = DUPLICATE_TAB_TO_ENTITY[tab]

  const session = await auth()

  // Defence in depth — see the header. `layout.tsx` is the authority; this stops a non-admin's
  // concurrently-rendered page from issuing four queries whose output is discarded.
  if (!session) {
    redirect("/login?callbackUrl=/duplicates")
  }

  if (session.user.role !== "admin") {
    redirect("/?error=unauthorized")
  }

  /*
    Five independent reads, none of which throws — the four dedup reads fail closed inside their own
    modules and `readOrgFieldNames` is wrapped above.

    THE TWO IDENTITY READS ARE SKIPPED ON THE PEOPLE TAB, not merely unrendered: people match on the
    native `email` column and have no identity field, so the card does not exist there and neither
    query has anything to contribute. Issuing them anyway would be two round trips per people-tab
    render for a card nobody is going to see.
  */
  const identityNeeded = tab === "organizations"

  const [counts, list, scan, orgFieldNames, orgIdentityFields] = await Promise.all([
    countPairs(),
    listPairs({ entityType, page, dismissed: showDismissed }),
    getLatestScan(entityType),
    identityNeeded ? readOrgFieldNames() : Promise.resolve<string[]>([]),
    identityNeeded ? readOrgIdentityFields() : Promise.resolve<string[] | null>(null),
  ])

  const t = await getTranslations("dedup")
  const format = await getFormatter()

  /**
   * The tab labels' numbers, scoped to the view being shown: open counts in the open list, dismissed
   * counts behind `?dismissed=1`. A label reading `Organizations (405)` above the dismissed list
   * would be a number the user cannot account for.
   */
  const tabCounts =
    counts === null
      ? null
      : {
          organizations: showDismissed ? counts.organization.dismissed : counts.organization.open,
          people: showDismissed ? counts.person.dismissed : counts.person.open,
        }

  /**
   * How many pairs this tab holds in this view — the total, not the page.
   *
   * `dedup.review.pairsFound` says "N possible duplicates", and N is the size of the queue rather
   * than the size of the current fetch: a user on page 1 of 25 has not been shown that the other 380
   * exist. When the count query failed there is no honest total, so the loaded row count stands in
   * rather than a zero.
   */
  const pairsInTab = tabCounts === null ? (list.ok ? list.rows.length : 0) : tabCounts[tab]

  /** Whether anything is behind `?dismissed=1` for this tab. `null` counts mean "cannot tell". */
  const dismissedInTab = counts === null ? null : counts[entityType].dismissed

  /*
    THE SCAN PANEL'S FIRST PAINT, in the same shape its 1s poll returns.

    MAPPED HERE RATHER THAN SHARED WITH `getScanProgress`. A `"use server"` module may only export
    async functions, so `actions.ts` cannot export the mapper this and it would both call — the type
    is shared instead, which is what keeps the two in step: adding a field to `ScanProgressPayload`
    breaks this object until it is filled in.

    `startedByViewer` IS COMPUTED, NOT SHIPPED. The row's `userId` never crosses to the browser
    (39-11's decision); what crosses is the answer to "may I cancel", plus — only when the answer is
    no — the starter's display name.
  */
  const scanPayload: ScanProgressPayload | null =
    scan === null
      ? null
      : {
          scanId: scan.scanId,
          entityType: scan.entityType,
          status: scan.status,
          cancelled: scan.cancelled,
          current: scan.progress.current,
          total: scan.progress.total,
          percentage: calculateScanProgress(scan.progress),
          startedAt: scan.startedAt.toISOString(),
          startedByViewer: scan.userId === session.user.id,
        }

  /*
    ONE EXTRA READ, AND ONLY IN THE ONE STATE THAT RENDERS IT: a scan of this entity type that is
    still in flight and that this viewer did not start. Every other combination — no scan, a finished
    scan, the viewer's own scan — resolves to `null` without a query.
  */
  const starterNeeded =
    scanPayload !== null &&
    !scanPayload.startedByViewer &&
    (scanPayload.status === "running" || scanPayload.status === "idle")

  const startedByName = starterNeeded ? await readStarterName(scan?.userId ?? null) : null

  /*
    `dedup.scan.lastRun`, BUILT ON THE SERVER. The panel is a client component and a relative-time
    string it computed itself would differ between the SSR render and hydration for anything less
    than a minute old — the exact age of a scan that just finished. `updatedAt` rather than
    `startedAt`, because the sentence is about when the scan finished, and it is the same instant the
    zero-pairs empty state below quotes.

    Only a COMPLETED scan gets it. "Last scanned {time}" is a claim a cancelled scan has not earned.
  */
  const lastRunLabel =
    scan !== null && scan.status === "completed"
      ? t("scan.lastRun", { time: format.relativeTime(scan.updatedAt) })
      : null

  let panel: ReactNode

  if (!list.ok) {
    /*
      THE DEGRADED READ, AND IT IS NOT AN EMPTY STATE. `listPairs` never returns an empty success on
      failure, which is the whole reason this branch can exist and be distinguishable. The tab
      degrades to a message rather than taking the page down, exactly as `record-timeline.tsx` and
      `run-changed-records.tsx` do. The generic app-wide "something went wrong" key is deliberately
      not used and is NOT SPELLED ANYWHERE IN THIS FILE — the plan's acceptance criteria grep for it,
      and a grep cannot tell code from prose. Every error on this surface names its own problem.
    */
    panel = (
      <div className="text-muted-foreground rounded-md border p-6 text-center text-sm">
        {t("review.unavailable")}
      </div>
    )
  } else if (list.rows.length > 0) {
    panel = (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">{t("review.pairsFound", { count: pairsInTab })}</p>
        {/*
          PLAN 39-13 REPLACES THIS REGION with the pair cards (UI-SPEC L-3/L-4: a `rounded-md border
          p-4` card per pair, both records stacked, never side by side) and with `dedup.review.merge`
          / `dedup.review.dismiss` wired to the actions this plan already exports. The count line
          above belongs to THIS plan and stays.
        */}
      </div>
    )
  } else if (scan === null) {
    /*
      NEVER SCANNED. The control that resolves it — the primary `dedup.scan.startOrganizations` /
      `startPeople` CTA — is part of plan 39-13's scan panel, which is a client component because
      starting a scan is a transition with a toast. Rendering a dead button here instead would be
      worse than rendering none.
    */
    panel = (
      <EmptyPanel
        icon={CopyCheck}
        heading={t("review.emptyNeverScanned")}
        body={t("review.emptyNeverScannedBody")}
      />
    )
  } else if (!showDismissed && dismissedInTab !== null && dismissedInTab > 0) {
    /*
      EVERY PAIR DISMISSED. There is no `emptyAllDismissedBody` key by design: the body IS the control
      that resolves the state (UI-SPEC L-6). One control, no redundant sentence.
    */
    panel = (
      <EmptyPanel
        icon={CopyCheck}
        heading={t("review.emptyAllDismissed")}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href={viewHref(tab, true)}>{t("review.showDismissed")}</Link>
          </Button>
        }
      />
    )
  } else if (showDismissed) {
    /*
      THE DISMISSED VIEW, EMPTY. Deliberately WITHOUT `emptyNoPairsBody`: that sentence says "nothing
      matched in the last scan", which is a claim about the scan and not about this list. The heading
      alone is true here, and the way back out is the control beneath.
    */
    panel = (
      <EmptyPanel
        icon={CopyCheck}
        heading={t("review.emptyNoPairs")}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href={viewHref(tab, false)}>{t("review.hideDismissed")}</Link>
          </Button>
        }
      />
    )
  } else if (scan.status === "completed") {
    /*
      SCANNED AND FOUND NOTHING. Gated on `completed` rather than on "a scan row exists", because
      `emptyNoPairsBody` asserts that the last scan matched nothing — a claim a running, cancelled or
      errored scan has not earned. `{time}` is a pre-formatted string: the sentence's word order
      differs across the three locales, so the formatter runs here and the catalog interpolates.
    */
    panel = (
      <EmptyPanel
        icon={CopyCheck}
        heading={t("review.emptyNoPairs")}
        body={t("review.emptyNoPairsBody", { time: format.relativeTime(scan.updatedAt) })}
      />
    )
  } else {
    /*
      A SCAN THAT IS RUNNING, CANCELLED OR ERRORED, with nothing to list yet. None of the three empty
      copies is true here — "no scan yet" is false, and "nothing matched in the last scan" is a
      conclusion the scan has not reached — so this position still says nothing rather than something
      wrong. THE SCAN PANEL ABOVE IS NOW WHAT EXPLAINS IT: P-4 gives `running` a progress bar with a
      count, `error` a destructive `dedup.scan.failed` Alert, and `cancelled` the rescan CTA with no
      claim about what the scan found. The card itself is not rendered around this `null` — see the
      render below.
    */
    panel = null
  }

  /**
   * THE WAY INTO AND OUT OF THE DISMISSED VIEW, when the panel above does not already carry it.
   *
   * UI-SPEC L-6 makes dismissal reversible, and a reversal the user cannot navigate to is not one:
   * without this, an admin who dismisses every pair but the last has no route to `?dismissed=1` at
   * all. It renders BELOW the list, as a ghost button, and never alongside the empty-state control
   * that already resolves the same state — one control per decision.
   *
   * In the open list it appears only when there is something behind the flag, or when the count query
   * failed and therefore cannot rule it out. A link to a list known to be empty is noise.
   */
  let footer: ReactNode = null

  if (list.ok && list.rows.length > 0) {
    footer = showDismissed ? (
      <div className="flex justify-center">
        <Button asChild variant="ghost" size="sm">
          <Link href={viewHref(tab, false)}>{t("review.hideDismissed")}</Link>
        </Button>
      </div>
    ) : dismissedInTab === null || dismissedInTab > 0 ? (
      <div className="flex justify-center">
        <Button asChild variant="ghost" size="sm">
          <Link href={viewHref(tab, true)}>{t("review.showDismissed")}</Link>
        </Button>
      </div>
    ) : null
  }

  return (
    <div className="container py-8">
      <div className="space-y-6">
        {/*
          The list-page header idiom, verbatim from `organizations/page.tsx` and `/trash`.
          `/duplicates` is a sibling of the user-facing list pages and joins their shell rather than
          the `/admin` rail. The display-typography h1 below is what `e2e/viewport-320.spec.ts`
          locates by role, so its shape is load-bearing rather than decorative — and its classes are
          spelled ONCE, in the element itself, because the plan's acceptance criteria count them and a
          grep cannot tell code from prose.
        */}
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 rounded-lg p-2">
            <CopyCheck className="text-primary h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{t("scan.title")}</h1>
            <p className="text-muted-foreground">{t("scan.description")}</p>
          </div>
        </div>

        <DuplicatesTabs tab={tab} counts={tabCounts}>
          <div className="space-y-4">
            {/*
              THE SCAN PANEL, ABOVE THE TAB'S CONTENT. It is per entity type, so it belongs inside the
              tab body rather than above the tab bar: an organization scan must not appear to be a
              people scan when the user switches tabs.

              THE KEY CARRIES THE ENTITY TYPE AS WELL AS THE SCAN ID, and both halves are load-bearing.
              Switching tabs re-renders this position with an identical tree shape, so React would
              otherwise REUSE the client instance and carry one tab's polled state — including an
              optimistic "running" a click just produced — onto the other tab's panel. The scan id half
              is what makes a newly landed server render (a scan this viewer just started, or another
              admin's scan that started first) reset the panel to server truth instead of keeping a
              stale client state. This is the sanctioned React reset, and it is why the panel needs no
              state-syncing effect at all.
            */}
            <ScanPanel
              key={`${entityType}:${scanPayload?.scanId ?? "none"}`}
              entityType={entityType}
              initialScan={scanPayload}
              startedByName={startedByName}
              lastRunLabel={lastRunLabel}
            />

            {/*
              NO EMPTY CARD. `panel` is `null` for a scan that is in flight or was cancelled with
              nothing to list, and a bordered card containing nothing is a card the user tries to read.
              The scan panel directly above is what explains that emptiness — a progress bar while the
              scan runs, a destructive Alert when it failed — so this position stays silent rather than
              drawing a frame around the silence.
            */}
            {panel === null ? null : (
              <Card>
                <CardContent>{panel}</CardContent>
              </Card>
            )}
            {footer}

            {/*
              THE IDENTITY CARD RENDERS ONLY UNDER THE ORGANIZATIONS TAB. People are matched on the
              native `email` column and need no identity field at all, so the setting has no meaning
              there — and a settings card that appears on a tab it does not govern is a card an admin
              will eventually configure for the wrong entity type.

              `readOrgIdentityFields` returns `null` for unconfigured, corrupted, over-long and
              unreadable alike; all of them are "nothing is configured" from this form's position, so
              they collapse onto an empty array here rather than being distinguished in the UI.
            */}
            {identityNeeded ? (
              <IdentityFieldsForm
                fieldNames={orgFieldNames}
                value={orgIdentityFields ?? []}
              />
            ) : null}
          </div>
        </DuplicatesTabs>
      </div>
    </div>
  )
}
