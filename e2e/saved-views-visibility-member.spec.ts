/**
 * V-40-8 — CRITERION 2, THE MEMBER DIRECTION. An admin's PRIVATE view is invisible to a member, on
 * BOTH surfaces that can disclose it, and the shared view beside it is not.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS WHEN `queries.db.test.ts` ALREADY PROVES THE PREDICATE.
 *
 * Plan 40-05 proved `ownerId = viewer OR isShared` against real SQL, in both directions, at the unit
 * level. That is a proof about a `WHERE` clause. Criterion 2 is a claim about WHAT A DIFFERENT HUMAN
 * SEES ON A SCREEN, and no source gate and no unit test can establish it: plan 39-14's gates were
 * green while the organization duplicate warning could not fire from any surface in the product, and
 * it took a human driving a browser to find that out. Between the predicate and the screen sit a
 * server component, an RSC payload, a `"use client"` boundary, a grouping filter in the bar and a
 * second list in the manage dialog — five places a private view could reappear.
 *
 * ---------------------------------------------------------------------------------------------
 * THE FILENAME IS LOAD-BEARING. `playwright.config.ts` gives the `chromium-member` project
 * `testMatch: /.*-member\.spec\.ts/`. A file named anything else runs under the DEFAULT project's
 * ADMIN storageState, where "the admin's private view is absent" would be asserted by the admin who
 * owns it — a green run proving the exact opposite of the claim. Do not rename this file.
 *
 * ---------------------------------------------------------------------------------------------
 * THE VACUITY TRAP FOR A VISIBILITY TEST, WHICH IS SPECIFIC AND SEVERE.
 *
 * `expect(locator).toHaveCount(0)` passes when:
 *   - the session is logged out and the page is `/login`
 *   - the fixture was never inserted
 *   - the page 500'd, or rendered before hydration
 *   - the picker never opened
 *   - `listVisibleViews` threw and returned `[]` (it catches and returns the empty array — see its
 *     `catch` block, which is the most reachable of all of these)
 *
 * ALL FIVE ARE REFUSED HERE, and none of the refusals is optional:
 *   1. `beforeEach` asserts the session is authenticated AND is refused at `/admin/audit` with the
 *      discriminating `/?error=unauthorized` target — not merely "the pathname changed", which a
 *      logged-out redirect to `/login` would also satisfy.
 *   2. every absence assertion has a POSITIVE COMPANION IN THE SAME OPEN MENU: `ADMIN_SHARED` and
 *      `MEMBER_PRIVATE` must both be visible in the very menu that lacks `ADMIN_PRIVATE`. An empty
 *      picker fails the companion before the absence can pass.
 *   3. the locale-dependent `h1` is the anchor before anything is opened.
 *   4. `E2E_VIEWS_PROBE=share-private` re-runs this file with the private fixtures flipped to
 *      shared; every absence assertion must then go RED. Run it, do not reason about it.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"

import en from "../src/messages/en-US.json"
import { E2E_ADMIN_EMAIL } from "./seed-admin"
import { E2E_MEMBER_EMAIL } from "./seed-member"
import {
  VISIBILITY_FIXTURE_FILTERS,
  VISIBILITY_FIXTURE_NAMES,
  openDb,
  purgeViewFixtures,
  seedVisibilityFixtures,
  visibilityProbeIsActive,
  type VisibilityFixtureIds,
} from "./views-fixtures"

/**
 * en-US only, and that is a scope decision rather than an oversight. 40-15 already measured all
 * three locales for every overlay this phase adds; what is under test here is a SQL predicate's
 * reach into two UI surfaces, and a predicate has no locale. Running three locales would triple the
 * fixture churn in a database holding 46,054 real organizations for zero additional information.
 */
const M = en.views

let ids: VisibilityFixtureIds

test.describe.configure({ mode: "serial", timeout: 120_000 })

test.beforeAll(async () => {
  const sql = openDb()
  try {
    // BEFORE inserting (the 45-08 rule), so a run crashed mid-test is reclaimed rather than
    // compounded — and so a stale `saved_view_defaults` row cannot redirect this file's first
    // bare-URL navigation into somebody else's view.
    const reclaimed = await purgeViewFixtures(sql)
    console.log(
      `[40-16 member] beforeAll purge reclaimed ${reclaimed.views} views / ` +
        `${reclaimed.defaults} defaults`
    )

    ids = await seedVisibilityFixtures(sql, {
      adminEmail: E2E_ADMIN_EMAIL,
      memberEmail: E2E_MEMBER_EMAIL,
      shareThePrivateOnes: visibilityProbeIsActive(),
    })

    console.log(
      `[40-16 member] seeded ADMIN_PRIVATE=${ids.adminPrivateId} ` +
        `ADMIN_SHARED=${ids.adminSharedId} MEMBER_PRIVATE=${ids.memberPrivateId}` +
        (visibilityProbeIsActive() ? " | PROBE ACTIVE: both private fixtures are SHARED" : "")
    )
  } finally {
    await sql.end()
  }
})

test.afterAll(async () => {
  const sql = openDb()
  try {
    // MUTATIONS FIRST, ASSERTIONS AFTER (39-19): a leak assertion placed before the restore aborts
    // teardown on failure and strands the very row it is complaining about.
    const purged = await purgeViewFixtures(sql)
    const remaining = await sql<{ count: string }[]>`
      select count(*)::text as count from saved_views where name like '[e2e] View%'
    `
    console.log(
      `[40-16 member] afterAll purge removed ${purged.views} views / ${purged.defaults} defaults; ` +
        `${remaining[0].count} prefixed rows remain`
    )
    expect(Number(remaining[0].count), "every fixture view must be reclaimed").toBe(0)
  } finally {
    await sql.end()
  }
})

/**
 * THE SESSION ASSERTION, IN `beforeEach` RATHER THAN `beforeAll`, AND DELIBERATELY SO.
 *
 * The plan asked for `beforeAll`. `beforeAll` cannot have it: Playwright hands `beforeAll` a
 * `browser`, not a `page`, and a context minted from that browser does NOT inherit the project's
 * `storageState` — so the check would run anonymously and would prove nothing about the session the
 * tests actually use. `beforeEach` receives the real, project-configured `page`, which is the only
 * session whose identity matters. It is also strictly stronger: EVERY test in this file has its
 * session verified rather than one test's worth at file start.
 *
 * TWO HALVES, IN THIS ORDER, copied in shape from `member.setup.ts` because the ordering is the
 * substance. Half one removes the logged-out reading of half two; without it a failed session would
 * bounce off `/admin/audit` to `/login` and the negative check would go green while proving nothing.
 */
test.beforeEach(async ({ page }) => {
  // HALF ONE — the session is REAL.
  await page.goto("/organizations?view=none")
  await expect(
    page.getByRole("heading", { level: 1, name: en.organizations.title }),
    "the member session cannot render /organizations — the storageState is stale or the login failed"
  ).toBeVisible()
  expect(new URL(page.url()).pathname).toBe("/organizations")

  // HALF TWO — the session is NOT AN ADMIN, and is refused for the right reason.
  await page.goto("/admin/audit")
  const refusedAt = new URL(page.url())
  expect(
    refusedAt.pathname,
    "the session under test reached /admin/audit — it is an ADMIN, so every absence assertion in " +
      "this file would pass for the wrong reason. Check the chromium-member project's storageState."
  ).not.toBe("/admin/audit")
  expect(
    refusedAt.pathname + "?error=" + refusedAt.searchParams.get("error"),
    "expected src/app/admin/layout.tsx's SIGNED-IN non-admin redirect, not the logged-out one"
  ).toBe("/?error=unauthorized")
})

/** Navigate and settle on the locale-dependent `h1` — the anchor, before anything is opened. */
async function gotoSettled(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await expect(page.getByRole("heading", { level: 1, name: en.organizations.title })).toBeVisible()
}

/**
 * Open the picker and return its menu.
 *
 * The open is retried and NOTHING ELSE IS. BACKLOG records a hydration mismatch (minified React
 * error #418) on `/organizations` that can swallow a click; 40-15 measured it swallowing two across
 * five runs. A swallowed open would leave `page.getByRole("menu")` empty and every absence
 * assertion in this file would pass against a menu that never rendered — the exact vacuity this file
 * is written to refuse. The early return keeps the retry safe on a toggle.
 */
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

/** Open the manage dialog THROUGH the picker, the way a user reaches it. */
async function openManageDialog(page: Page): Promise<Locator> {
  const menu = await openPicker(page)
  const dialog = page.getByRole("dialog")

  await expect(async () => {
    if (await dialog.isVisible()) return
    await menu.getByRole("menuitem", { name: M.manageAction }).click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000, intervals: [250, 500, 1_000] })

  await expect(dialog.getByText(M.manage.title, { exact: true })).toBeVisible()
  return dialog
}

/**
 * A manage-dialog ROW, located from the one thing that identifies it: the view's name.
 *
 * `../..` walks name `<p>` → the `min-w-0 space-y-1` name cluster → the row `<div>`. Located by name
 * rather than by a class selector because the row carries no test id and a class list is the first
 * thing a restyle changes.
 */
function manageRow(dialog: Locator, name: string): Locator {
  return dialog.getByText(name, { exact: true }).locator("xpath=../..")
}

/**
 * THE THREE-WAY ASSERTION, WRITTEN ONCE BECAUSE IT MUST NOT DRIFT BETWEEN THE TWO SURFACES.
 *
 * Absence plus TWO presences, all read out of the SAME container in the same open state. That
 * pairing is the whole anti-vacuity argument: `listVisibleViews` catches its own errors and returns
 * `[]`, so a total database failure produces an empty picker in which `ADMIN_PRIVATE` is absent —
 * and would be reported as a privacy proof. The two companions fail first when that happens.
 */
async function assertTriadVisibility(container: Locator, surfaceLabel: string): Promise<void> {
  const present = container.getByText(VISIBILITY_FIXTURE_NAMES.adminShared, { exact: true })
  const alsoPresent = container.getByText(VISIBILITY_FIXTURE_NAMES.memberPrivate, { exact: true })
  const absent = container.getByText(VISIBILITY_FIXTURE_NAMES.adminPrivate, { exact: true })

  await expect(
    present,
    `${surfaceLabel}: ANTI-VACUITY COMPANION — the admin's SHARED view must be visible to the ` +
      `member here. If it is not, this surface is empty and the absence assertion below proves ` +
      `nothing (listVisibleViews catches its own errors and returns []).`
  ).toBeVisible()

  await expect(
    alsoPresent,
    `${surfaceLabel}: ANTI-VACUITY COMPANION — the member's OWN private view must be visible to ` +
      `the member here.`
  ).toBeVisible()

  await expect(
    absent,
    `${surfaceLabel}: THE ADMIN'S PRIVATE VIEW IS DISCLOSED TO A MEMBER. Criterion 2 is broken — ` +
      `visibleViewsPredicate() is "ownerId = viewer OR isShared" and this row satisfies neither. ` +
      `Two other fixture views are visible in this same container, so this is a real absence ` +
      `failure and not an empty surface.`
  ).toHaveCount(0)

  console.log(
    `[40-16 member] ${surfaceLabel} | ADMIN_SHARED visible, MEMBER_PRIVATE visible, ` +
      `ADMIN_PRIVATE absent`
  )
}

test("the session under test is the seeded MEMBER and is refused at /admin/audit for being one", async ({
  page,
}) => {
  /*
   * `beforeEach` has already made both halves of this assertion — this test exists so the PROOF has
   * a line of its own in the report rather than being an invisible precondition of the others. It
   * adds the one fact `beforeEach` does not: the account is the seeded fixture account and not some
   * other non-admin who happens to be logged in.
   */
  await gotoSettled(page, "/organizations?view=none")

  const sql = openDb()
  try {
    const rows = await sql<{ email: string; role: string }[]>`
      select email, role from users where email = ${E2E_MEMBER_EMAIL} and deleted_at is null
    `
    expect(rows.length, `${E2E_MEMBER_EMAIL} must exist — run the setup project`).toBe(1)
    expect(rows[0].role, "the e2e member's role must be `member`, not `admin`").toBe("member")
  } finally {
    await sql.end()
  }

  console.log(`[40-16 member] session confirmed: ${E2E_MEMBER_EMAIL}, role=member, refused at /admin`)
})

test("the PICKER hides the admin's private view from a member — with both companions present in the same open menu", async ({
  page,
}) => {
  await gotoSettled(page, "/organizations?view=none")

  const menu = await openPicker(page)

  /*
   * The GROUP LABELS are asserted too, and not as decoration. `views.groupShared` renders only when
   * `sharedViews.length > 0` and `views.groupMine` only when `ownViews.length > 0`, so their
   * presence is a second, independent witness that the member's list is non-empty in BOTH
   * partitions — which is what makes "the private one is missing" a statement about that one view
   * rather than about the partition it would have landed in.
   */
  await expect(menu.getByText(M.groupShared, { exact: true })).toBeVisible()
  await expect(menu.getByText(M.groupMine, { exact: true })).toBeVisible()

  await assertTriadVisibility(menu, "PICKER")

  await page.keyboard.press("Escape")
})

test("the MANAGE DIALOG hides it too — a view absent from the picker but listed in Manage is still disclosed", async ({
  page,
}) => {
  await gotoSettled(page, "/organizations?view=none")

  const dialog = await openManageDialog(page)

  await assertTriadVisibility(dialog, "MANAGE DIALOG")

  /*
   * T-40-78 — THE READ-ONLY ROW, and its positive control.
   *
   * G-7: a viewer may make somebody else's SHARED view their own default, and may not edit it. The
   * asymmetry is the feature, so both halves are asserted on the same open dialog:
   *
   *   ADMIN_SHARED   (not the member's)  -> readOnly sentence, NO share switch, NO delete, but the
   *                                        default switch IS present
   *   MEMBER_PRIVATE (the member's own)  -> share switch AND delete present, no readOnly sentence
   *
   * The second row is what stops the first from being a claim about a broken dialog. This is the
   * reachability half only; `setViewShared`/`deleteView` refusing the mutation server-side is plan
   * 40-06's control half and is tested there.
   */
  const sharedRow = manageRow(dialog, VISIBILITY_FIXTURE_NAMES.adminShared)
  const ownRow = manageRow(dialog, VISIBILITY_FIXTURE_NAMES.memberPrivate)

  await expect(
    sharedRow.getByText(
      M.manage.readOnly.replace("{owner}", "Pipelite E2E Admin"),
      { exact: true }
    ),
    "the read-only row must SAY why its controls are missing — a missing control with no " +
      "explanation is how a user concludes the feature is broken"
  ).toBeVisible()

  await expect(
    page.locator(`#manage-view-shared-${ids.adminSharedId}`),
    "the member must not get a share switch on a view they do not own"
  ).toHaveCount(0)
  await expect(
    sharedRow.getByRole("button", { name: M.manage.delete }),
    "the member must not get a delete button on a view they do not own"
  ).toHaveCount(0)
  await expect(
    page.locator(`#manage-view-default-${ids.adminSharedId}`),
    "G-7: the DEFAULT switch is per-user and must stay live on a row the viewer cannot edit — " +
      "without it, sharing has no payoff and this row would be read-only in the wrong sense"
  ).toBeVisible()

  // The positive control for all three assertions above.
  await expect(
    page.locator(`#manage-view-shared-${ids.memberPrivateId}`),
    "ANTI-VACUITY: the member's OWN row must carry a share switch, or the three absences above " +
      "only prove the dialog renders no switches at all"
  ).toBeVisible()
  await expect(
    ownRow.getByRole("button", { name: M.manage.delete }),
    "ANTI-VACUITY: the member's OWN row must carry a delete button"
  ).toBeVisible()
  await expect(
    ownRow.getByText(M.manage.readOnly.replace("{owner}", "Pipelite E2E Admin"), { exact: true })
  ).toHaveCount(0)

  console.log(
    "[40-16 member] MANAGE ROWS | ADMIN_SHARED: readOnly, no share switch, no delete, default " +
      "switch live | MEMBER_PRIVATE: share switch + delete present"
  )

  await page.keyboard.press("Escape")
})

test("G-7 + criterion 3 across an ownership boundary — the member defaults to the admin's shared view and lands on it", async ({
  page,
}) => {
  await gotoSettled(page, "/organizations?view=none")

  const dialog = await openManageDialog(page)
  const defaultSwitch = page.locator(`#manage-view-default-${ids.adminSharedId}`)

  await expect(defaultSwitch).toHaveAttribute("data-state", "unchecked")
  await defaultSwitch.click()

  /*
   * The toast, not the optimistic switch state: `setDefaultOverride` flips the switch BEFORE the
   * server action is awaited, so asserting on the switch alone would pass against a refused write.
   * `views.manage.saved` is emitted only inside `if (result.success)`.
   */
  await expect(
    page.getByText(M.manage.saved, { exact: true }),
    "the default write was refused — setViewDefault authorizes on VISIBILITY, and a member CAN " +
      "see this shared view, so a refusal here means the action grew an ownership check"
  ).toBeVisible({ timeout: 15_000 })

  /*
   * ESCAPE IS SWALLOWED WHILE THE WRITE IS IN FLIGHT, AND THAT IS THE DESIGN — measured here, not
   * assumed. `ManageViewsDialog`'s `onOpenChange` opens with `if (isWriting) return`, so the dialog
   * refuses to close until the `useTransition` around `setViewDefault` has settled. A single
   * `keyboard.press("Escape")` immediately after the toast therefore does nothing, and the first
   * version of this test failed on exactly that (`getByRole('dialog')` resolved to 1 element,
   * 14 polls). Waiting for the switch to become enabled again is the direct read of `isWriting`
   * falling back to false; the retry after it covers the frame in between.
   */
  await expect(
    defaultSwitch,
    "the write never settled — `isWriting` is still true and the dialog is correctly refusing to close"
  ).toBeEnabled({ timeout: 20_000 })
  await expect(async () => {
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0, { timeout: 1_000 })
  }).toPass({ timeout: 20_000, intervals: [250, 500, 1_000] })

  /*
   * THE BARE URL. `organizations/page.tsx` fires `resolveDefaultViewRedirect` only when
   * `Object.keys(params).length === 0`, so this navigation carries no params at all — `?view=none`
   * here would deliberately NOT redirect.
   */
  await page.goto("/organizations")
  await expect(page.getByRole("heading", { level: 1, name: en.organizations.title })).toBeVisible()

  /*
   * PARSED, NEVER COMPARED AS A STRING. Plan 40-18 made `resolveDefaultViewRedirect` name its view,
   * so the landing URL now carries `view=<id>` alongside the filters and the param ORDER is
   * `redirectTargetFor`'s business, not this test's. A `toBe("?search=adminshared")` would be red
   * today for a reason that has nothing to do with the property under test.
   */
  const landed = new URL(page.url())
  expect(landed.pathname).toBe("/organizations")
  expect(
    landed.searchParams.get("search"),
    "the default landing must carry the view's stored FILTERS"
  ).toBe(VISIBILITY_FIXTURE_FILTERS.adminShared.search)
  expect(
    landed.searchParams.get("view"),
    "the default landing must NAME the view. Without the id the landing is an unselected URL and " +
      "the user's first filter tweak has no selection to preserve — the unreachable `isModified` " +
      "plan 40-05 measured. This is the half a filters-only assertion would miss."
  ).toBe(ids.adminSharedId)

  /*
   * And the half that `view=<id>` actually BUYS, read off the screen rather than off the URL: the
   * picker resolves the selection and names it. A landing that carried only the filters would show
   * `views.allRecords` here, and the user would have no way to tell they are inside a saved view.
   */
  const trigger = page.getByRole("button", { name: M.picker.label })
  await expect(trigger).toContainText(VISIBILITY_FIXTURE_NAMES.adminShared)
  await expect(trigger).not.toContainText(M.allRecords)

  console.log(
    `[40-16 member] G-7 | landed on ${page.url()} with the picker reading ` +
      `"${VISIBILITY_FIXTURE_NAMES.adminShared}" — a member's default is a colleague's shared view`
  )
})
