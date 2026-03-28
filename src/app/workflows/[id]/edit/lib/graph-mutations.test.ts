import { describe, it, expect } from "vitest"
import { addNodeAfter, removeNode, reorderNode } from "./graph-mutations"
import type { WorkflowNode, ActionNode, ConditionNode } from "@/lib/execution/types"

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
})
