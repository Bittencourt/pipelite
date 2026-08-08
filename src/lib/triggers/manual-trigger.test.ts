import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateWebhookSecret, verifyWebhookSecret } from "./webhook-secret"

// Mock the db module
vi.mock("@/db", () => {
  const mockDb = {
    query: {
      workflows: {
        findFirst: vi.fn(),
      },
    },
  }
  return { db: mockDb }
})

// Mock createWorkflowRun
vi.mock("./create-run", () => ({
  createWorkflowRun: vi.fn(),
}))

import { db } from "@/db"
import { createWorkflowRun } from "./create-run"
import { triggerManualRun } from "./manual-trigger"

const mockDb = db as unknown as {
  query: {
    workflows: {
      findFirst: ReturnType<typeof vi.fn>
    }
  }
}

const mockCreateWorkflowRun = createWorkflowRun as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("generateWebhookSecret", () => {
  it("returns a 64-character hex string", () => {
    const secret = generateWebhookSecret()
    expect(secret).toHaveLength(64)
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
  })

  it("generates unique secrets each call", () => {
    const s1 = generateWebhookSecret()
    const s2 = generateWebhookSecret()
    expect(s1).not.toBe(s2)
  })
})

describe("verifyWebhookSecret", () => {
  it("returns true for matching secrets", () => {
    const secret = generateWebhookSecret()
    expect(verifyWebhookSecret(secret, secret)).toBe(true)
  })

  it("returns false for non-matching secrets", () => {
    const s1 = generateWebhookSecret()
    const s2 = generateWebhookSecret()
    expect(verifyWebhookSecret(s1, s2)).toBe(false)
  })

  it("returns false for different-length strings", () => {
    const secret = generateWebhookSecret()
    expect(verifyWebhookSecret(secret, "short")).toBe(false)
  })

  it("returns false for empty strings", () => {
    expect(verifyWebhookSecret("", "")).toBe(false)
  })
})

describe("triggerManualRun", () => {
  const mockWorkflow = {
    id: "wf-1",
    name: "Test Workflow",
    triggers: [{ type: "manual" }],
    active: true,
    createdBy: "user-1",
  }

  it("creates a run with trigger_type 'manual' for valid workflow", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue(mockWorkflow)
    mockCreateWorkflowRun.mockResolvedValue({
      id: "run-1",
      workflowId: "wf-1",
      status: "pending",
    })

    const result = await triggerManualRun({
      workflowId: "wf-1",
      userId: "user-1",
    })

    expect(result).toEqual({ success: true, runId: "run-1" })
    expect(mockCreateWorkflowRun).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({
        trigger_type: "manual",
        trigger_id: "manual",
        data: expect.objectContaining({
          triggeredBy: "user-1",
        }),
      })
    )
  })

  it("returns error for non-existent workflow", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue(null)

    const result = await triggerManualRun({
      workflowId: "wf-nonexistent",
      userId: "user-1",
    })

    expect(result).toEqual({ success: false, error: "Workflow not found" })
    expect(mockCreateWorkflowRun).not.toHaveBeenCalled()
  })

  it("includes entity data in envelope when provided", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue(mockWorkflow)
    mockCreateWorkflowRun.mockResolvedValue({
      id: "run-2",
      workflowId: "wf-1",
      status: "pending",
    })

    const result = await triggerManualRun({
      workflowId: "wf-1",
      userId: "user-1",
      entityType: "deal",
      entityId: "deal-123",
      entityData: { name: "Test Deal", value: 5000 },
    })

    expect(result).toEqual({ success: true, runId: "run-2" })
    expect(mockCreateWorkflowRun).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({
        trigger_type: "manual",
        data: expect.objectContaining({
          entity: "deal",
          entityId: "deal-123",
          record: { name: "Test Deal", value: 5000 },
          triggeredBy: "user-1",
        }),
      })
    )
  })

  it("includes timestamp in envelope", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue(mockWorkflow)
    mockCreateWorkflowRun.mockResolvedValue({
      id: "run-3",
      workflowId: "wf-1",
      status: "pending",
    })

    await triggerManualRun({
      workflowId: "wf-1",
      userId: "user-1",
    })

    const envelope = mockCreateWorkflowRun.mock.calls[0][1]
    expect(envelope.timestamp).toBeDefined()
    // Should be a valid ISO date string
    expect(new Date(envelope.timestamp).toISOString()).toBe(envelope.timestamp)
  })
})
