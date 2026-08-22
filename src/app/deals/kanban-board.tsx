"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { KanbanColumn } from "./kanban-column"
import { DealCard, type Deal } from "./deal-card"
import { DealDialog } from "./deal-dialog"
import { DealFilters } from "./deal-filters"
import {
  reorderDeals,
  bulkDeleteDeals,
  bulkReassignDealOwner,
  exportSelectedDeals,
} from "./actions"
import { SavedViewsBar } from "@/components/views/saved-views-bar"
import type { SavedViewsBarProps } from "@/lib/views/types"
import { BulkActionBar } from "@/components/bulk/bulk-action-bar"
import { BulkFailureReport } from "@/components/bulk/bulk-failure-report"
import { BULK_MAX_IDS } from "@/lib/bulk/limits"
import type { BulkOutcome } from "@/lib/bulk/types"
import { toast } from "sonner"
import { formatCurrency, sumDealValues } from "@/lib/currency"
import { cn } from "@/lib/utils"
import { useRouter, usePathname } from "next/navigation"
import { useKanbanKeyboard } from "@/components/keyboard"
import { useHotkeysContext } from "react-hotkeys-hook"

interface KanbanBoardProps {
  /**
   * The eight saved-views props, resolved server-side in `page.tsx` and passed through as ONE object.
   *
   * One prop rather than eight: they are computed together by `resolveSavedViewsBarProps` (Rule B-2)
   * and consumed together by the bar, so threading them individually through a kanban that already
   * takes eleven props is how one of them gets dropped in a later refactor.
   */
  viewsBar: SavedViewsBarProps
  selectedPipelineId: string
  pipelines: { id: string; name: string }[]
  stages: Array<{
    id: string
    name: string
    pipelineId: string
    color: 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan' | 'orange'
    type: 'open' | 'won' | 'lost'
  }>
  dealsByStage: Record<string, Deal[]>
  defaultStageId?: string
  owners: Array<{ id: string; name: string }>
  users: { id: string; name: string | null; email: string }[]
  /**
   * The bulk reassign picker's options — a SEPARATE list from `owners`, which is the filter dropdown's
   * and is built without a `status` predicate. Handing ownership to a deleted or unapproved account
   * transfers records to a principal who cannot act on them, so this one is filtered on both
   * (T-38-06).
   */
  bulkOwners: Array<{ id: string; name: string }>
  /** `null` means nothing is purged automatically. NEVER defaulted to a number anywhere (T-38-10). */
  retentionDays: number | null
  activeFilters: { stage?: string; owner?: string; assignee?: string; dateFrom?: string; dateTo?: string }
}

export function KanbanBoard({
  viewsBar,
  selectedPipelineId,
  pipelines,
  stages,
  dealsByStage: initialDealsByStage,
  defaultStageId,
  owners,
  users,
  bulkOwners,
  retentionDays,
  activeFilters,
}: KanbanBoardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [dealsByStage, setDealsByStage] = useState(initialDealsByStage)
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const [dealDialogOpen, setDealDialogOpen] = useState(false)
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  /**
   * BULK SELECTION LIVES HERE, AND THIS IS THE PHASE'S ONE DECLARED EXCEPTION to "selection lives in
   * TanStack `rowSelection`". `/deals` is a kanban, not a table — there is no `useReactTable` on this
   * surface to hold the state — so the board owns a set of deal ids directly.
   */
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set())
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null)

  // Sync state when server data changes
  useEffect(() => {
    setDealsByStage(initialDealsByStage)
  }, [initialDealsByStage])

  /**
   * CLEAR THE SELECTION WHEN THE PIPELINE CHANGES, AND KEY IT ON THE PIPELINE ID ALONE.
   *
   * Deliberately NOT keyed on `dealsByStage` or on `initialDealsByStage`. The sync effect directly
   * above already watches that array, and Phase 35 measured that `revalidatePath` re-renders the
   * current client tree regardless of which path it names — so a clear keyed on the deal array would
   * fire in the middle of a bulk action and wipe the failed-id selection that SC-3 requires to
   * SURVIVE the call (T-38-33). Succeeded ids are removed explicitly in the outcome handler instead,
   * never by an effect.
   */
  useEffect(() => {
    setSelectedDealIds(new Set())
    setOutcome(null)
  }, [selectedPipelineId])

  // Separate open stages from won/lost
  const openStages = stages.filter(s => s.type === 'open')
  const wonStage = stages.find(s => s.type === 'won')
  const lostStage = stages.find(s => s.type === 'lost')

  const selectedIds = useMemo(() => Array.from(selectedDealIds), [selectedDealIds])

  /**
   * Every deal id currently on the board, across the OPEN stages only — the won and lost stages
   * render summary tiles and no cards, so nothing there is ever selectable.
   */
  const renderedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const stage of openStages) {
      for (const deal of dealsByStage[stage.id] || []) {
        ids.add(deal.id)
      }
    }
    return ids
  }, [openStages, dealsByStage])

  /**
   * THE DEFENSIVE PRUNE, and it is what the bar actually submits.
   *
   * A deal that left the board — deleted by a previous bulk call, or filtered out by the next server
   * render — must not linger in the count or reach a destructive action as a phantom id (T-38-37).
   * Intersecting the selection with what is really rendered makes that structurally impossible rather
   * than a matter of remembering to clean up after every path that removes a card.
   */
  const submittedIds = useMemo(
    () => selectedIds.filter(id => renderedIds.has(id)),
    [selectedIds, renderedIds]
  )

  /**
   * Per-stage tri-state, computed once per render rather than inside the column map, so a column does
   * not have to walk the selection itself.
   */
  const stageSelectionState = useMemo(() => {
    const byStage: Record<string, { all: boolean; some: boolean }> = {}
    for (const stage of openStages) {
      const stageDeals = dealsByStage[stage.id] || []
      const count = stageDeals.reduce((n, deal) => n + (selectedDealIds.has(deal.id) ? 1 : 0), 0)
      byStage[stage.id] = {
        all: stageDeals.length > 0 && count === stageDeals.length,
        some: count > 0 && count < stageDeals.length,
      }
    }
    return byStage
  }, [openStages, dealsByStage, selectedDealIds])

  /** A NEW `Set` every time: mutating in place would not re-render. */
  const handleBulkSelectChange = (id: string, next: boolean) => {
    setSelectedDealIds(prev => {
      const updated = new Set(prev)
      if (next) {
        updated.add(id)
      } else {
        updated.delete(id)
      }
      return updated
    })
  }

  /**
   * SELECT-ALL-IN-STAGE, CAPPED AGAINST THE RUNNING TOTAL — not against the stage's own size.
   *
   * The cap is checked on `updated.size`, which is the WHOLE current selection, so ticking a second
   * stage cannot push the total past the limit either. It does not throw and the control is not
   * disabled: the column header's accessible name already states both real numbers above the cap, and
   * the bar's count then reads exactly "100 selected", which is precise rather than misleading. This
   * is the runtime half of that copy (T-38-03), and it matters in the ordinary case here because
   * `/deals` has no pagination and its largest single stage holds 10,495 deals.
   *
   * Ids are taken in RENDERED ORDER, so "the first 100" in the label means the first 100 the user can
   * actually see.
   */
  /*
   * THE EMITTED VALUE IS DELIBERATELY IGNORED, and that is the fix for CR-01.
   *
   * Because the cap makes "all selected" unreachable on any stage larger than BULK_MAX_IDS, the
   * header checkbox is pinned at `indeterminate` — and per the installed Radix, an indeterminate
   * CONTROLLED checkbox emits `true` on EVERY click. Branching on that value therefore took the
   * select path forever: measured live on the 3,466-deal stage, click 1 selected 100 and clicks 2
   * and 3 did nothing at all, leaving the stage impossible to deselect except via "Clear selection",
   * which also discards every other stage. Nine live stages are over the cap, so this was the
   * ordinary case, not an edge case.
   *
   * Deriving the intent from the CURRENT selection instead makes the control a true toggle and makes
   * it independent of how the primitive reports an indeterminate click.
   *
   * The emitted boolean is not merely unused — the parameter is GONE. The column still calls this with
   * two arguments, which is fine in both TS and JS, and dropping it means no reader can mistake the
   * primitive's report for something this handler consults.
   */
  const handleSelectAllInStage = (stageId: string) => {
    const stageDeals = dealsByStage[stageId] || []
    setSelectedDealIds(prev => {
      const updated = new Set(prev)
      const anySelectedInStage = stageDeals.some(deal => updated.has(deal.id))

      if (anySelectedInStage) {
        for (const deal of stageDeals) {
          updated.delete(deal.id)
        }
        return updated
      }

      for (const deal of stageDeals) {
        if (updated.size >= BULK_MAX_IDS) break
        updated.add(deal.id)
      }
      return updated
    })
  }

  /**
   * Resolves a deal title for the failure report. Falls back to the raw id, which still NAMES the
   * record — a generic stand-in would not, and SC-3 asks for the record to be named.
   */
  const getDealLabel = (id: string) => {
    for (const stageDeals of Object.values(dealsByStage)) {
      const deal = stageDeals.find(d => d.id === id)
      if (deal) return deal.title
    }
    return id
  }

  /**
   * DESELECT THE SUCCEEDED IDS AND KEEP THE FAILED ONES SELECTED, both explicitly and here — never
   * through an effect watching the deal array, which would fire on the server re-render and take the
   * failed ids with it.
   *
   * Everything not in `succeeded` survives, which is precisely the failed ids plus anything the user
   * selected while the call was in flight. The user's next act on a failure is to retry it, so the
   * selection they need is already in place.
   */
  const handleOutcome = (next: BulkOutcome) => {
    setSelectedDealIds(prev => {
      const updated = new Set(prev)
      for (const id of next.succeeded) {
        updated.delete(id)
      }
      return updated
    })
    setOutcome(next.failed.length > 0 ? next : null)
    // The board's existing refresh convention, matched rather than a new callback prop invented.
    router.refresh()
  }

  const handleClearSelection = () => {
    setSelectedDealIds(new Set())
    setOutcome(null)
  }

  // Deal edit handler (moved above keyboard hook so it can reference it)
  const handleEditDeal = (deal: Deal) => {
    setSelectedDeal(deal)
    setDealDialogOpen(true)
  }

  // Kanban keyboard navigation
  const kanbanColumns = useMemo(
    () =>
      openStages.map((stage) => ({
        id: stage.id,
        items: dealsByStage[stage.id] || [],
      })),
    [openStages, dealsByStage]
  )

  const { containerProps, getItemProps } = useKanbanKeyboard({
    columns: kanbanColumns,
    onEdit: handleEditDeal,
    onCreate: () => {
      setCreateDialogOpen(true)
    },
    getId: (deal) => deal.id,
    scope: "kanban",
  })

  // Enable kanban scope while board is mounted
  const { enableScope, disableScope } = useHotkeysContext()
  useEffect(() => {
    enableScope("kanban")
    return () => disableScope("kanban")
  }, [enableScope, disableScope])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const dealId = active.id as string

    // Find the deal being dragged
    for (const stageId in dealsByStage) {
      const deal = dealsByStage[stageId].find(d => d.id === dealId)
      if (deal) {
        setActiveDeal(deal)
        break
      }
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // Find source stage and deal
    let sourceStageId: string | null = null
    let activeDealData: Deal | null = null

    for (const stageId in dealsByStage) {
      const dealIndex = dealsByStage[stageId].findIndex(d => d.id === activeId)
      if (dealIndex !== -1) {
        sourceStageId = stageId
        activeDealData = dealsByStage[stageId][dealIndex]
        break
      }
    }

    if (!sourceStageId || !activeDealData) return

    // Check if over is a column (stage) or a deal
    let targetStageId: string | null = null

    // Check if over is a stage ID
    if (stages.find(s => s.id === overId)) {
      targetStageId = overId
    } else {
      // Over is a deal, find its stage
      for (const stageId in dealsByStage) {
        if (dealsByStage[stageId].find(d => d.id === overId)) {
          targetStageId = stageId
          break
        }
      }
    }

    if (!targetStageId || targetStageId === sourceStageId) return

    // Don't allow dragging to won/lost stages
    const targetStage = stages.find(s => s.id === targetStageId)
    if (targetStage?.type !== 'open') return

    // Optimistically move deal to new stage
    setDealsByStage(prev => {
      const newState = { ...prev }
      // Remove from source
      newState[sourceStageId!] = newState[sourceStageId!].filter(d => d.id !== activeId)
      // Add to target (at end for now, position will be corrected on drop)
      newState[targetStageId!] = [...newState[targetStageId!], activeDealData!]
      return newState
    })
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDeal(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // Find target stage
    let targetStageId: string | null = null
    let targetIndex = 0

    // Check if over is a stage ID
    if (stages.find(s => s.id === overId)) {
      targetStageId = overId
      targetIndex = dealsByStage[overId]?.length || 0
    } else {
      // Over is a deal, find its stage and position
      for (const stageId in dealsByStage) {
        const dealIndex = dealsByStage[stageId].findIndex(d => d.id === overId)
        if (dealIndex !== -1) {
          targetStageId = stageId
          targetIndex = dealIndex
          break
        }
      }
    }

    if (!targetStageId) return

    // Don't allow dragging to won/lost stages
    const targetStage = stages.find(s => s.id === targetStageId)
    if (targetStage?.type !== 'open') return

    // Persist the change
    try {
      const result = await reorderDeals(activeId, targetStageId, targetIndex)
      if (!result.success) {
        // Revert on error
        setDealsByStage(initialDealsByStage)
        toast.error(result.error)
      }
      // Refresh to get updated data
      router.refresh()
    } catch {
      // Revert on error
      setDealsByStage(initialDealsByStage)
      toast.error("Failed to move deal")
    }
  }

  const handlePipelineChange = (pipelineId: string) => {
    // Navigate to the deals page with the new pipeline
    // For now, we'll use a query param or just refresh
    router.push(`${pathname}?pipeline=${pipelineId}`)
    router.refresh()
  }

  // Closing is the dialog's decision, taken through onOpenChange. These callbacks refresh
  // the board and nothing else: a create whose record landed but whose note did not stays
  // open on purpose so the typed note survives (T-35-31), and closing it from here is
  // exactly what defeated that.
  const handleDealDialogOpenChange = (next: boolean) => {
    setDealDialogOpen(next)
    if (!next) setSelectedDeal(null)
  }

  const handleDealSaved = () => {
    router.refresh()
  }

  // Calculate total deals for empty state check
  const totalDeals = Object.values(dealsByStage).reduce((sum, deals) => sum + deals.length, 0)
  const hasActiveFilters = !!(activeFilters.stage || activeFilters.owner || activeFilters.assignee || activeFilters.dateFrom || activeFilters.dateTo)

  return (
    // `space-y-4 sm:space-y-6` — the other half of the D-40-4 reclaim. The views bar made this a
    // four-block stack instead of three, so the extra 24px gap is charged here; `sm:` keeps the
    // original rhythm everywhere the board was not starved of height.
    <div className="space-y-4 sm:space-y-6">
      {/* Pipeline Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {pipelines.length > 1 ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-sm text-muted-foreground">Pipeline:</span>
            <Select value={selectedPipelineId} onValueChange={handlePipelineChange}>
              <SelectTrigger className="w-[200px] min-w-0 max-w-full">
                <SelectValue placeholder="Select pipeline" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map(pipeline => (
                  <SelectItem key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div />
        )}
        {defaultStageId && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Deal
          </Button>
        )}
      </div>

      {/*
        THE SAVED VIEWS BAR, ON ITS OWN ROW BETWEEN THE PIPELINE ROW AND THE FILTER ROW.

        NOT INSIDE `deal-filters.tsx`. A deals view carries its `pipeline` (Decision 4), because the
        pipeline decides which board renders at all — and the pipeline control lives in the row ABOVE
        the filters. A bar that can change the pipeline has to sit above both of the things it changes,
        not beside one of them.

        NOT MERGED INTO THE PIPELINE ROW. That row is measured EXACTLY full at 241px (M-3): the
        "Pipeline:" cluster at 118, an 8px gap, "Add Deal" at 115. Zero slack — before pt-BR or es-ES
        lengthens either label. A third cluster in there overflows on the first translation.

        RULE P-2: THE BAR RENDERS EVEN WHEN ONLY ONE PIPELINE EXISTS. The row above replaces the
        pipeline cluster with `<div />` when `pipelines.length <= 1`; do NOT copy that guard here. The
        bar's content does not depend on the pipeline count, and hiding it on a single-pipeline install
        would hide saved views from that install entirely.

        Not sticky, not fixed (K-8) — it scrolls away with the board it belongs to.
      */}
      <SavedViewsBar {...viewsBar} />

      {/* Filters */}
      <Suspense fallback={null}>
        <DealFilters
          stages={stages.filter(s => s.pipelineId === selectedPipelineId && s.id).map(s => ({ id: s.id, name: s.name }))}
          owners={owners}
          assignees={users.map(u => ({ id: u.id, name: u.name || u.email }))}
        />
      </Suspense>

      {/*
        The per-record failure report, mounted ABOVE the board and below the filter row. It is a report
        to read rather than a control to press, and it can run to several lines, so it must not go
        inside the fixed bar that has to stay one compact cluster at every viewport.
      */}
      {outcome !== null && outcome.failed.length > 0 && (
        <BulkFailureReport
          kind={outcome.kind}
          failures={outcome.failed}
          labelById={outcome.labelById}
          stillSelected={outcome.failed.filter((f) => renderedIds.has(f.id)).length}
          onDismiss={() => setOutcome(null)}
        />
      )}

      {/* Empty state when filters return no results */}
      {hasActiveFilters && totalDeals === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <p className="mb-2">No results match your filters</p>
          <Button variant="outline" size="sm" onClick={() => router.replace(`${pathname}?pipeline=${selectedPipelineId}`)}>
            Clear filters
          </Button>
        </div>
      ) : (
        /* Kanban Board */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {/*
            Open Stages.

            `relative` is LOAD-BEARING, not decoration. Radix's Checkbox renders a hidden
            `position: absolute` bubble input, and with no positioned ancestor inside this box its
            containing block resolves to <body> — so `overflow-x-auto` here does not clip it and the
            board's off-screen card checkboxes extend documentElement.scrollWidth past the viewport.
            Measured at a 320px viewport: scrollWidth 351 vs clientWidth 305 for the ~2s before
            dnd-kit applies its own transforms (a transform creates a containing block, which is why
            the overflow silently healed and made this look like a hydration artefact). Making this
            box the containing block clips those inputs from the first paint.
          */}
          <div className="relative flex gap-4 overflow-x-auto pb-4 outline-none" {...containerProps}>
            {openStages.map((stage, columnIndex) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                deals={dealsByStage[stage.id] || []}
                allInStageSelected={stageSelectionState[stage.id]?.all}
                someInStageSelected={stageSelectionState[stage.id]?.some}
                onSelectAllInStage={handleSelectAllInStage}
              >
                <SortableContext
                  items={(dealsByStage[stage.id] || []).map(d => d.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {(dealsByStage[stage.id] || []).map((deal, itemIndex) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      onEdit={handleEditDeal}
                      isSelected={getItemProps(columnIndex, itemIndex)["data-selected"]}
                      isBulkSelected={selectedDealIds.has(deal.id)}
                      onBulkSelectChange={handleBulkSelectChange}
                      data-kanban-col={columnIndex}
                      data-kanban-item={itemIndex}
                    />
                  ))}
                </SortableContext>
              </KanbanColumn>
            ))}
          </div>

          {/*
            Won/Lost Footer Row.

            NO CHECKBOX AND NO SELECT-ALL HERE, AND THAT IS CORRECT RATHER THAN AN OVERSIGHT. These two
            stages render count-and-value SUMMARY TILES with no `DealCard` children at all — there is no
            per-record row to attach a checkbox to, and a header select-all over an unrendered set would
            select records the user cannot see (T-38-43). None of the new selection props is passed down
            here, deliberately.
          */}
          {(wonStage || lostStage) && (
            /*
              The two summary tiles are `min-w-[280px]` each, so this row is 576px wide whenever both
              stages exist and it must scroll for the same reason the open-stage row above does.
              Measured on the one pipeline in this database that defines a won AND a lost stage:
              without `overflow-x-auto` the document reported scrollWidth 608 vs clientWidth 305 at a
              320px viewport, permanently rather than transiently. The SC-1 spec never caught it
              because it exercises the default pipeline, which defines neither stage.
            */
            <div className="flex gap-4 pt-4 border-t overflow-x-auto">
              {wonStage && (
                <div
                  className={cn(
                    "w-[280px] min-w-[280px] p-4 rounded-lg",
                    "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      {wonStage.name}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {(dealsByStage[wonStage.id] || []).length} deals · {formatCurrency(sumDealValues(dealsByStage[wonStage.id] || []))}
                  </div>
                </div>
              )}
              {lostStage && (
                <div
                  className={cn(
                    "w-[280px] min-w-[280px] p-4 rounded-lg",
                    "bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500" />
                    <span className="font-medium text-rose-700 dark:text-rose-400">
                      {lostStage.name}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {(dealsByStage[lostStage.id] || []).length} deals · {formatCurrency(sumDealValues(dealsByStage[lostStage.id] || []))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Drag Overlay */}
          <DragOverlay>
            {activeDeal && (
              <DealCard deal={activeDeal} isOverlay />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Deal Dialog for Edit */}
      {selectedDeal && (
        <DealDialog
          mode="edit"
          open={dealDialogOpen}
          onOpenChange={handleDealDialogOpenChange}
          deal={{
            id: selectedDeal.id,
            title: selectedDeal.title,
            value: selectedDeal.value ? parseFloat(selectedDeal.value) : null,
            expectedCloseDate: selectedDeal.expectedCloseDate || null,
            stageId: selectedDeal.stageId,
            ownerId: selectedDeal.ownerId,
            organizationId: selectedDeal.organizationId,
            personId: selectedDeal.personId,
            assigneeIds: selectedDeal.assignees?.map(a => a.userId) ?? [],
          }}
          stages={stages}
          users={users}
          onRecordSaved={handleDealSaved}
        />
      )}

      {/* Deal Dialog for Create */}
      <DealDialog
        mode="create"
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        stages={stages}
        users={users}
        defaultStageId={defaultStageId}
        onRecordSaved={handleDealSaved}
      />

      {/*
        THE BULK ACTION BAR IS THE LAST ELEMENT OF THIS STACK, AND THE ORDER IS LOAD-BEARING.
        The bar renders its own `h-20` sibling spacer to buy back the space its `fixed` position
        covers. Mounted anywhere higher, that spacer would inject 80px into the MIDDLE of the board
        instead of below everything, moving the very cards the user is aiming at.

        `selectedIds` is the PRUNED list, so a deal that has left the board cannot reach a destructive
        action.
      */}
      <BulkActionBar
        entityType="deal"
        selectedIds={submittedIds}
        getLabel={getDealLabel}
        retentionDays={retentionDays}
        owners={bulkOwners}
        onDelete={bulkDeleteDeals}
        onReassign={bulkReassignDealOwner}
        onExport={exportSelectedDeals}
        onOutcome={handleOutcome}
        onClear={handleClearSelection}
      />
    </div>
  )
}
