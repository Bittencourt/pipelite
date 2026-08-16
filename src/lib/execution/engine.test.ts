import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ExecutionContext, WorkflowNode, ConditionNode, DelayNode, SplitNode } from "./types"
// Neither AsyncLocalStorage module is mocked below: the actor cases at the bottom of this
// file assert that a real store survives the engine's real awaits, which a stub could not show.
import { getCurrentActor, type AuditActor } from "@/lib/audit/actor-context"
import { getCurrentExecutionDepth } from "./recursion"

// Mock the DB module
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}

// Chain helpers for Drizzle query builder pattern
function chainSelect(returnValue: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  }
  mockDb.select.mockReturnValue(chain)
  return chain
}

function chainInsert(returnValue: unknown) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
  }
  mockDb.insert.mockReturnValue(chain)
  return chain
}

function chainUpdate() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  }
  mockDb.update.mockReturnValue(chain)
  return chain
}

vi.mock("@/db", () => ({ db: mockDb }))

// Mock condition evaluator and delay resolver
const mockEvaluateCondition = vi.fn()
const mockResolveDelay = vi.fn()

vi.mock("./condition-evaluator", () => ({
  evaluateCondition: (...args: unknown[]) => mockEvaluateCondition(...args),
}))

vi.mock("./delay-resolver", () => ({
  resolveDelay: (...args: unknown[]) => mockResolveDelay(...args),
}))

// Mock action dispatch -- returns stub output matching the old behavior
vi.mock("./actions", () => ({
  executeAction: vi.fn().mockImplementation(
    (actionType: string) =>
      Promise.resolve({
        output: { type: actionType ?? "unknown", status: "executed" },
      })
  ),
}))

// Mock schema tables
vi.mock("@/db/schema/workflows", () => ({
  workflows: { id: "workflows.id" },
  workflowRuns: { id: "workflowRuns.id", workflowId: "workflowRuns.workflowId" },
  workflowRunSteps: { id: "workflowRunSteps.id" },
}))

// Helper to build test nodes
function makeActionNode(id: string, nextNodeId: string | null = null, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, type: "action", label: `Action ${id}`, config, nextNodeId }
}

function makeConditionNode(
  id: string,
  trueBranch: string | null,
  falseBranch: string | null,
  nextNodeId: string | null
): ConditionNode {
  return {
    id,
    type: "condition",
    label: `Condition ${id}`,
    config: { groups: [], logicOperator: "and" as const },
    trueBranch,
    falseBranch,
    nextNodeId,
  }
}

function makeSplitNode(
  id: string,
  branchA: string | null,
  branchB: string | null,
  nextNodeId: string | null
): SplitNode {
  return {
    id,
    type: "split",
    label: `Split ${id}`,
    config: {},
    branchA,
    branchB,
    nextNodeId,
  }
}

function makeDelayNode(id: string, nextNodeId: string | null = null): DelayNode {
  return {
    id,
    type: "delay",
    label: `Delay ${id}`,
    config: { mode: "fixed" as const, duration: 5, unit: "minutes" as const },
    nextNodeId,
  }
}

// Track DB calls for assertions
let insertedSteps: Array<Record<string, unknown>> = []
let updatedRuns: Array<Record<string, unknown>> = []
let updatedSteps: Array<Record<string, unknown>> = []

function setupDbMocks(
  workflow: { id: string; nodes: WorkflowNode[]; createdBy?: string },
  run: { id: string; workflowId: string; status: string; context: ExecutionContext | null; currentNodeId: string | null; triggerData: Record<string, unknown> | null; depth?: number }
) {
  insertedSteps = []
  updatedRuns = []
  updatedSteps = []

  // select().from(workflowRuns).where(...).innerJoin(...).limit(1)
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{
      workflow_runs: run,
      workflows: workflow,
    }]),
  }
  mockDb.select.mockReturnValue(selectChain)

  // insert().values().returning()
  let stepCounter = 0
  mockDb.insert.mockImplementation(() => {
    const stepId = `step-${++stepCounter}`
    const chain = {
      values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        insertedSteps.push({ ...vals, id: stepId })
        return chain
      }),
      returning: vi.fn().mockImplementation(() => {
        const lastInserted = insertedSteps[insertedSteps.length - 1]
        return Promise.resolve([{ id: stepId, ...lastInserted }])
      }),
    }
    return chain
  })

  // update().set().where()
  mockDb.update.mockImplementation((table: unknown) => {
    const chain = {
      set: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        if (table === "workflowRuns.id" || JSON.stringify(table).includes("workflowRuns")) {
          updatedRuns.push(vals)
        } else {
          updatedSteps.push(vals)
        }
        return chain
      }),
      where: vi.fn().mockResolvedValue(undefined),
    }
    return chain
  })
}

describe("executeRun", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertedSteps = []
    updatedRuns = []
    updatedSteps = []
  })

  it("walks a linear 3-node graph and completes the run", async () => {
    const nodes: WorkflowNode[] = [
      makeActionNode("n1", "n2"),
      makeActionNode("n2", "n3"),
      makeActionNode("n3", null),
    ]
    const workflow = { id: "wf-1", nodes }
    const run = {
      id: "run-1",
      workflowId: "wf-1",
      status: "running",
      context: null,
      currentNodeId: null,
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)

    const { executeRun } = await import("./engine")
    await executeRun("run-1")

    // 3 steps should be created
    expect(insertedSteps).toHaveLength(3)
    expect(insertedSteps[0].nodeId).toBe("n1")
    expect(insertedSteps[1].nodeId).toBe("n2")
    expect(insertedSteps[2].nodeId).toBe("n3")

    // Run should be marked as completed
    const completionUpdate = updatedRuns.find(u => u.status === "completed")
    expect(completionUpdate).toBeDefined()
    expect(completionUpdate!.completedAt).toBeDefined()
  })

  it("branches to true path on condition match", async () => {
    const nodes: WorkflowNode[] = [
      makeConditionNode("cond-1", "true-1", "false-1", "merge-1"),
      makeActionNode("true-1", null),
      makeActionNode("false-1", null),
      makeActionNode("merge-1", null),
    ]
    const workflow = { id: "wf-2", nodes }
    const run = {
      id: "run-2",
      workflowId: "wf-2",
      status: "running",
      context: null,
      currentNodeId: null,
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)
    mockEvaluateCondition.mockReturnValue(true)

    const { executeRun } = await import("./engine")
    await executeRun("run-2")

    // Should create step for: cond-1, true-1 (branch), merge-1 (after merge)
    const stepNodeIds = insertedSteps.map(s => s.nodeId)
    expect(stepNodeIds).toContain("cond-1")
    expect(stepNodeIds).toContain("true-1")
    expect(stepNodeIds).toContain("merge-1")
    expect(stepNodeIds).not.toContain("false-1")
  })

  it("branches to false path on condition no-match", async () => {
    const nodes: WorkflowNode[] = [
      makeConditionNode("cond-1", "true-1", "false-1", "merge-1"),
      makeActionNode("true-1", null),
      makeActionNode("false-1", null),
      makeActionNode("merge-1", null),
    ]
    const workflow = { id: "wf-3", nodes }
    const run = {
      id: "run-3",
      workflowId: "wf-3",
      status: "running",
      context: null,
      currentNodeId: null,
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)
    mockEvaluateCondition.mockReturnValue(false)

    const { executeRun } = await import("./engine")
    await executeRun("run-3")

    const stepNodeIds = insertedSteps.map(s => s.nodeId)
    expect(stepNodeIds).toContain("cond-1")
    expect(stepNodeIds).toContain("false-1")
    expect(stepNodeIds).toContain("merge-1")
    expect(stepNodeIds).not.toContain("true-1")
  })

  it("sets run to waiting when delay node returns future date", async () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
    const nodes: WorkflowNode[] = [
      makeActionNode("n1", "delay-1"),
      makeDelayNode("delay-1", "n3"),
      makeActionNode("n3", null),
    ]
    const workflow = { id: "wf-4", nodes }
    const run = {
      id: "run-4",
      workflowId: "wf-4",
      status: "running",
      context: null,
      currentNodeId: null,
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)
    mockResolveDelay.mockReturnValue(futureDate)

    const { executeRun } = await import("./engine")
    await executeRun("run-4")

    // Run should be set to waiting
    const waitingUpdate = updatedRuns.find(u => u.status === "waiting")
    expect(waitingUpdate).toBeDefined()
    expect(waitingUpdate!.currentNodeId).toBe("n3") // Resume point

    // Should NOT have executed n3
    const stepNodeIds = insertedSteps.map(s => s.nodeId)
    expect(stepNodeIds).toContain("n1")
    expect(stepNodeIds).toContain("delay-1")
    expect(stepNodeIds).not.toContain("n3")
  })

  it("skips delay when resolver returns null (past time)", async () => {
    const nodes: WorkflowNode[] = [
      makeActionNode("n1", "delay-1"),
      makeDelayNode("delay-1", "n3"),
      makeActionNode("n3", null),
    ]
    const workflow = { id: "wf-5", nodes }
    const run = {
      id: "run-5",
      workflowId: "wf-5",
      status: "running",
      context: null,
      currentNodeId: null,
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)
    mockResolveDelay.mockReturnValue(null) // Past time

    const { executeRun } = await import("./engine")
    await executeRun("run-5")

    // Should execute all 3 nodes including n3
    const stepNodeIds = insertedSteps.map(s => s.nodeId)
    expect(stepNodeIds).toContain("n1")
    expect(stepNodeIds).toContain("delay-1")
    expect(stepNodeIds).toContain("n3")

    // Run should be completed, not waiting
    const completionUpdate = updatedRuns.find(u => u.status === "completed")
    expect(completionUpdate).toBeDefined()
  })

  it("fails the run with clear error when a node throws", async () => {
    const nodes: WorkflowNode[] = [
      makeActionNode("n1", "n2"),
      { id: "n2", type: "action", label: "Bad Node", config: { _throw: true }, nextNodeId: null },
    ]
    const workflow = { id: "wf-6", nodes }
    const run = {
      id: "run-6",
      workflowId: "wf-6",
      status: "running",
      context: null,
      currentNodeId: null,
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)

    // Make the engine throw on the second node by having evaluateCondition throw
    // Actually, we need to make the action processing throw. We'll use a special config flag.
    // The engine should wrap node execution in try/catch.

    const { executeRun } = await import("./engine")
    // We need to mock a throw scenario - let's make the insert for the 2nd step throw
    let callCount = 0
    mockDb.insert.mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return {
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockRejectedValue(new Error("DB connection lost")),
        }
      }
      const stepId = `step-${callCount}`
      return {
        values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
          insertedSteps.push({ ...vals, id: stepId })
          return { returning: vi.fn().mockResolvedValue([{ id: stepId, ...vals }]) }
        }),
        returning: vi.fn().mockResolvedValue([{ id: stepId }]),
      }
    })

    await executeRun("run-6")

    // Run should be marked as failed
    const failUpdate = updatedRuns.find(u => u.status === "failed")
    expect(failUpdate).toBeDefined()
    expect(failUpdate!.error).toContain("n2")
  })

  it("resumes from currentNodeId after delay", async () => {
    const nodes: WorkflowNode[] = [
      makeActionNode("n1", "delay-1"),
      makeDelayNode("delay-1", "n3"),
      makeActionNode("n3", null),
    ]
    const workflow = { id: "wf-7", nodes }

    // Simulate a resumed run -- currentNodeId is set to "n3" (where to resume after delay)
    const existingContext: ExecutionContext = {
      trigger: { type: "manual", data: {} },
      nodes: {
        "n1": { output: { type: "unknown", status: "stub" }, status: "completed" },
        "delay-1": { output: { delayed: true }, status: "completed" },
      },
    }
    const run = {
      id: "run-7",
      workflowId: "wf-7",
      status: "running",
      context: existingContext as unknown as ExecutionContext,
      currentNodeId: "n3",
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)

    const { executeRun } = await import("./engine")
    await executeRun("run-7")

    // Should only execute n3 (resumed from delay)
    const stepNodeIds = insertedSteps.map(s => s.nodeId)
    expect(stepNodeIds).toEqual(["n3"])

    // Run should be completed
    const completionUpdate = updatedRuns.find(u => u.status === "completed")
    expect(completionUpdate).toBeDefined()
  })

  it("completes on resume when delay is the LAST node (no restart loop)", async () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000)
    const nodes: WorkflowNode[] = [
      makeActionNode("n1", "delay-1"),
      makeDelayNode("delay-1", null), // delay is the terminal node
    ]
    const workflow = { id: "wf-8", nodes }
    const run = {
      id: "run-8",
      workflowId: "wf-8",
      status: "running",
      context: null as ExecutionContext | null,
      currentNodeId: null as string | null,
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)
    mockResolveDelay.mockReturnValue(futureDate)

    const { executeRun } = await import("./engine")
    await executeRun("run-8")

    const waitingUpdate = updatedRuns.find(u => u.status === "waiting")
    expect(waitingUpdate).toBeDefined()
    // Resume frame persisted inside context even though nextNodeId is null
    const persistedContext = waitingUpdate!.context as ExecutionContext

    // --- Resume: simulate the processor re-invoking the run ---
    setupDbMocks(workflow, {
      ...run,
      context: persistedContext,
      currentNodeId: (waitingUpdate!.currentNodeId as string | null) ?? null,
    })

    await executeRun("run-8")

    // Nothing should be re-executed (old bug: fell back to node 0 and
    // re-ran the whole workflow, then re-waited, forever)
    expect(insertedSteps).toHaveLength(0)
    const completionUpdate = updatedRuns.find(u => u.status === "completed")
    expect(completionUpdate).toBeDefined()
  })

  it("resumes a delay inside a condition branch, finishes the branch, then runs the merge node", async () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000)
    const nodes: WorkflowNode[] = [
      makeConditionNode("cond-1", "b1", null, "merge-1"),
      makeActionNode("b1", "d1"),
      makeDelayNode("d1", "b2"),
      makeActionNode("b2", null),
      makeActionNode("merge-1", null),
    ]
    const workflow = { id: "wf-9", nodes }
    const run = {
      id: "run-9",
      workflowId: "wf-9",
      status: "running",
      context: null as ExecutionContext | null,
      currentNodeId: null as string | null,
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)
    mockEvaluateCondition.mockReturnValue(true)
    mockResolveDelay.mockReturnValue(futureDate)

    const { executeRun } = await import("./engine")
    await executeRun("run-9")

    // First pass: cond-1, b1, then delay yields
    expect(insertedSteps.map(s => s.nodeId)).toEqual(["cond-1", "b1", "d1"])
    const waitingUpdate = updatedRuns.find(u => u.status === "waiting")
    expect(waitingUpdate).toBeDefined()
    const persistedContext = waitingUpdate!.context as ExecutionContext

    // --- Resume ---
    setupDbMocks(workflow, {
      ...run,
      context: persistedContext,
      currentNodeId: (waitingUpdate!.currentNodeId as string | null) ?? null,
    })

    await executeRun("run-9")

    // Old bug: only b2 ran, run was completed WITHOUT the merge node
    expect(insertedSteps.map(s => s.nodeId)).toEqual(["b2", "merge-1"])
    expect(updatedRuns.find(u => u.status === "completed")).toBeDefined()
  })

  it("resumes a delay in split branch A, then still runs branch B and the merge node", async () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000)
    const nodes: WorkflowNode[] = [
      makeSplitNode("split-1", "a1", "b1", "merge-1"),
      makeDelayNode("a1", null), // delay is all of branch A
      makeActionNode("b1", null),
      makeActionNode("merge-1", null),
    ]
    const workflow = { id: "wf-10", nodes }
    const run = {
      id: "run-10",
      workflowId: "wf-10",
      status: "running",
      context: null as ExecutionContext | null,
      currentNodeId: null as string | null,
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)
    mockResolveDelay.mockReturnValue(futureDate)

    const { executeRun } = await import("./engine")
    await executeRun("run-10")

    expect(insertedSteps.map(s => s.nodeId)).toEqual(["split-1", "a1"])
    const waitingUpdate = updatedRuns.find(u => u.status === "waiting")
    expect(waitingUpdate).toBeDefined()
    const persistedContext = waitingUpdate!.context as ExecutionContext

    // --- Resume ---
    setupDbMocks(workflow, {
      ...run,
      context: persistedContext,
      currentNodeId: (waitingUpdate!.currentNodeId as string | null) ?? null,
    })

    await executeRun("run-10")

    // Old bug: engine returned after branch A's delay and branch B never ran
    expect(insertedSteps.map(s => s.nodeId)).toEqual(["b1", "merge-1"])
    expect(updatedRuns.find(u => u.status === "completed")).toBeDefined()
  })

  it("runs a shared merge node exactly once when a condition branch points at it", async () => {
    const nodes: WorkflowNode[] = [
      makeConditionNode("cond-1", "t1", null, "merge-1"),
      makeActionNode("t1", "merge-1"), // branch tail points at the merge node
      makeActionNode("merge-1", null),
    ]
    const workflow = { id: "wf-11", nodes }
    const run = {
      id: "run-11",
      workflowId: "wf-11",
      status: "running",
      context: null as ExecutionContext | null,
      currentNodeId: null as string | null,
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)
    mockEvaluateCondition.mockReturnValue(true)

    const { executeRun } = await import("./engine")
    await executeRun("run-11")

    const stepNodeIds = insertedSteps.map(s => s.nodeId)
    expect(stepNodeIds).toEqual(["cond-1", "t1", "merge-1"])
    // Old bug: branch walked the merge chain AND the main loop ran it again
    expect(stepNodeIds.filter(id => id === "merge-1")).toHaveLength(1)
    expect(updatedRuns.find(u => u.status === "completed")).toBeDefined()
  })

  it("runs a shared merge node exactly once when both split branches point at it", async () => {
    const nodes: WorkflowNode[] = [
      makeSplitNode("split-1", "a1", "b1", "merge-1"),
      makeActionNode("a1", "merge-1"),
      makeActionNode("b1", "merge-1"),
      makeActionNode("merge-1", null),
    ]
    const workflow = { id: "wf-12", nodes }
    const run = {
      id: "run-12",
      workflowId: "wf-12",
      status: "running",
      context: null as ExecutionContext | null,
      currentNodeId: null as string | null,
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)

    const { executeRun } = await import("./engine")
    await executeRun("run-12")

    const stepNodeIds = insertedSteps.map(s => s.nodeId)
    expect(stepNodeIds).toEqual(["split-1", "a1", "b1", "merge-1"])
    expect(stepNodeIds.filter(id => id === "merge-1")).toHaveLength(1)
    expect(updatedRuns.find(u => u.status === "completed")).toBeDefined()
  })

  it("detects a cycle and fails the run cleanly instead of looping forever", async () => {
    const nodes: WorkflowNode[] = [
      makeActionNode("n1", "n2"),
      makeActionNode("n2", "n1"), // backward edge -> infinite loop
    ]
    const workflow = { id: "wf-13", nodes }
    const run = {
      id: "run-13",
      workflowId: "wf-13",
      status: "running",
      context: null as ExecutionContext | null,
      currentNodeId: null as string | null,
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)

    const { executeRun } = await import("./engine")
    await executeRun("run-13")

    const failUpdate = updatedRuns.find(u => u.status === "failed")
    expect(failUpdate).toBeDefined()
    expect(failUpdate!.error).toMatch(/cycle/i)
    // Step insertion is bounded by the cap
    expect(insertedSteps.length).toBeLessThanOrEqual(1000)
    expect(updatedRuns.find(u => u.status === "completed")).toBeUndefined()
  })

  it("fails the run with the BRANCH node's id when a node inside a branch throws", async () => {
    const nodes: WorkflowNode[] = [
      makeConditionNode("cond-1", "bad-1", null, "merge-1"),
      makeActionNode("bad-1", null),
      makeActionNode("merge-1", null),
    ]
    const workflow = { id: "wf-14", nodes }
    const run = {
      id: "run-14",
      workflowId: "wf-14",
      status: "running",
      context: null as ExecutionContext | null,
      currentNodeId: null as string | null,
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)
    mockEvaluateCondition.mockReturnValue(true)

    const { executeAction } = await import("./actions")
    vi.mocked(executeAction).mockRejectedValueOnce(new Error("SMTP exploded"))

    const { executeRun } = await import("./engine")
    await executeRun("run-14")

    const failUpdate = updatedRuns.find(u => u.status === "failed")
    expect(failUpdate).toBeDefined()
    // Old bug: the error was attributed to cond-1 (whose completed step got
    // re-marked failed) instead of the actual failing branch node
    expect(failUpdate!.error).toContain("bad-1")
    expect(failUpdate!.error).toContain("SMTP exploded")
    expect(failUpdate!.currentNodeId).toBe("bad-1")
    // The merge node must not run after a branch failure
    expect(insertedSteps.map(s => s.nodeId)).not.toContain("merge-1")
  })

  it("fails with a clear error for a nested condition inside a branch (v1 limitation)", async () => {
    const nodes: WorkflowNode[] = [
      makeConditionNode("cond-1", "nested-1", null, "merge-1"),
      makeConditionNode("nested-1", "t1", null, null),
      makeActionNode("t1", null),
      makeActionNode("merge-1", null),
    ]
    const workflow = { id: "wf-15", nodes }
    const run = {
      id: "run-15",
      workflowId: "wf-15",
      status: "running",
      context: null as ExecutionContext | null,
      currentNodeId: null as string | null,
      triggerData: { trigger_type: "manual", data: {} },
    }

    setupDbMocks(workflow, run)
    mockEvaluateCondition.mockReturnValue(true)

    const { executeRun } = await import("./engine")
    await executeRun("run-15")

    const failUpdate = updatedRuns.find(u => u.status === "failed")
    expect(failUpdate).toBeDefined()
    // Old bug: read config.actionType off the condition node and failed with
    // a misleading "No handler registered" error
    expect(failUpdate!.error).toContain("Nested condition nodes inside a condition/split branch are not supported")
    expect(failUpdate!.currentNodeId).toBe("nested-1")
  })
})

/**
 * AUDIT-02: the workflow_run actor scope (T-36-13).
 *
 * These read the actor from inside `executeAction`, which is where a real CRM action runs.
 * That is deliberate: asserting the engine calls a wrapper would prove nothing about whether
 * a mutation four awaits deep can still see the actor, and that mutation is the only consumer
 * that matters. The engine's `actions` module is stubbed, so the observation point is the same
 * boundary the real crm.ts handlers sit behind.
 *
 * Every name here contains "actor" so `-t "actor"` selects the set.
 */
describe("executeRun actor scope", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertedSteps = []
    updatedRuns = []
    updatedSteps = []
  })

  /**
   * Run a single-action workflow and return what the action observed.
   * `mockImplementationOnce` shadows the module-level stub for this one call only, so the
   * rest of the suite keeps the default action behaviour.
   */
  async function observeFromAction(
    workflow: { id: string; nodes: WorkflowNode[]; createdBy?: string },
    run: {
      id: string
      workflowId: string
      status: string
      context: ExecutionContext | null
      currentNodeId: string | null
      triggerData: Record<string, unknown> | null
      depth?: number
    }
  ): Promise<{ actor: AuditActor | undefined; depth: number }> {
    setupDbMocks(workflow, run)

    let actor: AuditActor | undefined
    let depth = -1

    const { executeAction } = await import("./actions")
    vi.mocked(executeAction).mockImplementationOnce(async () => {
      // Await first: a synchronous read at action entry would pass even if the scope
      // did not survive the engine's own awaits, which is the property under test.
      await new Promise((resolve) => setTimeout(resolve, 1))
      actor = getCurrentActor()
      depth = getCurrentExecutionDepth()
      return { output: { type: "crm", status: "executed" } }
    })

    const { executeRun } = await import("./engine")
    await executeRun(run.id)

    return { actor, depth }
  }

  function singleActionWorkflow(id: string, createdBy: string) {
    return { id, createdBy, nodes: [makeActionNode("n1", null)] }
  }

  function pendingRun(
    id: string,
    workflowId: string,
    extra: Partial<{ depth: number; triggerData: Record<string, unknown> }> = {}
  ) {
    return {
      id,
      workflowId,
      status: "running",
      context: null as ExecutionContext | null,
      currentNodeId: null as string | null,
      triggerData: { trigger_type: "manual", data: {} } as Record<string, unknown> | null,
      ...extra,
    }
  }

  it("gives a CRM action inside the run a workflow_run actor carrying the run id", async () => {
    const { actor } = await observeFromAction(
      singleActionWorkflow("wf-actor-1", "author-1"),
      pendingRun("run-actor-1", "wf-actor-1")
    )

    expect(actor).toEqual({
      kind: "workflow_run",
      userId: "author-1",
      workflowRunId: "run-actor-1",
    })
  })

  it("attributes the actor to the workflow author, never to the triggering user", async () => {
    const { actor } = await observeFromAction(
      singleActionWorkflow("wf-actor-2", "author-2"),
      pendingRun("run-actor-2", "wf-actor-2", {
        triggerData: {
          trigger_type: "crm_event",
          // The human who moved the deal that fired this workflow. An audit row for a
          // write the automation made must not carry their name.
          userId: "triggering-user",
          data: { event: "deal.updated", userId: "triggering-user" },
        },
      })
    )

    expect(actor?.userId).toBe("author-2")
    expect(actor?.userId).not.toBe("triggering-user")
    // The whole point of a distinct kind: a reader can tell the two apart at a glance.
    expect(actor?.kind).toBe("workflow_run")
  })

  it("leaves the recursion depth store intact alongside the actor store", async () => {
    const { actor, depth } = await observeFromAction(
      singleActionWorkflow("wf-actor-3", "author-3"),
      pendingRun("run-actor-3", "wf-actor-3", { depth: 2 })
    )

    // Nesting must not cost the depth: crm.ts reads it to compute depth + 1, and losing
    // it would silently defeat MAX_RECURSION_DEPTH.
    expect(depth).toBe(2)
    expect(actor?.workflowRunId).toBe("run-actor-3")
  })

  it("defaults the depth to 0 under the actor scope when the run has none", async () => {
    const { actor, depth } = await observeFromAction(
      singleActionWorkflow("wf-actor-4", "author-4"),
      pendingRun("run-actor-4", "wf-actor-4")
    )

    expect(depth).toBe(0)
    expect(actor?.kind).toBe("workflow_run")
  })

  it("establishes no actor once the run has finished", async () => {
    await observeFromAction(
      singleActionWorkflow("wf-actor-5", "author-5"),
      pendingRun("run-actor-5", "wf-actor-5")
    )

    expect(getCurrentActor()).toBeUndefined()
    expect(getCurrentExecutionDepth()).toBe(0)
  })
})
