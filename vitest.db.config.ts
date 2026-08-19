import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

// The THIRD vitest project, and the only one in this repository that talks to a real
// database. `npm test` runs the other two and deliberately never runs this one:
//   "test":    "vitest run && vitest run --config vitest.rsc.config.ts"
//   "test:db": "vitest run --config vitest.db.config.ts"     <- this project, opt-in only
//
// WHY IT EXISTS
//   Every mutation test in this repository mocks `@/db` wholesale, and a mocked write
//   cannot raise a constraint. `notes_migration_uniq` is a partial unique index on
//   (entity_type, entity_id) WHERE source = 'migration', 63% of this deployment's
//   organizations carry such a note, and a merge that reassigns notes naively therefore
//   raises SQLSTATE 23505 on roughly 40% of real organization merges. A mocked test for
//   that path passes while the feature fails on nearly half the data. Constraint
//   violations have to be EXERCISED, not asserted — see
//   src/lib/mutations/dedup.db.test.ts, and the same argument in the header of
//   scripts/trash-checks.sql, which exists for the same reason one phase earlier.
//
// WHY IT IS NOT PART OF `npm test`, AND MUST NEVER BECOME PART OF IT
//   CI (.github/workflows/ci.yml) runs `npm ci`, typecheck, lint and `npm test` on GitHub
//   hardware with NO Docker and NO PostgreSQL. `ci` is the required check on the master
//   ruleset, and GitHub treats a required check that never passes as permanently pending —
//   every pull request would become unmergeable (recorded in Phase 32, and the same
//   reasoning as the "deliberately no path filter" comment in ci.yml). Adding this project
//   to `test`, or a `test:db` step to that workflow, breaks the repository rather than the
//   feature. `src/lib/mutations/__tests__/db-test-isolation.test.ts` runs in the BASE
//   project — so in CI — and asserts that neither has happened.
//
// WHY A SEPARATE CONFIG FILE rather than a `test.projects: [...]` entry in
// vitest.config.ts: the same reason vitest.rsc.config.ts gives, plus a decisive one of its
// own. A project declared inline is still reachable from a bare `vitest run`, which is
// exactly what must be impossible here. A file that has to be named on the command line
// cannot be invoked by accident.
//
// HOW TO RUN IT
//   docker compose up -d          # the app's Postgres, host 5433 -> container 5432
//   npm run test:db
//
//   `test:db` runs scripts/dedup-db-test-setup.sh first, which provisions the ISOLATED
//   database the suite actually uses. E2E_DATABASE_URL must be set (it is, in .env) and must
//   point at a LOOPBACK host; the test file re-derives and re-asserts both the host and the
//   database NAME from the URL itself and refuses to run otherwise.
try {
  // Node's built-in .env loader, exactly as playwright.config.ts does it and for the same
  // reason: no `dotenv` dependency is added to this repo. A missing .env must degrade to
  // "export E2E_DATABASE_URL by hand" rather than crashing config load.
  process.loadEnvFile()
} catch {
  // No .env on disk. The variable must then already be exported in the environment.
}

// THE NAME OF THE DATABASE THIS PROJECT TALKS TO, AND THE MOST IMPORTANT LINE IN THIS FILE.
//
// `pipelite` is the operator's real development database: 46,054 organizations, 38,348
// people, and the application container running against it. The suite creates and HARD
// DELETES fixture rows, so it may not be pointed there — not with a prefix convention, not
// with a careful teardown, not at all. It gets its own database instead, provisioned from a
// schema-only dump by scripts/dedup-db-test-setup.sh (see that file for why a dump rather
// than `drizzle-kit migrate`), starting empty every run.
//
// The name is spelled out here, unmistakably distinct from the development one, and the
// test file asserts it again from the connection string it receives.
const TEST_DATABASE = 'pipelite_dedup_test'

/**
 * The isolated connection string, derived from E2E_DATABASE_URL by replacing ONLY the
 * database name.
 *
 * Derived rather than declared so no credential is written into this file, and so the host
 * and port stay whatever the operator configured. E2E_DATABASE_URL is the same variable
 * e2e/seed-admin.ts uses, and for the same reason: DATABASE_URL in .env resolves
 * `postgres:5432` inside the Docker network and is unreachable from a host test process.
 */
function isolatedConnection(source: string): string {
  const url = new URL(source)
  url.pathname = `/${TEST_DATABASE}`
  return url.toString()
}

// `@/db` reads DATABASE_URL at module-evaluation time and every mutation module imports it,
// so the isolated string has to arrive under that name. E2E_DATABASE_URL is forwarded
// UNCHANGED alongside it: the test file's guard reads it to check the host, and comparing
// the two is how it proves it is not about to write to the development database.
//
// Forwarded rather than defaulted: if E2E_DATABASE_URL is absent, DATABASE_URL is left
// alone and `@/db` throws its own named error, which is a better message than a silent
// fallback to a container hostname that will time out.
const dbEnv = process.env.E2E_DATABASE_URL
  ? {
      DATABASE_URL: isolatedConnection(process.env.E2E_DATABASE_URL),
      E2E_DATABASE_URL: process.env.E2E_DATABASE_URL,
      DEDUP_TEST_DATABASE: TEST_DATABASE,
    }
  : {}

export default defineConfig({
  test: {
    name: 'db',
    globals: false,
    environment: 'node',
    include: ['src/**/*.db.test.?(c|m)[jt]s?(x)'],
    // test.exclude REPLACES the defaults - spread them, never write a bare array.
    exclude: [...configDefaults.exclude, '**/.next/**'],
    env: dbEnv,
    // ONE database, shared fixtures, and real transactions. Two files running at once
    // would interleave their transactions on the same rows, and one file's teardown would
    // race another's assertions. Serial is not a performance concession here, it is the
    // isolation model — the isolated database is per-RUN, not per-file.
    fileParallelism: false,
    // Same reasoning one level down: within a file, no two tests may be in flight against
    // the same tables at once.
    sequence: { concurrent: false },
    // A real merge is a multi-statement transaction, followed by a formula recalculation
    // pass and a fixture teardown. The 5s default is sized for a mocked call and would
    // flake on the first slow round trip.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // The teardown ends the postgres.js pool. Give it room so a lingering connection
    // reports as a real failure rather than as a timeout.
    teardownTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
