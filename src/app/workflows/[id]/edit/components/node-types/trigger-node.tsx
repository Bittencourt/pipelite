"use client"

import { memo } from "react"
import { Handle, Position, useEdges, type NodeProps } from "@xyflow/react"
import { Zap, Plus } from "lucide-react"
import { Card } from "@/components/ui/card"
import type { EditorNodeData } from "../../lib/types"
import { useEditorStore } from "../../lib/editor-store"

function TriggerNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as EditorNodeData
  const edges = useEdges()
  const openTypePicker = useEditorStore((s) => s.openTypePicker)
  const hasOutgoingEdge = edges.some((e) => e.source === id)

  return (
    <div className="flex flex-col items-center">
      <Card
        className={`min-w-[180px] border-l-4 border-l-blue-500 px-3 py-2 ${
          selected ? "ring-2 ring-primary" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium">{nodeData.label || "Trigger"}</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
      </Card>
      {!hasOutgoingEdge && (
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

export const TriggerNode = memo(TriggerNodeComponent)
