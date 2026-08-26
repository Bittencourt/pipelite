/**
 * =============================================================================
 * dedup-formula.db.test.ts — SC-3 / DATA-01: THE SURVIVOR'S FORMULA AFTER A MERGE
 * =============================================================================
 *
 * The claim under test: merging two records whose formula INPUTS disagree leaves the
 * survivor's stored formula value equal to a fresh computation from its POST-MERGE values.
 * Against real PostgreSQL, because the value being asserted is written by a real
 * `UPDATE ... SET custom_fields` that a mocked `db` cannot perform.
 *
 * -----------------------------------------------------------------------------
 * CLAIM 1 — WHY THIS IS A NEW FILE AND NOT AN EXTENSION OF `dedup.db.test.ts`.
 *
 * That file's `beforeAll` asserts its six `TOUCHED_TABLES` are EMPTY and its `afterAll`
 * asserts row-count PARITY over the same six. It does not list `custom_field_definitions`,
 * so a `type='formula'` definition created inside it would be invisible to its leftover
 * sweep; adding a seventh entry is a two-sided change to a shipped 1,498-line proof, and this
 * plan declines to make it. A sibling file with its own prefix and its own `TOUCHED_TABLES` —
 * `custom_field_definitions` INCLUDED — avoids the hazard entirely.
 *
 * THE RESIDUAL RISK, IN THE SAME BREATH: `dedup.db.test.ts`'s empty-assertion over the shared
 * tables IS this repository's cross-file leak detector. The db project runs with
 * `fileParallelism: false` against ONE database, so if this file's teardown is incomplete,
 * THAT file goes red for a reason that has nothing to do with it — an `organizations is not
 * empty in pipelite_dedup_test` failure pointing at a setup script that ran perfectly. The
 * teardown below is therefore two-sided (prefix sweep AND count parity) and its assertions
 * are the last thing this file does. Both files are run in the same command as verification.
 *
 * A leaked `type='formula'` definition is worse than a leaked row, and worse in a way that is
 * hard to notice: it silently ACTIVATES the formula-recalculation path for every later suite
 * in the same run. `removeFieldDefinitions` is called in `afterAll` and its returned count is
 * asserted against a named floor rather than trusted.
 *
 * -----------------------------------------------------------------------------
 * CLAIM 2 — WHY THE FIXTURE MANUFACTURES ITS OWN FORMULA DEFINITION.
 *
 * Measured against the running `pipelite` database on **2026-08-26**, and re-measured in plan
 * 49-01 Task 1 rather than inherited from research: `custom_field_definitions` holds **169
 * live rows** — 62 `text`, 56 `multi_select`, 28 `single_select`, 12 `number`, 11 `date` — and
 * **ZERO of `type='formula'`**.
 *
 * `recalculateOneEntity` returns before reading a row, before evaluating and before writing
 * when `inScope.length === 0`, and `scopeFormulasToChangedFields` returns an empty scope
 * immediately when `formulaDefs.length === 0`. So with zero formula definitions this whole
 * criterion is unprovable: every assertion below would pass against an un-derived blob,
 * before AND after the fix. The escape is a test that creates its own subject, which is what
 * `mintFieldDefinition` (plan 49-01) exists for — and this file is one of the three consumers
 * that module's own header names.
 *
 * -----------------------------------------------------------------------------
 * CLAIM 3 — WHY THE `choices` MAP TAKES THE **LOSER'S** VALUE, AND WHAT HAPPENS IF IT DOES NOT.
 *
 * This is the one axis on which SC-3 can be proven VACUOUSLY. If the survivor wins the field
 * the formula reads, the correct answer and the stale answer are THE SAME NUMBER, and the
 * assertion passes whether or not anything was recomputed. Worse, with an all-survivor choice
 * map nothing changed at all, so the correct implementation computes an empty `changedFields`
 * and deliberately writes NOTHING — the green is not merely uninformative, it is green for the
 * opposite reason to the one a reader would assume.
 *
 * That is not a warning inherited from research. It is MEASURED, in this file, by the cell
 * labelled VACUITY CONTROL below, which was run against the unfixed mutation and recorded
 * PASSING. Do not simplify it away and do not "align" its choice map with the real proof's.
 *
 * -----------------------------------------------------------------------------
 * CLAIM 4 — WHY THE EXPECTED VALUE IS COMPUTED IN THE TEST, AND WHY THERE ARE TWO INPUTS.
 *
 * Taking the expected value from the engine's own output would assert that the engine agrees
 * with itself. It is computed here instead, from the same named integers the fixture is seeded
 * with and the same factor the expression literal is built from.
 *
 * THE FORMULA READS TWO FIELDS, AND THAT IS LOAD-BEARING RATHER THAN THOROUGH. The loser wins
 * INPUT A; the survivor keeps INPUT B. So the correct post-merge answer is derived from a
 * MIXTURE of the two records and equals NEITHER stored value:
 *
 *      survivor's stored value, pre-merge:  11 * 2 + 100 = 122
 *      loser's    stored value, pre-merge:  37 * 2 + 500 = 574
 *      the ONLY correct answer, post-merge: 37 * 2 + 100 = 174
 *
 * With a single input the correct answer would have been 74 — which is exactly the LOSER's
 * stored value, so a merge that merely COPIED the loser's formula key would have passed the
 * discriminator. The three numbers are asserted pairwise distinct before anything else runs.
 *
 * -----------------------------------------------------------------------------
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 *
 * It does not call `registerAuditSubscriber()`. `dedup.db.test.ts` does, because the loser's
 * `deleted` tombstone is part of ITS subject and it has to wait for that fire-and-forget
 * insert. Here the subject is the post-commit recalculation; registering the subscriber would
 * add an INSERT racing this file's own teardown and nothing else. The audit rows this file
 * does produce are the ones written INSIDE the merge's transaction, which are deterministic.
 *
 * HOW TO RUN IT
 *   docker compose up -d        # host 5433 -> container 5432
 *   npm run test:db
 *
 * It runs against `pipelite_dedup_test`, never the operator's `pipelite`. That is enforced by
 * `assertIsolatedConnection` at MODULE SCOPE below, copied from `dedup.db.test.ts` — verbatim
 * except for the file it names in its own refusal message, because a refusal naming the wrong
 * file sends the reader to the wrong file.
 * =============================================================================
 */
import { and, eq, like, sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { db } from "@/db"
import {
  auditLog,
  deals,
  duplicatePairs,
  notes,
  organizations,
  people,
} from "@/db/schema"
import { runWithActor } from "@/lib/audit/actor-context"
import { CUSTOM_FIELD_PREFIX } from "@/lib/audit/present"
import {
  mintFieldDefinition,
  removeFieldDefinitions,
} from "@/lib/__tests__/custom-field-definition-fixture"
import { recalculateFormulas } from "@/lib/formula-recalc"
import { mergeRecordsMutation } from "@/lib/mutations/dedup"
import type { MergeRecordsInput, MergeRecordsResult } from "@/lib/mutations/dedup"

/* ---------------------------------------------------------------------------
 * The environment guard
 * ------------------------------------------------------------------------ */

/** The one database this suite is allowed to touch. Never the development one. */
const TEST_DATABASE = "pipelite_dedup_test"
/** The development database, named here only so it can be refused by name. */
const DEV_DATABASE = "pipelite"

/**
 * Refuse any connection string that is not the isolated test database on a loopback host.
 *
 * NOT DEFENSIVE BOILERPLATE, AND THE DATABASE-NAME HALF MATTERS MORE THAN THE HOST HALF. This
 * file inserts, updates, MERGES and hard-deletes rows; its teardown is a hard DELETE and its
 * subject is a mutation that soft-deletes one of the two records it is given. Pointed at
 * `pipelite` it would be merging the operator's real organizations.
 *
 * Both the host and the database are named in the messages deliberately: a refusal that does
 * not say what it refused sends the reader to the wrong file.
 */
export function assertIsolatedConnection(connectionString: string | undefined): string {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set for the db vitest project. It is derived from " +
        "E2E_DATABASE_URL by vitest.db.config.ts and must name the isolated " +
        `${TEST_DATABASE} database. Run \`npm run test:db\`, which provisions it first.`
    )
  }

  const url = new URL(connectionString)

  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error(
      `refusing to run: connection host "${url.hostname}" is not loopback. ` +
        "src/lib/mutations/dedup-formula.db.test.ts creates, merges and hard-deletes fixture " +
        "rows and runs only against a local development machine."
    )
  }

  const database = url.pathname.replace(/^\//, "")
  if (database !== TEST_DATABASE) {
    throw new Error(
      `refusing to run: connection names database "${database}", not "${TEST_DATABASE}". ` +
        (database === DEV_DATABASE
          ? `"${DEV_DATABASE}" is the DEVELOPMENT database and holds real records; this ` +
            "suite merges and hard-deletes its fixtures and must never be pointed at it. "
          : "") +
        "Run `npm run test:db`, which provisions the isolated database via " +
        "scripts/dedup-db-test-setup.sh and derives the connection string for it."
    )
  }

  return connectionString
}

/**
 * Evaluated at MODULE SCOPE, so a wrong target aborts collection and the suite does not run at
 * all — no test body executes and no statement is ever sent. `postgres.js` connects lazily, so
 * the client `@/db` constructs when this module is imported has not opened a socket yet.
 */
const CONNECTION = assertIsolatedConnection(process.env.DATABASE_URL)

/* ---------------------------------------------------------------------------
 * The fixture, and every integer in it named
 * ------------------------------------------------------------------------ */

/**
 * The one prefix, distinct from `dedup.db.test.ts`'s `dedupdbt-` so the two files' leftover
 * sweeps cannot see each other's rows. No `_` and no `%`, so it needs no LIKE escaping.
 */
const PREFIX = "dedupfx-"
const LIKE_PREFIX = `${PREFIX}%`

/** The eight tables this suite writes to, in the order they are counted and reported. */
const TOUCHED_TABLES = [
  "users",
  "organizations",
  "people",
  "deals",
  "notes",
  "duplicate_pairs",
  "custom_field_definitions",
  "audit_log",
] as const

/** The two input fields and the formula that reads BOTH of them. See CLAIM 4. */
const INPUT_A_FIELD = `${PREFIX}Input A`
const INPUT_B_FIELD = `${PREFIX}Input B`
const FORMULA_FIELD = `${PREFIX}Doubled Plus B`

/** The multiplier, written ONCE and shared by the expression and by every expectation. */
const FACTOR = 2

/**
 * The expression, built from the same three names and the same factor the expectations use, so
 * the formula and the arithmetic that predicts it cannot drift apart.
 */
const FORMULA_EXPRESSION = `{{${INPUT_A_FIELD}}} * ${FACTOR} + {{${INPUT_B_FIELD}}}`

/** A wins for the LOSER (that is the whole point); B stays with the survivor. */
const SURVIVOR_INPUT_A = 11
const LOSER_INPUT_A = 37
const SURVIVOR_INPUT_B = 100
const LOSER_INPUT_B = 500

/** The three values the criterion is about, each computed HERE and never read from the engine. */
const SURVIVOR_STORED_BEFORE = SURVIVOR_INPUT_A * FACTOR + SURVIVOR_INPUT_B // 122
const LOSER_STORED_BEFORE = LOSER_INPUT_A * FACTOR + LOSER_INPUT_B // 574
const CORRECT_AFTER_MERGE = LOSER_INPUT_A * FACTOR + SURVIVOR_INPUT_B // 174

/** Floors. Named integers, so a half-failed seed reddens on the floor and not on the claim. */
const MIN_FORMULA_DEFINITIONS = 1
const MIN_INPUT_DEFINITIONS = 2
const MIN_DEFINITIONS_REMOVED = 3
const EXPECTED_REPARENTED_CHILDREN = 1
const NO_REPARENTED_CHILDREN = 0

/** The definition ids, prefixed so `removeFieldDefinitions` can find them. */
const INPUT_A_DEF_ID = `${PREFIX}def-input-a`
const INPUT_B_DEF_ID = `${PREFIX}def-input-b`
const FORMULA_DEF_ID = `${PREFIX}def-formula`

/** The three base rows the fixtures' NOT NULL foreign keys need, created by this suite. */
const OWNER_ID = `${PREFIX}owner`
const PIPELINE_ID = `${PREFIX}pipeline`
const STAGE_ID = `${PREFIX}stage`

/** The two organizations and the pair that links them, created once and RESTORED per cell. */
const SURVIVOR_ID = `${PREFIX}org-survivor`
const LOSER_ID = `${PREFIX}org-loser`
const PAIR_ID = `${PREFIX}pair`
const SURVIVOR_NAME = `${PREFIX}Survivor Ltda`
const LOSER_NAME = `${PREFIX}Loser Ltda ME`

/** `count(*)` per touched table, captured before the first fixture exists. */
const countsBefore = new Map<string, number>()

/**
 * A unique prefixed id, from a COUNTER AND NO CLOCK.
 *
 * `dedup.db.test.ts`'s `fixtureId()` folds `Date.now().toString(36)` in, and that is right for a
 * file whose fixtures must not collide across runs against a shared database. Here they cannot:
 * every row this generator names is deleted in `afterEach`, and the isolated database is rebuilt
 * per run.
 *
 * THE CLOCK READ WAS REMOVED RATHER THAN KEPT, and the reason is a measured gate collision.
 * `src/lib/__tests__/suite-timing-hygiene.test.ts` propagates clock taint by NAME across a whole
 * file and not by scope, so a `const id = fixtureId(...)` anywhere in this file taints EVERY
 * identifier called `id` in it — including the `row?.value` inside the shared `scalar()` helper,
 * which then taints every count derived from it. That reported two `toBeGreaterThanOrEqual` FLOORS
 * over SQL row counts as elapsed-time thresholds. The counts are not clock-derived; the fix is to
 * stop reading a clock this file never needed, not to weaken the gate or to exclude the path.
 */
let sequence = 0
function fixtureId(kind: string): string {
  sequence += 1
  return `${PREFIX}${kind}-${sequence.toString(36)}`
}

/** The stored shape of a formula key. `error` is part of it, and it is asserted. */
interface StoredFormula {
  formula?: unknown
  value?: unknown
  error?: unknown
}

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

/** Live `type='formula'` definitions for `organization`, counted in SQL rather than in JS. */
async function liveFormulaDefinitionCount(): Promise<number> {
  return Number(
    await scalar<number>(
      sql`select count(*)::int as value from custom_field_definitions
           where entity_type = 'organization' and type = 'formula' and deleted_at is null`
    )
  )
}

/** Live non-formula definitions for `organization` — the formula's inputs. */
async function liveInputDefinitionCount(): Promise<number> {
  return Number(
    await scalar<number>(
      sql`select count(*)::int as value from custom_field_definitions
           where entity_type = 'organization' and type = 'number' and deleted_at is null`
    )
  )
}

async function readOrganization(id: string) {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1)
  return row
}

/** The blob of a row, or `{}` — never `any`, and never assumed present. */
async function readBlob(id: string): Promise<Record<string, unknown>> {
  const row = await readOrganization(id)
  return (row?.customFields ?? {}) as Record<string, unknown>
}

async function readStoredFormula(id: string): Promise<StoredFormula> {
  const blob = await readBlob(id)
  return (blob[FORMULA_FIELD] ?? {}) as StoredFormula
}

/** The blob the two organizations are seeded with, and RESTORED to before every cell. */
function survivorSeedBlob(): Record<string, unknown> {
  return {
    [INPUT_A_FIELD]: SURVIVOR_INPUT_A,
    [INPUT_B_FIELD]: SURVIVOR_INPUT_B,
    [FORMULA_FIELD]: { formula: true, value: SURVIVOR_STORED_BEFORE, error: null },
  }
}

function loserSeedBlob(): Record<string, unknown> {
  return {
    [INPUT_A_FIELD]: LOSER_INPUT_A,
    [INPUT_B_FIELD]: LOSER_INPUT_B,
    [FORMULA_FIELD]: { formula: true, value: LOSER_STORED_BEFORE, error: null },
  }
}

/**
 * Reset EVERYTHING a merge writes or TRANSFERS, by direct SQL, before every cell.
 *
 * NEVER THROUGH A MUTATION: the mutations are what is under test, so a restore that used one
 * would be asserting against state the subject produced.
 *
 * `src/lib/execution/actions/crm-ownership.db.test.ts:348-395` measured what a PARTIAL restore
 * costs: five cascaded reds with the positive anchors reporting the wrong cause. A restore that
 * covers what a cell WRITES but not what a merge TRANSFERS is not a restore — a merge moves a
 * value from the loser onto the survivor, soft-deletes the loser, and moves the pair row's
 * status to `merged` and every other open pair to `superseded`. All four are reset here:
 *
 *   - both blobs, so the survivor stops holding the loser's INPUT A and the recomputed formula;
 *   - `deletedAt`, so the loser is live again and the merge's own NOT_FOUND guard does not fire;
 *   - `ownerId` and `name`, because the survivor's UPDATE writes every compared native column;
 *   - the `duplicate_pairs` row's `status`, because the V-9 membership check reads that row and
 *     a second merge of a `merged` pair is not the state any cell here means to exercise.
 */
async function restoreFixtureRows(): Promise<void> {
  await db
    .update(organizations)
    .set({
      name: SURVIVOR_NAME,
      ownerId: OWNER_ID,
      customFields: survivorSeedBlob(),
      deletedAt: null,
      website: null,
      industry: null,
      notes: null,
    })
    .where(eq(organizations.id, SURVIVOR_ID))

  await db
    .update(organizations)
    .set({
      name: LOSER_NAME,
      ownerId: OWNER_ID,
      customFields: loserSeedBlob(),
      deletedAt: null,
      website: null,
      industry: null,
      notes: null,
    })
    .where(eq(organizations.id, LOSER_ID))

  await db.update(duplicatePairs).set({ status: "open" }).where(eq(duplicatePairs.id, PAIR_ID))
}

/** The rows a single cell creates. Deleted after every cell; the pair and the orgs are not. */
async function deleteCellFixtures(): Promise<void> {
  await db.delete(auditLog).where(like(auditLog.actorUserId, LIKE_PREFIX))
  await db.delete(auditLog).where(like(auditLog.entityId, LIKE_PREFIX))
  await db.delete(notes).where(like(notes.id, LIKE_PREFIX))
  await db.delete(notes).where(like(notes.entityId, LIKE_PREFIX))
  await db.delete(deals).where(like(deals.id, LIKE_PREFIX))
  await db.delete(people).where(like(people.id, LIKE_PREFIX))
}

/** Everything, in foreign-key order, child first. Every statement carries the prefix. */
async function hardDeleteEverything(): Promise<void> {
  await deleteCellFixtures()
  await db.delete(duplicatePairs).where(like(duplicatePairs.id, LIKE_PREFIX))
  await db.delete(organizations).where(like(organizations.id, LIKE_PREFIX))
  await db.execute(sql`delete from stages where id like ${LIKE_PREFIX}`)
  await db.execute(sql`delete from pipelines where id like ${LIKE_PREFIX}`)
  await db.execute(sql`delete from users where id like ${LIKE_PREFIX}`)
}

/** Surviving prefixed rows per table, by id AND by the other columns that carry the prefix. */
async function survivingFixtures(): Promise<Record<string, number>> {
  const byColumn = async (table: string, column: string): Promise<number> =>
    Number(
      await scalar<number>(
        sql`select count(*)::int as value from ${sql.identifier(table)}
             where ${sql.identifier(column)} like ${LIKE_PREFIX}`
      )
    )

  return {
    users_by_id: await byColumn("users", "id"),
    organizations_by_id: await byColumn("organizations", "id"),
    organizations_by_name: await byColumn("organizations", "name"),
    people_by_id: await byColumn("people", "id"),
    deals_by_id: await byColumn("deals", "id"),
    deals_by_title: await byColumn("deals", "title"),
    notes_by_id: await byColumn("notes", "id"),
    notes_by_entity_id: await byColumn("notes", "entity_id"),
    duplicate_pairs_by_id: await byColumn("duplicate_pairs", "id"),
    duplicate_pairs_by_record_a: await byColumn("duplicate_pairs", "record_a_id"),
    duplicate_pairs_by_record_b: await byColumn("duplicate_pairs", "record_b_id"),
    custom_field_definitions_by_id: await byColumn("custom_field_definitions", "id"),
    custom_field_definitions_by_name: await byColumn("custom_field_definitions", "name"),
    audit_log_by_entity_id: await byColumn("audit_log", "entity_id"),
    audit_log_by_actor: await byColumn("audit_log", "actor_user_id"),
    pipelines_by_id: await byColumn("pipelines", "id"),
    stages_by_id: await byColumn("stages", "id"),
  }
}

/** A deal on the LOSER, so the merge reparents exactly one child. */
async function insertLoserDeal(): Promise<string> {
  const id = fixtureId("deal")
  await db.insert(deals).values({
    id,
    title: `${PREFIX}deal ${id}`,
    stageId: STAGE_ID,
    ownerId: OWNER_ID,
    organizationId: LOSER_ID,
  })
  return id
}

/**
 * The merge, run the way the server action runs it — inside `runWithActor`, so the audit rows
 * carry a prefixed actor and the teardown's `actor_user_id` sweep is not measuring an absence.
 */
async function mergeAsUser(input: MergeRecordsInput): Promise<MergeRecordsResult> {
  return runWithActor({ kind: "user", userId: OWNER_ID }, () => mergeRecordsMutation(input))
}

/** The choice key the merge picker uses for a custom field: `customFields.<name>`. */
const INPUT_A_CHOICE_KEY = `${CUSTOM_FIELD_PREFIX}${INPUT_A_FIELD}`

/* ---------------------------------------------------------------------------
 * Suite lifecycle
 * ------------------------------------------------------------------------ */

beforeAll(async () => {
  // Anything left behind by an interrupted earlier run, BEFORE the parity snapshot, so the
  // snapshot measures this run rather than the last.
  await hardDeleteEverything()
  await removeFieldDefinitions(LIKE_PREFIX)

  // Clean first, THEN measure. A non-zero count here means the setup script did not run and
  // every parity assertion below would be measuring somebody else's rows.
  for (const table of TOUCHED_TABLES) {
    const n = await tableCount(table)
    expect(
      n,
      `${table} is not empty in ${TEST_DATABASE} — run scripts/dedup-db-test-setup.sh`
    ).toBe(0)
    countsBefore.set(table, n)
  }

  await db.execute(
    sql`insert into users (id, email, name)
        values (${OWNER_ID}, ${`${PREFIX}owner@local.test`}, ${`${PREFIX}owner`})`
  )
  await db.execute(
    sql`insert into pipelines (id, name, owner_id)
        values (${PIPELINE_ID}, ${`${PREFIX}pipeline`}, ${OWNER_ID})`
  )
  await db.execute(
    sql`insert into stages (id, pipeline_id, name, position)
        values (${STAGE_ID}, ${PIPELINE_ID}, ${`${PREFIX}stage`}, 1)`
  )

  // The subject this phase has none of. See CLAIM 2.
  await mintFieldDefinition({
    id: INPUT_A_DEF_ID,
    entityType: "organization",
    name: INPUT_A_FIELD,
    type: "number",
    position: "10001",
  })
  await mintFieldDefinition({
    id: INPUT_B_DEF_ID,
    entityType: "organization",
    name: INPUT_B_FIELD,
    type: "number",
    position: "10002",
  })
  await mintFieldDefinition({
    id: FORMULA_DEF_ID,
    entityType: "organization",
    name: FORMULA_FIELD,
    type: "formula",
    config: { expression: FORMULA_EXPRESSION },
    position: "10003",
  })

  await db.insert(organizations).values([
    { id: SURVIVOR_ID, name: SURVIVOR_NAME, ownerId: OWNER_ID, customFields: survivorSeedBlob() },
    { id: LOSER_ID, name: LOSER_NAME, ownerId: OWNER_ID, customFields: loserSeedBlob() },
  ])

  // The canonical ordering `duplicate_pairs` demands: `recordAId` is the smaller id.
  const [recordAId, recordBId] = [SURVIVOR_ID, LOSER_ID].sort()
  await db.insert(duplicatePairs).values({
    id: PAIR_ID,
    entityType: "organization",
    recordAId,
    recordBId,
    tier: "certain",
    reason: "nameIdentity",
  })
})

beforeEach(async () => {
  await restoreFixtureRows()
})

afterEach(async () => {
  await deleteCellFixtures()
})

afterAll(async () => {
  // Runs even if a cell failed: a red suite must not be a red suite AND a dirty database.
  await hardDeleteEverything()

  const removed = await removeFieldDefinitions(LIKE_PREFIX)
  expect(
    removed,
    "the definition teardown removed fewer rows than this file minted. A teardown that " +
      "silently removed nothing is how a leaked type='formula' definition reaches the next " +
      "suite in the same run and activates the recalculation path in a file that never asked " +
      "for one — which is the ONE leak from this file that does not merely litter a table."
  ).toBeGreaterThanOrEqual(MIN_DEFINITIONS_REMOVED)

  const surviving = await survivingFixtures()
  for (const [label, n] of Object.entries(surviving)) {
    expect(n, `${label}: a prefixed fixture row survived the teardown`).toBe(0)
  }

  // THE ANTI-VACUITY ANCHOR FOR THE PREFIX SWEEP. A prefix query can only see rows this file
  // CREATED; it is blind to a row it accidentally MUTATED or DELETED. Total counts are not —
  // and `dedup.db.test.ts` asserting these same tables EMPTY is what makes an incomplete
  // teardown here surface as a red in a file that did nothing wrong.
  const parity: Record<string, { before: number; after: number }> = {}
  for (const table of TOUCHED_TABLES) {
    parity[table] = { before: countsBefore.get(table) ?? -1, after: await tableCount(table) }
  }
  for (const table of TOUCHED_TABLES) {
    expect(
      parity[table].after,
      `${table}: row count changed from ${parity[table].before} to ${parity[table].after} — ` +
        "this suite mutated data it did not create, or left data it did"
    ).toBe(parity[table].before)
  }

  console.log(
    `[dedup-formula.db.test] parity ${JSON.stringify(parity)} / definitions removed ${removed}`
  )

  await db.$client.end({ timeout: 5 })
})

/* ---------------------------------------------------------------------------
 * The guard, first, because it is the precondition for everything else
 * ------------------------------------------------------------------------ */

describe("the isolation guard", () => {
  it("accepts the two loopback spellings, and only for the isolated database", () => {
    expect(assertIsolatedConnection(`postgres://u:p@localhost:5433/${TEST_DATABASE}`)).toContain(
      "localhost"
    )
    expect(assertIsolatedConnection(`postgres://u:p@127.0.0.1:5433/${TEST_DATABASE}`)).toContain(
      "127.0.0.1"
    )
  })

  it("REFUSES THE DEVELOPMENT DATABASE and says why", () => {
    // The single most important assertion in this file. `pipelite` on localhost passes every
    // host check there is; only the database-name check stops it, and without it this suite
    // would be MERGING the operator's real organizations.
    expect(() =>
      assertIsolatedConnection(`postgres://u:p@localhost:5433/${DEV_DATABASE}`)
    ).toThrow(/DEVELOPMENT database/)
    expect(() =>
      assertIsolatedConnection(`postgres://u:p@localhost:5433/${DEV_DATABASE}`)
    ).toThrow(new RegExp(`names database "${DEV_DATABASE}"`))
  })

  it("refuses any other database name, and a name that merely contains the allowed one", () => {
    expect(() => assertIsolatedConnection("postgres://u:p@localhost:5433/postgres")).toThrow(
      /names database "postgres"/
    )
    expect(() =>
      assertIsolatedConnection(`postgres://u:p@localhost:5433/${TEST_DATABASE}_2`)
    ).toThrow(/not "pipelite_dedup_test"/)
  })

  it("refuses a non-loopback host and NAMES it", () => {
    expect(() =>
      assertIsolatedConnection(`postgres://u:p@db.internal.example.com:5432/${TEST_DATABASE}`)
    ).toThrow(/db\.internal\.example\.com/)
    // A hostname that merely CONTAINS "localhost" is not loopback.
    expect(() =>
      assertIsolatedConnection(`postgres://u:p@localhost.evil.example:5432/${TEST_DATABASE}`)
    ).toThrow(/localhost\.evil\.example/)
  })

  it("refuses an absent connection string", () => {
    expect(() => assertIsolatedConnection(undefined)).toThrow(/DATABASE_URL is not set/)
    expect(() => assertIsolatedConnection("")).toThrow(/DATABASE_URL is not set/)
  })

  it("the connection this suite actually resolved is the isolated database on loopback", () => {
    const url = new URL(CONNECTION)
    expect(["localhost", "127.0.0.1"]).toContain(url.hostname)
    expect(url.pathname).toBe(`/${TEST_DATABASE}`)
  })
})

/* ---------------------------------------------------------------------------
 * The pre-flight floors. Every one of them, before any claim is made.
 * ------------------------------------------------------------------------ */

describe("SC-3 pre-flight floors", () => {
  it(`FLOOR: at least ${MIN_FORMULA_DEFINITIONS} live type='formula' definition exists on organization`, async () => {
    expect(
      await liveFormulaDefinitionCount(),
      "with ZERO formula definitions `scopeFormulasToChangedFields` returns an empty scope " +
        "before reading a row, `recalculateOneEntity` writes nothing, and EVERY assertion in " +
        "this file passes against an un-derived blob — before AND after the fix. The live " +
        "database held zero of these on 2026-08-26 (49-01), which is why the fixture mints " +
        "its own. This floor is what makes the rest of the file a proof."
    ).toBeGreaterThanOrEqual(MIN_FORMULA_DEFINITIONS)

    expect(
      await liveInputDefinitionCount(),
      "the formula reads two number fields; without their definitions " +
        "`buildFormulaFieldValues` would not seed them and the expression would error rather " +
        "than compute."
    ).toBeGreaterThanOrEqual(MIN_INPUT_DEFINITIONS)
  })

  it("FLOOR: the survivor's and the loser's INPUT A values DIFFER before the merge", async () => {
    const survivorBlob = await readBlob(SURVIVOR_ID)
    const loserBlob = await readBlob(LOSER_ID)

    expect(survivorBlob[INPUT_A_FIELD]).toBe(SURVIVOR_INPUT_A)
    expect(loserBlob[INPUT_A_FIELD]).toBe(LOSER_INPUT_A)
    expect(
      survivorBlob[INPUT_A_FIELD],
      "if the two records agreed on the field the formula reads, the CORRECT answer and the " +
        "STALE answer would be the same number and this file could not discriminate between " +
        "a merge that recomputed and a merge that did nothing. SC-3's wording — 'two records " +
        "whose formula inputs disagree' — is the fixture requirement, not decoration."
    ).not.toBe(loserBlob[INPUT_A_FIELD])
  })

  it("FLOOR: the survivor keeps INPUT B, so the correct answer is a MIXTURE of both records", async () => {
    const survivorBlob = await readBlob(SURVIVOR_ID)
    const loserBlob = await readBlob(LOSER_ID)

    expect(survivorBlob[INPUT_B_FIELD]).toBe(SURVIVOR_INPUT_B)
    expect(loserBlob[INPUT_B_FIELD]).toBe(LOSER_INPUT_B)

    // The three numbers must be pairwise distinct, or the discriminator below is satisfiable
    // by copying rather than by computing. With a SINGLE input the correct post-merge answer
    // would have been the loser's own stored value.
    expect(
      CORRECT_AFTER_MERGE,
      "the correct post-merge value must differ from the survivor's stored value, or 'it " +
        "changed' is unobservable"
    ).not.toBe(SURVIVOR_STORED_BEFORE)
    expect(
      CORRECT_AFTER_MERGE,
      "the correct post-merge value must differ from the LOSER's stored value, or a merge " +
        "that merely COPIED the loser's formula key would satisfy the discriminator"
    ).not.toBe(LOSER_STORED_BEFORE)
    expect(SURVIVOR_STORED_BEFORE).not.toBe(LOSER_STORED_BEFORE)
  })

  it("FLOOR: each record's stored formula value is consistent with its OWN inputs before the merge", async () => {
    // So that "it changed" later means the MERGE changed it, and not that it was wrong to
    // begin with.
    const survivorStored = await readStoredFormula(SURVIVOR_ID)
    const loserStored = await readStoredFormula(LOSER_ID)

    expect(survivorStored.value).toBe(SURVIVOR_STORED_BEFORE)
    expect(survivorStored.error).toBe(null)
    expect(loserStored.value).toBe(LOSER_STORED_BEFORE)
    expect(loserStored.error).toBe(null)
  })
})

/* ---------------------------------------------------------------------------
 * THE PROOF
 * ------------------------------------------------------------------------ */

describe("SC-3 / DATA-01 — the survivor's formula after a merge", () => {
  it("recomputes the survivor's formula from its POST-MERGE inputs, with one reparented child", async () => {
    const dealId = await insertLoserDeal()
    const storedBefore = await readStoredFormula(SURVIVOR_ID)
    expect(storedBefore.value).toBe(SURVIVOR_STORED_BEFORE)

    const result = await mergeAsUser({
      entityType: "organization",
      pairId: PAIR_ID,
      survivorId: SURVIVOR_ID,
      loserId: LOSER_ID,
      // THE LOSER'S VALUE FOR INPUT A. See CLAIM 3 — an all-survivor map proves nothing.
      choices: { [INPUT_A_CHOICE_KEY]: "loser" },
    })

    expect(result).toMatchObject({ success: true })
    expect(
      (result as { movedChildren: number }).movedChildren,
      "the reparented-children block must actually have had a child to refresh, so this cell " +
        "is the ORDINARY merge and not a degenerate one"
    ).toBe(EXPECTED_REPARENTED_CHILDREN)

    const [movedDeal] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1)
    expect(movedDeal?.organizationId).toBe(SURVIVOR_ID)

    const blobAfter = await readBlob(SURVIVOR_ID)

    // 1. The merge did what it was ASKED to do. This half passes before the fix too, which is
    //    what localises the defect to the recomputation rather than to the merge.
    expect(
      blobAfter[INPUT_A_FIELD],
      "the survivor must now hold the LOSER's INPUT A — if it does not, the defect under test " +
        "is not reached and the failure below would be about the merge, not about the formula"
    ).toBe(LOSER_INPUT_A)
    expect(blobAfter[INPUT_B_FIELD]).toBe(SURVIVOR_INPUT_B)

    const storedAfter = (blobAfter[FORMULA_FIELD] ?? {}) as StoredFormula

    // 2. THE CRITERION. The value equals a computation performed HERE from the survivor's
    //    post-merge inputs — never read from the engine.
    expect(
      storedAfter.value,
      `the survivor now holds INPUT A = ${LOSER_INPUT_A} and INPUT B = ${SURVIVOR_INPUT_B}, so ` +
        `the only value consistent with the record is ${LOSER_INPUT_A} * ${FACTOR} + ` +
        `${SURVIVOR_INPUT_B} = ${CORRECT_AFTER_MERGE}. A stored ${SURVIVOR_STORED_BEFORE} means ` +
        "nothing was recomputed; a stored " +
        `${LOSER_STORED_BEFORE} means the loser's value was copied rather than computed.`
    ).toBe(CORRECT_AFTER_MERGE)

    // 3. THE DISCRIMINATORS. A merge that recomputed nothing fails here; so does one that
    //    took the loser's key wholesale.
    expect(storedAfter.value).not.toBe(SURVIVOR_STORED_BEFORE)
    expect(storedAfter.value).not.toBe(LOSER_STORED_BEFORE)

    // 4. THE SHAPE. `error` asserted NULL, so a merge that stored an internal error string
    //    cannot pass by having "changed".
    expect(storedAfter.formula).toBe(true)
    expect(
      storedAfter.error,
      "a stored error is not a recomputation. Without this the discriminator above is " +
        "satisfied by the engine failing in a new way."
    ).toBe(null)
  })

  it("recomputes the survivor's formula when there are NO reparented children at all", async () => {
    // THE STRONGEST FORM OF THE DEFECT. `recalcReparentedChildren` builds its work list as
    // `[...movedDeals, ...movedPeople]` and returns immediately when it is empty, so an
    // organization pair with no shared deals and no shared people recomputes LITERALLY
    // NOTHING today — and that pair shape is common, not contrived.
    const result = await mergeAsUser({
      entityType: "organization",
      pairId: PAIR_ID,
      survivorId: SURVIVOR_ID,
      loserId: LOSER_ID,
      choices: { [INPUT_A_CHOICE_KEY]: "loser" },
    })

    expect(result).toMatchObject({ success: true })
    expect(
      (result as { movedChildren: number }).movedChildren,
      "this cell is only the no-children case if nothing was reparented; a stray child from a " +
        "previous cell would make it a duplicate of the one above"
    ).toBe(NO_REPARENTED_CHILDREN)

    const blobAfter = await readBlob(SURVIVOR_ID)
    expect(blobAfter[INPUT_A_FIELD]).toBe(LOSER_INPUT_A)

    const storedAfter = (blobAfter[FORMULA_FIELD] ?? {}) as StoredFormula
    expect(
      storedAfter.value,
      "with no reparented children the existing post-commit block returns before it calls the " +
        "engine at all, so this is the case in which the survivor's formula is refreshed by " +
        "nothing whatsoever."
    ).toBe(CORRECT_AFTER_MERGE)
    expect(storedAfter.error).toBe(null)
  })

  it("produces the same value a FRESH recalculation of the same row produces, without bumping updated_at", async () => {
    // THE SECOND, INDEPENDENT PATH TO THE SAME ANSWER. The merge's value is compared against
    // what a plain edit would have produced on the identical post-merge row — which is exactly
    // the asymmetry FORM-01 named: a merge must not leave a record in a state a normal save
    // could never leave it in.
    const result = await mergeAsUser({
      entityType: "organization",
      pairId: PAIR_ID,
      survivorId: SURVIVOR_ID,
      loserId: LOSER_ID,
      choices: { [INPUT_A_CHOICE_KEY]: "loser" },
    })
    expect(result).toMatchObject({ success: true })

    const afterMerge = await readOrganization(SURVIVOR_ID)
    const mergeValue = ((afterMerge?.customFields ?? {}) as Record<string, unknown>)[
      FORMULA_FIELD
    ] as StoredFormula
    const updatedAtAfterMerge = afterMerge?.updatedAt
    expect(mergeValue.value).toBe(CORRECT_AFTER_MERGE)

    // Blank the formula key by direct SQL, WITHOUT touching `updated_at`, so the recomputation
    // below has something to do and the timestamp has a fixed reference point.
    const blanked = { ...((afterMerge?.customFields ?? {}) as Record<string, unknown>) }
    delete blanked[FORMULA_FIELD]
    await db
      .update(organizations)
      .set({ customFields: blanked })
      .where(eq(organizations.id, SURVIVOR_ID))

    const afterBlank = await readOrganization(SURVIVOR_ID)
    expect(
      ((afterBlank?.customFields ?? {}) as Record<string, unknown>)[FORMULA_FIELD]
    ).toBeUndefined()
    // ANTI-VACUITY for the timestamp claim: the blanking statement itself must not have moved
    // `updated_at`, or the equality afterwards would be measuring the wrong statement.
    expect(afterBlank?.updatedAt).toEqual(updatedAtAfterMerge)

    const fresh = await recalculateFormulas({
      entityType: "organization",
      entityId: SURVIVOR_ID,
      // The BARE name — the spelling `scopeFormulasToChangedFields` actually matches.
      changedFields: [INPUT_A_FIELD],
      cascade: false,
    })

    const afterFresh = await readOrganization(SURVIVOR_ID)
    const freshValue = ((afterFresh?.customFields ?? {}) as Record<string, unknown>)[
      FORMULA_FIELD
    ] as StoredFormula

    expect(
      freshValue.value,
      "a fresh recalculation of the SAME post-merge row must reach the same answer the merge " +
        "reached; if it does not, one of the two is deriving from something other than the " +
        "record's own values"
    ).toBe(mergeValue.value)
    expect(freshValue.value).toBe(CORRECT_AFTER_MERGE)
    expect(freshValue.error).toBe(null)
    // The returned blob is the one the caller folds into its payload (D-17).
    expect((fresh.customFields ?? {})[FORMULA_FIELD]).toEqual(freshValue)

    // T-49-08-07. The engine deliberately omits `updatedAt` so a DERIVED refresh stays
    // distinguishable from a user edit in the audit log. The merge's post-commit block calls
    // this same function on this same row, so this is that property, observed.
    expect(
      afterFresh?.updatedAt,
      "the recalculation wrote `custom_fields` and must NOT have bumped `updated_at`: a second " +
        "bump makes a derived-value refresh indistinguishable from a user edit in Phase 36's " +
        "audit log"
    ).toEqual(updatedAtAfterMerge)
  })

  /* -------------------------------------------------------------------------
   * THE VACUITY CONTROL — a MEASUREMENT, not a redundant duplicate.
   * ---------------------------------------------------------------------- */

  it("VACUITY CONTROL: with the SURVIVOR winning INPUT A this same assertion passes with or without the fix — do not delete it", async () => {
    // WHAT THIS CELL IS FOR, AND WHY IT MUST NOT BE "SIMPLIFIED" INTO THE CELLS ABOVE.
    //
    // It runs the identical merge with the identical assertion SHAPE, changing exactly one
    // thing: the `choices` map leaves INPUT A with the SURVIVOR. That makes the correct answer
    // and the stale answer THE SAME NUMBER, and it was RUN AGAINST THE UNFIXED MUTATION AND
    // RECORDED PASSING (plan 49-08 Task 3). Under the fix it passes for a different reason
    // again: nothing changed, so `changedFields` is empty and the engine deliberately writes
    // nothing at all.
    //
    // So: an SC-3 test whose `choices` map is empty or all-survivor reports SUCCESS against
    // the defect. This cell is the evidence for that sentence, which is why the real proof's
    // map takes the loser's value and why a reader must not "align" the two.
    const result = await mergeAsUser({
      entityType: "organization",
      pairId: PAIR_ID,
      survivorId: SURVIVOR_ID,
      loserId: LOSER_ID,
      // Deliberately the SURVIVOR. This is the vacuous fixture, on purpose.
      choices: { [INPUT_A_CHOICE_KEY]: "survivor" },
    })
    expect(result).toMatchObject({ success: true })

    const blobAfter = await readBlob(SURVIVOR_ID)
    expect(blobAfter[INPUT_A_FIELD]).toBe(SURVIVOR_INPUT_A)
    expect(blobAfter[INPUT_B_FIELD]).toBe(SURVIVOR_INPUT_B)

    const storedAfter = (blobAfter[FORMULA_FIELD] ?? {}) as StoredFormula

    // The same assertion shape as the real proof — and it cannot discriminate, because
    // `SURVIVOR_INPUT_A * FACTOR + SURVIVOR_INPUT_B` is also what was already stored.
    expect(
      storedAfter.value,
      "if this cell is ever the ONLY SC-3 evidence in the tree, the criterion is unproven: " +
        "the value it asserts is identical to the one already stored before the merge ran."
    ).toBe(SURVIVOR_INPUT_A * FACTOR + SURVIVOR_INPUT_B)
    expect(storedAfter.value).toBe(SURVIVOR_STORED_BEFORE)
  })
})

/* ---------------------------------------------------------------------------
 * The loser, and the tables nothing should have touched
 * ------------------------------------------------------------------------ */

describe("SC-3 — what the recalculation must NOT have changed", () => {
  it("leaves the LOSER's own blob alone and its tombstone intact", async () => {
    const result = await mergeAsUser({
      entityType: "organization",
      pairId: PAIR_ID,
      survivorId: SURVIVOR_ID,
      loserId: LOSER_ID,
      choices: { [INPUT_A_CHOICE_KEY]: "loser" },
    })
    expect(result).toMatchObject({ success: true })

    const loser = await readOrganization(LOSER_ID)
    expect(loser?.deletedAt, "the loser must be in Trash — that IS the merge").not.toBe(null)

    // The recalculation names the SURVIVOR. A survivor-rooted cascade or a mis-scoped call
    // that walked back onto the loser would show up here.
    const loserBlob = (loser?.customFields ?? {}) as Record<string, unknown>
    const loserStored = (loserBlob[FORMULA_FIELD] ?? {}) as StoredFormula
    expect(loserStored.value).toBe(LOSER_STORED_BEFORE)
    expect(loserBlob[INPUT_A_FIELD]).toBe(LOSER_INPUT_A)

    // The pair row settled, so this cell really did run the whole mutation.
    const [pair] = await db
      .select({ status: duplicatePairs.status })
      .from(duplicatePairs)
      .where(and(eq(duplicatePairs.id, PAIR_ID), eq(duplicatePairs.entityType, "organization")))
      .limit(1)
    expect(pair?.status).toBe("merged")
  })
})

/* ---------------------------------------------------------------------------
 * WR-01 — the survivor adopts the loser's OUTPUT, not its input
 * ------------------------------------------------------------------------ */

/** The choice key for the FORMULA field itself, which is the whole point of the cells below. */
const FORMULA_CHOICE_KEY = `${CUSTOM_FIELD_PREFIX}${FORMULA_FIELD}`

/**
 * WHAT THE THREE CELLS ABOVE PROVE, AND WHAT THEY DO NOT.
 *
 * 49-08 proved SC-3 for the case where the survivor adopts one of the loser's **INPUTS**: INPUT A
 * moves, `survivorChangedFields` carries `"dedupfx-Input A"`, the formula's ref matches, and the
 * engine recomputes `174`.
 *
 * THIS IS THE OTHER CASE: the survivor adopts the loser's **OUTPUT** while no input changes at all.
 *
 * `survivorChangedFields` is built from the values that changed, and
 * `scopeFormulasToChangedFields` selects a formula only when one of its **refs** is in that set. A
 * formula's OWN NAME being in `changedFields` selects nothing — there is no branch that looks for
 * it. But the merge writes `customFields` WHOLESALE and a `formula`-typed key was a compared merge
 * field like any other, so the merge could overwrite the survivor's derived value with the loser's
 * while none of that formula's inputs moved, and block 1 would then correctly decide there was
 * nothing to recompute.
 *
 * The result is a stored derived value the record's own inputs contradict — DATA-01, in the block
 * written to close DATA-01 — and it is also a formula value the server did not compute, which is
 * the T-34-04 invariant every other write path enforces through `stripFormulaKeys`.
 *
 * THE NUMBERS ARE THE EXISTING FIXTURE'S, and the floor cell above already asserts all three
 * pairwise distinct, so nothing here rests on a new arithmetic claim:
 *
 *   - `SURVIVOR_STORED_BEFORE` = 122 = 11·2 + 100 — the correct value for the survivor's inputs,
 *     which these cells do not change;
 *   - `LOSER_STORED_BEFORE`    = 574 = 37·2 + 500 — the value the merge adopted;
 *   - `CORRECT_AFTER_MERGE`    = 174 — the OTHER case's answer, named here only to exclude it.
 */
describe("WR-01 / SC-3 — a formula value adopted from the loser must not stand", () => {
  it("recomputes rather than adopting, when the survivor has NO formula key and the loser does", async () => {
    // THE `filledOnly` SHAPE, WHICH NEEDS NO CLICK AT ALL. A formula definition added after the
    // survivor's last save leaves the survivor with no key for it; the loser, saved later, has
    // one. `buildMergeFieldGroups` then puts the FORMULA key in `filledOnly`, whose default is the
    // LOSER. This is the reviewer's `{Receita: 10, Score: 84}` scenario, with this file's numbers.
    const blobWithoutFormula = {
      [INPUT_A_FIELD]: SURVIVOR_INPUT_A,
      [INPUT_B_FIELD]: SURVIVOR_INPUT_B,
    }
    await db
      .update(organizations)
      .set({ customFields: blobWithoutFormula })
      .where(eq(organizations.id, SURVIVOR_ID))

    // ANCHORS. The survivor really has no key, the loser really has a value, and the two inputs
    // this cell keeps really are the survivor's.
    const before = await readBlob(SURVIVOR_ID)
    expect(
      FORMULA_FIELD in before,
      "the survivor must have NO formula key for this cell to be about adoption rather than " +
        "about a conflict",
    ).toBe(false)
    expect((await readStoredFormula(LOSER_ID)).value).toBe(LOSER_STORED_BEFORE)

    const result = await mergeAsUser({
      entityType: "organization",
      pairId: PAIR_ID,
      survivorId: SURVIVOR_ID,
      loserId: LOSER_ID,
      // The SURVIVOR keeps INPUT A, so NOTHING the formula reads changes. That is the point: with
      // an empty `changedFields` for every ref, the engine has no reason to run — and the adopted
      // value would stand forever.
      choices: { [INPUT_A_CHOICE_KEY]: "survivor" },
    })
    expect(result).toMatchObject({ success: true })

    const after = await readBlob(SURVIVOR_ID)

    // The inputs really did stay the survivor's, so the "correct" value below is not the other
    // case's 174 by accident.
    expect(after[INPUT_A_FIELD]).toBe(SURVIVOR_INPUT_A)
    expect(after[INPUT_B_FIELD]).toBe(SURVIVOR_INPUT_B)

    const stored = (after[FORMULA_FIELD] ?? {}) as StoredFormula

    // THE CRITERION. Equal to a fresh computation from the survivor's POST-MERGE inputs.
    expect(
      stored.value,
      "WR-01: the survivor permanently stores a derived value its own inputs contradict. It is " +
        "also a formula value the server did not compute — the T-34-04 invariant every other " +
        "write path enforces via `stripFormulaKeys`.",
    ).toBe(SURVIVOR_INPUT_A * FACTOR + SURVIVOR_INPUT_B)
    // Spelled a second way, against the named constant, so a red names the number a reader can
    // look up in the floor cell above.
    expect(stored.value).toBe(SURVIVOR_STORED_BEFORE)
    // And the two exclusions the floor cell's pairwise-distinctness buys.
    expect(stored.value).not.toBe(LOSER_STORED_BEFORE)
    expect(stored.value).not.toBe(CORRECT_AFTER_MERGE)
    expect(stored.error).toBe(null)
  })

  it("refuses an EXPLICIT choice of the loser's formula value — the server is the sole writer", async () => {
    // THE `conflicts` SHAPE, ASKED FOR BY NAME. Both records hold a value, they differ, and the
    // caller names the formula key and picks the loser. `stripFormulaKeys` stops a client doing
    // this through `/api/custom-fields/save` and through every `/api/v1` route; the merge picker
    // was the one write path with no equivalent.
    const storedBefore = await readStoredFormula(SURVIVOR_ID)
    expect(storedBefore.value, "anchor: the survivor starts on its own value").toBe(
      SURVIVOR_STORED_BEFORE,
    )
    expect((await readStoredFormula(LOSER_ID)).value).toBe(LOSER_STORED_BEFORE)

    const result = await mergeAsUser({
      entityType: "organization",
      pairId: PAIR_ID,
      survivorId: SURVIVOR_ID,
      loserId: LOSER_ID,
      choices: {
        // Inputs stay the survivor's, so nothing the formula reads changes.
        [INPUT_A_CHOICE_KEY]: "survivor",
        // And the derived value is demanded from the loser, explicitly.
        [FORMULA_CHOICE_KEY]: "loser",
      },
    })
    expect(result).toMatchObject({ success: true })

    const after = await readBlob(SURVIVOR_ID)
    expect(after[INPUT_A_FIELD]).toBe(SURVIVOR_INPUT_A)
    expect(after[INPUT_B_FIELD]).toBe(SURVIVOR_INPUT_B)

    const stored = (after[FORMULA_FIELD] ?? {}) as StoredFormula
    expect(
      stored.value,
      "WR-01: a choice map set the survivor's derived value directly. No other write path in the " +
        "product allows that.",
    ).toBe(SURVIVOR_STORED_BEFORE)
    expect(stored.value).not.toBe(LOSER_STORED_BEFORE)
  })

  it("still recomputes from a CHANGED input when the loser's formula value is adopted too", async () => {
    // THE BARRIER, and it is the cell that stops the fix from being "never touch the formula key".
    // Both are asked for from the loser: INPUT A *and* the derived value. The input genuinely
    // changed, so the answer is neither record's stored value — it is 174, the MIXTURE. A fix that
    // simply pinned the survivor's own formula value would leave 122 here and reintroduce the very
    // staleness 49-08 removed.
    const result = await mergeAsUser({
      entityType: "organization",
      pairId: PAIR_ID,
      survivorId: SURVIVOR_ID,
      loserId: LOSER_ID,
      choices: {
        [INPUT_A_CHOICE_KEY]: "loser",
        [FORMULA_CHOICE_KEY]: "loser",
      },
    })
    expect(result).toMatchObject({ success: true })

    const after = await readBlob(SURVIVOR_ID)
    expect(after[INPUT_A_FIELD], "anchor: INPUT A really did move").toBe(LOSER_INPUT_A)
    expect(after[INPUT_B_FIELD]).toBe(SURVIVOR_INPUT_B)

    const stored = (after[FORMULA_FIELD] ?? {}) as StoredFormula
    expect(
      stored.value,
      "the fix must not become 'never touch the formula key': INPUT A moved, so the stored value " +
        "has to be recomputed from the MIXTURE and not pinned to either record's own.",
    ).toBe(CORRECT_AFTER_MERGE)
    expect(stored.value).not.toBe(SURVIVOR_STORED_BEFORE)
    expect(stored.value).not.toBe(LOSER_STORED_BEFORE)
  })
})
