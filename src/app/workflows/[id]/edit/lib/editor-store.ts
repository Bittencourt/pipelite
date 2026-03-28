// Zustand editor state management for the visual workflow editor

import { create } from "zustand"
import type { Node, Edge, NodeChange, EdgeChange } from "@xyflow/react"
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react"
import type { WorkflowNode } from "@/lib/execution/types"
import type { TriggerConfig } from "@/lib/triggers/types"
import type { EditorNode, EditorNodeData } from "./types"
import { toReactFlowGraph, toWorkflowNodes, toTriggerConfig } from "./graph-converter"
import {
  addNodeAfter,
  removeNode as removeNodeMutation,
  reorderNode as reorderNodeMutation,
  createNewNode,
} from "./graph-mutations"

export interface EditorState {
  // Workflow metadata
  workflowId: string | null
  workflowName: string
  description: string
  active: boolean

  // Source of truth for DB format
  triggers: TriggerConfig[]
  workflowNodes: WorkflowNode[]

  // React Flow display state (derived from workflowNodes)
  nodes: EditorNode[]
  edges: Edge[]

  // UI state
  selectedNodeId: string | null
  panelOpen: boolean
  panelMode: "type-picker" | "config"
  insertAfterNodeId: string | null
  insertBranch: "true" | "false" | null
  dirty: boolean
  _typePickerJustOpened: boolean
}

export interface EditorActions {
  // Initialization
  initFromWorkflow: (workflow: {
    id: string
    name: string
    description: string | null
    active: boolean
    triggers: TriggerConfig[]
    nodes: WorkflowNode[]
  }) => void

  // React Flow change handlers (viewport, selection, drag)
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void

  // Node selection
  selectNode: (nodeId: string | null) => void

  // Side panel
  openTypePicker: (afterNodeId: string, branch?: "true" | "false") => void

  // Graph mutations (operate on workflowNodes, reconvert to RF)
  addNode: (type: "action" | "condition" | "delay", actionType?: string) => void
  removeNode: (nodeId: string) => void
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void
  updateNodeLabel: (nodeId: string, label: string) => void

  // Reorder
  reorderNode: (nodeId: string, direction: "up" | "down") => void

  // Metadata
  setWorkflowName: (name: string) => void
  setDescription: (description: string) => void
  setActive: (active: boolean) => void
  setTriggers: (triggers: TriggerConfig[]) => void

  // Save
  getWorkflowForSave: () => {
    name: string
    description: string
    active: boolean
    triggers: TriggerConfig[]
    nodes: WorkflowNode[]
  }
}

function reconvert(
  workflowNodes: WorkflowNode[],
  triggers: TriggerConfig[],
): { nodes: EditorNode[]; edges: Edge[] } {
  return toReactFlowGraph(workflowNodes, triggers)
}

export const useEditorStore = create<EditorState & EditorActions>((set, get) => ({
  // Initial state
  workflowId: null,
  workflowName: "",
  description: "",
  active: false,
  triggers: [],
  workflowNodes: [],
  nodes: [],
  edges: [],
  selectedNodeId: null,
  panelOpen: false,
  panelMode: "type-picker" as const,
  insertAfterNodeId: null,
  insertBranch: null,
  dirty: false,
  _typePickerJustOpened: false,

  initFromWorkflow: (workflow) => {
    const { nodes, edges } = reconvert(workflow.nodes, workflow.triggers)
    set({
      workflowId: workflow.id,
      workflowName: workflow.name,
      description: workflow.description || "",
      active: workflow.active,
      triggers: workflow.triggers,
      workflowNodes: workflow.nodes,
      nodes,
      edges,
      dirty: false,
      selectedNodeId: null,
      panelOpen: false,
    })
  },

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as EditorNode[],
    }))
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }))
  },

  selectNode: (nodeId) => {
    // Guard: don't override type picker if it was just opened
    if (get()._typePickerJustOpened) return
    set({
      selectedNodeId: nodeId,
      panelOpen: nodeId !== null,
      panelMode: "config" as const,
    })
  },

  openTypePicker: (afterNodeId, branch) => {
    set({
      insertAfterNodeId: afterNodeId,
      insertBranch: branch ?? null,
      panelOpen: true,
      panelMode: "type-picker" as const,
      selectedNodeId: null,
      _typePickerJustOpened: true,
    })
    // Reset guard after event loop completes
    setTimeout(() => set({ _typePickerJustOpened: false }), 0)
  },

  addNode: (type, actionType) => {
    const state = get()
    const newNode = createNewNode(type, actionType)
    const afterId = state.insertAfterNodeId

    if (!afterId) return

    const updatedNodes = addNodeAfter(state.workflowNodes, afterId, newNode, state.insertBranch ?? undefined)
    const { nodes, edges } = reconvert(updatedNodes, state.triggers)

    set({
      workflowNodes: updatedNodes,
      nodes,
      edges,
      dirty: true,
      selectedNodeId: newNode.id,
      panelOpen: true,
      panelMode: "config" as const,
      insertAfterNodeId: null,
      insertBranch: null,
    })
  },

  removeNode: (nodeId) => {
    const state = get()
    const updatedNodes = removeNodeMutation(state.workflowNodes, nodeId)
    const { nodes, edges } = reconvert(updatedNodes, state.triggers)

    set({
      workflowNodes: updatedNodes,
      nodes,
      edges,
      dirty: true,
      selectedNodeId: null,
      panelOpen: false,
    })
  },

  updateNodeConfig: (nodeId, config) => {
    const state = get()
    const updatedNodes = state.workflowNodes.map((n) =>
      n.id === nodeId
        ? ({ ...n, config: { ...n.config, ...config } } as WorkflowNode)
        : n,
    )
    const { nodes, edges } = reconvert(updatedNodes, state.triggers)

    set({
      workflowNodes: updatedNodes,
      nodes,
      edges,
      dirty: true,
    })
  },

  updateNodeLabel: (nodeId, label) => {
    const state = get()
    const updatedNodes = state.workflowNodes.map((n) =>
      n.id === nodeId ? { ...n, label } : n,
    )
    const { nodes, edges } = reconvert(updatedNodes, state.triggers)

    set({
      workflowNodes: updatedNodes,
      nodes,
      edges,
      dirty: true,
    })
  },

  reorderNode: (nodeId, direction) => {
    const state = get()
    const updatedNodes = reorderNodeMutation(state.workflowNodes, nodeId, direction)
    const { nodes, edges } = reconvert(updatedNodes, state.triggers)
    set({ workflowNodes: updatedNodes, nodes, edges, dirty: true })
  },

  setWorkflowName: (name) => set({ workflowName: name, dirty: true }),
  setDescription: (description) => set({ description, dirty: true }),
  setActive: (active) => set({ active, dirty: true }),

  setTriggers: (triggers) => {
    const state = get()
    const { nodes, edges } = reconvert(state.workflowNodes, triggers)
    set({ triggers, nodes, edges, dirty: true })
  },

  getWorkflowForSave: () => {
    const state = get()
    return {
      name: state.workflowName,
      description: state.description,
      active: state.active,
      triggers: state.triggers,
      nodes: state.workflowNodes,
    }
  },
}))
