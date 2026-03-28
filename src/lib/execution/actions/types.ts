import { z } from "zod"

// -- HTTP Request --
export const httpRequestConfigSchema = z.object({
  actionType: z.literal("http_request"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  timeout: z.number().min(5).max(120).default(30),
  retryCount: z.number().min(0).max(3).default(0),
})
export type HttpRequestConfig = z.infer<typeof httpRequestConfigSchema>

// -- CRM Action --
export const crmActionConfigSchema = z.object({
  actionType: z.literal("crm_action"),
  entity: z.enum(["deal", "person", "organization", "activity"]),
  operation: z.enum(["create", "update", "delete"]),
  fieldMapping: z.record(z.string(), z.unknown()),
  targetId: z.string().optional(),
  lookupField: z.string().optional(),
  lookupValue: z.string().optional(),
})
export type CrmActionConfig = z.infer<typeof crmActionConfigSchema>

// -- Email --
export const emailConfigSchema = z.object({
  actionType: z.literal("email"),
  recipients: z.array(
    z.object({
      type: z.enum(["user", "dynamic"]),
      value: z.string(),
    })
  ),
  subject: z.string().min(1),
  body: z.string().min(1),
})
export type EmailConfig = z.infer<typeof emailConfigSchema>

// -- Notification --
export const notificationConfigSchema = z.object({
  actionType: z.literal("notification"),
  userIds: z.array(z.string()),
  message: z.string().min(1),
})
export type NotificationConfig = z.infer<typeof notificationConfigSchema>

// -- JavaScript Transform --
export const jsTransformConfigSchema = z.object({
  actionType: z.literal("javascript_transform"),
  code: z.string().min(1),
})
export type JsTransformConfig = z.infer<typeof jsTransformConfigSchema>

// -- Webhook Response --
export const webhookResponseConfigSchema = z.object({
  actionType: z.literal("webhook_response"),
  statusCode: z.number().min(200).max(599).default(200),
  body: z.record(z.string(), z.unknown()).optional(),
})
export type WebhookResponseConfig = z.infer<typeof webhookResponseConfigSchema>

// -- Union type --
export type ActionType =
  | HttpRequestConfig
  | CrmActionConfig
  | EmailConfig
  | NotificationConfig
  | JsTransformConfig
  | WebhookResponseConfig

const schemaMap: Record<string, z.ZodSchema> = {
  http_request: httpRequestConfigSchema,
  crm_action: crmActionConfigSchema,
  email: emailConfigSchema,
  notification: notificationConfigSchema,
  javascript_transform: jsTransformConfigSchema,
  webhook_response: webhookResponseConfigSchema,
}

/**
 * Validate an action config against the correct Zod schema based on actionType.
 * Throws ZodError on invalid config.
 */
export function validateActionConfig(config: Record<string, unknown>): ActionType {
  const actionType = config.actionType as string
  const schema = schemaMap[actionType]
  if (!schema) {
    throw new Error(`Unknown action type: ${actionType}`)
  }
  return schema.parse(config) as ActionType
}
