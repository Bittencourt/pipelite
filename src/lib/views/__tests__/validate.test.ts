/**
 * THE READ-SIDE VALIDATOR GATE — `validateStoredFilters` (V-40-9, T-40-19).
 *
 * Two properties are proved here, and they pull in opposite directions on purpose:
 *
 *   (a) A stored key whose target no longer exists is DROPPED and REPORTED, so a view that
 *       references a soft-deleted user, a deleted pipeline, or a stage that moved boards still
 *       resolves to a renderable list instead of a 500. There is no `error.tsx` above any of the
 *       four routes (M-14), so a throw here is a blank page.
 *   (b) A key whose target DOES exist survives untouched. This is the anti-vacuity half: a
 *       validator that dropped everything would satisfy every assertion in (a) and be useless,
 *       and `isModified` — which compares the URL against the POST-validation set (plan 40-05
 *       task 3) — would then read `true` forever and invite the user to save the damage.
 *
 * Three assertions carry the name of the defect they exist to catch, so a green run is a claim
 * about three specific regressions rather than a mood:
 *   - "fails if `owner` stops being checked against `catalog.userIds`"
 *   - "fails if `status` accepts an arbitrary string"
 *   - "fails if `dateFrom` accepts a value `Date.parse` likes but the regex does not"
 *
 * The catalog is a plain value object, so every test here is a pure-function test with no database
 * and no mock. That is the point of the signature.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, it, expect } from "vitest"

import { validateStoredFilters, type ViewFilterCatalog } from "../validate"
import { SAVEABLE_FILTER_KEYS } from "../url-params"

// ---------------------------------------------------------------------------------------------
// Fixtures. The ids are shaped like the real ones (uuid-ish text) but the values only ever matter
// as set members, so they are readable rather than random.
// ---------------------------------------------------------------------------------------------

const LIVE_USER = "user-live-0001"
const OTHER_LIVE_USER = "user-live-0002"
/** One of the six soft-deleted users in this deployment: absent from `userIds` by construction. */
const DELETED_USER = "user-deleted-0009"

const LIVE_PIPELINE = "pipe-live-0001"
const OTHER_PIPELINE = "pipe-live-0002"
const DELETED_PIPELINE = "pipe-deleted-0003"

const STAGE_IN_LIVE = "stage-live-0001"
const STAGE_IN_OTHER = "stage-other-0001"
const UNKNOWN_STAGE = "stage-gone-0009"

const LIVE_ACTIVITY_TYPE = "atype-live-0001"
const DELETED_ACTIVITY_TYPE = "atype-gone-0009"

function catalog(overrides: Partial<ViewFilterCatalog> = {}): ViewFilterCatalog {
  return {
    userIds: new Set([LIVE_USER, OTHER_LIVE_USER]),
    pipelineIds: new Set([LIVE_PIPELINE, OTHER_PIPELINE]),
    stageIdsByPipeline: new Map([
      [LIVE_PIPELINE, new Set([STAGE_IN_LIVE])],
      [OTHER_PIPELINE, new Set([STAGE_IN_OTHER])],
    ]),
    activityTypeIds: new Set([LIVE_ACTIVITY_TYPE]),
    ...overrides,
  }
}

/** An empty catalog — every existence check fails. Used for the "drops everything" direction. */
const EMPTY_CATALOG: ViewFilterCatalog = {
  userIds: new Set(),
  pipelineIds: new Set(),
  stageIdsByPipeline: new Map(),
  activityTypeIds: new Set(),
}

describe("validate.ts imports no database module", () => {
  /**
   * WHY THIS IS PARSED AND NOT GREPPED. 40-05-PLAN's done criterion for this task reads
   * `grep -c "@/db" src/lib/views/validate.ts` is 0. Run against the implementation it returns 1 —
   * because the module header contains the sentence FORBIDDING that import. That is the raw-token
   * grep trap Phase 39 hit five times: the comment explaining a rule trips its own gate, and the
   * "fix" that satisfies the grep is deleting the explanation, which makes the codebase worse while
   * turning the light green.
   *
   * So the property is asserted where it actually lives: the module's import specifiers. Prose can
   * say `@/db` as often as it needs to; an `import … from "@/db"` is what would put `pg` in this
   * module's graph and turn a pure function into an N-query loop. Deleting the comment does not
   * change this assertion's outcome, and adding the import does.
   */
  const source = readFileSync(join(__dirname, "..", "validate.ts"), "utf8")

  /** Every module specifier in a static `import`/`export … from` or a dynamic `import()`. */
  function importSpecifiers(code: string): string[] {
    const withoutComments = code
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    const found: string[] = []
    const patterns = [
      /(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
      /(?:^|\n)\s*export\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g,
      /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
      /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    ]

    for (const pattern of patterns) {
      for (const match of withoutComments.matchAll(pattern)) found.push(match[1])
    }

    return found
  }

  it("resolves its imports to url-params and types only", () => {
    const specifiers = importSpecifiers(source)

    // Non-empty, or the parser is broken and every assertion below is vacuous.
    expect(specifiers.length).toBeGreaterThan(0)
    expect(new Set(specifiers)).toEqual(new Set(["./url-params", "./types"]))
  })

  it("imports nothing that could reach the database or a server-only module", () => {
    const forbidden = [/^@\/db(\/|$)/, /(^|\/)db(\/|$)/, /drizzle/, /^pg$/, /^@\/lib\/db/, /queries/]

    for (const specifier of importSpecifiers(source)) {
      for (const pattern of forbidden) {
        expect(specifier).not.toMatch(pattern)
      }
    }
  })

  it("would notice a db import: the parser finds one in a synthetic source", () => {
    // Proof that the two assertions above can fail — a gate whose detector never fires is a gate
    // that proves nothing (the vacuous-assertion class this phase was warned about).
    const synthetic = `
      /** A comment mentioning @/db, which must NOT be detected. */
      import { db } from "@/db"
      import { pickFilterParams } from "./url-params"
    `
    const specifiers = importSpecifiers(synthetic)

    expect(specifiers).toContain("@/db")
    expect(specifiers).toContain("./url-params")
    expect(specifiers).toHaveLength(2)
  })
})

describe("validateStoredFilters — anti-vacuity: a fully valid set survives verbatim", () => {
  it("returns a deal view's every key untouched, with no dropped keys", () => {
    const stored = {
      pipeline: LIVE_PIPELINE,
      stage: STAGE_IN_LIVE,
      owner: LIVE_USER,
      assignee: OTHER_LIVE_USER,
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    }

    const result = validateStoredFilters("deal", stored, catalog())

    // Both halves matter. Without the deep-equal, a validator that dropped every key would pass
    // every "is dropped" test in this file.
    expect(result.filters).toEqual(stored)
    expect(result.droppedKeys).toEqual([])
  })

  it("returns an activity view's every key untouched, with no dropped keys", () => {
    const stored = {
      type: LIVE_ACTIVITY_TYPE,
      owner: LIVE_USER,
      assignee: OTHER_LIVE_USER,
      status: "completed",
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
      search: "renewal",
    }

    const result = validateStoredFilters("activity", stored, catalog())

    expect(result.filters).toEqual(stored)
    expect(result.droppedKeys).toEqual([])
  })

  it("returns an organization view's lone search key untouched even against an empty catalog", () => {
    // `organization` and `person` reference nothing that can be deleted, so an empty catalog must
    // not degrade them. This is also what lets `resolve.ts` skip the catalog queries entirely on
    // those two surfaces.
    const result = validateStoredFilters("organization", { search: "acme" }, EMPTY_CATALOG)

    expect(result.filters).toEqual({ search: "acme" })
    expect(result.droppedKeys).toEqual([])
  })
})

describe("validateStoredFilters — user existence (`owner`, `assignee`)", () => {
  it("drops `owner` when the id is not an active user", () => {
    const result = validateStoredFilters("deal", { owner: DELETED_USER }, catalog())

    expect(result.filters).toEqual({})
    expect(result.droppedKeys).toEqual(["owner"])
  })

  it("drops `assignee` when the id is not an active user", () => {
    const result = validateStoredFilters("deal", { assignee: DELETED_USER }, catalog())

    expect(result.filters).toEqual({})
    expect(result.droppedKeys).toEqual(["assignee"])
  })

  it("drops `owner` and `assignee` on `activity` too, not only on `deal`", () => {
    const result = validateStoredFilters(
      "activity",
      { owner: DELETED_USER, assignee: DELETED_USER, search: "keep me" },
      catalog(),
    )

    expect(result.filters).toEqual({ search: "keep me" })
    expect(result.droppedKeys).toEqual(["assignee", "owner"])
  })

  it("keeps `owner` and drops `assignee` when only one of the two is gone", () => {
    const result = validateStoredFilters(
      "deal",
      { owner: LIVE_USER, assignee: DELETED_USER },
      catalog(),
    )

    expect(result.filters).toEqual({ owner: LIVE_USER })
    expect(result.droppedKeys).toEqual(["assignee"])
  })

  it("fails if `owner` stops being checked against `catalog.userIds`", () => {
    // NAMED DEFECT. A validator that passes `owner` straight through satisfies nothing else in
    // this file except this assertion, because every other owner test could be made to pass by
    // dropping owner unconditionally. Both directions are asserted in one test on purpose: the
    // same catalog accepts one id and refuses the other, so the check must be a set membership
    // and cannot be a constant.
    const live = validateStoredFilters("deal", { owner: LIVE_USER }, catalog())
    const gone = validateStoredFilters("deal", { owner: DELETED_USER }, catalog())

    expect(live.filters.owner).toBe(LIVE_USER)
    expect(live.droppedKeys).not.toContain("owner")
    expect(gone.filters.owner).toBeUndefined()
    expect(gone.droppedKeys).toContain("owner")
  })
})

describe("validateStoredFilters — pipeline and stage (deal only, Decision 4)", () => {
  it("drops `pipeline` when the pipeline was deleted, so the default board renders", () => {
    // Decision 4: a saved view pointing at a deleted pipeline must fall back to the default board
    // rather than `deals/page.tsx:87`'s "pipeline not found" page. Dropping the key is what makes
    // `params.pipeline` absent, which is the branch that selects the default board.
    const result = validateStoredFilters("deal", { pipeline: DELETED_PIPELINE }, catalog())

    expect(result.filters).toEqual({})
    expect(result.droppedKeys).toEqual(["pipeline"])
  })

  it("drops `stage` when the stage does not exist anywhere", () => {
    const result = validateStoredFilters(
      "deal",
      { pipeline: LIVE_PIPELINE, stage: UNKNOWN_STAGE },
      catalog(),
    )

    expect(result.filters).toEqual({ pipeline: LIVE_PIPELINE })
    expect(result.droppedKeys).toEqual(["stage"])
  })

  it("drops a `stage` that exists but belongs to a different pipeline than the surviving one", () => {
    // The board renders the surviving pipeline's columns; a stage from another board matches none
    // of them, so the filter would silently produce an empty list.
    const result = validateStoredFilters(
      "deal",
      { pipeline: LIVE_PIPELINE, stage: STAGE_IN_OTHER },
      catalog(),
    )

    expect(result.filters).toEqual({ pipeline: LIVE_PIPELINE })
    expect(result.droppedKeys).toEqual(["stage"])
  })

  it("validates `stage` against the union of all stages when `pipeline` was itself dropped", () => {
    // With no surviving pipeline there is no board to scope the stage to, so the widest existence
    // check is the only honest one. `STAGE_IN_OTHER` survives here and is dropped in the test
    // above — same stage, different pipeline context.
    const result = validateStoredFilters(
      "deal",
      { pipeline: DELETED_PIPELINE, stage: STAGE_IN_OTHER },
      catalog(),
    )

    expect(result.filters).toEqual({ stage: STAGE_IN_OTHER })
    expect(result.droppedKeys).toEqual(["pipeline"])
  })

  it("validates `stage` against the union of all stages when the view stored no `pipeline`", () => {
    const result = validateStoredFilters("deal", { stage: STAGE_IN_OTHER }, catalog())

    expect(result.filters).toEqual({ stage: STAGE_IN_OTHER })
    expect(result.droppedKeys).toEqual([])
  })

  it("drops both keys when the pipeline is gone and the stage exists nowhere", () => {
    const result = validateStoredFilters(
      "deal",
      { pipeline: DELETED_PIPELINE, stage: UNKNOWN_STAGE },
      catalog(),
    )

    expect(result.filters).toEqual({})
    expect(result.droppedKeys).toEqual(["pipeline", "stage"])
  })

  it("ignores `pipeline` and `stage` on a non-deal entity type, because they are not whitelisted", () => {
    // `pipeline` is not in `SAVEABLE_FILTER_KEYS.activity`, so it is not a key of this view at all.
    // It is therefore not reported as dropped — nothing "no longer exists"; it was never a filter.
    const result = validateStoredFilters(
      "activity",
      { pipeline: DELETED_PIPELINE, stage: UNKNOWN_STAGE, search: "keep" },
      catalog(),
    )

    expect(result.filters).toEqual({ search: "keep" })
    expect(result.droppedKeys).toEqual([])
  })
})

describe("validateStoredFilters — activity `type` and `status`", () => {
  it("drops `type` when the activity type no longer exists", () => {
    const result = validateStoredFilters("activity", { type: DELETED_ACTIVITY_TYPE }, catalog())

    expect(result.filters).toEqual({})
    expect(result.droppedKeys).toEqual(["type"])
  })

  it("keeps each of the three frozen status literals `activity-filters.tsx` writes", () => {
    // `pending`, `completed` and `overdue` are exactly the three `<SelectItem value=…>`s at
    // `activity-filters.tsx:184-186`. All three survive, INCLUDING the two that narrow nothing in
    // SQL today (A8 / plan 40-13): this function validates SHAPE and EXISTENCE, never
    // effectiveness. Dropping `overdue` here would delete a filter the user set and the chip row
    // displays — a different bug from the one being avoided.
    for (const status of ["pending", "completed", "overdue"]) {
      const result = validateStoredFilters("activity", { status }, catalog())

      expect(result.filters).toEqual({ status })
      expect(result.droppedKeys).toEqual([])
    }
  })

  it("fails if `status` accepts an arbitrary string", () => {
    // NAMED DEFECT. A validator that treats `status` as free text passes every other status test.
    for (const status of ["Completed", "done", "archived", "true", "1", "pending "]) {
      const result = validateStoredFilters("activity", { status }, catalog())

      expect(result.filters.status).toBeUndefined()
      expect(result.droppedKeys).toContain("status")
    }
  })
})

describe("validateStoredFilters — `dateFrom` / `dateTo` (T-40-19)", () => {
  it("keeps an ISO calendar date", () => {
    const result = validateStoredFilters(
      "deal",
      { dateFrom: "2026-01-01", dateTo: "2026-12-31" },
      catalog(),
    )

    expect(result.filters).toEqual({ dateFrom: "2026-01-01", dateTo: "2026-12-31" })
    expect(result.droppedKeys).toEqual([])
  })

  it("drops a date whose month or day is out of range, because `Date.parse` returns NaN", () => {
    // An `Invalid Date` reaching a `gte()` is a 500 on a route with no `error.tsx` above it.
    for (const bad of ["2026-13-01", "0000-00-00", "2026-01-99"]) {
      const result = validateStoredFilters("deal", { dateFrom: bad }, catalog())

      expect(result.filters.dateFrom).toBeUndefined()
      expect(result.droppedKeys).toContain("dateFrom")
    }
  })

  it("fails if `dateFrom` accepts a value `Date.parse` likes but the regex does not", () => {
    // NAMED DEFECT, and the reason the regex exists ALONGSIDE the `Date.parse` check rather than
    // instead of it. `Date.parse("1")` is 978314400000 — a valid instant, the year 2001 — so a
    // finiteness check alone would pass every one of these through into a `gte()`.
    for (const bad of ["1", "2026", "2026-1-15", "now", "2026-01-15T00:00:00Z", " 2026-01-15"]) {
      expect(Number.isFinite(Date.parse(bad)) || bad === "now").toBeTruthy()

      const result = validateStoredFilters("deal", { dateFrom: bad }, catalog())

      expect(result.filters.dateFrom).toBeUndefined()
      expect(result.droppedKeys).toContain("dateFrom")
    }
  })

  it("drops `dateTo` independently of `dateFrom`", () => {
    const result = validateStoredFilters(
      "deal",
      { dateFrom: "2026-01-01", dateTo: "whenever" },
      catalog(),
    )

    expect(result.filters).toEqual({ dateFrom: "2026-01-01" })
    expect(result.droppedKeys).toEqual(["dateTo"])
  })
})

describe("validateStoredFilters — `search` is never dropped", () => {
  it("keeps any string the parser accepted, against an empty catalog", () => {
    for (const search of ["acme", "  padded  ", "%_\\", "'; DROP TABLE --", "ácçéñtś", "42"]) {
      const result = validateStoredFilters("person", { search }, EMPTY_CATALOG)

      expect(result.filters).toEqual({ search })
      expect(result.droppedKeys).toEqual([])
    }
  })
})

describe("validateStoredFilters — `pickFilterParams` runs first", () => {
  it("removes `page` and `view` without reporting them as dropped", () => {
    // Neither is in any `SAVEABLE_FILTER_KEYS` row, so neither is a key of this view. Reporting
    // them would light `views.degraded` ("Part of this view no longer exists") for a view in which
    // nothing is missing.
    const result = validateStoredFilters(
      "activity",
      { page: "3", view: "some-other-view", search: "keep" },
      catalog(),
    )

    expect(result.filters).toEqual({ search: "keep" })
    expect(result.droppedKeys).toEqual([])
  })

  it("removes a key from an older whitelist without reporting it as dropped", () => {
    const result = validateStoredFilters(
      "organization",
      { search: "keep", industry: "mining", sort: "name" },
      catalog(),
    )

    expect(result.filters).toEqual({ search: "keep" })
    expect(result.droppedKeys).toEqual([])
  })

  it("never returns a key outside the entity's whitelist", () => {
    const everyKey: Record<string, string> = {}

    for (const row of Object.values(SAVEABLE_FILTER_KEYS)) {
      for (const key of row) everyKey[key] = "x"
    }

    for (const entityType of ["organization", "person", "deal", "activity"] as const) {
      const result = validateStoredFilters(entityType, everyKey, catalog())

      for (const key of Object.keys(result.filters)) {
        expect(SAVEABLE_FILTER_KEYS[entityType]).toContain(key)
      }
      for (const key of result.droppedKeys) {
        expect(SAVEABLE_FILTER_KEYS[entityType]).toContain(key)
      }
    }
  })
})

describe("validateStoredFilters — `droppedKeys` is sorted and de-duplicated", () => {
  it("sorts regardless of the order the keys appeared in the blob", () => {
    const forwards = validateStoredFilters(
      "deal",
      {
        pipeline: DELETED_PIPELINE,
        stage: UNKNOWN_STAGE,
        owner: DELETED_USER,
        assignee: DELETED_USER,
        dateFrom: "nope",
        dateTo: "nope",
      },
      catalog(),
    )
    const backwards = validateStoredFilters(
      "deal",
      {
        dateTo: "nope",
        dateFrom: "nope",
        assignee: DELETED_USER,
        owner: DELETED_USER,
        stage: UNKNOWN_STAGE,
        pipeline: DELETED_PIPELINE,
      },
      catalog(),
    )

    expect(forwards.droppedKeys).toEqual([
      "assignee",
      "dateFrom",
      "dateTo",
      "owner",
      "pipeline",
      "stage",
    ])
    expect(backwards.droppedKeys).toEqual(forwards.droppedKeys)
  })

  it("contains no duplicates", () => {
    const result = validateStoredFilters(
      "deal",
      { pipeline: DELETED_PIPELINE, stage: UNKNOWN_STAGE, owner: DELETED_USER },
      catalog(),
    )

    expect(new Set(result.droppedKeys).size).toBe(result.droppedKeys.length)
  })
})

describe("validateStoredFilters — NEVER THROWS", () => {
  const nullPrototype = Object.create(null) as Record<string, unknown>
  nullPrototype.owner = DELETED_USER
  nullPrototype.search = "from a null-prototype object"

  const throwingAccessor = {} as Record<string, unknown>
  Object.defineProperty(throwingAccessor, "search", {
    enumerable: true,
    get() {
      throw new Error("hostile accessor")
    },
  })

  const hostile: { label: string; filters: unknown }[] = [
    { label: "null", filters: null },
    { label: "undefined", filters: undefined },
    { label: "a null-prototype object", filters: nullPrototype },
    { label: "an array value", filters: { search: ["a", "b"], owner: [DELETED_USER] } },
    { label: "a nested object value", filters: { search: { deep: true }, owner: { id: 1 } } },
    { label: "a 1 MiB string", filters: { search: "x".repeat(1024 * 1024) } },
    { label: "a number value", filters: { search: 42, owner: 7 } },
    { label: "a null value", filters: { search: null, owner: null } },
    { label: "a function value", filters: { search: () => "gotcha" } },
    { label: "a throwing accessor", filters: throwingAccessor },
    { label: "an array", filters: ["search", "owner"] },
    { label: "a string", filters: "search=acme" },
    { label: "a URLSearchParams", filters: new URLSearchParams("search=acme&page=2") },
    { label: "prototype-named keys", filters: { __proto__: { polluted: true }, constructor: "x" } },
  ]

  for (const { label, filters } of hostile) {
    it(`returns a value rather than throwing for ${label}`, () => {
      const run = () =>
        validateStoredFilters(
          "activity",
          filters as Parameters<typeof validateStoredFilters>[1],
          catalog(),
        )

      expect(run).not.toThrow()

      const result = run()

      expect(typeof result.filters).toBe("object")
      expect(Array.isArray(result.droppedKeys)).toBe(true)
      for (const value of Object.values(result.filters)) {
        expect(typeof value).toBe("string")
      }
    })
  }

  it("does not throw when the catalog itself is malformed", () => {
    // The catalog comes from a database read wrapped in a try/catch. A degraded read can hand this
    // function a partial object, and it must still produce a page.
    const broken = { userIds: undefined } as unknown as ViewFilterCatalog

    expect(() => validateStoredFilters("deal", { owner: LIVE_USER }, broken)).not.toThrow()
    expect(validateStoredFilters("deal", { owner: LIVE_USER }, broken).droppedKeys).toContain(
      "owner",
    )
  })

  it("does not throw for an unrecognised entity type", () => {
    const rogue = "__proto__" as Parameters<typeof validateStoredFilters>[0]

    expect(() => validateStoredFilters(rogue, { search: "x" }, catalog())).not.toThrow()
    expect(validateStoredFilters(rogue, { search: "x" }, catalog())).toEqual({
      filters: {},
      droppedKeys: [],
    })
  })

  it("never mutates the stored blob it was handed", () => {
    const stored = { owner: DELETED_USER, search: "keep" }
    const snapshot = { ...stored }

    validateStoredFilters("activity", stored, catalog())

    expect(stored).toEqual(snapshot)
  })
})
