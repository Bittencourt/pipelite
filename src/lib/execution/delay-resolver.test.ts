import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { resolveDelay } from "./delay-resolver"
import type { DelayConfig, ExecutionContext } from "./types"

const NOW = new Date("2026-03-28T12:00:00Z")

const makeCtx = (data: Record<string, unknown> = {}): ExecutionContext => ({
  trigger: { type: "crm_event", data },
  nodes: {},
})

describe("resolveDelay", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("fixed mode", () => {
    it("30 minutes from now", () => {
      const config: DelayConfig = { mode: "fixed", duration: 30, unit: "minutes" }
      const result = resolveDelay(config, makeCtx())
      expect(result).toEqual(new Date("2026-03-28T12:30:00Z"))
    })

    it("2 hours from now", () => {
      const config: DelayConfig = { mode: "fixed", duration: 2, unit: "hours" }
      const result = resolveDelay(config, makeCtx())
      expect(result).toEqual(new Date("2026-03-28T14:00:00Z"))
    })

    it("3 days from now", () => {
      const config: DelayConfig = { mode: "fixed", duration: 3, unit: "days" }
      const result = resolveDelay(config, makeCtx())
      expect(result).toEqual(new Date("2026-03-31T12:00:00Z"))
    })
  })

  describe("until mode", () => {
    it("future ISO datetime returns that datetime", () => {
      const config: DelayConfig = { mode: "until", untilTime: "2026-04-01T10:00:00Z" }
      const result = resolveDelay(config, makeCtx())
      expect(result).toEqual(new Date("2026-04-01T10:00:00Z"))
    })

    it("past ISO datetime returns null (skip delay)", () => {
      const config: DelayConfig = { mode: "until", untilTime: "2026-03-27T10:00:00Z" }
      const result = resolveDelay(config, makeCtx())
      expect(result).toBeNull()
    })

    it("invalid datetime string throws error", () => {
      const config: DelayConfig = { mode: "until", untilTime: "not-a-date" }
      expect(() => resolveDelay(config, makeCtx())).toThrow("Invalid untilTime")
    })
  })

  describe("field mode", () => {
    it("valid timestamp field in context returns that timestamp", () => {
      const config: DelayConfig = { mode: "field", fieldPath: "trigger.data.followUpAt" }
      const ctx = makeCtx({ followUpAt: "2026-04-05T09:00:00Z" })
      const result = resolveDelay(config, ctx)
      expect(result).toEqual(new Date("2026-04-05T09:00:00Z"))
    })

    it("field not found throws error", () => {
      const config: DelayConfig = { mode: "field", fieldPath: "trigger.data.missing" }
      expect(() => resolveDelay(config, makeCtx())).toThrow(
        "Delay field path 'trigger.data.missing' not found"
      )
    })

    it("field is not a valid date throws error", () => {
      const config: DelayConfig = { mode: "field", fieldPath: "trigger.data.name" }
      const ctx = makeCtx({ name: "not-a-date" })
      expect(() => resolveDelay(config, ctx)).toThrow(
        "Delay field path 'trigger.data.name' does not contain a valid date"
      )
    })
  })

  describe("30-day cap", () => {
    it("fixed mode exceeding 30 days is capped", () => {
      const config: DelayConfig = { mode: "fixed", duration: 60, unit: "days" }
      const result = resolveDelay(config, makeCtx())
      // Capped at exactly 30 days from now
      expect(result).toEqual(new Date("2026-04-27T12:00:00Z"))
    })

    it("until mode exceeding 30 days is capped", () => {
      const config: DelayConfig = { mode: "until", untilTime: "2026-06-01T00:00:00Z" }
      const result = resolveDelay(config, makeCtx())
      expect(result).toEqual(new Date("2026-04-27T12:00:00Z"))
    })

    it("field mode exceeding 30 days is capped", () => {
      const config: DelayConfig = { mode: "field", fieldPath: "trigger.data.date" }
      const ctx = makeCtx({ date: "2027-01-01T00:00:00Z" })
      const result = resolveDelay(config, ctx)
      expect(result).toEqual(new Date("2026-04-27T12:00:00Z"))
    })
  })
})
