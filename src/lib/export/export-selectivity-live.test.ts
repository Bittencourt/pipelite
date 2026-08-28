/**
 * THE COUNT EQUALS THE FILE, AND THE BOUND HOLDS AT LIVE SCALE. Proven against the real `pipelite`
 * database, not a fixture.
 *
 * Two halves, landed by two plans:
 *
 *   - **50-04's half.** `countExportMatches` produces the number the selectivity guard will
 *     authorize on. `fetchFilteredData` produces the file the user receives. If those two numbers
 *     can differ, the bound is bypassable — and the bypass is silent, because both halves keep
 *     "working". Those cells are the observation that they are the same number, for three real
 *     filters on three entity types plus a zero-match case, plus the no-filter case which is the
 *     exposure itself.
 *   - **50-06's half (SC-1, SC-2, SC-4, SC-5).** The whole decision driven END TO END through
 *     `exportViewResults` as a real, asserted, non-admin `member`: the near-whole-table export
 *     REFUSED with both numbers in the refusal, the real worst case refused, the narrow export still
 *     COMPLETING with a parsed CSV, the threshold approached and crossed over nine widening steps,
 *     and the audit row observed going 0 → 1 and removed again.
 *
 * They are the same number BY CONSTRUCTION after plan 50-04: both sides obtain their predicate from
 * `buildExportConditions`. This file is what turns that from a claim about the code's shape into a
 * measurement.
 *
 * ── WHAT IS MOCKED, AND WHY IT IS THE MINIMUM ───────────────────────────────────────────────────
 *
 * `@/auth`. ONLY `@/auth`. `exportViewResults` opens with `await auth()`, which reads an Auth.js JWT
 * out of request headers that an in-process call does not have, so without the mock every cell below
 * would return `unauthenticated` and prove nothing about SEC-03. `session.user.id` is also the
 * identity the audit row attributes to, which is why it must be a REAL user id — `actor_user_id` is
 * a genuine foreign key.
 *
 * Everything that DECIDES the outcome under test is real, and each is named here the way
 * `src/app/api/files/__tests__/files-route-ownership.db.test.ts` names its own minimum:
 *
 *   - `@/db` — real. The queries run against 46,054 organizations, 38,348 people, 25,195 deals and
 *     79,022 activities.
 *   - `export-count.ts` — real. The `matched`/`total` pair is measured, never supplied.
 *   - `export-selectivity.ts` — real. The admit/refuse decision is the module's own.
 *   - `formatters.ts` — real. The predicate, the flattening, the custom fields and the papaparse
 *     serialisation are the ones the user gets.
 *   - `view-export-guard.ts` — real. Both the whitelist guard and `EXPORT_ROW_CAP`.
 *   - `recordExport` — real, and it really inserts into `audit_log` (see the write discipline below).
 *
 * A mocked count or a mocked fetch would make every cell in this file decorative: it would be
 * asserting that a stub returned what the test told it to.
 *
 * ── WHY THE ACTOR IS A `member`, WHY THE ROLE IS ASSERTED, AND WHY THERE IS NO ADMIN CELL ───────
 *
 * SC-1 is "a non-admin cannot export substantially the whole table". This deployment has TEN users,
 * TWO of them admins, so a proof of that criterion run as an admin proves nothing at all — and the
 * failure would be invisible, because the refusal it observed would be the same refusal. So the
 * actor is READ from the database (`role = 'member' AND status = 'approved' AND deleted_at IS NULL`,
 * lowest email) and its `role` is ASSERTED to be `'member'` in a pre-flight cell before any other
 * cell uses it.
 *
 * NOTE, AGAINST 50-06-PLAN's INTERFACES SECTION: the plan states that query resolves to
 * `emily.davis@pipelite.local`. It does not. `emily.davis@pipelite.local` IS soft-deleted
 * (`deleted_at IS NOT NULL`), along with five of the seven `pipelite.local` members, so the
 * `deleted_at IS NULL` term the plan's own SQL carries excludes it. It resolves to
 * `pedrobittencourt87@gmail.com`. The query is right; the plan's predicted answer was not. Reading
 * the row rather than hard-coding the uuid is exactly what made the difference visible.
 *
 * AND THERE IS DELIBERATELY NO ADMIN CELL HERE, for three reasons, stated so the absence reads as a
 * decision rather than an omission:
 *
 *   1. THERE IS NO ADMIN BRANCH TO EXERCISE. The bound applies to EVERY authenticated user.
 *      `export-action.ts` contains no role check at all.
 *   2. NOTHING IS LOST BY THAT. `src/app/admin/export/actions.ts` is already a separate, role-gated,
 *      unbounded export, so admins keep the path they have.
 *   3. THE ABSENCE IS GATED. `__tests__/view-filters.test.ts` asserts, over comment-stripped source,
 *      that `export-action.ts` contains neither an `'admin'` string nor a bare `role` token. An
 *      admin cell here would be describing a branch the repository forbids.
 *
 * `50-RESEARCH.md` recommended additionally proving "the same broad export still completes for an
 * admin". `50-CONTEXT.md`'s post-research decision superseded that recommendation, and this file
 * follows the DECISION, not the research.
 *
 * ── WHY `owner` AND `assignee` APPEAR IN NO ADMITTED CASE ───────────────────────────────────────
 *
 * Both would make a cell pass on a degenerate set — the shape T-50-04-07 and T-50-06-03 name.
 * Measured (50-MEASUREMENTS §4, §5; re-confirmed by direct SQL at the start of 50-06):
 *
 *   deal `owner=ef4acac9…`             25,195 of 25,195 = 100.00%   — the WHOLE table
 *   activity `owner=ef4acac9…`         79,022 of 79,022 = 100.00%   — the WHOLE table
 *   `deal_assignees`                   0 rows                       — EMPTY
 *   activity `assignee_id IS NOT NULL` 0 of 79,022                  — EMPTY
 *
 * A "narrow export still completes" proof on `owner` would pass on the whole table; the same proof
 * on `assignee` would pass on the empty set. Both are vacuous, in opposite directions. So SC-2 uses
 * `search=ltda` (13,355 = 29.00%) and activity `type=meeting` (2,993), and neither key appears in an
 * admitted cell.
 *
 * `owner` DOES appear — once, on the REFUSED side, because that is where its 100.00% is the point.
 *
 * ── WHAT THE WORST CASE ACTUALLY IS, AND IT IS NOT THE ROADMAP'S EXAMPLE ────────────────────────
 *
 * The roadmap's illustration is `search=a`: 44,254 of 46,054 organizations, 96.09%. Loud, but not
 * the worst. Every deal in this deployment is owned by ONE user — `select count(distinct owner_id)
 * from deals where deleted_at is null` is exactly 1 — and `owner` is on `EXPORTABLE_FILTER_KEYS.deal`.
 * So `/deals` + `owner=ef4acac9-e860-4e71-9db5-ddaa2808cb9f` is **25,195 of 25,195 = 100.00%, under
 * `EXPORT_ROW_CAP`**: a member exporting every deal in the business, all of them belonging to the
 * admin `prbitt@gmail.com`, through a whitelisted key, with the pre-phase cap never firing. That is
 * the worst live instance of WR-04, and it is proven refused below alongside the loud one.
 *
 * ── THE WRITE DISCIPLINE, AND IT HAS CHANGED SINCE 50-04 ────────────────────────────────────────
 *
 * 50-04's cells were READ-ONLY and this header said so. That is NO LONGER TRUE, and pretending
 * otherwise would be the kind of stale comment this milestone keeps deleting.
 *
 * An ADMITTED export calls `recordExport`, which INSERTS one `audit_log` row. So every admitted cell
 * below writes exactly one row and then takes it back out — matched on the id READ BACK from the
 * probe, plus `actor_user_id = <this file's member>`, and **NEVER on `entity_type` alone**, which
 * would destroy a real export's evidence if a person exported something while the suite ran.
 * `afterAll` deletes any id this file recorded and re-asserts both counts. `audit_log` is
 * append-only with the retention pruner as its only other deleter, so a test that left rows behind
 * would be corrupting the one record this control produces.
 *
 * SC-5 is the POSITIVE half of that: `audit_log` held 214 rows and ZERO with `entity_type='export'`
 * — no view export had ever been recorded on this deployment — and the SC-5 cell observes 214 → 215
 * and 0 → 1, asserts the row's contents, and removes it. An "unchanged count" assertion would have
 * passed today while proving nothing whatever, which is precisely why SC-5 needed an observation
 * rather than an assertion.
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
 * the four live volumes equal to the integers this file asserts against, an actor whose role is
 * `member`, and a cell proving the session mock is LIVE. A wrong database, or a wrong actor, fails
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
 * ── NO CLOCK, ANYWHERE ──────────────────────────────────────────────────────────────────────────
 *
 * No `Date.now()`, no `performance.now()`, no elapsed-time assertion, no timing threshold. The
 * per-test timeouts below are LIVENESS BACKSTOPS against a hang, never margins. Query costs are
 * recorded in `export-count.ts`'s header and in the SUMMARYs, never in an assertion.
 * `suite-timing-hygiene.test.ts` propagates clock taint by variable NAME rather than by scope, so a
 * single elapsed number here would convert the SQL count floors below into reported timing
 * thresholds one file over.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import Papa from "papaparse"

/**
 * THE ONE MOCK. `vi.hoisted` so the factory can reach it, and mutable so a single cell can clear
 * the session and prove the mock is the thing supplying identity.
 *
 * `null` rather than a session with an empty id when `userId` is `""`: that is what an
 * unauthenticated `auth()` actually returns, and the difference is what the "mock is live" cell
 * below turns into evidence.
 */
const authState = vi.hoisted(() => ({ userId: "" }))

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => (authState.userId ? { user: { id: authState.userId } } : null)),
}))

import { db } from "@/db"
import { auditLog } from "@/db/schema"
import { exportViewResults } from "@/lib/views/export-action"
import { fetchFilteredData } from "./formatters"
import { countExportMatches } from "./export-count"
import { decideSelectivity, exportAllowance } from "./export-selectivity"
import { EXPORT_ROW_CAP } from "./view-export-guard"
import type { ExportEntityType, ExportFilters } from "./types"

/**
 * THE LIVE VOLUMES, as named integers, re-measured 2026-08-27 (50-MEASUREMENTS §1) and re-confirmed
 * at the start of plan 50-04's execution and again at the start of 50-06's.
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
 * THE SOLE DEAL OWNER, and the reason SC-1's worst case exists. Every one of the 25,195 live deals
 * carries this `owner_id` — `select count(distinct owner_id) …` is 1, asserted in a pre-flight cell
 * rather than trusted. The user is `prbitt@gmail.com`, an ADMIN, which is what makes a member
 * exporting all of them through `owner` the sharpest live instance of WR-04.
 */
const SOLE_DEAL_OWNER_ID = "ef4acac9-e860-4e71-9db5-ddaa2808cb9f"
/** deal `owner=<the sole owner>` — 25,195 of 25,195 = 100.00%, and UNDER the 50,000 cap. */
const DEAL_OWNER_MATCHED = 25_195
/** The allowance on deals: `max(1000, floor(25195 * 0.40))`. */
const DEAL_ALLOWANCE = 10_078

/**
 * activity `status=completed` — 74,857 of 79,022. THE CAP'S ONE LIVE BRANCH BEFORE THIS PHASE: it is
 * above `EXPORT_ROW_CAP = 50_000`, so the same request used to be refused as `too_many`. It is now
 * refused as `too_broad`, and that handover is asserted rather than assumed.
 */
const ACTIVITY_COMPLETED_MATCHED = 74_857

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

/**
 * `audit_log` AT THE START, as named integers. 214 rows, and ZERO with `entity_type='export'` — no
 * view export has ever been recorded on this deployment, verified independently five times across
 * phase 50 and deliberately left untouched by plans 50-01 through 50-05 so that the 0 → 1
 * transition would be OBSERVED here rather than asserted away.
 */
const AUDIT_LOG_TOTAL_AT_START = 214
const EXPORT_AUDIT_ROWS_AT_START = 0

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

/** Raw SQL, so every truth is read independently of the predicate under test. */
async function rawCount(whereSql: string): Promise<number> {
  const rows = (await db.execute(
    sql.raw(`select count(*)::int as n from ${whereSql}`)
  )) as unknown as { n: number }[]

  return rows[0].n
}

/** The actor every end-to-end cell runs as, READ from the database rather than hard-coded. */
type Actor = { id: string; email: string; role: string; status: string }

async function resolveMemberActor(): Promise<Actor | undefined> {
  const rows = (await db.execute(
    sql.raw(
      `select id, email, role, status from users
        where role = 'member' and status = 'approved' and deleted_at is null
        order by email
        limit 1`
    )
  )) as unknown as Actor[]

  return rows[0]
}

/** Every `audit_log` id this file caused, for the `afterAll` safety net. */
const auditRowIdsCreated: string[] = []

/**
 * READ BACK, then DELETE BY THE IDS READ BACK, every export audit row this file's actor caused.
 *
 * THE PREDICATE IS DELIBERATELY NARROWER THAN `entity_type = 'export'`. A delete matched on
 * `entity_type` would also remove a row a person's real export wrote while the suite ran, which
 * would both destroy evidence and MASK A LEAK — the suite would report a clean table it had itself
 * emptied. So the read is scoped to `entity_type='export' AND actor_user_id = <this file's member>`,
 * and the delete matches the ids that read produced. The residual collision is one real export by
 * that same member during the run; it is stated rather than hidden, and the row contents asserted by
 * the SC-5 cell would catch it.
 */
async function takeExportAuditRows(actorUserId: string) {
  const rows = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, "export"), eq(auditLog.actorUserId, actorUserId)))
    .orderBy(desc(auditLog.createdAt))

  if (rows.length > 0) {
    const ids = rows.map((row) => row.id)

    auditRowIdsCreated.push(...ids)
    await db.delete(auditLog).where(inArray(auditLog.id, ids))
  }

  return rows
}

/** `changes` is JSONB; this is the shape `recordExport` writes. */
type ExportChanges = {
  exportedEntityType: { from: null; to: string }
  rowCount: { from: null; to: number }
  filters: { from: null; to: string }
}

describe("countExportMatches equals the export's own row count, against live data", () => {
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

  // ── AND THESE CELLS WROTE NOTHING ─────────────────────────────────────────────────────────────

  it("THIS SUITE WROTE NOTHING: audit_log's count is unchanged by the count-equality cells", async () => {
    const auditLogAtEnd = await rawCount("audit_log")

    expect(
      auditLogAtEnd,
      "the count-equality cells inserted or deleted audit_log rows. They are READ-ONLY: counts and " +
        "`fetchFilteredData` reads only. `fetchFilteredData` is BELOW `recordExport` in the call " +
        "graph — only `exportViewResults` records — so a change here means something else moved."
    ).toBe(auditLogAtStart)

    // ANTI-VACUITY, and an honest one: an "unchanged" assertion on a table with zero export rows is
    // weak evidence, which is why the SC-5 suite below makes a POSITIVE 0 -> 1 observation instead.
    expect(auditLogAtStart).toBe(AUDIT_LOG_TOTAL_AT_START)
    expect(auditLogAtStart).toBeGreaterThan(0)

    const exportRows = await rawCount(`audit_log where entity_type = 'export'`)

    expect(
      exportRows,
      "an export audit row exists at the end of the count-equality suite. Those cells write none, " +
        "and the SC-5 suite below has not run yet, so either another process wrote it or an " +
        "earlier suite failed to remove its own row."
    ).toBe(EXPORT_AUDIT_ROWS_AT_START)
  }, 120_000)
})

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * SC-1 AND SC-2, END TO END THROUGH `exportViewResults`, AS AN ASSERTED NON-ADMIN MEMBER.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Everything above is `countExportMatches` and `decideSelectivity` composed by the TEST. Everything
 * below is the ACTION composing them itself, at live scale, for a real user — which is the only
 * shape that can distinguish "the rule is correct" from "the rule is wired in".
 *
 * A FIRST-RUN GREEN HERE PROVES NOTHING ON ITS OWN. The fix landed in 50-05, so every cell below
 * passed on its first execution. What makes these cells evidence rather than description is the six
 * ablations recorded in `50-06-SUMMARY.md`: delete `decideSelectivity` and the `too_broad` return and
 * SC-1's cells go red; set the fraction to 0.99 and they go red while SC-2's stay green; set it to
 * 0.01 and SC-2's go red while SC-1's stay green; zero the refusal payload and the exact-number
 * assertions go red while "is refused" stays green.
 */
describe("SEC-03 end to end: exportViewResults as a real member, at live scale", () => {
  let actor: Actor | undefined

  beforeAll(async () => {
    actor = await resolveMemberActor()
    // The mock reads this on every `auth()` call, so setting it here is what makes every cell below
    // run as that member.
    authState.userId = actor?.id ?? ""
  }, 120_000)

  afterAll(async () => {
    // THE SAFETY NET. Any id this file recorded, removed by id, then both counts re-asserted. It
    // runs even if a cell above threw part-way through an admitted export.
    if (auditRowIdsCreated.length > 0) {
      await db.delete(auditLog).where(inArray(auditLog.id, auditRowIdsCreated))
    }

    const remaining = await rawCount(`audit_log where entity_type = 'export'`)
    const total = await rawCount("audit_log")

    expect(
      remaining,
      "this file left an export audit row behind. audit_log is append-only with the retention " +
        "pruner as its only other deleter, so a leftover row is a corruption of the one record " +
        "this control produces."
    ).toBe(EXPORT_AUDIT_ROWS_AT_START)
    expect(total).toBe(AUDIT_LOG_TOTAL_AT_START)
  }, 120_000)

  // ── PRE-FLIGHT: THE ACTOR, AND THE MOCK ───────────────────────────────────────────────────────

  it("PRE-FLIGHT: the actor is a real, approved, non-deleted `member` — asserted, not assumed", () => {
    expect(
      actor,
      "no `member` / `approved` / not-soft-deleted user exists. Every cell below would then run " +
        "as `unauthenticated` and prove nothing about SEC-03."
    ).toBeTruthy()
    if (!actor) throw new Error("unreachable — asserted above")

    // THE ASSERTION THAT MAKES SC-1 MEAN WHAT IT SAYS. A "a non-admin cannot export the whole
    // table" proof run as one of this deployment's two admins would observe the same refusal and
    // prove nothing, because there is no admin branch to differ on.
    expect(
      actor.role,
      `the export is being driven as \`${actor.role}\`, not \`member\`. SC-1 is about a NON-ADMIN.`
    ).toBe("member")
    expect(actor.status).toBe("approved")
    expect(actor.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    // Recorded in 50-06-SUMMARY.md: `pedrobittencourt87@gmail.com`. NOT
    // `emily.davis@pipelite.local`, which 50-06-PLAN predicted and which is soft-deleted.
    expect(actor.email).toContain("@")
  })

  it("PRE-FLIGHT: the deployment really has admins, so acting as a member is a CHOICE", async () => {
    // ANTI-VACUITY for the cell above. If every user were a `member`, "we ran as a member" would be
    // a tautology rather than a decision. There are two admins, and the actor is neither.
    const admins = await rawCount(`users where role = 'admin' and deleted_at is null`)

    expect(admins).toBeGreaterThan(0)
    expect(admins).toBe(2)
  }, 120_000)

  it("PRE-FLIGHT: the session mock is LIVE — an empty map is `refused`, not `unauthenticated`", async () => {
    // WITHOUT THIS CELL THE WHOLE SUITE COULD BE PROVING `auth()`. If the mock were inert, every
    // call below would stop at `if (!session?.user?.id)` and return `unauthenticated` — a refusal,
    // superficially the right shape, that says nothing whatever about the selectivity bound. That
    // distinction is the difference between proving SEC-03 and proving the auth guard.
    const authenticated = await exportViewResults({ entityType: "organization", filters: {} })

    // `refused` is `guardExportInput`'s pre-existing verdict on an empty filter map, reached THROUGH
    // an authenticated session. It is a different literal from `unauthenticated`.
    expect(
      authenticated,
      "an empty filter map returned something other than `refused`. If it returned " +
        "`unauthenticated` the session mock is inert and every refusal in this suite is the WRONG " +
        "refusal."
    ).toEqual({ success: false, error: "refused" })

    // AND THE OTHER HALF: clear the session and the SAME call returns a DIFFERENT literal. So the
    // mock is not merely present, it is the thing supplying identity, and the two refusals are
    // distinguishable rather than one indistinguishable "false".
    authState.userId = ""
    const anonymous = await exportViewResults({ entityType: "organization", filters: {} })

    // Restored BEFORE the assertion, so a failure here cannot leave the suite unauthenticated.
    authState.userId = actor?.id ?? ""

    expect(anonymous).toEqual({ success: false, error: "unauthenticated" })
    expect(
      await exportViewResults({ entityType: "organization", filters: {} })
    ).toEqual({ success: false, error: "refused" })
  }, 120_000)

  it("PRE-FLIGHT: audit_log is at 214 rows with ZERO entity_type='export'", async () => {
    // The floor SC-5 needs, snapshotted before any admitted export runs. Named integers, because
    // "some number of rows" would let a leak hide inside a moving baseline.
    expect(await rawCount("audit_log")).toBe(AUDIT_LOG_TOTAL_AT_START)
    expect(
      await rawCount(`audit_log where entity_type = 'export'`),
      "an export audit row already exists, so this deployment's 0 -> 1 transition cannot be " +
        "observed. Check for a leftover row from an interrupted run before relaxing this."
    ).toBe(EXPORT_AUDIT_ROWS_AT_START)
  }, 120_000)

  it("PRE-FLIGHT: every live deal has the SAME owner — the worst case's premise, measured", async () => {
    // ANTI-VACUITY for the worst-case cell. `owner=<uuid>` matching the whole table is only the
    // worst case BECAUSE there is exactly one owner; if there were fifty, the same filter would be
    // a legitimately narrow export and the cell below would be proving something else entirely.
    const distinctOwners = await rawCount(
      `(select distinct owner_id from deals where deleted_at is null) o`
    )
    const ownedBySole = await rawCount(
      `deals where deleted_at is null and owner_id = '${SOLE_DEAL_OWNER_ID}'`
    )

    expect(distinctOwners).toBe(1)
    expect(ownedBySole).toBe(DEAL_OWNER_MATCHED)
    expect(ownedBySole).toBe(LIVE_VOLUME.deal.total)
  }, 120_000)

  // ── SC-1: THE WHOLE TABLE IS REFUSED, WITH BOTH NUMBERS IN THE REFUSAL ────────────────────────

  it("SC-1: organization + search=a is REFUSED, carrying exactly 44,254 of 46,054", async () => {
    const result = await exportViewResults({
      entityType: "organization",
      filters: { search: "a" },
    })

    // ALL THREE FIELDS, EXACTLY, and by `toEqual` rather than by property — an extra key would be a
    // payload that had drifted from what `views.export.tooBroad` renders.
    expect(result).toEqual({
      success: false,
      error: "too_broad",
      matched: SEARCH_A_MATCHED,
      total: LIVE_VOLUME.organization.total,
    })

    // NO CSV WAS SERIALISED. The refusal precedes `fetchFilteredData`, so the 44,254 rows were never
    // read, never flattened and never formatted. A `data` field here would mean SEC-03 had been
    // satisfied AFTER the rows had already left the database.
    expect("data" in result).toBe(false)
    expect("filename" in result).toBe(false)
    expect("count" in result).toBe(false)

    // AND THE SCALE IS THE POINT: this is 96.09% of the customer table, more than twice the
    // allowance, refused for an ordinary authenticated member with no admin branch anywhere.
    expect(SEARCH_A_MATCHED).toBeGreaterThan(ORG_ALLOWANCE)
    expect(SEARCH_A_MATCHED).toBeGreaterThan(2 * ORG_ALLOWANCE)
  }, 300_000)

  it("SC-1: a REFUSED export writes NO audit row — the known WR-04 LIMITATION, not a win", async () => {
    const totalBefore = await rawCount("audit_log")
    const exportRowsBefore = await rawCount(`audit_log where entity_type = 'export'`)

    expect(exportRowsBefore).toBe(EXPORT_AUDIT_ROWS_AT_START)

    const result = await exportViewResults({
      entityType: "organization",
      filters: { search: "a" },
    })

    expect(result.success).toBe(false)
    expect(await rawCount("audit_log")).toBe(totalBefore)
    expect(await rawCount(`audit_log where entity_type = 'export'`)).toBe(exportRowsBefore)

    // AND WHAT THAT IS WORTH, STATED PLAINLY SO NOBODY READS IT AS A FEATURE. `export-action.ts`
    // returns `too_broad` BEFORE `recordExport`, so refused, capped and guard-refused attempts all
    // write nothing. `audit_log` is therefore evidence of exports that COMPLETED and NOT of probing:
    // an attacker sweeping filters to find the widest admissible one leaves no trace at all. That is
    // the WR-04 residual exposure, it stays OPEN in BACKLOG.md, and it is not closed by this phase.
    expect(totalBefore).toBe(AUDIT_LOG_TOTAL_AT_START)
  }, 300_000)

  it("SC-1, THE WORST CASE: deal + owner is refused at 25,195 of 25,195 — 100.00%, UNDER the cap", async () => {
    // THIS, NOT `search=a`, IS THE WORST LIVE INSTANCE OF WR-04, and the roadmap's example is merely
    // the loudest. `owner` is on `EXPORTABLE_FILTER_KEYS.deal`, every live deal carries the same
    // `owner_id` (asserted in the pre-flight cell above), and that owner is the ADMIN
    // `prbitt@gmail.com` — so before this phase a member could export every deal in the business,
    // all of them someone else's, through a whitelisted key, and the cap would never have fired
    // because 25,195 is well under 50,000.
    const result = await exportViewResults({
      entityType: "deal",
      filters: { owner: SOLE_DEAL_OWNER_ID },
    })

    expect(result).toEqual({
      success: false,
      error: "too_broad",
      matched: DEAL_OWNER_MATCHED,
      total: LIVE_VOLUME.deal.total,
    })
    expect("data" in result).toBe(false)

    // 100.00%, EXACTLY — not "nearly all". The numerator IS the denominator.
    expect(DEAL_OWNER_MATCHED).toBe(LIVE_VOLUME.deal.total)
    // UNDER THE CAP, which is the half that makes it worse than the headline: `EXPORT_ROW_CAP` was
    // the only pre-phase control on this path and it does not reach this request.
    expect(DEAL_OWNER_MATCHED).toBeLessThan(EXPORT_ROW_CAP)
    // And far above the deals allowance, so the refusal is not a near-miss.
    expect(exportAllowance(LIVE_VOLUME.deal.total)).toBe(DEAL_ALLOWANCE)
    expect(DEAL_OWNER_MATCHED).toBeGreaterThan(DEAL_ALLOWANCE)
  }, 300_000)

  it("SC-1, THE CAP'S FORMER BRANCH: activity + status=completed is `too_broad`, NOT `too_many`", async () => {
    // THE HANDOVER, ASSERTED. `status=completed` matches 74,857 of 79,022 activities — above
    // `EXPORT_ROW_CAP = 50_000`, so before this phase this exact request was refused as `too_many`
    // by the cap. It is now refused as `too_broad` by the selectivity rule, which fires first
    // because the rule is checked before the fetch and the cap inside it.
    const result = await exportViewResults({
      entityType: "activity",
      filters: { status: "completed" },
    })

    expect(result).toEqual({
      success: false,
      error: "too_broad",
      matched: ACTIVITY_COMPLETED_MATCHED,
      total: LIVE_VOLUME.activity.total,
    })
    if (result.success) throw new Error("unreachable — asserted above")

    expect(
      result.error,
      "the cap refused this request instead of the selectivity rule. The refusal is still safe, " +
        "but `too_many` carries only `max` — the user is told a limit, not that their filter " +
        "matches 74,857 of 79,022 records — and SC-3's numbered refusal is lost."
    ).not.toBe("too_many")

    // THE CAP IS ABOVE THIS COUNT, so the fact that it did not fire is the handover rather than an
    // accident of ordering.
    expect(ACTIVITY_COMPLETED_MATCHED).toBeGreaterThan(EXPORT_ROW_CAP)
    expect(ACTIVITY_COMPLETED_MATCHED).toBeGreaterThan(ACTIVITY_ALLOWANCE)

    // THE CAP STAYS, DELIBERATELY, as defence in depth if the selectivity rule is ever loosened or
    // its count fails. It RE-ENTERS at `total >= 125,003` rows — the exact integer, because
    // `floor(total × 0.40) >= 50,001` requires `total >= 125,002.5`, not the `50,000 / 0.40 =
    // 125,000` the arithmetic suggests at a glance (the same rounding trap as DEF-50-01). On 79,022
    // activities it is unreachable from this path.
    expect(exportAllowance(125_003)).toBeGreaterThan(EXPORT_ROW_CAP)
    expect(exportAllowance(125_002)).toBeLessThanOrEqual(EXPORT_ROW_CAP)
  }, 300_000)

  // ── SC-2: THE NARROW EXPORT STILL COMPLETES — A BOUND, NOT A REMOVAL ─────────────────────────

  it("SC-2: organization + search=ltda COMPLETES, and its CSV parses to exactly 13,355 data rows", async () => {
    const result = await exportViewResults({
      entityType: "organization",
      filters: { search: "ltda" },
    })

    expect(
      result.success,
      `the narrow export was refused (${result.success ? "" : result.error}). SC-2: the bound must ` +
        `BOUND the feature, not remove it. 13,355 of 46,054 is 29.00%, comfortably under the 40% ` +
        `allowance, and it is the export a real user actually runs.`
    ).toBe(true)
    if (!result.success) throw new Error("unreachable — asserted above")

    expect(result.count).toBe(LTDA_MATCHED)

    // PARSED, NOT LINE-COUNTED: notes fields contain embedded newlines inside quoted cells, so
    // `data.split("\n").length` would over-count and a cell built on it would pass for the wrong
    // reason.
    const parsed = Papa.parse<Record<string, string>>(result.data, {
      header: true,
      skipEmptyLines: true,
    })

    expect(parsed.errors).toEqual([])
    expect(
      parsed.data.length,
      "the CSV's own data-row count disagrees with the count the action reported, so the number in " +
        "the success toast is not the number of records the user received."
    ).toBe(LTDA_MATCHED)

    // THE FILENAME IS SERVER-GENERATED AND NEVER TRANSLATED — `<plural>-<YYYY-MM-DD>.csv`, built
    // from the entity type the action was given rather than from anything the caller sent. Matched
    // as a SHAPE, because asserting the date would mean reading a clock.
    expect(result.filename).toMatch(/^organizations-\d{4}-\d{2}-\d{2}\.csv$/)

    // FLOORS: strictly between the empty set and the whole table, against the named total.
    expect(result.count).toBeGreaterThan(0)
    expect(result.count).toBeLessThan(LIVE_VOLUME.organization.total)
    expect(result.count).toBeLessThan(ORG_ALLOWANCE)

    // AND IT WROTE EXACTLY ONE AUDIT ROW, which comes straight back out. The row's CONTENTS are
    // asserted by the SC-5 cell; here the point is only that an admitted export is a WRITE, and this
    // file cleans up after itself.
    const written = await takeExportAuditRows(actor?.id ?? "")

    expect(written).toHaveLength(1)
    expect(await rawCount(`audit_log where entity_type = 'export'`)).toBe(
      EXPORT_AUDIT_ROWS_AT_START
    )
  }, 300_000)

  it("SC-2, A SECOND SURFACE: activity + type=Meeting COMPLETES with 2,993 rows", async () => {
    // SC-2 must not rest on one entity type — a bound that admitted organizations and refused every
    // activity would satisfy a single-surface proof. NOT `assignee` (0 rows on activities:
    // `assignee_id` is NULL for all 79,022) and NOT `owner` (79,022 of 79,022 = 100%): an admitted
    // cell on either would pass on the empty set or the whole table respectively.
    const types = (await db.execute(
      sql.raw(`select id from activity_types where name = 'Meeting' limit 1`)
    )) as unknown as { id: string }[]
    const meetingTypeId = types[0]?.id

    expect(meetingTypeId, "no activity_type named `Meeting`").toBeTruthy()

    const result = await exportViewResults({
      entityType: "activity",
      filters: { type: meetingTypeId },
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(`refused: ${result.error}`)

    expect(result.count).toBe(MEETING_MATCHED)

    const parsed = Papa.parse<Record<string, string>>(result.data, {
      header: true,
      skipEmptyLines: true,
    })

    expect(parsed.errors).toEqual([])
    expect(parsed.data.length).toBe(MEETING_MATCHED)
    expect(result.filename).toMatch(/^activities-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(result.count).toBeGreaterThan(0)
    expect(result.count).toBeLessThan(LIVE_VOLUME.activity.total)

    const written = await takeExportAuditRows(actor?.id ?? "")

    expect(written).toHaveLength(1)
    expect((written[0].changes as ExportChanges).rowCount.to).toBe(MEETING_MATCHED)
  }, 300_000)

  it("SC-2, THE EMPTY CASE: organization + search=zzzz COMPLETES with 0 rows", async () => {
    // A bound that REFUSED an empty result would be refusing on the wrong axis entirely — the rule
    // is about breadth, and 0 of 46,054 is as narrow as a filter gets. This is also the cell that
    // catches a rule inverted into `matched < allowance`.
    const result = await exportViewResults({
      entityType: "organization",
      filters: { search: "zzzz" },
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(`refused: ${result.error}`)

    expect(result.count).toBe(0)
    expect(result.data).toBe("")

    // Even a zero-row export is a completed export, so it too writes an audit row — with
    // `rowCount: 0`. Recorded, and removed.
    const written = await takeExportAuditRows(actor?.id ?? "")

    expect(written).toHaveLength(1)
    expect((written[0].changes as ExportChanges).rowCount.to).toBe(0)
    expect((written[0].changes as ExportChanges).filters.to).toBe("search=zzzz")
  }, 300_000)
})

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * SC-4: THE THRESHOLD IS APPROACHED AND CROSSED, ON PURPOSE, IN BOTH DIRECTIONS.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * SC-4 is the criterion most likely to be faked, and it says so itself: *"widen a filter step by
 * step until it trips, and observe the refusal at the boundary. A guard whose threshold nobody has
 * crossed on purpose is not a guard."* A single at-the-boundary assertion is EXPLICITLY not the
 * criterion, so this suite walks nine steps.
 *
 * THE KNOB IS `dateTo` ON ACTIVITIES, and it was chosen because it is free, total and strictly
 * nested. All 79,022 activities carry a NON-NULL `due_date` (measured: zero nulls) spanning
 * 2022-01-13 → 2030-05-07; `dateTo` is on `EXPORTABLE_FILTER_KEYS.activity`; and
 * `activityExportConditions` applies `lt(dueDate, endOfDayExclusive(dateTo))`, which
 * `date-range.ts` implements as `due_date < (dateTo + 1 day)` in UTC. So every widening of `dateTo`
 * is a strict SUPERSET of the previous one and no row escapes the knob — the walk is a widening in
 * the set-theoretic sense, not merely a sequence of increasing numbers.
 *
 * THE FREE FINDING BEHIND THE LADDER'S SHAPE. 2023-06-09, 2023-06-10 AND 2023-06-11 ALL RETURN
 * EXACTLY 31,530 — three consecutive daily widenings that add ZERO rows. A "step" that changes no
 * count is not a step: a ladder containing one would pass identically against a rule that ignored
 * `dateTo` between those dates, which is the unfalsifiable shape this milestone keeps finding. The
 * ladder below therefore takes exactly ONE date out of that flat run, and takes the LAST one —
 * 2023-06-11, the true date boundary — so that the bracket is two ADJACENT DAYS and every step
 * strictly adds rows.
 *
 * NOTE, AGAINST `50-MEASUREMENTS.md` §7's "strictly-increasing ladder" TABLE: that table is EIGHT
 * steps and ends `2023-06-09` (31,530) → `2023-06-12` (31,612). `50-06-PLAN.md`'s interfaces table
 * is NINE steps and uses `2023-06-11` (31,530) in that slot, plus a ninth step at `2023-06-13`
 * (31,679). Both are strictly increasing and both bracket the same 31,530 → 31,612 crossing; the
 * plan's is used here because 06-11 is the LAST admitted date, which makes the bracket two adjacent
 * calendar days rather than a three-day skip. MEASUREMENTS' instruction "do not insert 2023-06-10 or
 * 2023-06-11 BETWEEN the last two" is honoured — nothing is inserted between them; 06-11 REPLACES
 * 06-09 and the flat run still contributes exactly one step.
 *
 * WHAT IS DRIVEN END TO END, AND WHAT IS NOT — stated rather than left to be assumed:
 *
 *   - the NINE-STEP WALK below is `countExportMatches` + `decideSelectivity`. It is the count and
 *     the arithmetic, not the action. Nine CSVs of up to 31,679 activities each would cost minutes
 *     and prove nothing the two bracket cells do not.
 *   - the TWO BRACKET STEPS are driven END TO END through `exportViewResults`, in both directions:
 *     06-11 must come back `success: true` with 31,530 rows of real CSV, and 06-12 must come back
 *     `too_broad` with 31,612 / 79,022. That is the crossing, observed through the action a user
 *     reaches.
 */

/**
 * THE NINE STEPS, with the `matched` each returns as a named integer. Re-measured by direct SQL at
 * the start of 50-06 Task 2 against the live database, independently of `countExportMatches`:
 *
 *   select count(*) from activities
 *    where deleted_at is null and due_date < (d + interval '1 day')
 */
const ACTIVITY_DATE_LADDER: readonly { dateTo: string; matched: number }[] = [
  { dateTo: "2023-01-18", matched: 22_111 },
  { dateTo: "2023-02-09", matched: 23_683 },
  { dateTo: "2023-03-10", matched: 26_200 },
  { dateTo: "2023-04-15", matched: 28_942 },
  { dateTo: "2023-05-15", matched: 30_117 },
  { dateTo: "2023-06-08", matched: 31_479 },
  { dateTo: "2023-06-11", matched: 31_530 },
  { dateTo: "2023-06-12", matched: 31_612 },
  { dateTo: "2023-06-13", matched: 31_679 },
]

/**
 * THE DELTAS, as named integers rather than as `> 0`.
 *
 * `every(d => d > 0)` alone would be satisfied by a ladder whose steps had drifted to entirely
 * different counts, so the increments themselves are pinned. The last three are the ones that
 * matter: +51, +82, +67 — the walk is at daily resolution by the time it reaches the boundary.
 */
const ACTIVITY_LADDER_DELTAS = [1_572, 2_517, 2_742, 1_175, 1_362, 51, 82, 67]

/**
 * THE INDEX OF THE FIRST REFUSAL, 0-based, and the single most important integer in this suite.
 *
 * Seven admissions (indices 0..6) then two refusals (7, 8). WITHOUT THIS ASSERTION any sequence
 * containing both outcomes anywhere would pass, which is precisely the "a guard whose threshold
 * nobody crossed" failure SC-4 names. Ablation 6 in `50-06-SUMMARY.md` moves the flip by one step
 * and reddens this and nothing else.
 */
const LADDER_FLIP_INDEX = 7
const LADDER_ADMITTED_STEPS = 7
const LADDER_REFUSED_STEPS = 2

/** The bracket: the last ADMITTED count and the first REFUSED one, two adjacent calendar days. */
const BRACKET_LAST_ADMITTED = { dateTo: "2023-06-11", matched: 31_530 }
const BRACKET_FIRST_REFUSED = { dateTo: "2023-06-12", matched: 31_612 }
/** 31,608 − 31,530. The admit side clears the allowance by 78 rows. */
const BRACKET_ADMIT_MARGIN = 78
/** 31,612 − 31,608. The refuse side exceeds it by 4. A 0.10 pp window, crossed. */
const BRACKET_REFUSE_MARGIN = 4

describe("SC-4: the allowance is approached over nine widening steps and crossed exactly once", () => {
  let actor: Actor | undefined

  beforeAll(async () => {
    actor = await resolveMemberActor()
    authState.userId = actor?.id ?? ""
  }, 120_000)

  afterAll(async () => {
    // The 06-11 bracket cell is an ADMITTED export, so it writes one audit row. Safety net, by id.
    if (auditRowIdsCreated.length > 0) {
      await db.delete(auditLog).where(inArray(auditLog.id, auditRowIdsCreated))
    }

    expect(await rawCount(`audit_log where entity_type = 'export'`)).toBe(
      EXPORT_AUDIT_ROWS_AT_START
    )
    expect(await rawCount("audit_log")).toBe(AUDIT_LOG_TOTAL_AT_START)
  }, 120_000)

  it("PRE-FLIGHT: the actor is still an asserted `member`, and no due_date is null", async () => {
    // The ladder is only TOTAL — every row reachable by the knob — because there are no nulls. A
    // single null `due_date` would sit outside every step and make "widening" a claim about a
    // subset rather than about the table.
    expect(actor?.role, "SC-4's bracket cells run end to end; they must run as a member").toBe(
      "member"
    )

    const nullDueDates = await rawCount(
      `activities where deleted_at is null and due_date is null`
    )

    expect(
      nullDueDates,
      "some activities have a NULL due_date, so `dateTo` no longer partitions the whole table and " +
        "the ladder's steps are not nested supersets of one another."
    ).toBe(0)
  }, 120_000)

  it("THE WALK: nine steps, strictly increasing, a constant denominator, and ONE flip at index 7", async () => {
    const observed: { dateTo: string; matched: number; total: number; admitted: boolean }[] = []

    for (const step of ACTIVITY_DATE_LADDER) {
      const counts = await countExportMatches("activity", { dateTo: step.dateTo })

      observed.push({
        dateTo: step.dateTo,
        matched: counts.matched,
        total: counts.total,
        admitted: decideSelectivity(counts).ok,
      })
    }

    // ONE `toEqual` OVER THE WHOLE SEQUENCE, so a failure prints the entire ladder rather than
    // stopping at the first bad step — which is what makes this a walk in the transcript too.
    expect(observed.map(({ dateTo, matched }) => ({ dateTo, matched }))).toEqual(
      ACTIVITY_DATE_LADDER.map(({ dateTo, matched }) => ({ dateTo, matched }))
    )

    // STRICTLY INCREASING, and by the measured increments. A widening that did not widen is not a
    // step; this is the assertion that says so.
    const deltas = observed.slice(1).map((step, i) => step.matched - observed[i].matched)

    expect(
      deltas.every((delta) => delta > 0),
      `the ladder is not strictly increasing. Deltas: ${JSON.stringify(deltas)}. A step that adds ` +
        `zero rows would pass identically against a rule that ignored \`dateTo\` between those two ` +
        `dates — 2023-06-09/-06-10/-06-11 are exactly such a run and only ONE of them is used here.`
    ).toBe(true)
    expect(deltas).toEqual(ACTIVITY_LADDER_DELTAS)

    // THE DENOMINATOR DOES NOT MOVE WHILE THE NUMERATOR DOES. That is what makes the FRACTION the
    // thing being crossed: if `total` drifted, a flip could come from the allowance moving rather
    // than from the filter widening.
    const totals = [...new Set(observed.map((step) => step.total))]

    expect(totals).toEqual([LIVE_VOLUME.activity.total])

    // EXACTLY ONE FLIP, AND ITS INDEX.
    const verdicts = observed.map((step) => step.admitted)
    const flips = verdicts.filter((verdict, i) => i > 0 && verdict !== verdicts[i - 1]).length

    expect(
      flips,
      `the decision flipped ${flips} times across the ladder: ${JSON.stringify(verdicts)}. More ` +
        `than one flip would mean the rule is not monotone in \`matched\`; zero would mean the ` +
        `threshold was never crossed and the "walk" observed nothing.`
    ).toBe(1)

    // `indexOf(false)` is -1 when nothing was ever refused, which reddens here rather than
    // silently reporting a flip that did not happen.
    expect(
      verdicts.indexOf(false),
      `the first refusal is at index ${verdicts.indexOf(false)}, not ${LADDER_FLIP_INDEX}. ` +
        `WITHOUT THIS ASSERTION any sequence containing both outcomes anywhere would pass.`
    ).toBe(LADDER_FLIP_INDEX)
    expect(verdicts.filter(Boolean)).toHaveLength(LADDER_ADMITTED_STEPS)
    expect(verdicts.filter((verdict) => !verdict)).toHaveLength(LADDER_REFUSED_STEPS)

    // AND THE FLIP IS BETWEEN THE TWO DATES THE MEASUREMENT NAMES, on adjacent calendar days.
    expect(observed[LADDER_FLIP_INDEX - 1].dateTo).toBe(BRACKET_LAST_ADMITTED.dateTo)
    expect(observed[LADDER_FLIP_INDEX].dateTo).toBe(BRACKET_FIRST_REFUSED.dateTo)

    // THE MARGINS, so the boundary is a measured window rather than a coincidence.
    expect(observed[LADDER_FLIP_INDEX - 1].matched).toBe(BRACKET_LAST_ADMITTED.matched)
    expect(observed[LADDER_FLIP_INDEX].matched).toBe(BRACKET_FIRST_REFUSED.matched)
    expect(ACTIVITY_ALLOWANCE - BRACKET_LAST_ADMITTED.matched).toBe(BRACKET_ADMIT_MARGIN)
    expect(BRACKET_FIRST_REFUSED.matched - ACTIVITY_ALLOWANCE).toBe(BRACKET_REFUSE_MARGIN)
    // The allowance really does sit strictly inside the bracket, against the LIVE total.
    expect(exportAllowance(LIVE_VOLUME.activity.total)).toBe(ACTIVITY_ALLOWANCE)
    expect(ACTIVITY_ALLOWANCE).toBeGreaterThanOrEqual(BRACKET_LAST_ADMITTED.matched)
    expect(ACTIVITY_ALLOWANCE).toBeLessThan(BRACKET_FIRST_REFUSED.matched)
  }, 300_000)

  it("THE CROSSING, ADMIT SIDE, END TO END: dateTo=2023-06-11 COMPLETES with 31,530 rows", async () => {
    // The generous timeout is a LIVENESS BACKSTOP against a hang, never a margin: 31,530 activities
    // are flattened with their custom fields and serialised by papaparse. No elapsed time is read
    // and none is asserted.
    const result = await exportViewResults({
      entityType: "activity",
      filters: { dateTo: BRACKET_LAST_ADMITTED.dateTo },
    })

    expect(
      result.success,
      `the last ADMITTED step of the ladder was refused (${result.success ? "" : result.error}). ` +
        `31,530 of 79,022 is 39.90%, ${BRACKET_ADMIT_MARGIN} rows UNDER the 31,608 allowance.`
    ).toBe(true)
    if (!result.success) throw new Error("unreachable — asserted above")

    expect(result.count).toBe(BRACKET_LAST_ADMITTED.matched)

    // PARSED, not line-counted: activity notes carry embedded newlines inside quoted cells.
    const parsed = Papa.parse<Record<string, string>>(result.data, {
      header: true,
      skipEmptyLines: true,
    })

    expect(parsed.errors).toEqual([])
    expect(parsed.data.length).toBe(BRACKET_LAST_ADMITTED.matched)
    expect(result.filename).toMatch(/^activities-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(result.count).toBeLessThanOrEqual(ACTIVITY_ALLOWANCE)
    expect(result.count).toBeLessThan(LIVE_VOLUME.activity.total)

    // An admitted export is a WRITE. Straight back out, by the ids read back.
    const written = await takeExportAuditRows(actor?.id ?? "")

    expect(written).toHaveLength(1)
    expect((written[0].changes as ExportChanges).rowCount.to).toBe(BRACKET_LAST_ADMITTED.matched)
    expect((written[0].changes as ExportChanges).filters.to).toBe(
      `dateTo=${BRACKET_LAST_ADMITTED.dateTo}`
    )
  }, 900_000)

  it("THE CROSSING, REFUSE SIDE, END TO END: dateTo=2023-06-12 is `too_broad` at 31,612 / 79,022", async () => {
    // ONE DAY LATER than the cell above. 82 more rows, and the decision is different — which is the
    // whole of SC-4 in a single pair of calls.
    const totalBefore = await rawCount("audit_log")

    const result = await exportViewResults({
      entityType: "activity",
      filters: { dateTo: BRACKET_FIRST_REFUSED.dateTo },
    })

    expect(result).toEqual({
      success: false,
      error: "too_broad",
      matched: BRACKET_FIRST_REFUSED.matched,
      total: LIVE_VOLUME.activity.total,
    })
    expect("data" in result).toBe(false)

    // Refused BY THE SELECTIVITY RULE and not by the cap: 31,612 is well under `EXPORT_ROW_CAP`, so
    // this refusal cannot be the cap firing under another name.
    expect(BRACKET_FIRST_REFUSED.matched).toBeLessThan(EXPORT_ROW_CAP)
    expect(BRACKET_FIRST_REFUSED.matched).toBeGreaterThan(ACTIVITY_ALLOWANCE)

    // AND IT WROTE NOTHING — the refusal returns before `recordExport`.
    expect(await rawCount("audit_log")).toBe(totalBefore)
    expect(await rawCount(`audit_log where entity_type = 'export'`)).toBe(
      EXPORT_AUDIT_ROWS_AT_START
    )
  }, 300_000)
})

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * SC-5: THE FIRST EXPORT AUDIT ROW THIS DEPLOYMENT HAS EVER HELD.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `audit_log` holds 214 rows and ZERO with `entity_type='export'`. No view export has ever been
 * recorded here — verified independently six times across phase 50, and plans 50-01 through 50-05
 * were each told to leave the table alone so that the 0 → 1 transition would be OBSERVED HERE.
 *
 * WHY AN "UNCHANGED COUNT" ASSERTION WOULD HAVE BEEN WORTHLESS. With zero export rows in the table,
 * `expect(exportRows).toBe(0)` after an export passes if `recordExport` works, passes if
 * `recordExport` is deleted, and passes if `recordExport` throws. It is the exact shape of check
 * that cannot fail. So this cell makes a POSITIVE observation: 214 → 215 and 0 → 1, with the row's
 * contents read back and asserted, and `rowCount` cross-checked against the CSV's OWN count from
 * the same call.
 *
 * AND WHY NOTHING ELSE IN THE REPOSITORY CAN SEE THIS. `recordExport` SWALLOWS ITS OWN FAILURE by
 * decision (`export-events.ts:106-115` — failing a completed export because its audit row failed
 * would report a lie about the user's own data). So a `recordExport` that RUNS AND SILENTLY FAILS
 * is invisible to every structural gate, to `tsc`, and to the action's own return value. The only
 * instrument that can detect it is one that READS THE ROW BACK, which is this cell and nothing
 * else. Ablation 5 in `50-06-SUMMARY.md` records exactly what the structural gate can and cannot
 * see.
 *
 * THE DELETE IS BY ID, NEVER BY `entity_type`. A delete matched on `entity_type='export'` would
 * also remove a row a real export wrote while the suite ran — destroying evidence AND masking a
 * leak, because the suite would then report a clean table it had itself emptied.
 */
describe("SC-5: audit_log goes 0 -> 1 for entity_type='export', then back", () => {
  let actor: Actor | undefined

  beforeAll(async () => {
    actor = await resolveMemberActor()
    authState.userId = actor?.id ?? ""
  }, 120_000)

  afterAll(async () => {
    if (auditRowIdsCreated.length > 0) {
      await db.delete(auditLog).where(inArray(auditLog.id, auditRowIdsCreated))
    }

    expect(
      await rawCount(`audit_log where entity_type = 'export'`),
      "SC-5 left an export audit row behind. `audit_log` is append-only with the retention pruner " +
        "as its only other deleter, so a leftover row corrupts the one record this control produces."
    ).toBe(EXPORT_AUDIT_ROWS_AT_START)
    expect(await rawCount("audit_log")).toBe(AUDIT_LOG_TOTAL_AT_START)
  }, 120_000)

  it("THE POSITIVE OBSERVATION: 214 -> 215 total, 0 -> 1 export, contents asserted, deleted by id", async () => {
    expect(actor?.role, "the audit row's actor must be the asserted member").toBe("member")

    const actorId = actor?.id ?? ""

    // ── THE FLOOR, FIRST, AS NAMED INTEGERS ─────────────────────────────────────────────────────
    const totalBefore = await rawCount("audit_log")
    const exportRowsBefore = await rawCount(`audit_log where entity_type = 'export'`)

    expect(
      exportRowsBefore,
      "an export audit row already exists, so this deployment's 0 -> 1 transition cannot be " +
        "observed at all. THIS IS A POSITIVE OBSERVATION ON PURPOSE: an `unchanged count` " +
        "assertion would pass today against a DELETED `recordExport` call and prove nothing."
    ).toBe(EXPORT_AUDIT_ROWS_AT_START)
    expect(totalBefore).toBe(AUDIT_LOG_TOTAL_AT_START)

    // ── THE ADMITTED EXPORT ─────────────────────────────────────────────────────────────────────
    const result = await exportViewResults({
      entityType: "organization",
      filters: { search: "ltda" },
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(`refused: ${result.error}`)

    expect(result.count).toBe(LTDA_MATCHED)

    // ── 0 -> 1 AND 214 -> 215, BEFORE ANYTHING IS DELETED ───────────────────────────────────────
    const totalAfter = await rawCount("audit_log")
    const exportRowsAfter = await rawCount(`audit_log where entity_type = 'export'`)

    expect(
      exportRowsAfter,
      "the admitted export produced no `entity_type='export'` audit row. `recordExport` swallows " +
        "its own errors, so the action still returned `success: true` — this read is the ONLY " +
        "instrument in the repository that can see the difference."
    ).toBe(EXPORT_AUDIT_ROWS_AT_START + 1)
    expect(totalAfter).toBe(AUDIT_LOG_TOTAL_AT_START + 1)
    expect(totalAfter - totalBefore).toBe(1)
    expect(exportRowsAfter - exportRowsBefore).toBe(1)

    // ── THE ROW'S CONTENTS ──────────────────────────────────────────────────────────────────────
    // Read back and removed in one step, scoped to `entity_type='export' AND actor_user_id =
    // <this file's member>`, with the DELETE matching the ids that read produced.
    const rows = await takeExportAuditRows(actorId)

    expect(rows).toHaveLength(1)

    const row = rows[0]

    expect(row.entityType).toBe("export")
    expect(row.action).toBe("created")
    expect(row.actorKind).toBe("user")
    expect(
      row.actorUserId,
      "the export was attributed to someone other than the member who ran it. `actor_user_id` is " +
        "a real foreign key and `recordExport` is passed `session.user.id` explicitly rather than " +
        "reading `getCurrentActor()`, which would attribute every export to `system`."
    ).toBe(actorId)
    expect(row.entityId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
    expect(row.workflowRunId).toBeNull()
    expect(row.importSessionId).toBeNull()

    const changes = row.changes as ExportChanges

    expect(changes.exportedEntityType).toEqual({ from: null, to: "organization" })
    expect(changes.filters).toEqual({ from: null, to: "search=ltda" })

    // THE CROSS-CHECK THAT MAKES THE ROW EVIDENCE RATHER THAN DECORATION: the number recorded in
    // the audit row is the number of rows the user actually received, from the SAME call — not a
    // constant this file supplied to both sides.
    const parsed = Papa.parse<Record<string, string>>(result.data, {
      header: true,
      skipEmptyLines: true,
    })

    expect(parsed.errors).toEqual([])
    expect(changes.rowCount.from).toBeNull()
    expect(
      changes.rowCount.to,
      "the audit row's `rowCount` disagrees with the CSV the export produced, so the record of " +
        "what left the product is not a record of what left the product."
    ).toBe(result.count)
    expect(changes.rowCount.to).toBe(parsed.data.length)
    expect(changes.rowCount.to).toBe(LTDA_MATCHED)

    // ── AND BACK TO 214 / 0, BY ID ──────────────────────────────────────────────────────────────
    expect(
      await rawCount(`audit_log where entity_type = 'export'`),
      "the probe row was not removed. It was deleted by the id read back, never by `entity_type` " +
        "— a delete on `entity_type` would also destroy a real export's evidence."
    ).toBe(EXPORT_AUDIT_ROWS_AT_START)
    expect(await rawCount("audit_log")).toBe(AUDIT_LOG_TOTAL_AT_START)

    // The absence of THAT id specifically, not merely of the class.
    const byId = await db.select().from(auditLog).where(eq(auditLog.id, row.id))

    expect(byId).toHaveLength(0)
  }, 600_000)

  it("THE NEGATIVE HALF: a REFUSED export writes NO row — the WR-04 limitation, restated", async () => {
    // Recorded as a LIMITATION and not as a property to celebrate. `export-action.ts` returns
    // `too_broad` BEFORE `recordExport`, so refused, capped and guard-refused attempts write
    // nothing at all: an attacker sweeping filters to find the widest admissible one leaves no
    // trace. `audit_log` is evidence of exports that COMPLETED, never of probing. Open in
    // BACKLOG.md under WR-04 and NOT closed by this phase.
    const totalBefore = await rawCount("audit_log")

    const result = await exportViewResults({
      entityType: "organization",
      filters: { search: "a" },
    })

    expect(result.success).toBe(false)
    expect(await rawCount("audit_log")).toBe(totalBefore)
    expect(await rawCount(`audit_log where entity_type = 'export'`)).toBe(
      EXPORT_AUDIT_ROWS_AT_START
    )
    expect(totalBefore).toBe(AUDIT_LOG_TOTAL_AT_START)
  }, 300_000)
})

// THE POOL, CLOSED ONCE FOR THE WHOLE FILE. `db.$client.end` cannot live in a per-suite `afterAll`
// any more: there is more than one suite here now, and the first one to finish would close the pool
// under the next one's feet.
afterAll(async () => {
  await db.$client.end({ timeout: 5 })
}, 30_000)
