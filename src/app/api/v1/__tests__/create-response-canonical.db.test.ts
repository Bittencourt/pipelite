/**
 * =============================================================================
 * create-response-canonical.db.test.ts — DATA-02 / SC-4, PROVEN BEHAVIOURALLY, PER ENTITY
 * =============================================================================
 *
 * WHY THIS FILE CANNOT BE A UNIT TEST.
 *
 * `src/app/api/v1/deals/__tests__/formula-recalc.test.ts` and
 * `src/app/api/v1/people/__tests__/formula-recalc.test.ts` both assert that the 201 body carries
 * the POST-recalc blob. They do it with `@/lib/formula-recalc` MOCKED: the recalculation is a
 * `vi.fn()` resolving to a fixture, and `db.query.{table}.findFirst` is a `vi.fn()` resolving to
 * another fixture. That is a claim about which fixture the route reached for, not a claim about
 * what the database holds.
 *
 * Plan 49-03 measured the consequence and recorded it rather than smoothing it over. Its
 * **ablation 2** replaced the deals canonical read with `{ ...deal, customFields:
 * recalculatedCustomFields }` — the in-process merge the user explicitly REJECTED — and the unit
 * suite passed **20/20, fully green**. The unit proof cannot discriminate a canonical read from an
 * in-process reassembly, and it cannot in principle: the two agree for as long as the recalc writes
 * exactly one column, which is true today. That agreement is a coincidence of the current recalc,
 * not a contract.
 *
 * So the proof that means something is this one: **one request creates the record, a second request
 * reads it back, and the two bodies' `custom_fields` are compared** — real PostgreSQL, real minted
 * API keys through the real unmocked `withApiAuth`, real formula engine. There is no `vi.mock` in
 * this file at all, and this sentence deliberately does not spell the helper, because a control its
 * own prose satisfies proves nothing.
 *
 * (What this file can and cannot discriminate is measured, not assumed, in plan 49-05's SUMMARY:
 * ablation 5 drives the rejected in-process merge against these very cells. Read that before citing
 * this file as proof that the merge is caught.)
 *
 * =============================================================================
 * WHY IT MANUFACTURES ITS OWN FORMULA DEFINITIONS — WITHOUT THEM IT PROVES NOTHING
 * =============================================================================
 *
 * DATA-02 is a purely LATENT defect. Nothing diverges in production today.
 *
 * Measured against the running `pipelite` database on **2026-08-26** by plan 49-01 (a
 * re-measurement, not a citation of research): `custom_field_definitions` holds **169 live rows —
 * 62 `text`, 56 `multi_select`, 28 `single_select`, 12 `number`, 11 `date` — and ZERO of
 * `type='formula'`**. Across all four CRM tables (**188,619 rows**) zero records carry a stored
 * file descriptor, on both the `%storedName%` and the `%publicUrl%` probe.
 *
 * `recalculateFormulas` writes only when `inScope.length > 0`
 * (`src/lib/formula-recalc.ts:663-669`), which needs at least one `type='formula'` definition with
 * a non-empty `config.expression`. With none, there is **no field, native or custom, on which a 201
 * body and a subsequent GET can currently differ** — so a DATA-02 test written against live
 * definitions is green BEFORE the fix and green AFTER it, and is not a test.
 *
 * This file therefore mints four `type='formula'` definitions of its own, one per entity type,
 * through plan 49-01's shared `mintFieldDefinition`, and asserts a NAMED-INTEGER FLOOR on their
 * existence before any body assertion runs. A fixture that silently failed to insert would
 * otherwise leave every comparison below passing on two identical UN-DERIVED blobs.
 *
 * =============================================================================
 * WHY THE MATCH SCOPE IS `custom_fields` AND NOT THE WHOLE BODY
 * =============================================================================
 *
 * `recalculateFormulas` deliberately does NOT bump `updatedAt`
 * (`src/lib/formula-recalc.ts:983-986`): the entity's own write already bumped it, and a second
 * bump would make a derived-value refresh indistinguishable from a user edit in Phase 36's audit
 * log. That is load-bearing here. It means the canonical re-read cannot produce a different
 * `updated_at`, so `custom_fields` is the ONLY column on which the 201 and the GET can differ —
 * which is exactly the match scope 49-CONTEXT.md set ("custom-field VALUES, not whole-body byte
 * equality"). Asserting whole-body equality would be asserting something SC-4 does not claim.
 *
 * =============================================================================
 * PLACEMENT, STATED RATHER THAN PICKED SILENTLY
 * =============================================================================
 *
 * `src/app/api/v1/__tests__/` — because that is where `api-key-fixture.ts` already lives and this
 * file spans all four entity directories, so co-locating it under any one of them would misfile it.
 * `src/app/api/v1/workflows/__tests__/runs-owner-scope.db.test.ts` is the in-repo precedent for a
 * db-test inside a `__tests__/` directory. `vitest.db.config.ts` globs
 * `src/**\/*.db.test.?(c|m)[jt]s?(x)`, so placement does not affect collection.
 *
 * =============================================================================
 * HOW TO RUN IT, AND WHY IT CANNOT REACH THE REAL DATA
 * =============================================================================
 *
 *   docker compose up -d        # host 5433 -> container 5432, from the repository root
 *   npm run test:db
 *
 * NOT part of `npm test` and NOT part of CI — see `vitest.db.config.ts`. `pipelite` holds the
 * operator's real records; this suite creates users, API keys, definitions and records across four
 * entity tables and HARD DELETES them, so it runs against `pipelite_dedup_test`, rebuilt empty by
 * `scripts/dedup-db-test-setup.sh`. `assertIsolatedConnection` below re-derives the host AND the
 * database name from the string it was handed and throws at MODULE SCOPE, so a wrong target aborts
 * COLLECTION and no statement is ever sent.
 *
 * FIXTURE DISCIPLINE: every id this file supplies carries the `crcanon-` prefix; teardown is a
 * prefixed DELETE in foreign-key order, audit rows first; `afterAll` asserts BOTH that zero
 * prefixed rows remain AND that each touched table's total is what it was before the run. The four
 * POST handlers generate their OWN ids, so the created records carry no prefix at all — every sweep
 * over those four tables therefore also matches on `owner_id`, which is the seeded user's prefixed
 * id. Without that second predicate a red run leaves an orphan referencing a fixture parent and
 * every subsequent run dies at teardown with `23503`.
 *
 * `custom_field_definitions` is in `TOUCHED_TABLES` with its own prefix-scoped predicate for a
 * sharper reason than tidiness: `getActiveFieldDefinitions` is uncached (proven behaviourally in
 * plan 49-01), so a single leaked `type='formula'` definition silently activates the
 * formula-recalculation path for every later db-test file in the same run.
 * =============================================================================
 */
import { eq, like, or, sql } from "drizzle-orm"
import { NextRequest } from "next/server"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { db } from "@/db"
import {
  activities,
  activityTypes,
  apiKeys,
  auditLog,
  customFieldDefinitions,
  deals,
  organizations,
  people,
  pipelines,
  stages,
  users,
  type EntityType,
} from "@/db/schema"

import {
  mintFieldDefinition,
  removeFieldDefinitions,
} from "@/lib/__tests__/custom-field-definition-fixture"

import { mintApiKey, type MintedApiKey } from "./api-key-fixture"

import { POST as POST_ORGANIZATION } from "../organizations/route"
import { GET as GET_ORGANIZATION } from "../organizations/[id]/route"
import { POST as POST_PERSON } from "../people/route"
import { GET as GET_PERSON } from "../people/[id]/route"
import { POST as POST_DEAL } from "../deals/route"
import { GET as GET_DEAL } from "../deals/[id]/route"
import { POST as POST_ACTIVITY } from "../activities/route"
import { GET as GET_ACTIVITY } from "../activities/[id]/route"

/* ---------------------------------------------------------------------------
 * (a) The environment guard — evaluated at module scope, so a wrong target
 * aborts collection and no test body ever runs. Copied verbatim from
 * `activities-scope.db.test.ts:128-166`, including its four self-assertions
 * below: three refusals plus the ACCEPT cell, without which a guard that threw
 * on everything would satisfy the refusals and make the suite unrunnable.
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
        "This suite creates and hard-deletes fixture users, API keys, custom-field definitions " +
        "and records across all four CRM tables.",
    )
  }

  const database = url.pathname.replace(/^\//, "")

  if (database !== TEST_DATABASE) {
    throw new Error(
      `refusing to run: connection names database "${database}", not "${TEST_DATABASE}". ` +
        (database === DEV_DATABASE
          ? `"${DEV_DATABASE}" is the DEVELOPMENT database and holds 188,619 real CRM records; ` +
            "this suite hard-deletes its fixtures and must never be pointed at it. "
          : "") +
        "Run `npm run test:db`.",
    )
  }

  return connectionString
}

assertIsolatedConnection(process.env.DATABASE_URL)

/* ---------------------------------------------------------------------------
 * (b) One prefix on every id this file supplies, and every integer a NAMED
 * LITERAL declared once.
 * ------------------------------------------------------------------------ */

/** One prefix, on every id. No `_` and no `%`, so no LIKE escaping is needed. */
const PREFIX = "crcanon-"
const LIKE_PREFIX = `${PREFIX}%`

/**
 * ONE identity, deliberately. DATA-02 is not an authorization criterion — a second identity here
 * would invite confusion with plan 49-06's subject, and every predicate this file exercises is
 * already pinned cross-user by `activities-scope.db.test.ts` and `route-authorization.test.ts`.
 */
const USER_A = `${PREFIX}user-a`
const KEY_A = `${PREFIX}key-a`

/** The deals POST needs a stage inside a pipeline the caller owns. */
const PIPELINE_ID = `${PREFIX}pipeline`
const STAGE_ID = `${PREFIX}stage`
/** `activities.type_id` is NOT NULL and references `activity_types`. */
const TYPE_ID = `${PREFIX}type-task`

const DEF_ORGANIZATION = `${PREFIX}def-organization`
const DEF_PERSON = `${PREFIX}def-person`
const DEF_DEAL = `${PREFIX}def-deal`
const DEF_ACTIVITY = `${PREFIX}def-activity`

/**
 * THE NUMBERS THIS PROOF TURNS ON, declared once and consumed by BOTH the seed and the
 * assertions, so the two cannot drift. Every one is a named literal rather than a value computed
 * from the same query it is checking: an assertion that derives both of its sides from one source
 * passes on an empty database, which is precisely the failure this file exists to rule out.
 *
 * `FORMULA_DEFINITIONS_PER_ENTITY` is the floor that makes every `custom_fields` comparison below
 * mean something. With zero formula definitions the pre-recalc and post-recalc blobs are the same
 * bytes, the comparison passes, and it passes just as happily against the defect.
 */
const FORMULA_DEFINITIONS_PER_ENTITY = 1
const FORMULA_DEFINITIONS_TOTAL = 4
/**
 * What the isolated database held BEFORE this file's seed. Zero — and asserted, so the floor above
 * is measuring this file's own fixture rather than somebody else's leftover. (Plan 49-01's R4
 * demonstrated the cost of omitting this: with a foreign `type='formula'` row planted and the floor
 * removed, its suite went 14/14 green against the very condition the floor exists to catch.)
 */
const FORMULA_DEFINITIONS_BEFORE_SEED = 0
/** How many entity types this file proves. Four, none inferred from another. */
const ENTITIES_PROVEN = 4

/* ---------------------------------------------------------------------------
 * The manufactured divergence: one formula per entity type, over a NATIVE
 * attribute the create writes.
 *
 * Native rather than custom on purpose. A create pushes its full native column
 * list into `changedFields` (`ENTITY_NATIVE_ATTRIBUTES`), so a formula over
 * `{{Name}}` / `{{FirstName}}` / `{{Value}}` / `{{Title}}` reaches scope
 * through `scopeFormulasToChangedFields`'s native-column matching mode without
 * depending on a custom field the caller must also remember to send.
 *
 * The expressions are a concatenation and a doubling — deliberately simple
 * enough that the expected value is legible in a failure message. No nested
 * conditional, because a proof nobody can read a failure of is not a proof.
 *
 * No field name contains a forward slash (a `/` cannot round-trip through the
 * three-segment `/api/files/...` route this phase also touches), and the names
 * mirror the live deployment's Portuguese style.
 * ------------------------------------------------------------------------ */

const DERIVED_SUFFIX = "-derivado"
const DEAL_MULTIPLIER = 2

const ORGANIZATION_FORMULA_NAME = "Rótulo Canônico Organização"
const PERSON_FORMULA_NAME = "Rótulo Canônico Pessoa"
const DEAL_FORMULA_NAME = "Valor Dobrado Negócio"
const ACTIVITY_FORMULA_NAME = "Rótulo Canônico Atividade"

/** The inputs the POSTs send. The expected derived values are computed FROM THESE, below. */
const ORGANIZATION_NAME = `${PREFIX}Organização Canônica`
const PERSON_FIRST_NAME = `${PREFIX}Ada`
const PERSON_LAST_NAME = "Lovelace"
const DEAL_TITLE = `${PREFIX}Negócio Canônico`
const DEAL_VALUE = 500
const ACTIVITY_TITLE = `${PREFIX}Atividade Canônica`

/**
 * A custom-field key the REQUEST BODY carries, with no definition behind it, so nothing strips it
 * and nothing derives it. It is the left-hand side of discriminator 2: the 201's blob must NOT
 * equal what the caller sent, and the only thing that can make them differ is a derivation that
 * actually happened between the insert and the response.
 */
const SENT_KEY = "Origem Canônica"
const SENT_VALUE = `${PREFIX}request-body`
const sentCustomFields = { [SENT_KEY]: SENT_VALUE }

/**
 * The stored shape of a computed formula value (`formula-recalc.ts:715`). Spelled out here rather
 * than read from the engine, because an expected value taken from the thing under test is a
 * tautology.
 */
function derived(value: unknown): Record<string, unknown> {
  return { formula: true, value, error: null }
}

/** Every expected value below is COMPUTED IN THE TEST from the input the POST sent. */
const EXPECTED_ORGANIZATION_VALUE = `${ORGANIZATION_NAME}${DERIVED_SUFFIX}`
const EXPECTED_PERSON_VALUE = `${PERSON_FIRST_NAME}${DERIVED_SUFFIX}`
const EXPECTED_DEAL_VALUE = DEAL_VALUE * DEAL_MULTIPLIER
const EXPECTED_ACTIVITY_VALUE = `${ACTIVITY_TITLE}${DERIVED_SUFFIX}`

/**
 * SHAPE COVERAGE, as data rather than as prose. The four POSTs are TWO shapes, and the asymmetry is
 * the whole reason this proof is per entity instead of one-per-shape: `organizations` and
 * `activities` go through a create mutation, while `people` and `deals` insert inline in the route
 * and still hold the post-recalc blob in a local variable two statements above the return — which
 * is what makes the rejected in-process merge the easy mistake THERE and not in the other two.
 */
const CREATE_SHAPE: Readonly<Record<EntityType, "create mutation" | "inline db.insert">> =
  Object.freeze({
    organization: "create mutation",
    activity: "create mutation",
    person: "inline db.insert",
    deal: "inline db.insert",
  })

/** Populated at the TOP of each per-entity cell, so a cell that FAILS still records that it ran. */
const CELLS_THAT_RAN = new Set<EntityType>()

let keyA: MintedApiKey
/** Totals before the run, re-asserted afterwards: a prefix query cannot see a MUTATED row. */
const baseline: Record<string, number> = {}
/** Measured in `beforeAll`, between the clean and the mint. */
let formulaDefinitionsBeforeSeed = -1

/* ---------------------------------------------------------------------------
 * (c) TOUCHED_TABLES, a per-table leftover predicate, and teardown in
 * foreign-key order.
 * ------------------------------------------------------------------------ */

const TOUCHED_TABLES = [
  "users",
  "api_keys",
  "pipelines",
  "stages",
  "activity_types",
  "organizations",
  "people",
  "deals",
  "activities",
  "custom_field_definitions",
  "audit_log",
] as const

/**
 * How a leftover fixture row is RECOGNISED, per table.
 *
 * Not a shared `id like 'crcanon-%'`. Two tables cannot use it:
 *
 *   - the four CRM tables hold records whose ids the ROUTE generated
 *     (`crypto.randomUUID`, `$defaultFn`), so an id-prefix check there reports zero no matter how
 *     many leaked. `owner_id` is the fixture link that survives, and it is the seeded user's
 *     prefixed id.
 *   - `audit_log.id` is a generated UUID too, so its fixture links are the entity it describes and
 *     the actor it attributes — the same predicate `activities-scope.db.test.ts` uses, and for the
 *     same reason.
 */
const LEFTOVER_PREDICATE: Record<(typeof TOUCHED_TABLES)[number], ReturnType<typeof sql>> = {
  users: sql`id like ${LIKE_PREFIX}`,
  api_keys: sql`id like ${LIKE_PREFIX}`,
  pipelines: sql`id like ${LIKE_PREFIX}`,
  stages: sql`id like ${LIKE_PREFIX}`,
  activity_types: sql`id like ${LIKE_PREFIX}`,
  organizations: sql`id like ${LIKE_PREFIX} or owner_id like ${LIKE_PREFIX}`,
  people: sql`id like ${LIKE_PREFIX} or owner_id like ${LIKE_PREFIX}`,
  deals: sql`id like ${LIKE_PREFIX} or owner_id like ${LIKE_PREFIX}`,
  activities: sql`id like ${LIKE_PREFIX} or owner_id like ${LIKE_PREFIX} or deal_id like ${LIKE_PREFIX}`,
  custom_field_definitions: sql`id like ${LIKE_PREFIX}`,
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

/**
 * Sweep the records the ROUTES created, by owner as well as by id.
 *
 * Called from `afterEach` as well as from `removeFixtures`: every cell below creates a new record
 * with a route-generated id, and a red cell that left one behind would otherwise leave an orphan
 * referencing a fixture parent — which kills the NEXT run at teardown with `23503` rather than
 * reporting the failure that caused it.
 */
async function removeCreatedRecords(): Promise<void> {
  // Foreign-key chain, leaf first: activities -> deals -> people -> organizations.
  await db
    .delete(activities)
    .where(
      or(
        like(activities.id, LIKE_PREFIX),
        like(activities.ownerId, LIKE_PREFIX),
        like(activities.dealId, LIKE_PREFIX),
      ),
    )
  await db.delete(deals).where(or(like(deals.id, LIKE_PREFIX), like(deals.ownerId, LIKE_PREFIX)))
  await db.delete(people).where(or(like(people.id, LIKE_PREFIX), like(people.ownerId, LIKE_PREFIX)))
  await db
    .delete(organizations)
    .where(or(like(organizations.id, LIKE_PREFIX), like(organizations.ownerId, LIKE_PREFIX)))
}

async function removeFixtures(): Promise<void> {
  // Audit rows first: they reference both the entity they describe and the user who caused them.
  await db
    .delete(auditLog)
    .where(or(like(auditLog.entityId, LIKE_PREFIX), like(auditLog.actorUserId, LIKE_PREFIX)))

  await removeCreatedRecords()

  await db.delete(stages).where(like(stages.id, LIKE_PREFIX))
  await db.delete(pipelines).where(like(pipelines.id, LIKE_PREFIX))
  await db.delete(apiKeys).where(like(apiKeys.id, LIKE_PREFIX))
  await db.delete(activityTypes).where(like(activityTypes.id, LIKE_PREFIX))
  // Plan 49-01's teardown, reused rather than re-implemented. It HARD deletes and returns its count.
  await removeFieldDefinitions(LIKE_PREFIX)
  await db.delete(users).where(like(users.id, LIKE_PREFIX))
}

/* ---------------------------------------------------------------------------
 * (f) Read the truth by direct SQL, never from a handler's own answer.
 * ------------------------------------------------------------------------ */

/**
 * The stored `custom_fields` column, read by a statement that goes through NOTHING either handler
 * uses — no drizzle relational query, no serializer, no route. If the two bodies agreed with each
 * other but disagreed with the database, SC-4's wording would be satisfied and the product would
 * still be wrong.
 */
async function sqlCustomFields(table: string, id: string): Promise<Record<string, unknown>> {
  const rows = await db.execute(
    sql`select custom_fields as cf from ${sql.identifier(table)} where id = ${id}`,
  )
  const parsed = rows as unknown as { cf: Record<string, unknown> }[]

  expect(
    parsed,
    `direct SQL found no row with id ${id}: the 201 reported an id the database does not hold`,
  ).toHaveLength(1)

  return parsed[0].cf
}

/** Live `type='formula'` definitions for one entity type, counted by direct SQL. */
async function sqlFormulaDefinitionCount(entityType: EntityType): Promise<number> {
  const rows = await db.execute(
    sql`select count(*)::int as n from custom_field_definitions
        where entity_type = ${entityType} and type = 'formula' and deleted_at is null`,
  )

  return Number((rows as unknown as { n: number }[])[0].n)
}

/** Live `type='formula'` definitions across every entity type. */
async function sqlFormulaDefinitionCountAll(): Promise<number> {
  const rows = await db.execute(
    sql`select count(*)::int as n from custom_field_definitions
        where type = 'formula' and deleted_at is null`,
  )

  return Number((rows as unknown as { n: number }[])[0].n)
}

/* ---------------------------------------------------------------------------
 * (d) Real handlers, real keys, no injected identity.
 * ------------------------------------------------------------------------ */

interface Envelope {
  data: { id: string; custom_fields: Record<string, unknown> }
}

/**
 * A create request carrying a REAL minted key. There is no context argument and no injected
 * identity: whoever `api_keys.user_id` names is who this request is, decided inside
 * `validateApiKey`.
 */
async function createVia(
  handler: (request: NextRequest) => Promise<Response>,
  path: string,
  body: Record<string, unknown>,
): Promise<Envelope> {
  const response = await handler(
    new NextRequest(`http://localhost${path}`, {
      method: "POST",
      headers: {
        Authorization: keyA.authorizationHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  )

  const payload = (await response.json()) as Envelope & { errors?: unknown }

  expect(
    response.status,
    `POST ${path} did not create: ${JSON.stringify(payload)}`,
  ).toBe(201)

  return payload
}

/** The GET-by-id the 201 must agree with — the one code path this phase makes truth. */
async function readVia(
  handler: (
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => Promise<Response>,
  path: string,
  id: string,
): Promise<Envelope> {
  const response = await handler(
    new NextRequest(`http://localhost${path}/${id}`, {
      headers: { Authorization: keyA.authorizationHeader },
    }),
    { params: Promise.resolve({ id }) },
  )

  expect(response.status, `GET ${path}/${id} did not return the record just created`).toBe(200)

  return (await response.json()) as Envelope
}

/* ---------------------------------------------------------------------------
 * Setup / teardown
 * ------------------------------------------------------------------------ */

beforeAll(async () => {
  // CLEAN FIRST, THEN MEASURE — and the ORDER is the whole point (WR-04). `afterAll` compares
  // against `baseline`, so capturing the baseline INCLUDING leftovers from a previous aborted run
  // converts a run killed after `beforeAll` (Ctrl-C, container restart, OOM) into a false RED on
  // the NEXT run: every test green, the suite red in teardown, describing a mutated pre-existing
  // row that never existed.
  await removeFixtures()

  for (const table of TOUCHED_TABLES) baseline[table] = await countAll(table)

  // Measured AFTER the clean and BEFORE the mint — the only moment at which it is meaningful.
  formulaDefinitionsBeforeSeed = await sqlFormulaDefinitionCountAll()

  // `status` is an enum of pending_verification | pending_approval | approved | rejected;
  // `active` does not exist and errors. `role: "member"` deliberately: nothing here needs admin,
  // and an admin fixture invites an admin-bypass path into a criterion that has none.
  await db.insert(users).values({
    id: USER_A,
    email: `${PREFIX}a@local.test`,
    name: "Canonical A",
    role: "member",
    status: "approved",
  })

  keyA = await mintApiKey({ id: KEY_A, userId: USER_A, name: "canonical fixture A" })

  await db.insert(activityTypes).values({ id: TYPE_ID, name: "Canonical Task", isDefault: false })

  await db.insert(pipelines).values({
    id: PIPELINE_ID,
    name: `${PREFIX}pipeline`,
    ownerId: USER_A,
  })
  await db.insert(stages).values({
    id: STAGE_ID,
    pipelineId: PIPELINE_ID,
    name: `${PREFIX}stage`,
    position: 1000,
  })

  // The manufactured divergence. Four definitions, one per entity type, through plan 49-01's
  // fixture rather than a hand-written insert — the id is caller-supplied because
  // `custom_field_definitions.id` carries a `$defaultFn` and a prefix-scoped teardown cannot find
  // a row that took it.
  await mintFieldDefinition({
    id: DEF_ORGANIZATION,
    entityType: "organization",
    name: ORGANIZATION_FORMULA_NAME,
    type: "formula",
    config: { expression: `{{Name}} + "${DERIVED_SUFFIX}"`, resultType: "text" },
  })
  await mintFieldDefinition({
    id: DEF_PERSON,
    entityType: "person",
    name: PERSON_FORMULA_NAME,
    type: "formula",
    config: { expression: `{{FirstName}} + "${DERIVED_SUFFIX}"`, resultType: "text" },
  })
  await mintFieldDefinition({
    id: DEF_DEAL,
    entityType: "deal",
    name: DEAL_FORMULA_NAME,
    type: "formula",
    config: { expression: `{{Value}} * ${DEAL_MULTIPLIER}`, resultType: "number" },
  })
  await mintFieldDefinition({
    id: DEF_ACTIVITY,
    entityType: "activity",
    name: ACTIVITY_FORMULA_NAME,
    type: "formula",
    config: { expression: `{{Title}} + "${DERIVED_SUFFIX}"`, resultType: "text" },
  })
}, 60_000)

/**
 * Sweep the records the routes created, between cells. The DEFINITIONS and the parent rows are
 * deliberately NOT reset here — no cell writes them, and a restore of something nothing mutates is
 * noise. What every cell does write is a brand-new record with a route-generated id, so that is
 * what gets swept.
 */
afterEach(async () => {
  await db
    .delete(auditLog)
    .where(or(like(auditLog.entityId, LIKE_PREFIX), like(auditLog.actorUserId, LIKE_PREFIX)))
  await removeCreatedRecords()
}, 60_000)

afterAll(async () => {
  await removeFixtures()

  for (const table of TOUCHED_TABLES) {
    // Half 1: nothing of ours is left.
    expect(await countLeftovers(table), `leftover ${table} rows under ${LIKE_PREFIX}`).toBe(0)
    // Half 2: and nothing that was NOT ours changed in number either. This is what catches a
    // pre-existing row that was mutated rather than created — a prefix sweep cannot see one.
    expect(await countAll(table), `total ${table} rows drifted from baseline`).toBe(baseline[table])
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

/* ---------------------------------------------------------------------------
 * PRE-FLIGHT FLOORS — asserted before any request is made
 * ------------------------------------------------------------------------ */

describe("pre-flight floors — without these, every comparison below is vacuous", () => {
  it("the named literals are themselves non-zero", () => {
    // An assertion that derives both of its sides from one source passes on an empty database.
    // These are the literals the seed and the assertions BOTH consume; if one were 0, every floor
    // built on it would be satisfied by nothing at all.
    expect(FORMULA_DEFINITIONS_PER_ENTITY).toBeGreaterThan(0)
    expect(FORMULA_DEFINITIONS_TOTAL).toBeGreaterThan(0)
    expect(ENTITIES_PROVEN).toBeGreaterThan(0)
    expect(FORMULA_DEFINITIONS_TOTAL).toBe(FORMULA_DEFINITIONS_PER_ENTITY * ENTITIES_PROVEN)
  })

  it("the isolated database held ZERO live formula definitions BEFORE the seed", () => {
    expect(
      formulaDefinitionsBeforeSeed,
      "if the isolated database already held a formula definition, the per-entity floors below " +
        "would be measuring somebody else's leftover rather than this file's own fixture — and a " +
        "leaked formula definition also activates the recalculation path for every later db-test " +
        "file in the same run.",
    ).toBe(FORMULA_DEFINITIONS_BEFORE_SEED)
  })

  it.each<EntityType>(["organization", "person", "deal", "activity"])(
    "%s: holds at least the named-integer floor of live type='formula' definitions after the seed",
    async (entityType) => {
      expect(
        await sqlFormulaDefinitionCount(entityType),
        `no live type='formula' definition exists for ${entityType}. A fixture that silently ` +
          "failed to insert would leave the 201-equals-GET comparison for this entity passing " +
          "on two identical UN-DERIVED blobs: `recalculateFormulas` writes nothing when " +
          "`inScope.length === 0`, so the pre-recalc row and the canonical read would be the " +
          "same bytes and the comparison would pass against the defect itself.",
      ).toBeGreaterThanOrEqual(FORMULA_DEFINITIONS_PER_ENTITY)
    },
  )

  it(`the ${FORMULA_DEFINITIONS_TOTAL} minted definition ids are present under the prefix, and are the only ones`, async () => {
    const rows = await db
      .select({ id: customFieldDefinitions.id })
      .from(customFieldDefinitions)
      .where(like(customFieldDefinitions.id, LIKE_PREFIX))

    expect(rows.map((r) => r.id).sort()).toEqual(
      [DEF_ORGANIZATION, DEF_PERSON, DEF_DEAL, DEF_ACTIVITY].sort(),
    )
    expect(rows).toHaveLength(FORMULA_DEFINITIONS_TOTAL)
  })

  it("the fixture set the four cells depend on exists", async () => {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, USER_A))
    const [key] = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.id, KEY_A))
    const [stage] = await db
      .select({ id: stages.id, pipelineId: stages.pipelineId })
      .from(stages)
      .where(eq(stages.id, STAGE_ID))
    const [type] = await db
      .select({ id: activityTypes.id })
      .from(activityTypes)
      .where(eq(activityTypes.id, TYPE_ID))

    expect(user?.id).toBe(USER_A)
    expect(key?.id).toBe(KEY_A)
    expect(stage?.pipelineId).toBe(PIPELINE_ID)
    expect(type?.id).toBe(TYPE_ID)
  })
})

/* ---------------------------------------------------------------------------
 * THE PROOF — four entities, four cells, so a failure names the entity
 * ------------------------------------------------------------------------ */

describe("DATA-02 — a 201's custom_fields equals a subsequent GET's, per entity", () => {
  it("organizations (Shape A, create mutation)", async () => {
    CELLS_THAT_RAN.add("organization")

    const created = await createVia(POST_ORGANIZATION, "/api/v1/organizations", {
      name: ORGANIZATION_NAME,
      custom_fields: sentCustomFields,
    })
    const read = await readVia(GET_ORGANIZATION, "/api/v1/organizations", created.data.id)

    // DISCRIMINATOR 1: the derived key is PRESENT in both, BY NAME. "Equal" must not be satisfied
    // by two objects that both lack it.
    expect(Object.keys(created.data.custom_fields)).toContain(ORGANIZATION_FORMULA_NAME)
    expect(Object.keys(read.data.custom_fields)).toContain(ORGANIZATION_FORMULA_NAME)

    // The derived value, compared against a value computed HERE from the input the POST sent.
    expect(created.data.custom_fields[ORGANIZATION_FORMULA_NAME]).toEqual(
      derived(EXPECTED_ORGANIZATION_VALUE),
    )

    // DISCRIMINATOR 2: the 201 does NOT echo the blob the caller sent. A fix that returned an
    // empty object, or the inserted row, or `undefined`, cannot pass this.
    expect(created.data.custom_fields).not.toEqual(sentCustomFields)
    expect(created.data.custom_fields[SENT_KEY]).toBe(SENT_VALUE)

    // THE PROOF.
    expect(
      created.data.custom_fields,
      "the 201 body's custom_fields does not equal what GET /api/v1/organizations/{id} returns " +
        "for the same record — the create response and a subsequent read disagree, which is DATA-02.",
    ).toEqual(read.data.custom_fields)

    // CROSS-CHECK, by a statement neither handler uses. Two bodies agreeing with each other while
    // both disagree with the stored row would satisfy SC-4 and still be wrong.
    expect(await sqlCustomFields("organizations", created.data.id)).toEqual(
      created.data.custom_fields,
    )
  })

  it("people (Shape B, inline db.insert)", async () => {
    CELLS_THAT_RAN.add("person")

    const created = await createVia(POST_PERSON, "/api/v1/people", {
      first_name: PERSON_FIRST_NAME,
      last_name: PERSON_LAST_NAME,
      custom_fields: sentCustomFields,
    })
    const read = await readVia(GET_PERSON, "/api/v1/people", created.data.id)

    expect(Object.keys(created.data.custom_fields)).toContain(PERSON_FORMULA_NAME)
    expect(Object.keys(read.data.custom_fields)).toContain(PERSON_FORMULA_NAME)

    expect(created.data.custom_fields[PERSON_FORMULA_NAME]).toEqual(
      derived(EXPECTED_PERSON_VALUE),
    )

    expect(created.data.custom_fields).not.toEqual(sentCustomFields)
    expect(created.data.custom_fields[SENT_KEY]).toBe(SENT_VALUE)

    expect(
      created.data.custom_fields,
      "the 201 body's custom_fields does not equal what GET /api/v1/people/{id} returns for the " +
        "same record — the create response and a subsequent read disagree, which is DATA-02.",
    ).toEqual(read.data.custom_fields)

    expect(await sqlCustomFields("people", created.data.id)).toEqual(created.data.custom_fields)
  })

  it("deals (Shape B, inline db.insert)", async () => {
    CELLS_THAT_RAN.add("deal")

    const created = await createVia(POST_DEAL, "/api/v1/deals", {
      title: DEAL_TITLE,
      value: DEAL_VALUE,
      stage_id: STAGE_ID,
      custom_fields: sentCustomFields,
    })
    const read = await readVia(GET_DEAL, "/api/v1/deals", created.data.id)

    expect(Object.keys(created.data.custom_fields)).toContain(DEAL_FORMULA_NAME)
    expect(Object.keys(read.data.custom_fields)).toContain(DEAL_FORMULA_NAME)

    expect(created.data.custom_fields[DEAL_FORMULA_NAME]).toEqual(derived(EXPECTED_DEAL_VALUE))

    expect(created.data.custom_fields).not.toEqual(sentCustomFields)
    expect(created.data.custom_fields[SENT_KEY]).toBe(SENT_VALUE)

    expect(
      created.data.custom_fields,
      "the 201 body's custom_fields does not equal what GET /api/v1/deals/{id} returns for the " +
        "same record — the create response and a subsequent read disagree, which is DATA-02.",
    ).toEqual(read.data.custom_fields)

    expect(await sqlCustomFields("deals", created.data.id)).toEqual(created.data.custom_fields)
  })

  it("activities (Shape A, create mutation)", async () => {
    CELLS_THAT_RAN.add("activity")

    const created = await createVia(POST_ACTIVITY, "/api/v1/activities", {
      title: ACTIVITY_TITLE,
      type_id: TYPE_ID,
      custom_fields: sentCustomFields,
    })
    const read = await readVia(GET_ACTIVITY, "/api/v1/activities", created.data.id)

    expect(Object.keys(created.data.custom_fields)).toContain(ACTIVITY_FORMULA_NAME)
    expect(Object.keys(read.data.custom_fields)).toContain(ACTIVITY_FORMULA_NAME)

    expect(created.data.custom_fields[ACTIVITY_FORMULA_NAME]).toEqual(
      derived(EXPECTED_ACTIVITY_VALUE),
    )

    expect(created.data.custom_fields).not.toEqual(sentCustomFields)
    expect(created.data.custom_fields[SENT_KEY]).toBe(SENT_VALUE)

    expect(
      created.data.custom_fields,
      "the 201 body's custom_fields does not equal what GET /api/v1/activities/{id} returns for " +
        "the same record — the create response and a subsequent read disagree, which is DATA-02.",
    ).toEqual(read.data.custom_fields)

    expect(await sqlCustomFields("activities", created.data.id)).toEqual(
      created.data.custom_fields,
    )
  })
})

describe("shape coverage — for the record, because a two-shape surface is how a four-entity fix half-ships", () => {
  it("all four entity types were driven, across BOTH create shapes", () => {
    // Recorded at the TOP of each cell, so a cell that FAILED still counts as having run. This
    // assertion is about coverage, not about outcome: coupling it to outcome would make an
    // ablation redden two cells and destroy the per-entity claim it is here to support.
    expect([...CELLS_THAT_RAN].sort()).toEqual(
      (["activity", "deal", "organization", "person"] satisfies EntityType[]).sort(),
    )
    expect(CELLS_THAT_RAN.size).toBe(ENTITIES_PROVEN)

    const shapes = new Set(Object.values(CREATE_SHAPE))
    expect(shapes.has("create mutation")).toBe(true)
    expect(shapes.has("inline db.insert")).toBe(true)
    expect(Object.keys(CREATE_SHAPE)).toHaveLength(ENTITIES_PROVEN)
  })
})

/* ---------------------------------------------------------------------------
 * A guard on the ONE thing this file cannot express in an assertion
 * ------------------------------------------------------------------------ */

describe("the canonical read is a code-path guarantee, not only an observable difference", () => {
  it("the recalc still writes exactly one column, which is WHY the rejected merge is unobservable here", async () => {
    // This is the honest scope statement, as an executable one.
    //
    // The rejected in-process merge `{ ...row, customFields: recalculated }` produces the same
    // bytes as a canonical read for exactly as long as `recalculateFormulas` writes `customFields`
    // and nothing else. It does today (`formula-recalc.ts:975-986`, and `updatedAt` is
    // DELIBERATELY not bumped there), so no behavioural comparison of two response bodies can
    // discriminate the two shapes — including this one. Plan 49-05's ablation 5 measures that
    // directly and its SUMMARY records the result.
    //
    // What CAN be pinned is the premise: the moment a second column becomes derived, the merge
    // starts lying and the canonical read does not. This cell reddens when that day arrives,
    // which is the day the contract stops being a code-path guarantee and starts being
    // observable — and the day this file's comparison becomes able to catch the merge.
    const created = await createVia(POST_DEAL, "/api/v1/deals", {
      title: DEAL_TITLE,
      value: DEAL_VALUE,
      stage_id: STAGE_ID,
      custom_fields: sentCustomFields,
    })

    // Through drizzle's column mapping rather than `db.execute`, because a raw statement returns
    // `timestamp` as a STRING and `.getTime()` on it throws a TypeError — which reads as a broken
    // cell rather than as the drift this is watching for. Measured on the first run of this file.
    const [row] = await db
      .select({ updatedAt: deals.updatedAt, createdAt: deals.createdAt })
      .from(deals)
      .where(eq(deals.id, created.data.id))

    expect(
      row.updatedAt.getTime(),
      "`recalculateFormulas` bumped `updated_at`. It deliberately does not " +
        "(formula-recalc.ts:983-986), and this file's match scope — custom-field VALUES rather " +
        "than the whole body — rests on that. If this reddens, SC-4's scope must be widened and " +
        "the canonical read becomes observably different from the rejected in-process merge.",
    ).toBe(row.createdAt.getTime())
  })
})
