/**
 * V-40-9 — THE DEGRADED-READ GATE. A view whose stored owner, pipeline or stage no longer resolves
 * renders a 200, a working list, and ONE MUTED SENTENCE. Never a 500, never a dead end, never a red
 * panel.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS A GATE AND NOT A UNIT TEST.
 *
 * `validateStoredFilters` is pure and is already unit-tested against every drop rule (plan 40-05).
 * What it CANNOT tell you is what the user sees, and three separate components decide that:
 *
 *   - `resolveSavedViewsBarProps` hands `droppedFilterKeys` to the bar, but ONLY for the SELECTED
 *     view — a degraded view sitting unopened in someone's picker must print nothing (V-11).
 *   - `deals/page.tsx` merges its own `pipelineWasDropped` into that array, because by the time
 *     `selectedPipeline` exists, "the requested board is gone" is indistinguishable from "no board
 *     was requested". That merge is a SECOND source of the notice and has its own branch.
 *   - `saved-views-bar.tsx` renders `<p class="text-muted-foreground text-xs">` and, by C-40-4,
 *     deliberately does NOT render an `Alert`.
 *
 * And the stakes are set by M-14: THERE IS NO `error.tsx` ANYWHERE UNDER `src/app`. That is asserted
 * here rather than assumed (see the first test), because it is what makes a throw on this path a
 * BLANK PAGE rather than a caught error with a retry button. `/deals` demonstrated the shape before
 * plan 40-12: `GET /deals?pipeline=<dead uuid>` returned 200 carrying nothing but
 * `Pipeline not found.` — a dead end that reads to a user as a crash.
 *
 * ---------------------------------------------------------------------------------------------
 * THE FIXTURES POINT AT DEAD IDS; THEY NEVER CREATE ONE.
 *
 * T-40-80. No live pipeline, stage or user is deleted by this file. The `DEAD_OWNER` case uses a
 * REAL soft-deleted user id read out of the database at seed time — there are six, so the
 * `views.ownerUnavailable` / dropped-owner branch is the most reachable degradation in this
 * deployment, not an exotic one. The dead pipeline is a random uuid. The dead stage is a REAL stage
 * that belongs to a DIFFERENT pipeline, which is the cross-pipeline case `validateStoredFilters`
 * scopes for and a random uuid would not exercise.
 *
 * ---------------------------------------------------------------------------------------------
 * ANTI-VACUITY, THREE WAYS, because "assert something is absent" is the easiest test in the world to
 * pass by accident:
 *
 *   1. A VALID view is selected on each surface and `views.degraded` must have count 0 there. A
 *      component that always printed the notice would satisfy every assertion in the other
 *      direction and be a permanent false alarm.
 *   2. The no-`Alert` locator is proved to WORK before it is trusted, by injecting a real
 *      `Alert`-shaped node into the live page and watching the locator find it. The plan specified
 *      `[data-slot="alert"]`; this repo's `src/components/ui/alert.tsx` is the older forwardRef
 *      shadcn build and emits `role="alert"` with NO `data-slot` anywhere in `src/` — so that
 *      selector could never have matched anything and the assertion would have been vacuous by
 *      construction. Corrected to `[role="alert"]`, and then PROVED.
 *   3. "The list rendered" is asserted as rows or as the surface's own empty state, named
 *      explicitly. "The page did not crash" is a different and much weaker claim, and Phase 39's
 *      lesson is that only the stronger one matters.
 */

import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { expect, test, type Locator, type Page } from "@playwright/test"

import en from "../src/messages/en-US.json"
import { E2E_ADMIN_EMAIL } from "./seed-admin"
import {
  VIEWS_FIXTURE_PREFIX,
  insertViewFixture,
  openDb,
  purgeViewFixtures,
  type ViewsDb,
} from "./views-fixtures"

const M = en.views

/** Well-formed, and provably absent: v4 uuid, all-zero payload. Nothing in this database is it. */
const DEAD_PIPELINE_ID = "00000000-0000-4000-8000-000000000000"

const NAMES = {
  deadOwner: `${VIEWS_FIXTURE_PREFIX} degraded DEAD_OWNER`,
  deadPipeline: `${VIEWS_FIXTURE_PREFIX} degraded DEAD_PIPELINE`,
  deadStage: `${VIEWS_FIXTURE_PREFIX} degraded DEAD_STAGE`,
  validActivity: `${VIEWS_FIXTURE_PREFIX} degraded VALID_ACTIVITY`,
  validDeal: `${VIEWS_FIXTURE_PREFIX} degraded VALID_DEAL`,
} as const

interface DegradedFixtures {
  softDeletedUserId: string
  activeUserId: string
  activityTypeId: string
  livePipelineId: string
  livePipelineName: string
  livePipelineStageId: string
  defaultPipelineName: string
  foreignStageId: string
}

let seeded: DegradedFixtures

/** Every fixture's id, keyed by the same names — the `waitForURL` predicate below needs them. */
const viewIds: Record<keyof typeof NAMES, string> = {
  deadOwner: "",
  deadPipeline: "",
  deadStage: "",
  validActivity: "",
  validDeal: "",
}

/**
 * THE NEGATIVE-PROBE KNOB, and it is a fixture switch rather than a source edit on purpose: the
 * container has no volume mount, so probing the APP would cost a Docker rebuild, while probing the
 * FIXTURE costs one environment variable and attacks the same question. The question a degraded-read
 * gate has to answer is "can this locator tell degraded from healthy?", and a fixture flip is the
 * clean way to ask it.
 *
 *   E2E_VIEWS_PROBE=heal-degraded  — DEAD_OWNER's owner becomes a LIVE user, so nothing is dropped.
 *                                    The DEAD_OWNER test must go RED.
 *   E2E_VIEWS_PROBE=break-valid    — VALID_ACTIVITY's owner becomes the SOFT-DELETED user, so the
 *                                    notice appears where the companion asserts it must not. The
 *                                    ANTI-VACUITY test must go RED.
 *
 * Between them, `views.degraded` is shown to be visible exactly when a key was dropped and absent
 * exactly when none was — which is the whole claim, in both directions, from the same locator.
 */
const PROBE = process.env.E2E_VIEWS_PROBE ?? ""
const HEAL_DEGRADED = PROBE === "heal-degraded"
const BREAK_VALID = PROBE === "break-valid"

test.describe.configure({ mode: "serial", timeout: 180_000 })

/**
 * Read the ids the fixtures need OUT OF THE DATABASE rather than hardcoding them.
 *
 * A hardcoded soft-deleted user id would silently stop exercising its branch the day that row is
 * hard-deleted or restored — the fixture would keep passing while testing a random uuid, which is a
 * different code path (`has(catalog.userIds, value)` is false either way, but only the real id
 * proves the branch is reachable from real data). Same for the stage pair.
 */
async function readLiveIds(sql: ViewsDb): Promise<DegradedFixtures> {
  const softDeleted = await sql<{ id: string }[]>`
    select id from users where deleted_at is not null order by deleted_at limit 1
  `
  if (softDeleted.length === 0) {
    throw new Error(
      "no soft-deleted user in the dev database — the DEAD_OWNER fixture cannot exercise the real " +
        "`views.ownerUnavailable` branch. Do NOT soft-delete a live user to create one."
    )
  }

  /*
   * THE SURVIVING `owner` VALUE, AND IT IS NOT THE E2E ADMIN — 40-15's deviation 4, rediscovered.
   *
   * A filter value has to be chosen so that the assertion resting on it can fail. The first version
   * used the seeded e2e admin, who owns ZERO of the 79,022 activities, so VALID_ACTIVITY's list came
   * back empty and the anti-vacuity companion asserted "no degraded notice" over a page with nothing
   * on it. Measured: all 79,022 activities belong to ONE active user. That is the id a `owner` filter
   * has to carry for a surviving-filter assertion to mean anything.
   *
   * READ-ONLY USE OF A REAL ROW. This is a filter VALUE, never a write target: nothing in this file
   * updates, deletes or logs in as that user. The `deleted_at is null` predicate is what makes it the
   * surviving half of the DEAD_OWNER pair, and it is asserted rather than assumed.
   */
  const active = await sql<{ id: string }[]>`
    select u.id
    from users u
    join activities a on a.owner_id = u.id
    where u.deleted_at is null
    group by u.id
    order by count(a.id) desc
    limit 1
  `
  if (active.length === 0) {
    throw new Error(
      "no ACTIVE user owns any activity — the surviving `owner` filter would return an empty list " +
        "and the anti-vacuity companion would assert nothing"
    )
  }

  const activityType = await sql<{ id: string }[]>`select id from activity_types order by id limit 1`
  if (activityType.length === 0) throw new Error("no activity_types row in the dev database")

  /*
   * TWO DIFFERENT live pipelines, each with at least one stage: one to RENDER and one to steal a
   * foreign stage id from. That pair is the whole point of the DEAD_STAGE case.
   *
   * THE BOARD TO RENDER IS THE SMALLEST NON-EMPTY ONE, AND THAT IS A MEASUREMENT, NOT A PREFERENCE.
   * A first version took the LARGEST, reasoning that a populated board is a better subject. Measured
   * against the running container:
   *
   *   /deals?pipeline=<Closer, 15,415 deals>       -> 200, h1 visible in  88,338 ms
   *   /deals?pipeline=<SaaS kill list, 2 deals>    -> 200, h1 visible in     328 ms
   *   /deals (default board, BDR, 3,754 deals)     -> 200, h1 visible in   5,255 ms
   *
   * The 88s render blew this file's 180s test budget on its own and is logged as a product defect in
   * `deferred-items.md` (D-40-3) — it is not this gate's to fix, and it is not this gate's to be
   * hostage to either. Nothing here asserts a deal CARD, only that the board rendered and names the
   * right pipeline, so a two-deal board proves exactly as much as a fifteen-thousand-deal one and
   * proves it 270x faster. `having count(d.id) > 0` keeps it non-empty all the same.
   */
  const pipelines = await sql<{ id: string; name: string; deals: string }[]>`
    select p.id, p.name, count(d.id)::text as deals
    from pipelines p
    join stages s on s.pipeline_id = p.id
    left join deals d on d.stage_id = s.id
    where p.deleted_at is null
    group by p.id, p.name
    having count(d.id) > 0
    order by count(d.id) asc
  `
  if (pipelines.length < 2) {
    throw new Error("fewer than two live non-empty pipelines — DEAD_STAGE needs a foreign stage")
  }

  const home = pipelines[0]
  const foreign = pipelines[pipelines.length - 1]

  const homeStage = await sql<{ id: string }[]>`
    select id from stages where pipeline_id = ${home.id} order by position limit 1
  `
  const foreignStage = await sql<{ id: string }[]>`
    select id from stages where pipeline_id = ${foreign.id} order by position limit 1
  `

  /*
   * WHICH BOARD `deals/page.tsx` FALLS BACK TO, computed the way the page computes it:
   * `allPipelines.find(isDefault) ?? allPipelines[0]` over an `isDefault DESC, name` ordering. All
   * 11 live pipelines have `is_default = 0` today, so it is the alphabetically first — but that is
   * a fact about the data, not a constant, so it is READ rather than written down.
   */
  const defaultPipeline = await sql<{ name: string }[]>`
    select name from pipelines where deleted_at is null
    order by is_default desc, name asc limit 1
  `

  return {
    softDeletedUserId: softDeleted[0].id,
    activeUserId: active[0].id,
    activityTypeId: activityType[0].id,
    livePipelineId: home.id,
    livePipelineName: home.name,
    livePipelineStageId: homeStage[0].id,
    defaultPipelineName: defaultPipeline[0].name,
    foreignStageId: foreignStage[0].id,
  }
}

test.beforeAll(async () => {
  const sql = openDb()
  try {
    const reclaimed = await purgeViewFixtures(sql)
    console.log(
      `[40-16 degraded] beforeAll purge reclaimed ${reclaimed.views} views / ` +
        `${reclaimed.defaults} defaults`
    )

    seeded = await readLiveIds(sql)

    // DEAD_OWNER — the owner is soft-deleted, the type survives. Dropped: ["owner"].
    viewIds.deadOwner = await insertViewFixture(sql, {
      ownerEmail: E2E_ADMIN_EMAIL,
      entityType: "activity",
      name: NAMES.deadOwner,
      filters: {
        owner: HEAL_DEGRADED ? seeded.activeUserId : seeded.softDeletedUserId,
        type: seeded.activityTypeId,
      },
      isShared: false,
    })

    // DEAD_PIPELINE — Decision 4. The pipeline is gone, the owner survives. Dropped: ["pipeline"].
    viewIds.deadPipeline = await insertViewFixture(sql, {
      ownerEmail: E2E_ADMIN_EMAIL,
      entityType: "deal",
      name: NAMES.deadPipeline,
      filters: { pipeline: DEAD_PIPELINE_ID, owner: seeded.activeUserId },
      isShared: false,
    })

    // DEAD_STAGE — the cross-pipeline case: a REAL stage on the WRONG board. Dropped: ["stage"].
    viewIds.deadStage = await insertViewFixture(sql, {
      ownerEmail: E2E_ADMIN_EMAIL,
      entityType: "deal",
      name: NAMES.deadStage,
      filters: { pipeline: seeded.livePipelineId, stage: seeded.foreignStageId },
      isShared: false,
    })

    // The two anti-vacuity companions: everything they store still resolves.
    viewIds.validActivity = await insertViewFixture(sql, {
      ownerEmail: E2E_ADMIN_EMAIL,
      entityType: "activity",
      name: NAMES.validActivity,
      filters: {
        owner: BREAK_VALID ? seeded.softDeletedUserId : seeded.activeUserId,
        type: seeded.activityTypeId,
      },
      isShared: false,
    })
    viewIds.validDeal = await insertViewFixture(sql, {
      ownerEmail: E2E_ADMIN_EMAIL,
      entityType: "deal",
      name: NAMES.validDeal,
      filters: { pipeline: seeded.livePipelineId, stage: seeded.livePipelineStageId },
      isShared: false,
    })

    console.log(
      `[40-16 degraded] seeded | soft-deleted owner=${seeded.softDeletedUserId} ` +
        `| dead pipeline=${DEAD_PIPELINE_ID} ` +
        `| home pipeline=${seeded.livePipelineId} (${seeded.livePipelineName}) ` +
        `| foreign stage=${seeded.foreignStageId} ` +
        `| fallback board="${seeded.defaultPipelineName}"`
    )
  } finally {
    await sql.end()
  }
})

test.afterAll(async () => {
  const sql = openDb()
  try {
    const purged = await purgeViewFixtures(sql)
    const remaining = await sql<{ count: string }[]>`
      select count(*)::text as count from saved_views where name like '[e2e] View%'
    `
    console.log(
      `[40-16 degraded] afterAll purge removed ${purged.views} views / ${purged.defaults} ` +
        `defaults; ${remaining[0].count} prefixed rows remain`
    )
    expect(Number(remaining[0].count), "every fixture view must be reclaimed").toBe(0)
  } finally {
    await sql.end()
  }
})

/* ============================================================================================
 * M-14 — the claim the whole no-500 posture rests on, CHECKED rather than cited.
 * ========================================================================================== */

function findErrorBoundaries(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) findErrorBoundaries(full, found)
    else if (entry === "error.tsx" || entry === "global-error.tsx") found.push(full)
  }
  return found
}

test("M-14 — there is no error.tsx under src/app, so a throw on this path would be a BLANK PAGE", () => {
  const boundaries = findErrorBoundaries("src/app")

  console.log(
    `[40-16 degraded] error boundaries under src/app: ${boundaries.length} ` +
      `${boundaries.length === 0 ? "(none — M-14 holds)" : boundaries.join(", ")}`
  )

  expect(
    boundaries,
    "an error boundary appeared under src/app. That is not a failure of this phase — but every " +
      "'renders 200 with the list intact' assertion below was written knowing a throw here has " +
      "NOWHERE to be caught, and that reasoning now needs revisiting."
  ).toEqual([])
})

/* ============================================================================================
 * The shared machinery.
 * ========================================================================================== */

async function gotoSettled(page: Page, url: string, anchor: string): Promise<number> {
  const response = await page.goto(url)
  await expect(page.getByRole("heading", { level: 1, name: anchor })).toBeVisible()
  expect(response, `${url}: no main-frame response`).not.toBeNull()
  return response!.status()
}

/** Open the picker. Only the OPEN is retried (BACKLOG #418 swallows clicks on these routes). */
async function openPicker(page: Page): Promise<Locator> {
  const trigger = page.getByRole("button", { name: M.picker.label })
  const menu = page.getByRole("menu")

  await expect(async () => {
    if (await menu.isVisible()) return
    await expect(trigger).toBeVisible({ timeout: 2_000 })
    await trigger.click()
    await expect(menu).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000, intervals: [250, 500, 1_000] })

  return menu
}

/**
 * Select a view THROUGH the picker — never by `page.goto` to a hand-built URL.
 *
 * M-9: app-router navigation re-renders without remounting, and a `goto` remounts everything. A
 * degradation that only survives a full document load would be invisible to a `goto`-driven test and
 * completely present for a user who clicked. Returns the URL the app itself chose, which is the
 * subject of the status assertion that follows.
 */
async function selectViewFromPicker(page: Page, which: keyof typeof NAMES): Promise<string> {
  const viewName = NAMES[which]
  const viewId = viewIds[which]
  expect(viewId, `${which} has no id — beforeAll did not run`).not.toBe("")

  const menu = await openPicker(page)
  await expect(
    menu.getByText(viewName, { exact: true }),
    `${viewName} is not in the picker — the fixture was purged or never inserted`
  ).toBeVisible()
  await menu.getByText(viewName, { exact: true }).click()
  await expect(menu).toHaveCount(0)

  /*
   * WAIT FOR THIS VIEW'S ID, NOT MERELY FOR A `view` KEY. The first version waited for
   * `searchParams.has("view")` and every test entered from `?view=none` — which HAS a `view` key —
   * so `waitForURL` resolved instantly against the URL the test started on and `page.url()` returned
   * the pre-click address. It surfaced as `expect(searchParams.get("type")).toBe("call")` receiving
   * `null`, which reads like a validator bug and was a harness bug. Waiting for the exact id cannot
   * resolve early: `none` is the one value `parseViewSelection` reserves and no fixture can have it.
   */
  await page.waitForURL((url) => url.searchParams.get("view") === viewId)
  return page.url()
}

const degradedNotice = (page: Page): Locator => page.getByText(M.degraded, { exact: true })

/**
 * C-40-4. NOT `[data-slot="alert"]` — see the anti-vacuity note in the file header; this repo emits
 * no `data-slot` at all, so that selector was unfalsifiable. `role="alert"` is what
 * `src/components/ui/alert.tsx` actually renders, and the destructive variant is checked by its own
 * class so "no Alert" and "no RED Alert" are two separate statements rather than one hopeful one.
 */
/**
 * AND NOT A BARE `[role="alert"]` EITHER. MEASURED, and it is the second vacuity trap in this one
 * assertion.
 *
 * Next.js injects `<div id="__next-route-announcer__" role="alert" aria-live="assertive">` into
 * `<body>` — a visually-hidden 1x1 live region that announces route changes to screen readers. It is
 * NOT present on a first document load and IS present after the first client-side navigation, which
 * is exactly what every test in this file does. Probed directly:
 *
 *   { before: 0, during: 1, after: 1,
 *     html: ['<div aria-live="assertive" id="__next-route-announcer__" role="alert" …></div>'] }
 *
 * So a bare `[role="alert"]` count-0 assertion fails on every degraded page for a reason that has
 * nothing to do with Alerts. The dangerous outcome is not the red run — it is the "fix" the red run
 * invites: deleting the assertion, or weakening it to something that also stops seeing real Alerts.
 *
 * The announcer is excluded BY ITS ID, which is a Next.js internal and not a class anyone restyles,
 * and the probe test below asserts that any node this selector excludes really is the announcer — so
 * the exclusion cannot quietly grow to cover a real Alert.
 */
const ALERT_SELECTOR = '[role="alert"]:not(#__next-route-announcer__)'

const anyAlert = (page: Page): Locator => page.locator(ALERT_SELECTOR)
const destructiveAlert = (page: Page): Locator =>
  page.locator(`${ALERT_SELECTOR}[class*="destructive"]`)

async function assertNoAlert(page: Page, label: string): Promise<void> {
  await expect(
    anyAlert(page),
    `${label}: a degraded read rendered an Alert. C-40-4 — the view still produced a working list, ` +
      `nothing failed and nothing is unsafe, and a red panel over a working list teaches the user ` +
      `that red means nothing.`
  ).toHaveCount(0)
  await expect(destructiveAlert(page), `${label}: a DESTRUCTIVE alert over a working list`).toHaveCount(0)
}

/** The `/activities` list: rows, or its own named empty state. Which one is asserted, not inferred. */
async function assertActivityListRendered(page: Page, label: string): Promise<void> {
  const rows = page.locator("table tbody tr")
  const emptyState = page.getByText(en.activities.noActivitiesFound, { exact: true })

  await expect(rows.first(), `${label}: the activities table rendered no rows at all`).toBeVisible()
  const rowCount = await rows.count()
  const isEmptyState = await emptyState.isVisible()

  expect(
    isEmptyState,
    `${label}: the list is the EMPTY STATE, not rows. That is a legitimate render, but this ` +
      `fixture filters on a type with tens of thousands of activities, so an empty list means the ` +
      `surviving filter stopped working rather than the degradation being handled.`
  ).toBe(false)

  console.log(`[40-16 degraded] ${label} | activities list rendered ${rowCount} rows`)
}

/** The `/deals` board: the pipeline combobox names a board and its stage columns rendered. */
async function assertBoardRendered(
  page: Page,
  label: string,
  expectedPipelineName: string
): Promise<void> {
  const pipelineSelect = page.getByRole("combobox").first()
  await expect(
    pipelineSelect,
    `${label}: no pipeline selector — /deals took its early-return branch instead of rendering the board`
  ).toBeVisible()

  /*
   * A SETTLE, AND NOT A RELAXED ASSERTION — the distinction 40-15 drew for `boxOf`.
   *
   * Radix's `SelectValue` reads the selected item's label out of a context that only its
   * `SelectItem`s populate, and those live inside a closed `SelectContent` that is not rendered on
   * the server. So the SSR'd trigger is EMPTY and fills in on hydration. Measured: the first
   * version asserted with Playwright's default 5s and caught the trigger mid-hydration —
   * `7 × locator resolved to <button … data-slot="select-trigger"> - unexpected value ""` — while a
   * direct probe of the same URL with a 2.5s settle read "BDR - Base Fria". `/deals` is the heaviest
   * of the four routes (25,195 deals, 11 pipelines) and 5s is not a safe hydration budget on it.
   *
   * Waiting for ANY text and then asserting WHICH text keeps the two questions apart: an empty
   * trigger is a timing fact, a wrong board name is a defect, and the failure message has to be able
   * to say which one happened.
   */
  await expect(
    pipelineSelect,
    `${label}: the pipeline trigger is still empty after 30s — the board never hydrated`
  ).not.toHaveText("", { timeout: 30_000 })

  await expect(
    pipelineSelect,
    `${label}: the board is not the expected one`
  ).toContainText(expectedPipelineName)

  console.log(`[40-16 degraded] ${label} | board "${expectedPipelineName}" rendered`)
}

/**
 * `innerText`, deliberately, and not `getByText`. The next-intl message blob ships the whole catalog
 * into the document — 40-15 measured `Pipeline not found.` appearing exactly once inside it on a
 * page that renders no such text — so a DOM-wide text query can match a string that is not on
 * screen. `innerText` is the rendered text and nothing else.
 */
async function assertTextNotRendered(page: Page, text: string, label: string): Promise<void> {
  const rendered = await page.locator("body").innerText()
  expect(
    rendered.includes(text),
    `${label}: "${text}" is on screen. This is the dead end Decision 4 removed — before plan ` +
      `40-12, GET /deals?pipeline=<dead uuid> returned 200 carrying nothing else, and with no ` +
      `error.tsx above the route that dead end IS the whole page.`
  ).toBe(false)
}

/* ============================================================================================
 * The anti-vacuity proof for the no-Alert locator itself.
 * ========================================================================================== */

test("the no-Alert locator is not vacuous — it finds a real Alert when one is on the page", async ({
  page,
}) => {
  await gotoSettled(page, "/activities", en.activities.title)
  await assertNoAlert(page, "PROBE baseline /activities")

  /*
   * Inject exactly what `src/components/ui/alert.tsx` renders for `variant="destructive"` — the
   * `role="alert"` and the `border-destructive/50 text-destructive` classes — and require BOTH
   * locators to find it. Without this, `toHaveCount(0)` above is a selector that has never been
   * shown to select anything, which is the plan's `[data-slot="alert"]` mistake in a different
   * costume. Removed again immediately; nothing is committed to the page.
   */
  await page.evaluate(() => {
    const node = document.createElement("div")
    node.id = "gate-probe-alert"
    node.setAttribute("role", "alert")
    node.className =
      "relative w-full rounded-lg border px-4 py-3 text-sm border-destructive/50 text-destructive"
    node.textContent = "probe"
    document.body.appendChild(node)
  })

  await expect(
    anyAlert(page),
    "the [role=alert] locator cannot see an Alert that IS on the page — every no-Alert assertion " +
      "in this file would be vacuous"
  ).toHaveCount(1)
  await expect(
    destructiveAlert(page),
    "the destructive-variant locator cannot see a destructive Alert"
  ).toHaveCount(1)

  await page.evaluate(() => document.getElementById("gate-probe-alert")?.remove())
  await assertNoAlert(page, "PROBE after cleanup /activities")

  /*
   * AND THE EXCLUSION IS AUDITED. Whatever `[role="alert"]` nodes the bare selector still sees must
   * be Next.js's route announcer and nothing else — otherwise `:not(#__next-route-announcer__)` is
   * hiding something this file claims not to render.
   */
  const excluded = await page
    .locator('[role="alert"]')
    .evaluateAll((nodes) => nodes.map((node) => node.id || node.outerHTML.slice(0, 120)))
  expect(
    excluded.filter((id) => id !== "__next-route-announcer__"),
    "a [role=alert] node survived that is NOT Next.js's route announcer — the exclusion in " +
      "ALERT_SELECTOR is hiding a real Alert"
  ).toEqual([])

  console.log(
    `[40-16 degraded] no-Alert locator PROVED: 0 -> 1 -> 0 around an injected Alert; ` +
      `bare [role=alert] nodes present: ${JSON.stringify(excluded)}`
  )
})

/* ============================================================================================
 * The three degradations.
 * ========================================================================================== */

test("DEAD_OWNER — a view whose owner filter names a soft-deleted user renders 200, a list, and the notice", async ({
  page,
}) => {
  await gotoSettled(page, "/activities?view=none", en.activities.title)

  const url = await selectViewFromPicker(page, "deadOwner")

  /*
   * The picker navigates client-side, so there is no main-frame response to read. Re-entering the
   * URL the app chose is what produces one — and it also proves the degraded URL is a legitimate
   * destination a user could bookmark, not merely a transient client state.
   */
  const status = await gotoSettled(page, url, en.activities.title)
  expect(status, `DEAD_OWNER: ${url} did not return 200`).toBe(200)

  /*
   * THE NOTICE FIRST — same reasoning as the anti-vacuity companion below. The URL facts are
   * supporting evidence; the sentence on the screen is the claim. `E2E_VIEWS_PROBE=heal-degraded`
   * makes this fixture healthy, and it must be caught HERE rather than by a URL precondition.
   */
  await expect(
    degradedNotice(page),
    "DEAD_OWNER: no `views.degraded` notice. The owner filter was silently dropped and the user is " +
      "looking at a wider list than the one they saved, with nothing on screen saying so."
  ).toBeVisible()

  const landed = new URL(url)
  expect(
    landed.searchParams.get("owner"),
    "the dead owner key must be GONE from the URL the picker navigated to — `views` carries the " +
      "VALIDATED filters precisely so a selection does not re-apply a filter that cannot resolve"
  ).toBeNull()
  expect(
    landed.searchParams.get("type"),
    "the SURVIVING filter must still be applied — degrading must not mean discarding the whole view"
  ).toBe(seeded.activityTypeId)

  await assertActivityListRendered(page, "DEAD_OWNER")
  await assertNoAlert(page, "DEAD_OWNER")

  console.log(`[40-16 degraded] DEAD_OWNER | 200 at ${url} | notice shown | no Alert`)
})

test("DEAD_PIPELINE — Decision 4: the default board renders and `pipelineNotFound` is never on screen", async ({
  page,
}) => {
  await gotoSettled(page, "/deals?view=none", en.deals.title)

  const url = await selectViewFromPicker(page, "deadPipeline")
  const status = await gotoSettled(page, url, en.deals.title)
  expect(status, `DEAD_PIPELINE: ${url} did not return 200`).toBe(200)

  const landed = new URL(url)
  expect(landed.searchParams.get("pipeline"), "the dead pipeline key must be gone").toBeNull()
  expect(landed.searchParams.get("owner"), "the surviving owner filter must apply").toBe(
    seeded.activeUserId
  )

  await assertBoardRendered(page, "DEAD_PIPELINE (via picker)", seeded.defaultPipelineName)
  await assertTextNotRendered(page, en.deals.pipelineNotFound, "DEAD_PIPELINE (via picker)")
  await expect(degradedNotice(page), "DEAD_PIPELINE: no `views.degraded` notice").toBeVisible()
  await assertNoAlert(page, "DEAD_PIPELINE (via picker)")

  /*
   * THE SECOND ARRIVAL, AND IT EXERCISES A DIFFERENT BRANCH — this is the case the picker path
   * cannot reach. Selecting through the picker strips `pipeline` client-side, so `params.pipeline`
   * is never set and `deals/page.tsx`'s own `pipelineWasDropped` merge never runs. A BOOKMARK or a
   * shared link still carries the dead id, and that is the input the page-level merge exists for:
   * `pipelineWasDropped && !droppedFilterKeys.includes("pipeline")`. Without this navigation the
   * merge would be untested and Decision 4 would be half proved.
   */
  const bookmarked = `/deals?pipeline=${DEAD_PIPELINE_ID}`
  const bookmarkStatus = await gotoSettled(page, bookmarked, en.deals.title)
  expect(bookmarkStatus, `${bookmarked} did not return 200`).toBe(200)

  await assertBoardRendered(page, "DEAD_PIPELINE (bookmarked URL)", seeded.defaultPipelineName)
  await assertTextNotRendered(page, en.deals.pipelineNotFound, "DEAD_PIPELINE (bookmarked URL)")
  await expect(
    degradedNotice(page),
    "the bookmarked dead-pipeline URL rendered the default board with NO notice. The board the " +
      "user is looking at is not the one they asked for and nothing says so — this is " +
      "`deals/page.tsx`'s pipelineWasDropped merge, and the picker path cannot reach it."
  ).toBeVisible()
  await assertNoAlert(page, "DEAD_PIPELINE (bookmarked URL)")

  console.log(
    `[40-16 degraded] DEAD_PIPELINE | 200 via picker AND via ${bookmarked} | ` +
      `board "${seeded.defaultPipelineName}" | notice on both | pipelineNotFound never rendered`
  )
})

test("DEAD_STAGE — a real stage on the wrong board is dropped, the board survives, the notice shows", async ({
  page,
}) => {
  await gotoSettled(page, "/deals?view=none", en.deals.title)

  const url = await selectViewFromPicker(page, "deadStage")
  const status = await gotoSettled(page, url, en.deals.title)
  expect(status, `DEAD_STAGE: ${url} did not return 200`).toBe(200)

  const landed = new URL(url)
  expect(
    landed.searchParams.get("stage"),
    "a stage belonging to another pipeline must be dropped — keeping it would render an " +
      "unexplained empty board, which is worse than a wider one"
  ).toBeNull()
  expect(
    landed.searchParams.get("pipeline"),
    "the pipeline survives, so the board the view named is the board that renders"
  ).toBe(seeded.livePipelineId)

  await assertBoardRendered(page, "DEAD_STAGE", seeded.livePipelineName)
  await expect(degradedNotice(page), "DEAD_STAGE: no `views.degraded` notice").toBeVisible()
  await assertNoAlert(page, "DEAD_STAGE")
  await assertTextNotRendered(page, en.deals.pipelineNotFound, "DEAD_STAGE")

  console.log(
    `[40-16 degraded] DEAD_STAGE | 200 at ${url} | board "${seeded.livePipelineName}" | ` +
      `notice shown | no Alert`
  )
})

/* ============================================================================================
 * The companion. Without it every assertion above is satisfied by a notice that never turns off.
 * ========================================================================================== */

test("ANTI-VACUITY — a fully VALID view prints NO notice, on both surfaces", async ({ page }) => {
  await gotoSettled(page, "/activities?view=none", en.activities.title)
  const activityUrl = await selectViewFromPicker(page, "validActivity")
  await gotoSettled(page, activityUrl, en.activities.title)

  /*
   * THE SUBJECT IS ASSERTED FIRST, AND THE ORDER IS DELIBERATE.
   *
   * The claim under test is "no notice over a healthy view". The surviving-param checks below are
   * SUPPORTING FACTS — they explain why there should be no notice. Put them first and the
   * `E2E_VIEWS_PROBE=break-valid` probe is caught by a precondition instead of by the assertion it
   * is aimed at, and the thing the probe was supposed to establish goes unestablished. A negative
   * probe has to be able to reach the line it is probing.
   */
  await expect(
    degradedNotice(page),
    "/activities: `views.degraded` is showing over a view whose every stored key still resolves. " +
      "A notice that never turns off is a permanent false alarm, and it would make all three " +
      "degradation assertions above pass for free."
  ).toHaveCount(0)

  expect(
    new URL(activityUrl).searchParams.get("owner"),
    "the valid view's owner filter must SURVIVE — if it were dropped this companion would be " +
      "testing the same degraded path as everything above"
  ).toBe(seeded.activeUserId)

  await assertActivityListRendered(page, "VALID_ACTIVITY")
  await assertNoAlert(page, "VALID_ACTIVITY")

  await gotoSettled(page, "/deals?view=none", en.deals.title)
  const dealUrl = await selectViewFromPicker(page, "validDeal")
  await gotoSettled(page, dealUrl, en.deals.title)

  const dealParams = new URL(dealUrl).searchParams
  expect(dealParams.get("pipeline"), "the valid deal view's pipeline must survive").toBe(
    seeded.livePipelineId
  )
  expect(dealParams.get("stage"), "a stage belonging to its OWN pipeline must survive").toBe(
    seeded.livePipelineStageId
  )

  await assertBoardRendered(page, "VALID_DEAL", seeded.livePipelineName)
  await expect(
    degradedNotice(page),
    "/deals: `views.degraded` is showing over a fully valid view"
  ).toHaveCount(0)
  await assertNoAlert(page, "VALID_DEAL")

  console.log(
    `[40-16 degraded] ANTI-VACUITY | valid views on /activities and /deals: notice count 0, ` +
      `every stored key survived`
  )
})
