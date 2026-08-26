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
const countWhere = vi.fn<(condition: unknown) => Promise<{ count: number }[]>>(() =>
  Promise.resolve([{ count: 0 }])
)
const countFrom = vi.fn<(table: unknown) => { where: typeof countWhere }>(() => ({
  where: countWhere,
}))

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
import { and, eq, type SQL } from "drizzle-orm"
// A RUNTIME import, unlike the type-only `activitiesTable` above: `@/db/schema` is NOT mocked in
// this file, and the deal-lookup self-test below needs the real column objects to build the same
// expressions the route builds.
import { deals } from "@/db/schema"
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

/* ------------------------------------------------------------------------------------------ *
 * CR-01 — `deal_id`, the caller-supplied foreign key on POST
 *
 * `createActivityMutation` validates that the deal EXISTS (`src/lib/mutations/activities.ts:140-151`,
 * `eq(deals.id, dealId), isNull(deals.deletedAt)`) and never that the caller owns it, so
 * `POST /api/v1/activities` with somebody else's `deal_id` reached 201 and `?expand=deal` then
 * serialized that deal, its organization and its person. The guard belongs in the ROUTE: the mutation
 * is also called from the session-auth server-action path, where the owner is already established.
 * ------------------------------------------------------------------------------------------ */

/** A deal the CALLER owns. Linking it is legitimate and must stay a 201. */
const OWNED_DEAL_ID = "deal-1"
/** A deal `user-9` owns. This is the id an attacker plants; linking it must be refused. */
const FOREIGN_DEAL_ID = "deal-9"

type DealRow = { id: string; ownerId: string; deletedAt: Date | null }

const DEALS: DealRow[] = [
  { id: OWNED_DEAL_ID, ownerId: "user-1", deletedAt: null },
  { id: FOREIGN_DEAL_ID, ownerId: "user-9", deletedAt: null },
]

/** `"deals"."owner_id" = $2` — the column name and the 1-based bind index. */
const EQUALITY_TERM = /"deals"\."(\w+)" = \$(\d+)/g
/** `"deals"."deleted_at" is null` — a term with no bind parameter. */
const IS_NULL_TERM = /"deals"\."(\w+)" is null/g

const COLUMN_TO_KEY: Record<string, keyof DealRow> = {
  id: "id",
  owner_id: "ownerId",
  deleted_at: "deletedAt",
}

/**
 * A PREDICATE-EVALUATING `deals.findFirst`, twin of the one in
 * `src/app/api/v1/activities/[id]/__tests__/route.test.ts`.
 *
 * `mockResolvedValue(undefined)` for the foreign deal would encode the conclusion ("the scoped query
 * finds nothing") as the premise — the SEC-48-B failure mode this suite's sibling documents. This
 * reads the compiled statement back and answers the way PostgreSQL would: a lookup scoped by `id`
 * alone gets the FOREIGN deal handed to it, so the refusal can only come from the route's predicate.
 * Asserted in both polarities in the self-test describe below.
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
  // Re-installed explicitly rather than relying on reset semantics: a `deals.findFirst` that had
  // silently become predicate-BLIND would resolve a row for the foreign deal too and make every
  // CR-01 assertion below vacuous.
  mockDb.query.deals.findFirst.mockImplementation(dealsFindFirst)
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

describe("GET /api/v1/activities — the page order is TOTAL (WR-02)", () => {
  it("ends the sort with the unique activities.id, so LIMIT/OFFSET cannot lose or repeat a row", async () => {
    // The list's final sort key was `desc(activities.createdAt)`, which is NOT unique — bulk-created
    // rows share a timestamp to the millisecond. `LIMIT`/`OFFSET` over a sort with ties is
    // UNSPECIFIED in PostgreSQL, so a row can appear on two pages and another on none while
    // `meta.total` reports the true count in both.
    //
    // Asserted on the compiled sort keys rather than behaviourally, and deliberately: the pre-fix
    // outcome is unspecified rather than wrong, so a behavioural run may return correct pages by
    // luck. Unspecified order IS the defect; the keys are what say which one this route asked for.
    await GET(listRequest())

    const orderBy = mockDb.query.activities.findMany.mock.calls[0][0].orderBy as unknown[]

    // FLOOR: the route really did pass sort keys, so the length claim is about the sort.
    expect(Array.isArray(orderBy)).toBe(true)
    expect(orderBy.length).toBeGreaterThan(0)

    const rendered = orderBy.map(key => renderPredicate(key))
    // The pre-existing three keys survive — the fix ADDS a tiebreaker, it does not reorder the page.
    expect(rendered[0]).toContain('"due_date"')
    expect(rendered[1]).toContain('"due_date"')
    expect(rendered[2]).toContain('"created_at"')
    // And the last key is the primary key, which no two rows share.
    expect(
      rendered[rendered.length - 1],
      "the final sort key must be unique per row, or a client paging to meta.total either loops " +
        "forever or stops with a set that is missing an activity.",
    ).toContain('"activities"."id"')
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

describe("the deals mock self-test — findFirst answers from the PREDICATE, not from a fixed row", () => {
  // Proven before any CR-01 route assertion depends on it. An unasserted claim about a mock is how a
  // suite ends up unable to fail.
  it("returns a deal when the predicate binds both its id AND its owner", async () => {
    const row = (await dealsFindFirst({
      where: and(eq(deals.id, OWNED_DEAL_ID), eq(deals.ownerId, "user-1")),
    })) as DealRow | undefined

    expect(row?.id).toBe(OWNED_DEAL_ID)
  })

  it("returns nothing when the predicate binds the id and the WRONG owner", async () => {
    const row = (await dealsFindFirst({
      where: and(eq(deals.id, FOREIGN_DEAL_ID), eq(deals.ownerId, "user-1")),
    })) as DealRow | undefined

    expect(row).toBeUndefined()
  })

  it("HANDS THE FOREIGN DEAL BACK to an UNSCOPED lookup — the mock does not do the route's job", async () => {
    // ⚠ The load-bearing cell. If this resolved `undefined`, every 422 below would pass against a
    // route carrying no ownership term at all, because the MOCK would be refusing on its behalf.
    const row = (await dealsFindFirst({ where: eq(deals.id, FOREIGN_DEAL_ID) })) as
      | DealRow
      | undefined

    expect(row?.id).toBe(FOREIGN_DEAL_ID)
    expect(row?.ownerId).toBe("user-9")
  })
})

describe("POST /api/v1/activities — deal_id ownership (CR-01)", () => {
  it("refuses a deal owned by another user with 422 naming deal_id, and creates nothing", async () => {
    const response = await POST(
      createRequest({ title: "x", type_id: "type-1", deal_id: FOREIGN_DEAL_ID })
    )
    const problem = await response.json()

    expect(response.status).toBe(422)
    expect(problem.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "deal_id", code: "invalid_reference" }),
      ])
    )
    // Rejecting the WRITE is the fix. `createActivityMutation` is the only path to the insert, so
    // an absent call is the proof no row was created carrying a foreign `deal_id`.
    expect(mockCreateActivity).not.toHaveBeenCalled()
  })

  it("looks the deal up under an OWNER-SCOPED predicate that binds the caller as a parameter", async () => {
    await POST(createRequest({ title: "x", type_id: "type-1", deal_id: FOREIGN_DEAL_ID }))

    expect(mockDb.query.deals.findFirst).toHaveBeenCalledTimes(1)
    const rendered = renderPredicate(dealWhere())
    const params = renderParams(dealWhere())

    // FLOOR FIRST: an empty render satisfies the negative below for free.
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered).toContain('"owner_id"')
    expect(rendered).toContain('"deleted_at"')
    expect(params).toContain("user-1")
    expect(params).toContain(FOREIGN_DEAL_ID)
    expect(rendered).not.toContain("user-1")
  })

  it("still accepts a deal the caller OWNS with 201 — the refusal is targeted", async () => {
    // The positive anchor. Without it the 422 above is satisfied by a route that refuses every
    // `deal_id`, which is a different bug wearing the same status code.
    const response = await POST(
      createRequest({ title: "x", type_id: "type-1", deal_id: OWNED_DEAL_ID })
    )

    expect(response.status).toBe(201)
    expect(mockCreateActivity).toHaveBeenCalledTimes(1)
    expect(mockCreateActivity.mock.calls[0][0].dealId).toBe(OWNED_DEAL_ID)
  })

  it("refuses a deal_id that exists for NOBODY with the same 422", async () => {
    const response = await POST(
      createRequest({ title: "x", type_id: "type-1", deal_id: "deal-does-not-exist" })
    )

    expect(response.status).toBe(422)
    expect(mockCreateActivity).not.toHaveBeenCalled()
  })

  it("does not look a deal up at all when the body omits deal_id", async () => {
    const response = await POST(createRequest({ title: "x", type_id: "type-1" }))

    expect(response.status).toBe(201)
    expect(mockDb.query.deals.findFirst).not.toHaveBeenCalled()
  })

  it("refuses the FOREIGN owner_id before it ever probes which deals exist", async () => {
    // Ordering: the owner_id refusal already established by SC-2b must still come first, so a
    // caller who cannot create the row at all does not get a deal-existence oracle for free.
    const response = await POST(
      createRequest({
        title: "x",
        type_id: "type-1",
        owner_id: "user-9",
        deal_id: OWNED_DEAL_ID,
      })
    )

    expect(response.status).toBe(422)
    expect(mockDb.query.deals.findFirst).not.toHaveBeenCalled()
    expect(mockCreateActivity).not.toHaveBeenCalled()
  })
})
