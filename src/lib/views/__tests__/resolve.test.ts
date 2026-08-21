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
import { VIEW_ESCAPE_VALUE, parseViewSelection } from "../url-params"

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
