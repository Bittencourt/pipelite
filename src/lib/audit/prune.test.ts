/**
 * AUDIT-04 — the retention pruner.
 *
 * No other processor in this repo has a test: nothing references `startExecutionProcessor`,
 * `startWebhookProcessor`, `startEmailProcessor`, `startScheduleProcessor` or
 * `cleanupStaleImportSessions` from a spec, and there is no fake-timer precedent for a
 * `setTimeout` chain. So this suite is the first, and it pins down four properties that are
 * invisible in a code read:
 *
 *   1. FAILS CLOSED. `readRetentionDays()` resolving `null` means ZERO database calls in that
 *      tick — asserted by the ABSENCE of a `db.execute` call, not by a zero row count. `null`
 *      is what a cleared, corrupted, tampered or pre-migration settings row produces; the
 *      90-day default is a SEEDED `app_settings` row from migration 0014, not a code fallback
 *      (T-36-18).
 *   2. CAPPED. Each tick stops after `MAX_BATCHES_PER_TICK` batches so no single tick can hold
 *      a long write lock on the largest table in the schema (T-36-39).
 *   3. THE `ctid` FORM. Measured on a 1,000,000-row probe in steady state:
 *        - `ctid IN (SELECT ctid … LIMIT 5000)` with the `created_at` index →  17.8 ms
 *        - `id   IN (SELECT id   … LIMIT 5000)` with the `created_at` index → 311.5 ms
 *        - `ctid IN (…)` with NO index                                      → 395.7 ms
 *      The `id IN` form is what a careful engineer reaches for first and it is the
 *      second-worst option EVEN WITH the index, because the planner turns it into a Hash Semi
 *      Join over a full Seq Scan. Do not "simplify" the pruner back to it.
 *   4. ALWAYS RESCHEDULES. The tail `scheduleTick` sits OUTSIDE the `try`. A pruner that stops
 *      rescheduling after one bad read is a silently disabled retention policy, which is the
 *      AUDIT-04 failure mode (T-36-19).
 *
 * `@/db` is mocked down to a single `execute`: any other query the implementation grows
 * surfaces as a TypeError instead of being absorbed by a permissive mock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

vi.mock("@/db", () => ({ db: { execute: vi.fn() } }))
vi.mock("@/lib/audit/settings", () => ({ readRetentionDays: vi.fn() }))

import { db } from "@/db"
import { readRetentionDays } from "@/lib/audit/settings"
import {
  startAuditPruner,
  BATCH_SIZE,
  MAX_BATCHES_PER_TICK,
  INITIAL_DELAY,
  TICK_INTERVAL,
} from "./prune"

const mockExecute = (db as unknown as { execute: ReturnType<typeof vi.fn> }).execute
const mockReadRetentionDays = vi.mocked(readRetentionDays)

const dialect = new PgDialect()

/**
 * What postgres.js hands back from a `DELETE`: a row list carrying the affected count. The
 * `ctid` form cannot use drizzle's `.returning({ id })` (the analog in
 * `import-session-cleanup.ts:26` does), so the count has to come off the result itself.
 */
function deleteResult(count: number): unknown {
  return Object.assign([], { count })
}

/** The statement `db.execute` was called with, rendered to real SQL text + bind params. */
function renderedCall(index = 0): { sql: string; params: unknown[] } {
  const arg = mockExecute.mock.calls[index]?.[0] as SQL | undefined
  if (!arg) throw new Error(`db.execute was not called ${index + 1} time(s)`)
  const { sql, params } = dialect.sqlToQuery(arg)
  return { sql, params: params as unknown[] }
}

function logLines(): string[] {
  const spy = console.log as unknown as ReturnType<typeof vi.fn>
  return spy.mock.calls.map((call: unknown[]) => call.join(" "))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})

  mockReadRetentionDays.mockResolvedValue(90)
  mockExecute.mockResolvedValue(deleteResult(0))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("startAuditPruner", () => {
  it("schedules the first tick at INITIAL_DELAY rather than running immediately", async () => {
    startAuditPruner()

    expect(vi.getTimerCount()).toBe(1)
    expect(mockReadRetentionDays).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(INITIAL_DELAY - 1)
    expect(mockReadRetentionDays).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(mockReadRetentionDays).toHaveBeenCalledTimes(1)
  })

  it("announces itself on start — the container log line is how a dead instrumentation module is detected", () => {
    startAuditPruner()

    expect(logLines().some((line) => line.includes("[audit-prune]"))).toBe(true)
  })

  it("schedules the following tick a full TICK_INTERVAL later", async () => {
    startAuditPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    expect(mockReadRetentionDays).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(TICK_INTERVAL - 1)
    expect(mockReadRetentionDays).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(mockReadRetentionDays).toHaveBeenCalledTimes(2)
  })
})

describe("retention window", () => {
  it("fails closed: a null retention window issues no database call at all", async () => {
    mockReadRetentionDays.mockResolvedValue(null)

    startAuditPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    // The absence of the call is the assertion. A zero row count would also pass a naive
    // check while an unbounded DELETE was already in flight.
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it("fails closed: it records that nothing was deleted", async () => {
    mockReadRetentionDays.mockResolvedValue(null)

    startAuditPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    const line = logLines().find((l) => l.includes("retention"))
    expect(line).toBeDefined()
    expect(line).toContain("[audit-prune]")
  })

  it("stops after one batch once it is caught up", async () => {
    mockExecute.mockResolvedValue(deleteResult(BATCH_SIZE - 1))

    startAuditPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it("caps a single tick at exactly MAX_BATCHES_PER_TICK batches", async () => {
    // Every batch comes back full, i.e. there is always more to delete. The cap is what
    // stops one tick from holding a long write lock on the largest table in the schema.
    mockExecute.mockResolvedValue(deleteResult(BATCH_SIZE))

    startAuditPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    expect(mockExecute).toHaveBeenCalledTimes(MAX_BATCHES_PER_TICK)
  })

  it("logs the total deleted and the window every tick — the only signal it is falling behind", async () => {
    mockExecute
      .mockResolvedValueOnce(deleteResult(BATCH_SIZE))
      .mockResolvedValueOnce(deleteResult(7))

    startAuditPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    const line = logLines().find((l) => l.includes("deleted"))
    expect(line).toBeDefined()
    expect(line).toContain(String(BATCH_SIZE + 7))
    expect(line).toContain("90")
  })
})

describe("the delete statement", () => {
  it("deletes by ctid, never by id — the id IN form is a Hash Semi Join over a full Seq Scan", async () => {
    mockExecute.mockResolvedValue(deleteResult(1))

    startAuditPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    const { sql } = renderedCall()
    expect(sql).toContain("ctid IN (")
    expect(sql).not.toContain("id IN (SELECT id")
    expect(sql).toContain("audit_log")
  })

  it("computes the cutoff server-side with make_interval and binds no JS Date", async () => {
    mockExecute.mockResolvedValue(deleteResult(1))

    startAuditPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    const { sql, params } = renderedCall()
    expect(sql).toContain("make_interval(days =>")
    expect(params).toContain(90)
    expect(params).toContain(BATCH_SIZE)
    // `import-session-cleanup.ts:19` computes a JS Date cutoff. That is the one thing not to
    // copy: postgres.js throws ERR_INVALID_ARG_TYPE on a Date inside a raw fragment, and the
    // near-miss `${date}::timestamp` form re-serializes through a Date and truncates
    // microseconds.
    expect(params.some((p) => p instanceof Date)).toBe(false)
  })

  it("bounds each batch with a LIMIT in the subselect, since DELETE ... LIMIT is invalid in Postgres", async () => {
    mockExecute.mockResolvedValue(deleteResult(1))

    startAuditPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    const { sql } = renderedCall()
    expect(sql).toContain("SELECT ctid")
    expect(sql).toContain("LIMIT")
    expect(sql).toMatch(/created_at\s*<\s*now\(\)/)
  })
})

describe("the chain always reschedules", () => {
  it("leaves a pending timer when reading the retention window rejects", async () => {
    mockReadRetentionDays.mockRejectedValue(new Error("settings read blew up"))

    startAuditPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    // A pruner that stops rescheduling after one bad read is a silently disabled retention
    // policy — the AUDIT-04 failure mode.
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1)
    expect(console.error).toHaveBeenCalled()
  })

  it("leaves a pending timer when the delete itself rejects, and still runs the next tick", async () => {
    mockExecute.mockRejectedValue(new Error("deadlock detected"))

    startAuditPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1)

    mockExecute.mockResolvedValue(deleteResult(0))
    await vi.advanceTimersByTimeAsync(TICK_INTERVAL)

    expect(mockReadRetentionDays).toHaveBeenCalledTimes(2)
  })
})
