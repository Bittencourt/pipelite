import { defineConfig } from "@playwright/test"

// The e2e harness. Two authenticated sessions, both produced by the `setup`
// project: an ADMIN (`e2e/auth.setup.ts`) reused by every spec, and a non-admin
// MEMBER (`e2e/member.setup.ts`) used only by the handful of specs that must prove
// something is invisible to somebody else.
//
// Node's built-in .env loader (no `dotenv` dependency is added). It is what makes
// E2E_ADMIN_PASSWORD, E2E_MEMBER_PASSWORD and E2E_DATABASE_URL — all required by
// the setup project's two seeds — visible here. A missing .env must degrade to
// "export them by hand" rather than crashing config load, hence the try/catch.
try {
  process.loadEnvFile()
} catch {
  // No .env on disk: the two E2E_* variables must be exported in the environment.
}

export default defineConfig({
  testDir: "./e2e",
  // One app instance and one shared database, so specs must not race each other.
  fullyParallel: false,
  /*
   * `fullyParallel: false` DOES NOT DELIVER THE LINE ABOVE, and plan 40-16 measured the gap rather
   * than inheriting the assumption. That option serialises tests WITHIN a file; it says nothing
   * about files, which Playwright still distributes across workers (39-10 recorded the same thing).
   * On this 4-core machine the default is 2 workers, and the reporter says so on its first line:
   * `Running 6 tests using 2 workers`.
   *
   * That was harmless while exactly ONE spec file wrote `saved_views`. Phase 40 ends with FOUR, all
   * sharing the `[e2e] View%` prefix that `purgeViewFixtures` deletes by. Two of them running
   * concurrently means one file's `afterAll` purge deletes the other file's fixtures mid-test, and
   * two `beforeAll`s inserting the same three names race the
   * `saved_views_owner_type_name_uniq` index. MEASURED, not predicted — running the two visibility
   * specs together produced:
   *
   *   Error: MANAGE DIALOG: ANTI-VACUITY COMPANION — the admin's SHARED view must be visible to
   *   the member here.
   *   Locator: getByRole('dialog').getByText('[e2e] View visibility ADMIN_SHARED', { exact: true })
   *   Error: element(s) not found
   *
   * — the sibling file's purge, arriving between this file's seed and its assertion.
   *
   * So the invariant is now ENFORCED rather than merely stated. The cost is wall time; the thing it
   * buys is that a red run means a defect. A suite whose failures have to be triaged as "probably
   * the other worker" is a suite nobody trusts, which is the state Phase 39 shipped in.
   */
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    // DO NOT REMOVE. Playwright's headless Chromium passes --hide-scrollbars by
    // default, which makes the SC-1 overflow assertion 15px too lenient.
    // Measured at a 320x640 viewport against a 416px-wide page:
    //   default headless                      -> clientWidth 320
    //   ignoreDefaultArgs: --hide-scrollbars  -> clientWidth 305
    //   headless: false (headed)              -> clientWidth 305
    // The recorded UAT baseline is 305. Without this flag the harness green-lights
    // layouts that still show a horizontal scrollbar on a real 320px phone.
    launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
  },
  // There is deliberately NO server-startup block here, and its absence is a
  // decision rather than an omission: this app runs in Docker only
  // (`docker compose up -d`, host 3001 -> container 3000) and `npm run dev` /
  // `next dev` are forbidden in this project. The harness attaches to the already
  // running container at baseURL; bring it up before invoking Playwright.
  projects: [
    // Logs in through the real form and writes the storageStates below. The
    // `testMatch` catches both `auth.setup.ts` and `member.setup.ts`.
    //
    // `retries: 1` is scoped to THIS project and nowhere else. BACKLOG.md records
    // `auth.setup.ts` timing out on `waitForURL` in 2 of 8 full-suite invocations
    // with no rate limiting involved, and a setup project is the one place where a
    // single flake is not a single failure: every dependent project is skipped with
    // it, so one timeout reports as a whole-suite failure. Retrying the LOGIN is
    // safe in a way that retrying an assertion would not be — both seeds are
    // idempotent, and a retry re-runs the login rather than papering over a
    // measurement.
    { name: "setup", testMatch: /.*\.setup\.ts/, retries: 1 },
    {
      name: "chromium",
      dependencies: ["setup"],
      /*
       * THE EXCLUSION THAT MAKES `chromium-member`'S NARROWING MEAN ANYTHING (found by plan 40-16).
       *
       * `chromium` declares no `testMatch`, so it inherits the WHOLE of `testDir`. Narrowing
       * `chromium-member` to `*-member.spec.ts` stopped the member project from running every other
       * spec; it never stopped THIS project from running the member specs. So a member spec matched
       * BOTH projects and ran twice — once under the member storageState and once under the ADMIN
       * one, where "the admin's private view is absent from a MEMBER's picker" would be asserted by
       * the admin who owns it.
       *
       * MEASURED the first time a `*-member.spec.ts` file existed:
       *
       *   [chromium] › e2e/saved-views-visibility-member.spec.ts:251:5 › the session under test is
       *   the seeded MEMBER and is refused at /admin/audit for being one
       *
       * That run went RED rather than silently green, and only because the spec asserts its own
       * session identity in `beforeEach` (T-40-76). The guard caught the harness; the harness is
       * fixed here so the guard does not have to.
       *
       * `testIgnore` and not a positive `testMatch`: every future spec belongs to this project by
       * default, and only the member-session ones have to opt out.
       */
      testIgnore: /.*-member\.spec\.ts/,
      use: {
        storageState: "e2e/.auth/admin.json",
        // Plain viewport emulation, NOT `isMobile: true` — mobile emulation
        // measured 980px on a probe page, a variable this phase does not need.
        viewport: { width: 320, height: 640 },
      },
    },
    {
      // The non-admin session. `testMatch` is NARROWED BY FILENAME on purpose: a
      // second project with no `testMatch` inherits the whole `testDir` and would
      // run every existing spec a second time — doubling the runtime, and doubling
      // the fixture writes into a database holding 46,054 real organizations, with
      // two projects racing for the same prefixed rows under `fullyParallel: false`
      // but across projects. Only `*-member.spec.ts` belongs here.
      name: "chromium-member",
      dependencies: ["setup"],
      testMatch: /.*-member\.spec\.ts/,
      use: {
        storageState: "e2e/.auth/member.json",
        viewport: { width: 320, height: 640 },
      },
    },
  ],
})
