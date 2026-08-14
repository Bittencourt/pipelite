import { describe, it, expect } from "vitest"
import {
  resolveFieldPath,
  evaluateOperator,
  evaluateCondition,
} from "./condition-evaluator"
import type { ExecutionContext, ConditionGroup } from "./types"

const makeCtx = (data: Record<string, unknown> = {}): ExecutionContext => ({
  trigger: { type: "crm_event", data },
  nodes: {},
})

describe("resolveFieldPath", () => {
  it("resolves nested dot-notation path", () => {
    const ctx = makeCtx({ deal: { value: 5000 } })
    expect(resolveFieldPath(ctx, "trigger.data.deal.value")).toBe(5000)
  })

  it("resolves top-level trigger fields", () => {
    const ctx = makeCtx()
    expect(resolveFieldPath(ctx, "trigger.type")).toBe("crm_event")
  })

  it("returns undefined for missing path", () => {
    const ctx = makeCtx({})
    expect(resolveFieldPath(ctx, "trigger.data.nonexistent.field")).toBeUndefined()
  })

  it("returns undefined for undefined/null/empty/non-string path without throwing", () => {
    const ctx = makeCtx({ deal: { value: 5000 } })
    expect(() => resolveFieldPath(ctx, undefined)).not.toThrow()
    expect(resolveFieldPath(ctx, undefined)).toBeUndefined()
    expect(resolveFieldPath(ctx, null)).toBeUndefined()
    expect(resolveFieldPath(ctx, "")).toBeUndefined()
    expect(resolveFieldPath(ctx, "   ")).toBeUndefined()
    expect(
      resolveFieldPath(ctx, 42 as unknown as string)
    ).toBeUndefined()
  })

  it("resolves node output paths", () => {
    const ctx: ExecutionContext = {
      trigger: { type: "manual", data: {} },
      nodes: {
        "node-1": { output: { result: "success" }, status: "completed" },
      },
    }
    expect(resolveFieldPath(ctx, "nodes.node-1.output.result")).toBe("success")
  })
})

describe("evaluateOperator", () => {
  it("equals: string coercion", () => {
    expect(evaluateOperator("100", "equals", 100)).toBe(true)
    expect(evaluateOperator("abc", "equals", "abc")).toBe(true)
    expect(evaluateOperator("abc", "equals", "xyz")).toBe(false)
  })

  it("not_equals", () => {
    expect(evaluateOperator("abc", "not_equals", "xyz")).toBe(true)
    expect(evaluateOperator("abc", "not_equals", "abc")).toBe(false)
  })

  it("contains substring", () => {
    expect(evaluateOperator("hello world", "contains", "world")).toBe(true)
    expect(evaluateOperator("hello", "contains", "xyz")).toBe(false)
  })

  it("not_contains substring", () => {
    expect(evaluateOperator("hello world", "not_contains", "xyz")).toBe(true)
    expect(evaluateOperator("hello world", "not_contains", "world")).toBe(false)
  })

  it("greater_than with numeric coercion", () => {
    expect(evaluateOperator(100, "greater_than", 50)).toBe(true)
    expect(evaluateOperator("100", "greater_than", "50")).toBe(true)
    expect(evaluateOperator(50, "greater_than", 100)).toBe(false)
  })

  it("less_than with numeric coercion", () => {
    expect(evaluateOperator(50, "less_than", 100)).toBe(true)
    expect(evaluateOperator(100, "less_than", 50)).toBe(false)
  })

  it("greater_than_or_equals", () => {
    expect(evaluateOperator(100, "greater_than_or_equals", 100)).toBe(true)
    expect(evaluateOperator(101, "greater_than_or_equals", 100)).toBe(true)
    expect(evaluateOperator(99, "greater_than_or_equals", 100)).toBe(false)
  })

  it("less_than_or_equals", () => {
    expect(evaluateOperator(100, "less_than_or_equals", 100)).toBe(true)
    expect(evaluateOperator(99, "less_than_or_equals", 100)).toBe(true)
    expect(evaluateOperator(101, "less_than_or_equals", 100)).toBe(false)
  })

  it("is_empty for null/undefined/empty string", () => {
    expect(evaluateOperator(null, "is_empty", null)).toBe(true)
    expect(evaluateOperator(undefined, "is_empty", null)).toBe(true)
    expect(evaluateOperator("", "is_empty", null)).toBe(true)
    expect(evaluateOperator("hello", "is_empty", null)).toBe(false)
  })

  it("is_not_empty inverse", () => {
    expect(evaluateOperator("hello", "is_not_empty", null)).toBe(true)
    expect(evaluateOperator(null, "is_not_empty", null)).toBe(false)
    expect(evaluateOperator("", "is_not_empty", null)).toBe(false)
  })

  it("starts_with", () => {
    expect(evaluateOperator("hello world", "starts_with", "hello")).toBe(true)
    expect(evaluateOperator("hello world", "starts_with", "world")).toBe(false)
  })

  it("ends_with", () => {
    expect(evaluateOperator("hello world", "ends_with", "world")).toBe(true)
    expect(evaluateOperator("hello world", "ends_with", "hello")).toBe(false)
  })

  it("matches_regex with valid pattern", () => {
    expect(evaluateOperator("test123", "matches_regex", "^test\\d+$")).toBe(true)
    expect(evaluateOperator("abc", "matches_regex", "^test\\d+$")).toBe(false)
  })

  it("matches_regex with invalid pattern returns false", () => {
    expect(evaluateOperator("test", "matches_regex", "[invalid")).toBe(false)
  })

  it("in_list", () => {
    expect(evaluateOperator("apple", "in_list", ["apple", "banana", "cherry"])).toBe(true)
    expect(evaluateOperator("grape", "in_list", ["apple", "banana"])).toBe(false)
  })

  it("not_in_list", () => {
    expect(evaluateOperator("grape", "not_in_list", ["apple", "banana"])).toBe(true)
    expect(evaluateOperator("apple", "not_in_list", ["apple", "banana"])).toBe(false)
  })
})

describe("evaluateCondition", () => {
  it("AND group: all conditions must pass", () => {
    const ctx = makeCtx({ deal: { value: 5000, stage: "won" } })
    const groups: ConditionGroup[] = [
      {
        operator: "and",
        conditions: [
          { fieldPath: "trigger.data.deal.value", operator: "greater_than", value: 1000 },
          { fieldPath: "trigger.data.deal.stage", operator: "equals", value: "won" },
        ],
      },
    ]
    expect(evaluateCondition({ groups, logicOperator: "and" }, ctx)).toBe(true)
  })

  it("AND group fails when one condition fails", () => {
    const ctx = makeCtx({ deal: { value: 500, stage: "won" } })
    const groups: ConditionGroup[] = [
      {
        operator: "and",
        conditions: [
          { fieldPath: "trigger.data.deal.value", operator: "greater_than", value: 1000 },
          { fieldPath: "trigger.data.deal.stage", operator: "equals", value: "won" },
        ],
      },
    ]
    expect(evaluateCondition({ groups, logicOperator: "and" }, ctx)).toBe(false)
  })

  it("OR group: any condition passes", () => {
    const ctx = makeCtx({ deal: { value: 500, stage: "won" } })
    const groups: ConditionGroup[] = [
      {
        operator: "or",
        conditions: [
          { fieldPath: "trigger.data.deal.value", operator: "greater_than", value: 1000 },
          { fieldPath: "trigger.data.deal.stage", operator: "equals", value: "won" },
        ],
      },
    ]
    expect(evaluateCondition({ groups, logicOperator: "and" }, ctx)).toBe(true)
  })

  it("multiple groups combined by top-level AND", () => {
    const ctx = makeCtx({ deal: { value: 5000, stage: "won", source: "web" } })
    const groups: ConditionGroup[] = [
      {
        operator: "and",
        conditions: [
          { fieldPath: "trigger.data.deal.value", operator: "greater_than", value: 1000 },
        ],
      },
      {
        operator: "and",
        conditions: [
          { fieldPath: "trigger.data.deal.source", operator: "equals", value: "web" },
        ],
      },
    ]
    expect(evaluateCondition({ groups, logicOperator: "and" }, ctx)).toBe(true)
  })

  it("multiple groups combined by top-level OR", () => {
    const ctx = makeCtx({ deal: { value: 500, source: "web" } })
    const groups: ConditionGroup[] = [
      {
        operator: "and",
        conditions: [
          { fieldPath: "trigger.data.deal.value", operator: "greater_than", value: 1000 },
        ],
      },
      {
        operator: "and",
        conditions: [
          { fieldPath: "trigger.data.deal.source", operator: "equals", value: "web" },
        ],
      },
    ]
    // First group fails (500 not > 1000), second passes (source=web), OR => true
    expect(evaluateCondition({ groups, logicOperator: "or" }, ctx)).toBe(true)
  })

  it("nested groups: AND conditions OR'd with another group", () => {
    const ctx = makeCtx({ deal: { value: 500, stage: "lost", priority: "high" } })
    const groups: ConditionGroup[] = [
      {
        operator: "and",
        conditions: [
          { fieldPath: "trigger.data.deal.value", operator: "greater_than", value: 10000 },
          { fieldPath: "trigger.data.deal.stage", operator: "equals", value: "won" },
        ],
      },
      {
        operator: "and",
        conditions: [
          { fieldPath: "trigger.data.deal.priority", operator: "equals", value: "high" },
        ],
      },
    ]
    // First group fails (500 not > 10000 AND stage != won), second passes (priority=high)
    // Top-level OR => true
    expect(evaluateCondition({ groups, logicOperator: "or" }, ctx)).toBe(true)
  })

  it("unconfigured condition (missing fieldPath) does not throw and evaluates sanely", () => {
    const ctx = makeCtx({ deal: { value: 5000 } })
    const groups: ConditionGroup[] = [
      {
        operator: "and",
        conditions: [
          {
            fieldPath: undefined as unknown as string,
            operator: "equals",
            value: "won",
          },
        ],
      },
    ]
    expect(() =>
      evaluateCondition({ groups, logicOperator: "and" }, ctx)
    ).not.toThrow()
    expect(evaluateCondition({ groups, logicOperator: "and" }, ctx)).toBe(
      false
    )
  })

  it("unconfigured condition with is_empty evaluates to true", () => {
    const ctx = makeCtx()
    const groups: ConditionGroup[] = [
      {
        operator: "and",
        conditions: [{ fieldPath: "", operator: "is_empty", value: null }],
      },
    ]
    expect(evaluateCondition({ groups, logicOperator: "and" }, ctx)).toBe(true)
  })

  it("all groups fail with top-level OR returns false", () => {
    const ctx = makeCtx({ deal: { value: 500, priority: "low" } })
    const groups: ConditionGroup[] = [
      {
        operator: "and",
        conditions: [
          { fieldPath: "trigger.data.deal.value", operator: "greater_than", value: 10000 },
        ],
      },
      {
        operator: "and",
        conditions: [
          { fieldPath: "trigger.data.deal.priority", operator: "equals", value: "high" },
        ],
      },
    ]
    expect(evaluateCondition({ groups, logicOperator: "or" }, ctx)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Formula fields reached through the trigger envelope (SC-3)
//
// These tests do not exercise condition-evaluator.ts's own behaviour so much as they pin
// WHY matcher.ts normalises formula wrappers before building the envelope. The evaluator is
// deliberately unchanged: it is the envelope that must hand it a scalar.
// ---------------------------------------------------------------------------

describe("formula custom fields in conditions", () => {
  const MARGIN_GT_1000: ConditionGroup[] = [
    {
      operator: "and",
      conditions: [
        {
          fieldPath: "trigger.data.customFields.Margin",
          operator: "greater_than",
          value: 1000,
        },
      ],
    },
  ]

  it("resolves a normalised envelope value and branches on it", () => {
    // Shaped like the envelope matcher.ts now produces.
    const ctx = makeCtx({ customFields: { Margin: 1035 } })

    expect(resolveFieldPath(ctx, "trigger.data.customFields.Margin")).toBe(1035)
    expect(
      evaluateCondition({ groups: MARGIN_GT_1000, logicOperator: "and" }, ctx)
    ).toBe(true)
  })

  it("would silently never fire against an UN-normalised wrapper — the reason normalisation exists", () => {
    const ctx = makeCtx({
      customFields: { Margin: { formula: true, value: 1035, error: null } },
    })

    // Number({...}) -> NaN -> greater_than is false with no error surfaced anywhere.
    expect(Number(resolveFieldPath(ctx, "trigger.data.customFields.Margin"))).toBeNaN()
    expect(
      evaluateCondition({ groups: MARGIN_GT_1000, logicOperator: "and" }, ctx)
    ).toBe(false)
  })

  it("treats an errored formula (normalised to null) as empty rather than comparable", () => {
    const ctx = makeCtx({ customFields: { Margin: null } })

    expect(
      evaluateCondition({ groups: MARGIN_GT_1000, logicOperator: "and" }, ctx)
    ).toBe(false)
    expect(evaluateOperator(null, "is_empty", null)).toBe(true)
  })
})
