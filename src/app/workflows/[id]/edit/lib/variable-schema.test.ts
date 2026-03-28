import { describe, it, expect } from "vitest"
import { buildVariableTree } from "./variable-schema"
import type { WorkflowNode, ActionNode } from "@/lib/execution/types"
import type { TriggerConfig } from "@/lib/triggers/types"

function makeAction(id: string, nextNodeId: string | null, actionType: string): ActionNode {
  return {
    id,
    type: "action",
    label: `Action ${id}`,
    config: { actionType },
    nextNodeId,
  }
}

describe("variable-schema", () => {
  describe("trigger variables", () => {
    it("crm_event trigger includes entity/entityId/changes paths", () => {
      const triggers: TriggerConfig[] = [
        { type: "crm_event", entity: "deal", action: "updated", fieldFilters: [] },
      ]
      const nodes: WorkflowNode[] = [makeAction("a1", null, "http_request")]
      const result = buildVariableTree(triggers, nodes, "a1")

      const paths = result.map((v) => v.path)
      expect(paths).toContain("trigger.type")
      expect(paths).toContain("trigger.data.entity")
      expect(paths).toContain("trigger.data.entityId")
      expect(paths).toContain("trigger.data.changes")
    })

    it("webhook trigger includes body/headers/method paths", () => {
      const triggers: TriggerConfig[] = [
        { type: "webhook", secret: "a".repeat(32), responseStatusCode: 200 },
      ]
      const nodes: WorkflowNode[] = [makeAction("a1", null, "http_request")]
      const result = buildVariableTree(triggers, nodes, "a1")

      const paths = result.map((v) => v.path)
      expect(paths).toContain("trigger.data.body")
      expect(paths).toContain("trigger.data.headers")
      expect(paths).toContain("trigger.data.method")
    })
  })

  describe("node output variables", () => {
    it("http_request node before current includes statusCode/body/headers", () => {
      const triggers: TriggerConfig[] = [{ type: "manual" }]
      const nodes: WorkflowNode[] = [
        makeAction("a1", "a2", "http_request"),
        makeAction("a2", null, "email"),
      ]
      const result = buildVariableTree(triggers, nodes, "a2")

      const paths = result.map((v) => v.path)
      expect(paths).toContain("nodes.a1.output.statusCode")
      expect(paths).toContain("nodes.a1.output.body")
      expect(paths).toContain("nodes.a1.output.headers")
    })

    it("crm_action node before current includes id/entity/data", () => {
      const triggers: TriggerConfig[] = [{ type: "manual" }]
      const nodes: WorkflowNode[] = [
        makeAction("a1", "a2", "crm_action"),
        makeAction("a2", null, "http_request"),
      ]
      const result = buildVariableTree(triggers, nodes, "a2")

      const paths = result.map((v) => v.path)
      expect(paths).toContain("nodes.a1.output.id")
      expect(paths).toContain("nodes.a1.output.entity")
      expect(paths).toContain("nodes.a1.output.data")
    })

    it("node AFTER current is not included in variables", () => {
      const triggers: TriggerConfig[] = [{ type: "manual" }]
      const nodes: WorkflowNode[] = [
        makeAction("a1", "a2", "http_request"),
        makeAction("a2", "a3", "email"),
        makeAction("a3", null, "crm_action"),
      ]
      const result = buildVariableTree(triggers, nodes, "a2")

      const paths = result.map((v) => v.path)
      expect(paths.some((p) => p.startsWith("nodes.a3"))).toBe(false)
    })

    it("current node itself is not included", () => {
      const triggers: TriggerConfig[] = [{ type: "manual" }]
      const nodes: WorkflowNode[] = [
        makeAction("a1", "a2", "http_request"),
        makeAction("a2", null, "email"),
      ]
      const result = buildVariableTree(triggers, nodes, "a2")

      const paths = result.map((v) => v.path)
      expect(paths.some((p) => p.startsWith("nodes.a2"))).toBe(false)
    })

    it("multiple prior nodes all have their outputs included in order", () => {
      const triggers: TriggerConfig[] = [{ type: "manual" }]
      const nodes: WorkflowNode[] = [
        makeAction("a1", "a2", "http_request"),
        makeAction("a2", "a3", "crm_action"),
        makeAction("a3", null, "email"),
      ]
      const result = buildVariableTree(triggers, nodes, "a3")

      const paths = result.map((v) => v.path)
      // a1 outputs
      expect(paths).toContain("nodes.a1.output.statusCode")
      // a2 outputs
      expect(paths).toContain("nodes.a2.output.id")
      // a1 entries come before a2 entries
      const a1Idx = paths.findIndex((p) => p.startsWith("nodes.a1"))
      const a2Idx = paths.findIndex((p) => p.startsWith("nodes.a2"))
      expect(a1Idx).toBeLessThan(a2Idx)
    })
  })
})
