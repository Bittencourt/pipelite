import { describe, it, expect } from "vitest"
import { computeLayout } from "./dagre-layout"
import type { Edge } from "@xyflow/react"

function makeNode(id: string) {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
    type: "default",
  }
}

describe("layout", () => {
  it("single node gets a position with x,y defined", () => {
    const nodes = [makeNode("a")]
    const edges: Edge[] = []
    const result = computeLayout(nodes, edges)
    expect(result.nodes[0].position.x).toBeDefined()
    expect(result.nodes[0].position.y).toBeDefined()
    expect(typeof result.nodes[0].position.x).toBe("number")
    expect(typeof result.nodes[0].position.y).toBe("number")
  })

  it("multiple nodes in linear chain get incrementing y positions", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")]
    const edges: Edge[] = [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "b", target: "c" },
    ]
    const result = computeLayout(nodes, edges)

    const yA = result.nodes.find((n) => n.id === "a")!.position.y
    const yB = result.nodes.find((n) => n.id === "b")!.position.y
    const yC = result.nodes.find((n) => n.id === "c")!.position.y
    expect(yB).toBeGreaterThan(yA)
    expect(yC).toBeGreaterThan(yB)
  })

  it("condition branches produce nodes at different x positions", () => {
    const nodes = [makeNode("c1"), makeNode("left"), makeNode("right")]
    const edges: Edge[] = [
      { id: "e1", source: "c1", target: "left", sourceHandle: "true" },
      { id: "e2", source: "c1", target: "right", sourceHandle: "false" },
    ]
    const result = computeLayout(nodes, edges)

    const xLeft = result.nodes.find((n) => n.id === "left")!.position.x
    const xRight = result.nodes.find((n) => n.id === "right")!.position.x
    expect(xLeft).not.toBe(xRight)
  })
})
