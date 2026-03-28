// Node add/remove/reorder helpers for workflow graph mutations

import type {
  WorkflowNode,
  ActionNode,
  ConditionNode,
  DelayNode,
} from "@/lib/execution/types"

/**
 * Insert a new node after the specified node in the chain.
 * For condition nodes with a branch specified, inserts at the start of that branch.
 */
export function addNodeAfter(
  nodes: WorkflowNode[],
  afterNodeId: string,
  newNode: WorkflowNode,
  branch?: "true" | "false",
): WorkflowNode[] {
  const result = nodes.map((n) => ({ ...n })) as WorkflowNode[]
  const afterNode = result.find((n) => n.id === afterNodeId)
  if (!afterNode) return [...result, newNode]

  if (afterNode.type === "condition" && branch) {
    const condNode = afterNode as ConditionNode
    const branchKey = branch === "true" ? "trueBranch" : "falseBranch"
    const oldTarget = condNode[branchKey]
    condNode[branchKey] = newNode.id
    const inserted = { ...newNode, nextNodeId: oldTarget } as WorkflowNode
    return [...result, inserted]
  }

  // Standard insertion: afterNode -> newNode -> oldNext
  const oldNext = afterNode.nextNodeId
  afterNode.nextNodeId = newNode.id
  const inserted = { ...newNode, nextNodeId: oldNext } as WorkflowNode
  return [...result, inserted]
}

/**
 * Remove a node from the chain, reconnecting the predecessor to the removed node's next.
 */
export function removeNode(
  nodes: WorkflowNode[],
  nodeId: string,
): WorkflowNode[] {
  const target = nodes.find((n) => n.id === nodeId)
  if (!target) return nodes

  const targetNext = target.nextNodeId

  // Find predecessor: any node whose nextNodeId/trueBranch/falseBranch points to nodeId
  const result = nodes
    .filter((n) => n.id !== nodeId)
    .map((n) => {
      const clone = { ...n } as WorkflowNode
      if (clone.nextNodeId === nodeId) {
        clone.nextNodeId = targetNext
      }
      if (clone.type === "condition") {
        const cond = clone as ConditionNode
        if (cond.trueBranch === nodeId) {
          cond.trueBranch = targetNext
        }
        if (cond.falseBranch === nodeId) {
          cond.falseBranch = targetNext
        }
      }
      return clone
    })

  return result
}

/**
 * Swap a node with its neighbor in a linear chain.
 * direction "up" = swap with predecessor, "down" = swap with successor.
 */
export function reorderNode(
  nodes: WorkflowNode[],
  nodeId: string,
  direction: "up" | "down",
): WorkflowNode[] {
  // Build the linear chain order by walking from the root
  const nodeMap = new Map<string, WorkflowNode>()
  for (const n of nodes) nodeMap.set(n.id, n)

  // Find root (not pointed to by any nextNodeId)
  const pointed = new Set<string>()
  for (const n of nodes) {
    if (n.nextNodeId) pointed.add(n.nextNodeId)
    if (n.type === "condition") {
      if (n.trueBranch) pointed.add(n.trueBranch)
      if (n.falseBranch) pointed.add(n.falseBranch)
    }
  }

  const roots = nodes.filter((n) => !pointed.has(n.id))
  if (roots.length === 0) return nodes

  // Walk the chain from root to build ordered list
  const chain: string[] = []
  let current: string | null = roots[0].id
  while (current) {
    chain.push(current)
    const node = nodeMap.get(current)
    current = node?.nextNodeId ?? null
  }

  const idx = chain.indexOf(nodeId)
  if (idx === -1) return nodes

  const swapIdx = direction === "up" ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= chain.length) return nodes

  // Swap in chain
  ;[chain[idx], chain[swapIdx]] = [chain[swapIdx], chain[idx]]

  // Rebuild nextNodeId pointers
  const result = nodes.map((n) => ({ ...n })) as WorkflowNode[]
  for (let i = 0; i < chain.length; i++) {
    const node = result.find((n) => n.id === chain[i])!
    node.nextNodeId = i < chain.length - 1 ? chain[i + 1] : null
  }

  // Also update the predecessor of the chain (if a condition points to root)
  // Update any condition branch pointers that pointed to old root
  const oldRoot = roots[0].id
  const newRoot = chain[0]
  if (oldRoot !== newRoot) {
    for (const n of result) {
      if (n.type === "condition") {
        const cond = n as ConditionNode
        if (cond.trueBranch === oldRoot) cond.trueBranch = newRoot
        if (cond.falseBranch === oldRoot) cond.falseBranch = newRoot
      }
    }
  }

  return result
}

/**
 * Factory function to create a new workflow node with default config.
 */
export function createNewNode(
  type: "action" | "condition" | "delay",
  actionType?: string,
): WorkflowNode {
  const id = crypto.randomUUID()

  switch (type) {
    case "action":
      return {
        id,
        type: "action",
        label: actionType ? actionType.replace(/_/g, " ") : "New Action",
        config: { actionType: actionType || "http_request" },
        nextNodeId: null,
      } as ActionNode

    case "condition":
      return {
        id,
        type: "condition",
        label: "New Condition",
        config: { groups: [], logicOperator: "and" },
        nextNodeId: null,
        trueBranch: null,
        falseBranch: null,
      } as ConditionNode

    case "delay":
      return {
        id,
        type: "delay",
        label: "Delay",
        config: { mode: "fixed", duration: 1, unit: "hours" },
        nextNodeId: null,
      } as DelayNode
  }
}
