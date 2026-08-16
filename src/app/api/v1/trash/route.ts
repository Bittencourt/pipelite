import { NextRequest } from "next/server"
import { z } from "zod"

import { withApiAuth, type ApiAuthContext } from "@/lib/api/auth"
import { parsePagination } from "@/lib/api/pagination"
import { paginatedResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { resolveActorRole } from "@/lib/notes/authorize"
import type { EntityType } from "@/db/schema/custom-fields"
import { TRASH_TABS, TRASH_TAB_TO_ENTITY, parseTrashTab } from "@/lib/trash/entity-types"
import { TRASH_PAGE_SIZE, countTrashed, listTrashed, type TrashRow } from "@/lib/trash/queries"
import type { DeletedByPresentation } from "@/lib/trash/present"

/**
 * GET /api/v1/trash — the REST half of TRASH-01.
 *
 * OWNER-OR-ADMIN, AND THE SCOPE IS IN THE QUERY. A member sees only records they own; an admin
 * sees everything. That decision is made inside `listTrashed` / `countTrashed`, which share one
 * composed `trashScope` predicate, so the count in the envelope and the rows under it can never be
 * scoped differently and no row a caller may not see is ever fetched and then filtered away
 * (T-37-02).
 *
 * THE ROLE IS RE-READ FROM STORAGE ON EVERY REQUEST. `ApiAuthContext` is `{ userId, keyId }` with
 * NO role (src/lib/api/auth.ts:7-10), so there is nothing in the request — header, query param or
 * body — that can influence the scope. An unresolvable actor (unknown user, soft-deleted user, or
 * a thrown lookup, all of which `resolveActorRole` returns `null` for) is DENIED rather than
 * treated as a non-admin, carrying the `/api/v1/audit` posture forward (T-35-25 → T-36-05).
 *
 * READ-ONLY. Restore lives at POST /api/v1/trash/[type]/[id]/restore and purge at
 * DELETE /api/v1/trash/[type]/[id]; neither verb may be added to this file.
 */

/**
 * `?type=` is validated against `TRASH_TABS` ITSELF, not against a local copy of the four
 * literals.
 *
 * The audit route declares its own `as const satisfies readonly AuditEntityType[]` array because
 * its vocabulary (four CRM types plus `import_session`) is narrower than the schema union and
 * exists nowhere else. The trash vocabulary is the opposite case: `TRASH_TABS` in
 * src/lib/trash/entity-types.ts IS the allow-list, and the page, the server actions and this route
 * must all agree on it. Re-typing the literals here would create exactly the drift that module
 * exists to prevent, so the allow-list is imported and `z.enum` is pointed at it.
 *
 * An unrecognised value is a VALIDATION ERROR here, not a fallback. `parseTrashTab` quietly
 * returns `deals` for anything it does not recognise, which is right for a URL a user can mangle
 * by hand-editing and wrong for a REST caller: a client that asked for `?type=notes` and got a
 * page of deals back has been told nothing and will ship the bug (T-37-03).
 */
const trashQuerySchema = z.object({
  type: z.enum(TRASH_TABS).optional(),
})

/**
 * The upper bound on how deep a caller may page.
 *
 * `parsePagination` clamps `limit` but deliberately leaves `offset` unbounded (it is only ever
 * fed to a `.offset()` on an indexed query elsewhere). Here the offset is converted into a
 * `listTrashed` page, and an unclamped `?offset=99999999` would ask for millions of rows, so the
 * ceiling is re-applied. 200 pages of 50 is 10,000 records — the same bound `MAX_TRASH_PAGE` in
 * entity-types.ts puts on the UI surface, restated rather than imported because that constant is
 * module-private there and widening its export to satisfy this route would be the wrong trade.
 */
const MAX_TRASH_API_PAGE = 200
const MAX_TRASH_API_OFFSET = TRASH_PAGE_SIZE * MAX_TRASH_API_PAGE

/**
 * Offset/limit → the `listTrashed` page that contains that window.
 *
 * `listTrashed(tab, page, viewer)` is CUMULATIVE: it returns rows 1..(page × TRASH_PAGE_SIZE),
 * because the UI it was built for is a "Load more" list rather than a numbered pager. This route
 * therefore asks for the smallest page that covers `offset + limit` and slices the window out of
 * it. The slice is a PRESENTATION step, never an authorization one — every row it discards was
 * already inside the caller's scope, because the scope is in the WHERE clause.
 *
 * The cost is honest: serving `offset=9950` fetches 10,000 rows. That is bounded and acceptable
 * for a trash view, and the fix if it ever bites is an offset-based read in
 * src/lib/trash/queries.ts, not a second scoped query written here.
 */
function pageCovering(offset: number, limit: number): number {
  const bounded = Math.min(offset, MAX_TRASH_API_OFFSET)
  const needed = Math.ceil((bounded + limit) / TRASH_PAGE_SIZE)

  return Math.min(MAX_TRASH_API_PAGE, Math.max(1, needed))
}

/**
 * "Deleted by", serialized.
 *
 * The kind is mapped to the snake_case spelling `/api/v1/audit` already uses for the same
 * concepts (`workflow_run`, `api_key`), so a client does not meet two vocabularies for one fact.
 * The `switch` is exhaustive with a `never` default: a sixth presentation kind is a compile error
 * here rather than an unlabelled object on the wire.
 *
 * NO KEY NAME IS EMITTED FOR `api_key`, and none can be. `audit_log` carries `actor_user_id`,
 * `workflow_run_id` and `import_session_id` and no api-key reference at all; the subscriber stores
 * the KEY'S OWNER in `actor_user_id` for this kind, so "resolving" a name through it would pick an
 * arbitrary one of that user's keys and publish it as fact (T-37-31). A field that is always null
 * is worse than an absent field, because a client will render it.
 */
type SerializedDeletedBy =
  | { kind: "not_recorded" }
  | { kind: "user"; name: string | null; email: string | null }
  | { kind: "unknown_user" }
  | { kind: "workflow_run"; workflow_name: string | null }
  | { kind: "api_key" }
  | { kind: "import" }
  | { kind: "system" }

function serializeDeletedBy(presentation: DeletedByPresentation): SerializedDeletedBy {
  switch (presentation.kind) {
    case "notRecorded":
      // Distinct from `unknown_user` on purpose: nobody wrote it down, as opposed to a user did
      // it and can no longer be named (T-37-REP2).
      return { kind: "not_recorded" }

    case "user":
      return { kind: "user", name: presentation.name, email: presentation.email }

    case "unknownUser":
      return { kind: "unknown_user" }

    case "workflowRun":
      return { kind: "workflow_run", workflow_name: presentation.workflowName }

    case "apiKey":
      return { kind: "api_key" }

    case "import":
      return { kind: "import" }

    case "system":
      return { kind: "system" }

    default: {
      const unhandled: never = presentation
      void unhandled
      return { kind: "not_recorded" }
    }
  }
}

/** The public shape of a trashed record: snake_case, like every other `/api/v1` serializer. */
interface SerializedTrashRow {
  id: string
  entity_type: EntityType
  name: string
  secondary: string | null
  deleted_at: string
  /** Names of this record's parents that are ALSO in trash. Always empty for organizations. */
  linked_parents: string[]
  deleted_by: SerializedDeletedBy
}

function serializeTrashRow(row: TrashRow, entityType: EntityType): SerializedTrashRow {
  return {
    id: row.id,
    // The SINGULAR entity type, so a client can round-trip a row straight into
    // /api/v1/trash/{type}/{id} without transforming the plural tab name itself.
    entity_type: entityType,
    name: row.name,
    secondary: row.secondary,
    deleted_at: row.deletedAt.toISOString(),
    linked_parents: row.linkedParents,
    deleted_by: serializeDeletedBy(row.deletedBy),
  }
}

/**
 * GET /api/v1/trash
 *
 * Standard `{ data, meta: { total, offset, limit } }` envelope. `?type=` selects the tab and
 * defaults to deals when absent.
 */
export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    try {
      // The role is resolved FIRST, before the query string is inspected. Unlike `/api/v1/audit`
      // this is not an admin gate — the resolved role BUILDS the scope rather than refusing the
      // request — but an actor that cannot be resolved at all still fails closed.
      const actor = await resolveActorRole(context.userId)

      if (!actor) {
        // 403 rather than 404, matching audit/route.ts:125-127: the endpoint's existence is not a
        // secret, and a 404 would tell an admin whose lookup transiently failed that it is gone.
        return Problems.forbidden()
      }

      const { searchParams } = req.nextUrl
      const parsed = trashQuerySchema.safeParse({
        type: searchParams.get("type") ?? undefined,
      })

      if (!parsed.success) {
        // Returning here is the mitigation: an invalid `type` never reaches a table selection.
        return Problems.validation(
          parsed.error.issues.map((issue) => ({
            field: issue.path.join(".") || "query",
            code: issue.code,
            message: issue.message,
          }))
        )
      }

      // Already known-valid, so this only applies the shared default for an absent `?type=` —
      // keeping "which tab is the default" in one place rather than repeating `"deals"` here.
      const tab = parseTrashTab(parsed.data.type)
      const entityType = TRASH_TAB_TO_ENTITY[tab]

      const { offset, limit } = parsePagination(req)

      // The viewer is built ONLY from the storage-resolved actor. Nothing the caller sent
      // contributes to it (T-37-02).
      const viewer = { userId: actor.userId, role: actor.role }

      const [listed, counts] = await Promise.all([
        listTrashed(tab, pageCovering(offset, limit), viewer),
        countTrashed(viewer),
      ])

      // Both functions degrade to a value rather than throwing, because their first caller is a
      // page render with no `error.tsx` above it. A REST caller has no such constraint and must
      // not be handed an empty page that looks like an empty trash, so the degraded values are
      // turned back into a 500 here.
      if (!listed.ok || counts === null) {
        console.error("GET /api/v1/trash failed: trash read degraded", {
          tab,
          listed: listed.ok,
          counted: counts !== null,
        })
        return Problems.internalError()
      }

      // `listTrashed` is cumulative, so the requested window is sliced out of it. Discarding rows
      // here is never an access-control step — see `pageCovering`.
      const window = listed.rows.slice(offset, offset + limit)

      return paginatedResponse(
        window.map((row) => serializeTrashRow(row, entityType)),
        counts[tab],
        offset,
        limit
      )
    } catch (error) {
      console.error("GET /api/v1/trash failed:", error)
      return Problems.internalError()
    }
  })
}
