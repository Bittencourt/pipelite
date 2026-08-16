"use server"

/**
 * The browser-facing surface for notes.
 *
 * WHY SERVER ACTIONS AND NOT /api/v1
 * `/api/v1/**` authenticates with a Bearer API key via `withApiAuth` and never reads the
 * session cookie. A browser has no API key, so the UI must call these actions. The v1
 * routes (plan 35-10) exist for external consumers and share the same mutation layer.
 *
 * THE TRUST BOUNDARY
 * Every argument here arrives from an untrusted client. The ONLY trusted input is the
 * signed Auth.js session, which is where both the author id and the admin role come from.
 * `resolveActorRole` is deliberately NOT called: that exists for the API-key surface,
 * whose auth context carries no role. The session already carries one.
 *
 * AUTHORIZATION
 * The edit/delete decision is `isAuthorOrAdmin` imported from `@/lib/notes/authorize` —
 * never re-implemented inline. The equivalent inline ownership check exists at three
 * sites in src/app/organizations/actions.ts, and that drift is exactly what the shared
 * predicate prevents (T-35-09).
 *
 * CACHE INVALIDATION
 * `revalidatePath` is the ONLY invalidation in this phase. Notes emit no `note.created`
 * event on the CRM bus (D-15), so workflows cannot react to a note yet — by design.
 */

import { revalidatePath } from "next/cache"

import { auth } from "@/auth"
import type { EntityType, Note } from "@/db/schema"
import {
  createNoteMutation,
  findNoteById,
  softDeleteNoteMutation,
  updateNoteMutation,
} from "@/lib/mutations/notes"
import { isAuthorOrAdmin, type NoteActor } from "@/lib/notes/authorize"
import { NOTE_ERROR, toNoteErrorCode } from "@/lib/notes/errors"
import { assembleTimeline } from "@/lib/timeline/assemble"
import { notesSource } from "@/lib/timeline/sources"
import type { NoteTimelineEntry, TimelinePage } from "@/lib/timeline/types"

// ---- Result contracts ----

type NoteResult =
  | { success: true; note: NoteTimelineEntry }
  | { success: false; error: string }

type VoidResult = { success: true } | { success: false; error: string }

type PageResult =
  | { success: true; page: TimelinePage }
  | { success: false; error: string }

// ---- Constants ----

/**
 * The failure vocabulary is `NOTE_ERROR` in @/lib/notes/errors — stable CODES, not English
 * prose, so a fully localized UI can branch on the reason and render the right translated
 * message. See that module for why.
 *
 * A missing note and a soft-deleted note MUST return the same code. `findNoteById` returns
 * null for both by contract, so the two are indistinguishable to the client and neither is
 * an existence oracle (T-35-10).
 */
const NOT_AUTHENTICATED = NOTE_ERROR.notAuthenticated
const NOT_AUTHORIZED = NOTE_ERROR.notAuthorized
const NOT_FOUND = NOTE_ERROR.notFound

/** The record detail route each entity type lives under. */
const ROUTE_SEGMENTS: Record<EntityType, string> = {
  deal: "deals",
  organization: "organizations",
  person: "people",
  activity: "activities",
}

// ---- Internal helpers (not exported: a "use server" module may only export actions) ----

function detailPath(entityType: EntityType, entityId: string): string {
  return `/${ROUTE_SEGMENTS[entityType]}/${entityId}`
}

/**
 * Turn a written row into the same `NoteTimelineEntry` the timeline itself renders, so a
 * client can prepend or replace an entry without refetching the page.
 *
 * The hydration read is reused rather than reconstructed from the session, because on an
 * admin edit the note's author is NOT the session user. One shared path means the
 * optimistic entry cannot drift from what the next timeline read will produce.
 */
async function toTimelineEntry(row: Note): Promise<NoteTimelineEntry> {
  const hydrated = await notesSource.hydrate([row.id])
  const entry = hydrated[0]

  if (entry && entry.kind === "note") {
    return entry
  }

  // The row was soft-deleted between the write and the read. Return what we already hold
  // rather than failing a write that actually succeeded.
  return {
    kind: "note",
    id: row.id,
    occurredAt: row.createdAt,
    content: row.content,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: null,
  }
}

// ---- Actions ----

/**
 * Add a note to any of the four record types.
 *
 * There is deliberately NO `authorId` parameter: attribution comes from the signed
 * session and cannot be forged from the client (T-35-28). Any authenticated user may add
 * a note to any record — creation carries no ownership requirement (D-14).
 */
export async function addNote(
  entityType: EntityType,
  entityId: string,
  content: string
): Promise<NoteResult> {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return { success: false, error: NOT_AUTHENTICATED }
    }

    const result = await createNoteMutation({
      entityType,
      entityId,
      content,
      authorId: session.user.id,
    })

    if (!result.success) {
      return { success: false, error: toNoteErrorCode(result.error) }
    }

    revalidatePath(detailPath(entityType, entityId))

    return { success: true, note: await toTimelineEntry(result.note) }
  } catch (error) {
    console.error("addNote failed:", error)
    return { success: false, error: NOTE_ERROR.failed }
  }
}

/** Edit a note. Author-or-admin only, enforced here before any write. */
export async function editNote(noteId: string, content: string): Promise<NoteResult> {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return { success: false, error: NOT_AUTHENTICATED }
    }

    const note = await findNoteById(noteId)
    if (!note) {
      return { success: false, error: NOT_FOUND }
    }

    const actor: NoteActor = { userId: session.user.id, role: session.user.role }
    if (!isAuthorOrAdmin(note, actor)) {
      return { success: false, error: NOT_AUTHORIZED }
    }

    const result = await updateNoteMutation(noteId, content)

    if (!result.success) {
      return { success: false, error: toNoteErrorCode(result.error) }
    }

    // Revalidate the note's OWN record, not one the caller named.
    revalidatePath(detailPath(note.entityType, note.entityId))

    return { success: true, note: await toTimelineEntry(result.note) }
  } catch (error) {
    console.error("editNote failed:", error)
    return { success: false, error: NOTE_ERROR.failed }
  }
}

/** Soft-delete a note. Author-or-admin only. Never a hard delete. */
export async function deleteNote(noteId: string): Promise<VoidResult> {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return { success: false, error: NOT_AUTHENTICATED }
    }

    const note = await findNoteById(noteId)
    if (!note) {
      return { success: false, error: NOT_FOUND }
    }

    const actor: NoteActor = { userId: session.user.id, role: session.user.role }
    if (!isAuthorOrAdmin(note, actor)) {
      return { success: false, error: NOT_AUTHORIZED }
    }

    const result = await softDeleteNoteMutation(noteId)

    if (!result.success) {
      return { success: false, error: toNoteErrorCode(result.error) }
    }

    revalidatePath(detailPath(note.entityType, note.entityId))

    return { success: true }
  } catch (error) {
    console.error("deleteNote failed:", error)
    return { success: false, error: NOTE_ERROR.failed }
  }
}

/**
 * Fetch the next page of a record's timeline.
 *
 * `cursor` stays OPAQUE here. `assembleTimeline` decodes and zod-validates it, and
 * `decodeCursor` degrades a hostile value to page 1 rather than to a 500 (T-35-02). This
 * action must never decode it and must never trust it.
 *
 * THE SCOPE TRAVELS WITH THE CURSOR, AND THAT IS CORRECTNESS (T-36-37)
 * A cursor is scope-specific because the keyset predicate is applied PER BRANCH
 * (`sources.ts`). A cursor minted with audit OFF and replayed with audit ON returns audit
 * entries older than the cursor and SILENTLY OMITS every audit entry newer than it — the
 * ones inside the window the reader has already scrolled past. So page 2 must be drawn from
 * the same source set as page 1, which means the caller sends the flag it rendered page 1
 * with. Toggling is never a `Load more`: it is a navigation and a fresh page 1.
 *
 * `includeAudit` defaults to FALSE for the same reason it does at every level of
 * `assemble.ts`: a caller that has not been taught about the scope gets Phase 35's timeline
 * unchanged rather than an audit-dominated one.
 */
export async function loadMoreTimeline(
  entityType: EntityType,
  entityId: string,
  cursor: string,
  includeAudit: boolean = false
): Promise<PageResult> {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return { success: false, error: NOT_AUTHENTICATED }
    }

    const page = await assembleTimeline({
      entityType,
      entityId,
      cursor,
      includeAudit,
    })

    return { success: true, page }
  } catch (error) {
    console.error("loadMoreTimeline failed:", error)
    return { success: false, error: NOTE_ERROR.failed }
  }
}
