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
vi.mock("@/db", () => {
  const mockDb = {
    select: vi.fn(),
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
}

beforeEach(() => {
  vi.clearAllMocks()
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
 * Wires `db.select` for the list route (workflow existence, page of runs, count) and returns the
 * `where` spy the runs query was handed.
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
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue(Promise.resolve([{ id: "wf-1" }])),
        }),
      }),
    })
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

    const workflowSelectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue(Promise.resolve([{ id: "wf-1" }])),
        }),
      }),
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
      .mockReturnValueOnce(workflowSelectChain)
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

  it("returns 404 when workflow does not exist", async () => {
    const workflowSelectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue(Promise.resolve([])),
        }),
      }),
    }

    mockDb.select.mockReturnValueOnce(workflowSelectChain)

    const request = new NextRequest("http://localhost:3000/api/v1/workflows/wf-nonexistent/runs")
    const response = await getRunsList(request, {
      params: Promise.resolve({ id: "wf-nonexistent" }),
    })

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.title).toBe("Not Found")
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
})
