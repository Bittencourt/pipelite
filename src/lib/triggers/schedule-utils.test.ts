import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { computeNextRun, getScheduleTrigger } from "./schedule-utils"
import type { ScheduleTriggerConfig, TriggerConfig } from "./types"

describe("computeNextRun", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-28T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("with mode 'interval' and intervalMinutes 60 returns a Date 60 minutes from now", () => {
    const config: ScheduleTriggerConfig = { type: "schedule", mode: "interval", intervalMinutes: 60 }
    const result = computeNextRun(config)
    expect(result).toEqual(new Date("2026-03-28T13:00:00Z"))
  })

  it("with mode 'interval' and intervalMinutes 5 returns a Date 5 minutes from now", () => {
    const config: ScheduleTriggerConfig = { type: "schedule", mode: "interval", intervalMinutes: 5 }
    const result = computeNextRun(config)
    expect(result).toEqual(new Date("2026-03-28T12:05:00Z"))
  })

  it("with mode 'interval' computes from a custom fromDate", () => {
    const config: ScheduleTriggerConfig = { type: "schedule", mode: "interval", intervalMinutes: 30 }
    const from = new Date("2026-03-28T10:00:00Z")
    const result = computeNextRun(config, from)
    expect(result).toEqual(new Date("2026-03-28T10:30:00Z"))
  })

  it("with mode 'interval' but no intervalMinutes returns null", () => {
    const config: ScheduleTriggerConfig = { type: "schedule", mode: "interval" }
    const result = computeNextRun(config)
    expect(result).toBeNull()
  })

  it("with mode 'cron' and expression '0 * * * *' returns next hour mark", () => {
    const config: ScheduleTriggerConfig = { type: "schedule", mode: "cron", cronExpression: "0 * * * *" }
    const result = computeNextRun(config)
    expect(result).toEqual(new Date("2026-03-28T13:00:00Z"))
  })

  it("with mode 'cron' and expression '*/5 * * * *' returns next 5-minute mark", () => {
    const config: ScheduleTriggerConfig = { type: "schedule", mode: "cron", cronExpression: "*/5 * * * *" }
    const result = computeNextRun(config)
    expect(result).toEqual(new Date("2026-03-28T12:05:00Z"))
  })

  it("with mode 'cron' and invalid expression returns null", () => {
    const config: ScheduleTriggerConfig = { type: "schedule", mode: "cron", cronExpression: "not a cron" }
    const result = computeNextRun(config)
    expect(result).toBeNull()
  })

  it("with mode 'cron' but no cronExpression returns null", () => {
    const config = { type: "schedule" as const, mode: "cron" as const }
    const result = computeNextRun(config)
    expect(result).toBeNull()
  })
})

describe("getScheduleTrigger", () => {
  it("extracts first schedule trigger from a triggers array", () => {
    const triggers: TriggerConfig[] = [
      { type: "crm_event", entity: "deal", action: "created", fieldFilters: [] },
      { type: "schedule", mode: "interval", intervalMinutes: 30 },
    ]
    const result = getScheduleTrigger(triggers)
    expect(result).not.toBeNull()
    expect(result!.trigger.type).toBe("schedule")
    expect(result!.trigger.mode).toBe("interval")
    expect(result!.index).toBe(1)
  })

  it("returns null if no schedule trigger in array", () => {
    const triggers: TriggerConfig[] = [
      { type: "crm_event", entity: "deal", action: "created", fieldFilters: [] },
      { type: "manual" },
    ]
    const result = getScheduleTrigger(triggers)
    expect(result).toBeNull()
  })

  it("returns null for empty triggers array", () => {
    const result = getScheduleTrigger([])
    expect(result).toBeNull()
  })

  it("returns the first schedule trigger when multiple exist", () => {
    const triggers: TriggerConfig[] = [
      { type: "schedule", mode: "cron", cronExpression: "0 * * * *" },
      { type: "schedule", mode: "interval", intervalMinutes: 10 },
    ]
    const result = getScheduleTrigger(triggers)
    expect(result!.trigger.mode).toBe("cron")
    expect(result!.index).toBe(0)
  })
})
