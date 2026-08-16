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
import { resolveDeletedBy, findTrashedRecord } from "./queries"

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
