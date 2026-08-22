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
    save: { submit: string; nameLabel: string; targetLegend: string; targetNew: string }
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
   *
   * THE TERMS ARE CHOSEN TO RETURN ROWS, and that is not cosmetic. Measured against the live dev
   * database this session: `acme` matches 0 of 46,054 organizations and 0 of 79,022 activities.
   * A surface behind an EMPTY list is a different page — no rows, no row-level controls, and, on
   * `/organizations`, a `useDataTableKeyboard` whose `selectedItem` is null, which would make the
   * V-40-11 hotkey assertion pass for the wrong reason. `ltda` matches 13,355 organizations and
   * 6,684 people; `contato` matches 1,729 activities.
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
    filtered: "search=ltda",
    hasSearchBox: true,
  },
  {
    path: "/people",
    entityType: "person",
    anchor: (m) => m.people.title,
    filtered: "search=ltda",
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
    filtered: "search=contato",
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

/* ============================================================================================
 * V-40-1 — THE REACHABILITY SUITE.
 * ========================================================================================== */

interface OverlayMeasurement {
  label: string
  x: number
  y: number
  width: number
  height: number
  scrollHeight: number
  clientHeight: number
  overflowY: string
  fitsOrScrolls: boolean
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A bounding box, polled until the element actually has one.
 *
 * MEASURED, NOT GUESSED: a first pass that read `boundingBox()` once directly after
 * `toBeVisible()` failed on 6 of 12 combinations with `Cannot read properties of null`. The cause
 * is the hydration mismatch BACKLOG records on `/people`, `/organizations` and `/activities`
 * (minified React error #418): React discards the server HTML and remounts the tree, so the node
 * `toBeVisible()` just resolved against is detached microseconds later and `boundingBox()` answers
 * null. `toPass` re-resolves the locator on every attempt, so it measures the node that survived
 * rather than the one that did not.
 *
 * This is a settle, not a retry of an assertion: nothing here is allowed to pass on a second
 * attempt that failed on the first. Every geometric assertion in this file runs on the box this
 * returns, once.
 */
async function boxOf(locator: Locator, label: string): Promise<Box> {
  let box: Box | null = null
  await expect(async () => {
    await expect(locator).toBeVisible()
    box = await locator.boundingBox()
    expect(box, `${label}: has no bounding box`).not.toBeNull()
  }).toPass({ timeout: 20_000 })
  return box!
}

/**
 * Take every geometric fact about an overlay in one pass, and REPORT it. The numbers are logged
 * whether or not the assertions pass, because "it passed" is not a measurement and this file's
 * whole purpose is to produce measurements the phase can be held to.
 */
async function measureOverlay(overlay: Locator, label: string): Promise<OverlayMeasurement> {
  const box = await boxOf(overlay, label)

  const metrics = await overlay.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: cs.overflowY,
    }
  })

  const measurement: OverlayMeasurement = {
    label,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    ...metrics,
    // An overlay taller than its own box is FINE if it scrolls, and F-39-07 if it does not.
    fitsOrScrolls:
      metrics.scrollHeight <= metrics.clientHeight ||
      metrics.overflowY === "auto" ||
      metrics.overflowY === "scroll",
  }

  console.log(
    `[40-15] ${label} | box ${measurement.x.toFixed(1)},${measurement.y.toFixed(1)} ` +
      `${measurement.width.toFixed(1)}x${measurement.height.toFixed(1)} | ` +
      `scrollHeight ${measurement.scrollHeight} clientHeight ${measurement.clientHeight} ` +
      `overflow-y ${measurement.overflowY} | fits-or-scrolls ${measurement.fitsOrScrolls}`
  )

  return measurement
}

/** Checks 1-3. Check 4 (`click({ trial: true })`) is per-overlay and lives at the call sites. */
function assertOnScreen(m: OverlayMeasurement): void {
  expect(
    m.y,
    `${m.label}: the TOP edge is off screen at y=${m.y.toFixed(1)} — this is the M-5 failure mode ` +
      `(the /activities filter popover renders 388px tall at top:-41) and no scrollWidth ` +
      `comparison can see it`
  ).toBeGreaterThanOrEqual(0)

  expect(
    m.y + m.height,
    `${m.label}: the BOTTOM edge is below the fold — ${(m.y + m.height).toFixed(1)} > ` +
      `${VIEWPORT_HEIGHT} (box ${m.height.toFixed(1)}px tall at y=${m.y.toFixed(1)}). This is ` +
      `F-39-07 exactly: a 940px dialog in a 640px viewport whose primary action nobody can press`
  ).toBeLessThanOrEqual(VIEWPORT_HEIGHT)

  expect(
    m.fitsOrScrolls,
    `${m.label}: ${m.scrollHeight}px of content in a ${m.clientHeight}px box with ` +
      `overflow-y:${m.overflowY} — it neither fits nor scrolls, so the overflow is unreachable`
  ).toBe(true)
}

/**
 * Check 4. `trial: true` runs EVERY actionability check — visible, stable, enabled, receives
 * pointer events, hit-target — and fires no event. `toBeVisible()` passes on a visible-but-occluded
 * control; this does not. Firing no event is also what makes it safe to point at a destructive
 * button.
 */
async function assertTrialClickable(target: Locator, label: string): Promise<void> {
  await expect(target, `${label}: not visible`).toBeVisible()
  await target.scrollIntoViewIfNeeded()
  await target.click({ trial: true })
  console.log(`[40-15] ${label} | trial-clickable`)
}

/** O-3. Escape must dismiss every overlay this phase adds. */
async function assertEscapeDismisses(page: Page, overlay: Locator, label: string): Promise<void> {
  await page.keyboard.press("Escape")
  await expect(overlay, `${label}: Escape did not dismiss it`).toHaveCount(0)
  console.log(`[40-15] ${label} | Escape dismissed`)
}

/**
 * Click something until the overlay it is supposed to open is actually open.
 *
 * ONLY THE OPEN IS RETRIED, AND NEVER A MEASUREMENT. BACKLOG records a hydration mismatch
 * (minified React error #418) on `/people`, `/organizations` and `/activities` that can SWALLOW A
 * CLICK — measured at 33/33, 31/33 and 32/33 over full-suite runs. It swallowed one picker-trigger
 * click and one slot-2 click across this file's five development runs. Retrying the open changes
 * nothing about what is then measured: every geometric assertion still runs exactly once, on the
 * overlay that actually opened.
 *
 * The early return is what makes the retry safe on a TOGGLE: re-clicking a picker trigger whose
 * menu is already open would close it, so a slow-but-successful first click must not be clicked
 * again. Attempt counts above one are LOGGED rather than absorbed, and no `retries` are added to
 * the `chromium` project — that would hide real failures alongside this one.
 */
async function clickUntil(target: Locator, expected: Locator, label: string): Promise<void> {
  let attempts = 0

  await expect(async () => {
    if (await expected.isVisible()) return
    attempts += 1
    await expect(target).toBeVisible({ timeout: 2_000 })
    await target.click()
    await expect(expected).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000, intervals: [250, 500, 1_000] })

  if (attempts > 1) {
    console.log(`[40-15] ${label} needed ${attempts} attempts (swallowed click, BACKLOG #418)`)
  }
}

/** Open the picker and return its `DropdownMenuContent`. */
async function openPicker(page: Page, messages: Catalog): Promise<Locator> {
  const trigger = page.getByRole("button", { name: messages.views.picker.label })
  const menu = page.getByRole("menu")
  await clickUntil(trigger, menu, "picker")
  return menu
}

test.describe("V-40-1 — every overlay is reachable at 320x640", () => {
  // Five overlays' worth of checks, three page loads and a dozen actionability probes per test,
  // on a route family whose hydration mismatch is already budgeted for. 30s is not enough and a
  // timeout here would read as a layout failure.
  test.describe.configure({ timeout: 180_000 })

  for (const [locale, messages] of Object.entries(CATALOG)) {
    for (const surface of SURFACES) {
      test(`${surface.path} @ ${locale}`, async ({ page, baseURL }) => {
        await useLocale(page, baseURL, locale)

        // ---------------------------------------------------------------------------------
        // (a) ANCHOR FIRST. Not a redundant smoke check: a blank 200, an error page and a
        //     /login redirect all satisfy every geometric assertion below in silence.
        // ---------------------------------------------------------------------------------
        await gotoSettled(page, `${surface.path}?${surface.filtered}`, surface.anchor(messages))

        // ---------------------------------------------------------------------------------
        // THE BAR ITSELF. Recorded, not asserted: M-10 measured the bar wrapping to two rows at
        // 241px in all three locales, and a pixel-width assertion would break on a copy change
        // without anything actually being unreachable. The measurement belongs in the summary.
        // ---------------------------------------------------------------------------------
        const trigger = page.getByRole("button", { name: messages.views.picker.label })
        await expect(trigger).toBeVisible()
        const bar = trigger.locator("xpath=..")
        const slotTwo = bar.getByRole("button", { name: messages.views.saveNew })
        await expect(
          slotTwo,
          "slot 2 must hold `views.saveNew`: the URL carries a saveable filter, so canSave is true"
        ).toBeVisible()

        /*
         * ONE LAYOUT PASS FOR ALL OF IT, AND THAT IS THE POINT.
         *
         * A first version read the trigger's box and slot 2's box in two separate round trips and
         * derived the wrap from `slot2.y > trigger.y`. On `/activities` it reported "1 row, bar
         * 241x80" — self-contradictory, because 80px IS two 36px rows plus the 8px gap. The two
         * reads had straddled a hydration re-layout that moved the whole stack 135px. Reading the
         * container and every child inside a single `evaluate` makes the numbers describe one
         * moment, and counting DISTINCT child top offsets asks the flex box itself how many rows it
         * used instead of inferring it from two positions.
         */
        const barGeometry = await bar.evaluate((el) => {
          const box = el.getBoundingClientRect()
          const children = Array.from(el.children).map((child) => {
            const rect = child.getBoundingClientRect()
            return {
              tag: child.tagName,
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            }
          })
          return {
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
            children,
            rows: new Set(children.map((child) => Math.round(child.y))).size,
          }
        })

        console.log(
          `[40-15] BAR ${surface.path} @ ${locale} | rows ${barGeometry.rows} | ` +
            `bar ${barGeometry.box.width.toFixed(1)}x${barGeometry.box.height.toFixed(1)} ` +
            `at y=${barGeometry.box.y.toFixed(1)} | ` +
            barGeometry.children
              .map(
                (child) =>
                  `${child.tag} ${child.width.toFixed(1)}x${child.height.toFixed(1)}@y${child.y.toFixed(1)}`
              )
              .join(" ")
        )

        // ---------------------------------------------------------------------------------
        // (b) THE PICKER MENU.
        // ---------------------------------------------------------------------------------
        const menu = await openPicker(page, messages)
        assertOnScreen(await measureOverlay(menu, `MENU ${surface.path} @ ${locale}`))

        // The LAST item is the one a clipped menu loses, and `views.manageAction` is always last
        // (V-3 item 6 puts `saveNew` and the export row above it).
        await assertTrialClickable(
          menu.getByRole("menuitem", { name: messages.views.manageAction }),
          `MENU last item (manageAction) ${surface.path} @ ${locale}`
        )

        // (f) O-3.
        await assertEscapeDismisses(page, menu, `MENU ${surface.path} @ ${locale}`)

        // ---------------------------------------------------------------------------------
        // (c) THE SAVE DIALOG, reached from the picker's `views.saveNew` row.
        // ---------------------------------------------------------------------------------
        const menuForSave = await openPicker(page, messages)
        const saveDialog = page.getByRole("dialog")
        await clickUntil(
          menuForSave.getByRole("menuitem", { name: messages.views.saveNew }),
          saveDialog,
          `SAVE open ${surface.path} @ ${locale}`
        )

        assertOnScreen(await measureOverlay(saveDialog, `SAVE ${surface.path} @ ${locale}`))

        const submit = saveDialog.getByRole("button", { name: messages.views.save.submit })
        const cancel = saveDialog.getByRole("button", { name: messages.common.cancel })
        await expect(submit).toBeInViewport()
        await assertTrialClickable(submit, `SAVE submit ${surface.path} @ ${locale}`)

        // S-12. `DialogFooter`'s `flex-col-reverse` is not overridden, so at 320px the footer
        // stacks and the LAST DOM child renders visually FIRST — the primary action on top.
        const submitBox = await boxOf(submit, `SAVE submit ${surface.path} @ ${locale}`)
        const cancelBox = await boxOf(cancel, `SAVE cancel ${surface.path} @ ${locale}`)
        console.log(
          `[40-15] SAVE footer ${surface.path} @ ${locale} | submit y=${submitBox.y.toFixed(1)} ` +
            `cancel y=${cancelBox.y.toFixed(1)}`
        )
        expect(
          submitBox.y,
          `SAVE footer ${surface.path} @ ${locale}: the submit must stack ABOVE Cancel (S-12) — ` +
            `submit y=${submitBox.y.toFixed(1)}, cancel y=${cancelBox.y.toFixed(1)}`
        ).toBeLessThan(cancelBox.y)

        await assertEscapeDismisses(page, saveDialog, `SAVE ${surface.path} @ ${locale}`)

        // ---------------------------------------------------------------------------------
        // (d) THE MANAGE DIALOG. `organization` carries 12 fixture views, which is what makes
        //     the inner list genuinely longer than its `max-h-[50vh]` and the SECOND clamp
        //     (O-1b) a measurement rather than an assumption.
        // ---------------------------------------------------------------------------------
        const menuForManage = await openPicker(page, messages)
        const manageDialog = page.getByRole("dialog")
        await clickUntil(
          menuForManage.getByRole("menuitem", { name: messages.views.manageAction }),
          manageDialog,
          `MANAGE open ${surface.path} @ ${locale}`
        )

        assertOnScreen(await measureOverlay(manageDialog, `MANAGE ${surface.path} @ ${locale}`))

        // The inner scroller. Located by its measured class rather than by a testid, because the
        // class IS the mechanism O-1b is about and a testid could survive its removal.
        const list = manageDialog.locator('div[class*="max-h-[50vh]"]')
        assertOnScreen(await measureOverlay(list, `MANAGE list ${surface.path} @ ${locale}`))

        const deleteButtons = manageDialog.getByRole("button", {
          name: messages.views.manage.delete,
        })
        const rowCount = await deleteButtons.count()
        console.log(`[40-15] MANAGE ${surface.path} @ ${locale} | ${rowCount} deletable rows`)
        expect(rowCount, "every fixture view is admin-owned, so every row is deletable").toBeGreaterThan(0)

        const lastDelete = deleteButtons.last()
        await assertTrialClickable(
          lastDelete,
          `MANAGE last-row delete ${surface.path} @ ${locale}`
        )

        // ---------------------------------------------------------------------------------
        // (e) THE DELETE AlertDialog, opened from that last row.
        // ---------------------------------------------------------------------------------
        await lastDelete.scrollIntoViewIfNeeded()
        const alert = page.getByRole("alertdialog")
        await clickUntil(lastDelete, alert, `DELETE open ${surface.path} @ ${locale}`)

        assertOnScreen(await measureOverlay(alert, `DELETE ${surface.path} @ ${locale}`))

        // DO NOT CLICK IT FOR REAL. `trial: true` fires no event, which is the only reason a
        // destructive control can be asserted on at all (T-40-72).
        await assertTrialClickable(
          alert.getByRole("button", { name: messages.views.delete.action }),
          `DELETE destructive action ${surface.path} @ ${locale}`
        )

        await assertEscapeDismisses(page, alert, `DELETE ${surface.path} @ ${locale}`)
        await assertEscapeDismisses(page, manageDialog, `MANAGE ${surface.path} @ ${locale}`)
      })
    }
  }
})

/* ============================================================================================
 * THE TALLEST LEGAL SAVE DIALOG — the state the clamp exists for, and the state V-40-2 probes.
 * ========================================================================================== */

/**
 * The placeholders are HARDCODED ENGLISH IN THE SOURCE and are not in any message catalog.
 * `40-11-SUMMARY.md` and `40-13-SUMMARY.md` both record that as pre-existing debt deliberately
 * left alone — translating a 250-line filter component inside a URL-shape change would make the
 * URL change unreviewable. So these literals are read from the components, not from a catalog,
 * and the day they are translated this map is what fails rather than a silent mismatch.
 */
const SEARCH_PLACEHOLDER: Record<string, string> = {
  "/organizations": "Search organizations...",
  "/people": "Search people...",
  "/activities": "Search activities...",
}

test.describe("the tallest legal save dialog", () => {
  test.describe.configure({ timeout: 120_000 })

  test("es-ES, target RadioGroup, both helper lines and an inline name error", async ({
    page,
    baseURL,
  }) => {
    await useLocale(page, baseURL, "es-ES")
    const fixture = fixtures.get("organization")!

    /*
     * HOW THIS STATE IS REACHED AT ALL. `selected && modified && editable` was structurally
     * UNREACHABLE before plan 40-18: selection was derived from filter EQUALITY, so a URL that
     * differed from the stored view simply deselected it — measured at 10 URLs x 3 views, ZERO
     * modified. `?view=<id>` is the carrier that makes the three facts independent. The stored
     * filters are `search=acme`; the URL says `search=ltda`; the id still names the view.
     */
    await gotoSettled(
      page,
      `/organizations?search=ltda&view=${fixture.sharedId}`,
      es.organizations.title
    )

    const trigger = page.getByRole("button", { name: es.views.picker.label })
    await expect(trigger, "the picker must still name the view").toContainText(es.views.modified)

    const bar = trigger.locator("xpath=..")
    const saveChanges = bar.getByRole("button", { name: es.views.saveChanges })
    await expect(
      saveChanges,
      "slot 2 must resolve to `views.saveChanges` — selected, modified and editable"
    ).toBeVisible()

    const dialog = page.getByRole("dialog")
    await clickUntil(saveChanges, dialog, "SAVE TALLEST open")

    // The target choice only renders when the view is selected AND the viewer may overwrite it.
    const radioGroup = dialog.getByRole("radiogroup")
    await expect(radioGroup, "the target RadioGroup is what makes this the tallest state").toBeVisible()

    // Fork to "save as a new view", then submit a name that already exists. The refusal is a
    // DATABASE invariant (`saved_views_owner_type_name_uniq` on owner+type+name, caught as 23505),
    // so it cannot race and it creates nothing.
    await radioGroup.getByRole("radio", { name: es.views.save.targetNew }).click()
    const nameInput = dialog.getByLabel(es.views.save.nameLabel)
    await nameInput.fill(fixture.acmeName)
    await dialog.getByRole("button", { name: es.views.save.submit }).click()

    const errorLine = dialog.locator("#save-view-name-error")
    await expect(errorLine, "the inline duplicate-name refusal must render").toBeVisible()

    // Both helper lines are unconditional (`sharedHelp`/`privateHelp` resolve one at a time, and
    // `defaultHelp` always renders), so the dialog is now in its tallest legal shape.
    const tallest = await measureOverlay(dialog, "SAVE TALLEST /organizations @ es-ES")
    assertOnScreen(tallest)
    await assertTrialClickable(
      dialog.getByRole("button", { name: es.views.save.submit }),
      "SAVE TALLEST submit /organizations @ es-ES"
    )

    console.log(
      `[40-15] TALLEST | content ${tallest.scrollHeight}px in a ${tallest.clientHeight}px box ` +
        `(${(tallest.scrollHeight - tallest.clientHeight).toString()}px past the clamp), ` +
        `box bottom at ${(tallest.y + tallest.height).toFixed(1)} of ${VIEWPORT_HEIGHT}`
    )

    await assertEscapeDismisses(page, dialog, "SAVE TALLEST /organizations @ es-ES")
  })
})

/* ============================================================================================
 * V-40-7 — THE SEARCH BOX SHOWS WHAT THE URL SAYS, IN BOTH DIRECTIONS.
 * ========================================================================================== */

test.describe("V-40-7 — the search box resyncs from the URL", () => {
  test.describe.configure({ timeout: 120_000 })

  for (const surface of SURFACES.filter((s) => s.hasSearchBox)) {
    test(`${surface.path} — a view's search lands in the box, and All records clears it`, async ({
      page,
      baseURL,
    }) => {
      await useLocale(page, baseURL, "en-US")
      const fixture = fixtures.get(surface.entityType)!
      expect(fixture.acmeId, "this surface must have an acme fixture").not.toBeNull()

      /*
       * `?view=none` and not a bare path: the default-view redirect fires on "no params at all",
       * and a bare path would bounce straight back into a default view. The escape URL is a param,
       * so it is never recaptured (U-1 / U-2).
       */
      await gotoSettled(page, `${surface.path}?view=none`, surface.anchor(en))

      const input = page.getByPlaceholder(SEARCH_PLACEHOLDER[surface.path])
      await expect(input).toBeVisible()
      await expect(input, "the escape URL carries no search, so the box starts empty").toHaveValue(
        ""
      )

      /*
       * SELECT IT FROM THE PICKER, NOT BY TYPING THE URL. The M-9 defect is that app-router
       * navigation RE-RENDERS the tree without REMOUNTING it, so `defaultValue` is never re-read.
       * A `page.goto` remounts everything and would pass with the defect fully present — which is
       * exactly the vacuous proof this phase keeps refusing.
       */
      const menu = await openPicker(page, en)
      const item = menu.getByRole("menuitemradio", { name: fixture.acmeName })
      await expect(item).toBeVisible()
      await item.click()

      await page.waitForURL((url) => url.searchParams.get("search") === "acme")
      await expect(page.getByRole("heading", { level: 1, name: surface.anchor(en) })).toBeVisible()
      await expect(
        input,
        `${surface.path}: the URL says search=acme and the box must say so too (M-9)`
      ).toHaveValue("acme")
      console.log(`[40-15] V-40-7 ${surface.path} | view selected -> box reads "acme"`)

      // The other direction. M-9 left stale text in BOTH, so one direction is half a proof.
      const menuBack = await openPicker(page, en)
      const allRecords = menuBack.getByRole("menuitemradio", { name: en.views.allRecords })
      await expect(allRecords).toBeVisible()
      await allRecords.click()

      await page.waitForURL((url) => url.searchParams.get("view") === "none")
      await expect(page.getByRole("heading", { level: 1, name: surface.anchor(en) })).toBeVisible()
      await expect(
        input,
        `${surface.path}: All records dropped the search from the URL and the box must follow`
      ).toHaveValue("")
      console.log(`[40-15] V-40-7 ${surface.path} | All records -> box cleared`)
    })
  }

  /**
   * V-40-7b — THE OTHER HALF OF THE SAME REQUIREMENT: RESYNCING MUST NOT COST THE CARET.
   *
   * The tests above prove the box follows the URL. They pass just as happily when the box follows
   * the URL by being DESTROYED and rebuilt, which is what `key={search}` did — and a remount takes
   * focus with it. Measured as D-40-2 on `/activities`: typing "ltda" with a pause past the 300ms
   * debounce yielded `Expected "ltda", Received "lt"` with `activeElement=BODY`.
   *
   * That defect shipped on THREE surfaces and the resync tests above were green on all three the
   * whole time. It was caught by an ad-hoc measurement, and then survived a fix that reached only
   * two of the three files. This test exists so neither can happen again: it is per-surface, so a
   * surface fixed in isolation cannot mask one that was missed.
   *
   * The pause is the load-bearing part. Typing straight through never lets the debounce fire, so a
   * remount never happens and the assertion would be vacuous.
   */
  for (const surface of SURFACES.filter((s) => s.hasSearchBox)) {
    test(`${surface.path} — typing past the debounce keeps the caret in the box (D-40-2)`, async ({
      page,
      baseURL,
    }) => {
      await useLocale(page, baseURL, "en-US")
      await gotoSettled(page, `${surface.path}?view=none`, surface.anchor(en))

      const input = page.getByPlaceholder(SEARCH_PLACEHOLDER[surface.path])
      await expect(input).toBeVisible()
      await input.click()

      // First burst, then a pause LONGER than the 300ms debounce so the navigation actually lands.
      await input.pressSequentially("lt", { delay: 40 })
      await page.waitForURL((url) => url.searchParams.get("search") === "lt")

      expect(
        await page.evaluate(() => document.activeElement?.tagName ?? "NONE"),
        `${surface.path}: the debounced navigation landed and took focus off the search box — the box was remounted rather than resynced (D-40-2)`
      ).toBe("INPUT")

      // Keep typing into the SAME node. If it was remounted these characters go nowhere.
      await input.pressSequentially("da", { delay: 40 })
      await expect(
        input,
        `${surface.path}: characters typed after the debounce fired were dropped — the box lost the caret mid-typing (D-40-2)`
      ).toHaveValue("ltda")

      console.log(`[40-15] V-40-7b ${surface.path} | caret survived the debounced navigation`)
    })
  }
})

/* ============================================================================================
 * V-40-11 — F-39-08 CONTAINMENT.
 * ========================================================================================== */

/** Created by the app, not by the fixtures module — so the name must still carry the prefix. */
const ENTER_PROBE_NAME = `${VIEWS_FIXTURE_PREFIX} enter-submit probe`

test.describe("V-40-11 — Enter inside the save dialog", () => {
  test.describe.configure({ timeout: 120_000 })

  /**
   * MEASURED RED, AND DELIBERATELY LEFT RED. F-39-08 IS NOT CONTAINED.
   *
   * `save-view-dialog.tsx`'s own header states the hypothesis: "a click handler on the button
   * would instead let the page-level hotkey win… plan 40-15 asserts that Enter on the focused
   * submit does not navigate the list behind the dialog." It was asserted, this session, against
   * the rebuilt image. It does not hold:
   *
   *     Expected: "http://localhost:3001/organizations?search=ltda"
   *     Received: "http://localhost:3001/organizations/9b37a635-b601-4e71-886d-83640ff776fe"
   *
   * `useHotkeys("enter", …, { enableOnFormTags: false, preventDefault: true })` is registered on
   * the DOCUMENT with no ref, and `isFormFocused` exempts INPUT / TEXTAREA / SELECT /
   * contenteditable but NOT BUTTON. Radix's modal layer does not stop the keydown reaching that
   * document listener, so `onOpen(data[0])` wins over the button's own activation and Tab-to-
   * submit-then-Enter — an ordinary keyboard flow — discards the draft view and lands the user on
   * an unrelated organization's detail page. Space still activates the button correctly; only
   * Enter is bound.
   *
   * WHY `test.fail()` RATHER THAN A WEAKER ASSERTION, AND WHY NOT A FIX HERE.
   *
   * The assertion below is byte-identical to the one that failed and still RUNS in full.
   * `test.fail()` inverts only the verdict, so the suite FAILS THE DAY THIS STARTS PASSING —
   * which is precisely what a defect record should do and what a relaxed assertion could never
   * do. Nothing here is vacuous: the anti-vacuity guard above proves the hook has a row to
   * navigate to, so a green result could not come from an empty list.
   *
   * The fix is out of this plan's scope by the plan's own words ("Fixing F-39-08 is out of scope —
   * app-wide, six surfaces — proving the containment is not"), and it is genuinely not a one-liner:
   * the obvious `stopPropagation()` on the dialog would also cut Radix's DOCUMENT-level Escape
   * listener, breaking the O-3 dismissal this same file proves works. Reported as a blocker rather
   * than patched blind. See `deferred-items.md`.
   */
  test.fail("the focused submit does not navigate the list behind it", async ({ page, baseURL }) => {
    await useLocale(page, baseURL, "en-US")
    await gotoSettled(page, "/organizations?search=ltda", en.organizations.title)

    /*
     * ANTI-VACUITY, AND THIS ONE IS THE WHOLE TEST.
     *
     * `useDataTableKeyboard` clamps `selectedIndex` to 0 and reads `selectedItem = data[0]`, so
     * the `enter` hotkey navigates ONLY when the list has at least one row. Behind an EMPTY list
     * `selectedItem` is null, the handler returns without navigating, and this test would report
     * "contained" with F-39-08 completely present — the exact shape of the Phase 39 gate that
     * stayed green with its defect in place. `ltda` matches 13,355 of 46,054 organizations, and
     * `data-selected="true"` is the attribute the hook itself sets on the row it would open.
     */
    const selectedRow = page.locator('[data-selected="true"]')
    await expect(
      selectedRow,
      "the keyboard hook must have a selected row, or Enter has nothing to navigate to"
    ).toHaveCount(1)

    const urlBefore = page.url()

    const menu = await openPicker(page, en)
    const dialog = page.getByRole("dialog")
    await clickUntil(
      menu.getByRole("menuitem", { name: en.views.saveNew }),
      dialog,
      "V-40-11 save dialog open"
    )

    const submit = dialog.getByRole("button", { name: en.views.save.submit })
    await expect(submit).toBeVisible()
    await submit.focus()
    expect(
      await page.evaluate(() => document.activeElement?.tagName ?? "NONE"),
      "the focused element must be a BUTTON — the tag `isFormFocused` does NOT exempt"
    ).toBe("BUTTON")

    await page.keyboard.press("Enter")

    /*
     * A bounded wait, and it is the right instrument here because the claim is a NEGATIVE: nothing
     * must happen. There is no event to await for an absence. 1500ms is well past the client-side
     * `router.push` this would produce.
     */
    await page.waitForTimeout(1500)

    expect(
      page.url(),
      "Enter on the focused submit navigated the list behind the dialog — F-39-08 is NOT contained"
    ).toBe(urlBefore)
    await expect(dialog, "the dialog must survive Enter on its own submit").toBeVisible()
    console.log(`[40-15] V-40-11 | Enter on the submit: url unchanged, dialog still open`)
  })

  /**
   * THE SAFE PATH, and it is why the fields live in a real `<form>` (O-4). INPUT *is* exempted by
   * `isFormFocused`, so Enter typed in the name field never reaches the page-level hotkey and the
   * form's implicit submission runs. This half is a plain passing test: the exemption works, and
   * it is the ONLY reason the dialog is usable from the keyboard at all today.
   *
   * It lives in its own test rather than after the assertion above, because the half above is
   * `test.fail()` and everything following a failed assertion in the same test would never run.
   */
  test("Enter in the name input submits the form", async ({ page, baseURL }) => {
    await useLocale(page, baseURL, "en-US")
    await gotoSettled(page, "/organizations?search=ltda", en.organizations.title)

    const menu = await openPicker(page, en)
    const dialog = page.getByRole("dialog")
    await clickUntil(
      menu.getByRole("menuitem", { name: en.views.saveNew }),
      dialog,
      "V-40-11 save dialog open"
    )

    const nameInput = dialog.getByLabel(en.views.save.nameLabel)
    await nameInput.fill(ENTER_PROBE_NAME)
    expect(
      await page.evaluate(() => document.activeElement?.tagName ?? "NONE"),
      "the focused element must be an INPUT — the one tag `isFormFocused` does exempt"
    ).toBe("INPUT")
    await nameInput.press("Enter")

    await expect(dialog, "Enter in the name input must submit the form").toHaveCount(0)

    // The dialog closing is only reachable through `result.success`, but "the row exists" is the
    // fact and the close is the inference. It carries the fixture prefix, so `afterAll` reclaims it.
    const sql = openDb()
    try {
      const rows = await sql<{ id: string }[]>`
        select id from saved_views where name = ${ENTER_PROBE_NAME} limit 1
      `
      expect(rows.length, "Enter in the name input must have created the view").toBe(1)
    } finally {
      await sql.end()
    }
    console.log(`[40-15] V-40-11 | Enter in the name input: form submitted, row created`)
  })
})
