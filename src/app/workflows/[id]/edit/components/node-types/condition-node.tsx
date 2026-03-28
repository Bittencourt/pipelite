"use client"

import { memo, useState } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { GitBranch, Trash2, Plus } from "lucide-react"
import { Card } from "@/components/ui/card"
import { useEditorStore } from "../../lib/editor-store"
import type { EditorNodeData } from "../../lib/types"
import type { ConditionNode as ConditionNodeType } from "@/lib/execution/types"

function ConditionNodeComponent({ id, data, selected }: NodeProps) {
  const [hovered, setHovered] = useState(false)
  const removeNode = useEditorStore((s) => s.removeNode)
  const openTypePicker = useEditorStore((s) => s.openTypePicker)
  const nodeData = data as unknown as EditorNodeData
  const workflowNodes = useEditorStore((s) => s.workflowNodes)
  const condNode = workflowNodes.find((n) => n.id === id) as ConditionNodeType | null
  const hasTrueBranch = !!condNode?.trueBranch
  const hasFalseBranch = !!condNode?.falseBranch

  return (
    <div className="flex flex-col">
      <Card
        className={`relative min-w-[180px] border-l-4 border-l-amber-500 px-3 py-2 ${
          selected ? "ring-2 ring-primary" : ""
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium">{nodeData.label}</span>
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>Yes</span>
          <span>No</span>
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
        <Handle
          type="source"
          position={Position.Bottom}
          id="true"
          style={{ left: "30%" }}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="false"
          style={{ left: "70%" }}
        />
      </Card>
      {(!hasTrueBranch || !hasFalseBranch) && (
        <div className="relative mt-2 flex h-6 w-full">
          {!hasTrueBranch && (
            <button
              className="nodrag nopan absolute flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent"
              style={{ left: "30%" }}
              onClick={(e) => {
                e.stopPropagation()
                openTypePicker(id, "true")
              }}
              title="Add to Yes branch"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
          {!hasFalseBranch && (
            <button
              className="nodrag nopan absolute flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent"
              style={{ left: "70%" }}
              onClick={(e) => {
                e.stopPropagation()
                openTypePicker(id, "false")
              }}
              title="Add to No branch"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export const ConditionNode = memo(ConditionNodeComponent)
