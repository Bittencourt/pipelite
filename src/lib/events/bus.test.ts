import { describe, it, expect, vi } from "vitest"
import { crmBus } from "./bus"
import type { CrmEventPayload } from "./types"

function makePayload(overrides: Partial<CrmEventPayload> = {}): CrmEventPayload {
  return {
    entity: "deal",
    entityId: "d-1",
    action: "created",
    data: { title: "Test Deal" },
    changedFields: null,
    userId: "u-1",
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

describe("CrmEventBus", () => {
  it("delivers payload to registered handler via emit/on", () => {
    const handler = vi.fn()
    const payload = makePayload()

    crmBus.on("deal.created", handler)
    crmBus.emit("deal.created", payload)
    crmBus.off("deal.created", handler)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(payload)
  })

  it("off removes handler so it no longer receives events", () => {
    const handler = vi.fn()

    crmBus.on("person.created", handler)
    crmBus.off("person.created", handler)
    crmBus.emit("person.created", makePayload({ entity: "person" }))

    expect(handler).not.toHaveBeenCalled()
  })

  it("multiple listeners all receive the same event", () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    const payload = makePayload({ entity: "organization", action: "deleted" })

    crmBus.on("organization.deleted", handler1)
    crmBus.on("organization.deleted", handler2)
    crmBus.emit("organization.deleted", payload)
    crmBus.off("organization.deleted", handler1)
    crmBus.off("organization.deleted", handler2)

    expect(handler1).toHaveBeenCalledWith(payload)
    expect(handler2).toHaveBeenCalledWith(payload)
  })

  it("does not deliver events to handlers of different event names", () => {
    const handler = vi.fn()

    crmBus.on("deal.updated", handler)
    crmBus.emit("deal.created", makePayload())
    crmBus.off("deal.updated", handler)

    expect(handler).not.toHaveBeenCalled()
  })
})
