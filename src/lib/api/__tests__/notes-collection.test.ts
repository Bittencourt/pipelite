/**
 * WR-08 — the shared `/api/v1/{entity}/{id}/notes` handler pair.
 *
 * The four nested routes were ~140 byte-identical lines, four times over, and that body
 * carries the `isNull(notes.deletedAt)` predicate T-35-06 names as a control, the parent
 * existence lookup, and the `"Record not found"` remap. Nothing gated that a change to any
 * of them was applied to all four. This suite is that gate: it drives the REAL exported
 * handlers of all four route modules through one table-driven loop, so a route that stops
 * delegating, or a control that stops firing on one entity type, fails here.
 */
import { readFileSync } from "node:fs"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

import type { ApiAuthContext } from "@/lib/api/auth"
import type { Note } from "@/db/schema"

type ApiRouteHandler = (
  request: NextRequest,
  context: ApiAuthContext
) => Promise<NextResponse>

vi.mock("@/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))

// Auth bypass: this suite is about what the handlers do AFTER authentication.
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((req: NextRequest, handler: ApiRouteHandler) =>
    handler(req, { userId: "user-1", keyId: "key-1" })
  ),
}))

// `updateNoteSchema` is kept REAL so the body-validation path exercises the shared ceiling.
vi.mock("@/lib/mutations/notes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mutations/notes")>()
  return { ...actual, createNoteMutation: vi.fn() }
})

import { db } from "@/db"
import { notes } from "@/db/schema/notes"
import { deals } from "@/db/schema/deals"
import { organizations } from "@/db/schema/organizations"
import { people } from "@/db/schema/people"
import { activities } from "@/db/schema/activities"
import { createNoteMutation } from "@/lib/mutations/notes"

import * as dealsRoute from "@/app/api/v1/deals/[id]/notes/route"
import * as organizationsRoute from "@/app/api/v1/organizations/[id]/notes/route"
import * as peopleRoute from "@/app/api/v1/people/[id]/notes/route"
import * as activitiesRoute from "@/app/api/v1/activities/[id]/notes/route"

const mockDb = db as unknown as { select: ReturnType<typeof vi.fn> }
const mockCreateNote = vi.mocked(createNoteMutation)
const dialect = new PgDialect()

/** Every table that reached `.from(...)`, with the `where` the builder finished with. */
interface SelectCall {
  fields: unknown
  table: unknown
  where: unknown
}
const selectCalls: SelectCall[] = []

function stubSelect(rowsFor: (call: SelectCall) => unknown[]) {
  mockDb.select.mockImplementation((fields?: unknown) => {
    const call: SelectCall = { fields, table: null, where: null }
    const chain: Record<string, unknown> = {}
    for (const method of ["from", "where", "orderBy", "offset", "limit"]) {
      chain[method] = vi.fn((arg: unknown) => {
        if (method === "from") {
          call.table = arg
          selectCalls.push(call)
        }
        if (method === "where") {
          call.where = arg
        }
        return chain
      })
    }
    // `then` runs after the chain is fully built, so `call.where` is the final predicate.
    chain.then = (resolve: (value: unknown) => unknown) => resolve(rowsFor(call))
    return chain
  })
}

function render(where: unknown): string {
  return dialect.sqlToQuery(where as SQL).sql.toLowerCase()
}

/** The rendered `where` of the notes read that is NOT the count query. */
function notesReadWhere(): string {
  const call = selectCalls.find(
    (c) => c.table === notes && !(c.fields as Record<string, unknown> | undefined)?.total
  )
  return call ? render(call.where) : ""
}

const noteRow: Note = {
  id: "note-1",
  entityType: "deal",
  entityId: "e1",
  content: "hello",
  authorId: "user-1",
  source: "user",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
}

const SURFACES = [
  { name: "deals", route: dealsRoute, parent: deals, entityType: "deal", label: "Deal" },
  {
    name: "organizations",
    route: organizationsRoute,
    parent: organizations,
    entityType: "organization",
    label: "Organization",
  },
  { name: "people", route: peopleRoute, parent: people, entityType: "person", label: "Person" },
  {
    name: "activities",
    route: activitiesRoute,
    parent: activities,
    entityType: "activity",
    label: "Activity",
  },
] as const

const params = { params: Promise.resolve({ id: "e1" }) }

function getRequest() {
  return new NextRequest("http://localhost:3000/api/v1/x/e1/notes")
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/x/e1/notes", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

/** Parent found, one note, count 1. */
function stubHappyPath(parent: unknown) {
  stubSelect((call) => {
    if (call.table === parent) return [{ id: "e1" }]
    if ((call.fields as Record<string, unknown> | undefined)?.total) return [{ total: 1 }]
    return [noteRow]
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  selectCalls.length = 0
  mockCreateNote.mockResolvedValue({ success: true, id: noteRow.id, note: noteRow })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(SURFACES)("GET /api/v1/$name/[id]/notes", (surface) => {
  it("carries deleted_at IS NULL on the notes read (T-35-06)", async () => {
    stubHappyPath(surface.parent)

    const response = await surface.route.GET(getRequest(), params)

    expect(response.status).toBe(200)
    expect(notesReadWhere()).toContain('"deleted_at" is null')
  })

  it("scopes the read to its OWN entity type, taken from the route and not the request", async () => {
    stubHappyPath(surface.parent)

    await surface.route.GET(getRequest(), params)

    const { params: bound } = dialect.sqlToQuery(
      selectCalls.find(
        (c) => c.table === notes && !(c.fields as Record<string, unknown> | undefined)?.total
      )!.where as SQL
    )
    expect(bound).toContain(surface.entityType)
    expect(bound).toContain("e1")
  })

  it("looks the parent up in its own table and filters soft-deleted parents", async () => {
    stubHappyPath(surface.parent)

    await surface.route.GET(getRequest(), params)

    const parentCall = selectCalls.find((c) => c.table === surface.parent)
    expect(parentCall).toBeDefined()
    expect(render(parentCall!.where)).toContain('"deleted_at" is null')
  })

  it("returns 404 for a missing or soft-deleted parent, and reads no notes", async () => {
    stubSelect((call) => (call.table === surface.parent ? [] : [noteRow]))

    const response = await surface.route.GET(getRequest(), params)

    expect(response.status).toBe(404)
    expect(selectCalls.some((c) => c.table === notes)).toBe(false)
  })
})

describe.each(SURFACES)("POST /api/v1/$name/[id]/notes", (surface) => {
  it("attributes the note to the API key's user and to its own entity type", async () => {
    stubHappyPath(surface.parent)

    const response = await surface.route.POST(
      postRequest({ content: "hello", authorId: "forged" }),
      params
    )

    expect(response.status).toBe(201)
    expect(mockCreateNote).toHaveBeenCalledWith({
      entityType: surface.entityType,
      entityId: "e1",
      content: "hello",
      // Never the body's `authorId`: a key holder must not be able to forge attribution
      // to another user (T-35-28).
      authorId: "user-1",
    })
  })

  it("returns 404 for a missing parent and never writes", async () => {
    stubSelect((call) => (call.table === surface.parent ? [] : []))

    const response = await surface.route.POST(postRequest({ content: "hello" }), params)

    expect(response.status).toBe(404)
    expect(mockCreateNote).not.toHaveBeenCalled()
  })

  it("remaps the mutation's parent-race failure to 404 rather than 500", async () => {
    stubHappyPath(surface.parent)
    mockCreateNote.mockResolvedValue({ success: false, error: "Record not found" })

    const response = await surface.route.POST(postRequest({ content: "hello" }), params)

    expect(response.status).toBe(404)
  })

  it("rejects an empty body with a validation Problem and never writes", async () => {
    stubHappyPath(surface.parent)

    const response = await surface.route.POST(postRequest({ content: "   " }), params)

    expect(response.status).toBe(422)
    expect(mockCreateNote).not.toHaveBeenCalled()
  })
})

describe("no route may grow a private copy of the handler body", () => {
  it.each(SURFACES)("$name delegates to the shared factory", (surface) => {
    const source = readFileSync(
      new URL(`../../../app/api/v1/${surface.name}/[id]/notes/route.ts`, import.meta.url),
      "utf8"
    )

    expect(source).toContain("noteCollectionHandlers")
    // The controls live in exactly one place. A route that reintroduces its own query is
    // a route that can drift out of step with the other three without anything noticing.
    expect(source).not.toContain("isNull(notes.deletedAt)")
    expect(source).not.toContain("createNoteMutation")
    expect(source).not.toContain("withApiAuth")
  })
})
