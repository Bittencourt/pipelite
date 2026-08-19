/**
 * DEDUP-01's importer half — the flagged-row count for a finished import.
 *
 * There is no database here. `@/db` is mocked down to `select` alone and `./identity-settings` is
 * mocked, so the three properties that actually matter are all countable facts about the
 * STATEMENTS the module builds rather than about a result set:
 *
 *   1. THE WORK IS BATCHED (T-39-38). An import of 25,206 rows must not become 25,206 queries.
 *      The only way to tell "batched" from "one query per record" without a database is to count
 *      the `db.select` calls, so every batching assertion below is a call count.
 *   2. A RECORD NEVER MATCHES ITSELF. Without the self-exclusion every imported record is flagged
 *      and the notice reports the size of the import. This is asserted with a fixture whose only
 *      candidate IS the imported row.
 *   3. NOTHING THROWS. A failed count must not break an import summary that is otherwise
 *      reporting a successful import, so a rejecting query returns 0 and logs.
 *
 * The harness (`installSelectMock`, `render`, `renderedWhere`) is copied from
 * `matching.test.ts` — the sibling module this one narrows candidates the same way as. It is
 * duplicated rather than extracted because `matching.test.ts` belongs to plan 39-08 and this plan
 * does not edit another plan's files; consolidating the two harnesses is a later cleanup.
 *
 * No deployment-specific custom-field label appears in this file — same note as
 * `matching.test.ts` and `identity-settings.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

vi.mock("@/db", () => ({ db: { select: vi.fn() } }))
vi.mock("./identity-settings", () => ({ readOrgIdentityFields: vi.fn() }))

import { db } from "@/db"
import { readOrgIdentityFields } from "./identity-settings"
import {
  countFlaggedImportedRecords,
  IMPORT_FLAG_BATCH_SIZE,
  IMPORT_FLAG_CANDIDATE_LIMIT,
  IMPORT_FLAG_MAX_RECORDS,
} from "./import-flags"

const mockSelect = (db as unknown as { select: ReturnType<typeof vi.fn> }).select
const mockReadIdentityFields = readOrgIdentityFields as unknown as ReturnType<typeof vi.fn>

const dialect = new PgDialect()

/** Two deployment-neutral stand-in labels. */
const FIELD_A = "Tax ID"
const FIELD_B = "Contact Email"

/** One recorded `db.select(...)` chain: the projection plus every clause hung off it. */
interface RecordedSelect {
  fields: Record<string, unknown>
  from?: unknown
  where?: SQL
  limit?: number
}

interface SelectBuilder extends PromiseLike<unknown[]> {
  from(table: unknown): SelectBuilder
  where(condition: SQL): SelectBuilder
  limit(rows: number): SelectBuilder
}

const selectCalls: RecordedSelect[] = []
let selectOutcomes: Array<unknown[] | Error> = []

function queueSelects(...outcomes: Array<unknown[] | Error>): void {
  selectOutcomes = outcomes
}

function installSelectMock(): void {
  mockSelect.mockImplementation((fields: Record<string, unknown>) => {
    const recorded: RecordedSelect = { fields }
    selectCalls.push(recorded)

    const outcome = selectOutcomes.shift() ?? []

    const builder: SelectBuilder = {
      from(table) {
        recorded.from = table
        return builder
      },
      where(condition) {
        recorded.where = condition
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

/** The WHERE clause of the nth recorded select, rendered. */
function renderedWhere(index = 0): { sql: string; params: unknown[] } {
  const call = selectCalls[index]
  if (!call) throw new Error(`db.select was not called ${index + 1} time(s)`)
  return render(call.where)
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  selectCalls.length = 0
  selectOutcomes = []
  installSelectMock()
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  // The default for every organization case that is not ABOUT the setting.
  mockReadIdentityFields.mockResolvedValue([FIELD_A, FIELD_B])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("countFlaggedImportedRecords — resolving which records an import created", () => {
  it("Test 1 — resolves created record ids from audit_log by import_session_id, action and entity_type", async () => {
    queueSelects(
      // The audit resolution.
      [{ entityId: "org-1" }],
      // The imported rows themselves.
      [{ id: "org-1", normName: "acme", customFields: { [FIELD_A]: "111" } }],
      // The candidates sharing that normalized name.
      [
        { id: "org-1", normName: "acme", customFields: { [FIELD_A]: "111" } },
        { id: "org-2", normName: "acme", customFields: { [FIELD_A]: "111" } },
      ]
    )

    const count = await countFlaggedImportedRecords({
      entityType: "organization",
      importSessionId: "session-abc",
    })

    expect(count).toBe(1)

    const resolution = renderedWhere(0)
    expect(resolution.sql).toContain('"import_session_id" = $1')
    expect(resolution.sql).toContain('"action" = $2')
    expect(resolution.sql).toContain('"entity_type" = $3')
    expect(resolution.params).toEqual(["session-abc", "created", "organization"])
    // The session id and the action are bind parameters, never interpolated (T-39-06).
    expect(resolution.sql).not.toContain("session-abc")
  })

  it("Test 2 — accepts recordIds directly and issues NO audit_log resolution query", async () => {
    queueSelects(
      [{ id: "org-1", normName: "acme", customFields: { [FIELD_A]: "111" } }],
      [
        { id: "org-1", normName: "acme", customFields: { [FIELD_A]: "111" } },
        { id: "org-2", normName: "acme", customFields: { [FIELD_A]: "111" } },
      ]
    )

    const count = await countFlaggedImportedRecords({
      entityType: "organization",
      recordIds: ["org-1"],
    })

    expect(count).toBe(1)
    // Two queries: the batch's own rows and the candidates. No third for the audit log.
    expect(selectCalls).toHaveLength(2)
    for (const call of selectCalls) {
      expect(render(call.where).sql).not.toContain("import_session_id")
    }
  })
})

describe("countFlaggedImportedRecords — a record is never a duplicate of itself", () => {
  it("Test 3 — a record whose ONLY candidate is itself is not counted", async () => {
    const self = { id: "org-1", normName: "acme", customFields: { [FIELD_A]: "111" } }

    queueSelects(
      [self],
      // The candidate set legitimately CONTAINS the imported row — it shares its own normalized
      // name and its own identity value, which is exactly why the exclusion has to be explicit.
      [self]
    )

    const count = await countFlaggedImportedRecords({
      entityType: "organization",
      recordIds: ["org-1"],
    })

    expect(count).toBe(0)
  })

  it("Test 3b — a person whose only candidate is itself is not counted", async () => {
    const self = {
      id: "person-1",
      email: "ana@example.com",
      normName: "ana silva",
      normPhone: "",
    }

    queueSelects([self], [self])

    const count = await countFlaggedImportedRecords({
      entityType: "person",
      recordIds: ["person-1"],
    })

    expect(count).toBe(0)
  })

  it("Test 3c — the same person IS counted once a second record shares the address", async () => {
    const self = {
      id: "person-1",
      email: "ana@example.com",
      normName: "ana silva",
      normPhone: "",
    }

    queueSelects(
      [self],
      [self, { id: "person-2", email: "ANA@example.com", normName: "ana silva", normPhone: "" }]
    )

    const count = await countFlaggedImportedRecords({
      entityType: "person",
      recordIds: ["person-1"],
    })

    expect(count).toBe(1)
  })
})

describe("countFlaggedImportedRecords — the work is bounded (T-39-38)", () => {
  it("Test 4 — ids are processed in batches, never one query per record", async () => {
    const recordIds = Array.from({ length: 250 }, (_, i) => `org-${i}`)
    const batches = Math.ceil(recordIds.length / IMPORT_FLAG_BATCH_SIZE)

    // Every batch resolves one row and one candidate set, so the whole run costs two queries per
    // batch and nothing per record.
    const outcomes: Array<unknown[]> = []
    for (let i = 0; i < batches; i += 1) {
      outcomes.push([{ id: `org-${i}`, normName: "acme", customFields: { [FIELD_A]: "111" } }])
      outcomes.push([{ id: "other", normName: "acme", customFields: { [FIELD_A]: "111" } }])
    }
    queueSelects(...outcomes)

    const count = await countFlaggedImportedRecords({ entityType: "organization", recordIds })

    expect(count).toBe(batches)
    expect(selectCalls).toHaveLength(batches * 2)
    // The point of the assertion: nowhere near one query per record.
    expect(selectCalls.length).toBeLessThan(recordIds.length)
    // The candidate fetch is capped on the QUERY, not after it.
    expect(selectCalls[1]?.limit).toBe(IMPORT_FLAG_CANDIDATE_LIMIT)
  })

  it("Test 4b — an empty recordIds list returns 0 and issues NO query at all", async () => {
    const count = await countFlaggedImportedRecords({ entityType: "organization", recordIds: [] })

    expect(count).toBe(0)
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("Test 4c — a session with zero created records returns 0 with no per-record query", async () => {
    queueSelects([])

    const count = await countFlaggedImportedRecords({
      entityType: "organization",
      importSessionId: "session-empty",
    })

    expect(count).toBe(0)
    // Exactly the one resolution query, and nothing after it.
    expect(selectCalls).toHaveLength(1)
  })

  it("Test 4d — the total number of ids considered is capped", async () => {
    const recordIds = Array.from(
      { length: IMPORT_FLAG_MAX_RECORDS + IMPORT_FLAG_BATCH_SIZE * 3 },
      (_, i) => `org-${i}`
    )

    queueSelects()

    await countFlaggedImportedRecords({ entityType: "organization", recordIds })

    const maxBatches = Math.ceil(IMPORT_FLAG_MAX_RECORDS / IMPORT_FLAG_BATCH_SIZE)
    // Each batch whose row fetch comes back empty costs exactly one query, so the call count is
    // the batch count — and it stops at the cap rather than at the input length.
    expect(selectCalls).toHaveLength(maxBatches)
  })
})

describe("countFlaggedImportedRecords — fail closed (S-5)", () => {
  it("Test 5 — a rejecting query returns 0, logs, and never throws", async () => {
    queueSelects(new Error("connection terminated"))

    const count = await countFlaggedImportedRecords({
      entityType: "organization",
      recordIds: ["org-1"],
    })

    expect(count).toBe(0)
    expect(errorSpy).toHaveBeenCalled()
    const logged = (errorSpy.mock.calls as unknown[][]).map((args) => String(args[0])).join(" ")
    expect(logged).toContain("[dedup-import-flags]")
  })

  it("Test 5b — a rejecting audit resolution returns 0 and logs", async () => {
    queueSelects(new Error("connection terminated"))

    const count = await countFlaggedImportedRecords({
      entityType: "organization",
      importSessionId: "session-abc",
    })

    expect(count).toBe(0)
    const logged = (errorSpy.mock.calls as unknown[][]).map((args) => String(args[0])).join(" ")
    expect(logged).toContain("[dedup-import-flags]")
  })

  it("Test 5c — the log line carries identifiers only, never a record's contents (T-39-10)", async () => {
    queueSelects(
      [{ id: "org-1", normName: "acme", customFields: { [FIELD_A]: "111" } }],
      new Error("candidate fetch failed")
    )

    await countFlaggedImportedRecords({ entityType: "organization", recordIds: ["org-1"] })

    const logged = (errorSpy.mock.calls as unknown[][])
      .map((args) => args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "))
      .join(" ")
    expect(logged).not.toContain("acme")
    expect(logged).not.toContain("111")
  })
})

describe("countFlaggedImportedRecords — the degraded paths cost nothing", () => {
  it("Test 6 — organizations with no configured identity field return 0 and issue NO query", async () => {
    mockReadIdentityFields.mockResolvedValue(null)

    const count = await countFlaggedImportedRecords({
      entityType: "organization",
      recordIds: ["org-1", "org-2"],
    })

    expect(count).toBe(0)
    // Not even the audit resolution: there is no certain tier, so nothing can be flagged and the
    // whole count is free.
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("Test 6b — the same holds for a session id: the setting is read before any query", async () => {
    mockReadIdentityFields.mockResolvedValue(null)

    const count = await countFlaggedImportedRecords({
      entityType: "organization",
      importSessionId: "session-abc",
    })

    expect(count).toBe(0)
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("Test 6c — people never read the organization identity setting", async () => {
    queueSelects([], [])

    await countFlaggedImportedRecords({ entityType: "person", recordIds: ["person-1"] })

    expect(mockReadIdentityFields).not.toHaveBeenCalled()
  })

  it("Test 6d — a batch of people whose addresses are ALL junk issues no candidate query", async () => {
    queueSelects([
      { id: "person-1", email: "#", normName: "ana silva", normPhone: "" },
      { id: "person-2", email: null, normName: "bruno souza", normPhone: "" },
      // A measured sentinel placeholder — syntactically valid, semantically meaningless.
      { id: "person-3", email: "teste@teste.com", normName: "carla lima", normPhone: "" },
    ])

    const count = await countFlaggedImportedRecords({
      entityType: "person",
      recordIds: ["person-1", "person-2", "person-3"],
    })

    expect(count).toBe(0)
    // The row fetch happened; the candidate fetch did not.
    expect(selectCalls).toHaveLength(1)
  })

  it("Test 6e — a batch of organizations whose names are all non-comparable issues no candidate query", async () => {
    queueSelects([
      { id: "org-1", normName: "", customFields: { [FIELD_A]: "111" } },
      // Initials: measured at 9 of 46,054 rows, and equality over them is one clique.
      { id: "org-2", normName: "a b", customFields: { [FIELD_A]: "222" } },
    ])

    const count = await countFlaggedImportedRecords({
      entityType: "organization",
      recordIds: ["org-1", "org-2"],
    })

    expect(count).toBe(0)
    expect(selectCalls).toHaveLength(1)
  })
})

describe("countFlaggedImportedRecords — the count is of RECORDS, not of pairs", () => {
  it("Test 7 — a record with three certain matches counts once", async () => {
    queueSelects(
      [{ id: "org-1", normName: "acme", customFields: { [FIELD_A]: "111" } }],
      [
        { id: "org-1", normName: "acme", customFields: { [FIELD_A]: "111" } },
        { id: "org-2", normName: "acme", customFields: { [FIELD_A]: "111" } },
        { id: "org-3", normName: "acme", customFields: { [FIELD_A]: "111" } },
        { id: "org-4", normName: "acme", customFields: { [FIELD_A]: "111" } },
      ]
    )

    const count = await countFlaggedImportedRecords({
      entityType: "organization",
      recordIds: ["org-1"],
    })

    expect(count).toBe(1)
  })

  it("Test 7b — an equal name with a DIFFERENT identity value is not certain and is not counted", async () => {
    queueSelects(
      [{ id: "org-1", normName: "acme", customFields: { [FIELD_A]: "111" } }],
      [
        { id: "org-1", normName: "acme", customFields: { [FIELD_A]: "111" } },
        { id: "org-2", normName: "acme", customFields: { [FIELD_A]: "999" } },
      ]
    )

    const count = await countFlaggedImportedRecords({
      entityType: "organization",
      recordIds: ["org-1"],
    })

    expect(count).toBe(0)
  })

  it("Test 7c — the candidate query narrows on the generated column and respects soft delete", async () => {
    queueSelects(
      [{ id: "org-1", normName: "acme", customFields: { [FIELD_A]: "111" } }],
      [{ id: "org-1", normName: "acme", customFields: { [FIELD_A]: "111" } }]
    )

    await countFlaggedImportedRecords({ entityType: "organization", recordIds: ["org-1"] })

    const candidates = renderedWhere(1)
    expect(candidates.sql).toContain('"norm_name" in (')
    expect(candidates.sql).toContain('"deleted_at" is null')
    expect(candidates.params).toContain("acme")
  })

  it("Test 7d — the person candidate query narrows on norm_email and respects soft delete", async () => {
    queueSelects(
      [{ id: "person-1", email: "Ana@Example.com ", normName: "ana silva", normPhone: "" }],
      [{ id: "person-1", email: "Ana@Example.com ", normName: "ana silva", normPhone: "" }]
    )

    await countFlaggedImportedRecords({ entityType: "person", recordIds: ["person-1"] })

    const candidates = renderedWhere(1)
    expect(candidates.sql).toContain('"norm_email" in (')
    expect(candidates.sql).toContain('"deleted_at" is null')
    // The generated column is `lower(btrim(email))`, so the probe has to be normalized the same
    // way or the equality never matches.
    expect(candidates.params).toContain("ana@example.com")
  })
})
