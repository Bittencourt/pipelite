import { describe, it, expect, vi, beforeEach } from "vitest"
import type { TriggerConfig } from "./types"

// Mock db module
vi.mock("@/db", () => {
  const mockDb = {
    select: vi.fn(),
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
  select: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}
const mockCreateWorkflowRun = createWorkflowRun as ReturnType<typeof vi.fn>
const mockComputeNextRun = computeNextRun as ReturnType<typeof vi.fn>
const mockGetScheduleTrigger = getScheduleTrigger as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  // Slightly after the scheduledAt used across tests, so recomputed next runs
  // (e.g. 12:10, 12:30) are in the future and re-anchoring does not kick in
  // unless a test explicitly moves the clock.
  vi.setSystemTime(new Date("2026-03-28T12:00:05Z"))
})

// Helper to set up the pre-claim select of due workflows (id + nextRunAt)
function setupDueSelect(rows: Array<{ id: string; nextRunAt: Date | null }>) {
  const whereFn = vi.fn().mockResolvedValue(rows)
  const fromFn = vi.fn().mockReturnValue({ where: whereFn })
  mockDb.select.mockReturnValue({ from: fromFn })
  return { fromFn, whereFn }
}

// Helper to set up the mock db.update chain for claiming workflows.
// NOTE: UPDATE...RETURNING yields post-update rows, so claimed rows have
// nextRunAt already nulled -- the processor must NOT read scheduledAt from them.
function setupClaimQuery(claimedWorkflows: Array<{
  id: string
  name: string
  triggers: TriggerConfig[]
  nextRunAt: Date | null
  active: boolean
}>) {
  const returningFn = vi.fn().mockResolvedValue(claimedWorkflows)
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
  const setFn = vi.fn().mockReturnValue({ where: whereFn })
  mockDb.update.mockReturnValue({ set: setFn })
  return { setFn, whereFn, returningFn }
}

describe("processScheduledWorkflows", () => {
  it("finds workflows where nextRunAt <= now and active = true via atomic UPDATE...RETURNING", async () => {
    setupDueSelect([])
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

    setupDueSelect([{ id: "wf-1", nextRunAt: scheduledAt }])

    // First update call: claim query returns one workflow (nextRunAt nulled)
    // Second update call: update nextRunAt
    const claimReturning = vi.fn().mockResolvedValue([
      { id: "wf-1", name: "Test", triggers, nextRunAt: null, active: true },
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

  it("uses the pre-claim scheduled time for the envelope even though RETURNING rows have nextRunAt null", async () => {
    const scheduledAt = new Date("2026-03-28T11:59:30Z")
    const triggers: TriggerConfig[] = [
      { type: "schedule", mode: "interval", intervalMinutes: 30 },
    ]

    setupDueSelect([{ id: "wf-1", nextRunAt: scheduledAt }])

    const claimReturning = vi.fn().mockResolvedValue([
      // Post-update row: nextRunAt already nulled by the claim
      { id: "wf-1", name: "Test", triggers, nextRunAt: null, active: true },
    ])
    const claimWhere = vi.fn().mockReturnValue({ returning: claimReturning })
    const claimSet = vi.fn().mockReturnValue({ where: claimWhere })

    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })

    mockDb.update
      .mockReturnValueOnce({ set: claimSet })
      .mockReturnValueOnce({ set: updateSet })

    mockGetScheduleTrigger.mockReturnValue({ trigger: triggers[0], index: 0 })
    mockComputeNextRun.mockReturnValue(new Date("2026-03-28T12:29:30Z"))
    mockCreateWorkflowRun.mockResolvedValue({ id: "run-1", status: "pending" })

    await processScheduledWorkflows()

    expect(mockCreateWorkflowRun).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({
        data: { scheduledAt: scheduledAt.toISOString() },
      })
    )
  })

  it("computes the next run from the scheduled time (not processing time) to avoid interval drift", async () => {
    const scheduledAt = new Date("2026-03-28T12:00:00Z")
    const triggers: TriggerConfig[] = [
      { type: "schedule", mode: "interval", intervalMinutes: 30 },
    ]

    setupDueSelect([{ id: "wf-1", nextRunAt: scheduledAt }])

    const claimReturning = vi.fn().mockResolvedValue([
      { id: "wf-1", name: "Test", triggers, nextRunAt: null, active: true },
    ])
    const claimWhere = vi.fn().mockReturnValue({ returning: claimReturning })
    const claimSet = vi.fn().mockReturnValue({ where: claimWhere })

    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })

    mockDb.update
      .mockReturnValueOnce({ set: claimSet })
      .mockReturnValueOnce({ set: updateSet })

    mockGetScheduleTrigger.mockReturnValue({ trigger: triggers[0], index: 0 })
    const nextRun = new Date("2026-03-28T12:30:00Z")
    mockComputeNextRun.mockReturnValue(nextRun)
    mockCreateWorkflowRun.mockResolvedValue({ id: "run-1", status: "pending" })

    await processScheduledWorkflows()

    // Base for computeNextRun must be the scheduled time, not "now"
    expect(mockComputeNextRun).toHaveBeenCalledWith(triggers[0], scheduledAt)
    expect(updateSet).toHaveBeenCalledWith({ nextRunAt: nextRun })
  })

  it("re-anchors from now when the recomputed next run is already in the past (downtime catch-up)", async () => {
    vi.setSystemTime(new Date("2026-03-28T15:00:00Z"))
    const scheduledAt = new Date("2026-03-28T12:00:00Z") // 3h behind
    const triggers: TriggerConfig[] = [
      { type: "schedule", mode: "interval", intervalMinutes: 30 },
    ]

    setupDueSelect([{ id: "wf-1", nextRunAt: scheduledAt }])

    const claimReturning = vi.fn().mockResolvedValue([
      { id: "wf-1", name: "Test", triggers, nextRunAt: null, active: true },
    ])
    const claimWhere = vi.fn().mockReturnValue({ returning: claimReturning })
    const claimSet = vi.fn().mockReturnValue({ where: claimWhere })

    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })

    mockDb.update
      .mockReturnValueOnce({ set: claimSet })
      .mockReturnValueOnce({ set: updateSet })

    mockGetScheduleTrigger.mockReturnValue({ trigger: triggers[0], index: 0 })
    const pastNext = new Date("2026-03-28T12:30:00Z")
    const futureNext = new Date("2026-03-28T15:30:00Z")
    mockComputeNextRun
      .mockReturnValueOnce(pastNext) // anchored to scheduledAt -> in the past
      .mockReturnValueOnce(futureNext) // re-anchored from now
    mockCreateWorkflowRun.mockResolvedValue({ id: "run-1", status: "pending" })

    await processScheduledWorkflows()

    expect(mockComputeNextRun).toHaveBeenNthCalledWith(1, triggers[0], scheduledAt)
    expect(mockComputeNextRun).toHaveBeenNthCalledWith(2, triggers[0])
    expect(updateSet).toHaveBeenCalledWith({ nextRunAt: futureNext })
  })

  it("ALWAYS creates a run even when previous run is active (queuing, never skipping)", async () => {
    // The processor does NOT check for existing active runs.
    // It unconditionally creates a "pending" run, which is the queuing mechanism.
    const scheduledAt = new Date("2026-03-28T12:00:00Z")
    const triggers: TriggerConfig[] = [
      { type: "schedule", mode: "interval", intervalMinutes: 5 },
    ]

    setupDueSelect([{ id: "wf-1", nextRunAt: scheduledAt }])

    const claimReturning = vi.fn().mockResolvedValue([
      { id: "wf-1", name: "Test", triggers, nextRunAt: null, active: true },
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

    setupDueSelect([{ id: "wf-1", nextRunAt: scheduledAt }])

    const claimReturning = vi.fn().mockResolvedValue([
      { id: "wf-1", name: "Test", triggers, nextRunAt: null, active: true },
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
    setupDueSelect([])
    setupClaimQuery([])

    const count = await processScheduledWorkflows()
    expect(count).toBe(0)
  })

  it("processes multiple claimed workflows", async () => {
    const scheduledAt = new Date("2026-03-28T12:00:00Z")
    const triggers: TriggerConfig[] = [
      { type: "schedule", mode: "interval", intervalMinutes: 10 },
    ]

    setupDueSelect([
      { id: "wf-1", nextRunAt: scheduledAt },
      { id: "wf-2", nextRunAt: scheduledAt },
    ])

    const claimReturning = vi.fn().mockResolvedValue([
      { id: "wf-1", name: "Test1", triggers, nextRunAt: null, active: true },
      { id: "wf-2", name: "Test2", triggers, nextRunAt: null, active: true },
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

  it("isolates run-creation failures: one failing workflow does not abort the rest of the batch", async () => {
    const scheduledAt = new Date("2026-03-28T12:00:00Z")
    const triggers: TriggerConfig[] = [
      { type: "schedule", mode: "interval", intervalMinutes: 10 },
    ]

    setupDueSelect([
      { id: "wf-fail", nextRunAt: scheduledAt },
      { id: "wf-ok", nextRunAt: scheduledAt },
    ])

    const claimReturning = vi.fn().mockResolvedValue([
      { id: "wf-fail", name: "Fail", triggers, nextRunAt: null, active: true },
      { id: "wf-ok", name: "Ok", triggers, nextRunAt: null, active: true },
    ])
    const claimWhere = vi.fn().mockReturnValue({ returning: claimReturning })
    const claimSet = vi.fn().mockReturnValue({ where: claimWhere })

    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })

    mockDb.update
      .mockReturnValueOnce({ set: claimSet })
      .mockReturnValue({ set: updateSet })

    mockGetScheduleTrigger.mockReturnValue({ trigger: triggers[0], index: 0 })
    mockComputeNextRun.mockReturnValue(new Date("2026-03-28T12:10:00Z"))
    mockCreateWorkflowRun
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce({ id: "run-2", status: "pending" })

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(processScheduledWorkflows()).resolves.toBe(2)

    // Both workflows attempted despite the first one throwing
    expect(mockCreateWorkflowRun).toHaveBeenCalledTimes(2)
    expect(mockCreateWorkflowRun).toHaveBeenCalledWith("wf-ok", expect.any(Object))
    expect(consoleError).toHaveBeenCalled()

    // Neither workflow is left with nextRunAt = null: two nextRunAt updates
    expect(updateSet).toHaveBeenCalledTimes(2)

    consoleError.mockRestore()
  })

  it("restores the original scheduled time when run creation fails, so it retries next cycle", async () => {
    const scheduledAt = new Date("2026-03-28T12:00:00Z")
    const triggers: TriggerConfig[] = [
      { type: "schedule", mode: "interval", intervalMinutes: 10 },
    ]

    setupDueSelect([{ id: "wf-fail", nextRunAt: scheduledAt }])

    const claimReturning = vi.fn().mockResolvedValue([
      { id: "wf-fail", name: "Fail", triggers, nextRunAt: null, active: true },
    ])
    const claimWhere = vi.fn().mockReturnValue({ returning: claimReturning })
    const claimSet = vi.fn().mockReturnValue({ where: claimWhere })

    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })

    mockDb.update
      .mockReturnValueOnce({ set: claimSet })
      .mockReturnValueOnce({ set: updateSet })

    mockGetScheduleTrigger.mockReturnValue({ trigger: triggers[0], index: 0 })
    mockCreateWorkflowRun.mockRejectedValueOnce(new Error("DB error"))

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    await processScheduledWorkflows()

    // nextRunAt restored to the original scheduled time (not recomputed forward)
    expect(updateSet).toHaveBeenCalledWith({ nextRunAt: scheduledAt })
    // No forward recomputation on the failure path
    expect(mockComputeNextRun).not.toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it("does not abort the batch when the nextRunAt update itself fails", async () => {
    const scheduledAt = new Date("2026-03-28T12:00:00Z")
    const triggers: TriggerConfig[] = [
      { type: "schedule", mode: "interval", intervalMinutes: 10 },
    ]

    setupDueSelect([
      { id: "wf-1", nextRunAt: scheduledAt },
      { id: "wf-2", nextRunAt: scheduledAt },
    ])

    const claimReturning = vi.fn().mockResolvedValue([
      { id: "wf-1", name: "One", triggers, nextRunAt: null, active: true },
      { id: "wf-2", name: "Two", triggers, nextRunAt: null, active: true },
    ])
    const claimWhere = vi.fn().mockReturnValue({ returning: claimReturning })
    const claimSet = vi.fn().mockReturnValue({ where: claimWhere })

    const failingWhere = vi.fn().mockRejectedValue(new Error("update failed"))
    const failingSet = vi.fn().mockReturnValue({ where: failingWhere })
    const okWhere = vi.fn().mockResolvedValue(undefined)
    const okSet = vi.fn().mockReturnValue({ where: okWhere })

    mockDb.update
      .mockReturnValueOnce({ set: claimSet })
      .mockReturnValueOnce({ set: failingSet })
      .mockReturnValueOnce({ set: okSet })

    mockGetScheduleTrigger.mockReturnValue({ trigger: triggers[0], index: 0 })
    mockComputeNextRun.mockReturnValue(new Date("2026-03-28T12:10:00Z"))
    mockCreateWorkflowRun.mockResolvedValue({ id: "run-1", status: "pending" })

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(processScheduledWorkflows()).resolves.toBe(2)

    expect(mockCreateWorkflowRun).toHaveBeenCalledTimes(2)
    expect(okSet).toHaveBeenCalledWith({ nextRunAt: new Date("2026-03-28T12:10:00Z") })

    consoleError.mockRestore()
  })
})

describe("startScheduleProcessor", () => {
  it("starts the setTimeout chain with 10s initial delay", () => {
    const setTimeoutSpy = vi.spyOn(global, "setTimeout")

    startScheduleProcessor()

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10_000)
  })
})
