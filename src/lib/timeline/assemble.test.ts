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
import { activities, auditLog, dealStageHistory, notes, stages } from "@/db/schema"
import type { EntityType } from "@/db/schema/custom-fields"

import { assembleTimeline, buildTimelineQuery, countTimeline } from "./assemble"
import { decodeCursor, encodeCursor } from "./cursor"
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
  /** What the driver hands back for the `timestamp` column: millisecond-only. */
  occurred_at: Date
  /** What `to_char` hands back: the same instant at the column's own precision. */
  occurred_at_key: string
}

const T0 = Date.UTC(2026, 7, 15, 12, 0, 0)

/**
 * The `to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` rendering of a wall clock, with an
 * optional sub-millisecond remainder that a JS `Date` cannot hold. Postgres always emits
 * six fractional digits.
 */
function instantKey(at: Date, microsecondRemainder = 0): string {
  const micros = String(microsecondRemainder).padStart(3, "0")
  return at.toISOString().replace(/Z$/, `${micros}Z`)
}

/** One union row, with its text key derived from its timestamp. */
function raw(kind: string, id: string, at: Date, microsecondRemainder = 0): RawRow {
  return { kind, id, occurred_at: at, occurred_at_key: instantKey(at, microsecondRemainder) }
}

/** Newest first, one minute apart — the order the union itself returns. */
function noteRawRows(n: number): RawRow[] {
  return Array.from({ length: n }, (_, i) => {
    const at = new Date(T0 - i * 60_000)
    return {
      kind: "note",
      id: `note-${i}`,
      occurred_at: at,
      occurred_at_key: instantKey(at),
    }
  })
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

/**
 * One row of `auditSource.hydrate`'s batched read, joins included: the three left-joined
 * actor columns are null unless the row's own `actorKind` claims them.
 */
function auditHydrationRow(
  id: string,
  occurredAt: Date,
  changes: Record<string, { from: unknown; to: unknown }>,
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    entityType: "deal",
    action: "updated",
    changes,
    actorKind: "user",
    createdAt: occurredAt,
    actorId: "user-1",
    actorName: "Ada",
    actorEmail: "ada@example.com",
    runId: null,
    workflowId: null,
    workflowName: null,
    ...overrides,
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
  // EVERY ASSERTION IN THIS BLOCK IS THE `includeAudit: false` CASE, and passing the flag
  // explicitly is the point rather than noise: these are Phase 35's measured expectations,
  // unchanged, and this block is what pins that adding a fourth source left the DEFAULT
  // statement byte-identical to the plan that phase measured. The parallel audit-on block
  // below asserts the new shape. Neither was deleted in favour of the other.
  it("builds three branches for a deal", () => {
    const { lower } = render(buildTimelineQuery("deal", "d1", null, 20, false))

    expect(lower).toContain('from "notes"')
    expect(lower).toContain('from "activities"')
    expect(lower).toContain('from "deal_stage_history"')
    expect(countOf(lower, 'from "audit_log"')).toBe(0)
    expect(countOf(lower, "union all")).toBe(2)
  })

  it("builds a single notes branch with no UNION ALL for organization, person and activity", () => {
    for (const entityType of NON_DEAL_ENTITIES) {
      const { lower } = render(buildTimelineQuery(entityType, "e1", null, 20, false))

      expect(lower).toContain('from "notes"')
      // A one-branch UNION ALL is a degenerate union, not a simpler one — still true as a
      // statement about the branch, and now FLAG-CONDITIONAL as a statement about these three
      // entity types: `auditSource.appliesTo` returns true for all four, so with the scope on
      // they have two applicable sources and this becomes a union. The decision the original
      // comment recorded is preserved here rather than deleted; only its scope narrowed.
      expect(countOf(lower, "union all")).toBe(0)
      expect(countOf(lower, 'from "activities"')).toBe(0)
      expect(countOf(lower, 'from "deal_stage_history"')).toBe(0)
      expect(countOf(lower, 'from "audit_log"')).toBe(0)
    }
  })

  it("omits the audit branch when no scope is passed at all", () => {
    // The default is OFF at every level. A caller that has not been taught about the scope —
    // every Phase 35 caller — gets Phase 35's statement, not an audit-dominated feed.
    const deal = render(buildTimelineQuery("deal", "d1", null, 20))
    expect(countOf(deal.lower, 'from "audit_log"')).toBe(0)
    expect(countOf(deal.lower, "union all")).toBe(2)

    const org = render(buildTimelineQuery("organization", "o1", null, 20))
    expect(countOf(org.lower, 'from "audit_log"')).toBe(0)
    expect(countOf(org.lower, "union all")).toBe(0)
  })

  it("selects only kind, id, occurred_at and its text key from every branch", () => {
    const { lower } = render(buildTimelineQuery("deal", "d1", null, 20, false))

    // Two-step hydration keeps the union rows narrow. NULL-padding three different
    // column sets into one wide union row is the anti-pattern being prevented.
    // `occurred_at_key` is not a fourth display column: it is the SAME instant as
    // `occurred_at`, rendered at the column's own precision for the cursor (WR-02).
    expect(lower).not.toContain("content")
    expect(lower).not.toContain("title")
    expect(lower).toContain("occurred_at")
    expect(countOf(lower, "occurred_at_key")).toBe(4) // three branches + the outer select
  })

  it("renders the cursor key with to_char at microsecond precision on every branch", () => {
    // WR-02. `.US` is six fractional digits, always — fixed width, so the text sorts
    // exactly as the timestamp does. `.MS` (milliseconds) would reintroduce the defect.
    const { lower, text } = render(buildTimelineQuery("deal", "d1", null, 20, false))

    expect(countOf(lower, "to_char(")).toBe(3)
    expect(countOf(text, 'HH24:MI:SS.US"Z"')).toBe(3)
    expect(lower).not.toContain(".ms")
  })

  it("filters soft-deleted rows out of the notes and activities branches", () => {
    const { lower } = render(buildTimelineQuery("deal", "d1", null, 20, false))

    // notes_live_idx is partial on this predicate, but an index encodes a filter — it
    // does not enforce one (T-35-06).
    expect(countOf(lower, "deleted_at is null")).toBe(2)
  })
})

// ===========================================================================
// buildTimelineQuery — the audit scope  (vitest -t "audit")
// ===========================================================================

describe("buildTimelineQuery — the audit scope", () => {
  it("adds a fourth audit branch for a deal when the audit scope is on", () => {
    const { lower } = render(buildTimelineQuery("deal", "d1", null, 20, true))

    expect(lower).toContain('from "audit_log"')
    expect(countOf(lower, "union all")).toBe(3)
    // four branches + the outer select
    expect(countOf(lower, "occurred_at_key")).toBe(5)
    expect(countOf(lower, "to_char(")).toBe(4)
    // four branch sorts + limits, plus the outer pair
    expect(countOf(lower, "order by")).toBe(5)
    expect(countOf(lower, "limit")).toBe(5)
  })

  it("makes an organization, person and activity timeline a union for the first time when the audit scope is on", () => {
    for (const entityType of NON_DEAL_ENTITIES) {
      const { lower, params } = render(buildTimelineQuery(entityType, "e1", null, 20, true))

      // The one assertion the audit source falsifies in KIND rather than in degree: these
      // three had exactly one applicable source in Phase 35, so the degenerate-union branch
      // fired. `auditSource.appliesTo` returns true for every entity type.
      expect(countOf(lower, "union all")).toBe(1)
      expect(lower).toContain('from "notes"')
      expect(lower).toContain('from "audit_log"')
      expect(countOf(lower, 'from "activities"')).toBe(0)
      expect(countOf(lower, "order by")).toBe(3)
      expect(countOf(lower, "limit")).toBe(3)
      expect(params.filter((p) => p === 21)).toHaveLength(3)
      // entity_type is bound on BOTH branches, never rendered into the text (T-36-06).
      expect(params.filter((p) => p === entityType)).toHaveLength(2)
      expect(lower).not.toContain(`'${entityType}'`)
    }
  })

  it("gives every branch its own pre-limit when the audit scope is on", () => {
    const { params } = render(buildTimelineQuery("deal", "d1", null, 20, true))
    // four pre-limits + the outer limit
    expect(params.filter((p) => p === 21)).toHaveLength(5)
  })

  it("carries the keyset row comparison into the audit branch and binds it as text", () => {
    // The keyset is applied PER BRANCH, so a branch without it would return the same rows on
    // every page. On an audit surface, repeating or omitting history is the worst failure
    // available — hence both halves of WR-02 are asserted here too.
    const cursor = { instant: "2026-08-15T12:00:00.478940Z", id: "audit-19" }
    const deal = render(buildTimelineQuery("deal", "d1", cursor, 20, true))

    expect(countOf(deal.lower, ") < (")).toBe(4)
    expect(deal.lower).toContain("(al.created_at, al.id) < (")
    expect(countOf(deal.lower, "::text::timestamp")).toBe(4)
    expect(deal.params.filter((p) => p === cursor.instant)).toHaveLength(4)
    expect(deal.params.filter((p) => p instanceof Date)).toHaveLength(0)

    const org = render(buildTimelineQuery("organization", "o1", cursor, 20, true))
    expect(countOf(org.lower, ") < (")).toBe(2)
  })

  it("adds no soft-delete predicate for the audit branch, in either scope", () => {
    // NOT AN OMISSION. `audit_log` has no `deleted_at` column, because audit rows are
    // immutable append-only facts — the same reason `deal_stage_history` carries none. The
    // count is therefore 2 in BOTH scopes: notes and activities, and nothing else.
    expect(
      countOf(render(buildTimelineQuery("deal", "d1", null, 20, false)).lower, "deleted_at is null")
    ).toBe(2)
    expect(
      countOf(render(buildTimelineQuery("deal", "d1", null, 20, true)).lower, "deleted_at is null")
    ).toBe(2)
  })
})

// ===========================================================================
// buildTimelineQuery — pre-limit  (vitest -t "pre-limit")
// ===========================================================================

describe("buildTimelineQuery — pre-limit", () => {
  it("gives every branch its own pre-limit ORDER BY ... DESC, id DESC LIMIT", () => {
    const deal = render(buildTimelineQuery("deal", "d1", null, 20, false))
    // three branch sorts + the outer sort
    expect(countOf(deal.lower, "order by")).toBe(4)
    // three branch limits + the outer limit
    expect(countOf(deal.lower, "limit")).toBe(4)

    const org = render(buildTimelineQuery("organization", "o1", null, 20, false))
    expect(countOf(org.lower, "order by")).toBe(2)
    expect(countOf(org.lower, "limit")).toBe(2)
  })

  it("sets every pre-limit and the outer limit to pageSize + 1", () => {
    // The +1 is what derives hasMore; the row itself is discarded.
    const deal = render(buildTimelineQuery("deal", "d1", null, 20, false))
    expect(deal.params.filter((p) => p === 21)).toHaveLength(4)

    const org = render(buildTimelineQuery("organization", "o1", null, 20, false))
    expect(org.params.filter((p) => p === 21)).toHaveLength(2)
  })
})

// ===========================================================================
// buildTimelineQuery — cursor  (vitest -t "cursor")
// ===========================================================================

describe("buildTimelineQuery — cursor", () => {
  /** Microseconds on purpose: that is what `now()` writes into these columns. */
  const MICROSECOND_INSTANT = "2026-08-15T12:00:00.478940Z"
  const cursor = { instant: MICROSECOND_INSTANT, id: "note-19" }

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
      buildTimelineQuery("deal", "d1", { instant: MICROSECOND_INSTANT, id: probe }, 20)
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

    // Bound as text and cast back, so the wall clock round-trips exactly.
    expect(withCursor.params).toContain(MICROSECOND_INSTANT)
    expect(withCursor.lower).toContain("::timestamp")
  })

  it("binds the cursor instant at MICROSECOND precision on every branch", () => {
    // WR-02 REGRESSION. `bindInstant` used to take a JS `Date` and call `toISOString()`,
    // which is millisecond-only, so a cursor sitting at `.478940` was bound as `.478` —
    // strictly BELOW the cursor row's real instant. `(created_at, id) < (bound, id)` then
    // never reaches the `id` tiebreaker, and every entry in `[.478000, .478940)` is
    // excluded from this page and from every later one, `hasMore` notwithstanding.
    //
    // The cursor is decoded from the wire here rather than constructed inline, so this
    // covers the whole path the browser actually exercises: assembler -> encodeCursor ->
    // wire -> decodeCursor -> bound parameter.
    const decoded = decodeCursor(
      encodeCursor({ instant: MICROSECOND_INSTANT, id: "note-19" })
    )
    expect(decoded).not.toBeNull()

    const deal = render(buildTimelineQuery("deal", "d1", decoded, 20))

    expect(deal.params.filter((p) => p === MICROSECOND_INSTANT)).toHaveLength(3)
    expect(deal.params.filter((p) => p === "2026-08-15T12:00:00.478Z")).toHaveLength(0)
    // …and the sub-millisecond remainder is still there in the statement's parameters.
    expect(
      deal.params.filter((p) => typeof p === "string" && p.endsWith("940Z"))
    ).toHaveLength(3)

    const org = render(buildTimelineQuery("organization", "o1", decoded, 20))
    expect(org.params.filter((p) => p === MICROSECOND_INSTANT)).toHaveLength(1)
  })

  it("casts the bound instant through ::text before ::timestamp", () => {
    // WR-02, second half, and the one that cannot be reasoned about from this file alone.
    // A bare `$n::timestamp` lets Postgres resolve the parameter's type to `timestamp`,
    // and postgres.js then re-serializes the value for that OID with
    // `new Date(x).toISOString()` — so the DRIVER truncates the microseconds back off on
    // the wire, after everything above has kept them. Measured live:
    //   SELECT $1::text            -> 2026-08-15T21:33:08.478005Z
    //   SELECT $1::timestamp::text -> 2026-08-15 21:33:08.478      <- truncated
    //   SELECT $1::text::timestamp -> 2026-08-15 21:33:08.478005
    // `::text` pins the parameter to OID 25, whose serializer is `'' + x`.
    const { lower } = render(buildTimelineQuery("deal", "d1", cursor, 20))

    expect(countOf(lower, "::text::timestamp")).toBe(3)
    // No branch may bind the instant straight to a timestamp.
    expect(countOf(lower, "::timestamp")).toBe(countOf(lower, "::text::timestamp"))
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
    const oldestKeptRow = rows[TIMELINE_PAGE_SIZE - 1]

    expect(decoded).not.toBeNull()
    expect(decoded!.id).toBe(oldestKept.id)
    expect(decoded!.instant).toBe(oldestKeptRow.occurred_at_key)
    // Not the discarded 21st row.
    expect(decoded!.id).not.toBe("note-20")
  })

  it("builds nextCursor from occurred_at_key, not from the driver's millisecond Date", async () => {
    // WR-02 REGRESSION, assembler half. postgres.js parses OID 1114 into a JS `Date`, so
    // `row.occurred_at` has already lost the sub-millisecond remainder by the time this
    // module sees it. The cursor must come from the text key the statement emitted
    // alongside it — reconstructing it from `occurred_at` truncates and the next page
    // silently skips rows.
    const rows = noteRawRows(21).map((row, i) =>
      // A distinct sub-millisecond remainder per row: invisible in `occurred_at`.
      raw(row.kind, row.id, row.occurred_at, 940 - i)
    )
    stubExecute(rows)
    stubNotesHydration(rows)

    const page = await assembleTimeline({ entityType: "organization", entityId: "o1" })
    const decoded = decodeCursor(page.nextCursor)
    const oldestKeptRow = rows[TIMELINE_PAGE_SIZE - 1]

    expect(decoded!.instant).toBe(oldestKeptRow.occurred_at_key)
    expect(decoded!.instant).toContain(String(940 - (TIMELINE_PAGE_SIZE - 1)))
    // The truncated form the driver's Date would have produced.
    expect(decoded!.instant).not.toBe(oldestKeptRow.occurred_at.toISOString())
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
      raw("note", "n1", t(0)),
      raw("stage_change", "s1", t(1)),
      raw("activity", "a1", t(2)),
      raw("note", "n2", t(3)),
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
      raw("note", "n1", t(0)),
      raw("activity", "a1", t(1)),
      raw("stage_change", "s1", t(2)),
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
    const rows: RawRow[] = [raw("activity", "a1", t(0))]
    stubExecute(rows)
    stubSelect((table) => (table === activities ? [activityHydrationRow("a1", t(0))] : []))

    await assembleTimeline({ entityType: "deal", entityId: "d1" })

    const wheres = hydrationWhereText(activities)
    expect(wheres).toHaveLength(1)
    expect(wheres[0]).toContain('"deleted_at" is null')
  })

  it("hydrates an audit page with BATCHED reference reads and no per-entry fan-out", async () => {
    // T-36-38. A page is 20 entries and this runs inside the record detail page's own render,
    // so a resolution issued per entry would be dozens of sequential round trips on a
    // server-rendered path. Two entries that both moved `stageId` must cost ONE audit read
    // plus ONE stages read — not two, and not four.
    const t = (i: number) => new Date(T0 - i * 60_000)
    const rows: RawRow[] = [raw("audit", "al1", t(0)), raw("audit", "al2", t(1))]
    stubExecute(rows)
    stubSelect((table) => {
      if (table === auditLog) {
        return [
          auditHydrationRow("al1", t(0), { stageId: { from: "stage-1", to: "stage-2" } }),
          auditHydrationRow("al2", t(1), { stageId: { from: "stage-2", to: "stage-1" } }),
        ]
      }
      if (table === stages) {
        return [
          { id: "stage-1", name: "Lead" },
          { id: "stage-2", name: "Won" },
        ]
      }
      // No `customFields.` key in this page, so the definitions read is skipped entirely.
      return []
    })

    const page = await assembleTimeline({
      entityType: "deal",
      entityId: "d1",
      includeAudit: true,
    })

    expect(fromCalls).toEqual([auditLog, stages])

    const [entry] = page.entries
    expect(entry.kind).toBe("audit")
    if (entry.kind !== "audit") throw new Error("expected an audit entry")

    expect(entry).toMatchObject({
      action: "updated",
      entityType: "deal",
      actorKind: "user",
      actor: { id: "user-1", name: "Ada", email: "ada@example.com" },
      workflowRun: null,
      apiKeyName: null,
    })
    // A foreign key NEVER renders as the id itself (T-36-22).
    expect(entry.changes).toEqual([
      {
        field: "stageId",
        label: "audit.field.stage",
        from: { type: "reference", label: "Lead" },
        to: { type: "reference", label: "Won" },
      },
    ])
  })

  it("degrades every unresolvable audit reference to a null the renderer knows how to print", async () => {
    // Three separate degradations, none of which may become a guess or a broken link: a
    // referenced row that is gone, a workflow that was deleted after the run, and an api key
    // whose name `audit_log` does not store at all.
    const t = (i: number) => new Date(T0 - i * 60_000)
    const rows: RawRow[] = [raw("audit", "al1", t(0)), raw("audit", "al2", t(1))]
    stubExecute(rows)
    stubSelect((table) => {
      if (table === auditLog) {
        return [
          auditHydrationRow(
            "al1",
            t(0),
            { ownerId: { from: "user-9", to: "user-9" } },
            {
              actorKind: "workflow_run",
              actorId: null,
              actorName: null,
              actorEmail: null,
              runId: "run-1",
              // The run survived; the workflow did not, so the left join found nothing.
              workflowId: null,
              workflowName: null,
            }
          ),
          auditHydrationRow(
            "al2",
            t(1),
            {},
            {
              actorKind: "api_key",
              // The subscriber stores the KEY'S OWNER here — never the person who is then
              // named as the actor, because that would be an attribution nobody made.
              actorId: "user-1",
              actorName: "Ada",
              actorEmail: "ada@example.com",
            }
          ),
        ]
      }
      // users read returns nothing: the referenced owner has been hard-deleted.
      return []
    })

    const page = await assembleTimeline({
      entityType: "deal",
      entityId: "d1",
      includeAudit: true,
    })

    const [first, second] = page.entries
    if (first.kind !== "audit" || second.kind !== "audit") {
      throw new Error("expected two audit entries")
    }

    // A workflow that no longer exists renders as the plain kind label — never a link that
    // leads nowhere.
    expect(first.workflowRun).toBeNull()
    expect(first.actor).toBeNull()
    expect(first.changes[0].to).toEqual({ type: "reference", label: null })

    // `actorKind: "api_key"` must not borrow the joined user as the actor.
    expect(second.actor).toBeNull()
    expect(second.apiKeyName).toBeNull()
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
  it("sums one count per applicable source, with the audit source excluded by default", async () => {
    stubExecute([], 7)

    // notes + activities + stage history. The audit count is READ but not summed into the
    // total, because the list underneath the header cannot show those entries in this scope.
    expect(await countTimeline("deal", "d1")).toEqual({ total: 21, auditTotal: 7 })

    vi.clearAllMocks()
    stubExecute([], 7)
    expect(await countTimeline("organization", "o1")).toEqual({ total: 7, auditTotal: 7 })
  })

  it("moves the total with the audit scope and reports auditTotal in both states", async () => {
    // The header number MUST match what the list can show. A fixed "everything that ever
    // happened" total would print a number the reader can never reach by pressing Load more.
    stubExecute([], 7)
    expect(await countTimeline("deal", "d1", true)).toEqual({ total: 28, auditTotal: 7 })

    vi.clearAllMocks()
    stubExecute([], 7)
    expect(await countTimeline("organization", "o1", true)).toEqual({ total: 14, auditTotal: 7 })
  })

  it("reads both numbers in ONE pass", async () => {
    // Every count either number needs is issued together. A lazily-read audit count would be a
    // second pass whose answer could disagree with the first.
    stubExecute([], 7)

    await countTimeline("deal", "d1")

    // notes, activities, stage history, audit — four counts, no more and no fewer.
    expect(mockDb.execute).toHaveBeenCalledTimes(4)
    for (const call of mockDb.execute.mock.calls as unknown[][]) {
      expect(render(call[0] as SQL).lower).toContain("count(")
    }
  })

  it("rejects an entityType outside the four literals", async () => {
    stubExecute([], 7)
    await expect(
      countTimeline("user" as unknown as EntityType, "d1")
    ).rejects.toThrow()
  })
})
