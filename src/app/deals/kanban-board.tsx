"use client"

import { useState } from "react"
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
  UniqueIdentifier,
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
import { reorderDeals } from "./actions"
import { toast } from "sonner"
import { formatCurrency, sumDealValues } from "@/lib/currency"
import { cn } from "@/lib/utils"
import { useRouter, usePathname } from "next/navigation"

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
  organizations: { id: string; name: string }[]
  people: { id: string; firstName: string; lastName: string }[]
  defaultStageId?: string
}

export function KanbanBoard({
  selectedPipelineId,
  pipelines,
  stages,
  dealsByStage: initialDealsByStage,
  organizations,
  people,
  defaultStageId,
}: KanbanBoardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [dealsByStage, setDealsByStage] = useState(initialDealsByStage)
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const [dealDialogOpen, setDealDialogOpen] = useState(false)
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)

  // Separate open stages from won/lost
  const openStages = stages.filter(s => s.type === 'open')
  const wonStage = stages.find(s => s.type === 'won')
  const lostStage = stages.find(s => s.type === 'lost')

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

  const handleEditDeal = (deal: Deal) => {
    setSelectedDeal(deal)
    setDealDialogOpen(true)
  }

  const handleDealDialogSuccess = () => {
    setDealDialogOpen(false)
    setSelectedDeal(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Pipeline Selector */}
      {pipelines.length > 1 && (
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
      )}

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* Open Stages */}
        <div className="flex gap-4 overflow-x-auto pb-4">
          {openStages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage[stage.id] || []}
            >
              <SortableContext
                items={(dealsByStage[stage.id] || []).map(d => d.id)}
                strategy={verticalListSortingStrategy}
              >
                {(dealsByStage[stage.id] || []).map((deal) => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    onEdit={handleEditDeal}
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
            organizationId: selectedDeal.organizationId,
            personId: selectedDeal.personId,
          }}
          organizations={organizations}
          people={people}
          stages={stages}
          onSuccess={handleDealDialogSuccess}
        />
      )}
    </div>
  )
}
