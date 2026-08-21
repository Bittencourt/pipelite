/**
 * THE RESOLVER: a viewer, an entity type and a URL in; the eight `SavedViewsBar` props out.
 *
 * WHY EVERYTHING HERE IS SERVER-SIDE. UI-SPEC Rule B-2 makes every piece of bar state a prop, for
 * three stated reasons, and this module is where all three are earned:
 *   1. No loading flash. All four host pages already `await searchParams`, so the views come down
 *      with the first paint instead of flashing "All records" over the user's actual default.
 *   2. `isModified` and `droppedFilterKeys` are DIFFERENT FACTS THAT LOOK IDENTICAL from the
 *      client. Both are "the URL differs from the stored blob". Only something holding the catalog
 *      can say whether a key changed (modified) or ceased to exist (degraded), and a client that
 *      guessed would label every degraded view "Modified" and invite the user to save the damage.
 *   3. It is gateable — which is why the DECISIONS below are pure exported functions rather than
 *      inline expressions inside an async wrapper. A `Promise` is not unit-testable without a
 *      database; `selectViewForParams(entityType, urlFilters, views)` is.
 *
 * THE SPLIT IS THEREFORE DELIBERATE AND LOAD-BEARING:
 *   - `validateVisibleViews`, `selectViewForParams`, `computeIsModified` and `redirectTargetFor`
 *     are PURE. They take values, return values, touch no database and never throw.
 *   - `resolveSavedViewsBarProps` and `resolveDefaultViewRedirect` are thin async wrappers that
 *     gather data and then compose the pure four.
 *
 * `validateVisibleViews` is exported rather than inlined for one specific reason: it is the step
 * that replaces each view's STORED filters with its VALIDATED ones, and "the comparison uses the
 * validated set, not the raw blob" is the single most consequential claim in this file. Exporting
 * the seam makes that claim assertable end-to-end with no mock (see `__tests__/resolve.test.ts`,
 * "fails if the comparison uses the raw stored blob instead of the validated set").
 *
 * NOT SERVER ACTIONS. This module imports `@/db` (through `./queries`) and is called from server
 * COMPONENTS only. It deliberately carries no `"use server"` directive: that would turn every
 * export into a POST endpoint reachable from a browser, which is a wider surface than a read needs.
 * Writes live in `src/lib/views/actions.ts` (plan 40-06).
 *
 * NOTHING HERE THROWS. There is no `error.tsx` above `/organizations`, `/people`, `/deals` or
 * `/activities` (M-14), so an exception escaping either wrapper is a blank list page. Every failure
 * degrades: no views, no selection, no redirect — the unfiltered list, which is the same thing the
 * user sees before they ever save a view.
 */
import { and, eq, isNull } from "drizzle-orm"

import { activityTypes } from "@/db/schema/activity-types"
import { pipelines, stages } from "@/db/schema/pipelines"
import { users } from "@/db/schema/users"

import {
  VIEW_ESCAPE_KEY,
  VIEW_ESCAPE_VALUE,
  countFilters,
  filtersToSearchParams,
  hasExportableFilter,
  hasSaveableFilter,
  pickFilterParams,
} from "./url-params"
import { validateStoredFilters } from "./validate"

import type { ViewViewer } from "./queries"
// The schema table objects above are pure column descriptors and pull in no connection. `@/db` and
// `./queries` are different: `@/db` THROWS AT MODULE EVALUATION when `DATABASE_URL` is unset, which
// is the state of the base vitest project (it runs in CI, where there is no database). Importing
// either at the top level would therefore make the four PURE functions in this file unimportable
// without a database — and unit-testing those four is the entire reason Rule B-2 reason 3 says this
// state is gateable. So both are imported lazily, inside the two async wrappers, exactly as
// `src/db/schema/saved-views.test.ts` does it (`const { db } = await import("../index")`). The cost
// is one module-cache lookup per call; the benefit is that `resolve.test.ts` needs no database and
// no mock.
import type { FilterParamSource } from "./url-params"
import type { ViewFilterCatalog } from "./validate"
import type {
  SavedViewSummary,
  SavedViewsBarProps,
  ViewEntityType,
  ViewFilters,
} from "./types"

const LOG_PREFIX = "[views/resolve]"

/**
 * One view after the read-side validator has run over it.
 *
 * `summary.filters` IS THE VALIDATED SET — the stored blob does not appear anywhere in this type,
 * and that absence is the design. `computeIsModified` cannot compare against the raw blob because
 * it is never handed one; the mistake Rule B-2 reason 2 warns about is unrepresentable rather than
 * merely discouraged. `droppedKeys` rides alongside instead of inside the summary because
 * `SavedViewsBarProps` carries exactly eight props (V-40-5) and `droppedFilterKeys` is a property
 * of the SELECTED view, not of every row in the picker — a degraded view nobody has open must not
 * print a notice.
 */
export interface ValidatedView {
  summary: SavedViewSummary
  droppedKeys: string[]
}

/** An empty catalog: what `organization` and `person` need, and what a failed read degrades to. */
const EMPTY_CATALOG: ViewFilterCatalog = {
  userIds: new Set<string>(),
  pipelineIds: new Set<string>(),
  stageIdsByPipeline: new Map<string, ReadonlySet<string>>(),
  activityTypeIds: new Set<string>(),
}

/* =========================================================================
 * The pure decisions
 * ====================================================================== */

/**
 * VALIDATE EVERY VIEW'S STORED FILTERS AGAINST THE CATALOG, once per request.
 *
 * `filterCount` is RECOMPUTED here rather than carried over from `listVisibleViews`. G-3 requires
 * that the number the manage dialog renders and the number of filters the list actually applies
 * cannot diverge, and after a drop they would: a view saved with two filters whose owner has since
 * been deleted applies one. Saying "2 filters" beside a list narrowed by one is precisely the
 * divergence that rule exists to prevent.
 */
export function validateVisibleViews(
  entityType: ViewEntityType,
  summaries: readonly SavedViewSummary[],
  catalog: ViewFilterCatalog,
): ValidatedView[] {
  if (!Array.isArray(summaries)) return []

  return summaries.map((stored) => {
    const { filters, droppedKeys } = validateStoredFilters(entityType, stored.filters, catalog)

    return {
      // A NEW object; the caller's summary is never mutated. `listVisibleViews`' result is not
      // ours to edit, and a mutating map would make the raw blob unrecoverable for a logger.
      summary: { ...stored, filters, filterCount: countFilters(entityType, filters) },
      droppedKeys,
    }
  })
}

/** How `selectViewForParams` learns that the user explicitly asked for "All records". */
export interface SelectViewOptions {
  /** `true` when the URL carried `?view=none`. */
  viewEscape?: boolean
}

/**
 * A filter set as its canonical query string — the comparison key for everything below.
 *
 * Both sides go through `filtersToSearchParams`, which serialises in WHITELIST order, so this is a
 * string comparison and not a key-by-key walk. 40-01 gave the whitelist a canonical order for
 * exactly this: without it, a view saved as `{stage, owner}` and a URL built as `?owner=…&stage=…`
 * would compare unequal and every view would render "Modified".
 */
function comparisonKey(entityType: ViewEntityType, source: FilterParamSource): string {
  return filtersToSearchParams(entityType, source).toString()
}

/**
 * WHICH VIEW, IF ANY, IS THE URL CURRENTLY SHOWING?
 *
 * A view is selected when its VALIDATED filter set equals the URL's, key for key and value for
 * value. Validated and not stored: selecting a degraded view navigates to the keys that still work
 * (see `resolveSavedViewsBarProps` step 10), so those are the keys that must match on the way back.
 *
 * `null` in two cases, and they are different questions with the same answer:
 *   - THE URL CARRIES NO FILTERS. An unfiltered list is not "a view with no filters"; a view must
 *     carry at least one whitelisted key to be saveable at all (U-2).
 *   - `?view=none` WAS PRESENT. That is the explicit "All records" selection (U-1). It normally
 *     implies an empty filter set — `withViewEscape` only appends it when nothing survived — so this
 *     branch is reached by a hand-written `?view=none&search=acme`, where honouring the escape is
 *     the honest reading of a URL that says both things.
 *
 * THE TIEBREAK IS TOTAL, and it needs to be: the moment a user forks a teammate's shared view they
 * own two views with identical filters, and a picker that highlighted a different one on each render
 * would look broken. Owned before shared (your own workspace wins), then `name` ascending (the order
 * the menu already renders in, V-3), then `id` — the last a pure determinism backstop, since
 * (owner, entityType, name) is unique in the database and two of the viewer's own views cannot in
 * fact share a name.
 */
export function selectViewForParams(
  entityType: ViewEntityType,
  urlFilters: FilterParamSource,
  views: readonly ValidatedView[],
  options: SelectViewOptions = {},
): string | null {
  if (options.viewEscape === true) return null
  if (!Array.isArray(views)) return null

  const target = comparisonKey(entityType, urlFilters)

  if (target === "") return null

  const matches = views.filter(
    (candidate) => comparisonKey(entityType, candidate.summary.filters) === target,
  )

  if (matches.length === 0) return null

  const best = matches.reduce((winner, candidate) => {
    if (candidate.summary.isOwnedByViewer !== winner.summary.isOwnedByViewer) {
      return candidate.summary.isOwnedByViewer ? candidate : winner
    }
    if (candidate.summary.name !== winner.summary.name) {
      return candidate.summary.name < winner.summary.name ? candidate : winner
    }

    return candidate.summary.id < winner.summary.id ? candidate : winner
  })

  return best.summary.id
}

/**
 * DOES THE URL DIFFER FROM THE SELECTED VIEW AS IT NOW STANDS?
 *
 * "As it now stands" is the whole function. The comparison is against the POST-VALIDATION filter
 * set, which is the only set `ValidatedView` carries. Against the RAW blob, a view whose `owner` was
 * deleted would read "Modified" from the moment that user was deleted until the end of time, and the
 * bar would offer "Save changes" — inviting the user to overwrite their view with the damage. That
 * is the exact failure Rule B-2 reason 2 exists to prevent, and it is why `droppedFilterKeys` is a
 * separate prop rather than a flavour of `isModified`.
 *
 * `false` when nothing is selected: there is no view for the URL to differ FROM, and an unfiltered
 * list is not a modified anything.
 *
 * `entityType` IS AN EXPLICIT PARAMETER, not read off the selected row. 40-05-PLAN's signature
 * omits it, which would mean deriving the whitelist from `selected.summary.entityType` — making the
 * comparison depend on a stored discriminator agreeing with the list being rendered. They always do
 * agree in production, because `listVisibleViews` scopes by entity type. But the derived version
 * FAILS SILENTLY when they disagree: the wrong whitelist picks both sides down to `{}`, the two
 * compare equal, and the answer is a confident `false`. It cost two red tests to find, in fixtures
 * rather than in production, which is the cheap place to find it. Explicit also matches
 * `selectViewForParams` and `redirectTargetFor`, which both take it first.
 */
export function computeIsModified(
  entityType: ViewEntityType,
  selectedViewId: string | null,
  urlFilters: FilterParamSource,
  views: readonly ValidatedView[],
): boolean {
  if (selectedViewId === null) return false
  if (!Array.isArray(views)) return false

  const selected = views.find((candidate) => candidate.summary.id === selectedViewId)

  // An id naming no visible view is not "modified" — it is stale. Reporting `true` would badge a
  // view the user cannot see and cannot repair.
  if (selected === undefined) return false

  return (
    comparisonKey(entityType, urlFilters) !== comparisonKey(entityType, selected.summary.filters)
  )
}

/**
 * WHERE SHOULD A BARE URL REDIRECT TO, GIVEN THIS USER'S VALIDATED DEFAULT?
 *
 * `null` MEANS "DO NOT REDIRECT", and the empty-filter-set case is the important one. The redirect
 * guard fires when the incoming URL carries no params at all. If a default's every key was dropped —
 * a `/deals` view whose pipeline was deleted and whose owner was soft-deleted, say — then redirecting
 * to a bare path lands on that same guard, which fires again, forever (T-40-20). U-2's promise is
 * that the target always carries at least one whitelisted key; returning `null` is how that promise
 * is kept rather than asserted.
 *
 * The target is built by `filtersToSearchParams`, so it carries the whitelisted keys in canonical
 * order and nothing else: no `page` (a view lands you on page 1 by definition) and no `view` (the
 * escape exists to STOP a redirect, so emitting it as the destination of one would be incoherent).
 */
export function redirectTargetFor(
  entityType: ViewEntityType,
  validatedFilters: FilterParamSource,
): string | null {
  if (validatedFilters === null || validatedFilters === undefined) return null

  const query = comparisonKey(entityType, validatedFilters)

  // Empty covers three arrivals at once: no default, a default with no filters, and a default whose
  // every filter was dropped. All three mean the same thing to the caller.
  if (query === "") return null

  return `?${query}`
}

/* =========================================================================
 * The data-gathering wrappers
 * ====================================================================== */

/**
 * Was `?view=none` on the incoming URL?
 *
 * Read here rather than in `url-params.ts` because `pickFilterParams` deliberately drops `view` —
 * it is a control param and not a filter — so by the time the resolver has its filter map the
 * escape is gone. The constants are imported rather than re-spelled, so there is one definition of
 * the escape and this cannot drift from `withViewEscape`'s.
 */
function hasViewEscape(source: FilterParamSource): boolean {
  if (source === null || source === undefined || typeof source !== "object") return false

  try {
    const raw =
      source instanceof URLSearchParams
        ? source.get(VIEW_ESCAPE_KEY)
        : Object.prototype.hasOwnProperty.call(source, VIEW_ESCAPE_KEY)
          ? (source as Record<string, unknown>)[VIEW_ESCAPE_KEY]
          : undefined
    const value = Array.isArray(raw) ? raw[0] : raw

    return value === VIEW_ESCAPE_VALUE
  } catch {
    return false
  }
}

/**
 * WHAT THE EXISTENCE CHECKS NEED, AND ONLY WHAT THIS ENTITY TYPE NEEDS.
 *
 * `organization` and `person` carry a single `search` param (Decision 1: Phase 40 adds no filters),
 * and `search` references nothing that can be deleted. So those two surfaces issue ZERO catalog
 * queries and return the empty catalog immediately. That is not a micro-optimisation — it is two of
 * the four list pages not paying four `SELECT`s per render for a one-string view.
 *
 * `deal` needs users, live pipelines and stages-by-pipeline. `activity` needs users and activity
 * types. Neither needs the other's, so neither reads it.
 *
 * ACTIVE USERS ARE `deletedAt IS NULL`, WITHOUT the `status = 'approved'` predicate that
 * `organizations/page.tsx:130` applies to its bulk-owner picker. The difference is deliberate: that
 * picker chooses a WRITE TARGET, where handing records to a principal who cannot sign in is a data
 * defect no error reports (T-38-06). This is a READ filter, where the only consequence of an
 * unapproved id is a narrower list. Dropping such a filter would delete something the user chose,
 * for no gain. `deals/page.tsx` filters its own owner picker on the soft-delete column alone, which
 * is the analog that fits here.
 *
 * ANY FAILURE DEGRADES TO THE EMPTY CATALOG, which drops every existence-checked key. That is the
 * safe direction: a list rendered unfiltered plus a "part of this view no longer exists" notice,
 * rather than a blank page. It is also visible rather than silent, which is why it is logged.
 */
async function loadFilterCatalog(entityType: ViewEntityType): Promise<ViewFilterCatalog> {
  try {
    // BEFORE the import, so the two surfaces that need no catalog also never evaluate `@/db`.
    if (entityType === "organization" || entityType === "person") return EMPTY_CATALOG

    const { db } = await import("@/db")

    if (entityType === "deal") {
      const [userRows, pipelineRows, stageRows] = await Promise.all([
        db.select({ id: users.id }).from(users).where(isNull(users.deletedAt)),
        db.select({ id: pipelines.id }).from(pipelines).where(isNull(pipelines.deletedAt)),
        // Joined to `pipelines`, so a stage belonging to a DELETED pipeline is absent from the
        // union too. Without the join, dropping a dead `pipeline` key would leave its orphaned
        // stage passing the union check and filtering the default board down to nothing.
        db
          .select({ id: stages.id, pipelineId: stages.pipelineId })
          .from(stages)
          .innerJoin(
            pipelines,
            and(eq(pipelines.id, stages.pipelineId), isNull(pipelines.deletedAt)),
          ),
      ])

      const stageIdsByPipeline = new Map<string, Set<string>>()

      for (const stage of stageRows) {
        const bucket = stageIdsByPipeline.get(stage.pipelineId) ?? new Set<string>()

        bucket.add(stage.id)
        stageIdsByPipeline.set(stage.pipelineId, bucket)
      }

      return {
        userIds: new Set(userRows.map((row) => row.id)),
        pipelineIds: new Set(pipelineRows.map((row) => row.id)),
        stageIdsByPipeline,
        activityTypeIds: new Set<string>(),
      }
    }

    const [userRows, typeRows] = await Promise.all([
      db.select({ id: users.id }).from(users).where(isNull(users.deletedAt)),
      db.select({ id: activityTypes.id }).from(activityTypes),
    ])

    return {
      userIds: new Set(userRows.map((row) => row.id)),
      pipelineIds: new Set<string>(),
      stageIdsByPipeline: new Map<string, ReadonlySet<string>>(),
      activityTypeIds: new Set(typeRows.map((row) => row.id)),
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} could not load the filter catalog for ${entityType}:`, error)
    return EMPTY_CATALOG
  }
}

export interface ResolveBarPropsInput {
  entityType: ViewEntityType
  viewer: ViewViewer
  /** The page's `await searchParams`, or a `URLSearchParams`. Untrusted either way. */
  rawSearchParams: FilterParamSource
}

/**
 * THE EIGHT PROPS, ALL OF THEM, COMPUTED HERE (Rule B-2).
 *
 * The views and the catalog are fetched in ONE round trip, because neither depends on the other and
 * a sequential read would add a latency hop to every one of the four list pages.
 *
 * `droppedFilterKeys` IS THE SELECTED VIEW'S ALONE. Not the union across every visible view: a
 * degraded view sitting in somebody's picker, unopened, must not print "part of this view no longer
 * exists" beneath a list it is not filtering (V-11).
 *
 * `views` CARRIES THE VALIDATED FILTERS, so selecting a degraded view navigates to the keys that
 * still work instead of re-applying the dead one — which is also what makes the selection round-trip
 * (the URL it navigates to is the URL `selectViewForParams` will match next render).
 */
export async function resolveSavedViewsBarProps({
  entityType,
  viewer,
  rawSearchParams,
}: ResolveBarPropsInput): Promise<SavedViewsBarProps> {
  const urlFilters = pickFilterParams(entityType, rawSearchParams)
  const viewEscape = hasViewEscape(rawSearchParams)

  // Computed before the reads, so a total database failure still yields coherent props: an empty
  // picker over a list the user can still filter, save-and-export gating intact.
  const canSave = hasSaveableFilter(entityType, urlFilters)
  const canExport = hasExportableFilter(entityType, urlFilters)

  const fallback: SavedViewsBarProps = {
    entityType,
    views: [],
    selectedViewId: null,
    isModified: false,
    droppedFilterKeys: [],
    canSave,
    canExport,
    canUpdateSelected: false,
  }

  try {
    const { listVisibleViews } = await import("./queries")
    const [summaries, catalog] = await Promise.all([
      listVisibleViews(entityType, viewer),
      loadFilterCatalog(entityType),
    ])

    const views = validateVisibleViews(entityType, summaries, catalog)
    const selectedViewId = selectViewForParams(entityType, urlFilters, views, { viewEscape })
    const selected =
      selectedViewId === null
        ? undefined
        : views.find((candidate) => candidate.summary.id === selectedViewId)

    return {
      entityType,
      views: views.map((candidate) => candidate.summary),
      selectedViewId,
      isModified: computeIsModified(entityType, selectedViewId, urlFilters, views),
      droppedFilterKeys: selected?.droppedKeys ?? [],
      canSave,
      canExport,
      // Owner-or-admin on the SELECTED view, and `false` when nothing is selected: there is no view
      // to update, so the "Save changes" resolution of slot 2 must not be reachable (B-5).
      canUpdateSelected: selected?.summary.canEdit ?? false,
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} could not resolve the bar props for ${entityType}:`, error)
    return fallback
  }
}

/**
 * WHERE A BARE URL SHOULD GO FOR THIS USER, or `null` for "stay here".
 *
 * The default is validated against the same catalog the picker uses, so a default view whose keys
 * have died produces no redirect at all rather than a redirect to a path that redirects again
 * (T-40-20). Every other failure — no default, a default that was unshared, a deleted view, a
 * database error — also produces `null`, and they all mean the same thing to the caller: render the
 * unfiltered list, with no error and no notice (the locked fallback).
 */
export async function resolveDefaultViewRedirect(
  entityType: ViewEntityType,
  viewer: ViewViewer,
): Promise<string | null> {
  try {
    const { readDefaultViewForUser } = await import("./queries")
    const defaultView = await readDefaultViewForUser(entityType, viewer.id)

    if (defaultView === null) return null

    // Read only after a default is known to exist: a user with no default must not pay for four
    // catalog selects on every bare visit to a list page.
    const catalog = await loadFilterCatalog(entityType)
    const { filters } = validateStoredFilters(entityType, defaultView.filters, catalog)

    return redirectTargetFor(entityType, filters)
  } catch (error) {
    console.error(`${LOG_PREFIX} could not resolve the default redirect for ${entityType}:`, error)
    return null
  }
}

/** Re-exported so a page needs one import to type its own local variable. */
export type { ViewFilters }
