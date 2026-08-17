"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { people, users } from "@/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { runWithActor } from "@/lib/audit/actor-context"
import { deleteRecordByType, updateRecordOwnerByType } from "@/lib/bulk/dispatch"
import { BULK_MAX_IDS } from "@/lib/bulk/limits"
import type { BulkFailure, BulkWriteResult } from "@/lib/bulk/types"
import { fetchFilteredData } from "@/lib/export/formatters"
import type { ExportResult } from "@/lib/export/types"
import {
  createPersonMutation,
  updatePersonMutation,
  deletePersonMutation,
  personSchema,
  updatePersonSchema,
} from "@/lib/mutations/people"

/**
 * Create a new person (contact)
 */
export async function createPerson(
  data: z.infer<typeof personSchema>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // The actor scope opens AFTER the session check above, never before it, so an
  // unauthenticated call establishes no actor at all (T-36-02). `userId` is
  // `session.user.id` and nothing else — never a form field, never a search param.
  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    createPersonMutation({
      ...data,
      userId: session.user.id,
    })
  )

  if (!result.success) {
    return result
  }

  revalidatePath("/people")
  const organizationId = data.organizationId || null
  if (organizationId) {
    revalidatePath(`/organizations/${organizationId}`)
  }

  return { success: true, id: result.id }
}

/**
 * Update an existing person
 */
export async function updatePerson(
  id: string,
  data: z.infer<typeof updatePersonSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Auth check: verify ownership
  const person = await db.query.people.findFirst({
    where: and(eq(people.id, id), isNull(people.deletedAt)),
  })

  if (!person) {
    return { success: false, error: "Person not found" }
  }

  if (person.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    updatePersonMutation(id, data, session.user.id)
  )

  if (result.success) {
    revalidatePath("/people")
    revalidatePath(`/people/${id}`)

    // Revalidate old org path if person was linked to one
    if (person.organizationId) {
      revalidatePath(`/organizations/${person.organizationId}`)
    }
    // Revalidate new org path if changed
    const newOrgId = data.organizationId !== undefined
      ? (data.organizationId || null)
      : undefined
    if (newOrgId && newOrgId !== person.organizationId) {
      revalidatePath(`/organizations/${newOrgId}`)
    }
  }

  return result
}

/**
 * Delete a person (soft delete)
 */
export async function deletePerson(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Auth check: verify ownership
  const person = await db.query.people.findFirst({
    where: and(eq(people.id, id), isNull(people.deletedAt)),
  })

  if (!person) {
    return { success: false, error: "Person not found" }
  }

  if (person.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    deletePersonMutation(id, session.user.id)
  )

  if (result.success) {
    revalidatePath("/people")
    if (person.organizationId) {
      revalidatePath(`/organizations/${person.organizationId}`)
    }
  }

  return result
}

/**
 * THE `ids` ARGUMENT IS NARROWED AT RUNTIME, for the reason `parseRecordId` states in
 * `src/app/trash/actions.ts`: a server action is a POST endpoint, so `ids: string[]` is an
 * annotation and not a control. A caller can send a number, `null`, an object or an array of
 * objects, and each element would otherwise flow straight into `eq(people.id, id)`.
 *
 * A bare shape test, not a UUID pattern — the same trade-off recorded there. The 64-character
 * ceiling stops a megabyte string being carried into a query and a log line; the non-empty test
 * stops `""`, which is a legal `string` and matches nothing.
 *
 * Dedupes as it goes, so the caller receives the list the loop will actually iterate. Three copies
 * of one id must produce ONE write, not three: the mutation layer would happily soft-delete the
 * same record three times and emit three CRM events for it.
 *
 * Returns `null` for a malformed argument, which every caller maps to `no_selection` — the same
 * refusal an empty array gets, because "we cannot tell what you selected" and "you selected
 * nothing" are the same outcome from the browser's point of view, and neither may widen into
 * "everything".
 */
const MAX_BULK_ID_LENGTH = 64

function parseBulkIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null

  const unique = new Set<string>()
  for (const value of raw) {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_BULK_ID_LENGTH) {
      return null
    }
    unique.add(value)
  }

  return Array.from(unique)
}

/**
 * Soft-delete many people, best-effort and per record (BULK-02).
 *
 * NOT ONE TRANSACTION, and that is the whole design. A single aborting transaction structurally
 * cannot name WHICH record failed, and naming them is the requirement (SC-3) — so the loop is
 * sequential, never breaks and never throws, and returns `{ succeeded, failed }` with a closed
 * reason code per failure.
 *
 * THE OWNERSHIP PREDICATE BELOW IS COPIED VERBATIM FROM `deletePerson` ABOVE, WITH NO ADMIN BYPASS.
 * Only `src/app/deals/actions.ts` carries the extra role clause; organizations, people and
 * activities do not. Adding one here would be a privilege escalation shipped as a bulk feature, and
 * `bulk-actions.test.ts` has a case that fails if anyone does.
 *
 * FAN-OUT, stated because it is easy to miss: 100 deletes means 100 webhook deliveries, 100
 * workflow-trigger evaluations and 100 audit inserts against a connection pool of 10. That is
 * correct semantics — N deletes genuinely are N events — and it is why the loop stays sequential and
 * why a full-cap delete takes seconds rather than milliseconds.
 */
export async function bulkDeletePeople(ids: string[]): Promise<BulkWriteResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "not_authenticated" }
  }

  // The actor scope opens AFTER this check, never before it, so an unauthenticated call establishes
  // no actor at all (T-36-02).
  const uniqueIds = parseBulkIds(ids)
  if (!uniqueIds || uniqueIds.length === 0) {
    return { success: false, error: "no_selection" }
  }

  // The bulk bar mirrors this cap, but a client-side cap is a hint, not a control.
  if (uniqueIds.length > BULK_MAX_IDS) {
    return { success: false, error: "too_many", max: BULK_MAX_IDS }
  }

  const actorId = session.user.id

  const outcome = await runWithActor({ kind: "user", userId: actorId }, async () => {
    const succeeded: string[] = []
    const failed: BulkFailure[] = []

    for (const id of uniqueIds) {
      const person = await db.query.people.findFirst({
        where: and(eq(people.id, id), isNull(people.deletedAt)),
      })

      if (!person) {
        // Already-trashed rows do not match this read, so they arrive here as `notFound`. Telling
        // the two apart would cost a second query per id purely for a nicer label (38-RESEARCH A6).
        failed.push({ id, reason: "notFound" })
        continue
      }

      if (person.ownerId !== session.user.id) {
        failed.push({ id, reason: "notPermitted" })
        continue
      }

      const result = await deleteRecordByType("person", id, actorId)
      if (result.success) {
        succeeded.push(id)
      } else {
        // The mutation's own message is written for a server log and may name a table or a
        // constraint, so it stops here and the client sees a code (T-38-07).
        failed.push({ id, reason: "unknown" })
      }
    }

    return { succeeded, failed }
  })

  if (outcome.succeeded.length > 0) {
    revalidatePath("/people")
  }

  return { success: true, ...outcome }
}

/**
 * Transfer many people to one new owner, best-effort and per record (BULK-03).
 *
 * The same seven steps as `bulkDeletePeople` plus one: the TARGET USER is validated exactly ONCE,
 * before the actor scope opens, against not-deleted AND approved. Both predicates are load-bearing.
 * Handing 100 records to a rejected or unverified account is a data defect that no per-record
 * failure could ever report, because each individual write succeeds (T-38-06). `deals/page.tsx`'s
 * `allUsers` query filters on the deletion timestamp alone and is deliberately NOT the analog here.
 *
 * Routed through `updateRecordOwnerByType`, never through `updatePersonMutation`: `ownerId` is
 * absent from `personSchema`, Zod strips unknown keys, so that call would write only the update
 * timestamp, emit an empty diff and leave no audit row behind — a silent success that writes nothing
 * (T-38-09).
 */
export async function bulkReassignPersonOwner(
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

  const targetOwnerId =
    typeof ownerId === "string" && ownerId.length > 0 && ownerId.length <= MAX_BULK_ID_LENGTH
      ? ownerId
      : null

  const targetOwner = targetOwnerId
    ? await db.query.users.findFirst({
        where: and(
          eq(users.id, targetOwnerId),
          isNull(users.deletedAt),
          eq(users.status, "approved")
        ),
      })
    : undefined

  if (!targetOwner) {
    return { success: false, error: "invalid_owner" }
  }

  const actorId = session.user.id

  const outcome = await runWithActor({ kind: "user", userId: actorId }, async () => {
    const succeeded: string[] = []
    const failed: BulkFailure[] = []

    for (const id of uniqueIds) {
      const person = await db.query.people.findFirst({
        where: and(eq(people.id, id), isNull(people.deletedAt)),
      })

      if (!person) {
        failed.push({ id, reason: "notFound" })
        continue
      }

      if (person.ownerId !== session.user.id) {
        failed.push({ id, reason: "notPermitted" })
        continue
      }

      // Argument order: record, NEW owner, ACTOR. All three are strings, so a swapped pair
      // typechecks perfectly and would attribute the audit row to the wrong person.
      const result = await updateRecordOwnerByType("person", id, targetOwner.id, actorId)
      if (result.success) {
        succeeded.push(id)
      } else {
        failed.push({ id, reason: "unknown" })
      }
    }

    return { succeeded, failed }
  })

  if (outcome.succeeded.length > 0) {
    revalidatePath("/people")
  }

  return { success: true, ...outcome }
}

/**
 * Export exactly the selected people as CSV (BULK-04).
 *
 * THE PARAMETER LIST IS ONE LIST OF IDS AND NOTHING ELSE, AND THAT IS THE SECURITY CONTROL.
 *
 * The only other export action in the repo, in `src/app/admin/export/actions.ts`, is gated on the
 * caller being an administrator and takes a whole options object. Modelling this one on it would be
 * an admin-gate bypass: an authenticated member could hand it an empty filter object and receive
 * every person in the table (T-38-01). So no options argument exists to hand it. Every field of the
 * request below is a literal written here, on the server, and an empty selection is refused rather
 * than being allowed to widen into "everything".
 *
 * The filename is rewritten here rather than inside the shared fetch helper, which several other
 * surfaces depend on. Its `people` slug is the untranslated English plural the helper's own mapping
 * already uses — a locale-dependent name on disk is unsupportable — and the number in it comes from
 * the RESULT's row count, never from the length of the submitted list, so the name and the file's
 * contents cannot disagree.
 */
export async function exportSelectedPeople(ids: string[]): Promise<ExportResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Any signed-in user may export their OWN selection; the scoped export carries no further gate,
  // because the selection is what scopes it.
  const uniqueIds = parseBulkIds(ids)
  if (!uniqueIds || uniqueIds.length === 0) {
    return { success: false, error: "No records selected" }
  }

  if (uniqueIds.length > BULK_MAX_IDS) {
    return { success: false, error: "Too many records" }
  }

  const result = await fetchFilteredData({
    entityType: "person",
    format: "csv",
    includeCustomFields: true,
    filters: { ids: uniqueIds },
  })

  if (!result.success) {
    return result
  }

  const date = new Date().toISOString().split("T")[0]

  return { ...result, filename: `people-selected-${result.count}-${date}.csv` }
}
