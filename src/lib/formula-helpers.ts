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
