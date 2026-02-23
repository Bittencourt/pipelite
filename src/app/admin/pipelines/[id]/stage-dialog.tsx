"use client"

import type { StageColor } from "@/lib/stage-colors"

interface StageDialogProps {
  mode: "create" | "edit"
  pipelineId: string
  stage?: {
    id: string
    name: string
    description: string | null
    color: StageColor
    type: "open" | "won" | "lost"
  }
  open: boolean
  onOpenChange: (open: boolean) => void
  existingTypes: {
    hasWon: boolean
    hasLost: boolean
  }
  onSuccess: () => void
}

// Stub - will be implemented in Task 3
export function StageDialog({
  mode,
  pipelineId,
  stage,
  open,
  onOpenChange,
  existingTypes,
  onSuccess,
}: StageDialogProps) {
  return null
}
