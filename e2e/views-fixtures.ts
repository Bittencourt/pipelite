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

/* ==============================================================================================
 * THE V-40-8 VISIBILITY TRIAD, DECLARED ONCE.
 *
 * WHY HERE AND NOT IN A SPEC (plan 40-16 asked for the choice to be made explicitly, so this is the
 * answer and the reason).
 *
 * The same three fixtures are needed by TWO spec files that run under DIFFERENT projects —
 * `saved-views-visibility-member.spec.ts` under `chromium-member` and
 * `saved-views-visibility-admin.spec.ts` under `chromium`. Exporting them from the member spec and
 * importing that spec from the admin spec would work as a module import and would be a trap: a
 * Playwright spec file that imports another spec file REGISTERS THAT FILE'S TESTS INTO ITSELF, so
 * the member spec's tests would also run under the admin project's storageState — running every
 * "is this invisible to a member?" assertion as an ADMIN. That is precisely the failure mode
 * `member.setup.ts` exists to rule out, reintroduced through the import graph.
 *
 * So the triad lives in this module, which is deliberately NOT a spec (see the file header) and
 * therefore cannot be collected by any project.
 *
 * THE TWO DIRECTIONS ARE NOT SYMMETRIC AND THAT IS THE POINT. `ADMIN_PRIVATE` must be invisible to
 * the member because it is somebody else's private view — the unsurprising direction. `MEMBER_PRIVATE`
 * must be invisible to the ADMIN, which departs from this app's `owner || role === "admin"` idiom
 * (`src/app/deals/actions.ts:83`, locked for Trash in 37-CONTEXT.md:31). Decision 3 breaks that idiom
 * on purpose: "private" that an admin can read is not private.
 * ============================================================================================ */

/**
 * The three names. Distinct enough that `getByText(..., { exact: true })` cannot confuse them, and
 * all three carry `VIEWS_FIXTURE_PREFIX` so `insertViewFixture` accepts them and the purge reclaims
 * them.
 */
export const VISIBILITY_FIXTURE_NAMES = {
  adminPrivate: `${VIEWS_FIXTURE_PREFIX} visibility ADMIN_PRIVATE`,
  adminShared: `${VIEWS_FIXTURE_PREFIX} visibility ADMIN_SHARED`,
  memberPrivate: `${VIEWS_FIXTURE_PREFIX} visibility MEMBER_PRIVATE`,
} as const

/**
 * One `search` term each, and each term NAMES ITS OWN VIEW.
 *
 * 40-15's deviation 4 established that a fixture term must return rows wherever an assertion depends
 * on rows existing — behind an empty list its V-40-11 probe would have passed with the defect
 * present. NOTHING IN THE V-40-8 SPECS DEPENDS ON A ROW: every assertion is about which view names
 * appear in a menu, which controls a manage row carries, and which params a redirect emits. A
 * self-describing term is worth more here than a populated table, because assertion 7 reads
 * `search=adminshared` back out of the address bar and a term like `ltda` would make the three
 * fixtures indistinguishable in the URL. Measured: all three match 0 of 46,054 organizations, and
 * that is accepted for these three fixtures and for no others.
 */
export const VISIBILITY_FIXTURE_FILTERS = {
  adminPrivate: { search: "adminprivate" },
  adminShared: { search: "adminshared" },
  memberPrivate: { search: "memberprivate" },
} as const

export interface VisibilityFixtureIds {
  adminPrivateId: string
  adminSharedId: string
  memberPrivateId: string
}

export interface SeedVisibilityFixturesInput {
  adminEmail: string
  memberEmail: string
  /**
   * THE NEGATIVE-PROBE HANDLE, and it is a parameter rather than an edit so the probe can be RUN
   * from the command line without touching a committed file.
   *
   * `E2E_VIEWS_PROBE=share-private` flips both private fixtures to shared. Every "this view is
   * absent" assertion in both directions must then go RED. That is the non-vacuity proof for a
   * visibility gate: an assertion that cannot see a view it IS allowed to see proves nothing when
   * it reports the view is hidden.
   */
  shareThePrivateOnes?: boolean
}

/**
 * Seed the triad on `entityType: "organization"` and return the three ids.
 *
 * `organization` because it is the surface both sessions can reach with no pipeline, no stage and no
 * activity type to resolve — `SAVEABLE_FILTER_KEYS.organization` is `["search"]` alone, so nothing
 * here can be dropped by the read-side validator and a `views.degraded` notice cannot appear to
 * confuse a visibility assertion with a degradation one.
 */
export async function seedVisibilityFixtures(
  sql: ViewsDb,
  { adminEmail, memberEmail, shareThePrivateOnes = false }: SeedVisibilityFixturesInput
): Promise<VisibilityFixtureIds> {
  const adminPrivateId = await insertViewFixture(sql, {
    ownerEmail: adminEmail,
    entityType: "organization",
    name: VISIBILITY_FIXTURE_NAMES.adminPrivate,
    filters: { ...VISIBILITY_FIXTURE_FILTERS.adminPrivate },
    isShared: shareThePrivateOnes,
  })

  const adminSharedId = await insertViewFixture(sql, {
    ownerEmail: adminEmail,
    entityType: "organization",
    name: VISIBILITY_FIXTURE_NAMES.adminShared,
    filters: { ...VISIBILITY_FIXTURE_FILTERS.adminShared },
    isShared: true,
  })

  const memberPrivateId = await insertViewFixture(sql, {
    ownerEmail: memberEmail,
    entityType: "organization",
    name: VISIBILITY_FIXTURE_NAMES.memberPrivate,
    filters: { ...VISIBILITY_FIXTURE_FILTERS.memberPrivate },
    isShared: shareThePrivateOnes,
  })

  return { adminPrivateId, adminSharedId, memberPrivateId }
}

/** `true` when the run was launched with the V-40-8 non-vacuity probe active. */
export function visibilityProbeIsActive(): boolean {
  return process.env.E2E_VIEWS_PROBE === "share-private"
}
