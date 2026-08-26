import { NextRequest } from "next/server"

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * WR-09 — THE CEILING ON `?offset=`, AND WHY THERE HAS TO BE ONE.
 *
 * `offset` was clamped below at zero and NOT AT ALL above, and there was no
 * `Number.isSafeInteger` check. drizzle renders `offset` as a bound placeholder and
 * postgres.js serializes a JS number as `'' + x`, so:
 *
 *   `?offset=99999999999999999999`   (20 digits)  ->  parseInt yields 1e20
 *                                                ->  the driver sends "100000000000000000000"
 *                                                ->  22003 value out of range for type bigint
 *   `?offset=1000000000000000000000` (22 digits)  ->  the driver sends "1e+21"
 *                                                ->  22P02 invalid input syntax for type bigint
 *
 * No `/api/v1` list GET is wrapped and `withApiAuth` has no `try`/`catch`, so both were framework
 * 500s with no problem document — the retry-forever class `db-errors.ts:22-24` exists to describe.
 * Measured against real PostgreSQL on both list routes; the transcripts are in the WR-09 describes
 * of `activities-scope.db.test.ts` and `stages-scope.db.test.ts`.
 *
 * THE BOUND IS IN THE PARSER, NOT IN A `try`/`catch` AT EACH CALL SITE. That follows WR-01's stated
 * preference — make the bad state unrepresentable rather than catch it — and it is the only form
 * that closes the defect on EVERY list route rather than on the two this phase touched: this
 * function is the single place every one of them derives its window from.
 *
 * AN OVER-LARGE OFFSET CLAMPS, IT DOES NOT FALL BACK TO ZERO. Falling back to 0 (as the review
 * sketched) would answer `?offset=1e20` with PAGE ONE — silently the opposite of what the caller
 * asked for, and indistinguishable to them from a working request. Clamping answers with the empty
 * page the request implies, and `meta.offset` then reports the window that was actually used. Only
 * an UNPARSEABLE offset falls back to 0, which is the pre-existing behaviour for `?offset=abc`.
 *
 * 1,000,000 is chosen to be far above any page this API's `meta.total` can describe (10,000 pages
 * at `MAX_PAGE_SIZE`) and far below `int4`'s and `bigint`'s limits, so no clamped value can reach
 * either failure mode. `pagination.test.ts` asserts that relationship against bigint's documented
 * maximum rather than restating the constant.
 */
export const MAX_OFFSET = 1_000_000

/**
 * Parse pagination parameters from request query string
 *
 * - `offset`: integer clamped to [0, MAX_OFFSET]; NaN falls back to 0
 * - `limit`: integer clamped to [1, MAX_PAGE_SIZE]; NaN falls back to DEFAULT_PAGE_SIZE
 *
 * Guarantees SAFE finite integers, so invalid input (`?limit=abc`, `?limit=10000000`,
 * `?offset=99999999999999999999`) can never reach Drizzle `.limit()/.offset()` as NaN, dump entire
 * tables, or arrive at PostgreSQL as a value its `bigint` OFFSET cannot parse.
 *
 * @param request - The incoming Next.js request
 * @returns Pagination params with offset and limit
 */
export function parsePagination(
  request: NextRequest
): { offset: number; limit: number } {
  const { searchParams } = request.nextUrl

  const rawOffset = parseInt(searchParams.get("offset") ?? "", 10)
  const rawLimit = parseInt(searchParams.get("limit") ?? "", 10)

  const offset = Number.isNaN(rawOffset)
    ? 0
    : Math.min(MAX_OFFSET, Math.max(0, rawOffset))
  const limit = Number.isNaN(rawLimit)
    ? DEFAULT_PAGE_SIZE
    : Math.min(MAX_PAGE_SIZE, Math.max(1, rawLimit))

  return { offset, limit }
}
