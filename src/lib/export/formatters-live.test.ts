/**
 * LIVE-DATABASE PROBE for `ExportFilters.ids` (BULK-04). Read-only: this file seeds nothing,
 * mutates nothing and deletes nothing, and asserts as much at the end.
 *
 * WHY THE ENV GATE. `src/db/index.ts` throws `"DATABASE_URL environment variable is not set"`
 * at MODULE LOAD, and vitest does not populate `process.env.DATABASE_URL`. `vitest.config.ts`
 * collects `src/**\/*.test.ts`, so this file IS picked up by the default run and therefore has to
 * self-skip: the suite is gated on `describe.skipIf(!process.env.DATABASE_URL)` and both `@/db`
 * and `./formatters` are imported DYNAMICALLY inside `beforeAll`, which never runs for a skipped
 * suite. That keeps `npm test` hermetic while leaving this coverage one env var away.
 *
 * RUN IT WITH:
 *   DATABASE_URL="postgresql://pipelite:pipelite@localhost:5433/pipelite" \
 *     ./node_modules/.bin/vitest run src/lib/export/formatters-live.test.ts
 *
 * Note the port: `.env.local` says 5432 but the Docker mapping is host 5433 -> container 5432,
 * so the connection string must be passed explicitly.
 *
 * WHY THIS FILE IS NOT OPTIONAL. Phase 37 shipped a malformed drizzle fragment — an interpolated
 * id list that expanded to the invalid `= ANY(($1,$2,$3))` — and a wholly-mocked suite passed it
 * cleanly. `formatters.test.ts` stubs `@/db`, so it can prove a predicate was ADDED but never
 * that Postgres accepts it or that it selects the right rows. Only a real statement against real
 * data can. The single most important assertion below is that an EMPTY id list returns ZERO rows
 * rather than the whole table (T-38-01): that is the second line of defence behind the
 * `(ids: string[])`-only signature the per-entity bulk export actions carry.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Papa from "papaparse"
import { sql } from "drizzle-orm"
import type { ExportEntityType } from "./types"

const HAS_DB = !!process.env.DATABASE_URL

/** Table each entity type reads from, used only for the independent raw-SQL id lookups below. */
const TABLE_BY_ENTITY: Record<ExportEntityType, string> = {
  organization: "organizations",
  person: "people",
  deal: "deals",
  activity: "activities",
}

const NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000"

describe.skipIf(!HAS_DB)("fetchFilteredData against the live database", () => {
  let db: (typeof import("@/db"))["db"]
  let fetchFilteredData: (typeof import("./formatters"))["fetchFilteredData"]

  /** ids read straight out of Postgres, per entity type. */
  const liveIds: Partial<Record<ExportEntityType, string[]>> = {}
  /** Row counts snapshotted before any export ran, re-asserted at the end. */
  let baseline: { organizations: number; auditLog: number }

  async function rawIds(table: string, limit: number): Promise<string[]> {
    // Raw SQL on purpose: the ids under test must come from somewhere independent of the
    // membership predicate this file exists to verify. Both interpolated values are
    // module-level literals (`TABLE_BY_ENTITY` and a hard-coded limit) — nothing here is
    // reachable from a request.
    const rows = (await db.execute(
      sql.raw(`select id from ${table} where deleted_at is null limit ${limit}`)
    )) as unknown as { id: string }[]
    return rows.map((r) => r.id)
  }

  async function rawCount(table: string): Promise<number> {
    const rows = (await db.execute(sql.raw(`select count(*)::int as n from ${table}`))) as unknown as {
      n: number
    }[]
    return rows[0].n
  }

  function csvExport(entityType: ExportEntityType, ids?: string[]) {
    return fetchFilteredData({
      entityType,
      format: "csv",
      includeCustomFields: true,
      ...(ids === undefined ? {} : { filters: { ids } }),
    })
  }

  beforeAll(async () => {
    db = (await import("@/db")).db
    fetchFilteredData = (await import("./formatters")).fetchFilteredData

    for (const entityType of Object.keys(TABLE_BY_ENTITY) as ExportEntityType[]) {
      liveIds[entityType] = await rawIds(TABLE_BY_ENTITY[entityType], 3)
    }

    baseline = {
      organizations: await rawCount("organizations"),
      auditLog: await rawCount("audit_log"),
    }
  }, 60_000)

  afterAll(async () => {
    // Without this the postgres-js pool keeps the vitest worker alive.
    if (db) await db.$client.end({ timeout: 5 })
  })

  it("read real ids for all four entity types", () => {
    // Anti-vacuity for every assertion below: an id list that came back empty would make the
    // scoped-export checks pass trivially.
    for (const entityType of Object.keys(TABLE_BY_ENTITY) as ExportEntityType[]) {
      expect(liveIds[entityType]!.length).toBeGreaterThan(0)
    }
  })

  it("returns exactly the requested organizations", async () => {
    const ids = liveIds.organization!
    const result = await csvExport("organization", ids)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.count).toBe(ids.length)
  }, 60_000)

  it("emits one CSV data row per requested organization, each carrying its id", async () => {
    const ids = liveIds.organization!
    const result = await csvExport("organization", ids)

    expect(result.success).toBe(true)
    if (!result.success) return

    // Parsed, not line-counted: notes fields contain embedded newlines inside quoted cells.
    const parsed = Papa.parse<Record<string, string>>(result.data, {
      header: true,
      skipEmptyLines: true,
    })
    expect(parsed.errors).toEqual([])
    expect(parsed.data.length).toBe(ids.length)
    expect(parsed.data.map((r) => r.id).sort()).toEqual([...ids].sort())
  }, 60_000)

  it("returns strictly more organizations with no filter than with three ids — proving the narrowing was real", async () => {
    const unfiltered = await csvExport("organization")

    expect(unfiltered.success).toBe(true)
    if (!unfiltered.success) return

    expect(unfiltered.count).toBeGreaterThan(liveIds.organization!.length)
    // The unfiltered export and a direct count of live rows must agree exactly; a mismatch
    // would mean the fetcher's own base predicate had drifted.
    expect(unfiltered.count).toBe(baseline.organizations)
  }, 180_000)

  // -------------------------------------------------------------------------
  // The T-38-01 assertions, per entity type.
  // -------------------------------------------------------------------------

  const entityCases = Object.keys(TABLE_BY_ENTITY) as ExportEntityType[]

  describe.each(entityCases)("%s", (entityType) => {
    it("returns exactly the requested ids", async () => {
      const ids = liveIds[entityType]!
      const result = await csvExport(entityType, ids)

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.count).toBe(ids.length)
    }, 60_000)

    it("returns ZERO rows for an empty id list, never the whole table", async () => {
      const result = await csvExport(entityType, [])

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.count).toBe(0)
      expect(result.data).toBe("")
    }, 60_000)

    it("returns zero rows for an id that does not exist, without throwing", async () => {
      const result = await csvExport(entityType, [NONEXISTENT_ID])

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.count).toBe(0)
    }, 60_000)
  })

  it("wrote nothing: organization and audit_log counts are unchanged", async () => {
    expect(await rawCount("organizations")).toBe(baseline.organizations)
    expect(await rawCount("audit_log")).toBe(baseline.auditLog)
  }, 60_000)
})
