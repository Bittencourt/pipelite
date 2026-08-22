/**
 * THE LIST SIDE OF THE ACTIVITIES FILTER CONTRACT, GATED OVER PARSED SOURCE.
 *
 * WHY THIS IS A SOURCE GATE AND NOT A BEHAVIOUR TEST. `getActivities` is a `"use server"` action
 * that opens with `await auth()` and then hands a `where` tree to `db.query.activities.findMany`.
 * There is no jsdom in the base vitest project and `@/db` THROWS AT MODULE EVALUATION when
 * `DATABASE_URL` is unset (see the header of `vitest.db.config.ts`), so importing the module here is
 * not an option. Mocking Drizzle's builder is worse than not testing at all: a mock records that
 * `and(...)` was called with some objects and proves nothing about whether the resulting SQL narrows
 * 79,022 rows. What CAN be proved cheaply and durably is that the predicates are IN the query
 * builder rather than in a post-fetch `.filter()` — which is the entire defect this plan closes.
 *
 * The live counts are recorded in `40-13-SUMMARY.md` from read-only `psql`, because the `test:db`
 * project provisions an isolated database (`scripts/dedup-db-test-setup.sh` drops and recreates it)
 * and this plan executed in a three-agent parallel wave sharing one Postgres. A DDL-issuing harness
 * was not safe to run there. The parsed gate below was NOT weakened to compensate.
 *
 * EVERY ASSERTION IS SCOPED TO AN EXTRACTED REGION, never to a file-wide token grep:
 *   - `getActivities`'s own body, sliced between its declaration and the next top-level `export`.
 *     `getActivityById` sits directly below it and searches the same table, so an unscoped grep for
 *     `isNull(activities.deletedAt)` would count that function's copy and the "exactly one" gate
 *     would be satisfied by the wrong function.
 *   - the `drizzle-orm` import's specifier list, SPLIT ON COMMAS into an allow-list. `lt` is a
 *     substring of `result`, `filteredResults` and `default`; `and` is a substring of `and` in a
 *     dozen identifiers. Plan 40-09's first attempt broke on exactly this class (`Check` inside
 *     `onCheckedChange`), so membership is tested against parsed specifiers and never with
 *     `source.includes("lt")`.
 */
import { describe, it, expect } from "vitest"
import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const ACTIONS = "src/app/activities/actions.ts"
const PAGE = "src/app/activities/page.tsx"

/**
 * The text of one top-level `export async function ${name}` declaration, bounded by the next
 * top-level `export` in the file.
 *
 * NOT A FOURTH BRACE MATCHER — deliberately. `source-scan.ts` owns the paren matcher
 * (`callArguments`) and the three JSX/tag matchers, and none of them extracts a function body; the
 * shared-module rule is "do not write a second matcher for a job one already does", not "never slice
 * a source file". This slice needs no depth counting at all: every declaration in `actions.ts` starts
 * at column 0 with `export`, so the next `\nexport ` IS the end of this one. The boundary is then
 * asserted rather than assumed, in the first test below.
 */
function topLevelDeclaration(source: string, name: string, file: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  if (start === -1) throw new Error(`${file}: no top-level 'export async function ${name}('`)

  const nextExport = source.indexOf("\nexport ", start + 1)
  const end = nextExport === -1 ? source.length : nextExport

  return source.slice(start, end)
}

/** Every specifier in `import { … } from "<module>"`, trimmed, aliases dropped. */
function namedImports(source: string, module: string, file: string): string[] {
  const from = source.indexOf(`from "${module}"`)
  if (from === -1) throw new Error(`${file}: no import from "${module}"`)

  const open = source.lastIndexOf("{", from)
  const close = source.indexOf("}", open)
  if (open === -1 || close === -1 || close > from) {
    throw new Error(`${file}: the import from "${module}" has no braced specifier list`)
  }

  return source
    .slice(open + 1, close)
    .split(",")
    .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
    .filter((s) => s !== "")
}

function occurrences(haystack: string, needle: string): number {
  let count = 0
  let from = 0

  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) return count
    count += 1
    from = at + needle.length
  }
}

const actionsSource = readStrippedSource(ACTIONS)
const pageSource = readStrippedSource(PAGE)
const getActivitiesBody = topLevelDeclaration(actionsSource, "getActivities", ACTIONS)

describe("the extraction is actually scoped to getActivities", () => {
  it("stops before the next top-level declaration", () => {
    expect(
      getActivitiesBody.includes("getActivityById"),
      "the slice ran past getActivities into the function below it, so every count below is " +
        "measuring two functions at once and the 'exactly one' gates are meaningless"
    ).toBe(false)
    expect(getActivitiesBody.startsWith("export async function getActivities(")).toBe(true)
    expect(getActivitiesBody).toContain("db.query.activities.findMany")
  })
})

describe("status is a SQL predicate", () => {
  it("guards on filters?.status and discriminates all three values", () => {
    expect(
      getActivitiesBody,
      "no filters?.status guard: `?status=overdue` reaches a chip row and nothing else, so a saved " +
        "view carrying it restores a control that narrows nothing"
    ).toContain("filters?.status")

    // "completed" -> completedAt IS NOT NULL, "pending" -> IS NULL,
    // "overdue" -> IS NULL AND dueDate < now. Mirrors `fetchActivities` in
    // `src/lib/export/formatters.ts` so the list and the export mean the same thing.
    expect(getActivitiesBody).toContain("isNotNull(activities.completedAt)")
    expect(getActivitiesBody).toContain("isNull(activities.completedAt)")
    expect(getActivitiesBody).toContain("lt(activities.dueDate")
    expect(getActivitiesBody).toContain('"overdue"')
    expect(getActivitiesBody).toContain('"pending"')
    expect(getActivitiesBody).toContain('"completed"')
  })

  it("imports isNotNull and lt from drizzle-orm as parsed specifiers", () => {
    const specifiers = namedImports(actionsSource, "drizzle-orm", ACTIONS)

    // An ALLOW-LIST over split specifiers, never `source.includes("lt")` — `lt` is a substring of
    // `result`, `filteredResults` and `default`, all of which appear in this file.
    expect(specifiers).toContain("isNotNull")
    expect(specifiers).toContain("lt")
    expect(specifiers).toContain("isNull")
  })
})

describe("the due-date range is a SQL predicate", () => {
  it("guards on filters?.dateFrom against dueDate", () => {
    expect(
      getActivitiesBody,
      "no filters?.dateFrom guard: the date-range control writes the URL, renders two removable " +
        "chips and never reaches the WHERE clause — measured 7,933 matching rows displayed as 0"
    ).toContain("filters?.dateFrom")
    expect(getActivitiesBody).toContain("gte(activities.dueDate")
    expect(getActivitiesBody).toContain("startOfDayInclusive(filters.dateFrom)")
  })

  it("guards on filters?.dateTo against dueDate, with an EXCLUSIVE upper bound", () => {
    /*
     * THIS ASSERTION WAS CHANGED, AND THE CHANGE IS THE POINT — it previously required
     * `lte(activities.dueDate`, which is the shape of review finding CR-01. `new Date("2025-03-31")`
     * is midnight UTC, so an inclusive upper bound at that value excludes every activity due later
     * on the last day of the range: every activity the app itself creates, because the dialog
     * composes `${dueDate}T${dueTime || "09:00"}`. The gate was pinning the defect in place.
     *
     * It is REPLACED BY A STRICTLY STRONGER ONE, not relaxed: the old form asserted only that SOME
     * upper bound existed; this asserts which one, names the shared helper, and forbids the
     * inclusive spelling outright. The behavioural proof — the rendered SQL and its bound instants —
     * lives in `get-activities-where.test.ts`, which fails RED against the old expression.
     */
    expect(
      getActivitiesBody,
      "no filters?.dateTo guard: the upper bound of the date range narrows nothing"
    ).toContain("filters?.dateTo")
    expect(getActivitiesBody).toContain("lt(activities.dueDate")
    expect(
      getActivitiesBody,
      "the upper bound must come from `endOfDayExclusive`, the module `fetchActivities` and " +
        "`fetchDeals` also import (CR-01). A locally spelled `+ 1 day` here is the second copy " +
        "that drifts."
    ).toContain("endOfDayExclusive(filters.dateTo)")
    expect(
      getActivitiesBody,
      "`lte(activities.dueDate` is back: an inclusive bound at `new Date(dateTo)` is midnight, so " +
        "`dateTo` means the first instant of the day rather than the day (CR-01)."
    ).not.toContain("lte(activities.dueDate")
  })
})

describe("nothing is filtered after the fetch", () => {
  it("applies no .filter( to the query result", () => {
    expect(
      occurrences(getActivitiesBody, ".filter("),
      "a post-fetch JS filter combined with `limit` returns FEWER ROWS THAN EXIST: the limit is " +
        "applied by Postgres to the unnarrowed set, then JavaScript discards from the page it got " +
        "back. Measured on live data: `?status=overdue` matched 4,151 rows and the list rendered 0, " +
        "because the 51 rows Postgres returned (ordered by dueDate asc) were all completed."
    ).toBe(0)
  })

  it("pushes isNull(activities.deletedAt) exactly once", () => {
    expect(
      occurrences(getActivitiesBody, "isNull(activities.deletedAt)"),
      "the no-op duplicate is back: `if (filters?.completed === true) conditions.push(" +
        "isNull(activities.deletedAt))` re-asserted the soft-delete predicate the conditions array " +
        "already opens with, and its own comment admitted it needed 'a different approach'"
    ).toBe(1)
    expect(occurrences(getActivitiesBody, "conditions.push(isNull(activities.deletedAt))")).toBe(0)
  })
})

describe("page.tsx threads the three params into the query", () => {
  it("assigns status, dateFrom and dateTo onto the filters object", () => {
    expect(pageSource).toContain("filters.status = params.status")
    expect(pageSource).toContain("filters.dateFrom = params.dateFrom")
    expect(pageSource).toContain("filters.dateTo = params.dateTo")
  })

  it("no longer narrows the fetched page in JavaScript", () => {
    expect(
      occurrences(pageSource, "allActivities.filter("),
      "the page re-filtered the ALREADY-TRIMMED page after `hasMore` was computed, so the Load " +
        "More button and the row count disagreed with each other and with the database"
    ).toBe(0)
  })
})
