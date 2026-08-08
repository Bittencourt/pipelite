import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock db
vi.mock("@/db", () => ({
  db: {
    query: {
      stages: { findFirst: vi.fn() },
      organizations: { findFirst: vi.fn() },
      people: { findFirst: vi.fn(), findMany: vi.fn() },
      deals: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
  },
}))

// Mock events
vi.mock("@/lib/events", () => ({
  crmBus: {
    emit: vi.fn(),
  },
}))

import { db } from "@/db"
import { crmBus } from "@/lib/events"
import {
  createDealMutation,
  updateDealMutation,
  deleteDealMutation,
  updateDealStageMutation,
  reorderDealsMutation,
} from "./deals"

const mockDb = db as unknown as {
  query: {
    stages: { findFirst: ReturnType<typeof vi.fn> }
    organizations: { findFirst: ReturnType<typeof vi.fn> }
    people: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
    deals: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
  }
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
}

const mockEmit = crmBus.emit as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createDealMutation", () => {
  it("creates deal, emits deal.created, returns success with id", async () => {
    const fakeStage = { id: "s1", pipeline: { deletedAt: null } }
    mockDb.query.stages.findFirst.mockResolvedValue(fakeStage)
    mockDb.query.organizations.findFirst.mockResolvedValue({ id: "o1", deletedAt: null })
    mockDb.query.deals.findMany.mockResolvedValue([])

    const fakeDeal = { id: "d1", title: "Test Deal", stageId: "s1", value: null, organizationId: "o1", personId: null, ownerId: "u1", position: "10000", createdAt: new Date(), updatedAt: new Date(), deletedAt: null, expectedCloseDate: null, notes: null, customFields: {} }
    const returningFn = vi.fn().mockResolvedValue([fakeDeal])
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })
    mockDb.insert.mockReturnValue({ values: valuesFn })

    const result = await createDealMutation({
      title: "Test Deal",
      stageId: "s1",
      organizationId: "o1",
      userId: "u1",
      assigneeIds: [],
    })

    expect(result).toEqual({ success: true, id: "d1", deal: fakeDeal })
    expect(mockEmit).toHaveBeenCalledWith("deal.created", expect.objectContaining({
      entity: "deal",
      entityId: "d1",
      action: "created",
      userId: "u1",
    }))
  })

  it("returns error for invalid input (missing title)", async () => {
    const result = await createDealMutation({
      title: "",
      stageId: "s1",
      organizationId: "o1",
      userId: "u1",
      assigneeIds: [],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeTruthy()
    }
  })
})

describe("updateDealMutation", () => {
  const existingDeal = {
    id: "d1",
    title: "Old Title",
    stageId: "s1",
    value: "100",
    organizationId: "o1",
    personId: null,
    ownerId: "u1",
    position: "10000",
    expectedCloseDate: null,
    notes: null,
    customFields: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }

  it("emits deal.updated with changedFields on non-stage change", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(existingDeal)

    const updatedDeal = { ...existingDeal, title: "New Title" }
    const returningFn = vi.fn().mockResolvedValue([updatedDeal])
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    // Mock assignee queries
    const selectWhereFn = vi.fn().mockResolvedValue([])
    const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
    mockDb.select.mockReturnValue({ from: selectFromFn })
    const deleteWhereFn = vi.fn().mockResolvedValue(undefined)
    mockDb.delete.mockReturnValue({ where: deleteWhereFn })

    const result = await updateDealMutation("d1", { title: "New Title" }, "u1")

    expect(result.success).toBe(true)
    expect(mockEmit).toHaveBeenCalledWith("deal.updated", expect.objectContaining({
      entity: "deal",
      entityId: "d1",
      action: "updated",
      changedFields: ["title"],
    }))
    // Should NOT emit stage_changed
    expect(mockEmit).not.toHaveBeenCalledWith("deal.stage_changed", expect.anything())
  })

  it("emits both deal.updated and deal.stage_changed on stage change", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(existingDeal)

    const updatedDeal = { ...existingDeal, stageId: "s2" }
    const returningFn = vi.fn().mockResolvedValue([updatedDeal])
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    const selectWhereFn = vi.fn().mockResolvedValue([])
    const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
    mockDb.select.mockReturnValue({ from: selectFromFn })
    const deleteWhereFn = vi.fn().mockResolvedValue(undefined)
    mockDb.delete.mockReturnValue({ where: deleteWhereFn })

    const result = await updateDealMutation("d1", { stageId: "s2" }, "u1")

    expect(result.success).toBe(true)
    expect(mockEmit).toHaveBeenCalledWith("deal.updated", expect.objectContaining({
      entity: "deal",
      action: "updated",
      changedFields: ["stageId"],
    }))
    expect(mockEmit).toHaveBeenCalledWith("deal.stage_changed", expect.objectContaining({
      entity: "deal",
      entityId: "d1",
      oldStageId: "s1",
      newStageId: "s2",
    }))
  })
})

describe("deleteDealMutation", () => {
  it("soft-deletes deal and emits deal.deleted", async () => {
    const existingDeal = { id: "d1", ownerId: "u1", deletedAt: null }
    mockDb.query.deals.findFirst.mockResolvedValue(existingDeal)

    const whereFn = vi.fn().mockResolvedValue(undefined)
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    const result = await deleteDealMutation("d1", "u1")

    expect(result).toEqual({ success: true })
    expect(mockEmit).toHaveBeenCalledWith("deal.deleted", expect.objectContaining({
      entity: "deal",
      entityId: "d1",
      action: "deleted",
      userId: "u1",
    }))
  })
})

describe("updateDealStageMutation", () => {
  it("updates stage, emits deal.updated + deal.stage_changed", async () => {
    const existingDeal = { id: "d1", stageId: "s1", ownerId: "u1", deletedAt: null }
    mockDb.query.deals.findFirst.mockResolvedValue(existingDeal)
    mockDb.query.stages.findFirst.mockResolvedValue({ id: "s2", pipeline: { deletedAt: null } })
    mockDb.query.deals.findMany.mockResolvedValue([])

    const whereFn = vi.fn().mockResolvedValue(undefined)
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    const result = await updateDealStageMutation("d1", "s2", "u1")

    expect(result).toEqual({ success: true })
    expect(mockEmit).toHaveBeenCalledWith("deal.updated", expect.objectContaining({
      entity: "deal",
      entityId: "d1",
      action: "updated",
      changedFields: ["stageId"],
    }))
    expect(mockEmit).toHaveBeenCalledWith("deal.stage_changed", expect.objectContaining({
      entity: "deal",
      oldStageId: "s1",
      newStageId: "s2",
    }))
  })
})

describe("reorderDealsMutation", () => {
  it("reorders deals without emitting events", async () => {
    const existingDeal = { id: "d1", stageId: "s1", ownerId: "u1", position: "10000", deletedAt: null }
    mockDb.query.deals.findFirst.mockResolvedValue(existingDeal)
    mockDb.query.stages.findFirst.mockResolvedValue({ id: "s1", pipeline: { deletedAt: null } })
    mockDb.query.deals.findMany.mockResolvedValue([
      { id: "d2", position: "10000", stageId: "s1" },
      { id: "d3", position: "20000", stageId: "s1" },
    ])

    const whereFn = vi.fn().mockResolvedValue(undefined)
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    const result = await reorderDealsMutation("d1", "s1", 1, "u1")

    expect(result).toEqual({ success: true })
    expect(mockEmit).not.toHaveBeenCalled()
  })
})
