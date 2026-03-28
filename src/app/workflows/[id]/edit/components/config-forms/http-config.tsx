"use client"

import { Plus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "../../lib/editor-store"

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

  return (
    <div className="space-y-4 p-4">
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
        <Input
          value={url}
          onChange={(e) => update({ url: e.target.value })}
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
            <Input
              className="flex-1 text-xs"
              value={value}
              onChange={(e) => updateHeader(key, key, e.target.value)}
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
          <Textarea
            value={body}
            onChange={(e) => update({ body: e.target.value })}
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
    </div>
  )
}
