"use client"

import { memo, useState } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Globe, Database, Mail, Bell, Code, Webhook, Trash2, Plus } from "lucide-react"
import { Card } from "@/components/ui/card"
import { useEditorStore } from "../../lib/editor-store"
import type { EditorNodeData } from "../../lib/types"

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  http_request: Globe,
  crm_action: Database,
  email: Mail,
  notification: Bell,
  javascript_transform: Code,
  webhook_response: Webhook,
}

function formatActionType(actionType: string): string {
  return actionType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function ActionNodeComponent({ id, data, selected }: NodeProps) {
  const [hovered, setHovered] = useState(false)
  const removeNode = useEditorStore((s) => s.removeNode)
  const openTypePicker = useEditorStore((s) => s.openTypePicker)
  const nodeData = data as unknown as EditorNodeData

  const Icon = (nodeData.actionType && ACTION_ICONS[nodeData.actionType]) || Globe
  const workflowNodes = useEditorStore((s) => s.workflowNodes)
  const hasNext = !!workflowNodes.find((n) => n.id === id)?.nextNodeId

  return (
    <div className="flex flex-col items-center">
      <Card
        className={`relative min-w-[180px] border-l-4 border-l-green-500 px-3 py-2 ${
          selected ? "ring-2 ring-primary" : ""
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-green-500" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">{nodeData.label}</span>
            {nodeData.actionType && (
              <span className="text-xs text-muted-foreground">
                {formatActionType(nodeData.actionType)}
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

export const ActionNode = memo(ActionNodeComponent)
