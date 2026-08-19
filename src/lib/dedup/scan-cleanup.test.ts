import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * THIS TEST PROVES THE FUNCTION. IT DOES NOT PROVE THE FUNCTION RUNS.
 *
 * Everything below runs against a mocked `@/db` inside vitest, so it can only show that
 * `cleanupStaleDedupScans` issues the right three statements and swallows a failure. Whether the
 * reaper is actually invoked at container boot is a completely separate question, because
 * `instrumentation.ts` registration is not evidence of execution: `Dockerfile:24` copies the built
 * `instrumentation.js` into `.next/standalone/` with a step ending in `2>/dev/null || true`, so a
 * build whose chunk layout changes fails silently and `register()` never runs. That exact breakage
 * killed all four background processors in production on 2026-08-08 **while every test passed** —
 * conflating "the unit test is green" with "the reaper runs" IS the 2026-08-08 failure mode.
 *
 * The gate for execution is behavioural and lives outside this file:
 *   docker compose up -d --build app
 *   rtk proxy docker compose logs app --tail 300 | grep -F '[dedup-scan-cleanup] Starting'
 * (plain `docker compose logs` is intercepted by the RTK hook, which digests the output and hides
 * startup lines — `rtk proxy` is required for raw output).
 */

vi.mock("@/db", () => ({
  db: {
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { db } from "@/db"
import { cleanupStaleDedupScans } from "./scan-cleanup"

const mockDb = db as unknown as {
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

/**
 * Column names, raw SQL text, and bound string parameters reachable inside a drizzle `SQL` tree.
 *
 * The bound parameters matter here: a predicate that mentions `status` proves nothing on its own,
 * because `status = 'idle'` and `status = 'running'` reap opposite sets of rows. `JSON.stringify` is
 * not an option — a Column holds a back-reference to its table and the structure is circular.
 */
function sqlTokens(node: unknown, acc: string[] = []): string[] {
  if (node === null || typeof node !== "object") return acc
  if (Array.isArray(node)) {
    for (const child of node) sqlTokens(child, acc)
    return acc
  }
  const record = node as Record<string, unknown>
  if (typeof record.name === "string") acc.push(record.name)
  if (typeof record.value === "string") acc.push(record.value)
  if (Array.isArray(record.value)) {
    for (const chunk of record.value) {
      if (typeof chunk === "string") acc.push(chunk)
      else sqlTokens(chunk, acc)
    }
  }
  if (Array.isArray(record.queryChunks)) sqlTokens(record.queryChunks, acc)
  return acc
}

/**
 * Every bound `Date` parameter inside a drizzle condition. This is what turns "there is a
 * `created_at <` somewhere" into "the cutoff is one hour / thirty days", which is the part of a
 * retention rule that can silently drift.
 */
function sqlDates(node: unknown, acc: Date[] = []): Date[] {
  if (node === null || typeof node !== "object") return acc
  if (Array.isArray(node)) {
    for (const child of node) sqlDates(child, acc)
    return acc
  }
  const record = node as Record<string, unknown>
  if (record.value instanceof Date) acc.push(record.value)
  if (Array.isArray(record.value)) sqlDates(record.value, acc)
  if (Array.isArray(record.queryChunks)) sqlDates(record.queryChunks, acc)
  return acc
}

const NOW = new Date("2026-08-19T12:00:00Z")

function setupChains() {
  const updateReturning = vi.fn().mockResolvedValue([{ id: "stranded-1" }])
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning })
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
  mockDb.update.mockReturnValue({ set: updateSet })

  const deleteReturning = vi.fn().mockResolvedValue([])
  const deleteWhere = vi.fn().mockReturnValue({ returning: deleteReturning })
  mockDb.delete.mockReturnValue({ where: deleteWhere })

  return { updateSet, updateWhere, deleteWhere, deleteReturning }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.update.mockReset()
  mockDb.delete.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("cleanupStaleDedupScans", () => {
  it("marks every running scan as error, which is the crash recovery", async () => {
    const { updateSet, updateWhere } = setupChains()

    await cleanupStaleDedupScans()

    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(updateSet.mock.calls[0][0]).toMatchObject({ status: "error" })
    expect(updateSet.mock.calls[0][0].updatedAt).toBeInstanceOf(Date)
    const tokens = sqlTokens(updateWhere.mock.calls[0][0])
    expect(tokens).toContain("status")
    // UI-SPEC P-7 disables the CTA while a scan of that type is running. Without this statement a
    // restart mid-scan leaves the row at `running` forever and the button never comes back.
    expect(tokens).toContain("running")
  })

  it("deletes idle scans older than one hour", async () => {
    const { deleteWhere } = setupChains()

    await cleanupStaleDedupScans()

    const idlePredicate = deleteWhere.mock.calls[0][0]
    const tokens = sqlTokens(idlePredicate)
    expect(tokens).toContain("status")
    expect(tokens).toContain("created_at")
    // Both conjuncts, and the RIGHT status: deleting `running` rows here instead of marking them
    // `error` would destroy the crash-recovery audit trail statement 1 exists to leave behind.
    expect(tokens).toContain("idle")
    expect(tokens).not.toContain("running")
    expect(sqlDates(idlePredicate)).toEqual([new Date(NOW.getTime() - 60 * 60 * 1000)])
  })

  it("deletes any scan older than thirty days, regardless of status", async () => {
    const { deleteWhere } = setupChains()

    await cleanupStaleDedupScans()

    expect(mockDb.delete).toHaveBeenCalledTimes(2)
    const oldPredicate = deleteWhere.mock.calls[1][0]
    const tokens = sqlTokens(oldPredicate)
    expect(tokens).toContain("created_at")
    // Retention is unconditional: a completed or cancelled scan is pruned too.
    expect(tokens).not.toContain("status")
    expect(sqlDates(oldPredicate)).toEqual([new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)])
  })

  it("logs a startup line unconditionally, even when nothing is stale", async () => {
    // THE ONE DELIBERATE DIVERGENCE FROM `cleanupStaleImportSessions`, which logs only when
    // `total > 0` and prints no startup line at all — leaving a behavioural gate nothing to grep.
    // This assertion is here so the divergence cannot be "tidied" back into the analog's shape.
    const updateReturning = vi.fn().mockResolvedValue([])
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning })
    mockDb.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: updateWhere }) })
    const deleteReturning = vi.fn().mockResolvedValue([])
    mockDb.delete.mockReturnValue({ where: vi.fn().mockReturnValue({ returning: deleteReturning }) })
    const log = vi.spyOn(console, "log").mockImplementation(() => {})

    await cleanupStaleDedupScans()

    const lines = log.mock.calls.map((call) => String(call[0]))
    expect(lines.some((line) => line.includes("[dedup-scan-cleanup] Starting"))).toBe(true)
    // And a result line after the work, also unconditional.
    expect(lines.length).toBeGreaterThanOrEqual(2)
    log.mockRestore()
  })

  it("swallows a failing query instead of propagating it into register()", async () => {
    // A throw here would abort `instrumentation.ts` register() partway through and take every
    // processor registered after this line with it.
    mockDb.update.mockImplementation(() => {
      throw new Error("connection terminated")
    })
    const error = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(cleanupStaleDedupScans()).resolves.toBeUndefined()

    expect(String(error.mock.calls[0]?.[0])).toContain("[dedup-scan-cleanup]")
    error.mockRestore()
  })

  it("still logs the startup line when the work then fails", async () => {
    mockDb.update.mockImplementation(() => {
      throw new Error("connection terminated")
    })
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})

    await cleanupStaleDedupScans()

    // The behavioural gate greps for `Starting`. If that line moved inside the try/catch after the
    // first query, a DB hiccup at boot would make the gate report "the reaper never ran".
    expect(log.mock.calls.map((call) => String(call[0])).some((line) => line.includes("[dedup-scan-cleanup] Starting"))).toBe(true)
    vi.restoreAllMocks()
  })
})
