import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { readFileSync } from "node:fs"

// Established mock shape (every DB-touching test file in this repo uses it).
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}))

// `stripFormulaKeys` keeps its REAL behaviour (reimplemented here rather than pulled in with
// `importOriginal`, which would drag the whole recalculation module — and the
// custom-fields <-> formula-recalc import cycle — through an async mock factory). The tests
// assert on the CALL for `recalculateFormulas`, so evaluation behaviour stays in
// formula-recalc.test.ts where it belongs.
vi.mock("@/lib/formula-recalc", () => ({
  recalculateFormulas: vi.fn(async () => ({ customFields: {}, evaluations: 0 })),
  stripFormulaKeys: vi.fn(
    (values: Record<string, unknown>, definitions: { name: string; type: string }[]) => {
      const formulaNames = new Set(
        definitions.filter((d) => d.type === "formula").map((d) => d.name)
      )
      const out: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(values)) {
        if (formulaNames.has(key)) continue
        out[key] = value
      }
      return out
    }
  ),
}))

import { db } from "@/db"
import { recalculateFormulas, stripFormulaKeys } from "@/lib/formula-recalc"
import type { CustomFieldDefinition, EntityType, FieldConfig, FieldType } from "@/db/schema"
import {
  saveFieldValues,
  getFieldValues,
  getFieldsWithValues,
} from "./custom-fields"

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}
const mockRecalc = recalculateFormulas as unknown as ReturnType<typeof vi.fn>
const mockStrip = stripFormulaKeys as unknown as ReturnType<typeof vi.fn>

/* -------------------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------------------- */

function makeDef(
  name: string,
  type: FieldType,
  config: FieldConfig = null,
  entityType: EntityType = "deal"
): CustomFieldDefinition {
  return {
    id: `def-${name}`,
    entityType,
    name,
    type,
    config,
    required: false,
    position: "10000",
    showInList: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
  }
}

const PRICE = makeDef("Price", "number")
const ORIGEM = makeDef("Origem", "multi_select", {
  options: ["Outbound Manual", "Inbound"],
})
const MARGIN = makeDef("Margin", "formula", { expression: "{{Price}} - {{Cost}}" })

const DEFINITIONS: CustomFieldDefinition[] = [PRICE, ORIGEM, MARGIN]

const MARGIN_WRAPPER = { formula: true, value: 60, error: null }

/**
 * The actor `saveFieldValues` attributes its emitted event to.
 *
 * It is a required 4th parameter rather than an ambient value: the emitted payload's `userId`
 * reaches webhook consumers and workflow trigger templates, so every caller has to name the
 * authenticated user it already holds.
 */
const ACTOR_USER_ID = "user-actor-1"

/** The stored pre-image. A fresh object per call so no test can mutate another's fixture. */
function storedBlob(): Record<string, unknown> {
  return {
    Price: 100,
    Origem: ["Outbound Manual"],
    Margin: { ...MARGIN_WRAPPER },
  }
}

/* -------------------------------------------------------------------------------------- *
 * DB harness
 * -------------------------------------------------------------------------------------- */

interface Harness {
  /** The object handed to `db.update(...).set(...)` — the blob actually persisted. */
  setFn: ReturnType<typeof vi.fn>
  updateWhereFn: ReturnType<typeof vi.fn>
  selectFn: ReturnType<typeof vi.fn>
}

/**
 * Wires the two distinct select chains this module issues:
 *   - `getActiveFieldDefinitions`: select().from().where().orderBy()  -> definitions
 *   - `getFieldValues`:            select().from().where().limit()    -> [{ customFields }]
 * They terminate on different methods, so one chain object serves both unambiguously.
 */
function captureUpdate(
  definitions: CustomFieldDefinition[] = DEFINITIONS,
  stored: Record<string, unknown> = storedBlob()
): Harness {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.orderBy = vi.fn(async () => definitions)
  chain.limit = vi.fn(async () => [{ customFields: stored }])

  const selectFn = vi.fn(() => chain)
  mockDb.select.mockImplementation(selectFn)

  const updateWhereFn = vi.fn(async () => undefined)
  const setFn = vi.fn(() => ({ where: updateWhereFn }))
  mockDb.update.mockImplementation(() => ({ set: setFn }))

  return { setFn, updateWhereFn, selectFn }
}

/** The blob handed to `db.update(...).set(...)`. */
function persistedBlob(harness: Harness): Record<string, unknown> {
  const arg = harness.setFn.mock.calls[0]?.[0] as { customFields: Record<string, unknown> }
  return arg.customFields
}

/**
 * The single input object `recalculateFormulas` was called with.
 *
 * Asserts the call happened first, so a missing call surfaces as a readable assertion failure
 * rather than a `Cannot read properties of undefined` from this helper.
 */
function recalcInput(): Record<string, unknown> {
  expect(mockRecalc).toHaveBeenCalled()
  return (mockRecalc.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRecalc.mockResolvedValue({ customFields: {}, evaluations: 0 })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/* -------------------------------------------------------------------------------------- *
 * The pre-image diff — FORMULA-02 / SC-4
 * -------------------------------------------------------------------------------------- */

describe("saveFieldValues — pre-image diff (FORMULA-02 / SC-4)", () => {
  it("posts identical non-formula values -> changedFields is empty, so nothing recalculates", async () => {
    captureUpdate()

    const result = await saveFieldValues("deal", "d1", {
      Price: 100,
      Origem: ["Outbound Manual"],
    }, ACTOR_USER_ID)

    expect(result.success).toBe(true)
    expect(mockRecalc).toHaveBeenCalledTimes(1)
    expect(recalcInput().changedFields).toEqual([])
  })

  it("changes one field -> changedFields lists exactly that field", async () => {
    captureUpdate()

    await saveFieldValues("deal", "d1", { Price: 200, Origem: ["Outbound Manual"] }, ACTOR_USER_ID)

    expect(recalcInput().changedFields).toEqual(["Price"])
  })

  it("removing a stored key counts as a change", async () => {
    captureUpdate()

    await saveFieldValues("deal", "d1", { Price: 100 }, ACTOR_USER_ID)

    expect(recalcInput().changedFields).toEqual(["Origem"])
  })

  it("adding a brand-new key counts as a change", async () => {
    captureUpdate()

    await saveFieldValues("deal", "d1", {
      Price: 100,
      Origem: ["Outbound Manual"],
      Observacao: "novo",
    }, ACTOR_USER_ID)

    expect(recalcInput().changedFields).toEqual(["Observacao"])
  })

  it("compares arrays by content, not by reference (multi_select is the commonest type here)", async () => {
    captureUpdate()

    // A structurally equal but distinct array instance — reference comparison would mark this
    // changed on every single save and silently defeat SC-4 for every multi_select field.
    await saveFieldValues("deal", "d1", { Price: 100, Origem: ["Outbound Manual"] }, ACTOR_USER_ID)

    expect(recalcInput().changedFields).not.toContain("Origem")
    expect(recalcInput().changedFields).toEqual([])
  })

  it("detects a real array content change", async () => {
    captureUpdate()

    await saveFieldValues("deal", "d1", {
      Price: 100,
      Origem: ["Outbound Manual", "Inbound"],
    }, ACTOR_USER_ID)

    expect(recalcInput().changedFields).toEqual(["Origem"])
  })

  it("compares objects deeply and key-order-independently", async () => {
    const stored = { Price: 100, Origem: ["Outbound Manual"], Meta: { a: 1, b: 2 } }
    captureUpdate(DEFINITIONS, stored)

    await saveFieldValues("deal", "d1", {
      Price: 100,
      Origem: ["Outbound Manual"],
      Meta: { b: 2, a: 1 },
    }, ACTOR_USER_ID)

    expect(recalcInput().changedFields).toEqual([])
  })

  it("passes entityType and entityId through verbatim and reuses the loaded definitions", async () => {
    captureUpdate()

    await saveFieldValues("deal", "d1", { Price: 200 }, ACTOR_USER_ID)

    const input = recalcInput()
    expect(input.entityType).toBe("deal")
    expect(input.entityId).toBe("d1")
    const cache = input.definitionsCache as Map<EntityType, CustomFieldDefinition[]>
    expect(cache).toBeInstanceOf(Map)
    expect(cache.get("deal")).toEqual(DEFINITIONS)
  })

  it("omits `row` so the helper re-reads the row it just persisted, native attributes included", async () => {
    captureUpdate()

    await saveFieldValues("deal", "d1", { Price: 200 }, ACTOR_USER_ID)

    // `getFieldValues` selects ONLY `customFields`, so a hand-built `row` here would be missing
    // every native attribute ({{Value}}, {{Title}}, ...) and would fabricate errors on any
    // formula that reads one. One extra primary-key lookup is the cheaper mistake.
    expect(recalcInput().row).toBeUndefined()
  })
})

/* -------------------------------------------------------------------------------------- *
 * Formula-key stripping — T-34-04
 * -------------------------------------------------------------------------------------- */

describe("saveFieldValues — client-posted formula keys are discarded (T-34-04)", () => {
  it("a client-supplied formula value never reaches the database", async () => {
    const harness = captureUpdate()

    await saveFieldValues("deal", "d1", { Price: 100, Margin: 999999 }, ACTOR_USER_ID)

    expect(persistedBlob(harness).Margin).toEqual(MARGIN_WRAPPER)
    expect(persistedBlob(harness).Margin).not.toBe(999999)
  })

  it("poking the formula key cannot force a recalculation", async () => {
    captureUpdate()

    await saveFieldValues("deal", "d1", {
      Price: 100,
      Origem: ["Outbound Manual"],
      Margin: 999999,
    }, ACTOR_USER_ID)

    expect(recalcInput().changedFields).not.toContain("Margin")
    expect(recalcInput().changedFields).toEqual([])
  })

  it("calls stripFormulaKeys with the posted values and the loaded definitions", async () => {
    captureUpdate()

    const values = { Price: 100, Margin: 999999 }
    await saveFieldValues("deal", "d1", values, ACTOR_USER_ID)

    expect(mockStrip).toHaveBeenCalledWith(values, DEFINITIONS)
  })
})

/* -------------------------------------------------------------------------------------- *
 * The wrapper round-trip — T-34-04 / RESEARCH Pitfall 3
 * -------------------------------------------------------------------------------------- */

describe("saveFieldValues — client-held wrappers are stripped on the way back in (T-34-04 / Pitfall 3)", () => {
  // Once the client merges the server's `values` into `localValues` (plan 44-07), its NEXT save
  // posts full `{formula:true,…}` wrapper OBJECTS back, not the scalars the block above covers.
  // The correct expectation is that wrappers ARE present in the POST and are stripped
  // server-side — asserting the client never sends them would be wrong by design.
  const POSTED_WRAPPER = { formula: true, value: 999999, error: null }

  it("a posted formula WRAPPER never overwrites the stored one", async () => {
    const harness = captureUpdate()

    await saveFieldValues("deal", "d1", {
      Price: 100,
      Origem: ["Outbound Manual"],
      Margin: { ...POSTED_WRAPPER },
    }, ACTOR_USER_ID)

    expect(persistedBlob(harness).Margin).toEqual(MARGIN_WRAPPER)
    expect((persistedBlob(harness).Margin as { value: number }).value).toBe(60)
  })

  it("strips the wrapper with the posted values and the loaded definitions, before the write", async () => {
    const harness = captureUpdate()

    const values = { Price: 100, Margin: { ...POSTED_WRAPPER } }
    await saveFieldValues("deal", "d1", values, ACTOR_USER_ID)

    expect(mockStrip).toHaveBeenCalledWith(values, DEFINITIONS)
    expect(mockStrip.mock.invocationCallOrder[0]).toBeLessThan(
      harness.setFn.mock.invocationCallOrder[0]
    )
  })

  it("a non-formula key posted alongside the wrapper is written normally — stripping does not over-reach", async () => {
    const harness = captureUpdate()

    await saveFieldValues("deal", "d1", {
      Price: 250,
      Origem: ["Inbound"],
      Margin: { ...POSTED_WRAPPER },
    }, ACTOR_USER_ID)

    expect(persistedBlob(harness).Price).toBe(250)
    expect(persistedBlob(harness).Origem).toEqual(["Inbound"])
  })

  it("posting a wrapper cannot force a recalculation", async () => {
    captureUpdate()

    await saveFieldValues("deal", "d1", {
      Price: 100,
      Origem: ["Outbound Manual"],
      Margin: { ...POSTED_WRAPPER },
    }, ACTOR_USER_ID)

    expect(recalcInput().changedFields).not.toContain("Margin")
    expect(recalcInput().changedFields).toEqual([])
  })
})

/* -------------------------------------------------------------------------------------- *
 * Carry-over — D-06 / T-34-20
 * -------------------------------------------------------------------------------------- */

describe("saveFieldValues — stored formula values survive the whole-blob replacement (D-06)", () => {
  it("a post that omits the formula key still persists the stored wrapper", async () => {
    const harness = captureUpdate()

    await saveFieldValues("deal", "d1", { Price: 100, Origem: ["Outbound Manual"] }, ACTOR_USER_ID)

    expect(persistedBlob(harness).Margin).toEqual(MARGIN_WRAPPER)
  })

  it("a post that omits a NON-formula key removes it — the UI blob stays authoritative", async () => {
    const harness = captureUpdate()

    await saveFieldValues("deal", "d1", { Price: 100 }, ACTOR_USER_ID)

    expect(persistedBlob(harness)).not.toHaveProperty("Origem")
    expect(persistedBlob(harness).Price).toBe(100)
    expect(persistedBlob(harness).Margin).toEqual(MARGIN_WRAPPER)
  })
})

/* -------------------------------------------------------------------------------------- *
 * Ordering, failure isolation and validation
 * -------------------------------------------------------------------------------------- */

describe("saveFieldValues — ordering and failure isolation", () => {
  it("persists BEFORE recalculating, so the helper reads a written row", async () => {
    const harness = captureUpdate()

    await saveFieldValues("deal", "d1", { Price: 200 }, ACTOR_USER_ID)

    expect(harness.updateWhereFn).toHaveBeenCalledTimes(1)
    expect(mockRecalc).toHaveBeenCalledTimes(1)
    expect(harness.updateWhereFn.mock.invocationCallOrder[0]).toBeLessThan(
      mockRecalc.mock.invocationCallOrder[0]
    )
  })

  it("still bumps updatedAt — this is a genuine user edit, unlike the recalc's own write", async () => {
    const harness = captureUpdate()

    await saveFieldValues("deal", "d1", { Price: 200 }, ACTOR_USER_ID)

    expect(harness.setFn.mock.calls[0][0]).toHaveProperty("updatedAt")
    expect((harness.setFn.mock.calls[0][0] as { updatedAt: unknown }).updatedAt).toBeInstanceOf(
      Date
    )
  })

  it("a rejecting recalculation still returns success and logs with a [formula-recalc] prefix (D-05)", async () => {
    captureUpdate()
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    mockRecalc.mockRejectedValueOnce(new Error("boom"))

    const result = await saveFieldValues("deal", "d1", { Price: 200 }, ACTOR_USER_ID)

    expect(result.success).toBe(true)
    expect(errorSpy).toHaveBeenCalled()
    expect(String(errorSpy.mock.calls[0][0])).toContain("[formula-recalc]")
  })

  it("a validation failure short-circuits: no write, no recalculation", async () => {
    const harness = captureUpdate()

    const result = await saveFieldValues("deal", "d1", { Origem: ["Nao Existe"] }, ACTOR_USER_ID)

    expect(result.success).toBe(false)
    expect(result.error).toContain("Origem")
    expect(harness.setFn).not.toHaveBeenCalled()
    expect(mockRecalc).toHaveBeenCalledTimes(0)
  })
})

/* -------------------------------------------------------------------------------------- *
 * The post-recalculation payload — CFUI-02
 * -------------------------------------------------------------------------------------- */

describe("saveFieldValues — returns the recomputed blob (CFUI-02)", () => {
  it("resolves with exactly the customFields recalculateFormulas just computed", async () => {
    captureUpdate()
    const recomputed = {
      Price: 100,
      Margin: { formula: true, value: 40, error: null },
    }
    mockRecalc.mockResolvedValueOnce({ customFields: recomputed, evaluations: 1 })

    const result = await saveFieldValues("deal", "d1", {
      Price: 100,
      Origem: ["Outbound Manual"],
    }, ACTOR_USER_ID)

    // The client's `localValues` can only stop being stale if the server hands back what it
    // just derived. `next` is pre-recalculation, so the recalculated blob is the one to return.
    expect(result.values).toEqual(recomputed)
    expect(result.values).toBe(recomputed)
  })

  it("preserves the { success: true } shape — `values` is additive, not a replacement", async () => {
    captureUpdate()
    mockRecalc.mockResolvedValueOnce({
      customFields: { Price: 100, Margin: { formula: true, value: 40, error: null } },
      evaluations: 1,
    })

    const result = await saveFieldValues("deal", "d1", { Price: 100 }, ACTOR_USER_ID)

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it("D-05: a rejecting recalculation still succeeds, with `values` falling back to the written blob", async () => {
    const harness = captureUpdate()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockRecalc.mockRejectedValueOnce(new Error("boom"))

    const result = await saveFieldValues("deal", "d1", {
      Price: 200,
      Origem: ["Outbound Manual"],
    }, ACTOR_USER_ID)

    // A broken admin-authored formula must never block a user's edit, and must never leave the
    // client with `undefined` to merge either — the written blob is the honest fallback.
    expect(result.success).toBe(true)
    expect(result.values).toBeDefined()
    expect(result.values).toEqual(persistedBlob(harness))
    expect(result.values).toEqual({
      Price: 200,
      Origem: ["Outbound Manual"],
      Margin: MARGIN_WRAPPER,
    })
  })

  it("D-05 fallback keeps the carried-over stored wrapper, so the client never loses the derived value", async () => {
    captureUpdate()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockRecalc.mockRejectedValueOnce(new Error("boom"))

    const result = await saveFieldValues("deal", "d1", { Price: 200 }, ACTOR_USER_ID)

    expect(result.values?.Margin).toEqual(MARGIN_WRAPPER)
  })

  it("a validation failure resolves with no `values` key and no write", async () => {
    const harness = captureUpdate()

    const result = await saveFieldValues("deal", "d1", { Origem: ["Nao Existe"] }, ACTOR_USER_ID)

    expect(result.success).toBe(false)
    expect(result.error).toContain("Origem")
    expect(result.values).toBeUndefined()
    expect(harness.setFn).not.toHaveBeenCalled()
    expect(mockRecalc).toHaveBeenCalledTimes(0)
  })

  it("returning the blob does not reorder the write — update still precedes the recalculation", async () => {
    const harness = captureUpdate()
    mockRecalc.mockResolvedValueOnce({ customFields: { Price: 200 }, evaluations: 1 })

    await saveFieldValues("deal", "d1", { Price: 200 }, ACTOR_USER_ID)

    expect(harness.updateWhereFn.mock.invocationCallOrder[0]).toBeLessThan(
      mockRecalc.mock.invocationCallOrder[0]
    )
  })
})

/* -------------------------------------------------------------------------------------- *
 * Unchanged neighbours + the D-18 delegation guard
 * -------------------------------------------------------------------------------------- */

describe("custom-fields module — unchanged behaviour", () => {
  it("getFieldValues returns the stored blob", async () => {
    captureUpdate()

    await expect(getFieldValues("deal", "d1")).resolves.toEqual(storedBlob())
  })

  it("getFieldValues returns {} when the row has no blob", async () => {
    captureUpdate(DEFINITIONS, null as unknown as Record<string, unknown>)

    await expect(getFieldValues("deal", "d1")).resolves.toEqual({})
  })

  it("getFieldsWithValues joins definitions to values, nulling the absent ones", async () => {
    captureUpdate(DEFINITIONS, { Price: 100 })

    const rows = await getFieldsWithValues("deal", "d1")

    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.name)).toEqual(["Price", "Origem", "Margin"])
    expect(rows[0].value).toBe(100)
    expect(rows[1].value).toBeNull()
  })

  it("D-18: reaches the sandbox only through recalculateFormulas, never evaluateFormula directly", async () => {
    const source = readFileSync("src/lib/custom-fields.ts", "utf8")

    // The resource bound is an opt-in 4th argument and is inert unless passed. This module must
    // therefore never call the engine itself — recalculateFormulas owns that, with the bound.
    expect(source).not.toMatch(/evaluateFormula/)
    expect(source).not.toMatch(/formula-engine/)
    expect(source).toMatch(/recalculateFormulas/)
    expect(source).toMatch(/stripFormulaKeys/)
  })
})
