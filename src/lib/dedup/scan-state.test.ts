import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Unit tests for the `dedup_scans` state layer, with `@/db` mocked wholesale
 * (`src/lib/mutations/organizations.test.ts` is the house style for that).
 *
 * WHAT A MOCKED `db` CAN AND CANNOT PROVE: a mocked `findFirst` does not filter, so no assertion
 * here can show that a running *organization* scan is invisible to a *person* scan by observing a
 * returned row — the mock returns whatever it was told to. The honest proof is the PREDICATE: the
 * query must mention both `status` and `entity_type`, so the filtering happens in Postgres. That is
 * what "carries both predicates" asserts below, and it is the assertion that fails when the
 * `entityType` conjunct is removed.
 */

vi.mock("@/db", () => ({
  db: {
    query: {
      dedupScans: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
  },
}))

import { db } from "@/db"
import {
  createScanState,
  getScanState,
  getLatestScan,
  updateScanState,
  cancelScan,
  isScanCancelled,
  calculateScanProgress,
} from "./scan-state"

const findFirstMock = vi.mocked(db.query.dedupScans.findFirst)
const insertMock = db.insert as unknown as ReturnType<typeof vi.fn>
const updateMock = db.update as unknown as ReturnType<typeof vi.fn>

/**
 * Every identifier and literal fragment reachable inside a drizzle `SQL` tree: column names via
 * `name`, raw SQL text via a `StringChunk`'s `value` array. Cycle-safe — it only recurses into
 * arrays, `queryChunks` and `value`, never into a Column's back-reference to its table.
 *
 * Copied in shape from `referencedNames` in `src/lib/notes/authorize.test.ts` and
 * `referencedColumns` in `src/app/people/bulk-actions.test.ts`, widened to also collect the raw
 * text so an ORDER BY direction (` desc`) can be asserted, not just the column it sorts on.
 */
function sqlTokens(node: unknown, acc: string[] = []): string[] {
  if (node === null || typeof node !== "object") return acc
  if (Array.isArray(node)) {
    for (const child of node) sqlTokens(child, acc)
    return acc
  }
  const record = node as Record<string, unknown>
  if (typeof record.name === "string") acc.push(record.name)
  if (Array.isArray(record.value)) {
    for (const chunk of record.value) {
      if (typeof chunk === "string") acc.push(chunk)
      else sqlTokens(chunk, acc)
    }
  }
  if (Array.isArray(record.queryChunks)) sqlTokens(record.queryChunks, acc)
  return acc
}

/** The `db.insert(...).values(...)` chain. */
function setupInsert() {
  const valuesFn = vi.fn().mockResolvedValue(undefined)
  insertMock.mockReturnValue({ values: valuesFn })
  return valuesFn
}

/** The `db.update(...).set(...).where(...)` chain. */
function setupUpdate() {
  const whereFn = vi.fn().mockResolvedValue(undefined)
  const setFn = vi.fn().mockReturnValue({ where: whereFn })
  updateMock.mockReturnValue({ set: setFn })
  return { setFn, whereFn }
}

function scanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "scan-1",
    userId: "user-1",
    entityType: "organization",
    status: "running",
    progress: { current: 5, total: 100 },
    cancelled: false,
    createdAt: new Date("2026-08-19T10:00:00Z"),
    updatedAt: new Date("2026-08-19T10:00:00Z"),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // `vi.clearAllMocks()` clears call records but does not drain a `mockResolvedValueOnce` queue,
  // and it leaves no default behind either — reset explicitly so a test that short-circuits cannot
  // hand its leftovers to the next one.
  findFirstMock.mockReset()
  insertMock.mockReset()
  updateMock.mockReset()
})

describe("createScanState", () => {
  it("inserts a running, uncancelled row for the given entity type", async () => {
    findFirstMock.mockResolvedValue(undefined)
    const valuesFn = setupInsert()

    const state = await createScanState("scan-1", "organization", "user-1")

    expect(valuesFn).toHaveBeenCalledTimes(1)
    const inserted = valuesFn.mock.calls[0][0]
    expect(inserted).toMatchObject({
      id: "scan-1",
      userId: "user-1",
      entityType: "organization",
      status: "running",
      cancelled: false,
      progress: { current: 0, total: 0 },
    })
    expect(state.status).toBe("running")
    expect(state.entityType).toBe("organization")
    expect(state.cancelled).toBe(false)
  })

  it("refuses when a scan of the SAME entity type is already running", async () => {
    findFirstMock.mockResolvedValue(scanRow())
    const valuesFn = setupInsert()

    await expect(createScanState("scan-2", "organization", "user-1")).rejects.toThrow(
      "A scan is already running for this entity type"
    )
    // Fail-closed: the refusal must happen BEFORE the insert, not be cleaned up after it.
    expect(valuesFn).not.toHaveBeenCalled()
  })

  it("scopes the running-scan guard to the entity type, so a different type does not block", async () => {
    // THE CORRECTION TO THE ANALOG. `createImportState` refuses when ANY session is running, with
    // no entity-type scope; copying that verbatim would let a running organization scan disable the
    // person scan CTA, contradicting UI-SPEC P-7 ("a scan of that entity type"). Removing
    // `eq(dedupScans.entityType, entityType)` from the guard makes THIS test fail and no other.
    findFirstMock.mockResolvedValue(undefined)
    const valuesFn = setupInsert()

    await createScanState("scan-3", "person", "user-1")

    expect(findFirstMock).toHaveBeenCalledTimes(1)
    const tokens = sqlTokens(findFirstMock.mock.calls[0][0]?.where)
    expect(tokens).toContain("status")
    expect(tokens).toContain("entity_type")
    // Not merely "nothing threw": the row was actually written.
    expect(valuesFn).toHaveBeenCalledTimes(1)
    expect(valuesFn.mock.calls[0][0]).toMatchObject({ entityType: "person", status: "running" })
  })
})

describe("updateScanState", () => {
  it("merges the supplied progress keys into the stored JSONB without clobbering the rest", async () => {
    findFirstMock.mockResolvedValue(scanRow({ progress: { current: 5, total: 100 } }))
    const { setFn } = setupUpdate()

    await updateScanState("scan-1", { current: 42 })

    expect(setFn).toHaveBeenCalledTimes(1)
    // `total` was not supplied and must survive the write.
    expect(setFn.mock.calls[0][0].progress).toEqual({ current: 42, total: 100 })
  })

  it("sets a terminal status and touches updatedAt", async () => {
    findFirstMock.mockResolvedValue(scanRow())
    const { setFn } = setupUpdate()

    await updateScanState("scan-1", { status: "completed" })

    const written = setFn.mock.calls[0][0]
    expect(written.status).toBe("completed")
    expect(written.updatedAt).toBeInstanceOf(Date)
  })

  it("does not throw when the row is missing", async () => {
    findFirstMock.mockResolvedValue(undefined)
    setupUpdate()

    await expect(updateScanState("nope", { current: 1 })).resolves.toBeUndefined()
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe("cancelScan", () => {
  it("raises the cancelled flag and never writes a terminal status", async () => {
    const { setFn } = setupUpdate()

    await cancelScan("scan-1")

    const written = setFn.mock.calls[0][0]
    expect(written.cancelled).toBe(true)
    // The scan loop polls `isScanCancelled` and writes `status: 'cancelled'` itself. If cancel wrote
    // the status here, cancelling a scan that had just finished would rewrite `completed`.
    expect(written).not.toHaveProperty("status")
  })
})

describe("isScanCancelled", () => {
  it("returns the stored flag", async () => {
    findFirstMock.mockResolvedValue({ cancelled: true })
    await expect(isScanCancelled("scan-1")).resolves.toBe(true)
  })

  it("returns false rather than throwing when the row is missing", async () => {
    findFirstMock.mockResolvedValue(undefined)
    await expect(isScanCancelled("gone")).resolves.toBe(false)
  })
})

describe("getLatestScan", () => {
  it("orders by createdAt descending, scoped to the entity type", async () => {
    findFirstMock.mockResolvedValue(scanRow())

    const state = await getLatestScan("organization")

    const call = findFirstMock.mock.calls[0][0]
    expect(sqlTokens(call?.where)).toContain("entity_type")
    const orderTokens = sqlTokens(call?.orderBy)
    expect(orderTokens).toContain("created_at")
    expect(orderTokens.join("")).toContain("desc")
    expect(state?.scanId).toBe("scan-1")
  })

  it("returns null when there is no scan of that type", async () => {
    findFirstMock.mockResolvedValue(undefined)
    await expect(getLatestScan("person")).resolves.toBeNull()
  })
})

describe("fail-closed reads (S-5)", () => {
  it("getScanState returns null when the query rejects", async () => {
    findFirstMock.mockRejectedValue(new Error("connection terminated"))
    await expect(getScanState("scan-1")).resolves.toBeNull()
  })

  it("getLatestScan returns null when the query rejects", async () => {
    findFirstMock.mockRejectedValue(new Error("connection terminated"))
    await expect(getLatestScan("organization")).resolves.toBeNull()
  })

  it("isScanCancelled returns false when the query rejects", async () => {
    findFirstMock.mockRejectedValue(new Error("connection terminated"))
    await expect(isScanCancelled("scan-1")).resolves.toBe(false)
  })
})

describe("calculateScanProgress", () => {
  it("returns 0 when nothing is known yet, rather than dividing by zero", () => {
    expect(calculateScanProgress({ current: 0, total: 0 })).toBe(0)
  })

  it("returns a rounded integer percentage for UI-SPEC P-1's determinate bar", () => {
    expect(calculateScanProgress({ current: 1, total: 3 })).toBe(33)
    expect(calculateScanProgress({ current: 46054, total: 46054 })).toBe(100)
  })

  it("clamps above 100 so a miscounted total cannot overflow the track", () => {
    expect(calculateScanProgress({ current: 120, total: 100 })).toBe(100)
  })
})

describe("no authorization in the state layer (T-39-08)", () => {
  it("exposes userId so the server action can make the P-6 ownership comparison", async () => {
    findFirstMock.mockResolvedValue(scanRow({ userId: "starter-1" }))
    const state = await getScanState("scan-1")
    expect(state?.userId).toBe("starter-1")
  })
})
