/**
 * `POST /api/v1/organizations` — the canonical create read (DATA-02, Phase 49).
 *
 * WHY THIS FILE EXISTS AT ALL. DATA-02 is a FOUR-entity criterion: the 201 body of every create
 * must be a row read back out of the database, not the row the write returned. Three of the four
 * collection POSTs already had unit coverage — `deals/__tests__/formula-recalc.test.ts`,
 * `people/__tests__/formula-recalc.test.ts` and `activities/__tests__/route.test.ts`. This one had
 * NONE: `src/app/api/v1/organizations/route.ts` shipped with no test file whatsoever. A four-entity
 * criterion proved at three-quarters coverage is exactly how a fix half-ships, and the untested
 * entity is the one that gets missed. So this file is created by the same plan that lands the fix.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. Every claim here is a MOCKED-UNIT claim. It proves the route
 * issues a re-read, that the 201 body comes from what that read resolved, and that the predicate
 * handed to the read carries all three of the GET's terms. It does NOT prove the response agrees
 * with a real subsequent GET against real PostgreSQL, and — recorded deliberately — it does NOT
 * discriminate a canonical read from the in-process merge `{ ...row, customFields: recalculated }`
 * that Phase 49 REJECTED: that merge passes every cell below. The behavioural, real-database,
 * four-entity proof is plan 49-05's, and nothing here may be cited in its place.
 *
 * DATA-02 IS A LATENT DEFECT — nothing diverges in production today, because divergence needs at
 * least one `type='formula'` custom-field definition and there are zero. A test written against
 * live definitions would therefore be green BEFORE and AFTER the fix. The two fixtures below
 * manufacture the divergence instead, in the same way `RECALC_RESULT` does in the deals file.
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

/**
 * `db.select({...}).from(organizations).where(cond)` is awaited directly by the GET's count query,
 * so the `where` step must return a thenable. POST never reaches it, but the module-level mock has
 * to satisfy both handlers in the file under test.
 */
const countWhere = vi.fn<(condition: unknown) => Promise<{ total: number }[]>>(() =>
  Promise.resolve([{ total: 0 }])
)
const countFrom = vi.fn<(table: unknown) => { where: typeof countWhere }>(() => ({
  where: countWhere,
}))

vi.mock("@/db", () => ({
  db: {
    query: {
      organizations: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    select: vi.fn(() => ({ from: countFrom })),
  },
}))

// Auth bypass: this suite is about what the route does AFTER authentication.
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((req: NextRequest, handler: ApiRouteHandler) =>
    handler(req, { userId: "user-1", keyId: "key-1" })
  ),
}))

vi.mock("@/lib/mutations/organizations", () => ({
  createOrganizationMutation: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { db } from "@/db"
import { log } from "@/lib/log"
import { createOrganizationMutation } from "@/lib/mutations/organizations"
import { PgDialect } from "drizzle-orm/pg-core"
import { type SQL } from "drizzle-orm"
// A RUNTIME import: `@/db/schema/organizations` is NOT mocked, and it does not import `@/db`, so
// the real column objects are available for the rendered-predicate assertion below.
import { organizations } from "@/db/schema/organizations"
import { POST } from "@/app/api/v1/organizations/route"

const mockDb = db as unknown as {
  query: {
    organizations: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
  }
  select: ReturnType<typeof vi.fn>
}

const mockCreateOrg = vi.mocked(createOrganizationMutation)
const mockLogError = vi.mocked(log.error)

/**
 * Render a Drizzle `where` back to SQL text plus bound parameters.
 *
 * A mocked query builder DISCARDS its `where`: `findFirst` is a `vi.fn()` resolving whatever the
 * test told it to, entirely regardless of the predicate handed in. The predicate is therefore
 * unobservable by any assertion on the response body — a re-read that dropped the owner term would
 * pass every body assertion in this file. Rendering it is the only way to see it.
 *
 * READ THIS BEFORE TRUSTING IT: a rendered-predicate assertion is a COMPILED-STRUCTURE claim — "the
 * route asked the database for this SQL" — and NOT a behavioural proof that the database refuses
 * another owner's row. It also covers THIS ROUTE ONLY; the other three POSTs have no equivalent,
 * and cross-route predicate coverage is plan 49-05's.
 */
const renderQuery = (where: unknown) => new PgDialect().sqlToQuery(where as SQL)
const renderPredicate = (where: unknown): string => renderQuery(where).sql
const renderParams = (where: unknown): unknown[] => renderQuery(where).params

/* ------------------------------------------------------------------------------------------ *
 * Fixtures
 *
 * The two rows are DELIBERATELY UNEQUAL, in the voice `RECALC_RESULT` uses in the deals file: the
 * row the mutation returns carries the PRE-recalc blob (it is the `.returning()` row, captured
 * before `recalculateFormulas` writes), and the row the re-read resolves carries the POST-recalc
 * blob. That inequality is the whole mechanism — it is what stops an implementation that serializes
 * the wrong one of the two from passing by accident. Make them equal and every cell below goes
 * vacuous while still reading like a proof.
 *
 * They differ in `customFields` and NOWHERE ELSE, including `updatedAt`, because the recalc issues
 * one `db.update` that sets only `customFields` (`src/lib/formula-recalc.ts:960-991`).
 * ------------------------------------------------------------------------------------------ */

const ORG_ID = "org-1"

/** What the row holds BEFORE recalculation — what `.returning()` handed back. */
const STORED_CUSTOM_FIELDS: Record<string, unknown> = { Segmento: ["Enterprise"] }

/** What the row holds AFTER recalculation — what a subsequent GET would return. */
const RECALC_RESULT: Record<string, unknown> = {
  Segmento: ["Enterprise"],
  Score: { formula: true, value: 42, error: null },
}

const preRecalcOrg = {
  id: ORG_ID,
  name: "Acme Corp",
  normalizedName: "acme corp",
  website: "https://acme.com",
  industry: "Tech",
  notes: null,
  ownerId: "user-1",
  customFields: STORED_CUSTOM_FIELDS,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
} as unknown as typeof organizations.$inferSelect

const canonicalOrg = {
  ...preRecalcOrg,
  customFields: RECALC_RESULT,
} as unknown as typeof organizations.$inferSelect

/**
 * Exactly one canonical read per create. Named rather than inlined because the floor is the load-
 * bearing half: ZERO calls means no re-read was issued at all, which is the shipped defect, and a
 * bare `toBeGreaterThan(0)` would let a duplicated read through.
 */
const CANONICAL_READS_PER_POST = 1

/* ------------------------------------------------------------------------------------------ *
 * Request helper
 * ------------------------------------------------------------------------------------------ */

function createRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/organizations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

/** The `where` the route handed to the canonical read on the most recent POST. */
const canonicalWhere = (): unknown =>
  mockDb.query.organizations.findFirst.mock.calls[0]?.[0]?.where

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.select.mockReturnValue({ from: countFrom })
  countFrom.mockReturnValue({ where: countWhere })
  countWhere.mockResolvedValue([{ total: 0 }])
  mockCreateOrg.mockResolvedValue({ success: true, id: ORG_ID, organization: preRecalcOrg })
  mockDb.query.organizations.findFirst.mockResolvedValue(canonicalOrg)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("POST /api/v1/organizations — the 201 body is a canonical read (DATA-02)", () => {
  it("returns 201 for a valid create", async () => {
    const response = await POST(createRequest({ name: "Acme Corp" }))

    expect(response.status).toBe(201)
    expect(mockCreateOrg).toHaveBeenCalledTimes(1)
  })

  it("serializes the row the RE-READ resolved, not the row the mutation returned", async () => {
    const response = await POST(createRequest({ name: "Acme Corp" }))
    const body = await response.json()

    // TWO-SIDED, and both halves are needed. The first pins the body to the canonical row; the
    // second is what fails against the shipped route, which serialized `result.organization`.
    expect(body.data.custom_fields).toEqual(RECALC_RESULT)
    expect(body.data.custom_fields).not.toEqual(STORED_CUSTOM_FIELDS)
  })

  it("issues exactly one canonical read per create", async () => {
    await POST(createRequest({ name: "Acme Corp" }))

    expect(
      mockDb.query.organizations.findFirst.mock.calls.length,
      "zero calls means no re-read was issued and the 201 body is still the .returning() row — " +
        "the DATA-02 defect. More than one means the create pays for a read twice.",
    ).toBe(CANONICAL_READS_PER_POST)
  })

  it("reads back by the id the mutation reported, not by anything from the request body", async () => {
    await POST(createRequest({ name: "Acme Corp" }))

    expect(renderParams(canonicalWhere())).toContain(ORG_ID)
  })

  it("names id, OWNER and the soft-delete guard in the rendered predicate", async () => {
    await POST(createRequest({ name: "Acme Corp" }))

    const rendered = renderPredicate(canonicalWhere())
    const params = renderParams(canonicalWhere())

    // The read must be the GET's read. A point lookup on the primary key alone would satisfy every
    // body assertion above while quietly being a different query from the one GET issues, which is
    // the entire premise of "one code path defines truth".
    expect(rendered).toContain('"organizations"."id"')
    expect(rendered, "the owner term is what makes this the GET's predicate").toContain(
      '"organizations"."owner_id"',
    )
    expect(rendered, "a soft-deleted row must not be readable through the create response").toContain(
      '"organizations"."deleted_at" is null',
    )
    expect(params).toContain("user-1")
  })

  it("does NOT assemble the body from the mutation's row plus anything else", async () => {
    // The rejected in-process merge would keep `preRecalcOrg`'s own fields and overwrite only
    // `custom_fields`. Here the canonical row is the sole source, so a field that differs between
    // the two fixtures would expose a merge. They differ only in `customFields` by construction —
    // which is precisely why this cell CANNOT catch the merge, and why it says so out loud rather
    // than standing in for a proof it does not deliver. Plan 49-05 owns that discrimination.
    const response = await POST(createRequest({ name: "Acme Corp" }))
    const body = await response.json()

    expect(body.data.id).toBe(ORG_ID)
    expect(body.data.owner_id).toBe("user-1")
  })

  it("logs, rather than silently reproducing the defect, when the re-read finds nothing", async () => {
    // The impossible case: the insert just committed a row whose `ownerId` is the value being
    // matched, so this cannot happen. The fallback exists so a create cannot fail on a read, and it
    // is LOGGED because an unlogged fallback is a path that reproduces DATA-02 and says nothing.
    mockDb.query.organizations.findFirst.mockResolvedValue(undefined)

    const response = await POST(createRequest({ name: "Acme Corp" }))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.data.custom_fields).toEqual(STORED_CUSTOM_FIELDS)
    expect(mockLogError).toHaveBeenCalledTimes(1)
    // A string-literal scope in the first argument position — `src/lib/log-scope-format.test.ts`
    // asserts call-site equality between `log.<level>(` occurrences and extracted scope literals.
    expect(mockLogError.mock.calls[0][0]).toBe("api/v1/organizations")
    expect(mockLogError.mock.calls[0][2]).toMatchObject({ id: ORG_ID })
  })

  it("issues NO canonical read when the mutation fails, and returns the validation problem", async () => {
    mockCreateOrg.mockResolvedValue({ success: false, error: "duplicate organization" })

    const response = await POST(createRequest({ name: "Acme Corp" }))
    const problem = await response.json()

    expect(response.status).toBe(422)
    expect(problem.errors).toEqual([
      { field: "body", code: "mutation_error", message: "duplicate organization" },
    ])
    // Nothing was written, so there is nothing to read back — and a read here would be a lookup on
    // an id that does not exist.
    expect(mockDb.query.organizations.findFirst).not.toHaveBeenCalled()
  })

  it("issues NO canonical read when validation rejects the body before any write", async () => {
    const response = await POST(createRequest({ name: "" }))

    expect(response.status).toBe(422)
    expect(mockCreateOrg).not.toHaveBeenCalled()
    expect(mockDb.query.organizations.findFirst).not.toHaveBeenCalled()
  })
})

describe("the fixtures self-test — the two rows are unequal, so the cells above can fail", () => {
  // An unasserted claim about a fixture is how a suite ends up unable to fail. If these two ever
  // became equal, every body assertion above would pass against BOTH the fixed and the defective
  // route while still reading like a proof.
  it("the pre-recalc and canonical custom-field blobs are NOT equal", () => {
    expect(STORED_CUSTOM_FIELDS).not.toEqual(RECALC_RESULT)
    expect(preRecalcOrg.customFields).not.toEqual(canonicalOrg.customFields)
  })

  it("they differ in customFields and nowhere else — including updatedAt", () => {
    // The recalc issues one `db.update` setting only `customFields`, and deliberately does not bump
    // `updatedAt` (`src/lib/formula-recalc.ts:960-991`). A fixture that also differed in, say,
    // `updatedAt` would let a body assertion pass on a difference production never produces.
    const differing = (Object.keys(preRecalcOrg) as (keyof typeof preRecalcOrg)[]).filter(
      key => preRecalcOrg[key] !== canonicalOrg[key],
    )

    expect(differing).toEqual(["customFields"])
  })
})
