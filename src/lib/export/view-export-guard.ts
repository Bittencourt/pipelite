/**
 * THE CONTROL THAT REPLACED PHASE 38'S ADMIN GATE.
 *
 * 38-CONTEXT.md:110-116 forbids a filters-taking export action reachable without an admin gate,
 * because an action handed `{}` returns all 46,054 organizations. Phase 40 Decision 2 amends that
 * LETTER — export is available to every authenticated user (E-9) — and preserves its INTENT by
 * refusing an empty filter set outright. **So the guard must be IMPOSSIBLE to satisfy with no
 * filter, not merely discouraged.** The client disables the menu item and shows the reason beside
 * it (E-3); that is presentation. This is the control.
 *
 * WHY THIS FILE IS NOT `export-action.ts`. A module carrying `"use server"` may export nothing but
 * async functions — Next.js 16's SWC pass rejects anything else with "Only async functions are
 * allowed to be exported in a `use server` file", which is verifiable in the compiler binary.
 * `guardExportInput` is a SYNCHRONOUS pure function and `EXPORT_ROW_CAP` is a number, so neither
 * can live beside the action. `src/lib/notes/errors.ts` is the same split for the same reason and
 * says so in its header; this follows that precedent rather than inventing a second shape.
 *
 * NO DATABASE IMPORT, and that is a property worth keeping: everything here is decidable from the
 * submitted filter map alone, which is what makes the refusal happen BEFORE any query runs.
 */
import type { ExportFilters } from "./types"
import type { ViewEntityType, ViewFilters } from "@/lib/views/types"
import {
  SAVEABLE_FILTER_KEYS,
  hasExportableFilter,
  pickFilterParams,
  type FilterParamSource,
} from "@/lib/views/url-params"

/**
 * The most rows a view export may produce (T-40-31).
 *
 * 40-CONTEXT chose a CAP over streaming, so this is a real refusal branch rather than decoration.
 * The live volumes make the number legible:
 *
 *   organizations 46,054 · people 38,348 · deals 25,195 · **activities 79,022**
 *
 * Activities alone exceed it by 29,022 rows. An unfiltered activities export is therefore refused
 * by the cap even in the counterfactual where the filter guard let it through — two independent
 * controls, which is the point of having both.
 *
 * The fetchers select `cap + 1`, and `fetchFilteredData` refuses BEFORE formatting, so a rejected
 * export never serialises a 50,001-row CSV it is only going to discard.
 */
export const EXPORT_ROW_CAP = 50_000

/**
 * Every saveable view key, mapped to the `ExportFilters` field it fills.
 *
 * A DECLARED MAPPING RATHER THAN A CAST. `ViewFilters` is `Record<string, string>` and
 * `ExportFilters` is a typed interface (whose `ids` is a `string[]`), so the two are not
 * assignable and something has to bridge them. Writing that bridge as this table means a key added
 * to `SAVEABLE_FILTER_KEYS` in future either appears here or is CAUGHT — by the `satisfies` below
 * at compile time if it is not a valid `ExportFilters` field, and by
 * `__tests__/view-filters.test.ts` at run time if it is simply missing. The alternative — a blanket
 * `as ExportFilters` — would silently drop the new key from the query while `hasExportableFilter`
 * happily authorized on it, which is the exact T-40-30 failure mode one layer up.
 *
 * `ids` is deliberately ABSENT and unreachable: it is on no whitelist row, so `pickFilterParams`
 * never looks it up and a caller cannot smuggle a selection into a view export.
 */
const VIEW_KEY_TO_EXPORT_KEY = {
  search: "search",
  type: "type",
  status: "status",
  assignee: "assignee",
  pipeline: "pipeline",
  stage: "stage",
  owner: "owner",
  dateFrom: "dateFrom",
  dateTo: "dateTo",
} as const satisfies Record<string, Exclude<keyof ExportFilters, "ids">>

/** The mapping, widened for a lookup by an arbitrary string key. */
const EXPORT_KEY_LOOKUP: Readonly<Record<string, Exclude<keyof ExportFilters, "ids"> | undefined>> =
  VIEW_KEY_TO_EXPORT_KEY

/** Every key the four whitelist rows contain, deduplicated. Exported for the mapping-coverage gate. */
export const ALL_SAVEABLE_KEYS: readonly string[] = Object.freeze([
  ...new Set(Object.values(SAVEABLE_FILTER_KEYS).flatMap((keys) => [...keys])),
])

/** Translate a picked view filter map into the export vocabulary. */
export function toExportFilters(picked: ViewFilters): ExportFilters {
  const out: ExportFilters = {}

  for (const [key, value] of Object.entries(picked)) {
    const target = EXPORT_KEY_LOOKUP[key]

    if (target !== undefined) out[target] = value
  }

  return out
}

export type ExportGuardResult =
  | { ok: true; filters: ExportFilters }
  | { ok: false; error: "refused" }

/**
 * MAY THIS REQUEST EXPORT ANYTHING AT ALL? (T-40-29)
 *
 * Two steps, in this order, and the order is the control:
 *
 *   1. RE-DERIVE the filter map with `pickFilterParams`. Whatever the client sent, what survives
 *      is a subset of `SAVEABLE_FILTER_KEYS[entityType]` with non-blank, length-capped string
 *      values. An unlisted key is never even looked up, so `ids`, `page`, `__proto__` and a crafted
 *      `format` are ordinary non-members rather than special cases.
 *   2. ASK `hasExportableFilter` ABOUT THE RESULT — never about the submitted map. That is what
 *      makes `{ search: "   " }` a refusal: the value is blank, the parser drops it, and the guard
 *      sees an empty map. A predicate applied to the raw input would have seen a "filter".
 *
 * `hasExportableFilter` and NOT a fresh non-empty test, and not `hasSaveableFilter`. Those two
 * disagree on exactly one row — `deal`/`pipeline` — and that row is the whole guard: a board
 * selector scoping up to 25,195 deals is the unbounded export the prohibition exists to prevent.
 * Any "simplification" to a single non-empty check reopens it (40-CONTEXT amendment A2, E-2).
 *
 * A CRAFTED `entityType` IS ALSO REFUSED HERE, not merely later: `keysFor` scans
 * `VIEW_ENTITY_TYPES` and yields no keys for an unrecognised type, so nothing can be picked and
 * nothing can authorize. The refusal therefore precedes any query rather than relying on
 * `fetchFilteredData`'s own switch default.
 *
 * NOTE WHAT THE `ok` BRANCH RETURNS: the picked map, `pipeline` INCLUDED. `pipeline` did not
 * authorize this export, but it must still NARROW it — otherwise a deals view exported with
 * `pipeline` + `owner` would return that owner's deals on every board rather than the one the view
 * was saved on. Narrowing and authorizing are independent, and both are asserted together.
 */
export function guardExportInput(input: {
  entityType: ViewEntityType
  filters: FilterParamSource
}): ExportGuardResult {
  const picked = pickFilterParams(input.entityType, input.filters)

  if (!hasExportableFilter(input.entityType, picked)) {
    return { ok: false, error: "refused" }
  }

  return { ok: true, filters: toExportFilters(picked) }
}
