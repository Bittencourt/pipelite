---
phase: 47-suite-trust-supply-chain
plan: 08
subsystem: supply-chain
tags: [npm-audit, next, sharp, engines-node, docker-rebuild, lockfile, semver, container-proof]

# Dependency graph
requires:
  - phase: 47-suite-trust-supply-chain
    plan: 07
    provides: "the 15 runtime-tree version changes that made this plan's rebuild load-bearing, and the residual crit+high set of exactly 4 (next, nodemailer, postcss, sharp) this plan was to reduce to 1"
  - phase: 46-migration-chain-toolchain-floor
    plan: 06
    provides: "the before/after container proof shape (image ID + bound .Image + the running process's own version), and the node-engines-floor gate this plan's bump collides with"
provides:
  - "THE REBUILD IS PAID. The running container now carries all 15 of 47-07's runtime bumps, proved from inside the container: drizzle-orm 0.45.1 -> 0.45.2 (SQL-identifier injection) and @auth/core 0.41.1 -> 0.41.3 (all three criticals) are LIVE for the first time"
  - "fast-xml-parser and strnum confirmed ABSENT from the running image — 47-07's removal reached the container, not just the lockfile"
  - "a MEASURED verdict on next 16.3.2: it clears exactly [next, postcss, sharp], joins NOTHING at any severity, and takes the audit from 14 -> 11 (4 high -> 1 high, leaving only nodemailer/47-09)"
  - "the exact, reproduced reason next 16.3.2 cannot land inside this plan: next@16.3.2 declares sharp ^0.35.3, and EVERY sharp 0.35.x caps @img/sharp-win32-ia32 at engines.node ^20.9.0, which the Phase 46 node-engines-floor gate reads platform-blind and rejects against the >=24.12.0 floor"
  - "a de-risked, fully-specified split recommendation: the follow-up needs a platform-applicability filter in nodeFloorViolations, and the NC-3 control is PROVED to survive that filter (so the fix is a scope correction, not a new vacuity)"
  - "a clean revert: working tree byte-identical to HEAD, audit set identical, nothing joined, vite still 7.3.6 < 8"
affects: [47-09, 47-10, 47-11, 47-12, 47-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "`npm install --package-lock-only` in a scratch copy to audit a candidate upgrade WITHOUT installing it or touching the repo — this is how the post-bump advisory set was measured after the bump had already been reverted"
    - "prove a rebuild by asking the RUNNING container for its own dependency versions (`require('/app/node_modules/<pkg>/package.json').version`), not by reading the manifest that was built from — this is what made 47-07's claim checkable"
    - "`docker compose build` then `docker compose up -d` as SEPARATE steps, because the gap between them is itself evidence: the build succeeded while the container was demonstrably still bound to the old image"
    - "when an in-repo gate blocks a security bump, compute what a corrected gate WOULD report and prove the gate's own negative control survives the correction — that converts 'revert and give up' into a specified, de-risked follow-up"

key-files:
  created: []
  modified: []

key-decisions:
  - "REVERTED next/eslint-config-next 16.3.2 per the plan's STOP CONDITION rather than editing src/lib/__tests__/node-engines-floor.test.ts, which is outside this plan's files_modified and would have meant weakening an assertion to accommodate a bump"
  - "Ran Task 2's rebuild anyway on the reverted tree, because 47-07's 15 runtime bumps were still absent from the container — the plan explicitly required this and it was the single highest-value action available"
  - "Did NOT take the available workaround of overriding sharp back to 0.34.x to keep next 16.3.2: it violates next's own declared ^0.35.3 range and deliberately re-opens a fixed advisory. Recorded as an option for the follow-up, not exercised here"
  - "Did NOT mark SEC-05 complete. It remains In Progress: this plan's remediation was reverted and 47-09 still owns the policy and allowlist"

patterns-established:
  - "A gate that walks lockfile metadata must be scoped to the platforms the project actually builds for, or an optional binary for a platform that cannot run the pinned Node will block an unrelated security upgrade"

requirements-completed: []

# Metrics
duration: 22min
completed: 2026-08-25
---

# Phase 47 Plan 08: The `next` Bump and the Single Rebuild — Summary

**The rebuild is paid and proved — `drizzle-orm@0.45.2` and `@auth/core@0.41.3` are running in the container for the first time — and `next@16.3.2` is cleanly REVERTED, blocked not by the framework but by a Windows-32-bit optional binary whose capped `engines.node` the Phase 46 floor gate reads platform-blind.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-25T10:33Z
- **Completed:** 2026-08-25T10:55Z
- **Tasks:** 2 of 3 executed (Task 3 is the human checkpoint, delegated to the orchestrator)
- **Files modified:** 0 (the bump was reverted; the working tree is byte-identical to HEAD)

## Accomplishments

- **Paid the phase's load-bearing rebuild and proved it behaviourally.** Image ID moved, the container's bound `.Image` followed it, and the running container's own `node_modules` now report all 15 of 47-07's runtime bumps.
- **Measured, rather than assumed, what `next@16.3.2` does to the audit** — and it does exactly what 47-RESEARCH predicted: clears `next`, `postcss` and `sharp`, joins nothing.
- **Found and reproduced the precise blocker**, which is not in Next at all, and specified the follow-up down to the function that needs changing, including proof that the fix does not make the gate vacuous.

## Task Commits

**No code commits. This plan changed no files.**

| Task | Name | Commit | Why |
|---|---|---|---|
| 1 | Bump next + eslint-config-next to 16.3.2 | *(none — reverted)* | Host gate went red; reverted per STOP CONDITION. Tree byte-identical to HEAD. |
| 2 | Rebuild the image and prove it healthy | *(none — no files)* | Pure verification task; the plan declares `<files></files>`. Its artifact is the evidence below. |
| 3 | CHECKPOINT — human authenticated render | *(none)* | Delegated to the orchestrator, which drives a real browser. See "What a human still must verify". |

**Plan metadata:** see the `docs(47-08)` commit carrying this SUMMARY.

---

## TASK 1 — the bump, and why it was reverted

### It installed cleanly and every lockfile assertion passed

`npm install --save-exact next@16.3.2 eslint-config-next@16.3.2` → exit 0, `added 1 package, removed 3 packages, changed 12 packages`. `--save-exact` was used deliberately so the two pins stayed EXACT and in lockstep, matching the convention already in the manifest; no caret was introduced.

```
package.json  next               = "16.3.2"   exact? true
package.json  eslint-config-next = "16.3.2"   exact? true
package.json  overrides          = {"vite":"^7.0.0"}   (UNTOUCHED — D-47-01-A respected)
```

Read back from the LOCKFILE and asserted with `semver`:

| Lockfile key | Before | After | Assertion |
|---|---|---|---|
| `node_modules/next` | 16.1.6 | **16.3.2** | `semver.eq(v,"16.3.2")` → **true** |
| `node_modules/eslint-config-next` | 16.1.6 | **16.3.2** | `semver.eq(v,"16.3.2")` → **true** |
| `node_modules/next/node_modules/postcss` | **8.4.31** | **8.5.23** | no longer 8.4.31 → **true** (vulnerable range `<=8.5.22`, so 8.5.23 is exactly the fix) |
| `node_modules/postcss` (top-level, `[dev]`) | 8.5.26 | 8.5.26 | unchanged, already fixed by 47-07 |
| `node_modules/sharp` | **0.34.5** | **0.35.3** | off `0.34.x` → **true** (vulnerable range `<0.35.0`) |
| `node_modules/vite` | 7.3.6 | **7.3.6** | `semver.lt(v,"8.0.0")` → **true** — **the `overrides.vite` block held** |
| `node_modules/rolldown` | ABSENT | **ABSENT** | the `npm audit fix` forbidden-set signature stayed absent |
| `node_modules/tsx` | ABSENT | **ABSENT** | same |
| `node_modules/esbuild` | 0.25.12 | 0.25.12 | pre-existing (D-47-01-B), unchanged — verified against the backed-up before-lockfile, not assumed |

**Both transitive claims the plan asked me to confirm from the lockfile HELD.** The nested `postcss` and `sharp` both moved. Neither had to be handed on unfixed.

### Host gates, in order

| Gate | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm run lint` (via `./node_modules/.bin/eslint`) | **exit 0 — 124 problems (0 errors, 124 warnings)**. Gated on errors, per the hard rule; the warning total is exactly the baseline. |
| `vitest run` (base project) | **RED — 2 failed / 4843 passed / 32 skipped** |
| `vitest run --config vitest.rsc.config.ts` | **exit 0 — 8/8 passed** (run on the BUMPED tree, deliberately, to establish nothing else was broken) |

So the bump is type-clean, lint-clean, and RSC-clean. Exactly one file went red.

### The failure, verbatim

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/__tests__/node-engines-floor.test.ts > NC-3: the checker can produce a red > reports none for 24.12.0, so the control distinguishes the two cases
AssertionError: expected [ { …(2) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "pkg": "@img/sharp-win32-ia32",
+     "range": "^20.9.0",
+   },
+ ]

 ❯ src/lib/__tests__/node-engines-floor.test.ts:335:44

 FAIL  src/lib/__tests__/node-engines-floor.test.ts > the declared Node floor binds the lockfile to the image and to CI > the declared floor's own minimum satisfies every range the lockfile declares
AssertionError: package.json engines.node is ">=24.12.0" (minimum 24.12.0), which does not satisfy every engines.node range in package-lock.json. Raise the declared floor and all three Dockerfile pins together.: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "@img/sharp-win32-ia32 requires ^20.9.0",
+ ]

 ❯ src/lib/__tests__/node-engines-floor.test.ts:379:7
```

Two assertions, **one root cause**.

### Root cause, established from the lockfile entries themselves

The offending package's own metadata, before and after:

```
BEFORE  @img/sharp-win32-ia32@0.34.5
        engines.node = "^18.17.0 || ^20.3.0 || >=21.0.0"    <- satisfied by Node 24
        os = ["win32"]   cpu = ["ia32"]   optional = true

AFTER   @img/sharp-win32-ia32@0.35.3
        engines.node = "^20.9.0"                            <- CAPPED at <21. Node 24 FAILS it.
        os = ["win32"]   cpu = ["ia32"]   optional = true
```

`^20.9.0` means `>=20.9.0 <21.0.0`. sharp caps it there because Node stopped shipping 32-bit Windows builds after Node 20 — so Node 20 genuinely is the last runtime that can load a `win32-ia32` native addon. **sharp's declaration is correct.** The gate is simply platform-blind: it walks every `engines.node` range in the lockfile without regard to whether the entry's `os`/`cpu` make it installable on the platforms this project builds for (linux/x64 glibc and musl). npm records all optional platform variants in the lockfile regardless of host, so a Windows-only binary that will never be installed here still enters the walk.

### The implication chain is structural, not incidental

I checked each link rather than inferring it:

```
npm view next@16.1.6 optionalDependencies.sharp  ->  ^0.34.4
npm view next@16.3.2 optionalDependencies.sharp  ->  ^0.35.3     <- FORCED
npm view next@16.3.2 dependencies.postcss        ->  8.5.23      (exact pin again, but above the fix line)

@img/sharp-win32-ia32@0.35.0 engines.node = ^20.9.0
@img/sharp-win32-ia32@0.35.1 engines.node = ^20.9.0
@img/sharp-win32-ia32@0.35.2 engines.node = ^20.9.0
@img/sharp-win32-ia32@0.35.3 engines.node = ^20.9.0
```

`next@16.3.2` ⟹ `sharp >= 0.35.3` ⟹ `@img/sharp-win32-ia32` capped at `^20.9.0` ⟹ the floor gate goes red. **Every** sharp `0.35.x` caps it, and `sharp >= 0.35.0` is required to clear the advisory (`<0.35.0`). There is no version of sharp that both fixes the advisory and keeps an uncapped `win32-ia32` range. The collision is unavoidable inside this plan's `files_modified` of `package.json` + `package-lock.json`.

### Why I reverted instead of fixing the gate

Fixing this needs an edit to `src/lib/__tests__/node-engines-floor.test.ts` — a file outside this plan's declared `files_modified`, and an **assertion**, which the plan forbids touching to accommodate the bump ("do NOT patch around it, do NOT weaken an assertion"). 47-CONTEXT reserved exactly this outcome: the `next` bump is *"splittable to a follow-up if it needs code changes."* It needs a code change. So it splits.

No `--force`, no `--legacy-peer-deps`, no skipped test, no weakened assertion, no `npm audit fix`.

### The revert is exact

```
$ git checkout -- package.json package-lock.json && npm ci
added 1101 packages, and audited 1102 packages in 33s
14 vulnerabilities (3 low, 7 moderate, 4 high)

$ git diff --stat HEAD      -> (empty)
$ git status --short        -> (empty)
```

And re-gated on the reverted tree, which proves the two failures were attributable to the bump and to nothing else:

| Gate | Reverted tree |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 — **0 errors**, 124 warnings |
| `vitest run` (base) | exit 0 — **171 files passed / 2 skipped; 4845 passed / 32 skipped** — the exact 47-07 baseline restored |
| `vitest run --config vitest.rsc.config.ts` | exit 0 — **8/8** |

Advisory set after the revert, compared to before I started:

```
BEFORE crit+high: ["next","nodemailer","postcss","sharp"]
AFTER-REVERT    : ["next","nodemailer","postcss","sharp"]
identical ? true
JOINED (in after, not before): []
metadata before: {"info":0,"low":3,"moderate":7,"high":4,"critical":0,"total":14}
metadata after : {"info":0,"low":3,"moderate":7,"high":4,"critical":0,"total":14}
```

**Nothing joined. Nothing was left behind. `vite` is 7.3.6, still `< 8`.**

### The critical/high set difference the bump WOULD deliver — measured, not projected

The bump was already reverted when I needed this number, and I did not want to report an inference drawn from `npm install`'s summary line. So I resolved the candidate lockfile in a scratch copy with `npm install --package-lock-only` (which writes a lockfile without installing anything and without touching the repo) and audited that:

```
metadata BEFORE (next 16.1.6): {"info":0,"low":3,"moderate":7,"high":4,"critical":0,"total":14}
metadata AFTER  (next 16.3.2): {"info":0,"low":3,"moderate":7,"high":1,"critical":0,"total":11}

crit+high BEFORE: ["next","nodemailer","postcss","sharp"]
crit+high AFTER : ["nodemailer"]

CLEARED by the bump (in BEFORE, not AFTER): ["next","postcss","sharp"]
JOINED  by the bump (in AFTER, not BEFORE): []

ALL-SEVERITY cleared: ["next@high","postcss@high","sharp@high"]
ALL-SEVERITY joined : []
```

**`next` leaves the set, and so do `postcss` and `sharp` — all three of 47-08's owned residuals, in one bump, with nothing joining at any severity.** The remaining single high is `nodemailer`, which is 47-09's accept-with-reason. This is the prize the split is protecting, and it is worth taking.

---

## PHASE SPLIT RECOMMENDED

**Recommendation: `next` 16.1.6 → 16.3.2 becomes its own follow-up phase, and its scope is one function plus one control.**

The framework bump itself is sound: typecheck clean, lint clean, RSC 8/8, and 4843 of 4845 base tests passing with the only two failures being the same platform-blind metadata assertion. What blocks it is an in-repo gate's scope, not Next.

### What the follow-up must change

`nodeFloorViolations` in `src/lib/__tests__/node-engines-floor.test.ts` must skip lockfile entries whose `os`/`cpu` exclude every platform this project builds for. Measured on both trees:

```
=== REVERTED (next 16.1.6) ===
  declared engines.node ranges walked: 834
  violations at floor 24.12.0 (current gate, platform-blind): 0
  violations that are INSTALLABLE on linux/x64 (platform-aware): 0

=== BUMPED   (next 16.3.2) ===
  declared engines.node ranges walked: 836
  violations at floor 24.12.0 (current gate, platform-blind): 1
      node_modules/@img/sharp-win32-ia32  requires ^20.9.0   os=["win32"] cpu=["ia32"] optional=true
  violations that are INSTALLABLE on linux/x64 (platform-aware): 0
```

### And the follow-up must prove the filter is not a new vacuity

This is the part that matters in a phase built to delete vacuous gates. A careless applicability filter could silently swallow a REAL violation. It does not, and here is the proof: NC-3's binding control package survives the filter and stays red at 20.20.2.

```
NC-3 control package @napi-rs/lzma-linux-x64-gnu:
  engines.node = ^22.20 || ^24.12 || >=25
  os  = ["linux"]
  cpu = ["x64"]
  survives a linux/x64 applicability filter ? true
  still violated at 20.20.2 ? true
```

So the correction narrows the gate to exactly the entries that can be installed, while leaving every assertion that ever fired still able to fire. The follow-up should additionally add its own negative control — a fixture entry with `os:["win32"]` and an impossible range, asserted **skipped**, alongside an `os:["linux"]` entry with the same range asserted **reported** — so the filter itself has a proof it works in both directions.

### An alternative the follow-up should consider and probably reject

`next@16.3.2` could be landed today with no gate change by adding `overrides: { "sharp": "0.34.5" }`. I did **not** do this. It contradicts `next`'s own declared `^0.35.3` range, and it deliberately re-opens `GHSA-f88m-g3jw-g9cj` to close a reporting problem — trading a fixed advisory for an open one, which is the exact move 47-CONTEXT prohibits. Recorded so the follow-up does not have to rediscover it. 47-07's measurement that `next/image` is imported in **0** files does make sharp's reach narrow, but "narrow" is not a reason to un-fix something that is already fixed.

---

## TASK 2 — the rebuild, and what the running container says

This ran on the **reverted** tree, so its verdict covers **47-07's runtime bumps alone**, not `next`. That is the case the plan anticipated, and it is the reason the rebuild was required regardless of Task 1's outcome.

### Before / after

| Dimension | BEFORE | AFTER |
|---|---|---|
| `docker image inspect pipelite-app` `.Id` | `sha256:48b96371d858fd5dbfc1ae7a3f023453a96593556eb0251ecea747caa50e81ca` | **`sha256:8f07a18eddad0cdb377e6b3b96fa9a9fe531fe42a943d380c9be05b7fa2b6f58`** |
| image `.Created` | `2026-08-25T01:20:46.856578386-03:00` | **`2026-08-25T07:47:08.621403514-03:00`** |
| container `pipelite-app-1` bound `.Image` | `sha256:48b96371…e81ca` | **`sha256:8f07a18e…b6f58`** — equals the new image |
| container `.Created` | `2026-08-25T04:22:26.777481972Z` | **`2026-08-25T10:48:49.398841766Z`** |
| `docker compose exec -T app node -v` | `v24.19.0` | `v24.19.0` (unchanged, and correct — no Node pin moved this plan) |
| Next version reported by the RUNNING process | `▲ Next.js 16.1.6` | `▲ Next.js 16.1.6` — **16.1.6 as expected, because Task 1 reverted** |

**The image ID changed and the container's bound `.Image` followed it.** A `docker compose restart` could not have produced either.

### The build log is NOT the proof — and this run demonstrated exactly why

I ran `docker compose build app` and `docker compose up -d` as two separate steps. Between them:

```
$ docker compose build app                       -> exit 0
$ docker image inspect pipelite-app --format '{{.Id}}'
sha256:8f07a18eddad0cdb377e6b3b96fa9a9fe531fe42a943d380c9be05b7fa2b6f58   <- NEW image exists
$ docker inspect --format '{{.Image}}' pipelite-app-1
sha256:48b96371d858fd5dbfc1ae7a3f023453a96593556eb0251ecea747caa50e81ca   <- container STILL on the OLD one
```

A successful build, a new image on disk, and a container still serving pre-phase code. That gap is the whole reason a build log cannot be the evidence. Separately, this environment's shell hook **compressed the build log to 186 bytes** — it is not even readable as a narrative, which makes the point moot in practice as well as in principle.

Then `docker compose up -d`, quoting the lines that matter:

```
 Container pipelite-postgres-1 Running
 Container pipelite-mailhog-1 Running
 Container pipelite-app-1 Recreate
 Container pipelite-app-1 Recreated
 Container pipelite-postgres-1 Waiting
 Container pipelite-postgres-1 Healthy
 Container pipelite-app-1 Starting
 Container pipelite-app-1 Started
```

**`Recreate` / `Recreated`** — recreated, not restarted. `postgres` and `mailhog` were left `Running` and untouched.

**Pulled or cached:** the base layers were served from the **local store, not pulled.** `node:24-alpine` has been resident since `2026-08-03T20:26:09Z` (`sha256:d32cdf61…`, matching its `RepoDigest`), well before the previous image was built from it. No registry fetch of the base occurred during this build.

### What the RUNNING container reports about its own dependencies

This is the load-bearing measurement, read from inside the container rather than from the manifest it was built from. All 15 of 47-07's runtime-reachable changes, plus the two removals:

| Package | Container BEFORE | Container AFTER | 47-07 expected |
|---|---|---|---|
| **`drizzle-orm`** | **0.45.1** | **0.45.2** | 0.45.2 — the **SQL-identifier-injection fix**, now live |
| **`@auth/core`** | **0.41.1** | **0.41.3** | 0.41.3 — **all three criticals**, now live |
| **`next-auth`** | **5.0.0-beta.30** | **5.0.0-beta.32** | beta.32 |
| `@auth/drizzle-adapter` | 1.11.1 | 1.11.3 | 1.11.3 |
| `axios` | 1.13.6 | 1.19.0 | 1.19.0 |
| `lodash` | 4.17.23 | 4.18.1 | 4.18.1 |
| `lodash-es` | — | 4.18.1 | 4.18.1 |
| `oauth4webapi` | 3.8.5 | 3.8.7 | 3.8.7 |
| `nanoid` | 3.3.11 | 3.3.18 | 3.3.18 |
| `@aws-sdk/xml-builder` | — | 3.972.40 | 3.972.40 |
| `@smithy/types` | — | 4.17.2 | 4.17.2 |
| `fast-uri` | — | 3.1.6 | 3.1.6 |
| `follow-redirects` | — | 1.16.0 | 1.16.0 |
| `form-data` | — | 4.0.6 | 4.0.6 |
| `hasown` | — | 2.0.4 | 2.0.4 |
| `postcss` | 8.5.6 | 8.5.26 | 8.5.26 |
| `next` | 16.1.6 | 16.1.6 | unchanged (Task 1 reverted) |
| `sharp` | 0.34.5 | 0.34.5 | unchanged (moves only with `next`) |
| **`fast-xml-parser`** | present | **ABSENT** | removed entirely |
| **`strnum`** | present | **ABSENT** | removed entirely |

**Every version 47-07 predicted, confirmed from inside the running container.** 47-07's central claim — *"the SQL-injection fix and all three critical auth fixes are not yet in the container"* — was true before this rebuild and is now false. It is also worth recording that `Dockerfile:24`'s `npm install --legacy-peer-deps` (rather than `npm ci`) did in fact resolve to the lockfile's versions here; the deferred `npm ci` conversion remains a real gap, but it did not bite on this build.

`@auth/core` also confirmed **deduped to exactly one copy** inside the image — `find /app/node_modules -type d -name core -path "*@auth*"` returns the single path `/app/node_modules/@auth/core`, so 47-07's dedupe reached the container too.

### `/api/health` — full body verbatim

```json
{"status":"ok","db":{"ok":true,"latencyMs":1},"processors":{"webhook-processor":{"alive":true,"lastTickAt":"2026-08-25T10:49:03.726Z"},"email-processor":{"alive":true,"lastTickAt":"2026-08-25T10:49:13.592Z"},"schedule-processor":{"alive":true,"lastTickAt":"2026-08-25T10:49:08.674Z"},"execution-processor":{"alive":true,"lastTickAt":"2026-08-25T10:49:13.838Z"},"audit-prune":{"alive":true,"lastTickAt":null},"trash-prune":{"alive":true,"lastTickAt":null},"webhook-subscriber":{"alive":true,"lastTickAt":null},"workflow-trigger-subscriber":{"alive":true,"lastTickAt":null},"stage-history-subscriber":{"alive":true,"lastTickAt":null},"audit-subscriber":{"alive":true,"lastTickAt":null}}}
```

Parsed verdict:

| Field | Value |
|---|---|
| HTTP | **200** |
| `status` | `"ok"` |
| `db.ok` | **`true`** |
| `db.latencyMs` | `1` |
| processor count | **10** |
| alive count | **10** |
| not alive | **none** |

All ten expected processors are present by name and all ten are `alive`. The plan's automated assertion passed: `health ok: 10/10 processors alive, db.latencyMs 1`.

**On 503s — the honest answer.** I used `--retry 30 --retry-delay 4 --retry-all-errors --retry-connrefused`, which by design would have masked a transient 503. The request returned promptly and I therefore believe no retry engaged, but `curl -w` does not expose the attempt count, so **I cannot prove from that single call alone that the first attempt was the 200.** What I can state as measured: five immediate follow-up probes all returned 200 (`probe1=200 probe2=200 probe3=200 probe4=200 probe5=200`), and the container log shows a clean boot with no error. If a 503 occurred at all it was confined to the first seconds of startup.

### Startup log — clean, and the Next version self-reported

```
[✓] migrations applied successfully!Starting application...
▲ Next.js 16.1.6
- Local:         http://localhost:3000
- Network:       http://0.0.0.0:3000
✓ Starting...
{"level":"info","scope":"sentry","msg":"SENTRY_DSN unset — error tracking disabled, SDK not loaded",...}
✓ Ready in 271ms
{"level":"info","scope":"webhook-processor","msg":"Starting",...,"initialDelayMs":5000}
{"level":"info","scope":"email-processor","msg":"Starting",...,"initialDelayMs":15000}
{"level":"info","scope":"dedup-scan-cleanup","msg":"Done",...,"strandedMarkedError":0,"idleDeleted":0,"expiredDeleted":0}
{"level":"info","scope":"schedule-processor","msg":"Starting",...,"initialDelayMs":10000}
{"level":"info","scope":"execution-processor","msg":"Starting",...,"initialDelayMs":5000}
{"level":"info","scope":"audit-prune","msg":"Starting",...}
{"level":"info","scope":"trash-prune","msg":"Starting",...}
```

Note per the hard rule: the `Starting` lines above are **not** offered as freshness evidence. The freshness evidence is the changed image ID, the container's bound `.Image`, and the in-container dependency versions in the table above. `▲ Next.js 16.1.6` is included because it is the *running process* reporting its own framework version, which is the 46-06 proof shape — and here it correctly reports the reverted version.

**The container entrypoint ran `drizzle-kit migrate` on boot**, as it always does. It was a no-op: the only output was `NOTICE: schema "drizzle" already exists, skipping` and `NOTICE: relation "__drizzle_migrations" already exists, skipping`, then `migrations applied successfully!`. I issued no DDL myself and no `drizzle-kit push`. The unchanged table count below confirms nothing was created.

### Stack and live data intact

```
$ docker compose ps
pipelite-app-1      (pipelite-app)       Up 26 seconds        [3001]
pipelite-mailhog-1  (mailhog:latest)     Up 2 weeks           [1025, 8025]
pipelite-postgres-1 (postgres:16-alpine) Up 2 weeks (healthy) [5433]
```

App recreated (26 s); `postgres` and `mailhog` untouched at 2 weeks; postgres **healthy**.

Read-only row counts, before and after the rebuild, against 46-06's recorded figures:

```
select (select count(*) from information_schema.tables where table_schema='public')
     , (select count(*) from organizations), (select count(*) from people)
     , (select count(*) from deals), (select count(*) from users)

BEFORE rebuild : 36|46054|38348|25195|10
AFTER  rebuild : 36|46054|38348|25195|10
46-06 recorded : 36|46054|38348|25195|10
```

**Identical on all three.** 36 tables, 46,054 organizations, 38,348 people, 25,195 deals, 10 users. No DDL, no write.

**Secrets:** no `sudo` was used anywhere (`docker` needs none here). No `.env` value was read, echoed or passed on a command line. The row-count query was issued as `docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" …'` with **single** quotes, so the variables expanded inside the container from its own environment and never appeared in my command line or in this document.

---

## TASK 3 — the human checkpoint: NOT performed by me

The orchestrator retained this checkpoint and will drive a real browser itself, so I did not block on it. The stack is **up and healthy** and ready for that (verified immediately before finishing: `docker compose ps` all up, `/api/health` 200).

### What a human still must verify — and what I could not

**Important framing:** because Task 1 reverted, the authenticated render is no longer gating assumption A3 (`next` 16.3.2 behaviour-preserving). `next` is unchanged at 16.1.6. What the render now gates is **47-07's runtime bumps**, which reached the container for the first time in this rebuild — above all the **Auth.js trio** (`@auth/core` 0.41.1→0.41.3, `next-auth` beta.30→beta.32, `@auth/drizzle-adapter` 1.11.1→1.11.3) and **`drizzle-orm` 0.45.1→0.45.2**. Those sit directly in the sign-in and query paths and have never served a request until now. That makes this check *more* valuable than the plan anticipated, not less.

**Surfaces I could not verify, and why:**

| Surface | Why automation could not settle it | What to look for |
|---|---|---|
| **Sign-in itself** | I will not guess or handle a credential. This is the single highest-value check: `@auth/core` and `next-auth` both moved in this image. | You reach an authenticated session at all. A sign-in that fails or loops is the failure mode the Auth.js bump could plausibly cause. |
| **`/deals` kanban** | Needs a session. | The board renders **real data** — ~25,195 deals, with *Base Fria - Lead* ~3,466 and *Base Fria - Parceiro* ~288. Zero deals, or an error boundary, is a FAILURE. |
| **Drag a deal between stages, then reload** | Needs a session and a real pointer gesture. `@dnd-kit`'s PointerSensor uses an activation constraint, so a synthetic move-and-up does not start a drag. | It lands **and persists after reload**. This is the one write path that exercises the bumped `drizzle-orm` through a server action + CRM event. |
| **`/organizations`** | Needs a session. | The table renders against the ~46,054-organization dataset. |
| **`/admin/audit`** | Needs a session **with admin authorization** — this is the one that confirms the Auth.js bump did not change the *authorization* result, not just authentication. | The audit timeline renders. |
| **Browser console** | No browser. | Any **application** error. MetaMask-style extension warnings are noise — 46-06 recorded exactly two and dismissed them. |

**What I did check, explicitly labelled a PARTIAL signal and NOT a substitute** (46-06 recorded this same substitution and labelled it partial; I am not upgrading it):

```
/deals            -> HTTP=307  redirect=http://localhost:3001/login
/deals (followed) -> HTTP=200  final=http://localhost:3001/login
login page: 67,525 bytes, has <form>: true, has password input: true, title: "Authentication"
```

This proves middleware runs, the redirect is correct, and the login page server-renders. **It does not prove a page renders data, and it does not touch authorization or the write path.**

**If the human check fails:** the correct response is *not* to revert the `next` bump — it is already reverted. A failure here would implicate **47-07's runtime bumps**, and the action would be to identify which package and hand it back to 47-07's disposition rather than to this plan.

---

## Deviations from Plan

### 1. [Rule 3 — blocking issue, resolved by the plan's own STOP CONDITION] `next@16.3.2` reverted

Not a deviation so much as the plan's documented alternate path, taken. Recorded in full above with the verbatim failure and a `## PHASE SPLIT RECOMMENDED` section. No assertion weakened, no file outside `files_modified` touched.

### 2. Measured the post-bump audit set in a scratch copy rather than in the repo

The plan asked for the critical/high set difference against `audit-before.json`. I captured the before-audit but not the after-audit JSON before reverting, so the number would have been an inference from `npm install`'s summary line. Rather than report an inference, I reconstructed the candidate lockfile in `/tmp/p47-08/scratch` with `npm install --package-lock-only` and audited that — no install, no repo mutation, and a properly recorded measurement. This is the substantive difference between "1 high remained" and "the remaining high is `nodemailer`, and `next`/`postcss`/`sharp` all left, and nothing joined at any severity".

### 3. Ran `docker compose build` and `docker compose up -d` as two steps

Explicitly permitted by the plan. It turned out to be more than a formality: the gap between the two steps produced the cleanest available demonstration that a successful build does not move the container.

### 4. Extra evidence gathered beyond the plan's asks

- Ran the RSC project on the **bumped** tree (8/8) to establish the bump's blast radius was one file, which is what makes the split recommendation credible.
- Surveyed all four sharp `0.35.x` releases to show the `engines` cap is structural, not a one-release accident.
- Computed what a platform-aware gate would report on both trees, and proved NC-3's control survives the filter — so the follow-up is specified and de-risked rather than merely named.

## Deferred Issues

Nothing new for `deferred-items.md` beyond what the split recommendation covers. Pre-existing items confirmed still standing and untouched: **D-47-01-A** (`overrides.vite` undefended — verified still `^7.0.0` and still holding `vite` at 7.3.6), **D-47-01-B** (`esbuild` moderate at 0.25.12, unchanged), **D-47-01-C** (the `@auth/core` ↔ `nodemailer` peer warning, which `npm ci` emitted again as expected).

## Requirements

**SEC-05 is NOT marked complete and remains In Progress.** This plan's remediation was reverted, so it closed no advisory; and 47-09 still owns the policy document and allowlist that SEC-05 requires. Marking it complete here would be false.

## Known Stubs

None. This plan created and modified no source files.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change was introduced — the plan's net source change is zero.

### Threat register dispositions

| Threat ID | Disposition | Outcome |
|---|---|---|
| T-47-08-01 | mitigate | **NOT mitigated — deferred to the split.** The middleware/proxy-bypass family stays open at `next@16.1.6`. Measured as clearable by the bump; blocked by the engines gate. |
| T-47-08-02 | mitigate | **NOT mitigated — deferred to the split.** Same cause. |
| T-47-08-03 | mitigate | **Mitigated.** Image ID changed, container's bound `.Image` followed, running process's own dependency versions confirm the new tree. `Starting` log lines explicitly not treated as evidence. |
| T-47-08-04 | mitigate | **Partially mitigated.** The unit suite caught a real red and the bump was reverted rather than patched — the intended control behaved correctly. The human render is delegated to the orchestrator and is still owed. |
| T-47-08-05 | mitigate | **Mitigated.** No `sudo`, no `.env` read or echo, no secret on any command line. |
| T-47-08-06 | mitigate | **Mitigated.** No DDL, no write, no `drizzle-kit push`. Row counts identical before/after and to 46-06. |
| T-47-08-07 | accept | Unchanged, and newly informative: the `npm install --legacy-peer-deps` image tree did match the lockfile for all 15 runtime bumps on this build. The `npm ci` conversion stays deferred. |
| T-47-08-SC | mitigate | **Mitigated.** Only two already-declared packages were raised to already-published versions; no new package; `npm audit fix` never run; no `slopcheck install`. |

## Success Criteria

| Criterion | Status |
|---|---|
| Both Next pins at 16.3.2 with host gates green, **or** cleanly reverted with a verbatim failure and a split recommendation | **MET via the revert branch** — verbatim failure and `## PHASE SPLIT RECOMMENDED` recorded |
| Image rebuilt exactly once, proved by image identity **plus** the running process, never by a build log | **MET** |
| `/api/health` 200, `db.ok: true`, 10/10 processors alive | **MET** |
| Residual advisories re-measured; nothing joined; `vite` still `< 8` | **MET** — set identical after revert, nothing joined, `vite` 7.3.6 |
| `npm test`, `npm run typecheck`, `npm run lint` (0 errors) pass | **MET on the committed (reverted) tree** — 4845/32, RSC 8/8, tsc 0, 0 lint errors |
| A human has rendered authenticated pages against the rebuilt image | **NOT MET — owed.** Delegated to the orchestrator; surfaces enumerated above |

## Self-Check: PASSED

- `.planning/phases/47-suite-trust-supply-chain/47-08-SUMMARY.md` — created (this file), 549 lines
- **No source file created or modified.** `git diff --name-only HEAD` filtered of `.planning/` is empty — consistent with the zero task commits reported, and with the revert being exact
- Working tree identical to `HEAD` for all non-`.planning` paths, verified before staging
- Metadata commit `b258900` — carries this SUMMARY, `deferred-items.md` (D-47-08-A, D-47-08-B), `STATE.md`, `ROADMAP.md`. Staged file-by-file with `git add -f` (`.planning` is gitignored-but-tracked); no directory was force-added
- `git diff --diff-filter=D HEAD~1 HEAD` — empty, no file deleted by the commit
- Stack left **UP and healthy** after the commit: `pipelite-app-1`, `pipelite-postgres-1`, `pipelite-mailhog-1` all running; `/api/health` HTTP 200
