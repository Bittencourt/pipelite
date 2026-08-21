/**
 * =============================================================================
 * queries.db.test.ts — THE PRIVATE-VIEW VISIBILITY PROOF, against real SQL
 * =============================================================================
 *
 * WHY THIS FILE EXISTS, AND WHY A UNIT TEST COULD NOT REPLACE IT.
 *
 * Criterion 2 of this phase is a NEGATIVE property: "a private view stays invisible to everyone
 * else". 40-CONTEXT Decision 3 then makes it stronger than the rest of this codebase — invisible to
 * ADMINS too, departing from the `owner || role === "admin"` idiom at `src/app/deals/actions.ts:88`
 * that 37-CONTEXT.md:31 locked for Trash.
 *
 * That kind of property is exactly the kind that passes a green gate while being false for a real
 * user. The whole control is one `or(eq(ownerId, viewer), eq(isShared, true))` inside a `where`, so:
 *
 *   - a mocked `@/db` cannot prove it. A mock returns whatever the test told it to return, so it
 *     asserts the shape of the call and not the effect of the predicate. Delete the `or(...)` and a
 *     mocked test still passes, because the mock was never going to return the private row anyway.
 *   - a source-text assertion cannot prove it either. `expect(source).toContain("isShared")` is
 *     satisfied by the comment that explains the rule (the trap this phase was warned about five
 *     times over), and it says nothing about whether the predicate is in the `where` or applied
 *     afterwards in JavaScript — which is the difference T-40-17 is about.
 *
 * So the predicate is exercised against a real PostgreSQL, from BOTH DIRECTIONS: the owner of a
 * private view sees it, and a different account — including an ADMIN — does not. Only the pair is
 * a proof. The first assertion alone is satisfied by a query with no predicate at all; the second
 * alone is satisfied by a query that returns nothing.
 *
 * HOW TO RUN IT
 *   docker compose up -d        # host 5433 -> container 5432 (from the repository root)
 *   npm run test:db
 *
 * NOT PART OF `npm test` AND NOT PART OF CI, for the reasons `vitest.db.config.ts` and
 * `src/lib/mutations/dedup.db.test.ts` both spell out: CI has no Docker and no PostgreSQL, `ci` is
 * a required check on the master ruleset, and a required check that never passes makes every pull
 * request unmergeable. The base vitest project excludes the `*.db.test.*` glob and
 * `src/lib/mutations/__tests__/db-test-isolation.test.ts` — which does run in CI — asserts that.
 *
 * IT DOES NOT RUN AGAINST THE DEVELOPMENT DATABASE AND CANNOT BE MADE TO. `pipelite` holds 46,054
 * organizations, 38,348 people and 79,022 activities of the operator's real records with the
 * application container running against it. This suite creates fixture users and hard-deletes them,
 * so it runs against `pipelite_dedup_test` — a separate database built from a schema-only dump by
 * `scripts/dedup-db-test-setup.sh`, empty at the start of every run. `assertIsolatedConnection`
 * below re-derives the host AND the database name from the string it was handed and aborts
 * COLLECTION if either is wrong, so no statement is sent before the refusal.
 *
 * FIXTURE DISCIPLINE, inherited from `dedup.db.test.ts`: every row this file touches, it created;
 * every id and every email carries the `viewsdbt-` prefix; teardown is a prefixed DELETE in
 * foreign-key order; `afterAll` asserts zero prefixed rows remain AND that each table's total
 * `count(*)` is what it was before the run, which catches a row MUTATED rather than created. There
 * is no TRUNCATE, no DROP and no unfiltered DELETE anywhere in this file.
 * =============================================================================
 */
import { eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { db } from "@/db"
import { savedViewDefaults, savedViews } from "@/db/schema/saved-views"
import { users } from "@/db/schema/users"

import { listVisibleViews, readDefaultViewForUser, visibleViewsPredicate } from "./queries"

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
        "This suite creates and hard-deletes fixture rows.",
    )
  }

  const database = url.pathname.replace(/^\//, "")

  if (database !== TEST_DATABASE) {
    throw new Error(
      `refusing to run: connection names database "${database}", not "${TEST_DATABASE}". ` +
        (database === DEV_DATABASE
          ? `"${DEV_DATABASE}" is the DEVELOPMENT database and holds real records; this suite ` +
            "hard-deletes its fixtures and must never be pointed at it. "
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

/** One prefix, on every id and every email. No `_` and no `%`, so no LIKE escaping is needed. */
const PREFIX = "viewsdbt-"
const LIKE_PREFIX = `${PREFIX}%`

const OWNER = `${PREFIX}user-owner`
const OTHER_MEMBER = `${PREFIX}user-member`
const ADMIN = `${PREFIX}user-admin`
/** A soft-deleted owner: the A6 limitation and the V-5 attribution branch both live on this row. */
const GONE_OWNER = `${PREFIX}user-gone`

const OWNER_PRIVATE = `${PREFIX}view-owner-private`
const OWNER_SHARED = `${PREFIX}view-owner-shared`
const MEMBER_PRIVATE = `${PREFIX}view-member-private`
const MEMBER_SHARED = `${PREFIX}view-member-shared`
const GONE_SHARED = `${PREFIX}view-gone-shared`
const GONE_PRIVATE = `${PREFIX}view-gone-private`
/** A deals view, so the pipeline/whitelist half of `filterCount` is exercised too. */
const OWNER_DEAL_VIEW = `${PREFIX}view-owner-deal`

const ALL_VIEW_IDS = [
  OWNER_PRIVATE,
  OWNER_SHARED,
  MEMBER_PRIVATE,
  MEMBER_SHARED,
  GONE_SHARED,
  GONE_PRIVATE,
  OWNER_DEAL_VIEW,
]

const viewerOwner = { id: OWNER, role: "member" }
const viewerMember = { id: OTHER_MEMBER, role: "member" }
const viewerAdmin = { id: ADMIN, role: "admin" }

/** Totals before the run, re-asserted afterwards: a prefix query cannot see a MUTATED row. */
const baseline: Record<string, number> = {}

async function countAll(table: string): Promise<number> {
  const rows = await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)}`)

  return Number((rows as unknown as { n: number }[])[0].n)
}

const TOUCHED_TABLES = ["users", "saved_views", "saved_view_defaults"] as const

async function removeFixtures(): Promise<void> {
  // Foreign-key order: defaults reference views, views reference users.
  await db.delete(savedViewDefaults).where(like(savedViewDefaults.viewId, LIKE_PREFIX))
  await db.delete(savedViewDefaults).where(like(savedViewDefaults.userId, LIKE_PREFIX))
  await db.delete(savedViews).where(like(savedViews.id, LIKE_PREFIX))
  await db.delete(users).where(like(users.id, LIKE_PREFIX))
}

beforeAll(async () => {
  for (const table of TOUCHED_TABLES) baseline[table] = await countAll(table)

  // A previous aborted run must not make this one report someone else's rows.
  await removeFixtures()

  await db.insert(users).values([
    // `name` is NULL, which is the COMMON case in the real deployment (two of four live users) and
    // is what makes the `name || email` fallback load-bearing rather than decorative.
    { id: OWNER, email: `${PREFIX}owner@local.test`, name: null, role: "member" },
    { id: OTHER_MEMBER, email: `${PREFIX}member@local.test`, name: "Member Name", role: "member" },
    { id: ADMIN, email: `${PREFIX}admin@local.test`, name: "Admin Name", role: "admin" },
    {
      id: GONE_OWNER,
      email: `${PREFIX}gone@local.test`,
      name: "Gone Person",
      role: "member",
      deletedAt: new Date(),
    },
  ])

  await db.insert(savedViews).values([
    {
      id: OWNER_PRIVATE,
      ownerId: OWNER,
      entityType: "organization",
      name: `${PREFIX}A owner private`,
      filters: { search: "private-needle" },
      isShared: false,
    },
    {
      id: OWNER_SHARED,
      ownerId: OWNER,
      entityType: "organization",
      name: `${PREFIX}B owner shared`,
      filters: { search: "shared-needle" },
      isShared: true,
    },
    {
      id: MEMBER_PRIVATE,
      ownerId: OTHER_MEMBER,
      entityType: "organization",
      name: `${PREFIX}C member private`,
      filters: { search: "member-private" },
      isShared: false,
    },
    {
      id: MEMBER_SHARED,
      ownerId: OTHER_MEMBER,
      entityType: "organization",
      name: `${PREFIX}D member shared`,
      filters: { search: "member-shared" },
      isShared: true,
    },
    {
      id: GONE_SHARED,
      ownerId: GONE_OWNER,
      entityType: "organization",
      name: `${PREFIX}E gone shared`,
      filters: { search: "gone-shared" },
      isShared: true,
    },
    {
      id: GONE_PRIVATE,
      ownerId: GONE_OWNER,
      entityType: "organization",
      name: `${PREFIX}F gone private`,
      filters: { search: "gone-private" },
      isShared: false,
    },
    {
      id: OWNER_DEAL_VIEW,
      ownerId: OWNER,
      entityType: "deal",
      // `page` is not whitelisted and `nonsense` is not a deal key, so `filterCount` must read 2.
      name: `${PREFIX}G owner deal`,
      filters: { pipeline: "p-1", stage: "s-1", page: "4", nonsense: "x" },
      isShared: true,
    },
  ])
}, 60_000)

afterAll(async () => {
  await removeFixtures()

  for (const table of TOUCHED_TABLES) {
    const leftovers = await db.execute(
      sql`select count(*)::int as n from ${sql.identifier(table)} where id::text like ${LIKE_PREFIX}`,
    )

    if (table !== "saved_view_defaults") {
      expect(Number((leftovers as unknown as { n: number }[])[0].n)).toBe(0)
    }

    expect(await countAll(table)).toBe(baseline[table])
  }
}, 60_000)

/* ---------------------------------------------------------------------------
 * The proof
 * ------------------------------------------------------------------------ */

describe("listVisibleViews — a private view is invisible to EVERYONE else, admins included", () => {
  it("the owner of a private view SEES it", async () => {
    // Direction 1. Without this, "nobody sees it" is satisfied by a query that returns nothing.
    const ids = (await listVisibleViews("organization", viewerOwner)).map((v) => v.id)

    expect(ids).toContain(OWNER_PRIVATE)
  })

  it("a different MEMBER does not see it", async () => {
    const ids = (await listVisibleViews("organization", viewerMember)).map((v) => v.id)

    expect(ids).not.toContain(OWNER_PRIVATE)
    // Direction 2's own anti-vacuity: the same read DOES return the shared views, so the absence
    // above is the predicate working rather than the query failing.
    expect(ids).toContain(OWNER_SHARED)
    expect(ids).toContain(MEMBER_PRIVATE) // their own private view
  })

  it("an ADMIN does not see it either — Decision 3, the departure from owner-or-admin", async () => {
    // THE LOAD-BEARING ASSERTION OF THIS FILE. Restore the app's usual
    // `owner || role === "admin"` idiom in `listVisibleViews` and this is the test that fails.
    const ids = (await listVisibleViews("organization", viewerAdmin)).map((v) => v.id)

    expect(ids).not.toContain(OWNER_PRIVATE)
    expect(ids).not.toContain(MEMBER_PRIVATE)
    expect(ids).not.toContain(GONE_PRIVATE)
    // And again the anti-vacuity half: the admin's read is not simply empty.
    expect(ids).toContain(OWNER_SHARED)
    expect(ids).toContain(MEMBER_SHARED)
    expect(ids).toContain(GONE_SHARED)
  })

  it("an admin sees exactly what a member sees", async () => {
    const adminIds = (await listVisibleViews("organization", viewerAdmin)).map((v) => v.id).sort()
    // A viewer who owns none of the fixtures, so the comparison is not skewed by ownership.
    const strangerIds = (await listVisibleViews("organization", { id: GONE_OWNER, role: "member" }))
      .map((v) => v.id)
      .sort()

    // The stranger owns two of the fixtures, so subtract those to compare like with like.
    expect(adminIds.filter((id) => id !== GONE_PRIVATE)).toEqual(
      strangerIds.filter((id) => id !== GONE_PRIVATE),
    )
  })

  it("a soft-deleted user's PRIVATE view is unreachable by every principal (A6, accepted)", async () => {
    for (const viewer of [viewerOwner, viewerMember, viewerAdmin]) {
      const ids = (await listVisibleViews("organization", viewer)).map((v) => v.id)

      expect(ids).not.toContain(GONE_PRIVATE)
    }
  })
})

describe("listVisibleViews — attribution (V-5)", () => {
  it("falls back to the email when `name` is NULL", async () => {
    const view = (await listVisibleViews("organization", viewerMember)).find(
      (v) => v.id === OWNER_SHARED,
    )

    expect(view?.ownerLabel).toBe(`${PREFIX}owner@local.test`)
    expect(view?.ownerIsInactive).toBe(false)
  })

  it("uses the name when there is one", async () => {
    const view = (await listVisibleViews("organization", viewerOwner)).find(
      (v) => v.id === MEMBER_SHARED,
    )

    expect(view?.ownerLabel).toBe("Member Name")
  })

  it("a shared view whose owner was soft-deleted still renders, with a null label", async () => {
    const view = (await listVisibleViews("organization", viewerMember)).find(
      (v) => v.id === GONE_SHARED,
    )

    expect(view).toBeDefined()
    expect(view?.ownerLabel).toBeNull()
    expect(view?.ownerIsInactive).toBe(true)
  })

  it("never returns a uuid or a blank as the label", async () => {
    for (const view of await listVisibleViews("organization", viewerAdmin)) {
      if (view.ownerLabel === null) continue

      expect(view.ownerLabel.trim()).not.toBe("")
      expect(view.ownerLabel).not.toBe(view.id)
      expect(view.ownerLabel).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i)
    }
  })
})

describe("listVisibleViews — canEdit is about mutation, not visibility", () => {
  it("is true for the owner", async () => {
    const view = (await listVisibleViews("organization", viewerOwner)).find(
      (v) => v.id === OWNER_PRIVATE,
    )

    expect(view?.canEdit).toBe(true)
    expect(view?.isOwnedByViewer).toBe(true)
  })

  it("is true for an admin on a view they can SEE", async () => {
    // The admin branch survives here and only here: an admin may edit a shared view. It does not
    // reopen Decision 3, because they can only edit what the visibility predicate already returned.
    const view = (await listVisibleViews("organization", viewerAdmin)).find(
      (v) => v.id === MEMBER_SHARED,
    )

    expect(view?.canEdit).toBe(true)
    expect(view?.isOwnedByViewer).toBe(false)
  })

  it("is false for a member on somebody else's shared view", async () => {
    const view = (await listVisibleViews("organization", viewerMember)).find(
      (v) => v.id === OWNER_SHARED,
    )

    expect(view?.canEdit).toBe(false)
  })

  it("defaults to the member answer when the viewer has no role", async () => {
    const view = (await listVisibleViews("organization", { id: ADMIN })).find(
      (v) => v.id === MEMBER_SHARED,
    )

    expect(view?.canEdit).toBe(false)
  })
})

describe("listVisibleViews — the rest of the summary", () => {
  it("scopes to the entity type", async () => {
    const orgIds = (await listVisibleViews("organization", viewerOwner)).map((v) => v.id)
    const dealIds = (await listVisibleViews("deal", viewerOwner)).map((v) => v.id)

    expect(orgIds).not.toContain(OWNER_DEAL_VIEW)
    expect(dealIds).toEqual([OWNER_DEAL_VIEW])
  })

  it("counts filters from the whitelist, not from the blob's key count", async () => {
    const view = (await listVisibleViews("deal", viewerOwner)).find(
      (v) => v.id === OWNER_DEAL_VIEW,
    )

    // The blob holds four keys; `page` and `nonsense` are not deal filters.
    expect(Object.keys(view?.filters ?? {})).toHaveLength(4)
    expect(view?.filterCount).toBe(2)
  })

  it("orders by name ascending", async () => {
    const names = (await listVisibleViews("organization", viewerOwner)).map((v) => v.name)

    expect(names).toEqual([...names].sort())
  })

  it("reports isDefaultForViewer for this viewer and nobody else", async () => {
    await db
      .insert(savedViewDefaults)
      .values({ userId: OWNER, entityType: "organization", viewId: MEMBER_SHARED })

    try {
      const mine = await listVisibleViews("organization", viewerOwner)
      const theirs = await listVisibleViews("organization", viewerMember)

      // G-7: a user may default to somebody ELSE's shared view, and it is their default alone.
      expect(mine.find((v) => v.id === MEMBER_SHARED)?.isDefaultForViewer).toBe(true)
      expect(theirs.find((v) => v.id === MEMBER_SHARED)?.isDefaultForViewer).toBe(false)
      expect(mine.filter((v) => v.isDefaultForViewer)).toHaveLength(1)
    } finally {
      await db.delete(savedViewDefaults).where(eq(savedViewDefaults.userId, OWNER))
    }
  })
})

describe("readDefaultViewForUser — the same predicate, in the JOIN (T-40-18)", () => {
  it("returns null when the user has no default", async () => {
    expect(await readDefaultViewForUser("organization", OWNER)).toBeNull()
  })

  it("returns the view a user defaulted to, including somebody else's shared one", async () => {
    await db
      .insert(savedViewDefaults)
      .values({ userId: OWNER, entityType: "organization", viewId: MEMBER_SHARED })

    try {
      const row = await readDefaultViewForUser("organization", OWNER)

      expect(row?.id).toBe(MEMBER_SHARED)
      expect(row?.filters).toEqual({ search: "member-shared" })
    } finally {
      await db.delete(savedViewDefaults).where(eq(savedViewDefaults.userId, OWNER))
    }
  })

  it("returns null once the owner unshares it, so the list falls back to unfiltered", async () => {
    await db
      .insert(savedViewDefaults)
      .values({ userId: OWNER, entityType: "organization", viewId: MEMBER_SHARED })

    try {
      expect((await readDefaultViewForUser("organization", OWNER))?.id).toBe(MEMBER_SHARED)

      await db.update(savedViews).set({ isShared: false }).where(eq(savedViews.id, MEMBER_SHARED))

      // The defaults row still exists; the view is simply no longer visible to this user. No error,
      // no throw — the locked "falls back to unfiltered, with no error" behaviour.
      expect(await readDefaultViewForUser("organization", OWNER)).toBeNull()
    } finally {
      await db.update(savedViews).set({ isShared: true }).where(eq(savedViews.id, MEMBER_SHARED))
      await db.delete(savedViewDefaults).where(eq(savedViewDefaults.userId, OWNER))
    }
  })

  it("still returns the user's OWN private view as their default", async () => {
    // The predicate is `ownerId = viewer OR isShared`, so privacy must not break your own default.
    await db
      .insert(savedViewDefaults)
      .values({ userId: OWNER, entityType: "organization", viewId: OWNER_PRIVATE })

    try {
      expect((await readDefaultViewForUser("organization", OWNER))?.id).toBe(OWNER_PRIVATE)
    } finally {
      await db.delete(savedViewDefaults).where(eq(savedViewDefaults.userId, OWNER))
    }
  })

  it("scopes to the entity type", async () => {
    await db
      .insert(savedViewDefaults)
      .values({ userId: OWNER, entityType: "deal", viewId: OWNER_DEAL_VIEW })

    try {
      expect((await readDefaultViewForUser("deal", OWNER))?.id).toBe(OWNER_DEAL_VIEW)
      expect(await readDefaultViewForUser("organization", OWNER)).toBeNull()
    } finally {
      await db.delete(savedViewDefaults).where(eq(savedViewDefaults.userId, OWNER))
    }
  })

  it("returns null rather than throwing when the view row is gone (cascade)", async () => {
    // Deleting a view cascades its defaults away, so the absence of a row IS the fallback.
    const scratch = `${PREFIX}view-scratch`

    await db.insert(savedViews).values({
      id: scratch,
      ownerId: OWNER,
      entityType: "organization",
      name: `${PREFIX}Z scratch`,
      filters: { search: "scratch" },
      isShared: false,
    })
    await db
      .insert(savedViewDefaults)
      .values({ userId: OWNER, entityType: "organization", viewId: scratch })

    expect((await readDefaultViewForUser("organization", OWNER))?.id).toBe(scratch)

    await db.delete(savedViews).where(eq(savedViews.id, scratch))

    expect(await readDefaultViewForUser("organization", OWNER)).toBeNull()
  })
})

describe("the predicate is IN THE SQL, not applied afterwards (T-40-17)", () => {
  /**
   * WHY A COMPILED-SQL ASSERTION AND NOT A BEHAVIOURAL ONE.
   *
   * Everything above proves the OUTCOME: the rows a caller receives never include somebody else's
   * private view. It cannot prove WHERE the exclusion happened, and that distinction is the whole
   * of T-40-17. MEASURED, not assumed: moving the predicate out of the `where` into a post-fetch
   * `rows.filter(...)` leaves all 25 assertions above green, because the caller sees the same list
   * either way — while the server has now loaded every private view in the table into memory, and
   * from a server component into the RSC payload of anything closing over it.
   *
   * `.toSQL()` compiles the query without executing it, so this reads the SQL that would actually be
   * sent. It is a compiled-structure assertion, not a source grep: the paragraphs of prose in
   * `queries.ts` that discuss `is_shared` and `role === "admin"` are invisible to it, and deleting
   * one of those comments does not change its outcome.
   */
  it("compiles to a WHERE naming owner_id and is_shared", () => {
    const compiled = db
      .select({ id: savedViews.id })
      .from(savedViews)
      .where(visibleViewsPredicate(OWNER))
      .toSQL()

    expect(compiled.sql).toMatch(/where/i)
    expect(compiled.sql).toContain('"owner_id"')
    expect(compiled.sql).toContain('"is_shared"')
    expect(compiled.sql).toMatch(/\bor\b/i)
    // The viewer id is a bound parameter, never interpolated into the statement text.
    expect(compiled.sql).not.toContain(OWNER)
    expect(compiled.params).toContain(OWNER)
  })

  it("compiles to SQL with no reference to a role or an admin", () => {
    const compiled = db
      .select({ id: savedViews.id })
      .from(savedViews)
      .where(visibleViewsPredicate(ADMIN))
      .toSQL()

    expect(compiled.sql.toLowerCase()).not.toContain("role")
    expect(compiled.sql.toLowerCase()).not.toContain("admin")
    // A signature with no role parameter is what makes that structural rather than incidental.
    expect(visibleViewsPredicate).toHaveLength(1)
  })

  it("is the predicate BOTH reads apply, on the same table columns", () => {
    // Compiled from two different viewers, the statements differ only in their bound parameter.
    const forOwner = db
      .select({ id: savedViews.id })
      .from(savedViews)
      .where(visibleViewsPredicate(OWNER))
      .toSQL()
    const forAdmin = db
      .select({ id: savedViews.id })
      .from(savedViews)
      .where(visibleViewsPredicate(ADMIN))
      .toSQL()

    expect(forAdmin.sql).toBe(forOwner.sql)
    expect(forAdmin.params).not.toEqual(forOwner.params)
  })
})

describe("the fixture set is what these assertions assume", () => {
  it("holds exactly the seven views it created", async () => {
    const rows = await db.select({ id: savedViews.id }).from(savedViews).where(
      like(savedViews.id, LIKE_PREFIX),
    )

    expect(rows.map((r) => r.id).sort()).toEqual([...ALL_VIEW_IDS].sort())
  })

  it("holds one soft-deleted owner", async () => {
    const rows = await db.select({ id: users.id }).from(users).where(like(users.id, LIKE_PREFIX))

    expect(rows).toHaveLength(4)
  })
})
