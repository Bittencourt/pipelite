"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Zap } from "lucide-react"
import { Card } from "@/components/ui/card"
import type { EditorNodeData } from "../../lib/types"

function TriggerNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as EditorNodeData

  return (
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
  )
}

export const TriggerNode = memo(TriggerNodeComponent)
