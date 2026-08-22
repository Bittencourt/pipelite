/**
 * THE WFOPS-01 FAILED-ONLY GATE — `isRunReplayable` and `buildReplayRunInput`.
 *
 * 41-CONTEXT locks two sentences that this file is the only place asserting:
 *
 *   (a) "Only `failed` runs are replayable. Cancelled and completed runs get no replay control."
 *       So `isRunReplayable` matches EXACTLY the lowercase literal — no case folding, no trimming,
 *       and the four other `WorkflowStatus` members are asserted false as a LOOP over
 *       `VALID_RUN_STATUSES`, so a sixth status added to the schema later cannot quietly default to
 *       replayable.
 *   (b) "The replay carries the original `triggerData` verbatim, with `depth` reset to 0."
 *       So the envelope is asserted by deep equality AND by identity, and `depth` is asserted to be
 *       the NUMBER zero rather than `"0"` or `undefined`.
 *
 * AND ONE ANTI-VACUITY PROPERTY, which is why the file is longer than those two claims need:
 * `buildReplayRunInput` does NOT consult `isRunReplayable`. Authorization is the server action's
 * job (plan 41-11 calls the predicate BEFORE this), and a construction function that silently
 * returned `null` for a non-failed run would make that check look redundant and invite its removal
 * — leaving the render-site check as the only gate, which is a client-side gate (T-41-11).
 *
 * Every test here is a pure-function test with no database and no mock, and the last describe block
 * asserts that structurally (T-41-10).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, it, expect } from "vitest"

import { VALID_RUN_STATUSES } from "../runs-filter"
import { EMPTY_REPLAY_ENVELOPE, buildReplayRunInput, isRunReplayable } from "../replay"

const ORIGIN_RUN_ID = "run-0000-origin"
const WORKFLOW_ID = "wf-0000-parent"

/** A trigger envelope shaped exactly as `createWorkflowRun` wrote it on the original run. */
function envelope(overrides: Record<string, unknown> = {}) {
  return {
    trigger_type: "crm_event",
    trigger_id: "trg-0001",
    timestamp: "2026-08-01T10:00:00.000Z",
    data: { entity: "deal", entityId: "deal-0001", record: { amount: 1000 } },
    ...overrides,
  }
}

function origin(overrides: Partial<Parameters<typeof buildReplayRunInput>[0]> = {}) {
  return {
    id: ORIGIN_RUN_ID,
    workflowId: WORKFLOW_ID,
    status: "failed",
    triggerData: envelope(),
    ...overrides,
  }
}

// -------------------------------------------------------------------------------------------------
// isRunReplayable — WFOPS-01's whole authorization question.
// -------------------------------------------------------------------------------------------------

describe("isRunReplayable — exactly `failed`, and nothing that merely looks like it", () => {
  const CONTEXT_QUOTE =
    "41-CONTEXT: \"Only `failed` runs are replayable. Cancelled and completed runs get no replay " +
    "control.\" This predicate is the SAME strict equality the run detail page's render site uses, " +
    "so a divergence renders a replay button the server action then refuses."

  it("admits a failed run", () => {
    expect(isRunReplayable("failed"), CONTEXT_QUOTE).toBe(true)
  })

  it.each(VALID_RUN_STATUSES.filter((status) => status !== "failed").map((status) => [status]))(
    "refuses %s — asserted as a loop over VALID_RUN_STATUSES minus failed",
    (status) => {
      expect(isRunReplayable(status), CONTEXT_QUOTE).toBe(false)
    },
  )

  it("refuses `completed` by name, because that is the case CONTEXT calls out", () => {
    expect(isRunReplayable("completed"), CONTEXT_QUOTE).toBe(false)
  })

  it("covers every schema status: the loop above plus `failed` is the whole union", () => {
    // Anti-vacuity for the loop: if VALID_RUN_STATUSES shrank, the loop would silently assert less.
    expect(VALID_RUN_STATUSES).toHaveLength(5)
    expect(VALID_RUN_STATUSES.filter((status) => isRunReplayable(status))).toEqual(["failed"])
  })

  it.each([
    ["cancelled", "not a status this schema has at all, but CONTEXT names it"],
    ["Failed", "title case — no case folding"],
    ["FAILED", "upper case"],
    [" failed", "leading space — no trimming"],
    ["failed ", "trailing space"],
    ["failed\n", "a trailing newline"],
    ["fail", "a prefix"],
    ["failed_retry", "a superstring"],
    ["__proto__", "the prototype-pollution probe"],
    ["constructor", "the other one"],
    ["", "the empty string"],
  ])("refuses %o (%s)", (status) => {
    expect(isRunReplayable(status), CONTEXT_QUOTE).toBe(false)
  })

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["the number zero", 0],
    ["the number one", 1],
    ["true", true],
    ["an empty object", {}],
    ["an object claiming to be failed", { toString: () => "failed" }],
    ["an array containing failed", ["failed"]],
    ["a Symbol", Symbol("failed")],
    ["a function returning failed", () => "failed"],
  ])("refuses %s without throwing", (_label, status) => {
    expect(() => isRunReplayable(status)).not.toThrow()
    expect(isRunReplayable(status), CONTEXT_QUOTE).toBe(false)
  })
})

// -------------------------------------------------------------------------------------------------
// buildReplayRunInput — the arguments for `createWorkflowRun`, and nothing more.
// -------------------------------------------------------------------------------------------------

describe("buildReplayRunInput — depth 0, lineage recorded, trigger data verbatim", () => {
  it("returns exactly the four named fields of ReplayRunInput", () => {
    const result = buildReplayRunInput(origin())

    expect(Object.keys(result).sort()).toEqual([
      "depth",
      "replayedFromRunId",
      "triggerEnvelope",
      "workflowId",
    ])
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  })

  it("carries the origin's workflowId", () => {
    expect(buildReplayRunInput(origin()).workflowId).toBe(WORKFLOW_ID)
  })

  it("resets depth to the NUMBER zero", () => {
    const { depth } = buildReplayRunInput(origin())

    expect(
      depth,
      "41-CONTEXT: depth is reset to 0 so a replay gets a fresh recursion budget of 5, the same as " +
        "a manual trigger. `createWorkflowRun` compares `depth >= MAX_RECURSION_DEPTH`, so a " +
        "string \"0\" would coerce and an undefined would fall through to AsyncLocalStorage.",
    ).toBe(0)
    expect(typeof depth).toBe("number")
    expect(depth).not.toBe("0")
  })

  it("records the ORIGIN run id as replayedFromRunId, not the workflow id", () => {
    const { replayedFromRunId } = buildReplayRunInput(origin())

    expect(
      replayedFromRunId,
      "This column is the ONLY record a replay happened, because depth is reset to 0 and the " +
        "recursion guard cannot see the chain (T-41-12). The two easiest transpositions are the " +
        "workflow id and the NEW run id.",
    ).toBe(ORIGIN_RUN_ID)
    expect(replayedFromRunId).not.toBe(WORKFLOW_ID)
  })

  it("distinguishes id from workflowId even when both are supplied", () => {
    // Anti-vacuity for the assertion above: with distinct fixtures a transposed implementation
    // returns the wrong one, which is exactly what this pins.
    const result = buildReplayRunInput({
      id: "run-AAA",
      workflowId: "wf-BBB",
      status: "failed",
      triggerData: envelope(),
    })

    expect(result.replayedFromRunId).toBe("run-AAA")
    expect(result.workflowId).toBe("wf-BBB")
  })

  it("passes the trigger data through VERBATIM — deep equality", () => {
    const data = envelope()

    expect(
      buildReplayRunInput(origin({ triggerData: data })).triggerEnvelope,
      "41-CONTEXT: \"The replay carries the original `triggerData` verbatim\". No normalisation, no " +
        "re-stamped timestamp, no re-typed trigger_type — the replay must re-run the same input " +
        "that failed, or it is not a replay.",
    ).toEqual(data)
  })

  it("passes the trigger data through VERBATIM — same reference, on purpose", () => {
    const data = envelope()
    const result = buildReplayRunInput(origin({ triggerData: data }))

    // THE ALIASING DECISION, asserted rather than left ambiguous: this function returns the SAME
    // REFERENCE. A structuredClone or JSON round-trip is exactly the "normalisation" the verbatim
    // requirement forbids — it drops `undefined` values, reorders nothing but re-encodes dates, and
    // throws on a non-cloneable blob, which would break totality.
    expect(result.triggerEnvelope).toBe(data)
  })

  it("does not defensively copy, and the caller must therefore not mutate the result", () => {
    // The consequence of the decision above, stated as a test so nobody "fixes" the aliasing
    // without noticing this assertion.
    const data = envelope()
    const result = buildReplayRunInput(origin({ triggerData: data }))

    ;(result.triggerEnvelope as unknown as Record<string, unknown>).trigger_id = "mutated"

    expect(data.trigger_id).toBe("mutated")
  })

  it("preserves an odd but legitimate blob written by an older trigger path", () => {
    const odd = { trigger_type: "webhook", nested: { deep: [1, { two: null }] }, extra: "kept" }
    const result = buildReplayRunInput(origin({ triggerData: odd }))

    expect(result.triggerEnvelope).toEqual(odd)
    expect(result.triggerEnvelope).toBe(odd)
  })

  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("substitutes the frozen empty envelope for a %s triggerData", (_label, triggerData) => {
    const result = buildReplayRunInput(origin({ triggerData }))

    expect(
      result.triggerEnvelope,
      "An origin run whose trigger_data was NULL had no envelope, so the replay has none either. " +
        "`engine.ts:157-158` reads the blob as `(run.triggerData as …)?.trigger_type ?? \"unknown\"` " +
        "and `?.data ?? {}`, so `{}` and NULL are byte-for-byte equivalent at the only place the " +
        "engine reads it — and `{}` is a value `createWorkflowRun`'s TriggerEnvelope parameter " +
        "accepts without the caller inventing a timestamp.",
    ).toBe(EMPTY_REPLAY_ENVELOPE)
    expect(result.triggerEnvelope).toEqual({})
  })

  it("exports the empty envelope as a frozen value, so plan 41-11 need not guess it", () => {
    expect(EMPTY_REPLAY_ENVELOPE).toEqual({})
    expect(Object.isFrozen(EMPTY_REPLAY_ENVELOPE)).toBe(true)
  })

  it.each([
    ["a string", "not-an-envelope"],
    ["a number", 42],
    ["an array", [1, 2, 3]],
    ["false", false],
    ["the empty string", ""],
    ["zero", 0],
  ])("carries a non-object %s through without throwing", (_label, triggerData) => {
    expect(() => buildReplayRunInput(origin({ triggerData }))).not.toThrow()
    expect(buildReplayRunInput(origin({ triggerData })).depth).toBe(0)
  })

  it("does not accept or return a dryRun flag", () => {
    // A caller trying to smuggle one in. It must not appear in the output.
    const smuggled = { ...origin(), dryRun: true }
    const result = buildReplayRunInput(smuggled)

    expect(
      result,
      "A replay is never a dry run: they are separate actions, and conflating them would let a " +
        "replay silently skip the CRM writes the operator is trying to re-run.",
    ).not.toHaveProperty("dryRun")
    expect(Object.keys(result)).not.toContain("dryRun")
  })
})

// -------------------------------------------------------------------------------------------------
// ANTI-VACUITY — construction does not authorize. T-41-11.
// -------------------------------------------------------------------------------------------------

describe("buildReplayRunInput does NOT consult isRunReplayable — construction is not authorization", () => {
  const REASON =
    "Authorization is the server action's job: plan 41-11 calls isRunReplayable BEFORE this. A " +
    "construction function that silently returned null for a non-failed run would make that check " +
    "look redundant and invite its removal, leaving the render-site check — a client-side check — " +
    "as the only gate (T-41-11)."

  it.each(VALID_RUN_STATUSES.map((status) => [status]))(
    "returns a well-formed input for a %s origin",
    (status) => {
      const result = buildReplayRunInput(origin({ status }))

      expect(result, REASON).not.toBeNull()
      expect(result.workflowId, REASON).toBe(WORKFLOW_ID)
      expect(result.depth).toBe(0)
      expect(result.replayedFromRunId).toBe(ORIGIN_RUN_ID)
    },
  )

  it("returns the identical input for a completed origin and a failed one", () => {
    expect(buildReplayRunInput(origin({ status: "completed" }))).toEqual(
      buildReplayRunInput(origin({ status: "failed" })),
    )
  })

  it("is unaffected by a junk status", () => {
    expect(buildReplayRunInput(origin({ status: "__proto__" })).depth).toBe(0)
    expect(buildReplayRunInput(origin({ status: "" })).replayedFromRunId).toBe(ORIGIN_RUN_ID)
  })
})

// -------------------------------------------------------------------------------------------------
// Structural gates: no runtime database import, no active check, no chain-length guard.
// -------------------------------------------------------------------------------------------------

describe("replay.ts structural constraints", () => {
  const source = readFileSync(join(__dirname, "..", "replay.ts"), "utf8")

  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")

  /** Module specifiers paired with whether the statement was TYPE-ONLY. */
  function importSpecifiers(code: string): { specifier: string; typeOnly: boolean }[] {
    const stripped = code
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    const found: { specifier: string; typeOnly: boolean }[] = []
    const patterns: [RegExp, boolean][] = [
      [/(?:^|\n)\s*import\s+type\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g, true],
      [/(?:^|\n)\s*export\s+type\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g, true],
      [/(?:^|\n)\s*import\s+(?!type\s)(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g, false],
      [/(?:^|\n)\s*export\s+(?!type\s)[\s\S]*?\s+from\s+["']([^"']+)["']/g, false],
      [/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, false],
      [/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, false],
    ]

    for (const [pattern, typeOnly] of patterns) {
      for (const match of stripped.matchAll(pattern)) {
        found.push({ specifier: match[1], typeOnly })
      }
    }

    return found
  }

  it("imports only types", () => {
    const specifiers = importSpecifiers(source)

    // Non-empty, or the parser is broken and the assertions below are vacuous.
    expect(specifiers.length).toBeGreaterThan(0)
    expect(specifiers.filter((entry) => !entry.typeOnly)).toEqual([])
  })

  it("has no RUNTIME import that could reach the database", () => {
    const forbidden = [/^@\/db(\/|$)/, /(^|\/)db(\/|$)/, /drizzle/, /^pg$/, /queries/, /^@\/auth$/]

    for (const { specifier, typeOnly } of importSpecifiers(source)) {
      if (typeOnly) continue

      for (const pattern of forbidden) {
        expect(specifier).not.toMatch(pattern)
      }
    }
  })

  it("would notice a runtime db import: the parser finds one in a synthetic source", () => {
    const synthetic = `
      /** A comment mentioning import { db } from "@/db", which must NOT count. */
      import type { TriggerEnvelope } from "@/lib/triggers/types"
      import { db } from "@/db"
    `
    const specifiers = importSpecifiers(synthetic)

    expect(specifiers).toHaveLength(2)
    expect(specifiers).toContainEqual({ specifier: "@/db", typeOnly: false })
  })

  it("contains no dryRun identifier in code — a replay is never a dry run", () => {
    expect(withoutComments).not.toMatch(/dryRun/)
  })

  it("contains no `active` rejection copied from triggerManualRun (Pitfall 8)", () => {
    // The phase goal is "a failed or UNPROVEN workflow". An active check here would make an
    // unactivated workflow un-replayable, which is the population the feature exists for.
    expect(withoutComments).not.toMatch(/\.active/)
    expect(withoutComments).not.toMatch(/workflow_inactive/)
  })

  it("contains no replay-chain-length guard", () => {
    // `replayedFromRunId` is DIAGNOSTIC, never a guard. Walking the chain needs a recursive query
    // per replay, and no bound is principled for a human-driven action.
    expect(withoutComments).not.toMatch(/MAX_REPLAY/)
    expect(withoutComments).not.toMatch(/chainLength/)
  })
})
