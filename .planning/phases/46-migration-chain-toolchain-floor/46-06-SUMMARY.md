---
phase: 46-migration-chain-toolchain-floor
plan: 06
subsystem: infra
tags: [docker, node, drizzle-kit, postgres, health-check, behavioural-verification, sign-off]

# Dependency graph
requires:
  - phase: 46-01-migration-chain-repair
    provides: "the repaired drizzle/0006 — the chain this plan replayed into an empty database"
  - phase: 46-02-host-connection-string
    provides: "the compose-CONSTRUCTED container DATABASE_URL this plan proved reaches the running process"
  - phase: 46-03-toolchain-floor
    provides: "the three node:24-alpine pins and package.json engines.node — the structural half whose runtime proof 46-03 explicitly deferred to this plan"
  - phase: 46-04-from-zero-migration-check
    provides: "npm run db:check-migrations — re-run here on the main tree as the final-phase gate"
  - phase: 46-05-ci-wiring
    provides: "the ci.yml Migration chain check step whose GitHub execution this plan attempted to confirm"
provides:
  - "SC-2 closed behaviourally: /api/health 200 with db.ok true and 10/10 processors alive, from a container bound to a database that only drizzle-kit migrate ever wrote to"
  - "SC-5's container half closed: the running container reports v24.19.0, proved to satisfy package.json engines.node by semver.satisfies and to violate 0 of the lockfile's 832 declared engines.node ranges"
  - "A before/after image-identity record (v20.20.2 -> v24.19.0, image sha256:902ea9f2 -> sha256:48b96371) that a `docker compose restart` could not have produced"
  - "A recorded, honest NOT-PROVED verdict on the GitHub `ci` execution of the new migration-chain step"
affects: [phase-47, any future claim that the container runs Node 24]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Image-identity freshness proof: compare the container's bound image ID and the image's Created timestamp against a pre-build capture, then ask the running process its own version"
    - "Scratch-database SC probe: --env-file .env with a single -e DATABASE_URL override on a spare host port, torn down unconditionally"

key-files:
  created:
    - .planning/phases/46-migration-chain-toolchain-floor/46-06-SUMMARY.md
  modified: []

key-decisions:
  - "The rebuild was proved by image ID + Created timestamp + the running process's own `node -v`, never by a 'Starting' log line"
  - "SC-5 was closed with semver.satisfies against the OBSERVED container version and a full 832-range lockfile walk, not by eyeballing the major number"
  - "The GitHub `ci` half of the sign-off is reported NOT PROVED rather than inferred from a green run against a pre-phase commit"
  - "The human half of the sign-off checkpoint (sign in, open /deals) is reported NOT PERFORMED; unauthenticated route evidence is recorded in its place, explicitly labelled as a partial substitute"

patterns-established:
  - "Record the PRE-build container version as the negative control for the rebuild: v20.20.2 before, v24.19.0 after, from the identical command"

requirements-completed: [DEPLOY-01, DEPLOY-03]

# Metrics
duration: 11min
completed: 2026-08-25
---

# Phase 46 Plan 06: Behavioural Sign-Off Summary

**The rebuilt container reports `v24.19.0` where the container it replaced reported `v20.20.2`, and a container bound to that new image served `/api/health` **200** with `db.ok: true` and 10/10 processors alive against a database that only `drizzle-kit migrate` ever wrote to — with two sign-off items reported honestly as NOT PROVED rather than papered over.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-08-25T04:16:44Z
- **Completed:** 2026-08-25T04:28:02Z
- **Tasks:** 3 (2 verification tasks, 1 checkpoint — no source file changed, so no task commits by design)
- **Files modified:** 0 source files. This plan's `files_modified` is `[]` and it stayed that way.

## Accomplishments

- **Closed the half of DEPLOY-03 that 46-03 explicitly deferred.** 46-03 landed three `node:24-alpine` pins and a lockfile-derived `engines.node`, and stated plainly: *"The image has not been rebuilt in this plan. Nothing on this branch has yet executed on Node 24 inside a container."* That caveat is now closed with the running container's own report.
- **Captured the rebuild's own negative control by accident and kept it.** The container that was running before this plan started reported **`v20.20.2`** — the exact EOL version 46-03 replaced. The identical command against the recreated container reports **`v24.19.0`**. No layer-cache story explains that transition, and no `docker compose restart` could have produced it.
- **Closed SC-2 with a real 200 from a real container**, against a `pipelite_sc2` built by `drizzle-kit migrate` and nothing else, and proved the silent half of the DEPLOY-01 defect closed at runtime: `select count(*) from webhook_deliveries` returned `0`, not `42P01`.
- **Left nothing behind.** No probe container, no scratch database, no `pipelite_migchk%` residue. The live `pipelite` still holds 46,054 organizations / 38,348 people / 25,195 deals / 10 users across its 36 tables, and the compose stack is up and serving 200 on 3001.
- **Reported two gaps rather than inventing evidence.** The GitHub `ci` check has never executed the new migration-chain step (the phase's 35 commits are unpushed), and the human "sign in and open /deals" step was not performed. Both are stated as NOT PROVED below.

## Task Commits

1. **Task 1: Rebuild the image and ask the running container what Node it is** — no commit (verification only; `files_modified: []`)
2. **Task 2: SC-2 — boot against a migration-built database** — no commit (verification only)
3. **Task 3: Phase 46 sign-off** — no commit (checkpoint; changes nothing by design)

Only the SUMMARY commit below was made. `git status --porcelain` was empty before this plan and is empty after it.

---

# Task 1 — the rebuild, and what the running container says

## Before the rebuild (the negative control, captured first)

```
$ docker image inspect pipelite-app --format '{{.Id}} {{.Created}}'
sha256:902ea9f24588ce61912008fdda8a1ea9783ddb9af5d4f364c9ac0ac308aa8974 2026-08-24T00:41:15.318913822-03:00

$ docker inspect --format '{{.Config.Image}} {{.Image}} {{.Created}}' pipelite-app-1
pipelite-app sha256:902ea9f24588ce61912008fdda8a1ea9783ddb9af5d4f364c9ac0ac308aa8974 2026-08-24T03:43:51.187294085Z

$ docker compose exec -T app node -v
v20.20.2

$ docker compose exec -T app printenv DATABASE_URL
postgresql://pipelite:pipelite@postgres:5432/pipelite
```

**`v20.20.2` is the whole point of recording this.** It is the exact version 46-03's NC-3 names as producing one lockfile violation, and it is what the container was still running 25 hours after 46-03 moved all three Dockerfile pins. This is the state a `docker compose restart` would have preserved.

## The build

```
$ docker compose build app
#3 [internal] load metadata for docker.io/library/node:24-alpine
#3 DONE 0.0s

#5 [deps 1/5] FROM docker.io/library/node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43
#5 resolve docker.io/library/node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 0.0s done
#5 DONE 0.1s
...
#29 exporting to image
#29 exporting layers 62.4s done
#29 exporting manifest sha256:78defcc29fba67c939df8357d460dc50be53a024ce108d5bb2114daa1f32c3a7 0.0s done
#29 exporting config sha256:b22ba2cca0ce5cb19a295bbe0ef9dfda445965b6e74d8adfa17db3b8e824ee25 0.0s done
#29 naming to docker.io/library/pipelite-app:latest done
#29 unpacking to docker.io/library/pipelite-app:latest 19.2s done
#29 DONE 81.7s
 Image pipelite-app Built
```

**Pulled or cached — stated plainly.** The `node:24-alpine` layers were **NOT pulled**. There are no
`pulling`/`downloading` progress lines because the tag was already in the local image store:

```
$ docker image ls node --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.CreatedAt}}'
node:26-alpine aadf416b2cdc 2026-08-05 18:16:12 -0300 -03
node:24-alpine d32cdf619f63 2026-08-03 17:26:09 -0300 -03
node:22-alpine c610fcdfb1d5 2026-07-29 14:26:59 -0300 -03
node:20-alpine fb4cd12c85ee 2026-04-15 17:46:50 -0300 -03
```

The digest the build resolved (`sha256:d32cdf619f63fe04…`) is the local `node:24-alpine` image ID
(`d32cdf619f63`). So the base came from the local store, dated 2026-08-03. **That is exactly why the
build log is not treated as the proof.** The proof is what the running process reports, below.

## After the rebuild

```
$ docker compose up -d
 Container pipelite-app-1 Recreate
 Container pipelite-app-1 Recreated
 Container pipelite-postgres-1 Waiting
 Container pipelite-postgres-1 Healthy
 Container pipelite-app-1 Starting
 Container pipelite-app-1 Started
```

```
$ docker compose exec -T app node -v
v24.19.0

$ docker compose exec -T app printenv DATABASE_URL
postgresql://pipelite:pipelite@postgres:5432/pipelite

$ docker inspect --format '{{.Config.Image}} {{.Image}} started={{.State.StartedAt}}' pipelite-app-1
pipelite-app sha256:48b96371d858fd5dbfc1ae7a3f023453a96593556eb0251ecea747caa50e81ca started=2026-08-25T04:22:32.736278467Z

$ docker image inspect pipelite-app --format '{{.Id}} {{.Created}}'
sha256:48b96371d858fd5dbfc1ae7a3f023453a96593556eb0251ecea747caa50e81ca 2026-08-25T01:20:46.856578386-03:00
```

| | Before this plan | After |
|---|---|---|
| `pipelite-app` image ID | `sha256:902ea9f24588…` | **`sha256:48b96371d858…`** |
| image `Created` | 2026-08-24T00:41:15-03:00 | **2026-08-25T01:20:46-03:00** — inside this session (started 04:16:44Z = 01:16:44-03:00) |
| container's bound `.Image` | `sha256:902ea9f24588…` | **`sha256:48b96371d858…`** — the container runs the NEW image, not a stale one |
| `node -v` inside the container | `v20.20.2` | **`v24.19.0`** |

## `printenv DATABASE_URL` — why it is meaningful and not circular

The old container also showed `@postgres:5432`, because before 46-02 `docker-compose.yml`
*interpolated* `${DATABASE_URL}` and `.env` at that time held the container form. 46-02 inverted
that: `.env` now describes the **host** (`localhost:5433`, verified below), and `docker-compose.yml`
**constructs** the container URL from `POSTGRES_*`. So with today's `.env`, a compose file that had
kept interpolating would have injected `localhost:5433` into the container and the app could not have
reached Postgres at all. Reading `@postgres:5432` out of the recreated container is therefore positive
evidence that 46-02's construction reached the runtime — not merely the YAML.

Checked without printing any secret:

```
$ node -e '<count DATABASE_URL assignment lines per file>'
.env.local DATABASE_URL assignment lines: 1
  of which name localhost:5432 (the WRONG port): 1
  of which name localhost:5433 (the right port): 0
.env  DATABASE_URL assignment lines: 1 | names localhost:5433: 1
.env.example DATABASE_URL assignment lines: 1 | names localhost:5433: 1
```

## SC-5 — `semver.satisfies` against the OBSERVED container version

Not a major-number eyeball. The literal string the container printed, fed to `semver`:

```
$ node -e '…'
package.json engines.node = ">=24.12.0"
observed container version = 24.19.0
semver.satisfies(observed, engines.node) = true
semver.valid(observed) = 24.19.0
control: semver.satisfies("20.20.2", engines.node) = false
```

The control line is what stops this being a tautology: the same call against the version the container
reported *before* the rebuild returns `false`.

Extended to the full lockfile — every declared floor, not just the one `package.json` states:

```
$ node -e '<walk package-lock.json packages[*].engines.node>'
declared engines.node ranges in lockfile: 832 distinct: 106
20.20.2 -> 1 ["@napi-rs/lzma-linux-x64-gnu :: ^22.20 || ^24.12 || >=25"]
24.0.0  -> 1 ["@napi-rs/lzma-linux-x64-gnu :: ^22.20 || ^24.12 || >=25"]
24.12.0 -> 0 []
24.19.0 -> 0 []
```

**The container's actual `24.19.0` violates 0 of the 832 declared ranges; the version it was running an
hour ago violated 1.** The `24.0.0 -> 1` line is RESEARCH's warning made concrete: a bare major-24 pin
would not have been sufficient proof, which is why `engines.node` is `>=24.12.0` and why this check
uses the resolved version rather than the tag.

GATE C, the structural half, on the current tree:

```
$ ./node_modules/.bin/vitest run src/lib/__tests__/node-engines-floor.test.ts
 ✓ src/lib/__tests__/node-engines-floor.test.ts (20 tests) 85ms
 Test Files  1 passed (1)
      Tests  20 passed (20)
EXIT=0
```

## The dev stack after the compose change — HTTP 200

```
$ curl -s -o /tmp/h1.json -w 'HTTP=%{http_code}\n' http://localhost:3001/api/health
HTTP=200
```

```json
{"status":"ok","db":{"ok":true,"latencyMs":1},"processors":{"webhook-processor":{"alive":true,"lastTickAt":"2026-08-25T04:22:41.265Z"},"email-processor":{"alive":true,"lastTickAt":"2026-08-25T04:22:51.127Z"},"schedule-processor":{"alive":true,"lastTickAt":"2026-08-25T04:22:46.366Z"},"execution-processor":{"alive":true,"lastTickAt":"2026-08-25T04:23:01.532Z"},"audit-prune":{"alive":true,"lastTickAt":null},"trash-prune":{"alive":true,"lastTickAt":null},"webhook-subscriber":{"alive":true,"lastTickAt":null},"workflow-trigger-subscriber":{"alive":true,"lastTickAt":null},"stage-history-subscriber":{"alive":true,"lastTickAt":null},"audit-subscriber":{"alive":true,"lastTickAt":null}}}
```

```
status: ok | db.ok: true | db.latencyMs: 1
processors: 10 | alive: 10 | not alive: []
```

**First probe, no polling needed, no 503.** This is the DEV database; SC-2's stricter probe is below.

---

# Task 2 — SC-2: `/api/health` 200 against a migration-built database and nothing else

## Explicit statement, as the plan's output spec requires

**No `db:push` and no dump restore touched `pipelite_sc2`.** No `drizzle-kit push`, no `pg_dump`,
no `psql -f`, no seed script, no `INSERT` of any kind was ever issued against it. The complete list
of every command that connected to `pipelite_sc2`, in order:

| # | Command | Kind |
|---|---|---|
| 1 | `docker exec pipelite-postgres-1 psql -U pipelite -d postgres -c 'CREATE DATABASE pipelite_sc2 OWNER pipelite'` | creates it (connects to `postgres`, not to it) |
| 2 | `psql -d pipelite_sc2 -tAc "select count(*) from information_schema.tables where table_schema='public'"` | READ — returned `0` |
| 3 | `psql -d pipelite_sc2 -tAc "select nspname from pg_namespace …"` | READ — returned `public` only (no `drizzle` schema yet) |
| 4 | `DATABASE_URL="postgresql://pipelite:pipelite@localhost:5433/pipelite_sc2" ./node_modules/.bin/drizzle-kit migrate` | **the only thing that ever built its schema** |
| 5–11 | seven `psql -d pipelite_sc2` `SELECT`s (ledger count, table count, `information_schema` presence of `webhook_deliveries` / `import_sessions`, `select count(*)` on both, and org/people/user row counts) | READ |
| 12 | the probe container `pipelite-sc2-probe` (image `pipelite-app`), whose entrypoint runs `drizzle-kit migrate` again — an idempotent no-op replay, log below — and then the application itself | `drizzle-kit migrate` + normal app runtime; **no DDL, no schema change**, ledger unchanged at 20 |
| 13–15 | four more `psql -d pipelite_sc2` catalog `SELECT`s | READ |
| 16 | `docker exec pipelite-postgres-1 psql -U pipelite -d postgres -c 'DROP DATABASE IF EXISTS pipelite_sc2'` | teardown |

The database was **empty of data** the whole time, which is independent proof no dump or seed reached
it: `select (select count(*) from organizations), (select count(*) from people), (select count(*) from users)` on
`pipelite_sc2` returned `0|0|0`, against a live `pipelite` holding `46054|38348|10`.

## 1. Create the target, empty

```
$ docker exec pipelite-postgres-1 psql -U pipelite -d postgres -c 'DROP DATABASE IF EXISTS pipelite_sc2'
NOTICE:  database "pipelite_sc2" does not exist, skipping
DROP DATABASE

$ docker exec pipelite-postgres-1 psql -U pipelite -d postgres -c 'CREATE DATABASE pipelite_sc2 OWNER pipelite'
CREATE DATABASE

$ docker exec pipelite-postgres-1 psql -U pipelite -d pipelite_sc2 -tAc "select count(*) from information_schema.tables where table_schema='public'"
0

$ docker exec pipelite-postgres-1 psql -U pipelite -d pipelite_sc2 -tAc "select nspname from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema' order by 1"
public
```

Zero public tables and no `drizzle` schema — it really started from nothing.

## 2. Migrate it, and only migrate it

```
$ DATABASE_URL="postgresql://pipelite:pipelite@localhost:5433/pipelite_sc2" ./node_modules/.bin/drizzle-kit migrate
No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/pedro/programming/pipelite/drizzle.config.ts'
Using 'postgres' driver for database querying
[⣷] applying migrations...[✓] migrations applied successfully!
EXIT=0
```

Per 46-02's finding, that success banner prints identically for 0 applied migrations and for 20, so it
is **not** the evidence. The ledger is:

```
$ psql -d pipelite_sc2 -tAc "select count(*) from drizzle.__drizzle_migrations"
20

$ psql -d pipelite_sc2 -tAc "select count(*) from information_schema.tables where table_schema='public'"
36
```

**20 ledger rows and 36 public tables** — the chain genuinely replayed from zero into this database,
and did not silently no-op against the live one.

## 3. The two restored tables, checked explicitly

```
$ psql -d pipelite_sc2 -tAc "select count(*) from information_schema.tables where table_schema='public' and table_name='webhook_deliveries'"
1
$ psql -d pipelite_sc2 -tAc "select count(*) from information_schema.tables where table_schema='public' and table_name='import_sessions'"
1
```

## 4. Boot the rebuilt image against it

```
$ docker run -d --name pipelite-sc2-probe --network pipelite_default --env-file .env \
    -e DATABASE_URL="postgresql://pipelite:pipelite@postgres:5432/pipelite_sc2" \
    -p 3099:3000 pipelite-app
6fe6cdb14312f44d7643086533b01603a1c31ffe8a4ba30cc214c5672119bfd7
EXIT=0
```

`.env` was never `cat`ed, never echoed, and no individual secret appeared as a literal `-e` value. The
only value on the command line is the throwaway `pipelite:pipelite` dev pair. No `sudo` was used
anywhere in this plan.

The probe is genuinely the new image, and genuinely pointed at the scratch database:

```
$ docker exec pipelite-sc2-probe node -v
v24.19.0
$ docker exec pipelite-sc2-probe printenv DATABASE_URL
postgresql://pipelite:pipelite@postgres:5432/pipelite_sc2
$ docker inspect --format '{{.Config.Image}} {{.Image}}' pipelite-sc2-probe
pipelite-app sha256:48b96371d858fd5dbfc1ae7a3f023453a96593556eb0251ecea747caa50e81ca
```

Its boot log — the entrypoint's `drizzle-kit migrate` under `set -e` against an already-migrated
database, which is the correct no-op emitting only the two `NOTICE`s:

```
Running database migrations...
No config path provided, using default 'drizzle.config.ts'
Reading config file '/app/drizzle.config.ts'
Using 'postgres' driver for database querying
[⣷] applying migrations...{
  severity_local: 'NOTICE',
  severity: 'NOTICE',
  code: '42P06',
  message: 'schema "drizzle" already exists, skipping',
  file: 'schemacmds.c',
  line: '132',
  routine: 'CreateSchemaCommand'
}
{
  severity_local: 'NOTICE',
  severity: 'NOTICE',
  code: '42P07',
  message: 'relation "__drizzle_migrations" already exists, skipping',
  file: 'parse_utilcmd.c',
  line: '207',
  routine: 'transformCreateStmt'
}
[✓] migrations applied successfully!Starting application...
▲ Next.js 16.1.6
- Local:         http://localhost:3000
- Network:       http://0.0.0.0:3000

✓ Starting...
{"level":"info","scope":"sentry","msg":"SENTRY_DSN unset — error tracking disabled, SDK not loaded","ts":"2026-08-25T04:23:50.107Z"}
✓ Ready in 164ms
{"level":"info","scope":"webhook-processor","msg":"Starting","ts":"2026-08-25T04:23:50.112Z","initialDelayMs":5000}
{"level":"info","scope":"email-processor","msg":"Starting","ts":"2026-08-25T04:23:50.114Z","initialDelayMs":15000}
{"level":"info","scope":"dedup-scan-cleanup","msg":"Starting","ts":"2026-08-25T04:23:50.234Z"}
{"level":"info","scope":"dedup-scan-cleanup","msg":"Done","ts":"2026-08-25T04:23:50.239Z","strandedMarkedError":0,"idleDeleted":0,"expiredDeleted":0}
{"level":"info","scope":"schedule-processor","msg":"Starting","ts":"2026-08-25T04:23:50.276Z","initialDelayMs":10000}
{"level":"info","scope":"execution-processor","msg":"Starting","ts":"2026-08-25T04:23:50.402Z","initialDelayMs":5000}
{"level":"info","scope":"audit-prune","msg":"Starting","ts":"2026-08-25T04:23:50.452Z","initialDelayMs":60000,"tickIntervalMs":86400000}
{"level":"info","scope":"trash-prune","msg":"Starting","ts":"2026-08-25T04:23:50.458Z","initialDelayMs":60000,"tickIntervalMs":86400000}
```

Per the project's own recorded lesson, **that `Starting` line is treated as proving nothing.** It is
reproduced only for the two `NOTICE` payloads above it, which are PostgreSQL *server* notices and so
prove the container reached a live backend. The ledger stayed at 20 rows after this replay, which is
the actual proof it was a no-op (below).

## 5. `/api/health` on the probe — **HTTP 200**, full body verbatim

```
$ curl -s -o /tmp/h2.json -w 'HTTP=%{http_code}\n' --retry 30 --retry-delay 4 --retry-all-errors --retry-connrefused http://localhost:3099/api/health
HTTP=200
```

```json
{"status":"ok","db":{"ok":true,"latencyMs":39},"processors":{"webhook-processor":{"alive":true,"lastTickAt":null},"email-processor":{"alive":true,"lastTickAt":null},"schedule-processor":{"alive":true,"lastTickAt":null},"execution-processor":{"alive":true,"lastTickAt":null},"audit-prune":{"alive":true,"lastTickAt":null},"trash-prune":{"alive":true,"lastTickAt":null},"webhook-subscriber":{"alive":true,"lastTickAt":null},"workflow-trigger-subscriber":{"alive":true,"lastTickAt":null},"stage-history-subscriber":{"alive":true,"lastTickAt":null},"audit-subscriber":{"alive":true,"lastTickAt":null}}}
```

Parsed:

```
status: ok | db.ok: true | db.latencyMs: 39
processors: 10 | alive: 10 | not alive: []
```

**`status: "ok"`, `db.ok: true`, `db.latencyMs: 39`, 10 processors, 10 alive, 0 stale.** The
`--retry-all-errors` flags were the poll — they retry on HTTP 5xx as well as connection refusal, so a
transient 503 from a stale worker would have been retried rather than reported. It never settled at
503; no 503 was observed at all.

## 6. The silent half of the DEPLOY-01 defect, probed at runtime

```
$ psql -d pipelite_sc2 -c "select count(*) from webhook_deliveries"
 count
-------
     0
(1 row)

$ psql -d pipelite_sc2 -c "select count(*) from import_sessions"
 count
-------
     0
(1 row)
```

**`0`, not `42P01`.** On the pre-phase tree this is the exact query that raised
`relation "webhook_deliveries" does not exist` behind a `drizzle-kit migrate` that had exited 0 —
the failure mode that reaches production through `src/lib/api/webhooks/deliver.ts:61`.

Catalog comparison against the live database while the probe was up:

```
$ psql -d pipelite_sc2 -tAc "select (select count(*) from drizzle.__drizzle_migrations), (select count(*) from information_schema.tables where table_schema='public')"
20|36
```

Ledger still 20 and tables still 36 **after** the entrypoint's replay — the container's boot-time
migrate applied nothing, as claimed.

| dimension | live `pipelite` | `pipelite_sc2` | verdict |
|---|---|---|---|
| public tables | 36 | 36 | IDENTICAL |
| public columns | 293 | 293 | IDENTICAL |
| public indexes | 81 | 81 | IDENTICAL |
| public constraints | 83 | 83 | IDENTICAL |
| enum **types** | 3 (`stage_type,user_role,user_status`) | 3 (`stage_type,user_role,user_status`) | IDENTICAL |
| enum **labels** (`pg_enum` rows) | 9 | 9 | IDENTICAL |

*(Reconciliation for the reader: 46-04's script reports `enums 9`. That figure counts enum **labels**,
not types — 3 types × 3 labels. Both counts were taken here and both are identical across the two
databases, so there is no discrepancy, only two different denominators.)*

## 7. Teardown, and the environment left intact

```
$ docker rm -f pipelite-sc2-probe
pipelite-sc2-probe

$ docker exec pipelite-postgres-1 psql -U pipelite -d postgres -c 'DROP DATABASE IF EXISTS pipelite_sc2'
DROP DATABASE

$ docker ps -a --filter name=pipelite-sc2-probe --format '{{.Names}}'
[end of container list]        <- EMPTY

$ docker exec pipelite-postgres-1 psql -U pipelite -d postgres -tAc "select datname from pg_database where datname like 'pipelite_sc2' or datname like 'pipelite_migchk%'"
[end of database list]         <- EMPTY
```

**The surviving database list**, identical to the pre-plan baseline captured before task 2 began:

```
$ docker exec pipelite-postgres-1 psql -U pipelite -d postgres -tAc "select datname from pg_database order by 1"
pipelite
pipelite_dedup_test
postgres
template0
template1
```

`pipelite_dedup_test` is pre-existing (phase 39's isolated test database); it was never touched by this
plan. Nothing was created and left behind, and nothing was dropped that was not created here.

The live database is untouched:

```
$ psql -d pipelite -tAc "select (select count(*) from information_schema.tables where table_schema='public')
      , (select count(*) from organizations), (select count(*) from people)
      , (select count(*) from deals), (select count(*) from users)"
36|46054|38348|25195|10
```

36 tables, 46,054 organizations, 38,348 people, 25,195 deals, 10 users — matching the figures the
plan's threat register recorded as needing protection.

And the dev stack was not disturbed by the probe:

```
$ docker compose ps --format '{{.Name}} {{.State}} {{.Status}}'
pipelite-app-1 running Up 5 minutes
pipelite-mailhog-1 running Up 2 weeks
pipelite-postgres-1 running Up 2 weeks (healthy)

$ curl -s -o /dev/null -w 'HTTP=%{http_code}\n' http://localhost:3001/api/health
HTTP=200
```

---

# Task 3 — the phase sign-off packet

## Automated halves — run on the main tree, at `4895e6a`

### `npm run db:check-migrations` — from the host, NO inline override

```
> pipelite@0.1.0 db:check-migrations
> node scripts/migrate-from-zero.mjs

-> connection: localhost:5433/pipelite (from .env)
-> scratch database: pipelite_migchk_3875792_1787631896862
-> reference database (read with SELECT only): pipelite
-> snapshot reference: drizzle/meta/0019_snapshot.json — 36 tables, 293 table.column pairs, 41 declared index names, 20 journal entries
-> created pipelite_migchk_3875792_1787631896862
-> running `drizzle-kit migrate` against the scratch database — output verbatim:
No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/pedro/programming/pipelite/drizzle.config.ts'
Using 'postgres' driver for database querying
[⣷] applying migrations...[✓] migrations applied successfully!
-> migrate exit code: 0
-> public tables: 36 | drizzle schema tables: 1 | drizzle.__drizzle_migrations rows: 20
-> A/tables: 36 built / 36 declared — IDENTICAL
-> A/columns: 293 built / 293 declared — IDENTICAL
-> A/indexes: 41 / 41 snapshot index names present (81 indexes in total) — IDENTICAL
-> reference: DATABASE_URL -> localhost:5433/pipelite (36 public tables)
-> B/reference equivalence against pipelite:
   dimension    reference  from-zero  verdict
   tables              36         36  IDENTICAL
   columns            293        293  IDENTICAL
   indexes             81         81  IDENTICAL
   constraints         83         83  IDENTICAL
   enums                9          9  IDENTICAL
   functions           38         38  IDENTICAL
   extensions           3          3  IDENTICAL
   triggers             0          0  IDENTICAL
   sequences            0          0  IDENTICAL
   views                0          0  IDENTICAL
-> removed pipelite_migchk_3875792_1787631896862
OK: the migration chain builds a complete schema from zero
EXIT=0
```

**Exit 0, 36 tables, ten IDENTICAL dimensions**, on the main tree rather than a worktree. Reference
branch 6 was taken (a reachable, fully-populated `pipelite`), so assertion set B really ran.

### Suite, types, lint

```
$ npm test
 Test Files  168 passed | 2 skipped (170)
      Tests  4687 passed | 32 skipped (4719)
   Duration  52.51s
--- rsc project ---
 Test Files  2 passed (2)
      Tests  8 passed (8)
TEST_EXIT=0

$ npm run typecheck
> tsc --noEmit
TYPECHECK_EXIT=0

$ npm run lint
✖ 124 problems (0 errors, 124 warnings)
LINT_EXIT=0
```

**0 errors and exactly 124 warnings — the stated main-tree baseline, unchanged.** (46-01 recorded 122
in a worktree; the recorded environment lesson is that the worktree count differs because of
`.planning`'s untracked files, which is why the gate is on ERRORS.)

### Container Node

```
$ docker compose exec app node -v
v24.19.0
```

### `.env` never committed

Checked with git pathspecs rather than a piped `grep -c`, which this environment has been measured
returning wrong counts from:

```
$ git log --all --oneline -- .env
[empty]
$ git log --all --oneline -- .env.local
[empty]
$ git ls-files | <filter for .env*>
.env.example
```

**No commit in this repository's entire history touches `.env` or `.env.local`.** The only tracked env
file is `.env.example`.

### Working tree

```
$ git status --porcelain
[empty]
$ git rev-parse --abbrev-ref HEAD
master
$ git log --oneline -1
4895e6a docs(46-05): complete the Route A CI wiring plan
```

### SC-4 re-confirmed independently, on the main tree

46-02 discharged SC-4 in a worktree that had no `.env.local`. The main tree **does** have one, and it
still names the wrong port — a stronger starting position:

```
.env.local DATABASE_URL assignment lines: 1
  of which name localhost:5432 (the WRONG port): 1

$ npm run db:migrate         # no inline DATABASE_URL prefix, from the repo root
> drizzle-kit migrate
Reading config file '/home/pedro/programming/pipelite/drizzle.config.ts'
Using 'postgres' driver for database querying
[⣷] applying migrations...{ severity: 'NOTICE', code: '42P06', message: 'schema "drizzle" already exists, skipping', … }
{ severity: 'NOTICE', code: '42P07', message: 'relation "__drizzle_migrations" already exists, skipping', … }
[✓] migrations applied successfully!
EXIT=0
```

A `.env.local` naming `localhost:5432` sat in the working directory during a run that connected to
`localhost:5433` and succeeded — the two server `NOTICE`s prove the connection independently of the
banner. 46-02's conclusion holds on the main tree.

## The two things this plan could NOT prove — stated plainly

### GAP 1 — the GitHub `ci` check has never executed the new migration-chain step

The plan's `<how-to-verify>` step 6 asks for a green `ci` run showing the `db:check-migrations` step.
That evidence **does not exist**, and no green run should be mistaken for it:

```
$ git rev-list --left-right --count origin/master...master
0	35            # (behind  ahead)  -> local master is 35 commits AHEAD of origin

$ git log --oneline -1 origin/master
a58b9e1 chore: archive v1.3 phase directories      # pre-Phase-46

$ gh run list --limit 8
  [ok] CI [32792493419]        <- most recent
  …

$ gh run view 32792493419 --json headSha,headBranch,conclusion,displayTitle
{"conclusion":"success","headBranch":"master","headSha":"a58b9e1e35fbbf003e4e4b54b23a12135c23a9b9",
 "displayTitle":"chore: archive v1.3 phase directories"}

$ gh run view 32792493419 --json jobs -q '.jobs[].steps[].name'
Set up job
Run actions/checkout@…
Run actions/setup-node@…
Install dependencies
Typecheck
Lint
Test
Post Run actions/setup-node@…
Post Run actions/checkout@…
Complete job
```

**There is no `Migration chain check` step and no Postgres service in that run**, because it ran
against `a58b9e1` — a commit from before this phase began. All 35 of Phase 46's commits are
**unpushed**. Nothing was pushed by this plan (it was not asked to).

Consequence, stated precisely: 46-05's *source* claim is fully proved (its parsed assertions are
green, and `npm test` includes them), but its *operational* claim — "a migration-chain regression
fails a required check rather than waiting for someone to remember the command" — has not yet been
demonstrated in the real CI. **It will only become evidence on the first push.** This is a
first-execution risk, not a defect found: the step could still fail on the runner for
environment-specific reasons (the service container's readiness, or reference branch 4 behaving
differently there) that no local run can rule out.

### GAP 2 — the human half of the sign-off checkpoint was not performed

`<how-to-verify>` step 5 asks a human to open http://localhost:3001, **sign in**, and open `/deals`.
That was not done: this executor cannot sign in, and guessing a credential would be worse than
reporting the gap. The orchestrator's pre-approval covered rebuilding and restarting, not
substituting for the human check.

What was gathered instead — **explicitly a partial substitute, not the sign-off**:

```
/              HTTP=200 redirect=
/deals         HTTP=307 redirect=http://localhost:3001/login
/api/health    HTTP=200 redirect=

/login         HTTP=200 bytes=67611
  <form    -> true
  password -> true
  email    -> true
  Sign in  -> true
  Pipelite -> true
```

`/deals` redirecting to `/login` shows the auth middleware is running and reaching its session store
over the compose-constructed `DATABASE_URL`, and `/login` renders a real credentials form from a
67 KB server-rendered page. **It does not prove an authenticated session or that `/deals` renders
data.** The developer still owes that check.

## The five negative-control records, confirmed to carry real output

Each `## Negative Controls` section of `46-01` … `46-05` was read. Verdict per control:

| NC | Plan | Carries REAL output? | The decisive line |
|---|---|---|---|
| **NC-1** loud class, `42P01`, exit ≠ 0 | 46-04 | **YES** | a full `DrizzleQueryError` stack with `code: '42P01'`, `relation "import_sessions" does not exist`, `-> migrate exit code: 1`, and the honest rollback report `public tables: 0` |
| **NC-2** silent class — check red while migrate exits 0 | 46-04 | **YES — and it is the decisive one** | the SUMMARY records the spawned `drizzle-kit migrate` at **EXIT CODE 0** printing `[✓] migrations applied successfully!` with 20 ledger rows, beside `db:check-migrations` at **EXIT CODE 1** reporting 35 against 36 and naming `webhook_deliveries` |
| **NC-3** floor checker at `20.20.2` | 46-03 | **YES, both directions** | `20.20.2 -> 1 ["@napi-rs/lzma-linux-x64-gnu :: ^22.20 \|\| ^24.12 \|\| >=25"]`, plus a RED-direction run proving the control is not a tautology (`AssertionError: expected [] to deeply equal [ '@napi-rs/lzma-linux-x64-gnu' ]`) |
| **NC-4** `.env` back at 5432 | 46-02 | **YES** | a full `DrizzleQueryError` with `cause: Error: connect ECONNREFUSED 127.0.0.1:5432`, `EXIT=1`, then the restore run at `EXIT=0` with both server `NOTICE`s |
| **NC-5** remove a `CREATE TABLE` | 46-01 | **YES, three times** | including the load-bearing (a′) run where **exactly one** assertion is red and the ordering scan stays green — the pure silent class an exit-code gate would pass |

All five are verbatim tool output with file:line and exit codes, not descriptions of expected output.
NC-2 additionally re-verified indirectly today: today's `db:check-migrations` run reports the child's
`migrate exit code: 0` on its own line, which is only printable because the script records that code
rather than branching on it.

**Independently re-confirmed on the current tree** (46-03's NC-3, recomputed here from the lockfile):
`20.20.2 -> 1`, `24.0.0 -> 1`, `24.12.0 -> 0`, `24.19.0 -> 0`. The numbers hold.

---

# ROADMAP success criteria — one-line verdict each

| SC | Verdict | Evidence |
|---|---|---|
| **SC-1** — `drizzle-kit migrate` against an empty database completes and its schema matches the working database, table-by-table and column-by-column | **PROVED**, by the amended mechanism | `npm run db:check-migrations` exit 0 today: 20 ledger rows, 36 tables, ten dimensions IDENTICAL (36/293/81/83/9/38/3/0/0/0). Independently reproduced in this plan's task 2 against `pipelite_sc2` (36 tables / 293 columns / 81 indexes / 83 constraints / 3 enum types / 9 enum labels, all identical). **Caveat, stated because the ROADMAP text names it:** the comparison is NOT a `pg_dump --schema-only` diff — neither `pg_dump` nor `psql` is installed on this host, so CONTEXT amendment C4 replaced that with ten catalog queries. The intent (compared, not inferred from a clean exit) is met; the literal mechanism in the ROADMAP wording is not the one used. |
| **SC-2** — the app boots and serves `/api/health` 200 against a database built that way and nothing else | **PROVED** | `HTTP=200` from `http://localhost:3099/api/health`, full body above: `status:"ok"`, `db.ok:true`, `db.latencyMs:39`, **10 processors, 10 alive**. The container was `pipelite-app` image `sha256:48b96371…`; the database was `pipelite_sc2`, whose complete connection log is tabulated above and contains no `db:push`, no dump restore and no seed. `select count(*) from webhook_deliveries` → `0`, not `42P01`. |
| **SC-3** — a repeatable check migrates a throwaway database from scratch and FAILS when a migration references a table no migration creates, observed failing on purpose before being trusted | **PROVED as a check; NOT PROVED as an executed merge gate** | The check exists, is repeatable, and was observed red on purpose: 46-04's NC-1 (`42P01`, exit 1) and NC-2 (check exit 1 while migrate exits 0), both with verbatim output. Re-run green today at exit 0. **The CI half is where the gap is:** the step is in `ci.yml` and is asserted by `db-test-isolation.test.ts`'s parsed per-step assertions, but GitHub has **never executed it** — the latest `ci` run is against pre-phase `a58b9e1` and its step list has no `Migration chain check`. 35 commits unpushed. See GAP 1. |
| **SC-4** — the migrate command exactly as printed succeeds from the host with no inline override and no port edit, observed failing at 5432 | **PROVED** | 46-02's verbatim positive run (`EXIT=0`, both server `NOTICE`s) and its NC-4 red (`ECONNREFUSED 127.0.0.1:5432`, `EXIT=1`). Re-confirmed here on the main tree, with a `.env.local` present and still naming the wrong port 5432, at `EXIT=0`. |
| **SC-5** — every `engines` floor the lockfile declares is satisfied by the container's Node at all three build stages, by reading the declared floors rather than a number in the gate | **PROVED** | The running container reports **`v24.19.0`** (it reported `v20.20.2` an hour earlier, from the same command). `semver.satisfies("24.19.0", ">=24.12.0")` = **true**, control at `20.20.2` = **false**. Walking all **832** declared `engines.node` ranges (106 distinct) in `package-lock.json`: `24.19.0` → **0 violations**; `20.20.2` → 1; `24.0.0` → 1. All three `FROM node:` stages asserted identical by GATE C, 20/20 green. |

**Blunt summary:** four of five criteria are fully proved. SC-1 is proved by a substituted (and, per
CONTEXT C4, stronger) mechanism rather than the `pg_dump` diff the ROADMAP wording names. SC-3 is
proved as a check but its CI-enforcement half is unexecuted and will remain so until the phase is
pushed.

## Final-phase check

| Item | Result |
|---|---|
| `npm test` | **PASS** — 168 files / 4687 tests passed, 2 files / 32 tests skipped; rsc project 2 files / 8 tests passed. Exit 0 |
| `npm run typecheck` | **exit 0** |
| `npm run lint` | **0 errors**, 124 warnings — the stated baseline, unchanged |
| `npm run db:check-migrations` | **exit 0**, ten dimensions IDENTICAL |
| `git status --porcelain` | **empty** |
| Compose stack | **UP** — `pipelite-app-1 running`, `pipelite-postgres-1 running (healthy)`, `pipelite-mailhog-1 running` |
| App on host 3001 | **HTTP 200** on `/api/health` |
| `docker compose exec app node -v` | **v24.19.0** |
| Scratch databases remaining | **none** — no `pipelite_sc2`, no `pipelite_migchk%` |
| `.env` in any commit | **0** |
| GitHub `ci` with the new step | **NOT RUN** — see GAP 1 |
| Human sign-in + `/deals` | **NOT PERFORMED** — see GAP 2 |

## Decisions Made

1. **The rebuild's proof is the running process, not the build log.** The `node:24-alpine` base was
   served from the local image store rather than pulled, so the build log alone could not distinguish a
   real rebuild from a cache hit. The image ID changing (`902ea9f2…` → `48b96371…`), the container's
   bound `.Image` matching the new one, and `node -v` moving `v20.20.2` → `v24.19.0` are the proof.
   The `[execution-processor] Starting` class of line was deliberately not used as evidence.
2. **The pre-rebuild `node -v` was captured before touching anything, and kept.** It turned an
   assertion ("the rebuild took") into a before/after measurement. Recommended as the default shape
   for any future rebuild claim in this repository.
3. **SC-5 was closed with `semver.satisfies` on the observed string plus a full 832-range lockfile
   walk**, and a control call that returns `false`. A `v24.` prefix match would have been the
   major-number eyeball RESEARCH warned against, and `24.0.0 -> 1` is the measurement that shows why.
4. **GAP 1 is reported rather than pushed away.** Pushing 35 commits to make a green CI run appear was
   out of this plan's scope and was not requested. Stating that the gate is unexecuted is more useful
   than a run this executor manufactured.
5. **No automated substitute was dressed up as the human sign-off.** The `/deals` → `/login` redirect
   is recorded and labelled as partial.

## Deviations from Plan

### Auto-fixed / adapted

**1. [Rule 3 — Blocking] `docker compose up -d --build` split into `build` then `up -d`**
- **Found during:** Task 1
- **Issue:** The plan specifies one combined command. Under this environment's shell hook the combined
  form's output is reshaped, and the plan separately requires recording whether the `node:24-alpine`
  layers were pulled or cached — which needs the build log's head, a section the combined command's
  tail does not show.
- **Fix:** Ran `docker compose build app` (capturing its tail, then re-running it fully-cached to
  capture the base-image resolution lines at the head), then `docker compose up -d`. Semantically
  identical to `up -d --build`: the image was built and the container was **Recreated**, not restarted.
  The `Recreate`/`Recreated` lines are quoted above as proof.
- **Files modified:** none
- **Verification:** container bound to the new image ID; `node -v` `v24.19.0`

**2. [Rule 3 — Blocking] `npx drizzle-kit` / `npx vitest` replaced by direct binary paths**
- **Found during:** Tasks 1 and 2
- **Issue:** The recorded environment lesson (and 46-01/46-03's SUMMARYs) is that `npx <tool>` is
  rewritten by the shell hook into a nonexistent npm script.
- **Fix:** `./node_modules/.bin/drizzle-kit` and `./node_modules/.bin/vitest`. Same binaries the npm
  scripts resolve.
- **Files modified:** none

**3. [Rule 2 — Missing critical] Extra evidence added beyond the plan**
- The **pre-rebuild** `node -v` and image ID (the plan asked only for the post-rebuild state) — this
  is what makes the rebuild a measurement rather than an assertion.
- The **832-range lockfile walk** against the observed container version (the plan asked only for one
  `semver.satisfies` call) — it closes SC-5's "every floor the lockfile declares", not just the one
  `package.json` states.
- **Row-count proof that `pipelite_sc2` held no data** (`0|0|0` against the live `46054|38348|10`) —
  positive evidence for the "no dump restore, no seed" claim, which the plan only asked to be
  *asserted in prose*.
- The **ledger-after-entrypoint check** (still 20) — proves the container's boot-time migrate was a
  genuine no-op rather than assuming it from the `NOTICE`s.
- An **independent SC-4 re-run on the main tree**, where `.env.local` exists and still names 5432.

**Total deviations:** 3, all mechanical or additive. No plan step was skipped and no acceptance
criterion was weakened.

## Issues Encountered

- **`git status --porcelain` is reshaped by the shell hook** — a clean tree printed `ok` rather than
  empty output. Load-bearing commands in this plan were run through `rtk proxy` to get raw output;
  counts were computed with `node -e` rather than `grep | wc -l`, per the standing environment lesson.
- **`46-04`'s `enums: 9` briefly looked like a discrepancy** against a direct `pg_type typtype='e'`
  count of 3. It is not: 9 is the `pg_enum` **label** count (3 types × 3 labels). Both counts were
  taken on both databases and both are identical. Recorded so the next reader does not re-open it.
- **The `node:24-alpine` base was not pulled**, having been in the local store since 2026-08-03. This
  is recorded rather than hidden; it is precisely why the build log is not the evidence here.

## Known Stubs

None. This plan created no code and modified no source file.

## Threat Flags

None. No network endpoint, auth path, file-access pattern or schema change was introduced. The four
mitigations the plan's threat register required were all honoured and are evidenced above:
`T-46-06-01` (no secret on a command line, `.env` never echoed — only the throwaway `pipelite:pipelite`
dev pair appears), `T-46-06-02` (only the literal `pipelite_sc2` was ever created or dropped; `pipelite`
was never an argument to a destructive statement, and its 46,054 organizations are intact),
`T-46-06-03` (the probe was a separate `docker run` on port 3099; the dev stack still serves 200 on
3001), `T-46-06-04` (rebuild proved by image identity and the running process, never by a log line),
`T-46-06-05` (no `sudo` and no password in any command in this plan).

## User Setup Required

**Two items are owed by the developer before this phase can be called closed:**

1. **Sign in at http://localhost:3001 and open `/deals`.** The compose `DATABASE_URL` change is the one
   edit in this phase that could break the running stack, and an authenticated page render is the only
   check that covers it end to end. `/deals` correctly redirects to `/login` and `/login` renders, but
   that is not the same thing.
2. **Push the branch and confirm the `ci` check is green with the `Migration chain check` step
   present.** Until then SC-3's merge-gate half is unexecuted (GAP 1). This is the first run of a new
   CI service container, so treat a red as expected-to-be-possible rather than as a phase regression.

## Next Phase Readiness

- **Phase 47 is unblocked on the database side.** A clean schema can now be built from the chain on
  demand (`npm run db:check-migrations`, ~10s), which is the precondition Phase 47's "ten consecutive
  full-suite runs" note depends on.
- **The container runs a supported runtime.** Anything Phase 47 measures inside Docker now measures
  Node 24.19.0, not the EOL 20.20.2 — including any timing-sensitive assertion, which is worth
  remembering if a flake baseline is compared against pre-phase numbers.
- **Carried forward, unchanged:** `Dockerfile:24` still uses `npm install --legacy-peer-deps` rather
  than `npm ci`, so the in-image tree is not lockfile-exact (46-03, deferred by CONTEXT). Today's
  measurement narrows it usefully: the image's **actual** resolved Node is `24.19.0` and it violates
  none of the 832 declared floors, so the gap is about dependency resolution, not about the runtime.
- **Also carried forward:** `@types/node: "^20"` still pins the Node 20 type surface (46-03,
  deferred); and `scripts/dedup-db-test-setup.sh` still provisions from a schema dump rather than the
  now-repaired chain (46-01, deferred).

## Self-Check: PASSED

Files claimed created/modified, verified present on disk:

- `.planning/phases/46-migration-chain-toolchain-floor/46-06-SUMMARY.md` — FOUND (46.5K)
- `.planning/STATE.md` — FOUND
- `.planning/ROADMAP.md` — FOUND

No source file was claimed created or modified by this plan, and none was: the commit below touches
only the three planning documents.

Commit claimed, verified in `git log --oneline --all`:

- **`af75359`** — `docs(46-06): complete the behavioural sign-off plan`. Carries all three files.

*(The first write of this section named `7795515`, the pre-amend hash. Amending to fold this
self-check into the same commit necessarily rewrote it to `af75359`; the correction is recorded here
rather than left as a stale pointer, and lands in the small follow-up commit `docs(46-06): correct the
self-check commit hash after the amend`.)*

```
$ git diff --name-only HEAD~1 HEAD
.planning/ROADMAP.md
.planning/STATE.md
.planning/phases/46-migration-chain-toolchain-floor/46-06-SUMMARY.md

$ git diff --diff-filter=D --name-only HEAD~1 HEAD
[empty]                # no file deletions

$ git status --porcelain
[empty]
```

Environment left as required: compose stack **UP** (`pipelite-app-1 running`,
`pipelite-postgres-1 running (healthy)`, `pipelite-mailhog-1 running`), app serving **HTTP 200** on
host 3001, container on **v24.19.0**, no `pipelite_sc2` and no `pipelite_migchk%` database, live
`pipelite` intact at 36 tables / 46,054 organizations.

No missing items.

---
*Phase: 46-migration-chain-toolchain-floor*
*Completed: 2026-08-25*
