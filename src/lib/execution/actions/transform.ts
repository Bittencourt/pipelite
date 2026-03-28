import { getQuickJS } from "quickjs-emscripten"
import { registerAction } from "./registry"
import type { ExecutionContext } from "../types"

/**
 * Helper function library injected into QuickJS sandbox.
 * Matches the formula engine helpers so users have a consistent API.
 */
const TRANSFORM_HELPERS = `
var MATH = {
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

var TEXT = {
  upper: function(s) { return String(s == null ? '' : s).toUpperCase(); },
  lower: function(s) { return String(s == null ? '' : s).toLowerCase(); },
  trim: function(s) { return String(s == null ? '' : s).trim(); },
  length: function(s) { return String(s == null ? '' : s).length; },
  len: function(s) { return String(s == null ? '' : s).length; },
  substring: function(s, start, end) { return String(s == null ? '' : s).substring(start, end); },
  replace: function(s, find, rep) { return String(s == null ? '' : s).replaceAll(find, rep); },
  contains: function(s, find) { return String(s == null ? '' : s).includes(find); },
  startsWith: function(s, find) { return String(s == null ? '' : s).startsWith(find); },
  endsWith: function(s, find) { return String(s == null ? '' : s).endsWith(find); },
  split: function(s, sep) { return String(s == null ? '' : s).split(sep); },
  join: function(arr, sep) { return (arr || []).join(sep || ''); },
  left: function(s, n) { return String(s == null ? '' : s).slice(0, n); },
  right: function(s, n) { return String(s == null ? '' : s).slice(-n); },
  concat: function() { var a = []; for (var i = 0; i < arguments.length; i++) a.push(arguments[i]); return a.join(''); },
};

var DATE = {
  today: function() { return new Date().toISOString().split('T')[0]; },
  now: function() { return new Date().toISOString(); },
  addDays: function(d, n) { return new Date(new Date(d).getTime() + n * 86400000).toISOString().split('T')[0]; },
  addMonths: function(d, n) { var dt = new Date(d); dt.setUTCMonth(dt.getUTCMonth() + n); return dt.toISOString().split('T')[0]; },
  diffDays: function(d1, d2) { return Math.floor((new Date(d1) - new Date(d2)) / 86400000); },
  format: function(d, fmt) { return new Date(d).toISOString(); },
  parseDate: function(s) { return new Date(s).toISOString(); },
  year: function(d) { return new Date(d).getUTCFullYear(); },
  month: function(d) { return new Date(d).getUTCMonth() + 1; },
  day: function(d) { return new Date(d).getUTCDate(); },
  days: function(d) { return Math.floor(new Date(d) / 86400000); },
};

var LOGIC = {
  if: function(cond, yes, no) { return cond ? yes : no; },
  and: function() { for (var i = 0; i < arguments.length; i++) if (!arguments[i]) return false; return true; },
  or: function() { for (var i = 0; i < arguments.length; i++) if (arguments[i]) return true; return false; },
  not: function(v) { return !v; },
  isBlank: function(v) { return v === null || v === undefined || v === ''; },
  isNumber: function(v) { return typeof v === 'number' && !isNaN(v); },
};
`;

const DEFAULT_TIMEOUT_MS = 5_000

/**
 * JavaScript transform action handler.
 * Executes user code in a QuickJS sandbox with:
 * - input object containing trigger data and previous node outputs
 * - MATH, TEXT, DATE, LOGIC helper functions
 * - console.log capture
 * - 5s timeout and 8MB memory limit
 */
async function transformHandler(
  config: Record<string, unknown>,
  context: ExecutionContext,
  _runId: string
): Promise<{ output: Record<string, unknown> }> {
  const code = config.code as string | undefined
  if (!code || typeof code !== "string" || code.trim() === "") {
    throw new Error("No code provided")
  }

  // Allow test-configurable timeout
  const timeoutMs =
    typeof config._testTimeoutMs === "number"
      ? config._testTimeoutMs
      : DEFAULT_TIMEOUT_MS

  const QuickJS = await getQuickJS()
  const runtime = QuickJS.newRuntime()

  // Set memory limit (8MB)
  try {
    runtime.setMemoryLimit(8 * 1024 * 1024)
  } catch {
    // API may not be available in all versions
  }

  // Set interrupt handler for timeout
  const startTime = Date.now()
  runtime.setInterruptHandler(() => {
    return Date.now() - startTime > timeoutMs
  })

  const vm = runtime.newContext()
  const logs: string[] = []

  try {
    // Inject console.log capture
    const consoleObj = vm.newObject()
    const logFn = vm.newFunction("log", (...args) => {
      const parts = args.map((arg) => {
        const dumped = vm.dump(arg)
        return typeof dumped === "string" ? dumped : JSON.stringify(dumped)
      })
      logs.push(parts.join(" "))
    })
    vm.setProp(consoleObj, "log", logFn)
    vm.setProp(vm.global, "console", consoleObj)
    logFn.dispose()
    consoleObj.dispose()

    // Inject helper functions
    const helpersResult = vm.evalCode(TRANSFORM_HELPERS)
    if (helpersResult.error) {
      const err = vm.dump(helpersResult.error)
      helpersResult.error.dispose()
      throw new Error(`Failed to initialize helpers: ${JSON.stringify(err)}`)
    }
    helpersResult.value.dispose()

    // Build and inject input object
    const inputData = {
      trigger: context.trigger,
      nodes: context.nodes,
    }
    const inputJson = JSON.stringify(inputData)
    const inputResult = vm.evalCode(
      `var input = JSON.parse(${JSON.stringify(inputJson)});`
    )
    if (inputResult.error) {
      const err = vm.dump(inputResult.error)
      inputResult.error.dispose()
      throw new Error(`Failed to inject input: ${JSON.stringify(err)}`)
    }
    inputResult.value.dispose()

    // Wrap user code in IIFE and execute
    const wrappedCode = `(function(input) { ${code} })(input)`
    const evalResult = vm.evalCode(wrappedCode)

    if (evalResult.error) {
      const err = vm.dump(evalResult.error)
      evalResult.error.dispose()
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? (err as { message: string }).message
          : JSON.stringify(err)
      throw new Error(message)
    }

    const rawResult = vm.dump(evalResult.value)
    evalResult.value.dispose()

    // Validate result is an object
    if (
      rawResult === undefined ||
      rawResult === null ||
      typeof rawResult !== "object" ||
      Array.isArray(rawResult)
    ) {
      throw new Error("Transform must return an object")
    }

    return {
      output: { ...(rawResult as Record<string, unknown>), logs },
    }
  } finally {
    vm.dispose()
    runtime.dispose()
  }
}

registerAction("javascript_transform", transformHandler)
