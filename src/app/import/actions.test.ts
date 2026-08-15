import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * The CSV importer's auto-created rows (FORMULA-01, gap closed by plan 34-13).
 *
 * `resolveOrganization` and the inline person auto-create inside `importDeals` insert REAL rows
 * carrying native attributes a formula reads (`name`/`notes`, `firstName`/`lastName`/`email`),
 * and until this plan neither was ever handed to `recalculateImportedRows` — so a formula over
 * those attributes stored nothing on them until the row's next save.
 *
 * Every test here is DB-free: `@/db` is mocked outright. The live database holds ~189k rows of
 * real CRM data and no import is ever run against it.
 */

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "user-1" } })),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("@/db", () => ({
  db: {
    query: {
      organizations: { findMany: vi.fn(async () => []) },
      people: { findMany: vi.fn(async () => []) },
      deals: { findMany: vi.fn(async () => []) },
      stages: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
      pipelines: { findFirst: vi.fn(async () => null) },
      activityTypes: { findMany: vi.fn(async () => []) },
    },
    insert: vi.fn(),
  },
}))

// The T-34-04 strip reads definitions from the database. Identity here: what a file supplied is
// not what this suite is about, and formula-recalc.test.ts covers the strip exhaustively.
vi.mock("@/lib/custom-fields", () => ({
  getActiveFieldDefinitions: vi.fn(async () => []),
}))

vi.mock("@/lib/formula-recalc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/formula-recalc")>()
  return {
    ...actual,
    stripFormulaKeys: vi.fn((values: Record<string, unknown>) => values),
  }
})

/**
 * The batch helper is stubbed, not re-implemented: its budget arithmetic, `cascade: false` and
 * failure isolation are pinned by `src/lib/import/formula-recalc-batch.test.ts`. What these
 * tests assert is WHICH rows the importer hands it and WHAT allowance it passes.
 *
 * Each call reports spending 10 evaluations per row, so the ladder is legible in assertions.
 */
const EVALS_PER_ROW = 10

vi.mock("@/lib/import/formula-recalc-batch", () => ({
  recalculateImportedRows: vi.fn(
    async (input: { rows: unknown[] }) => ({
      recalculated: input.rows.length,
      skipped: 0,
      evaluations: input.rows.length * EVALS_PER_ROW,
    })
  ),
}))

import { db } from "@/db"
import { FORMULA_EVALUATION_BUDGET } from "@/lib/formula-recalc"
import { recalculateImportedRows } from "@/lib/import/formula-recalc-batch"
import { importOrganizations, importPeople, importDeals } from "./actions"

const mockDb = db as unknown as {
  query: {
    organizations: { findMany: ReturnType<typeof vi.fn> }
    people: { findMany: ReturnType<typeof vi.fn> }
    deals: { findMany: ReturnType<typeof vi.fn> }
    stages: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> }
    pipelines: { findFirst: ReturnType<typeof vi.fn> }
    activityTypes: { findMany: ReturnType<typeof vi.fn> }
  }
  insert: ReturnType<typeof vi.fn>
}

const mockRecalc = recalculateImportedRows as unknown as ReturnType<typeof vi.fn>

type RecalcCall = {
  entityType: string
  rows: Array<Record<string, unknown>>
  budget?: number
}

/** The arguments of every `recalculateImportedRows` call, in call order. */
function recalcCalls(): RecalcCall[] {
  return mockRecalc.mock.calls.map((c) => c[0] as RecalcCall)
}

let insertSeq = 0

beforeEach(() => {
  vi.clearAllMocks()
  insertSeq = 0

  mockDb.query.organizations.findMany.mockResolvedValue([])
  mockDb.query.people.findMany.mockResolvedValue([])
  mockDb.query.deals.findMany.mockResolvedValue([])
  mockDb.query.stages.findMany.mockResolvedValue([])
  mockDb.query.activityTypes.findMany.mockResolvedValue([])

  // Every insert echoes back what it was given, with a generated id — the shape `.returning()`
  // hands the importer, and the shape the recalculation needs.
  mockDb.insert.mockImplementation(() => ({
    values: (vals: unknown) => ({
      returning: async () => {
        const arr = Array.isArray(vals) ? vals : [vals]
        return arr.map((v) => ({
          ...(v as Record<string, unknown>),
          id: `row-${++insertSeq}`,
        }))
      },
    }),
  }))

  mockRecalc.mockImplementation(async (input: { rows: unknown[] }) => ({
    recalculated: input.rows.length,
    skipped: 0,
    evaluations: input.rows.length * EVALS_PER_ROW,
  }))
})

// ---------------------------------------------------------------------------
// importPeople — the resolveOrganization auto-create site
// ---------------------------------------------------------------------------

describe("importPeople auto-created organizations", () => {
  it("recalculates the organization it auto-created, not just the imported people", async () => {
    const result = await importPeople([
      { firstName: "Ada", lastName: "Lovelace", organizationName: "Analytical Engines Ltda" },
    ])

    expect(result.success).toBe(true)

    const calls = recalcCalls()
    const orgCall = calls.find((c) => c.entityType === "organization")

    // The gap: before plan 34-13 the importer recalculated only the person batch.
    expect(orgCall).toBeDefined()
    expect(orgCall!.rows).toHaveLength(1)
    expect(orgCall!.rows[0].name).toBe("Analytical Engines Ltda")
    // A real row, with the id the insert returned — not a fabricated placeholder.
    expect(typeof orgCall!.rows[0].id).toBe("string")
    expect(orgCall!.rows[0].notes).toContain("[Imported]")

    // The primary batch is still recalculated.
    expect(calls.some((c) => c.entityType === "person")).toBe(true)
  })

  it("spends the auto-created org from the SAME allowance as the person batch (D-13)", async () => {
    await importPeople([
      { firstName: "Ada", lastName: "Lovelace", organizationName: "Analytical Engines Ltda" },
      { firstName: "Grace", lastName: "Hopper", organizationName: "Compilers SA" },
    ])

    const calls = recalcCalls()
    expect(calls.length).toBeGreaterThanOrEqual(2)

    // One decrementing counter for the whole action: the first call gets the full allowance,
    // every later call gets what the earlier ones left. A fresh budget per call would let a
    // large import multiply the D-13 bound by the number of call sites.
    expect(calls[0].budget).toBe(FORMULA_EVALUATION_BUDGET)
    for (let i = 1; i < calls.length; i++) {
      const spentBefore = calls
        .slice(0, i)
        .reduce((sum, c) => sum + c.rows.length * EVALS_PER_ROW, 0)
      expect(calls[i].budget).toBe(FORMULA_EVALUATION_BUDGET - spentBefore)
    }
  })

  it("recalculates the auto-created parent BEFORE the child batch (D-08/D-10)", async () => {
    await importPeople([
      { firstName: "Ada", lastName: "Lovelace", organizationName: "Analytical Engines Ltda" },
    ])

    const order = recalcCalls().map((c) => c.entityType)
    // Both must be present, or indexOf(-1) would make the ordering assertion vacuous.
    expect(order).toContain("organization")
    expect(order).toContain("person")
    expect(order.indexOf("organization")).toBeLessThan(order.indexOf("person"))
  })

  it("does not recalculate an organization it matched rather than created", async () => {
    mockDb.query.organizations.findMany.mockResolvedValue([
      { id: "org-existing", name: "Analytical Engines Ltda" },
    ])

    await importPeople([
      { firstName: "Ada", lastName: "Lovelace", organizationName: "Analytical Engines Ltda" },
    ])

    const calls = recalcCalls()
    expect(calls.some((c) => c.entityType === "organization")).toBe(false)
    expect(calls.some((c) => c.entityType === "person")).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// importDeals — both auto-create sites at once
// ---------------------------------------------------------------------------

describe("importDeals auto-created organizations and people", () => {
  beforeEach(() => {
    mockDb.query.pipelines.findFirst.mockResolvedValue({ id: "pipe-1" })
    mockDb.query.stages.findFirst.mockResolvedValue({ id: "stage-1", name: "Lead" })
    mockDb.query.stages.findMany.mockResolvedValue([
      { id: "stage-1", name: "Lead", pipeline: { deletedAt: null } },
    ])
  })

  it("recalculates the auto-created person and the auto-created organization", async () => {
    const result = await importDeals([
      {
        title: "Solar rooftop",
        organizationName: "Analytical Engines Ltda",
        personEmail: "ada@example.com",
      },
    ])

    expect(result.success).toBe(true)

    const calls = recalcCalls()

    const orgCall = calls.find((c) => c.entityType === "organization")
    expect(orgCall).toBeDefined()
    expect(orgCall!.rows[0].name).toBe("Analytical Engines Ltda")

    const personCall = calls.find((c) => c.entityType === "person")
    expect(personCall).toBeDefined()
    expect(personCall!.rows).toHaveLength(1)
    expect(personCall!.rows[0].email).toBe("ada@example.com")
    expect(personCall!.rows[0].firstName).toBe("[Imported]")
    expect(typeof personCall!.rows[0].id).toBe("string")

    expect(calls.some((c) => c.entityType === "deal")).toBe(true)
  })

  it("threads ONE decrementing allowance across all three recalculations (D-13)", async () => {
    await importDeals([
      {
        title: "Solar rooftop",
        organizationName: "Analytical Engines Ltda",
        personEmail: "ada@example.com",
      },
      {
        title: "Solar carport",
        organizationName: "Compilers SA",
        personEmail: "grace@example.com",
      },
    ])

    const calls = recalcCalls()
    expect(calls).toHaveLength(3)

    expect(calls[0].budget).toBe(FORMULA_EVALUATION_BUDGET)
    for (let i = 1; i < calls.length; i++) {
      const spentBefore = calls
        .slice(0, i)
        .reduce((sum, c) => sum + c.rows.length * EVALS_PER_ROW, 0)
      expect(calls[i].budget).toBe(FORMULA_EVALUATION_BUDGET - spentBefore)
    }

    // Strictly decreasing — never reset to the full bound part-way through.
    const budgets = calls.map((c) => c.budget!)
    expect(budgets).toEqual([...budgets].sort((a, b) => b - a))
    expect(new Set(budgets).size).toBe(budgets.length)
  })

  it("recalculates both auto-created parents before the deal batch", async () => {
    await importDeals([
      {
        title: "Solar rooftop",
        organizationName: "Analytical Engines Ltda",
        personEmail: "ada@example.com",
      },
    ])

    const order = recalcCalls().map((c) => c.entityType)
    expect(order).toContain("organization")
    expect(order).toContain("person")
    expect(order).toContain("deal")
    expect(order.indexOf("organization")).toBeLessThan(order.indexOf("deal"))
    expect(order.indexOf("person")).toBeLessThan(order.indexOf("deal"))
  })

  it("never passes a cascade option — cascade:false is the batch helper's own guarantee (D-03)", async () => {
    await importDeals([
      {
        title: "Solar rooftop",
        organizationName: "Analytical Engines Ltda",
        personEmail: "ada@example.com",
      },
    ])

    for (const call of recalcCalls()) {
      expect(call).not.toHaveProperty("cascade")
    }
  })
})

// ---------------------------------------------------------------------------
// Regression: the four primary flows still recalculate
// ---------------------------------------------------------------------------

describe("primary import flows", () => {
  it("importOrganizations still recalculates the rows it inserted", async () => {
    const result = await importOrganizations([{ name: "Acme" }, { name: "Globex" }])

    expect(result.success).toBe(true)

    const calls = recalcCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].entityType).toBe("organization")
    expect(calls[0].rows).toHaveLength(2)
    expect(calls[0].budget).toBe(FORMULA_EVALUATION_BUDGET)
  })
})

// ---------------------------------------------------------------------------
// D-18: no second path into the engine
// ---------------------------------------------------------------------------

describe("import actions add no unbounded evaluation path", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/import/actions.ts"),
    "utf8"
  )

  it("never calls evaluateFormula directly", () => {
    // D-18: the engine's resource bound is an opt-in 4th argument, inert unless passed. Every
    // evaluation must keep reaching it through recalculateFormulas, the single call site that
    // passes FORMULA_EVAL_OPTIONS (formula-recalc.ts:697). A call site here would silently
    // reopen T-34-02.
    expect(source).not.toContain("evaluateFormula")
  })

  it("owns no second recalculation mechanism — it delegates to the batch helper", () => {
    expect(source).toContain("recalculateImportedRows")
    expect(source).not.toContain("recalculateFormulas(")
  })
})
