import { AsyncLocalStorage } from "node:async_hooks"

export const MAX_RECURSION_DEPTH = 5

export const executionDepthStorage = new AsyncLocalStorage<number>()

/**
 * Get the current workflow execution depth.
 * Returns 0 when not inside a workflow execution context.
 */
export function getCurrentExecutionDepth(): number {
  return executionDepthStorage.getStore() ?? 0
}

/**
 * Run a function within a workflow execution context at the given depth.
 * Used to track recursion when workflow actions trigger CRM events
 * that fire other workflows.
 */
export function runWithExecutionDepth<T>(
  depth: number,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return executionDepthStorage.run(depth, fn)
}
