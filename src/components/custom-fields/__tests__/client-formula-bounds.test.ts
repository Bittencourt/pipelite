/**
 * CFUI-05 gate — the browser evaluator must carry the SAME QuickJS resource bounds the server
 * passes.
 *
 * `evaluateFormula`'s bound is an opt-in 4th argument and is completely INERT unless passed.
 * Phase 34's D-18 passes it on every server call site (and guards that with
 * `formula-recalc.test.ts`), but the browser call sites passed nothing — so one admin-authored
 * `while(true)` pins every viewer's tab. Because the expression blocks synchronously inside WASM,
 * nothing outside the sandbox can interrupt it; the interrupt handler is the only lever.
 *
 * Two independent gates, deliberately:
 *  1. a call-site COUNT gate, so a future unbounded browser call site fails CI rather than
 *     silently reintroducing the hang;
 *  2. a behavioural gate proving the bound actually terminates a runaway expression.
 *
 * The bound constants live in `formula-engine.ts` (client-safe) and are re-exported by
 * `formula-recalc.ts`, so `formula-recalc.test.ts`'s existing 8 MiB / 500 ms assertions are the
 * drift alarm for BOTH sides (threat T-44-13).
 */
import { describe, it, expect, vi } from "vitest"

// `formula-recalc` imports `@/db`; the re-exported constants do not touch it.
vi.mock("@/db", () => ({ db: {} }))

import {
  evaluateFormula,
  FORMULA_EVAL_MEMORY_LIMIT_BYTES,
  FORMULA_EVAL_OPTIONS,
  FORMULA_EVAL_TIMEOUT_MS,
} from "@/lib/formula-engine"
import {
  FORMULA_EVAL_MEMORY_LIMIT_BYTES as RECALC_MEMORY_LIMIT_BYTES,
  FORMULA_EVAL_TIMEOUT_MS as RECALC_TIMEOUT_MS,
} from "@/lib/formula-recalc"
import { callArguments, readStrippedSource, stripComments } from "./source-scan"

/** Every browser-side module that reaches the QuickJS sandbox directly. */
const BROWSER_EVALUATOR_SOURCES = [
  "src/components/custom-fields/formula-field.tsx",
  "src/components/custom-fields/formula-editor.tsx",
] as const

describe("shared resource bounds (T-44-13)", () => {
  it("declares the bounds in the client-safe module", () => {
    expect(FORMULA_EVAL_MEMORY_LIMIT_BYTES).toBe(8 * 1024 * 1024)
    expect(FORMULA_EVAL_TIMEOUT_MS).toBe(500)
    expect(FORMULA_EVAL_OPTIONS).toEqual({
      memoryLimitBytes: 8 * 1024 * 1024,
      timeoutMs: 500,
    })
  })

  it("keeps them importable from formula-recalc, at identical values", () => {
    // formula-recalc.test.ts imports these from @/lib/formula-recalc and pins their values; the
    // move to formula-engine must not break that import or change what it sees.
    expect(RECALC_MEMORY_LIMIT_BYTES).toBe(FORMULA_EVAL_MEMORY_LIMIT_BYTES)
    expect(RECALC_TIMEOUT_MS).toBe(FORMULA_EVAL_TIMEOUT_MS)
  })

  it("keeps formula-engine client-safe (no @/db in its import graph)", () => {
    // The whole point of hosting the constants here: a client component must be able to import
    // them. A `@/db` import would drag the server-only Postgres client into the browser bundle.
    const source = readStrippedSource("src/lib/formula-engine.ts")
    expect(source).not.toMatch(/["']@\/db/)
  })
})

describe("browser evaluator call sites are bounded (CFUI-05 / T-44-12)", () => {
  it.each(BROWSER_EVALUATOR_SOURCES)("%s bounds every evaluateFormula call", (path) => {
    const calls = callArguments(readStrippedSource(path), "evaluateFormula")
    const unbounded = calls.filter((args) => !args.includes("FORMULA_EVAL_OPTIONS"))

    expect(calls.length, `${path} has no evaluateFormula call site — did the file move?`)
      .toBeGreaterThan(0)
    expect(
      unbounded,
      `${path} calls evaluateFormula without FORMULA_EVAL_OPTIONS; the bound is inert unless ` +
        `passed, so a runaway admin-authored formula would pin the user's tab`
    ).toEqual([])
  })

  it("has at least one bounded browser call site overall", () => {
    const all = BROWSER_EVALUATOR_SOURCES.flatMap((path) =>
      callArguments(readStrippedSource(path), "evaluateFormula")
    )
    const bounded = all.filter((args) => args.includes("FORMULA_EVAL_OPTIONS"))

    expect(all.length).toBeGreaterThan(0)
    expect(bounded.length).toBe(all.length)
  })

  it("does not count a comment as a bounded call site", () => {
    // Guards the gate itself: prose mentioning FORMULA_EVAL_OPTIONS must not satisfy it.
    const decoy = `
      // evaluateFormula(expr, values, undefined, FORMULA_EVAL_OPTIONS)
      /* evaluateFormula(expr, values) */
      const x = evaluateFormula(expr, values)
    `
    const calls = callArguments(stripComments(decoy), "evaluateFormula")
    expect(calls).toEqual(["expr, values"])
  })
})

describe("the bounds actually terminate a runaway expression (T-44-12)", () => {
  it(
    "interrupts a non-terminating expression under FORMULA_EVAL_OPTIONS",
    { timeout: 30000 },
    async () => {
      // PRECONDITION, and not a formality: if FORMULA_EVAL_OPTIONS is missing or carries no
      // timeout, the evaluation below does not fail — it wedges the vitest worker permanently,
      // because a `while(true)` blocks the event loop inside synchronous WASM and even the
      // runner's own timeout cannot fire. Verified by observation while writing this gate.
      // Assert the bound is real BEFORE entering the sandbox, so a regression fails fast.
      expect(FORMULA_EVAL_OPTIONS?.timeoutMs).toBeGreaterThan(0)
      expect(Number.isFinite(FORMULA_EVAL_OPTIONS?.timeoutMs)).toBe(true)

      // Same shape as the server-side case in `src/lib/formula-engine.test.ts` — the
      // `interrupts a non-terminating expression instead of hanging` test — but with the exact
      // options object the browser call sites now pass. Named by test rather than by line: that
      // file's line numbers shifted in the same commit that wrote this comment, and a stale
      // file:line pointer is the small lie that costs the next reader an hour.
      const result = await evaluateFormula(
        "LOGIC.if(true, (function(){ while(true){} })(), 0)",
        {},
        undefined,
        FORMULA_EVAL_OPTIONS
      )

      // Resolving at all is the assertion; without the bound this never returns.
      //
      // An elapsed-time assertion used to sit on the next line, bounding this at 15 000 ms. It was
      // DELETED rather than retuned (QG-01 / SC-1b, plan 47-05), for three reasons. It was strictly
      // redundant: `expect(result).toBeDefined()` already carries the whole property, because
      // without the bound this call never returns at all. It was measured at 543 ms idle and 560 ms
      // at 3x CPU oversubscription, so it was never near its threshold. And 15 000 ms is TIGHTER
      // than this test's own `{ timeout: 30000 }`, which made it the thing that would fire first
      // under load — an assertion whose failure mode is the machine's contention rather than the
      // code's behaviour. The `{ timeout: 30000 }` above stays: it is a liveness backstop against a
      // hang, and this repository's stated boundary permits that while forbidding the assertion.
      // `src/lib/__tests__/suite-timing-hygiene.test.ts` enforces it suite-wide.
      expect(result).toBeDefined()
    }
  )

  it("still evaluates a normal expression under the same options", async () => {
    const result = await evaluateFormula("{{A}} + 1", { A: 41 }, undefined, FORMULA_EVAL_OPTIONS)
    expect(result.value).toBe(42)
    expect(result.error).toBeNull()
  })
})
