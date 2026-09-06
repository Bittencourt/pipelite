import { NextResponse } from "next/server"

const API_BASE = "https://api.pipelite.app/errors/"

export type ProblemDetail = {
  type: string
  title: string
  status: number
  detail: string
  instance?: string
  errors?: Array<{ field: string; code: string; message: string }>
}

/**
 * Create an RFC 7807 Problem Details response
 * @see https://tools.ietf.org/html/rfc7807
 */
export function problemResponse(
  code: string,
  title: string,
  status: number,
  detail: string,
  instance?: string,
  errors?: ProblemDetail["errors"]
): NextResponse {
  const problem: ProblemDetail = {
    type: `${API_BASE}${code}`,
    title,
    status,
    detail,
    ...(instance && { instance }),
    ...(errors && { errors }),
  }
  return NextResponse.json(problem, { status })
}

/**
 * Pre-built RFC 7807 error response helpers
 */
export const Problems = {
  unauthorized: () =>
    problemResponse(
      "UNAUTHORIZED",
      "Unauthorized",
      401,
      "Authentication required"
    ),

  forbidden: () =>
    problemResponse(
      "FORBIDDEN",
      "Forbidden",
      403,
      "You don't have access to this resource"
    ),

  notFound: (entity: string) =>
    problemResponse("ENTITY_NOT_FOUND", "Not Found", 404, `${entity} not found`),

  validation: (errors: ProblemDetail["errors"]) =>
    problemResponse(
      "VALIDATION_ERROR",
      "Validation Error",
      422,
      "Request validation failed",
      undefined,
      errors
    ),

  conflict: (detail: string) =>
    problemResponse("CONFLICT", "Conflict", 409, detail),

  /**
   * A workflow with run history cannot be deleted — run history is preserved
   * (issue #11). Typed separately from the generic CONFLICT so clients can
   * branch on it (e.g. offer "purge run history first" flows).
   */
  workflowHasRuns: () =>
    problemResponse(
      "WORKFLOW_HAS_RUNS",
      "Workflow Has Run History",
      409,
      "Workflow has run history and cannot be deleted. Run history is preserved; delete is only available for workflows with no runs."
    ),

  rateLimited: (retryAfter: number) => {
    const problem: ProblemDetail = {
      type: `${API_BASE}RATE_LIMITED`,
      title: "Rate Limited",
      status: 429,
      detail: "Too many requests. Please retry after the specified time.",
    }
    return NextResponse.json(problem, {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Reset": String(retryAfter),
      },
    })
  },

  internalError: (detail: string = "An unexpected error occurred") =>
    problemResponse("INTERNAL_ERROR", "Internal Server Error", 500, detail),
}
