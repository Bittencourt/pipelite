"use client"

import { ChevronUp, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "../lib/editor-store"

interface ReorderControlsProps {
  nodeId: string
}

export function ReorderControls({ nodeId }: ReorderControlsProps) {
  const reorderNode = useEditorStore((s) => s.reorderNode)
  const workflowNodes = useEditorStore((s) => s.workflowNodes)

  // Determine if this node is at the start/end of its linear segment
  const node = workflowNodes.find((n) => n.id === nodeId)
  if (!node) return null

  // Find predecessor: any node whose nextNodeId or branch points to this nodeId
  const predecessor = workflowNodes.find(
    (n) =>
      n.nextNodeId === nodeId ||
      (n.type === "condition" &&
        (n.trueBranch === nodeId || n.falseBranch === nodeId)),
  )

  // Cannot move up if no predecessor or predecessor is a condition node
  const isFirst = !predecessor || predecessor.type === "condition"

  // Cannot move down if node is last or next is a condition node
  const nextNode = node.nextNodeId
    ? workflowNodes.find((n) => n.id === node.nextNodeId)
    : null
  const isLast = !node.nextNodeId || nextNode?.type === "condition"

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground"
        disabled={isFirst}
        onClick={() => reorderNode(nodeId, "up")}
        title="Move up"
      >
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground"
        disabled={isLast}
        onClick={() => reorderNode(nodeId, "down")}
        title="Move down"
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  )
}
