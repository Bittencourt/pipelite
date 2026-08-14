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
} from "./formula-recalc"

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

    expect(mockGetDefs).toHaveBeenCalledTimes(1)
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
