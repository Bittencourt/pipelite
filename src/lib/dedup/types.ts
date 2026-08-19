/**
 * The closed vocabulary of duplicate detection.
 *
 * DATABASE-FREE ON PURPOSE, following `src/lib/trash/entity-types.ts`: this module imports one
 * TYPE from the schema and nothing at runtime, so it can be imported from a server component, a
 * server action AND a `"use client"` component without dragging `@/db` (and through it `pg`) into
 * a browser bundle.
 */
import type { EntityType } from "@/db/schema/custom-fields"

/**
 * How much confidence a reported pair carries.
 *
 * `certain` means an identity field agrees (an e-mail address for a person; the admin-configured
 * identity custom field for an organization) ON TOP of an equal normalized name. `likely` means
 * the names alone are close enough. There is deliberately no third, weaker tier: 39-RESEARCH
 * measured that name-similarity alone already yields 1,030,436 organization pairs, and anything
 * looser than that is noise a human cannot triage.
 */
export type DedupTier = "certain" | "likely"

/**
 * Why a pair was reported. These four map 1:1 onto the `dedup.reason.*` message keys.
 *
 * `nameIdentity` — NOT `nameDomain`. The originally locked organization rule was "identical
 * normalized name + identical website domain"; 39-RESEARCH measured `website` as NULL on all
 * 46,054 organizations, so the domain conjunct was superseded by an admin-configured identity
 * custom field (39-CONTEXT § Post-Research Decisions). The old name must not reappear anywhere.
 */
export type DedupReason = "email" | "nameIdentity" | "similarName" | "similarNamePhone"

/**
 * Lifecycle of a row in `duplicate_pairs`.
 *
 * `superseded` exists so a rescan can retire a pair whose records have since changed without
 * destroying the audit trail of a human having already looked at it.
 */
export type DuplicatePairStatus = "open" | "dismissed" | "merged" | "superseded"

/**
 * The two entity types that can be merged.
 *
 * Derived from the imported `EntityType` with `Extract` rather than restated as its own union
 * (S-8): renaming or removing a member of `EntityType` is then a compile error here instead of a
 * silent divergence. Deals and activities are excluded because neither has a duplicate concept —
 * activities hang off deals and follow them automatically (39-CONTEXT § Relationship Map).
 */
export type MergeableEntityType = Extract<EntityType, "organization" | "person">
