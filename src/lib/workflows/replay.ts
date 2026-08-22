/**
 * THE REPLAY DECISION AND THE REPLAY ARGUMENTS — WFOPS-01's two pure halves.
 *
 * WHY A SIBLING MODULE AND NOT THE SERVER ACTION. Two questions decide whether WFOPS-01 is
 * satisfied or broken — "may this run be replayed" and "what does its replacement run look like" —
 * and both of them are pure. Left inline they would live in an async server action that opens a
 * database connection, and neither claim would be assertable: the failed-only rule and the
 * verbatim-trigger-data rule would be true only by inspection. 41-VALIDATION.md Wave 0 names
 * `__tests__/replay.test.ts` with no module under test; this is that module.
 *
 * NO RUNTIME DATABASE IMPORT. The only imports here are TYPES, erased at compile time. The
 * predicate is also read by the run detail page, and this module must stay cheap enough that
 * importing it never drags drizzle or `pg` anywhere.
 *
 * EVERY FUNCTION IS TOTAL: it returns a valid value for any input and NEVER throws. `isRunReplayable`
 * is handed a `status` column typed `WorkflowStatus` by drizzle but written by an older engine
 * version in practice, and `buildReplayRunInput` is handed a `trigger_data` jsonb blob no type
 * system has ever checked.
 *
 * THE DIVISION OF LABOUR, which the tests assert anti-vacuously: `isRunReplayable` AUTHORIZES and
 * `buildReplayRunInput` CONSTRUCTS, and the second never calls the first. Plan 41-11's server action
 * checks the predicate, then builds, then calls `createWorkflowRun` — so the check has exactly one
 * home and cannot be duplicated into two that drift.
 */
import type { TriggerEnvelope } from "@/lib/triggers/types"

/**
 * MAY THIS RUN BE REPLAYED? Exactly `"failed"`, and nothing that merely resembles it.
 *
 * 41-CONTEXT: "Only `failed` runs are replayable. Cancelled and completed runs get no replay
 * control." Note the schema has no `cancelled` member at all (`src/db/schema/workflows.ts:29` is
 * `"pending" | "running" | "completed" | "failed" | "waiting"`), so the rule reduces to a single
 * strict equality rather than a deny-list — which is the safer shape anyway: a sixth status added
 * to the union later is non-replayable by default instead of accidentally admitted.
 *
 * `unknown` rather than `WorkflowStatus` in the signature is deliberate. The drizzle type is a
 * `$type<>()` assertion over a `text` column, not a check constraint, so it is a claim about what
 * the writers do and not about what the column holds. A predicate that could be handed a row from
 * before the union existed must be total.
 *
 * NO CONSTANT IS EXPORTED FOR THE LITERAL, and that is on purpose. UI-SPEC gate G-6 was reshaped
 * into this repo's `enclosingConditional` source-scan idiom, which requires the render site to be
 * written literally `{run.status === "failed" && ( … )}`. A `REPLAYABLE_RUN_STATUS` constant would
 * make that scan unsatisfiable while changing nothing about the behaviour, so the expression here is
 * written to match the render site character for character instead. A divergence between the two
 * would render a replay button the server action then refuses.
 */
export function isRunReplayable(status: unknown): boolean {
  return status === "failed"
}

/**
 * The arguments a replay hands to `createWorkflowRun`, as a NAMED contract.
 *
 * It exists so plan 41-11's `replayWorkflowRun` destructures names rather than passing positional
 * arguments into `createWorkflowRun(workflowId, triggerEnvelope, depth)` — where the first and third
 * are both plausible-looking values and the second is an opaque blob.
 *
 * `replayedFromRunId` is not one of `createWorkflowRun`'s parameters today; plan 41-11 adds the
 * options bag that carries it. It lives in this interface because it is part of what a replay IS,
 * not part of how it is inserted.
 */
export interface ReplayRunInput {
  workflowId: string
  triggerEnvelope: TriggerEnvelope
  depth: number
  replayedFromRunId: string
}

/** The origin run, narrowed to the four columns a replay reads. */
export interface ReplayOrigin {
  id: string
  workflowId: string
  status: string
  triggerData: unknown
}

/**
 * THE ENVELOPE A REPLAY CARRIES WHEN THE ORIGIN CARRIED NONE.
 *
 * `workflow_runs.trigger_data` is nullable, and rows written before the envelope shape settled can
 * hold `null`. This is the substitute, and `{}` rather than a fabricated envelope for a measured
 * reason: `engine.ts:157-158` reads the blob as
 * `(run.triggerData as Record<string, unknown>)?.trigger_type ?? "unknown"` and `?.data ?? {}`, so
 * `{}` and `null` are byte-for-byte equivalent at the ONLY place the engine reads it. Synthesising
 * `{ trigger_type: "manual", trigger_id: "replay", timestamp: … }` would instead assert a trigger
 * that never happened, and a real `timestamp` would make this module's functions impure.
 *
 * Frozen, because it is shared by every replay of every envelope-less run. Exported so plan 41-11
 * does not have to guess the value or re-derive it.
 *
 * The cast is the one place this module lies to the type system, and it is confined here: an empty
 * object is not a `TriggerEnvelope`, but `createWorkflowRun` immediately casts its parameter to
 * `Record<string, unknown>` for the insert, so the type is documentation at that boundary rather
 * than a checked contract.
 */
export const EMPTY_REPLAY_ENVELOPE = Object.freeze({}) as TriggerEnvelope

/**
 * WHAT THE REPLACEMENT RUN LOOKS LIKE. Construction only — it does not authorize.
 *
 * Call `isRunReplayable` first. This function deliberately does NOT consult it: authorization has
 * exactly one home, in plan 41-11's server action, which also re-scopes the origin lookup by both
 * `runId` and `workflowId`. A construction function that returned `null` for a non-failed run would
 * make that check look redundant and invite its removal, leaving the render-site check — which is a
 * client-side check — as the only gate (T-41-11). The unit gate asserts this anti-vacuously.
 *
 * WHY `depth` IS 0. `depth` bounds ONE automated cascade — a run writes a CRM record, a matcher sees
 * it, that starts a run, at most `MAX_RECURSION_DEPTH` (5) levels deep. A replay is not a level of
 * that cascade; it is a human pressing a button, and it gets the same fresh budget a manual trigger
 * gets. There is no replay→replay cycle to bound, because no node type can invoke a server action.
 *
 * AND THE CONSTRAINT THIS MODULE MUST NOT TAKE ON: `replayedFromRunId` is DIAGNOSTIC, never a guard.
 * Do not add a chain-length check here or anywhere. Walking the chain needs a recursive query per
 * replay, and no bound is principled for a human-driven action — resetting `depth` to 0 means the
 * recursion guard cannot see the chain, which is precisely why the column exists (T-41-12).
 *
 * THE TRIGGER ENVELOPE IS THE SAME REFERENCE, ON PURPOSE. 41-CONTEXT: "The replay carries the
 * original `triggerData` verbatim". A `structuredClone` or JSON round-trip is exactly the
 * normalisation that forbids — it re-encodes values, drops `undefined`, and throws on a
 * non-cloneable blob, which would cost this function its totality. The caller must therefore treat
 * the returned envelope as read-only; it is handed straight to `createWorkflowRun`, which only
 * serialises it.
 */
export function buildReplayRunInput(origin: ReplayOrigin): ReplayRunInput {
  const triggerEnvelope =
    origin.triggerData === null || origin.triggerData === undefined
      ? EMPTY_REPLAY_ENVELOPE
      : (origin.triggerData as TriggerEnvelope)

  return {
    workflowId: origin.workflowId,
    triggerEnvelope,
    depth: 0,
    replayedFromRunId: origin.id,
  }
}
