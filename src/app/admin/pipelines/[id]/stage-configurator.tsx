"use client"

import { useState } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  UniqueIdentifier,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Pencil, Trash2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { STAGE_COLORS, type StageColor } from "@/lib/stage-colors"
import { reorderStages } from "../actions"
import { toast } from "sonner"
import { StageDialog } from "./stage-dialog"
import { DeleteStageDialog } from "./delete-stage-dialog"

interface Stage {
  id: string
  name: string
  description: string | null
  color: StageColor
  type: "open" | "won" | "lost"
  position: number
}

interface StageConfiguratorProps {
  pipelineId: string
  pipelineName: string
  initialStages: Stage[]
  existingTypes: {
    hasWon: boolean
    hasLost: boolean
  }
}

interface SortableStageProps {
  stage: Stage
  onEdit: (stage: Stage) => void
  onDelete: (stage: Stage) => void
}

function SortableStage({ stage, onEdit, onDelete }: SortableStageProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const colorStyle = STAGE_COLORS[stage.color] || STAGE_COLORS.slate

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex flex-col w-[180px] min-w-[180px] p-4 bg-card border rounded-lg transition-all",
        isDragging && "opacity-50 scale-95 z-50"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className={cn("w-3 h-3 rounded-full", colorStyle.bg)} />
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onEdit(stage)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={() => onDelete(stage)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-medium text-sm truncate" title={stage.name}>
          {stage.name}
        </span>
        {stage.description && (
          <span
            className="text-xs text-muted-foreground truncate"
            title={stage.description}
          >
            {stage.description}
          </span>
        )}
        {stage.type === "won" && (
          <Badge variant="default" className="w-fit text-xs bg-emerald-500 hover:bg-emerald-500/80">
            Won
          </Badge>
        )}
        {stage.type === "lost" && (
          <Badge variant="destructive" className="w-fit text-xs">
            Lost
          </Badge>
        )}
      </div>
    </div>
  )
}

interface DragOverlayStageProps {
  stage: Stage
}

function DragOverlayStage({ stage }: DragOverlayStageProps) {
  const colorStyle = STAGE_COLORS[stage.color] || STAGE_COLORS.slate

  return (
    <div className="flex flex-col w-[180px] min-w-[180px] p-4 bg-card border rounded-lg shadow-lg">
      <div className="flex items-center gap-2 mb-2">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <div className={cn("w-3 h-3 rounded-full", colorStyle.bg)} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-medium text-sm truncate">{stage.name}</span>
        {stage.description && (
          <span className="text-xs text-muted-foreground truncate">
            {stage.description}
          </span>
        )}
        {stage.type === "won" && (
          <Badge variant="default" className="w-fit text-xs bg-emerald-500">
            Won
          </Badge>
        )}
        {stage.type === "lost" && (
          <Badge variant="destructive" className="w-fit text-xs">
            Lost
          </Badge>
        )}
      </div>
    </div>
  )
}

export function StageConfigurator({
  pipelineId,
  pipelineName,
  initialStages,
  existingTypes: initialExistingTypes,
}: StageConfiguratorProps) {
  const [stages, setStages] = useState<Stage[]>(initialStages)
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null)

  // Calculate existing types from current stages
  const existingTypes = {
    hasWon: stages.some((s) => s.type === "won"),
    hasLost: stages.some((s) => s.type === "lost"),
  }

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

  const activeStage = activeId
    ? stages.find((stage) => stage.id === activeId)
    : null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = stages.findIndex((stage) => stage.id === active.id)
    const newIndex = stages.findIndex((stage) => stage.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    // Optimistic update
    const newStages = arrayMove(stages, oldIndex, newIndex)
    setStages(newStages)

    // Persist to server
    try {
      const result = await reorderStages(
        pipelineId,
        active.id as string,
        newIndex
      )
      if (!result.success) {
        // Revert on error
        setStages(stages)
        toast.error(result.error)
      }
    } catch {
      // Revert on error
      setStages(stages)
      toast.error("Failed to reorder stages")
    }
  }

  const handleEdit = (stage: Stage) => {
    setSelectedStage(stage)
    setEditDialogOpen(true)
  }

  const handleDelete = (stage: Stage) => {
    setSelectedStage(stage)
    setDeleteDialogOpen(true)
  }

  const handleStageCreated = () => {
    // Refresh the page to get updated stages from server
    window.location.reload()
  }

  const handleStageUpdated = () => {
    window.location.reload()
  }

  const handleStageDeleted = () => {
    window.location.reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Stages ({stages.length})</h2>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Stage
        </Button>
      </div>

      {stages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          No stages yet. Click "Add Stage" to create your first stage.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={stages.map((s) => s.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex gap-4 overflow-x-auto pb-2">
              {stages.map((stage) => (
                <SortableStage
                  key={stage.id}
                  stage={stage}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeStage && <DragOverlayStage stage={activeStage} />}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create Dialog */}
      <StageDialog
        mode="create"
        pipelineId={pipelineId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        existingTypes={existingTypes}
        onSuccess={handleStageCreated}
      />

      {/* Edit Dialog */}
      {selectedStage && (
        <StageDialog
          mode="edit"
          pipelineId={pipelineId}
          stage={{
            id: selectedStage.id,
            name: selectedStage.name,
            description: selectedStage.description,
            color: selectedStage.color,
            type: selectedStage.type,
          }}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          existingTypes={existingTypes}
          onSuccess={handleStageUpdated}
        />
      )}

      {/* Delete Dialog */}
      {selectedStage && (
        <DeleteStageDialog
          stage={{
            id: selectedStage.id,
            name: selectedStage.name,
            type: selectedStage.type,
          }}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onSuccess={handleStageDeleted}
        />
      )}
    </div>
  )
}
