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

// ---------------------------------------------------------------------------
// Bracket-notation field paths (SC-3, plan 34-12)
//
// 152 of the 169 custom field definitions in the live database (90%) have names
// containing spaces or punctuation, so a dot-only path cannot NAME most fields.
// The fixture below uses real names drawn from that dataset.
//
// resolveFieldPath is shared with actions/interpolate.ts and delay-resolver.ts,
// so the non-regression assertions here matter more than the new capability.
// ---------------------------------------------------------------------------

const REAL_CUSTOM_FIELDS: Record<string, unknown> = {
  "Código Mãe": "TYR-4471",
  "CNPJ / CPF": "12.345.678/0001-90",
  "UUID UC (TYR Core)": "9f3a1c22-4e0b-4f2a-9a1d-7c53b0e1d004",
  "Tem solução de solar?": "Sim",
  "Previsão de início operação": "2026-09-01",
  "E-mail de Contato 1": "contato@tyrenergia.com.br",
  "Consumo Médio em MWh": 1035,
  // A name containing a literal dot — a dot path mis-splits this one.
  "Índice T.U.S.D.": 0.42,
  // Nested value, for mixed bracket-then-dot traversal.
  "Dados Extras": { id: "extra-1", ativo: true },
}

const realCtx = () => makeCtx({ customFields: { ...REAL_CUSTOM_FIELDS } })

describe("resolveFieldPath — bracket notation", () => {
  it('resolves a name with spaces and non-ASCII: customFields["Código Mãe"]', () => {
    expect(
      resolveFieldPath(realCtx(), 'trigger.data.customFields["Código Mãe"]')
    ).toBe("TYR-4471")
  })

  it("accepts single quotes as well as double quotes", () => {
    expect(
      resolveFieldPath(realCtx(), "trigger.data.customFields['CNPJ / CPF']")
    ).toBe("12.345.678/0001-90")
  })

  it("resolves a name containing parentheses", () => {
    expect(
      resolveFieldPath(
        realCtx(),
        'trigger.data.customFields["UUID UC (TYR Core)"]'
      )
    ).toBe("9f3a1c22-4e0b-4f2a-9a1d-7c53b0e1d004")
  })

  it("resolves a name containing a question mark and non-ASCII", () => {
    expect(
      resolveFieldPath(
        realCtx(),
        'trigger.data.customFields["Tem solução de solar?"]'
      )
    ).toBe("Sim")
  })

  it("resolves a name containing a hyphen and a digit", () => {
    expect(
      resolveFieldPath(
        realCtx(),
        'trigger.data.customFields["E-mail de Contato 1"]'
      )
    ).toBe("contato@tyrenergia.com.br")
  })

  it("treats a dot inside brackets as part of the name, where a dot path mis-splits", () => {
    const ctx = realCtx()
    // Bracket-quoted: the dots belong to the name.
    expect(
      resolveFieldPath(ctx, 'trigger.data.customFields["Índice T.U.S.D."]')
    ).toBe(0.42)
    // Dot notation cannot express it — this is the gap being closed.
    expect(
      resolveFieldPath(ctx, "trigger.data.customFields.Índice T.U.S.D.")
    ).toBeUndefined()
  })

  it("resolves a bracket segment followed by a dot segment", () => {
    expect(
      resolveFieldPath(realCtx(), 'trigger.data.customFields["Dados Extras"].id')
    ).toBe("extra-1")
  })

  it("resolves consecutive bracket segments", () => {
    expect(
      resolveFieldPath(
        realCtx(),
        'trigger["data"]["customFields"]["Consumo Médio em MWh"]'
      )
    ).toBe(1035)
  })

  it("resolves a bracket segment at the root of the path", () => {
    expect(resolveFieldPath(realCtx(), '["trigger"]["type"]')).toBe("crm_event")
  })

  it("returns undefined for a bracket key that is absent, without throwing", () => {
    const ctx = realCtx()
    expect(() =>
      resolveFieldPath(ctx, 'trigger.data.customFields["Não Existe"]')
    ).not.toThrow()
    expect(
      resolveFieldPath(ctx, 'trigger.data.customFields["Não Existe"]')
    ).toBeUndefined()
  })

  it("branches a workflow condition on a punctuated custom field name (SC-3)", () => {
    const groups: ConditionGroup[] = [
      {
        operator: "and",
        conditions: [
          {
            fieldPath: 'trigger.data.customFields["Consumo Médio em MWh"]',
            operator: "greater_than",
            value: 1000,
          },
          {
            fieldPath: 'trigger.data.customFields["Tem solução de solar?"]',
            operator: "equals",
            value: "Sim",
          },
        ],
      },
    ]
    expect(
      evaluateCondition({ groups, logicOperator: "and" }, realCtx())
    ).toBe(true)
  })
})

describe("resolveFieldPath — dot-notation non-regression", () => {
  it("resolves every pre-existing dot path shape identically", () => {
    const ctx: ExecutionContext = {
      trigger: { type: "crm_event", data: { deal: { value: 5000 }, customFields: { Margin: 1035 } } },
      nodes: {
        "node-1": { output: { result: "success" }, status: "completed" },
      },
    }
    expect(resolveFieldPath(ctx, "trigger.type")).toBe("crm_event")
    expect(resolveFieldPath(ctx, "trigger.data.deal.value")).toBe(5000)
    expect(resolveFieldPath(ctx, "trigger.data.customFields.Margin")).toBe(1035)
    expect(resolveFieldPath(ctx, "nodes.node-1.output.result")).toBe("success")
    expect(resolveFieldPath(ctx, "nodes.node-1.status")).toBe("completed")
    // Whole-object resolution still works (interpolate.ts JSON-stringifies these).
    expect(resolveFieldPath(ctx, "trigger.data.deal")).toEqual({ value: 5000 })
  })

  it("returns undefined for a missing key and a null intermediate", () => {
    expect(
      resolveFieldPath(makeCtx({}), "trigger.data.nonexistent.field")
    ).toBeUndefined()
    expect(
      resolveFieldPath(makeCtx({ deal: null }), "trigger.data.deal.value")
    ).toBeUndefined()
  })

  it("returns undefined when traversing into a primitive", () => {
    expect(resolveFieldPath(makeCtx(), "trigger.type.nope")).toBeUndefined()
  })

  it("returns undefined for empty and non-string paths without throwing", () => {
    const ctx = realCtx()
    expect(resolveFieldPath(ctx, "")).toBeUndefined()
    expect(resolveFieldPath(ctx, "   ")).toBeUndefined()
    expect(resolveFieldPath(ctx, null)).toBeUndefined()
    expect(resolveFieldPath(ctx, undefined)).toBeUndefined()
    expect(resolveFieldPath(ctx, 42 as unknown as string)).toBeUndefined()
  })

  it("keeps empty dot segments resolving to undefined as before", () => {
    const ctx = realCtx()
    expect(resolveFieldPath(ctx, "trigger..type")).toBeUndefined()
    expect(resolveFieldPath(ctx, "trigger.type.")).toBeUndefined()
  })
})

describe("resolveFieldPath — malformed paths return undefined, never throw", () => {
  const MALFORMED = [
    'trigger.data.customFields["oops', // unterminated bracket
    "trigger.data.customFields['oops", // unterminated, single quote
    "trigger.data.customFields[]", // empty bracket
    'trigger.data.customFields[""]', // empty name
    "trigger.data.customFields[oops]", // unquoted content
    "trigger.data.customFields[\"oops']", // mismatched quotes
    'trigger.data.customFields["oops"', // missing closing bracket
    'trigger.data.customFields["oops"]junk', // trailing junk after ]
    "trigger.data.customFields[", // dangling open bracket
    "[", // bare open bracket
    "]", // bare close bracket
  ]

  it.each(MALFORMED)("returns undefined for %j without throwing", (path) => {
    const ctx = realCtx()
    expect(() => resolveFieldPath(ctx, path)).not.toThrow()
    expect(resolveFieldPath(ctx, path)).toBeUndefined()
  })
})

describe("resolveFieldPath — prototype keys are not resolvable (T-34-21)", () => {
  const PROTO_PATHS = [
    "trigger.data.__proto__",
    'trigger.data["__proto__"]',
    'trigger.data.customFields["__proto__"]',
    "trigger.data.constructor",
    'trigger.data["constructor"]',
    'trigger.data.constructor["prototype"]',
    "trigger.data.customFields.prototype",
  ]

  it.each(PROTO_PATHS)("returns undefined for %j", (path) => {
    expect(resolveFieldPath(realCtx(), path)).toBeUndefined()
  })

  it("does not expose inherited properties as field values", () => {
    expect(
      resolveFieldPath(realCtx(), 'trigger.data["__proto__"]["polluted"]')
    ).toBeUndefined()
  })
})

describe("resolveFieldPath — parsing is linear, not backtracking (T-34-20)", () => {
  const pathologicalPaths = (n: number) => [
    "trigger.data" + '["a"]'.repeat(n),
    'trigger.data.customFields["' + "a".repeat(n * 10), // unterminated
    "trigger." + "a.".repeat(n) + "b",
    'trigger.data["' + '"'.repeat(n) + '"]',
  ]

  it("does not throw and resolves undefined on pathological paths", () => {
    const ctx = realCtx()
    for (const path of pathologicalPaths(20000)) {
      expect(() => resolveFieldPath(ctx, path)).not.toThrow()
      expect(resolveFieldPath(ctx, path)).toBeUndefined()
    }
  })

  // A ReDoS regression shows up as super-linear growth, so assert on the SCALING
  // ratio rather than an absolute wall-clock budget. An absolute threshold is
  // flaky: it passes on an idle machine and fails under parallel suite load
  // (observed at 125ms against a 100ms limit).
  //
  // The ratio is NOT automatically load-independent, and an earlier version of this
  // test claimed it was. It compared a 4x input span against a 10x threshold, which
  // fails under vitest's own parallel workers — measured at 11.9x, 13.34x and 15.6x
  // on three separate occasions while passing in isolation every time. The reason is
  // arithmetic, not luck: 4x input predicts 4x for linear and 16x for quadratic, so a
  // 10x threshold sits only 2.5x above the linear prediction, and observed jitter
  // exceeded that. At 15.6x, ordinary scheduler noise was landing ABOVE quadratic's
  // own prediction — the signal and the noise had no separation left.
  //
  // Widening the input span fixes it by pushing the two predictions apart. 16x input
  // predicts 16x for linear and 256x for quadratic. Both windows are also large
  // enough that real work dominates the ~0.9ms of fixed overhead that made the old
  // 4000-element measurement mostly constant.
  //
  // Measured on this machine 2026-08-17: 13.8x idle, 21.0x with the full 85-file
  // suite running concurrently. The 80x threshold therefore keeps ~3.8x of headroom
  // over the worst observed load figure while staying ~3.2x below the quadratic
  // prediction it exists to catch.
  it("scales linearly, not quadratically, with path length", () => {
    const ctx = realCtx()
    const time = (n: number) => {
      const paths = pathologicalPaths(n)
      // Best-of-5 to damp scheduler noise and JIT warm-up.
      let best = Infinity
      for (let run = 0; run < 5; run++) {
        const start = performance.now()
        for (const path of paths) resolveFieldPath(ctx, path)
        best = Math.min(best, performance.now() - start)
      }
      return best
    }

    time(2000) // warm-up, discarded
    // The floor is kept from the original test and still earns its place: it cannot bind in
    // practice (n=8000 measures ~0.95ms here, twenty times the floor), but without it a single
    // near-zero reading under an extreme scheduler stall would make the ratio Infinity and fail
    // the test spuriously. Raised from the original 0.5 to 0.05 because 0.5 was half of a real
    // measurement at the OLD n=4000 and would have distorted the ratio at this larger n.
    const small = Math.max(time(8000), 0.05)
    const large = time(128000) // 16x the input

    expect(large / small).toBeLessThan(80)
  })
})
