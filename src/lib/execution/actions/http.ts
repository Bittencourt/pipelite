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

  // Build body — never attach one for GET/HEAD (fetch/undici throws
  // "Request with GET/HEAD method cannot have body"), and skip empty strings.
  const methodAllowsBody = !["GET", "HEAD"].includes(method.toUpperCase())
  let body: string | undefined
  if (methodAllowsBody && rawBody !== undefined && rawBody !== "") {
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

  // DRY-RUN GATE — everything above still runs for real: interpolation, the SSRF
  // check, the GET/HEAD body guard and the auto Content-Type.
  //
  // 1. validateUrl is DELIBERATELY above this gate. It performs a DNS resolution
  //    (ssrf.ts), which is pedantically an outbound packet, but it is a *validation*
  //    and not the "outgoing request" the locked dry-run copy is about. Dropping it
  //    would let a dry run pass a URL that a real run rejects — turning the dry-run
  //    path into an SSRF laundering step that "proves" a blocked host is reachable.
  //    ssrf.ts treats a DNS failure as an IP literal rather than throwing, so an
  //    offline environment still dry-runs fine.
  //
  // 2. The gate is above the retry loop, NOT inside it. Inside, a node configured
  //    with retryCount: 5 would sit in the dry-run dialog for ~31 seconds of
  //    exponential sleep() doing nothing, blowing the dialog's 30-second budget for
  //    a reason that has nothing to do with the workflow being tested.
  //
  // The simulated output carries the same keys as the real one plus `simulated`, so a
  // downstream transform/condition node reading this output behaves identically.
  if (context._dryRun) {
    return {
      output: {
        statusCode: 200,
        headers: {},
        body: {},
        simulated: true,
      },
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
