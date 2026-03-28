// Editor-specific TypeScript types for the visual workflow editor

import type { Node } from "@xyflow/react"
import type { WorkflowNode } from "@/lib/execution/types"
import type { TriggerConfig } from "@/lib/triggers/types"

export interface EditorNodeData {
  workflowNode: WorkflowNode | null // null for trigger node
  triggerConfig: TriggerConfig[] | null // only set on trigger node
  label: string
  nodeType: "trigger" | "action" | "condition" | "delay"
  actionType?: string
  [key: string]: unknown // Required by React Flow's Record<string, unknown> constraint
}

export type EditorNode = Node<EditorNodeData>
