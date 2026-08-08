"use client"

import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { CreateWorkflowDialog } from "./create-workflow-dialog"

export function NewWorkflowButton() {
  return (
    <CreateWorkflowDialog>
      <Button>
        <Plus className="mr-1 h-4 w-4" />
        New Workflow
      </Button>
    </CreateWorkflowDialog>
  )
}
