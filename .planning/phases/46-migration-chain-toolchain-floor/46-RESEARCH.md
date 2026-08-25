# Phase 46: Migration Chain & Toolchain Floor - Research

**Researched:** 2026-08-24
**Domain:** Drizzle migration chain integrity, host/container connection-string topology, Node engines floor enforcement
**Confidence:** HIGH — every load-bearing claim below was **measured by running it** against the live stack, not read out of a document. Two findings **contradict the phase CONTEXT** and one **adds a second defect CONTEXT does not know about**.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Migration chain repair (DEPLOY-01)**
- The defect is concrete and singular: `import_sessions` is `ALTER`ed by `0006` and FK-referenced by `0014`, but **no migration ever creates it**. A fresh `drizzle-kit migrate` dies `42P01` at `0006` and, because drizzle wraps the run in a transaction, leaves **0 tables** behind.
- **Recommended repair:** make the missing `CREATE TABLE` land *before* `0006` needs it, without renumbering the existing chain. Prepending the `import_sessions` DDL to `0006` itself is the preferred shape — drizzle's migrator skips already-applied entries by the journal `when` timestamp, not by re-hashing the file, so an existing database is untouched while a fresh one is fixed. The planner must **verify that skip semantics against the installed drizzle-orm version** before committing to it; if the installed migrator does hash-verify, fall back to a renumber (`0006`…`0019` → `0007`…`0020`, new `0006_create_import_sessions`) and update `_journal.json` in the same commit.
- The generated DDL must match what `src/db/schema/` declares for `importSessions` today, minus the `user_id` column and FK that `0006` itself adds — verified column-by-column against `pg_dump --schema-only` of the working database, not inferred from a clean exit.
- Never hand-write index SQL into a migration (established Phase 33 rule) — indexes come from the Drizzle schema files and `generate`.

**Equivalence proof (DEPLOY-01 SC-1, SC-2)**
- Equivalence is proved by a **table-by-table, column-by-column diff** of two `pg_dump --schema-only` outputs: one from a throwaway database built only by `drizzle-kit migrate`, one from the working database. Normalise dump noise (comments, `SET` preamble, ownership, dump version banner) before diffing; do not `diff` raw dumps.
- SC-2 (`/api/health` 200) is proved against the migration-built database **and nothing else** — no `db:push`, no dump restore anywhere in that path.

**The self-testing gate (DEPLOY-01 SC-3)**
- **The gate must be broken on purpose and observed red before it is trusted.** v1.3 shipped six gates that could not fail; this phase does not add a seventh. The negative control is explicit: delete the new `import_sessions` DDL, run the check, watch it fail `42P01`, restore, watch it pass. The SUMMARY must record both observed outcomes with their actual output.
- The check is a script (`scripts/`), invoked by an npm script, run in CI. It creates a uniquely-named throwaway database, migrates it from zero, asserts, and drops it in a `trap`/`finally` so a failure does not leak databases.
- Prefer behavioural assertions over raw-token greps (standing v1.4 rule) — assert on the catalog (`information_schema` / `pg_dump` output) and on process exit codes, never on a grep of the SQL text.

**Host connection string (DEPLOY-02)**
- `.env.local:1` points at `localhost:5432`; Postgres publishes on **5433**. Fix it to `5433`.
- The docs' migrate command must succeed from the host **exactly as printed** — no inline `DATABASE_URL` override, no port edit by the reader. Whatever deployment doc prints that command is updated in the same commit so doc and reality agree.
- Keep the Docker-internal `postgresql://…@postgres:5432` in `.env` untouched — that one is correct inside the compose network. Both are correct; the failure was only ever the host-side file. Add a short comment at each site saying which context it serves, so the next reader does not "fix" one into the other.

**Node floor (DEPLOY-03)**
- All three `node:20-alpine` pins (`Dockerfile:2` deps, `:10` builder, `:74` runner) move together — a fix that changes one is not a fix.
- **The gate reads the declared floors rather than comparing against a number written into the gate.** It walks `package-lock.json` `packages[*].engines.node`, resolves the highest floor any entry declares, and asserts the container's actual `node --version` satisfies it. A dependency raising its floor later must make this check go red, not go stale.
- Target version: the lowest **Active LTS** major that satisfies the computed floor. Do not chase Current. Pin the major only (`node:22-alpine` style), consistent with how the file pins today.

### Claude's Discretion
- Exact script language (bash vs Node) for the migration gate, its file name, and the npm script name.
- Whether the chain repair is a prepend or a renumber — decided by the verified drizzle skip semantics, per above.
- Dump-normalisation mechanics and the CI job's placement in the existing workflow file.

### Deferred Ideas (OUT OF SCOPE)
- Broader CI restructuring beyond wiring in the new check — out of scope here.
- Any schema change not strictly required to make the migration chain self-consistent.

### ⚠ Two locked decisions are contradicted by measurement — see `## Corrections to CONTEXT.md`
CONTEXT's DEPLOY-02 mechanism (`.env.local` port) is **wrong**: drizzle-kit never reads `.env.local`. CONTEXT's DEPLOY-01 defect ("concrete and singular") is **incomplete**: a second table is missing from the chain. Both are documented with measured evidence below. Neither correction changes the phase's success criteria — both change *what the executor must edit to satisfy them*.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEPLOY-01 | A self-hoster can build a working database from the migration chain alone — `drizzle-kit migrate` against an empty database completes and produces the full schema. | §Corrections C1 (second missing table), §Standard Stack (exact DDL to restore), §Code Examples 1–3 (measured reproduction, measured fix, measured equivalence), §Architecture Patterns P1–P3 (three-layer gate design) |
| DEPLOY-02 | The documented migrate command works from the host without an inline override. | §Corrections C2 (`.env.local` is never read — measured with file:line proof), §Architecture Patterns P4 (compose-supplies-container-URL shape), §Pitfall 6 (existing test asserts the exact line being changed) |
| DEPLOY-03 | The container's base image satisfies the toolchain's declared engines floor and cannot silently drift below it. | §Corrections C3 (Node 20 is EOL; the binding floor is no longer vite), §Standard Stack (`semver` gate dependency), §Code Examples 5 (floor-check algorithm, measured against four Node majors) |
</phase_requirements>

---

## Summary

Three things were verified by execution against the running stack, and all three change what the plan
must contain.

**First, the migration chain is missing TWO tables, not one.** `import_sessions` fails loudly
(`42P01` at `0006`). `webhook_deliveries` fails **silently** — no migration creates it, no migration
references it, so `drizzle-kit migrate` exits 0 and simply produces a database with 35 tables where
the working database has 36. It is written at `src/lib/api/webhooks/deliver.ts:61`, so on a
migration-built install every webhook delivery would raise `42P01` at runtime, long after the
"successful" migrate. Both tables first appear in `drizzle/meta/0006_snapshot.json` (table count
jumps 18 → 20 there) while `drizzle/0006_import-sessions-user-id.sql` contains only two `ALTER`
statements — the single root cause is one hand-edited, hand-named migration file that lost both
`CREATE TABLE`s while its snapshot kept them. **This is why SC-1 demands a table-by-table comparison
rather than a clean exit: a clean exit is exactly what the second defect produces.**

**Second, CONTEXT's DEPLOY-02 fix does not work.** `drizzle-kit` bundles `dotenv` and calls it at
`node_modules/drizzle-kit/bin.cjs:93321-93330`; dotenv's `configDotenv` at `bin.cjs:754` resolves
**only** `path.resolve(process.cwd(), ".env")`. `.env.local` is never opened. Measured: `npm run
db:migrate` from the host today fails `getaddrinfo EAI_AGAIN postgres` — the `.env` value, not the
`.env.local` value. Editing `.env.local:1` from `5432` to `5433` would change nothing. Worse, `.env`
and `.env.local` are both **gitignored and untracked**, so neither is shippable to a self-hoster;
the tracked artifact that a reader actually copies is `.env.example:2`, which also prints `5432`.

**Third, the Node floor is worse than the backlog records, and its own binding constraint has
moved.** `node:20-alpine` resolves to **v20.20.2** today, and Node 20 reached **end of life on
2026-04-30** (verified against `nodejs/Release`'s `schedule.json`) — the production container runs
an unpatched runtime, which makes DEPLOY-03 a live security posture item, not a latent one. The
binding engines floor is no longer vite's `^20.19.0 || >=22.12.0`; it is
`@napi-rs/lzma-linux-x64-gnu`'s `^22.20 || ^24.12 || >=25` (reached via `rollup`). Checking all 834
declared `engines.node` ranges in the lockfile: v20.20.2 → **1 violation**, v22.23.2 → 0, v24.19.0 →
**0**. Node 24 is the current **Active LTS** (maintenance 2026-10-20, EOL 2028-04-30) and is what CI
already pins, so `node:24-alpine` is both the correct target and the one that closes the
container/CI divergence 999.14 complained about.

**Primary recommendation:** prepend both `CREATE TABLE` statements plus the one declared index to
`drizzle/0006_import-sessions-user-id.sql` (verified safe — the migrator skips by journal timestamp
and never re-hashes; no renumber, so the "0018 is taken" problem never arises); make `.env` /
`.env.example` describe the **host** connection (`localhost:5433`) and have `docker-compose.yml`
construct the container's `postgres:5432` URL itself; move all three Dockerfile pins to
`node:24-alpine`; and ship three gates — a static snapshot-vs-SQL check, a from-zero database build
with a catalog-level equivalence assertion, and a lockfile-derived Node floor check — each of which
has a designed, cheap negative control.

---

## Corrections to CONTEXT.md

These three items override the corresponding lines in `46-CONTEXT.md`. Each is measured.

### C1 — the defect is not singular: `webhook_deliveries` is also missing (DEPLOY-01)

CONTEXT says *"The defect is concrete and singular"*. It is not.

An audit of all 20 migrations for tables that are `ALTER`ed / referenced but never `CREATE`d finds
only `import_sessions` — because `webhook_deliveries` is never *referenced* either. It is simply
absent. Comparing table sets three ways [VERIFIED: executed 2026-08-24]:

```
snapshot 0019 tables:      36
live database tables:      36
migration-built tables:    35

IN SNAPSHOT, NOT BUILT BY MIGRATIONS: [ 'webhook_deliveries' ]
IN LIVE,     NOT BUILT BY MIGRATIONS: [ 'webhook_deliveries' ]
BUILT BY MIGRATIONS, NOT IN LIVE:     []
```

Both tables first appear in `drizzle/meta/0006_snapshot.json` (18 → 20 tables at that step):

| snapshot | `import_sessions` | `webhook_deliveries` | table count |
|---|---|---|---|
| 0005 | no | no | 18 |
| **0006** | **YES** | **YES** | **20** |
| 0019 | YES | YES | 36 |

`drizzle/0006_import-sessions-user-id.sql` is 2 lines, both `ALTER`. Its hand-chosen tag (every
drizzle-generated tag in this chain is a random name like `0005_happy_joseph`) is the tell: the file
was hand-written and both `CREATE TABLE`s were lost. **The fix must restore both.**

Runtime blast radius of the silent one: `src/lib/api/webhooks/deliver.ts:61` does
`await db.insert(webhookDeliveries)`. On a migration-built install every webhook delivery raises
`42P01`, with a green migrate behind it.

### C2 — `drizzle-kit` never reads `.env.local`; the fix must move (DEPLOY-02)

CONTEXT locks *"`.env.local:1` … Fix it to `5433`"* and *"Keep the Docker-internal
`postgresql://…@postgres:5432` in `.env` untouched"*. Both halves are wrong for the stated goal.

**Source evidence.** `node_modules/drizzle-kit/bin.cjs:93321-93330`:

```js
// ../node_modules/.pnpm/dotenv@16.5.0/node_modules/dotenv/config.js
(function() {
  require_main().config(
    Object.assign({}, require_env_options(), require_cli_options()(process.argv))
  );
})();
```

`require_main()`'s `configDotenv`, `bin.cjs:754`:

```js
const dotenvPath = path4.resolve(process.cwd(), ".env");
```

`optionPaths` is `[dotenvPath]` unless `options.path` is supplied — drizzle-kit supplies nothing.
The string `.env.local` does not occur anywhere in `bin.cjs`. dotenv also defaults to
`override: false`, which is why an inline `DATABASE_URL=… npx drizzle-kit migrate` wins — the
workaround every phase since 33 has paid.

**Behavioural evidence.** `npm run db:migrate` from the host, unmodified, 2026-08-24:

```
Using 'postgres' driver for database querying
DrizzleQueryError: Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"
  cause: Error: getaddrinfo EAI_AGAIN postgres
    hostname: 'postgres'
```

It resolved `postgres` — the `.env` value. `.env.local`'s `localhost:5432` never entered the
picture. Correcting `.env.local` to `5433` produces exactly the same failure.

**Shippability evidence.** `git check-ignore -v` → `.gitignore:34 → .env`, `.gitignore:35 → .env.local`.
`git ls-files` returns only `.env.example`. Neither file a reader would edit is in the repository; the
one that is, `.env.example:2`, prints `postgresql://user:password@localhost:5432/pipelite`.

**Where the container gets its URL.** Verified `/app/.env` and `/app/.env.local` do **not exist**
inside `pipelite-app-1` (the runner stage copies only named paths). The entrypoint's
`npx drizzle-kit migrate` therefore reads the compose-injected `DATABASE_URL` and finds no `.env` to
load. Host and container are already cleanly separated — nothing about a host-side `.env` can reach
the container.

**Consequence for the plan:** the correct edit is to `.env.example` (tracked), `.env` (this machine),
and `docker-compose.yml`. See §Architecture Patterns P4.

### C3 — Node 20 is EOL, and the binding floor is no longer vite (DEPLOY-03)

Backlog 999.14 says *"latent rather than broken"* and names `vite@7.3.1`'s `^20.19.0 || >=22.12.0`.
Both statements are now stale.

[VERIFIED: `https://raw.githubusercontent.com/nodejs/Release/main/schedule.json`, fetched 2026-08-24]

| major | status at 2026-08-24 | LTS start | maintenance | EOL |
|---|---|---|---|---|
| v20 | **EOL** | 2023-10-24 | 2024-10-22 | **2026-04-30** |
| v22 | Maintenance | 2024-10-29 | 2025-10-21 | 2027-04-30 |
| **v24** | **ACTIVE LTS** | 2025-10-28 | 2026-10-20 | 2028-04-30 |
| v26 | pending (Current) | 2026-10-28 | 2027-10-20 | 2029-04-30 |

[VERIFIED: `docker run --rm node:<tag> node -v`, 2026-08-24]

| tag | resolves to |
|---|---|
| `node:20-alpine` | v20.20.2 |
| `node:22-alpine` | v22.23.2 |
| `node:24-alpine` | **v24.19.0** |
| `node:26-alpine` | v26.7.0 |

[VERIFIED: 834 declared `engines.node` ranges in `package-lock.json`, checked with `semver.satisfies`]

| Node | violations | which |
|---|---|---|
| 18.20.8 | 10 | (historic reference) |
| **20.20.2** | **1** | `@napi-rs/lzma-linux-x64-gnu` requires `^22.20 \|\| ^24.12 \|\| >=25` |
| 22.11.0 | 3 | + vite, + eslint-visitor-keys |
| 22.12.0 | 2 | vite now satisfied; lzma + visitor-keys still violated |
| 22.23.2 | 0 | — |
| **24.19.0** | **0** | — |

`@napi-rs/lzma-linux-x64-gnu` arrives via `rollup` (`optional: true`, `os: ["linux"]`, `cpu: ["x64"]`,
**no `libc` field** — so npm does not filter it out on alpine/musl). Its `^24.12` term is the reason
a major-only pin must still be validated against the image's *actual* version: `node:24-alpine`
satisfies it at v24.19.0, but "major 24" alone does not.

**Target: `node:24-alpine`.** It is the lowest Active LTS satisfying the computed floor (CONTEXT's
own rule), it is major-only (CONTEXT's own pinning style), and it equals what `ci.yml:52` already
pins — closing the container/CI divergence 999.14 named.


### C4 — `pg_dump`/`psql` are absent from the host; catalog queries replace the dump diff (DEPLOY-01 SC-1)

CONTEXT's *Equivalence proof* block locks *"a table-by-table, column-by-column diff of two
`pg_dump --schema-only` outputs"*. Measured 2026-08-24: **neither `pg_dump` nor `psql` is installed on
this host at all** (§ Environment Availability). The decision's stated *mechanism* is unavailable.

**Substitution:** ten catalog-level queries issued through the already-present `postgres` driver —
tables, columns, indexes, constraints, enums, functions, extensions, defaults, nullability, and
generated-column expressions. This preserves the decision's *intent* exactly (table-by-table and
column-by-column, proved rather than inferred from a clean exit) and is strictly stronger in one
respect: it is immune to `pg_dump`'s random `\restrict` token and `SET`-preamble noise, which is the
reason CONTEXT itself had to say "normalise dump noise before diffing; do not `diff` raw dumps."

Measured on the repaired chain: tables 36=36, columns 293=293, indexes 81=81, constraints 83=83,
enums 9=9, functions 38=38, extensions 3=3 — all identical, including the four `GENERATED ALWAYS`
columns `dedup-db-test-setup.sh` cites as its reason for needing a dump.

This is a mechanism correction only. SC-1 is unchanged and is still proved by comparison, not by
absence of error.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema creation from zero | Migration chain (`drizzle/*.sql` + `_journal.json`) | — | The chain is the only artifact a clone carries; the DB is downstream of it |
| Migration ordering / skip decision | `drizzle-orm` `PgDialect.migrate` (library) | `drizzle-kit` CLI (driver selection only) | Skip semantics live in drizzle-orm, not the CLI — verified below |
| Applying migrations at deploy | `docker-entrypoint.sh` (container boot) | Operator CLI (`docker compose exec app …`) | `set -e` at entrypoint means a broken chain is a crash-loop, not a warning |
| Host→DB connection string | `.env` (host processes) + `.env.example` (what a clone ships) | `docker-compose.yml` `environment:` (container processes) | dotenv only reads `.env`; the container has no `.env` at all |
| Container→DB connection string | `docker-compose.yml` `services.app.environment` | — | Should be constructed by compose, never inherited from a host-oriented `.env` |
| Node runtime floor declaration | `package-lock.json` `packages[*].engines.node` | `package.json` `engines` (absent today) | 834 transitive declarations; the truth is the lockfile, not any single package |
| Node runtime floor enforcement | `Dockerfile` `FROM node:…` (3 stages) | `.github/workflows/ci.yml` `setup-node` | Two independent pins today; the gate must bind them to the lockfile, not to each other |
| Chain-integrity gate (static) | vitest, base project (`src/lib/__tests__/`) | — | Runs in CI with no DB; catches the silent class (`webhook_deliveries`) |
| Chain-integrity gate (behavioural) | `scripts/` + npm script + CI job with a Postgres service | — | Only a real from-zero build proves SC-1/SC-2 |

---

## Standard Stack

### Core (all already installed — this phase adds exactly one dependency)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | 0.45.1 (installed; `^0.45.1`) | Owns `PgDialect.migrate` — the skip + transaction semantics this phase turns on | Already the project's ORM [VERIFIED: `node_modules/drizzle-orm/package.json`] |
| `drizzle-kit` | 0.31.9 (installed; `^0.31.9`) | The `migrate` / `generate` CLI the docs print | Already the project's migration CLI [VERIFIED: `node_modules/drizzle-kit/package.json`] |
| `postgres` (postgres.js) | 3.4.8, direct dependency | The driver drizzle-kit actually selects, and the one a Node-based gate should use for scratch-DB DDL | `pg` is **ABSENT** from the tree, so `bin.cjs:80593`'s `checkPackage("pg")` falls through to `bin.cjs:80662`'s `checkPackage("postgres")` [VERIFIED] |
| `vitest` | ^4.0.18 (devDep) | Host for the static chain-integrity and Node-floor gates; runs in CI via `npm test` | Established: `src/lib/__tests__/compose-uploads-persistence.test.ts` is the in-repo precedent for infra assertions |
| `yaml` | ^2.8.2, direct dependency | Parse `docker-compose.yml` in a gate rather than regexing it | Already used for exactly this at `compose-uploads-persistence.test.ts:45` |

### Supporting — the one addition

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `semver` | 7.8.5 (add as **devDependency**) | `semver.satisfies(actualNodeVersion, declaredRange)` for all 834 lockfile ranges | Required by the DEPLOY-03 gate. See the caveat below — do not rely on the hoisted copy |

**Why `semver` must be declared explicitly.** `node_modules/semver` today is **6.3.1**, hoisted as a
transitive of a non-dev package; the 7.x copies are nested under
`@typescript-eslint/typescript-estree`, `is-bun-module` and `sharp`. Neither `dependencies` nor
`devDependencies` names it. A gate importing an undeclared hoisted transitive is one `npm dedupe`
away from resolving differently or vanishing — precisely the "gate goes stale silently" failure this
phase exists to prevent. [VERIFIED: `package-lock.json` inspection]

**Do not hand-roll the range check.** Union-ing 106 distinct range expressions is the wrong problem
and is unnecessary: the correct algorithm never computes a union. See §Code Examples 5.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Prepend `CREATE TABLE` into `0006` | Renumber `0006`…`0019` → `0007`…`0020` + new `0006_create_*` | Renumber is **not needed** — skip is by timestamp, never by hash (proof below). It also rewrites 14 filenames and `_journal.json`, and re-opens the "`0018` is taken" problem CONTEXT flags. Reject |
| Prepend into `0006` | Append a new `0020_create_missing_tables.sql` | Would fix a *future* fresh build only if `0006`'s `ALTER` no longer ran first — it still would, and would still die `42P01`. Does not work. Reject |
| Node-based gate using `postgres` | bash + `psql` via `docker exec` | The host has **no `psql` and no `pg_dump`** (`command -v` → exit 1). CI's `psql` availability is unverified. A Node gate using the already-present `postgres` driver runs identically on host, in Docker and in CI |
| `semver` devDependency | `npx semver` | `npx` on an undeclared package downloads at gate time — a network dependency inside a correctness gate, and an unpinned execution. Reject |
| `node:24-alpine` | `node:22-alpine` | v22.23.2 also passes today, but v22 is **Maintenance** (EOL 2027-04-30) and CONTEXT locks "lowest **Active LTS**". Also leaves the CI(24)/container(22) divergence open. Reject |
| `node:24-alpine` | `node:26-alpine` | v26 is Current, LTS only from 2026-10-28. CONTEXT: "Do not chase Current." Reject |
| Add Postgres service to `ci.yml` | New workflow file `migrations.yml` | See Pitfall 7 — this is a genuine fork in the road with a same-commit trap either way |

**Installation:**

```bash
npm install --save-dev semver
```

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `semver` | npm | 15 yrs (created 2011-02-12) | 844,142,376 / week | `git+https://github.com/npm/node-semver.git` | `[OK]` | **Approved** |

**Packages removed due to slopcheck `[SLOP]` verdict:** none
**Packages flagged as suspicious `[SUS]`:** none

Verification performed 2026-08-24:
- `slopcheck install semver` → `[OK] semver (npm)` — `scanned 1 packages, 1 OK`
- `npm view semver version` → `7.8.5`
- `npm view semver scripts.postinstall` → *(empty — no postinstall script)*
- `npm view semver repository.url` → `git+https://github.com/npm/node-semver.git` (the npm org's own package)

> ⚠ **Operational warning for the executor.** `slopcheck install <pkg>` does **not** dry-run — it
> literally executes `npm install <pkg>` and mutates `package.json` + `package-lock.json`. During
> this research it added `semver` and re-resolved 107 lockfile lines; the tree was restored with
> `git checkout -- package.json package-lock.json` and the repo verified clean. If the executor
> re-runs the legitimacy gate, either accept the install as the real one or revert it deliberately.

`semver` is the only package this phase adds. Every other tool it uses is already a direct
dependency.

---

## Architecture Patterns

### System Architecture Diagram

```
                       ┌───────────────────────────────────────────┐
   a clone of the repo │  drizzle/*.sql  +  drizzle/meta/_journal   │
                       │  drizzle/meta/NNNN_snapshot.json          │
                       │  src/db/schema/*.ts                       │
                       └───────────────┬───────────────────────────┘
                                       │
              ┌────────────────────────┼─────────────────────────────┐
              │                        │                             │
   ┌──────────▼─────────┐   ┌──────────▼──────────┐      ┌───────────▼───────────┐
   │ GATE A (static)    │   │ drizzle-kit migrate │      │ drizzle-kit generate  │
   │ vitest, no DB      │   │                     │      │ (schema → snapshot)   │
   │ snapshot tables    │   │ reads _journal.json │      └───────────┬───────────┘
   │   ⊆ CREATE TABLEs  │   │  ▼                  │                  │
   │ across all *.sql   │   │ readMigrationFiles  │      "No schema changes" today
   └────────────────────┘   │  ▼                  │      ⇒ snapshots ARE level with
                            │ PgDialect.migrate   │        src/db/schema  [VERIFIED]
                            │  1 CREATE SCHEMA    │
                            │    drizzle   ◄──── OUTSIDE the txn (survives failure)
                            │  2 CREATE TABLE     │
                            │    __drizzle_migr.  │
                            │  3 SELECT max(      │
                            │      created_at)    │
                            │  4 BEGIN ───────────┼──► for each journal entry:
                            │      apply if       │       last.created_at < entry.when
                            │    COMMIT/ROLLBACK  │       (hash stored, NEVER compared)
                            └──────────┬──────────┘
                                       │
              ┌────────────────────────┴──────────────────┐
              │                                            │
   ┌──────────▼──────────────┐               ┌─────────────▼─────────────────┐
   │ HOST path (DEPLOY-02)   │               │ CONTAINER path                │
   │ cwd=repo root           │               │ docker-entrypoint.sh:5        │
   │ dotenv reads ONLY .env  │               │ no .env exists in the image   │
   │ ⇒ .env MUST be the      │               │ ⇒ DATABASE_URL comes from     │
   │   HOST url (5433)       │               │   docker-compose environment: │
   └──────────┬──────────────┘               └─────────────┬─────────────────┘
              │                                            │  set -e ⇒ a broken
              │                                            │  chain = crash-loop
              ▼                                            ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │ GATE B (behavioural): scratch DB ← migrate from zero                  │
   │   assert public table set  ==  live/expected table set                │
   │   assert columns, indexes, constraints, enums, functions, extensions  │
   │   drop in finally/trap                                                │
   └───────────────────────────────┬───────────────────────────────────────┘
                                   ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │ SC-2: app container ← that DB only  ⇒  GET /api/health == 200         │
   └───────────────────────────────────────────────────────────────────────┘

   ┌───────────────────────────────────────────────────────────────────────┐
   │ GATE C (DEPLOY-03): package-lock engines.node ──┐                     │
   │                     Dockerfile FROM node:<tag> ─┴─► semver.satisfies  │
   │                     (all 3 stages, asserted equal)                    │
   └───────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
drizzle/
└── 0006_import-sessions-user-id.sql   # ← both CREATE TABLEs prepended; no renumber
scripts/
└── migrate-from-zero.mjs              # ← new; Node, uses `postgres` (no psql on host)
src/lib/__tests__/
├── compose-uploads-persistence.test.ts   # existing — MUST be amended (Pitfall 6)
├── deployment-docs-accuracy.test.ts      # existing — doc reconciliation lands here
├── migration-chain-integrity.test.ts     # ← new GATE A (static, DB-free, runs in CI)
└── node-engines-floor.test.ts            # ← new GATE C (static, DB-free, runs in CI)
src/lib/mutations/__tests__/
└── db-test-isolation.test.ts          # existing — MUST be amended if ci.yml gains postgres
.github/workflows/
└── ci.yml                             # ← GATE B wiring (see Pitfall 7)
```

### Pattern 1 — Prepend, do not renumber (skip is by timestamp, hash is never compared)

**What:** Add the missing DDL to the *head* of the already-applied `0006` file.
**When to use:** Whenever a migration file's content must change but its journal entry must stay.

**Why it is safe — the exact code.** `drizzle-kit migrate` → `preparePostgresDB` →
(`pg` absent) → `bin.cjs:80662` `checkPackage("postgres")` → `drizzle-orm/postgres-js/migrator` →
`db.dialect.migrate(...)` → `node_modules/drizzle-orm/pg-core/dialect.js:44-71`:

```js
// node_modules/drizzle-orm/pg-core/dialect.js:54-71  [VERIFIED: installed source]
await session.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);
await session.execute(migrationTableCreate);                     // ← both OUTSIDE the transaction
const dbMigrations = await session.all(
  sql`select id, hash, created_at from ${...} order by created_at desc limit 1`
);
const lastDbMigration = dbMigrations[0];
await session.transaction(async (tx) => {                        // ← ONE txn for ALL migrations
  for await (const migration of migrations) {
    if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) {
      for (const stmt of migration.sql) { await tx.execute(sql.raw(stmt)); }
      await tx.execute(sql`insert into ${...} ("hash", "created_at") values(${migration.hash}, ${migration.folderMillis})`);
    }
  }
});
```

Three facts follow, all load-bearing:

1. **Skip is a `<` on `created_at` vs the journal's `when`.** The `hash` is *written* and never
   *read back for comparison*. Editing an already-applied file is invisible to an existing database.
   `readMigrationFiles` (`node_modules/drizzle-orm/migrator.js`) computes the sha256 but only for
   the insert. **Answers CONTEXT's open question: prepend is safe; no renumber.**
2. **Only the single most recent row is fetched** (`order by created_at desc limit 1`). Applying is
   therefore strictly "everything newer than the high-water mark".
3. **The whole loop is one transaction** — Postgres has transactional DDL, so a failure rolls back
   every table. Confirms SC-1.

**Confirmed against this deployment's actual ledger** [VERIFIED: `select … from drizzle.__drizzle_migrations`]:
12 rows; the first is a synthetic baseline (`created_at=1774574267000`, a 32-char md5-length hash —
not sha256, i.e. hand-seeded after a `db:push`), the remaining 11 are journal entries 9–19. The
high-water mark is `1787441440793` = entry 19's `when`. `0006`'s `when` is `1774267074360`, far
below it → **the edited `0006` will be skipped on this database.** No data risk.

**Snapshots need no change.** `drizzle-kit generate` against the current tree prints *"No schema
changes, nothing to migrate 😴"* and produces a byte-identical `drizzle/` [VERIFIED]. The snapshot
chain is already level with `src/db/schema/`; restoring the SQL brings the *emitted DDL* level with
the snapshots that always described it.

### Pattern 2 — GATE A: static snapshot-vs-SQL integrity (catches the silent class)

**What:** A DB-free vitest test asserting every table in the final snapshot is created by some
migration.
**When to use:** Always — this is the check that would have caught `webhook_deliveries`, which no
runtime error and no `42P01` ever surfaces.

It parses `drizzle/meta/_journal.json`, walks each `drizzle/<tag>.sql` in journal order collecting
`CREATE TABLE` names, and diffs that set against `Object.keys(drizzle/meta/<last>_snapshot.json.tables)`.
It should additionally assert the *ordering* property: no `ALTER TABLE X` / `REFERENCES X` /
`CREATE INDEX … ON X` may appear before X's `CREATE TABLE` in chain order — that is the check that
catches the `import_sessions` class before anyone runs a database.

Anti-vacuity floors it needs (per the house style in `compose-uploads-persistence.test.ts:64` and
`deployment-docs-accuracy.test.ts:267`):
- the journal parsed ≥ 20 entries,
- the `CREATE TABLE` matcher found ≥ 34 tables (it finds exactly 34 today; 36 after the fix),
- the snapshot parsed ≥ 36 tables.

Without those floors a broken regex yields two empty sets and the subset assertion passes.

### Pattern 3 — GATE B: from-zero build with a catalog-level equivalence assertion

**What:** Create a uniquely-named scratch database, migrate it from zero, compare the resulting
*catalog* against the expected schema, drop it in a `finally`.

**Do not `diff` raw `pg_dump` output.** CONTEXT anticipated normalisation pain; the measured reality
is worse and better at once. `pg_dump` from `postgres:16-alpine` emits `\restrict <random-token>` /
`\unrestrict <random-token>` lines whose token **changes on every invocation**, plus a `SET`
preamble, `OWNER TO`, and a version banner. Normalising all of that is fragile busywork.

**Compare the catalog instead.** Nine `information_schema` / `pg_catalog` queries, each run against
both databases and sorted, give a far stronger and far more readable assertion. Measured result of
exactly this comparison, live vs a database built only by the repaired chain:

| dimension | live | migration-built | verdict |
|---|---|---|---|
| tables (`information_schema.tables`, `public`) | 36 | 36 | **IDENTICAL** |
| columns (name/type/nullable/default/generated) | 293 | 293 | **IDENTICAL** |
| indexes (`pg_indexes.indexdef`) | 81 | 81 | **IDENTICAL** |
| constraints (`pg_get_constraintdef`) | 83 | 83 | **IDENTICAL** |
| enums (`pg_enum` labels) | 9 | 9 | **IDENTICAL** |
| functions (`pg_proc` + identity args) | 38 | 38 | **IDENTICAL** |
| extensions (`pg_extension`) | 3 | 3 | **IDENTICAL** |
| triggers / sequences / views | 0 / 0 / 0 | 0 / 0 / 0 | **IDENTICAL** |

Including the four `GENERATED ALWAYS` columns (`organizations.norm_name`, `people.norm_name`,
`people.norm_email`, `people.norm_phone`) that `scripts/dedup-db-test-setup.sh:26-30` cites as the
reason a schema dump was needed instead of migrations.

**⚠ Exclude `ordinal_position` from the column comparison.** With it included the comparison shows
~12 differences on `activities` and `deals` — same columns, same types, same defaults, different
physical order, because the live database received several columns via `db:push`/`ALTER` in a
different order than the chain adds them. Physical column order affects only `SELECT *` and
`INSERT` without a column list; Drizzle always names columns. Including it makes the gate
permanently red for a reason that does not matter — and an executor will then "fix" it by weakening
the whole assertion.

**Scratch-database mechanics that were verified to work:**
- `CREATE DATABASE` / `DROP DATABASE` cannot run inside a transaction — issue them on their own
  connection to the `postgres` database.
- Reach the server the way `scripts/dedup-db-test-setup.sh:63` does — `docker ps --filter
  'name=pipelite-postgres'`, **not** `docker compose exec`. `use_worktrees: true` is set in
  `.planning/config.json`, and from a worktree `docker compose` infers a different project name and
  can start a second stack. This is a recorded, load-bearing precedent, not a style preference.
- Or, better for portability, skip `docker exec` entirely: connect with the `postgres` driver over
  `localhost:5433`. The host has **no `psql` and no `pg_dump`** (verified), so a Node gate is the
  only form that runs unchanged on host and in CI.
- Name the scratch DB uniquely (`pipelite_migchk_${Date.now()}` or `_${process.pid}`) and drop it in
  a `finally`, plus a `DROP DATABASE IF EXISTS` up front so a previously leaked one cannot poison a
  run.
- **Fence it like the dedup script does:** the target name must match a literal pattern and must
  never equal `pipelite`. The dedup script's three-fence design (`scripts/dedup-db-test-setup.sh:53-61`,
  and the `current_database() <> …` guard) is the in-repo standard and `db-test-isolation.test.ts:221-240`
  asserts it — mirror it.

**Its negative control (SC-3), designed up front:** delete the prepended `import_sessions` DDL from
`0006`, run the gate, observe `42P01` and a non-zero exit; restore, observe green. And a *second*
control for the silent class: delete the prepended `webhook_deliveries` DDL, run the gate, observe
it go red on the **table-set** assertion while `drizzle-kit migrate` itself exits **0**. That second
control is the one that proves the gate is stronger than the exit code — record both in the SUMMARY.

### Pattern 4 — DEPLOY-02: `.env` describes the host; compose constructs the container's URL

**What:** Invert which file owns which perspective.

```yaml
# docker-compose.yml, services.app.environment
#
# CONSTRUCTED HERE, not inherited from ${DATABASE_URL}. `postgres` is the compose service
# name and resolves only inside this network; the host cannot resolve it (EAI_AGAIN), and
# drizzle-kit on the host reads ONLY `.env` (dotenv, drizzle-kit/bin.cjs:754 — it never opens
# .env.local). So `.env` must carry the HOST url or every documented host-side migrate command
# fails. Changing this line back to ${DATABASE_URL} re-breaks `npm run db:migrate` from the host.
- DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
```

```bash
# .env.example  (and .env on this machine)
# HOST-side connection. docker-compose.yml publishes Postgres on 5433 (5433:5432), and this is
# the value `npx drizzle-kit migrate` / `npm run db:migrate` use when run from the host. The
# CONTAINER's url is built by docker-compose.yml itself and is NOT this value — do not "fix"
# this to @postgres:5432; that hostname does not resolve outside the compose network.
DATABASE_URL="postgresql://pipelite:pipelite@localhost:5433/pipelite"
```

Why this shape and not the alternatives:

- It makes the *printed* command work verbatim. 12 of the 14 doc sites print `npx drizzle-kit
  migrate` directly, not `npm run db:migrate` — so any fix implemented as an npm-script wrapper
  (`dotenv -e .env.local -- …`) fixes at most 2 of 14 and adds a dependency.
- It requires no new dependency. Making `drizzle.config.ts` load `.env.local` would need `dotenv`,
  which is **not** a direct dependency (drizzle-kit only bundles it).
- It cannot regress the container: `/app/.env` does not exist in the image [VERIFIED], and dotenv
  defaults to `override: false`, so the compose-injected value always wins inside the container.
- `.env` already contains the precedent: `E2E_DATABASE_URL=postgresql://…@localhost:5433/pipelite`
  with a comment explaining the host/container split. This change makes `DATABASE_URL` consistent
  with the file's own existing convention (and arguably makes `E2E_DATABASE_URL` redundant — leave it,
  descoping is not this phase's business).

**Doc sites to reconcile in the same commit** [VERIFIED: all located by content scan]:

| File:line | Prints | Perspective |
|---|---|---|
| `README.md:67` | `npm run db:migrate` | host (Manual Setup) |
| `README.md` env block | `DATABASE_URL="postgresql://user:password@localhost:5432/pipelite"` | host — wrong port |
| `.env.example:2` | `postgresql://user:password@localhost:5432/pipelite` | host — wrong port; comment at `:4-9` also needs rewriting |
| `docs/development/contributing.md:52` | `npx drizzle-kit migrate` (step 6) | host; step 5 at `:43` prints `localhost:5432` |
| `docs/development/database.md:179` | `npx drizzle-kit migrate` | host |
| `docs/admin/configuration.md:51` | `npx drizzle-kit migrate` | generic |
| `docs/admin/deployment/bare-metal.md:44`, `:217`, `:403` | `npx drizzle-kit migrate` | operator's own Postgres — **leave 5432 alone here** |
| `docs/admin/deployment/docker.md:173`, `:336` | `docker compose exec app npx drizzle-kit migrate` | container — already correct |
| `docs/admin/deployment/vercel.md:156`, `:173` | `npx drizzle-kit migrate` | managed DB — leave |
| `docs/admin/troubleshooting.md:431`, `:434`, `:465` | `npx drizzle-kit migrate` | check context per site |
| `docs/admin/backup-restore.md:195` | `docker compose exec -T app npx drizzle-kit migrate` | container — already correct |

### Pattern 5 — GATE C: bind the image tag to the lockfile, never to a literal

**What:** Parse **every** `FROM node:<tag>` in the `Dockerfile`, assert they are all identical
(catching "changed one of three"), resolve the tag's actual version, and check it against all 834
declared ranges with `semver.satisfies`.

**The union problem is a red herring.** You never need to union 106 ranges. You need one concrete
version and a `satisfies` call per range. See §Code Examples 5.

**Where the "actual version" comes from — pick deliberately:**

| Source | Pros | Cons |
|---|---|---|
| `docker run --rm node:24-alpine node -v` | Exact truth | Needs Docker + Docker Hub in CI; rate limits |
| A committed `.node-version` / `package.json engines` that the Dockerfile tag must match | No network | Only as true as the file |
| Parse major from the tag, then require every range to be satisfiable by *the minimum* version of that major | No network | **Would fail today**: `^24.12` is not satisfied by `24.0.0`, so `node:24-alpine` would be reported red though it is green |

**Recommended:** assert *structurally* in vitest (all three `FROM` lines equal; a
`package.json` `engines.node` field, newly added, whose major equals the tag's major), and check the
*actual* version behaviourally in the CI job that already builds/runs the image — or with a single
`docker run --rm node:$TAG node -v` in the gate script, degrading to the structural check with an
explicit skip message when Docker is unavailable. **Never silently pass when Docker is absent.**

**Add `engines` to `package.json`.** It has none today [VERIFIED]. Adding
`"engines": { "node": ">=24.12" }` (or whatever the computed floor resolves to) gives the gate a
declared, tracked anchor and makes `npm install` warn a self-hoster on a stale Node. It must be
*derived* from the lockfile computation at plan time, not typed from memory — and the gate should
assert the declared floor is itself satisfied by the tag, so the two cannot drift.

### Anti-Patterns to Avoid

- **Trusting `migrations applied successfully!`.** `docs/admin/backup-restore.md:200-210` already
  documents, with measured output, that drizzle prints the identical success line for 0 applied
  migrations and for 20. This is one of the v1.3 vacuous gates. A gate that greps for that line is
  the seventh one. Assert the **catalog**.
- **Asserting "0 tables" without a schema qualifier.** On the failed run the `drizzle` schema still
  contains `__drizzle_migrations` — it is created *before* `session.transaction`. Measured after the
  `42P01`: `public` tables = **0**, `drizzle` tables = **1**, `__drizzle_migrations` rows = **0**. A
  gate written as `count(*) from information_schema.tables where table_schema not in
  ('pg_catalog','information_schema')` returns 1, not 0, and will be "fixed" by weakening it.
- **`diff`ing raw `pg_dump` output.** The `\restrict <token>` line changes every invocation.
- **Regexing `docker-compose.yml`.** `compose-uploads-persistence.test.ts:26-31` states the rule:
  parse with `yaml`; indentation is what decides whether `volumes:` belongs to `app` or to the
  document.
- **`docker compose exec` inside a script that runs from a worktree.** Different inferred project
  name → a second stack. Use `docker ps --filter name=…` (`dedup-db-test-setup.sh:63`) or connect
  over TCP.
- **Changing one of the three `FROM node:` lines.** Explicitly called out by CONTEXT and by
  backlog 999.14's re-verification.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Semver range satisfaction | A regex over `>=`, `^`, `\|\|` | `semver.satisfies()` | 106 distinct range grammars in this lockfile alone, including `>= 0.4`, `4.x \|\| >=6.0.0`, `6.* \|\| 8.* \|\| >= 10.*`, `>=9.3.0 \|\| >=8.10.0 <9.0.0`. A hand-rolled parser will silently mis-handle one and the gate goes quietly green |
| Computing "the highest floor" | Range-union arithmetic | Test one concrete version against every range | Union of arbitrary semver ranges is genuinely hard and **is not the question being asked**. The question is "does the container's Node satisfy all of them" |
| Comparing two schemas | A normaliser for `pg_dump` text | Nine catalog queries + sorted diff | Dump text carries per-invocation random tokens, ownership, a version banner and a `SET` preamble. The catalog carries none of it and yields a readable failure |
| Parsing `docker-compose.yml` | Regex | `yaml` (already a direct dependency) | Established at `compose-uploads-persistence.test.ts:45`, with the reasoning written into the file |
| Migration ordering / skip logic | Re-implementing "which migrations to apply" | `drizzle-kit migrate` | Its semantics are now known exactly (see Pattern 1); duplicating them creates a second source of truth |
| Scratch DB lifecycle | Ad-hoc create/drop | Mirror `scripts/dedup-db-test-setup.sh` | It already solved the fencing, the worktree problem, and the no-credential-on-a-command-line problem, and `db-test-isolation.test.ts:221-240` gates that design |

**Key insight:** every one of this phase's gates is a *checker*, and this project's recorded failure
mode is checkers that cannot fail. The libraries above are not conveniences — each replaces a
hand-rolled component whose most likely bug is *passing when it should not*.

---

## Runtime State Inventory

This phase changes migration files and connection strings, so the "what still holds the old value at
runtime" question applies.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `drizzle.__drizzle_migrations` in the live `pipelite` database: **12 rows**, high-water `created_at = 1787441440793` (= journal entry 19). Row 1 is a synthetic baseline with a 32-char md5-length hash, not sha256. | **None.** Editing `0006` is invisible: skip is `last.created_at < entry.when`, and `0006`'s `when` (1774267074360) is far below the high-water mark. The stored `hash` is never compared. **Verified by reading the ledger and the migrator source.** No data migration. |
| **Live service config** | `docker-compose.yml` `services.app.environment` currently reads `DATABASE_URL=${DATABASE_URL}` from the host `.env` at `up` time. The **running** `pipelite-app-1` container holds the old value in its environment. | `docker compose up -d` (recreate) after the compose edit. A `restart` re-runs the container with its **existing** env — it will not pick up the change. |
| **OS-registered state** | **None.** No systemd unit, launchd plist, pm2 saved process or Task Scheduler entry references the migration chain or `DATABASE_URL`. `pm2` appears only as documentation in `docs/admin/deployment/bare-metal.md`. Verified by content scan of the repo and by the absence of any such config. |
| **Secrets / env vars** | `.env` and `.env.local` are **gitignored and untracked** (`git check-ignore` → `.gitignore:34`, `:35`; `git ls-files` returns only `.env.example`). `.env` additionally holds `E2E_DATABASE_URL=…@localhost:5433/pipelite` — already the host form. No secret **name** changes; only `DATABASE_URL`'s **value** and which file is authoritative. | Edit `.env` on this machine (untracked, so it ships nothing) **and** `.env.example` (tracked, so it ships everything). A gate may assert on `.env.example` only. |
| **Build artifacts / installed packages** | The `pipelite-app` image embeds `node:20-alpine` in all three stages and a `node_modules` produced by `npm install --legacy-peer-deps` (`Dockerfile:7`) — **not** `npm ci`, so the in-image tree can legitimately differ from `package-lock.json`. `/app/.env` does **not** exist in the image (verified). `node_modules` on this host currently contains `semver@7.8.5` left behind by the slopcheck probe; the lockfile was reverted, so `npm ci` restores parity. | `docker compose up -d --build` is **mandatory** after the Dockerfile change — `restart` runs the old image (recorded project lesson). The `npm install` vs `npm ci` divergence is an open question, below. |

---

## Common Pitfalls

### Pitfall 1: Assuming `import_sessions` is the only missing table
**What goes wrong:** The chain is repaired, `drizzle-kit migrate` exits 0, everyone declares victory,
and the fresh database is still missing `webhook_deliveries`.
**Why it happens:** The obvious audit — "find tables that are `ALTER`ed or referenced but never
created" — finds only `import_sessions`, because `webhook_deliveries` is not referenced by any
migration either. It is simply absent, and absence produces no error.
**How to avoid:** Compare the **table set** of the migration-built database against the final
snapshot / the live database. Both gates (A static, B behavioural) must do this.
**Warning signs:** Migrate exits 0 but `select count(*) from information_schema.tables where
table_schema='public'` returns 35 instead of 36.

### Pitfall 2: Believing the `.env.local` story
**What goes wrong:** `.env.local:1` is changed to `5433`, the commit says "fixes DEPLOY-02", and
`npm run db:migrate` still fails — with `EAI_AGAIN postgres`, an error whose text does not mention
ports at all, so the next reader concludes the fix "didn't take" and adds an inline override again.
**Why it happens:** Both the backlog (999.20) and CONTEXT assert the `.env.local` mechanism. Neither
was tested. drizzle-kit's bundled dotenv resolves exactly one path: `cwd/.env` (`bin.cjs:754`).
**How to avoid:** Fix `.env` / `.env.example` / `docker-compose.yml` per Pattern 4. Verify by running
the printed command with `.env.local` **deleted** — it must still succeed.
**Warning signs:** the error names a *hostname* (`postgres`), not a port.

### Pitfall 3: Asserting "0 tables" after the failed run
**What goes wrong:** The negative control asserts "the failed migrate leaves zero tables", written as
`table_schema NOT IN ('pg_catalog','information_schema')`, and returns 1 — so the control is
"fixed" by relaxing it, destroying its value.
**Why it happens:** `CREATE SCHEMA drizzle` and `CREATE TABLE __drizzle_migrations` execute at
`dialect.js:54-55`, **before** `session.transaction` at `:60`. They survive the rollback.
**How to avoid:** Scope the assertion to `table_schema='public'`. Measured after the real `42P01`:
public = 0, drizzle = 1 table, 0 rows.

### Pitfall 4: Including `ordinal_position` in the equivalence comparison
**What goes wrong:** The gate is permanently red on ~12 `activities` / `deals` columns whose only
difference is physical order, and gets weakened to make it pass.
**Why it happens:** The live database received columns via `db:push`/`ALTER` in a different order
than the chain adds them. Same columns, same types, same defaults.
**How to avoid:** Compare `table_name|column_name|data_type|is_nullable|column_default|is_generated`
(+ `character_maximum_length`, `numeric_precision`, `generation_expression`) and **omit**
`ordinal_position`. Measured: **293 = 293, identical**, once it is omitted.

### Pitfall 5: Hand-writing the index and tripping the Phase 33 rule
**What goes wrong:** An executor reads CONTEXT's "never hand-write index SQL into a migration" and
omits `webhook_deliveries_status_next_attempt_idx` — leaving the equivalence gate red on 80 vs 81
indexes.
**Why it happens:** The rule's target is an index that exists *only* in SQL and is therefore dropped
by a later `generate`. Here the index is declared at `src/db/schema/webhook-deliveries.ts:20-21`
**and** recorded in `drizzle/meta/0006_snapshot.json`, so restoring it into `0006` is reproducing
generated output, not inventing SQL.
**How to avoid:** Restore exactly what the snapshot describes. Then prove it: `drizzle-kit generate`
must still print *"No schema changes"* afterwards.
**Warning signs:** index count 80 vs 81 in the catalog comparison.

### Pitfall 6: `compose-uploads-persistence.test.ts:210` asserts the exact line Pattern 4 changes
**What goes wrong:** `docker-compose.yml` is changed to construct the app's `DATABASE_URL`, and a
v1.3 gate goes red on an unrelated-looking file.
**Why it happens:**

```ts
// src/lib/__tests__/compose-uploads-persistence.test.ts:210
expect(appEnvironment()).toContain("DATABASE_URL=${DATABASE_URL}")
```

It is an **anti-vacuity anchor** ("read the app service, not an empty list"), so it must not simply
be deleted — it must be *re-anchored* onto another known-present entry (`SENTRY_DSN=${SENTRY_DSN}` on
line 211 already serves, and `UPLOAD_DIR=/app/uploads` is another) and, ideally, gain a positive
assertion that the new constructed URL is present and names `@postgres:5432`.
**How to avoid:** Amend it **in the same commit** as the compose change.

### Pitfall 7: `db-test-isolation.test.ts` forbids the word `postgres` in `ci.yml`
**What goes wrong:** A Postgres service is added to `.github/workflows/ci.yml` for GATE B and a
different v1.3 gate goes red:

```ts
// src/lib/mutations/__tests__/db-test-isolation.test.ts:137-141
it("declares no PostgreSQL service, so the exclusion is load-bearing …", () => {
  expect(workflow).not.toContain("services:")
  expect(workflow).not.toContain("postgres")
})
```

**Why it happens:** That gate protects a real invariant — the `vitest.db.config.ts` project must
never become reachable from the required `ci` check, because CI has no database and a permanently
pending required check makes every PR unmergeable (`vitest.db.config.ts` header; Phase 32). Its
*implementation* is a blunt proxy for that invariant.

**Two viable routes; the planner must pick one deliberately:**

| Route | What it costs | What it buys |
|---|---|---|
| **A — add `services: postgres` + a step to the existing `ci` job** | Must amend `db-test-isolation.test.ts:137-141` in the same commit, replacing the blunt negatives with assertions that express the real invariant (no step invokes `test:db` / `db.config`; the base vitest project still excludes the `db.test` glob). Every CI run now spins up Postgres. | GATE B is part of the **required** check `ci`. A regression cannot be merged. The test's own comment invites this: *"If a service container were ever added the reasoning in this file would change, and it should change deliberately."* |
| **B — new workflow file `.github/workflows/migrations.yml`** | `db-test-isolation.test.ts` reads only `.github/workflows/ci.yml` (`CI_WORKFLOW` constant, line ~44), so it stays green untouched. But the new check-run name is **not** in the master ruleset — it can go red without blocking a merge until a maintainer adds it, which is a manual, undocumented step. | `ci` stays fast and untouched; no v1.3 gate is modified. |

**Recommendation: Route A.** DEPLOY-01 is the requirement the whole milestone is sequenced behind;
a non-blocking check for it is a weaker guarantee than the one it replaces. Route A also improves
`db-test-isolation.test.ts` from a proxy assertion to a direct one. Whichever is chosen, the choice
and its reasoning belong in the plan, and the amended gate must be broken on purpose and observed
red.

### Pitfall 8: `docker compose restart` after the Dockerfile change
**What goes wrong:** The Node pins are updated, `restart` is run, and everything still runs
`node:20-alpine`.
**How to avoid:** `docker compose up -d --build`. Recorded project lesson; also note the related
lesson that a `--build` can hit the layer cache — verify the running container's Node with
`docker compose exec app node -v`, which is a behavioural check the layer cache cannot fake.

### Pitfall 9: `scripts/dedup-db-test-setup.sh:22-30` will become a documented lie
**What goes wrong:** DEPLOY-01 lands, and a 9-line comment block headed *"WHY A SCHEMA DUMP RATHER
THAN `drizzle-kit migrate`"* still asserts, in measured-sounding prose, that the chain does not
replay onto an empty database.
**Why it matters:** Document drift that describes a defect as current is exactly what let MIG-01
survive Phase 43. It is also the file `db-test-isolation.test.ts:221-229` reads, so it is
load-bearing.
**How to avoid:** Reconcile the comment in the same commit. Actually *converting* that script to
build from migrations is a larger change and is arguably out of scope ("any schema change not
strictly required") — but the comment must at minimum say the chain now replays and record why the
dump is still used (extensions, functions, faithfulness to the running deployment), or say it was
converted. Do not leave it asserting a fixed defect.

### Pitfall 10: `Dockerfile:7` uses `npm install --legacy-peer-deps`, not `npm ci`
**What goes wrong:** GATE C computes the floor from `package-lock.json`, but the tree the container
actually installs was resolved by `npm install`, which may re-resolve and can write a *different*
lockfile inside the image.
**Why it happens:** `--legacy-peer-deps` was presumably added for a peer conflict (`@auth/core` /
`nodemailer` warnings are visible on any install here). `npm install` is not lockfile-exact;
`npm ci --legacy-peer-deps` is.
**How to avoid:** Either switch `Dockerfile:7` to `npm ci --legacy-peer-deps` (behaviour-preserving
w.r.t. peer resolution, and makes the image tree match the lockfile the gate reads), or state
explicitly that the gate checks the *declared* floor rather than the *installed* one. Flagged as an
open question — it is adjacent to DEPLOY-03 but is not named by any success criterion.

---

## Code Examples

### 1. Reproducing the defect (measured 2026-08-24)

```bash
CT=pipelite-postgres-1; DB=pipelite_research46
docker exec -i "$CT" psql -U pipelite -d postgres -q -c "DROP DATABASE IF EXISTS $DB"
docker exec -i "$CT" psql -U pipelite -d postgres -q -c "CREATE DATABASE $DB OWNER pipelite"
DATABASE_URL="postgresql://pipelite:pipelite@localhost:5433/$DB" npx drizzle-kit migrate
```

Observed:

```
cause: PostgresError: relation "import_sessions" does not exist
  code: '42P01', file: 'namespace.c', routine: 'RangeVarGetRelidExtended'
MIGRATE_EXIT=1
public tables:                  0
drizzle schema tables:          1     ← __drizzle_migrations, created outside the txn
drizzle.__drizzle_migrations:   0 rows
```

### 2. The repaired `drizzle/0006_import-sessions-user-id.sql` (verified to work end to end)

`user_id` is deliberately **absent** from the `CREATE TABLE` — the two original `ALTER`s that follow
add it and its FK, which reproduces the live database's physical column order exactly (`id, status,
progress, cancelled, created_at, updated_at, user_id` — confirmed against
`pg_dump -t import_sessions`).

```sql
CREATE TABLE "import_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"http_status" integer,
	"response_body" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_next_attempt_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "import_sessions" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
```

Formatting matches drizzle-kit 0.31's own output (tab indent, `CREATE TABLE "x" (` with no
`IF NOT EXISTS`, `);` then `--> statement-breakpoint`) — compare `drizzle/0013_parched_redwing.sql:1-10`.

Sources cross-checked three ways, all agreeing:
`src/db/schema/import-sessions.ts:6-14` / `src/db/schema/webhook-deliveries.ts:5-23`,
`drizzle/meta/0006_snapshot.json` `public.import_sessions` + `public.webhook_deliveries`,
and `pg_dump --schema-only -t <table>` of the live database.

Result of running the full chain against an empty database with this file in place:

```
MIGRATE_EXIT=0
public tables:                  35 → 36 (with webhook_deliveries)
drizzle.__drizzle_migrations:   20 rows
```

### 3. The equivalence assertion (catalog, not dump text)

```bash
CT=pipelite-postgres-1
cmp_q() {                       # $1 label, $2 query
  docker exec -i $CT psql -U pipelite -d pipelite            -tAc "$2" | sort > /tmp/a.txt
  docker exec -i $CT psql -U pipelite -d pipelite_scratch    -tAc "$2" | sort > /tmp/b.txt
  diff -q /tmp/a.txt /tmp/b.txt >/dev/null && echo "$1 IDENTICAL" || { echo "$1 DIFFERS"; diff /tmp/a.txt /tmp/b.txt; }
}

cmp_q TABLES     "select table_name from information_schema.tables where table_schema='public'"
# NOTE: no ordinal_position — see Pitfall 4
cmp_q COLUMNS    "select table_name||'|'||column_name||'|'||data_type||'|'||coalesce(character_maximum_length::text,'-')||'|'||coalesce(numeric_precision::text,'-')||'|'||is_nullable||'|'||coalesce(column_default,'-')||'|'||coalesce(is_generated,'-')||'|'||coalesce(generation_expression,'-') from information_schema.columns where table_schema='public'"
cmp_q INDEXES    "select indexname||' :: '||indexdef from pg_indexes where schemaname='public'"
cmp_q CONSTRAINTS "select conrelid::regclass||'|'||conname||'|'||pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace"
cmp_q ENUMS      "select t.typname||'='||e.enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'"
cmp_q FUNCTIONS  "select p.proname||'|'||pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"
cmp_q EXTENSIONS "select extname from pg_extension"
cmp_q TRIGGERS   "select tgrelid::regclass||'|'||tgname from pg_trigger where not tgisinternal"
cmp_q SEQUENCES  "select sequence_name from information_schema.sequences where sequence_schema='public'"
cmp_q VIEWS      "select table_name from information_schema.views where table_schema='public'"
```

Measured output with the repaired chain: **all ten IDENTICAL** (36/36 tables, 293/293 columns,
81/81 indexes, 83/83 constraints, 9/9 enums, 38/38 functions, 3/3 extensions, 0/0/0 the rest).

*The `psql` form above documents the queries. The shipped gate should issue them through the
`postgres` driver, because the host has no `psql`.*

### 4. SC-2 proof — the app boots against a migration-built database (measured)

```bash
docker run -d --name pipelite-sc2-probe --network pipelite_default \
  -e DATABASE_URL="postgresql://pipelite:pipelite@postgres:5432/pipelite_research46" \
  -e AUTH_SECRET="…" -e NEXTAUTH_URL="http://localhost:3000" -e AUTH_TRUST_HOST=true \
  -e INTERNAL_SECRET="…" -e UPLOAD_DIR=/app/uploads \
  -p 3099:3000 pipelite-app
curl -s -w "HTTP %{http_code}\n" http://localhost:3099/api/health
```

Observed:

```
HTTP 200
{"status":"ok","db":{"ok":true,"latencyMs":3},"processors":{…}}
processors: 10 | all alive: true | status: ok
```

No `db:push`, no dump restore anywhere in that path. Note the entrypoint's own
`npx drizzle-kit migrate` ran first and was a correct no-op (only `42P06`/`42P07` NOTICEs).

**A stronger SC-2 for the plan, if a disposable volume is acceptable:** `docker compose down -v`
then `docker compose up -d`. `docker-entrypoint.sh:2` is `set -e`, so on the *current* tree the app
container would exit non-zero and crash-loop on a fresh volume — meaning DEPLOY-01 today makes
`docker compose up` on a clean host **impossible**, not merely inconvenient. That is a behavioural
negative control that costs one command. It destroys the dev database's volume, so gate it behind
explicit human confirmation or run it against a separate compose project name.

### 5. The Node floor check — no range union required

```js
import { readFileSync } from "node:fs"
import semver from "semver"

/** Every engines.node range the lockfile declares, with the package that declares it. */
function declaredNodeRanges(lockPath = "package-lock.json") {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"))
  const out = []
  for (const [pkgPath, meta] of Object.entries(lock.packages ?? {})) {
    let range = meta.engines?.node
    if (!range) continue
    if (Array.isArray(range)) range = range.join(" || ")
    out.push({ pkg: pkgPath.replace(/^node_modules\//, "") || "(root)", range })
  }
  return out
}

/** Violations of `actual` against every declared range. Empty array == satisfied. */
export function nodeFloorViolations(actual, ranges = declaredNodeRanges()) {
  return ranges.filter(({ range }) => !semver.satisfies(actual, range, { loose: true }))
}
```

Measured, 834 declared ranges:

| actual | violations |
|---|---|
| `20.20.2` (`node:20-alpine` today) | **1** — `@napi-rs/lzma-linux-x64-gnu requires "^22.20 \|\| ^24.12 \|\| >=25"` |
| `22.23.2` (`node:22-alpine`) | 0 |
| `24.19.0` (`node:24-alpine`) | **0** |
| `26.7.0` (`node:26-alpine`) | 0 |
| `18.20.8` (control) | 10 |

**Anti-vacuity floor the gate needs:** assert `declaredNodeRanges().length >= 800`. A lockfile-path
typo or a schema change would yield `[]`, zero violations, and a permanently green gate — the exact
v1.3 failure shape.

**Its negative control (cheap, no Docker):** call `nodeFloorViolations("20.20.2")` in the same test
file and assert it returns **exactly one** violation naming `@napi-rs/lzma`. That proves the checker
can produce a red, pins the current binding constraint, and makes the gate self-documenting. And
assert `nodeFloorViolations(<actual tag version>)` is `[]`.

### 6. Parsing all three `FROM node:` pins (structural, catches "changed one of three")

```js
function nodeBaseTags(dockerfile = readFileSync("Dockerfile", "utf8")) {
  return [...dockerfile.matchAll(/^\s*FROM\s+node:([^\s]+)/gm)].map((m) => m[1])
}
// today -> ["20-alpine", "20-alpine", "20-alpine"]  (Dockerfile:2, :10, :74)
// assert: tags.length === 3            (anti-vacuity: the regex found all the stages)
// assert: new Set(tags).size === 1     (all three move together — CONTEXT's rule)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pg_dump --schema-only` of the dev DB to provision a test database (`scripts/dedup-db-test-setup.sh`, Phase 39) | `drizzle-kit migrate` from zero | This phase | Retires the workaround MIG-01 forced. Verified: the repaired chain reproduces all 38 functions, 3 extensions and all 4 `GENERATED ALWAYS` columns the dump was needed for |
| `db:push` to evolve the schema | `generate` + `migrate` only | The two missing tables are `db:push` residue | `db:push` writes the database without touching snapshots or SQL; it is how a chain silently diverges from a working database |
| vite's `^20.19.0 \|\| >=22.12.0` as the binding Node floor (999.14, 2026-08-14) | `@napi-rs/lzma-linux-x64-gnu`'s `^22.20 \|\| ^24.12 \|\| >=25` | Between 2026-08-14 and 2026-08-24 | Exactly why CONTEXT's "read the declared floors, don't hardcode a number" rule is right — the binding constraint moved in ten days |
| Node 20 as a supported LTS | **Node 20 EOL 2026-04-30**; Node 24 Active LTS | 2026-04-30 | DEPLOY-03 is a live unpatched-runtime item, not a latent one |

**Deprecated/outdated:**
- `node:20-alpine` — EOL upstream. All three `Dockerfile` pins.
- The claim in `scripts/dedup-db-test-setup.sh:22-30` that the chain cannot replay — true today,
  false the moment this phase lands (Pitfall 9).
- The `.env.local` mechanism in backlog 999.20 and `46-CONTEXT.md` — never true (Correction C2).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GitHub's `ubuntu-latest` runner has a `psql` client preinstalled | Pattern 3 / Pitfall 7 | LOW — the recommendation is a Node gate using the `postgres` driver precisely to avoid depending on this. Only matters if the executor writes the gate in bash. **Not verified in this session.** |
| A2 | `--legacy-peer-deps` at `Dockerfile:7` exists because of the `@auth/core` / `nodemailer@7` peer conflict visible on any install here | Pitfall 10 | LOW — the inference is from observed npm warnings, not from a recorded decision. If wrong, switching to `npm ci --legacy-peer-deps` is still behaviour-preserving |
| A3 | No maintainer action beyond the plan is needed to make a *new* workflow a required check | Pitfall 7 Route B | MEDIUM — if Route B is chosen and the ruleset is not updated, DEPLOY-01 ships with a non-blocking gate. This is the reason Route A is recommended |
| A4 | `docker run --rm node:24-alpine node -v` reflects what the Docker build will resolve at build time | Correction C3 | LOW — same tag, same registry, but tags move forward. A build days later could resolve a higher 24.x, which only ever *increases* satisfaction of `^24.12` |
| A5 | The four `GENERATED ALWAYS` columns and 38 functions in the live DB have no source outside the migration chain | Pattern 3 | LOW — measured identical between live and migration-built, which is direct evidence they do come from the chain |

---

## Open Questions (ALL RESOLVED — see CONTEXT.md § Resolved open questions)

> All five were resolved at plan time and are reflected in 46-01..46-06. Retained for the reasoning.

1. **Should `scripts/dedup-db-test-setup.sh` be converted to build from migrations?**
   - What we know: after this phase the chain can build a complete, verified-equivalent schema. The
     script's 9-line "why a dump instead" comment becomes false.
   - What's unclear: CONTEXT defers "any schema change not strictly required", and
     `db-test-isolation.test.ts:221-229` asserts the script contains `--schema-only`, so converting
     it means amending that gate too.
   - Recommendation: **reconcile the comment in this phase; defer the conversion.** Record the
     conversion as a backlog item. Leaving prose that asserts a fixed defect is what let MIG-01
     survive Phase 43.

2. **`npm install --legacy-peer-deps` vs `npm ci --legacy-peer-deps` at `Dockerfile:7`.**
   - What we know: the gate derives the floor from `package-lock.json`, but the image's tree is not
     lockfile-exact.
   - What's unclear: whether `npm ci` breaks on the peer conflict (`--legacy-peer-deps` carries over,
     so probably not).
   - Recommendation: try `npm ci --legacy-peer-deps` behind a real `docker compose up -d --build`;
     if the build is green, take it — it makes the gate's input and the container's reality the same
     object. If it fails, keep `npm install` and say so in the gate's prose.

3. **Route A or Route B for the CI wiring (Pitfall 7).**
   - Recommendation: **Route A**, amending `db-test-isolation.test.ts:137-141` to assert the real
     invariant. The planner should make this an explicit decision with the amended assertions
     written out, not left to the executor.

4. **Should `E2E_DATABASE_URL` be removed once `DATABASE_URL` is the host form?**
   - Recommendation: **no** — descoping is not this phase's business, and a same-value duplicate is
     harmless. Note it in the backlog.

5. **`package.json` `engines` value.**
   - What we know: there is none today; the computed floor at plan time is `>=24.12`-ish (driven by
     `@napi-rs/lzma`).
   - What's unclear: whether declaring a floor that *excludes* Node 22 is desirable given `node:22-alpine`
     also passes today.
   - Recommendation: declare what the lockfile actually requires and let the gate assert the
     declaration is consistent with the tag. Do not type a number from memory — recompute it in the
     plan.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker (no sudo) | Everything | ✓ | compose v2, `pipelite-postgres-1` up 2 weeks (healthy) | — |
| PostgreSQL (container) | GATE B, equivalence | ✓ | `postgres:16-alpine`, host `5433` → container `5432` | — |
| `psql` (host) | bash-flavoured gate | **✗** | — | `docker exec … psql`, or the `postgres` npm driver (**recommended**) |
| `pg_dump` (host) | dump-based equivalence | **✗** | — | `docker exec … pg_dump`, or catalog queries (**recommended**) |
| Node (host) | drizzle-kit, gates | ✓ | v24.13.1 | — |
| npm | install, scripts | ✓ | 11.10.0 | — |
| `drizzle-kit` | migrate/generate | ✓ | 0.31.9 | — |
| `postgres` driver | Node-based gate | ✓ | 3.4.8 (direct dep) | — |
| `yaml` | compose parsing in gates | ✓ | ^2.8.2 (direct dep) | — |
| `semver` | Node floor gate | ⚠ 6.3.1 hoisted transitive only | not declared | **Add as devDependency** (§Standard Stack) |
| `vitest` | static gates | ✓ | ^4.0.18 | — |
| `slopcheck` | package legitimacy | ✓ | `~/.local/bin/slopcheck` (no `--json` flag on this build) | — |
| Docker Hub reachability | resolving `node:<tag>` version | ✓ | verified for 20/22/24/26-alpine | Structural check with an explicit skip message |
| `tsx` | `npm run db:seed-activities` | ⚠ not a declared dependency | — | Out of scope; note only |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:**
- `psql` / `pg_dump` on the host — drives the recommendation to write GATE B in Node against the
  `postgres` driver rather than in bash against `psql`.
- `semver` — add it; do not import the hoisted 6.3.1.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.18 (three projects: base, `vitest.rsc.config.ts`, `vitest.db.config.ts`) |
| Config file | `vitest.config.ts` (base — the one new static gates belong in) |
| Quick run command | `npx vitest run src/lib/__tests__/migration-chain-integrity.test.ts` |
| Full suite command | `npm test` → `vitest run && vitest run --config vitest.rsc.config.ts` |
| DB-backed project | `npm run test:db` — **must remain outside `npm test`**; `db-test-isolation.test.ts` enforces this |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| DEPLOY-01 | Every table in the final snapshot is created by some migration | unit (static, DB-free) | `npx vitest run src/lib/__tests__/migration-chain-integrity.test.ts` | ❌ Wave 0 |
| DEPLOY-01 | No `ALTER`/`REFERENCES`/`CREATE INDEX ON` precedes its table's `CREATE TABLE` in chain order | unit (static) | same file | ❌ Wave 0 |
| DEPLOY-01 | `drizzle-kit generate` still reports "No schema changes" after the repair | integration | `npx drizzle-kit generate --config=<temp>` into a copied `out` dir; assert byte-identical | ❌ Wave 0 |
| DEPLOY-01 SC-1 | A throwaway DB migrated from zero matches the reference schema across 10 catalog dimensions | integration (needs Postgres) | `npm run db:check-migrations` → `node scripts/migrate-from-zero.mjs` | ❌ Wave 0 |
| DEPLOY-01 SC-3 | The gate goes **red** when the `import_sessions` DDL is removed (`42P01`, exit ≠ 0) | manual negative control, output recorded in SUMMARY | remove DDL → run gate → restore → run gate | ❌ Wave 0 |
| DEPLOY-01 SC-3 | The gate goes **red** when the `webhook_deliveries` DDL is removed **while migrate still exits 0** | manual negative control, output recorded in SUMMARY | remove DDL → run gate | ❌ Wave 0 |
| DEPLOY-01 SC-2 | `/api/health` returns 200 against a migration-built DB and nothing else | integration (manual, Docker) | `docker run … pipelite-app` + `curl /api/health`; assert `status:"ok"`, `db.ok:true`, 10 processors alive | ❌ Wave 0 |
| DEPLOY-02 SC-4 | The command the docs print succeeds from the host with no override and no port edit | integration (manual, Docker) | `npm run db:migrate` with `.env.local` **deleted** | ❌ Wave 0 |
| DEPLOY-02 SC-4 | Negative control: point `.env` at `5432` → observe failure | manual, output recorded | edit `.env`, run, restore | ❌ Wave 0 |
| DEPLOY-02 | `.env.example` and every host-perspective doc print the host port; container-perspective docs print `@postgres:5432` | unit (static) | extend `src/lib/__tests__/deployment-docs-accuracy.test.ts` | ✅ file exists, assertions ❌ |
| DEPLOY-02 | `docker-compose.yml` constructs the app's `DATABASE_URL` and names `@postgres:5432` | unit (static, `yaml`-parsed) | amend `src/lib/__tests__/compose-uploads-persistence.test.ts` (**line 210 must change**) | ✅ file exists, assertions ❌ |
| DEPLOY-03 SC-5 | Every declared `engines.node` floor in the lockfile is satisfied by the pinned Node | unit (static) | `npx vitest run src/lib/__tests__/node-engines-floor.test.ts` | ❌ Wave 0 |
| DEPLOY-03 SC-5 | Negative control: the same checker returns exactly 1 violation for `20.20.2`, naming `@napi-rs/lzma` | unit (in the same file — a permanent, cheap negative control) | same file | ❌ Wave 0 |
| DEPLOY-03 | All three `FROM node:` tags parsed and identical (≥3 found — anti-vacuity) | unit (static) | same file | ❌ Wave 0 |
| DEPLOY-03 | The **running container's** Node satisfies the floor | integration (manual, Docker) | `docker compose up -d --build` then `docker compose exec app node -v` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/lib/__tests__/` (the four infra gates — sub-second, no DB)
- **Per wave merge:** `npm test` + `npm run typecheck` + `npm run lint`
- **Phase gate:** full suite green, **plus** `npm run db:check-migrations` green, **plus** both
  SC-3 negative controls observed red with their output pasted into the SUMMARY, **plus** a real
  `docker compose up -d --build` with `docker compose exec app node -v` showing v24.x and
  `/api/health` 200.

### Wave 0 Gaps

- [ ] `src/lib/__tests__/migration-chain-integrity.test.ts` — covers DEPLOY-01 (static class)
- [ ] `src/lib/__tests__/node-engines-floor.test.ts` — covers DEPLOY-03
- [ ] `scripts/migrate-from-zero.mjs` — covers DEPLOY-01 SC-1/SC-3 (behavioural class)
- [ ] npm script `db:check-migrations` wired to the above
- [ ] CI wiring for the behavioural gate (Route A or B — Pitfall 7)
- [ ] Amendments to **existing** gates, each in the same commit as the change that breaks it:
      `compose-uploads-persistence.test.ts:210`, `db-test-isolation.test.ts:137-141` (Route A only),
      `deployment-docs-accuracy.test.ts` (new doc assertions)
- [ ] devDependency: `npm install --save-dev semver`
- No framework install needed — vitest is present and already runs in CI.

---

## Security Domain

`security_enforcement` is not set in `.planning/config.json` → treated as **enabled**.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | This phase touches no auth path |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | **partially** | The gates take no untrusted input, but the scratch-DB name is interpolated into `CREATE DATABASE` / `DROP DATABASE` — identifiers cannot be parameterised. Constrain it to `^pipelite_[a-z0-9_]+$` and refuse anything equal to `pipelite`, mirroring `dedup-db-test-setup.sh:53-61` |
| V6 Cryptography | no | — |
| V7 Error Handling & Logging | **yes** | Migration failure output must reach the operator verbatim (the `42P01` is the diagnosis); do not swallow stderr |
| V10 Malicious Code | **yes** | One new dependency (`semver`) — audited above, `[OK]`, no postinstall |
| V12 Files & Resources | no | — |
| **V14 Configuration** | **yes — the core of this phase** | Secrets must not be committed; the base image must not be EOL; the container's runtime floor must be enforced by a check that cannot go stale |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL identifier injection via a scratch-database name | Tampering | Literal-pattern fence + `current_database()` guard; three-fence pattern already established at `dedup-db-test-setup.sh:53-61` and gated by `db-test-isolation.test.ts:221-240` |
| A destructive statement reaching the **development** database | Tampering / Denial | `db-test-isolation.test.ts:232-240` already scans the setup script for destructive statements aimed at `$SOURCE_DB` — apply the same rule to the new script, and add it to that scan |
| Credentials on a command line (visible in `ps`, shell history, CI logs) | Information Disclosure | `dedup-db-test-setup.sh:44-47` states the rule: reach the server over the container's local socket, or pass the URL via env — never as an argv password |
| **Running an EOL runtime** (Node 20, EOL 2026-04-30) | Elevation of Privilege | The DEPLOY-03 fix. Unpatched V8 / OpenSSL in the production image |
| Secrets committed via `.env` | Information Disclosure | `.env` and `.env.local` are gitignored (`.gitignore:34-35`) — **verify this still holds after the DEPLOY-02 edits**; `.env` on this machine contains a live `SMTP_PASSWORD` and `AUTH_SECRET` |
| A leaked scratch database persisting with a real schema | Information Disclosure (minor) | Drop in `finally`/`trap`, plus `DROP … IF EXISTS` on entry |
| A gate that cannot fail | *(the project's own recorded threat)* | Anti-vacuity floors on every matcher + a designed negative control per gate, observed red |

---

## Project Constraints

There is **no `./CLAUDE.md`, `./AGENTS.md`, `.claude/skills/` or `.agents/skills/`** in this
repository [VERIFIED]. Constraints below are drawn from `.planning/STATE.md`, `46-CONTEXT.md` and
project memory, and carry the same authority for this phase:

- **`docker` needs no `sudo`.** Never embed a password in a command.
- **Never run `npm run dev` / `next dev`.** Docker only.
- **`docker compose restart` does not rebuild** — `docker compose up -d --build` after Dockerfile
  changes, and verify behaviourally (`docker compose exec app node -v`), because `--build` can hit
  the layer cache.
- **`.planning` is gitignored but tracked** — the GSD commit helper fails; force-add individual files.
- **Break every gate on purpose and observe it red before trusting it.** Prefer behavioural
  assertions and parsed-structure checks to raw-token greps.
- **On a raw-text-scan collision, reword the prose — never weaken the assertion.**
  (`compose-uploads-persistence.test.ts:299-305`.)
- **Worktrees are in use** (`use_worktrees: true`) — scripts must not use `docker compose` for
  container discovery.

---

## Sources

### Primary (HIGH confidence — read or executed in this session)

- `node_modules/drizzle-orm/pg-core/dialect.js:44-71` — `PgDialect.migrate`: skip predicate, hash
  never compared, single transaction, schema/table created outside it
- `node_modules/drizzle-orm/migrator.js` — `readMigrationFiles`, journal-driven, sha256 computed for
  insert only
- `node_modules/drizzle-orm/postgres-js/migrator.js`, `node_modules/drizzle-orm/node-postgres/migrator.js`
  — both delegate to `db.dialect.migrate`
- `node_modules/drizzle-kit/bin.cjs:80477-80706` — driver selection (`pg` first, then `postgres`);
  `:93321-93330` — `dotenv/config` invocation; `:754` — dotenv resolves only `cwd/.env`;
  `:93726-93840` — the `migrate` command
- `drizzle/meta/_journal.json`, `drizzle/meta/0005..0019_snapshot.json`, `drizzle/*.sql`
- `src/db/schema/import-sessions.ts`, `src/db/schema/webhook-deliveries.ts`
- `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`, `.dockerignore`, `.env.example`,
  `drizzle.config.ts`, `package.json`, `package-lock.json`, `.github/workflows/ci.yml`
- `src/lib/__tests__/compose-uploads-persistence.test.ts`,
  `src/lib/__tests__/deployment-docs-accuracy.test.ts`,
  `src/lib/mutations/__tests__/db-test-isolation.test.ts`,
  `scripts/dedup-db-test-setup.sh`, `vitest.config.ts`, `vitest.db.config.ts`
- **Executed:** full `drizzle-kit migrate` failure reproduction on an empty database; full repair +
  20/20 migrations; ten-dimension catalog comparison live vs migration-built; `/api/health` probe of
  a container bound to the migration-built database; `drizzle-kit generate` no-op verification;
  `docker run node:{20,22,24,26}-alpine node -v`; `semver.satisfies` across 834 lockfile ranges;
  `git check-ignore` / `git ls-files` on the env files; `command -v psql pg_dump`
- `https://raw.githubusercontent.com/nodejs/Release/main/schedule.json` — Node LTS/EOL dates
- npm registry: `npm view semver version|time.created|scripts.postinstall|repository.url`;
  `https://api.npmjs.org/downloads/point/last-week/semver`
- `slopcheck install semver` → `[OK]`

### Secondary (MEDIUM confidence)

- `.planning/BACKLOG.md` MIG-01, 999.14, 999.20 — accurate on symptoms, superseded on mechanism
  (C2) and on which floor binds (C3)
- `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`
- `docs/admin/backup-restore.md:195-215` — the already-documented "success line is identical for 0
  or 20 migrations" measurement

### Tertiary (LOW confidence — flagged, not relied on)

- GitHub `ubuntu-latest` runner tooling inventory (assumption A1) — not verified in this session;
  the recommendation is designed not to depend on it

---

## Metadata

**Confidence breakdown:**

- **Standard stack: HIGH** — every version read from the installed tree or the registry; the one
  addition (`semver`) audited and `[OK]`
- **Migration chain diagnosis and repair: HIGH** — the defect was reproduced, the fix was applied,
  and the resulting schema was proved equivalent across ten catalog dimensions, all by execution
- **Drizzle skip/transaction semantics: HIGH** — read from installed source with file:line, and
  cross-checked against this deployment's actual `__drizzle_migrations` ledger
- **DEPLOY-02 mechanism: HIGH** — proved twice, from source (`bin.cjs:754`) and from behaviour
  (`EAI_AGAIN postgres`)
- **Node floor: HIGH** — 834 ranges checked programmatically against four real tag resolutions;
  LTS dates from the authoritative `nodejs/Release` schedule
- **CI wiring: MEDIUM** — the blocking gate and both routes are verified from source; which route to
  take, and whether the runner has `psql`, are decisions/assumptions left open
- **Pitfalls: HIGH** — 6 of the 10 were encountered directly while researching

**Research date:** 2026-08-24
**Valid until:** 2026-09-23 (30 days). Two items are shorter-lived: the `engines.node` floor set can
move with any dependency bump (it moved between 2026-08-14 and 2026-08-24 — **recompute at plan
time**), and `node:24-alpine`'s resolved patch will drift forward (harmless — it only increases
satisfaction).
