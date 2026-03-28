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
async function webhookResponseHandler(
  config: Record<string, unknown>,
  context: ExecutionContext,
  runId: string
): Promise<{ output: Record<string, unknown> }> {
  const statusCode = (config.statusCode as number) ?? 200
  const rawBody = (config.body as Record<string, unknown>) ?? {}

  // Interpolate template variables in the body
  const interpolatedBody = interpolateDeep(rawBody, context)

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
