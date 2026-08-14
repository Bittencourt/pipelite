import { describe, it, expect, vi, beforeEach } from "vitest"

// Established mock shape (all 18 DB-touching test files use this).
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    query: {
      deals: { findFirst: vi.fn(), findMany: vi.fn() },
      people: { findFirst: vi.fn(), findMany: vi.fn() },
      organizations: { findFirst: vi.fn(), findMany: vi.fn() },
      activities: { findFirst: vi.fn(), findMany: vi.fn() },
    },
  },
}))

// getActiveFieldDefinitions is a thin DB wrapper; stubbing it is cheaper than stubbing the
// select().from().where().orderBy() chain.
vi.mock("@/lib/custom-fields", () => ({
  getActiveFieldDefinitions: vi.fn(),
}))

// Spy on evaluateFormula with REAL behaviour, keeping extractDependencies and
// detectCircularDependency real. A bare stub would hide exactly the class of gap that let the
// Phase 32 H-01 bug through a fully green suite. quickjs-emscripten is deliberately NOT mocked.
vi.mock("@/lib/formula-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/formula-engine")>()
  return { ...actual, evaluateFormula: vi.fn(actual.evaluateFormula) }
})

import { db } from "@/db"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import { evaluateFormula } from "@/lib/formula-engine"
import type {
  CustomFieldDefinition,
  EntityType,
  FieldConfig,
  FieldType,
} from "@/db/schema"
import {
  recalculateFormulas,
  scopeFormulasToChangedFields,
  buildFormulaFieldValues,
  orderFormulaDefinitions,
  stripFormulaKeys,
  ENTITY_NATIVE_ATTRIBUTES,
  NATIVE_ATTRIBUTE_COLUMNS,
  FORMULA_ENTITY_PREFIXES,
  FORMULA_EVAL_MEMORY_LIMIT_BYTES,
  FORMULA_EVAL_TIMEOUT_MS,
  FORMULA_EVALUATION_BUDGET,
  CASCADE_DEPTH,
  CASCADE_CHILD_RELATIONS,
  buildRelatedEntities,
} from "./formula-recalc"

// Added by plan 34-04. Appended as separate statements rather than folded into the block above
// so the plan 34-03 suite stays byte-identical.
import { afterEach } from "vitest"
import { readFileSync } from "node:fs"
import { organizations, people, deals, activities } from "@/db/schema"

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}
const mockGetDefs = getActiveFieldDefinitions as unknown as ReturnType<typeof vi.fn>
const evalSpy = evaluateFormula as unknown as ReturnType<typeof vi.fn>

// --- fixtures ---------------------------------------------------------------------------

function makeDef(
  name: string,
  type: FieldType,
  config: FieldConfig = null,
  entityType: EntityType = "deal",
  position = "10000"
): CustomFieldDefinition {
  return {
    id: `def-${name}`,
    entityType,
    name,
    type,
    config,
    required: false,
    position,
    showInList: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
  }
}

function makeFormulaDef(
  name: string,
  expression: string,
  overrides: Partial<CustomFieldDefinition> = {}
): CustomFieldDefinition {
  return { ...makeDef(name, "formula", { expression }), ...overrides }
}

function makePlainDef(
  name: string,
  type: FieldType = "number",
  overrides: Partial<CustomFieldDefinition> = {}
): CustomFieldDefinition {
  return { ...makeDef(name, type), ...overrides }
}

function dealRow(
  customFields: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "d1",
    title: "Acme expansion",
    value: "1000.00",
    notes: null,
    expectedCloseDate: null,
    customFields,
    ...overrides,
  }
}

const PRICE = makePlainDef("Price", "number")
const COST = makePlainDef("Cost", "number")
const MARGIN = makeFormulaDef("Margin", "{{Price}} - {{Cost}}")
const DOUBLED = makeFormulaDef("Doubled", "{{Margin}} * 2")

// --- update-chain capture ---------------------------------------------------------------

let setFn: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  const whereFn = vi.fn().mockResolvedValue(undefined)
  setFn = vi.fn(() => ({ where: whereFn }))
  mockDb.update.mockReturnValue({ set: setFn })
})

/** The object handed to `.set(...)` on the recalc write. */
function capturedUpdate(): Record<string, unknown> {
  expect(setFn).toHaveBeenCalledTimes(1)
  return setFn.mock.calls[0][0] as Record<string, unknown>
}

function capturedCustomFields(): Record<string, unknown> {
  return capturedUpdate().customFields as Record<string, unknown>
}

function wrapperFor(name: string): { formula: true; value: unknown; error: string | null } {
  return capturedCustomFields()[name] as { formula: true; value: unknown; error: string | null }
}

// =========================================================================================
// Scoping — FORMULA-02 / SC-4. Negative assertions are on the evaluation COUNT, because an
// unnecessary recalculation produces the same final value and is invisible to a value check.
// =========================================================================================

describe("recalculateFormulas — scoping (FORMULA-02 / SC-4)", () => {
  it("evaluates nothing and writes nothing when no formula references the changed field", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN])

    const result = await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["notes"],
      row: dealRow({ Price: 100, Cost: 40 }),
    })

    expect(evalSpy).toHaveBeenCalledTimes(0)
    expect(mockDb.update).toHaveBeenCalledTimes(0)
    expect(result.evaluations).toBe(0)
  })

  it("evaluates nothing when ten unrelated fields change in one bulk save", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: [
        "title",
        "notes",
        "stageId",
        "ownerId",
        "personId",
        "organizationId",
        "expectedCloseDate",
        "position",
        "assigneeId",
        "dueDate",
      ],
      row: dealRow({ Price: 100, Cost: 40 }),
    })

    expect(evalSpy).toHaveBeenCalledTimes(0)
    expect(mockDb.update).toHaveBeenCalledTimes(0)
  })

  it("evaluates nothing when there are no formula-typed definitions at all", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price", "Cost"],
      row: dealRow({ Price: 100, Cost: 40 }),
    })

    expect(evalSpy).toHaveBeenCalledTimes(0)
    expect(mockDb.update).toHaveBeenCalledTimes(0)
  })

  it("evaluates exactly once when the changed field is referenced", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price"],
      row: dealRow({ Price: 100, Cost: 40 }),
    })

    expect(evalSpy).toHaveBeenCalledTimes(1)
    expect(wrapperFor("Margin")).toEqual({ formula: true, value: 60, error: null })
  })

  it("evaluates a formula ONCE when two of its referenced fields changed together", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price", "Cost"],
      row: dealRow({ Price: 100, Cost: 40 }),
    })

    expect(evalSpy).toHaveBeenCalledTimes(1)
  })

  it("evaluates once when the same field is referenced twice (extractDependencies does not dedupe)", async () => {
    // Pitfall 6: extractDependencies('{{Price}}+{{Price}}') returns ['Price','Price'].
    mockGetDefs.mockResolvedValue([PRICE, makeFormulaDef("Twice", "{{Price}} + {{Price}}")])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price"],
      row: dealRow({ Price: 100 }),
    })

    expect(evalSpy).toHaveBeenCalledTimes(1)
    expect(wrapperFor("Twice")).toEqual({ formula: true, value: 200, error: null })
  })

  it("maps a native attribute reference onto its column name in changedFields", async () => {
    mockGetDefs.mockResolvedValue([makeFormulaDef("Doubled", "{{Value}} * 2")])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["value"],
      row: dealRow({}),
    })

    expect(evalSpy).toHaveBeenCalledTimes(1)
    // deal.value is a numeric column, so Drizzle hands back the string "1000.00".
    expect(wrapperFor("Doubled")).toEqual({ formula: true, value: 2000, error: null })
  })

  it("evaluates nothing when a different native column changes", async () => {
    mockGetDefs.mockResolvedValue([makeFormulaDef("Doubled", "{{Value}} * 2")])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["title"],
      row: dealRow({}),
    })

    expect(evalSpy).toHaveBeenCalledTimes(0)
    expect(mockDb.update).toHaveBeenCalledTimes(0)
  })

  it("treats the coarse 'customFields' sentinel as touching every custom-field reference", async () => {
    // The v1 routes push the literal string "customFields" (v1/deals/[id]/route.ts:251).
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["customFields"],
      row: dealRow({ Price: 100, Cost: 40 }),
    })

    expect(evalSpy).toHaveBeenCalledTimes(1)
  })

  it("does not let the 'customFields' sentinel select a purely native-attribute formula", async () => {
    mockGetDefs.mockResolvedValue([makeFormulaDef("Doubled", "{{Value}} * 2")])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["customFields"],
      row: dealRow({}),
    })

    expect(evalSpy).toHaveBeenCalledTimes(0)
  })

  it("selects a cross-entity formula only when changedRelatedFields names the changed ref", async () => {
    mockGetDefs.mockResolvedValue([makeFormulaDef("OrgRev", "{{Organization.Revenue}} * 2")])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: [],
      changedRelatedFields: { Organization: ["Revenue"] },
      relatedEntities: { Organization: { Revenue: 10 } },
      row: dealRow({}),
    })

    expect(evalSpy).toHaveBeenCalledTimes(1)
    expect(wrapperFor("OrgRev")).toEqual({ formula: true, value: 20, error: null })
  })

  it("ignores a cross-entity formula when the related change is on another field", async () => {
    mockGetDefs.mockResolvedValue([makeFormulaDef("OrgRev", "{{Organization.Revenue}} * 2")])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: [],
      changedRelatedFields: { Organization: ["Industry"] },
      relatedEntities: { Organization: { Revenue: 10 } },
      row: dealRow({}),
    })

    expect(evalSpy).toHaveBeenCalledTimes(0)
  })
})

// =========================================================================================
// Seeding — D-14 / Pitfall 1
// =========================================================================================

describe("recalculateFormulas — seeding (D-14)", () => {
  it("stores a blank, not a fabricated 'Unknown field', for a defined but unfilled field", async () => {
    mockGetDefs.mockResolvedValue([
      makePlainDef("Consumo", "number"),
      makeFormulaDef("Dobro", "{{Consumo}} * 2"),
    ])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["customFields"],
      row: dealRow({}), // no Consumo key at all
    })

    expect(wrapperFor("Dobro")).toEqual({ formula: true, value: null, error: null })
    expect(wrapperFor("Dobro").error).toBe(null)
  })

  it("still surfaces a genuine authoring mistake as an Unknown field error", async () => {
    mockGetDefs.mockResolvedValue([PRICE, makeFormulaDef("Bad", "{{Price}} + {{Nope}}")])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price"],
      row: dealRow({ Price: 100 }),
    })

    expect(wrapperFor("Bad").value).toBe(null)
    expect(String(wrapperFor("Bad").error)).toMatch(/Unknown field/)
  })

  it("seeds every definition name with null, exposes native attributes, and unwraps wrappers", () => {
    const values = buildFormulaFieldValues({
      entityType: "deal",
      definitions: [PRICE, COST, MARGIN],
      row: dealRow({ Price: 100, Margin: { formula: true, value: 60, error: null } }),
    })

    expect(values.Cost).toBe(null) // seeded, key absent from the JSONB blob
    expect(values.Price).toBe(100)
    expect(values.Margin).toBe(60) // wrapper unwrapped to its inner value
    expect(values.Value).toBe("1000.00") // native attribute
    expect(values.Notes).toBe(null) // native column that is null
    expect("Nope" in values).toBe(false)
  })
})

// =========================================================================================
// Wrapper unwrap + topological ordering — D-10 / Pitfall 2
// =========================================================================================

describe("recalculateFormulas — chaining and ordering (D-10)", () => {
  it("evaluates a dependent formula after its dependency and uses the fresh value", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN, DOUBLED])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price"],
      row: dealRow({ Price: 100, Cost: 40 }),
    })

    expect(evalSpy).toHaveBeenCalledTimes(2)
    expect(evalSpy.mock.calls[0][0]).toBe("{{Price}} - {{Cost}}")
    expect(evalSpy.mock.calls[1][0]).toBe("{{Margin}} * 2")
    expect(wrapperFor("Margin")).toEqual({ formula: true, value: 60, error: null })
    expect(wrapperFor("Doubled")).toEqual({ formula: true, value: 120, error: null })
  })

  it("unwraps a wrapper stored by a previous save instead of evaluating to a silent blank", async () => {
    mockGetDefs.mockResolvedValue([makePlainDef("Margin", "number"), DOUBLED])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Margin"],
      row: dealRow({ Margin: { formula: true, value: 100, error: null } }),
    })

    expect(wrapperFor("Doubled")).toEqual({ formula: true, value: 200, error: null })
  })

  it("orders by dependency, not by the position column", async () => {
    const doubledFirst = makeFormulaDef("Doubled", "{{Margin}} * 2", { position: "1" })
    const marginSecond = makeFormulaDef("Margin", "{{Price}} - {{Cost}}", { position: "2" })
    mockGetDefs.mockResolvedValue([doubledFirst, marginSecond, PRICE, COST])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price"],
      row: dealRow({ Price: 100, Cost: 40 }),
    })

    expect(evalSpy.mock.calls[0][0]).toBe("{{Price}} - {{Cost}}")
    expect(evalSpy.mock.calls[1][0]).toBe("{{Margin}} * 2")
    expect(wrapperFor("Doubled")).toEqual({ formula: true, value: 120, error: null })
  })

  it(
    "rejects a self-referencing formula without evaluating or recursing",
    async () => {
      mockGetDefs.mockResolvedValue([makeFormulaDef("Loop", "{{Loop}} + 1")])

      const result = await recalculateFormulas({
        entityType: "deal",
        entityId: "d1",
        changedFields: ["customFields"],
        row: dealRow({}),
      })

      expect(evalSpy).toHaveBeenCalledTimes(0)
      expect(result.evaluations).toBe(0)
      expect(wrapperFor("Loop").value).toBe(null)
      expect(String(wrapperFor("Loop").error)).toMatch(/[Cc]ircular/)
    },
    5000
  )

  it(
    "rejects a two-hop cycle for both participants",
    async () => {
      mockGetDefs.mockResolvedValue([
        makeFormulaDef("A", "{{B}} + 1"),
        makeFormulaDef("B", "{{A}} + 1"),
      ])

      await recalculateFormulas({
        entityType: "deal",
        entityId: "d1",
        changedFields: ["customFields"],
        row: dealRow({}),
      })

      expect(evalSpy).toHaveBeenCalledTimes(0)
      expect(String(wrapperFor("A").error)).toMatch(/[Cc]ircular/)
      expect(String(wrapperFor("B").error)).toMatch(/[Cc]ircular/)
    },
    5000
  )

  it("orderFormulaDefinitions returns dependency order and flags cycles", () => {
    const acyclic = orderFormulaDefinitions([DOUBLED, MARGIN])
    expect(acyclic.ordered.map((d) => d.name)).toEqual(["Margin", "Doubled"])
    expect(acyclic.cyclic.size).toBe(0)

    const cyclic = orderFormulaDefinitions([
      makeFormulaDef("A", "{{B}} + 1"),
      makeFormulaDef("B", "{{A}} + 1"),
    ])
    expect(cyclic.ordered).toHaveLength(0)
    expect(cyclic.cyclic.has("A")).toBe(true)
    expect(cyclic.cyclic.has("B")).toBe(true)
  })
})

// =========================================================================================
// Error persistence — D-05 / D-06 / T-34-06
// =========================================================================================

describe("recalculateFormulas — error persistence (D-05/D-06)", () => {
  it("persists the error, resolves without throwing, and stores a null value", async () => {
    mockGetDefs.mockResolvedValue([PRICE, makeFormulaDef("Broken", "MATH.nope({{Price}})")])

    const result = await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price"],
      row: dealRow({ Price: 100 }),
    })

    expect(result.evaluations).toBe(1)
    expect(wrapperFor("Broken").formula).toBe(true)
    expect(wrapperFor("Broken").value).toBe(null)
    expect(typeof wrapperFor("Broken").error).toBe("string")
    expect(String(wrapperFor("Broken").error).length).toBeGreaterThan(0)
  })

  it("sanitises a multi-line or over-long engine message before storing it (T-34-06)", async () => {
    mockGetDefs.mockResolvedValue([PRICE, makeFormulaDef("Broken", "{{Price}} + 1")])
    evalSpy.mockResolvedValueOnce({
      value: null,
      error: `boom ${"x".repeat(400)}\n    at foo (/app/src/x.ts:1:1)\n    at bar`,
    })

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price"],
      row: dealRow({ Price: 100 }),
    })

    const stored = String(wrapperFor("Broken").error)
    expect(stored).not.toContain("\n")
    expect(stored).not.toContain("at foo")
    expect(stored.length).toBeLessThanOrEqual(201)
  })

  it("replaces a previously stored value rather than retaining it (D-06)", async () => {
    mockGetDefs.mockResolvedValue([PRICE, makeFormulaDef("Margin", "MATH.nope({{Price}})")])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price"],
      row: dealRow({ Price: 100, Margin: { formula: true, value: 999, error: null } }),
    })

    expect(wrapperFor("Margin").value).not.toBe(999)
    expect(wrapperFor("Margin").value).toBe(null)
    expect(wrapperFor("Margin").error).toBeTruthy()
  })
})

// =========================================================================================
// Coercion — D-15 / Pitfall 7
// =========================================================================================

describe("recalculateFormulas — multi_select coercion (D-15)", () => {
  it("pins the documented array coercion: ['x'] + 1 yields 'x1'", async () => {
    // D-15: arrays pass through to the sandbox unchanged. CONTEXT.md forbids changing
    // evaluation semantics, so this behaviour is DOCUMENTED and pinned rather than fixed.
    mockGetDefs.mockResolvedValue([
      makePlainDef("Origem", "multi_select"),
      makeFormulaDef("OrigemPlus", "{{Origem}} + 1"),
    ])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Origem"],
      row: dealRow({ Origem: ["Outbound Manual"] }),
    })

    expect(wrapperFor("OrigemPlus")).toEqual({
      formula: true,
      value: "Outbound Manual1",
      error: null,
    })
  })
})

// =========================================================================================
// Persistence and return shape
// =========================================================================================

describe("recalculateFormulas — persistence and return shape", () => {
  it("merges the wrappers onto the existing blob and leaves other keys untouched", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price"],
      row: dealRow({ Price: 100, Cost: 40, "CNPJ / CPF": "23466509000120" }),
    })

    expect(capturedCustomFields()).toEqual({
      Price: 100,
      Cost: 40,
      "CNPJ / CPF": "23466509000120",
      Margin: { formula: true, value: 60, error: null },
    })
  })

  it("returns the merged blob and an evaluation count matching the spy", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN, DOUBLED])

    const result = await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price"],
      row: dealRow({ Price: 100, Cost: 40 }),
    })

    expect(result.customFields).toEqual(capturedCustomFields())
    expect(result.evaluations).toBe(evalSpy.mock.calls.length)
    expect(result.evaluations).toBe(2)
  })

  it("does not bump updatedAt — a derived refresh must not look like a user edit", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price"],
      row: dealRow({ Price: 100, Cost: 40 }),
    })

    expect(capturedUpdate()).not.toHaveProperty("updatedAt")
    expect(Object.keys(capturedUpdate())).toEqual(["customFields"])
  })

  it("returns the row's existing blob unchanged when nothing is in scope", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN])
    const existing = { Price: 100, Cost: 40, Margin: { formula: true, value: 60, error: null } }

    const result = await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["notes"],
      row: dealRow(existing),
    })

    expect(result.customFields).toEqual(existing)
    expect(mockDb.update).toHaveBeenCalledTimes(0)
  })

  it("reads the row from the database when the caller does not supply it", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN])
    mockDb.select.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([dealRow({ Price: 100, Cost: 40 })]) }),
      }),
    })

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price"],
    })

    expect(mockDb.select).toHaveBeenCalledTimes(1)
    expect(wrapperFor("Margin")).toEqual({ formula: true, value: 60, error: null })
  })

  it("does not read the row at all when nothing is in scope", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["notes"],
    })

    expect(mockDb.select).toHaveBeenCalledTimes(0)
    expect(evalSpy).toHaveBeenCalledTimes(0)
  })

  it("memoises definitions through the supplied cache across invocations", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN])
    const definitionsCache = new Map()

    const input = {
      entityType: "deal" as EntityType,
      changedFields: ["Price"],
      row: dealRow({ Price: 100, Cost: 40 }),
      definitionsCache,
    }
    await recalculateFormulas({ ...input, entityId: "d1" })
    await recalculateFormulas({ ...input, entityId: "d2" })

    // Plan 34-04 note: the cascade adds ONE definitions query per child entity type (deal ->
    // activity) so it can test child dot-refs before issuing any child row query. The contract
    // this test guards is unchanged and now asserted more strictly: at most one query per
    // ENTITY TYPE across the whole cascade, never one per invocation and never one per child.
    // Without the shared cache this would be 4.
    expect(mockGetDefs.mock.calls.map((call: unknown[]) => call[0])).toEqual(["deal", "activity"])
  })
})

// =========================================================================================
// Resource limits — T-34-02 / D-18. The bound is INERT unless the 4th argument is passed.
// =========================================================================================

describe("recalculateFormulas — resource bounds (D-18/T-34-02)", () => {
  it("passes the memory and timeout bounds on the first evaluation", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price"],
      row: dealRow({ Price: 100, Cost: 40 }),
    })

    expect(evalSpy.mock.calls[0][3]).toEqual({
      memoryLimitBytes: FORMULA_EVAL_MEMORY_LIMIT_BYTES,
      timeoutMs: FORMULA_EVAL_TIMEOUT_MS,
    })
  })

  it("passes the bounds on EVERY evaluation, not just the first", async () => {
    mockGetDefs.mockResolvedValue([PRICE, COST, MARGIN, DOUBLED])

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["Price"],
      row: dealRow({ Price: 100, Cost: 40 }),
    })

    expect(evalSpy.mock.calls.length).toBeGreaterThan(1)
    for (const call of evalSpy.mock.calls) {
      expect(call[3]).toEqual({
        memoryLimitBytes: FORMULA_EVAL_MEMORY_LIMIT_BYTES,
        timeoutMs: FORMULA_EVAL_TIMEOUT_MS,
      })
    }
  })

  it("pins the bound values themselves", () => {
    expect(FORMULA_EVAL_MEMORY_LIMIT_BYTES).toBe(8 * 1024 * 1024)
    expect(FORMULA_EVAL_TIMEOUT_MS).toBe(500)
  })
})

// =========================================================================================
// Client tampering — T-34-04
// =========================================================================================

describe("stripFormulaKeys (T-34-04)", () => {
  it("removes formula-typed keys and leaves everything else, including unknown keys", () => {
    const input = { Price: 10, Margin: 999, Unknown: "keep", "CNPJ / CPF": "234" }
    const output = stripFormulaKeys(input, [PRICE, MARGIN])

    expect(output).toEqual({ Price: 10, Unknown: "keep", "CNPJ / CPF": "234" })
    expect("Margin" in output).toBe(false)
  })

  it("does not mutate the caller's object", () => {
    const input = { Price: 10, Margin: 999 }
    stripFormulaKeys(input, [PRICE, MARGIN])
    expect(input.Margin).toBe(999)
  })
})

// =========================================================================================
// Vocabulary — D-08 / RESEARCH A3, A4
// =========================================================================================

describe("formula vocabulary (D-08)", () => {
  it("exposes exactly the three full entity-name prefixes and no short alias", () => {
    expect(FORMULA_ENTITY_PREFIXES).toEqual({
      Organization: "organization",
      Person: "person",
      Deal: "deal",
    })
    expect(Object.keys(FORMULA_ENTITY_PREFIXES)).not.toContain("Org")
  })

  it("defines the native attribute map for all four entity types", () => {
    expect(ENTITY_NATIVE_ATTRIBUTES.deal).toEqual({
      Value: "value",
      Title: "title",
      Notes: "notes",
      ExpectedCloseDate: "expectedCloseDate",
    })
    expect(ENTITY_NATIVE_ATTRIBUTES.organization).toEqual({
      Name: "name",
      Website: "website",
      Industry: "industry",
      Notes: "notes",
    })
    expect(ENTITY_NATIVE_ATTRIBUTES.person).toEqual({
      FirstName: "firstName",
      LastName: "lastName",
      Email: "email",
      Phone: "phone",
      Notes: "notes",
    })
    // RESEARCH A4: activities expose none today; this plan fills the gap.
    expect(Object.keys(ENTITY_NATIVE_ATTRIBUTES.activity).sort()).toEqual([
      "CompletedAt",
      "DueDate",
      "Notes",
      "Title",
    ])
  })

  it("derives the attribute-to-column map used by scoping", () => {
    expect(NATIVE_ATTRIBUTE_COLUMNS.Value).toBe("value")
    expect(NATIVE_ATTRIBUTE_COLUMNS.ExpectedCloseDate).toBe("expectedCloseDate")
    expect(NATIVE_ATTRIBUTE_COLUMNS.FirstName).toBe("firstName")
    expect(NATIVE_ATTRIBUTE_COLUMNS.CompletedAt).toBe("completedAt")
  })
})

// =========================================================================================
// scopeFormulasToChangedFields as a unit
// =========================================================================================

describe("scopeFormulasToChangedFields", () => {
  it("returns the in-scope subset plus the full formula set, in position order", () => {
    const { inScope, formulaDefs } = scopeFormulasToChangedFields({
      definitions: [PRICE, COST, MARGIN, DOUBLED],
      changedFields: ["Price"],
    })

    expect(formulaDefs.map((d) => d.name)).toEqual(["Margin", "Doubled"])
    // Doubled is pulled in transitively because it reads Margin (D-10).
    expect(inScope.map((d) => d.name)).toEqual(["Margin", "Doubled"])
  })

  it("ignores a formula definition with an empty expression", () => {
    const { inScope, formulaDefs } = scopeFormulasToChangedFields({
      definitions: [makeFormulaDef("Empty", "")],
      changedFields: ["customFields"],
    })

    expect(formulaDefs).toHaveLength(0)
    expect(inScope).toHaveLength(0)
  })
})

// =========================================================================================
// Cross-entity cascade — D-03 / D-04 / D-09 / D-13 (plan 34-04)
//
// Every negative assertion here is on a QUERY COUNT or an EVALUATION COUNT, never on a value:
// an over-triggered cascade computes the same values and is invisible to a value check
// (FORMULA-02 / SC-4).
// =========================================================================================

describe("cross-entity cascade (D-03/D-04/D-09/D-13)", () => {
  const entityByTable = new Map<unknown, EntityType>([
    [organizations, "organization"],
    [people, "person"],
    [deals, "deal"],
    [activities, "activity"],
  ])

  let queriedTables: EntityType[]
  let rowsByEntity: Partial<Record<EntityType, Record<string, unknown>[]>>
  let defsByEntity: Partial<Record<EntityType, CustomFieldDefinition[]>>
  let updates: Array<{ entity: EntityType | undefined; values: Record<string, unknown> }>
  let selectThrowsFor: EntityType | null
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    queriedTables = []
    rowsByEntity = {}
    defsByEntity = {}
    updates = []
    selectThrowsFor = null

    mockGetDefs.mockImplementation(async (entityType: EntityType) => defsByEntity[entityType] ?? [])

    // A table-aware select stub: the cascade tests must answer "was the DEALS table queried?",
    // not merely "was select called?". `.where(...)` is both awaitable (the cascade's fan-out
    // query) and `.limit()`-able (the parent row read), so one stub serves both shapes.
    mockDb.select.mockImplementation(() => ({
      from: (table: unknown) => {
        const entity = entityByTable.get(table)
        if (entity) queriedTables.push(entity)
        if (entity !== null && entity === selectThrowsFor) throw new Error("connection reset")
        const rows = (entity ? rowsByEntity[entity] : undefined) ?? []
        return {
          where: () =>
            Object.assign(Promise.resolve(rows), { limit: () => Promise.resolve(rows) }),
        }
      },
    }))

    mockDb.update.mockImplementation((table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ entity: entityByTable.get(table), values })
        return { where: () => Promise.resolve(undefined) }
      },
    }))

    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  // --- fixtures ---------------------------------------------------------------------------

  function orgRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: "o1",
      name: "Acme",
      website: null,
      industry: "SaaS",
      notes: null,
      customFields: {},
      ownerId: "u-parent-owner",
      ...overrides,
    }
  }

  function activityRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: "a1",
      title: "Call",
      notes: null,
      dueDate: null,
      completedAt: null,
      customFields: {},
      dealId: "d1",
      ownerId: "u-parent-owner",
      ...overrides,
    }
  }

  /**
   * Minimal child rows. Deliberately small so the 600-row budget fixture stays cheap — the
   * expensive part is QuickJS, not the array.
   */
  function makeChildRows(n: number, overrides: Record<string, unknown> = {}) {
    return Array.from({ length: n }, (_, i) => ({
      id: `c${i}`,
      title: `Child ${i}`,
      value: null,
      notes: null,
      expectedCloseDate: null,
      customFields: {},
      // D-09: children are deliberately owned by somebody other than the acting user.
      ownerId: "u-other-owner",
      ...overrides,
    }))
  }

  function updatedCustomFields(index: number): Record<string, unknown> {
    return updates[index].values.customFields as Record<string, unknown>
  }

  function childWrapper(index: number, name: string) {
    return updatedCustomFields(index)[name] as {
      formula: true
      value: unknown
      error: string | null
    }
  }

  // --- shape ------------------------------------------------------------------------------

  it("exports the budget, the depth limit and exactly the four index-backed directions", () => {
    expect(FORMULA_EVALUATION_BUDGET).toBe(500)
    expect(CASCADE_DEPTH).toBe(1)
    expect(
      CASCADE_CHILD_RELATIONS.map((r) => `${r.parent}->${r.child}:${r.prefix}`)
    ).toEqual([
      "organization->deal:Organization",
      "organization->person:Organization",
      "person->deal:Person",
      "deal->activity:Deal",
    ])
    // An activity is a leaf: it is a child of a deal and never a parent. This is how
    // CASCADE_DEPTH = 1 is enforced structurally rather than by hoping nobody recurses.
    expect(CASCADE_CHILD_RELATIONS.some((r) => r.parent === "activity")).toBe(false)
  })

  // --- negative scoping (FORMULA-02 / SC-4) -----------------------------------------------

  it("issues ZERO child queries when the changed parent field matches no child dot-ref", async () => {
    defsByEntity.organization = [makePlainDef("Revenue", "number")]
    defsByEntity.deal = [makeFormulaDef("OrgLabel", "{{Organization.Name}}")]
    defsByEntity.person = []
    rowsByEntity.deal = makeChildRows(3)

    const result = await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["industry"],
      row: orgRow(),
    })

    expect(queriedTables).toEqual([])
    expect(evalSpy).toHaveBeenCalledTimes(0)
    expect(result.evaluations).toBe(0)
    expect(updates).toEqual([])
  })

  it("issues ZERO child queries when no child entity type has any Organization dot-ref", async () => {
    defsByEntity.organization = []
    defsByEntity.deal = [MARGIN, PRICE, COST]
    defsByEntity.person = [makeFormulaDef("Full", "{{FirstName}}")]
    rowsByEntity.deal = makeChildRows(3)

    await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["name"],
      row: orgRow(),
    })

    expect(queriedTables).toEqual([])
    expect(evalSpy).toHaveBeenCalledTimes(0)
  })

  it("issues ZERO child queries for an activity save — an activity has no child relation", async () => {
    defsByEntity.activity = [makeFormulaDef("Label", "{{Title}}")]
    defsByEntity.deal = [makeFormulaDef("ActLabel", "{{Activity.Title}}")]

    await recalculateFormulas({
      entityType: "activity",
      entityId: "a1",
      changedFields: ["title"],
      row: activityRow(),
    })

    expect(queriedTables).toEqual([])
    // The activity's OWN formula still recalculates — only the cascade is absent.
    expect(evalSpy).toHaveBeenCalledTimes(1)
  })

  it("cascades deal -> activity on a native-attribute change matched through its column", async () => {
    defsByEntity.deal = []
    defsByEntity.activity = [makeFormulaDef("DealLabel", "{{Deal.Title}}")]
    rowsByEntity.activity = [activityRow()]

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["title"],
      row: dealRow({}),
    })

    expect(queriedTables).toEqual(["activity"])
    expect(evalSpy).toHaveBeenCalledTimes(1)
  })

  it("does not cascade deal -> activity when a different native column changes", async () => {
    defsByEntity.deal = []
    defsByEntity.activity = [makeFormulaDef("DealLabel", "{{Deal.Title}}")]
    rowsByEntity.activity = [activityRow()]

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["notes"],
      row: dealRow({}),
    })

    expect(queriedTables).toEqual([])
    expect(evalSpy).toHaveBeenCalledTimes(0)
  })

  // --- positive fan-out -------------------------------------------------------------------

  it("runs exactly one evaluation per child row returned by the reverse lookup", async () => {
    defsByEntity.organization = []
    defsByEntity.person = []
    defsByEntity.deal = [makeFormulaDef("OrgLabel", "{{Organization.Name}}")]
    rowsByEntity.deal = makeChildRows(3)

    const result = await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["name"],
      row: orgRow({ name: "Acme Renamed" }),
    })

    expect(evalSpy).toHaveBeenCalledTimes(3)
    expect(result.evaluations).toBe(3)
    expect(queriedTables).toEqual(["deal"])
    expect(updates.map((u) => u.entity)).toEqual(["deal", "deal", "deal"])
    expect(childWrapper(0, "OrgLabel")).toEqual({
      formula: true,
      value: "Acme Renamed",
      error: null,
    })
    expect(warnSpy).toHaveBeenCalledTimes(0)
  })

  it("hands each child a relatedEntities argument keyed by the full entity name (D-08/D-14)", async () => {
    defsByEntity.organization = [
      makePlainDef("Revenue", "number"),
      makeFormulaDef("Score", "{{Revenue}} - 3"),
      makePlainDef("Unfilled", "number"),
    ]
    defsByEntity.person = []
    defsByEntity.deal = [makeFormulaDef("OrgLabel", "{{Organization.Name}}")]
    rowsByEntity.deal = makeChildRows(1)

    await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["name"],
      row: orgRow({
        name: "Acme Renamed",
        customFields: { Revenue: 10, Score: { formula: true, value: 7, error: null } },
      }),
    })

    const related = evalSpy.mock.calls[0][2] as Record<string, Record<string, unknown>>
    expect(Object.keys(related)).toEqual(["Organization"])
    expect(related.Organization.Name).toBe("Acme Renamed") // native attribute, new value
    expect(related.Organization.Industry).toBe("SaaS")
    expect(related.Organization.Revenue).toBe(10) // parent custom value
    expect(related.Organization.Score).toBe(7) // wrapper unwrapped, not {formula:...}
    expect(related.Organization.Unfilled).toBe(null) // D-14 seeding, not an absent key
    expect("Org" in related).toBe(false) // D-08: no short alias
  })

  it("stores the engine's own error for a parent field that does not exist", async () => {
    defsByEntity.organization = []
    defsByEntity.person = []
    defsByEntity.deal = [
      makeFormulaDef("Bad", "{{Organization.Name}} + {{Organization.Nope}}"),
    ]
    rowsByEntity.deal = makeChildRows(1)

    await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["name"],
      row: orgRow(),
    })

    expect(childWrapper(0, "Bad").value).toBe(null)
    expect(String(childWrapper(0, "Bad").error)).toMatch(/not found on Organization/)
  })

  it("rejects the short `Org.` alias with the engine's Unknown entity error (D-08)", async () => {
    defsByEntity.organization = []
    defsByEntity.person = []
    defsByEntity.deal = [makeFormulaDef("Legacy", "{{Organization.Name}} + {{Org.Name}}")]
    rowsByEntity.deal = makeChildRows(1)

    await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["name"],
      row: orgRow(),
    })

    expect(String(childWrapper(0, "Legacy").error)).toMatch(/Unknown entity: Org/)
  })

  it("resolves a child's own formula chain in topological order inside the cascade", async () => {
    defsByEntity.organization = [makePlainDef("Revenue", "number")]
    defsByEntity.person = []
    defsByEntity.deal = [
      makeFormulaDef("Base", "{{Organization.Revenue}} * 2"),
      makeFormulaDef("Derived", "{{Base}} + 1"),
    ]
    rowsByEntity.deal = makeChildRows(1)

    await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["Revenue"],
      row: orgRow({ customFields: { Revenue: 10 } }),
    })

    expect(evalSpy).toHaveBeenCalledTimes(2)
    expect(evalSpy.mock.calls[0][0]).toBe("{{Organization.Revenue}} * 2")
    expect(evalSpy.mock.calls[1][0]).toBe("{{Base}} + 1")
    expect(childWrapper(0, "Derived")).toEqual({ formula: true, value: 21, error: null })
  })

  it("cascades a parent's freshly recomputed formula value to its children", async () => {
    defsByEntity.organization = [
      makePlainDef("Revenue", "number"),
      makeFormulaDef("Score", "{{Revenue}} * 2"),
    ]
    defsByEntity.person = []
    defsByEntity.deal = [makeFormulaDef("Mirror", "{{Organization.Score}} + 1")]
    rowsByEntity.deal = makeChildRows(1)

    await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["Revenue"],
      row: orgRow({ customFields: { Revenue: 10, Score: { formula: true, value: 0, error: null } } }),
    })

    // Parent Score recomputes to 20, and the child reads the FRESH 20, not the stored 0.
    expect(evalSpy).toHaveBeenCalledTimes(2)
    expect(updates.map((u) => u.entity)).toEqual(["organization", "deal"])
    expect(childWrapper(1, "Mirror")).toEqual({ formula: true, value: 21, error: null })
  })

  it("walks exactly one hop — an organization save never reaches activities (D-13)", async () => {
    defsByEntity.organization = []
    defsByEntity.person = []
    defsByEntity.deal = [makeFormulaDef("OrgLabel", "{{Organization.Name}}")]
    defsByEntity.activity = [makeFormulaDef("DealLabel", "{{Deal.Title}}")]
    rowsByEntity.deal = makeChildRows(2)
    rowsByEntity.activity = [activityRow(), activityRow({ id: "a2" })]

    await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["name"],
      row: orgRow(),
    })

    expect(queriedTables).toEqual(["deal"])
    expect(queriedTables).not.toContain("activity")
    expect(evalSpy).toHaveBeenCalledTimes(2)
    expect(updates.every((u) => u.entity === "deal")).toBe(true)
  })

  // --- ownership (D-09) -------------------------------------------------------------------

  it("recalculates a child owned by somebody else — the cascade ignores ownership (D-09)", async () => {
    defsByEntity.organization = []
    defsByEntity.person = []
    defsByEntity.deal = [makeFormulaDef("OrgLabel", "{{Organization.Name}}")]
    rowsByEntity.deal = makeChildRows(2, { ownerId: "u-somebody-else" })

    await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["name"],
      row: orgRow({ ownerId: "u-acting-user" }),
    })

    expect(updates).toHaveLength(2)
    expect(evalSpy).toHaveBeenCalledTimes(2)
  })

  it("never puts an ownership predicate in the cascade query (D-09, source scan)", () => {
    // The behavioural test above proves a foreign-owned child IS recalculated; this pins the
    // absence of the filter itself, so a future reviewer cannot "fix" the cascade into an
    // access-control query without a red test.
    const source = readFileSync(new URL("./formula-recalc.ts", import.meta.url), "utf8")
    const code = source
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n")

    expect(code).not.toMatch(/ownerId/)
    expect(code).not.toMatch(/owner_id/)
  })

  // --- budget (D-04 / D-13) ---------------------------------------------------------------

  it(
    "caps the cascade at the shared budget and warns exactly once with full diagnostics",
    async () => {
      // 500 REAL QuickJS evaluations at ~1.2 ms on the host is well under two seconds, but the
      // explicit timeout is insurance: plan 34-01 proved a wedged sandbox cannot be interrupted
      // by vitest's default timeout at all.
      defsByEntity.organization = []
      defsByEntity.person = []
      defsByEntity.deal = [makeFormulaDef("OrgLabel", "{{Organization.Name}}")]
      rowsByEntity.deal = makeChildRows(600)

      const result = await recalculateFormulas({
        entityType: "organization",
        entityId: "o1",
        changedFields: ["name"],
        row: orgRow(),
      })

      expect(evalSpy).toHaveBeenCalledTimes(500)
      expect(evalSpy).toHaveBeenCalledTimes(FORMULA_EVALUATION_BUDGET)
      expect(result.evaluations).toBe(500)
      expect(updates).toHaveLength(500)

      expect(warnSpy).toHaveBeenCalledTimes(1)
      const message = String(warnSpy.mock.calls[0][0])
      // Asserted fragment by fragment: a reworded message still passes, a message missing a
      // diagnostic field fails.
      expect(message).toContain("[formula-recalc]")
      expect(message).toContain("organization")
      expect(message).toContain("o1")
      expect(message).toContain("deal")
      expect(message).toContain("600")
      expect(message).toContain("100")
    },
    20000
  )

  it(
    "spends the parent's own evaluations from the same budget and still persists the parent",
    async () => {
      defsByEntity.organization = [
        makePlainDef("Revenue", "number"),
        makeFormulaDef("ScoreA", "{{Revenue}} + 1"),
        makeFormulaDef("ScoreB", "{{Revenue}} + 2"),
      ]
      defsByEntity.person = []
      defsByEntity.deal = [makeFormulaDef("OrgRev", "{{Organization.Revenue}}")]
      rowsByEntity.deal = makeChildRows(600)

      const result = await recalculateFormulas({
        entityType: "organization",
        entityId: "o1",
        changedFields: ["Revenue"],
        row: orgRow({ customFields: { Revenue: 10 } }),
      })

      // 2 parent evaluations + 498 children = 500, never 2 + 500.
      expect(evalSpy).toHaveBeenCalledTimes(500)
      expect(result.evaluations).toBe(500)
      expect(updates[0].entity).toBe("organization") // the parent's save is NOT rolled back
      expect(updates).toHaveLength(499)

      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(String(warnSpy.mock.calls[0][0])).toContain("102") // 600 - 498 skipped
    },
    20000
  )

  it("honours an explicit lower budget supplied by the caller", async () => {
    defsByEntity.organization = []
    defsByEntity.person = []
    defsByEntity.deal = [makeFormulaDef("OrgLabel", "{{Organization.Name}}")]
    rowsByEntity.deal = makeChildRows(10)

    const result = await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["name"],
      row: orgRow(),
      budget: 3,
    })

    expect(evalSpy).toHaveBeenCalledTimes(3)
    expect(result.evaluations).toBe(3)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it("performs zero evaluations and does not throw for a budget of 0", async () => {
    defsByEntity.organization = [
      makePlainDef("Revenue", "number"),
      makeFormulaDef("Score", "{{Revenue}} + 1"),
    ]
    defsByEntity.person = []
    defsByEntity.deal = [makeFormulaDef("OrgRev", "{{Organization.Revenue}}")]
    rowsByEntity.deal = makeChildRows(5)

    const result = await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["Revenue"],
      row: orgRow({ customFields: { Revenue: 10 } }),
      budget: 0,
    })

    expect(evalSpy).toHaveBeenCalledTimes(0)
    expect(result.evaluations).toBe(0)
    expect(queriedTables).toEqual([])
    expect(updates).toEqual([])
  })

  it("treats a negative budget as zero rather than as unlimited", async () => {
    defsByEntity.organization = []
    defsByEntity.person = []
    defsByEntity.deal = [makeFormulaDef("OrgLabel", "{{Organization.Name}}")]
    rowsByEntity.deal = makeChildRows(5)

    const result = await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["name"],
      row: orgRow(),
      budget: -5,
    })

    expect(evalSpy).toHaveBeenCalledTimes(0)
    expect(result.evaluations).toBe(0)
    expect(queriedTables).toEqual([])
  })

  it("skips the cascade entirely when the caller passes cascade: false", async () => {
    defsByEntity.organization = []
    defsByEntity.person = []
    defsByEntity.deal = [makeFormulaDef("OrgLabel", "{{Organization.Name}}")]
    rowsByEntity.deal = makeChildRows(5)

    await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["name"],
      row: orgRow(),
      cascade: false,
    })

    expect(queriedTables).toEqual([])
    expect(evalSpy).toHaveBeenCalledTimes(0)
  })

  // --- resilience -------------------------------------------------------------------------

  it("never fails the parent's save when the child lookup throws", async () => {
    defsByEntity.organization = [
      makePlainDef("Revenue", "number"),
      makeFormulaDef("Score", "{{Revenue}} + 1"),
    ]
    defsByEntity.person = []
    defsByEntity.deal = [makeFormulaDef("OrgRev", "{{Organization.Revenue}}")]
    selectThrowsFor = "deal"

    const result = await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["Revenue"],
      row: orgRow({ customFields: { Revenue: 10 } }),
    })

    expect(result.evaluations).toBe(1)
    expect(updates.map((u) => u.entity)).toEqual(["organization"])
    expect(
      (updates[0].values.customFields as Record<string, unknown>).Score
    ).toEqual({ formula: true, value: 11, error: null })
  })

  // --- D-18: the bound is inert unless passed ----------------------------------------------

  it("passes the resource bounds on EVERY cascaded evaluation (D-18/T-34-02)", async () => {
    defsByEntity.organization = []
    defsByEntity.person = []
    defsByEntity.deal = [makeFormulaDef("OrgLabel", "{{Organization.Name}}")]
    rowsByEntity.deal = makeChildRows(4)

    await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["name"],
      row: orgRow(),
    })

    expect(evalSpy.mock.calls.length).toBe(4)
    for (const call of evalSpy.mock.calls) {
      expect(call[3]).toEqual({
        memoryLimitBytes: FORMULA_EVAL_MEMORY_LIMIT_BYTES,
        timeoutMs: FORMULA_EVAL_TIMEOUT_MS,
      })
    }
  })

  // --- definition memoisation --------------------------------------------------------------

  it("loads child definitions once, not once per child row", async () => {
    defsByEntity.deal = []
    defsByEntity.activity = [makeFormulaDef("DealLabel", "{{Deal.Title}}")]
    rowsByEntity.activity = makeChildRows(5)

    await recalculateFormulas({
      entityType: "deal",
      entityId: "d1",
      changedFields: ["title"],
      row: dealRow({}),
    })

    expect(evalSpy).toHaveBeenCalledTimes(5)
    expect(mockGetDefs.mock.calls.map((call: unknown[]) => call[0])).toEqual(["deal", "activity"])
  })

  it("never queries definitions twice for the same entity type in one cascade", async () => {
    defsByEntity.organization = []
    defsByEntity.person = []
    defsByEntity.deal = [makeFormulaDef("OrgLabel", "{{Organization.Name}}")]
    rowsByEntity.deal = makeChildRows(5)

    await recalculateFormulas({
      entityType: "organization",
      entityId: "o1",
      changedFields: ["name"],
      row: orgRow(),
    })

    const requested = mockGetDefs.mock.calls.map((call: unknown[]) => call[0])
    expect(requested).toEqual([...new Set(requested)])
    expect(requested).toContain("organization")
    expect(requested).toContain("deal")
  })

  // --- buildRelatedEntities as a unit --------------------------------------------------------

  it("buildRelatedEntities keys by the full entity name, seeds nulls and unwraps wrappers", () => {
    const related = buildRelatedEntities({
      parentType: "organization",
      parentRow: {
        id: "o1",
        name: "Acme",
        industry: "SaaS",
        website: null,
        notes: null,
        customFields: { Revenue: 10, Score: { formula: true, value: 7, error: null } },
      },
      parentDefinitions: [
        makePlainDef("Revenue", "number"),
        makeFormulaDef("Score", "{{Revenue}} - 3"),
        makePlainDef("Unfilled", "number"),
      ],
    })

    expect(Object.keys(related)).toEqual(["Organization"])
    expect(related.Organization).toMatchObject({
      Name: "Acme",
      Industry: "SaaS",
      Website: null,
      Revenue: 10,
      Score: 7,
      Unfilled: null,
    })
  })

  it("buildRelatedEntities returns nothing for an entity type with no formula prefix", () => {
    expect(
      buildRelatedEntities({
        parentType: "activity",
        parentRow: { id: "a1", title: "Call", customFields: {} },
        parentDefinitions: [],
      })
    ).toEqual({})
  })
})
