import { interpolate, interpolateDeep } from "./interpolate"
import { validateUrl } from "./ssrf"
import { registerAction } from "./registry"
import type { ExecutionContext } from "../types"

/**
 * Fetch with an AbortController timeout.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs * 1000)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Sleep utility for retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Parse response headers into a plain object.
 */
function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}

/**
 * HTTP request action handler.
 * Makes real HTTP requests with interpolated URL, headers, body.
 * Supports retry with exponential backoff and configurable timeout.
 */
async function httpHandler(
  config: Record<string, unknown>,
  context: ExecutionContext,
  _runId: string
): Promise<{ output: Record<string, unknown> }> {
  const method = (config.method as string) ?? "GET"
  const rawUrl = config.url as string
  const rawHeaders = (config.headers as Record<string, string>) ?? {}
  const rawBody = config.body as string | Record<string, unknown> | undefined
  const timeout = (config.timeout as number) ?? 30
  const retryCount = (config.retryCount as number) ?? 0

  // Interpolate URL and headers
  const url = interpolate(rawUrl, context)
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(rawHeaders)) {
    headers[key] = interpolate(value, context)
  }

  // SSRF check
  await validateUrl(url)

  // Build body
  let body: string | undefined
  if (rawBody !== undefined) {
    if (typeof rawBody === "string") {
      body = interpolate(rawBody, context)
    } else {
      const interpolated = interpolateDeep(rawBody, context)
      body = JSON.stringify(interpolated)
    }
    // Auto-add Content-Type if body is present and no Content-Type set
    if (body && !headers["content-type"] && !headers["Content-Type"]) {
      headers["content-type"] = "application/json"
    }
  }

  // Retry loop
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    if (attempt > 0) {
      const delayMs = Math.pow(2, attempt - 1) * 1000
      await sleep(delayMs)
    }

    try {
      const response = await fetchWithTimeout(url, { method, headers, body }, timeout)

      // Parse response (both success and error)
      const responseHeaders = headersToRecord(response.headers)
      const contentType = responseHeaders["content-type"] ?? ""
      let responseBody: unknown

      if (contentType.includes("application/json")) {
        responseBody = await response.json()
      } else {
        responseBody = await response.text()
      }

      if (!response.ok) {
        const bodyPreview = typeof responseBody === "string"
          ? responseBody.slice(0, 200)
          : JSON.stringify(responseBody).slice(0, 200)
        if (attempt < retryCount) {
          lastError = new Error(
            `HTTP ${response.status}: ${bodyPreview}`
          )
          continue
        }
        // Return structured output even on failure so run detail shows full response
        const error = new Error(`HTTP ${response.status}: ${bodyPreview}`)
        ;(error as Error & { output: Record<string, unknown> }).output = {
          statusCode: response.status,
          headers: responseHeaders,
          body: responseBody,
        }
        throw error
      }

      return {
        output: {
          statusCode: response.status,
          headers: responseHeaders,
          body: responseBody,
        } as Record<string, unknown>,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt >= retryCount) {
        throw lastError
      }
    }
  }

  // Should not reach here, but just in case
  throw lastError ?? new Error("HTTP request failed")
}

registerAction("http_request", httpHandler)
