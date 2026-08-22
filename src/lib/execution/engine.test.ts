import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ExecutionContext, WorkflowNode, ConditionNode, DelayNode, SplitNode } from "./types"
// Neither AsyncLocalStorage module is mocked below: the actor cases at the bottom of this
// file assert that a real store survives the engine's real awaits, which a stub could not show.
import { getCurrentActor, type AuditActor } from "@/lib/audit/actor-context"
import { getCurrentExecutionDepth } from "./recursion"
// Comment-blind source reader, shared with the CFUI/audit gates. The WFOPS-02 structural
// assertions below hinge on real code, and the engine edits they cover carry long rationale
// comments that mention the very identifiers being scanned -- an unstripped read would be
// satisfied by the prose it exists to make redundant.
import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

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
  run: { id: string; workflowId: string; status: string; context: ExecutionContext | null; currentNodeId: string | null; triggerData: Record<string, unknown> | null; depth?: number; dryRun?: boolean }
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

/**
 * WFOPS-02 -- where `_dryRun` comes from.
 *
 * `context._dryRun` is what the five side-effecting handlers gate on, so the SOURCE the engine
 * reads it from is the entire security property, not an implementation detail. `executeRunGraph`
 * restores `context` from `run.context` -- a mutable `jsonb` blob -- a dozen lines above the
 * assignment site. If the flag came from there, a hand-edited context row would turn a dry run
 * into a real one mid-execution, which is the one thing the flag exists to prevent.
 *
 * Observed from inside `executeAction`, the boundary every real CRM handler sits behind: asserting
 * the engine assigns a field would prove nothing about what a mutation four awaits deep actually
 * sees, and that consumer is the only one that matters.
 *
 * Every name here contains "dry-run" so `-t "dry-run"` selects the set.
 */
describe("executeRun dry-run flag", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertedSteps = []
    updatedRuns = []
    updatedSteps = []
  })

  type TestRun = {
    id: string
    workflowId: string
    status: string
    context: ExecutionContext | null
    currentNodeId: string | null
    triggerData: Record<string, unknown> | null
    depth?: number
    dryRun?: boolean
  }

  /**
   * Run a workflow and return `_dryRun` exactly as the action handler saw it.
   *
   * The sentinel distinguishes "the handler observed `undefined`" from "the handler never ran" --
   * without it a workflow that failed before reaching an action would report `undefined` and pass
   * an `expect(seen).toBe(undefined)` while proving nothing.
   */
  async function observeDryRun(
    workflow: { id: string; nodes: WorkflowNode[]; createdBy?: string },
    run: TestRun
  ): Promise<{ seen: unknown; seenType: string }> {
    setupDbMocks(workflow, run)

    let seen: unknown = "HANDLER_NEVER_RAN"

    const { executeAction } = await import("./actions")
    vi.mocked(executeAction).mockImplementationOnce(async (_type, _config, context) => {
      // Await first: a synchronous read at action entry cannot show that the value survives
      // the engine's own awaits, and a real CRM mutation reads it after several.
      await new Promise((resolve) => setTimeout(resolve, 1))
      seen = context._dryRun
      return { output: { type: "crm", status: "executed" } }
    })

    const { executeRun } = await import("./engine")
    await executeRun(run.id)

    return { seen, seenType: typeof seen }
  }

  function singleAction(id: string) {
    return { id, createdBy: "author-1", nodes: [makeActionNode("n1", null)] }
  }

  function baseRun(id: string, workflowId: string, extra: Partial<TestRun> = {}): TestRun {
    return {
      id,
      workflowId,
      status: "running",
      context: null,
      currentNodeId: null,
      triggerData: { trigger_type: "manual", data: {} },
      ...extra,
    }
  }

  it("hands the action a dry-run context when the run's dryRun COLUMN is true", async () => {
    const { seen, seenType } = await observeDryRun(
      singleAction("wf-dry-1"),
      baseRun("run-dry-1", "wf-dry-1", { dryRun: true })
    )

    expect(seen).toBe(true)
    expect(seenType).toBe("boolean")
  })

  it("hands the action a real-run context when the dryRun COLUMN is false", async () => {
    const { seen, seenType } = await observeDryRun(
      singleAction("wf-dry-2"),
      baseRun("run-dry-2", "wf-dry-2", { dryRun: false })
    )

    expect(seen).toBe(false)
    expect(seenType).toBe("boolean")
  })

  it("normalises a pre-migration row with no dryRun column to false, not undefined, for a dry-run gate", async () => {
    // A row read back through an older code path (or any shape predating migration 0019) has
    // no `dryRun` key at all. `undefined` is falsy but NOT `=== false`, and both the five
    // handler gates and 41-08's alert path compare against `false` -- so the normalisation is
    // load-bearing, not cosmetic.
    const { seen, seenType } = await observeDryRun(
      singleAction("wf-dry-3"),
      baseRun("run-dry-3", "wf-dry-3")
    )

    expect(seen).toBe(false)
    expect(seenType).toBe("boolean")
  })

  it("lets the dryRun COLUMN beat a persisted context that claims a dry-run", async () => {
    const persisted = {
      trigger: { type: "manual", data: {} },
      nodes: {},
      // A hand-edited (or stale) context blob asserting the run is dry.
      _dryRun: true,
    } as unknown as ExecutionContext

    // ANTI-VACUITY: snapshot the blob BEFORE the call. The engine restores the very same object
    // and overwrites the field in place, so reading `persisted._dryRun` afterwards would show
    // the engine's own value and this test would pass with an empty context proving nothing.
    const before = JSON.parse(JSON.stringify(persisted)) as { _dryRun?: boolean }
    expect(before._dryRun).toBe(true)

    const { seen } = await observeDryRun(
      singleAction("wf-dry-4"),
      baseRun("run-dry-4", "wf-dry-4", { dryRun: false, context: persisted })
    )

    expect(seen).toBe(false)
  })

  it("lets the dryRun COLUMN beat a persisted context that claims a real run, keeping the dry-run gate on", async () => {
    const persisted = {
      trigger: { type: "manual", data: {} },
      nodes: {},
      _dryRun: false,
    } as unknown as ExecutionContext

    const before = JSON.parse(JSON.stringify(persisted)) as { _dryRun?: boolean }
    expect(before._dryRun).toBe(false)

    const { seen } = await observeDryRun(
      singleAction("wf-dry-5"),
      baseRun("run-dry-5", "wf-dry-5", { dryRun: true, context: persisted })
    )

    expect(seen).toBe(true)
  })

  it("keeps a resumed dry-run dry by re-deriving the flag from the column", async () => {
    // The case the assignment's PLACEMENT buys. A run that yielded and came back minutes later
    // arrives with nothing but its row and its context blob; if the flag were merged into the
    // fresh-context literal instead of written below the restore, this resume would silently
    // become a real run and start mutating the CRM.
    const persisted = {
      trigger: { type: "manual", data: {} },
      nodes: { n1: { output: { type: "unknown", status: "stub" }, status: "completed" } },
      _dryRun: false,
      _resume: { nodeId: "n2" },
    } as unknown as ExecutionContext

    const before = JSON.parse(JSON.stringify(persisted)) as { _dryRun?: boolean }
    expect(before._dryRun).toBe(false)

    const { seen, seenType } = await observeDryRun(
      {
        id: "wf-dry-6",
        createdBy: "author-1",
        nodes: [makeActionNode("n1", "n2"), makeActionNode("n2", null)],
      },
      baseRun("run-dry-6", "wf-dry-6", {
        dryRun: true,
        context: persisted,
        currentNodeId: "n2",
      })
    )

    // Only the resumed node ran, and it ran dry.
    expect(insertedSteps.map((s) => s.nodeId)).toEqual(["n2"])
    expect(seen).toBe(true)
    expect(seenType).toBe("boolean")
  })

  it("assigns the dry-run flag BELOW the context restore and ABOVE the resume read", async () => {
    const source = readStrippedSource("src/lib/execution/engine.ts")

    const restore = source.indexOf("context._workflowUserId = workflow.createdBy")
    const assign = source.indexOf("context._dryRun = run.dryRun === true")
    const resumeRead = source.indexOf("const resume = context._resume")

    // Assert presence FIRST: three `-1`s are trivially "increasing" only in the sense that
    // they are equal, but a single missing marker would otherwise let a `<` chain pass on
    // accident rather than on order.
    expect(restore).toBeGreaterThan(-1)
    expect(assign).toBeGreaterThan(-1)
    expect(resumeRead).toBeGreaterThan(-1)

    expect(assign).toBeGreaterThan(restore)
    expect(resumeRead).toBeGreaterThan(assign)
  })

  it("never exposes the dry-run flag to user JS inside the QuickJS sandbox", async () => {
    // `./actions` is mocked for this whole file, so the real transform handler is reached
    // through the registry directly. The observation point is user JS itself: if a workflow
    // author could branch on `_dryRun`, a workflow could behave one way under test and
    // another in production, and "transform runs FOR REAL" would be a lie.
    const { getHandler } = await import("./actions/registry")
    await import("./actions/transform")

    const handler = getHandler("javascript_transform")
    expect(handler).toBeDefined()

    const context: ExecutionContext = {
      trigger: { type: "manual", data: { a: 1 } },
      nodes: { n1: { output: { value: 10 }, status: "completed" } },
      _workflowUserId: "author-1",
      _dryRun: true,
    }

    const result = await handler!(
      {
        code:
          "return { keys: Object.keys(input).sort(), dry: typeof input._dryRun, " +
          "author: typeof input._workflowUserId }",
      },
      context,
      "run-dry-quickjs"
    )

    // EXACT key set, not a containment check: a future widening of the injection must fail here.
    expect(result.output.keys).toEqual(["nodes", "trigger"])
    expect(result.output.dry).toBe("undefined")
    expect(result.output.author).toBe("undefined")
  })
})

/**
 * WFOPS-02 / CONTEXT amendment A2 -- a delay node is a no-op under dry run.
 *
 * A delay parks its run as `waiting`, and the processor's claim query refuses to start a
 * `pending` run while any run of the same workflow is `running` or `waiting`
 * (`execution-processor.ts:122-127`). So one parked dry run blocks EVERY real run of that
 * workflow until the delay resolves -- up to the 30-day cap. A testing feature that can stall
 * a production workflow for a month is a self-inflicted outage, which is why A2 skips the wait.
 *
 * There are TWO delay sites -- the main loop and `executeBranch` -- and editing one and not the
 * other is the entire risk in this area, so the branch case below is driven through a real
 * condition-branch workflow rather than by reaching for an internal helper.
 *
 * Every name here contains "delay under dry run" so `-t "delay under dry run"` selects the set.
 */
describe("executeRun delay under dry run", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertedSteps = []
    updatedRuns = []
    updatedSteps = []
  })

  /** The exact per-node output a skipped dry-run delay must record. Plans 41-13/41-14 render it. */
  const SIMULATED_DELAY_OUTPUT = { delayed: false, skipped: true, simulated: true }

  /**
   * Every `status: "waiting"` write of the whole invocation, runs and steps together.
   *
   * Counted across both tables rather than asserted site by site so a THIRD delay site added
   * later is covered by this suite the day it is written, without anybody remembering to.
   */
  function waitingWrites(): Array<Record<string, unknown>> {
    return [...updatedRuns, ...updatedSteps].filter((u) => u.status === "waiting")
  }

  /** Every write that carries a resumeAt, i.e. every attempt to schedule a wake-up. */
  function resumeAtWrites(): Array<Record<string, unknown>> {
    return [...updatedRuns, ...updatedSteps].filter((u) => u.resumeAt !== undefined)
  }

  /** Persisted resume frames -- the other half of parking a run. */
  function resumeFrameWrites(): Array<Record<string, unknown>> {
    return updatedRuns.filter((u) => {
      const context = u.context as Record<string, unknown> | undefined
      return context !== undefined && context._resume !== undefined
    })
  }

  /** The output recorded for `nodeId` in the last persisted context. */
  function persistedNodeOutput(nodeId: string): unknown {
    const withContext = [...updatedRuns].reverse().find((u) => u.context !== undefined)
    const context = withContext?.context as ExecutionContext | undefined
    return context?.nodes?.[nodeId]?.output
  }

  /** The completeStep write whose output belongs to `nodeId`, matched via the persisted context. */
  function completedStepOutputs(): Array<Record<string, unknown>> {
    return updatedSteps
      .filter((u) => u.status === "completed")
      .map((u) => u.output as Record<string, unknown>)
  }

  function baseRun(
    id: string,
    workflowId: string,
    dryRun: boolean
  ): {
    id: string
    workflowId: string
    status: string
    context: ExecutionContext | null
    currentNodeId: string | null
    triggerData: Record<string, unknown> | null
    dryRun: boolean
  } {
    return {
      id,
      workflowId,
      status: "running",
      context: null,
      currentNodeId: null,
      triggerData: { trigger_type: "manual", data: {} },
      dryRun,
    }
  }

  const FUTURE = () => new Date(Date.now() + 60 * 60 * 1000)

  const linearWithDelay = (id: string, delayNext: string | null = "n3") => ({
    id,
    createdBy: "author-1",
    nodes: [
      makeActionNode("n1", "delay-1"),
      makeDelayNode("delay-1", delayNext),
      ...(delayNext === "n3" ? [makeActionNode("n3", null)] : []),
    ] as WorkflowNode[],
  })

  /** cond-1 --true--> b1 -> d1 (delay) -> b2, merging at merge-1. The SECOND delay site. */
  const branchWithDelay = (id: string) => ({
    id,
    createdBy: "author-1",
    nodes: [
      makeConditionNode("cond-1", "b1", null, "merge-1"),
      makeActionNode("b1", "d1"),
      makeDelayNode("d1", "b2"),
      makeActionNode("b2", null),
      makeActionNode("merge-1", null),
    ] as WorkflowNode[],
  })

  // --- Main loop --------------------------------------------------------------------------

  it("carries a main-loop delay under dry run straight through to the next node", async () => {
    setupDbMocks(linearWithDelay("wf-a2-1"), baseRun("run-a2-1", "wf-a2-1", true))
    mockResolveDelay.mockReturnValue(FUTURE())

    const { executeRun } = await import("./engine")
    await executeRun("run-a2-1")

    // The node AFTER the delay ran in the same invocation -- the engine did not return early.
    expect(insertedSteps.map((s) => s.nodeId)).toEqual(["n1", "delay-1", "n3"])
    expect(waitingWrites()).toHaveLength(0)
    expect(resumeAtWrites()).toHaveLength(0)
    expect(resumeFrameWrites()).toHaveLength(0)
    expect(updatedRuns.find((u) => u.status === "completed")).toBeDefined()
  })

  it("records a main-loop delay under dry run as simulated, exactly", async () => {
    setupDbMocks(linearWithDelay("wf-a2-2"), baseRun("run-a2-2", "wf-a2-2", true))
    mockResolveDelay.mockReturnValue(FUTURE())

    const { executeRun } = await import("./engine")
    await executeRun("run-a2-2")

    // `simulated: true` is the whole diagnostic: it surfaces in the existing json-viewer with
    // no new UI and no new copy, so an operator can see the delay was not exercised.
    expect(persistedNodeOutput("delay-1")).toEqual(SIMULATED_DELAY_OUTPUT)
    expect(completedStepOutputs()).toContainEqual(SIMULATED_DELAY_OUTPUT)
  })

  it("still parks a REAL run on a future main-loop delay, byte-identically to before", async () => {
    setupDbMocks(linearWithDelay("wf-a2-3"), baseRun("run-a2-3", "wf-a2-3", false))
    const future = FUTURE()
    mockResolveDelay.mockReturnValue(future)

    const { executeRun } = await import("./engine")
    await executeRun("run-a2-3")

    // The regression half, and the more important one: a real run's delay must be unchanged.
    expect(insertedSteps.map((s) => s.nodeId)).toEqual(["n1", "delay-1"])
    const waitingRun = updatedRuns.find((u) => u.status === "waiting")
    expect(waitingRun).toBeDefined()
    expect(waitingRun!.currentNodeId).toBe("n3")
    expect((waitingRun!.context as Record<string, unknown>)._resume).toEqual({ nodeId: "n3" })

    const waitingStep = updatedSteps.find((u) => u.status === "waiting")
    expect(waitingStep).toBeDefined()
    expect(waitingStep!.resumeAt).toBe(future)
    expect(waitingStep!.output).toEqual({ delayed: true, resumeAt: future.toISOString() })
  })

  it("keeps the simulated marker on an already-past main-loop delay under dry run", async () => {
    setupDbMocks(linearWithDelay("wf-a2-4"), baseRun("run-a2-4", "wf-a2-4", true))
    mockResolveDelay.mockReturnValue(null)

    const { executeRun } = await import("./engine")
    await executeRun("run-a2-4")

    // The two dry-run delay paths must be indistinguishable to a reader of the run detail page.
    expect(persistedNodeOutput("delay-1")).toEqual(SIMULATED_DELAY_OUTPUT)
    expect(insertedSteps.map((s) => s.nodeId)).toEqual(["n1", "delay-1", "n3"])
  })

  it("leaves an already-past REAL delay's output free of the dry-run marker", async () => {
    setupDbMocks(linearWithDelay("wf-a2-5"), baseRun("run-a2-5", "wf-a2-5", false))
    mockResolveDelay.mockReturnValue(null)

    const { executeRun } = await import("./engine")
    await executeRun("run-a2-5")

    // Exact object: a `simulated` key on a real run would misreport a delay that genuinely
    // had nothing left to wait for.
    expect(persistedNodeOutput("delay-1")).toEqual({ delayed: false, skipped: true })
  })

  it("completes a dry run whose delay is the LAST node instead of parking it", async () => {
    setupDbMocks(linearWithDelay("wf-a2-6", null), baseRun("run-a2-6", "wf-a2-6", true))
    mockResolveDelay.mockReturnValue(FUTURE())

    const { executeRun } = await import("./engine")
    await executeRun("run-a2-6")

    expect(insertedSteps.map((s) => s.nodeId)).toEqual(["n1", "delay-1"])
    expect(waitingWrites()).toHaveLength(0)
    expect(updatedRuns.find((u) => u.status === "completed")).toBeDefined()
    expect(persistedNodeOutput("delay-1")).toEqual(SIMULATED_DELAY_OUTPUT)
  })

  // --- The branch segment: the SECOND site ------------------------------------------------

  it("carries a delay INSIDE a condition branch under dry run through to the merge node", async () => {
    setupDbMocks(branchWithDelay("wf-a2-7"), baseRun("run-a2-7", "wf-a2-7", true))
    mockEvaluateCondition.mockReturnValue(true)
    mockResolveDelay.mockReturnValue(FUTURE())

    const { executeRun } = await import("./engine")
    await executeRun("run-a2-7")

    // Driven through the real condition walk, so a fix applied to only the main-loop site
    // fails here rather than passing quietly.
    expect(insertedSteps.map((s) => s.nodeId)).toEqual(["cond-1", "b1", "d1", "b2", "merge-1"])
    expect(waitingWrites()).toHaveLength(0)
    expect(resumeAtWrites()).toHaveLength(0)
    expect(resumeFrameWrites()).toHaveLength(0)
    expect(persistedNodeOutput("d1")).toEqual(SIMULATED_DELAY_OUTPUT)
    expect(updatedRuns.find((u) => u.status === "completed")).toBeDefined()
  })

  it("still parks a REAL run on a future delay inside a condition branch", async () => {
    setupDbMocks(branchWithDelay("wf-a2-8"), baseRun("run-a2-8", "wf-a2-8", false))
    mockEvaluateCondition.mockReturnValue(true)
    const future = FUTURE()
    mockResolveDelay.mockReturnValue(future)

    const { executeRun } = await import("./engine")
    await executeRun("run-a2-8")

    expect(insertedSteps.map((s) => s.nodeId)).toEqual(["cond-1", "b1", "d1"])
    const waitingRun = updatedRuns.find((u) => u.status === "waiting")
    expect(waitingRun).toBeDefined()
    // The full in-branch frame: losing it is how the merge node used to be skipped on resume.
    expect((waitingRun!.context as Record<string, unknown>)._resume).toEqual({
      nodeId: "b2",
      inBranch: true,
      pendingBranch: null,
      mergeNodeId: "merge-1",
    })
    expect(updatedSteps.find((u) => u.status === "waiting")?.resumeAt).toBe(future)
  })

  it("guards BOTH delay sites, not one", async () => {
    const source = readStrippedSource("src/lib/execution/engine.ts")

    // The engine handles delays in two places -- the main loop's switch and executeBranch --
    // and the behavioural cases above cover both. This counts them structurally as well,
    // because a future refactor that collapses or duplicates a site should be deliberate.
    const guards = source.split("resumeAt === null || context._dryRun").length - 1
    expect(guards).toBe(2)
  })
})
