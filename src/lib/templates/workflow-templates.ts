export interface WorkflowStarterTemplate {
  id: string
  name: string
  description: string
  triggers: Record<string, unknown>[]
  nodes: Record<string, unknown>[]
}

// Node `actionType` lives INSIDE `config` with the canonical registry names
// (http_request, crm_action, javascript_transform, email, notification) — this
// is what both the execution engine (node.config.actionType) and the visual
// editor's graph-converter read. Config field names match the Zod schemas in
// src/lib/execution/actions/types.ts.
export const workflowStarterTemplates: WorkflowStarterTemplate[] = [
  {
    id: "scheduled-api-sync",
    name: "Scheduled API Sync",
    description: "Fetch data from an API on a schedule and update CRM records",
    triggers: [{ type: "schedule", mode: "interval", intervalMinutes: 1440 }],
    nodes: [
      {
        id: "n1",
        type: "action",
        label: "Fetch from API",
        config: {
          actionType: "http_request",
          method: "GET",
          url: "https://api.example.com/data",
          headers: { "Content-Type": "application/json" },
          timeout: 30,
          retryCount: 1,
        },
        nextNodeId: "n2",
      },
      {
        id: "n2",
        type: "action",
        label: "Create Deal",
        config: {
          actionType: "crm_action",
          entity: "deal",
          operation: "create",
          fieldMapping: {},
        },
        nextNodeId: null,
      },
    ],
  },
  {
    id: "webhook-notifier",
    name: "Webhook Notifier",
    description: "Receive a webhook and send a notification to your team",
    triggers: [{ type: "webhook" }],
    nodes: [
      {
        id: "n1",
        type: "action",
        label: "Notify Team",
        config: {
          actionType: "notification",
          userIds: [],
          message: "New webhook data: {{trigger.data}}",
        },
        nextNodeId: null,
      },
    ],
  },
  {
    id: "data-pipeline",
    name: "Data Pipeline",
    description: "Transform incoming data and create CRM entities automatically",
    triggers: [{ type: "webhook" }],
    nodes: [
      {
        id: "n1",
        type: "action",
        label: "Transform Payload",
        config: {
          actionType: "javascript_transform",
          code: "return { name: input.trigger?.data?.name ?? 'Unnamed' }",
        },
        nextNodeId: "n2",
      },
      {
        id: "n2",
        type: "action",
        label: "Create Organization",
        config: {
          actionType: "crm_action",
          entity: "organization",
          operation: "create",
          fieldMapping: { name: "{{nodes.n1.output.name}}" },
        },
        nextNodeId: null,
      },
    ],
  },
  {
    id: "email-digest",
    name: "Email Digest",
    description: "Send a periodic email summary of recent CRM activity",
    triggers: [{ type: "schedule", mode: "cron", cronExpression: "0 9 * * 1" }],
    nodes: [
      {
        id: "n1",
        type: "action",
        label: "Send Digest Email",
        config: {
          actionType: "email",
          recipients: [],
          subject: "Weekly CRM Digest",
          body: "Here is your weekly CRM activity summary.",
        },
        nextNodeId: null,
      },
    ],
  },
]
