"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { deals, stages, users, notificationPreferences } from "@/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { sendDealAssignedEmail } from "@/lib/email/send"
import {
  createDealMutation,
  updateDealMutation,
  deleteDealMutation,
  updateDealStageMutation,
  reorderDealsMutation,
  dealSchema,
  updateDealSchema,
  computeNewAssigneeIds,
} from "@/lib/mutations/deals"

/**
 * Create a new deal
 */
export async function createDeal(
  data: z.infer<typeof dealSchema>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const result = await createDealMutation({
    ...data,
    userId: session.user.id,
    assigneeIds: data.assigneeIds ?? [],
  })

  if (!result.success) {
    return result
  }

  // Determine pipeline ID for revalidation
  const stage = await db.query.stages.findFirst({
    where: eq(stages.id, data.stageId),
    columns: { pipelineId: true },
  })

  revalidatePath("/deals")
  if (stage) {
    revalidatePath(`/deals/${stage.pipelineId}`)
  }

  return { success: true, id: result.id }
}

/**
 * Update an existing deal
 */
export async function updateDeal(
  id: string,
  data: z.infer<typeof updateDealSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Auth check: verify ownership
  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), isNull(deals.deletedAt)),
  })

  if (!deal) {
    return { success: false, error: "Deal not found" }
  }

  if (deal.ownerId !== session.user.id && session.user.role !== "admin") {
    return { success: false, error: "Not authorized" }
  }

  const result = await updateDealMutation(id, data, session.user.id)

  if (!result.success) {
    return result
  }

  // Send deal-assigned emails for newly added assignees (fire-and-forget)
  if (result.newAssigneeUserIds.length > 0) {
    const dealName = result.dealTitle
    const assignerName = session.user.name || "Someone"

    for (const assigneeUserId of result.newAssigneeUserIds) {
      const [assigneeUser] = await db
        .select({ email: users.email, locale: users.locale })
        .from(users)
        .where(eq(users.id, assigneeUserId))
        .limit(1)

      if (!assigneeUser) continue

      const [prefs] = await db
        .select({ emailDealAssigned: notificationPreferences.emailDealAssigned })
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, assigneeUserId))
        .limit(1)

      if (prefs && !prefs.emailDealAssigned) continue

      sendDealAssignedEmail(
        assigneeUser.email,
        id,
        dealName,
        assignerName,
        assigneeUser.locale
      ).catch((error) => {
        console.error("Failed to send deal-assigned email:", error)
      })
    }
  }

  revalidatePath("/deals")
  revalidatePath(`/deals/${id}`)

  return { success: true }
}

/**
 * Delete a deal (soft delete)
 */
export async function deleteDeal(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Auth check
  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), isNull(deals.deletedAt)),
  })

  if (!deal) {
    return { success: false, error: "Deal not found" }
  }

  if (deal.ownerId !== session.user.id && session.user.role !== "admin") {
    return { success: false, error: "Not authorized" }
  }

  const result = await deleteDealMutation(id, session.user.id)

  if (result.success) {
    revalidatePath("/deals")
  }

  return result
}

/**
 * Move deal to a new stage
 */
export async function updateDealStage(
  id: string,
  stageId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Auth check
  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), isNull(deals.deletedAt)),
  })

  if (!deal) {
    return { success: false, error: "Deal not found" }
  }

  if (deal.ownerId !== session.user.id && session.user.role !== "admin") {
    return { success: false, error: "Not authorized" }
  }

  const result = await updateDealStageMutation(id, stageId, session.user.id)

  if (result.success) {
    revalidatePath("/deals")
  }

  return result
}

/**
 * Reorder deals with drag-drop support
 */
export async function reorderDeals(
  dealId: string,
  targetStageId: string,
  targetIndex: number
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Auth check
  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, dealId), isNull(deals.deletedAt)),
  })

  if (!deal) {
    return { success: false, error: "Deal not found" }
  }

  if (deal.ownerId !== session.user.id && session.user.role !== "admin") {
    return { success: false, error: "Not authorized" }
  }

  const result = await reorderDealsMutation(dealId, targetStageId, targetIndex, session.user.id)

  if (result.success) {
    revalidatePath("/deals")
  }

  return result
}

// Re-export for backward compatibility with tests
export { computeNewAssigneeIds }
