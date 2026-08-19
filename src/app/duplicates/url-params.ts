/**
 * THE `/duplicates` URL VOCABULARY — the one definition of what `?type=`, `?page=` and
 * `?dismissed=` may be.
 *
 * WHY A SIBLING MODULE AND NOT `page.tsx`. UI-SPEC L-1 puts all state in the URL, so the server
 * component (which reads it) and the tab bar (which writes it) both need to agree on what a valid
 * tab is. Two copies of that list is the T-37-03 defect: `?type=people` rendering the people rows
 * while the tab bar highlights organizations, or vice versa. `src/lib/trash/entity-types.ts` is the
 * precedent — one exported parser, imported by both ends.
 *
 * NO DATABASE IMPORT, AND THAT IS A CONSTRAINT RATHER THAN A COINCIDENCE. `duplicates-tabs.tsx` is
 * a `"use client"` module, so anything it imports enters the browser bundle. The only import here is
 * a TYPE, which is erased at compile time; `src/lib/dedup/types.ts` is itself database-free for the
 * same reason. Never import `queries.ts`, `scan-state.ts` or `identity-settings.ts` from this file.
 *
 * EVERY PARSER RETURNS A VALID VALUE AND NEVER THROWS. A crafted, repeated or absent search param
 * yields the default — never an error page, never an empty shell. That is the T-37-03 control: no
 * raw search-param value reaches a query.
 */

import type { MergeableEntityType } from "@/lib/dedup/types"

/**
 * The two tabs, as they appear in the URL.
 *
 * PLURAL AND ENGLISH, matching `nav.organizations` / `nav.people` and the `/organizations` and
 * `/people` routes — and matching the links plan 39-16 already shipped into both list toolbars
 * (`/duplicates?type=organizations`). The entity types are singular, hence the map below rather
 * than string surgery: `` `${entityType}s` `` would produce `persons`.
 */
export const DUPLICATE_TABS = ["organizations", "people"] as const

export type DuplicateTab = (typeof DUPLICATE_TABS)[number]

/**
 * The tab an absent, repeated or unrecognised `?type=` resolves to.
 *
 * Organizations rather than people because that is the larger table in this deployment and the
 * reason the feature exists.
 */
const DEFAULT_DUPLICATE_TAB: DuplicateTab = "organizations"

/** The URL tab to the entity type every query and every action speaks. */
export const DUPLICATE_TAB_TO_ENTITY: Readonly<Record<DuplicateTab, MergeableEntityType>> =
  Object.freeze({
    organizations: "organization",
    people: "person",
  })

/** The first page, and the value every malformed `?page=` collapses to. */
export const MIN_PAIR_PAGE = 1

/**
 * A `?page=` of more digits than this is treated as absent.
 *
 * The PRODUCT ceiling is `MAX_PAIR_PAGE` in `src/lib/dedup/queries.ts`, and `listPairs` clamps to
 * it itself — that number is deliberately NOT restated here, because a second copy of a bound is a
 * second thing to keep in sync and this module cannot import the module that owns it (see the
 * header). What this cap does is narrower and its own concern: it stops a megabyte of digits being
 * carried into `Number()` and into a log line, the same shape of test `parseRecordId` applies to an
 * id.
 */
const MAX_PAGE_DIGITS = 9

/**
 * The first value of a search param.
 *
 * `?type=a&type=b` arrives as an array. Taking the first entry rather than rejecting the pair keeps
 * the surface's posture — a strange URL renders a page, it does not produce an error.
 */
function firstParam(raw: string | string[] | null | undefined): string | undefined {
  if (Array.isArray(raw)) return raw[0]
  return raw ?? undefined
}

/**
 * Narrow `?type=` to one of the two tabs.
 *
 * `DUPLICATE_TABS.find` is a membership test against frozen literals, not a property lookup, so
 * `__proto__` and `constructor` are ordinary non-members here.
 */
export function parseDuplicateTab(raw: string | string[] | null | undefined): DuplicateTab {
  const value = firstParam(raw)

  return DUPLICATE_TABS.find((tab) => tab === value) ?? DEFAULT_DUPLICATE_TAB
}

/**
 * Narrow `?page=` to a whole page number at or above 1.
 *
 * The digits-only test is what rejects `1.5`, `1e3`, `-1`, `Infinity`, `NaN` and the empty string,
 * all of which `Number()` alone would either accept or silently turn into `0`.
 */
export function parseDuplicatePage(raw: string | string[] | null | undefined): number {
  const value = firstParam(raw)

  if (value === undefined) return MIN_PAIR_PAGE

  const trimmed = value.trim()

  if (!/^\d+$/.test(trimmed)) return MIN_PAIR_PAGE
  if (trimmed.length > MAX_PAGE_DIGITS) return MIN_PAIR_PAGE

  const parsed = Number(trimmed)

  if (!Number.isSafeInteger(parsed) || parsed < MIN_PAIR_PAGE) return MIN_PAIR_PAGE

  return parsed
}

/**
 * Whether the dismissed view is showing.
 *
 * EXACTLY `1` IS TRUE and everything else is false — including `?dismissed=0`, `?dismissed=false`
 * and `?dismissed` with no value. A looser test ("present means true") would make `?dismissed=0`
 * show the dismissed list, which is the opposite of what it says.
 */
export function parseShowDismissed(raw: string | string[] | null | undefined): boolean {
  return firstParam(raw) === "1"
}
