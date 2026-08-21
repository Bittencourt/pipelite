/**
 * Saved-view fixtures for the Phase 40 e2e specs.
 *
 * A MODULE AND NOT A SPEC, deliberately. A `views-fixtures.spec.ts` would be
 * collected by the default `chromium` project and would assert the same things
 * plan 40-15 asserts, so the proof that these helpers work was run from the
 * command line instead and recorded in 40-04-SUMMARY.md. There is nothing here to
 * execute; there are only helpers for the specs that come next.
 *
 * ---------------------------------------------------------------------------
 * THE FIXTURE RULE (39-VALIDATION V-4, the posture `e2e/deals-drag.spec.ts`
 * established in 45-08 and `merge-screen-320.spec.ts` repeated).
 *
 * These functions INSERT and DELETE rows in the live development database — the
 * one holding 46,054 real organizations, 38,348 real people and 79,022 real
 * activities. Three rules follow from that, and each is enforced in code below
 * rather than left to the caller's good intentions:
 *
 *   1. Every fixture name starts with `VIEWS_FIXTURE_PREFIX`, and
 *      `insertViewFixture` THROWS on a name that does not. That throw is what
 *      makes the prefix-scoped purge EXACT rather than hopeful: a purge is only as
 *      selective as the insert side is disciplined, and a single unprefixed row
 *      would be stranded forever by a purge that cannot see it.
 *   2. Every delete is scoped by that prefix. There is no unqualified
 *      `delete from saved_views` in this file and there must never be one.
 *   3. The purge is scoped to THIS prefix and not to `[e2e]%`, which would reach
 *      `deals-drag.spec.ts`'s and `merge-screen-320.spec.ts`'s fixtures too.
 *
 * CONCURRENCY. Plan 39-10 established that the suite genuinely runs spec FILES on
 * two workers even under `fullyParallel: false` — that option serialises tests
 * within a file, not files against each other. So a `select count(*) from
 * saved_views` parity assertion would report a sibling file's in-flight fixture as
 * this file's contamination. Everything here is therefore scoped by prefix, and
 * any leak assertion a caller writes must be too.
 *
 * TEARDOWN ORDERING, which 39-19 learned the hard way: `purgeViewFixtures`
 * performs only MUTATIONS and returns counts. It asserts nothing. A leak assertion
 * placed before a restore step aborts teardown on failure and strands the very row
 * it was complaining about, so assertions belong in the caller, AFTER every purge
 * call has returned.
 * ---------------------------------------------------------------------------
 */

import postgres from "postgres"

// Relative, not `@/…`, and TYPE-ONLY: this module must not drag a schema module's
// runtime into the Playwright process, which has no Next.js request context.
import type { EntityType } from "../src/db/schema/custom-fields"

/**
 * The one prefix. Deliberately unmistakable: a human who finds a view called
 * "[e2e] View …" in their picker knows immediately that it is machinery and not
 * something a colleague saved.
 */
export const VIEWS_FIXTURE_PREFIX = "[e2e] View"

/** `LIKE` pattern for the prefix. `[`, `]` and a space are all literal in Postgres `LIKE` — it has no bracket classes — and the prefix contains neither `%` nor `_`, so no escaping is needed. */
const PREFIX_PATTERN = `${VIEWS_FIXTURE_PREFIX}%`

export type ViewsDb = ReturnType<typeof openDb>

/**
 * Open a connection to the HOST-mapped dev Postgres.
 *
 * The loopback allow-list is the same one `e2e/seed-admin.ts`, `e2e/seed-member.ts`
 * and `e2e/merge-screen-320.spec.ts` apply, repeated rather than imported because
 * it is a GUARD: this module writes and deletes rows, so it must be impossible to
 * aim at a shared or production database. A loopback host is the one place the
 * operator provably owns the target.
 */
export function openDb() {
  const connectionString = process.env.E2E_DATABASE_URL
  if (!connectionString) {
    throw new Error(
      "E2E_DATABASE_URL is not set. It must point at the HOST-mapped dev Postgres " +
        "(localhost:5433); the app-facing DATABASE_URL resolves postgres:5432 inside the " +
        "Docker network and is unreachable from here."
    )
  }

  const hostname = new URL(connectionString).hostname
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `E2E_DATABASE_URL host "${hostname}" is not a local development database. ` +
        "The saved-view fixtures refuse to write anywhere but localhost / 127.0.0.1."
    )
  }

  return postgres(connectionString)
}

/**
 * Resolve a seeded account's id.
 *
 * Throws rather than returning null when the account is missing, and the message
 * names the cause: the setup project has not run, so `e2e/.auth/*.json` is stale or
 * absent too. A helper that returned null here would surface later as a
 * null-violates-not-null insert error pointing at the wrong line.
 */
export async function userIdByEmail(sql: ViewsDb, email: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    select id from users where email = ${email} limit 1
  `
  if (rows.length === 0) {
    throw new Error(
      `No user with email "${email}". The e2e accounts are created by the setup ` +
        "project — run `npx playwright test --project=setup` first."
    )
  }
  return rows[0].id
}

export interface InsertViewFixtureInput {
  ownerEmail: string
  entityType: EntityType
  name: string
  filters: Record<string, string>
  isShared: boolean
}

/**
 * Insert one saved view and return its id.
 *
 * `id` is supplied explicitly because the column has NO database default — the
 * schema's `$defaultFn(() => crypto.randomUUID())` is a Drizzle-side default and
 * is invisible to raw SQL. `created_at` / `updated_at` do default, so they are
 * left alone.
 */
export async function insertViewFixture(
  sql: ViewsDb,
  { ownerEmail, entityType, name, filters, isShared }: InsertViewFixtureInput
): Promise<string> {
  // THE GUARD THAT MAKES THE PURGE EXACT. See rule 1 in the file header: an
  // unprefixed fixture is a row `purgeViewFixtures` cannot see and therefore
  // cannot reclaim, in a database nobody is going to hand-clean.
  if (!name.startsWith(VIEWS_FIXTURE_PREFIX)) {
    throw new Error(
      `Fixture view name "${name}" does not start with "${VIEWS_FIXTURE_PREFIX}". ` +
        "Every fixture must carry the prefix, because the purge is scoped by it — " +
        "an unprefixed row would be stranded in the live development database."
    )
  }

  const ownerId = await userIdByEmail(sql, ownerEmail)

  const rows = await sql<{ id: string }[]>`
    insert into saved_views (id, owner_id, entity_type, name, filters, is_shared)
    values (
      gen_random_uuid()::text, ${ownerId}, ${entityType}, ${name},
      ${sql.json(filters)}, ${isShared}
    )
    returning id
  `
  return rows[0].id
}

export interface SetDefaultFixtureInput {
  userEmail: string
  entityType: EntityType
  viewId: string
}

/**
 * Make `viewId` the given user's default for `entityType`.
 *
 * An UPSERT on the (user_id, entity_type) primary key rather than a delete-then-
 * insert, matching what the table is for: `saved_view_defaults` exists precisely
 * so that a user may default to SOMEONE ELSE'S shared view (UI-SPEC G-7), which a
 * boolean on the view row could not express. Nothing here checks that `viewId` is
 * shared or is owned by `userEmail` — the G-7 cross-owner case is a thing specs
 * must be able to set up, and the visibility rule is what those specs measure.
 */
export async function setDefaultFixture(
  sql: ViewsDb,
  { userEmail, entityType, viewId }: SetDefaultFixtureInput
): Promise<void> {
  const userId = await userIdByEmail(sql, userEmail)

  await sql`
    insert into saved_view_defaults (user_id, entity_type, view_id)
    values (${userId}, ${entityType}, ${viewId})
    on conflict (user_id, entity_type)
    do update set view_id = excluded.view_id, updated_at = now()
  `
}

/**
 * The e2e accounts. Their defaults are harness state by definition, so the purge
 * may clear them; a human's default is never touched.
 *
 * Duplicated as literals rather than imported from the two seed modules on
 * purpose: importing `seed-member.ts` here would pull `argon2` (via
 * `src/lib/password`) into every spec that only wants to insert a row.
 */
const E2E_ACCOUNT_EMAILS = ["pipelite-e2e@local.test", "pipelite-e2e-member@local.test"]

export interface PurgeCounts {
  defaults: number
  views: number
}

/**
 * Reclaim every fixture this module could have created. MUTATES ONLY — see the
 * teardown-ordering note in the file header. Call it from `beforeAll` as well as
 * `afterAll`, so a run crashed mid-test is reclaimed by the next one.
 *
 * Two deletes, in this order:
 *
 *   1. `saved_view_defaults`. The FK to `saved_views` is ON DELETE CASCADE, so
 *      step 2 alone would remove the rows pointing AT a fixture — but not a
 *      default an e2e account set against a view this module did not create
 *      (a view the developer saved by hand, say, which a spec then clicked "set as
 *      default" on). That row survives the cascade and would silently redirect the
 *      next run's first page load into a filtered list. Hence both predicates, and
 *      hence this step running first: after the cascade there is nothing left to
 *      count.
 *   2. `saved_views`, scoped strictly by name prefix.
 *
 * Returns both counts so a caller can log what it reclaimed — and so that a purge
 * which matched nothing is distinguishable from one which matched everything. Both
 * exit cleanly.
 */
export async function purgeViewFixtures(sql: ViewsDb): Promise<PurgeCounts> {
  const deletedDefaults = await sql`
    delete from saved_view_defaults
    where view_id in (select id from saved_views where name like ${PREFIX_PATTERN})
       or user_id in (select id from users where email in ${sql(E2E_ACCOUNT_EMAILS)})
  `

  const deletedViews = await sql`
    delete from saved_views where name like ${PREFIX_PATTERN}
  `

  return { defaults: deletedDefaults.count, views: deletedViews.count }
}
