/**
 * `toggleWorkflow` — the workflow enable/disable server action: authentication, existence,
 * cache invalidation, and the count of waiting runs cancelled on disable.
 *
 * WHAT IS MOCKED AND WHY
 *   - `@/auth`      — the session under test. Every case sets it explicitly.
 *   - `@/db`        — throws at import time without DATABASE_URL, and this suite must not touch
 *                     Postgres. Only `update`, `select` and `insert` are stubbed, because those are
 *                     the three the action calls.
 *   - `next/cache`  — `revalidatePath("/workflows")` is an assertion target, not a side effect.
 *   - `drizzle-orm` — `eq`/`and` as passthrough object builders, so the composed query shape stays
 *                     inspectable without a dialect.
 *
 * WHAT IS DELIBERATELY NOT MOCKED
 *   - `@/db/schema/workflows`. It is a pure table declaration and mocking it would mean asserting
 *     against a fiction. It does, however, import `drizzle-orm/pg-core` directly, which is the
 *     single most expensive thing in this file's module graph — see below.
 *
 * THE SUBJECT IS IMPORTED STATICALLY, AND THAT IS DELIBERATE — DO NOT "RESTORE" A DYNAMIC IMPORT.
 *
 * `vi.mock` calls are hoisted above imports by vitest's transform, so the top-level import of the
 * action below already sees all four mocks declared under it. This file previously loaded the action
 * with `await import()` inside `beforeEach`, on the stated belief that a dynamic import was needed
 * because the action depends on the mocked modules. That belief was false, and it was expensive:
 * measured across ten idle full-suite runs the first test cost 1211-1669 ms — 99.5% of the whole
 * file's cost — rising to 4121-4850 ms at 3x CPU oversubscription, i.e. 43-49% of the 10 000 ms
 * `hookTimeout`. Phase 45 recorded it timing out in 2 of 5 runs on a machine running several
 * worktree executors at once. Of that cost, 778 ms was the first import and 521 ms of it was
 * `drizzle-orm/pg-core` alone, reached through the deliberately unmocked schema module above.
 *
 * With the import at module scope that cost moves into vitest's collect/import phase, which carries
 * no hook budget at all. Measured on this file with `--reporter=json`: first test
 * 1365.99 ms -> 3.87 ms, whole file 1371 ms -> 11.6 ms, all five tests unchanged in name and in
 * assertion. The mock-dependent assertions still passing is the behavioural proof that `vi.mock`
 * hoisting over a static import works as measured.
 *
 * Do NOT move the import to `beforeAll` either — `beforeAll` is a lifecycle hook under the same
 * 10 000 ms budget, and `export-events-live.test.ts:47` is this repository's proof of where that
 * road ends (an explicit 60 000 ms timeout). `src/lib/__tests__/suite-hook-hygiene.test.ts` is the
 * suite-wide gate that keeps this true, and it will go red if the dynamic form comes back.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// Hoisted mocks
const { mockAuth, mockUpdate, mockSelect, mockInsert, mockRevalidatePath } = vi.hoisted(() => {
  const mockReturning = vi.fn()
  const mockWhere = vi.fn(() => ({ returning: mockReturning }))
  const mockSet = vi.fn(() => ({ where: mockWhere }))
  const mockUpdate = vi.fn<(table?: unknown) => { set: typeof mockSet }>(() => ({ set: mockSet }))

  const mockSelectResult = vi.fn()
  const mockSelectWhere = vi.fn(() => mockSelectResult)
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }))
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }))

  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockInsert = vi.fn<(table?: unknown) => { values: typeof mockInsertValues }>(() => ({ values: mockInsertValues }))

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
    update: (table: unknown) => mockUpdate(table),
    select: () => mockSelect(),
    insert: (table: unknown) => mockInsert(table),
  },
}))
// Mock drizzle-orm operators as passthrough
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ op: "eq", a, b }),
  and: (a: unknown, b: unknown) => ({ op: "and", args: [a, b] }),
}))

// Static, and safe precisely because the four `vi.mock` calls above are hoisted over it by
// vitest's transform. See the file header for the measurement that made this the only acceptable
// form; the hook below must stay synchronous.
import { toggleWorkflow } from "@/app/workflows/actions"

describe("toggleWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
