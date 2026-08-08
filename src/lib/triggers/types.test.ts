import { describe, it, expect } from "vitest"
import {
  crmEventTriggerSchema,
  scheduleTriggerSchema,
  webhookTriggerSchema,
  manualTriggerSchema,
  triggerConfigSchema,
  triggersArraySchema,
} from "./types"
import type { TriggerEnvelope } from "./types"

describe("crmEventTriggerSchema", () => {
  it("validates {type: 'crm_event', entity: 'deal', action: 'created'}", () => {
    const result = crmEventTriggerSchema.safeParse({
      type: "crm_event",
      entity: "deal",
      action: "created",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe("crm_event")
      expect(result.data.entity).toBe("deal")
      expect(result.data.action).toBe("created")
    }
  })

  it("validates stage_changed action with optional fromStageId/toStageId", () => {
    const result = crmEventTriggerSchema.safeParse({
      type: "crm_event",
      entity: "deal",
      action: "stage_changed",
      fromStageId: "stage-1",
      toStageId: "stage-2",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.action).toBe("stage_changed")
      expect(result.data.fromStageId).toBe("stage-1")
      expect(result.data.toStageId).toBe("stage-2")
    }
  })

  it("rejects invalid entity 'invoice'", () => {
    const result = crmEventTriggerSchema.safeParse({
      type: "crm_event",
      entity: "invoice",
      action: "created",
    })
    expect(result.success).toBe(false)
  })

  it("allows optional fieldFilters string array", () => {
    const result = crmEventTriggerSchema.safeParse({
      type: "crm_event",
      entity: "person",
      action: "updated",
      fieldFilters: ["email", "phone"],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fieldFilters).toEqual(["email", "phone"])
    }
  })

  it("defaults fieldFilters to empty array", () => {
    const result = crmEventTriggerSchema.safeParse({
      type: "crm_event",
      entity: "deal",
      action: "created",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fieldFilters).toEqual([])
    }
  })
})

describe("scheduleTriggerSchema", () => {
  it("validates mode 'interval' with intervalMinutes", () => {
    const result = scheduleTriggerSchema.safeParse({
      type: "schedule",
      mode: "interval",
      intervalMinutes: 30,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mode).toBe("interval")
      expect(result.data.intervalMinutes).toBe(30)
    }
  })

  it("validates mode 'cron' with cronExpression", () => {
    const result = scheduleTriggerSchema.safeParse({
      type: "schedule",
      mode: "cron",
      cronExpression: "0 9 * * 1-5",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mode).toBe("cron")
      expect(result.data.cronExpression).toBe("0 9 * * 1-5")
    }
  })

  it("rejects intervalMinutes less than 1", () => {
    const result = scheduleTriggerSchema.safeParse({
      type: "schedule",
      mode: "interval",
      intervalMinutes: 0,
    })
    expect(result.success).toBe(false)
  })
})

describe("webhookTriggerSchema", () => {
  it("requires secret of min 32 chars", () => {
    const result = webhookTriggerSchema.safeParse({
      type: "webhook",
      secret: "a".repeat(32),
    })
    expect(result.success).toBe(true)
  })

  it("rejects secret shorter than 32 chars", () => {
    const result = webhookTriggerSchema.safeParse({
      type: "webhook",
      secret: "too-short",
    })
    expect(result.success).toBe(false)
  })

  it("defaults responseStatusCode to 200", () => {
    const result = webhookTriggerSchema.safeParse({
      type: "webhook",
      secret: "a".repeat(32),
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.responseStatusCode).toBe(200)
    }
  })
})

describe("manualTriggerSchema", () => {
  it("validates {type: 'manual'}", () => {
    const result = manualTriggerSchema.safeParse({ type: "manual" })
    expect(result.success).toBe(true)
  })
})

describe("triggerConfigSchema", () => {
  it("accepts crm_event type", () => {
    const result = triggerConfigSchema.safeParse({
      type: "crm_event",
      entity: "deal",
      action: "created",
    })
    expect(result.success).toBe(true)
  })

  it("accepts schedule type", () => {
    const result = triggerConfigSchema.safeParse({
      type: "schedule",
      mode: "cron",
      cronExpression: "0 * * * *",
    })
    expect(result.success).toBe(true)
  })

  it("accepts webhook type", () => {
    const result = triggerConfigSchema.safeParse({
      type: "webhook",
      secret: "a".repeat(32),
    })
    expect(result.success).toBe(true)
  })

  it("accepts manual type", () => {
    const result = triggerConfigSchema.safeParse({ type: "manual" })
    expect(result.success).toBe(true)
  })

  it("rejects unknown type", () => {
    const result = triggerConfigSchema.safeParse({ type: "unknown" })
    expect(result.success).toBe(false)
  })
})

describe("triggersArraySchema", () => {
  it("validates array of mixed trigger types", () => {
    const result = triggersArraySchema.safeParse([
      { type: "crm_event", entity: "deal", action: "created" },
      { type: "manual" },
      { type: "webhook", secret: "a".repeat(32) },
    ])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(3)
    }
  })

  it("rejects arrays exceeding max 20", () => {
    const items = Array.from({ length: 21 }, () => ({ type: "manual" as const }))
    const result = triggersArraySchema.safeParse(items)
    expect(result.success).toBe(false)
  })
})

describe("TriggerEnvelope type", () => {
  it("has trigger_type, trigger_id, timestamp, data fields", () => {
    const envelope: TriggerEnvelope = {
      trigger_type: "crm_event",
      trigger_id: "trig-1",
      timestamp: new Date().toISOString(),
      data: { entityId: "deal-1" },
    }
    expect(envelope.trigger_type).toBe("crm_event")
    expect(envelope.trigger_id).toBe("trig-1")
    expect(typeof envelope.timestamp).toBe("string")
    expect(envelope.data).toHaveProperty("entityId")
  })
})
