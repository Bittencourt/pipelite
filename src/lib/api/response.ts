import { NextResponse } from "next/server"

interface PaginatedMeta {
  total: number
  offset: number
  limit: number
}

interface PaginatedResponse<T> {
  data: T[]
  meta: PaginatedMeta
}

/**
 * Create a paginated list response with envelope format
 * 
 * Format: { data: [...], meta: { total, offset, limit } }
 * Includes X-Total-Count header for convenience
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  offset: number,
  limit: number
): NextResponse<PaginatedResponse<T>> {
  return NextResponse.json(
    { data, meta: { total, offset, limit } },
    { headers: { "X-Total-Count": String(total) } }
  )
}

/**
 * Create a single entity response
 * 
 * Format: { data: {...} }
 */
export function singleResponse<T>(data: T): NextResponse<{ data: T }> {
  return NextResponse.json({ data: { ...data } })
}

/**
 * Create a 201 Created response
 * 
 * Format: { data: {...} }
 */
export function createdResponse<T>(data: T): NextResponse<{ data: T }> {
  return NextResponse.json({ data: { ...data } }, { status: 201 })
}

/**
 * Create a 204 No Content response
 */
export function noContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204 })
}
