import { NextRequest } from "next/server"
import { z } from "zod"

import { withApiAuth, type ApiAuthContext } from "@/lib/api/auth"
import { noContentResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { resolveActorRole } from "@/lib/notes/authorize"
import type { EntityType } from "@/db/schema/custom-fields"
import { TRASH_TABS, TRASH_TAB_TO_ENTITY, isTrashEntityType } from "@/lib/trash/entity-types"
import { findTrashedRecord } from "@/lib/trash/queries"
import { purgeRecordByType } from "@/lib/trash/dispatch"

/**
 * DELETE /api/v1/trash/{type}/{id} — the REST half of TRASH-03. THE IRREVERSIBLE ONE.
 *
 * ADMIN-ONLY, unlike its restore sibling, and unlike every other DELETE under `/api/v1`: those
 * soft-delete a record their owner can get back, this destroys one nobody can. Ownership is not
 * enough to authorise it — the decision matches `src/app/trash/actions.ts`, so the two surfaces
 * cannot disagree about who may permanently remove a customer record.
 *
 * THE ADMIN CHECK RUNS BEFORE THE RECORD LOOKUP, and that ordering is the mitigation rather than a
 * stylistic preference (T-37-01). With the lookup first, a member could walk ids and read the
 * 404/403 split as an existence oracle for records they may not see. With the gate first, every
 * non-admin request produces exactly one answer regardless of what the id names.
 *
 * The role is RE-READ FROM STORAGE on every request: `ApiAuthContext` is `{ userId, keyId }` with
 * no role (src/lib/api/auth.ts:7-10). An unresolvable actor — unknown user, soft-deleted user, or
 * a thrown lookup, all `null` from `resolveActorRole` — is DENIED, never treated as a non-admin
 * and never as a default-allow.
 *
 * THE WRITE IS DELEGATED, never inlined. `purgeRecordByType` routes to the same mutation the UI
 * calls, so the ordered child teardown and the `isNotNull(deletedAt)` guard live in exactly one
 * place per entity (T-37-32). This file issues no direct write against any table and none may be
 * added: a second teardown path is how a purge that forgets to detach children ships. A grep gate
 * on the two drizzle write verbs holds that line, which is why this paragraph names neither.
 *
 * ACTOR ATTRIBUTION IS ALREADY ESTABLISHED and is not re-established here. `withApiAuth` wraps
 * every `/api/v1` handler in `runWithActor({ kind: "api_key", userId })` (src/lib/api/auth.ts:74),
 * documented there as the ONLY place an `api_key` actor is created so that routes need no
 * per-mutation edit to be audited (T-37-08).
 *
 * NO CRM BUS EVENT is emitted from this route; no purge event type is introduced in this phase.
 */

interface RouteParams {
  params: Promise<{ type: string; id: string }>
}

/**
 * The `{type}` path segment → an `EntityType`, or `null`. See the identical helper in
 * `./restore/route.ts` for why the segment is not run through `parseTrashTab`'s silent default,
 * and why the two copies cannot drift in vocabulary (T-37-03).
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
      message: `Invalid entity type "${segment}": expected one of ${TRASH_TABS.join(", ")}`,
    },
  ])
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    try {
      const { type, id } = await params

      // Validation first: an unrecognised segment never selects a table, and answering it before
      // the role lookup costs an unauthorised caller nothing it did not already know — it sent
      // the string.
      const entityType = narrowEntityType(type)

      if (entityType === null) {
        return invalidType(type)
      }

      const actor = await resolveActorRole(context.userId)

      // THE GATE, ahead of every read of the record. A non-admin gets this answer whether or not
      // the id exists (T-37-01).
      if (!actor || actor.role !== "admin") {
        return Problems.forbidden()
      }

      // Scoped to TRASHED records only, so a live record is a 404 here: purge cannot be used as a
      // hard-delete shortcut past the soft-delete step.
      const record = await findTrashedRecord(entityType, id)

      if (!record) {
        return Problems.notFound("Record")
      }

      const result = await purgeRecordByType(entityType, id)

      if (!result.success) {
        // A record that left trash between the lookup and the write is simply not there.
        return result.error === "NOT_IN_TRASH"
          ? Problems.notFound("Record")
          : Problems.internalError()
      }

      // 204, not the mutation's `detached` count. The count describes live children the purge
      // unlinked rather than destroyed — useful in the UI toast, but a DELETE that returns a body
      // would be the only one under `/api/v1` that does.
      return noContentResponse()
    } catch (error) {
      console.error("DELETE /api/v1/trash/[type]/[id] failed:", error)
      return Problems.internalError()
    }
  })
}
