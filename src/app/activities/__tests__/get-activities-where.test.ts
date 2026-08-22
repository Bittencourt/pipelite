/**
 * THE LIST SIDE OF THE ACTIVITIES FILTER CONTRACT, AS RENDERED SQL — the behavioural half.
 *
 * WHY THIS FILE EXISTS BESIDE `get-activities-filters.test.ts` RATHER THAN INSIDE IT. That file is a
 * SOURCE gate: it proves the predicates are in the query builder rather than in a post-fetch
 * `.filter()`, which is the defect plan 40-13 closed. Its header says importing the module "is not
 * an option" because `@/db` throws at module evaluation without `DATABASE_URL`, and that a mock of
 * drizzle's builder "proves nothing about whether the resulting SQL narrows 79,022 rows".
 *
 * BOTH HALVES OF THAT ARE TRUE OF THE THING IT WAS REJECTING, AND NEITHER IS TRUE HERE. This file
 * does not mock drizzle. It mocks the CLIENT — `@/db` — exactly as
 * `src/lib/export/__tests__/view-filters.test.ts` already does for the export half of the same
 * contract, captures the `where` tree the real `and`/`lt`/`gte` operators built, and renders it to
 * statement text plus bound parameters with a real `PgDialect`. What comes out is the literal SQL
 * Postgres would be handed. A source gate cannot tell `lte(dueDate, midnight)` from
 * `lt(dueDate, nextMidnight)` in any way that matters; rendered SQL and its bound values can, and
 * that distinction IS review finding CR-01.
 *
 * WHAT A MOCK STILL CANNOT PROVE, stated so this is not mistaken for full coverage: that Postgres
 * accepts the statement, or which rows come back. Those belong to the live suites. What it proves is
 * the property the review measured — the BOUND, and which instants fall inside it.
 *
 * THE REVIEW FINDING GATED HERE:
 *
 *   CR-01 — `dateTo` excluded the entire end day. `new Date("2025-03-31")` is midnight UTC, so
 *           `lte(dueDate, that)` dropped every activity due later that day. The create dialog
 *           composes `${dueDate}T${dueTime || "09:00"}`, so that is EVERY app-created activity on the
 *           range's last day. Invisible on the live data (all 79,022 rows are imported at exactly
 *           00:00:00) and invisible in the toast, because the row count comes from the same query.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

/**
 * `activities/actions.ts` imports the drizzle client at module scope, and so do three of its own
 * imports. One mock of `@/db` covers all of them, because they all import the same singleton.
 */
const dbSpies = vi.hoisted(() => ({
  activities: { findMany: vi.fn(async () => [] as unknown[]) },
}))

vi.mock("@/db", () => ({ db: { query: dbSpies } }))

/**
 * A session, because `getActivities` refuses an unauthenticated caller before it builds anything.
 * The role is irrelevant on this action — there is no admin branch in it — and is set to `member`
 * so nothing here can be passing for the wrong reason.
 */
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "viewer-1", role: "member" } })),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

// Imported AFTER the mocks for readability only — vitest hoists them regardless.
import { getActivities } from "../actions"

const dialect = new PgDialect()

/** The rendered `where` of the single `findMany` one `getActivities` call performs. */
async function whereFor(
  filters: Parameters<typeof getActivities>[0]
): Promise<{ sql: string; params: unknown[] }> {
  const result = await getActivities(filters)

  // ANTI-VACUITY. `getActivities` catches everything and answers `{ success: false }`, so a test
  // that only inspected the recorded call would pass just as happily against a thrown error.
  expect(result.success, `getActivities refused: ${JSON.stringify(result)}`).toBe(true)

  const calls = dbSpies.activities.findMany.mock.calls as unknown as [{ where?: unknown }][]

  expect(calls.length).toBe(1)

  const q = dialect.sqlToQuery(calls[0][0].where as SQL)

  return { sql: q.sql, params: q.params }
}

/** Drizzle binds a `timestamp({ mode: "date" })` value as an ISO string, not as a `Date`. */
function boundInstant(params: unknown[], at: number): number {
  const raw = params[at]

  expect(typeof raw, `bound parameter ${at} is ${typeof raw}, expected an ISO string`).toBe("string")

  const ms = Date.parse(raw as string)

  expect(Number.isNaN(ms), `bound parameter ${at} (${String(raw)}) is not a parseable instant`).toBe(
    false
  )

  return ms
}

beforeEach(() => {
  dbSpies.activities.findMany.mockClear()
})

describe("CR-01: the dateTo bound covers the WHOLE of the end day", () => {
  it("renders a half-open upper bound at the NEXT midnight, not an inclusive one at this one", async () => {
    const { sql, params } = await whereFor({ dateTo: "2025-03-31" })

    expect(
      sql,
      `the upper bound is still <=. \`new Date("2025-03-31")\` is 2025-03-31T00:00:00.000Z, so ` +
        `\`lte(dueDate, that)\` excludes every activity due later that same day — which is every ` +
        `activity the app itself creates, because the dialog composes \`\${dueDate}T\${dueTime || ` +
        `"09:00"}\`. The range must be half-open: \`dueDate < 2025-04-01T00:00:00.000Z\`.`
    ).toContain(`"activities"."due_date" <`)
    expect(sql).not.toContain(`"activities"."due_date" <=`)

    expect(params).toHaveLength(1)
    expect(new Date(boundInstant(params, 0)).toISOString()).toBe("2025-04-01T00:00:00.000Z")
  })

  it("includes an activity due at 09:00 on the last day — the case the app itself creates", async () => {
    const { params } = await whereFor({ dateTo: "2025-03-31" })

    // The default the create dialog uses when no time is typed. THIS is the row CR-01 dropped.
    const nineAmOnTheLastDay = Date.parse("2025-03-31T09:00:00.000Z")

    expect(
      boundInstant(params, 0),
      `an activity due at 09:00 on 2025-03-31 falls OUTSIDE a range whose upper bound is ` +
        `${String(params[0])}. dateTo is the last day the user asked for, not the first instant of it.`
    ).toBeGreaterThan(nineAmOnTheLastDay)
  })

  it("excludes the first instant of the day AFTER the range — the bound is exclusive, not widened", async () => {
    const { sql, params } = await whereFor({ dateTo: "2025-03-31" })

    // The other half of the pair. A fix that reached for `lte(dueDate, nextMidnight)` would pass
    // every assertion above and quietly pull in the following day's midnight rows.
    expect(boundInstant(params, 0)).toBe(Date.parse("2025-04-01T00:00:00.000Z"))
    expect(sql).not.toContain(`due_date" <=`)
  })

  it("rolls over the month, the year and a leap day rather than doing arithmetic on the string", async () => {
    for (const [dateTo, expected] of [
      ["2025-02-28", "2025-03-01T00:00:00.000Z"],
      ["2024-02-28", "2024-02-29T00:00:00.000Z"],
      ["2025-12-31", "2026-01-01T00:00:00.000Z"],
    ] as const) {
      dbSpies.activities.findMany.mockClear()

      const { params } = await whereFor({ dateTo })

      expect(
        new Date(boundInstant(params, 0)).toISOString(),
        `dateTo=${dateTo} must bound at ${expected}`
      ).toBe(expected)
    }
  })

  it("leaves dateFrom INCLUSIVE at this day's midnight — only the upper bound moved", async () => {
    const { sql, params } = await whereFor({ dateFrom: "2025-01-01" })

    expect(sql).toContain(`"activities"."due_date" >=`)
    expect(params).toHaveLength(1)
    expect(new Date(boundInstant(params, 0)).toISOString()).toBe("2025-01-01T00:00:00.000Z")
  })

  it("a one-day range is 24 hours wide and contains that day's working hours", async () => {
    // Anti-vacuity for the pair: two bounds that were both moved, or both left, would still satisfy
    // several assertions above individually. `dateFrom == dateTo` is the range the date picker
    // produces for "just this day", and it must not be empty.
    const { sql, params } = await whereFor({ dateFrom: "2025-03-31", dateTo: "2025-03-31" })

    expect(sql).toContain(`"activities"."due_date" >=`)
    expect(sql).toContain(`"activities"."due_date" <`)
    expect(params).toHaveLength(2)

    const from = boundInstant(params, 0)
    const to = boundInstant(params, 1)

    expect(to - from).toBe(24 * 60 * 60 * 1000)

    const nineAm = Date.parse("2025-03-31T09:00:00.000Z")

    expect(from).toBeLessThanOrEqual(nineAm)
    expect(to).toBeGreaterThan(nineAm)
  })

  it("adds no date predicate when neither key is present", async () => {
    // The floor under every assertion above: if the range were never applied at all, "the bound is
    // correct" would be a statement about nothing.
    const { sql, params } = await whereFor({})

    expect(sql).not.toContain(`"activities"."due_date"`)
    expect(params).toHaveLength(0)
  })
})
