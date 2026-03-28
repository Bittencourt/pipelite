import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Mock auth to pass through
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((request: NextRequest, handler: Function) =>
    handler(request, { userId: "u-1", keyId: "key-1" })
  ),
}))

// Mock database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    then: vi.fn(),
  },
}))

describe("GET /api/v1/workflows/:id/runs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns paginated runs list", async () => {
    // Import will fail until Plan 01 creates the route
    const { GET } = await import("../[id]/runs/route")
    const request = new NextRequest(
      "http://localhost/api/v1/workflows/wf-1/runs"
    )
    const response = await GET(request, { params: Promise.resolve({ id: "wf-1" }) })
    const body = await response.json()

    expect(body).toHaveProperty("data")
    expect(body).toHaveProperty("meta")
    expect(Array.isArray(body.data)).toBe(true)
  })

  it("filters by status when query param provided", async () => {
    const { GET } = await import("../[id]/runs/route")
    const request = new NextRequest(
      "http://localhost/api/v1/workflows/wf-1/runs?status=failed"
    )
    const response = await GET(request, { params: Promise.resolve({ id: "wf-1" }) })
    const body = await response.json()

    expect(body).toHaveProperty("data")
  })

  it("returns 404 when workflow does not exist", async () => {
    const { GET } = await import("../[id]/runs/route")
    const request = new NextRequest(
      "http://localhost/api/v1/workflows/nonexistent/runs"
    )
    const response = await GET(request, {
      params: Promise.resolve({ id: "nonexistent" }),
    })

    expect(response.status).toBe(404)
  })
})

describe("GET /api/v1/workflows/:id/runs/:runId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns run with steps inline", async () => {
    const { GET: GET_detail } = await import("../[id]/runs/[runId]/route")
    const request = new NextRequest(
      "http://localhost/api/v1/workflows/wf-1/runs/run-1"
    )
    const response = await GET_detail(request, {
      params: Promise.resolve({ id: "wf-1", runId: "run-1" }),
    })
    const body = await response.json()

    expect(body).toHaveProperty("data")
    expect(body.data).toHaveProperty("steps")
    expect(Array.isArray(body.data.steps)).toBe(true)
  })

  it("returns 404 when run does not exist", async () => {
    const { GET: GET_detail } = await import("../[id]/runs/[runId]/route")
    const request = new NextRequest(
      "http://localhost/api/v1/workflows/wf-1/runs/nonexistent"
    )
    const response = await GET_detail(request, {
      params: Promise.resolve({ id: "wf-1", runId: "nonexistent" }),
    })

    expect(response.status).toBe(404)
  })
})
