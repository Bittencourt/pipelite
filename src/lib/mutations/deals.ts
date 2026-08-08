import { db } from "@/db"
import { deals, stages, organizations, people, dealAssignees } from "@/db/schema"
import { eq, and, isNull, desc, sql } from "drizzle-orm"
import { z } from "zod"
import { crmBus } from "@/lib/events"
import type { CrmEventPayload, DealStageChangedPayload } from "@/lib/events"

// ---- Zod Schemas ----

export const dealSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or less"),
  value: z.number().min(0).optional().nullable(),
  stageId: z.string().min(1, "Stage is required"),
  ownerId: z.string().optional(),
  organizationId: z.string().optional().nullable(),
  personId: z.string().optional().nullable(),
  expectedCloseDate: z.date().optional().nullable(),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional().nullable(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  assigneeIds: z.array(z.string()).optional().default([]),
})

export const updateDealSchema = dealSchema.partial()

// ---- Mutation Input Types ----

interface CreateDealInput {
  title: string
  value?: number | null
  stageId: string
  ownerId?: string
  organizationId?: string | null
  personId?: string | null
  expectedCloseDate?: Date | null
  notes?: string | null
  customFields?: Record<string, unknown>
  assigneeIds: string[]
  userId: string
}

// ---- Helpers ----

function buildEventPayload(
  entityId: string,
  action: "created" | "updated" | "deleted",
  data: Record<string, unknown>,
  userId: string,
  changedFields: string[] | null = null
): CrmEventPayload {
  return {
    entity: "deal",
    entityId,
    action,
    data,
    changedFields,
    userId,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Compute IDs of truly new assignees (not re-saved existing ones).
 */
export function computeNewAssigneeIds(
  currentIds: string[],
  updatedIds: string[]
): string[] {
  const currentSet = new Set(currentIds)
  return updatedIds.filter((id) => !currentSet.has(id))
}

// ---- Mutations ----

export async function createDealMutation(
  input: CreateDealInput
): Promise<{ success: true; id: string; deal: typeof deals.$inferSelect } | { success: false; error: string }> {
  // Validate input via Zod
  const validated = dealSchema.safeParse({
    title: input.title,
    value: input.value,
    stageId: input.stageId,
    ownerId: input.ownerId,
    organizationId: input.organizationId,
    personId: input.personId,
    expectedCloseDate: input.expectedCloseDate,
    notes: input.notes,
    customFields: input.customFields,
    assigneeIds: input.assigneeIds,
  })

  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Validate at least one of org/person is set
  if (!validated.data.organizationId && !validated.data.personId) {
    return { success: false, error: "At least one of organization or person is required" }
  }

  try {
    // Validate stage exists and is not deleted
    const stage = await db.query.stages.findFirst({
      where: eq(stages.id, validated.data.stageId),
      with: { pipeline: true },
    })

    if (!stage || stage.pipeline.deletedAt) {
      return { success: false, error: "Stage not found" }
    }

    // Validate organization exists if provided
    if (validated.data.organizationId) {
      const org = await db.query.organizations.findFirst({
        where: and(
          eq(organizations.id, validated.data.organizationId),
          isNull(organizations.deletedAt)
        ),
      })
      if (!org) {
        return { success: false, error: "Organization not found" }
      }
    }

    // Validate person exists if provided
    if (validated.data.personId) {
      const person = await db.query.people.findFirst({
        where: and(
          eq(people.id, validated.data.personId),
          isNull(people.deletedAt)
        ),
      })
      if (!person) {
        return { success: false, error: "Person not found" }
      }
    }

    // Get existing deals in stage to calculate position
    const existingDeals = await db.query.deals.findMany({
      where: and(
        eq(deals.stageId, validated.data.stageId),
        isNull(deals.deletedAt)
      ),
      orderBy: [desc(deals.position)],
    })

    const maxPosition = existingDeals[0]?.position ?? 0
    const position = (parseFloat(String(maxPosition)) + 10000).toString()

    const [deal] = await db.insert(deals).values({
      title: validated.data.title,
      value: validated.data.value !== undefined ? validated.data.value?.toString() : null,
      stageId: validated.data.stageId,
      organizationId: validated.data.organizationId || null,
      personId: validated.data.personId || null,
      ownerId: validated.data.ownerId || input.userId,
      position,
    }).returning()

    const newAssigneeIds = validated.data.assigneeIds ?? []
    if (newAssigneeIds.length > 0) {
      await db.insert(dealAssignees).values(
        newAssigneeIds.map(userId => ({ dealId: deal.id, userId }))
      )
    }

    // Emit CRM event
    crmBus.emit("deal.created", buildEventPayload(
      deal.id,
      "created",
      deal as unknown as Record<string, unknown>,
      input.userId,
    ))

    return { success: true, id: deal.id, deal }
  } catch (error) {
    console.error("Failed to create deal:", error)
    return { success: false, error: "Failed to create deal" }
  }
}

export async function updateDealMutation(
  id: string,
  data: z.infer<typeof updateDealSchema>,
  userId: string,
): Promise<{ success: true; newAssigneeUserIds: string[]; dealTitle: string } | { success: false; error: string }> {
  // Validate input
  const validated = updateDealSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Check if deal exists
  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), isNull(deals.deletedAt)),
  })

  if (!deal) {
    return { success: false, error: "Deal not found" }
  }

  // Validate at least one of org/person is set after update
  const newOrgId = validated.data.organizationId !== undefined
    ? validated.data.organizationId
    : deal.organizationId
  const newPersonId = validated.data.personId !== undefined
    ? validated.data.personId
    : deal.personId

  if (!newOrgId && !newPersonId) {
    return { success: false, error: "At least one of organization or person is required" }
  }

  try {
    // Validate organization exists if changing
    if (validated.data.organizationId) {
      const org = await db.query.organizations.findFirst({
        where: and(
          eq(organizations.id, validated.data.organizationId),
          isNull(organizations.deletedAt)
        ),
      })
      if (!org) {
        return { success: false, error: "Organization not found" }
      }
    }

    // Validate person exists if changing
    if (validated.data.personId) {
      const person = await db.query.people.findFirst({
        where: and(
          eq(people.id, validated.data.personId),
          isNull(people.deletedAt)
        ),
      })
      if (!person) {
        return { success: false, error: "Person not found" }
      }
    }

    // Build update object and track changed fields
    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    const changedFields: string[] = []

    const oldStageId = deal.stageId

    if (validated.data.title !== undefined && validated.data.title !== deal.title) {
      updateData.title = validated.data.title
      changedFields.push("title")
    } else if (validated.data.title !== undefined) {
      updateData.title = validated.data.title
    }

    if (validated.data.value !== undefined) {
      const newVal = validated.data.value?.toString() ?? null
      if (newVal !== deal.value) changedFields.push("value")
      updateData.value = newVal
    }

    if (validated.data.stageId !== undefined) {
      if (validated.data.stageId !== deal.stageId) changedFields.push("stageId")
      updateData.stageId = validated.data.stageId
    }

    if (validated.data.organizationId !== undefined) {
      if ((validated.data.organizationId || null) !== deal.organizationId) changedFields.push("organizationId")
      updateData.organizationId = validated.data.organizationId || null
    }

    if (validated.data.personId !== undefined) {
      if ((validated.data.personId || null) !== deal.personId) changedFields.push("personId")
      updateData.personId = validated.data.personId || null
    }

    if (validated.data.expectedCloseDate !== undefined) {
      updateData.expectedCloseDate = validated.data.expectedCloseDate
      changedFields.push("expectedCloseDate")
    }

    if (validated.data.notes !== undefined) {
      if ((validated.data.notes || null) !== deal.notes) changedFields.push("notes")
      updateData.notes = validated.data.notes || null
    }

    if (validated.data.ownerId !== undefined) {
      if (validated.data.ownerId !== deal.ownerId) changedFields.push("ownerId")
      updateData.ownerId = validated.data.ownerId
    }

    const [updatedDeal] = await db
      .update(deals)
      .set(updateData)
      .where(eq(deals.id, id))
      .returning()

    // Handle assignees
    const currentAssignees = await db
      .select({ userId: dealAssignees.userId })
      .from(dealAssignees)
      .where(eq(dealAssignees.dealId, id))
    const currentAssigneeIds = currentAssignees.map((a) => a.userId)

    await db.delete(dealAssignees).where(eq(dealAssignees.dealId, id))
    const updatedAssigneeIds = validated.data.assigneeIds ?? []
    if (updatedAssigneeIds.length > 0) {
      await db.insert(dealAssignees).values(
        updatedAssigneeIds.map(uid => ({ dealId: id, userId: uid }))
      )
    }

    // Emit deal.updated event
    crmBus.emit("deal.updated", buildEventPayload(
      id,
      "updated",
      updatedDeal as unknown as Record<string, unknown>,
      userId,
      changedFields.length > 0 ? changedFields : null,
    ))

    // Emit deal.stage_changed if stage changed
    if (validated.data.stageId !== undefined && validated.data.stageId !== oldStageId) {
      const stagePayload: DealStageChangedPayload = {
        ...buildEventPayload(
          id,
          "updated",
          updatedDeal as unknown as Record<string, unknown>,
          userId,
          changedFields,
        ),
        entity: "deal",
        oldStageId,
        newStageId: validated.data.stageId,
      }
      crmBus.emit("deal.stage_changed", stagePayload)
    }

    return {
      success: true as const,
      newAssigneeUserIds: computeNewAssigneeIds(currentAssigneeIds, updatedAssigneeIds),
      dealTitle: deal.title,
    }
  } catch (error) {
    console.error("Failed to update deal:", error)
    return { success: false, error: "Failed to update deal" }
  }
}

export async function deleteDealMutation(
  id: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Check if deal exists
  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), isNull(deals.deletedAt)),
  })

  if (!deal) {
    return { success: false, error: "Deal not found" }
  }

  try {
    await db
      .update(deals)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(deals.id, id))

    // Emit CRM event
    crmBus.emit("deal.deleted", buildEventPayload(
      id,
      "deleted",
      { id },
      userId,
    ))

    return { success: true }
  } catch (error) {
    console.error("Failed to delete deal:", error)
    return { success: false, error: "Failed to delete deal" }
  }
}

export async function updateDealStageMutation(
  id: string,
  stageId: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Check if deal exists
  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), isNull(deals.deletedAt)),
  })

  if (!deal) {
    return { success: false, error: "Deal not found" }
  }

  try {
    // Validate new stage exists
    const newStage = await db.query.stages.findFirst({
      where: eq(stages.id, stageId),
      with: { pipeline: true },
    })

    if (!newStage || newStage.pipeline.deletedAt) {
      return { success: false, error: "Stage not found" }
    }

    // Get existing deals in new stage to calculate position
    const existingDeals = await db.query.deals.findMany({
      where: and(eq(deals.stageId, stageId), isNull(deals.deletedAt)),
      orderBy: [desc(deals.position)],
    })

    const maxPosition = existingDeals[0]?.position ?? 0
    const position = (parseFloat(String(maxPosition)) + 10000).toString()
    const oldStageId = deal.stageId

    await db
      .update(deals)
      .set({ stageId, position, updatedAt: new Date() })
      .where(eq(deals.id, id))

    // Emit deal.updated
    crmBus.emit("deal.updated", buildEventPayload(
      id,
      "updated",
      { ...deal, stageId, position } as unknown as Record<string, unknown>,
      userId,
      ["stageId"],
    ))

    // Emit deal.stage_changed
    const stagePayload: DealStageChangedPayload = {
      ...buildEventPayload(
        id,
        "updated",
        { ...deal, stageId, position } as unknown as Record<string, unknown>,
        userId,
        ["stageId"],
      ),
      entity: "deal",
      oldStageId,
      newStageId: stageId,
    }
    crmBus.emit("deal.stage_changed", stagePayload)

    return { success: true }
  } catch (error) {
    console.error("Failed to update deal stage:", error)
    return { success: false, error: "Failed to update deal stage" }
  }
}

export async function reorderDealsMutation(
  dealId: string,
  targetStageId: string,
  targetIndex: number,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    // Get the deal being moved
    const deal = await db.query.deals.findFirst({
      where: and(eq(deals.id, dealId), isNull(deals.deletedAt)),
    })

    if (!deal) {
      return { success: false, error: "Deal not found" }
    }

    // Validate target stage exists
    const targetStage = await db.query.stages.findFirst({
      where: eq(stages.id, targetStageId),
      with: { pipeline: true },
    })

    if (!targetStage || targetStage.pipeline.deletedAt) {
      return { success: false, error: "Stage not found" }
    }

    // Fetch all deals in target stage, ordered by position
    const allDealsInStage = await db.query.deals.findMany({
      where: and(
        eq(deals.stageId, targetStageId),
        isNull(deals.deletedAt)
      ),
      orderBy: [sql`${deals.position} ASC`],
    })

    // If moving to same stage, filter out the deal being moved
    let targetDeals = allDealsInStage
    if (deal.stageId === targetStageId) {
      targetDeals = allDealsInStage.filter(d => d.id !== dealId)
    }

    const clampedIndex = Math.max(0, Math.min(targetIndex, targetDeals.length))

    let newPosition: string
    if (targetDeals.length === 0) {
      newPosition = "10000"
    } else if (clampedIndex === 0) {
      const firstPos = parseFloat(targetDeals[0].position)
      newPosition = (firstPos / 2).toString()
    } else if (clampedIndex >= targetDeals.length) {
      const lastPos = parseFloat(targetDeals[targetDeals.length - 1].position)
      newPosition = (lastPos + 10000).toString()
    } else {
      const prevPos = parseFloat(targetDeals[clampedIndex - 1].position)
      const nextPos = parseFloat(targetDeals[clampedIndex].position)
      newPosition = ((prevPos + nextPos) / 2).toString()
    }

    await db
      .update(deals)
      .set({ stageId: targetStageId, position: newPosition, updatedAt: new Date() })
      .where(eq(deals.id, dealId))

    // Emit CRM events when stage actually changed (not position-only reorder)
    if (deal.stageId !== targetStageId) {
      const updatedData = { ...deal, stageId: targetStageId, position: newPosition } as unknown as Record<string, unknown>

      crmBus.emit("deal.updated", buildEventPayload(
        dealId,
        "updated",
        updatedData,
        userId,
        ["stageId"],
      ))

      const stagePayload: DealStageChangedPayload = {
        ...buildEventPayload(
          dealId,
          "updated",
          updatedData,
          userId,
          ["stageId"],
        ),
        entity: "deal",
        oldStageId: deal.stageId,
        newStageId: targetStageId,
      }
      crmBus.emit("deal.stage_changed", stagePayload)
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to reorder deals:", error)
    return { success: false, error: "Failed to reorder deals" }
  }
}
