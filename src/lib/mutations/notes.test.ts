import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

// Mock db. The polymorphic parent-existence check (T-35-04) dispatches to one of four
// tables keyed by entityType, so all four `findFirst` handles must exist on the mock.
// `delete` is mocked precisely so a test can prove a soft delete never invokes it.
vi.mock("@/db", () => ({
  db: {
    query: {
      notes: { findFirst: vi.fn() },
      deals: { findFirst: vi.fn() },
      organizations: { findFirst: vi.fn() },
      people: { findFirst: vi.fn() },
      activities: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

// NOTE: `@/lib/events` is deliberately NOT mocked. Notes emit no CRM event (D-15) and the
// "emits no CRM event" test below spies on the real singleton to prove it.

import { db } from "@/db"
import { crmBus } from "@/lib/events"
import {
  NOTE_CONTENT_MAX,
  createNoteMutation,
  updateNoteMutation,
  softDeleteNoteMutation,
  findNoteById,
  createNoteSchema,
  updateNoteSchema,
  type CreateNoteInput,
} from "./notes"

type MockFn = ReturnType<typeof vi.fn>

const mockDb = db as unknown as {
  query: {
    notes: { findFirst: MockFn }
    deals: { findFirst: MockFn }
    organizations: { findFirst: MockFn }
    people: { findFirst: MockFn }
    activities: { findFirst: MockFn }
  }
  insert: MockFn
  update: MockFn
  delete: MockFn
}

const NOW = new Date("2026-08-15T12:00:00Z")

function fakeNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "n1",
    entityType: "deal",
    entityId: "d1",
    content: "hi",
    authorId: "u1",
    source: "user",
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  }
}

/** `db.insert(notes).values(...).returning()` builder-chain fake. */
function stubInsert(result: unknown[] | Error) {
  const returning = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
  )
  const values = vi.fn().mockReturnValue({ returning })
  mockDb.insert.mockReturnValue({ values })
  return { values, returning }
}

/**
 * `db.update(notes).set(...).where(...)[.returning()]` builder-chain fake.
 * `where` returns a plain (non-thenable) object, so a soft delete that awaits the chain
 * without calling `.returning()` resolves fine.
 */
function stubUpdate(result: unknown[] | Error) {
  const returning = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
  )
  const where = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where })
  mockDb.update.mockReturnValue({ set })
  return { set, where, returning }
}

const validCreate: CreateNoteInput = {
  entityType: "deal",
  entityId: "d1",
  content: "hi",
  authorId: "u1",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("note schemas", () => {
  it("exposes a content ceiling above the largest migrated note", () => {
    expect(NOTE_CONTENT_MAX).toBeGreaterThan(131505)
    expect(createNoteSchema).toBeDefined()
    expect(updateNoteSchema).toBeDefined()
  })
})

describe("createNoteMutation", () => {
  it("creates a note with source 'user' and the supplied authorId", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue({ id: "d1", deletedAt: null })
    const note = fakeNote()
    const { values } = stubInsert([note])

    const result = await createNoteMutation(validCreate)

    expect(result).toEqual({ success: true, id: "n1", note })
    const written = values.mock.calls[0][0] as Record<string, unknown>
    expect(written).toMatchObject({
      entityType: "deal",
      entityId: "d1",
      content: "hi",
      authorId: "u1",
    })
    // Either an explicit 'user' source or none at all (the column defaults to 'user').
    if ("source" in written) expect(written.source).toBe("user")
  })

  it("accepts a null authorId for a note with no known author", async () => {
    mockDb.query.organizations.findFirst.mockResolvedValue({ id: "o1", deletedAt: null })
    const note = fakeNote({ entityType: "organization", entityId: "o1", authorId: null })
    const { values } = stubInsert([note])

    const result = await createNoteMutation({
      entityType: "organization",
      entityId: "o1",
      content: "hi",
      authorId: null,
    })

    expect(result.success).toBe(true)
    expect((values.mock.calls[0][0] as Record<string, unknown>).authorId).toBeNull()
  })

  it("trims surrounding whitespace but preserves internal line breaks", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue({ id: "d1", deletedAt: null })
    const { values } = stubInsert([fakeNote({ content: "line one\n\nline two" })])

    const result = await createNoteMutation({
      ...validCreate,
      content: "  line one\n\nline two  ",
    })

    expect(result.success).toBe(true)
    expect((values.mock.calls[0][0] as Record<string, unknown>).content).toBe(
      "line one\n\nline two"
    )
  })

  it("accepts a long note of 131505 characters", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue({ id: "d1", deletedAt: null })
    const content = "x".repeat(131505)
    const { values } = stubInsert([fakeNote({ content })])

    const result = await createNoteMutation({ ...validCreate, content })

    expect(result.success).toBe(true)
    expect(
      ((values.mock.calls[0][0] as Record<string, unknown>).content as string).length
    ).toBe(131505)
  })

  it("refuses a long note above NOTE_CONTENT_MAX", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue({ id: "d1", deletedAt: null })
    stubInsert([fakeNote()])

    const result = await createNoteMutation({
      ...validCreate,
      content: "x".repeat(NOTE_CONTENT_MAX + 1),
    })

    expect(result.success).toBe(false)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("rejects empty and whitespace-only content", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue({ id: "d1", deletedAt: null })
    stubInsert([fakeNote()])

    for (const content of ["", "   ", "\n\n"]) {
      const result = await createNoteMutation({ ...validCreate, content })
      expect(result.success).toBe(false)
    }

    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("rejects an entityType outside the four literals", async () => {
    stubInsert([fakeNote()])

    for (const entityType of ["user", "deal; DROP TABLE notes"]) {
      const result = await createNoteMutation({
        ...validCreate,
        entityType: entityType as CreateNoteInput["entityType"],
      })
      expect(result.success).toBe(false)
    }

    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.query.deals.findFirst).not.toHaveBeenCalled()
  })

  it("rejects an empty entityId", async () => {
    stubInsert([fakeNote()])

    const result = await createNoteMutation({ ...validCreate, entityId: "" })

    expect(result.success).toBe(false)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})

describe("createNoteMutation parent existence (a dangling entityId has no foreign key behind it)", () => {
  it("refuses to create a note against a dangling entityId", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue(undefined)
    stubInsert([fakeNote()])

    const result = await createNoteMutation({ ...validCreate, entityId: "nope" })

    expect(result.success).toBe(false)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("refuses to create a note against a soft-deleted parent record", async () => {
    // The lookup itself filters `deletedAt IS NULL`, so a soft-deleted parent surfaces
    // as `undefined` exactly like a dangling one.
    mockDb.query.deals.findFirst.mockResolvedValue(undefined)
    stubInsert([fakeNote()])

    const result = await createNoteMutation(validCreate)

    expect(mockDb.query.deals.findFirst).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("looks the parent up in the table matching entityType", async () => {
    mockDb.query.activities.findFirst.mockResolvedValue({ id: "a1", deletedAt: null })
    stubInsert([fakeNote({ entityType: "activity", entityId: "a1" })])

    const result = await createNoteMutation({
      ...validCreate,
      entityType: "activity",
      entityId: "a1",
    })

    expect(result.success).toBe(true)
    expect(mockDb.query.activities.findFirst).toHaveBeenCalledTimes(1)
    expect(mockDb.query.deals.findFirst).not.toHaveBeenCalled()
    expect(mockDb.query.people.findFirst).not.toHaveBeenCalled()
    expect(mockDb.query.organizations.findFirst).not.toHaveBeenCalled()
  })

  it("looks a person note up in the people table", async () => {
    mockDb.query.people.findFirst.mockResolvedValue({ id: "p1", deletedAt: null })
    stubInsert([fakeNote({ entityType: "person", entityId: "p1" })])

    const result = await createNoteMutation({
      ...validCreate,
      entityType: "person",
      entityId: "p1",
    })

    expect(result.success).toBe(true)
    expect(mockDb.query.people.findFirst).toHaveBeenCalledTimes(1)
  })
})

describe("updateNoteMutation (what makes the \"edited\" marker meaningful)", () => {
  it("stamps updatedAt on edit", async () => {
    mockDb.query.notes.findFirst.mockResolvedValue(fakeNote())
    const { set } = stubUpdate([fakeNote({ content: "new" })])

    const result = await updateNoteMutation("n1", "new")

    expect(result.success).toBe(true)
    const written = set.mock.calls[0][0] as Record<string, unknown>
    expect(written.content).toBe("new")
    expect(written.updatedAt).toBeInstanceOf(Date)
  })

  it("never writes createdAt on edit", async () => {
    mockDb.query.notes.findFirst.mockResolvedValue(fakeNote())
    const { set } = stubUpdate([fakeNote({ content: "new" })])

    await updateNoteMutation("n1", "new")

    const written = set.mock.calls[0][0] as Record<string, unknown>
    expect(written).not.toHaveProperty("createdAt")
    expect(Object.keys(written).sort()).toEqual(["content", "updatedAt"])
  })

  it("trims the edited content and rejects an empty edit", async () => {
    mockDb.query.notes.findFirst.mockResolvedValue(fakeNote())
    const { set } = stubUpdate([fakeNote({ content: "kept\nlines" })])

    const ok = await updateNoteMutation("n1", "  kept\nlines  ")
    expect(ok.success).toBe(true)
    expect((set.mock.calls[0][0] as Record<string, unknown>).content).toBe("kept\nlines")

    const empty = await updateNoteMutation("n1", "   ")
    expect(empty.success).toBe(false)
    expect(set).toHaveBeenCalledTimes(1)
  })

  it("returns not-found for an edit of a soft-deleted or missing note", async () => {
    mockDb.query.notes.findFirst.mockResolvedValue(undefined)
    const { set } = stubUpdate([fakeNote()])

    const result = await updateNoteMutation("gone", "new")

    expect(result.success).toBe(false)
    expect(set).not.toHaveBeenCalled()
  })

  it("guards the UPDATE on deleted_at so an edit cannot resurrect a deleted note", async () => {
    // WR-04 REGRESSION. The UPDATE matched on id alone, so a note soft-deleted between
    // `findNoteById` and the write was edited anyway — and `returning()` came back empty.
    mockDb.query.notes.findFirst.mockResolvedValue(fakeNote())
    const { where } = stubUpdate([fakeNote({ content: "new" })])

    await updateNoteMutation("n1", "new")

    const predicate = new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL).sql.toLowerCase()
    expect(predicate).toContain('"deleted_at" is null')
  })

  it("returns not-found rather than a bare success when the UPDATE matched nothing", async () => {
    // WR-04 REGRESSION. `const [note] = await ...returning()` is `undefined` when the row
    // was deleted mid-flight, and the declared return type is `{ success: true; note: Note }`,
    // so both callers trusted it: the v1 route handed `undefined` to `serializeNote` and
    // 500'd where a 404 was correct, and the server action threw inside `toTimelineEntry`.
    // `tsconfig.json` has `strict` but not `noUncheckedIndexedAccess`, so the compiler
    // typed it as `Note` and could not see any of it.
    mockDb.query.notes.findFirst.mockResolvedValue(fakeNote())
    stubUpdate([])

    const result = await updateNoteMutation("n1", "new")

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe("Note not found")
  })
})

describe("softDeleteNoteMutation", () => {
  it("soft delete sets deletedAt and never issues a hard DELETE", async () => {
    mockDb.query.notes.findFirst.mockResolvedValue(fakeNote())
    const { set } = stubUpdate([fakeNote({ deletedAt: NOW })])

    const result = await softDeleteNoteMutation("n1")

    expect(result).toEqual({ success: true })
    const written = set.mock.calls[0][0] as Record<string, unknown>
    expect(written.deletedAt).toBeInstanceOf(Date)
    expect(written.updatedAt).toBeInstanceOf(Date)
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("returns not-found for a soft delete of a missing note", async () => {
    mockDb.query.notes.findFirst.mockResolvedValue(undefined)
    const { set } = stubUpdate([fakeNote()])

    const result = await softDeleteNoteMutation("gone")

    expect(result.success).toBe(false)
    expect(set).not.toHaveBeenCalled()
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("guards the UPDATE on deleted_at so a second delete cannot move the timestamp", async () => {
    // WR-07 REGRESSION. The soft delete matched on id alone, so two concurrent deletes
    // both passed their `findNoteById` check and both wrote, and the second overwrote the
    // first `deletedAt` with a later timestamp. The soft-delete design is grounded in the
    // migration reconciliation and in `notes_migration_uniq` holding forever; a deletion
    // timestamp that moves undermines the audit value that justifies keeping the row.
    mockDb.query.notes.findFirst.mockResolvedValue(fakeNote())
    const { where } = stubUpdate([fakeNote({ deletedAt: NOW })])

    await softDeleteNoteMutation("n1")

    const predicate = new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL).sql.toLowerCase()
    expect(predicate).toContain('"deleted_at" is null')
  })

  it("reports success when the guarded UPDATE matched nothing (already deleted)", async () => {
    // Losing the race means the note is already gone, which is what the caller asked for.
    // Reporting failure would make a double-click through two tabs look like an error.
    mockDb.query.notes.findFirst.mockResolvedValue(fakeNote())
    stubUpdate([])

    await expect(softDeleteNoteMutation("n1")).resolves.toEqual({ success: true })
    expect(mockDb.delete).not.toHaveBeenCalled()
  })
})

describe("findNoteById", () => {
  it("returns the note when it is live", async () => {
    const note = fakeNote()
    mockDb.query.notes.findFirst.mockResolvedValue(note)

    await expect(findNoteById("n1")).resolves.toEqual(note)
  })

  it("returns null for a missing or soft-deleted note", async () => {
    mockDb.query.notes.findFirst.mockResolvedValue(undefined)

    await expect(findNoteById("gone")).resolves.toBeNull()
  })
})

describe("CRM bus silence", () => {
  it("emits no CRM event", async () => {
    const emit = vi.spyOn(crmBus, "emit")

    mockDb.query.deals.findFirst.mockResolvedValue({ id: "d1", deletedAt: null })
    stubInsert([fakeNote()])
    await createNoteMutation(validCreate)

    mockDb.query.notes.findFirst.mockResolvedValue(fakeNote())
    stubUpdate([fakeNote({ content: "new" })])
    await updateNoteMutation("n1", "new")
    await softDeleteNoteMutation("n1")

    expect(emit).not.toHaveBeenCalled()
  })
})

describe("error handling", () => {
  const pgDetail =
    'duplicate key value violates unique constraint "notes_migration_uniq" DETAIL: Key (entity_type, entity_id)=(deal, d1) already exists.'

  it("returns a generic error and logs the detail when the insert throws", async () => {
    mockDb.query.deals.findFirst.mockResolvedValue({ id: "d1", deletedAt: null })
    stubInsert(new Error(pgDetail))

    const result = await createNoteMutation(validCreate)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeTruthy()
      expect(result.error).not.toContain("notes_migration_uniq")
      expect(result.error).not.toContain("DETAIL")
    }
    expect(console.error).toHaveBeenCalled()
  })

  it("returns a generic error when the edit throws", async () => {
    mockDb.query.notes.findFirst.mockResolvedValue(fakeNote())
    stubUpdate(new Error(pgDetail))

    const result = await updateNoteMutation("n1", "new")

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).not.toContain("notes_migration_uniq")
    expect(console.error).toHaveBeenCalled()
  })

  it("returns null rather than throwing when the note read fails", async () => {
    mockDb.query.notes.findFirst.mockRejectedValue(new Error(pgDetail))

    await expect(findNoteById("n1")).resolves.toBeNull()
    expect(console.error).toHaveBeenCalled()
  })
})
