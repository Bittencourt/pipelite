"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { activities, activityTypes, users } from "@/db/schema"
import { eq, and, isNull, asc, or, ilike } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { runWithActor } from "@/lib/audit/actor-context"
import { deleteRecordByType, updateRecordOwnerByType } from "@/lib/bulk/dispatch"
import { BULK_MAX_IDS } from "@/lib/bulk/limits"
import type { BulkFailure, BulkWriteResult } from "@/lib/bulk/types"
import {
  createActivityMutation,
  updateActivityMutation,
  deleteActivityMutation,
  toggleActivityCompletionMutation,
  activitySchema,
  updateActivitySchema,
} from "@/lib/mutations/activities"

/**
 * Create a new activity
 * - Validates user is authenticated
 * - Delegates to mutation layer for validation, insert, and event emission
 * - Returns success with activity ID or error
 */
export async function createActivity(
  data: z.infer<typeof activitySchema>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // The actor scope opens AFTER the session check above, never before it, so an
  // unauthenticated call establishes no actor at all (T-36-02). `userId` is
  // `session.user.id` and nothing else — never a form field, never a search param.
  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    createActivityMutation({
      ...data,
      userId: session.user.id,
    })
  )

  if (!result.success) {
    return result
  }

  revalidatePath("/activities")

  return { success: true, id: result.id }
}

/**
 * Update an existing activity
 * - Validates user is authenticated
 * - Verifies user owns the activity
 * - Delegates to mutation layer for update and event emission
 * - Returns success or error
 */
export async function updateActivity(
  id: string,
  data: z.infer<typeof updateActivitySchema>
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Check ownership
  const activity = await db.query.activities.findFirst({
    where: and(
      eq(activities.id, id),
      isNull(activities.deletedAt)
    ),
  })

  if (!activity) {
    return { success: false, error: "Activity not found" }
  }

  if (activity.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    updateActivityMutation(id, data, session.user.id)
  )

  if (!result.success) {
    return result
  }

  revalidatePath("/activities")
  revalidatePath(`/activities/${id}`)

  return { success: true }
}

/**
 * Delete an activity (soft delete)
 * - Validates user is authenticated
 * - Verifies user owns the activity
 * - Delegates to mutation layer for delete and event emission
 * - Returns success or error
 */
export async function deleteActivity(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Check ownership
  const activity = await db.query.activities.findFirst({
    where: and(
      eq(activities.id, id),
      isNull(activities.deletedAt)
    ),
  })

  if (!activity) {
    return { success: false, error: "Activity not found" }
  }

  if (activity.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    deleteActivityMutation(id, session.user.id)
  )

  if (!result.success) {
    return result
  }

  revalidatePath("/activities")

  return { success: true }
}

/**
 * Longest id string a bulk call may carry, and the runtime narrowing that enforces the shape.
 *
 * A server action is a POST endpoint, so `ids: string[]` is an annotation and NOT a control: a
 * caller can send a number, `null`, an object, or an array of objects, and it would otherwise flow
 * straight into `eq(activities.id, id)`. This is `parseRecordId`'s reasoning
 * (`src/app/trash/actions.ts:111-117`) applied to a list — a bare shape test rather than a UUID
 * pattern, because the value's only job here is to be a bindable parameter, and a parser that
 * encoded today's key type becomes wrong the moment one entity changes it. The ceiling stops a
 * megabyte string being carried into a query and a log line; the non-empty test stops `""`, which
 * is a legal `string` and matches nothing.
 *
 * A malformed argument returns `null`, which every caller maps to `no_selection`. Dropping only the
 * bad entries and proceeding would act on a selection the user never made.
 *
 * Deduplication happens here so the cap is checked against DISTINCT ids: the same id twice must not
 * consume two of the caller's hundred, and must not be dispatched twice.
 */
const MAX_BULK_ID_LENGTH = 64

function parseBulkIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) {
    return null
  }

  const malformed = raw.some(
    id => typeof id !== "string" || id.length === 0 || id.length > MAX_BULK_ID_LENGTH
  )

  return malformed ? null : Array.from(new Set(raw as string[]))
}

/**
 * Soft-delete many activities in one call (BULK-02).
 *
 * BEST-EFFORT AND PER-RECORD, NOT TRANSACTIONAL. One aborting transaction structurally cannot name
 * which record failed, and naming them is the whole contract (`BulkWriteResult.failed`), so the loop
 * is sequential and continues past a failure. `success: true` with a non-empty `failed` is an
 * ordinary outcome meaning the call ran.
 *
 * THE OWNERSHIP PREDICATE BELOW IS THIS FILE'S OWN, COPIED VERBATIM from `deleteActivity` above and
 * deliberately NOT shared with the other three entities. `src/app/deals/actions.ts` carries an
 * additional admin clause and this file does not; a unified helper would either grant activities a
 * bypass they do not have today (a privilege escalation) or strip deals of one they do. The bulk
 * predicate therefore sits adjacent to the single-record predicate it must match.
 *
 * The predicate compares the OWNER column and nothing else. Activities carry a second user-valued
 * column which D-11 scopes out of this phase entirely — it is neither an authorization subject nor
 * a write target here, and the suite in `bulk-actions.test.ts` gates both directions.
 *
 * `alreadyDeleted` is unreachable on this path by construction: the read below already carries
 * `isNull(activities.deletedAt)`, so a record already in Trash simply does not match and is reported
 * as `notFound`. Telling the two apart would cost a second query per id purely for a nicer label
 * (38-RESEARCH A6).
 *
 * A dispatch refusal collapses to `unknown`: the mutation's own `error` string is written for a
 * server log and may name a table or a constraint, so it stops here and never crosses to the client
 * (T-38-07).
 */
export async function bulkDeleteActivities(ids: string[]): Promise<BulkWriteResult> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "not_authenticated" }
  }

  const uniqueIds = parseBulkIds(ids)

  if (!uniqueIds || uniqueIds.length === 0) {
    return { success: false, error: "no_selection" }
  }

  // The server enforces the cap. The bulk bar mirrors the same constant, but a client-side cap on a
  // POST endpoint is a hint and not a limit.
  if (uniqueIds.length > BULK_MAX_IDS) {
    return { success: false, error: "too_many", max: BULK_MAX_IDS }
  }

  // The actor scope opens AFTER the session check above, never before it, so an unauthenticated
  // call establishes no actor at all (T-36-02). It wraps the WHOLE loop exactly once: one bulk
  // click is one operation by one identity, and `userId` is `session.user.id` and nothing else.
  const outcome = await runWithActor({ kind: "user", userId: session.user.id }, async () => {
    const succeeded: string[] = []
    const failed: BulkFailure[] = []

    for (const id of uniqueIds) {
      const activity = await db.query.activities.findFirst({
        where: and(
          eq(activities.id, id),
          isNull(activities.deletedAt)
        ),
      })

      if (!activity) {
        failed.push({ id, reason: "notFound" })
        continue
      }

      if (activity.ownerId !== session.user.id) {
        failed.push({ id, reason: "notPermitted" })
        continue
      }

      const result = await deleteRecordByType("activity", id, session.user.id)

      if (result.success) {
        succeeded.push(id)
      } else {
        failed.push({ id, reason: "unknown" })
      }
    }

    return { succeeded, failed }
  })

  // ONCE, after the loop closes, and only when something actually changed. The same path string
  // `deleteActivity` revalidates.
  if (outcome.succeeded.length > 0) {
    revalidatePath("/activities")
  }

  return { success: true, ...outcome }
}

/**
 * Transfer ownership of many activities in one call (BULK-03).
 *
 * Same seven steps as the bulk delete, with the target-user validation added between the cap check
 * and the loop. That validation runs EXACTLY ONCE for the whole call: the target does not change
 * per record, and a per-record lookup would issue a hundred identical queries.
 *
 * BOTH TARGET PREDICATES ARE REQUIRED. Handing ownership to a soft-deleted or not-yet-approved
 * account hides the records from every list without deleting them (T-38-06). Note that
 * `activities/page.tsx` filters its owner picker on the soft-delete column alone; that query feeds a
 * filter dropdown and a dialog, is not an authorization boundary, and is deliberately neither copied
 * nor modified here.
 *
 * The write routes through `updateRecordOwnerByType`, never the generic activity update: the owner
 * column is absent from `activitySchema` and Zod strips unknown keys, so the generic path would
 * write only `updatedAt`, emit an empty diff, and have the audit subscriber drop the row — a silent
 * success no-op (T-38-09).
 */
export async function bulkReassignActivityOwner(
  ids: string[],
  ownerId: string
): Promise<BulkWriteResult> {
  const session = await auth()

  // Verify authentication
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

  // Narrowed for the same reason the id list is, and refused as an invalid target rather than as an
  // empty selection: the selection was fine, the destination was not.
  if (
    typeof ownerId !== "string" ||
    ownerId.length === 0 ||
    ownerId.length > MAX_BULK_ID_LENGTH
  ) {
    return { success: false, error: "invalid_owner" }
  }

  const target = await db.query.users.findFirst({
    where: and(
      eq(users.id, ownerId),
      isNull(users.deletedAt),
      eq(users.status, "approved")
    ),
  })

  if (!target) {
    return { success: false, error: "invalid_owner" }
  }

  // One scope for the whole loop, opened only once the call is known to be admissible.
  const outcome = await runWithActor({ kind: "user", userId: session.user.id }, async () => {
    const succeeded: string[] = []
    const failed: BulkFailure[] = []

    for (const id of uniqueIds) {
      const activity = await db.query.activities.findFirst({
        where: and(
          eq(activities.id, id),
          isNull(activities.deletedAt)
        ),
      })

      if (!activity) {
        failed.push({ id, reason: "notFound" })
        continue
      }

      // Verbatim from this file's update path (:84) and delete path (:131) — the same string, with
      // no admin clause.
      if (activity.ownerId !== session.user.id) {
        failed.push({ id, reason: "notPermitted" })
        continue
      }

      // `ownerId` is the NEW owner; the last argument is the ACTOR. Both are strings and adjacent,
      // so the order is pinned by an exact-arguments assertion in the suite rather than by types.
      const result = await updateRecordOwnerByType("activity", id, ownerId, session.user.id)

      if (result.success) {
        succeeded.push(id)
      } else {
        failed.push({ id, reason: "unknown" })
      }
    }

    return { succeeded, failed }
  })

  if (outcome.succeeded.length > 0) {
    revalidatePath("/activities")
  }

  return { success: true, ...outcome }
}

/**
 * Toggle activity completion
 * - Validates user is authenticated
 * - Verifies user owns the activity
 * - Delegates to mutation layer for toggle and event emission
 * - Returns success or error
 */
export async function toggleActivityCompletion(
  id: string
): Promise<{ success: true; completed: boolean } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Check ownership
  const activity = await db.query.activities.findFirst({
    where: and(
      eq(activities.id, id),
      isNull(activities.deletedAt)
    ),
  })

  if (!activity) {
    return { success: false, error: "Activity not found" }
  }

  if (activity.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    toggleActivityCompletionMutation(id, session.user.id)
  )

  if (!result.success) {
    return result
  }

  revalidatePath("/activities")

  return { success: true, completed: result.completed }
}

/**
 * Get activities with optional filters
 * - Validates user is authenticated
 * - Returns activities with relations (type, deal, owner)
 * - Filters out deleted activities
 * - Optional filters: typeId, dealId, ownerId, completed status
 * - Orders by dueDate ascending
 */
export async function getActivities(filters?: {
  typeId?: string
  dealId?: string
  ownerId?: string
  assigneeId?: string
  completed?: boolean
  search?: string
  limit?: number
}): Promise<{ success: true; data: unknown[] } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    // Build where conditions
    const conditions = [isNull(activities.deletedAt)]

    if (filters?.typeId) {
      conditions.push(eq(activities.typeId, filters.typeId))
    }
    if (filters?.dealId) {
      conditions.push(eq(activities.dealId, filters.dealId))
    }
    if (filters?.ownerId) {
      conditions.push(eq(activities.ownerId, filters.ownerId))
    }
    if (filters?.assigneeId) {
      conditions.push(eq(activities.assigneeId, filters.assigneeId))
    }
    if (filters?.completed === true) {
      conditions.push(isNull(activities.deletedAt)) // completedAt is not null - need different approach
    }
    if (filters?.search) {
      conditions.push(
        or(
          ilike(activities.title, `%${filters.search}%`),
          ilike(activities.notes, `%${filters.search}%`)
        )!
      )
    }

    const result = await db.query.activities.findMany({
      where: and(...conditions),
      with: {
        type: true,
        deal: true,
        owner: true,
        assignee: {
          columns: { id: true, name: true, email: true },
        },
      },
      orderBy: [asc(activities.dueDate)],
      limit: filters?.limit,
    })

    // Filter by completion status if specified (Drizzle doesn't have isNotNull easily)
    let filteredResults = result
    if (filters?.completed !== undefined) {
      filteredResults = result.filter(a =>
        filters.completed ? a.completedAt !== null : a.completedAt === null
      )
    }

    return { success: true, data: filteredResults }
  } catch (error) {
    console.error("Failed to get activities:", error)
    return { success: false, error: "Failed to get activities" }
  }
}

/**
 * Get a single activity by ID
 * - Validates user is authenticated
 * - Returns activity with relations or null
 */
export async function getActivityById(
  id: string
): Promise<{ success: true; data: unknown | null } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    const activity = await db.query.activities.findFirst({
      where: and(
        eq(activities.id, id),
        isNull(activities.deletedAt)
      ),
      with: {
        type: true,
        deal: true,
        owner: true,
      },
    })

    return { success: true, data: activity }
  } catch (error) {
    console.error("Failed to get activity:", error)
    return { success: false, error: "Failed to get activity" }
  }
}

/**
 * Get all activity types
 * - Validates user is authenticated
 * - Returns activity types ordered by name
 */
export async function getActivityTypes(): Promise<
  { success: true; data: unknown[] } | { success: false; error: string }
> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    const types = await db.query.activityTypes.findMany({
      orderBy: [asc(activityTypes.name)],
    })

    return { success: true, data: types }
  } catch (error) {
    console.error("Failed to get activity types:", error)
    return { success: false, error: "Failed to get activity types" }
  }
}
