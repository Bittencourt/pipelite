import { z } from "zod"

// --- CRM Event Trigger ---

export const crmEventTriggerSchema = z.object({
  type: z.literal("crm_event"),
  entity: z.enum(["deal", "person", "organization", "activity"]),
  action: z.enum(["created", "updated", "deleted", "stage_changed"]),
  fieldFilters: z.array(z.string()).default([]),
  fromStageId: z.string().optional(),
  toStageId: z.string().optional(),
})

export type CrmEventTriggerConfig = z.infer<typeof crmEventTriggerSchema>

// --- Schedule Trigger ---

export const scheduleTriggerSchema = z.object({
  type: z.literal("schedule"),
  mode: z.enum(["interval", "cron"]),
  intervalMinutes: z.number().min(1).optional(),
  cronExpression: z.string().optional(),
})

export type ScheduleTriggerConfig = z.infer<typeof scheduleTriggerSchema>

// --- Webhook Trigger ---

export const webhookTriggerSchema = z.object({
  type: z.literal("webhook"),
  secret: z.string().min(32),
  responseStatusCode: z.number().default(200),
  responseBody: z.string().optional(),
})

export type WebhookTriggerConfig = z.infer<typeof webhookTriggerSchema>

// --- Manual Trigger ---

export const manualTriggerSchema = z.object({
  type: z.literal("manual"),
})

export type ManualTriggerConfig = z.infer<typeof manualTriggerSchema>

// --- Discriminated Union ---

export const triggerConfigSchema = z.discriminatedUnion("type", [
  crmEventTriggerSchema,
  scheduleTriggerSchema,
  webhookTriggerSchema,
  manualTriggerSchema,
])

export type TriggerConfig = z.infer<typeof triggerConfigSchema>

// --- Triggers Array ---

export const triggersArraySchema = z.array(triggerConfigSchema).max(20)

// --- Trigger Envelope ---

export interface TriggerEnvelope {
  trigger_type: "crm_event" | "schedule" | "webhook" | "manual"
  trigger_id: string
  timestamp: string
  data: Record<string, unknown>
}
