import { beforeEach, describe, expect, it, vi } from "vitest"

/* -----------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, AND WHAT IT CANNOT.
 *
 * `@/db` is mocked, so A MOCKED QUERY DOES NOT FILTER. Nothing here can show that a
 * `merged` row is absent from a result set — the mock returns whatever it is handed. So the
 * status rules are proven the way 39-06 established for this repo: BY ASSERTING THE
 * PREDICATE, plus by running the exported status mapping over a fixture containing all four
 * lifecycle values. The two halves together are the proof; either alone is a fiction.
 *
 * The property this file exists to pin above all others is that A COUNT AND A LIST CANNOT
 * DISAGREE. `/trash` learned that the hard way (its rule 1: the owner predicate is part of
 * the query, never a filter applied afterwards, and never on the rows without also being on
 * the counts). A tab reading "Organizations (12)" above three cards is a defect the user can
 * see and cannot explain, so the count query and the row query are asserted to carry the
 * BYTE-IDENTICAL predicate, produced by one exported helper.
 * ----------------------------------------------------------------------------------------- */

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}))

import { count, getTableName } from "drizzle-orm"

import { db } from "@/db"

import { PAIR_PAGE_SIZE } from "./constants"
import {
  countPairs,
  getPairDetail,
  listPairs,
  MAX_PAIR_PAGE,
  pairScope,
  pairStatusFor,
} from "./queries"

const mockDb = db as unknown as { select: ReturnType<typeof vi.fn> }

// ---------------------------------------------------------------------------------------
// A recording query chain.
//
// Every builder method returns the same object, which is ALSO a thenable — so one harness
// serves an aggregate, a single-row lookup and a joined page without the test having to know
// which shape a given function reaches for.
// ---------------------------------------------------------------------------------------

interface Statement {
  projection: Record<string, unknown> | undefined
  table: string
  joins: string[]
  where: unknown
  orderBy: unknown[]
  limit: number | null
  offset: number | null
}

/**
 * Column names, raw SQL text and bound string parameters reachable inside a drizzle condition.
 *
 * The bound strings are the half that can silently drift: a predicate that mentions `status`
 * proves nothing, because `status = 'open'` and `status = 'merged'` select disjoint sets.
 * `JSON.stringify` is unusable — a Column back-references its table and the structure is
 * circular (the `scan-cleanup.test.ts` precedent).
 */
function sqlTokens(node: unknown, acc: string[] = []): string[] {
  if (node === null || typeof node !== "object") return acc
  if (Array.isArray(node)) {
    for (const child of node) sqlTokens(child, acc)
    return acc
  }
  const record = node as Record<string, unknown>
  if (typeof record.name === "string") acc.push(record.name)
  if (typeof record.value === "string") acc.push(record.value)
  if (Array.isArray(record.value)) {
    for (const chunk of record.value) {
      if (typeof chunk === "string") acc.push(chunk)
      else sqlTokens(chunk, acc)
    }
  }
  if (Array.isArray(record.queryChunks)) sqlTokens(record.queryChunks, acc)
  return acc
}

const PAIR_ROW = {
  id: "pair-1",
  entityType: "organization" as const,
  recordAId: "org-a",
  recordBId: "org-b",
  tier: "likely" as const,
  reason: "similarName" as const,
  score: 0.91,
  status: "open" as const,
  scanId: "scan-1",
  dismissedByUserId: null,
  dismissedAt: null,
  createdAt: new Date("2026-08-19T10:00:00.000Z"),
  updatedAt: new Date("2026-08-19T10:00:00.000Z"),
}

const ORG_A = {
  id: "org-a",
  name: "Acme Ltda",
  normName: "acme",
  customFields: { "CNPJ / CPF": "111" },
  deletedAt: null,
}

const ORG_B = { ...ORG_A, id: "org-b", name: "ACME ME", customFields: { "CNPJ / CPF": "222" } }

interface SetupOptions {
  /** Aggregate results, keyed by the table the `count()` was taken over. */
  counts?: Record<string, number>
  /** Rows the joined list query resolves with. */
  listRows?: unknown[]
  /** The `duplicate_pairs` row `getPairDetail` reads, or `null` for "the pair is gone". */
  pairRow?: typeof PAIR_ROW | null
  recordARow?: Record<string, unknown> | null
  recordBRow?: Record<string, unknown> | null
  /** Table names whose query rejects. `"*"` rejects everything. */
  rejectOn?: string[]
}

interface Harness {
  statements: Statement[]
  forTable: (table: string) => Statement[]
  aggregates: () => Statement[]
}

function isAggregate(statement: Statement): boolean {
  return statement.projection !== undefined && "value" in statement.projection
}

function setup(options: SetupOptions = {}): Harness {
  const {
    counts = {},
    listRows = [],
    pairRow = PAIR_ROW,
    recordARow = ORG_A,
    recordBRow = ORG_B,
    rejectOn = [],
  } = options

  const statements: Statement[] = []

  const resolve = (statement: Statement): unknown => {
    if (rejectOn.includes("*") || rejectOn.includes(statement.table)) {
      throw new Error(`simulated failure on ${statement.table}`)
    }
    if (isAggregate(statement)) {
      return [{ value: counts[statement.table] ?? 0 }]
    }
    if (statement.table === "duplicate_pairs" && statement.joins.length > 0) {
      return listRows
    }
    if (statement.table === "duplicate_pairs") {
      return pairRow === null ? [] : [pairRow]
    }
    // A single-row entity read. The FIRST is record A, the second record B.
    const previousEntityReads = statements.filter(
      (entry) =>
        entry !== statement && !isAggregate(entry) && entry.table !== "duplicate_pairs"
    ).length
    const row = previousEntityReads === 0 ? recordARow : recordBRow
    return row === null ? [] : [row]
  }

  mockDb.select.mockImplementation((projection?: Record<string, unknown>) => {
    const statement: Statement = {
      projection,
      table: "",
      joins: [],
      where: undefined,
      orderBy: [],
      limit: null,
      offset: null,
    }

    const chain: Record<string, unknown> = {}
    const step = (name: string) => (...args: unknown[]) => {
      if (name === "from") {
        statement.table = getTableName(args[0] as Parameters<typeof getTableName>[0])
        statements.push(statement)
      }
      if (name === "leftJoin" || name === "innerJoin") {
        statement.joins.push(getTableName(args[0] as Parameters<typeof getTableName>[0]))
      }
      if (name === "where") statement.where = args[0]
      if (name === "orderBy") statement.orderBy = args
      if (name === "limit") statement.limit = args[0] as number
      if (name === "offset") statement.offset = args[0] as number
      return chain
    }

    for (const name of ["from", "leftJoin", "innerJoin", "where", "orderBy", "limit", "offset"]) {
      chain[name] = step(name)
    }
    chain.then = (onFulfilled: unknown, onRejected: unknown) =>
      new Promise((accept) => accept(resolve(statement))).then(
        onFulfilled as never,
        onRejected as never
      )

    return chain
  })

  return {
    statements,
    forTable: (table: string) => statements.filter((entry) => entry.table === table),
    aggregates: () => statements.filter(isAggregate),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.select.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("countPairs", () => {
  it("returns a per-entity-type, per-status map built from the shared scope helper", async () => {
    const harness = setup({ counts: { duplicate_pairs: 7 } })

    const result = await countPairs()

    expect(result).toEqual({
      organization: { open: 7, dismissed: 7 },
      person: { open: 7, dismissed: 7 },
    })

    // Four aggregates, one per (entity type, tab) cell, and EVERY ONE of them carries a
    // predicate produced by the exported helper. This is what makes a tab count and the page
    // of cards beneath it incapable of disagreeing.
    const aggregates = harness.aggregates()
    expect(aggregates).toHaveLength(4)

    const expected = [
      sqlTokens(pairScope("organization", false)),
      sqlTokens(pairScope("organization", true)),
      sqlTokens(pairScope("person", false)),
      sqlTokens(pairScope("person", true)),
    ]
    expect(aggregates.map((statement) => sqlTokens(statement.where))).toEqual(expected)
  })

  it("shares the exact predicate with listPairs, token for token", async () => {
    // THE ANTI-DRIFT ASSERTION. Not "both mention status" — the same tree.
    const harness = setup({ counts: { duplicate_pairs: 3 } })

    await countPairs()
    await listPairs({ entityType: "person", page: 1, dismissed: true })

    const countWhere = harness
      .aggregates()
      .map((statement) => sqlTokens(statement.where))
      .filter((tokens) => tokens.includes("person") && tokens.includes("dismissed"))
    const listWhere = harness
      .forTable("duplicate_pairs")
      .filter((statement) => statement.joins.length > 0)
      .map((statement) => sqlTokens(statement.where))

    expect(listWhere).toHaveLength(1)
    expect(countWhere).toContainEqual(listWhere[0])
  })

  it("returns null rather than a record of zeros when a count rejects", async () => {
    // A wrong number rendered confidently is worse than no number. `trash-tabs.tsx` renders no
    // count at all when `counts === null`, and this is the value that drives it.
    setup({ rejectOn: ["duplicate_pairs"] })

    await expect(countPairs()).resolves.toBeNull()

    const logged = vi.mocked(console.error).mock.calls.map((call) => String(call[0])).join("\n")
    expect(logged).toContain("[dedup-queries]")
  })
})

describe("listPairs", () => {
  it("fetches PAIR_PAGE_SIZE + 1 rows and trims the probe row to derive hasMore", async () => {
    const rows = Array.from({ length: PAIR_PAGE_SIZE + 1 }, (_unused, index) => ({
      pair: { ...PAIR_ROW, id: `pair-${index}` },
      recordA: ORG_A,
      recordB: ORG_B,
    }))
    const harness = setup({ listRows: rows })

    const result = await listPairs({ entityType: "organization", page: 1, dismissed: false })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.hasMore).toBe(true)
    expect(result.rows).toHaveLength(PAIR_PAGE_SIZE)

    const statement = harness.forTable("duplicate_pairs")[0]
    expect(statement.limit).toBe(PAIR_PAGE_SIZE + 1)
    // Cumulative, exactly like `listTrashed`: "Load more" appends to a list the user is already
    // looking at, so the read starts at 0 and grows rather than paging by offset.
    expect(statement.offset).toBe(0)
  })

  it("reports hasMore false and keeps every row when no probe row came back", async () => {
    const rows = Array.from({ length: 4 }, (_unused, index) => ({
      pair: { ...PAIR_ROW, id: `pair-${index}` },
      recordA: ORG_A,
      recordB: ORG_B,
    }))
    setup({ listRows: rows })

    const result = await listPairs({ entityType: "organization", page: 1, dismissed: false })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.hasMore).toBe(false)
    expect(result.rows).toHaveLength(4)
  })

  it("filters to open when dismissed is false and to dismissed when it is true", async () => {
    // TWO HALVES, because neither alone is a proof against a mocked query.
    //
    // Half one: the exported mapping, run over a fixture holding all four lifecycle values.
    const fixture = [
      { id: "a", status: "open" as const },
      { id: "b", status: "dismissed" as const },
      { id: "c", status: "merged" as const },
      { id: "d", status: "superseded" as const },
    ]
    expect(fixture.filter((row) => row.status === pairStatusFor(false)).map((r) => r.id)).toEqual([
      "a",
    ])
    expect(fixture.filter((row) => row.status === pairStatusFor(true)).map((r) => r.id)).toEqual([
      "b",
    ])

    // Half two: the query really binds that value, so `merged` and `superseded` are excluded by
    // the database and not by a filter this module forgot to apply.
    const harness = setup()
    await listPairs({ entityType: "organization", page: 1, dismissed: false })
    await listPairs({ entityType: "organization", page: 1, dismissed: true })

    const [openStatement, dismissedStatement] = harness.forTable("duplicate_pairs")
    const openTokens = sqlTokens(openStatement.where)
    expect(openTokens).toContain("status")
    expect(openTokens).toContain("open")
    expect(openTokens).not.toContain("merged")
    expect(openTokens).not.toContain("superseded")

    const dismissedTokens = sqlTokens(dismissedStatement.where)
    expect(dismissedTokens).toContain("dismissed")
    expect(dismissedTokens).not.toContain("open")
  })

  it("returns { ok: false } on a rejected query, never an empty success", async () => {
    // UI-SPEC's three distinct empty states depend on this. "Never scanned", "scanned, zero
    // pairs" and "the read broke" are three different sentences, and an empty success collapses
    // the third onto the second.
    setup({ rejectOn: ["duplicate_pairs"] })

    const result = await listPairs({ entityType: "organization", page: 1, dismissed: false })

    expect(result).toEqual({ ok: false })
    expect("rows" in result).toBe(false)
  })

  it("orders by created_at with an id tiebreaker, because one scan stamps every row alike", async () => {
    // NOT COSMETIC. Every pair a scan writes gets `now()` from the SAME transaction, so
    // thousands of rows share a created_at to the microsecond. Ordering on it alone leaves the
    // page boundary undefined, and a cumulative read then shows a row twice or never.
    const harness = setup()

    await listPairs({ entityType: "organization", page: 1, dismissed: false })

    const statement = harness.forTable("duplicate_pairs")[0]
    expect(statement.orderBy.length).toBeGreaterThanOrEqual(2)
    const tokens = statement.orderBy.flatMap((term) => sqlTokens(term))
    expect(tokens).toContain("created_at")
    expect(tokens).toContain("id")
  })

  it("clamps the page so a hand-edited URL cannot ask for an unbounded read", async () => {
    const harness = setup()

    await listPairs({ entityType: "organization", page: 10_000, dismissed: false })

    const statement = harness.forTable("duplicate_pairs")[0]
    expect(statement.limit).toBe(PAIR_PAGE_SIZE * MAX_PAIR_PAGE + 1)
  })

  it("joins both records so a card can render a name without a query per row", async () => {
    const harness = setup()

    await listPairs({ entityType: "organization", page: 1, dismissed: false })

    const statement = harness.forTable("duplicate_pairs")[0]
    // Two joins, one per side of the pair, aliased.
    expect(statement.joins).toHaveLength(2)
    // And a record soft-deleted since the scan joins to nothing rather than dropping the pair:
    // the join carries the visibility predicate, so `name` arrives null and the card can say so.
    const joinTokens = statement.joins.length > 0 ? sqlTokens(statement.where) : []
    expect(joinTokens).toContain("entity_type")
  })
})

describe("getPairDetail", () => {
  it("returns the pair, both records and the child counts", async () => {
    const harness = setup({ counts: { deals: 4, people: 2, notes: 9 } })

    const detail = await getPairDetail("pair-1")

    expect(detail).not.toBeNull()
    expect(detail!.pair.id).toBe("pair-1")
    expect(detail!.recordA.id).toBe("org-a")
    expect(detail!.recordB.id).toBe("org-b")
    expect(detail!.recordA.childCounts).toEqual({ deals: 4, people: 2, notes: 9 })
    expect(detail!.recordB.childCounts).toEqual({ deals: 4, people: 2, notes: 9 })
    // The whole row travels, so `buildMergeFieldGroups` (plan 39-15) can compare every column
    // without this module having to know which ones it compares.
    expect(detail!.recordA.row).toMatchObject({ name: "Acme Ltda" })

    // Six aggregates: three child tables, two records.
    expect(harness.aggregates()).toHaveLength(6)
  })

  it("returns null when the pair is gone", async () => {
    setup({ pairRow: null })

    await expect(getPairDetail("pair-1")).resolves.toBeNull()
  })

  it("returns null when either record has been soft-deleted since the scan", async () => {
    // UI-SPEC M-8's "one record already gone". Reachable: another user can merge or delete the
    // same pair while this screen is open.
    setup({ recordBRow: null })

    await expect(getPairDetail("pair-1")).resolves.toBeNull()
  })

  it("returns null and never raises when a query rejects", async () => {
    setup({ rejectOn: ["*"] })

    await expect(getPairDetail("pair-1")).resolves.toBeNull()

    const logged = vi.mocked(console.error).mock.calls.map((call) => String(call[0])).join("\n")
    expect(logged).toContain("[dedup-queries]")
  })

  it("counts children on the SAME predicates mergeRecordsMutation reparents on", async () => {
    // UI-SPEC M-6 is how success criterion 4 ("nothing is orphaned") becomes checkable by a
    // human BEFORE the merge. A count that disagrees with what the merge actually moves is
    // worse than no count at all, so the predicates are asserted rather than assumed.
    const harness = setup({ counts: { deals: 1, people: 1, notes: 1 } })

    await getPairDetail("pair-1")

    const dealTokens = harness.forTable("deals").map((statement) => sqlTokens(statement.where))
    expect(dealTokens).toHaveLength(2)
    for (const tokens of dealTokens) expect(tokens).toContain("organization_id")

    const peopleTokens = harness.forTable("people").map((statement) => sqlTokens(statement.where))
    expect(peopleTokens).toHaveLength(2)
    for (const tokens of peopleTokens) expect(tokens).toContain("organization_id")

    const noteTokens = harness.forTable("notes").map((statement) => sqlTokens(statement.where))
    expect(noteTokens).toHaveLength(2)
    for (const tokens of noteTokens) {
      expect(tokens).toContain("entity_id")
      // Polymorphic: `notes.entityId` has no foreign key, so the type is half the key.
      expect(tokens).toContain("entity_type")
      // AND NO `deleted_at`, deliberately — `mergeRecordsMutation`'s two notes statements carry
      // none either, because `notes_migration_uniq` has no `deleted_at` clause and a
      // soft-deleted migration note still occupies the slot. A count that filtered here would
      // promise a smaller number than the merge moves.
      expect(tokens).not.toContain("deleted_at")
    }
  })

  it("omits the people count for a person pair, because a person has no people", async () => {
    const personPair = { ...PAIR_ROW, entityType: "person" as const }
    const harness = setup({
      pairRow: personPair,
      recordARow: { id: "p-a", firstName: "Maria", lastName: "Silva", deletedAt: null },
      recordBRow: { id: "p-b", firstName: "Maria", lastName: "Silva", deletedAt: null },
      counts: { deals: 3, notes: 5 },
    })

    const detail = await getPairDetail("pair-1")

    expect(detail!.recordA.childCounts).toEqual({ deals: 3, people: null, notes: 5 })
    // `people` was never queried: the emptiness is expressed as a control, not as a comment.
    expect(harness.forTable("people")).toHaveLength(0)
    // A person's deals hang off `person_id`, which is what the merge reparents.
    const dealTokens = harness.forTable("deals").map((statement) => sqlTokens(statement.where))
    for (const tokens of dealTokens) {
      expect(tokens).toContain("person_id")
      expect(tokens).not.toContain("organization_id")
    }
  })
})

describe("pairScope", () => {
  it("carries the entity type and the status, and only those", async () => {
    const tokens = sqlTokens(pairScope("organization", false))
    expect(tokens).toContain("entity_type")
    expect(tokens).toContain("organization")
    expect(tokens).toContain("status")
    expect(tokens).toContain("open")
  })

  it("is the only thing that decides which status a tab shows", () => {
    // `count()` is imported purely so this file fails to compile if the aggregate helper the
    // module uses ever stops being drizzle's.
    expect(typeof count).toBe("function")
    expect(pairStatusFor(false)).toBe("open")
    expect(pairStatusFor(true)).toBe("dismissed")
  })
})
