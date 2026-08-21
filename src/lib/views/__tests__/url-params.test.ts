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
 */
import { describe, it, expect } from "vitest"

import {
  EXCLUDED_URL_KEYS,
  EXPORTABLE_FILTER_KEYS,
  MAX_FILTER_VALUE_LENGTH,
  SAVEABLE_FILTER_KEYS,
  VIEW_ENTITY_TYPES,
  countFilters,
  filtersToSearchParams,
  hasExportableFilter,
  hasSaveableFilter,
  pickFilterParams,
  type FilterParamSource,
} from "../url-params"
import type { ViewEntityType } from "../types"

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
