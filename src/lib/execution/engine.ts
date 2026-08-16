import { db } from "@/db"
import { eq } from "drizzle-orm"
import { workflows, workflowRuns, workflowRunSteps } from "@/db/schema/workflows"
import { evaluateCondition } from "./condition-evaluator"
import { resolveDelay } from "./delay-resolver"
import { executeAction } from "./actions"
import { runWithExecutionDepth } from "./recursion"
import { runWithActor } from "@/lib/audit/actor-context"
import type {
  WorkflowNode,
  ActionNode,
  ExecutionContext,
} from "./types"

/**
 * Resume frame persisted inside the run's context JSON when a delay yields.
 *
 * Control flow has stack-like state (in-progress condition/split branch,
 * pending split branch B, merge point) that the run's single `currentNodeId`
 * column cannot represent. Without this frame:
 * - a delay as the LAST node persisted currentNodeId = null and the resume
 *   fell back to node 0, re-executing the whole workflow forever;
 * - a delay inside a branch lost the merge point (run "completed" without
 *   ever running the merge chain);
 * - a delay in split branch A lost pending branch B entirely.
 *
 * On resume the engine reads this frame (and removes it from the context) to
 * rebuild the exact walk position. Nesting is bounded because nested
 * condition/split nodes inside a branch are rejected (v1 limitation), so a
 * single frame is sufficient -- no full stack needed.
 */
interface ResumeState {
  /** Node to resume at. Null means the current segment is already finished. */
  nodeId: string | null
  /** True when nodeId lives inside a condition/split branch (walked by executeBranch). */
  inBranch?: boolean
  /** Split branch B start node still pending (delay was hit inside branch A). */
  pendingBranch?: string | null
  /** Main-loop merge node to continue at once all branch segments finish. */
  mergeNodeId?: string | null
}

type ResumableContext = ExecutionContext & { _resume?: ResumeState }

/**
 * Hard cap on steps executed per engine invocation. A backward nextNodeId
 * would otherwise loop forever, inserting a step row per iteration and --
 * because the processor awaits executeRun inline -- freezing ALL workflow
 * processing server-wide. When exceeded the run is failed cleanly.
 */
const MAX_STEPS_PER_RUN = 1000

/**
 * Wall-clock cap per engine invocation. The step cap alone bounds a cyclic
 * graph, but with slow per-step DB work 1000 steps can still stall the inline
 * processor for many minutes. This deadline fails a runaway run within ~1
 * minute regardless of per-step cost. A legitimate acyclic workflow traverses
 * far fewer nodes than this in far less time; delays re-enter with a fresh
 * clock, so long waits don't count against it.
 */
const MAX_RUN_MS = 60_000

const CYCLE_ERROR = `Run exceeded the maximum of ${MAX_STEPS_PER_RUN} steps; the workflow graph likely contains a cycle`
const TIMEOUT_ERROR = `Run exceeded the ${MAX_RUN_MS / 1000}s execution budget; the workflow graph likely contains a cycle`

/** Mutable step counter + deadline shared between the main loop and branch walks. */
interface StepGuard {
  steps: number
  deadline: number
}

/** True once this invocation has run past its wall-clock budget. */
function overBudget(guard: StepGuard): boolean {
  return Date.now() > guard.deadline
}

type BranchOutcome = "ok" | "waiting" | "failed"

/**
 * Execute a workflow run by walking its node graph.
 *
 * Loads the run and its workflow from DB, builds a node map, then walks
 * nodes sequentially. Handles action, condition (branch), split (two
 * branches), and delay (yield to DB) node types.
 *
 * On delay: persists context + resume frame, sets run to "waiting", returns.
 * On error: fails the step and run with a descriptive message.
 * On completion: sets run to "completed".
 */
export async function executeRun(runId: string): Promise<void> {
  // Load run + workflow in a single query
  const result = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, runId))
    .innerJoin(workflows, eq(workflowRuns.workflowId, workflows.id))
    .limit(1)

  if (result.length === 0) {
    console.error(`[execution-engine] Run ${runId} not found`)
    return
  }

  const { workflow_runs: run, workflows: workflow } = result[0]

  // Execute the whole graph inside the run's stored recursion depth, so CRM
  // actions that fire other workflows create runs at depth + 1 instead of
  // restarting at 0 (which would defeat MAX_RECURSION_DEPTH).
  //
  // Nested inside it: the actor scope every write made by this run is attributed
  // to. This is the ONLY place a workflow-kind actor is created, and it is the
  // reason src/lib/execution/actions/crm.ts needs no wrap of its own -- its three
  // runWithExecutionDepth(depth + 1, ...) calls already run nested inside this
  // scope and inherit it. Do NOT add a second wrap there; a run's identity comes
  // from the executor's own ids, never from anything a node config can influence.
  //
  // The user attributed is the workflow's AUTHOR, not whoever triggered the run:
  // an automated write is a fact about the automation, and borrowing the
  // triggering user's name would put an unverified human identity on it.
  //
  // The two AsyncLocalStorage stores are independent, so nesting one inside the
  // other leaves both readable throughout the body.
  return runWithExecutionDepth(run.depth ?? 0, () =>
    runWithActor(
      { kind: "workflow_run", userId: workflow.createdBy, workflowRunId: runId },
      () => executeRunGraph(runId, run, workflow)
    )
  ) as Promise<void>
}

async function executeRunGraph(
  runId: string,
  run: typeof workflowRuns.$inferSelect,
  workflow: typeof workflows.$inferSelect
): Promise<void> {
  // Build node map from workflow nodes JSONB
  const nodeList = (workflow.nodes ?? []) as unknown as WorkflowNode[]
  const nodeMap = new Map<string, WorkflowNode>()
  for (const node of nodeList) {
    nodeMap.set(node.id, node)
  }

  if (nodeList.length === 0) {
    await db
      .update(workflowRuns)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(workflowRuns.id, runId))
    return
  }

  // Initialize or restore execution context
  const savedContext = run.context as unknown as ResumableContext | null
  const context: ResumableContext = savedContext?.trigger && savedContext?.nodes
    ? savedContext
    : {
        trigger: {
          type: (run.triggerData as Record<string, unknown>)?.trigger_type as string ?? "unknown",
          data: (run.triggerData as Record<string, unknown>)?.data as Record<string, unknown> ?? {},
        },
        nodes: {},
      }

  // Set workflow creator userId for CRM action mutations
  context._workflowUserId = workflow.createdBy

  // Pull the resume frame (if any) out of the context. Only the delay yield
  // paths write it back; every other persist stores the context without it,
  // so a completed/failed run never carries a stale frame.
  const resume = context._resume
  delete context._resume

  const guard: StepGuard = { steps: 0, deadline: Date.now() + MAX_RUN_MS }

  // Determine start position.
  let currentNodeId: string | null

  if (resume) {
    if (resume.inBranch) {
      // Delay was hit inside a condition/split branch. Finish the branch
      // segment first, then any pending split branch, then fall through to
      // the merge node in the main loop.
      const mergeNodeId = resume.mergeNodeId ?? null
      const segment = await executeBranch(
        resume.nodeId,
        nodeMap,
        context,
        runId,
        { pendingBranch: resume.pendingBranch ?? null, mergeNodeId },
        guard
      )
      if (segment !== "ok") return

      if (resume.pendingBranch) {
        const pending = await executeBranch(
          resume.pendingBranch,
          nodeMap,
          context,
          runId,
          { pendingBranch: null, mergeNodeId },
          guard
        )
        if (pending !== "ok") return
      }

      currentNodeId = mergeNodeId
    } else {
      // Top-level delay. nodeId may legitimately be null (delay was the last
      // node) -- the main loop is skipped and the run completes below instead
      // of falling back to node 0 and re-executing the whole workflow.
      currentNodeId = resume.nodeId
    }
  } else {
    // Fresh run (or legacy waiting run persisted before resume frames existed).
    currentNodeId = run.currentNodeId ?? nodeList[0].id
  }

  // Walk the node graph
  while (currentNodeId) {
    const node = nodeMap.get(currentNodeId)
    if (!node) {
      await failRun(runId, `Node '${currentNodeId}' not found in workflow graph`, currentNodeId)
      return
    }

    if (++guard.steps > MAX_STEPS_PER_RUN) {
      await failRun(runId, CYCLE_ERROR, currentNodeId)
      return
    }
    if (overBudget(guard)) {
      await failRun(runId, TIMEOUT_ERROR, currentNodeId)
      return
    }

    let step: { id: string } | undefined
    try {
      // Create step record
      ;[step] = await db
        .insert(workflowRunSteps)
        .values({
          runId,
          nodeId: node.id,
          status: "running",
          input: { context: context } as Record<string, unknown>,
          startedAt: new Date(),
        })
        .returning()

      let nextNodeId: string | null = null

      switch (node.type) {
        case "action": {
          const actionType = node.config.actionType as string
          const result = await executeAction(actionType, node.config, context, runId)
          context.nodes[node.id] = { output: result.output, status: "completed" }

          await completeStep(step.id, result.output)
          await persistContext(runId, context)
          nextNodeId = node.nextNodeId
          break
        }

        case "condition": {
          const matched = evaluateCondition(node.config, context)
          const branchOutput = { matched, branch: matched ? "true" : "false" }
          context.nodes[node.id] = { output: branchOutput, status: "completed" }

          await completeStep(step.id, branchOutput)
          await persistContext(runId, context)

          // Execute the matching branch. The branch stops at the merge node
          // (node.nextNodeId), which the main loop runs exactly once below.
          const branchStartId = matched ? node.trueBranch : node.falseBranch
          const outcome = await executeBranch(
            branchStartId,
            nodeMap,
            context,
            runId,
            { pendingBranch: null, mergeNodeId: node.nextNodeId },
            guard
          )
          // "waiting": run yielded on a delay. "failed": the branch already
          // failed its own step + the run -- do NOT fall into the catch below,
          // which would corrupt this condition's already-completed step.
          if (outcome !== "ok") return

          // Continue from merge point
          nextNodeId = node.nextNodeId
          break
        }

        case "split": {
          const output = { split: true }
          context.nodes[node.id] = { output, status: "completed" }
          await completeStep(step.id, output)
          await persistContext(runId, context)

          // Execute both branches sequentially (true parallelism is out of
          // scope). While branch A runs, branch B is carried as the pending
          // branch so a delay inside A can persist it in the resume frame.
          const outcomeA = await executeBranch(
            node.branchA,
            nodeMap,
            context,
            runId,
            { pendingBranch: node.branchB, mergeNodeId: node.nextNodeId },
            guard
          )
          if (outcomeA !== "ok") return

          const outcomeB = await executeBranch(
            node.branchB,
            nodeMap,
            context,
            runId,
            { pendingBranch: null, mergeNodeId: node.nextNodeId },
            guard
          )
          if (outcomeB !== "ok") return

          nextNodeId = node.nextNodeId // merge point
          break
        }

        case "delay": {
          const resumeAt = resolveDelay(node.config, context)

          if (resumeAt === null) {
            // Past time -- skip the delay
            const output = { delayed: false, skipped: true }
            context.nodes[node.id] = { output, status: "completed" }
            await completeStep(step.id, output)
            await persistContext(runId, context)
            nextNodeId = node.nextNodeId
          } else {
            // Future time -- yield to DB
            const output = { delayed: true, resumeAt: resumeAt.toISOString() }
            context.nodes[node.id] = { output, status: "completed" }

            await db
              .update(workflowRunSteps)
              .set({
                status: "waiting",
                resumeAt,
                output: output as Record<string, unknown>,
              })
              .where(eq(workflowRunSteps.id, step.id))

            // Persist the resume frame. nodeId may be null when the delay is
            // the last node -- on resume the run then completes instead of
            // restarting from node 0.
            context._resume = { nodeId: node.nextNodeId }
            await db
              .update(workflowRuns)
              .set({
                status: "waiting",
                currentNodeId: node.nextNodeId,
                context: context as unknown as Record<string, unknown>,
              })
              .where(eq(workflowRuns.id, runId))

            return // Exit -- processor will resume later
          }
          break
        }

        default: {
          const _exhaustive: never = node
          await failRun(runId, `Unknown node type at node '${(_exhaustive as ActionNode).id}'`, (_exhaustive as ActionNode).id)
          return
        }
      }

      currentNodeId = nextNodeId
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Capture structured output from HTTP errors (statusCode, headers, body)
      const errorOutput = (error as Error & { output?: Record<string, unknown> }).output
      if (step) {
        await db
          .update(workflowRunSteps)
          .set({
            status: "failed",
            output: errorOutput ?? ({ error: message } as Record<string, unknown>),
            completedAt: new Date(),
          })
          .where(eq(workflowRunSteps.id, step.id))
      }
      await failRun(runId, `Node '${node.id}' (${node.label}) failed: ${message}`, node.id)
      return
    }
  }

  // All nodes processed -- mark run as completed
  await db
    .update(workflowRuns)
    .set({
      status: "completed",
      completedAt: new Date(),
      currentNodeId: null,
      context: context as unknown as Record<string, unknown>,
    })
    .where(eq(workflowRuns.id, runId))
}

/**
 * Execute a branch (a condition's true/false path or a split's branch A/B).
 * Walks nodes linearly until nextNodeId is null or the merge node is reached.
 *
 * The merge node (continuation.mergeNodeId, i.e. the parent node's nextNodeId)
 * belongs to the MAIN loop: stopping there prevents a shared merge chain from
 * executing once per branch plus once in the main loop.
 *
 * Errors are handled per-node HERE (not in the main loop's catch): the failing
 * branch node's own step is marked failed and failRun records that node's id.
 * Bubbling instead would re-mark the parent condition/split step -- already
 * completed -- as failed and attribute the failure to the wrong node.
 *
 * Returns "ok" when the branch finished, "waiting" when a delay yielded
 * (resume frame persisted), "failed" when a node failed (run already failed).
 */
async function executeBranch(
  startNodeId: string | null,
  nodeMap: Map<string, WorkflowNode>,
  context: ResumableContext,
  runId: string,
  continuation: { pendingBranch: string | null; mergeNodeId: string | null },
  guard: StepGuard
): Promise<BranchOutcome> {
  if (!startNodeId) return "ok"

  let currentNodeId: string | null = startNodeId

  while (currentNodeId && currentNodeId !== continuation.mergeNodeId) {
    const node = nodeMap.get(currentNodeId)
    if (!node) break

    if (++guard.steps > MAX_STEPS_PER_RUN) {
      await failRun(runId, CYCLE_ERROR, currentNodeId)
      return "failed"
    }
    if (overBudget(guard)) {
      await failRun(runId, TIMEOUT_ERROR, currentNodeId)
      return "failed"
    }

    let step: { id: string } | undefined
    try {
      ;[step] = await db
        .insert(workflowRunSteps)
        .values({
          runId,
          nodeId: node.id,
          status: "running",
          input: { context: context } as Record<string, unknown>,
          startedAt: new Date(),
        })
        .returning()

      if (node.type === "delay") {
        const resumeAt = resolveDelay(node.config, context)

        if (resumeAt === null) {
          const output = { delayed: false, skipped: true }
          context.nodes[node.id] = { output, status: "completed" }
          await completeStep(step.id, output)
          await persistContext(runId, context)
        } else {
          const output = { delayed: true, resumeAt: resumeAt.toISOString() }
          context.nodes[node.id] = { output, status: "completed" }

          await db
            .update(workflowRunSteps)
            .set({ status: "waiting", resumeAt, output: output as Record<string, unknown> })
            .where(eq(workflowRunSteps.id, step.id))

          // Persist the full resume frame: where to continue inside this
          // branch, which split branch is still pending, and the merge point.
          context._resume = {
            nodeId: node.nextNodeId,
            inBranch: true,
            pendingBranch: continuation.pendingBranch,
            mergeNodeId: continuation.mergeNodeId,
          }
          await db
            .update(workflowRuns)
            .set({
              status: "waiting",
              currentNodeId: node.nextNodeId,
              context: context as unknown as Record<string, unknown>,
            })
            .where(eq(workflowRuns.id, runId))

          return "waiting" // Delay hit
        }
      } else if (node.type === "condition" || node.type === "split") {
        // v1 limitation: the resume frame is a single level deep, so nested
        // control flow inside a branch cannot be resumed correctly. Fail with
        // a clear message instead of misreading the node as an action.
        throw new Error(
          `Nested ${node.type} nodes inside a condition/split branch are not supported`
        )
      } else {
        // Action node
        const actionType = node.config.actionType as string
        const result = await executeAction(actionType, node.config, context, runId)
        context.nodes[node.id] = { output: result.output, status: "completed" }
        await completeStep(step.id, result.output)
        await persistContext(runId, context)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const errorOutput = (error as Error & { output?: Record<string, unknown> }).output
      if (step) {
        await db
          .update(workflowRunSteps)
          .set({
            status: "failed",
            output: errorOutput ?? ({ error: message } as Record<string, unknown>),
            completedAt: new Date(),
          })
          .where(eq(workflowRunSteps.id, step.id))
      }
      await failRun(runId, `Node '${node.id}' (${node.label}) failed: ${message}`, node.id)
      return "failed"
    }

    currentNodeId = node.nextNodeId
  }

  return "ok"
}

async function completeStep(stepId: string, output: Record<string, unknown>): Promise<void> {
  await db
    .update(workflowRunSteps)
    .set({
      status: "completed",
      output,
      completedAt: new Date(),
    })
    .where(eq(workflowRunSteps.id, stepId))
}

async function persistContext(runId: string, context: ExecutionContext): Promise<void> {
  await db
    .update(workflowRuns)
    .set({ context: context as unknown as Record<string, unknown> })
    .where(eq(workflowRuns.id, runId))
}

async function failRun(
  runId: string,
  error: string,
  failedNodeId?: string
): Promise<void> {
  console.error(`[execution-engine] Run ${runId} failed: ${error}`)
  // Persist the failing node so the run-detail "Failed at: <node>" banner can
  // resolve it to a human-readable label.
  const updates: Record<string, unknown> = { status: "failed", error }
  if (failedNodeId) updates.currentNodeId = failedNodeId
  await db.update(workflowRuns).set(updates).where(eq(workflowRuns.id, runId))
}
