import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"
// Type-only import: erased at runtime, so it does not resurrect the mocked module below.
import type { ApiAuthContext } from "@/lib/api/auth"

/** Mirrors the real `withApiAuth` handler contract in src/lib/api/auth.ts. */
type ApiRouteHandler = (
  request: NextRequest,
  context: ApiAuthContext
) => Promise<NextResponse>

/**
 * `GET /api/v1/stages` — the owner-scoping predicate, and the route's binding to it.
 *
 * THE TWO DEFECTS UNDER TEST.
 *
 * QG-03. The route fetched a GLOBAL page of stages, derived a JavaScript array of pipeline ids
 * from that page, and interpolated the array into a raw SQL fragment:
 * ``sql`${pipelines.id} IN ${pipelineIds}` ``. `parsePagination` clamps `offset` at zero and
 * imposes NO ceiling, so any `?offset=` at or past the global stage count made that page empty,
 * made the array empty, and emitted `"pipelines"."id" IN ()` — which PostgreSQL rejects with
 * `42601 syntax error at or near ")"`. This was a LIVE 500 reachable from the public API with one
 * query parameter, not a latent one.
 *
 * F3. The same route paginated BEFORE it authorized: `offset`/`limit` were applied to the whole
 * `stages` table and ownership was enforced afterwards in JavaScript. Measured, `?limit=5`
 * returned `data: []` with `meta.total: 1` for the stage's OWN owner, because the total was
 * computed from a second, correctly-scoped query while the page was not.
 *
 * WHAT THIS FILE PROVES, AND WHAT IT DOES NOT.
 *
 * It proves the STRUCTURE: that one predicate names `owner_id`, binds the caller id as a
 * parameter, renders no empty `IN ()` in any form, and is the expression handed to BOTH the page
 * `where` and the count `where`; and that pagination is applied after it.
 *
 * It does NOT prove SC-5. SC-5 is behavioural — `GET /api/v1/stages?offset=<count>` returning 200
 * with `data: []` where it returned 500 before — and it is owned by plan 48-07 against a real
 * PostgreSQL. Nothing here talks to a database.
 */

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {
      pipelines: { findFirst: vi.fn(), findMany: vi.fn() },
      stages: { findMany: vi.fn() },
    },
  },
}))

// Auth bypass: this suite is about what the handler does AFTER authentication. `withApiAuth`
// itself — bearer parsing, key validation, rate limiting, the api_key actor scope — is covered by
// src/lib/api/auth.test.ts. The bypass is what lets the query shape be asserted on its own.
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((req: NextRequest, handler: ApiRouteHandler) =>
    handler(req, { userId: "user-1", keyId: "key-1" })
  ),
}))

import { db } from "@/db"
import { ownedStagesPredicate } from "@/lib/api/stage-scope"
import { GET } from "@/app/api/v1/stages/route"

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  query: {
    pipelines: {
      findFirst: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
    }
    stages: { findMany: ReturnType<typeof vi.fn> }
  }
}

/**
 * Render a Drizzle expression back to the statement text and bind parameters that would actually
 * be sent to PostgreSQL.
 *
 * WHY THIS IS NOT THE SOURCE GREP THE PHASE FORBIDS. 48-CONTEXT rules out proving the `IN ()` fix
 * by searching route source for ``sql` `` — a text gate over a file is satisfied by the absence of
 * a token, which any rename or reformat also satisfies, and this milestone has already shipped ten
 * gates that could not fail. `sqlToQuery` compiles the expression WITHOUT executing it, so what is
 * asserted below is the statement, not the file that produced it: the route's comments, its
 * identifier names, the helper's own prose and this doc-comment are all invisible to it. Deleting
 * every comment in `stage-scope.ts` changes nothing here; changing the predicate changes
 * everything here. That is the difference between reading code and reading its output.
 *
 * The precedent is src/lib/views/queries.db.test.ts:530-560, which uses `.toSQL()` for the same
 * reason, and src/lib/mutations/activities.test.ts:105-113, which is the `PgDialect` form used
 * when there is no live connection to build a query builder from.
 */
const renderQuery = (where: unknown): { sql: string; params: unknown[] } => {
  const compiled = new PgDialect().sqlToQuery(where as SQL)
  return { sql: compiled.sql, params: compiled.params as unknown[] }
}
const renderPredicate = (where: unknown): string => renderQuery(where).sql

/**
 * A chainable drizzle-builder stand-in.
 *
 * It records method ORDER as well as arguments, because "pagination is applied after
 * authorization" is an ORDERING claim: a builder that only captured arguments would be equally
 * satisfied by `.offset().limit().where()`, which is the defect.
 *
 * `db.select()` hands back a FRESH builder each time and every call is tagged with that builder's
 * index. A single shared stub would force "the page query's where" and "the count query's where"
 * to be told apart by call order alone — and would then pass just as happily if only ONE query
 * ran and called `where` twice, which is precisely the claim being made.
 */
type CallRecord = { builder: number; method: string; args: unknown[] }

const CHAIN_METHODS = [
  "from",
  "innerJoin",
  "leftJoin",
  "where",
  "orderBy",
  "offset",
  "limit",
  "groupBy",
] as const

let callLog: CallRecord[] = []
let builderCount = 0
let resultQueue: unknown[] = []

function makeBuilder(): Record<string, unknown> {
  const index = builderCount++
  const builder: Record<string, unknown> = {}
  for (const method of CHAIN_METHODS) {
    builder[method] = vi.fn((...args: unknown[]) => {
      callLog.push({ builder: index, method, args })
      return builder
    })
  }
  // Thenable: `await chain` and `chain.then(rows => ...)` both resolve by shifting the queue, so
  // the page chain and the count chain can resolve to different arrays.
  builder.then = (
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => {
    callLog.push({ builder: index, method: "then", args: [] })
    const result = resultQueue.length > 0 ? resultQueue.shift() : []
    return Promise.resolve(result).then(onFulfilled, onRejected)
  }
  return builder
}

/** The ordered method names recorded for one builder, `select` included at position 0. */
const methodsFor = (index: number): string[] =>
  callLog.filter((c) => c.builder === index).map((c) => c.method)

/** The first argument handed to `method` on one builder. */
const firstArgFor = (index: number, method: string): unknown =>
  callLog.find((c) => c.builder === index && c.method === method)?.args[0]

/** How many builders `db.select()` produced during the request. */
const builderIndexes = (): number[] => [...new Set(callLog.map((c) => c.builder))]

const stageRow = {
  id: "stage-1",
  pipelineId: "pipe-1",
  name: "Qualified",
  description: null,
  color: "blue",
  type: "open" as const,
  position: 1000,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
}

const pipelineRow = {
  id: "pipe-1",
  name: "Sales",
  isDefault: 1,
  ownerId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
}

function stagesRequest(query = ""): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/stages${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  callLog = []
  builderCount = 0
  // Page chain resolves first, count chain second.
  resultQueue = [[{ stage: stageRow, pipeline: pipelineRow }], [{ count: 1 }]]

  mockDb.select.mockImplementation((...args: unknown[]) => {
    const builder = makeBuilder()
    // `select` itself is recorded so the ordered log starts at the head of the chain.
    callLog.push({ builder: builderCount - 1, method: "select", args })
    return builder
  })
  mockDb.query.pipelines.findFirst.mockResolvedValue(pipelineRow)
  // Resolve to `[]` rather than `undefined` so that, while the route is still unfixed, this file
  // fails on its ASSERTIONS instead of crashing inside the route — a crash proves nothing.
  mockDb.query.pipelines.findMany.mockResolvedValue([])
  mockDb.query.stages.findMany.mockResolvedValue([])
})

describe("ownedStagesPredicate — the compiled statement", () => {
  it("names owner_id and deleted_at and binds the caller id as a parameter", () => {
    const { sql, params } = renderQuery(ownedStagesPredicate("user-1", null))

    // FLOOR FIRST. Every `not.toContain` below would be satisfied vacuously by an empty render,
    // so the positive containments are asserted before any negative one.
    expect(sql.length).toBeGreaterThan(0)
    expect(sql).toContain('"owner_id"')
    expect(sql).toContain('"deleted_at"')
    expect(params).toContain("user-1")

    // Statement hygiene: the caller id reaches PostgreSQL as a bind parameter, never as text
    // spliced into the statement.
    expect(sql).not.toContain("user-1")
  })

  it("adds the pipeline filter and binds both ids when a pipeline_id is supplied", () => {
    const { sql, params } = renderQuery(ownedStagesPredicate("user-1", "pipe-1"))

    expect(sql.length).toBeGreaterThan(0)
    expect(sql).toContain('"owner_id"')
    expect(sql).toContain('"deleted_at"')
    expect(sql).toContain('"pipeline_id"')
    expect(params).toContain("user-1")
    expect(params).toContain("pipe-1")

    expect(sql).not.toContain("user-1")
    expect(sql).not.toContain("pipe-1")
  })

  it("renders no empty IN, in either form", () => {
    const bare = renderPredicate(ownedStagesPredicate("user-1", null))
    const filtered = renderPredicate(ownedStagesPredicate("user-1", "pipe-1"))

    // Floored: an empty string would satisfy the two `not.toMatch` calls for free.
    expect(bare.length).toBeGreaterThan(0)
    expect(filtered.length).toBeGreaterThan(0)

    // `in` followed by optional whitespace and an empty parenthesis pair — the `42601` shape.
    const EMPTY_IN = /\bin\s*\(\s*\)/i
    expect(bare).not.toMatch(EMPTY_IN)
    expect(filtered).not.toMatch(EMPTY_IN)
  })
})

describe("GET /api/v1/stages — the route is bound to the predicate", () => {
  it("issues no pipelines list query: the array that produced IN () no longer exists", async () => {
    await GET(stagesRequest())

    expect(mockDb.query.pipelines.findMany).not.toHaveBeenCalled()
    // The relational page query is gone too — the page is the joined select.
    expect(mockDb.query.stages.findMany).not.toHaveBeenCalled()
  })

  it("computes the page and the total from ONE predicate (F3)", async () => {
    await GET(stagesRequest())

    const builders = builderIndexes()
    // FLOOR: two selects actually ran. Without this, the render comparison below could compare a
    // value to itself, or two `undefined`s.
    expect(builders).toHaveLength(2)

    const pageWhere = firstArgFor(builders[0], "where")
    const countWhere = firstArgFor(builders[1], "where")
    expect(pageWhere).toBeDefined()
    expect(countWhere).toBeDefined()

    const pageSql = renderPredicate(pageWhere)
    const countSql = renderPredicate(countWhere)
    const expected = renderPredicate(ownedStagesPredicate("user-1", null))

    expect(pageSql.length).toBeGreaterThan(0)
    expect(pageSql).toBe(countSql)
    expect(pageSql).toBe(expected)
  })

  it("applies the pipeline filter to both queries when pipeline_id is supplied", async () => {
    await GET(stagesRequest("?pipeline_id=pipe-1"))

    const builders = builderIndexes()
    expect(builders).toHaveLength(2)

    const pageSql = renderPredicate(firstArgFor(builders[0], "where"))
    const countSql = renderPredicate(firstArgFor(builders[1], "where"))
    const expected = renderPredicate(ownedStagesPredicate("user-1", "pipe-1"))

    expect(pageSql).toContain('"pipeline_id"')
    expect(pageSql).toBe(countSql)
    expect(pageSql).toBe(expected)
  })

  it("joins pipelines and paginates AFTER the ownership predicate", async () => {
    await GET(stagesRequest("?limit=5"))

    const builders = builderIndexes()
    expect(builders).toHaveLength(2)

    const methods = methodsFor(builders[0])
    // FLOOR: all three stages of the chain are present before their order is compared, so a
    // missing `offset` cannot make an index comparison pass by accident.
    expect(methods).toContain("innerJoin")
    expect(methods).toContain("where")
    expect(methods).toContain("offset")
    expect(methods).toContain("limit")

    expect(methods.indexOf("where")).toBeLessThan(methods.indexOf("offset"))
    expect(methods.indexOf("where")).toBeLessThan(methods.indexOf("limit"))
    expect(methods.indexOf("innerJoin")).toBeLessThan(methods.indexOf("where"))
  })

  it("returns the owner's own stage for a small limit, with a matching total", async () => {
    const res = await GET(stagesRequest("?limit=5"))
    const body = (await res.json()) as {
      data: Array<Record<string, unknown>>
      meta: { total: number; offset: number; limit: number }
    }

    // The measured F3 symptom was `data: []` alongside `meta.total: 1` for the stage's own owner.
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe("stage-1")
    expect(body.meta.total).toBe(1)
    expect(body.meta.limit).toBe(5)
  })

  it("omits the joined pipeline unless expand=pipeline is requested", async () => {
    const bare = await GET(stagesRequest())
    const bareBody = (await bare.json()) as { data: Array<Record<string, unknown>> }
    expect(bareBody.data[0]).not.toHaveProperty("pipeline")

    // The pipeline row is now ALWAYS joined, so this `expand` gate is the only thing keeping it
    // out of a bare response.
    callLog = []
    builderCount = 0
    resultQueue = [[{ stage: stageRow, pipeline: pipelineRow }], [{ count: 1 }]]
    const expanded = await GET(stagesRequest("?expand=pipeline"))
    const expandedBody = (await expanded.json()) as {
      data: Array<Record<string, unknown>>
    }
    expect(expandedBody.data[0].pipeline).toMatchObject({ id: "pipe-1", owner_id: "user-1" })
  })

  it("keeps the 404 contract for an unknown or foreign pipeline_id", async () => {
    mockDb.query.pipelines.findFirst.mockResolvedValue(undefined)

    const res = await GET(stagesRequest("?pipeline_id=someone-elses"))

    expect(res.status).toBe(404)
    expect(mockDb.select).not.toHaveBeenCalled()
  })
})
