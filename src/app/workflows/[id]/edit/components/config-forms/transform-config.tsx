"use client"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEditorStore } from "../../lib/editor-store"

interface Props {
  nodeId: string
  config: Record<string, unknown>
}

export function TransformConfig({ nodeId, config }: Props) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig)

  const code = (config.code as string) ?? ""

  return (
    <div className="space-y-4 p-4">
      {/* Code editor */}
      <div>
        <Label className="text-xs">JavaScript Code</Label>
        <Textarea
          value={code}
          onChange={(e) => updateNodeConfig(nodeId, { code: e.target.value })}
          placeholder="// Transform the input data&#10;return { ...input, processed: true }"
          className="min-h-[200px] font-mono text-xs"
        />
      </div>

      {/* Help text */}
      <div className="rounded-lg border bg-muted/50 p-3">
        <p className="mb-2 text-xs font-semibold">Available Globals</p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            <code className="font-mono text-foreground">input</code> -- Data
            from the previous node
          </li>
          <li>
            <code className="font-mono text-foreground">output</code> --
            Accumulated outputs from all prior nodes
          </li>
          <li>
            <code className="font-mono text-foreground">helpers</code> --
            Utility functions (pick, omit, get, set, capitalize, etc.)
          </li>
        </ul>
      </div>
    </div>
  )
}
