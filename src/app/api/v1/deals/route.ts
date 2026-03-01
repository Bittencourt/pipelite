import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parsePagination } from "@/lib/api/pagination"
import { parseExpand } from "@/lib/api/expand"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeDeal } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { deals } from "@/db/schema/deals"
import { organizations } from "@/db/schema/organizations"
import { people } from "@/db/schema/people"
import { stages, pipelines } from "@/db/schema/pipelines"
import { and, eq, isNull, count, max, sql } from "drizzle-orm"
import { z } from "zod"

const createDealSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  value: z.number().min(0).optional(),
  stage_id: z.string().min(1, "Stage ID is required"),
  organization_id: z.string().optional(),
  person_id: z.string().optional(),
  expected_close_date: z.string().datetime().optional(),
  notes: z.string().optional(),
})

export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { offset, limit } = parsePagination(req)
    const expand = parseExpand(req)
    const { searchParams } = req.nextUrl

    // Parse filter params
    const stageId = searchParams.get("stage_id")
    const organizationId = searchParams.get("organization_id")
    const ownerId = searchParams.get("owner_id")

    // Build where conditions
    const conditions = [
      eq(deals.ownerId, context.userId),
      isNull(deals.deletedAt),
    ]

    if (stageId) {
      conditions.push(eq(deals.stageId, stageId))
    }
    if (organizationId) {
      conditions.push(eq(deals.organizationId, organizationId))
    }
    if (ownerId) {
      conditions.push(eq(deals.ownerId, ownerId))
    }

    const whereClause = and(...conditions)

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(deals)
      .where(whereClause)

    // Determine which relations to expand
    const expandOwner = expand.has("owner")
    const expandOrganization = expand.has("organization")
    const expandPerson = expand.has("person")
    const expandStage = expand.has("stage")

    // Get paginated results with optional expand
    const results = await db.query.deals.findMany({
      where: whereClause,
      offset,
      limit,
      with: {
        ...(expandOwner && {
          owner: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
        }),
        ...(expandOrganization && {
          organization: {
            columns: {
              id: true,
              name: true,
              website: true,
              industry: true,
            },
          },
        }),
        ...(expandPerson && {
          person: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        }),
        ...(expandStage && {
          stage: {
            columns: {
              id: true,
              name: true,
              color: true,
              type: true,
              position: true,
            },
          },
        }),
      },
      orderBy: (d, { asc }) => [asc(d.position)],
    })

    // Serialize results
    const data = results.map((deal) => {
      const serialized = serializeDeal(deal)
      const expanded: Record<string, unknown> = {}
      if (expandOwner && "owner" in deal && deal.owner) {
        expanded.owner = deal.owner
      }
      if (expandOrganization && "organization" in deal && deal.organization) {
        expanded.organization = deal.organization
      }
      if (expandPerson && "person" in deal && deal.person) {
        expanded.person = deal.person
      }
      if (expandStage && "stage" in deal && deal.stage) {
        expanded.stage = deal.stage
      }
      return Object.keys(expanded).length > 0 ? { ...serialized, ...expanded } : serialized
    })

    return paginatedResponse(data, total, offset, limit)
  })
}

export async function POST(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    let body
    try {
      body = await req.json()
    } catch {
      return Problems.validation([
        { field: "body", code: "invalid_json", message: "Invalid JSON body" },
      ])
    }

    // Validate input
    const parseResult = createDealSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        code: issue.code,
        message: issue.message,
      }))
      return Problems.validation(errors)
    }

    const { title, value, stage_id, organization_id, person_id, expected_close_date, notes } = parseResult.data

    // Verify stage exists and pipeline belongs to user
    const stage = await db.query.stages.findFirst({
      where: eq(stages.id, stage_id),
      with: {
        pipeline: {
          columns: { id: true, ownerId: true },
        },
      },
    })

    if (!stage || stage.pipeline.ownerId !== context.userId) {
      return Problems.validation([
        { field: "stage_id", code: "invalid_reference", message: "Stage not found or does not belong to user" },
      ])
    }

    // Verify organization exists and belongs to user if provided
    if (organization_id) {
      const org = await db.query.organizations.findFirst({
        where: and(
          eq(organizations.id, organization_id),
          eq(organizations.ownerId, context.userId),
          isNull(organizations.deletedAt)
        ),
      })

      if (!org) {
        return Problems.validation([
          { field: "organization_id", code: "invalid_reference", message: "Organization not found" },
        ])
      }
    }

    // Verify person exists and belongs to user if provided
    if (person_id) {
      const person = await db.query.people.findFirst({
        where: and(
          eq(people.id, person_id),
          eq(people.ownerId, context.userId),
          isNull(people.deletedAt)
        ),
      })

      if (!person) {
        return Problems.validation([
          { field: "person_id", code: "invalid_reference", message: "Person not found" },
        ])
      }
    }

    // Get max position for auto-positioning
    const [maxResult] = await db
      .select({ maxPosition: max(deals.position) })
      .from(deals)
      .where(and(eq(deals.stageId, stage_id), isNull(deals.deletedAt)))

    const nextPosition = maxResult.maxPosition
      ? parseFloat(maxResult.maxPosition) + 10000
      : 10000

    // Insert deal
    const [deal] = await db
      .insert(deals)
      .values({
        title,
        value: value ? String(value) : null,
        stageId: stage_id,
        organizationId: organization_id || null,
        personId: person_id || null,
        ownerId: context.userId,
        position: String(nextPosition),
        expectedCloseDate: expected_close_date ? new Date(expected_close_date) : null,
        notes,
      })
      .returning()

    // Trigger webhook
    triggerWebhook(
      context.userId,
      "deal.created",
      "deal",
      deal.id,
      "created",
      serializeDeal(deal)
    )

    return createdResponse(serializeDeal(deal))
  })
}
