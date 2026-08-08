import { describe, it, expect } from "vitest"
import { addNodeAfter, removeNode, reorderNode, createNewNode } from "./graph-mutations"
import type { WorkflowNode, ActionNode, ConditionNode, SplitNode } from "@/lib/execution/types"

function makeAction(id: string, nextNodeId: string | null): ActionNode {
  return {
    id,
    type: "action",
    label: `Action ${id}`,
    config: { actionType: "http_request" },
    nextNodeId,
  }
}

function makeCondition(
  id: string,
  nextNodeId: string | null,
  trueBranch: string | null,
  falseBranch: string | null,
): ConditionNode {
  return {
    id,
    type: "condition",
    label: `Condition ${id}`,
    config: { groups: [], logicOperator: "and" as const },
    nextNodeId,
    trueBranch,
    falseBranch,
  }
}

describe("graph-mutations", () => {
  describe("addNodeAfter", () => {
    it("inserts new node after specified node, updating nextNodeId pointers", () => {
      const nodes: WorkflowNode[] = [
        makeAction("a1", "a2"),
        makeAction("a2", null),
      ]
      const newNode = makeAction("a3", null)
      const result = addNodeAfter(nodes, "a1", newNode)

      const a1 = result.find((n) => n.id === "a1")!
      const a3 = result.find((n) => n.id === "a3")!
      expect(a1.nextNodeId).toBe("a3")
      expect(a3.nextNodeId).toBe("a2")
      expect(result).toHaveLength(3)
    })

    it("adds node at end of chain with nextNodeId=null", () => {
      const nodes: WorkflowNode[] = [makeAction("a1", null)]
      const newNode = makeAction("a2", null)
      const result = addNodeAfter(nodes, "a1", newNode)

      const a1 = result.find((n) => n.id === "a1")!
      const a2 = result.find((n) => n.id === "a2")!
      expect(a1.nextNodeId).toBe("a2")
      expect(a2.nextNodeId).toBeNull()
    })

    it("inserts into condition true branch when branch='true'", () => {
      const nodes: WorkflowNode[] = [
        makeCondition("c1", null, "a1", "a2"),
        makeAction("a1", null),
        makeAction("a2", null),
      ]
      const newNode = makeAction("a3", null)
      const result = addNodeAfter(nodes, "c1", newNode, "true")

      const c1 = result.find((n) => n.id === "c1") as ConditionNode
      const a3 = result.find((n) => n.id === "a3")!
      expect(c1.trueBranch).toBe("a3")
      expect(a3.nextNodeId).toBe("a1")
    })

    it("inserts into split branchA when branch='true'", () => {
      const splitNode: SplitNode = {
        id: "s1",
        type: "split",
        label: "Split",
        config: {},
        nextNodeId: null,
        branchA: "a1",
        branchB: "a2",
      }
      const nodes: WorkflowNode[] = [
        splitNode,
        makeAction("a1", null),
        makeAction("a2", null),
      ]
      const newNode = makeAction("a3", null)
      const result = addNodeAfter(nodes, "s1", newNode, "true")

      const s1 = result.find((n) => n.id === "s1") as SplitNode
      const a3 = result.find((n) => n.id === "a3")!
      expect(s1.branchA).toBe("a3")
      expect(a3.nextNodeId).toBe("a1")
    })

    it("inserts into split branchB when branch='false'", () => {
      const splitNode: SplitNode = {
        id: "s1",
        type: "split",
        label: "Split",
        config: {},
        nextNodeId: null,
        branchA: "a1",
        branchB: null,
      }
      const nodes: WorkflowNode[] = [
        splitNode,
        makeAction("a1", null),
      ]
      const newNode = makeAction("a2", null)
      const result = addNodeAfter(nodes, "s1", newNode, "false")

      const s1 = result.find((n) => n.id === "s1") as SplitNode
      const a2 = result.find((n) => n.id === "a2")!
      expect(s1.branchB).toBe("a2")
      expect(a2.nextNodeId).toBeNull()
    })
  })

  describe("removeNode", () => {
    it("removes node and reconnects previous node's nextNodeId", () => {
      const nodes: WorkflowNode[] = [
        makeAction("a1", "a2"),
        makeAction("a2", "a3"),
        makeAction("a3", null),
      ]
      const result = removeNode(nodes, "a2")

      expect(result).toHaveLength(2)
      const a1 = result.find((n) => n.id === "a1")!
      expect(a1.nextNodeId).toBe("a3")
    })

    it("removes first node in chain (trigger reconnects to next)", () => {
      const nodes: WorkflowNode[] = [
        makeAction("a1", "a2"),
        makeAction("a2", null),
      ]
      // First node removed: a2 becomes the new first node
      const result = removeNode(nodes, "a1")

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("a2")
    })

    it("removes only node leaving empty chain", () => {
      const nodes: WorkflowNode[] = [makeAction("a1", null)]
      const result = removeNode(nodes, "a1")
      expect(result).toHaveLength(0)
    })

    it("removes node referenced by split branchA and updates pointer", () => {
      const splitNode: SplitNode = {
        id: "s1",
        type: "split",
        label: "Split",
        config: {},
        nextNodeId: null,
        branchA: "a1",
        branchB: "a2",
      }
      const nodes: WorkflowNode[] = [
        splitNode,
        makeAction("a1", "a3"),
        makeAction("a2", null),
        makeAction("a3", null),
      ]
      const result = removeNode(nodes, "a1")

      expect(result).toHaveLength(3)
      const s1 = result.find((n) => n.id === "s1") as SplitNode
      expect(s1.branchA).toBe("a3")
      expect(s1.branchB).toBe("a2")
    })
  })

  describe("reorderNode", () => {
    it("swaps node with neighbor when moving down", () => {
      const nodes: WorkflowNode[] = [
        makeAction("a1", "a2"),
        makeAction("a2", "a3"),
        makeAction("a3", null),
      ]
      const result = reorderNode(nodes, "a1", "down")

      // After swap: a2 -> a1 -> a3
      const a2 = result.find((n) => n.id === "a2")!
      const a1 = result.find((n) => n.id === "a1")!
      expect(a2.nextNodeId).toBe("a1")
      expect(a1.nextNodeId).toBe("a3")
    })

    it("swaps node with neighbor when moving up", () => {
      const nodes: WorkflowNode[] = [
        makeAction("a1", "a2"),
        makeAction("a2", "a3"),
        makeAction("a3", null),
      ]
      const result = reorderNode(nodes, "a2", "up")

      // After swap: a2 -> a1 -> a3
      const a2 = result.find((n) => n.id === "a2")!
      const a1 = result.find((n) => n.id === "a1")!
      expect(a2.nextNodeId).toBe("a1")
      expect(a1.nextNodeId).toBe("a3")
    })
  })

  describe("createNewNode", () => {
    it("creates a valid SplitNode with branchA/branchB set to null", () => {
      const node = createNewNode("split")
      expect(node.type).toBe("split")
      expect(node.label).toBe("Split")
      expect(node.nextNodeId).toBeNull()
      const split = node as SplitNode
      expect(split.branchA).toBeNull()
      expect(split.branchB).toBeNull()
      expect(split.id).toBeTruthy()
    })
  })
})
