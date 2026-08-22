/**
 * CSV FORMULA INJECTION AT THE ONE CHOKE POINT (review IN-06).
 *
 * `Papa.unparse` quotes and escapes correctly for CSV and does nothing about a cell whose first
 * character is `=`, `+`, `-`, `@`, tab or CR: Excel and LibreOffice evaluate those as formulas
 * when the file is opened. An organization `notes` field, or any text custom field, is
 * attacker-controlled by anyone who can create a record.
 *
 * WHY THE TESTS LIVE AGAINST `exportToCSV` RATHER THAN THE HELPER ALONE. All four entity exports
 * funnel through that function, so it is the only place a fix cannot be routed around. A helper
 * proven in isolation and then not called is exactly the shape of the bug this file exists to
 * prevent, so the assertions read the CSV text.
 *
 * SCOPE: this is Phase 38 code and is not scored against Phase 40. It is fixed here because
 * Phase 40's Decision 2 changed WHO can trigger it — before, a filters-taking export required an
 * admin; after, any authenticated user can produce one.
 */
import { describe, expect, it, vi } from "vitest"

// `formatters.ts` imports the drizzle client at module scope for its `fetch*` helpers. Nothing
// under test here touches it, so the stub keeps this suite DB-free — the same stub, and the same
// reason, as `formatters.test.ts`. Without it the whole file fails to collect with
// "DATABASE_URL environment variable is not set" before a single assertion runs.
vi.mock("@/db", () => ({
  db: { query: {} },
}))

import { exportToCSV, neutraliseCsvInjection } from "../formatters"

/** The six leading characters a spreadsheet treats as the start of an expression. */
const RISK_PREFIXES = ["=", "+", "-", "@", "\t", "\r"]

describe("neutraliseCsvInjection", () => {
  it("prefixes a string opening with each risk character", () => {
    for (const prefix of RISK_PREFIXES) {
      const payload = `${prefix}cmd|'/C calc'!A0`

      expect(neutraliseCsvInjection(payload)).toBe(`'${payload}`)
    }
  })

  it("leaves an ordinary string untouched", () => {
    for (const safe of ["Acme Corp", "a=b", "note: -5 units", "", "  =not first"]) {
      expect(neutraliseCsvInjection(safe)).toBe(safe)
    }
  })

  /**
   * THE REGRESSION THE NAIVE RULE CAUSES. The OWASP mitigation prefixes any cell starting with
   * `-`, which turns every negative number in the file into text in Excel — deal values, formula
   * results, balances. A numeric string is not an expression, so it is exempt, and that exemption
   * is what makes the fix safe to apply to the whole file rather than to a chosen column list.
   */
  it("leaves a negative or signed number as a number", () => {
    for (const numeric of ["-5", "-12.5", "+3", "-0", "1e-9", "-1e4"]) {
      expect(neutraliseCsvInjection(numeric)).toBe(numeric)
    }
  })

  it("still neutralises an expression that merely begins like a number", () => {
    // `-2+3+cmd|'/C calc'!A0` is the documented bypass for a parse-as-number check that uses
    // parseFloat (which stops at the first non-numeric character and returns -2).
    expect(neutraliseCsvInjection("-2+3+cmd|'/C calc'!A0")).toBe("'-2+3+cmd|'/C calc'!A0")
  })

  it("passes non-string values through unchanged", () => {
    expect(neutraliseCsvInjection(42)).toBe(42)
    expect(neutraliseCsvInjection(-42)).toBe(-42)
    expect(neutraliseCsvInjection(null)).toBe(null)
    expect(neutraliseCsvInjection(undefined)).toBe(undefined)
    expect(neutraliseCsvInjection(true)).toBe(true)
  })
})

describe("exportToCSV applies the neutralisation", () => {
  it("neutralises an injected notes field", () => {
    const csv = exportToCSV([{ name: "Acme", notes: "=HYPERLINK(\"http://evil\",\"click\")" }])

    expect(csv).toContain("'=HYPERLINK")
    // The bare form must not survive anywhere in the file.
    expect(csv).not.toMatch(/(^|,|")=HYPERLINK/)
  })

  it("neutralises an injected custom field cell", () => {
    const csv = exportToCSV([{ name: "Acme", custom_bio: "@SUM(1+1)*cmd" }])

    expect(csv).toContain("'@SUM(1+1)*cmd")
  })

  it("neutralises a cell on a row after the first", () => {
    // `deriveCsvColumns` scans every row for the column set; the value pass must too.
    const csv = exportToCSV([
      { name: "Safe", notes: "ordinary" },
      { name: "Evil", notes: "=1+1" },
    ])

    expect(csv).toContain("'=1+1")
  })

  it("does not alter the column set or the row count", () => {
    const rows = [
      { name: "Acme", value: -5, notes: "=1+1" },
      { name: "Other", value: 12, notes: "fine" },
    ]
    // papaparse emits CRLF, so the split is on the pair rather than on "\n".
    const lines = exportToCSV(rows).trim().split("\r\n")

    expect(lines[0]).toBe("name,value,notes")
    expect(lines).toHaveLength(3)
    // The negative number reaches the file as a number, not as text.
    expect(lines[1]).toContain("-5")
    expect(lines[1]).not.toContain("'-5")
  })

  it("still returns an empty string for an empty dataset", () => {
    expect(exportToCSV([])).toBe("")
  })
})
