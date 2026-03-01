import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { serializePerson } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { people } from "@/db/schema/people"
import { organizations } from "@/db/schema/organizations"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"

const MAX_BATCH_SIZE = 100

const personItemSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email").optional(),
  phone: z.string().max(50).optional(),
  notes: z.string().optional(),
  organization_id: z.string().optional(),
})

const batchCreateSchema = z
  .array(personItemSchema)
  .min(1, "At least one person is required")
  .max(MAX_BATCH_SIZE, `Maximum ${MAX_BATCH_SIZE} people per batch`)

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

    // Collect valid organization IDs
    const orgIds = new Set<string>()
    for (const item of items) {
      if (item.organization_id) {
        orgIds.add(item.organization_id)
      }
    }

    // Verify all organization IDs exist and belong to user
    const validOrgIds = new Set<string>()
    if (orgIds.size > 0) {
      const orgs = await db.query.organizations.findMany({
        where: and(
          eq(organizations.ownerId, context.userId),
          isNull(organizations.deletedAt)
        ),
        columns: { id: true },
      })
      for (const org of orgs) {
        validOrgIds.add(org.id)
      }
    }

    // Build insert values, skipping invalid organization references
    const insertValues = items
      .filter((item) => {
        // Skip if organization_id is provided but invalid
        if (item.organization_id && !validOrgIds.has(item.organization_id)) {
          return false
        }
        return true
      })
      .map((item) => ({
        firstName: item.first_name,
        lastName: item.last_name,
        email: item.email || null,
        phone: item.phone || null,
        notes: item.notes || null,
        organizationId: item.organization_id || null,
        ownerId: context.userId,
      }))

    if (insertValues.length === 0) {
      return NextResponse.json({
        data: [],
        meta: {
          created: 0,
          skipped: items.length,
          total: items.length,
        },
      })
    }

    // Insert all people
    const inserted = await db.insert(people).values(insertValues).returning()

    // Trigger webhooks for each created person
    for (const person of inserted) {
      triggerWebhook(
        context.userId,
        "person.created",
        "person",
        person.id,
        "created",
        serializePerson(person)
      )
    }

    // Return response with created items and meta
    return NextResponse.json({
      data: inserted.map(serializePerson),
      meta: {
        created: inserted.length,
        skipped: items.length - insertValues.length,
        total: items.length,
      },
    })
  })
}
