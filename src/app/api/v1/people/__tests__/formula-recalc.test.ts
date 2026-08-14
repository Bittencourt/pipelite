/**
 * Recalc-before-emit for the three v1 people write routes (D-02 / D-17, RESEARCH inventory rows
 * #7, #8, #13b).
 *
 * Mirrors `src/app/api/v1/deals/__tests__/formula-recalc.test.ts` so the two files stay
 * consistent. Like the deal routes, all three of these bypass the mutation layer entirely — each
 * performs its own `db.insert`/`db.update` and emits on `crmBus` directly — so plans 34-06/34-07
 * do NOT cover them transitively.
 *
 * Every assertion is on the EMITTED payload plus an explicit `invocationCallOrder` comparison,
 * because the webhook body and the workflow-trigger envelope are emit-time SNAPSHOTS of the row
 * object: a test that only checked what was persisted would pass under BOTH orderings.
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
      people: { findFirst: vi.fn() },
      organizations: { findFirst: vi.fn(), findMany: vi.fn() },
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
 * assertion is pinned to the real constant rather than a fixture (plan 34-07's precedent).
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
import { POST } from "@/app/api/v1/people/route"
import { PUT } from "@/app/api/v1/people/[id]/route"
import { POST as BATCH_POST } from "@/app/api/v1/people/batch/route"

const mockDb = db as unknown as {
  query: {
    people: { findFirst: ReturnType<typeof vi.fn> }
    organizations: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
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

/** `Seniority` is formula-typed, so `stripFormulaKeys` must drop a caller-supplied `Seniority`. */
const DEFINITIONS = [
  { id: "p1", entityType: "person", name: "Origem", type: "multi_select", config: null },
  {
    id: "p2",
    entityType: "person",
    name: "Seniority",
    type: "formula",
    config: { expression: "{{FirstName}} + \" \" + {{LastName}}" },
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
  Seniority: { formula: true, value: "Ada Lovelace", error: null },
}

const EVALUATIONS_PER_ROW = 7

const personRow = {
  id: "person-1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: null,
  notes: null,
  organizationId: null,
  ownerId: "user-1",
  customFields: STORED_CUSTOM_FIELDS,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
}

const secondPersonRow = {
  ...personRow,
  id: "person-2",
  firstName: "Grace",
  lastName: "Hopper",
  email: "grace@example.com",
}

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

/* ------------------------------------------------------------------------------------------ *
 * Request helpers
 * ------------------------------------------------------------------------------------------ */

function postRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/people", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function putRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/people/person-1", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function batchRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/people/batch", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const putParams = { params: Promise.resolve({ id: "person-1" }) }

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
  // The real strip drops formula-typed keys; `Seniority` is the only one in DEFINITIONS.
  mockStrip.mockImplementation((values: Record<string, unknown>) => {
    const out = { ...values }
    delete out.Seniority
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
 * POST /api/v1/people — RESEARCH inventory row #7
 * ============================================================================================ */

describe("POST /api/v1/people — recalculates before emitting", () => {
  beforeEach(() => {
    stubInsert([personRow])
  })

  it("recalculates exactly once, for the inserted person, BEFORE crmBus.emit", async () => {
    const response = await POST(postRequest({ first_name: "Ada", last_name: "Lovelace" }))

    expect(response.status).toBe(201)
    expect(mockRecalc).toHaveBeenCalledTimes(1)
    expect(recalcInput()).toMatchObject({ entityType: "person", entityId: "person-1" })
    // The row from `.returning()` is handed over, so the helper never re-reads it.
    expect(recalcInput().row).toMatchObject({ id: "person-1", firstName: "Ada" })

    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(emittedEvent()).toBe("person.created")
    expectRecalcBeforeEmit(0, 0)
  })

  it("emits the post-recalc blob under the snake_case custom_fields key (serializePerson)", async () => {
    await POST(postRequest({ first_name: "Ada", last_name: "Lovelace" }))

    // This route emits `serializePerson(person)`, so the payload spells it snake_case. Do NOT
    // "harmonise" that with the mutation layer's camelCase — T-34-23, existing consumers.
    expect(emittedPayload().data.custom_fields).toEqual(RECALC_RESULT)
    expect(emittedPayload().data.custom_fields).not.toEqual(STORED_CUSTOM_FIELDS)
    expect(emittedPayload().data.customFields).toBeUndefined()
  })

  it("recalculates even when the request carries NO custom_fields", async () => {
    await POST(postRequest({ first_name: "Ada", last_name: "Lovelace" }))

    // A create writes every native attribute, so a formula over {{FirstName}} must run.
    expect(mockRecalc).toHaveBeenCalledTimes(1)
    expect(recalcInput().changedFields).toEqual(
      expect.arrayContaining(Object.values(ENTITY_NATIVE_ATTRIBUTES.person))
    )
  })

  it("strips caller-supplied formula keys before they reach the insert (T-34-04)", async () => {
    await POST(
      postRequest({
        first_name: "Ada",
        last_name: "Lovelace",
        custom_fields: { Origem: ["Inbound"], Seniority: "Principal" },
      })
    )

    expect(mockStrip).toHaveBeenCalledWith(
      { Origem: ["Inbound"], Seniority: "Principal" },
      DEFINITIONS
    )
    expect((insertedValues as { customFields: Record<string, unknown> }).customFields).toEqual({
      Origem: ["Inbound"],
    })
  })

  it("scopes the recalc to the native columns PLUS the precise custom-field key names", async () => {
    await POST(
      postRequest({
        first_name: "Ada",
        last_name: "Lovelace",
        custom_fields: { Origem: ["Inbound"], Seniority: "Principal" },
      })
    )

    const changed = recalcInput().changedFields
    expect(changed).toContain("Origem")
    expect(changed).toEqual(
      expect.arrayContaining(Object.values(ENTITY_NATIVE_ATTRIBUTES.person))
    )
    // A key the server just stripped was never written, so it did not change.
    expect(changed).not.toContain("Seniority")
  })

  it("still returns 201 and still emits when the recalc rejects (D-05 / T-34-17)", async () => {
    mockRecalc.mockRejectedValueOnce(new Error("quickjs exploded"))

    const response = await POST(postRequest({ first_name: "Ada", last_name: "Lovelace" }))

    expect(response.status).toBe(201)
    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(emittedPayload().data.custom_fields).toEqual(STORED_CUSTOM_FIELDS)
    expect(errorSpy).toHaveBeenCalled()
    expect(String(errorSpy.mock.calls[0][0])).toContain("[formula-recalc]")
  })

  it("leaves the 201 body pre-recalc — backlog 999.23, deferred for all four entities", async () => {
    const response = await POST(postRequest({ first_name: "Ada", last_name: "Lovelace" }))
    const body = await response.json()

    // Documented, not accidental: the stored row and the emitted event are both correct, and a
    // subsequent GET is correct (SC-1). Changing the create response is 999.23's job, so that
    // one decision covers organizations, people, deals and activities together.
    expect(body.data.custom_fields).toEqual(STORED_CUSTOM_FIELDS)
  })
})

/* ============================================================================================ *
 * PUT /api/v1/people/[id] — RESEARCH inventory row #8
 * ============================================================================================ */

describe("PUT /api/v1/people/:id — recalculates before emitting", () => {
  beforeEach(() => {
    mockDb.query.people.findFirst.mockResolvedValue(personRow)
    mockDb.query.organizations.findFirst.mockResolvedValue({ id: "org-1", ownerId: "user-1" })
    stubUpdate([{ ...personRow, notes: "touched" }])
  })

  it("recalculates once, before the emit, and the event carries the post-recalc value", async () => {
    const response = await PUT(putRequest({ notes: "touched" }), putParams)

    expect(response.status).toBe(200)
    expect(mockRecalc).toHaveBeenCalledTimes(1)
    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(emittedEvent()).toBe("person.updated")
    expectRecalcBeforeEmit(0, 0)

    // This route emits `serializePerson(...)` — snake_case, unlike PUT /api/v1/deals/[id].
    expect(emittedPayload().data.custom_fields).toEqual(RECALC_RESULT)
    expect(emittedPayload().data.custom_fields).not.toEqual(STORED_CUSTOM_FIELDS)
  })

  it("passes precise custom_fields key names to the recalc while the EVENT keeps the coarse sentinel", async () => {
    await PUT(
      putRequest({ custom_fields: { Origem: ["Outbound"], Seniority: "Principal" } }),
      putParams
    )

    // FORMULA-02 / SC-4: the recalc gets the precise names...
    expect(recalcInput().changedFields).toContain("Origem")
    // ...and the sentinel the routes already push, which the helper accepts as a safety net.
    expect(recalcInput().changedFields).toContain("customFields")

    // ...while the emitted changedFields is UNCHANGED: webhook consumers may depend on it.
    expect(emittedPayload().changedFields).toEqual(["customFields"])
    expect(emittedPayload().changedFields).not.toContain("Origem")
  })

  it("passes changedFields exactly ['organizationId'] when only the organization is reassigned", async () => {
    stubUpdate([{ ...personRow, organizationId: "org-1" }])

    await PUT(putRequest({ organization_id: "org-1" }), putParams)

    // `organizationId` is NOT in ENTITY_NATIVE_ATTRIBUTES.person, so with the real helper this
    // save would evaluate nothing at all (SC-4). The helper is mocked here, so the argument
    // SHAPE is what is pinned.
    expect(recalcInput().changedFields).toEqual(["organizationId"])
    expect(Object.values(ENTITY_NATIVE_ATTRIBUTES.person)).not.toContain("organizationId")
  })

  it("strips caller-supplied formula keys before the merge (T-34-04)", async () => {
    await PUT(
      putRequest({ custom_fields: { Origem: ["Outbound"], Seniority: "Principal" } }),
      putParams
    )

    expect(mockStrip).toHaveBeenCalledWith(
      { Origem: ["Outbound"], Seniority: "Principal" },
      DEFINITIONS
    )
    // The merge writes the stripped object over the existing blob — never the raw one.
    expect(updatedValues?.customFields).toEqual({ Origem: ["Outbound"] })
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
    expect(emittedPayload().data.custom_fields).toEqual(STORED_CUSTOM_FIELDS)
    expect(errorSpy).toHaveBeenCalled()
    expect(String(errorSpy.mock.calls[0][0])).toContain("[formula-recalc]")
  })
})

/* ============================================================================================ *
 * POST /api/v1/people/batch — RESEARCH inventory row #13b
 * ============================================================================================ */

describe("POST /api/v1/people/batch — one shared budget across the whole request", () => {
  const items = [
    { first_name: "Ada", last_name: "Lovelace" },
    { first_name: "Grace", last_name: "Hopper" },
  ]

  beforeEach(() => {
    stubInsert([personRow, secondPersonRow])
  })

  it("recalculates once per inserted row, each BEFORE that row's own emit", async () => {
    const response = await BATCH_POST(batchRequest(items))

    expect(response.status).toBe(200)
    expect(mockRecalc).toHaveBeenCalledTimes(2)
    expect(mockEmit).toHaveBeenCalledTimes(2)
    expect(recalcInput(0).entityId).toBe("person-1")
    expect(recalcInput(1).entityId).toBe("person-2")

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

  it("passes cascade: false on every row — a person created here has no deals yet", async () => {
    await BATCH_POST(batchRequest(items))

    // Asserted first so the loop below can never pass vacuously against zero calls.
    expect(mockRecalc).toHaveBeenCalledTimes(2)
    for (const call of mockRecalc.mock.calls) {
      expect(call[0].cascade).toBe(false)
    }
  })

  it("emits the post-recalc custom_fields for each row", async () => {
    await BATCH_POST(batchRequest(items))

    expect(emittedEvent(0)).toBe("person.created")
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
