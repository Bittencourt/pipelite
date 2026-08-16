/**
 * TRASH-01 — the read layer.
 *
 * There is no database here. Every assertion is made against the STATEMENT the module builds,
 * rendered to real SQL text and bind params by `PgDialect.sqlToQuery` — the same technique
 * `src/lib/audit/prune.test.ts:62-73` uses. That matters because the three properties this
 * module has to guarantee are all properties of the statement rather than of its result:
 *
 *   1. THE OWNER PREDICATE IS IN THE QUERY. A post-filter would pass any result-shaped test
 *      while still having pulled another user's rows across the wire and, worse, while still
 *      counting them (T-37-02). The only way to tell the two apart without a database is to
 *      compile the WHERE clause and look.
 *   2. NOTHING IS INTERPOLATED. The one hand-composed fragment in this phase takes an entity
 *      type and a list of ids. Both must appear in `params` and neither in the text (T-37-03).
 *   3. NO `Date` IS EVER BOUND. postgres.js throws `ERR_INVALID_ARG_TYPE` on one, and the
 *      near-miss `${date}::timestamp` silently truncates microseconds (T-37-18).
 *
 * `@/db` is mocked down to `execute` and `select` — nothing else. Any further query the
 * implementation grows surfaces as a TypeError rather than being absorbed by a permissive mock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

vi.mock("@/db", () => ({ db: { execute: vi.fn(), select: vi.fn() } }))

import { db } from "@/db"
import { activities, deals, organizations, people } from "@/db/schema"
import {
  resolveDeletedBy,
  findTrashedRecord,
  findTrashedParents,
  countTrashed,
  listTrashed,
  TRASH_PAGE_SIZE,
  type TrashViewer,
} from "./queries"

const mockExecute = (db as unknown as { execute: ReturnType<typeof vi.fn> }).execute
const mockSelect = (db as unknown as { select: ReturnType<typeof vi.fn> }).select

const dialect = new PgDialect()

/** One recorded `db.select(...)` chain: the projection plus every clause hung off it. */
interface RecordedSelect {
  fields: Record<string, unknown>
  from?: unknown
  joins: Array<{ table: unknown; on: unknown }>
  where?: SQL
  orderBy: unknown[]
  limit?: number
}

interface SelectBuilder extends PromiseLike<unknown[]> {
  from(table: unknown): SelectBuilder
  leftJoin(table: unknown, on: unknown): SelectBuilder
  where(condition: SQL): SelectBuilder
  orderBy(...order: unknown[]): SelectBuilder
  limit(rows: number): SelectBuilder
}

/** Every `db.select` the module issued during the current test, in call order. */
const selectCalls: RecordedSelect[] = []
/** What each successive `db.select` chain resolves to — or rejects with. */
let selectOutcomes: Array<unknown[] | Error> = []

function queueSelects(...outcomes: Array<unknown[] | Error>): void {
  selectOutcomes = outcomes
}

function installSelectMock(): void {
  mockSelect.mockImplementation((fields: Record<string, unknown>) => {
    const recorded: RecordedSelect = { fields, joins: [], orderBy: [] }
    selectCalls.push(recorded)

    const outcome = selectOutcomes.shift() ?? []

    const builder: SelectBuilder = {
      from(table) {
        recorded.from = table
        return builder
      },
      leftJoin(table, on) {
        recorded.joins.push({ table, on })
        return builder
      },
      where(condition) {
        recorded.where = condition
        return builder
      },
      orderBy(...order) {
        recorded.orderBy = order
        return builder
      },
      limit(rows) {
        recorded.limit = rows
        return builder
      },
      then(onFulfilled, onRejected) {
        const settled =
          outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome)
        return settled.then(onFulfilled, onRejected)
      },
    }

    return builder
  })
}

/** A statement rendered to the SQL text and bind params the driver would actually receive. */
function render(statement: SQL | undefined): { sql: string; params: unknown[] } {
  if (!statement) throw new Error("no statement was captured")
  const { sql, params } = dialect.sqlToQuery(statement)
  return { sql: sql.toLowerCase().replace(/\s+/g, " "), params: params as unknown[] }
}

/** The `db.execute` argument, rendered. */
function renderedExecute(index = 0): { sql: string; params: unknown[] } {
  const arg = mockExecute.mock.calls[index]?.[0] as SQL | undefined
  if (!arg) throw new Error(`db.execute was not called ${index + 1} time(s)`)
  return render(arg)
}

/** The WHERE clause of the nth recorded select, rendered. */
function renderedWhere(index = 0): { sql: string; params: unknown[] } {
  const call = selectCalls[index]
  if (!call) throw new Error(`db.select was not called ${index + 1} time(s)`)
  return render(call.where)
}

function errorLines(): string[] {
  const spy = console.error as unknown as ReturnType<typeof vi.fn>
  return spy.mock.calls.map((call: unknown[]) => call.map(String).join(" "))
}

const MEMBER: TrashViewer = { userId: "u1", role: "member" }
const ADMIN: TrashViewer = { userId: "u2", role: "admin" }

/** The four count queries, in tab order. */
function counts(deals: number, people: number, organizations: number, activities: number) {
  return [[{ value: deals }], [{ value: people }], [{ value: organizations }], [{ value: activities }]]
}

const DELETED_AT = new Date("2026-08-10T09:00:00.000Z")

function dealRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Deal ${id}`,
    deletedAt: DELETED_AT,
    organizationName: "Acme Inc",
    organizationTrashed: false,
    personFirstName: "Ada",
    personLastName: "Lovelace",
    personTrashed: false,
    ...overrides,
  }
}

/** An `audit_log` row as the raw statement's aliases hand it back. */
function auditRow(entityId: string, overrides: Record<string, unknown> = {}) {
  return {
    entity_id: entityId,
    actor_kind: "user",
    created_at: new Date("2026-08-01T10:00:00.000Z"),
    actor_id: "u1",
    actor_name: "Ada Lovelace",
    actor_email: "ada@example.com",
    run_id: null,
    workflow_id: null,
    workflow_name: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})

  selectCalls.length = 0
  selectOutcomes = []
  mockExecute.mockResolvedValue([])
  installSelectMock()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("resolveDeletedBy", () => {
  it("resolves a whole page in ONE query, not one per row", async () => {
    mockExecute.mockResolvedValue([auditRow("a"), auditRow("b"), auditRow("c")])

    await resolveDeletedBy("deal", ["a", "b", "c"])

    // The N+1 this phase exists to avoid: fifty rows must cost one lookup, not fifty.
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it("issues no query at all for an empty page", async () => {
    const result = await resolveDeletedBy("deal", [])

    // `= ANY('{}')` is a guaranteed-empty round trip. Do not make it.
    expect(mockExecute).not.toHaveBeenCalled()
    expect(result.size).toBe(0)
  })

  it("uses DISTINCT ON ordered by entity_id before created_at desc", async () => {
    await resolveDeletedBy("deal", ["a"])

    const { sql } = renderedExecute()

    expect(sql).toContain("distinct on")
    // The ORDER BY is not cosmetic: DISTINCT ON requires it, and this exact column order is
    // what lets `audit_log_entity_idx` serve the scan for a fixed entity type.
    expect(sql).toMatch(/order by al\.entity_id, al\.created_at desc/)
  })

  it("filters to the delete action, so an update never answers 'who deleted this'", async () => {
    await resolveDeletedBy("deal", ["a"])

    expect(renderedExecute().sql).toContain("al.action = 'deleted'")
  })

  it("binds the entity type as a parameter and never interpolates it into the text", async () => {
    await resolveDeletedBy("deal", ["a"])

    const { sql, params } = renderedExecute()

    expect(params).toContain("deal")
    // T-37-03: the value reaches the database as a bind, so no entity literal is in the text.
    expect(sql.includes("deal'")).toBe(false)
    expect(sql.includes("'deal")).toBe(false)
  })

  it("binds the id list as ONE parameter rather than expanding it into the text", async () => {
    await resolveDeletedBy("deal", ["a", "b", "c"])

    const { sql, params } = renderedExecute()

    expect(sql).toContain("any(")
    expect(params).toContainEqual(["a", "b", "c"])
    expect(sql.includes("'a'")).toBe(false)
  })

  it("binds no JS Date — postgres.js throws on one and the ::timestamp near-miss truncates", async () => {
    await resolveDeletedBy("deal", ["a"])

    const { params } = renderedExecute()

    expect(params.some((param) => param instanceof Date)).toBe(false)
  })

  it("keys the map by entity id and leaves an unmatched id absent, not null", async () => {
    mockExecute.mockResolvedValue([auditRow("a"), auditRow("c")])

    const result = await resolveDeletedBy("deal", ["a", "b", "c"])

    expect(result.get("a")?.entityId).toBe("a")
    expect(result.get("a")?.actorEmail).toBe("ada@example.com")
    // Absence is what makes `presentDeletedBy(undefined)` say "not recorded" rather than
    // inventing an unknown user (T-37-REP2).
    expect(result.has("b")).toBe(false)
    expect(result.get("c")?.entityId).toBe("c")
  })

  it("carries the workflow-run columns through unchanged", async () => {
    mockExecute.mockResolvedValue([
      auditRow("a", {
        actor_kind: "workflow_run",
        actor_id: null,
        actor_name: null,
        actor_email: null,
        run_id: "r1",
        workflow_id: "w1",
        workflow_name: "Nightly cleanup",
      }),
    ])

    const row = (await resolveDeletedBy("deal", ["a"])).get("a")

    expect(row?.actorKind).toBe("workflow_run")
    expect(row?.runId).toBe("r1")
    expect(row?.workflowId).toBe("w1")
    expect(row?.workflowName).toBe("Nightly cleanup")
  })

  it("degrades to an empty map and logs when the query rejects", async () => {
    mockExecute.mockRejectedValue(new Error("connection reset"))

    const result = await resolveDeletedBy("deal", ["a"])

    // `/trash` has no `error.tsx` above it: a throw here takes the whole page down (T-37-20).
    expect(result.size).toBe(0)
    expect(errorLines().some((line) => line.includes("[trash-queries]"))).toBe(true)
  })
})

describe("findTrashedRecord", () => {
  it("returns the id, owner and name of a trashed deal", async () => {
    queueSelects([{ id: "d1", ownerId: "u1", name: "Acme renewal" }])

    const record = await findTrashedRecord("deal", "d1")

    // The owner is what the server actions and REST routes run their guard against; the name
    // is what the restore and purge toasts print.
    expect(record).toEqual({ id: "d1", ownerId: "u1", name: "Acme renewal" })
  })

  it("filters on deleted_at IS NOT NULL — the one predicate this whole surface inverts", async () => {
    queueSelects([{ id: "d1", ownerId: "u1", name: "Acme renewal" }])

    await findTrashedRecord("deal", "d1")

    const { sql } = renderedWhere()

    // Phase 35 recorded that a partial index does not enforce its own predicate. Written out.
    expect(sql).toContain("is not null")
    expect(sql).not.toMatch(/is null/)
  })

  it("returns null for a live or missing record — the query simply yields nothing", async () => {
    queueSelects([])

    expect(await findTrashedRecord("deal", "d1")).toBeNull()
  })

  it("returns null and logs when the query rejects", async () => {
    queueSelects(new Error("connection reset"))

    expect(await findTrashedRecord("deal", "d1")).toBeNull()
    expect(errorLines().some((line) => line.includes("[trash-queries]"))).toBe(true)
  })

  it("reads the display name from the title column for an activity", async () => {
    queueSelects([{ id: "a1", ownerId: "u1", name: "Follow up" }])

    expect(await findTrashedRecord("activity", "a1")).toEqual({
      id: "a1",
      ownerId: "u1",
      name: "Follow up",
    })
  })

  it("reads the display name from the name column for an organization", async () => {
    queueSelects([{ id: "o1", ownerId: "u1", name: "Acme Inc" }])

    expect(await findTrashedRecord("organization", "o1")).toEqual({
      id: "o1",
      ownerId: "u1",
      name: "Acme Inc",
    })
  })

  it("composes a person's display name from first and last, as the rest of the product does", async () => {
    queueSelects([{ id: "p1", ownerId: "u1", firstName: "Ada", lastName: "Lovelace" }])

    // `people` has no single title column (src/lib/audit/linked-records.ts:124-125).
    expect(await findTrashedRecord("person", "p1")).toEqual({
      id: "p1",
      ownerId: "u1",
      name: "Ada Lovelace",
    })
  })
})

describe("findTrashedParents", () => {
  /** The parent foreign keys of a deal, as the child lookup projects them. */
  function dealParents(organizationId: string | null, personId: string | null) {
    return [{ organizationId, personId }]
  }

  const TRASHED_ORG = [{ id: "o1", ownerId: "u9", name: "Acme Inc" }]
  const TRASHED_PERSON = [{ id: "p1", ownerId: "u7", firstName: "Ada", lastName: "Lovelace" }]

  it("returns every trashed parent of a deal, outermost first", async () => {
    queueSelects(dealParents("o1", "p1"), TRASHED_ORG, TRASHED_PERSON)

    const parents = await findTrashedParents("deal", "d1")

    // The ORDER is the restore order: an organization is restored before the person that hangs
    // off it, and both before the deal. `TRASH_PARENTS.deal` declares that sequence.
    expect(parents).toEqual([
      { entityType: "organization", id: "o1", name: "Acme Inc", ownerId: "u9" },
      { entityType: "person", id: "p1", name: "Ada Lovelace", ownerId: "u7" },
    ])
  })

  it("carries each parent's own owner, because the caller re-checks authorization per parent", async () => {
    queueSelects(dealParents("o1", "p1"), TRASHED_ORG, TRASHED_PERSON)

    const parents = await findTrashedParents("deal", "d1")

    // Two different owners, neither of them the caller's: a linked restore must be able to skip
    // the parent it may not touch rather than restoring it on the child's authority (T-37-02).
    expect(parents.map((parent) => parent.ownerId)).toEqual(["u9", "u7"])
  })

  it("returns only the parent that is actually in trash", async () => {
    queueSelects(dealParents("o1", "p1"), TRASHED_ORG, [])

    const parents = await findTrashedParents("deal", "d1")

    expect(parents).toHaveLength(1)
    expect(parents[0].entityType).toBe("organization")
  })

  it("returns an empty array when both parents are live", async () => {
    queueSelects(dealParents("o1", "p1"), [], [])

    expect(await findTrashedParents("deal", "d1")).toEqual([])
  })

  it("filters every parent lookup on deleted_at IS NOT NULL — a live parent needs no restoring", async () => {
    queueSelects(dealParents("o1", "p1"), TRASHED_ORG, TRASHED_PERSON)

    await findTrashedParents("deal", "d1")

    // Both parent lookups, not just the first: a restore that reached a LIVE record would clear
    // a `deleted_at` that was never set and write an audit row for a restore that never happened.
    for (const index of [1, 2]) {
      expect(renderedWhere(index).sql).toContain("is not null")
    }
  })

  it("does NOT filter the child row on deleted_at — the child may be trashed or live", async () => {
    queueSelects(dealParents("o1", null), TRASHED_ORG)

    await findTrashedParents("deal", "d1")

    // The child's own trashed-ness is the caller's guard to make (`findTrashedRecord`), not this
    // function's. Repeating it here would make the badge on a live record's page impossible.
    expect(renderedWhere(0).sql).not.toContain("is not null")
    expect(renderedWhere(0).params).toContain("d1")
  })

  it("looks up exactly the tables TRASH_PARENTS names for a deal, in that order", async () => {
    queueSelects(dealParents("o1", "p1"), TRASHED_ORG, TRASHED_PERSON)

    await findTrashedParents("deal", "d1")

    // The parent SET comes from the map, never from a second list typed out in this function.
    expect(selectCalls[0].from).toBe(deals)
    expect(selectCalls[1].from).toBe(organizations)
    expect(selectCalls[2].from).toBe(people)
    expect(selectCalls).toHaveLength(3)
  })

  it("issues no parent lookup at all when the foreign keys are null", async () => {
    queueSelects(dealParents(null, null))

    expect(await findTrashedParents("deal", "d1")).toEqual([])
    // A deal with no organization and no person has nothing to look up; two round trips that
    // can only return nothing are two round trips too many.
    expect(selectCalls).toHaveLength(1)
  })

  it("returns an empty array when the child row does not exist", async () => {
    queueSelects([])

    expect(await findTrashedParents("deal", "d1")).toEqual([])
    expect(selectCalls).toHaveLength(1)
  })

  it("returns at most one organization for a person", async () => {
    queueSelects([{ organizationId: "o1" }], TRASHED_ORG)

    expect(await findTrashedParents("person", "p1")).toEqual([
      { entityType: "organization", id: "o1", name: "Acme Inc", ownerId: "u9" },
    ])
    expect(selectCalls[0].from).toBe(people)
    expect(selectCalls[1].from).toBe(organizations)
  })

  it("returns at most one deal for an activity", async () => {
    queueSelects([{ dealId: "d1" }], [{ id: "d1", ownerId: "u9", name: "Acme renewal" }])

    expect(await findTrashedParents("activity", "a1")).toEqual([
      { entityType: "deal", id: "d1", name: "Acme renewal", ownerId: "u9" },
    ])
    expect(selectCalls[0].from).toBe(activities)
    expect(selectCalls[1].from).toBe(deals)
  })

  it("issues NO QUERY AT ALL for an organization — it has no parents to have", async () => {
    const parents = await findTrashedParents("organization", "o1")

    // `TRASH_PARENTS.organization` is empty, so there is nothing to read. Reading the row anyway
    // to discover that would make the emptiness of that list a comment rather than a control.
    expect(parents).toEqual([])
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("returns an empty array and logs when the child lookup rejects", async () => {
    queueSelects(new Error("connection reset"))

    expect(await findTrashedParents("deal", "d1")).toEqual([])
    expect(errorLines().some((line) => line.includes("[trash-queries]"))).toBe(true)
  })
})

describe("countTrashed", () => {
  it("scopes ALL FOUR counts to the viewer's own records for a non-admin", async () => {
    queueSelects(...counts(3, 2, 1, 0))

    await countTrashed(MEMBER)

    expect(selectCalls).toHaveLength(4)

    for (let index = 0; index < 4; index += 1) {
      const { sql, params } = renderedWhere(index)

      // Both halves in ONE where clause. A post-filter would still have counted rows this
      // viewer may not see, which is the exact defect T-37-02 describes.
      expect(sql).toContain("is not null")
      expect(sql).toContain("owner_id")
      expect(params).toContain("u1")
    }
  })

  it("drops the owner predicate for an admin, on all four tabs", async () => {
    queueSelects(...counts(3, 2, 1, 0))

    await countTrashed(ADMIN)

    for (let index = 0; index < 4; index += 1) {
      const { sql, params } = renderedWhere(index)

      expect(sql).toContain("is not null")
      expect(sql).not.toContain("owner_id")
      expect(params).not.toContain("u2")
    }
  })

  it("returns one count per tab, keyed by the tab the URL uses", async () => {
    queueSelects(...counts(3, 2, 1, 0))

    expect(await countTrashed(ADMIN)).toEqual({
      deals: 3,
      people: 2,
      organizations: 1,
      activities: 0,
    })
  })

  it("returns null rather than a record of zeros when a count rejects", async () => {
    queueSelects([{ value: 3 }], new Error("connection reset"), [{ value: 1 }], [{ value: 0 }])

    // Zeros would be a WRONG number rendered confidently; null lets the tabs omit the count.
    expect(await countTrashed(MEMBER)).toBeNull()
    expect(errorLines().some((line) => line.includes("[trash-queries]"))).toBe(true)
  })
})

describe("listTrashed", () => {
  it("filters to trashed rows, newest deletion first, scoped to the viewer", async () => {
    queueSelects([dealRow("d1")])

    await listTrashed("deals", 1, MEMBER)

    const { sql, params } = renderedWhere()

    expect(sql).toContain("is not null")
    expect(sql).not.toMatch(/(^| )is null/)
    expect(sql).toContain("owner_id")
    expect(params).toContain("u1")

    // Newest deletion first, served by the plain btree migration 0012 already put on the column
    // (an Index Scan Backward, no sort node — EXPLAIN-verified in 37-RESEARCH).
    expect(render(selectCalls[0].orderBy[0] as SQL).sql).toContain('"deleted_at" desc')
  })

  it("drops the owner predicate for an admin", async () => {
    queueSelects([dealRow("d1")])

    await listTrashed("deals", 1, ADMIN)

    const { sql } = renderedWhere()

    expect(sql).toContain("is not null")
    expect(sql).not.toContain("owner_id")
  })

  it("asks for ONE row past the page so it can report hasMore without a second count", async () => {
    const page = 2
    const rows = Array.from({ length: TRASH_PAGE_SIZE * page + 1 }, (_, i) => dealRow(`d${i}`))
    queueSelects(rows)

    const result = await listTrashed("deals", page, MEMBER)

    expect(selectCalls[0].limit).toBe(TRASH_PAGE_SIZE * page + 1)
    if (!result.ok) throw new Error("expected ok")
    // The probe row is sliced off — it exists to answer the question, not to be rendered.
    expect(result.rows).toHaveLength(TRASH_PAGE_SIZE * page)
    expect(result.hasMore).toBe(true)
  })

  it("reports hasMore false and keeps every row when the probe row does not come back", async () => {
    queueSelects([dealRow("d1"), dealRow("d2")])

    const result = await listTrashed("deals", 1, MEMBER)

    if (!result.ok) throw new Error("expected ok")
    expect(result.rows).toHaveLength(2)
    expect(result.hasMore).toBe(false)
  })

  it("flags a deal whose organization AND person are both in trash, naming both", async () => {
    queueSelects([dealRow("d1", { organizationTrashed: true, personTrashed: true })])

    const result = await listTrashed("deals", 1, MEMBER)

    if (!result.ok) throw new Error("expected ok")
    // The `title` on the badge names the parents so the user can see WHICH linked records.
    expect(result.rows[0].linkedParents).toEqual(["Acme Inc", "Ada Lovelace"])
  })

  it("leaves linkedParents empty when the parents are live", async () => {
    queueSelects([dealRow("d1")])

    const result = await listTrashed("deals", 1, MEMBER)

    if (!result.ok) throw new Error("expected ok")
    expect(result.rows[0].linkedParents).toEqual([])
  })

  it("never produces a linked parent on the Organizations tab", async () => {
    queueSelects([
      { id: "o1", name: "Acme Inc", deletedAt: DELETED_AT, website: "acme.test" },
      { id: "o2", name: "Globex", deletedAt: DELETED_AT, website: null },
    ])

    const result = await listTrashed("organizations", 1, MEMBER)

    if (!result.ok) throw new Error("expected ok")
    // `TRASH_PARENTS.organization` is empty by construction, so the badge cannot render here.
    expect(result.rows.every((row) => row.linkedParents.length === 0)).toBe(true)
    // And no parent join was even issued.
    expect(selectCalls[0].joins).toHaveLength(0)
  })

  it("resolves the whole page's deleted-by in EXACTLY ONE query", async () => {
    const rows = Array.from({ length: TRASH_PAGE_SIZE }, (_, i) => dealRow(`d${i}`))
    queueSelects(rows)
    mockExecute.mockResolvedValue([])

    await listTrashed("deals", 1, MEMBER)

    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it("presents a row with no audit row as notRecorded, not as an unknown user", async () => {
    queueSelects([dealRow("d1")])
    mockExecute.mockResolvedValue([])

    const result = await listTrashed("deals", 1, MEMBER)

    if (!result.ok) throw new Error("expected ok")
    // The presenter runs for real here — the wiring is what is under test, not a mock of it.
    expect(result.rows[0].deletedBy).toEqual({ kind: "notRecorded" })
  })

  it("presents the resolved actor for a row that does have an audit row", async () => {
    queueSelects([dealRow("d1")])
    mockExecute.mockResolvedValue([auditRow("d1")])

    const result = await listTrashed("deals", 1, MEMBER)

    if (!result.ok) throw new Error("expected ok")
    expect(result.rows[0].deletedBy).toEqual({
      kind: "user",
      name: "Ada Lovelace",
      email: "ada@example.com",
    })
  })

  it("uses the organization name as the deals tab's secondary column", async () => {
    queueSelects([dealRow("d1")])

    const result = await listTrashed("deals", 1, MEMBER)

    if (!result.ok) throw new Error("expected ok")
    expect(result.rows[0].name).toBe("Deal d1")
    expect(result.rows[0].secondary).toBe("Acme Inc")
  })

  it("uses the email as the people tab's secondary column, and the full name as the record", async () => {
    queueSelects([
      {
        id: "p1",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        deletedAt: DELETED_AT,
        organizationName: "Acme Inc",
        organizationTrashed: true,
      },
    ])

    const result = await listTrashed("people", 1, MEMBER)

    if (!result.ok) throw new Error("expected ok")
    expect(result.rows[0].name).toBe("Ada Lovelace")
    expect(result.rows[0].secondary).toBe("ada@example.com")
    expect(result.rows[0].linkedParents).toEqual(["Acme Inc"])
  })

  it("uses the website as the organizations tab's secondary column", async () => {
    queueSelects([{ id: "o1", name: "Acme Inc", deletedAt: DELETED_AT, website: "acme.test" }])

    const result = await listTrashed("organizations", 1, MEMBER)

    if (!result.ok) throw new Error("expected ok")
    expect(result.rows[0].secondary).toBe("acme.test")
  })

  it("uses the due date as the activities tab's secondary column, serialised for the client", async () => {
    const dueDate = new Date("2026-09-01T00:00:00.000Z")
    queueSelects([
      {
        id: "a1",
        name: "Follow up",
        dueDate,
        deletedAt: DELETED_AT,
        dealTitle: "Acme renewal",
        dealTrashed: true,
      },
    ])

    const result = await listTrashed("activities", 1, MEMBER)

    if (!result.ok) throw new Error("expected ok")
    // A string, not a Date: the row type is uniform across tabs and nothing crosses the
    // server/client boundary as a Date.
    expect(result.rows[0].secondary).toBe(dueDate.toISOString())
    expect(result.rows[0].linkedParents).toEqual(["Acme renewal"])
  })

  it("returns ok:false when the query rejects, so the page can tell empty from broken", async () => {
    queueSelects(new Error("connection reset"))

    const result = await listTrashed("deals", 1, MEMBER)

    // An empty success would render "Trash is empty" over a broken query, which is a lie.
    expect(result.ok).toBe(false)
    expect(errorLines().some((line) => line.includes("[trash-queries]"))).toBe(true)
  })
})
