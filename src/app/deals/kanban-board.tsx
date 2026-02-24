"use client"

// Stub component - will be implemented in Task 2
interface KanbanBoardProps {
  selectedPipelineId: string
  pipelines: { id: string; name: string }[]
  stages: Array<{
    id: string
    name: string
    color: 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan' | 'orange'
    type: 'open' | 'won' | 'lost'
  }>
  dealsByStage: Record<string, Array<{
    id: string
    title: string
    value: string | null
    stageId: string
    position: string
    organizationId: string | null
    personId: string | null
    expectedCloseDate?: Date | null
    notes?: string | null
    organization: { id: string; name: string } | null
    person: { id: string; firstName: string; lastName: string } | null
  }>>
  organizations: { id: string; name: string }[]
  people: { id: string; firstName: string; lastName: string }[]
  defaultStageId?: string
}

export function KanbanBoard({
  selectedPipelineId,
  pipelines,
  stages,
  dealsByStage,
  organizations,
  people,
  defaultStageId,
}: KanbanBoardProps) {
  return (
    <div className="text-muted-foreground p-8 border rounded-lg text-center">
      Kanban board loading... (selectedPipelineId: {selectedPipelineId})
    </div>
  )
}
