import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { serializeCustomFieldDefinition } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { customFieldDefinitions } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { z } from "zod"

const updateCustomFieldDefinitionSchema = z.object({
  name: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).nullable().optional(),
  required: z.boolean().optional(),
  show_in_list: z.boolean().optional(),
  position: z.number().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/v1/custom-field-definitions/:id - Get a single field definition
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params

    const field = await db.query.customFieldDefinitions.findFirst({
      where: eq(customFieldDefinitions.id, id),
    })

    if (!field) {
      return Problems.notFound("Custom field definition")
    }

    return singleResponse(serializeCustomFieldDefinition(field))
  })
}

// PUT /api/v1/custom-field-definitions/:id - Update a field definition
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params

    // Fetch existing field
    const existingField = await db.query.customFieldDefinitions.findFirst({
      where: eq(customFieldDefinitions.id, id),
    })

    if (!existingField) {
      return Problems.notFound("Custom field definition")
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return Problems.validation([{ field: "body", code: "invalid_json", message: "Invalid JSON body" }])
    }

    const parsed = updateCustomFieldDefinitionSchema.safeParse(body)
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

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: now,
    }

    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.config !== undefined) updateData.config = updates.config
    if (updates.required !== undefined) updateData.required = updates.required
    if (updates.show_in_list !== undefined) updateData.showInList = updates.show_in_list
    if (updates.position !== undefined) updateData.position = updates.position.toString()

    const [updatedField] = await db.update(customFieldDefinitions)
      .set(updateData)
      .where(eq(customFieldDefinitions.id, id))
      .returning()

    // Trigger webhook
    triggerWebhook(ctx.userId, "custom_field_definition.updated", "custom_field_definition", updatedField.id, "updated", serializeCustomFieldDefinition(updatedField))

    return singleResponse(serializeCustomFieldDefinition(updatedField))
  })
}

// DELETE /api/v1/custom-field-definitions/:id - Soft delete a field definition
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { id } = await params

    // Fetch existing field
    const existingField = await db.query.customFieldDefinitions.findFirst({
      where: and(eq(customFieldDefinitions.id, id), isNull(customFieldDefinitions.deletedAt)),
    })

    if (!existingField) {
      return Problems.notFound("Custom field definition")
    }

    // Soft delete
    await db.update(customFieldDefinitions)
      .set({ deletedAt: new Date() })
      .where(eq(customFieldDefinitions.id, id))

    // Trigger webhook
    triggerWebhook(ctx.userId, "custom_field_definition.deleted", "custom_field_definition", id, "deleted", { id })

    return noContentResponse()
  })
}
