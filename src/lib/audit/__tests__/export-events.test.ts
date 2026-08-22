/**
 * AN EXPORT LEAVES A TRACE (review WR-04).
 *
 * WHAT THIS CONTROL IS, STATED PLAINLY SO NOBODY MISREADS IT LATER. Phase 38 gated a
 * filters-taking export behind an admin check; Phase 40 Decision 2 (E-9) replaced that gate with
 * `guardExportInput`, which refuses an EMPTY filter set but is satisfied by `search=a` — 44,254 of
 * 46,054 organizations, measured twice against the live database. This module does **not** bound
 * that. It makes it ATTRIBUTABLE: who exported, which entity type, under which filters, how many
 * rows. Detection, not prevention. Anyone tempted to describe WR-04 as "fixed" because this file
 * exists should read `.planning/BACKLOG.md` first.
 *
 * WHY `action: "created"` AND NOT A NEW `"exported"` LITERAL. `AuditAction` is declared TWICE
 * (`src/db/schema/audit-log.ts` and `src/lib/timeline/types.ts`) and consumed by two exhaustive
 * `Record<AuditAction, …>` maps, so a new action is a four-file compile cascade plus
 * `audit-action-exhaustive.test.ts`. The import summary row set the precedent for a non-record
 * event: it reuses `"created"` and carries its meaning in `entity_type`. This follows it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

// `vi.hoisted` because the `vi.mock` factory is lifted above every top-level binding in this
// file; a plain `const` referenced from the factory throws "There was an error when mocking a
// module". Same pattern, same reason, as `src/lib/export/formatters.test.ts`.
const spies = vi.hoisted(() => {
  // The parameter is DECLARED even though the body ignores it: an argument-less `vi.fn` types its
  // `mock.calls` as a zero-length tuple, and every assertion below reads `calls[0][0]`.
  const insertValues = vi.fn(async (row: Record<string, unknown>) => void row)
  return { insertValues, insertInto: vi.fn(() => ({ values: insertValues })) }
})
const { insertValues } = spies

vi.mock("@/db", () => ({
  db: { insert: spies.insertInto },
}))

import { recordExport } from "../export-events"

beforeEach(() => {
  vi.clearAllMocks()
  insertValues.mockImplementation(async () => undefined)
})

/** The single row this module writes, read back off the mock. */
function writtenRow(): Record<string, unknown> {
  expect(insertValues).toHaveBeenCalledTimes(1)
  return insertValues.mock.calls[0][0] as unknown as Record<string, unknown>
}

describe("recordExport", () => {
  it("writes exactly one row, under the export entity type", async () => {
    await recordExport({
      actorUserId: "user-1",
      entityType: "organization",
      filters: { search: "a" },
      rowCount: 44254,
    })

    const row = writtenRow()

    expect(row.entityType).toBe("export")
    // `"created"` is reused deliberately — see this file's header.
    expect(row.action).toBe("created")
  })

  it("attributes the export to the authenticated user", async () => {
    await recordExport({
      actorUserId: "user-1",
      entityType: "organization",
      filters: { search: "a" },
      rowCount: 10,
    })

    const row = writtenRow()

    expect(row.actorKind).toBe("user")
    expect(row.actorUserId).toBe("user-1")
    // Mutually exclusive with the other two actor references, as the schema intends.
    expect(row.workflowRunId).toBeNull()
    expect(row.importSessionId).toBeNull()
  })

  it("records what was exported, under which filters, and how many rows", async () => {
    await recordExport({
      actorUserId: "user-1",
      entityType: "organization",
      filters: { search: "a" },
      rowCount: 44254,
    })

    expect(writtenRow().changes).toEqual({
      exportedEntityType: { from: null, to: "organization" },
      rowCount: { from: null, to: 44254 },
      filters: { from: null, to: "search=a" },
    })
  })

  it("serialises a multi-key filter map deterministically, sorted by key", async () => {
    await recordExport({
      actorUserId: "user-1",
      entityType: "deal",
      filters: { owner: "u2", pipeline: "p1", dateFrom: "2026-01-01" },
      rowCount: 7,
    })

    const changes = writtenRow().changes as Record<string, { to: unknown }>

    expect(changes.filters.to).toBe("dateFrom=2026-01-01&owner=u2&pipeline=p1")
  })

  it("gives every export its own entity id", async () => {
    await recordExport({
      actorUserId: "u",
      entityType: "person",
      filters: { search: "x" },
      rowCount: 1,
    })
    await recordExport({
      actorUserId: "u",
      entityType: "person",
      filters: { search: "x" },
      rowCount: 1,
    })

    const [first, second] = insertValues.mock.calls.map(
      (call) => (call[0] as unknown as Record<string, unknown>).entityId
    )

    expect(first).toEqual(expect.any(String))
    expect(first).not.toBe(second)
  })

  /**
   * The import summary row swallows its own failure for a good reason — failing a completed import
   * because its audit row failed would report a lie about the user's own data. The same reasoning
   * applies here, and it leaves a REAL residual gap: an export whose audit write fails is an
   * unlogged export. It is loud in the log rather than silent, and it is recorded in BACKLOG.md.
   */
  it("never throws when the audit write fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    insertValues.mockImplementation(async () => {
      throw new Error("connection reset")
    })

    await expect(
      recordExport({
        actorUserId: "u",
        entityType: "activity",
        filters: { status: "pending" },
        rowCount: 3,
      })
    ).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it("drops an ids filter rather than serialising a selection into the log", async () => {
    // `ids` is unreachable from a view export by construction (it is on no whitelist row), so a
    // value here means a caller passed a bulk-selection map. Recording 100 uuids as a filter
    // string would be noise; the row count already says how much left.
    await recordExport({
      actorUserId: "u",
      entityType: "deal",
      filters: { ids: ["a", "b"], owner: "u2" },
      rowCount: 2,
    })

    const changes = writtenRow().changes as Record<string, { to: unknown }>

    expect(changes.filters.to).toBe("owner=u2")
  })
})
