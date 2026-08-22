/**
 * LIVE-DATABASE PROBE for the export audit row (Phase 40 review WR-04).
 *
 * WHY THIS FILE EXISTS AT ALL. `recordExport` swallows every error it meets — deliberately, so a
 * logging fault cannot fail an export the user already asked for. That is the right trade for the
 * user and the wrong one for confidence: a row shape the database rejects would be indistinguishable
 * from a working control, forever, because the only symptom is a `console.error` nobody reads. The
 * mocked suite in `__tests__/export-events.test.ts` proves the VALUES; only a real insert proves
 * postgres accepts them.
 *
 * This is the same lesson `formatters-live.test.ts` was written for after Phase 37 shipped a
 * malformed drizzle fragment that a wholly-mocked suite passed cleanly — and the same lesson gap
 * G-1 taught again when that file sat red for a whole phase. So: same env gate, same dynamic
 * imports, same "run it with" line.
 *
 * RUN IT WITH:
 *   DATABASE_URL="postgresql://pipelite:pipelite@localhost:5433/pipelite" \
 *     ./node_modules/.bin/vitest run src/lib/audit/export-events-live.test.ts
 *
 * Note the port: `.env.local` says 5432 but the Docker mapping is host 5433 -> container 5432.
 *
 * UNLIKE `formatters-live.test.ts`, THIS FILE WRITES. It inserts audit rows and deletes exactly the
 * ones it inserted, matched on the uuid it reads back from its own probe — never on `entity_type`,
 * which would delete real export evidence if a person exported something while the suite ran. The
 * final assertion is that the table is back to the count it started at. `audit_log` is append-only
 * with the retention pruner as its only other deleter, so a test that left rows behind would be
 * corrupting the one record this control produces.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const HAS_DB = Boolean(process.env.DATABASE_URL)

describe.skipIf(!HAS_DB)("recordExport against the live database", () => {
  // Dynamically imported inside `beforeAll`: `src/db/index.ts` throws at MODULE LOAD when
  // DATABASE_URL is unset, and a skipped suite never runs `beforeAll`.
  let db: typeof import("@/db").db
  let auditLog: typeof import("@/db/schema").auditLog
  let recordExport: typeof import("./export-events").recordExport
  let sqlOps: typeof import("drizzle-orm")

  /** Every row id this file created, deleted in `afterAll`. */
  const created: string[] = []
  let startingCount = 0
  /** A real user id — `actor_user_id` is a genuine foreign key, so a fabricated one is rejected. */
  let actorUserId = ""

  beforeAll(async () => {
    ;({ db } = await import("@/db"))
    ;({ auditLog } = await import("@/db/schema"))
    ;({ recordExport } = await import("./export-events"))
    sqlOps = await import("drizzle-orm")

    const { users } = await import("@/db/schema")
    const someone = await db.select({ id: users.id }).from(users).limit(1)
    actorUserId = someone[0]?.id ?? ""

    const before = await db
      .select({ n: sqlOps.sql<number>`count(*)::int` })
      .from(auditLog)
      .where(sqlOps.eq(auditLog.entityType, "export"))
    startingCount = before[0]?.n ?? 0
  })

  afterAll(async () => {
    if (!HAS_DB || created.length === 0) return
    // Matched on the ids THIS FILE created, never on entity_type.
    await db.delete(auditLog).where(sqlOps.inArray(auditLog.id, created))

    const after = await db
      .select({ n: sqlOps.sql<number>`count(*)::int` })
      .from(auditLog)
      .where(sqlOps.eq(auditLog.entityType, "export"))
    expect(after[0]?.n).toBe(startingCount)
  })

  it("has a real user to attribute to", () => {
    // Anti-vacuity: with no user the insert below would fail on the foreign key and the test
    // would be proving nothing about the row shape.
    expect(actorUserId).not.toBe("")
  })

  it("postgres accepts the row, entity_type 'export' included", async () => {
    await recordExport({
      actorUserId,
      entityType: "organization",
      filters: { search: "a" },
      rowCount: 44254,
    })

    const rows = await db
      .select()
      .from(auditLog)
      .where(sqlOps.eq(auditLog.entityType, "export"))
      .orderBy(sqlOps.desc(auditLog.createdAt))
      .limit(1)

    expect(rows).toHaveLength(1)
    const row = rows[0]
    created.push(row.id)

    // The row survived the round trip with every field intact. `recordExport` swallows failures,
    // so without this read a rejected insert would look exactly like a successful one.
    expect(row.entityType).toBe("export")
    expect(row.action).toBe("created")
    expect(row.actorKind).toBe("user")
    expect(row.actorUserId).toBe(actorUserId)
    expect(row.changes).toEqual({
      exportedEntityType: { from: null, to: "organization" },
      rowCount: { from: null, to: 44254 },
      filters: { from: null, to: "search=a" },
    })
    expect(row.createdAt).toBeInstanceOf(Date)
  })

  it("is reachable by the query /api/v1/audit runs for it", async () => {
    await recordExport({
      actorUserId,
      entityType: "deal",
      filters: { pipeline: "p1", owner: "u2" },
      rowCount: 7,
    })

    // The endpoint filters on entity_type alone; this is that predicate, against real data.
    const rows = await db
      .select()
      .from(auditLog)
      .where(sqlOps.eq(auditLog.entityType, "export"))
      .orderBy(sqlOps.desc(auditLog.createdAt))
      .limit(1)

    expect(rows).toHaveLength(1)
    created.push(rows[0].id)
    expect((rows[0].changes as Record<string, { to: unknown }>).filters.to).toBe(
      "owner=u2&pipeline=p1"
    )
  })

  it("does not surface in a record timeline", async () => {
    // The structural claim in the schema comment, CHECKED rather than asserted in prose:
    // `assertEntityType` admits the four CRM literals only, so an export row can never be
    // selected by a timeline. The composer is pure, so this needs no query — and it is the same
    // function every timeline read goes through.
    const { buildTimelineQuery } = await import("@/lib/timeline/assemble")

    // A real CRM type composes a statement, which is the anti-vacuity half.
    expect(buildTimelineQuery("organization", "some-id", null, 10, true)).toBeDefined()

    expect(() =>
      // @ts-expect-error — "export" is deliberately not a timeline entity type. That is the point:
      // the call is unrepresentable in the type system AND refused at runtime.
      buildTimelineQuery("export", created[0] ?? "x", null, 10, true)
    ).toThrow(/Unsupported timeline entity type/)
  })
})
