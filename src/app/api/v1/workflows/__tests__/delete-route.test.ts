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
// `query.workflows.findFirst` serves the route's ownership gate (`getWorkflow(id,
// context.userId)`); `select` serves `deleteWorkflow`'s run-existence check; `delete`
// captures what would actually be removed. The behavioural proof that run history is
// preserved against real PostgreSQL belongs in a .db.test; what this file adds is the
// unit-level differential from issue #11: runs -> typed 409, no runs -> 204.
vi.mock("@/db", () => {
  const mockDb = {
    select: vi.fn(),
    delete: vi.fn(),
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
import { DELETE as deleteWorkflowRoute } from "@/app/api/v1/workflows/[id]/route"

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  query: { workflows: { findFirst: ReturnType<typeof vi.fn> } }
}

/** The workflow row `getWorkflow` resolves when the caller owns it. `user-1` is the mocked ctx. */
const OWNED_WORKFLOW = { id: "wf-1", createdBy: "user-1" }

/** The typed problem body every non-2xx from this API shares (RFC 7807). */
interface ProblemBody {
  type: string
  title: string
  status: number
  detail: string
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default to "the caller owns it", so every cell below measures the thing it was written to
  // measure rather than the ownership gate. `mockResolvedValue` and not `…Once`: this runs
  // after `clearAllMocks`, which clears call records but NOT a once-queue, so a leftover once
  // value would leak into the next cell.
  mockDb.query.workflows.findFirst.mockResolvedValue(OWNED_WORKFLOW)
})

function deleteRequest(): NextRequest {
  return new NextRequest("http://localhost/api/v1/workflows/wf-1", { method: "DELETE" })
}

describe("DELETE /api/v1/workflows/[id] — run-history differential (issue #11)", () => {
  it("answers 204 when the workflow has no runs", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    })
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    })

    const res = await deleteWorkflowRoute(deleteRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    })

    expect(res.status).toBe(204)
    // Only the workflow row itself is deleted — never runs or run steps.
    expect(mockDb.delete).toHaveBeenCalledTimes(1)
  })

  it("answers typed 409 WORKFLOW_HAS_RUNS when run history exists, deleting nothing", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "run-1" }]),
        }),
      }),
    })
    const deleteWhere = vi.fn().mockResolvedValue(undefined)
    mockDb.delete.mockReturnValue({ where: deleteWhere })

    const res = await deleteWorkflowRoute(deleteRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    })

    expect(res.status).toBe(409)
    const body = (await res.json()) as ProblemBody
    expect(body.type).toBe("https://api.pipelite.app/errors/WORKFLOW_HAS_RUNS")
    expect(body.status).toBe(409)
    expect(body.title).toBe("Workflow Has Run History")
    expect(body.detail).toMatch(/run history/i)
    // Run history is preserved: nothing at all is deleted.
    expect(mockDb.delete).not.toHaveBeenCalled()
    expect(deleteWhere).not.toHaveBeenCalled()
  })

  it("answers 404 for a workflow that does not exist", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue(undefined)

    const res = await deleteWorkflowRoute(deleteRequest(), {
      params: Promise.resolve({ id: "wf-missing" }),
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as ProblemBody
    expect(body.type).toBe("https://api.pipelite.app/errors/ENTITY_NOT_FOUND")
  })
})
