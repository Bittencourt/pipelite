"use client"

import type { StageColor } from "@/lib/stage-colors"

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

// Placeholder - will be implemented in Task 2
export function StageConfigurator({
  pipelineId,
  pipelineName,
  initialStages,
  existingTypes,
}: StageConfiguratorProps) {
  return (
    <div className="text-muted-foreground">
      Stage configurator for {pipelineName} - {initialStages.length} stages
    </div>
  )
}
