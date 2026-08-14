import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock db
vi.mock("@/db", () => ({
  db: {
    query: {
      organizations: { findFirst: vi.fn() },
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
  createOrganizationMutation,
  updateOrganizationMutation,
  deleteOrganizationMutation,
} from "./organizations"

const mockDb = db as unknown as {
  query: {
    organizations: { findFirst: ReturnType<typeof vi.fn> }
  }
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

const mockEmit = crmBus.emit as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createOrganizationMutation", () => {
  it("creates organization, emits organization.created, returns success with id", async () => {
    const fakeOrg = {
      id: "org1",
      name: "Acme Corp",
      website: "https://acme.com",
      industry: "Tech",
      notes: null,
      ownerId: "u1",
      defaultCurrency: "USD",
      customFields: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }
    const returningFn = vi.fn().mockResolvedValue([fakeOrg])
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })
    mockDb.insert.mockReturnValue({ values: valuesFn })

    const result = await createOrganizationMutation({
      name: "Acme Corp",
      website: "https://acme.com",
      industry: "Tech",
      userId: "u1",
    })

    expect(result).toEqual({ success: true, id: "org1", organization: fakeOrg })
    expect(mockEmit).toHaveBeenCalledWith("organization.created", expect.objectContaining({
      entity: "organization",
      entityId: "org1",
      action: "created",
      userId: "u1",
    }))
  })

  it("returns error for invalid input (missing name)", async () => {
    const result = await createOrganizationMutation({
      name: "",
      userId: "u1",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeTruthy()
    }
  })
})

describe("updateOrganizationMutation", () => {
  const existingOrg = {
    id: "org1",
    name: "Acme Corp",
    website: "https://acme.com",
    industry: "Tech",
    notes: null,
    ownerId: "u1",
    defaultCurrency: "USD",
    customFields: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }

  it("emits organization.updated with changedFields", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(existingOrg)

    const updatedOrg = { ...existingOrg, name: "New Acme" }
    const returningFn = vi.fn().mockResolvedValue([updatedOrg])
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    const result = await updateOrganizationMutation("org1", { name: "New Acme" }, "u1")

    expect(result).toEqual({ success: true })
    expect(mockEmit).toHaveBeenCalledWith("organization.updated", expect.objectContaining({
      entity: "organization",
      entityId: "org1",
      action: "updated",
      changedFields: ["name"],
    }))
  })

  it("returns error when organization not found", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(null)

    const result = await updateOrganizationMutation("org-missing", { name: "X" }, "u1")

    expect(result).toEqual({ success: false, error: "Organization not found" })
  })
})

describe("customFields persistence (D-12)", () => {
  // Real stored keys contain spaces and punctuation; a merge implemented via
  // anything other than plain object spread would break on them.
  const sampleCustomFields: Record<string, unknown> = {
    Origem: ["Outbound Manual"],
    "CNPJ / CPF": "23466509000120",
  }

  const storedOrg = {
    id: "org1",
    name: "Acme Corp",
    website: "https://acme.com",
    industry: "Tech",
    notes: null,
    ownerId: "u1",
    defaultCurrency: "USD",
    customFields: { A: 1, B: 2 } as Record<string, unknown>,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }

  function stubInsert() {
    const returningFn = vi.fn().mockResolvedValue([storedOrg])
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })
    mockDb.insert.mockReturnValue({ values: valuesFn })
    return valuesFn
  }

  function stubUpdate() {
    const returningFn = vi.fn().mockResolvedValue([storedOrg])
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })
    return setFn
  }

  const firstArg = (fn: ReturnType<typeof vi.fn>) =>
    fn.mock.calls[0][0] as Record<string, unknown>

  const updatedChangedFields = () => {
    const call = mockEmit.mock.calls.find((c) => c[0] === "organization.updated")
    return (call?.[1] as { changedFields: string[] | null } | undefined)?.changedFields
  }

  it("persists customFields on create", async () => {
    const valuesFn = stubInsert()

    const result = await createOrganizationMutation({
      name: "Acme Corp",
      customFields: sampleCustomFields,
      userId: "u1",
    })

    expect(result.success).toBe(true)
    expect(firstArg(valuesFn).customFields).toEqual(sampleCustomFields)
  })

  it("defaults customFields to {} on create when omitted", async () => {
    const valuesFn = stubInsert()

    await createOrganizationMutation({ name: "Acme Corp", userId: "u1" })

    expect(firstArg(valuesFn).customFields).toEqual({})
  })

  it("shallow-merges customFields onto the stored blob on update", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(storedOrg)
    const setFn = stubUpdate()

    const result = await updateOrganizationMutation(
      "org1",
      { customFields: { B: 99, C: 3 } },
      "u1",
    )

    expect(result).toEqual({ success: true })
    expect(firstArg(setFn).customFields).toEqual({ A: 1, B: 99, C: 3 })
  })

  it("pushes customFields into changedFields on update", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(storedOrg)
    stubUpdate()

    await updateOrganizationMutation("org1", { customFields: { B: 99 } }, "u1")

    expect(updatedChangedFields()).toContain("customFields")
  })

  it("leaves customFields untouched on an update that does not supply it", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(storedOrg)
    const setFn = stubUpdate()

    await updateOrganizationMutation("org1", { name: "New Acme" }, "u1")

    expect(Object.keys(firstArg(setFn))).not.toContain("customFields")
    expect(updatedChangedFields() ?? []).not.toContain("customFields")
  })
})

describe("deleteOrganizationMutation", () => {
  it("soft-deletes organization and emits organization.deleted", async () => {
    const existingOrg = { id: "org1", ownerId: "u1", deletedAt: null }
    mockDb.query.organizations.findFirst.mockResolvedValue(existingOrg)

    const whereFn = vi.fn().mockResolvedValue(undefined)
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    const result = await deleteOrganizationMutation("org1", "u1")

    expect(result).toEqual({ success: true })
    expect(mockEmit).toHaveBeenCalledWith("organization.deleted", expect.objectContaining({
      entity: "organization",
      entityId: "org1",
      action: "deleted",
      userId: "u1",
    }))
  })
})
