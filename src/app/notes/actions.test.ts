/**
 * The browser-facing note server actions: authentication, attribution, authorization,
 * cache invalidation and paging.
 *
 * SCAFFOLD NOTE — this is new ground for the repo. No other test here mocks `@/auth`.
 * The closest existing idiom is the `vi.mock("@/lib/api/auth")` bypass in
 * src/app/api/v1/organizations/[id]/__tests__/route.test.ts:23-27, which auto-approves
 * every request. That shape does NOT work here: the whole point of this suite is to swap
 * the session per test (absent / member / admin / author), so `auth` is mocked as a bare
 * `vi.fn()` and each test drives `mockResolvedValue` itself.
 *
 * WHAT IS MOCKED AND WHY
 *   - `@/auth`                    — the session under test.
 *   - `@/db`                      — throws at import time without DATABASE_URL, and this
 *                                   suite must not touch Postgres.
 *   - `next/cache`                — `revalidatePath` is an assertion target.
 *   - `@/lib/mutations/notes`     — this suite is about what the ACTION delegates and
 *                                   returns; DB behaviour is plan 35-04's suite.
 *   - `@/lib/timeline/assemble`   — same, for plan 35-08.
 *   - `@/lib/timeline/sources`    — the hydration read behind the returned entry.
 *
 * WHAT IS DELIBERATELY NOT MOCKED
 *   - `@/lib/notes/authorize`. The REAL `isAuthorOrAdmin` runs, so the authorization
 *     matrix below proves the action actually enforces the shared predicate rather than
 *     proving that a stub was called (T-35-03, T-35-09).
 *
 * Type-only imports stay `import type` throughout: erased at runtime, so they cannot
 * resurrect a mocked module.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import type { EntityType, Note } from "@/db/schema"
import type { NoteTimelineEntry, TimelinePage } from "@/lib/timeline/types"

vi.mock("@/db", () => ({
  db: { query: { users: { findFirst: vi.fn() } } },
}))

vi.mock("@/auth", () => ({ auth: vi.fn() }))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

vi.mock("@/lib/mutations/notes", () => ({
  createNoteMutation: vi.fn(),
  updateNoteMutation: vi.fn(),
  softDeleteNoteMutation: vi.fn(),
  findNoteById: vi.fn(),
}))

vi.mock("@/lib/timeline/assemble", () => ({ assembleTimeline: vi.fn() }))

vi.mock("@/lib/timeline/sources", () => ({
  notesSource: { kind: "note", hydrate: vi.fn() },
}))

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import {
  createNoteMutation,
  findNoteById,
  softDeleteNoteMutation,
  updateNoteMutation,
} from "@/lib/mutations/notes"
import { NOTE_ERROR } from "@/lib/notes/errors"
import { assembleTimeline } from "@/lib/timeline/assemble"
import { notesSource } from "@/lib/timeline/sources"

import { addNote, deleteNote, editNote, loadMoreTimeline } from "./actions"

// `auth` is overloaded in next-auth; narrow it to the shape the actions actually use.
const mockAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)
const mockRevalidatePath = vi.mocked(revalidatePath)
const mockCreate = vi.mocked(createNoteMutation)
const mockUpdate = vi.mocked(updateNoteMutation)
const mockSoftDelete = vi.mocked(softDeleteNoteMutation)
const mockFindNote = vi.mocked(findNoteById)
const mockAssemble = vi.mocked(assembleTimeline)
const mockHydrate = vi.mocked(notesSource.hydrate)

const AT = new Date("2026-01-01T12:00:00.000Z")

function sessionFor(id: string, role: "admin" | "member" = "member"): Session {
  return {
    user: {
      id,
      role,
      name: `User ${id}`,
      email: `${id}@example.com`,
    },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  } as Session
}

function noteRow(overrides: Partial<Note> = {}): Note {
  return {
    id: "n1",
    entityType: "organization",
    entityId: "o1",
    content: "hello",
    authorId: "u1",
    source: "user",
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...overrides,
  }
}

function entryFor(row: Note): NoteTimelineEntry {
  return {
    kind: "note",
    id: row.id,
    occurredAt: row.createdAt,
    content: row.content,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: row.authorId
      ? { id: row.authorId, name: `User ${row.authorId}`, email: `${row.authorId}@example.com` }
      : null,
  }
}

function emptyPage(): TimelinePage {
  return { entries: [], hasMore: false, nextCursor: null, total: 0 }
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

  // Happy-path defaults; individual tests override.
  mockCreate.mockResolvedValue({ success: true, id: "n1", note: noteRow() })
  mockUpdate.mockResolvedValue({ success: true, note: noteRow() })
  mockSoftDelete.mockResolvedValue({ success: true })
  mockFindNote.mockResolvedValue(noteRow())
  mockAssemble.mockResolvedValue(emptyPage())
  mockHydrate.mockImplementation(async (ids: string[]) =>
    ids.map((id) => entryFor(noteRow({ id })))
  )
})

// ---------------------------------------------------------------------------
// Authentication — the session cookie is the only trusted input
// ---------------------------------------------------------------------------

describe("authentication", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(null)
  })

  it("addNote refuses an unauthenticated caller", async () => {
    const result = await addNote("organization", "o1", "hi")

    expect(result.success).toBe(false)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("editNote refuses an unauthenticated caller", async () => {
    const result = await editNote("n1", "hi")

    expect(result.success).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
    // Refused BEFORE any database work happens.
    expect(mockFindNote).not.toHaveBeenCalled()
  })

  it("deleteNote refuses an unauthenticated caller", async () => {
    const result = await deleteNote("n1")

    expect(result.success).toBe(false)
    expect(mockSoftDelete).not.toHaveBeenCalled()
    expect(mockFindNote).not.toHaveBeenCalled()
  })

  it("loadMoreTimeline refuses an unauthenticated caller", async () => {
    const result = await loadMoreTimeline("organization", "o1", "cursor")

    expect(result.success).toBe(false)
    expect(mockAssemble).not.toHaveBeenCalled()
  })

  it("refuses a session whose user id is missing", async () => {
    mockAuth.mockResolvedValue({ user: {}, expires: "" } as unknown as Session)

    const result = await addNote("organization", "o1", "hi")

    expect(result.success).toBe(false)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Attribution — T-35-28
// ---------------------------------------------------------------------------

describe("author attribution", () => {
  it("addNote takes authorId from the session, not from arguments", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1"))

    await addNote("deal", "d1", "hi")

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "deal",
        entityId: "d1",
        content: "hi",
        authorId: "u1",
      })
    )
  })

  it("addNote exposes no authorId parameter for a caller to forge", async () => {
    // (entityType, entityId, content) and nothing else — the author is not addressable
    // from the client at all.
    expect(addNote.length).toBe(3)
  })

  it("addNote returns the hydrated timeline entry so the client can prepend it", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1"))
    mockCreate.mockResolvedValue({
      success: true,
      id: "n9",
      note: noteRow({ id: "n9", content: "hi", entityType: "deal", entityId: "d1" }),
    })

    const result = await addNote("deal", "d1", "hi")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.note.kind).toBe("note")
    expect(result.note.id).toBe("n9")
    expect(result.note.author).toEqual({
      id: "u1",
      name: "User u1",
      email: "u1@example.com",
    })
  })
})

// ---------------------------------------------------------------------------
// Creation permission — D-14
// ---------------------------------------------------------------------------

describe("creation permission", () => {
  it("any authenticated member may add a note to any record", async () => {
    // A plain member, on a record owned by somebody else entirely.
    mockAuth.mockResolvedValue(sessionFor("u2", "member"))
    mockCreate.mockResolvedValue({
      success: true,
      id: "n2",
      note: noteRow({ id: "n2", authorId: "u2", entityType: "person", entityId: "p7" }),
    })

    const result = await addNote("person", "p7", "not my record")

    expect(result.success).toBe(true)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Edit / delete authorization matrix — the real isAuthorOrAdmin runs here
// ---------------------------------------------------------------------------

describe("authorization", () => {
  it("the author may edit their own note", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1", "member"))
    mockFindNote.mockResolvedValue(noteRow({ authorId: "u1" }))

    const result = await editNote("n1", "edited")

    expect(result.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith("n1", "edited")
  })

  it("an admin may edit another user's note", async () => {
    mockAuth.mockResolvedValue(sessionFor("u2", "admin"))
    mockFindNote.mockResolvedValue(noteRow({ authorId: "u1" }))

    const result = await editNote("n1", "edited")

    expect(result.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })

  it("a member may not edit another user's note", async () => {
    // The IDOR control (T-35-03).
    mockAuth.mockResolvedValue(sessionFor("u2", "member"))
    mockFindNote.mockResolvedValue(noteRow({ authorId: "u1" }))

    const result = await editNote("n1", "edited")

    expect(result.success).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("a member may not edit a note whose author is null", async () => {
    mockAuth.mockResolvedValue(sessionFor("u2", "member"))
    mockFindNote.mockResolvedValue(noteRow({ authorId: null }))

    const result = await editNote("n1", "edited")

    expect(result.success).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("an admin may edit a note whose author is null", async () => {
    mockAuth.mockResolvedValue(sessionFor("u2", "admin"))
    mockFindNote.mockResolvedValue(noteRow({ authorId: null }))

    const result = await editNote("n1", "edited")

    expect(result.success).toBe(true)
  })

  it("reports a refusal as a distinguishable code, not as generic prose (WR-06)", async () => {
    // `notes.error.notPermitted` shipped in all three locales, was asserted by the parity
    // gate, and was rendered by nothing: the actions returned the untranslated literal
    // "Not authorized" and both call sites discarded it and showed "Try again." So a user
    // who may not touch the note was told to retry an operation that will never succeed,
    // forever. The UI can only tell the two apart if the reason survives the boundary.
    mockAuth.mockResolvedValue(sessionFor("u2", "member"))
    mockFindNote.mockResolvedValue(noteRow({ authorId: "u1" }))

    const edited = await editNote("n1", "edited")
    const deleted = await deleteNote("n1")

    expect(edited.success).toBe(false)
    expect(deleted.success).toBe(false)
    if (edited.success || deleted.success) return
    expect(edited.error).toBe(NOTE_ERROR.notAuthorized)
    expect(deleted.error).toBe(NOTE_ERROR.notAuthorized)
    // …and distinguishable from every other refusal, which is the whole point.
    expect(edited.error).not.toBe(NOTE_ERROR.notFound)
    expect(edited.error).not.toBe(NOTE_ERROR.failed)
  })

  it("does not leak which refusal happened to an unauthenticated caller", async () => {
    mockAuth.mockResolvedValue(null)

    const result = await editNote("n1", "edited")

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe(NOTE_ERROR.notAuthenticated)
  })

  it("the author may delete their own note", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1", "member"))
    mockFindNote.mockResolvedValue(noteRow({ authorId: "u1" }))

    const result = await deleteNote("n1")

    expect(result.success).toBe(true)
    expect(mockSoftDelete).toHaveBeenCalledWith("n1")
  })

  it("a member may not delete another user's note", async () => {
    mockAuth.mockResolvedValue(sessionFor("u2", "member"))
    mockFindNote.mockResolvedValue(noteRow({ authorId: "u1" }))

    const result = await deleteNote("n1")

    expect(result.success).toBe(false)
    expect(mockSoftDelete).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("an admin may delete another user's note", async () => {
    mockAuth.mockResolvedValue(sessionFor("u2", "admin"))
    mockFindNote.mockResolvedValue(noteRow({ authorId: "u1" }))

    const result = await deleteNote("n1")

    expect(result.success).toBe(true)
    expect(mockSoftDelete).toHaveBeenCalledTimes(1)
  })

  it("editing a note that does not exist returns not-found without leaking existence detail", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1", "member"))
    mockFindNote.mockResolvedValue(null)

    const result = await editNote("nope", "edited")

    expect(result.success).toBe(false)
    if (result.success) return
    expect(typeof result.error).toBe("string")
    expect(result.error).not.toMatch(/postgres|relation|column|stack|at\s+Object/i)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("editing a soft-deleted note is refused with the same message as a missing one", async () => {
    // `findNoteById` returns null for soft-deleted rows BY CONTRACT (plan 35-04), so the
    // two cases are indistinguishable to the client — that is the point (T-35-10).
    mockAuth.mockResolvedValue(sessionFor("u1", "member"))

    mockFindNote.mockResolvedValue(null)
    const missing = await editNote("gone", "edited")

    mockFindNote.mockResolvedValue(null)
    const softDeleted = await editNote("n1", "edited")

    expect(missing.success).toBe(false)
    expect(softDeleted.success).toBe(false)
    if (missing.success || softDeleted.success) return
    expect(softDeleted.error).toBe(missing.error)
  })

  it("deleting a note that does not exist is refused", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1", "member"))
    mockFindNote.mockResolvedValue(null)

    const result = await deleteNote("nope")

    expect(result.success).toBe(false)
    expect(mockSoftDelete).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Cache invalidation — revalidatePath is the ONLY invalidation in this phase (D-15)
// ---------------------------------------------------------------------------

describe("revalidation", () => {
  it("revalidates the record's detail route after a successful add", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1"))
    mockCreate.mockResolvedValue({
      success: true,
      id: "n1",
      note: noteRow({ entityType: "organization", entityId: "o1" }),
    })

    await addNote("organization", "o1", "hi")

    expect(mockRevalidatePath).toHaveBeenCalledWith("/organizations/o1")
  })

  const routes: Array<[EntityType, string]> = [
    ["deal", "/deals/x1"],
    ["organization", "/organizations/x1"],
    ["person", "/people/x1"],
    ["activity", "/activities/x1"],
  ]

  it.each(routes)("revalidates the %s segment mapping", async (entityType, path) => {
    mockAuth.mockResolvedValue(sessionFor("u1"))
    mockCreate.mockResolvedValue({
      success: true,
      id: "n1",
      note: noteRow({ entityType, entityId: "x1" }),
    })

    await addNote(entityType, "x1", "hi")

    expect(mockRevalidatePath).toHaveBeenCalledWith(path)
  })

  it("does not revalidate when the mutation fails", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1"))
    mockCreate.mockResolvedValue({ success: false, error: "Record not found" })

    const result = await addNote("organization", "o1", "hi")

    expect(result.success).toBe(false)
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("revalidates the note's own record after a successful edit", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1", "member"))
    mockFindNote.mockResolvedValue(
      noteRow({ authorId: "u1", entityType: "person", entityId: "p3" })
    )
    mockUpdate.mockResolvedValue({
      success: true,
      note: noteRow({ authorId: "u1", entityType: "person", entityId: "p3" }),
    })

    await editNote("n1", "edited")

    expect(mockRevalidatePath).toHaveBeenCalledWith("/people/p3")
  })

  it("revalidates the note's own record after a successful delete", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1", "member"))
    mockFindNote.mockResolvedValue(
      noteRow({ authorId: "u1", entityType: "activity", entityId: "a5" })
    )

    await deleteNote("n1")

    expect(mockRevalidatePath).toHaveBeenCalledWith("/activities/a5")
  })

  it("does not revalidate when the edit mutation fails", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1", "member"))
    mockFindNote.mockResolvedValue(noteRow({ authorId: "u1" }))
    mockUpdate.mockResolvedValue({ success: false, error: "Note content is required" })

    const result = await editNote("n1", "  ")

    expect(result.success).toBe(false)
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Paging — the cursor is opaque here (T-35-02)
// ---------------------------------------------------------------------------

describe("loadMoreTimeline", () => {
  it("passes the encoded cursor straight through to the assembler", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1"))
    const cursor = "eyJvY2N1cnJlZEF0IjoiMjAyNi0wMS0wMSIsImlkIjoibjEifQ=="

    await loadMoreTimeline("deal", "d1", cursor)

    expect(mockAssemble).toHaveBeenCalledWith({
      entityType: "deal",
      entityId: "d1",
      cursor,
      // The scope defaults OFF, so an untaught caller gets Phase 35's timeline.
      includeAudit: false,
    })
  })

  // T-36-37. The keyset predicate is applied per branch, so a cursor is scope-specific:
  // page 2 has to be drawn from the same source set as page 1 or the audit entries newer
  // than the cursor are silently omitted.
  it("carries the audit scope through to the assembler", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1"))

    await loadMoreTimeline("deal", "d1", "cursor", true)

    expect(mockAssemble).toHaveBeenCalledWith({
      entityType: "deal",
      entityId: "d1",
      cursor: "cursor",
      includeAudit: true,
    })
  })

  it("returns the assembler's page unchanged on success", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1"))
    const page: TimelinePage = {
      entries: [entryFor(noteRow({ id: "n7" }))],
      hasMore: true,
      nextCursor: "next",
      total: 42,
    }
    mockAssemble.mockResolvedValue(page)

    const result = await loadMoreTimeline("deal", "d1", "cursor")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.page).toEqual(page)
  })

  it("returns a generic error when the assembler throws", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1"))
    mockAssemble.mockRejectedValue(
      new Error('relation "notes" does not exist at character 42')
    )

    const result = await loadMoreTimeline("deal", "d1", "cursor")

    expect(result.success).toBe(false)
    if (result.success) return
    // No Postgres or stack detail reaches the browser (T-35-10)...
    expect(result.error).not.toMatch(/relation|character 42|does not exist/i)
    // ...but the detail is still logged server-side.
    expect(consoleError).toHaveBeenCalled()
  })

  it("returns a generic error when a hostile entity type reaches the assembler", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1"))
    mockAssemble.mockRejectedValue(
      new Error('Unsupported timeline entity type: "deals; DROP TABLE notes"')
    )

    const result = await loadMoreTimeline("deal", "d1", "cursor")

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).not.toMatch(/DROP TABLE/i)
  })
})

// ---------------------------------------------------------------------------
// Error containment — T-35-10
// ---------------------------------------------------------------------------

describe("error containment", () => {
  it("addNote returns a generic error and logs the detail when the mutation throws", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1"))
    mockCreate.mockRejectedValue(new Error('duplicate key value violates unique constraint'))

    const result = await addNote("organization", "o1", "hi")

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).not.toMatch(/duplicate key|constraint/i)
    expect(consoleError).toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("deleteNote returns a generic error and logs the detail when the lookup throws", async () => {
    mockAuth.mockResolvedValue(sessionFor("u1"))
    mockFindNote.mockRejectedValue(new Error('connection terminated unexpectedly'))

    const result = await deleteNote("n1")

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).not.toMatch(/connection terminated/i)
    expect(consoleError).toHaveBeenCalled()
  })
})
