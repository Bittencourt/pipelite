import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeNote } from "@/lib/api/serializers/note"
import {
  findNoteById,
  updateNoteMutation,
  softDeleteNoteMutation,
  updateNoteSchema as noteBodySchema,
} from "@/lib/mutations/notes"
import { isAuthorOrAdmin, resolveActorRole } from "@/lib/notes/authorize"
import type { Note } from "@/db/schema"

interface RouteParams {
  params: Promise<{ noteId: string }>
}

/**
 * Every mutating handler below runs this first.
 *
 * Why it cannot be folded into a `where` clause the way the deals route folds ownership in:
 * "author OR admin" is not a single equality, so there is no predicate that both finds the row
 * and authorises it. The lookup and the decision have to be two steps, which means the decision
 * has to be made explicitly here — and it is made by the SHARED predicate, so this surface and
 * the browser server action cannot drift apart (T-35-09).
 *
 * `findNoteById` already filters soft-deleted rows, so a missing note and a soft-deleted note
 * return the identical 404: no existence oracle (T-35-10).
 *
 * `ApiAuthContext` is `{ userId, keyId }` with no role, so the role is re-read from storage
 * rather than trusted from the request (T-35-24). An unresolvable actor is denied, never
 * treated as a non-admin fallback (T-35-25).
 */
async function authorizeNoteMutation(
  noteId: string,
  userId: string
): Promise<{ ok: true; note: Note } | { ok: false; response: NextResponse }> {
  const note = await findNoteById(noteId)
  if (!note) {
    return { ok: false, response: Problems.notFound("Note") }
  }

  const actor = await resolveActorRole(userId)
  if (!actor) {
    return { ok: false, response: Problems.forbidden() }
  }

  if (!isAuthorOrAdmin(note, actor)) {
    return { ok: false, response: Problems.forbidden() }
  }

  return { ok: true, note }
}

/**
 * PATCH /api/v1/notes/{noteId}
 *
 * Authorization runs before the body is even read, so a caller who may not edit this note
 * never reaches a mutation call (T-35-03).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    try {
      const { noteId } = await params

      const authorized = await authorizeNoteMutation(noteId, context.userId)
      if (!authorized.ok) {
        return authorized.response
      }

      let body: unknown
      try {
        body = await req.json()
      } catch {
        return Problems.validation([
          { field: "body", code: "invalid_json", message: "Invalid JSON body" },
        ])
      }

      const parsed = noteBodySchema.safeParse(body)
      if (!parsed.success) {
        return Problems.validation(
          parsed.error.issues.map((issue) => ({
            field: issue.path.join(".") || "body",
            code: issue.code,
            message: issue.message,
          }))
        )
      }

      const result = await updateNoteMutation(noteId, parsed.data.content)

      if (!result.success) {
        console.error("PATCH /api/v1/notes/[noteId] failed:", result.error)
        return Problems.internalError()
      }

      return singleResponse(serializeNote(result.note))
    } catch (error) {
      console.error("PATCH /api/v1/notes/[noteId] failed:", error)
      return Problems.internalError()
    }
  })
}

/**
 * DELETE /api/v1/notes/{noteId}
 *
 * Soft delete only. A removed note stays on disk so the migration reconciliation and the
 * `notes_migration_uniq` invariant keep holding; this file therefore never issues a SQL DELETE
 * and never touches the drizzle delete builder.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (_req: NextRequest, context: ApiAuthContext) => {
    try {
      const { noteId } = await params

      const authorized = await authorizeNoteMutation(noteId, context.userId)
      if (!authorized.ok) {
        return authorized.response
      }

      const result = await softDeleteNoteMutation(noteId)

      if (!result.success) {
        console.error("DELETE /api/v1/notes/[noteId] failed:", result.error)
        return Problems.internalError()
      }

      return noContentResponse()
    } catch (error) {
      console.error("DELETE /api/v1/notes/[noteId] failed:", error)
      return Problems.internalError()
    }
  })
}
