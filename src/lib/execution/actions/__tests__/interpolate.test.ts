import { describe, it, expect } from "vitest"
import { interpolate, interpolateDeep } from "../interpolate"
import type { ExecutionContext } from "../../types"

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    trigger: {
      type: "deal.created",
      data: {
        name: "John",
        email: "john@example.com",
        obj: { nested: true, value: 42 },
        url: "https://api.example.com/data",
      },
    },
    nodes: {
      node_1: {
        output: {
          body: { id: "abc123", items: [1, 2, 3] },
          statusCode: 200,
        },
        status: "completed",
      },
    },
    ...overrides,
  }
}

describe("interpolate", () => {
  it("resolves {{trigger.data.field}} to actual value", () => {
    const ctx = makeContext()
    expect(interpolate("Hello {{trigger.data.name}}", ctx)).toBe("Hello John")
  })

  it("resolves deep node output paths", () => {
    const ctx = makeContext()
    expect(interpolate("{{nodes.node_1.output.body.id}}", ctx)).toBe("abc123")
  })

  it("returns empty string for unresolved paths", () => {
    const ctx = makeContext()
    expect(interpolate("{{missing.path}}", ctx)).toBe("")
  })

  it("JSON.stringifies object values", () => {
    const ctx = makeContext()
    const result = interpolate("{{trigger.data.obj}}", ctx)
    expect(result).toBe(JSON.stringify({ nested: true, value: 42 }))
  })

  it("returns unchanged string when no variables present", () => {
    const ctx = makeContext()
    expect(interpolate("no variables here", ctx)).toBe("no variables here")
  })

  it("resolves multiple variables in one string", () => {
    const ctx = makeContext()
    expect(interpolate("{{trigger.data.name}} <{{trigger.data.email}}>", ctx)).toBe(
      "John <john@example.com>"
    )
  })
})

describe("interpolateDeep", () => {
  it("recursively interpolates all string values in nested objects", () => {
    const ctx = makeContext()
    const result = interpolateDeep(
      {
        greeting: "Hello {{trigger.data.name}}",
        nested: {
          url: "{{trigger.data.url}}/{{nodes.node_1.output.body.id}}",
        },
      },
      ctx
    )
    expect(result).toEqual({
      greeting: "Hello John",
      nested: {
        url: "https://api.example.com/data/abc123",
      },
    })
  })

  it("passes through non-string values (numbers, booleans) as-is", () => {
    const ctx = makeContext()
    const result = interpolateDeep(
      {
        count: 42,
        active: true,
        label: "ID: {{nodes.node_1.output.body.id}}",
      },
      ctx
    )
    expect(result).toEqual({
      count: 42,
      active: true,
      label: "ID: abc123",
    })
  })

  it("handles arrays by mapping elements", () => {
    const ctx = makeContext()
    const result = interpolateDeep(
      {
        items: ["{{trigger.data.name}}", 123, { key: "{{trigger.data.email}}" }],
      },
      ctx
    )
    expect(result).toEqual({
      items: ["John", 123, { key: "john@example.com" }],
    })
  })

  it("handles null and undefined values", () => {
    const ctx = makeContext()
    const result = interpolateDeep({ a: null, b: undefined, c: "{{trigger.data.name}}" }, ctx)
    expect(result).toEqual({ a: null, b: undefined, c: "John" })
  })
})
