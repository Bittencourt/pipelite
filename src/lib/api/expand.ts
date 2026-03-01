import { NextRequest } from "next/server"

/**
 * Parse expand parameter from request query string
 * 
 * Example: ?expand=organization,owner returns Set(['organization', 'owner'])
 * 
 * @param request - The incoming Next.js request
 * @returns Set of field names to expand (empty Set if no param)
 */
export function parseExpand(request: NextRequest): Set<string> {
  const expand = request.nextUrl.searchParams.get("expand")
  if (!expand) return new Set()
  return new Set(
    expand
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean)
  )
}
