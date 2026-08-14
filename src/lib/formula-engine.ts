import { getQuickJS, QuickJSHandle, QuickJSRuntime } from "quickjs-emscripten"

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
 * Optional resource bounds for a single evaluation.
 *
 * Omitting this argument entirely preserves the historical, unbounded code path
 * (`QuickJS.newContext()` with no explicit runtime), which is what the browser
 * live-preview callers use. Server-side callers, which execute admin-authored
 * expressions inside the shared Node process, should always pass bounds so a
 * pathological expression cannot pin a worker (threat T-34-02).
 */
export interface EvaluateFormulaOptions {
  /** Hard cap on sandbox heap, in bytes (mirrors transform.ts's 8 MB). */
  memoryLimitBytes?: number
  /** Wall-clock budget in milliseconds, enforced via a QuickJS interrupt handler. */
  timeoutMs?: number
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
 * Replace string literals with empty ones so that operators and function names that only
 * appear inside quoted text are never mistaken for code. Without this, an expression such as
 * `{{A}} + " LOGIC.if("` would be treated as using a null-safe function.
 */
function stripStringLiterals(expression: string): string {
  return expression
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
}

/**
 * Check if expression uses null-safe functions (LOGIC.isBlank, LOGIC.isNumber, LOGIC.if)
 * These functions can handle null arguments and should not trigger null propagation.
 * Expects an expression whose string literals have already been stripped.
 */
function usesNullSafeFunction(expression: string): boolean {
  const nullSafePatterns = [
    /LOGIC\.isBlank\s*\(/,
    /LOGIC\.isNumber\s*\(/,
    /LOGIC\.if\s*\(/,
    /LOGIC\.or\s*\(/,
    /LOGIC\.and\s*\(/,
    /TEXT\.\w+\s*\(/, // TEXT functions handle null gracefully
  ]
  return nullSafePatterns.some(pattern => pattern.test(expression))
}

const ARITHMETIC_OPERATOR = /[+\-*/%]/

/**
 * Check whether a specific `{{Field}}` reference is used as an arithmetic operand anywhere in
 * the expression, by looking at the nearest non-whitespace character on either side of each
 * occurrence of that reference.
 *
 * This is deliberately per-reference rather than per-expression: a null value handed to
 * `TEXT.len(...)` is handled by the function library (`?? ''`), but the same null used as an
 * operand of `+ - * / %` is coerced to `0` by the sandbox, which would render a blank field as
 * a plausible-looking number. Adjacent-only (we never look past a `)`) so that
 * `TEXT.len({{A}}) + 1` correctly counts as a null-safe use of `{{A}}` while
 * `{{A}} - {{B}}` does not.
 *
 * Expects an expression whose string literals have already been stripped.
 */
function isReferenceUsedInArithmetic(expression: string, reference: string): boolean {
  const referencePattern = /\{\{([^}]+)\}\}/g
  let match: RegExpExecArray | null
  while ((match = referencePattern.exec(expression)) !== null) {
    if (match[1].trim() !== reference) continue
    const before = expression.slice(0, match.index).trimEnd().slice(-1)
    const after = expression.slice(match.index + match[0].length).trimStart().charAt(0)
    if (ARITHMETIC_OPERATOR.test(before) || ARITHMETIC_OPERATOR.test(after)) {
      return true
    }
  }
  return false
}

/**
 * Evaluate a formula expression in a sandboxed QuickJS environment
 */
export async function evaluateFormula(
  expression: string,
  fieldValues?: Record<string, unknown>,
  relatedEntities?: RelatedEntities,
  options?: EvaluateFormulaOptions
): Promise<EvalResult> {
  // Normalize fieldValues to an empty object if not provided
  const fields = fieldValues ?? {}
  
  // Null-safe functions (LOGIC.isBlank, TEXT.*, ...) accept null arguments, so a null field
  // that is only handed to one of them must reach the sandbox instead of short-circuiting on
  // the null early-returns below. That carve-out must NOT extend to a null field used as an
  // arithmetic operand: the sandbox coerces `null` to `0` there, so a blank currency field
  // would render as a plausible-looking number (`{{Price}} - {{Discount}}` -> `-10`) instead of
  // blank. So the carve-out is decided per field reference, not for the whole expression.
  // Computed before the dependency loop, which returns early.
  const scannedExpression = stripStringLiterals(expression)
  const usesNullSafe = usesNullSafeFunction(scannedExpression)

  // Check for missing fields - if a referenced field doesn't exist at all, return error
  const deps = extractDependencies(expression)
  for (const dep of deps) {
    // A null value short-circuits to blank unless every use of it is null-safe.
    const propagateNull =
      !usesNullSafe || isReferenceUsedInArithmetic(scannedExpression, dep)

    // Handle related entity references
    if (dep.includes('.')) {
      const [entity, field] = dep.split('.')
      const entityData = relatedEntities?.[entity.trim()]
      if (!entityData) {
        return { value: null, error: `Unknown entity: ${entity.trim()}` }
      }
      if (!(field.trim() in entityData)) {
        return { value: null, error: `Field "${field.trim()}" not found on ${entity.trim()}` }
      }
      if (entityData[field.trim()] === null && propagateNull) {
        return { value: null, error: null }
      }
    } else {
      // Check if field exists in main fields values
      if (!(dep in fields)) {
        // Check if it might be in related entities
        const fromRelated = getFromRelatedEntities(dep, relatedEntities)
        if (fromRelated === undefined) {
          return { value: null, error: `Unknown field: ${dep}` }
        }
        if (fromRelated === null && propagateNull) {
          return { value: null, error: null }
        }
      } else if (fields[dep] === null && propagateNull) {
        // Field exists but is null
        return { value: null, error: null }
      }
    }
  }
  
  const QuickJS = await getQuickJS()

  // Sandbox construction is the ONLY thing that branches on `options`. With no options
  // this is byte-for-byte the historical path (a context created straight off the module,
  // no explicit runtime), so every existing caller and every existing test is unaffected.
  // With options, we own the runtime so setMemoryLimit/setInterruptHandler have somewhere
  // to live - mirroring src/lib/execution/actions/transform.ts:92-108.
  let runtime: QuickJSRuntime | undefined
  if (options) {
    runtime = QuickJS.newRuntime()
    if (options.memoryLimitBytes !== undefined) {
      try {
        runtime.setMemoryLimit(options.memoryLimitBytes)
      } catch {
        // API may not be available in all versions
      }
    }
    if (options.timeoutMs !== undefined) {
      const startTime = Date.now()
      const budgetMs = options.timeoutMs
      runtime.setInterruptHandler(() => Date.now() - startTime > budgetMs)
    }
  }
  const vm = runtime ? runtime.newContext() : QuickJS.newContext()

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
    const allFields: Record<string, unknown> = { ...fields }
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
    const processedExpr = expression.replace(/\{\{([^}]+)\}\}/g, (_, ref: string) => {
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
    if (runtime) {
      // Context first, then runtime. Each guarded so a dispose failure on an
      // interrupted sandbox cannot mask the result we are about to return.
      try {
        vm.dispose()
      } catch {
        // Ignore disposal errors
      }
      try {
        runtime.dispose()
      } catch {
        // Ignore disposal errors
      }
    } else {
      vm.dispose()
    }
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
