import { extractDependencies, detectCircularDependency } from './formula-engine'

export interface FormulaValidationResult {
  valid: boolean
  error?: string
  dependencies?: string[]
}

// Available function categories for help display
export const FORMULA_FUNCTIONS = {
  MATH: {
    description: 'Mathematical operations',
    functions: [
      { name: 'MATH.abs(x)', description: 'Absolute value' },
      { name: 'MATH.ceil(x)', description: 'Round up to integer' },
      { name: 'MATH.floor(x)', description: 'Round down to integer' },
      { name: 'MATH.round(x)', description: 'Round to nearest integer' },
      { name: 'MATH.max(a, b, ...)', description: 'Maximum value' },
      { name: 'MATH.min(a, b, ...)', description: 'Minimum value' },
      { name: 'MATH.sqrt(x)', description: 'Square root' },
      { name: 'MATH.pow(x, y)', description: 'x to the power of y' },
    ],
  },
  TEXT: {
    description: 'String manipulation',
    functions: [
      { name: 'TEXT.upper(s)', description: 'Convert to uppercase' },
      { name: 'TEXT.lower(s)', description: 'Convert to lowercase' },
      { name: 'TEXT.trim(s)', description: 'Remove whitespace' },
      { name: 'TEXT.len(s)', description: 'String length' },
      { name: 'TEXT.left(s, n)', description: 'First n characters' },
      { name: 'TEXT.right(s, n)', description: 'Last n characters' },
      { name: 'TEXT.concat(a, b, ...)', description: 'Join strings' },
      { name: 'TEXT.contains(s, find)', description: 'Check if contains' },
    ],
  },
  DATE: {
    description: 'Date operations',
    functions: [
      { name: 'DATE.today()', description: 'Current date (YYYY-MM-DD)' },
      { name: 'DATE.now()', description: 'Current timestamp' },
      { name: 'DATE.year(d)', description: 'Extract year' },
      { name: 'DATE.month(d)', description: 'Extract month (1-12)' },
      { name: 'DATE.day(d)', description: 'Extract day of month' },
      { name: 'DATE.addDays(d, n)', description: 'Add n days to date' },
      { name: 'DATE.diffDays(d1, d2)', description: 'Days between dates' },
    ],
  },
  LOGIC: {
    description: 'Conditional logic',
    functions: [
      { name: 'LOGIC.if(cond, yes, no)', description: 'Conditional value' },
      { name: 'LOGIC.and(a, b, ...)', description: 'All true' },
      { name: 'LOGIC.or(a, b, ...)', description: 'Any true' },
      { name: 'LOGIC.not(x)', description: 'Negate' },
      { name: 'LOGIC.isBlank(x)', description: 'Check if null/empty' },
      { name: 'LOGIC.isNumber(x)', description: 'Check if number' },
    ],
  },
}

/**
 * Validate a formula expression
 */
export async function validateFormula(
  expression: string,
  existingFields: string[], // Names of existing fields (excluding the one being edited)
  editingFieldName?: string // Name of field being edited (for circular check)
): Promise<FormulaValidationResult> {
  if (!expression || !expression.trim()) {
    return { valid: false, error: 'Expression is required' }
  }
  
  // Extract dependencies
  const dependencies = extractDependencies(expression)
  
  // Check for circular dependencies
  if (editingFieldName && dependencies.includes(editingFieldName)) {
    return { 
      valid: false, 
      error: 'Formula cannot reference itself',
      dependencies 
    }
  }
  
  // Build dependency map for circular check
  const depMap = new Map<string, string[]>()
  depMap.set(editingFieldName || '__new__', dependencies.map(d => d.split('.')[0]))
  
  if (detectCircularDependency(editingFieldName || '__new__', depMap)) {
    return {
      valid: false,
      error: 'Circular dependency detected',
      dependencies,
    }
  }
  
  // Check that referenced fields exist (simple check - just base field name)
  for (const dep of dependencies) {
    const baseField = dep.split('.')[0]
    if (!existingFields.includes(baseField) && baseField !== editingFieldName) {
      return {
        valid: false,
        error: `Unknown field: ${baseField}`,
        dependencies,
      }
    }
  }
  
  return { valid: true, dependencies }
}

/* -------------------------------------------------------------------------------------------
 * Stored formula wrapper primitives
 *
 * A recalculated formula value is persisted in the entity's `customFields` JSONB as
 * `{ formula: true, value, error }` - the shape `formula-field.tsx:50` already detects via
 * `'formula' in value`. These helpers are the single place that shape is understood.
 *
 * They live here, and NOT in `formula-recalc.ts`, precisely because this module imports no
 * database client: the CSV exporter, the webhook payload builder and the workflow trigger
 * envelope all need to read a wrapper without dragging the db module (and its env
 * requirements) into their bundle. A test greps this file for a database-alias import and
 * fails if one appears - keep it that way.
 * ----------------------------------------------------------------------------------------- */

/** The single key that marks a stored value as a computed formula result. */
export const FORMULA_WRAPPER_KEY = 'formula'

/** The persisted shape of a formula field value (D-05). */
export interface FormulaWrapper {
  formula: true
  value: unknown
  error: string | null
}

/**
 * Narrow an arbitrary stored JSONB value to the formula wrapper shape.
 *
 * The `!Array.isArray` guard is load-bearing: every `multi_select` value in this database is
 * stored as an array (`{"Origem":["Outbound Manual"]}`), and `'formula' in []` would otherwise
 * be evaluated against an array's prototype chain rather than rejected outright.
 */
export function isFormulaWrapper(value: unknown): value is FormulaWrapper {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    FORMULA_WRAPPER_KEY in value
  )
}

/**
 * Reduce a stored value to the scalar a formula should see.
 *
 * Required before a value enters `evaluateFormula`'s `fieldValues`: a wrapper object reaching
 * the sandbox makes arithmetic yield `NaN`, which `vm.dump` surfaces as `null` - a silent blank
 * with no error at all (RESEARCH Pitfall 2). Non-wrappers pass through untouched.
 */
export function unwrapFormulaValue(value: unknown): unknown {
  return isFormulaWrapper(value) ? value.value : value
}

/**
 * Render a stored value for a text-ish reader (CSV cells, webhook/trigger envelopes).
 *
 * An errored wrapper becomes `#ERROR: <message>` rather than the scalar `null`, so a broken
 * formula is visible in an export instead of looking like an empty cell. Without this,
 * `Papa.unparse` writes `[object Object]` for every wrapper (measured, papaparse 5.5.3).
 */
export function formatFormulaValueForText(value: unknown): unknown {
  if (!isFormulaWrapper(value)) return value
  if (value.error !== null && value.error !== undefined) return `#ERROR: ${value.error}`
  return value.value
}

/** Maximum length of a persisted formula error message, before the ellipsis. */
export const FORMULA_ERROR_MAX_LENGTH = 200

/** Shown when the underlying message is missing or empty after sanitisation. */
export const FORMULA_ERROR_FALLBACK = 'Formula evaluation failed'

/**
 * Reduce any thrown/returned error into a string that is safe to persist in user-visible JSONB
 * (threat T-34-06).
 *
 * Two untrusted sources feed this: QuickJS hands back a raw `e.message` from an admin-authored
 * expression, and the recalc helper's outer catch can see a Drizzle error carrying SQL text.
 * Neither may be stored verbatim, because the stored `error` is rendered by `formula-field.tsx`
 * and exported to CSV. So: first line only (drops any stack), trimmed, and capped.
 */
export function sanitizeFormulaError(message: unknown): string {
  if (message === null || message === undefined) return FORMULA_ERROR_FALLBACK

  const raw = message instanceof Error ? message.message : String(message)
  const firstLine = raw.split('\n')[0].trim()

  if (!firstLine) return FORMULA_ERROR_FALLBACK

  return firstLine.length > FORMULA_ERROR_MAX_LENGTH
    ? `${firstLine.slice(0, FORMULA_ERROR_MAX_LENGTH)}…`
    : firstLine
}

/**
 * Get example expressions for help
 */
export const FORMULA_EXAMPLES = [
  { expression: '{{Annual Revenue}} * 0.1', description: '10% of revenue' },
  { expression: 'TEXT.upper({{Name}})', description: 'Name in uppercase' },
  { expression: 'LOGIC.if({{Score}} > 100, "High", "Low")', description: 'Conditional label' },
  { expression: 'DATE.diffDays(DATE.today(), {{Start Date}})', description: 'Days since start' },
  { expression: '{{First Name}} + " " + {{Last Name}}', description: 'Full name' },
]
