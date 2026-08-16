import { describe, it, expect, vi, beforeEach } from "vitest"

// NOTE ON THE PURGE TESTS BELOW: a mocked `db.delete` cannot exercise a real foreign-key
// constraint. Every FK into the CRM tables is `ON DELETE NO ACTION`, and deleting an organization
// that still has people was empirically proven to raise SQLSTATE 23503 on
// `people_organization_id_organizations_id_fk`. These tests pin the ORDER and the SHAPE of the
// teardown; `scripts/trash-checks.sql` (plan 37-15) is the only honest test of the constraint
// behaviour.

// Mock db
vi.mock("@/db", () => ({
  db: {
    query: {
      organizations: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
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
  createOrganizationMutation,
  updateOrganizationMutation,
  deleteOrganizationMutation,
  restoreOrganizationMutation,
  purgeOrganizationMutation,
} from "./organizations"

const mockDb = db as unknown as {
  query: {
    organizations: { findFirst: ReturnType<typeof vi.fn> }
  }
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  transaction: ReturnType<typeof vi.fn>
}

const mockEmit = crmBus.emit as ReturnType<typeof vi.fn>
const mockGetCurrentActor = vi.mocked(getCurrentActor)

/** Renders a drizzle predicate so a test can tell `isNotNull` from `isNull`, and read its params. */
const pgDialect = new PgDialect()
const renderQuery = (predicate: unknown) =>
  pgDialect.sqlToQuery(predicate as Parameters<PgDialect["sqlToQuery"]>[0])
const renderSql = (predicate: unknown) => renderQuery(predicate).sql

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
  const preRecalcOrg = {
    id: "org1",
    name: "Acme Corp",
    website: "https://acme.com",
    industry: "Tech",
    notes: null,
    ownerId: "u1",
    defaultCurrency: "USD",
    customFields: {
      Origem: ["Outbound Manual"],
      Score: { formula: true, value: 0, error: null },
    } as Record<string, unknown>,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }

  function stubInsert(row: Record<string, unknown> = preRecalcOrg) {
    const returningFn = vi.fn().mockResolvedValue([row])
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })
    mockDb.insert.mockReturnValue({ values: valuesFn })
    return valuesFn
  }

  function stubUpdate(row: Record<string, unknown> = preRecalcOrg) {
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

  describe("createOrganizationMutation", () => {
    it("calls recalculateFormulas exactly once with the entity type, id and the .returning() row", async () => {
      stubInsert()

      await createOrganizationMutation({ name: "Acme Corp", userId: "u1" })

      expect(mockRecalc).toHaveBeenCalledTimes(1)
      expect(recalcInput().entityType).toBe("organization")
      expect(recalcInput().entityId).toBe("org1")
      // Identity, not deep equality: a re-read would be a redundant query.
      expect(recalcInput().row).toBe(preRecalcOrg)
    })

    it("passes every organization native attribute column plus the caller's custom field keys as changedFields", async () => {
      stubInsert()

      await createOrganizationMutation({
        name: "Acme Corp",
        customFields: callerCustomFields,
        userId: "u1",
      })

      const changed = recalcInput().changedFields
      for (const column of Object.values(ENTITY_NATIVE_ATTRIBUTES.organization)) {
        expect(changed).toContain(column)
      }
      expect(changed).toContain("Origem")
      // A create genuinely writes every field, but it is still not a wildcard.
      expect(changed).not.toContain("*")
    })

    it("recalculates BEFORE emitting organization.created (D-17)", async () => {
      stubInsert()

      await createOrganizationMutation({ name: "Acme Corp", userId: "u1" })

      expect(mockRecalc.mock.invocationCallOrder[0]).toBeLessThan(
        mockEmit.mock.invocationCallOrder[0]
      )
    })

    it("emits organization.created carrying the POST-recalc customFields, not the row's", async () => {
      stubInsert()

      await createOrganizationMutation({ name: "Acme Corp", userId: "u1" })

      expect(emittedData("organization.created")?.customFields).toEqual(
        RECALC_RESULT.customFields
      )
      expect(emittedData("organization.created")?.customFields).not.toEqual(
        preRecalcOrg.customFields
      )
    })

    it("strips caller-supplied formula keys before persisting (T-34-04)", async () => {
      stubInsert()

      await createOrganizationMutation({
        name: "Acme Corp",
        customFields: callerCustomFields,
        userId: "u1",
      })

      expect(mockStrip).toHaveBeenCalledWith(callerCustomFields, expect.anything())
    })

    it("reads field definitions once and shares that cache with recalculateFormulas", async () => {
      stubInsert()

      await createOrganizationMutation({
        name: "Acme Corp",
        customFields: callerCustomFields,
        userId: "u1",
      })

      expect(mockGetDefs).toHaveBeenCalledTimes(1)
      expect(recalcInput().definitionsCache?.has("organization")).toBe(true)
    })

    it("still succeeds and still emits when recalculation rejects (D-05)", async () => {
      stubInsert()
      mockRecalc.mockRejectedValueOnce(new Error("boom"))
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const result = await createOrganizationMutation({ name: "Acme Corp", userId: "u1" })

      expect(result).toEqual({ success: true, id: "org1", organization: preRecalcOrg })
      expect(mockEmit).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalled()
      expect(String(errorSpy.mock.calls[0][0])).toContain("[formula-recalc]")
      errorSpy.mockRestore()
    })
  })

  describe("updateOrganizationMutation", () => {
    it("calls recalculateFormulas exactly once with the id and the .returning() row", async () => {
      mockDb.query.organizations.findFirst.mockResolvedValue(preRecalcOrg)
      stubUpdate()

      await updateOrganizationMutation("org1", { name: "New Acme" }, "u1")

      expect(mockRecalc).toHaveBeenCalledTimes(1)
      expect(recalcInput().entityType).toBe("organization")
      expect(recalcInput().entityId).toBe("org1")
      expect(recalcInput().row).toBe(preRecalcOrg)
    })

    it("passes changedFields through unchanged — the cascade decides child fan-out from it", async () => {
      mockDb.query.organizations.findFirst.mockResolvedValue(preRecalcOrg)
      stubUpdate()

      await updateOrganizationMutation("org1", { name: "New Acme" }, "u1")

      // Not pre-filtered, not embellished: plan 34-04's cascade reads this verbatim, and the
      // organization is the cascade's parent for BOTH deals and people.
      expect(recalcInput().changedFields).toEqual(["name"])
    })

    it("leaves the cascade enabled — an organization save is the cascade's primary trigger (D-03)", async () => {
      mockDb.query.organizations.findFirst.mockResolvedValue(preRecalcOrg)
      stubUpdate()

      await updateOrganizationMutation("org1", { name: "New Acme" }, "u1")

      // `cascade` defaults to true; passing false here would silently drop the 114-deal
      // fan-out the D-13 budget was sized against.
      expect(recalcInput().cascade).not.toBe(false)
    })

    it("recalculates BEFORE emitting organization.updated (D-17)", async () => {
      mockDb.query.organizations.findFirst.mockResolvedValue(preRecalcOrg)
      stubUpdate()

      await updateOrganizationMutation("org1", { name: "New Acme" }, "u1")

      expect(mockRecalc.mock.invocationCallOrder[0]).toBeLessThan(
        mockEmit.mock.invocationCallOrder[0]
      )
    })

    it("emits organization.updated carrying the POST-recalc customFields, not the row's", async () => {
      mockDb.query.organizations.findFirst.mockResolvedValue(preRecalcOrg)
      stubUpdate()

      await updateOrganizationMutation("org1", { name: "New Acme" }, "u1")

      expect(emittedData("organization.updated")?.customFields).toEqual(
        RECALC_RESULT.customFields
      )
      expect(emittedData("organization.updated")?.customFields).not.toEqual(
        preRecalcOrg.customFields
      )
    })

    it("strips caller-supplied formula keys before the merge (T-34-04)", async () => {
      mockDb.query.organizations.findFirst.mockResolvedValue(preRecalcOrg)
      stubUpdate()

      await updateOrganizationMutation("org1", { customFields: callerCustomFields }, "u1")

      expect(mockStrip).toHaveBeenCalledWith(callerCustomFields, expect.anything())
    })

    it("still succeeds and still emits when recalculation rejects (D-05)", async () => {
      mockDb.query.organizations.findFirst.mockResolvedValue(preRecalcOrg)
      stubUpdate()
      mockRecalc.mockRejectedValueOnce(new Error("boom"))
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const result = await updateOrganizationMutation("org1", { name: "New Acme" }, "u1")

      expect(result).toEqual({ success: true })
      expect(mockEmit).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalled()
      expect(String(errorSpy.mock.calls[0][0])).toContain("[formula-recalc]")
      errorSpy.mockRestore()
    })
  })

  describe("deleteOrganizationMutation", () => {
    it("does NOT recalculate — a soft delete is not a save", async () => {
      mockDb.query.organizations.findFirst.mockResolvedValue({
        id: "org1",
        ownerId: "u1",
        deletedAt: null,
      })
      const whereFn = vi.fn().mockResolvedValue(undefined)
      const setFn = vi.fn().mockReturnValue({ where: whereFn })
      mockDb.update.mockReturnValue({ set: setFn })

      await deleteOrganizationMutation("org1", "u1")

      expect(mockRecalc).toHaveBeenCalledTimes(0)
    })
  })
})

describe("restoreOrganizationMutation", () => {
  const mockRecalc = vi.mocked(recalculateFormulas)

  const DELETED_AT = new Date("2026-08-01T10:00:00.000Z")

  const trashedOrg = {
    id: "org1",
    name: "Acme Corp",
    website: "https://acme.com",
    industry: "Tech",
    notes: null,
    ownerId: "u1",
    defaultCurrency: "USD",
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
    mockDb.query.organizations.findFirst.mockResolvedValue(trashedOrg)
    const { setFn } = stubUpdate()
    stubAuditInsert()

    const result = await restoreOrganizationMutation("org1")

    expect(result).toEqual({ success: true })
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    const setArg = setFn.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(setArg).sort()).toEqual(["deletedAt", "updatedAt"])
    expect(setArg.deletedAt).toBeNull()
    expect(setArg.updatedAt).toBeInstanceOf(Date)
  })

  it("looks the record up with isNotNull(deletedAt), not isNull", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(trashedOrg)
    stubUpdate()
    stubAuditInsert()

    await restoreOrganizationMutation("org1")

    const where = mockDb.query.organizations.findFirst.mock.calls[0][0].where
    expect(renderSql(where)).toContain("is not null")
    expect(renderSql(where)).not.toMatch(/is null/)
  })

  it("returns NOT_IN_TRASH and issues no update for a live or missing record", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(null)

    const result = await restoreOrganizationMutation("org-live")

    expect(result).toEqual({ success: false, error: "NOT_IN_TRASH" })
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("recalculates with the custom sentinel plus every organization native attribute (Pitfall 1)", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(trashedOrg)
    stubUpdate()
    stubAuditInsert()

    await restoreOrganizationMutation("org1")

    expect(mockRecalc).toHaveBeenCalledTimes(1)
    const input = mockRecalc.mock.calls[0][0]
    expect(input.entityType).toBe("organization")
    expect(input.entityId).toBe("org1")
    // `[]` or `['deletedAt']` would evaluate ZERO formulas silently: `deletedAt` is not a
    // referenceable attribute for any entity type. Compared against the real constant.
    expect(input.changedFields).toContain(CHANGED_FIELDS_CUSTOM_SENTINEL)
    for (const column of Object.values(ENTITY_NATIVE_ATTRIBUTES.organization)) {
      expect(input.changedFields).toContain(column)
    }
  })

  it("leaves the cascade enabled — this is the direction that repairs child dot-refs", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(trashedOrg)
    stubUpdate()
    stubAuditInsert()

    await restoreOrganizationMutation("org1")

    expect(mockRecalc.mock.calls[0][0].cascade).not.toBe(false)
  })

  it("recalculates AFTER the update, so children re-enter the cascade", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(trashedOrg)
    const { whereFn } = stubUpdate()
    stubAuditInsert()

    await restoreOrganizationMutation("org1")

    // `cascadeToChildren` filters `isNull(relation.deletedAt)` on the CHILD, but a parent that
    // is still trashed cannot be walked from at all — the recalculation must follow the write.
    expect(whereFn.mock.invocationCallOrder[0]).toBeLessThan(
      mockRecalc.mock.invocationCallOrder[0]
    )
  })

  it("emits nothing on the CRM bus — no restore event type exists", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(trashedOrg)
    stubUpdate()
    stubAuditInsert()

    await restoreOrganizationMutation("org1")

    expect(mockEmit).not.toHaveBeenCalled()
  })

  it("writes exactly one audit row recording deletedAt from the stored timestamp to null", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(trashedOrg)
    stubUpdate()
    const valuesFn = stubAuditInsert()

    await restoreOrganizationMutation("org1")

    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(auditRow(valuesFn)).toEqual({
      entityType: "organization",
      entityId: "org1",
      action: "updated",
      changes: { deletedAt: { from: DELETED_AT, to: null } },
      actorKind: "system",
      actorUserId: null,
      workflowRunId: null,
      importSessionId: null,
    })
  })

  it("records the established actor rather than defaulting to system", async () => {
    mockGetCurrentActor.mockReturnValue({ kind: "workflow_run", userId: null, workflowRunId: "r1" })
    mockDb.query.organizations.findFirst.mockResolvedValue(trashedOrg)
    stubUpdate()
    const valuesFn = stubAuditInsert()

    await restoreOrganizationMutation("org1")

    expect(auditRow(valuesFn).actorKind).toBe("workflow_run")
    expect(auditRow(valuesFn).workflowRunId).toBe("r1")
  })

  it("still restores when the audit insert fails", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(trashedOrg)
    stubUpdate()
    mockDb.insert.mockReturnValue({ values: vi.fn().mockRejectedValue(new Error("audit down")) })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await restoreOrganizationMutation("org1")

    expect(result).toEqual({ success: true })
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("returns a failure and logs when the update throws", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(trashedOrg)
    const whereFn = vi.fn().mockRejectedValue(new Error("boom"))
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await restoreOrganizationMutation("org1")

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).not.toBe("NOT_IN_TRASH")
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe("purgeOrganizationMutation", () => {
  const trashedOrg = {
    id: "org1",
    name: "Acme Corp",
    ownerId: "u1",
    deletedAt: new Date("2026-08-01T10:00:00.000Z"),
  }

  /**
   * One `tx` handle with a spy per statement shape. The organization is the widest teardown in
   * the phase: TWO child tables are detached, so `.returning()` yields the deals first and the
   * people second.
   */
  function stubTransaction(
    detachedDeals: { id: string }[] = [],
    detachedPeople: { id: string }[] = [],
  ) {
    const deleteWhere = vi.fn().mockResolvedValue(undefined)
    const txDelete = vi.fn().mockReturnValue({ where: deleteWhere })

    const updateReturning = vi
      .fn()
      .mockResolvedValueOnce(detachedDeals)
      .mockResolvedValueOnce(detachedPeople)
      .mockResolvedValue([])
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning })
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    const txUpdate = vi.fn().mockReturnValue({ set: updateSet })

    const insertValues = vi.fn().mockResolvedValue(undefined)
    const txInsert = vi.fn().mockReturnValue({ values: insertValues })

    const tx = { delete: txDelete, update: txUpdate, insert: txInsert }
    mockDb.transaction.mockImplementation(
      async (cb: (handle: typeof tx) => Promise<unknown>) => cb(tx)
    )

    return {
      txDelete, deleteWhere, txUpdate, updateSet, updateWhere, updateReturning,
      txInsert, insertValues,
    }
  }

  /** Every `values(...)` argument, flattened: a detach insert passes an array, the purge one object. */
  const insertedRows = (insertValues: ReturnType<typeof vi.fn>) =>
    insertValues.mock.calls.flatMap((call) => {
      const arg = call[0] as Record<string, unknown> | Record<string, unknown>[]
      return Array.isArray(arg) ? arg : [arg]
    })

  const purgeRowIndex = (insertValues: ReturnType<typeof vi.fn>) =>
    insertValues.mock.calls.findIndex((call) => {
      const arg = call[0] as { changes?: Record<string, unknown> }
      return !Array.isArray(arg) && arg.changes?.__purge !== undefined
    })

  beforeEach(() => {
    mockGetCurrentActor.mockReturnValue(undefined)
    mockDb.query.organizations.findFirst.mockResolvedValue(trashedOrg)
  })

  it("runs the whole teardown inside one transaction, never on the bare db handle", async () => {
    stubTransaction([{ id: "d1" }], [{ id: "p1" }])

    const result = await purgeOrganizationMutation("org1")

    expect(result).toEqual({ success: true, detached: 2 })
    expect(mockDb.transaction).toHaveBeenCalledTimes(1)
    expect(mockDb.delete).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("orders the teardown: notes, detach deals, detach people, audit rows, delete org, purge row", async () => {
    const tx = stubTransaction([{ id: "d1" }], [{ id: "p1" }])

    await purgeOrganizationMutation("org1")

    const notesDeleted = tx.deleteWhere.mock.invocationCallOrder[0]
    const dealsDetached = tx.updateReturning.mock.invocationCallOrder[0]
    const peopleDetached = tx.updateReturning.mock.invocationCallOrder[1]
    const firstAudit = tx.insertValues.mock.invocationCallOrder[0]
    const orgDeleted = tx.deleteWhere.mock.invocationCallOrder[1]
    const purgeAudited = tx.insertValues.mock.invocationCallOrder[purgeRowIndex(tx.insertValues)]

    expect(notesDeleted).toBeLessThan(dealsDetached)
    expect(dealsDetached).toBeLessThan(peopleDetached)
    expect(peopleDetached).toBeLessThan(firstAudit)
    expect(firstAudit).toBeLessThan(orgDeleted)
    expect(orgDeleted).toBeLessThan(purgeAudited)
  })

  it("clears the organization's polymorphic notes — nothing in the database enforces this", async () => {
    const tx = stubTransaction()

    await purgeOrganizationMutation("org1")

    const { params } = renderQuery(tx.deleteWhere.mock.calls[0][0])
    expect(params).toContain("organization")
    expect(params).toContain("org1")
  })

  it("DETACHES both child tables rather than deleting them, and sums the count", async () => {
    const tx = stubTransaction([{ id: "d1" }, { id: "d2" }], [{ id: "p1" }])

    const result = await purgeOrganizationMutation("org1")

    // The `detached` count is the TOTAL across deals AND people.
    expect(result).toEqual({ success: true, detached: 3 })
    expect(renderSql(tx.updateWhere.mock.calls[0][0])).toContain('"deals"."organization_id"')
    expect(renderSql(tx.updateWhere.mock.calls[1][0])).toContain('"people"."organization_id"')
    for (const call of tx.updateSet.mock.calls) {
      const setArg = call[0] as Record<string, unknown>
      expect(setArg.organizationId).toBeNull()
      expect(setArg.updatedAt).toBeInstanceOf(Date)
    }
    // Two deletes only: the notes and the organization itself. Deals and people are independent
    // trashable entities with their own owners and their own trash tabs.
    expect(tx.txDelete).toHaveBeenCalledTimes(2)
  })

  it("carries isNotNull(deletedAt) on the final delete, so a live record can never be purged", async () => {
    const tx = stubTransaction()

    await purgeOrganizationMutation("org1")

    expect(renderSql(tx.deleteWhere.mock.calls[1][0])).toContain("is not null")
  })

  it("audits every unlink, one row per detached deal and one per detached person", async () => {
    const tx = stubTransaction([{ id: "d1" }], [{ id: "p1" }, { id: "p2" }])

    await purgeOrganizationMutation("org1")

    const rows = insertedRows(tx.insertValues)
    expect(rows.filter((row) => row.entityType === "deal")).toEqual([
      {
        entityType: "deal",
        entityId: "d1",
        action: "updated",
        changes: { organizationId: { from: "org1", to: null } },
        actorKind: "system",
        actorUserId: null,
        workflowRunId: null,
        importSessionId: null,
      },
    ])
    const personRows = rows.filter((row) => row.entityType === "person")
    expect(personRows).toHaveLength(2)
    expect(personRows[1]).toMatchObject({
      entityId: "p2",
      action: "updated",
      changes: { organizationId: { from: "org1", to: null } },
    })
  })

  it("writes no rows of a kind that detached nothing, and no empty insert", async () => {
    const tx = stubTransaction([{ id: "d1" }], [])

    const result = await purgeOrganizationMutation("org1")

    expect(result).toEqual({ success: true, detached: 1 })
    // One detach insert (deals) plus the purge row. No empty people insert.
    expect(tx.insertValues).toHaveBeenCalledTimes(2)
    expect(insertedRows(tx.insertValues).some((row) => row.entityType === "person")).toBe(false)
  })

  it("records the purge itself with action deleted plus the __purge marker, inside the transaction", async () => {
    const tx = stubTransaction([{ id: "d1" }], [{ id: "p1" }])
    mockGetCurrentActor.mockReturnValue({ kind: "user", userId: "admin1" })

    await purgeOrganizationMutation("org1")

    const index = purgeRowIndex(tx.insertValues)
    expect(index).toBeGreaterThanOrEqual(0)
    expect(tx.insertValues.mock.calls[index][0]).toEqual({
      entityType: "organization",
      entityId: "org1",
      // NOT a fourth `AuditAction` literal — a marker in `changes` instead (Pitfall 6).
      action: "deleted",
      changes: { __purge: { from: null, to: true } },
      actorKind: "user",
      actorUserId: "admin1",
      workflowRunId: null,
      importSessionId: null,
    })
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns NOT_IN_TRASH and opens no transaction for a live or missing record", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue(null)
    stubTransaction()

    const result = await purgeOrganizationMutation("org-live")

    expect(result).toEqual({ success: false, error: "NOT_IN_TRASH" })
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it("returns a failure and logs when the teardown rejects", async () => {
    mockDb.transaction.mockRejectedValue(new Error("23503"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await purgeOrganizationMutation("org1")

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).not.toBe("NOT_IN_TRASH")
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
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
