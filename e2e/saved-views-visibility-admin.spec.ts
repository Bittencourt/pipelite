/**
 * V-40-8 — CRITERION 2, THE DIRECTION THAT DEPARTS. A member's PRIVATE view is invisible to an
 * ADMIN, on both surfaces.
 *
 * ---------------------------------------------------------------------------------------------
 * THIS IS THE HALF THAT BREAKS THE APP'S OWN IDIOM, AND IT IS THEREFORE THE HALF THAT MUST BE
 * ASSERTED.
 *
 * Everywhere else in this codebase, authorization reads `owner || role === "admin"` —
 * `src/app/deals/actions.ts:83`, and 37-CONTEXT.md:31 locks it for Trash. A reader who has seen
 * that idiom ten times will add it here on reflex, and the change would look like a consistency fix.
 * Decision 3 breaks it deliberately: PRIVATE THAT AN ADMIN CAN READ IS NOT PRIVATE. `queries.ts`
 * carries the counter-pressure in its own header and parameterises `visibleViewsPredicate` on the
 * viewer's id ALONE so there is nowhere to thread a role in without changing the signature.
 *
 * A signature is not a proof. If `listVisibleViews` ever grows an admin branch, THIS FILE is what
 * goes red, and the failure message below says so in as many words.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A SECOND FILE RATHER THAN A SECOND `test.describe`.
 *
 * The two directions need two SESSIONS, and a Playwright session is a project-level
 * `storageState`. `saved-views-visibility-member.spec.ts` is matched by `chromium-member`'s
 * `testMatch: /.*-member\.spec\.ts/`; this filename is not, so it runs under the default `chromium`
 * project's ADMIN state. It is deliberately NOT appended to `e2e/saved-views-320.spec.ts` — that
 * file belongs to plan 40-15 and this phase keeps one owner per file.
 *
 * The fixture triad is shared with the member spec through `e2e/views-fixtures.ts` and NOT by
 * importing one spec from the other: a Playwright spec that imports another spec registers that
 * file's tests into itself, which would run the member spec's assertions under THIS project's admin
 * storageState. See the long note above `VISIBILITY_FIXTURE_NAMES`.
 *
 * ---------------------------------------------------------------------------------------------
 * ANTI-VACUITY, same shape as the member direction and for the same reason: `listVisibleViews`
 * catches its own errors and returns `[]`, so an empty picker satisfies "the member's private view
 * is absent" while proving nothing. `ADMIN_PRIVATE` and `ADMIN_SHARED` must both be visible in the
 * SAME open container as the absent `MEMBER_PRIVATE`. `E2E_VIEWS_PROBE=share-private` flips
 * `MEMBER_PRIVATE` to shared and must turn this file red.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"

import en from "../src/messages/en-US.json"
import { E2E_ADMIN_EMAIL } from "./seed-admin"
import { E2E_MEMBER_EMAIL } from "./seed-member"
import {
  VISIBILITY_FIXTURE_NAMES,
  openDb,
  purgeViewFixtures,
  seedVisibilityFixtures,
  visibilityProbeIsActive,
  type VisibilityFixtureIds,
} from "./views-fixtures"

const M = en.views

let ids: VisibilityFixtureIds

test.describe.configure({ mode: "serial", timeout: 120_000 })

test.beforeAll(async () => {
  const sql = openDb()
  try {
    const reclaimed = await purgeViewFixtures(sql)
    console.log(
      `[40-16 admin] beforeAll purge reclaimed ${reclaimed.views} views / ` +
        `${reclaimed.defaults} defaults`
    )

    ids = await seedVisibilityFixtures(sql, {
      adminEmail: E2E_ADMIN_EMAIL,
      memberEmail: E2E_MEMBER_EMAIL,
      shareThePrivateOnes: visibilityProbeIsActive(),
    })

    console.log(
      `[40-16 admin] seeded ADMIN_PRIVATE=${ids.adminPrivateId} ` +
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
    const purged = await purgeViewFixtures(sql)
    const remaining = await sql<{ count: string }[]>`
      select count(*)::text as count from saved_views where name like '[e2e] View%'
    `
    console.log(
      `[40-16 admin] afterAll purge removed ${purged.views} views / ${purged.defaults} defaults; ` +
        `${remaining[0].count} prefixed rows remain`
    )
    expect(Number(remaining[0].count), "every fixture view must be reclaimed").toBe(0)
  } finally {
    await sql.end()
  }
})

/**
 * THE MIRROR OF THE MEMBER SPEC'S SESSION CHECK, and it is not decoration here either.
 *
 * There the proof of identity is being REFUSED at `/admin/audit`; here it is being ADMITTED. If this
 * file ever ran under the member storageState — a project `testMatch` edit away — "the member's
 * private view is absent" would be asserted by a session that also cannot see it for the ordinary
 * reason, and the departure from `owner || role === "admin"` would go unmeasured.
 *
 * In `beforeEach` rather than `beforeAll` because `beforeAll` gets a `browser` and not a `page`, and
 * a context minted from that browser does not inherit the project's `storageState`.
 */
test.beforeEach(async ({ page }) => {
  await page.goto("/admin/audit")
  expect(
    new URL(page.url()).pathname,
    "the session under test was REFUSED at /admin/audit — it is not an admin, so the departing " +
      "direction of criterion 2 would go unmeasured. Check the chromium project's storageState."
  ).toBe("/admin/audit")
  await expect(
    page.getByRole("heading", { level: 1, name: en.audit.retention.title }),
    "/admin/audit rendered no heading — the page failed rather than the session being an admin"
  ).toBeVisible()
})

async function gotoSettled(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await expect(page.getByRole("heading", { level: 1, name: en.organizations.title })).toBeVisible()
}

/** Open the picker. Only the OPEN is retried — see the member spec's copy for the #418 rationale. */
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

/** Absence plus two presences, all read out of the same container in the same open state. */
async function assertTriadVisibility(container: Locator, surfaceLabel: string): Promise<void> {
  await expect(
    container.getByText(VISIBILITY_FIXTURE_NAMES.adminPrivate, { exact: true }),
    `${surfaceLabel}: ANTI-VACUITY COMPANION — the admin's OWN private view must be visible here.`
  ).toBeVisible()

  await expect(
    container.getByText(VISIBILITY_FIXTURE_NAMES.adminShared, { exact: true }),
    `${surfaceLabel}: ANTI-VACUITY COMPANION — the admin's own shared view must be visible here.`
  ).toBeVisible()

  await expect(
    container.getByText(VISIBILITY_FIXTURE_NAMES.memberPrivate, { exact: true }),
    `${surfaceLabel}: A MEMBER'S PRIVATE VIEW IS VISIBLE TO AN ADMIN. ` +
      `listVisibleViews() has grown an admin branch. This app's idiom is ` +
      `\`owner || role === "admin"\` (src/app/deals/actions.ts:83, locked for Trash in ` +
      `37-CONTEXT.md:31) and Decision 3 DELIBERATELY BREAKS IT HERE, because "private" that an ` +
      `admin can read is not private. Two admin-owned fixture views are visible in this same ` +
      `container, so this is a real disclosure and not an empty surface.`
  ).toHaveCount(0)

  console.log(
    `[40-16 admin] ${surfaceLabel} | ADMIN_PRIVATE visible, ADMIN_SHARED visible, ` +
      `MEMBER_PRIVATE absent`
  )
}

test("the session under test IS an admin — the mirror of the member spec's refusal check", async ({
  page,
}) => {
  await gotoSettled(page, "/organizations?view=none")

  const sql = openDb()
  try {
    const rows = await sql<{ email: string; role: string }[]>`
      select email, role from users where email = ${E2E_ADMIN_EMAIL} and deleted_at is null
    `
    expect(rows.length, `${E2E_ADMIN_EMAIL} must exist — run the setup project`).toBe(1)
    expect(rows[0].role, "the e2e admin's role must be `admin`").toBe("admin")

    /*
     * AND THE OTHER ACCOUNT IS NOT AN ADMIN. Without this, "a member's private view" could be a
     * second admin's private view, and the departing direction would be proved against the wrong
     * kind of owner.
     */
    const memberRows = await sql<{ role: string }[]>`
      select role from users where email = ${E2E_MEMBER_EMAIL} and deleted_at is null
    `
    expect(memberRows.length, `${E2E_MEMBER_EMAIL} must exist`).toBe(1)
    expect(
      memberRows[0].role,
      "MEMBER_PRIVATE's owner must be a `member` — otherwise this file proves nothing about the " +
        "admin/member asymmetry"
    ).toBe("member")
  } finally {
    await sql.end()
  }

  console.log(
    `[40-16 admin] session confirmed: ${E2E_ADMIN_EMAIL} role=admin, /admin/audit renders; ` +
      `${E2E_MEMBER_EMAIL} role=member`
  )
})

test("the PICKER hides a member's private view from an ADMIN — the departure from `owner || role === admin`", async ({
  page,
}) => {
  await gotoSettled(page, "/organizations?view=none")

  const menu = await openPicker(page)

  /*
   * `views.groupMine` renders only when `ownViews.length > 0`. Both admin fixtures are the admin's
   * own, so this label is a third independent witness that the list is populated. `views.groupShared`
   * is deliberately NOT asserted: it renders only when a view the admin does NOT own is visible, and
   * the only such fixture is `MEMBER_PRIVATE` — which must be absent. Asserting its label here would
   * be asserting the bug.
   */
  await expect(menu.getByText(M.groupMine, { exact: true })).toBeVisible()

  await assertTriadVisibility(menu, "PICKER")

  await page.keyboard.press("Escape")
})

test("the MANAGE DIALOG hides it from the admin too — both disclosure surfaces, not just the picker", async ({
  page,
}) => {
  await gotoSettled(page, "/organizations?view=none")

  const dialog = await openManageDialog(page)

  await assertTriadVisibility(dialog, "MANAGE DIALOG")

  /*
   * THE ADMIN BRANCH THAT DOES EXIST, asserted here so the absence above cannot be misread as
   * "admins have no powers over views". `listVisibleViews` computes
   * `canEdit: isOwnedByViewer || isAdmin` — an admin MAY edit any view they can SEE. Visibility and
   * mutation are separate questions and only visibility departs from the idiom. The admin's own
   * rows therefore carry a share switch and a delete button.
   */
  await expect(
    page.locator(`#manage-view-shared-${ids.adminPrivateId}`),
    "the admin owns this view and must be able to share it"
  ).toBeVisible()
  await expect(
    page.locator(`#manage-view-shared-${ids.memberPrivateId}`),
    "a control keyed on the member's private view id must not exist on the admin's screen at all"
  ).toHaveCount(0)

  console.log(
    "[40-16 admin] MANAGE ROWS | the admin's own rows are editable; no control exists for " +
      "MEMBER_PRIVATE's id"
  )

  await page.keyboard.press("Escape")
})
