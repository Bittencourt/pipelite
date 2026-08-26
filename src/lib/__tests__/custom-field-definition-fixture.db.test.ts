/**
 * =============================================================================
 * custom-field-definition-fixture.db.test.ts — THE FIXTURE'S OWN SELF-CHECK
 * =============================================================================
 *
 * This file proves the one property every later proof in Phase 49 silently depends on, and it is a
 * property that ONLY a real database can exhibit: **`getActiveFieldDefinitions` is uncached, so a
 * definition inserted mid-run is picked up by the very next call.**
 *
 * A mocked test could not prove that. Mocking `@/db` means deciding what the reader returns, which
 * is exactly the question — "does a row written after this process started become visible to the
 * production reader?" A mock answers "yes" by construction, whether or not the real reader caches,
 * memoises at module scope, or holds a stale snapshot inside a transaction. Three of Phase 49's four
 * criteria mint a definition mid-run and then drive production code that reads definitions; if that
 * hand-off did not work, those proofs would assert against a definition list that never contained
 * their subject, find nothing to check, and pass. So the hand-off itself gets a behavioural test.
 *
 * WHY THIS FIXTURE HAS TO EXIST AT ALL. Measured against the running `pipelite` database on
 * 2026-08-26: `custom_field_definitions` holds 169 live rows — 62 `text`, 56 `multi_select`,
 * 28 `single_select`, 12 `number`, 11 `date` — and **zero of `type='formula'` and zero of
 * `type='file'`**. Re-measured in plan 49-01 Task 1 rather than inherited from research. With zero
 * formula definitions `recalculateFormulas` writes nothing, so an SC-4 divergence test is green
 * before AND after the fix; with zero file definitions an SC-2 purge test asserts about an empty
 * set. A test that does not manufacture its own subject is not a proof.
 *
 * THE MOCK BUDGET IS ZERO. Nothing is mocked in this file — not `@/db`, not `@/lib/custom-fields`.
 * The fixture writes through the real drizzle client and the assertions read through the real
 * production reader. Nothing that decides the outcome under test is substituted.
 *
 * WHY THIS FILE OWNS A WAVE. `scripts/dedup-db-test-setup.sh` drops and rebuilds every schema in
 * `pipelite_dedup_test`, so two plans that each own a `*.db.test.ts` may never share a wave. Plan
 * 49-01 is wave 1's only db-test owner.
 *
 * DELIBERATELY NOT DONE: `src/lib/mutations/dedup.db.test.ts` is left untouched. Its `beforeAll`
 * asserts every touched table is EMPTY and its `afterAll` asserts parity, so adding
 * `custom_field_definitions` to its `TOUCHED_TABLES` would be a two-sided change to a file this
 * plan does not own. This file instead cleans up after itself completely — hard delete, asserted by
 * a returned count AND by a baseline-equal total — so `dedup.db.test.ts` never sees a leak to report.
 * A later plan that mints definitions from inside `dedup.db.test.ts` itself must do that work there.
 * =============================================================================
 */
import { eq, isNull, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { db } from "@/db"
import { customFieldDefinitions, type FormulaConfig } from "@/db/schema"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"

import {
  mintFieldDefinition,
  removeFieldDefinitions,
} from "./custom-field-definition-fixture"

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
        "This suite creates and hard-deletes custom-field definitions.",
    )
  }

  const database = url.pathname.replace(/^\//, "")

  if (database !== TEST_DATABASE) {
    throw new Error(
      `refusing to run: connection names database "${database}", not "${TEST_DATABASE}". ` +
        (database === DEV_DATABASE
          ? `"${DEV_DATABASE}" is the DEVELOPMENT database and holds 169 live custom-field ` +
            "definitions driving 188,619 real records; this suite hard-deletes its fixtures and " +
            "must never be pointed at it. "
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
const PREFIX = "cfdfix-"
const LIKE_PREFIX = `${PREFIX}%`

const FORMULA_DEF_ID = `${PREFIX}def-formula`
const FILE_DEF_ID = `${PREFIX}def-file`

/**
 * The field NAMES, and the `/` constraint is load-bearing rather than stylistic.
 *
 * A file custom field is served by `/api/files/${entityId}/${fieldName}/${storedName}` — three URL
 * segments. Live field names in this deployment are Portuguese with spaces and punctuation
 * (`Código Mãe`, `CNPJ / CPF`), and a field name containing `/` cannot round-trip through a
 * three-segment route at all. The condition is dormant today only because there are zero live file
 * definitions; the moment a fixture mints one, the fixture inherits the constraint. Asserted below
 * rather than merely commented, because the SC-1 and SC-2 fixtures will copy these names.
 */
const FORMULA_FIELD_NAME = `${PREFIX}dobro`
const FILE_FIELD_NAME = `${PREFIX}anexo`

/** The entity type both definitions are minted for. One is enough to prove the hand-off. */
const ENTITY_TYPE = "organization" as const

/**
 * THE TWO NUMBERS THIS FILE TURNS ON, declared once and consumed by BOTH the seed and the
 * assertions so the two cannot drift.
 *
 * Each is a named literal rather than a value computed from the same query it is checking: an
 * assertion that derives both of its sides from one source passes on an empty table, which is
 * precisely the failure this file exists to rule out. `MINTED_TOTAL` is also asserted to be
 * non-zero, so "the correct rows" cannot be satisfied by zero rows.
 */
const MINTED_TOTAL = 2
const EXPECTED_MATCHES_PER_TYPE = 1

/**
 * The pre-mint counts, captured in `beforeAll` BEFORE anything is minted.
 *
 * Captured rather than queried inside the cell because the seed runs in the same hook: by the time
 * any `it` body executes, the formula definition exists. Recording the number at the only moment it
 * is meaningful, and asserting it afterwards, keeps the floor honest and order-independent.
 */
let preMintFormulaCount = -1
let preMintFileCount = -1
/** The total row count of the table with this fixture ABSENT — what `afterAll` compares against. */
let baselineTotal = -1

async function countAllDefinitions(): Promise<number> {
  const rows = await db.execute(sql`select count(*)::int as n from custom_field_definitions`)

  return Number((rows as unknown as { n: number }[])[0].n)
}

/**
 * A direct SQL count by `type`, deliberately NOT routed through `getActiveFieldDefinitions` — the
 * reader under test must not be the instrument that measures it.
 */
async function countLiveByType(type: string): Promise<number> {
  const rows = await db.execute(
    sql`select count(*)::int as n from custom_field_definitions
        where type = ${type} and deleted_at is null`,
  )

  return Number((rows as unknown as { n: number }[])[0].n)
}

async function countPrefixed(): Promise<number> {
  const rows = await db.execute(
    sql`select count(*)::int as n from custom_field_definitions where id like ${LIKE_PREFIX}`,
  )

  return Number((rows as unknown as { n: number }[])[0].n)
}

/* ---------------------------------------------------------------------------
 * Setup / teardown
 * ------------------------------------------------------------------------ */

beforeAll(async () => {
  // CLEAN FIRST, THEN MEASURE — and the ORDER is the whole point.
  //
  // `afterAll` asserts `countAllDefinitions() === baselineTotal`. If the baseline were captured
  // INCLUDING leftovers from a previous aborted run and those rows were then deleted, a run killed
  // after `beforeAll` (Ctrl-C, container restart, OOM) would convert itself into a false RED on the
  // NEXT run: every test green, the suite red in teardown, describing a mutated pre-existing row
  // that never existed. Cleaning first makes the baseline a measurement of the table WITHOUT this
  // fixture, which is what `afterAll` is comparing against, and makes a post-crash run self-healing.
  await removeFieldDefinitions(LIKE_PREFIX)

  preMintFormulaCount = await countLiveByType("formula")
  preMintFileCount = await countLiveByType("file")
  baselineTotal = await countAllDefinitions()

  await mintFieldDefinition({
    id: FORMULA_DEF_ID,
    entityType: ENTITY_TYPE,
    name: FORMULA_FIELD_NAME,
    type: "formula",
    // `{{Field}}` is the engine's interpolation syntax (`formula-engine.test.ts:7`). Passed through
    // untouched by the fixture: what a formula computes is the caller's business, not the fixture's.
    config: { expression: `{{${PREFIX}origem}} * 2`, resultType: "number" },
  })

  await mintFieldDefinition({
    id: FILE_DEF_ID,
    entityType: ENTITY_TYPE,
    name: FILE_FIELD_NAME,
    type: "file",
    config: { maxFiles: 2, maxSize: 1024 },
  })
}, 60_000)

afterAll(async () => {
  await removeFieldDefinitions(LIKE_PREFIX)

  // Half 1: nothing of ours is left.
  expect(await countPrefixed()).toBe(0)
  // Half 2: and nothing that was NOT ours changed in number either. This is what catches a
  // pre-existing row that was mutated rather than created — a prefix sweep cannot see one. The two
  // halves are NOT redundant: a teardown that soft-deleted instead of hard-deleting leaves the rows
  // in the table, so half 1 (which counts by id prefix, ignoring `deleted_at`) would also catch it,
  // but a teardown that deleted the right number of the WRONG rows is caught only by half 2.
  expect(await countAllDefinitions()).toBe(baselineTotal)
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

describe("BASELINE FLOOR — what makes the hand-off assertion mean something", () => {
  it("held ZERO live formula definitions before the fixture minted one", () => {
    expect(
      preMintFormulaCount,
      "if the isolated database already held a formula definition, 'the reader returns the minted " +
        "definition' would pass without the fixture having worked at all — the reader would simply " +
        "be returning somebody else's row. This is the floor that rules that out.",
    ).toBe(0)
  })

  it("held ZERO live file definitions before the fixture minted one", () => {
    expect(preMintFileCount).toBe(0)
  })

  it("mints a NON-ZERO number of definitions, so no count assertion below is satisfiable by an empty table", () => {
    expect(MINTED_TOTAL).toBeGreaterThan(0)
    expect(EXPECTED_MATCHES_PER_TYPE).toBeGreaterThan(0)
  })
})

describe("the uncached reader picks up a definition inserted mid-run — the property a mock cannot show", () => {
  it("returns the minted FORMULA definition, with its expression round-tripped", async () => {
    const definitions = await getActiveFieldDefinitions(ENTITY_TYPE)

    const matches = definitions.filter((definition) => definition.id === FORMULA_DEF_ID)

    expect(
      matches,
      "`getActiveFieldDefinitions` did not return a definition written after this process started. " +
        "Every Phase 49 proof that mints a subject mid-run depends on this hand-off; if it fails, " +
        "those proofs assert against a definition list that never contained their subject.",
    ).toHaveLength(EXPECTED_MATCHES_PER_TYPE)

    const [minted] = matches

    expect(minted!.name).toBe(FORMULA_FIELD_NAME)
    expect(minted!.type).toBe("formula")
    expect(minted!.entityType).toBe(ENTITY_TYPE)
    // The config is what makes a formula definition ACTIVATE the recalculation path, so its
    // round-trip through JSONB is asserted rather than assumed.
    expect((minted!.config as FormulaConfig).expression).toBe(`{{${PREFIX}origem}} * 2`)
    expect((minted!.config as FormulaConfig).resultType).toBe("number")
  })

  it("returns the minted FILE definition, whose name contains no forward slash", async () => {
    const definitions = await getActiveFieldDefinitions(ENTITY_TYPE)

    const matches = definitions.filter((definition) => definition.id === FILE_DEF_ID)

    expect(matches).toHaveLength(EXPECTED_MATCHES_PER_TYPE)
    expect(matches[0]!.name).toBe(FILE_FIELD_NAME)
    expect(matches[0]!.type).toBe("file")

    // The SC-1/SC-2 fixtures copy this name. `/api/files/[entityId]/[fieldName]/[filename]` is a
    // three-segment route, so a field name containing `/` cannot round-trip through it.
    expect(
      FILE_FIELD_NAME,
      "a file field name containing '/' cannot round-trip through the three-segment file route",
    ).not.toContain("/")
  })

  it("CALLER-SUPPLIED ID IS WHAT LANDED — no row acquired a UUID from the column default", async () => {
    // `custom_field_definitions.id` carries `$defaultFn(() => crypto.randomUUID())`. A fixture that
    // let the default fire would produce an unprefixed id that this prefix-scoped count — and the
    // prefix-scoped teardown — could not see. The exact literal is the whole assertion.
    expect(await countPrefixed()).toBe(MINTED_TOTAL)
  })
})

describe("SOFT-DELETE DISCRIMINATION — why teardown must HARD delete", () => {
  it("stops returning a definition whose deletedAt is set, while the row is still in the table", async () => {
    await db
      .update(customFieldDefinitions)
      .set({ deletedAt: new Date() })
      .where(eq(customFieldDefinitions.id, FILE_DEF_ID))

    const definitions = await getActiveFieldDefinitions(ENTITY_TYPE)

    expect(definitions.filter((definition) => definition.id === FILE_DEF_ID)).toHaveLength(0)

    // And the row is STILL THERE. This is the discrimination: the reader ignores it, a parity check
    // counts it. A teardown that soft-deleted would leave `MINTED_TOTAL` invisible rows behind for
    // the next suite in the same run — which, for a `formula` definition, silently activates the
    // recalculation path in a file that never asked for one.
    const stillPresent = await db
      .select({ id: customFieldDefinitions.id })
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.id, FILE_DEF_ID))

    expect(stillPresent).toHaveLength(1)

    // Restore it, so the teardown cell below removes two LIVE rows rather than one live and one
    // soft-deleted. A restore that covers the fields a cell writes but not the field it flips is
    // not a restore (crm-ownership.db.test.ts:348-395, five cascaded reds).
    await db
      .update(customFieldDefinitions)
      .set({ deletedAt: null })
      .where(eq(customFieldDefinitions.id, FILE_DEF_ID))

    const restored = await db
      .select({ id: customFieldDefinitions.id })
      .from(customFieldDefinitions)
      .where(
        eq(customFieldDefinitions.id, FILE_DEF_ID),
      )
    expect(restored).toHaveLength(1)
    expect(
      (
        await db
          .select({ id: customFieldDefinitions.id })
          .from(customFieldDefinitions)
          .where(isNull(customFieldDefinitions.deletedAt))
          .then((rows) => rows.filter((row) => row.id === FILE_DEF_ID))
      ).length,
    ).toBe(1)
  })
})

describe("TEARDOWN removes exactly what it created", () => {
  it(`hard-deletes the ${MINTED_TOTAL} minted rows and reports that number back`, async () => {
    const removed = await removeFieldDefinitions(LIKE_PREFIX)

    expect(
      removed,
      "the returned count is what lets a caller assert a floor on its own teardown rather than " +
        "trusting it. A teardown that silently removed nothing would leave a formula definition " +
        "behind and activate the recalculation path for the next suite in the run.",
    ).toBe(MINTED_TOTAL)

    expect(await countPrefixed()).toBe(0)
    // And the table is back where it started — nothing else was caught by the prefix sweep.
    expect(await countAllDefinitions()).toBe(baselineTotal)
  })

  it("is idempotent: a second sweep removes nothing and says so", async () => {
    // Rules out a teardown that reports a count it did not achieve. `afterAll` runs this same sweep
    // a third time, so it must be safe to repeat.
    expect(await removeFieldDefinitions(LIKE_PREFIX)).toBe(0)
  })
})

describe("the fixture writes through the same table the production reader reads", () => {
  it("finds the minted ids by a direct LIKE on the production table name", async () => {
    // Re-mint one row so this cell has a subject of its own, then remove it. Declared last so it
    // cannot disturb the teardown cells above.
    await mintFieldDefinition({
      id: `${PREFIX}def-roundtrip`,
      entityType: ENTITY_TYPE,
      name: `${PREFIX}roundtrip`,
      type: "formula",
      config: { expression: "1 + 1" },
    })

    const rows = await db
      .select({ id: customFieldDefinitions.id, position: customFieldDefinitions.position })
      .from(customFieldDefinitions)
      .where(like(customFieldDefinitions.id, LIKE_PREFIX))

    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(`${PREFIX}def-roundtrip`)
    // `position` is `numeric(20,10)`, which drizzle surfaces as a string. The fixture's default has
    // to be a value the column accepts, so the round-trip is asserted rather than assumed.
    expect(typeof rows[0]!.position).toBe("string")

    expect(await removeFieldDefinitions(LIKE_PREFIX)).toBe(1)
  })
})
