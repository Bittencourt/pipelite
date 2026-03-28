import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  getCurrentExecutionDepth,
  runWithExecutionDepth,
  MAX_RECURSION_DEPTH,
} from "./recursion"

describe("recursion depth tracking", () => {
  describe("getCurrentExecutionDepth", () => {
    it("returns 0 when not inside a workflow execution", () => {
      expect(getCurrentExecutionDepth()).toBe(0)
    })
  })

  describe("runWithExecutionDepth", () => {
    it("makes getCurrentExecutionDepth return the set depth", () => {
      let capturedDepth = -1
      runWithExecutionDepth(3, () => {
        capturedDepth = getCurrentExecutionDepth()
      })
      expect(capturedDepth).toBe(3)
    })

    it("works with async functions", async () => {
      let capturedDepth = -1
      await runWithExecutionDepth(2, async () => {
        await new Promise((r) => setTimeout(r, 1))
        capturedDepth = getCurrentExecutionDepth()
      })
      expect(capturedDepth).toBe(2)
    })

    it("nested calls use the inner depth", () => {
      let outerDepth = -1
      let innerDepth = -1
      runWithExecutionDepth(1, () => {
        outerDepth = getCurrentExecutionDepth()
        runWithExecutionDepth(4, () => {
          innerDepth = getCurrentExecutionDepth()
        })
      })
      expect(outerDepth).toBe(1)
      expect(innerDepth).toBe(4)
    })

    it("depth resets after execution completes", () => {
      runWithExecutionDepth(3, () => {
        // inside
      })
      expect(getCurrentExecutionDepth()).toBe(0)
    })
  })

  describe("MAX_RECURSION_DEPTH", () => {
    it("is 5", () => {
      expect(MAX_RECURSION_DEPTH).toBe(5)
    })
  })
})

// Tests for createWorkflowRun depth enforcement
describe("createWorkflowRun with depth enforcement", () => {
  // Use vi.hoisted so mocks are available when vi.mock factory runs
  const { mockReturning, mockValues, mockInsert } = vi.hoisted(() => {
    const mockReturning = vi.fn()
    const mockValues = vi.fn(() => ({ returning: mockReturning }))
    const mockInsert = vi.fn(() => ({ values: mockValues }))
    return { mockReturning, mockValues, mockInsert }
  })

  vi.mock("@/db", () => ({
    db: {
      insert: (...args: unknown[]) => mockInsert(...args),
    },
  }))

  // Need to import after mock setup
  let createWorkflowRun: typeof import("@/lib/triggers/create-run").createWorkflowRun

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import("@/lib/triggers/create-run")
    createWorkflowRun = mod.createWorkflowRun
  })

  const triggerEnvelope = { type: "crm_event" as const, data: { event: "deal.created" } }

  it("creates a run with depth < 5 successfully", async () => {
    const fakeRun = {
      id: "run-1",
      workflowId: "wf-1",
      status: "pending",
      depth: 2,
      triggerData: triggerEnvelope,
      error: null,
      context: {},
      currentNodeId: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date(),
    }
    mockReturning.mockResolvedValueOnce([fakeRun])

    const run = await createWorkflowRun("wf-1", triggerEnvelope, 2)
    expect(run.status).toBe("pending")
    expect(run.depth).toBe(2)
  })

  it("creates a failed run when depth >= 5", async () => {
    const failedRun = {
      id: "run-2",
      workflowId: "wf-1",
      status: "failed",
      depth: 5,
      triggerData: triggerEnvelope,
      error: "Recursion limit reached (5 levels)",
      context: {},
      currentNodeId: null,
      startedAt: null,
      completedAt: new Date(),
      createdAt: new Date(),
    }
    mockReturning.mockResolvedValueOnce([failedRun])

    const run = await createWorkflowRun("wf-1", triggerEnvelope, 5)
    expect(run.status).toBe("failed")
    expect(run.error).toBe("Recursion limit reached (5 levels)")
  })

  it("reads depth from AsyncLocalStorage when not provided", async () => {
    const fakeRun = {
      id: "run-3",
      workflowId: "wf-1",
      status: "pending",
      depth: 3,
      triggerData: triggerEnvelope,
      error: null,
      context: {},
      currentNodeId: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date(),
    }
    mockReturning.mockResolvedValueOnce([fakeRun])

    await runWithExecutionDepth(3, async () => {
      const run = await createWorkflowRun("wf-1", triggerEnvelope)
      expect(run.depth).toBe(3)
    })
  })
})
