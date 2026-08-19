/**
 * =============================================================================
 * dedup.db.test.ts — the merge, against a REAL PostgreSQL (39-VALIDATION V-1)
 * =============================================================================
 *
 * WHY THIS FILE EXISTS
 *   Every other mutation test in this repository mocks `@/db` wholesale
 *   (`src/lib/mutations/organizations.test.ts:9-21` is the pattern), and a mocked
 *   write CANNOT RAISE A CONSTRAINT. `notes_migration_uniq` is a partial unique
 *   index on (entity_type, entity_id) WHERE source = 'migration', declared in
 *   src/db/schema/notes.ts as "a permanent database invariant, not a one-shot
 *   script guard" — it may not be dropped or relaxed. 29,037 of this
 *   deployment's 46,054 organizations (63%) carry such a note, so both members
 *   of a duplicate pair usually have one and a naive
 *   `UPDATE notes SET entity_id = <survivor>` raises SQLSTATE 23505 on roughly
 *   40% of real organization merges.
 *
 *   `src/lib/mutations/dedup.test.ts` (plan 39-09, 25 tests) asserts the SHAPE of
 *   the merge — statement order, transaction boundary, emit placement — and says
 *   in its own header that it cannot prove this. A mocked merge test would pass
 *   while the feature failed on nearly half of real records. THE CONSTRAINT HAS
 *   TO BE EXERCISED, NOT ASSERTED. Same argument, verbatim, as the header of
 *   `scripts/trash-checks.sql`: a mocked `db.delete` cannot raise SQLSTATE 23503.
 *
 *   `scripts/dedup-checks.sql` Part 10 is the SECOND, tool-independent proof of
 *   the same fact — it needs no Node, no vitest project and no environment
 *   variable. Neither replaces the other.
 *
 * HOW TO RUN IT
 *   docker compose up -d        # host 5433 -> container 5432
 *   npm run test:db
 *
 * IT IS NOT PART OF `npm test` AND NOT PART OF CI, ON PURPOSE
 *   CI (.github/workflows/ci.yml) runs typecheck, lint and `npm test` on GitHub
 *   hardware with no Docker and no database, and `ci` is the required check on
 *   the master ruleset. GitHub treats a required check that never passes as
 *   permanently pending, which makes every pull request unmergeable. This file
 *   therefore lives in a THIRD vitest project (`vitest.db.config.ts`, invoked
 *   only by `npm run test:db`), the base project excludes the `*.db.test.*`
 *   glob, and `src/lib/mutations/__tests__/db-test-isolation.test.ts` — which
 *   runs IN CI — asserts all three of those controls.
 *
 * IT MUST LEAVE THE DATABASE EXACTLY AS IT FOUND IT
 *   The target holds 46,054 organizations, 38,348 people, 25,195 deals and
 *   75,236 notes of REAL data, and the application container is normally running
 *   against it while this file executes. So, inherited from 45-08 (V-4):
 *
 *     * every record this file touches, it CREATED. Nothing here updates or
 *       deletes a row it did not insert. The one exception is READ-ONLY: the
 *       owner user, a stage and an activity type are SELECTed from the live
 *       tables to satisfy NOT NULL foreign keys, and never written to.
 *     * every fixture id and every fixture name carries the `dedupdbt-` prefix,
 *       so the leftover check is a single query per table.
 *     * `afterEach` hard-deletes them in foreign-key order.
 *     * `afterAll` asserts ZERO prefixed rows remain in all six tables AND that
 *       the total `count(*)` of each is what it was before the run — a prefix
 *       query cannot see a row the suite accidentally MUTATED rather than
 *       created, and the parity check can.
 *     * there is no TRUNCATE, no DROP TABLE and no unfiltered DELETE anywhere in
 *       this file. Every delete carries an explicit `like(column, 'dedupdbt-%')`.
 *
 *   NO CREDENTIAL IS WRITTEN INTO THIS FILE. The connection string comes from
 *   `E2E_DATABASE_URL`, forwarded to `DATABASE_URL` by `vitest.db.config.ts`
 *   because `@/db` reads that name and the value in `.env` resolves
 *   `postgres:5432` inside the Docker network, which is unreachable from here.
 *   The loopback allow-list below is the reason this file cannot be pointed at
 *   anything but a local development database (the guard in `e2e/seed-admin.ts`,
 *   same posture, same reasoning).
 * =============================================================================
 */
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { db } from "@/db"
import {
  activities,
  auditLog,
  deals,
  duplicatePairs,
  notes,
  organizations,
  people,
} from "@/db/schema"
import { runWithActor } from "@/lib/audit/actor-context"
import { MERGE_EXCLUDED_COLUMNS } from "@/lib/dedup/field-groups"
import type { AuditAction } from "@/db/schema"
import type { MergeableEntityType } from "@/lib/dedup/types"
import { registerAuditSubscriber } from "@/lib/events/subscribers/audit"
import { mergeRecordsMutation } from "@/lib/mutations/dedup"
import type { MergeRecordsInput, MergeRecordsResult } from "@/lib/mutations/dedup"

/* ---------------------------------------------------------------------------
 * The environment guard
 * ------------------------------------------------------------------------ */

/**
 * Refuse any connection string whose host is not loopback.
 *
 * NOT DEFENSIVE BOILERPLATE. This file inserts, updates and hard-deletes rows.
 * Pointed at a shared or production database it would write fixtures into it and
 * then delete rows out of it, and the `afterEach` teardown is a hard DELETE. A
 * loopback host is the one place where the operator provably owns the target.
 * Copied in posture from `e2e/seed-admin.ts`, which guards a privileged user
 * INSERT the same way and for the same reason.
 *
 * The host is named in the message deliberately: a refusal that does not say
 * what it refused sends the reader to the wrong file.
 */
export function assertLoopbackConnection(connectionString: string | undefined): string {
  if (!connectionString) {
    throw new Error(
      "E2E_DATABASE_URL is not set. It must point at the HOST-mapped dev Postgres " +
        "(localhost:5433); the app-facing DATABASE_URL resolves postgres:5432 inside the " +
        "Docker network and is unreachable from a test process. Run `docker compose up -d` " +
        "and see vitest.db.config.ts."
    )
  }

  const hostname = new URL(connectionString).hostname
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `E2E_DATABASE_URL host "${hostname}" is not a local development database. ` +
        "src/lib/mutations/dedup.db.test.ts creates and hard-deletes fixture rows and " +
        "refuses to run anywhere but localhost / 127.0.0.1."
    )
  }

  return connectionString
}

/**
 * Evaluated at MODULE SCOPE, so a bad host aborts collection and the suite does
 * not run at all — no test body executes and no statement is ever sent.
 *
 * `postgres.js` connects lazily, so the client `@/db` constructs when this module
 * is imported has not yet opened a socket when this line throws. The refusal
 * therefore happens before any byte reaches the host it refused.
 */
const CONNECTION = assertLoopbackConnection(process.env.E2E_DATABASE_URL)

/* ---------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------ */

/**
 * The one prefix. Every fixture id AND every fixture name starts with it, which
 * is what makes the leftover check one query per table instead of a bookkeeping
 * list. It contains no `_` and no `%`, so it needs no LIKE escaping — the same
 * choice `scripts/trash-checks.sql` made with `tck-`.
 */
const PREFIX = "dedupdbt-"
const LIKE_PREFIX = `${PREFIX}%`

/** The six tables this suite writes to, in the order they are counted and reported. */
const TOUCHED_TABLES = [
  "organizations",
  "people",
  "deals",
  "notes",
  "duplicate_pairs",
  "audit_log",
] as const

let sequence = 0
function fixtureId(kind: string): string {
  sequence += 1
  return `${PREFIX}${kind}-${Date.now().toString(36)}-${sequence.toString(36)}`
}

/** Borrowed READ-ONLY to satisfy NOT NULL foreign keys. Never written to. */
let ownerId = ""
let stageId = ""
let activityTypeId = ""

/** `count(*)` per touched table, captured before the first fixture exists. */
const countsBefore = new Map<string, number>()

async function tableCount(table: (typeof TOUCHED_TABLES)[number]): Promise<number> {
  const [row] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from ${sql.identifier(table)}`
  )
  return Number(row.n)
}

async function scalar<T>(query: ReturnType<typeof sql>): Promise<T> {
  const [row] = await db.execute<{ value: T }>(query)
  return row?.value as T
}

async function insertOrganization(
  label: string,
  values: Partial<typeof organizations.$inferInsert> = {}
): Promise<string> {
  const id = fixtureId("org")
  await db.insert(organizations).values({
    id,
    name: `${PREFIX}${label} ${id}`,
    ownerId,
    ...values,
  })
  return id
}

async function insertPerson(
  label: string,
  values: Partial<typeof people.$inferInsert> = {}
): Promise<string> {
  const id = fixtureId("person")
  await db.insert(people).values({
    id,
    firstName: `${PREFIX}${label}`,
    lastName: `${PREFIX}${id}`,
    ownerId,
    ...values,
  })
  return id
}

async function insertDeal(values: Partial<typeof deals.$inferInsert> = {}): Promise<string> {
  const id = fixtureId("deal")
  await db.insert(deals).values({
    id,
    title: `${PREFIX}deal ${id}`,
    stageId,
    ownerId,
    ...values,
  })
  return id
}

async function insertActivity(dealId: string): Promise<string> {
  const id = fixtureId("activity")
  await db.insert(activities).values({
    id,
    title: `${PREFIX}activity ${id}`,
    typeId: activityTypeId,
    ownerId,
    dueDate: new Date(),
    dealId,
  })
  return id
}

async function insertNote(
  entityType: MergeableEntityType,
  entityId: string,
  source: "user" | "migration",
  body: string
): Promise<string> {
  const id = fixtureId("note")
  await db.insert(notes).values({
    id,
    entityType,
    entityId,
    content: `${PREFIX}${body}`,
    source,
    authorId: ownerId,
  })
  return id
}

/**
 * A `duplicate_pairs` row in the CANONICAL ordering the table's own RULE 1
 * demands: `recordAId` is the lexicographically smaller id. Writing it the other
 * way round is what breaks the dismissal-survives-a-rescan property, and the
 * merge's V-9 membership check reads both columns.
 */
async function insertPair(
  entityType: MergeableEntityType,
  firstId: string,
  secondId: string
): Promise<string> {
  const id = fixtureId("pair")
  const [recordAId, recordBId] = [firstId, secondId].sort()
  await db.insert(duplicatePairs).values({
    id,
    entityType,
    recordAId,
    recordBId,
    tier: "certain",
    reason: "nameIdentity",
  })
  return id
}

/* ---------------------------------------------------------------------------
 * The merge, run the way the server action will run it
 * ------------------------------------------------------------------------ */

/**
 * `runWithActor` so the audit rows carry a real actor rather than `system`, which
 * is exactly what plan 39-15's server action does. Without it every assertion
 * about `actor_kind` / `actor_user_id` would be measuring the absence of a
 * boundary rather than the presence of one.
 *
 * On success it then WAITS for the bus-written tombstone. That wait is not
 * politeness: the audit subscriber's insert is deliberately fire-and-forget
 * (src/lib/events/subscribers/audit.ts — "the handler must NOT be async"), so
 * without it the teardown could delete the fixture rows while that INSERT is
 * still in flight and leave an audit row behind that no assertion in this file
 * ever saw.
 */
async function mergeAsUser(input: MergeRecordsInput): Promise<MergeRecordsResult> {
  const result = await runWithActor({ kind: "user", userId: ownerId }, () =>
    mergeRecordsMutation(input)
  )
  if (result.success) {
    await waitForTombstone(input.entityType, input.loserId)
  }
  return result
}

/**
 * Poll for the `deleted` row the BUS writes for the loser.
 *
 * THE LOSER'S TOMBSTONE COMES FROM THE EVENT BUS, NOT FROM THE TRANSACTION, and
 * that is a decision recorded at src/lib/mutations/dedup.ts step f2: writing a
 * `deleted` row inside the transaction as well as emitting `<entity>.deleted`
 * would put the same "deleted this organization" line on the loser's timeline
 * twice, because `organization.deleted` and `person.deleted` are members of
 * `AUDITED_EVENTS`. The in-transaction row on the loser is `merged`, carrying
 * `__mergedInto`.
 *
 * `registerAuditSubscriber()` is therefore called in `beforeAll`: without it
 * this harness would silently be a WEAKER model of production than the mocked
 * suite is, and the tombstone half of the audit story would go unproven.
 */
async function waitForTombstone(
  entityType: MergeableEntityType,
  loserId: string,
  timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const rows = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityType, entityType),
          eq(auditLog.entityId, loserId),
          eq(auditLog.action, "deleted")
        )
      )
      .limit(1)
    if (rows.length > 0) return
    if (Date.now() > deadline) {
      throw new Error(
        `the bus never wrote a 'deleted' audit row for ${entityType} ${loserId} — ` +
          "either the emit did not fire or registerAuditSubscriber() was not called"
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/* ---------------------------------------------------------------------------
 * Teardown
 * ------------------------------------------------------------------------ */

/**
 * Hard-delete every prefixed fixture, in foreign-key order.
 *
 * EVERY STATEMENT CARRIES AN EXPLICIT PREFIX PREDICATE. There is no unfiltered
 * DELETE in this file and there must never be one: the target is a real
 * development database with 46,054 organizations in it.
 *
 * The order is the FK graph, child-first: `activities.deal_id` -> `deals`,
 * `deals.organization_id` / `deals.person_id` -> `organizations` / `people`,
 * `people.organization_id` -> `organizations`. `notes.entity_id`,
 * `audit_log.entity_id` and both `duplicate_pairs` id columns have NO foreign
 * key at all (one column would have to point at four tables), so nothing
 * constrains their position — they go first because a leftover there is the
 * hardest to notice.
 */
async function hardDeleteFixtures(): Promise<void> {
  await db.delete(auditLog).where(like(auditLog.entityId, LIKE_PREFIX))
  await db.delete(notes).where(like(notes.id, LIKE_PREFIX))
  await db.delete(notes).where(like(notes.entityId, LIKE_PREFIX))
  await db.delete(duplicatePairs).where(like(duplicatePairs.id, LIKE_PREFIX))
  await db.delete(activities).where(like(activities.id, LIKE_PREFIX))
  await db.delete(deals).where(like(deals.id, LIKE_PREFIX))
  await db.delete(people).where(like(people.id, LIKE_PREFIX))
  await db.delete(organizations).where(like(organizations.id, LIKE_PREFIX))
}

/** Surviving prefixed rows per table, by id AND by name where the table has one. */
async function survivingFixtures(): Promise<Record<string, number>> {
  const byId = async (table: string, column: string): Promise<number> =>
    Number(
      await scalar<number>(
        sql`select count(*)::int as value from ${sql.identifier(table)} where ${sql.identifier(column)} like ${LIKE_PREFIX}`
      )
    )

  return {
    organizations_by_id: await byId("organizations", "id"),
    organizations_by_name: await byId("organizations", "name"),
    people_by_id: await byId("people", "id"),
    people_by_first_name: await byId("people", "first_name"),
    deals_by_id: await byId("deals", "id"),
    deals_by_title: await byId("deals", "title"),
    notes_by_id: await byId("notes", "id"),
    notes_by_entity_id: await byId("notes", "entity_id"),
    notes_by_content: await byId("notes", "content"),
    duplicate_pairs_by_id: await byId("duplicate_pairs", "id"),
    duplicate_pairs_by_record_a: await byId("duplicate_pairs", "record_a_id"),
    duplicate_pairs_by_record_b: await byId("duplicate_pairs", "record_b_id"),
    audit_log_by_entity_id: await byId("audit_log", "entity_id"),
    activities_by_id: await byId("activities", "id"),
  }
}

/* ---------------------------------------------------------------------------
 * Read helpers
 * ------------------------------------------------------------------------ */

async function readOrganization(id: string) {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1)
  return row
}

async function readPerson(id: string) {
  const [row] = await db.select().from(people).where(eq(people.id, id)).limit(1)
  return row
}

async function auditRows(entityId: string) {
  return db
    .select({
      action: auditLog.action,
      entityType: auditLog.entityType,
      changes: auditLog.changes,
      actorKind: auditLog.actorKind,
      actorUserId: auditLog.actorUserId,
    })
    .from(auditLog)
    .where(eq(auditLog.entityId, entityId))
}

async function auditActionCount(entityIds: string[], action: AuditAction): Promise<number> {
  if (entityIds.length === 0) return 0
  const rows = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(and(inArray(auditLog.entityId, entityIds), eq(auditLog.action, action)))
  return rows.length
}

async function noteRows(entityType: MergeableEntityType, entityId: string) {
  return db
    .select({ id: notes.id, source: notes.source, content: notes.content })
    .from(notes)
    .where(and(eq(notes.entityType, entityType), eq(notes.entityId, entityId)))
}

/* ---------------------------------------------------------------------------
 * Suite lifecycle
 * ------------------------------------------------------------------------ */

beforeAll(async () => {
  // The audit subscriber is registered by `instrumentation.ts` in the running
  // app, never by module import, so a test process that does not call this is
  // modelling a product without audit-on-delete. See waitForTombstone.
  registerAuditSubscriber()

  const [owner] = await db.execute<{ value: string }>(
    sql`select id as value from users where deleted_at is null order by id limit 1`
  )
  const [stage] = await db.execute<{ value: string }>(
    sql`select id as value from stages order by id limit 1`
  )
  const [type] = await db.execute<{ value: string }>(
    sql`select id as value from activity_types order by id limit 1`
  )

  expect(owner?.value, "the dev database has no user to own a fixture").toBeTruthy()
  expect(stage?.value, "the dev database has no stage to put a fixture deal in").toBeTruthy()
  expect(type?.value, "the dev database has no activity type").toBeTruthy()

  ownerId = owner.value
  stageId = stage.value
  activityTypeId = type.value

  // Anything left behind by an interrupted earlier run, so the parity check
  // below measures this run rather than the last one.
  await hardDeleteFixtures()

  for (const table of TOUCHED_TABLES) countsBefore.set(table, await tableCount(table))
})

afterEach(async () => {
  await hardDeleteFixtures()
})

afterAll(async () => {
  // Runs even if a test failed: a red suite must not be a red suite AND a dirty
  // database.
  await hardDeleteFixtures()

  const surviving = await survivingFixtures()
  for (const [label, n] of Object.entries(surviving)) {
    expect(n, `${label}: a prefixed fixture row survived the teardown`).toBe(0)
  }

  const parity: Record<string, { before: number; after: number }> = {}
  for (const table of TOUCHED_TABLES) {
    parity[table] = { before: countsBefore.get(table) ?? -1, after: await tableCount(table) }
  }

  // THE ANTI-VACUITY ANCHOR FOR THE LEFTOVER CHECK. A prefix query can only see
  // rows this suite CREATED; it is blind to a real row it accidentally mutated
  // or deleted. Total row counts are not.
  //
  // `audit_log` is reported but not failed on, and the carve-out is the same one
  // `scripts/dedup-checks.sql` Part 9a makes for the same table and the same
  // reason: the application container is normally running against this database
  // and any request it serves writes audit rows that have nothing to do with
  // this file.
  for (const table of TOUCHED_TABLES) {
    if (table === "audit_log") continue
    expect(
      parity[table].after,
      `${table}: row count changed from ${parity[table].before} to ${parity[table].after} — ` +
        "this suite mutated data it did not create"
    ).toBe(parity[table].before)
  }

  console.log(
    `[dedup.db.test] row-count parity ${JSON.stringify(parity)} / surviving ${JSON.stringify(surviving)}`
  )

  // No trigger or function from Test 5 may outlive the run.
  const strayObjects = await scalar<number>(
    sql`select (
          (select count(*) from pg_trigger where tgname like ${LIKE_PREFIX})
        + (select count(*) from pg_proc where proname like ${LIKE_PREFIX})
        )::int as value`
  )
  expect(Number(strayObjects), "a dedupdbt- trigger or function survived Test 5").toBe(0)

  // Close the pool so the worker exits cleanly rather than being killed with an
  // open socket.
  await db.$client.end({ timeout: 5 })
})

/* ---------------------------------------------------------------------------
 * Test 10 — the guard. First, because it is the precondition for the rest.
 * ------------------------------------------------------------------------ */

describe("the loopback guard", () => {
  it("accepts the two loopback spellings and nothing else", () => {
    expect(assertLoopbackConnection("postgres://u:p@localhost:5433/pipelite")).toContain(
      "localhost"
    )
    expect(assertLoopbackConnection("postgres://u:p@127.0.0.1:5433/pipelite")).toContain(
      "127.0.0.1"
    )
  })

  it("refuses a non-loopback host and NAMES it", () => {
    expect(() =>
      assertLoopbackConnection("postgres://u:p@db.internal.example.com:5432/pipelite")
    ).toThrow(/db\.internal\.example\.com/)
    expect(() => assertLoopbackConnection("postgres://u:p@10.0.0.7:5432/pipelite")).toThrow(
      /10\.0\.0\.7/
    )
    // A hostname that merely CONTAINS "localhost" is not loopback. Without the
    // exact comparison, `localhost.evil.example` would pass.
    expect(() =>
      assertLoopbackConnection("postgres://u:p@localhost.evil.example:5432/pipelite")
    ).toThrow(/localhost\.evil\.example/)
  })

  it("refuses an absent connection string", () => {
    expect(() => assertLoopbackConnection(undefined)).toThrow(/E2E_DATABASE_URL is not set/)
    expect(() => assertLoopbackConnection("")).toThrow(/E2E_DATABASE_URL is not set/)
  })

  it("the connection this suite actually resolved is loopback", () => {
    // The module-scope call already enforced this; asserting the resolved value
    // is what makes the enforcement visible in the report instead of implied by
    // the suite having started at all.
    expect(["localhost", "127.0.0.1"]).toContain(new URL(CONNECTION).hostname)
  })
})

/* ---------------------------------------------------------------------------
 * Test 1 — B4. The single highest-value test in this phase.
 * ------------------------------------------------------------------------ */

describe("Test 1: two organizations that BOTH carry a source='migration' note", () => {
  it("merges successfully, demoting the loser's migration note instead of colliding", async () => {
    const survivorId = await insertOrganization("survivor-b4")
    const loserId = await insertOrganization("loser-b4")
    const pairId = await insertPair("organization", survivorId, loserId)

    await insertNote("organization", survivorId, "migration", "survivor import provenance")
    await insertNote("organization", loserId, "migration", "loser import provenance")

    // The precondition, asserted rather than assumed: both rows really occupy
    // the partial unique index before the merge runs.
    const migrationNotesBefore = await scalar<number>(
      sql`select count(*)::int as value from notes
           where entity_type = 'organization'
             and source = 'migration'
             and entity_id in (${survivorId}, ${loserId})`
    )
    expect(Number(migrationNotesBefore)).toBe(2)

    const result = await mergeAsUser({
      entityType: "organization",
      pairId,
      survivorId,
      loserId,
      choices: {},
    })

    // WITHOUT THE DEMOTION THIS IS `{ success: false, error: "FAILED" }`, because
    // the reassignment raises SQLSTATE 23505 on notes_migration_uniq and rolls
    // the whole transaction back. That is the assertion no mocked test can make.
    expect(result).toEqual({
      success: true,
      movedChildren: 1,
      loserName: expect.stringContaining(PREFIX),
    })

    const survivorNotes = await noteRows("organization", survivorId)
    expect(survivorNotes).toHaveLength(2)
    expect(survivorNotes.filter((note) => note.source === "migration")).toHaveLength(1)
    expect(survivorNotes.filter((note) => note.source === "user")).toHaveLength(1)

    // NO CONTENT WAS LOST. The resolution is to DEMOTE, never to delete: a
    // migration note is import provenance and a merge must not destroy the
    // record of where a row came from.
    expect(survivorNotes.map((note) => note.content).sort()).toEqual(
      [`${PREFIX}survivor import provenance`, `${PREFIX}loser import provenance`].sort()
    )

    // And the loser keeps nothing.
    expect(await noteRows("organization", loserId)).toHaveLength(0)

    // The demotion is RECORDED, not silent — the survivor's audit row says a
    // note was reclassified.
    const survivorAudit = (await auditRows(survivorId)).filter((row) => row.action === "merged")
    expect(survivorAudit).toHaveLength(1)
    expect(survivorAudit[0].changes).toMatchObject({
      __mergedNoteReclassified: { from: "migration", to: "user" },
    })
  })

  it("leaves a lone migration note on the loser alone when the survivor has none", async () => {
    // The demotion is scoped by an EXISTS on the survivor, so this is the other
    // half of B4: only a GENUINE collision is reclassified. Without the EXISTS
    // every merge would quietly downgrade import provenance that never collided.
    const survivorId = await insertOrganization("survivor-nocollide")
    const loserId = await insertOrganization("loser-nocollide")
    await insertNote("organization", loserId, "migration", "lone provenance")

    const result = await mergeAsUser({
      entityType: "organization",
      pairId: null,
      survivorId,
      loserId,
      choices: {},
    })
    expect(result.success).toBe(true)

    const survivorNotes = await noteRows("organization", survivorId)
    expect(survivorNotes).toHaveLength(1)
    expect(survivorNotes[0].source).toBe("migration")

    const survivorAudit = (await auditRows(survivorId)).filter((row) => row.action === "merged")
    expect(Object.keys(survivorAudit[0].changes as object)).not.toContain(
      "__mergedNoteReclassified"
    )
  })

  it("writes the survivor's chosen name through the GENERATED norm_name column", async () => {
    // The 428C9 half of the same statement. `organizations.norm_name` is
    // GENERATED ALWAYS (migration 0017); PostgreSQL rejects `SET norm_name = …`
    // outright, so if `MERGE_EXCLUDED_COLUMNS` ever stops excluding it EVERY
    // organization merge fails. `src/lib/mutations/dedup.test.ts` holds the
    // drift alarm on the set; this is the end-to-end consequence of it, measured
    // against the real column.
    const survivorId = await insertOrganization("survivor-generated")
    const loserId = await insertOrganization("loser-generated")

    const before = await readOrganization(survivorId)
    const loserBefore = await readOrganization(loserId)

    const result = await mergeAsUser({
      entityType: "organization",
      pairId: null,
      survivorId,
      loserId,
      // The survivor takes the LOSER's name, so the generated column must be
      // recomputed by the database rather than carried over.
      choices: { name: "loser" },
    })
    expect(result.success).toBe(true)

    const after = await readOrganization(survivorId)
    expect(after.name).toBe(loserBefore.name)
    expect(after.normName).not.toBe(before.normName)

    // Asserted against the generation expression itself, not against a
    // reimplementation of the normalizer in TypeScript.
    const consistent = await scalar<boolean>(
      sql`select (norm_name = dedup_norm_org(name)) as value
            from organizations where id = ${survivorId}`
    )
    expect(consistent).toBe(true)
  })

  it("excludes every GENERATED column of both mergeable tables from the merge", async () => {
    // The catalog is the source of truth here, so a fifth generated column added
    // by a future migration fails this test rather than every merge.
    const generated = await db.execute<{ table_name: string; column_name: string }>(
      sql`select table_name, column_name from information_schema.columns
           where table_schema = 'public'
             and table_name in ('organizations', 'people')
             and is_generated = 'ALWAYS'`
    )
    expect(generated.length).toBeGreaterThanOrEqual(4)

    const camel = (snake: string): string =>
      snake.replace(/_([a-z])/g, (_all, letter: string) => letter.toUpperCase())

    for (const row of generated) {
      expect(
        MERGE_EXCLUDED_COLUMNS.has(camel(row.column_name)),
        `${row.table_name}.${row.column_name} is GENERATED ALWAYS but not in MERGE_EXCLUDED_COLUMNS — ` +
          "every merge of that entity type will fail with SQLSTATE 428C9"
      ).toBe(true)
    }
  })
})

/* ---------------------------------------------------------------------------
 * Test 2 — nothing is orphaned
 * ------------------------------------------------------------------------ */

describe("Test 2: no row anywhere still points at the loser", () => {
  it("reparents 3 deals, 2 people and 2 notes and leaves the loser referenced by nothing", async () => {
    const survivorId = await insertOrganization("survivor-orphans")
    const loserId = await insertOrganization("loser-orphans")
    const pairId = await insertPair("organization", survivorId, loserId)

    for (let i = 0; i < 3; i += 1) await insertDeal({ organizationId: loserId })
    for (let i = 0; i < 2; i += 1) await insertPerson(`child-${i}`, { organizationId: loserId })
    await insertNote("organization", loserId, "user", "loser note 1")
    await insertNote("organization", loserId, "user", "loser note 2")

    // One pre-existing child on the survivor, so the after-counts below are a
    // SUM rather than a copy of the loser's counts. Without it, "3" on the
    // survivor is consistent with the reparenting having replaced the survivor's
    // own children instead of adding to them.
    await insertDeal({ organizationId: survivorId })

    const result = await mergeAsUser({
      entityType: "organization",
      pairId,
      survivorId,
      loserId,
      choices: {},
    })
    expect(result).toMatchObject({ success: true, movedChildren: 7 })

    const dealsOnLoser = await scalar<number>(
      sql`select count(*)::int as value from deals where organization_id = ${loserId}`
    )
    const peopleOnLoser = await scalar<number>(
      sql`select count(*)::int as value from people where organization_id = ${loserId}`
    )
    const notesOnLoser = await scalar<number>(
      sql`select count(*)::int as value from notes
           where entity_type = 'organization' and entity_id = ${loserId}`
    )
    expect([Number(dealsOnLoser), Number(peopleOnLoser), Number(notesOnLoser)]).toEqual([0, 0, 0])

    const dealsOnSurvivor = await scalar<number>(
      sql`select count(*)::int as value from deals where organization_id = ${survivorId}`
    )
    const peopleOnSurvivor = await scalar<number>(
      sql`select count(*)::int as value from people where organization_id = ${survivorId}`
    )
    const notesOnSurvivor = await scalar<number>(
      sql`select count(*)::int as value from notes
           where entity_type = 'organization' and entity_id = ${survivorId}`
    )
    expect([Number(dealsOnSurvivor), Number(peopleOnSurvivor), Number(notesOnSurvivor)]).toEqual([
      4, 2, 2,
    ])

    // The pair that produced the merge is settled inside the same transaction.
    const [pair] = await db
      .select({ status: duplicatePairs.status })
      .from(duplicatePairs)
      .where(eq(duplicatePairs.id, pairId))
    expect(pair.status).toBe("merged")
  })

  it("supersedes every other still-open pair that referenced the loser", async () => {
    // Not tidying: after merging A and B, a pair (B, C) is a question about a
    // record that is now in Trash, and 39-UI-SPEC M-8 calls that a dead end.
    const survivorId = await insertOrganization("survivor-supersede")
    const loserId = await insertOrganization("loser-supersede")
    const thirdId = await insertOrganization("third-supersede")

    const mergedPairId = await insertPair("organization", survivorId, loserId)
    const stalePairId = await insertPair("organization", loserId, thirdId)
    const unrelatedPairId = await insertPair("organization", survivorId, thirdId)

    const result = await mergeAsUser({
      entityType: "organization",
      pairId: mergedPairId,
      survivorId,
      loserId,
      choices: {},
    })
    expect(result.success).toBe(true)

    const statuses = new Map(
      (
        await db
          .select({ id: duplicatePairs.id, status: duplicatePairs.status })
          .from(duplicatePairs)
          .where(inArray(duplicatePairs.id, [mergedPairId, stalePairId, unrelatedPairId]))
      ).map((row) => [row.id, row.status])
    )
    expect(statuses.get(mergedPairId)).toBe("merged")
    expect(statuses.get(stalePairId)).toBe("superseded")
    // The pair between the survivor and a third record is still a live question.
    expect(statuses.get(unrelatedPairId)).toBe("open")
  })
})

/* ---------------------------------------------------------------------------
 * Test 3 — the loser lands in Trash, the survivor does not
 * ------------------------------------------------------------------------ */

describe("Test 3: the loser is soft-deleted and the survivor is not", () => {
  it("sets deleted_at on the loser only", async () => {
    const survivorId = await insertOrganization("survivor-trash")
    const loserId = await insertOrganization("loser-trash")

    const result = await mergeAsUser({
      entityType: "organization",
      pairId: null,
      survivorId,
      loserId,
      choices: {},
    })
    expect(result.success).toBe(true)

    const survivor = await readOrganization(survivorId)
    const loser = await readOrganization(loserId)

    expect(survivor.deletedAt).toBeNull()
    expect(loser.deletedAt).toBeInstanceOf(Date)

    // A SOFT delete, so the row is still there to restore. Asserting the row
    // exists is the half that distinguishes Trash from a purge.
    expect(loser.id).toBe(loserId)
  })
})

/* ---------------------------------------------------------------------------
 * Test 4 — the audit rows, counted
 * ------------------------------------------------------------------------ */

describe("Test 4: one audit row per side, one per reparented child", () => {
  it("writes exactly 1 merged row on each side and 7 updated rows for 7 children", async () => {
    const survivorId = await insertOrganization("survivor-audit")
    const loserId = await insertOrganization("loser-audit")

    // SEVEN children, deliberately split 4/3: a per-record write produces 7
    // `updated` rows, a once-per-loop write produces 2, and a single write for
    // the whole merge produces 1. Three different numbers, so the failure
    // message identifies which mistake was made.
    const dealIds: string[] = []
    for (let i = 0; i < 4; i += 1) dealIds.push(await insertDeal({ organizationId: loserId }))
    const personIds: string[] = []
    for (let i = 0; i < 3; i += 1) {
      personIds.push(await insertPerson(`audit-${i}`, { organizationId: loserId }))
    }

    const result = await mergeAsUser({
      entityType: "organization",
      pairId: null,
      survivorId,
      loserId,
      choices: {},
    })
    expect(result).toMatchObject({ success: true, movedChildren: 7 })

    const survivorMerged = (await auditRows(survivorId)).filter((row) => row.action === "merged")
    const loserRows = await auditRows(loserId)

    expect(survivorMerged).toHaveLength(1)
    expect(survivorMerged[0].changes).toMatchObject({
      __mergedFrom: { from: loserId, to: null },
      __mergedChildren: { from: null, to: 7 },
    })
    // The actor reached the row. `system` here would mean runWithActor never
    // established the boundary and every audit assertion above is measuring a
    // default.
    expect(survivorMerged[0].actorKind).toBe("user")
    expect(survivorMerged[0].actorUserId).toBe(ownerId)

    // THE LOSER'S IN-TRANSACTION ROW IS `merged`, NOT `deleted`, and the
    // `deleted` tombstone comes from the BUS — see waitForTombstone, and step f2
    // of src/lib/mutations/dedup.ts. Both are asserted, because the pair of them
    // is the decision: exactly one of each, never two `deleted` rows.
    expect(loserRows.filter((row) => row.action === "merged")).toHaveLength(1)
    expect(loserRows.filter((row) => row.action === "deleted")).toHaveLength(1)
    expect(
      loserRows.find((row) => row.action === "merged")!.changes
    ).toMatchObject({
      __mergedInto: { from: null, to: survivorId },
      __mergedChildren: { from: null, to: 7 },
    })

    const childUpdated = await auditActionCount([...dealIds, ...personIds], "updated")
    expect(
      childUpdated,
      "expected ONE `updated` audit row per reparented child (7); a once-per-loop write yields 2"
    ).toBe(7)

    // Each child's row names the column that actually moved, so both timelines
    // render it through the ordinary AuditFieldRow path.
    const [dealRow] = await auditRows(dealIds[0])
    expect(dealRow.entityType).toBe("deal")
    expect(dealRow.changes).toMatchObject({ organizationId: { from: loserId, to: survivorId } })
    const [personRow] = await auditRows(personIds[0])
    expect(personRow.entityType).toBe("person")
    expect(personRow.changes).toMatchObject({ organizationId: { from: loserId, to: survivorId } })
  })

  it("writes no audit row at all for a childless merge beyond the two sides", async () => {
    const survivorId = await insertOrganization("survivor-nochild")
    const loserId = await insertOrganization("loser-nochild")

    await mergeAsUser({
      entityType: "organization",
      pairId: null,
      survivorId,
      loserId,
      choices: {},
    })

    // `insert().values([])` is a driver error rather than a no-op, so the
    // mutation skips the child insert entirely when nothing moved. This is the
    // observable consequence.
    expect(await auditActionCount([survivorId, loserId], "updated")).toBe(0)
    expect(await auditActionCount([survivorId, loserId], "merged")).toBe(2)
  })
})

/* ---------------------------------------------------------------------------
 * Test 5 — atomicity
 * ------------------------------------------------------------------------ */

describe("Test 5: a failure part-way through leaves both records exactly as they were", () => {
  /**
   * THE LEVER, AND WHY IT IS THIS ONE.
   *
   * The plan's first suggestion — soft-deleting the loser from a second
   * connection between the pre-read and the transaction — is exercised
   * separately below, but it is NOT an atomicity proof: the merge's own
   * `FOR UPDATE` re-read catches it and throws BEFORE any write, so there is
   * nothing to roll back and a non-transactional implementation would pass.
   *
   * A temporary `BEFORE UPDATE` trigger on `notes` fails the merge at step c,
   * AFTER the deal and people reparenting at step b has already run. Only a real
   * transaction can undo those, which is the property under test.
   *
   * IT IS SCOPED BY A `WHEN` CLAUSE TO THE FIXTURE PREFIX. The application
   * container and any sibling process are writing to `notes` on this same
   * database while this runs; an unconditional trigger would break their writes
   * for as long as it existed. `SET LOCAL lock_timeout` keeps the DDL from
   * queueing behind them, and the drop is in a `finally`.
   */
  const TRIGGER = `${PREFIX}notes_fail`.replace(/-/g, "_")
  const FUNCTION = `${PREFIX}induce_failure`.replace(/-/g, "_")

  async function withFailingNotesTrigger(body: () => Promise<void>): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '5s'`)
      await tx.execute(
        sql.raw(
          `create or replace function ${FUNCTION}() returns trigger language plpgsql as $fn$
             begin
               raise exception 'induced failure (39-10 Test 5)';
             end
           $fn$`
        )
      )
      await tx.execute(
        sql.raw(
          `create trigger ${TRIGGER}
             before update on notes
             for each row
             when (old.entity_id like '${LIKE_PREFIX}')
             execute function ${FUNCTION}()`
        )
      )
    })

    try {
      await body()
    } finally {
      await db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '5s'`)
        await tx.execute(sql.raw(`drop trigger if exists ${TRIGGER} on notes`))
        await tx.execute(sql.raw(`drop function if exists ${FUNCTION}()`))
      })
    }
  }

  it("rolls back the reparenting, the soft delete and every audit row", async () => {
    const survivorId = await insertOrganization("survivor-atomic")
    const loserId = await insertOrganization("loser-atomic")
    const pairId = await insertPair("organization", survivorId, loserId)

    const dealId = await insertDeal({ organizationId: loserId })
    const personId = await insertPerson("atomic", { organizationId: loserId })
    const noteId = await insertNote("organization", loserId, "user", "atomic note")

    const survivorBefore = await readOrganization(survivorId)

    await withFailingNotesTrigger(async () => {
      const result = await mergeAsUser({
        entityType: "organization",
        pairId,
        survivorId,
        loserId,
        choices: { name: "loser" },
      })
      // A FIXED SENTINEL, never the driver's message: the raw text would carry
      // the trigger and function names (T-39-03).
      expect(result).toEqual({ success: false, error: "FAILED" })
    })

    // 1. The loser is NOT in Trash.
    expect((await readOrganization(loserId)).deletedAt).toBeNull()

    // 2. NO child moved. Step b ran before the trigger fired, so these three are
    //    the assertions that only a real transaction can satisfy.
    const [deal] = await db
      .select({ organizationId: deals.organizationId })
      .from(deals)
      .where(eq(deals.id, dealId))
    expect(deal.organizationId).toBe(loserId)

    const [person] = await db
      .select({ organizationId: people.organizationId })
      .from(people)
      .where(eq(people.id, personId))
    expect(person.organizationId).toBe(loserId)

    const [note] = await db
      .select({ entityId: notes.entityId, source: notes.source })
      .from(notes)
      .where(eq(notes.id, noteId))
    expect(note.entityId).toBe(loserId)
    expect(note.source).toBe("user")

    // 3. The survivor did not take the loser's name.
    const survivorAfter = await readOrganization(survivorId)
    expect(survivorAfter.name).toBe(survivorBefore.name)
    expect(survivorAfter.normName).toBe(survivorBefore.normName)

    // 4. NO AUDIT ROW CLAIMS A MERGE HAPPENED, on either side or on any child.
    //    This is the assertion that would catch a bus-emitted row surviving a
    //    rollback: the bus emit sits AFTER the commit precisely so that a failed
    //    merge tells nobody anything, and a `deleted` tombstone here would mean
    //    the emit had moved inside the transaction.
    expect(await auditActionCount([survivorId, loserId], "merged")).toBe(0)
    expect(await auditActionCount([survivorId, loserId], "deleted")).toBe(0)
    expect(await auditActionCount([dealId, personId], "updated")).toBe(0)
    const anyAudit = await scalar<number>(
      sql`select count(*)::int as value from audit_log where entity_id like ${LIKE_PREFIX}`
    )
    expect(Number(anyAudit)).toBe(0)

    // 5. The pair is still an open question.
    const [pair] = await db
      .select({ status: duplicatePairs.status })
      .from(duplicatePairs)
      .where(eq(duplicatePairs.id, pairId))
    expect(pair.status).toBe("open")
  })

  it("refuses BEFORE writing anything when the loser is soft-deleted underneath it", async () => {
    // The second lever, kept as its own test because it proves a DIFFERENT
    // property: the in-transaction `FOR UPDATE` re-read, which exists because
    // the existence checks happen outside the transaction and a concurrent
    // delete between the two would otherwise write a second tombstone.
    const survivorId = await insertOrganization("survivor-gone")
    const loserId = await insertOrganization("loser-gone")
    const dealId = await insertDeal({ organizationId: loserId })

    await db
      .update(organizations)
      .set({ deletedAt: new Date() })
      .where(and(eq(organizations.id, loserId), isNull(organizations.deletedAt)))

    const result = await mergeAsUser({
      entityType: "organization",
      pairId: null,
      survivorId,
      loserId,
      choices: {},
    })
    // A CODE, not a failure: 39-UI-SPEC M-8's "one record already gone" is a
    // real state the UI must tell apart from a retryable error.
    expect(result).toEqual({ success: false, error: "NOT_FOUND" })

    const [deal] = await db
      .select({ organizationId: deals.organizationId })
      .from(deals)
      .where(eq(deals.id, dealId))
    expect(deal.organizationId).toBe(loserId)
    expect(await auditActionCount([survivorId, loserId], "merged")).toBe(0)
  })
})

/* ---------------------------------------------------------------------------
 * Test 6 — activities follow their deal, by design
 * ------------------------------------------------------------------------ */

describe("Test 6: activities are NOT reassigned and still resolve through their deal", () => {
  it("moves the deal and leaves both activities untouched", async () => {
    // BY DESIGN, AND THE ABSENCE IS THE POINT. `activities` has a `deal_id` and
    // nothing else — no organization column and no person column — so an
    // activity is already on the survivor's side the moment its deal is. SC-4's
    // "every activity" is satisfied transitively. A no-op `UPDATE activities` in
    // the merge would be a lie about the schema, and this test is what makes the
    // omission a recorded decision rather than a gap.
    const survivorId = await insertOrganization("survivor-activities")
    const loserId = await insertOrganization("loser-activities")
    const dealId = await insertDeal({ organizationId: loserId })
    const activityA = await insertActivity(dealId)
    const activityB = await insertActivity(dealId)

    const before = await db
      .select({ id: activities.id, dealId: activities.dealId, updatedAt: activities.updatedAt })
      .from(activities)
      .where(inArray(activities.id, [activityA, activityB]))
    expect(before).toHaveLength(2)

    const result = await mergeAsUser({
      entityType: "organization",
      pairId: null,
      survivorId,
      loserId,
      choices: {},
    })
    // movedChildren counts the deal, never the activities.
    expect(result).toMatchObject({ success: true, movedChildren: 1 })

    const [deal] = await db
      .select({ organizationId: deals.organizationId })
      .from(deals)
      .where(eq(deals.id, dealId))
    expect(deal.organizationId).toBe(survivorId)

    const after = await db
      .select({ id: activities.id, dealId: activities.dealId, updatedAt: activities.updatedAt })
      .from(activities)
      .where(inArray(activities.id, [activityA, activityB]))

    for (const row of after) {
      const original = before.find((candidate) => candidate.id === row.id)!
      expect(row.dealId).toBe(dealId)
      expect(row.updatedAt.getTime()).toBe(original.updatedAt.getTime())
    }

    // No audit row was written for either activity: nothing about them changed.
    expect(await auditActionCount([activityA, activityB], "updated")).toBe(0)
  })
})

/* ---------------------------------------------------------------------------
 * Test 7 — audit_log is not reassigned, by design
 * ------------------------------------------------------------------------ */

describe("Test 7: the loser keeps its own audit history", () => {
  it("does not move a pre-existing audit row onto the survivor", async () => {
    // ALSO BY DESIGN. An audit row is a statement about what happened to THAT
    // record; reassigning it would claim the survivor was edited on a date it
    // did not exist under that identity, and it would make the loser's Trash
    // entry unexplainable. The loser's history stays with the loser.
    const survivorId = await insertOrganization("survivor-history")
    const loserId = await insertOrganization("loser-history")

    const historyId = fixtureId("audit")
    await db.insert(auditLog).values({
      id: historyId,
      entityType: "organization",
      entityId: loserId,
      action: "updated",
      changes: { name: { from: "before", to: "after" } },
      actorKind: "user",
      actorUserId: ownerId,
    })

    const result = await mergeAsUser({
      entityType: "organization",
      pairId: null,
      survivorId,
      loserId,
      choices: {},
    })
    expect(result.success).toBe(true)

    const [row] = await db
      .select({ entityId: auditLog.entityId })
      .from(auditLog)
      .where(eq(auditLog.id, historyId))
    expect(row.entityId).toBe(loserId)

    // And the survivor's own history contains only what the merge wrote.
    const survivorActions = (await auditRows(survivorId)).map((entry) => entry.action).sort()
    expect(survivorActions).toEqual(["merged"])
  })
})

/* ---------------------------------------------------------------------------
 * Test 8 — the person merge
 * ------------------------------------------------------------------------ */

describe("Test 8: merging two people", () => {
  it("reparents deals.person_id, reassigns notes, and treats organizationId as a picker field", async () => {
    const survivorOrgId = await insertOrganization("person-survivor-org")
    const loserOrgId = await insertOrganization("person-loser-org")

    // The survivor has NO organization and the loser has one, so
    // `organizationId` lands in the `filledOnly` group, whose default is the
    // LOSER. That is the whole point of this assertion: `people.organizationId`
    // is an ORDINARY FIELD the picker resolves, not a child link the merge
    // reparents — there is no `people.person_id`.
    const survivorId = await insertPerson("survivor-person", {
      email: `${PREFIX}survivor@local.test`,
    })
    const loserId = await insertPerson("loser-person", {
      organizationId: loserOrgId,
      email: `${PREFIX}LOSER@local.test`,
      phone: "+55 (11) 91234-5678",
    })
    const pairId = await insertPair("person", survivorId, loserId)

    const dealA = await insertDeal({ personId: loserId, organizationId: loserOrgId })
    const dealB = await insertDeal({ personId: loserId })
    await insertNote("person", loserId, "migration", "person provenance")
    await insertNote("person", survivorId, "migration", "survivor person provenance")

    const result = await mergeAsUser({
      entityType: "person",
      pairId,
      survivorId,
      loserId,
      // The loser's phone, and the migration-note collision, both resolved.
      choices: { phone: "loser" },
    })
    expect(result).toMatchObject({ success: true, movedChildren: 3 })

    const survivor = await readPerson(survivorId)
    expect(survivor.organizationId).toBe(loserOrgId)
    expect(survivor.phone).toBe("+55 (11) 91234-5678")
    // The survivor's own email won: both sides are populated and different, so
    // it is a conflict, and a conflict defaults to the survivor.
    expect(survivor.email).toBe(`${PREFIX}survivor@local.test`)
    // Two more GENERATED columns, recomputed by the database from the values the
    // picker chose.
    expect(survivor.normPhone).toBe("5511912345678")
    expect(survivor.normEmail).toBe(`${PREFIX}survivor@local.test`.toLowerCase())

    // `deals.person_id` is the child link that DOES reparent.
    const dealsOnSurvivor = await db
      .select({ id: deals.id, organizationId: deals.organizationId })
      .from(deals)
      .where(eq(deals.personId, survivorId))
    expect(dealsOnSurvivor.map((row) => row.id).sort()).toEqual([dealA, dealB].sort())

    // A person merge must NOT touch `deals.organization_id`: the deal's
    // organization is a different relationship and the merge never asked about
    // it. `survivorOrgId` exists purely to make that assertion possible.
    expect(dealsOnSurvivor.find((row) => row.id === dealA)!.organizationId).toBe(loserOrgId)
    expect(survivorOrgId).not.toBe(loserOrgId)

    const survivorNotes = await noteRows("person", survivorId)
    expect(survivorNotes).toHaveLength(2)
    expect(survivorNotes.filter((note) => note.source === "migration")).toHaveLength(1)
    expect(await noteRows("person", loserId)).toHaveLength(0)

    expect((await readPerson(loserId)).deletedAt).toBeInstanceOf(Date)
    // No `people` row was reparented, because a person has no people.
    const childPeople = await scalar<number>(
      sql`select count(*)::int as value from people where organization_id = ${survivorId}`
    )
    expect(Number(childPeople)).toBe(0)
  })
})

/* ---------------------------------------------------------------------------
 * Test 9 — V-9, the pair-membership control
 * ------------------------------------------------------------------------ */

describe("Test 9: a survivor that is not a member of the supplied pair", () => {
  it("returns NOT_IN_PAIR and writes NOTHING", async () => {
    // T-39-02. `survivorId` and `loserId` arrive from a browser; without this
    // control a crafted request could name the pair of one row and the ids of
    // two unrelated records, merging anything into anything. The assertion is
    // deliberately about ROW STATE, not about the return value: a mutation that
    // returned the right code after writing half the merge would pass a
    // return-value-only test.
    const survivorId = await insertOrganization("survivor-notinpair")
    const loserId = await insertOrganization("loser-notinpair")
    const strangerA = await insertOrganization("stranger-a")
    const strangerB = await insertOrganization("stranger-b")

    const foreignPairId = await insertPair("organization", strangerA, strangerB)
    const dealId = await insertDeal({ organizationId: loserId })
    await insertNote("organization", loserId, "migration", "notinpair note")

    const result = await mergeAsUser({
      entityType: "organization",
      pairId: foreignPairId,
      survivorId,
      loserId,
      choices: {},
    })
    expect(result).toEqual({ success: false, error: "NOT_IN_PAIR" })

    const [deal] = await db
      .select({ organizationId: deals.organizationId })
      .from(deals)
      .where(eq(deals.id, dealId))
    expect(deal.organizationId).toBe(loserId)

    expect((await readOrganization(loserId)).deletedAt).toBeNull()
    expect(await noteRows("organization", loserId)).toHaveLength(1)
    expect(await noteRows("organization", survivorId)).toHaveLength(0)

    const anyAudit = await scalar<number>(
      sql`select count(*)::int as value from audit_log where entity_id like ${LIKE_PREFIX}`
    )
    expect(Number(anyAudit)).toBe(0)

    const [pair] = await db
      .select({ status: duplicatePairs.status })
      .from(duplicatePairs)
      .where(eq(duplicatePairs.id, foreignPairId))
    expect(pair.status).toBe("open")
  })

  it("refuses a self-merge before it reads anything", async () => {
    const id = await insertOrganization("self-merge")
    const result = await mergeAsUser({
      entityType: "organization",
      pairId: null,
      survivorId: id,
      loserId: id,
      choices: {},
    })
    expect(result).toEqual({ success: false, error: "SAME_RECORD" })
    expect((await readOrganization(id)).deletedAt).toBeNull()
  })
})
