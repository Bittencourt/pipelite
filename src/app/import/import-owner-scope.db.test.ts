/**
 * =============================================================================
 * import-owner-scope.db.test.ts — CR-03, PROVEN BEHAVIOURALLY
 * =============================================================================
 *
 * THE DEFECT, and the reason it is the most serious of the five `activities.deal_id` writers
 * despite living outside `/api/v1`: it needs NO ATTACKER AT ALL.
 *
 *     // src/app/import/actions.ts, importActivities
 *     const existingDeals = await db.query.deals.findMany({
 *       where: isNull(deals.deletedAt),          // <- every live deal, every owner
 *       columns: { id: true, title: true },
 *     })
 *     …
 *     const matchedDeal = existingDeals.find(
 *       (d) => d.title.toLowerCase() === item.dealTitle!.toLowerCase().trim()
 *     )
 *     if (matchedDeal) dealId = matchedDeal.id
 *     …
 *     rows.push({ …, dealId, ownerId: session.user!.id, … })
 *
 * Every row this action writes is owned by the importer, so a match against another owner's deal is
 * unambiguously wrong. User A uploads a CSV whose activity row names a deal title that user B owns;
 * `Array.prototype.find` returns B's row from an unordered scan; A's activity is written carrying
 * B's `deal_id`, and A is told "imported, 0 warnings" — the `Deal "…" not found` branch is not
 * taken, because a deal WAS found. `src/app/activities/[id]/page.tsx:41-52` then joins
 * `deals`/`stages`/`pipelines` off that column with no owner predicate and renders B's deal title,
 * stage and pipeline name to A.
 *
 * It also falsifies DEF-48-03 in both halves. That entry said the remaining writer "needs a
 * hand-crafted server-action call" and that "what remains is an INTEGRITY gap … not a
 * confidentiality one". This writer needs an ordinary CSV upload, and the planted row IS read
 * across the owner boundary by the session UI. DEF-48-03 has been corrected rather than left
 * standing.
 *
 * WHY THIS FILE EXISTS RATHER THAN A CELL IN `actions.test.ts`. That suite mocks `@/db` wholesale:
 * `db.query.deals.findMany` is a `vi.fn()` that resolves to whatever the test set, ENTIRELY
 * REGARDLESS of the `where` predicate. A cell there could only assert "the importer asked for this
 * SQL", which is strictly weaker than "the importer did not link A's activity to B's deal" — and
 * this repository has a measured instance of exactly that gap (SEC-48-B: three ownership predicates
 * deleted from `organizations/[id]/route.ts`, 5,237 tests still green). So the predicate is
 * exercised against real PostgreSQL, with two real users and real rows.
 *
 * WHAT IS MOCKED, AND WHY IT IS THE MINIMUM. `@/auth` and `next/cache` only:
 *
 *   - `auth()` reads an Auth.js JWT from request headers, and a server action invoked directly from
 *     a test process has none. Supplying the session is what makes the caller's identity a KNOWN
 *     input rather than an accident. It is NOT the thing under test — `session.user.id` is the
 *     value the new predicate binds, and the assertions are about which ROW comes back for it.
 *   - `revalidatePath` requires a Next.js request scope and throws outside one.
 *
 * `@/db` is NOT mocked. Neither is the formula-recalculation path, the batch inserter, or the audit
 * write. Nothing that decides the outcome under test is substituted.
 *
 * HOW TO RUN IT
 *   docker compose up -d
 *   npx vitest run --config vitest.db.config.ts src/app/import/import-owner-scope.db.test.ts
 *
 * It runs against `pipelite_dedup_test`, never `pipelite` — the guard below re-derives the host AND
 * the database name from the connection string and throws at MODULE SCOPE, so a wrong target aborts
 * collection before any statement is sent. That guard matters more here than in most of these files:
 * this one drives a REAL IMPORT, and `actions.test.ts`'s own header records that "the live database
 * holds ~189k rows of real CRM data and no import is ever run against it".
 * =============================================================================
 */
import { eq, like, or, sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * The session this import runs as. Declared through `vi.hoisted` so the factory below can reach it
 * and so a single cell can switch identity — which the B-side symmetry cell does.
 */
const authState = vi.hoisted(() => ({ userId: "" }))

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: authState.userId } })),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

import { db } from "@/db"
import {
  activities,
  activityTypes,
  auditLog,
  deals,
  pipelines,
  stages,
  users,
} from "@/db/schema"

import { importActivities } from "./actions"

/* ---------------------------------------------------------------------------
 * The environment guard — module scope, so a wrong target aborts collection.
 * ------------------------------------------------------------------------ */

const TEST_DATABASE = "pipelite_dedup_test"
/** The development database, named here only so it can be refused BY NAME. */
const DEV_DATABASE = "pipelite"

function assertIsolatedConnection(connectionString: string | undefined): string {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set for the db vitest project. It is derived from E2E_DATABASE_URL " +
        `by vitest.db.config.ts and must name the isolated ${TEST_DATABASE} database. ` +
        "Run `npm run test:db`, which provisions it first.",
    )
  }

  const url = new URL(connectionString)

  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error(
      `refusing to run: connection host "${url.hostname}" is not loopback. ` +
        "This suite runs a REAL CSV import and hard-deletes its fixtures.",
    )
  }

  const database = url.pathname.replace(/^\//, "")

  if (database !== TEST_DATABASE) {
    throw new Error(
      `refusing to run: connection names database "${database}", not "${TEST_DATABASE}". ` +
        (database === DEV_DATABASE
          ? `"${DEV_DATABASE}" is the DEVELOPMENT database and holds ~189k rows of real CRM data; ` +
            "no import is ever run against it. "
          : "") +
        "Run `npm run test:db`.",
    )
  }

  return connectionString
}

assertIsolatedConnection(process.env.DATABASE_URL)

/* ---------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------ */

/** One prefix on every id. No `_` and no `%`, so no LIKE escaping is needed. */
const PREFIX = "imposcope-"
const LIKE_PREFIX = `${PREFIX}%`

const USER_A = `${PREFIX}user-a`
const USER_B = `${PREFIX}user-b`
const TYPE_ID = `${PREFIX}type-task`
const PIPELINE_A = `${PREFIX}pipeline-a`
const PIPELINE_B = `${PREFIX}pipeline-b`
const STAGE_A = `${PREFIX}stage-a`
const STAGE_B = `${PREFIX}stage-b`

/**
 * The title B owns and A does not. This is the deterministic half of the proof: pre-fix the
 * unscoped scan has exactly ONE candidate, so `find` returns B's row every time rather than
 * whichever row the planner happened to emit first.
 */
const B_ONLY_TITLE = `${PREFIX}Renewal 2026 B only`
/** The title A owns and B does not — the positive anchor. */
const A_ONLY_TITLE = `${PREFIX}Renewal 2026 A only`
/** The title BOTH own. The review's own two-user scenario. */
const SHARED_TITLE = `${PREFIX}Renewal 2026`

const DEAL_B_ONLY = `${PREFIX}deal-b-only`
const DEAL_A_ONLY = `${PREFIX}deal-a-only`
const DEAL_A_SHARED = `${PREFIX}deal-a-shared`
const DEAL_B_SHARED = `${PREFIX}deal-b-shared`

const DUE_DATE = "2026-03-01"

const TOUCHED_TABLES = [
  "users",
  "activity_types",
  "pipelines",
  "stages",
  "deals",
  "activities",
  "audit_log",
] as const

/**
 * How a leftover fixture row is RECOGNISED, per table.
 *
 * `activities` and `audit_log` are the two this file CREATES rows in, and neither carries a
 * prefixed id: the importer generates a UUID per activity and the audit row's entity id is a
 * `crypto.randomUUID()` import-run id. An id-prefix check on either would report zero no matter how
 * many rows leaked — a vacuous half of the assertion that exists to catch a leak. They are
 * recognised by their fixture LINK instead: the owner, and the actor.
 */
const LEFTOVER_PREDICATE: Record<(typeof TOUCHED_TABLES)[number], ReturnType<typeof sql>> = {
  users: sql`id like ${LIKE_PREFIX}`,
  activity_types: sql`id like ${LIKE_PREFIX}`,
  pipelines: sql`id like ${LIKE_PREFIX}`,
  stages: sql`id like ${LIKE_PREFIX}`,
  deals: sql`id like ${LIKE_PREFIX}`,
  activities: sql`id like ${LIKE_PREFIX} or owner_id like ${LIKE_PREFIX} or deal_id like ${LIKE_PREFIX}`,
  audit_log: sql`entity_id like ${LIKE_PREFIX} or actor_user_id like ${LIKE_PREFIX}`,
}

async function countAll(table: string): Promise<number> {
  const rows = await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)}`)

  return Number((rows as unknown as { n: number }[])[0].n)
}

async function countLeftovers(table: (typeof TOUCHED_TABLES)[number]): Promise<number> {
  const rows = await db.execute(
    sql`select count(*)::int as n from ${sql.identifier(table)} where ${LEFTOVER_PREDICATE[table]}`,
  )

  return Number((rows as unknown as { n: number }[])[0].n)
}

/** Only the rows this file's imports created: prefixed OWNER, generated id. */
async function removeImportedActivities(): Promise<void> {
  await db
    .delete(auditLog)
    .where(or(like(auditLog.entityId, LIKE_PREFIX), like(auditLog.actorUserId, LIKE_PREFIX)))
  await db.delete(activities).where(like(activities.ownerId, LIKE_PREFIX))
  await db.delete(activities).where(like(activities.dealId, LIKE_PREFIX))
}

async function removeFixtures(): Promise<void> {
  await removeImportedActivities()
  await db.delete(activities).where(like(activities.id, LIKE_PREFIX))
  await db.delete(deals).where(like(deals.id, LIKE_PREFIX))
  await db.delete(stages).where(like(stages.id, LIKE_PREFIX))
  await db.delete(pipelines).where(like(pipelines.id, LIKE_PREFIX))
  await db.delete(activityTypes).where(like(activityTypes.id, LIKE_PREFIX))
  await db.delete(users).where(like(users.id, LIKE_PREFIX))
}

/* ---------------------------------------------------------------------------
 * Reading the result by direct SQL, never from the action's own summary
 * ------------------------------------------------------------------------ */

interface ImportedActivity {
  id: string
  title: string
  ownerId: string
  dealId: string | null
}

async function importedActivitiesOf(ownerId: string): Promise<ImportedActivity[]> {
  return db
    .select({
      id: activities.id,
      title: activities.title,
      ownerId: activities.ownerId,
      dealId: activities.dealId,
    })
    .from(activities)
    .where(eq(activities.ownerId, ownerId))
}

/** Run the real server action as `userId`. */
async function importAs(
  userId: string,
  rows: Array<{ title: string; dueDate: string; dealTitle?: string }>,
) {
  authState.userId = userId
  return importActivities(rows)
}

/* ---------------------------------------------------------------------------
 * Setup / teardown
 * ------------------------------------------------------------------------ */

/** Totals before the run, re-asserted afterwards: a prefix query cannot see a MUTATED row. */
const baseline: Record<string, number> = {}

beforeAll(async () => {
  // CLEAN FIRST, THEN MEASURE (WR-04): `afterAll` compares against `baseline`, so a run killed
  // after `beforeAll` would otherwise turn itself into a false RED on the next run.
  await removeFixtures()

  for (const table of TOUCHED_TABLES) baseline[table] = await countAll(table)

  await db.insert(users).values([
    { id: USER_A, email: `${PREFIX}a@local.test`, name: "Import A", role: "member", status: "approved" },
    { id: USER_B, email: `${PREFIX}b@local.test`, name: "Import B", role: "member", status: "approved" },
  ])

  // `activities.type_id` is NOT NULL and references this table. It is the only activity type this
  // database has, so `importActivities`'s `types.find(t => t.name === "task") || types[0]` fallback
  // resolves to it deterministically.
  await db.insert(activityTypes).values({ id: TYPE_ID, name: "Task", isDefault: true })

  // `deals.stage_id` is NOT NULL, and a stage needs a pipeline. One per owner, so a deal's whole
  // parent chain belongs to its owner and the fixture describes two genuinely separate identities.
  await db.insert(pipelines).values([
    { id: PIPELINE_A, name: `${PREFIX}pipeline A`, ownerId: USER_A },
    { id: PIPELINE_B, name: `${PREFIX}pipeline B`, ownerId: USER_B },
  ])
  await db.insert(stages).values([
    { id: STAGE_A, pipelineId: PIPELINE_A, name: `${PREFIX}stage A`, position: 1000 },
    { id: STAGE_B, pipelineId: PIPELINE_B, name: `${PREFIX}stage B`, position: 1000 },
  ])
  await db.insert(deals).values([
    { id: DEAL_B_ONLY, title: B_ONLY_TITLE, stageId: STAGE_B, ownerId: USER_B },
    { id: DEAL_A_ONLY, title: A_ONLY_TITLE, stageId: STAGE_A, ownerId: USER_A },
    { id: DEAL_A_SHARED, title: SHARED_TITLE, stageId: STAGE_A, ownerId: USER_A },
    { id: DEAL_B_SHARED, title: SHARED_TITLE, stageId: STAGE_B, ownerId: USER_B },
  ])
}, 60_000)

afterEach(async () => {
  // Each cell imports rows; the next cell's counts have to start from the fixture, not from the
  // previous cell's output.
  await removeImportedActivities()
})

afterAll(async () => {
  await removeFixtures()

  for (const table of TOUCHED_TABLES) {
    expect(await countLeftovers(table)).toBe(0)
    expect(await countAll(table)).toBe(baseline[table])
  }
}, 60_000)

/* ---------------------------------------------------------------------------
 * The harness, asserted rather than assumed
 * ------------------------------------------------------------------------ */

describe("the connection guard — the thing that makes running a REAL import here safe", () => {
  it("refuses the DEVELOPMENT database by name", () => {
    expect(() =>
      assertIsolatedConnection(`postgresql://pipelite:pipelite@localhost:5433/${DEV_DATABASE}`),
    ).toThrow(/refusing to run/)
    expect(() =>
      assertIsolatedConnection(`postgresql://pipelite:pipelite@localhost:5433/${DEV_DATABASE}`),
    ).toThrow(/DEVELOPMENT database/)
  })

  it("refuses a non-loopback host even when the database name is right", () => {
    expect(() =>
      assertIsolatedConnection(`postgresql://u:p@db.example.com:5432/${TEST_DATABASE}`),
    ).toThrow(/not loopback/)
  })

  it("accepts the isolated database this run is actually pointed at", () => {
    expect(assertIsolatedConnection(process.env.DATABASE_URL)).toBe(process.env.DATABASE_URL)
  })
})

describe("the fixture set is what every assertion below assumes", () => {
  it("holds four deals across two owners, with one title owned by BOTH", async () => {
    const rows = await db
      .select({ id: deals.id, title: deals.title, ownerId: deals.ownerId })
      .from(deals)
      .where(like(deals.id, LIKE_PREFIX))

    expect(rows).toHaveLength(4)
    expect(rows.find((r) => r.id === DEAL_B_ONLY)).toEqual({
      id: DEAL_B_ONLY,
      title: B_ONLY_TITLE,
      ownerId: USER_B,
    })
    // THE DISCRIMINATOR for the shared-title cell: two rows, same title, different owners.
    const shared = rows.filter((r) => r.title === SHARED_TITLE)
    expect(shared).toHaveLength(2)
    expect(new Set(shared.map((r) => r.ownerId))).toEqual(new Set([USER_A, USER_B]))
  })

  it("A owns no deal titled like B's exclusive one — which is what makes the refusal below deterministic", async () => {
    // Pre-fix the unscoped scan has exactly ONE candidate for B_ONLY_TITLE, so `find` returns B's
    // row every time. Without this the red would depend on the planner's row order, which is the
    // weakness DEF-48-04 records elsewhere in this milestone.
    const rows = await db
      .select({ id: deals.id })
      .from(deals)
      .where(sql`title = ${B_ONLY_TITLE} and owner_id = ${USER_A}`)

    expect(rows).toEqual([])
  })
})

/* ---------------------------------------------------------------------------
 * CR-03
 * ------------------------------------------------------------------------ */

describe("CR-03 — a CSV import does not link the importer's activity to another owner's deal", () => {
  it("A importing an activity that names a deal ONLY B owns writes deal_id NULL and warns honestly", async () => {
    const result = await importAs(USER_A, [
      { title: `${PREFIX}call about renewal`, dueDate: DUE_DATE, dealTitle: B_ONLY_TITLE },
    ])

    expect(result.success).toBe(true)

    const imported = await importedActivitiesOf(USER_A)

    // FLOOR: the import ran and wrote the row, so the assertion below is about the LINK and not
    // about the action having failed.
    expect(imported).toHaveLength(1)
    expect(imported[0].title).toBe(`${PREFIX}call about renewal`)

    // THE ASSERTION THAT WAS RED: pre-fix this was DEAL_B_ONLY, read by direct SQL rather than
    // from the action's own summary.
    expect(imported[0].dealId).toBeNull()
    expect(imported[0].dealId).not.toBe(DEAL_B_ONLY)

    // AND THE WARNING IS HONEST. Pre-fix a deal WAS found, so this branch was not taken and A was
    // told "imported, 0 warnings" while carrying a foreign foreign key. A silent wrong answer is
    // worse than a loud missing one.
    expect(result.success && result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("not found")]),
    )
  })

  it("THE POSITIVE ANCHOR: A importing an activity that names A's OWN deal still links it, with no warning", async () => {
    // Without this, the cell above is satisfied by an importer that never matches any deal — which
    // would break deal linking on every import for every user.
    const result = await importAs(USER_A, [
      { title: `${PREFIX}call about own renewal`, dueDate: DUE_DATE, dealTitle: A_ONLY_TITLE },
    ])

    expect(result.success).toBe(true)

    const imported = await importedActivitiesOf(USER_A)

    expect(imported).toHaveLength(1)
    expect(imported[0].dealId).toBe(DEAL_A_ONLY)
    expect(result.success && result.warnings).toEqual([])
  })

  it("THE REVIEW'S OWN SCENARIO: with BOTH owners holding a deal titled the same, A gets A's", async () => {
    // "User A and user B each own a deal titled `Renewal 2026`. A uploads a CSV whose activity row
    // has dealTitle = 'Renewal 2026'. `find` returns B's row."
    //
    // HONEST LABEL: this cell is NOT the red-provable half. Pre-fix the outcome is whichever of the
    // two rows the unordered scan emitted first, so it could have gone either way — the same class
    // of planner-dependence DEF-48-04 records. The deterministic red is the B-only cell above.
    // This one pins the post-fix INVARIANT, which is what a reader of the review will look for.
    const result = await importAs(USER_A, [
      { title: `${PREFIX}shared title activity`, dueDate: DUE_DATE, dealTitle: SHARED_TITLE },
    ])

    expect(result.success).toBe(true)

    const imported = await importedActivitiesOf(USER_A)

    expect(imported).toHaveLength(1)
    expect(imported[0].dealId).toBe(DEAL_A_SHARED)
    expect(imported[0].dealId).not.toBe(DEAL_B_SHARED)
    expect(result.success && result.warnings).toEqual([])
  })

  it("B importing the same title gets B's deal — the scope is not A-specific", async () => {
    const result = await importAs(USER_B, [
      { title: `${PREFIX}shared title activity`, dueDate: DUE_DATE, dealTitle: SHARED_TITLE },
    ])

    expect(result.success).toBe(true)

    const imported = await importedActivitiesOf(USER_B)

    expect(imported).toHaveLength(1)
    expect(imported[0].dealId).toBe(DEAL_B_SHARED)
  })

  it("B importing a title only A owns is refused too, in the same direction", async () => {
    const result = await importAs(USER_B, [
      { title: `${PREFIX}b call`, dueDate: DUE_DATE, dealTitle: A_ONLY_TITLE },
    ])

    expect(result.success).toBe(true)

    const imported = await importedActivitiesOf(USER_B)

    expect(imported).toHaveLength(1)
    expect(imported[0].dealId).toBeNull()
    expect(result.success && result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("not found")]),
    )
  })

  it("no imported activity anywhere in the run carries a deal_id its owner does not own", async () => {
    // The cross-cell statement, driven rather than inherited: one import per owner, then a single
    // join that would catch ANY cross-owner link regardless of which cell created it.
    await importAs(USER_A, [
      { title: `${PREFIX}sweep a`, dueDate: DUE_DATE, dealTitle: SHARED_TITLE },
      { title: `${PREFIX}sweep a2`, dueDate: DUE_DATE, dealTitle: B_ONLY_TITLE },
    ])
    await importAs(USER_B, [
      { title: `${PREFIX}sweep b`, dueDate: DUE_DATE, dealTitle: SHARED_TITLE },
      { title: `${PREFIX}sweep b2`, dueDate: DUE_DATE, dealTitle: A_ONLY_TITLE },
    ])

    const crossOwner = await db.execute(
      sql`select a.id, a.owner_id as activity_owner, d.owner_id as deal_owner
            from activities a
            join deals d on d.id = a.deal_id
           where a.owner_id like ${LIKE_PREFIX}
             and d.owner_id <> a.owner_id`,
    )

    expect(Array.from(crossOwner as unknown as unknown[])).toEqual([])

    // FLOOR: the sweep did link SOMETHING, so the empty result above is not "no activity has a
    // deal at all".
    const linked = await db.execute(
      sql`select count(*)::int as n from activities
           where owner_id like ${LIKE_PREFIX} and deal_id is not null`,
    )
    expect(Number((linked as unknown as { n: number }[])[0].n)).toBe(2)
  })
})
