/**
 * THE ONE PLACE THAT MAPS AN `EntityType` TO ITS RESTORE AND PURGE MUTATION.
 *
 * Three unrelated callers need this routing and each of them would otherwise grow its own
 * four-arm switch: `restoreWithLinked` restores a record together with its parents, which are of
 * DIFFERENT entity types; the retention pruner walks all four types in `TRASH_PRUNE_ORDER`; the
 * REST routes take the type as a path segment. Three hand-maintained copies of the same switch is
 * how one of them silently drifts when a fifth entity type appears — so the routing lives here
 * once, behind a `Record<EntityType, …>` annotation that turns that drift into a compile error in
 * exactly one file.
 *
 * SERVER-ONLY. Unlike its sibling `entity-types.ts`, this module imports the mutation layer at
 * RUNTIME and therefore pulls `@/db` (and through it `pg`) with it. Never import it from a
 * `"use client"` component; import `entity-types.ts` there instead.
 *
 * NO ERROR HANDLING LIVES HERE. Each mutation already contains its own catch and returns
 * `{ success: false; error }` for anything it can describe. A rejection that escapes one is a
 * genuine programming error and must reach the caller unaltered rather than being flattened into
 * a generic failure that looks like an ordinary refusal.
 *
 * NO PERMISSION CHECK LIVES HERE EITHER, deliberately. Admin gating on purge, and ownership on
 * restore, belong to the server action (37-07) and the REST route (37-11) — the boundaries that
 * actually hold a caller identity. This matches the Phase 24 decision recorded in STATE.md that
 * mutations check entity existence and nothing more. Adding a second check here would create two
 * places to audit and one to forget, and would give a false sense that the mutation layer is
 * itself guarded. Leave that gate where it is.
 */

import type { EntityType } from "@/db/schema/custom-fields"

import { purgeActivityMutation, restoreActivityMutation } from "@/lib/mutations/activities"
import { purgeDealMutation, restoreDealMutation } from "@/lib/mutations/deals"
import {
  purgeOrganizationMutation,
  restoreOrganizationMutation,
} from "@/lib/mutations/organizations"
import { purgePersonMutation, restorePersonMutation } from "@/lib/mutations/people"

/**
 * Re-declared here so a caller that only needs to route a restore does not have to import a result
 * type from one of four mutation modules and pick the "right" one arbitrarily. Structurally
 * identical to what all four `restore*Mutation` functions declare — the map assignments below are
 * what keeps them so.
 *
 * The failure's `error` carries the discriminated code `"NOT_IN_TRASH"` for an already-purged or
 * already-restored record; callers switch on it rather than matching prose.
 */
export type RestoreResult = { success: true } | { success: false; error: string }

/** As above, plus the count of live children a purge unlinked rather than destroyed. */
export type PurgeResult =
  | { success: true; detached: number }
  | { success: false; error: string }

/**
 * The two map shapes. `Record<EntityType, …>` is the whole point of this module: it is what turns
 * a fifth entity type into a compile error in ONE file instead of a silent gap in three switches.
 * Do not relax either to `Partial<…>`, to an index signature, or to an inferred object literal —
 * each of those is the same module with the guarantee removed.
 */
type RestoreMap = Readonly<Record<EntityType, (id: string) => Promise<RestoreResult>>>
type PurgeMap = Readonly<Record<EntityType, (id: string) => Promise<PurgeResult>>>

/**
 * The maps themselves.
 *
 * THE `satisfies` IS NOT DECORATION — it catches a class of error the annotation alone does not.
 * A MISSING key fails on the annotation (verified: removing `person` gives TS2741). An EXTRA key
 * does NOT: the literal is an argument to `Object.freeze`, so by the time the result is assigned to
 * the annotated const it is no longer a fresh literal and excess-property checking has been
 * skipped. Without the `satisfies`, `note: purgeDealMutation` compiles cleanly and adds a live
 * route to a table that has no trash surface at all. Verified both directions before landing.
 *
 * Module-private on purpose: the exported surface is the two functions, so there is no way for a
 * caller to reach a mutation while holding a string that never passed through `EntityType`.
 * Frozen because these objects are shared across every request in the process.
 */
const RESTORE_BY_TYPE: RestoreMap = Object.freeze({
  deal: restoreDealMutation,
  person: restorePersonMutation,
  organization: restoreOrganizationMutation,
  activity: restoreActivityMutation,
} satisfies RestoreMap)

const PURGE_BY_TYPE: PurgeMap = Object.freeze({
  deal: purgeDealMutation,
  person: purgePersonMutation,
  organization: purgeOrganizationMutation,
  activity: purgeActivityMutation,
} satisfies PurgeMap)

/**
 * Restore one trashed record, whichever of the four kinds it is.
 *
 * Returns the mutation's own promise, so the result object arrives with its identity intact and a
 * `"NOT_IN_TRASH"` refusal cannot be reshaped on the way out.
 *
 * There is no `if (!fn) throw` fallback. `entityType` is the closed `EntityType` union and every
 * untrusted value narrows through `parseTrashTab` or `isTrashEntityType` before it gets here
 * (T-37-03); a fallback would imply the exhaustiveness above is advisory.
 */
export function restoreRecordByType(entityType: EntityType, id: string): Promise<RestoreResult> {
  return RESTORE_BY_TYPE[entityType](id)
}

/** The purge half of the same routing, forwarding the `detached` count untouched. */
export function purgeRecordByType(entityType: EntityType, id: string): Promise<PurgeResult> {
  return PURGE_BY_TYPE[entityType](id)
}
