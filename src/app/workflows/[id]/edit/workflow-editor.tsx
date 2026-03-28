"use client"

import { useEffect, useCallback } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import type { WorkflowNode } from "@/lib/execution/types"
import type { TriggerConfig } from "@/lib/triggers/types"
import { useEditorStore } from "./lib/editor-store"
import { SidePanel } from "./components/side-panel"

interface WorkflowEditorProps {
  workflow: {
    id: string
    name: string
    description: string | null
    active: boolean
    triggers: TriggerConfig[]
    nodes: WorkflowNode[]
  }
}

export function WorkflowEditor({ workflow }: WorkflowEditorProps) {
  const initFromWorkflow = useEditorStore((s) => s.initFromWorkflow)
  const panelOpen = useEditorStore((s) => s.panelOpen)
  const selectNode = useEditorStore((s) => s.selectNode)

  useEffect(() => {
    initFromWorkflow(workflow)
  }, [workflow, initFromWorkflow])

  const onCanvasClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  return (
    <ReactFlowProvider>
      <div className="flex h-full">
        {/* Canvas area -- Plan 02 will add Canvas + Toolbar here */}
        <div className="flex-1" onClick={onCanvasClick}>
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Canvas placeholder (Plan 02)
          </div>
        </div>

        {/* Side Panel */}
        {panelOpen && <SidePanel />}
      </div>
    </ReactFlowProvider>
  )
}
