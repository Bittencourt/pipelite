/**
 * THE COUNT EQUALS THE FILE. Proven against the real `pipelite` database, not a fixture.
 *
 * `countExportMatches` produces the number the selectivity guard will authorize on.
 * `fetchFilteredData` produces the file the user receives. If those two numbers can differ, the
 * bound is bypassable — and the bypass is silent, because both halves keep "working". This file is
 * the observation that they are the same number, for three real filters on three entity types plus a
 * zero-match case, plus the no-filter case which is the exposure itself.
 *
 * They are the same number BY CONSTRUCTION after plan 50-04: both sides obtain their predicate from
 * `buildExportConditions`. This file is what turns that from a claim about the code's shape into a
 * measurement.
 *
 * ── WHY THERE IS NO `describe.skipIf` HERE, ON PURPOSE ───────────────────────────────────────────
 *
 * A SILENT SKIP IS THE DEFECT CLASS THIS PHASE EXISTS TO REMOVE. 28 tests in
 * `formatters-live.test.ts` and `export-events-live.test.ts` sat skipped for FOUR PHASES behind
 * `describe.skipIf(!process.env.DATABASE_URL)` — never failing, never running, and counted in
 * nobody's headline. Phase 40's verifier named it: "a check that never runs at all".
 *
 * So this file does not have one. It is excluded from the base project by `vitest.config.ts`'s
 * `-live` glob exclusion and collected ONLY by `vitest.live.config.ts`, which supplies `DATABASE_URL`
 * behind a loopback fence — so `@/db`'s module-load throw is unreachable and the STATIC imports below
 * are safe. It is therefore NOT in `SKIPPED_LIVE_FILES` either: that carve-out asserts every listed
 * file CONTAINS `describe.skipIf(`, so adding a file without one would redden it.
 *
 * What replaces the skip is the PRE-FLIGHT block: `DATABASE_URL` set, loopback, named `pipelite`,
 * and the four live volumes equal to the integers this file asserts against. A wrong database fails
 * LOUDLY and by name rather than passing confusingly.
 *
 * RUN IT WITH:
 *   docker compose up -d          # Postgres, host 5433 -> container 5432
 *   npm run test:live
 *
 *   # this file alone:
 *   ./node_modules/.bin/vitest run --config vitest.live.config.ts \
 *     src/lib/export/export-selectivity-live.test.ts
 *
 * ── THIS FILE WRITES NOTHING, AND ASSERTS AS MUCH ───────────────────────────────────────────────
 *
 * It issues `select count(*)` and `fetchFilteredData` reads. No insert, no update, no delete. The
 * final cell re-reads `audit_log`'s count and asserts it is unchanged — and note what that assertion
 * is and is not worth: `audit_log` holds 214 rows with ZERO `entity_type='export'`, so an "unchanged"
 * assertion is weak evidence on its own. It is here because the alternative — not checking — is how a
 * read-only claim rots. SC-5's positive proof (214 -> 215, 0 -> 1) belongs to plan 50-06.
 *
 * ── WHY `owner` AND `assignee` APPEAR IN NO CASE BELOW ──────────────────────────────────────────
 *
 * Both would make an equality cell pass on a degenerate set, which is the shape T-50-04-07 names.
 * Measured (50-MEASUREMENTS §4, §5):
 *
 *   deal `owner=ef4acac9…`             25,195 of 25,195 = 100.00%   — the WHOLE table
 *   activity `owner=ef4acac9…`         79,022 of 79,022 = 100.00%   — the WHOLE table
 *   `deal_assignees`                   0 rows                       — EMPTY
 *   activity `assignee_id IS NOT NULL` 0 of 79,022                  — EMPTY
 *
 * An equality proved on the whole table cannot distinguish a correct predicate from no predicate at
 * all, and one proved on the empty set cannot distinguish a correct predicate from a broken one.
 * `search=ltda` (13,355 = 29.00%), activity `type=meeting` (2,993) and deal `stage=Base Fria - Lead`
 * (3,466) are none of those things.
 *
 * ── NO CLOCK, ANYWHERE ──────────────────────────────────────────────────────────────────────────
 *
 * No `Date.now()`, no `performance.now()`, no elapsed-time assertion, no timing threshold. The query
 * costs are recorded in `export-count.ts`'s header and in the SUMMARY, never in an assertion.
 * `suite-timing-hygiene.test.ts` propagates clock taint by variable NAME rather than by scope, so a
 * single elapsed number here would convert the SQL count floors below into reported timing
 * thresholds one file over.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { fetchFilteredData } from "./formatters"
import { countExportMatches } from "./export-count"
import { decideSelectivity, exportAllowance } from "./export-selectivity"
import type { ExportEntityType, ExportFilters } from "./types"

/**
 * THE LIVE VOLUMES, as named integers, re-measured 2026-08-27 (50-MEASUREMENTS §1) and re-confirmed
 * at the start of plan 50-04's execution.
 *
 * Table name -> `count(*) where deleted_at is null`.
 */
const LIVE_VOLUME: Record<ExportEntityType, { table: string; total: number }> = {
  organization: { table: "organizations", total: 46_054 },
  person: { table: "people", total: 38_348 },
  deal: { table: "deals", total: 25_195 },
  activity: { table: "activities", total: 79_022 },
}

/** organization `search=ltda` — SC-2's admitted case, 29.00% of the customer table. */
const LTDA_MATCHED = 13_355
/** organization `search=a` — SC-1's headline, 96.09%, and a REFUSAL. */
const SEARCH_A_MATCHED = 44_254
/** The allowance on organizations: `max(1000, floor(46054 * 0.40))`. */
const ORG_ALLOWANCE = 18_421
/** activity `type=meeting`. */
const MEETING_MATCHED = 2_993
/** deal `stage=Base Fria - Lead`. */
const BASE_FRIA_LEAD_MATCHED = 3_466

/**
 * THE ACTIVITIES ALLOWANCE — 31,608, NOT 31,609. `DEF-50-01` / `50-MEASUREMENTS` DELTA D-1.
 *
 * `50-RESEARCH.md:774` computed its allowance column with `Math.round` and therefore states 31,609.
 * The locked rule is `max(MIN_EXPORT_ROWS, floor(total * MAX_EXPORT_FRACTION))` — **floor** — so on
 * 79,022 activities the allowance is 31,608 and **31,609 is the smallest REFUSED count**. Asserted
 * adjacently below so the boundary is unambiguous to the next reader: a plan copying 31,609 as "the
 * allowance" would go RED against correct code.
 */
const ACTIVITY_ALLOWANCE = 31_608
const ACTIVITY_SMALLEST_REFUSED = 31_609

const csvOptions = (entityType: ExportEntityType, filters?: ExportFilters) => ({
  entityType,
  format: "csv" as const,
  includeCustomFields: true,
  ...(filters === undefined ? {} : { filters }),
})

/** The row count the export ACTUALLY produced, from the export's own result shape. */
async function exportedCount(
  entityType: ExportEntityType,
  filters?: ExportFilters
): Promise<number> {
  const result = await fetchFilteredData(csvOptions(entityType, filters))

  // A failed export has no count, and returning 0 for it would make an equality cell pass against a
  // broken read. Fail here, naming the error the export gave.
  expect(
    result.success,
    `fetchFilteredData(${entityType}) failed: ${result.success ? "" : result.error}`
  ).toBe(true)
  if (!result.success) throw new Error("unreachable — asserted above")

  return result.count
}

describe("countExportMatches equals the export's own row count, against live data", () => {
  /** Raw SQL, so every truth is read independently of the predicate under test. */
  async function rawCount(whereSql: string): Promise<number> {
    const rows = (await db.execute(
      sql.raw(`select count(*)::int as n from ${whereSql}`)
    )) as unknown as { n: number }[]

    return rows[0].n
  }

  let auditLogAtStart: number
  let meetingTypeId: string
  let baseFriaLeadStageId: string

  beforeAll(async () => {
    auditLogAtStart = await rawCount("audit_log")

    // Ids read from the database rather than hard-coded. NOTE, against the plan's wording: these are
    // NOT uuids on both tables — `activity_types.id` is a slug (`meeting`), while `stages.id` is a
    // uuid. Reading them is right for the stated reason (the value must come from somewhere
    // independent of the predicate under test), but a reader should not expect two uuids.
    const types = (await db.execute(
      sql.raw(`select id from activity_types where name = 'Meeting' limit 1`)
    )) as unknown as { id: string }[]
    const stages = (await db.execute(
      sql.raw(`select id from stages where name = 'Base Fria - Lead' limit 1`)
    )) as unknown as { id: string }[]

    meetingTypeId = types[0]?.id
    baseFriaLeadStageId = stages[0]?.id
  }, 120_000)

  afterAll(async () => {
    // Without this the postgres-js pool keeps the vitest worker alive.
    await db.$client.end({ timeout: 5 })
  })

  // ── PRE-FLIGHT ────────────────────────────────────────────────────────────────────────────────

  it("PRE-FLIGHT: DATABASE_URL is set, loopback, and names `pipelite`", () => {
    // This file has no `describe.skipIf` on purpose (see the header). This cell is what replaces it:
    // a wrong or absent database must fail LOUDLY here rather than produce confusing figures below.
    const raw = process.env.DATABASE_URL

    expect(
      raw,
      "DATABASE_URL is not set. This file runs ONLY in the live project — `npm run test:live`. It " +
        "has no describe.skipIf by design, because a silent skip is the defect this phase removes."
    ).toBeTruthy()

    const url = new URL(raw as string)

    expect(["localhost", "127.0.0.1", "::1", "[::1]"]).toContain(url.hostname)
    expect(
      url.pathname.replace(/^\//, ""),
      "DATABASE_URL does not name the `pipelite` database, so the live-scale integers below would " +
        "be asserted against the wrong data."
    ).toBe("pipelite")
  })

  it("PRE-FLIGHT: the four live volumes still equal 50-MEASUREMENTS' integers", async () => {
    const measured: Record<string, number> = {}

    for (const entityType of Object.keys(LIVE_VOLUME) as ExportEntityType[]) {
      const { table } = LIVE_VOLUME[entityType]
      measured[table] = await rawCount(`${table} where deleted_at is null`)
    }

    for (const entityType of Object.keys(LIVE_VOLUME) as ExportEntityType[]) {
      const { table, total } = LIVE_VOLUME[entityType]

      expect(
        measured[table],
        `LIVE VOLUME DRIFT on \`${table}\`: this file asserts ${total} and the database holds ` +
          `${measured[table]}. Every named integer in this file, and in 50-MEASUREMENTS.md, is ` +
          `derived from these four volumes — the allowances, the matched counts and the ` +
          `admit/refuse verdicts all move with them. DO NOT relax this cell. RE-MEASURE against ` +
          `the live database, update 50-MEASUREMENTS.md, then update every named integer here. A ` +
          `silent adaptation is how a phase ends up asserting two different numbers in two files.`
      ).toBe(total)
    }
  }, 120_000)

  it("PRE-FLIGHT: read the Meeting type id and the Base Fria - Lead stage id", () => {
    // ANTI-VACUITY for the two equality cells that use them: an undefined id would make the filter a
    // no-op and the export return the whole table, which a bare `matched === count` would still pass.
    expect(meetingTypeId, "no activity_type named `Meeting`").toBeTruthy()
    expect(baseFriaLeadStageId, "no stage named `Base Fria - Lead`").toBeTruthy()
  })

  // ── THE EQUALITY: THE COUNT AND THE FILE ──────────────────────────────────────────────────────

  it("organization + search=ltda: the count equals the export, and both are 13,355", async () => {
    const { matched, total } = await countExportMatches("organization", { search: "ltda" })
    const produced = await exportedCount("organization", { search: "ltda" })

    // THE EQUALITY, first and on its own line: this is the property the whole plan exists for.
    expect(
      matched,
      "the selectivity guard would authorize on a different number than the export produces"
    ).toBe(produced)

    // NAMED INTEGERS, not `> 0`: a filter that matched everything, or nothing, would satisfy a bare
    // positivity check while proving nothing about the predicate.
    expect(matched).toBe(LTDA_MATCHED)
    expect(total).toBe(LIVE_VOLUME.organization.total)

    // AND STRICTLY BETWEEN: neither the empty set nor the whole table.
    expect(matched).toBeGreaterThan(0)
    expect(matched).toBeLessThan(total)
  }, 300_000)

  it("activity + type=Meeting: the count equals the export, and both are 2,993", async () => {
    const filters = { type: meetingTypeId }
    const { matched, total } = await countExportMatches("activity", filters)
    const produced = await exportedCount("activity", filters)

    expect(matched).toBe(produced)
    expect(matched).toBe(MEETING_MATCHED)
    expect(total).toBe(LIVE_VOLUME.activity.total)
    expect(matched).toBeGreaterThan(0)
    expect(matched).toBeLessThan(total)
  }, 300_000)

  it("deal + stage=Base Fria - Lead: the count equals the export, and both are 3,466", async () => {
    const filters = { stage: baseFriaLeadStageId }
    const { matched, total } = await countExportMatches("deal", filters)
    const produced = await exportedCount("deal", filters)

    expect(matched).toBe(produced)
    expect(matched).toBe(BASE_FRIA_LEAD_MATCHED)
    expect(total).toBe(LIVE_VOLUME.deal.total)
    expect(matched).toBeGreaterThan(0)
    expect(matched).toBeLessThan(total)
  }, 300_000)

  it("THE ZERO-MATCH CASE: organization + search=zzzz is 0 on both sides", async () => {
    // Proves the equality is not an artefact of both sides being large. A predicate that silently
    // matched everything would pass the three cells above's equality half but not this one, and a
    // predicate that was dropped entirely would return 46,054 here.
    const { matched, total } = await countExportMatches("organization", { search: "zzzz" })
    const produced = await exportedCount("organization", { search: "zzzz" })

    expect(matched).toBe(produced)
    expect(matched).toBe(0)
    expect(produced).toBe(0)
    // The denominator is still the whole table, which is what makes this a ZERO MATCH rather than an
    // empty table.
    expect(total).toBe(LIVE_VOLUME.organization.total)
  }, 300_000)

  // ── `total` IS THE BASE PREDICATE, AND NOTHING ELSE ───────────────────────────────────────────
  //
  // WHAT THESE TWO CELLS DO AND DO NOT PROVE — labelled honestly, because the obvious reading is
  // stronger than the truth. They prove `total` carries NO EXTRA term: a viewer scope, an `ids`
  // scope or a filter leaking into the denominator would change the number and redden them.
  //
  // They do NOT prove `total` carries the SOFT-DELETE term. MEASURED: all four live tables hold ZERO
  // soft-deleted rows (46,054/0 · 38,348/0 · 25,195/0 · 79,022/0), so `count(*)` and
  // `count(*) where deleted_at is null` are the same number and the raw-SQL comparison below is
  // satisfied either way. Plan 50-04's ablation 2 deleted the term and `npm run test:live` stayed
  // GREEN at 47 passed — recorded rather than glossed.
  //
  // The detector for that half is STRUCTURAL and lives in
  // `__tests__/view-filters.test.ts`'s counter cell, which asserts all four `isNull(<table>.deletedAt)`
  // appear in `export-count.ts`. Do not read these two cells as covering it.

  it.each(Object.keys(LIVE_VOLUME) as ExportEntityType[])(
    "%s: total carries no term beyond the base predicate (see the note above on soft deletes)",
    async (entityType) => {
      const { table, total: expected } = LIVE_VOLUME[entityType]
      const raw = await rawCount(`${table} where deleted_at is null`)
      const { total } = await countExportMatches(entityType, undefined)

      expect(
        total,
        `${entityType}'s denominator is not the base predicate. A viewer-scoped or ids-scoped ` +
          `total would inflate the allowance and admit broader exports than the rule intends.`
      ).toBe(raw)
      expect(total).toBe(expected)
    },
    300_000
  )

  it.each(Object.keys(LIVE_VOLUME) as ExportEntityType[])(
    "%s: with NO filters, matched EQUALS total — the unfiltered export is the whole live table",
    async (entityType) => {
      // THE EXPOSURE, STATED AS AN ASSERTION rather than as prose. This is what SEC-03 bounds: an
      // export carrying no narrowing predicate returns every row in the table.
      const { matched, total } = await countExportMatches(entityType, undefined)

      expect(matched).toBe(total)
      expect(matched).toBe(LIVE_VOLUME[entityType].total)
    },
    300_000
  )

  // ── THE TWO HALVES OF THE DECISION MEET, AGAINST REAL DATA ───────────────────────────────────

  it("search=a composes to a REFUSAL carrying 44,254 / 46,054 / 18,421", async () => {
    // The arithmetic half (50-01) and the I/O half (this plan) meeting for the first time, before
    // any call site changes — so a failure in 50-06 cannot be blamed on either one.
    const counts = await countExportMatches("organization", { search: "a" })
    const decision = decideSelectivity(counts)

    expect(counts.matched).toBe(SEARCH_A_MATCHED)
    expect(counts.total).toBe(LIVE_VOLUME.organization.total)
    expect(decision).toEqual({
      ok: false,
      matched: SEARCH_A_MATCHED,
      total: LIVE_VOLUME.organization.total,
      allowance: ORG_ALLOWANCE,
    })
    // And the allowance in the payload is the rule's own, not a number this file invented.
    expect(exportAllowance(LIVE_VOLUME.organization.total)).toBe(ORG_ALLOWANCE)
  }, 300_000)

  it("search=ltda composes to an ADMISSION — the bound is not simply refusing everything", async () => {
    // ANTI-VACUITY for the refusal above. A rule that refused every export would satisfy SC-1 and
    // destroy SC-2, and 13,355 of 46,054 is the legitimately narrow export that must still complete.
    const counts = await countExportMatches("organization", { search: "ltda" })

    expect(counts.matched).toBe(LTDA_MATCHED)
    expect(decideSelectivity(counts)).toEqual({ ok: true })
    // Under the allowance, and by how much — so the margin is visible rather than implied.
    expect(counts.matched).toBeLessThan(ORG_ALLOWANCE)
    expect(ORG_ALLOWANCE - counts.matched).toBe(5_066)
  }, 300_000)

  it("the activities allowance is 31,608 and 31,609 is the smallest REFUSED count (DEF-50-01)", () => {
    // Both sides of the boundary, adjacently, against the LIVE total. `50-RESEARCH.md:774` states
    // 31,609 as the allowance because its column used `Math.round`; the rule is `floor`. A cell
    // asserting 31,609 as the allowance would be RED against correct code.
    const activityTotal = LIVE_VOLUME.activity.total

    expect(exportAllowance(activityTotal)).toBe(ACTIVITY_ALLOWANCE)
    expect(ACTIVITY_SMALLEST_REFUSED).toBe(ACTIVITY_ALLOWANCE + 1)

    // The allowance is the largest ADMITTED value — `>` and never `>=`.
    expect(decideSelectivity({ matched: ACTIVITY_ALLOWANCE, total: activityTotal })).toEqual({
      ok: true,
    })
    expect(
      decideSelectivity({ matched: ACTIVITY_SMALLEST_REFUSED, total: activityTotal })
    ).toEqual({
      ok: false,
      matched: ACTIVITY_SMALLEST_REFUSED,
      total: activityTotal,
      allowance: ACTIVITY_ALLOWANCE,
    })
  })

  // ── AND IT WROTE NOTHING ──────────────────────────────────────────────────────────────────────

  it("WROTE NOTHING: audit_log's count is unchanged", async () => {
    const auditLogAtEnd = await rawCount("audit_log")

    expect(
      auditLogAtEnd,
      "this file inserted or deleted audit_log rows. It is READ-ONLY: counts and exports only."
    ).toBe(auditLogAtStart)

    // ANTI-VACUITY, and an honest one: an "unchanged" assertion on a table with zero export rows is
    // weak evidence, so the anchor states what was actually observed. SC-5's POSITIVE proof
    // (214 -> 215, 0 -> 1) is plan 50-06's, not this file's.
    expect(auditLogAtStart).toBeGreaterThan(0)
    const exportRows = await rawCount(`audit_log where entity_type = 'export'`)

    expect(
      exportRows,
      "an export audit row exists. This file writes none, so either another process wrote it or " +
        "50-06 has landed and this anchor needs updating."
    ).toBe(0)
  }, 120_000)
})
