"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { activities, activityTypes, users } from "@/db/schema"
import { eq, and, isNull, isNotNull, asc, or, ilike, gte, lt } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { runWithActor } from "@/lib/audit/actor-context"
import { deleteRecordByType, updateRecordOwnerByType } from "@/lib/bulk/dispatch"
import { BULK_MAX_IDS } from "@/lib/bulk/limits"
import type { BulkFailure, BulkWriteResult } from "@/lib/bulk/types"
import { fetchFilteredData } from "@/lib/export/formatters"
import { endOfDayExclusive, startOfDayInclusive } from "@/lib/filters/date-range"
import type { ExportResult } from "@/lib/export/types"
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
 * Export exactly the selected activities as CSV (BULK-04).
 *
 * THE SIGNATURE IS THE SECURITY CONTROL. The only other export action, `getExportData`, is gated on
 * an admin role and takes a full options object. This one is open to every signed-in user, because
 * exporting rows you can already see in a list discloses nothing new — but that is only true while
 * the caller cannot widen the scope. An action that accepted a filters or options argument and
 * received `{}` would return every activity in the table, which is the admin-gated export reachable
 * without the gate (T-38-01). So there is no format parameter, no filters parameter, no entity
 * parameter and no object argument: every field of the request below is a literal written here.
 *
 * NO DATE WINDOW IS PASSED, deliberately and against the grain of this entity: activities are
 * date-scoped nearly everywhere else in the app, and the filter type declares a window. A selection
 * is already a complete description of what to export, and a window intersected with it could only
 * ever silently drop rows the user explicitly ticked.
 *
 * THE SLUG IS THE ENGLISH PLURAL AND IS NEVER TRANSLATED — the same `activities` that
 * `fetchFilteredData` derives for this entity type, so a scoped file and a full file sort together
 * and are recognisable to the same importer. The count comes from the fetch RESULT, not from the
 * submitted list: the two differ whenever a selected record was trashed between render and submit,
 * and the filename must describe the file's contents.
 */
export async function exportSelectedActivities(ids: string[]): Promise<ExportResult> {
  const session = await auth()

  // Verify authentication
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
    entityType: "activity",
    format: "csv",
    includeCustomFields: true,
    filters: { ids: uniqueIds },
  })

  if (!result.success) {
    return result
  }

  const date = new Date().toISOString().split("T")[0]

  return { ...result, filename: `activities-selected-${result.count}-${date}.csv` }
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
 * - Optional filters: typeId, dealId, ownerId, assigneeId, status, date range, search
 * - Orders by dueDate ascending
 *
 * WHY `status`, `dateFrom` AND `dateTo` ARE HERE, GIVEN THAT PHASE 40 ADDS NO NEW FILTERS.
 *
 * This is not a new filter. All three are already in the URL contract (`page.tsx`'s
 * `searchParams` type), already written by `activity-filters.tsx`, and already rendered as
 * removable chips. They simply never reached the query. Leaving them broken makes the phase's
 * first criterion false on this surface — a saved view would restore a chip that filters nothing —
 * which is the same class of defect as the stale search input that 40-CONTEXT amendment A4 and
 * UI-SPEC B-6 already ruled in scope. It also leaves a live export hole:
 * `hasExportableFilter("activity", { status: "overdue" })` is `true`, so an ineffective filter
 * would authorize an export of all 79,022 live activities, which is exactly what the E-2 guard
 * exists to prevent. And after plan 40-07 the export DOES filter by date and status, so leaving
 * the list alone would make the export narrower than the list it claims to match.
 *
 * WHAT WAS MEASURED BEFORE THIS CHANGE, on the live database (79,022 live activities):
 *   - `?status=overdue`  — 4,151 rows match; the list rendered **0** and showed "no results".
 *   - `?status=pending`  — 4,165 rows match; the list rendered **0**.
 *   - `?dateFrom=2025-01-01&dateTo=2025-03-31` — 7,933 rows match; the list rendered **0**.
 * All three for the same reason: Postgres applied `limit` to the UNNARROWED set ordered by
 * `dueDate` ascending, and the narrowing then ran in JavaScript over the 50 rows that came back —
 * the oldest activities, all of them completed. A post-fetch filter beneath a `limit` cannot
 * return the rows it is filtering for.
 *
 * `completed?: boolean` IS KEPT IN THE SIGNATURE and mapped to the same predicate as
 * `status: "completed"`. `page.tsx` was this action's only caller in `src/app` (the two
 * `activitiesApi.getActivities(` hits in `src/lib/import/pipedrive-api-client.ts` are the
 * Pipedrive SDK's unrelated method), and it now passes `status` — but the parameter stays so a
 * future caller reading the signature is not told the boolean was removed when the behaviour it
 * asked for is still available.
 *
 * EVERY PREDICATE MIRRORS `fetchActivities` IN `src/lib/export/formatters.ts`, line for line, so
 * the list and the export cannot disagree about what a view means. That file's `status` block
 * carries the note "Plan 40-13 closes the list side" — this is that closure. Do not change one
 * side without the other; `src/lib/export/__tests__/view-filters.test.ts` gates the export half
 * and `__tests__/get-activities-filters.test.ts` gates this half.
 */
export async function getActivities(filters?: {
  typeId?: string
  dealId?: string
  ownerId?: string
  assigneeId?: string
  completed?: boolean
  status?: string
  dateFrom?: string
  dateTo?: string
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
    // `completed: true` and `status: "completed"` are the SAME predicate, expressed once. The
    // boolean form is the older spelling; both land on `completedAt IS NOT NULL` rather than on the
    // no-op duplicate `isNull(activities.deletedAt)` this replaced, whose own comment admitted it
    // needed "a different approach".
    const status =
      filters?.status ??
      (filters?.completed === true ? "completed" : filters?.completed === false ? "pending" : undefined)

    if (status) {
      // Anything the toolbar cannot produce adds NO predicate. `pickFilterParams` has already
      // dropped an unrecognised value on the view path, but a direct URL can carry anything and an
      // unknown status must not silently mean "completed".
      // THE THREE VALUES ARE MUTUALLY EXCLUSIVE, because the control that produces them is a
      // SINGLE SELECT (`activity-filters.tsx:170-181`). Picking one of three options that overlap
      // is not a filter, it is a coin toss the user cannot see.
      //
      // `pending` WAS A BARE `completedAt IS NULL`, WHICH IS A STRICT SUPERSET OF `overdue`.
      // Measured on the live table at review time: 4,165 rows incomplete, 4,151 of them already
      // past due — so a user picking "Pending" to see what is not yet due was shown 4,151 overdue
      // rows and 14 relevant ones (99.7% overlap). The pre-40-13 JavaScript this replaced had it
      // right: `!completedAt && dueDate >= now`.
      //
      // `now` is computed ONCE per call and shared by the two date branches, so `pending` and
      // `overdue` partition the incomplete rows against the SAME instant. Two `new Date()` calls
      // would leave a microsecond window belonging to neither, which is the kind of gap that only
      // ever shows up as one missing row in a report.
      const now = new Date()

      if (status === "completed") {
        conditions.push(isNotNull(activities.completedAt))
      } else if (status === "pending") {
        conditions.push(and(isNull(activities.completedAt), gte(activities.dueDate, now))!)
      } else if (status === "overdue") {
        conditions.push(and(isNull(activities.completedAt), lt(activities.dueDate, now))!)
      }
    }
    // THE RANGE IS HALF-OPEN: `[dateFrom 00:00, dateTo+1day 00:00)`, both bounds in UTC.
    //
    // `dateTo` USED TO BE `lte(dueDate, new Date(dateTo))`, WHICH IS MIDNIGHT — so `dateTo` meant
    // "the first instant of that day" rather than "that day", and every activity due later on the
    // last day of the range was dropped from the list, from the CSV, and from the row count in the
    // success toast (all three come from this one query). The activity dialog composes
    // `${dueDate}T${dueTime || "09:00"}`, so that is EVERY activity the app itself creates. The live
    // data hid it completely: all 79,022 imported rows sit at exactly 00:00:00.
    //
    // TIMEZONE, STATED: both helpers are UTC-only, and the container runs `TZ=UTC` (verified), so
    // UTC midnight is the operator's midnight. See `src/lib/filters/date-range.ts` for what changes
    // under a non-UTC deployment and why `setHours(23,59,59,999)` is NOT the fix.
    //
    // ONE MODULE, THREE CALL SITES: `fetchActivities` and `fetchDeals` in
    // `src/lib/export/formatters.ts` import the same two helpers, so the export and the list cannot
    // disagree about what a saved date range means.
    if (filters?.dateFrom) {
      conditions.push(gte(activities.dueDate, startOfDayInclusive(filters.dateFrom)))
    }
    if (filters?.dateTo) {
      conditions.push(lt(activities.dueDate, endOfDayExclusive(filters.dateTo)))
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
      // THE LIMIT NOW BOUNDS AN ALREADY-NARROWED SET, which is also what makes the caller's
      // `hasMore` true. Previously the limit was applied to every live activity and the narrowing
      // ran below this call, so `?status=completed` returned fewer than 50 completed rows even
      // though 74,857 exist, and the Load More button disagreed with the row count it sat under.
      limit: filters?.limit,
    })

    // Nothing is filtered after the fetch. Every filter above is a `where` condition.
    return { success: true, data: result }
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
