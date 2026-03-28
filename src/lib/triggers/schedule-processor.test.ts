import { describe, it, expect, vi, beforeEach } from "vitest"
import type { TriggerConfig } from "./types"

// Mock db module
vi.mock("@/db", () => {
  const mockDb = {
    update: vi.fn(),
  }
  return { db: mockDb }
})

// Mock create-run
vi.mock("./create-run", () => ({
  createWorkflowRun: vi.fn(),
}))

// Mock schedule-utils
vi.mock("./schedule-utils", () => ({
  computeNextRun: vi.fn(),
  getScheduleTrigger: vi.fn(),
}))

import { db } from "@/db"
import { createWorkflowRun } from "./create-run"
import { computeNextRun, getScheduleTrigger } from "./schedule-utils"
import { processScheduledWorkflows, startScheduleProcessor } from "./schedule-processor"

const mockDb = db as unknown as {
  update: ReturnType<typeof vi.fn>
}
const mockCreateWorkflowRun = createWorkflowRun as ReturnType<typeof vi.fn>
const mockComputeNextRun = computeNextRun as ReturnType<typeof vi.fn>
const mockGetScheduleTrigger = getScheduleTrigger as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

// Helper to set up the mock db.update chain for claiming workflows
function setupClaimQuery(claimedWorkflows: Array<{
  id: string
  name: string
  triggers: TriggerConfig[]
  nextRunAt: Date
  active: boolean
}>) {
  const returningFn = vi.fn().mockResolvedValue(claimedWorkflows)
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
  const setFn = vi.fn().mockReturnValue({ where: whereFn })
  mockDb.update.mockReturnValue({ set: setFn })
  return { setFn, whereFn, returningFn }
}

// Helper to set up update for nextRunAt (second call to db.update)
function setupNextRunAtUpdate() {
  const whereFn2 = vi.fn().mockResolvedValue(undefined)
  const setFn2 = vi.fn().mockReturnValue({ where: whereFn2 })
  return { setFn2, whereFn2 }
}

describe("processScheduledWorkflows", () => {
  it("finds workflows where nextRunAt <= now and active = true via atomic UPDATE...RETURNING", async () => {
    const { setFn } = setupClaimQuery([])

    await processScheduledWorkflows()

    expect(mockDb.update).toHaveBeenCalled()
    // Sets nextRunAt to null to claim
    expect(setFn).toHaveBeenCalledWith({ nextRunAt: null })
  })

  it("creates a pending workflow run for each claimed workflow", async () => {
    const scheduledAt = new Date("2026-03-28T12:00:00Z")
    const triggers: TriggerConfig[] = [
      { type: "schedule", mode: "interval", intervalMinutes: 30 },
    ]

    // First call: claim query returns one workflow
    // Second call: update nextRunAt
    const claimReturning = vi.fn().mockResolvedValue([
      { id: "wf-1", name: "Test", triggers, nextRunAt: scheduledAt, active: true },
    ])
    const claimWhere = vi.fn().mockReturnValue({ returning: claimReturning })
    const claimSet = vi.fn().mockReturnValue({ where: claimWhere })

    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })

    mockDb.update
      .mockReturnValueOnce({ set: claimSet })
      .mockReturnValueOnce({ set: updateSet })

    mockGetScheduleTrigger.mockReturnValue({ trigger: triggers[0], index: 0 })
    mockComputeNextRun.mockReturnValue(new Date("2026-03-28T12:30:00Z"))
    mockCreateWorkflowRun.mockResolvedValue({
      id: "run-1",
      workflowId: "wf-1",
      status: "pending",
    })

    await processScheduledWorkflows()

    expect(mockCreateWorkflowRun).toHaveBeenCalledWith("wf-1", {
      trigger_type: "schedule",
      trigger_id: "0",
      timestamp: expect.any(String),
      data: { scheduledAt: scheduledAt.toISOString() },
    })
  })

  it("ALWAYS creates a run even when previous run is active (queuing, never skipping)", async () => {
    // The processor does NOT check for existing active runs.
    // It unconditionally creates a "pending" run, which is the queuing mechanism.
    const scheduledAt = new Date("2026-03-28T12:00:00Z")
    const triggers: TriggerConfig[] = [
      { type: "schedule", mode: "interval", intervalMinutes: 5 },
    ]

    const claimReturning = vi.fn().mockResolvedValue([
      { id: "wf-1", name: "Test", triggers, nextRunAt: scheduledAt, active: true },
    ])
    const claimWhere = vi.fn().mockReturnValue({ returning: claimReturning })
    const claimSet = vi.fn().mockReturnValue({ where: claimWhere })

    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })

    mockDb.update
      .mockReturnValueOnce({ set: claimSet })
      .mockReturnValueOnce({ set: updateSet })

    mockGetScheduleTrigger.mockReturnValue({ trigger: triggers[0], index: 0 })
    mockComputeNextRun.mockReturnValue(new Date("2026-03-28T12:05:00Z"))
    mockCreateWorkflowRun.mockResolvedValue({
      id: "run-1",
      workflowId: "wf-1",
      status: "pending",
    })

    await processScheduledWorkflows()

    // Verify run was created unconditionally
    expect(mockCreateWorkflowRun).toHaveBeenCalledTimes(1)
  })

  it("updates nextRunAt to next computed time after creating the run", async () => {
    const scheduledAt = new Date("2026-03-28T12:00:00Z")
    const nextRun = new Date("2026-03-28T13:00:00Z")
    const triggers: TriggerConfig[] = [
      { type: "schedule", mode: "cron", cronExpression: "0 * * * *" },
    ]

    const claimReturning = vi.fn().mockResolvedValue([
      { id: "wf-1", name: "Test", triggers, nextRunAt: scheduledAt, active: true },
    ])
    const claimWhere = vi.fn().mockReturnValue({ returning: claimReturning })
    const claimSet = vi.fn().mockReturnValue({ where: claimWhere })

    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })

    mockDb.update
      .mockReturnValueOnce({ set: claimSet })
      .mockReturnValueOnce({ set: updateSet })

    mockGetScheduleTrigger.mockReturnValue({ trigger: triggers[0], index: 0 })
    mockComputeNextRun.mockReturnValue(nextRun)
    mockCreateWorkflowRun.mockResolvedValue({
      id: "run-1",
      workflowId: "wf-1",
      status: "pending",
    })

    await processScheduledWorkflows()

    // Second db.update call should set nextRunAt
    expect(updateSet).toHaveBeenCalledWith({ nextRunAt: nextRun })
  })

  it("returns count of processed workflows", async () => {
    setupClaimQuery([])

    const count = await processScheduledWorkflows()
    expect(count).toBe(0)
  })

  it("processes multiple claimed workflows", async () => {
    const scheduledAt = new Date("2026-03-28T12:00:00Z")
    const triggers: TriggerConfig[] = [
      { type: "schedule", mode: "interval", intervalMinutes: 10 },
    ]

    const claimReturning = vi.fn().mockResolvedValue([
      { id: "wf-1", name: "Test1", triggers, nextRunAt: scheduledAt, active: true },
      { id: "wf-2", name: "Test2", triggers, nextRunAt: scheduledAt, active: true },
    ])
    const claimWhere = vi.fn().mockReturnValue({ returning: claimReturning })
    const claimSet = vi.fn().mockReturnValue({ where: claimWhere })

    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })

    mockDb.update
      .mockReturnValueOnce({ set: claimSet })
      .mockReturnValueOnce({ set: updateSet })
      .mockReturnValueOnce({ set: updateSet })

    mockGetScheduleTrigger.mockReturnValue({ trigger: triggers[0], index: 0 })
    mockComputeNextRun.mockReturnValue(new Date("2026-03-28T12:10:00Z"))
    mockCreateWorkflowRun.mockResolvedValue({
      id: "run-1",
      workflowId: "wf-1",
      status: "pending",
    })

    const count = await processScheduledWorkflows()

    expect(count).toBe(2)
    expect(mockCreateWorkflowRun).toHaveBeenCalledTimes(2)
  })
})

describe("startScheduleProcessor", () => {
  it("starts the setTimeout chain with 10s initial delay", () => {
    const setTimeoutSpy = vi.spyOn(global, "setTimeout")

    startScheduleProcessor()

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10_000)
  })
})
