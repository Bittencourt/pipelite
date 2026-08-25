/**
 * =============================================================================
 * activities-scope.db.test.ts — SC-3, PROVEN BEHAVIOURALLY
 * =============================================================================
 *
 * WHY THIS FILE EXISTS, AND WHY THE UNIT TEST BESIDE IT COULD NOT REPLACE IT.
 *
 * `src/app/api/v1/activities/__tests__/route.test.ts` (plan 48-02) asserts that the list route hands
 * the database a predicate naming `owner_id` and binding the caller's id. It does that by RENDERING
 * the captured `where` back to SQL, because the mock DISCARDS it: `db.query.activities.findMany` is
 * a `vi.fn()` that resolves to whatever the test set, entirely regardless of the predicate. That is
 * a COMPILED-STRUCTURE claim — "the route asked for this SQL" — and it is strictly weaker than "the
 * database returned only the caller's rows". Its own doc-comment and its plan's summary both say so
 * and both name this file as the owner of the behavioural proof.
 *
 * This is not a hypothesis about mocks in general; it is the measured in-repo finding SEC-48-B.
 * Research deleted ALL THREE `eq(organizations.ownerId, context.userId)` predicates — GET, PUT and
 * DELETE — from `organizations/[id]/route.ts` and ran the full base suite: 172 files, 5,237 passed,
 * 32 skipped, NOTHING RED. There is a test in that suite literally named "returns 404 … when the
 * organization is not the caller's" and it does not notice the check being removed. A mocked
 * authorization test is how an open hole gets a green tick beside it.
 *
 * So the predicate is exercised against real PostgreSQL, through the REAL `withApiAuth`, with TWO
 * real API keys — which is what 48-CONTEXT requires in as many words: "two distinct users with real
 * API credentials, and the negative case must be a genuine cross-user request — not a mocked-out
 * authorization result. Mocking the check is how a test passes while the route is broken."
 *
 * NOTHING IS MOCKED IN THIS FILE. There is no `vi.mock` anywhere below. `@/lib/api/auth` in
 * particular is NOT mocked: the wrapper is part of what is under test, because `ctx.userId` is the
 * value the scope predicate binds, and a test that supplies that value itself has assumed the answer.
 *
 * =============================================================================
 * WHY THE CRITERION HAD TO BE AMENDED BEFORE IT COULD BE ASSERTED
 * =============================================================================
 *
 * ROADMAP SC-3 originally read: "the row count the list endpoint returns equals a direct SQL count
 * scoped to that owner, on the live dataset." Measured on that live dataset,
 * `select owner_id, count(*) from activities group by 1` returns ONE ROW: all 79,022 activities
 * belong to a single user, who is an admin. For the only user who has any data, a correctly scoped
 * query and a completely unscoped query return the same number — so the original criterion was
 * satisfied TODAY, BY THE BROKEN ROUTE. It could not fail. That is the eleventh gate of this
 * milestone that could not fail, and it was a ROADMAP success criterion.
 *
 * The amended criterion has four named components, and this file asserts all four:
 *
 *   FLOOR         the caller's own count is greater than zero — an EMPTY response must FAIL.
 *                 A counting gate needs a floor as well as a ceiling, or "no foreign rows" is
 *                 satisfied by returning nothing at all.
 *   CEILING       the reported total equals a direct SQL count scoped to that owner.
 *   DISCRIMINATOR the seeded data has TWO owners with rows, and the caller's number is NOT the
 *                 global number — so an unscoped query cannot satisfy the assertion.
 *   CROSS-CHECK   the other owner's rows are proven BY DIRECT SQL to exist, and proven absent from
 *                 this caller's response. Absence alone proves nothing (the query might be broken);
 *                 presence alone proves nothing (the row might be visible to everyone). Only the
 *                 pair is a proof, and it is asserted in BOTH DIRECTIONS.
 *
 * `48-VALIDATION.md` control E is the falsification of this design and is delivered in the plan's
 * SUMMARY: pointed at a single-owner dataset, the discriminator and the floor go red while the
 * CEILING STILL PASSES — the original criterion's vacuity, demonstrated rather than argued.
 *
 * =============================================================================
 * HOW TO RUN IT, AND WHY IT CANNOT REACH THE REAL DATA
 * =============================================================================
 *
 *   docker compose up -d        # host 5433 -> container 5432, from the repository root
 *   npm run test:db
 *
 * NOT PART OF `npm test` AND NOT PART OF CI, for the reasons `vitest.db.config.ts` spells out: CI
 * has no Docker and no PostgreSQL, `ci` is a required check on the master ruleset, and a required
 * check that never passes makes every pull request unmergeable. The base project excludes the
 * `*.db.test.*` glob and `src/lib/mutations/__tests__/db-test-isolation.test.ts` — which DOES run in
 * CI — asserts that, plus that no npm script but `test:db` names this config. This file therefore
 * required ZERO config changes to be picked up.
 *
 * IT DOES NOT RUN AGAINST THE DEVELOPMENT DATABASE AND CANNOT BE MADE TO. `pipelite` holds the
 * operator's real records — 46,054 organizations, 38,348 people, 79,022 activities — with the
 * application container running against it. This suite creates users, API keys and activities and
 * HARD DELETES them, so it runs against `pipelite_dedup_test`, rebuilt empty by
 * `scripts/dedup-db-test-setup.sh` at the start of every run. `assertIsolatedConnection` below
 * re-derives the host AND the database name from the string it was handed and throws at MODULE
 * SCOPE, so a wrong target aborts COLLECTION and no statement is ever sent.
 *
 * Seeding a second owner into `pipelite` to make the assertion discriminate would be a change to the
 * operator's data for a test's convenience. It is forbidden, and this is the mechanism that makes it
 * impossible rather than merely discouraged.
 *
 * FIXTURE DISCIPLINE, inherited from `queries.db.test.ts` and `dedup.db.test.ts`: every row this
 * file touches, it created; every id carries the `actscope-` prefix; teardown is a prefixed DELETE
 * in foreign-key order; `afterAll` asserts BOTH that zero prefixed rows remain AND that each touched
 * table's total `count(*)` is what it was before the run — the second half is what catches a
 * pre-existing row that was MUTATED rather than created, which a prefix sweep cannot see. There is
 * no TRUNCATE, no DROP and no unfiltered DELETE anywhere in this file.
 * =============================================================================
 */
import { createHash } from "node:crypto"

import { and, eq, isNull, like, or, sql } from "drizzle-orm"
import { NextRequest } from "next/server"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { db } from "@/db"
import { activities, activityTypes, apiKeys, auditLog, users } from "@/db/schema"

import { mintApiKey, type MintedApiKey } from "../__tests__/api-key-fixture"
import { GET } from "./route"
import { PUT } from "./[id]/route"

/* ---------------------------------------------------------------------------
 * The environment guard — evaluated at module scope, so a wrong target aborts
 * collection and no test body ever runs.
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
        "This suite creates and hard-deletes fixture users, API keys and activities.",
    )
  }

  const database = url.pathname.replace(/^\//, "")

  if (database !== TEST_DATABASE) {
    throw new Error(
      `refusing to run: connection names database "${database}", not "${TEST_DATABASE}". ` +
        (database === DEV_DATABASE
          ? `"${DEV_DATABASE}" is the DEVELOPMENT database and holds 79,022 real activities; this ` +
            "suite hard-deletes its fixtures and must never be pointed at it. "
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

/** One prefix, on every id. No `_` and no `%`, so no LIKE escaping is needed. */
const PREFIX = "actscope-"
const LIKE_PREFIX = `${PREFIX}%`

const USER_A = `${PREFIX}user-a`
const USER_B = `${PREFIX}user-b`
const KEY_A = `${PREFIX}key-a`
const KEY_B = `${PREFIX}key-b`
const TYPE_ID = `${PREFIX}type-task`

/**
 * THE THREE NUMBERS THIS PROOF TURNS ON, declared once and consumed by BOTH the seed and the
 * assertions, so the two cannot drift. Every one of them is a named literal rather than a value
 * computed from the same query it is checking: an assertion that derives both of its sides from one
 * source passes on an empty database, which is precisely the failure this file exists to rule out.
 *
 * The discriminator is the inequality between them. If A_OWNED were equal to SEEDED_TOTAL, an
 * unscoped query would satisfy the ceiling and the whole file would be vacuous — which is exactly
 * what the live dataset looks like, and why it cannot be used here.
 */
const A_OWNED = 7
const B_OWNED = 3
const SEEDED_TOTAL = 10

const A_ACTIVITY_IDS = Array.from({ length: A_OWNED }, (_, i) => `${PREFIX}act-a-${i + 1}`)
const B_ACTIVITY_IDS = Array.from({ length: B_OWNED }, (_, i) => `${PREFIX}act-b-${i + 1}`)
const ALL_ACTIVITY_IDS = [...A_ACTIVITY_IDS, ...B_ACTIVITY_IDS]

/**
 * SEED_PLAN is the single source of truth for who owns what. Control E (48-VALIDATION) is run by
 * editing THIS and nothing else, so an E-variant transcript describes a change to the data and never
 * an accidental change to an assertion.
 */
const SEED_PLAN: { userId: string; ids: string[] }[] = [
  { userId: USER_A, ids: A_ACTIVITY_IDS },
  { userId: USER_B, ids: B_ACTIVITY_IDS },
]

let keyA: MintedApiKey
let keyB: MintedApiKey

/** Totals before the run, re-asserted afterwards: a prefix query cannot see a MUTATED row. */
const baseline: Record<string, number> = {}

/**
 * `audit_log` is here because it is written by a SUBSCRIBER rather than by the route, so it is the
 * table a fixture sweep is most likely to forget. Research's own live reproduction produced 5
 * `audit_log` rows from 6 requests. Omitting it would let the baseline re-assert pass while rows
 * leaked. `activity_types` is here because the `activities.type_id` foreign key is NOT NULL, so this
 * suite has to create one.
 */
const TOUCHED_TABLES = ["users", "api_keys", "activity_types", "activities", "audit_log"] as const

/**
 * How a leftover fixture row is RECOGNISED, per table.
 *
 * Not a shared `id like 'actscope-%'`, because `audit_log.id` is a generated UUID — an id-prefix
 * check on that table would report zero no matter how many rows leaked, which is a vacuous half of
 * the very assertion that is supposed to catch a leak. Its fixture link is the entity it describes
 * and the actor it attributes, so those are what get checked.
 */
const LEFTOVER_PREDICATE: Record<(typeof TOUCHED_TABLES)[number], ReturnType<typeof sql>> = {
  users: sql`id like ${LIKE_PREFIX}`,
  api_keys: sql`id like ${LIKE_PREFIX}`,
  activity_types: sql`id like ${LIKE_PREFIX}`,
  activities: sql`id like ${LIKE_PREFIX}`,
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

async function removeFixtures(): Promise<void> {
  // Foreign-key order, and audit rows first: they reference both the activity they describe and the
  // user who caused them, so they have to go before either.
  await db
    .delete(auditLog)
    .where(or(like(auditLog.entityId, LIKE_PREFIX), like(auditLog.actorUserId, LIKE_PREFIX)))
  await db.delete(activities).where(like(activities.id, LIKE_PREFIX))
  await db.delete(apiKeys).where(like(apiKeys.id, LIKE_PREFIX))
  await db.delete(activityTypes).where(like(activityTypes.id, LIKE_PREFIX))
  await db.delete(users).where(like(users.id, LIKE_PREFIX))
}

/* ---------------------------------------------------------------------------
 * Driving the real handlers
 * ------------------------------------------------------------------------ */

/**
 * A list request carrying a REAL minted key. There is no context argument and no injected identity:
 * whoever `api_keys.user_id` names is who this request is, decided inside `validateApiKey`.
 */
function listRequest(authorization: string, query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/activities${query}`, {
    headers: { Authorization: authorization },
  })
}

interface ListPayload {
  data: { id: string; owner_id: string }[]
  meta: { total: number; offset: number; limit: number }
}

async function listAs(authorization: string, query = ""): Promise<ListPayload> {
  const response = await GET(listRequest(authorization, query))

  expect(response.status).toBe(200)

  return (await response.json()) as ListPayload
}

/* ---------------------------------------------------------------------------
 * Setup / teardown
 * ------------------------------------------------------------------------ */

beforeAll(async () => {
  for (const table of TOUCHED_TABLES) baseline[table] = await countAll(table)

  // A previous aborted run must not make this one report someone else's rows.
  await removeFixtures()

  // Neither user is an ADMIN. 48-CONTEXT locks owner-only on these routes precisely because the one
  // user holding all 79,022 live activities is an admin — an admin bypass would make this criterion
  // permanently unfalsifiable. `status` is an enum of
  // pending_verification | pending_approval | approved | rejected; `active` does not exist and errors.
  await db.insert(users).values([
    { id: USER_A, email: `${PREFIX}a@local.test`, name: "Scope A", role: "member", status: "approved" },
    { id: USER_B, email: `${PREFIX}b@local.test`, name: "Scope B", role: "member", status: "approved" },
  ])

  keyA = await mintApiKey({ id: KEY_A, userId: USER_A, name: "scope fixture A" })
  keyB = await mintApiKey({ id: KEY_B, userId: USER_B, name: "scope fixture B" })

  // `activities.type_id` is NOT NULL and references this table.
  await db.insert(activityTypes).values({ id: TYPE_ID, name: "Scope Task", isDefault: false })

  const dueBase = Date.UTC(2026, 0, 1)
  const rows = SEED_PLAN.flatMap(({ userId, ids }) =>
    ids.map((id, index) => ({
      id,
      title: `${PREFIX}${id}`,
      typeId: TYPE_ID,
      ownerId: userId,
      dueDate: new Date(dueBase + index * 86_400_000),
    })),
  )

  if (rows.length > 0) {
    await db.insert(activities).values(rows)
  }
}, 60_000)

afterAll(async () => {
  await removeFixtures()

  for (const table of TOUCHED_TABLES) {
    // Half 1: nothing of ours is left.
    expect(await countLeftovers(table)).toBe(0)
    // Half 2: and nothing that was NOT ours changed in number either. This is what catches a
    // pre-existing row that was mutated rather than created — a prefix sweep cannot see one.
    expect(await countAll(table)).toBe(baseline[table])
  }
}, 60_000)

/* ---------------------------------------------------------------------------
 * The harness, asserted rather than assumed
 * ------------------------------------------------------------------------ */

describe("the connection guard — the thing that makes running this file at all safe", () => {
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

  it("refuses an unset connection string", () => {
    expect(() => assertIsolatedConnection(undefined)).toThrow(/DATABASE_URL is not set/)
  })

  it("accepts the isolated database this run is actually pointed at", () => {
    // The anti-vacuity half of the three refusals above: a guard that threw on everything would
    // satisfy them all and would also make the suite unrunnable.
    expect(assertIsolatedConnection(process.env.DATABASE_URL)).toBe(process.env.DATABASE_URL)
  })
})

describe("the fixture set is what every assertion below assumes", () => {
  it(`holds exactly the ${SEEDED_TOTAL} seeded activities and nothing else under the prefix`, async () => {
    const rows = await db
      .select({ id: activities.id })
      .from(activities)
      .where(like(activities.id, LIKE_PREFIX))

    expect(rows.map((r) => r.id).sort()).toEqual([...ALL_ACTIVITY_IDS].sort())
    expect(rows).toHaveLength(SEEDED_TOTAL)
  })

  it("holds exactly 2 users and 2 api_keys under the prefix", async () => {
    const userRows = await db.select({ id: users.id }).from(users).where(like(users.id, LIKE_PREFIX))
    const keyRows = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(like(apiKeys.id, LIKE_PREFIX))

    expect(userRows.map((r) => r.id).sort()).toEqual([USER_A, USER_B].sort())
    expect(keyRows.map((r) => r.id).sort()).toEqual([KEY_A, KEY_B].sort())
  })

  it("stores only the DIGEST of each key, never the key", async () => {
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, KEY_A))

    expect(row.keyHash).toBe(
      // Recomputed here rather than imported from the fixture, so a fixture that stored the
      // plaintext (or a truncated digest) would be caught rather than described. STATIC import:
      // src/lib/__tests__/suite-hook-hygiene.test.ts forbids a dynamic import() in a test body,
      // because a lazy module load inside a timed body charges the first test that reaches it.
      createHash("sha256").update(keyA.plaintextKey).digest("hex"),
    )
    expect(row.keyHash).not.toBe(keyA.plaintextKey)
    expect(row.keyPrefix).toBe(keyA.plaintextKey.slice(0, 12))
    expect(row.deletedAt).toBeNull()
  })
})

describe("authentication through the REAL withApiAuth — no mock anywhere on this path", () => {
  it("a minted key reaches the handler and returns 200", async () => {
    // The first time in this repository that validateApiKey -> checkRateLimit -> runWithActor has
    // been exercised from a test process. It is asserted, not assumed: everything below depends on
    // it, and if it silently 401'd, every "no foreign rows" assertion would pass on an empty body.
    const response = await GET(listRequest(keyA.authorizationHeader))

    expect(response.status).toBe(200)
  })

  it("a fabricated Bearer token returns 401", async () => {
    const response = await GET(listRequest("Bearer pk_live_not-a-real-key-at-all"))

    expect(response.status).toBe(401)
  })

  it("a token without the pk_live_ prefix returns 401", async () => {
    const response = await GET(listRequest("Bearer definitely-not-a-pipelite-key"))

    expect(response.status).toBe(401)
  })

  it("no Authorization header at all returns 401", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/activities"),
    )

    expect(response.status).toBe(401)
  })

  it("the identity that reaches the route is the key's user, not anything from the request", async () => {
    // A's key and B's key are structurally identical requests to the same URL. The ONLY thing that
    // differs is which row in `api_keys` the digest matches, which is what makes the two responses
    // below a genuine cross-user comparison rather than a parameterised one.
    const asA = await listAs(keyA.authorizationHeader)
    const asB = await listAs(keyB.authorizationHeader)

    expect(new Set(asA.data.map((r) => r.owner_id))).toEqual(new Set([USER_A]))
    expect(new Set(asB.data.map((r) => r.owner_id))).toEqual(new Set([USER_B]))
  })
})

/** A direct SQL count, deliberately NOT routed through anything the route also uses. */
async function sqlCountOwnedBy(userId: string): Promise<number> {
  const rows = await db.execute(
    sql`select count(*)::int as n from activities
        where owner_id = ${userId} and deleted_at is null`,
  )

  return Number((rows as unknown as { n: number }[])[0].n)
}

/** The ids a given owner actually holds in the table, straight from SQL. */
async function sqlIdsOwnedBy(userId: string): Promise<string[]> {
  const rows = await db.execute(
    sql`select id from activities
        where owner_id = ${userId} and deleted_at is null order by id`,
  )

  return (rows as unknown as { id: string }[]).map((r) => r.id)
}

/* ---------------------------------------------------------------------------
 * SC-3 — floor, ceiling, discriminator, cross-check
 * ------------------------------------------------------------------------ */

describe("SC-3 (amended) — GET /api/v1/activities returns exactly the caller's own activities", () => {
  it(`CEILING: A's meta.total equals a direct SQL count scoped to A, and that number is ${A_OWNED}`, async () => {
    const payload = await listAs(keyA.authorizationHeader)
    const direct = await sqlCountOwnedBy(USER_A)

    expect(payload.meta.total).toBe(direct)
    // And the named literal, so a half-failed seed reddens here instead of agreeing with itself.
    expect(payload.meta.total).toBe(A_OWNED)
  })

  it("FLOOR: A's own count is greater than zero — an empty response must FAIL, not pass", async () => {
    const payload = await listAs(keyA.authorizationHeader)

    expect(
      payload.meta.total,
      "an empty response proves nothing: every 'contains no foreign row' assertion in this file " +
        "is satisfied by a response containing no rows at all. The floor is what makes them mean " +
        "something.",
    ).toBeGreaterThan(0)
  })

  it(`DISCRIMINATOR 1: A's total is NOT the seeded global total of ${SEEDED_TOTAL}`, async () => {
    // THE ASSERTION THAT WOULD HAVE BEEN RED BEFORE PLAN 48-02'S FIX, and the one the ORIGINAL,
    // unamended criterion could not make: on the live dataset the global total and the owner total
    // are the same number, so the equality above held against the broken route.
    const payload = await listAs(keyA.authorizationHeader)
    const globalRows = await db.execute(
      sql`select count(*)::int as n from activities where id like ${LIKE_PREFIX} and deleted_at is null`,
    )
    const seededGlobal = Number((globalRows as unknown as { n: number }[])[0].n)

    expect(seededGlobal).toBe(SEEDED_TOTAL)
    expect(payload.meta.total).not.toBe(seededGlobal)
    expect(payload.meta.total).toBe(A_OWNED)
  })

  it(`DISCRIMINATOR 2: B's total is ${B_OWNED}, is above the floor, and is not the global total`, async () => {
    const payload = await listAs(keyB.authorizationHeader)
    const direct = await sqlCountOwnedBy(USER_B)

    expect(payload.meta.total).toBe(direct)
    expect(payload.meta.total).toBe(B_OWNED)
    expect(payload.meta.total).toBeGreaterThan(0)
    expect(payload.meta.total).not.toBe(SEEDED_TOTAL)
  })

  it("CROSS-CHECK direction 1: A sees exactly A's ids, none of B's — while B's rows DO exist", async () => {
    const payload = await listAs(keyA.authorizationHeader, "?limit=100")
    const returned = payload.data.map((r) => r.id).sort()

    expect(returned).toEqual([...A_ACTIVITY_IDS].sort())
    for (const foreign of B_ACTIVITY_IDS) {
      expect(returned).not.toContain(foreign)
    }

    // The other half of the pair, and the reason absence above is evidence: B's rows are IN THE
    // TABLE right now, by direct SQL. Without this, "A cannot see B's rows" is equally satisfied by
    // B's rows never having been created.
    expect(await sqlIdsOwnedBy(USER_B)).toEqual([...B_ACTIVITY_IDS].sort())
  })

  it("CROSS-CHECK direction 2: B sees exactly B's ids, none of A's — while A's rows DO exist", async () => {
    const payload = await listAs(keyB.authorizationHeader, "?limit=100")
    const returned = payload.data.map((r) => r.id).sort()

    expect(returned).toEqual([...B_ACTIVITY_IDS].sort())
    for (const foreign of A_ACTIVITY_IDS) {
      expect(returned).not.toContain(foreign)
    }

    expect(await sqlIdsOwnedBy(USER_A)).toEqual([...A_ACTIVITY_IDS].sort())
  })

  it(`PAGE AND TOTAL AGREE: with a limit above ${A_OWNED}, A's data.length is ${A_OWNED} and equals meta.total`, async () => {
    // The F3-shaped failure applied to activities: a route can report a non-zero total while
    // returning an empty page, and a test that only reads `meta.total` would not notice.
    const payload = await listAs(keyA.authorizationHeader, "?limit=100")

    expect(payload.meta.limit).toBeGreaterThan(A_OWNED)
    expect(payload.data).toHaveLength(A_OWNED)
    expect(payload.data).toHaveLength(payload.meta.total)
  })

  it("NARROWING FILTER: A asking for ?owner_id=<B> gets 200 with total 0 and an empty page", async () => {
    // The caller-supplied filter composes UNDER the scope, so it can only narrow within A's own
    // records. If it REPLACED the scope, this would return B's three rows — which is what the
    // pre-48-02 route did.
    const payload = await listAs(keyA.authorizationHeader, `?owner_id=${USER_B}`)

    expect(payload.meta.total).toBe(0)
    expect(payload.data).toHaveLength(0)
    // Its own anti-vacuity anchor: the same caller with their OWN id in the filter is not empty, so
    // the emptiness above is the scope working rather than the filter breaking every query.
    const own = await listAs(keyA.authorizationHeader, `?owner_id=${USER_A}`)
    expect(own.meta.total).toBe(A_OWNED)
  })
})

/* ---------------------------------------------------------------------------
 * Assumption A1 — a real write through the real handler
 * ------------------------------------------------------------------------ */

describe("assumption A1 — a real PUT through the real handler writes only where expected", () => {
  it("A updating A's own activity returns 200 and changes the title", async () => {
    const target = A_ACTIVITY_IDS[0]
    const response = await PUT(
      new NextRequest(`http://localhost/api/v1/activities/${target}`, {
        method: "PUT",
        headers: { Authorization: keyA.authorizationHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ title: `${PREFIX}renamed-by-a` }),
      }),
      { params: Promise.resolve({ id: target }) },
    )

    expect(response.status).toBe(200)

    const body = (await response.json()) as { data: { id: string; title: string; owner_id: string } }
    expect(body.data.id).toBe(target)
    expect(body.data.title).toBe(`${PREFIX}renamed-by-a`)
    expect(body.data.owner_id).toBe(USER_A)
    // Whatever side effects this write had — the crmBus emit above all — are confined to the tables
    // in TOUCHED_TABLES, which `afterAll`'s baseline re-assert proves table by table.
  })

  it("B attempting the same write on A's activity is refused with 403 and changes nothing", async () => {
    const target = A_ACTIVITY_IDS[1]
    const before = await db.select().from(activities).where(eq(activities.id, target))

    const response = await PUT(
      new NextRequest(`http://localhost/api/v1/activities/${target}`, {
        method: "PUT",
        headers: { Authorization: keyB.authorizationHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "HIJACKED BY B" }),
      }),
      { params: Promise.resolve({ id: target }) },
    )

    expect(response.status).toBe(403)

    const after = await db.select().from(activities).where(eq(activities.id, target))
    expect(after[0].title).toBe(before[0].title)
    expect(after[0].ownerId).toBe(USER_A)
    expect(after[0].updatedAt.getTime()).toBe(before[0].updatedAt.getTime())
  })

  it("the list A reads afterwards still holds exactly A's seven, so the writes above leaked nothing", async () => {
    const payload = await listAs(keyA.authorizationHeader, "?limit=100")

    expect(payload.meta.total).toBe(A_OWNED)
    expect(payload.data.map((r) => r.id).sort()).toEqual([...A_ACTIVITY_IDS].sort())

    // And the count the route reports still agrees with SQL, after a real write went through.
    expect(await sqlCountOwnedBy(USER_A)).toBe(A_OWNED)
    expect(
      await db
        .select({ id: activities.id })
        .from(activities)
        .where(and(like(activities.id, LIKE_PREFIX), isNull(activities.deletedAt))),
    ).toHaveLength(SEEDED_TOTAL)
  })
})
