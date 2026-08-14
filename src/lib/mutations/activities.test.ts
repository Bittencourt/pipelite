import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock db
vi.mock("@/db", () => ({
  db: {
    query: {
      activities: { findFirst: vi.fn() },
      activityTypes: { findFirst: vi.fn() },
      deals: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
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
  createActivityMutation,
  updateActivityMutation,
  deleteActivityMutation,
  toggleActivityCompletionMutation,
} from "./activities"

const mockDb = db as unknown as {
  query: {
    activities: { findFirst: ReturnType<typeof vi.fn> }
    activityTypes: { findFirst: ReturnType<typeof vi.fn> }
    deals: { findFirst: ReturnType<typeof vi.fn> }
  }
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

const mockEmit = crmBus.emit as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createActivityMutation", () => {
  it("creates activity, emits activity.created, returns success with id", async () => {
    const fakeActivity = {
      id: "act1",
      title: "Call client",
      typeId: "type1",
      dealId: null,
      ownerId: "u1",
      assigneeId: null,
      dueDate: new Date(),
      completedAt: null,
      notes: null,
      customFields: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }

    // Mock type exists
    mockDb.query.activityTypes.findFirst.mockResolvedValue({ id: "type1", name: "Call" })

    const returningFn = vi.fn().mockResolvedValue([fakeActivity])
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })
    mockDb.insert.mockReturnValue({ values: valuesFn })

    const result = await createActivityMutation({
      title: "Call client",
      typeId: "type1",
      dueDate: new Date(),
      userId: "u1",
    })

    expect(result).toEqual({ success: true, id: "act1", activity: fakeActivity })
    expect(mockEmit).toHaveBeenCalledWith("activity.created", expect.objectContaining({
      entity: "activity",
      entityId: "act1",
      action: "created",
      userId: "u1",
    }))
  })

  it("returns error for invalid input (missing title)", async () => {
    const result = await createActivityMutation({
      title: "",
      typeId: "type1",
      dueDate: new Date(),
      userId: "u1",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeTruthy()
    }
  })

  it("returns error when activity type not found", async () => {
    mockDb.query.activityTypes.findFirst.mockResolvedValue(null)

    const result = await createActivityMutation({
      title: "Call client",
      typeId: "missing-type",
      dueDate: new Date(),
      userId: "u1",
    })

    expect(result).toEqual({ success: false, error: "Activity type not found" })
  })
})

describe("updateActivityMutation", () => {
  const existingActivity = {
    id: "act1",
    title: "Call client",
    typeId: "type1",
    dealId: null,
    ownerId: "u1",
    assigneeId: null,
    dueDate: new Date(),
    completedAt: null,
    notes: null,
    customFields: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }

  it("emits activity.updated with changedFields", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(existingActivity)

    const updatedActivity = { ...existingActivity, title: "Email client" }
    const returningFn = vi.fn().mockResolvedValue([updatedActivity])
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    const result = await updateActivityMutation("act1", { title: "Email client" }, "u1")

    expect(result).toEqual({ success: true })
    expect(mockEmit).toHaveBeenCalledWith("activity.updated", expect.objectContaining({
      entity: "activity",
      entityId: "act1",
      action: "updated",
      changedFields: ["title"],
    }))
  })

  it("returns error when activity not found", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(null)

    const result = await updateActivityMutation("act-missing", { title: "X" }, "u1")

    expect(result).toEqual({ success: false, error: "Activity not found" })
  })
})

describe("customFields persistence (D-12)", () => {
  // Real stored keys contain spaces and punctuation; a merge implemented via
  // anything other than plain object spread would break on them.
  const sampleCustomFields: Record<string, unknown> = {
    Origem: ["Outbound Manual"],
    "CNPJ / CPF": "23466509000120",
  }

  const storedActivity = {
    id: "act1",
    title: "Call client",
    typeId: "type1",
    dealId: null,
    ownerId: "u1",
    assigneeId: null,
    dueDate: new Date(),
    completedAt: null,
    notes: null,
    customFields: { A: 1, B: 2 } as Record<string, unknown>,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }

  function stubInsert() {
    mockDb.query.activityTypes.findFirst.mockResolvedValue({ id: "type1", name: "Call" })
    const returningFn = vi.fn().mockResolvedValue([storedActivity])
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })
    mockDb.insert.mockReturnValue({ values: valuesFn })
    return valuesFn
  }

  function stubUpdate() {
    const returningFn = vi.fn().mockResolvedValue([storedActivity])
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })
    return setFn
  }

  const firstArg = (fn: ReturnType<typeof vi.fn>) =>
    fn.mock.calls[0][0] as Record<string, unknown>

  const updatedChangedFields = () => {
    const call = mockEmit.mock.calls.find((c) => c[0] === "activity.updated")
    return (call?.[1] as { changedFields: string[] | null } | undefined)?.changedFields
  }

  it("persists customFields on create", async () => {
    const valuesFn = stubInsert()

    const result = await createActivityMutation({
      title: "Call client",
      typeId: "type1",
      dueDate: new Date(),
      customFields: sampleCustomFields,
      userId: "u1",
    })

    expect(result.success).toBe(true)
    expect(firstArg(valuesFn).customFields).toEqual(sampleCustomFields)
  })

  it("defaults customFields to {} on create when omitted", async () => {
    const valuesFn = stubInsert()

    await createActivityMutation({
      title: "Call client",
      typeId: "type1",
      dueDate: new Date(),
      userId: "u1",
    })

    expect(firstArg(valuesFn).customFields).toEqual({})
  })

  it("shallow-merges customFields onto the stored blob on update", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(storedActivity)
    const setFn = stubUpdate()

    const result = await updateActivityMutation("act1", { customFields: { B: 99, C: 3 } }, "u1")

    expect(result).toEqual({ success: true })
    expect(firstArg(setFn).customFields).toEqual({ A: 1, B: 99, C: 3 })
  })

  it("pushes customFields into changedFields on update", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(storedActivity)
    stubUpdate()

    await updateActivityMutation("act1", { customFields: { B: 99 } }, "u1")

    expect(updatedChangedFields()).toContain("customFields")
  })

  it("leaves customFields untouched on an update that does not supply it", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(storedActivity)
    const setFn = stubUpdate()

    await updateActivityMutation("act1", { title: "Email client" }, "u1")

    expect(Object.keys(firstArg(setFn))).not.toContain("customFields")
    expect(updatedChangedFields() ?? []).not.toContain("customFields")
  })
})

describe("deleteActivityMutation", () => {
  it("soft-deletes activity and emits activity.deleted", async () => {
    const existingActivity = { id: "act1", ownerId: "u1", deletedAt: null }
    mockDb.query.activities.findFirst.mockResolvedValue(existingActivity)

    const whereFn = vi.fn().mockResolvedValue(undefined)
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    const result = await deleteActivityMutation("act1", "u1")

    expect(result).toEqual({ success: true })
    expect(mockEmit).toHaveBeenCalledWith("activity.deleted", expect.objectContaining({
      entity: "activity",
      entityId: "act1",
      action: "deleted",
      userId: "u1",
    }))
  })
})

describe("toggleActivityCompletionMutation", () => {
  it("toggles from incomplete to complete and emits activity.updated", async () => {
    const incompleteActivity = {
      id: "act1",
      title: "Call client",
      completedAt: null,
      ownerId: "u1",
      deletedAt: null,
    }
    mockDb.query.activities.findFirst.mockResolvedValue(incompleteActivity)

    const updatedActivity = { ...incompleteActivity, completedAt: new Date() }
    const returningFn = vi.fn().mockResolvedValue([updatedActivity])
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    const result = await toggleActivityCompletionMutation("act1", "u1")

    expect(result).toEqual({ success: true, completed: true })
    expect(mockEmit).toHaveBeenCalledWith("activity.updated", expect.objectContaining({
      entity: "activity",
      entityId: "act1",
      action: "updated",
      changedFields: ["completed"],
    }))
  })

  it("toggles from complete to incomplete", async () => {
    const completeActivity = {
      id: "act1",
      title: "Call client",
      completedAt: new Date(),
      ownerId: "u1",
      deletedAt: null,
    }
    mockDb.query.activities.findFirst.mockResolvedValue(completeActivity)

    const updatedActivity = { ...completeActivity, completedAt: null }
    const returningFn = vi.fn().mockResolvedValue([updatedActivity])
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    const result = await toggleActivityCompletionMutation("act1", "u1")

    expect(result).toEqual({ success: true, completed: false })
    expect(mockEmit).toHaveBeenCalledWith("activity.updated", expect.objectContaining({
      entity: "activity",
      entityId: "act1",
      action: "updated",
      changedFields: ["completed"],
    }))
  })

  it("returns error when activity not found", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(null)

    const result = await toggleActivityCompletionMutation("act-missing", "u1")

    expect(result).toEqual({ success: false, error: "Activity not found" })
  })
})
