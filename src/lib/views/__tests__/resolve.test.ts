/**
 * THE RESOLVER GATE — the four pure decisions behind the eight `SavedViewsBar` props.
 *
 * Rule B-2 makes every piece of bar state server-computed, and reason 2 is the one this file
 * defends: `isModified` and `droppedFilterKeys` BOTH manifest as "the URL differs from the stored
 * blob", and only the server knows which it is. Get the comparison wrong and a DEGRADED view is
 * labelled "Modified" forever, inviting the user to save the damage.
 *
 * Four functions, four properties, each asserted from both directions:
 *
 *   `validateVisibleViews`  — the seam. It turns stored summaries into validated ones, and it is
 *                             exported (rather than inlined in the server wrapper) precisely so the
 *                             post-validation comparison below is testable with no database.
 *   `selectViewForParams`   — must return a NON-NULL id in at least one test, or a function that
 *                             always returns `null` would satisfy every "no match" assertion.
 *   `computeIsModified`     — must return TRUE in at least one test, for the same reason.
 *   `redirectTargetFor`     — must return `null` for an all-dropped default, or a bare URL loops
 *                             forever against the redirect guard (U-2).
 *
 * PLAN 40-18 CHANGED WHAT `selectViewForParams` MEANS, and the amended cases below are deliberate.
 * Selection is now what the URL SAYS (`?view=<id>`), not what its filters IMPLY. Under the old
 * equality rule, `selectedViewId` and `isModified` were derived from the SAME comparison, so
 * `selected && modified` was unrepresentable — measured over 10 URLs x 3 views, 2 selections and
 * ZERO modified. The `deterministic tiebreak` block is gone with it: a URL names one id, so there is
 * nothing left to break a tie between. Not one `computeIsModified` test changed, which is the point
 * of the composition sweep at the bottom of this file — every unit was already correct.
 */
import { describe, it, expect } from "vitest"

import {
  computeIsModified,
  redirectTargetFor,
  selectViewForParams,
  validateVisibleViews,
  type ValidatedView,
} from "../resolve"
import { VIEW_ESCAPE_VALUE, parseViewSelection, pickFilterParams } from "../url-params"

import type { ViewFilterCatalog } from "../validate"
import type { SavedViewSummary, ViewEntityType, ViewFilters } from "../types"

/* ------------------------------------------------------------------------- *
 * Fixtures
 * ------------------------------------------------------------------------- */

const ME = "user-me"
const THEM = "user-them"
const GONE_USER = "user-gone"
const PIPELINE = "pipe-1"
const STAGE = "stage-1"

/**
 * VIEW IDS ARE UUIDS, and from plan 40-18 that shape is load-bearing rather than incidental:
 * `selectViewForParams` narrows the incoming `viewId` through the same `narrowViewSelectionId` the
 * URL grammar uses, so a fixture id of `"v1"` would not be selectable. Every id in `saved_views` is
 * a `crypto.randomUUID()` (there is no insert path that supplies one), so these fixtures are the
 * production id space and not a convenience.
 */
const VIEW_1 = "0b7e4d1a-3c5f-4a8b-9d2e-7f6a1b2c3d4e"
const VIEW_2 = "5f8d0c2b-6a1e-4d3c-8b7a-9e0f1d2c3b4a"
const VIEW_3 = "9c1a2b3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d"
/** A well-formed uuid that names no visible view: deleted, unshared, or somebody else's private. */
const UNKNOWN_VIEW = "11111111-2222-4333-8444-555555555555"

const CATALOG: ViewFilterCatalog = {
  userIds: new Set([ME, THEM]),
  pipelineIds: new Set([PIPELINE]),
  stageIdsByPipeline: new Map([[PIPELINE, new Set([STAGE])]]),
  activityTypeIds: new Set(["atype-1"]),
}

function summary(overrides: Partial<SavedViewSummary> & { id: string }): SavedViewSummary {
  return {
    name: `view ${overrides.id}`,
    entityType: "organization",
    filters: {},
    isShared: false,
    isOwnedByViewer: true,
    isDefaultForViewer: false,
    ownerLabel: "Someone",
    ownerIsInactive: false,
    filterCount: 0,
    canEdit: true,
    ...overrides,
  }
}

/** A validated view built directly, for the helpers that consume them. */
function validated(
  overrides: Partial<SavedViewSummary> & { id: string },
  droppedKeys: string[] = [],
): ValidatedView {
  return { summary: summary(overrides), droppedKeys }
}

/* ------------------------------------------------------------------------- *
 * validateVisibleViews — the seam
 * ------------------------------------------------------------------------- */

describe("validateVisibleViews", () => {
  it("replaces each view's stored filters with the validated set and reports the drops", () => {
    const result = validateVisibleViews(
      "deal",
      [
        summary({ id: "v1", filters: { pipeline: PIPELINE, stage: STAGE, owner: ME } }),
        summary({ id: "v2", filters: { pipeline: PIPELINE, owner: GONE_USER } }),
      ],
      CATALOG,
    )

    expect(result[0].summary.filters).toEqual({ pipeline: PIPELINE, stage: STAGE, owner: ME })
    expect(result[0].droppedKeys).toEqual([])
    expect(result[1].summary.filters).toEqual({ pipeline: PIPELINE })
    expect(result[1].droppedKeys).toEqual(["owner"])
  })

  it("recomputes filterCount from the validated set, not the stored one", () => {
    // G-3: the number the manage dialog renders must be the number of filters the list will apply.
    // A view whose owner was deleted carries one fewer filter than it was saved with, and saying
    // "2 filters" next to a list narrowed by one is the divergence G-3 exists to prevent.
    const [only] = validateVisibleViews(
      "deal",
      [summary({ id: "v1", filters: { pipeline: PIPELINE, owner: GONE_USER }, filterCount: 2 })],
      CATALOG,
    )

    expect(only.summary.filterCount).toBe(1)
  })

  it("preserves every other field of the summary untouched", () => {
    const input = summary({
      id: "v1",
      name: "Keep me",
      isShared: true,
      isOwnedByViewer: false,
      isDefaultForViewer: true,
      ownerLabel: null,
      ownerIsInactive: true,
      canEdit: false,
      filters: { search: "acme" },
    })
    const [only] = validateVisibleViews("organization", [input], CATALOG)

    expect(only.summary.name).toBe("Keep me")
    expect(only.summary.isShared).toBe(true)
    expect(only.summary.isOwnedByViewer).toBe(false)
    expect(only.summary.isDefaultForViewer).toBe(true)
    expect(only.summary.ownerLabel).toBeNull()
    expect(only.summary.ownerIsInactive).toBe(true)
    expect(only.summary.canEdit).toBe(false)
  })

  it("does not mutate the summaries it was handed", () => {
    const input = summary({ id: "v1", filters: { owner: GONE_USER, search: "keep" } })
    const before = { ...input.filters }

    validateVisibleViews("activity", [input], CATALOG)

    expect(input.filters).toEqual(before)
  })

  it("returns an empty array for an empty input", () => {
    expect(validateVisibleViews("organization", [], CATALOG)).toEqual([])
  })
})

/* ------------------------------------------------------------------------- *
 * selectViewForParams
 * ------------------------------------------------------------------------- */

describe("selectViewForParams", () => {
  it("returns the id the URL names", () => {
    // ANTI-VACUITY. Without a non-null expectation somewhere, a function that always returned
    // `null` would satisfy every other assertion in this block.
    const views = [
      validated({ id: VIEW_1, filters: { search: "acme" } }),
      validated({ id: VIEW_2, filters: { search: "other" } }),
    ]

    expect(selectViewForParams("organization", { search: "acme" }, views, { viewId: VIEW_1 })).toBe(
      VIEW_1,
    )
    // And it is the URL's id that decides, not the filters: the same filter set with the OTHER id
    // named selects the other view, even though its stored filters do not match at all.
    expect(selectViewForParams("organization", { search: "acme" }, views, { viewId: VIEW_2 })).toBe(
      VIEW_2,
    )
  })

  it("FILTER EQUALITY ALONE DOES NOT SELECT — the regression 40-05 measured", () => {
    // THE NAMED DEFECT THIS PLAN EXISTS TO FIX. Selection used to be exact equality between the
    // URL's validated filters and a view's stored ones, and `computeIsModified` then compared those
    // same two sets — so `selectedViewId && isModified` was unrepresentable BY CONSTRUCTION.
    // Measured over 10 URLs x 3 views: 2 selections, ZERO modified. Three designed surfaces were
    // therefore unreachable (the "selected, modified" state, slot 2's `views.saveChanges` (B-5), and
    // the save dialog's target RadioGroup (S-3/S-4)) and "update an existing view" was impossible.
    const views = [validated({ id: VIEW_1, filters: { search: "acme" } })]

    expect(
      selectViewForParams("organization", { search: "acme" }, views),
      "A URL whose filters exactly equal a view's must NOT select it. Selection is what the URL " +
        "SAYS (?view=<id>), never what its filters imply — reintroducing equality here makes " +
        "`selected && modified` structurally impossible again, and 40-05 proved that empirically.",
    ).toBeNull()
    // The accepted consequence, stated rather than hidden: that URL shows "All records".
    expect(selectViewForParams("organization", { search: "acme" }, views, { viewId: null })).toBeNull()
  })

  it("returns null when the URL carries no filters, even with views available", () => {
    const views = [validated({ id: VIEW_1, filters: { search: "acme" } })]

    expect(selectViewForParams("organization", {}, views)).toBeNull()
    // U-2 REFUSAL, which is the one thing `urlFilters` is still consulted for: a view must carry at
    // least one whitelisted key to be saveable at all, so `?view=<id>` with nothing else is
    // incoherent and resolves to no selection rather than to a filterless view.
    expect(selectViewForParams("organization", {}, views, { viewId: VIEW_1 })).toBeNull()
    expect(selectViewForParams("organization", { search: "   " }, views, { viewId: VIEW_1 })).toBeNull()
    expect(selectViewForParams("organization", { page: "2" } as unknown as ViewFilters, views, {
      viewId: VIEW_1,
    })).toBeNull()
  })

  it("returns null when the URL names no view", () => {
    const views = [validated({ id: VIEW_1, filters: { search: "acme" } })]

    expect(selectViewForParams("organization", { search: "different" }, views)).toBeNull()
    // THREE CAUSES, ONE ANSWER: deleted, unshared, or another user's private view. Distinguishing
    // them would confirm the row exists (T-40-87), so an unresolved id is simply no selection —
    // no notice, no throw, and the URL's filters still apply.
    expect(
      selectViewForParams("organization", { search: "acme" }, views, { viewId: UNKNOWN_VIEW }),
    ).toBeNull()
    // A junk id is refused by the same grammar the URL uses, so a caller cannot select with a
    // string a crafted URL could not carry (T-40-85).
    expect(
      selectViewForParams("organization", { search: "acme" }, views, { viewId: "<script>" }),
    ).toBeNull()
    expect(selectViewForParams("organization", { search: "acme" }, [], { viewId: VIEW_1 })).toBeNull()
  })

  it("returns null when ?view=none was present, even alongside a crafted filter", () => {
    // `view=none` is the explicit "All records" selection (U-1). A hand-written
    // `?view=none&search=acme` must not silently select the view that happens to match.
    const views = [validated({ id: "v1", filters: { search: "acme" } })]

    expect(
      selectViewForParams("organization", { search: "acme" }, views, {
        viewEscape: true,
      }),
    ).toBeNull()
  })

  it("the escape BEATS a selection, so ?view=none can never resolve to a view", () => {
    // Not reachable from `parseViewSelection`, whose three states are exclusive — but
    // `selectViewForParams` is exported and a later caller could pass both. The escape must win, or
    // "All records" would become a URL that reopens the view it was escaping from.
    const views = [validated({ id: VIEW_1, filters: { search: "acme" } })]

    expect(
      selectViewForParams("organization", { search: "acme" }, views, {
        viewEscape: true,
        viewId: VIEW_1,
      }),
    ).toBeNull()
  })

  it("selects a DEGRADED view by id at its surviving keys, and it is not Modified", () => {
    // B-2 reason 2 restated under the id-based contract, and it must not regress: a view whose
    // `owner` was deleted, opened at the keys that still work, is DEGRADED — not modified. Labelling
    // it "Modified" would invite the user to save the damage.
    const views = validateVisibleViews(
      "deal",
      [summary({ id: VIEW_1, filters: { owner: GONE_USER, stage: STAGE } })],
      CATALOG,
    )

    expect(views[0].droppedKeys).toEqual(["owner"])
    expect(selectViewForParams("deal", { stage: STAGE }, views, { viewId: VIEW_1 })).toBe(VIEW_1)
    expect(computeIsModified("deal", VIEW_1, { stage: STAGE }, views)).toBe(false)
    // And the dead key coming back in the URL IS a modification, so this is not a constant `false`.
    expect(selectViewForParams("deal", { owner: GONE_USER, stage: STAGE }, views, {
      viewId: VIEW_1,
    })).toBe(VIEW_1)
    expect(computeIsModified("deal", VIEW_1, { owner: GONE_USER, stage: STAGE }, views)).toBe(true)
  })

  it("never throws on a hostile filter map or a hostile viewId", () => {
    const views = [validated({ id: VIEW_1, filters: { search: "acme" } })]
    const hostile = [null, undefined, { search: 42 }, { search: ["a"] }, ["search"], "search=acme"]
    const hostileIds = [
      null,
      undefined,
      "",
      "   ",
      "<script>",
      "//evil.example",
      "__proto__",
      "constructor",
      "x".repeat(1024 * 1024),
      42,
      [VIEW_1],
      { toString: () => VIEW_1 },
    ]

    for (const filters of hostile) {
      expect(() =>
        selectViewForParams("organization", filters as unknown as ViewFilters, views),
      ).not.toThrow()

      for (const viewId of hostileIds) {
        expect(() =>
          selectViewForParams("organization", filters as unknown as ViewFilters, views, {
            viewId: viewId as string | null,
          }),
        ).not.toThrow()
      }
    }

    // `__proto__` as an id must not resolve through the prototype chain either.
    expect(
      selectViewForParams("organization", { search: "acme" }, views, { viewId: "__proto__" }),
    ).toBeNull()
  })
})

/* ------------------------------------------------------------------------- *
 * computeIsModified
 * ------------------------------------------------------------------------- */

describe("computeIsModified", () => {
  it("is false when no view is selected", () => {
    const views = [validated({ id: "v1", filters: { search: "acme" } })]

    expect(computeIsModified("organization", null, { search: "anything" }, views)).toBe(false)
  })

  it("is false when the URL equals the selected view's validated filters", () => {
    const views = [validated({ id: "v1", filters: { search: "acme" } })]

    expect(computeIsModified("organization", "v1", { search: "acme" }, views)).toBe(false)
  })

  it("is true when the URL differs from the selected view's filters", () => {
    // ANTI-VACUITY: a function returning a constant `false` would satisfy everything else here.
    const views = [validated({ id: "v1", filters: { search: "acme" } })]

    expect(computeIsModified("organization", "v1", { search: "changed" }, views)).toBe(true)
    expect(computeIsModified("organization", "v1", {}, views)).toBe(true)
    expect(computeIsModified("organization", "v1", { search: "acme", industry: "x" }, views)).toBe(false)
  })

  it("is true when a whitelisted key was added to the URL", () => {
    const views = [validated({ id: "v1", entityType: "deal", filters: { stage: STAGE } })]

    expect(computeIsModified("deal", "v1", { stage: STAGE, owner: ME }, views)).toBe(true)
  })

  it("is false when the selected id matches no known view", () => {
    const views = [validated({ id: "v1", filters: { search: "acme" } })]

    expect(computeIsModified("organization", "does-not-exist", { search: "anything" }, views)).toBe(false)
  })

  it("fails if the comparison uses the raw stored blob instead of the validated set", () => {
    // NAMED DEFECT, and the load-bearing assertion of this file. The plan's own worked example:
    // a view stored with {owner: <deleted>, stage: s1}, whose `owner` was dropped, opened at
    // `?stage=s1`. Comparing against the RAW blob yields `isModified === true` forever and invites
    // the user to "save" the damage — exactly the failure Rule B-2 reason 2 exists to prevent.
    const views = validateVisibleViews(
      "deal",
      [summary({ id: "v1", filters: { owner: GONE_USER, stage: STAGE } })],
      CATALOG,
    )

    expect(views[0].droppedKeys).toEqual(["owner"])
    expect(computeIsModified("deal", "v1", { stage: STAGE }, views)).toBe(false)
    // And the other direction, so this is not satisfiable by a constant `false`.
    expect(computeIsModified("deal", "v1", { stage: STAGE, owner: ME }, views)).toBe(true)
  })

  it("a degraded view is never labelled Modified merely for being degraded", () => {
    // Every drop kind at once, opened at exactly the keys that survived.
    const views = validateVisibleViews(
      "deal",
      [
        summary({
          id: "v1",
          filters: {
            pipeline: "pipe-deleted",
            stage: STAGE,
            owner: GONE_USER,
            assignee: GONE_USER,
            dateFrom: "not-a-date",
          },
        }),
      ],
      CATALOG,
    )

    expect(views[0].droppedKeys).toEqual(["assignee", "dateFrom", "owner", "pipeline"])
    expect(computeIsModified("deal", "v1", { stage: STAGE }, views)).toBe(false)
  })
})

/* ------------------------------------------------------------------------- *
 * redirectTargetFor
 * ------------------------------------------------------------------------- */

describe("redirectTargetFor", () => {
  it("returns null when there is no default", () => {
    expect(redirectTargetFor("organization", null)).toBeNull()
  })

  it("returns null for a default whose every filter was dropped, so a bare URL cannot loop", () => {
    // NAMED, and the reason the function exists rather than the caller inlining a template string.
    // U-2 promises the redirect target always carries at least one whitelisted key. If every key
    // was dropped, a redirect to a bare path lands on the same "no params at all" guard that just
    // fired, and the guard fires again — forever (T-40-20).
    const [gutted] = validateVisibleViews(
      "deal",
      [summary({ id: "v1", filters: { owner: GONE_USER, pipeline: "pipe-deleted" } })],
      CATALOG,
    )

    expect(gutted.droppedKeys).toEqual(["owner", "pipeline"])
    expect(gutted.summary.filters).toEqual({})
    expect(redirectTargetFor("deal", gutted.summary.filters)).toBeNull()
  })

  it("returns null for an empty filter set however it arrived", () => {
    expect(redirectTargetFor("organization", {})).toBeNull()
    expect(redirectTargetFor("deal", {})).toBeNull()
  })

  it("returns a query string for a surviving filter set", () => {
    expect(redirectTargetFor("organization", { search: "acme" })).toBe("?search=acme")
  })

  it("round-trips: the target parses back to the same filter set", () => {
    const filters: ViewFilters = { stage: STAGE, owner: ME, dateFrom: "2026-01-01" }
    const target = redirectTargetFor("deal", filters)

    expect(target).not.toBeNull()

    const parsed = new URLSearchParams((target as string).slice(1))

    expect(Object.fromEntries(parsed.entries())).toEqual(filters)
  })

  it("serialises in canonical whitelist order regardless of insertion order", () => {
    const forwards = redirectTargetFor("deal", { stage: STAGE, owner: ME })
    const backwards = redirectTargetFor("deal", { owner: ME, stage: STAGE })

    expect(forwards).toBe(backwards)
    // `stage` precedes `owner` in SAVEABLE_FILTER_KEYS.deal.
    expect(forwards).toBe(`?stage=${STAGE}&owner=${ME}`)
  })

  it("never emits the escape param as a redirect target", () => {
    // A target carrying `view=none` would be a redirect into the escape, which is nonsense: the
    // escape exists to STOP the redirect.
    const target = redirectTargetFor("organization", { search: "acme" })

    expect(target).not.toContain(VIEW_ESCAPE_VALUE)
    expect(target).not.toContain("view=")
  })

  it("drops a key the parser rejects rather than emitting it", () => {
    const target = redirectTargetFor("organization", {
      search: "   ",
    } as unknown as ViewFilters)

    expect(target).toBeNull()
  })

  it("never throws on a hostile filter set", () => {
    const hostile = [null, undefined, { search: 42 }, ["search"], "search=acme", { search: {} }]

    for (const filters of hostile) {
      expect(() =>
        redirectTargetFor("organization", filters as unknown as ViewFilters),
      ).not.toThrow()
    }
  })

  it("returns null for an unrecognised entity type", () => {
    const rogue = "__proto__" as ViewEntityType

    expect(redirectTargetFor(rogue, { search: "acme" })).toBeNull()
  })

  /* --- plan 40-18: the optional third parameter names the view --------------- */

  it("NAMES THE VIEW when given one, so a default landing arrives selected", () => {
    // Required rather than cosmetic. Without the id, a bare-URL landing on a default view is an
    // UNSELECTED url: the user's first filter tweak has no selection to preserve, and the landing
    // path would be the one place `isModified` stayed unreachable after 40-18. It is also U-4
    // honoured properly — the address bar says both what is filtered and which view it is.
    expect(redirectTargetFor("organization", { search: "acme" }, VIEW_1)).toBe(
      `?search=acme&view=${VIEW_1}`,
    )
    expect(redirectTargetFor("deal", { owner: ME, stage: STAGE }, VIEW_2)).toBe(
      `?stage=${STAGE}&owner=${ME}&view=${VIEW_2}`,
    )
  })

  it("still returns null for an empty validated set even when a view is named (T-40-20)", () => {
    // The no-loop guarantee must not be weakened by the new parameter: a redirect to `?view=<id>`
    // with no filters would be a target U-2 says cannot exist, and a bare path lands on the very
    // guard that just fired.
    expect(redirectTargetFor("organization", {}, VIEW_1)).toBeNull()
    expect(redirectTargetFor("organization", null, VIEW_1)).toBeNull()
    expect(redirectTargetFor("deal", { search: "acme" }, VIEW_1)).toBeNull()

    const [gutted] = validateVisibleViews(
      "deal",
      [summary({ id: VIEW_1, filters: { owner: GONE_USER, pipeline: "pipe-deleted" } })],
      CATALOG,
    )

    expect(redirectTargetFor("deal", gutted.summary.filters, VIEW_1)).toBeNull()
  })

  it("emits NO view key rather than a junk one when the id fails the grammar", () => {
    // The same refusal `withViewSelection` makes: a crafted value must never reach a navigation
    // target (T-40-85), and a redirect is a navigation target the server chose.
    for (const junk of ["<script>", "//evil.example", "a", "", "   ", "x".repeat(1024 * 1024)]) {
      const target = redirectTargetFor("organization", { search: "acme" }, junk)

      expect(target).toBe("?search=acme")
      expect(target).not.toContain("view=")
    }

    expect(redirectTargetFor("organization", { search: "acme" }, null)).toBe("?search=acme")
    expect(redirectTargetFor("organization", { search: "acme" }, undefined)).toBe("?search=acme")
  })

  it("never emits view=none, with or without a named view", () => {
    expect(redirectTargetFor("organization", { search: "acme" }, VIEW_1)).not.toContain(
      `view=${VIEW_ESCAPE_VALUE}`,
    )
    expect(redirectTargetFor("organization", { search: "acme" }, "none")).not.toContain("view=")
  })

  it("round-trips through the URL grammar: the target parses back to the same selection", () => {
    const target = redirectTargetFor("activity", { type: "call", search: "acme" }, VIEW_3)

    expect(target).not.toBeNull()

    const parsed = new URLSearchParams((target as string).slice(1))

    expect(parseViewSelection(parsed)).toEqual({ kind: "selection", viewId: VIEW_3 })
    expect(Object.fromEntries(parsed.entries())).toEqual({
      type: "call",
      search: "acme",
      view: VIEW_3,
    })
  })

  it("never throws on a hostile viewId", () => {
    const hostileIds = [null, undefined, "", "   ", "<script>", 42, [VIEW_1], { a: 1 }]

    for (const viewId of hostileIds) {
      expect(() =>
        redirectTargetFor("organization", { search: "acme" }, viewId as string | null),
      ).not.toThrow()
    }
  })
})

/* ------------------------------------------------------------------------- *
 * The composed bar state — the 40-05 regression
 * ------------------------------------------------------------------------- */

/**
 * WHY A COMPOSITION TEST EXISTS BESIDE THIRTY UNIT TESTS.
 *
 * Every unit above was correct and green. `selectViewForParams` returned a non-null id when asked;
 * `computeIsModified` returned `true` when handed a selected id whose filters differed. And the
 * COMPOSED result was still structurally impossible, because the wiring made one of their outputs a
 * constant: selection was derived from filter equality, `isModified` compared the same two sets, so
 * `selected && modified` could not occur. 40-05 measured it — 10 URLs x 3 views, 2 selections, ZERO
 * modified — and no test asserted the PAIR, so nothing was red.
 *
 * The sibling lesson from this same phase, and it is the same shape of hole: plan 40-05 moved a
 * visibility predicate out of a `WHERE` clause into a post-fetch `.filter()` and all 25 behavioural
 * assertions stayed green, because the caller received the same list either way. It took a
 * `.toSQL()` gate to see it. A green suite over the wrong surface is the failure mode; asserting the
 * composition is the fix.
 *
 * So this block CALLS the real functions in the real order and asserts the DISTRIBUTION of their
 * pairs. It must never recompute selection or modification inline — a sweep that did would be green
 * against any implementation, which is precisely the defect it exists to catch.
 */

interface BarState {
  selectedViewId: string | null
  isModified: boolean
  /** Mirrors the wrapper's own one-line derivation; B-5's live row needs it beside `isModified`. */
  canUpdateSelected: boolean
}

/**
 * The wrapper's decision path, minus the two database reads: `pickFilterParams` ->
 * `validateVisibleViews` -> `parseViewSelection` -> `selectViewForParams` -> `computeIsModified`,
 * in that order, with the same arguments `resolveSavedViewsBarProps` passes.
 *
 * Not a `.db.test.ts`, deliberately: `resolveSavedViewsBarProps` imports `@/db`, which constructs a
 * postgres client at module load, and these pure functions ARE the whole decision — they are the
 * thing that was wrong.
 */
function composeBarState(
  entityType: ViewEntityType,
  rawQuery: string,
  summaries: readonly SavedViewSummary[],
  catalog: ViewFilterCatalog,
): BarState {
  const rawParams = new URLSearchParams(rawQuery)
  const urlFilters = pickFilterParams(entityType, rawParams)
  const views = validateVisibleViews(entityType, summaries, catalog)
  const selection = parseViewSelection(rawParams)
  const selectedViewId = selectViewForParams(entityType, urlFilters, views, {
    viewEscape: selection.kind === "escape",
    viewId: selection.kind === "selection" ? selection.viewId : null,
  })
  const selected =
    selectedViewId === null
      ? undefined
      : views.find((candidate) => candidate.summary.id === selectedViewId)

  return {
    selectedViewId,
    isModified: computeIsModified(entityType, selectedViewId, urlFilters, views),
    canUpdateSelected: selected?.summary.canEdit ?? false,
  }
}

/** Three views on `/deals`, differing in filters AND in ownership. */
const SWEEP_VIEWS: readonly SavedViewSummary[] = [
  summary({
    id: VIEW_1,
    name: "Alpha",
    entityType: "deal",
    filters: { pipeline: PIPELINE, stage: STAGE },
    isOwnedByViewer: true,
    canEdit: true,
  }),
  // Somebody else's shared view: selectable and modifiable, but NOT updatable — B-5's fourth row.
  summary({
    id: VIEW_2,
    name: "Beta",
    entityType: "deal",
    filters: { owner: ME },
    isShared: true,
    isOwnedByViewer: false,
    canEdit: false,
  }),
  // Degraded: its `owner` no longer exists, so only `stage` survives validation.
  summary({
    id: VIEW_3,
    name: "Gamma",
    entityType: "deal",
    filters: { owner: GONE_USER, stage: STAGE },
    isOwnedByViewer: true,
    canEdit: true,
  }),
]

type SweepTag =
  | "bare"
  | "escape"
  | "filters-only"
  | "clean"
  | "modified"
  | "unresolved"
  | "junk"
  | "degraded"
  | "no-filters"

interface SweepRow {
  name: string
  query: string
  tag: SweepTag
  expected: { selectedViewId: string | null; isModified: boolean }
}

/**
 * SIXTEEN URLs x THREE VIEWS, deliberately shaped like the probe 40-05 ran and got zero from.
 */
const SWEEP: readonly SweepRow[] = [
  { name: "a bare URL", query: "", tag: "bare", expected: { selectedViewId: null, isModified: false } },
  {
    name: "the escape alone",
    query: "view=none",
    tag: "escape",
    expected: { selectedViewId: null, isModified: false },
  },
  {
    name: "the escape beside a view's exact filters",
    query: `view=none&pipeline=${PIPELINE}&stage=${STAGE}`,
    tag: "escape",
    expected: { selectedViewId: null, isModified: false },
  },
  {
    name: "a view's EXACT filters with no view key — the 40-05 case",
    query: `pipeline=${PIPELINE}&stage=${STAGE}`,
    tag: "filters-only",
    expected: { selectedViewId: null, isModified: false },
  },
  {
    name: "another view's exact filters with no view key",
    query: `owner=${ME}`,
    tag: "filters-only",
    expected: { selectedViewId: null, isModified: false },
  },
  {
    name: "a view opened cleanly",
    query: `pipeline=${PIPELINE}&stage=${STAGE}&view=${VIEW_1}`,
    tag: "clean",
    expected: { selectedViewId: VIEW_1, isModified: false },
  },
  {
    name: "a view opened cleanly, on page 2 — page is not a filter",
    query: `page=2&pipeline=${PIPELINE}&stage=${STAGE}&view=${VIEW_1}`,
    tag: "clean",
    expected: { selectedViewId: VIEW_1, isModified: false },
  },
  {
    name: "a view with a CHANGED filter",
    query: `pipeline=${PIPELINE}&stage=stage-other&view=${VIEW_1}`,
    tag: "modified",
    expected: { selectedViewId: VIEW_1, isModified: true },
  },
  {
    name: "a view with an ADDED filter",
    query: `pipeline=${PIPELINE}&stage=${STAGE}&owner=${ME}&view=${VIEW_1}`,
    tag: "modified",
    expected: { selectedViewId: VIEW_1, isModified: true },
  },
  {
    name: "a view with a REMOVED filter",
    query: `pipeline=${PIPELINE}&view=${VIEW_1}`,
    tag: "modified",
    expected: { selectedViewId: VIEW_1, isModified: true },
  },
  {
    name: "somebody else's shared view, opened cleanly",
    query: `owner=${ME}&view=${VIEW_2}`,
    tag: "clean",
    expected: { selectedViewId: VIEW_2, isModified: false },
  },
  {
    name: "somebody else's shared view, modified",
    query: `owner=${THEM}&view=${VIEW_2}`,
    tag: "modified",
    expected: { selectedViewId: VIEW_2, isModified: true },
  },
  {
    name: "a well-formed id naming no visible view",
    query: `pipeline=${PIPELINE}&stage=${STAGE}&view=${UNKNOWN_VIEW}`,
    tag: "unresolved",
    expected: { selectedViewId: null, isModified: false },
  },
  {
    name: "a hostile view value beside a real filter",
    query: `pipeline=${PIPELINE}&stage=${STAGE}&view=%3Cscript%3E`,
    tag: "junk",
    expected: { selectedViewId: null, isModified: false },
  },
  {
    name: "a degraded view opened at its surviving keys",
    query: `stage=${STAGE}&view=${VIEW_3}`,
    tag: "degraded",
    expected: { selectedViewId: VIEW_3, isModified: false },
  },
  {
    name: "a selection with no filters at all — U-2 refuses it",
    query: `view=${VIEW_1}`,
    tag: "no-filters",
    expected: { selectedViewId: null, isModified: false },
  },
]

interface SweepResult {
  row: SweepRow
  actual: BarState
}

let sweepCache: SweepResult[] | null = null

function sweep(): SweepResult[] {
  sweepCache ??= SWEEP.map((row) => ({
    row,
    actual: composeBarState("deal", row.query, SWEEP_VIEWS, CATALOG),
  }))

  return sweepCache
}

/** The distribution, rendered the way 40-05's measurement was, so a reader sees it rather than a boolean. */
function sweepTable(): string {
  const lines = sweep().map(({ row, actual }) => {
    const id =
      actual.selectedViewId === null ? "null" : `…${actual.selectedViewId.slice(-6)} (${row.tag})`

    return `  ${row.name.padEnd(52)} selected=${id.padEnd(22)} modified=${String(actual.isModified).padEnd(5)} canUpdate=${actual.canUpdateSelected}`
  })
  const selectedAndModified = sweep().filter(
    ({ actual }) => actual.selectedViewId !== null && actual.isModified,
  ).length

  return [
    "",
    `THE SWEEP: ${SWEEP.length} URLs x ${SWEEP_VIEWS.length} views`,
    ...lines,
    `  --> selections: ${sweep().filter(({ actual }) => actual.selectedViewId !== null).length}` +
      `, selected && modified: ${selectedAndModified}`,
    "",
  ].join("\n")
}

describe("the composed bar state — the 40-05 regression", () => {
  it.each(SWEEP)("$name resolves to its expected pair", (row) => {
    const actual = composeBarState("deal", row.query, SWEEP_VIEWS, CATALOG)

    expect(
      { selectedViewId: actual.selectedViewId, isModified: actual.isModified },
      sweepTable(),
    ).toEqual(row.expected)
  })

  it("REACHES `selected && modified` — the state 40-05 measured ZERO of", () => {
    const reached = sweep().filter(
      ({ actual }) => actual.selectedViewId !== null && actual.isModified,
    )

    expect(
      reached.length,
      "THE ASSERTION WHOSE ABSENCE LET THE DEFECT SHIP. 40-05 measured this composition over 10 " +
        "URLs x 3 views and got 2 selections and ZERO cases of selected-and-modified, because " +
        "selection was derived from filter equality and `isModified` compared the same two sets. " +
        "If this is 0, `?view=<id>` is no longer carried through a filter change and three " +
        "UI-SPEC surfaces are unreachable again: the 'view selected, modified' state, slot 2's " +
        `views.saveChanges (B-5), and the save dialog's target RadioGroup (S-3/S-4).${sweepTable()}`,
    ).toBeGreaterThan(0)
  })

  it("ANTI-VACUITY: also reaches `selected && NOT modified`, so a constant true cannot pass", () => {
    const clean = sweep().filter(
      ({ actual }) => actual.selectedViewId !== null && !actual.isModified,
    )

    expect(clean.length, sweepTable()).toBeGreaterThan(0)
  })

  it("and reaches no selection at all, so a constant id cannot pass either", () => {
    expect(
      sweep().filter(({ actual }) => actual.selectedViewId === null).length,
      sweepTable(),
    ).toBeGreaterThan(0)
  })

  it("makes B-5's saveChanges row live — selected, modified AND updatable", () => {
    // The row that was unreachable: `canSave && selectedViewId && isModified && canUpdateSelected`.
    expect(
      sweep().filter(
        ({ actual }) =>
          actual.selectedViewId !== null && actual.isModified && actual.canUpdateSelected,
      ).length,
      sweepTable(),
    ).toBeGreaterThan(0)

    // And its sibling, which resolves to `views.saveNew` instead: somebody else's shared view,
    // modified, not updatable. Both branches of the save dialog's target choice are now reachable.
    expect(
      sweep().filter(
        ({ actual }) =>
          actual.selectedViewId !== null && actual.isModified && !actual.canUpdateSelected,
      ).length,
      sweepTable(),
    ).toBeGreaterThan(0)
  })

  it("view=none rows are ALWAYS { null, false }, whatever else the URL says", () => {
    for (const { row, actual } of sweep().filter(({ row }) => row.tag === "escape")) {
      expect(
        { selectedViewId: actual.selectedViewId, isModified: actual.isModified },
        `${row.query}${sweepTable()}`,
      ).toEqual({ selectedViewId: null, isModified: false })
    }
  })

  it("a filters-only row is ALWAYS { null, false } — even when the filters equal a view's exactly", () => {
    const rows = sweep().filter(({ row }) => row.tag === "filters-only")

    expect(rows.length).toBeGreaterThan(0)

    for (const { row, actual } of rows) {
      expect(
        { selectedViewId: actual.selectedViewId, isModified: actual.isModified },
        `${row.query} — this is the accepted consequence of the URL carrier: equality never ` +
          `identified a view uniquely (two views hold identical filters the moment one is forked), ` +
          `so a URL that does not SAY which view it is showing shows All records.${sweepTable()}`,
      ).toEqual({ selectedViewId: null, isModified: false })
    }
  })

  it("an unknown id and a junk value are both { null, false }, and neither throws", () => {
    for (const row of SWEEP.filter((r) => r.tag === "unresolved" || r.tag === "junk")) {
      expect(() => composeBarState("deal", row.query, SWEEP_VIEWS, CATALOG)).not.toThrow()

      const actual = composeBarState("deal", row.query, SWEEP_VIEWS, CATALOG)

      expect({ selectedViewId: actual.selectedViewId, isModified: actual.isModified }).toEqual({
        selectedViewId: null,
        isModified: false,
      })
    }
  })

  it("the degraded row is { selected, false } — degraded is not modified", () => {
    const rows = sweep().filter(({ row }) => row.tag === "degraded")

    expect(rows.length).toBeGreaterThan(0)

    for (const { actual } of rows) {
      expect(actual.selectedViewId, sweepTable()).toBe(VIEW_3)
      expect(
        actual.isModified,
        `a view whose owner was deleted, opened at the keys that still work, is DEGRADED and not ` +
          `MODIFIED — labelling it modified invites the user to save the damage (B-2 reason 2)` +
          sweepTable(),
      ).toBe(false)
    }
  })

  it("never throws over the whole sweep, on any entity type", () => {
    for (const entityType of ["organization", "person", "deal", "activity"] as const) {
      for (const row of SWEEP) {
        expect(() => composeBarState(entityType, row.query, SWEEP_VIEWS, CATALOG)).not.toThrow()
      }
    }
  })
})
