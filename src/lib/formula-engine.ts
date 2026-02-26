import { getQuickJS, QuickJSHandle } from "quickjs-emscripten"

// Formula function library
const FORMULA_FUNCTIONS = `
const MATH = {
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  max: Math.max,
  min: Math.min,
  sqrt: Math.sqrt,
  pow: Math.pow,
  log: Math.log,
  log10: Math.log10,
  exp: Math.exp,
};

const TEXT = {
  upper: (s) => String(s ?? '').toUpperCase(),
  lower: (s) => String(s ?? '').toLowerCase(),
  trim: (s) => String(s ?? '').trim(),
  left: (s, n) => String(s ?? '').slice(0, n),
  right: (s, n) => String(s ?? '').slice(-n),
  len: (s) => String(s ?? '').length,
  concat: (...args) => args.join(''),
  replace: (s, find, replace) => String(s ?? '').replaceAll(find, replace),
  contains: (s, find) => String(s ?? '').includes(find),
};

const DATE = {
  today: () => new Date().toISOString().split('T')[0],
  now: () => new Date().toISOString(),
  year: (d) => new Date(d).getUTCFullYear(),
  month: (d) => new Date(d).getUTCMonth() + 1,
  day: (d) => new Date(d).getUTCDate(),
  days: (d) => Math.floor(new Date(d) / 86400000),
  addDays: (d, n) => new Date(new Date(d).getTime() + n * 86400000).toISOString().split('T')[0],
  diffDays: (d1, d2) => Math.floor((new Date(d1) - new Date(d2)) / 86400000),
};

const LOGIC = {
  if: (cond, yes, no) => cond ? yes : no,
  and: (...args) => args.every(Boolean),
  or: (...args) => args.some(Boolean),
  not: (v) => !v,
  isBlank: (v) => v === null || v === undefined || v === '',
  isNumber: (v) => typeof v === 'number' && !isNaN(v),
};
`

interface EvalResult {
  value: unknown
  error: string | null
}

interface RelatedEntities {
  [entityName: string]: Record<string, unknown>
}

/**
 * Safely dispose of a QuickJS handle
 */
function safeDispose(handle: QuickJSHandle | undefined): void {
  if (handle) {
    try {
      handle.dispose()
    } catch {
      // Ignore disposal errors
    }
  }
}

/**
 * Get a value from related entities by field name
 */
function getFromRelatedEntities(
  fieldName: string,
  relatedEntities?: RelatedEntities
): unknown | undefined {
  if (!relatedEntities) return undefined
  for (const values of Object.values(relatedEntities)) {
    if (fieldName in values) {
      return values[fieldName]
    }
  }
  return undefined
}

/**
 * Evaluate a formula expression in a sandboxed QuickJS environment
 */
export async function evaluateFormula(
  expression: string,
  fieldValues: Record<string, unknown>,
  relatedEntities?: RelatedEntities
): Promise<EvalResult> {
  // Check for null propagation - if any referenced field is explicitly null, return null
  const deps = extractDependencies(expression)
  for (const dep of deps) {
    // Handle related entity references
    if (dep.includes('.')) {
      const [entity, field] = dep.split('.')
      const entityData = relatedEntities?.[entity.trim()]
      if (entityData && field.trim() in entityData && entityData[field.trim()] === null) {
        return { value: null, error: null }
      }
    } else {
      // Check if field is explicitly set to null
      if (dep in fieldValues && fieldValues[dep] === null) {
        return { value: null, error: null }
      }
    }
  }

  const QuickJS = await getQuickJS()
  const vm = QuickJS.newContext()
  
  try {
    // Set up function library
    const functionsResult = vm.evalCode(FORMULA_FUNCTIONS)
    if (functionsResult.error) {
      functionsResult.dispose()
      return { value: null, error: 'Failed to initialize formula functions' }
    }
    safeDispose(functionsResult.value)
    
    // Merge field values with related entity fields for simpler lookups
    // When a field like {{Revenue}} is used, we check fields first, then all related entities
    const allFields: Record<string, unknown> = { ...fieldValues }
    if (relatedEntities) {
      for (const [entity, values] of Object.entries(relatedEntities)) {
        const safeEntity = entity.replace(/[^a-zA-Z0-9]/g, '_')
        const entityResult = vm.evalCode(`const ${safeEntity} = ${JSON.stringify(values)};`)
        if (entityResult.error) {
          entityResult.dispose()
          continue
        }
        safeDispose(entityResult.value)
        
        // Also add entity fields to the merged lookup (entity fields added if not in main fields)
        for (const [key, value] of Object.entries(values)) {
          if (!(key in allFields)) {
            allFields[key] = value
          }
        }
      }
    }
    
    // Create field values object
    const fieldsJson = JSON.stringify(allFields)
    const fieldsResult = vm.evalCode(`const fields = ${fieldsJson};`)
    if (fieldsResult.error) {
      fieldsResult.dispose()
      return { value: null, error: 'Failed to initialize field values' }
    }
    safeDispose(fieldsResult.value)
    
    // Replace {{Field Name}} with fields["Field Name"]
    let processedExpr = expression.replace(/\{\{([^}]+)\}\}/g, (_, ref: string) => {
      const trimmed = ref.trim()
      // Check if it's a related entity reference (e.g., "Organization.Revenue")
      if (trimmed.includes('.')) {
        const [entity, field] = trimmed.split('.')
        const safeEntity = entity.replace(/[^a-zA-Z0-9]/g, '_')
        return `${safeEntity}["${field.trim()}"]`
      }
      return `fields["${trimmed}"]`
    })
    
    // Wrap in null-safe expression that propagates null
    const wrappedCode = `
      (function() {
        try {
          const result = ${processedExpr};
          if (result === null || result === undefined) return null;
          return result;
        } catch (e) {
          return { __error__: e instanceof Error ? e.message : String(e) };
        }
      })()
    `
    
    const evalResult = vm.evalCode(wrappedCode)
    
    if (evalResult.error) {
      evalResult.dispose()
      return { value: null, error: 'Failed to evaluate formula' }
    }
    
    const value = vm.dump(evalResult.value)
    safeDispose(evalResult.value)
    
    if (value && typeof value === 'object' && '__error__' in value) {
      return { value: null, error: (value as { __error__: string }).__error__ }
    }
    
    return { value, error: null }
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : 'Unknown error' }
  } finally {
    vm.dispose()
  }
}

/**
 * Extract field dependencies from a formula expression
 */
export function extractDependencies(expression: string): string[] {
  const deps: string[] = []
  const regex = /\{\{([^}]+)\}\}/g
  let match
  while ((match = regex.exec(expression)) !== null) {
    deps.push(match[1].trim())
  }
  return deps
}

/**
 * Detect circular dependencies in a dependency graph
 */
export function detectCircularDependency(
  field: string,
  dependencies: Map<string, string[]>,
  visited: Set<string> = new Set(),
  path: Set<string> = new Set()
): boolean {
  if (path.has(field)) return true
  if (visited.has(field)) return false
  
  path.add(field)
  const deps = dependencies.get(field) || []
  
  for (const dep of deps) {
    if (detectCircularDependency(dep, dependencies, visited, path)) {
      return true
    }
  }
  
  path.delete(field)
  visited.add(field)
  return false
}
