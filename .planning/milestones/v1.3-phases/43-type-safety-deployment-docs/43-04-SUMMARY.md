---
phase: 43-type-safety-deployment-docs
plan: 04
subsystem: docs/operations
tags: [documentation, backup, restore, postgres, docker, bare-metal, gate]
requirements: [POLISH-02]
requires:
  - "43-03: uploads_data named volume, UPLOAD_DIR=/app/uploads, image-layer chown"
provides:
  - "docs/admin/backup-restore.md — the single authoritative backup/restore procedure"
  - "src/lib/__tests__/deployment-docs-accuracy.test.ts — 43-assertion docs gate with a self-tested matcher"
  - "*.dump and pipelite-uploads-*.tar.gz gitignored"
affects:
  - "docs/admin/deployment/docker.md — DATABASE_URL, Volume Mounts, Backup Strategy"
  - "docs/admin/deployment/bare-metal.md — checklist pointer, File uploads note"
  - "docs/admin/troubleshooting.md — database log command"
  - "docs/admin/configuration.md — new UPLOAD_DIR section"
  - "docs/index.md, docs/admin/index.md — runbook entries"
tech-stack:
  added: []
  patterns:
    - "gate matchers unit-test themselves against known-positive/known-negative fixtures before scanning"
    - "one authoritative procedure page, pointed at rather than duplicated"
key-files:
  created:
    - docs/admin/backup-restore.md
    - src/lib/__tests__/deployment-docs-accuracy.test.ts
  modified:
    - .gitignore
    - docs/index.md
    - docs/admin/index.md
    - docs/admin/configuration.md
    - docs/admin/troubleshooting.md
    - docs/admin/deployment/docker.md
    - docs/admin/deployment/bare-metal.md
decisions:
  - "Phantom-service matcher scoped to compose INVOCATIONS, not the token `db`, so the runbook can warn operators about the defect in prose without tripping its own scan — decided up front, not after a collision"
  - "The literal `@db:5432` is never reproduced anywhere in the runbook; that defect is described in prose only, because a fixed-string assertion has no escape hatch"
  - "docker.md's Backup Strategy became a pointer with zero commands, so the two copies cannot drift again"
metrics:
  duration: ~50 min
  completed: 2026-08-24
  tasks: 3
  commits: 3
  files_created: 2
  files_modified: 7
---

# Phase 43 Plan 04: Backup/Restore Runbook and Deployment-Doc Repair Summary

One authoritative backup/restore runbook covering Docker and bare metal, database and uploaded
files, with `--no-owner --no-privileges` and the measured reason they are mandatory — plus all five
documented deployment defects repaired and a 43-assertion gate whose matcher proves itself against
fixtures before it scans.

## What Was Built

| Task | Commit | What |
|---|---|---|
| 1 | `d9bad01` | `src/lib/__tests__/deployment-docs-accuracy.test.ts` — 43 assertions, RED on the defective tree |
| 2 | `6e093f4` | `docs/admin/backup-restore.md` (10 sections), both index entries, `.gitignore` block |
| 3 | `f944328` | docker.md (3 edits), bare-metal.md (2 edits), troubleshooting.md (1 line), configuration.md (new `UPLOAD_DIR` section) |

## The Matcher Self-Test — Six Fixture Results

All six PASSED in the RED run, before any document was touched. This is the direct countermeasure to
phase 42's grep whose malformed bracket expression matched nothing and therefore "passed."

| Fixture | Expected | Result |
|---|---|---|
| `docker compose exec db pg_dump -U pipelite pipelite > backup_$(date +%Y%m%d).sql` | MATCH | PASS |
| `docker compose logs db` | MATCH | PASS |
| `docker compose exec -T db psql -U pipelite pipelite` | MATCH | PASS |
| `docker compose exec -T postgres pg_dump -U pipelite -Fc pipelite` | NO MATCH | PASS |
| `  db: {` (from `docs/development/testing.md:70`) | NO MATCH | PASS |
| `docker compose logs postgres` | NO MATCH | PASS |

The third fixture is the load-bearing one: `-T` sits between `exec` and `db`, so the naive
`/exec\s+db/` form misses it — and that was a real defect at `docker.md:279`. The matcher therefore
carries `(?:\s+-{1,2}[^\s]+)*` between the subcommand and the service.

**Sabotage proof:** replacing `\s+db\b` with `\s+db(?=X)` (a matcher that can never match) turned all
three known-positive fixtures RED while every scan assertion stayed green — reproducing the phase-42
failure mode exactly, and demonstrating that the self-test block is what detects it.

## Task 1 RED — The Five Real Defects, Verbatim

Markdown files enumerated: **40** (floor asserted at 20; none empty; all six named files present;
recursion into subdirectories asserted).

Phantom-service scan `file:line` output:

```
docs/admin/deployment/docker.md:276: docker compose exec db pg_dump -U pipelite pipelite > backup_$(date +%Y%m%d).sql
docs/admin/deployment/docker.md:279: cat backup_20260304.sql | docker compose exec -T db psql -U pipelite pipelite
docs/admin/troubleshooting.md:561: docker compose logs db
```

Phantom-hostname scan:

```
docs/admin/deployment/docker.md:118: DATABASE_URL=postgresql://pipelite:yourpassword@db:5432/pipelite
```

Phantom service key in a compose snippet:

```
docs/admin/deployment/docker.md:214: db:
```

**RED run: 20 passed / 23 failed (43).** Green in RED: all 6 matcher fixtures, the `db`-not-a-service
assertion, all 9 anti-vacuity assertions, and the 4 runbook anti-pattern assertions (vacuously green
against an absent file — noted, not relied on). That split is the proof the gate reads real files: a
gate red on every line is indistinguishable from a gate with wrong paths.

## Task 2 Red Set vs. the Plan's Prediction — One Discrepancy, Reported

After task 2: **37 passed / 6 failed (43).**

| Still red | Predicted by the plan? |
|---|---|
| phantom compose invocation against `db` | yes |
| `@db:5432` hostname | yes |
| `db:` key in a docker.md compose snippet | yes |
| `docker.md` links to `backup-restore.md` | yes |
| `bare-metal.md` links to `backup-restore.md` | yes |
| `UPLOAD_DIR` appears in `configuration.md` | **NO — omitted from the prediction** |

**Finding.** The plan's task-2 prediction enumerated five red assertions; the actual red set was six.
The extra one is `configuration.md` → `UPLOAD_DIR`, which belongs to exactly the same class as the two
pointers the prediction *did* list: an assertion on a document that task 3 owns. `configuration.md`
is named in task 3's `<files>` and task 3's action explicitly adds the `### UPLOAD_DIR` section, so
the assertion could not have been green after task 2. This is a bookkeeping omission in the plan's
prediction, not a deviation in execution — the red set is fully explained, nothing was unexpected, and
task 3 closed it. Recorded because the plan asked for extra-or-missing reds to be reported rather than
absorbed.

Everything the prediction required GREEN after task 2 was green: all 12 runbook content tokens, all 4
anti-pattern assertions, the `.gitignore` assertion, and both index pointers.

**The runbook added zero new phantom hits.** The three `file:line` results were byte-identical before
and after it was written — the up-front matcher scoping worked as designed (see "Scope decision"
below).

## Task 3 — Fully Green

**43 passed / 0 failed (43).**

Verification sweep, showing the command and its empty output:

```
$ grep -rn "compose exec db\|compose logs db\|@db:5432" docs/
$ echo $?
1
```

(no output; exit 1 = no matches)

```
$ grep -c "pg_dump" docs/admin/deployment/docker.md
0
$ grep -c "psql" docs/admin/deployment/docker.md
0
$ grep -c "healthcheck" docs/admin/deployment/docker.md
0
$ grep -c PGPASSWORD docs/admin/backup-restore.md
0
```

## The Runbook's Backup and Restore Blocks, As Shipped

Backup:

```bash
# 1. The database. -Fc is PostgreSQL's compressed custom format and streams cleanly
#    through `exec -T`: measured 34,299,898 bytes in 9.0s for a database that is
#    121,722,344 bytes as plain SQL.
docker compose exec -T postgres pg_dump -U pipelite -Fc pipelite > "pipelite-db-$(date +%F).dump"

# 2. The uploaded files. The named volume Docker creates is `pipelite_uploads_data` —
#    the compose project name (`pipelite`, from the directory) prefixes the volume name
#    declared in docker-compose.yml. Confirm yours with `docker volume ls`.
docker run --rm -v pipelite_uploads_data:/data:ro -v "$PWD:/backup" alpine:3 \
  tar czf "/backup/pipelite-uploads-$(date +%F).tar.gz" -C /data .
```

Restore into a fresh database:

```bash
# 1. Stop the app so nothing writes during the restore.
docker compose stop app

# 2. Create an empty target database.
docker compose exec -T postgres createdb -U pipelite pipelite

# 3. Restore. Both flags are MANDATORY — see the callout below.
docker compose exec -T postgres pg_restore -U pipelite -d pipelite \
  --no-owner --no-privileges < pipelite-db-2026-08-23.dump

# 4. Restore the uploaded files into the volume.
docker run --rm -v pipelite_uploads_data:/data -v "$PWD:/backup:ro" alpine:3 \
  tar xzf /backup/pipelite-uploads-2026-08-23.tar.gz -C /data

# 5. Start the app and check the entrypoint's migration step found nothing to do.
docker compose up -d app
docker compose logs --tail=20 app
```

Flag-for-flag against `<verified_commands>`: service `postgres`, `-U pipelite`, `-Fc`,
`--no-owner --no-privileges`, no `-j`, no `--schema`, `pipelite_uploads_data` project-prefixed in both
`docker run -v` commands. Bare metal reproduces `sudo -u postgres pg_dump -Fc` and
`sudo -u postgres pg_restore -d pipelite --no-owner --no-privileges`.

## The Rewritten Volume Snippet — And Why It Is Not an Inert Fix

```yaml
# docker-compose.yml
services:
  app:
    environment:
      # MANDATORY alongside the mount below, and not merely tidiness. UPLOAD_DIR
      # defaults to /tmp/uploads in the application code, and this compose file has
      # no `env_file:` — so a variable absent from this list never reaches the
      # container. Without this line the app writes to /tmp inside the container and
      # the volume below stays empty forever: nothing errors, and every upload is
      # still destroyed on the next rebuild.
      # Hardcoded rather than ${UPLOAD_DIR} so it can never disagree with the mount
      # target on the next line.
      - UPLOAD_DIR=/app/uploads
    volumes:
      - uploads_data:/app/uploads

  postgres:
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
  uploads_data:
```

Verified against the real post-43-03 `docker-compose.yml`: `UPLOAD_DIR=/app/uploads` on `app`
(line 36), `uploads_data:/app/uploads` on `app`, `postgres_data:/var/lib/postgresql/data` on
`postgres`, and both top-level declarations. No `healthcheck` anywhere in docker.md (42-CONTEXT A8).

Renaming `db` → `app` in the old snippet would have reviewed clean and persisted nothing: the real
blocker was `UPLOAD_DIR`, which the code defaults to `/tmp/uploads` and which compose must set
explicitly because the file has no `env_file:`. The prose alongside the snippet also documents the
image's pre-create/chown of `/app/uploads` — without which a fresh named volume is created
`root:root` and every upload returns 500 — and gives the bind mount one line with its
`chown 1001:1001` caveat.

## Scope Decision — How the Gate Avoids Tripping on Its Own Runbook

The gate scans `docs/**` as raw text, and the runbook must warn operators about the phantom service
in order to be useful. Both mitigations were designed up front, not discovered after a collision:

1. **Matcher scoping.** The phantom-service matcher requires an actual compose invocation on the line
   (`docker[- ]compose` + a service-taking subcommand + optional flags + `db` as a whole token). The
   runbook's pitfalls table therefore says "Running against a service named `db` — there is no such
   service" freely: that is prose, not a copyable command, and the defect being prevented is a
   pasteable broken command. The assertion loses nothing.
2. **Never reproducing the fixed string.** `@db:5432` has no such escape hatch, so the runbook
   describes that defect in prose and never writes the literal. Note `docs/admin/configuration.md`
   legitimately contains `@db.xxx.supabase.co:5432` and `@db.example.com:5432`; the asserted string is
   the colon form, which does not match either.

No assertion was weakened at any point, and no prose was reworded reactively — the runbook was
written correct on the first pass and added zero phantom hits.

## Proof That Every Assertion Class Can Actually Fail

Each mutation was applied to a committed clean tree, the gate was run, and the file restored with
`git checkout -- <specific file>`. The tree is clean and 43/43 green afterwards.

| Mutation | Assertion that went RED | Result |
|---|---|---|
| `logs postgres` → `logs db` in troubleshooting.md | phantom compose invocation | 1 failed / 42 passed |
| `@postgres:5432` → `@db:5432` in docker.md | phantom hostname | red |
| commented out `*.dump` in `.gitignore` | gitignores `*.dump` | red (2 failed / 41 passed with the above) |
| stripped every `--no-owner` from the runbook | runbook contains `--no-owner` | 1 failed / 42 passed |
| inserted `pg_restore -j 4` into the runbook | never suggests parallel restore | 1 failed / 42 passed |
| renamed the runbook link in bare-metal.md | bare-metal.md links to `backup-restore.md` | red |
| `  postgres:` → `  db:` in docker.md's snippet | publishes no compose snippet declaring `db` | red |
| renamed `UPLOAD_DIR` in configuration.md | `UPLOAD_DIR` appears in configuration reference | red (3 failed / 40 passed with the above) |
| `\s+db\b` → `\s+db(?=X)` in the matcher | all 3 known-positive fixtures | 3 failed / 40 passed |

**One honest limitation found while doing this.** Removing `--no-owner` from only the *command* lines
left the assertion GREEN, because the flag still appeared in the explanatory callout — the assertion
is token-presence over the whole file, not per-command-line. Proving it can fail required stripping
every occurrence. This is correct behavior for the assertion as specified in the plan, and it is
recorded rather than silently patched: the assertion guarantees the flags are *documented*, and the
character-for-character command check against `<verified_commands>` is what guarantees they are in the
commands. The `  postgres:` → `  db:` mutation is worth noting for the opposite reason: it tripped
*only* the snippet-key assertion and not the invocation scan, which is exactly right — a YAML key is
not a command.

## Deviations from Plan

**None affecting the work.** One finding about the plan's own bookkeeping, reported above rather than
absorbed: the task-2 red-set prediction listed five assertions where the actual set was six, omitting
`configuration.md` → `UPLOAD_DIR`. Task 3's own `<files>` and action text assign that document to task
3, so the sixth red was inevitable and expected; the prediction sentence simply did not enumerate it.
Nothing extra was red, nothing predicted-red was green.

One cosmetic incident: task 3's first commit message was written with single-backtick markdown inside
a double-quoted shell string, so `` `postgres` `` was command-substituted and dropped a word from the
message body. The tree was unaffected; the message was amended (`b3e3aa6` → `f944328`). No `--no-verify`
was used on any commit.

## Constraints Honored

- No `docker compose build` / `up` / `down` / `restart` run; no database restored, dumped or touched.
  Only read-only file inspection. The live proofs are plan 43-05's.
- No `npm install` / `ci` / `update`. `package.json` and `package-lock.json` end **unmodified** —
  `git status --porcelain` is empty and neither file appears in any of the three commits.
- No `git stash`, no `git clean`, no blanket resets. Restores after each mutation used
  `git checkout -- <specific file>` only.
- Files touched: `docs/**`, `.gitignore`, and the one gate file. No overlap with sibling 43-02
  (`src/` TypeScript). STATE.md and ROADMAP.md untouched.

## Final Numbers

| Check | Result |
|---|---|
| `deployment-docs-accuracy.test.ts` | **43 passed / 0 failed (43)** |
| `npm test` | **4605 passed / 32 skipped / 0 failed** (166 files passed, 2 skipped) |
| `npm test` RSC project | **8 passed / 8** (2 files) |
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` | **0 errors** (122 warnings — environment-dependent, not gated) |
| `grep -rn "compose exec db\|compose logs db\|@db:5432" docs/` | no output, exit 1 |
| `git status --porcelain` | empty |

Baseline was 4562 passed; this plan's gate adds 43, giving 4605 exactly.

## Threat Register Dispositions

| Threat ID | How it was mitigated |
|---|---|
| T-43-22 | Restore-into-a-fresh-database leads (section 3); `--clean --if-exists` is section 4 with both its measured idempotence and its `DROP` risk stated, plus an explicit instruction never to use it for a practice run. Gate asserts `--clean` never appears without `--if-exists`. |
| T-43-23 | `--no-owner --no-privileges` documented as MANDATORY with the measured 45-errors-and-exit-1-while-restoring-correctly consequence. Both flags asserted present. |
| T-43-24 | Pitfalls table states the migration ledger lives in the `drizzle` schema; gate asserts no line carries both `pg_dump` and `--schema`. |
| T-43-25 | "Where not to leave the dump" section (off-host, `chmod 600`, encrypt); `.gitignore` gained `*.dump` and `pipelite-uploads-*.tar.gz` with an explanatory comment; gate asserts the `*.dump` entry. |
| T-43-26 | `grep -c PGPASSWORD docs/admin/backup-restore.md` = 0, asserted by the gate. `docker compose exec` inherits the container env; bare metal uses `sudo -u postgres`. |
| T-43-27 | Section 7 states both extensions are `trusted = true` on PostgreSQL 16 so a database owner suffices; no superuser is recommended anywhere. |
| T-43-28 | Six fixture assertions run before the scan; nine anti-vacuity assertions (40 files, none empty, six named, recursion). Sabotage-proven above. |
| T-43-29 | Volume section rewritten from the real `docker-compose.yml` and `Dockerfile`, contains `UPLOAD_DIR`, both volume names, and the chown rationale. |
| T-43-30 | `grep -c healthcheck docs/admin/deployment/docker.md` = 0. |

## Known Stubs

None. Every section of the runbook carries a real command or a real measured fact.

## Threat Flags

None. This plan changed no code path, no endpoint, no schema and no auth surface — only documentation,
a `.gitignore` block and one test file.

## Notes for Plan 43-05

- The runbook's `[ASSUMED]` boundary is kept honest: managed-provider extension allow-lists are not
  asserted to work, and section 7 instead tells the operator to run the `pg_available_extensions`
  query *before* restoring. Do not upgrade that to a claim without measuring against a provider.
- The runbook documents `pipelite_uploads_data` as the volume name and tells operators to confirm with
  `docker volume ls`, since the prefix is the compose project name. 43-05's drill should confirm the
  actual name in the user's running stack.
- Section 6's post-restore verification order (`drizzle-kit migrate` first, then the ledger query,
  then extensions) is the order 43-05's drill should follow, and its row-count md5 is reproduced
  verbatim from the research so the drill's output can be compared directly.

## Self-Check: PASSED

Created files:
- FOUND: `docs/admin/backup-restore.md`
- FOUND: `src/lib/__tests__/deployment-docs-accuracy.test.ts`

Commits:
- FOUND: `d9bad01` test(43-04): add failing deployment-docs accuracy gate
- FOUND: `6e093f4` docs(43-04): add the backup and restore runbook
- FOUND: `f944328` docs(43-04): repoint the deployment guides at the runbook and remove the phantom db service
