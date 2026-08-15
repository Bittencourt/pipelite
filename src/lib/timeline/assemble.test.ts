/**
 * NOTE-02 — the timeline assembler contract.
 *
 * `buildTimelineQuery` is PURE: it returns a drizzle `SQL` object without touching a
 * database. That is what makes the three properties that matter here assertable BEFORE
 * any query runs, by rendering the object with `new PgDialect().sqlToQuery(query)` and
 * inspecting the resulting `{ sql, params }` pair:
 *
 *   - the SHAPE          (three pre-limited branches for a deal, one for everything else)
 *   - the PRE-LIMIT      (T-35-26 — the entire measured optimisation: 1.0 ms warm vs
 *                         materialising the record's whole history)
 *   - the PARAMETERISING (T-35-01 / T-35-02 — the probe payload must land in `params`
 *                         and must NEVER appear in the SQL text)
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

// Mock @/db BEFORE importing the assembler (vi.mock factories are hoisted above imports).
// Even the PURE tests need this: sources.ts imports `db`, and that module throws at import
// time when DATABASE_URL is unset.
vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(),
  },
}))

import { db } from "@/db"
import { activities, dealStageHistory, notes } from "@/db/schema"
import type { EntityType } from "@/db/schema/custom-fields"

import { assembleTimeline, buildTimelineQuery, countTimeline } from "./assemble"
import { decodeCursor } from "./cursor"
import { TIMELINE_PAGE_SIZE } from "./types"

const mockDb = db as unknown as {
  execute: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
}

const dialect = new PgDialect()

/** Render the pure query object the way Postgres will receive it. */
function render(query: SQL) {
  const { sql: text, params } = dialect.sqlToQuery(query)
  return { text, lower: text.toLowerCase(), params: params as unknown[] }
}

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

const NON_DEAL_ENTITIES: EntityType[] = ["organization", "person", "activity"]

// ---------------------------------------------------------------------------
// Raw union rows and hydration rows
// ---------------------------------------------------------------------------

interface RawRow {
  kind: string
  id: string
  occurred_at: Date
}

const T0 = Date.UTC(2026, 7, 15, 12, 0, 0)

/** Newest first, one minute apart — the order the union itself returns. */
function noteRawRows(n: number): RawRow[] {
  return Array.from({ length: n }, (_, i) => ({
    kind: "note",
    id: `note-${i}`,
    occurred_at: new Date(T0 - i * 60_000),
  }))
}

function noteHydrationRow(id: string, occurredAt: Date) {
  return {
    id,
    content: `content of ${id}`,
    source: "user",
    createdAt: occurredAt,
    updatedAt: occurredAt,
    authorId: "user-1",
    authorName: "Ada",
    authorEmail: "ada@example.com",
  }
}

function activityHydrationRow(id: string, occurredAt: Date) {
  return {
    id,
    title: `activity ${id}`,
    typeName: "Call",
    dueDate: new Date(T0 + 86_400_000),
    completedAt: null,
    createdAt: occurredAt,
  }
}

function stageChangeHydrationRow(id: string, occurredAt: Date) {
  return {
    id,
    fromStageName: "Lead",
    fromStageColor: "blue",
    toStageName: "Won",
    toStageColor: "green",
    createdAt: occurredAt,
    actorId: "user-1",
    actorName: "Ada",
    actorEmail: "ada@example.com",
  }
}

// ---------------------------------------------------------------------------
// db mocks
// ---------------------------------------------------------------------------

/**
 * One `db.execute` stub serving both the union statement and the header counts.
 * They are told apart by the rendered SQL, which is exactly how a reader tells them
 * apart too.
 */
function stubExecute(unionRows: RawRow[], perSourceCount = 7) {
  mockDb.execute.mockImplementation(async (query: SQL) => {
    const { lower } = render(query)
    if (lower.includes("count(")) return [{ count: perSourceCount }]
    return unionRows
  })
}

/** Every table handed to `.from(...)`, in call order. Proves which kinds were hydrated. */
const fromCalls: unknown[] = []

/**
 * Every hydration `.where(...)` argument, paired with the table it was issued against.
 * A mocked driver cannot APPLY a predicate, but it can see that one was passed — which is
 * the whole of CR-01.
 */
const whereCalls: { table: unknown; where: unknown }[] = []

/**
 * A chainable `db.select()` stub. Every builder method returns the same object, and the
 * object is thenable, so it survives any join shape the sources choose.
 */
function stubSelect(rowsForTable: (table: unknown) => unknown[]) {
  mockDb.select.mockImplementation(() => {
    let rows: unknown[] = []
    let table: unknown = null
    const chain: Record<string, unknown> = {}
    for (const method of ["from", "leftJoin", "innerJoin", "where", "orderBy", "limit"]) {
      chain[method] = vi.fn((arg: unknown) => {
        if (method === "from") {
          table = arg
          fromCalls.push(arg)
          rows = rowsForTable(arg)
        }
        if (method === "where") {
          whereCalls.push({ table, where: arg })
        }
        return chain
      })
    }
    chain.then = (resolve: (value: unknown) => unknown) => resolve(rows)
    return chain
  })
}

/** The rendered SQL text of every hydration `where` issued against `table`. */
function hydrationWhereText(table: unknown): string[] {
  return whereCalls
    .filter((call) => call.table === table)
    .map((call) => dialect.sqlToQuery(call.where as SQL).sql.toLowerCase())
}

/** Every `db.execute` call that is NOT one of the header counts. */
function unionCalls(): SQL[] {
  return (mockDb.execute.mock.calls as unknown[][])
    .map((call) => call[0] as SQL)
    .filter((query) => !render(query).lower.includes("count("))
}

/** The common case: a page of notes only. */
function stubNotesHydration(rows: RawRow[]) {
  stubSelect((table) =>
    table === notes ? rows.map((r) => noteHydrationRow(r.id, r.occurred_at)) : []
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  fromCalls.length = 0
  whereCalls.length = 0
})

// ===========================================================================
// buildTimelineQuery — branch composition
// ===========================================================================

describe("buildTimelineQuery — branch composition", () => {
  it("builds three branches for a deal", () => {
    const { lower } = render(buildTimelineQuery("deal", "d1", null, 20))

    expect(lower).toContain('from "notes"')
    expect(lower).toContain('from "activities"')
    expect(lower).toContain('from "deal_stage_history"')
    expect(countOf(lower, "union all")).toBe(2)
  })

  it("builds a single notes branch with no UNION ALL for organization, person and activity", () => {
    for (const entityType of NON_DEAL_ENTITIES) {
      const { lower } = render(buildTimelineQuery(entityType, "e1", null, 20))

      expect(lower).toContain('from "notes"')
      // A one-branch UNION ALL is a degenerate union, not a simpler one.
      expect(countOf(lower, "union all")).toBe(0)
      expect(countOf(lower, 'from "activities"')).toBe(0)
      expect(countOf(lower, 'from "deal_stage_history"')).toBe(0)
    }
  })

  it("selects only kind, id and occurred_at from every branch", () => {
    const { lower } = render(buildTimelineQuery("deal", "d1", null, 20))

    // Two-step hydration keeps the union rows narrow. NULL-padding three different
    // column sets into one wide union row is the anti-pattern being prevented.
    expect(lower).not.toContain("content")
    expect(lower).not.toContain("title")
    expect(lower).toContain("occurred_at")
  })

  it("filters soft-deleted rows out of the notes and activities branches", () => {
    const { lower } = render(buildTimelineQuery("deal", "d1", null, 20))

    // notes_live_idx is partial on this predicate, but an index encodes a filter — it
    // does not enforce one (T-35-06).
    expect(countOf(lower, "deleted_at is null")).toBe(2)
  })
})

// ===========================================================================
// buildTimelineQuery — pre-limit  (vitest -t "pre-limit")
// ===========================================================================

describe("buildTimelineQuery — pre-limit", () => {
  it("gives every branch its own pre-limit ORDER BY ... DESC, id DESC LIMIT", () => {
    const deal = render(buildTimelineQuery("deal", "d1", null, 20))
    // three branch sorts + the outer sort
    expect(countOf(deal.lower, "order by")).toBe(4)
    // three branch limits + the outer limit
    expect(countOf(deal.lower, "limit")).toBe(4)

    const org = render(buildTimelineQuery("organization", "o1", null, 20))
    expect(countOf(org.lower, "order by")).toBe(2)
    expect(countOf(org.lower, "limit")).toBe(2)
  })

  it("sets every pre-limit and the outer limit to pageSize + 1", () => {
    // The +1 is what derives hasMore; the row itself is discarded.
    const deal = render(buildTimelineQuery("deal", "d1", null, 20))
    expect(deal.params.filter((p) => p === 21)).toHaveLength(4)

    const org = render(buildTimelineQuery("organization", "o1", null, 20))
    expect(org.params.filter((p) => p === 21)).toHaveLength(2)
  })
})

// ===========================================================================
// buildTimelineQuery — cursor  (vitest -t "cursor")
// ===========================================================================

describe("buildTimelineQuery — cursor", () => {
  const cursor = { occurredAt: new Date(T0), id: "note-19" }

  it("omits the row comparison when the cursor is null", () => {
    const { lower } = render(buildTimelineQuery("deal", "d1", null, 20))
    expect(countOf(lower, ") < (")).toBe(0)
  })

  it("adds a (created_at, id) < (?, ?) row comparison to every branch", () => {
    const deal = render(buildTimelineQuery("deal", "d1", cursor, 20))
    expect(countOf(deal.lower, ") < (")).toBe(3)

    const org = render(buildTimelineQuery("organization", "o1", cursor, 20))
    expect(countOf(org.lower, ") < (")).toBe(1)
  })

  it("binds cursor values as parameters and never interpolates them into the SQL text", () => {
    // T-35-02. decodeCursor VALIDATES its input; it does not SANITISE it. Interpolating
    // a validated value textually reopens the hole regardless.
    const probe = "x' OR '1'='1"
    const { text, params } = render(
      buildTimelineQuery("deal", "d1", { occurredAt: new Date(T0), id: probe }, 20)
    )

    expect(text).not.toContain("OR '1'='1")
    expect(params).toContain(probe)
    // The timestamp side is bound too, never rendered as a literal.
    expect(params.filter((p) => typeof p === "string" && p.startsWith("2026-"))).toHaveLength(3)
  })

  it("never binds a Date — the driver cannot serialize one in a raw fragment", () => {
    // REGRESSION. This shipped broken and reached the browser: every page after the first
    // threw `ERR_INVALID_ARG_TYPE — Received an instance of Date` inside postgres.js, so
    // Load more failed with "Failed to load more history" while page one worked fine.
    //
    // Drizzle converts a Date automatically when the parameter is attached to a typed
    // column, which is why the rest of the repo can pass one freely. These branches are
    // hand-composed SQL, where nothing does that conversion.
    //
    // The previous version of the assertion above required `params` to contain exactly
    // three Dates — it pinned the defect in place rather than catching it. A mocked driver
    // cannot execute the query, but it CAN see the type of every bound value, and that is
    // the whole bug.
    const withCursor = render(buildTimelineQuery("deal", "d1", cursor, 20))
    expect(withCursor.params.filter((p) => p instanceof Date)).toHaveLength(0)

    const single = render(buildTimelineQuery("organization", "o1", cursor, 20))
    expect(single.params.filter((p) => p instanceof Date)).toHaveLength(0)

    // Bound as an ISO string and cast back, so the wall clock round-trips exactly.
    expect(withCursor.params).toContain(new Date(T0).toISOString())
    expect(withCursor.lower).toContain("::timestamp")
  })

  it("binds entityId as a parameter and never interpolates it into the SQL text", () => {
    // T-35-01.
    const probe = "d1'; DROP TABLE notes;--"
    const { text, params } = render(buildTimelineQuery("deal", probe, null, 20))

    expect(text).not.toContain("DROP TABLE")
    expect(text).not.toContain(probe)
    expect(params).toContain(probe)
  })

  it("binds entityType as a parameter on the notes branch", () => {
    const { text, params } = render(buildTimelineQuery("organization", "o1", null, 20))

    expect(params).toContain("organization")
    expect(text).not.toContain("'organization'")
  })

  it("rejects an entityType outside the four literals before building any SQL", () => {
    // entity_type reaches a predicate, so this is the T-35-01 control that runs first.
    expect(() =>
      buildTimelineQuery("user" as unknown as EntityType, "d1", null, 20)
    ).toThrow()
    expect(() =>
      buildTimelineQuery("deal' --" as unknown as EntityType, "d1", null, 20)
    ).toThrow()
    expect(() =>
      buildTimelineQuery("" as unknown as EntityType, "d1", null, 20)
    ).toThrow()
  })
})

// ===========================================================================
// buildTimelineQuery — ordering
// ===========================================================================

describe("buildTimelineQuery — ordering", () => {
  it("orders newest first with id as the tie-break", () => {
    const { lower } = render(buildTimelineQuery("deal", "d1", null, 20))
    expect(lower).toContain('order by "occurred_at" desc, "id" desc')
  })

  it("sorts activities by created_at, not dueDate or completedAt", () => {
    // A history feed ordered by a FUTURE due date reads wrong. created_at is the honest
    // "when it happened" (locked in the CONTEXT Post-Research Addendum).
    const { lower } = render(buildTimelineQuery("deal", "d1", null, 20))

    expect(lower).toContain("a.created_at desc, a.id desc")
    expect(lower).not.toContain("due_date")
    expect(lower).not.toContain("completed_at")
  })
})

// ===========================================================================
// assembleTimeline — hasMore  (vitest -t "hasMore")
// ===========================================================================

describe("assembleTimeline — hasMore", () => {
  it("reports hasMore true and returns exactly pageSize entries when n+1 rows come back", async () => {
    const rows = noteRawRows(21)
    stubExecute(rows)
    stubNotesHydration(rows)

    const page = await assembleTimeline({ entityType: "organization", entityId: "o1" })

    expect(page.entries).toHaveLength(TIMELINE_PAGE_SIZE)
    expect(page.hasMore).toBe(true)
    // The (n+1)th row is discarded, never rendered.
    expect(page.entries.map((e) => e.id)).not.toContain("note-20")
  })

  it("reports hasMore false and returns all rows when n or fewer come back", async () => {
    for (const n of [20, 3, 0]) {
      vi.clearAllMocks()
      fromCalls.length = 0
      whereCalls.length = 0
      const rows = noteRawRows(n)
      stubExecute(rows)
      stubNotesHydration(rows)

      const page = await assembleTimeline({ entityType: "organization", entityId: "o1" })

      expect(page.entries).toHaveLength(n)
      expect(page.hasMore).toBe(false)
    }
  })

  it("sets nextCursor from the OLDEST returned entry", async () => {
    const rows = noteRawRows(21)
    stubExecute(rows)
    stubNotesHydration(rows)

    const page = await assembleTimeline({ entityType: "organization", entityId: "o1" })
    const decoded = decodeCursor(page.nextCursor)
    const oldestKept = page.entries[page.entries.length - 1]

    expect(decoded).not.toBeNull()
    expect(decoded!.id).toBe(oldestKept.id)
    expect(decoded!.occurredAt.getTime()).toBe(oldestKept.occurredAt.getTime())
    // Not the discarded 21st row.
    expect(decoded!.id).not.toBe("note-20")
  })

  it("returns nextCursor null when hasMore is false", async () => {
    const rows = noteRawRows(5)
    stubExecute(rows)
    stubNotesHydration(rows)

    const page = await assembleTimeline({ entityType: "organization", entityId: "o1" })

    expect(page.hasMore).toBe(false)
    expect(page.nextCursor).toBeNull()
  })

  it("fetches pageSize + 1 rows in ONE statement", async () => {
    const rows = noteRawRows(21)
    stubExecute(rows)
    stubNotesHydration(rows)

    await assembleTimeline({ entityType: "organization", entityId: "o1" })

    const calls = unionCalls()
    expect(calls).toHaveLength(1)
    expect(render(calls[0]).params.filter((p) => p === 21)).toHaveLength(2)
  })

  it("degrades a malformed cursor to page 1 instead of throwing", async () => {
    const rows = noteRawRows(3)
    stubExecute(rows)
    stubNotesHydration(rows)

    const page = await assembleTimeline({
      entityType: "organization",
      entityId: "o1",
      cursor: "not a cursor!!",
    })

    expect(page.entries).toHaveLength(3)
    const [unionCall] = unionCalls()
    expect(countOf(render(unionCall).lower, ") < (")).toBe(0)
  })
})

// ===========================================================================
// assembleTimeline — hydration
// ===========================================================================

describe("assembleTimeline — hydration", () => {
  it("hydrates only the kinds present in the page", async () => {
    const rows = noteRawRows(3)
    stubExecute(rows)
    stubNotesHydration(rows)

    await assembleTimeline({ entityType: "deal", entityId: "d1" })

    expect(fromCalls).toEqual([notes])
    expect(fromCalls).not.toContain(activities)
    expect(fromCalls).not.toContain(dealStageHistory)
  })

  it("preserves the union's ordering after hydration", async () => {
    const t = (i: number) => new Date(T0 - i * 60_000)
    const rows: RawRow[] = [
      { kind: "note", id: "n1", occurred_at: t(0) },
      { kind: "stage_change", id: "s1", occurred_at: t(1) },
      { kind: "activity", id: "a1", occurred_at: t(2) },
      { kind: "note", id: "n2", occurred_at: t(3) },
    ]
    stubExecute(rows)
    // Hydration is a batched per-kind read; it returns blocks, and deliberately not in
    // the union's order.
    stubSelect((table) => {
      if (table === notes) {
        return [noteHydrationRow("n2", t(3)), noteHydrationRow("n1", t(0))]
      }
      if (table === activities) return [activityHydrationRow("a1", t(2))]
      if (table === dealStageHistory) return [stageChangeHydrationRow("s1", t(1))]
      return []
    })

    const page = await assembleTimeline({ entityType: "deal", entityId: "d1" })

    expect(page.entries.map((e) => e.id)).toEqual(["n1", "s1", "a1", "n2"])
    expect(page.entries.map((e) => e.kind)).toEqual([
      "note",
      "stage_change",
      "activity",
      "note",
    ])
  })

  it("maps each kind onto its own entry shape", async () => {
    const t = (i: number) => new Date(T0 - i * 60_000)
    const rows: RawRow[] = [
      { kind: "note", id: "n1", occurred_at: t(0) },
      { kind: "activity", id: "a1", occurred_at: t(1) },
      { kind: "stage_change", id: "s1", occurred_at: t(2) },
    ]
    stubExecute(rows)
    stubSelect((table) => {
      if (table === notes) return [noteHydrationRow("n1", t(0))]
      if (table === activities) return [activityHydrationRow("a1", t(1))]
      if (table === dealStageHistory) return [stageChangeHydrationRow("s1", t(2))]
      return []
    })

    const page = await assembleTimeline({ entityType: "deal", entityId: "d1" })
    const [note, activity, stageChange] = page.entries

    expect(note).toMatchObject({
      kind: "note",
      content: "content of n1",
      source: "user",
      author: { id: "user-1", name: "Ada", email: "ada@example.com" },
    })
    expect(activity).toMatchObject({ kind: "activity", title: "activity a1", typeName: "Call" })
    expect(stageChange).toMatchObject({
      kind: "stage_change",
      fromStageName: "Lead",
      toStageName: "Won",
      toStageColor: "green",
    })
    expect(note.occurredAt.getTime()).toBe(t(0).getTime())
  })

  it("carries deleted_at IS NULL on the notes hydration read, not just on the union", async () => {
    // CR-01 REGRESSION. The union and the hydration read are two SEPARATE statements, so
    // the union's predicate does not cover the second one: a note soft-deleted between them
    // was hydrated and rendered. `notesSource.hydrate` is also called directly from outside
    // the assembler (src/app/notes/actions.ts), where there is no union in front of it at
    // all — an unscoped read-notes-by-id with no soft-delete filter. T-35-06 requires the
    // predicate on EVERY read path explicitly; `notes_live_idx` is partial on it but an
    // index encodes a filter, it does not enforce one.
    const rows = noteRawRows(3)
    stubExecute(rows)
    stubNotesHydration(rows)

    await assembleTimeline({ entityType: "organization", entityId: "o1" })

    const wheres = hydrationWhereText(notes)
    expect(wheres).toHaveLength(1)
    expect(wheres[0]).toContain('"deleted_at" is null')
    expect(wheres[0]).toContain('"id" in (')
  })

  it("carries deleted_at IS NULL on the activities hydration read", async () => {
    // CR-01 REGRESSION, activities half.
    const t = (i: number) => new Date(T0 - i * 60_000)
    const rows: RawRow[] = [{ kind: "activity", id: "a1", occurred_at: t(0) }]
    stubExecute(rows)
    stubSelect((table) => (table === activities ? [activityHydrationRow("a1", t(0))] : []))

    await assembleTimeline({ entityType: "deal", entityId: "d1" })

    const wheres = hydrationWhereText(activities)
    expect(wheres).toHaveLength(1)
    expect(wheres[0]).toContain('"deleted_at" is null')
  })

  it("drops a union row whose hydration returned nothing rather than emitting a hole", async () => {
    // A note soft-deleted between the union and the hydration read.
    const rows = noteRawRows(2)
    stubSelect((table) =>
      table === notes ? [noteHydrationRow("note-0", rows[0].occurred_at)] : []
    )
    stubExecute(rows)

    const page = await assembleTimeline({ entityType: "organization", entityId: "o1" })

    expect(page.entries.map((e) => e.id)).toEqual(["note-0"])
  })
})

// ===========================================================================
// countTimeline
// ===========================================================================

describe("countTimeline", () => {
  it("sums one count per applicable source", async () => {
    stubExecute([], 7)

    expect(await countTimeline("deal", "d1")).toBe(21)

    vi.clearAllMocks()
    stubExecute([], 7)
    expect(await countTimeline("organization", "o1")).toBe(7)
  })

  it("rejects an entityType outside the four literals", async () => {
    stubExecute([], 7)
    await expect(
      countTimeline("user" as unknown as EntityType, "d1")
    ).rejects.toThrow()
  })
})
