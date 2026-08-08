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

// -- Structural (save-time) validation --
//
// Policy: workflow saves validate every action node's config STRUCTURALLY on
// every save (createWorkflow/updateWorkflow) — the actionType must be known,
// all required keys must exist, and every value must have the correct
// type/enum. Business completeness (e.g. a non-empty url or subject) is NOT
// enforced at save time, so a freshly created node with safe-empty defaults
// can be saved before the user fills in the form. The strict schemas above
// remain the contract for execution time.
const structuralSchemaMap: Record<string, z.ZodSchema> = {
  http_request: httpRequestConfigSchema.extend({ url: z.string() }),
  crm_action: crmActionConfigSchema,
  email: emailConfigSchema.extend({
    subject: z.string(),
    body: z.string(),
  }),
  notification: notificationConfigSchema.extend({ message: z.string() }),
  javascript_transform: jsTransformConfigSchema.extend({ code: z.string() }),
  webhook_response: webhookResponseConfigSchema,
}

export type ActionConfigValidationResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Non-throwing structural validation of an action config: correct shape,
 * keys, and value types for its actionType, but empty-string placeholders
 * are allowed. Used by workflow save mutations.
 */
export function validateActionConfigStructure(
  config: Record<string, unknown>
): ActionConfigValidationResult {
  const actionType = config.actionType
  if (typeof actionType !== "string" || actionType.length === 0) {
    return { success: false, error: "Missing action type" }
  }
  const schema = structuralSchemaMap[actionType]
  if (!schema) {
    return { success: false, error: `Unknown action type: ${actionType}` }
  }
  const result = schema.safeParse(config)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path.join(".")
    const message = issue?.message ?? "Invalid config"
    return { success: false, error: path ? `${path}: ${message}` : message }
  }
  return { success: true }
}

// -- Default configs for new action nodes --
//
// Every key required by the structural schema is present with a safe empty
// value, so a brand-new node saves cleanly and the execution engine never
// reads `undefined` where a string/number/array is expected.
const defaultConfigMap: Record<string, Record<string, unknown>> = {
  http_request: {
    actionType: "http_request",
    method: "GET",
    url: "",
    timeout: 30,
    retryCount: 0,
  },
  crm_action: {
    actionType: "crm_action",
    entity: "deal",
    operation: "create",
    fieldMapping: {},
  },
  email: {
    actionType: "email",
    recipients: [],
    subject: "",
    body: "",
  },
  notification: {
    actionType: "notification",
    userIds: [],
    message: "",
  },
  javascript_transform: {
    actionType: "javascript_transform",
    code: "",
  },
  webhook_response: {
    actionType: "webhook_response",
    statusCode: 200,
  },
}

/**
 * Structurally valid minimal config for a newly created action node.
 * Falls back to `{ actionType }` for unknown types.
 */
export function defaultActionConfig(actionType: string): Record<string, unknown> {
  const defaults = defaultConfigMap[actionType]
  return defaults ? { ...defaults } : { actionType }
}
