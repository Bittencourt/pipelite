import { describe, it, expect, vi, beforeEach } from "vitest"
import Papa from "papaparse"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

// formatters.ts imports the drizzle client at module scope for its fetch* helpers.
// None of the PURE formatting functions under test touch it, so the stub below never
// opens a connection and this suite stays DB-free.
//
// The stub is SHAPED rather than bare (it was `{ query: {} }` before Phase 38) so the
// `fetchFilteredData` dispatch and the `where` predicate each fetcher builds can be
// asserted without a database. Every `findMany` resolves `[]`, which is what the
// flattener suites below rely on: none of them reads the database at all.
const dbSpies = vi.hoisted(() => {
  const table = () => ({ findMany: vi.fn(async () => [] as unknown[]) })
  return {
    organizations: table(),
    people: table(),
    deals: table(),
    activities: table(),
  }
})

vi.mock("@/db", () => ({
  db: { query: dbSpies },
}))

import {
  flattenCustomFields,
  flattenDeal,
  flattenOrganization,
  exportToCSV,
  exportToJSON,
  fetchFilteredData,
} from "./formatters"
import { exportToPipedriveCSV, toPipedriveFormat } from "./pipedrive"
import type { ExportEntityType, ExportFilters } from "./types"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type DealArg = Parameters<typeof flattenDeal>[0]

function makeDeal(customFields: Record<string, unknown> | null): DealArg {
  return {
    id: "deal-1",
    title: "Acme",
    value: "1000",
    stageId: "stage-1",
    organizationId: null,
    personId: null,
    ownerId: "user-1",
    expectedCloseDate: null,
    notes: null,
    customFields,
    createdAt: new Date("2026-03-28T00:00:00Z"),
    updatedAt: new Date("2026-03-28T00:00:00Z"),
    stage: { id: "stage-1", name: "Qualified" },
    organization: null,
    person: null,
    owner: { id: "user-1", name: "Owner", email: "owner@example.com" },
  } as DealArg
}

type OrgArg = Parameters<typeof flattenOrganization>[0]

function makeOrg(
  id: string,
  customFields: Record<string, unknown> | null
): OrgArg {
  return {
    id,
    name: `Org ${id}`,
    website: null,
    industry: null,
    notes: null,
    ownerId: "user-1",
    customFields,
    createdAt: new Date("2026-03-28T00:00:00Z"),
    updatedAt: new Date("2026-03-28T00:00:00Z"),
    owner: { id: "user-1", name: "Owner", email: "owner@example.com" },
  } as OrgArg
}

const OK_WRAPPER = { formula: true, value: 1035, error: null }
const ERR_WRAPPER = { formula: true, value: null, error: "Unknown field: Nope" }

// ---------------------------------------------------------------------------
// flattenCustomFields — formula wrapper unwrapping (D-16 / SC-2)
// ---------------------------------------------------------------------------

describe("flattenCustomFields", () => {
  it("unwraps a successful formula wrapper to its scalar value", () => {
    expect(flattenCustomFields({ Margin: OK_WRAPPER }, true)).toEqual({
      custom_Margin: 1035,
    })
  })

  it("renders an errored formula wrapper as #ERROR: <message> (D-05)", () => {
    expect(flattenCustomFields({ Margin: ERR_WRAPPER }, true)).toEqual({
      custom_Margin: "#ERROR: Unknown field: Nope",
    })
  })

  it("leaves a plain scalar untouched", () => {
    expect(flattenCustomFields({ Margin: 1035 }, true)).toEqual({
      custom_Margin: 1035,
    })
    expect(flattenCustomFields({ Nome: "Acme" }, true)).toEqual({
      custom_Nome: "Acme",
    })
    expect(flattenCustomFields({ Nada: null }, true)).toEqual({
      custom_Nada: null,
    })
  })

  it("leaves a multi_select array untouched — arrays are never wrappers", () => {
    const flat = flattenCustomFields({ Origem: ["Outbound Manual"] }, true)
    expect(flat).toEqual({ custom_Origem: ["Outbound Manual"] })
    expect(Array.isArray(flat.custom_Origem)).toBe(true)
  })

  it("preserves existing guards: include=false and null fields both return {}", () => {
    expect(flattenCustomFields({ Margin: OK_WRAPPER }, false)).toEqual({})
    expect(flattenCustomFields(null, true)).toEqual({})
    expect(flattenCustomFields(undefined, true)).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// End-to-end CSV regression — the measured papaparse 5.5.3 defect (D-16 / SC-2)
// ---------------------------------------------------------------------------

describe("exportToCSV with formula custom fields", () => {
  it("emits the scalar, never the literal string [object Object]", () => {
    const rows = [
      flattenDeal(makeDeal({ Margin: OK_WRAPPER }), true),
      flattenDeal(makeDeal({ Margin: ERR_WRAPPER }), true),
      flattenDeal(makeDeal({ Margin: 1035 }), true),
    ]

    const csv = exportToCSV(rows)

    expect(csv).not.toContain("[object Object]")
    expect(csv).toContain("1035")
    expect(csv).toContain("#ERROR: Unknown field: Nope")

    // Assert on the parsed cell, not just substring presence.
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true })
    expect(parsed.data[0].custom_Margin).toBe("1035")
    expect(parsed.data[1].custom_Margin).toBe("#ERROR: Unknown field: Nope")
  })

  it("JSON export inherits the same unwrapping (shares the flattened rows)", () => {
    const rows = [flattenDeal(makeDeal({ Margin: OK_WRAPPER }), true)]
    const json = JSON.parse(exportToJSON(rows, "deal"))

    expect(json.data[0].custom_Margin).toBe(1035)
    expect(JSON.stringify(json)).not.toContain("[object Object]")
  })
})

describe("exportToPipedriveCSV with formula custom fields", () => {
  it("emits the scalar, never the literal string [object Object]", () => {
    const rows = [
      flattenDeal(makeDeal({ Margin: OK_WRAPPER }), true),
      flattenDeal(makeDeal({ Margin: ERR_WRAPPER }), true),
    ]

    const csv = exportToPipedriveCSV(rows, "deal")

    expect(csv).not.toContain("[object Object]")
    expect(csv).toContain("1035")

    const parsed = Papa.parse<Record<string, string>>(csv, { header: true })
    expect(parsed.data[0].custom_Margin).toBe("1035")
    expect(parsed.data[1].custom_Margin).toBe("#ERROR: Unknown field: Nope")
  })
})

// ---------------------------------------------------------------------------
// CSV quoting — guards against anyone replacing Papa.unparse with hand-rolled joining
// ---------------------------------------------------------------------------

describe("CSV quoting of punctuated custom field names", () => {
  const NASTY_KEY = 'Tem solução, de "solar"?\nSegunda linha'

  it("keeps a key containing a comma, a quote and a newline as one field", () => {
    const rows = [flattenDeal(makeDeal({ [NASTY_KEY]: OK_WRAPPER }), true)]
    const csv = exportToCSV(rows)

    const parsed = Papa.parse<Record<string, string>>(csv, { header: true })
    expect(parsed.errors).toEqual([])

    const headers = parsed.meta.fields ?? []
    expect(headers).toContain(`custom_${NASTY_KEY}`)
    // One header per flattened key — no field split by the embedded comma/newline.
    expect(headers.length).toBe(Object.keys(rows[0]).length)
    expect(parsed.data[0][`custom_${NASTY_KEY}`]).toBe("1035")
  })
})

// ---------------------------------------------------------------------------
// Column derivation — the measured first-row-only header defect (SC-2)
//
// `Papa.unparse(data, { header: true })` builds the header from the FIRST object
// only. Measured on the live dataset: a 46,055-row organization export emitted ZERO
// `custom_*` columns although 30,264 of those rows held custom field values, because
// row 1 happened not to carry any. Every fixture below therefore puts row 1 WITHOUT
// custom fields and a LATER row WITH them — the reverse ordering passes even against
// the broken code and proves nothing.
// ---------------------------------------------------------------------------

describe("exportToCSV column derivation across all rows", () => {
  it("emits a custom column populated only by a LATER row (organizations)", () => {
    const rows = [
      flattenOrganization(makeOrg("org-1", null), true),
      flattenOrganization(makeOrg("org-2", { Margin: OK_WRAPPER }), true),
    ]

    const csv = exportToCSV(rows)
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true })

    expect(parsed.errors).toEqual([])
    expect(parsed.meta.fields).toContain("custom_Margin")
    expect(parsed.data[1].custom_Margin).toBe("1035")
    // Row 1 genuinely has no value — an empty cell, not a missing column.
    expect(parsed.data[0].custom_Margin).toBe("")
  })

  it("unions custom columns contributed by different rows (deals)", () => {
    const rows = [
      flattenDeal(makeDeal(null), true),
      flattenDeal(makeDeal({ Alpha: OK_WRAPPER }), true),
      flattenDeal(makeDeal({ Zeta: ERR_WRAPPER }), true),
    ]

    const csv = exportToCSV(rows)
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true })

    expect(parsed.errors).toEqual([])
    expect(parsed.meta.fields).toContain("custom_Alpha")
    expect(parsed.meta.fields).toContain("custom_Zeta")
    expect(parsed.data[1].custom_Alpha).toBe("1035")
    expect(parsed.data[2].custom_Zeta).toBe("#ERROR: Unknown field: Nope")
    expect(parsed.data[0].custom_Alpha).toBe("")
  })

  it("keeps every native column in its current order and position", () => {
    // The native columns exactly as flattenDeal emits them today, with no custom fields.
    const nativeOrder = Object.keys(flattenDeal(makeDeal(null), false))

    const rows = [
      flattenDeal(makeDeal(null), true),
      flattenDeal(makeDeal({ Margin: OK_WRAPPER }), true),
    ]

    const headers = Papa.parse<Record<string, string>>(exportToCSV(rows), {
      header: true,
    }).meta.fields!

    // Position, not merely membership: an export's column order is a user-visible contract.
    expect(headers.slice(0, nativeOrder.length)).toEqual(nativeOrder)
    // Custom columns follow the natives; none is interleaved.
    expect(headers.slice(nativeOrder.length).every((h) => h.startsWith("custom_"))).toBe(
      true
    )
  })

  it("orders custom columns deterministically, independent of row order", () => {
    const a = flattenDeal(makeDeal({ Zeta: 1 }), true)
    const b = flattenDeal(makeDeal({ Alpha: 2 }), true)
    const c = flattenDeal(makeDeal({ Mid: 3 }), true)

    const customsOf = (rows: Record<string, unknown>[]) =>
      (
        Papa.parse<Record<string, string>>(exportToCSV(rows), { header: true }).meta
          .fields ?? []
      ).filter((h) => h.startsWith("custom_"))

    const forward = customsOf([a, b, c])
    const reversed = customsOf([c, b, a])

    expect(forward).toEqual(["custom_Alpha", "custom_Mid", "custom_Zeta"])
    expect(reversed).toEqual(forward)
  })

  it("still produces an empty string for an empty dataset", () => {
    expect(exportToCSV([])).toBe("")
  })
})

describe("exportToPipedriveCSV column derivation across all rows", () => {
  it("emits a custom column populated only by a LATER row", () => {
    const rows = [
      flattenDeal(makeDeal(null), true),
      flattenDeal(makeDeal({ Margin: OK_WRAPPER }), true),
    ]

    const csv = exportToPipedriveCSV(rows, "deal")
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true })

    expect(parsed.errors).toEqual([])
    expect(parsed.meta.fields).toContain("custom_Margin")
    expect(parsed.data[1].custom_Margin).toBe("1035")
  })

  it("keeps the Pipedrive native column mapping in its current order", () => {
    const nativeOrder = Object.keys(
      toPipedriveFormat([flattenDeal(makeDeal(null), false)], "deal")[0]
    )

    const rows = [
      flattenDeal(makeDeal(null), true),
      flattenDeal(makeDeal({ Margin: OK_WRAPPER }), true),
    ]

    const headers = Papa.parse<Record<string, string>>(
      exportToPipedriveCSV(rows, "deal"),
      { header: true }
    ).meta.fields!

    expect(headers.slice(0, nativeOrder.length)).toEqual(nativeOrder)
  })
})

// ---------------------------------------------------------------------------
// ExportFilters.ids narrowing (BULK-04)
//
// WHAT THIS BLOCK PROVES, and it is worth being explicit about the boundary:
//   - `fetchFilteredData` dispatches to exactly ONE of the four private fetchers per entity
//     type, and to none of the other three (a mis-wired switch arm typechecks identically to
//     a correct one, so only a behavioural assertion catches it);
//   - a `filters.ids` list reaches that fetcher's `where` predicate as BOUND PARAMETERS, never
//     as text interpolated into the statement (T-38-15);
//   - an EMPTY id list still contributes a predicate, so the predicate can never silently
//     degrade to "no filter" and return the whole table (T-38-01).
//
// WHAT IT DELIBERATELY CANNOT PROVE: that the predicate is SQL the database will accept, or
// that it selects the right rows. `@/db` is mocked in this file, so no statement is ever
// executed against Postgres. Phase 37 shipped a malformed drizzle fragment — an interpolated
// list that expanded to `= ANY(($1,$2,$3))` — and a wholly-mocked suite passed it cleanly.
// The generated SQL and the resulting row counts are therefore proven against the live
// database in `src/lib/export/formatters-live.test.ts`, which is not optional coverage for
// this feature but the primary detector for that whole class of defect.
// ---------------------------------------------------------------------------

const dialect = new PgDialect()

/** Render a fetcher's `where` predicate to the SQL text + bound params it would execute. */
function renderWhere(where: unknown): { sql: string; params: unknown[] } {
  const q = dialect.sqlToQuery(where as SQL)
  return { sql: q.sql, params: q.params }
}

type TableKey = keyof typeof dbSpies

// Annotated as a total Record so a fifth `ExportEntityType` makes this file fail to compile
// (TS2741) rather than quietly leaving an entity type uncovered.
const TABLE_BY_ENTITY: Record<ExportEntityType, TableKey> = {
  organization: "organizations",
  person: "people",
  deal: "deals",
  activity: "activities",
}

const ENTITY_CASES = Object.entries(TABLE_BY_ENTITY) as [ExportEntityType, TableKey][]

function csvExport(entityType: ExportEntityType, options: { filters?: ExportFilters }) {
  return fetchFilteredData({
    entityType,
    format: "csv",
    includeCustomFields: true,
    ...options,
  })
}

function whereOf(table: TableKey): { sql: string; params: unknown[] } {
  // The stub is declared arg-less (nothing in this file cares what a fetcher passes except
  // this helper), so the recorded call tuple needs re-typing to be read.
  const calls = dbSpies[table].findMany.mock.calls as unknown as [{ where?: unknown }][]
  expect(calls.length).toBe(1)
  return renderWhere(calls[0][0].where)
}

/** A mis-wired switch arm is invisible to the type system; only this catches it. */
function expectOnlyTableQueried(expected: TableKey): void {
  for (const table of Object.keys(dbSpies) as TableKey[]) {
    if (table === expected) {
      expect(dbSpies[table].findMany).toHaveBeenCalledTimes(1)
    } else {
      expect(dbSpies[table].findMany).not.toHaveBeenCalled()
    }
  }
}

describe("fetchFilteredData id narrowing", () => {
  beforeEach(() => {
    for (const table of Object.values(dbSpies)) table.findMany.mockClear()
  })

  it("covers every export entity type below", () => {
    // Anti-vacuity: deleting a case from the table below must fail here, not pass silently.
    expect(Object.keys(TABLE_BY_ENTITY)).toEqual([
      "organization",
      "person",
      "deal",
      "activity",
    ])
    expect(ENTITY_CASES).toHaveLength(4)
  })

  describe.each(ENTITY_CASES)("%s", (entityType, table) => {
    it(`queries only ${table} and binds every id as a parameter`, async () => {
      await csvExport(entityType, { filters: { ids: ["id-a", "id-b"] } })

      expectOnlyTableQueried(table)

      const { sql, params } = whereOf(table)
      // Both ids arrive as bound parameters...
      expect(params).toEqual(["id-a", "id-b"])
      // ...and neither is interpolated into the statement text (T-38-15).
      expect(sql).not.toContain("id-a")
      expect(sql).not.toContain("id-b")
      expect(sql).toContain(`"${table}"."id" in `)
    })

    it("still contributes a predicate for an empty id list", async () => {
      await csvExport(entityType, { filters: { ids: [] } })
      const scoped = whereOf(table)

      dbSpies[table].findMany.mockClear()
      await csvExport(entityType, {})
      const unscoped = whereOf(table)

      // Differing from the unfiltered predicate is the assertion that matters: it proves the
      // condition was added rather than skipped. The SQL text itself, and the zero rows it
      // returns against real data, are proven in `formatters-live.test.ts`.
      expect(scoped.sql).not.toBe(unscoped.sql)
      expect(scoped.sql).toContain("false")
      expect(unscoped.sql).not.toContain("false")
    })

    it("leaves the predicate untouched when no id list is supplied", async () => {
      await csvExport(entityType, {})
      const omitted = whereOf(table)

      dbSpies[table].findMany.mockClear()
      await csvExport(entityType, { filters: {} })
      const empty = whereOf(table)

      expect(empty).toEqual(omitted)
      expect(omitted.sql).toContain(`"${table}"."deleted_at" is null`)
    })

    it("composes an id list with the existing owner filter", async () => {
      await csvExport(entityType, { filters: { owner: "user-1", ids: ["id-a"] } })

      const { sql, params } = whereOf(table)
      // The id list narrows, it does not replace: the owner predicate survives alongside it.
      expect(sql).toContain(`"${table}"."owner_id" =`)
      expect(sql).toContain(`"${table}"."id" in `)
      expect(sql).toContain(`"${table}"."deleted_at" is null`)
      expect(params).toEqual(["user-1", "id-a"])
    })
  })
})
