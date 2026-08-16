/**
 * TRASH-03 — the trash retention setting's read, write and cost readouts.
 *
 * The contract these cases pin down is a FAILURE DIRECTION, not just a parse. The consumer
 * of `readTrashRetentionDays` is the pruner, and for the pruner `null` means PURGE NOTHING.
 * So every case below that expects `null` is asserting "keep the data" — an unset key, a
 * corrupted row, a tampered value and a database outage must all land on the same safe side
 * (T-37-05). The 30-day default is real, but it lives as a SEEDED `app_settings` row from
 * migration 0015; a code-level fallback here would resume destroying records in exactly the
 * cases this module exists to stop it.
 *
 * `@/db` is mocked with the minimum surface the module is allowed to touch — one
 * `findFirst`, one `insert`, one `select`. A query the implementation adds later surfaces as
 * a TypeError rather than being silently absorbed by a permissive mock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/db", () => ({
  db: {
    query: { appSettings: { findFirst: vi.fn() } },
    insert: vi.fn(),
    select: vi.fn(),
  },
}))

import { db } from "@/db"
import { appSettings } from "@/db/schema/app-settings"
import {
  TRASH_RETENTION_KEY,
  RETENTION_MIN,
  RETENTION_MAX,
  readTrashRetentionDays,
  writeTrashRetentionDays,
  readTrashStats,
} from "./settings"

const mockDb = db as unknown as {
  query: { appSettings: { findFirst: ReturnType<typeof vi.fn> } }
  insert: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
}

/** What the upsert chain was called with, so the round trip can replay the stored value. */
interface CapturedUpsert {
  values: Record<string, unknown> | undefined
  set: Record<string, unknown> | undefined
  target: unknown
}

/** Wires `db.insert(...).values(...).onConflictDoUpdate(...)` and records every argument. */
function captureUpsert(behaviour: "resolve" | "reject" = "resolve"): CapturedUpsert {
  const captured: CapturedUpsert = { values: undefined, set: undefined, target: undefined }

  mockDb.insert.mockReturnValue({
    values: (v: Record<string, unknown>) => {
      captured.values = v
      return {
        onConflictDoUpdate: (config: { target: unknown; set: Record<string, unknown> }) => {
          captured.target = config.target
          captured.set = config.set
          return behaviour === "resolve"
            ? Promise.resolve(undefined)
            : Promise.reject(new Error("write failed"))
        },
      }
    },
  })

  return captured
}

/**
 * Wires `db.select({...}).from(table).where(...)` for each of the FOUR aggregate reads, in
 * the order the implementation issues them. The `.where` link is mandatory in the chain: the
 * trash surface is the only place in the codebase that inverts the live-record predicate, so
 * a `readTrashStats` that forgot `isNotNull(deletedAt)` must not typecheck past this mock.
 */
function mockStatsPerTable(perTable: Array<Array<Record<string, unknown>>>): void {
  let call = 0

  mockDb.select.mockImplementation(() => ({
    from: () => ({
      where: () => {
        const rows = perTable[call] ?? []
        call += 1
        return Promise.resolve(rows)
      },
    }),
  }))
}

/** Wires the aggregate reads so the `index`-th table's query rejects. */
function mockStatsFailure(index = 0): void {
  let call = 0

  mockDb.select.mockImplementation(() => ({
    from: () => ({
      where: () => {
        const current = call
        call += 1
        return current === index
          ? Promise.reject(new Error("relation unavailable"))
          : Promise.resolve([{ rowCount: 0, oldest: null }])
      },
    }),
  }))
}

let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("trash retention bounds", () => {
  it("pins RETENTION_MIN and RETENTION_MAX as literals", () => {
    // `retention-form.tsx` hardcodes the same two numbers in its `Input` min/max and the
    // "between 1 and 365" copy, and nothing else links them. Asserting the literals here is
    // what makes a change to either constant show up as a failing test rather than as UI
    // that silently disagrees with its own validator.
    expect(RETENTION_MIN).toBe(1)
    expect(RETENTION_MAX).toBe(365)
  })
})

describe("readTrashRetentionDays", () => {
  it("returns the stored integer when the row holds a valid number", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({
      key: TRASH_RETENTION_KEY,
      value: 30,
      updatedAt: new Date(),
    })

    await expect(readTrashRetentionDays()).resolves.toBe(30)
  })

  it("queries app_settings exactly once, on the trash retention key", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: 30 })

    await readTrashRetentionDays()

    expect(mockDb.query.appSettings.findFirst).toHaveBeenCalledTimes(1)
    // The key is a constant, never a caller-supplied string: nothing may read or write a
    // different settings key by accident.
    expect(TRASH_RETENTION_KEY).toBe("trash.retention_days")
  })

  it("returns null when no row exists for the key", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue(undefined)

    await expect(readTrashRetentionDays()).resolves.toBeNull()
  })

  it("returns null and warns for 0 — zero would mean purge everything", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: 0 })

    await expect(readTrashRetentionDays()).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it("returns null and warns for a negative value", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: -1 })

    await expect(readTrashRetentionDays()).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it("returns null and warns above RETENTION_MAX", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: 366 })

    await expect(readTrashRetentionDays()).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it("returns null and warns for a non-integer such as 1.5", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: 1.5 })

    await expect(readTrashRetentionDays()).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it("returns null and warns when the stored value is a numeric string", async () => {
    // JSONB will happily hold "30". Coercing it would mean a tampered row still purges.
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: "30" })

    await expect(readTrashRetentionDays()).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it("returns null and warns when the stored value is JSON null", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: null })

    await expect(readTrashRetentionDays()).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it("returns null and warns when the stored value is an object", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: { days: 30 } })

    await expect(readTrashRetentionDays()).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it("never names the stored value in the warning it logs", async () => {
    // T-37-09: the log lines carry the key and the bounds only. A tampered value echoed into
    // application logs is an information-disclosure path, and the codebase rule is
    // "identifiers and counts only".
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: "s3cret-looking-garbage" })

    await readTrashRetentionDays()

    const logged = warnSpy.mock.calls.flat().join(" ")
    expect(logged).not.toContain("s3cret-looking-garbage")
    expect(logged).toContain(TRASH_RETENTION_KEY)
  })

  it("accepts both range boundaries", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: RETENTION_MIN })
    await expect(readTrashRetentionDays()).resolves.toBe(RETENTION_MIN)

    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: RETENTION_MAX })
    await expect(readTrashRetentionDays()).resolves.toBe(RETENTION_MAX)
  })

  it("fails closed to null and logs when the query rejects, without re-raising", async () => {
    mockDb.query.appSettings.findFirst.mockRejectedValue(new Error("connection refused"))

    // The caller is a background timer tick. An error escaping this call would stop the
    // pruner rescheduling. `.resolves` asserting a value is itself the "does not re-raise"
    // assertion: a rejected promise fails this expectation.
    await expect(readTrashRetentionDays()).resolves.toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe("writeTrashRetentionDays", () => {
  it("upserts on the trash retention key and reports success", async () => {
    const captured = captureUpsert()

    await expect(writeTrashRetentionDays(45)).resolves.toEqual({ success: true })

    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(captured.values).toMatchObject({ key: "trash.retention_days", value: 45 })
    expect(captured.values?.updatedAt).toBeInstanceOf(Date)
    expect(captured.set).toMatchObject({ value: 45 })
    expect(captured.set?.updatedAt).toBeInstanceOf(Date)
    expect(captured.target).toBe(appSettings.key)
  })

  it("rejects 0 without issuing a database call", async () => {
    captureUpsert()

    const result = await writeTrashRetentionDays(0)

    expect(result.success).toBe(false)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("rejects a negative value without issuing a database call", async () => {
    captureUpsert()

    const result = await writeTrashRetentionDays(-1)

    expect(result.success).toBe(false)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("rejects a non-integer without issuing a database call", async () => {
    captureUpsert()

    const result = await writeTrashRetentionDays(1.5)

    expect(result.success).toBe(false)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("rejects a value above RETENTION_MAX without issuing a database call", async () => {
    captureUpsert()

    const result = await writeTrashRetentionDays(366)

    expect(result.success).toBe(false)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("rejects NaN without issuing a database call", async () => {
    captureUpsert()

    const result = await writeTrashRetentionDays(Number.NaN)

    expect(result.success).toBe(false)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns an error message rather than a bare false on rejection", async () => {
    captureUpsert()

    const result = await writeTrashRetentionDays(0)

    expect(result).toEqual({ success: false, error: expect.any(String) })
    if (!result.success) {
      expect(result.error).toContain("1")
      expect(result.error).toContain("365")
    }
  })

  it("fails closed to a failure result when the write rejects, without re-raising", async () => {
    captureUpsert("reject")

    const result = await writeTrashRetentionDays(30)

    expect(result.success).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
  })

  it("round-trips a valid value through app_settings unchanged", async () => {
    const captured = captureUpsert()
    await writeTrashRetentionDays(45)

    // Feed exactly what the write would have stored back through the read path.
    mockDb.query.appSettings.findFirst.mockResolvedValue({
      key: captured.values?.key,
      value: captured.values?.value,
      updatedAt: captured.values?.updatedAt,
    })

    await expect(readTrashRetentionDays()).resolves.toBe(45)
  })
})

describe("readTrashStats", () => {
  it("sums the four per-table counts and returns the earliest deletion", async () => {
    const earliest = new Date("2026-01-02T03:04:05Z")

    mockStatsPerTable([
      [{ rowCount: 3, oldest: new Date("2026-03-01T00:00:00Z") }],
      [{ rowCount: 5, oldest: earliest }],
      [{ rowCount: 0, oldest: null }],
      [{ rowCount: 4, oldest: new Date("2026-02-01T00:00:00Z") }],
    ])

    await expect(readTrashStats()).resolves.toEqual({
      trashedCount: 12,
      oldestDeletedAt: earliest,
    })
  })

  it("issues exactly four aggregate reads, one per soft-deletable table", async () => {
    mockStatsPerTable([
      [{ rowCount: 0, oldest: null }],
      [{ rowCount: 0, oldest: null }],
      [{ rowCount: 0, oldest: null }],
      [{ rowCount: 0, oldest: null }],
    ])

    await readTrashStats()

    expect(mockDb.select).toHaveBeenCalledTimes(4)
  })

  it("returns the zero-state when every table is empty", async () => {
    mockStatsPerTable([
      [{ rowCount: 0, oldest: null }],
      [{ rowCount: 0, oldest: null }],
      [{ rowCount: 0, oldest: null }],
      [{ rowCount: 0, oldest: null }],
    ])

    await expect(readTrashStats()).resolves.toEqual({
      trashedCount: 0,
      oldestDeletedAt: null,
    })
  })

  it("returns the zero-state when an aggregate query yields no row at all", async () => {
    mockStatsPerTable([[], [], [], []])

    await expect(readTrashStats()).resolves.toEqual({
      trashedCount: 0,
      oldestDeletedAt: null,
    })
  })

  it("fails closed to the zero-state when one table's query rejects", async () => {
    mockStatsFailure(2)

    // The admin page renders this. It must degrade to "0 in trash", never 500.
    await expect(readTrashStats()).resolves.toEqual({
      trashedCount: 0,
      oldestDeletedAt: null,
    })
    expect(errorSpy).toHaveBeenCalled()
  })
})
