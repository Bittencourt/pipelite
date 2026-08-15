// NOTE-02 subscriber coverage. Mirrors webhook.test.ts.
//
// CAVEAT: `_resetForTesting()` here calls `crmBus.removeAllListeners("deal.stage_changed")`,
// which ALSO detaches the webhook and workflow-trigger listeners for that event — the bus is a
// globalThis-pinned singleton shared across every subscriber module. The two existing
// `_resetForTesting` helpers behave identically, so this is consistent rather than novel, but a
// test that resets this subscriber and then asserts on webhook delivery for `deal.stage_changed`
// will get a confusing (silently empty) result.
import { describe, it, expect, vi, beforeEach } from "vitest"
import { crmBus } from "../bus"
import type { CrmEventPayload, DealStageChangedPayload } from "../types"

// Mock @/db BEFORE importing the subscriber (vi.mock factories are hoisted above imports).
vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
  },
}))

import { registerStageHistorySubscriber, _resetForTesting } from "./stage-history"
import { db } from "@/db"
import { dealStageHistory } from "@/db/schema"

const mockDb = db as unknown as { insert: ReturnType<typeof vi.fn> }

/** Wire `db.insert(...).values(...)` to a thenable so the subscriber's `.catch` has something to attach to. */
function stubInsert(result: Promise<unknown> = Promise.resolve(undefined)) {
  const valuesFn = vi.fn().mockReturnValue(result)
  mockDb.insert.mockReturnValue({ values: valuesFn })
  return valuesFn
}

function stagePayload(overrides: Partial<DealStageChangedPayload> = {}): DealStageChangedPayload {
  return {
    entity: "deal",
    entityId: "deal-1",
    action: "updated",
    data: {},
    changedFields: ["stageId"],
    userId: "user-1",
    timestamp: "2026-08-15T12:00:00Z",
    oldStageId: "stage-a",
    newStageId: "stage-b",
    ...overrides,
  }
}

/** Let the fire-and-forget insert's promise callbacks run. */
const flush = () => new Promise((resolve) => setImmediate(resolve))

describe("registerStageHistorySubscriber", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetForTesting()
  })

  it("inserts one deal_stage_history row on deal.stage_changed", () => {
    const valuesFn = stubInsert()
    registerStageHistorySubscriber()

    crmBus.emit("deal.stage_changed", stagePayload())

    expect(mockDb.insert).toHaveBeenCalledOnce()
    expect(mockDb.insert).toHaveBeenCalledWith(dealStageHistory)
    expect(valuesFn).toHaveBeenCalledOnce()
    expect(valuesFn).toHaveBeenCalledWith({
      dealId: "deal-1",
      fromStageId: "stage-a",
      toStageId: "stage-b",
      changedBy: "user-1",
    })
  })

  it("maps a missing oldStageId to a null fromStageId", () => {
    const valuesFn = stubInsert()
    registerStageHistorySubscriber()

    const payload = stagePayload()
    // A deal entering its first stage has no prior stage. The emit sites type oldStageId as
    // required, but the update path reads it off a row where it can be absent.
    delete (payload as Partial<DealStageChangedPayload>).oldStageId

    crmBus.emit("deal.stage_changed", payload)

    const row = valuesFn.mock.calls[0][0]
    expect(row.fromStageId).toBeNull()
    expect(row.fromStageId).not.toBeUndefined()
    expect(row.fromStageId).not.toBe("")
  })

  it("maps a missing userId to a null changedBy", () => {
    const valuesFn = stubInsert()
    registerStageHistorySubscriber()

    const payload = stagePayload()
    delete (payload as Partial<DealStageChangedPayload>).userId

    crmBus.emit("deal.stage_changed", payload)

    const row = valuesFn.mock.calls[0][0]
    expect(row.changedBy).toBeNull()
    expect(row.changedBy).not.toBeUndefined()
  })

  it("does not double-register on repeated calls", () => {
    stubInsert()
    registerStageHistorySubscriber()
    registerStageHistorySubscriber()

    crmBus.emit("deal.stage_changed", stagePayload())

    expect(mockDb.insert).toHaveBeenCalledOnce()
  })

  it("ignores other CRM events", () => {
    stubInsert()
    registerStageHistorySubscriber()

    const generic: CrmEventPayload = {
      entity: "deal",
      entityId: "deal-1",
      action: "updated",
      data: {},
      changedFields: null,
      userId: "user-1",
      timestamp: "2026-08-15T12:00:00Z",
    }
    crmBus.emit("deal.updated", generic)
    crmBus.emit("activity.created", { ...generic, entity: "activity", action: "created" })

    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("logs and does not reject when the insert fails", async () => {
    const boom = new Error("insert exploded")
    stubInsert(Promise.reject(boom))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on("unhandledRejection", onUnhandled)

    try {
      registerStageHistorySubscriber()

      // emit() is synchronous — it must not throw even though the insert rejects.
      expect(() => crmBus.emit("deal.stage_changed", stagePayload())).not.toThrow()

      await flush()

      expect(errorSpy).toHaveBeenCalledWith("[stage-history]", boom)
      expect(unhandled).toHaveLength(0)
    } finally {
      process.off("unhandledRejection", onUnhandled)
      errorSpy.mockRestore()
    }
  })
})
