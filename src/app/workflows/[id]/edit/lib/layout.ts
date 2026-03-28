// Dagre auto-layout computation for workflow graph

import dagre from "@dagrejs/dagre"
import type { Node, Edge } from "@xyflow/react"

const NODE_WIDTH = 240
const NODE_HEIGHT = 60
const RANK_SEP = 80
const NODE_SEP = 40

/**
 * Compute layout positions for nodes using dagre (top-to-bottom orientation).
 * Returns new node/edge arrays with updated positions.
 */
export function computeLayout(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: "TB", ranksep: RANK_SEP, nodesep: NODE_SEP })

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id)
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}
