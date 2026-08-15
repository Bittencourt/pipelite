import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
// Type-only import: erased at runtime, so it does not resurrect the mocked module below.
import type { ApiAuthContext } from "@/lib/api/auth"
import type { Note } from "@/db/schema"

/** Mirrors the real `withApiAuth` handler contract in src/lib/api/auth.ts. */
type ApiRouteHandler = (
  request: NextRequest,
  context: ApiAuthContext
) => Promise<NextResponse>

// `delete` is present on the db mock precisely so a test can prove the route NEVER calls it:
// a note is only ever soft-deleted.
vi.mock("@/db", () => ({
  db: {
    query: {
      notes: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
    update: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
  },
}))

// Auth bypass: this suite is about what the route does AFTER authentication, and the bypass is
// what lets it assert the authorization step separately from the authentication step.
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((req: NextRequest, handler: ApiRouteHandler) =>
    handler(req, { userId: "user-1", keyId: "key-1" })
  ),
}))

// Only `resolveActorRole` is stubbed. `isAuthorOrAdmin` stays REAL, so every authorization
// assertion below executes the same predicate the browser server action executes — a stubbed
// predicate would prove nothing about T-35-03.
vi.mock("@/lib/notes/authorize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notes/authorize")>()
  return { ...actual, resolveActorRole: vi.fn() }
})

// The mutations are stubbed but `updateNoteSchema` is kept REAL, so the content-validation
// cases below exercise the shared ceiling rather than a test-local copy of it.
vi.mock("@/lib/mutations/notes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mutations/notes")>()
  return {
    ...actual,
    findNoteById: vi.fn(),
    updateNoteMutation: vi.fn(),
    softDeleteNoteMutation: vi.fn(),
  }
})

import { db } from "@/db"
import { resolveActorRole } from "@/lib/notes/authorize"
import {
  findNoteById,
  updateNoteMutation,
  softDeleteNoteMutation,
  NOTE_CONTENT_MAX,
} from "@/lib/mutations/notes"
import { PATCH, DELETE } from "@/app/api/v1/notes/[noteId]/route"

const mockDb = db as unknown as {
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const mockResolveActorRole = vi.mocked(resolveActorRole)
const mockFindNoteById = vi.mocked(findNoteById)
const mockUpdateNote = vi.mocked(updateNoteMutation)
const mockSoftDeleteNote = vi.mocked(softDeleteNoteMutation)

/** The length of the longest note in the live database, migrated by plan 35-03. */
const MIGRATED_NOTE_LENGTH = 131505

const authoredNote: Note = {
  id: "note-1",
  entityType: "deal",
  entityId: "deal-1",
  content: "original content",
  authorId: "user-1",
  source: "user",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
}

/** Same note, written by somebody else — the IDOR target. */
const foreignNote: Note = { ...authoredNote, id: "note-2", authorId: "user-9" }

function patchRequest(body: unknown, raw?: string) {
  return new NextRequest("http://localhost:3000/api/v1/notes/note-1", {
    method: "PATCH",
    body: raw ?? JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function deleteRequest() {
  return new NextRequest("http://localhost:3000/api/v1/notes/note-1", {
    method: "DELETE",
  })
}

const params = { params: Promise.resolve({ noteId: "note-1" }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  // Default: the caller is the author, and a member.
  mockResolveActorRole.mockResolvedValue({ userId: "user-1", role: "member" })
  mockFindNoteById.mockResolvedValue(authoredNote)
  mockUpdateNote.mockResolvedValue({ success: true, note: authoredNote })
  mockSoftDeleteNote.mockResolvedValue({ success: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("PATCH /api/v1/notes/:noteId — lookup", () => {
  it("returns 404 for an unknown note", async () => {
    mockFindNoteById.mockResolvedValue(null)

    const response = await PATCH(patchRequest({ content: "edited" }), params)

    expect(response.status).toBe(404)
    expect(mockUpdateNote).not.toHaveBeenCalled()
  })

  it("returns the same 404 for a soft-deleted note — no existence oracle (T-35-10)", async () => {
    // `findNoteById` carries `isNull(notes.deletedAt)`, so a soft-deleted row resolves to null
    // and is indistinguishable from a note that never existed.
    mockFindNoteById.mockResolvedValue(null)

    const response = await PATCH(patchRequest({ content: "edited" }), params)
    const problem = await response.json()

    expect(response.status).toBe(404)
    expect(problem.detail).toBe("Note not found")
  })
})

describe("PATCH /api/v1/notes/:noteId — authorization (T-35-03)", () => {
  it("returns 403 for a member who is not the author, and never calls the mutation", async () => {
    mockFindNoteById.mockResolvedValue(foreignNote)
    mockResolveActorRole.mockResolvedValue({ userId: "user-1", role: "member" })

    const response = await PATCH(patchRequest({ content: "hijacked" }), params)

    expect(response.status).toBe(403)
    // The whole point: the refusal happens BEFORE any write is attempted.
    expect(mockUpdateNote).not.toHaveBeenCalled()
  })

  it("returns 200 for the author", async () => {
    const response = await PATCH(patchRequest({ content: "edited" }), params)

    expect(response.status).toBe(200)
    expect(mockUpdateNote).toHaveBeenCalledWith("note-1", "edited")
  })

  it("returns 200 for an admin who is not the author", async () => {
    mockFindNoteById.mockResolvedValue(foreignNote)
    mockResolveActorRole.mockResolvedValue({ userId: "user-1", role: "admin" })
    mockUpdateNote.mockResolvedValue({ success: true, note: foreignNote })

    const response = await PATCH(patchRequest({ content: "moderated" }), params)

    expect(response.status).toBe(200)
    expect(mockUpdateNote).toHaveBeenCalledTimes(1)
  })

  it("returns 403 when the role lookup fails closed (T-35-25)", async () => {
    // `resolveActorRole` returns null on an unknown user, a soft-deleted user, or a thrown
    // query. All three must deny, never fall back to "member".
    mockResolveActorRole.mockResolvedValue(null)

    const response = await PATCH(patchRequest({ content: "edited" }), params)

    expect(response.status).toBe(403)
    expect(mockUpdateNote).not.toHaveBeenCalled()
  })

  it("reads the role from storage rather than from the request (T-35-24)", async () => {
    // A body claiming admin does not make the caller an admin: the route passes only the note id
    // and the content to the mutation, and the role comes from `resolveActorRole`.
    mockFindNoteById.mockResolvedValue(foreignNote)
    mockResolveActorRole.mockResolvedValue({ userId: "user-1", role: "member" })

    const response = await PATCH(
      patchRequest({ content: "hijacked", role: "admin", authorId: "user-1" }),
      params
    )

    expect(response.status).toBe(403)
    expect(mockResolveActorRole).toHaveBeenCalledWith("user-1")
  })
})

describe("PATCH /api/v1/notes/:noteId — body validation", () => {
  it("rejects invalid JSON with a validation Problem naming the body", async () => {
    const response = await PATCH(patchRequest(undefined, "{not json"), params)
    const problem = await response.json()

    expect(response.status).toBe(422)
    expect(problem.errors).toEqual([
      { field: "body", code: "invalid_json", message: "Invalid JSON body" },
    ])
    expect(mockUpdateNote).not.toHaveBeenCalled()
  })

  it("rejects empty content", async () => {
    const response = await PATCH(patchRequest({ content: "" }), params)

    expect(response.status).toBe(422)
    expect(mockUpdateNote).not.toHaveBeenCalled()
  })

  it("rejects whitespace-only content", async () => {
    const response = await PATCH(patchRequest({ content: "   \n\t  " }), params)

    expect(response.status).toBe(422)
    expect(mockUpdateNote).not.toHaveBeenCalled()
  })

  it("accepts a 131505-character body — the migrated note stays editable", async () => {
    // The live database holds a note of exactly this length. A 2,000-character ceiling would
    // have made it permanently uneditable through this API.
    const long = "x".repeat(MIGRATED_NOTE_LENGTH)
    expect(MIGRATED_NOTE_LENGTH).toBeLessThanOrEqual(NOTE_CONTENT_MAX)
    mockUpdateNote.mockResolvedValue({ success: true, note: { ...authoredNote, content: long } })

    const response = await PATCH(patchRequest({ content: long }), params)

    expect(response.status).toBe(200)
    expect(mockUpdateNote).toHaveBeenCalledWith("note-1", long)
  })
})

describe("PATCH /api/v1/notes/:noteId — response shape", () => {
  it("serializes the note without deletedAt (T-35-06)", async () => {
    const response = await PATCH(patchRequest({ content: "edited" }), params)
    const payload = await response.json()

    expect(payload.data).toEqual({
      id: "note-1",
      entityType: "deal",
      entityId: "deal-1",
      content: "original content",
      authorId: "user-1",
      source: "user",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })
    expect(payload.data).not.toHaveProperty("deletedAt")
  })
})

describe("DELETE /api/v1/notes/:noteId", () => {
  it("returns 204 with no body and soft-deletes", async () => {
    const response = await DELETE(deleteRequest(), params)

    expect(response.status).toBe(204)
    expect(await response.text()).toBe("")
    expect(mockSoftDeleteNote).toHaveBeenCalledWith("note-1")
  })

  it("never issues a hard delete", async () => {
    await DELETE(deleteRequest(), params)

    // A SQL DELETE would break `notes_migration_uniq` reconciliation: a removed migrated note
    // would be re-inserted on the next migration run.
    expect(mockDb.delete).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 403 for a member who is not the author, and never soft-deletes", async () => {
    mockFindNoteById.mockResolvedValue(foreignNote)

    const response = await DELETE(deleteRequest(), params)

    expect(response.status).toBe(403)
    expect(mockSoftDeleteNote).not.toHaveBeenCalled()
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("returns 403 when the role lookup fails closed (T-35-25)", async () => {
    mockResolveActorRole.mockResolvedValue(null)

    const response = await DELETE(deleteRequest(), params)

    expect(response.status).toBe(403)
    expect(mockSoftDeleteNote).not.toHaveBeenCalled()
  })

  it("returns 404 for an unknown or soft-deleted note", async () => {
    mockFindNoteById.mockResolvedValue(null)

    const response = await DELETE(deleteRequest(), params)

    expect(response.status).toBe(404)
    expect(mockSoftDeleteNote).not.toHaveBeenCalled()
  })

  it("allows an admin to remove another user's note", async () => {
    mockFindNoteById.mockResolvedValue(foreignNote)
    mockResolveActorRole.mockResolvedValue({ userId: "user-1", role: "admin" })

    const response = await DELETE(deleteRequest(), params)

    expect(response.status).toBe(204)
    expect(mockSoftDeleteNote).toHaveBeenCalledWith("note-1")
  })
})

describe("error containment (T-35-10)", () => {
  const LEAKY = /relation |column |pg_|postgres|duplicate key|at Object\.|\.ts:\d+/i

  it("returns a generic Problem when the update mutation rejects", async () => {
    mockUpdateNote.mockRejectedValue(
      new Error('relation "notes" does not exist\n    at Object.<anonymous> (/app/db.ts:42:7)')
    )

    const response = await PATCH(patchRequest({ content: "edited" }), params)
    const problem = await response.json()

    expect(response.status).toBe(500)
    expect(problem.type).toBe("https://api.pipelite.app/errors/INTERNAL_ERROR")
    expect(problem.detail).not.toMatch(LEAKY)
    expect(JSON.stringify(problem)).not.toMatch(LEAKY)
  })

  it("returns a generic Problem when the delete mutation rejects", async () => {
    mockSoftDeleteNote.mockRejectedValue(new Error('column "deleted_at" does not exist'))

    const response = await DELETE(deleteRequest(), params)
    const problem = await response.json()

    expect(response.status).toBe(500)
    expect(JSON.stringify(problem)).not.toMatch(LEAKY)
  })

  it("returns a generic Problem when the mutation reports a failure string", async () => {
    mockUpdateNote.mockResolvedValue({ success: false, error: "Failed to update note" })

    const response = await PATCH(patchRequest({ content: "edited" }), params)
    const problem = await response.json()

    expect(response.status).toBe(500)
    expect(problem.detail).toBe("An unexpected error occurred")
  })
})
