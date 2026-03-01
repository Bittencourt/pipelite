import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { parsePagination } from "@/lib/api/pagination"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { serializeCustomFieldDefinition } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { customFieldDefinitions } from "@/db/schema"
import { eq, and, isNull, desc, sql, asc } from "drizzle-orm"
import { z } from "zod"
import type { EntityType } from "@/db/schema/custom-fields"

const createCustomFieldDefinitionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  entity_type: z.enum(["organization", "person", "deal", "activity"] as const),
  type: z.enum(["text", "number", "date", "boolean", "single_select", "multi_select", "file", "url", "lookup", "formula"] as const),
  config: z.record(z.string(), z.unknown()).optional().nullable(),
  required: z.boolean().optional(),
  show_in_list: z.boolean().optional(),
})

// GET /api/v1/custom-field-definitions - List field definitions with pagination and filters
export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    const { offset, limit } = parsePagination(req)
    const searchParams = req.nextUrl.searchParams

    // Filter by entity_type
    const entityType = searchParams.get("entity_type") as EntityType | null

    // Validate entity_type if provided
    if (entityType && !["organization", "person", "deal", "activity"].includes(entityType)) {
      return Problems.validation([{ field: "entity_type", code: "invalid", message: "Invalid entity type. Must be one of: organization, person, deal, activity" }])
    }

    // Build where conditions - include deleted fields for API completeness
    const conditions = entityType ? [eq(customFieldDefinitions.entityType, entityType)] : []

    // Query field definitions with count
    const [fieldList, countResult] = await Promise.all([
      db.query.customFieldDefinitions.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: [asc(customFieldDefinitions.position), desc(customFieldDefinitions.createdAt)],
        offset,
        limit,
      }),
      db.select({ count: sql<number>`count(*)` })
        .from(customFieldDefinitions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .then(rows => rows[0]?.count ?? 0),
    ])

    // Serialize
    const data = fieldList.map(serializeCustomFieldDefinition)

    return paginatedResponse(data, Number(countResult), offset, limit)
  })
}

// POST /api/v1/custom-field-definitions - Create a new field definition
export async function POST(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return Problems.validation([{ field: "body", code: "invalid_json", message: "Invalid JSON body" }])
    }

    const parsed = createCustomFieldDefinitionSchema.safeParse(body)
    if (!parsed.success) {
      return Problems.validation(
        parsed.error.issues.map(issue => ({
          field: issue.path.join(".") || "body",
          code: issue.code,
          message: issue.message,
        }))
      )
    }

    const { name, entity_type, type, config, required, show_in_list } = parsed.data

    // Get max position for ordering
    const existingFields = await db.query.customFieldDefinitions.findMany({
      where: eq(customFieldDefinitions.entityType, entity_type),
    })
    const maxPosition = existingFields.length > 0
      ? Math.max(...existingFields.map(f => parseFloat(f.position || "0"))) + 10000
      : 10000

    const now = new Date()
    const [field] = await db.insert(customFieldDefinitions).values({
      name,
      entityType: entity_type,
      type,
      config: config || null,
      required: required || false,
      showInList: show_in_list || false,
      position: maxPosition.toString(),
      createdAt: now,
      updatedAt: now,
    }).returning()

    // Trigger webhook
    triggerWebhook(ctx.userId, "custom_field_definition.created", "custom_field_definition", field.id, "created", serializeCustomFieldDefinition(field))

    return createdResponse(serializeCustomFieldDefinition(field))
  })
}
