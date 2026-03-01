import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parseExpand } from "@/lib/api/expand"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializePerson } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { people } from "@/db/schema/people"
import { organizations } from "@/db/schema/organizations"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"

const updatePersonSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100).optional(),
  last_name: z.string().min(1, "Last name is required").max(100).optional(),
  email: z.string().email("Invalid email").nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  notes: z.string().nullable().optional(),
  organization_id: z.string().nullable().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params
    const expand = parseExpand(req)

    // Query person with ownership check
    const person = await db.query.people.findFirst({
      where: and(
        eq(people.id, id),
        eq(people.ownerId, context.userId),
        isNull(people.deletedAt)
      ),
      with: {
        ...(expand.has("owner") && {
          owner: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
        }),
        ...(expand.has("organization") && {
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
    })

    if (!person) {
      return Problems.notFound("Person")
    }

    const serialized = serializePerson(person)
    const expanded: Record<string, unknown> = {}
    if (expand.has("owner") && "owner" in person && person.owner) {
      expanded.owner = person.owner
    }
    if (expand.has("organization") && "organization" in person && person.organization) {
      expanded.organization = person.organization
    }

    const data = Object.keys(expanded).length > 0 ? { ...serialized, ...expanded } : serialized

    return singleResponse(data)
  })
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params

    let body
    try {
      body = await req.json()
    } catch {
      return Problems.validation([
        { field: "body", code: "invalid_json", message: "Invalid JSON body" },
      ])
    }

    // Validate input
    const parseResult = updatePersonSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        code: issue.code,
        message: issue.message,
      }))
      return Problems.validation(errors)
    }

    // Check person exists and belongs to user
    const existing = await db.query.people.findFirst({
      where: and(
        eq(people.id, id),
        eq(people.ownerId, context.userId),
        isNull(people.deletedAt)
      ),
    })

    if (!existing) {
      return Problems.notFound("Person")
    }

    const { first_name, last_name, email, phone, notes, organization_id } = parseResult.data

    // Verify organization exists and belongs to user if provided
    if (organization_id !== undefined && organization_id !== null) {
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

    // Build update object
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (first_name !== undefined) updates.firstName = first_name
    if (last_name !== undefined) updates.lastName = last_name
    if (email !== undefined) updates.email = email
    if (phone !== undefined) updates.phone = phone
    if (notes !== undefined) updates.notes = notes
    if (organization_id !== undefined) updates.organizationId = organization_id

    // Update person
    const [updated] = await db
      .update(people)
      .set(updates)
      .where(eq(people.id, id))
      .returning()

    // Trigger webhook
    triggerWebhook(
      context.userId,
      "person.updated",
      "person",
      updated.id,
      "updated",
      serializePerson(updated)
    )

    return singleResponse(serializePerson(updated))
  })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params

    // Check person exists and belongs to user
    const existing = await db.query.people.findFirst({
      where: and(
        eq(people.id, id),
        eq(people.ownerId, context.userId),
        isNull(people.deletedAt)
      ),
    })

    if (!existing) {
      return Problems.notFound("Person")
    }

    // Soft delete
    await db
      .update(people)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(people.id, id))

    // Trigger webhook
    triggerWebhook(
      context.userId,
      "person.deleted",
      "person",
      id,
      "deleted",
      { id }
    )

    return noContentResponse()
  })
}
