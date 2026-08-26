/**
 * =============================================================================
 * stages-scope.db.test.ts — SC-5 AND F3, PROVEN BEHAVIOURALLY
 * =============================================================================
 *
 * WHAT WENT WRONG, IN ONE PARAGRAPH.
 *
 * `GET /api/v1/stages` used to paginate a GLOBAL `stages` page and then enforce ownership in
 * JavaScript. To run that post-filter it collected the page's pipeline ids into a JavaScript array
 * and interpolated that array into a raw SQL membership fragment. `parsePagination`
 * (`src/lib/api/pagination.ts:27`) clamps `offset` at zero and imposes NO ceiling, so any `?offset=`
 * at or past the global stage count produced an EMPTY page, therefore an EMPTY array, therefore the
 * statement text `"pipelines"."id" IN ()` — which PostgreSQL rejects outright,
 * `42601 syntax error at or near ")"`. Measured against the running container: `?offset=73` returned
 * 200 and `?offset=74` returned 500. That is a live availability defect reachable from the public API
 * with ONE query parameter. The second half of the same shape denied legitimate owners: `?limit=5`
 * returned `data: []` beside `meta.total: 1` for the stage's OWN owner, because the page was scoped
 * by nothing while the total twelve lines below was scoped correctly.
 *
 * =============================================================================
 * WHY THIS PROOF IS A REQUEST AND A RESPONSE, AND COULD NOT BE ANYTHING ELSE
 * =============================================================================
 *
 * A TEST THAT SUBSTITUTES A FAKE QUERY BUILDER CANNOT PROVE THIS. The defect was not a wrong
 * predicate that a captured-and-rendered `where` clause would expose; it was a SYNTACTICALLY INVALID
 * STATEMENT. Nothing but a real PostgreSQL parser rejects `IN ()`. A substituted builder resolves to
 * whatever the test told it to resolve to and never parses anything, so under one the broken route
 * and the fixed route are indistinguishable — both "work". (This file therefore substitutes nothing at
 * all: the module-substitution helper does not appear below, and this sentence deliberately does not
 * spell its name, because a counter that requires ZERO occurrences of a token must not be defeated by
 * the prose explaining why it is zero. That collision has fired repeatedly in this repository,
 * including on plan 48-06 of this same phase.)
 *
 * A SOURCE-TEXT ASSERTION CANNOT PROVE IT EITHER, AND THIS IS THE SHARPER POINT. Plan 48-04 closed
 * QG-03 BY DELETION: ownership is now a static join condition, so there is no runtime-sized list to
 * render into the statement and no empty case to guard. A gate written to look for a membership call
 * site in the route would bind to NOTHING — it would report "clean" on the fixed route, on a route
 * that had never been fixed but had merely been reformatted, and on an empty file. 48-CONTEXT forbids
 * proving SC-5 by reading route source for exactly that reason, and this milestone shipped six gates
 * that could not fail, so the prohibition is not decorative.
 *
 * What is left, and what is below: seed a real two-owner dataset, mint two real API keys, drive the
 * real exported `GET` through the real `withApiAuth` against real PostgreSQL, and read the offset out
 * of a live `count(*)` so the boundary cannot decay as the table changes.
 *
 * =============================================================================
 * WHY SC-5 HAD TO BE AMENDED BEFORE IT COULD BE ASSERTED
 * =============================================================================
 *
 * ROADMAP SC-5 originally read: "proven by removing the `stageList` non-empty guard and observing the
 * query still be correct". THERE IS NO SUCH GUARD. `stages/route.ts:69` was `if (!pipelineId)` — the
 * absence of a FILTER PARAMETER, not the non-emptiness of a list. An executor sent looking for that
 * guard can only invent one in order to delete it, or declare the criterion unverifiable. Both are
 * worse than useless, and BACKLOG 999.18, REQUIREMENTS QG-03 and the ROADMAP note all compounded the
 * error by recording the defect as UNREACHABLE.
 *
 * The amended criterion needs no invented ablation, because the negative control is code that
 * actually shipped. Restore the pre-48-04 GET and the request below REJECTS carrying SQLSTATE 42601;
 * put the fix back and it RESOLVES 200 with an empty page. That transcript is captured in this plan's
 * SUMMARY as control F.
 *
 * WHAT THIS FILE DOES NOT CLAIM. Invoked directly, the defective handler REJECTS — it does not return
 * HTTP 500. `withApiAuth` (`src/lib/api/auth.ts:22-77`) has no try/catch, so a database error
 * propagates out of the returned promise and it is Next.js, in the container, that converts it to a
 * 500. The HTTP-level status after a real container rebuild is asserted by plan 48-10, not here.
 *
 * =============================================================================
 * EVERY COUNT HAS A FLOOR
 * =============================================================================
 *
 * "The page is empty because the offset is past the end" is satisfied, trivially, by a table with no
 * stages in it: with zero stages, `offset: 0` is already past the end and the empty response proves
 * nothing whatsoever. So a global-count floor is asserted BEFORE the offset request, and every
 * count assertion below pairs its ceiling with a named-integer floor carrying its own message. The
 * seeded numbers are named constants consumed by BOTH the seed and the assertions, so an assertion
 * can never derive both of its sides from the query it is checking.
 *
 * The discriminator is the INEQUALITY between them: A owns 4 of the 6 seeded stages. If A owned all 6,
 * a completely unscoped query would satisfy the ceiling and this whole file would be vacuous.
 *
 * =============================================================================
 * HOW TO RUN IT, AND WHY IT CANNOT REACH THE REAL DATA
 * =============================================================================
 *
 *   docker compose up -d        # host 5433 -> container 5432, from the repository root
 *   npm run test:db
 *
 * NOT PART OF `npm test` AND NOT PART OF CI, for the reasons `vitest.db.config.ts` spells out: CI has
 * no Docker and no PostgreSQL, `ci` is a required check on the master ruleset, and a required check
 * that never passes makes every pull request unmergeable. The base project excludes the `*.db.test.*`
 * glob and `src/lib/mutations/__tests__/db-test-isolation.test.ts` — which DOES run in CI — asserts
 * that, so this file required ZERO config changes to be picked up.
 *
 * IT DOES NOT RUN AGAINST THE DEVELOPMENT DATABASE AND CANNOT BE MADE TO. `pipelite` holds the
 * operator's real records with the application container running against it. This suite creates users,
 * API keys, pipelines and stages and HARD DELETES them, so it runs against `pipelite_dedup_test`,
 * rebuilt empty by `scripts/dedup-db-test-setup.sh` at the start of every run.
 * `assertIsolatedConnection` below re-derives the host AND the database name from the string it was
 * handed and throws at MODULE SCOPE, so a wrong target aborts COLLECTION and no statement is ever
 * sent.
 *
 * FIXTURE DISCIPLINE, inherited from `queries.db.test.ts` and mirrored from the sibling
 * `activities-scope.db.test.ts`: every row this file touches, it created; every id carries the
 * `stgscope-` prefix; teardown is a prefixed DELETE in foreign-key order (stages before pipelines,
 * api_keys before users); `afterAll` asserts BOTH that zero prefixed rows remain AND that each touched
 * table's total `count(*)` is what it was before the run — the second half is what catches a
 * pre-existing row that was MUTATED rather than created, which a prefix sweep cannot see. `afterAll`
 * runs even when a test throws, which is what keeps control F's deliberately-failing run from leaking
 * fixtures. There is no table-wide wipe and no unfiltered delete anywhere in this file.
 *
 * Static top-level imports only: `src/lib/__tests__/suite-hook-hygiene.test.ts` forbids a lazy module
 * load inside a test body, because it charges the first test that reaches it. That gate does not
 * enumerate `*.db.test.ts`, but the sibling harness is written to the same discipline and consistency
 * is cheaper than a special case. For the same reason nothing here asserts on elapsed time.
 * =============================================================================
 */
import { like, or, sql } from "drizzle-orm"
import { NextRequest } from "next/server"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { db } from "@/db"
import { apiKeys, auditLog, pipelines, stages, users } from "@/db/schema"

import { mintApiKey, type MintedApiKey } from "../__tests__/api-key-fixture"
import { GET } from "./route"

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
        "This suite creates and hard-deletes fixture users, API keys, pipelines and stages.",
    )
  }

  const database = url.pathname.replace(/^\//, "")

  if (database !== TEST_DATABASE) {
    throw new Error(
      `refusing to run: connection names database "${database}", not "${TEST_DATABASE}". ` +
        (database === DEV_DATABASE
          ? `"${DEV_DATABASE}" is the DEVELOPMENT database and holds the operator's real pipelines ` +
            "and stages; this suite hard-deletes its fixtures and must never be pointed at it. "
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
const PREFIX = "stgscope-"
const LIKE_PREFIX = `${PREFIX}%`

const USER_A = `${PREFIX}user-a`
const USER_B = `${PREFIX}user-b`
const KEY_A = `${PREFIX}key-a`
const KEY_B = `${PREFIX}key-b`
const PIPELINE_A = `${PREFIX}pipeline-a`
const PIPELINE_B = `${PREFIX}pipeline-b`

/**
 * THE THREE NUMBERS THIS PROOF TURNS ON, declared once and consumed by BOTH the seed and the
 * assertions so the two cannot drift, and named literals rather than values computed from the query
 * they check — an assertion that derives both of its sides from one source passes on an empty
 * database, which is the exact failure this file exists to rule out.
 *
 * A_OWNED < SEEDED_TOTAL is the discriminator. Were they equal, an unscoped query would satisfy every
 * ceiling below.
 */
const A_OWNED = 4
const B_OWNED = 2
const SEEDED_TOTAL = 6

/**
 * A limit comfortably above A_OWNED, used where the point is "one page holds all of A's stages".
 * `MAX_PAGE_SIZE` is 100, so this is the largest honest value.
 */
const WIDE_LIMIT = 100
/**
 * A page window strictly smaller than A_OWNED, so covering A's own records takes two pages. This is
 * what makes the pagination-window assertion a statement about WHERE the window is applied rather
 * than a restatement of the owner-page assertion.
 */
const PAGE_WINDOW = 2
/** The first page's offset. Named, so the "no hard-coded offset" property holds without exception. */
const FIRST_PAGE_OFFSET = 0
/** Pages needed to cover A's records at PAGE_WINDOW, asserted rather than assumed to be 2. */
const A_PAGE_COUNT = A_OWNED / PAGE_WINDOW
/**
 * The limit the CONTEXT measurement used when it recorded `data: []` beside `meta.total: 1`. Kept at
 * that value so the assertion below is the same request that was measured broken.
 */
const MEASURED_LIMIT = 5
/**
 * The second SC-5 request's offset is `live count * this`, so the proof is not pinned to a boundary
 * that moves with the table. NO OFFSET IN THIS FILE'S CODE IS A HARD-CODED LITERAL: the boundary
 * offset is read from `count(*)` and the far offset is derived from it. The only `?offset=<digit>`
 * strings anywhere below are the two in the header essay, quoting the container transcript that
 * measured the defect — prose, not a request.
 */
const FAR_OFFSET_MULTIPLIER = 1000

const A_STAGE_IDS = Array.from({ length: A_OWNED }, (_, i) => `${PREFIX}stage-a-${i + 1}`)
const B_STAGE_IDS = Array.from({ length: B_OWNED }, (_, i) => `${PREFIX}stage-b-${i + 1}`)
const ALL_STAGE_IDS = [...A_STAGE_IDS, ...B_STAGE_IDS]

/**
 * `stages` is ordered by `position`, and the two owners' positions are INTERLEAVED on purpose.
 *
 * Under the pre-48-04 route the first page of the GLOBAL list is what the caller got, so interleaving
 * is what makes a small fixture reproduce the F3 shape at all: with A at 1000/2000/3000/4000 and B at
 * 1500/2500, the global first five rows are A,B,A,B,A — and A's JavaScript-filtered page holds three
 * of its four stages instead of four. Give both owners contiguous blocks instead and the defect hides.
 *
 * Every value is distinct, so `order by position` is total and the page-window assertion is
 * deterministic rather than dependent on how PostgreSQL breaks a tie.
 */
const A_POSITIONS = [1000, 2000, 3000, 4000]
const B_POSITIONS = [1500, 2500]

const SEED_PLAN: { userId: string; pipelineId: string; ids: string[]; positions: number[] }[] = [
  { userId: USER_A, pipelineId: PIPELINE_A, ids: A_STAGE_IDS, positions: A_POSITIONS },
  { userId: USER_B, pipelineId: PIPELINE_B, ids: B_STAGE_IDS, positions: B_POSITIONS },
]

let keyA: MintedApiKey
let keyB: MintedApiKey

/** Totals before the run, re-asserted afterwards: a prefix query cannot see a MUTATED row. */
const baseline: Record<string, number> = {}

/**
 * `audit_log` is in this list even though a LIST route writes nothing to it. It is written by a
 * SUBSCRIBER rather than by a route, so it is the table a fixture sweep is most likely to forget, and
 * a touched table absent from the baseline set is a hole in the very guarantee `afterAll` exists to
 * give. Its presence here is also asserted for its own sake at the end of this file: a read must not
 * produce an audit entry, and that is checked BEFORE teardown, where it can still fail.
 */
const TOUCHED_TABLES = ["users", "api_keys", "pipelines", "stages", "audit_log"] as const

/**
 * How a leftover fixture row is RECOGNISED, per table.
 *
 * Not a shared `id like 'stgscope-%'`, because `audit_log.id` is a generated UUID — an id-prefix check
 * on that table would report zero no matter how many rows leaked, which is a vacuous half of the very
 * assertion that is supposed to catch a leak. Its fixture link is the entity it describes and the
 * actor it attributes, so those are what get checked.
 */
const LEFTOVER_PREDICATE: Record<(typeof TOUCHED_TABLES)[number], ReturnType<typeof sql>> = {
  users: sql`id like ${LIKE_PREFIX}`,
  api_keys: sql`id like ${LIKE_PREFIX}`,
  pipelines: sql`id like ${LIKE_PREFIX}`,
  stages: sql`id like ${LIKE_PREFIX}`,
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

/** The GLOBAL stage count, straight from SQL. This is what makes an offset "past the end". */
async function globalStageCount(): Promise<number> {
  const rows = await db.execute(sql`select count(*)::int as n from stages`)

  return Number((rows as unknown as { n: number }[])[0].n)
}

async function removeFixtures(): Promise<void> {
  // Foreign-key order, and audit rows first: they reference both the entity they describe and the
  // user who caused them, so they have to go before either. Then stages before pipelines
  // (stages.pipeline_id), and api_keys before users (api_keys.user_id).
  await db
    .delete(auditLog)
    .where(or(like(auditLog.entityId, LIKE_PREFIX), like(auditLog.actorUserId, LIKE_PREFIX)))
  await db.delete(stages).where(like(stages.id, LIKE_PREFIX))
  await db.delete(pipelines).where(like(pipelines.id, LIKE_PREFIX))
  await db.delete(apiKeys).where(like(apiKeys.id, LIKE_PREFIX))
  await db.delete(users).where(like(users.id, LIKE_PREFIX))
}

/* ---------------------------------------------------------------------------
 * Driving the real handler
 * ------------------------------------------------------------------------ */

/**
 * A list request carrying a REAL minted key. There is no context argument and no injected identity:
 * whoever `api_keys.user_id` names is who this request is, decided inside `validateApiKey`.
 */
function listRequest(authorization: string, query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/stages${query}`, {
    headers: { Authorization: authorization },
  })
}

interface ListPayload {
  data: { id: string; pipeline_id: string }[]
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

  // Neither user is an ADMIN: 48-CONTEXT locks owner-only on these routes, and an admin bypass would
  // make the cross-checks below permanently unfalsifiable. `status` is an enum of
  // pending_verification | pending_approval | approved | rejected; `active` does not exist.
  await db.insert(users).values([
    { id: USER_A, email: `${PREFIX}a@local.test`, name: "Stage Scope A", role: "member", status: "approved" },
    { id: USER_B, email: `${PREFIX}b@local.test`, name: "Stage Scope B", role: "member", status: "approved" },
  ])

  keyA = await mintApiKey({ id: KEY_A, userId: USER_A, name: "stage scope fixture A" })
  keyB = await mintApiKey({ id: KEY_B, userId: USER_B, name: "stage scope fixture B" })

  await db.insert(pipelines).values([
    { id: PIPELINE_A, name: `${PREFIX}pipeline A`, ownerId: USER_A },
    { id: PIPELINE_B, name: `${PREFIX}pipeline B`, ownerId: USER_B },
  ])

  // `stages` carries a unique (pipeline_id, name), so the names have to differ within a pipeline.
  const rows = SEED_PLAN.flatMap(({ pipelineId, ids, positions }) =>
    ids.map((id, index) => ({
      id,
      pipelineId,
      name: `${PREFIX}${id}`,
      position: positions[index],
    })),
  )

  // Guarded, and the guard is load-bearing rather than defensive housekeeping: drizzle's
  // `values()` THROWS on an empty array, so a control variant that empties `SEED_PLAN` — which is how
  // the floor below is falsified — would die inside this hook and skip every assertion instead of
  // reddening the one assertion the variant exists to redden. Measured: `Error: values() must be
  // called with at least one value`, 16 tests SKIPPED, which is not a control, it is a crash.
  if (rows.length > 0) {
    await db.insert(stages).values(rows)
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
  it(`holds exactly the ${SEEDED_TOTAL} seeded stages and nothing else under the prefix`, async () => {
    const rows = await db.select({ id: stages.id }).from(stages).where(like(stages.id, LIKE_PREFIX))

    expect(rows.map((r) => r.id).sort()).toEqual([...ALL_STAGE_IDS].sort())
    expect(rows).toHaveLength(SEEDED_TOTAL)
  })

  it("holds exactly 2 pipelines, 2 users and 2 api_keys under the prefix", async () => {
    const pipelineRows = await db
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(like(pipelines.id, LIKE_PREFIX))
    const userRows = await db.select({ id: users.id }).from(users).where(like(users.id, LIKE_PREFIX))
    const keyRows = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(like(apiKeys.id, LIKE_PREFIX))

    expect(pipelineRows.map((r) => r.id).sort()).toEqual([PIPELINE_A, PIPELINE_B].sort())
    expect(userRows.map((r) => r.id).sort()).toEqual([USER_A, USER_B].sort())
    expect(keyRows.map((r) => r.id).sort()).toEqual([KEY_A, KEY_B].sort())
  })

  it(`splits the ${SEEDED_TOTAL} stages ${A_OWNED}/${B_OWNED} across two owners, so an unscoped query cannot pass`, async () => {
    expect(A_OWNED + B_OWNED).toBe(SEEDED_TOTAL)
    // The discriminator, stated as an assertion rather than left as an arithmetic coincidence.
    expect(A_OWNED).not.toBe(SEEDED_TOTAL)
    expect(B_OWNED).not.toBe(SEEDED_TOTAL)

    expect(await sqlIdsOwnedBy(USER_A)).toEqual([...A_STAGE_IDS].sort())
    expect(await sqlIdsOwnedBy(USER_B)).toEqual([...B_STAGE_IDS].sort())
  })
})

describe("authentication through the REAL withApiAuth — nothing on this path is substituted", () => {
  it("a minted key reaches the handler and returns 200", async () => {
    // Asserted, not assumed: everything below depends on it, and if it silently 401'd then every
    // "the page is empty" assertion in this file would pass on an error body.
    const response = await GET(listRequest(keyA.authorizationHeader))

    expect(response.status).toBe(200)
  })

  it("a fabricated Bearer token returns 401", async () => {
    const response = await GET(listRequest("Bearer pk_live_not-a-real-key-at-all"))

    expect(response.status).toBe(401)
  })

  it("no Authorization header at all returns 401", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v1/stages"))

    expect(response.status).toBe(401)
  })

  it("the identity that reaches the route is the key's user, not anything from the request", async () => {
    // A's key and B's key are structurally identical requests to the same URL. The ONLY thing that
    // differs is which row in `api_keys` the digest matches, which is what makes the two responses
    // below a genuine cross-user comparison rather than a parameterised one.
    const asA = await listAs(keyA.authorizationHeader, `?limit=${WIDE_LIMIT}`)
    const asB = await listAs(keyB.authorizationHeader, `?limit=${WIDE_LIMIT}`)

    expect(new Set(asA.data.map((r) => r.pipeline_id))).toEqual(new Set([PIPELINE_A]))
    expect(new Set(asB.data.map((r) => r.pipeline_id))).toEqual(new Set([PIPELINE_B]))
  })
})

/** A direct SQL count of the stages a given owner holds, not routed through anything the route uses. */
async function sqlCountOwnedBy(userId: string): Promise<number> {
  const rows = await db.execute(
    sql`select count(*)::int as n from stages s
        join pipelines p on p.id = s.pipeline_id
        where p.owner_id = ${userId} and p.deleted_at is null`,
  )

  return Number((rows as unknown as { n: number }[])[0].n)
}

/** The stage ids a given owner actually holds in the table, straight from SQL. */
async function sqlIdsOwnedBy(userId: string): Promise<string[]> {
  const rows = await db.execute(
    sql`select s.id from stages s
        join pipelines p on p.id = s.pipeline_id
        where p.owner_id = ${userId} and p.deleted_at is null
        order by s.id`,
  )

  return (rows as unknown as { id: string }[]).map((r) => r.id)
}

/* ---------------------------------------------------------------------------
 * SC-5 (amended) — the offset past the end of the table
 * ------------------------------------------------------------------------ */

describe("SC-5 (amended) — an offset at or past the global stage count resolves 200 with an empty page", () => {
  it("FLOOR: the stages table is not empty, which is what makes 'past the end' mean anything", async () => {
    const count = await globalStageCount()

    expect(
      count,
      "an EMPTY stages table makes the offset-past-the-end proof below vacuous: with zero stages, " +
        "`offset: 0` is already past the end, so the empty page it returns is not evidence that the " +
        "empty-membership defect is gone. This floor is what forces the boundary offset to be a real " +
        "boundary inside a populated table.",
    ).toBeGreaterThan(0)

    // And it is our fixture that populated it, not a leftover from somewhere else.
    expect(count).toBeGreaterThanOrEqual(SEEDED_TOTAL)
  })

  it("THE PROOF: A's request at exactly the global stage count RESOLVES with 200 and an empty page", async () => {
    // The offset is READ FROM THE DATABASE rather than written down. Research recorded the live
    // threshold moving from 74 to 73 as one fixture row came and went; a hard-coded boundary is a
    // test that decays into either a false pass or a false failure the next time the table changes.
    const boundary = await globalStageCount()

    // `.resolves` is the load-bearing word. Before plan 48-04 this exact request REJECTED: the
    // global page came back empty, the derived pipeline-id array came back empty, and the statement
    // that reached PostgreSQL contained an empty membership list, which it refuses to parse
    // (`42601 syntax error at or near ")"`). Invoked directly the failure is a rejected promise
    // rather than an HTTP 500, because `withApiAuth` has no try/catch and it is Next.js that maps a
    // thrown error onto a status; plan 48-10 owns the HTTP-level assertion.
    const payload = await listAs(keyA.authorizationHeader, `?limit=${MEASURED_LIMIT}&offset=${boundary}`)

    expect(payload.data).toEqual([])
    expect(payload.meta.offset).toBe(boundary)
  })

  it("THE PROOF, not pinned to the boundary: a far larger offset resolves the same way", async () => {
    const farOffset = (await globalStageCount()) * FAR_OFFSET_MULTIPLIER
    const payload = await listAs(keyA.authorizationHeader, `?limit=${MEASURED_LIMIT}&offset=${farOffset}`)

    expect(payload.data).toEqual([])
    expect(payload.meta.offset).toBe(farOffset)
  })

  it(`COMPANION: the empty page still reports meta.total ${A_OWNED} — the total did not collapse`, async () => {
    // Without this, "empty page" is indistinguishable from "the caller owns nothing", which is the
    // OTHER way this endpoint used to be wrong (F3). The page is empty because the WINDOW is past the
    // end; the caller's record count is unchanged and is A's own, not the global 6.
    const boundary = await globalStageCount()
    const payload = await listAs(keyA.authorizationHeader, `?limit=${MEASURED_LIMIT}&offset=${boundary}`)

    expect(payload.data).toEqual([])
    expect(payload.meta.total).toBe(A_OWNED)
    expect(payload.meta.total).toBe(await sqlCountOwnedBy(USER_A))
    expect(
      payload.meta.total,
      "a zero total would make the empty page above unremarkable — it has to be non-zero for the " +
        "empty page to be about the offset rather than about the caller owning nothing.",
    ).toBeGreaterThan(0)
    expect(payload.meta.total).not.toBe(SEEDED_TOTAL)
  })

  it("B's key hits the same path independently, so the proof is not a property of one fixture user", async () => {
    const boundary = await globalStageCount()
    const payload = await listAs(keyB.authorizationHeader, `?limit=${MEASURED_LIMIT}&offset=${boundary}`)

    expect(payload.data).toEqual([])
    expect(payload.meta.total).toBe(B_OWNED)
    expect(payload.meta.total).toBeGreaterThan(0)
  })
})

/* ---------------------------------------------------------------------------
 * F3 — the page holds the caller's own stages, and the window lives inside them
 * ------------------------------------------------------------------------ */

describe("F3 — an owner's page holds their own stages and none of the other owner's", () => {
  it(`OWNER PAGE, ceiling: A's ?limit=${MEASURED_LIMIT} returns ${A_OWNED} rows and reports total ${A_OWNED}`, async () => {
    // THE EXACT REQUEST 48-CONTEXT MEASURED BROKEN. Against the pre-48-04 route a stage's own owner
    // got `data: []` beside `meta.total: 1`, because the page was a global window scoped by nothing
    // while the total twelve lines below was scoped correctly.
    const payload = await listAs(keyA.authorizationHeader, `?limit=${MEASURED_LIMIT}`)

    expect(payload.meta.limit).toBeGreaterThan(A_OWNED)
    expect(payload.data).toHaveLength(A_OWNED)
    expect(payload.meta.total).toBe(A_OWNED)
  })

  it(`OWNER PAGE, floor: ${A_OWNED} is greater than zero, so the ceiling above is not satisfied by nothing`, async () => {
    const payload = await listAs(keyA.authorizationHeader, `?limit=${MEASURED_LIMIT}`)

    expect(
      payload.data.length,
      "an empty page satisfies every 'contains no foreign stage' assertion in this block. The floor " +
        "is what makes them mean something: A must actually receive rows.",
    ).toBeGreaterThan(0)
    expect(
      payload.meta.total,
      "a zero total would make the ceiling above a comparison between two zeroes, which is true of " +
        "any broken query and of an empty table alike.",
    ).toBeGreaterThan(0)
  })

  it("PAGE AND TOTAL AGREE: neither is zero, which is the exact combination measured broken", async () => {
    const payload = await listAs(keyA.authorizationHeader, `?limit=${MEASURED_LIMIT}`)

    // `data: []` beside `meta.total: 1` was possible because the two came from DIFFERENT predicates.
    // They now come from one exported expression (`ownedStagesPredicate`), so disagreement is
    // structurally impossible rather than merely unintended — and this asserts the consequence.
    expect(payload.data).not.toHaveLength(0)
    expect(payload.meta.total).not.toBe(0)
    expect(payload.data).toHaveLength(payload.meta.total)
  })

  it(`CROSS-CHECK direction 1: A sees exactly A's ${A_OWNED} ids, none of B's — while B's ${B_OWNED} DO exist`, async () => {
    const payload = await listAs(keyA.authorizationHeader, `?limit=${WIDE_LIMIT}`)
    const returned = payload.data.map((r) => r.id).sort()

    expect(returned).toEqual([...A_STAGE_IDS].sort())
    for (const foreign of B_STAGE_IDS) {
      expect(returned).not.toContain(foreign)
    }

    // The other half of the pair, and the reason the absence above is evidence: B's stages are IN THE
    // TABLE right now, by direct SQL. Without this, "A cannot see B's stages" is equally satisfied by
    // B's stages never having been created.
    const bInTable = await sqlIdsOwnedBy(USER_B)
    expect(bInTable).toEqual([...B_STAGE_IDS].sort())
    expect(bInTable).toHaveLength(B_OWNED)
    expect(bInTable.length, "B owning nothing would make direction 1 vacuous.").toBeGreaterThan(0)
  })

  it(`CROSS-CHECK direction 2: B sees exactly B's ${B_OWNED} ids, none of A's — while A's ${A_OWNED} DO exist`, async () => {
    const payload = await listAs(keyB.authorizationHeader, `?limit=${WIDE_LIMIT}`)
    const returned = payload.data.map((r) => r.id).sort()

    expect(returned).toEqual([...B_STAGE_IDS].sort())
    expect(returned).toHaveLength(B_OWNED)
    for (const foreign of A_STAGE_IDS) {
      expect(returned).not.toContain(foreign)
    }

    const aInTable = await sqlIdsOwnedBy(USER_A)
    expect(aInTable).toEqual([...A_STAGE_IDS].sort())
    expect(aInTable).toHaveLength(A_OWNED)
    expect(aInTable.length, "A owning nothing would make direction 2 vacuous.").toBeGreaterThan(0)
  })

  it("FILTERED PATH, foreign: A asking for B's pipeline gets 404, and the contract is unchanged", async () => {
    const response = await GET(listRequest(keyA.authorizationHeader, `?pipeline_id=${PIPELINE_B}`))

    // 404 rather than 403 is deliberate and pre-existing: an unknown pipeline and a pipeline owned by
    // somebody else are indistinguishable to the caller, which is what keeps the endpoint from
    // confirming the existence of another owner's pipeline.
    expect(response.status).toBe(404)
  })

  it(`FILTERED PATH, own: A asking for A's pipeline gets 200 with total ${A_OWNED}`, async () => {
    // The anti-vacuity anchor for the 404 above: the same caller with their OWN pipeline id is not
    // refused, so the refusal is the ownership check working rather than the filter breaking every
    // request that carries it.
    const payload = await listAs(keyA.authorizationHeader, `?pipeline_id=${PIPELINE_A}`)

    expect(payload.meta.total).toBe(A_OWNED)
    expect(payload.data).toHaveLength(A_OWNED)
    expect(payload.data.map((r) => r.id).sort()).toEqual([...A_STAGE_IDS].sort())
  })

  it(`PAGINATION AFTER AUTHORIZATION: two pages of ${PAGE_WINDOW} cover exactly A's own ${A_OWNED} stages`, async () => {
    // WHAT THIS ASSERTION REPLACES. The route previously applied `offset` and `limit` to a GLOBAL
    // stage list and then discarded foreign rows in JavaScript, so a caller's window could fall
    // entirely outside their own records and return an empty page while `meta.total` reported a
    // non-zero number computed from a different, correctly-scoped query twelve lines below. The
    // window is now applied to a query that is ALREADY scoped, so it moves through the caller's own
    // records and nothing else — which is what these two pages measure.
    //
    // The fixture's interleaved positions are what give this teeth: globally the six stages order
    // A,B,A,B,A,A, so a window taken over the global list would hand A a page containing B's rows to
    // throw away and would short A's page count. Contiguous blocks per owner would hide that.
    expect(A_PAGE_COUNT).toBe(2)

    const first = await listAs(
      keyA.authorizationHeader,
      `?limit=${PAGE_WINDOW}&offset=${FIRST_PAGE_OFFSET}`,
    )
    const second = await listAs(keyA.authorizationHeader, `?limit=${PAGE_WINDOW}&offset=${PAGE_WINDOW}`)

    expect(first.data).toHaveLength(PAGE_WINDOW)
    expect(second.data).toHaveLength(PAGE_WINDOW)

    const firstIds = first.data.map((r) => r.id)
    const secondIds = second.data.map((r) => r.id)

    // Distinct pages, not the same page twice.
    for (const id of secondIds) expect(firstIds).not.toContain(id)

    // And their union is exactly A's seeded set — no foreign stage arrived in either window, and none
    // of A's own stages fell out of the pagination because a foreign row consumed a slot.
    expect([...firstIds, ...secondIds].sort()).toEqual([...A_STAGE_IDS].sort())

    // Both pages report A's own total, not the global 6.
    expect(first.meta.total).toBe(A_OWNED)
    expect(second.meta.total).toBe(A_OWNED)
    expect(first.meta.total).not.toBe(SEEDED_TOTAL)
  })
})

/* ---------------------------------------------------------------------------
 * A read is not an audited event — checked BEFORE teardown, where it can fail
 * ------------------------------------------------------------------------ */

describe("the requests above touched only the tables this file accounts for", () => {
  it("wrote no audit_log row, so the baseline re-assert in afterAll is not covering for one", async () => {
    // `audit_log` is in TOUCHED_TABLES for leak safety, and `removeFixtures` deletes from it — which
    // means the baseline half of `afterAll` would pass even if every read had been audited. This is
    // the assertion that cannot: it runs while any such row would still be there.
    expect(await countLeftovers("audit_log")).toBe(0)
  })
})
