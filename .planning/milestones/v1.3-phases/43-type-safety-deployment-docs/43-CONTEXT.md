# Phase 43: Type Safety & Deployment Docs - Context

**Gathered:** 2026-08-23
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — three grey areas proposed in batch, all answered by the user

<domain>
## Phase Boundary

**Goal:** No standing type suppressions, and a self-hoster can recover their data.

**Requirements:** POLISH-01, POLISH-02. Last phase of milestone v1.3.

**Success criteria from ROADMAP:**
1. `tsc --noEmit` passes and the codebase contains zero `@ts-expect-error` suppressions
2. Table meta callbacks across pipelines, organizations, and people columns are typed through one
   shared `TableMeta` interface
3. Operator follows documented steps to back up and restore a self-hosted deployment, with the
   restore exercised at least once against a real dump

**Scope clarification on criterion 1.** Taken literally, "zero `@ts-expect-error`" would delete two
suppressions that exist on purpose. POLISH-01's own requirement text resolves it: *"zero
`@ts-expect-error` suppressions — a shared typed `TableMeta` interface replaces **all 14** in
`admin/pipelines/columns.tsx`, `organizations/columns.tsx`, and `people/columns.tsx`."* The target is
those 14. See `<decisions>` D-1.

</domain>

<decisions>
## Implementation Decisions

### D-1 — The two test-file suppressions STAY. (locked)

The repo has **16** `@ts-expect-error` occurrences, not 14. Fourteen are the POLISH-01 target. The
other two are deliberate negative tests whose own comments say the suppression is the point:

- `src/lib/views/__tests__/actions.test.ts:343` — *"a server action's declared parameter type is a
  claim, not a check."*
- `src/lib/audit/export-events-live.test.ts:149` — *"'export' is deliberately not a timeline entity
  type. That is the point."*

Removing them would delete the assertion each test exists to make. POLISH-01's requirement text
scopes the work to the 14 in three named files, so this is not a deviation. **Any gate asserting a
repo-wide count of zero must exclude test files, or it will force a regression.** Phase 42 shipped
several gates that could not fail; do not add one that fails for the wrong reason.

### D-2 — Copy the existing in-repo pattern; do not invent one. (locked)

`src/app/trash/trash-columns.tsx` already implements criterion 2 exactly, with zero suppressions:

```ts
export interface TrashTableMeta {          // :36
  renderActions: (row: TrashRow) => ReactNode
}
// ...
const meta = table.options.meta as TrashTableMeta | undefined   // :305
```

and the consumer side at `src/app/trash/trash-table.tsx:295` builds `const meta: TrashTableMeta = {…}`.
Phase 37 built this and it has been green since. **Replicate this shape.** The open question the plan
must settle is whether the three tables share ONE interface (criterion 2 says "one shared `TableMeta`
interface") or take one generic interface parameterised per row type — the three tables carry
different callbacks, so a single flat interface may force optional members on every consumer. Prefer
whatever keeps each consumer's required members honest while still being one declaration.

### D-3 — Uploads are ephemeral today. FIX IT, and prove it with a real file. (user-chosen)

**Measured:** `docker-compose.yml` declares a volume only on `postgres` (line 41). The `app` service
has **no** `volumes:` block, and `FILE_STORAGE` defaults to `'local'`
(`src/app/api/upload/route.ts:10`, `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts:9`).
So local-storage uploads write into the container filesystem and are destroyed on every
`docker compose up --build`. Postgres data survives; the files its JSONB custom-field values point at
do not.

This is inside POLISH-02's remit — you cannot "recover your data" when part of it was never
persisted. A database-only restore would produce rows referencing files that no longer exist.

**Decision:** add a named volume for uploads to `docker-compose.yml`, document backup and restore for
**both** the database and the files, and **verify by experiment**: upload a real file, rebuild the
container, confirm the file survives. Documentation alone is not acceptance here.

Rationale for the experiment, in the user's words as chosen: it mirrors how Phase 42's container gate
caught a defect no test saw. Phase 42's most valuable find was `docker compose build` being silently
broken behind 17 green plans; a persistence claim verified only in prose is the same category of risk.

### D-4 — POLISH-02 ships a dedicated runbook covering BOTH deployment paths. (user-chosen)

Create `docs/admin/backup-restore.md` as the single authoritative procedure, covering Docker and
bare-metal. Replace the existing block in `docs/admin/deployment/docker.md` with a pointer to it
rather than maintaining two copies that can drift. `docs/admin/deployment/bare-metal.md:359` has a
`**Backups scheduled**` checklist item with no procedure behind it — point it at the runbook too.

**The existing documented procedure is BROKEN and must be fixed, not copied.**
`docs/admin/deployment/docker.md:276,279` read:

```bash
docker compose exec db pg_dump -U pipelite pipelite > backup_$(date +%Y%m%d).sql
cat backup_20260304.sql | docker compose exec -T db psql -U pipelite pipelite
```

There is **no `db` service** — this compose file defines `app`, `postgres`, `mailhog`. Both commands
fail as written. Verified: `docker compose exec -T db pg_dump --version` exits nonzero, while
`docker compose exec -T postgres pg_dump -U pipelite pipelite` produces a real dump. The
`-U pipelite pipelite` credentials ARE correct (`POSTGRES_USER=pipelite`, `POSTGRES_DB=pipelite`).

This defect is precisely what criterion 3's "exercised at least once against a real dump" exists to
catch, and it is the reason the drill is mandatory rather than optional.

### D-5 — The restore drill targets a SCRATCH database. Never the live one. (Claude's discretion)

`docker compose exec -T postgres pg_dump -U pipelite pipelite` currently emits **121,722,344 bytes**
— this dev database holds substantial real data. The drill must create and restore into a throwaway
database (e.g. `pipelite_restore_drill`), verify row counts or a checksum against the source, then
drop it. **Under no circumstances restore over `pipelite`.** No `DROP DATABASE pipelite`, no
`psql … pipelite < dump` against the live database. State the scratch database's name in the plan and
drop it in the same task that creates it.

### D-6 — Fold in Phase 42's one deferred cosmetic item. (user-chosen)

`src/lib/import/pipedrive-api-client.ts:42` is `log.warn("Pipedrive API", …)` — the only log scope in
the codebase containing a space and capital letters; every other scope is lowercase-kebab. It was
harvested verbatim per Phase 42's own "reuse the existing bracket prefix" rule, and 42-16 flagged it
rather than changing it unilaterally. 42-18 deferred it with a recommendation.

**Decision:** normalize to `pipedrive-api`. The space is the genuinely harmful property — it makes the
scope awkward to grep and inconsistent with every other scope in the log stream. One-line change plus
whatever assertion references it. Keep it a separate small task so its diff stays legible.

</decisions>

<code_context>
## Existing Code Insights

**The 14 suppressions, all identical in kind** (`// @ts-expect-error - meta callbacks are passed via
table options`):

| File | Lines | Count |
|---|---|---|
| `src/app/admin/pipelines/columns.tsx` | 92, 94, 96, 199, 201, 203 | 6 |
| `src/app/organizations/columns.tsx` | 102, 104, 204, 206 | 4 |
| `src/app/people/columns.tsx` | 113, 115, 223, 225 | 4 |

File sizes: 242 / 233 / 252 lines. They cluster in two places per file — a header/actions cell around
line ~100 and a row-actions cell around line ~200.

**The pattern to copy:** `src/app/trash/trash-columns.tsx` (interface at :36, cast at :305) plus
`src/app/trash/trash-table.tsx:295` (typed consumer).

**No shared `TableMeta` exists yet.** The only match for `TableMeta` in `src/` is `TrashTableMeta`,
which is trash-specific. POLISH-01 must create the shared one.

**Docs tree already exists:** `docs/admin/`, `docs/admin/deployment/{docker,bare-metal}.md`,
`docs/admin/import-export.md`, `docs/{api,development,user}/`, `docs/index.md`. `import-export.md`
covers CSV/JSON *data* export for migration — related but not a deployment backup, and worth
cross-referencing rather than duplicating.

**Environment facts for the runbook:** compose services are `app`, `postgres`, `mailhog`. Postgres is
`postgres:16-alpine`, host port **5433** → container 5432. App is host **3001** → container 3000.
`POSTGRES_USER=pipelite`, `POSTGRES_DB=pipelite`, both from `.env`. `docker` needs no `sudo` here.

**Do not use `docker compose restart` to test anything** — it runs the OLD image and does not rebuild.
Phase 42 recorded this. Use `docker compose up -d --build`.

</code_context>

<specifics>
## Specific Ideas

- **`tsc --noEmit` must stay at 0 errors.** It is at 0 now. Removing a `@ts-expect-error` that was
  suppressing a *real* error turns it into a build failure, so each removal has to be accompanied by
  the type that makes it unnecessary. Expect the suppressions to be load-bearing.
- **A `@ts-expect-error` that suppresses nothing is itself a TS error** (`ts(2578)` — unused
  expect-error). So the compiler enforces this work in both directions and cannot be fooled.
- **`no-console` is now `error`** (Phase 42). Any doc example or script added this phase must not
  introduce a bare `console.*` in non-test source. Current non-test count is **4**, all inside
  `src/lib/log.ts`.
- **Lint warning totals are environment-dependent** — 124 on the main checkout, 122 in CI or a
  worktree, because `.planning`'s untracked files carry exactly 2. **Gate on errors (0), never a
  warning total.**
- **CI runs `npm ci` first**, lockfile-exact, and it was broken for this entire milestone until it
  was fixed at `58139b9`. If this phase touches `package.json` at all, re-verify `npm ci` from a
  clean tree — and note `--legacy-peer-deps` is NOT needed here (the `@auth/core` conflict is
  peerOptional and only warns).
- The `app` service deliberately has **no** healthcheck, and `42-CONTEXT.md` amendment A8 explains
  why: `/api/health` legitimately returns 503 when degraded, and combined with
  `restart: unless-stopped` a probe on it could restart-loop the container. **Do not add one** while
  editing `docker-compose.yml` for the uploads volume.

</specifics>

<deferred>
## Deferred Ideas

- **A lockfile-desync guard.** Nothing catches a `package.json`/`package-lock.json` mismatch until
  CI's install step, and a developer with a warm `node_modules` never sees it locally — which is how
  CI stayed red for a whole milestone. A pre-push hook or CI step running `npm ci` in a temp dir
  would close it. Out of scope for POLISH-01/02; worth its own item.
- **Normalizing the remaining historical `Dockerfile:24` mentions** in `heartbeat.ts:14`,
  `scan-cleanup.ts:27`, `scan-cleanup.test.ts:11`. Verified during Phase 42 to be *historical
  narrative* of the 2026-08-08 incident, not false current-state claims. Correct as written — do not
  "fix" them.
- **An `app` healthcheck** with a restart policy that tolerates 503. Explicitly deferred by
  `42-CONTEXT.md` A8 as its own decision.

</deferred>
