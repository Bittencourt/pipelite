import { defineConfig } from '@playwright/test'

// The e2e harness for Phase 45. It is deliberately minimal: one authenticated
// session produced by `e2e/auth.setup.ts`, reused by every spec.
//
// Node's built-in .env loader (no `dotenv` dependency is added). It is what makes
// E2E_ADMIN_PASSWORD and E2E_DATABASE_URL — both required by the setup project's
// seed — visible here. A missing .env must degrade to "export them by hand"
// rather than crashing config load, hence the try/catch.
try {
  process.loadEnvFile()
} catch {
  // No .env on disk: the two E2E_* variables must be exported in the environment.
}

export default defineConfig({
  testDir: './e2e',
  // One app instance and one shared database, so specs must not race each other.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    // DO NOT REMOVE. Playwright's headless Chromium passes --hide-scrollbars by
    // default, which makes the SC-1 overflow assertion 15px too lenient.
    // Measured at a 320x640 viewport against a 416px-wide page:
    //   default headless                      -> clientWidth 320
    //   ignoreDefaultArgs: --hide-scrollbars  -> clientWidth 305
    //   headless: false (headed)              -> clientWidth 305
    // The recorded UAT baseline is 305. Without this flag the harness green-lights
    // layouts that still show a horizontal scrollbar on a real 320px phone.
    launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
  },
  // There is deliberately NO server-startup block here, and its absence is a
  // decision rather than an omission: this app runs in Docker only
  // (`docker compose up -d`, host 3001 -> container 3000) and `npm run dev` /
  // `next dev` are forbidden in this project. The harness attaches to the already
  // running container at baseURL; bring it up before invoking Playwright.
  projects: [
    // Logs in once through the real form and writes the storageState below.
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: {
        storageState: 'e2e/.auth/admin.json',
        // Plain viewport emulation, NOT `isMobile: true` — mobile emulation
        // measured 980px on a probe page, a variable this phase does not need.
        viewport: { width: 320, height: 640 },
      },
    },
  ],
})
