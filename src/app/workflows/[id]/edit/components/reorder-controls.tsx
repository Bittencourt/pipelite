"use client"

import { ChevronUp, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "../lib/editor-store"

export function ReorderControls({ nodeId }: { nodeId: string }) {
  const reorderNode = useEditorStore((s) => s.reorderNode)

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => reorderNode(nodeId, "up")}
        title="Move up"
      >
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => reorderNode(nodeId, "down")}
        title="Move down"
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  )
}
