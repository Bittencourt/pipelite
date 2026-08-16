import { NextRequest, NextResponse } from "next/server"
import { validateApiKey } from "@/lib/api-keys"
import { runWithActor } from "@/lib/audit/actor-context"
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

  // Pass to handler with auth context, inside an `api_key` actor scope.
  //
  // This single wrap is the ONLY place an `api_key` actor is created, and it covers every
  // /api/v1 route present and future — routes need no per-mutation edit to be audited.
  //
  // Its position is load-bearing: it sits AFTER both reject paths above, so a request that
  // fails authentication or rate limiting establishes no actor at all. The corollary is the
  // control worth remembering — a route that does not go through this wrapper is not merely
  // unauthenticated and unrate-limited, its writes also land in the audit log attributed to
  // `system` rather than to a key.
  //
  // The actor is built solely from `validateApiKey`'s return value. Nothing from the request
  // (header, query param or body) may ever reach it, and no run identity is set here — that
  // field is written only by the execution engine, from its own run id.
  //
  // Two grep gates guard the paragraph above, and this comment deliberately does not spell
  // either token, because a control its own prose can satisfy proves nothing: the name of the
  // run-identity field must not appear anywhere in this file, and the wrap helper must appear
  // exactly twice — its import, and the one call below.
  //
  // The cast is forced by the helper's `T | Promise<T>` return type and is the same idiom the
  // execution engine uses at src/lib/execution/engine.ts.
  return runWithActor({ kind: "api_key", userId: result.userId }, () =>
    handler(request, result)
  ) as Promise<NextResponse>
}
