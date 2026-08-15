import { NextRequest } from "next/server"
import { and, count, desc, eq, isNull } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"

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
import type { EntityType } from "@/db/schema"

/**
 * The ONE implementation of `/api/v1/{entity}/{id}/notes`.
 *
 * WHY THIS IS SHARED RATHER THAN COPIED FOUR TIMES
 * The four nested routes were byte-identical apart from the parent table, the entity
 * discriminator and two labels — about 140 lines duplicated four times over. That body
 * carries the `isNull(notes.deletedAt)` predicate T-35-06 names as a CONTROL, plus the
 * parent-existence lookup and the `"Record not found"` remap. A per-route copy means any
 * future security change has to be made in four places with nothing gating that it was,
 * which is the exact reasoning that already gates `serializeNote` to a single definition
 * (src/lib/api/serializers/note.ts). Extending it to the route bodies costs nothing and
 * removes four standing chances to fix three of four.
 *
 * WHAT EACH ROUTE STILL OWNS
 * Its `entityType` literal. That value reaches a query predicate and is the polymorphic
 * discriminator for the whole notes table, so it is a compile-time constant in the route
 * file and is NEVER taken from the request (T-35-01 / T-35-04). The factory receives it as
 * an argument; it cannot derive it from the URL, and must not learn how.
 */

/** The two columns every CRM parent table has, and the only two this module touches. */
type ParentTable = PgTable & { id: PgColumn; deletedAt: PgColumn }

export interface NoteCollectionOptions {
  /** The polymorphic discriminator. A literal owned by the route file. */
  entityType: EntityType
  /** Human-facing name in a 404 Problem, e.g. "Deal". */
  entityLabel: string
  /** The parent record's table, used only for the existence lookup. */
  parentTable: ParentTable
  /** Prefix for server-side error logs, e.g. "/api/v1/deals/[id]/notes". */
  routeLabel: string
}

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * A soft-deleted parent is refused exactly like a missing one, on both verbs.
 */
async function parentExists(parentTable: ParentTable, id: string): Promise<boolean> {
  const rows = await db
    .select({ id: parentTable.id })
    .from(parentTable)
    .where(and(eq(parentTable.id, id), isNull(parentTable.deletedAt)))
    .limit(1)

  return rows.length > 0
}

export function noteCollectionHandlers(options: NoteCollectionOptions) {
  const { entityType, entityLabel, parentTable, routeLabel } = options

  /**
   * GET /api/v1/{entity}/{id}/notes
   *
   * Offset/limit paging, deliberately NOT the browser timeline's keyset cursor: every other v1
   * list route returns the `{ data, meta: { total, offset, limit } }` envelope and external
   * clients are built against it.
   */
  async function GET(request: NextRequest, { params }: RouteParams) {
    return withApiAuth(request, async (req: NextRequest) => {
      try {
        const { id } = await params
        const { offset, limit } = parsePagination(req)

        if (!(await parentExists(parentTable, id))) {
          return Problems.notFound(entityLabel)
        }

        // `notes_live_idx` encodes this predicate but does not enforce it — every read carries it.
        const where = and(
          eq(notes.entityType, entityType),
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
        console.error(`GET ${routeLabel} failed:`, error)
        return Problems.internalError()
      }
    })
  }

  /**
   * POST /api/v1/{entity}/{id}/notes
   *
   * The body accepts `content` and nothing else. `authorId` is always the API key's user, never
   * a body field — otherwise a key holder could forge attribution to another user (T-35-28).
   */
  async function POST(request: NextRequest, { params }: RouteParams) {
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

        if (!(await parentExists(parentTable, id))) {
          return Problems.notFound(entityLabel)
        }

        const result = await createNoteMutation({
          entityType,
          entityId: id,
          content: parsed.data.content,
          authorId: context.userId,
        })

        if (!result.success) {
          // The mutation layer repeats the parent check; a race between the lookup above and the
          // insert surfaces here as the same 404 the client would have got a moment earlier.
          if (result.error === "Record not found") {
            return Problems.notFound(entityLabel)
          }
          console.error(`POST ${routeLabel} failed:`, result.error)
          return Problems.internalError()
        }

        return createdResponse(serializeNote(result.note))
      } catch (error) {
        console.error(`POST ${routeLabel} failed:`, error)
        return Problems.internalError()
      }
    })
  }

  return { GET, POST }
}
