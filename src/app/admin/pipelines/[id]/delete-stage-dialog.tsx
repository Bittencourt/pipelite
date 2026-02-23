"use client"

import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Loader2 } from "lucide-react"
import { deleteStage } from "../actions"
import { toast } from "sonner"

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

export function DeleteStageDialog({
  stage,
  open,
  onOpenChange,
  onSuccess,
}: DeleteStageDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const isTerminalStage = stage.type === "won" || stage.type === "lost"

  const handleDelete = async () => {
    setIsLoading(true)
    try {
      const result = await deleteStage(stage.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Stage deleted")
      onSuccess()
      onOpenChange(false)
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Stage</AlertDialogTitle>
          <AlertDialogDescription>
            {isTerminalStage ? (
              <>
                This is a <strong>{stage.type}</strong> stage. Deleting it may
                affect historical deal reporting. Are you sure you want to
                delete &quot;{stage.name}&quot;?
              </>
            ) : (
              <>Are you sure you want to delete the stage &quot;{stage.name}&quot;?</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
