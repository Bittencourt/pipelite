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
 * Look up a registered handler by action type.
 */
export function getHandler(actionType: string): ActionHandler | undefined {
  return handlers.get(actionType)
}
