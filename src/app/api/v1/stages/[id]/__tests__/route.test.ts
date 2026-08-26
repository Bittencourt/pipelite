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
 *
 * SC-4d is a FIFTH cell, added by the code review that found the same 403-to-the-owner shape on a
 * branch 48-03 did not reach:
 *
 *   | cell  | caller     | pipeline  | before WR-06                 | after     | status          |
 *   |-------|------------|-----------|------------------------------|-----------|-----------------|
 *   | SC-4d | OWNER      | trashed   | 403  ← THE DEFECT            | 404       | THE PROOF       |
 *
 * `verifyStageOwnership` folded "pipeline is in the trash" into the same `owned: false` as "pipeline
 * is somebody else's", and all three verbs map `owned: false` to `Problems.forbidden()`. SC-4d is
 * asserted on GET, PUT and DELETE — three independent call sites — and is paired with a
 * still-403 discriminator so the fix cannot have collapsed every refusal into 404.
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
import { GET, PUT, DELETE } from "@/app/api/v1/stages/[id]/route"

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

/**
 * WR-06 — THE CALLER'S OWN STAGE, in a pipeline they have moved to the trash.
 *
 * `ownerId` is `user-1`: this row belongs to the caller. Only `deletedAt` differs from
 * `ownedStage`, so the outcome cannot be attributed to ownership. Soft-deleting a pipeline is a
 * REVERSIBLE user action, not an authorization event.
 */
const ownedStageInTrashedPipeline: StageWithPipeline = {
  ...ownedStage,
  id: "stage-3",
  pipelineId: "pipe-3",
  pipeline: {
    ...ownedPipeline,
    id: "pipe-3",
    ownerId: "user-1",
    deletedAt: new Date("2026-02-01T00:00:00Z"),
  },
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

// ---------------------------------------------------------------------------------------------
// SC-4d (WR-06) — THE FOURTH CELL. The owner's OWN stage, in a pipeline they soft-deleted.
//
// `verifyStageOwnership` folded three distinct verdicts into one `owned: false`:
//
//     if (!stage.pipeline || stage.pipeline.ownerId !== userId || stage.pipeline.deletedAt)
//
// and all three verbs map `owned: false` to `Problems.forbidden()`. So the owner of a trashed
// pipeline asking for one of its stages received
// `403 {"title":"Forbidden","detail":"You don't have access to this resource"}` — for a record they
// own and can restore. That is the same 403-to-the-owner shape plan 48-03 was written to close, on a
// different branch of the same predicate.
//
// It also made the two stage endpoints disagree about the same row: `GET /api/v1/stages` filters
// with `isNull(pipelines.deletedAt)` inside `ownedStagesPredicate` and simply OMITS it, so the list
// says "does not exist" while `/stages/:id` says "not yours". 404 is the answer that matches the
// list — and the one that does not tell a caller they have lost access to their own data.
//
// Asserted on ALL THREE VERBS, not just GET: `verifyStageOwnership` is one call site each, they fail
// or pass independently of one another, and a shared helper asserting one of them would go green the
// moment any single verb was fixed.
// ---------------------------------------------------------------------------------------------
describe("SC-4d — owner, pipeline soft-deleted → 404 not 403 [THE WR-06 PROOF, red before the fix]", () => {
  beforeEach(() => {
    mockState.currentStage = ownedStageInTrashedPipeline
  })

  it("GET answers 404 with ENTITY_NOT_FOUND, matching what GET /api/v1/stages does with the same row", async () => {
    const response = await GET(getRequest("stage-3"), paramsFor("stage-3"))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.type).toMatch(/\/ENTITY_NOT_FOUND$/)
    // Explicit, because 403 is what this returned before the fix and the two are easy to confuse in
    // a diff: the caller must NOT be told they lack access to a record they own.
    expect(response.status).not.toBe(403)
  })

  it("GET leaks no stage or pipeline data alongside the 404", async () => {
    const response = await GET(getRequest("stage-3", "pipeline"), paramsFor("stage-3"))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.data).toBeUndefined()
  })

  it("PUT answers 404 and writes nothing", async () => {
    const response = await PUT(
      new NextRequest("http://localhost:3000/api/v1/stages/stage-3", {
        method: "PUT",
        body: JSON.stringify({ name: "renamed" }),
        headers: { "content-type": "application/json" },
      }),
      paramsFor("stage-3")
    )

    expect(response.status).toBe(404)
    // A trashed parent must not become an editable child either — 404 is the refusal, and it is
    // still a refusal.
    expect(db.update).not.toHaveBeenCalled()
  })

  it("DELETE answers 404 and deletes nothing", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/v1/stages/stage-3", { method: "DELETE" }),
      paramsFor("stage-3")
    )

    expect(response.status).toBe(404)
    // Stages are HARD deleted (stages/[id]/route.ts), so an absent `db.delete` is the proof.
    expect(db.delete).not.toHaveBeenCalled()
  })

  it("a FOREIGN stage whose pipeline is ALSO trashed answers 404 — absence is decided before ownership", async () => {
    // Pins the ORDER, which is a decision rather than an accident. Absence first means a 403 never
    // confirms the existence of a row inside a trashed pipeline, and it keeps this endpoint saying
    // exactly what `GET /api/v1/stages` says about the same row. 403 is NOT gone: SC-4b and SC-4b'
    // above are foreign stages in LIVE pipelines and both still assert it.
    mockState.currentStage = {
      ...foreignStage,
      id: "stage-4",
      pipeline: {
        ...ownedPipeline,
        id: "pipe-4",
        ownerId: "user-9",
        deletedAt: new Date("2026-02-01T00:00:00Z"),
      },
    }

    const response = await GET(getRequest("stage-4"), paramsFor("stage-4"))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.type).toMatch(/\/ENTITY_NOT_FOUND$/)
  })

  it("403 IS STILL REACHABLE for a foreign stage in a LIVE pipeline — the fix did not collapse every refusal into 404", async () => {
    // The discriminator for this whole describe. Without it, six 404 assertions above are satisfied
    // by a helper that returns `stage: null` unconditionally, which would turn an authorization
    // refusal into a "does not exist" for every foreign row in the system.
    mockState.currentStage = foreignStage

    const response = await GET(getRequest("stage-2"), paramsFor("stage-2"))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.type).toMatch(/\/FORBIDDEN$/)
  })

  it("the LIVE pipeline case is untouched: the same owner still gets 200", async () => {
    // The anti-vacuity anchor for this describe. Without it the four 404s above are satisfied by a
    // route that 404s the owner unconditionally — which would be a worse defect than the 403.
    mockState.currentStage = ownedStage

    const response = await GET(getRequest("stage-1"), paramsFor("stage-1"))

    expect(response.status).toBe(200)
  })
})
