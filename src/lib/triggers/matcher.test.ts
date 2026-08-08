import { describe, it, expect, vi, beforeEach } from "vitest"
import type { CrmEventPayload, DealStageChangedPayload, CrmEventName } from "@/lib/events/types"
import type { CrmEventTriggerConfig } from "./types"

// Mock the db module
vi.mock("@/db", () => {
  const mockDb = {
    select: vi.fn(),
  }
  return { db: mockDb }
})

// Mock createWorkflowRun
vi.mock("./create-run", () => ({
  createWorkflowRun: vi.fn().mockResolvedValue({ id: "run-1", status: "pending" }),
}))

import { db } from "@/db"
import { createWorkflowRun } from "./create-run"
import { matchesTrigger, matchAndFireTriggers } from "./matcher"

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>
}

const mockCreateWorkflowRun = createWorkflowRun as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

// --- matchesTrigger ---

describe("matchesTrigger", () => {
  const baseTrigger: CrmEventTriggerConfig = {
    type: "crm_event",
    entity: "deal",
    action: "created",
    fieldFilters: [],
  }

  const basePayload: CrmEventPayload = {
    entity: "deal",
    entityId: "deal-1",
    action: "created",
    data: { title: "Test Deal" },
    changedFields: null,
    userId: "user-1",
    timestamp: "2026-03-28T00:00:00Z",
  }

  it("returns true when entity+action match event name", () => {
    expect(matchesTrigger(baseTrigger, "deal.created", basePayload)).toBe(true)
  })

  it("returns false when entity does not match", () => {
    expect(matchesTrigger(baseTrigger, "person.created", {
      ...basePayload,
      entity: "person",
    })).toBe(false)
  })

  it("returns false when action does not match", () => {
    expect(matchesTrigger(baseTrigger, "deal.updated", {
      ...basePayload,
      action: "updated",
    })).toBe(false)
  })

  it("with fieldFilters returns true when changedFields includes at least one filtered field", () => {
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "updated",
      fieldFilters: ["title", "amount"],
    }
    const payload: CrmEventPayload = {
      ...basePayload,
      action: "updated",
      changedFields: ["title", "status"],
    }
    expect(matchesTrigger(trigger, "deal.updated", payload)).toBe(true)
  })

  it("with fieldFilters returns false when changedFields is null", () => {
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "updated",
      fieldFilters: ["title"],
    }
    const payload: CrmEventPayload = {
      ...basePayload,
      action: "updated",
      changedFields: null,
    }
    expect(matchesTrigger(trigger, "deal.updated", payload)).toBe(false)
  })

  it("with fieldFilters returns false when changedFields has no overlap with filter", () => {
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "updated",
      fieldFilters: ["title", "amount"],
    }
    const payload: CrmEventPayload = {
      ...basePayload,
      action: "updated",
      changedFields: ["status", "assignedTo"],
    }
    expect(matchesTrigger(trigger, "deal.updated", payload)).toBe(false)
  })

  it("with fromStageId returns true when payload.oldStageId matches", () => {
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "stage_changed",
      fromStageId: "stage-a",
    }
    const payload: DealStageChangedPayload = {
      ...basePayload,
      entity: "deal",
      action: "updated",
      oldStageId: "stage-a",
      newStageId: "stage-b",
    }
    expect(matchesTrigger(trigger, "deal.stage_changed", payload)).toBe(true)
  })

  it("with fromStageId returns false when payload.oldStageId does not match", () => {
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "stage_changed",
      fromStageId: "stage-a",
    }
    const payload: DealStageChangedPayload = {
      ...basePayload,
      entity: "deal",
      action: "updated",
      oldStageId: "stage-x",
      newStageId: "stage-b",
    }
    expect(matchesTrigger(trigger, "deal.stage_changed", payload)).toBe(false)
  })

  it("with toStageId returns true when payload.newStageId matches", () => {
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "stage_changed",
      toStageId: "stage-b",
    }
    const payload: DealStageChangedPayload = {
      ...basePayload,
      entity: "deal",
      action: "updated",
      oldStageId: "stage-a",
      newStageId: "stage-b",
    }
    expect(matchesTrigger(trigger, "deal.stage_changed", payload)).toBe(true)
  })

  it("with both fromStageId and toStageId requires both to match", () => {
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "stage_changed",
      fromStageId: "stage-a",
      toStageId: "stage-b",
    }
    const payloadBothMatch: DealStageChangedPayload = {
      ...basePayload,
      entity: "deal",
      action: "updated",
      oldStageId: "stage-a",
      newStageId: "stage-b",
    }
    expect(matchesTrigger(trigger, "deal.stage_changed", payloadBothMatch)).toBe(true)

    const payloadOnlyFrom: DealStageChangedPayload = {
      ...basePayload,
      entity: "deal",
      action: "updated",
      oldStageId: "stage-a",
      newStageId: "stage-c",
    }
    expect(matchesTrigger(trigger, "deal.stage_changed", payloadOnlyFrom)).toBe(false)
  })
})

// --- matchAndFireTriggers ---

describe("matchAndFireTriggers", () => {
  function mockWorkflowQuery(workflows: Array<{ id: string; active: boolean; triggers: unknown[] }>) {
    const mockFrom = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(
        workflows.filter(w => w.active).map(w => ({
          id: w.id,
          active: w.active,
          triggers: w.triggers,
        }))
      ),
    })
    mockDb.select.mockReturnValue({ from: mockFrom })
  }

  const eventPayload: CrmEventPayload = {
    entity: "deal",
    entityId: "deal-1",
    action: "created",
    data: { title: "Test Deal" },
    changedFields: null,
    userId: "user-1",
    timestamp: "2026-03-28T00:00:00Z",
  }

  it("queries active workflows and creates runs for matches", async () => {
    mockWorkflowQuery([
      {
        id: "wf-1",
        active: true,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
    ])

    await matchAndFireTriggers("deal.created", eventPayload)

    expect(mockCreateWorkflowRun).toHaveBeenCalledOnce()
    expect(mockCreateWorkflowRun).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({
        trigger_type: "crm_event",
        data: expect.objectContaining({ entityId: "deal-1" }),
      })
    )
  })

  it("skips inactive workflows (query only returns active)", async () => {
    mockWorkflowQuery([
      {
        id: "wf-inactive",
        active: false,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
    ])

    await matchAndFireTriggers("deal.created", eventPayload)

    expect(mockCreateWorkflowRun).not.toHaveBeenCalled()
  })

  it("skips non-crm_event triggers in the array", async () => {
    mockWorkflowQuery([
      {
        id: "wf-2",
        active: true,
        triggers: [
          { type: "schedule", mode: "interval", intervalMinutes: 60 },
          { type: "manual" },
        ],
      },
    ])

    await matchAndFireTriggers("deal.created", eventPayload)

    expect(mockCreateWorkflowRun).not.toHaveBeenCalled()
  })

  it("creates separate runs when multiple workflows match the same event", async () => {
    mockWorkflowQuery([
      {
        id: "wf-a",
        active: true,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
      {
        id: "wf-b",
        active: true,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
    ])

    await matchAndFireTriggers("deal.created", eventPayload)

    expect(mockCreateWorkflowRun).toHaveBeenCalledTimes(2)
    expect(mockCreateWorkflowRun).toHaveBeenCalledWith("wf-a", expect.any(Object))
    expect(mockCreateWorkflowRun).toHaveBeenCalledWith("wf-b", expect.any(Object))
  })

  it("does not throw when createWorkflowRun fails for one workflow", async () => {
    mockCreateWorkflowRun.mockRejectedValueOnce(new Error("DB error"))
    mockCreateWorkflowRun.mockResolvedValueOnce({ id: "run-2" })

    mockWorkflowQuery([
      {
        id: "wf-fail",
        active: true,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
      {
        id: "wf-ok",
        active: true,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
    ])

    // Should not throw
    await expect(matchAndFireTriggers("deal.created", eventPayload)).resolves.not.toThrow()

    expect(mockCreateWorkflowRun).toHaveBeenCalledTimes(2)
  })
})
