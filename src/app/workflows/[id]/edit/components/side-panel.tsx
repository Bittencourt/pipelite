"use client"

import { X, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "../lib/editor-store"
import { ReorderControls } from "./reorder-controls"
import { TypePicker } from "./type-picker"
import { TriggerConfig } from "./config-forms/trigger-config"
import { HttpConfig } from "./config-forms/http-config"
import { CrmConfig } from "./config-forms/crm-config"
import { EmailConfig } from "./config-forms/email-config"
import { NotificationConfig } from "./config-forms/notification-config"
import { ConditionConfig } from "./config-forms/condition-config"
import { DelayConfig } from "./config-forms/delay-config"
import { TransformConfig } from "./config-forms/transform-config"
import { WebhookResponseConfig } from "./config-forms/webhook-response-config"

function ConfigRouter({
  nodeId,
  nodeType,
  actionType,
  config,
}: {
  nodeId: string
  nodeType: string
  actionType?: string
  config: Record<string, unknown>
}) {
  if (nodeId === "trigger") {
    return <TriggerConfig />
  }

  if (nodeType === "condition") {
    return <ConditionConfig nodeId={nodeId} config={config} />
  }

  if (nodeType === "delay") {
    return <DelayConfig nodeId={nodeId} config={config} />
  }

  // action node -- route by actionType
  switch (actionType) {
    case "http_request":
      return <HttpConfig nodeId={nodeId} config={config} />
    case "crm_action":
      return <CrmConfig nodeId={nodeId} config={config} />
    case "email":
      return <EmailConfig nodeId={nodeId} config={config} />
    case "notification":
      return <NotificationConfig nodeId={nodeId} config={config} />
    case "javascript_transform":
      return <TransformConfig nodeId={nodeId} config={config} />
    case "webhook_response":
      return <WebhookResponseConfig nodeId={nodeId} config={config} />
    default:
      return (
        <div className="p-4 text-sm text-muted-foreground">
          Unknown action type: {actionType}
        </div>
      )
  }
}

export function SidePanel() {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId)
  const panelMode = useEditorStore((s) => s.panelMode)
  const selectNode = useEditorStore((s) => s.selectNode)
  const removeNode = useEditorStore((s) => s.removeNode)
  const workflowNodes = useEditorStore((s) => s.workflowNodes)
  const nodes = useEditorStore((s) => s.nodes)

  // Find selected node data
  const selectedRfNode = nodes.find((n) => n.id === selectedNodeId)
  const selectedWorkflowNode = workflowNodes.find(
    (n) => n.id === selectedNodeId,
  )

  const isTrigger = selectedNodeId === "trigger"
  const nodeLabel =
    panelMode === "type-picker"
      ? "Add Node"
      : selectedRfNode?.data?.label ?? "Configure"

  const nodeType = selectedRfNode?.data?.nodeType ?? "action"
  const actionType = selectedRfNode?.data?.actionType
  const config = (selectedWorkflowNode?.config ?? {}) as Record<string, unknown>

  return (
    <div className="flex h-full w-[400px] flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{nodeLabel}</h3>
          {panelMode === "config" && !isTrigger && selectedNodeId && (
            <ReorderControls nodeId={selectedNodeId} />
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => selectNode(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {panelMode === "type-picker" ? (
          <TypePicker />
        ) : selectedNodeId ? (
          <ConfigRouter
            nodeId={selectedNodeId}
            nodeType={nodeType}
            actionType={actionType}
            config={config}
          />
        ) : null}
      </div>

      {/* Footer: delete button for non-trigger nodes */}
      {panelMode === "config" && !isTrigger && selectedNodeId && (
        <div className="border-t p-4">
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => removeNode(selectedNodeId)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Node
          </Button>
        </div>
      )}
    </div>
  )
}
