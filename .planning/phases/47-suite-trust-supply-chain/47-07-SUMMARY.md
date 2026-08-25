---
phase: 47-suite-trust-supply-chain
plan: 07
subsystem: supply-chain
tags: [npm-audit, lockfile, advisory-disposition, drizzle-orm, auth.js, semver, npm-update]

# Dependency graph
requires:
  - phase: 47-suite-trust-supply-chain
    plan: 01
    provides: "the execution-time SEC-05 baseline (3 crit / 21 high / 24 crit+high packages), the `overrides.vite ^7.0.0` constraint, and the `npm audit fix` forbidden-set signature this plan asserts absent"
provides:
  - "every in-range critical/high advisory fix, taken by targeted install: 20 of the 24 crit+high packages left the audit document"
  - "drizzle-orm 0.45.2 — the SQL-identifier-injection fix in the server's own request path"
  - "the Auth.js trio on fixed versions (@auth/core 0.41.3 deduped to ONE copy), clearing ALL THREE criticals"
  - "fast-xml-parser removed from the tree entirely — research assumption A5 confirmed by installing, not by `npm view`"
  - "the residual crit+high set of exactly 4 (next, nodemailer, postcss, sharp) with GHSA ids, parent paths, evidenced reach and a named owner — the input 47-09's allowlist is built from"
  - "the --omit=dev reconciliation showing ZERO remaining crit+high advisories are DEV-only"
  - "a REBUILD VERDICT: 15 runtime-tree version changes, so 47-08's single rebuild is now load-bearing, not optional"
affects: [47-08, 47-09, 47-10, 47-11, 47-12, 47-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "`npm update <pkg>` as the narrowest instrument for a transitive whose fix is already inside its parent's declared range — it moves only that subtree and adds no direct dependency, unlike `npm install <pkg>@<ver>`"
    - "re-measure the audit set after EACH cluster, never after a batch: a batched `npm update` silently left one copy behind and only the per-cluster re-measure caught it"
    - "reach classification is reconciled against `npm audit --omit=dev --json`, never asserted — two of the plan's own classifications were falsified this way"
    - "runtime-tree impact is computed by partitioning the lockfile version-diff on the `dev`/`devOptional`/`optional` flags, and yields an explicit rebuild verdict"

key-files:
  created: []
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Used `npm update @aws-sdk/xml-builder` instead of the planned `@aws-sdk/client-s3` bump: @aws-sdk/core@3.973.14 already declares `@aws-sdk/xml-builder: ^3.972.7`, so 3.972.40 was in range of the INSTALLED tree. The narrow instrument removed 6 keys and added 0; the planned client-s3 bump within ^3.998.0 would have refreshed the whole AWS SDK to 3.1117.0"
  - "Used `npm update` rather than `npm install <pkg>@<ver>` for every transitive, so no transitive was promoted to a direct dependency and no manifest range was widened. Only drizzle-orm, @auth/drizzle-adapter and next-auth — already direct — moved their declared ranges"
  - "brace-expansion needed a SECOND pass: the batched `npm update` left node_modules/brace-expansion at 1.1.12 although 1.1.18 satisfies its parent's `^1.1.7`. Re-running it alone moved it. Recorded as a measured npm hazard"
  - "Did NOT rebuild the Docker image, per the plan's explicit instruction that 47-08 pays one rebuild covering this plan's runtime bumps AND the next bump — but the rebuild verdict is now POSITIVE (15 runtime version changes), so 47-08's rebuild is mandatory rather than merely convenient"
  - "vite and vitest were confirmed already remediated by 47-01 and NOT re-handled: vite resolves 7.3.6 and both are absent from the audit document"
  - "next and nodemailer were left untouched per 47-CONTEXT — they are 47-08's and 47-09's dispositions respectively"

patterns-established:
  - "Per-cluster attribution: five commits, each carrying its own crit+high set difference, so no fix's effect is attributable to the batch"
  - "Anti-vacuity by negative control on the gate itself: all FOUR branches of the plan's verify predicate were falsified independently against doctored audit documents before its green was accepted"

requirements-completed: []
requirements-advanced: [SEC-05]
requirements-note: "SEC-05 is deliberately NOT marked complete. Its first half (every critical/high advisory carries a recorded disposition) is only partly discharged — 20 packages are disposed as `upgraded` here, but the residual four are enumerated and handed onward, not disposed: `next`/`postcss`/`sharp` are 47-08's and `nodemailer` is 47-09's accept-with-reason-and-expiry. Its second half (CI has a stated audit policy that can actually fail, plus an allowlist with per-entry expiry) is untouched by this plan and belongs to 47-09/47-10. `requirements mark-complete SEC-05` checked the box and set the traceability row to Complete; both were reverted to `[ ]` / `In Progress` because a green SEC-05 with no AUDIT-POLICY.md and no CI gate is exactly the vacuous claim this phase exists to delete."

# Metrics
duration: 20min
completed: 2026-08-25
---

# Phase 47 Plan 07: In-Range Advisory Fixes Summary

**Twenty of the twenty-four critical/high packages left `npm audit` by targeted install — including drizzle-orm 0.45.2 (SQL identifier injection in the request path) and the Auth.js trio (all three criticals, `@auth/core` deduped to one copy at 0.41.3) — leaving exactly the four that 47-CONTEXT assigned elsewhere; `fast-xml-parser` is gone from the lockfile entirely, zero forbidden `npm audit fix` packages entered the tree, and the suite is unmoved at 4799/32.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-25T09:29:00Z
- **Completed:** 2026-08-25T09:49:00Z
- **Tasks:** 2 (executed as 5 attributable clusters)
- **Files modified:** 2

## Accomplishments

- **critical 3 → 0.** All three criticals were the Auth.js trio and all three are closed by in-range bumps.
- **crit+high packages 24 → 4.** Total advisories **36 → 14**. High **21 → 4**. Moderate **9 → 7**.
- **`drizzle-orm` 0.45.2** — the one advisory in the server's own SQL construction path — closed by a *patch* already permitted by the declared `^0.45.1`, installed and verified **first**.
- **`fast-xml-parser` no longer exists in the lockfile.** Research assumption A5 (verified only by `npm view`) is now verified by *installing*.
- **Zero forbidden packages entered the tree.** No `rolldown`, `tsx`, `esbuild`, `@esbuild/linux-x64`, `lightningcss`, `@oxc-project/types`. `vite` is still 7.3.6; **0** vite entries at major ≥ 8.
- **`npm audit fix` was never run.**
- **The residual four are all RUNTIME.** The `--omit=dev` reconciliation shows **zero** remaining crit+high advisories are DEV-only, so 47-09 cannot reach for a "dev-only" acceptance for any of them.
- **D-47-01-C is closed as a side effect** — the `@auth/core` ↔ `nodemailer` peer mismatch no longer fires.
- The plan's verification gate was **falsified four ways** before its green was accepted.

## Task Commits

| # | Cluster | Commit | crit+high |
|---|---|---|---|
| 1a | `drizzle-orm@0.45.2` | `2d92bfd` | 24 → 23 |
| 1b | Auth.js trio | `1d37f88` | 23 → 20 |
| 1c | `@aws-sdk/xml-builder` → drops `fast-xml-parser` | `14dd85b` | 20 → 19 |
| 1d | `axios` / `form-data` / `lodash` / `lodash-es` | `048e2a6` | 19 → 15 |
| 2a | the 12 BUILD/DEV transitives (+ the brace-expansion second pass) | `ac91d2b` | 15 → 5 → **4** |

## Files Created/Modified

- `package.json` — `drizzle-orm` `^0.45.1`→`^0.45.2`, `@auth/drizzle-adapter` `^1.11.1`→`^1.11.3`, `next-auth` `^5.0.0-beta.30`→`^5.0.0-beta.32`. Nothing else; `overrides.vite` untouched.
- `package-lock.json` — 3 keys added, 4 removed, 29 version changes.

---

## Re-measurement: today's real numbers

Measured fresh at execution time against the committed lockfile at `8b6f5a7`, with `node -e` over
`npm audit --json`. `npm audit` exits **1** whenever any advisory exists; the exit code was never
branched on.

```
BEFORE metadata.vulnerabilities: {"info":0,"low":3,"moderate":9,"high":21,"critical":3,"total":36}
BEFORE metadata.dependencies   : {"prod":528,"dev":581,"optional":214,"peer":36,"peerOptional":0,"total":1286}
BEFORE crit+high packages      : 24
```

**This is identical on every field to 47-01's closing figures** (`3 critical / 21 high / 9 moderate /
3 low, 36 total, 24 crit+high`). Advisory data did not move between 47-01 and this plan. The plan's
own `<interfaces>` table said `4 critical / 22 high / 38 total, 26 crit+high` — that was the
**pre-47-01** figure; the two-package delta is exactly `vite` and `vitest`, which 47-01 removed.

**`vite` and `vitest` confirmed already remediated — NOT re-handled:**

```
lockfile vite entries: node_modules/vite => 7.3.6   (1 entry, [dev])
vite entries with major >= 8: 0
vite  in the BEFORE crit+high set? NO
vitest in the BEFORE crit+high set? NO
package.json overrides = {"vite":"^7.0.0"}
```

### AFTER

```
AFTER metadata.vulnerabilities: {"info":0,"low":3,"moderate":7,"high":4,"critical":0,"total":14}
AFTER crit+high packages      : 4   [next nodemailer postcss sharp]
```

---

## Per-cluster critical/high set differences

Each install was followed by a fresh `npm audit --json`, so every fix's effect is attributable to its
own step rather than to the batch.

| Step | Instrument | histogram (c/h/m/l) | crit+high | LEFT the set | JOINED |
|---|---|---|---|---|---|
| baseline | — | 3 / 21 / 9 / 3 | 24 | — | — |
| **1a** | `npm install drizzle-orm@0.45.2` | 3 / 20 / 9 / 3 | 23 | `drizzle-orm` | (none) |
| **1b** | `npm install @auth/drizzle-adapter@1.11.3 next-auth@5.0.0-beta.32` | **0** / 20 / 9 / 3 | 20 | `@auth/core` `@auth/drizzle-adapter` `next-auth` | (none) |
| **1c** | `npm update @aws-sdk/xml-builder` | 0 / 19 / 8 / 3 | 19 | `fast-xml-parser` | (none) |
| **1d** | `npm update axios lodash lodash-es` | 0 / 15 / 7 / 3 | 15 | `axios` `form-data` `lodash` `lodash-es` | (none) |
| **2a-i** | `npm update` × 12 transitives | 0 / 5 / 7 / 3 | 5 | `@hono/node-server` `express-rate-limit` `fast-uri` `flatted` `hono` `ip-address` `js-yaml` `minimatch` `nanoid` `path-to-regexp` | (none) |
| **2a-ii** | `npm update brace-expansion` | 0 / 4 / 7 / 3 | **4** | `brace-expansion` | (none) |

**JOINED is `(none)` at every single step.** No install introduced a new critical or high advisory.

---

## Lockfile resolved versions, with `semver` assertions

Read out of `package-lock.json` (not the manifest range) and asserted with the `semver` package —
never eyeballed.

```
lockfile drizzle-orm           = 0.45.2         semver.gte(0.45.2)        ? true
lockfile @auth/drizzle-adapter = 1.11.3         semver.gte(1.11.3)        ? true
lockfile next-auth             = 5.0.0-beta.32  semver.gte(5.0.0-beta.32) ? true
lockfile @auth/core            = 0.41.3         semver.gte(0.41.3)        ? true
lockfile axios                 = 1.19.0         semver.gte(1.19.0)        ? true
lockfile form-data             = 4.0.6          semver.gte(4.0.6)         ? true
lockfile lodash                = 4.18.1         semver.gte(4.18.1)        ? true
lockfile lodash-es             = 4.18.1         semver.gte(4.18.1)        ? true
lockfile nanoid                = 3.3.18         semver.gte(3.3.18)        ? true
lockfile postcss (top-level)   = 8.5.26         semver.gte(8.5.26)        ? true
lockfile @aws-sdk/xml-builder  = 3.972.40
lockfile brace-expansion       = 1.1.18
lockfile vite                  = 7.3.6          (unchanged from 47-01)

fast-xml-parser lockfile entries: 0   (NONE — absent)
postcss nested under next      = 8.4.31  ← NOT fixed here, see below
```

`@auth/core` resolved through its parents; it was **not** installed directly:

```
pipelite@0.1.0
├─┬ @auth/drizzle-adapter@1.11.3
│ └── @auth/core@0.41.3
└─┬ next-auth@5.0.0-beta.32
  └── @auth/core@0.41.3 deduped
```

It also **deduped from two copies to one** — `node_modules/next-auth/node_modules/@auth/core@0.41.0`
was removed. (Note: `src/auth.ts:33-35` carries a comment asserting the two "bundle separate
`@auth/core` copies" and an `as any` cast justified by it. That comment is now stale — logged as
D-47-07-A, not fixed here because this plan's `files_modified` is the two manifest files.)

### Confirmed through the CI install path

```
npm ci  -> exit 0
git status --porcelain after npm ci -> (empty)

installed from ./node_modules after npm ci:
  drizzle-orm = 0.45.2        @auth/core = 0.41.3      @auth/drizzle-adapter = 1.11.3
  next-auth = 5.0.0-beta.32   @aws-sdk/xml-builder = 3.972.40
  axios = 1.19.0              lodash = 4.18.1          nanoid = 3.3.18
  postcss = 8.5.26            brace-expansion = 1.1.18 vite = 7.3.6
  fast-xml-parser = ABSENT (correct)
```

---

## Lockfile added / removed / changed key lists

Computed as a set difference against `/tmp/p47-07/package-lock.json` (the pre-plan copy) with
`node -e`, never `grep | wc -l`.

```
ADDED keys (3):
  + [RUN] node_modules/axios/node_modules/agent-base       @ 6.0.2
  + [RUN] node_modules/axios/node_modules/https-proxy-agent @ 5.0.1
  + [RUN] node_modules/axios/node_modules/proxy-from-env   @ 2.1.0

REMOVED keys (4):
  - [dev] node_modules/@typescript-eslint/typescript-estree/node_modules/balanced-match @ 4.0.4
  - [RUN] node_modules/fast-xml-parser                     @ 5.3.6
  - [RUN] node_modules/next-auth/node_modules/@auth/core   @ 0.41.0
  - [RUN] node_modules/strnum                              @ 2.1.2

FORBIDDEN-SET additions: 0  []
   (checked at top level AND at any nesting depth for: rolldown, @rolldown/pluginutils,
    tsx, esbuild, @esbuild/linux-x64, lightningcss, @oxc-project/types)

vite entries: node_modules/vite => 7.3.6
vite entries with major >= 8: 0
```

The three additions are `axios@1.19.0`'s own proxy dependencies, nested under `node_modules/axios/`.
They are the cost of the axios advisory fix, not a refresh — none is in the forbidden set.

```
VERSION CHANGES (29):
  ~ [RUN] node_modules/@auth/core                                             0.41.1 -> 0.41.3
  ~ [RUN] node_modules/@auth/drizzle-adapter                                  1.11.1 -> 1.11.3
  ~ [RUN] node_modules/@aws-sdk/xml-builder                                  3.972.7 -> 3.972.40
  ~ [dev] node_modules/@hono/node-server                                      1.19.9 -> 1.19.17
  ~ [RUN] node_modules/@smithy/types                                          4.13.0 -> 4.17.2
  ~ [dev] node_modules/@ts-morph/common/node_modules/brace-expansion           5.0.3 -> 5.0.9
  ~ [dev] node_modules/@ts-morph/common/node_modules/minimatch                10.2.2 -> 10.2.6
  ~ [dev] node_modules/@typescript-eslint/.../node_modules/brace-expansion     5.0.3 -> 2.1.4
  ~ [dev] node_modules/@typescript-eslint/.../node_modules/minimatch           9.0.6 -> 9.0.9
  ~ [RUN] node_modules/axios                                                  1.13.6 -> 1.19.0
  ~ [dev] node_modules/brace-expansion                                        1.1.12 -> 1.1.18
  ~ [RUN] node_modules/drizzle-orm                                            0.45.1 -> 0.45.2
  ~ [dev] node_modules/express-rate-limit                                      8.2.1 -> 8.6.2
  ~ [RUN] node_modules/fast-uri                                                3.1.0 -> 3.1.6
  ~ [dev] node_modules/flatted                                                 3.3.3 -> 3.4.4
  ~ [RUN] node_modules/follow-redirects                                      1.15.11 -> 1.16.0
  ~ [RUN] node_modules/form-data                                               4.0.5 -> 4.0.6
  ~ [RUN] node_modules/hasown                                                  2.0.2 -> 2.0.4
  ~ [dev] node_modules/hono                                                   4.12.1 -> 4.13.4
  ~ [dev] node_modules/ip-address                                             10.0.1 -> 10.5.0
  ~ [dev] node_modules/js-yaml                                                 4.1.1 -> 4.3.1
  ~ [RUN] node_modules/lodash                                                4.17.23 -> 4.18.1
  ~ [RUN] node_modules/lodash-es                                             4.17.23 -> 4.18.1
  ~ [dev] node_modules/minimatch                                               3.1.3 -> 3.1.5
  ~ [RUN] node_modules/nanoid                                                 3.3.11 -> 3.3.18
  ~ [RUN] node_modules/next-auth                                       5.0.0-beta.30 -> 5.0.0-beta.32
  ~ [RUN] node_modules/oauth4webapi                                            3.8.5 -> 3.8.7
  ~ [dev] node_modules/postcss                                                 8.5.6 -> 8.5.26
  ~ [dev] node_modules/router/node_modules/path-to-regexp                      8.3.0 -> 8.4.2
```

---

## Runtime-tree impact, and the rebuild verdict

Partitioning the 29 version changes on the lockfile's `dev` / `devOptional` flags:

```
version changes total: 29
of those, RUNTIME-reachable (not dev/devOptional): 15
   @auth/core 0.41.1 -> 0.41.3            @auth/drizzle-adapter 1.11.1 -> 1.11.3
   @aws-sdk/xml-builder 3.972.7 -> .40     @smithy/types 4.13.0 -> 4.17.2
   axios 1.13.6 -> 1.19.0                  drizzle-orm 0.45.1 -> 0.45.2
   fast-uri 3.1.0 -> 3.1.6                 follow-redirects 1.15.11 -> 1.16.0
   form-data 4.0.5 -> 4.0.6                hasown 2.0.2 -> 2.0.4
   lodash 4.17.23 -> 4.18.1                lodash-es 4.17.23 -> 4.18.1
   nanoid 3.3.11 -> 3.3.18                 next-auth 5.0.0-beta.30 -> 5.0.0-beta.32
   oauth4webapi 3.8.5 -> 3.8.7
runtime-reachable ADDED:   3 (axios's agent-base / https-proxy-agent / proxy-from-env)
runtime-reachable REMOVED: 3 (fast-xml-parser, strnum, the nested @auth/core@0.41.0)
```

### VERDICT: a rebuild IS required — and it is 47-08's, already planned

This is the **opposite** of 47-01, which proved its own change net-zero on the runtime tree and
correctly concluded no rebuild was warranted. Here **15 runtime-reachable packages moved version, 3
entered the runtime tree and 3 left it.** The image currently running (`pipelite-app-1`, up 5 h) is
built from the *pre-plan* tree and does not contain `drizzle-orm@0.45.2` or `@auth/core@0.41.3` — so
**the SQL-injection fix and all three critical auth fixes are not yet in the container.**

No rebuild was performed here, per the plan's explicit instruction that 47-08 pays a single rebuild
covering this plan's runtime bumps and the `next` bump together. That instruction is honoured, but
its status changes: **47-08's rebuild is now load-bearing, not a convenience.** If 47-08's `next`
bump has to be reverted, its rebuild must still happen to land *this* plan's runtime fixes.
`Dockerfile:24` uses `npm install --legacy-peer-deps`, not `npm ci`, so the image tree is not
lockfile-exact — the deferred `npm ci` conversion (47-CONTEXT § Deferred) is what would make the
rebuild provably carry these versions.

**Compose stack left UP and unmodified**, as required:

```
pipelite-app-1      (pipelite-app)     Up 5 hours       [3001]
pipelite-postgres-1 (postgres:16-alpine) Up 2 weeks (healthy) [5433]
pipelite-mailhog-1  (mailhog:latest)   Up 2 weeks       [1025, 8025]
```

---

## Peer-dependency warnings, verbatim

**Cluster 1a** (`npm install drizzle-orm@0.45.2`) emitted the pre-existing D-47-01-C warning:

```
npm warn ERESOLVE overriding peer dependency
npm warn While resolving: @auth/core@0.41.0
npm warn Found: nodemailer@7.0.13
npm warn node_modules/nodemailer
npm warn   peerOptional nodemailer@"^7.0.7" from @auth/core@0.41.1
npm warn   node_modules/@auth/core
npm warn     @auth/core@"0.41.1" from @auth/drizzle-adapter@1.11.1
npm warn     node_modules/@auth/drizzle-adapter
npm warn   2 more (next-auth, the root project)
npm warn
npm warn Could not resolve dependency:
npm warn peerOptional nodemailer@"^6.8.0" from @auth/core@0.41.0
npm warn node_modules/next-auth/node_modules/@auth/core
npm warn   @auth/core@"0.41.0" from next-auth@5.0.0-beta.30
npm warn   node_modules/next-auth
npm warn
npm warn Conflicting peer dependency: nodemailer@6.10.1
npm warn node_modules/nodemailer
npm warn   peerOptional nodemailer@"^6.8.0" from @auth/core@0.41.0
npm warn   node_modules/next-auth/node_modules/@auth/core
npm warn     @auth/core@"0.41.0" from next-auth@5.0.0-beta.30
npm warn     node_modules/next-auth
```

**Clusters 1b, 1c, 1d, 2a emitted NO warnings at all**, and neither did `npm ci`.

### D-47-01-C is closed as a side effect of cluster 1b

The offender was the **nested** `next-auth/node_modules/@auth/core@0.41.0`, which declared
`peerOptional nodemailer@"^6.8.0"` against this project's `^7.0.13`. `next-auth@5.0.0-beta.32`
resolves `@auth/core@0.41.3`, which declares:

```
node_modules/@auth/core => 0.41.3  peerDependencies: {"nodemailer":"^7.0.7 || ^8.0.5"}
node_modules/next-auth  => 5.0.0-beta.32  peerDependencies: {"nodemailer":"^7.0.7 || ^8.0.5"}
```

`nodemailer@7.0.13` **satisfies** that, and the nested 0.41.0 copy is gone. The install is now
warning-free. **`--legacy-peer-deps` and `--force` were NOT used at any point.** This also *weakens*
the plan's stated argument that the peer mismatch is a reason to avoid `nodemailer` 9 — but note that
`nodemailer@9` would **re-open** the mismatch, since `^7.0.7 || ^8.0.5` excludes 9.x. That is now a
*stronger*, freshly-measured argument for 47-09's accept-with-reason path.

---

## `--omit=dev` reconciliation

Per T-47-07-05, no reach classification is asserted — each is reconciled against
`npm audit --omit=dev --json`. A package the plan called DEV that still appears under `--omit=dev` is
misclassified.

```
--- BEFORE ---
  full histogram     : {"low":3,"moderate":9,"high":21,"critical":3,"total":36}
  omit-dev histogram : {"low":2,"moderate":9,"high":12,"critical":3,"total":26}
  full crit+high     : 24
  omit-dev crit+high : 15  [@auth/core @auth/drizzle-adapter axios drizzle-orm fast-uri
                            fast-xml-parser form-data lodash lodash-es nanoid next next-auth
                            nodemailer postcss sharp]
  DEV-only (full minus omit-dev): 9  [@hono/node-server brace-expansion express-rate-limit
                                      flatted hono ip-address js-yaml minimatch path-to-regexp]

--- AFTER ---
  full histogram     : {"low":3,"moderate":7,"high":4,"critical":0,"total":14}
  omit-dev histogram : {"low":2,"moderate":7,"high":4,"critical":0,"total":13}
  full crit+high     : 4  [next nodemailer postcss sharp]
  omit-dev crit+high : 4  [next nodemailer postcss sharp]
  DEV-only (full minus omit-dev): 0  []
  sanity — in omit-dev but NOT in full: 0  []
```

**All 9 DEV-only crit+high packages were fixed. ZERO remain.** Every one of the four residual
advisories is in the production install tree, so **no "dev-only" acceptance is available to 47-09 for
any of them.**

### Two of the plan's own reach classifications were FALSIFIED by this reconciliation

| Package | Plan's `<interfaces>` said | Reconciliation says | Evidence |
|---|---|---|---|
| `nanoid` | **BUILD** (via `postcss`) | **RUNTIME** | present in the BEFORE `--omit=dev` set; lockfile entry `node_modules/nanoid` carries no `dev` flag. Reached via `next` (a prod dependency), not only via postcss |
| `fast-uri` | **DEV** (also BUILD) | **RUNTIME** | present in the BEFORE `--omit=dev` set; lockfile entry carries no `dev` flag |

Both are now fixed, so the misclassification has no residual consequence — but it is recorded rather
than quietly corrected, because the same reasoning applied to a package that had *stayed* would have
produced a false "dev-only" acceptance. This is exactly the failure T-47-07-05 exists to catch, and
the reconciliation caught it.

Conversely, the plan's DEV classification is **confirmed** for the nine that left:
`@hono/node-server`, `brace-expansion`, `express-rate-limit`, `flatted`, `hono`, `ip-address`,
`js-yaml`, `minimatch`, `path-to-regexp` were all absent from the BEFORE `--omit=dev` set.

---

## RESIDUAL TABLE — the deliverable 47-09 consumes

Four packages remain in the critical/high set. **None is DEV.** Each entry's reach is stated with its
evidence, and each has a named owner.

### 1. `next` — HIGH — owner **47-08**

| Field | Value |
|---|---|
| Resolved | `16.1.6`, direct dependency, pinned **EXACT** (not a range) |
| Vulnerable range | `9.3.4-canary.0 - 16.3.0-preview.10` |
| `fixAvailable` | `{"name":"next","version":"16.3.2","isSemVerMajor":false}` — **not in range**, requires a manifest edit |
| GHSA count | **28** |
| Parent path | `next@16.1.6` (direct); also deduped under `@sentry/nextjs@10.70.0`, `next-auth@5.0.0-beta.32`, `next-intl@4.8.3` |
| Reach | **RUNTIME** |
| Reach evidence | It is the web framework. `node_modules/next` carries no `dev` flag; `next.config.ts` sets `output: "standalone"`, so it is the server process itself. Present in `--omit=dev`. |
| Notable | `GHSA-q4gf-8mx6-v5v3` (CVSS 7.5, DoS via Server Components), `GHSA-8h8q-6873-q5fj` (CVSS 7.5, DoS via Server Components), `GHSA-26hh-7cqf-hhc6` (CVSS 7.5, **middleware/proxy bypass in App Router via segment-prefetch routes**), `GHSA-mg66-mrh9-m8jx` (CVSS 7.5, DoS via connection exhaustion) |

Full GHSA list:
```
GHSA-ggv3-7p47-pfv8 GHSA-3x4c-7xq6-9pq8 GHSA-h27x-g6w4-24gq GHSA-mq59-m269-xvcx
GHSA-jcc7-9wpm-mj36 GHSA-q4gf-8mx6-v5v3 GHSA-8h8q-6873-q5fj GHSA-26hh-7cqf-hhc6
GHSA-3g8h-86w9-wvmq GHSA-ffhc-5mcf-pf4q GHSA-vfv6-92ff-j949 GHSA-gx5p-jg67-6x7h
GHSA-mg66-mrh9-m8jx GHSA-h64f-5h5j-jqjh GHSA-c4j6-fc7j-m34r GHSA-492v-c6pp-mqqv
GHSA-wfc6-r584-vfw7 GHSA-267c-6grr-h53f GHSA-36qx-fr4f-26g5 GHSA-6gpp-xcg3-4w24
GHSA-m99w-x7hq-7vfj GHSA-89xv-2m56-2m9x GHSA-68g3-v927-f742 GHSA-4633-3j49-mh5q
GHSA-4c39-4ccg-62r3 GHSA-p9j2-gv94-2wf4 GHSA-q8wf-6r8g-63ch GHSA-955p-x3mx-jcvp
```

### 2. `postcss` (the copy nested under `next`) — HIGH — owner **47-08** — **PARTIAL FIX here**

| Field | Value |
|---|---|
| Vulnerable node | `node_modules/next/node_modules/postcss @ 8.4.31` — **the ONLY vulnerable copy** |
| Top-level copy | `node_modules/postcss @ 8.5.26` — **FIXED in this plan** (was 8.5.6), and `[dev]` |
| Vulnerable range | `<=8.5.22` |
| `fixAvailable` | `{"name":"next","version":"16.3.2"}` — moves only with `next` |
| GHSA ids | `GHSA-qx2v-qp2m-jg93` `GHSA-6g55-p6wh-862q` `GHSA-fxqj-rqcc-2cmp` `GHSA-r28c-9q8g-f849` |
| `effects` | `["next"]` |
| Parent paths | `next@16.1.6 → postcss@8.4.31` (vulnerable) · `@tailwindcss/postcss@4.2.0 → postcss@8.5.26` (fixed) · `shadcn@3.8.5 → 8.5.26 deduped` · `vitest@4.1.11 → vite@7.3.6 → 8.5.26 deduped` |
| Reach | **shipped in the runtime tree, but BUILD-executed** |
| Reach evidence | The lockfile entry carries no `dev` flag (because `next` is a prod dependency), so it appears under `--omit=dev` and **ships inside the image**. But `next` invokes postcss only in the CSS pipeline during `next build`; nothing in `src/` passes request data to postcss. `GHSA-6g55-p6wh-862q` / `GHSA-r28c-9q8g-f849` require processing attacker-controlled CSS with an attacker-controlled `sourceMappingURL`, and this app never compiles user-supplied CSS. |

**Recorded as PARTIAL, not done.** `next` pins `postcss` at `8.4.31` **exactly**, so no in-range
instrument can move it; it moves only when `next` moves in 47-08.

### 3. `sharp` — HIGH — owner **47-08**

| Field | Value |
|---|---|
| Resolved | `0.34.5`, `[optional]` under `next` |
| Vulnerable range | `<0.35.0`; `next@16.1.6` declares `^0.34.4`, so 0.35 is **out of range** |
| `fixAvailable` | `{"name":"next","version":"16.3.2"}` |
| GHSA id | `GHSA-f88m-g3jw-g9cj` — inherited libvips CVEs: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 |
| Parent path | `next@16.1.6 → sharp@0.34.5` (sole parent) |
| Reach | **RUNTIME, but measurably NARROW in this app** |
| Reach evidence | Present under `--omit=dev`, so it ships. **But `next/image` is never imported anywhere in `src/`** — measured with `node -e`: **0** files contain `import ... from "next/image"`, and **0** occurrences of `<Image`. The only textual match for `next/image` in the whole of `src/` is the middleware matcher exclusion string `_next/image` at `src/middleware.ts:8`. `next.config.ts` declares **no `images` block at all**, so no `remotePatterns` are configured and the optimizer rejects external URLs. The `/_next/image` endpoint still exists on the standalone server, so reach is narrow rather than zero. |

47-08 should record this narrowing — it is the difference between "sharp processes attacker-supplied
images" and "sharp is linked in but no code path in this application invokes it."

### 4. `nodemailer` — HIGH — owner **47-09** (accept-with-reason-and-expiry)

| Field | Value |
|---|---|
| Resolved | `7.0.13`, direct dependency `^7.0.13` |
| Vulnerable range | `<=9.0.0` |
| `fixAvailable` | `{"name":"nodemailer","version":"9.0.5","isSemVerMajor":true}` — **breaking major 7→9** |
| GHSA ids | `GHSA-c7w3-x93f-qmm8` `GHSA-vvjj-xcjg-gr5g` `GHSA-268h-hp4c-crq3` `GHSA-wqvq-jvpq-h66f` `GHSA-r7g4-qg5f-qqm2` `GHSA-p6gq-j5cr-w38f` |
| Worst | `GHSA-p6gq-j5cr-w38f` (CVSS 7.1) — message-level **`raw`** option bypasses `disableFileAccess`/`disableUrlAccess`, enabling arbitrary file read and full-response SSRF |
| Parent paths | direct; also `@auth/drizzle-adapter@1.11.3 → @auth/core@0.41.3 → nodemailer (deduped)` and `next-auth@5.0.0-beta.32 → nodemailer (deduped)` |
| Reach | **RUNTIME** — `src/lib/email/client.ts:1` imports `createTransport` |

**Fresh evidence for 47-09's accept-with-reason, measured today:**

- There is exactly **ONE** `sendMail` call site in the repo, `src/lib/email/send.ts:29`, and it passes
  exactly `{ from, to, subject, html, text }`.
- An AST-adjacent sweep of all of `src/` for `raw:`, `envelope:`, `list:`, `jsonTransport`,
  `disableFileAccess` or `disableUrlAccess` near any nodemailer/`sendMail`/`Transporter` reference
  returned **0 files**. The `raw` option that `GHSA-p6gq-j5cr-w38f` requires is never supplied.
- `createTransport` (`src/lib/email/client.ts:8-21`) is given only `host`/`port`/`secure`/`auth`/`tls`,
  all from env vars — no transport `name`, no `jsonTransport`.
- **New this plan:** `@auth/core@0.41.3` and `next-auth@5.0.0-beta.32` both declare
  `peerOptional nodemailer@"^7.0.7 || ^8.0.5"`. Bumping to 9.x would **re-introduce** the ERESOLVE
  peer conflict that cluster 1b just eliminated. This is a *measured* consequence, not a projection.

47-CONTEXT forbids trading a documented risk for an undocumented one in a debt-paydown milestone.
**Every entry above needs an expiry date per 47-CONTEXT § CI audit policy.**

### Summary of ownership

| Package | Severity | Reach | Owner |
|---|---|---|---|
| `next` | high | RUNTIME (the server itself) | **47-08** |
| `postcss` (nested `8.4.31`) | high | ships in image, BUILD-executed | **47-08** (partial fix here) |
| `sharp` | high | RUNTIME, narrow (`next/image` unused) | **47-08** |
| `nodemailer` | high | RUNTIME (`src/lib/email/client.ts:1`) | **47-09** accept-with-reason + expiry |

### Below the `failOn` floor — context only

`failOn` is `["critical","high"]`. The 7 moderate and 3 low are recorded but are not gate failures:

```
moderate (7): @esbuild-kit/core-utils @esbuild-kit/esm-loader drizzle-kit esbuild
              follow-redirects next-intl qs
low (3)     : @babel/core body-parser icu-minify
```

`@aws-sdk/xml-builder` and `yaml` **left** the moderate set (9 → 7) as side effects of clusters 1c
and 2a. **D-47-01-B is resolved as far as it can be here:** `esbuild`'s surviving moderate is the
`drizzle-kit > @esbuild-kit/*` copy, and `@esbuild-kit/core-utils` / `@esbuild-kit/esm-loader` are
both **deprecated, unmaintained** packages whose only parent is `drizzle-kit@^0.31.9` — there is no
in-range fix. It stays below the floor; 47-09 may note it.

---

## Anti-vacuity: the verification gate was falsified FOUR ways

The plan's `<verify><automated>` predicate has three assertions plus an anti-vacuity floor. Per the
standing v1.4 rule, **each branch was made to fail on purpose** before its green was accepted. The
predicate was extracted verbatim into `/tmp/p47-07/gate.mjs` so it could be run against doctored
audit documents without touching the tree.

```
### NC-1: the pre-plan audit document (contains drizzle-orm + the trio) ###
Error: drizzle-orm is still critical/high
exit=1

### NC-2: an EMPTY audit document (the vacuous case) ###
Error: zero critical/high parsed — the audit document is empty, which is the vacuous case
exit=1

### NC-3: drizzle-orm re-injected into TODAY'S document ###
Error: drizzle-orm is still critical/high
exit=1

### NC-4: the auth trio re-injected ALONE (isolates the third assertion) ###
Error: the Auth.js trio is still critical/high
exit=1

### POSITIVE: today's real document ###
GATE GREEN — crit+high: 4 next,nodemailer,postcss,sharp
exit=0
```

NC-4 exists because NC-1 short-circuits on the `drizzle-orm` assertion and never reaches the
auth-trio branch — a negative control that only proves the *first* assertion can fire is not a
negative control for the third.

And the plan's own command, run verbatim:

```
all crit+high: 4 next,nodemailer,postcss,sharp
omit-dev crit+high: 4 next,nodemailer,postcss,sharp
PLAN_VERIFY_EXIT=0
```

---

## The three gates — exact numbers

| Gate | Baseline (post wave-3a, `8b6f5a7`) | AFTER this plan | Verdict |
|---|---|---|---|
| base test files | `170 passed \| 2 skipped (172)` | `170 passed \| 2 skipped (172)` | **identical** |
| base tests | `4799 passed \| 32 skipped (4831)` | `4799 passed \| 32 skipped (4831)` | **identical** |
| rsc project | `2 files / 8 passed (8)` | `2 files / 8 passed (8)` | **identical** |
| `tsc --noEmit` | exit 0, 0 bytes | exit 0, 0 bytes | **identical** |
| `eslint` | exit 0 — `124 problems (0 errors, 124 warnings)` | exit 0 — `124 problems (0 errors, 124 warnings)` | **identical** |

**4799 = 4739 (Phase 46 base) + 39 (47-03) + 21 (47-04)** — exactly the predicted post-wave-3a
figure, re-measured here rather than assumed. Lint is gated on **errors (0)**; the 124-warning total
is context only, per the standing rule that a warning total differs between master and a worktree.

The plan's verify command was then run as a single chain **on a freshly `npm ci`'d tree**:

```
npm test && npm run typecheck && npm run lint
COMBINED_VERIFY_EXIT=0
  Test Files  170 passed | 2 skipped (172)
  Tests  4799 passed | 32 skipped (4831)
  Test Files  2 passed (2)
  Tests  8 passed (8)
  (tsc: no output)
  ✖ 124 problems (0 errors, 124 warnings)
```

Per-cluster localised suites, run **before** each full-suite pass so a breakage would be attributable:

| Cluster | Suites | Result |
|---|---|---|
| 1a `drizzle-orm` | `src/lib/mutations src/db src/lib/execution` | 25 files / **715** passed |
| 1b Auth.js trio | `src/app/admin/users src/lib/api src/lib/auth src/auth.test.ts` + the 8 files importing `@/auth` / `next-auth` (found with `node -e`) | 12 files / **315** passed, 3 skipped |
| 1c S3 client | `src/lib/__tests__/compose-uploads-persistence.test.ts src/app/api` | 8 files / **135** passed |
| 1d axios/lodash | `src/app/import src/lib/pipedrive src/lib/import src/components/charts src/lib/dedup` | 14 files / **279** passed |

---

## `slopcheck scan package.json` — verbatim

Read-only subcommand only. **`slopcheck install` was NOT used** (it is measured to rewrite the
manifest). ANSI colour codes stripped and consecutive blank lines collapsed; no other alteration.
Full raw log at `/tmp/p47-07/slopcheck-scan.log`. Exit code **1** (it exits non-zero on any SUS).

```
slopcheck scanning package.json...
  found 59 dependencies
  [OK] @aws-sdk/client-s3 (npm)
  [OK] @dagrejs/dagre (npm)
  [OK] @tanstack/react-table (npm)
  [OK] @dnd-kit/sortable (npm)
  [OK] @hookform/resolvers (npm)
  [OK] @dnd-kit/core (npm)
  [OK] @xyflow/react (npm)
  [OK] @dnd-kit/utilities (npm)
  [OK] @auth/drizzle-adapter (npm)
  [OK] @sentry/nextjs (npm)
  [OK] argon2 (npm)
  [OK] class-variance-authority (npm)
  [OK] cron-parser (npm)
  [OK] clsx (npm)
  [OK] ioredis (npm)
  [OK] cmdk (npm)
  [OK] lucide-react (npm)
  [OK] drizzle-kit (npm)
  [OK] date-fns (npm)
    > No source repository linked. Harder to verify what this code actually does.
  [OK] next-intl (npm)
  [OK] next-auth (npm)
  [OK] papaparse (npm)
  [OK] next (npm)
  [OK] nodemailer (npm)
  [OK] next-themes (npm)
  [OK] pipedrive (npm)
  [OK] postgres (npm)
  [OK] quickjs-emscripten (npm)
  [OK] react (npm)
  [OK] radix-ui (npm)
  [OK] react-big-calendar (npm)
  [OK] react-dom (npm)
  [OK] recharts (npm)
  [OK] sonner (npm)
  [OK] react-hook-form (npm)
  [OK] react-hotkeys-hook (npm)
  [OK] tailwind-merge (npm)
  [OK] yaml (npm)
  [OK] use-debounce (npm)
  [OK] zod (npm)
  [OK] zustand (npm)
  [OK] drizzle-orm (npm)
  [OK] @types/papaparse (npm)
  [OK] @types/nodemailer (npm)
  [OK] @tailwindcss/postcss (npm)
  [OK] @types/node (npm)
  [OK] @types/semver (npm)
  [OK] @types/react (npm)
  [OK] @types/react-dom (npm)
  [OK] @playwright/test (npm)
  [OK] eslint (npm)
  [OK] shadcn (npm)
  [OK] tw-animate-css (npm)
  [OK] @types/react-big-calendar (npm)
  [OK] semver (npm)
  [OK] tailwindcss (npm)
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

**`[SUS] vitest` — dismissed as a false positive on the same recorded evidence as 47-01.** It is a
pure edit-distance heuristic. `vitest` is this repo's test framework (3 config files, 3 npm scripts,
175 source files importing it) and has been since before v1.0. `vite` is **not a declared dependency
of this project at all** — it exists only as vitest's transitive, so there is no `vite` for `vitest`
to be a typosquat *of*. Identical verdict to 47-RESEARCH's Package Legitimacy Audit and 47-01.

**No new package was introduced by this plan** — every change raised an already-declared dependency
to an already-published version. The scan found no new SUS entries relative to 47-01.

**The scan did not mutate the tree:**

```
md5sum -c            -> package.json: OK
                        package-lock.json: OK
git rev-parse HEAD   -> identical to the pre-scan capture
git status --porcelain -> only package-lock.json (this plan's staged work, not slopcheck's)
```

Final state: `git status --porcelain` is **empty** — the only files this plan touched are
`package.json` and `package-lock.json`, both committed.

---

## Deviations from Plan

### Auto-fixed / adapted

**1. [Rule 3 — narrower instrument] `npm update @aws-sdk/xml-builder` replaced the planned `@aws-sdk/client-s3` bump**
- **Found during:** Task 1 cluster (c)
- **Issue:** The plan directed installing `@aws-sdk/client-s3` "at the newest version satisfying
  `^3.998.0`". Measured, that is **3.1117.0** — a ~119-minor jump that would refresh the entire AWS
  SDK subtree, which is the broad dependency refresh 47-CONTEXT excludes.
- **Finding:** `@aws-sdk/core@3.973.14` (already installed) declares
  `"@aws-sdk/xml-builder": "^3.972.7"`, and the fixed `3.972.40` **satisfies that range**. The fix was
  in range of the *installed* tree, so no manifest change was needed at all.
- **Fix:** `npm update @aws-sdk/xml-builder`. Removed 6 keys, changed 2, **added 0**.
  `@aws-sdk/client-s3` stays at `3.998.0`. Same advisory closed, far narrower blast radius. Task 2's
  own instruction — "prefer the narrowest instrument that moves only those subtrees" — is the
  authority for this.
- **Commit:** `14dd85b`

**2. [Rule 1 — incomplete fix] `brace-expansion` needed a second `npm update` pass**
- **Found during:** Task 2 cluster (a)
- **Issue:** After `npm update` with all 12 package names as arguments, `crit+high` was 5 and
  `brace-expansion` was still in it. `node_modules/brace-expansion` sat at **1.1.12** even though
  **1.1.18** is published and satisfies its parent `minimatch@3.1.5`'s declared `^1.1.7`. The nested
  copies (5.0.3 → 5.0.9 / 2.1.4) had moved; only the hoisted top-level one had not.
- **Fix:** `npm update brace-expansion` **alone** moved it to 1.1.18 immediately. `crit+high` 5 → 4.
- **Why it matters:** `npm update` with many arguments does not reliably move every matching node.
  **This was caught only because the audit set was re-measured after the cluster instead of after the
  whole task.** Had the plan batched its verification, a high advisory with an available in-range fix
  would have been handed to 47-09 as "accepted" on a false premise.
- **Commit:** `ac91d2b`

**3. [Recorded, not fixed] Two of the plan's reach classifications were wrong**
- `nanoid` was classified BUILD and `fast-uri` DEV; both appear in the BEFORE `--omit=dev` set and
  carry no `dev` flag in the lockfile, so both are RUNTIME. Both are fixed anyway. Recorded in the
  reconciliation section above rather than silently corrected, per T-47-07-05.

### Not deviations — decisions honoured as written

- `next` and `sharp` untouched → **47-08**. `nodemailer` untouched → **47-09**.
- `vite` / `vitest` not re-handled; confirmed already clear.
- `npm audit fix` never run. No forbidden dependency added. `audit-ci` / `better-npm-audit` not
  installed; nothing pre-installed for 47-09's evaluator.
- No `--legacy-peer-deps`, no `--force`.
- No Docker rebuild (47-08 owns it).

---

## Handoff to 47-09 and 47-10 — the undefended `overrides.vite` (D-47-01-A)

**Carried forward unresolved.** Verified again today:

```
package.json overrides = {"vite":"^7.0.0"}
lockfile has an "overrides" key? false
resolved vite = 7.3.6
```

npm still does not persist `overrides` into `package-lock.json`, so the lockfile does not
self-document the constraint and **nothing in the repo fails if a future edit deletes those three
lines.** This plan touched `package.json` (three dependency ranges) and **did not disturb the
`overrides` block** — confirmed above.

**47-09 or 47-10 must gate it.** The suggested one-liner still stands: in the offline policy test,
assert `pkg.overrides.vite` exists and `semver.subset(pkg.overrides.vite, "<8")`. Zero new
dependencies (`semver` is already a devDependency). And per the standing v1.4 rule, that assertion
must be observed **red** with the override deleted before it is trusted.

## Threat Flags

None. This plan introduced no new network endpoint, auth path, file-access pattern or schema change.
Every change is a version raise of an already-declared dependency; the trust boundaries are exactly
the three the plan's `<threat_model>` names, and the register's dispositions were all discharged:

| Threat ID | Disposition | Outcome |
|---|---|---|
| T-47-07-01 | mitigate | `drizzle-orm@0.45.2` installed FIRST, `GHSA-gpj5-g38j-94v9` gone, 715 mutation/db/execution tests green before anything else moved |
| T-47-07-02 | mitigate | trio on fixed versions, `@auth/core@0.41.3` asserted from the lockfile with `semver.gte`, critical count **3 → 0** |
| T-47-07-03 | mitigate | 5 per-cluster set differences recorded, added-key diff = 3 (all axios proxy deps), FORBIDDEN-SET additions **0**, no `vite` ≥ 8 |
| T-47-07-04 | mitigate | `fast-xml-parser` **absent** from the lockfile — assumption A5 confirmed by installing |
| T-47-07-05 | mitigate | `--omit=dev` reconciled both before and after; **2 plan classifications falsified and recorded**; 0 DEV-only residuals |
| T-47-07-06 | mitigate (partial) | top-level `postcss` → 8.5.26; nested `8.4.31` recorded as NOT fixed, with the exact-pin reason, and handed to 47-08 |
| T-47-07-SC | mitigate | no new package; `slopcheck scan` (read-only) run and recorded; `slopcheck install` not used; tree unmutated by the scan |

---

## Self-Check: PASSED

```
FOUND: .planning/phases/47-suite-trust-supply-chain/47-07-SUMMARY.md
FOUND: .planning/phases/47-suite-trust-supply-chain/deferred-items.md
FOUND: package.json
FOUND: package-lock.json
FOUND commit: 2d92bfd  FOUND commit: 1d37f88  FOUND commit: 14dd85b
FOUND commit: 048e2a6  FOUND commit: ac91d2b

PASS: must_haves artifact — package.json contains "drizzle-orm"
PASS: must_haves key_link — package.json contains "@auth/drizzle-adapter"
PASS: must_haves artifact — package-lock.json contains node_modules/drizzle-orm
PASS: overrides.vite intact ("^7.0.0")
PASS: lock drizzle-orm >= 0.45.2
PASS: lock @auth/core >= 0.41.3
PASS: fast-xml-parser absent from package-lock.json
```

---

## State bookkeeping — two corrections applied

Both are recorded rather than silently fixed, because both were false-green mechanisms.

**1. `requirements mark-complete SEC-05` was REVERTED.**
The handler set the checkbox to `[x]` and the traceability row to `Complete`. That is false. SEC-05
reads *"The committed lockfile's advisories are triaged, **and CI has a stated audit policy**."* This
plan discharged 20 dispositions as `upgraded` and **enumerated** the residual four — it disposed of
none of them, and it wrote no policy document and no CI gate. `AUDIT-POLICY.md` does not exist;
nothing in `.github/workflows/ci.yml` fails on an advisory. Restored to `- [ ]` and `In Progress`.

**2. `state advance-plan` mis-read the phase as 46 and flipped the milestone to `verifying`.**
It reported `{"reason":"last_plan","current_plan":6,"total_plans":6,"status":"ready_for_verification"}`
because STATE.md's trailing footer still read `Phase: 46 … Plan: 6 of 6` — stale since Phase 46
closed. Phase 47 has **13** plans and 6 remain (08-13). Corrected:

- `status:` back to `executing` (the handler had set `verifying`)
- frontmatter `percent:` 11 → **58** (the handler updated the progress bar to 58% but left the
  frontmatter field at its old value)
- footer to `Phase: 47 (Suite Trust & Supply Chain) — EXECUTING / Plan: 5 of 13 complete (01, 02, 03,
  04, 07)`
- the body heading `Phase 47 is EXECUTING — plan 01 of 13 done` → `plans 01, 02, 03, 04 and 07 of 13
  done`

`roadmap update-plan-progress 47` independently agrees: `{"plan_count":13,"summary_count":5,
"status":"In Progress","complete":false}`.

`state record-session` returned `{"recorded":false,"reason":"No session fields found in STATE.md"}` —
STATE.md has a `## Session Log` bullet list rather than the `Last session` / `Stopped At` fields the
handler expects. A dated bullet was appended by hand instead. Pre-existing shape mismatch, not
introduced here.
