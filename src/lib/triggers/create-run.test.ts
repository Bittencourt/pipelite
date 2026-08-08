import { describe, it, expect, vi, beforeEach } from "vitest"
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
