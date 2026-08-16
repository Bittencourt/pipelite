/**
 * TRASH-03's automatic half — the daily trash retention pruner.
 *
 * Structured after `src/lib/audit/prune.test.ts`, which is this repo's only fake-timer suite. The
 * four properties it pins are invisible in a code read and none of them are caught by typecheck:
 *
 *   1. FAILS CLOSED. `readTrashRetentionDays()` resolving `null` means ZERO database calls AND
 *      ZERO purges in that tick — asserted by the ABSENCE of both, not by a zero count. A zero
 *      purge count would also pass a naive check while an unbounded delete was already in flight.
 *      `null` is what a cleared, corrupted, tampered, out-of-range or pre-migration settings row
 *      produces; the 30-day default is a SEEDED `app_settings` row from migration 0015, not a
 *      code fallback (T-37-05).
 *   2. LEAVES FIRST, AND FIXED. The four types are queried in `TRASH_PRUNE_ORDER` — activity,
 *      deal, person, organization — asserted on the SEQUENCE of rendered statements rather than
 *      on a set, because "all four were queried" is true of every wrong order too.
 *   3. CAPPED. `BATCH_SIZE` × `MAX_BATCHES_PER_TICK` per entity type per day is the ceiling on how
 *      long one tick can hold write locks (T-37-06). Starvation is the accepted cost, which is
 *      why the total is logged EVERY tick, even at zero.
 *   4. ALWAYS RESCHEDULES. The tail `scheduleTick` sits OUTSIDE the `try`. A pruner that stops
 *      rescheduling after one bad read is a silently disabled retention policy — exactly the
 *      failure mode of the setting it implements (T-37-29).
 *
 * `@/db` is mocked down to a single `execute`: any other query the implementation grows surfaces
 * as a TypeError instead of being absorbed by a permissive mock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"
import type { EntityType } from "@/db/schema/custom-fields"

vi.mock("@/db", () => ({ db: { execute: vi.fn() } }))
vi.mock("@/lib/trash/settings", () => ({ readTrashRetentionDays: vi.fn() }))
vi.mock("@/lib/trash/dispatch", () => ({ purgeRecordByType: vi.fn() }))
vi.mock("@/lib/audit/actor-context", () => ({ runWithActor: vi.fn() }))

import { db } from "@/db"
import { readTrashRetentionDays } from "@/lib/trash/settings"
import { purgeRecordByType } from "@/lib/trash/dispatch"
import { runWithActor } from "@/lib/audit/actor-context"
import { TRASH_PRUNE_ORDER } from "@/lib/trash/entity-types"
import {
  startTrashPruner,
  BATCH_SIZE,
  MAX_BATCHES_PER_TICK,
  INITIAL_DELAY,
  TICK_INTERVAL,
} from "./prune"

const mockExecute = (db as unknown as { execute: ReturnType<typeof vi.fn> }).execute
const mockReadRetentionDays = vi.mocked(readTrashRetentionDays)
const mockPurge = vi.mocked(purgeRecordByType)
const mockRunWithActor = vi.mocked(runWithActor)

const dialect = new PgDialect()

/**
 * The physical table behind each entity type, written out here rather than imported, so a
 * pruner that silently started reading the wrong table fails this suite instead of agreeing
 * with itself. `satisfies Record<EntityType, unknown>` makes a fifth entity type break THIS
 * FILE too, so the table cannot quietly stop being covered.
 */
const TABLE_FOR: Record<EntityType, string> = {
  activity: "activities",
  deal: "deals",
  person: "people",
  organization: "organizations",
} satisfies Record<EntityType, unknown>

/** What a `SELECT id …` batch comes back as: a row list from postgres.js. */
function idRows(count: number, prefix: string): unknown {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}` }))
}

/** The statement `db.execute` was called with, rendered to real SQL text + bind params. */
function renderedCall(index = 0): { sql: string; params: unknown[] } {
  const arg = mockExecute.mock.calls[index]?.[0] as SQL | undefined
  if (!arg) throw new Error(`db.execute was not called ${index + 1} time(s)`)
  const { sql, params } = dialect.sqlToQuery(arg)
  return { sql, params: params as unknown[] }
}

/** Which of the four tables each rendered statement names, in call order. */
function tablesQueried(): string[] {
  return mockExecute.mock.calls.map((_call: unknown[], index: number) => {
    const { sql } = renderedCall(index)
    const match = sql.match(/"(activities|deals|people|organizations)"/)
    return match?.[1] ?? `<no known table in: ${sql}>`
  })
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

  mockReadRetentionDays.mockResolvedValue(30)
  mockExecute.mockResolvedValue(idRows(0, "none"))
  mockPurge.mockResolvedValue({ success: true, detached: 0 })
  // The real one establishes an AsyncLocalStorage scope and then calls through; the mock keeps
  // the call-through so the purge still happens, and records the actor for assertion.
  mockRunWithActor.mockImplementation((_actor, fn) => fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("startTrashPruner", () => {
  it("schedules the first tick at INITIAL_DELAY rather than running immediately", async () => {
    startTrashPruner()

    expect(vi.getTimerCount()).toBe(1)
    expect(mockReadRetentionDays).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(INITIAL_DELAY - 1)
    expect(mockReadRetentionDays).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(mockReadRetentionDays).toHaveBeenCalledTimes(1)
  })

  it("announces itself on start — this exact line is the container deployment gate", () => {
    startTrashPruner()

    // Not decoration. `Dockerfile:24` ends in a suppressed failure, and a standalone build that
    // drops `instrumentation.js` kills every processor silently. The absence of this line in
    // `docker compose logs app` is the only way that is detected.
    expect(logLines().some((line) => line.includes("[trash-prune] Starting"))).toBe(true)
  })

  it("schedules the following tick a full TICK_INTERVAL later", async () => {
    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    expect(mockReadRetentionDays).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(TICK_INTERVAL - 1)
    expect(mockReadRetentionDays).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(mockReadRetentionDays).toHaveBeenCalledTimes(2)
  })
})

describe("the retention window fails closed", () => {
  it("issues no database call and no purge at all when the window is null", async () => {
    mockReadRetentionDays.mockResolvedValue(null)

    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    // BOTH absences are the assertion. A zero purge count would pass a naive check while an
    // unbounded expired-id query was already in flight.
    expect(mockExecute).not.toHaveBeenCalled()
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it("still records that nothing was purged", async () => {
    mockReadRetentionDays.mockResolvedValue(null)

    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    const line = logLines().find((l) => l.includes("retention unset or invalid"))
    expect(line).toBeDefined()
    expect(line).toContain("[trash-prune]")
  })

  it("still schedules the next tick, and that tick reads the window again", async () => {
    mockReadRetentionDays.mockResolvedValue(null)

    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1)

    await vi.advanceTimersByTimeAsync(TICK_INTERVAL)
    expect(mockReadRetentionDays).toHaveBeenCalledTimes(2)
  })
})

describe("the expired-id statement", () => {
  it("computes the cutoff server-side with make_interval and binds no JS Date", async () => {
    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    const { sql, params } = renderedCall()
    expect(sql).toContain("make_interval(days =>")
    expect(params).toContain(30)
    // A JS `Date` inside a raw fragment makes postgres.js throw ERR_INVALID_ARG_TYPE, and the
    // near-miss `${date}::timestamp` form silently truncates microseconds (STATE.md Phase 35).
    expect(params.some((p) => p instanceof Date)).toBe(false)
  })

  it("bounds each batch with a LIMIT and reads deleted_at, not created_at", async () => {
    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    const { sql, params } = renderedCall()
    expect(sql).toContain("LIMIT")
    expect(params).toContain(BATCH_SIZE)
    expect(sql).toMatch(/deleted_at"?\s*<\s*now\(\)/)
    expect(sql).not.toContain("created_at")
  })

  it("selects ids for a per-row teardown rather than issuing a bulk delete", async () => {
    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    const { sql } = renderedCall()
    expect(sql.toLowerCase()).toContain("select ")
    expect(sql.toLowerCase()).not.toContain("delete from")
  })
})

describe("the purge order", () => {
  it("queries the four tables in TRASH_PRUNE_ORDER — leaves first", async () => {
    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    // The sequence, not the set: "all four were queried" is true of every wrong order too. A
    // parent purged while a later pass is still detaching from it is the failure this prevents.
    expect(tablesQueried()).toEqual(["activities", "deals", "people", "organizations"])
    expect(tablesQueried()).toEqual(TRASH_PRUNE_ORDER.map((type) => TABLE_FOR[type]))
  })
})

describe("the per-record teardown", () => {
  it("purges every returned id exactly once, with its own entity type", async () => {
    mockExecute.mockImplementation(() => Promise.resolve(idRows(2, "x")))

    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    expect(mockPurge).toHaveBeenCalledTimes(8)

    for (const type of TRASH_PRUNE_ORDER) {
      expect(mockPurge).toHaveBeenCalledWith(type, "x-0")
      expect(mockPurge).toHaveBeenCalledWith(type, "x-1")
    }
  })

  it("runs every purge as an explicit system actor", async () => {
    mockExecute.mockImplementation(() => Promise.resolve(idRows(1, "a")))

    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    expect(mockRunWithActor).toHaveBeenCalledTimes(4)
    // "No actor established" and "genuinely system" must stay distinguishable — the subscriber's
    // absence fallback must never be what attributes an automated purge (T-37-08).
    for (const call of mockRunWithActor.mock.calls) {
      expect(call[0]).toEqual({ kind: "system", userId: null })
    }
  })

  it("logs the total purged and the window every tick, even at zero", async () => {
    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    // The zero line is the only signal that the cap is starving the delete rate.
    const line = logLines().find((l) => l.includes("purged"))
    expect(line).toBeDefined()
    expect(line).toContain("0")
    expect(line).toContain("30")
  })

  it("counts every purged record across all four types in that total", async () => {
    mockExecute.mockImplementation(() => Promise.resolve(idRows(3, "y")))

    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    const line = logLines().find((l) => l.includes("purged"))
    expect(line).toContain("12")
  })

  it("does not abort the rest of a batch when one record's purge rejects", async () => {
    mockExecute.mockImplementation(() => Promise.resolve(idRows(3, "z")))
    mockPurge.mockImplementation((_type, id) =>
      id === "z-1"
        ? Promise.reject(new Error("foreign key violation"))
        : Promise.resolve({ success: true, detached: 0 })
    )

    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    for (const type of TRASH_PRUNE_ORDER) {
      expect(mockPurge).toHaveBeenCalledWith(type, "z-2")
    }
    expect(console.error).toHaveBeenCalled()
    // The failed record is named by id and by nothing else — never by content (T-37-30).
    const line = logLines().find((l) => l.includes("purged"))
    expect(line).toContain("8")
  })
})

describe("the batch cap", () => {
  it("stops after one batch once a short batch comes back", async () => {
    mockExecute.mockImplementation(() => Promise.resolve(idRows(BATCH_SIZE - 1, "s")))

    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    // One per entity type: a short batch means nothing older is left in that table.
    expect(mockExecute).toHaveBeenCalledTimes(TRASH_PRUNE_ORDER.length)
  })

  it("caps a single tick at MAX_BATCHES_PER_TICK batches per entity type", async () => {
    // Every batch comes back full, i.e. there is always more to purge. The cap is what stops one
    // tick from holding a long window of write locks across four tables.
    mockExecute.mockImplementation(() => Promise.resolve(idRows(BATCH_SIZE, "f")))

    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    expect(mockExecute).toHaveBeenCalledTimes(MAX_BATCHES_PER_TICK * TRASH_PRUNE_ORDER.length)
  })

  it("stops re-reading a table when a full batch purged nothing at all", async () => {
    // A record that always fails is re-selected by the very next LIMIT query, so without this
    // the tick spins the cap on the same head-of-line rows and starves every table after it.
    mockExecute.mockImplementation(() => Promise.resolve(idRows(BATCH_SIZE, "stuck")))
    mockPurge.mockRejectedValue(new Error("still referenced"))

    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    expect(mockExecute).toHaveBeenCalledTimes(TRASH_PRUNE_ORDER.length)
  })
})

describe("the chain always reschedules", () => {
  it("leaves a pending timer when reading the retention window rejects", async () => {
    mockReadRetentionDays.mockRejectedValue(new Error("settings read blew up"))

    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1)
    expect(console.error).toHaveBeenCalled()
  })

  it("leaves a pending timer when the expired-id query rejects, and still runs the next tick", async () => {
    mockExecute.mockRejectedValue(new Error("deadlock detected"))

    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1)

    mockExecute.mockResolvedValue(idRows(0, "none"))
    await vi.advanceTimersByTimeAsync(TICK_INTERVAL)

    expect(mockReadRetentionDays).toHaveBeenCalledTimes(2)
  })

  it("leaves a pending timer when every purge rejects, and still runs the next tick", async () => {
    mockExecute.mockImplementation(() => Promise.resolve(idRows(1, "bad")))
    mockPurge.mockRejectedValue(new Error("purge exploded"))

    startTrashPruner()
    await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1)

    await vi.advanceTimersByTimeAsync(TICK_INTERVAL)

    expect(mockReadRetentionDays).toHaveBeenCalledTimes(2)
  })
})
