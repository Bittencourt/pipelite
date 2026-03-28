"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Save } from "lucide-react"
import { toast } from "sonner"
import { useEditorStore } from "../lib/editor-store"
import { updateWorkflow } from "@/app/workflows/actions"

export function Toolbar() {
  const workflowId = useEditorStore((s) => s.workflowId)
  const workflowName = useEditorStore((s) => s.workflowName)
  const active = useEditorStore((s) => s.active)
  const dirty = useEditorStore((s) => s.dirty)
  const setWorkflowName = useEditorStore((s) => s.setWorkflowName)
  const setActive = useEditorStore((s) => s.setActive)
  const getWorkflowForSave = useEditorStore((s) => s.getWorkflowForSave)

  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!workflowId) return
    setSaving(true)
    try {
      const data = getWorkflowForSave()
      const result = await updateWorkflow(workflowId, {
        name: data.name,
        description: data.description || null,
        active: data.active,
        triggers: data.triggers as unknown as Record<string, unknown>[],
        nodes: data.nodes as unknown as Record<string, unknown>[],
      })
      if (result.success) {
        useEditorStore.setState({ dirty: false })
        toast.success("Workflow saved")
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Failed to save workflow")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-4 border-b px-4 py-2">
      <Input
        value={workflowName}
        onChange={(e) => setWorkflowName(e.target.value)}
        className="max-w-[300px] font-medium"
        placeholder="Workflow name"
      />
      <div className="flex items-center gap-2">
        <Switch
          id="active-toggle"
          checked={active}
          onCheckedChange={setActive}
        />
        <Label htmlFor="active-toggle" className="text-sm">
          Active
        </Label>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {dirty && (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        )}
        <Button
          onClick={handleSave}
          disabled={!dirty || saving}
          size="sm"
        >
          <Save className="mr-1 h-4 w-4" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}
