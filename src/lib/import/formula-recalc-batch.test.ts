import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// The importers never touch the database through this helper — `recalculateFormulas` owns every
// read and write. The stub exists only so an accidental import of `@/db` cannot open a pool.
vi.mock("@/db", () => ({
  db: {
    query: {},
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
}))

// How many evaluations the mocked `recalculateFormulas` reports per row. Individual tests
// override it; the shared budget arithmetic is asserted against this number.
const { recalcState } = vi.hoisted(() => ({
  recalcState: {
    evaluationsPerRow: 1,
    /** Row ids for which the mock should reject, to exercise D-05 failure isolation. */
    rejectFor: new Set<string>(),
  },
}))

// `importOriginal` keeps ENTITY_NATIVE_ATTRIBUTES and FORMULA_EVALUATION_BUDGET REAL, so a drift
// between the shared vocabulary and this helper's changedFields cannot pass silently. Only the
// orchestrated call is stubbed: evaluation behaviour is covered by formula-recalc.test.ts.
vi.mock("@/lib/formula-recalc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/formula-recalc")>()
  return {
    ...actual,
    recalculateFormulas: vi.fn(async (input: { entityId: string }) => {
      if (recalcState.rejectFor.has(input.entityId)) {
        throw new Error("boom")
      }
      return { customFields: {}, evaluations: recalcState.evaluationsPerRow }
    }),
  }
})

import {
  recalculateFormulas,
  FORMULA_EVALUATION_BUDGET,
  ENTITY_NATIVE_ATTRIBUTES,
} from "@/lib/formula-recalc"
import { recalculateImportedRows } from "./formula-recalc-batch"

const mockRecalc = vi.mocked(recalculateFormulas)

/** A row as `.returning()` hands it back: id, native columns and the JSONB blob. */
function dealRow(id: string, customFields: Record<string, unknown> = {}) {
  return {
    id,
    title: `Deal ${id}`,
    value: "100",
    notes: null,
    expectedCloseDate: null,
    customFields,
  }
}

describe("recalculateImportedRows", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    recalcState.evaluationsPerRow = 1
    recalcState.rejectFor = new Set()
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  // ---------------------------------------------------------------------------------------
  // Test 1 — one call per row
  // ---------------------------------------------------------------------------------------
  it("calls recalculateFormulas exactly once per row, with the row and its id", async () => {
    const rows = [dealRow("r1"), dealRow("r2"), dealRow("r3")]

    await recalculateImportedRows({ entityType: "deal", rows })

    expect(mockRecalc).toHaveBeenCalledTimes(3)
    expect(mockRecalc.mock.calls.map((c) => c[0].entityId)).toEqual(["r1", "r2", "r3"])
    expect(mockRecalc.mock.calls.map((c) => c[0].entityType)).toEqual(["deal", "deal", "deal"])
    // The row is passed through, so `recalculateFormulas` never re-reads what the insert returned.
    expect(mockRecalc.mock.calls[0][0].row).toBe(rows[0])
    expect(mockRecalc.mock.calls[2][0].row).toBe(rows[2])
  })

  // ---------------------------------------------------------------------------------------
  // Test 2 — ONE definitions cache for the whole import
  // ---------------------------------------------------------------------------------------
  it("shares one definitionsCache Map instance across every row", async () => {
    const rows = [dealRow("r1"), dealRow("r2"), dealRow("r3")]

    await recalculateImportedRows({ entityType: "deal", rows })

    const caches = mockRecalc.mock.calls.map((c) => c[0].definitionsCache)
    expect(caches[0]).toBeInstanceOf(Map)
    // Identity, not equality: a fresh empty Map per row would satisfy toEqual and would issue
    // one definition query per imported row.
    expect(caches[1]).toBe(caches[0])
    expect(caches[2]).toBe(caches[0])
  })

  it("reuses a caller-supplied definitionsCache rather than creating its own", async () => {
    const definitionsCache = new Map()
    const rows = [dealRow("r1"), dealRow("r2")]

    await recalculateImportedRows({ entityType: "deal", rows, definitionsCache })

    expect(mockRecalc.mock.calls[0][0].definitionsCache).toBe(definitionsCache)
    expect(mockRecalc.mock.calls[1][0].definitionsCache).toBe(definitionsCache)
  })

  // ---------------------------------------------------------------------------------------
  // Test 3 — the cascade is OFF for imports (D-03)
  // ---------------------------------------------------------------------------------------
  it("passes cascade: false on every row", async () => {
    const rows = [dealRow("r1"), dealRow("r2"), dealRow("r3")]

    await recalculateImportedRows({ entityType: "deal", rows })

    for (const call of mockRecalc.mock.calls) {
      expect(call[0].cascade).toBe(false)
    }
  })

  // ---------------------------------------------------------------------------------------
  // Test 4 — ONE shared, decrementing budget (D-04 / D-13 / T-34-03)
  // ---------------------------------------------------------------------------------------
  it("threads ONE decrementing budget across the whole import, not a fresh one per row", async () => {
    recalcState.evaluationsPerRow = 200
    const rows = [dealRow("r1"), dealRow("r2"), dealRow("r3")]

    await recalculateImportedRows({ entityType: "deal", rows, budget: 500 })

    expect(mockRecalc.mock.calls.map((c) => c[0].budget)).toEqual([500, 300, 100])
  })

  it("defaults the shared budget to FORMULA_EVALUATION_BUDGET", async () => {
    await recalculateImportedRows({ entityType: "deal", rows: [dealRow("r1")] })

    expect(mockRecalc.mock.calls[0][0].budget).toBe(FORMULA_EVALUATION_BUDGET)
    expect(FORMULA_EVALUATION_BUDGET).toBe(500)
  })

  // ---------------------------------------------------------------------------------------
  // Test 5 — exhaustion stops the loop and warns exactly once
  // ---------------------------------------------------------------------------------------
  it("stops recalculating once the shared budget is spent and warns exactly once", async () => {
    recalcState.evaluationsPerRow = 200
    const rows = ["r1", "r2", "r3", "r4", "r5"].map((id) => dealRow(id))

    const summary = await recalculateImportedRows({ entityType: "deal", rows, budget: 500 })

    // 500 -> 300 -> 100 -> exhausted. Rows 4 and 5 are never handed to the engine.
    expect(mockRecalc).toHaveBeenCalledTimes(3)
    expect(summary).toEqual({ recalculated: 3, skipped: 2, evaluations: 600 })

    expect(warnSpy).toHaveBeenCalledTimes(1)
    const message = String(warnSpy.mock.calls[0][0])
    expect(message).toContain("[formula-recalc]")
    expect(message).toContain("deal")
    expect(message).toContain("5")
    expect(message).toContain("2")
  })

  it("recalculates nothing and warns when the budget starts at zero", async () => {
    const rows = [dealRow("r1"), dealRow("r2")]

    const summary = await recalculateImportedRows({ entityType: "deal", rows, budget: 0 })

    expect(mockRecalc).not.toHaveBeenCalled()
    expect(summary).toEqual({ recalculated: 0, skipped: 2, evaluations: 0 })
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it("does not warn when the budget covered every row", async () => {
    await recalculateImportedRows({
      entityType: "deal",
      rows: [dealRow("r1"), dealRow("r2")],
    })

    expect(warnSpy).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------------------
  // Test 6 — a create changes everything
  // ---------------------------------------------------------------------------------------
  it("passes the entity's native columns plus that row's customFields keys as changedFields", async () => {
    const rows = [dealRow("r1", { Margin: 10, Origem: ["Inbound"] })]

    await recalculateImportedRows({ entityType: "deal", rows })

    const changedFields = mockRecalc.mock.calls[0][0].changedFields
    for (const column of Object.values(ENTITY_NATIVE_ATTRIBUTES.deal)) {
      expect(changedFields).toContain(column)
    }
    expect(changedFields).toContain("Margin")
    expect(changedFields).toContain("Origem")
  })

  it("derives changedFields per entity type from ENTITY_NATIVE_ATTRIBUTES", async () => {
    await recalculateImportedRows({
      entityType: "organization",
      rows: [{ id: "o1", name: "Acme", customFields: {} }],
    })

    const changedFields = mockRecalc.mock.calls[0][0].changedFields
    expect(changedFields).toEqual(
      expect.arrayContaining(Object.values(ENTITY_NATIVE_ATTRIBUTES.organization))
    )
    // A deal-only column must not leak into an organization's changed set.
    expect(changedFields).not.toContain("expectedCloseDate")
  })

  it("tolerates a null or absent customFields blob", async () => {
    const rows = [
      { id: "r1", title: "A", customFields: null },
      { id: "r2", title: "B" },
    ]

    const summary = await recalculateImportedRows({ entityType: "deal", rows })

    expect(mockRecalc).toHaveBeenCalledTimes(2)
    expect(summary.recalculated).toBe(2)
  })

  // ---------------------------------------------------------------------------------------
  // Test 7 — failure isolation (D-05 at import scale, T-34-24)
  // ---------------------------------------------------------------------------------------
  it("continues past a row whose recalculation rejects, logs it, and resolves", async () => {
    recalcState.rejectFor = new Set(["r2"])
    const rows = [dealRow("r1"), dealRow("r2"), dealRow("r3")]

    const summary = await recalculateImportedRows({ entityType: "deal", rows })

    expect(mockRecalc).toHaveBeenCalledTimes(3)
    expect(summary).toEqual({ recalculated: 2, skipped: 1, evaluations: 2 })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain("[formula-recalc]")
    // A single broken formula must not turn into a budget-exhaustion warning.
    expect(warnSpy).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------------------
  // Test 8 — the empty import
  // ---------------------------------------------------------------------------------------
  it("does nothing for an empty rows array", async () => {
    const summary = await recalculateImportedRows({ entityType: "deal", rows: [] })

    expect(mockRecalc).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(summary).toEqual({ recalculated: 0, skipped: 0, evaluations: 0 })
  })

  // ---------------------------------------------------------------------------------------
  // Test 9 — the summary the importers log
  // ---------------------------------------------------------------------------------------
  it("returns a { recalculated, skipped, evaluations } summary whose counts reconcile", async () => {
    recalcState.evaluationsPerRow = 3
    const rows = [dealRow("r1"), dealRow("r2"), dealRow("r3"), dealRow("r4")]

    const summary = await recalculateImportedRows({ entityType: "deal", rows })

    expect(summary).toEqual({ recalculated: 4, skipped: 0, evaluations: 12 })
    expect(summary.recalculated + summary.skipped).toBe(rows.length)
  })

  // ---------------------------------------------------------------------------------------
  // Source guards — the reasoning must survive future edits
  // ---------------------------------------------------------------------------------------
  it("never issues its own evaluateFormula call, so D-18's bounds cannot be bypassed", async () => {
    const fs = await import("node:fs")
    const source = fs.readFileSync("src/lib/import/formula-recalc-batch.ts", "utf8")
    const code = source
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n")

    expect(code).not.toContain("evaluateFormula")
    expect(code).toContain("recalculateFormulas")
  })
})
