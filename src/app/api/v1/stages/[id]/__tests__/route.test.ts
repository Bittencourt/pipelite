/**
 * GET /api/v1/stages/:id — authorization (SEC-02, ROADMAP SC-4).
 *
 * The defect: the GET builds its relational `with` from the caller's `?expand=pipeline`, so the
 * `pipeline` relation its ownership predicate reads is loaded only when the caller asked for it.
 * Without `?expand`, `stage.pipeline` is undefined, the predicate short-circuits, and the stage's
 * LEGITIMATE OWNER receives 403.
 *
 * ⚠ THE SC-4 VACUITY TRAP — read before treating any assertion here as evidence.
 * SC-4 has four cells. Only ONE of them is red today:
 *
 *   | cell  | caller     | ?expand   | today                        | after fix | status          |
 *   |-------|------------|-----------|------------------------------|-----------|-----------------|
 *   | SC-4a | owner      | no        | 403  ← THE DEFECT            | 200       | THE PROOF       |
 *   | SC-4a'| owner      | yes       | 200                          | 200       | regression guard|
 *   | SC-4b | non-owner  | no        | 403 for the WRONG reason     | 403       | regression guard|
 *   | SC-4b'| non-owner  | yes       | 403                          | 403       | regression guard|
 *
 * Three of the four pass identically before and after the fix. They are retained because deleting
 * the check later must go red — but they are NOT evidence that SEC-02 was fixed, and this file says
 * so at each of them. Only SC-4a is a defect proof.
 *
 * SC-4c guards the leak the FIX ITSELF creates: once the relation is loaded unconditionally,
 * `stage.pipeline` is always populated, so the `expand.has("pipeline") &&` guard in the projection
 * stops being belt-and-braces and becomes the only thing keeping the pipeline object out of a bare
 * GET's body.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
// Type-only imports: erased at runtime, so they do not resurrect the mocked modules below.
import type { ApiAuthContext } from "@/lib/api/auth"
import type { stages, pipelines } from "@/db/schema"

type StageRow = typeof stages.$inferSelect
type PipelineRow = typeof pipelines.$inferSelect
type StageWithPipeline = StageRow & { pipeline?: PipelineRow | null }

/** The subset of Drizzle's findFirst argument this suite cares about. */
type FindFirstArgs = { where?: unknown; with?: { pipeline?: boolean } | undefined } | undefined

/** Mirrors the real `withApiAuth` handler contract in src/lib/api/auth.ts. */
type ApiRouteHandler = (
  request: NextRequest,
  context: ApiAuthContext
) => Promise<NextResponse>

/**
 * Hoisted mock state, so the `vi.mock` factory below can reach it.
 *
 * `currentStage` is the row the database "contains" for the current test; `undefined` means no such
 * stage (the 404 path).
 */
const mockState = vi.hoisted(() => ({
  currentStage: undefined as unknown,
}))

/**
 * A `with`-AWARE findFirst, and the reason this file can fail at all.
 *
 * Drizzle's relational query builder returns a relation ONLY when the call asked for it via `with`.
 * SEC-02 is precisely a relation that the ownership predicate needs but the caller did not request,
 * so a mock that hands back the fixture's `pipeline` key regardless of the `with` argument would
 * make the defect UNREPRODUCIBLE: the unfixed route would find `stage.pipeline` populated, return
 * 200, and the SC-4a test could never go red. The suite would be green against a broken route —
 * exactly the failure mode this milestone has caught nine times.
 *
 * So this implementation reads the call's `with` and DELETES the relation when it was not requested.
 * That behaviour is itself asserted, first, in the "db mock self-test" describe below, before any
 * route assertion is allowed to depend on it.
 */
const withAwareFindFirst = vi.hoisted(() => (state: { currentStage: unknown }) => {
  return async (args?: FindFirstArgs): Promise<unknown> => {
    if (state.currentStage === undefined) return undefined
    const row = { ...(state.currentStage as Record<string, unknown>) }
    if (!args?.with?.pipeline) {
      delete row.pipeline
    }
    return row
  }
})

// `update` and `delete` are chainable stubs so this file can be extended to PUT/DELETE later
// without a second mock shape. DELETE on a stage is a HARD delete (stages/[id]/route.ts:160),
// which is why `delete` is present at all.
vi.mock("@/db", () => ({
  db: {
    query: {
      stages: { findFirst: vi.fn(withAwareFindFirst(mockState)) },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn(async () => []) })),
      })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  },
}))

// Auth bypass: this suite is about what the route does AFTER authentication, and the bypass is what
// lets it assert the authorization step separately from the authentication step.
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((req: NextRequest, handler: ApiRouteHandler) =>
    handler(req, { userId: "user-1", keyId: "key-1" })
  ),
}))

// `verifyStageOwnership` is deliberately NOT stubbed. It is the predicate under test; a stubbed
// predicate returns whatever the test told it to and proves nothing about the route.
import { db } from "@/db"
import { GET } from "@/app/api/v1/stages/[id]/route"

const mockFindFirst = db.query.stages.findFirst as unknown as ReturnType<
  typeof vi.fn<(args?: FindFirstArgs) => Promise<unknown>>
>

const NOW = new Date("2026-01-01T00:00:00Z")

const ownedPipeline: PipelineRow = {
  id: "pipe-1",
  name: "Sales",
  isDefault: 1,
  ownerId: "user-1",
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
}

const ownedStage: StageWithPipeline = {
  id: "stage-1",
  pipelineId: "pipe-1",
  name: "Qualified",
  description: null,
  color: "blue",
  type: "open",
  position: 1000,
  createdAt: NOW,
  updatedAt: NOW,
  pipeline: ownedPipeline,
}

/** A real SECOND identity, not a simulated authorization failure: the pipeline belongs to user-9. */
const foreignStage: StageWithPipeline = {
  ...ownedStage,
  id: "stage-2",
  pipelineId: "pipe-2",
  pipeline: { ...ownedPipeline, id: "pipe-2", ownerId: "user-9" },
}

function getRequest(id: string, expand?: string) {
  const query = expand ? `?expand=${expand}` : ""
  return new NextRequest(`http://localhost:3000/api/v1/stages/${id}${query}`, {
    method: "GET",
  })
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Re-installed explicitly rather than relying on any reset semantics: if this implementation were
  // silently dropped the mock would become `with`-blind, which is the one failure that would make
  // every assertion in this file vacuous.
  mockFindFirst.mockImplementation(withAwareFindFirst(mockState))
  mockState.currentStage = ownedStage
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------------------------
// The mock self-test comes FIRST. Every route assertion below rests on the claim that this mock
// models Drizzle's relational loading. An unasserted claim about a mock is how a test suite ends up
// unable to fail.
// ---------------------------------------------------------------------------------------------
describe("db mock self-test — findFirst honours `with`", () => {
  it("omits the pipeline relation entirely when `with` is undefined", async () => {
    const row = (await mockFindFirst(undefined)) as Record<string, unknown>

    expect(row).toBeDefined()
    expect(Object.keys(row)).not.toContain("pipeline")
    expect(row.id).toBe("stage-1")
  })

  it("omits the pipeline relation when `with` is present but does not request it", async () => {
    const row = (await mockFindFirst({ where: {}, with: undefined })) as Record<string, unknown>

    expect(Object.keys(row)).not.toContain("pipeline")
  })

  it("returns a populated pipeline relation when `with: { pipeline: true }` is passed", async () => {
    const row = (await mockFindFirst({
      where: {},
      with: { pipeline: true },
    })) as StageWithPipeline

    expect(row.pipeline).toBeDefined()
    expect(row.pipeline?.ownerId).toBe("user-1")
  })

  it("returns undefined when the row does not exist, regardless of `with`", async () => {
    mockState.currentStage = undefined

    expect(await mockFindFirst({ where: {}, with: { pipeline: true } })).toBeUndefined()
    expect(await mockFindFirst(undefined)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------
// SC-4a — THE PROOF. This is the only cell that is red before the fix and green after it.
// ---------------------------------------------------------------------------------------------
describe("SC-4a — owner, NO ?expand → 200 [THE DEFECT PROOF, red before the fix]", () => {
  it("returns 200 to the stage's legitimate owner without ?expand=pipeline", async () => {
    const response = await GET(getRequest("stage-1"), paramsFor("stage-1"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.id).toBe("stage-1")
  })

  it("reads ownership through an UNCONDITIONAL relation load: a bare GET's findFirst carries with.pipeline === true", async () => {
    await GET(getRequest("stage-1"), paramsFor("stage-1"))

    // Structural counterpart to the status assertion: the authorization read must not be
    // caller-controlled. Before the fix this is `undefined`, because the route built `with` from
    // the caller's ?expand.
    const args = mockFindFirst.mock.calls[0]?.[0]
    expect(args?.with?.pipeline).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------
// SC-4c — the leak the FIX creates. Green before the fix only because the relation was never
// loaded; load-bearing after it.
// ---------------------------------------------------------------------------------------------
describe("SC-4c — owner, NO ?expand → body has no `pipeline` key [guards the fix's own leak]", () => {
  it("does not project the pipeline object when the caller did not ask to expand it", async () => {
    const response = await GET(getRequest("stage-1"), paramsFor("stage-1"))
    const body = await response.json()

    expect(response.status).toBe(200)
    // After the fix `stage.pipeline` is ALWAYS populated, so the projection's
    // `expand.has("pipeline") &&` guard is the only thing preventing this from leaking.
    expect(Object.keys(body.data)).not.toContain("pipeline")
  })
})

// ---------------------------------------------------------------------------------------------
// SC-4a' — REGRESSION GUARD. Green today. Passing proves nothing about SEC-02.
// ---------------------------------------------------------------------------------------------
describe("SC-4a' — owner, ?expand=pipeline → 200 + expanded pipeline [REGRESSION GUARD, green before AND after]", () => {
  it("returns 200 and the expanded pipeline to the owner", async () => {
    const response = await GET(getRequest("stage-1", "pipeline"), paramsFor("stage-1"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.id).toBe("stage-1")
    expect(body.data.pipeline.id).toBe("pipe-1")
  })
})

// ---------------------------------------------------------------------------------------------
// SC-4b — REGRESSION GUARD, AND NOT EVIDENCE. See the comment inside.
// ---------------------------------------------------------------------------------------------
describe("SC-4b — non-owner, NO ?expand → 403 [REGRESSION GUARD — 403 today for the WRONG reason, NOT evidence]", () => {
  it("returns 403 to a caller who does not own the stage's pipeline", async () => {
    // ⚠ THIS CELL IS NOT EVIDENCE THAT SEC-02 WAS FIXED.
    // Before the fix this is 403 because the `pipeline` relation was never loaded, so
    // `!stage.pipeline` short-circuits and the real ownership comparison never runs. After the fix
    // it is 403 because `pipeline.ownerId !== ctx.userId`. Same status, different mechanism — it
    // passes IDENTICALLY in both states and is therefore insensitive to the defect. Task 3's
    // ablation measures exactly this. It is kept as a regression guard: deleting the ownership
    // check later must turn it red.
    mockState.currentStage = foreignStage

    const response = await GET(getRequest("stage-2"), paramsFor("stage-2"))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.type).toMatch(/\/FORBIDDEN$/)
  })

  it("403s because the row EXISTS and is foreign, not because the row is absent", async () => {
    // Rebuts the failure mode where a non-owner is simulated by resolving `undefined` — which
    // encodes the conclusion (no access) as the premise (no row) and proves nothing.
    mockState.currentStage = foreignStage

    const response = await GET(getRequest("stage-2"), paramsFor("stage-2"))

    expect(response.status).toBe(403)
    const resolved = (await mockFindFirst.mock.results[0]?.value) as
      | StageWithPipeline
      | undefined
    expect(resolved).toBeDefined()
    expect(resolved?.id).toBe("stage-2")
  })
})

// ---------------------------------------------------------------------------------------------
// SC-4b' — REGRESSION GUARD. Green today, for the right reason.
// ---------------------------------------------------------------------------------------------
describe("SC-4b' — non-owner, ?expand=pipeline → 403 [REGRESSION GUARD, green before AND after]", () => {
  it("returns 403 to a non-owner even when the relation is explicitly requested", async () => {
    mockState.currentStage = foreignStage

    const response = await GET(getRequest("stage-2", "pipeline"), paramsFor("stage-2"))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.type).toMatch(/\/FORBIDDEN$/)
    // And nothing leaked with the rejection.
    expect(body.data).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------
// 404 must still be decided BEFORE 403 — the fix must not collapse "absent" into "forbidden".
// ---------------------------------------------------------------------------------------------
describe("lookup — a missing stage is still 404, decided before the ownership verdict", () => {
  it("returns 404 with an ENTITY_NOT_FOUND problem type when the stage does not exist", async () => {
    mockState.currentStage = undefined

    const response = await GET(getRequest("stage-404"), paramsFor("stage-404"))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.type).toMatch(/\/ENTITY_NOT_FOUND$/)
  })

  it("returns 404 rather than 403 even when ?expand=pipeline is requested", async () => {
    mockState.currentStage = undefined

    const response = await GET(getRequest("stage-404", "pipeline"), paramsFor("stage-404"))

    expect(response.status).toBe(404)
  })
})
