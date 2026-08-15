import { db } from "@/db"
import { notes, deals, organizations, people, activities } from "@/db/schema"
import type { EntityType, Note } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { z } from "zod"

// ---- Constants ----

/**
 * Upper bound on note content.
 *
 * NOT 2,000. The live database holds a 131,505-character activity note that plan 35-03
 * migrates into this table; a 2,000-character ceiling would make that migrated note
 * permanently uneditable, and a "truncate to fit" would silently destroy ~129 kB of
 * migrated content after NOTE-03 already claimed byte-identical preservation.
 * 200,000 sits above the observed maximum and still bounds abuse (T-35-07); the API
 * rate limiter on the /api/v1 surface is the other half of that mitigation.
 */
export const NOTE_CONTENT_MAX = 200000

// ---- Zod Schemas ----

/**
 * `.trim()` runs before `.min(1)`, so surrounding whitespace is stripped but internal
 * line breaks survive — a note's line breaks are content (D-03).
 */
const noteContent = z
  .string()
  .trim()
  .min(1, "Note content is required")
  .max(NOTE_CONTENT_MAX, `Note must be ${NOTE_CONTENT_MAX} characters or less`)

/**
 * `entityType` is interpolated into a table dispatch and reaches a query predicate, and
 * there is no pg enum or check constraint behind the column, so this enum is the only
 * guard against a mismatched entity type (T-35-04).
 */
export const createNoteSchema = z.object({
  entityType: z.enum(["organization", "person", "deal", "activity"]),
  entityId: z.string().min(1, "Entity is required"),
  content: noteContent,
  // Nullable, not optional: a migrated row may legitimately have no author.
  authorId: z.string().nullable(),
})

export const updateNoteSchema = z.object({
  content: noteContent,
})

export type CreateNoteInput = z.input<typeof createNoteSchema>

// ---- Parent existence (T-35-04) ----

/**
 * `notes.entityId` carries NO foreign key — it points at one of four different tables, so
 * the database cannot catch a dangling reference. This lookup is the only defence, and it
 * filters `deletedAt IS NULL` so a soft-deleted parent is refused exactly like a missing one.
 */
const PARENT_TABLES = {
  organization: organizations,
  person: people,
  deal: deals,
  activity: activities,
} as const

async function parentExists(entityType: EntityType, entityId: string): Promise<boolean> {
  const table = PARENT_TABLES[entityType]
  const where = and(eq(table.id, entityId), isNull(table.deletedAt))

  // Dispatched with a switch rather than an indexed `db.query[...]` handle so each
  // `findFirst` stays bound to its own relational query builder.
  switch (entityType) {
    case "organization":
      return Boolean(await db.query.organizations.findFirst({ where }))
    case "person":
      return Boolean(await db.query.people.findFirst({ where }))
    case "deal":
      return Boolean(await db.query.deals.findFirst({ where }))
    case "activity":
      return Boolean(await db.query.activities.findFirst({ where }))
  }
}

// ---- Reads ----

/**
 * Returns null for a note that does not exist OR has been soft-deleted. Every read path
 * carries `isNull(notes.deletedAt)` explicitly: `notes_live_idx` encodes the predicate but
 * does not enforce it (T-35-06).
 *
 * Consumed by the author-or-admin helper, the server action and the v1 route.
 */
export async function findNoteById(noteId: string): Promise<Note | null> {
  try {
    const note = await db.query.notes.findFirst({
      where: and(eq(notes.id, noteId), isNull(notes.deletedAt)),
    })
    return note ?? null
  } catch (error) {
    console.error("Failed to read note:", error)
    return null
  }
}

// ---- Mutations ----

/**
 * This module performs NO authorization and emits NO CRM event.
 *
 * Ownership checks live in the server action and the API route (the shared
 * author-or-admin helper is called from both), matching the repo's existing boundary:
 * mutations check entity existence only.
 *
 * Notes deliberately emit nothing on the CRM bus (D-15) — a 14th event type would pull in
 * the trigger-config UI, the workflow matcher, both subscribers' ALL_EVENTS arrays and the
 * API docs for no user-visible gain.
 */
export async function createNoteMutation(
  input: CreateNoteInput
): Promise<{ success: true; id: string; note: Note } | { success: false; error: string }> {
  const validated = createNoteSchema.safeParse(input)

  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  const { entityType, entityId, content, authorId } = validated.data

  try {
    if (!(await parentExists(entityType, entityId))) {
      return { success: false, error: "Record not found" }
    }

    const [note] = await db
      .insert(notes)
      .values({
        entityType,
        entityId,
        content,
        authorId,
        source: "user",
      })
      .returning()

    // `returning()` is typed as a non-empty array but is not one, and `tsconfig.json`
    // does not set `noUncheckedIndexedAccess`, so the compiler cannot see this. An INSERT
    // realistically always returns its row; if it ever does not, `note.id` below would
    // throw inside the try and surface as an opaque 500 instead of a handled failure.
    if (!note) {
      console.error("Failed to create note: INSERT ... RETURNING produced no row")
      return { success: false, error: "Failed to create note" }
    }

    return { success: true, id: note.id, note }
  } catch (error) {
    console.error("Failed to create note:", error)
    return { success: false, error: "Failed to create note" }
  }
}

/**
 * Sets `content` and `updatedAt` and nothing else. `createdAt` is never written: the UI's
 * "edited" marker is `updatedAt > createdAt`, so touching `createdAt` here would erase it
 * (D-02).
 */
export async function updateNoteMutation(
  noteId: string,
  content: string
): Promise<{ success: true; note: Note } | { success: false; error: string }> {
  const validated = updateNoteSchema.safeParse({ content })

  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  const existing = await findNoteById(noteId)
  if (!existing) {
    return { success: false, error: "Note not found" }
  }

  try {
    const [note] = await db
      .update(notes)
      .set({ content: validated.data.content, updatedAt: new Date() })
      // Never resurrect-edit a row deleted since `findNoteById` above (T-35-06). Matching
      // on id alone let an edit land on a note that had been soft-deleted in between, and
      // `returning()` then yielded nothing.
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
      .returning()

    // The declared return type promises a `Note`, and `noUncheckedIndexedAccess` is off,
    // so the compiler believed it. Both callers trusted it too: the v1 route handed
    // `undefined` to `serializeNote` and 500'd where a 404 was the right answer, and the
    // server action handed it to `toTimelineEntry` and reported a generic edit failure.
    if (!note) {
      // Lost the race with a concurrent soft delete — same answer as a missing note, and
      // deliberately the same string, so neither is an existence oracle (T-35-10).
      return { success: false, error: "Note not found" }
    }

    return { success: true, note }
  } catch (error) {
    console.error("Failed to update note:", error)
    return { success: false, error: "Failed to update note" }
  }
}

/**
 * Soft delete only — never a SQL DELETE. A removed note stays on disk so the migration
 * reconciliation and the `notes_migration_uniq` invariant keep holding.
 */
export async function softDeleteNoteMutation(
  noteId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const existing = await findNoteById(noteId)
  if (!existing) {
    return { success: false, error: "Note not found" }
  }

  try {
    const now = new Date()
    await db
      .update(notes)
      .set({ deletedAt: now, updatedAt: now })
      // IDEMPOTENT. Matching on id alone let two concurrent deletes — the API surface and
      // the browser, or a double-click through two tabs — both pass their `findNoteById`
      // check and both write, so the second silently overwrote the first `deletedAt` with
      // a later timestamp. The soft-delete design above is grounded in the migration
      // reconciliation and in `notes_migration_uniq` holding forever; a deletion timestamp
      // that moves undermines exactly the audit value that justifies keeping the row.
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))

    // Deliberately not conditioned on a row having been updated. Losing the race means
    // the note is already deleted, which is what the caller asked for — reporting failure
    // would make a double-click look like an error.
    return { success: true }
  } catch (error) {
    console.error("Failed to delete note:", error)
    return { success: false, error: "Failed to delete note" }
  }
}
