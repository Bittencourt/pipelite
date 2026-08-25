#!/usr/bin/env node
/**
 * Build a throwaway database from the migration chain ALONE, prove its CATALOG is the
 * schema this repository claims to ship, and remove the throwaway database again.
 *
 * Run it with `npm run db:check-migrations`. Plain ESM, bare `node`, no `tsx` — `tsx` is
 * not a declared dependency here (see e2e/seed-admin.ts:4-9, which records that this is
 * why `db:seed-activities` is currently unrunnable). Not bash either: this host has
 * neither `psql` nor `pg_dump`.
 *
 * WHY THIS EXISTS
 *   DEPLOY-01. A self-hoster who clones this repository must be able to build a working
 *   database from `drizzle/` with the command the docs print. Until phase 46 they could
 *   not: migration 0006 had lost TWO `CREATE TABLE` statements. One of them,
 *   `import_sessions`, failed loudly — 42P01, the whole chain rolled back, zero tables.
 *   The other, `webhook_deliveries`, failed SILENTLY: nothing referenced it, so
 *   `drizzle-kit migrate` exited 0 and shipped a database that was one table short until
 *   application code inserted into it (src/lib/api/webhooks/deliver.ts:61 does
 *   `db.insert(webhookDeliveries)` — every delivery would have raised 42P01 behind a
 *   green migrate). The static half of this gate is
 *   src/lib/__tests__/migration-chain-integrity.test.ts; this is the behavioural half.
 *
 * WHY THE CATALOG AND NOT A DUMP, AND NEVER AN EXIT CODE
 *   `drizzle-kit migrate` prints the identical `migrations applied successfully!` line
 *   for 0 applied migrations and for 20 — measured, and already written down at
 *   docs/admin/backup-restore.md:200-210. A gate that greps that line, or that reads the
 *   child's exit code and stops there, cannot see the silent class at all. So the exit
 *   code is RECORDED and never branched on: the catalog is asserted either way.
 *   A `pg_dump` text diff is no good either — pg_dump from postgres:16-alpine emits
 *   `\restrict <token>` lines whose token changes on every invocation, plus a SET
 *   preamble, OWNER TO and a version banner, and this host has no pg_dump to run.
 *   Ten catalog queries through the `postgres` driver (already a direct dependency) are
 *   stronger, readable, and run unchanged on the host, in Docker and in CI.
 *
 * HOW IT IS FENCED — AND WHICH FENCE IS ACTUALLY LOAD-BEARING
 *   This script executes CREATE DATABASE / DROP DATABASE against a cluster that also
 *   hosts the operator's real records. It is fenced the way
 *   scripts/dedup-db-test-setup.sh:65-73 and :107-130 are fenced, translated to a
 *   generated name. An earlier version of this header claimed three INDEPENDENT fences.
 *   That was not true, and a false claim of defence-in-depth around DROP DATABASE is
 *   worse than one honest control, so here is the real arrangement:
 *
 *     THE PATTERN IS THE FENCE. `assertScratchName` requires the name to match
 *     /^pipelite_migchk_[a-z0-9_]+$/, re-checked immediately before EVERY interpolation
 *     because a database identifier cannot be a bound parameter. Given a name that
 *     matches, it necessarily begins `pipelite_migchk_`, so the two checks that follow it
 *     — `name === referenceName`, and `FORBIDDEN_SCRATCH_NAMES.includes(name)` — are
 *     SUBSUMED by it for every name of that shape. They are kept because they are free
 *     and because they are the checks that would still hold if the scratch name ever
 *     became configurable (`--scratch-name`, an env var), which is exactly the change
 *     that would otherwise remove the only real control while the header still said
 *     "fenced three ways". They are not independent today. Do not read them as depth.
 *
 *     THE NAMES ARE NOT ALL GENERATED. `sweepLeakedScratchDatabases` feeds names read
 *     from `pg_database` — not built from this file's template — through the same
 *     function before dropping them. That is the call site the pattern check exists for,
 *     and it is why the check is a function rather than a comment.
 *
 *     PROVED, NOT ASSERTED. `assertScratchName` and its two constants are exported and
 *     exercised directly by src/lib/__tests__/migrate-from-zero-fences.test.ts, which
 *     asserts that `pipelite`, `postgres`, `template0`, `template1`, the reference name
 *     and a quote-injection payload each THROW. Three branches that no test could reach
 *     are indistinguishable from three branches that do not work.
 *
 *     IN-SESSION CONFIRMATION, which is genuinely independent of all of the above: every
 *     CREATE/DROP is issued on its own connection to the `postgres` maintenance database
 *     (neither statement can run inside a transaction), and on the scratch connection
 *     itself `select current_database()` must equal the scratch name before a single
 *     assertion runs.
 *
 *   The reference database is opened READ ONLY and only ever receives SELECT.
 *
 * HOW IT REACHES THE SERVER
 *   Over TCP with the `postgres` driver, using DATABASE_URL from the environment or, if
 *   it is not there, from the ONE file drizzle-kit's bundled dotenv reads:
 *   path.resolve(cwd, ".env") (drizzle-kit/bin.cjs:754). So this script and the command
 *   the docs print resolve the same server by the same rule. No `docker exec`, no
 *   `docker compose` (which infers a different project name from a git worktree — see
 *   scripts/dedup-db-test-setup.sh:53-59). The connection string is never an argv
 *   parameter and is never printed: only host, port and database name are logged.
 *
 * HOW TO BREAK IT ON PURPOSE
 *   Both controls edit drizzle/0006_import-sessions-user-id.sql and are restored with
 *   `git checkout --`.
 *     NC-1, the loud class: remove the `CREATE TABLE "import_sessions"` block. Expect the
 *       child migrate to fail with 42P01 `relation "import_sessions" does not exist`, that
 *       text to reach the terminal verbatim, `public` tables 0 while `drizzle`.
 *       __drizzle_migrations survives the rollback, and a non-zero exit here.
 *     NC-2, the silent class, and the one that matters: remove the
 *       `CREATE TABLE "webhook_deliveries"` block AND its CREATE INDEX line. Expect the
 *       child migrate to EXIT 0 and report success while THIS SCRIPT exits 1 on the
 *       table-set assertion, 35 against the snapshot's 36, naming `webhook_deliveries`.
 *       That combination is the whole proof that this gate is stronger than an exit code.
 */

import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import postgres from "postgres"

// ---------------------------------------------------------------------------
// Anti-vacuity floors. Two empty sets compare equal, which is the exact shape of the six
// gates v1.3 shipped that could not fail. Each number below was measured on 2026-08-25
// against this tree; each floor sits BELOW the measurement so ordinary growth does not
// trip it, but a parse that silently yields nothing does.
// ---------------------------------------------------------------------------
const MIN_JOURNAL_ENTRIES = 20 // measured: exactly 20 (0000..0019)
const MIN_SNAPSHOT_TABLES = 36 // measured: exactly 36
const MIN_SNAPSHOT_COLUMNS = 280 // measured: 293 table.column pairs
const MIN_SNAPSHOT_INDEXES = 30 // measured: 41 declared index names

export const SCRATCH_PATTERN = /^pipelite_migchk_[a-z0-9_]+$/
export const FORBIDDEN_SCRATCH_NAMES = ["pipelite", "postgres", "template0", "template1"]

export class Fatal extends Error {}

function fatal(message) {
  throw new Fatal(message)
}

function progress(line) {
  console.log(`-> ${line}`)
}

// ---------------------------------------------------------------------------
// Connection resolution
// ---------------------------------------------------------------------------

/**
 * The DATABASE_URL assignment on ONE line of `.env`, or `null` if the line is not one.
 *
 * TWO PROPERTIES, BOTH LOAD-BEARING.
 *
 * 1. WHOLE-LINE ANCHORING. `E2E_DATABASE_URL=` CONTAINS `DATABASE_URL=` as a substring, so
 *    an unanchored search finds two assignments and can return the wrong one. Plan 46-02
 *    hit exactly this while editing the same file.
 *
 * 2. THE SAME RULES AS THE PARSER THE DOCS' COMMAND ACTUALLY USES. The file header claims
 *    "this script and the command the docs print resolve the same server by the same
 *    rule". The first version of this function did not: it accepted neither dotenv's
 *    `export ` prefix nor dotenv's inline-`#`-comment stripping, both of which occur in
 *    real `.env` files. The consequences were not cosmetic —
 *      - `export DATABASE_URL="…"` worked for `npm run db:migrate` and made this script
 *        fatal with "no DATABASE_URL", telling the operator to create a file they have;
 *      - `DATABASE_URL=postgresql://u:p@localhost:5433/pipelite # dev` produced a value
 *        `new URL()` parses with pathname `/pipelite%20`, so the reference lookup found no
 *        such database and the run reported `SKIPPED: reference equivalence`. A skip caused
 *        by a parser disagreement is the "misconfiguration disguised as an absence" that
 *        `resolveReference` goes to great lengths to prevent everywhere else.
 *    Reference: dotenv 16.5.0's LINE regex as bundled in `drizzle-kit/bin.cjs` — optional
 *    `export`, three value forms, `[^#\r\n]+` for the unquoted one.
 *
 * AMBIGUITY IS A HARD ERROR, NEVER A SKIP. A value that OPENS with a quote and does not
 * close it on the same line is dotenv's multi-line form, which this reader does not
 * implement. Returning the raw text would hand a leading `"` to `new URL()`; returning
 * `null` would report the variable as absent. Both are the failure this whole file is
 * written against, so it throws instead.
 *
 * Exported for src/lib/__tests__/migrate-from-zero-fences.test.ts, which pins every form
 * above against fixtures. A parser this small is exactly the kind that is "obviously
 * right" and silently wrong.
 */
export function databaseUrlFromEnvLine(line) {
  const match =
    /^\s*(?:export\s+)?DATABASE_URL\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\r\n]*?))\s*(?:#.*)?$/.exec(
      line
    )
  if (!match) return null

  // Which alternative fired matters. The unquoted branch is `[^#\r\n]*?`, which happily
  // swallows a value that OPENS with a quote and never closes it — dotenv falls back to
  // the same branch and would hand back a leading `"` as part of the connection string.
  // That is the one place this reader deliberately diverges, and it diverges LOUDLY.
  if (match[3] !== undefined) {
    const raw = match[3].trim()
    if (raw.startsWith('"') || raw.startsWith("'")) {
      fatal(
        `.env assigns DATABASE_URL in a form this script cannot parse: ${line.trim()}\n` +
          "  A quoted value must close its quote on the same line. dotenv's multi-line " +
          "quoted form is not implemented here, and guessing would either hand a stray " +
          "quote to the connection string or report the variable as absent — and an " +
          "absence is what this script refuses to let a misconfiguration disguise itself as."
      )
    }
  }

  const value = (match[1] ?? match[2] ?? match[3] ?? "").trim()
  return value === "" ? null : value
}

/** The first usable `DATABASE_URL` assignment in `.env`, or `null` if the file has none. */
function databaseUrlFromDotenv() {
  const envPath = path.resolve(process.cwd(), ".env")
  if (!existsSync(envPath)) return null
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const value = databaseUrlFromEnvLine(line)
    if (value) return value
  }
  return null
}

function resolveConnectionString() {
  const fromEnv = process.env.DATABASE_URL
  if (fromEnv) return { url: fromEnv, origin: "process.env.DATABASE_URL" }
  const fromFile = databaseUrlFromDotenv()
  if (fromFile) return { url: fromFile, origin: ".env" }
  fatal(
    "no DATABASE_URL. Set it in the environment, or put it in .env — the one file " +
      "drizzle-kit reads. Copy the example and edit the credentials:\n" +
      "  cp .env.example .env"
  )
  return null
}

/** A new connection string for another database on the same server. URL surgery, never
 *  string concatenation — the vitest.db.config.ts:75-79 rule, so credentials, host and
 *  port stay exactly as configured and nothing has to be re-quoted. */
function withDatabase(source, name) {
  const url = new URL(source)
  url.pathname = `/${name}`
  return url.toString()
}

/**
 * The database name a connection string names, PERCENT-DECODED.
 *
 * The decode is load-bearing. `pg_database.datname` holds the real name, so a legitimately
 * encoded name in the URL — `my%20db`, `caf%C3%A9` — was previously compared as the literal
 * `my%20db`, never found, and quietly downgraded the run to the "reference absent" skip.
 * The same string is also what `assertScratchName` compares the scratch name against, so an
 * undecoded value could let a reference database through the check under an alias.
 */
function databaseNameOf(source) {
  return decodeURIComponent(new URL(source).pathname.replace(/^\//, ""))
}

/** Host, port and database — never the credentials. T-46-04-03. */
function describeTarget(source) {
  const url = new URL(source)
  return `${url.hostname}:${url.port || "5432"}/${databaseNameOf(source)}`
}

/**
 * A single-connection client.
 *
 * `database` overrides whatever the URL's path says, and it exists because postgres.js
 * does NOT percent-decode the path: a URL ending `/pipelite%20mig` makes it ask the server
 * for a database literally named `pipelite%20mig`, which fails with `does not exist` even
 * though the database is right there under the name `pipelite mig`. Measured. Every name
 * this script builds itself is `[a-z0-9_]` only and unaffected; the operator-supplied
 * REFERENCE name is the one that can carry a reserved character, so that call site passes
 * the decoded name explicitly.
 */
function connect(url, database) {
  return postgres(url, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 15,
    onnotice: () => {},
    ...(database === undefined ? {} : { database }),
  })
}

// ---------------------------------------------------------------------------
// The name check — re-run immediately before every interpolation, because a database
// identifier cannot be parameterised. T-46-04-01, T-46-04-02.
//
// EXPORTED so src/lib/__tests__/migrate-from-zero-fences.test.ts can call it with
// `pipelite`, `postgres`, the reference name and an injection payload and assert each
// throws. See the fencing note in the file header for which of the three checks below is
// load-bearing and which are subsumed: they are NOT independent, and the header says so.
// ---------------------------------------------------------------------------
export function assertScratchName(name, referenceName) {
  if (!SCRATCH_PATTERN.test(name)) {
    fatal(
      `refusing to touch "${name}": a scratch database name must match ` +
        `${SCRATCH_PATTERN}. This script provisions throwaway databases and nothing else.`
    )
  }
  if (name === referenceName) {
    fatal(
      `refusing to touch "${name}": it is the reference database, which this script only ` +
        "ever reads with SELECT."
    )
  }
  if (FORBIDDEN_SCRATCH_NAMES.includes(name)) {
    fatal(
      `refusing to touch "${name}": it is a reserved or development database name. The ` +
        "scratch database must be a generated pipelite_migchk_* name."
    )
  }
}

// ---------------------------------------------------------------------------
// The ten catalog dimensions. Exactly the queries measured in 46-RESEARCH § Code
// Examples 3, issued through the driver rather than psql. Each returns one text column
// `v`; both sides are sorted and diffed by value, never by count.
// ---------------------------------------------------------------------------

// The column dimension deliberately omits one information_schema.columns attribute:
// ordinal_position. Physical column order differs on `activities` and `deals` because the
// live database received several columns through db:push/ALTER in a different order than
// the chain adds them — same columns, same types, same defaults. Drizzle always names
// columns, so the order is not a defect; including it makes this gate permanently red for
// a reason that does not matter, and the next person to see it red will "fix" it by
// weakening the whole comparison. Do not re-add it.
const CATALOG_QUERIES = {
  tables:
    "select table_name::text as v from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
  columns:
    "select (table_name||'|'||column_name||'|'||data_type||'|'||coalesce(character_maximum_length::text,'-')||'|'||coalesce(numeric_precision::text,'-')||'|'||is_nullable||'|'||coalesce(column_default,'-')||'|'||coalesce(is_generated,'-')||'|'||coalesce(generation_expression,'-'))::text as v from information_schema.columns where table_schema = 'public'",
  indexes:
    "select (indexname||' :: '||indexdef)::text as v from pg_indexes where schemaname = 'public'",
  constraints:
    "select (conrelid::regclass||'|'||conname||'|'||pg_get_constraintdef(oid))::text as v from pg_constraint where connamespace = 'public'::regnamespace",
  enums:
    "select (t.typname||'='||e.enumlabel)::text as v from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public'",
  functions:
    "select (p.proname||'|'||pg_get_function_identity_arguments(p.oid))::text as v from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'",
  extensions: "select extname::text as v from pg_extension",
  triggers:
    "select (tgrelid::regclass||'|'||tgname)::text as v from pg_trigger where not tgisinternal",
  sequences:
    "select sequence_name::text as v from information_schema.sequences where sequence_schema = 'public'",
  views:
    "select table_name::text as v from information_schema.views where table_schema = 'public'",
}

/**
 * ANTI-VACUITY FLOORS FOR ASSERTION SET B — the half this file's own doctrine (see the
 * `MIN_*` block at the top) originally applied only to the snapshot side.
 *
 * Set B runs the SAME query string against both databases, so a defect that makes a query
 * return zero rows on BOTH sides reports `IDENTICAL`. One typo — `table_schema = 'publik'`,
 * `nspname = 'pubic'`, a `where` clause that stops matching after a Postgres upgrade —
 * silently converts a dimension into a permanent pass, and the printed table then reports
 * it as evidence. That is precisely the "two empty sets compare equal" shape v1.3 shipped
 * six of.
 *
 * The floor is asserted against the REFERENCE side, which is a real, populated database by
 * the time we get here (branches 3-5 of `resolveReference` refuse anything less). Each
 * number sits BELOW the value measured on 2026-08-25 against `pipelite` so ordinary growth
 * — and legitimate shrinkage — does not trip it, but a query that stopped matching does.
 *
 * The three genuine zeroes are NOT a weakness of the floor, they are a fact about this
 * schema: this application declares no triggers, no standalone sequences (drizzle uses
 * `gen_random_uuid()` and identity-free text keys, not `serial`) and no views. A zero floor
 * cannot catch a broken query for those three, so they are labelled `IDENTICAL (both
 * empty)` in the printed table instead of being allowed to read as verification. If one of
 * them ever gains a member, RAISE ITS FLOOR — that is the moment it becomes load-bearing.
 */
const DIMENSION_FLOORS = {
  tables: 30, // measured 36
  columns: 250, // measured 293
  indexes: 60, // measured 81
  constraints: 70, // measured 83
  enums: 6, // measured 9
  functions: 30, // measured 38
  extensions: 2, // measured 3 (plpgsql, pgcrypto, uuid-ossp)
  triggers: 0, // measured 0 — genuinely empty, see above
  sequences: 0, // measured 0 — genuinely empty, see above
  views: 0, // measured 0 — genuinely empty, see above
}

async function catalogValues(sql, query) {
  const rows = await sql.unsafe(query)
  return rows.map((row) => String(row.v)).sort()
}

/** Public BASE TABLE count. The `public` qualifier is load-bearing: after a FAILED
 *  migrate the `drizzle` schema still holds __drizzle_migrations, because CREATE SCHEMA
 *  and the ledger table run OUTSIDE session.transaction
 *  (drizzle-orm/pg-core/dialect.js:54-55 vs :60). An unqualified count returns 1 where the
 *  honest answer is 0, and gets "fixed" by relaxing it. */
async function publicTableCount(sql) {
  const rows = await sql.unsafe(
    "select count(*)::int as v from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'"
  )
  return rows[0].v
}

/** What survived a rolled-back chain, read from pg_catalog so this diagnostic cannot be
 *  confused with the assertion above. */
async function drizzleLedgerState(sql) {
  const tables = await sql.unsafe(
    "select count(*)::int as v from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'drizzle' and c.relkind = 'r'"
  )
  let rows = null
  if (tables[0].v > 0) {
    const present = await sql.unsafe(
      "select to_regclass('drizzle.__drizzle_migrations') is not null as v"
    )
    if (present[0].v) {
      const counted = await sql.unsafe(
        "select count(*)::int as v from drizzle.__drizzle_migrations"
      )
      rows = counted[0].v
    }
  }
  return { tables: tables[0].v, ledgerRows: rows }
}

function setDifference(expected, actual) {
  const actualSet = new Set(actual)
  const expectedSet = new Set(expected)
  return {
    missing: expected.filter((v) => !actualSet.has(v)),
    unexpected: actual.filter((v) => !expectedSet.has(v)),
  }
}

/**
 * Differing values, by NAME and never as a bare count, capped.
 *
 * The cap is not cosmetic. When the chain aborts, every dimension differs by its whole
 * contents at once — 293 columns, 83 constraints, 38 functions — and an uncapped report
 * buries the one line that actually diagnoses the run (the child's 42P01) under 50KB of
 * derived noise. The count is always stated in full; only the enumeration is trimmed.
 */
const DIFF_SAMPLE_LIMIT = 20

function sampleDifference(values, prefix) {
  if (values.length === 0) return []
  const shown = values.slice(0, DIFF_SAMPLE_LIMIT).map((v) => `      ${prefix}: ${v}`)
  if (values.length > DIFF_SAMPLE_LIMIT) {
    shown.push(`      … and ${values.length - DIFF_SAMPLE_LIMIT} more`)
  }
  return shown
}

// ---------------------------------------------------------------------------
// The always-available reference: the LAST journal entry's snapshot.
// ---------------------------------------------------------------------------
function loadSnapshotReference() {
  const journalPath = path.resolve(process.cwd(), "drizzle", "meta", "_journal.json")
  if (!existsSync(journalPath)) {
    fatal(`${journalPath} does not exist — run this from the repository root.`)
  }
  const journal = JSON.parse(readFileSync(journalPath, "utf8"))
  const entries = Array.isArray(journal.entries) ? journal.entries : []
  if (entries.length < MIN_JOURNAL_ENTRIES) {
    fatal(
      `drizzle/meta/_journal.json parsed ${entries.length} entries, floor is ` +
        `${MIN_JOURNAL_ENTRIES} (measured 20). Either the journal shrank or this script ` +
        "stopped being able to read it — both make every assertion below vacuous."
    )
  }
  const last = entries[entries.length - 1]
  const idx = String(last.idx).padStart(4, "0")
  const snapshotPath = path.resolve(process.cwd(), "drizzle", "meta", `${idx}_snapshot.json`)
  if (!existsSync(snapshotPath)) {
    fatal(`journal's last entry is idx ${last.idx} but ${snapshotPath} does not exist.`)
  }
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"))

  const tables = []
  const columnPairs = []
  const columnNullability = []
  const indexNames = []
  for (const [key, table] of Object.entries(snapshot.tables ?? {})) {
    const name = table.name ?? key.replace(/^public\./, "")
    tables.push(name)
    for (const [column, spec] of Object.entries(table.columns ?? {})) {
      columnPairs.push(`${name}.${column}`)
      // NULLABILITY is carried in a SEPARATE list rather than folded into the pair above,
      // so a mismatch reports as "this column is nullable and should not be" instead of
      // as one absent column plus one unexpected column — a diagnosis that names the
      // wrong defect. The snapshot already holds this; discarding it was WR-02's point.
      columnNullability.push(`${name}.${column}|${spec.notNull === true ? "NOT NULL" : "NULL"}`)
    }
    for (const index of Object.keys(table.indexes ?? {})) indexNames.push(index)
  }

  // ANTI-VACUITY for the nullability dimension specifically. If the snapshot's shape ever
  // changes so `spec.notNull` reads `undefined` everywhere, every entry becomes "NULL",
  // the comparison still runs, and it would go red for the wrong reason on the first run
  // and then be "fixed" by deleting it. Both values must be present in a 293-column
  // schema; measured 2026-08-25: 173 NOT NULL / 120 NULL.
  const notNullCount = columnNullability.filter((v) => v.endsWith("|NOT NULL")).length
  if (notNullCount === 0 || notNullCount === columnNullability.length) {
    fatal(
      `${path.basename(snapshotPath)} parsed ${notNullCount} NOT NULL columns out of ` +
        `${columnNullability.length}. A snapshot in which EVERY column has the same ` +
        "nullability is a parse failure, not a schema — `notNull` has moved or changed " +
        "shape, and the nullability comparison below would be measuring nothing."
    )
  }

  if (tables.length < MIN_SNAPSHOT_TABLES) {
    fatal(
      `${path.basename(snapshotPath)} parsed ${tables.length} tables, floor is ` +
        `${MIN_SNAPSHOT_TABLES} (measured 36). A snapshot that parses to nothing compares ` +
        "equal to an empty database."
    )
  }
  if (columnPairs.length < MIN_SNAPSHOT_COLUMNS) {
    fatal(
      `${path.basename(snapshotPath)} parsed ${columnPairs.length} table.column pairs, ` +
        `floor is ${MIN_SNAPSHOT_COLUMNS} (measured 293).`
    )
  }
  if (indexNames.length < MIN_SNAPSHOT_INDEXES) {
    fatal(
      `${path.basename(snapshotPath)} parsed ${indexNames.length} declared index names, ` +
        `floor is ${MIN_SNAPSHOT_INDEXES} (measured 41).`
    )
  }

  return {
    file: path.relative(process.cwd(), snapshotPath),
    journalEntries: entries.length,
    tables: tables.sort(),
    columnPairs: columnPairs.sort(),
    columnNullability: columnNullability.sort(),
    indexNames: indexNames.sort(),
  }
}

// ---------------------------------------------------------------------------
// The from-zero build
// ---------------------------------------------------------------------------
/** The running child, so an interrupt can end it instead of orphaning it. */
let activeChild = null
/** Set by the SIGINT/SIGTERM handlers at the bottom of this file. */
let interrupted = false
/**
 * The scratch database this run owns, from the moment it may exist on the server.
 * Module scope because the SECOND interrupt takes `process.exit(130)`, which bypasses
 * main's `finally` — that path has to be able to name what it is leaving behind.
 */
let scratchDatabaseName = null
/**
 * True only after a `DROP DATABASE` that actually RETURNED. The exit messages read this
 * instead of asserting an outcome nothing observed: the `finally` swallows a failed DROP
 * behind a `WARNING:`, and the interrupted branch used to print "the scratch database was
 * removed on the way out" unconditionally, immediately after it — two contradicting lines
 * in one output with the reassuring one last.
 */
let scratchRemoved = false

function runDrizzleMigrate(scratchUrl) {
  const bin = path.resolve(process.cwd(), "node_modules", ".bin", "drizzle-kit")
  if (!existsSync(bin)) {
    fatal(`${bin} does not exist. Install dependencies first:\n  npm install`)
  }
  return new Promise((resolve, reject) => {
    // DATABASE_URL travels in the child's ENVIRONMENT, never on its argv: a connection
    // string on a command line is visible in `ps`, in shell history and in CI logs.
    // drizzle-kit's bundled dotenv uses `override: false`, so a value already present in
    // the child's environment WINS over .env — that is the mechanism that aims the CLI at
    // the scratch database without editing a single file.
    const child = spawn(bin, ["migrate"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: scratchUrl },
      stdio: ["ignore", "pipe", "pipe"],
    })
    // stdout AND stderr are echoed through verbatim. On the failing path `42P01` IS the
    // diagnosis; swallowing stderr destroys the only useful output the failure produces.
    activeChild = child
    // drizzle-kit's last line carries no trailing newline, so without this the next
    // progress line is glued onto `migrations applied successfully!`.
    let atLineStart = true
    const echo = (stream, chunk) => {
      atLineStart = chunk[chunk.length - 1] === 0x0a
      stream.write(chunk)
    }
    child.stdout.on("data", (chunk) => echo(process.stdout, chunk))
    child.stderr.on("data", (chunk) => echo(process.stderr, chunk))
    child.on("error", (error) => {
      activeChild = null
      reject(error)
    })
    child.on("close", (code, signal) => {
      activeChild = null
      if (!atLineStart) process.stdout.write("\n")
      resolve({ code: code ?? -1, signal })
    })
  })
}

// ---------------------------------------------------------------------------
// Reaping databases leaked by earlier runs.
//
// Every run generates a fresh unique name, so the pre-emptive `DROP DATABASE IF EXISTS`
// in main only ever targets THIS run's name — nothing ever reaped a previously leaked one,
// and they accumulate silently on the same cluster that holds the operator's records. They
// are leaked by exactly one path: a SECOND interrupt, which takes `process.exit(130)` and
// bypasses main's `finally` entirely. That path is documented rather than removed (an
// operator pressing Ctrl-C twice means it), so this sweep is what makes it recoverable.
//
// It is also the first call site that hands `assertScratchName` a name this script did NOT
// build from its own constant template — see the fencing note in the file header.
// ---------------------------------------------------------------------------

/**
 * How old a leaked database must look before it is swept, in milliseconds.
 *
 * LOAD-BEARING, not politeness. Two instances of this script can legitimately run against
 * one cluster (a developer and CI on the same host, two worktrees, `npm run` twice). An
 * unconditional sweep would `DROP ... WITH (FORCE)` the OTHER run's scratch database out
 * from under it mid-migrate — turning a leak-cleanup into a much worse failure, and one
 * that would look like a flaky migration chain. The generated name carries `Date.now()`,
 * so anything younger than this is presumed live; the connection check below is the second
 * half of the same guard.
 */
const SWEEP_MIN_AGE_MS = 60 * 60 * 1000 // 1 hour

async function sweepLeakedScratchDatabases(admin, referenceName, currentName) {
  // `\\_` escapes LIKE's single-character wildcard: unescaped, `_` matches ANY character
  // and the pattern would reach names this script does not own.
  const rows = await admin.unsafe(
    "select datname::text as v, " +
      "(select count(*)::int from pg_stat_activity a where a.datname = d.datname) as backends " +
      "from pg_database d where datname like 'pipelite\\_migchk\\_%' order by datname"
  )
  const now = Date.now()
  for (const row of rows) {
    const name = String(row.v)
    if (name === currentName) continue

    // `pipelite_migchk_<pid>_<millis>`. An unparseable tail is left alone rather than
    // guessed at — this script removes only what it can prove it owns.
    const stamp = Number(/_(\d+)$/.exec(name)?.[1])
    if (!Number.isFinite(stamp) || now - stamp < SWEEP_MIN_AGE_MS) continue
    if (row.backends > 0) continue

    // The name came from the catalog, NOT from this script's template. This is the call
    // site the fences exist for.
    assertScratchName(name, referenceName)
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    progress(`swept ${name}, leaked by an earlier interrupted run`)
  }
}

// ---------------------------------------------------------------------------
// Reference selection. This must never become a silent pass, and it must behave in CI,
// where no reference database exists at all.
// ---------------------------------------------------------------------------
async function resolveReference({ admin, sourceUrl, requireReference, snapshotTableCount }) {
  const explicit = process.env.REFERENCE_DATABASE_URL

  if (explicit) {
    // Branch 1. The caller named a reference. Unreachable for ANY reason is FATAL — a
    // misconfiguration must never be able to disguise itself as an absence.
    const name = databaseNameOf(explicit)
    progress(`reference: REFERENCE_DATABASE_URL -> ${describeTarget(explicit)}`)
    let sql
    try {
      sql = connect(explicit, name)
      const count = await publicTableCount(sql)
      if (count < snapshotTableCount) {
        await sql.end()
        fatal(
          `REFERENCE_DATABASE_URL names ${name}, which has ${count} public tables against ` +
            `the snapshot's ${snapshotTableCount}. An explicitly requested reference that ` +
            "is empty or partial is a misconfiguration, not an absence."
        )
      }
      return { mode: "run", name, sql, count }
    } catch (error) {
      if (sql) await sql.end().catch(() => {})
      if (error instanceof Fatal) throw error
      fatal(
        `REFERENCE_DATABASE_URL (${describeTarget(explicit)}) is unreachable: ` +
          `${error.message}. An unreachable explicit reference is never a skip.`
      )
    }
  }

  // Branch 2. The candidate is the database DATABASE_URL names.
  //
  // BOUND, not interpolated. Unlike the CREATE/DROP statements — where the name is an
  // IDENTIFIER and cannot be a parameter — this is a WHERE clause comparing a VALUE, which
  // postgres.js binds natively. The manual `''` doubling it replaced was correct only while
  // `standard_conforming_strings` is `on`; a server- or role-level
  // `SET standard_conforming_strings = off` re-enables backslash escapes and defeats it.
  // There is no reason to carry that assumption when the driver's second argument exists.
  const name = databaseNameOf(sourceUrl)
  const existing = await admin.unsafe("select 1 as v from pg_database where datname = $1", [
    name,
  ])

  if (existing.length === 0) {
    // Branch 3.
    const line = `SKIPPED: reference equivalence — database ${name} does not exist`
    if (requireReference) {
      fatal(`${line}, and --require-reference was given.`)
    }
    console.log(line)
    return { mode: "skipped", name, reason: "absent" }
  }

  const url = withDatabase(sourceUrl, name)
  let sql
  try {
    sql = connect(url, name)
    const count = await publicTableCount(sql)

    if (count === 0) {
      // Branch 4 — the branch CI takes, where the service container hands us the
      // `postgres` maintenance database.
      await sql.end()
      const line =
        `SKIPPED: reference equivalence — ${name} has 0 public tables, so it is not a ` +
        "populated reference (this is the expected state in CI)"
      if (requireReference) {
        fatal(`${line}, and --require-reference was given.`)
      }
      console.log(line)
      return { mode: "skipped", name, reason: "empty" }
    }

    if (count < snapshotTableCount) {
      // Branch 5 — ALWAYS fatal, with or without --require-reference. A half-populated
      // reference is a misconfiguration, and treating a misconfiguration as an absence is
      // exactly how a skip turns into a silent pass.
      await sql.end()
      fatal(
        `reference ${name} has ${count} public tables against the snapshot's ` +
          `${snapshotTableCount}. That is a partially-populated database, not an absent ` +
          "one, and this script will not pretend it is missing. Point " +
          "REFERENCE_DATABASE_URL at a complete database, or migrate this one."
      )
    }

    // Branch 6.
    progress(`reference: DATABASE_URL -> ${describeTarget(url)} (${count} public tables)`)
    return { mode: "run", name, sql, count }
  } catch (error) {
    if (sql) await sql.end().catch(() => {})
    if (error instanceof Fatal) throw error
    // Branch 7. Auth failure, connection refused, wrong port — always fatal. Those are the
    // shapes that would let a misconfiguration disguise itself as an absent reference.
    fatal(
      `reference ${name} exists but could not be read (${error.message}). Authentication ` +
        "and connection failures are never treated as an absent reference."
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const problems = []

function record(problem) {
  problems.push(problem)
}

async function main() {
  const requireReference =
    process.argv.slice(2).includes("--require-reference") ||
    process.env.npm_config_require_reference === "true"

  const { url: sourceUrl, origin } = resolveConnectionString()
  const REFERENCE_DB = process.env.REFERENCE_DATABASE_URL
    ? databaseNameOf(process.env.REFERENCE_DATABASE_URL)
    : databaseNameOf(sourceUrl)

  const scratchName = `pipelite_migchk_${process.pid}_${Date.now()}`
  assertScratchName(scratchName, REFERENCE_DB)

  const maintenanceUrl = withDatabase(sourceUrl, "postgres")
  const scratchUrl = withDatabase(sourceUrl, scratchName)

  progress(`connection: ${describeTarget(sourceUrl)} (from ${origin})`)
  progress(`scratch database: ${scratchName}`)
  progress(`reference database (read with SELECT only): ${REFERENCE_DB}`)
  if (requireReference) progress("--require-reference: a skip is an error in this run")

  const snapshot = loadSnapshotReference()
  progress(
    `snapshot reference: ${snapshot.file} — ${snapshot.tables.length} tables, ` +
      `${snapshot.columnPairs.length} table.column pairs, ${snapshot.indexNames.length} ` +
      `declared index names, ${snapshot.journalEntries} journal entries`
  )

  const admin = connect(maintenanceUrl)
  let scratch = null
  let reference = null

  try {
    await sweepLeakedScratchDatabases(admin, REFERENCE_DB, scratchName)

    // A previously leaked database must not be able to poison this run.
    assertScratchName(scratchName, REFERENCE_DB)
    await admin.unsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`)

    // Set BEFORE the CREATE, not after: an interrupt landing mid-CREATE can leave the
    // database behind, and a name printed for a database that turned out not to exist
    // costs nothing (the statement suggested is `IF EXISTS`).
    scratchDatabaseName = scratchName
    assertScratchName(scratchName, REFERENCE_DB)
    await admin.unsafe(`CREATE DATABASE "${scratchName}"`)
    progress(`created ${scratchName}`)

    progress("running `drizzle-kit migrate` against the scratch database — output verbatim:")
    const migrate = await runDrizzleMigrate(scratchUrl)
    // RECORDED, never branched on. An exit-code-shaped check is vacuous for the silent
    // class by construction: that is precisely the defect this gate exists to catch.
    progress(`migrate exit code: ${migrate.code}${migrate.signal ? ` (${migrate.signal})` : ""}`)
    if (interrupted) fatal("interrupted — abandoning the run, the scratch database goes with it")

    scratch = connect(scratchUrl)

    // Fence 3, in-session: prove we are where we think we are before asserting anything.
    const current = await scratch.unsafe("select current_database()::text as v")
    if (current[0].v !== scratchName) {
      fatal(
        `connected to "${current[0].v}" but expected the scratch database ` +
          `"${scratchName}". Refusing to assert against an unknown database.`
      )
    }

    const built = await publicTableCount(scratch)
    const ledger = await drizzleLedgerState(scratch)
    progress(
      `public tables: ${built} | drizzle schema tables: ${ledger.tables} | ` +
        `drizzle.__drizzle_migrations rows: ${ledger.ledgerRows ?? "n/a"}`
    )

    // -----------------------------------------------------------------------
    // Assertion set A — snapshot equivalence. Unconditional; runs everywhere, CI included.
    // -----------------------------------------------------------------------
    const builtTables = await catalogValues(scratch, CATALOG_QUERIES.tables)
    const tableDiff = setDifference(snapshot.tables, builtTables)
    progress(
      `A/tables: ${builtTables.length} built / ${snapshot.tables.length} declared — ` +
        (tableDiff.missing.length || tableDiff.unexpected.length ? "DIFFERS" : "IDENTICAL")
    )
    if (tableDiff.missing.length) {
      record(
        `the migration chain does not create ${tableDiff.missing.length} table(s) the ` +
          `snapshot declares: ${tableDiff.missing.join(", ")}. A from-zero install is ` +
          "short these tables; application code touching them raises 42P01 at runtime, " +
          "behind a migrate that may well have exited 0."
      )
    }
    if (tableDiff.unexpected.length) {
      record(
        `the migration chain creates ${tableDiff.unexpected.length} table(s) the snapshot ` +
          `does not declare: ${tableDiff.unexpected.join(", ")}.`
      )
    }

    const builtColumnRows = await scratch.unsafe(
      "select (table_name||'.'||column_name)::text as v from information_schema.columns where table_schema = 'public'"
    )
    const builtColumns = builtColumnRows.map((row) => String(row.v)).sort()
    const columnDiff = setDifference(snapshot.columnPairs, builtColumns)
    progress(
      `A/columns: ${builtColumns.length} built / ${snapshot.columnPairs.length} declared — ` +
        (columnDiff.missing.length || columnDiff.unexpected.length ? "DIFFERS" : "IDENTICAL")
    )
    if (columnDiff.missing.length) {
      record(
        `${columnDiff.missing.length} table.column pair(s) the snapshot declares are ` +
          `absent from the built database:\n` +
          sampleDifference(columnDiff.missing, "absent").join("\n")
      )
    }
    if (columnDiff.unexpected.length) {
      record(
        `${columnDiff.unexpected.length} table.column pair(s) exist in the built database ` +
          `that the snapshot does not declare:\n` +
          sampleDifference(columnDiff.unexpected, "unexpected").join("\n")
      )
    }

    // NULLABILITY. WR-02: on the required CI check, set A used to compare table NAMES,
    // column NAMES and index NAMES and nothing else — so a from-zero build that produced a
    // column without its NOT NULL passed green, and `ci.yml` called that "fully
    // authoritative". The snapshot carries `notNull` per column; this reads it. Types,
    // defaults, foreign keys and index definitions are still name-only in set A and are
    // compared only against a reference database — `ci.yml` now says so precisely, and
    // BACKLOG MIG-02 carries the rest.
    const builtNullabilityRows = await scratch.unsafe(
      "select (table_name||'.'||column_name||'|'||case when is_nullable = 'NO' then 'NOT NULL' else 'NULL' end)::text as v from information_schema.columns where table_schema = 'public'"
    )
    const builtNullability = builtNullabilityRows.map((row) => String(row.v)).sort()
    const nullabilityDiff = setDifference(snapshot.columnNullability, builtNullability)
    // Reported against the columns BOTH sides agree exist, so a missing column is diagnosed
    // once (above) rather than a second time here under a misleading heading.
    const builtColumnSet = new Set(builtColumns)
    const nullabilityMismatches = nullabilityDiff.missing.filter((v) =>
      builtColumnSet.has(v.slice(0, v.lastIndexOf("|")))
    )
    progress(
      `A/nullability: ${builtNullability.length} built / ` +
        `${snapshot.columnNullability.length} declared — ` +
        (nullabilityMismatches.length ? "DIFFERS" : "IDENTICAL")
    )
    if (nullabilityMismatches.length) {
      record(
        `${nullabilityMismatches.length} column(s) exist in the built database with the ` +
          `WRONG nullability. A from-zero install accepts (or rejects) rows the schema ` +
          `does not, and nothing fails until production data does:\n` +
          sampleDifference(nullabilityMismatches, "snapshot declares").join("\n")
      )
    }

    // SUBSET, not equality: pg_indexes also reports primary-key and unique-constraint
    // indexes, which the snapshot's `indexes` map never lists. Measured: 41 declared
    // against 81 present.
    const builtIndexRows = await scratch.unsafe(
      "select indexname::text as v from pg_indexes where schemaname = 'public'"
    )
    const builtIndexNames = new Set(builtIndexRows.map((row) => String(row.v)))
    const missingIndexes = snapshot.indexNames.filter((name) => !builtIndexNames.has(name))

    // THE OTHER DIRECTION. Tables and columns are checked both ways; indexes were checked
    // one way only, so an index the chain creates and the schema no longer declares — the
    // Phase 33 D-06 failure mode, a hand-written index surviving a later `generate` —
    // was invisible here. Constraint-backed indexes (`*_pkey`, and the unique constraints
    // pg_indexes reports but the snapshot's `indexes` map never lists) are excluded by
    // consulting pg_constraint rather than by matching on a name suffix, which would also
    // swallow a genuinely stray index that happened to end in `_pkey`.
    const constraintIndexRows = await scratch.unsafe(
      "select c.conindid::regclass::text as v from pg_constraint c where c.connamespace = 'public'::regnamespace and c.conindid <> 0"
    )
    const constraintIndexNames = new Set(constraintIndexRows.map((row) => String(row.v)))
    const declaredIndexNames = new Set(snapshot.indexNames)
    const extraIndexes = [...builtIndexNames]
      .filter((name) => !declaredIndexNames.has(name) && !constraintIndexNames.has(name))
      .sort()

    progress(
      `A/indexes: ${snapshot.indexNames.length - missingIndexes.length} / ` +
        `${snapshot.indexNames.length} snapshot index names present, ` +
        `${extraIndexes.length} unaccounted-for ` +
        `(${builtIndexNames.size} indexes in total, ${constraintIndexNames.size} ` +
        `constraint-backed) — ` +
        (missingIndexes.length || extraIndexes.length ? "DIFFERS" : "IDENTICAL")
    )
    if (missingIndexes.length) {
      record(
        `${missingIndexes.length} index name(s) the snapshot declares are absent from the ` +
          `built database:\n` + sampleDifference(missingIndexes, "absent").join("\n")
      )
    }
    if (extraIndexes.length) {
      record(
        `${extraIndexes.length} index(es) exist in the built database that neither the ` +
          `snapshot declares nor a constraint backs. A hand-written index in a migration ` +
          `is dropped silently by the next \`drizzle-kit generate\` (Phase 33, D-06):\n` +
          sampleDifference(extraIndexes, "unexpected").join("\n")
      )
    }

    // -----------------------------------------------------------------------
    // Assertion set B — reference equivalence, when a reference is reachable.
    // -----------------------------------------------------------------------
    reference = await resolveReference({
      admin,
      sourceUrl,
      requireReference,
      snapshotTableCount: snapshot.tables.length,
    })

    if (reference.mode === "run") {
      const rows = []
      for (const [dimension, query] of Object.entries(CATALOG_QUERIES)) {
        const referenceValues = await catalogValues(reference.sql, query)
        const scratchValues = await catalogValues(scratch, query)
        const diff = setDifference(referenceValues, scratchValues)
        const identical = diff.missing.length === 0 && diff.unexpected.length === 0

        // THE FLOOR, asserted against the populated reference before the verdict is read.
        const floor = DIMENSION_FLOORS[dimension]
        if (floor === undefined) {
          record(
            `catalog dimension "${dimension}" has no entry in DIMENSION_FLOORS. A dimension ` +
              "added without a measured floor can report IDENTICAL because its query matches " +
              "nothing on both sides. Measure it against a populated database and record it."
          )
        } else if (referenceValues.length < floor) {
          record(
            `catalog dimension "${dimension}" returned ${referenceValues.length} rows from ` +
              `${reference.name}, below the measured floor of ${floor}. ${reference.name} is a ` +
              "populated reference, so this means the QUERY stopped matching, not that the " +
              `schema shrank — and a query that matches nothing on both sides reports ` +
              `IDENTICAL. This dimension's verdict is meaningless until the query is fixed. ` +
              "(If the schema legitimately shrank, lower the floor and record the new " +
              "measurement; this is a tripwire, not a schema-size assertion.)"
          )
        }

        rows.push({
          dimension,
          reference: referenceValues.length,
          built: scratchValues.length,
          // A zero-vs-zero dimension is an empty-set identity, not evidence. Saying so in
          // the table is the difference between "this dimension is genuinely empty" and
          // "this query stopped working" for the next person reading the output.
          verdict: identical
            ? referenceValues.length === 0
              ? "IDENTICAL (both empty — proves nothing)"
              : "IDENTICAL"
            : "DIFFERS",
        })
        if (!identical) {
          record(
            `catalog dimension "${dimension}" differs between ${reference.name} and the ` +
              `migration-built database — ${diff.missing.length} only in ${reference.name}, ` +
              `${diff.unexpected.length} only in the built database:\n` +
              [
                ...sampleDifference(diff.missing, `only in ${reference.name}`),
                ...sampleDifference(diff.unexpected, "only in the built database"),
              ].join("\n")
          )
        }
      }
      progress(`B/reference equivalence against ${reference.name}:`)
      console.log(
        `   ${"dimension".padEnd(12)}${"reference".padStart(10)}${"from-zero".padStart(11)}  verdict`
      )
      for (const row of rows) {
        console.log(
          `   ${row.dimension.padEnd(12)}${String(row.reference).padStart(10)}` +
            `${String(row.built).padStart(11)}  ${row.verdict}`
        )
      }
    }
  } finally {
    // Both the DROP and every client.end() live here, so a throw anywhere above — the
    // migrate step included — still removes the scratch database. There is no in-repo
    // analog for this combination: shell `trap` appears nowhere in scripts/, and
    // e2e/seed-admin.ts:94-96 closes a client but provisions nothing.
    if (scratch) await scratch.end().catch(() => {})
    if (reference?.sql) await reference.sql.end().catch(() => {})
    try {
      assertScratchName(scratchName, REFERENCE_DB)
      await admin.unsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`)
      scratchRemoved = true
      progress(`removed ${scratchName}`)
    } catch (error) {
      console.error(
        `WARNING: could not remove the scratch database ${scratchName}: ${error.message}. ` +
          `Remove it with: DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE);`
      )
    }
    await admin.end().catch(() => {})
  }

  if (interrupted) {
    console.error("")
    console.error(
      "FATAL: interrupted before this run could reach a verdict; nothing was proved."
    )
    // Conditional on what was OBSERVED. This used to assert the removal unconditionally,
    // directly after a `finally` that only prints a `WARNING:` when the DROP fails — so the
    // two lines could contradict each other in one output, with the reassuring one last.
    console.error(
      scratchRemoved
        ? `The scratch database ${scratchName} was removed on the way out.`
        : `The scratch database ${scratchName} may still exist — remove it with: ` +
          `DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE);`
    )
    process.exitCode = 130
    return
  }

  if (problems.length) {
    console.error("")
    for (const problem of problems) {
      console.error(`FATAL: ${problem}`)
    }
    console.error("")
    console.error(
      `FATAL: the migration chain does NOT build the schema this repository declares ` +
        `(${problems.length} problem(s) above). Note that the child migrate's exit code is ` +
        "reported above and is deliberately NOT what this verdict is based on — a chain " +
        "missing a table nothing else references exits 0 and still ships a broken install."
    )
    process.exitCode = 1
    return
  }

  console.log("OK: the migration chain builds a complete schema from zero")
}

// Signal handling exists so an operator's Ctrl-C does not leak a database: without it the
// process dies before `finally` runs. The handler lets main's own finally do the work by
// closing the event loop path it is already on.
function registerSignalHandlers() {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      if (interrupted) {
        // The one path that bypasses main's `finally`. It is kept — an operator who
        // presses Ctrl-C twice is asking to leave NOW and must not be made to wait on a
        // DROP against an unresponsive server — but it no longer leaves silently. The
        // statement that removes the database is printed, and the sweep at the top of the
        // next run reaps it without being asked.
        if (scratchDatabaseName && !scratchRemoved) {
          console.error(
            `\n-> second ${signal} — exiting immediately. The scratch database was NOT ` +
              `removed:\n   DROP DATABASE IF EXISTS "${scratchDatabaseName}" WITH (FORCE);` +
              `\n   (the next run of this script sweeps leftover pipelite_migchk_* databases)`
          )
        }
        process.exit(130)
      }
      interrupted = true
      console.error(`\n-> ${signal} received — removing the scratch database before exiting`)
      process.exitCode = 130
      if (activeChild) activeChild.kill("SIGTERM")
    })
  }
}

// ---------------------------------------------------------------------------
// Invocation guard.
//
// `import.meta.main` is TRUE only when node was pointed at this file, and vitest's module
// runner sets it FALSE (measured, both). That is what lets the fence unit test import
// `assertScratchName` without provisioning a database. Node has defined it since 24.2 and
// package.json's engines floor is >= 24.12, so `undefined` means a runtime this script has
// never been tested under — and a check that silently does nothing is strictly worse than
// a check that fails, so that case is FATAL rather than a quiet return.
// ---------------------------------------------------------------------------
if (import.meta.main === true) {
  registerSignalHandlers()
  try {
    await main()
  } catch (error) {
    if (error instanceof Fatal) {
      console.error(`FATAL: ${error.message}`)
    } else {
      console.error(`FATAL: ${error?.stack ?? error}`)
    }
    process.exitCode = interrupted ? 130 : 1
  }
} else if (import.meta.main !== false) {
  console.error(
    "FATAL: this runtime does not define import.meta.main, so migrate-from-zero.mjs cannot " +
      "tell whether it was invoked or imported and refuses to guess. package.json requires " +
      `node >= 24.12.0; this is ${process.version}.`
  )
  process.exitCode = 1
}
