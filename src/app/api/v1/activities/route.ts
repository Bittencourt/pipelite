import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { parsePagination } from "@/lib/api/pagination"
import { parseExpand } from "@/lib/api/expand"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { serializeActivity, serializeDeal, serializePerson, serializeOrganization } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { activities, deals, activityTypes, users } from "@/db/schema"
import { eq, and, isNull, desc, asc, sql } from "drizzle-orm"
import { z } from "zod"

const createActivitySchema = z.object({
  title: z.string().min(1, "Title is required"),
  type_id: z.string().min(1, "Type ID is required"),
  deal_id: z.string().optional().nullable(),
  owner_id: z.string().optional().nullable(),
  due_at: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

// GET /api/v1/activities - List activities with pagination and filters
export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { offset, limit } = parsePagination(req)
    const expand = parseExpand(req)
    const searchParams = req.nextUrl.searchParams

    // Filter params
    const typeId = searchParams.get("type_id")
    const dealId = searchParams.get("deal_id")
    const ownerId = searchParams.get("owner_id")

    // Build where conditions
    const conditions = [isNull(activities.deletedAt)]
    
    if (typeId) {
      conditions.push(eq(activities.typeId, typeId))
    }
    if (dealId) {
      conditions.push(eq(activities.dealId, dealId))
    }
    if (ownerId) {
      conditions.push(eq(activities.ownerId, ownerId))
    }

    // Build with options based on expand
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let withOptions: any = undefined
    if (expand.size > 0) {
      withOptions = {}
      if (expand.has("type")) withOptions.type = true
      if (expand.has("deal")) {
        withOptions.deal = {
          with: {
            organization: expand.has("deal"),
            person: expand.has("deal"),
          }
        }
      }
      if (expand.has("owner")) withOptions.owner = true
    }

    // Query activities with count
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [activityList, countResult] = await Promise.all([
      db.query.activities.findMany({
        where: and(...conditions),
        orderBy: [asc(sql`${activities.dueDate} IS NULL`), asc(activities.dueDate), desc(activities.createdAt)],
        offset,
        limit,
        with: withOptions,
      }) as Promise<any[]>,
      db.select({ count: sql<number>`count(*)` })
        .from(activities)
        .where(and(...conditions))
        .then(rows => rows[0]?.count ?? 0),
    ])

    // Serialize with expand
    const data = activityList.map(activity => {
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
          ...serializeDeal(activity.deal as Parameters<typeof serializeDeal>[0]),
          ...(activity.deal.organization && { organization: serializeOrganization(activity.deal.organization as Parameters<typeof serializeOrganization>[0]) }),
          ...(activity.deal.person && { person: serializePerson(activity.deal.person as Parameters<typeof serializePerson>[0]) }),
        }
      }
      
      if (expand.has("owner") && activity.owner) {
        serialized.owner = {
          id: activity.owner.id,
          name: activity.owner.name,
          email: activity.owner.email,
        }
      }
      
      return serialized
    })

    return paginatedResponse(data, Number(countResult), offset, limit)
  })
}

// POST /api/v1/activities - Create a new activity
export async function POST(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return Problems.validation([{ field: "body", code: "invalid_json", message: "Invalid JSON body" }])
    }

    const parsed = createActivitySchema.safeParse(body)
    if (!parsed.success) {
      return Problems.validation(
        parsed.error.issues.map(issue => ({
          field: issue.path.join(".") || "body",
          code: issue.code,
          message: issue.message,
        }))
      )
    }

    const { title, type_id, deal_id, owner_id, due_at, notes } = parsed.data

    // Verify type exists
    const activityType = await db.query.activityTypes.findFirst({
      where: eq(activityTypes.id, type_id),
    })
    if (!activityType) {
      return Problems.validation([{ field: "type_id", code: "not_found", message: "Activity type not found" }])
    }

    // If deal_id provided, verify deal exists
    if (deal_id) {
      const deal = await db.query.deals.findFirst({
        where: and(eq(deals.id, deal_id), isNull(deals.deletedAt)),
      })
      if (!deal) {
        return Problems.validation([{ field: "deal_id", code: "not_found", message: "Deal not found" }])
      }
    }

    // Determine owner - use provided owner_id or authenticated user
    const activityOwnerId = owner_id || ctx.userId

    // If owner_id provided, verify owner exists
    if (owner_id) {
      const owner = await db.query.users.findFirst({
        where: eq(users.id, owner_id),
      })
      if (!owner) {
        return Problems.validation([{ field: "owner_id", code: "not_found", message: "Owner not found" }])
      }
    }

    const now = new Date()
    const [activity] = await db.insert(activities).values({
      title,
      typeId: type_id,
      dealId: deal_id || null,
      ownerId: activityOwnerId,
      dueDate: due_at ? new Date(due_at) : now,
      notes: notes || null,
      customFields: {},
      createdAt: now,
      updatedAt: now,
    }).returning()

    // Trigger webhook
    triggerWebhook(ctx.userId, "activity.created", "activity", activity.id, "created", serializeActivity(activity))

    return createdResponse(serializeActivity(activity))
  })
}
