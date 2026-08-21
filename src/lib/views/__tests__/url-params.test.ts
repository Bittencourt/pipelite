/**
 * V-40-6 — THE PURE-FUNCTION GATE ON THE SAVED-VIEW URL VOCABULARY.
 *
 * Three things are proved here, and the second is the one that matters most:
 *
 *   (a) `pickFilterParams` accepts only the per-entity whitelist and rejects `page`, `view`,
 *       prototype-named keys, repeated params and megabyte values — and NEVER throws (U-3);
 *   (b) `hasSaveableFilter` and `hasExportableFilter` DIVERGE on `deal`/`pipeline`, asserted in
 *       both directions (E-2). That divergence is the guard that keeps Phase 38's
 *       unbounded-export prohibition intact after Phase 40 replaced the admin gate with it;
 *   (c) `withViewEscape` is idempotent and appends `view=none` exactly when no whitelisted key
 *       survives (U-1) — added by task 2, in its own describe block at the bottom.
 *
 * Plan 40-18 adds a fourth, and it is the one that makes "this view, modified" a state that can
 * exist at all:
 *
 *   (d) `?view=<uuid>` is a SELECTION, distinct from the `?view=none` escape, and `withViewEscape`
 *       PRESERVES it whenever a filter survives — so changing a filter with a view open keeps the
 *       view open. Plan 40-05 measured that without this, `selectedViewId && isModified` is
 *       unrepresentable: 10 URLs x 3 views, 2 selections, ZERO modified.
 */
import { describe, it, expect } from "vitest"

import {
  EXCLUDED_URL_KEYS,
  EXPORTABLE_FILTER_KEYS,
  MAX_FILTER_VALUE_LENGTH,
  SAVEABLE_FILTER_KEYS,
  VIEW_ENTITY_TYPES,
  VIEW_ESCAPE_KEY,
  VIEW_ESCAPE_VALUE,
  VIEW_ID_PATTERN,
  countFilters,
  filtersToSearchParams,
  hasExportableFilter,
  hasSaveableFilter,
  narrowViewSelectionId,
  parseViewSelection,
  pickFilterParams,
  withViewEscape,
  withViewSelection,
  type FilterParamSource,
} from "../url-params"
import { narrowViewId } from "../write-guards"
import type { ViewEntityType } from "../types"

/**
 * A real view id. Every row in `saved_views` gets its id from
 * `text("id").primaryKey().$defaultFn(() => crypto.randomUUID())` and `createView` accepts no `id`
 * from a caller, so a v4-shaped uuid is not an approximation of the id space — it IS the id space.
 */
const VIEW_UUID = "0b7e4d1a-3c5f-4a8b-9d2e-7f6a1b2c3d4e"
const OTHER_UUID = "5f8d0c2b-6a1e-4d3c-8b7a-9e0f1d2c3b4a"

/**
 * Inputs that must all be survivable. Every one of these is reachable: the URL rows from a crafted
 * address bar, the `JSON.parse` rows from a `filters` JSONB blob written by an older whitelist, and
 * the throwing getter from nothing in particular — it is here because "never throws" is a contract
 * about the function, not about the callers that happen to exist today.
 */
const HOSTILE_SOURCES: readonly { name: string; source: unknown }[] = [
  { name: "undefined", source: undefined },
  { name: "null", source: null },
  { name: "a number", source: 42 },
  { name: "a bare string", source: "search=acme" },
  { name: "an array", source: ["search", "acme"] },
  { name: "an empty object", source: {} },
  {
    name: "a null-prototype object",
    source: Object.assign(Object.create(null), { search: "acme" }),
  },
  {
    name: "a JSON __proto__ payload",
    source: JSON.parse('{"__proto__":{"polluted":true},"search":"ok"}'),
  },
  {
    name: "a JSON constructor payload",
    source: JSON.parse('{"constructor":{"prototype":{"polluted":true}}}'),
  },
  {
    name: "prototype-named own keys",
    source: JSON.parse('{"__proto__":"a","constructor":"b","prototype":"c","toString":"d"}'),
  },
  { name: "an empty-array value", source: { search: [] } },
  { name: "a repeated value", source: { search: ["a", "b"] } },
  { name: "a numeric value", source: { search: 7 } },
  { name: "a null value", source: { search: null } },
  { name: "a nested-object value", source: { search: { toString: () => "boom" } } },
  { name: "a 1 MiB value", source: { search: "x".repeat(1024 * 1024) } },
  {
    name: "a throwing getter",
    source: {
      get search(): string {
        throw new Error("boom")
      },
    },
  },
  {
    name: "a URLSearchParams with page and view",
    source: new URLSearchParams("search=acme&page=2&view=none"),
  },
  {
    name: "a URLSearchParams with invalid percent-encoding",
    source: new URLSearchParams("search=%E0%A4%A"),
  },
  { name: "every excluded key at once", source: { page: "2", view: "none", sort: "name", foo: "bar" } },
]

/** Entity types crossed with hostile sources — the totality table used by several suites below. */
const TOTALITY_TABLE: readonly { entityType: ViewEntityType; name: string; source: unknown }[] =
  VIEW_ENTITY_TYPES.flatMap((entityType) =>
    HOSTILE_SOURCES.map(({ name, source }) => ({ entityType, name, source })),
  )

describe("SAVEABLE_FILTER_KEYS — U-3, the per-entity stored-key whitelist IS the definition", () => {
  it("organization stores exactly [search]", () => {
    expect(SAVEABLE_FILTER_KEYS.organization).toEqual(["search"])
  })

  it("person stores exactly [search]", () => {
    expect(SAVEABLE_FILTER_KEYS.person).toEqual(["search"])
  })

  it("deal stores exactly [pipeline, stage, owner, assignee, dateFrom, dateTo]", () => {
    expect(SAVEABLE_FILTER_KEYS.deal).toEqual([
      "pipeline",
      "stage",
      "owner",
      "assignee",
      "dateFrom",
      "dateTo",
    ])
  })

  it("activity stores exactly [type, owner, assignee, status, dateFrom, dateTo, search]", () => {
    expect(SAVEABLE_FILTER_KEYS.activity).toEqual([
      "type",
      "owner",
      "assignee",
      "status",
      "dateFrom",
      "dateTo",
      "search",
    ])
  })

  it.each(["page", "view"])(
    "excludes %s on every entity type — U-3's two universal exclusions",
    (excluded) => {
      for (const entityType of VIEW_ENTITY_TYPES) {
        expect(SAVEABLE_FILTER_KEYS[entityType]).not.toContain(excluded)
      }
    },
  )

  it("EXCLUDED_URL_KEYS is exactly [page, view]", () => {
    expect([...EXCLUDED_URL_KEYS]).toEqual(["page", "view"])
  })

  it("VIEW_ENTITY_TYPES covers every key of both tables and nothing else", () => {
    // A fifth entity type is a compile error in the tables (they are Record<ViewEntityType, …>);
    // this is the runtime half, so the frozen array cannot drift away from them either.
    expect([...VIEW_ENTITY_TYPES].sort()).toEqual(Object.keys(SAVEABLE_FILTER_KEYS).sort())
    expect([...VIEW_ENTITY_TYPES].sort()).toEqual(Object.keys(EXPORTABLE_FILTER_KEYS).sort())
  })
})

describe("EXPORTABLE_FILTER_KEYS — E-2, its own table and not a derivation", () => {
  it("organization exports on exactly [search]", () => {
    expect(EXPORTABLE_FILTER_KEYS.organization).toEqual(["search"])
  })

  it("person exports on exactly [search]", () => {
    expect(EXPORTABLE_FILTER_KEYS.person).toEqual(["search"])
  })

  it("deal exports on exactly [stage, owner, assignee, dateFrom, dateTo] — pipeline ABSENT", () => {
    expect(EXPORTABLE_FILTER_KEYS.deal).toEqual([
      "stage",
      "owner",
      "assignee",
      "dateFrom",
      "dateTo",
    ])
    expect(
      EXPORTABLE_FILTER_KEYS.deal,
      "pipeline is a board selector, not a filter: 25,195 live deals scoped only by board is the " +
        "unbounded export 38-CONTEXT.md:110-116 exists to prevent.",
    ).not.toContain("pipeline")
  })

  it("activity exports on exactly [type, owner, assignee, status, dateFrom, dateTo, search]", () => {
    expect(EXPORTABLE_FILTER_KEYS.activity).toEqual([
      "type",
      "owner",
      "assignee",
      "status",
      "dateFrom",
      "dateTo",
      "search",
    ])
  })

  it("is a subset of SAVEABLE_FILTER_KEYS for every entity type", () => {
    // A loop over VIEW_ENTITY_TYPES rather than four assertions, so a fifth entity type cannot be
    // added without satisfying it.
    for (const entityType of VIEW_ENTITY_TYPES) {
      for (const key of EXPORTABLE_FILTER_KEYS[entityType]) {
        expect(SAVEABLE_FILTER_KEYS[entityType]).toContain(key)
      }
    }
  })

  it("differs from SAVEABLE_FILTER_KEYS in exactly one place: deal/pipeline", () => {
    const difference: Record<string, string[]> = {}

    for (const entityType of VIEW_ENTITY_TYPES) {
      const missing = SAVEABLE_FILTER_KEYS[entityType].filter(
        (key) => !EXPORTABLE_FILTER_KEYS[entityType].includes(key),
      )
      if (missing.length > 0) difference[entityType] = missing
    }

    expect(difference).toEqual({ deal: ["pipeline"] })
  })
})

describe("the E-2 divergence — asserted in both directions and by name", () => {
  it("a pipeline-only deals view IS saveable", () => {
    expect(
      hasSaveableFilter("deal", { pipeline: "p1" }),
      "Decision 4: pipeline selects which kanban board renders, so a deals view without it is " +
        "not reproducible. hasSaveableFilter MUST count pipeline.",
    ).toBe(true)
  })

  it("a pipeline-only deals view is NOT exportable", () => {
    expect(
      hasExportableFilter("deal", { pipeline: "p1" }),
      "If this is ever true the hole 38-CONTEXT.md:110-116 forbids is reopened: a board selector " +
        "scopes to up to 25,195 deals, which is an unbounded export. hasExportableFilter is NOT " +
        "derivable from hasSaveableFilter — do not 'simplify' the two tables into one.",
    ).toBe(false)
  })

  it("a pipeline PLUS a real filter is exportable", () => {
    expect(
      hasExportableFilter("deal", { pipeline: "p1", owner: "u1" }),
      "owner is applied as a SQL predicate by the deals fetcher, so it narrows the export. The " +
        "guard rejects unbounded exports, not exports that happen to carry a pipeline.",
    ).toBe(true)
  })

  it("an empty filter set is neither saveable nor exportable", () => {
    expect(
      hasSaveableFilter("organization", {}),
      "An empty filter set resolves to all 46,054 organizations — 38-CONTEXT.md:110-116.",
    ).toBe(false)
    expect(hasExportableFilter("organization", {})).toBe(false)
  })

  it("an activities status filter is exportable", () => {
    expect(
      hasExportableFilter("activity", { status: "overdue" }),
      "status is in the URL contract and 40-07 gates every exportable key as a SQL predicate in " +
        "its fetcher; plan 40-13 makes this one real. See 40-CONTEXT.md amendment A8.",
    ).toBe(true)
  })

  it("both predicates are computed from the PICKED map, so a junk value cannot authorize", () => {
    const tooLong = { owner: "u".repeat(MAX_FILTER_VALUE_LENGTH + 1) }
    expect(hasSaveableFilter("deal", tooLong)).toBe(false)
    expect(hasExportableFilter("deal", tooLong)).toBe(false)

    expect(hasSaveableFilter("deal", { owner: "   " })).toBe(false)
    expect(hasExportableFilter("deal", { owner: "   " })).toBe(false)

    // `page` and `view` are not filters on any surface, so neither predicate may count them.
    expect(hasSaveableFilter("activity", { page: "3", view: "none" })).toBe(false)
    expect(hasExportableFilter("activity", { page: "3", view: "none" })).toBe(false)
  })

  it.each(TOTALITY_TABLE)("never throws: $entityType with $name", ({ entityType, source }) => {
    expect(() => hasSaveableFilter(entityType, source as FilterParamSource)).not.toThrow()
    expect(() => hasExportableFilter(entityType, source as FilterParamSource)).not.toThrow()
  })
})

describe("pickFilterParams — the input-validation control (T-40-01, T-40-02)", () => {
  it("keeps whitelisted keys and drops everything else", () => {
    expect(
      pickFilterParams("deal", {
        pipeline: "p1",
        owner: "u1",
        search: "acme",
        sort: "name",
        limit: "9999",
      }),
    ).toEqual({ pipeline: "p1", owner: "u1" })

    expect(pickFilterParams("activity", { type: "call", search: "acme", stage: "s1" })).toEqual({
      type: "call",
      search: "acme",
    })
  })

  it("drops page and view on every entity type", () => {
    for (const entityType of VIEW_ENTITY_TYPES) {
      const picked = pickFilterParams(entityType, { page: "2", view: "none" })
      expect(picked).not.toHaveProperty("page")
      expect(picked).not.toHaveProperty("view")
      expect(Object.keys(picked)).toEqual([])
    }
  })

  it("reads a URLSearchParams as well as a plain object", () => {
    expect(
      pickFilterParams("activity", new URLSearchParams("type=call&page=2&view=none&search=acme")),
    ).toEqual({ type: "call", search: "acme" })
  })

  it("treats prototype-named keys as ordinary non-members and pollutes nothing", () => {
    const payload = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"prototype":"x","toString":"y","search":"acme"}',
    )
    const result = pickFilterParams("organization", payload)

    expect(result).toEqual({ search: "acme" })
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect("polluted" in ({} as never)).toBe(false)
    expect((({}) as Record<string, unknown>).polluted).toBeUndefined()
  })

  it("drops empty and whitespace-only values rather than keeping them present-and-empty", () => {
    expect(pickFilterParams("organization", { search: "" })).toEqual({})
    expect(pickFilterParams("organization", { search: "   " })).toEqual({})
    expect(pickFilterParams("organization", { search: "\t\n " })).toEqual({})
    expect("search" in pickFilterParams("organization", { search: "" })).toBe(false)
  })

  it("takes the FIRST value of a repeated param", () => {
    expect(pickFilterParams("organization", { search: ["a", "b"] })).toEqual({ search: "a" })
    expect(pickFilterParams("organization", new URLSearchParams("search=a&search=b"))).toEqual({
      search: "a",
    })
  })

  it("drops a value longer than MAX_FILTER_VALUE_LENGTH", () => {
    expect(MAX_FILTER_VALUE_LENGTH).toBeGreaterThan(36) // a uuid must fit
    expect(MAX_FILTER_VALUE_LENGTH).toBeLessThan(1000) // "low hundreds"

    const oneMebibyte = "x".repeat(1024 * 1024)
    expect(pickFilterParams("organization", { search: oneMebibyte })).toEqual({})

    const atTheCap = "x".repeat(MAX_FILTER_VALUE_LENGTH)
    expect(pickFilterParams("organization", { search: atTheCap })).toEqual({ search: atTheCap })

    const overTheCap = "x".repeat(MAX_FILTER_VALUE_LENGTH + 1)
    expect(pickFilterParams("organization", { search: overTheCap })).toEqual({})
  })

  it("drops values that are not strings", () => {
    expect(pickFilterParams("organization", { search: 7 })).toEqual({})
    expect(pickFilterParams("organization", { search: null })).toEqual({})
    expect(pickFilterParams("organization", { search: [] })).toEqual({})
    expect(pickFilterParams("organization", { search: { toString: () => "boom" } })).toEqual({})
  })

  it("returns keys in whitelist order, not in the caller's insertion order", () => {
    expect(
      Object.keys(pickFilterParams("deal", { dateTo: "2026-01-31", pipeline: "p1", owner: "u1" })),
    ).toEqual(["pipeline", "owner", "dateTo"])
  })

  it.each(TOTALITY_TABLE)("never throws: $entityType with $name", ({ entityType, source }) => {
    expect(() => pickFilterParams(entityType, source as FilterParamSource)).not.toThrow()
    expect(Object.getPrototypeOf(pickFilterParams(entityType, source as FilterParamSource))).toBe(
      Object.prototype,
    )
  })

  it("survives an unrecognised entity type", () => {
    // The entityType reaching this module from a stored blob is untrusted too, so the table
    // lookup is a membership test rather than a property read.
    expect(() => pickFilterParams("__proto__" as ViewEntityType, { search: "acme" })).not.toThrow()
    expect(pickFilterParams("__proto__" as ViewEntityType, { search: "acme" })).toEqual({})
    expect(pickFilterParams("nope" as ViewEntityType, { search: "acme" })).toEqual({})
  })
})

describe("countFilters — the number the user reads is the number the parser accepted (G-3)", () => {
  it.each(TOTALITY_TABLE)(
    "agrees with pickFilterParams for $entityType with $name",
    ({ entityType, source }) => {
      expect(countFilters(entityType, source as FilterParamSource)).toBe(
        Object.keys(pickFilterParams(entityType, source as FilterParamSource)).length,
      )
    },
  )

  it("counts what a real view carries", () => {
    expect(countFilters("deal", { pipeline: "p1", owner: "u1", page: "4" })).toBe(2)
    expect(countFilters("organization", { search: "acme" })).toBe(1)
    expect(countFilters("organization", {})).toBe(0)
  })
})

describe("filtersToSearchParams — stable order, so plan 40-05's comparison is order-independent", () => {
  it("serialises the same pairs to the same string regardless of insertion order", () => {
    const a = filtersToSearchParams("deal", {
      pipeline: "p1",
      stage: "s1",
      owner: "u1",
      dateFrom: "2026-01-01",
    })
    const b = filtersToSearchParams("deal", {
      dateFrom: "2026-01-01",
      owner: "u1",
      stage: "s1",
      pipeline: "p1",
    })

    expect(a.toString()).toBe(b.toString())
  })

  it("uses SAVEABLE_FILTER_KEYS order, not Object.keys order", () => {
    const params = filtersToSearchParams("activity", {
      search: "acme",
      type: "call",
      status: "overdue",
    })

    expect([...params.keys()]).toEqual(["type", "status", "search"])
  })

  it("drops non-whitelisted, excluded and empty values just as pickFilterParams does", () => {
    const params = filtersToSearchParams("organization", {
      search: "acme",
      page: "2",
      view: "none",
      owner: "u1",
    })

    expect(params.toString()).toBe("search=acme")
  })

  it.each(TOTALITY_TABLE)("never throws: $entityType with $name", ({ entityType, source }) => {
    expect(() => filtersToSearchParams(entityType, source as FilterParamSource)).not.toThrow()
  })
})

/**
 * A `URLSearchParams` that refuses to be written to, standing in for `next/navigation`'s
 * `ReadonlyURLSearchParams`. Four of the six call sites build their query string from
 * `useSearchParams()`, which returns exactly that, so a `withViewEscape` that mutated its argument
 * instead of a clone would throw in the browser and pass every value-based assertion here.
 */
class ReadonlyParams extends URLSearchParams {
  override delete(): never {
    throw new TypeError("cannot mutate a read-only URLSearchParams")
  }
  override set(): never {
    throw new TypeError("cannot mutate a read-only URLSearchParams")
  }
  override append(): never {
    throw new TypeError("cannot mutate a read-only URLSearchParams")
  }
}

/** Every shape a caller's query string can take, and what each must mean. */
const ESCAPE_TABLE = [
  { name: "no params at all", entityType: "organization", query: "" },
  { name: "a real search filter", entityType: "organization", query: "search=acme" },
  { name: "an empty search value", entityType: "organization", query: "search=" },
  { name: "a whitespace-only search value", entityType: "organization", query: "search=%20%20" },
  { name: "a pipeline-only deals URL", entityType: "deal", query: "pipeline=p1" },
  { name: "page alone", entityType: "organization", query: "page=2" },
  {
    name: "a pre-existing escape beside a real filter",
    entityType: "organization",
    query: "search=acme&view=none",
  },
  { name: "an already-escaped bare URL", entityType: "organization", query: "view=none" },
  { name: "a hostile view value", entityType: "organization", query: "view=%3Cscript%3E" },
  {
    name: "only non-saveable keys",
    entityType: "activity",
    query: "page=2&view=none&sort=name&foo=bar",
  },
  {
    name: "a full activities filter set",
    entityType: "activity",
    query: "type=call&status=overdue&search=acme&page=3",
  },
  // --- plan 40-18: the selection rows. Idempotence must hold over these too, because a selection
  // that grew a second `view` key on the second application would be a URL naming two views.
  {
    name: "a selection beside a real filter",
    entityType: "organization",
    query: `search=acme&view=${VIEW_UUID}`,
  },
  {
    name: "a selection whose last filter went",
    entityType: "organization",
    query: `search=&view=${VIEW_UUID}`,
  },
  {
    name: "a selection beside page and a filter",
    entityType: "activity",
    query: `status=overdue&page=2&view=${VIEW_UUID}`,
  },
  {
    name: "a hostile view value beside a surviving filter",
    entityType: "organization",
    query: "search=acme&view=%3Cscript%3E",
  },
  {
    name: "a repeated view value beside a surviving filter",
    entityType: "organization",
    query: "search=acme&view=a&view=b",
  },
] as const satisfies readonly { name: string; entityType: ViewEntityType; query: string }[]

describe("withViewEscape — U-1, the ?view=none serialiser", () => {
  it("returns a query string with no leading question mark", () => {
    for (const { entityType, query } of ESCAPE_TABLE) {
      expect(withViewEscape(entityType, new URLSearchParams(query)).startsWith("?")).toBe(false)
    }
  })

  it("appends the escape to a URL with no params at all", () => {
    expect(withViewEscape("organization", new URLSearchParams())).toBe("view=none")
    expect(`${VIEW_ESCAPE_KEY}=${VIEW_ESCAPE_VALUE}`).toBe("view=none")
  })

  it("leaves a URL that already carries a real filter alone", () => {
    const result = withViewEscape("organization", new URLSearchParams("search=acme"))

    expect(new URLSearchParams(result).has("view")).toBe(false)
    expect(result).toBe("search=acme")
  })

  it("escapes an EMPTY search value — the /organizations empty-search branch", () => {
    // The exact case that must not bounce the user into their default view: clearing the search box
    // navigates to a path whose only param is `search=`, which is not a filter.
    expect(withViewEscape("organization", new URLSearchParams("search="))).toBe("view=none")
    expect(withViewEscape("person", new URLSearchParams("search=%20%20"))).toBe("view=none")
  })

  it("does NOT escape a pipeline-only deals URL — pipeline is saveable", () => {
    // Which is why kanban-board.tsx's two router.replace(?pipeline=…) calls are already safe and
    // must not be "fixed".
    const result = withViewEscape("deal", new URLSearchParams("pipeline=p1"))

    expect(new URLSearchParams(result).has("view")).toBe(false)
    expect(result).toBe("pipeline=p1")
  })

  it("preserves page and still escapes — page is not a filter but Load More depends on it", () => {
    const result = withViewEscape("organization", new URLSearchParams("page=2"))

    expect(result).toContain("page=2")
    expect(result).toContain("view=none")
  })

  it("REMOVES a pre-existing escape once a real filter is present", () => {
    const result = withViewEscape("organization", new URLSearchParams("search=acme&view=none"))

    expect(new URLSearchParams(result).has("view")).toBe(false)
    expect(result).toBe("search=acme")
  })

  it("normalises a hostile view value rather than carrying it into a navigation (T-40-05)", () => {
    expect(withViewEscape("organization", new URLSearchParams("view=%3Cscript%3E"))).toBe(
      "view=none",
    )
    expect(withViewEscape("organization", new URLSearchParams("view=%2F%2Fevil.example"))).toBe(
      "view=none",
    )
    expect(
      withViewEscape("organization", new URLSearchParams("view=a&view=b&view=c")),
      "every value of a repeated view param is deleted, not just the first",
    ).toBe("view=none")
  })

  it("removes a whitelisted key whose value the parser rejected, and keeps the rest", () => {
    // The plan's five-step recipe would have returned `search=&view=none` here. `/organizations`
    // and `/people` push the bare path with no `search` key when the box is emptied
    // (data-table.tsx:293), so routing that through this helper must not start leaving one behind.
    expect(withViewEscape("organization", new URLSearchParams("search=&page=2"))).toBe(
      "page=2&view=none",
    )
    expect(
      withViewEscape("deal", new URLSearchParams(`owner=${"u".repeat(1024 * 1024)}&stage=s1`)),
    ).toBe("stage=s1")
    expect(withViewEscape("organization", new URLSearchParams("search=a&search=b"))).toBe(
      "search=a",
    )
  })

  it("emits the whitelisted portion in whitelist order, whatever order it arrived in", () => {
    // Which is what lets plan 40-05 compare a URL against a stored blob as strings.
    expect(withViewEscape("deal", new URLSearchParams("dateTo=2026-01-31&pipeline=p1&owner=u1"))).toBe(
      withViewEscape("deal", new URLSearchParams("owner=u1&dateTo=2026-01-31&pipeline=p1")),
    )
    expect([
      ...new URLSearchParams(
        withViewEscape("activity", new URLSearchParams("search=acme&page=3&type=call")),
      ).keys(),
    ]).toEqual(["page", "type", "search"])
  })

  it("keeps params it does not own, escape or no escape", () => {
    const escaped = new URLSearchParams(
      withViewEscape("activity", new URLSearchParams("sort=name&foo=bar")),
    )
    expect(escaped.get("sort")).toBe("name")
    expect(escaped.get("foo")).toBe("bar")

    const unescaped = new URLSearchParams(
      withViewEscape("activity", new URLSearchParams("sort=name&type=call")),
    )
    expect(unescaped.get("sort")).toBe("name")
    expect(unescaped.has("view")).toBe(false)
  })

  it("ANTI-VACUITY: a params object of ONLY non-saveable keys still gets the escape", () => {
    // This is the one assertion a regression that simply dropped the escape would fail. Every
    // "has no view key" test above would still pass with `withViewEscape` reduced to
    // `params.toString()`, so without this test the suite would be green on a broken helper.
    const result = new URLSearchParams(
      withViewEscape("activity", new URLSearchParams("page=2&view=none&sort=name&foo=bar")),
    )

    expect(result.getAll(VIEW_ESCAPE_KEY)).toEqual([VIEW_ESCAPE_VALUE])
  })

  it.each(ESCAPE_TABLE)("is idempotent: $name", ({ entityType, query }) => {
    const once = withViewEscape(entityType, new URLSearchParams(query))
    const twice = withViewEscape(entityType, new URLSearchParams(once))
    const thrice = withViewEscape(entityType, new URLSearchParams(twice))

    expect(twice).toBe(once)
    expect(thrice).toBe(once)
    // And the escape never accumulates: at most one `view` key, always the canonical value.
    expect(new URLSearchParams(once).getAll(VIEW_ESCAPE_KEY).length).toBeLessThanOrEqual(1)
  })

  it("never mutates the caller's params", () => {
    const original = new URLSearchParams("search=acme&view=none")
    withViewEscape("organization", original)
    expect(original.toString()).toBe("search=acme&view=none")

    const bare = new URLSearchParams("page=2")
    withViewEscape("organization", bare)
    expect(bare.toString()).toBe("page=2")
  })

  it("works on a read-only URLSearchParams, which is what useSearchParams returns", () => {
    expect(() =>
      withViewEscape("organization", new ReadonlyParams("search=acme&view=none")),
    ).not.toThrow()
    expect(withViewEscape("organization", new ReadonlyParams("search=acme&view=none"))).toBe(
      "search=acme",
    )
    expect(withViewEscape("organization", new ReadonlyParams("page=2"))).toContain("view=none")
  })

  it.each(TOTALITY_TABLE)("never throws: $entityType with $name", ({ entityType, source }) => {
    expect(() => withViewEscape(entityType, source as URLSearchParams)).not.toThrow()
  })

  it("never throws on invalid percent-encoding or a megabyte value", () => {
    expect(() =>
      withViewEscape("organization", new URLSearchParams("search=%E0%A4%A")),
    ).not.toThrow()
    expect(() =>
      withViewEscape("organization", new URLSearchParams(`search=${"x".repeat(1024 * 1024)}`)),
    ).not.toThrow()
    // A megabyte value is not a filter (T-40-02), so the bare-URL escape applies.
    expect(
      new URLSearchParams(
        withViewEscape("organization", new URLSearchParams(`search=${"x".repeat(1024 * 1024)}`)),
      ).getAll(VIEW_ESCAPE_KEY),
    ).toEqual([VIEW_ESCAPE_VALUE])
  })
})

/* ========================================================================= *
 * Plan 40-18 — the selection carrier
 * ====================================================================== */

/** Values that must never be read as a view id. */
const HOSTILE_VIEW_IDS: readonly { name: string; raw: unknown }[] = [
  { name: "the escape value", raw: VIEW_ESCAPE_VALUE },
  { name: "an empty string", raw: "" },
  { name: "whitespace only", raw: "   " },
  { name: "a script tag", raw: "<script>alert(1)</script>" },
  { name: "a protocol-relative url", raw: "//evil.example" },
  { name: "an absolute url", raw: "https://evil.example/steal" },
  { name: "a single character", raw: "a" },
  { name: "a bare word", raw: "admin" },
  { name: "a uuid with a trailing character", raw: `${VIEW_UUID}x` },
  { name: "a 37-character string", raw: "x".repeat(37) },
  { name: "a uuid with the version nibble wrong", raw: "0b7e4d1a-3c5f-1a8b-9d2e-7f6a1b2c3d4e" },
  { name: "a uuid with the variant nibble wrong", raw: "0b7e4d1a-3c5f-4a8b-1d2e-7f6a1b2c3d4e" },
  { name: "a uuid with a non-hex digit", raw: "0b7e4d1a-3c5f-4a8b-9d2e-7f6a1b2c3d4g" },
  { name: "a uuid with no hyphens", raw: VIEW_UUID.replace(/-/g, "") },
  { name: "a sql fragment", raw: "' OR 1=1 --" },
  { name: "a path traversal", raw: "../../etc/passwd" },
  { name: "a 1 MiB string", raw: "x".repeat(1024 * 1024) },
  { name: "a number", raw: 42 },
  { name: "null", raw: null },
  { name: "undefined", raw: undefined },
  { name: "an array of one uuid", raw: [VIEW_UUID] },
  { name: "an object", raw: { toString: () => VIEW_UUID } },
]

describe("narrowViewSelectionId — the uuid narrowing on a value that round-trips the address bar", () => {
  it("accepts a v4-shaped uuid", () => {
    // ANTI-VACUITY: a function returning a constant `null` would satisfy every rejection below.
    expect(narrowViewSelectionId(VIEW_UUID)).toBe(VIEW_UUID)
    expect(narrowViewSelectionId(OTHER_UUID)).toBe(OTHER_UUID)
  })

  it("accepts a uuid case-insensitively and trims padding", () => {
    expect(narrowViewSelectionId(VIEW_UUID.toUpperCase())).toBe(VIEW_UUID.toUpperCase())
    expect(narrowViewSelectionId(`  ${VIEW_UUID}  `)).toBe(VIEW_UUID)
    expect(narrowViewSelectionId(`\t${VIEW_UUID}\n`)).toBe(VIEW_UUID)
  })

  it("VIEW_ID_PATTERN is anchored at both ends, so a uuid inside a longer string is not an id", () => {
    expect(VIEW_ID_PATTERN.test(VIEW_UUID)).toBe(true)
    expect(VIEW_ID_PATTERN.test(`<script>${VIEW_UUID}</script>`)).toBe(false)
    expect(VIEW_ID_PATTERN.test(`${VIEW_UUID}&search=acme`)).toBe(false)
    expect(VIEW_ID_PATTERN.global, "a global regex carries lastIndex across .test calls").toBe(false)
  })

  it.each(HOSTILE_VIEW_IDS)("rejects $name", ({ raw }) => {
    expect(narrowViewSelectionId(raw)).toBeNull()
  })

  it.each(HOSTILE_VIEW_IDS)("never throws on $name", ({ raw }) => {
    expect(() => narrowViewSelectionId(raw)).not.toThrow()
  })

  it("THE ASYMMETRY WITH narrowViewId IS DELIBERATE — do not unify the two narrowings", () => {
    // `narrowViewId` narrows a POST BODY value that is about to be looked up: if it names no row the
    // action refuses, so a permissive shape costs nothing and refusing a 40-character id that the
    // database might one day hold would cost a working feature.
    //
    // `narrowViewSelectionId` narrows a value that is about to be WRITTEN INTO THE ADDRESS BAR and
    // echoed back on the next navigation. There, "it will fail the lookup anyway" is not enough —
    // the string itself is the hazard. Both are correct for their own job.
    expect(
      narrowViewId("<script>"),
      "narrowViewId is length-bounded, not shape-bounded, and that is right for a POST body.",
    ).toBe("<script>")
    expect(
      narrowViewSelectionId("<script>"),
      "narrowViewSelectionId is shape-bounded because its output is echoed into a URL.",
    ).toBeNull()

    // And they agree on a real id, so the asymmetry is about the junk and not about the ids.
    expect(narrowViewId(VIEW_UUID)).toBe(VIEW_UUID)
    expect(narrowViewSelectionId(VIEW_UUID)).toBe(VIEW_UUID)
  })
})

describe("parseViewSelection — three states, and a junk value is ABSENT rather than an error", () => {
  it("reads a selection out of a URLSearchParams", () => {
    expect(parseViewSelection(new URLSearchParams(`view=${VIEW_UUID}`))).toEqual({
      kind: "selection",
      viewId: VIEW_UUID,
    })
    expect(parseViewSelection(new URLSearchParams(`search=acme&view=${VIEW_UUID}&page=2`))).toEqual({
      kind: "selection",
      viewId: VIEW_UUID,
    })
  })

  it("reads a selection out of Next's await searchParams record, array value included", () => {
    expect(parseViewSelection({ view: VIEW_UUID })).toEqual({ kind: "selection", viewId: VIEW_UUID })
    expect(parseViewSelection({ view: [VIEW_UUID] })).toEqual({
      kind: "selection",
      viewId: VIEW_UUID,
    })
  })

  it("reads the escape, and the escape is not a selection", () => {
    expect(parseViewSelection(new URLSearchParams("view=none"))).toEqual({ kind: "escape" })
    expect(parseViewSelection({ view: VIEW_ESCAPE_VALUE })).toEqual({ kind: "escape" })
    expect(parseViewSelection({ view: [VIEW_ESCAPE_VALUE] })).toEqual({ kind: "escape" })
  })

  it("takes the FIRST value of a repeated param, so ?view=none&view=<uuid> is the escape", () => {
    expect(parseViewSelection(new URLSearchParams(`view=none&view=${VIEW_UUID}`))).toEqual({
      kind: "escape",
    })
    expect(parseViewSelection({ view: [VIEW_ESCAPE_VALUE, VIEW_UUID] })).toEqual({ kind: "escape" })
    // And the other order, so this is the first value and not a preference for the escape.
    expect(parseViewSelection(new URLSearchParams(`view=${VIEW_UUID}&view=none`))).toEqual({
      kind: "selection",
      viewId: VIEW_UUID,
    })
  })

  it("is ABSENT with no view key at all", () => {
    expect(parseViewSelection(new URLSearchParams("search=acme"))).toEqual({ kind: "absent" })
    expect(parseViewSelection(new URLSearchParams())).toEqual({ kind: "absent" })
    expect(parseViewSelection({ search: "acme" })).toEqual({ kind: "absent" })
    expect(parseViewSelection(null)).toEqual({ kind: "absent" })
    expect(parseViewSelection(undefined)).toEqual({ kind: "absent" })
  })

  it.each(
    // The escape is its own state, and an ARRAY is not a value: `firstParam` unwraps
    // `{view: [<uuid>]}` to the uuid before narrowing, which is Next's repeated-param shape and is
    // asserted as a SELECTION above. Both are excluded here because neither is "a junk value".
    HOSTILE_VIEW_IDS.filter(({ raw }) => raw !== VIEW_ESCAPE_VALUE && !Array.isArray(raw)),
  )(
    "is ABSENT for a value that is neither none nor a uuid: $name",
    ({ raw }) => {
      // A strange URL renders a page. This module has no error state, because there is no
      // `error.tsx` above any of the four list routes.
      expect(parseViewSelection({ view: raw } as FilterParamSource)).toEqual({ kind: "absent" })
    },
  )

  it("reaches no prototype", () => {
    expect(
      parseViewSelection(JSON.parse('{"__proto__":{"view":"' + VIEW_UUID + '"}}')),
    ).toEqual({ kind: "absent" })
    expect(
      parseViewSelection(JSON.parse('{"constructor":{"prototype":{"view":"' + VIEW_UUID + '"}}}')),
    ).toEqual({ kind: "absent" })
    // `toString` and friends are inherited members, never values.
    expect(parseViewSelection({} as FilterParamSource)).toEqual({ kind: "absent" })
    expect(parseViewSelection(Object.create({ view: VIEW_UUID }) as FilterParamSource)).toEqual({
      kind: "absent",
    })
  })

  it("never throws, including on an object with a throwing accessor", () => {
    const throwing = {
      get view(): string {
        throw new Error("boom")
      },
    }

    expect(() => parseViewSelection(throwing)).not.toThrow()
    expect(parseViewSelection(throwing)).toEqual({ kind: "absent" })

    for (const { source } of HOSTILE_SOURCES) {
      expect(() => parseViewSelection(source as FilterParamSource)).not.toThrow()
    }
  })
})

describe("withViewSelection — a navigation that OPENS a view", () => {
  it("returns a query string with no leading question mark", () => {
    expect(withViewSelection("organization", { search: "acme" }, VIEW_UUID).startsWith("?")).toBe(
      false,
    )
  })

  it("carries the whitelisted filters in canonical order plus the selection", () => {
    expect(withViewSelection("organization", { search: "acme" }, VIEW_UUID)).toBe(
      `search=acme&view=${VIEW_UUID}`,
    )
    expect(
      withViewSelection("deal", { owner: "u1", dateTo: "2026-01-31", pipeline: "p1" }, VIEW_UUID),
    ).toBe(`pipeline=p1&owner=u1&dateTo=2026-01-31&view=${VIEW_UUID}`)
  })

  it("round-trips: parseViewSelection reads back the selection it wrote", () => {
    const query = withViewSelection("activity", { type: "call", search: "acme" }, VIEW_UUID)

    expect(parseViewSelection(new URLSearchParams(query))).toEqual({
      kind: "selection",
      viewId: VIEW_UUID,
    })
    expect(pickFilterParams("activity", new URLSearchParams(query))).toEqual({
      type: "call",
      search: "acme",
    })
  })

  it("refuses to mint a selection with no saveable filter — U-2 says that view cannot exist", () => {
    // A view must carry at least one whitelisted key to be saveable at all, so "selected, with no
    // filters" is not a state. Asserting it here is what stops the bar minting one.
    expect(withViewSelection("organization", {}, VIEW_UUID)).toBe("view=none")
    expect(withViewSelection("organization", { search: "   " }, VIEW_UUID)).toBe("view=none")
    expect(withViewSelection("organization", null, VIEW_UUID)).toBe("view=none")
    expect(withViewSelection("deal", { search: "acme" }, VIEW_UUID)).toBe("view=none")
  })

  it("refuses to mint a JUNK selection, so a caller cannot do what a crafted URL cannot", () => {
    for (const { raw } of HOSTILE_VIEW_IDS) {
      const result = withViewSelection("organization", { search: "acme" }, raw as string)

      expect(new URLSearchParams(result).has(VIEW_ESCAPE_KEY)).toBe(false)
      expect(result).toBe("search=acme")
    }
  })

  it("drops page and every non-whitelisted key — V-9: a view lands you on page 1", () => {
    // The DELIBERATE DIFFERENCE from `withViewEscape`, asserted side by side: a selection is a fresh
    // navigation into a view, so it starts clean; an escape/filter change is a modification of the
    // URL you are already on, so it keeps the params it does not own.
    const raw = new URLSearchParams("type=call&page=2&sort=name&view=none")

    expect(withViewSelection("activity", raw, VIEW_UUID)).toBe(`type=call&view=${VIEW_UUID}`)
    expect(withViewEscape("activity", raw)).toBe("page=2&sort=name&type=call")
  })

  it("never carries a pre-existing view value through", () => {
    const crafted = new URLSearchParams("search=acme&view=%3Cscript%3E")

    expect(withViewSelection("organization", crafted, OTHER_UUID)).toBe(
      `search=acme&view=${OTHER_UUID}`,
    )
    expect(new URLSearchParams(withViewSelection("organization", crafted, OTHER_UUID)).getAll(
      VIEW_ESCAPE_KEY,
    )).toEqual([OTHER_UUID])
  })

  it.each(TOTALITY_TABLE)("never throws: $entityType with $name", ({ entityType, source }) => {
    expect(() =>
      withViewSelection(entityType, source as FilterParamSource, VIEW_UUID),
    ).not.toThrow()
    expect(() =>
      withViewSelection(entityType, source as FilterParamSource, "not-an-id"),
    ).not.toThrow()
  })
})

describe("withViewEscape PRESERVES a selection — the fix for 40-05's unreachable isModified", () => {
  it("keeps the selection when a filter survives", () => {
    expect(withViewEscape("organization", new URLSearchParams(`search=acme&view=${VIEW_UUID}`))).toBe(
      `search=acme&view=${VIEW_UUID}`,
    )
  })

  it("THE isModified PATH: a filter changed while a view was open, the selection survives", () => {
    // This is the whole plan in one assertion. The search box, every filter chip, `clearAll` and
    // Load More all route through this helper; before 40-18 the selection was deleted here, so the
    // first keystroke after opening a view dropped it and `selected && modified` could never happen.
    // Measured by 40-05 over 10 URLs x 3 views: 2 selections, ZERO modified.
    const result = withViewEscape("organization", new URLSearchParams(`search=acmz&view=${VIEW_UUID}`))

    expect(result).toBe(`search=acmz&view=${VIEW_UUID}`)
    expect(new URLSearchParams(result).getAll(VIEW_ESCAPE_KEY)).toEqual([VIEW_UUID])
  })

  it("drops the selection when the last filter goes — no-filters wins, and they are exclusive", () => {
    const emptied = withViewEscape("organization", new URLSearchParams(`search=&view=${VIEW_UUID}`))

    expect(emptied).toBe("view=none")
    expect(new URLSearchParams(emptied).getAll(VIEW_ESCAPE_KEY)).toEqual([VIEW_ESCAPE_VALUE])

    // Same on a whitespace-only value and on a value over the length cap: what matters is whether a
    // filter SURVIVED the parser, not whether a key was written.
    expect(withViewEscape("person", new URLSearchParams(`search=%20%20&view=${VIEW_UUID}`))).toBe(
      "view=none",
    )
    expect(
      withViewEscape(
        "organization",
        new URLSearchParams(`search=${"x".repeat(1024 * 1024)}&view=${VIEW_UUID}`),
      ),
    ).toBe("view=none")
  })

  it("keeps page, the filter AND the selection together", () => {
    const result = withViewEscape(
      "activity",
      new URLSearchParams(`status=overdue&page=2&view=${VIEW_UUID}`),
    )
    const parsed = new URLSearchParams(result)

    expect(parsed.get("page")).toBe("2")
    expect(parsed.get("status")).toBe("overdue")
    expect(parsed.getAll(VIEW_ESCAPE_KEY)).toEqual([VIEW_UUID])
  })

  it("emits AT MOST ONE view key on every branch", () => {
    for (const { entityType, query } of ESCAPE_TABLE) {
      const parsed = new URLSearchParams(withViewEscape(entityType, new URLSearchParams(query)))

      expect(
        parsed.getAll(VIEW_ESCAPE_KEY).length,
        `${query} produced ${parsed.getAll(VIEW_ESCAPE_KEY).length} view keys; escape and ` +
          `selection are mutually exclusive and a URL naming two views is meaningless`,
      ).toBeLessThanOrEqual(1)
    }
  })

  it("still works on a read-only URLSearchParams while preserving", () => {
    // `useSearchParams()` returns a `ReadonlyURLSearchParams` whose set/delete THROW, and the
    // preservation branch is one more `set` — so it has to happen on the clone.
    expect(() =>
      withViewEscape("organization", new ReadonlyParams(`search=acme&view=${VIEW_UUID}`)),
    ).not.toThrow()
    expect(
      withViewEscape("organization", new ReadonlyParams(`search=acme&view=${VIEW_UUID}`)),
    ).toBe(`search=acme&view=${VIEW_UUID}`)
  })

  it("never mutates the caller's params while preserving", () => {
    const original = new URLSearchParams(`search=acme&view=${VIEW_UUID}`)

    withViewEscape("organization", original)

    expect(original.toString()).toBe(`search=acme&view=${VIEW_UUID}`)
  })

  /**
   * THE ROWS THAT DISCRIMINATE THE UUID NARROWING. Measured while planning 40-18: the merged
   * "normalises a hostile view value rather than carrying it into a navigation (T-40-05)" test
   * passes IDENTICALLY with a permissive 1..64-character parser, because it feeds hostile values
   * with NO filter present — where the no-filters branch returns `view=none` either way and masks
   * the difference. A hostile value ALONGSIDE A SURVIVING FILTER is the only input that tells the
   * two apart.
   */
  const HOSTILE_BESIDE_A_FILTER = [
    { entityType: "organization", query: "search=acme&view=%3Cscript%3E", expected: "search=acme" },
    {
      entityType: "deal",
      query: "pipeline=p1&view=%2F%2Fevil.example",
      expected: "pipeline=p1",
    },
    { entityType: "organization", query: "search=acme&view=a&view=b", expected: "search=acme" },
  ] as const satisfies readonly { entityType: ViewEntityType; query: string; expected: string }[]

  it.each(HOSTILE_BESIDE_A_FILTER)(
    "deletes a hostile view value even when a filter survives: $query",
    ({ entityType, query, expected }) => {
      const result = withViewEscape(entityType, new URLSearchParams(query))

      expect(
        result,
        "MEASURED: a hostile `view` value ALONGSIDE A SURVIVING FILTER is the only input that " +
          "distinguishes the uuid narrowing from a permissive length-bounded one. The merged " +
          "T-40-05 hostile-value test passes either way, because it feeds hostile values with no " +
          "filter present and the no-filters branch returns `view=none` regardless. If this row is " +
          "red, `narrowViewSelectionId` has been loosened and a crafted string now reaches the " +
          "address bar.",
      ).toBe(expected)
      expect(new URLSearchParams(result).has(VIEW_ESCAPE_KEY)).toBe(false)
    },
  )
})
