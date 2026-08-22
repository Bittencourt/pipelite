import { interpolateDeep } from "./interpolate"
import { registerAction } from "./registry"
import type { ExecutionContext } from "../types"

/**
 * In-memory coordination map for webhook responses.
 * Maps runId -> { resolve, reject, timeout } for pending HTTP responses.
 */
interface PendingResponse {
  resolve: (value: { statusCode: number; body: unknown }) => void
  reject: (reason: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

const pendingResponses = new Map<string, PendingResponse>()

/**
 * Wait for a webhook response from the execution engine.
 * Called by the inbound webhook HTTP handler to block until the
 * webhook_response action node sends a response.
 *
 * @param runId - The workflow run ID
 * @param timeoutMs - Maximum wait time in ms (default 30s)
 * @returns Promise resolving to { statusCode, body }
 */
export function waitForWebhookResponse(
  runId: string,
  timeoutMs = 30_000
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingResponses.delete(runId)
      reject(new Error(`Webhook response timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    pendingResponses.set(runId, { resolve, reject, timeout })
  })
}

/**
 * Send a webhook response back to the waiting HTTP handler.
 * Called by the webhook_response action handler during execution.
 *
 * @param runId - The workflow run ID
 * @param statusCode - HTTP status code to return
 * @param body - Response body
 * @returns true if a pending response was found and resolved, false otherwise
 */
export function sendWebhookResponse(
  runId: string,
  statusCode: number,
  body: unknown
): boolean {
  const pending = pendingResponses.get(runId)
  if (!pending) return false

  clearTimeout(pending.timeout)
  pendingResponses.delete(runId)
  pending.resolve({ statusCode, body })
  return true
}

/**
 * Check if a workflow's nodes array contains a webhook_response action.
 * Used by the webhook HTTP handler to decide whether to wait for a response.
 */
export function hasWebhookResponseNode(nodes: unknown[]): boolean {
  if (!Array.isArray(nodes)) return false
  return nodes.some((node) => {
    if (!node || typeof node !== "object") return false
    const n = node as Record<string, unknown>
    const config = n.config as Record<string, unknown> | undefined
    return config?.actionType === "webhook_response"
  })
}

/**
 * Webhook response action handler.
 * Sends a custom HTTP response back to the inbound webhook caller
 * via the in-memory Promise coordination mechanism.
 */
/**
 * Normalize the configured body into a plain object.
 * The editor stores the body as a parsed JSON object, but older saved
 * workflows may contain a raw JSON string — parse it defensively so
 * interpolateDeep never iterates a string's characters.
 */
function normalizeBody(body: unknown): Record<string, unknown> {
  if (typeof body === "string") {
    try {
      const parsed: unknown = JSON.parse(body)
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Unparseable string: fall back to empty body
    }
    return {}
  }
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>
  }
  return {}
}

async function webhookResponseHandler(
  config: Record<string, unknown>,
  context: ExecutionContext,
  runId: string
): Promise<{ output: Record<string, unknown> }> {
  const statusCode = (config.statusCode as number) ?? 200
  const rawBody = normalizeBody(config.body)

  // Interpolate template variables in the body
  const interpolatedBody = interpolateDeep(rawBody, context)

  // ---- DRY-RUN GATE (WFOPS-02) ----
  //
  // This gate looks redundant, and it is not. `pendingResponses` is only ever written by
  // `waitForWebhookResponse`, which is called only by the inbound webhook route
  // (src/app/api/webhooks/in/[workflowId]/[secret]/route.ts) — so a dry run, created by a server
  // action, never has an entry for its runId and `sendWebhookResponse` already returns false on
  // the map miss without awaiting, constructing a promise or throwing. That makes today's safety
  // INCIDENTAL: it depends on the map being keyed by runId and on a dry run never passing through
  // the webhook route, both true and neither asserted anywhere. The gate costs three lines, makes
  // the invariant testable against a REGISTERED pending entry, and converts an accident into a
  // decision.
  //
  // Related consequence, recorded so this file and the WFOPS-04 doc agree: replaying a failed run
  // of a webhook-response workflow also produces `sent: false`, because the original HTTP caller
  // is long gone. Correct and harmless, but it means such a workflow's replay is not equivalent to
  // its original run.
  //
  // Note what is NOT here: `pendingResponses`, `waitForWebhookResponse` and `sendWebhookResponse`
  // are untouched. Making webhook-response multi-instance safe is explicitly out of scope
  // (REQUIREMENTS.md § Out of Scope).
  if (context._dryRun) {
    return {
      output: {
        sent: false,
        statusCode,
        body: interpolatedBody,
        simulated: true,
      },
    }
  }

  // Send response to waiting HTTP handler
  const sent = sendWebhookResponse(runId, statusCode, interpolatedBody)

  return {
    output: {
      sent,
      statusCode,
      body: interpolatedBody,
    },
  }
}

registerAction("webhook_response", webhookResponseHandler)
