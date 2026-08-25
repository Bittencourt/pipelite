---
phase: 47-suite-trust-supply-chain
plan: 01
subsystem: testing
tags: [vitest, vite, npm-audit, supply-chain, lockfile, npm-overrides, semver]

# Dependency graph
requires:
  - phase: 46-migration-chain-toolchain-floor
    provides: "the 4739/32 suite baseline, the lint-gate-on-errors rule, and the anti-vacuity gate patterns this plan's floors reuse"
provides:
  - "vitest pinned at a >= 4.1.0 floor (resolved 4.1.11) — the runner every later plan in phase 47 authors gates against"
  - "overrides.vite ^7.0.0 — the constraint that keeps vite on the 7.x line and keeps rolldown/lightningcss/@oxc-project/types out of the tree"
  - "GHSA-5xrq-8626-4rwp (critical, CVSS 9.8) cleared; the five vite GHSAs cleared as a side effect"
  - "the phase's execution-time SEC-05 baseline: 3 critical / 21 high / 9 moderate / 3 low, 24 critical+high packages"
  - "the GHSA id lists for the two packages that left the critical/high set, so 47-09's allowlist never re-derives them"
affects: [47-02, 47-03, 47-04, 47-05, 47-06, 47-07, 47-08, 47-09, 47-10, 47-11, 47-12, 47-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "npm `overrides` as the instrument for holding a transitive on a major line, in preference to adding it as a direct dependency"
    - "controlled-variable lockfile experiment: run the same install twice from the same lockfile base, one variable changed, diff the package key sets"
    - "advisory measurement by parsing `npm audit --json` with `node -e`, never by branching on its exit code and never by `grep | wc -l`"

key-files:
  created:
    - .planning/phases/47-suite-trust-supply-chain/deferred-items.md
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Added `overrides: { vite: ^7.0.0 }` because vitest 4.1.x widened its vite dependency to `^6 || ^7 || ^8`; without it the targeted install resolves vite 8.2.2 and adds 32 packages, which is the transitive-major refresh CONTEXT places out of scope"
  - "Followed the plan's literal `git checkout -- package.json package-lock.json && npm ci` revert on detecting vite 8, then re-installed with the override — so the recorded evidence is a controlled two-run experiment rather than a patched-up single run"
  - "Did NOT add `vite` as a direct devDependency: an override constrains an existing transitive without changing the declared dependency set"
  - "`npm audit fix` was not used at any point"

patterns-established:
  - "Negative-control-before-trust: the task-2 anti-vacuity gate was falsified three separate ways against doctored audit documents before its green was accepted"
  - "Runtime-reachability proof for a dependency change: partition the lockfile version-diff by the `dev`/`devOptional` flags and show every runtime consumer's resolved version is unchanged"

requirements-completed: [SEC-05, QG-01]

# Metrics
duration: 22min
completed: 2026-08-25
---

# Phase 47 Plan 01: Test Runner Advisory Floor Summary

**vitest 4.0.18 → 4.1.11 clears GHSA-5xrq-8626-4rwp (critical, CVSS 9.8 arbitrary file read), with `overrides.vite: ^7.0.0` holding vite on 7.3.6 so the bump adds ZERO lockfile keys instead of the 32 an unconstrained install pulls in — suite, typecheck and lint identical at 4739/32, 8/8, exit 0, 0 errors.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-25T07:38:00Z
- **Completed:** 2026-08-25T07:55:00Z (SUMMARY written 07:57Z)
- **Tasks:** 2
- **Files modified:** 2 (+1 planning file created)

## Accomplishments

- The test runner every later plan in this phase authors gates against is now **vitest 4.1.11**, and it will not move again inside the phase.
- **GHSA-5xrq-8626-4rwp** (critical, CVSS 9.8, *"When Vitest UI server is listening, arbitrary file can be read and executed"*, vulnerable range `>=4.0.0 <4.1.0`) is gone from `npm audit`.
- **Five vite GHSAs cleared as a side effect** — the `^7.0.0` constraint landed vite on 7.3.6, above the highest vulnerable ceiling (7.3.4) of all five.
- The bump added **zero** lockfile keys. The plan's forbidden `npm audit fix` set (`rolldown`, `@rolldown/pluginutils`, `tsx`, `esbuild`, `@esbuild/linux-x64`, `lightningcss`, `@oxc-project/types`) contributed **0 additions**.
- **Exactly one runtime-reachable package changed version**, and every runtime consumer of it was already resolving to the new version (proof below). The server's dependency tree is byte-identical in effect.
- The phase now has a recorded, execution-time SEC-05 baseline with two-way set differences, and the GHSA ids for both departing packages, so 47-09 does not have to re-derive them.

## Task Commits

1. **Task 1: Capture the pre-bump baseline, then bump vitest to a >= 4.1.0 floor** — `896ee6d` (fix)
2. **Task 2: Record the advisory delta and the tree-shape guard** — no source mutation; its deliverable *is* this SUMMARY, committed with the plan metadata commit below

**Plan metadata:** see final commit (docs: complete plan)

## Files Created/Modified

- `package.json` — `devDependencies.vitest` `^4.0.18` → `^4.1.11`; new top-level `overrides: { "vite": "^7.0.0" }`
- `package-lock.json` — vitest subtree re-resolved: 0 keys added, 3 removed, 39 version changes
- `.planning/phases/47-suite-trust-supply-chain/deferred-items.md` — 3 out-of-scope handoff items (D-47-01-A/B/C)

---

## Resolved versions, read out of the lockfile (not the manifest range)

```
manifest devDependencies.vitest = ^4.1.11
semver.minVersion               = 4.1.11   | floor >= 4.1.0 ? true
lockfile node_modules/vitest    = 4.1.11   | semver.satisfies(">=4.1.0") ? true

--- every vite entry in package-lock.json ---
   node_modules/vite => 7.3.6 (major 7)
vite entries with major >= 8 : 0
```

Confirmed through the CI install path as well — `npm ci` exit 0, then:

```
package.json vitest = ^4.1.11 | overrides = {"vite":"^7.0.0"}
lock vitest = 4.1.11
lock node_modules/vite => 7.3.6
./node_modules/.bin/vitest --version -> vitest/4.1.11 linux-x64 node-v24.13.1
node_modules/vite/package.json version -> 7.3.6
```

---

## The three gates — exact numbers, before and after

| Gate | BEFORE (vitest 4.0.18 / vite 7.3.1) | AFTER (vitest 4.1.11 / vite 7.3.6) | Verdict |
|---|---|---|---|
| base project test files | `169 passed \| 2 skipped (171)` | `169 passed \| 2 skipped (171)` | **identical** |
| base project tests | `4739 passed \| 32 skipped (4771)` | `4739 passed \| 32 skipped (4771)` | **identical** |
| base project duration | 49.87 s | 52.65 s | within the measured 51–65 s band |
| rsc project | `2 files / 8 passed (8)`, 468 ms | `2 files / 8 passed (8)`, 641 ms | **identical** |
| `tsc --noEmit` | exit 0, **0 bytes** of output | exit 0, **0 bytes** of output | **identical** |
| `eslint` | exit 0 — `124 problems (0 errors, 124 warnings)` | exit 0 — `124 problems (0 errors, 124 warnings)` | **identical** |

**No movement from 4739 / 32.** Nothing to explain — the pre-bump run on this tree reported exactly the
figure 47-RESEARCH §3 measured, and the post-bump run reproduced it test-for-test and file-for-file.
Lint is gated on **errors (0)**; the 124-warning total is recorded as context only, per the standing
rule that it differs between a worktree and master.

The plan's verbatim verify command was then run as a single chain:

```
npm test && npm run typecheck && npm run lint
COMBINED VERIFY exit=0
  Test Files  169 passed | 2 skipped (171)
  Tests  4739 passed | 32 skipped (4771)
  Test Files  2 passed (2)
  Tests  8 passed (8)
  ✖ 124 problems (0 errors, 124 warnings)
```

---

## SEC-05 — execution-time advisory baseline

### (a) Severity histogram and dependency counts

```
BEFORE metadata.vulnerabilities: {"info":0,"low":3,"moderate":9,"high":22,"critical":4,"total":38}
AFTER  metadata.vulnerabilities: {"info":0,"low":3,"moderate":9,"high":21,"critical":3,"total":36}

BEFORE metadata.dependencies  : {"prod":529,"dev":582,"optional":214,"peer":37,"peerOptional":0,"total":1289}
AFTER  metadata.dependencies  : {"prod":528,"dev":581,"optional":214,"peer":36,"peerOptional":0,"total":1286}
```

`npm audit` exits **1** in both runs — that is expected whenever any advisory exists and was never
branched on. Both documents were parsed with `node -e`.

**The plan-time measurement was `4 critical / 22 high / 9 moderate / 3 low, 38 total, 26 critical+high
packages`. The execution-time BEFORE measurement is identical on every field** — advisory data did not
move between planning (2026-08-25) and execution (2026-08-25). The recorded decision and the count
agree; nothing to carry forward as changed.

The `-3` on `total` dependencies is exactly the three deduplicated `es-module-lexer` copies (see the
lockfile diff). `prod` dropped by 1 for the same reason — a *deduplication*, not a removal of
functionality.

### (b) Critical + high package sets, and the two-way difference

```
BEFORE (26): @auth/core @auth/drizzle-adapter @hono/node-server axios brace-expansion drizzle-orm
             express-rate-limit fast-uri fast-xml-parser flatted form-data hono ip-address js-yaml
             lodash lodash-es minimatch nanoid next next-auth nodemailer path-to-regexp postcss
             sharp vite vitest

AFTER  (24): @auth/core @auth/drizzle-adapter @hono/node-server axios brace-expansion drizzle-orm
             express-rate-limit fast-uri fast-xml-parser flatted form-data hono ip-address js-yaml
             lodash lodash-es minimatch nanoid next next-auth nodemailer path-to-regexp postcss
             sharp

LEFT the crit+high set   (2): vite vitest
JOINED the crit+high set (0): (none)

severity moves among packages present in both: (none)

moderate+low sets, BEFORE and AFTER: IDENTICAL — both are
  @aws-sdk/xml-builder(m) @babel/core(l) @esbuild-kit/core-utils(m) @esbuild-kit/esm-loader(m)
  body-parser(l) drizzle-kit(m) esbuild(m) follow-redirects(m) icu-minify(l) next-intl(m) qs(m) yaml(m)
```

`vitest` is **absent** from the AFTER critical+high set. `vite` is **also absent** — it is not "still
present on 7.x"; the `^7.0.0` constraint resolved it to 7.3.6, which is above every one of its five
advisories' vulnerable ceilings, so it left the audit document entirely.

### (c) GHSA ids carried by the two departing packages — for 47-09's allowlist

**vitest** — critical — vulnerable range `>=4.0.0 <4.1.0` — `fixAvailable: true`

| GHSA | Severity | Title | Vulnerable |
|---|---|---|---|
| `GHSA-5xrq-8626-4rwp` | critical (CVSS 9.8) | When Vitest UI server is listening, arbitrary file can be read and executed | `>=4.0.0 <4.1.0` |

**vite** — high — vulnerable range `7.0.0 - 7.3.3` — `fixAvailable: true`

| GHSA | Severity | Title | Vulnerable |
|---|---|---|---|
| `GHSA-v2wj-q39q-566r` | high | Vite: `server.fs.deny` bypassed with queries | `>=7.1.0 <=7.3.1` |
| `GHSA-p9ff-h696-f583` | high | Vite Vulnerable to Arbitrary File Read via Vite Dev Server WebSocket | `>=7.0.0 <=7.3.1` |
| `GHSA-fx2h-pf6j-xcff` | high | vite: `server.fs.deny` bypass on Windows alternate paths | `>=7.0.0 <=7.3.4` |
| `GHSA-4w7w-66w2-5vf9` | moderate | Vite Vulnerable to Path Traversal in Optimized Deps `.map` Handling | `>=7.0.0 <=7.3.1` |
| `GHSA-v6wh-96g9-6wx3` | moderate | launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows | `>=7.0.0 <=7.3.4` |

The highest vulnerable ceiling across all five is **7.3.4**; the resolved version is **7.3.6**. All
five are cleared, which is why the `high` count fell by 1 (vite's own high rollup) with no residual
moderate entry.

### (d) `slopcheck scan package.json` — verbatim

Read-only subcommand only. `slopcheck install` was **not** used (it is measured to rewrite the
manifest). ANSI colour codes stripped and consecutive blank lines collapsed; no other alteration. Full
raw log at `/tmp/p47-01/slopcheck-scan.log`.

```
slopcheck scanning package.json...
  found 59 dependencies
  [OK] @xyflow/react (npm)
  [OK] @aws-sdk/client-s3 (npm)
  [OK] @auth/drizzle-adapter (npm)
  [OK] @sentry/nextjs (npm)
  [OK] @tanstack/react-table (npm)
  [OK] @dnd-kit/utilities (npm)
  [OK] @dnd-kit/sortable (npm)
  [OK] @dagrejs/dagre (npm)
  [OK] @hookform/resolvers (npm)
  [OK] @dnd-kit/core (npm)
  [OK] argon2 (npm)
  [OK] cron-parser (npm)
  [OK] ioredis (npm)
  [OK] clsx (npm)
  [OK] drizzle-kit (npm)
  [OK] cmdk (npm)
  [OK] lucide-react (npm)
  [OK] class-variance-authority (npm)
  [OK] date-fns (npm)
    > No source repository linked. Harder to verify what this code actually does.
  [OK] postgres (npm)
  [OK] next-themes (npm)
  [OK] papaparse (npm)
  [OK] nodemailer (npm)
  [OK] pipedrive (npm)
  [OK] next-intl (npm)
  [OK] quickjs-emscripten (npm)
  [OK] next-auth (npm)
  [OK] next (npm)
  [OK] radix-ui (npm)
  [OK] react (npm)
  [OK] react-big-calendar (npm)
  [OK] tailwind-merge (npm)
  [OK] yaml (npm)
  [OK] react-hook-form (npm)
  [OK] recharts (npm)
  [OK] react-hotkeys-hook (npm)
  [OK] sonner (npm)
  [OK] use-debounce (npm)
  [OK] react-dom (npm)
  [OK] zod (npm)
  [OK] @types/nodemailer (npm)
  [OK] @types/papaparse (npm)
  [OK] @types/node (npm)
  [OK] @types/react-big-calendar (npm)
  [OK] drizzle-orm (npm)
  [OK] @tailwindcss/postcss (npm)
  [OK] zustand (npm)
  [OK] @types/react (npm)
  [OK] @types/react-dom (npm)
  [OK] semver (npm)
  [OK] @playwright/test (npm)
  [OK] eslint (npm)
  [OK] tailwindcss (npm)
  [OK] @types/semver (npm)
  [OK] shadcn (npm)
  [OK] tw-animate-css (npm)
  [SUS] vitest (npm)
    > Suspiciously close to 'vite'. Could be a typosquat.
    ? Did you mean: vite
  [OK] eslint-config-next (npm)
  [OK] typescript (npm)
==================================================
  scanned 59 packages
  1 SUS -- worth a second look
  58 OK
```

**`[SUS] vitest` — dismissed as a false positive, with evidence.** slopcheck's verdict is a pure
edit-distance heuristic ("suspiciously close to `vite`"). Measured against this repo:

- **3 vitest config files:** `vitest.config.ts`, `vitest.db.config.ts`, `vitest.rsc.config.ts`
- **3 npm scripts invoke it:** `test`, `test:watch`, `test:db`
- **175 source files import from it** (`from "vitest"` / `from "vitest/…"`, counted with `node -e`, not `grep | wc -l`)
- **`vite` is not a declared dependency of this project at all** — it exists only as vitest's transitive. There is no `vite` to be a typosquat *of*.

`vitest` is this repo's test framework, present since before v1.0. This is the same verdict and the
same dismissal 47-RESEARCH's Package Legitimacy Audit records.

**Scan did not mutate the tree** (the measured `slopcheck install` hazard):

```
git status --porcelain  -> (empty)
git rev-parse HEAD      -> identical to pre-scan capture
md5sum -c               -> package.json: OK
                           package-lock.json: OK
```

### Which packages this plan deliberately did NOT touch, and why

Every other row of 47-RESEARCH §5's 26-row table is another plan's disposition. 47-01 touched
**nothing** outside the vitest/vite subtree:

| Owner | Packages | Why not here |
|---|---|---|
| **47-07** (in-range bumps) | `drizzle-orm`, `@auth/drizzle-adapter`, `next-auth`, `@auth/core`, `axios`, `form-data`, `lodash`, `lodash-es`, `fast-xml-parser`, `nanoid`, `postcss` (top-level), `brace-expansion`, `minimatch`, `js-yaml`, `flatted`, `fast-uri`, `hono`, `@hono/node-server`, `express-rate-limit`, `ip-address`, `path-to-regexp` | All in-range. Batching them into the runner bump would make a red suite unattributable — which is the whole reason 47-01 is alone in wave 1. |
| **47-08** (`next`) | `next`, `sharp`, nested `postcss` | 47-CONTEXT: *"`next@16.1.6 → 16.3.2` is its own task with its own gate … do not let a framework bump ride along inside an advisory-triage task."* Needs a container rebuild. |
| **47-09** (accept-with-reason + allowlist) | `nodemailer` | Only fix is a 7→9 breaking major, for an advisory whose entire input surface (`envelope`, transport `name`, `list`, `raw`, `jsonTransport`, OAuth2) this project never supplies. CONTEXT forbids trading a documented risk for an undocumented one in a debt-paydown milestone. |
| **out of this phase's `failOn` floor** | the 9 moderate and 3 low | `failOn` is `["critical","high"]`. Recorded as context above; `esbuild`'s surviving moderate is logged as D-47-01-B. |

---

## Lockfile shape guard — proof the install was targeted

Computed as a set difference between `/tmp/p47-01/package-lock.json` (the pre-bump copy) and the
committed lockfile, with `node -e`.

```
ADDED keys (0):
REMOVED keys (3):
  - node_modules/@apm-js-collab/code-transformer-bundler-plugins/node_modules/es-module-lexer @ 2.3.2
  - node_modules/import-in-the-middle/node_modules/es-module-lexer @ 2.3.2
  - node_modules/webpack/node_modules/es-module-lexer @ 2.3.2

FORBIDDEN-SET additions: 0  []
   (checked for: rolldown, @rolldown/pluginutils, tsx, esbuild, @esbuild/linux-x64,
    lightningcss, @oxc-project/types — at top level and at any nesting depth)
```

**39 version changes**, every one inside the vitest/vite subtree:

```
  ~ node_modules/vitest                     4.0.18 -> 4.1.11
  ~ node_modules/@vitest/expect             4.0.18 -> 4.1.11
  ~ node_modules/@vitest/mocker             4.0.18 -> 4.1.11
  ~ node_modules/@vitest/pretty-format      4.0.18 -> 4.1.11
  ~ node_modules/@vitest/runner             4.0.18 -> 4.1.11
  ~ node_modules/@vitest/snapshot           4.0.18 -> 4.1.11
  ~ node_modules/@vitest/spy                4.0.18 -> 4.1.11
  ~ node_modules/@vitest/utils              4.0.18 -> 4.1.11
  ~ node_modules/es-module-lexer             1.7.0 -> 2.3.2
  ~ node_modules/std-env                    3.10.0 -> 4.2.0
  ~ node_modules/tinyrainbow                 3.0.3 -> 3.1.1
  ~ node_modules/vite                        7.3.1 -> 7.3.6
  ~ node_modules/vite/node_modules/esbuild  0.27.3 -> 0.28.2
  ~ node_modules/vite/node_modules/@esbuild/{28 platform packages}  0.27.3 -> 0.28.2
```

`esbuild` appears here as a **version change of pre-existing keys**, nested under vite. The acceptance
criterion is about *added* keys, and there are none — `esbuild` was already in the tree at 0.27.3
under `node_modules/vite/node_modules/`, and vite 7.3.6 moved it to 0.28.2 in place.

### Every runtime-reachable package's resolved version is unchanged

Partitioning the 39 version changes by the lockfile's `dev` / `devOptional` flags:

```
version-changed entries total: 39
of those, NOT marked dev/devOptional (i.e. runtime-reachable): 1
   node_modules/es-module-lexer 1.7.0 -> 2.3.2
```

And the three removed entries are exactly the nested `es-module-lexer@2.3.2` copies its runtime
consumers were **already** using:

```
  - node_modules/@apm-js-collab/code-transformer-bundler-plugins/node_modules/es-module-lexer  2.3.2
  - node_modules/import-in-the-middle/node_modules/es-module-lexer                             2.3.2
  - node_modules/webpack/node_modules/es-module-lexer                                          2.3.2
```

`npm ls es-module-lexer` after the change:

```
├─┬ @sentry/nextjs@10.70.0
│ ├─┬ @sentry/node@10.70.0 -> import-in-the-middle@3.3.3 -> es-module-lexer@2.3.2 deduped
│ ├─┬ @sentry/server-utils@10.70.0 -> @apm-js-collab/…@0.7.4 -> es-module-lexer@2.3.2 deduped
│ └─┬ @sentry/webpack-plugin@5.4.0 -> webpack@5.109.2 -> es-module-lexer@2.3.2 deduped
└─┬ vitest@4.1.11 -> es-module-lexer@2.3.2
```

So every runtime consumer resolved 2.3.2 before and resolves 2.3.2 after. The hoisted 1.7.0 copy
existed **solely** for `vitest@4.0.18` (`es-module-lexer: "^1.7.0"`) and is gone because vitest 4.1
declares `^2.0.0`. **Net effect on the runtime tree: zero.** No image rebuild is warranted for this
plan — it is a dev-dependency change with no runtime version movement.

Container was nonetheless confirmed healthy on the running image (the compose stack was left up, per
the phase rule):

```
pipelite-app-1 running Up 4 hours
pipelite-mailhog-1 running Up 2 weeks
pipelite-postgres-1 running Up 2 weeks (healthy)
GET http://localhost:3001/api/health -> http_status=200
status=ok db.ok=true processors 10/10 alive
```

---

## Negative controls observed red

The v1.4 standing rule: a gate whose failure has never been observed is a stated intention. Both of
this plan's assertion sets were falsified on purpose.

### NC-1 — the lockfile-shape guard, falsified by the plan's own install command

This is the controlled experiment, not a simulation. **Same starting lockfile, same install command,
one variable changed.**

| | Install #1 — **no** `overrides` | Install #2 — **with** `overrides.vite: ^7.0.0` |
|---|---|---|
| command | `npm install --save-dev vitest@^4.1.11` | `npm install --save-dev vitest@^4.1.11` |
| exit | 0 | 0 |
| npm's own tally | `added 8 packages, removed 7, changed 13` | `removed 3 packages, changed 14` |
| lockfile keys ADDED | **32** | **0** |
| resolved vite | `node_modules/vitest/node_modules/vite@8.2.2` | `node_modules/vite@7.3.6` |
| forbidden-set additions | **4** — `rolldown`, `@rolldown/pluginutils`, `@oxc-project/types`, nested `lightningcss` | **0** |
| verdict | **guard RED** — `vite entries with major >= 8 : 1` → `FORBIDDEN vite 8 present`, exit 2 | **guard GREEN** |

Install #1's 32 added keys, verbatim:

```
  + node_modules/@oxc-project/types @ 0.146.0
  + node_modules/@rolldown/pluginutils @ 1.0.1
  + node_modules/rolldown @ 1.2.5
  + node_modules/@rolldown/binding-{android-arm-eabi,android-arm64,darwin-arm64,darwin-x64,
      freebsd-x64,linux-arm-gnueabihf,linux-arm64-gnu,linux-arm64-musl,linux-ppc64-gnu,
      linux-s390x-gnu,linux-x64-gnu,linux-x64-musl,openharmony-arm64,win32-arm64-msvc,
      win32-x64-msvc} @ 1.2.5                                      [16 platform bindings]
  + node_modules/vitest/node_modules/vite @ 8.2.2
  + node_modules/vitest/node_modules/@vitest/mocker @ 4.1.11
  + node_modules/vitest/node_modules/lightningcss @ 1.33.0
  + node_modules/vitest/node_modules/lightningcss-{android-arm64,darwin-arm64,darwin-x64,
      freebsd-x64,linux-arm-gnueabihf,linux-arm64-gnu,linux-arm64-musl,linux-x64-gnu,
      linux-x64-musl,win32-arm64-msvc,win32-x64-msvc} @ 1.33.0     [11 platform packages]
```

Install #1 was then reverted with the plan's literal instruction —
`git checkout -- package.json package-lock.json && npm ci` — which exited 0 and restored
`vitest@4.0.18` / `vite@7.3.1` / `rolldown present? false`, with `git status --porcelain` empty. The
T-47-01-01 revert path is therefore **observed working**, not assumed.

### NC-2 — the task-2 anti-vacuity gate, falsified three ways

The gate has three assertions. Each was fired independently against a doctored copy of
`audit-after.json`:

| Control | Doctoring | Gate output | exit |
|---|---|---|---|
| NC-2a | `vulnerabilities: {}` (the empty-audit vacuous case) | `Error: zero critical/high parsed — the audit document is empty, which is the vacuous case` | **1** |
| NC-2b | re-inject `vitest` as critical | `Error: vitest is still reported critical/high` | **1** |
| NC-2c | `delete metadata.vulnerabilities.total` | `Error: audit JSON shape changed` | **1** |
| real document | none | `crit+high packages: 24` | **0** |

The floor is real: a zero-length critical/high list **fails** this task rather than passing it, which is
the single most likely way an audit gate ships vacuous.

---

## Decisions Made

- **`overrides: { "vite": "^7.0.0" }` rather than a `vite` devDependency.** An override constrains an
  existing transitive; adding `vite` to `devDependencies` would change the declared dependency set,
  which the plan forbids. Both `vitest@4.1.11` and `@vitest/mocker@4.1.11` declare
  `vite: "^6.0.0 || ^7.0.0 || ^8.0.0"` in *both* `dependencies` and `peerDependencies`, so `^7` is a
  legal narrowing, not a forced downgrade.
- **`^7.0.0`, not `^7.3.6`.** The constraint expresses the decision actually taken — *stay on the 7
  line* — and lets npm pick the newest 7.x. That it landed on 7.3.6 (the advisory fix version) is
  npm's resolution, not a version this plan hand-picked.
- **Reverted install #1 rather than patching it.** The plan's revert instruction was followed
  literally, so the evidence above is a two-run controlled experiment from an identical base rather
  than a mid-flight correction whose starting state is unrecoverable.
- **Peer warnings were not treated as a peer conflict.** See Issues Encountered.
- **`npm audit fix` / `npm audit fix --force` / `npm update` were never run.** `npm audit` itself was
  run three times, read-only, and its exit code (1) was never branched on.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] The plan's own install instruction cannot satisfy the plan's own acceptance criteria without an added `vite` constraint**

- **Found during:** Task 1
- **Issue:** The plan's premise — inherited from 47-RESEARCH §5 row 6, *"`vite` high → **stays on 7.x**;
  no need for vite 8"* — was measured against `vitest@4.0.18`, which declares
  `vite: "^6.0.0 || ^7.0.0"`. **Every `vitest@4.1.x` widened that range to
  `^6.0.0 || ^7.0.0 || ^8.0.0`** — verified against the registry for 4.1.0, 4.1.2, 4.1.4, 4.1.6, 4.1.8,
  4.1.9, 4.1.10 and 4.1.11, i.e. including 4.1.0, the *minimum* version that fixes the advisory. So
  **no choice of vitest version within the required `>= 4.1.0` floor avoids vite 8** — npm resolves the
  widened range greedily and nests `vite@8.2.2` under `node_modules/vitest/`, dragging in `rolldown`
  (which vite 8 uses in place of esbuild) plus 16 platform bindings, `@oxc-project/types`,
  `@rolldown/pluginutils` and a nested `lightningcss` set: 32 new keys.

  The plan's stated remedy on detecting vite 8 is *"revert … and report"*, on the theory that vite 8 is
  the `npm audit fix` signature and proves the install was not targeted. **That inference does not hold
  here.** The install *was* targeted — a single `npm install --save-dev vitest@^4.1.11` with no other
  argument. Vite 8 is a consequence of vitest 4.1's own manifest, and the causality actually runs the
  other way round: `vite@8.2.2` declares `rolldown` and `lightningcss` as direct dependencies, so the
  `rolldown`/`lightningcss` additions 47-RESEARCH attributes to `npm audit fix` are in substantial part
  just what pulling vite 8 does. Reverting and stopping would have left the CVSS 9.8 unfixed and
  blocked the entire phase on a falsified premise.

- **Fix:** Added `overrides: { "vite": "^7.0.0" }` to `package.json` — 3 lines, inside the plan's
  declared `files_modified`, no new dependency, no version hand-picked. The plan's literal revert was
  performed first (`git checkout -- package.json package-lock.json && npm ci`, exit 0, tree confirmed
  back at vitest 4.0.18 / vite 7.3.1 / no rolldown) so the corrected install ran from the identical
  base and the two runs are directly comparable.
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** 0 lockfile keys added (was 32); 0 forbidden-set additions (was 4); `vite@7.3.6`
  single top-level entry, 0 entries with major >= 8; `npm ci` reproduces it; all three gates identical
  to the pre-bump record; `vite` additionally left the critical/high advisory set.
- **Committed in:** `896ee6d` (part of the Task 1 commit)

**Corrections this establishes for the rest of the phase** (47-07's must_have truth restates *"the
lockfile gained nothing from the `npm audit fix` set and `vite` is still on 7.x"* — 47-07 line 218
already anticipates *"Check `vite` first — 47-01 may already have moved it"*, and it has):

1. 47-RESEARCH §5 row 6's *"stays on 7.x"* is true only **because** of the new override, not because
   vitest constrains it. Anyone deleting the override reopens it.
2. `vite` is **already remediated** — 7.3.6, all five GHSAs cleared. 47-07 should not re-handle it.
3. The forbidden `npm audit fix` set is not an independent signature; `rolldown` + `lightningcss` are
   what `vite@8` pulls. A future plan seeing them should check the resolved `vite` major first.

---

**Total deviations:** 1 auto-fixed (1 × Rule 3 — blocking issue)
**Impact on plan:** Necessary for the plan to meet its own acceptance criteria. No scope creep: 3 lines
in an already-declared file, zero new dependencies, and the change is *narrowing* — it forbids a
resolution rather than permitting one. Every other dependency in 47-RESEARCH §5's table is untouched.

## Issues Encountered

**1. `npm install` emits `npm warn ERESOLVE overriding peer dependency` — pre-existing, not a peer conflict.**
The plan says to STOP on a peer conflict rather than reach for `--legacy-peer-deps` or `--force`.
Neither flag was used and the install exited 0. The warning is
`next-auth@5.0.0-beta.30 > @auth/core@0.41.0` declaring `peerOptional nodemailer@"^6.8.0"` against the
project's `nodemailer@^7.0.13` — entirely unrelated to vitest, documented in 47-RESEARCH as the
plausible reason `Dockerfile:24` carries `--legacy-peer-deps`, and it fires identically on a bare
`npm ci` of the unmodified lockfile. Judged pre-existing background noise rather than information about
this change. Logged as D-47-01-C.

**2. npm does not persist the `overrides` block into `package-lock.json`.**
Verified: `grep '"overrides"' package-lock.json` → 0 matches; `lock.packages[""]` keys are
`name, version, dependencies, devDependencies, engines`; lockfileVersion 3. `npm ci` nonetheless
reproduces `vite@7.3.6` exactly (it installs the pinned tree, and it raised no manifest/lockfile drift
error), so **what CI installs is correct**. But the lockfile does not self-document the constraint, and
nothing in the repo fails if the override is deleted. Logged as **D-47-01-A** with a suggested one-line
fix for 47-09's offline policy test.

**3. A third, weaker control run was discarded as invalid.**
An attempt to re-falsify the override by deleting it and running `npm install --package-lock-only`
returned `vite@7.3.6` — because `--package-lock-only` prefers the existing resolution rather than
re-resolving greedily — and separately churned in 6 unrelated optional
`@tailwindcss/oxide-wasm32-wasi` wasm entries. Inconclusive by construction, so it is **not** presented
as evidence; NC-1 above (the two real installs) is. The tree was restored from the `/tmp/p47-01` copies
and `npm ci` re-run to make `node_modules` exact before the AFTER gates were measured. A related
scare — a check reporting `lightningcss added? true` — was traced to a matching bug in my own
predicate: `node_modules/lightningcss` already exists at top level via `tailwindcss@4` in **both** the
pre-bump and post-bump lockfiles. The authoritative set-difference reported 0 additions, correctly.

## Known Stubs

None — this plan changed two manifest files and created no code.

## Threat Flags

None. No network endpoint, auth path, file-access pattern or schema was added or modified. Per
T-47-01-04, only package names, versions and GHSA ids were read or recorded; no `.env`, token or
registry credential was touched.

## Next Phase Readiness

**Ready.** Wave 1 is complete and the runner is frozen for the rest of the phase:

- Later plans author gates against **vitest 4.1.11**. It will not move again inside phase 47.
- The suite baseline every later plan measures against is **4739 passed / 32 skipped** (base, 169 files
  passed / 2 skipped) and **8 passed** (rsc) — unchanged by the bump, so any movement a later plan sees
  is that plan's own doing.
- 47-07 inherits: **`vite` is already done** (7.3.6, five GHSAs cleared) and the `overrides.vite`
  constraint must be preserved by any subsequent `npm install`.
- 47-09 inherits the GHSA id tables above, the 24-package critical+high AFTER set as its allowlist
  starting point, and D-47-01-A (add `pkg.overrides.vite` to the offline policy assertions).
- 47-08 inherits `next` / `sharp` / nested `postcss`, untouched.
- Open handoffs are in `deferred-items.md` (D-47-01-A, D-47-01-B, D-47-01-C).
- Repo clean, compose stack up, `/api/health` 200, 10/10 processors alive.

## State Updates — one step deliberately not taken

`requirements mark-complete SEC-05 QG-01` was **NOT** run, despite `SEC-05, QG-01` appearing in this
plan's `requirements:` frontmatter. Measured: **12 of the 13 plans in phase 47 claim one or both of
those two IDs** — QG-01 by 47-02…47-06 and 47-13, SEC-05 by 47-07…47-13. Checking them off after plan
1 of 13 would mark a requirement complete when the gate that proves it has not been written yet, which
is precisely the class of false green this phase exists to delete. They belong to `/gsd:verify-phase 47`.

Everything else was recorded: `state.record-metric` (Phase 47 P01, 22min, 2 tasks, 2 files),
four `state.add-decision` entries, `state.update-progress` (7/19, 37%), and
`roadmap.update-plan-progress 47` (13 plans, 1 summary, In Progress).

Two state anomalies were repaired by hand rather than left:

1. **`state.advance-plan` acted on a stale Phase 46 position** and returned
   `{reason: "last_plan", current_plan: 6, total_plans: 6, status: "ready_for_verification"}`, flipping
   STATE.md's frontmatter to `status: verifying`. That is Phase 46's shape, not Phase 47's (13 plans,
   1 done). Corrected to `status: executing`, and `Current focus` / `Position` rewritten to Phase 47
   plan 01 of 13 — with Phase 46's outstanding `/gsd:verify-phase 46` preserved, since that is still
   owed.
2. **`state.record-session` reported `No session fields found in STATE.md`** — this STATE.md has no
   `Last session` / `Stopped At` / `Resume File` fields to update. The frontmatter `last_updated` and
   `last_activity` were set directly instead.

## Self-Check: PASSED

Files claimed created/modified, verified present on disk:

```
FOUND: package.json
FOUND: package-lock.json
FOUND: .planning/phases/47-suite-trust-supply-chain/47-01-SUMMARY.md
FOUND: .planning/phases/47-suite-trust-supply-chain/deferred-items.md
FOUND: 896ee6d   (git log --oneline --all)
```

All six SOURCE/CLI criteria re-asserted against the committed tree, not against a remembered run:

```
PASS: manifest vitest floor >= 4.1.0
PASS: lockfile vitest satisfies >=4.1.0
PASS: no vite major >= 8
PASS: 0 forbidden-set additions
PASS: GHSA-5xrq-8626-4rwp count === 0
PASS: anti-vacuity: crit+high >= 1 (got 24)
exit=0
```

---
*Phase: 47-suite-trust-supply-chain*
*Completed: 2026-08-25*
