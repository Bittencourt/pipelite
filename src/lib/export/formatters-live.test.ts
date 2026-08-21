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
import type { ExportEntityType, ExportFilters } from "./types"

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
  let baseline: { organizations: number; activities: number; auditLog: number }

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

  /** The same call with the full options surface, for the Phase 40 filters and the row cap. */
  function csvExportWith(
    entityType: ExportEntityType,
    options: { filters?: ExportFilters; maxRows?: number }
  ) {
    return fetchFilteredData({
      entityType,
      format: "csv",
      includeCustomFields: true,
      ...options,
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
      activities: await rawCount("activities"),
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

  // -------------------------------------------------------------------------
  // Phase 40: the row cap (T-40-31) and the admin path that must not move.
  //
  // A mocked suite can prove `limit` was passed. Only a real statement can prove the refusal
  // triggers on real volumes and that omitting the cap still reads every row — which is what the
  // admin full export (`src/app/admin/export/actions.ts`, no filters, no cap) depends on.
  // -------------------------------------------------------------------------

  it("refuses with `too_many` when the row count exceeds maxRows, and serialises nothing", async () => {
    const result = await csvExportWith("organization", { maxRows: 100 })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe("too_many")
    // No `data` field at all on the failure branch: the refusal happens BEFORE exportToCSV, so
    // 101 rows were never formatted.
    expect("data" in result).toBe(false)
  }, 60_000)

  it("succeeds unchanged when maxRows is above the live row count", async () => {
    const result = await csvExportWith("organization", { maxRows: 1_000_000 })

    expect(result.success).toBe(true)
    if (!result.success) return
    // Identical to the uncapped read — a cap that is never reached must not narrow anything.
    expect(result.count).toBe(baseline.organizations)
  }, 180_000)

  it("ADMIN PATH: no maxRows still reads every row", async () => {
    // The one thing this plan must not move. `fetchFilteredData` with neither filters nor a cap is
    // exactly what the admin full export calls.
    const result = await csvExport("organization")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.count).toBe(baseline.organizations)
  }, 180_000)

  it("BULK PATH: an empty id list still yields zero rows even with a cap in play", async () => {
    // T-38-01 must survive the arrival of `maxRows`: presence-not-length, and a cap that cannot
    // turn "no rows" into "all rows".
    const capped = await csvExportWith("organization", { filters: { ids: [] }, maxRows: 100 })

    expect(capped.success).toBe(true)
    if (!capped.success) return
    expect(capped.count).toBe(0)
    expect(capped.data).toBe("")
  }, 60_000)

  it("the search predicate narrows organizations rather than being ignored", async () => {
    // Anti-vacuity for the new `search` key: a predicate that silently did nothing would return
    // the baseline, and a broken one would return zero. Neither is acceptable, so both are excluded.
    const scoped = await csvExportWith("organization", { filters: { search: "a" } })

    expect(scoped.success).toBe(true)
    if (!scoped.success) return
    expect(scoped.count).toBeGreaterThan(0)
    expect(scoped.count).toBeLessThan(baseline.organizations)
  }, 180_000)

  // -------------------------------------------------------------------------
  // Phase 40 / A8: `status` against 79,022 real activities.
  //
  // This is the single most important measurement in the file for the export guard.
  // `hasExportableFilter("activity", { status: "overdue" })` is `true`, so if the predicate
  // narrowed nothing, that key would authorize an export of EVERY activity while looking like a
  // filter. "Not the total" is therefore an explicit assertion here, not an implication.
  // -------------------------------------------------------------------------

  it("status narrows activities to a strict, non-empty subset — and specifically NOT the total", async () => {
    const results: Record<string, number> = {}

    for (const status of ["completed", "pending", "overdue"]) {
      const result = await csvExportWith("activity", { filters: { status } })

      expect(result.success).toBe(true)
      if (!result.success) return

      results[status] = result.count

      // Both bounds matter. Zero would mean a predicate that matches nothing (a broken filter);
      // the total would mean a predicate that matches everything (an authorizing non-filter).
      expect(result.count).toBeGreaterThan(0)
      expect(result.count).toBeLessThan(baseline.activities)
    }

    // `completed` and `pending` PARTITION the table: every activity either has a completion
    // timestamp or does not. If the two do not sum to the total, one of them is not the predicate
    // it claims to be — and this is the assertion a one-sided "less than total" check would miss.
    expect(results.completed + results.pending).toBe(baseline.activities)

    // `overdue` is a strict subset of `pending`: incomplete AND past due. Equal would mean the
    // due-date comparison was dropped; greater would mean it selected completed rows too.
    expect(results.overdue).toBeLessThanOrEqual(results.pending)
    expect(results.overdue).toBeGreaterThan(0)

    // Recorded for the summary; the phase's context measured 4,165 pending / 4,151 overdue.
    console.log("LIVE activity status counts:", JSON.stringify(results), "total", baseline.activities)
  }, 300_000)

  it("an unrecognised status reads exactly as no status at all", async () => {
    // The fall-through branch, proved against real data: it must not quietly mean `completed`.
    const bogus = await csvExportWith("activity", { filters: { status: "not-a-status" } })
    const none = await csvExportWith("activity", {})

    expect(bogus.success).toBe(true)
    expect(none.success).toBe(true)
    if (!bogus.success || !none.success) return
    expect(bogus.count).toBe(none.count)
    expect(bogus.count).toBe(baseline.activities)
  }, 600_000)

  it("wrote nothing: organization, activity and audit_log counts are unchanged", async () => {
    expect(await rawCount("organizations")).toBe(baseline.organizations)
    expect(await rawCount("activities")).toBe(baseline.activities)
    expect(await rawCount("audit_log")).toBe(baseline.auditLog)
  }, 60_000)
})
