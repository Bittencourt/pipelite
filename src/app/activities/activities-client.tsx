"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { RowSelectionState } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Calendar, List, CheckCircle2, Search } from "lucide-react"
import { ActivityList, Activity } from "./activity-list"
import { ActivityDialog } from "./activity-dialog"
import { ActivityCalendar } from "./activity-calendar"
import { ActivityFilters } from "./activity-filters"
import {
  bulkDeleteActivities,
  bulkReassignActivityOwner,
  exportSelectedActivities,
} from "./actions"
import { BulkActionBar } from "@/components/bulk/bulk-action-bar"
import { BulkFailureReport } from "@/components/bulk/bulk-failure-report"
import { SavedViewsBar } from "@/components/views/saved-views-bar"
import type { SavedViewsBarProps } from "@/lib/views/types"
import { withViewEscape } from "@/lib/views/url-params"
import type { BulkOutcome } from "@/lib/bulk/types"
import { useTranslations } from "next-intl"

interface ActivityType {
  id: string
  name: string
  icon: string | null
  color: string | null
}

interface DealInfo {
  id: string
  title: string
  stageId: string
  stage?: { name: string; pipelineId: string } | null
  pipeline?: { name: string } | null
}

interface ActivitiesClientProps {
  activities: Activity[]
  activityTypes: ActivityType[]
  deals: DealInfo[]
  owners: Array<{ id: string; name: string }>
  users: Array<{ id: string; name: string; email: string }>
  /**
   * Reassign targets for the bulk bar ONLY — active, non-deleted users. Deliberately a separate
   * list from `owners` above, which is the unfiltered pool the filter dropdown and the activity
   * dialog have always shown (T-38-06).
   */
  bulkOwners: Array<{ id: string; name: string }>
  /** `null` means nothing is purged automatically. Never defaulted anywhere in this file. */
  retentionDays: number | null
  /**
   * All eight bar props, resolved on the server and spread straight onto `<SavedViewsBar>`.
   *
   * ONE PROP AND NOT EIGHT, deliberately: `SavedViewsBarProps` is declared once in
   * `src/lib/views/types.ts` and this component has no opinion about any member of it. Destructuring
   * it here would give the eight props a second declaration site that could drift from the first,
   * and would make this file a thing to edit every time the bar's contract changes.
   */
  viewsBar: SavedViewsBarProps
  activeFilters: {
    type: string | null
    owner: string | null
    assignee: string | null
    status: string | null
    dateFrom: string | null
    dateTo: string | null
  }
  hasMore?: boolean
  search?: string
  currentPage?: number
}

export function ActivitiesClient({
  activities,
  activityTypes,
  deals,
  owners,
  users,
  bulkOwners,
  retentionDays,
  viewsBar,
  activeFilters,
  hasMore = false,
  search = "",
  currentPage = 1,
}: ActivitiesClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const t = useTranslations('activities')

  /**
   * THE BULK SELECTION LIVES HERE AND NOT IN `ActivityList`, WHICH OWNS THE TABLE.
   *
   * This component owns the Load More button, the filter row and the `search` prop; the list owns
   * none of the three. Keeping the state — and therefore the bar — inside the list would place the
   * bar's 80px spacer ABOVE the Load More button, so the fixed bar would cover the one control the
   * spacer exists to keep reachable (T-38-38), and there would be no filter key to clear the
   * selection on.
   */
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null)

  /**
   * The submitted id list, intersected with the rows actually loaded.
   *
   * THE GROUND FOR THE INTERSECTION IS PHANTOM KEYS, NOT FILTERING. TanStack does not prune
   * `rowSelection` when a row leaves `data`, so after a bulk delete the deleted rows' keys linger in
   * the map and would inflate the bar's count and the next submitted array (T-38-37). It is worth
   * being precise about what this is NOT defending against: `activity-list.tsx` configures
   * `getFilteredRowModel()`, but that row model is INERT here — no column or global filter state is
   * ever set on that table, and every Activities filter is applied server-side through URL params —
   * so the filtered row model equals the core row model and the filter-hidden-row justification used
   * on other surfaces does not apply on this one.
   *
   * Derived over the SAME array handed to `ActivityList`, so the two cannot drift.
   */
  const loadedIds = useMemo(() => new Set(activities.map((a) => a.id)), [activities])
  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id] && loadedIds.has(id)),
    [rowSelection, loadedIds]
  )

  /**
   * CLEARING ON A FILTER CHANGE IS KEYED ON THIS STRING AND NEVER ON THE `activities` ARRAY.
   *
   * Phase 35 measured that `revalidatePath` re-renders the current client tree regardless of the
   * path argument, and every bulk action calls it — so a reset keyed on the server-rebuilt
   * `activities` prop would fire in the middle of a bulk action and wipe the failed-record selection
   * that has to survive it (T-38-33). The signature only changes when the user actually changes the
   * search or a filter, both of which are URL state.
   *
   * This is React's documented adjust-state-when-a-prop-changes pattern rather than an effect,
   * because this repo's React Compiler lint rule (`react-hooks/set-state-in-effect`) makes a
   * synchronous state update inside an effect a build ERROR — the three existing suppressions are
   * all logged deferrals and this is not the plan to add a fourth. The trigger is identical either
   * way: the block runs only on the render where the signature actually changed, and nothing derived
   * from `activities` can reach it.
   */
  const filterSignature = useMemo(
    () => JSON.stringify({ search, ...activeFilters }),
    [search, activeFilters]
  )

  const [lastFilterSignature, setLastFilterSignature] = useState(filterSignature)
  if (lastFilterSignature !== filterSignature) {
    setLastFilterSignature(filterSignature)
    setRowSelection({})
  }

  const handleAddNew = () => {
    setEditingActivity(null)
    setDialogOpen(true)
  }

  const handleEdit = (activity: Activity) => {
    setEditingActivity(activity)
    setDialogOpen(true)
  }

  // Closing is the dialog's decision, taken through onOpenChange. This callback refreshes
  // the list and nothing else: a create whose record landed but whose note did not stays
  // open on purpose so the typed note survives (T-35-31), and closing it from here is
  // exactly what defeated that.
  const handleDialogOpenChange = (next: boolean) => {
    setDialogOpen(next)
    if (!next) setEditingActivity(null)
  }

  const handleRecordSaved = () => {
    startTransition(() => {
      router.refresh()
    })
  }

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh()
    })
  }

  /*
    ROUTED THROUGH `withViewEscape` EVEN THOUGH IT CANNOT PRODUCE A BARE URL.

    This handler always sets `page`, so its query string is never empty and the redirect guard could
    never recapture it. It goes through the helper anyway so this file has ONE rule for building a
    list-route URL rather than two, and so plan 40-14's exhaustive call-site gate needs no exemption
    for it. The helper preserves `page` verbatim — `page` is not in the saveable whitelist, so a
    `?page=2` URL comes back as `page=2&view=none` when no filter survives, and as
    `page=2&<filters>&view=<id>` when one does.

    NO `view=` WRITER IS ADDED HERE, and none is needed. `sp` is cloned from
    `window.location.search`, so a `view` key already in the URL is already in the input, and
    `withViewEscape` carries a live selection through untouched (plan 40-18). That is precisely why
    the preservation rule lives inside the helper instead of being threaded as a prop: this component
    changes the page, never the selection.
  */
  const handleLoadMore = () => {
    const sp = new URLSearchParams(window.location.search)
    sp.set("page", String(currentPage + 1))
    router.push(`/activities?${withViewEscape("activity", sp)}`)
  }

  /**
   * What a settled bulk delete or reassign does to the selection — explicitly, here, and never
   * through an effect.
   *
   * Succeeded ids are removed and every failed id is KEPT SELECTED, which is what lets a user retry
   * exactly the records that refused without re-picking them out of a list of fifty. Ids the user
   * ticked while the request was in flight are preserved too, because this rewrites the previous map
   * rather than rebuilding it from the result.
   */
  const handleOutcome = (next: BulkOutcome) => {
    setRowSelection((prev) => {
      const kept: RowSelectionState = { ...prev }
      for (const id of next.succeeded) {
        delete kept[id]
      }
      for (const failure of next.failed) {
        kept[failure.id] = true
      }
      return kept
    })

    // A clean run replaces any earlier report with nothing; a partial one names the records.
    setOutcome(next.failed.length > 0 ? next : null)

    // This component's existing refresh handler, called by its existing name. The Phase 35 rename
    // of the dialog's callback to `onRecordSaved` is not being undone here.
    handleRefresh()
  }

  /**
   * Resolves a display name for the failure report. The bar calls it at SUBMIT time, so a record
   * that later fails with `notFound` still has the title it had when the user selected it. Falls
   * back to the raw id, which still names the record.
   */
  const getActivityLabel = (id: string) =>
    activities.find((a) => a.id === id)?.title ?? id

  const handleClearSelection = () => {
    setRowSelection({})
    setOutcome(null)
  }

  /*
   * THE STATS ROW USES THE SAME THREE WORDS AS THE STATUS FILTER, AND THEY NOW MEAN THE SAME THING
   * (review finding WR-05).
   *
   * `pendingCount` was `!a.completedAt` — every incomplete activity, overdue ones included. The
   * status filter's "Pending" option means "not completed AND not yet due" (see `getActivities`),
   * and the two sat on the same screen using one word for two different sets: a user reading
   * "Pending: 50" and then selecting "Pending" from the filter got a different number back, with
   * nothing to explain the gap. That divergence was in fact the argument offered FOR the broken
   * predicate; the predicate was fixed, so this follows it rather than the other way round.
   *
   * OVERDUE IS COUNTED SEPARATELY RATHER THAN FOLDED BACK IN, so the three numbers still account for
   * every row on the page. Narrowing "Pending" without adding this would have made the overdue rows
   * vanish from the summary entirely — a worse reading than the one being fixed. `t('overdue')` is
   * the SAME catalog key the filter's third option renders, so no string was added in any locale.
   *
   * The cutoff is read once, so a row cannot be counted in two buckets by a clock tick between the
   * two filters.
   */
  const nowForStats = new Date()
  const completedCount = activities.filter((a) => a.completedAt).length
  const pendingCount = activities.filter(
    (a) => !a.completedAt && new Date(a.dueDate) >= nowForStats
  ).length
  const overdueCount = activities.filter(
    (a) => !a.completedAt && new Date(a.dueDate) < nowForStats
  ).length

  // Check if any filters are active
  const hasActiveFilters = Object.values(activeFilters).some((v) => v !== null)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 p-2 bg-primary/10 rounded-lg">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">
              {t('manageActivities')}
            </p>
          </div>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          {t('addActivity')}
        </Button>
      </div>

      {/*
        Stats.

        THE TWO `bg-*-500` DOTS BELOW ARE THE K-2 ANTI-PATTERN, AND THEY ARE LEFT ALONE ON PURPOSE.
        `bg-green-500` and `bg-amber-500` are raw palette colours rather than semantic tokens, so
        they do not follow the theme — which is exactly the pattern this phase's bar must not copy,
        and the reason `saved-views-bar.tsx` uses tokens throughout. Naming them here is the point:
        they are the nearest bad example to the code this plan added, they are PRE-EXISTING, and
        fixing them is out of scope. This phase's obligation is not to spread the pattern, not to
        repay it — a colour change to a stats row is a visual change nobody asked this plan for.
      */}
      <div className="flex gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-muted-foreground">{t('completed')}:</span>
          <span className="font-medium">{completedCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">{t('pending')}:</span>
          <span className="font-medium">{pendingCount}</span>
        </div>
        <div className="flex items-center gap-2">
          {/*
            A SEMANTIC TOKEN, not a third raw palette colour. The two dots above are pre-existing
            K-2 violations that the comment on this block declines to repay; the obligation is not
            to SPREAD the pattern, so the dot this fix adds uses `bg-destructive`.
          */}
          <div className="h-2 w-2 rounded-full bg-destructive" />
          <span className="text-muted-foreground">{t('overdue')}:</span>
          <span className="font-medium">{overdueCount}</span>
        </div>
      </div>

      {/* Tabs for List/Calendar view */}
      <Tabs defaultValue="list" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="list" className="gap-2">
            <List className="h-4 w-4" />
            {t('list')}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2">
            <Calendar className="h-4 w-4" />
            {t('calendar')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <div className="space-y-4">
            {/*
              THE SAVED-VIEWS BAR, AND THE PLACEMENT HAS THREE SEPARATE REASONS.

              RULE P-1 — ONLY THE `list` TAB. The `calendar` tab below reads no filter params at all:
              `ActivityCalendar` receives the same `activities` array and draws a month grid from it,
              with no `search`, no chips and no URL writer. A view picker mounted there would offer
              to restore filters the surface cannot apply and cannot show the user it applied.
              Mounting the bar OUTSIDE `<TabsContent>` — as a sibling of `<TabsList>`, which is where
              a "toolbar" instinctively wants to go — would put it in both tabs at once. So it is
              inside this `TabsContent` and nowhere else.

              NOT INSIDE `activity-filters.tsx`, DESPITE 40-CONTEXT NOMINATING IT as "the richest
              filter toolbar and the natural host". That nomination is declined on measured grounds
              (amendment A3). Two measurements, both taken on this surface: its filter row is EXACTLY
              full at 241px — search input 147 + 8px gap + "Filters" button 86 — with zero slack in
              en-US, so there is no room for a second control on that line; and its `PopoverContent`
              renders 388px tall at `top: -41` inside a 640px viewport, clipping 41px off the top of
              the screen, because `popover.tsx` never consumes Radix's computed available height.
              Mounting this phase's PRIMARY affordance inside a container that already puts content
              off screen would reproduce F-39-07 deliberately. The popover defect is pre-existing,
              recorded in BACKLOG.md and out of scope here — this plan's only obligation toward it is
              to not add to it, which it discharges by putting nothing inside a `Popover`.

              ITS OWN ROW, NOT STICKY AND NOT FIXED (K-8). `bulk-action-bar.tsx`, mounted at the
              bottom of this same stack, is already a fixed bar on this page. A second fixed element
              would compete with it for the bottom of the viewport and for the 80px spacer that bar
              renders to buy back the space it covers.
            */}
            <SavedViewsBar {...viewsBar} />

            <ActivityFilters
              activityTypes={activityTypes}
              owners={owners}
              assignees={users.map(u => ({ id: u.id, name: u.name || u.email }))}
              search={search}
            />

            {/*
              The report belongs ABOVE the table and below the filter row: it is a list to read, not
              a control to press, and it can run to several lines — so it cannot live inside the
              fixed bar, which has to stay one compact cluster at every viewport width.
            */}
            {outcome !== null && outcome.failed.length > 0 && (
              <BulkFailureReport
                kind={outcome.kind}
                failures={outcome.failed}
                labelById={outcome.labelById}
                stillSelected={outcome.failed.filter((f) => loadedIds.has(f.id)).length}
                onDismiss={() => setOutcome(null)}
              />
            )}

            {hasActiveFilters && activities.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border rounded-lg">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">{t('noResultsMatch')}</p>
                <p className="text-sm mb-4">{t('tryAdjusting')}</p>
                {/*
                  THE CLEAREST HIJACK IN THE APP, IF THIS ONE IS LEFT BARE.

                  `router.push("/activities")` produces a URL with NO params, which is exactly the
                  condition `page.tsx`'s default-view redirect fires on. A user who filtered into an
                  empty result and pressed "Clear filters" — the one control on screen whose whole
                  promise is "take the filters off" — would be redirected straight back into their
                  default view's filters, and would have no way to reach the unfiltered list at all.
                  `withViewEscape` over an EMPTY `URLSearchParams` yields `view=none`: a param, so the
                  redirect does not fire, and not a filter, so nothing is restored.
                */}
                <Button
                  variant="outline"
                  onClick={() =>
                    router.push(`/activities?${withViewEscape("activity", new URLSearchParams())}`)
                  }
                >
                  {t('clearFilters')}
                </Button>
              </div>
            ) : (
              <>
                <ActivityList
                  activities={activities}
                  activityTypes={activityTypes}
                  onEdit={handleEdit}
                  onRefresh={handleRefresh}
                  rowSelection={rowSelection}
                  onRowSelectionChange={setRowSelection}
                />
                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={handleLoadMore}>
                      Load More
                    </Button>
                  </div>
                )}
                {/*
                  LAST ELEMENT OF THE STACK, AFTER THE LOAD MORE BUTTON — the whole reason the
                  selection state was lifted out of `ActivityList`. The bar renders its own 80px
                  spacer as a sibling, and that spacer must sit BELOW everything so the fixed bar
                  buys back the space it covers instead of injecting 80px into the middle of the
                  page or pushing the button under itself (T-38-38).
                */}
                <BulkActionBar
                  entityType="activity"
                  selectedIds={selectedIds}
                  getLabel={getActivityLabel}
                  retentionDays={retentionDays}
                  owners={bulkOwners}
                  onDelete={bulkDeleteActivities}
                  onReassign={bulkReassignActivityOwner}
                  onExport={exportSelectedActivities}
                  onOutcome={handleOutcome}
                  onClear={handleClearSelection}
                />
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <ActivityCalendar
            activities={activities}
            activityTypes={activityTypes}
            onSelectActivity={handleEdit}
          />
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <ActivityDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        activity={editingActivity}
        activityTypes={activityTypes}
        deals={deals}
        users={users}
        onRecordSaved={handleRecordSaved}
      />
    </div>
  )
}
