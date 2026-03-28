"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, Bookmark, Trash2 as Trash2Icon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { useEditorStore } from "../../lib/editor-store"
import { VariableInput, VariableTextarea } from "../variable-picker/variable-field"
import { builtInHttpTemplates, type HttpTemplate } from "@/lib/templates/http-templates"
import {
  saveHttpTemplate,
  removeHttpTemplate,
  getHttpTemplates,
} from "@/app/workflows/actions"
import type { HttpTemplateRecord } from "@/db/schema/http-templates"

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

interface Props {
  nodeId: string
  config: Record<string, unknown>
}

export function HttpConfig({ nodeId, config }: Props) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig)

  const method = (config.method as string) ?? "GET"
  const url = (config.url as string) ?? ""
  const headers = (config.headers as Record<string, string>) ?? {}
  const body = (config.body as string) ?? ""
  const timeout = (config.timeout as number) ?? 30
  const retryCount = (config.retryCount as number) ?? 0

  const headerEntries = Object.entries(headers)
  const showBody = ["POST", "PUT", "PATCH"].includes(method)

  // Custom templates state
  const [customTemplates, setCustomTemplates] = useState<HttpTemplateRecord[]>([])
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [templateDesc, setTemplateDesc] = useState("")
  const [saving, setSaving] = useState(false)
  const [showManage, setShowManage] = useState(false)

  async function refreshCustomTemplates() {
    const templates = await getHttpTemplates()
    setCustomTemplates(templates)
  }

  useEffect(() => {
    refreshCustomTemplates()
  }, [])

  const update = (patch: Record<string, unknown>) => {
    updateNodeConfig(nodeId, patch)
  }

  const updateHeader = (oldKey: string, newKey: string, value: string) => {
    const updated = { ...headers }
    if (oldKey !== newKey) delete updated[oldKey]
    updated[newKey] = value
    update({ headers: updated })
  }

  const removeHeader = (key: string) => {
    const updated = { ...headers }
    delete updated[key]
    update({ headers: updated })
  }

  const addHeader = () => {
    update({ headers: { ...headers, "": "" } })
  }

  const handleTemplateSelect = (templateId: string) => {
    if (!templateId) return
    let cfg: HttpTemplate["config"] | undefined

    if (templateId.startsWith("custom:")) {
      const customId = templateId.slice(7)
      const ct = customTemplates.find((t) => t.id === customId)
      if (ct) cfg = ct.config as unknown as HttpTemplate["config"]
    } else {
      const bt = builtInHttpTemplates.find((t) => t.id === templateId)
      if (bt) cfg = bt.config
    }

    if (cfg) {
      // D-02: silently overwrite ALL HTTP fields
      update({
        method: cfg.method,
        url: cfg.url,
        headers: cfg.headers,
        body: cfg.body,
        timeout: cfg.timeout,
        retryCount: cfg.retryCount,
      })
      toast.success("Template loaded")
    }
  }

  async function handleSaveTemplate() {
    setSaving(true)
    try {
      const result = await saveHttpTemplate({
        name: templateName.trim(),
        description: templateDesc.trim() || undefined,
        config: { method, url, headers, body, timeout, retryCount },
      })
      if (result.success) {
        toast.success("Template saved")
        setSaveDialogOpen(false)
        setTemplateName("")
        setTemplateDesc("")
        refreshCustomTemplates()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Failed to save template")
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteTemplate(id: string) {
    try {
      const result = await removeHttpTemplate(id)
      if (result.success) {
        toast.success("Template deleted")
        refreshCustomTemplates()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Failed to delete template")
    }
  }

  return (
    <div className="space-y-4 p-4">
      {/* Template Selector (D-01: above Method) */}
      <div>
        <Label className="text-xs">Template</Label>
        <Select
          value=""
          onValueChange={handleTemplateSelect}
          aria-label="Load HTTP template"
        >
          <SelectTrigger>
            <SelectValue placeholder="Load from template..." />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground">Built-in</SelectLabel>
              {builtInHttpTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectGroup>
            {customTemplates.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs text-muted-foreground">Custom</SelectLabel>
                {customTemplates.map((t) => (
                  <SelectItem key={t.id} value={`custom:${t.id}`}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Manage custom templates */}
      {customTemplates.length > 0 && (
        <div>
          <button
            type="button"
            className="text-xs text-muted-foreground underline hover:text-foreground"
            onClick={() => setShowManage(!showManage)}
          >
            {showManage ? "Hide custom templates" : "Manage custom templates"}
          </button>
          {showManage && (
            <div className="mt-2 space-y-1">
              {customTemplates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded border px-2 py-1"
                >
                  <span className="text-xs">{t.name}</span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label={`Delete template ${t.name}`}
                      >
                        <Trash2Icon className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete template</AlertDialogTitle>
                        <AlertDialogDescription>
                          Delete template &quot;{t.name}&quot;? This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteTemplate(t.id)}
                        >
                          Delete Template
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Method */}
      <div>
        <Label className="text-xs">Method</Label>
        <Select value={method} onValueChange={(v) => update({ method: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HTTP_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* URL */}
      <div>
        <Label className="text-xs">URL</Label>
        <VariableInput
          value={url}
          onChange={(v) => update({ url: v })}
          nodeId={nodeId}
          placeholder="https://api.example.com/endpoint"
        />
      </div>

      {/* Headers */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label className="text-xs">Headers</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={addHeader}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
        {headerEntries.map(([key, value], i) => (
          <div key={i} className="mb-1 flex gap-1">
            <Input
              className="flex-1 text-xs"
              value={key}
              onChange={(e) => updateHeader(key, e.target.value, value)}
              placeholder="Key"
            />
            <VariableInput
              className="flex-1 text-xs"
              value={value}
              onChange={(v) => updateHeader(key, key, v)}
              nodeId={nodeId}
              placeholder="Value"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => removeHeader(key)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {/* Body */}
      {showBody && (
        <div>
          <Label className="text-xs">Body</Label>
          <VariableTextarea
            value={body}
            onChange={(v) => update({ body: v })}
            nodeId={nodeId}
            placeholder='{"key": "value"}'
            className="min-h-[100px] font-mono text-xs"
          />
        </div>
      )}

      {/* Timeout */}
      <div>
        <Label className="text-xs">Timeout (seconds)</Label>
        <Input
          type="number"
          min={5}
          max={120}
          value={timeout}
          onChange={(e) => update({ timeout: Number(e.target.value) || 30 })}
        />
      </div>

      {/* Retry Count */}
      <div>
        <Label className="text-xs">Retry Count</Label>
        <Input
          type="number"
          min={0}
          max={3}
          value={retryCount}
          onChange={(e) =>
            update({ retryCount: Number(e.target.value) || 0 })
          }
        />
      </div>

      {/* Save as Template (D-05: below Retry Count) */}
      <div className="border-t pt-4">
        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              <Bookmark className="mr-1 h-4 w-4" />
              Save as Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save as HTTP Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs">Template Name</Label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Slack Webhook"
                />
              </div>
              <div>
                <Label className="text-xs">Description (optional)</Label>
                <Textarea
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder="What this template does"
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setSaveDialogOpen(false)}
              >
                Discard
              </Button>
              <Button
                disabled={!templateName.trim() || saving}
                onClick={handleSaveTemplate}
              >
                {saving ? "Saving..." : "Save Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
