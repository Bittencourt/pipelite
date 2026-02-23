"use client"

interface DeleteStageDialogProps {
  stage: {
    id: string
    name: string
    type: "open" | "won" | "lost"
  }
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

// Stub - will be implemented in Task 3
export function DeleteStageDialog({
  stage,
  open,
  onOpenChange,
  onSuccess,
}: DeleteStageDialogProps) {
  return null
}
