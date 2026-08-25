import { readFileSync } from "node:fs"
// Aliased, not the house `import path from "node:path"`: this file's subject is
// FIELD PATHS, and `path` is a parameter name in a dozen places below. A
// module-level binding of that name would be shadowed everywhere it is used and
// visible only where it is not.
import { join as joinPath } from "node:path"

import { describe, it, expect } from "vitest"
import ts from "typescript"
import {
  resolveFieldPath,
  tokenizeFieldPath,
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

  /**
   * THE COUNTED HALF (QG-01 SC-2, phase 47 plan 04).
   *
   * WHAT USED TO BE HERE, AND WHY IT IS NOT COMING BACK. Until this plan the
   * property above was defended by dividing two best-of-5 elapsed-clock windows
   * measured across a 16x input span and comparing the quotient to a threshold of
   * 80, under a 23-line comment arguing that a RATIO of elapsed times is
   * load-independent in a way an absolute budget is not. It is not. Measured at 3x
   * CPU oversubscription with a CORRECT implementation the quotient reached **52.5
   * against its 80 threshold — 79.9% of budget consumed by scheduler contention
   * alone** (47-02-SUMMARY.md), one contention step from a red that would have
   * said nothing whatever about the parser.
   *
   * THE OLD ASSERTION IS DESCRIBED HERE BUT NEVER SPELLED. Its exact tokens —
   * the clock-reading call, the matcher and its threshold, the quotient
   * expression — are deliberately absent from this file, and the plan's
   * acceptance check counts each of them and requires ZERO. Two reasons. First,
   * prose that spells a banned construct is indistinguishable from the construct
   * to every scanner in this repository, and plan 47-05 adds a suite-wide gate
   * that counts clock-call sites: the deletion below removes the last two in the
   * repository, and a comment that named them would silently keep the count
   * alive. Second, and this is the Pitfall-9 shape Phase 46 hit twice, prose
   * arguing FOR an elapsed ratio sitting next to a counted gate is what gets the
   * counted gate "fixed" back into a ratio later. Same convention, same reason, as
   * `src/types/__tests__/no-standing-suppressions.test.ts` note (b).
   *
   * 47-CONTEXT rejects that mechanism OUTRIGHT rather than tuning it, and rejects
   * each way of hiding it by name: marking this file serial-only (keeps a timing
   * assertion alive behind a config flag the next parallelisation removes),
   * `retries: 1` (converts a reproducible failure into an invisible one) and a
   * larger threshold (makes the symptom rarer without touching the cause). So the
   * replacement asserts OPERATION COUNTS and ALGORITHMIC SHAPE — deterministic
   * integers that do not move when the machine is busy. There is deliberately no
   * clock reading anywhere in this file any more.
   *
   * WHY A FLOOR AND NOT ONLY A CEILING — the single most important thing here.
   * Catastrophic backtracking happens INSIDE one native `RegExp.prototype.exec`
   * call, so no JS-level counter can observe it. Measured: a regex-backtracking
   * `tokenizeFieldPath` reads **ZERO** counted characters at every input size and
   * therefore PASSES any ceiling, while a hand-written restart-on-failure parser
   * reads 1307 counted characters per input character and fails one. A
   * ceiling-only gate would have shipped green over the worse of the two. The
   * floor catches the regex as an ABSENCE of work; the AST describe below catches
   * it as a SHAPE. Both are required and neither substitutes for the other —
   * negative controls A and B in 47-04-SUMMARY.md record both reds verbatim.
   */
  describe("cost is asserted as counted operations, never as elapsed time", () => {
    /** Everything the counting facade observed about one parse. */
    interface ParseOps {
      /**
       * Characters read THROUGH the counted seam — every `path[i]` plus every
       * span a re-implemented method scanned.
       */
      chars: number
      /** Calls into a re-implemented string method. */
      calls: number
      /**
       * Primitive coercions. Counted SEPARATELY on purpose: a non-zero coercion
       * count next to a zero character count is the signature of a parse that
       * happened inside a native call, which is what makes control A legible
       * instead of mysterious.
       */
      coercions: number
    }

    /**
     * A `Proxy` over a boxed `String` that counts every character the parser
     * actually looks at.
     *
     * `length` is passthrough; numeric index reads are counted one apiece; and
     * `indexOf` / `slice` / `substring` / `charAt` / `split` / `trim` are
     * re-implemented over the raw string so the spans THEY scan are counted too —
     * otherwise a parser could hide an arbitrary amount of work behind one native
     * call. `valueOf` / `toString` / `Symbol.toPrimitive` hand back the raw
     * primitive and bump `coercions`: that is the escape hatch, and the floor is
     * what turns taking it into a failure.
     *
     * The facade lives here and NOT in production code, deliberately. A
     * per-character `counter++` in `tokenizeFieldPath` would be real shipped cost
     * in the workflow hot path.
     */
    function makeCountingPath(raw: string): { path: string; ops: ParseOps } {
      const ops: ParseOps = { chars: 0, calls: 0, coercions: 0 }
      const facade = new Proxy(new String(raw), {
        get(target, key, receiver) {
          if (typeof key === "string") {
            // A numeric index read. Discriminated on the first char code rather
            // than with a regex: this trap runs ~1.5 times per input character,
            // and a regex test per read would cost more than the parse it
            // measures.
            const firstCode = key.charCodeAt(0)
            if (firstCode >= 48 && firstCode <= 57) {
              ops.chars++
              return raw[Number(key)]
            }
            if (key === "length") return raw.length
            if (key === "indexOf") {
              return (needle: string, from = 0) => {
                ops.calls++
                for (let k = Math.max(0, from); k < raw.length; k++) {
                  ops.chars++
                  if (raw[k] === needle) return k
                }
                return -1
              }
            }
            if (key === "slice" || key === "substring") {
              return (start = 0, end = raw.length) => {
                ops.calls++
                ops.chars += Math.max(
                  0,
                  Math.min(raw.length, end) - Math.max(0, start)
                )
                return raw.slice(start, end)
              }
            }
            if (key === "charAt") {
              return (index: number) => {
                ops.calls++
                ops.chars++
                return raw.charAt(index)
              }
            }
            if (key === "split") {
              return (separator: string) => {
                ops.calls++
                ops.chars += raw.length
                return raw.split(separator)
              }
            }
            if (key === "trim") {
              return () => {
                ops.calls++
                ops.chars += raw.length
                return raw.trim()
              }
            }
            if (key === "valueOf" || key === "toString") {
              return () => {
                ops.coercions++
                return raw
              }
            }
          }
          if (key === Symbol.toPrimitive) {
            return () => {
              ops.coercions++
              return raw
            }
          }
          return Reflect.get(target, key, receiver)
        },
      })
      return { path: facade as unknown as string, ops }
    }

    /** One parse through the counted seam. */
    function countParse(path: string) {
      const { path: facade, ops } = makeCountingPath(path)
      const result = tokenizeFieldPath(facade)
      return { ops, result }
    }

    /** The aggregate of several parses, which is the unit the floor applies to. */
    function countAggregate(paths: string[]) {
      let chars = 0
      let calls = 0
      let coercions = 0
      let inputChars = 0
      for (const path of paths) {
        inputChars += path.length
        const { ops } = countParse(path)
        chars += ops.chars
        calls += ops.calls
        coercions += ops.coercions
      }
      return { inputChars, chars, calls, coercions, opsPerChar: chars / inputChars }
    }

    /**
     * Index of the quote storm inside `pathologicalPaths`. It is the one input
     * the parser is SUPPOSED to reject almost immediately (the opening bracket is
     * followed by `""`, an empty key), so it is held out of the aggregate and
     * asserted separately as an early-rejection bound. Pinned by the shape
     * assertion below so a reordering of the generator cannot silently drag it
     * back into the floor.
     */
    const QUOTE_STORM_INDEX = 3

    /**
     * A well-formed long bracket path, added so the traversal set still has four
     * members after the quote storm is held out — and so the aggregate contains
     * one input that is fully VALID, not only malformed ones.
     */
    const wellFormedLongPath = (n: number) =>
      "trigger.data.customFields" + '["Código Mãe"]'.repeat(n)

    /** The paths the parser must walk end to end. The floor applies to their sum. */
    const traversalPaths = (n: number) => [
      ...pathologicalPaths(n).filter((_, index) => index !== QUOTE_STORM_INDEX),
      wellFormedLongPath(n),
    ]

    const quoteStormPath = (n: number) => pathologicalPaths(n)[QUOTE_STORM_INDEX]

    /** `n` for the aggregate floor/ceiling/coercion assertions. */
    const AGGREGATE_N = 2000
    /** The flatness span: 500 -> 8000 is 16x the input. */
    const FLATNESS_SMALL_N = 500
    const FLATNESS_LARGE_N = 8000
    /**
     * `n` and repeat count for the determinism assertion. Measured: 20 repeats of
     * the n=500 aggregate produce ONE distinct integer, 23 730. n stays small here
     * because the claim is about variance, not scale, and the whole block has to
     * stay in the same time order as the assertion it replaced (196 ms).
     */
    const DETERMINISM_N = 500
    const DETERMINISM_REPEATS = 20

    /**
     * FLOOR, in counted characters per input character, over the aggregate.
     * Measured on this tree 2026-08-25: **1.518 counted/char — 94 230 counted
     * characters over 62 073 input characters at n=2000**. 1 is the floor because
     * "the parser looked at every character at least once" is the property, and it
     * is what a regex rewrite fails: control A reads 0.
     *
     * IF THIS GOES RED: re-measure and record the new number in this comment. Do
     * not lower the floor without writing the measurement beside it — a count at
     * or near zero means the work moved inside a native call the facade cannot
     * see, which is the ReDoS shape the gate exists to catch, not a stale bound.
     */
    const MIN_COUNTED_PER_CHAR = 1

    /**
     * CEILING, same aggregate and same units. Measured 1.518 on this tree, so 6
     * leaves 4.0x of headroom for ordinary parser changes while sitting two
     * orders of magnitude below the restart-on-failure backtracker that control B
     * installs (measured 178.9 at n=200 and 1306.9 at n=1600). Any K in [3, 20]
     * separates the two; 6 is research's recommendation.
     *
     * IF THIS GOES RED: the parser started re-scanning. Find the loop that no
     * longer advances monotonically. Raise this only with a fresh measurement
     * recorded here and a reason the extra work is necessary.
     */
    const MAX_COUNTED_PER_CHAR = 6

    /**
     * FLATNESS. Linear cost means ops/char is constant in n; quadratic cost means
     * it grows with n. Measured across the 15.9x span below (15 573 -> 248 073
     * input characters): ops/char 1.5238 -> 1.5166, **growth 0.995 — it
     * DECREASES**. 1.25 is therefore loose by design and still catches a mildly
     * super-linear regression that K=6 would let through. Control B grows 7.3x
     * across an 8x span.
     */
    const MAX_FLATNESS_GROWTH = 1.25

    /**
     * The quote storm is rejected after the opening bracket's empty key, so its
     * cost is a constant, not a function of n. Measured 43 counted characters at
     * both n=2000 and n=64000 — a 32x input span with an identical count. 200
     * leaves room for a parser that validates a little more before rejecting.
     */
    const MAX_EARLY_REJECTION_COUNTED = 200

    it("the facade counts reads, spans and coercions — proven on a known input FIRST", () => {
      // This gates everything below it. A facade that counted nothing would make
      // the ceiling, the flatness bound and the coercion assertion pass forever
      // while the floor became the only live assertion in the block; a facade
      // that never counted a coercion would make `coercions === 0` unfalsifiable.
      const raw = "abcdefghij"

      const indexed = makeCountingPath(raw)
      let readBack = ""
      for (let i = 0; i < indexed.path.length; i++) readBack += indexed.path[i]
      expect(readBack, "index reads must return the real characters").toBe(raw)
      expect(indexed.ops.chars).toBe(10)
      expect(indexed.ops.coercions).toBe(0)

      const scanned = makeCountingPath(raw)
      expect(scanned.path.indexOf("j")).toBe(9)
      expect(scanned.ops.chars, "indexOf must count the span it walked").toBe(10)
      expect(scanned.ops.calls).toBe(1)

      const sliced = makeCountingPath(raw)
      expect(sliced.path.slice(2, 6)).toBe("cdef")
      expect(sliced.ops.chars, "slice must count the span it copied").toBe(4)

      const split = makeCountingPath(raw)
      expect(split.path.split("")).toHaveLength(10)
      expect(split.ops.chars, "split must count the whole string").toBe(10)

      // THE COMPLEMENT of the coercion assertion further down. A native scan
      // takes exactly this exit — one coercion, zero characters — and control A
      // is measured through it. Without this case, `coercions === 0` would be
      // satisfied by a counter that had simply stopped incrementing.
      const coerced = makeCountingPath(raw)
      expect(String(coerced.path)).toBe(raw)
      expect(coerced.ops.coercions).toBeGreaterThan(0)
      expect(coerced.ops.chars).toBe(0)
    })

    it("the counted set is the pathological set, minus the input that is correctly rejected", () => {
      // Anti-vacuity for the input generator itself. Measured per path at n=2000:
      // bracket repeat 1.203 counted/char, unterminated bracket 1.003, dot chain
      // 3.499, well-formed 1.716 — and the QUOTE STORM 0.021 (43 counted over
      // 2016 characters), because it is correctly rejected at the empty key after
      // ~15 characters. Applying the floor to that path would make the
      // gate demand the parser waste work, so it is held out here and bounded
      // separately. If this assertion is red, the hold-out is pointing at the
      // wrong element and the aggregate floor is measuring the wrong thing.
      expect(quoteStormPath(4)).toBe('trigger.data[""""""]')
      expect(tokenizeFieldPath(quoteStormPath(4))).toBeNull()

      const traversal = traversalPaths(4)
      expect(traversal).toHaveLength(4)
      for (const path of traversal) {
        expect(path, "a traversal path must not be an empty-key rejection").not.toContain('""')
      }

      // The flatness span is a real span, measured rather than asserted by the
      // choice of two numbers.
      const smallChars = traversalPaths(FLATNESS_SMALL_N).join("").length
      const largeChars = traversalPaths(FLATNESS_LARGE_N).join("").length
      expect(largeChars).toBeGreaterThanOrEqual(15 * smallChars)
    })

    it(`FLOOR: reads at least ${MIN_COUNTED_PER_CHAR} counted character per input character`, () => {
      const aggregate = countAggregate(traversalPaths(AGGREGATE_N))
      expect(
        aggregate.chars,
        `read ${aggregate.chars} counted characters over ${aggregate.inputChars} input ` +
          `characters (${aggregate.opsPerChar.toFixed(3)}/char). A count at or near ZERO means ` +
          `the parse moved inside a native call the facade cannot see — a regex or a bulk ` +
          `scanner — which is the ReDoS shape this gate exists to catch. Re-measure and record ` +
          `the number in MIN_COUNTED_PER_CHAR's comment; never lower the floor to go green.`
      ).toBeGreaterThanOrEqual(MIN_COUNTED_PER_CHAR * aggregate.inputChars)
    })

    it(`CEILING: reads at most ${MAX_COUNTED_PER_CHAR} counted characters per input character`, () => {
      const aggregate = countAggregate(traversalPaths(AGGREGATE_N))
      expect(
        aggregate.opsPerChar,
        `read ${aggregate.opsPerChar.toFixed(3)} counted characters per input character over ` +
          `${aggregate.inputChars} input characters. The parser started re-scanning: find the ` +
          `loop whose cursor no longer advances monotonically. Raise MAX_COUNTED_PER_CHAR only ` +
          `with a fresh measurement recorded beside it and a reason the extra work is necessary.`
      ).toBeLessThanOrEqual(MAX_COUNTED_PER_CHAR)
    })

    it("FLATNESS: ops per character does not grow across a 16x input span", () => {
      const small = countAggregate(traversalPaths(FLATNESS_SMALL_N))
      const large = countAggregate(traversalPaths(FLATNESS_LARGE_N))
      const growth = large.opsPerChar / small.opsPerChar
      expect(
        growth,
        `ops/char went ${small.opsPerChar.toFixed(3)} -> ${large.opsPerChar.toFixed(3)} ` +
          `(${growth.toFixed(3)}x) as the input went ${small.inputChars} -> ` +
          `${large.inputChars} characters. Linear cost keeps this near 1.0; quadratic cost ` +
          `makes it grow with n. A restart-on-failure parser measured 7.3x across an 8x span.`
      ).toBeLessThanOrEqual(MAX_FLATNESS_GROWTH)

      // WR-03. THE FLOOR AT THE LARGE END, and Rule 1 of this milestone recurring
      // inside the very file that established it: a counting gate needs a floor
      // as well as a ceiling.
      //
      // Growth alone is ceiling-only. If a future parser collapsed to a native
      // scan above some input size, `large.opsPerChar` would be ~0, `growth`
      // would be ~0, and `<= 1.25` would pass — which is exactly the failure this
      // block's own header names at :634-643: "a regex-backtracking
      // tokenizeFieldPath reads ZERO counted characters at every input size and
      // therefore PASSES any ceiling". AGGREGATE_N = 2000 sits BETWEEN
      // FLATNESS_SMALL_N = 500 and FLATNESS_LARGE_N = 8000, so the FLOOR above
      // does not run anywhere at the large end of this span; without this line
      // there is no counted floor at n = 8000 at all.
      //
      // The AST half mitigates the same shape by a different route (a RegExp
      // construction or a `.exec` call is flagged), but that is a different check
      // with different blind spots — see the by-value anchor on
      // FORBIDDEN_BULK_SCANNERS below. Neither half is redundant.
      expect(
        large.opsPerChar,
        `ops/char collapsed to ${large.opsPerChar.toFixed(3)} at the large end of the span ` +
          `(${large.inputChars} input characters). A count at or near ZERO means the parse moved ` +
          `inside a native call the facade cannot see — the ReDoS shape — and the growth ratio ` +
          `beside this assertion PASSES that case, because ~0 / 1.71 is far below any ceiling.`
      ).toBeGreaterThanOrEqual(MIN_COUNTED_PER_CHAR)
    })

    it("EARLY REJECTION: the quote storm costs a constant, independent of n", () => {
      // Worth having in its own right: it says the parser bails out of an invalid
      // key immediately instead of tokenising 64 000 quotes first. Asserted at two
      // values of n so "independent of n" is a measurement rather than a claim.
      const counts: number[] = []
      for (const n of [2000, 64000]) {
        const { ops, result } = countParse(quoteStormPath(n))
        expect(result, "the quote storm must still be rejected").toBeNull()
        counts.push(ops.chars)
      }
      expect(
        counts,
        `the quote storm cost ${counts.join(" then ")} counted characters at n=2000 and ` +
          `n=64000. These must be equal AND bounded: a cost that tracks n means the parser is ` +
          `walking the quotes before rejecting the empty key.`
      ).toEqual([counts[0], counts[0]])
      expect(counts[0]).toBeLessThanOrEqual(MAX_EARLY_REJECTION_COUNTED)
    })

    it(`DETERMINISM: ${DETERMINISM_REPEATS} repeats give exactly ONE integer`, () => {
      // This is the load-independence claim, asserted instead of described. The
      // assertion this block replaced could not make it: two elapsed windows never
      // produce the same number twice.
      const paths = traversalPaths(DETERMINISM_N)
      const distinct = new Set<number>()
      for (let repeat = 0; repeat < DETERMINISM_REPEATS; repeat++) {
        distinct.add(countAggregate(paths).chars)
      }
      expect(
        [...distinct],
        `${DETERMINISM_REPEATS} identical parses produced ${distinct.size} distinct counts ` +
          `(${[...distinct].join(", ")}). A counted gate whose count moves between runs is a ` +
          `timing assertion wearing a different hat.`
      ).toHaveLength(1)
    })

    it("COERCIONS: the parser never coerces the path to a primitive", () => {
      // Zero here plus a non-zero character count is the forward scan. Non-zero
      // here plus a ZERO character count is the regex — control A measured
      // exactly that. The facade self-test above proves this counter can move.
      const aggregate = countAggregate(traversalPaths(AGGREGATE_N))
      expect(
        aggregate.coercions,
        `the path was coerced to a primitive ${aggregate.coercions} times while ` +
          `${aggregate.chars} characters were counted. A coercion hands the whole string to a ` +
          `native call in one step, and everything that call does is invisible to this gate.`
      ).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------
// THE STRUCTURAL HALF of the linearity gate (QG-01 SC-2, phase 47 plan 04).
//
// WHY THIS EXISTS AND WHY IT IS NOT REDUNDANT WITH THE COUNTED HALF ABOVE.
// Catastrophic backtracking happens inside a single native `RegExp.prototype`
// call. Nothing at the JS level can observe it: measured, a regex-backtracking
// `tokenizeFieldPath` reads ZERO counted characters at every input size, n=200
// through n=1600, while burning exponential time. So the counted CEILING passes
// it outright, and the counted FLOOR sees it only as an ABSENCE of work — a true
// signal, but an indirect one. This half sees it as a SHAPE: a regex is
// constructed, or a whole-string scanner is called, inside a function whose
// entire contract is a single forward pass. Both halves are required and neither
// substitutes for the other. Negative control A in 47-04-SUMMARY.md is the
// rewrite that proves it: it fails BOTH of this half's checks AND the counted
// floor, while passing the counted ceiling.
//
// WHY IT HAS TO EXIST AT ALL: the counted half measures `tokenizeFieldPath`
// directly, because `resolveFieldPath` rejects the counting facade at its
// `typeof path !== "string"` guard — correctly, and that guard is not weakened.
// Exporting a previously private parser therefore creates an anti-vacuity debt:
// something must prove the counted function is still the one production uses.
// The delegation assertion below is that proof.
//
// This is one of the repository's first two TypeScript-AST gates. Everything
// around the parse — the raw read that fails collection loudly, the anti-vacuity
// floors, the matcher self-test before the sweep, the `file:line` violation
// collector and the `toEqual([])` assertion form — is copied from
// `src/lib/__tests__/deployment-docs-accuracy.test.ts:239-261` and
// `src/lib/__tests__/node-engines-floor.test.ts:203-241`. Only the parse is new.
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd()

/** The production file this gate reads. Its own source is the subject. */
const SUBJECT_PATH = "src/lib/execution/condition-evaluator.ts"

/** Raw read at module scope, so a wrong path constant fails COLLECTION, loudly. */
function readRepoFile(relativePath: string): string {
  return readFileSync(joinPath(REPO_ROOT, relativePath), "utf8")
}

const subjectSource = readRepoFile(SUBJECT_PATH)

/** What the parse extracted about one named function declaration. */
interface FunctionShape {
  name: string
  /** Every callee in the body, as a bare `identifier` or a `.method`. Sorted, unique. */
  calls: string[]
  /** `file:line: text` for each regex literal and each `new RegExp` in the body. */
  regexes: string[]
  /** Nodes below the body. The anti-vacuity measure of "the parse found real code". */
  bodyNodeCount: number
}

/**
 * The two functions this gate governs. Deliberately NOT every function in the
 * file: `evaluateOperator` implements the `matches_regex` condition operator and
 * therefore contains a `new RegExp` and a `.test` call on purpose. Gating the
 * whole file would either fail on legitimate code or force the forbidden lists to
 * be emptied — and an emptied forbidden list is a gate that cannot fail.
 */
const GATED_FUNCTIONS = ["resolveFieldPath", "tokenizeFieldPath"] as const

/**
 * Whole-string scanners. Any of these inside the two gated functions means an
 * unbounded amount of work is happening inside one native call, where neither the
 * counting facade nor a reviewer can see its cost.
 *
 * `.trim` is deliberately NOT on this list. `resolveFieldPath` calls it once, at
 * `condition-evaluator.ts:100`, on the whole path before tokenising: it is O(len)
 * with no backtracking possible, it is what makes `"   "` resolve to undefined,
 * and the counting facade re-implements it so its span is counted like any other
 * read. Forbidding it would delete a correctness behaviour to satisfy a
 * lint-shaped rule. `.indexOf` is likewise permitted and is in fact REQUIRED by
 * the floor below — it is how the forward scan finds each closing quote, and
 * every call starts at the current cursor.
 */
const FORBIDDEN_BULK_SCANNERS = [
  ".match",
  ".matchAll",
  ".replace",
  ".replaceAll",
  ".search",
  ".split",
  ".test",
  ".exec",
]

/**
 * Parse a TypeScript source STRING and report the shape of every named function
 * declaration in it.
 *
 * Takes a string rather than a path so the fixtures below and the real file go
 * through one code path — the `nodeBaseTags(dockerfileText = dockerfileRaw)` form
 * from `node-engines-floor.test.ts:149`. That is also this file's
 * self-collision mitigation: the KNOWN_POSITIVE fixtures are source strings, so
 * this gate never has to read, or exempt, itself.
 */
function analyseFunctions(
  sourceText: string,
  fileName: string
): Map<string, FunctionShape> {
  const src = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true
  )
  const shapes = new Map<string, FunctionShape>()

  const lineOf = (node: ts.Node) =>
    src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1

  const record = (node: ts.FunctionDeclaration) => {
    if (!node.name || !node.body) return
    const shape: FunctionShape = {
      name: node.name.text,
      calls: [],
      regexes: [],
      bodyNodeCount: 0,
    }
    const callees = new Set<string>()
    const walk = (child: ts.Node) => {
      shape.bodyNodeCount++
      if (ts.isCallExpression(child)) {
        const callee = child.expression
        if (ts.isIdentifier(callee)) callees.add(callee.text)
        else if (ts.isPropertyAccessExpression(callee)) callees.add(`.${callee.name.getText(src)}`)
        else if (ts.isElementAccessExpression(callee)) callees.add(".[computed]")
      }
      const isRegexLiteral = child.kind === ts.SyntaxKind.RegularExpressionLiteral
      const isRegexConstruction =
        ts.isNewExpression(child) &&
        ts.isIdentifier(child.expression) &&
        child.expression.text === "RegExp"
      if (isRegexLiteral || isRegexConstruction) {
        shape.regexes.push(`${fileName}:${lineOf(child)}: ${child.getText(src).trim()}`)
      }
      ts.forEachChild(child, walk)
    }
    ts.forEachChild(node.body, walk)
    shape.calls = [...callees].sort()
    shapes.set(shape.name, shape)
  }

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node)) record(node)
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(src, visit)
  return shapes
}

/**
 * Every structural violation in a source string, as `file:line: text`. An empty
 * array means the parser still has the shape its complexity property depends on.
 */
function structuralViolations(sourceText: string, fileName: string): string[] {
  const shapes = analyseFunctions(sourceText, fileName)
  const violations: string[] = []

  for (const name of GATED_FUNCTIONS) {
    const shape = shapes.get(name)
    if (!shape) {
      violations.push(`${fileName}: function ${name} was not found by the parse`)
      continue
    }
    for (const regex of shape.regexes) {
      violations.push(`${regex}  <- regex constructed inside ${name}`)
    }
    for (const scanner of FORBIDDEN_BULK_SCANNERS) {
      if (shape.calls.includes(scanner)) {
        violations.push(`${fileName}: ${name} calls ${scanner} — a whole-string scanner`)
      }
    }
  }

  const resolve = shapes.get("resolveFieldPath")
  if (resolve && !resolve.calls.includes("tokenizeFieldPath")) {
    violations.push(
      `${fileName}: resolveFieldPath no longer calls tokenizeFieldPath ` +
        `(calls: ${resolve.calls.join(", ") || "none"})`
    )
  }
  return violations
}

describe("resolveFieldPath — the parser's SHAPE is asserted, not only its cost (T-34-20)", () => {
  // -------------------------------------------------------------------------
  // 1. THE CHECKER PROVES ITSELF, ON SOURCE STRINGS, BEFORE IT READS THE FILE.
  // -------------------------------------------------------------------------

  /**
   * Shape A, the realistic ReDoS reintroduction: the bracket grammar expressed as
   * nested quantifiers and handed to the engine one dot-chunk at a time. This is
   * the body negative control A installs for real in `condition-evaluator.ts`.
   */
  const KNOWN_POSITIVE_INLINE_REGEX = `
    export function tokenizeFieldPath(path: string): string[] | null {
      const out: string[] = []
      for (const chunk of String(path).split(".")) {
        const match = /^([^.[]*)((?:\\[(?:"(?:[^"]|"")*"|'(?:[^']|'')*')\\])*)$/.exec(chunk)
        if (match === null) return null
        out.push(match[1])
      }
      return out
    }

    export function resolveFieldPath(context: unknown, p: string): unknown {
      if (typeof p !== "string") return undefined
      let current: unknown = context
      for (const part of p.trim().split(".")) {
        if (current === null || typeof current !== "object") return undefined
        current = (current as Record<string, unknown>)[part]
      }
      return current
    }
  `

  /**
   * The same defect with the regex hoisted to module scope, so the function body
   * contains no regex literal at all. This is why the forbidden-scanner list
   * exists ALONGSIDE the regex check rather than instead of it: here the only
   * evidence inside the body is the `.exec` call.
   */
  const KNOWN_POSITIVE_HOISTED_REGEX = `
    const BACKTRACK_RE = /^([^.[]*)((?:\\[(?:"(?:[^"]|"")*"|'(?:[^']|'')*')\\])*)$/

    export function tokenizeFieldPath(path: string): string[] | null {
      const out: string[] = []
      for (const chunk of path.split(".")) {
        const match = BACKTRACK_RE.exec(chunk)
        if (match === null) return null
        out.push(match[1])
      }
      return out
    }

    export function resolveFieldPath(context: unknown, p: string): unknown {
      const parts = tokenizeFieldPath(p)
      if (parts === null) return undefined
      let current: unknown = context
      for (const part of parts) {
        if (current === null || typeof current !== "object") return undefined
        current = (current as Record<string, unknown>)[part]
      }
      return current
    }
  `

  /** Shaped like the real forward scan. The checker must call this one clean. */
  const KNOWN_NEGATIVE_FORWARD_SCAN = `
    export function tokenizeFieldPath(path: string): string[] | null {
      const segments: string[] = []
      const len = path.length
      let i = 0
      while (i < len) {
        const start = i
        while (i < len && path[i] !== ".") i++
        segments.push(path.slice(start, i))
        if (i < len) i++
      }
      return segments
    }

    export function resolveFieldPath(context: unknown, p: string): unknown {
      if (typeof p !== "string" || p.trim() === "") return undefined
      const parts = tokenizeFieldPath(p)
      if (parts === null) return undefined
      let current: unknown = context
      for (const part of parts) {
        if (current === null || typeof current !== "object") return undefined
        current = (current as Record<string, unknown>)[part]
      }
      return current
    }
  `

  it("reports the EXTRACTED call set and regex list for the inline-regex rewrite, not a boolean", () => {
    const shapes = analyseFunctions(KNOWN_POSITIVE_INLINE_REGEX, "known-positive-inline.ts")

    const tokenize = shapes.get("tokenizeFieldPath")
    expect(tokenize, "the parse must find tokenizeFieldPath in the fixture").toBeDefined()
    expect(tokenize?.regexes).toHaveLength(1)
    expect(tokenize?.regexes[0]).toContain("known-positive-inline.ts:")
    expect(tokenize?.calls).toEqual([".exec", ".push", ".split", "String"])

    const resolve = shapes.get("resolveFieldPath")
    expect(resolve?.regexes).toEqual([])
    expect(resolve?.calls).toEqual([".split", ".trim"])
    expect(
      resolve?.calls,
      "this fixture's resolveFieldPath deliberately does NOT delegate"
    ).not.toContain("tokenizeFieldPath")
  })

  it("calls the inline-regex rewrite violating — on the regex, the scanners AND the lost delegation", () => {
    const violations = structuralViolations(
      KNOWN_POSITIVE_INLINE_REGEX,
      "known-positive-inline.ts"
    )
    const joined = violations.join("\n")
    expect(joined).toContain("regex constructed inside tokenizeFieldPath")
    expect(joined).toContain("tokenizeFieldPath calls .exec")
    expect(joined).toContain("tokenizeFieldPath calls .split")
    expect(joined).toContain("resolveFieldPath calls .split")
    expect(joined).toContain("resolveFieldPath no longer calls tokenizeFieldPath")
  })

  it("catches the hoisted-regex rewrite through the SCANNER list, which is why both checks exist", () => {
    const shapes = analyseFunctions(KNOWN_POSITIVE_HOISTED_REGEX, "known-positive-hoisted.ts")
    // The body itself holds no regex literal — the regex check alone would miss it.
    expect(shapes.get("tokenizeFieldPath")?.regexes).toEqual([])
    expect(shapes.get("tokenizeFieldPath")?.calls).toContain(".exec")

    const joined = structuralViolations(
      KNOWN_POSITIVE_HOISTED_REGEX,
      "known-positive-hoisted.ts"
    ).join("\n")
    expect(joined).toContain("tokenizeFieldPath calls .exec")
    // The delegation IS present in this fixture, so that check must stay quiet. A
    // checker that reported every violation unconditionally would pass the two
    // assertions above (`node-engines-floor.test.ts:332-336`).
    expect(joined).not.toContain("no longer calls tokenizeFieldPath")
  })

  it("calls a forward-scan shape CLEAN — the complement, without which nothing above is evidence", () => {
    const shapes = analyseFunctions(KNOWN_NEGATIVE_FORWARD_SCAN, "known-negative.ts")
    expect(shapes.get("tokenizeFieldPath")?.calls).toEqual([".push", ".slice"])
    expect(shapes.get("resolveFieldPath")?.calls).toEqual([".trim", "tokenizeFieldPath"])
    expect(
      structuralViolations(KNOWN_NEGATIVE_FORWARD_SCAN, "known-negative.ts"),
      "the checker is over-broad; every clean verdict below proves nothing"
    ).toEqual([])
  })

  it("detects `new RegExp` too — proven on this very file's `matches_regex` operator", () => {
    // A LIVE positive control, against real code rather than a fixture.
    // `evaluateOperator` builds a RegExp and calls `.test` on it deliberately, at
    // condition-evaluator.ts:166-167. It is not one of the GATED_FUNCTIONS, so
    // this is evidence the detectors work without being evidence of a defect.
    const operator = analyseFunctions(subjectSource, SUBJECT_PATH).get("evaluateOperator")
    expect(operator, "evaluateOperator must still exist in the subject").toBeDefined()
    expect(operator?.regexes.map((hit) => hit.split(": ")[1])).toEqual([
      "new RegExp(String(compareValue))",
    ])
    expect(operator?.calls).toContain(".test")
  })

  // -------------------------------------------------------------------------
  // 2. THE PARSE REACHED REAL CODE (ANTI-VACUITY). A parse that found nothing
  //    satisfies every negative assertion in section 3 perfectly.
  // -------------------------------------------------------------------------

  /**
   * Floors on the node count below each gated function's body. Measured on this
   * tree 2026-08-25 with this exact walk: **resolveFieldPath 73 nodes,
   * tokenizeFieldPath 226 nodes** (47-RESEARCH's prototype reported 89 and 237 —
   * it counted the body block itself and descended differently; the numbers here
   * are this walk's, re-measured, and are the ones to compare against). The floors sit
   * far below both, deliberately — they exist to fail when the parse stops finding
   * a body at all (a renamed file, a function converted to an arrow const, a
   * `ts.createSourceFile` call that silently produced an empty tree), not to
   * police the implementation's size.
   */
  const MIN_RESOLVE_BODY_NODES = 20
  const MIN_TOKENIZE_BODY_NODES = 50

  const subjectShapes = analyseFunctions(subjectSource, SUBJECT_PATH)

  it("read a non-trivial amount of real source out of the subject file", () => {
    expect(subjectSource.length).toBeGreaterThan(2000)
    expect(subjectSource).toContain("FORBIDDEN_SEGMENTS")
  })

  it("the parse finds a function declaration named resolveFieldPath", () => {
    expect(subjectShapes.get("resolveFieldPath")).toBeDefined()
  })

  it("the parse finds a function declaration named tokenizeFieldPath", () => {
    expect(subjectShapes.get("tokenizeFieldPath")).toBeDefined()
  })

  it(`resolveFieldPath's body holds more than ${MIN_RESOLVE_BODY_NODES} AST nodes`, () => {
    const count = subjectShapes.get("resolveFieldPath")?.bodyNodeCount ?? 0
    expect(
      count,
      `measured 73 when this floor was written; ${count} now. A number near zero means the ` +
        `parse found a declaration with no body, and every assertion below it is vacuous.`
    ).toBeGreaterThan(MIN_RESOLVE_BODY_NODES)
  })

  it(`tokenizeFieldPath's body holds more than ${MIN_TOKENIZE_BODY_NODES} AST nodes`, () => {
    const count = subjectShapes.get("tokenizeFieldPath")?.bodyNodeCount ?? 0
    expect(
      count,
      `measured 226 when this floor was written; ${count} now. Same reasoning as above: this is ` +
        `the forward scan, and it is the largest function in the file.`
    ).toBeGreaterThan(MIN_TOKENIZE_BODY_NODES)
  })

  it("the call extractor still extracts calls — the WR-11 permitted-token floor", () => {
    // Phase 46 WR-11: a scan that floors its verb but not its search token goes
    // green BECAUSE it broke. An extractor that stopped extracting satisfies "no
    // forbidden call" by finding no calls at all, so the tokens the parser
    // legitimately DOES call are asserted present. Measured: .has, .indexOf,
    // .push, .slice.
    const calls = subjectShapes.get("tokenizeFieldPath")?.calls ?? []
    expect(calls, "an empty call set makes the forbidden-scanner check vacuous").not.toEqual([])
    expect(calls, "the forward scan finds each closing quote with indexOf").toContain(".indexOf")
    expect(calls).toContain(".slice")
    expect(subjectShapes.get("resolveFieldPath")?.calls).toContain(".trim")
  })

  // -------------------------------------------------------------------------
  // 3. THE STRUCTURAL ASSERTIONS AGAINST THE REAL FILE.
  // -------------------------------------------------------------------------

  it("resolveFieldPath still delegates to tokenizeFieldPath", () => {
    // The anti-vacuity obligation created by exporting the parser: without this,
    // the counted half could go on measuring a function production had stopped
    // calling, and stay green forever.
    expect(
      subjectShapes.get("resolveFieldPath")?.calls,
      `if this is red, the counted assertions above are measuring dead code. Either restore the ` +
        `delegation, or move the counted gate onto whatever ${SUBJECT_PATH} parses paths with now.`
    ).toContain("tokenizeFieldPath")
  })

  it("neither gated function constructs a regular expression", () => {
    const regexes = GATED_FUNCTIONS.flatMap(
      (name) => subjectShapes.get(name)?.regexes ?? []
    )
    expect(
      regexes,
      `a regex in the field-path parser is a ReDoS surface NO operation counter can see: ` +
        `backtracking happens inside one native call, and a regex rewrite was measured reading ` +
        `ZERO counted characters at every input size. Keep the forward scan.`
    ).toEqual([])
  })

  it("neither gated function calls a whole-string scanner", () => {
    expect(
      structuralViolations(subjectSource, SUBJECT_PATH),
      `the field-path parser must stay a single forward pass. \`.trim\` is permitted (once, ` +
        `O(len), and the counting facade counts its span); the list in FORBIDDEN_BULK_SCANNERS ` +
        `is not. If a scanner is genuinely needed, the counted CEILING is the assertion that has ` +
        `to be re-argued, not this list that has to be shortened.`
    ).toEqual([])
  })
})
