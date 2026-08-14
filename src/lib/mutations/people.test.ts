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

describe("customFields persistence (D-12)", () => {
  // Real stored keys contain spaces and punctuation; a merge implemented via
  // anything other than plain object spread would break on them.
  const sampleCustomFields: Record<string, unknown> = {
    Origem: ["Outbound Manual"],
    "CNPJ / CPF": "23466509000120",
  }

  const storedPerson = {
    id: "p1",
    firstName: "John",
    lastName: "Doe",
    email: "john@test.com",
    phone: null,
    notes: null,
    organizationId: null,
    ownerId: "u1",
    customFields: { A: 1, B: 2 } as Record<string, unknown>,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }

  function stubInsert() {
    const returningFn = vi.fn().mockResolvedValue([storedPerson])
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })
    mockDb.insert.mockReturnValue({ values: valuesFn })
    return valuesFn
  }

  function stubUpdate() {
    const returningFn = vi.fn().mockResolvedValue([storedPerson])
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })
    return setFn
  }

  const firstArg = (fn: ReturnType<typeof vi.fn>) =>
    fn.mock.calls[0][0] as Record<string, unknown>

  const updatedChangedFields = () => {
    const call = mockEmit.mock.calls.find((c) => c[0] === "person.updated")
    return (call?.[1] as { changedFields: string[] | null } | undefined)?.changedFields
  }

  it("persists customFields on create", async () => {
    const valuesFn = stubInsert()

    const result = await createPersonMutation({
      firstName: "John",
      lastName: "Doe",
      customFields: sampleCustomFields,
      userId: "u1",
    })

    expect(result.success).toBe(true)
    expect(firstArg(valuesFn).customFields).toEqual(sampleCustomFields)
  })

  it("defaults customFields to {} on create when omitted", async () => {
    const valuesFn = stubInsert()

    await createPersonMutation({ firstName: "John", lastName: "Doe", userId: "u1" })

    expect(firstArg(valuesFn).customFields).toEqual({})
  })

  it("shallow-merges customFields onto the stored blob on update", async () => {
    mockDb.query.people.findFirst.mockResolvedValue(storedPerson)
    const setFn = stubUpdate()

    const result = await updatePersonMutation("p1", { customFields: { B: 99, C: 3 } }, "u1")

    expect(result).toEqual({ success: true })
    expect(firstArg(setFn).customFields).toEqual({ A: 1, B: 99, C: 3 })
  })

  it("pushes customFields into changedFields on update", async () => {
    mockDb.query.people.findFirst.mockResolvedValue(storedPerson)
    stubUpdate()

    await updatePersonMutation("p1", { customFields: { B: 99 } }, "u1")

    expect(updatedChangedFields()).toContain("customFields")
  })

  it("leaves customFields untouched on an update that does not supply it", async () => {
    mockDb.query.people.findFirst.mockResolvedValue(storedPerson)
    const setFn = stubUpdate()

    await updatePersonMutation("p1", { firstName: "Jane" }, "u1")

    expect(Object.keys(firstArg(setFn))).not.toContain("customFields")
    expect(updatedChangedFields() ?? []).not.toContain("customFields")
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
