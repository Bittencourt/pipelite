"use client"

/**
 * The two `/duplicates` tabs.
 *
 * THE TAB IS THE URL, NOT REACT STATE. The `Tabs` root is CONTROLLED from the `tab` prop the server
 * component parsed out of `?type=`, and `onValueChange` writes the new value back to the URL instead
 * of holding it locally — `trash-tabs.tsx` verbatim. An uncontrolled root would mean the rows, the
 * page cursor and both counts came from one render and the selected tab from another, and the two
 * could disagree. It also makes `?type=organizations` render that tab at first paint with no flash,
 * which is exactly what the `Find duplicates` links plan 39-16 shipped into the `/organizations` and
 * `/people` toolbars depend on (UI-SPEC L-1).
 *
 * SWITCHING TABS DELETES `page`. Carrying a page-3 cursor across a tab change would show an empty
 * list for no reason the user can see.
 *
 * `dismissed` DELIBERATELY SURVIVES A TAB CHANGE. It is a view mode rather than a cursor: a user who
 * is auditing dismissals in one tab is still auditing dismissals in the other, and dropping it would
 * silently return them to the open list.
 *
 * MANUAL ACTIVATION IS REQUIRED, NOT STYLISTIC. Radix `Tabs` selects on focus by default; with tab
 * changes wired to `router.push`, arrowing across the tabs would fire a server navigation per tab.
 * Manual mode moves focus with the arrow keys and activates on Enter or Space — one navigation, one
 * round trip. A performance decision and an accessibility one, and it must not be dropped (T-37-35).
 *
 * ZERO ACCENT-COLOURED ELEMENTS. Radix's active tab is a `bg-background` chip on a `bg-muted` track,
 * which is what the vendored `tabs.tsx` already ships (UI-SPEC § Color).
 */

import { Building2, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { DUPLICATE_TABS, type DuplicateTab } from "./url-params"

/**
 * The app's own nav vocabulary (`nav-header.tsx`), so zero new symbols enter the product and a tab is
 * drawn with the same glyph as the list its records live in.
 */
const TAB_ICONS: Readonly<Record<DuplicateTab, LucideIcon>> = Object.freeze({
  organizations: Building2,
  people: Users,
})

interface DuplicatesTabsProps {
  /** The active tab, already narrowed by `parseDuplicateTab` in the server component. */
  tab: DuplicateTab
  /**
   * The pair count per tab, ALREADY SCOPED TO THE VIEW the user is looking at — open counts in the
   * open list, dismissed counts behind `?dismissed=1`. Resolved on the server so the label and the
   * rows come from one render.
   *
   * `null` means the count query failed. The labels then render WITHOUT counts rather than printing a
   * zero: a count a user cannot explain is a visible defect, a missing count is merely quiet
   * (`countPairs` returns `null`, never a record of zeros).
   */
  counts: Record<DuplicateTab, number> | null
  /** The active tab's panel, server-rendered and handed down as an ordinary child. */
  children: ReactNode
}

export function DuplicatesTabs({ tab, counts, children }: DuplicatesTabsProps) {
  const router = useRouter()

  /**
   * The tab labels reuse the EXISTING `nav.*` keys rather than two new ones (UI-SPEC L-2). Not key
   * thrift: it guarantees each tab is named identically to the list its records live in, which is the
   * list the merge screen sends the survivor back to.
   */
  const tNav = useTranslations("nav")

  function handleTabChange(value: string) {
    const sp = new URLSearchParams(window.location.search)

    sp.set("type", value)
    sp.delete("page")

    router.push(`/duplicates?${sp.toString()}`)
  }

  return (
    <Tabs value={tab} onValueChange={handleTabChange} activationMode="manual">
      {/*
        `max-w-full` plus horizontal scrolling is load-bearing, not cosmetic: with the default
        `w-fit` the list widens the PAGE rather than scrolling itself, which is what pushed
        `/trash` past its own scroll width at 320px and cost that phase a rebuild (K-3, R-7).
        Two triggers are narrower than four, so this is insurance rather than a measured
        overflow — and it costs nothing, whereas a third tab added later without it would
        reintroduce the defect silently.
      */}
      <TabsList className="max-w-full overflow-x-auto">
        {/*
          BOTH tabs always render. A tab with zero pairs is still labelled and still selectable — a
          tab that appears and disappears between visits is worse than one that reports nothing.
        */}
        {DUPLICATE_TABS.map((value) => {
          const Icon = TAB_ICONS[value]

          return (
            <TabsTrigger key={value} value={value} className="gap-2">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tNav(value)}
              {counts === null ? null : (
                <span className="text-muted-foreground text-xs">({counts[value]})</span>
              )}
            </TabsTrigger>
          )
        })}
      </TabsList>

      {/*
        ONE content node, for the ACTIVE tab only. The other value simply has none, so the page never
        queries both entity types to show one — the obvious wrong turn here, and this comment exists
        so it is not taken. `listPairs` is a join over the whole `duplicate_pairs` table plus the
        record table; paying for it twice per render would double the cost of every tab click.
      */}
      <TabsContent value={tab} className="mt-4">
        {children}
      </TabsContent>
    </Tabs>
  )
}
