/**
 * THE BOUNDARY RULE ITSELF, exercised directly rather than through a query builder.
 *
 * `endOfDayExclusive` is the one place review finding CR-01 can be got wrong again, and it is pure —
 * a string in, a `Date` out — so it is tested by calling it. The two call-site suites
 * (`src/app/activities/__tests__/get-activities-where.test.ts` and
 * `src/lib/export/__tests__/view-filters.test.ts`) prove the three sites USE it; this file proves it
 * is the right answer to use.
 */
import { describe, it, expect } from "vitest"

import { endOfDayExclusive, startOfDayInclusive } from "../date-range"

const iso = (d: Date) => d.toISOString()

describe("endOfDayExclusive", () => {
  it("is the NEXT day's midnight, in UTC", () => {
    expect(iso(endOfDayExclusive("2025-03-31"))).toBe("2025-04-01T00:00:00.000Z")
  })

  it("rolls over the month, the year, and a leap day", () => {
    expect(iso(endOfDayExclusive("2025-02-28"))).toBe("2025-03-01T00:00:00.000Z")
    // 2024 is a leap year: the 28th is followed by the 29th, not by March.
    expect(iso(endOfDayExclusive("2024-02-28"))).toBe("2024-02-29T00:00:00.000Z")
    expect(iso(endOfDayExclusive("2024-02-29"))).toBe("2024-03-01T00:00:00.000Z")
    expect(iso(endOfDayExclusive("2025-12-31"))).toBe("2026-01-01T00:00:00.000Z")
  })

  it("admits every instant of the named day, including the last one Postgres can store", () => {
    // THE DEFECT, AS A PROPERTY. The old bound was `<= new Date("2025-03-31")`, i.e. midnight, so
    // 00:00:00.001 onward was excluded. Each of these is a real timestamp a user can produce:
    // 09:00 is the create dialog's default when no time is typed.
    for (const instant of [
      "2025-03-31T00:00:00.000Z",
      "2025-03-31T09:00:00.000Z",
      "2025-03-31T23:59:59.000Z",
      "2025-03-31T23:59:59.999Z",
    ]) {
      expect(
        Date.parse(instant) < endOfDayExclusive("2025-03-31").getTime(),
        `${instant} falls on 2025-03-31 and must be inside a range ending on that day`
      ).toBe(true)
    }
  })

  it("admits a sub-millisecond instant that `setHours(23, 59, 59, 999)` would have excluded", () => {
    // WHY THE FIX IS A HALF-OPEN INTERVAL AND NOT THE DELETED `setHours(23,59,59,999)`. Postgres
    // `timestamp` keeps MICROseconds; `Date` does not. The exclusive bound is correct at any
    // precision, which the 23:59:59.999 form is not — and that is the reason to prefer it, recorded
    // here rather than in a commit message nobody will read again.
    const lastMillisecond = Date.parse("2025-03-31T23:59:59.999Z")
    const halfOpen = endOfDayExclusive("2025-03-31").getTime()

    expect(halfOpen).toBeGreaterThan(lastMillisecond)
    expect(halfOpen - lastMillisecond).toBe(1)
  })

  it("excludes the first instant of the following day", () => {
    // The other side of the pair: exclusive means exclusive. A bound of `lte(nextMidnight)` would
    // pull the next day's midnight rows into the range, which on this deployment's imported data is
    // an entire extra day of activities.
    expect(Date.parse("2025-04-01T00:00:00.000Z") < endOfDayExclusive("2025-03-31").getTime()).toBe(
      false
    )
  })

  it("does not mutate anything the caller holds — it returns a fresh Date", () => {
    // `setUTCDate` mutates in place. If the helper ever stops copying, the caller's own `dateFrom`
    // could be advanced a day by building the `dateTo`.
    const a = endOfDayExclusive("2025-03-31")
    const b = endOfDayExclusive("2025-03-31")

    a.setUTCDate(a.getUTCDate() + 10)

    expect(iso(b)).toBe("2025-04-01T00:00:00.000Z")
  })
})

describe("startOfDayInclusive", () => {
  it("is that day's own midnight, in UTC — the lower bound did not move", () => {
    expect(iso(startOfDayInclusive("2025-01-01"))).toBe("2025-01-01T00:00:00.000Z")
    expect(iso(startOfDayInclusive("2025-03-31"))).toBe("2025-03-31T00:00:00.000Z")
  })

  it("pairs with endOfDayExclusive to make a range exactly 24 hours per day", () => {
    const from = startOfDayInclusive("2025-03-31").getTime()
    const to = endOfDayExclusive("2025-03-31").getTime()

    expect(to - from).toBe(24 * 60 * 60 * 1000)

    const threeDays =
      endOfDayExclusive("2025-04-02").getTime() - startOfDayInclusive("2025-03-31").getTime()

    expect(threeDays).toBe(3 * 24 * 60 * 60 * 1000)
  })
})
