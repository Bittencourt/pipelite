/**
 * The ONE place the e2e harness logs in.
 *
 * Every other spec inherits the resulting session through the `chromium` project's
 * `dependencies: ["setup"]` in playwright.config.ts. Logging in through the real
 * form rather than minting an Auth.js JWT is deliberate: it means a broken login
 * page fails the suite instead of being bypassed.
 *
 * The file it writes is a LIVE credential — a real session cookie with a 7-day
 * maxAge. `/e2e/.auth/` is gitignored; never commit it and never upload it as a
 * CI artifact.
 */

import { expect, test as setup } from "@playwright/test"
import { seedE2eAdmin } from "./seed-admin"

const AUTH_FILE = "e2e/.auth/admin.json"

setup("authenticate as the seeded e2e admin", async ({ page }) => {
  const { email, password } = await seedE2eAdmin()

  await page.goto("/login")

  // #email, #password and the "Sign In" button are hardcoded English in
  // src/app/(auth)/login/page.tsx — that page is not in the message catalog, so
  // these selectors are locale-independent.
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(password)
  await page.getByRole("button", { name: "Sign In" }).click()

  // The form calls signIn(..., { redirect: false }) and the PAGE then navigates
  // itself, so there is no form response to await — wait for the navigation away
  // from /login.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"))

  // ANTI-VACUITY. A failed login leaves us on /login and a non-admin session is
  // redirected to /?error=unauthorized; both would otherwise produce a saved
  // storageState that "works" and then fails every later spec obscurely. Proving
  // an admin-only page renders proves the session is real AND is an admin.
  await page.goto("/admin/audit")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe("/admin/audit")

  await page.context().storageState({ path: AUTH_FILE })
})
