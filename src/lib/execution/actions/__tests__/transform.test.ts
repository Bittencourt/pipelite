import { describe, it, expect, beforeAll } from "vitest"
import type { ExecutionContext } from "../../types"

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    trigger: {
      type: "webhook",
      data: {
        name: "World",
        value: 42,
      },
    },
    nodes: {
      calc_1: {
        output: { value: 10 },
        status: "completed",
      },
    },
    ...overrides,
  }
}

let executeAction: typeof import("../index").executeAction

beforeAll(async () => {
  const mod = await import("../index")
  executeAction = mod.executeAction
})

describe("javascript_transform action", () => {
  it("executes basic transform with trigger data", async () => {
    const result = await executeAction(
      "javascript_transform",
      { code: 'return { greeting: "Hello " + input.trigger.data.name }' },
      makeContext(),
      "run-1"
    )
    expect(result.output.greeting).toBe("Hello World")
    expect(result.output.logs).toEqual([])
  })

  it("accesses previous node output", async () => {
    const result = await executeAction(
      "javascript_transform",
      { code: "return { total: input.nodes.calc_1.output.value * 2 }" },
      makeContext(),
      "run-1"
    )
    expect(result.output.total).toBe(20)
    expect(result.output.logs).toEqual([])
  })

  it("captures console.log calls", async () => {
    const result = await executeAction(
      "javascript_transform",
      { code: 'console.log("debug"); return { ok: true }' },
      makeContext(),
      "run-1"
    )
    expect(result.output.ok).toBe(true)
    expect(result.output.logs).toEqual(["debug"])
  })

  it("captures multiple console.log calls in order", async () => {
    const result = await executeAction(
      "javascript_transform",
      {
        code: 'console.log("first"); console.log("second"); console.log("third"); return { done: true }',
      },
      makeContext(),
      "run-1"
    )
    expect(result.output.logs).toEqual(["first", "second", "third"])
  })

  it("MATH helper works", async () => {
    const result = await executeAction(
      "javascript_transform",
      { code: "return { result: MATH.round(3.7) }" },
      makeContext(),
      "run-1"
    )
    expect(result.output.result).toBe(4)
    expect(result.output.logs).toEqual([])
  })

  it("TEXT helper works", async () => {
    const result = await executeAction(
      "javascript_transform",
      { code: 'return { result: TEXT.upper("hello") }' },
      makeContext(),
      "run-1"
    )
    expect(result.output.result).toBe("HELLO")
  })

  it("DATE helper works", async () => {
    const result = await executeAction(
      "javascript_transform",
      { code: "return { today: DATE.today() }" },
      makeContext(),
      "run-1"
    )
    expect(result.output.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("LOGIC helper works", async () => {
    const result = await executeAction(
      "javascript_transform",
      { code: 'return { result: LOGIC.if(true, "yes", "no") }' },
      makeContext(),
      "run-1"
    )
    expect(result.output.result).toBe("yes")
  })

  it("throws when no return value", async () => {
    await expect(
      executeAction(
        "javascript_transform",
        { code: 'var x = 1;' },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow("Transform must return an object")
  })

  it("throws when returning non-object", async () => {
    await expect(
      executeAction(
        "javascript_transform",
        { code: "return 42" },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow("Transform must return an object")
  })

  it("throws on syntax error", async () => {
    await expect(
      executeAction(
        "javascript_transform",
        { code: "return {{{" },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow()
  })

  it("throws on timeout for infinite loop", async () => {
    await expect(
      executeAction(
        "javascript_transform",
        { code: "while(true){}", _testTimeoutMs: 100 },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow(/timeout|interrupt/i)
  }, 10_000)

  it("has no async/network access", async () => {
    await expect(
      executeAction(
        "javascript_transform",
        { code: 'return await fetch("http://example.com")' },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow()
  })

  it("has no filesystem/process access", async () => {
    await expect(
      executeAction(
        "javascript_transform",
        { code: "return { pid: process.pid }" },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow()
  })

  it("throws when no code provided", async () => {
    await expect(
      executeAction("javascript_transform", {}, makeContext(), "run-1")
    ).rejects.toThrow("No code provided")
  })
})
