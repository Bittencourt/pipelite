import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

import {
  FORMULA_WRAPPER_KEY,
  FORMULA_ERROR_MAX_LENGTH,
  isFormulaWrapper,
  unwrapFormulaValue,
  formatFormulaValueForText,
  sanitizeFormulaError,
} from "./formula-helpers"

describe("isFormulaWrapper", () => {
  it("recognises the stored wrapper shape and rejects everything else", () => {
    expect(isFormulaWrapper({ formula: true, value: 1, error: null })).toBe(true)
    // Errored wrappers are still wrappers.
    expect(isFormulaWrapper({ formula: true, value: null, error: "boom" })).toBe(true)

    expect(isFormulaWrapper(1)).toBe(false)
    expect(isFormulaWrapper(null)).toBe(false)
    expect(isFormulaWrapper(undefined)).toBe(false)
    // multi_select values are arrays in this database - they must never be mistaken
    // for wrappers (RESEARCH Pitfall 7 / D-15).
    expect(isFormulaWrapper([1])).toBe(false)
    expect(isFormulaWrapper(["Outbound Manual"])).toBe(false)
    expect(isFormulaWrapper({})).toBe(false)
    expect(isFormulaWrapper("formula")).toBe(false)
  })

  it("uses the same detection key the client already understands", () => {
    // formula-field.tsx:50 detects via `'formula' in value`
    expect(FORMULA_WRAPPER_KEY).toBe("formula")
  })
})

describe("unwrapFormulaValue", () => {
  it("returns the inner value for wrappers and passes non-wrappers through", () => {
    expect(unwrapFormulaValue({ formula: true, value: 1035, error: null })).toBe(1035)
    expect(unwrapFormulaValue({ formula: true, value: null, error: "boom" })).toBe(null)
    expect(unwrapFormulaValue(1035)).toBe(1035)
    expect(unwrapFormulaValue(["a"])).toEqual(["a"])
    expect(unwrapFormulaValue(null)).toBe(null)
    expect(unwrapFormulaValue("plain")).toBe("plain")
  })
})

describe("formatFormulaValueForText", () => {
  it("renders the scalar, the #ERROR form, or the input unchanged", () => {
    expect(formatFormulaValueForText({ formula: true, value: 1035, error: null })).toBe(1035)
    expect(formatFormulaValueForText({ formula: true, value: null, error: "boom" })).toBe(
      "#ERROR: boom"
    )
    expect(formatFormulaValueForText(1035)).toBe(1035)
    expect(formatFormulaValueForText(["Outbound Manual"])).toEqual(["Outbound Manual"])
    expect(formatFormulaValueForText(null)).toBe(null)
  })
})

describe("sanitizeFormulaError", () => {
  it("keeps only the first line so no stack trace reaches stored JSONB (T-34-06)", () => {
    expect(
      sanitizeFormulaError("boom\n    at foo (/app/src/x.ts:1:1)\n    at bar")
    ).toBe("boom")
  })

  it("truncates an over-long message to the cap and marks it with an ellipsis", () => {
    const long = "x".repeat(FORMULA_ERROR_MAX_LENGTH + 50)
    const result = sanitizeFormulaError(long)
    expect(result.length).toBe(FORMULA_ERROR_MAX_LENGTH + 1)
    expect(result.endsWith("…")).toBe(true)
    expect(result.slice(0, FORMULA_ERROR_MAX_LENGTH)).toBe("x".repeat(FORMULA_ERROR_MAX_LENGTH))
  })

  it("returns a non-empty fallback for empty, whitespace, null and undefined input", () => {
    expect(sanitizeFormulaError("")).toBeTruthy()
    expect(sanitizeFormulaError("   ")).toBeTruthy()
    expect(sanitizeFormulaError(undefined)).toBeTruthy()
    expect(sanitizeFormulaError(null)).toBeTruthy()
    // `String(undefined)` would be the string "undefined" - that must not leak.
    expect(sanitizeFormulaError(undefined)).not.toBe("undefined")
    expect(sanitizeFormulaError(null)).not.toBe("null")
  })

  it("unwraps an Error instance to its message without the stack", () => {
    const err = new Error("Unknown field: Consumo")
    expect(sanitizeFormulaError(err)).toBe("Unknown field: Consumo")
  })
})

describe("module boundaries", () => {
  it("imports nothing from @/db so readers and the client bundle can use it", () => {
    const source = readFileSync(new URL("./formula-helpers.ts", import.meta.url), "utf8")
    expect(/@\/db/.test(source)).toBe(false)
  })
})
