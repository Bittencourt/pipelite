/**
 * =============================================================================
 * runs-owner-scope.db.test.ts — SEC-48-A, PROVEN BEHAVIOURALLY AGAINST REAL POSTGRES
 * =============================================================================
 *
 * WHAT WAS OPEN.
 *
 * `GET /api/v1/workflows/{id}/runs` selected the workflow with
 *
 *   ```ts
 *   .select({ id: workflows.id }).from(workflows).where(eq(workflows.id, id))
 *   ```
 *
 * — existence only, no `createdBy` predicate — and then listed
 * `where(eq(workflowRuns.workflowId, id))`. Its sibling
 * `GET /api/v1/workflows/{id}/runs/{runId}` was worse: its callback was written
 * `withApiAuth(request, async () => …)`, taking no `context` parameter at all, so the caller's
 * identity was **not even in scope** in the handler that served the row.
 *
 * `workflow_runs.trigger_data` holds the envelope of the record that triggered the run, and
 * `serializeRun` returns it VERBATIM (`src/lib/api/serialize.ts:212`, `trigger_data:
 * run.triggerData`). `serializeRunStep` does the same for a step's `input` and `output`. So this
 * was not a leak of run metadata — it was a read of another owner's CRM row, and of whatever the
 * victim's own automation had recorded about it, to any valid API key that knew or guessed a
 * workflow id.
 *
 * ONE REQUEST WAS THE WHOLE EXPLOIT:
 *
 *   GET /api/v1/workflows/{a workflow id belonging to anyone at all}/runs
 *     -> 200, and every element's `trigger_data` is the other owner's record.
 *
 * WHY THIS IS THE OTHER HALF OF CR-05, AND NOT CR-05 AGAIN.
 *
 * CR-05 (`src/lib/triggers/trigger-owner-scope.db.test.ts`, DEF-48-07) scoped the trigger MATCHER,
 * so an attacker's own workflow no longer aggregates other owners' rows into runs the attacker
 * owns. That closed the WRITE side of the aggregation. It did nothing for the READ here: a
 * victim's OWN workflow, firing correctly on the victim's OWN records, still recorded the victim's
 * rows in `trigger_data` — and these two routes served them to anybody. DEF-48-07 says so in
 * writing: *"Closing CR-05's read path completely means closing SEC-48-A."* This file is that
 * closure.
 *
 * WHY 404 AND NOT 403.
 *
 * Every sibling route under `src/app/api/v1/workflows/` resolves the workflow through
 * `getWorkflow(id, context.userId)` and answers a workflow that is not the caller's with
 * `Problems.notFound("Workflow")` — `workflows/[id]/route.ts:29,:68,:93` (GET/PUT/DELETE) and
 * `workflows/[id]/run/route.ts:24`. A 403 here would be a NEW answer in this subsystem and would
 * also be an existence oracle: `403` versus `404` tells an unauthenticated-for-that-row caller
 * that the id is real. Two cells below assert the foreign case and the nonexistent case are
 * **byte-identical**, which is what makes "does not leak the existence of another owner's
 * workflow" a measurement rather than a claim.
 *
 * WHAT THIS FILE PROVES, AND HOW IT WOULD FAIL.
 *
 *   - A holding a REAL minted API key cannot list B's workflow's runs, and the served bytes do
 *     not contain B's marker. Asserted on the RESPONSE BODY, not only the status: a route that
 *     404'd for the wrong reason and a route that 200'd with an empty page are different bugs, and
 *     a status-only assertion cannot tell either from a fix.
 *   - A cannot read B's run through B's workflow's URL, nor its steps — the step leak is a
 *     separate marker (`B_STEP_SECRET`) because `serializeRunStep` is a second serializer with its
 *     own `input`/`output` passthrough, and a fix that covered only `serializeRun` would still
 *     hand over the step.
 *   - `?dry_run=true` does not bypass the scope. It is a live branch in the list route that
 *     rewrites the WHERE clause, so it is the obvious place for an ownership predicate to be
 *     dropped by a later edit.
 *   - RUN-BELONGS-TO-WORKFLOW: A cannot read B's run id through A's OWN workflow's URL. ⚠ This
 *     cell PASSES BEFORE THE FIX — the pre-existing `and(eq(id, runId), eq(workflowId, id))` in
 *     `[runId]/route.ts:22` already required it. It is here because it is a claim the fix must not
 *     BREAK, not a defect the fix closes, and it is labelled as such so nobody reads its green as
 *     evidence of this fix.
 *   - THE ANTI-VACUITY HALF, in four places, because every assertion above is a refusal:
 *       (a) an upstream control asserts the two runs really do carry the two owners' markers in
 *           the stored `trigger_data`, so the thing being denied is provably present;
 *       (b) A reading A's OWN runs list and A's OWN run detail MUST succeed and MUST contain
 *           A_SECRET — a route that 404'd for everybody satisfies every negative here;
 *       (c) B reading B's OWN runs MUST succeed and MUST contain B_SECRET, so the predicate is not
 *           `createdBy === USER_A`, which (b) alone would not catch;
 *       (d) a closing cell re-reads both stored `trigger_data` values and asserts they are
 *           unchanged, which is this read-only suite's guard against the fixture hazard that bit
 *           two earlier passes: a cell that mutates the field the exploit TRANSFERS makes every
 *           later cell — the positive anchors included — measure something else. A prefix-count
 *           teardown cannot see a MUTATED row, so the mutation is checked directly.
 *
 * NOTHING IS MOCKED. Real PostgreSQL, real `withApiAuth` (real Bearer parse, real
 * `validateApiKey`, real `checkRateLimit`, real `runWithActor`), real route handlers, two real
 * minted API keys.
 *
 * WHY THE RUN ROWS ARE INSERTED RATHER THAN DRIVEN THROUGH THE ENGINE. The defect is entirely on
 * the READ path; how a run row came to exist is CR-05's subject and is already proven end to end
 * in `trigger-owner-scope.db.test.ts` over the real `crmBus`. Reproducing that here would test the
 * matcher a second time and the routes once. What matters is that `trigger_data` is a REAL CRM
 * row rather than a hand-written object, so each envelope is built by READING BACK the
 * `organizations` row this file inserted, in the shape `crmBus` emits it.
 *
 * HOW TO RUN IT
 *   docker compose up -d
 *   npx vitest run --config vitest.db.config.ts \
 *     src/app/api/v1/workflows/__tests__/runs-owner-scope.db.test.ts
 *
 * It runs against `pipelite_dedup_test`, never `pipelite`; the module-scope guard below re-derives
 * the host and the database name from the connection string and throws during collection so a
 * wrong target never receives a statement. Fixture discipline is inherited from
 * `trigger-owner-scope.db.test.ts`: one id prefix on every row, a foreign-key-ordered prefixed
 * teardown, and an `afterAll` asserting BOTH zero prefixed leftovers AND that every touched
 * table's total `count(*)` is what it was before the run. The minted API keys are deleted there
 * and their absence is asserted by the same sweep; no plaintext key is ever written to disk.
 * =============================================================================
 */
import { eq, like, sql } from "drizzle-orm"
import { NextRequest } from "next/server"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { db } from "@/db"
import {
  apiKeys,
  organizations,
  users,
  workflowRuns,
  workflowRunSteps,
  workflows,
} from "@/db/schema"

import { mintApiKey, type MintedApiKey } from "@/app/api/v1/__tests__/api-key-fixture"
import { GET as LIST_RUNS } from "@/app/api/v1/workflows/[id]/runs/route"
import { GET as GET_RUN } from "@/app/api/v1/workflows/[id]/runs/[runId]/route"

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
const PREFIX = "runown-"
const LIKE_PREFIX = `${PREFIX}%`

const USER_A = `${PREFIX}user-a`
const USER_B = `${PREFIX}user-b`
const KEY_A = `${PREFIX}key-a`
const KEY_B = `${PREFIX}key-b`

const ORG_A = `${PREFIX}org-a`
const ORG_B = `${PREFIX}org-b`

const WORKFLOW_A = `${PREFIX}wf-a`
const WORKFLOW_B = `${PREFIX}wf-b`
const RUN_A = `${PREFIX}run-a`
const RUN_B = `${PREFIX}run-b`
const STEP_A = `${PREFIX}step-a`
const STEP_B = `${PREFIX}step-b`

/** An id that is not in the database at all, for the indistinguishability cell. */
const WORKFLOW_MISSING = `${PREFIX}wf-does-not-exist`
const RUN_MISSING = `${PREFIX}run-does-not-exist`

/**
 * The markers that make "B's row did not reach A" checkable by ONE string search over the whole
 * served response, rather than over the one field the test remembered to look at.
 *
 * `notes` carries them into the organization row, and therefore into the `trigger_data` envelope
 * built from that row. `*_STEP_SECRET` goes into `workflow_run_steps.input`, which only the
 * `[runId]` detail route serves and only through `serializeRunStep` — a second passthrough that a
 * fix touching `serializeRun`'s route alone would leave open.
 */
const A_SECRET = `${PREFIX}A-secret`
const B_SECRET = `${PREFIX}B-secret`
const A_STEP_SECRET = `${PREFIX}A-step-secret`
const B_STEP_SECRET = `${PREFIX}B-step-secret`

let keyA: MintedApiKey
let keyB: MintedApiKey

/** Totals before the run, re-asserted afterwards: a prefix query cannot see a MUTATED row. */
const baseline: Record<string, number> = {}

const TOUCHED_TABLES = [
  "users",
  "api_keys",
  "organizations",
  "workflows",
  "workflow_runs",
  "workflow_run_steps",
] as const

/**
 * How a leftover fixture row is RECOGNISED, per table. Every row this file writes carries a
 * supplied prefixed id — including the runs and the steps, whose `$defaultFn` UUIDs are
 * deliberately NOT allowed to fire — so an id-prefix check is sufficient and does not need the
 * link subselects `trigger-owner-scope.db.test.ts` needs.
 */
const LEFTOVER_PREDICATE: Record<(typeof TOUCHED_TABLES)[number], ReturnType<typeof sql>> = {
  users: sql`id like ${LIKE_PREFIX}`,
  api_keys: sql`id like ${LIKE_PREFIX}`,
  organizations: sql`id like ${LIKE_PREFIX}`,
  workflows: sql`id like ${LIKE_PREFIX} or created_by like ${LIKE_PREFIX}`,
  workflow_runs: sql`id like ${LIKE_PREFIX} or workflow_id like ${LIKE_PREFIX}`,
  workflow_run_steps: sql`id like ${LIKE_PREFIX} or run_id like ${LIKE_PREFIX}`,
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
  // Foreign-key order, leaf-first. Steps reference runs, runs reference workflows, workflows and
  // organizations reference users, api_keys reference users.
  await db.delete(workflowRunSteps).where(like(workflowRunSteps.id, LIKE_PREFIX))
  await db.delete(workflowRuns).where(like(workflowRuns.id, LIKE_PREFIX))
  await db.delete(workflows).where(like(workflows.id, LIKE_PREFIX))
  await db.delete(organizations).where(like(organizations.id, LIKE_PREFIX))
  await db.delete(apiKeys).where(like(apiKeys.id, LIKE_PREFIX))
  await db.delete(users).where(like(users.id, LIKE_PREFIX))
}

/**
 * The `trigger_data` envelope, in the shape `crmBus` emits and `createWorkflowRun` persists.
 *
 * Built by READING BACK the organizations row rather than by restating it, so `data` is the real
 * stored row — the same thing a real `organization.updated` event carries — and the marker is in
 * it because the DATABASE has it, not because this helper typed it twice.
 */
async function envelopeFor(orgId: string, userId: string): Promise<Record<string, unknown>> {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1)

  if (!row) throw new Error(`fixture organization ${orgId} was not inserted`)

  return {
    entity: "organization",
    entityId: orgId,
    action: "updated",
    userId,
    data: row as unknown as Record<string, unknown>,
  }
}

/* ---------------------------------------------------------------------------
 * The real routes
 * ------------------------------------------------------------------------ */

interface ServedResponse {
  status: number
  /** The whole body as text, so one search covers every field any serializer emitted. */
  raw: string
}

/** `GET /api/v1/workflows/{id}/runs` through the REAL handler with a REAL key. */
async function listRunsAs(
  key: MintedApiKey,
  workflowId: string,
  query = "",
): Promise<ServedResponse> {
  const response = await LIST_RUNS(
    new NextRequest(`http://localhost/api/v1/workflows/${workflowId}/runs${query}`, {
      method: "GET",
      headers: { Authorization: key.authorizationHeader },
    }),
    { params: Promise.resolve({ id: workflowId }) },
  )

  return { status: response.status, raw: await response.text() }
}

/** `GET /api/v1/workflows/{id}/runs/{runId}` through the REAL handler with a REAL key. */
async function getRunAs(
  key: MintedApiKey,
  workflowId: string,
  runId: string,
): Promise<ServedResponse> {
  const response = await GET_RUN(
    new NextRequest(`http://localhost/api/v1/workflows/${workflowId}/runs/${runId}`, {
      method: "GET",
      headers: { Authorization: key.authorizationHeader },
    }),
    { params: Promise.resolve({ id: workflowId, runId }) },
  )

  return { status: response.status, raw: await response.text() }
}

/* ---------------------------------------------------------------------------
 * Setup / teardown
 * ------------------------------------------------------------------------ */

beforeAll(async () => {
  // CLEAN FIRST, THEN MEASURE: `afterAll` compares against `baseline`, so a run killed after
  // `beforeAll` would otherwise convert itself into a false RED on the next run.
  await removeFixtures()

  for (const table of TOUCHED_TABLES) baseline[table] = await countAll(table)

  // NEITHER USER IS AN ADMIN. These routes have no role concept at all — unlike
  // `GET /api/v1/audit`, which gates on `authorizeAuditRead` — but an admin fixture would make
  // the refusals below unfalsifiable for a reason unrelated to the ownership predicate.
  await db.insert(users).values([
    { id: USER_A, email: `${PREFIX}a@local.test`, name: "Runs A", role: "member", status: "approved" },
    { id: USER_B, email: `${PREFIX}b@local.test`, name: "Runs B", role: "member", status: "approved" },
  ])

  keyA = await mintApiKey({ id: KEY_A, userId: USER_A, name: "runs owner fixture A" })
  keyB = await mintApiKey({ id: KEY_B, userId: USER_B, name: "runs owner fixture B" })

  await db.insert(organizations).values([
    { id: ORG_A, name: `${PREFIX}org A`, ownerId: USER_A, notes: A_SECRET },
    { id: ORG_B, name: `${PREFIX}org B`, ownerId: USER_B, notes: B_SECRET },
  ])

  await db.insert(workflows).values([
    { id: WORKFLOW_A, name: `${PREFIX}wf A`, createdBy: USER_A, active: true },
    { id: WORKFLOW_B, name: `${PREFIX}wf B`, createdBy: USER_B, active: true },
  ])

  await db.insert(workflowRuns).values([
    {
      id: RUN_A,
      workflowId: WORKFLOW_A,
      status: "completed",
      triggerData: await envelopeFor(ORG_A, USER_A),
    },
    {
      id: RUN_B,
      workflowId: WORKFLOW_B,
      status: "completed",
      triggerData: await envelopeFor(ORG_B, USER_B),
    },
  ])

  await db.insert(workflowRunSteps).values([
    {
      id: STEP_A,
      runId: RUN_A,
      nodeId: "n1",
      status: "completed",
      input: { note: A_STEP_SECRET },
      output: { ok: true },
    },
    {
      id: STEP_B,
      runId: RUN_B,
      nodeId: "n1",
      status: "completed",
      input: { note: B_STEP_SECRET },
      output: { ok: true },
    },
  ])
}, 60_000)

afterAll(async () => {
  await removeFixtures()

  for (const table of TOUCHED_TABLES) {
    // Covers the explicit requirement that a minted key be removed and its ABSENCE asserted:
    // `api_keys` is in TOUCHED_TABLES, so both halves below apply to the two keys this file mints.
    expect(await countLeftovers(table), `${table} still holds prefixed fixture rows`).toBe(0)
    expect(await countAll(table), `${table} total drifted from its pre-run count`).toBe(
      baseline[table],
    )
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

describe("the fixture set is what every assertion below assumes", () => {
  it("owns one workflow per user, and each carries exactly one run", async () => {
    const rows = await db
      .select({ id: workflows.id, createdBy: workflows.createdBy })
      .from(workflows)
      .where(like(workflows.id, LIKE_PREFIX))

    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.id === WORKFLOW_A)?.createdBy).toBe(USER_A)
    expect(rows.find((r) => r.id === WORKFLOW_B)?.createdBy).toBe(USER_B)

    const runs = await db
      .select({ id: workflowRuns.id, workflowId: workflowRuns.workflowId })
      .from(workflowRuns)
      .where(like(workflowRuns.id, LIKE_PREFIX))

    expect(runs).toHaveLength(2)
    expect(runs.find((r) => r.id === RUN_A)?.workflowId).toBe(WORKFLOW_A)
    expect(runs.find((r) => r.id === RUN_B)?.workflowId).toBe(WORKFLOW_B)
  })

  it("THE UPSTREAM CONTROL: the stored trigger_data really does hold each owner's CRM row", async () => {
    // Every cell below denies that B's row reached A. This one establishes that B's row is IN the
    // column the routes serve, so each denial is a claim about the route rather than about an
    // envelope that never carried anything.
    const rows = await db
      .select({ id: workflowRuns.id, triggerData: workflowRuns.triggerData })
      .from(workflowRuns)
      .where(like(workflowRuns.id, LIKE_PREFIX))

    const a = JSON.stringify(rows.find((r) => r.id === RUN_A)?.triggerData)
    const b = JSON.stringify(rows.find((r) => r.id === RUN_B)?.triggerData)

    expect(a).toContain(A_SECRET)
    expect(b).toContain(B_SECRET)
    // And they are genuinely different rows, so a route that served the wrong one is visible.
    expect(a).not.toContain(B_SECRET)
    expect(b).not.toContain(A_SECRET)
  })

  it("THE UPSTREAM CONTROL, step half: each run's step holds its own owner's marker", async () => {
    const rows = await db
      .select({ id: workflowRunSteps.id, input: workflowRunSteps.input })
      .from(workflowRunSteps)
      .where(like(workflowRunSteps.id, LIKE_PREFIX))

    expect(JSON.stringify(rows.find((r) => r.id === STEP_A)?.input)).toContain(A_STEP_SECRET)
    expect(JSON.stringify(rows.find((r) => r.id === STEP_B)?.input)).toContain(B_STEP_SECRET)
  })
})

/* ---------------------------------------------------------------------------
 * SEC-48-A — the refusals
 * ------------------------------------------------------------------------ */

describe("SEC-48-A — a caller cannot read another owner's workflow runs", () => {
  it("A listing B's workflow's runs is refused, and is served NOTHING of B's row", async () => {
    const served = await listRunsAs(keyA, WORKFLOW_B)

    // The body first, because it is the claim. Pre-fix this is a 200 whose `data[0].trigger_data`
    // is B's entire `organizations` row — asserting only the status would pass for a route that
    // 404'd by accident and would say nothing about what leaves the process.
    expect(
      served.raw,
      "GET /api/v1/workflows/{B}/runs served A the bytes of B's CRM row. `serializeRun` returns " +
        "`trigger_data` verbatim, so a run row that is listed is a row whose whole envelope is " +
        "readable — this is OWASP API1:2023 BOLA on the workflow-runs read path.",
    ).not.toContain(B_SECRET)
    expect(served.status).toBe(404)
  })

  it("A reading B's run by id is refused, and is served neither B's row nor B's step", async () => {
    const served = await getRunAs(keyA, WORKFLOW_B, RUN_B)

    expect(
      served.raw,
      "GET /api/v1/workflows/{B}/runs/{B's run} served A B's `trigger_data`. This handler's " +
        "callback took no `context` parameter at all, so the caller identity was not even in " +
        "scope in the function that returned the row.",
    ).not.toContain(B_SECRET)
    expect(
      served.raw,
      "the STEP leaked too. `serializeRunStep` passes `input` and `output` through verbatim, so " +
        "a fix that scoped only the list route would still hand over every step of the run.",
    ).not.toContain(B_STEP_SECRET)
    expect(served.status).toBe(404)
  })

  it("?dry_run=true does not become a way around the scope", async () => {
    // The list route rewrites its WHERE clause on this parameter (`dry_run=true` drops the
    // `eq(dryRun, false)` term), which makes it the obvious place for an ownership predicate to be
    // lost by a later edit to that branch.
    const served = await listRunsAs(keyA, WORKFLOW_B, "?dry_run=true")

    expect(served.raw).not.toContain(B_SECRET)
    expect(served.status).toBe(404)
  })

  it("does not leak the existence of B's workflow: the foreign and the nonexistent answer identically", async () => {
    // This is the whole reason the refusal is a 404 and not a 403. A 403 for a real-but-foreign id
    // and a 404 for an unknown one is an existence oracle over every workflow in the deployment.
    const foreign = await listRunsAs(keyA, WORKFLOW_B)
    const missing = await listRunsAs(keyA, WORKFLOW_MISSING)

    expect(foreign.status).toBe(missing.status)
    expect(
      foreign.raw,
      "a foreign workflow and a nonexistent one must be byte-identical on the wire, or the " +
        "status code itself confirms that another owner's workflow id is real",
    ).toBe(missing.raw)
  })

  it("does not leak the existence of B's RUN either, on the detail route", async () => {
    const foreign = await getRunAs(keyA, WORKFLOW_B, RUN_B)
    const missing = await getRunAs(keyA, WORKFLOW_MISSING, RUN_MISSING)

    expect(foreign.status).toBe(missing.status)
    expect(foreign.raw).toBe(missing.raw)
  })

  it("RUN-BELONGS-TO-WORKFLOW: A cannot read B's run id through A's OWN workflow's URL", async () => {
    // ⚠ THIS CELL IS GREEN BEFORE THE FIX. `[runId]/route.ts:22` already required
    // `and(eq(workflowRuns.id, runId), eq(workflowRuns.workflowId, id))`, so a caller could never
    // pull an arbitrary run id through a workflow they own. It is asserted here because the fix
    // must not BREAK it — an ownership check bolted on in place of the workflow-id term, rather
    // than in addition to it, would turn the caller's own workflow URL into a read of every run in
    // the database. Do not read its green as evidence of this fix.
    const served = await getRunAs(keyA, WORKFLOW_A, RUN_B)

    expect(served.raw).not.toContain(B_SECRET)
    expect(served.raw).not.toContain(B_STEP_SECRET)
    expect(served.status).toBe(404)
  })
})

/* ---------------------------------------------------------------------------
 * The anti-vacuity anchors — every assertion above is a refusal
 * ------------------------------------------------------------------------ */

describe("SEC-48-A — the scope NARROWS the routes, it does not disable them", () => {
  it("THE POSITIVE ANCHOR: A listing A's OWN workflow's runs still succeeds, and serves A's row", async () => {
    const served = await listRunsAs(keyA, WORKFLOW_A)

    expect(served.status).toBe(200)

    const body = JSON.parse(served.raw) as {
      data: { id: string; trigger_data: unknown }[]
      meta: { total: number }
    }

    // Both halves read: a route that served rows but reported zero, or reported rows it did not
    // serve, would otherwise satisfy half of this anchor.
    expect(body.data).toHaveLength(1)
    expect(body.meta.total).toBe(1)
    expect(body.data[0].id).toBe(RUN_A)
    expect(
      served.raw,
      "without this every refusal above is satisfied by a route that 404s for everybody, which " +
        "is a different defect wearing the same green",
    ).toContain(A_SECRET)
    expect(served.raw).not.toContain(B_SECRET)
  })

  it("THE POSITIVE ANCHOR, detail half: A reading A's OWN run still gets the run AND its steps", async () => {
    const served = await getRunAs(keyA, WORKFLOW_A, RUN_A)

    expect(served.status).toBe(200)

    const body = JSON.parse(served.raw) as {
      data: { id: string; steps: { id: string }[] }
    }

    expect(body.data.id).toBe(RUN_A)
    expect(body.data.steps).toHaveLength(1)
    expect(body.data.steps[0].id).toBe(STEP_A)
    expect(served.raw).toContain(A_SECRET)
    // The step anchor, so the step assertions in the refusal cells are provably falsifiable.
    expect(served.raw).toContain(A_STEP_SECRET)
    expect(served.raw).not.toContain(B_SECRET)
    expect(served.raw).not.toContain(B_STEP_SECRET)
  })

  it("THE SECOND POSITIVE ANCHOR: B reading B's OWN runs still succeeds", async () => {
    // The predicate must be "the caller's own", not `createdBy === USER_A`, which the two anchors
    // above alone would not distinguish.
    const list = await listRunsAs(keyB, WORKFLOW_B)
    expect(list.status).toBe(200)
    expect(list.raw).toContain(B_SECRET)

    const detail = await getRunAs(keyB, WORKFLOW_B, RUN_B)
    expect(detail.status).toBe(200)
    expect(detail.raw).toContain(B_SECRET)
    expect(detail.raw).toContain(B_STEP_SECRET)
  })

  it("B is refused A's runs too — the refusal is symmetric, not a special case for A", async () => {
    const list = await listRunsAs(keyB, WORKFLOW_A)
    expect(list.status).toBe(404)
    expect(list.raw).not.toContain(A_SECRET)

    const detail = await getRunAs(keyB, WORKFLOW_A, RUN_A)
    expect(detail.status).toBe(404)
    expect(detail.raw).not.toContain(A_SECRET)
    expect(detail.raw).not.toContain(A_STEP_SECRET)
  })
})

/* ---------------------------------------------------------------------------
 * The fixture-integrity guard — the hazard two earlier passes hit
 * ------------------------------------------------------------------------ */

describe("nothing in this file mutated the field the exploit transfers", () => {
  it("both stored trigger_data values, and both step inputs, are exactly what beforeAll wrote", async () => {
    // Every cell above is a READ, so there is no `restoreFixtures` here — and that is precisely
    // why this exists. Two earlier passes were bitten by a restore helper that reset the fields a
    // cell WRITES but not the field the exploit TRANSFERS, cascading into later cells including
    // the positive anchors. The `afterAll` count sweep cannot see a MUTATED row, so the four
    // values the anchors depend on are re-read and compared directly.
    const runs = await db
      .select({ id: workflowRuns.id, triggerData: workflowRuns.triggerData })
      .from(workflowRuns)
      .where(like(workflowRuns.id, LIKE_PREFIX))

    // STRUCTURAL, not stringified. `jsonb` does not preserve key order and it stores a `Date` as
    // an ISO string, so a `JSON.stringify(...)` comparison is red on arrival for two reasons that
    // have nothing to do with mutation — measured, and the reason this cell is written this way.
    // `JSON.parse(JSON.stringify(expected))` puts the freshly-read row through the same
    // serialization the column applied to it.
    const normalize = (value: unknown): unknown => JSON.parse(JSON.stringify(value))

    expect(runs.find((r) => r.id === RUN_A)?.triggerData).toEqual(
      normalize(await envelopeFor(ORG_A, USER_A)),
    )
    expect(runs.find((r) => r.id === RUN_B)?.triggerData).toEqual(
      normalize(await envelopeFor(ORG_B, USER_B)),
    )

    const steps = await db
      .select({ id: workflowRunSteps.id, input: workflowRunSteps.input })
      .from(workflowRunSteps)
      .where(like(workflowRunSteps.id, LIKE_PREFIX))

    expect(steps.find((s) => s.id === STEP_A)?.input).toEqual({ note: A_STEP_SECRET })
    expect(steps.find((s) => s.id === STEP_B)?.input).toEqual({ note: B_STEP_SECRET })
  })
})
