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
import { reorderDeals } from "./actions"
import { toast } from "sonner"
import { formatCurrency, sumDealValues } from "@/lib/currency"
import { cn } from "@/lib/utils"
import { useRouter, usePathname } from "next/navigation"
import { useKanbanKeyboard } from "@/components/keyboard"
import { useHotkeysContext } from "react-hotkeys-hook"

interface KanbanBoardProps {
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
  activeFilters: { stage?: string; owner?: string; assignee?: string; dateFrom?: string; dateTo?: string }
}

export function KanbanBoard({
  selectedPipelineId,
  pipelines,
  stages,
  dealsByStage: initialDealsByStage,
  defaultStageId,
  owners,
  users,
  activeFilters,
}: KanbanBoardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [dealsByStage, setDealsByStage] = useState(initialDealsByStage)
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const [dealDialogOpen, setDealDialogOpen] = useState(false)
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  // Sync state when server data changes
  useEffect(() => {
    setDealsByStage(initialDealsByStage)
  }, [initialDealsByStage])

  // Separate open stages from won/lost
  const openStages = stages.filter(s => s.type === 'open')
  const wonStage = stages.find(s => s.type === 'won')
  const lostStage = stages.find(s => s.type === 'lost')

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

  const handleDealDialogSuccess = () => {
    setDealDialogOpen(false)
    setSelectedDeal(null)
    router.refresh()
  }

  const handleCreateDialogSuccess = () => {
    setCreateDialogOpen(false)
    router.refresh()
  }

  // Calculate total deals for empty state check
  const totalDeals = Object.values(dealsByStage).reduce((sum, deals) => sum + deals.length, 0)
  const hasActiveFilters = !!(activeFilters.stage || activeFilters.owner || activeFilters.assignee || activeFilters.dateFrom || activeFilters.dateTo)

  return (
    <div className="space-y-6">
      {/* Pipeline Selector */}
      <div className="flex items-center justify-between">
        {pipelines.length > 1 ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Pipeline:</span>
            <Select value={selectedPipelineId} onValueChange={handlePipelineChange}>
              <SelectTrigger className="w-[200px]">
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

      {/* Filters */}
      <Suspense fallback={null}>
        <DealFilters
          stages={stages.filter(s => s.pipelineId === selectedPipelineId && s.id).map(s => ({ id: s.id, name: s.name }))}
          owners={owners}
          assignees={users.map(u => ({ id: u.id, name: u.name || u.email }))}
        />
      </Suspense>

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
          {/* Open Stages */}
          <div className="flex gap-4 overflow-x-auto pb-4 outline-none" {...containerProps}>
            {openStages.map((stage, columnIndex) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                deals={dealsByStage[stage.id] || []}
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
                      data-kanban-col={columnIndex}
                      data-kanban-item={itemIndex}
                    />
                  ))}
                </SortableContext>
              </KanbanColumn>
            ))}
          </div>

          {/* Won/Lost Footer Row */}
          {(wonStage || lostStage) && (
            <div className="flex gap-4 pt-4 border-t">
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
          onOpenChange={setDealDialogOpen}
          deal={{
            id: selectedDeal.id,
            title: selectedDeal.title,
            value: selectedDeal.value ? parseFloat(selectedDeal.value) : null,
            expectedCloseDate: selectedDeal.expectedCloseDate || null,
            notes: selectedDeal.notes || null,
            stageId: selectedDeal.stageId,
            ownerId: selectedDeal.ownerId,
            organizationId: selectedDeal.organizationId,
            personId: selectedDeal.personId,
            assigneeIds: selectedDeal.assignees?.map(a => a.userId) ?? [],
          }}
          stages={stages}
          users={users}
          onSuccess={handleDealDialogSuccess}
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
        onSuccess={handleCreateDialogSuccess}
      />
    </div>
  )
}
