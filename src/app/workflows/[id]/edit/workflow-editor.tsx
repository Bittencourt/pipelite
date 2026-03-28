"use client"

import { useEffect } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import { Canvas } from "./components/canvas"
import { Toolbar } from "./components/toolbar"
import { SidePanel } from "./components/side-panel"
import { useEditorStore } from "./lib/editor-store"
import type { WorkflowNode } from "@/lib/execution/types"
import type { TriggerConfig } from "@/lib/triggers/types"

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
  const panelOpen = useEditorStore((s) => s.panelOpen)

  useEffect(() => {
    useEditorStore.getState().initFromWorkflow(workflow)
  }, [workflow])

  return (
    <div className="flex h-full flex-col">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <ReactFlowProvider>
          <div className={panelOpen ? "flex-1" : "w-full"}>
            <Canvas />
          </div>
        </ReactFlowProvider>
        {panelOpen && <SidePanel />}
      </div>
    </div>
  )
}
