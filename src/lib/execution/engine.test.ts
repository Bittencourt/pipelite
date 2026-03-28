import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ExecutionContext, WorkflowNode, ConditionNode, DelayNode } from "./types"

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
  workflow: { id: string; nodes: WorkflowNode[] },
  run: { id: string; workflowId: string; status: string; context: ExecutionContext | null; currentNodeId: string | null; triggerData: Record<string, unknown> | null }
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
})
