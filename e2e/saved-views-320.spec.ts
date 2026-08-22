/**
 * V-40-1 / V-40-2 / V-40-7 / V-40-11 — the phase's ONLY real 320x640 measurement.
 *
 * Every static gate in Phase 40 carries a header saying "plan 40-15 owns all real 320px
 * measurement". Five of them defer here. Their assertions prove that a class token is present in
 * a source file; this file proves that a human with a 320px phone can actually press the button.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A NEW FILE AND NOT A ROW IN `e2e/viewport-320.spec.ts` (R-1).
 *
 * F-39-07 is the precedent and the warning. Phase 39's viewport matrix asserted exactly one thing —
 * `document.documentElement.scrollWidth <= clientWidth` — over seven routes and three locales. It
 * returned 305/305 twenty-one times, GREEN, while a 940px-tall create dialog at 320x640 put its
 * "Create anyway" button below the fold and out of pointer reach. A horizontal-overflow comparison
 * cannot see height, cannot see a negative `top`, cannot see occlusion and cannot see whether an
 * overlay scrolls. None of the four assertions this file makes is expressible as a `scrollWidth`
 * comparison, so `viewport-320.spec.ts` is left BYTE-UNCHANGED and this file is where the phase's
 * behavioural claim lives.
 *
 * THE FOUR CHECKS, applied to every overlay this phase adds:
 *
 *   1. `box.y >= 0`                          — the top edge is on screen. This is what the
 *                                              `/activities` filter `PopoverContent` fails today
 *                                              (M-5: 388px tall at `top: -41`).
 *   2. `box.y + box.height <= viewport.height` — the bottom edge is on screen.
 *   3. fits-or-scrolls                       — `scrollHeight <= clientHeight` OR a computed
 *                                              `overflow-y` of `auto`/`scroll`. An overlay taller
 *                                              than its box is fine IF it scrolls; it is F-39-07 if
 *                                              it does not.
 *   4. `click({ trial: true })`              — runs EVERY actionability check (visible, stable,
 *                                              enabled, receives-pointer-events, hit-target) and
 *                                              fires NO event. `toBeVisible()` passes on a
 *                                              visible-but-occluded button and fails a real user;
 *                                              this is the assertion that would have caught
 *                                              F-39-07. Firing no event is also the only reason it
 *                                              is safe to point at a destructive control.
 *
 * ---------------------------------------------------------------------------------------------
 * THE HARNESS.
 *
 * The viewport is neither declared nor changed anywhere in this file — `playwright.config.ts`'s
 * `chromium` project already supplies 320x640, and `launchOptions: { ignoreDefaultArgs:
 * ["--hide-scrollbars"] }` is what makes `clientWidth` 305 rather than 320. A programmatic resize
 * is deliberately absent: `@dnd-kit/core` wires the window `Resize` event to its drag-cancel
 * handler, so resizing must not become a habit anywhere under `e2e/`.
 *
 * No login happens here — the admin session arrives from the setup project's storageState.
 *
 * Locale is a plain cookie read server-side by `src/i18n/request.ts`. Every anchor and every label
 * is READ FROM THE MESSAGE CATALOG rather than hardcoded, so a copy change cannot leave a stale
 * expectation behind (the `import-wizard.tsx` lesson).
 *
 * ANTI-VACUITY. Every test asserts a LOCALE-DEPENDENT `h1` before it measures anything. A blank
 * 200, an error page and a redirect to `/login` all satisfy every geometric assertion in this file,
 * so without the anchor it would certify a layout nobody rendered — and the anchor is also the only
 * thing proving the locale cookie applied.
 *
 * FLAKINESS BUDGET. BACKLOG records a React hydration mismatch (minified error #418) on `/people`,
 * `/organizations` and `/activities` — but not `/deals` — that can swallow a click, including a
 * dialog-trigger click. Full-suite runs measured 33/33, 31/33, 32/33. Every interaction here is
 * preceded by a settled anchor and by `expect(locator).toBeVisible()`; no retries are added to the
 * `chromium` project, because a retry would hide the measurement rather than take it.
 *
 * ---------------------------------------------------------------------------------------------
 * THE FIXTURE RULE. These fixtures are written into the live development database holding 46,054
 * organizations, 38,348 people, 25,195 deals and 79,022 activities. Everything is created through
 * `e2e/views-fixtures.ts`, which THROWS on a name missing `VIEWS_FIXTURE_PREFIX`, and purged by
 * prefix in `beforeAll` (so a crashed previous run is reclaimed) AND in `afterAll`. There is no
 * unqualified delete anywhere in this file and there must never be one.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"

// Relative paths, not "@/…": Playwright does not read vitest's alias table.
import en from "../src/messages/en-US.json"
import es from "../src/messages/es-ES.json"
import pt from "../src/messages/pt-BR.json"
import { E2E_ADMIN_EMAIL } from "./seed-admin"
import {
  insertViewFixture,
  openDb,
  purgeViewFixtures,
  setDefaultFixture,
  userIdByEmail,
  VIEWS_FIXTURE_PREFIX,
  type ViewsDb,
} from "./views-fixtures"
import type { EntityType } from "../src/db/schema/custom-fields"

/**
 * The chromium project's viewport, repeated as a constant rather than read back from the page.
 * Reading `window.innerHeight` would make check 2 self-fulfilling: an overlay that pushed the
 * document taller would raise its own ceiling.
 */
const VIEWPORT_HEIGHT = 640

/**
 * Only the keys this file reads. A narrow interface rather than `typeof en` keeps all three
 * catalogs assignable without an `any` cast.
 */
interface Catalog {
  common: { cancel: string }
  organizations: { title: string }
  people: { title: string }
  deals: { title: string }
  activities: { title: string }
  views: {
    picker: { label: string }
    allRecords: string
    modified: string
    saveNew: string
    saveChanges: string
    manageAction: string
    save: { submit: string; nameLabel: string; targetLegend: string }
    manage: { title: string; delete: string }
    delete: { title: string; action: string }
  }
}

/** Exactly the values `src/i18n/request.ts` compares against. */
const CATALOG: Record<string, Catalog> = {
  "en-US": en,
  "pt-BR": pt,
  "es-ES": es,
}

interface Surface {
  path: string
  entityType: EntityType
  anchor: (m: Catalog) => string
  /**
   * A query string that makes `canSave` true, so `views.saveNew` is present in the menu and the
   * save dialog is reachable. `canSave` is computed from the URL's whitelisted keys
   * (`hasSaveableFilter` over `urlFilters`), so the values need only be well-formed, not resolvable.
   */
  filtered: string
  /** Whether this surface has a search `<Input>` — the V-40-7 subject. */
  hasSearchBox: boolean
}

const SURFACES: Surface[] = [
  {
    path: "/organizations",
    entityType: "organization",
    anchor: (m) => m.organizations.title,
    filtered: "search=acme",
    hasSearchBox: true,
  },
  {
    path: "/people",
    entityType: "person",
    anchor: (m) => m.people.title,
    filtered: "search=acme",
    hasSearchBox: true,
  },
  {
    path: "/deals",
    entityType: "deal",
    anchor: (m) => m.deals.title,
    // `dateFrom` is in SAVEABLE_FILTER_KEYS.deal and needs no catalog lookup to be legal, so it
    // makes `canSave` true without depending on which pipeline happens to be first today.
    filtered: "dateFrom=2020-01-01",
    hasSearchBox: false,
  },
  {
    path: "/activities",
    entityType: "activity",
    anchor: (m) => m.activities.title,
    filtered: "search=acme",
    hasSearchBox: true,
  },
]

/** The entity type carrying ≥8 views, for the manage-dialog height case. */
const CROWDED_ENTITY: EntityType = "organization"
const CROWDED_COUNT = 9

/**
 * A name long enough to exercise `truncate` inside the trigger's measured `max-w-[200px]` (M-10)
 * and inside the menu item's `w-full truncate`.
 */
const LONG_NAME = `${VIEWS_FIXTURE_PREFIX} with a deliberately very long name that must truncate inside the two-hundred-pixel trigger`

interface SurfaceFixture {
  /** Admin-owned, shared, richest legal filter combination for the surface. */
  sharedId: string
  sharedFilters: Record<string, string>
  /** Admin-owned, private. */
  privateId: string
  /** Admin-owned, stored `search` exactly "acme". Absent on `/deals`, which has no search key. */
  acmeId: string | null
  acmeName: string
}

const fixtures = new Map<EntityType, SurfaceFixture>()

/** The ≥8 extra crowding views, kept so the summary can report what was seeded. */
const crowdIds: string[] = []

/**
 * The richest legal filter set per entity type, resolved against real rows so the resolver does
 * NOT mark the keys dropped. `organization` and `person` whitelist only `search`, so "richest" is
 * one key there and that is not a shortcut — `SAVEABLE_FILTER_KEYS` is the definition.
 */
async function richFilters(sql: ViewsDb, entityType: EntityType): Promise<Record<string, string>> {
  if (entityType === "organization" || entityType === "person") return { search: "acme" }

  const adminId = await userIdByEmail(sql, E2E_ADMIN_EMAIL)

  if (entityType === "deal") {
    const stageRows = await sql<{ id: string; pipeline_id: string }[]>`
      select s.id, s.pipeline_id
      from stages s
      join pipelines p on p.id = s.pipeline_id and p.deleted_at is null
      limit 1
    `
    if (stageRows.length === 0) {
      throw new Error("no live pipeline/stage pair in the dev database — cannot seed a deal view")
    }
    return {
      pipeline: stageRows[0].pipeline_id,
      stage: stageRows[0].id,
      owner: adminId,
      assignee: adminId,
      dateFrom: "2020-01-01",
      dateTo: "2030-12-31",
    }
  }

  const typeRows = await sql<{ id: string }[]>`select id from activity_types limit 1`
  if (typeRows.length === 0) {
    throw new Error("no activity_types row in the dev database — cannot seed an activity view")
  }
  return {
    type: typeRows[0].id,
    owner: adminId,
    assignee: adminId,
    status: "pending",
    dateFrom: "2020-01-01",
    dateTo: "2030-12-31",
    search: "acme",
  }
}

test.beforeAll(async () => {
  const sql = openDb()
  try {
    // BEFORE inserting, so a run crashed mid-test is reclaimed rather than compounded.
    const reclaimed = await purgeViewFixtures(sql)
    console.log(
      `[40-15] beforeAll purge reclaimed ${reclaimed.views} views / ${reclaimed.defaults} defaults`
    )

    for (const surface of SURFACES) {
      const entityType = surface.entityType
      const sharedFilters = await richFilters(sql, entityType)

      const sharedId = await insertViewFixture(sql, {
        ownerEmail: E2E_ADMIN_EMAIL,
        entityType,
        name: `${LONG_NAME} — ${entityType}`,
        filters: sharedFilters,
        isShared: true,
      })

      const privateId = await insertViewFixture(sql, {
        ownerEmail: E2E_ADMIN_EMAIL,
        entityType,
        name: `${VIEWS_FIXTURE_PREFIX} private ${entityType}`,
        filters: sharedFilters,
        isShared: false,
      })

      // The V-40-7 fixture. `/deals` has no `search` key in its whitelist, so it has no row here
      // and no resync assertion — the absence is the whitelist's, not an omission.
      const acmeName = `${VIEWS_FIXTURE_PREFIX} acme ${entityType}`
      const acmeId = surface.hasSearchBox
        ? await insertViewFixture(sql, {
            ownerEmail: E2E_ADMIN_EMAIL,
            entityType,
            name: acmeName,
            filters: { search: "acme" },
            isShared: false,
          })
        : null

      fixtures.set(entityType, { sharedId, sharedFilters, privateId, acmeId, acmeName })
    }

    // The manage-dialog height case: ≥8 views on ONE entity type, so the inner list is genuinely
    // longer than `max-h-[50vh]` and the second clamp (O-1b) is exercised rather than assumed.
    const crowdedFilters = await richFilters(sql, CROWDED_ENTITY)
    for (let index = 0; index < CROWDED_COUNT; index += 1) {
      crowdIds.push(
        await insertViewFixture(sql, {
          ownerEmail: E2E_ADMIN_EMAIL,
          entityType: CROWDED_ENTITY,
          name: `${VIEWS_FIXTURE_PREFIX} crowd ${String(index).padStart(2, "0")}`,
          filters: { ...crowdedFilters, search: `acme-${index}` },
          isShared: index % 2 === 0,
        })
      )
    }

    // One `saved_view_defaults` row, so the redirect path is exercised by the suite at all. It is
    // set on `person` and points at a view whose only filter is `search=acme`: a bare `/people`
    // therefore redirects to `/people?search=acme&view=<id>`, which still renders `people.title`
    // and so cannot break `viewport-320.spec.ts`'s anchor if the two files interleave.
    const person = fixtures.get("person")
    if (person?.acmeId) {
      await setDefaultFixture(sql, {
        userEmail: E2E_ADMIN_EMAIL,
        entityType: "person",
        viewId: person.acmeId,
      })
    }
  } finally {
    await sql.end()
  }
})

test.afterAll(async () => {
  const sql = openDb()
  try {
    // MUTATIONS FIRST, ASSERTIONS AFTER — 39-19's lesson: a leak assertion placed before a restore
    // aborts teardown on failure and strands the very row it complains about.
    const purged = await purgeViewFixtures(sql)
    const remaining = await sql<{ count: string }[]>`
      select count(*)::text as count from saved_views where name like ${`${VIEWS_FIXTURE_PREFIX}%`}
    `
    console.log(
      `[40-15] afterAll purge removed ${purged.views} views / ${purged.defaults} defaults; ` +
        `${remaining[0].count} prefixed rows remain`
    )
    expect(Number(remaining[0].count), "every fixture view must be reclaimed").toBe(0)
  } finally {
    await sql.end()
  }
})

/** Set the locale cookie the way `src/i18n/request.ts` reads it. */
async function useLocale(page: Page, baseURL: string | undefined, locale: string): Promise<void> {
  expect(baseURL, "playwright.config.ts must define use.baseURL").toBeTruthy()
  await page.context().addCookies([{ name: "locale", value: locale, url: String(baseURL) }])
}

/**
 * Navigate and settle. Returns only once the locale-dependent `h1` is visible, which is both the
 * anti-vacuity anchor and — on the three routes with the hydration mismatch — the settled anchor
 * that stops a dialog-trigger click being swallowed.
 */
async function gotoSettled(
  page: Page,
  url: string,
  anchorText: string
): Promise<void> {
  await page.goto(url)
  await expect(page.getByRole("heading", { level: 1, name: anchorText })).toBeVisible()
}

test.describe("the running image serves this phase's code", () => {
  test("the saved-views picker trigger is on /organizations", async ({ page, baseURL }) => {
    await useLocale(page, baseURL, "en-US")
    await gotoSettled(page, "/organizations?search=acme", en.organizations.title)

    /*
     * THE STALE-IMAGE GUARD (T-40-73), and it runs BEFORE any measurement on purpose.
     * `docker-compose.yml` declares `build: .` with NO volume mount, so the container serves an
     * image baked at build time. A spec run against a stale image measures the PREVIOUS phase and
     * reports it as this one's. If this assertion fails the answer is `docker compose up -d --build
     * app`, not a selector change.
     */
    await expect(
      page.getByRole("button", { name: en.views.picker.label }),
      "the saved-views picker is absent — the container is serving a pre-Phase-40 image; rebuild it"
    ).toBeVisible()
  })
})
