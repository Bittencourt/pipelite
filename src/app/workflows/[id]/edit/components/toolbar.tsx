"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Save, Download, Upload, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useEditorStore } from "../lib/editor-store"
import { updateWorkflow, importWorkflow, toggleWorkflow, deleteWorkflow } from "@/app/workflows/actions"
import { DeleteWorkflowDialog } from "@/app/workflows/delete-workflow-dialog"
import { serializeWorkflowForExport, validateWorkflowImport, slugify } from "@/lib/workflows/export-import"

export function Toolbar() {
  const workflowId = useEditorStore((s) => s.workflowId)
  const workflowName = useEditorStore((s) => s.workflowName)
  const active = useEditorStore((s) => s.active)
  const dirty = useEditorStore((s) => s.dirty)
  const setWorkflowName = useEditorStore((s) => s.setWorkflowName)
  const setActive = useEditorStore((s) => s.setActive)
  const getWorkflowForSave = useEditorStore((s) => s.getWorkflowForSave)

  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function handleExport() {
    setExporting(true)
    try {
      const data = getWorkflowForSave()
      const exported = serializeWorkflowForExport({
        name: data.name,
        description: data.description || null,
        triggers: data.triggers as unknown as Record<string, unknown>[],
        nodes: data.nodes as unknown as Record<string, unknown>[],
      })
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${slugify(data.name)}-export.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Workflow exported as JSON")
    } catch {
      toast.error("Failed to export workflow")
    } finally {
      setExporting(false)
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        toast.error("Invalid file: The selected file is not valid JSON.")
        return
      }

      const validation = validateWorkflowImport(parsed)
      if (!validation.valid) {
        toast.error(validation.error)
        return
      }

      const result = await importWorkflow({
        name: validation.data.name,
        description: validation.data.description,
        triggers: validation.data.triggers,
        nodes: validation.data.nodes,
      })

      if (result.success) {
        toast.success("Workflow imported successfully")
        router.push(`/workflows/${result.id}/edit`)
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Import failed: Could not process this file. Ensure it was exported from a Pipelite instance.")
    } finally {
      setImporting(false)
      // Reset file input so the same file can be re-imported
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

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
        // When disabling, cancel waiting runs via toggleWorkflow
        if (!data.active) {
          const toggleResult = await toggleWorkflow(workflowId, false)
          if (toggleResult.success && toggleResult.cancelledRuns > 0) {
            toast.info(`${toggleResult.cancelledRuns} waiting run(s) cancelled`)
          }
        }
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

  async function handleDelete() {
    if (!workflowId) return
    setDeleting(true)
    try {
      const result = await deleteWorkflow(workflowId)
      if (result.success) {
        toast.success("Workflow deleted")
        router.push("/workflows")
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
          aria-label="Export workflow as JSON"
        >
          <Download className="mr-1 h-4 w-4" />
          {exporting ? "Exporting..." : "Export JSON"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          aria-label="Import workflow from JSON"
        >
          <Upload className="mr-1 h-4 w-4" />
          {importing ? "Importing..." : "Import JSON"}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          aria-hidden="true"
          onChange={handleImportFile}
        />

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

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
          aria-label="Delete workflow"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <DeleteWorkflowDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        workflowName={workflowName}
        onConfirm={handleDelete}
        isLoading={deleting}
      />
    </div>
  )
}
