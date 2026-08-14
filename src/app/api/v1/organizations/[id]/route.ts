import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parseExpand } from "@/lib/api/expand"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeOrganization } from "@/lib/api/serialize"
import { updateOrganizationMutation, deleteOrganizationMutation } from "@/lib/mutations/organizations"
import { db } from "@/db"
import { organizations } from "@/db/schema/organizations"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"

const updateOrganizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less").optional(),
  website: z.string().url("Invalid website URL").nullable().optional(),
  industry: z.string().max(100).nullable().optional(),
  notes: z.string().nullable().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
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

    // Build update object - field mapping only. `custom_fields` is routed THROUGH the mutation,
    // which owns the shallow merge (plan 34-02), the formula-key strip and the recalculation
    // (plan 34-07). The route used to perform its own second `db.update` here; that write landed
    // after the mutation's recalculation and would have overwritten freshly computed formula
    // wrappers with the caller's raw blob — a client-controlled overwrite of server-derived data
    // (threat T-34-19). One write, one place.
    const { name, website, industry, notes, custom_fields } = parseResult.data
    const mutationData: Record<string, unknown> = {}
    if (name !== undefined) mutationData.name = name
    if (website !== undefined) mutationData.website = website
    if (industry !== undefined) mutationData.industry = industry
    if (notes !== undefined) mutationData.notes = notes
    if (custom_fields !== undefined) mutationData.customFields = custom_fields

    // Use mutation for update + event emission
    const result = await updateOrganizationMutation(id, mutationData, context.userId)

    if (!result.success) {
      return Problems.validation([{ field: "body", code: "mutation_error", message: result.error }])
    }

    // Re-fetch updated org for response (mutation doesn't return the entity for updates).
    // This read follows the mutation's recalculation write, so it carries the recomputed values.
    const updated = await db.query.organizations.findFirst({
      where: eq(organizations.id, id),
    })

    return singleResponse(serializeOrganization(updated!))
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

    // Use mutation for delete + event emission
    const result = await deleteOrganizationMutation(id, context.userId)

    if (!result.success) {
      return Problems.validation([{ field: "body", code: "mutation_error", message: result.error }])
    }

    return noContentResponse()
  })
}
