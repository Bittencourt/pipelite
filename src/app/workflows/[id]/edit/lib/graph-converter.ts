// DB <-> React Flow format conversion for the visual workflow editor

import type { Edge } from "@xyflow/react"
import type { WorkflowNode, ConditionNode, SplitNode } from "@/lib/execution/types"
import type { TriggerConfig } from "@/lib/triggers/types"
import type { EditorNode, EditorNodeData } from "./types"
import { computeLayout } from "./dagre-layout"

/**
 * Convert DB workflow nodes + trigger config into React Flow nodes and edges.
 * Creates a virtual "trigger" node at the top of the graph.
 */
export function toReactFlowGraph(
  nodes: WorkflowNode[],
  triggers: TriggerConfig[],
): { nodes: EditorNode[]; edges: Edge[] } {
  const rfNodes: EditorNode[] = []
  const rfEdges: Edge[] = []

  // Create virtual trigger node
  const triggerNode: EditorNode = {
    id: "trigger",
    type: "trigger",
    position: { x: 0, y: 0 },
    data: {
      workflowNode: null,
      triggerConfig: triggers,
      label: "Trigger",
      nodeType: "trigger",
    } satisfies EditorNodeData,
  }
  rfNodes.push(triggerNode)

  // Build a lookup for quick access
  const nodeMap = new Map<string, WorkflowNode>()
  for (const node of nodes) {
    nodeMap.set(node.id, node)
  }

  // Find the first node in the chain (not referenced by any other node's nextNodeId)
  const referencedIds = new Set<string>()
  for (const node of nodes) {
    if (node.nextNodeId) referencedIds.add(node.nextNodeId)
    if (node.type === "condition") {
      if (node.trueBranch) referencedIds.add(node.trueBranch)
      if (node.falseBranch) referencedIds.add(node.falseBranch)
    }
    if (node.type === "split") {
      if (node.branchA) referencedIds.add(node.branchA)
      if (node.branchB) referencedIds.add(node.branchB)
    }
  }

  // Create RF nodes for each workflow node
  for (const node of nodes) {
    const data: EditorNodeData = {
      workflowNode: node,
      triggerConfig: null,
      label: node.label,
      nodeType: node.type,
    }

    if (node.type === "action" && node.config.actionType) {
      data.actionType = node.config.actionType as string
    }

    rfNodes.push({
      id: node.id,
      type: node.type,
      position: { x: 0, y: 0 },
      data,
    })
  }

  // Create edges
  // Find root nodes (not referenced by any nextNodeId/trueBranch/falseBranch)
  const rootIds = nodes
    .filter((n) => !referencedIds.has(n.id))
    .map((n) => n.id)

  // Edge from trigger to root node(s)
  for (const rootId of rootIds) {
    rfEdges.push({
      id: `trigger->${rootId}`,
      source: "trigger",
      target: rootId,
    })
  }

  // Edges from node pointers
  for (const node of nodes) {
    if (node.type === "condition") {
      // Condition nodes: edges for true/false branches
      if (node.trueBranch) {
        rfEdges.push({
          id: `${node.id}->true->${node.trueBranch}`,
          source: node.id,
          target: node.trueBranch,
          sourceHandle: "true",
          label: "Yes",
            })
      }
      if (node.falseBranch) {
        rfEdges.push({
          id: `${node.id}->false->${node.falseBranch}`,
          source: node.id,
          target: node.falseBranch,
          sourceHandle: "false",
          label: "No",
            })
      }
      // nextNodeId on condition is for the "after both branches merge" node
      if (node.nextNodeId) {
        rfEdges.push({
          id: `${node.id}->${node.nextNodeId}`,
          source: node.id,
          target: node.nextNodeId,
            })
      }
    } else if (node.type === "split") {
      // Split nodes: edges for branchA/branchB
      if (node.branchA) {
        rfEdges.push({
          id: `${node.id}->branch-a->${node.branchA}`,
          source: node.id,
          target: node.branchA,
          sourceHandle: "branch-a",
          label: "A",
        })
      }
      if (node.branchB) {
        rfEdges.push({
          id: `${node.id}->branch-b->${node.branchB}`,
          source: node.id,
          target: node.branchB,
          sourceHandle: "branch-b",
          label: "B",
        })
      }
      // nextNodeId on split is for the merge point
      if (node.nextNodeId) {
        rfEdges.push({
          id: `${node.id}->${node.nextNodeId}`,
          source: node.id,
          target: node.nextNodeId,
        })
      }
    } else {
      // Action/Delay nodes: edge from nextNodeId
      if (node.nextNodeId) {
        rfEdges.push({
          id: `${node.id}->${node.nextNodeId}`,
          source: node.id,
          target: node.nextNodeId,
            })
      }
    }
  }

  // Apply dagre layout
  const layouted = computeLayout(rfNodes, rfEdges)

  return {
    nodes: layouted.nodes as EditorNode[],
    edges: layouted.edges,
  }
}

/**
 * Convert React Flow nodes and edges back to DB WorkflowNode array.
 * Filters out the trigger node. Rebuilds nextNodeId/trueBranch/falseBranch from edges.
 */
export function toWorkflowNodes(
  rfNodes: EditorNode[],
  rfEdges: Edge[],
): WorkflowNode[] {
  const result: WorkflowNode[] = []

  // Build edge lookup by source
  const edgesBySource = new Map<string, Edge[]>()
  for (const edge of rfEdges) {
    const existing = edgesBySource.get(edge.source) || []
    existing.push(edge)
    edgesBySource.set(edge.source, existing)
  }

  for (const rfNode of rfNodes) {
    // Skip trigger node
    if (rfNode.id === "trigger") continue

    const data = rfNode.data as EditorNodeData
    const workflowNode = data.workflowNode
    if (!workflowNode) continue

    const outEdges = edgesBySource.get(rfNode.id) || []

    if (workflowNode.type === "condition") {
      const trueEdge = outEdges.find((e) => e.sourceHandle === "true")
      const falseEdge = outEdges.find((e) => e.sourceHandle === "false")
      const nextEdge = outEdges.find(
        (e) => !e.sourceHandle || (e.sourceHandle !== "true" && e.sourceHandle !== "false"),
      )

      result.push({
        id: workflowNode.id,
        type: "condition",
        label: workflowNode.label,
        config: { ...workflowNode.config },
        nextNodeId: nextEdge?.target ?? null,
        trueBranch: trueEdge?.target ?? null,
        falseBranch: falseEdge?.target ?? null,
      } as ConditionNode)
    } else if (workflowNode.type === "split") {
      const branchAEdge = outEdges.find((e) => e.sourceHandle === "branch-a")
      const branchBEdge = outEdges.find((e) => e.sourceHandle === "branch-b")
      const nextEdge = outEdges.find(
        (e) => !e.sourceHandle || (e.sourceHandle !== "branch-a" && e.sourceHandle !== "branch-b"),
      )

      result.push({
        id: workflowNode.id,
        type: "split",
        label: workflowNode.label,
        config: { ...workflowNode.config },
        nextNodeId: nextEdge?.target ?? null,
        branchA: branchAEdge?.target ?? null,
        branchB: branchBEdge?.target ?? null,
      } as SplitNode)
    } else {
      // Action or Delay: nextNodeId from edge without sourceHandle
      const nextEdge = outEdges.find((e) => !e.sourceHandle)

      result.push({
        id: workflowNode.id,
        type: workflowNode.type,
        label: workflowNode.label,
        config: { ...workflowNode.config },
        nextNodeId: nextEdge?.target ?? null,
      } as WorkflowNode)
    }
  }

  return result
}

/**
 * Extract trigger config from the React Flow trigger node.
 */
export function toTriggerConfig(rfNodes: EditorNode[]): TriggerConfig[] {
  const triggerNode = rfNodes.find((n) => n.id === "trigger")
  if (!triggerNode) return []
  return (triggerNode.data as EditorNodeData).triggerConfig || []
}
