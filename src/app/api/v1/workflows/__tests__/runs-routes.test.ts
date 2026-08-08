import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Mock db
vi.mock("@/db", () => {
  const mockDb = {
    select: vi.fn(),
  }
  return { db: mockDb }
})

// Mock auth - auto-approve all requests, pass NextRequest through
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((req: NextRequest, handler: Function) =>
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
