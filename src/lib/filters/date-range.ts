/**
 * THE DATE-RANGE BOUNDARY RULE, WRITTEN ONCE.
 *
 * WHY THIS MODULE EXISTS AT ALL. A `<input type="date">` produces a DAY (`"2025-03-31"`), and every
 * column these ranges are applied to is a TIMESTAMP. Those two are not the same kind of thing, and
 * the conversion between them is the entire content of this file. Getting it wrong is silent: the
 * query still runs, still returns rows, and returns FEWER of them than the user asked for, with
 * nothing on screen to say so.
 *
 * THE DEFECT THIS CLOSES (CR-01, phase 40 review). Plan 40-13 moved the activities date range out
 * of JavaScript and into SQL, and in doing so dropped an explicit end-of-day adjustment:
 *
 *     const toDate = new Date(params.dateTo)
 *     toDate.setHours(23, 59, 59, 999)          // <- deleted
 *     allActivities.filter((a) => new Date(a.dueDate) <= toDate)
 *
 * What replaced it was `lte(dueDate, new Date(dateTo))`. `new Date("2025-03-31")` is
 * `2025-03-31T00:00:00.000Z` — MIDNIGHT — so `dateTo=2025-03-31` excluded every activity due later
 * that same day. The activity dialog composes its timestamp as `${dueDate}T${dueTime || "09:00"}`,
 * so every activity created through the app is at 09:00 or later and every one of them on the last
 * day of the range was dropped, from the list AND from the CSV, with the success toast's row count
 * coming from the same query. The live dataset masked it completely: all 79,022 activities and all
 * 324 deals with an `expected_close_date` were imported at exactly `00:00:00`.
 *
 * WHY AN EXCLUSIVE UPPER BOUND RATHER THAN `setHours(23, 59, 59, 999)`. The `23:59:59.999` form is
 * wrong for any timestamp with sub-millisecond precision — Postgres `timestamp` stores microseconds
 * — so a row at `23:59:59.9995` would be excluded from a range that claims to include its whole
 * day. `dueDate < nextMidnight` has no such edge: it is the half-open interval `[from, to+1day)`,
 * which is the shape every date range should have and the one that needs no arithmetic about how
 * many digits of a second the column keeps.
 *
 * WHAT THIS ASSUMES ABOUT TIMEZONES, STATED RATHER THAN LEFT TO BE DISCOVERED. Both helpers work in
 * **UTC** and nothing else: `new Date("2025-03-31")` is parsed by the ECMAScript date-only form as
 * UTC midnight, and `setUTCDate` advances it in UTC. The container runs `TZ=UTC` (verified), so UTC
 * midnight and the operator's local midnight are the same instant and the boundaries are exactly the
 * days the user picked. Under a NON-UTC deployment both boundaries would shift by the offset — the
 * range would still be exactly 24h per day and still half-open, but "the 31st" would mean the 31st
 * in UTC rather than locally. Fixing that needs a timezone the server does not currently know; it is
 * NOT fixed by reverting to `setHours`, which merely moves the same shift onto the process's local
 * zone. Do not "improve" these to `setHours`/`setDate` without answering that question first.
 *
 * BOTH SITES THAT APPLY A DATE RANGE IMPORT FROM HERE — `getActivities`
 * (`src/app/activities/actions.ts`) and `fetchActivities` / `fetchDeals`
 * (`src/lib/export/formatters.ts`). `formatters.ts` claims each of its predicates "MIRRORS the list
 * page it must match"; two copies of a boundary rule is precisely how they stop mirroring, and CR-01
 * is what that looks like when it happens.
 */

/**
 * The INCLUSIVE lower bound for a `YYYY-MM-DD` day: that day's midnight, UTC.
 *
 * Use with `gte`. This is the value `new Date(isoDate)` already produced, named so the two ends of a
 * range read as a matched pair rather than one bare constructor call and one helper — an asymmetric
 * pair is how a later edit "tidies" the helper away and reintroduces CR-01.
 */
export function startOfDayInclusive(isoDate: string): Date {
  return new Date(isoDate)
}

/**
 * The EXCLUSIVE upper bound for a `YYYY-MM-DD` day: the NEXT day's midnight, UTC.
 *
 * Use with `lt`, never with `lte` — `lte` against this value would silently include the whole of the
 * following day's first instant.
 */
export function endOfDayExclusive(isoDate: string): Date {
  const bound = new Date(isoDate)

  // `setUTCDate` handles month and year rollover and leap days itself: 2025-02-28 -> 2025-03-01,
  // 2024-02-28 -> 2024-02-29, 2025-12-31 -> 2026-01-01. Adding 86_400_000ms would too, in UTC — but
  // this spelling says what it means and stays correct if the value ever gains a local component.
  bound.setUTCDate(bound.getUTCDate() + 1)

  return bound
}
