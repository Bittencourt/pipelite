"use client"

import { memo, useState } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Clock, Trash2, Plus } from "lucide-react"
import { Card } from "@/components/ui/card"
import { useEditorStore } from "../../lib/editor-store"
import type { EditorNodeData } from "../../lib/types"
import type { DelayConfig } from "@/lib/execution/types"

function formatDelay(config: Record<string, unknown>): string {
  const c = config as unknown as DelayConfig
  if (c.mode === "fixed" && c.duration && c.unit) {
    return `Wait ${c.duration} ${c.unit}`
  }
  if (c.mode === "until" && c.untilTime) {
    return `Wait until ${c.untilTime}`
  }
  if (c.mode === "field" && c.fieldPath) {
    return `Wait until ${c.fieldPath}`
  }
  return "Delay"
}

function DelayNodeComponent({ id, data, selected }: NodeProps) {
  const [hovered, setHovered] = useState(false)
  const removeNode = useEditorStore((s) => s.removeNode)
  const openTypePicker = useEditorStore((s) => s.openTypePicker)
  const nodeData = data as unknown as EditorNodeData
  const workflowNode = nodeData.workflowNode
  const workflowNodes = useEditorStore((s) => s.workflowNodes)
  const hasNext = !!workflowNodes.find((n) => n.id === id)?.nextNodeId

  return (
    <div className="flex flex-col items-center">
      <Card
        className={`relative min-w-[180px] border-l-4 border-l-purple-500 px-3 py-2 ${
          selected ? "ring-2 ring-primary" : ""
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-purple-500" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">{nodeData.label}</span>
            {workflowNode && (
              <span className="text-xs text-muted-foreground">
                {formatDelay(workflowNode.config as Record<string, unknown>)}
              </span>
            )}
          </div>
        </div>
        {hovered && (
          <button
            className="absolute right-1 top-1 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              removeNode(id)
            }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
        <Handle type="target" position={Position.Top} />
        <Handle type="source" position={Position.Bottom} />
      </Card>
      {!hasNext && (
        <button
          className="nodrag nopan mt-2 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent"
          onClick={(e) => {
            e.stopPropagation()
            openTypePicker(id)
          }}
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

export const DelayNode = memo(DelayNodeComponent)
