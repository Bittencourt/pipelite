// Variable tree builder for autocomplete in workflow editor

import type { WorkflowNode } from "@/lib/execution/types"
import type { TriggerConfig } from "@/lib/triggers/types"

export interface VariableEntry {
  path: string
  label: string
  group: string
  type: "string" | "number" | "object" | "array"
}

// Static output schemas per action type
const ACTION_OUTPUT_SCHEMAS: Record<string, Array<{ suffix: string; label: string; type: VariableEntry["type"] }>> = {
  http_request: [
    { suffix: "statusCode", label: "Status Code", type: "number" },
    { suffix: "headers", label: "Response Headers", type: "object" },
    { suffix: "body", label: "Response Body", type: "object" },
  ],
  crm_action: [
    { suffix: "id", label: "Entity ID", type: "string" },
    { suffix: "entity", label: "Entity Type", type: "string" },
    { suffix: "data", label: "Entity Data", type: "object" },
  ],
  email: [
    { suffix: "sent", label: "Sent", type: "string" },
  ],
  notification: [
    { suffix: "sent", label: "Sent", type: "string" },
  ],
  javascript_transform: [
    { suffix: "result", label: "Transform Result", type: "object" },
  ],
  webhook_response: [
    { suffix: "sent", label: "Sent", type: "string" },
  ],
}

// Trigger variable schemas per trigger type
const TRIGGER_SCHEMAS: Record<string, Array<{ suffix: string; label: string; type: VariableEntry["type"] }>> = {
  crm_event: [
    { suffix: "data.entity", label: "Entity Type", type: "string" },
    { suffix: "data.entityId", label: "Entity ID", type: "string" },
    { suffix: "data.changes", label: "Changed Fields", type: "object" },
  ],
  schedule: [
    { suffix: "data.scheduledAt", label: "Scheduled At", type: "string" },
  ],
  webhook: [
    { suffix: "data.body", label: "Request Body", type: "object" },
    { suffix: "data.headers", label: "Request Headers", type: "object" },
    { suffix: "data.method", label: "HTTP Method", type: "string" },
  ],
  manual: [
    { suffix: "data", label: "Trigger Data", type: "object" },
  ],
}

/**
 * Build a variable tree for autocomplete at the given node position.
 * Only includes variables from trigger + nodes that execute before currentNodeId.
 */
export function buildVariableTree(
  triggers: TriggerConfig[],
  nodes: WorkflowNode[],
  currentNodeId: string,
): VariableEntry[] {
  const entries: VariableEntry[] = []

  // 1. Trigger variables
  entries.push({
    path: "trigger.type",
    label: "Trigger Type",
    group: "Trigger",
    type: "string",
  })

  // Add trigger-specific variables based on first trigger type
  if (triggers.length > 0) {
    const triggerType = triggers[0].type
    const schema = TRIGGER_SCHEMAS[triggerType] || TRIGGER_SCHEMAS.manual
    for (const entry of schema) {
      entries.push({
        path: `trigger.${entry.suffix}`,
        label: entry.label,
        group: "Trigger",
        type: entry.type,
      })
    }
  }

  // 2. Node output variables (only nodes before currentNodeId in array order)
  for (const node of nodes) {
    // Stop at current node
    if (node.id === currentNodeId) break

    if (node.type === "action") {
      const actionType = (node.config.actionType as string) || "http_request"
      const schema = ACTION_OUTPUT_SCHEMAS[actionType] || []
      for (const entry of schema) {
        entries.push({
          path: `nodes.${node.id}.output.${entry.suffix}`,
          label: `${node.label} - ${entry.label}`,
          group: node.label,
          type: entry.type,
        })
      }
    } else if (node.type === "condition") {
      entries.push({
        path: `nodes.${node.id}.output.matched`,
        label: `${node.label} - Matched`,
        group: node.label,
        type: "string",
      })
    } else if (node.type === "delay") {
      entries.push({
        path: `nodes.${node.id}.output.resumedAt`,
        label: `${node.label} - Resumed At`,
        group: node.label,
        type: "string",
      })
    }
  }

  return entries
}
