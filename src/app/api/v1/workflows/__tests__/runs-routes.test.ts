import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
// Type-only import: erased at runtime, so it does not resurrect the mocked module below.
import type { ApiAuthContext } from "@/lib/api/auth"

/** Mirrors the real `withApiAuth` handler contract in src/lib/api/auth.ts. */
type ApiRouteHandler = (
  request: NextRequest,
  context: ApiAuthContext
) => Promise<NextResponse>

// Mock db
//
// `query.workflows.findFirst` is here because of SEC-48-A: both routes now resolve the workflow
// through `getWorkflow(id, context.userId)` BEFORE touching `workflow_runs`, and `getWorkflow`
// goes through the relational query builder rather than `db.select`. The behavioural proof that
// the scope is real lives in `runs-owner-scope.db.test.ts` against real PostgreSQL and two real
// minted API keys; what this file adds is the unit-level assertion that the predicate carries
// `created_by` and the CALLER's id, which a mocked db can check on the SQL object itself.
vi.mock("@/db", () => {
  const mockDb = {
    select: vi.fn(),
    query: { workflows: { findFirst: vi.fn() } },
  }
  return { db: mockDb }
})

// Mock auth - auto-approve all requests, pass NextRequest through
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((req: NextRequest, handler: ApiRouteHandler) =>
    handler(req, { userId: "user-1", keyId: "key-1" })
  ),
}))

import { db } from "@/db"
import { GET as getRunsList } from "@/app/api/v1/workflows/[id]/runs/route"
import { GET as getRunDetail } from "@/app/api/v1/workflows/[id]/runs/[runId]/route"

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>
  query: { workflows: { findFirst: ReturnType<typeof vi.fn> } }
}

/** The workflow row `getWorkflow` resolves when the caller owns it. `user-1` is the mocked ctx. */
const OWNED_WORKFLOW = { id: "wf-1", createdBy: "user-1" }

beforeEach(() => {
  vi.clearAllMocks()
  // Default to "the caller owns it", so every cell below measures the thing it was written to
  // measure rather than the new ownership gate. `mockResolvedValue` and not `…Once`: this runs
  // after `clearAllMocks`, which clears call records but NOT a once-queue, so a leftover once
  // value would leak into the next cell.
  mockDb.query.workflows.findFirst.mockResolvedValue(OWNED_WORKFLOW)
})

/**
 * Every column name and bound value inside a drizzle condition tree, flattened.
 *
 * `and(...)`/`eq(...)` build nested `SQL` objects whose `queryChunks` hold `Column` and `Param`
 * instances, so the predicate the route passed to `.where(...)` cannot be inspected by equality —
 * and this file uses the REAL drizzle operators (only `@/db` is mocked), which is what makes the
 * assertion meaningful rather than a restatement of a mock.
 */
function conditionParts(node: unknown, seen = new Set<unknown>()): { columns: string[]; values: unknown[] } {
  const columns: string[] = []
  const values: unknown[] = []

  if (!node || typeof node !== "object" || seen.has(node)) return { columns, values }
  seen.add(node)

  const obj = node as Record<string, unknown>

  // A drizzle Column carries both a name and its table; a Param carries a bound value.
  if (typeof obj.name === "string" && obj.table) columns.push(obj.name)
  if ("value" in obj && !("queryChunks" in obj)) values.push(obj.value)

  if (Array.isArray(obj.queryChunks)) {
    for (const chunk of obj.queryChunks) {
      const nested = conditionParts(chunk, seen)
      columns.push(...nested.columns)
      values.push(...nested.values)
    }
  }

  return { columns, values }
}

/** A full `workflowRuns.$inferSelect`-shaped row, as the route hands it to `serializeRun`. */
function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    workflowId: "wf-1",
    status: "completed",
    triggerData: { event: "deal.created" },
    error: null,
    depth: 0,
    context: {},
    currentNodeId: null,
    dryRun: false,
    replayedFromRunId: null,
    startedAt: new Date("2026-03-28T10:00:00Z"),
    completedAt: new Date("2026-03-28T10:00:02Z"),
    createdAt: new Date("2026-03-28T10:00:00Z"),
    ...overrides,
  }
}

/**
 * Wires `db.select` for the list route (page of runs, count) and returns the `where` spy the runs
 * query was handed.
 *
 * SEC-48-A removed a `db.select` from this route: the workflow lookup that used to be
 * `select({id}).from(workflows).where(eq(workflows.id, id))` — existence only — is now
 * `getWorkflow(id, context.userId)`, which goes through `db.query`. So this helper stubs TWO
 * select chains, not three.
 */
function stubRunsList(rows: Record<string, unknown>[]) {
  const runsWhere = vi.fn().mockReturnValue({
    orderBy: vi.fn().mockReturnValue({
      offset: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue(Promise.resolve(rows)),
      }),
    }),
  })

  mockDb.select
    .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: runsWhere }) })
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(Promise.resolve([{ total: rows.length }])),
      }),
    })

  return runsWhere
}

describe("GET /api/v1/workflows/:id/runs", () => {
  it("returns paginated runs for a valid workflow", async () => {
    const mockRun = {
      id: "run-1",
      workflowId: "wf-1",
      status: "completed",
      triggerData: { event: "deal.created" },
      error: null,
      depth: 0,
      context: {},
      currentNodeId: null,
      startedAt: new Date("2026-03-28T10:00:00Z"),
      completedAt: new Date("2026-03-28T10:00:02Z"),
      createdAt: new Date("2026-03-28T10:00:00Z"),
    }

    const runsSelectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            offset: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue(Promise.resolve([mockRun])),
            }),
          }),
        }),
      }),
    }

    const countSelectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(Promise.resolve([{ total: 1 }])),
      }),
    }

    mockDb.select
      .mockReturnValueOnce(runsSelectChain)
      .mockReturnValueOnce(countSelectChain)

    const request = new NextRequest("http://localhost:3000/api/v1/workflows/wf-1/runs?offset=0&limit=20")
    const response = await getRunsList(request, {
      params: Promise.resolve({ id: "wf-1" }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].workflow_id).toBe("wf-1")
    expect(body.data[0].status).toBe("completed")
    expect(body.data[0].started_at).toBe("2026-03-28T10:00:00.000Z")
    expect(body.meta.total).toBe(1)
  })

  // -----------------------------------------------------------------------------------------------
  // WR-02 — the public API used to leak test runs into an integration's view of production runs,
  // unmarked. Every UI surface was taught about `dry_run`; the one place a MACHINE consumes it was
  // not, and a consumer cannot filter out something it cannot see.
  // -----------------------------------------------------------------------------------------------

  it("hides test runs by default", async () => {
    const runsWhere = stubRunsList([runRow()])

    const request = new NextRequest("http://localhost:3000/api/v1/workflows/wf-1/runs")
    await getRunsList(request, { params: Promise.resolve({ id: "wf-1" }) })

    const parts = conditionParts(runsWhere.mock.calls[0]?.[0])
    const why =
      "A monitoring integration polling ?status=failed counts every failed test run as a " +
      "production failure and pages someone; a success-rate job mixes them into its denominator. " +
      "Hiding them by default is the same posture as the UI list, and it is back-compatible: " +
      "`dry_run` is NOT NULL DEFAULT false, so the pre-phase corpus is entirely real runs."
    expect(parts.columns, why).toContain("dry_run")
    expect(parts.values, why).toContain(false)
  })

  it("returns test runs when the caller opts in with ?dry_run=true", async () => {
    const runsWhere = stubRunsList([runRow({ id: "run-dry", dryRun: true })])

    const request = new NextRequest(
      "http://localhost:3000/api/v1/workflows/wf-1/runs?dry_run=true"
    )
    const response = await getRunsList(request, { params: Promise.resolve({ id: "wf-1" }) })

    const parts = conditionParts(runsWhere.mock.calls[0]?.[0])
    expect(
      parts.columns,
      "The default is a posture, not a prohibition: an integration that wants test runs must be " +
        "able to ask for them, or it has to reach for the database instead."
    ).not.toContain("dry_run")

    const body = await response.json()
    expect(body.data[0].dry_run).toBe(true)
  })

  it("still applies the status filter alongside the dry-run default", async () => {
    const runsWhere = stubRunsList([runRow({ status: "failed" })])

    const request = new NextRequest(
      "http://localhost:3000/api/v1/workflows/wf-1/runs?status=failed"
    )
    await getRunsList(request, { params: Promise.resolve({ id: "wf-1" }) })

    const parts = conditionParts(runsWhere.mock.calls[0]?.[0])
    const why = "The two filters compose. The rewrite to an array of conditions must keep both."
    expect(parts.columns, why).toContain("status")
    expect(parts.values, why).toContain("failed")
    expect(parts.columns, why).toContain("dry_run")
    expect(parts.columns, why).toContain("workflow_id")
  })

  it("marks each returned run, so a consumer that opted in can tell them apart", async () => {
    stubRunsList([runRow()])

    const request = new NextRequest("http://localhost:3000/api/v1/workflows/wf-1/runs")
    const response = await getRunsList(request, { params: Promise.resolve({ id: "wf-1" }) })

    const body = await response.json()
    expect(body.data[0]).toHaveProperty("dry_run", false)
  })

  it("returns 404 when the workflow does not resolve for this caller", async () => {
    // Post-SEC-48-A there is ONE answer here, not two: `getWorkflow(id, ctx.userId)` returns
    // undefined both for an id that does not exist and for an id belonging to somebody else, and
    // the route cannot tell them apart — which is the point. That the two are byte-identical on
    // the wire is asserted behaviourally in `runs-owner-scope.db.test.ts`.
    mockDb.query.workflows.findFirst.mockResolvedValue(undefined)

    const request = new NextRequest("http://localhost:3000/api/v1/workflows/wf-nonexistent/runs")
    const response = await getRunsList(request, {
      params: Promise.resolve({ id: "wf-nonexistent" }),
    })

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.title).toBe("Not Found")

    // AND NO RUN WAS EVER READ. A route that refused after loading and serializing the rows would
    // satisfy the status assertion above while still having pulled another owner's `trigger_data`
    // out of the database.
    expect(
      mockDb.select,
      "the run query must not run at all when the workflow is not the caller's"
    ).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------------------------------
  // SEC-48-A — the ownership predicate itself, read off the SQL object the route built.
  // -----------------------------------------------------------------------------------------------

  it("scopes the workflow lookup by created_by AND the caller's own id", async () => {
    stubRunsList([runRow()])

    const request = new NextRequest("http://localhost:3000/api/v1/workflows/wf-1/runs")
    await getRunsList(request, { params: Promise.resolve({ id: "wf-1" }) })

    expect(mockDb.query.workflows.findFirst).toHaveBeenCalledTimes(1)

    const parts = conditionParts(mockDb.query.workflows.findFirst.mock.calls[0]?.[0]?.where)
    const why =
      "This route used to look the workflow up by id ALONE — `where(eq(workflows.id, id))` — so " +
      "any valid API key could list any workflow's runs, and `serializeRun` returns " +
      "`trigger_data` verbatim, i.e. another owner's CRM row. Both terms are asserted: without " +
      "`created_by` there is no ownership at all, and without the caller's own id the predicate " +
      "could be scoped to a constant."
    expect(parts.columns, why).toContain("created_by")
    expect(parts.values, why).toContain("user-1")
    expect(parts.columns, why).toContain("id")
    expect(parts.values, why).toContain("wf-1")
  })
})

describe("GET /api/v1/workflows/:id/runs/:runId", () => {
  it("returns run with steps inline", async () => {
    const mockRun = {
      id: "run-1",
      workflowId: "wf-1",
      status: "completed",
      triggerData: null,
      error: null,
      depth: 0,
      context: {},
      currentNodeId: null,
      dryRun: false,
      replayedFromRunId: null,
      startedAt: new Date("2026-03-28T10:00:00Z"),
      completedAt: new Date("2026-03-28T10:00:02Z"),
      createdAt: new Date("2026-03-28T10:00:00Z"),
    }

    const mockStep = {
      id: "step-1",
      runId: "run-1",
      nodeId: "node-abc",
      status: "completed",
      input: { url: "https://example.com" },
      output: { status: 200 },
      error: null,
      resumeAt: null,
      startedAt: new Date("2026-03-28T10:00:00Z"),
      completedAt: new Date("2026-03-28T10:00:01Z"),
      createdAt: new Date("2026-03-28T10:00:00Z"),
    }

    const runSelectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue(Promise.resolve([mockRun])),
        }),
      }),
    }

    const stepsSelectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue(Promise.resolve([mockStep])),
        }),
      }),
    }

    mockDb.select
      .mockReturnValueOnce(runSelectChain)
      .mockReturnValueOnce(stepsSelectChain)

    const request = new NextRequest("http://localhost:3000/api/v1/workflows/wf-1/runs/run-1")
    const response = await getRunDetail(request, {
      params: Promise.resolve({ id: "wf-1", runId: "run-1" }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.workflow_id).toBe("wf-1")
    expect(body.data.steps).toHaveLength(1)
    expect(body.data.steps[0].node_id).toBe("node-abc")
    expect(body.data.steps[0].run_id).toBe("run-1")
    expect(body.data.dry_run).toBe(false)
  })

  it("marks a test run rather than hiding it — a caller that has the id already knows it exists", async () => {
    const mockRun = {
      id: "run-dry",
      workflowId: "wf-1",
      status: "failed",
      triggerData: { trigger_type: "manual", trigger_id: "dry_run" },
      error: "HTTP 500",
      depth: 0,
      context: {},
      currentNodeId: null,
      dryRun: true,
      replayedFromRunId: null,
      startedAt: new Date("2026-03-28T10:00:00Z"),
      completedAt: new Date("2026-03-28T10:00:02Z"),
      createdAt: new Date("2026-03-28T10:00:00Z"),
    }

    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue(Promise.resolve([mockRun])),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue(Promise.resolve([])),
          }),
        }),
      })

    const request = new NextRequest("http://localhost:3000/api/v1/workflows/wf-1/runs/run-dry")
    const response = await getRunDetail(request, {
      params: Promise.resolve({ id: "wf-1", runId: "run-dry" }),
    })

    const body = await response.json()
    expect(response.status).toBe(200)
    expect(
      body.data.dry_run,
      "The list hides test runs so they cannot pollute an aggregate. The detail endpoint 404ing " +
        "one would instead hide a run whose id the caller already holds — the flag is the answer " +
        "there, not a refusal."
    ).toBe(true)
  })

  it("returns 404 when run does not exist", async () => {
    const runSelectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue(Promise.resolve([])),
        }),
      }),
    }

    mockDb.select.mockReturnValueOnce(runSelectChain)

    const request = new NextRequest("http://localhost:3000/api/v1/workflows/wf-1/runs/run-nonexistent")
    const response = await getRunDetail(request, {
      params: Promise.resolve({ id: "wf-1", runId: "run-nonexistent" }),
    })

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.title).toBe("Not Found")
  })

  // -----------------------------------------------------------------------------------------------
  // SEC-48-A — this handler's callback used to be `async () => …`, taking no `context` parameter at
  // all, so the caller's identity was not even in scope in the function that returned the row.
  // -----------------------------------------------------------------------------------------------

  it("returns 404 without reading the run when the workflow is not the caller's", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue(undefined)

    const request = new NextRequest("http://localhost:3000/api/v1/workflows/wf-b/runs/run-b")
    const response = await getRunDetail(request, {
      params: Promise.resolve({ id: "wf-b", runId: "run-b" }),
    })

    expect(response.status).toBe(404)
    expect(
      mockDb.select,
      "the workflow must be resolved BEFORE the run is read, so a run belonging to a workflow the " +
        "caller does not own is never loaded — `serializeRun` and `serializeRunStep` both pass " +
        "their payloads through verbatim, so loading it is already the leak"
    ).not.toHaveBeenCalled()
  })

  it("scopes its workflow lookup by created_by AND the caller's own id", async () => {
    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue(Promise.resolve([runRow()])),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue(Promise.resolve([])),
          }),
        }),
      })

    const request = new NextRequest("http://localhost:3000/api/v1/workflows/wf-1/runs/run-1")
    await getRunDetail(request, { params: Promise.resolve({ id: "wf-1", runId: "run-1" }) })

    const parts = conditionParts(mockDb.query.workflows.findFirst.mock.calls[0]?.[0]?.where)
    expect(parts.columns).toContain("created_by")
    expect(parts.values).toContain("user-1")
  })

  it("still requires the run to belong to the workflow in the path", async () => {
    // The `workflowId` term was ALREADY here before SEC-48-A and is retained alongside the new
    // ownership check, not replaced by it: dropping it would let a caller read any run id at all
    // through a workflow they legitimately own, trading one cross-owner read for another.
    const runWhere = vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue(Promise.resolve([])),
    })

    mockDb.select.mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: runWhere }) })

    const request = new NextRequest("http://localhost:3000/api/v1/workflows/wf-1/runs/run-foreign")
    const response = await getRunDetail(request, {
      params: Promise.resolve({ id: "wf-1", runId: "run-foreign" }),
    })

    expect(response.status).toBe(404)

    const parts = conditionParts(runWhere.mock.calls[0]?.[0])
    expect(parts.columns).toContain("workflow_id")
    expect(parts.values).toContain("wf-1")
    expect(parts.values).toContain("run-foreign")
  })
})
