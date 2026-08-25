# Phase 46: Migration Chain & Toolchain Floor - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — infrastructure phase, minimal context

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

### Migration chain repair (DEPLOY-01)
- The defect is concrete and singular: `import_sessions` is `ALTER`ed by `0006` and FK-referenced by
  `0014`, but **no migration ever creates it**. A fresh `drizzle-kit migrate` dies `42P01` at `0006`
  and, because drizzle wraps the run in a transaction, leaves **0 tables** behind.
- **Recommended repair:** make the missing `CREATE TABLE` land *before* `0006` needs it, without
  renumbering the existing chain. Prepending the `import_sessions` DDL to `0006` itself is the
  preferred shape — drizzle's migrator skips already-applied entries by the journal `when` timestamp,
  not by re-hashing the file, so an existing database is untouched while a fresh one is fixed. The
  planner must **verify that skip semantics against the installed drizzle-orm version** before
  committing to it; if the installed migrator does hash-verify, fall back to a renumber
  (`0006`…`0019` → `0007`…`0020`, new `0006_create_import_sessions`) and update `_journal.json`
  in the same commit.
- The generated DDL must match what `src/db/schema/` declares for `importSessions` today, minus the
  `user_id` column and FK that `0006` itself adds — verified column-by-column against
  `pg_dump --schema-only` of the working database, not inferred from a clean exit.
- Never hand-write index SQL into a migration (established Phase 33 rule) — indexes come from the
  Drizzle schema files and `generate`.

### Equivalence proof (DEPLOY-01 SC-1, SC-2)
- Equivalence is proved by a **table-by-table, column-by-column diff** of two `pg_dump --schema-only`
  outputs: one from a throwaway database built only by `drizzle-kit migrate`, one from the working
  database. Normalise dump noise (comments, `SET` preamble, ownership, dump version banner) before
  diffing; do not `diff` raw dumps.
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

### Host connection string (DEPLOY-02)
- `.env.local:1` points at `localhost:5432`; Postgres publishes on **5433**. Fix it to `5433`.
- The docs' migrate command must succeed from the host **exactly as printed** — no inline
  `DATABASE_URL` override, no port edit by the reader. Whatever deployment doc prints that command is
  updated in the same commit so doc and reality agree.
- Keep the Docker-internal `postgresql://…@postgres:5432` in `.env` untouched — that one is correct
  inside the compose network. Both are correct; the failure was only ever the host-side file. Add a
  short comment at each site saying which context it serves, so the next reader does not "fix" one
  into the other.

### Node floor (DEPLOY-03)
- All three `node:20-alpine` pins (`Dockerfile:2` deps, `:10` builder, `:74` runner) move together —
  a fix that changes one is not a fix.
- **The gate reads the declared floors rather than comparing against a number written into the gate.**
  It walks `package-lock.json` `packages[*].engines.node`, resolves the highest floor any entry
  declares, and asserts the container's actual `node --version` satisfies it. A dependency raising its
  floor later must make this check go red, not go stale.
- Target version: the lowest **Active LTS** major that satisfies the computed floor. Do not chase
  Current. Pin the major only (`node:22-alpine` style), consistent with how the file pins today.

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
- Migration `0018` is already taken — any renumber must account for that.

</specifics>

<deferred>
## Deferred Ideas

- Broader CI restructuring beyond wiring in the new check — out of scope here.
- Any schema change not strictly required to make the migration chain self-consistent.

</deferred>
