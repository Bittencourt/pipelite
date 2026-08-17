"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { organizations, users } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { runWithActor } from "@/lib/audit/actor-context"
import { deleteRecordByType, updateRecordOwnerByType } from "@/lib/bulk/dispatch"
import { BULK_MAX_IDS } from "@/lib/bulk/limits"
import type { BulkFailure, BulkWriteResult } from "@/lib/bulk/types"
import { fetchFilteredData } from "@/lib/export/formatters"
import type { ExportResult } from "@/lib/export/types"
import {
  createOrganizationMutation,
  updateOrganizationMutation,
  deleteOrganizationMutation,
  organizationSchema,
  updateOrganizationSchema,
} from "@/lib/mutations/organizations"

/**
 * Create a new organization
 * - Validates user is authenticated
 * - Delegates to mutation layer for validation, insert, and event emission
 * - Returns success with organization ID or error
 */
export async function createOrganization(
  data: z.infer<typeof organizationSchema>
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
    createOrganizationMutation({
      ...data,
      userId: session.user.id,
    })
  )

  if (!result.success) {
    return result
  }

  revalidatePath("/organizations")

  return { success: true, id: result.id }
}

/**
 * Update an existing organization
 * - Validates user is authenticated
 * - Verifies user owns the organization
 * - Delegates to mutation layer for update and event emission
 * - Returns success or error
 */
export async function updateOrganization(
  id: string,
  data: z.infer<typeof updateOrganizationSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Check ownership
  const organization = await db.query.organizations.findFirst({
    where: and(
      eq(organizations.id, id),
      isNull(organizations.deletedAt)
    ),
  })

  if (!organization) {
    return { success: false, error: "Organization not found" }
  }

  if (organization.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    updateOrganizationMutation(id, data, session.user.id)
  )

  if (!result.success) {
    return result
  }

  revalidatePath("/organizations")
  revalidatePath(`/organizations/${id}`)

  return { success: true }
}

/**
 * Delete an organization (soft delete)
 * - Validates user is authenticated
 * - Verifies user owns the organization
 * - Delegates to mutation layer for delete and event emission
 * - Returns success or error
 */
export async function deleteOrganization(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Check ownership
  const organization = await db.query.organizations.findFirst({
    where: and(
      eq(organizations.id, id),
      isNull(organizations.deletedAt)
    ),
  })

  if (!organization) {
    return { success: false, error: "Organization not found" }
  }

  if (organization.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    deleteOrganizationMutation(id, session.user.id)
  )

  if (!result.success) {
    return result
  }

  revalidatePath("/organizations")

  return { success: true }
}

/**
 * THE `ids` ARGUMENT IS NARROWED AT RUNTIME, for the reason `parseRecordId` states in
 * `src/app/trash/actions.ts:94-117`: a server action is a POST endpoint, so `ids: string[]` is an
 * annotation and not a control. A caller can send a number, `null`, an object, or an array holding
 * any of those, and each element would otherwise flow straight into `eq(organizations.id, element)`.
 *
 * A bare shape test, not a UUID pattern — the id's only job here is to be a bindable parameter, and a
 * parser that encodes today's key type becomes wrong the moment one entity changes it. The 64
 * character ceiling stops a megabyte string reaching a query and a log line; the non-empty test stops
 * `""`, which is a legal `string` and matches nothing.
 *
 * Deduping happens here too, so the cap check below counts DISTINCT ids and a client that submits the
 * same row twice cannot be charged for it twice.
 */
const MAX_RECORD_ID_LENGTH = 64

function parseIdList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null

  for (const value of raw) {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_RECORD_ID_LENGTH) {
      return null
    }
  }

  return Array.from(new Set(raw as string[]))
}

/**
 * Soft-delete many organizations, best effort, one record at a time (BULK-02).
 *
 * PARTIAL SUCCESS IS THE CONTRACT, not a compromise. The loop never breaks and never throws out, so
 * `{ success: true }` with a non-empty `failed` is an ordinary outcome meaning "the call ran". A
 * single aborting transaction structurally cannot name WHICH record failed, which is why there is no
 * `db.transaction` here and no `Promise.all` either — the sequential loop is also what keeps a
 * 100-record delete inside a connection pool created with no configured `max`.
 *
 * The ownership predicate below is copied VERBATIM from `deleteOrganization` above, adjacent to the
 * single-record check it must match. Organizations have NO admin bypass; only deals carry one
 * (`src/app/deals/actions.ts:83`). Adding `session.user.role` to this comparison would be a privilege
 * escalation shipped as a bulk feature, so it is absent here and a source gate in
 * `bulk-actions.test.ts` asserts it stays absent.
 */
export async function bulkDeleteOrganizations(ids: string[]): Promise<BulkWriteResult> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "not_authenticated" }
  }

  const uniqueIds = parseIdList(ids)

  if (!uniqueIds || uniqueIds.length === 0) {
    return { success: false, error: "no_selection" }
  }

  if (uniqueIds.length > BULK_MAX_IDS) {
    return { success: false, error: "too_many", max: BULK_MAX_IDS }
  }

  // The actor scope opens AFTER the session check above, never before it, so an unauthenticated call
  // establishes no actor at all (T-36-02) — and it opens ONCE around the whole loop, never per
  // record. `AsyncLocalStorage` propagates across every `await` inside, and `crmBus.emit` is
  // synchronous, so the audit subscriber reads the actor inline on the mutation's own stack.
  const outcome = await runWithActor({ kind: "user", userId: session.user.id }, async () => {
    const succeeded: string[] = []
    const failed: BulkFailure[] = []

    for (const id of uniqueIds) {
      const organization = await db.query.organizations.findFirst({
        where: and(eq(organizations.id, id), isNull(organizations.deletedAt)),
      })

      // The read already carries `isNull(deletedAt)`, so a row that is already in Trash simply does
      // not match and collapses into `notFound`. Telling the two apart would need a second read per
      // id purely to produce a nicer label (38-RESEARCH A6).
      if (!organization) {
        failed.push({ id, reason: "notFound" })
        continue
      }

      if (organization.ownerId !== session.user.id) {
        failed.push({ id, reason: "notPermitted" })
        continue
      }

      const result = await deleteRecordByType("organization", id, session.user.id)

      // The mutation's own `error` string is written for a server log and stops here (T-38-07); what
      // crosses the client boundary is a closed reason code.
      if (result.success) {
        succeeded.push(id)
      } else {
        failed.push({ id, reason: "unknown" })
      }
    }

    return { succeeded, failed }
  })

  // ONCE, after the loop. Inside it, 100 records would mean 100 revalidations for one user action.
  if (outcome.succeeded.length > 0) {
    revalidatePath("/organizations")
  }

  return { success: true, ...outcome }
}

/**
 * Transfer many organizations to a new owner, best effort, one record at a time (BULK-03).
 *
 * Structurally the delete loop with the same verbatim ownership predicate and one addition: the TARGET
 * user is validated ONCE before any record is touched, against both not-deleted and approved. Both
 * predicates are load-bearing. Handing 100 records to a `rejected` or `pending_verification` user is a
 * data defect that NO per-record failure could ever report, because every write SUCCEEDS — the rows
 * simply land on a principal who cannot sign in. `src/app/deals/page.tsx:159-163` filters its owner
 * picker on the soft-delete column alone and is an anti-analog here, not a template.
 *
 * The write routes through `updateRecordOwnerByType`, never `updateOrganizationMutation({ ownerId })`:
 * `ownerId` is absent from `organizationSchema`, Zod strips unknown keys, and that call would write
 * only `updatedAt`, emit an empty diff and have the audit subscriber drop the row — a silent success
 * no-op.
 */
export async function bulkReassignOrganizationOwner(
  ids: string[],
  ownerId: string
): Promise<BulkWriteResult> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "not_authenticated" }
  }

  const uniqueIds = parseIdList(ids)

  if (!uniqueIds || uniqueIds.length === 0) {
    return { success: false, error: "no_selection" }
  }

  if (uniqueIds.length > BULK_MAX_IDS) {
    return { success: false, error: "too_many", max: BULK_MAX_IDS }
  }

  // Validated ONCE, before the loop and before any actor scope, never per record.
  const target = await db.query.users.findFirst({
    where: and(eq(users.id, ownerId), isNull(users.deletedAt), eq(users.status, "approved")),
  })

  if (!target) {
    return { success: false, error: "invalid_owner" }
  }

  // Same placement rule as the delete above: after the session check, once around the whole loop.
  const outcome = await runWithActor({ kind: "user", userId: session.user.id }, async () => {
    const succeeded: string[] = []
    const failed: BulkFailure[] = []

    for (const id of uniqueIds) {
      const organization = await db.query.organizations.findFirst({
        where: and(eq(organizations.id, id), isNull(organizations.deletedAt)),
      })

      if (!organization) {
        failed.push({ id, reason: "notFound" })
        continue
      }

      if (organization.ownerId !== session.user.id) {
        failed.push({ id, reason: "notPermitted" })
        continue
      }

      const result = await updateRecordOwnerByType("organization", id, ownerId, session.user.id)

      if (result.success) {
        succeeded.push(id)
      } else {
        failed.push({ id, reason: "unknown" })
      }
    }

    return { succeeded, failed }
  })

  if (outcome.succeeded.length > 0) {
    revalidatePath("/organizations")
  }

  return { success: true, ...outcome }
}

/**
 * Export exactly the selected organizations as CSV (BULK-04).
 *
 * THE SIGNATURE TAKES A LIST OF IDS AND NOTHING ELSE, and that is a security boundary rather than a
 * style preference (T-38-01). The only other export action in the repo is gated on the admin role and
 * accepts a whole options object; a NON-admin action that accepted the same object and received `{}`
 * would fetch every organization in the table — an admin-gate bypass reachable by anyone with a
 * session, because a server action is a POST endpoint and the caller controls the argument. Every
 * field of the fetch request is therefore a literal written here: the entity, the format and the
 * custom-field flag cannot be influenced from outside, and the only caller-supplied value is the id
 * list, which is narrowed, deduped and capped first. A comment-blind source gate in
 * `bulk-actions.test.ts` asserts this declaration never grows an options parameter.
 *
 * Any authenticated user may export their own selection; there is no admin gate on the SCOPED export.
 *
 * The filename is generated here rather than in `fetchFilteredData`, which keeps a widely shared
 * function untouched. Its slug is the English plural from that function's own mapping and is NEVER
 * translated: a locale-dependent name on disk is unsupportable, and the es-ES / pt-BR plurals carry
 * diacritics that survive round trips poorly. Its count comes from the fetch RESULT, not from the
 * submitted id count, so the name cannot disagree with the rows in the file — a row the caller
 * selected may have been trashed between the list render and the submit.
 */
export async function exportSelectedOrganizations(ids: string[]): Promise<ExportResult> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const uniqueIds = parseIdList(ids)

  if (!uniqueIds || uniqueIds.length === 0) {
    return { success: false, error: "No records selected" }
  }

  if (uniqueIds.length > BULK_MAX_IDS) {
    return { success: false, error: "Too many records" }
  }

  const result = await fetchFilteredData({
    entityType: "organization",
    format: "csv",
    includeCustomFields: true,
    filters: { ids: uniqueIds },
  })

  if (!result.success) {
    return result
  }

  const date = new Date().toISOString().split("T")[0]

  return { ...result, filename: `organizations-selected-${result.count}-${date}.csv` }
}
