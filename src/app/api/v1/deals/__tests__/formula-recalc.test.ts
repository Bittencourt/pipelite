/**
 * Recalc-before-emit for the three v1 deal write routes (D-02 / D-17, RESEARCH inventory rows
 * #5, #6, #13a).
 *
 * These three routes bypass the mutation layer entirely — each performs its own
 * `db.insert`/`db.update` and emits on `crmBus` directly — so plans 34-06/34-07 do NOT cover
 * them transitively. They need their own wiring, and this file is the proof.
 *
 * The webhook body (`events/subscribers/webhook.ts`) and the workflow-trigger envelope
 * (`triggers/matcher.ts`) are emit-time SNAPSHOTS of the row object; neither re-reads. So a test
 * asserting only on what was persisted would pass under BOTH orderings. Every assertion here is
 * therefore on the EMITTED payload plus an explicit `invocationCallOrder` comparison.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
// Type-only: erased at runtime, so it does not resurrect the mocked module below.
import type { ApiAuthContext } from "@/lib/api/auth"

/** Mirrors the real `withApiAuth` handler contract in src/lib/api/auth.ts. */
type ApiRouteHandler = (
  request: NextRequest,
  context: ApiAuthContext
) => Promise<NextResponse>

vi.mock("@/db", () => ({
  db: {
    query: {
      deals: { findFirst: vi.fn() },
      stages: { findFirst: vi.fn(), findMany: vi.fn() },
      organizations: { findFirst: vi.fn(), findMany: vi.fn() },
      people: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}))

// Auth: auto-approve, pass the NextRequest straight through.
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((req: NextRequest, handler: ApiRouteHandler) =>
    handler(req, { userId: "user-1", keyId: "key-1" })
  ),
}))

vi.mock("@/lib/events", () => ({
  crmBus: { emit: vi.fn() },
}))

vi.mock("@/lib/custom-fields", () => ({
  getActiveFieldDefinitions: vi.fn(),
}))

/**
 * `importOriginal` keeps ENTITY_NATIVE_ATTRIBUTES and FORMULA_EVALUATION_BUDGET REAL, so a drift
 * between the route's changed-field list and the shared map cannot pass silently, and the budget
 * assertion below is pinned to the real constant rather than a fixture (plan 34-07's precedent).
 */
vi.mock("@/lib/formula-recalc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/formula-recalc")>()
  return {
    ...actual,
    recalculateFormulas: vi.fn(),
    stripFormulaKeys: vi.fn(),
  }
})

import { db } from "@/db"
import { crmBus } from "@/lib/events"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import {
  recalculateFormulas,
  stripFormulaKeys,
  ENTITY_NATIVE_ATTRIBUTES,
  FORMULA_EVALUATION_BUDGET,
} from "@/lib/formula-recalc"
import { POST } from "@/app/api/v1/deals/route"
import { PUT } from "@/app/api/v1/deals/[id]/route"
import { POST as BATCH_POST } from "@/app/api/v1/deals/batch/route"

const mockDb = db as unknown as {
  query: {
    deals: { findFirst: ReturnType<typeof vi.fn> }
    stages: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
    organizations: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
    people: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
  }
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

const mockEmit = vi.mocked(crmBus.emit)
const mockRecalc = vi.mocked(recalculateFormulas)
const mockStrip = vi.mocked(stripFormulaKeys)
const mockGetDefs = vi.mocked(getActiveFieldDefinitions)

/* ------------------------------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------------------------------ */

/** `Margin` is formula-typed, so `stripFormulaKeys` must drop a caller-supplied `Margin`. */
const DEFINITIONS = [
  { id: "d1", entityType: "deal", name: "Origem", type: "multi_select", config: null },
  {
    id: "d2",
    entityType: "deal",
    name: "Margin",
    type: "formula",
    config: { expression: "{{Value}} * 1.035" },
  },
] as unknown as Awaited<ReturnType<typeof getActiveFieldDefinitions>>

/** What the row holds BEFORE recalculation. */
const STORED_CUSTOM_FIELDS: Record<string, unknown> = { Origem: ["Inbound"] }

/**
 * What the mocked helper resolves with — deliberately NOT equal to `STORED_CUSTOM_FIELDS`, so an
 * implementation that emitted the pre-recalc blob could not pass by accident.
 */
const RECALC_RESULT: Record<string, unknown> = {
  Origem: ["Inbound"],
  Margin: { formula: true, value: 1035, error: null },
}

const EVALUATIONS_PER_ROW = 7

const dealRow = {
  id: "deal-1",
  title: "Acme renewal",
  value: "1000",
  stageId: "stage-1",
  organizationId: null,
  personId: null,
  ownerId: "user-1",
  position: "10000",
  expectedCloseDate: null,
  notes: null,
  customFields: STORED_CUSTOM_FIELDS,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
}

const secondDealRow = { ...dealRow, id: "deal-2", title: "Globex renewal", position: "20000" }

const ownedStage = { id: "stage-1", pipeline: { id: "pipe-1", ownerId: "user-1" } }
const otherStage = { id: "stage-2", pipeline: { id: "pipe-1", ownerId: "user-1" } }

/* ------------------------------------------------------------------------------------------ *
 * DB chain stubs
 * ------------------------------------------------------------------------------------------ */

let insertedValues: unknown
let updatedValues: Record<string, unknown> | undefined

function stubInsert(rows: unknown[]) {
  mockDb.insert.mockReturnValue({
    values: vi.fn((v: unknown) => {
      insertedValues = v
      return { returning: vi.fn().mockResolvedValue(rows) }
    }),
  })
}

function stubUpdate(rows: unknown[]) {
  mockDb.update.mockReturnValue({
    set: vi.fn((v: Record<string, unknown>) => {
      updatedValues = v
      return {
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }),
      }
    }),
  })
}

/** `POST /api/v1/deals` reads `max(position)` before inserting. */
function stubMaxPosition() {
  mockDb.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ maxPosition: null }]),
    }),
  })
}

/* ------------------------------------------------------------------------------------------ *
 * Request helpers
 * ------------------------------------------------------------------------------------------ */

function postRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/deals", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function putRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/deals/deal-1", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function batchRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/deals/batch", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const putParams = { params: Promise.resolve({ id: "deal-1" }) }

/* ------------------------------------------------------------------------------------------ *
 * Assertion helpers
 * ------------------------------------------------------------------------------------------ */

function recalcInput(index = 0) {
  return mockRecalc.mock.calls[index][0]
}

function emittedEvent(index = 0): string {
  return mockEmit.mock.calls[index][0] as unknown as string
}

function emittedPayload(index = 0) {
  return mockEmit.mock.calls[index][1] as unknown as {
    data: Record<string, unknown>
    changedFields: string[] | null
  }
}

/** D-17: recalc must have been invoked before the emit at `emitIndex`. */
function expectRecalcBeforeEmit(recalcIndex: number, emitIndex: number) {
  expect(mockRecalc.mock.invocationCallOrder[recalcIndex]).toBeLessThan(
    mockEmit.mock.invocationCallOrder[emitIndex]
  )
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  insertedValues = undefined
  updatedValues = undefined

  mockGetDefs.mockResolvedValue(DEFINITIONS)
  // The real strip drops formula-typed keys; `Margin` is the only one in DEFINITIONS.
  mockStrip.mockImplementation((values: Record<string, unknown>) => {
    const out = { ...values }
    delete out.Margin
    return out
  })
  mockRecalc.mockResolvedValue({
    customFields: RECALC_RESULT,
    evaluations: EVALUATIONS_PER_ROW,
  })

  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

/* ============================================================================================ *
 * POST /api/v1/deals — RESEARCH inventory row #5
 * ============================================================================================ */

describe("POST /api/v1/deals — recalculates before emitting", () => {
  beforeEach(() => {
    mockDb.query.stages.findFirst.mockResolvedValue(ownedStage)
    stubMaxPosition()
    stubInsert([dealRow])
  })

  it("recalculates exactly once, for the inserted deal, BEFORE crmBus.emit", async () => {
    const response = await POST(postRequest({ title: "Acme renewal", stage_id: "stage-1" }))

    expect(response.status).toBe(201)
    expect(mockRecalc).toHaveBeenCalledTimes(1)
    expect(recalcInput()).toMatchObject({ entityType: "deal", entityId: "deal-1" })
    // The row from `.returning()` is handed over, so the helper never re-reads it.
    expect(recalcInput().row).toMatchObject({ id: "deal-1", title: "Acme renewal" })

    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(emittedEvent()).toBe("deal.created")
    expectRecalcBeforeEmit(0, 0)
  })

  it("emits the post-recalc blob under the snake_case custom_fields key (serializeDeal)", async () => {
    await POST(postRequest({ title: "Acme renewal", stage_id: "stage-1" }))

    // This route emits `serializeDeal(deal)`, so the payload spells it snake_case. Do NOT
    // "harmonise" that with the mutation layer's camelCase — T-34-23, existing consumers.
    expect(emittedPayload().data.custom_fields).toEqual(RECALC_RESULT)
    expect(emittedPayload().data.custom_fields).not.toEqual(STORED_CUSTOM_FIELDS)
    expect(emittedPayload().data.customFields).toBeUndefined()
  })

  it("recalculates even when the request carries NO custom_fields", async () => {
    await POST(postRequest({ title: "Acme renewal", stage_id: "stage-1", value: 1000 }))

    // A create writes every native attribute, so a formula over {{Value}} or {{Title}} must run.
    expect(mockRecalc).toHaveBeenCalledTimes(1)
    expect(recalcInput().changedFields).toEqual(
      expect.arrayContaining(Object.values(ENTITY_NATIVE_ATTRIBUTES.deal))
    )
  })

  it("strips caller-supplied formula keys before they reach the insert (T-34-04)", async () => {
    await POST(
      postRequest({
        title: "Acme renewal",
        stage_id: "stage-1",
        custom_fields: { Origem: ["Inbound"], Margin: 999999 },
      })
    )

    expect(mockStrip).toHaveBeenCalledWith(
      { Origem: ["Inbound"], Margin: 999999 },
      DEFINITIONS
    )
    expect((insertedValues as { customFields: Record<string, unknown> }).customFields).toEqual({
      Origem: ["Inbound"],
    })
  })

  it("scopes the recalc to the native columns PLUS the precise custom-field key names", async () => {
    await POST(
      postRequest({
        title: "Acme renewal",
        stage_id: "stage-1",
        custom_fields: { Origem: ["Inbound"], Margin: 999999 },
      })
    )

    const changed = recalcInput().changedFields
    expect(changed).toContain("Origem")
    expect(changed).toEqual(expect.arrayContaining(Object.values(ENTITY_NATIVE_ATTRIBUTES.deal)))
    // A key the server just stripped was never written, so it did not change.
    expect(changed).not.toContain("Margin")
  })

  it("still returns 201 and still emits when the recalc rejects (D-05 / T-34-17)", async () => {
    mockRecalc.mockRejectedValueOnce(new Error("quickjs exploded"))

    const response = await POST(postRequest({ title: "Acme renewal", stage_id: "stage-1" }))

    expect(response.status).toBe(201)
    expect(mockEmit).toHaveBeenCalledTimes(1)
    // The pre-recalc blob is emitted so the payload still describes the row as it stands.
    expect(emittedPayload().data.custom_fields).toEqual(STORED_CUSTOM_FIELDS)
    expect(errorSpy).toHaveBeenCalled()
    expect(String(errorSpy.mock.calls[0][0])).toContain("[formula-recalc]")
  })

  it("leaves the 201 body pre-recalc — backlog 999.23, deferred for all four entities", async () => {
    const response = await POST(postRequest({ title: "Acme renewal", stage_id: "stage-1" }))
    const body = await response.json()

    // Documented, not accidental: the stored row and the emitted event are both correct, and a
    // subsequent GET is correct (SC-1). Changing the create response is 999.23's job, so that
    // one decision covers organizations, people, deals and activities together.
    expect(body.data.custom_fields).toEqual(STORED_CUSTOM_FIELDS)
  })
})

/* ============================================================================================ *
 * PUT /api/v1/deals/[id] — RESEARCH inventory row #6
 * ============================================================================================ */

describe("PUT /api/v1/deals/:id — recalculates before emitting", () => {
  beforeEach(() => {
    mockDb.query.deals.findFirst.mockResolvedValue(dealRow)
    mockDb.query.stages.findFirst.mockResolvedValue(otherStage)
    stubUpdate([{ ...dealRow, notes: "touched" }])
  })

  it("recalculates once, before the emit, and the event carries the post-recalc value", async () => {
    const response = await PUT(putRequest({ notes: "touched" }), putParams)

    expect(response.status).toBe(200)
    expect(mockRecalc).toHaveBeenCalledTimes(1)
    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(emittedEvent()).toBe("deal.updated")
    expectRecalcBeforeEmit(0, 0)

    // This route emits the RAW camelCase row (see the comment at route.ts) — unlike POST.
    expect(emittedPayload().data.customFields).toEqual(RECALC_RESULT)
    expect(emittedPayload().data.customFields).not.toEqual(STORED_CUSTOM_FIELDS)
  })

  it("passes precise custom_fields key names to the recalc while the EVENT keeps the coarse sentinel", async () => {
    await PUT(putRequest({ custom_fields: { Origem: ["Outbound"], Margin: 999999 } }), putParams)

    // FORMULA-02 / SC-4: the recalc gets the precise names...
    expect(recalcInput().changedFields).toContain("Origem")
    // ...and the sentinel the routes already push, which the helper accepts as a safety net.
    expect(recalcInput().changedFields).toContain("customFields")

    // ...while the emitted changedFields is UNCHANGED: webhook consumers may depend on it.
    expect(emittedPayload().changedFields).toEqual(["customFields"])
    expect(emittedPayload().changedFields).not.toContain("Origem")
  })

  it("passes changedFields exactly ['notes'] when only notes changed (SC-4)", async () => {
    await PUT(putRequest({ notes: "touched" }), putParams)

    // No formula references {{Notes}} in this fixture, so the real helper would evaluate
    // nothing. The helper is mocked here, so the argument SHAPE is what is pinned.
    expect(recalcInput().changedFields).toEqual(["notes"])
  })

  it("strips caller-supplied formula keys before the merge (T-34-04)", async () => {
    await PUT(putRequest({ custom_fields: { Origem: ["Outbound"], Margin: 999999 } }), putParams)

    expect(mockStrip).toHaveBeenCalledWith(
      { Origem: ["Outbound"], Margin: 999999 },
      DEFINITIONS
    )
    // The merge writes the stripped object over the existing blob — never the raw one.
    expect(updatedValues?.customFields).toEqual({ Origem: ["Outbound"] })
  })

  it("recalculates ONCE on a stage change and both emitted payloads carry the post-recalc value", async () => {
    stubUpdate([{ ...dealRow, stageId: "stage-2" }])

    await PUT(putRequest({ stage_id: "stage-2" }), putParams)

    expect(mockRecalc).toHaveBeenCalledTimes(1)
    expect(mockEmit).toHaveBeenCalledTimes(2)
    expect(emittedEvent(0)).toBe("deal.stage_changed")
    expect(emittedEvent(1)).toBe("deal.updated")

    // The recalc precedes BOTH emits, not merely the first.
    expectRecalcBeforeEmit(0, 0)
    expectRecalcBeforeEmit(0, 1)

    expect(emittedPayload(0).data.customFields).toEqual(RECALC_RESULT)
    expect(emittedPayload(1).data.customFields).toEqual(RECALC_RESULT)
  })

  it("responds with the post-recalc value — a PUT has no 999.23 gap", async () => {
    const response = await PUT(putRequest({ notes: "touched" }), putParams)
    const body = await response.json()

    // Matches PUT /api/v1/activities/[id] (plan 34-06) and PUT /api/v1/organizations/[id]
    // (plan 34-07): the caller's own response agrees with the row a subsequent GET returns.
    expect(body.data.custom_fields).toEqual(RECALC_RESULT)
  })

  it("still returns 200 and still emits when the recalc rejects (D-05 / T-34-17)", async () => {
    mockRecalc.mockRejectedValueOnce(new Error("quickjs exploded"))

    const response = await PUT(putRequest({ notes: "touched" }), putParams)

    expect(response.status).toBe(200)
    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(emittedPayload().data.customFields).toEqual(STORED_CUSTOM_FIELDS)
    expect(errorSpy).toHaveBeenCalled()
    expect(String(errorSpy.mock.calls[0][0])).toContain("[formula-recalc]")
  })
})

/* ============================================================================================ *
 * POST /api/v1/deals/batch — RESEARCH inventory row #13a
 * ============================================================================================ */

describe("POST /api/v1/deals/batch — one shared budget across the whole request", () => {
  const items = [
    { title: "Acme renewal", stage_id: "stage-1" },
    { title: "Globex renewal", stage_id: "stage-1" },
  ]

  beforeEach(() => {
    mockDb.query.stages.findMany.mockResolvedValue([ownedStage])
    stubInsert([dealRow, secondDealRow])
  })

  it("recalculates once per inserted row, each BEFORE that row's own emit", async () => {
    const response = await BATCH_POST(batchRequest(items))

    expect(response.status).toBe(200)
    expect(mockRecalc).toHaveBeenCalledTimes(2)
    expect(mockEmit).toHaveBeenCalledTimes(2)
    expect(recalcInput(0).entityId).toBe("deal-1")
    expect(recalcInput(1).entityId).toBe("deal-2")

    expectRecalcBeforeEmit(0, 0)
    expectRecalcBeforeEmit(1, 1)
  })

  it("threads ONE decreasing evaluation budget across the batch (D-13 / T-34-03)", async () => {
    await BATCH_POST(batchRequest(items))

    const first = recalcInput(0).budget
    const second = recalcInput(1).budget

    // Without this, 100 rows x a fresh 500-evaluation allowance = 50,000 evaluations in ONE
    // request — precisely the amplification D-04 exists to prevent.
    expect(first).toBe(FORMULA_EVALUATION_BUDGET)
    expect(second).toBeLessThan(first as number)
    expect(second).toBe(FORMULA_EVALUATION_BUDGET - EVALUATIONS_PER_ROW)
  })

  it("shares ONE definitionsCache instance across every row", async () => {
    await BATCH_POST(batchRequest(items))

    const caches = mockRecalc.mock.calls.map((call) => call[0].definitionsCache)
    expect(caches[0]).toBeDefined()
    expect(new Set(caches).size).toBe(1)
  })

  it("passes cascade: false on every row — a freshly inserted deal has no activities yet", async () => {
    await BATCH_POST(batchRequest(items))

    // Asserted first so the loop below can never pass vacuously against zero calls.
    expect(mockRecalc).toHaveBeenCalledTimes(2)
    for (const call of mockRecalc.mock.calls) {
      expect(call[0].cascade).toBe(false)
    }
  })

  it("emits the post-recalc custom_fields for each row", async () => {
    await BATCH_POST(batchRequest(items))

    expect(emittedEvent(0)).toBe("deal.created")
    expect(emittedPayload(0).data.custom_fields).toEqual(RECALC_RESULT)
    expect(emittedPayload(1).data.custom_fields).toEqual(RECALC_RESULT)
  })

  it("isolates a failing row: the rest still recalculate and every row still emits", async () => {
    mockRecalc.mockRejectedValueOnce(new Error("quickjs exploded"))

    const response = await BATCH_POST(batchRequest(items))

    expect(response.status).toBe(200)
    expect(mockEmit).toHaveBeenCalledTimes(2)
    expect(emittedPayload(0).data.custom_fields).toEqual(STORED_CUSTOM_FIELDS)
    expect(emittedPayload(1).data.custom_fields).toEqual(RECALC_RESULT)
    expect(errorSpy).toHaveBeenCalled()
    expect(String(errorSpy.mock.calls[0][0])).toContain("[formula-recalc]")
  })
})
