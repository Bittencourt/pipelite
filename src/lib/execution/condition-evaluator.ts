import type {
  ExecutionContext,
  ConditionOperator,
  ConditionGroup,
} from "./types"

/**
 * Keys that must never be reachable through a field path (T-34-21).
 *
 * Bracket notation lets a path name any string key, which makes a deliberate
 * prototype-chain hop trivial to express. Rejecting these three during
 * tokenisation keeps the walk from ever leaving the context's own data.
 */
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"])

/**
 * Split a field path into segments, accepting dot notation, bracket notation,
 * or a mix of the two:
 *
 *   trigger.data.deal.value
 *   trigger.data.customFields["Código Mãe"]
 *   trigger.data.customFields['CNPJ / CPF'].value
 *
 * Content inside brackets is taken literally — dots, spaces, punctuation and
 * non-ASCII inside the quotes are part of the field name, never separators.
 * This matters because 152 of the 169 custom field definitions in the live
 * database have names a dot-only path cannot express.
 *
 * Returns null for malformed input (unterminated bracket, empty bracket,
 * unquoted or mismatched quotes, trailing junk after `]`, or a forbidden key),
 * which the caller turns into `undefined`.
 *
 * The grammar is `path := chunk ("." chunk)*` where `chunk := name? bracket*`.
 * A chunk with no brackets always emits its name — even an empty one — so a
 * bracket-free path tokenises exactly as `path.split(".")` did.
 *
 * Implemented as a single forward scan with no backtracking and no regex, so
 * cost is linear in path length even for adversarial input (T-34-20).
 */
function tokenizeFieldPath(path: string): string[] | null {
  const segments: string[] = []
  const len = path.length
  let i = 0

  for (;;) {
    // --- chunk: an optional dot-style name, then zero or more brackets ---
    const nameStart = i
    while (i < len && path[i] !== "." && path[i] !== "[") i++
    const name = path.slice(nameStart, i)

    // A bracket-free chunk contributes its name verbatim, even when empty —
    // that preserves the empty-segment behaviour of the previous split(".").
    // A chunk that opens with a bracket (`["trigger"]`) has no name to emit.
    const hasBracket = i < len && path[i] === "["
    if (!hasBracket || name !== "") segments.push(name)

    while (i < len && path[i] === "[") {
      i++ // consume '['
      const quote = path[i]
      if (quote !== '"' && quote !== "'") return null
      i++ // consume opening quote
      const closeQuote = path.indexOf(quote, i)
      if (closeQuote === -1) return null
      const key = path.slice(i, closeQuote)
      if (key === "") return null
      i = closeQuote + 1
      if (path[i] !== "]") return null
      i++ // consume ']'
      segments.push(key)
    }

    if (i >= len) break
    if (path[i] !== ".") return null // e.g. `customFields["a"]junk`
    i++ // consume '.' and start the next chunk
  }

  for (const segment of segments) {
    if (FORBIDDEN_SEGMENTS.has(segment)) return null
  }
  return segments
}

/**
 * Walk a field path against the execution context.
 * e.g. "trigger.data.deal.value" -> ctx.trigger.data.deal.value
 *
 * Bracket segments are also accepted, so a custom field whose name contains
 * spaces or punctuation can be addressed:
 *   trigger.data.customFields["Previsão de início operação"]
 *
 * A missing/empty/non-string/malformed path (e.g. a condition the user added
 * but never configured) resolves to undefined instead of throwing, so the run
 * does not hard-crash — the condition then evaluates like any other missing
 * field (is_empty -> true, comparisons -> false).
 */
export function resolveFieldPath(
  context: ExecutionContext,
  path: string | null | undefined
): unknown {
  if (typeof path !== "string" || path.trim() === "") {
    return undefined
  }
  const parts = tokenizeFieldPath(path)
  if (parts === null) return undefined
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
