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

// Restore and purge write their `audit_log` row directly (there is no restore/purge bus event
// for the subscriber to hang off), so the actor must be drivable from a test. The real module
// reads an AsyncLocalStorage store that no test establishes.
vi.mock("@/lib/audit/actor-context", () => ({
  getCurrentActor: vi.fn(() => undefined),
}))

// The mocked recalculation result every call resolves with, so a test can tell a POST-recalc
// payload from the pre-recalc row's blob. `vi.hoisted` because vi.mock factories are hoisted
// above every other statement in the file.
const { RECALC_RESULT } = vi.hoisted(() => ({
  RECALC_RESULT: {
    customFields: { Score: { formula: true, value: 42, error: null } } as Record<string, unknown>,
    evaluations: 1,
  },
}))

// Mock the field-definition read used by the T-34-04 strip. The real one hits the database.
vi.mock("@/lib/custom-fields", () => ({
  getActiveFieldDefinitions: vi.fn(async () => []),
}))

// Mock the recalculation helper. These mutations are tested for CALL ORDERING and ARGUMENTS;
// evaluation behaviour is covered exhaustively by formula-recalc.test.ts. `importOriginal` keeps
// ENTITY_NATIVE_ATTRIBUTES real, so a drift between the map and the create path's changedFields
// cannot pass silently.
vi.mock("@/lib/formula-recalc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/formula-recalc")>()
  return {
    ...actual,
    recalculateFormulas: vi.fn(async () => RECALC_RESULT),
    stripFormulaKeys: vi.fn((values: Record<string, unknown>) => values),
  }
})

import { PgDialect } from "drizzle-orm/pg-core"
import { db } from "@/db"
import { crmBus } from "@/lib/events"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import { getCurrentActor } from "@/lib/audit/actor-context"
import {
  recalculateFormulas,
  stripFormulaKeys,
  ENTITY_NATIVE_ATTRIBUTES,
  CHANGED_FIELDS_CUSTOM_SENTINEL,
} from "@/lib/formula-recalc"
import {
  createPersonMutation,
  updatePersonMutation,
  deletePersonMutation,
  restorePersonMutation,
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
const mockGetCurrentActor = vi.mocked(getCurrentActor)

/** Renders a drizzle predicate to SQL so a test can tell `isNotNull` from `isNull`. */
const pgDialect = new PgDialect()
const renderSql = (predicate: unknown) =>
  pgDialect.sqlToQuery(predicate as Parameters<PgDialect["sqlToQuery"]>[0]).sql

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

describe("formula recalculation (D-01/D-17)", () => {
  const mockRecalc = vi.mocked(recalculateFormulas)
  const mockStrip = vi.mocked(stripFormulaKeys)
  const mockGetDefs = vi.mocked(getActiveFieldDefinitions)

  // `Score` is a formula key the caller must never be able to set (T-34-04).
  const callerCustomFields: Record<string, unknown> = {
    Origem: ["Outbound Manual"],
    Score: 999,
  }

  // Deliberately NOT equal to RECALC_RESULT.customFields — the emit assertions would be
  // vacuous otherwise.
  const preRecalcPerson = {
    id: "p1",
    firstName: "John",
    lastName: "Doe",
    email: "john@test.com",
    phone: null,
    notes: null,
    organizationId: null,
    ownerId: "u1",
    customFields: {
      Origem: ["Outbound Manual"],
      Score: { formula: true, value: 0, error: null },
    } as Record<string, unknown>,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }

  function stubInsert(row: Record<string, unknown> = preRecalcPerson) {
    const returningFn = vi.fn().mockResolvedValue([row])
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })
    mockDb.insert.mockReturnValue({ values: valuesFn })
    return valuesFn
  }

  function stubUpdate(row: Record<string, unknown> = preRecalcPerson) {
    const returningFn = vi.fn().mockResolvedValue([row])
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })
    return setFn
  }

  const emittedData = (event: string) => {
    const call = mockEmit.mock.calls.find((c) => c[0] === event)
    return (call?.[1] as { data: Record<string, unknown> } | undefined)?.data
  }

  const recalcInput = () => mockRecalc.mock.calls[0][0]

  describe("createPersonMutation", () => {
    it("calls recalculateFormulas exactly once with the entity type, id and the .returning() row", async () => {
      stubInsert()

      await createPersonMutation({ firstName: "John", lastName: "Doe", userId: "u1" })

      expect(mockRecalc).toHaveBeenCalledTimes(1)
      expect(recalcInput().entityType).toBe("person")
      expect(recalcInput().entityId).toBe("p1")
      // Identity, not deep equality: a re-read would be a redundant query.
      expect(recalcInput().row).toBe(preRecalcPerson)
    })

    it("passes every person native attribute column plus the caller's custom field keys as changedFields", async () => {
      stubInsert()

      await createPersonMutation({
        firstName: "John",
        lastName: "Doe",
        customFields: callerCustomFields,
        userId: "u1",
      })

      const changed = recalcInput().changedFields
      for (const column of Object.values(ENTITY_NATIVE_ATTRIBUTES.person)) {
        expect(changed).toContain(column)
      }
      expect(changed).toContain("Origem")
      // A create genuinely writes every field, but it is still not a wildcard.
      expect(changed).not.toContain("*")
    })

    it("recalculates BEFORE emitting person.created (D-17)", async () => {
      stubInsert()

      await createPersonMutation({ firstName: "John", lastName: "Doe", userId: "u1" })

      expect(mockRecalc.mock.invocationCallOrder[0]).toBeLessThan(
        mockEmit.mock.invocationCallOrder[0]
      )
    })

    it("emits person.created carrying the POST-recalc customFields, not the row's", async () => {
      stubInsert()

      await createPersonMutation({ firstName: "John", lastName: "Doe", userId: "u1" })

      expect(emittedData("person.created")?.customFields).toEqual(RECALC_RESULT.customFields)
      expect(emittedData("person.created")?.customFields).not.toEqual(
        preRecalcPerson.customFields
      )
    })

    it("strips caller-supplied formula keys before persisting (T-34-04)", async () => {
      stubInsert()

      await createPersonMutation({
        firstName: "John",
        lastName: "Doe",
        customFields: callerCustomFields,
        userId: "u1",
      })

      expect(mockStrip).toHaveBeenCalledWith(callerCustomFields, expect.anything())
    })

    it("reads field definitions once and shares that cache with recalculateFormulas", async () => {
      stubInsert()

      await createPersonMutation({
        firstName: "John",
        lastName: "Doe",
        customFields: callerCustomFields,
        userId: "u1",
      })

      expect(mockGetDefs).toHaveBeenCalledTimes(1)
      expect(recalcInput().definitionsCache?.has("person")).toBe(true)
    })

    it("still succeeds and still emits when recalculation rejects (D-05)", async () => {
      stubInsert()
      mockRecalc.mockRejectedValueOnce(new Error("boom"))
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const result = await createPersonMutation({
        firstName: "John",
        lastName: "Doe",
        userId: "u1",
      })

      expect(result).toEqual({ success: true, id: "p1", person: preRecalcPerson })
      expect(mockEmit).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalled()
      expect(String(errorSpy.mock.calls[0][0])).toContain("[formula-recalc]")
      errorSpy.mockRestore()
    })
  })

  describe("updatePersonMutation", () => {
    it("calls recalculateFormulas exactly once with the id and the .returning() row", async () => {
      mockDb.query.people.findFirst.mockResolvedValue(preRecalcPerson)
      stubUpdate()

      await updatePersonMutation("p1", { firstName: "Jane" }, "u1")

      expect(mockRecalc).toHaveBeenCalledTimes(1)
      expect(recalcInput().entityType).toBe("person")
      expect(recalcInput().entityId).toBe("p1")
      expect(recalcInput().row).toBe(preRecalcPerson)
    })

    it("passes the mutation's own changedFields through unchanged", async () => {
      mockDb.query.people.findFirst.mockResolvedValue(preRecalcPerson)
      stubUpdate()

      await updatePersonMutation("p1", { firstName: "Jane" }, "u1")

      expect(recalcInput().changedFields).toEqual(["firstName"])
    })

    it("recalculates BEFORE emitting person.updated (D-17)", async () => {
      mockDb.query.people.findFirst.mockResolvedValue(preRecalcPerson)
      stubUpdate()

      await updatePersonMutation("p1", { firstName: "Jane" }, "u1")

      expect(mockRecalc.mock.invocationCallOrder[0]).toBeLessThan(
        mockEmit.mock.invocationCallOrder[0]
      )
    })

    it("emits person.updated carrying the POST-recalc customFields, not the row's", async () => {
      mockDb.query.people.findFirst.mockResolvedValue(preRecalcPerson)
      stubUpdate()

      await updatePersonMutation("p1", { firstName: "Jane" }, "u1")

      expect(emittedData("person.updated")?.customFields).toEqual(RECALC_RESULT.customFields)
      expect(emittedData("person.updated")?.customFields).not.toEqual(
        preRecalcPerson.customFields
      )
    })

    it("strips caller-supplied formula keys before the merge (T-34-04)", async () => {
      mockDb.query.people.findFirst.mockResolvedValue(preRecalcPerson)
      stubUpdate()

      await updatePersonMutation("p1", { customFields: callerCustomFields }, "u1")

      expect(mockStrip).toHaveBeenCalledWith(callerCustomFields, expect.anything())
    })

    it("still succeeds and still emits when recalculation rejects (D-05)", async () => {
      mockDb.query.people.findFirst.mockResolvedValue(preRecalcPerson)
      stubUpdate()
      mockRecalc.mockRejectedValueOnce(new Error("boom"))
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const result = await updatePersonMutation("p1", { firstName: "Jane" }, "u1")

      expect(result).toEqual({ success: true })
      expect(mockEmit).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalled()
      expect(String(errorSpy.mock.calls[0][0])).toContain("[formula-recalc]")
      errorSpy.mockRestore()
    })
  })

  describe("deletePersonMutation", () => {
    it("does NOT recalculate — a soft delete is not a save", async () => {
      mockDb.query.people.findFirst.mockResolvedValue({
        id: "p1",
        ownerId: "u1",
        deletedAt: null,
      })
      const whereFn = vi.fn().mockResolvedValue(undefined)
      const setFn = vi.fn().mockReturnValue({ where: whereFn })
      mockDb.update.mockReturnValue({ set: setFn })

      await deletePersonMutation("p1", "u1")

      expect(mockRecalc).toHaveBeenCalledTimes(0)
    })
  })
})

describe("restorePersonMutation", () => {
  const mockRecalc = vi.mocked(recalculateFormulas)

  const DELETED_AT = new Date("2026-08-01T10:00:00.000Z")

  const trashedPerson = {
    id: "p1",
    firstName: "John",
    lastName: "Doe",
    email: "john@test.com",
    phone: null,
    notes: null,
    organizationId: null,
    ownerId: "u1",
    customFields: {} as Record<string, unknown>,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: DELETED_AT,
  }

  /** The restore `UPDATE`; `where` is the awaited terminal, so it carries the call order. */
  function stubUpdate() {
    const whereFn = vi.fn().mockResolvedValue(undefined)
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })
    return { setFn, whereFn }
  }

  /** Restore writes its audit row directly — there is no bus event to hang a subscriber off. */
  function stubAuditInsert() {
    const valuesFn = vi.fn().mockResolvedValue(undefined)
    mockDb.insert.mockReturnValue({ values: valuesFn })
    return valuesFn
  }

  const auditRow = (valuesFn: ReturnType<typeof vi.fn>) =>
    valuesFn.mock.calls[0][0] as Record<string, unknown>

  beforeEach(() => {
    mockGetCurrentActor.mockReturnValue(undefined)
  })

  it("clears deletedAt and touches nothing else", async () => {
    mockDb.query.people.findFirst.mockResolvedValue(trashedPerson)
    const { setFn } = stubUpdate()
    stubAuditInsert()

    const result = await restorePersonMutation("p1")

    expect(result).toEqual({ success: true })
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    const setArg = setFn.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(setArg).sort()).toEqual(["deletedAt", "updatedAt"])
    expect(setArg.deletedAt).toBeNull()
    expect(setArg.updatedAt).toBeInstanceOf(Date)
  })

  it("looks the record up with isNotNull(deletedAt), not isNull", async () => {
    mockDb.query.people.findFirst.mockResolvedValue(trashedPerson)
    stubUpdate()
    stubAuditInsert()

    await restorePersonMutation("p1")

    const where = mockDb.query.people.findFirst.mock.calls[0][0].where
    expect(renderSql(where)).toContain("is not null")
    expect(renderSql(where)).not.toMatch(/is null/)
  })

  it("returns NOT_IN_TRASH and issues no update for a live or missing record", async () => {
    mockDb.query.people.findFirst.mockResolvedValue(null)

    const result = await restorePersonMutation("p-live")

    expect(result).toEqual({ success: false, error: "NOT_IN_TRASH" })
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("recalculates with the custom sentinel plus every person native attribute (Pitfall 1)", async () => {
    mockDb.query.people.findFirst.mockResolvedValue(trashedPerson)
    stubUpdate()
    stubAuditInsert()

    await restorePersonMutation("p1")

    expect(mockRecalc).toHaveBeenCalledTimes(1)
    const input = mockRecalc.mock.calls[0][0]
    expect(input.entityType).toBe("person")
    expect(input.entityId).toBe("p1")
    // `[]` or `['deletedAt']` would evaluate ZERO formulas silently: `deletedAt` is not a
    // referenceable attribute for any entity type. Compared against the real constant.
    expect(input.changedFields).toContain(CHANGED_FIELDS_CUSTOM_SENTINEL)
    for (const column of Object.values(ENTITY_NATIVE_ATTRIBUTES.person)) {
      expect(input.changedFields).toContain(column)
    }
  })

  it("recalculates AFTER the update, so children re-enter the cascade", async () => {
    mockDb.query.people.findFirst.mockResolvedValue(trashedPerson)
    const { whereFn } = stubUpdate()
    stubAuditInsert()

    await restorePersonMutation("p1")

    expect(whereFn.mock.invocationCallOrder[0]).toBeLessThan(
      mockRecalc.mock.invocationCallOrder[0]
    )
  })

  it("emits nothing on the CRM bus — no restore event type exists", async () => {
    mockDb.query.people.findFirst.mockResolvedValue(trashedPerson)
    stubUpdate()
    stubAuditInsert()

    await restorePersonMutation("p1")

    expect(mockEmit).not.toHaveBeenCalled()
  })

  it("writes exactly one audit row recording deletedAt from the stored timestamp to null", async () => {
    mockDb.query.people.findFirst.mockResolvedValue(trashedPerson)
    stubUpdate()
    const valuesFn = stubAuditInsert()

    await restorePersonMutation("p1")

    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(auditRow(valuesFn)).toEqual({
      entityType: "person",
      entityId: "p1",
      action: "updated",
      changes: { deletedAt: { from: DELETED_AT, to: null } },
      actorKind: "system",
      actorUserId: null,
      workflowRunId: null,
      importSessionId: null,
    })
  })

  it("records the established actor rather than defaulting to system", async () => {
    mockGetCurrentActor.mockReturnValue({ kind: "user", userId: "u9" })
    mockDb.query.people.findFirst.mockResolvedValue(trashedPerson)
    stubUpdate()
    const valuesFn = stubAuditInsert()

    await restorePersonMutation("p1")

    expect(auditRow(valuesFn).actorKind).toBe("user")
    expect(auditRow(valuesFn).actorUserId).toBe("u9")
  })

  it("still restores when the audit insert fails", async () => {
    mockDb.query.people.findFirst.mockResolvedValue(trashedPerson)
    stubUpdate()
    mockDb.insert.mockReturnValue({ values: vi.fn().mockRejectedValue(new Error("audit down")) })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await restorePersonMutation("p1")

    expect(result).toEqual({ success: true })
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("returns a failure and logs when the update throws", async () => {
    mockDb.query.people.findFirst.mockResolvedValue(trashedPerson)
    const whereFn = vi.fn().mockRejectedValue(new Error("boom"))
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await restorePersonMutation("p1")

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).not.toBe("NOT_IN_TRASH")
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
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
