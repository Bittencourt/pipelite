/**
 * Per-record authorization for `/api/v1/activities/[id]` — SEC-01, SC-1 and SC-2.
 *
 * Research reproduced this end-to-end against the running app: an API key belonging to user A read
 * user B's activity (200), renamed it (200), reassigned `owner_id` to itself (200) and deleted it
 * (204), after which B's read of B's own record returned 404. GET, PUT and DELETE each run their own
 * `findFirst` and none of them compares the row's owner to the caller, so **the three verbs fail
 * independently**. They are therefore asserted in three separate `describe` blocks with no shared
 * "assert 403 for verb X" helper — one shared helper would go green the moment any single verb was
 * fixed and would hide the other two.
 *
 * What is mocked and what is not, and why it matters here more than usual:
 *
 *   - `@/db` is mocked at the FETCH, and `findFirst` is made to resolve a genuinely foreign-owned
 *     row. The predicate under test — `activity.ownerId !== ctx.userId` — then executes for real
 *     against a real second identity. This is the opposite of
 *     `src/app/api/v1/organizations/[id]/__tests__/route.test.ts`, which simulates "not the caller's"
 *     as `mockResolvedValueOnce(undefined)`: that encodes its own conclusion ("the scoped query finds
 *     nothing") as its premise, and it is why deleting all three ownership predicates from
 *     `organizations/[id]/route.ts` left the full 5237-test suite green.
 *   - `user-9` exists in this file ONLY as a foreign owner. It never authenticates. The organizations
 *     test has no second identity anywhere in it, which is the single defect that makes every
 *     assertion in it unfalsifiable.
 *   - `db.update` is on the mock precisely so a test can prove the route NEVER calls it — the PUT
 *     write and the DELETE soft-delete are both `db.update`.
 *
 * Static top-level imports only, beside the hoisted `vi.mock` calls: `suite-hook-hygiene.test.ts`
 * forbids a dynamic `import()` reachable from a hook or a test body, and it enumerates this file.
 * Nothing here asserts over a clock-derived delta either — `suite-timing-hygiene.test.ts` enumerates
 * it too.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
// Type-only import: erased at runtime, so it does not resurrect the mocked module below.
import type { ApiAuthContext } from "@/lib/api/auth"
import type { activities as activitiesTable } from "@/db/schema"

type ActivityRow = typeof activitiesTable.$inferSelect

/** Mirrors the real `withApiAuth` handler contract in src/lib/api/auth.ts. */
type ApiRouteHandler = (
  request: NextRequest,
  context: ApiAuthContext
) => Promise<NextResponse>

// `update` is present on the db mock precisely so a test can prove the route NEVER calls it: both
// the PUT write and the DELETE soft-delete go through `db.update`.
//
// `deals.findFirst` is here for CR-01: `deal_id` is a CALLER-SUPPLIED FOREIGN KEY, and the PUT has
// to validate it against `eq(deals.ownerId, ctx.userId)` before it can be written. See
// `dealsFindFirst` below for why that mock evaluates the predicate instead of resolving a fixed row.
vi.mock("@/db", () => ({
  db: {
    query: {
      activities: { findFirst: vi.fn() },
      deals: { findFirst: vi.fn() },
      // WR-01: `type_id` is a foreign key and an unknown one used to reach the UPDATE and return
      // `23503` as a 500, while POST answered a clean 422 for the identical input. The PUT now
      // checks EXISTENCE here first. `activity_types` has no owner column, so this is deliberately
      // not an ownership check.
      activityTypes: { findFirst: vi.fn() },
    },
    update: vi.fn(),
  },
}))

// Auth bypass: this suite is about what the route does AFTER authentication, and the bypass is what
// lets it assert the authorization step separately from the authentication step. The ownership
// predicate itself stays REAL — a stubbed predicate would prove nothing about SEC-01.
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

vi.mock("@/lib/formula-recalc", () => ({
  recalculateFormulas: vi.fn(),
  stripFormulaKeys: vi.fn(),
}))

import { db } from "@/db"
import { PgDialect } from "drizzle-orm/pg-core"
import { and, eq, type SQL } from "drizzle-orm"
// A RUNTIME import, unlike the type-only `activitiesTable` above: `@/db/schema` is NOT mocked in
// this file, and the deal-lookup self-test below needs the real column objects to build the same
// expressions the route builds.
import { deals } from "@/db/schema"
import { crmBus } from "@/lib/events"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import { recalculateFormulas, stripFormulaKeys } from "@/lib/formula-recalc"
import { GET, PUT, DELETE } from "@/app/api/v1/activities/[id]/route"

const mockDb = db as unknown as {
  query: {
    activities: { findFirst: ReturnType<typeof vi.fn> }
    deals: { findFirst: ReturnType<typeof vi.fn> }
    activityTypes: { findFirst: ReturnType<typeof vi.fn> }
  }
  update: ReturnType<typeof vi.fn>
}

const mockEmit = vi.mocked(crmBus.emit)
const mockGetDefs = vi.mocked(getActiveFieldDefinitions)
const mockRecalc = vi.mocked(recalculateFormulas)
const mockStrip = vi.mocked(stripFormulaKeys)

/* ------------------------------------------------------------------------------------------ *
 * Fixtures — two identities
 * ------------------------------------------------------------------------------------------ */

/** The authenticated caller throughout this file. */
const CALLER_ID = "user-1"

/**
 * The foreign owner. It is never an authenticated `userId` anywhere in this file — it exists only
 * as the owner of a record the caller must not reach.
 */
const FOREIGN_OWNER_ID = "user-9"

const ownedActivity: ActivityRow = {
  id: "act-1",
  title: "Call client",
  typeId: "type-1",
  dealId: null,
  ownerId: CALLER_ID,
  assigneeId: null,
  dueDate: new Date("2026-02-01T09:00:00Z"),
  completedAt: null,
  reminderSentAt: null,
  notes: null,
  customFields: {},
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
}

/** The same activity, owned by somebody else — the IDOR target. */
const foreignActivity: ActivityRow = {
  ...ownedActivity,
  id: "act-2",
  ownerId: FOREIGN_OWNER_ID,
}

/* ------------------------------------------------------------------------------------------ *
 * CR-01 — `deal_id`, the caller-supplied foreign key
 * ------------------------------------------------------------------------------------------ */

/** A deal the CALLER owns. Linking it is legitimate and must stay a 200. */
const OWNED_DEAL_ID = "deal-1"
/** A deal `user-9` owns. This is the id an attacker plants; linking it must be refused. */
const FOREIGN_DEAL_ID = "deal-9"

type DealRow = { id: string; ownerId: string; deletedAt: Date | null }

const DEALS: DealRow[] = [
  { id: OWNED_DEAL_ID, ownerId: CALLER_ID, deletedAt: null },
  { id: FOREIGN_DEAL_ID, ownerId: FOREIGN_OWNER_ID, deletedAt: null },
]

/** `"deals"."owner_id" = $2` — the column name and the 1-based bind index. */
const EQUALITY_TERM = /"deals"\."(\w+)" = \$(\d+)/g
/** `"deals"."deleted_at" is null` — a term with no bind parameter. */
const IS_NULL_TERM = /"deals"\."(\w+)" is null/g

/** snake_case as PostgreSQL sees it, back to the camelCase key on the row. */
const COLUMN_TO_KEY: Record<string, keyof DealRow> = {
  id: "id",
  owner_id: "ownerId",
  deleted_at: "deletedAt",
}

/**
 * A PREDICATE-EVALUATING `deals.findFirst`, and the reason the CR-01 assertions below are evidence.
 *
 * The lazy mock would be `mockResolvedValue(undefined)` for the foreign deal — which encodes the
 * conclusion ("the scoped query finds nothing") as the premise, the exact defect this file's own
 * header records as having left `organizations/[id]/route.ts` green with all three of its ownership
 * predicates deleted.
 *
 * So this compiles the `where` the route actually handed over, reads the equality and `is null`
 * terms back out of the statement, and answers the way PostgreSQL would: a lookup scoped by `id`
 * ALONE gets the foreign deal back, exactly as the database would hand it over. The refusal has to
 * come from the route's predicate, never from this function. `dealsFindFirst` is itself asserted in
 * both polarities in the self-test describe below, before any route assertion depends on it.
 */
function dealsFindFirst(args?: { where?: unknown }): Promise<unknown> {
  if (args?.where === undefined) return Promise.resolve(DEALS[0])

  const compiled = new PgDialect().sqlToQuery(args.where as SQL)
  const params = compiled.params as unknown[]

  const constraints: Array<(row: DealRow) => boolean> = []
  for (const [, column, index] of compiled.sql.matchAll(EQUALITY_TERM)) {
    const key = COLUMN_TO_KEY[column]
    if (key === undefined) continue
    const bound = params[Number(index) - 1]
    constraints.push(row => row[key] === bound)
  }
  for (const [, column] of compiled.sql.matchAll(IS_NULL_TERM)) {
    const key = COLUMN_TO_KEY[column]
    if (key === undefined) continue
    constraints.push(row => row[key] === null)
  }

  return Promise.resolve(DEALS.find(row => constraints.every(holds => holds(row))))
}

/** The `where` the route handed to the deal lookup on the most recent request. */
const dealWhere = (): unknown => mockDb.query.deals.findFirst.mock.calls[0]?.[0]?.where
const renderDealQuery = (): { sql: string; params: unknown[] } => {
  const compiled = new PgDialect().sqlToQuery(dealWhere() as SQL)
  return { sql: compiled.sql, params: compiled.params as unknown[] }
}

/* ------------------------------------------------------------------------------------------ *
 * DB chain stub
 * ------------------------------------------------------------------------------------------ */

/** The object handed to `db.update(...).set(...)`, captured so SC-2 can inspect what was written. */
let updatedValues: Record<string, unknown> | undefined

/**
 * PUT ends the chain with `.returning()`; DELETE awaits `.where(...)` directly. The `where` result
 * is therefore BOTH a thenable and a carrier of `returning`.
 */
function stubUpdate(rows: unknown[]) {
  mockDb.update.mockReturnValue({
    set: vi.fn((v: Record<string, unknown>) => {
      updatedValues = v
      return {
        where: vi.fn(() =>
          Object.assign(Promise.resolve(rows), {
            returning: vi.fn().mockResolvedValue(rows),
          })
        ),
      }
    }),
  })
}

/**
 * Make the write REJECT, for the WR-01 assertions.
 *
 * `withApiAuth` has no `try`/`catch`, so before WR-01 a rejected write left the handler as a
 * rejected promise and Next.js rendered a 500. A test can only tell "mapped to a problem document"
 * apart from "escaped the handler" if the write really rejects, which is what this installs.
 */
function stubUpdateRejecting(error: unknown) {
  mockDb.update.mockReturnValue({
    set: vi.fn((v: Record<string, unknown>) => {
      updatedValues = v
      return {
        where: vi.fn(() =>
          Object.assign(Promise.reject(error), {
            returning: vi.fn().mockRejectedValue(error),
          })
        ),
      }
    }),
  })
}

/** A `postgres.js` error carries its SQLSTATE on `.code`, and nothing else the mapper reads. */
function pgError(code: string): Error & { code: string } {
  return Object.assign(new Error(`postgres said ${code}`), { code })
}

/* ------------------------------------------------------------------------------------------ *
 * Request helpers — these build requests only. No helper in this file asserts a status.
 * ------------------------------------------------------------------------------------------ */

function getRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/v1/activities/${id}`, {
    method: "GET",
  })
}

function putRequest(id: string, body: unknown) {
  return new NextRequest(`http://localhost:3000/api/v1/activities/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function deleteRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/v1/activities/${id}`, {
    method: "DELETE",
  })
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  updatedValues = undefined
  mockGetDefs.mockResolvedValue([])
  mockRecalc.mockResolvedValue({ customFields: {}, evaluations: 0 })
  mockStrip.mockImplementation((values: Record<string, unknown>) => values)
  // Re-installed explicitly rather than relying on reset semantics: a `deals.findFirst` that had
  // silently become predicate-BLIND would resolve a row for the foreign deal too and make every
  // CR-01 assertion below vacuous.
  mockDb.query.deals.findFirst.mockImplementation(dealsFindFirst)
  // The type EXISTS by default, so a WR-01 assertion about an unknown type has to say so explicitly
  // and cannot pass because every type lookup happens to be empty.
  mockDb.query.activityTypes.findFirst.mockResolvedValue({ id: "type-1", name: "Call" })
  stubUpdate([{ ...ownedActivity }])
})

afterEach(() => {
  vi.restoreAllMocks()
})

/* ------------------------------------------------------------------------------------------ *
 * SC-1a — GET
 * ------------------------------------------------------------------------------------------ */

describe("GET /api/v1/activities/:id — per-record authorization (SC-1a)", () => {
  it("returns 403 when the activity belongs to another user", async () => {
    // A REAL foreign-owned row, not an absent one: the route's own comparison decides the outcome.
    mockDb.query.activities.findFirst.mockResolvedValue(foreignActivity)

    const response = await GET(getRequest("act-2"), routeParams("act-2"))
    const problem = await response.json()

    expect(response.status).toBe(403)
    expect(problem.type).toMatch(/\/FORBIDDEN$/)
    expect(problem.status).toBe(403)
  })

  it("returns 200 for the owner", async () => {
    // The paired positive anchor. Without it, the 403 above is satisfied by a route that 403s
    // everything, including its legitimate owner.
    mockDb.query.activities.findFirst.mockResolvedValue(ownedActivity)

    const response = await GET(getRequest("act-1"), routeParams("act-1"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.id).toBe("act-1")
    expect(body.data.owner_id).toBe(CALLER_ID)
  })

  it("returns 404 before it ever reaches the ownership comparison", async () => {
    // 404 is decided first, always: a missing row must not produce a 403.
    mockDb.query.activities.findFirst.mockResolvedValue(undefined)

    const response = await GET(getRequest("act-404"), routeParams("act-404"))

    expect(response.status).toBe(404)
  })
})

/* ------------------------------------------------------------------------------------------ *
 * SC-1b — PUT
 * ------------------------------------------------------------------------------------------ */

describe("PUT /api/v1/activities/:id — per-record authorization (SC-1b)", () => {
  it("returns 403 for another user's activity and attempts no write", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(foreignActivity)

    const response = await PUT(putRequest("act-2", { title: "hijacked" }), routeParams("act-2"))
    const problem = await response.json()

    expect(response.status).toBe(403)
    expect(problem.type).toMatch(/\/FORBIDDEN$/)
    // The whole point: the refusal happens BEFORE any write is attempted.
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it("returns 200 for the owner and performs the write", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(ownedActivity)

    const response = await PUT(putRequest("act-1", { title: "renamed" }), routeParams("act-1"))

    expect(response.status).toBe(200)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(updatedValues?.title).toBe("renamed")
  })

  it("returns 404 for a missing activity before any ownership comparison", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(undefined)

    const response = await PUT(putRequest("act-404", { title: "x" }), routeParams("act-404"))

    expect(response.status).toBe(404)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  /* ---------------------------------------------------------------------------------------- *
   * SC-2 — owner_id reassignment. Nested under PUT because it is a PUT-only property, but its
   * assertions are entirely separate from the 403 assertions above.
   * ---------------------------------------------------------------------------------------- */

  describe("owner_id reassignment (SC-2)", () => {
    it("rejects a foreign owner_id with 422 naming the field, and writes nothing", async () => {
      mockDb.query.activities.findFirst.mockResolvedValue(ownedActivity)

      const response = await PUT(
        putRequest("act-1", { owner_id: FOREIGN_OWNER_ID }),
        routeParams("act-1")
      )
      const problem = await response.json()

      expect(response.status).toBe(422)
      // Asserted on the RESPONSE BODY, not merely on the absence of the write: CONTEXT's decision
      // is that a foreign owner_id is REJECTED, not silently dropped, so the caller must be told.
      expect(problem.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "owner_id" })])
      )
      expect(mockDb.update).not.toHaveBeenCalled()
    })

    it("still accepts the caller's OWN owner_id with 200 — the rejection is targeted", async () => {
      mockDb.query.activities.findFirst.mockResolvedValue(ownedActivity)

      const response = await PUT(putRequest("act-1", { owner_id: CALLER_ID }), routeParams("act-1"))

      expect(response.status).toBe(200)
      expect(mockDb.update).toHaveBeenCalledTimes(1)
    })

    it("does not touch ownerId on an ordinary owner update", async () => {
      mockDb.query.activities.findFirst.mockResolvedValue(ownedActivity)

      const response = await PUT(putRequest("act-1", { title: "x" }), routeParams("act-1"))

      expect(response.status).toBe(200)
      expect(updatedValues).toBeDefined()
      expect(Object.keys(updatedValues as Record<string, unknown>)).not.toContain("ownerId")
    })
  })
})

/* ------------------------------------------------------------------------------------------ *
 * CR-01 — the ATTACHED relation, not the primary record
 *
 * SEC-01 constrains the `activities` row. `deal_id` is chosen by the CALLER and, before this fix,
 * nothing constrained it: `PUT /api/v1/activities/<A's own activity>` with `{"deal_id": "<B's
 * deal>"}` returned 200, and `?expand=deal` then serialized B's deal, B's organization and B's
 * person. The write is the defect; rejecting it is the fix.
 *
 * The house pattern this matches is `src/app/api/v1/deals/[id]/route.ts:226-256` — validate every
 * caller-supplied foreign key with `eq(<table>.ownerId, ctx.userId)` and answer 422
 * `invalid_reference`. Same status, same `code`, same body shape, so the codebase keeps ONE
 * convention for this.
 * ------------------------------------------------------------------------------------------ */

describe("the deals mock self-test — findFirst answers from the PREDICATE, not from a fixed row", () => {
  // This comes before the route assertions for the same reason the stages suite's `with`-aware mock
  // does: every CR-01 assertion below rests on the claim that this mock models a scoped query. An
  // unasserted claim about a mock is how a suite ends up unable to fail.
  it("returns a deal when the predicate binds both its id AND its owner", async () => {
    const row = (await dealsFindFirst({
      where: and(eq(deals.id, OWNED_DEAL_ID), eq(deals.ownerId, CALLER_ID)),
    })) as { id: string } | undefined

    expect(row?.id).toBe(OWNED_DEAL_ID)
  })

  it("returns nothing when the predicate binds the id and the WRONG owner", async () => {
    const row = (await dealsFindFirst({
      where: and(eq(deals.id, FOREIGN_DEAL_ID), eq(deals.ownerId, CALLER_ID)),
    })) as { id: string } | undefined

    expect(row).toBeUndefined()
  })

  it("HANDS THE FOREIGN DEAL BACK to an UNSCOPED lookup — the mock does not do the route's job", async () => {
    // ⚠ The load-bearing cell. If this resolved `undefined`, every 422 below would pass against a
    // route carrying no ownership term at all, because the MOCK would be refusing on its behalf.
    // PostgreSQL answers `where id = 'deal-9'` with deal-9 no matter who asks, and so does this.
    const row = (await dealsFindFirst({ where: eq(deals.id, FOREIGN_DEAL_ID) })) as
      | { id: string; ownerId: string }
      | undefined

    expect(row?.id).toBe(FOREIGN_DEAL_ID)
    expect(row?.ownerId).toBe(FOREIGN_OWNER_ID)
  })
})

describe("GET /api/v1/activities/:id?expand=deal — the READ half (CR-01)", () => {
  /** A full deal row, so `serializeDeal` has every field it projects. */
  const dealRow = (id: string, ownerId: string) => ({
    id,
    title: "Big deal",
    value: "5000",
    stageId: "stage-1",
    organizationId: null,
    personId: null,
    ownerId,
    position: "10000",
    expectedCloseDate: null,
    notes: "confidential",
    customFields: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
  })

  it("does NOT serialize a deal owned by another user, even when the row already links to it", async () => {
    // The write guard makes a new foreign link impossible. This is the LEGACY row: planted before
    // that guard existed, or through the session-auth mutation path, which still validates existence
    // only. The relation is loaded by id alone, so without the `owner_id` comparison in the
    // projection this response carries B's title, value, notes and custom_fields.
    mockDb.query.activities.findFirst.mockResolvedValue({
      ...ownedActivity,
      dealId: FOREIGN_DEAL_ID,
      deal: dealRow(FOREIGN_DEAL_ID, FOREIGN_OWNER_ID),
    })

    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/activities/act-1?expand=deal"),
      routeParams("act-1")
    )
    const body = await response.json()

    // FLOOR: the activity itself is still returned, so the absence below is the guard working
    // rather than the whole request failing.
    expect(response.status).toBe(200)
    expect(body.data.id).toBe("act-1")
    expect(Object.keys(body.data)).not.toContain("deal")
    // And nothing of B's leaked through another key either.
    expect(JSON.stringify(body)).not.toContain("confidential")
  })

  it("DOES serialize a deal the caller owns — the suppression is targeted", async () => {
    // The positive anchor. Without it the assertion above is satisfied by a route that dropped
    // `expand=deal` altogether, which would be a regression rather than a fix.
    mockDb.query.activities.findFirst.mockResolvedValue({
      ...ownedActivity,
      dealId: OWNED_DEAL_ID,
      deal: dealRow(OWNED_DEAL_ID, CALLER_ID),
    })

    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/activities/act-1?expand=deal"),
      routeParams("act-1")
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.deal.id).toBe(OWNED_DEAL_ID)
    expect(body.data.deal.owner_id).toBe(CALLER_ID)
  })
})

describe("PUT /api/v1/activities/:id — deal_id ownership (CR-01)", () => {
  it("refuses a deal owned by another user with 422 naming deal_id, and writes nothing", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(ownedActivity)

    const response = await PUT(
      putRequest("act-1", { deal_id: FOREIGN_DEAL_ID }),
      routeParams("act-1")
    )
    const problem = await response.json()

    expect(response.status).toBe(422)
    expect(problem.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "deal_id", code: "invalid_reference" }),
      ])
    )
    // The write is the defect. An empty `?expand=deal` would be a weaker claim that could pass for
    // the wrong reason; an absent `db.update` is the proof the link was never planted.
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it("looks the deal up under an OWNER-SCOPED predicate that binds the caller as a parameter", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(ownedActivity)

    await PUT(putRequest("act-1", { deal_id: FOREIGN_DEAL_ID }), routeParams("act-1"))

    expect(mockDb.query.deals.findFirst).toHaveBeenCalledTimes(1)
    const { sql, params } = renderDealQuery()

    // FLOOR FIRST: an empty render would satisfy the negative below for free.
    expect(sql.length).toBeGreaterThan(0)
    expect(sql).toContain('"owner_id"')
    expect(sql).toContain('"deleted_at"')
    expect(params).toContain(CALLER_ID)
    expect(params).toContain(FOREIGN_DEAL_ID)
    // The caller id reaches PostgreSQL bound, never spliced into the statement text.
    expect(sql).not.toContain(CALLER_ID)
  })

  it("still accepts a deal the caller OWNS with 200 and writes the link — the refusal is targeted", async () => {
    // The positive anchor. Without it the 422 above is satisfied by a route that refuses every
    // `deal_id`, which would be a different bug wearing the same status code.
    mockDb.query.activities.findFirst.mockResolvedValue(ownedActivity)

    const response = await PUT(
      putRequest("act-1", { deal_id: OWNED_DEAL_ID }),
      routeParams("act-1")
    )

    expect(response.status).toBe(200)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(updatedValues?.dealId).toBe(OWNED_DEAL_ID)
  })

  it("accepts deal_id: null — detaching is not a reference and must not be looked up", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue({
      ...ownedActivity,
      dealId: OWNED_DEAL_ID,
    })

    const response = await PUT(putRequest("act-1", { deal_id: null }), routeParams("act-1"))

    expect(response.status).toBe(200)
    expect(mockDb.query.deals.findFirst).not.toHaveBeenCalled()
    expect(updatedValues?.dealId).toBeNull()
  })

  it("does not look a deal up at all when the body omits deal_id", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(ownedActivity)

    const response = await PUT(putRequest("act-1", { title: "renamed" }), routeParams("act-1"))

    expect(response.status).toBe(200)
    expect(mockDb.query.deals.findFirst).not.toHaveBeenCalled()
  })

  it("refuses a deal_id that exists for NOBODY with the same 422 — existence is not the test", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(ownedActivity)

    const response = await PUT(
      putRequest("act-1", { deal_id: "deal-does-not-exist" }),
      routeParams("act-1")
    )
    const problem = await response.json()

    // Before this fix an unknown `deal_id` reached the UPDATE and produced a `23503` foreign-key
    // violation — an unhandled 500 where the POST path already answered a clean 422 (WR-01 item 3).
    expect(response.status).toBe(422)
    expect(problem.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "deal_id" })])
    )
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("decides the ACTIVITY's ownership before it ever reads the body's deal_id", async () => {
    // Ordering matters: a foreign caller's payload must not be parsed, let alone used to probe
    // which deals exist. This is the same ordering `activities/[id]/route.ts:154-158` documents.
    mockDb.query.activities.findFirst.mockResolvedValue(foreignActivity)

    const response = await PUT(
      putRequest("act-2", { deal_id: FOREIGN_DEAL_ID }),
      routeParams("act-2")
    )

    expect(response.status).toBe(403)
    expect(mockDb.query.deals.findFirst).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------------------------------ *
 * SC-1c — DELETE
 * ------------------------------------------------------------------------------------------ */

describe("DELETE /api/v1/activities/:id — per-record authorization (SC-1c)", () => {
  it("returns 403 for another user's activity and attempts no soft delete", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(foreignActivity)

    const response = await DELETE(deleteRequest("act-2"), routeParams("act-2"))

    // Status first, then the body: a successful DELETE answers 204 with an EMPTY body, so parsing
    // before asserting would report `Unexpected end of JSON input` and bury the 204-instead-of-403
    // that is the actual defect.
    expect(response.status).toBe(403)
    const problem = await response.json()
    expect(problem.type).toMatch(/\/FORBIDDEN$/)
    // The soft delete IS an update, so an absent `db.update` call is the proof no row was tombstoned.
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it("returns 204 for the owner and performs the soft delete", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(ownedActivity)

    const response = await DELETE(deleteRequest("act-1"), routeParams("act-1"))

    expect(response.status).toBe(204)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(updatedValues?.deletedAt).toBeInstanceOf(Date)
  })

  it("returns 404 for a missing activity before any ownership comparison", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue(undefined)

    const response = await DELETE(deleteRequest("act-404"), routeParams("act-404"))

    expect(response.status).toBe(404)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------------------------------ *
 * WR-01 — four valid-per-zod bodies that produced an unhandled 500
 *
 * `withApiAuth` has no `try`/`catch` (`src/lib/api/auth.ts`) and this route wrapped nothing, so every
 * database error propagated out as a rejected promise and Next.js rendered it as a 500 — telling the
 * caller to retry a request that would fail identically forever.
 *
 * The BEHAVIOURAL proof that these were really 500s against PostgreSQL lives in
 * `activities-scope.db.test.ts`: this file's `db.update` is a stub, so the pre-fix status here is 200,
 * not 500. Both are needed. The status assertions below prove the REQUEST IS NOW REFUSED with a field
 * name; the db test proves what it used to do to a real database.
 * ------------------------------------------------------------------------------------------ */

describe("WR-01 — the schema and the column no longer contradict each other", () => {
  beforeEach(() => {
    mockDb.query.activities.findFirst.mockResolvedValue(ownedActivity)
  })

  it("refuses `due_at: null` with 422 naming the field, because due_date is NOT NULL", async () => {
    // `activities.due_date` is `.notNull()` while the API schema declared `due_at` nullable, so this
    // body passed zod, executed `due_date = null` and answered
    // `23502 null value in column "due_date" violates not-null constraint` as a 500. There is no way
    // to clear this column, so refusing with a field name is the only honest answer.
    const response = await PUT(putRequest("act-1", { due_at: null }), routeParams("act-1"))
    const problem = await response.json()

    expect(response.status).toBe(422)
    expect(problem.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "due_at" })])
    )
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it.each([
    ["due_at", { due_at: "not-a-date" }],
    ["completed_at", { completed_at: "not-a-date" }],
  ])("refuses an unparseable %s with 422 rather than a RangeError 500", async (field, body) => {
    // `new Date("not-a-date")` is an `Invalid Date`; postgres.js serializes via `toISOString()`,
    // which throws `RangeError: Invalid time value` — a 500 carrying no SQLSTATE at all, so even the
    // error mapper could not classify it. `.datetime()` makes it unrepresentable instead.
    const response = await PUT(putRequest("act-1", body), routeParams("act-1"))
    const problem = await response.json()

    expect(response.status).toBe(422)
    expect(problem.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })])
    )
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("still accepts a well-formed ISO due_at with 200 — the tightening is targeted", async () => {
    // The anti-vacuity anchor for the three refusals above. Without it they are satisfied by a
    // schema that rejects every `due_at`, which would break every legitimate reschedule.
    const response = await PUT(
      putRequest("act-1", { due_at: "2026-03-01T09:00:00.000Z" }),
      routeParams("act-1")
    )

    expect(response.status).toBe(200)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(updatedValues?.dueDate).toBeInstanceOf(Date)
  })

  it("accepts `completed_at: null` — nullable there is CORRECT, and must not be tightened away", async () => {
    // `activities.completed_at` IS nullable and `null` is the meaningful value that marks an activity
    // not-done. Only the FORMAT was tightened. Pinned, because "make due_at non-nullable" applied
    // one field too far would silently remove the ability to reopen an activity.
    const response = await PUT(putRequest("act-1", { completed_at: null }), routeParams("act-1"))

    expect(response.status).toBe(200)
    expect(updatedValues?.completedAt).toBeNull()
  })

  it("refuses an unknown type_id with 422, the same answer POST already gave for that input", async () => {
    // `{"type_id": "does-not-exist"}` reached the UPDATE and returned `23503` as a 500, while
    // `POST /api/v1/activities` answered a clean 422 ("Activity type not found") for the identical
    // input. Two verbs disagreeing about one error is worse than either answer alone.
    mockDb.query.activityTypes.findFirst.mockResolvedValue(undefined)

    const response = await PUT(
      putRequest("act-1", { type_id: "does-not-exist" }),
      routeParams("act-1")
    )
    const problem = await response.json()

    expect(response.status).toBe(422)
    expect(problem.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "type_id", code: "invalid_reference" }),
      ])
    )
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("still accepts a type_id that EXISTS with 200 — existence, not ownership", async () => {
    // `activity_types` has no owner column: it is a shared lookup table. A caller must be able to use
    // any type that exists, so this anchor is what stops the check above from drifting into an
    // ownership comparison there is nothing to compare against.
    mockDb.query.activityTypes.findFirst.mockResolvedValue({ id: "type-2", name: "Email" })

    const response = await PUT(putRequest("act-1", { type_id: "type-2" }), routeParams("act-1"))

    expect(response.status).toBe(200)
    expect(updatedValues?.typeId).toBe("type-2")
  })
})

describe("WR-01 — a rejected write becomes a problem document, never an unhandled rejection", () => {
  beforeEach(() => {
    mockDb.query.activities.findFirst.mockResolvedValue(ownedActivity)
  })

  it("maps a 23503 from the UPDATE to 422 — the check-then-write race is still real", async () => {
    // `deal_id` and `type_id` are validated in separate statements from the write, so a concurrent
    // delete between them still produces a foreign-key violation. Validating does not remove the
    // need to catch.
    stubUpdateRejecting(pgError("23503"))

    const response = await PUT(putRequest("act-1", { title: "renamed" }), routeParams("act-1"))
    const problem = await response.json()

    expect(response.status).toBe(422)
    expect(problem.type).toMatch(/\/VALIDATION_ERROR$/)
  })

  it("maps an UNEXPECTED throw to a well-formed 500 instead of letting it escape the handler", async () => {
    // The status is 500 either way, and that is exactly why this asserts the BODY. Before WR-01 the
    // promise rejected out of the handler and the response was whatever Next.js renders; now it is
    // the same RFC 7807 document every other error from this API produces.
    stubUpdateRejecting(new Error("connection terminated unexpectedly"))

    const response = await PUT(putRequest("act-1", { title: "renamed" }), routeParams("act-1"))
    const problem = await response.json()

    expect(response.status).toBe(500)
    expect(problem.type).toMatch(/\/INTERNAL_ERROR$/)
    expect(problem.title).toBe("Internal Server Error")
  })

  it("emits no CRM event when the write failed", async () => {
    // The emit sits after the write. An unwrapped rejection skipped it by crashing; a mapped return
    // has to skip it deliberately, and a webhook announcing an update that did not happen would be
    // worse than the 500.
    stubUpdateRejecting(pgError("23503"))

    await PUT(putRequest("act-1", { title: "renamed" }), routeParams("act-1"))

    expect(mockEmit).not.toHaveBeenCalled()
  })

  it("maps a rejected DELETE soft-delete the same way, and emits nothing", async () => {
    stubUpdateRejecting(new Error("connection terminated unexpectedly"))

    const response = await DELETE(deleteRequest("act-1"), routeParams("act-1"))
    const problem = await response.json()

    expect(response.status).toBe(500)
    expect(problem.type).toMatch(/\/INTERNAL_ERROR$/)
    expect(mockEmit).not.toHaveBeenCalled()
  })
})
