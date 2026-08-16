"use client"

/**
 * The four `/trash` tabs.
 *
 * THE TAB IS THE URL, NOT REACT STATE. The `Tabs` root is CONTROLLED from the `tab` prop the
 * server component parsed out of `?type=`, and `onValueChange` writes the new value back to the
 * URL instead of holding it locally. An uncontrolled root would mean the rows, the page cursor
 * and the four counts came from one place and the selected tab from another, and the two could
 * disagree; here one server render owns all four, so they cannot. It also makes
 * `?type=organizations` render that tab at first paint with no flash, and makes "look at what's
 * in trash" a shareable link.
 *
 * Switching tabs DELETES `page`. Carrying a page-3 cursor across a tab change would show an
 * empty table for no reason the user can see.
 *
 * MANUAL ACTIVATION IS REQUIRED, NOT STYLISTIC. Radix `Tabs` selects on focus by default; with
 * tab changes wired to `router.push`, arrowing across four tabs would fire four server
 * navigations. The manual mode moves focus with the arrow keys and activates on Enter or Space —
 * one navigation, one round trip. This is a performance decision and an accessibility one, and
 * it must not be dropped (T-37-35).
 *
 * Zero accent-coloured elements. Radix's active tab is a `bg-background` chip on a `bg-muted`
 * track, which is what the vendored `tabs.tsx` already ships. Do not "fix" it to the accent
 * token (37-UI-SPEC § Color).
 */

import { Building2, CheckCircle2, Kanban, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { TRASH_TABS, type TrashTab } from "@/lib/trash/entity-types"

/**
 * The app's own nav vocabulary (`nav-header.tsx`), so zero new symbols enter the product and a
 * tab is drawn with the same glyph as the list the record returns to.
 */
const TAB_ICONS: Readonly<Record<TrashTab, LucideIcon>> = Object.freeze({
  deals: Kanban,
  people: Users,
  organizations: Building2,
  activities: CheckCircle2,
})

interface TrashTabsProps {
  /** The active tab, already narrowed by `parseTrashTab` in the server component. */
  tab: TrashTab
  /**
   * `null` means the count query failed. The labels then render WITHOUT counts rather than
   * printing a zero: a count a user cannot explain is a visible defect, a missing count is
   * merely quiet (queries.ts — `countTrashed` returns `null`, never a record of zeros).
   */
  counts: Record<TrashTab, number> | null
  /** The active tab's panel, server-rendered and handed down as an ordinary child. */
  children: ReactNode
}

export function TrashTabs({ tab, counts, children }: TrashTabsProps) {
  const router = useRouter()

  /**
   * The tab labels reuse the EXISTING `nav.*` keys rather than four new ones. Not key thrift:
   * it guarantees the tab is named identically to the nav item the record returns to, which is
   * the sentence the restore toast then repeats ("{name} is back in {list}").
   */
  const tNav = useTranslations("nav")

  function handleTabChange(value: string) {
    const sp = new URLSearchParams(window.location.search)

    sp.set("type", value)
    sp.delete("page")

    router.push(`/trash?${sp.toString()}`)
  }

  return (
    <Tabs value={tab} onValueChange={handleTabChange} activationMode="manual">
      <TabsList>
        {/*
          All four tabs always render. A tab with zero records is still labelled and still
          selectable — a tab that appears and disappears between visits is worse than one that
          reports nothing to show.
        */}
        {TRASH_TABS.map((value) => {
          const Icon = TAB_ICONS[value]

          return (
            <TabsTrigger key={value} value={value} className="gap-2">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tNav(value)}
              {counts === null ? null : (
                <span className="text-muted-foreground text-xs">
                  ({counts[value]})
                </span>
              )}
            </TabsTrigger>
          )
        })}
      </TabsList>

      {/*
        ONE content node, for the ACTIVE tab only. The other three values simply have none, so
        the page never fetches four tables to show one — the obvious wrong turn here, and this
        comment exists so it is not taken.
      */}
      <TabsContent value={tab} className="mt-4">{children}</TabsContent>
    </Tabs>
  )
}
