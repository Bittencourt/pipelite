import type { ExecutionContext } from "../types"

/**
 * Action handler signature.
 * Receives validated config, execution context, and run ID.
 * Returns output record to store in execution context.
 */
export type ActionHandler = (
  config: Record<string, unknown>,
  context: ExecutionContext,
  runId: string
) => Promise<{ output: Record<string, unknown> }>

const handlers = new Map<string, ActionHandler>()

/**
 * Register an action handler for a given action type.
 */
export function registerAction(type: string, handler: ActionHandler): void {
  handlers.set(type, handler)
}

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
  const handler = handlers.get(actionType)
  if (!handler) {
    throw new Error(`No handler registered for action type: ${actionType}`)
  }
  return handler(config, context, runId)
}

// Side-effect imports to register all handlers
import("./http")
