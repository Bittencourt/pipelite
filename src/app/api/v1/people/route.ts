import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parsePagination } from "@/lib/api/pagination"
import { parseExpand } from "@/lib/api/expand"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializePerson } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { people } from "@/db/schema/people"
import { organizations } from "@/db/schema/organizations"
import { and, eq, isNull, count } from "drizzle-orm"
import { z } from "zod"

const createPersonSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email").optional(),
  phone: z.string().max(50).optional(),
  notes: z.string().optional(),
  organization_id: z.string().optional(),
})

export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { offset, limit } = parsePagination(req)
    const expand = parseExpand(req)

    // Build query with ownership filter
    const whereClause = and(
      eq(people.ownerId, context.userId),
      isNull(people.deletedAt)
    )

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(people)
      .where(whereClause)

    // Determine which relations to expand
    const expandOwner = expand.has("owner")
    const expandOrganization = expand.has("organization")

    // Get paginated results with optional expand
    const results = await db.query.people.findMany({
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
      },
      orderBy: (p, { desc }) => [desc(p.createdAt)],
    })

    // Serialize results
    const data = results.map((person) => {
      const serialized = serializePerson(person)
      const expanded: Record<string, unknown> = {}
      if (expandOwner && "owner" in person && person.owner) {
        expanded.owner = person.owner
      }
      if (expandOrganization && "organization" in person && person.organization) {
        expanded.organization = person.organization
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
    const parseResult = createPersonSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        code: issue.code,
        message: issue.message,
      }))
      return Problems.validation(errors)
    }

    const { first_name, last_name, email, phone, notes, organization_id } = parseResult.data

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

    // Insert person
    const [person] = await db
      .insert(people)
      .values({
        firstName: first_name,
        lastName: last_name,
        email,
        phone,
        notes,
        organizationId: organization_id || null,
        ownerId: context.userId,
      })
      .returning()

    // Trigger webhook
    triggerWebhook(
      context.userId,
      "person.created",
      "person",
      person.id,
      "created",
      serializePerson(person)
    )

    return createdResponse(serializePerson(person))
  })
}
