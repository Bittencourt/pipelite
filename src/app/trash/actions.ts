"use server"

/**
 * THE THREE BROWSER-FACING WRITES OF THE TRASH SURFACE (TRASH-02, TRASH-03).
 *
 * THIS FILE IS THE GATE. `trash-table.tsx` hides `Delete permanently` from a non-admin and hides
 * `Restore` from a record's non-owner, and NEITHER of those is a control. A server action is a
 * POST endpoint the browser can invoke directly with no page render involved — the same fact
 * `src/app/admin/audit/actions.ts:3-17` records about `/admin/*`, where a layout redirect protects
 * every page and no action. So each function below re-checks authorization against the session and
 * against the record it is about to act on, and the tests assert the ABSENCE of the mutation call
 * on every denial: a refusal returned after the write was issued would look identical from the
 * outside while the record had already come back.
 *
 * THE FAILURE VOCABULARY IS CODES, NOT PROSE. The client switches on `code` and string-matches
 * nothing, which is what lets the UI say `trash.error.alreadyPurged` for `NOT_IN_TRASH` and
 * `trash.error.purgeNotPermitted` for `NOT_ADMIN` — instead of telling a user to retry a record
 * that no longer exists, forever (37-RESEARCH § Pitfall 7). A driver's error string never crosses
 * this boundary.
 *
 * EVERY WRITE IS ATTRIBUTED. The mutation is wrapped in `runWithActor({ kind: "user", userId })`
 * with the id taken from the session and from nowhere else, and the scope opens AFTER the session
 * check so an unauthenticated call establishes no actor at all (T-37-08, § Pitfall 9). Without the
 * wrap the audit subscriber's documented `actor?.kind ?? "system"` fallback silently attributes
 * every restore and purge to the system.
 *
 * NOTHING HERE TRUSTS THE `tab` ARGUMENT. It is narrowed through the real `parseTrashTab` before
 * it indexes `TRASH_TAB_TO_ENTITY`, so a hostile string resolves to `deals` rather than reaching
 * an arbitrary table (T-37-03). The parameter is typed `TrashTab` for the UI's benefit; a type is
 * not a runtime control on a value that arrived over the wire.
 */

import { revalidatePath } from "next/cache"

import { auth } from "@/auth"
import type { EntityType } from "@/db/schema/custom-fields"
import { runWithActor } from "@/lib/audit/actor-context"
import { purgeRecordByType, restoreRecordByType } from "@/lib/trash/dispatch"
import { parseTrashTab, TRASH_TAB_TO_ENTITY, type TrashTab } from "@/lib/trash/entity-types"
import { findTrashedParents, findTrashedRecord } from "@/lib/trash/queries"

const LOG_PREFIX = "[trash-actions]"

/**
 * Why a record was refused. Five codes, each of which the UI turns into a different sentence:
 *
 *   NOT_AUTHENTICATED — no session at all.
 *   NOT_AUTHORIZED    — a signed-in member acting on someone else's record.
 *   NOT_ADMIN         — a purge attempted by anyone who is not an admin.
 *   NOT_IN_TRASH      — the record is live, was already restored, or was purged in another tab.
 *                       The UI pairs this with `router.refresh()`, not with "try again".
 *   FAILED            — anything else. Deliberately opaque: the mutation's own message may name a
 *                       constraint or a table and none of that belongs in a browser.
 */
export type TrashErrorCode =
  | "NOT_AUTHENTICATED"
  | "NOT_AUTHORIZED"
  | "NOT_ADMIN"
  | "NOT_IN_TRASH"
  | "FAILED"

/** Every action returns this shape; `T` is the per-action success payload. */
export type TrashActionResult<T = Record<string, never>> =
  | ({ success: true } & T)
  | { success: false; code: TrashErrorCode }

/** The session fields the guards below read. Nothing else about the user is consulted. */
interface Caller {
  userId: string
  role: string | null | undefined
}

/**
 * The owner-or-admin refusal, in the exact shape `src/app/deals/actions.ts:83` writes inline:
 * `record.ownerId !== session.user.id && session.user.role !== "admin"`.
 *
 * Written ONCE as a function rather than copied to the three sites that need it, because the
 * linked path applies it per PARENT as well as to the record, and Phase 35 recorded what happens
 * to a hand-copied ownership comparison: three sites in `src/app/organizations/actions.ts` drifted,
 * which is why `isAuthorOrAdmin` exists. The negated form is kept so the predicate reads the same
 * here as it does at every other guard in the codebase.
 */
function notOwnerOrAdmin(caller: Caller, ownerId: string): boolean {
  return ownerId !== caller.userId && caller.role !== "admin"
}

/** `NOT_IN_TRASH` is the one mutation failure the UI must be able to tell apart. */
function toErrorCode(error: string): TrashErrorCode {
  return error === "NOT_IN_TRASH" ? "NOT_IN_TRASH" : "FAILED"
}

/**
 * Restore one trashed record.
 *
 * Non-destructive, so there is no confirmation dialog above it — but "non-destructive" is not
 * "unauthorized": restoring another user's record puts data back into a list they own, and the
 * only thing separating one user's trash from another's is this check.
 */
export async function restoreRecord(
  tab: TrashTab,
  id: string
): Promise<TrashActionResult<{ name: string; tab: TrashTab }>> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, code: "NOT_AUTHENTICATED" }
  }

  const caller: Caller = { userId: session.user.id, role: session.user.role }

  // Narrowed FIRST, so no unnarrowed argument ever indexes the entity map.
  const trashTab = parseTrashTab(tab)
  const entityType = TRASH_TAB_TO_ENTITY[trashTab]

  const record = await findTrashedRecord(entityType, id)
  if (!record) {
    // Live, missing, or already purged — one answer, because none of the three is restorable and
    // distinguishing them here would build an existence oracle out of the difference.
    return { success: false, code: "NOT_IN_TRASH" }
  }

  if (notOwnerOrAdmin(caller, record.ownerId)) {
    return { success: false, code: "NOT_AUTHORIZED" }
  }

  const result = await runWithActor({ kind: "user", userId: caller.userId }, () =>
    restoreRecordByType(entityType, id)
  )

  if (!result.success) {
    return { success: false, code: toErrorCode(result.error) }
  }

  revalidatePath("/trash")

  // The name and the tab are what let the toast say WHICH list the record went back to — a row
  // vanishing from trash is otherwise ambiguous between restored and destroyed.
  return { success: true, name: record.name, tab: trashTab }
}

/**
 * Restore a record together with every one of its parents that is also in trash.
 *
 * THE PARENT LIST IS DERIVED ON THE SERVER, from the record's id, by `findTrashedParents`. Taking
 * it from the client would be taking a client-supplied list of records to WRITE, and re-checking
 * the clicked record would say nothing about the other ids in that list.
 *
 * PARENTS FIRST, OUTERMOST FIRST — organization before person before deal, which is exactly
 * `TRASH_PARENTS` order. `cascadeToChildren` in the formula engine filters on the child relation's
 * null `deleted_at`, so a parent restored AFTER its child means the child's cascade ran while the
 * parent was still trashed and the child's rollups are wrong until something else touches them.
 *
 * A PARENT THE CALLER MAY NOT TOUCH IS SKIPPED, not fatal. The record they actually clicked should
 * still come back; a member whose deal hangs off a colleague's organization is the common case, not
 * an attack. The skipped parent is excluded from `count`, so the toast never claims more records
 * came back than actually did (T-37-28).
 */
export async function restoreWithLinked(
  tab: TrashTab,
  id: string
): Promise<TrashActionResult<{ name: string; tab: TrashTab; count: number }>> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, code: "NOT_AUTHENTICATED" }
  }

  const caller: Caller = { userId: session.user.id, role: session.user.role }

  const trashTab = parseTrashTab(tab)
  const entityType = TRASH_TAB_TO_ENTITY[trashTab]

  const record = await findTrashedRecord(entityType, id)
  if (!record) {
    return { success: false, code: "NOT_IN_TRASH" }
  }

  if (notOwnerOrAdmin(caller, record.ownerId)) {
    // Resolved before the parents are even looked up: which ancestors of a record are in trash is
    // itself information about records this caller may not see.
    return { success: false, code: "NOT_AUTHORIZED" }
  }

  const parents = await findTrashedParents(entityType, id)

  const skipped: string[] = []
  const failed: string[] = []

  const outcome = await runWithActor({ kind: "user", userId: caller.userId }, async () => {
    let restoredParents = 0

    for (const parent of parents) {
      // Re-checked per parent against the PARENT's own owner. The record the user clicked confers
      // no authority over the records it happens to point at (T-37-02).
      if (notOwnerOrAdmin(caller, parent.ownerId)) {
        skipped.push(`${parent.entityType}:${parent.id}`)
        continue
      }

      const parentResult = await restoreRecordByType(parent.entityType, parent.id)

      if (parentResult.success) {
        restoredParents += 1
      } else {
        failed.push(`${parent.entityType}:${parent.id}`)
      }
    }

    // The record itself LAST, inside the same actor scope.
    return { restoredParents, record: await restoreRecordByType(entityType, id) }
  })

  if (skipped.length > 0 || failed.length > 0) {
    // Identifiers and counts only, never record contents — the rule `formula-recalc.ts:927`
    // established for this codebase (T-37-27).
    console.error(
      `${LOG_PREFIX} restoreWithLinked ${entityType} ${id}: skipped ${skipped.length} ` +
        `[${skipped.join(", ")}], failed ${failed.length} [${failed.join(", ")}]`
    )
  }

  if (!outcome.record.success) {
    // The clicked record did not come back. Whatever happened to its parents, this is a failure
    // from the user's position, and the code has to survive so the UI can refresh a stale row.
    return { success: false, code: toErrorCode(outcome.record.error) }
  }

  revalidatePath("/trash")

  return {
    success: true,
    name: record.name,
    tab: trashTab,
    count: outcome.restoredParents + 1,
  }
}

/**
 * Destroy a trashed record permanently. ADMIN ONLY (TRASH-03).
 *
 * The role check is the FIRST thing after the session check and comes BEFORE any lookup, so a
 * non-admin cannot use this action to learn whether an id exists: every id, real or invented,
 * returns `NOT_ADMIN` after zero database reads.
 *
 * No owner check is layered on top — an admin may purge any record. What stops a guessed id
 * destroying a LIVE record is the `isNotNull(deletedAt)` predicate, applied independently by
 * `findTrashedRecord` here and again inside the purge mutation itself (T-37-15).
 */
export async function purgeRecord(
  tab: TrashTab,
  id: string
): Promise<TrashActionResult<{ name: string; detached: number }>> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, code: "NOT_AUTHENTICATED" }
  }

  if (session.user.role !== "admin") {
    return { success: false, code: "NOT_ADMIN" }
  }

  const trashTab = parseTrashTab(tab)
  const entityType: EntityType = TRASH_TAB_TO_ENTITY[trashTab]

  const record = await findTrashedRecord(entityType, id)
  if (!record) {
    return { success: false, code: "NOT_IN_TRASH" }
  }

  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    purgeRecordByType(entityType, id)
  )

  if (!result.success) {
    return { success: false, code: toErrorCode(result.error) }
  }

  revalidatePath("/trash")

  // `detached` is the count of LIVE children the purge unlinked rather than destroyed. The dialog
  // promised the change history survives; the count is what the toast can honestly add.
  return { success: true, name: record.name, detached: result.detached }
}
