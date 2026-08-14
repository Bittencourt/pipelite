import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
// Type-only import: erased at runtime, so it does not resurrect the mocked module below.
import type { ApiAuthContext } from "@/lib/api/auth"

/** Mirrors the real `withApiAuth` handler contract in src/lib/api/auth.ts. */
type ApiRouteHandler = (
  request: NextRequest,
  context: ApiAuthContext
) => Promise<NextResponse>

// Mock db — `update` is present precisely so a test can prove the route NEVER calls it.
vi.mock("@/db", () => ({
  db: {
    query: {
      organizations: { findFirst: vi.fn() },
    },
    update: vi.fn(),
  },
}))

// Mock auth - auto-approve all requests, pass NextRequest through
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((req: NextRequest, handler: ApiRouteHandler) =>
    handler(req, { userId: "user-1", keyId: "key-1" })
  ),
}))

// Mock the mutation: this suite is about what the ROUTE delegates and returns, not about the
// merge/recalc itself (organizations.test.ts covers that).
vi.mock("@/lib/mutations/organizations", () => ({
  updateOrganizationMutation: vi.fn(async () => ({ success: true })),
  deleteOrganizationMutation: vi.fn(async () => ({ success: true })),
}))

import { db } from "@/db"
import { updateOrganizationMutation } from "@/lib/mutations/organizations"
import { PUT } from "@/app/api/v1/organizations/[id]/route"

const mockDb = db as unknown as {
  query: { organizations: { findFirst: ReturnType<typeof vi.fn> } }
  update: ReturnType<typeof vi.fn>
}

const mockMutation = vi.mocked(updateOrganizationMutation)

beforeEach(() => {
  vi.clearAllMocks()
})

/** The row before the save: `Score` holds a stale computed value. */
const existingOrg = {
  id: "org1",
  name: "Acme Corp",
  website: "https://acme.com",
  industry: "Tech",
  notes: null,
  ownerId: "user-1",
  defaultCurrency: "USD",
  customFields: {
    Origem: ["Inbound"],
    Score: { formula: true, value: 0, error: null },
  } as Record<string, unknown>,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
}

/**
 * The row as it stands AFTER `updateOrganizationMutation` merged, recalculated and persisted:
 * the caller's raw `Score: 999` never lands, and the recomputed wrapper is what is stored.
 */
const postRecalcOrg = {
  ...existingOrg,
  customFields: {
    Origem: ["Outbound Manual"],
    Score: { formula: true, value: 42, error: null },
  } as Record<string, unknown>,
}

function putRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/organizations/org1", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const params = { params: Promise.resolve({ id: "org1" }) }

describe("PUT /api/v1/organizations/:id — single write through the mutation (T-34-19)", () => {
  it("routes custom_fields into the mutation instead of writing them itself", async () => {
    mockDb.query.organizations.findFirst
      .mockResolvedValueOnce(existingOrg)
      .mockResolvedValueOnce(postRecalcOrg)

    const response = await PUT(
      putRequest({ custom_fields: { Origem: ["Outbound Manual"], Score: 999 } }),
      params
    )

    expect(response.status).toBe(200)
    expect(mockMutation).toHaveBeenCalledTimes(1)
    expect(mockMutation).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({
        customFields: { Origem: ["Outbound Manual"], Score: 999 },
      }),
      "user-1"
    )
  })

  it("performs ZERO direct db.update calls — the second write is removed, not left idempotent", async () => {
    mockDb.query.organizations.findFirst
      .mockResolvedValueOnce(existingOrg)
      .mockResolvedValueOnce(postRecalcOrg)

    await PUT(putRequest({ custom_fields: { Score: 999 } }), params)

    // Left in place, this write would land AFTER the mutation's recalculation and overwrite the
    // freshly computed wrapper with the caller's raw blob — a client-controlled overwrite of
    // server-derived data.
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("responds with the RECOMPUTED formula value, not the value the caller sent", async () => {
    mockDb.query.organizations.findFirst
      .mockResolvedValueOnce(existingOrg)
      .mockResolvedValueOnce(postRecalcOrg)

    const response = await PUT(putRequest({ custom_fields: { Score: 999 } }), params)
    const body = await response.json()

    expect(body.data.custom_fields.Score).toEqual({ formula: true, value: 42, error: null })
    expect(body.data.custom_fields.Score).not.toBe(999)
    // And the merge the mutation performed is what the client sees.
    expect(body.data.custom_fields.Origem).toEqual(["Outbound Manual"])
  })

  it("reads the row exactly twice: the ownership check and the response re-fetch", async () => {
    mockDb.query.organizations.findFirst
      .mockResolvedValueOnce(existingOrg)
      .mockResolvedValueOnce(postRecalcOrg)

    await PUT(putRequest({ custom_fields: { Score: 999 } }), params)

    expect(mockDb.query.organizations.findFirst).toHaveBeenCalledTimes(2)
  })

  it("still handles a plain attribute update with no custom_fields", async () => {
    mockDb.query.organizations.findFirst
      .mockResolvedValueOnce(existingOrg)
      .mockResolvedValueOnce({ ...existingOrg, name: "New Acme" })

    const response = await PUT(putRequest({ name: "New Acme" }), params)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.name).toBe("New Acme")
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(Object.keys(mockMutation.mock.calls[0][1])).not.toContain("customFields")
  })

  it("returns 404 without calling the mutation when the organization is not the caller's", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValueOnce(undefined)

    const response = await PUT(putRequest({ custom_fields: { Score: 999 } }), params)

    expect(response.status).toBe(404)
    expect(mockMutation).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})
