import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { parseExpand } from "@/lib/api/expand"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { serializeActivity, serializeDeal, serializeOrganization, serializePerson } from "@/lib/api/serialize"
import { crmBus } from "@/lib/events"
import type { CrmEventPayload } from "@/lib/events"
import { db } from "@/db"
import { activities, activityTypes } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { z } from "zod"

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

/** The exact shape Drizzle accepts for the relational `with` key on an activity query. */
type ActivityWith = NonNullable<Parameters<typeof db.query.activities.findFirst>[0]>["with"]

/** An activity row plus the relations the `expand` handler may have loaded. */
type ActivityExpanded = typeof activities.$inferSelect & {
  type?: typeof activityTypes.$inferSelect | null
  deal?: (Parameters<typeof serializeDeal>[0] & {
    organization?: Parameters<typeof serializeOrganization>[0] | null
    person?: Parameters<typeof serializePerson>[0] | null
  }) | null
  owner?: { id: string; name: string | null; email: string } | null
}

function buildActivityEventPayload(
  entityId: string,
  action: "created" | "updated" | "deleted",
  data: Record<string, unknown>,
  userId: string,
  changedFields: string[] | null = null
): CrmEventPayload {
  return {
    entity: "activity",
    entityId,
    action,
    data,
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
    if (updates.custom_fields !== undefined) {
      updateData.customFields = {
        ...((existingActivity.customFields as Record<string, unknown>) || {}),
        ...updates.custom_fields,
      }
    }

    const [updatedActivity] = await db.update(activities)
      .set(updateData)
      .where(eq(activities.id, id))
      .returning()

    // Emit CRM event via bus
    crmBus.emit("activity.updated", buildActivityEventPayload(
      id,
      "updated",
      updatedActivity as unknown as Record<string, unknown>,
      ctx.userId,
      changedFields.length > 0 ? changedFields : null,
    ))

    return singleResponse(serializeActivity(updatedActivity))
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

    // Emit CRM event via bus
    crmBus.emit("activity.deleted", buildActivityEventPayload(
      id,
      "deleted",
      { id },
      ctx.userId,
    ))

    return noContentResponse()
  })
}
