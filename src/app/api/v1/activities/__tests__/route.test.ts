import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
// Type-only imports: erased at runtime, so they do not resurrect the mocked modules below.
import type { ApiAuthContext } from "@/lib/api/auth"
import type { activities as activitiesTable } from "@/db/schema"

/** Mirrors the real `withApiAuth` handler contract in src/lib/api/auth.ts. */
type ApiRouteHandler = (
  request: NextRequest,
  context: ApiAuthContext
) => Promise<NextResponse>

/**
 * `db.select({...}).from(activities).where(cond)` is awaited directly by the route's count
 * query, so the `where` step must return a thenable. Capturing its argument is the only way
 * to observe the count predicate: a mocked builder never renders SQL on its own.
 */
const countWhere = vi.fn((_condition: unknown) => Promise.resolve([{ count: 0 }]))
const countFrom = vi.fn((_table: unknown) => ({ where: countWhere }))

vi.mock("@/db", () => ({
  db: {
    query: {
      activities: { findMany: vi.fn() },
      activityTypes: { findFirst: vi.fn() },
      deals: { findFirst: vi.fn() },
      // Present because the UNFIXED route looks the supplied owner up here. It resolves to a
      // real-looking row on purpose: if it resolved to undefined, the foreign-owner POST would
      // 422 for the wrong reason ("Owner not found") and the RED observation would be a lie.
      users: { findFirst: vi.fn() },
    },
    select: vi.fn(() => ({ from: countFrom })),
  },
}))

// Auth bypass: this suite is about what the route does AFTER authentication. The bypass is what
// lets the authorization step be asserted separately from the authentication step.
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((req: NextRequest, handler: ApiRouteHandler) =>
    handler(req, { userId: "user-1", keyId: "key-1" })
  ),
}))

vi.mock("@/lib/mutations/activities", () => ({
  createActivityMutation: vi.fn(),
}))

import { db } from "@/db"
import { createActivityMutation } from "@/lib/mutations/activities"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"
import { GET, POST } from "@/app/api/v1/activities/route"

const mockDb = db as unknown as {
  query: {
    activities: { findMany: ReturnType<typeof vi.fn> }
    activityTypes: { findFirst: ReturnType<typeof vi.fn> }
    deals: { findFirst: ReturnType<typeof vi.fn> }
    users: { findFirst: ReturnType<typeof vi.fn> }
  }
  select: ReturnType<typeof vi.fn>
}

const mockCreateActivity = vi.mocked(createActivityMutation)

/**
 * Render a Drizzle `where` back to SQL text plus bound parameters.
 *
 * It exists because a mocked query builder DISCARDS its `where`: `findMany` is a `vi.fn()` that
 * resolves to whatever the test told it to, entirely regardless of the predicate handed in. The
 * predicate is therefore unobservable by any assertion on the response body, and a list test built
 * on `mockResolvedValue([])` would pass identically against a route with no scope at all.
 *
 * READ THIS BEFORE TRUSTING THESE ASSERTIONS: a rendered-predicate assertion is a
 * COMPILED-STRUCTURE claim — "the route asked the database for this SQL" — and NOT a behavioural
 * proof that the database returns only the caller's rows. The behavioural proof (two seeded owners,
 * a real query, a floor and a ceiling on the row counts) is owned by plan 48-06. Nothing here may
 * be cited as evidence that ROADMAP SC-3 holds.
 */
const renderQuery = (where: unknown) => new PgDialect().sqlToQuery(where as SQL)
const renderPredicate = (where: unknown): string => renderQuery(where).sql
const renderParams = (where: unknown): unknown[] => renderQuery(where).params

/** Occurrence count without a shell `grep` — `grep … | wc -l` mis-counts in this environment. */
const occurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1

/** The `where` the route handed to the relational page query on the most recent GET. */
const pageWhere = () => mockDb.query.activities.findMany.mock.calls[0][0].where
/** The `where` the route handed to the count builder on the most recent GET. */
const countWhereArg = () => countWhere.mock.calls[0][0]

const fakeActivity: typeof activitiesTable.$inferSelect = {
  id: "act-1",
  title: "x",
  typeId: "type-1",
  dealId: null,
  ownerId: "user-1",
  assigneeId: null,
  dueDate: new Date("2026-01-01T00:00:00Z"),
  completedAt: null,
  reminderSentAt: null,
  notes: null,
  customFields: {},
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
}

function listRequest(query = "") {
  return new NextRequest(`http://localhost:3000/api/v1/activities${query}`)
}

function createRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/activities", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.query.activities.findMany.mockResolvedValue([])
  mockDb.query.activityTypes.findFirst.mockResolvedValue({ id: "type-1", name: "Call" })
  mockDb.query.deals.findFirst.mockResolvedValue({ id: "deal-1" })
  // The foreign owner EXISTS. The rejection under test must be about ownership, not existence.
  mockDb.query.users.findFirst.mockResolvedValue({
    id: "user-9",
    name: "Other",
    email: "other@example.com",
  })
  mockDb.select.mockReturnValue({ from: countFrom })
  countFrom.mockReturnValue({ where: countWhere })
  countWhere.mockResolvedValue([{ count: 0 }])
  mockCreateActivity.mockResolvedValue({ success: true, id: "act-1", activity: fakeActivity })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("GET /api/v1/activities — owner scope, rendered (T-48-02-01)", () => {
  it("scopes a bare list to the caller: the rendered predicate names owner_id and binds user-1", async () => {
    const response = await GET(listRequest())

    expect(response.status).toBe(200)

    const rendered = renderPredicate(pageWhere())
    // The soft-delete guard must survive alongside the new scope — a scope that replaced it
    // would start returning the caller's own trashed rows.
    expect(rendered).toContain("deleted_at")
    expect(rendered).toContain("owner_id")
    expect(renderParams(pageWhere())).toContain("user-1")
  })

  it("binds the caller id as a parameter, never interpolated into the statement text", async () => {
    await GET(listRequest())

    // An id spliced into the text rather than bound is the shape SQL injection takes.
    expect(renderPredicate(pageWhere())).not.toContain("user-1")
  })

  it("computes meta.total from the SAME predicate as the page (T-48-02-05)", async () => {
    await GET(listRequest())

    // If the two diverge, `meta.total` stops being a ceiling on what the caller may see and
    // becomes an independent count that leaks the size of everybody else's data.
    expect(countWhere).toHaveBeenCalledTimes(1)
    expect(renderPredicate(countWhereArg())).toBe(renderPredicate(pageWhere()))
    expect(renderParams(countWhereArg())).toEqual(renderParams(pageWhere()))
  })
})

describe("GET /api/v1/activities — the caller-supplied filter narrows, never widens (T-48-02-03)", () => {
  it("composes ?owner_id=user-9 UNDER the scope: two owner_id occurrences, both ids bound", async () => {
    await GET(listRequest("?owner_id=user-9"))

    const rendered = renderPredicate(pageWhere())
    const params = renderParams(pageWhere())

    // Two occurrences is the whole assertion. One occurrence means the caller-supplied value
    // REPLACED the scope instead of joining it — which is the current defect, reachable by
    // anyone who can type a query string.
    expect(occurrences(rendered, '"owner_id"')).toBe(2)
    expect(params).toContain("user-1")
    expect(params).toContain("user-9")
    // `and` semantics: an activity must satisfy both, so the result set is a subset of the
    // caller's own records. `user-9`'s rows can never enter it.
    expect(rendered).toContain(" and ")
  })

  it("keeps the scope when other filters are supplied too", async () => {
    await GET(listRequest("?type_id=type-1&deal_id=deal-1"))

    const params = renderParams(pageWhere())
    expect(params).toContain("user-1")
    expect(params).toContain("type-1")
    expect(params).toContain("deal-1")
    expect(occurrences(renderPredicate(pageWhere()), '"owner_id"')).toBe(1)
  })
})

describe("POST /api/v1/activities — create-as-another-user (SC-2b, T-48-02-02)", () => {
  it("rejects a foreign owner_id with 422 and creates nothing", async () => {
    const response = await POST(createRequest({ title: "x", type_id: "type-1", owner_id: "user-9" }))
    const problem = await response.json()

    expect(response.status).toBe(422)
    expect(problem.errors).toEqual([
      { field: "owner_id", code: "forbidden", message: "owner_id cannot be set to another user" },
    ])
    // The refusal happens BEFORE any write is attempted.
    expect(mockCreateActivity).not.toHaveBeenCalled()
  })

  it("rejects loudly rather than silently coercing the owner to the caller", async () => {
    // Silently dropping the field would leave the caller believing the write landed as sent.
    const response = await POST(createRequest({ title: "x", type_id: "type-1", owner_id: "user-9" }))

    expect(response.status).not.toBe(201)
    expect(mockCreateActivity).not.toHaveBeenCalled()
  })

  it("owns a new activity to the caller when owner_id is omitted", async () => {
    const response = await POST(createRequest({ title: "x", type_id: "type-1" }))

    expect(response.status).toBe(201)
    expect(mockCreateActivity).toHaveBeenCalledTimes(1)
    // `createActivityMutation` names its ownership input `userId` and writes it to
    // `activities.ownerId` (src/lib/mutations/activities.ts) — this IS the ownership column.
    expect(mockCreateActivity.mock.calls[0][0].userId).toBe("user-1")
  })

  it("accepts owner_id when it is the caller's own id — the rejection is targeted", async () => {
    const response = await POST(createRequest({ title: "x", type_id: "type-1", owner_id: "user-1" }))

    expect(response.status).toBe(201)
    expect(mockCreateActivity.mock.calls[0][0].userId).toBe("user-1")
  })
})
