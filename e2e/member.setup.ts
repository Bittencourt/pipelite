/**
 * The second — and non-privileged — session the harness logs in.
 *
 * `e2e/auth.setup.ts`'s twin. Specs opt into this session through the
 * `chromium-member` project in playwright.config.ts, which narrows `testMatch` to
 * `*-member.spec.ts` so no existing spec runs twice.
 *
 * Logging in through the real form rather than minting an Auth.js JWT is
 * deliberate, for the same reason it is in `auth.setup.ts`: a broken login page
 * fails the suite instead of being bypassed. And it buys something extra here —
 * the role that matters is the one the SESSION carries, not the one the seed wrote,
 * and only a real login exercises the path between them.
 *
 * The file it writes is a LIVE credential — a real session cookie with a 7-day
 * maxAge. `/e2e/.auth/` is gitignored; never commit it and never upload it as a CI
 * artifact.
 */

import { expect, test as setup } from "@playwright/test"
import { seedE2eMember } from "./seed-member"

const AUTH_FILE = "e2e/.auth/member.json"

setup("authenticate as the seeded e2e member", async ({ page }) => {
  const { email, password } = await seedE2eMember()

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

  // ------------------------------------------------------------------------
  // ANTI-VACUITY, IN TWO HALVES AND IN THIS ORDER. The order is the substance of
  // this block, not its presentation.
  //
  // HALF ONE — the session is REAL. A member-reachable page must actually render.
  // This has to come first because of how the second half can be faked: if the
  // login had failed we would still be unauthenticated, `/admin/audit` would
  // redirect us to `/login?callbackUrl=/admin`, and a bare
  // `pathname !== "/admin/audit"` check would go GREEN while proving nothing at
  // all. Half one is what removes that reading.
  await page.goto("/organizations")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe("/organizations")

  // HALF TWO — the session is NOT AN ADMIN, which is this file's entire reason for
  // existing. Inverted from `auth.setup.ts`, where an admin-only page rendering is
  // the proof; here being REFUSED is the proof.
  //
  // Why this matters more than it looks: Decision 3 makes a private view invisible
  // to admins too, departing from the app's `owner || role === "admin"` idiom
  // precisely in the admin direction. V-40-8 proves that departure by showing an
  // admin's private view is absent from THIS session's picker. A storageState that
  // was secretly an admin would make that assertion pass — the view would be
  // absent from its own owner's second window for unrelated reasons, or present and
  // the test rewritten to suit — while the property under test went unmeasured.
  // The failure mode is silent, so the check is made once, here, at the source.
  await page.goto("/admin/audit")
  const refusedAt = new URL(page.url())
  expect(refusedAt.pathname, "the member session was NOT refused at /admin/audit — the seed set the wrong role").not.toBe("/admin/audit")

  // DISCRIMINATING, not merely negative. `src/app/admin/layout.tsx` sends a signed-in
  // non-admin to `/?error=unauthorized` and an anonymous visitor to
  // `/login?callbackUrl=/admin`. Asserting the exact destination is what separates
  // "refused for being a member" — the thing we want — from "refused for being
  // logged out", which would be a broken harness wearing a passing test's clothes.
  expect(refusedAt.pathname, "expected the non-admin redirect target").toBe("/")
  expect(refusedAt.searchParams.get("error"), "expected admin/layout.tsx's unauthorized signal").toBe("unauthorized")

  await page.context().storageState({ path: AUTH_FILE })
})
