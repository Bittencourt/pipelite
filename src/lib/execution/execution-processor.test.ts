import { readFileSync } from "node:fs"

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

// Mock the failure alert (plan 41-08's module). It is deliberately a thin wrapper so the tests can
// make it reject AND make it throw synchronously -- two different failure shapes that a call site
// must both survive.
const mockAlert = vi.fn()
vi.mock("./failure-alert", () => ({
  maybeAlertOnRunFailure: (...args: unknown[]) => mockAlert(...args),
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
    // mockReset, not mockClear: a test that made the alert reject or throw must not leak that
    // implementation into the next test.
    mockAlert.mockReset()
    mockAlert.mockResolvedValue(undefined)
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

  // -----------------------------------------------------------------------------------------------
  // WFOPS-03 / CONTEXT amendment A4 — the failure alert DETECTS, it does not hook.
  //
  // executeRun does not throw when a run fails: it calls failRun() internally
  // (src/lib/execution/engine.ts:551-562) and returns normally. So there is no failure path to
  // hook, the catch around executeRun only ever sees UNEXPECTED exceptions, and the alert call has
  // to sit after the try/catch and be made unconditionally -- maybeAlertOnRunFailure re-reads the
  // run's terminal status itself.
  // -----------------------------------------------------------------------------------------------
  describe("the failure alert", () => {
    const AFTER_NOT_INSIDE =
      "executeRun RETURNS NORMALLY for a failed run -- it calls failRun() internally " +
      "(engine.ts:551-562) rather than throwing -- so a call site that only fired inside the catch " +
      "would never alert on the ordinary failure WFOPS-03 is about (T-41-71)."

    describe("site 1: processPendingRuns", () => {
      it("alerts after executeRun returns successfully", async () => {
        mockDb.execute
          .mockResolvedValueOnce([{ id: "run-1", workflow_id: "wf-1", status: "running" }])
          .mockResolvedValueOnce([])

        const { processPendingRuns } = await import("./execution-processor")
        await processPendingRuns()

        // ANTI-VACUITY: a call site that was never added passes every "does not abort" assertion
        // further down, so the happy path is asserted to alert a NON-zero number of times first.
        expect(mockAlert.mock.calls.length, AFTER_NOT_INSIDE).toBeGreaterThan(0)
        expect(mockAlert).toHaveBeenCalledWith("run-1")
      })

      it("alerts, and still logs, when executeRun throws", async () => {
        mockDb.execute
          .mockResolvedValueOnce([{ id: "run-1", workflow_id: "wf-1", status: "running" }])
          .mockResolvedValueOnce([])
        mockExecuteRun.mockRejectedValueOnce(new Error("db went away mid-run"))
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

        try {
          const { processPendingRuns } = await import("./execution-processor")
          const count = await processPendingRuns()

          // An unexpected exception is also a failure the operator should hear about, and the run
          // row may or may not have been marked failed -- which is exactly why the alert re-reads
          // it rather than being told.
          expect(mockAlert).toHaveBeenCalledWith("run-1")
          expect(consoleError).toHaveBeenCalled()
          expect(count).toBe(1)
        } finally {
          consoleError.mockRestore()
        }
      })

      it("alerts exactly once per claimed run over a multi-run drain, in claim order", async () => {
        mockDb.execute
          .mockResolvedValueOnce([{ id: "run-a" }])
          .mockResolvedValueOnce([{ id: "run-b" }])
          .mockResolvedValueOnce([])

        const { processPendingRuns } = await import("./execution-processor")
        await processPendingRuns()

        expect(mockAlert).toHaveBeenCalledTimes(2)
        expect(mockAlert.mock.calls.map(c => c[0])).toEqual(["run-a", "run-b"])
      })
    })

    describe("site 2: processWaitingRuns", () => {
      it("alerts after a resumed run's executeRun returns successfully", async () => {
        mockDb.execute.mockResolvedValueOnce([readyStep("step-1", "run-1")])
        mockDb.update.mockReturnValue(makeUpdateChain([[{ id: "step-1" }]]))

        const { processWaitingRuns } = await import("./execution-processor")
        await processWaitingRuns()

        expect(mockAlert.mock.calls.length, AFTER_NOT_INSIDE).toBeGreaterThan(0)
        expect(mockAlert).toHaveBeenCalledWith("run-1")
      })

      it("alerts, and still logs, when a resumed run's executeRun throws", async () => {
        mockDb.execute.mockResolvedValueOnce([readyStep("step-1", "run-1")])
        mockDb.update.mockReturnValue(makeUpdateChain([[{ id: "step-1" }]]))
        mockExecuteRun.mockRejectedValueOnce(new Error("resume blew up"))
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

        try {
          const { processWaitingRuns } = await import("./execution-processor")
          await processWaitingRuns()

          expect(mockAlert).toHaveBeenCalledWith("run-1")
          expect(consoleError).toHaveBeenCalled()
        } finally {
          consoleError.mockRestore()
        }
      })

      it("alerts once per resumed run over a two-step batch, in order", async () => {
        mockDb.execute.mockResolvedValueOnce([
          readyStep("step-1", "run-1"),
          readyStep("step-2", "run-2"),
        ])
        mockDb.update.mockReturnValue(makeUpdateChain([[{ id: "step-1" }], [{ id: "step-2" }]]))

        const { processWaitingRuns } = await import("./execution-processor")
        const count = await processWaitingRuns()

        expect(count).toBe(2)
        expect(mockAlert).toHaveBeenCalledTimes(2)
        expect(mockAlert.mock.calls.map(c => c[0])).toEqual(["run-1", "run-2"])
      })

      it("does NOT alert for a step whose claim was lost", async () => {
        // The loser did not fail this run and did not run it -- the winner will alert if it failed.
        mockDb.execute.mockResolvedValueOnce([readyStep("step-1", "run-1")])
        mockDb.update.mockReturnValue(makeUpdateChain([[]]))

        const { processWaitingRuns } = await import("./execution-processor")
        await processWaitingRuns()

        expect(mockAlert).not.toHaveBeenCalled()
      })
    })

    describe("site 3: reclaimStaleRuns", () => {
      const LEASE_CASE =
        "A run killed by the 5-minute execution lease NEVER passes through executeRun at all, so " +
        "no other call site can see it. It is precisely the 'fails silently forever' case WFOPS-03 " +
        "is named for, and missing this call site would leave the requirement's headline scenario " +
        "uncovered while every other test passed (T-41-72)."

      it("alerts once per reclaimed run id", async () => {
        mockDb.execute
          .mockResolvedValueOnce([]) // orphaned step cleanup
          .mockResolvedValueOnce([{ id: "run-stale-1" }, { id: "run-stale-2" }])

        const { reclaimStaleRuns } = await import("./execution-processor")
        const count = await reclaimStaleRuns()

        expect(count).toBe(2)
        expect(mockAlert.mock.calls.length, LEASE_CASE).toBe(2)
        expect(mockAlert).toHaveBeenCalledWith("run-stale-1")
        expect(mockAlert).toHaveBeenCalledWith("run-stale-2")
      })

      it("does not alert when nothing exceeded the lease", async () => {
        mockDb.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([])

        const { reclaimStaleRuns } = await import("./execution-processor")
        const count = await reclaimStaleRuns()

        expect(count).toBe(0)
        expect(mockAlert).not.toHaveBeenCalled()
      })

      it("does not alert and does not throw when the reclaim result is undefined", async () => {
        // postgres-js does not always hand back a plain array; the `?.length ?? 0` idiom on the
        // count line already tolerates this, and the alert loop has to as well.
        mockDb.execute.mockResolvedValueOnce([]).mockResolvedValueOnce(undefined)

        const { reclaimStaleRuns } = await import("./execution-processor")
        const count = await reclaimStaleRuns()

        expect(count).toBe(0)
        expect(mockAlert).not.toHaveBeenCalled()
      })
    })

    describe("tick resilience — the alerting system must not become the outage", () => {
      const MUST_NOT_ABORT =
        "An escaping alert failure inside processPendingRuns' `while (true)` drain aborts the tick " +
        "and leaves every remaining pending run unclaimed until the next 5-second poll, or longer " +
        "if it keeps happening. safeSend RETHROWS on transport failure, so this is a live shape, " +
        "not a hypothetical (T-41-70)."

      it("survives an alert that REJECTS, and still drains the rest of the queue", async () => {
        mockDb.execute
          .mockResolvedValueOnce([{ id: "run-a" }])
          .mockResolvedValueOnce([{ id: "run-b" }])
          .mockResolvedValueOnce([])
        mockAlert.mockRejectedValueOnce(new Error("smtp relay refused the connection"))
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

        try {
          const { processPendingRuns } = await import("./execution-processor")
          const count = await processPendingRuns()

          expect(mockExecuteRun, MUST_NOT_ABORT).toHaveBeenCalledWith("run-b")
          expect(count, MUST_NOT_ABORT).toBe(2)
        } finally {
          consoleError.mockRestore()
        }
      })

      it("survives an alert that throws SYNCHRONOUSLY, and still drains the rest of the queue", async () => {
        mockDb.execute
          .mockResolvedValueOnce([{ id: "run-a" }])
          .mockResolvedValueOnce([{ id: "run-b" }])
          .mockResolvedValueOnce([])
        mockAlert.mockImplementationOnce(() => {
          throw new TypeError("alert module blew up before returning a promise")
        })
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

        try {
          const { processPendingRuns } = await import("./execution-processor")
          const count = await processPendingRuns()

          // Asserted SEPARATELY from the rejection case on purpose: a bare
          // `void maybeAlertOnRunFailure(id)` handles the rejected promise and NOT this.
          expect(mockExecuteRun, MUST_NOT_ABORT).toHaveBeenCalledWith("run-b")
          expect(count, MUST_NOT_ABORT).toBe(2)
        } finally {
          consoleError.mockRestore()
        }
      })

      it("survives an alert that rejects while resuming, and still resumes the rest", async () => {
        mockDb.execute.mockResolvedValueOnce([
          readyStep("step-1", "run-1"),
          readyStep("step-2", "run-2"),
        ])
        mockDb.update.mockReturnValue(makeUpdateChain([[{ id: "step-1" }], [{ id: "step-2" }]]))
        mockAlert.mockRejectedValueOnce(new Error("smtp relay refused the connection"))
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

        try {
          const { processWaitingRuns } = await import("./execution-processor")
          const count = await processWaitingRuns()

          expect(mockExecuteRun, MUST_NOT_ABORT).toHaveBeenCalledWith("run-2")
          expect(count, MUST_NOT_ABORT).toBe(2)
        } finally {
          consoleError.mockRestore()
        }
      })

      it("survives an alert that rejects while reclaiming, and still returns the count", async () => {
        mockDb.execute
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: "run-stale-1" }, { id: "run-stale-2" }])
        mockAlert.mockRejectedValueOnce(new Error("smtp relay refused the connection"))
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

        try {
          const { reclaimStaleRuns } = await import("./execution-processor")
          const count = await reclaimStaleRuns()

          // reclaimStaleRuns runs FIRST in the tick and its failure would keep processPendingRuns
          // and processWaitingRuns from running at all.
          expect(mockAlert, MUST_NOT_ABORT).toHaveBeenCalledTimes(2)
          expect(count, MUST_NOT_ABORT).toBe(2)
        } finally {
          consoleError.mockRestore()
        }
      })
    })

    it("is invoked from all three terminal-state paths", () => {
      const source = readStrippedSource(PROCESSOR_PATH)

      for (const name of ["reclaimStaleRuns", "processPendingRuns", "processWaitingRuns"]) {
        const region = functionRegion(source, name)
        expect(region.length).toBeGreaterThan(0)
        expect(region.length).toBeLessThan(source.length)

        // Either a direct `maybeAlertOnRunFailure(...)` or one local resilience wrapper whose name
        // mentions the alert -- the plan leaves that choice open, so the assertion does not force it.
        // The leading character class is `*`, not `+`: a callee named `alertOnRunFailure` starts
        // WITH "alert", and a required leading char would eat its "a" and never match.
        expect(
          /\b[A-Za-z0-9_$]*[Aa]lert[A-Za-z0-9_$]*\(/.test(region),
          `${name} does not invoke the failure alert. All three are terminal-failure paths, and ` +
            `each sees a failure class the other two cannot: an ordinary failed run, a run that ` +
            `failed hours after a delay when nobody was watching, and a run killed by the ` +
            `execution lease.`
        ).toBe(true)
      }
    })

    it("records the two coverage gaps it deliberately does NOT close", () => {
      // Raw source, NOT comment-stripped: the point is that the comment exists.
      const raw = readFileSync(PROCESSOR_PATH, "utf8")
      const why =
        "Closing either gap means alerting from inside a live HTTP request, which is the reason " +
        "CONTEXT put the hook in the processor at all. They are accepted and documented (T-41-73, " +
        "plan 41-04's deployment docs), not silently shipped -- so the note has to be here too, " +
        "where the next reader asks why these three sites and not five."
      expect(raw.toLowerCase(), why).toContain("recursion")
      expect(raw.toLowerCase(), why).toContain("webhook")
    })

    it("does not reach into the run-creation or webhook paths", () => {
      const source = readStrippedSource(PROCESSOR_PATH)

      // Both were considered and rejected: they would put email latency inside a live request.
      expect(source).not.toContain("@/lib/triggers/create-run")
      expect(source).not.toContain("createWorkflowRun")
    })
  })
})
