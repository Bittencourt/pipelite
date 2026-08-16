/**
 * /trash — soft-deleted records per entity type, with when they went and who sent them there.
 *
 * ONE SERVER RENDER OWNS EVERYTHING. The active tab's rows, its page cursor and all four tab
 * counts are produced here, from the same viewer, in the same render. That is what makes it
 * impossible for a tab to say `Deals (12)` above a table holding three rows: the counts and the
 * rows are scoped by construction inside `queries.ts` rather than by two hand-written clauses
 * that happen to agree today (T-37-02).
 *
 * ONLY THE ACTIVE TAB IS QUERIED FOR ROWS. The other three contribute a cheap scoped `count(*)`
 * and nothing else. Fetching four tables to show one is the obvious wrong turn here.
 *
 * SPLIT (CFUI-01)
 * This module is a server component. Everything stateful — the tab bar's `router.push`, the row
 * actions, both transitions, the toasts and the purge `AlertDialog` — lives in `trash-tabs.tsx`
 * and `trash-table.tsx`, both of which carry the client directive on their first line. (That
 * directive is spelled out in neither this comment nor anywhere else in this file: an acceptance
 * gate greps the raw text for zero occurrences of it, and a gate a comment can invalidate is not
 * a gate.) Only plain serializable values cross: a string
 * literal tab, a record of numbers or `null`, plain row data, two booleans and two numbers.
 * No function and no React element is handed to a Radix `asChild` slot from here, which is what
 * the repo-wide gate in
 * `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` enforces.
 *
 * FIRST PAINT IS SERVER-RENDERED — page 1 of the active tab plus all four counts. No skeleton,
 * no spinner on initial load, no client data fetching.
 *
 * OUT OF SCOPE, DELIBERATELY: no search input, no sort control, no checkbox column, and no trash
 * badge in the nav header. The list is bounded by the retention window and ordered
 * newest-deleted-first, which already puts "the thing I just deleted by mistake" at row 1.
 */

import { Trash2 } from "lucide-react"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { auth } from "@/auth"
import { Card, CardContent } from "@/components/ui/card"
import { parseTrashPage, parseTrashTab } from "@/lib/trash/entity-types"
import { countTrashed, listTrashed } from "@/lib/trash/queries"
import { readTrashRetentionDays } from "@/lib/trash/settings"

import { TrashTable } from "./trash-table"
import { TrashTabs } from "./trash-tabs"

export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>
}) {
  const params = await searchParams

  /**
   * THE INPUT-VALIDATION CONTROL (T-37-03). No raw search-param value may reach a query: the
   * tab is narrowed against four frozen literals and anything unrecognised silently becomes
   * `deals` — never an error, never an empty shell — and the page is bounded on both ends so a
   * crafted `?page=99999999` cannot ask the database to skip millions of rows.
   */
  const tab = parseTrashTab(params.type)
  const page = parseTrashPage(params.page)

  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  const viewer = { userId: session.user.id, role: session.user.role }

  /**
   * VISIBILITY ONLY. This decides whether the purge control is RENDERED; it is never the
   * authorization. `purgeRecord` and the REST route both re-check the role independently, which
   * is what makes hiding rather than disabling the control safe (T-37-01).
   */
  const isAdmin = session.user.role === "admin"

  // Three independent reads, none of which throws — every one fails closed inside its own
  // module — so the page renders even when the database is unhappy. `/trash` has no `error.tsx`
  // above it, so that posture is the only thing between a bad query and a dead page (T-37-20).
  const [counts, list, retentionDays] = await Promise.all([
    countTrashed(viewer),
    listTrashed(tab, page, viewer),
    readTrashRetentionDays(),
  ])

  const t = await getTranslations("trash")

  return (
    <div className="container py-8">
      <div className="space-y-6">
        {/*
          The list-page header idiom, verbatim from `organizations/page.tsx`. `/trash` is a
          sibling of the four user-facing list pages and joins their shell; `/admin/trash` uses
          the bare-<h1> admin shell instead. Two shells because there are two established
          shells; this phase mints neither.
        */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Trash2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground">{t("description")}</p>
          </div>
        </div>

        <TrashTabs tab={tab} counts={counts}>
          <Card>
            <CardContent>
              {list.ok ? (
                /*
                  `retentionDays` is `null` whenever the window is unset, corrupted or out of
                  range. That null is what selects the empty state's no-retention copy, so the
                  page never promises a window the pruner is not enforcing.
                */
                <TrashTable
                  tab={tab}
                  rows={list.rows}
                  hasMore={list.hasMore}
                  page={page}
                  isAdmin={isAdmin}
                  retentionDays={retentionDays}
                />
              ) : (
                /*
                  `listTrashed` returns `{ ok: false }` and never an empty success, precisely so
                  this panel is distinguishable from "nothing in trash". The tab degrades to a
                  message rather than taking the page down, exactly as `record-timeline.tsx` and
                  `run-changed-records.tsx` do.
                */
                <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
                  {t("error.unavailable")}
                </div>
              )}
            </CardContent>
          </Card>
        </TrashTabs>
      </div>
    </div>
  )
}
