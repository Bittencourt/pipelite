import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

// The FOURTH vitest project, and the second of the four that talks to a real database. `npm test`
// runs the first two and deliberately never runs this one:
//   "test":      "vitest run && vitest run --config vitest.rsc.config.ts"
//   "test:db":   "bash scripts/dedup-db-test-setup.sh && vitest run --config vitest.db.config.ts"
//   "test:live": "vitest run --config vitest.live.config.ts"    <- this project, opt-in only
//
// WHY IT EXISTS
//   Because 28 tests had never run. Not "were failing" — had never executed in any suite, in any
//   project, on any machine other than one where somebody exported DATABASE_URL by hand.
//   `src/lib/export/formatters-live.test.ts` (24 tests) and
//   `src/lib/audit/export-events-live.test.ts` (4) both self-skip on
//   `describe.skipIf(!process.env.DATABASE_URL)`, and no project in this repository supplied that
//   variable. Those 28, plus four `it.skip('… requires DB')` stubs
//   (src/app/settings/notifications/actions.test.ts:158, src/app/admin/users/actions.test.ts:64-66),
//   were the base suite's ENTIRE skipped count of 32 — so the milestone's headline pass count said
//   nothing whatever about the export path. Phase 40's verifier named the class precisely:
//   "This is the same disease phases 42 and 43 kept finding (a check that cannot fail), in its
//   purest form: a check that never runs at all."
//   Both files exist because the risk they guard has already materialised: Phase 37 shipped a
//   malformed drizzle fragment — an interpolated id list that expanded to the invalid
//   `= ANY(($1,$2,$3))` — and a wholly-mocked suite passed it cleanly.
//
// WHY IT POINTS AT THE REAL `pipelite` DATABASE AND NOT AN ISOLATED ONE
//   This is the one place this file MUST differ from vitest.db.config.ts, whose most important line
//   is the one refusing the development database. Here the development database is the point. The
//   absorbed assertions are coupled to LIVE VOLUMES — 46,054 organizations, 79,022 activities and
//   the three-way completed/pending/overdue partition that must sum to exactly the table total —
//   and SC-1 mandates measurement at that scale rather than against a fixture. `pipelite_dedup_test`
//   is provisioned `--schema-only` and starts EMPTY every run, so moving these files there would
//   not make them pass differently, it would make them VACUOUS: `liveIds.length > 0` fails, the
//   `maxRows: 100` refusal has no 101st row to trip on, the activity partition has nothing to
//   partition, and `search:"a"` cannot be strictly between 0 and a baseline of 0.
//
//   WHAT MAKES THAT ACCEPTABLE IS THE WRITE DISCIPLINE, not a hope:
//     - `formatters-live.test.ts` is READ-ONLY — it seeds nothing, mutates nothing, deletes nothing,
//       and its final test re-reads the organizations, activities and audit_log counts and asserts
//       all three are unchanged.
//     - `export-events-live.test.ts` WRITES. It inserts audit rows through `recordExport` and
//       deletes exactly the ones it inserted, matched on the uuids it read back from its own probe
//       and NEVER on `entity_type` — which would destroy real export evidence if a person exported
//       something while the suite ran. Its `afterAll` asserts the table is back to the count it
//       started at.
//   Anything absorbed here later must carry the same discipline, stated in its own header.
//
// WHY IT IS NOT PART OF `npm test`, AND MUST NEVER BECOME PART OF IT
//   The same argument vitest.db.config.ts makes, and it is not weaker here. CI
//   (.github/workflows/ci.yml) runs `npm ci`, typecheck, lint and `npm test` on GitHub hardware with
//   no Docker and no populated database. `ci` is the required check on the master ruleset, and
//   GitHub treats a required check that never passes as permanently PENDING — every pull request
//   becomes unmergeable (recorded in Phase 32). Adding this project to `test` breaks the repository
//   rather than the feature. And there is a second reason the db project does not have: one of these
//   two files WRITES to the operator's real `audit_log`, so a contributor typing `npm test` would be
//   mutating production-shaped records. `src/lib/mutations/__tests__/db-test-isolation.test.ts` runs
//   in the BASE project — so in CI — and asserts that neither has happened.
//
// WHY A SEPARATE CONFIG FILE rather than a `test.projects: [...]` entry in vitest.config.ts: the
// same reason vitest.db.config.ts gives, and it is decisive for the same reason. A project declared
// inline is still reachable from a bare `vitest run`, which is exactly what must be impossible here.
// A file that has to be NAMED on the command line cannot be invoked by accident.
//
// HOW TO RUN IT
//   docker compose up -d          # the app's Postgres, host 5433 -> container 5432
//   npm run test:live
//
//   No provisioning step, and specifically NOT scripts/dedup-db-test-setup.sh: that script pg_dumps
//   the development database and rebuilds `pipelite_dedup_test`, which has nothing to do with this
//   project and would make a read-only export probe destroy another project's fixtures.
try {
  // Node's built-in .env loader, exactly as vitest.db.config.ts and playwright.config.ts do it and
  // for the same reason: no `dotenv` dependency is added to this repo. A missing .env must degrade
  // to "export DATABASE_URL by hand" rather than crashing config load.
  process.loadEnvFile()
} catch {
  // No .env on disk. The variable must then already be exported in the environment.
}

/**
 * THE FENCE, AND THE MOST IMPORTANT FUNCTION IN THIS FILE.
 *
 * This project writes to WHATEVER IT IS POINTED AT. `.env:6` holds
 * `postgresql://pipelite:pipelite@localhost:5433/pipelite` — the host-mapped port, the operator's
 * own machine — so nothing needs declaring here and no credential is written into this file. But
 * `DATABASE_URL` is one exported variable away from being a remote host, and a deleting suite aimed
 * at a database nobody chose is a data-loss shape rather than a test failure.
 *
 * So a non-loopback host is a LOUD REFUSAL AT CONFIG LOAD, before vitest collects a single file and
 * long before postgres.js opens a socket. It throws rather than falling back, because a silent
 * fallback to a "safe" default is how a person ends up believing they measured something they did
 * not.
 */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]']

function fencedConnection(source: string | undefined): string | undefined {
  if (source === undefined) return undefined

  let hostname: string
  try {
    hostname = new URL(source).hostname
  } catch {
    throw new Error(
      'LiveProjectRefusedNonLoopbackHost: DATABASE_URL is not a parseable URL, so this project ' +
        'cannot prove it points at a loopback host. Refusing to run — see the fence in ' +
        'vitest.live.config.ts.'
    )
  }

  // `new URL('postgresql://u:p@[::1]:5432/x').hostname` is `[::1]`, brackets included; both forms
  // are listed so an IPv6 loopback is not refused on a formatting technicality.
  if (!LOOPBACK_HOSTS.includes(hostname)) {
    throw new Error(
      `LiveProjectRefusedNonLoopbackHost: DATABASE_URL points at "${hostname}". This project ` +
        `WRITES to the database it is given (src/lib/audit/export-events-live.test.ts inserts and ` +
        `deletes audit_log rows), so it may only ever be aimed at the operator's own machine. ` +
        `Permitted hosts: ${LOOPBACK_HOSTS.join(', ')}.`
    )
  }

  return source
}

// Forwarded UNCHANGED rather than derived: unlike the db project, this one is SUPPOSED to reach the
// development database, so there is no database name to substitute. What is added is the fence.
//
// Forwarded rather than defaulted: if DATABASE_URL is absent, it is left absent and the two absorbed
// files self-skip exactly as they did before — which reports 28 skipped rather than 28 passed, and
// the named-integer floor in the plan's verification catches that immediately. A hard-coded fallback
// would instead invent a connection string and produce a confusing socket error.
const liveUrl = fencedConnection(process.env.DATABASE_URL)
const liveEnv = liveUrl ? { DATABASE_URL: liveUrl } : {}

export default defineConfig({
  test: {
    name: 'live',
    globals: false,
    environment: 'node',
    // EXACTLY the -live glob, and nothing else. If this widened to the base corpus, `npm run
    // test:live` would run 187 mocked files against a live connection.
    include: ['src/**/*-live.test.?(c|m)[jt]s?(x)'],
    // test.exclude REPLACES the defaults - spread them, never write a bare array, or vitest walks
    // node_modules and executes vendored test files.
    exclude: [...configDefaults.exclude, '**/.next/**'],
    env: liveEnv,
    // ONE database, the operator's real rows, and one of the two files writes to `audit_log`. Two
    // files in flight would interleave a read of the table's count with another file's insert, and
    // the "back to the count it started at" assertion would be measuring the wrong table state.
    // Serial is the correctness model here, not a performance concession.
    fileParallelism: false,
    // Same reasoning one level down: within a file, no two tests may be in flight against the same
    // tables at once.
    sequence: { concurrent: false },
    // The absorbed files already declare up to 300 000 ms on their heaviest cells (an unfiltered
    // 46,054-row CSV export, and the three-way partition which runs three full activity exports over
    // 79,022 rows). The ambient budget must not be the thing that fails them.
    testTimeout: 300_000,
    hookTimeout: 300_000,
    // The teardown ends the postgres.js pool. Give it room so a lingering connection reports as a
    // real failure rather than as a timeout.
    teardownTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
