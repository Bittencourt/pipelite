import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createElement } from "react"
import type { ReactElement, ReactNode } from "react"
import { readFileSync } from "fs"
import { warnIfInvalidTriggerChild } from "../trigger-child-guard"

// The exact runtime value a React Flight client materialises for a deferred
// element child ("$L<id>"). `isValidElement` is false for it and
// `React.Children.count` is 1, which is why Radix `SlotClone` early-outs to
// `null` without a throw or a warning. Reference shape: 44-RESEARCH.md R9.
function flightLazy(node: ReactElement): ReactNode {
  const chunk = { status: "fulfilled", value: node, then() {} }
  return {
    $$typeof: Symbol.for("react.lazy"),
    _payload: chunk,
    _init: (p: typeof chunk) => p.value,
  } as unknown as ReactNode
}

describe("warnIfInvalidTriggerChild", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  const message = () => String(errorSpy.mock.calls[0]?.[0])

  it("returns true and logs nothing for a valid React element", () => {
    expect(warnIfInvalidTriggerChild(createElement("button"), "FieldDialog")).toBe(true)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("returns false and logs exactly once for a Flight-deferred element", () => {
    const child = flightLazy(createElement("button", null, "Add Field"))

    expect(warnIfInvalidTriggerChild(child, "FieldDialog")).toBe(false)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it("names the component, asChild, and the RSC boundary as the likely cause", () => {
    warnIfInvalidTriggerChild(flightLazy(createElement("button")), "FieldDialog")

    expect(message()).toContain("FieldDialog")
    expect(message()).toContain("asChild")
    expect(message()).toContain("RSC boundary")
    expect(message()).toContain("server component")
  })

  const nonElements: Array<[string, unknown]> = [
    ["a string", "Add Field"],
    ["null", null],
    ["undefined", undefined],
    ["a plain object", { label: "Add Field" }],
  ]

  for (const [label, value] of nonElements) {
    it(`returns false and logs once for ${label}`, () => {
      expect(warnIfInvalidTriggerChild(value, "FieldDialog")).toBe(false)
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(message()).toContain("FieldDialog")
      expect(message()).toContain("asChild")
    })
  }

  // T-44-18: the message names the component and the boundary only. It must never
  // serialize `children`, prop values, or any record data into the console.
  it("never serializes the offending child into the log", () => {
    warnIfInvalidTriggerChild({ label: "Annual Revenue", value: "s3cr3t-record-data" }, "FieldDialog")

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0]).toHaveLength(1)
    expect(message()).not.toContain("s3cr3t-record-data")
    expect(message()).not.toContain("Annual Revenue")
  })

  describe("in production", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production")
    })

    it("still returns false for a non-element but logs nothing", () => {
      expect(warnIfInvalidTriggerChild(flightLazy(createElement("button")), "FieldDialog")).toBe(false)
      expect(warnIfInvalidTriggerChild(null, "FieldDialog")).toBe(false)
      expect(warnIfInvalidTriggerChild("Add Field", "FieldDialog")).toBe(false)
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it("still returns true for a valid element and logs nothing", () => {
      expect(warnIfInvalidTriggerChild(createElement("button"), "FieldDialog")).toBe(true)
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })
})

const FIELD_DIALOG_SOURCE = readFileSync(new URL("../field-dialog.tsx", import.meta.url), "utf8")

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
}

describe("FieldDialog wiring", () => {
  const source = stripComments(FIELD_DIALOG_SOURCE)

  it("imports the guard", () => {
    expect(source).toMatch(/import\s*\{\s*warnIfInvalidTriggerChild\s*\}\s*from/)
  })

  it("calls the guard with its children", () => {
    expect(source).toMatch(/warnIfInvalidTriggerChild\(\s*children\s*,/)
  })
})
