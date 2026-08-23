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
  /**
   * The `data` payload of this workflow's most recent NON-test run, or `null` when it has never
   * run — the prefill for the test-run dialog's trigger-data editor (WFOPS-02).
   *
   * A sibling of `workflow` rather than a field of it: the editor store is initialised from
   * `workflow` and holds the DEFINITION, and run history is not part of that.
   */
  latestTriggerData: Record<string, unknown> | null
}

export function WorkflowEditor({ workflow, latestTriggerData }: WorkflowEditorProps) {
  const panelOpen = useEditorStore((s) => s.panelOpen)

  useEffect(() => {
    useEditorStore.getState().initFromWorkflow(workflow)
  }, [workflow])

  return (
    <div className="flex h-full flex-col">
      <Toolbar latestTriggerData={latestTriggerData} />
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
