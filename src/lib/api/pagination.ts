import { NextRequest } from "next/server"

export const DEFAULT_PAGE_SIZE = 50

/**
 * Parse pagination parameters from request query string
 * 
 * @param request - The incoming Next.js request
 * @returns Pagination params with offset and limit
 */
export function parsePagination(
  request: NextRequest
): { offset: number; limit: number } {
  const { searchParams } = request.nextUrl
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10))
  const limit = Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_PAGE_SIZE), 10))
  return { offset, limit }
}
