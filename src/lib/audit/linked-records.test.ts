/**
 * 36-09 — the workflow run → records-changed reader.
 *
 * The whole value of this module is the FOLD, not the SQL: a run that touches the same deal in
 * three steps writes three audit rows and must produce exactly ONE entry whose `fieldCount` is
 * the UNION of the fields those rows changed. A mocked driver can see all of that, because the
 * fold happens in JavaScript on the rows the driver hands back.
 *
 * Two behaviours here are load-bearing and easy to "helpfully" break later:
 *
 *   1. A dead record is REPORTED, never dropped. The audit row is the fact that the run mutated
 *      it; a soft-delete filter on the title read would erase exactly the evidence the log
 *      exists to keep (the same posture audit-log.ts:40-46 takes on the missing FK).
 *   2. A query failure PROPAGATES. The consumer (36-16) catches and renders the degraded panel;
 *      a try/catch here would return `[]`, which renders "This run didn't change any records" —
 *      a lie the operator cannot tell apart from the truth. The rejection test below is the gate
 *      on that: an added try/catch turns it red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/db", () => ({
  db: { select: vi.fn() },
}))

import { db } from "@/db"
import { auditLog } from "@/db/schema/audit-log"
import type { AuditAction, AuditChanges, AuditEntityType } from "@/db/schema/audit-log"
import { deals } from "@/db/schema/deals"
import { organizations } from "@/db/schema/organizations"
import { people } from "@/db/schema/people"
import { activities } from "@/db/schema/activities"

import { readRunChangedRecords } from "./linked-records"

const mockDb = db as unknown as { select: ReturnType<typeof vi.fn> }

const RUN = "run-1"

/** Every table that reached `.from(...)`, with the `where` the builder finished with. */
interface SelectCall {
  fields: unknown
  table: unknown
  where: unknown
}
let selectCalls: SelectCall[] = []

/**
 * A thenable stand-in for the drizzle builder. `then` runs only once the chain is fully built,
 * so `rowsFor` sees the finished call. A `rowsFor` that throws REJECTS, which is how the
 * "query failure propagates" case is driven.
 */
function stubSelect(rowsFor: (call: SelectCall) => unknown[]) {
  mockDb.select.mockImplementation((fields?: unknown) => {
    const call: SelectCall = { fields, table: null, where: null }
    const chain: Record<string, unknown> = {}
    for (const method of ["from", "where", "orderBy", "limit"]) {
      chain[method] = vi.fn((arg: unknown) => {
        if (method === "from") {
          call.table = arg
          selectCalls.push(call)
        }
        if (method === "where") {
          call.where = arg
        }
        return chain
      })
    }
    chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      let rows: unknown[]
      try {
        rows = rowsFor(call)
      } catch (error) {
        return reject(error)
      }
      return resolve(rows)
    }
    return chain
  })
}

interface TableRows {
  audit?: unknown[]
  deals?: unknown[]
  organizations?: unknown[]
  people?: unknown[]
  activities?: unknown[]
}

/** Route rows by the table the builder selected from, so query ORDER is not asserted. */
function stubTables(rows: TableRows) {
  stubSelect((call) => {
    if (call.table === auditLog) return rows.audit ?? []
    if (call.table === deals) return rows.deals ?? []
    if (call.table === organizations) return rows.organizations ?? []
    if (call.table === people) return rows.people ?? []
    if (call.table === activities) return rows.activities ?? []
    return []
  })
}

function changeMap(fields: string[]): AuditChanges {
  return Object.fromEntries(fields.map((field) => [field, { from: null, to: "x" }]))
}

function audit(
  entityType: AuditEntityType,
  entityId: string,
  action: AuditAction,
  fields: string[],
  createdAt: string
) {
  return {
    entityType,
    entityId,
    action,
    changes: changeMap(fields),
    createdAt: new Date(createdAt),
  }
}

const dealRow = (id: string, title: string, deletedAt: Date | null = null) => ({
  id,
  title,
  deletedAt,
})
const orgRow = (id: string, name: string, deletedAt: Date | null = null) => ({
  id,
  name,
  deletedAt,
})
const personRow = (
  id: string,
  firstName: string,
  lastName: string,
  deletedAt: Date | null = null
) => ({ id, firstName, lastName, deletedAt })
const activityRow = (id: string, title: string, deletedAt: Date | null = null) => ({
  id,
  title,
  deletedAt,
})

function callsAgainst(table: unknown): SelectCall[] {
  return selectCalls.filter((call) => call.table === table)
}

beforeEach(() => {
  vi.clearAllMocks()
  selectCalls = []
})

describe("readRunChangedRecords", () => {
  it("returns an empty list for a run with no audit rows, and reads no titles", async () => {
    stubTables({ audit: [] })

    const result = await readRunChangedRecords(RUN)

    expect(result).toEqual([])
    // One query only: the audit read. Nothing to resolve titles for, so nothing is asked.
    expect(selectCalls).toHaveLength(1)
    expect(selectCalls[0].table).toBe(auditLog)
  })

  it("maps a single audit row to one entry carrying its type, id, action, field count and instant", async () => {
    stubTables({
      audit: [audit("deal", "d1", "updated", ["title", "value"], "2026-03-01T10:00:00Z")],
      deals: [dealRow("d1", "Acme renewal")],
    })

    const result = await readRunChangedRecords(RUN)

    expect(result).toEqual([
      {
        entityType: "deal",
        entityId: "d1",
        title: "Acme renewal",
        action: "updated",
        fieldCount: 2,
        occurredAt: new Date("2026-03-01T10:00:00Z"),
        deleted: false,
      },
    ])
  })

  it("collapses three audit rows for the same record into one distinct entry", async () => {
    stubTables({
      audit: [
        audit("deal", "d1", "updated", ["title"], "2026-03-01T10:00:00Z"),
        audit("deal", "d1", "updated", ["title", "value"], "2026-03-01T10:00:05Z"),
        audit("deal", "d1", "updated", ["ownerId"], "2026-03-01T10:00:09Z"),
      ],
      deals: [dealRow("d1", "Acme renewal")],
    })

    const result = await readRunChangedRecords(RUN)

    expect(result).toHaveLength(1)
    expect(result[0].entityId).toBe("d1")
  })

  it("unions distinct field names across rows rather than summing their counts", async () => {
    stubTables({
      audit: [
        audit("deal", "d1", "updated", ["title"], "2026-03-01T10:00:00Z"),
        audit("deal", "d1", "updated", ["title", "value"], "2026-03-01T10:00:05Z"),
        audit("deal", "d1", "updated", ["ownerId"], "2026-03-01T10:00:09Z"),
      ],
      deals: [dealRow("d1", "Acme renewal")],
    })

    const result = await readRunChangedRecords(RUN)

    // title, value, ownerId = 3 distinct fields. A sum of the three rows would be 4.
    expect(result[0].fieldCount).toBe(3)
  })

  it("reports the latest instant for a record within the run, not the first", async () => {
    stubTables({
      audit: [
        audit("deal", "d1", "updated", ["title"], "2026-03-01T10:00:00Z"),
        audit("deal", "d1", "updated", ["value"], "2026-03-01T10:00:05Z"),
        audit("deal", "d1", "updated", ["ownerId"], "2026-03-01T10:00:09Z"),
      ],
      deals: [dealRow("d1", "Acme renewal")],
    })

    expect((await readRunChangedRecords(RUN))[0].occurredAt).toEqual(
      new Date("2026-03-01T10:00:09Z")
    )

    // Same three instants, delivered out of order: the fold must take the MAX, not the last row.
    selectCalls = []
    stubTables({
      audit: [
        audit("deal", "d1", "updated", ["ownerId"], "2026-03-01T10:00:09Z"),
        audit("deal", "d1", "updated", ["title"], "2026-03-01T10:00:00Z"),
        audit("deal", "d1", "updated", ["value"], "2026-03-01T10:00:05Z"),
      ],
      deals: [dealRow("d1", "Acme renewal")],
    })

    expect((await readRunChangedRecords(RUN))[0].occurredAt).toEqual(
      new Date("2026-03-01T10:00:09Z")
    )
  })

  it("applies the action precedence deleted > created > updated", async () => {
    stubTables({
      audit: [
        audit("deal", "d1", "created", [], "2026-03-01T10:00:00Z"),
        audit("deal", "d1", "updated", ["value"], "2026-03-01T10:00:05Z"),
        audit("deal", "d1", "deleted", [], "2026-03-01T10:00:09Z"),
        audit("deal", "d2", "updated", ["title"], "2026-03-01T10:00:01Z"),
        audit("deal", "d2", "created", ["title"], "2026-03-01T10:00:02Z"),
        audit("organization", "o1", "updated", ["name"], "2026-03-01T10:00:03Z"),
      ],
      deals: [dealRow("d1", "Acme renewal"), dealRow("d2", "Globex expansion")],
      organizations: [orgRow("o1", "Initech")],
    })

    const byId = new Map((await readRunChangedRecords(RUN)).map((r) => [r.entityId, r.action]))

    // `deleted` wins even though a `created` row exists for the same record in the same run.
    expect(byId.get("d1")).toBe("deleted")
    // `created` wins over `updated` regardless of which row arrived last.
    expect(byId.get("d2")).toBe("created")
    expect(byId.get("o1")).toBe("updated")
  })

  it("reports a defined field count on a deleted entry — the tombstone's key count", async () => {
    // The UI omits the count for a tombstone, but the module still returns a NUMBER, and that
    // number is the tombstone's own key count rather than something incidental.
    stubTables({
      audit: [audit("deal", "d1", "deleted", ["title", "value", "ownerId"], "2026-03-01T10:00:00Z")],
      deals: [dealRow("d1", "Acme renewal", new Date("2026-03-01T10:00:00Z"))],
    })

    const result = await readRunChangedRecords(RUN)

    expect(result[0].action).toBe("deleted")
    expect(result[0].fieldCount).toBe(3)
  })

  it("resolves titles from each entity type's own title-bearing column", async () => {
    stubTables({
      audit: [
        audit("deal", "d1", "updated", ["title"], "2026-03-01T10:00:04Z"),
        audit("organization", "o1", "updated", ["name"], "2026-03-01T10:00:03Z"),
        audit("person", "p1", "updated", ["email"], "2026-03-01T10:00:02Z"),
        audit("activity", "a1", "updated", ["title"], "2026-03-01T10:00:01Z"),
      ],
      deals: [dealRow("d1", "Acme renewal")],
      organizations: [orgRow("o1", "Initech")],
      people: [personRow("p1", "Ada", "Lovelace")],
      activities: [activityRow("a1", "Follow-up call")],
    })

    const byId = new Map((await readRunChangedRecords(RUN)).map((r) => [r.entityId, r.title]))

    expect(byId.get("d1")).toBe("Acme renewal")
    expect(byId.get("o1")).toBe("Initech")
    // A person has no single title column — the display name is the same concatenation
    // `fetch-entities.ts:48-52` uses everywhere else in the product.
    expect(byId.get("p1")).toBe("Ada Lovelace")
    expect(byId.get("a1")).toBe("Follow-up call")
  })

  it("returns a null title for a record with no readable title value", async () => {
    stubTables({
      audit: [audit("person", "p1", "updated", ["email"], "2026-03-01T10:00:00Z")],
      people: [personRow("p1", "", "")],
    })

    // The consumer renders `audit.run.untitledRecord`. An empty string would render as a blank
    // link target, which reads as a rendering bug rather than as missing data.
    expect((await readRunChangedRecords(RUN))[0].title).toBeNull()
  })

  it("reports a soft-deleted record as deleted while still returning its title", async () => {
    stubTables({
      audit: [audit("deal", "d1", "updated", ["value"], "2026-03-01T10:00:00Z")],
      deals: [dealRow("d1", "Acme renewal", new Date("2026-03-02T00:00:00Z"))],
    })

    const result = await readRunChangedRecords(RUN)

    expect(result).toHaveLength(1)
    expect(result[0].deleted).toBe(true)
    // Title survives: the consumer renders it unlinked rather than hiding what the run touched.
    expect(result[0].title).toBe("Acme renewal")
  })

  it("keeps a hard-deleted record in the list with a null title and deleted true", async () => {
    stubTables({
      audit: [
        audit("deal", "d1", "updated", ["value"], "2026-03-01T10:00:00Z"),
        audit("deal", "gone", "updated", ["title"], "2026-03-01T10:00:01Z"),
      ],
      // `gone` has no row at all — the parent is physically absent.
      deals: [dealRow("d1", "Acme renewal")],
    })

    const result = await readRunChangedRecords(RUN)

    expect(result).toHaveLength(2)
    const missing = result.find((r) => r.entityId === "gone")
    expect(missing).toBeDefined()
    expect(missing?.title).toBeNull()
    expect(missing?.deleted).toBe(true)
    // The audit row IS the fact that the run mutated it; dropping the entry would erase that.
    expect(missing?.fieldCount).toBe(1)
  })

  it("orders results by occurredAt descending", async () => {
    stubTables({
      audit: [
        audit("deal", "d1", "updated", ["title"], "2026-03-01T10:00:00Z"),
        audit("organization", "o1", "updated", ["name"], "2026-03-01T10:00:20Z"),
        audit("activity", "a1", "updated", ["title"], "2026-03-01T10:00:10Z"),
      ],
      deals: [dealRow("d1", "Acme renewal")],
      organizations: [orgRow("o1", "Initech")],
      activities: [activityRow("a1", "Follow-up call")],
    })

    const result = await readRunChangedRecords(RUN)

    expect(result.map((r) => r.entityId)).toEqual(["o1", "a1", "d1"])
  })

  it("issues one title query per entity type present, not one per record", async () => {
    stubTables({
      audit: [
        audit("deal", "d1", "updated", ["title"], "2026-03-01T10:00:00Z"),
        audit("deal", "d2", "updated", ["title"], "2026-03-01T10:00:01Z"),
        audit("deal", "d3", "updated", ["title"], "2026-03-01T10:00:02Z"),
        audit("organization", "o1", "updated", ["name"], "2026-03-01T10:00:03Z"),
      ],
      deals: [dealRow("d1", "One"), dealRow("d2", "Two"), dealRow("d3", "Three")],
      organizations: [orgRow("o1", "Initech")],
    })

    await readRunChangedRecords(RUN)

    expect(callsAgainst(deals)).toHaveLength(1)
    expect(callsAgainst(organizations)).toHaveLength(1)
    // Types absent from the run are never queried at all.
    expect(callsAgainst(people)).toHaveLength(0)
    expect(callsAgainst(activities)).toHaveLength(0)
    // 1 audit read + 2 title reads.
    expect(selectCalls).toHaveLength(3)
  })

  it("ignores an import_session audit row, which belongs to no CRM record", async () => {
    // `AuditEntityType` is `EntityType | "import_session"`. An import summary row carries a
    // session id in `entity_id`, so it has no record page and must never appear in this list.
    stubTables({
      audit: [
        audit("import_session", "s1", "created", ["rows"], "2026-03-01T10:00:05Z"),
        audit("deal", "d1", "updated", ["title"], "2026-03-01T10:00:00Z"),
      ],
      deals: [dealRow("d1", "Acme renewal")],
    })

    const result = await readRunChangedRecords(RUN)

    expect(result.map((r) => r.entityId)).toEqual(["d1"])
  })

  it("propagates a query failure instead of degrading to an empty list", async () => {
    stubSelect(() => {
      throw new Error("connection terminated unexpectedly")
    })

    await expect(readRunChangedRecords(RUN)).rejects.toThrow(
      "connection terminated unexpectedly"
    )
  })

  it("propagates a failure of the title read, not just the audit read", async () => {
    stubSelect((call) => {
      if (call.table === auditLog) {
        return [audit("deal", "d1", "updated", ["title"], "2026-03-01T10:00:00Z")]
      }
      throw new Error("relation \"deals\" does not exist")
    })

    // A caught title failure would return the entries with every title null — indistinguishable
    // from "every record this run touched has been hard-deleted". That is a worse answer than
    // the degraded panel the consumer renders on a rejection.
    await expect(readRunChangedRecords(RUN)).rejects.toThrow("does not exist")
  })
})
