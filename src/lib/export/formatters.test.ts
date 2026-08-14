import { describe, it, expect, vi } from "vitest"
import Papa from "papaparse"

// formatters.ts imports the drizzle client at module scope for its fetch* helpers.
// None of the pure formatting functions under test touch it, so a bare stub is enough
// and keeps this suite DB-free.
vi.mock("@/db", () => ({
  db: { query: {} },
}))

import {
  flattenCustomFields,
  flattenDeal,
  exportToCSV,
  exportToJSON,
} from "./formatters"
import { exportToPipedriveCSV } from "./pipedrive"

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
