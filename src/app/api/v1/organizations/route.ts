import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parsePagination } from "@/lib/api/pagination"
import { parseExpand } from "@/lib/api/expand"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeOrganization } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { organizations } from "@/db/schema/organizations"
import { and, eq, isNull, count, sql } from "drizzle-orm"
import { z } from "zod"

const createOrganizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  website: z.string().url("Invalid website URL").optional(),
  industry: z.string().max(100).optional(),
  notes: z.string().optional(),
})

export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { offset, limit } = parsePagination(req)
    const expand = parseExpand(req)

    // Build query with ownership filter
    const whereClause = and(
      eq(organizations.ownerId, context.userId),
      isNull(organizations.deletedAt)
    )

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(organizations)
      .where(whereClause)

    // Get paginated results with optional expand
    const results = await db.query.organizations.findMany({
      where: whereClause,
      offset,
      limit,
      with: expand.has("owner")
        ? {
            owner: {
              columns: {
                id: true,
                name: true,
                email: true,
              },
            },
          }
        : undefined,
      orderBy: (orgs, { desc }) => [desc(orgs.createdAt)],
    })

    // Serialize results
    const data = results.map((org) => {
      const serialized = serializeOrganization(org)
      if (expand.has("owner") && "owner" in org && org.owner) {
        return { ...serialized, owner: org.owner }
      }
      return serialized
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
    const parseResult = createOrganizationSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        code: issue.code,
        message: issue.message,
      }))
      return Problems.validation(errors)
    }

    const { name, website, industry, notes } = parseResult.data

    // Insert organization
    const [org] = await db
      .insert(organizations)
      .values({
        name,
        website,
        industry,
        notes,
        ownerId: context.userId,
      })
      .returning()

    // Trigger webhook
    triggerWebhook(
      context.userId,
      "organization.created",
      "organization",
      org.id,
      "created",
      serializeOrganization(org)
    )

    return createdResponse(serializeOrganization(org))
  })
}
