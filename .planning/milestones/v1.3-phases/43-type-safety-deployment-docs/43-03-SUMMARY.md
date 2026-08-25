---
phase: 43-type-safety-deployment-docs
plan: 03
subsystem: deployment
tags: [docker, uploads, persistence, volumes, permissions, polish-02]
requires:
  - "docker-compose.yml app service (environment list, no env_file:)"
  - "Dockerfile runner stage (addgroup/adduser, USER nextjs)"
  - "src/app/api/upload/route.ts UPLOAD_DIR read"
  - "yaml@2.8.2 (already a direct dependency — nothing installed)"
provides:
  - "uploads_data named volume mounted at /app/uploads on the app service"
  - "UPLOAD_DIR=/app/uploads reaching the container (compose has no env_file:)"
  - "an image-layer mkdir+chown that makes a fresh named volume writable by uid 1001"
  - ".env.example that can actually start the Docker stack (POSTGRES_* added)"
  - "a three-file cross-check gate that no single-file change can satisfy"
affects:
  - "plan 43-05 — the rebuild and the file-survives-a-rebuild experiment run against this"
  - "docs/admin/backup-restore.md — now has a real volume to document backing up"
tech-stack:
  added: []
  patterns:
    - "Parse YAML with `yaml`, never regex it — indentation decides ownership of a key"
    - "Relational assertions across files (string equality, line-index ordering) rather than per-file existence checks"
    - "Anti-vacuity floors on every raw-text scan and every subset assertion"
key-files:
  created:
    - "src/lib/__tests__/compose-uploads-persistence.test.ts"
  modified:
    - "docker-compose.yml"
    - "Dockerfile"
    - ".env.example"
decisions:
  - "Hardcode /app/uploads in compose rather than ${UPLOAD_DIR:-…}, so a .env entry can never move the write path out from under the mount"
  - "chown to the nextjs USER, not the nodejs group — adduser has no -G nodejs, so the primary group is nogroup"
  - "Keep the runner-stage chmod-777 scan comment-INCLUSIVE and reword colliding prose instead, per the standing house rule"
  - "Named volume over bind mount; bind mount documented as a one-line alternative with its chown 1001:1001 caveat"
metrics:
  duration: "~25 min"
  completed: "2026-08-24"
  tasks: 2
  commits: 3
  files_changed: 4
  insertions: 413
  deletions: 0
---

# Phase 43 Plan 03: Make Uploads Actually Persist Summary

Uploaded files now survive `docker compose up --build`, via three changes that only work
together — a `uploads_data` named volume, `UPLOAD_DIR=/app/uploads` reaching the container, and an
image-layer `mkdir`+`chown` that makes a fresh volume writable by uid 1001 — all in one commit,
guarded by a 15-assertion cross-check that goes red on each partial application.

## What shipped

| # | File | Change |
|---|------|--------|
| 1 | `docker-compose.yml` | `- UPLOAD_DIR=/app/uploads` on `app`; `volumes: [- uploads_data:/app/uploads]` on `app`; `uploads_data:` in the top-level `volumes:` map |
| 2 | `Dockerfile` | `RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads` in the **runner** stage, after `adduser` and before `USER nextjs` |
| 3 | `.env.example` | `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` (compose interpolates all three and the file declared none), plus a documented `UPLOAD_DIR` |
| 4 | `src/lib/__tests__/compose-uploads-persistence.test.ts` | The 15-assertion three-file cross-check (345 lines) |

All three of #1-#3 are in **one commit** (`da32185`), as required: two of the three partial states
do not error, so a partial commit is a partial fix that reviews clean.

## Commits

| Commit | Type | Files | Description |
|--------|------|-------|-------------|
| `2f25a5a` | test (RED) | 1 | The failing three-file cross-check, 6 pass / 9 fail |
| `77b5821` | test | 1 | Comment-only: why the runner-stage `0777` scan stays comment-inclusive |
| `da32185` | feat (GREEN) | 3 | The atomic uploads-persistence fix |

`git show --stat da32185` (the GREEN commit) — exactly three files:

```
.env.example       | 20 ++++++++++++++++++++
 Dockerfile         | 26 ++++++++++++++++++++++++++
 docker-compose.yml | 22 ++++++++++++++++++++++
 3 files changed, 68 insertions(+)
```

## The RED run, verbatim

`npx vitest run src/lib/__tests__/compose-uploads-persistence.test.ts` on the unmodified tree:

```
PASS (6) FAIL (9)
```
```
numTotalTests: 15, numPassedTests: 6, numFailedTests: 9, success: false
```

**The 9 that failed (the real defect):**

| Assertion | Message |
|---|---|
| sets UPLOAD_DIR exactly once | `AssertionError: expected [] to have a length of 1 but got +0` |
| hardcodes an absolute path outside /tmp | `expected exactly one \`UPLOAD_DIR=\` entry in services.app.environment, found 0. Without it the app falls back to /tmp/uploads (src/app/api/upload/route.ts:12) and any uploads volume stays empty forever.` |
| mounts a volume whose target STRING-EQUALS the UPLOAD_DIR value | same `requireUploadDir()` message |
| mounts a NAMED volume that is declared at the top level | same |
| creates the upload directory in the runner stage | same |
| chowns it, and does so BEFORE `USER nextjs` | same |
| chowns to the nextjs USER, not to root | same |
| declares every `${VAR}` docker-compose.yml interpolates | `docker-compose.yml requires variables absent from .env.example: POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER. … expected [ 'POSTGRES_DB', …(2) ] to deeply equal []` |
| documents UPLOAD_DIR | `expected [ Array(13) ] to include 'UPLOAD_DIR'` |

**The 6 that were ALREADY GREEN in the RED run — this is the proof the gate found its inputs.**
A gate that is red on every line is indistinguishable from a gate whose file paths are wrong:

1. `parsed into a mapping with all three services` — `["app","mailhog","postgres"]`
2. `left the postgres volume untouched` — `postgres_data:/var/lib/postgresql/data` present
3. `read the app service, not an empty list` — `DATABASE_URL=${DATABASE_URL}` and `SENTRY_DSN=${SENTRY_DSN}` found
4. **`still has NO healthcheck on the app service (42-CONTEXT.md A8)`** — green before, green after
5. **`both file routes read process.env.UPLOAD_DIR`** — the cross-tier link, green before and after
6. `references enough ${VAR}s … (anti-vacuity)` — the floor was already satisfied

Six of the nine failures share one message because they route through `requireUploadDir()`, which
throws when `UPLOAD_DIR` is absent. That cascade is by design (every relational assertion is anchored
on the real value rather than a hardcoded `/app/uploads`), and the falsifiability probes below prove
each of those assertions fails **independently** once `UPLOAD_DIR` exists.

## Measured numbers

| Quantity | Value |
|---|---|
| compose `${VAR}` set size | **15** (`AUTH_SECRET, DATABASE_URL, EMAIL_FROM, INTERNAL_SECRET, LOG_LEVEL, NEXTAUTH_URL, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, SENTRY_DSN, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_SECURE, SMTP_USER`) — comfortably above the anti-vacuity floor of 12 |
| `.env.example` keys before | 13 |
| `.env.example` keys after | 17 (+3 `POSTGRES_*`, +`UPLOAD_DIR`) |
| Gate: RED → GREEN | 6/15 → **15/15 passed, 0 failed** |
| `docker compose config --quiet` exit | **0** |
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` | **0 errors**, 122 warnings (all pre-existing; the new file contributes 0 problems) |
| `npm test` | **4539 passed / 32 skipped** (163 files) — baseline 4524 + the 15 new assertions |
| `npm test` RSC project | **8 passed / 8** |
| `grep -c healthcheck docker-compose.yml` | **1** (postgres only) |
| Diff from base `3f2b03e` | 4 files, **413 insertions, 0 deletions** |
| `package.json` / `package-lock.json` | **untouched** (`git diff --name-only 3f2b03e HEAD -- package.json package-lock.json` → empty) |

## Dockerfile ordering proof

```
83  RUN adduser --system --uid 1001 nextjs
109 RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads
126 USER nextjs
```

`adduser` (83) **<** new `RUN` (109) **<** `USER nextjs` (126). The chown runs in a layer still built
as root; after `USER nextjs` it could not run at all. Runner stage only — the builder image is
discarded and its ownership never reaches the volume.

## Which assertion catches each of the three partial-application states

Each was verified by actually mutating the tree, running the gate, and restoring with
`git checkout -- <single file>`. Not reasoned — executed.

| Partial state applied | Real-world failure | Gate result | Assertion that catches it |
|---|---|---|---|
| **Volume + chown, NO `UPLOAD_DIR`** | App keeps writing `/tmp/uploads`; volume stays empty **forever, silently** | **7 fail / 8 pass** | `sets UPLOAD_DIR exactly once` — `expected [] to have a length of 1` |
| **`UPLOAD_DIR` + chown, NO volume** | Writes succeed, vanish on rebuild (today's defect) | **2 fail / 13 pass** | `mounts a volume whose target STRING-EQUALS the UPLOAD_DIR value`, and `mounts a NAMED volume that is declared at the top level` |
| **`UPLOAD_DIR` + volume, NO image chown** | Fresh volume is `root:root 0755`, container is uid 1001 → **every upload 500** | **3 fail / 12 pass** | `creates the upload directory in the runner stage`, `chowns it, and does so BEFORE USER nextjs`, `chowns to the nextjs USER, not to root` |

Four further probes, because the interesting failure modes are not only the three above:

| Probe | Gate result | Assertion that catches it |
|---|---|---|
| `UPLOAD_DIR=/srv/files` while the mount stays `/app/uploads` (path drift) | **5 fail / 10 pass** | `mounts a volume whose target STRING-EQUALS…` — `expected exactly one services.app volume mounted at /srv/files; saw: uploads_data:/app/uploads` |
| Top-level `uploads_data:` declaration removed (`compose up` would error) | **1 fail / 14 pass** | `mounts a NAMED volume that is declared at the top level` |
| A healthcheck added to `app` (the A8 violation) | **1 fail / 14 pass** | `still has NO healthcheck on the app service (42-CONTEXT.md A8)` |
| `POSTGRES_DB` removed from `.env.example` | **1 fail / 14 pass** | `declares every ${VAR}…` — names the missing key: `variables absent from .env.example: POSTGRES_DB` |

The third partial-state probe also proves the chown assertion is **not** satisfiable by the three
pre-existing `COPY --chown=nextjs:nodejs …` lines (Dockerfile 112, 113, 122): with only the new `RUN`
removed, all three chown assertions went red even though those `COPY` lines were untouched. Requiring
`uploadDir` on the same line is what does that.

**Every assertion in this gate has been observed failing on a mutation that a human could plausibly
make.** None of the 15 is decorative.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] My own Dockerfile comment collided with my own gate**

- **Found during:** Task 2, first GREEN run (14 pass / 1 fail)
- **Issue:** The runner-stage scan `expect(stage).not.toContain("chmod 777")` reads raw text with
  comments intact. The Dockerfile comment I wrote to explain *why not to widen the mode* contained the
  literal string `chmod 777`, so the gate went red on its own documentation. This is precisely the
  failure mode named in `src/components/bulk/__tests__/select-wiring.test.ts` note (a) — 14 gate runs
  lost to raw-text/comment collisions across phases 37 and 38, "once with the plan's own suggested
  wording."
- **Fix:** Applied the standing house rule — **rewrote the prose, did not weaken the gate.** The
  Dockerfile comment now spells the mode `0777` instead of the command form. The assertion is
  byte-identical to what was committed in RED.
- **Why the scan stays comment-inclusive:** there is no Dockerfile comment-stripper in this repo, and
  for a four-character mode string the conservative posture is correct — a commented-out
  world-writable `chmod` is one uncomment away from being live. Recorded in both files so the next
  person who trips it rewords rather than relaxes.
- **Files modified:** `Dockerfile`, `src/lib/__tests__/compose-uploads-persistence.test.ts`
- **Commit:** `77b5821` (the test-file note) and `da32185` (the Dockerfile wording)

### Process deviation (disclosed, not auto-fixed)

The comment amendment to the test file was committed **separately** (`77b5821`) rather than folded
into the GREEN commit, because the plan's acceptance criteria require `git show --stat HEAD` on the
GREEN commit to list **exactly** `docker-compose.yml`, `Dockerfile`, `.env.example`. Amending the RED
commit was the alternative and was rejected: it would have made the committed gate differ from the
artifact that produced the recorded RED output. The RED commit is therefore untouched and the RED
output above is faithful to `2f25a5a`. Comment-only; no assertion changed.

## Docker commands run — none built, started or restarted anything

Exhaustively, these are the only `docker` invocations in this plan:

```
docker compose -f <worktree>/docker-compose.yml config --quiet
```

Run twice (once to see the warnings, once to capture the exit code). `config` parses and validates;
it creates no project, no container, no volume and no network.

- **`COMPOSE_CONFIG_EXIT=0`.**
- Unset-variable warnings **were present and are expected**, exactly two:
  `The "LOG_LEVEL" variable is not set. Defaulting to a blank string.` and the same for
  `"SENTRY_DSN"`. Both are optional-by-design and empty in the bootstrapped `.env`; only a non-zero
  exit would have been a failure. The other 13 `${VAR}`s resolved because the worktree bootstrap
  symlinks the real `.env`.

**No `docker compose build`, `up`, `down`, `restart`, `start` or `stop` was run**, and no `docker run`.
The rebuild and the file-survives-a-rebuild experiment belong to **plan 43-05**, from the main
checkout with a pinned project name. A build from this worktree would have created a second compose
project (the name defaults to the directory), collided on host ports 3001/5433 with the user's running
stack, and written to a differently-named volume — proving nothing about `pipelite_uploads_data`.
This is why the gate is a static assertion.

## Notes for plan 43-05

- The volume Docker will create is **`pipelite_uploads_data`** (project prefix + declared name), and
  it must be created **by a rebuild**, not by hand — the whole point is that the image layer's
  ownership is copied onto a *fresh* volume.
- After rebuilding, `docker compose exec -T app sh -c 'echo "[$UPLOAD_DIR]"; ls -ld /app/uploads'`
  should print `[/app/uploads]` and `nextjs nodejs`. Measured pre-fix, the env var printed empty.
- The experiment must **create** its own upload: there are 169 `custom_field_definitions` rows and
  **zero** of type `file`, so no existing data exercises this path. Use the literal `phase43probe` for
  `entityId` — it flows unsanitized into `path.resolve` (pre-existing traversal debt, T-43-21,
  accepted and already logged in STATE.md); do not exercise a traversal string.
- Uploads written before this merges live at `/tmp/uploads` inside the old container and are **not**
  migrated. Nothing is lost (no `file`-type fields exist), but do not expect pre-existing files to
  appear in the new volume.

## Threat model dispositions

| Threat ID | Disposition | How it landed |
|---|---|---|
| T-43-14 (partially applied three-file fix) | mitigated | One commit; mount target asserted to string-equal `UPLOAD_DIR`; all three partial states individually observed red |
| T-43-15 (uploads DoS via volume permissions) | mitigated | `mkdir`+`chown` present and asserted to **precede** `USER nextjs` by line index (109 < 126) |
| T-43-16 (wrong fix for a permission error) | mitigated | Chown asserted to target `nextjs:` and not `root:`; runner stage asserted free of `chmod 777`. Collided with prose once; prose was reworded, assertion untouched |
| T-43-17 (`app` healthcheck added in passing) | mitigated | Asserted absent; probe confirms it fires. `grep -c healthcheck` = 1 |
| T-43-18 (`${UPLOAD_DIR:-…}` interpolation) | mitigated | Value asserted to contain no `${`, to be absolute, and not to be under `/tmp` |
| T-43-19 (operator's first backup) | transferred | `.env.example` gains the three `POSTGRES_*` keys with placeholder values (`change-me`) and points at `docs/admin/backup-restore.md`. **No real credential appears anywhere in this plan.** |
| T-43-20 (npm supply chain) | mitigated | **Nothing installed.** `yaml@2.8.2` was already a direct dependency. `package.json`/`package-lock.json` verified unmodified against the base commit |
| T-43-21 (path traversal via `entityId`) | accepted | Pre-existing and out of scope. Neither route file was modified — the gate only **reads** them. Not widened |

## Known Stubs

None. `.env.example` carries the placeholder `POSTGRES_PASSWORD="change-me"`, which is an example
file's correct content, not a stub.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change at a trust boundary.
The change moves an existing write path from `/tmp` onto a named volume and narrows its permissions
from `1777` (`/tmp`) to `0755` owned by `nextjs`.

## Self-Check: PASSED

Files:
- `FOUND: src/lib/__tests__/compose-uploads-persistence.test.ts`
- `FOUND: docker-compose.yml` (contains `uploads_data`, `UPLOAD_DIR=/app/uploads`)
- `FOUND: Dockerfile` (contains `chown nextjs:nodejs /app/uploads`)
- `FOUND: .env.example` (contains `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `UPLOAD_DIR`)

Commits:
- `FOUND: 2f25a5a` — `test(43-03): add failing three-file uploads-persistence cross-check`
- `FOUND: 77b5821` — `test(43-03): record why the runner-stage 0777 scan is comment-inclusive`
- `FOUND: da32185` — `feat(43-03): persist uploads — named volume, UPLOAD_DIR and an image-layer chown`

Working tree clean after all falsifiability probes were restored; gate re-verified 15/15 green at the
final state.
