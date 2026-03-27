import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parseExpand } from "@/lib/api/expand"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeDeal } from "@/lib/api/serialize"
import { db } from "@/db"
import { deals } from "@/db/schema/deals"
import { organizations } from "@/db/schema/organizations"
import { people } from "@/db/schema/people"
import { stages, pipelines } from "@/db/schema/pipelines"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { crmBus } from "@/lib/events"
import type { DealStageChangedPayload } from "@/lib/events"

const updateDealSchema = z.object({
  title: z.string().min(1, "Title is required").max(200).optional(),
  value: z.number().min(0).nullable().optional(),
  stage_id: z.string().min(1, "Stage ID is required").optional(),
  organization_id: z.string().nullable().optional(),
  person_id: z.string().nullable().optional(),
  expected_close_date: z.string().datetime().nullable().optional(),
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

    // Query deal with ownership check
    const deal = await db.query.deals.findFirst({
      where: and(
        eq(deals.id, id),
        eq(deals.ownerId, context.userId),
        isNull(deals.deletedAt)
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
        ...(expand.has("person") && {
          person: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        }),
        ...(expand.has("stage") && {
          stage: {
            columns: {
              id: true,
              name: true,
              color: true,
              type: true,
              position: true,
            },
          },
        }),
      },
    })

    if (!deal) {
      return Problems.notFound("Deal")
    }

    const serialized = serializeDeal(deal)
    const expanded: Record<string, unknown> = {}
    if (expand.has("owner") && "owner" in deal && deal.owner) {
      expanded.owner = deal.owner
    }
    if (expand.has("organization") && "organization" in deal && deal.organization) {
      expanded.organization = deal.organization
    }
    if (expand.has("person") && "person" in deal && deal.person) {
      expanded.person = deal.person
    }
    if (expand.has("stage") && "stage" in deal && deal.stage) {
      expanded.stage = deal.stage
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
    const parseResult = updateDealSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        code: issue.code,
        message: issue.message,
      }))
      return Problems.validation(errors)
    }

    // Check deal exists and belongs to user
    const existing = await db.query.deals.findFirst({
      where: and(
        eq(deals.id, id),
        eq(deals.ownerId, context.userId),
        isNull(deals.deletedAt)
      ),
    })

    if (!existing) {
      return Problems.notFound("Deal")
    }

    const { title, value, stage_id, organization_id, person_id, expected_close_date, notes, custom_fields } = parseResult.data
    const oldStageId = existing.stageId

    // Verify stage exists and pipeline belongs to user if changing
    if (stage_id !== undefined && stage_id !== oldStageId) {
      const stage = await db.query.stages.findFirst({
        where: eq(stages.id, stage_id),
        with: {
          pipeline: {
            columns: { id: true, ownerId: true },
          },
        },
      })

      if (!stage || stage.pipeline.ownerId !== context.userId) {
        return Problems.validation([
          { field: "stage_id", code: "invalid_reference", message: "Stage not found or does not belong to user" },
        ])
      }
    }

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

    // Verify person exists and belongs to user if provided
    if (person_id !== undefined && person_id !== null) {
      const person = await db.query.people.findFirst({
        where: and(
          eq(people.id, person_id),
          eq(people.ownerId, context.userId),
          isNull(people.deletedAt)
        ),
      })

      if (!person) {
        return Problems.validation([
          { field: "person_id", code: "invalid_reference", message: "Person not found" },
        ])
      }
    }

    // Build update object and track changed fields
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    const changedFields: string[] = []

    if (title !== undefined) {
      updates.title = title
      if (title !== existing.title) changedFields.push("title")
    }
    if (value !== undefined) {
      updates.value = value !== null ? String(value) : null
      if (String(value) !== existing.value) changedFields.push("value")
    }
    if (stage_id !== undefined) {
      updates.stageId = stage_id
      if (stage_id !== existing.stageId) changedFields.push("stageId")
    }
    if (organization_id !== undefined) {
      updates.organizationId = organization_id
      if (organization_id !== existing.organizationId) changedFields.push("organizationId")
    }
    if (person_id !== undefined) {
      updates.personId = person_id
      if (person_id !== existing.personId) changedFields.push("personId")
    }
    if (expected_close_date !== undefined) {
      updates.expectedCloseDate = expected_close_date ? new Date(expected_close_date) : null
      changedFields.push("expectedCloseDate")
    }
    if (notes !== undefined) {
      updates.notes = notes
      if (notes !== existing.notes) changedFields.push("notes")
    }
    if (custom_fields !== undefined) {
      // Merge with existing custom fields
      updates.customFields = {
        ...((existing.customFields as Record<string, unknown>) || {}),
        ...custom_fields,
      }
      changedFields.push("customFields")
    }

    // Update deal
    const [updated] = await db
      .update(deals)
      .set(updates)
      .where(eq(deals.id, id))
      .returning()

    const serializedDeal = serializeDeal(updated)

    // Emit stage_changed event if stage changed
    if (stage_id !== undefined && stage_id !== oldStageId) {
      const stageChangedPayload: DealStageChangedPayload = {
        entity: "deal",
        entityId: updated.id,
        action: "updated",
        data: serializedDeal as unknown as Record<string, unknown>,
        changedFields,
        userId: context.userId,
        timestamp: new Date().toISOString(),
        oldStageId,
        newStageId: stage_id,
      }
      crmBus.emit("deal.stage_changed", stageChangedPayload)
    }

    // Emit general update event
    crmBus.emit("deal.updated", {
      entity: "deal",
      entityId: updated.id,
      action: "updated",
      data: serializedDeal as unknown as Record<string, unknown>,
      changedFields: changedFields.length > 0 ? changedFields : null,
      userId: context.userId,
      timestamp: new Date().toISOString(),
    })

    return singleResponse(serializedDeal)
  })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params

    // Check deal exists and belongs to user
    const existing = await db.query.deals.findFirst({
      where: and(
        eq(deals.id, id),
        eq(deals.ownerId, context.userId),
        isNull(deals.deletedAt)
      ),
    })

    if (!existing) {
      return Problems.notFound("Deal")
    }

    // Soft delete
    await db
      .update(deals)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deals.id, id))

    // Emit CRM event via bus
    crmBus.emit("deal.deleted", {
      entity: "deal",
      entityId: id,
      action: "deleted",
      data: { id },
      changedFields: null,
      userId: context.userId,
      timestamp: new Date().toISOString(),
    })

    return noContentResponse()
  })
}
