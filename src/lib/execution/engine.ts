import { db } from "@/db"
import { eq } from "drizzle-orm"
import { workflows, workflowRuns, workflowRunSteps } from "@/db/schema/workflows"
import { evaluateCondition } from "./condition-evaluator"
import { resolveDelay } from "./delay-resolver"
import { executeAction } from "./actions"
import type {
  WorkflowNode,
  ActionNode,
  ExecutionContext,
} from "./types"

/**
 * Execute a workflow run by walking its node graph.
 *
 * Loads the run and its workflow from DB, builds a node map, then walks
 * nodes sequentially. Handles action (stub), condition (branch), and delay
 * (yield to DB) node types.
 *
 * On delay: persists context and resume point, sets run to "waiting", returns.
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
  let context: ExecutionContext = run.context
    ? (run.context as unknown as ExecutionContext)
    : {
        trigger: {
          type: (run.triggerData as Record<string, unknown>)?.trigger_type as string ?? "unknown",
          data: (run.triggerData as Record<string, unknown>)?.data as Record<string, unknown> ?? {},
        },
        nodes: {},
      }

  // Set workflow creator userId for CRM action mutations
  context._workflowUserId = workflow.createdBy

  // Determine start node: resume from currentNodeId or start from first node
  let currentNodeId: string | null = run.currentNodeId ?? nodeList[0].id

  // Walk the node graph
  while (currentNodeId) {
    const node = nodeMap.get(currentNodeId)
    if (!node) {
      await failRun(runId, `Node '${currentNodeId}' not found in workflow graph`)
      return
    }

    try {
      // Create step record
      const [step] = await db
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

          // Execute the matching branch
          const branchStartId = matched ? node.trueBranch : node.falseBranch
          const delayHit = await executeBranch(branchStartId, nodeMap, context, runId)
          if (delayHit) {
            // A delay was hit inside the branch -- run is now waiting
            return
          }

          // Continue from merge point
          nextNodeId = node.nextNodeId
          break
        }

        case "split": {
          const output = { split: true }
          context.nodes[node.id] = { output, status: "completed" }
          await completeStep(step.id, output)
          await persistContext(runId, context)

          // Execute both branches sequentially (true parallelism is out of scope)
          const delayA = await executeBranch(node.branchA, nodeMap, context, runId)
          if (delayA) return
          const delayB = await executeBranch(node.branchB, nodeMap, context, runId)
          if (delayB) return

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
          await failRun(runId, `Unknown node type at node '${(_exhaustive as ActionNode).id}'`)
          return
        }
      }

      currentNodeId = nextNodeId
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await failRun(runId, `Node '${node.id}' (${node.label}) failed: ${message}`)
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
 * Execute a branch (true or false path from a condition node).
 * Walks nodes linearly until nextNodeId is null.
 * Returns true if a delay was hit (run is now waiting).
 */
async function executeBranch(
  startNodeId: string | null,
  nodeMap: Map<string, WorkflowNode>,
  context: ExecutionContext,
  runId: string
): Promise<boolean> {
  if (!startNodeId) return false

  let currentNodeId: string | null = startNodeId

  while (currentNodeId) {
    const node = nodeMap.get(currentNodeId)
    if (!node) break

    const [step] = await db
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

        await db
          .update(workflowRuns)
          .set({
            status: "waiting",
            currentNodeId: node.nextNodeId,
            context: context as unknown as Record<string, unknown>,
          })
          .where(eq(workflowRuns.id, runId))

        return true // Delay hit
      }
    } else {
      // Action node (no nested conditions in v1)
      const actionType = (node.config as Record<string, unknown>).actionType as string
      const result = await executeAction(actionType, node.config as Record<string, unknown>, context, runId)
      context.nodes[node.id] = { output: result.output, status: "completed" }
      await completeStep(step.id, result.output)
      await persistContext(runId, context)
    }

    currentNodeId = node.nextNodeId
  }

  return false
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

async function failRun(runId: string, error: string): Promise<void> {
  console.error(`[execution-engine] Run ${runId} failed: ${error}`)
  await db
    .update(workflowRuns)
    .set({ status: "failed", error })
    .where(eq(workflowRuns.id, runId))
}
