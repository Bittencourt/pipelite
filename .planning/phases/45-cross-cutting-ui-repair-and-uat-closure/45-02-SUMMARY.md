---
phase: 45-cross-cutting-ui-repair-and-uat-closure
plan: 02
subsystem: testing
tags: [playwright, e2e, argon2, auth, drizzle, docker, storageState]

# Dependency graph
requires:
  - phase: 45-01
    provides: locale-parity contract lists (no code dependency; wave-1 sibling)
provides:
  - "@playwright/test recorded in devDependencies and package-lock.json"
  - "playwright.config.ts with the V-1 scrollbar flag, no server-startup block, setup+chromium projects"
  - "e2e/seed-admin.ts — idempotent, loopback-guarded argon2id admin seed exporting seedE2eAdmin + E2E_ADMIN_EMAIL"
  - "e2e/auth.setup.ts — the single real-form login, writing e2e/.auth/admin.json"
  - "gitignore/dockerignore entries that keep a live session token out of git and out of the Docker build context"
affects: [45-08, 45-09, 45-10, 45-11, any future e2e spec]

# Tech tracking
tech-stack:
  added: ["@playwright/test@^1.62.1 (devDependency)"]
  patterns:
    - "e2e harness attaches to the running Docker app; no webServer block, ever"
    - "TS seeds run from inside a Playwright setup project (Playwright transpiles TS; no tsx dependency)"
    - "storageState produced by one real-form login, reused by every spec via dependencies: [setup]"

key-files:
  created:
    - playwright.config.ts
    - e2e/seed-admin.ts
    - e2e/auth.setup.ts
  modified:
    - .gitignore
    - .dockerignore
    - package.json
    - package-lock.json
    - .env (gitignored, local only)

key-decisions:
  - "The e2e admin address is pipelite-e2e@local.test, not @local — the login form's z.string().email() regex demands a dotted domain, so @local never reaches the server"
  - "The dev-database guard is a hostname allow-list (localhost / 127.0.0.1) parsed from E2E_DATABASE_URL, not a name convention"
  - "auth.setup.ts asserts /admin/audit renders before saving storageState — a failed or non-admin login would otherwise save a state that 'works'"
  - "No isMobile emulation: plain 320x640 viewport plus ignoreDefaultArgs --hide-scrollbars is the closest match to the recorded 305px baseline"

patterns-established:
  - "Ignore-file entries land BEFORE the code that writes a credential, not after"
  - "Every environment-variable guard gets a RUN negative proof, not a reasoned one"

requirements-completed: [SC-1, SC-2, SC-5]

# Metrics
duration: 34min
completed: 2026-08-18
---

# Phase 45 Plan 02: Playwright Harness Foundation Summary

**A Playwright harness that attaches to the Docker app, seeds a loopback-only `pipelite-e2e@local.test` argon2id admin, and captures one real-form login into a gitignored `storageState` — with the 15px scrollbar correction that stops SC-1 from passing vacuously.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-08-18T09:36:00Z
- **Completed:** 2026-08-18T10:10:00Z
- **Tasks:** 3
- **Files modified:** 8 (7 tracked + `.env`, gitignored)

## Accomplishments

- `@playwright/test@^1.62.1` recorded in `devDependencies` and `package-lock.json`. It was already physically present in `node_modules` from research tooling while absent from `package.json`, so the install was not a no-op at the manifest level.
- `playwright.config.ts` carries `launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] }` with the measured 320-vs-305 `clientWidth` table inline, and deliberately defines no server-startup block, with a comment saying the app runs in Docker only.
- A dedicated `pipelite-e2e@local.test` admin exists in the dev database with `role=admin`, `status=approved`, verified email, `deleted_at IS NULL` — asserted directly against Postgres.
- One real-form login produces `e2e/.auth/admin.json` (1460 bytes) that git cannot see. `git status --porcelain e2e/.auth` is empty.
- Both env-var guards were **run**, not reasoned about: missing password and non-loopback database host each exit non-zero with the named error.

## Task Commits

1. **Task 1: Record the dependency and close the credential-leak holes FIRST** — `7564523` (chore)
2. **Task 2: playwright.config.ts** — `9b8c574` (chore)
3. **Task 3: Seed the e2e admin and capture one real-form login** — `8453e3c` (feat)

## Files Created/Modified

- `playwright.config.ts` — testDir `./e2e`, `setup` + `chromium` projects, `storageState: e2e/.auth/admin.json`, 320x640 viewport, `baseURL` from `E2E_BASE_URL ?? http://localhost:3001`, `process.loadEnvFile()` in a try/catch, `fullyParallel: false`, `forbidOnly: !!process.env.CI`, `reporter: [["list"]]`. No server-startup block.
- `e2e/seed-admin.ts` — exports `seedE2eAdmin()` and `E2E_ADMIN_EMAIL`. Builds its own `postgres` + `drizzle-orm/postgres-js` client against `E2E_DATABASE_URL` (never `@/db`, which is pinned to the container-internal `postgres:5432`). Imports `hashPassword` from `src/lib/password.ts` rather than re-deriving argon2id parameters. Select-then-insert-or-update on email, setting `role`, `status`, `emailVerified`, `deletedAt: null` explicitly.
- `e2e/auth.setup.ts` — seeds, fills `#email` / `#password`, clicks the `Sign In` button, waits for the self-navigation away from `/login`, then proves the session is a real admin session by loading `/admin/audit` before writing `storageState`.
- `.gitignore` — `# Playwright e2e` section: `/e2e/.auth/`, `/playwright-report/`, `/test-results/`.
- `.dockerignore` — `# E2E` section: `e2e`, `playwright.config.ts`, `playwright-report`, `test-results`.
- `package.json` — `@playwright/test` in `devDependencies`, `"test:e2e": "playwright test"`. `npm test` unchanged; `.github/workflows/ci.yml` byte-identical.
- `.env` (gitignored, never committed) — `E2E_ADMIN_PASSWORD` (generated by `openssl rand -base64 24`, redirected straight into the file) and `E2E_DATABASE_URL` pointing at the host-mapped `localhost:5433`.

## Decisions Made

- **The account address is `pipelite-e2e@local.test`.** See deviation 1 — `@local` is unusable against the real login form.
- **The dev-database guard is a hostname allow-list.** `new URL(E2E_DATABASE_URL).hostname` must be exactly `localhost` or `127.0.0.1`. A loopback host is the one place the operator provably owns the target, which is the concrete form of "must never run against a non-dev database".
- **`deletedAt: null` and `updatedAt` are written on every upsert.** The plan named four columns; `authorize()` in `src/auth.ts` also refuses a soft-deleted row before checking the password, so a previously trashed e2e user would otherwise make the harness fail obscurely.
- **The anti-vacuity assertion checks both the heading and the final pathname.** `/admin/audit` redirects a non-admin to `/?error=unauthorized`, which also renders an `h1` — asserting the heading alone would not have distinguished the two.
- **`e2e/*.ts` and `playwright.config.ts` use double quotes**, matching `src/` and `drizzle/` (the two vitest configs are the repo's only single-quote files) and matching the plan's literal acceptance-criteria tokens.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The planned e2e admin address cannot log in through the real form**

- **Found during:** Task 3
- **Issue:** The plan and `45-CONTEXT.md` both specify `pipelite-e2e@local`. `src/app/(auth)/login/page.tsx:17` validates with `z.string().email()`, and zod 4's email regex requires a dotted domain. Measured directly: `z.string().email().safeParse("pipelite-e2e@local")` returns `success: false` (and `@localhost` also fails). The submission would have been blocked client-side and never reached `authorize()`, so the plan's two hard requirements — "the seeded account is `pipelite-e2e@local`" and "log in through the real form so a broken login page fails the suite" — were mutually unsatisfiable. Relaxing the login schema to accommodate a test fixture was rejected outright.
- **Fix:** Used `pipelite-e2e@local.test`, exported as `E2E_ADMIN_EMAIL` so it has a single source of truth. `.test` is an RFC 2606 reserved TLD, so the address is guaranteed non-routable — the same "dedicated, undeliverable account" property `@local` was chosen for. Confirmed no downstream plan (45-03..45-11) hardcodes the address; later specs inherit the session through `storageState`, not the email.
- **Files modified:** `e2e/seed-admin.ts`
- **Verification:** `z.string().email()` probe run against all three candidate addresses; setup project green; Postgres returns `admin|approved` for `pipelite-e2e@local.test`.
- **Committed in:** `8453e3c`

**2. [Rule 3 - Blocking] Chromium browser binaries were not present**

- **Found during:** Task 3
- **Issue:** The first `playwright test --project=setup` run failed with `Executable doesn't exist at ~/.cache/ms-playwright/chromium_headless_shell-1234/...`. `@playwright/test` has no `postinstall` script by design (that is exactly why it is safe to record in `devDependencies` without CI downloading 300 MB), so the browsers are a separate, machine-local step.
- **Fix:** Ran `./node_modules/.bin/playwright install chromium` (Playwright's own first-party downloader, not a package-manager install of a third-party package). Downloaded Chrome for Testing 151.0.7922.34 and Chrome Headless Shell to `~/.cache/ms-playwright/`. Nothing entered the repository. Note `npx` resolves to `npm run` in this environment, so the `node_modules/.bin` path is required.
- **Files modified:** none (host cache only)
- **Verification:** setup project green immediately afterwards, twice more after that.
- **Committed in:** n/a — no repository change

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking)
**Impact on plan:** Neither changes the plan's shape. Deviation 1 is a one-character-class correction to a fixture address that the plan's own "real form" requirement made mandatory; deviation 2 is a machine-local prerequisite. No scope creep, no application source touched.

## Issues Encountered

- **Idempotency was proven by branch, not just by exit code.** The first run logged `✓ Created e2e admin`, every later run logged `→ e2e admin already exists, refreshed`. A seed that merely exits 0 twice could be insert-only against an empty table.
- **The negative proofs needed `.env` neutralised, not just the shell variable unset**, because `playwright.config.ts` calls `process.loadEnvFile()`. Each proof swapped in a minimal `.env` under a `trap ... EXIT` restore; `.env` was verified intact (both keys, all 13 original keys) after each.

## Verification Results

| Check | Result |
|---|---|
| `git check-ignore -q e2e/.auth/admin.json` / `playwright-report/index.html` / `test-results/x` | all exit 0 |
| `git status --porcelain e2e/.auth` and `e2e/.auth/admin.json` | both empty |
| `@playwright/test` in `devDependencies`, absent from `dependencies` | pass |
| `scripts["test:e2e"] === "playwright test"`; `scripts.test` contains no `playwright` | pass |
| `git diff --stat .github/workflows/ci.yml` across all three commits | empty (V-3 honoured) |
| `.dockerignore`: `grep -c '^e2e$'` / `'^playwright.config.ts$'` | 1 / 1 |
| config stripped of comments contains `ignoreDefaultArgs`, `"--hide-scrollbars"`, `viewport`/`320`/`640`, `storageState`, `"e2e/.auth/admin.json"`, `dependencies`/`"setup"`, `process.loadEnvFile` | all present |
| config stripped of comments contains `webServer` | absent (V-1/V-3 honoured) |
| `playwright test --project=setup` | green, run 4 times |
| `select role, status from users where email='pipelite-e2e@local.test'` | `admin|approved` |
| `seed-admin.ts` stripped: `hashPassword`, `E2E_ADMIN_PASSWORD`, `E2E_DATABASE_URL`, `"admin"`, `"approved"`, `"localhost"`, `"127.0.0.1"` | all present |
| `seed-admin.ts` stripped contains `@/db"` or any password literal | absent |
| Negative proof — `E2E_ADMIN_PASSWORD` unset | exit 1, message names `E2E_ADMIN_PASSWORD` |
| Negative proof — non-loopback `E2E_DATABASE_URL` host | exit 1, message names the rejected host |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 (0 errors, 127 pre-existing warnings) |
| `npm run test` | exit 0 — 2091 passed / 21 skipped, plus 8 passed in the rsc project |

## Known Stubs

None. No placeholder, empty-collection or TODO path was introduced. `e2e/` contains only the two harness files this plan specifies; the specs that consume the harness are 45-08 and later.

## Threat Flags

None beyond the plan's own register. The one new privileged surface — the seeded admin row — is T-45-06 and is mitigated by the loopback hostname guard, proven by a run.

## Security Notes

- The generated `E2E_ADMIN_PASSWORD` value and the local database password appear in no commit message, no source file and no line of this summary. `.env` is gitignored and untouched by every `git add` in this plan.
- `e2e/.auth/admin.json` holds a live Auth.js JWT with a 7-day `maxAge`. Its ignore entry landed in commit `7564523`, two commits before anything wrote the file.

## User Setup Required

One machine-local step, not a repository change: a developer cloning this repo must run
`./node_modules/.bin/playwright install chromium` once before `npm run test:e2e`. It downloads
~300 MB into `~/.cache/ms-playwright/`. This is deliberately not automated via `postinstall` —
that is the property which keeps CI from downloading browsers it will never use (V-3).

`.env` also needs `E2E_ADMIN_PASSWORD` and `E2E_DATABASE_URL` (host-mapped `localhost:5433`).

## Next Phase Readiness

- The harness is ready for `e2e/viewport-320.spec.ts` (SC-1), `e2e/theme.spec.ts` (SC-2) and `e2e/deals-drag.spec.ts` (SC-5). Each inherits the admin session automatically via `dependencies: ["setup"]`; none should log in again.
- **V-7 still binds every future e2e run:** the app container is `build: .` with no volume mount, so any wave that edits UI source must `docker compose up -d --build` before measuring. This plan changed no application source, so the existing image was adequate here — that will not be true for 45-03 onward.
- `E2E_ADMIN_EMAIL` is exported from `e2e/seed-admin.ts`; specs needing the address should import it rather than repeat the literal.

---
*Phase: 45-cross-cutting-ui-repair-and-uat-closure*
*Completed: 2026-08-18*

## Self-Check: PASSED

All three created files exist on disk and all three task commits resolve in `git log --all`.
