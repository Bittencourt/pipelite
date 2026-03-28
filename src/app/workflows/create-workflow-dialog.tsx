"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createWorkflow } from "./actions"
import { workflowStarterTemplates } from "@/lib/templates/workflow-templates"

interface Props {
  children: React.ReactNode
}

export function CreateWorkflowDialog({ children }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [creatingId, setCreatingId] = useState<string | null>(null)

  async function handleCreate(templateId: string | null) {
    const id = templateId ?? "blank"
    setCreatingId(id)
    try {
      let data: Parameters<typeof createWorkflow>[0]

      if (!templateId) {
        data = { name: "New Workflow" }
      } else {
        const template = workflowStarterTemplates.find(
          (t) => t.id === templateId
        )
        if (!template) return
        data = {
          name: template.name,
          description: template.description,
          triggers: template.triggers,
          nodes: template.nodes,
        }
      }

      const result = await createWorkflow(data)
      if (result.success) {
        setOpen(false)
        router.push(`/workflows/${result.id}/edit`)
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Failed to create workflow")
    } finally {
      setCreatingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!creatingId) setOpen(v) }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Create Workflow</DialogTitle>
        </DialogHeader>

        {/* Blank workflow card */}
        <button
          className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:border-ring hover:shadow-sm disabled:pointer-events-none disabled:opacity-50"
          onClick={() => handleCreate(null)}
          disabled={creatingId !== null}
          role="button"
          aria-label="Blank Workflow: Start from scratch with an empty workflow"
        >
          {creatingId === "blank" ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <FileText className="h-6 w-6" />
          )}
          <div>
            <div className="text-sm font-semibold">Blank Workflow</div>
            <div className="text-xs text-muted-foreground">
              Start from scratch with an empty workflow
            </div>
          </div>
        </button>

        {/* Separator */}
        <div className="relative py-2">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
            Or start from a template
          </span>
        </div>

        {/* Template cards grid */}
        <div className="grid grid-cols-2 gap-3">
          {workflowStarterTemplates.map((template) => (
            <button
              key={template.id}
              className="flex h-[80px] flex-col justify-center rounded-lg border p-3 text-left transition-colors hover:border-ring hover:shadow-sm disabled:pointer-events-none disabled:opacity-50"
              onClick={() => handleCreate(template.id)}
              disabled={creatingId !== null}
              role="button"
              aria-label={`${template.name}: ${template.description}`}
            >
              {creatingId === template.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <div className="text-sm font-semibold">{template.name}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {template.description}
                  </div>
                </>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
