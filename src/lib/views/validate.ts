/**
 * THE READ SIDE OF A SAVED VIEW: AUTHORITATIVE AND NON-THROWING.
 *
 * A saved view's `filters` is a JSONB blob that was written at some point in the past and is read
 * back now. Between those two moments a user was soft-deleted, a pipeline was deleted, a stage was
 * renamed onto another board, or the whitelist itself changed. 40-CONTEXT's failure posture makes
 * the READ side authoritative for exactly that reason: a stale `stage` or `owner` id must degrade to
 * a narrower-but-renderable list, never 500.
 *
 * WHY "NEVER THROWS" IS A HARD REQUIREMENT AND NOT A NICETY. There is no `error.tsx` anywhere under
 * `src/app` (M-14). An exception raised while resolving a view therefore has nothing to catch it and
 * renders as a blank page on `/organizations`, `/people`, `/deals` or `/activities` — the list
 * itself, not a corner of it. `readOrgIdentityInputFields` (`organizations/page.tsx:123`,
 * implemented in `src/lib/dedup/identity-inputs.ts:190`) is the established precedent: a settings
 * read that fails degrades to `[]`, which is the same value as "unconfigured", so the page renders
 * as if the feature were off. This module takes the same direction on every branch.
 *
 * THIS FUNCTION VALIDATES SHAPE AND EXISTENCE, NEVER EFFECTIVENESS. The distinction is load-bearing
 * and it is easy to get wrong in the helpful direction. A `status=overdue` or a `dateFrom` on
 * `/activities` currently narrows nothing in SQL — `page.tsx:92` applies only `=== "completed"`, and
 * the date range is filtered in JavaScript after the `limit` slice (`page.tsx:165-178`). That is a
 * pre-existing defect, recorded as 40-CONTEXT amendment A8, and plan 40-13 closes it on the LIST
 * side. Dropping those keys here would not fix it: it would silently delete a filter the user
 * deliberately set and the chip row still displays, and it would make the exported set diverge from
 * the visible one. A key survives here if its target exists and its shape is usable. Whether the
 * list then does something with it is the list's business.
 *
 * NO DATABASE IMPORT. The catalog is passed in as a plain, already-fetched value object, which is
 * what makes every rule below unit-testable with no mock and no connection — and what lets
 * `resolve.ts` fetch the catalog once per request and validate every view against it. Adding an
 * `@/db` import here would turn a pure function into an N-query loop.
 */
import { SAVEABLE_FILTER_KEYS, VIEW_ENTITY_TYPES, pickFilterParams } from "./url-params"

import type { FilterParamSource } from "./url-params"
import type { ViewEntityType, ViewFilters } from "./types"

/**
 * Everything the existence checks need, read once per request.
 *
 * A VALUE OBJECT, NOT A DATABASE HANDLE. Sets and a Map rather than arrays because every lookup
 * below is a membership test and a view can carry six keys; an array scan would be correct and
 * pointlessly quadratic against 73 stages.
 *
 * `userIds` holds ACTIVE users only (`deletedAt IS NULL`). Six users in this deployment are
 * soft-deleted, so the "owner no longer exists" branch is live data rather than a hypothetical.
 */
export interface ViewFilterCatalog {
  /** Active users — `deletedAt IS NULL`. */
  userIds: ReadonlySet<string>
  /** Live pipelines — `deletedAt IS NULL`. */
  pipelineIds: ReadonlySet<string>
  /** Stage ids grouped by their pipeline, so a stage can be checked against ITS board. */
  stageIdsByPipeline: ReadonlyMap<string, ReadonlySet<string>>
  activityTypeIds: ReadonlySet<string>
}

/**
 * What survived, and what did not.
 *
 * `droppedKeys` is not diagnostic detail — it is the input to `views.degraded` (V-11) and, one layer
 * up, to the distinction between "degraded" and "modified" that Rule B-2 reason 2 exists to keep.
 * A view whose `owner` was dropped and whose remaining keys match the URL is CLEAN, not modified;
 * `computeIsModified` can only know that because this function reports the drop separately instead
 * of folding it into the filter set.
 */
export interface ValidatedViewFilters {
  filters: ViewFilters
  /** Sorted and de-duplicated, so `views.degraded` fires deterministically. */
  droppedKeys: string[]
}

/** The three literals `activity-filters.tsx:184-186` writes, and nothing else. */
export const ACTIVITY_STATUS_VALUES: readonly string[] = Object.freeze([
  "pending",
  "completed",
  "overdue",
])

/**
 * A calendar date, and only a calendar date.
 *
 * THE REGEX AND THE `Date.parse` CHECK ARE BOTH REQUIRED, and each one alone is insufficient:
 *   - `Date.parse("1")` is a valid instant (the year 2001), and `Date.parse("2026-01-15T00:00:00Z")`
 *     is valid too. A finiteness check alone would carry both into a `gte()` on
 *     `expectedCloseDate`, filtering by a date the user never chose.
 *   - the regex alone accepts `"2026-13-01"` and `"0000-00-00"`, which `Date.parse` reports as
 *     `NaN`. `new Date(NaN)` is an `Invalid Date`, and an `Invalid Date` interpolated into a
 *     `gte()` is a driver-level error — a 500 on a route with nothing above it to catch one
 *     (T-40-19, M-14).
 * `"2026-02-30"` is deliberately ACCEPTED: V8 rolls it forward to March 2nd, which is a real
 * instant. Rejecting it would require a calendar implementation, and the failure this gate exists to
 * stop is `Invalid Date`, not a user's arithmetic.
 */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** A frozen empty result, so an unrecognised entity type cannot hand a caller a mutable object. */
const EMPTY_RESULT: ValidatedViewFilters = Object.freeze({
  filters: Object.freeze({}) as ViewFilters,
  droppedKeys: Object.freeze([]) as unknown as string[],
})

/**
 * Is this key present in the raw blob at all?
 *
 * This is what separates "dropped" from "never there", and the difference decides whether
 * `views.degraded` renders. Total by construction: a null-prototype object, an array, a string, a
 * `URLSearchParams` and a hostile accessor all have to produce a boolean.
 *
 * `undefined` counts as ABSENT even when the property exists. JSON cannot express `undefined`, so a
 * `{owner: undefined}` came from code rather than from the column, and reporting it as dropped would
 * light the degraded notice for a view in which nothing is missing.
 */
function isPresentInSource(source: FilterParamSource, key: string): boolean {
  if (source === null || source === undefined) return false
  if (typeof source !== "object") return false

  try {
    if (source instanceof URLSearchParams) return source.get(key) !== null
    if (!Object.prototype.hasOwnProperty.call(source, key)) return false

    return (source as Record<string, unknown>)[key] !== undefined
  } catch {
    return false
  }
}

/**
 * A set member test that survives a malformed catalog.
 *
 * The catalog is produced by a database read wrapped in a try/catch, so a degraded read can hand
 * this module a partial object. A missing set means "nothing exists", which drops the key — the safe
 * direction: the list renders unfiltered rather than filtered by an id nothing verified.
 */
function has(set: ReadonlySet<string> | undefined, value: string): boolean {
  try {
    return set instanceof Set ? set.has(value) : false
  } catch {
    return false
  }
}

/** Every stage id in the deployment, used only when no pipeline survived to scope the check. */
function unionOfStages(catalog: ViewFilterCatalog): ReadonlySet<string> {
  const all = new Set<string>()

  try {
    if (!(catalog.stageIdsByPipeline instanceof Map)) return all

    for (const stageIds of catalog.stageIdsByPipeline.values()) {
      if (stageIds instanceof Set) for (const id of stageIds) all.add(id)
    }
  } catch {
    return all
  }

  return all
}

function isValidDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value) && Number.isFinite(Date.parse(value))
}

/**
 * DROP EVERY STORED KEY WHOSE TARGET NO LONGER EXISTS, KEEP THE REST, AND NEVER THROW.
 *
 * The order of the two phases matters. `pickFilterParams` runs FIRST, so by the time any existence
 * check runs the map holds only keys in this entity's whitelist, with non-blank string values inside
 * the length cap. A `page`, a `view`, a key from an older whitelist, a megabyte of text and a
 * prototype-named key are all gone before this function makes a single decision — which is why
 * there is no special case for any of them below.
 *
 * WHAT `droppedKeys` REPORTS, precisely: a key that is in THIS entity's whitelist, was present in
 * the blob, and is absent from the result. So `page` and a stale `industry` are never reported —
 * they are not keys of this view, nothing about them "no longer exists", and reporting them would
 * light `views.degraded` on a perfectly intact view. A whitelisted key whose value the parser
 * rejected IS reported, because from the user's side it is a filter they saved that the list is not
 * applying, and that is exactly what the notice says.
 */
export function validateStoredFilters(
  entityType: ViewEntityType,
  filters: FilterParamSource,
  catalog: ViewFilterCatalog,
): ValidatedViewFilters {
  // A membership scan, never a property lookup: `SAVEABLE_FILTER_KEYS["__proto__"]` is
  // `Object.prototype`, and iterating that would be the TypeError this module promises not to
  // raise. Same guard, same reason, as `keysFor` in `./url-params`.
  const known = VIEW_ENTITY_TYPES.find((candidate) => candidate === entityType)

  if (known === undefined) return { filters: {}, droppedKeys: [...EMPTY_RESULT.droppedKeys] }

  const picked = pickFilterParams(known, filters)
  const surviving: ViewFilters = {}
  const dropped = new Set<string>()

  const keep = (key: string, value: string) => {
    surviving[key] = value
  }
  const drop = (key: string) => {
    dropped.add(key)
  }

  // ---------------------------------------------------------------------------------------------
  // `pipeline` and `stage` are resolved together and BEFORE the rest, because the stage check reads
  // the pipeline's outcome. Deal-only: neither key is in any other entity's whitelist, so on the
  // other three surfaces `picked` cannot contain them.
  // ---------------------------------------------------------------------------------------------
  const storedPipeline = picked.pipeline
  let survivingPipeline: string | undefined

  if (storedPipeline !== undefined) {
    if (has(catalog.pipelineIds, storedPipeline)) {
      survivingPipeline = storedPipeline
      keep("pipeline", storedPipeline)
    } else {
      // Decision 4, and this drop is the whole implementation of it. `deals/page.tsx:76-91` renders
      // the `pipelineNotFound` page when `params.pipeline` is set to an id it cannot find; removing
      // the key puts the page on its `allPipelines.find(p => p.isDefault) || allPipelines[0]`
      // branch instead, which is the default board the decision asks for.
      drop("pipeline")
    }
  }

  const storedStage = picked.stage

  if (storedStage !== undefined) {
    // Scoped to the SURVIVING pipeline when there is one: the board renders that pipeline's columns
    // and a stage from another board matches none of them, so keeping it would render an
    // unexplained empty list. With no surviving pipeline there is no board to scope to, and the
    // union is the widest honest check.
    const allowed =
      survivingPipeline === undefined
        ? unionOfStages(catalog)
        : (catalog.stageIdsByPipeline instanceof Map
            ? catalog.stageIdsByPipeline.get(survivingPipeline)
            : undefined) ?? new Set<string>()

    if (has(allowed, storedStage)) keep("stage", storedStage)
    else drop("stage")
  }

  for (const [key, value] of Object.entries(picked)) {
    if (key === "pipeline" || key === "stage") continue

    switch (key) {
      // Both are user ids, checked against ACTIVE users only. Six soft-deleted users exist, so this
      // is the most frequently exercised drop in the deployment.
      case "owner":
      case "assignee":
        if (has(catalog.userIds, value)) keep(key, value)
        else drop(key)
        break

      case "type":
        if (has(catalog.activityTypeIds, value)) keep(key, value)
        else drop(key)
        break

      // A closed literal set rather than an existence check: `status` is not a row in any table, it
      // is three `<SelectItem value=…>`s. All three survive, including the two that narrow nothing
      // in SQL today — see the header on effectiveness.
      case "status":
        if (ACTIVITY_STATUS_VALUES.includes(value)) keep(key, value)
        else drop(key)
        break

      case "dateFrom":
      case "dateTo":
        if (isValidDate(value)) keep(key, value)
        else drop(key)
        break

      // `search` references nothing that can be deleted, so there is nothing for it to fail. Any
      // string the parser accepted is a valid search — including one that looks like SQL, since the
      // ILIKE is parameterised. It is returned VERBATIM and untrimmed: trimming would make the URL
      // and the stored blob disagree, and `isModified` is computed from exactly that comparison.
      case "search":
        keep(key, value)
        break

      // Unreachable while this switch covers every whitelisted key, and deliberately not an error.
      // A key added to `SAVEABLE_FILTER_KEYS` without a rule here would be dropped rather than
      // passed through unchecked — the safe direction, and one the tests notice.
      default:
        drop(key)
        break
    }
  }

  // Report only keys this view could actually have had. A whitelisted key that was never in the
  // blob cannot have been dropped; an unwhitelisted one was never a filter. See the doc comment.
  const whitelist = SAVEABLE_FILTER_KEYS[known]
  const droppedKeys = whitelist
    .filter(
      (key) =>
        surviving[key] === undefined && (dropped.has(key) || isPresentInSource(filters, key)),
    )
    .sort()

  return { filters: surviving, droppedKeys }
}
