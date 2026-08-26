/**
 * =============================================================================
 * crm-ownership.db.test.ts — CR-02, PROVEN BEHAVIOURALLY
 * =============================================================================
 *
 * WHAT IS UNDER TEST, AND WHY IT IS NOT A ROUTE TEST.
 *
 * Phase 48's goal is that every `/api/v1` route which reads or writes a record decides, PER
 * RECORD, whether this caller may. The four route files the phase changed now do. The workflow
 * engine does not go through them: `POST /api/v1/workflows/{id}/run` hands a caller-authored node
 * config to `handleCrmAction`, which resolves a target id itself and calls the mutation layer
 * directly. So there is a second door into the same records on the same authenticated surface, and
 * a route-level guard cannot close it — the engine IS the caller.
 *
 * The iteration-2 code review (CR-02) reproduced it in three ordinary requests with one API key:
 *
 *   1. POST /api/v1/workflows      nodes: [{ type: "action", config: { actionType: "crm_action",
 *                                    entity: "activity", operation: "update", targetId: "<victim>",
 *                                    fieldMapping: {} } }]                              -> 201
 *   2. PUT  /api/v1/workflows/{id} { "active": true }                                   -> 200
 *   3. POST /api/v1/workflows/{id}/run                                                  -> 201
 *
 * `nodes` is `z.array(z.record(z.string(), z.unknown()))` on both write routes, so the config is
 * verbatim caller input. `resolveTargetId` took `config.targetId` unvalidated, or ran
 * `ilike(activities.title, lookupValue)` with NO owner predicate — `lookupValue: "%"` needs no id
 * knowledge at all. `updateActivityMutation` / `deleteActivityMutation` then checked only that the
 * row EXISTS and is not soft-deleted; neither compared `activity.ownerId` to the `userId` argument
 * it was handed. The emitted `activity.updated` payload carries `data` and `previous` as the
 * victim's FULL row, which the webhook subscriber delivers to whatever endpoint the caller
 * registered through `POST /api/v1/webhooks`.
 *
 * WHY THE FIX IS IN `crm.ts` AND NOT IN THE MUTATION LAYER.
 *
 * The review's suggested fix was `eq(activities.ownerId, userId)` inside the mutations. That is
 * wrong here, and measurably so: `src/lib/bulk/dispatch.ts:20-34` records that the per-entity
 * ownership predicate is ASYMMETRIC — `src/app/deals/actions.ts:89,161,254,347,445,482` all read
 * `deal.ownerId !== session.user.id && session.user.role !== "admin"`, so an ADMIN legitimately
 * updates and deletes deals they do not own, and `deleteDealMutation` is reached with
 * `userId = <the admin>`. Adding an owner predicate to that mutation's existence check would turn
 * a supported admin action into "Deal not found". The mutation layer's contract in this codebase
 * is "entity existence and nothing more" (Phase 24 layering, restated in `dispatch.ts`), and
 * changing that contract is Phase 49's subject (SEC-04/DATA-01/DATA-02), not a review-fix edit.
 *
 * The workflow engine has no admin concept and no second caller class: `context._workflowUserId`
 * is `workflow.createdBy` (`src/lib/execution/engine.ts:165`, pinned by
 * `engine.test.ts:1076`), i.e. exactly the API key's user. So the boundary that can decide per
 * record is `handleCrmAction`'s target resolution, and that is where the guard went.
 *
 * WHAT THIS FILE PROVES.
 *
 *   - The three-request path above, driven through the REAL route handlers with a REAL minted API
 *     key and then executed by the REAL engine, does not read, write or emit the victim's row.
 *   - The `targetId` branch and the `lookupField`/`lookupValue` branch are both closed, and the
 *     lookup is closed at the QUERY (not after the fact), so a title probe cannot even establish
 *     that another owner's record exists.
 *   - All FOUR entities the handler reaches are closed, not only activities: `deal`, `person`,
 *     `organization` and `activity` each have their own `mutationMap` entry and their own mutation
 *     helper, and each of those helpers checks existence only.
 *   - Every refusal has a POSITIVE ANCHOR beside it: the same request, for the caller's own
 *     record, still succeeds and still emits. Without that half, every assertion here is
 *     satisfied by a handler that refuses everything, which is a different defect wearing the
 *     same exception.
 *
 * NOTHING IS MOCKED. Real PostgreSQL, real mutations, real `crmBus`, real `withApiAuth`. The one
 * thing this file attaches to the process is a `crmBus` listener, which is how "NOT emitted" is
 * measured — `registerAuditSubscriber()` is never called in the db vitest project (DEF-48 IN-03),
 * so the bus has no other listeners and a captured event is unambiguously this run's.
 *
 * HOW TO RUN IT
 *   docker compose up -d
 *   npx vitest run --config vitest.db.config.ts src/lib/execution/actions/crm-ownership.db.test.ts
 *
 * It runs against `pipelite_dedup_test`, never `pipelite`. The guard below re-derives the host and
 * the database name from the connection string and throws at MODULE SCOPE, so a wrong target
 * aborts collection and no statement is ever sent. Fixture discipline is inherited verbatim from
 * `activities-scope.db.test.ts`: one id prefix, a foreign-key-ordered prefixed teardown, and an
 * `afterAll` that asserts BOTH zero prefixed leftovers AND that every touched table's total
 * `count(*)` is what it was before the run — the second half is what catches a pre-existing row
 * that was MUTATED rather than created, which a prefix sweep cannot see.
 * =============================================================================
 */
import { and, eq, like, or, sql } from "drizzle-orm"
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
  workflowRunSteps,
} from "@/db/schema"
import { crmBus, type CrmEventName, type CrmEventPayload } from "@/lib/events"
import { executeRun } from "@/lib/execution/engine"

import { mintApiKey, type MintedApiKey } from "@/app/api/v1/__tests__/api-key-fixture"
import { POST as CREATE_WORKFLOW } from "@/app/api/v1/workflows/route"
import { PUT as UPDATE_WORKFLOW } from "@/app/api/v1/workflows/[id]/route"
import { POST as RUN_WORKFLOW } from "@/app/api/v1/workflows/[id]/run/route"
import { executeAction } from "."

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
const PREFIX = "crmown-"
const LIKE_PREFIX = `${PREFIX}%`

const USER_A = `${PREFIX}user-a`
const USER_B = `${PREFIX}user-b`
const KEY_A = `${PREFIX}key-a`
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
 * The marker that makes "not emitted" and "not read" checkable by a single string search.
 *
 * Written into a column every one of the four serializers and every one of the four event payloads
 * projects (`notes`), on EVERY record owned by B. An assertion that the caller's response and the
 * captured events do not contain it is therefore a claim about the whole payload rather than about
 * the one field the test remembered to look at.
 */
const B_SECRET = `${PREFIX}B-secret`
/** The A-side twin, so the positive anchors can assert PRESENCE and not merely a 200. */
const A_SECRET = `${PREFIX}A-secret`

/** B's activity title, unique enough that an `ilike` probe for it matches nothing else. */
const ACT_B_TITLE = `${PREFIX}victim-activity-title`
const ACT_A_TITLE = `${PREFIX}own-activity-title`

let keyA: MintedApiKey

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
 * How a leftover fixture row is RECOGNISED, per table.
 *
 * Not a shared `id like 'crmown-%'`: `workflow_runs.id`, `workflow_run_steps.id` and `audit_log.id`
 * are all generated UUIDs, so an id-prefix check on those three would report zero no matter how
 * many rows leaked — a vacuous half of the very assertion that exists to catch a leak. Each is
 * recognised by its fixture LINK instead.
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
  // Foreign-key order, leaf-first. Audit rows reference both the entity they describe and the user
  // who caused them, so they go before either; run steps reference runs, runs reference workflows.
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
  // `activities.deal_id` -> `deals`, `deals.stage_id` -> `stages`, `stages.pipeline_id` ->
  // `pipelines`, `deals.person_id` -> `people`, `people.organization_id` -> `organizations`.
  // Reversing any two of these lines is a `23503` at teardown, not a silent leak.
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

/* ---------------------------------------------------------------------------
 * Capturing the emission half
 * ------------------------------------------------------------------------ */

const ALL_CRM_EVENTS: CrmEventName[] = [
  "deal.created",
  "deal.updated",
  "deal.deleted",
  "deal.stage_changed",
  "person.created",
  "person.updated",
  "person.deleted",
  "organization.created",
  "organization.updated",
  "organization.deleted",
  "activity.created",
  "activity.updated",
  "activity.deleted",
]

interface CapturedEvent {
  name: CrmEventName
  payload: CrmEventPayload
}

let captured: CapturedEvent[] = []
const listeners: { name: CrmEventName; handler: (p: CrmEventPayload) => void }[] = []

/**
 * PUT EVERY FIXTURE ROW BACK, BEFORE EVERY CELL — and this is not tidiness, it is what stops the
 * file lying about itself.
 *
 * MEASURED. Run against the UNFIXED handler, the first cell ("by targetId") renames B's activity
 * to `crmown-pwned`, which is the defect. The second cell ("by TITLE LOOKUP") then probes for
 * `crmown-victim-activity-title`, finds nothing, gets a legitimate "No activity found", and
 * **PASSES** — a cell that exists to catch the unscoped `ilike` reported GREEN against the very
 * code it was written to fail on, because an earlier cell had already destroyed its fixture. That
 * is this milestone's signature failure with the polarity flipped, and it was found by running the
 * file red before trusting it.
 *
 * Restoring by direct SQL, not through a mutation: the mutations are what is under test.
 *
 * `ownerId` IS RESTORED TOO, AND IT WAS NOT UNTIL CR-04 — MEASURED, in the same way and for the
 * same reason as the paragraph above. CR-04's second cell drives
 * `fieldMapping: { ownerId: <USER_B> }` at DEAL_A, and against the UNFIXED handler that cell does
 * not merely fail: it SUCCEEDS, and DEAL_A becomes B's. Every subsequent cell in the describe then
 * threw `No deal found with id 'crmown-deal-a'` from `assertCallerOwnsTarget` — including the
 * positive anchors, whose job is to prove the handler still works. Five cascaded reds for one
 * defect, and the positive anchors reporting the wrong cause. A restore that covers the fields a
 * cell WRITES but not the field a cell TRANSFERS is not a restore.
 */
async function restoreFixtureRows(): Promise<void> {
  await db
    .update(activities)
    .set({ title: ACT_A_TITLE, notes: A_SECRET, deletedAt: null, ownerId: USER_A })
    .where(eq(activities.id, ACT_A))
  await db
    .update(activities)
    .set({ title: ACT_B_TITLE, notes: B_SECRET, deletedAt: null, ownerId: USER_B })
    .where(eq(activities.id, ACT_B))

  for (const [table, aId, bId] of [
    [deals, DEAL_A, DEAL_B],
    [people, PERSON_A, PERSON_B],
    [organizations, ORG_A, ORG_B],
  ] as const) {
    await db
      .update(table)
      .set({ notes: A_SECRET, deletedAt: null, ownerId: USER_A })
      .where(eq(table.id, aId))
    await db
      .update(table)
      .set({ notes: B_SECRET, deletedAt: null, ownerId: USER_B })
      .where(eq(table.id, bId))
  }
}

beforeEach(async () => {
  await restoreFixtureRows()

  captured = []
  for (const name of ALL_CRM_EVENTS) {
    const handler = (payload: CrmEventPayload) => captured.push({ name, payload })
    // `as never` only because `deal.stage_changed` narrows the payload; the handler reads the
    // common fields and the capture is deliberately untyped-wide.
    crmBus.on(name, handler as never)
    listeners.push({ name, handler })
  }
})

afterEach(() => {
  for (const { name, handler } of listeners) crmBus.off(name, handler as never)
  listeners.length = 0
})

/* ---------------------------------------------------------------------------
 * Reading the truth by direct SQL, never from a handler's own answer
 * ------------------------------------------------------------------------ */

async function sqlActivity(id: string): Promise<{ title: string; deletedAt: Date | null } | undefined> {
  const rows = await db
    .select({ title: activities.title, deletedAt: activities.deletedAt })
    .from(activities)
    .where(eq(activities.id, id))

  return rows[0]
}

async function sqlNotes(
  table: typeof deals | typeof people | typeof organizations,
  id: string,
): Promise<string | null | undefined> {
  const rows = await db.select({ notes: table.notes }).from(table).where(eq(table.id, id))

  return rows[0]?.notes
}

async function sqlDeletedAt(
  table: typeof deals | typeof people | typeof organizations,
  id: string,
): Promise<Date | null | undefined> {
  const rows = await db.select({ deletedAt: table.deletedAt }).from(table).where(eq(table.id, id))

  return rows[0]?.deletedAt
}

/* ---------------------------------------------------------------------------
 * Driving the engine
 * ------------------------------------------------------------------------ */

/**
 * Run ONE `crm_action` node the way the engine runs it, with the identity the engine derives.
 *
 * `_workflowUserId` is the only identity input, and `engine.ts:165` sets it from
 * `workflow.createdBy` — so supplying it here is supplying exactly what the engine would, and
 * `engine.test.ts:1076` is what pins that line. The end-to-end describe below does not take this
 * shortcut; it goes through the three real routes.
 */
function runNode(
  config: Record<string, unknown>,
  workflowUserId: string,
): Promise<{ output: Record<string, unknown> }> {
  return executeAction(
    "crm_action",
    { actionType: "crm_action", ...config },
    { trigger: { type: "manual", data: {} }, nodes: {}, _workflowUserId: workflowUserId },
    `${PREFIX}run-inline`,
  )
}

/* ---------------------------------------------------------------------------
 * Setup / teardown
 * ------------------------------------------------------------------------ */

beforeAll(async () => {
  // CLEAN FIRST, THEN MEASURE (WR-04): `afterAll` compares against `baseline`, so a run killed
  // after `beforeAll` would otherwise convert itself into a false RED on the next run.
  await removeFixtures()

  for (const table of TOUCHED_TABLES) baseline[table] = await countAll(table)

  // Neither user is an admin. The engine has no admin bypass, and giving one to a fixture user
  // would make the refusals below unfalsifiable for the wrong reason.
  await db.insert(users).values([
    { id: USER_A, email: `${PREFIX}a@local.test`, name: "Crm A", role: "member", status: "approved" },
    { id: USER_B, email: `${PREFIX}b@local.test`, name: "Crm B", role: "member", status: "approved" },
  ])

  keyA = await mintApiKey({ id: KEY_A, userId: USER_A, name: "crm ownership fixture A" })

  await db.insert(activityTypes).values({ id: TYPE_ID, name: "Crm Task", isDefault: false })

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
  // end up with neither an organization nor a person — without it the refusal under test would be
  // masked by a validation failure that looks identical from the outside.
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
      title: ACT_A_TITLE,
      typeId: TYPE_ID,
      ownerId: USER_A,
      notes: A_SECRET,
      dueDate: new Date(Date.UTC(2026, 0, 1)),
    },
    {
      id: ACT_B,
      title: ACT_B_TITLE,
      typeId: TYPE_ID,
      ownerId: USER_B,
      notes: B_SECRET,
      dueDate: new Date(Date.UTC(2026, 0, 2)),
    },
  ])
}, 60_000)

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
    // The anti-vacuity half: a guard that threw on everything would satisfy both refusals above
    // and would also make the suite unrunnable.
    expect(assertIsolatedConnection(process.env.DATABASE_URL)).toBe(process.env.DATABASE_URL)
  })
})

describe("the fixture set is what every assertion below assumes", () => {
  it("holds one record per entity per owner, with B's marker stored", async () => {
    expect(await sqlActivity(ACT_B)).toEqual({ title: ACT_B_TITLE, deletedAt: null })
    expect(await sqlActivity(ACT_A)).toEqual({ title: ACT_A_TITLE, deletedAt: null })
    expect(await sqlNotes(deals, DEAL_B)).toBe(B_SECRET)
    expect(await sqlNotes(people, PERSON_B)).toBe(B_SECRET)
    expect(await sqlNotes(organizations, ORG_B)).toBe(B_SECRET)
    expect(await sqlNotes(deals, DEAL_A)).toBe(A_SECRET)
  })

  it("the bus listener this file attaches actually captures — otherwise every 'not emitted' is vacuous", async () => {
    // THE ANTI-VACUITY CONTROL FOR THE WHOLE EMISSION HALF. Every refusal below asserts
    // `captured` is empty. If the listener were never wired, or `crmBus` were a different
    // singleton in this module graph than in the mutation modules', all of those would pass
    // against a route that emitted the victim's row to every webhook subscriber in the database.
    // This drives a legitimate write and requires the capture to be non-empty.
    await runNode(
      { entity: "activity", operation: "update", targetId: ACT_A, fieldMapping: { notes: A_SECRET } },
      USER_A,
    )

    expect(captured.map((e) => e.name)).toContain("activity.updated")
    expect(JSON.stringify(captured)).toContain(A_SECRET)
  })
})

/* ---------------------------------------------------------------------------
 * CR-02 — the review's own three-request reproduction, end to end
 * ------------------------------------------------------------------------ */

/** `POST /api/v1/workflows` with a caller-authored node array. Returns the new workflow id. */
async function createWorkflowAs(node: Record<string, unknown>): Promise<string> {
  const response = await CREATE_WORKFLOW(
    new NextRequest("http://localhost/api/v1/workflows", {
      method: "POST",
      headers: {
        Authorization: keyA.authorizationHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: `${PREFIX}wf`, nodes: [node] }),
    }),
  )

  // 201 is asserted, not assumed: a 422 here would make every assertion downstream vacuous.
  expect(response.status).toBe(201)

  const body = (await response.json()) as { data: { id: string } }

  return body.data.id
}

/** `PUT /api/v1/workflows/{id}` `{"active": true}` — step 2 of the reproduction. */
async function activateWorkflowAs(id: string): Promise<void> {
  const response = await UPDATE_WORKFLOW(
    new NextRequest(`http://localhost/api/v1/workflows/${id}`, {
      method: "PUT",
      headers: {
        Authorization: keyA.authorizationHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ active: true }),
    }),
    { params: Promise.resolve({ id }) },
  )

  expect(response.status).toBe(200)
}

/**
 * `POST /api/v1/workflows/{id}/run`, then execute the run the way the processor does.
 *
 * The route only INSERTS a pending run (`triggerManualRun` -> `createWorkflowRun`); the execution
 * processor is what picks it up. `executeRun` is that step, called directly so the assertion does
 * not depend on a poll interval. Returns the run row so its terminal status and error are
 * assertable.
 */
async function runWorkflowAs(id: string): Promise<{ status: string; error: string | null }> {
  const response = await RUN_WORKFLOW(
    new NextRequest(`http://localhost/api/v1/workflows/${id}/run`, {
      method: "POST",
      headers: { Authorization: keyA.authorizationHeader },
    }),
    { params: Promise.resolve({ id }) },
  )

  expect(response.status).toBe(201)

  const body = (await response.json()) as { data: { run_id: string } }

  await executeRun(body.data.run_id)

  const rows = await db
    .select({ status: workflowRuns.status, error: workflowRuns.error })
    .from(workflowRuns)
    .where(eq(workflowRuns.id, body.data.run_id))

  return rows[0] as { status: string; error: string | null }
}

describe("CR-02 — POST /workflows -> PUT {active:true} -> POST /run cannot touch another owner's activity", () => {
  it("A's workflow aimed at B's activity by targetId fails the run, and B's row is untouched and unemitted", async () => {
    const before = await sqlActivity(ACT_B)

    const workflowId = await createWorkflowAs({
      id: "n1",
      type: "action",
      config: {
        actionType: "crm_action",
        entity: "activity",
        operation: "update",
        // The review's exact payload: an empty fieldMapping is enough, because the LEAK is the
        // emitted `previous`/`data` pair, not the field that changed.
        fieldMapping: { title: `${PREFIX}pwned` },
        targetId: ACT_B,
      },
    })
    await activateWorkflowAs(workflowId)

    const run = await runWorkflowAs(workflowId)

    // The run FAILS rather than silently skipping: an owner refusal the operator cannot see in the
    // runs list is a second defect.
    expect(run.status).toBe("failed")
    expect(run.error ?? "").toMatch(/activity/i)

    // NOT WRITTEN — read by direct SQL, never from the handler's own answer.
    expect(await sqlActivity(ACT_B)).toEqual(before)
    expect((await sqlActivity(ACT_B))?.title).toBe(ACT_B_TITLE)

    // NOT EMITTED — no CRM event at all, so nothing reached the webhook subscriber.
    expect(captured).toHaveLength(0)

    // NOT READ — B's marker appears nowhere the run recorded, including the step output and the
    // run's own error string, which is the one place a "not found" message could echo a row.
    const steps = await db
      .select({ output: workflowRunSteps.output, error: workflowRunSteps.error })
      .from(workflowRunSteps)
      .where(
        sql`run_id in (select id from workflow_runs where workflow_id = ${workflowId})`,
      )
    expect(JSON.stringify(steps)).not.toContain(B_SECRET)
    expect(run.error ?? "").not.toContain(B_SECRET)
  })

  it("A's workflow aimed at B's activity by TITLE LOOKUP fails the run — `ilike` cannot cross the boundary", async () => {
    const before = await sqlActivity(ACT_B)

    const workflowId = await createWorkflowAs({
      id: "n1",
      type: "action",
      config: {
        actionType: "crm_action",
        entity: "activity",
        operation: "update",
        fieldMapping: { title: `${PREFIX}pwned` },
        lookupField: "title",
        // Matches B's activity and NOTHING ELSE in the fixture, so pre-fix this resolved
        // deterministically to the victim rather than to whichever row the scan emitted first.
        lookupValue: ACT_B_TITLE,
      },
    })
    await activateWorkflowAs(workflowId)

    const run = await runWorkflowAs(workflowId)

    expect(run.status).toBe("failed")
    // The lookup must report NOT FOUND, not "not yours": a distinguishable message is an
    // existence oracle for another owner's records.
    expect(run.error ?? "").toMatch(/No activity found/i)

    expect(await sqlActivity(ACT_B)).toEqual(before)
    expect(captured).toHaveLength(0)
  })

  it("A's workflow aimed at B's activity with operation:delete fails the run and does not soft-delete it", async () => {
    const workflowId = await createWorkflowAs({
      id: "n1",
      type: "action",
      config: {
        actionType: "crm_action",
        entity: "activity",
        operation: "delete",
        fieldMapping: {},
        targetId: ACT_B,
      },
    })
    await activateWorkflowAs(workflowId)

    const run = await runWorkflowAs(workflowId)

    expect(run.status).toBe("failed")
    expect((await sqlActivity(ACT_B))?.deletedAt).toBeNull()
    // The tombstone carries `previous` = the victim's full row, so an emission here is the whole
    // record leaving the system.
    expect(captured).toHaveLength(0)
  })

  it("THE POSITIVE ANCHOR: the same three requests aimed at A's OWN activity complete and DO emit", async () => {
    // Without this, every assertion above is satisfied by an engine that fails every crm_action.
    const workflowId = await createWorkflowAs({
      id: "n1",
      type: "action",
      config: {
        actionType: "crm_action",
        entity: "activity",
        operation: "update",
        fieldMapping: { title: `${PREFIX}renamed-by-own-workflow` },
        targetId: ACT_A,
      },
    })
    await activateWorkflowAs(workflowId)

    const run = await runWorkflowAs(workflowId)

    expect(run.status).toBe("completed")
    expect((await sqlActivity(ACT_A))?.title).toBe(`${PREFIX}renamed-by-own-workflow`)
    expect(captured.map((e) => e.name)).toContain("activity.updated")
  })
})

/* ---------------------------------------------------------------------------
 * CR-02 — the lookup branch, at the query
 * ------------------------------------------------------------------------ */

describe("CR-02 — resolveIdByLookup is scoped at the QUERY, not filtered afterwards", () => {
  /**
   * HONEST LABEL: this cell is NOT the red-provable half, and must not be presented as one.
   *
   * MEASURED against the unfixed handler: **it passes.** `select … where ilike(title, '%') limit 1`
   * has no ORDER BY, so which of the two fixture rows PostgreSQL emits first is a planner choice,
   * not a property of the code — on this fixture it returned A's row and the cell went green
   * against the hole. Same class as DEF-48-04, and stated here for the same reason.
   *
   * The red-provable proof that the lookup is scoped is the TITLE LOOKUP cell in the describe
   * above, which probes a value that matches B's row and NOTHING ELSE. This cell is kept because
   * it is the review's literal enumeration payload and because it pins the post-fix invariant
   * (a wildcard can only ever land on the caller's own rows) — but the evidence it carries is
   * "consistent with", not "would have caught".
   */
  it("a wildcard lookup by A never resolves to one of B's records", async () => {
    const beforeB = await sqlActivity(ACT_B)

    await runNode(
      {
        entity: "activity",
        operation: "update",
        fieldMapping: { notes: A_SECRET },
        lookupField: "title",
        lookupValue: "%",
      },
      USER_A,
    )

    expect(await sqlActivity(ACT_B)).toEqual(beforeB)
    expect(JSON.stringify(captured)).not.toContain(B_SECRET)
    // And the write DID land somewhere — on A's own row.
    expect(captured.map((e) => e.name)).toContain("activity.updated")
    expect(captured.every((e) => e.payload.entityId === ACT_A)).toBe(true)
  })

  it("A's own title lookup still resolves — the scope narrows the query, it does not disable it", async () => {
    await runNode(
      {
        entity: "activity",
        operation: "update",
        fieldMapping: { notes: A_SECRET },
        lookupField: "title",
        lookupValue: ACT_A_TITLE,
      },
      USER_A,
    )

    expect(captured.map((e) => e.payload.entityId)).toEqual([ACT_A])
  })
})

/* ---------------------------------------------------------------------------
 * CR-02 — the sibling entities the SAME handler reaches
 * ------------------------------------------------------------------------ */

/**
 * `crm.ts`'s `mutationMap` has four entries, and `updateDealMutation`, `updatePersonMutation` and
 * `updateOrganizationMutation` each check existence only, exactly as the activity pair did. A fix
 * that closed activities alone would leave three identical holes on the same endpoint, so each is
 * asserted in its own cell rather than being argued from the shared helper.
 */
describe("CR-02 — deal, person and organization are closed too, not just activity", () => {
  const cases = [
    { entity: "deal", table: deals, victim: DEAL_B, own: DEAL_A },
    { entity: "person", table: people, victim: PERSON_B, own: PERSON_A },
    { entity: "organization", table: organizations, victim: ORG_B, own: ORG_A },
  ] as const

  for (const { entity, table, victim, own } of cases) {
    it(`A updating B's ${entity} by targetId is refused, and B's notes are neither written nor emitted`, async () => {
      const before = await sqlNotes(table, victim)

      await expect(
        runNode(
          { entity, operation: "update", fieldMapping: { notes: `${PREFIX}pwned` }, targetId: victim },
          USER_A,
        ),
      ).rejects.toThrow()

      expect(await sqlNotes(table, victim)).toBe(before)
      expect(await sqlNotes(table, victim)).toBe(B_SECRET)
      expect(captured).toHaveLength(0)
    })

    it(`A deleting B's ${entity} by targetId is refused, and B's row is not soft-deleted`, async () => {
      await expect(
        runNode({ entity, operation: "delete", fieldMapping: {}, targetId: victim }, USER_A),
      ).rejects.toThrow()

      expect(await sqlDeletedAt(table, victim)).toBeNull()
      expect(captured).toHaveLength(0)
    })

    it(`THE POSITIVE ANCHOR: A updating A's OWN ${entity} still succeeds and still emits`, async () => {
      const marker = `${PREFIX}own-write-${entity}`

      const result = await runNode(
        { entity, operation: "update", fieldMapping: { notes: marker }, targetId: own },
        USER_A,
      )

      expect(result.output).toMatchObject({ success: true })
      expect(await sqlNotes(table, own)).toBe(marker)
      expect(captured.map((e) => e.name)).toContain(`${entity}.updated`)
    })
  }
})

/* ---------------------------------------------------------------------------
 * CR-02 — the whole-file emission claim
 * ------------------------------------------------------------------------ */

describe("CR-02 — the emission half, stated once over every refusal in this file", () => {
  it("no refused operation leaves an audit row attributed to A about one of B's records", async () => {
    // The `audit_log` half of the emission story. `registerAuditSubscriber()` is not called in
    // this vitest project (IN-03), so this is a floor rather than the primary control — but a row
    // here would mean a write landed, which is the claim under test either way.
    const rows = await db
      .select({ entityId: auditLog.entityId, actorUserId: auditLog.actorUserId })
      .from(auditLog)
      .where(
        and(
          like(auditLog.entityId, LIKE_PREFIX),
          or(eq(auditLog.entityId, ACT_B), eq(auditLog.entityId, DEAL_B)),
        ),
      )

    expect(rows).toEqual([])
  })

  it("four refusals in one run leave every one of B's records byte-identical", async () => {
    // The cross-entity integrity statement, driven rather than inherited: `restoreFixtureRows`
    // runs before every cell, so a passive re-read here would be vacuous. This drives one refusal
    // per entity inside a SINGLE cell and then reads all four rows.
    const targets = [
      { entity: "activity" as const, id: ACT_B },
      { entity: "deal" as const, id: DEAL_B },
      { entity: "person" as const, id: PERSON_B },
      { entity: "organization" as const, id: ORG_B },
    ]

    for (const { entity, id } of targets) {
      await expect(
        runNode(
          { entity, operation: "update", fieldMapping: { notes: `${PREFIX}pwned` }, targetId: id },
          USER_A,
        ),
      ).rejects.toThrow()
    }

    expect(await sqlNotes(deals, DEAL_B)).toBe(B_SECRET)
    expect(await sqlNotes(people, PERSON_B)).toBe(B_SECRET)
    expect(await sqlNotes(organizations, ORG_B)).toBe(B_SECRET)
    expect(await sqlActivity(ACT_B)).toEqual({ title: ACT_B_TITLE, deletedAt: null })
    expect(captured).toHaveLength(0)
  })
})

/* ---------------------------------------------------------------------------
 * CR-04 — `fieldMapping.ownerId` moves the ROW across the boundary, not just an FK
 * ------------------------------------------------------------------------ */

/**
 * CR-02 scoped WHICH row a `crm_action` node touches. It did not constrain WHOSE the row becomes.
 *
 * `coerceFieldMapping` copies any key with no entry in `crmFieldTypes` through unchanged, and
 * `crmFieldTypes.deal` has only `value` and `expectedCloseDate`. The call sites spread
 * `{ ...interpolatedFields, userId }` — `userId` is last so it cannot be clobbered, but `ownerId`
 * is a DIFFERENT KEY and was never touched. `dealSchema` carries `ownerId: z.string().optional()`
 * and both mutations honour it (`deals.ts:35`, `:232`, `:377-380`), so
 * `fieldMapping: { ownerId: "<victim>" }` created or transferred a row INTO the victim's account.
 *
 * This is strictly worse than DEF-48-05's six reference columns: those plant a foreign FK on the
 * caller's OWN row, this one puts the row itself on the other side of the boundary, where it shows
 * up in the victim's `GET /api/v1/deals` and in the victim's `/deals` UI.
 *
 * ONLY DEALS WAS AFFECTED, and the asymmetry is why it survived: `createPersonMutation`,
 * `createOrganizationMutation` and `createActivityMutation` all hard-code `ownerId: input.userId`
 * and their Zod schemas OMIT `ownerId`, so it is stripped in silence. The refusal is applied to all
 * four anyway — a guard that only fires for the entity that happens to be vulnerable today is the
 * shape that lets the fifth entity through.
 *
 * WHAT THE AUDIT OF THE OTHER THREE SCHEMAS FOUND, since `ownerId` was missing from DEF-48-05's
 * table precisely because nobody enumerated it. Every `*Id`-shaped field naming a USER:
 *
 *   - `deal.ownerId`      — TRANSFERS the row. Refused here.
 *   - `deal.assigneeIds`  — `z.array(z.string())`, writes `deal_assignees.user_id` for arbitrary
 *                           users. NOT refused: assignment does not move the row (both
 *                           `/api/v1/deals` and `/api/v1/activities` scope their lists by
 *                           `owner_id`, never by assignee), and refusing it would break assigning
 *                           work to a colleague from a workflow. It does reach `newAssigneeUserIds`
 *                           and therefore a notification, which is SEC-48-D's relay question.
 *                           Recorded in DEF-48-05's residuals table.
 *   - `activity.assigneeId` — `text('assignee_id') references users.id`, checked NOWHERE. Same
 *                           class as `deal.assigneeIds`: a foreign FK on the caller's own row, not
 *                           a transfer. Already in DEF-48-05's table; kept there.
 *   - person / organization — no user-naming field of any kind beyond `organizationId`, which is
 *                           already in DEF-48-05's table.
 */
describe("CR-04 — fieldMapping cannot move a record into another owner's account", () => {
  /** The title carried by every row these cells attempt to plant. */
  const PLANTED_TITLE = `${PREFIX}planted-in-victims-account`

  /**
   * A deal the engine CREATED carries a GENERATED UUID, which `removeFixtures`' `id like 'crmown-%'`
   * sweep cannot see and which `afterAll`'s `count(*) === baseline` re-assert WOULD catch — as a
   * confusing failure in a different describe. Recognised by its prefixed TITLE instead, and
   * excluded by id so a fixture row can never be caught by it.
   *
   * In an `afterEach` rather than at the end of each cell: the cells that matter here are the ones
   * that FAIL, and a line after a throwing assertion does not run.
   */
  async function removePlantedDeals(): Promise<void> {
    await db.execute(
      sql`delete from deal_assignees where deal_id in (
            select id from deals where title like ${LIKE_PREFIX} and id not like ${LIKE_PREFIX})`,
    )
    await db.execute(
      sql`delete from deals where title like ${LIKE_PREFIX} and id not like ${LIKE_PREFIX}`,
    )
  }

  afterEach(removePlantedDeals)

  /** Every live deal owned by a user, read by direct SQL — never from the handler's own answer. */
  async function sqlDealsOwnedBy(ownerId: string): Promise<{ id: string; title: string }[]> {
    return db
      .select({ id: deals.id, title: deals.title })
      .from(deals)
      .where(and(eq(deals.ownerId, ownerId), sql`${deals.deletedAt} is null`))
  }

  async function sqlDealOwner(id: string): Promise<string | undefined> {
    const rows = await db.select({ ownerId: deals.ownerId }).from(deals).where(eq(deals.id, id))

    return rows[0]?.ownerId
  }

  it("CREATE with fieldMapping.ownerId = B is refused, and NO deals row lands in B's account", async () => {
    // The floor, asserted BEFORE the attempt so a green cannot mean "B never had exactly one deal".
    const before = await sqlDealsOwnedBy(USER_B)
    expect(before.map((d) => d.id)).toEqual([DEAL_B])

    await expect(
      runNode(
        {
          entity: "deal",
          operation: "create",
          fieldMapping: {
            title: PLANTED_TITLE,
            stageId: STAGE_A,
            organizationId: ORG_A,
            notes: `${PREFIX}call 555-0100`,
            ownerId: USER_B,
          },
        },
        USER_A,
      ),
    ).rejects.toThrow(/ownerId/)

    // THE DATABASE, not the response code. A non-200 with the row written is the failure this
    // assertion exists for.
    expect(await sqlDealsOwnedBy(USER_B)).toEqual(before)
    const planted = await db
      .select({ id: deals.id })
      .from(deals)
      .where(eq(deals.title, PLANTED_TITLE))
    expect(planted).toEqual([])

    // Nor did it land in A's account under a different owner: the refusal is a refusal, not a
    // silent rewrite of the field.
    expect((await sqlDealsOwnedBy(USER_A)).map((d) => d.title)).not.toContain(PLANTED_TITLE)

    // And nothing was emitted, so no webhook subscriber saw a `deal.created` for it.
    expect(captured).toHaveLength(0)
  })

  it("UPDATE of A's OWN deal with fieldMapping.ownerId = B is refused, and DEAL_A stays A's", async () => {
    // The one-step variant: `assertCallerOwnsTarget` passes (A does own DEAL_A), then the mutation
    // used to write `owner_id = B` and emit `deal.updated` with `changedFields: ["ownerId"]`.
    expect(await sqlDealOwner(DEAL_A)).toBe(USER_A)

    await expect(
      runNode(
        { entity: "deal", operation: "update", fieldMapping: { ownerId: USER_B }, targetId: DEAL_A },
        USER_A,
      ),
    ).rejects.toThrow(/ownerId/)

    expect(await sqlDealOwner(DEAL_A)).toBe(USER_A)
    expect((await sqlDealsOwnedBy(USER_B)).map((d) => d.id)).toEqual([DEAL_B])
    expect(captured).toHaveLength(0)
  })

  it("the interpolated form is refused too — `{{trigger.data.userId}}` needs no id knowledge", async () => {
    // Chained with CR-05 this was the version that needed no prior knowledge of the victim's id:
    // the trigger envelope hands the acting user's id straight to the mapping. The refusal happens
    // AFTER interpolation, so the check cannot be walked past with a template.
    await expect(
      executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "deal",
          operation: "update",
          targetId: DEAL_A,
          fieldMapping: { ownerId: "{{trigger.data.userId}}" },
        },
        {
          trigger: { type: "crm_event", data: { userId: USER_B } },
          nodes: {},
          _workflowUserId: USER_A,
        },
        `${PREFIX}run-interp`,
      ),
    ).rejects.toThrow(/ownerId/)

    expect(await sqlDealOwner(DEAL_A)).toBe(USER_A)
  })

  it("a DRY RUN is refused as well, so the misconfiguration surfaces in the editor", async () => {
    // The three dry-run gates sit immediately before the mutation call, so a check placed after
    // them would let a dry run report success for a node whose real execution is refused. WFOPS-02
    // rule 1: simulate the side effect, never the resolution.
    await expect(
      executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "deal",
          operation: "update",
          targetId: DEAL_A,
          fieldMapping: { ownerId: USER_B },
        },
        { trigger: { type: "manual", data: {} }, nodes: {}, _workflowUserId: USER_A, _dryRun: true },
        `${PREFIX}run-dry`,
      ),
    ).rejects.toThrow(/ownerId/)
  })

  it("`id` and `deletedAt` are refused for the same reason — identity and lifecycle are not fields", async () => {
    for (const key of ["id", "deletedAt"]) {
      await expect(
        runNode(
          { entity: "deal", operation: "update", fieldMapping: { [key]: "x" }, targetId: DEAL_A },
          USER_A,
        ),
      ).rejects.toThrow(new RegExp(key))
    }

    expect(await sqlDealOwner(DEAL_A)).toBe(USER_A)
  })

  it("the refusal covers all four entities, not only the one that is vulnerable today", async () => {
    // `personSchema`, `organizationSchema` and `activitySchema` omit `ownerId`, so Zod strips it
    // and the mutations hard-code `ownerId: input.userId`. That makes these three cells a
    // DURABILITY claim rather than a live hole — stated plainly, because a cell whose subject is
    // already closed by a different mechanism must not be presented as a reproduction.
    for (const entity of ["person", "organization", "activity"] as const) {
      await expect(
        runNode(
          {
            entity,
            operation: "update",
            fieldMapping: { ownerId: USER_B },
            targetId: entity === "person" ? PERSON_A : entity === "organization" ? ORG_A : ACT_A,
          },
          USER_A,
        ),
      ).rejects.toThrow(/ownerId/)
    }

    expect(captured).toHaveLength(0)
  })

  it("THE POSITIVE ANCHOR: a create with NO ownerId still succeeds and lands in A's OWN account", async () => {
    // Without this every assertion above is satisfied by a handler that refuses every create.
    const result = await runNode(
      {
        entity: "deal",
        operation: "create",
        fieldMapping: {
          title: PLANTED_TITLE,
          stageId: STAGE_A,
          organizationId: ORG_A,
          notes: A_SECRET,
        },
      },
      USER_A,
    )

    expect(result.output).toMatchObject({ success: true })

    const owned = await sqlDealsOwnedBy(USER_A)
    expect(owned.map((d) => d.title)).toContain(PLANTED_TITLE)
    // And it is NOT in B's account, which is the whole point of the field being refused rather
    // than ignored.
    expect((await sqlDealsOwnedBy(USER_B)).map((d) => d.id)).toEqual([DEAL_B])
    expect(captured.map((e) => e.name)).toContain("deal.created")
  })

  it("THE SECOND POSITIVE ANCHOR: an ordinary update with an unrelated key is untouched by the guard", async () => {
    // A blanket "refuse every unknown key" would also pass every cell above and would break every
    // workflow in the deployment. This pins that the refusal list is a list.
    const marker = `${PREFIX}cr04-ordinary-update`

    const result = await runNode(
      { entity: "deal", operation: "update", fieldMapping: { notes: marker }, targetId: DEAL_A },
      USER_A,
    )

    expect(result.output).toMatchObject({ success: true })
    expect(await sqlNotes(deals, DEAL_A)).toBe(marker)
    expect(await sqlDealOwner(DEAL_A)).toBe(USER_A)
  })
})
