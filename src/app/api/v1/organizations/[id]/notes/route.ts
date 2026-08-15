import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parsePagination } from "@/lib/api/pagination"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeNote } from "@/lib/api/serializers/note"
// `updateNoteSchema` is the exported `{ content }` rule from the mutation layer. Both the
// collection POST and the item PATCH parse their body with it, so the content ceiling lives in
// exactly one place and the migrated long note stays writable through every surface.
import { createNoteMutation, updateNoteSchema as noteBodySchema } from "@/lib/mutations/notes"
import { db } from "@/db"
import { notes } from "@/db/schema/notes"
import { organizations } from "@/db/schema/organizations"
import { and, count, desc, eq, isNull } from "drizzle-orm"

/** The polymorphic discriminator this file owns. Never taken from the request. */
const ENTITY_TYPE = "organization" as const
const ENTITY_LABEL = "Organization"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/v1/organizations/{id}/notes
 *
 * Offset/limit paging, deliberately NOT the browser timeline's keyset cursor: every other v1
 * list route returns the `{ data, meta: { total, offset, limit } }` envelope and external
 * clients are built against it.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest) => {
    try {
      const { id } = await params
      const { offset, limit } = parsePagination(req)

      // A soft-deleted parent is refused exactly like a missing one.
      const parent = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)))
        .limit(1)

      if (parent.length === 0) {
        return Problems.notFound(ENTITY_LABEL)
      }

      // `notes_live_idx` encodes this predicate but does not enforce it — every read carries it.
      const where = and(
        eq(notes.entityType, ENTITY_TYPE),
        eq(notes.entityId, id),
        isNull(notes.deletedAt)
      )

      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(notes)
          .where(where)
          // `id` is the tiebreaker so two notes written in the same millisecond keep a stable
          // order across pages instead of one silently repeating and another vanishing.
          .orderBy(desc(notes.createdAt), desc(notes.id))
          .offset(offset)
          .limit(limit),
        db.select({ total: count() }).from(notes).where(where),
      ])

      return paginatedResponse(rows.map(serializeNote), total, offset, limit)
    } catch (error) {
      console.error("GET /api/v1/organizations/[id]/notes failed:", error)
      return Problems.internalError()
    }
  })
}

/**
 * POST /api/v1/organizations/{id}/notes
 *
 * The body accepts `content` and nothing else. `authorId` is always the API key's user, never
 * a body field — otherwise a key holder could forge attribution to another user (T-35-28).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    try {
      const { id } = await params

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

      const parent = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)))
        .limit(1)

      if (parent.length === 0) {
        return Problems.notFound(ENTITY_LABEL)
      }

      const result = await createNoteMutation({
        entityType: ENTITY_TYPE,
        entityId: id,
        content: parsed.data.content,
        authorId: context.userId,
      })

      if (!result.success) {
        // The mutation layer repeats the parent check; a race between the lookup above and the
        // insert surfaces here as the same 404 the client would have got a moment earlier.
        if (result.error === "Record not found") {
          return Problems.notFound(ENTITY_LABEL)
        }
        console.error("POST /api/v1/organizations/[id]/notes failed:", result.error)
        return Problems.internalError()
      }

      return createdResponse(serializeNote(result.note))
    } catch (error) {
      console.error("POST /api/v1/organizations/[id]/notes failed:", error)
      return Problems.internalError()
    }
  })
}
