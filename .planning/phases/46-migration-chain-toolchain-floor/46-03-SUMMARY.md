---
phase: 46-migration-chain-toolchain-floor
plan: 03
subsystem: infra
tags: [docker, node, semver, engines, ci, vitest, supply-chain, lockfile]

# Dependency graph
requires:
  - phase: 46-01-migration-chain-repair
    provides: the repaired migration chain the rebuilt image will replay at boot
  - phase: 46-02-host-connection-string
    provides: the .env / docker-compose.yml split this image is rebuilt against
provides:
  - "All three Dockerfile build stages pinned to node:24-alpine (Node 20 was EOL 2026-04-30)"
  - "package.json engines.node = \">=24.12.0\", derived from the lockfile rather than typed"
  - "GATE C at src/lib/__tests__/node-engines-floor.test.ts — walks all 832 declared engines.node ranges in package-lock.json and binds lockfile -> declaration -> image tag -> CI pin in one chain"
  - "NC-3 as a permanent in-file negative control proving the checker can produce a red"
  - "semver + @types/semver as declared devDependencies"
  - "ci.yml's binding-floor comment reconciled to name @napi-rs/lzma-linux-x64-gnu"
affects: [46-06 container verification, any future dependency bump, any future Node major bump]

# Tech tracking
tech-stack:
  added: [semver@^7.8.5, "@types/semver@^7.8.0"]
  patterns:
    - "Lockfile-derived floor gate: read the declared constraints, never compare against a literal"
    - "Permanent in-file negative control (NC-3) asserted alongside its complement"
    - "Structural/behavioural split: unconditional static gate here, docker exec probe in 46-06"

key-files:
  created:
    - src/lib/__tests__/node-engines-floor.test.ts
  modified:
    - Dockerfile
    - package.json
    - package-lock.json
    - .github/workflows/ci.yml

key-decisions:
  - "Target node:24-alpine — lowest Active LTS satisfying the computed floor, equal to what ci.yml already pinned"
  - "Declared floor is patch-level (>=24.12.0), not a bare major, because ^24.12 is not satisfied by 24.0.0"
  - "GATE C is structural and unconditional; it never shells out to docker. A conditionally-skipped assertion has no in-repo precedent and would make CI depend on Docker Hub rate limits"
  - "No union of the 106 distinct range expressions is computed — one semver.satisfies call per range answers the actual question"
  - "@types/semver approved as [OK] under a pre-approved package-legitimacy checkpoint"

patterns-established:
  - "Relational floor assertion: semver.minVersion(engines.node) must produce zero lockfile violations, so the declaration cannot drift from the tree"
  - "Anti-vacuity by distinct-expression count, not just total count — a reader returning one string N times clears a bare length floor"

requirements-completed: [DEPLOY-03]

# Metrics
duration: 12min
completed: 2026-08-25
---

# Phase 46 Plan 03: Toolchain Floor Summary

**All three Docker stages moved off the EOL `node:20-alpine` onto `node:24-alpine`, with a lockfile-derived `engines.node` floor and a GATE C that reads the 832 declared `engines.node` ranges out of `package-lock.json` rather than comparing against any literal.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-25T03:21:33Z
- **Completed:** 2026-08-25T03:33:00Z
- **Tasks:** 3 (1 checkpoint, 2 implementation)
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- Retired an **unpatched production runtime**. `node:20-alpine` was pinned at `Dockerfile:2`, `:10` and `:74`; Node 20 reached EOL on 2026-04-30, so every image built since then shipped an unbackported V8 and OpenSSL. All three pins now carry `node:24-alpine` (Active LTS, EOL 2028-04-30).
- Closed the container/CI pin divergence BACKLOG 999.14 named. The container ran 20 and `ci.yml` ran 24, with no relationship between them. Both are now measured against a single declaration.
- Built a gate that cannot go stale by construction. It reads every `engines.node` range the lockfile declares and asserts `semver.minVersion(package.json engines.node)` satisfies all of them. A dependency raising its floor turns this red on the bump commit.
- Observed the gate RED before trusting it, and demonstrated **NC-3's own failure mode** — the control is a control, not a tautology.

## Task Commits

1. **Task 1: Package legitimacy gate for `@types/semver`** — no commit (checkpoint; pre-approved by the orchestrator, verified and recorded below)
2. **Task 2: Install semver, write GATE C, observe it RED** — `8790eda` (test)
3. **Task 3: Declare the floor, move all three pins, reconcile ci.yml** — `25ff0fd` (fix)

## Files Created/Modified

- `src/lib/__tests__/node-engines-floor.test.ts` **(created, 378 lines)** — GATE C. Exports `declaredNodeRanges()`, `nodeFloorViolations()`, `nodeBaseTags()`, `ciNodeVersion()`. 20 assertions across four `describe` blocks: matcher self-tests, anti-vacuity floors, NC-3, and the binding chain.
- `Dockerfile` — three `FROM node:` tags moved to `24-alpine`; a 16-line comment above the first stage naming the binding constraint, the EOL date, and the gate that enforces it. `AS deps` / `AS builder` / `AS runner` labels and `npm install --legacy-peer-deps` untouched.
- `package.json` — `"engines": { "node": ">=24.12.0" }` between `private` and `scripts`; `semver` and `@types/semver` added to `devDependencies` (npm placed both alphabetically, matching the plan's specified positions).
- `package-lock.json` — the install.
- `.github/workflows/ci.yml` — the `:49-51` comment rewritten. `node-version: 24`, the `ci` job name, the `cache: npm` comment and both action SHA pins are unchanged.

## Package Legitimacy Verdict — `@types/semver`

Task 1's checkpoint was pre-approved by the orchestrator (rationale: `semver` ships no type declarations, `tsconfig.json` sets `"strict": true`, so a bare `import semver from "semver"` in a `.test.ts` fails `tsc --noEmit` with TS7016; `@types/semver` is DefinitelyTyped, the same `@types/*` org already supplying types for six existing devDependencies). The non-interactive verification steps were still performed and their observed values recorded:

| Check | Observed value |
|---|---|
| Scope | `@types` — DefinitelyTyped, not a look-alike scope |
| Version | `7.8.0` |
| Repository URL | `https://github.com/DefinitelyTyped/DefinitelyTyped.git`, `directory: types/semver` |
| Weekly downloads | **35,629,472** (2026-08-17 → 2026-08-23) |
| Created | `2016-05-17T18:54:10.714Z` — ~10 years old |
| Published versions | 59 |
| Maintainer | `types` (the DefinitelyTyped publishing account) |
| `scripts` | `{}` — **no postinstall script** |
| `types` entry | `index.d.ts` — it is the type package it claims to be |

**Disposition: `[OK]`.** `slopcheck install` was **NOT run** — RESEARCH records that it does not dry-run and would have mutated `package.json` / `package-lock.json` mid-checkpoint. The tree was therefore never mutated before approval; the only install performed was task 2's single `npm install --save-dev semver @types/semver`.

`semver` itself, re-confirmed against the registry in this session: version `7.8.5`, repository `git+https://github.com/npm/node-semver.git` (the npm org's own), created `2011-02-12`, **844,142,376** weekly downloads, no postinstall. Matches RESEARCH's `[OK]` audit exactly.

## Negative Controls

### NC-3 — GREEN direction (the standing in-file control)

The checker run against `20.20.2`, the version `node:20-alpine` resolved to. Kept permanently in the file at `src/lib/__tests__/node-engines-floor.test.ts`:

```
 ✓ reports exactly one violation for 20.20.2, naming the constraint that was binding 30ms
 ✓ reports none for 24.12.0, so the control distinguishes the two cases 8ms
 ✓ reports one for 24.0.0 — a major-only pin is not sufficient proof 8ms
```

Recomputed independently against the post-install lockfile:

```
ranges: 832 distinct: 106
20.20.2 -> 1 ["@napi-rs/lzma-linux-x64-gnu :: ^22.20 || ^24.12 || >=25"]
22.23.2 -> 0 []
24.0.0  -> 1 ["@napi-rs/lzma-linux-x64-gnu :: ^22.20 || ^24.12 || >=25"]
24.12.0 -> 0 []
24.19.0 -> 0 []
```

**Exactly 1 violation at `20.20.2`, naming `@napi-rs/lzma-linux-x64-gnu`** — the plan's required NC-3 observation.

### NC-3 — RED direction (proving the control is not a tautology)

The NC-3 argument was temporarily changed from `"20.20.2"` to `"24.19.0"` (a version the lockfile fully satisfies) and the assertion observed failing, verbatim:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/__tests__/node-engines-floor.test.ts > NC-3: the checker can produce a red > reports exactly one violation for 20.20.2, naming the constraint that was binding
AssertionError: expected [] to deeply equal [ '@napi-rs/lzma-linux-x64-gnu' ]

- Expected
+ Received

- [
-   "@napi-rs/lzma-linux-x64-gnu",
- ]
+ []

 ❯ src/lib/__tests__/node-engines-floor.test.ts:299:78
    297|    */
    298|   it("reports exactly one violation for 20.20.2, naming the constraint…
    299|     expect(nodeFloorViolations("24.19.0").map((violation) => violation…
       |                                                                      ^
    300|       "@napi-rs/lzma-linux-x64-gnu",
    301|     ])

 Test Files  1 failed (1)
      Tests  1 failed | 19 skipped (20)
```

Restored to `"20.20.2"` and re-observed green:

```
 ✓ src/lib/__tests__/node-engines-floor.test.ts (20 tests | 19 skipped) 31ms
 Test Files  1 passed (1)
      Tests  1 passed | 19 skipped (20)
```

### GATE C — observed RED before the fix (task 2, verbatim)

Run against the unfixed tree (`node:20-alpine` pins, no `engines` field), exit code **1**:

```
 ✓ MUST extract the tag from: FROM node:24-alpine AS runner 4ms
 ✓ MUST extract the tag from: FROM node:20-alpine AS deps 1ms
 ✓ MUST extract the tag from:   FROM node:24.12.0-bookworm-slim AS builder 0ms
 ✓ MUST NOT match: FROM postgres:16-alpine 1ms
 ✓ MUST NOT match: # FROM node:20-alpine AS deps 0ms
 ✓ MUST NOT match: COPY --from=node:24-alpine /x /y 0ms
 ✓ MUST NOT match: COPY --from=deps /app/node_modules ./node_modules 0ms
 ✓ reads a major off a pin rather than off a literal 1ms
 ✓ walks at least 800 declared engines.node ranges out of the lockfile 16ms
 ✓ walked distinct range expressions, not one range repeated by a broken reader 9ms
 ✓ finds all 3 `FROM node:` stages in the Dockerfile 2ms
 ✓ finds the same tag in all three stages — changing one of three is not a fix 1ms
 ✓ reads a node-version out of the required CI check 0ms
 ✓ reports exactly one violation for 20.20.2, naming the constraint that was binding 30ms
 ✓ reports none for 24.12.0, so the control distinguishes the two cases 8ms
 ✓ reports one for 24.0.0 — a major-only pin is not sufficient proof 8ms
 × package.json declares an engines.node floor at all 6ms
 × the declared floor's own minimum satisfies every range the lockfile declares 1ms
 × every Dockerfile stage pins the major the declared floor requires 1ms
 × the required CI check installs the same major the image runs 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  … > package.json declares an engines.node floor at all
AssertionError: package.json must declare `engines.node`; it is the single source of truth the image tag and the CI pin are both measured against.: expected undefined to be defined
 ❯ src/lib/__tests__/node-engines-floor.test.ts:329:7

 FAIL  … > the declared floor's own minimum satisfies every range the lockfile declares
Error: package.json declares no `engines.node`. It is the anchor every other assertion in this file hangs off: the image tag and the CI pin are both checked against it, not against each other. Add it between `private` and `scripts`, derived from the lockfile — the lowest version for which nodeFloorViolations() returns [].
 ❯ requireEnginesNode src/lib/__tests__/node-engines-floor.test.ts:189:11
 ❯ src/lib/__tests__/node-engines-floor.test.ts:337:22

 FAIL  … > every Dockerfile stage pins the major the declared floor requires
Error: package.json declares no `engines.node`. …
 ❯ src/lib/__tests__/node-engines-floor.test.ts:351:22

 FAIL  … > the required CI check installs the same major the image runs
Error: package.json declares no `engines.node`. …
 ❯ src/lib/__tests__/node-engines-floor.test.ts:368:22

 Test Files  1 failed (1)
      Tests  4 failed | 16 passed (20)

EXIT=1
```

Exactly the four `it`s the plan predicted are red; every matcher self-test, every anti-vacuity floor and all three NC-3 assertions pass in that same red run.

### GATE C — observed GREEN after the fix, unedited

```
 ✓ src/lib/mutations/__tests__/db-test-isolation.test.ts (16 tests) 35ms
 ✓ src/lib/__tests__/compose-uploads-persistence.test.ts (16 tests) 13ms
 ✓ src/lib/__tests__/node-engines-floor.test.ts (20 tests) 83ms

 Test Files  3 passed (3)
      Tests  52 passed (52)

EXIT=0
```

`git diff --stat HEAD -- src/lib/__tests__/node-engines-floor.test.ts` after the task-3 commit is **empty** — the gate was not edited to reach green, and neither the runner-stage parser in `compose-uploads-persistence.test.ts` nor the `ci.yml` string scans in `db-test-isolation.test.ts` became collateral damage.

## Acceptance Verification

All computed with `node -e`, never `grep | wc -l` (which 46-01 measured returning wrong counts under this environment's shell hook):

| Check | Expected | Observed |
|---|---|---|
| `FROM node:24-alpine` in Dockerfile | 3 | **3** |
| `FROM node:20-alpine` in Dockerfile | 0 | **0** |
| non-comment `AS runner` / `AS builder` / `AS deps` | 1 each | **1 / 1 / 1** |
| `npm install --legacy-peer-deps` in Dockerfile | 1 (untouched) | **1** |
| `package.json` `engines.node` | `>=24.12.0` | **`>=24.12.0`** |
| `semver.minVersion(engines.node)` | `24.12.0` | **`24.12.0`** |
| lockfile `engines.node` declarations | ≥ 800 | **832** (106 distinct) |
| non-comment `node-version: 24` in ci.yml | 1 | **1** |
| `vite 7` in ci.yml | 0 | **0** |
| `name: ci` in ci.yml | 1 | **1** |
| ci.yml contains `services:` / `postgres` / `test:db` / `db.config` | 0 each | **0 / 0 / 0 / 0** |
| `"semver"` / `"@types/semver"` in package.json | 1 each, in devDependencies | **1 / 1, both devDependencies** |
| `npm test` | green | **4682 passed, 32 skipped, 170 files; rsc project 8 passed** |
| `npm run typecheck` | exit 0 | **exit 0** |
| `npm run lint` | 0 errors | **124 problems (0 errors, 124 warnings)** — the unchanged main-tree baseline; none in the new file |
| task-3 commit contents | exactly 3 files | **`.github/workflows/ci.yml`, `Dockerfile`, `package.json`** |

## Decisions Made

- **`node:24-alpine`, not `node:22-alpine`.** `22.23.2` produces zero violations today, but v22 is in Maintenance while v24 is Active LTS. CONTEXT locks "the lowest Active LTS satisfying the computed floor", and 24 additionally equals what `ci.yml:52` already pinned, which is what closes the divergence.
- **Patch-level declared floor, not a bare major.** `^24.12` is not satisfied by `24.0.0` — measured, one violation. `>=24.12.0` is the lowest declaration whose `minVersion` produces zero violations, so it is derived rather than chosen.
- **No range union.** Unioning 106 arbitrary semver ranges is a genuinely hard problem and is not the question being asked. The question is whether one concrete version satisfies all of them: one `semver.satisfies` call per range.
- **`semver` declared, not imported as a hoisted transitive.** `node_modules/semver` was already 7.8.5 by hoisting, so the gate would have compiled without the install. That is precisely the failure mode this phase exists to prevent — one `npm dedupe` away from resolving differently or vanishing, and a gate that vanishes is a gate that passes.
- **GATE C is structural and unconditional.** It never runs `docker run --rm node:$TAG node -v`. A conditionally-skipped assertion has no in-repo precedent and is one careless edit from a permanent pass, and a registry pull inside the required CI check would make it depend on Docker Hub rate limits. The running container's actual version is proved behaviourally by plan 46-06. That split is documented in the file header so the next reader does not add a skippable probe.
- **Anti-vacuity by distinct-expression count as well as total count.** A reader returning the same string 832 times would clear a bare length floor while proving nothing, so a second floor asserts ≥ 50 distinct range expressions (106 measured).
- **`ciNodeVersion()` parses the workflow with `yaml`, not a regex** (house rule S3), and throws unless exactly one `actions/setup-node@` step exists in job `ci` — so a restructured workflow fails loudly instead of comparing `undefined` to `undefined`.

## Deviations from Plan

**None — plan executed exactly as written.** Two measured refinements, neither a departure from the plan's intent:

1. **The lockfile range count is 832, not the 834 the plan measured.** The `npm install --save-dev semver @types/semver` in task 2 deduplicated two nested copies. The plan's `MIN_DECLARED_RANGES = 800` floor was written loose exactly for this, so nothing needed adjusting; the gate's doc-comment records **832 measured, 834 pre-install** so the next reader is not confused by the plan's number.
2. **Import order is `vitest` then `semver` then `yaml`,** per the plan's explicit instruction, which is not alphabetical. No lint rule enforces import ordering in this repo (verified against `eslint.config.mjs`), so this is cosmetic and follows the plan literally.

`npm` placed both new devDependencies at exactly the alphabetical positions the plan specified (`@types/semver` between `@types/react-dom` and `eslint`; `semver` between `eslint-config-next` and `shadcn`), so no manual reordering was needed.

**Total deviations:** 0
**Impact on plan:** None.

## Deferred Backlog Observations

- **`@types/node: "^20"` in `devDependencies` still pins the Node 20 type surface**, so `tsc` continues to type-check against Node 20's API shape even though the image and CI both now run 24. This is a **types package, not a runtime** — it does not affect what the container executes, does not appear in `package-lock.json`'s `engines.node` walk, and is therefore outside DEPLOY-03's boundary. Bumping it to `^24` would surface newly-added Node 24 APIs and could change error reporting on existing files, which is a separate, testable change. **Deferred to the backlog.**
- **`Dockerfile:24` still runs `npm install --legacy-peer-deps` rather than `npm ci`**, so the in-image tree is not lockfile-exact and GATE C therefore asserts the DECLARED floor rather than the image's resolved tree. Explicitly deferred by CONTEXT; recorded in the plan's threat register as `T-46-03-04` with disposition `accept`, and covered behaviourally by plan 46-06.

## Issues Encountered

- **`grep -c` and `grep | wc -l` are unreliable in this environment** (46-01 measured a tree with 36 matches reporting 19). Every count in the Acceptance Verification table above was recomputed with `node -e` string splits instead. Likewise `npx <tool>` is rewritten into a nonexistent npm script, so vitest was invoked as `./node_modules/.bin/vitest`.
- **`curl | node` piping is mangled by the same hook** — the registry queries for `@types/semver`'s download counts and creation date were run with `fetch()` inside `node -e` instead.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change was introduced. The two threats this plan mitigates (`T-46-03-01` EOL runtime, `T-46-03-02` stale gate) are both closed; `T-46-03-03` (typosquat on install) was handled by the legitimacy verdict above; `T-46-03-04` remains `accept` as planned.

## User Setup Required

None — no external service configuration required. The image must be rebuilt for the new base to take effect: `docker compose up -d --build` (a bare `docker compose restart` runs the OLD image). That rebuild and the `docker compose exec app node -v` proof belong to plan 46-06.

## Next Phase Readiness

- DEPLOY-03 is complete on the static/declarative side. The remaining half is behavioural and is plan 46-06's: `docker compose up -d --build` followed by `docker compose exec app node -v` showing v24.x, and `/api/health` returning 200.
- The image has **not** been rebuilt in this plan. Nothing on this branch has yet executed on Node 24 inside a container; the local host happens to run v24.13.1, which is why `npm test` / `tsc` / `eslint` are green here, but that is not evidence about the image.
- Plans 46-04 and 46-05 are unblocked — this plan touched no migration, no `.env`, and no docs.

---
*Phase: 46-migration-chain-toolchain-floor*
*Completed: 2026-08-25*

## Self-Check: PASSED

All created/modified files verified present on disk; both task commits (`8790eda`, `25ff0fd`) verified present in `git log --oneline --all`. GATE C is 378 lines (plan floor: 140) and contains `nodeFloorViolations`.
