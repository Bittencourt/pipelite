import type {
  ExecutionContext,
  ConditionOperator,
  ConditionGroup,
} from "./types"

/**
 * Walk a dot-notation path against the execution context.
 * e.g. "trigger.data.deal.value" -> ctx.trigger.data.deal.value
 */
export function resolveFieldPath(
  context: ExecutionContext,
  path: string
): unknown {
  const parts = path.split(".")
  let current: unknown = context
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Evaluate a single operator against a field value and comparison value.
 */
export function evaluateOperator(
  fieldValue: unknown,
  operator: ConditionOperator,
  compareValue: unknown
): boolean {
  switch (operator) {
    case "equals":
      return String(fieldValue) === String(compareValue)

    case "not_equals":
      return String(fieldValue) !== String(compareValue)

    case "contains":
      return String(fieldValue).includes(String(compareValue))

    case "not_contains":
      return !String(fieldValue).includes(String(compareValue))

    case "greater_than":
      return Number(fieldValue) > Number(compareValue)

    case "less_than":
      return Number(fieldValue) < Number(compareValue)

    case "greater_than_or_equals":
      return Number(fieldValue) >= Number(compareValue)

    case "less_than_or_equals":
      return Number(fieldValue) <= Number(compareValue)

    case "is_empty":
      return fieldValue == null || fieldValue === ""

    case "is_not_empty":
      return fieldValue != null && fieldValue !== ""

    case "starts_with":
      return String(fieldValue).startsWith(String(compareValue))

    case "ends_with":
      return String(fieldValue).endsWith(String(compareValue))

    case "matches_regex": {
      try {
        const regex = new RegExp(String(compareValue))
        return regex.test(String(fieldValue))
      } catch {
        return false
      }
    }

    case "in_list": {
      const list = Array.isArray(compareValue) ? compareValue : []
      return list.some((item) => String(item) === String(fieldValue))
    }

    case "not_in_list": {
      const list = Array.isArray(compareValue) ? compareValue : []
      return !list.some((item) => String(item) === String(fieldValue))
    }

    default:
      return false
  }
}

/**
 * Evaluate all conditions within a group using the group's operator (AND/OR).
 */
export function evaluateGroup(
  group: ConditionGroup,
  context: ExecutionContext
): boolean {
  const results = group.conditions.map((condition) => {
    const fieldValue = resolveFieldPath(context, condition.fieldPath)
    return evaluateOperator(fieldValue, condition.operator, condition.value)
  })

  if (group.operator === "and") {
    return results.every(Boolean)
  }
  return results.some(Boolean)
}

/**
 * Evaluate a condition config (groups + top-level logic operator) against context.
 */
export function evaluateCondition(
  config: { groups: ConditionGroup[]; logicOperator: "and" | "or" },
  context: ExecutionContext
): boolean {
  const groupResults = config.groups.map((group) =>
    evaluateGroup(group, context)
  )

  if (config.logicOperator === "and") {
    return groupResults.every(Boolean)
  }
  return groupResults.some(Boolean)
}
