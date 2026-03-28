"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEditorStore } from "../../lib/editor-store"

interface Props {
  nodeId: string
  config: Record<string, unknown>
}

export function WebhookResponseConfig({ nodeId, config }: Props) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig)

  const statusCode = (config.statusCode as number) ?? 200
  const body = (config.body as string) ?? ""

  const update = (patch: Record<string, unknown>) => {
    updateNodeConfig(nodeId, patch)
  }

  return (
    <div className="space-y-4 p-4">
      {/* Status Code */}
      <div>
        <Label className="text-xs">Status Code</Label>
        <Input
          type="number"
          min={200}
          max={599}
          value={statusCode}
          onChange={(e) =>
            update({ statusCode: Number(e.target.value) || 200 })
          }
        />
        <p className="mt-1 text-xs text-muted-foreground">
          HTTP status code to return (200-599)
        </p>
      </div>

      {/* Response Body */}
      <div>
        <Label className="text-xs">Response Body (JSON)</Label>
        <Textarea
          value={typeof body === "string" ? body : JSON.stringify(body, null, 2)}
          onChange={(e) => update({ body: e.target.value })}
          placeholder='{"success": true, "message": "Processed"}'
          className="min-h-[120px] font-mono text-xs"
        />
      </div>
    </div>
  )
}
