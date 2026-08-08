import { describe, it, expect, vi, beforeEach } from "vitest"
import { crmBus } from "../bus"
import type { CrmEventPayload } from "../types"

// Mock triggerWebhook before importing subscriber
vi.mock("@/lib/api/webhooks/deliver", () => ({
  triggerWebhook: vi.fn(),
}))

import { registerWebhookSubscriber, _resetForTesting } from "./webhook"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"

const mockedTriggerWebhook = vi.mocked(triggerWebhook)

describe("registerWebhookSubscriber", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetForTesting()
  })

  it("calls triggerWebhook with correct args when a CRM event is emitted", () => {
    registerWebhookSubscriber()

    const payload: CrmEventPayload = {
      entity: "deal",
      entityId: "d-42",
      action: "created",
      data: { title: "Big Deal" },
      changedFields: null,
      userId: "u-7",
      timestamp: "2026-03-26T12:00:00Z",
    }

    crmBus.emit("deal.created", payload)

    expect(mockedTriggerWebhook).toHaveBeenCalledOnce()
    expect(mockedTriggerWebhook).toHaveBeenCalledWith(
      "u-7",
      "deal.created",
      "deal",
      "d-42",
      "created",
      { title: "Big Deal" }
    )
  })

  it("handles all 13 CRM event types", () => {
    registerWebhookSubscriber()

    const events = [
      "deal.created", "deal.updated", "deal.deleted", "deal.stage_changed",
      "person.created", "person.updated", "person.deleted",
      "organization.created", "organization.updated", "organization.deleted",
      "activity.created", "activity.updated", "activity.deleted",
    ] as const

    for (const event of events) {
      const payload: CrmEventPayload = {
        entity: event.split(".")[0] as CrmEventPayload["entity"],
        entityId: "id-1",
        action: "created",
        data: {},
        changedFields: null,
        userId: "u-1",
        timestamp: "2026-03-26T12:00:00Z",
      }
      crmBus.emit(event, payload as never)
    }

    expect(mockedTriggerWebhook).toHaveBeenCalledTimes(13)
  })

  it("does not double-register on repeated calls", () => {
    registerWebhookSubscriber()
    registerWebhookSubscriber()

    crmBus.emit("deal.created", {
      entity: "deal",
      entityId: "d-1",
      action: "created",
      data: {},
      changedFields: null,
      userId: "u-1",
      timestamp: "2026-03-26T12:00:00Z",
    })

    // Should still be called only once, not twice
    expect(mockedTriggerWebhook).toHaveBeenCalledOnce()
  })
})
