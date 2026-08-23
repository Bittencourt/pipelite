---
phase: 42-observability
plan: 03
subsystem: infra
tags: [docker, docker-compose, dockerfile, sentry, env-vars, observability, standalone-output]

# Dependency graph
requires: []
provides:
  - "LOG_LEVEL and SENTRY_DSN pass-through on the app service, so a value in .env actually reaches the container"
  - "@sentry/nextjs 10.70.0 DECLARED in package.json (declared-only — NOT installed, see Deviations)"
  - "Dockerfile build-time assertion that instrumentation.js reached the standalone output"
  - ".env.example documentation of both optional observability variables"
affects: [42-04, 42-17, 42-18]

# Tech tracking
tech-stack:
  added: ["@sentry/nextjs 10.70.0 (declared in package.json, not installed in this worktree)"]
  patterns:
    - "Postcondition assertion over exit-status checking for build-time file copies"
    - "Explicit env enumeration in docker-compose.yml (no env_file:), with an inline comment saying why omission is silent"

key-files:
  created:
    - .planning/phases/42-observability/deferred-items.md
  modified:
    - docker-compose.yml
    - .env.example
    - package.json
    - Dockerfile

key-decisions:
  - "Pinned @sentry/nextjs to exact 10.70.0 rather than ^10.70.0 — with no lockfile committed, the pin is the only thing binding the eventual install to the version RESEARCH actually audited"
  - "Did NOT run npm install in any form; package-lock.json is NOT regenerated. node_modules is a shared symlink and two executors ran against it in parallel"
  - "Used a brace group rather than research's subshell for the Dockerfile assertion, because commands follow it and a subshell would have reintroduced the precedence bug being fixed"
  - "Wrote the A8 comment as 'health check' (two words) so grep -c healthcheck stays at exactly 1"
  - "Left five stale Dockerfile:24 source comments alone — outside this plan's file ownership; deferred"

patterns-established:
  - "Postcondition assertion: test the desired end state, not the command's exit status — stays correct if upstream later does the work for you"
  - "Declared-only dependency: a manifest entry without an install, for parallel-worktree waves where node_modules is shared"

requirements-completed: [OBS-01, OBS-02, OBS-03]

# Metrics
duration: 24min
completed: 2026-08-23
---

# Phase 42 Plan 03: Observability Configuration and Dependency Summary

**`LOG_LEVEL`/`SENTRY_DSN` now cross into the container, `@sentry/nextjs` 10.70.0 is declared (not installed), and the Dockerfile's silent `|| true` instrumentation copy is now a loud postcondition assertion.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-08-23T15:28:00Z (approx)
- **Completed:** 2026-08-23T15:52:36Z
- **Tasks:** 3
- **Files modified:** 4 (+1 created)

## Accomplishments

- **Amendment A5 satisfied.** `docker-compose.yml` enumerates its env vars explicitly and has no `env_file:`, so an unlisted variable never arrives. `LOG_LEVEL` and `SENTRY_DSN` are now listed and `docker compose config` renders both under `services.app.environment`. Without this both of the phase's features would have silently no-op'd while every test passed.
- **Amendment A8 held.** No health check added to `app`. `grep -c healthcheck docker-compose.yml` is still exactly 1 (postgres's `pg_isready`, byte-identical). The reason is recorded inline so a future reader does not add one.
- **The 2026-08-08 failure mechanism is now loud at build time.** The instrumentation copy asserts that the file is present rather than ignoring whether the copy worked.
- **`@sentry/nextjs` 10.70.0 declared** with its legitimacy re-verified against the registry, and `next.config.ts` untouched.

## Task Commits

1. **Task 1: Declare LOG_LEVEL and SENTRY_DSN on the app service and document both** — `207737d` (feat)
2. **Task 2: Declare @sentry/nextjs (install deliberately withheld)** — `778444a` (chore)
3. **Task 3: Make the standalone instrumentation.js copy assert its postcondition** — `514f9a9` (fix)

## Files Created/Modified

- `docker-compose.yml` — `- LOG_LEVEL=${LOG_LEVEL}` and `- SENTRY_DSN=${SENTRY_DSN}` appended to the `app` service's `environment:` list (now 13 entries), with a comment explaining that the absence of `env_file:` makes omission silent; plus a comment recording the A8 no-health-check decision. Additions only: 12 insertions, 0 deletions.
- `.env.example` — new `# Observability (both optional)` section: `LOG_LEVEL="info"` (accepted values, and that an unrecognised value falls back to `info` rather than failing at boot) and `SENTRY_DSN=""` (empty means the SDK is never even loaded, matching the `INTERNAL_SECRET=""` style). Additions only: 10 insertions, 0 deletions.
- `package.json` — `"@sentry/nextjs": "10.70.0"` added to `dependencies`, alphabetically between `@hookform/resolvers` and `@tanstack/react-table`. One line.
- `Dockerfile` — instrumentation copy block replaced (16 insertions, 2 deletions). The `node -e` nft.json walk is byte-identical, as is every other stage.
- `.planning/phases/42-observability/deferred-items.md` — created; records the stale `Dockerfile:24` comment references.

## The Sentry dependency: DECLARED-ONLY, NOT INSTALLED

**This is the single most important thing for the next wave to know.**

- `@sentry/nextjs` is in `package.json` `dependencies` at exact **`10.70.0`**.
- **It is NOT installed.** `node_modules` in this worktree is a symlink to the main checkout's tree, and two other executors were running verification against that same tree. `npm install` would have rewritten it underneath them mid-run.
- **`package-lock.json` was NOT regenerated.** Not by `npm install`, not by `npm install --package-lock-only`. The manifest and lockfile are therefore out of sync.

**Consequences, in order of who trips over them first:**

| Consumer | Command | Effect today |
|---|---|---|
| CI | `npm ci` (`.github/workflows/ci.yml:60`) | **FAILS** — `npm ci` errors on any manifest/lockfile mismatch |
| Docker build | `npm install --legacy-peer-deps` (`Dockerfile:7`) | Works — `npm install` resolves the new dep and updates the lockfile in-image |
| Plan 42-04 | `await import("@sentry/nextjs")` typecheck | **FAILS until installed** — no types are present |

**Required follow-up, on the main checkout, after this wave merges:**

```
npm install --legacy-peer-deps
```

`--legacy-peer-deps` is mandatory, not optional: it is what `Dockerfile:7` uses, and this repo carries a pre-existing `nodemailer` peer conflict between `@auth/core@0.41.0` (via `next-auth@5.0.0-beta.30`) and `@auth/core@0.41.1` (via `@auth/drizzle-adapter`). Installing without it surfaces that unrelated conflict as a failure. Then commit `package-lock.json`.

**Expected cost when that install runs** (from the plan, not observed here since nothing was installed): roughly 104 packages added and about 97 MB of `node_modules` growth (`@sentry/*` ~75 MB, `@opentelemetry/*` ~22 MB). This lands in the image because `Dockerfile:64` copies `node_modules` wholesale rather than the standalone-traced subset — which is also a de-risk, since Sentry's runtime files cannot be dropped by standalone file tracing.

### Package legitimacy verification (T-42-SC)

- **`slopcheck scan .` verdict: `[OK] @sentry/nextjs`.** Full scan: 57 packages, 56 OK, 1 SUS. The single SUS is pre-existing and unrelated — `vitest` flagged as "suspiciously close to 'vite'", a false positive on a long-standing devDependency. Out of scope, not acted on.
- `slopcheck install` was **not** run, per the plan's own operational warning that it mutates `package.json`.
- Read-only registry cross-check (`npm view`, no install): version `10.70.0` exists; `repository.url` is `git://github.com/getsentry/sentry-javascript.git`; **no `install`, `preinstall` or `postinstall` script**. Matches RESEARCH's audit exactly.

### Deliberate omissions, per amendment A6

- **`@sentry/node` NOT added** as a direct dependency. Verified in RESEARCH but not selected. The footprint argument is a wash (`@sentry/nextjs` depends on `@sentry/node`, so both pull `@opentelemetry/*`); what `@sentry/nextjs` buys is `captureRequestError`, the upstream-maintained Next→Sentry adapter that the `@sentry/node` path would require hand-writing and owning across Next minors.
- **`withSentryConfig` NOT added; `next.config.ts` not touched** (`git diff --exit-code next.config.ts` succeeds). It exists for source-map upload, `tunnelRoute` and client-bundle wiring — all out of scope, and source maps would need an org, project and auth token, contradicting the opt-in self-hosted default. **Known fallback** if plan 18's real `docker compose build` surfaces a Sentry warning: wrap as `withSentryConfig(withNextIntl(nextConfig), { silent: true })` with no org/project/token.

## The Dockerfile change

Before (`Dockerfile:24`):
```dockerfile
RUN cp .next/server/instrumentation.js .next/standalone/.next/server/instrumentation.js 2>/dev/null || true && \
```
`A || true && B` parses as `(A || true) && B`, so the whole `RUN` succeeded unconditionally. A failed copy was indistinguishable from a successful one. That is the mechanism that killed all four processors in production on 2026-08-08 while every test passed.

After (`Dockerfile:35-38`):
```dockerfile
RUN test -f .next/standalone/.next/server/instrumentation.js \
      || cp .next/server/instrumentation.js .next/standalone/.next/server/instrumentation.js; \
    test -f .next/standalone/.next/server/instrumentation.js \
      || { echo "FATAL: instrumentation.js missing from standalone output" >&2; exit 1; }; \
```

It asserts the **postcondition** (the file is there), not the copy's exit status. That form also stays correct if a future Next version fixes standalone tracing and emits the file itself — case 3 below.

**Deviation from RESEARCH's suggested snippet, and why it matters:** RESEARCH wrote the failure branch as a subshell, `|| (echo ...; exit 1)`. `exit 1` inside a subshell exits only the subshell; because the `.map` copy and the nft walk follow the assertion, and a `RUN`'s status is that of its *last* command, a subshell would have let a successful `.map` copy mask the FATAL — reintroducing the exact precedence bug being fixed. Changed to a brace group `{ echo ...; exit 1; }`, which runs in the current shell and terminates the `RUN` immediately. This is why the behavioural test below was worth running rather than trusting the grep.

**Verified** (`sh -n` clean, plus the block executed against synthetic trees in `/tmp`; no Docker build was run):

| Case | State | Result |
|---|---|---|
| 1 | source missing, destination missing | **exit 1**, prints `FATAL: instrumentation.js missing from standalone output` |
| 2 | source present, destination missing | exit 0, file copied |
| 3 | destination already present, source gone | exit 0 (postcondition already satisfied) |

**Real verification is plan 42-18's `docker compose build`** — a build change cannot be proven by a unit test, and no build or container restart was run here by instruction. **Named rollback** if that build fails for this reason: restore the original single line
`RUN cp .next/server/instrumentation.js .next/standalone/.next/server/instrumentation.js 2>/dev/null || true && \`
in place of the four asserted lines, leaving the `.map` copy and nft walk as they are.

`|| true` was kept on the `.map` copy — source maps are genuinely optional and a missing one must not fail a build.

## Decisions Made

1. **Exact pin `10.70.0`, not `^10.70.0`.** The repo's dominant style is caret, but `next`, `react`, `react-dom` and `eslint-config-next` are pinned exact, so this is not foreign. The reason is specific: T-42-SC's mitigation is "the lockfile pins exactly what was reviewed", and no lockfile is committed here. With a caret and no lockfile, the eventual install could resolve 10.71+ — a version nobody audited. The exact pin carries the audit's meaning until the lockfile catches up. Whoever regenerates the lockfile may relax it to a caret at that point.
2. **No `npm install` in any form**, including `--package-lock-only`. See the dedicated section above.
3. **Brace group over subshell** in the Dockerfile assertion. See above.
4. **"health check" spelled as two words** in the A8 comment. The natural phrasing would have put the literal string `healthcheck` on two comment lines, taking `grep -c healthcheck docker-compose.yml` from 1 to 3 and breaking both the plan's acceptance criterion and the phase constraint. Wording chosen to keep the invariant checkable by grep.

## Deviations from Plan

### 1. [Constraint override] Task 2's `npm install` was not run

- **Found during:** Task 2
- **Plan said:** `npm install --legacy-peer-deps @sentry/nextjs`, and commit `package-lock.json` alongside `package.json`.
- **What was done:** `package.json` edited by hand; no install; lockfile untouched.
- **Why:** Explicit instruction from the orchestrator, which supersedes the plan here. `node_modules` is a shared symlink to the main checkout and two sibling executors were verifying against it concurrently; an install would have rewritten that tree mid-run and corrupted their results. The orchestrator will install once on the main checkout after the wave merges.
- **Not hand-authored instead:** a lockfile entry for a package with ~104 transitive dependencies cannot be hand-written correctly (resolved URLs plus integrity hashes for the whole subtree). A partially-correct lockfile is worse than an honestly-absent one — `npm ci` would still fail, but less legibly.
- **Consequence, stated rather than hidden:** the plan's acceptance criteria "`package-lock.json` is modified and committed in the same commit" is **NOT met**, and CI's `npm ci` fails until the follow-up install runs.
- **Committed in:** `778444a`, with the reason in the commit body.

### 2. [Scope boundary] Five stale `Dockerfile:24` comment references left unfixed

- **Found during:** Task 3
- **Issue:** Moving the copy block invalidated five prose comments. Two make a now-false claim: `src/lib/trash/prune.ts:14` and `src/lib/trash/prune.test.ts:132` both say `Dockerfile:24` "ends in a suppressed failure". The other three (`src/lib/dedup/scan-cleanup.ts:25`, `src/lib/dedup/scan-cleanup.test.ts:9`, `instrumentation.ts:36`) carry only a stale line number.
- **Why not fixed:** all five are outside this plan's file ownership. `instrumentation.ts` belongs to plan 42-17 (explicitly off-limits), and amendment A7 already has other plans in this phase editing the `scan-cleanup`/`prune` pair. Editing them from a parallel worktree would collide.
- **Verified harmless:** all five are comments, not assertions. `npx vitest run src/lib/trash/prune.test.ts src/lib/dedup/scan-cleanup.test.ts` → 27 passed / 0 failed after the change.
- **Logged to:** `.planning/phases/42-observability/deferred-items.md`, naming 42-17 / the A7 repair plan / 42-18 as the right owners.

### 3. [Minor] `42-PATTERNS.md` does not exist

The plan's `<context>` block `@`-references `.planning/phases/42-observability/42-PATTERNS.md`; no such file is in the phase directory. Non-blocking — `42-CONTEXT.md` and `42-RESEARCH.md` carried everything needed. Noted in case other plans in this phase reference it too.

---

**Total deviations:** 3 — 1 instructed constraint override, 1 scope-boundary deferral, 1 missing referenced file.
**Impact on plan:** No scope creep. Deviation 1 leaves a real, named gap (the lockfile) that a single command on the main checkout closes; it is called out in three places here so it cannot be missed. Deviations 2 and 3 are informational.

## Verification

| Check | Result |
|---|---|
| `grep -c '^\s*- LOG_LEVEL=\${LOG_LEVEL}' docker-compose.yml` | 1 |
| `grep -c '^\s*- SENTRY_DSN=\${SENTRY_DSN}' docker-compose.yml` | 1 |
| `docker compose config \| grep -cE 'LOG_LEVEL\|SENTRY_DSN'` | 2 — both render under `services.app.environment` |
| `grep -c 'healthcheck' docker-compose.yml` | **1** (postgres's, unchanged) |
| `.env.example` non-comment `LOG_LEVEL` / `SENTRY_DSN` | 1 each — real assignments, not comment-only |
| `git diff --numstat` on compose + env.example | `10 0` and `12 0` — additions only, nothing modified or removed |
| `@sentry/nextjs` in `package.json` dependencies | `10.70.0` |
| `@sentry/node` as a direct dependency | absent |
| `git diff --exit-code next.config.ts` | passes (unchanged) |
| `grep -c 'FATAL: instrumentation.js missing' Dockerfile` | 1 |
| `\|\| true` on the `.js` copy / the `.map` copy | 0 / 1 |
| Dockerfile `RUN` block shell syntax (`sh -n`) | clean |
| Dockerfile assertion behaviour | 3/3 cases correct (see table above) |
| `npx tsc --noEmit` | **0 errors** |
| `npx eslint` | **0 errors**, 122 pre-existing warnings in 66 files (all `no-unused-vars`, untouched) |
| `npx vitest run` | **4406 passed / 0 failed** |
| `npx vitest run --config vitest.rsc.config.ts` | **8 passed / 0 failed** |

Baseline fully preserved. Declaring an uninstalled dependency did not break typecheck, because nothing imports `@sentry/nextjs` yet — plan 42-04 is the first importer, and it will need the install.

**Not run, by instruction:** `docker compose build`, any container restart, any migration. Plan 42-18 owns the phase's container verification.

## Issues Encountered

- **Worktree started from a stale base** — `df3395c` (phase 41 close) instead of the expected `4ff7b1a`. Caught by the startup check and corrected with `git reset --hard 4ff7b1a`. This makes 15 of 15 across the last two phases; the worktree-creation step, not the executor, is where this should be fixed.
- **`docker compose config` prints resolved `.env` values,** so an unfiltered run echoes real secrets (`INTERNAL_SECRET`, `SMTP_PASSWORD`) into the transcript. It happened once here while inspecting the rendered `app` service. Nothing was written to disk or committed and the values are not reproduced anywhere in this summary. Future verification of this file should pipe through a narrow `grep` for the keys of interest, or use `docker compose config > /dev/null` purely for exit status.
- **`slopcheck scan` takes a directory, not a package name.** `slopcheck scan @sentry/nextjs` reports "No dependency files found" and exits without scanning — easy to misread as a pass. The dependency must be in `package.json` first, then `slopcheck scan .`.

## User Setup Required

`SENTRY_DSN` is optional and unset by default; leaving it unset is a supported configuration and means the SDK is never loaded. To verify OBS-02's *positive* half (an unhandled server error appearing in a real tracker) in plan 42-18, an operator needs:

1. A Sentry project: sentry.io → Projects → Create Project → Next.js
2. The DSN from Project Settings → Client Keys (DSN), set as `SENTRY_DSN` in `.env`

The *negative* half — nothing leaves the process with the variable unset — needs no account and is fully automated.

## Next Phase Readiness

**Ready:**
- `LOG_LEVEL` and `SENTRY_DSN` reach the container, so plans 42-04 and 42-17 can rely on `process.env` for both.
- The Dockerfile guard is in place for plan 42-18's build verification.
- No health check exists on `app`, as A8 requires.

**Blockers / concerns for whoever runs next:**
1. **`npm install --legacy-peer-deps` must run on the main checkout after this wave merges**, and `package-lock.json` must be committed. Until then CI's `npm ci` fails and plan 42-04's `await import("@sentry/nextjs")` will not typecheck. This is the one hard dependency this plan leaves open.
2. Five stale `Dockerfile:24` comments need a sweep — see `deferred-items.md`.
3. The Dockerfile change is unproven against a real build until plan 42-18 runs `docker compose build`; rollback is named above.

## Known Stubs

None. This plan created no source files — no placeholder values, no unwired components. The one
incomplete artifact is the uninstalled dependency, documented at length above rather than as a stub.

## Self-Check: PASSED

- All 4 modified files and 2 created files present on disk.
- All 3 task commits present in `git log`: `207737d`, `778444a`, `514f9a9`.
- No commit in this plan deleted any tracked file (`git diff --diff-filter=D HEAD~1 HEAD` empty for each).

---
*Phase: 42-observability*
*Completed: 2026-08-23*
