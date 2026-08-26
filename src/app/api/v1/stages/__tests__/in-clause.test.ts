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
 * from that page, and interpolated that array into a raw SQL membership fragment (quoted in full
 * in the header of `src/lib/api/stage-scope.ts`, and deliberately not re-quoted here).
 * `parsePagination` clamps `offset` at zero and imposes NO ceiling, so any `?offset=` at or past
 * the global stage count made that page empty, made the array empty, and emitted an empty
 * membership list — which PostgreSQL rejects with `42601 syntax error at or near ")"`. This was a
 * LIVE 500 reachable from the public API with one query parameter, not a latent one.
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
import {
  MANDATORY_SCOPE_TERMS,
  ownedStagesPredicate,
  requireScopedPredicate,
} from "@/lib/api/stage-scope"
import { GET } from "@/app/api/v1/stages/route"
// Real column objects and real drizzle combinators, for the WR-07 controls below: they have to build
// the same expressions the helper builds, or they are testing something else.
import { and, eq, isNull } from "drizzle-orm"
import { QueryBuilder } from "drizzle-orm/pg-core"
import { pipelines, stages } from "@/db/schema"

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

/**
 * ALL arguments handed to `method` on one builder.
 *
 * `orderBy` is variadic and WR-02 is a claim about its second argument, so `firstArgFor` cannot see
 * the defect: a route ordering by a non-unique key alone and a route ordering by that key plus a
 * unique tiebreaker have identical first arguments.
 */
const argsFor = (index: number, method: string): unknown[] =>
  callLog.find((c) => c.builder === index && c.method === method)?.args ?? []

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

/* ---------------------------------------------------------------------------------------------
 * WR-07 — the scope cannot collapse into an unfiltered query
 *
 * `ownedStagesPredicate` used to end `) as SQL`. `and(...)` is typed `SQL | undefined`, and the cast
 * was the only thing standing between a future edit and `.where(undefined)` — which drizzle renders
 * as NO WHERE CLAUSE. The cast is gone; the narrowing is checked. These are the assertions that make
 * that claim falsifiable rather than described.
 * ------------------------------------------------------------------------------------------ */

describe("drizzle's actual behaviour, which is why the guard exists at all", () => {
  it("`and()` over nothing is `undefined`, and `.where(undefined)` emits NO where clause", () => {
    // ⚠ NOT a proof of anything about our code — it is a MEASUREMENT of drizzle, green before and
    // after WR-07. It is here so the hazard is a rendered statement in the suite rather than a claim
    // in a comment, and so a drizzle upgrade that changed this semantics would surface here.
    expect(and()).toBeUndefined()

    const qb = new QueryBuilder()
    const join = eq(stages.pipelineId, pipelines.id)

    const scoped = qb
      .select()
      .from(stages)
      .innerJoin(pipelines, join)
      .where(and(eq(pipelines.ownerId, "user-1"), isNull(pipelines.deletedAt)))
      .toSQL().sql
    const collapsed = qb
      .select()
      .from(stages)
      .innerJoin(pipelines, join)
      // The exact value the removed `as SQL` allowed to reach this call.
      .where(undefined)
      .toSQL().sql

    // FLOOR: the scoped form really does emit a where clause, so the negative below is a difference
    // rather than a property of `toSQL()`.
    expect(scoped).toContain(" where ")
    expect(scoped).toContain('"owner_id"')

    expect(collapsed).not.toContain(" where ")
    expect(collapsed).toContain("inner join")
    // Every stage joined to every pipeline, for every caller — page and count alike, since both
    // consume this one expression.
    expect(collapsed).not.toContain('"owner_id" =')
  })
})

describe("requireScopedPredicate — the checked narrowing that replaced `as SQL`", () => {
  it("throws rather than handing back `undefined`", () => {
    expect(() => requireScopedPredicate(undefined, MANDATORY_SCOPE_TERMS)).toThrow(
      /NO WHERE CLAUSE/,
    )
  })

  it("throws when the conjunction is valid but has LOST the owner term", () => {
    // The second half, and the one a plain non-null check would miss: `and(isNull(...))` is a
    // perfectly good `SQL` and still returns other people's stages. This is the shape of the future
    // edit the review names — an admin path or a nullable userId making the owner term conditional.
    expect(() => requireScopedPredicate(and(isNull(pipelines.deletedAt)), 1)).toThrow(
      /mandatory/,
    )
  })

  it("returns a predicate that carries both mandatory terms — the guard does not reject everything", () => {
    // The anti-vacuity anchor. A guard that threw unconditionally satisfies both assertions above
    // and would take the whole endpoint down with it.
    const real = and(eq(pipelines.ownerId, "user-1"), isNull(pipelines.deletedAt))
    const returned = requireScopedPredicate(real, MANDATORY_SCOPE_TERMS)

    expect(returned).toBe(real)
    expect(renderPredicate(returned)).toContain('"owner_id"')
  })

  it("names 2 mandatory terms — the owner equality and the soft-delete guard", () => {
    // Pinned, because lowering it to 1 or 0 is how a future edit would make the guard pass while
    // the owner term was gone.
    expect(MANDATORY_SCOPE_TERMS).toBe(2)
  })

  it("carries the subject through, so a caller other than this helper names ITSELF in the throw", () => {
    // WR-11. `src/lib/execution/actions/crm.ts` and `src/lib/triggers/matcher.ts` both reach this
    // guard now. A throw that said "ownedStagesPredicate" from inside the workflow engine would
    // send a reader to the wrong file.
    expect(() => requireScopedPredicate(undefined, MANDATORY_SCOPE_TERMS, "crm_action's callerScope")).toThrow(
      /crm_action's callerScope produced no predicate at all/,
    )
    expect(() => requireScopedPredicate(and(isNull(pipelines.deletedAt)), 1, "matchAndFireTriggers' owner scope")).toThrow(
      /matchAndFireTriggers' owner scope built 1 term/,
    )
    // The default is unchanged, which is what the two cells above this one read.
    expect(() => requireScopedPredicate(undefined, MANDATORY_SCOPE_TERMS)).toThrow(
      /ownedStagesPredicate produced no predicate/,
    )
  })
})

describe("WR-11 — `and(...)` does NOT make a collapse a type error, which is why the guard exists", () => {
  /*
   * `crm.ts`'s `callerScope` used to carry a docstring asserting that nesting a possibly-collapsed
   * `and()` inside a further `and()` with a non-optional term "makes an accidental collapse a type
   * error rather than a silent full-table read". These cells are the counter-proof, measured
   * against the REAL drizzle in this repository's own `node_modules` rather than argued from its
   * type signature — `drizzle-orm`'s `and` is
   * `(...conditions: (SQLWrapper | undefined)[]) => SQL | undefined` and its body filters
   * `undefined` out.
   *
   * They belong in THIS file because it is the one place in the repo that compiles predicates
   * without a database and without mocking `drizzle-orm`.
   */

  it("silently DROPS an `undefined` argument instead of rejecting it", () => {
    // The shape `crm.ts` nested: a scope term that collapsed, inside an outer `and` with a real
    // term. It compiles — `tsc --noEmit` exits 0 over this file — and it renders as the unscoped
    // query CR-02 was.
    const collapsed = and(eq(stages.pipelineId, "pipeline-1"), undefined)

    expect(collapsed).not.toBeUndefined()
    expect(renderPredicate(collapsed)).toContain('"pipeline_id"')
    // AND THE POINT: the term that vanished left no trace of itself.
    expect(renderPredicate(collapsed)).not.toContain('"owner_id"')
  })

  it("returns `undefined` — not an error — when every argument was `undefined`", () => {
    // `.where(undefined)` is drizzle's NO WHERE CLAUSE, which is the whole reason
    // `requireScopedPredicate` refuses this value rather than casting it away.
    expect(and(undefined, undefined)).toBeUndefined()
  })

  it("ABLATION: the conditional-owner-term edit is REJECTED once the guard is on the path", () => {
    // `callerScope` cannot be driven red from production code — `eq()` and `isNull()` both always
    // return `SQL` — so the evidence for WR-11 is this ablation and not a reproduction. This
    // rebuilds the exact edit `stage-scope.ts`'s header names as the future hazard, in the shape
    // `crm.ts` would take it, and shows the guard now catches it.
    const ablatedCallerScope = (userId: string | undefined) => {
      const terms = [
        ...(userId ? [eq(pipelines.ownerId, userId)] : []),
        isNull(pipelines.deletedAt),
      ]
      return requireScopedPredicate(and(...terms), terms.length, "crm_action's callerScope")
    }

    expect(() => ablatedCallerScope(undefined)).toThrow(/mandatory/)
    expect(() => ablatedCallerScope(undefined)).toThrow(/callerScope/)

    // THE ANTI-VACUITY HALF: with a real caller id the same function returns a predicate that
    // names `owner_id`. A guard that threw unconditionally would satisfy the two lines above and
    // would take every target resolution in the engine down with it.
    expect(renderPredicate(ablatedCallerScope("user-1"))).toContain('"owner_id"')
  })
})

describe("ownedStagesPredicate still names owner_id for degenerate caller ids", () => {
  it("an EMPTY caller id still produces an owner-scoped predicate, not an unscoped one", () => {
    // The review's own fallback control. An empty `ctx.userId` must narrow to nobody's rows, never
    // widen to everybody's — `owner_id = ''` matches no user, which is the correct answer.
    const { sql, params } = renderQuery(ownedStagesPredicate("", null))

    expect(sql.length).toBeGreaterThan(0)
    expect(sql).toContain('"owner_id"')
    expect(sql).toContain('"deleted_at"')
    expect(params).toContain("")
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

  it("orders the page by a TOTAL key: position first, then the unique id as tiebreaker (WR-02)", async () => {
    // THE DEFECT. `stages.position` is unique only WITHIN a pipeline: `POST /api/v1/stages` assigns
    // 1000 to the first stage of every pipeline and `max + 1000` thereafter, so every pipeline a
    // caller owns contributes a stage at 1000, one at 2000, and so on. `LIMIT`/`OFFSET` over a sort
    // with ties is UNSPECIFIED in PostgreSQL: the same row may appear on two pages and another on
    // none, while `meta.total` reports the true count in both responses — so a client paging until
    // it has `total` rows either loops forever or stops with a set that is missing a stage.
    //
    // This is asserted STRUCTURALLY, on the compiled sort keys, and that is a deliberate choice.
    // The behavioural version cannot be a proof: the pre-fix outcome is UNSPECIFIED, not wrong, so a
    // run against a broken route may return correct pages by luck. An unspecified order is the
    // defect; a total order is the fix; the sort keys are what says which one this is.
    await GET(stagesRequest("?limit=5"))

    const builders = builderIndexes()
    expect(builders).toHaveLength(2)

    const keys = argsFor(builders[0], "orderBy")
    // FLOOR: the call happened and carried arguments, so the length claim below is about the sort
    // and not about a missing call.
    expect(keys.length).toBeGreaterThan(0)
    expect(
      keys,
      "the page must be ordered by a key that is unique per row. `position` alone is unique only " +
        "within one pipeline, and a multi-pipeline caller then loses stages between pages.",
    ).toHaveLength(2)

    const rendered = keys.map((key) => renderPredicate(key))
    expect(rendered[0]).toContain('"position"')
    expect(rendered[1]).toContain('"id"')
    // And the tiebreaker is `stages.id` — the primary key — not some other column called `id`.
    expect(rendered[1]).toContain('"stages"."id"')
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
