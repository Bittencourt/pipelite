import { NextRequest } from "next/server"

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * Parse pagination parameters from request query string
 *
 * - `offset`: non-negative integer; NaN/negative values fall back to 0
 * - `limit`: integer clamped to [1, MAX_PAGE_SIZE]; NaN falls back to DEFAULT_PAGE_SIZE
 *
 * Guarantees finite integers so invalid input (e.g. `?limit=abc`,
 * `?limit=10000000`) can never reach Drizzle `.limit()/.offset()` as NaN
 * or dump entire tables.
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

  const offset = Number.isNaN(rawOffset) ? 0 : Math.max(0, rawOffset)
  const limit = Number.isNaN(rawLimit)
    ? DEFAULT_PAGE_SIZE
    : Math.min(MAX_PAGE_SIZE, Math.max(1, rawLimit))

  return { offset, limit }
}
