"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { createWorkflow } from "./actions"
import { toast } from "sonner"

export function NewWorkflowButton() {
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    setCreating(true)
    try {
      const result = await createWorkflow({ name: "New Workflow" })
      if (result.success) {
        router.push(`/workflows/${result.id}/edit`)
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Failed to create workflow")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Button onClick={handleCreate} disabled={creating}>
      <Plus className="mr-1 h-4 w-4" />
      {creating ? "Creating..." : "New Workflow"}
    </Button>
  )
}
