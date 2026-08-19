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
//   E2E_DATABASE_URL must be set (it is, in .env) and must point at a LOOPBACK host. The
//   test file re-derives and re-asserts that from the URL itself and refuses to run
//   otherwise; this config only forwards it.
try {
  // Node's built-in .env loader, exactly as playwright.config.ts does it and for the same
  // reason: no `dotenv` dependency is added to this repo. A missing .env must degrade to
  // "export E2E_DATABASE_URL by hand" rather than crashing config load.
  process.loadEnvFile()
} catch {
  // No .env on disk. The variable must then already be exported in the environment.
}

// DATABASE_URL in .env resolves `postgres:5432` INSIDE the Docker network and is
// unreachable from the host, so `@/db` — which every mutation module imports at
// module-evaluation time — cannot be loaded with it as-is. The host-mapped
// E2E_DATABASE_URL is the one connection string that works from here, and it is the same
// variable e2e/seed-admin.ts already uses for the same reason.
//
// Forwarded rather than defaulted: if E2E_DATABASE_URL is absent, DATABASE_URL is left
// alone and `@/db` throws its own named error, which is a better message than a silent
// fallback to a container hostname that will time out.
const dbEnv = process.env.E2E_DATABASE_URL
  ? { DATABASE_URL: process.env.E2E_DATABASE_URL, E2E_DATABASE_URL: process.env.E2E_DATABASE_URL }
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
    // isolation model.
    fileParallelism: false,
    // Same reasoning one level down: within a file, no two tests may be in flight against
    // the same tables at once.
    sequence: { concurrent: false },
    // A real merge is a multi-statement transaction against a table with 46,054 rows,
    // followed by a formula recalculation pass and a fixture teardown. The 5s default is
    // sized for a mocked call and would flake on the first slow round trip.
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
