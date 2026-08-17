"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { deals, stages, users, notificationPreferences } from "@/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { runWithActor } from "@/lib/audit/actor-context"
import { sendDealAssignedEmail } from "@/lib/email/send"
import { deleteRecordByType, updateRecordOwnerByType } from "@/lib/bulk/dispatch"
import { BULK_MAX_IDS } from "@/lib/bulk/limits"
import type { BulkFailure, BulkWriteResult } from "@/lib/bulk/types"
import { fetchFilteredData } from "@/lib/export/formatters"
import type { ExportResult } from "@/lib/export/types"
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

  // The actor scope opens AFTER the session check above, never before it, so an
  // unauthenticated call establishes no actor at all (T-36-02). `userId` is
  // `session.user.id` and nothing else — never a form field, never a search param.
  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    createDealMutation({
      ...data,
      userId: session.user.id,
      assigneeIds: data.assigneeIds ?? [],
    })
  )

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

  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    updateDealMutation(id, data, session.user.id)
  )

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

  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    deleteDealMutation(id, session.user.id)
  )

  if (result.success) {
    revalidatePath("/deals")
  }

  return result
}

/**
 * The three bulk actions below deliberately sit HERE, immediately after `deleteDeal`, so each bulk
 * ownership predicate is a few lines from the single-record predicate it must match verbatim.
 *
 * DEALS IS THE ONE ENTITY OF THE FOUR WHOSE PREDICATE CARRIES THE ADMIN CLAUSE. The organizations,
 * people and activities actions guard on ownership alone. The clause below is therefore copied from
 * this file's own `deleteDeal` and `updateDeal` and must never be "unified" with the other three:
 * removing it is a regression an admin hits on the first click, and adding it to the other three is
 * a privilege escalation shipped as a bulk feature.
 *
 * Every one of the three is BEST-EFFORT and SEQUENTIAL: no batched `WHERE id IN (...)` (which would
 * authorize once for many rows), no parallel fan-out, and no wrapping transaction (which structurally
 * cannot report WHICH record failed). One actor scope wraps the whole loop and the cache is
 * revalidated once after it.
 */

/**
 * A bindable id, narrowed at runtime.
 *
 * A server action is a POST endpoint, so `ids: string[]` is an annotation and not a control — a
 * caller can send a number, an object, `null`, or a megabyte string, and it would otherwise flow
 * straight into `eq(deals.id, id)`. Same reasoning, and the same 64-character ceiling, as
 * `parseRecordId` in `src/app/trash/actions.ts`. A bare shape test, not a UUID pattern: the value's
 * only job here is to be a bindable parameter.
 */
const MAX_BULK_ID_LENGTH = 64

/** The deduped id list, or `null` when the argument is not a list of bindable ids at all. */
function parseBulkIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null

  for (const value of raw) {
    if (typeof value !== "string") return null
    if (value.length === 0 || value.length > MAX_BULK_ID_LENGTH) return null
  }

  return Array.from(new Set(raw as string[]))
}

/**
 * Soft-delete many deals (BULK-02).
 *
 * A per-record miss maps to `notFound`, never to `alreadyDeleted`: the read below is already scoped
 * with `isNull(deals.deletedAt)`, so a deal that is already in Trash simply does not match, and
 * telling the two apart would cost a second query per id for a nicer label (38-RESEARCH A6).
 */
export async function bulkDeleteDeals(ids: string[]): Promise<BulkWriteResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "not_authenticated" }
  }

  const uniqueIds = parseBulkIds(ids)
  if (!uniqueIds || uniqueIds.length === 0) {
    return { success: false, error: "no_selection" }
  }

  // The server enforces the cap; the bulk bar's mirror of the same constant is advisory only.
  if (uniqueIds.length > BULK_MAX_IDS) {
    return { success: false, error: "too_many", max: BULK_MAX_IDS }
  }

  // The actor scope opens AFTER the session check above, never before it, so an unauthenticated
  // call establishes no actor at all (T-36-02) — and ONCE around the whole loop, not per record.
  const outcome = await runWithActor({ kind: "user", userId: session.user.id }, async () => {
    const succeeded: string[] = []
    const failed: BulkFailure[] = []

    for (const id of uniqueIds) {
      const deal = await db.query.deals.findFirst({
        where: and(eq(deals.id, id), isNull(deals.deletedAt)),
      })

      if (!deal) {
        failed.push({ id, reason: "notFound" })
        continue
      }

      if (deal.ownerId !== session.user.id && session.user.role !== "admin") {
        failed.push({ id, reason: "notPermitted" })
        continue
      }

      const result = await deleteRecordByType("deal", id, session.user.id)

      if (result.success) {
        succeeded.push(id)
      } else {
        // The mutation's own message is written for a server log and may name a table or a
        // constraint, so it stops here and the client receives a closed code (T-38-07).
        failed.push({ id, reason: "unknown" })
      }
    }

    return { succeeded, failed }
  })

  if (outcome.succeeded.length > 0) {
    revalidatePath("/deals")
  }

  return { success: true, ...outcome }
}

/**
 * Transfer many deals to one new owner (BULK-03).
 *
 * NO NOTIFICATION IS SENT, ON ANY PATH (D-13). The only email on any owner or assignee path is the
 * deal-assigned one above, and it fires off newly added ASSIGNEES — never off `ownerId`. The owner
 * mutation this routes to returns no new-assignee list, so there is nothing to loop over and no
 * suppression flag is needed: a per-record notification would emit up to 100 messages from one
 * click, and a digest is deferred rather than built.
 *
 * The routing goes through the bulk dispatch map to the owner-only mutation, which touches exactly
 * two columns. It must NEVER go through the general deal update with a partial payload: that schema
 * is a `.partial()` of the create schema, which preserves the assignee list's `.default([])`, so
 * such a call unconditionally clears every join row for the deal — a loss that never appears in the
 * audited diff, because those rows live in a join table.
 */
export async function bulkReassignDealOwner(
  ids: string[],
  ownerId: string
): Promise<BulkWriteResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "not_authenticated" }
  }

  const uniqueIds = parseBulkIds(ids)
  if (!uniqueIds || uniqueIds.length === 0) {
    return { success: false, error: "no_selection" }
  }

  if (uniqueIds.length > BULK_MAX_IDS) {
    return { success: false, error: "too_many", max: BULK_MAX_IDS }
  }

  // The target is validated ONCE for the whole call, before any actor scope opens, and against BOTH
  // predicates: a soft-deleted OR not-yet-approved user is not a legal owner, because transferring
  // records to an inactive principal hides them from everyone who can act on them (T-38-06). The
  // owner picker on the kanban page filters on the deleted column alone and can therefore offer an
  // unapproved user; it is not the analog for this check.
  const targetId = parseBulkIds([ownerId])?.[0]
  const targetOwner = targetId
    ? await db.query.users.findFirst({
        where: and(
          eq(users.id, targetId),
          isNull(users.deletedAt),
          eq(users.status, "approved")
        ),
      })
    : undefined

  if (!targetId || !targetOwner) {
    return { success: false, error: "invalid_owner" }
  }

  const outcome = await runWithActor({ kind: "user", userId: session.user.id }, async () => {
    const succeeded: string[] = []
    const failed: BulkFailure[] = []

    for (const id of uniqueIds) {
      const deal = await db.query.deals.findFirst({
        where: and(eq(deals.id, id), isNull(deals.deletedAt)),
      })

      if (!deal) {
        failed.push({ id, reason: "notFound" })
        continue
      }

      if (deal.ownerId !== session.user.id && session.user.role !== "admin") {
        failed.push({ id, reason: "notPermitted" })
        continue
      }

      // Argument order is ("deal", record, NEW OWNER, ACTOR). All four are strings, so nothing but
      // this call site and its test keeps the last two from being swapped.
      const result = await updateRecordOwnerByType("deal", id, targetId, session.user.id)

      if (result.success) {
        succeeded.push(id)
      } else {
        failed.push({ id, reason: "unknown" })
      }
    }

    return { succeeded, failed }
  })

  if (outcome.succeeded.length > 0) {
    revalidatePath("/deals")
  }

  return { success: true, ...outcome }
}

/**
 * Export exactly the selected deals as CSV (BULK-04).
 *
 * THE SIGNATURE IS A LIST OF RECORD IDS AND NOTHING ELSE, and that is the security control, not a
 * convenience. The other export entry point in this app is admin-gated and takes a whole options
 * object; a NON-admin action that accepted such an object and was handed `{}` would answer with every
 * deal in the database — an admin-gate bypass reachable from any browser, because a server action is
 * a POST endpoint (T-38-01). So no format, no filter object, no entity type and no options parameter
 * is accepted here: every field below is a literal built on the server.
 *
 * Any authenticated user may export their OWN selection, so there is deliberately no role check —
 * the scope is the selection, which they could already read.
 *
 * No stage filter is passed even though the filter type has a slot for one and the deals page is a
 * kanban organised by stage: the selection already determines the rows, and a second, narrower
 * predicate could only silently drop rows the user ticked.
 */
export async function exportSelectedDeals(ids: string[]): Promise<ExportResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const uniqueIds = parseBulkIds(ids)
  if (!uniqueIds || uniqueIds.length === 0) {
    return { success: false, error: "No records selected" }
  }

  if (uniqueIds.length > BULK_MAX_IDS) {
    return { success: false, error: "Too many records" }
  }

  const result = await fetchFilteredData({
    entityType: "deal",
    format: "csv",
    includeCustomFields: true,
    filters: { ids: uniqueIds },
  })

  if (!result.success) {
    return result
  }

  // The slug is the English plural the formatter's own mapping produces and is NEVER translated: a
  // filename is not UI copy, and a localised one breaks every downstream importer. The count comes
  // from the fetch result, so it reports rows WRITTEN rather than rows requested.
  const date = new Date().toISOString().split("T")[0]

  return { ...result, filename: `deals-selected-${result.count}-${date}.csv` }
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

  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    updateDealStageMutation(id, stageId, session.user.id)
  )

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

  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    reorderDealsMutation(dealId, targetStageId, targetIndex, session.user.id)
  )

  if (result.success) {
    revalidatePath("/deals")
  }

  return result
}

// Re-export for backward compatibility with tests
export { computeNewAssigneeIds }
