"use server"

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { eq, and } from "drizzle-orm"
import { workflows, workflowRuns } from "@/db/schema/workflows"
import { computeNextRun, getScheduleTrigger } from "@/lib/triggers/schedule-utils"
import type { TriggerConfig, TriggerEnvelope } from "@/lib/triggers/types"
import {
  createWorkflow as createWorkflowMutation,
  updateWorkflow as updateWorkflowMutation,
  deleteWorkflow as deleteWorkflowMutation,
} from "@/lib/mutations/workflows"
import {
  createHttpTemplate,
  deleteHttpTemplate,
  listHttpTemplates,
} from "@/lib/mutations/http-templates"
import type { HttpTemplateRecord } from "@/db/schema/http-templates"
import type { WorkflowStatus } from "@/db/schema/workflows"
import { createWorkflowRun } from "@/lib/triggers/create-run"
import { buildReplayRunInput, isRunReplayable } from "@/lib/workflows/replay"

export async function createWorkflow(data: {
  name: string
  description?: string | null
  triggers?: Record<string, unknown>[]
  nodes?: Record<string, unknown>[]
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const result = await createWorkflowMutation({
    name: data.name,
    description: data.description ?? null,
    triggers: data.triggers ?? [],
    nodes: data.nodes ?? [],
    createdBy: session.user.id,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  revalidatePath("/workflows")
  return { success: true, id: result.id }
}

export async function updateWorkflow(
  id: string,
  data: {
    name?: string
    description?: string | null
    triggers?: Record<string, unknown>[]
    nodes?: Record<string, unknown>[]
    active?: boolean
  }
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const result = await updateWorkflowMutation(id, data)

  if (!result.success) {
    return { success: false, error: result.error }
  }

  revalidatePath("/workflows")
  return { success: true }
}

export async function deleteWorkflow(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const result = await deleteWorkflowMutation(id)

  if (!result.success) {
    return { success: false, error: result.error }
  }

  revalidatePath("/workflows")
  return { success: true }
}

export async function toggleWorkflow(
  id: string,
  active: boolean
): Promise<{ success: true; cancelledRuns: number } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Verify workflow exists
  const existing = await db.select().from(workflows).where(eq(workflows.id, id))
  if (existing.length === 0) {
    return { success: false, error: "Workflow not found" }
  }

  // Update active flag; seed nextRunAt so schedule triggers fire (the
  // schedule processor only claims rows with a non-null nextRunAt <= now)
  const schedule = getScheduleTrigger(
    (existing[0].triggers ?? []) as TriggerConfig[]
  )
  await db
    .update(workflows)
    .set({
      active,
      updatedAt: new Date(),
      nextRunAt: active && schedule ? computeNextRun(schedule.trigger) : null,
    })
    .where(eq(workflows.id, id))

  let cancelledRuns = 0

  // If disabling, cancel all waiting runs
  if (!active) {
    const cancelled = await db
      .update(workflowRuns)
      .set({
        status: "failed",
        error: "Workflow disabled while waiting",
        completedAt: new Date(),
      })
      .where(
        and(
          eq(workflowRuns.workflowId, id),
          eq(workflowRuns.status, "waiting")
        )
      )
      .returning()

    cancelledRuns = cancelled.length
  }

  revalidatePath("/workflows")
  return { success: true, cancelledRuns }
}

export async function importWorkflow(data: {
  name: string
  description?: string | null
  triggers: Record<string, unknown>[]
  nodes: Record<string, unknown>[]
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Check for name conflict
  let finalName = data.name
  const existing = await db
    .select()
    .from(workflows)
    .where(eq(workflows.name, data.name))

  if (existing.length > 0) {
    finalName = `${data.name} (Imported)`
  }

  const result = await createWorkflowMutation({
    name: finalName,
    description: data.description ?? null,
    triggers: data.triggers,
    nodes: data.nodes,
    createdBy: session.user.id,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  revalidatePath("/workflows")
  return { success: true, id: result.id }
}

export async function saveHttpTemplate(data: {
  name: string
  description?: string
  config: Record<string, unknown>
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const result = await createHttpTemplate({
    name: data.name,
    description: data.description ?? null,
    config: data.config,
    createdBy: session.user.id,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  revalidatePath("/workflows")
  return { success: true, id: result.id }
}

export async function removeHttpTemplate(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const isAdmin = (session.user as { role?: string }).role === "admin"

  const result = await deleteHttpTemplate(id, session.user.id, isAdmin)

  if (!result.success) {
    return { success: false, error: result.error }
  }

  revalidatePath("/workflows")
  return { success: true }
}

export async function getHttpTemplates(): Promise<HttpTemplateRecord[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  return listHttpTemplates()
}

// =================================================================================================
// WFOPS-01 / WFOPS-02 — REPLAY AND TEST RUNS. This is the phase's entire trust boundary.
//
// THE AUTH POSTURE IS SESSION-ONLY, AND THAT IS A RECORDED DECISION (D-A4), NOT AN OMISSION.
// `replayDelivery` in src/app/admin/webhooks/actions.ts is the named precedent for the shape of a
// replay action, and its role check is deliberately NOT copied here. The evidence:
//   - the run detail page has no role check at all, and `run-changed-records.tsx:117-120` documents
//     that omission as deliberate — "workflows are not owner-scoped in this product";
//   - STATE.md § Decisions records "Workflows not owner-scoped; all authenticated users can CRUD any
//     workflow";
//   - `triggerManualRun` has no role gate, so a user who can already edit and manually trigger any
//     workflow gains no new capability from replaying one.
// A role gate here would 403 exactly the non-admin users the page renders the button to, for no
// security benefit (T-41-61, accepted).
//
// THE ENUMERATION CONTROL IS THE TWO-ID LOOKUP (T-41-60). Both actions take the workflow id AND the
// run id and scope the lookup by both, reusing the run detail page's own predicate
// (src/app/workflows/[id]/runs/[runId]/page.tsx:32). Deriving the workflow id FROM the run would make
// the predicate single-keyed and defeat the scoping, which is why it is a parameter.
//
// NEITHER ACTION HAND-ROLLS AN INSERT (T-41-64). `createWorkflowRun` owns the MAX_RECURSION_DEPTH
// short-circuit; a bespoke `db.insert(workflowRuns)` here would skip the recursion guard entirely.
// =================================================================================================

/*
 * Named result aliases rather than inline generics, following src/app/duplicates/actions.ts:117-127
 * and for its stated reason: every signature then reads `): Promise<XResult> {`, which keeps the
 * source gate's function-body finder able to tell a signature brace from a body brace.
 */
export type ReplayWorkflowRunResult =
  | { success: true; runId: string }
  | { success: false; error: string }

export type WorkflowRunStatusResult =
  | { success: true; status: WorkflowStatus | null; dryRun: boolean | null }
  | { success: false; error: string }

export type StartDryRunResult =
  | { success: true; runId: string }
  | { success: false; error: string }

/**
 * Re-run a FAILED run from the beginning, carrying its original trigger data verbatim.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *   - it does not edit the trigger data. Replaying something other than what failed is a test run,
 *     which is `startDryRun`'s job;
 *   - it does not walk the `replayedFromRunId` chain. That column is DIAGNOSTIC (T-41-12): `depth` is
 *     reset to 0 so a replay gets a manual trigger's fresh budget, which means the recursion guard
 *     cannot see the chain — and no chain bound is principled for a human-driven action anyway;
 *   - it does not reset the origin run. `replayDelivery` mutates its delivery row back to `pending`;
 *     a workflow run is an immutable historical record, so a replay is a NEW row that points at it.
 *
 * REPLAY AMPLIFICATION IS REAL AND IS MITIGATED ELSEWHERE (T-41-65): every step runs again from node
 * one, so already-succeeded emails, HTTP calls and CRM writes repeat. The controls are the confirm
 * dialog on the button, the failed-only predicate below, `replayedFromRunId` as the audit trail, and
 * `depth: 0` re-bounding the downstream cascade at MAX_RECURSION_DEPTH.
 */
export async function replayWorkflowRun(
  workflowId: string,
  runId: string
): Promise<ReplayWorkflowRunResult> {
  // The gate comes before any database read, so an unauthenticated caller learns nothing about
  // which run ids exist, whatever id it sends.
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const origins = await db
    .select({
      id: workflowRuns.id,
      workflowId: workflowRuns.workflowId,
      status: workflowRuns.status,
      triggerData: workflowRuns.triggerData,
    })
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.workflowId, workflowId)))
    .limit(1)

  if (origins.length === 0) {
    return { success: false, error: "Run not found" }
  }

  const origin = origins[0]

  // The SAME predicate the run detail page's render site uses, so the button and the action cannot
  // disagree. It is checked BEFORE the input is built: `buildReplayRunInput` constructs and never
  // authorizes (plan 41-02 asserts that anti-vacuously), so this is the only gate.
  if (!isRunReplayable(origin.status)) {
    return { success: false, error: "Only failed runs can be replayed" }
  }

  // The envelope comes back BY REFERENCE, on purpose — 41-CONTEXT requires the original trigger data
  // verbatim, and a clone is exactly the normalisation that forbids. It is handed straight to
  // `createWorkflowRun`, which only serialises it, so nothing here may mutate it.
  const input = buildReplayRunInput(origin)

  const run = await createWorkflowRun(input.workflowId, input.triggerEnvelope, input.depth, {
    replayedFromRunId: input.replayedFromRunId,
  })

  revalidatePath(`/workflows/${workflowId}/runs`)
  return { success: true, runId: run.id }
}

/**
 * NEVER THROWS AND NEVER 500s. This is a POLL TARGET: the test-run dialog calls it on a timer while
 * a run is in flight, and a throw would make the dialog retry forever against a request that can
 * never succeed (T-41-67). So an ABSENT row is `{ success: true, status: null, dryRun: null }` — a
 * success, not an error. A run may legitimately have been pruned (src/lib/audit/prune.ts), and the
 * poller has to be able to STOP rather than retry.
 *
 * Modelled on `getScanProgress` (src/app/duplicates/actions.ts:282-319), including the ordering: the
 * gate precedes the lookup, so a refusal costs zero database reads whatever id is sent. Adapted in
 * one way — session-only, per D-A4 above, rather than that action's role check.
 *
 * THE PAYLOAD IS FLAT AND SERIALISABLE, AND CARRIES NO TIMESTAMP AT ALL. The dialog only needs
 * terminal-status detection, and a `Date` does not cross a server-action boundary intact; returning
 * nothing to serialise is stronger than remembering to call `.toISOString()`.
 */
export async function getWorkflowRunStatus(
  workflowId: string,
  runId: string
): Promise<WorkflowRunStatusResult> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const rows = await db
    .select({ status: workflowRuns.status, dryRun: workflowRuns.dryRun })
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.workflowId, workflowId)))
    .limit(1)

  if (rows.length === 0) {
    return { success: true, status: null, dryRun: null }
  }

  return { success: true, status: rows[0].status, dryRun: rows[0].dryRun }
}

/**
 * WFOPS-02 — start a TEST RUN of the saved workflow against caller-supplied trigger data.
 *
 * `triggerDataJson` IS ATTACKER-CONTROLLED INPUT (T-41-62). It arrives as a raw string, is parsed
 * here, becomes the run's `trigger_data`, and is then interpolated by handler templates and injected
 * into the QuickJS transform sandbox. The dialog validates it too, and that is NOT duplication: the
 * client's parse is feedback for a person mistyping a comma, while a server action is reachable by
 * anything that can make an HTTP request. Only this parse is a boundary.
 *
 * THE DRY-RUN FLAG IS DECIDED HERE, AS A LITERAL, AND IS NOT A PARAMETER OF THIS ACTION (T-41-63).
 * Dry-run-ness is not an access-control claim a client may assert — a client-settable flag would let
 * a caller mark a REAL run as a test (hiding it from the runs list and suppressing its failure
 * alert) or a test as real. The engine additionally re-derives the flag from the column on every
 * entry, so there are two independent controls and neither is a client assertion.
 *
 * RESIDUAL, RECORDED RATHER THAN CLOSED (T-41-66): an authenticated user can enqueue unlimited dry
 * runs. Serial enforcement caps concurrency at one run per workflow, and no rate limit exists
 * anywhere in this application, so a per-action limit here would be the only one and would not be
 * the right place for it. Out of scope for this phase.
 */
export async function startDryRun(
  workflowId: string,
  triggerDataJson: string
): Promise<StartDryRunResult> {
  // Session-only, per D-A4 above, and before any database read.
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const found = await db
    .select({ nodes: workflows.nodes })
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1)

  if (found.length === 0) {
    return { success: false, error: "Workflow not found" }
  }

  // engine.ts:143-149 marks a run with zero nodes `completed` immediately, so an empty workflow
  // produces a green dry run that looks like a pass and proves nothing.
  const nodes = found[0].nodes ?? []

  if (nodes.length === 0) {
    return { success: false, error: "Workflow has no steps to test" }
  }

  // PITFALL 8, AND THE CHECK THAT DELIBERATELY IS NOT HERE: there is no `active` test.
  // `triggerManualRun` rejects an inactive workflow (manual-trigger.ts:38-44) and every other
  // trigger path does the equivalent, correctly. Copying it here would make an unactivated draft
  // impossible to test — and the phase goal is literally "a failed or UNPROVEN workflow", so the
  // never-activated draft is the primary population this feature exists for. Do not add it.

  let parsed: unknown

  try {
    parsed = JSON.parse(triggerDataJson)
  } catch {
    // The dialog maps this code to `workflows.dryRun.invalidJson`.
    return { success: false, error: "invalidJson" }
  }

  // A plain object, and nothing that merely passes `typeof x === "object"` — that test admits BOTH
  // `null` and every array, and the parsed value reaches the transform sandbox. `null`, `[1,2]`,
  // `"text"`, `42` and `true` are all legal JSON and all refused here.
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    // The dialog maps this code to `workflows.dryRun.notAnObject`.
    return { success: false, error: "notAnObject" }
  }

  // manual-trigger.ts:46-54's shape. `trigger_type` stays inside `TriggerEnvelope`'s four-member
  // union — widening it would change a type every trigger path shares — so the run is identified as
  // a test by its `trigger_id` and, authoritatively, by the `dry_run` column.
  const envelope: TriggerEnvelope = {
    trigger_type: "manual",
    trigger_id: "dry_run",
    timestamp: new Date().toISOString(),
    data: parsed as Record<string, unknown>,
  }

  // `0` is explicit rather than left to AsyncLocalStorage: a test run is a human pressing a button
  // and gets a manual trigger's full recursion budget. `dryRun: true` is the literal discussed above.
  const run = await createWorkflowRun(workflowId, envelope, 0, { dryRun: true })

  revalidatePath(`/workflows/${workflowId}/runs`)
  return { success: true, runId: run.id }
}
