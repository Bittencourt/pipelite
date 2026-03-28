export interface WorkflowStarterTemplate {
  id: string
  name: string
  description: string
  triggers: Record<string, unknown>[]
  nodes: Record<string, unknown>[]
}

export const workflowStarterTemplates: WorkflowStarterTemplate[] = [
  {
    id: "scheduled-api-sync",
    name: "Scheduled API Sync",
    description: "Fetch data from an API on a schedule and update CRM records",
    triggers: [{ type: "schedule", interval: "daily" }],
    nodes: [
      {
        id: "n1",
        type: "action",
        actionType: "http",
        config: {
          method: "GET",
          url: "https://api.example.com/data",
          headers: { "Content-Type": "application/json" },
          body: "",
          timeout: 30,
          retryCount: 1,
        },
        nextNodeId: "n2",
      },
      {
        id: "n2",
        type: "action",
        actionType: "crm",
        config: {
          entity: "deal",
          action: "create",
          fields: {},
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
        actionType: "notification",
        config: {
          recipientUserIds: [],
          title: "Webhook received",
          message: "New webhook data: {{trigger.body}}",
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
        actionType: "transform",
        config: {
          code: "return { name: input.trigger.body.name }",
        },
        nextNodeId: "n2",
      },
      {
        id: "n2",
        type: "action",
        actionType: "crm",
        config: {
          entity: "organization",
          action: "create",
          fields: { name: "{{nodes.n1.name}}" },
        },
        nextNodeId: null,
      },
    ],
  },
  {
    id: "email-digest",
    name: "Email Digest",
    description: "Send a periodic email summary of recent CRM activity",
    triggers: [{ type: "schedule", cron: "0 9 * * 1" }],
    nodes: [
      {
        id: "n1",
        type: "action",
        actionType: "email",
        config: {
          to: [],
          subject: "Weekly CRM Digest",
          body: "Here is your weekly CRM activity summary.",
        },
        nextNodeId: null,
      },
    ],
  },
]
