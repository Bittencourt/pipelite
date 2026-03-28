export interface HttpTemplateConfig {
  method: string
  url: string
  headers: Record<string, string>
  body: string
  timeout: number
  retryCount: number
}

export interface HttpTemplate {
  id: string
  name: string
  description: string
  service: string
  config: HttpTemplateConfig
}

export const builtInHttpTemplates: HttpTemplate[] = [
  {
    id: "slack-post-message",
    name: "Slack Post Message",
    description: "Send a message to a Slack channel via incoming webhook",
    service: "Slack",
    config: {
      method: "POST",
      url: "https://hooks.slack.com/services/{{WEBHOOK_PATH}}",
      headers: { "Content-Type": "application/json" },
      body: '{"text":"{{message}}"}',
      timeout: 30,
      retryCount: 1,
    },
  },
  {
    id: "discord-webhook",
    name: "Discord Webhook",
    description: "Send a message to a Discord channel via webhook",
    service: "Discord",
    config: {
      method: "POST",
      url: "https://discord.com/api/webhooks/{{WEBHOOK_ID}}/{{WEBHOOK_TOKEN}}",
      headers: { "Content-Type": "application/json" },
      body: '{"content":"{{message}}"}',
      timeout: 30,
      retryCount: 1,
    },
  },
  {
    id: "planka-create-card",
    name: "Planka Create Card",
    description: "Create a card on a Planka board",
    service: "Planka",
    config: {
      method: "POST",
      url: "{{PLANKA_URL}}/api/boards/{{BOARD_ID}}/lists/{{LIST_ID}}/cards",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer {{API_TOKEN}}",
      },
      body: '{"name":"{{card_name}}","description":"{{card_description}}"}',
      timeout: 30,
      retryCount: 1,
    },
  },
  {
    id: "apprise-notify",
    name: "Apprise Notify",
    description: "Send a notification via Apprise",
    service: "Apprise",
    config: {
      method: "POST",
      url: "{{APPRISE_URL}}/notify",
      headers: { "Content-Type": "application/json" },
      body: '{"urls":["{{notification_url}}"],"title":"{{title}}","body":"{{body}}"}',
      timeout: 30,
      retryCount: 1,
    },
  },
  {
    id: "tally-get-responses",
    name: "Tally Get Responses",
    description: "Fetch form responses from Tally",
    service: "Tally",
    config: {
      method: "GET",
      url: "https://api.tally.so/forms/{{FORM_ID}}/responses",
      headers: { Authorization: "Bearer {{API_KEY}}" },
      body: "",
      timeout: 30,
      retryCount: 0,
    },
  },
  {
    id: "typeform-get-responses",
    name: "Typeform Get Responses",
    description: "Fetch form responses from Typeform",
    service: "Typeform",
    config: {
      method: "GET",
      url: "https://api.typeform.com/forms/{{FORM_ID}}/responses",
      headers: { Authorization: "Bearer {{API_TOKEN}}" },
      body: "",
      timeout: 30,
      retryCount: 0,
    },
  },
]
