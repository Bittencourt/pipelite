import type { ExecutionContext } from "../types"

// Re-export registry functions for external use
export { registerAction } from "./registry"
export type { ActionHandler } from "./registry"

// Side-effect imports to register all handlers
import "./http"
import "./transform"
import "./webhook-response"
import "./crm"

// Import getHandler after side-effect imports to ensure handlers are registered
import { getHandler } from "./registry"

/**
 * Execute an action by looking up its registered handler.
 * Throws if no handler is registered for the given type.
 */
export async function executeAction(
  actionType: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  runId: string
): Promise<{ output: Record<string, unknown> }> {
  const handler = getHandler(actionType)
  if (!handler) {
    throw new Error(`No handler registered for action type: ${actionType}`)
  }
  return handler(config, context, runId)
}
