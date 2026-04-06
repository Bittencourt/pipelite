"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { deleteWorkflow } from "./actions"
import { DeleteWorkflowDialog } from "./delete-workflow-dialog"

interface Props {
  workflowId: string
  workflowName: string
}

export function WorkflowRowActions({ workflowId, workflowName }: Props) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const result = await deleteWorkflow(workflowId)
      if (result.success) {
        toast.success("Workflow deleted")
        setDeleteOpen(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Failed to delete workflow")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={() => setDeleteOpen(true)}
        aria-label={`Delete workflow ${workflowName}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <DeleteWorkflowDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        workflowName={workflowName}
        onConfirm={handleDelete}
        isLoading={deleting}
      />
    </>
  )
}
