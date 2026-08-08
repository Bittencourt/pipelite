import { resolveFieldPath } from "../condition-evaluator"
import type { ExecutionContext } from "../types"

const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g

/**
 * Interpolate {{path}} variables in a template string using execution context.
 * Unresolved paths become empty strings. Objects are JSON-stringified.
 */
export function interpolate(
  template: string,
  context: ExecutionContext
): string {
  return template.replace(VARIABLE_PATTERN, (_match, path: string) => {
    const value = resolveFieldPath(context, path.trim())
    if (value === undefined || value === null) return ""
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)
  })
}

/**
 * Recursively interpolate all string values in a nested object/array.
 * Non-string values (numbers, booleans, null, undefined) pass through as-is.
 */
export function interpolateDeep(
  obj: Record<string, unknown>,
  context: ExecutionContext
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[key] = interpolateValue(value, context)
  }
  return result
}

function interpolateValue(value: unknown, context: ExecutionContext): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === "string") return interpolate(value, context)
  if (Array.isArray(value)) {
    return value.map((item) => interpolateValue(item, context))
  }
  if (typeof value === "object") {
    return interpolateDeep(value as Record<string, unknown>, context)
  }
  return value
}
