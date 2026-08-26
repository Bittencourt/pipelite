/**
 * =============================================================================
 * trigger-owner-scope.db.test.ts — CR-05, PROVEN BEHAVIOURALLY AND END TO END
 * =============================================================================
 *
 * WHAT WAS OPEN, AND WHY NO ROUTE GUARD COULD HAVE CLOSED IT.
 *
 * `matchAndFireTriggers` (`src/lib/triggers/matcher.ts`) selected
 * `from(workflows).where(eq(workflows.active, true))` with NO owner predicate of any kind, so
 * EVERY active workflow in the deployment fired on EVERY user's CRM write. The victim's row
 * arrives as the TRIGGER, before any node runs, so the CR-02 guard in
 * `src/lib/execution/actions/crm.ts` is not on this path at all — that guard scopes the record a
 * node RESOLVES, and this path resolves nothing.
 *
 * Two `/api/v1` requests and then waiting was the whole exploit:
 *
 *   1. POST /api/v1/workflows  {"name":"x","triggers":[{"type":"crm_event","entity":"deal",
 *                                "action":"updated"}],"nodes":[]}                        -> 201
 *   2. PUT  /api/v1/workflows/{id}  {"active":true}                                      -> 200
 *   3. any other user edits any deal, through the UI or the API.
 *
 * `matchesTrigger` compares only entity and action, and `fieldFilters` defaults to `[]` so the
 * field check is skipped entirely. `payload.data` is the victim's FULL row — every `crmBus.emit`
 * in the mutation layer passes the post-write row, and for a delete `previous` carries it — and
 * `createWorkflowRun` persists that envelope as `workflow_runs.trigger_data`, which
 * `serializeRun` returns VERBATIM to `GET /api/v1/workflows/{id}/runs`. `nodes: []` is enough:
 * the engine marks the run completed without executing anything and the row is already stored.
 *
 * WHAT THE FIX IS, AND WHY IT IS THE RECORD'S OWNER AND NOT THE ACTING USER.
 *
 * The iteration-3 review suggested `eq(workflows.createdBy, payload.userId)`. That is the ACTING
 * user, and it was rejected here for two measured reasons, both of which would have made the fix
 * quietly wrong rather than merely different:
 *
 *   - `payload.userId` is not always a user id. `src/lib/mutations/dedup.ts:672-685` emits
 *     `<entity>.deleted` with `userId: actor?.userId ?? ""`, so scoping on it would silently stop
 *     every merge from firing any trigger for anybody — a legitimate feature lost to a security
 *     fix, with no error anywhere.
 *   - actor and owner genuinely diverge. `src/app/deals/actions.ts:89,161,254,347,445,482` grant
 *     admins a documented bypass, so an admin editing another member's deal emits with the
 *     ADMIN's id; scoping on the actor would stop the OWNER's own automation from firing on the
 *     owner's own record. `src/lib/import/pipedrive-api-import-actions.ts` writes rows owned by
 *     MAPPED users while the actor is the importer, and diverges the same way.
 *
 * So the predicate compares `workflows.createdBy` against the OWNER of the record the event
 * describes, read from that record's own `owner_id` column. All four entities carry
 * `owner_id text NOT NULL`, and every delete in this product is a SOFT delete (the merge loser
 * included — `dedup.ts:485-488`), so the column is readable at match time for every event
 * including the tombstones.
 *
 * WHAT THIS FILE PROVES, AND HOW IT WOULD FAIL.
 *
 *   - A REAL `updateDealMutation` by user B, whose REAL emitted payload is captured off the REAL
 *     `crmBus`, does not create a `workflow_runs` row for user A's active workflow — asserted
 *     both by direct SQL AND from what `GET /api/v1/workflows/{id}/runs` actually serves, through
 *     the real route handler with a real minted API key. The second half matters because
 *     `serializeRun` returns `trigger_data` verbatim and SEC-48-A leaves that route unscoped, so
 *     the table and the response are two separate claims.
 *   - The bus hop itself is exercised: one describe registers the REAL
 *     `registerWorkflowTriggerSubscriber()` and drives real mutations, so the proof covers
 *     `crmBus.emit -> subscriber -> matchAndFireTriggers` and not only the matcher in isolation.
 *   - All four entities, and the DELETE direction, where `data` is `{ id }` and `previous` is the
 *     entire victim's row.
 *   - THE ANTI-VACUITY HALF, in three places, because every assertion above is a negative:
 *       (a) `captureRealEvent` requires EXACTLY ONE event to have been captured, so a mutation
 *           that silently failed cannot masquerade as "nothing leaked";
 *       (b) it asserts the captured envelope CONTAINS the victim's marker, so the thing being
 *           denied is provably present upstream of the matcher;
 *       (c) A's own event MUST produce a run whose served `trigger_data` contains A's marker, and
 *           B's own workflow MUST fire on B's own event — a matcher that fired for nobody would
 *           satisfy every negative in this file and is a different defect wearing the same green.
 *
 * NOTHING IS MOCKED. Real PostgreSQL, real mutations, real `crmBus`, real `withApiAuth`, real
 * route handlers.
 *
 * HOW TO RUN IT
 *   docker compose up -d
 *   npx vitest run --config vitest.db.config.ts src/lib/triggers/trigger-owner-scope.db.test.ts
 *
 * It runs against `pipelite_dedup_test`, never `pipelite`; the module-scope guard below re-derives
 * the host and the database name from the connection string and throws during collection so a
 * wrong target never receives a statement. Fixture discipline is inherited from
 * `crm-ownership.db.test.ts`: one id prefix, a foreign-key-ordered prefixed teardown, and an
 * `afterAll` asserting BOTH zero prefixed leftovers AND that every touched table's total
 * `count(*)` is what it was before the run.
 * =============================================================================
 */
import { eq, like, or, sql } from "drizzle-orm"
import { NextRequest } from "next/server"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { db } from "@/db"
import {
  activities,
  activityTypes,
  apiKeys,
  auditLog,
  deals,
  organizations,
  people,
  pipelines,
  stages,
  users,
  workflowRuns,
  workflows,
} from "@/db/schema"
import { crmBus, type CrmEventName, type CrmEventPayload } from "@/lib/events"
import {
  registerWorkflowTriggerSubscriber,
  _resetForTesting as resetWorkflowTriggerSubscriber,
} from "@/lib/events/subscribers/workflow-trigger"
import {
  deleteDealMutation,
  updateActivityMutation,
  updateDealMutation,
  updateOrganizationMutation,
  updatePersonMutation,
} from "@/lib/mutations"
import { matchAndFireTriggers } from "./matcher"

import { mintApiKey, type MintedApiKey } from "@/app/api/v1/__tests__/api-key-fixture"
import { POST as CREATE_WORKFLOW } from "@/app/api/v1/workflows/route"
import { PUT as UPDATE_WORKFLOW } from "@/app/api/v1/workflows/[id]/route"
import { GET as LIST_RUNS } from "@/app/api/v1/workflows/[id]/runs/route"

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
        "This suite creates and hard-deletes fixture users, API keys, workflows and CRM records.",
    )
  }

  const database = url.pathname.replace(/^\//, "")

  if (database !== TEST_DATABASE) {
    throw new Error(
      `refusing to run: connection names database "${database}", not "${TEST_DATABASE}". ` +
        (database === DEV_DATABASE
          ? `"${DEV_DATABASE}" is the DEVELOPMENT database and holds the operator's real CRM ` +
            "records; this suite hard-deletes its fixtures and must never be pointed at it. "
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
const PREFIX = "trigown-"
const LIKE_PREFIX = `${PREFIX}%`

const USER_A = `${PREFIX}user-a`
const USER_B = `${PREFIX}user-b`
const KEY_A = `${PREFIX}key-a`
const KEY_B = `${PREFIX}key-b`
const TYPE_ID = `${PREFIX}type-task`

const PIPELINE_A = `${PREFIX}pipeline-a`
const PIPELINE_B = `${PREFIX}pipeline-b`
const STAGE_A = `${PREFIX}stage-a`
const STAGE_B = `${PREFIX}stage-b`

const ORG_A = `${PREFIX}org-a`
const ORG_B = `${PREFIX}org-b`
const PERSON_A = `${PREFIX}person-a`
const PERSON_B = `${PREFIX}person-b`
const DEAL_A = `${PREFIX}deal-a`
const DEAL_B = `${PREFIX}deal-b`
const ACT_A = `${PREFIX}act-a`
const ACT_B = `${PREFIX}act-b`

/**
 * The marker that makes "B's row did not reach A" checkable by one string search over the whole
 * served response rather than over the one field the test remembered to look at.
 *
 * Written into `notes` on every record B owns; `notes` is projected by every one of the four
 * event payloads, so it is carried into `trigger_data` wherever the leak exists.
 */
const B_SECRET = `${PREFIX}B-secret`
/** The A-side twin, so the positive anchors assert PRESENCE and not merely a 200. */
const A_SECRET = `${PREFIX}A-secret`

let keyA: MintedApiKey
let keyB: MintedApiKey

/**
 * A's active listening post, and it carries FIVE triggers rather than one.
 *
 * MEASURED, and the reason the array is not `[{deal,updated}]`: with a single `deal.updated`
 * trigger, the delete cell and all three sibling-entity cells below **passed against the unfixed
 * matcher**, because `matchesTrigger` compares `trigger.action` to the event's action and a
 * `deal.updated` trigger simply does not match `deal.deleted` or `activity.updated`. Four cells
 * written to catch an unscoped `select` were green for a reason that had nothing to do with
 * ownership. One workflow that subscribes to every event this file drives is what makes each of
 * them falsifiable.
 */
const A_TRIGGERS = [
  { type: "crm_event", entity: "deal", action: "updated" },
  { type: "crm_event", entity: "deal", action: "deleted" },
  { type: "crm_event", entity: "person", action: "updated" },
  { type: "crm_event", entity: "organization", action: "updated" },
  { type: "crm_event", entity: "activity", action: "updated" },
] as const

let workflowA = ""
/** B's active `deal.updated` workflow — proves the scope narrows rather than disables. */
let workflowB = ""

/** Totals before the run, re-asserted afterwards: a prefix query cannot see a MUTATED row. */
const baseline: Record<string, number> = {}

const TOUCHED_TABLES = [
  "users",
  "api_keys",
  "activity_types",
  "pipelines",
  "stages",
  "organizations",
  "people",
  "deals",
  "activities",
  "workflows",
  "workflow_runs",
  "workflow_run_steps",
  "audit_log",
] as const

/**
 * How a leftover fixture row is RECOGNISED, per table. `workflow_runs`, `workflow_run_steps` and
 * `audit_log` all carry generated UUIDs, so an id-prefix check on those three would report zero
 * however many rows leaked — each is recognised by its fixture LINK instead.
 */
const LEFTOVER_PREDICATE: Record<(typeof TOUCHED_TABLES)[number], ReturnType<typeof sql>> = {
  users: sql`id like ${LIKE_PREFIX}`,
  api_keys: sql`id like ${LIKE_PREFIX}`,
  activity_types: sql`id like ${LIKE_PREFIX}`,
  pipelines: sql`id like ${LIKE_PREFIX}`,
  stages: sql`id like ${LIKE_PREFIX}`,
  organizations: sql`id like ${LIKE_PREFIX}`,
  people: sql`id like ${LIKE_PREFIX}`,
  deals: sql`id like ${LIKE_PREFIX}`,
  activities: sql`id like ${LIKE_PREFIX} or deal_id like ${LIKE_PREFIX}`,
  workflows: sql`id like ${LIKE_PREFIX} or created_by like ${LIKE_PREFIX}`,
  workflow_runs: sql`workflow_id in (select id from workflows where id like ${LIKE_PREFIX} or created_by like ${LIKE_PREFIX})`,
  workflow_run_steps: sql`run_id in (select id from workflow_runs where workflow_id in (select id from workflows where id like ${LIKE_PREFIX} or created_by like ${LIKE_PREFIX}))`,
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
  // Foreign-key order, leaf-first. Audit rows reference both the entity they describe and the
  // user who caused them; run steps reference runs, runs reference workflows.
  await db
    .delete(auditLog)
    .where(or(like(auditLog.entityId, LIKE_PREFIX), like(auditLog.actorUserId, LIKE_PREFIX)))
  await db.execute(
    sql`delete from workflow_run_steps where run_id in (
          select id from workflow_runs where workflow_id in (
            select id from workflows where id like ${LIKE_PREFIX} or created_by like ${LIKE_PREFIX}))`,
  )
  await db.execute(
    sql`delete from workflow_runs where workflow_id in (
          select id from workflows where id like ${LIKE_PREFIX} or created_by like ${LIKE_PREFIX})`,
  )
  await db.execute(
    sql`delete from workflows where id like ${LIKE_PREFIX} or created_by like ${LIKE_PREFIX}`,
  )
  await db.delete(activities).where(like(activities.id, LIKE_PREFIX))
  await db.delete(activities).where(like(activities.dealId, LIKE_PREFIX))
  await db.delete(deals).where(like(deals.id, LIKE_PREFIX))
  await db.delete(stages).where(like(stages.id, LIKE_PREFIX))
  await db.delete(pipelines).where(like(pipelines.id, LIKE_PREFIX))
  await db.delete(people).where(like(people.id, LIKE_PREFIX))
  await db.delete(organizations).where(like(organizations.id, LIKE_PREFIX))
  await db.delete(apiKeys).where(like(apiKeys.id, LIKE_PREFIX))
  await db.delete(activityTypes).where(like(activityTypes.id, LIKE_PREFIX))
  await db.delete(users).where(like(users.id, LIKE_PREFIX))
}

/**
 * PUT EVERY FIXTURE ROW BACK, BEFORE EVERY CELL, and DELETE EVERY RUN.
 *
 * The delete-direction cell soft-deletes B's deal and the update cells rewrite `notes`, so
 * without this the cell order would decide what the next cell measures — the failure
 * `crm-ownership.db.test.ts` measured and documented. Runs are cleared for the same reason in
 * the other direction: every assertion below is a COUNT, and a count that inherits a previous
 * cell's run is not a claim about this cell.
 */
async function restoreFixtures(): Promise<void> {
  await db
    .update(activities)
    .set({ notes: A_SECRET, deletedAt: null })
    .where(eq(activities.id, ACT_A))
  await db
    .update(activities)
    .set({ notes: B_SECRET, deletedAt: null })
    .where(eq(activities.id, ACT_B))

  for (const [table, aId, bId] of [
    [deals, DEAL_A, DEAL_B],
    [people, PERSON_A, PERSON_B],
    [organizations, ORG_A, ORG_B],
  ] as const) {
    await db.update(table).set({ notes: A_SECRET, deletedAt: null }).where(eq(table.id, aId))
    await db.update(table).set({ notes: B_SECRET, deletedAt: null }).where(eq(table.id, bId))
  }

  await db.execute(
    sql`delete from workflow_run_steps where run_id in (
          select id from workflow_runs where workflow_id in (
            select id from workflows where created_by like ${LIKE_PREFIX}))`,
  )
  await db.execute(
    sql`delete from workflow_runs where workflow_id in (
          select id from workflows where created_by like ${LIKE_PREFIX})`,
  )
}

/* ---------------------------------------------------------------------------
 * Driving the real event stream
 * ------------------------------------------------------------------------ */

/**
 * Run a REAL mutation and hand back the REAL payload it emitted on the REAL bus.
 *
 * This is the file's primary anti-vacuity control, and it is deliberately inside the helper
 * every cell must go through rather than repeated per cell:
 *
 *   - EXACTLY ONE event must have been captured. A mutation that returned
 *     `{ success: false }` — a validation slip in the fixture, a soft-deleted row, a renamed
 *     field — emits nothing, and every "no run was created" assertion downstream would then pass
 *     for the wrong reason. `toHaveLength(1)` converts that into a red here instead.
 *   - the returned payload is asserted by the caller to CONTAIN the owner's marker, so the data
 *     whose absence is claimed further down is provably present upstream of the matcher.
 */
async function captureRealEvent(
  eventName: CrmEventName,
  drive: () => Promise<{ success: boolean; error?: string }>,
): Promise<CrmEventPayload> {
  const seen: CrmEventPayload[] = []
  const handler = (payload: CrmEventPayload) => seen.push(payload)

  crmBus.on(eventName, handler as never)
  let result: { success: boolean; error?: string }
  try {
    result = await drive()
  } finally {
    crmBus.off(eventName, handler as never)
  }

  // The mutation's own answer, asserted before the emission: "no event" and "the write was
  // refused" are different failures and must not read the same.
  expect(result.success, `driving mutation failed: ${result.error ?? "(no error)"}`).toBe(true)
  expect(seen).toHaveLength(1)

  return seen[0]
}

async function countRuns(workflowId: string): Promise<number> {
  const rows = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowId, workflowId))

  return rows.length
}

/* ---------------------------------------------------------------------------
 * The real routes
 * ------------------------------------------------------------------------ */

/** `POST /api/v1/workflows` with `crm_event` triggers and an EMPTY node array. */
async function createTriggerWorkflowAs(
  key: MintedApiKey,
  name: string,
  triggers: readonly Record<string, unknown>[],
): Promise<string> {
  const response = await CREATE_WORKFLOW(
    new NextRequest("http://localhost/api/v1/workflows", {
      method: "POST",
      headers: {
        Authorization: key.authorizationHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `${PREFIX}wf-${name}`,
        // The review's exact payload. `nodes: []` is enough: the run row is persisted before any
        // node runs, and `trigger_data` is what leaks.
        triggers,
        nodes: [],
      }),
    }),
  )

  expect(response.status).toBe(201)

  const body = (await response.json()) as { data: { id: string } }

  return body.data.id
}

/** `PUT /api/v1/workflows/{id}` `{"active": true}` — step 2 of the reproduction. */
async function activateWorkflowAs(key: MintedApiKey, id: string): Promise<void> {
  const response = await UPDATE_WORKFLOW(
    new NextRequest(`http://localhost/api/v1/workflows/${id}`, {
      method: "PUT",
      headers: {
        Authorization: key.authorizationHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ active: true }),
    }),
    { params: Promise.resolve({ id }) },
  )

  expect(response.status).toBe(200)
}

/**
 * `GET /api/v1/workflows/{id}/runs` through the REAL handler, returning the REAL response body.
 *
 * This is what the review's step 4 actually reads, and it is a separate claim from the table:
 * `serializeRun` returns `trigger_data` VERBATIM (`src/lib/api/serialize.ts`), so a run row that
 * exists is a row whose whole envelope is served. Asserted from here rather than from the table
 * alone because the requirement is "nothing the API would serve", not "nothing stored".
 */
async function servedRuns(key: MintedApiKey, id: string): Promise<{ raw: string; count: number }> {
  const response = await LIST_RUNS(
    new NextRequest(`http://localhost/api/v1/workflows/${id}/runs`, {
      method: "GET",
      headers: { Authorization: key.authorizationHeader },
    }),
    { params: Promise.resolve({ id }) },
  )

  expect(response.status).toBe(200)

  const body = (await response.json()) as { data: unknown[]; meta: { total: number } }

  // `data` and `meta.total` are both read: a route that served the rows but reported zero, or
  // reported rows it did not serve, would otherwise satisfy half of every assertion below.
  expect(body.data.length).toBe(body.meta.total)

  return { raw: JSON.stringify(body), count: body.data.length }
}

/* ---------------------------------------------------------------------------
 * Setup / teardown
 * ------------------------------------------------------------------------ */

beforeAll(async () => {
  // CLEAN FIRST, THEN MEASURE: `afterAll` compares against `baseline`, so a run killed after
  // `beforeAll` would otherwise convert itself into a false RED on the next run.
  await removeFixtures()

  for (const table of TOUCHED_TABLES) baseline[table] = await countAll(table)

  // NEITHER USER IS AN ADMIN. The matcher has no admin concept either way, but an admin fixture
  // would make the refusals below unfalsifiable for a reason unrelated to the predicate.
  await db.insert(users).values([
    { id: USER_A, email: `${PREFIX}a@local.test`, name: "Trig A", role: "member", status: "approved" },
    { id: USER_B, email: `${PREFIX}b@local.test`, name: "Trig B", role: "member", status: "approved" },
  ])

  keyA = await mintApiKey({ id: KEY_A, userId: USER_A, name: "trigger owner fixture A" })
  keyB = await mintApiKey({ id: KEY_B, userId: USER_B, name: "trigger owner fixture B" })

  await db.insert(activityTypes).values({ id: TYPE_ID, name: "Trig Task", isDefault: false })

  await db.insert(pipelines).values([
    { id: PIPELINE_A, name: `${PREFIX}pipeline A`, ownerId: USER_A },
    { id: PIPELINE_B, name: `${PREFIX}pipeline B`, ownerId: USER_B },
  ])
  await db.insert(stages).values([
    { id: STAGE_A, pipelineId: PIPELINE_A, name: `${PREFIX}stage A`, position: 1000 },
    { id: STAGE_B, pipelineId: PIPELINE_B, name: `${PREFIX}stage B`, position: 1000 },
  ])
  await db.insert(organizations).values([
    { id: ORG_A, name: `${PREFIX}org A`, ownerId: USER_A, notes: A_SECRET },
    { id: ORG_B, name: `${PREFIX}org B`, ownerId: USER_B, notes: B_SECRET },
  ])
  await db.insert(people).values([
    { id: PERSON_A, firstName: "Pa", lastName: `${PREFIX}a`, ownerId: USER_A, notes: A_SECRET },
    { id: PERSON_B, firstName: "Pb", lastName: `${PREFIX}b`, ownerId: USER_B, notes: B_SECRET },
  ])
  // `organizationId` is set on both deals because `updateDealMutation` refuses a deal that would
  // end up with neither an organization nor a person — without it the write under test would
  // fail validation and `captureRealEvent`'s success assertion would name the wrong cause.
  await db.insert(deals).values([
    {
      id: DEAL_A,
      title: `${PREFIX}deal A`,
      stageId: STAGE_A,
      organizationId: ORG_A,
      ownerId: USER_A,
      notes: A_SECRET,
    },
    {
      id: DEAL_B,
      title: `${PREFIX}deal B`,
      stageId: STAGE_B,
      organizationId: ORG_B,
      ownerId: USER_B,
      notes: B_SECRET,
    },
  ])
  await db.insert(activities).values([
    {
      id: ACT_A,
      title: `${PREFIX}act A`,
      typeId: TYPE_ID,
      ownerId: USER_A,
      notes: A_SECRET,
      dueDate: new Date(Date.UTC(2026, 0, 1)),
    },
    {
      id: ACT_B,
      title: `${PREFIX}act B`,
      typeId: TYPE_ID,
      ownerId: USER_B,
      notes: B_SECRET,
      dueDate: new Date(Date.UTC(2026, 0, 2)),
    },
  ])

  // The two requests of the reproduction, through the real routes, once.
  workflowA = await createTriggerWorkflowAs(keyA, "a", A_TRIGGERS)
  await activateWorkflowAs(keyA, workflowA)
  workflowB = await createTriggerWorkflowAs(keyB, "b", [
    { type: "crm_event", entity: "deal", action: "updated" },
  ])
  await activateWorkflowAs(keyB, workflowB)
}, 60_000)

beforeEach(async () => {
  await restoreFixtures()
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

describe("the connection guard — the thing that makes running this file at all safe", () => {
  it("refuses the DEVELOPMENT database by name", () => {
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
    // The anti-vacuity half: a guard that threw on everything would satisfy both refusals above
    // and would also make the suite unrunnable.
    expect(assertIsolatedConnection(process.env.DATABASE_URL)).toBe(process.env.DATABASE_URL)
  })
})

describe("the fixture set and the two activated workflows are what every assertion below assumes", () => {
  it("both workflows exist, are ACTIVE, carry a crm_event trigger, and are owned one per user", async () => {
    const rows = await db
      .select({ id: workflows.id, active: workflows.active, createdBy: workflows.createdBy, triggers: workflows.triggers })
      .from(workflows)
      .where(or(eq(workflows.id, workflowA), eq(workflows.id, workflowB)))

    expect(rows).toHaveLength(2)
    for (const row of rows) {
      // If either were inactive the matcher would skip it for a reason that has nothing to do
      // with ownership, and every negative below would be vacuous.
      expect(row.active).toBe(true)
    }

    // A subscribes to every event this file drives. `fieldFilters: []` is the route's own default,
    // and it is what makes `matchesTrigger` skip the field check entirely — asserted, because a
    // residual field filter would silently prevent A's workflow from ever matching and would turn
    // every refusal below into a vacuous pass.
    expect(rows.find((r) => r.id === workflowA)?.triggers).toEqual(
      A_TRIGGERS.map((t) => ({ ...t, fieldFilters: [] })),
    )
    expect(rows.find((r) => r.id === workflowB)?.triggers).toEqual([
      { type: "crm_event", entity: "deal", action: "updated", fieldFilters: [] },
    ])

    expect(rows.find((r) => r.id === workflowA)?.createdBy).toBe(USER_A)
    expect(rows.find((r) => r.id === workflowB)?.createdBy).toBe(USER_B)
  })

  it("a REAL update of B's deal really does put B's row on the bus — otherwise nothing below is a leak", async () => {
    // THE UPSTREAM CONTROL. Every cell in this file denies that B's row reached A. This one
    // establishes that B's row is in the envelope the matcher receives, so the denial is a claim
    // about the matcher rather than about an event that never carried anything.
    const payload = await captureRealEvent("deal.updated", () =>
      updateDealMutation(DEAL_B, { notes: B_SECRET }, USER_B),
    )

    expect(payload.entity).toBe("deal")
    expect(payload.entityId).toBe(DEAL_B)
    expect(JSON.stringify(payload)).toContain(B_SECRET)
  })
})

/* ---------------------------------------------------------------------------
 * CR-05 — the matcher, driven with REAL captured payloads
 * ------------------------------------------------------------------------ */

describe("CR-05 — B's CRM event does not reach A's active workflow", () => {
  it("B updating B's OWN deal creates no run for A's workflow, and serves A nothing containing B's row", async () => {
    const payload = await captureRealEvent("deal.updated", () =>
      updateDealMutation(DEAL_B, { notes: B_SECRET }, USER_B),
    )
    expect(JSON.stringify(payload)).toContain(B_SECRET)

    await matchAndFireTriggers("deal.updated", payload)

    // (1) THE TABLE. No run row at all for A's workflow.
    expect(await countRuns(workflowA)).toBe(0)

    // (2) WHAT THE API SERVES. A separate claim: `serializeRun` returns `trigger_data` verbatim,
    // so a row that exists is a row whose whole envelope is readable at step 4 of the review's
    // reproduction. Read through the real route with A's real key.
    const served = await servedRuns(keyA, workflowA)
    expect(served.count).toBe(0)
    expect(served.raw).not.toContain(B_SECRET)
  })

  it("B DELETING B's own deal creates no run for A — the tombstone carries `previous`, the whole row", async () => {
    // `data` is `{ id }` on every delete emit site, so `previous` is the entire victim's row and
    // this is the direction where the most leaves the system per event.
    const payload = await captureRealEvent("deal.deleted", () =>
      deleteDealMutation(DEAL_B, USER_B),
    )
    expect(JSON.stringify(payload)).toContain(B_SECRET)

    // A's workflow carries a `deal.deleted` trigger (see `A_TRIGGERS`), so this cell is about the
    // OWNER predicate and not about an action mismatch. Without that trigger it passed against the
    // unfixed matcher.
    await matchAndFireTriggers("deal.deleted", payload)

    expect(await countRuns(workflowA)).toBe(0)
    expect((await servedRuns(keyA, workflowA)).raw).not.toContain(B_SECRET)
  })

  const siblings = [
    {
      entity: "person" as const,
      event: "person.updated" as CrmEventName,
      drive: () => updatePersonMutation(PERSON_B, { firstName: "Pb", lastName: `${PREFIX}b`, notes: B_SECRET }, USER_B),
    },
    {
      entity: "organization" as const,
      event: "organization.updated" as CrmEventName,
      drive: () => updateOrganizationMutation(ORG_B, { name: `${PREFIX}org B`, notes: B_SECRET }, USER_B),
    },
    {
      entity: "activity" as const,
      event: "activity.updated" as CrmEventName,
      drive: () =>
        updateActivityMutation(
          ACT_B,
          { title: `${PREFIX}act B`, typeId: TYPE_ID, dueDate: new Date(Date.UTC(2026, 0, 2)), notes: B_SECRET },
          USER_B,
        ),
    },
  ]

  for (const { entity, event, drive } of siblings) {
    it(`B's ${entity} event reaches no workflow of A's either — all four entities, not just deals`, async () => {
      const payload = await captureRealEvent(event, drive as () => Promise<{ success: boolean; error?: string }>)
      expect(JSON.stringify(payload)).toContain(B_SECRET)

      await matchAndFireTriggers(event, payload)

      expect(await countRuns(workflowA)).toBe(0)
      expect((await servedRuns(keyA, workflowA)).raw).not.toContain(B_SECRET)
    })
  }

  it("THE POSITIVE ANCHOR: A's OWN deal event DOES fire A's workflow, and the run serves A's row", async () => {
    // Without this every assertion above is satisfied by a matcher that fires for nobody, which
    // is a different defect wearing the same green.
    const payload = await captureRealEvent("deal.updated", () =>
      updateDealMutation(DEAL_A, { notes: A_SECRET }, USER_A),
    )

    await matchAndFireTriggers("deal.updated", payload)

    expect(await countRuns(workflowA)).toBe(1)

    const served = await servedRuns(keyA, workflowA)
    expect(served.count).toBe(1)
    expect(served.raw).toContain(A_SECRET)
    expect(served.raw).not.toContain(B_SECRET)
  })

  it("THE SECOND POSITIVE ANCHOR: B's OWN workflow still fires on B's OWN event", async () => {
    // The scope must NARROW the matcher, not disable it — and it must not be written as
    // `createdBy === USER_A`, which the cell above alone would not catch.
    const payload = await captureRealEvent("deal.updated", () =>
      updateDealMutation(DEAL_B, { notes: B_SECRET }, USER_B),
    )

    await matchAndFireTriggers("deal.updated", payload)

    expect(await countRuns(workflowB)).toBe(1)
    expect(await countRuns(workflowA)).toBe(0)

    const servedToB = await servedRuns(keyB, workflowB)
    expect(servedToB.count).toBe(1)
    expect(servedToB.raw).toContain(B_SECRET)
  })
})

/* ---------------------------------------------------------------------------
 * CR-05 — the same claim through the REGISTERED subscriber, end to end
 * ------------------------------------------------------------------------ */

describe("CR-05 — end to end through the real crmBus subscriber, not the matcher in isolation", () => {
  beforeAll(() => {
    // The hop the describe above deliberately skips for determinism:
    // `crmBus.emit` -> `registerWorkflowTriggerSubscriber`'s handler -> `matchAndFireTriggers`.
    // Registered here rather than for the whole file because `_resetForTesting` removes ALL
    // listeners for the thirteen events from the shared bus singleton.
    registerWorkflowTriggerSubscriber()
  })

  afterAll(() => {
    resetWorkflowTriggerSubscriber()
  })

  /**
   * Poll until the workflow has at least one run, returning how many it has when polling stopped.
   *
   * The subscriber's call is FIRE AND FORGET (`matchAndFireTriggers(...).catch(...)`), so there is
   * nothing to await and the negative cannot be read immediately. Used in BOTH polarities:
   *
   *   - as a BARRIER that must succeed (`toBeGreaterThan(0)`), which is what proves the subscriber
   *     actually ran for the event just emitted;
   *   - as the NEGATIVE itself (`toBe(0)` with a shorter budget), which spends the whole budget
   *     giving the leak a chance to appear rather than reading the table once and calling it clean.
   *
   * MEASURED: an earlier shape drove B then A and used A's own run as the barrier. That was a
   * RACE — within one `matchAndFireTriggers` invocation the order in which matching workflows are
   * inserted is not fixed, so `countRuns(workflowA)` read 1 and then became 2, and the cell failed
   * on a later assertion than the one that describes the defect. B's own run is the correct
   * barrier: it is produced by the SAME invocation that would have produced A's.
   */
  async function waitForRun(workflowId: string, timeoutMs = 10_000): Promise<number> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const n = await countRuns(workflowId)
      if (n > 0 || Date.now() > deadline) return n
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }

  it("a real updateDealMutation by B, through the real bus, leaves A's workflow with no run", async () => {
    // No listener of this file's own is attached here — the ONLY thing consuming this emit is the
    // production subscriber registered in `beforeAll`.
    const b = await updateDealMutation(DEAL_B, { notes: B_SECRET }, USER_B)
    expect(b.success).toBe(true)

    // THE ANTI-VACUITY BARRIER, and the thing that must SUCCEED. B's own workflow firing proves
    // the bus reached the subscriber and the subscriber reached the matcher FOR THIS EVENT. If
    // this returns 0 the negative below would be a claim about a pipeline that never ran.
    expect(await waitForRun(workflowB)).toBeGreaterThan(0)

    // THE NEGATIVE, given two full seconds to fail. Pre-fix it returns 1 almost immediately.
    expect(await waitForRun(workflowA, 2_000)).toBe(0)
    expect((await servedRuns(keyA, workflowA)).count).toBe(0)

    // THE A-SIDE ANCHOR, in the same cell and over the same bus: A's own write DOES produce a run
    // for A, so the zero above is a statement about ownership rather than about a dead subscriber.
    const a = await updateDealMutation(DEAL_A, { notes: A_SECRET }, USER_A)
    expect(a.success).toBe(true)
    expect(await waitForRun(workflowA)).toBe(1)

    const served = await servedRuns(keyA, workflowA)
    expect(served.count).toBe(1)
    expect(served.raw).toContain(A_SECRET)
    expect(served.raw).not.toContain(B_SECRET)
  })
})
