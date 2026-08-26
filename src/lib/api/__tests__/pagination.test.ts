/**
 * =============================================================================
 * pagination.test.ts — WR-09: `?offset=` had no ceiling, and one query parameter
 * was an unhandled framework 500 on EVERY `/api/v1` list route
 * =============================================================================
 *
 * THE DEFECT. `parsePagination` returned `Math.max(0, parseInt(raw, 10))` with no upper bound and
 * no `Number.isSafeInteger` check. drizzle renders `sql` offset ${offset}`` as a bound placeholder
 * and postgres.js serializes a JS number as `'' + x`, so:
 *
 *   `?offset=99999999999999999999`  (20 digits)  ->  `parseInt` yields 1e20
 *                                                ->  `'' + 1e20` is "100000000000000000000"
 *                                                ->  PostgreSQL `OFFSET` is bigint (max
 *                                                    9223372036854775807)
 *                                                ->  22003 value out of range for type bigint
 *
 *   `?offset=1000000000000000000000` (22 digits) ->  `'' + 1e21` is "1e+21"
 *                                                ->  22P02 invalid input syntax for type bigint
 *
 * Neither list GET is wrapped and `withApiAuth` has no `try`/`catch`, so the rejection propagated
 * out of the handler and Next.js rendered a framework 500 with no problem document — telling the
 * caller to retry a request that will fail identically forever, which is the exact sentence
 * `src/lib/api/db-errors.ts:22-24` gives as the reason this class matters.
 *
 * THE FIX IS IN THE PARSER, not a `try`/`catch` at each call site, and that follows WR-01's stated
 * preference: make the bad state unrepresentable rather than catch it. `parsePagination` is the ONE
 * place every `/api/v1` list route derives its window from, so a ceiling here closes the defect on
 * all of them at once — not only on the two routes this phase touched.
 *
 * A NOTE ON THE CHOSEN BEHAVIOUR, because it differs from the review's sketch. The review proposed
 * falling back to 0 for anything that is not a safe integer. That would answer `?offset=1e20` with
 * PAGE ONE, i.e. silently give the caller the opposite of what they asked for. This clamps to
 * `MAX_OFFSET` instead, so an over-large offset answers with the empty page it asked for and
 * `meta.offset` reports the window that was actually used. Only an UNPARSEABLE offset falls back to
 * 0, which is the pre-existing documented behaviour for `?offset=abc`.
 *
 * WHAT THIS FILE PROVES AND WHAT IT DOES NOT. It proves the parser: the boundary, the clamp, the
 * two digit-lengths from the review, and that the ordinary cases are untouched. The BEHAVIOURAL
 * proof — the same query parameter answering 200 against real PostgreSQL where it used to reject —
 * lives in `activities-scope.db.test.ts` and `stages-scope.db.test.ts`, because a unit test of a
 * pure function cannot show that a statement no longer fails.
 * =============================================================================
 */
import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_PAGE_SIZE,
  MAX_OFFSET,
  MAX_PAGE_SIZE,
  parsePagination,
} from "@/lib/api/pagination"

/** A request carrying nothing but the query string, which is all `parsePagination` reads. */
function requestWith(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/v1/activities${query}`)
}

function parse(query: string): { offset: number; limit: number } {
  return parsePagination(requestWith(query))
}

describe("WR-09 — parsePagination bounds `offset` from above", () => {
  it("clamps the review's 20-digit offset, the one that produced 22003 value out of range for type bigint", () => {
    const { offset } = parse("?offset=99999999999999999999")

    // THE ASSERTION THAT WAS RED: pre-fix this returned 1e20 verbatim.
    expect(offset).toBe(MAX_OFFSET)
    expect(Number.isSafeInteger(offset)).toBe(true)
  })

  it("clamps the review's 22-digit offset, the one that serialized as the string \"1e+21\" and produced 22P02", () => {
    const { offset } = parse("?offset=1000000000000000000000")

    expect(offset).toBe(MAX_OFFSET)
    expect(Number.isSafeInteger(offset)).toBe(true)
  })

  it("the ceiling is far below what PostgreSQL's bigint OFFSET can hold, so the clamped value is always representable", () => {
    // The point of the constant is that no clamped offset can reach either failure mode. Asserted
    // against bigint's documented maximum rather than against a restatement of MAX_OFFSET.
    expect(MAX_OFFSET).toBeLessThan(9_223_372_036_854_775_807)
    expect(Number.isSafeInteger(MAX_OFFSET)).toBe(true)
    // And it is not so small that it breaks real pagination: 1,000,000 rows at the maximum page
    // size is 10,000 pages deep, well past anything this API's `meta.total` describes.
    expect(MAX_OFFSET).toBeGreaterThanOrEqual(1_000_000)
  })

  it("BOUNDARY: exactly MAX_OFFSET passes through unchanged, MAX_OFFSET + 1 clamps", () => {
    // A clamp asserted only well past its limit is satisfied by a parser that returns MAX_OFFSET
    // for everything above zero. These two cells are what pin the edge.
    expect(parse(`?offset=${MAX_OFFSET}`).offset).toBe(MAX_OFFSET)
    expect(parse(`?offset=${MAX_OFFSET + 1}`).offset).toBe(MAX_OFFSET)
  })

  it("THE ANTI-VACUITY ANCHOR: ordinary offsets are returned verbatim", () => {
    // Without this, every assertion above is satisfied by `return { offset: MAX_OFFSET }`, which
    // would break every page of every list endpoint.
    expect(parse("?offset=0").offset).toBe(0)
    expect(parse("?offset=1").offset).toBe(1)
    expect(parse("?offset=50").offset).toBe(50)
    expect(parse("?offset=999999").offset).toBe(999_999)
  })

  it("the pre-existing lower-bound and NaN behaviour is unchanged", () => {
    // These held before WR-09 and are re-asserted so the ceiling cannot have been added by
    // rewriting the parser's other guarantees.
    expect(parse("?offset=-5").offset).toBe(0)
    expect(parse("?offset=abc").offset).toBe(0)
    expect(parse("").offset).toBe(0)
    // `parseInt` stops at the first non-digit, which is why "1e20" is 1 and not 1e20 — the 20-digit
    // spelling above is the one that actually reaches the driver as a huge number.
    expect(parse("?offset=1e20").offset).toBe(1)
  })
})

describe("WR-09 — `limit` is untouched by the offset ceiling", () => {
  it("still clamps to [1, MAX_PAGE_SIZE] and still defaults on NaN", () => {
    expect(parse("?limit=10000000").limit).toBe(MAX_PAGE_SIZE)
    expect(parse("?limit=0").limit).toBe(1)
    expect(parse("?limit=-3").limit).toBe(1)
    expect(parse("?limit=abc").limit).toBe(DEFAULT_PAGE_SIZE)
    expect(parse("").limit).toBe(DEFAULT_PAGE_SIZE)
    expect(parse("?limit=25").limit).toBe(25)
  })

  it("an over-large limit AND an over-large offset are both bounded in the same call", () => {
    const { offset, limit } = parse("?offset=99999999999999999999&limit=99999999999999999999")

    expect(offset).toBe(MAX_OFFSET)
    expect(limit).toBe(MAX_PAGE_SIZE)
  })
})
