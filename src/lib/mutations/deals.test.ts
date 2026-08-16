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

// Mock the recalculation helper. This suite tests CALL ORDERING and ARGUMENTS — evaluation
// behaviour is covered exhaustively by formula-recalc.test.ts. importOriginal keeps the real
// vocabulary constants (ENTITY_NATIVE_ATTRIBUTES) so the create-path scope assertion compares
// against the single source of truth rather than a hard-coded copy.
vi.mock("@/lib/formula-recalc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/formula-recalc")>()
  return {
    ...actual,
    recalculateFormulas: vi.fn(),
    stripFormulaKeys: vi.fn((values: Record<string, unknown>) => values),
  }
})

// Field definitions are read only to feed stripFormulaKeys (T-34-04); no DB access in tests.
vi.mock("@/lib/custom-fields", () => ({
  getActiveFieldDefinitions: vi.fn(async () => []),
}))

// Restore and purge write their audit row directly rather than through the bus subscriber, so
// the actor has to be drivable from a test. The real module is an AsyncLocalStorage singleton;
// mocking the reader is how the "no actor established" branch becomes reachable.
vi.mock("@/lib/audit/actor-context", () => ({
  getCurrentActor: vi.fn(() => undefined),
}))

import { db } from "@/db"
import { crmBus } from "@/lib/events"
import { getCurrentActor } from "@/lib/audit/actor-context"
import { auditLog } from "@/db/schema"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"
import {
  recalculateFormulas,
  stripFormulaKeys,
  ENTITY_NATIVE_ATTRIBUTES,
  CHANGED_FIELDS_CUSTOM_SENTINEL,
  type RecalculateFormulasInput,
} from "@/lib/formula-recalc"
import {
  createDealMutation,
  updateDealMutation,
  deleteDealMutation,
  updateDealStageMutation,
  reorderDealsMutation,
  restoreDealMutation,
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
const mockRecalc = recalculateFormulas as unknown as ReturnType<typeof vi.fn>
const mockStrip = stripFormulaKeys as unknown as ReturnType<typeof vi.fn>
const mockGetCurrentActor = getCurrentActor as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockRecalc.mockResolvedValue({ customFields: {}, evaluations: 0 })
  mockStrip.mockImplementation((values: Record<string, unknown>) => values)
  mockGetCurrentActor.mockReturnValue(undefined)
})

/**
 * Render a Drizzle `where` back to SQL text.
 *
 * The restore/purge existence check INVERTS the delete's predicate, and `isNull` vs `isNotNull`
 * is a one-character difference with opposite meaning — an assertion on the rendered predicate is
 * the only way to catch it, because both compile and both return a row-or-undefined.
 */
const renderPredicate = (where: unknown): string =>
  new PgDialect().sqlToQuery(where as SQL).sql

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

describe("customFields persistence (D-12)", () => {
  // Real stored keys contain spaces and punctuation; a merge implemented via
  // anything other than plain object spread would break on them.
  const sampleCustomFields: Record<string, unknown> = {
    Origem: ["Outbound Manual"],
    "CNPJ / CPF": "23466509000120",
  }

  const storedDeal = {
    id: "d1",
    title: "Test Deal",
    stageId: "s1",
    value: null,
    organizationId: "o1",
    personId: null,
    ownerId: "u1",
    position: "10000",
    expectedCloseDate: null,
    notes: null,
    customFields: { A: 1, B: 2 } as Record<string, unknown>,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }

  function stubInsert() {
    mockDb.query.stages.findFirst.mockResolvedValue({ id: "s1", pipeline: { deletedAt: null } })
    mockDb.query.organizations.findFirst.mockResolvedValue({ id: "o1", deletedAt: null })
    mockDb.query.deals.findMany.mockResolvedValue([])
    const returningFn = vi.fn().mockResolvedValue([storedDeal])
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })
    mockDb.insert.mockReturnValue({ values: valuesFn })
    return valuesFn
  }

  function stubUpdate() {
    const returningFn = vi.fn().mockResolvedValue([storedDeal])
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    // Assignee bookkeeping the update path always performs.
    const selectWhereFn = vi.fn().mockResolvedValue([])
    const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
    mockDb.select.mockReturnValue({ from: selectFromFn })
    const deleteWhereFn = vi.fn().mockResolvedValue(undefined)
    mockDb.delete.mockReturnValue({ where: deleteWhereFn })

    return setFn
  }

  const firstArg = (fn: ReturnType<typeof vi.fn>) =>
    fn.mock.calls[0][0] as Record<string, unknown>

  const updatedChangedFields = () => {
    const call = mockEmit.mock.calls.find((c) => c[0] === "deal.updated")
    return (call?.[1] as { changedFields: string[] | null } | undefined)?.changedFields
  }

  it("persists customFields on create", async () => {
    const valuesFn = stubInsert()

    const result = await createDealMutation({
      title: "Test Deal",
      stageId: "s1",
      organizationId: "o1",
      customFields: sampleCustomFields,
      userId: "u1",
      assigneeIds: [],
    })

    expect(result.success).toBe(true)
    expect(firstArg(valuesFn).customFields).toEqual(sampleCustomFields)
  })

  it("defaults customFields to {} on create when omitted", async () => {
    const valuesFn = stubInsert()

    await createDealMutation({
      title: "Test Deal",
      stageId: "s1",
      organizationId: "o1",
      userId: "u1",
      assigneeIds: [],
    })

    expect(firstArg(valuesFn).customFields).toEqual({})
  })

  it("shallow-merges customFields onto the stored blob on update", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(storedDeal)
    const setFn = stubUpdate()

    const result = await updateDealMutation("d1", { customFields: { B: 99, C: 3 } }, "u1")

    expect(result.success).toBe(true)
    expect(firstArg(setFn).customFields).toEqual({ A: 1, B: 99, C: 3 })
  })

  it("pushes customFields into changedFields on update", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(storedDeal)
    stubUpdate()

    await updateDealMutation("d1", { customFields: { B: 99 } }, "u1")

    expect(updatedChangedFields()).toContain("customFields")
  })

  it("leaves customFields untouched on an update that does not supply it", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(storedDeal)
    const setFn = stubUpdate()

    await updateDealMutation("d1", { title: "New Title" }, "u1")

    expect(Object.keys(firstArg(setFn))).not.toContain("customFields")
    expect(updatedChangedFields() ?? []).not.toContain("customFields")
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

describe("formula recalculation (D-01/D-17)", () => {
  // What the mocked helper resolves with. Deliberately different from every fixture's stored
  // blob, so an assertion on the EMITTED payload can only pass if the post-recalc value was
  // folded in — a database-row assertion could not tell the two orderings apart (Pitfall 3).
  const RECALCED: Record<string, unknown> = {
    Margin: { formula: true, value: 1035, error: null },
  }
  const RECALC_RESULT = { customFields: RECALCED, evaluations: 1 }

  // The single source of truth for what a create "changes" — a create writes every attribute.
  const DEAL_NATIVE_COLUMNS = Object.values(ENTITY_NATIVE_ATTRIBUTES.deal)

  const STORED_CUSTOM_FIELDS: Record<string, unknown> = { Origem: ["Inbound"] }

  const baseDeal = {
    id: "d1",
    title: "Test Deal",
    stageId: "s1",
    value: "100",
    organizationId: "o1",
    personId: null,
    ownerId: "u1",
    position: "10000",
    expectedCloseDate: null,
    notes: null,
    customFields: STORED_CUSTOM_FIELDS,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }

  beforeEach(() => {
    mockRecalc.mockResolvedValue(RECALC_RESULT)
  })

  function stubCreate(row: Record<string, unknown>) {
    mockDb.query.stages.findFirst.mockResolvedValue({ id: "s1", pipeline: { deletedAt: null } })
    mockDb.query.organizations.findFirst.mockResolvedValue({ id: "o1", deletedAt: null })
    mockDb.query.deals.findMany.mockResolvedValue([])
    const returningFn = vi.fn().mockResolvedValue([row])
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn })
    mockDb.insert.mockReturnValue({ values: valuesFn })
    return valuesFn
  }

  function stubUpdateWithReturning(row: Record<string, unknown>) {
    const returningFn = vi.fn().mockResolvedValue([row])
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })

    // Assignee bookkeeping the update path always performs.
    const selectWhereFn = vi.fn().mockResolvedValue([])
    const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn })
    mockDb.select.mockReturnValue({ from: selectFromFn })
    const deleteWhereFn = vi.fn().mockResolvedValue(undefined)
    mockDb.delete.mockReturnValue({ where: deleteWhereFn })

    return setFn
  }

  function stubBareUpdate() {
    const whereFn = vi.fn().mockResolvedValue(undefined)
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })
    return setFn
  }

  const recalcArgs = (index = 0) =>
    mockRecalc.mock.calls[index][0] as RecalculateFormulasInput

  const emittedData = (event: string, index = 0): Record<string, unknown> => {
    const calls = mockEmit.mock.calls.filter((c) => c[0] === event)
    return ((calls[index]?.[1] as { data?: Record<string, unknown> } | undefined)?.data ?? {})
  }

  // ---- createDealMutation ----

  describe("createDealMutation", () => {
    it("recalculates exactly once, from the .returning() row (no redundant re-read)", async () => {
      stubCreate(baseDeal)

      await createDealMutation({
        title: "Test Deal",
        stageId: "s1",
        organizationId: "o1",
        userId: "u1",
        assigneeIds: [],
      })

      expect(mockRecalc).toHaveBeenCalledTimes(1)
      const args = recalcArgs()
      expect(args.entityType).toBe("deal")
      expect(args.entityId).toBe("d1")
      expect(args.row).toBe(baseDeal)
    })

    it("recalculates BEFORE crmBus.emit (D-17)", async () => {
      stubCreate(baseDeal)

      await createDealMutation({
        title: "Test Deal",
        stageId: "s1",
        organizationId: "o1",
        userId: "u1",
        assigneeIds: [],
      })

      expect(vi.mocked(recalculateFormulas).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(crmBus.emit).mock.invocationCallOrder[0]
      )
    })

    it("emits deal.created carrying the POST-recalc customFields (SC-2/SC-3)", async () => {
      stubCreate(baseDeal)

      await createDealMutation({
        title: "Test Deal",
        stageId: "s1",
        organizationId: "o1",
        userId: "u1",
        assigneeIds: [],
      })

      expect(emittedData("deal.created").customFields).toEqual(RECALCED)
      expect(emittedData("deal.created").customFields).not.toEqual(STORED_CUSTOM_FIELDS)
      expect(emittedData("deal.created").id).toBe("d1")
    })

    it("scopes the create recalc to every native column plus the supplied custom field keys", async () => {
      stubCreate(baseDeal)

      await createDealMutation({
        title: "Test Deal",
        stageId: "s1",
        organizationId: "o1",
        customFields: { Origem: ["Inbound"] },
        userId: "u1",
        assigneeIds: [],
      })

      const changed = recalcArgs().changedFields
      expect(changed).toEqual(expect.arrayContaining(DEAL_NATIVE_COLUMNS))
      expect(changed).toContain("Origem")
      // Neither empty (which would skip every create) nor a wildcard (which would defeat SC-4).
      expect(changed.length).toBeGreaterThan(0)
      expect(changed).not.toContain("*")
    })

    it("strips caller-supplied formula keys before the insert (T-34-04)", async () => {
      const valuesFn = stubCreate(baseDeal)
      const caller = { Origem: ["Inbound"], Margin: 999 }
      mockStrip.mockReturnValue({ Origem: ["Inbound"] })

      await createDealMutation({
        title: "Test Deal",
        stageId: "s1",
        organizationId: "o1",
        customFields: caller,
        userId: "u1",
        assigneeIds: [],
      })

      expect(mockStrip).toHaveBeenCalledWith(caller, expect.anything())
      expect((valuesFn.mock.calls[0][0] as Record<string, unknown>).customFields).toEqual({
        Origem: ["Inbound"],
      })
    })
  })

  // ---- updateDealMutation ----

  describe("updateDealMutation", () => {
    it("recalculates once with the .returning() row and the mutation's own changedFields", async () => {
      mockDb.query.deals.findFirst.mockResolvedValue(baseDeal)
      const updatedDeal = { ...baseDeal, title: "New Title" }
      stubUpdateWithReturning(updatedDeal)

      await updateDealMutation("d1", { title: "New Title" }, "u1")

      expect(mockRecalc).toHaveBeenCalledTimes(1)
      const args = recalcArgs()
      expect(args.entityType).toBe("deal")
      expect(args.entityId).toBe("d1")
      expect(args.row).toBe(updatedDeal)
      expect(args.changedFields).toEqual(["title"])
    })

    it("recalculates BEFORE crmBus.emit (D-17)", async () => {
      mockDb.query.deals.findFirst.mockResolvedValue(baseDeal)
      stubUpdateWithReturning({ ...baseDeal, title: "New Title" })

      await updateDealMutation("d1", { title: "New Title" }, "u1")

      expect(vi.mocked(recalculateFormulas).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(crmBus.emit).mock.invocationCallOrder[0]
      )
    })

    it("emits deal.updated carrying the POST-recalc customFields", async () => {
      mockDb.query.deals.findFirst.mockResolvedValue(baseDeal)
      stubUpdateWithReturning({ ...baseDeal, title: "New Title" })

      await updateDealMutation("d1", { title: "New Title" }, "u1")

      expect(emittedData("deal.updated").customFields).toEqual(RECALCED)
    })

    it("recalculates once for BOTH events on a stage change, and both payloads carry it", async () => {
      mockDb.query.deals.findFirst.mockResolvedValue(baseDeal)
      stubUpdateWithReturning({ ...baseDeal, stageId: "s2" })

      await updateDealMutation("d1", { stageId: "s2" }, "u1")

      expect(mockRecalc).toHaveBeenCalledTimes(1)
      expect(emittedData("deal.updated").customFields).toEqual(RECALCED)
      expect(emittedData("deal.stage_changed").customFields).toEqual(RECALCED)
      expect(vi.mocked(recalculateFormulas).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(crmBus.emit).mock.invocationCallOrder[1]
      )
    })

    it("strips caller-supplied formula keys before the merge (T-34-04)", async () => {
      mockDb.query.deals.findFirst.mockResolvedValue({ ...baseDeal, customFields: { A: 1 } })
      const setFn = stubUpdateWithReturning({ ...baseDeal })
      const caller = { B: 2, Margin: 999 }
      mockStrip.mockReturnValue({ B: 2 })

      await updateDealMutation("d1", { customFields: caller }, "u1")

      expect(mockStrip).toHaveBeenCalledWith(caller, expect.anything())
      expect((setFn.mock.calls[0][0] as Record<string, unknown>).customFields).toEqual({ A: 1, B: 2 })
    })

    it("still succeeds, still emits and logs when recalculation rejects (D-05)", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      mockDb.query.deals.findFirst.mockResolvedValue(baseDeal)
      const updatedDeal = { ...baseDeal, title: "New Title" }
      stubUpdateWithReturning(updatedDeal)
      mockRecalc.mockRejectedValue(new Error("QuickJS exploded"))

      const result = await updateDealMutation("d1", { title: "New Title" }, "u1")

      expect(result.success).toBe(true)
      expect(mockEmit).toHaveBeenCalledTimes(1)
      // Falls back to the pre-recalc blob rather than dropping the key entirely (D-06 is about
      // stored values; the emit must still describe the row as it stands).
      expect(emittedData("deal.updated").customFields).toEqual(STORED_CUSTOM_FIELDS)
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })

  // ---- deleteDealMutation ----

  describe("deleteDealMutation", () => {
    it("does NOT recalculate — a soft delete is not a save", async () => {
      mockDb.query.deals.findFirst.mockResolvedValue({ id: "d1", ownerId: "u1", deletedAt: null })
      stubBareUpdate()

      const result = await deleteDealMutation("d1", "u1")

      expect(result).toEqual({ success: true })
      expect(mockRecalc).toHaveBeenCalledTimes(0)
      expect(mockEmit).toHaveBeenCalledTimes(1)
    })
  })

  // ---- updateDealStageMutation ----

  describe("updateDealStageMutation", () => {
    beforeEach(() => {
      mockDb.query.deals.findFirst.mockResolvedValue({ ...baseDeal, stageId: "s1" })
      mockDb.query.stages.findFirst.mockResolvedValue({ id: "s2", pipeline: { deletedAt: null } })
      mockDb.query.deals.findMany.mockResolvedValue([])
      stubBareUpdate()
    })

    it("recalculates once with the post-write row and ['stageId'] (SC-4: zero evaluations)", async () => {
      await updateDealStageMutation("d1", "s2", "u1")

      expect(mockRecalc).toHaveBeenCalledTimes(1)
      const args = recalcArgs()
      expect(args.entityType).toBe("deal")
      expect(args.entityId).toBe("d1")
      expect(args.changedFields).toEqual(["stageId"])
      // The row handed over is the post-write state, not the stale pre-write one.
      expect(args.row).toMatchObject({ id: "d1", stageId: "s2" })
    })

    it("recalculates BEFORE both emits, and both payloads carry the post-recalc customFields", async () => {
      await updateDealStageMutation("d1", "s2", "u1")

      expect(vi.mocked(recalculateFormulas).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(crmBus.emit).mock.invocationCallOrder[0]
      )
      expect(emittedData("deal.updated").customFields).toEqual(RECALCED)
      expect(emittedData("deal.stage_changed").customFields).toEqual(RECALCED)
    })
  })

  // ---- reorderDealsMutation ----

  describe("reorderDealsMutation", () => {
    it("recalculates the moved deal with ['position'] and emits nothing on a same-stage reorder", async () => {
      mockDb.query.deals.findFirst.mockResolvedValue({ ...baseDeal, stageId: "s1" })
      mockDb.query.stages.findFirst.mockResolvedValue({ id: "s1", pipeline: { deletedAt: null } })
      mockDb.query.deals.findMany.mockResolvedValue([
        { id: "d2", position: "10000", stageId: "s1" },
        { id: "d3", position: "20000", stageId: "s1" },
      ])
      stubBareUpdate()

      await reorderDealsMutation("d1", "s1", 1, "u1")

      expect(mockRecalc).toHaveBeenCalledTimes(1)
      expect(recalcArgs().changedFields).toContain("position")
      expect(recalcArgs().changedFields).not.toContain("stageId")
      expect(mockEmit).not.toHaveBeenCalled()
    })

    it("recalculates before emitting on a cross-stage reorder, sharing ONE definitionsCache", async () => {
      mockDb.query.deals.findFirst.mockResolvedValue({ ...baseDeal, stageId: "s1" })
      mockDb.query.stages.findFirst.mockResolvedValue({ id: "s2", pipeline: { deletedAt: null } })
      mockDb.query.deals.findMany.mockResolvedValue([])
      stubBareUpdate()

      await reorderDealsMutation("d1", "s2", 0, "u1")

      expect(recalcArgs().changedFields).toEqual(expect.arrayContaining(["position", "stageId"]))
      expect(recalcArgs().definitionsCache).toBeInstanceOf(Map)
      // One definition query for the whole reorder, however many deals it ends up touching.
      const caches = mockRecalc.mock.calls.map((c) => (c[0] as RecalculateFormulasInput).definitionsCache)
      expect(new Set(caches).size).toBe(1)
      expect(vi.mocked(recalculateFormulas).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(crmBus.emit).mock.invocationCallOrder[0]
      )
      expect(emittedData("deal.updated").customFields).toEqual(RECALCED)
      expect(emittedData("deal.stage_changed").customFields).toEqual(RECALCED)
    })
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

/* ------------------------------------------------------------------------------------------ *
 * Restore (TRASH-02)
 * ------------------------------------------------------------------------------------------ */

describe("restoreDealMutation", () => {
  const TRASHED_AT = new Date("2026-08-01T10:00:00Z")

  const trashedDeal = {
    id: "d1",
    title: "Trashed Deal",
    stageId: "s1",
    value: "100",
    organizationId: "o1",
    personId: null,
    ownerId: "u1",
    position: "10000",
    expectedCloseDate: null,
    notes: null,
    customFields: {} as Record<string, unknown>,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: TRASHED_AT,
  }

  /** `db.update(deals).set(...).where(...)` with no `.returning()` — restore needs no row back. */
  function stubUpdate() {
    const whereFn = vi.fn().mockResolvedValue(undefined)
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })
    return { setFn, whereFn }
  }

  /** `db.insert(auditLog).values(...)` — awaited directly, so `values` must resolve. */
  function stubAuditInsert() {
    const valuesFn = vi.fn().mockResolvedValue(undefined)
    mockDb.insert.mockReturnValue({ values: valuesFn })
    return valuesFn
  }

  it("issues exactly one update whose set is { deletedAt: null, updatedAt }", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(trashedDeal)
    const { setFn } = stubUpdate()
    stubAuditInsert()

    const result = await restoreDealMutation("d1")

    expect(result).toEqual({ success: true })
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    const setArg = setFn.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(setArg).sort()).toEqual(["deletedAt", "updatedAt"])
    expect(setArg.deletedAt).toBeNull()
    expect(setArg.updatedAt).toBeInstanceOf(Date)
  })

  it("checks existence with isNotNull(deletedAt), not isNull", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(trashedDeal)
    stubUpdate()
    stubAuditInsert()

    await restoreDealMutation("d1")

    const where = mockDb.query.deals.findFirst.mock.calls[0][0].where
    const rendered = renderPredicate(where)
    expect(rendered).toContain("is not null")
    // Guard against `is null` sneaking back in: `is not null` contains no bare `is null`.
    expect(rendered).not.toMatch(/is null/)
  })

  it("returns NOT_IN_TRASH and issues no update for a live or missing deal", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(undefined)

    const result = await restoreDealMutation("d1")

    expect(result).toEqual({ success: false, error: "NOT_IN_TRASH" })
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockRecalc).not.toHaveBeenCalled()
  })

  it("recalculates with a changedFields carrying the custom sentinel and every native attribute", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(trashedDeal)
    stubUpdate()
    stubAuditInsert()

    await restoreDealMutation("d1")

    expect(mockRecalc).toHaveBeenCalledTimes(1)
    const input = mockRecalc.mock.calls[0][0] as RecalculateFormulasInput
    expect(input.entityType).toBe("deal")
    expect(input.entityId).toBe("d1")
    // Pitfall 1: an empty list, or ['deletedAt'], evaluates ZERO formulas in silence, because
    // `deletedAt` is not a referenceable attribute for any entity type. Sourced from the real
    // import so a change to the vocabulary breaks this test rather than drifting past it.
    expect(input.changedFields).toContain(CHANGED_FIELDS_CUSTOM_SENTINEL)
    for (const column of Object.values(ENTITY_NATIVE_ATTRIBUTES.deal)) {
      expect(input.changedFields).toContain(column)
    }
  })

  it("recalculates AFTER the update, never before", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(trashedDeal)
    const { setFn } = stubUpdate()
    stubAuditInsert()

    await restoreDealMutation("d1")

    // cascadeToChildren filters isNull(relation.deletedAt), so children only re-enter the
    // cascade once the parent row is live again.
    expect(setFn.mock.invocationCallOrder[0]).toBeLessThan(mockRecalc.mock.invocationCallOrder[0])
  })

  it("emits nothing on crmBus", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(trashedDeal)
    stubUpdate()
    stubAuditInsert()

    await restoreDealMutation("d1")

    expect(mockEmit).not.toHaveBeenCalled()
  })

  it("writes one audit row with the deletedAt diff and a system actor when none is established", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(trashedDeal)
    stubUpdate()
    const valuesFn = stubAuditInsert()

    await restoreDealMutation("d1")

    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(mockDb.insert).toHaveBeenCalledWith(auditLog)
    expect(valuesFn.mock.calls[0][0]).toEqual({
      entityType: "deal",
      entityId: "d1",
      action: "updated",
      changes: { deletedAt: { from: TRASHED_AT, to: null } },
      actorKind: "system",
      actorUserId: null,
      workflowRunId: null,
      importSessionId: null,
    })
  })

  it("takes the actor from getCurrentActor, never from the record", async () => {
    mockGetCurrentActor.mockReturnValue({ kind: "user", userId: "actor-9" })
    mockDb.query.deals.findFirst.mockResolvedValue(trashedDeal)
    stubUpdate()
    const valuesFn = stubAuditInsert()

    await restoreDealMutation("d1")

    const row = valuesFn.mock.calls[0][0] as Record<string, unknown>
    expect(row.actorKind).toBe("user")
    // "u1" is the deal's OWNER — the record, not the identity that restored it.
    expect(row.actorUserId).toBe("actor-9")
  })

  it("returns a prose failure and logs when the update throws", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(trashedDeal)
    const whereFn = vi.fn().mockRejectedValue(new Error("db down"))
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await restoreDealMutation("d1")

    expect(result).toEqual({ success: false, error: "Failed to restore deal" })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it("still succeeds when the audit insert fails, and logs it", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(trashedDeal)
    stubUpdate()
    mockDb.insert.mockReturnValue({ values: vi.fn().mockRejectedValue(new Error("audit down")) })
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await restoreDealMutation("d1")

    // The restore is the user-visible contract; a lost audit row is logged, not swallowed,
    // and never rolls back a write the user can already see.
    expect(result).toEqual({ success: true })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
