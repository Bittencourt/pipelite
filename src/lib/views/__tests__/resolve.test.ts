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
 */
import { describe, it, expect } from "vitest"

import {
  computeIsModified,
  redirectTargetFor,
  selectViewForParams,
  validateVisibleViews,
  type ValidatedView,
} from "../resolve"
import { VIEW_ESCAPE_VALUE } from "../url-params"

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
  it("returns the id of the view whose validated filters equal the URL", () => {
    // ANTI-VACUITY. Without a non-null expectation somewhere, a function that always returned
    // `null` would satisfy every other assertion in this block.
    const views = [
      validated({ id: "v1", filters: { search: "acme" } }),
      validated({ id: "v2", filters: { search: "other" } }),
    ]

    expect(selectViewForParams("organization", { search: "acme" }, views)).toBe("v1")
  })

  it("returns null when the URL carries no filters, even with views available", () => {
    const views = [validated({ id: "v1", filters: { search: "acme" } })]

    expect(selectViewForParams("organization", {}, views)).toBeNull()
  })

  it("returns null when nothing matches", () => {
    const views = [validated({ id: "v1", filters: { search: "acme" } })]

    expect(selectViewForParams("organization", { search: "different" }, views)).toBeNull()
  })

  it("matches regardless of the order the URL keys were written in", () => {
    // `filtersToSearchParams` serialises in whitelist order, which is what makes this a string
    // comparison. A view saved as {stage, owner} and a URL built as ?owner=…&stage=… must match, or
    // every view renders "Modified" (the reason 40-01 gave the whitelist a canonical order).
    const views = [validated({ id: "v1", filters: { stage: STAGE, owner: ME } })]

    expect(selectViewForParams("deal", { owner: ME, stage: STAGE }, views)).toBe("v1")
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

  it("compares the VALIDATED set, so a degraded view is still selectable at its surviving keys", () => {
    const views = validateVisibleViews(
      "deal",
      [summary({ id: "v1", filters: { owner: GONE_USER, stage: STAGE } })],
      CATALOG,
    )

    // The stored blob has two keys; only one survives, and that one is what the URL carries.
    expect(selectViewForParams("deal", { stage: STAGE }, views)).toBe("v1")
    expect(selectViewForParams("deal", { owner: GONE_USER, stage: STAGE }, views)).toBeNull()
  })

  describe("deterministic tiebreak when several views match", () => {
    it("prefers the viewer's own view over a shared one", () => {
      // This happens the moment a user forks somebody's shared view: two views, identical filters.
      const shared = validated({
        id: "a-shared",
        name: "A",
        filters: { search: "acme" },
        isShared: true,
        isOwnedByViewer: false,
      })
      const mine = validated({
        id: "z-mine",
        name: "Z",
        filters: { search: "acme" },
        isOwnedByViewer: true,
      })

      // Asserted in both input orders, so the result is the rule and not the array order.
      expect(selectViewForParams("organization", { search: "acme" }, [shared, mine])).toBe("z-mine")
      expect(selectViewForParams("organization", { search: "acme" }, [mine, shared])).toBe("z-mine")
    })

    it("then prefers the lower name", () => {
      const later = validated({ id: "v-later", name: "Beta", filters: { search: "acme" } })
      const earlier = validated({ id: "v-earlier", name: "Alpha", filters: { search: "acme" } })

      expect(selectViewForParams("organization", { search: "acme" }, [later, earlier])).toBe(
        "v-earlier",
      )
      expect(selectViewForParams("organization", { search: "acme" }, [earlier, later])).toBe(
        "v-earlier",
      )
    })

    it("then prefers the lower id, so the result is total", () => {
      const b = validated({ id: "id-b", name: "Same", filters: { search: "acme" } })
      const a = validated({ id: "id-a", name: "Same", filters: { search: "acme" } })

      expect(selectViewForParams("organization", { search: "acme" }, [b, a])).toBe("id-a")
      expect(selectViewForParams("organization", { search: "acme" }, [a, b])).toBe("id-a")
    })
  })

  it("never throws on a hostile filter map", () => {
    const views = [validated({ id: "v1", filters: { search: "acme" } })]
    const hostile = [null, undefined, { search: 42 }, { search: ["a"] }, ["search"], "search=acme"]

    for (const filters of hostile) {
      expect(() =>
        selectViewForParams("organization", filters as unknown as ViewFilters, views),
      ).not.toThrow()
    }
  })
})

/* ------------------------------------------------------------------------- *
 * computeIsModified
 * ------------------------------------------------------------------------- */

describe("computeIsModified", () => {
  it("is false when no view is selected", () => {
    const views = [validated({ id: "v1", filters: { search: "acme" } })]

    expect(computeIsModified(null, { search: "anything" }, views)).toBe(false)
  })

  it("is false when the URL equals the selected view's validated filters", () => {
    const views = [validated({ id: "v1", filters: { search: "acme" } })]

    expect(computeIsModified("v1", { search: "acme" }, views)).toBe(false)
  })

  it("is true when the URL differs from the selected view's filters", () => {
    // ANTI-VACUITY: a function returning a constant `false` would satisfy everything else here.
    const views = [validated({ id: "v1", filters: { search: "acme" } })]

    expect(computeIsModified("v1", { search: "changed" }, views)).toBe(true)
    expect(computeIsModified("v1", {}, views)).toBe(true)
    expect(computeIsModified("v1", { search: "acme", industry: "x" }, views)).toBe(false)
  })

  it("is true when a whitelisted key was added to the URL", () => {
    const views = [validated({ id: "v1", filters: { stage: STAGE } })]

    expect(computeIsModified("v1", { stage: STAGE, owner: ME }, views)).toBe(true)
  })

  it("is false when the selected id matches no known view", () => {
    const views = [validated({ id: "v1", filters: { search: "acme" } })]

    expect(computeIsModified("does-not-exist", { search: "anything" }, views)).toBe(false)
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
    expect(computeIsModified("v1", { stage: STAGE }, views)).toBe(false)
    // And the other direction, so this is not satisfiable by a constant `false`.
    expect(computeIsModified("v1", { stage: STAGE, owner: ME }, views)).toBe(true)
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
    expect(computeIsModified("v1", { stage: STAGE }, views)).toBe(false)
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
})
