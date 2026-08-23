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

import { callArguments, readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

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

// -------------------------------------------------------------------------------------------------
// THE SERVER-ACTION GATE — `src/app/workflows/actions.ts` (plan 41-11).
//
// WHY A SOURCE SCAN AND NOT A UNIT TEST. That module is `"use server"` and imports `@/auth`, so its
// three actions cannot be called from a vitest process. Everything they DECIDE, though, is decidable
// from the source: which gate runs first, whether the origin lookup is scoped by one id or two,
// whether the dry-run flag is a literal or a parameter, and whether the insert goes through
// `createWorkflowRun`. Those are the four claims the threat register (T-41-60, T-41-62, T-41-63,
// T-41-64) hangs on, so they are asserted here rather than left to inspection.
//
// EVERY NEGATIVE ASSERTION IS SCOPED TO ONE FUNCTION'S BODY. A whole-file negative would be both
// unsatisfiable and misleading: `removeHttpTemplate` in the same file legitimately reads a role and
// compares it to `"admin"`, and it is not one of this plan's actions.
// -------------------------------------------------------------------------------------------------

const ACTIONS_PATH = "src/app/workflows/actions.ts"

/**
 * The BODY of `export async function ${name}(…)`, by brace depth and string-aware.
 *
 * Module-private here rather than promoted into `source-scan.ts`, following the precedent that file's
 * header records: the JSX extractors were kept module-private in plan 40-08 and only promoted when a
 * third gate needed them. This is the first consumer of a TypeScript function-body extractor.
 *
 * `elementRegion` cannot do this job — it matches `<tag>…</tag>` — and `callArguments` bounds an
 * argument list, not a body.
 *
 * THE SIGNATURE SHAPE IS ASSERTED, NOT ASSUMED. Between the parameter list's `)` and the body's `{`
 * there must be nothing but `: Promise<NamedResult>`. That is `src/app/duplicates/actions.ts:117-127`'s
 * stated reason for naming its result types — an inline `Promise<{ success: true; … }>` puts a brace
 * in the signature, and a body finder that took "the next `{`" would return the return TYPE and every
 * assertion below would be scoped to three lines of type annotation.
 */
function functionRegion(source: string, name: string): string {
  const marker = `export async function ${name}(`
  const at = source.indexOf(marker)
  if (at === -1) throw new Error(`${ACTIONS_PATH}: no \`${marker}\` in the stripped source`)

  let i = at + marker.length
  let depth = 1
  let quote: string | null = null

  while (i < source.length && depth > 0) {
    const ch = source[i]

    if (quote) {
      if (ch === "\\") {
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") quote = ch
    else if (ch === "(") depth += 1
    else if (ch === ")") depth -= 1

    i += 1
  }

  if (depth !== 0) throw new Error(`${ACTIONS_PATH}: unterminated parameter list for ${name}`)

  const braceAt = source.indexOf("{", i)
  if (braceAt === -1) throw new Error(`${ACTIONS_PATH}: no body brace for ${name}`)

  const between = source.slice(i, braceAt)
  if (!/^\s*:\s*Promise<[A-Za-z0-9_$]+>\s*$/.test(between)) {
    throw new Error(
      `${ACTIONS_PATH}: ${name}'s return type must be a NAMED result alias (\`): Promise<XResult> {\`), ` +
        `found "${between.trim()}". An inline object literal in the return type puts a brace in the ` +
        `signature, and every region-scoped assertion below would then be scoped to the annotation ` +
        `instead of the body. src/app/duplicates/actions.ts:117-127 names its result types for exactly ` +
        `this reason.`,
    )
  }

  let braceDepth = 1
  let j = braceAt + 1
  quote = null

  while (j < source.length && braceDepth > 0) {
    const ch = source[j]

    if (quote) {
      if (ch === "\\") {
        j += 2
        continue
      }
      if (ch === quote) quote = null
      j += 1
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") quote = ch
    else if (ch === "{") braceDepth += 1
    else if (ch === "}") braceDepth -= 1

    j += 1
  }

  if (braceDepth !== 0) throw new Error(`${ACTIONS_PATH}: unterminated body for ${name}`)

  return source.slice(braceAt + 1, j - 1)
}

/** Does any `and(…)` in `region` scope a lookup by BOTH the run id and the workflow id? */
function scopedByBothIds(region: string): boolean {
  const clauses = callArguments(region, "and")

  return clauses.some(
    (clause) =>
      clause.includes("eq(workflowRuns.id") && clause.includes("eq(workflowRuns.workflowId"),
  )
}

describe("the WFOPS-01 / WFOPS-02 server actions — src/app/workflows/actions.ts", () => {
  const source = readStrippedSource(ACTIONS_PATH)

  const SCOPING_REASON =
    "T-41-60: scoping the origin lookup by runId ALONE lets any authenticated user replay or poll " +
    "any run of any workflow from a guessed or leaked run id. The control already exists and is the " +
    "one to reuse — the run detail page's own predicate at " +
    "src/app/workflows/[id]/runs/[runId]/page.tsx:32, " +
    "`and(eq(workflowRuns.id, runId), eq(workflowRuns.workflowId, id))`."

  const D_A4 =
    "D-A4: auth on these actions is SESSION-ONLY, deliberately not `replayDelivery`'s admin gate. " +
    "Workflows are not owner-scoped in this product (STATE.md), `triggerManualRun` has no role gate, " +
    "and the run detail page renders the replay button to any authenticated user — so a role check " +
    "here would 403 exactly the users the button is rendered to while granting no capability they " +
    "did not already have via manual trigger."

  const NO_HAND_ROLLED_INSERT =
    "T-41-64: `createWorkflowRun` owns the MAX_RECURSION_DEPTH short-circuit. A bespoke " +
    "db.insert(workflowRuns) in an action skips the recursion guard entirely."

  // ANTI-VACUITY for every negative assertion below: if the read failed or the path moved, an empty
  // string would satisfy all of them.
  it("reads a non-empty stripped source containing the pre-existing actions", () => {
    expect(source.length).toBeGreaterThan(500)
    expect(source).toContain("getHttpTemplates")
    expect(source).toContain("use server")
  })

  describe("replayWorkflowRun", () => {
    it("is exported", () => {
      expect(source).toContain("export async function replayWorkflowRun")
    })

    it("checks isRunReplayable BEFORE calling buildReplayRunInput", () => {
      const region = functionRegion(source, "replayWorkflowRun")
      const predicateAt = region.indexOf("isRunReplayable")
      const buildAt = region.indexOf("buildReplayRunInput")

      expect(predicateAt).toBeGreaterThan(-1)
      expect(buildAt).toBeGreaterThan(-1)
      expect(
        predicateAt,
        "The predicate IS the authorization and must run before the construction. Plan 41-02 " +
          "asserted anti-vacuously that buildReplayRunInput does NOT consult the predicate itself, " +
          "precisely so this ordering could not be quietly dropped — leaving the render-site check, " +
          "which is a client-side check, as the only gate (T-41-11).",
      ).toBeLessThan(buildAt)
    })

    it("gates on the session BEFORE any database read", () => {
      const region = functionRegion(source, "replayWorkflowRun")
      const authAt = region.indexOf("auth()")
      const readAt = region.indexOf(".select(")

      expect(authAt).toBeGreaterThan(-1)
      expect(readAt).toBeGreaterThan(-1)
      expect(
        authAt,
        "An unauthenticated caller must learn nothing about which run ids exist — the refusal costs " +
          "zero database reads whatever id is sent.",
      ).toBeLessThan(readAt)
      expect(region).toContain("Not authenticated")
    })

    it("scopes the origin lookup by BOTH workflowRuns.id and workflowRuns.workflowId", () => {
      const region = functionRegion(source, "replayWorkflowRun")

      expect(callArguments(region, "and").length, SCOPING_REASON).toBeGreaterThan(0)
      expect(scopedByBothIds(region), SCOPING_REASON).toBe(true)
    })

    it("contains no role check and no admin literal", () => {
      const region = functionRegion(source, "replayWorkflowRun")

      expect(region.length).toBeGreaterThan(0)
      expect(region.length).toBeLessThan(source.length)
      expect(region, D_A4).not.toContain("session.user.role")
      expect(region, D_A4).not.toContain("admin")
    })

    it("creates the new run through createWorkflowRun and never a hand-rolled insert", () => {
      const region = functionRegion(source, "replayWorkflowRun")

      expect(region, NO_HAND_ROLLED_INSERT).toContain("createWorkflowRun")
      expect(region, NO_HAND_ROLLED_INSERT).not.toContain("db.insert(workflowRuns")
      expect(source, NO_HAND_ROLLED_INSERT).not.toContain("db.insert(workflowRuns")
    })

    it("passes replayedFromRunId and revalidates the runs list", () => {
      const region = functionRegion(source, "replayWorkflowRun")

      expect(region).toContain("replayedFromRunId")
      expect(region).toContain("revalidatePath")
    })

    it("never reads replayedFromRunId in a where clause — the column is diagnostic, not a guard", () => {
      const clauses = callArguments(source, "where")

      // Anti-vacuity: the file has where clauses, so `every` is not quantifying over nothing.
      expect(clauses.length).toBeGreaterThan(0)
      for (const clause of clauses) {
        expect(
          clause,
          "T-41-12: replayedFromRunId is DIAGNOSTIC. Walking the chain needs a recursive query per " +
            "replay and no bound is principled for a human-driven action, so there is no chain " +
            "length check anywhere.",
        ).not.toContain("replayedFromRunId")
      }
      expect(source).not.toContain("MAX_REPLAY")
      expect(source).not.toContain("chainLength")
    })
  })

  describe("startDryRun — the caller-supplied-JSON trust boundary", () => {
    const CLIENT_IS_NOT_A_BOUNDARY =
      "T-41-62: the dialog's own parse is UX feedback, not a trust boundary. A server action is " +
      "reachable by anything that can make an HTTP request, and the browser can post any string it " +
      "likes — including one the client component never saw."

    it("is exported", () => {
      expect(source).toContain("export async function startDryRun")
    })

    it("bounds a region that is neither empty nor the whole file", () => {
      // ANTI-VACUITY for every negative assertion below: a region extraction that silently returned
      // the entire source would let the `active`-absence assertion pass by luck, since
      // `toggleWorkflow` above sets `active` legitimately.
      const region = functionRegion(source, "startDryRun")

      expect(region.length).toBeGreaterThan(0)
      expect(region.length).toBeLessThan(source.length)

      // And the discriminator that makes the scoping meaningful: the FILE does contain `active`
      // (toggleWorkflow sets it), so "the region contains no active check" is a real claim about
      // the region and not a fact about the file.
      expect(source).toContain("active")
    })

    it("re-validates the caller's JSON server-side", () => {
      const region = functionRegion(source, "startDryRun")

      expect(
        /JSON\.parse|safeParse/.test(region),
        CLIENT_IS_NOT_A_BOUNDARY,
      ).toBe(true)
    })

    it("refuses a parsed value that is not a plain object — null, arrays and scalars", () => {
      const region = functionRegion(source, "startDryRun")

      expect(
        region,
        "A bare `typeof x === \"object\"` accepts BOTH null and arrays, and the parsed value reaches " +
          "the engine and then the QuickJS transform sandbox. All four of null, an array, a string " +
          "and a number must be refused.",
      ).toContain("Array.isArray")
      expect(/typeof|\.object\(/.test(region)).toBe(true)
    })

    it("returns two DISTINCT error codes the dialog can map to its two locked strings", () => {
      const region = functionRegion(source, "startDryRun")

      // The dialog renders `dryRun.invalidJson` and `dryRun.notAnObject`, which are different
      // sentences — "check for a missing comma" versus "must be a JSON object with named fields".
      // One shared error would render the wrong advice for one of the two failures.
      expect(region).toContain("invalidJson")
      expect(region).toContain("notAnObject")
    })

    it("sets the dry-run flag SERVER-side as a literal, never from a parameter", () => {
      const region = functionRegion(source, "startDryRun")

      expect(region.replace(/\s+/g, " ")).toContain("dryRun: true")

      const bindings = [...region.matchAll(/dryRun:\s*([A-Za-z0-9_$.!]+)/g)].map(
        (match) => match[1],
      )

      // Anti-vacuity: there IS at least one binding, so `every` is not quantifying over nothing.
      expect(bindings.length).toBeGreaterThan(0)
      for (const bound of bindings) {
        expect(
          bound,
          "T-41-63: dry-run-ness is not an access-control boundary the client may assert. This " +
            "action is the single place it is decided, and the engine independently re-derives it " +
            "from the column on every entry — two controls, neither of them a client claim.",
        ).toBe("true")
      }
    })

    it("does NOT reject an inactive workflow (Pitfall 8)", () => {
      const region = functionRegion(source, "startDryRun")

      expect(
        region,
        "The phase goal is \"a failed or UNPROVEN workflow\". Every other trigger path rejects an " +
          "inactive workflow, correctly — `triggerManualRun` at src/lib/triggers/manual-trigger.ts:38-44 " +
          "is the one being deliberately not copied. Copying it makes an unactivated draft " +
          "untestable, which is the primary use case for a test run.",
      ).not.toContain("workflow.active")
      expect(region).not.toContain("not active")
      expect(region).not.toContain("workflow_inactive")
    })

    it("guards a zero-node workflow", () => {
      const region = functionRegion(source, "startDryRun")

      expect(
        region,
        "engine.ts:143-149 completes a run with zero nodes immediately, so an empty workflow " +
          "produces a green dry run that looks like a pass and proves nothing.",
      ).toContain("nodes")
      expect(region).toContain("length")
    })

    it("goes through createWorkflowRun and never a hand-rolled insert", () => {
      const region = functionRegion(source, "startDryRun")

      expect(region, NO_HAND_ROLLED_INSERT).toContain("createWorkflowRun")
      expect(region, NO_HAND_ROLLED_INSERT).not.toContain("db.insert(workflowRuns")
    })

    it("gates on the session before any database read, with no role check", () => {
      const region = functionRegion(source, "startDryRun")
      const authAt = region.indexOf("auth()")
      const readAt = region.indexOf(".select(")

      expect(authAt).toBeGreaterThan(-1)
      expect(readAt).toBeGreaterThan(-1)
      expect(authAt).toBeLessThan(readAt)
      expect(region, D_A4).not.toContain("session.user.role")
      expect(region, D_A4).not.toContain("admin")
    })
  })

  describe("getWorkflowRunStatus — the poll target", () => {
    it("is exported", () => {
      expect(source).toContain("export async function getWorkflowRunStatus")
    })

    it("gates on the session BEFORE the lookup", () => {
      const region = functionRegion(source, "getWorkflowRunStatus")
      const authAt = region.indexOf("auth()")
      const readAt = region.indexOf(".select(")

      expect(authAt).toBeGreaterThan(-1)
      expect(readAt).toBeGreaterThan(-1)
      expect(
        authAt,
        "getScanProgress's property, copied: the gate precedes the lookup, so a refusal costs zero " +
          "database reads whatever id is sent.",
      ).toBeLessThan(readAt)
    })

    it("scopes its lookup by BOTH ids", () => {
      const region = functionRegion(source, "getWorkflowRunStatus")

      expect(callArguments(region, "and").length, SCOPING_REASON).toBeGreaterThan(0)
      expect(scopedByBothIds(region), SCOPING_REASON).toBe(true)
    })

    it("answers an absent row with success and nulls, not an error", () => {
      const region = functionRegion(source, "getWorkflowRunStatus")

      expect(
        region.replace(/\s+/g, " "),
        "T-41-67: a throwing or erroring poll target makes the dry-run dialog retry forever. An " +
          "absent row is a legal answer — the run may have been pruned — so the poller can stop.",
      ).toContain("success: true, status: null, dryRun: null")
    })

    it("returns no Date across the server-action boundary", () => {
      const region = functionRegion(source, "getWorkflowRunStatus")

      // The dialog only needs terminal-status detection, so the timestamps are not returned at all
      // rather than returned as ISO strings — nothing to serialise is stronger than serialising it.
      expect(region).not.toContain("startedAt")
      expect(region).not.toContain("completedAt")
      expect(region).not.toContain("toISOString")
    })

    it("contains no role check and no admin literal", () => {
      const region = functionRegion(source, "getWorkflowRunStatus")

      expect(region.length).toBeGreaterThan(0)
      expect(region.length).toBeLessThan(source.length)
      expect(region, D_A4).not.toContain("session.user.role")
      expect(region, D_A4).not.toContain("admin")
    })
  })
})
