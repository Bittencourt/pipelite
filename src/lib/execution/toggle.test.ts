import { describe, it, expect, vi, beforeEach } from "vitest"

// Hoisted mocks
const { mockAuth, mockUpdate, mockSelect, mockInsert, mockRevalidatePath } = vi.hoisted(() => {
  const mockReturning = vi.fn()
  const mockWhere = vi.fn(() => ({ returning: mockReturning }))
  const mockSet = vi.fn(() => ({ where: mockWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockSet }))

  const mockSelectResult = vi.fn()
  const mockSelectWhere = vi.fn(() => mockSelectResult)
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }))
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }))

  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  const mockAuth = vi.fn()
  const mockRevalidatePath = vi.fn()

  return {
    mockAuth,
    mockUpdate,
    mockUpdateSet: mockSet,
    mockUpdateWhere: mockWhere,
    mockUpdateReturning: mockReturning,
    mockSelect,
    mockSelectFrom: mockSelectFrom,
    mockSelectWhere: mockSelectWhere,
    mockSelectResult,
    mockInsert,
    mockInsertValues,
    mockInsertReturning,
    mockRevalidatePath,
  }
})

vi.mock("@/auth", () => ({ auth: mockAuth }))
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }))
vi.mock("@/db", () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}))
// Mock drizzle-orm operators as passthrough
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ op: "eq", a, b }),
  and: (...args: unknown[]) => ({ op: "and", args }),
}))

// We need to use dynamic import since toggleWorkflow is a server action
// that depends on the mocked modules
let toggleWorkflow: (id: string, active: boolean) => Promise<
  { success: true; cancelledRuns: number } | { success: false; error: string }
>

describe("toggleWorkflow", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset module cache to get fresh imports with mocks
    vi.resetModules()

    // Re-apply mocks after reset
    vi.doMock("@/auth", () => ({ auth: mockAuth }))
    vi.doMock("next/cache", () => ({ revalidatePath: mockRevalidatePath }))
    vi.doMock("@/db", () => ({
      db: {
        update: (...args: unknown[]) => mockUpdate(...args),
        select: (...args: unknown[]) => mockSelect(...args),
        insert: (...args: unknown[]) => mockInsert(...args),
      },
    }))
    vi.doMock("drizzle-orm", () => ({
      eq: (a: unknown, b: unknown) => ({ op: "eq", a, b }),
      and: (...args: unknown[]) => ({ op: "and", args }),
    }))

    const mod = await import("@/app/workflows/actions")
    toggleWorkflow = mod.toggleWorkflow
  })

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce(null)

    const result = await toggleWorkflow("wf-1", true)
    expect(result).toEqual({ success: false, error: "Not authenticated" })
  })

  it("returns error for non-existent workflow", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user-1" } })
    // select().from().where() returns empty array
    const mockSelectWhere = vi.fn().mockResolvedValueOnce([])
    const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }))
    mockSelect.mockReturnValueOnce({ from: mockSelectFrom })

    const result = await toggleWorkflow("wf-nonexistent", true)
    expect(result).toEqual({ success: false, error: "Workflow not found" })
  })

  it("enables workflow and returns cancelledRuns=0", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user-1" } })
    // Workflow exists
    const mockSelectWhere = vi.fn().mockResolvedValueOnce([{ id: "wf-1", active: false }])
    const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }))
    mockSelect.mockReturnValueOnce({ from: mockSelectFrom })
    // Update succeeds
    const mockUpdateWhere = vi.fn().mockResolvedValueOnce(undefined)
    const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
    mockUpdate.mockReturnValueOnce({ set: mockUpdateSet })

    const result = await toggleWorkflow("wf-1", true)
    expect(result).toEqual({ success: true, cancelledRuns: 0 })
    expect(mockRevalidatePath).toHaveBeenCalledWith("/workflows")
  })

  it("disables workflow and cancels waiting runs", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user-1" } })
    // Workflow exists
    const mockSelectWhere = vi.fn().mockResolvedValueOnce([{ id: "wf-1", active: true }])
    const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }))
    mockSelect.mockReturnValueOnce({ from: mockSelectFrom })
    // Update workflow active=false
    const mockUpdateWhere1 = vi.fn().mockResolvedValueOnce(undefined)
    const mockUpdateSet1 = vi.fn(() => ({ where: mockUpdateWhere1 }))
    mockUpdate.mockReturnValueOnce({ set: mockUpdateSet1 })
    // Cancel waiting runs - returns 3 affected rows
    const mockCancelReturning = vi.fn().mockResolvedValueOnce([
      { id: "run-1" }, { id: "run-2" }, { id: "run-3" },
    ])
    const mockCancelWhere = vi.fn(() => ({ returning: mockCancelReturning }))
    const mockCancelSet = vi.fn(() => ({ where: mockCancelWhere }))
    mockUpdate.mockReturnValueOnce({ set: mockCancelSet })

    const result = await toggleWorkflow("wf-1", false)
    expect(result).toEqual({ success: true, cancelledRuns: 3 })
    expect(mockRevalidatePath).toHaveBeenCalledWith("/workflows")
  })

  it("disabling with no waiting runs returns cancelledRuns=0", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user-1" } })
    // Workflow exists
    const mockSelectWhere = vi.fn().mockResolvedValueOnce([{ id: "wf-1", active: true }])
    const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }))
    mockSelect.mockReturnValueOnce({ from: mockSelectFrom })
    // Update workflow active=false
    const mockUpdateWhere1 = vi.fn().mockResolvedValueOnce(undefined)
    const mockUpdateSet1 = vi.fn(() => ({ where: mockUpdateWhere1 }))
    mockUpdate.mockReturnValueOnce({ set: mockUpdateSet1 })
    // Cancel waiting runs - returns empty array (no waiting runs)
    const mockCancelReturning = vi.fn().mockResolvedValueOnce([])
    const mockCancelWhere = vi.fn(() => ({ returning: mockCancelReturning }))
    const mockCancelSet = vi.fn(() => ({ where: mockCancelWhere }))
    mockUpdate.mockReturnValueOnce({ set: mockCancelSet })

    const result = await toggleWorkflow("wf-1", false)
    expect(result).toEqual({ success: true, cancelledRuns: 0 })
  })
})
