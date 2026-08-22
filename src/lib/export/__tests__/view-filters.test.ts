/**
 * THE EXPORTABLE-KEY <-> SQL-PREDICATE INVARIANT (T-40-30), plus the two E-2 consequences.
 *
 * WHY THIS FILE IS THE LOAD-BEARING HALF OF THE EXPORT GUARD. 38-CONTEXT.md:110-116 forbids a
 * filters-taking export action reachable without an admin gate, because an action handed `{}`
 * returns all 46,054 organizations. Phase 40 Decision 2 removed that gate and put
 * `hasExportableFilter` in its place. A predicate-shaped gate is only as strong as the claim it
 * makes, and the claim written above `EXPORTABLE_FILTER_KEYS` is NOT "not pipeline" — it is:
 *
 *     every key in that table is applied as a SQL predicate by the matching `fetch*`, so its
 *     presence provably NARROWS the exported row set.
 *
 * Nothing enforced that claim before this file. And it was already false in one place:
 * `hasExportableFilter("activity", { status: "overdue" })` is `true`, while `fetchActivities`
 * applied no `status` predicate at all — so a "filter" that narrowed nothing would have authorized
 * an export of all 79,022 live activities, which is precisely the unbounded export the guard exists
 * to prevent (40-CONTEXT amendment A8). The gate below catches that class structurally.
 *
 * WHAT THIS GATE DELIBERATELY DOES **NOT** COVER, and why that is not a hole here. The LIST side
 * (`src/app/activities/page.tsx`) is weaker than these fetchers today: it applies `status` only as
 * `=== "completed"` and filters `dateFrom`/`dateTo` in JavaScript AFTER the `limit` slice. Plan
 * 40-13 closes that. This gate reads `src/lib/export/formatters.ts` and nothing else, on purpose:
 * it asserts the EXPORT path narrows, which is the path the guard authorizes. Widening it to the
 * list pages would make it fail on work another plan owns, and the correct response to that would
 * be resequencing — never relaxing the assertion.
 *
 * PARSED, NOT GREPPED (K-9). Comments are stripped before anything is matched, so a comment naming
 * a key cannot satisfy its own gate, and each fetcher's body is extracted by brace matching so
 * `fetchDeals` mentioning `stage` cannot satisfy `fetchActivities`'s row. Phase 39 was tripped five
 * times by raw-token greps that the explanatory comment itself satisfied.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"
import {
  callArguments,
  readStrippedSource,
} from "@/components/custom-fields/__tests__/source-scan"
import {
  EXPORTABLE_FILTER_KEYS,
  SAVEABLE_FILTER_KEYS,
  VIEW_ENTITY_TYPES,
  hasExportableFilter,
} from "@/lib/views/url-params"
import type { ViewEntityType } from "@/lib/views/types"

/**
 * `formatters.ts` imports the drizzle client at module scope. The shape below is the one
 * `formatters.test.ts` already uses: every `findMany` resolves `[]`, and the recorded `where` is
 * rendered to SQL text plus bound parameters, so a predicate can be inspected without a database.
 *
 * WHAT A MOCK CANNOT PROVE, stated so nobody mistakes this for full coverage: that Postgres accepts
 * the statement, or that it selects the right rows. Phase 37 shipped a malformed drizzle fragment
 * that a wholly-mocked suite passed cleanly. The row counts are proved against real data in
 * `formatters-live.test.ts`, which for `status` is the assertion that matters most — 79,022 live
 * activities is the number the guard is defending.
 */
const dbSpies = vi.hoisted(() => {
  const table = () => ({ findMany: vi.fn(async () => [] as unknown[]) })

  return {
    organizations: table(),
    people: table(),
    deals: table(),
    activities: table(),
  }
})

vi.mock("@/db", () => ({ db: { query: dbSpies } }))

// Imported AFTER the `vi.mock` above for readability only — vitest hoists the mock regardless.
import { fetchFilteredData } from "../formatters"
import type { ExportFilters } from "../types"
import {
  ALL_SAVEABLE_KEYS,
  EXPORT_ROW_CAP,
  guardExportInput,
  toExportFilters,
} from "../view-export-guard"

const FORMATTERS_PATH = "src/lib/export/formatters.ts"

/**
 * Which fetcher answers for which entity type.
 *
 * A total `Record<ViewEntityType, string>`, so a fifth entity type is a compile error here rather
 * than an entity type that quietly has no gate.
 */
const FETCHER_BY_ENTITY: Record<ViewEntityType, string> = {
  organization: "fetchOrganizations",
  person: "fetchPeople",
  deal: "fetchDeals",
  activity: "fetchActivities",
}

/**
 * The body text of exactly one `function <name>(` declaration, brace-matched and string-aware.
 *
 * String-awareness is not decoration: `fetchDeals` contains a `sql` template literal holding
 * `IN (SELECT id FROM stages WHERE pipeline_id = ${...})`, whose `${` would otherwise be counted as
 * an opening brace and truncate the body at the wrong place. The parameter list is walked out of
 * first so a default value containing a brace cannot be mistaken for the body.
 *
 * Throws — loudly and by name — if the declaration is absent or appears more than once, because a
 * renamed fetcher must fail this file rather than silently make its row vacuous.
 */
function functionBody(source: string, name: string): string {
  const marker = `function ${name}(`
  const occurrences = source.split(marker).length - 1

  if (occurrences !== 1) {
    throw new Error(
      `expected exactly one \`${marker}\` in ${FORMATTERS_PATH}, found ${occurrences}. ` +
        `If a fetcher was renamed, update FETCHER_BY_ENTITY — do not delete its row.`,
    )
  }

  let i = source.indexOf(marker) + marker.length
  let parens = 1
  let quote: string | null = null

  while (i < source.length && parens > 0) {
    const ch = source[i]

    if (quote) {
      if (ch === "\\") {
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") quote = ch
    else if (ch === "(") parens += 1
    else if (ch === ")") parens -= 1

    i += 1
  }

  while (i < source.length && source[i] !== "{") i += 1
  if (i >= source.length) throw new Error(`no body found for ${name} in ${FORMATTERS_PATH}`)

  const start = i + 1
  let depth = 1

  i = start
  quote = null

  while (i < source.length && depth > 0) {
    const ch = source[i]

    if (quote) {
      if (ch === "\\") {
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") quote = ch
    else if (ch === "{") depth += 1
    else if (ch === "}") depth -= 1

    i += 1
  }

  if (depth !== 0) throw new Error(`unterminated body for ${name} in ${FORMATTERS_PATH}`)

  return source.slice(start, i - 1)
}

/** `filters?.<key>` with a right-hand identifier boundary, so `type` cannot be matched by `typeId`. */
function guardPattern(key: string): RegExp {
  return new RegExp(String.raw`filters\?\.${key}(?![A-Za-z0-9_$])`)
}

const source = readStrippedSource(FORMATTERS_PATH)

const BODY_BY_ENTITY = Object.fromEntries(
  VIEW_ENTITY_TYPES.map((entityType) => [
    entityType,
    functionBody(source, FETCHER_BY_ENTITY[entityType]),
  ]),
) as Record<ViewEntityType, string>

const EXPORTABLE_PAIRS: [ViewEntityType, string][] = VIEW_ENTITY_TYPES.flatMap((entityType) =>
  EXPORTABLE_FILTER_KEYS[entityType].map((key) => [entityType, key] as [ViewEntityType, string]),
)

describe("every exportable key is a SQL predicate in its fetcher (T-40-30)", () => {
  it("extracted a non-empty body for all four fetchers", () => {
    // Anti-vacuity for every row below: an empty body would make nothing at all fail if the
    // extraction silently broke.
    for (const entityType of VIEW_ENTITY_TYPES) {
      expect(BODY_BY_ENTITY[entityType].length).toBeGreaterThan(100)
      expect(BODY_BY_ENTITY[entityType]).toContain("findMany")
    }
  })

  it("extracts PER FUNCTION, so one fetcher cannot satisfy another's row", () => {
    // The discriminating property of the extraction. `filters?.stage` exists in the file, in
    // fetchDeals only; `filters?.type` exists in fetchActivities only. If the extraction ever
    // degraded to reading the whole file, both of these would pass and every row above would
    // become unfalsifiable.
    expect(BODY_BY_ENTITY.deal).toMatch(guardPattern("stage"))
    expect(BODY_BY_ENTITY.activity).not.toMatch(guardPattern("stage"))
    expect(BODY_BY_ENTITY.activity).toMatch(guardPattern("type"))
    expect(BODY_BY_ENTITY.organization).not.toMatch(guardPattern("type"))
  })

  it("covers every entity type and every exportable key — 14 pairs", () => {
    // Anti-vacuity for the table itself: deleting a row from EXPORTABLE_FILTER_KEYS must fail
    // here rather than silently shrink the gate to nothing.
    expect(Object.keys(FETCHER_BY_ENTITY).sort()).toEqual([...VIEW_ENTITY_TYPES].sort())
    expect(EXPORTABLE_PAIRS).toHaveLength(14)
  })

  it.each(EXPORTABLE_PAIRS)("%s/%s is applied as a predicate by its fetcher", (entityType, key) => {
    const fetcher = FETCHER_BY_ENTITY[entityType]

    expect(
      guardPattern(key).test(BODY_BY_ENTITY[entityType]),
      `${fetcher} has no \`filters?.${key}\` guard, but hasExportableFilter("${entityType}", ` +
        `{ ${key}: … }) returns true — so that key would AUTHORIZE an export while narrowing ` +
        `nothing. That is the unbounded export 38-CONTEXT.md:110-116 forbids. Add the predicate ` +
        `to ${fetcher}; do NOT remove ${key} from EXPORTABLE_FILTER_KEYS.${entityType} to make ` +
        `this green.`,
    ).toBe(true)
  })
})

describe("E-2: the pipeline divergence, asserted where its consequence lands", () => {
  it("pipeline narrows a deals export but never authorizes one", () => {
    // A second assertion of plan 40-01's, deliberately duplicated here because THIS is the file
    // where the consequence lands. All three halves in one test so a future reader cannot satisfy
    // one by breaking another.
    expect(hasExportableFilter("deal", { pipeline: "p1" })).toBe(false)
    expect(EXPORTABLE_FILTER_KEYS.deal).not.toContain("pipeline")

    // ...and yet the fetcher DOES apply it. A reader who removes this predicate "because pipeline
    // isn't exportable" would silently widen every deals export to every board.
    expect(BODY_BY_ENTITY.deal).toMatch(guardPattern("pipeline"))
  })

  it("pipeline is saveable, which is why the two tables cannot be one", () => {
    // Decision 4: a /deals view without its board is not reproducible. That is the whole reason
    // the divergence exists rather than being an oversight in one table.
    expect(SAVEABLE_FILTER_KEYS.deal).toContain("pipeline")
    expect(EXPORTABLE_FILTER_KEYS.deal).not.toContain("pipeline")
  })
})

// ---------------------------------------------------------------------------
// The rendered-SQL half. The structural gate above proves a key is REFERENCED; these prove the
// predicate it builds is the RIGHT ONE. `activity`/`status` is the case that needs it most: a
// `filters?.status` guard that pushed `isNull(deletedAt)` would satisfy every structural assertion
// while narrowing nothing — which is precisely the shape the LIST side has today (`getActivities`
// pushes a duplicate `isNull(deletedAt)` for `completed`). A body-contains check cannot tell those
// two apart. Rendered SQL can.
// ---------------------------------------------------------------------------

const dialect = new PgDialect()

function renderWhere(where: unknown): { sql: string; params: unknown[] } {
  const q = dialect.sqlToQuery(where as SQL)

  return { sql: q.sql, params: q.params }
}

type TableKey = keyof typeof dbSpies

async function whereFor(
  entityType: ViewEntityType,
  table: TableKey,
  filters: ExportFilters,
): Promise<{ sql: string; params: unknown[] }> {
  await fetchFilteredData({ entityType, format: "csv", includeCustomFields: true, filters })

  const calls = dbSpies[table].findMany.mock.calls as unknown as [{ where?: unknown }][]

  expect(calls.length).toBe(1)

  return renderWhere(calls[0][0].where)
}

const activitiesWhere = (filters: ExportFilters) => whereFor("activity", "activities", filters)
const dealsWhere = (filters: ExportFilters) => whereFor("deal", "deals", filters)

describe("activity status is three real predicates over completedAt and dueDate (A8)", () => {
  beforeEach(() => {
    for (const table of Object.values(dbSpies)) table.findMany.mockClear()
  })

  it("completed selects rows that HAVE a completion timestamp", async () => {
    const { sql } = await activitiesWhere({ status: "completed" })

    expect(sql).toContain(`"activities"."completed_at" is not null`)
    // The inverse must NOT also be present — `and(isNull, isNotNull)` would render both and match
    // zero rows, which is a different bug that a one-sided assertion would miss.
    expect(sql).not.toContain(`"activities"."completed_at" is null`)
    expect(sql).not.toContain(`"activities"."due_date" <`)
  })

  it("pending selects rows that are incomplete AND NOT YET DUE — disjoint from overdue (WR-05)", async () => {
    const { sql, params } = await activitiesWhere({ status: "pending" })

    expect(sql).toContain(`"activities"."completed_at" is null`)
    expect(sql).not.toContain(`"activities"."completed_at" is not null`)
    // `pending` is not `overdue`: a future-dated incomplete activity is pending, and folding the
    // OVERDUE comparison into this branch would silently drop those rows from the export. This
    // assertion is unchanged and still guards exactly that.
    expect(sql).not.toContain(`"activities"."due_date" <`)

    /*
     * ADDED FOR WR-05, and it is the other half of the same rule rather than a contradiction of the
     * line above. `pending` had been a bare `completed_at IS NULL`, which is a strict SUPERSET of
     * `overdue`: measured on the live table, 4,165 rows incomplete of which 4,151 already past due.
     * The three values come from a SINGLE SELECT (`activity-filters.tsx:170-181`), which presents
     * them as mutually exclusive states, so "Pending" showing 4,151 overdue rows and 14 relevant
     * ones is not a defensible reading of the control. Not-yet-due is `due_date >= now`; overdue is
     * `due_date < now`; every row satisfies exactly one, so the two sets cannot overlap.
     */
    expect(
      sql,
      `pending is still a bare completed_at IS NULL, so it CONTAINS every overdue row (WR-05).`
    ).toContain(`"activities"."due_date" >=`)

    // The cutoff is a BOUND PARAMETER, exactly as it is on the overdue branch — never text.
    expect(sql).toContain(">= $1")
    expect(params).toHaveLength(1)
    expect(typeof params[0]).toBe("string")
  })

  it("overdue is incomplete AND past due, with the cutoff bound as a parameter", async () => {
    const before = Date.now()
    const { sql, params } = await activitiesWhere({ status: "overdue" })
    const after = Date.now()

    expect(sql).toContain(`"activities"."completed_at" is null`)
    expect(sql).toContain(`"activities"."due_date" <`)

    // MEASURED, NOT ASSUMED. The obvious assertion here is `params.some(p => p instanceof Date)`
    // and it is WRONG: `activities.dueDate` is declared `timestamp({ mode: "date" })`, and drizzle
    // 0.45.1's mapper stringifies the Date to ISO 8601 at bind time, so the rendered param is
    // `"2026-08-21T11:27:11.340Z"`. A `Date`-typed assertion fails against a correct
    // implementation, which would have been a green-by-loosening trap in the making.
    //
    // The property that actually matters is unchanged: the cutoff is a BOUND PARAMETER (`$1`), not
    // text in the statement.
    expect(sql).toContain("< $1")
    // EXACTLY ONE bound value, which is what "computes `new Date()` once" means observably: two
    // calls would render two placeholders.
    expect(params).toHaveLength(1)

    const bound = params[0]

    expect(typeof bound).toBe("string")
    // And it is genuinely "now" — a hard-coded or epoch-zero cutoff would match every row and make
    // `overdue` a filter that narrows nothing, which is the whole defect class this file exists for.
    const boundMs = Date.parse(bound as string)

    expect(Number.isNaN(boundMs)).toBe(false)
    expect(boundMs).toBeGreaterThanOrEqual(before - 1_000)
    expect(boundMs).toBeLessThanOrEqual(after + 1_000)
  })

  it("an UNRECOGNISED status adds no predicate at all — it never means `completed`", async () => {
    // Unreachable from the view path (`pickFilterParams` drops what the toolbar cannot produce),
    // but the admin export can pass anything. Falling through to `completed` would silently export
    // 74,857 rows for a typo; falling through to nothing exports what an unfiltered call exports,
    // and the GUARD — not this fetcher — is what refuses an unfiltered call.
    const bogus = await activitiesWhere({ status: "not-a-status" })

    dbSpies.activities.findMany.mockClear()

    const none = await activitiesWhere({})

    expect(bogus).toEqual(none)
  })

  it("the three literals render three DIFFERENT predicates, all narrower than none", async () => {
    // Anti-vacuity for the four tests above: three branches that happened to render identically
    // would pass several of them individually.
    const rendered: string[] = []

    for (const status of ["completed", "pending", "overdue"]) {
      dbSpies.activities.findMany.mockClear()
      rendered.push((await activitiesWhere({ status })).sql)
    }

    dbSpies.activities.findMany.mockClear()

    const none = (await activitiesWhere({})).sql

    expect(new Set(rendered).size).toBe(3)
    for (const sql of rendered) expect(sql).not.toBe(none)
  })

  it("the other three activity keys bind their values rather than interpolating them", async () => {
    const { sql, params } = await activitiesWhere({
      type: "type-1",
      assignee: "user-1",
      search: "acme",
    })

    expect(sql).toContain(`"activities"."type_id" =`)
    expect(sql).toContain(`"activities"."assignee_id" =`)
    expect(sql).toContain(`"activities"."title" ilike`)
    expect(sql).toContain(`"activities"."notes" ilike`)
    // T-38-15: no filter value appears in the statement text.
    expect(sql).not.toContain("type-1")
    expect(sql).not.toContain("user-1")
    expect(sql).not.toContain("acme")
    expect(params).toEqual(["type-1", "user-1", "%acme%", "%acme%"])
  })
})

describe("T-40-32: the two deals subqueries bind their values", () => {
  beforeEach(() => {
    for (const table of Object.values(dbSpies)) table.findMany.mockClear()
  })

  it("pipeline and assignee cross as parameters, never as interpolated text", async () => {
    // Both are `sql` template fragments, which is the one place in this file where a value COULD
    // be concatenated into raw statement text. `deals/page.tsx:113-115`'s shape was copied rather
    // than improvised for exactly this reason.
    const { sql, params } = await dealsWhere({
      pipeline: "pipe-1",
      assignee: "user-1",
    })

    expect(sql).toContain("SELECT id FROM stages WHERE pipeline_id =")
    expect(sql).toContain("SELECT deal_id FROM deal_assignees WHERE user_id =")
    expect(sql).not.toContain("pipe-1")
    expect(sql).not.toContain("user-1")
    expect(params).toEqual(["pipe-1", "user-1"])
  })

  it("pipeline NARROWS: its predicate is absent when the key is absent", async () => {
    const scoped = await dealsWhere({ pipeline: "pipe-1" })

    dbSpies.deals.findMany.mockClear()

    const unscoped = await dealsWhere({})

    expect(scoped.sql).toContain("FROM stages WHERE pipeline_id =")
    expect(unscoped.sql).not.toContain("FROM stages")
    expect(scoped.sql).not.toBe(unscoped.sql)
  })
})

/**
 * CR-01 — THE EXPORTED CSV DROPPED THE WHOLE OF THE END DAY, on both fetchers that take a date range.
 *
 * `lte(dueDate, new Date("2025-03-31"))` bounds at MIDNIGHT, so every row later that day was omitted
 * from the file. Silently: the row count in the success toast comes from the same query, so the
 * number the user is shown agrees with the number of rows they were wrongly given. The live data
 * masked it entirely — all 79,022 activities and all 324 deals with an `expected_close_date` were
 * imported at exactly 00:00:00 — and the first activity created through the app breaks it, because
 * the dialog composes `${dueDate}T${dueTime || "09:00"}`.
 *
 * Both fetchers must apply the SAME rule as `getActivities`, from the SAME module
 * (`src/lib/filters/date-range.ts`). `formatters.ts` claims each predicate "MIRRORS the list page it
 * must match"; two copies of a boundary rule is how they stop mirroring, and CR-01 is what that
 * looked like.
 */
describe("CR-01: a date range is half-open, so the end day is included in full", () => {
  beforeEach(() => {
    for (const table of Object.values(dbSpies)) table.findMany.mockClear()
  })

  const NINE_AM_ON_THE_LAST_DAY = Date.parse("2025-03-31T09:00:00.000Z")

  /** Drizzle binds a `timestamp({ mode: "date" })` as an ISO string, not as a `Date`. */
  function boundInstant(params: unknown[], at: number): number {
    expect(typeof params[at]).toBe("string")

    const ms = Date.parse(params[at] as string)

    expect(Number.isNaN(ms)).toBe(false)

    return ms
  }

  it("activities: dateTo bounds at the NEXT midnight, exclusive", async () => {
    const { sql, params } = await activitiesWhere({ dateTo: "2025-03-31" })

    expect(
      sql,
      `the activities export still bounds with <=, i.e. at 2025-03-31T00:00:00.000Z, so every ` +
        `activity due later on the last day of the range is missing from the CSV (CR-01).`
    ).toContain(`"activities"."due_date" <`)
    expect(sql).not.toContain(`"activities"."due_date" <=`)
    expect(params).toHaveLength(1)
    expect(new Date(boundInstant(params, 0)).toISOString()).toBe("2025-04-01T00:00:00.000Z")
    expect(boundInstant(params, 0)).toBeGreaterThan(NINE_AM_ON_THE_LAST_DAY)
  })

  it("deals: expectedCloseDate's dateTo bounds at the NEXT midnight, exclusive", async () => {
    const { sql, params } = await dealsWhere({ dateTo: "2025-03-31" })

    expect(
      sql,
      `the deals export still bounds expected_close_date with <=, so a deal expected to close ` +
        `later on the last day of the range is missing from the CSV (CR-01).`
    ).toContain(`"deals"."expected_close_date" <`)
    expect(sql).not.toContain(`"deals"."expected_close_date" <=`)
    expect(params).toHaveLength(1)
    expect(new Date(boundInstant(params, 0)).toISOString()).toBe("2025-04-01T00:00:00.000Z")
    expect(boundInstant(params, 0)).toBeGreaterThan(NINE_AM_ON_THE_LAST_DAY)
  })

  it("both fetchers leave dateFrom INCLUSIVE at that day's midnight", async () => {
    const activity = await activitiesWhere({ dateFrom: "2025-01-01" })

    expect(activity.sql).toContain(`"activities"."due_date" >=`)
    expect(new Date(boundInstant(activity.params, 0)).toISOString()).toBe("2025-01-01T00:00:00.000Z")

    for (const table of Object.values(dbSpies)) table.findMany.mockClear()

    const deal = await dealsWhere({ dateFrom: "2025-01-01" })

    expect(deal.sql).toContain(`"deals"."expected_close_date" >=`)
    expect(new Date(boundInstant(deal.params, 0)).toISOString()).toBe("2025-01-01T00:00:00.000Z")
  })

  it("a single-day range is 24 hours wide on both fetchers, not zero", async () => {
    // ANTI-VACUITY, and the shape the date picker actually produces for "just this day". Under the
    // old bound `dateFrom == dateTo` selected exactly the midnight instant and nothing else.
    for (const [label, run, column] of [
      ["activities", activitiesWhere, `"activities"."due_date"`],
      ["deals", dealsWhere, `"deals"."expected_close_date"`],
    ] as const) {
      for (const table of Object.values(dbSpies)) table.findMany.mockClear()

      const { sql, params } = await run({ dateFrom: "2025-03-31", dateTo: "2025-03-31" })

      expect(sql, `${label}: no lower bound`).toContain(`${column} >=`)
      expect(sql, `${label}: no upper bound`).toContain(`${column} <`)
      expect(params).toHaveLength(2)

      const from = boundInstant(params, 0)
      const to = boundInstant(params, 1)

      expect(to - from, `${label}: a one-day range must span 24h`).toBe(24 * 60 * 60 * 1000)
      expect(from).toBeLessThanOrEqual(NINE_AM_ON_THE_LAST_DAY)
      expect(to).toBeGreaterThan(NINE_AM_ON_THE_LAST_DAY)
    }
  })

  it("neither fetcher touches its date column when no range is given", async () => {
    // The floor under everything above: an unconditional predicate would satisfy the bound
    // assertions while narrowing every export whether or not the view carried a range.
    const activity = await activitiesWhere({})

    expect(activity.sql).not.toContain(`"activities"."due_date"`)

    for (const table of Object.values(dbSpies)) table.findMany.mockClear()

    const deal = await dealsWhere({})

    expect(deal.sql).not.toContain(`"deals"."expected_close_date"`)
  })
})

// ---------------------------------------------------------------------------
// THE GUARD (T-40-29). 38-CONTEXT.md:110-116's admin gate was REPLACED by this predicate, so a
// weak guard means Phase 40 made the hole wider than it found it.
// ---------------------------------------------------------------------------

describe("guardExportInput refuses anything that would not narrow", () => {
  it("refuses an empty map — the case the whole guard exists for", () => {
    // An action handed `{}` used to return all 46,054 organizations. It must now read nothing.
    expect(guardExportInput({ entityType: "organization", filters: {} })).toEqual({
      ok: false,
      error: "refused",
    })
    expect(guardExportInput({ entityType: "organization", filters: undefined })).toEqual({
      ok: false,
      error: "refused",
    })
    expect(guardExportInput({ entityType: "organization", filters: null })).toEqual({
      ok: false,
      error: "refused",
    })
  })

  it("refuses a map of only non-whitelisted keys", () => {
    // Not special-cased — `pickFilterParams` walks the WHITELIST, so none of these is ever read.
    const result = guardExportInput({
      entityType: "organization",
      filters: { page: "2", view: "abc", sort: "name", format: "json", ids: "x" },
    })

    expect(result).toEqual({ ok: false, error: "refused" })
  })

  it("refuses a blank search, because a blank value is not a filter", () => {
    for (const search of ["", "   ", "\t\n"]) {
      expect(guardExportInput({ entityType: "organization", filters: { search } })).toEqual({
        ok: false,
        error: "refused",
      })
    }
  })

  it("refuses a value over the parser's length cap", () => {
    // The guard asks about the PICKED map, so a value the parser rejected cannot authorize —
    // which is the difference between this and a fresh non-empty test on the raw input.
    expect(
      guardExportInput({ entityType: "organization", filters: { search: "x".repeat(257) } }),
    ).toEqual({ ok: false, error: "refused" })
  })

  it("refuses a deals export scoped only by pipeline — 25,195 deals is the unbounded export 38-CONTEXT forbids", () => {
    // CRITERION 4'S DELIBERATE NARROWING, and the line where the guard actually falls. A pipeline
    // is a board selector, not a filter; the app's own UI separates them ("Pipeline:" vs
    // "Filters"). Any single non-empty predicate passes this input, which is why there are two
    // tables (40-CONTEXT amendment A2, E-2). If this test ever goes green by returning `ok: true`,
    // the guard has been widened back to the hole it replaced.
    expect(guardExportInput({ entityType: "deal", filters: { pipeline: "p1" } })).toEqual({
      ok: false,
      error: "refused",
    })
  })

  it("refuses a crafted entityType before any query, rather than relying on the fetcher's default", () => {
    // `keysFor` scans VIEW_ENTITY_TYPES, so an unrecognised type yields no keys, nothing is picked,
    // and nothing can authorize. It also must not THROW: `SAVEABLE_FILTER_KEYS["__proto__"]` is
    // `Object.prototype`, whose `.includes` does not exist.
    for (const entityType of ["__proto__", "constructor", "organizations", ""]) {
      expect(
        guardExportInput({
          entityType: entityType as unknown as ViewEntityType,
          filters: { search: "acme" },
        }),
      ).toEqual({ ok: false, error: "refused" })
    }
  })

  it("allows a deals export carrying pipeline PLUS a real filter, and KEEPS the pipeline", () => {
    // The other half of E-2, and the pair completes it: `pipeline` did not authorize this export,
    // but it must still narrow it — otherwise the export would return this owner's deals on every
    // board rather than the one the view was saved on.
    const result = guardExportInput({
      entityType: "deal",
      filters: { pipeline: "p1", owner: "u1" },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.filters).toEqual({ pipeline: "p1", owner: "u1" })
  })

  it("allows each authorizing key on its own surface", () => {
    // Anti-vacuity for every refusal above: a guard that refused EVERYTHING would pass all of them.
    const allowed: [ViewEntityType, ExportFilters][] = [
      ["organization", { search: "acme" }],
      ["person", { search: "acme" }],
      ["deal", { stage: "s1" }],
      ["deal", { assignee: "u1" }],
      ["activity", { status: "overdue" }],
      ["activity", { type: "t1" }],
    ]

    for (const [entityType, filters] of allowed) {
      const result = guardExportInput({ entityType, filters: filters as Record<string, unknown> })

      expect(result.ok, `${entityType} with ${JSON.stringify(filters)} must be allowed`).toBe(true)
      if (!result.ok) continue
      expect(result.filters).toEqual(filters)
    }
  })

  it("never lets `ids` through, so a selection cannot be smuggled into a view export", () => {
    // `ids` is on no whitelist row, so it is never looked up. The T-38-01 presence-not-length
    // guards in the fetchers stay reachable only from the bulk actions that own the 100-id cap.
    const result = guardExportInput({
      entityType: "organization",
      filters: { search: "acme", ids: ["a", "b"] },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.filters).toEqual({ search: "acme" })
    expect("ids" in result.filters).toBe(false)
  })

  it("maps EVERY saveable key into the export vocabulary — none is silently dropped", () => {
    // The gate on the bridge table. A key added to SAVEABLE_FILTER_KEYS that has no ExportFilters
    // home would be authorized by hasExportableFilter and then never reach the query — the T-40-30
    // failure mode one layer down, where the structural gate cannot see it.
    const everything = Object.fromEntries(ALL_SAVEABLE_KEYS.map((key) => [key, `v-${key}`]))
    const mapped = toExportFilters(everything)

    expect(ALL_SAVEABLE_KEYS.length).toBeGreaterThan(0)
    for (const key of ALL_SAVEABLE_KEYS) {
      expect(
        Object.keys(mapped),
        `the saveable key \`${key}\` has no ExportFilters field, so it would authorize an export ` +
          `and then narrow nothing. Add it to VIEW_KEY_TO_EXPORT_KEY.`,
      ).toContain(key)
    }
  })
})

describe("exportViewResults is guarded, capped and not admin-gated", () => {
  const ACTION_PATH = "src/lib/views/export-action.ts"
  const actionSource = readStrippedSource(ACTION_PATH)

  it("read the action source at all", () => {
    // Anti-vacuity for the negative assertions below, which would all pass on an empty string.
    expect(actionSource).toContain("exportViewResults")
    expect(actionSource).toContain("guardExportInput")
    expect(actionSource).toContain("fetchFilteredData")
  })

  it("authenticates, then guards, then queries — in that order", () => {
    const authAt = actionSource.indexOf("await auth()")
    const guardAt = actionSource.indexOf("guardExportInput(")
    const fetchAt = actionSource.indexOf("fetchFilteredData(")

    expect(authAt).toBeGreaterThan(-1)
    expect(guardAt).toBeGreaterThan(-1)
    expect(fetchAt).toBeGreaterThan(-1)
    // Both controls precede the read. A guard that ran after the query would have already
    // materialised the rows it was supposed to refuse.
    expect(authAt).toBeLessThan(fetchAt)
    expect(guardAt).toBeLessThan(fetchAt)
  })

  it("contains NO admin gate — E-9 is a deliberate, visible widening of a Phase 38 restriction", () => {
    // Comments are stripped, so this cannot be satisfied or broken by prose. Adding an admin check
    // necessarily adds one of these tokens to real code.
    expect(
      /["']admin["']/.test(actionSource),
      `${ACTION_PATH} mentions the admin role. E-9: "Export is available to every authenticated ` +
        `user, not admin-gated. That is Decision 2's direct consequence: the guard replaces the ` +
        `gate." An admin gate added here would silently un-widen a recorded widening, and it would ` +
        `do so invisibly, because this deployment's two admin accounts would still pass every test.`,
    ).toBe(false)
    expect(/\brole\b/.test(actionSource)).toBe(false)
  })

  it("passes EXPORT_ROW_CAP as maxRows at the single fetchFilteredData call site", () => {
    const calls = callArguments(actionSource, "fetchFilteredData")

    // Exactly one call site: a second, uncapped one would be the whole cap defeated.
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain("maxRows: EXPORT_ROW_CAP")
    // `format` and `includeCustomFields` are LITERALS here, not caller-supplied (T-40-34): a caller
    // must not be able to request `pipedrive-json` or flip custom-field inclusion.
    expect(calls[0]).toContain(`format: "csv"`)
    expect(calls[0]).toContain("includeCustomFields: true")
    expect(calls[0]).not.toContain("input.format")
    expect(calls[0]).not.toContain("input.includeCustomFields")
    // The filter map reaching the query is the GUARD'S output, never the caller's input.
    expect(calls[0]).toContain("filters: guarded.filters")
    expect(calls[0]).not.toContain("filters: input.filters")
  })

  it("EXPORT_ROW_CAP is a number, and one the live volumes make meaningful", () => {
    expect(typeof EXPORT_ROW_CAP).toBe("number")
    expect(EXPORT_ROW_CAP).toBe(50_000)
    // Activities (79,022 live) exceed it and organizations (46,054) do not, so the cap is a branch
    // that really fires on this data rather than a number no request can reach.
    expect(EXPORT_ROW_CAP).toBeLessThan(79_022)
    expect(EXPORT_ROW_CAP).toBeGreaterThan(46_054)
  })

  it("adds no /api/export route and no new dependency (M-14, N-2)", () => {
    expect(actionSource).not.toContain("/api/export")
    expect(actionSource).not.toContain("NextResponse")
  })

  /**
   * WR-04's control is a CALL, so its absence is the failure mode (review WR-04).
   *
   * `recordExport` is unit-tested in `src/lib/audit/__tests__/export-events.test.ts`, but a
   * correct function nobody calls logs nothing — and this is a security control whose whole value
   * is that it runs on every export. Comments are stripped, so nothing here can be satisfied by
   * the prose in the action's header.
   *
   * This gate does NOT claim the exposure is bounded. It is not: see the WR-04 entry in
   * `.planning/BACKLOG.md`, which stays open.
   */
  it("records the export AFTER the fetch, with the guard's filters and the real row count", () => {
    const recordAt = actionSource.indexOf("recordExport(")
    const fetchAt = actionSource.indexOf("fetchFilteredData(")

    expect(recordAt).toBeGreaterThan(-1)
    // After the fetch, because the row count must be what the export actually produced. Before it,
    // the count could only be a guess, and a refused export would log as though it had happened.
    expect(recordAt).toBeGreaterThan(fetchAt)

    const calls = callArguments(actionSource, "recordExport")

    // Exactly one call site: a second export path that skipped it would be the control defeated.
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain("actorUserId: session.user.id")
    expect(calls[0]).toContain("rowCount: result.count")
    // The filter map recorded is the GUARD'S output, matching what actually narrowed the query —
    // logging `input.filters` would record a map the database never saw.
    expect(calls[0]).toContain("filters: guarded.filters")
    expect(calls[0]).not.toContain("filters: input.filters")
    // Awaited, so the row is written before the action returns and a caller cannot race it.
    expect(actionSource).toContain("await recordExport(")
  })
})
