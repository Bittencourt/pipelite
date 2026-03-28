"use client"

import {
  ReactFlow,
  Background,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { nodeTypes, edgeTypes } from "./node-types"
import { useEditorStore } from "../lib/editor-store"

export function Canvas() {
  const nodes = useEditorStore((s) => s.nodes)
  const edges = useEditorStore((s) => s.edges)
  const onNodesChange = useEditorStore((s) => s.onNodesChange)
  const onEdgesChange = useEditorStore((s) => s.onEdgesChange)
  const selectNode = useEditorStore((s) => s.selectNode)

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={(changes: NodeChange[]) => onNodesChange(changes)}
      onEdgesChange={(changes: EdgeChange[]) => onEdgesChange(changes)}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_, node) => selectNode(node.id)}
      onPaneClick={() => selectNode(null)}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      deleteKeyCode={null}
      defaultEdgeOptions={{ type: "addButton", animated: false }}
    >
      <Background />
    </ReactFlow>
  )
}
