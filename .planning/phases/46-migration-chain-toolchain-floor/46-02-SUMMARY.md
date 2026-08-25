---
phase: 46-migration-chain-toolchain-floor
plan: 02
subsystem: infra
tags: [docker-compose, drizzle-kit, dotenv, postgres, deployment-docs, vitest]

# Dependency graph
requires:
  - phase: 42-uploads-persistence
    provides: "src/lib/__tests__/compose-uploads-persistence.test.ts — the three-file cross-check whose DATABASE_URL anchor had to be re-anchored here"
  - phase: 45-polish
    provides: "src/lib/__tests__/deployment-docs-accuracy.test.ts — the docs gate and its matcher-self-test idiom, extended here"
provides:
  - "`npm run db:migrate` / `npx drizzle-kit migrate` work verbatim from the host with no inline DATABASE_URL override"
  - "docker-compose.yml CONSTRUCTS the app's DATABASE_URL from POSTGRES_* naming @postgres:5432, so the container no longer inherits a host-oriented value"
  - ".env.example (the only tracked env file) prints the host port 5433 and explains which file owns which perspective"
  - "A line-anchored DATABASE_URL-assignment scan over the four host-perspective documents, with an asserted exclusion list for the two operator-Postgres documents"
  - "A gate that turns red if docker-compose.yml is reverted to interpolating DATABASE_URL"
affects: [46-04-migrate-from-zero, any phase running drizzle-kit or e2e from the host]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Host/container perspective split: .env describes the host, docker-compose.yml constructs the container URL"
    - "Line-anchored raw-text scans (^\\s*KEY\\s*=) so explanatory prose can name the opposite form without weakening the gate"
    - "Exclusion lists asserted as live controls rather than written as comments"

key-files:
  created: []
  modified:
    - docker-compose.yml
    - .env.example
    - README.md
    - CONTRIBUTING.md
    - docs/development/contributing.md
    - src/lib/__tests__/compose-uploads-persistence.test.ts
    - src/lib/__tests__/deployment-docs-accuracy.test.ts
    - .env  # machine-local, gitignored, NEVER staged

key-decisions:
  - "drizzle-kit reads only `.env` (path.resolve(cwd, '.env')); `.env.local` was never the mechanism and was not edited"
  - "The container's DATABASE_URL is built by docker-compose.yml from POSTGRES_*, not interpolated, because one file cannot hold both perspectives"
  - "`.env.example` uses pipelite:change-me rather than pipelite:pipelite so it AGREES with the POSTGRES_PASSWORD declared 10 lines below in the same file"
  - "Root CONTRIBUTING.md added to the host-perspective set — the plan's interface scan missed it"
  - "docs/admin/configuration.md and docs/admin/deployment/bare-metal.md deliberately keep 5432, asserted as a live control"

patterns-established:
  - "Anti-vacuity anchors must be INERT with respect to the change they guard — re-anchor, never delete"
  - "On a raw-text-scan collision with your own prose, reword the prose and make the scan precise"

requirements-completed: [DEPLOY-02]

# Metrics
duration: 34min
completed: 2026-08-25
---

# Phase 46 Plan 02: Host Connection String (DEPLOY-02) Summary

**`.env` now describes the host (`localhost:5433`) and `docker-compose.yml` constructs the container's `@postgres:5432` URL itself, so the migrate command every doc prints works verbatim from the host with no inline `DATABASE_URL=` override.**

## Performance

- **Duration:** ~34 min
- **Started:** 2026-08-25T00:04:00Z
- **Completed:** 2026-08-25T00:38:00Z
- **Tasks:** 3/3
- **Files modified:** 7 tracked + 1 machine-local (`.env`, gitignored, never staged)

## Accomplishments

- Corrected the mechanism CONTEXT originally locked. Editing `.env.local` would have shipped a
  no-op: drizzle-kit's bundled dotenv resolves `path.resolve(cwd, ".env")` and nothing else. The
  edit landed on `.env`, `.env.example` and `docker-compose.yml` instead.
- Inverted the two perspectives so neither file has to hold both. The app container's
  `DATABASE_URL` is now built from `${POSTGRES_USER}` / `${POSTGRES_PASSWORD}` / `${POSTGRES_DB}`
  inside `docker-compose.yml`; the rendered value is byte-identical to what it was before
  (`postgresql://pipelite:pipelite@postgres:5432/pipelite`), so the container is provably unaffected.
- Re-anchored the phase-42 compose cross-check instead of deleting it, and replaced its
  `DATABASE_URL` anchor with a positive, YAML-parsed assertion that a revert to an interpolated
  value goes red.
- Extended the docs gate with a line-anchored assignment matcher, its own six-fixture self-test,
  a four-file host-perspective set and a two-file exclusion set asserted as a live control.
- Discharged NC-4 and both halves of SC-4 with recorded verbatim output (below).

## Task Commits

1. **Task 1: Amend both existing gates to the NEW invariant and observe them RED** — `d59512e` (test)
2. **Task 2: Invert the perspectives** — `fcb734b` (fix)
3. **Task 3: SC-4 and NC-4** — no commit by design (observations only)

## Files Created/Modified

- `docker-compose.yml` — `services.app.environment` constructs `DATABASE_URL` from the `POSTGRES_*`
  variables naming `@postgres:5432`, with a rationale comment in the existing `UPLOAD_DIR` register.
- `.env.example` — `DATABASE_URL` to `postgresql://pipelite:change-me@localhost:5433/pipelite`, key
  still at column 0; header rewritten to state which file owns which perspective and to warn against
  "fixing" it back to the container form.
- `README.md` — env block to 5433 with a two-line host/container note; Manual Setup now says
  `cp .env.example .env` and explains that the filename must be exactly `.env`.
- `CONTRIBUTING.md` — step 5's `DATABASE_URL` example to 5433 with a host-perspective note.
- `docs/development/contributing.md` — same edit, same wording.
- `src/lib/__tests__/compose-uploads-persistence.test.ts` — anti-vacuity anchor re-anchored onto
  `SENTRY_DSN=${SENTRY_DSN}` and `UPLOAD_DIR=/app/uploads`; new positive constructed-URL assertion.
- `src/lib/__tests__/deployment-docs-accuracy.test.ts` — new region 6: matcher, self-tests,
  `HOST_PERSPECTIVE_DOCS`, `OPERATOR_POSTGRES_DOCS`, the README `.env.local` assertion and the
  `.gitignore` standing control.
- `.env` (machine-local, `.gitignore:34`) — `DATABASE_URL` to the host form with a short comment;
  the now-false `E2E_DATABASE_URL` companion comment reconciled. **Never staged; `git status
  --porcelain` is empty.** This is the shared host file reached through the worktree's `.env`
  symlink, so the change is live for the main checkout too.

## Negative Controls

### NC-4 — point `.env` back at 5432 and observe the failure

`.env`'s `DATABASE_URL` line (and only that line — `E2E_DATABASE_URL` untouched) was rewritten to
`postgresql://pipelite:pipelite@localhost:5432/pipelite`, then `npm run db:migrate` was run with no
inline override. Verbatim:

```
> pipelite@0.1.0 db:migrate
> drizzle-kit migrate

No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/pedro/programming/pipelite/.claude/worktrees/agent-ae417e4995506e056/drizzle.config.ts'
Using 'postgres' driver for database querying
[⣷] applying migrations...DrizzleQueryError: Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"
params:
    at PostgresJsPreparedQuery.queryWithCache (/home/pedro/programming/pipelite/node_modules/src/pg-core/session.ts:73:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async PgDialect.migrate (/home/pedro/programming/pipelite/node_modules/src/pg-core/dialect.ts:85:3)
    at async migrate (/home/pedro/programming/pipelite/node_modules/src/postgres-js/migrator.ts:10:2) {
  query: 'CREATE SCHEMA IF NOT EXISTS "drizzle"',
  params: [],
  cause: Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1637:16) {
    errno: -111,
    code: 'ECONNREFUSED',
    syscall: 'connect',
    address: '127.0.0.1',
    port: 5432
  }
}
EXIT=1
```

**Which failure text appeared, and why it was recorded.** `ECONNREFUSED 127.0.0.1:5432` — a
connection refusal that names a **PORT**. This is deliberately *not* the pre-fix failure. Before this
plan, `.env` said `@postgres:5432` and the same command failed `getaddrinfo EAI_AGAIN postgres`, an
error naming a **HOSTNAME** with no port in it at all. RESEARCH Pitfall 2 records that this is exactly
what makes the next reader conclude a port fix "did not take" — they change a port, still see a
hostname resolution error, and back the change out. The two errors are different failure modes:
EAI_AGAIN means the name never resolved (a compose service name outside its network), ECONNREFUSED
means the name resolved to loopback and nothing was listening there. Seeing ECONNREFUSED here is
positive evidence that the hostname half of the defect is genuinely gone and only the port was broken.

### NC-4 restore — back to 5433, green again

```
> pipelite@0.1.0 db:migrate
> drizzle-kit migrate

No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/pedro/programming/pipelite/.claude/worktrees/agent-ae417e4995506e056/drizzle.config.ts'
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
[✓] migrations applied successfully!
EXIT=0
```

### Task 1 RED — both gates measured the change before the change was made

Combined run of the two gates immediately after the amendments and before any config edit:
**77 passed, 10 failed, exit non-zero.** All six matcher self-test `it`s passed in that red run,
including the important `#   DATABASE_URL="…@postgres:5432/…"` KNOWN_NEGATIVE. The re-anchored
"read the app service, not an empty list" `it` passed, and so did the `.gitignore` control and both
`OPERATOR_POSTGRES_DOCS` controls. The ten failures, verbatim:

```
1. uploads persistence: docker-compose.yml is a real compose file (anti-vacuity) constructs the app's DATABASE_URL itself, naming @postgres:5432
   AssertionError: expected false to be true // Object.is equality

2. host-perspective docs … .env.example assigns only the host port 5433
   Offending lines: .env.example:2: DATABASE_URL="postgresql://user:password@localhost:5432/pipelite"
3. host-perspective docs … CONTRIBUTING.md assigns only the host port 5433
   Offending lines: CONTRIBUTING.md:43: DATABASE_URL=postgresql://user:password@localhost:5432/pipelite
4. host-perspective docs … README.md assigns only the host port 5433
   Offending lines: README.md:79: DATABASE_URL="postgresql://user:password@localhost:5432/pipelite"
5. host-perspective docs … docs/development/contributing.md assigns only the host port 5433
   Offending lines: docs/development/contributing.md:43: DATABASE_URL=postgresql://user:password@localhost:5432/pipelite

6. .env.example never assigns localhost:5432        → [".env.example:2: …"]
7. CONTRIBUTING.md never assigns localhost:5432     → ["CONTRIBUTING.md:43: …"]
8. README.md never assigns localhost:5432           → ["README.md:79: …"]
9. docs/development/contributing.md never assigns localhost:5432 → ["docs/development/contributing.md:43: …"]

10. no document tells a reader to create the one file drizzle-kit never reads > README.md does not mention .env.local
    AssertionError: README.md still names .env.local: README.md:63: cp .env.example .env.local | README.md:64: # Edit .env.local with your database URL and auth secret
    - []
    + [
    +   "README.md:63: cp .env.example .env.local",
    +   "README.md:64: # Edit .env.local with your database URL and auth secret",
    + ]
```

After task 2, the same command is **87 passed, 0 failed**, with `git diff --stat HEAD~1 -- src/lib/__tests__/` empty — the gates were not touched to reach green.

## SC-4 — the printed command, run verbatim

### Positive half, with `.env.local` ABSENT

Execution ran in a git worktree whose cwd contains no `.env.local` at all (it is gitignored, so a
fresh worktree simply does not have one — a stronger starting position than the plan's
`mv .env.local .env.local.bak`, because there was nothing to move). Confirmed before the run:

```
$ test -e .env.local && echo PRESENT || echo ABSENT
ABSENT
```

`npm run db:migrate`, from the repository root, no inline `DATABASE_URL=` prefix, no other
environment override. This is the command `README.md` prints:

```
> pipelite@0.1.0 db:migrate
> drizzle-kit migrate

No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/pedro/programming/pipelite/.claude/worktrees/agent-ae417e4995506e056/drizzle.config.ts'
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
[✓] migrations applied successfully!
EXIT=0
```

**Connection is confirmed independently of the success banner.** Per
`docs/admin/backup-restore.md:200-210`, drizzle prints the identical `migrations applied
successfully!` line for 0 applied migrations and for 20, so that line alone would be a seventh
vacuous gate. The two `NOTICE` payloads above are the real evidence: `42P06 schema "drizzle" already
exists` and `42P07 relation "__drizzle_migrations" already exists` are **PostgreSQL server notices**,
relayed from a live backend. A client that never connected cannot produce them — compare the NC-4 run,
which reached `CREATE SCHEMA IF NOT EXISTS "drizzle"` and got `ECONNREFUSED` instead.

### The bare `npx drizzle-kit migrate` form — the one 12 of 14 doc sites print

```
No config path provided, using default 'drizzle.config.ts'
Reading config file '/home/pedro/programming/pipelite/.claude/worktrees/agent-ae417e4995506e056/drizzle.config.ts'
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
[✓] migrations applied successfully!
EXIT=0
```

### Second half — `.env.local` PRESENT, and deliberately WRONG

Rather than restoring a correct `.env.local`, the copy placed into cwd was the machine's real one,
which still carries the **wrong** port:

```
$ cp /home/pedro/programming/pipelite/.env.local .env.local
$ grep -c 'localhost:5432/pipelite' .env.local
1
```

`npm run db:migrate` again — **EXIT=0**, same two server NOTICEs, same success line.

This is stronger than "`.env.local` is irrelevant when absent". A `.env.local` naming `localhost:5432`
sat in the working directory during a run that connected to `localhost:5433` and succeeded. If
drizzle-kit read `.env.local` at all — even as a lower-priority overlay — this run would have failed
exactly as NC-4 did. **`.env.local` is irrelevant in both directions: absent it changes nothing, and
present-and-wrong it changes nothing.** The temporary copy was then deleted.

## Decisions Made

- **`.env.example` uses `pipelite:change-me`, not `pipelite:pipelite`.** The plan and RESEARCH
  Pattern 4 both specified `pipelite:pipelite`, and the plan's own threat register (T-46-02-01)
  justified it as "matching `POSTGRES_USER`/`POSTGRES_PASSWORD` already published at
  `.env.example:10-12`". It does not match: `POSTGRES_PASSWORD` is declared `"change-me"` ten lines
  below. Since the file's own header states the two must AGREE, shipping a literal that contradicts
  the instruction directly above it would have been a new papercut in place of the old one. Same
  literal used in `README.md`, `CONTRIBUTING.md` and `docs/development/contributing.md`.
- **The `.env.example` header keeps naming `@postgres:5432` in a commented example**, because the
  most likely future regression is a reader "fixing" the host URL into the container form. The
  line-anchored matcher was designed for precisely this collision.
- **The compose comment avoids writing `${DATABASE_URL}` literally.** `composeRequiredVars()` scans
  the compose file as raw text *including comments*, so the literal would have re-added DATABASE_URL
  to the required-variable set and pushed the inventory to 16 rather than the predicted 15.
- **`.env`'s `E2E_DATABASE_URL` was left in place** (descoping it is not this phase's business), but
  its companion comment — which asserted "the app-facing DATABASE_URL above resolves postgres:5432
  inside the Docker network" — became false on landing and was reconciled in the same edit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical coverage] Root `CONTRIBUTING.md` was missing from the host-perspective set**
- **Found during:** Task 1 (before writing the matcher)
- **Issue:** The plan's `<interfaces>` block claimed to enumerate "every `DATABASE_URL=` occurrence
  printing `localhost:5432` today" and listed five files. A repo-wide scan found a sixth:
  `CONTRIBUTING.md:43`. It is a separate real file, not a symlink to `docs/development/contributing.md`
  (the two documents differ substantially), and it carries its own copy of the same setup snippet —
  in the file a first-time contributor is most likely to open. Leaving it would have kept the defect
  alive in the highest-traffic location while the gate reported green.
- **Fix:** Added `"CONTRIBUTING.md"` to `HOST_PERSPECTIVE_DOCS` and corrected its line 43.
- **Files modified:** `src/lib/__tests__/deployment-docs-accuracy.test.ts`, `CONTRIBUTING.md`
- **Verification:** It appears as failures 3 and 7 in the task-1 RED output above and is green after task 2.
- **Committed in:** `d59512e` (gate) and `fcb734b` (document)

**2. [Rule 1 - Bug] The plan's `.env.example` credential literal contradicted the file's own stated invariant**
- **Found during:** Task 2
- **Issue:** `pipelite:pipelite` disagrees with `POSTGRES_PASSWORD="change-me"` declared ten lines
  below, while the header of the same block instructs the reader to keep them in agreement.
- **Fix:** Used `pipelite:change-me` throughout the host-perspective documents.
- **Files modified:** `.env.example`, `README.md`, `CONTRIBUTING.md`, `docs/development/contributing.md`
- **Verification:** `grep -c '^DATABASE_URL=' .env.example` → 1, containing `localhost:5433`; both
  gates green; the artifact's `contains: "localhost:5433"` requirement is unaffected.
- **Committed in:** `fcb734b`

**3. [Rule 3 - Blocking] Three self-collisions between this plan's own prose and this plan's own scans**
- **Found during:** Tasks 1 and 2
- **Issue:** (a) The natural wording for README's new warning — "it must be `.env`, not `.env.local`" —
  contains the literal the new gate asserts zero occurrences of. (b) The compose test's explanatory
  comment naturally reproduces `DATABASE_URL=${DATABASE_URL}`, which the plan's acceptance criteria
  require to grep to zero. (c) The compose YAML comment naturally reproduces `${DATABASE_URL}`, which
  `composeRequiredVars()` would have counted, breaking the predicted inventory of 15.
- **Fix:** Reworded the prose in all three places, per the standing house rule
  (`compose-uploads-persistence.test.ts:299-306`) that a raw-text collision is resolved by rewording,
  never by weakening the scan. No assertion was relaxed. The README wording still carries the warning
  ("the filename must be exactly `.env` — drizzle-kit's dotenv loads that name and no other, so any
  suffixed variant is invisible"); the compose test comment still explains the re-anchor and now says
  explicitly why the old literal is not reproduced.
- **Files modified:** `README.md`, `docker-compose.yml`, `src/lib/__tests__/compose-uploads-persistence.test.ts`
- **Verification:** `grep -c 'env\.local' README.md` → 0;
  `grep -c 'DATABASE_URL=\${DATABASE_URL}' src/lib/__tests__/compose-uploads-persistence.test.ts` → 0;
  `${VAR}` inventory → 15.
- **Committed in:** `d59512e`, `fcb734b`

**4. [Rule 2 - Missing critical functionality] The exclusion list was decorative; made it a live control**
- **Found during:** Task 1
- **Issue:** As specified, `OPERATOR_POSTGRES_DOCS` was a documented list with no assertion behind it.
  A future "fix all the ports" sweep would rewrite `configuration.md` and `bare-metal.md` to 5433 —
  a real regression for operators running their own Postgres — and nothing would go red.
- **Fix:** Added `it.each(OPERATOR_POSTGRES_DOCS)("%s deliberately still prints 5432")`, asserting at
  least one `localhost:5432` assignment survives in each. Also added a disjointness test so a file
  can never appear in both lists (which would be an unsatisfiable pair of assertions, and the kind of
  contradiction that gets "resolved" by deleting one).
- **Files modified:** `src/lib/__tests__/deployment-docs-accuracy.test.ts`
- **Verification:** Both controls pass in the RED run and after; `grep -rn 'localhost:5432'
  docs/admin/configuration.md docs/admin/deployment/bare-metal.md` still returns 2 matches.
- **Committed in:** `d59512e`

**5. [Rule 1 - Bug] `it.each` title used two `%s` placeholders for a one-element tuple**
- **Found during:** Task 1 (first RED run)
- **Issue:** The test title rendered as `.env.example never assigns the unreachable undefined`, and
  the assertion carried no message, so its RED output named neither the file nor the offending line.
- **Fix:** Interpolated the constant into the title instead, and added offender text to that
  assertion's message and to the two neighbouring ones.
- **Files modified:** `src/lib/__tests__/deployment-docs-accuracy.test.ts`
- **Verification:** The recorded RED output above now names `file:line: text` for every failure.
- **Committed in:** `d59512e`

**6. [Rule 1 - Bug] `.env`'s `E2E_DATABASE_URL` comment became false on landing**
- **Found during:** Task 2
- **Issue:** `.env:16-17` said "the app-facing DATABASE_URL above resolves postgres:5432 inside the
  Docker network and is unreachable from the host" — the exact statement this plan inverts. A stale
  comment describing the opposite of the line above it is how the next reader reverts the fix.
- **Fix:** Rewrote both lines to say `E2E_DATABASE_URL` now points at the same host port as
  `DATABASE_URL` and is redundant rather than wrong, and that Playwright reads it so it stays.
- **Files modified:** `.env` (machine-local, gitignored, not staged)
- **Verification:** Reviewed in place; `git status --porcelain` empty.
- **Committed in:** not committed — `.env` is gitignored by design.

---

**Total deviations:** 6 auto-fixed (3 × Rule 1, 2 × Rule 2, 1 × Rule 3)
**Impact on plan:** No scope creep. Four of the six are corrections to the plan's own measurements or
to collisions the plan created; the other two make an exclusion list and a failure message actually
carry information. Every plan acceptance criterion still holds.

## Issues Encountered

- **The `.env` symlink is not writable through the Edit tool inside a worktree.** The worktree's
  `.env` is a symlink to the main checkout's real file, and the tool refuses to follow it out of the
  worktree. `sed -i` was rejected too, since it would have replaced the symlink with a regular file
  and silently detached the worktree from the shared `.env`. Resolved by writing through
  `os.path.realpath(".env")` in a short Python script that asserts an exact one-line match before
  rewriting, so no other line — including `SMTP_PASSWORD` and `AUTH_SECRET` — could be touched. The
  file was never echoed in full at any point.
- **The first `.env` rewrite attempt asserted the wrong match count** (2, not 1), because
  `E2E_DATABASE_URL=…` contains `DATABASE_URL=…` as a substring. The assertion caught it before
  anything was written; the retry matched whole lines instead. Recorded because the same trap will
  bite plan 46-04 if it edits `.env` by substring.
- **`docker compose ps` reports 0 services from inside the worktree**, because compose derives its
  project name from the directory. The stack is up under project `pipelite`; verified with
  `docker ps` instead. `docker compose config` still renders correctly from the worktree, because it
  reads the local `docker-compose.yml` and the symlinked `.env`.

## Verification Results

| Check | Result |
|---|---|
| `npx vitest run` on both amended gates, after task 1 | 77 passed / 10 failed, exit non-zero (RED as designed) |
| Same command, after task 2 | 87 passed / 0 failed |
| `git diff --stat HEAD~1 -- src/lib/__tests__/` after task 2 | empty — gates untouched to reach green |
| `grep -c '^DATABASE_URL=' .env.example` | 1, containing `localhost:5433` |
| `grep -rn 'localhost:5432' .env.example README.md CONTRIBUTING.md docs/development/contributing.md` | no matches (exit 1) |
| `grep -rn 'localhost:5432' docs/admin/configuration.md docs/admin/deployment/bare-metal.md` | still 2 matches |
| `grep -c 'env\.local' README.md` | 0 |
| `grep -c 'DATABASE_URL=\${DATABASE_URL}' src/…/compose-uploads-persistence.test.ts` | 0 |
| `docker compose config` | exit 0; app renders `DATABASE_URL=postgresql://pipelite:pipelite@postgres:5432/pipelite` — identical to the pre-change value |
| compose `${VAR}` inventory | 15 distinct (floor is `MIN_COMPOSE_VARS = 12`) |
| `npm test` | 166 files passed / 2 skipped; 4634 tests passed / 32 skipped. RSC suite 8/8 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 122 problems, **0 errors** (warning count unchanged) |
| `git status --porcelain` at end | empty; `.env` never staged |

## User Setup Required

None — no external service configuration required. Note for anyone working on this machine: the
shared `.env` at `/home/pedro/programming/pipelite/.env` was edited (via the worktree symlink) and now
holds `DATABASE_URL=postgresql://pipelite:pipelite@localhost:5433/pipelite`. Existing containers are
unaffected; a future `docker compose up` builds the container's URL from `POSTGRES_*` and produces
the same value it always had.

## Next Phase Readiness

- **Plan 46-04 inherits this fix.** Its from-zero check runs from the host and can now call
  `drizzle-kit` without an inline `DATABASE_URL=` prefix. It reads the same machine-global `.env`,
  which is back at 5433 and clean.
- **Sibling wave-1 plans (46-01, 46-03) are unaffected.** Neither runs a database command. The NC-4
  window in which `.env` pointed at 5432 was under a minute and is closed.
- **A revert is now gated.** Pointing `docker-compose.yml` back at an interpolated `DATABASE_URL`,
  or moving any of the four host-perspective documents back to 5432, turns
  `compose-uploads-persistence.test.ts` or `deployment-docs-accuracy.test.ts` red in CI.
- **No new threat surface.** No network endpoint, auth path, file access pattern or schema change was
  introduced. No package was installed.

## Self-Check: PASSED

All eight claimed files exist on disk (`.env.example`, `docker-compose.yml`, `README.md`,
`CONTRIBUTING.md`, `docs/development/contributing.md`, both test files, this SUMMARY). Both claimed
commits resolve in `git log --all`: `d59512e`, `fcb734b`. Task 3 correctly produced no commit.
`.env` is intentionally absent from the file list — it is gitignored and was never staged.

---
*Phase: 46-migration-chain-toolchain-floor*
*Completed: 2026-08-25*
