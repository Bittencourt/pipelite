# Phase 46: Migration Chain & Toolchain Floor - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — infrastructure phase, minimal context
**Amended:** 2026-08-24 — three decisions corrected by 46-RESEARCH.md §Corrections to CONTEXT.md (C1, C2, C3). Corrections are on *mechanism* only; no success criterion changed.

<domain>
## Phase Boundary

A self-hoster who clones this repository can bring up a working database from it, using the commands
the docs actually print, on a container whose Node satisfies the toolchain's own floor.

In scope: the migration chain itself (`drizzle/*.sql` + `drizzle/meta/_journal.json`), the host-side
`DATABASE_URL` the deployment docs tell a reader to use, the three `node:` pins in `Dockerfile`, and a
repeatable, self-testing check that a throwaway database can be migrated from zero.

Out of scope: schema changes that are not required to make the chain self-consistent; any product
behaviour; CI topology beyond wiring the new check in.

</domain>

<decisions>
## Implementation Decisions

### Migration chain repair (DEPLOY-01) — AMENDED by RESEARCH C1

- **AMENDED 2026-08-24.** The original text called the defect "concrete and singular". It is not.
  `drizzle/0006_import-sessions-user-id.sql` is a hand-written two-line file (every other tag in the
  chain is a drizzle-generated random name) and it lost **two** `CREATE TABLE`s, not one.
  `drizzle/meta/0006_snapshot.json` jumps 18 → 20 tables while the SQL holds only two `ALTER`s.
- **`import_sessions`** fails loudly: `42P01` at `0006`, whole run rolls back, 0 tables.
- **`webhook_deliveries`** fails **silently**: no migration creates it and none references it, so
  `drizzle-kit migrate` exits **0** and produces **35** tables where the live database has 36. Runtime
  blast radius: `src/lib/api/webhooks/deliver.ts:61` does `db.insert(webhookDeliveries)` — on a
  migration-built install every webhook delivery raises `42P01` behind a green migrate.
- **Both tables must be restored.** This is precisely why SC-1 demands a table-by-table comparison
  rather than a clean exit — a clean exit is exactly what the silent half already produces.
- **Prepend is verified safe; no renumber.** `PgDialect.migrate`
  (`node_modules/drizzle-orm/pg-core/dialect.js:44-71`) skips on `last.created_at < entry.when` and
  **never compares the stored hash**; cross-checked against this deployment's ledger (12 rows,
  high-water `1787441440793` ≫ `0006`'s `1774267074360`). The whole loop is one transaction,
  confirming SC-1's rollback claim. The "0018 is already taken" renumber problem never arises.
- The restored DDL must match what `src/db/schema/` declares, minus the `user_id` column and FK that
  `0006` itself adds. Never hand-write index SQL into a migration (Phase 33 rule).

### Equivalence proof (DEPLOY-01 SC-1, SC-2) — AMENDED by RESEARCH C4
- **AMENDED 2026-08-24.** The original text locked a `pg_dump --schema-only` diff. Measured: **neither
  `pg_dump` nor `psql` is installed on this host**, so that mechanism is unavailable.
- Equivalence is instead proved by **ten catalog-level queries** through the already-present `postgres`
  driver — tables, columns, indexes, constraints, enums, functions, extensions, defaults, nullability,
  generated-column expressions — comparing a throwaway database built only by `drizzle-kit migrate`
  against the working database. Intent is unchanged (table-by-table, column-by-column, **proved rather
  than inferred from a clean exit**) and the catalog form is stronger: it is immune to `pg_dump`'s
  random `\restrict` token and `SET`-preamble noise, which is why the original text had to add a
  "normalise dump noise before diffing" caveat at all.
- SC-2 (`/api/health` 200) is proved against the migration-built database **and nothing else** — no
  `db:push`, no dump restore anywhere in that path.

### The self-testing gate (DEPLOY-01 SC-3)
- **The gate must be broken on purpose and observed red before it is trusted.** v1.3 shipped six gates
  that could not fail; this phase does not add a seventh. The negative control is explicit: delete the
  new `import_sessions` DDL, run the check, watch it fail `42P01`, restore, watch it pass. The
  SUMMARY must record both observed outcomes with their actual output.
- The check is a script (`scripts/`), invoked by an npm script, run in CI. It creates a uniquely-named
  throwaway database, migrates it from zero, asserts, and drops it in a `trap`/`finally` so a failure
  does not leak databases.
- Prefer behavioural assertions over raw-token greps (standing v1.4 rule) — assert on the catalog
  (`information_schema` / `pg_dump` output) and on process exit codes, never on a grep of the SQL text.

### Host connection string (DEPLOY-02) — AMENDED by RESEARCH C2

- **AMENDED 2026-08-24. The original decision does not work and would have shipped a no-op.** It
  locked "fix `.env.local:1` to 5433" and "keep `.env` untouched". Both halves are wrong for the goal.
- **drizzle-kit never reads `.env.local`.** Its bundled dotenv resolves only `path.resolve(cwd, ".env")`
  (`node_modules/drizzle-kit/bin.cjs:754`, invoked at `:93321`); the string `.env.local` does not occur
  anywhere in `bin.cjs`. Measured: `npm run db:migrate` from the host fails `getaddrinfo EAI_AGAIN
  postgres` — it resolved the **`.env`** value. Editing `.env.local` to 5433 changes nothing.
- **Neither file is shippable.** `.gitignore:34` → `.env`, `:35` → `.env.local`; `git ls-files` returns
  only `.env.example`, whose line 2 also prints `5432`. A self-hoster cloning this repo gets the wrong
  port from the one file they can actually see.
- **The correct edit is `.env.example` (tracked — the actual deliverable), `.env` (this machine), and
  `docker-compose.yml`.** `.env.local` is not the target.
- Host and container are already cleanly separated and must stay that way: `/app/.env` and
  `/app/.env.local` do **not exist** inside `pipelite-app-1` (the runner stage copies only named
  paths), so the entrypoint's `drizzle-kit migrate` reads the compose-injected `DATABASE_URL` and finds
  no dotenv file. Nothing about a host-side `.env` can reach the container.
- The docs' migrate command must still succeed from the host **exactly as printed** — no inline
  `DATABASE_URL=` override (the workaround every phase since 33 has paid), no port edit by the reader.
- Add a short comment at each site naming which context it serves, so the next reader does not "fix"
  one into the other.

### Node floor (DEPLOY-03) — AMENDED by RESEARCH C3

- **AMENDED 2026-08-24.** BACKLOG 999.14 called this "latent rather than broken" and named `vite@7.3.1`
  as the binding constraint. Both are stale. **Node 20 reached EOL on 2026-04-30** — this is a live
  unpatched-runtime item, not a latent one. The binding floor has moved off vite onto
  `@napi-rs/lzma-linux-x64-gnu` (`^22.20 || ^24.12 || >=25`), which arrives via `rollup` as an optional
  dep with **no `libc` field**, so npm does not filter it out on alpine/musl.
- Measured across all **834** declared `engines.node` ranges in `package-lock.json`:
  v20.20.2 → **1 violation**; v22.11.0 → 3; v22.12.0 → 2; v22.23.2 → 0; **v24.19.0 → 0**.
- **Target `node:24-alpine`** (resolves v24.19.0). It is the lowest **Active LTS** satisfying the
  computed floor, it is major-only per this file's own pinning rule, and it equals what `ci.yml:52`
  already pins — closing the container/CI divergence 999.14 named.
- All three pins (`Dockerfile:2` deps, `:10` builder, `:74` runner) move together.
- **The gate reads the declared floors, never a number written into the gate.** It walks
  `package-lock.json` `packages[*].engines.node`, and asserts the container's actual `node --version`
  satisfies every range with `semver.satisfies`. A major-only pin is NOT sufficient proof on its own —
  lzma's `^24.12` term means "major 24" alone does not satisfy it; the gate must check the image's
  *actual* resolved version.
- `package.json` currently has **no** `engines` field. Recompute the floor at plan time and add one.

### Claude's Discretion
- Exact script language (bash vs Node) for the migration gate, its file name, and the npm script name.
- Whether the chain repair is a prepend or a renumber — decided by the verified drizzle skip
  semantics, per above.
- Dump-normalisation mechanics and the CI job's placement in the existing workflow file.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `drizzle/` holds 20 migrations, `0000`–`0019`; `drizzle/meta/_journal.json` is the ordering source of
  truth (`idx` + `when`).
- `scripts/` already exists and is the established home for repo-level operational scripts.
- Phase 39 precedent: its test database had to be provisioned from `pg_dump --schema-only` precisely
  because the chain could not build one — that workaround is the thing this phase retires.

### Established Patterns
- Indexes are declared in `src/db/schema/*` and generated, never hand-written into migration SQL
  (Phase 33, D-06 — a hand-written index was silently dropped by a later `generate`, 0009 → 0010).
- Schema files live in `src/db/schema/` with `_relations.ts` separated to avoid circular imports.

### Integration Points
- `Dockerfile:2`, `Dockerfile:10`, `Dockerfile:74` — the three Node pins.
- `.env.local:1` — the host-side `DATABASE_URL`.
- `docker-compose.yml` — publishes Postgres on host `5433`.
- Whatever deployment/ops doc prints the migrate command — must be located and reconciled.
- CI workflow — the new from-zero migration check is wired in here.

</code_context>

<specifics>
## Specific Ideas

- **Non-negotiable:** every gate this phase adds is broken on purpose and observed failing before it is
  trusted, and the observed failure output is recorded in the SUMMARY. This is the standing v1.4 rule
  and it exists because v1.3 shipped six vacuous gates.
- Fixing DEPLOY-02 also closes the `getaddrinfo EAI_AGAIN postgres` papercut that bit the live export
  test from the host.
- Migration `0018` is already taken — but no renumber is needed (see the amended DEPLOY-01 block).

### Same-commit traps found by research — both go red on a correct fix unless handled

- `src/lib/__tests__/compose-uploads-persistence.test.ts:210` asserts the literal
  `DATABASE_URL=${DATABASE_URL}` — the exact `docker-compose.yml` line the DEPLOY-02 fix touches. It is
  an anti-vacuity anchor, so it must be **re-anchored to the new invariant, never deleted**.
- `src/lib/mutations/__tests__/db-test-isolation.test.ts:137-141` asserts `ci.yml` contains neither
  `services:` nor `postgres`. Adding a Postgres service to CI turns it red.

### Resolved open questions (decided here so the plan does not stall)

- **CI wiring: Route A.** Amend `db-test-isolation.test.ts` so it asserts the *real* invariant it was
  protecting rather than the proxy string, and keep the from-zero migration check on the existing
  required job. Route B (a separate non-blocking workflow) is rejected — a non-blocking gate is a
  vacuous gate, which is the one thing this milestone exists to stop shipping.
- **`Dockerfile:7` uses `npm install --legacy-peer-deps`, not `npm ci`.** The image tree is therefore
  not lockfile-exact, which weakens the lockfile-derived floor gate's input. Note it and keep the gate
  asserting against the container's **actual** `node --version`; converting to `npm ci` is out of scope
  for this phase — record it as a deferred item.
- **`scripts/dedup-db-test-setup.sh:22-30`** carries a 9-line comment asserting the chain cannot
  replay. That becomes false on landing — reconcile the comment in the same commit. Converting the
  script itself to use the repaired chain is deferred.
- **Add an `engines` field to `package.json`**, computed from the lockfile floors at plan time.

</specifics>

<deferred>
## Deferred Ideas

- Converting `Dockerfile:7` from `npm install --legacy-peer-deps` to `npm ci` so the image tree is
  lockfile-exact.
- Converting `scripts/dedup-db-test-setup.sh` to build its database from the repaired migration chain
  instead of a `pg_dump --schema-only` (only its now-false comment is reconciled in this phase).

- Broader CI restructuring beyond wiring in the new check — out of scope here.
- Any schema change not strictly required to make the migration chain self-consistent.

</deferred>
