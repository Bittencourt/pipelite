/**
 * THE SAVED-VIEW TYPE VOCABULARY.
 *
 * TYPE-ONLY, WITH ZERO RUNTIME IMPORTS AND ZERO RUNTIME EXPORTS. Everything here is erased at
 * compile time, so this module can be imported by the four server components that read views, by
 * the server actions that write them, AND by the three `"use client"` components that render them,
 * without dragging `@/db` (and through it `pg`) into a browser bundle. The
 * `src/lib/trash/entity-types.ts` header states the same constraint for the same reason; the rule
 * is inherited, not invented here.
 *
 * `SavedViewsBarProps` is DECLARED HERE rather than in `saved-views-bar.tsx` on purpose. The server
 * resolver (plan 40-05) returns exactly this shape, so if the interface lived in the client
 * component a server import graph would have to reach into a `"use client"` module to name its own
 * return type. Declaring it here means there is ONE declaration of the eight props instead of two
 * that can drift, and it is the file V-40-5's parsed-interface gate reads.
 */
import type { EntityType } from "@/db/schema/custom-fields"

/**
 * The entity types that have saved views: all four.
 *
 * An ALIAS, not a new union. `EntityType` is already the app's closed set of entity types, and
 * restating the four literals here would create a second list to keep in sync — the `dedup-scans`
 * precedent, where the discriminator is typed from this same import.
 */
export type ViewEntityType = EntityType

/**
 * A view's stored filter set: the URL param map, flat and stringly typed.
 *
 * This is what lands in the JSONB `filters` column, so it is UNTRUSTED ON READ as well as on
 * write — a blob written months ago by an older whitelist is attacker-adjacent input the moment it
 * comes back out. `pickFilterParams` in `./url-params` is what makes it safe, in both directions.
 */
export type ViewFilters = Record<string, string>

/** One row of the picker and one row of the manage dialog, fully resolved server-side. */
export interface SavedViewSummary {
  id: string
  name: string
  entityType: ViewEntityType
  filters: ViewFilters
  isShared: boolean
  isOwnedByViewer: boolean
  isDefaultForViewer: boolean
  /**
   * `user.name || user.email`, resolved SERVER-side (V-5), and `null` ONLY when the owner row is
   * soft-deleted — which is the case that selects `views.ownerUnavailable` rather than
   * `views.ownedBy`. Both branches are live in this deployment: two of the three active users have
   * `name = NULL`, so the `||` is exercised rather than theoretical, and six users are
   * soft-deleted. A uuid or a blank must never reach the UI.
   */
  ownerLabel: string | null
  ownerIsInactive: boolean
  /** `countFilters(entityType, filters)` — the number `views.manage.filterCount` renders (G-3). */
  filterCount: number
  canEdit: boolean
}

/**
 * The bar derives NOTHING — B-2, exactly these eight props in exactly this order.
 *
 * `isModified` and `droppedFilterKeys` are the reason this is a rule rather than a preference: both
 * manifest as "the URL differs from the stored blob", and only the server knows which one it is. A
 * client comparing the two would label every DEGRADED view "Modified" and invite the user to save
 * the damage.
 */
export interface SavedViewsBarProps {
  entityType: ViewEntityType
  /** Already scoped to what this viewer may see — a private view of someone else's never appears. */
  views: SavedViewSummary[]
  /** Resolved server-side by comparing the URL params to each stored filter set. */
  selectedViewId: string | null
  isModified: boolean
  /** Which stored keys the read-side validator dropped, i.e. why `views.degraded` renders. */
  droppedFilterKeys: string[]
  /** `hasSaveableFilter(entityType, params)`. */
  canSave: boolean
  /** `hasExportableFilter(entityType, params)` — NOT `canSave`; see E-2 and `./url-params`. */
  canExport: boolean
  /** Owner-or-admin on the selected view. */
  canUpdateSelected: boolean
}
