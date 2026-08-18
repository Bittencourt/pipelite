/**
 * SC-2 — the theme choice survives a reload, and "system" is a real third state.
 *
 * There is no cookie, no server round-trip and no user-settings column behind any of this:
 * `next-themes` writes its choice to `localStorage` under the key `theme` and re-applies the class
 * from a pre-hydration inline script. That storage key IS the persistence mechanism SC-2 names, so
 * the spec reads it directly rather than inferring persistence from the rendered colour alone.
 *
 * The three-way toggle is not a style preference either. `defaultTheme="system"` makes OS-following
 * the initial state, so a light/dark pair would strand a user outside it permanently once they
 * touched the control. `page.emulateMedia({ colorScheme })` is what makes that third state
 * observable: with it, "system" can be shown to TRACK the OS rather than being an alias for light.
 *
 * No login here — the session comes from the setup project's storageState. No viewport is declared
 * or changed; the chromium project supplies 320x640.
 */

import { expect, test, type Page } from "@playwright/test"

import en from "../src/messages/en-US.json"
import { E2E_ADMIN_EMAIL } from "./seed-admin"

/**
 * `UserMenu` renders its trigger as an avatar whose only text is the first two characters of the
 * local part of the signed-in address, uppercased. Deriving it from `E2E_ADMIN_EMAIL` rather than
 * hardcoding "PI" keeps the locator correct if the seeded address ever changes.
 */
const AVATAR_INITIALS = E2E_ADMIN_EMAIL.split("@")[0].slice(0, 2).toUpperCase()

/** next-themes' default storage key. Not configured anywhere in this app, so this is the default. */
const THEME_STORAGE_KEY = "theme"

/** `attribute="class"` means the resolved theme name lands as a class on <html>. */
const DARK_CLASS = /(^|\s)dark(\s|$)/

function html(page: Page) {
  return page.locator("html")
}

function storedTheme(page: Page) {
  return page.evaluate((key) => window.localStorage.getItem(key), THEME_STORAGE_KEY)
}

/**
 * Open the avatar menu and prove the three theme rows are really there before anything is clicked.
 *
 * ANTI-VACUITY, and it is load-bearing: a CLOSED Radix dropdown portal renders nothing at all — the
 * radio rows do not exist in the DOM until the menu opens. Without this check a spec whose trigger
 * click silently missed would fail later, obscurely, on a locator that was never going to resolve,
 * and a spec that only asserted the <html> class could pass while clicking nothing.
 */
async function openThemeMenu(page: Page) {
  /**
   * Located by shadcn's own `data-slot` and scoped to the header, NOT by role — and that is a
   * measured requirement rather than a preference. Opening a Radix dropdown is modal: it marks the
   * rest of the application `aria-hidden`, and Playwright's role engine ignores `aria-hidden`
   * subtrees, so a role locator that resolves perfectly well BEFORE the click stops resolving
   * immediately after it and every later read of the trigger hangs until the test times out.
   */
  const trigger = page.locator('header [data-slot="dropdown-menu-trigger"]')

  // Proves it is the signed-in user's avatar menu and not some other dropdown that drifted into
  // the header, without depending on the role engine.
  await expect(trigger).toHaveText(AVATAR_INITIALS)

  /**
   * Clicked in a retry loop rather than once, because `UserMenu` is a client component and a click
   * that lands before React attaches its handlers does nothing at all — Playwright's actionability
   * checks cannot see hydration. Measured: a click issued immediately after `goto` left the menu
   * closed and the theme rows absent, while the same click two seconds later opened it. Retrying
   * on `aria-expanded` makes the spec insensitive to how slow the page happens to hydrate.
   */
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if ((await trigger.getAttribute("aria-expanded")) === "true") break
    await trigger.click()
    await page.waitForTimeout(300)
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true")

  await expect(page.getByRole("menuitemradio", { name: en.theme.light })).toBeVisible()
  await expect(page.getByRole("menuitemradio", { name: en.theme.dark })).toBeVisible()
  await expect(page.getByRole("menuitemradio", { name: en.theme.system })).toBeVisible()
}

/**
 * Every label is read from the catalog rather than written out in English, so a copy change in
 * `src/messages` cannot leave a stale expectation behind. The chromium project sets no `locale`
 * cookie, so en-US is what renders.
 */
async function openBoardPage(page: Page) {
  await page.goto("/organizations")
  await expect(
    page.getByRole("heading", { level: 1, name: en.organizations.title })
  ).toBeVisible()
}

test("a dark theme choice survives a reload", async ({ page }) => {
  // Pin the emulated OS to light, so "the page is dark" can only be the explicit choice below and
  // never the machine running the suite.
  await page.emulateMedia({ colorScheme: "light" })
  await openBoardPage(page)
  await expect(html(page)).not.toHaveClass(DARK_CLASS)

  await openThemeMenu(page)
  await page.getByRole("menuitemradio", { name: en.theme.dark }).click()
  await expect(html(page)).toHaveClass(DARK_CLASS)

  await page.reload()

  // The class is re-applied by next-themes' pre-hydration inline script, and the value it reads
  // back is the one assertion that proves persistence rather than a lucky re-render.
  await expect(
    page.getByRole("heading", { level: 1, name: en.organizations.title })
  ).toBeVisible()
  await expect(html(page)).toHaveClass(DARK_CLASS)
  expect(
    await storedTheme(page),
    `localStorage["${THEME_STORAGE_KEY}"] is what makes the choice survive a reload`
  ).toBe("dark")
})

test("system is a real third state that follows the OS preference", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" })
  await openBoardPage(page)

  // Pin to dark first, so the switch to System has something to move away from — otherwise
  // "not dark under a light OS" would be indistinguishable from "nothing happened".
  await openThemeMenu(page)
  await page.getByRole("menuitemradio", { name: en.theme.dark }).click()
  await expect(html(page)).toHaveClass(DARK_CLASS)

  await openThemeMenu(page)
  await page.getByRole("menuitemradio", { name: en.theme.system }).click()
  expect(await storedTheme(page)).toBe("system")
  await expect(html(page)).not.toHaveClass(DARK_CLASS)

  // The discriminator: with nothing else touched, flipping the emulated OS flips the page. That is
  // only true if "system" is genuinely tracking `prefers-color-scheme` rather than aliasing light.
  await page.emulateMedia({ colorScheme: "dark" })
  await expect(html(page)).toHaveClass(DARK_CLASS)

  await page.emulateMedia({ colorScheme: "light" })
  await expect(html(page)).not.toHaveClass(DARK_CLASS)
})
