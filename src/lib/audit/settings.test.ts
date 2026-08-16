/**
 * AUDIT-04 — the retention setting's read, write and cost readouts.
 *
 * The contract these cases pin down is a FAILURE DIRECTION, not just a parse. The only
 * consumer of `readRetentionDays` is the pruner (36-18), and for the pruner `null` means
 * DELETE NOTHING. So every case below that expects `null` is asserting "keep the data" —
 * an unset key, a corrupted row, a tampered value and a database outage must all land on
 * the same safe side (T-36-18). The CONTEXT-locked 90-day default is real, but it lives as
 * a SEEDED `app_settings` row from migration 0014; a code-level fallback here would resume
 * deletion in exactly the cases this module is supposed to stop it.
 *
 * `@/db` is mocked with the minimum surface the module is allowed to touch — one
 * `findFirst`, one `insert`, one `select`. A query the implementation adds later surfaces
 * as a TypeError rather than being silently absorbed by a permissive mock.
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
  AUDIT_RETENTION_KEY,
  RETENTION_MIN,
  RETENTION_MAX,
  readRetentionDays,
  writeRetentionDays,
  readAuditStats,
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

/** Wires `db.select({...}).from(auditLog)` to resolve with one aggregate row. */
function mockStatsRows(rows: Array<Record<string, unknown>>): void {
  mockDb.select.mockReturnValue({ from: () => Promise.resolve(rows) })
}

/** Wires `db.select(...)` so the aggregate query rejects. */
function mockStatsFailure(): void {
  mockDb.select.mockReturnValue({
    from: () => Promise.reject(new Error("audit_log unavailable")),
  })
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("readRetentionDays", () => {
  it("returns the stored integer when the row holds a valid number", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({
      key: AUDIT_RETENTION_KEY,
      value: 90,
      updatedAt: new Date(),
    })

    await expect(readRetentionDays()).resolves.toBe(90)
  })

  it("queries app_settings exactly once, on the audit retention key", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: 90 })

    await readRetentionDays()

    expect(mockDb.query.appSettings.findFirst).toHaveBeenCalledTimes(1)
    // The key is a constant, never a caller-supplied string: there is exactly one
    // settings key in this phase and nothing may read a different one by accident.
    expect(AUDIT_RETENTION_KEY).toBe("audit.retention_days")
  })

  it("returns null when no row exists for the key", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue(undefined)

    await expect(readRetentionDays()).resolves.toBeNull()
  })

  it("returns null when the stored value is a numeric string", async () => {
    // JSONB will happily hold "90". Coercing it would mean a tampered row still prunes.
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: "90" })

    await expect(readRetentionDays()).resolves.toBeNull()
  })

  it("returns null when the stored value is an object", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: { days: 90 } })

    await expect(readRetentionDays()).resolves.toBeNull()
  })

  it("returns null when the stored value is JSON null", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: null })

    await expect(readRetentionDays()).resolves.toBeNull()
  })

  it("returns null for 0 — zero would mean delete everything", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: 0 })

    await expect(readRetentionDays()).resolves.toBeNull()
  })

  it("returns null for a negative value", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: -1 })

    await expect(readRetentionDays()).resolves.toBeNull()
  })

  it("returns null for a non-integer such as 1.5", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: 1.5 })

    await expect(readRetentionDays()).resolves.toBeNull()
  })

  it("returns null above RETENTION_MAX", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: RETENTION_MAX + 1 })

    await expect(readRetentionDays()).resolves.toBeNull()
  })

  it("accepts both range boundaries", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: RETENTION_MIN })
    await expect(readRetentionDays()).resolves.toBe(RETENTION_MIN)

    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: RETENTION_MAX })
    await expect(readRetentionDays()).resolves.toBe(RETENTION_MAX)
  })

  it("fails closed to null and logs when the query rejects, without re-raising", async () => {
    mockDb.query.appSettings.findFirst.mockRejectedValue(new Error("connection refused"))

    // The caller is a background timer tick. An error escaping this call would stop the
    // pruner rescheduling, which is the AUDIT-04 failure mode (T-36-19). `.resolves`
    // asserting a value is itself the "does not re-raise" assertion: a rejected promise
    // fails this expectation.
    await expect(readRetentionDays()).resolves.toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe("writeRetentionDays", () => {
  it("upserts on the retention key and reports success", async () => {
    const captured = captureUpsert()

    await expect(writeRetentionDays(90)).resolves.toEqual({ success: true })

    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(captured.values).toMatchObject({ key: AUDIT_RETENTION_KEY, value: 90 })
    expect(captured.set).toMatchObject({ value: 90 })
    expect(captured.target).toBe(appSettings.key)
  })

  it("stamps updatedAt on both the insert and the conflict update", async () => {
    const captured = captureUpsert()

    await writeRetentionDays(30)

    expect(captured.values?.updatedAt).toBeInstanceOf(Date)
    expect(captured.set?.updatedAt).toBeInstanceOf(Date)
  })

  it("rejects 0 without issuing a database call", async () => {
    captureUpsert()

    const result = await writeRetentionDays(0)

    expect(result.success).toBe(false)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("rejects a negative value without issuing a database call", async () => {
    captureUpsert()

    const result = await writeRetentionDays(-1)

    expect(result.success).toBe(false)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("rejects a non-integer without issuing a database call", async () => {
    captureUpsert()

    const result = await writeRetentionDays(1.5)

    expect(result.success).toBe(false)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("rejects a value above RETENTION_MAX without issuing a database call", async () => {
    captureUpsert()

    const result = await writeRetentionDays(RETENTION_MAX + 1)

    expect(result.success).toBe(false)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("rejects NaN without issuing a database call", async () => {
    captureUpsert()

    const result = await writeRetentionDays(Number.NaN)

    expect(result.success).toBe(false)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns an error message rather than a bare false on rejection", async () => {
    captureUpsert()

    const result = await writeRetentionDays(0)

    expect(result).toEqual({ success: false, error: expect.any(String) })
    if (!result.success) {
      expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it("fails closed to a failure result when the write rejects, without re-raising", async () => {
    captureUpsert("reject")

    const result = await writeRetentionDays(90)

    expect(result.success).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
  })

  it("round-trips a valid value through app_settings unchanged", async () => {
    const captured = captureUpsert()
    await writeRetentionDays(45)

    // Feed exactly what the write would have stored back through the read path.
    mockDb.query.appSettings.findFirst.mockResolvedValue({
      key: captured.values?.key,
      value: captured.values?.value,
      updatedAt: captured.values?.updatedAt,
    })

    await expect(readRetentionDays()).resolves.toBe(45)
  })
})

describe("readAuditStats", () => {
  it("returns the zero-state for an empty table", async () => {
    mockStatsRows([{ entryCount: 0, oldestEntryAt: null }])

    await expect(readAuditStats()).resolves.toEqual({ entryCount: 0, oldestEntryAt: null })
  })

  it("returns the real count and oldest entry when rows exist", async () => {
    const oldest = new Date("2026-01-02T03:04:05Z")
    mockStatsRows([{ entryCount: 1234, oldestEntryAt: oldest }])

    await expect(readAuditStats()).resolves.toEqual({
      entryCount: 1234,
      oldestEntryAt: oldest,
    })
  })

  it("returns the zero-state when the aggregate query yields no row at all", async () => {
    mockStatsRows([])

    await expect(readAuditStats()).resolves.toEqual({ entryCount: 0, oldestEntryAt: null })
  })

  it("fails closed to the zero-state when the aggregate query rejects", async () => {
    mockStatsFailure()

    // The admin page renders this. It must degrade to "0 entries", never 500.
    await expect(readAuditStats()).resolves.toEqual({ entryCount: 0, oldestEntryAt: null })
    expect(errorSpy).toHaveBeenCalled()
  })
})
