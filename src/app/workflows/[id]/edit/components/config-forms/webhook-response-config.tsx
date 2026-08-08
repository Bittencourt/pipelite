"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useEditorStore } from "../../lib/editor-store"
import { VariableTextarea } from "../variable-picker/variable-field"

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
        <VariableTextarea
          value={typeof body === "string" ? body : JSON.stringify(body, null, 2)}
          onChange={(v) => update({ body: v })}
          nodeId={nodeId}
          placeholder='{"success": true, "message": "Processed"}'
          className="min-h-[120px] font-mono text-xs"
        />
      </div>
    </div>
  )
}
