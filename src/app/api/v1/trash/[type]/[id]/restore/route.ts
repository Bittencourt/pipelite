import { NextRequest } from "next/server"
import { z } from "zod"

import { withApiAuth, type ApiAuthContext } from "@/lib/api/auth"
import { noContentResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { resolveActorRole } from "@/lib/notes/authorize"
import type { EntityType } from "@/db/schema/custom-fields"
import { TRASH_TABS, TRASH_TAB_TO_ENTITY, isTrashEntityType } from "@/lib/trash/entity-types"
import { findTrashedRecord } from "@/lib/trash/queries"
import { restoreRecordByType } from "@/lib/trash/dispatch"

/**
 * POST /api/v1/trash/{type}/{id}/restore — the REST half of TRASH-02.
 *
 * OWNER-OR-ADMIN, and the decision is deliberately the SAME ONE the browser makes in
 * `src/app/trash/actions.ts`: a member may restore what they own, an admin may restore anything.
 * Two surfaces that reach the same mutation must not disagree about who may reach it, so both
 * compare against `findTrashedRecord`'s `ownerId` rather than each inlining their own lookup.
 *
 * The role is RE-READ FROM STORAGE on every request: `ApiAuthContext` is `{ userId, keyId }` with
 * no role (src/lib/api/auth.ts:7-10), so nothing in the request can influence the decision. An
 * unresolvable actor — unknown user, soft-deleted user, or a thrown lookup, all of which
 * `resolveActorRole` returns `null` for — is DENIED (T-37-02, carrying T-35-25 forward).
 *
 * THE WRITE IS DELEGATED, never inlined. `restoreRecordByType` routes to the same mutation the UI
 * calls, so the un-delete, the parent handling and the event emission exist once per entity
 * (T-37-32). This file issues no direct write against any table and none may be added; a grep gate
 * on the drizzle write verbs holds that line, which is why this paragraph names neither.
 *
 * ACTOR ATTRIBUTION IS ALREADY ESTABLISHED and is not re-established here. `withApiAuth` wraps
 * every `/api/v1` handler in `runWithActor({ kind: "api_key", userId })` (src/lib/api/auth.ts:74),
 * which its own header documents as the ONLY place an `api_key` actor is created — precisely so
 * routes need no per-mutation edit to be audited. A second identical wrap in this file would add a
 * second creation site for no behavioural difference (T-37-08).
 *
 * NO CRM BUS EVENT is emitted from this route: no restore or purge event type is introduced in
 * this phase, and whatever the mutation emits it emits identically for both surfaces.
 */

interface RouteParams {
  params: Promise<{ type: string; id: string }>
}

/**
 * The `{type}` path segment → an `EntityType`, or `null`.
 *
 * A PATH SEGMENT IS NOT A SEARCH PARAM. `parseTrashTab` answers `deals` for anything it does not
 * recognise, which is right for a URL a user can mangle by hand-editing and wrong here: a client
 * that POSTed to `/api/v1/trash/notes/{id}/restore` and got a 204 back would believe it restored a
 * note. So the membership test is done here, where the miss is still visible, and the caller is
 * told (T-37-03).
 *
 * Validated against `TRASH_TABS` itself rather than a local copy of the four literals, then
 * narrowed a second time with `isTrashEntityType` — the map lookup is total by type, and the
 * predicate is what proves it at runtime on a value that arrived as an untyped string.
 *
 * Deliberately duplicated in the sibling purge route rather than shared: a `route.ts` in the app
 * router may not export helpers, and both copies read the same `TRASH_TABS` constant, so they can
 * differ in shape but never in vocabulary.
 */
const segmentSchema = z.enum(TRASH_TABS)

function narrowEntityType(segment: string): EntityType | null {
  const parsed = segmentSchema.safeParse(segment)

  if (!parsed.success) return null

  const entityType = TRASH_TAB_TO_ENTITY[parsed.data]

  return isTrashEntityType(entityType) ? entityType : null
}

function invalidType(segment: string) {
  return Problems.validation([
    {
      field: "type",
      code: "invalid_value",
      // The segment is echoed back so a client can see what it actually sent; the allow-list is
      // spelled out because guessing between `deal` and `deals` is a wasted round trip.
      message: `Invalid entity type "${segment}": expected one of ${TRASH_TABS.join(", ")}`,
    },
  ])
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    try {
      const { type, id } = await params

      const entityType = narrowEntityType(type)

      if (entityType === null) {
        return invalidType(type)
      }

      const actor = await resolveActorRole(context.userId)

      if (!actor) {
        // 403 rather than 404, matching audit/route.ts:125-127.
        return Problems.forbidden()
      }

      // The lookup is scoped to TRASHED records only (`isNotNull(deletedAt)` inside), so a live
      // record and a missing one are the same 404 — restore is not a way to discover live ids.
      const record = await findTrashedRecord(entityType, id)

      if (!record) {
        return Problems.notFound("Record")
      }

      // THE SAME PREDICATE THE SERVER ACTION USES (src/app/trash/actions.ts). Strict inequality
      // against the record's own stored owner; the role comes from storage, never from the
      // request (T-37-02).
      if (record.ownerId !== context.userId && actor.role !== "admin") {
        return Problems.forbidden()
      }

      const result = await restoreRecordByType(entityType, id)

      if (!result.success) {
        // The discriminated code, not prose. A record that is no longer in trash — already
        // restored, or purged between the lookup and the write — is simply not there from the
        // caller's position, so it reads as a 404 rather than a 500.
        return result.error === "NOT_IN_TRASH"
          ? Problems.notFound("Record")
          : Problems.internalError()
      }

      return noContentResponse()
    } catch (error) {
      console.error("POST /api/v1/trash/[type]/[id]/restore failed:", error)
      return Problems.internalError()
    }
  })
}
