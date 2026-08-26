import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { mapWriteError } from "@/lib/api/db-errors"
import { parseExpand } from "@/lib/api/expand"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { serializeActivity, serializeDeal, serializeOrganization, serializePerson } from "@/lib/api/serialize"
import { crmBus } from "@/lib/events"
import type { CrmEventPayload } from "@/lib/events"
import { db } from "@/db"
import { activities, activityTypes, deals, users } from "@/db/schema"
import type { CustomFieldDefinition, EntityType } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { z } from "zod"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import { log } from "@/lib/log"
import { recalculateFormulas, stripFormulaKeys } from "@/lib/formula-recalc"

const updateActivitySchema = z.object({
  title: z.string().min(1).optional(),
  type_id: z.string().min(1).optional(),
  deal_id: z.string().nullable().optional(),
  owner_id: z.string().optional(),
  // WR-01: `.datetime()` and NON-nullable, and both halves close a reachable 500.
  //
  // `activities.due_date` is `.notNull()` (`src/db/schema/activities.ts:13`) while this field used to
  // declare `z.string().nullable().optional()`. `{"due_at": null}` therefore passed zod, executed
  // `due_date = null` and returned `23502 null value in column "due_date" violates not-null
  // constraint` as a 500 — for a request that can never succeed. There is no way to CLEAR this
  // column, so refusing `null` with a field name is the honest answer.
  //
  // Without `.datetime()`, `{"due_at": "not-a-date"}` reached `new Date("not-a-date")`, which is an
  // `Invalid Date`; postgres.js serializes via `toISOString()` and throws
  // `RangeError: Invalid time value` — another 500, and one carrying no SQLSTATE at all.
  //
  // Making the state UNREPRESENTABLE is preferred over catching it: the caller now gets the field
  // name and a zod code instead of a mapped database error.
  due_at: z.string().datetime().optional(),
  // `completed_at` STAYS nullable: `activities.completed_at` is nullable and `null` is the
  // meaningful value that marks an activity not-done. Only the format is tightened.
  completed_at: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/** The three `users` columns the `?expand=owner` payload projects, anchored to the schema. */
type ExpandedOwner = Pick<typeof users.$inferSelect, "id" | "name" | "email">

/** The exact shape Drizzle accepts for the relational `with` key on an activity query. */
type ActivityWith = NonNullable<Parameters<typeof db.query.activities.findFirst>[0]>["with"]

/** An activity row plus the relations the `expand` handler may have loaded. */
type ActivityExpanded = typeof activities.$inferSelect & {
  type?: typeof activityTypes.$inferSelect | null
  deal?: (Parameters<typeof serializeDeal>[0] & {
    organization?: Parameters<typeof serializeOrganization>[0] | null
    person?: Parameters<typeof serializePerson>[0] | null
  }) | null
  owner?: ExpandedOwner | null
}

/**
 * `previous` is the row as it stood BEFORE the write, from the existence check each handler
 * already runs — no extra query. A subscriber fires after the write and cannot recover a former
 * value for itself. It must be in the SAME casing as this site's `data`, which is the raw
 * camelCase row here (matching `src/lib/mutations/activities.ts`), never `serializeActivity`.
 */
function buildActivityEventPayload(
  entityId: string,
  action: "created" | "updated" | "deleted",
  data: Record<string, unknown>,
  userId: string,
  changedFields: string[] | null = null,
  previous?: Record<string, unknown>
): CrmEventPayload {
  return {
    entity: "activity",
    entityId,
    action,
    data,
    previous,
    changedFields,
    userId,
    timestamp: new Date().toISOString(),
  }
}

// GET /api/v1/activities/:id - Get a single activity
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params
    const expand = parseExpand(req)

    // Build with options based on expand
    const withOptions: ActivityWith = expand.size > 0 ? {
      ...(expand.has("type") ? { type: true as const } : {}),
      ...(expand.has("deal") ? {
        deal: {
          with: {
            organization: true as const,
            person: true as const,
          },
        },
      } : {}),
      ...(expand.has("owner") ? { owner: true as const } : {}),
    } : undefined

    const activity = await db.query.activities.findFirst({
      where: and(eq(activities.id, id), isNull(activities.deletedAt)),
      with: withOptions,
    }) as ActivityExpanded | undefined

    if (!activity) {
      return Problems.notFound("Activity")
    }

    // Verify ownership
    if (activity.ownerId !== ctx.userId) {
      return Problems.forbidden()
    }

    const serialized: Record<string, unknown> = serializeActivity(activity)

    if (expand.has("type") && activity.type) {
      serialized.type = {
        id: activity.type.id,
        name: activity.type.name,
        icon: activity.type.icon,
        color: activity.type.color,
      }
    }

    // CR-01, the READ half. The write guard in PUT makes a NEW foreign link impossible; this makes
    // an EXISTING one unreadable. `activity.deal` is loaded through the relation by id alone, so a
    // row that already carries a foreign `deal_id` — planted before that guard existed, or through
    // the session-auth mutation path, which still validates existence only — would otherwise
    // serialize another user's deal, organization (`website`, `industry`, `notes`, `custom_fields`)
    // and person (`email`, `phone`, `notes`). The `owner_id` comparison is LOAD-BEARING, not
    // belt-and-braces.
    if (expand.has("deal") && activity.deal && activity.deal.ownerId === ctx.userId) {
      serialized.deal = {
        ...serializeDeal(activity.deal),
        ...(activity.deal.organization && { organization: serializeOrganization(activity.deal.organization) }),
        ...(activity.deal.person && { person: serializePerson(activity.deal.person) }),
      }
    }

    if (expand.has("owner") && activity.owner) {
      serialized.owner = {
        id: activity.owner.id,
        name: activity.owner.name,
        email: activity.owner.email,
      }
    }

    return singleResponse(serialized)
  })
}

// PUT /api/v1/activities/:id - Update an activity
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params

    // Fetch existing activity
    const existingActivity = await db.query.activities.findFirst({
      where: and(eq(activities.id, id), isNull(activities.deletedAt)),
    })

    if (!existingActivity) {
      return Problems.notFound("Activity")
    }

    // Verify ownership. Placed BEFORE the body parse below, so a foreign caller's payload is never
    // even read — matching pipelines/[id]/route.ts, where the same guard precedes the JSON parse.
    if (existingActivity.ownerId !== ctx.userId) {
      return Problems.forbidden()
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return Problems.validation([{ field: "body", code: "invalid_json", message: "Invalid JSON body" }])
    }

    const parsed = updateActivitySchema.safeParse(body)
    if (!parsed.success) {
      return Problems.validation(
        parsed.error.issues.map(issue => ({
          field: issue.path.join(".") || "body",
          code: issue.code,
          message: issue.message,
        }))
      )
    }

    const updates = parsed.data

    // `owner_id` decides all future authorization on this row, so a caller handing it to somebody
    // else is an elevation-of-privilege write, not a field update. It is REJECTED rather than
    // silently dropped: a security boundary must fail loudly, otherwise the caller is left believing
    // the write landed as sent. The field deliberately stays in `updateActivitySchema` — dropping it
    // there would make zod strip it and produce exactly the silent success this rejects.
    if (updates.owner_id !== undefined && updates.owner_id !== ctx.userId) {
      return Problems.validation([
        {
          field: "owner_id",
          code: "forbidden",
          message: "owner_id cannot be reassigned through this endpoint",
        },
      ])
    }

    // CR-01: `deal_id` is a CALLER-SUPPLIED FOREIGN KEY, and SEC-01's ownership predicate constrains
    // the `activities` ROW only — never the relation the caller chooses to attach to it. Before this
    // guard the value went straight into `updateData` with no ownership check and no existence check,
    // so `PUT` with a deal id belonging to another user answered 200, and
    // `GET ...?expand=deal` then serialized that deal plus its organization and its person. THE WRITE
    // IS THE DEFECT: this refuses it rather than sanitising the read.
    //
    // Same shape, same 422 and same `invalid_reference` code as the house pattern at
    // `src/app/api/v1/deals/[id]/route.ts:226-256`, so the codebase keeps ONE convention for
    // validating a caller-supplied foreign key rather than two.
    //
    // Two deliberate non-cases:
    //   - `deal_id: null` DETACHES. It is not a reference, so it is not looked up.
    //   - `type_id` gets no ownership guard because `activity_types` HAS no owner column
    //     (`src/db/schema/activity-types.ts`) — it is a shared lookup table, so there is nothing to
    //     compare `ctx.userId` against. Its EXISTENCE is a separate concern.
    if (updates.deal_id) {
      const deal = await db.query.deals.findFirst({
        where: and(
          eq(deals.id, updates.deal_id),
          eq(deals.ownerId, ctx.userId),
          isNull(deals.deletedAt)
        ),
      })

      if (!deal) {
        return Problems.validation([
          { field: "deal_id", code: "invalid_reference", message: "Deal not found" },
        ])
      }
    }

    // WR-01: `type_id` EXISTENCE, checked here rather than discovered by the database.
    //
    // `activities.type_id` is a foreign key, so `{"type_id": "does-not-exist"}` reached the UPDATE
    // and returned `23503` as a 500 — while `POST /api/v1/activities` answered a clean 422
    // ("Activity type not found") for the identical input. Two verbs disagreeing about one error is
    // worse than either answer alone.
    //
    // This is EXISTENCE only, not ownership: `activity_types` has no owner column
    // (`src/db/schema/activity-types.ts`) — it is a shared lookup table, so there is nothing to
    // compare `ctx.userId` against. Do not "complete" this into an ownership check.
    if (updates.type_id) {
      const type = await db.query.activityTypes.findFirst({
        where: eq(activityTypes.id, updates.type_id),
      })

      if (!type) {
        return Problems.validation([
          { field: "type_id", code: "invalid_reference", message: "Activity type not found" },
        ])
      }
    }

    const now = new Date()

    // Build update object and track changed fields
    const updateData: Record<string, unknown> = {
      updatedAt: now,
    }
    const changedFields: string[] = []

    if (updates.title !== undefined) {
      updateData.title = updates.title
      if (updates.title !== existingActivity.title) changedFields.push("title")
    }
    if (updates.type_id !== undefined) {
      updateData.typeId = updates.type_id
      if (updates.type_id !== existingActivity.typeId) changedFields.push("typeId")
    }
    if (updates.deal_id !== undefined) {
      updateData.dealId = updates.deal_id
      if ((updates.deal_id || null) !== existingActivity.dealId) changedFields.push("dealId")
    }
    if (updates.owner_id !== undefined) {
      updateData.ownerId = updates.owner_id
      if (updates.owner_id !== existingActivity.ownerId) changedFields.push("ownerId")
    }
    if (updates.due_at !== undefined) {
      updateData.dueDate = updates.due_at ? new Date(updates.due_at) : null
      changedFields.push("dueDate")
    }
    if (updates.notes !== undefined) {
      updateData.notes = updates.notes
      if ((updates.notes || null) !== existingActivity.notes) changedFields.push("notes")
    }

    // Handle completed_at
    if (updates.completed_at !== undefined) {
      updateData.completedAt = updates.completed_at ? new Date(updates.completed_at) : null
      const wasCompleted = existingActivity.completedAt !== null
      const willBeCompleted = updates.completed_at !== null
      if (wasCompleted !== willBeCompleted) changedFields.push("completed")
    }

    // Handle custom_fields with merge
    // Definitions are loaded once and reused by the recalculation below through the cache.
    const definitionsCache = new Map<EntityType, CustomFieldDefinition[]>()
    if (updates.custom_fields !== undefined) {
      const definitions = await getActiveFieldDefinitions("activity")
      definitionsCache.set("activity", definitions)
      updateData.customFields = {
        ...((existingActivity.customFields as Record<string, unknown>) || {}),
        // T-34-04: the server is the sole writer of formula keys.
        ...stripFormulaKeys(updates.custom_fields, definitions),
      }
    }

    // WR-01: the write is wrapped because `withApiAuth` has no `try`/`catch`, so an error here
    // propagates out as a rejected promise and Next.js renders it as a 500 — telling the caller to
    // retry a request that will fail identically forever.
    //
    // The zod tightening above and the two reference checks make the KNOWN cases unreachable. This
    // catch is the backstop for what a schema cannot express: `deal_id` or `type_id` deleted by a
    // concurrent request between the check and this statement is still a real `23503`, because those
    // are separate statements.
    //
    // WR-10: `| undefined` is the RUNTIME type of a destructured `.returning()` element.
    // `tsconfig.json` sets `strict: true` but NOT `noUncheckedIndexedAccess`, so annotating this as
    // the bare row made the compiler agree with a claim the driver does not make: an UPDATE that
    // matches nothing resolves to `[]`. Every dereference below sits OUTSIDE this `try`, so
    // `updatedActivity.customFields` threw `TypeError: Cannot read properties of undefined` right
    // past the block that exists to stop exactly that. Reachable through a soft delete followed by
    // `purgeActivityMutation` between the ownership read and this statement.
    let updatedActivity: typeof activities.$inferSelect | undefined
    try {
      ;[updatedActivity] = await db.update(activities)
        .set(updateData)
        .where(eq(activities.id, id))
        .returning()
    } catch (error) {
      return mapWriteError("api/v1/activities/[id]", error, {
        // `activities` carries no unique index a caller can collide with, so there is deliberately
        // no `conflict` message: a 23505 here would be unexpected and must surface as a logged 500
        // rather than as a 409 with a guessed detail.
        field: "body",
      })
    }

    // WR-10: the row was there when the ownership read ran and is gone now — a 404, which
    // `public/openapi.yaml` already declares on this operation (WR-03), so this needs no contract
    // change and no gate edit. Placed before the recalculation and the emit deliberately: a webhook
    // announcing an update to a row that no longer exists is worse than the 500 it replaces.
    if (!updatedActivity) {
      return Problems.notFound("Activity")
    }

    // Recalculate BEFORE the emit (D-17): the webhook body and the workflow-trigger envelope are
    // emit-time snapshots of this object, so recalculating afterwards would leave both stale.
    // A rejected recalculation is logged and stepped over — a broken formula must never block a
    // caller's update (D-05).
    let recalculatedCustomFields = (updatedActivity.customFields ?? {}) as Record<string, unknown>
    try {
      const recalced = await recalculateFormulas({
        entityType: "activity",
        entityId: id,
        // The event's own changedFields carries the coarse literal "customFields"; the recalc
        // scope carries the precise key names so SC-4 holds tightly on this path too.
        changedFields: [...changedFields, ...Object.keys(updates.custom_fields ?? {})],
        row: updatedActivity as unknown as Record<string, unknown>,
        definitionsCache,
      })
      // `null` = recalculation could not describe the entity, not "no custom fields".
      recalculatedCustomFields = recalced.customFields ?? recalculatedCustomFields
    } catch (error) {
      log.error("formula-recalc", "activity recalculation failed", { err: error })
    }

    const recalculatedActivity = { ...updatedActivity, customFields: recalculatedCustomFields }

    // Emit CRM event via bus
    crmBus.emit("activity.updated", buildActivityEventPayload(
      id,
      "updated",
      recalculatedActivity as unknown as Record<string, unknown>,
      ctx.userId,
      changedFields.length > 0 ? changedFields : null,
      // The pre-write row, raw camelCase to match `data` above.
      existingActivity as unknown as Record<string, unknown>,
    ))

    return singleResponse(serializeActivity(recalculatedActivity))
  })
}

// DELETE /api/v1/activities/:id - Soft delete an activity
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params

    // Fetch existing activity
    const existingActivity = await db.query.activities.findFirst({
      where: and(eq(activities.id, id), isNull(activities.deletedAt)),
    })

    if (!existingActivity) {
      return Problems.notFound("Activity")
    }

    // Verify ownership
    if (existingActivity.ownerId !== ctx.userId) {
      return Problems.forbidden()
    }

    // Soft delete. Wrapped for the same reason as the PUT write: an unwrapped rejection here is a
    // 500 with no problem document. This is an UPDATE, not a DELETE, so a child row cannot block it
    // and `mapWriteError` is the right mapper.
    try {
      await db.update(activities)
        .set({ deletedAt: new Date() })
        .where(eq(activities.id, id))
    } catch (error) {
      return mapWriteError("api/v1/activities/[id]", error)
    }

    // Emit CRM event via bus. `data` is `{ id }`, so `previous` is the ONLY source of tombstone
    // state — omitting it would silently produce an audit row with no field detail.
    crmBus.emit("activity.deleted", buildActivityEventPayload(
      id,
      "deleted",
      { id },
      ctx.userId,
      null,
      existingActivity as unknown as Record<string, unknown>,
    ))

    return noContentResponse()
  })
}
