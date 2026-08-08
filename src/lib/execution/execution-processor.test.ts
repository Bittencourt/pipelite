import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the DB module with raw SQL support
const mockExecute = vi.fn()
const mockDb = {
  execute: mockExecute,
  update: vi.fn(),
  select: vi.fn(),
}

vi.mock("@/db", () => ({ db: mockDb }))

// Mock the engine
const mockExecuteRun = vi.fn()
vi.mock("./engine", () => ({
  executeRun: (...args: unknown[]) => mockExecuteRun(...args),
}))

// Mock schema tables
vi.mock("@/db/schema/workflows", () => ({
  workflowRuns: { id: "workflowRuns.id" },
  workflowRunSteps: { id: "workflowRunSteps.id" },
}))

// Mock drizzle-orm sql template
vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    _tag: "sql",
    strings,
    values,
  }),
  eq: vi.fn((a, b) => ({ _tag: "eq", a, b })),
}))

describe("execution-processor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecuteRun.mockResolvedValue(undefined)
  })

  describe("processPendingRuns", () => {
    it("claims a pending run and calls executeRun (happy path)", async () => {
      // First call returns a claimed run, second returns empty (drain loop)
      mockDb.execute
        .mockResolvedValueOnce([{ id: "run-1", workflow_id: "wf-1", status: "running" }])
        .mockResolvedValueOnce([]) // No more pending runs

      const { processPendingRuns } = await import("./execution-processor")
      const count = await processPendingRuns()

      expect(count).toBe(1)
      expect(mockExecuteRun).toHaveBeenCalledWith("run-1")
    })

    it("does NOT claim when same-workflow run is already running (serial enforcement)", async () => {
      // The SQL enforces this -- if no rows returned, no claim
      mockDb.execute.mockResolvedValueOnce([])

      const { processPendingRuns } = await import("./execution-processor")
      const count = await processPendingRuns()

      expect(count).toBe(0)
      expect(mockExecuteRun).not.toHaveBeenCalled()
    })

    it("does NOT claim when same-workflow run is in waiting status (serial enforcement includes waiting)", async () => {
      // The SQL NOT EXISTS checks for both running AND waiting
      mockDb.execute.mockResolvedValueOnce([])

      const { processPendingRuns } = await import("./execution-processor")
      const count = await processPendingRuns()

      expect(count).toBe(0)
      expect(mockExecuteRun).not.toHaveBeenCalled()
    })

    it("drains queue: claims multiple pending runs from different workflows in a single tick", async () => {
      mockDb.execute
        .mockResolvedValueOnce([{ id: "run-1", workflow_id: "wf-1", status: "running" }])
        .mockResolvedValueOnce([{ id: "run-2", workflow_id: "wf-2", status: "running" }])
        .mockResolvedValueOnce([{ id: "run-3", workflow_id: "wf-3", status: "running" }])
        .mockResolvedValueOnce([]) // Done

      const { processPendingRuns } = await import("./execution-processor")
      const count = await processPendingRuns()

      expect(count).toBe(3)
      expect(mockExecuteRun).toHaveBeenCalledTimes(3)
      expect(mockExecuteRun).toHaveBeenCalledWith("run-1")
      expect(mockExecuteRun).toHaveBeenCalledWith("run-2")
      expect(mockExecuteRun).toHaveBeenCalledWith("run-3")
    })
  })

  describe("processWaitingRuns", () => {
    it("resumes a waiting run whose resume_at has elapsed", async () => {
      const pastDate = new Date(Date.now() - 60000)
      // Query returns waiting steps past resume_at
      mockDb.execute.mockResolvedValueOnce([
        { id: "step-1", run_id: "run-1", resume_at: pastDate },
      ])

      // update step status
      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }
      mockDb.update.mockReturnValue(updateChain)

      const { processWaitingRuns } = await import("./execution-processor")
      const count = await processWaitingRuns()

      expect(count).toBe(1)
      expect(mockExecuteRun).toHaveBeenCalledWith("run-1")
    })

    it("does NOT resume a waiting run whose resume_at is still in the future", async () => {
      // Query returns no rows (resume_at > now filtered in SQL)
      mockDb.execute.mockResolvedValueOnce([])

      const { processWaitingRuns } = await import("./execution-processor")
      const count = await processWaitingRuns()

      expect(count).toBe(0)
      expect(mockExecuteRun).not.toHaveBeenCalled()
    })

    it("resets started_at when resuming so the run is not instantly reclaimed as stale", async () => {
      const pastDate = new Date(Date.now() - 60000)
      mockDb.execute.mockResolvedValueOnce([
        { id: "step-1", run_id: "run-1", resume_at: pastDate },
      ])

      const setCalls: Record<string, unknown>[] = []
      const updateChain = {
        set: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
          setCalls.push(vals)
          return updateChain
        }),
        where: vi.fn().mockResolvedValue(undefined),
      }
      mockDb.update.mockReturnValue(updateChain)

      const { processWaitingRuns } = await import("./execution-processor")
      await processWaitingRuns()

      // The run's transition back to 'running' must refresh the lease:
      // started_at still holds the pre-delay claim time, and the stale-run
      // reclaim would otherwise fail the run the moment it resumes.
      const runUpdate = setCalls.find(v => v.status === "running")
      expect(runUpdate).toBeDefined()
      expect(runUpdate!.startedAt).toBeInstanceOf(Date)
    })
  })

  describe("reclaimStaleRuns", () => {
    it("reclaims runs stuck in 'running' past the lease and fails them", async () => {
      mockDb.execute
        .mockResolvedValueOnce([]) // orphaned step cleanup
        .mockResolvedValueOnce([{ id: "run-stale" }]) // reclaimed runs

      const { reclaimStaleRuns } = await import("./execution-processor")
      const count = await reclaimStaleRuns()

      expect(count).toBe(1)
      expect(mockDb.execute).toHaveBeenCalledTimes(2)

      // The reclaim statement must fail (not re-run) stale 'running' runs so
      // side effects are not duplicated, and must gate on started_at age.
      const reclaimSql = (mockDb.execute.mock.calls[1][0] as { strings: TemplateStringsArray }).strings.join("?")
      expect(reclaimSql).toContain("SET status = 'failed'")
      expect(reclaimSql).toContain("status = 'running'")
      expect(reclaimSql).toContain("started_at < NOW()")
    })

    it("returns 0 and touches nothing when no runs exceeded the lease", async () => {
      mockDb.execute
        .mockResolvedValueOnce([]) // orphaned step cleanup
        .mockResolvedValueOnce([]) // no stale runs

      const { reclaimStaleRuns } = await import("./execution-processor")
      const count = await reclaimStaleRuns()

      expect(count).toBe(0)
      expect(mockExecuteRun).not.toHaveBeenCalled()
    })
  })
})
