---
phase: 46-migration-chain-toolchain-floor
reviewed: 2026-08-25T05:05:00Z
depth: deep
files_reviewed: 12
files_reviewed_list:
  - scripts/migrate-from-zero.mjs
  - src/lib/__tests__/migration-chain-integrity.test.ts
  - src/lib/__tests__/node-engines-floor.test.ts
  - src/lib/__tests__/compose-uploads-persistence.test.ts
  - src/lib/__tests__/deployment-docs-accuracy.test.ts
  - src/lib/mutations/__tests__/db-test-isolation.test.ts
  - drizzle/0006_import-sessions-user-id.sql
  - Dockerfile
  - docker-compose.yml
  - .env.example
  - .github/workflows/ci.yml
  - eslint.config.mjs
  - package.json
  - scripts/dedup-db-test-setup.sh
findings:
  critical: 1
  blocker: 1
  warning: 14
  info: 6
  total: 21
status: findings
---

# Phase 46: Code Review Report

**Reviewed:** 2026-08-25T05:05:00Z
**Depth:** deep (cross-file: script -> drizzle-kit -> compose -> docs -> CI)
**Files Reviewed:** 12 source files (+ `package.json`, `scripts/dedup-db-test-setup.sh` comment-only)
**Status:** issues_found

## Summary

The phase does what it set out to do at the level of the artifacts it touched. I verified this
behaviourally rather than accepting it:

- `npm run db:check-migrations` ran green end-to-end against the live cluster: 36/36 tables,
  293/293 columns, 41/41 declared index names, and all ten reference dimensions IDENTICAL against
  `pipelite`. It created and then removed its scratch database — `select datname from pg_database
  where datname like 'pipelite_migchk%'` returns 0 rows afterwards. No leak on the happy path.
- The restored DDL in `drizzle/0006_import-sessions-user-id.sql` is byte-faithful to
  `drizzle/meta/0006_snapshot.json` and to `src/db/schema/{import-sessions,webhook-deliveries}.ts`,
  and it correctly omits `user_id` (added by the same file's `ALTER`).
- The edit is safe for an already-migrated database: `drizzle-orm/pg-core/dialect.js:57-62` selects
  the ledger row by `created_at desc limit 1` and re-runs a migration only when
  `Number(lastDbMigration.created_at) < migration.folderMillis`. The stored `hash` is written but
  never compared, so a fully-migrated database will not re-execute 0006.
- The script's core safety claim — that `DATABASE_URL` in the child's environment beats `.env` — is
  real. `drizzle-kit/bin.cjs` bundles dotenv 16.5.0, whose `configDotenv` resolves
  `path.resolve(process.cwd(), ".env")` and whose `populate` overwrites an existing key only when
  `override === true`, which drizzle-kit does not pass. Confirmed empirically: the scratch database
  ended up with 36 tables and a 20-row ledger while `pipelite` was untouched.
- `tsc --noEmit` clean, `eslint` 0 errors (124 pre-existing warnings), and all 156 tests across the
  five reviewed test files pass. The `node:24-alpine` pin is live in the running container
  (`docker compose exec app node -v` -> `v24.19.0`, image built 32 minutes ago), so the Dockerfile
  change was behaviourally verified rather than merely asserted. The Dockerfile diff moves only the
  three tags; no stage label, `AS` name, `COPY --from=`, or install invocation changed.

That is the part that holds. What follows is what does not.

The one blocking defect is a **cross-file regression that the phase's own gates cannot see**:
hardcoding the container's `DATABASE_URL` in `docker-compose.yml:21` removes the only supported way
to point a compose deployment at an external Postgres, and leaves
`docs/admin/deployment/docker.md` telling a self-hoster to write a value that is now both ignored by
the container *and* the exact value that breaks every host-side migrate command this phase just
fixed. `docs/admin/deployment/docker.md` is in neither `HOST_PERSPECTIVE_DOCS` nor
`OPERATOR_POSTGRES_DOCS`, so the new doc-accuracy gate is blind to the one deployment document its
sibling change invalidated.

The second theme is **gate reach, not gate vacuity**. I looked hard for self-satisfying assertions,
and the new test files are unusually well-defended: every scan I could reach has a `MIN_*` floor, a
fixture-proved matcher, or a permanent negative control, and I could not find one that matches
nothing today. Two exceptions survive: assertion set B of `migrate-from-zero.mjs` has no floor at
all and three of its ten dimensions are demonstrably empty-vs-empty right now (measured: triggers
0/0, sequences 0/0, views 0/0); and the destructive-statement scan floors the *verb* but not the
*protected token*, so renaming `REFERENCE_DB` silently turns that negative into a scan that matches
nothing. More importantly, the gate that actually runs on the required CI check is far weaker than
`ci.yml:130` claims: with no reference database, only table names, column *names* and index *names*
are compared. Types, defaults, nullability, constraints, enums, functions and index definitions are
compared **only** in the reference branch, which CI skips by design.

---

## Critical Issues

### CR-01 / BL-01: Hardcoding the container DSN removes external-Postgres support and invalidates the Docker deployment doc

**File:** `docker-compose.yml:21` (with `docs/admin/deployment/docker.md:118-122, 158-167`)

**Issue:**

Before this phase, `services.app.environment` carried `- DATABASE_URL=${DATABASE_URL}`, so the
operator's `.env` value reached the container. It now carries a value constructed in-file:

```yaml
- DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
```

The host part is a literal. `DATABASE_URL` from `.env` is no longer passed to the app container at
all. Two concrete consequences, neither of which any gate in this phase detects:

1. **Option B of the Docker deployment guide is now non-functional.**
   `docs/admin/deployment/docker.md:158-163` is titled "External PostgreSQL" and instructs:
   "**Update DATABASE_URL in .env:** `DATABASE_URL=postgresql://pipelite:yourpassword@your-db-host:5432/pipelite`".
   After this change that edit has *no effect whatsoever*. The container will connect to the bundled
   compose service regardless. An operator migrating to RDS/Neon/Supabase follows the documented
   steps, sees the app come up green, and is silently writing to the throwaway local container
   instead of their managed database. There is no supported route to an external database under
   compose any more without editing `docker-compose.yml` itself, and nothing says so.

2. **The Docker guide now instructs the reader to create the exact defect DEPLOY-02 removes.**
   `docs/admin/deployment/docker.md:108-122` says `cp .env.example .env`, then "Edit `.env` with your
   settings", then shows `DATABASE_URL=postgresql://pipelite:yourpassword@postgres:5432/pipelite`
   with the emphatic comment "The host part MUST be the compose service name." A reader who follows
   the *Docker* document overwrites the `localhost:5433` line this phase just installed in
   `.env.example` with `@postgres:5432` — and then every host-side `npm run db:migrate` /
   `npx drizzle-kit migrate` fails with `getaddrinfo EAI_AGAIN postgres`, which is the papercut the
   phase goal names verbatim. `.env.example:11-13` warns the reader not to do this; `docker.md:120`
   orders them to.

The new gate cannot catch either. `HOST_PERSPECTIVE_DOCS`
(`src/lib/__tests__/deployment-docs-accuracy.test.ts:519-524`) lists `.env.example`,
`CONTRIBUTING.md`, `README.md`, `docs/development/contributing.md`.  `OPERATOR_POSTGRES_DOCS`
(`:539-542`) lists `configuration.md` and `bare-metal.md`.
`docs/admin/deployment/docker.md` is in neither list, and it is the document most directly
invalidated by the sibling `docker-compose.yml` edit.

**Fix:** Restore the ability to override, and bring the doc into agreement. Compose supports a
default-with-override in one line:

```yaml
      # Defaults to the bundled service; an operator pointing at an external database sets
      # APP_DATABASE_URL in .env. `DATABASE_URL` stays the HOST-side string for drizzle-kit.
      - DATABASE_URL=${APP_DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}}
```

Then rewrite `docs/admin/deployment/docker.md:118-122` so the `.env` snippet shows the **host** form
(`localhost:5433`) matching `.env.example`, and rewrite `:158-167` Option B to set `APP_DATABASE_URL`
(or whatever name is chosen) rather than `DATABASE_URL`. Finally, add `docs/admin/deployment/docker.md`
to the doc-accuracy gate — either to `HOST_PERSPECTIVE_DOCS`, or to a third list with its own
assertion — so this class of drift cannot recur silently.

---

## Warnings

### WR-01: Two of the three advertised safety fences are unreachable dead code

**File:** `scripts/migrate-from-zero.mjs:35-47, 90-91, 177-196, 530-531`

**Issue:** The header states "IT IS FENCED THREE WAYS" and the code calls `assertScratchName` four
times (`:531`, `:554`, `:557`, `:709`) "immediately before every interpolation". But
`assertScratchName` is only ever called with `scratchName`, and `scratchName` is built at `:530` from
a constant template:

```js
const scratchName = `pipelite_migchk_${process.pid}_${Date.now()}`
```

`process.pid` and `Date.now()` are always digits, so `SCRATCH_PATTERN`
(`/^pipelite_migchk_[a-z0-9_]+$/`) always matches. Given that it matches, the name necessarily starts
with `pipelite_migchk_`, so:

- fence 2, `name === referenceName` (`:184`), can only fire if the operator's reference database is
  itself named `pipelite_migchk_...`;
- fence 3, `FORBIDDEN_SCRATCH_NAMES.includes(name)` (`:190`), can **never** fire — none of
  `pipelite`, `postgres`, `template0`, `template1` can match the pattern that already passed.

So there is exactly one load-bearing control (the constant prefix in the template literal), not
three, and `FORBIDDEN_SCRATCH_NAMES` is provably dead. This matters because a future edit that makes
the scratch name configurable (`--scratch-name`, an env var) would look fenced while the two checks a
reviewer would rely on are the ones that were never exercised.

**Fix:** Keep the checks — they are cheap — but stop describing them as independent, and make at
least one of them provable. Add a unit test that calls `assertScratchName` directly with `"pipelite"`,
`"postgres"` and the reference name and asserts each throws, in the style of the NC-3 negative
control in `node-engines-floor.test.ts:284-316`. That converts three dead branches into three proved
ones and makes the header's claim true.

### WR-02: The gate that runs on the required CI check compares names only, while `ci.yml` claims it is "fully authoritative"

**File:** `scripts/migrate-from-zero.mjs:302-361, 586-653`; `.github/workflows/ci.yml:130-133`

**Issue:** `ci.yml:130-133` states that in CI "the snapshot assertions above still run and are fully
authoritative here." They are not. `loadSnapshotReference` deliberately reduces the snapshot to three
name lists:

```js
tables.push(name)
for (const column of Object.keys(table.columns ?? {})) columnPairs.push(`${name}.${column}`)
for (const index of Object.keys(table.indexes ?? {})) indexNames.push(index)
```

and the built side is queried to match (`:610-612` selects `table_name||'.'||column_name`; `:637-639`
selects `indexname` only). The seven richer dimensions — `columns` with type/length/nullability/
default/generated (`:214-215`), `constraints`, `enums`, `functions`, `extensions`, `triggers`,
`sequences`, `views` — are used **only** inside `if (reference.mode === "run")` at `:665`, which CI
skips by construction (branch 4). Concretely, on the required check a from-zero build that produces:

- `deals.amount` as `text` instead of `numeric`,
- a column missing `NOT NULL` or with the wrong `DEFAULT`,
- a missing foreign key or check constraint,
- an enum missing a label,
- one of the 38 `public` functions absent,
- an index present by name but built on the wrong columns or without `UNIQUE`,

passes green. Also note the index check is a one-way subset (`:641`): extra indexes in the built
database are never reported, unlike tables (`:603-608`) and columns (`:626-632`), which check both
directions. The snapshot JSON already carries `type`, `notNull`, `default`, `foreignKeys`,
`uniqueConstraints`, `checkConstraints` and per-index column lists — the information is on disk and
is being discarded.

**Fix:** Either (a) extend `loadSnapshotReference` to emit a richer column key
(`${table}.${column}|${type}|${notNull}|${default}`) plus foreign-key and unique-constraint sets, and
compare those in set A; or (b) at minimum, correct `ci.yml:130-133` to state precisely what CI does
and does not prove, and add the index-direction check:

```js
const extraIndexes = [...builtIndexNames].filter((n) => !snapshotIndexSet.has(n) && !n.endsWith("_pkey"))
```

Option (b) alone is acceptable only if the deferred item for (a) is registered; leaving the claim as
written is not.

### WR-03: Assertion set B has no anti-vacuity floor, and three of its ten dimensions are empty-vs-empty today

**File:** `scripts/migrate-from-zero.mjs:79-88, 211-231, 665-700`

**Issue:** The file opens with an explicit doctrine (`:80-83`): "Two empty sets compare equal, which
is the exact shape of the six gates v1.3 shipped that could not fail," and installs four `MIN_*`
floors — all of which guard the *snapshot* side only. Set B, the ten-dimension reference comparison,
has no floor whatsoever. Both sides run the *same* query string, so any defect that makes a query
return zero rows on both sides reports `IDENTICAL`. A single typo — `table_schema = 'publik'`,
`nspname = 'pubic'`, a `where` clause that no longer matches — silently converts a dimension into a
permanent pass. That is not hypothetical: the measured run I performed reports

```
   triggers             0          0  IDENTICAL
   sequences            0          0  IDENTICAL
   views                0          0  IDENTICAL
```

Three of the advertised ten dimensions are empty-vs-empty right now. They are not worthless (they
would catch an asymmetric addition), but the "ten-dimension comparison" in `ci.yml:120-127` and in
the script header is really seven load-bearing dimensions plus three empty-set identities, and
nothing distinguishes "this dimension is genuinely empty" from "this query stopped working."

**Fix:** Apply the same discipline set A already has. Record a measured floor per dimension and
assert the *reference* side against it before diffing:

```js
const DIMENSION_FLOORS = { tables: 30, columns: 250, indexes: 60, constraints: 70,
  enums: 8, functions: 30, extensions: 3, triggers: 0, sequences: 0, views: 0 }
...
if (referenceValues.length < DIMENSION_FLOORS[dimension]) {
  record(`catalog dimension "${dimension}" returned ${referenceValues.length} rows from ` +
    `${reference.name}, below the measured floor ${DIMENSION_FLOORS[dimension]} — the query ` +
    `stopped matching, so this dimension's IDENTICAL verdict is meaningless.`)
}
```

and mark the three zero-floor dimensions in the printed table as `IDENTICAL (both empty)` so the
verdict is not read as evidence.

### WR-04: The hand-rolled `.env` reader diverges from the dotenv the docs' command actually uses

**File:** `scripts/migrate-from-zero.mjs:107-130` (claim at `:50-57`)

**Issue:** The header claims "this script and the command the docs print resolve the same server by
the same rule." They do not. `databaseUrlFromDotenv` matches
`/^\s*DATABASE_URL\s*=\s*(.*)$/` and strips only matched surrounding quotes. dotenv 16.5.0 — the
parser bundled in `drizzle-kit/bin.cjs` — differs in two ways that occur in real `.env` files:

1. **`export ` prefix.** dotenv's `LINE` regex accepts `(?:export\s+)?`; this reader does not. An
   `.env` containing `export DATABASE_URL="postgresql://..."` works for `npm run db:migrate` and
   makes this script fatal with "no DATABASE_URL", telling the operator to create a file they
   already have. (Note `deployment-docs-accuracy.test.ts:552` explicitly anticipates the `export`
   form "in case a future document reaches for one" — so the two readers in this phase already
   disagree about whether it exists.)
2. **Inline comments.** dotenv's value group is `[^#\r\n]+` for unquoted values, so it strips a
   trailing `# comment`. This reader does not. `DATABASE_URL=postgresql://u:p@localhost:5433/pipelite # dev`
   yields a value that `new URL()` parses with `pathname` `/pipelite%20` and a `#` fragment: the
   reference lookup at `:448-450` then finds no such database and the run reports
   `SKIPPED: reference equivalence — database pipelite%20 does not exist`. A skip caused by a parser
   disagreement is precisely the "misconfiguration disguised as an absence" the surrounding code goes
   to great lengths to prevent everywhere else.

**Fix:** Stop re-implementing it. `dotenv` is already in the tree transitively; if a direct dependency
is unwanted, at least match the two documented forms and reject anything ambiguous:

```js
const match = /^\s*(?:export\s+)?DATABASE_URL\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\r\n]*))\s*(?:#.*)?$/.exec(line)
if (!match) continue
const value = (match[1] ?? match[2] ?? match[3] ?? "").trim()
```

### WR-05: A database name is interpolated into SQL where the driver would bind it

**File:** `scripts/migrate-from-zero.mjs:448-450`

**Issue:**

```js
const existing = await admin.unsafe(
  `select 1 as v from pg_database where datname = '${name.replace(/'/g, "''")}'`
)
```

`name` comes from `databaseNameOf(sourceUrl)` — i.e. from `DATABASE_URL`, an operator-supplied
string. Unlike the `CREATE`/`DROP DATABASE` statements, this is a `WHERE` clause comparing a *value*,
which `postgres.js` binds natively. The manual `''` doubling is correct only while
`standard_conforming_strings` is `on` (the default since 9.1, but a server- or role-level
`SET standard_conforming_strings = off` re-enables backslash escapes and defeats it). There is no
reason to carry that assumption when the driver's second argument exists. Note also that
`databaseNameOf` does not percent-decode, so a legitimately encoded database name in the URL
(`my%20db`) is compared as the literal `my%20db` and never found — silently downgrading to the
"reference absent" skip.

**Fix:**

```js
const existing = await admin.unsafe("select 1 as v from pg_database where datname = $1", [name])
```

and decode in `databaseNameOf`:

```js
return decodeURIComponent(new URL(source).pathname.replace(/^\//, ""))
```

### WR-06: A second interrupt leaks a scratch database permanently, and the exit message claims otherwise

**File:** `scripts/migrate-from-zero.mjs:552-559, 701-718, 720-727, 749-760`

**Issue:** The signal handler exists, per its own comment (`:749-751`), "so an operator's Ctrl-C does
not leak a database." A second signal takes `process.exit(130)` at `:754`, which bypasses the
`finally` block entirely and leaves `pipelite_migchk_<pid>_<ts>` on the operator's cluster. Because
every run generates a fresh unique name, the defensive `DROP DATABASE IF EXISTS` at `:555` only ever
targets *this* run's name — nothing ever reaps a previously leaked one. They accumulate silently, on
the same cluster that holds production data.

Compounding it, when the run does reach the interrupted branch, `:722-725` prints unconditionally:

> "The scratch database was removed on the way out; nothing was proved."

but the `finally` at `:712-716` only prints a `WARNING:` when the `DROP` fails and swallows the
error. So the two messages can contradict each other in the same output, and the reassuring one is
printed last.

**Fix:** Track the outcome and tell the truth, and reap orphans on start-up:

```js
let scratchRemoved = false
// ... in finally, after a successful DROP:
scratchRemoved = true
// ... in the interrupted branch:
console.error(scratchRemoved
  ? "The scratch database was removed on the way out; nothing was proved."
  : `The scratch database ${scratchName} may still exist — remove it with ` +
    `DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE);`)
```

and, before creating, sweep prior leaks:

```js
const orphans = await admin.unsafe(
  "select datname::text as v from pg_database where datname like 'pipelite\\_migchk\\_%'")
for (const { v } of orphans) { assertScratchName(v, REFERENCE_DB); await admin.unsafe(`DROP DATABASE IF EXISTS "${v}" WITH (FORCE)`) }
```

That sweep is also the first call site that would make `assertScratchName`'s fences 2 and 3
(WR-01) load-bearing rather than dead.

### WR-07: `interrupted` is not checked before the child is spawned

**File:** `scripts/migrate-from-zero.mjs:552-566, 757-758`

**Issue:** The interrupt check sits *after* the migrate (`:566`), and the handler's
`if (activeChild) activeChild.kill("SIGTERM")` (`:758`) is a no-op while `activeChild` is `null`. A
Ctrl-C arriving during `DROP DATABASE IF EXISTS` (`:555`) or `CREATE DATABASE` (`:558`) therefore
does not stop anything: the script goes on to spawn `drizzle-kit` and run all 20 migrations to
completion before honouring the signal. On a slow cluster that is tens of seconds of work the
operator explicitly asked to stop.

**Fix:** Check before spawning, and re-check inside the handler:

```js
if (interrupted) fatal("interrupted before the migrate started — the scratch database goes with it")
progress("running `drizzle-kit migrate` ...")
const migrate = await runDrizzleMigrate(scratchUrl)
```

and in `runDrizzleMigrate`, return early rather than spawning when `interrupted` is already set.

### WR-08: The restored `CREATE TABLE`s lack `IF NOT EXISTS`, which can break a partially-migrated database

**File:** `drizzle/0006_import-sessions-user-id.sql:1-22`

**Issue:** These two tables exist in production *because they were introduced with `db:push`*, which
is stated in the gate's own header (`migration-chain-integrity.test.ts:15-16`). A database whose
`drizzle.__drizzle_migrations` high-water mark is at or before 0006's `folderMillis` but which
already carries `import_sessions` / `webhook_deliveries` from a push will now abort the next
`drizzle-kit migrate` with `42P07 relation "import_sessions" already exists` — where before this
change 0006 was two harmless `ALTER`s. A fully-migrated database (ledger at 0019) is unaffected,
which I verified in the drizzle migrator source, so this is a narrow window rather than a general
break — but it is a window this edit opened and the `IF NOT EXISTS` form costs nothing: the chain's
own matcher already tolerates it (`migration-chain-integrity.test.ts:209, 354`) and a from-zero build
is byte-identical either way.

**Fix:**

```sql
CREATE TABLE IF NOT EXISTS "import_sessions" (
...
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
...
CREATE INDEX IF NOT EXISTS "webhook_deliveries_status_next_attempt_idx" ON "webhook_deliveries" ...
```

If the team prefers to keep the strict form (so that a genuine conflict is loud), then record the
decision and the affected-ledger window in `docs/admin/backup-restore.md` upgrade notes, because the
operator hitting 42P07 has no way to know it was deliberate.

### WR-09: The constructed compose DSN silently corrupts URL-unsafe passwords

**File:** `docker-compose.yml:21`; `.env.example:19, 26-28`

**Issue:** `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}` performs
no percent-encoding. Previously the operator wrote the whole `DATABASE_URL` themselves and could
encode reserved characters. Now a strong generated password containing `/`, `#`, `?` or `%` produces
a malformed DSN and the app fails to connect with an error that points at the URL, not at the
password. `/` is the worst case: the authority parse terminates early and the connection attempt
targets a host derived from the username. The instruction in `.env.example:15-16` ("Keep the
user/password/database here in AGREEMENT with the POSTGRES_* values below") makes it worse, because
the operator must now encode the password in one place (`.env`'s `DATABASE_URL`) and *not* encode it
in another (`POSTGRES_PASSWORD`) for both routes to work — and nothing says so.

**Fix:** Document the constraint where it is created, and in the example file:

```yaml
      # POSTGRES_PASSWORD is interpolated into a URL here without encoding. Use only
      # unreserved characters (A-Za-z0-9-._~); `openssl rand -hex 32` is a safe generator.
```

and add the same note above `POSTGRES_PASSWORD` in `.env.example`. Consider asserting it in
`compose-uploads-persistence.test.ts` alongside the new `@postgres:5432` assertion.

### WR-10: The newly load-bearing `.env.example` "AGREEMENT" invariant is enforced by nothing

**File:** `.env.example:15-16, 19, 26-28`; `src/lib/__tests__/deployment-docs-accuracy.test.ts:586-631`

**Issue:** The phase's whole DEPLOY-02 argument is that `.env` must carry the *host* string while
compose builds the *container* string from `POSTGRES_*`, and that the two must agree. The new gate
asserts only that every `DATABASE_URL=` assignment in `.env.example` contains `localhost:5433`, never
`localhost:5432`, and never `@postgres:5432`. It does not assert that the user, password and database
inside that URL equal `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` in the same file. That
is the one property the compose change makes load-bearing, it is trivially checkable statically, and
it is the property most likely to rot on the next credential rename — a self-hoster who edits
`POSTGRES_PASSWORD` and forgets the URL gets a working container and a broken `npm run db:migrate`,
which is the same class of failure DEPLOY-02 exists to remove.

**Fix:** Add to `deployment-docs-accuracy.test.ts`:

```ts
it(".env.example's DATABASE_URL agrees with its own POSTGRES_* values", () => {
  const text = read(".env.example")
  const val = (k: string) => /^\s*(\w+)\s*=\s*"?([^"\n#]*)"?/m.exec(
    text.split("\n").find((l) => l.startsWith(`${k}=`)) ?? "")?.[2]?.trim()
  const url = new URL(val("DATABASE_URL")!)
  expect(url.username).toBe(val("POSTGRES_USER"))
  expect(decodeURIComponent(url.password)).toBe(val("POSTGRES_PASSWORD"))
  expect(url.pathname.slice(1)).toBe(val("POSTGRES_DB"))
})
```

### WR-11: The destructive-statement scan floors the verb but not the protected token

**File:** `src/lib/mutations/__tests__/db-test-isolation.test.ts:224-241, 556-576, 578-592`

**Issue:** The scan is defended in one direction only. `:556-576` proves each subject file really
contains destructive statements outside its comments (`hits.length > 0`), so the stripper cannot have
blanked everything. Nothing proves the **`protectedToken`** matches anything in the file. If
`REFERENCE_DB` is renamed in `scripts/migrate-from-zero.mjs` (or refactored to `reference.name`,
which the script already uses at `:680-685`), `/\bREFERENCE_DB\b/` matches nothing, every
`.not.toMatch(protectedToken)` is trivially satisfied, and the gate becomes a permanent green that is
green *because* it is broken — the exact anti-gate shape the file's own header (`:37-43` of
`migration-chain-integrity.test.ts`, and this file's DEPLOY commentary) is written against. The same
applies to `/\$\{?SOURCE_DB/` in the shell subject.

**Fix:** Add the missing half of the floor to the existing `it.each`:

```ts
const tokenHits = codeLines(source, comments).filter((code) => protectedToken.test(code))
expect(
  tokenHits.length,
  `${path} never names ${label} on a non-comment line, so the negative below matches ` +
    `nothing and passes vacuously. If the identifier was renamed, re-anchor protectedToken.`
).toBeGreaterThan(0)
```

### WR-12: NC-3 pins an exact single-package result and will go red for an unrelated reason

**File:** `src/lib/__tests__/node-engines-floor.test.ts:298-316`

**Issue:** The negative control asserts exact array equality:

```ts
expect(nodeFloorViolations("20.20.2").map((v) => v.pkg)).toEqual(["@napi-rs/lzma-linux-x64-gnu"])
expect(nodeFloorViolations("24.0.0").map((v) => v.pkg)).toEqual(["@napi-rs/lzma-linux-x64-gnu"])
```

The file's own reasoning (`:11-17`) records that the binding constraint changed package *and major*
in ten days without a line of this repository changing. The next dependency bump that adds any
package with an `engines.node` floor above 20.20.2 — an extremely ordinary event, and one that says
nothing about the toolchain floor being wrong — turns this red, and the failure message will read
"expected [a, b] to equal [@napi-rs/lzma-linux-x64-gnu]" with no hint that the correct action is to
edit the control rather than the pin. The file explicitly instructs the next reader "Never lower the
assertion," which makes the misdiagnosis more likely, not less. The complement at `:304-308`
(`nodeFloorViolations("24.12.0")` is `[]`) already rules out the "constant one-element array" failure
mode that `:296` cites as the reason for exact equality.

**Fix:** Keep the exactness where it is load-bearing (the named package must be present) and relax
where it is not:

```ts
const pkgs = nodeFloorViolations("20.20.2").map((v) => v.pkg)
expect(pkgs, `20.20.2 must still violate the constraint that forced the pin`)
  .toContain("@napi-rs/lzma-linux-x64-gnu")
expect(pkgs.length, `if this grew, a NEW dependency raised the floor — update this control, ` +
  `not the pin. Violations: ${pkgs.join(", ")}`).toBeLessThanOrEqual(5)
```

### WR-13: Two anti-vacuity floors are set at the measurement, contradicting the file's own stated rule

**File:** `scripts/migrate-from-zero.mjs:79-88, 309-315, 334-340`

**Issue:** `:82-83` states the rule: "each floor sits BELOW the measurement so ordinary growth does
not trip it, but a parse that silently yields nothing does." Two of the four floors do not follow it:

```js
const MIN_JOURNAL_ENTRIES = 20 // measured: exactly 20 (0000..0019)
const MIN_SNAPSHOT_TABLES = 36 // measured: exactly 36
```

Growth is fine (the comparison is `<`), but *legitimate shrinkage* is not. Dropping a deprecated
table — a normal schema change that produces a new migration and a new snapshot with 35 tables — now
fatals with:

> "0020_snapshot.json parsed 35 tables, floor is 36 (measured 36). A snapshot that parses to nothing
> compares equal to an empty database."

which is a false diagnosis: the snapshot parsed fine. The next person to see that message will
"fix" it by lowering the floor under time pressure, without understanding what it was for — the
failure mode the whole floor mechanism exists to prevent. `MIN_SNAPSHOT_COLUMNS` (280 vs 293) and
`MIN_SNAPSHOT_INDEXES` (30 vs 41) are correctly set.

**Fix:** Set both floors below the measurement and say so, e.g. `MIN_JOURNAL_ENTRIES = 15 //
measured 20` and `MIN_SNAPSHOT_TABLES = 30 // measured 36`, and add to the fatal message: "This is a
tripwire for a parse that yielded nothing, not a schema-size assertion; if the schema legitimately
shrank, lower the floor and record the new measurement."

### WR-14: `stripSqlComments` is not string-literal aware and processes block comments before line comments

**File:** `src/lib/__tests__/migration-chain-integrity.test.ts:166-172`

**Issue:**

```ts
const blockless = sql.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
return blockless.replace(/--[^\n]*/g, (m) => " ".repeat(m.length))
```

Neither pass knows about SQL string literals, and block comments are stripped first. Two reachable
consequences in this chain, which already carries `--` prose in `0009` and `0013`:

- A `--` comment containing `/*` with any later `*/` anywhere in the same file causes the block pass
  to blank everything between them, including real `CREATE TABLE` lines.
- A literal containing `--` or `/*` (`INSERT ... VALUES ('a--b')`, a `CHECK` with a regex) is
  partially blanked.

Both fail *loudly* here (a blanked `CREATE TABLE` shows up as a missing snapshot table), so this is
not a vacuity hole — but the failure names the wrong cause, and the sibling helper in
`db-test-isolation.test.ts:249-305` already implements the quote-aware, single-pass version. Two
different comment strippers with different correctness properties now live in the same test suite.

**Fix:** Reuse the stronger one. Export `codeLines` (or a shared `stripComments(source, syntax)`)
from a single module and add a `"sql"` syntax arm to it, so the SQL chain gets the same quote
awareness the `.mjs` scan already has. At minimum, strip `--` before `/* */` and add a fixture
proving `INSERT INTO t VALUES ('a--b'); CREATE TABLE "x" (` survives.

---

## Info

### IN-01: Unreachable statements after `fatal()`

**File:** `scripts/migrate-from-zero.mjs:142, 508`
`fatal()` always throws, so `return null` at the end of `resolveConnectionString` and of
`resolveReference` is dead. Harmless, but it invites a reader to believe `null` is a possible return
value and add a `if (!x)` guard for a case that cannot occur.
**Fix:** Delete both, or mark `fatal` with `@returns {never}` so tooling agrees.

### IN-02: `MIN_CI_STEPS`'s own comment contradicts itself

**File:** `src/lib/mutations/__tests__/db-test-isolation.test.ts:66-74`
"declares at least this many steps today (measured: 6 — checkout, setup-node, install, typecheck,
lint, test, plus the migration check = 7)". The floor is 6, the enumeration lists 6 then adds a 7th,
and the measured value is 7.
**Fix:** `const MIN_CI_STEPS = 6 // measured: 7 (checkout, setup-node, install, typecheck, lint, test, migration check)`.

### IN-03: `atLineStart` is shared across two independent streams

**File:** `scripts/migrate-from-zero.mjs:392-398`
`echo` writes the flag from whichever of stdout/stderr fired last, so interleaved child output can
produce a spurious or missing newline before the next `->` line. `chunk[chunk.length - 1]` on a
zero-length chunk yields `undefined`, i.e. `false`.
**Fix:** Track the flag per stream, or simply always emit `"\n"` before the next progress line when
any output was seen.

### IN-04: `DROP DATABASE ... WITH (FORCE)` silently requires PostgreSQL 13+

**File:** `scripts/migrate-from-zero.mjs:555, 710`
The repo pins `postgres:16-alpine`, so this is fine here, but a self-hoster on an older managed
server gets a bare syntax error from the first statement the script runs, with no hint that the
server version is the cause. (It fails before `CREATE DATABASE`, so nothing leaks.)
**Fix:** Mention the PG13+ requirement in the header, or catch `42601` on the pre-emptive `DROP` and
re-raise with "requires PostgreSQL 13 or newer (`WITH (FORCE)`)".

### IN-05: `npm_config_require_reference` is undocumented and unexercised

**File:** `scripts/migrate-from-zero.mjs:521-523`
The env-variable route into `--require-reference` appears in no doc, no npm script, and no test, and
the exact npm config-name mangling (`--require-reference` -> `npm_config_require_reference`) is
version-dependent.
**Fix:** Drop it, or document it next to the flag and add it to the header's usage notes.

### IN-06: Diff enumeration is capped inconsistently

**File:** `scripts/migrate-from-zero.mjs:280-297, 595-608, 648-653`
`DIFF_SAMPLE_LIMIT` is applied to columns and to the set-B dimensions but not to the table or index
diffs, which use a bare `.join(", ")`. On a fully-aborted chain those print 36 and 41 names inline —
survivable, but it defeats the stated purpose of the cap ("an uncapped report buries the one line
that actually diagnoses the run").
**Fix:** Route all four through `sampleDifference` for consistency.

---

## What I checked and found clean

Recorded so the next reviewer does not re-derive it:

- **`Dockerfile`** — diff is three `FROM node:20-alpine` -> `node:24-alpine` tags plus a 17-line
  comment. `AS deps` / `AS builder` / `AS runner`, `apk add --no-cache libc6-compat`,
  `npm install --legacy-peer-deps` (`:24`), every `COPY --from=`, the standalone-output assertions
  and the `USER`/`EXPOSE` lines are byte-identical. Running container reports `v24.19.0`, which
  satisfies `>=24.12.0`.
- **`drizzle/0006`** — DDL matches `drizzle/meta/0006_snapshot.json` column-for-column
  (types, defaults, nullability) and matches `src/db/schema/import-sessions.ts` /
  `webhook-deliveries.ts`. `user_id` is correctly absent from the `CREATE TABLE` (added by the
  file's own `ALTER`). The index matches the snapshot's btree `(status, next_attempt_at)`.
- **`ci.yml`** — `if: ${{ !cancelled() }}` does *not* swallow failures; a non-zero exit still fails
  the step and the `ci` job, which is the required check. No `continue-on-error`. The service's
  `postgres/postgres` credentials are a per-run ephemeral container, not a secret.
  `permissions: contents: read` and `persist-credentials: false` unchanged. The health check is
  correct and necessary. `drizzle-kit` is in `dependencies`, so `npm ci` provides
  `node_modules/.bin/drizzle-kit` for the new step.
- **Credential handling in `migrate-from-zero.mjs`** — `describeTarget` (`:158-162`) emits host, port
  and database only; verified against the live run's output, which printed
  `localhost:5433/pipelite` and no credentials. The connection string travels in the child's
  environment (`:384`), never on argv.
- **`eslint.config.mjs`** — `no-console` is `"error"` at `:38`, so the `scripts/**` entry is
  load-bearing rather than decorative; the added glob is outside `src/`. `eslint` exits 0 on the new
  script and reports 0 errors repo-wide.
- **Anti-vacuity in the four new/amended test files** — every scan I traced has a floor or a
  fixture-proved matcher: `MIN_JOURNAL_ENTRIES`/`MIN_CREATE_TABLE_STATEMENTS`/`MIN_SNAPSHOT_TABLES`
  and `REQUIRED_JOURNAL_TAGS`; `MIN_DECLARED_RANGES` plus the distinct-expression check plus NC-3;
  `MIN_CI_STEPS`; the per-file "assigns DATABASE_URL at least once" floor; and the live control that
  `configuration.md`/`bare-metal.md` still print 5432. I could not find an assertion in these files
  that matches nothing today. The vacuity that remains is in the `.mjs` (WR-03) and in the protected
  token (WR-11).
- **`scripts/dedup-db-test-setup.sh`** — comment-only change; the rewritten claim ("the chain now
  builds a complete database from zero") is true, verified by running the check.

---

_Reviewed: 2026-08-25T05:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

---

## Disposition of these findings (review-fix pass, 2026-08-25)

All 21 findings were addressed; none was skipped. One commit per finding, on `master`, in
severity order. Every gate touched was observed RED on purpose first and the verbatim output is
in the commit message that made the change.

| Finding | Commit | Disposition |
|---|---|---|
| CR-01 / BL-01 | `65e1e65` | **fixed.** `${APP_DATABASE_URL:-…}` restores the external route without pushing `@postgres:5432` back into `.env`; `docs/admin/deployment/docker.md` rewritten and added to `HOST_PERSPECTIVE_DOCS`; compose gate re-anchored onto the override-with-fallback shape. |
| WR-01 | `ac00711` | **fixed.** Header states which fence is load-bearing; `assertScratchName` exported and proved by 17 assertions. |
| WR-02 | `06fe7a3` | **fixed (b), plus part of (a).** Column nullability and the missing index direction are now compared in set A; `ci.yml` enumerates PROVED / NOT PROVED. **The remainder — types, defaults, FKs, constraints, enums, functions, index definitions — is ACCEPTED and registered as BACKLOG `MIG-02`**, as the finding's own text requires. |
| WR-03 | `b2d8ae9` | **fixed.** `DIMENSION_FLOORS`; empty-vs-empty dimensions print `IDENTICAL (both empty — proves nothing)`. |
| WR-04 | `3cb8b6d` | **fixed.** dotenv-compatible parser, pinned by 20 fixtures; unterminated quote is a hard error rather than a skip. |
| WR-05 | `48c118f` | **fixed.** Bound `$1`, plus percent-decoding on both the comparison and the connection. |
| WR-06 | `4df41c3` | **fixed.** Exit messages conditional on an observed DROP; a start-up sweep reaps leaks, guarded against dropping a concurrent run's database. |
| WR-07 | `406a2b4` | **fixed.** Interrupt checked before the spawn and inside `runDrizzleMigrate`. |
| WR-08 | `f5daa1e` | **fixed via the finding's SECOND option.** The strict `CREATE TABLE` form is KEPT deliberately — `IF NOT EXISTS` would carry the chain on against a push-created table that need not match what 0006 declares, trading a loud abort for a silent divergence inside the milestone that exists to delete silent gates. The decision and the recovery procedure are recorded in `drizzle/0006` and in `docs/admin/backup-restore.md` section 10, which is what the finding asks for in that case. |
| WR-09 | `ba1cd83` | **fixed.** Documented at all three sites by `65e1e65`; the optional assertion was added too. |
| WR-10 | `8bf3945` | **fixed.** |
| WR-11 | `3b6bff3` | **fixed.** Proved by renaming all 7 `REFERENCE_DB` occurrences and watching the old negative stay green while the new floor went red. |
| WR-12 | `34cda9f` | **fixed.** Exactness kept where load-bearing; both failure modes the equality guarded still produce a red. |
| WR-13 | `de35c4f` | **fixed.** |
| WR-14 | `e9322c0` | **fixed.** One quote-aware pass with `''`/`""` doubling, nesting block comments and dollar-quoting. |
| IN-01 | `6be7425` | fixed. |
| IN-02 | `f44094e` | fixed. |
| IN-03 | `fad302e` | fixed. |
| IN-04, IN-05, IN-06 | `3ce44d2` | fixed. |

Post-fix state: `npm test` 4739 passed / 32 skipped, 0 failed; `npm run typecheck` exit 0;
`npm run lint` 0 errors (124 pre-existing warnings, unchanged); `npm run db:check-migrations`
exit 0 with 36/36 tables, 293/293 columns, 293/293 nullability, 41/41 indexes and all ten
reference dimensions IDENTICAL. Compose stack up and healthy, `/api/health` 200, `pipelite`
intact at 36 tables / 46,054 organizations, zero scratch databases left.
