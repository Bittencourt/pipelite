/**
 * The closed vocabulary of the trash surface.
 *
 * DATABASE-FREE ON PURPOSE. This module imports one TYPE from the schema and nothing else at
 * runtime, so it can be imported from a server component, a server action, a `/api/v1` route
 * handler AND a `"use client"` component without dragging `@/db` (and through it `pg`) into a
 * browser bundle. Any runtime import added here is pulled into all four. Keep it that way.
 *
 * Two vocabularies live here and they are deliberately NOT the same strings:
 *
 *   - the PLURAL tab values (`deals`, `people`, …) are what appears in `?type=`, is typed by a
 *     user and is therefore attacker-controlled;
 *   - the SINGULAR `EntityType` literals (`deal`, `person`, …) are what reaches the database.
 *
 * Everything between the two is a lookup in a frozen map, never a string transform, so there is
 * no code path where an arbitrary URL fragment becomes an entity type by concatenation or by
 * stripping a trailing "s".
 */
import type { EntityType } from "@/db/schema/custom-fields"

/**
 * The four tabs, in display order. This array IS the `?type=` allow-list; `TrashTab` is derived
 * from it rather than declared alongside it so the two can never drift.
 */
export const TRASH_TABS = ["deals", "people", "organizations", "activities"] as const

export type TrashTab = (typeof TRASH_TABS)[number]

/** The tab the surface falls back to for an absent, repeated or unrecognised `?type=`. */
const DEFAULT_TRASH_TAB: TrashTab = "deals"

/**
 * Plural tab → singular entity type.
 *
 * `satisfies Record<TrashTab, EntityType>` via the annotation: a fifth tab, or a renamed
 * `EntityType` member, is a compile error here rather than a silent gap at the query layer.
 * Frozen because this object is module-shared across every request in the process.
 */
export const TRASH_TAB_TO_ENTITY: Readonly<Record<TrashTab, EntityType>> = Object.freeze({
  deals: "deal",
  people: "person",
  organizations: "organization",
  activities: "activity",
})

/** The exact inverse, for turning a query result's entity type back into a tab link. */
export const ENTITY_TO_TRASH_TAB: Readonly<Record<EntityType, TrashTab>> = Object.freeze({
  deal: "deals",
  person: "people",
  organization: "organizations",
  activity: "activities",
})

/**
 * The order the purge cascade walks the four tables — LEAVES FIRST, and fixed.
 *
 * An activity hangs off a deal, a deal off an organization and a person, a person off an
 * organization. Purging a parent while a later pass is still detaching children from it would
 * either violate a foreign key or orphan rows depending on which constraint fires first, so the
 * order is part of the contract and not an implementation detail. It is written as a literal
 * array rather than derived from `Object.keys(TRASH_PARENTS)`, because key order would make a
 * correctness property depend on the incidental order somebody typed an object literal in
 * (37-CONTEXT § Purge Cascade).
 */
export const TRASH_PRUNE_ORDER = [
  "activity",
  "deal",
  "person",
  "organization",
] as const satisfies readonly EntityType[]

/**
 * Which parents each entity's "linked record in trash" badge must check.
 *
 * Fixed and exhaustive, from 37-UI-SPEC § "The linked-in-trash flag". `organization` has an
 * EMPTY list and that is load-bearing: the badge must never render on the Organizations tab,
 * and an empty array says so in one place instead of every caller remembering to skip it.
 */
export const TRASH_PARENTS: Readonly<Record<EntityType, readonly EntityType[]>> = Object.freeze({
  deal: Object.freeze(["organization", "person"] as const),
  person: Object.freeze(["organization"] as const),
  activity: Object.freeze(["deal"] as const),
  organization: Object.freeze([] as const),
})

/**
 * Next.js hands a repeated search param (`?type=a&type=b`) back as an array. Take the first
 * value and let it face the same allow-list as any other; an array is never itself a valid
 * param value.
 */
function firstParam(raw: string | string[] | null | undefined): string | undefined {
  if (Array.isArray(raw)) return raw[0]
  return raw ?? undefined
}

/**
 * THE INPUT-VALIDATION CONTROL FOR THE TRASH SURFACE (T-37-03).
 *
 * `?type=` selects which table is read, so it reaches a SQL predicate. This function is what
 * guarantees it cannot get there as an arbitrary string: the raw value is compared against the
 * four `TRASH_TABS` literals by identity and ANYTHING else — a near-miss like `deal`, a
 * wrong-case `DEALS`, a path fragment, a SQL fragment — becomes `"deals"`. It never normalises,
 * lowercases or trims its way to a match, because a parser that repairs input is a parser that
 * can be steered.
 *
 * The narrowed `TrashTab` is then turned into an `EntityType` through `TRASH_TAB_TO_ENTITY`,
 * so no caller downstream ever holds the raw string.
 */
export function parseTrashTab(raw: string | string[] | null | undefined): TrashTab {
  const value = firstParam(raw)

  // `TRASH_TABS.includes` is a membership test against frozen literals, not a property lookup,
  // so `__proto__` and `constructor` are ordinary non-members here.
  return TRASH_TABS.find((tab) => tab === value) ?? DEFAULT_TRASH_TAB
}

/**
 * The first page, and the deepest page a caller may ask for.
 *
 * `MAX_TRASH_PAGE` IS A COST CONTROL, NOT A COURTESY, because `listTrashed` is CUMULATIVE: the
 * "Load more" idiom this surface is built on means page *N* fetches `50 × N + 1` rows, feeds every
 * one of their ids into `resolveDeletedBy` as a single array bind, and server-renders them all into
 * one HTML document. So the ceiling is not "how deep may you look", it is "how large may one
 * authenticated GET be".
 *
 * Lowered from 200 (10,001 rows and a 10,000-element bind per request, reachable by editing a URL
 * with no privilege at all) to 20. The original value was justified as "far past any reachable
 * trash view" — which is an argument that it is safe to LOWER, not that it is safe to keep. 20
 * pages is 1,000 records deep, still far past any trash view a human pages through by clicking
 * "Load more" twenty times, and one tenth of the worst-case work.
 *
 * The cumulative read itself is deliberately NOT replaced with an offset window here: that would
 * make each page constant-cost but would also turn "Load more" into numbered pagination, dropping
 * rows 1..N-1 out of the view on every click. The idiom is locked in 37-UI-SPEC, so the ceiling is
 * the part that moves. `/api/v1/trash` has no such constraint and does use a true offset window —
 * see the note at `pageWindow` in its route.
 */
const MIN_TRASH_PAGE = 1
const MAX_TRASH_PAGE = 20

/**
 * `?page=` becomes an OFFSET, so it is bounded on both ends (T-37-02).
 *
 * The digits-only test comes first — the same posture `retention-form.tsx` uses for day counts
 * — because it is what rejects `1.5`, `1e9`, `-4`, `Infinity` and the empty string, all of
 * which `Number()` alone would either accept or coerce to `0`. `Number.isSafeInteger` then
 * catches a 40-digit run of nines that passes the regex but has already lost precision.
 *
 * The UPPER clamp is not cosmetic: without it a crafted `?page=99999999` asks the database to
 * skip millions of rows, which is both an unbounded scan and a timing signal about how much
 * data exists. See `MAX_TRASH_PAGE` above for why the bound is 20 pages rather than 200.
 */
export function parseTrashPage(raw: string | string[] | null | undefined): number {
  const value = firstParam(raw)

  if (value === undefined) return MIN_TRASH_PAGE

  const trimmed = value.trim()

  if (!/^\d+$/.test(trimmed)) return MIN_TRASH_PAGE

  const parsed = Number(trimmed)

  if (!Number.isSafeInteger(parsed)) return MAX_TRASH_PAGE

  if (parsed < MIN_TRASH_PAGE) return MIN_TRASH_PAGE
  if (parsed > MAX_TRASH_PAGE) return MAX_TRASH_PAGE

  return parsed
}

/**
 * Runtime narrowing for the REST boundary, where an entity type arrives as an unknown from a
 * JSON body or a route segment rather than as a typed search param. Implemented against the
 * same four literals `TRASH_PRUNE_ORDER` holds, so there is one list to keep current.
 */
export function isTrashEntityType(value: unknown): value is EntityType {
  return TRASH_PRUNE_ORDER.some((entity) => entity === value)
}
