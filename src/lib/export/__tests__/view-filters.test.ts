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
import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"
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

  it("pending selects rows that have NO completion timestamp, with no date comparison", async () => {
    const { sql } = await activitiesWhere({ status: "pending" })

    expect(sql).toContain(`"activities"."completed_at" is null`)
    expect(sql).not.toContain(`"activities"."completed_at" is not null`)
    // `pending` is not `overdue`: a future-dated incomplete activity is pending, and folding the
    // due-date comparison into this branch would silently drop those rows from the export.
    expect(sql).not.toContain(`"activities"."due_date" <`)
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
