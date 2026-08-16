// NOTE ON WHAT THIS SUITE CANNOT PROVE.
//
// `db` is mocked here, so a mocked `delete` cannot exercise a real foreign key. `activities` is
// a true leaf — a bare `DELETE` on it succeeds today — but no assertion in this file would
// notice if a future migration added a child table pointing at it. The only honest test of the
// constraint behaviour itself is `scripts/trash-checks.sql`, delivered by 37-15.
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
import { auditLog, notes, activities } from "@/db/schema"
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
  createActivityMutation,
  updateActivityMutation,
  deleteActivityMutation,
  toggleActivityCompletionMutation,
  restoreActivityMutation,
  purgeActivityMutation,
} from "./activities"

const mockDb = db as unknown as {
  query: {
    activities: { findFirst: ReturnType<typeof vi.fn> }
    activityTypes: { findFirst: ReturnType<typeof vi.fn> }
    deals: { findFirst: ReturnType<typeof vi.fn> }
  }
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  transaction: ReturnType<typeof vi.fn>
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
const renderQuery = (where: unknown) => new PgDialect().sqlToQuery(where as SQL)
const renderPredicate = (where: unknown): string => renderQuery(where).sql

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

describe("formula recalculation (D-01/D-17)", () => {
  // Deliberately different from every fixture's stored blob, so an assertion on the EMITTED
  // payload can only pass if the post-recalc value was folded in — a database-row assertion
  // could not tell recalc-before-emit from recalc-after-emit apart (Pitfall 3).
  const RECALCED: Record<string, unknown> = {
    Margin: { formula: true, value: 1035, error: null },
  }
  const RECALC_RESULT = { customFields: RECALCED, evaluations: 1 }

  const ACTIVITY_NATIVE_COLUMNS = Object.values(ENTITY_NATIVE_ATTRIBUTES.activity)

  const STORED_CUSTOM_FIELDS: Record<string, unknown> = { Origem: ["Inbound"] }

  const baseActivity = {
    id: "act1",
    title: "Call client",
    typeId: "type1",
    dealId: null,
    ownerId: "u1",
    assigneeId: null,
    dueDate: new Date(),
    completedAt: null,
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
    mockDb.query.activityTypes.findFirst.mockResolvedValue({ id: "type1", name: "Call" })
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
    return setFn
  }

  const recalcArgs = (index = 0) =>
    mockRecalc.mock.calls[index][0] as RecalculateFormulasInput

  const emittedData = (event: string, index = 0): Record<string, unknown> => {
    const calls = mockEmit.mock.calls.filter((c) => c[0] === event)
    return ((calls[index]?.[1] as { data?: Record<string, unknown> } | undefined)?.data ?? {})
  }

  // ---- createActivityMutation ----

  describe("createActivityMutation", () => {
    const create = (customFields?: Record<string, unknown>) =>
      createActivityMutation({
        title: "Call client",
        typeId: "type1",
        dueDate: new Date(),
        ...(customFields ? { customFields } : {}),
        userId: "u1",
      })

    it("recalculates exactly once, from the .returning() row (no redundant re-read)", async () => {
      stubCreate(baseActivity)

      await create()

      expect(mockRecalc).toHaveBeenCalledTimes(1)
      const args = recalcArgs()
      expect(args.entityType).toBe("activity")
      expect(args.entityId).toBe("act1")
      expect(args.row).toBe(baseActivity)
    })

    it("recalculates BEFORE crmBus.emit (D-17)", async () => {
      stubCreate(baseActivity)

      await create()

      expect(vi.mocked(recalculateFormulas).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(crmBus.emit).mock.invocationCallOrder[0]
      )
    })

    it("emits activity.created carrying the POST-recalc customFields (SC-2/SC-3)", async () => {
      stubCreate(baseActivity)

      await create()

      expect(emittedData("activity.created").customFields).toEqual(RECALCED)
      expect(emittedData("activity.created").customFields).not.toEqual(STORED_CUSTOM_FIELDS)
      expect(emittedData("activity.created").id).toBe("act1")
    })

    it("scopes the create recalc to every native column plus the supplied custom field keys", async () => {
      stubCreate(baseActivity)

      await create({ Origem: ["Inbound"] })

      const changed = recalcArgs().changedFields
      expect(changed).toEqual(expect.arrayContaining(ACTIVITY_NATIVE_COLUMNS))
      expect(changed).toContain("Origem")
      expect(changed.length).toBeGreaterThan(0)
      expect(changed).not.toContain("*")
    })

    it("strips caller-supplied formula keys before the insert (T-34-04)", async () => {
      const valuesFn = stubCreate(baseActivity)
      const caller = { Origem: ["Inbound"], Margin: 999 }
      mockStrip.mockReturnValue({ Origem: ["Inbound"] })

      await create(caller)

      expect(mockStrip).toHaveBeenCalledWith(caller, expect.anything())
      expect((valuesFn.mock.calls[0][0] as Record<string, unknown>).customFields).toEqual({
        Origem: ["Inbound"],
      })
    })
  })

  // ---- updateActivityMutation ----

  describe("updateActivityMutation", () => {
    it("recalculates once with the .returning() row and the mutation's own changedFields", async () => {
      mockDb.query.activities.findFirst.mockResolvedValue(baseActivity)
      const updated = { ...baseActivity, title: "Email client" }
      stubUpdateWithReturning(updated)

      await updateActivityMutation("act1", { title: "Email client" }, "u1")

      expect(mockRecalc).toHaveBeenCalledTimes(1)
      const args = recalcArgs()
      expect(args.entityType).toBe("activity")
      expect(args.entityId).toBe("act1")
      expect(args.row).toBe(updated)
      expect(args.changedFields).toEqual(["title"])
    })

    it("recalculates BEFORE crmBus.emit, and the payload carries the post-recalc blob", async () => {
      mockDb.query.activities.findFirst.mockResolvedValue(baseActivity)
      stubUpdateWithReturning({ ...baseActivity, title: "Email client" })

      await updateActivityMutation("act1", { title: "Email client" }, "u1")

      expect(vi.mocked(recalculateFormulas).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(crmBus.emit).mock.invocationCallOrder[0]
      )
      expect(emittedData("activity.updated").customFields).toEqual(RECALCED)
    })

    it("strips caller-supplied formula keys before the merge (T-34-04)", async () => {
      mockDb.query.activities.findFirst.mockResolvedValue({ ...baseActivity, customFields: { A: 1 } })
      const setFn = stubUpdateWithReturning(baseActivity)
      const caller = { B: 2, Margin: 999 }
      mockStrip.mockReturnValue({ B: 2 })

      await updateActivityMutation("act1", { customFields: caller }, "u1")

      expect(mockStrip).toHaveBeenCalledWith(caller, expect.anything())
      expect((setFn.mock.calls[0][0] as Record<string, unknown>).customFields).toEqual({ A: 1, B: 2 })
    })

    it("still succeeds, still emits and logs when recalculation rejects (D-05)", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      mockDb.query.activities.findFirst.mockResolvedValue(baseActivity)
      stubUpdateWithReturning({ ...baseActivity, title: "Email client" })
      mockRecalc.mockRejectedValue(new Error("QuickJS exploded"))

      const result = await updateActivityMutation("act1", { title: "Email client" }, "u1")

      expect(result).toEqual({ success: true })
      expect(mockEmit).toHaveBeenCalledTimes(1)
      expect(emittedData("activity.updated").customFields).toEqual(STORED_CUSTOM_FIELDS)
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })

  // ---- deleteActivityMutation ----

  describe("deleteActivityMutation", () => {
    it("does NOT recalculate — a soft delete is not a save", async () => {
      mockDb.query.activities.findFirst.mockResolvedValue({ id: "act1", ownerId: "u1", deletedAt: null })
      const whereFn = vi.fn().mockResolvedValue(undefined)
      const setFn = vi.fn().mockReturnValue({ where: whereFn })
      mockDb.update.mockReturnValue({ set: setFn })

      const result = await deleteActivityMutation("act1", "u1")

      expect(result).toEqual({ success: true })
      expect(mockRecalc).toHaveBeenCalledTimes(0)
      expect(mockEmit).toHaveBeenCalledTimes(1)
    })
  })

  // ---- toggleActivityCompletionMutation ----

  describe("toggleActivityCompletionMutation", () => {
    it("recalculates before emit, scoped so a {{CompletedAt}} formula is in scope", async () => {
      mockDb.query.activities.findFirst.mockResolvedValue(baseActivity)
      const updated = { ...baseActivity, completedAt: new Date() }
      stubUpdateWithReturning(updated)

      const result = await toggleActivityCompletionMutation("act1", "u1")

      expect(result).toEqual({ success: true, completed: true })
      expect(mockRecalc).toHaveBeenCalledTimes(1)
      const args = recalcArgs()
      expect(args.entityId).toBe("act1")
      expect(args.row).toBe(updated)
      // "completed" is what the mutation already pushes into the event; "completedAt" is the
      // column the CompletedAt native attribute maps to, so scoping can actually select it.
      expect(args.changedFields).toContain("completed")
      expect(args.changedFields).toContain("completedAt")
      expect(vi.mocked(recalculateFormulas).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(crmBus.emit).mock.invocationCallOrder[0]
      )
    })

    it("emits activity.updated carrying the POST-recalc customFields, changedFields unchanged", async () => {
      mockDb.query.activities.findFirst.mockResolvedValue({ ...baseActivity, completedAt: new Date() })
      stubUpdateWithReturning({ ...baseActivity, completedAt: null })

      await toggleActivityCompletionMutation("act1", "u1")

      expect(emittedData("activity.updated").customFields).toEqual(RECALCED)
      const call = mockEmit.mock.calls.find((c) => c[0] === "activity.updated")
      expect((call?.[1] as { changedFields: string[] }).changedFields).toEqual(["completed"])
    })
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

/* ------------------------------------------------------------------------------------------ *
 * Restore (TRASH-02)
 * ------------------------------------------------------------------------------------------ */

describe("restoreActivityMutation", () => {
  const TRASHED_AT = new Date("2026-08-01T10:00:00Z")

  const trashedActivity = {
    id: "act1",
    title: "Trashed Activity",
    typeId: "type1",
    dealId: "d1",
    ownerId: "u1",
    assigneeId: null,
    dueDate: new Date(),
    completedAt: null,
    notes: null,
    customFields: {} as Record<string, unknown>,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: TRASHED_AT,
  }

  /** `db.update(activities).set(...).where(...)` — restore needs no row back. */
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
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    const { setFn } = stubUpdate()
    stubAuditInsert()

    const result = await restoreActivityMutation("act1")

    expect(result).toEqual({ success: true })
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    const setArg = setFn.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(setArg).sort()).toEqual(["deletedAt", "updatedAt"])
    expect(setArg.deletedAt).toBeNull()
    expect(setArg.updatedAt).toBeInstanceOf(Date)
  })

  it("checks existence with isNotNull(deletedAt), not isNull", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    stubUpdate()
    stubAuditInsert()

    await restoreActivityMutation("act1")

    const where = mockDb.query.activities.findFirst.mock.calls[0][0].where
    const rendered = renderPredicate(where)
    expect(rendered).toContain("is not null")
    expect(rendered).not.toMatch(/is null/)
  })

  it("returns NOT_IN_TRASH and issues no update for a live or missing activity", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(undefined)

    const result = await restoreActivityMutation("act1")

    expect(result).toEqual({ success: false, error: "NOT_IN_TRASH" })
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockRecalc).not.toHaveBeenCalled()
  })

  it("recalculates with a changedFields carrying the custom sentinel and every native attribute", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    stubUpdate()
    stubAuditInsert()

    await restoreActivityMutation("act1")

    expect(mockRecalc).toHaveBeenCalledTimes(1)
    const input = mockRecalc.mock.calls[0][0] as RecalculateFormulasInput
    expect(input.entityType).toBe("activity")
    expect(input.entityId).toBe("act1")
    // Pitfall 1: an empty list, or ['deletedAt'], evaluates ZERO formulas in silence.
    expect(input.changedFields).toContain(CHANGED_FIELDS_CUSTOM_SENTINEL)
    for (const column of Object.values(ENTITY_NATIVE_ATTRIBUTES.activity)) {
      expect(input.changedFields).toContain(column)
    }
  })

  it("recalculates AFTER the update, never before", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    const { setFn } = stubUpdate()
    stubAuditInsert()

    await restoreActivityMutation("act1")

    expect(setFn.mock.invocationCallOrder[0]).toBeLessThan(mockRecalc.mock.invocationCallOrder[0])
  })

  it("emits nothing on crmBus", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    stubUpdate()
    stubAuditInsert()

    await restoreActivityMutation("act1")

    expect(mockEmit).not.toHaveBeenCalled()
  })

  it("writes one audit row with the deletedAt diff and a system actor when none is established", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    stubUpdate()
    const valuesFn = stubAuditInsert()

    await restoreActivityMutation("act1")

    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(mockDb.insert).toHaveBeenCalledWith(auditLog)
    expect(valuesFn.mock.calls[0][0]).toEqual({
      entityType: "activity",
      entityId: "act1",
      action: "updated",
      changes: { deletedAt: { from: TRASHED_AT, to: null } },
      actorKind: "system",
      actorUserId: null,
      workflowRunId: null,
      importSessionId: null,
    })
  })

  it("takes the actor from getCurrentActor, never from the record", async () => {
    mockGetCurrentActor.mockReturnValue({ kind: "api_key", userId: "actor-9" })
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    stubUpdate()
    const valuesFn = stubAuditInsert()

    await restoreActivityMutation("act1")

    const row = valuesFn.mock.calls[0][0] as Record<string, unknown>
    expect(row.actorKind).toBe("api_key")
    // "u1" is the activity's OWNER — the record, not the identity that restored it.
    expect(row.actorUserId).toBe("actor-9")
  })

  it("returns a prose failure and logs when the update throws", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    const whereFn = vi.fn().mockRejectedValue(new Error("db down"))
    const setFn = vi.fn().mockReturnValue({ where: whereFn })
    mockDb.update.mockReturnValue({ set: setFn })
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await restoreActivityMutation("act1")

    expect(result).toEqual({ success: false, error: "Failed to restore activity" })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it("still succeeds when the audit insert fails, and logs it", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    stubUpdate()
    mockDb.insert.mockReturnValue({ values: vi.fn().mockRejectedValue(new Error("audit down")) })
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await restoreActivityMutation("act1")

    expect(result).toEqual({ success: true })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

/* ------------------------------------------------------------------------------------------ *
 * Purge (TRASH-03) — the ordered teardown
 * ------------------------------------------------------------------------------------------ */

describe("purgeActivityMutation", () => {
  const trashedActivity = {
    id: "act1",
    title: "Trashed Activity",
    typeId: "type1",
    dealId: "d1",
    ownerId: "u1",
    deletedAt: new Date("2026-08-01T10:00:00Z"),
  }

  function stubTransaction() {
    // Annotated `ReturnType<typeof vi.fn>` — the same posture `mockDb` above uses — so
    // `mock.calls[n][0]` is readable. The arrow bodies take no parameters, so an inferred
    // signature would make the call tuple empty and every argument assertion a type error.
    const deleteWhere: ReturnType<typeof vi.fn> = vi.fn(() => Promise.resolve(undefined))
    const txDelete: ReturnType<typeof vi.fn> = vi.fn(() => ({ where: deleteWhere }))

    const insertValues: ReturnType<typeof vi.fn> = vi.fn(() => Promise.resolve(undefined))
    const txInsert: ReturnType<typeof vi.fn> = vi.fn(() => ({ values: insertValues }))

    const txUpdate = vi.fn()

    const tx = { delete: txDelete, insert: txInsert, update: txUpdate }
    mockDb.transaction.mockImplementation(
      async (cb: (handle: typeof tx) => Promise<unknown>) => cb(tx)
    )

    return { txDelete, deleteWhere, txInsert, insertValues, txUpdate }
  }

  it("deletes notes then the activity, in that ORDER, in one transaction", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    const { txDelete, deleteWhere } = stubTransaction()

    const result = await purgeActivityMutation("act1")

    expect(result).toEqual({ success: true, detached: 0 })
    expect(mockDb.transaction).toHaveBeenCalledTimes(1)
    expect(txDelete.mock.calls.map((call) => call[0])).toEqual([notes, activities])
    const order = txDelete.mock.invocationCallOrder
    expect(order[0]).toBeLessThan(order[1])
    // The notes predicate is scoped by (entityType, entityId): `notes` has NO foreign key, so
    // nothing in the database enforces it.
    const query = renderQuery(deleteWhere.mock.calls[0][0])
    expect(query.params).toEqual(["activity", "act1"])
    // Every write on the tx handle, never on `db`.
    expect(mockDb.delete).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("detaches nothing — activities is a leaf", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    const { txUpdate } = stubTransaction()

    const result = await purgeActivityMutation("act1")

    expect(result).toEqual({ success: true, detached: 0 })
    expect(txUpdate).not.toHaveBeenCalled()
  })

  it("carries isNotNull(deletedAt) on the final delete itself", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    const { deleteWhere } = stubTransaction()

    await purgeActivityMutation("act1")

    const rendered = renderPredicate(deleteWhere.mock.calls[1][0])
    expect(rendered).toContain("is not null")
    expect(rendered).not.toMatch(/is null/)
  })

  it("writes the purge audit row with the __purge marker, INSIDE the transaction", async () => {
    mockGetCurrentActor.mockReturnValue({ kind: "workflow_run", userId: null, workflowRunId: "run-3" })
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    const { txInsert, insertValues } = stubTransaction()

    await purgeActivityMutation("act1")

    expect(txInsert).toHaveBeenCalledTimes(1)
    expect(txInsert).toHaveBeenCalledWith(auditLog)
    expect(insertValues.mock.calls[0][0]).toEqual({
      entityType: "activity",
      entityId: "act1",
      action: "deleted",
      changes: { __purge: { from: null, to: true } },
      actorKind: "workflow_run",
      actorUserId: null,
      workflowRunId: "run-3",
      importSessionId: null,
    })
  })

  it("inserts the purge audit row AFTER the activity row is gone", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    const { txDelete, txInsert } = stubTransaction()

    await purgeActivityMutation("act1")

    expect(txDelete.mock.invocationCallOrder[1]).toBeLessThan(txInsert.mock.invocationCallOrder[0])
  })

  it("returns NOT_IN_TRASH and never opens a transaction for a live or missing activity", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(undefined)

    const result = await purgeActivityMutation("act1")

    expect(result).toEqual({ success: false, error: "NOT_IN_TRASH" })
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it("returns a prose failure and logs when the teardown rejects", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(trashedActivity)
    mockDb.transaction.mockRejectedValue(new Error("23503"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await purgeActivityMutation("act1")

    expect(result).toEqual({ success: false, error: "Failed to purge activity" })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
