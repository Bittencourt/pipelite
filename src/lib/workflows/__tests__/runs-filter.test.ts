/**
 * THE WFOPS-02 DEFAULT-HIDDEN GATE — `parseRunsSearchParams`.
 *
 * 41-CONTEXT locks the dry-run decision as "A dry run IS persisted, as a `workflow_runs` row with
 * `dryRun: true`, filtered out of the runs list by default". Two halves of that sentence are
 * asserted here and nowhere else in the codebase:
 *
 *   (a) THE DEFAULT. A URL with no `?dryRun` param yields `showDryRuns === false`. This is the
 *       headline case, and it is first in the file because it is the requirement — everything else
 *       is the boundary around it.
 *   (b) THE EXACT MATCH. `?dryRun=2` yields `false`. A `Boolean(sp.dryRun)` implementation passes
 *       every other assertion in this file and fails that one, which is the only reason it is here.
 *       41-VALIDATION.md names the case by hand for the same reason.
 *
 * The `status` and `page` halves carry the tampering and denial-of-service dispositions from the
 * plan's threat register (T-41-08, T-41-09): membership is a frozen-array scan rather than a
 * property lookup, so `__proto__` is an ordinary non-member, and a megabyte of digits cannot reach
 * an `OFFSET` or a log line.
 *
 * Every test here is a pure-function test with no database and no mock. That is the point of the
 * module's signature, and the last describe block asserts it structurally (T-41-10).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, it, expect } from "vitest"

import {
  MAX_PAGE_DIGITS,
  MIN_RUNS_PAGE,
  SHOW_DRY_RUNS_PARAM,
  SHOW_DRY_RUNS_VALUE,
  VALID_RUN_STATUSES,
  parseRunsSearchParams,
} from "../runs-filter"

/** A megabyte of digits — the T-41-09 input, built once. */
const MEGABYTE_OF_DIGITS = "9".repeat(1024 * 1024)

// -------------------------------------------------------------------------------------------------
// showDryRuns — WFOPS-02's default, and the reason this module exists (T-41-07).
// -------------------------------------------------------------------------------------------------

describe("parseRunsSearchParams showDryRuns — WFOPS-02: hidden by default, revealed only by `1`", () => {
  it("the two constants are the literal pair both sides of the URL must use", () => {
    // Plan 41-10's client toggle sets these, and the server component reads them. A re-typed
    // literal on either side is the T-37-03 defect class in its dry-run form: a toggle that writes
    // a param the reader ignores.
    expect(SHOW_DRY_RUNS_PARAM).toBe("dryRun")
    expect(SHOW_DRY_RUNS_VALUE).toBe("1")
  })

  it("hides test runs when the param is absent entirely — THE headline case", () => {
    expect(
      parseRunsSearchParams({}).showDryRuns,
      "41-CONTEXT locks dry runs as 'filtered out of the runs list by default'. A URL with no " +
        "dryRun param must resolve to real runs only; this is the requirement, not a boundary case.",
    ).toBe(false)
  })

  it("reveals test runs for exactly the literal `1`", () => {
    expect(parseRunsSearchParams({ dryRun: SHOW_DRY_RUNS_VALUE }).showDryRuns).toBe(true)
    expect(parseRunsSearchParams({ dryRun: "1" }).showDryRuns).toBe(true)
  })

  it("does NOT reveal test runs for `?dryRun=2`", () => {
    expect(
      parseRunsSearchParams({ dryRun: "2" }).showDryRuns,
      "Only the literal \"1\" reveals test runs. `status-filter.tsx` sets exactly \"1\", so " +
        "anything looser — `Boolean(sp.dryRun)`, `sp.dryRun !== undefined`, a parseInt — turns a " +
        "crafted URL into a way to see rows the default deliberately hides (T-41-07).",
    ).toBe(false)
  })

  it.each([
    ["0", "the value that literally says no"],
    ["", "a bare `?dryRun` with no value"],
    ["true", "the JSON spelling"],
    ["yes", "the English spelling"],
    ["01", "a leading zero, which parseInt would accept"],
    ["1 ", "a trailing space, which a trimming parser would accept"],
    [" 1", "a leading space"],
    ["1,1", "a repeated-looking value"],
  ])("does not reveal test runs for ?dryRun=%o (%s)", (value) => {
    expect(
      parseRunsSearchParams({ dryRun: value }).showDryRuns,
      "Only the literal \"1\" reveals test runs; this value must not (T-41-07).",
    ).toBe(false)
  })

  it("takes the first value of a repeated param, and a repeated `1` still reveals", () => {
    expect(parseRunsSearchParams({ dryRun: ["1", "0"] }).showDryRuns).toBe(true)
    expect(parseRunsSearchParams({ dryRun: ["0", "1"] }).showDryRuns).toBe(false)
  })

  it("reads a URLSearchParams source the same way the client toggle writes it", () => {
    const params = new URLSearchParams()
    params.set(SHOW_DRY_RUNS_PARAM, SHOW_DRY_RUNS_VALUE)

    expect(parseRunsSearchParams(params).showDryRuns).toBe(true)
    expect(parseRunsSearchParams(new URLSearchParams()).showDryRuns).toBe(false)
  })
})

// -------------------------------------------------------------------------------------------------
// status — the whitelist extracted verbatim from `runs/page.tsx:12` (T-41-08).
// -------------------------------------------------------------------------------------------------

describe("parseRunsSearchParams status — a frozen-array membership test, never a lookup", () => {
  it("carries exactly the five WorkflowStatus members, and is frozen", () => {
    expect([...VALID_RUN_STATUSES]).toEqual([
      "pending",
      "running",
      "completed",
      "failed",
      "waiting",
    ])
    expect(Object.isFrozen(VALID_RUN_STATUSES)).toBe(true)
  })

  it.each(VALID_RUN_STATUSES.map((status) => [status]))("round-trips %s to itself", (status) => {
    expect(parseRunsSearchParams({ status }).status).toBe(status)
  })

  it.each([
    ["cancelled", "not a member of WorkflowStatus in this schema at all"],
    ["CANCELLED", "upper-cased non-member"],
    ["FAILED", "a member in the wrong case — no case folding"],
    ["Failed", "title case"],
    [" failed", "a padded member — no trimming"],
    ["failed ", "a trailing-space member"],
    ["__proto__", "the prototype-pollution probe"],
    ["constructor", "the other one"],
    ["toString", "an inherited member of Object.prototype"],
    ["", "the empty string"],
    ["pending'; DROP TABLE workflow_runs; --", "a SQL-shaped value"],
  ])("narrows %o to null (%s)", (raw) => {
    expect(
      parseRunsSearchParams({ status: raw }).status,
      "Membership is a frozen-array scan against the five WorkflowStatus members. Anything else " +
        "is null so it never reaches an `eq(workflowRuns.status, …)` (T-41-08).",
    ).toBeNull()
  })

  it("narrows a megabyte of text to null without throwing", () => {
    expect(parseRunsSearchParams({ status: MEGABYTE_OF_DIGITS }).status).toBeNull()
  })

  it("takes the first value of a repeated status and does not throw", () => {
    expect(parseRunsSearchParams({ status: ["failed", "running"] }).status).toBe("failed")
    expect(parseRunsSearchParams({ status: ["bogus", "failed"] }).status).toBeNull()
  })

  it("returns a plain object on Object.prototype, and pollutes no global", () => {
    // An OWN `__proto__` key, which an object literal cannot express — a literal would set the
    // prototype instead of creating the property.
    const hostile = JSON.parse('{"__proto__":{"polluted":true},"status":"failed","page":"2"}')
    const result = parseRunsSearchParams(hostile)

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(result.status).toBe("failed")
    expect(result.page).toBe(2)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype).not.toHaveProperty("polluted")
  })
})

// -------------------------------------------------------------------------------------------------
// page — never NaN, never negative, never fractional, never a megabyte (T-41-09).
// -------------------------------------------------------------------------------------------------

describe("parseRunsSearchParams page — bounded, whole, and at least one", () => {
  it("exposes its bound as a named constant a test can import", () => {
    expect(MIN_RUNS_PAGE).toBe(1)
    expect(Number.isSafeInteger(MAX_PAGE_DIGITS)).toBe(true)
    expect(MAX_PAGE_DIGITS).toBeGreaterThan(0)
    expect(MAX_PAGE_DIGITS).toBeLessThan(16)
  })

  it("defaults to 1 when absent", () => {
    expect(parseRunsSearchParams({}).page).toBe(1)
    expect(parseRunsSearchParams({ page: undefined }).page).toBe(1)
  })

  it.each([
    ["1", 1],
    ["3", 3],
    ["20", 20],
    ["999999999", 999999999],
  ])("accepts %o as %i", (raw, expected) => {
    expect(parseRunsSearchParams({ page: raw }).page).toBe(expected)
  })

  it.each([
    ["0", "below the first page"],
    ["-5", "negative"],
    ["abc", "not a number at all"],
    ["", "empty"],
    ["1e9", "exponent notation, which Number() would happily accept"],
    ["1.5", "fractional"],
    ["-0", "negative zero"],
    ["Infinity", "the literal"],
    ["NaN", "the other literal"],
    ["0x10", "hex, which Number() would accept as 16"],
    [" 3 ", "padded"],
    ["3px", "a numeric prefix, which parseInt would accept as 3"],
  ])("collapses %o to 1 (%s)", (raw) => {
    const { page } = parseRunsSearchParams({ page: raw })

    expect(page, "A malformed page is page 1 — never NaN, never negative, never fractional.").toBe(1)
    expect(Number.isSafeInteger(page)).toBe(true)
  })

  it("collapses a megabyte of digits to 1 rather than to a huge number", () => {
    expect(MEGABYTE_OF_DIGITS.length).toBeGreaterThan(MAX_PAGE_DIGITS)
    expect(
      parseRunsSearchParams({ page: MEGABYTE_OF_DIGITS }).page,
      "MAX_PAGE_DIGITS bounds the digit count so a megabyte value cannot reach an OFFSET or a log " +
        "line (T-41-09).",
    ).toBe(1)
  })

  it("rejects one digit more than MAX_PAGE_DIGITS and accepts exactly MAX_PAGE_DIGITS", () => {
    // Anti-vacuity for the bound: the cap must be the thing rejecting, not the safe-integer test.
    expect(parseRunsSearchParams({ page: "1".repeat(MAX_PAGE_DIGITS) }).page).toBe(
      Number("1".repeat(MAX_PAGE_DIGITS)),
    )
    expect(parseRunsSearchParams({ page: "1".repeat(MAX_PAGE_DIGITS + 1) }).page).toBe(1)
  })
})

// -------------------------------------------------------------------------------------------------
// TOTALITY — a valid RunsFilter for any input, and never a throw.
// -------------------------------------------------------------------------------------------------

describe("parseRunsSearchParams is TOTAL — every input yields a valid filter, nothing throws", () => {
  /**
   * The throwing-getter row is IN CONTRACT, not documented away. `parseRunsSearchParams` reads each
   * key through one guarded reader, so a hostile accessor is caught and treated as absent. There is
   * no `error.tsx` above `/workflows/[id]/runs`, so a throw here is a blank page rather than a
   * degraded one — which is why the throw is swallowed rather than propagated.
   */
  const throwingGetter = Object.defineProperties(
    {},
    {
      status: {
        get() {
          throw new Error("hostile accessor")
        },
        enumerable: true,
      },
      page: {
        get() {
          throw new Error("hostile accessor")
        },
        enumerable: true,
      },
      dryRun: {
        get() {
          throw new Error("hostile accessor")
        },
        enumerable: true,
      },
    },
  )

  const hostile: [string, unknown][] = [
    ["undefined", undefined],
    ["null", null],
    ["an empty object", {}],
    ["a null-prototype object", Object.create(null)],
    ["a null-prototype object carrying values", Object.assign(Object.create(null), { page: "2" })],
    ["an object whose every value is an empty array", { status: [], page: [], dryRun: [] }],
    ["an object whose every value is null", { status: null, page: null, dryRun: null }],
    ["an object of numbers", { status: 1, page: 2, dryRun: 1 }],
    ["an object of objects", { status: {}, page: {}, dryRun: {} }],
    ["an object with a throwing getter on every key", throwingGetter],
    ["a string", "status=failed"],
    ["a number", 42],
    ["an array", ["failed"]],
    ["a function", () => "failed"],
    ["a URLSearchParams", new URLSearchParams("status=failed&page=2&dryRun=1")],
  ]

  it.each(hostile)("returns a valid RunsFilter for %s", (_label, input) => {
    const result = parseRunsSearchParams(input as never)

    expect(typeof result.page).toBe("number")
    expect(Number.isSafeInteger(result.page)).toBe(true)
    expect(result.page).toBeGreaterThanOrEqual(MIN_RUNS_PAGE)
    expect(typeof result.showDryRuns).toBe("boolean")
    expect(result.status === null || VALID_RUN_STATUSES.includes(result.status)).toBe(true)
    expect(Object.keys(result).sort()).toEqual(["page", "showDryRuns", "status"])
  })

  it("the throwing-getter row really does throw when read directly", () => {
    // Anti-vacuity: if the fixture stopped throwing, the row above would prove nothing.
    expect(() => (throwingGetter as { status: unknown }).status).toThrow("hostile accessor")
  })

  it("resolves the URLSearchParams row to its actual values, not to defaults", () => {
    // Anti-vacuity for the hostile table: a parser that returned the default for EVERYTHING would
    // satisfy every row above.
    const result = parseRunsSearchParams(new URLSearchParams("status=failed&page=2&dryRun=1"))

    expect(result).toEqual({ page: 2, status: "failed", showDryRuns: true })
  })
})

// -------------------------------------------------------------------------------------------------
// The no-runtime-database gate (T-41-10). Reproduces `views/__tests__/validate.test.ts`' idiom.
// -------------------------------------------------------------------------------------------------

describe("runs-filter.ts has no runtime database import — only an erased type", () => {
  const source = readFileSync(join(__dirname, "..", "runs-filter.ts"), "utf8")

  /**
   * Every module specifier in a static `import`/`export … from` or a dynamic `import()`, paired
   * with whether the statement was TYPE-ONLY.
   *
   * Asserting on the import graph rather than grepping the file is deliberate: the header comment
   * has to be free to say `@/db` as often as it needs to, and the cheapest way to satisfy a naive
   * grep would be deleting the explanation. Deleting a comment does not change this outcome; adding
   * a runtime import does.
   */
  function importSpecifiers(code: string): { specifier: string; typeOnly: boolean }[] {
    const withoutComments = code
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    const found: { specifier: string; typeOnly: boolean }[] = []
    const patterns: [RegExp, boolean][] = [
      [/(?:^|\n)\s*import\s+type\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g, true],
      [/(?:^|\n)\s*export\s+type\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g, true],
      [/(?:^|\n)\s*import\s+(?!type\s)(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g, false],
      [/(?:^|\n)\s*export\s+(?!type\s)[\s\S]*?\s+from\s+["']([^"']+)["']/g, false],
      [/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, false],
      [/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, false],
    ]

    for (const [pattern, typeOnly] of patterns) {
      for (const match of withoutComments.matchAll(pattern)) {
        found.push({ specifier: match[1], typeOnly })
      }
    }

    return found
  }

  it("imports the WorkflowStatus union, and imports it TYPE-ONLY", () => {
    const specifiers = importSpecifiers(source)

    // Non-empty, or the parser is broken and every assertion below is vacuous.
    expect(specifiers.length).toBeGreaterThan(0)
    expect(specifiers.every((entry) => entry.typeOnly)).toBe(true)
    expect(specifiers.map((entry) => entry.specifier)).toContain("@/db/schema/workflows")
  })

  it("has no RUNTIME import that could reach the database", () => {
    const forbidden = [/^@\/db(\/|$)/, /(^|\/)db(\/|$)/, /drizzle/, /^pg$/, /queries/, /^@\/auth$/]

    for (const { specifier, typeOnly } of importSpecifiers(source)) {
      if (typeOnly) continue

      for (const pattern of forbidden) {
        expect(
          specifier,
          "`status-filter.tsx` is a \"use client\" module, so a runtime `@/db` import here lands " +
            "in the browser bundle and drags drizzle and pg with it (T-41-10).",
        ).not.toMatch(pattern)
      }
    }
  })

  it("would notice a runtime db import: the parser finds one in a synthetic source", () => {
    // Proof the detector can fire. A gate whose detector never fires proves nothing.
    const synthetic = `
      /** A comment mentioning import { db } from "@/db", which must NOT count. */
      import type { WorkflowStatus } from "@/db/schema/workflows"
      import { db } from "@/db"
    `
    const specifiers = importSpecifiers(synthetic)

    expect(specifiers).toHaveLength(2)
    expect(specifiers).toContainEqual({ specifier: "@/db/schema/workflows", typeOnly: true })
    expect(specifiers).toContainEqual({ specifier: "@/db", typeOnly: false })
  })

  it("does not restate the WorkflowStatus union as a new local type", () => {
    // The union is IMPORTED, never re-declared: a second copy is a second thing to keep in sync
    // with the schema, and the runs list would then filter on a status the engine never writes.
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1")

    expect(withoutComments).not.toMatch(/type\s+\w*Status\w*\s*=\s*["']pending["']/)
  })
})
