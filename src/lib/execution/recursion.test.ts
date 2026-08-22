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
    const mockInsert = vi.fn<(table?: unknown) => { values: typeof mockValues }>(() => ({ values: mockValues }))
    return { mockReturning, mockValues, mockInsert }
  })

  vi.mock("@/db", () => ({
    db: {
      insert: (table: unknown) => mockInsert(table),
    },
  }))

  // Need to import after mock setup
  let createWorkflowRun: typeof import("@/lib/triggers/create-run").createWorkflowRun

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import("@/lib/triggers/create-run")
    createWorkflowRun = mod.createWorkflowRun
  })

  const triggerEnvelope = { trigger_type: "crm_event" as const, trigger_id: "test-trigger", timestamp: new Date().toISOString(), data: { event: "deal.created" } }

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

  // -----------------------------------------------------------------------------------------------
  // BRANCH 1 — THE RECURSION SHORT-CIRCUIT CARRIES THE OPTIONS TOO (plan 41-11).
  //
  // This is the insert branch that gets forgotten. It writes an already-`failed` row, so nothing
  // downstream ever revisits it to add the flags.
  // -----------------------------------------------------------------------------------------------

  /**
   * ANTI-VACUITY: the spy must have been called exactly once with a real object, or the
   * "does not contain" assertions below would pass on an inert mock chain.
   */
  function shortCircuitValues(): Record<string, unknown> {
    expect(mockValues).toHaveBeenCalledTimes(1)
    const [captured] = mockValues.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(captured).not.toBeNull()
    expect(captured).not.toBeUndefined()
    expect(typeof captured).toBe("object")
    return captured
  }

  function failedRunFixture(overrides: Record<string, unknown> = {}) {
    return {
      id: "run-limit",
      workflowId: "wf-1",
      status: "failed",
      depth: MAX_RECURSION_DEPTH,
      triggerData: triggerEnvelope,
      error: `Recursion limit reached (${MAX_RECURSION_DEPTH} levels)`,
      context: {},
      currentNodeId: null,
      dryRun: false,
      replayedFromRunId: null,
      startedAt: null,
      completedAt: new Date(),
      createdAt: new Date(),
      ...overrides,
    }
  }

  it("carries dryRun: true into the already-failed short-circuit insert", async () => {
    mockReturning.mockResolvedValueOnce([failedRunFixture({ dryRun: true })])

    await createWorkflowRun("wf-1", triggerEnvelope, MAX_RECURSION_DEPTH, { dryRun: true })

    expect(
      shortCircuitValues().dryRun,
      "A dry run that trips the recursion limit MUST still be marked dryRun. Unmarked, it appears " +
        "in the runs list as a real failed run — and worse, plan 41-08's alert path would treat it " +
        "as a real failure and email the workflow's author about a test.",
    ).toBe(true)
  })

  it("carries replayedFromRunId into the already-failed short-circuit insert", async () => {
    mockReturning.mockResolvedValueOnce([failedRunFixture({ replayedFromRunId: "origin-run" })])

    await createWorkflowRun("wf-1", triggerEnvelope, MAX_RECURSION_DEPTH, {
      replayedFromRunId: "origin-run",
    })

    expect(
      shortCircuitValues().replayedFromRunId,
      "A replay that trips the limit must still record its origin, or the operator sees an " +
        "unexplained failed run with no lineage line and no way back to what it replayed.",
    ).toBe("origin-run")
  })

  it("writes no dryRun key in the short-circuit when no options are supplied", async () => {
    mockReturning.mockResolvedValueOnce([failedRunFixture()])

    await createWorkflowRun("wf-1", triggerEnvelope, MAX_RECURSION_DEPTH)
    const captured = shortCircuitValues()

    expect("dryRun" in captured).toBe(false)
    expect("replayedFromRunId" in captured).toBe(false)
  })

  it("leaves the short-circuit's error message and completedAt unchanged by the options", async () => {
    mockReturning.mockResolvedValueOnce([failedRunFixture({ dryRun: true })])

    await createWorkflowRun("wf-1", triggerEnvelope, MAX_RECURSION_DEPTH, { dryRun: true })
    const captured = shortCircuitValues()

    expect(captured.status).toBe("failed")
    expect(captured.error).toBe(`Recursion limit reached (${MAX_RECURSION_DEPTH} levels)`)
    expect(captured.completedAt).toBeInstanceOf(Date)
    expect(captured.depth).toBe(MAX_RECURSION_DEPTH)
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
