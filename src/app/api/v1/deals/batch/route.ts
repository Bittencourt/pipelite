import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { Problems } from "@/lib/api/errors"
import { serializeDeal } from "@/lib/api/serialize"
import { triggerWebhook } from "@/lib/api/webhooks/deliver"
import { db } from "@/db"
import { deals } from "@/db/schema/deals"
import { organizations } from "@/db/schema/organizations"
import { people } from "@/db/schema/people"
import { stages, pipelines } from "@/db/schema/pipelines"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"

const MAX_BATCH_SIZE = 100

const dealItemSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  value: z.number().min(0).optional(),
  stage_id: z.string().min(1, "Stage ID is required"),
  organization_id: z.string().optional(),
  person_id: z.string().optional(),
  expected_close_date: z.string().datetime().optional(),
  notes: z.string().optional(),
})

const batchCreateSchema = z
  .array(dealItemSchema)
  .min(1, "At least one deal is required")
  .max(MAX_BATCH_SIZE, `Maximum ${MAX_BATCH_SIZE} deals per batch`)

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

    // Collect valid stage IDs and verify they belong to user
    const stageIds = new Set<string>()
    for (const item of items) {
      stageIds.add(item.stage_id)
    }

    // Get all stages with their pipelines
    const validStages = await db.query.stages.findMany({
      with: {
        pipeline: {
          columns: { id: true, ownerId: true },
        },
      },
    })

    // Filter to stages whose pipelines belong to user
    const validStageIds = new Set<string>()
    for (const stage of validStages) {
      if (stage.pipeline.ownerId === context.userId) {
        validStageIds.add(stage.id)
      }
    }

    // Collect valid organization and person IDs
    const orgIds = new Set<string>()
    const personIds = new Set<string>()
    for (const item of items) {
      if (item.organization_id) orgIds.add(item.organization_id)
      if (item.person_id) personIds.add(item.person_id)
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

    // Verify all person IDs exist and belong to user
    const validPersonIds = new Set<string>()
    if (personIds.size > 0) {
      const persons = await db.query.people.findMany({
        where: and(
          eq(people.ownerId, context.userId),
          isNull(people.deletedAt)
        ),
        columns: { id: true },
      })
      for (const person of persons) {
        validPersonIds.add(person.id)
      }
    }

    // Build insert values, skipping invalid stage references
    const insertValues: Array<{
      title: string
      value: string | null
      stageId: string
      organizationId: string | null
      personId: string | null
      ownerId: string
      position: string
      expectedCloseDate: Date | null
      notes: string | null
    }> = []

    let position = 10000
    for (const item of items) {
      // Skip if stage is invalid
      if (!validStageIds.has(item.stage_id)) {
        continue
      }

      insertValues.push({
        title: item.title,
        value: item.value !== undefined ? String(item.value) : null,
        stageId: item.stage_id,
        organizationId: item.organization_id && validOrgIds.has(item.organization_id)
          ? item.organization_id
          : null,
        personId: item.person_id && validPersonIds.has(item.person_id)
          ? item.person_id
          : null,
        ownerId: context.userId,
        position: String(position),
        expectedCloseDate: item.expected_close_date ? new Date(item.expected_close_date) : null,
        notes: item.notes || null,
      })

      position += 10000
    }

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

    // Insert all deals
    const inserted = await db.insert(deals).values(insertValues).returning()

    // Trigger webhooks for each created deal
    for (const deal of inserted) {
      triggerWebhook(
        context.userId,
        "deal.created",
        "deal",
        deal.id,
        "created",
        serializeDeal(deal)
      )
    }

    // Return response with created items and meta
    return NextResponse.json({
      data: inserted.map(serializeDeal),
      meta: {
        created: inserted.length,
        skipped: items.length - insertValues.length,
        total: items.length,
      },
    })
  })
}
