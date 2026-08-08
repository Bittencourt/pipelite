import { describe, it, expect } from "vitest"
import { toReactFlowGraph, toWorkflowNodes } from "./graph-converter"
import type { WorkflowNode, ActionNode, ConditionNode, SplitNode } from "@/lib/execution/types"
import type { TriggerConfig } from "@/lib/triggers/types"

const defaultTrigger: TriggerConfig[] = [
  { type: "manual" },
]

function makeAction(id: string, nextNodeId: string | null, actionType = "http_request"): ActionNode {
  return {
    id,
    type: "action",
    label: `Action ${id}`,
    config: { actionType },
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

describe("graph-converter", () => {
  describe("toReactFlowGraph", () => {
    it("empty nodes array returns only trigger node and no edges", () => {
      const result = toReactFlowGraph([], defaultTrigger)
      expect(result.nodes).toHaveLength(1)
      expect(result.nodes[0].id).toBe("trigger")
      expect(result.nodes[0].data.nodeType).toBe("trigger")
      expect(result.edges).toHaveLength(0)
    })

    it("single action node produces trigger + action node + 1 edge", () => {
      const nodes: WorkflowNode[] = [makeAction("a1", null)]
      const result = toReactFlowGraph(nodes, defaultTrigger)
      expect(result.nodes).toHaveLength(2)
      expect(result.edges).toHaveLength(1)
      expect(result.edges[0].source).toBe("trigger")
      expect(result.edges[0].target).toBe("a1")
    })

    it("linear chain of 3 nodes produces trigger + 3 nodes + 3 edges", () => {
      const nodes: WorkflowNode[] = [
        makeAction("a1", "a2"),
        makeAction("a2", "a3"),
        makeAction("a3", null),
      ]
      const result = toReactFlowGraph(nodes, defaultTrigger)
      expect(result.nodes).toHaveLength(4)
      expect(result.edges).toHaveLength(3)

      const edgeSources = result.edges.map((e) => `${e.source}->${e.target}`)
      expect(edgeSources).toContain("trigger->a1")
      expect(edgeSources).toContain("a1->a2")
      expect(edgeSources).toContain("a2->a3")
    })

    it("condition node creates edges with sourceHandle true/false", () => {
      const nodes: WorkflowNode[] = [
        makeCondition("c1", null, "a1", "a2"),
        makeAction("a1", null),
        makeAction("a2", null),
      ]
      const result = toReactFlowGraph(nodes, defaultTrigger)

      const trueEdge = result.edges.find(
        (e) => e.source === "c1" && e.sourceHandle === "true",
      )
      const falseEdge = result.edges.find(
        (e) => e.source === "c1" && e.sourceHandle === "false",
      )
      expect(trueEdge).toBeDefined()
      expect(trueEdge!.target).toBe("a1")
      expect(falseEdge).toBeDefined()
      expect(falseEdge!.target).toBe("a2")
    })

    it("condition with nodes in both branches has all branch nodes present", () => {
      const nodes: WorkflowNode[] = [
        makeCondition("c1", null, "t1", "f1"),
        makeAction("t1", "t2"),
        makeAction("t2", null),
        makeAction("f1", null),
      ]
      const result = toReactFlowGraph(nodes, defaultTrigger)
      const nodeIds = result.nodes.map((n) => n.id)
      expect(nodeIds).toContain("t1")
      expect(nodeIds).toContain("t2")
      expect(nodeIds).toContain("f1")
    })

    it("trigger node has type trigger and is NOT included in toWorkflowNodes output", () => {
      const nodes: WorkflowNode[] = [makeAction("a1", null)]
      const result = toReactFlowGraph(nodes, defaultTrigger)
      const triggerNode = result.nodes.find((n) => n.id === "trigger")
      expect(triggerNode).toBeDefined()
      expect(triggerNode!.data.nodeType).toBe("trigger")
    })

    it("split node creates edges with sourceHandle branch-a/branch-b", () => {
      const nodes: WorkflowNode[] = [
        {
          id: "s1",
          type: "split",
          label: "Split",
          config: {},
          nextNodeId: null,
          branchA: "a1",
          branchB: "a2",
        } as SplitNode,
        makeAction("a1", null),
        makeAction("a2", null),
      ]
      const result = toReactFlowGraph(nodes, defaultTrigger)

      const branchAEdge = result.edges.find(
        (e) => e.source === "s1" && e.sourceHandle === "branch-a",
      )
      const branchBEdge = result.edges.find(
        (e) => e.source === "s1" && e.sourceHandle === "branch-b",
      )
      expect(branchAEdge).toBeDefined()
      expect(branchAEdge!.target).toBe("a1")
      expect(branchAEdge!.label).toBe("A")
      expect(branchBEdge).toBeDefined()
      expect(branchBEdge!.target).toBe("a2")
      expect(branchBEdge!.label).toBe("B")
    })
  })

  describe("round-trip conversion", () => {
    it("toReactFlowGraph -> toWorkflowNodes produces original node array", () => {
      const original: WorkflowNode[] = [
        makeAction("a1", "c1", "http_request"),
        makeCondition("c1", null, "a2", "a3"),
        makeAction("a2", null),
        makeAction("a3", null),
      ]
      const rfGraph = toReactFlowGraph(original, defaultTrigger)
      const roundTripped = toWorkflowNodes(rfGraph.nodes, rfGraph.edges)

      // Same length, trigger excluded
      expect(roundTripped).toHaveLength(original.length)

      // Each node should match original
      for (const origNode of original) {
        const rtNode = roundTripped.find((n) => n.id === origNode.id)
        expect(rtNode).toBeDefined()
        expect(rtNode!.type).toBe(origNode.type)
        expect(rtNode!.label).toBe(origNode.label)
        expect(rtNode!.nextNodeId).toBe(origNode.nextNodeId)

        if (origNode.type === "condition") {
          const rtCond = rtNode as ConditionNode
          expect(rtCond.trueBranch).toBe(origNode.trueBranch)
          expect(rtCond.falseBranch).toBe(origNode.falseBranch)
        }
      }
    })

    it("round-trip preserves split node branchA/branchB", () => {
      const original: WorkflowNode[] = [
        makeAction("a1", "s1"),
        {
          id: "s1",
          type: "split",
          label: "Split",
          config: {},
          nextNodeId: null,
          branchA: "a2",
          branchB: "a3",
        } as SplitNode,
        makeAction("a2", null),
        makeAction("a3", null),
      ]
      const rfGraph = toReactFlowGraph(original, defaultTrigger)
      const roundTripped = toWorkflowNodes(rfGraph.nodes, rfGraph.edges)

      expect(roundTripped).toHaveLength(original.length)

      const rtSplit = roundTripped.find((n) => n.id === "s1") as SplitNode
      expect(rtSplit).toBeDefined()
      expect(rtSplit.type).toBe("split")
      expect(rtSplit.branchA).toBe("a2")
      expect(rtSplit.branchB).toBe("a3")
      expect(rtSplit.nextNodeId).toBeNull()
    })
  })
})
