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
vi.mock("@/db", () => ({
  db: {
    query: {
      activities: { findFirst: vi.fn() },
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
import { crmBus } from "@/lib/events"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import { recalculateFormulas, stripFormulaKeys } from "@/lib/formula-recalc"
import { GET, PUT, DELETE } from "@/app/api/v1/activities/[id]/route"

const mockDb = db as unknown as {
  query: { activities: { findFirst: ReturnType<typeof vi.fn> } }
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
