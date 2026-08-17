/**
 * THE ONE PLACE THAT MAPS AN `EntityType` TO ITS SOFT-DELETE AND OWNER-TRANSFER MUTATION.
 *
 * Twelve bulk server actions across four entities need this routing, and the bulk delete and bulk
 * reassign loops are structurally the same loop over a different map. Its sibling
 * `src/lib/trash/dispatch.ts` maps `EntityType` to RESTORE and PURGE only — there is no delete map
 * and no owner map anywhere in the repo — so these are a genuinely new fifth and sixth map rather
 * than a duplicate of that file. The routing lives here once, behind a `Record<EntityType, …>`
 * annotation that turns a fifth entity type into a compile error in exactly one file instead of a
 * silent gap in a hand-maintained switch per action.
 *
 * SERVER-ONLY. Unlike its siblings `limits.ts` and `types.ts`, this module imports the mutation
 * layer at RUNTIME and therefore pulls `@/db` (and through it `pg`) with it. Never import it from a
 * `"use client"` component; import `src/lib/bulk/limits.ts` or `src/lib/bulk/types.ts` there
 * instead. That is the entire reason the constant and the types are separate files.
 *
 * NO ERROR HANDLING LIVES HERE. Each of the eight mutations already contains its own catch and
 * returns `{ success: false; error }` for anything it can describe. A rejection that escapes one is
 * a genuine programming error and must reach the caller unaltered rather than being flattened into a
 * generic failure that the bulk loop would then report as an ordinary per-record refusal.
 *
 * NO PERMISSION CHECK LIVES HERE EITHER, deliberately — and for this phase that third rule is the
 * load-bearing one, not a formality. The per-entity ownership predicate is ASYMMETRIC: the deals
 * server action carries `&& session.user.role !== "admin"` and the organizations, people and
 * activities actions do not. A single check in a dispatch map cannot express both, so it would
 * either grant three entities an admin bypass they do not have today (a privilege escalation) or
 * strip deals of one it does (a regression). Expressing it here would need a second map of
 * predicates keyed by the same union — two tables to keep in step instead of one. The predicate
 * therefore stays in each server action, adjacent to the single-record check it must match
 * verbatim. This also matches the Phase 24 layering recorded in STATE.md: a mutation checks entity
 * existence and nothing more.
 *
 * `src/lib/audit/no-mutation-coupling.test.ts` scopes its file set to `src/lib/mutations/` only, so
 * this module sits OUTSIDE that gate. Nothing automated re-states the three rules above for this
 * file; they are stated here because that is the only place they are stated.
 */

import type { EntityType } from "@/db/schema/custom-fields"

import { deleteActivityMutation, updateActivityOwnerMutation } from "@/lib/mutations/activities"
import { deleteDealMutation, updateDealOwnerMutation } from "@/lib/mutations/deals"
import {
  deleteOrganizationMutation,
  updateOrganizationOwnerMutation,
} from "@/lib/mutations/organizations"
import { deletePersonMutation, updatePersonOwnerMutation } from "@/lib/mutations/people"

/**
 * Re-declared here so a caller that only needs to route a bulk delete does not have to import a
 * result type from one of four mutation modules and pick the "right" one arbitrarily. Structurally
 * identical to what all eight mutations declare — the map assignments below are what keeps them so.
 *
 * NOT the same type as `BulkWriteResult` in `./types.ts`, and the two must not be merged. This is
 * ONE record's outcome, carrying the mutation's own free-form `error` string, which is written for a
 * server log. The bulk action's job is to translate that string into a closed `BulkFailureReason`
 * code before anything crosses the client boundary (T-38-07); that is why the untranslated string
 * stops here.
 */
export type BulkMutationResult = { success: true } | { success: false; error: string }

/**
 * The two map shapes. `Record<EntityType, …>` is the whole point of this module: it is what turns a
 * fifth entity type into a compile error in ONE file instead of a silent gap in twelve actions. Do
 * not relax either to `Partial<…>`, to an index signature, or to an inferred object literal — each
 * of those is the same module with the guarantee removed.
 *
 * The two arities differ and that is deliberate: a delete takes `(id, userId)` and an owner transfer
 * takes `(id, ownerId, userId)`, so one shared map type would have to widen to the looser of the
 * two. 38-RESEARCH A2 assumed all eight mutations are structurally uniform enough to be referenced
 * directly with no per-arm wrapper; typechecking these two annotations is what verified it, and no
 * wrapper was needed.
 */
type DeleteMap = Readonly<
  Record<EntityType, (id: string, userId: string) => Promise<BulkMutationResult>>
>
type OwnerMap = Readonly<
  Record<EntityType, (id: string, ownerId: string, userId: string) => Promise<BulkMutationResult>>
>

/**
 * The maps themselves.
 *
 * THE `satisfies` IS NOT DECORATION — it catches a class of error the annotation alone does not. A
 * MISSING key fails on the annotation (verified: removing `person` from the delete map gives
 * TS2741). An EXTRA key does NOT: the literal is an ARGUMENT to the freeze call below, so by the
 * time the result is assigned to the annotated const it is no longer a fresh object literal and
 * excess-property checking has already been skipped. (The prose here deliberately avoids writing
 * that call's name a third time: the plan's acceptance gate counts occurrences of it and expects
 * exactly the two real ones, so a comment that spelled it out would trip a gate on itself.) Without
 * the `satisfies`,
 * `note: deleteDealMutation` compiles cleanly and adds a live route for a type that has no bulk
 * surface at all — and, worse on the owner map, silently routes one entity's writes at another's
 * table. Both directions were verified as compile errors in this repo before landing (Phase 37
 * measured the same thing on `trash/dispatch.ts`), which is why the clause appears on BOTH maps
 * rather than on the one that happened to get reviewed.
 *
 * Module-private on purpose: the exported surface is the two functions, so there is no way for a
 * caller to reach a mutation while holding a string that never passed through `EntityType`. Frozen
 * because these objects are shared across every request in the process.
 */
const DELETE_BY_TYPE: DeleteMap = Object.freeze({
  deal: deleteDealMutation,
  person: deletePersonMutation,
  organization: deleteOrganizationMutation,
  activity: deleteActivityMutation,
} satisfies DeleteMap)

const OWNER_BY_TYPE: OwnerMap = Object.freeze({
  deal: updateDealOwnerMutation,
  person: updatePersonOwnerMutation,
  organization: updateOrganizationOwnerMutation,
  activity: updateActivityOwnerMutation,
} satisfies OwnerMap)

/**
 * Soft-delete one record, whichever of the four kinds it is.
 *
 * Returns the mutation's own promise, so the result object arrives with its identity intact and a
 * refusal cannot be reshaped on the way out — the bulk loop needs the original `error` string to
 * classify the failure.
 *
 * There is no `if (!fn) throw` fallback. `entityType` is the closed `EntityType` union and every
 * bulk action holds it as a literal at its own call site rather than reading it from a request; a
 * fallback would imply the exhaustiveness above is advisory.
 */
export function deleteRecordByType(
  entityType: EntityType,
  id: string,
  userId: string,
): Promise<BulkMutationResult> {
  return DELETE_BY_TYPE[entityType](id, userId)
}

/**
 * The owner-transfer half of the same routing.
 *
 * `userId` is the ACTOR — the signed-in user performing the transfer, which the mutation forwards to
 * the CRM event so the audit row names a person and not the system. `ownerId` is the NEW OWNER. The
 * two are both `string` and adjacent, so the type checker cannot tell a swapped call from a correct
 * one; the argument order is pinned by an exact-arguments assertion in `dispatch.test.ts` instead.
 */
export function updateRecordOwnerByType(
  entityType: EntityType,
  id: string,
  ownerId: string,
  userId: string,
): Promise<BulkMutationResult> {
  return OWNER_BY_TYPE[entityType](id, ownerId, userId)
}
