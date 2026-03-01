import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { serializeOrganization } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { organizations } from "@/db/schema/organizations"
import { z } from "zod"

const MAX_BATCH_SIZE = 100

const organizationItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  website: z.string().url("Invalid website URL").optional(),
  industry: z.string().max(100).optional(),
  notes: z.string().optional(),
})

const batchCreateSchema = z
  .array(organizationItemSchema)
  .min(1, "At least one organization is required")
  .max(MAX_BATCH_SIZE, `Maximum ${MAX_BATCH_SIZE} organizations per batch`)

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

    // Validate as array
    if (!Array.isArray(body)) {
      return Problems.validation([
        { field: "body", code: "invalid_type", message: "Body must be an array" },
      ])
    }

    // Validate input
    const parseResult = batchCreateSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        code: issue.code,
        message: issue.message,
      }))
      return Problems.validation(errors)
    }

    const items = parseResult.data

    // Insert all organizations
    const inserted = await db
      .insert(organizations)
      .values(
        items.map((item) => ({
          ...item,
          ownerId: context.userId,
        }))
      )
      .returning()

    // Trigger webhooks for each created organization
    for (const org of inserted) {
      triggerWebhook(
        context.userId,
        "organization.created",
        "organization",
        org.id,
        "created",
        serializeOrganization(org)
      )
    }

    // Return response with created items and meta
    return NextResponse.json({
      data: inserted.map(serializeOrganization),
      meta: {
        created: inserted.length,
        total: inserted.length,
      },
    })
  })
}
