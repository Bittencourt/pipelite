import { describe, it, expect, vi, beforeEach } from "vitest"
import { runWithExecutionDepth } from "@/lib/execution/recursion"
import type { TriggerEnvelope } from "./types"

// Mock the db module
vi.mock("@/db", () => {
  const mockDb = {
    insert: vi.fn(),
  }
  return { db: mockDb }
})

import { db } from "@/db"
import { createWorkflowRun } from "./create-run"

const mockDb = db as unknown as {
  insert: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createWorkflowRun", () => {
  const envelope: TriggerEnvelope = {
    trigger_type: "crm_event",
    trigger_id: "trig-1",
    timestamp: "2026-03-28T00:00:00Z",
    data: { entityId: "deal-1", action: "created" },
  }

  it("creates a workflow_run row with status 'pending' and trigger envelope", async () => {
    const mockRun = {
      id: "run-1",
      workflowId: "wf-1",
      status: "pending",
      triggerData: envelope,
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date(),
    }

    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockRun]),
      }),
    })

    const result = await createWorkflowRun("wf-1", envelope)

    expect(mockDb.insert).toHaveBeenCalled()
    expect(result.id).toBe("run-1")
    expect(result.status).toBe("pending")
    expect(result.triggerData).toEqual(envelope)
  })

  it("returns the created run with id", async () => {
    const mockRun = {
      id: "run-2",
      workflowId: "wf-2",
      status: "pending",
      triggerData: envelope,
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date(),
    }

    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockRun]),
      }),
    })

    const result = await createWorkflowRun("wf-2", envelope)

    expect(result).toHaveProperty("id")
    expect(result.workflowId).toBe("wf-2")
  })

  // -----------------------------------------------------------------------------------------------
  // THE ADDITIVE OPTIONS BAG (plan 41-11) — BRANCH 2, the normal `pending` insert.
  //
  // These tests read the ARGUMENT of the `.values()` call rather than the returned row, because the
  // row is a fixture: only the argument says what would actually be written to `workflow_runs`.
  // -----------------------------------------------------------------------------------------------

  /** Arrange the chained-builder mock and hand back the `values` spy the assertions read. */
  function arrangeInsert(): ReturnType<typeof vi.fn> {
    const values = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: "run-opts",
          workflowId: "wf-opts",
          status: "pending",
          triggerData: envelope,
          depth: 0,
          error: null,
          startedAt: null,
          completedAt: null,
          createdAt: new Date(),
        },
      ]),
    })
    mockDb.insert.mockReturnValue({ values })
    return values
  }

  /**
   * ANTI-VACUITY. A mock chain that silently resolved to `undefined` would make every
   * "does not contain" assertion below pass without the implementation doing anything, so the spy
   * is asserted called EXACTLY once and its argument asserted to be a real object first.
   */
  function capturedValues(values: ReturnType<typeof vi.fn>): Record<string, unknown> {
    expect(values).toHaveBeenCalledTimes(1)
    const [captured] = values.mock.calls[0] as [Record<string, unknown>]
    expect(captured).not.toBeNull()
    expect(captured).not.toBeUndefined()
    expect(typeof captured).toBe("object")
    return captured
  }

  describe("the additive options bag — branch 2, the pending insert", () => {
    it("writes dryRun: true when the caller asks for a dry run", async () => {
      const values = arrangeInsert()

      await createWorkflowRun("wf-1", envelope, 0, { dryRun: true })

      expect(
        capturedValues(values).dryRun,
        "WFOPS-02: the dry-run flag is decided server-side at insert. If the options bag does not " +
          "reach the values object, `startDryRun` creates an ordinary run that performs real CRM " +
          "writes, real emails and real outgoing HTTP requests.",
      ).toBe(true)
    })

    it("writes replayedFromRunId when the caller supplies an origin", async () => {
      const values = arrangeInsert()

      await createWorkflowRun("wf-1", envelope, 0, { replayedFromRunId: "abc" })

      expect(
        capturedValues(values).replayedFromRunId,
        "This column is the ONLY record a replay happened: depth is reset to 0, so the recursion " +
          "guard cannot see the chain (T-41-12) and nothing else links the new run to its origin.",
      ).toBe("abc")
    })

    it("writes NO dryRun key at all when the options bag is empty", async () => {
      const values = arrangeInsert()

      await createWorkflowRun("wf-1", envelope, 0, {})
      const captured = capturedValues(values)

      // The KEY, not merely a falsy value: an implementation that spread `{ dryRun: options?.dryRun }`
      // would write `dryRun: undefined`, and whether the driver then applies the column's
      // `NOT NULL DEFAULT false` or writes a literal NULL is not a thing to leave to chance —
      // `dry_run` is NOT NULL, so a literal NULL is a constraint violation at runtime.
      expect(Object.keys(captured)).not.toContain("dryRun")
      expect("dryRun" in captured).toBe(false)
      expect(Object.keys(captured)).not.toContain("replayedFromRunId")
      expect("replayedFromRunId" in captured).toBe(false)
    })

    it("writes NO dryRun key when no options argument is passed at all", async () => {
      const values = arrangeInsert()

      await createWorkflowRun("wf-1", envelope, 0)
      const captured = capturedValues(values)

      expect("dryRun" in captured).toBe(false)
      expect("replayedFromRunId" in captured).toBe(false)
    })

    it("treats an explicit dryRun: false as absent, so the column default applies", async () => {
      const values = arrangeInsert()

      await createWorkflowRun("wf-1", envelope, 0, { dryRun: false })

      expect("dryRun" in capturedValues(values)).toBe(false)
    })

    it("treats an empty replayedFromRunId as absent rather than writing an empty string", async () => {
      const values = arrangeInsert()

      await createWorkflowRun("wf-1", envelope, 0, { replayedFromRunId: "" })

      expect("replayedFromRunId" in capturedValues(values)).toBe(false)
    })

    it("THE ADDITIVE GUARANTEE: (workflowId, envelope) alone produces today's values object", async () => {
      const values = arrangeInsert()

      await createWorkflowRun("wf-1", envelope)

      expect(
        capturedValues(values),
        "Five call sites pass no options — the inbound webhook route, the schedule processor, the " +
          "CRM matcher, the manual trigger and the tests. If the fourth parameter changed what an " +
          "optionless call writes, every existing trigger path changed behaviour.",
      ).toEqual({
        workflowId: "wf-1",
        status: "pending",
        triggerData: envelope,
        depth: 0,
      })
    })

    it("THE ADDITIVE GUARANTEE: (workflowId, envelope, 3) produces today's values object", async () => {
      const values = arrangeInsert()

      await createWorkflowRun("wf-1", envelope, 3)

      expect(capturedValues(values)).toEqual({
        workflowId: "wf-1",
        status: "pending",
        triggerData: envelope,
        depth: 3,
      })
    })

    it("honours an explicit depth of 0 even when the ambient execution depth is 2", async () => {
      const values = arrangeInsert()

      await runWithExecutionDepth(2, async () => {
        await createWorkflowRun("wf-1", envelope, 0, { replayedFromRunId: "origin" })
      })

      expect(
        capturedValues(values).depth,
        "A replay's fresh recursion budget is only real if an explicit 0 wins over " +
          "getCurrentExecutionDepth(). `depth ?? getCurrentExecutionDepth()` is correct because 0 " +
          "is not nullish — a `depth || …` would read 2 here and burn two thirds of the budget.",
      ).toBe(0)
    })
  })

  it("sets createdAt timestamp", async () => {
    const createdAt = new Date()
    const mockRun = {
      id: "run-3",
      workflowId: "wf-3",
      status: "pending",
      triggerData: envelope,
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt,
    }

    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockRun]),
      }),
    })

    const result = await createWorkflowRun("wf-3", envelope)

    expect(result.createdAt).toBeInstanceOf(Date)
  })
})
