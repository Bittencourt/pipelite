import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
import { PgDialect } from "drizzle-orm/pg-core"
// Type-only import: erased at runtime, so it does not resurrect the mocked module below.
import type { ApiAuthContext } from "@/lib/api/auth"
import type { AuditLogRow } from "@/db/schema/audit-log"

/** Mirrors the real `withApiAuth` handler contract in src/lib/api/auth.ts. */
type ApiRouteHandler = (
  request: NextRequest,
  context: ApiAuthContext
) => Promise<NextResponse>

/**
 * The `/api/v1/audit` suite.
 *
 * This surface is the broadest read in the phase: one request can retrieve former values across
 * every CRM record. Everything below is therefore about two things — WHO may read it, and the
 * fact that nothing may WRITE it.
 *
 * `insert`, `update` and `delete` are present on the db mock precisely so a test can prove the
 * route never touches them: the audit log is append-only and the retention pruner (36-18) is the
 * only deletion path.
 */
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: { users: { findFirst: vi.fn() } },
  },
}))

// Auth bypass: this suite is about what the handler does AFTER authentication. `withApiAuth`
// itself — bearer parsing, key validation, rate limiting, the api_key actor scope — is tested
// in 36-05. The bypass is what lets authorization be asserted separately from authentication.
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((req: NextRequest, handler: ApiRouteHandler) =>
    handler(req, { userId: "user-1", keyId: "key-1" })
  ),
}))

// Only `resolveActorRole` is stubbed; the rest of the module stays real. The route re-reads the
// role from storage because `ApiAuthContext` is `{ userId, keyId }` with NO role (T-36-05), so
// stubbing this function is exactly the seam between "what storage says" and "what the route
// does about it".
vi.mock("@/lib/notes/authorize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notes/authorize")>()
  return { ...actual, resolveActorRole: vi.fn() }
})

import { db } from "@/db"
import { resolveActorRole } from "@/lib/notes/authorize"
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/api/pagination"
import * as auditRoute from "@/app/api/v1/audit/route"
import { GET } from "@/app/api/v1/audit/route"

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const mockResolveActorRole = vi.mocked(resolveActorRole)

/**
 * A chainable drizzle-builder stand-in. Every method returns the builder; the builder itself is
 * thenable, so `await db.select().from(t).where(w)...` resolves to `result`.
 */
type Builder = {
  from: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  orderBy: ReturnType<typeof vi.fn>
  offset: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  then: (resolve: (value: unknown) => void) => void
}

function makeBuilder(result: unknown): Builder {
  const builder = {} as Builder
  for (const method of ["from", "where", "orderBy", "offset", "limit"] as const) {
    builder[method] = vi.fn(() => builder)
  }
  builder.then = (resolve: (value: unknown) => void) => resolve(result)
  return builder
}

const auditRow: AuditLogRow = {
  id: "audit-1",
  entityType: "deal",
  entityId: "deal-1",
  action: "updated",
  changes: { title: { from: "Old", to: "New" } },
  actorKind: "user",
  actorUserId: "user-9",
  workflowRunId: null,
  importSessionId: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
}

let rowsBuilder: Builder
let countBuilder: Builder

/** The composed WHERE, rendered to real SQL text + bind params. */
function renderedWhere(): { sql: string; params: unknown[] } | null {
  const arg = rowsBuilder.where.mock.calls[0]?.[0]
  if (!arg) return null
  const { sql, params } = new PgDialect().sqlToQuery(arg)
  return { sql, params: params as unknown[] }
}

function auditRequest(query = "") {
  return new NextRequest(`http://localhost:3000/api/v1/audit${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})

  rowsBuilder = makeBuilder([auditRow])
  countBuilder = makeBuilder([{ total: 1 }])
  // `db.select()` with no projection is the row read; `db.select({ total: count() })` is the
  // total. Discriminating on the argument keeps the mock independent of evaluation order.
  mockDb.select.mockImplementation((projection?: unknown) =>
    projection === undefined ? rowsBuilder : countBuilder
  )

  // Default: the caller's API key belongs to an admin.
  mockResolveActorRole.mockResolvedValue({ userId: "user-1", role: "admin" })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("GET /api/v1/audit — authorization (T-36-05)", () => {
  it("returns 200 with snake_case items for an admin key", async () => {
    const response = await GET(auditRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mockResolveActorRole).toHaveBeenCalledWith("user-1")
    expect(payload.data).toEqual([
      {
        id: "audit-1",
        entity_type: "deal",
        entity_id: "deal-1",
        action: "updated",
        changes: { title: { from: "Old", to: "New" } },
        actor_kind: "user",
        actor_user_id: "user-9",
        workflow_run_id: null,
        import_session_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ])
    expect(payload.meta).toEqual({
      total: 1,
      offset: 0,
      limit: DEFAULT_PAGE_SIZE,
    })
  })

  it("refuses a non-admin key with a forbidden Problem and never reads the log", async () => {
    mockResolveActorRole.mockResolvedValue({ userId: "user-1", role: "member" })

    const response = await GET(auditRequest())
    const problem = await response.json()

    // 403, NOT 404. The resource exists and pretending otherwise buys nothing here: a caller
    // who can enumerate /api/v1 already knows the endpoint is there.
    expect(response.status).toBe(403)
    expect(problem.type).toBe("https://api.pipelite.app/errors/FORBIDDEN")
    // The refusal happens before a single row is read.
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("refuses an unresolvable actor with the same forbidden Problem — fails closed", async () => {
    // `resolveActorRole` returns null for an unknown user, a soft-deleted user, or a thrown
    // query. None of the three may be treated as a non-admin fallback, and none as default-allow.
    // This is the Phase 35 T-35-25 posture, carried forward.
    mockResolveActorRole.mockResolvedValue(null)

    const response = await GET(auditRequest())

    expect(response.status).toBe(403)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("authorizes before validating, so a non-admin learns nothing from a bad filter", async () => {
    mockResolveActorRole.mockResolvedValue({ userId: "user-1", role: "member" })

    const response = await GET(auditRequest("?entity_type=nonsense"))

    expect(response.status).toBe(403)
  })
})

describe("GET /api/v1/audit — read-only method surface (T-36-33)", () => {
  it("is read-only: the module exports GET and no mutating handler", async () => {
    const handlers = auditRoute as unknown as Record<string, unknown>

    expect(typeof handlers.GET).toBe("function")
    // A route file that later grows a mutating handler breaks here. The audit log is never
    // writable from outside the subscriber, and the retention pruner is the only deletion path.
    expect(handlers.POST).toBeUndefined()
    expect(handlers.PUT).toBeUndefined()
    expect(handlers.PATCH).toBeUndefined()
    expect(handlers.DELETE).toBeUndefined()
  })

  it("never calls insert, update or delete while serving a read", async () => {
    await GET(auditRequest())

    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockDb.delete).not.toHaveBeenCalled()
  })
})

describe("GET /api/v1/audit — pagination (T-36-34)", () => {
  it("clamps an unbounded page size to MAX_PAGE_SIZE", async () => {
    const response = await GET(auditRequest("?limit=99999"))
    const payload = await response.json()

    // The clamp belongs to `parsePagination`; the route must not re-implement it.
    expect(rowsBuilder.limit).toHaveBeenCalledWith(MAX_PAGE_SIZE)
    expect(payload.meta.limit).toBe(MAX_PAGE_SIZE)
  })

  it("clamps a negative offset to 0", async () => {
    const response = await GET(auditRequest("?offset=-5"))
    const payload = await response.json()

    expect(rowsBuilder.offset).toHaveBeenCalledWith(0)
    expect(payload.meta.offset).toBe(0)
  })

  it("uses the parsePagination defaults when no paging params are given", async () => {
    await GET(auditRequest())

    expect(rowsBuilder.offset).toHaveBeenCalledWith(0)
    expect(rowsBuilder.limit).toHaveBeenCalledWith(DEFAULT_PAGE_SIZE)
  })

  it("orders newest first with a stable tiebreaker", async () => {
    await GET(auditRequest())

    // created_at DESC, id DESC — without the tiebreaker two rows written in the same
    // millisecond can repeat on one page and vanish from the next.
    expect(rowsBuilder.orderBy).toHaveBeenCalledTimes(1)
    expect(rowsBuilder.orderBy.mock.calls[0]).toHaveLength(2)
  })
})

describe("GET /api/v1/audit — filters (T-36-06)", () => {
  it("narrows by entity_type, binding the value as a parameter", async () => {
    const response = await GET(auditRequest("?entity_type=deal"))

    expect(response.status).toBe(200)
    const where = renderedWhere()
    expect(where).not.toBeNull()
    expect(where!.sql).toContain('"entity_type"')
    // Bound, never interpolated: the literal must appear in params, not in the SQL text.
    expect(where!.params).toContain("deal")
    expect(where!.sql).not.toContain("deal")
  })

  it("narrows by entity_id, actor_kind and workflow_run_id together", async () => {
    const response = await GET(
      auditRequest("?entity_id=deal-1&actor_kind=workflow_run&workflow_run_id=run-1")
    )

    expect(response.status).toBe(200)
    const where = renderedWhere()
    expect(where!.params).toEqual(
      expect.arrayContaining(["deal-1", "workflow_run", "run-1"])
    )
  })

  it("composes no predicate at all when no filter is given", async () => {
    await GET(auditRequest())

    expect(renderedWhere()).toBeNull()
  })

  it("rejects an unknown entity_type before it reaches a predicate", async () => {
    const response = await GET(auditRequest("?entity_type=nonsense"))
    const problem = await response.json()

    expect(response.status).toBe(422)
    expect(problem.type).toBe("https://api.pipelite.app/errors/VALIDATION_ERROR")
    expect(problem.errors[0].field).toBe("entity_type")
    // The point of the whole test: the value never becomes SQL.
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("rejects an unknown actor_kind before it reaches a predicate", async () => {
    const response = await GET(auditRequest("?actor_kind=root"))
    const problem = await response.json()

    expect(response.status).toBe(422)
    expect(problem.errors[0].field).toBe("actor_kind")
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("rejects an empty entity_id rather than matching every row", async () => {
    const response = await GET(auditRequest("?entity_id="))

    expect(response.status).toBe(422)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("rejects an empty workflow_run_id rather than matching every row", async () => {
    const response = await GET(auditRequest("?workflow_run_id="))

    expect(response.status).toBe(422)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("accepts import_session as an entity_type — the fifth literal is real", async () => {
    const response = await GET(auditRequest("?entity_type=import_session"))

    expect(response.status).toBe(200)
    expect(renderedWhere()!.params).toContain("import_session")
  })

  it("ignores an unknown query parameter instead of failing the request", async () => {
    // Unknown params are not a threat and rejecting them breaks clients that append tracking
    // keys. What matters is that they compose no predicate.
    const response = await GET(auditRequest("?sort_by=whatever"))

    expect(response.status).toBe(200)
    expect(renderedWhere()).toBeNull()
  })
})

describe("GET /api/v1/audit — error containment", () => {
  const LEAKY = /relation |column |pg_|postgres|duplicate key|at Object\.|\.ts:\d+/i

  it("returns a generic Problem when the query throws, leaking no Postgres text", async () => {
    mockDb.select.mockImplementation(() => {
      throw new Error(
        'relation "audit_log" does not exist\n    at Object.<anonymous> (/app/db.ts:42:7)'
      )
    })

    const response = await GET(auditRequest())
    const problem = await response.json()

    expect(response.status).toBe(500)
    expect(problem.type).toBe("https://api.pipelite.app/errors/INTERNAL_ERROR")
    expect(JSON.stringify(problem)).not.toMatch(LEAKY)
    expect(console.error).toHaveBeenCalled()
  })
})
