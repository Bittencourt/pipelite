import { NextRequest, NextResponse } from "next/server"
import { validateApiKey } from "@/lib/api-keys"
import { checkRateLimit } from "./rate-limit"
import { Problems } from "./errors"

export interface ApiAuthContext {
  userId: string
  keyId: string
}

/**
 * API authentication middleware wrapper
 * 
 * Extracts Bearer token from Authorization header, validates the API key,
 * checks rate limits, and passes context to the handler.
 * 
 * @param request - The incoming Next.js request
 * @param handler - Route handler receiving request and auth context
 * @returns Response from handler or error response
 */
export async function withApiAuth(
  request: NextRequest,
  handler: (
    request: NextRequest,
    context: ApiAuthContext
  ) => Promise<NextResponse>
): Promise<NextResponse> {
  const authHeader = request.headers.get("Authorization")

  // Check for Bearer token
  if (!authHeader?.startsWith("Bearer ")) {
    return Problems.unauthorized()
  }

  const token = authHeader.slice(7) // Remove "Bearer " prefix

  // Validate API key
  const result = await validateApiKey(token)

  if (!result) {
    return Problems.unauthorized()
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(result.keyId)

  if (!rateLimit.allowed) {
    return Problems.rateLimited(rateLimit.resetIn)
  }

  // Pass to handler with auth context
  return handler(request, result)
}
