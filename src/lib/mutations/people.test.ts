import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock db
vi.mock("@/db", () => ({
  db: {
    query: {
      organizations: { findFirst: vi.fn() },
      people: { findFirst: vi.fn() },
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
  createPersonMutation,
  updatePersonMutation,
  deletePersonMutation,
} from "./people"

const mockDb = db as unknown as {
  query: {
    organizations: { findFirst: ReturnType<typeof vi.fn> }
    people: { findFirst: ReturnType<typeof vi.fn> }
  }
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

const mockEmit = crmBus.emit as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createPersonMutation", () => {
  it("creates person, emits person.created, returns success with id", async () => {
    const fakePerson = {
      id: "p1",
      firstName: "John",
      lastName: "Doe",
      email: "john@test.com",
      phone: null,
      notes: null,
      organizationId: null,
      ownerId: "u1",
      customFields: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }
    const returningFn = vi.fn().mockResolvedValue([fakePerson])
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })
    mockDb.insert.mockReturnValue({ values: valuesFn })

    const result = await createPersonMutation({
      firstName: "John",
      lastName: "Doe",
      email: "john@test.com",
      userId: "u1",
    })

    expect(result).toEqual({ success: true, id: "p1", person: fakePerson })
    expect(mockEmit).toHaveBeenCalledWith("person.created", expect.objectContaining({
      entity: "person",
      entityId: "p1",
      action: "created",
      userId: "u1",
    }))
  })

  it("returns error for invalid input (missing first name)", async () => {
    const result = await createPersonMutation({
      firstName: "",
      lastName: "Doe",
      userId: "u1",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeTruthy()
    }
  })
})

describe("updatePersonMutation", () => {
  const existingPerson = {
    id: "p1",
    firstName: "John",
    lastName: "Doe",
    email: "john@test.com",
    phone: null,
    notes: null,
    organizationId: null,
    ownerId: "u1",
    customFields: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }

  it("emits person.updated with changedFields", async () => {
    mockDb.query.people.findFirst.mockResolvedValue(existingPerson)

    const updatedPerson = { ...existingPerson, firstName: "Jane" }
    const returningFn = vi.fn().mockResolvedValue([updatedPerson])
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    const result = await updatePersonMutation("p1", { firstName: "Jane" }, "u1")

    expect(result).toEqual({ success: true })
    expect(mockEmit).toHaveBeenCalledWith("person.updated", expect.objectContaining({
      entity: "person",
      entityId: "p1",
      action: "updated",
      changedFields: ["firstName"],
    }))
  })
})

describe("deletePersonMutation", () => {
  it("soft-deletes person and emits person.deleted", async () => {
    const existingPerson = { id: "p1", ownerId: "u1", deletedAt: null }
    mockDb.query.people.findFirst.mockResolvedValue(existingPerson)

    const whereFn = vi.fn().mockResolvedValue(undefined)
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    const result = await deletePersonMutation("p1", "u1")

    expect(result).toEqual({ success: true })
    expect(mockEmit).toHaveBeenCalledWith("person.deleted", expect.objectContaining({
      entity: "person",
      entityId: "p1",
      action: "deleted",
      userId: "u1",
    }))
  })
})
