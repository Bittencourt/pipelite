import { describe, it, expect, vi, beforeEach } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

// NOTE FOR WHOEVER TOUCHES THIS FILE NEXT: the module under test must be loaded with
// `await import("./execution-processor")` INSIDE each test. A static import is hoisted above the
// `const mockDb` declarations below and throws `Cannot access 'mockDb' before initialization`,
// which vitest surfaces as a 0-test collection failure that reads exactly like a missing module.

// Mock the DB module with raw SQL support
const mockExecute = vi.fn()
const mockDb = {
  execute: mockExecute,
  update: vi.fn(),
  select: vi.fn(),
  // CONTEXT amendment A3: the waiting claim now runs inside `db.transaction`, so the mock has to
  // hand a "tx" to the callback. It hands back mockDb itself, so every `tx.execute` / `tx.update`
  // assertion below still reads through the same two mocks.
  transaction: vi.fn(),
}

vi.mock("@/db", () => ({ db: mockDb }))

// Mock the engine
const mockExecuteRun = vi.fn()
vi.mock("./engine", () => ({
  executeRun: (...args: unknown[]) => mockExecuteRun(...args),
}))

// Mock schema tables
vi.mock("@/db/schema/workflows", () => ({
  workflowRuns: { id: "workflowRuns.id", status: "workflowRuns.status" },
  workflowRunSteps: { id: "workflowRunSteps.id", status: "workflowRunSteps.status" },
}))

// Mock drizzle-orm sql template
vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    _tag: "sql",
    strings,
    values,
  }),
  eq: vi.fn((a, b) => ({ _tag: "eq", a, b })),
  and: vi.fn((...conditions: unknown[]) => ({ _tag: "and", conditions })),
}))

const PROCESSOR_PATH = "src/lib/execution/execution-processor.ts"

/**
 * The body text of one exported `(): Promise<number>` function in the processor, comment-stripped.
 *
 * Wave 2 found that neither `elementRegion` (JSX only) nor `callArguments` (argument lists) can
 * bound a TypeScript function body, so this is the module-private `functionRegion` pattern 41-11
 * used in `replay.test.ts`. It asserts the signature shape rather than assuming it: if the marker
 * ever stops matching, this THROWS instead of returning an empty region that every scoped
 * assertion below would pass against vacuously.
 */
function functionRegion(source: string, name: string): string {
  const marker = `export async function ${name}(): Promise<number> {`
  const at = source.indexOf(marker)
  if (at === -1) {
    throw new Error(
      `${PROCESSOR_PATH}: no \`${marker}\` in the stripped source. Every region-scoped assertion ` +
        `would otherwise be scoped to nothing and pass vacuously.`
    )
  }

  let depth = 1
  let i = at + marker.length
  let quote: string | null = null

  while (i < source.length && depth > 0) {
    const ch = source[i]

    if (quote) {
      if (ch === "\\") {
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") quote = ch
    else if (ch === "{") depth += 1
    else if (ch === "}") depth -= 1

    i += 1
  }

  if (depth !== 0) throw new Error(`${PROCESSOR_PATH}: unterminated body for ${name}`)

  return source.slice(at + marker.length, i - 1)
}

interface UpdateChain {
  /** Every object handed to `.set(...)`, in call order. */
  setArgs: Record<string, unknown>[]
  /** Every condition handed to `.where(...)`, in call order. */
  whereArgs: unknown[]
  set: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  returning: ReturnType<typeof vi.fn>
  then: (
    onFulfilled?: ((value: undefined) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null
  ) => Promise<unknown>
}

/**
 * A drizzle update-builder stand-in.
 *
 * `set` and `where` return the chain, `returning` resolves the next queued result, and `then`
 * makes a bare `await db.update(...).set(...).where(...)` (the run transition, which takes no
 * `.returning()`) resolve like the real thenable builder does.
 *
 * `returningResults` is consumed one entry per `.returning()` call, so a two-step claim can have
 * the first win and the second lose.
 */
function makeUpdateChain(returningResults: unknown[][] = [[{ id: "step-1" }]]): UpdateChain {
  const setArgs: Record<string, unknown>[] = []
  const whereArgs: unknown[] = []

  const returning = vi.fn()
  for (const result of returningResults) returning.mockResolvedValueOnce(result)
  returning.mockResolvedValue([])

  const set = vi.fn()
  const where = vi.fn()

  const chain: UpdateChain = {
    setArgs,
    whereArgs,
    set,
    where,
    returning,
    then: (onFulfilled, onRejected) => Promise.resolve(undefined).then(onFulfilled, onRejected),
  }

  set.mockImplementation((vals: Record<string, unknown>) => {
    setArgs.push(vals)
    return chain
  })
  where.mockImplementation((cond: unknown) => {
    whereArgs.push(cond)
    return chain
  })

  return chain
}

/** A ready-step row exactly as the `readySteps` SELECT hands it back. */
function readyStep(id: string, runId: string) {
  return { id, run_id: runId, resume_at: new Date(Date.now() - 60_000) }
}

describe("execution-processor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecuteRun.mockResolvedValue(undefined)
    // Run the transaction body inline, handing the callback the same mock the non-transactional
    // statements use.
    mockDb.transaction.mockImplementation(async (fn: (tx: typeof mockDb) => unknown) =>
      fn(mockDb)
    )
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

    it("leaves its single-statement claim SQL untouched by the A3 fix", async () => {
      mockDb.execute.mockResolvedValueOnce([])

      const { processPendingRuns } = await import("./execution-processor")
      await processPendingRuns()

      const claimSql = (
        mockDb.execute.mock.calls[0][0] as { strings: TemplateStringsArray }
      ).strings.join("?")

      // The pending claim is ONE statement, so its FOR UPDATE SKIP LOCKED and its atomic
      // UPDATE ... RETURNING are already multi-instance safe. A3 is about the WAITING claim only;
      // "fixing" this one would be churn on the one claim path that was never broken.
      expect(claimSql).toContain("SET status = 'running', started_at = NOW()")
      expect(claimSql).toContain("wr.status = 'pending'")
      expect(claimSql).toContain("NOT EXISTS")
      expect(claimSql).toContain("FOR UPDATE SKIP LOCKED")
      expect(claimSql).toContain("RETURNING *")
    })
  })

  describe("processWaitingRuns", () => {
    it("resumes a waiting run whose resume_at has elapsed", async () => {
      // Query returns waiting steps past resume_at
      mockDb.execute.mockResolvedValueOnce([readyStep("step-1", "run-1")])
      mockDb.update.mockReturnValue(makeUpdateChain([[{ id: "step-1" }]]))

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
      mockDb.execute.mockResolvedValueOnce([readyStep("step-1", "run-1")])
      const chain = makeUpdateChain([[{ id: "step-1" }]])
      mockDb.update.mockReturnValue(chain)

      const { processWaitingRuns } = await import("./execution-processor")
      await processWaitingRuns()

      // The run's transition back to 'running' must refresh the lease:
      // started_at still holds the pre-delay claim time, and the stale-run
      // reclaim would otherwise fail the run the moment it resumes. The A3 refactor moved this
      // write; it must not have dropped the reset.
      const runUpdate = chain.setArgs.find(v => v.status === "running")
      expect(
        runUpdate,
        "The resumed run must still be transitioned back to 'running'."
      ).toBeDefined()
      expect(
        runUpdate!.startedAt,
        "started_at still holds the ORIGINAL pre-delay claim time, possibly hours old, and " +
          "reclaimStaleRuns measures the 5-minute execution lease against it. Without this reset a " +
          "legitimately resumed run is reclaimed and failed on the very next tick (T-41-69)."
      ).toBeInstanceOf(Date)
    })

    // ---------------------------------------------------------------------------------------------
    // CONTEXT amendment A3 — the atomic, status-guarded claim.
    // ---------------------------------------------------------------------------------------------

    it("claims each ready step with an UPDATE guarded on BOTH the step id and the waiting status", async () => {
      mockDb.execute.mockResolvedValueOnce([readyStep("step-1", "run-1")])
      const chain = makeUpdateChain([[{ id: "step-1" }]])
      mockDb.update.mockReturnValue(chain)

      const { processWaitingRuns } = await import("./execution-processor")
      await processWaitingRuns()

      // ANTI-VACUITY: a short-circuit that never issued the claim at all would leave whereArgs
      // empty, and every `toContain` below would then be inspecting `undefined`.
      expect(
        chain.whereArgs.length,
        "No UPDATE ... WHERE was issued at all, so the guard cannot be inspected."
      ).toBeGreaterThan(0)

      const guard = JSON.stringify(chain.whereArgs[0] ?? null)
      expect(guard).not.toBe("null")

      const why =
        "Without `AND status = 'waiting'` IN the write, two instances both select the same ready " +
        "step -- the SELECT's FOR UPDATE SKIP LOCKED locks drop at statement end on a " +
        "transaction-free postgres-js client (src/db/index.ts:1-13) -- and both call executeRun, " +
        "duplicating every side effect after the delay (T-41-68)."
      expect(guard, why).toContain("workflowRunSteps.id")
      expect(guard, why).toContain("step-1")
      expect(guard, why).toContain("workflowRunSteps.status")
      expect(guard, why).toContain("waiting")
    })

    it("skips the run when the guarded claim comes back with zero rows (the loser backs off)", async () => {
      mockDb.execute.mockResolvedValueOnce([readyStep("step-1", "run-1")])
      const chain = makeUpdateChain([[]]) // another instance won this step
      mockDb.update.mockReturnValue(chain)

      const { processWaitingRuns } = await import("./execution-processor")
      const count = await processWaitingRuns()

      expect(
        chain.returning,
        "The step claim must ask for `.returning({ id })`. The guard is only useful if the loser " +
          "can tell it lost."
      ).toHaveBeenCalled()
      expect(
        mockExecuteRun,
        "Zero rows back means another instance already claimed this step. Resuming anyway is the " +
          "double-execution this fix exists to prevent."
      ).not.toHaveBeenCalled()
      expect(count).toBe(0)
    })

    it("resumes the run when the guarded claim wins its one row", async () => {
      // The anti-vacuity pair for the test above: without this, a processWaitingRuns that never
      // resumed anything at all would satisfy the zero-row assertion.
      mockDb.execute.mockResolvedValueOnce([readyStep("step-1", "run-1")])
      const chain = makeUpdateChain([[{ id: "step-1" }]])
      mockDb.update.mockReturnValue(chain)

      const { processWaitingRuns } = await import("./execution-processor")
      const count = await processWaitingRuns()

      expect(mockExecuteRun).toHaveBeenCalledTimes(1)
      expect(mockExecuteRun).toHaveBeenCalledWith("run-1")
      expect(count).toBe(1)
    })

    it("continues to the next ready step when a claim is lost, rather than breaking the drain", async () => {
      mockDb.execute.mockResolvedValueOnce([
        readyStep("step-1", "run-1"),
        readyStep("step-2", "run-2"),
      ])
      // First claim wins, second is lost to another instance.
      const chain = makeUpdateChain([[{ id: "step-1" }], []])
      mockDb.update.mockReturnValue(chain)

      const { processWaitingRuns } = await import("./execution-processor")
      const count = await processWaitingRuns()

      expect(
        chain.returning,
        "Both ready steps must be attempted. A `continue` that became a `break` would stop the " +
          "drain at the first lost claim and strand every later elapsed delay until the next tick."
      ).toHaveBeenCalledTimes(2)
      expect(mockExecuteRun).toHaveBeenCalledTimes(1)
      expect(mockExecuteRun).toHaveBeenCalledWith("run-1")
      expect(count).toBe(1)
    })

    it("issues exactly one ready-step query per call", async () => {
      // ANTI-VACUITY for the mock sequence: if the claim were skipped entirely, or the SELECT
      // issued twice, the queued mockResolvedValueOnce values would not line up and the
      // assertions above could pass for the wrong reason.
      mockDb.execute.mockResolvedValueOnce([readyStep("step-1", "run-1")])
      mockDb.update.mockReturnValue(makeUpdateChain([[{ id: "step-1" }]]))

      const { processWaitingRuns } = await import("./execution-processor")
      await processWaitingRuns()

      expect(mockDb.execute).toHaveBeenCalledTimes(1)
      const selectSql = (
        mockDb.execute.mock.calls[0][0] as { strings: TemplateStringsArray }
      ).strings.join("?")
      expect(selectSql).toContain("wrs.status = 'waiting'")
      expect(selectSql).toContain("wrs.resume_at <= NOW()")
    })

    it("does not leave an ineffective FOR UPDATE SKIP LOCKED outside a transaction", async () => {
      const source = readStrippedSource(PROCESSOR_PATH)
      const region = functionRegion(source, "processWaitingRuns")

      // ANTI-VACUITY: an empty or whole-file region would make the negative half trivially true.
      expect(region.length).toBeGreaterThan(0)
      expect(region.length).toBeLessThan(source.length)

      const wrapped = source.includes("db.transaction")
      const clauseGone = !region.includes("FOR UPDATE SKIP LOCKED")

      expect(
        wrapped || clauseGone,
        "A3 leaves the choice open but not un-made. Either wrap the SELECT and the claim in " +
          "`db.transaction` so the FOR UPDATE SKIP LOCKED row locks actually hold past the " +
          "statement, or drop the clause because the guarded per-step UPDATE ... RETURNING now " +
          "does the work. A FOR UPDATE SKIP LOCKED left outside a transaction on a postgres-js " +
          "client is misleading documentation in code form: it reads as concurrency-safe and is not."
      ).toBe(true)
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
