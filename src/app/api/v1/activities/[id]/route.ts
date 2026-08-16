import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { parseExpand } from "@/lib/api/expand"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { serializeActivity, serializeDeal, serializeOrganization, serializePerson } from "@/lib/api/serialize"
import { crmBus } from "@/lib/events"
import type { CrmEventPayload } from "@/lib/events"
import { db } from "@/db"
import { activities, activityTypes, users } from "@/db/schema"
import type { CustomFieldDefinition, EntityType } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { z } from "zod"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import { recalculateFormulas, stripFormulaKeys } from "@/lib/formula-recalc"

const updateActivitySchema = z.object({
  title: z.string().min(1).optional(),
  type_id: z.string().optional(),
  deal_id: z.string().nullable().optional(),
  owner_id: z.string().optional(),
  due_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
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

    const serialized: Record<string, unknown> = serializeActivity(activity)

    if (expand.has("type") && activity.type) {
      serialized.type = {
        id: activity.type.id,
        name: activity.type.name,
        icon: activity.type.icon,
        color: activity.type.color,
      }
    }

    if (expand.has("deal") && activity.deal) {
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

    const [updatedActivity] = await db.update(activities)
      .set(updateData)
      .where(eq(activities.id, id))
      .returning()

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
      console.error("[formula-recalc] activity recalculation failed:", error)
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

    // Soft delete
    await db.update(activities)
      .set({ deletedAt: new Date() })
      .where(eq(activities.id, id))

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
