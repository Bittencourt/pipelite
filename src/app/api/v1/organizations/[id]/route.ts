import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parseExpand } from "@/lib/api/expand"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeOrganization } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { organizations } from "@/db/schema/organizations"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"

const updateOrganizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less").optional(),
  website: z.string().url("Invalid website URL").nullable().optional(),
  industry: z.string().max(100).nullable().optional(),
  notes: z.string().nullable().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params
    const expand = parseExpand(req)

    // Query organization with ownership check
    const org = await db.query.organizations.findFirst({
      where: and(
        eq(organizations.id, id),
        eq(organizations.ownerId, context.userId),
        isNull(organizations.deletedAt)
      ),
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
    })

    if (!org) {
      return Problems.notFound("Organization")
    }

    const serialized = serializeOrganization(org)
    const data = "owner" in org && org.owner
      ? { ...serialized, owner: org.owner }
      : serialized

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
    const parseResult = updateOrganizationSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        code: issue.code,
        message: issue.message,
      }))
      return Problems.validation(errors)
    }

    // Check organization exists and belongs to user
    const existing = await db.query.organizations.findFirst({
      where: and(
        eq(organizations.id, id),
        eq(organizations.ownerId, context.userId),
        isNull(organizations.deletedAt)
      ),
    })

    if (!existing) {
      return Problems.notFound("Organization")
    }

    // Build update object - only include defined fields
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    const { name, website, industry, notes } = parseResult.data
    if (name !== undefined) updates.name = name
    if (website !== undefined) updates.website = website
    if (industry !== undefined) updates.industry = industry
    if (notes !== undefined) updates.notes = notes

    // Update organization
    const [updated] = await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, id))
      .returning()

    // Trigger webhook
    triggerWebhook(
      context.userId,
      "organization.updated",
      "organization",
      updated.id,
      "updated",
      serializeOrganization(updated)
    )

    return singleResponse(serializeOrganization(updated))
  })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params

    // Check organization exists and belongs to user
    const existing = await db.query.organizations.findFirst({
      where: and(
        eq(organizations.id, id),
        eq(organizations.ownerId, context.userId),
        isNull(organizations.deletedAt)
      ),
    })

    if (!existing) {
      return Problems.notFound("Organization")
    }

    // Soft delete
    await db
      .update(organizations)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, id))

    // Trigger webhook
    triggerWebhook(
      context.userId,
      "organization.deleted",
      "organization",
      id,
      "deleted",
      { id }
    )

    return noContentResponse()
  })
}
