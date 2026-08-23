---
phase: 42-observability
plan: 18
subsystem: infra
tags: [eslint, no-console, docker, observability, sentry, healthcheck, turbopack, standalone]

requires:
  - phase: 42-observability plans 01-17
    provides: the logger, the heartbeat registry, /api/health, the Sentry seam, the migrated ~273 call sites
provides:
  - "`no-console: error` in eslint.config.mjs with exactly two files-scoped overrides — criterion 1's durable half"
  - "A repaired container build: the nft dep walk no longer dies on a directory-valued nft entry"
  - "OBS-03 proven in production for the first time: /api/health 200 with ten live workers in a freshly built container"
  - "A6/T-42-20 proven from compiled output: the edge copy of instrumentation.ts is an empty function, zero Sentry bytes in the edge bundle"
  - "The Dockerfile postcondition demonstrated firing (exit 1 + FATAL) on an injected fault"
  - "onRequestError proven to be called by Next on a real unhandled error, with a fully-serialized Error and no header leakage"
affects: [43, any phase adding a log call site, any phase changing instrumentation.ts or the Dockerfile]

tech-stack:
  added: []
  patterns:
    - "Lint gate proven by a reverted violation, never asserted"
    - "Container freshness proven by image digest, not by a boot log line"
    - "Log-stream claims proven by parsing every line and attributing it to an emitter"

key-files:
  created: []
  modified:
    - eslint.config.mjs
    - Dockerfile

key-decisions:
  - "no-console flipped to error with exactly two files-scoped overrides; the only src/ path exempted anywhere is src/lib/log.ts itself"
  - "Exemption 2 widened from the three test globs to e2e/**, drizzle/** and .planning/** — the plan measured the migration surface with an eslint run scoped to src/, but `npm run lint` is bare eslint and walks the whole repo"
  - "The container build was repaired (Dockerfile) despite task 2's no-source-change rule: without a build there is no container and OBS-03 could not be proven at all"
  - "The [Pipedrive API] scope is DEFERRED, not normalized — recommendation recorded, with the census that corrects the premise behind the question"
  - "Gate on lint ERRORS (0), never on the warning total — 124 on the main checkout, 122 in a worktree"

patterns-established:
  - "Emitter attribution: a 'every log line is JSON' claim must classify each line by who printed it, because Next.js prints its own non-JSON error output into the same stream"
  - "Untracked-file lint contamination: .planning holds untracked scratch scripts that fail the repo lint gate and are absent from worktrees"

requirements-completed: [OBS-01, OBS-02, OBS-03]

duration: 62min
completed: 2026-08-23
---

# Phase 42 Plan 18: Flip `no-console` and Prove the Phase in a Container Summary

**`no-console` is now an error with exactly two overrides and a proven bite; and the container check
found that phase 42 had silently broken `docker compose build` — 17 green plans, 4524 passing tests,
zero type errors and zero lint errors, and no image could be produced at all.**

## Performance

- **Duration:** ~62 min
- **Started:** 2026-08-23T22:28Z
- **Completed:** 2026-08-23T23:30Z
- **Tasks:** 2 of 3 complete; task 3 is a blocking human checkpoint, **PENDING**
- **Files modified:** 2 (`eslint.config.mjs`, `Dockerfile`)

## Commits

| Commit | Type | What |
|---|---|---|
| `6bcfb2c` | chore | flip `no-console` to `error` — criterion 1's durable half |
| `a4d315f` | fix | unbreak the container build — nft walk assumed every dep was a file |

---

## Task 1 — the flip

### Pre-flip source scan

The plan's grep produced **6 hits, not the 2 it predicted**:

```
src/app/workflows/[id]/edit/components/config-forms/transform-config.tsx:45   (JSX product copy — must NOT migrate)
src/lib/log.ts:57    (doc comment)
src/lib/log.ts:131   console.error(line)
src/lib/log.ts:132   console.warn(line)
src/lib/log.ts:133   console.debug(line)
src/lib/log.ts:134   console.log(line)
```

The plan's expectation omitted `log.ts`'s own four delegations — which is an error in the
expectation, not a finding: those delegations are the whole reason exemption 1 exists. It correctly
predicted that `src/lib/views/write-guards.ts` would be gone (plan 13 changed it), and it is.

The authoritative census, per STATE.md's "use eslint, not grep":

```
npx eslint --rule '{"no-console":"error"}' src \
  --ignore-pattern '**/*.test.ts'  --ignore-pattern '**/*.test.tsx' \
  --ignore-pattern '**/*.spec.ts'  --ignore-pattern '**/*.spec.tsx' \
  --ignore-pattern '**/__tests__/**' --quiet

src/lib/log.ts  131:26, 132:30, 133:31, 134:8
✖ 4 problems (4 errors, 0 warnings)
```

**4 sites, all inside `src/lib/log.ts`. Zero stragglers** — all ~273 migrated sites confirmed gone.
No disable comment and no extra exemption was needed for anything in `src/`.

### Count gates

| Gate | Result |
|---|---|
| `grep -c '"no-console": "error"' eslint.config.mjs` | **1** |
| `grep -c '"no-console": "off"' eslint.config.mjs` | **2** |
| `grep -c 'files:' eslint.config.mjs` | **2** |
| deleted lines in `git diff eslint.config.mjs` | **0** — `globalIgnores` and all three of its comments byte-identical |

### Lint counts

| | errors | warnings |
|---|---|---|
| baseline before the flip | 0 | 124 |
| **after the flip** | **0** | **124** |

Warnings unchanged and **unchased**. Per carry-forward correction 4 the gate is on errors only:
the warning total reads 124 on the main checkout and 122 in a worktree.

### The negative check (T-42-55) — the rule is proven, not asserted

Added to `src/lib/observability/heartbeat.ts` after `_resetForTesting`:

```js
console.log("TEMPORARY 274th bare console call — negative proof for the no-console gate")
```

```
src/lib/observability/heartbeat.ts
  236:1  error  Unexpected console statement  no-console
✖ 125 problems (1 error, 124 warnings)

eslint exit code: 1        ← it genuinely fails a build, not just prints
```

Reverted. `md5sum` before `7ef751e4233902aca513dafab56d2fdd`, after `7ef751e4233902aca513dafab56d2fdd`;
`git diff --exit-code` clean. Both exemptions are separately proven **reached** rather than
mis-scoped, non-vacuously and without extra probes: `log.ts` holds 4 real `console.*` calls and the
12 test files hold 21, and the whole-tree run reports 0 errors — which is only possible if both
overrides actually apply.

---

## DEVIATION 1 (Rule 3, blocking) — the flip found 19 errors *outside* `src/`

The flip did exactly what the plan built it to do, but not where the plan expected. `src/` was
clean; **`npm run lint` is bare `eslint`, which walks the whole repo**, and the phase's whole
measurement chain (RESEARCH's "273 in 96 non-test files", every wave's census) was scoped to `src/`.
Nothing had ever counted the rest of the tree.

| Location | errors | What they are |
|---|---|---|
| `.planning/phases/38-bulk-operations/38-20-uat-evidence/*.mjs` | 9 | phase-38 UAT scratch scripts |
| `drizzle/seed-activity-types.ts` | 6 | CLI seed, `npm run db:seed-activities` via tsx |
| `e2e/seed-admin.ts`, `e2e/seed-member.ts` | 4 | Playwright fixtures |

All ten sites in tracked files are human-facing terminal output — `console.log("✓ Created activity
type: Call")`, `→ e2e admin already exists, refreshed:`. Emitting those as JSON log lines would
degrade a developer CLI and serve no observability goal; nothing ships a seed script's stdout.
`e2e/**` is squarely what exemption 2 already means, and its globs miss the two seeds only because
they are not named `*.test.ts`.

**Resolution:** folded four non-`src/` paths into exemption 2, whose comment now describes it as
"non-application surfaces" rather than "tests". This keeps **exactly two `files:` overrides** and
respects T-42-56 in substance: the threat is over-broad exemptions carving holes in criterion 1, and
it names three candidate holes (the five client paths, `instrumentation.ts`, `**/*.tsx`) — all inside
`src/`. **The only `src/` path exempted anywhere remains `src/lib/log.ts` itself.** `globalIgnores`
was deliberately left untouched so the warning band stayed at its documented 124.

### Side finding: this pins the 124-vs-122 warning mystery

STATE.md records that four executors each independently proved the 124/122 split was not their
doing, with the cause unpinned. It is `.planning`:

```
git ls-files .planning/phases/38-bulk-operations/38-20-uat-evidence/  →  0
ls            .planning/phases/38-bulk-operations/38-20-uat-evidence/ →  29
```

**Zero of 29 files are tracked.** A worktree contains only tracked files, so the directory is absent
from every executor worktree. It contributes exactly **2 warnings** (`cdp.mjs` no-unused-expressions,
`uat-a.mjs` no-unused-vars) on the main checkout and 0 in a worktree. **124 − 2 = 122.** Cause pinned.

---

## Task 2 — the container

### Freshness, proven by digest rather than by a log line

| | image | created |
|---|---|---|
| before | `sha256:69269b77d44b…` | 2026-08-22T23:03 — **predates every commit in this phase** |
| after | `sha256:c9cd5e477273…` | 2026-08-23T19:47 |

Commands run: **`docker compose build`** then **`docker compose up -d`**. `docker compose restart`
was **NOT** used. `docker inspect pipelite-app-1` confirms the running container is on
`c9cd5e477273`. Postgres and Mailhog were left Running; no volume was touched.

The running container corresponds exactly to HEAD `a4d315f` — the build ran after the Dockerfile
edit and no source changed between build and commit.

### DEVIATION 2 (Rule 1 + Rule 3, blocking) — the build was broken, and this phase broke it

**The first `docker compose build` failed.** Not at the postcondition — past it:

```
Error: EISDIR: illegal operation on a directory, copyfile
  '.next/node_modules/import-in-the-middle-ac114f323ad7e863'
  -> '.next/standalone/.next/node_modules/import-in-the-middle-ac114f323ad7e863'
  errno: -21, code: 'EISDIR', syscall: 'copyfile'
Dockerfile:35 ... did not complete successfully: exit code: 1
```

Root cause: adding `@sentry/nextjs` changed what `instrumentation.js.nft.json` enumerates. It now
lists `../node_modules/import-in-the-middle-<hash>`, which Next emits as a **directory**.
42-03's dep walk called `fs.copyFileSync` on every entry unconditionally, so the first directory
entry aborted the whole `RUN`. `import-in-the-middle` is Sentry's ESM loader hook — so this recurs
for any future dependency Next vendors as a directory.

Fix (`a4d315f`): branch on `fs.statSync(src).isDirectory()` and use `fs.cpSync(…, {recursive:true})`.
After it, `Copied instrumentation dep: ../node_modules/import-in-the-middle-ac114f323ad7e863` appears
in the log and the build exits 0.

**Why this matters more than the fix.** 17 plans reported green. `npm test` 4524 passed, `tsc` 0,
`eslint` 0 errors — and the project could not produce a container image at all, because nothing in
the test suite builds one. That is precisely the vacuous-truth class phase 42 exists to eliminate,
and the container check is the only thing that could have caught it.

Taken against task 2's explicit "no source change in this task". Applied anyway: without a build
there is no container, and OBS-03 — the phase's stated central unproven claim — could not be
observed at all. Kept in a **separate commit** so task 1's lint-flip diff remains the standalone
proof it is designed to be; commit atomicity preserves that property, not the absence of later
commits.

### A1 — `withSentryConfig` is genuinely unnecessary

**Resolved in favour of the unwrapped form.** The build log contains **zero** Sentry warnings. The
only two warnings in the entire build are docker-compose's own:

```
level=warning msg="The \"LOG_LEVEL\" variable is not set. Defaulting to a blank string."
level=warning msg="The \"SENTRY_DSN\" variable is not set. Defaulting to a blank string."
```

which is the correct opt-out default. `next.config.ts` stays untouched; the named fallback
(`withSentryConfig(withNextIntl(nextConfig), { silent: true })`) was **not** applied and is not
needed. The `withSentryConfig/*.js` lines in the log are nft dep copies, not warnings — those
modules are traced because `@sentry/nextjs`'s entry re-exports them.

### The Dockerfile postcondition, demonstrated firing

42-17 listed this as owed: the guard was reasoned about, never fired. Probe Dockerfile with lines
1-20 byte-identical to the real one (so every layer is a cache hit), then an injected fault, then
`Dockerfile:35-38` verbatim:

```dockerfile
RUN rm -f .next/server/instrumentation.js .next/standalone/.next/server/instrumentation.js
```

```
#15 0.308 FATAL: instrumentation.js missing from standalone output
#15 ERROR: process "/bin/sh -c test -f …" did not complete successfully: exit code: 1
PROBE BUILD EXIT=1
```

The guard fires, prints its message, and fails the build. The 2026-08-08 failure mode is now
build-time detectable.

### (a) Status code

```
curl -sS -o /dev/null -w '%{http_code}' localhost:3001/api/health  →  200
```

### (b) Body, verbatim

```json
{
    "status": "ok",
    "db": { "ok": true, "latencyMs": 2 },
    "processors": {
        "webhook-processor":           { "alive": true, "lastTickAt": "2026-08-23T22:50:15.153Z" },
        "email-processor":             { "alive": true, "lastTickAt": "2026-08-23T22:50:25.138Z" },
        "schedule-processor":          { "alive": true, "lastTickAt": "2026-08-23T22:50:20.485Z" },
        "execution-processor":         { "alive": true, "lastTickAt": "2026-08-23T22:50:30.749Z" },
        "audit-prune":                 { "alive": true, "lastTickAt": null },
        "trash-prune":                 { "alive": true, "lastTickAt": null },
        "webhook-subscriber":          { "alive": true, "lastTickAt": null },
        "workflow-trigger-subscriber": { "alive": true, "lastTickAt": null },
        "stage-history-subscriber":    { "alive": true, "lastTickAt": null },
        "audit-subscriber":            { "alive": true, "lastTickAt": null }
    }
}
```

Asserted programmatically, not by eye:

```
status ok · db.ok True · latencyMs 2 (numeric True)
worker count 10 | alive 10
roster match True | missing none | unexpected none
top-level keys  : ['db', 'processors', 'status']
db keys         : ['latencyMs', 'ok']
per-worker keys : ['alive', 'lastTickAt']
forbidden-field substring hits: NONE
```

The ten names match `EXPECTED_WORKERS` exactly — six processors (`webhook-processor`,
`email-processor`, `schedule-processor`, `execution-processor`, `audit-prune`, `trash-prune`) and
four subscribers (`webhook-subscriber`, `workflow-trigger-subscriber`, `stage-history-subscriber`,
`audit-subscriber`).

**T-42-01:** the real serialized body carries **no version string, no hostname, no connection
detail and no count** — checked as a substring scan for `version, hostname, host, connection,
connectionString, count, total, uptime, commit, buildId, env, node` over the whole body: **zero
hits**. The key sets above are exhaustive.

### OBS-03 is proven — and the split-graph fingerprint is absent

This is the phase's central unproven claim, and it now holds in production. All ten workers report
`alive: true`, which means **the route reads the same `globalThis` registry the processors write
to**, across A2's four-instance Turbopack module-graph split. Vitest has one module registry and
structurally cannot reproduce that; 42-05's `globalThis` test is labelled a proxy in three places.
The fingerprint to look for was "all ten `alive:false` while processors are visibly logging" — it did
not appear.

RESEARCH's asymmetry argument is confirmed live from the other side too: the route survived
standalone tracing, and all ten heartbeat *writers* (which live in the chunks standalone drops) are
present because the repaired nft copy brought them in — 163 chunks now in
`.next/standalone/.next/server/chunks/`.

Steady state re-checked after 14 deliberately triggered unhandled errors: still `200`, `10/10 alive`,
`db.ok true`.

### (c) Log stream — every line classified by emitter

The claim "every line is JSON with a `scope`" needs to say *whose* lines. All 171 lines since boot
were parsed and attributed:

| lines | emitter |
|---|---|
| **21** | **APPLICATION — `src/lib/log.ts`** |
| 115 | Next.js framework error output (plain text `⨯ Error:` + indented `at …` frames) |
| 17 | postgres `NOTICE` (drizzle-kit pretty-print) |
| 6 | `docker-entrypoint.sh` / drizzle-kit |
| 5 | npm notices (entrypoint) |
| 5 | Next.js boot banner |
| 2 | docker-compose host unset-var notices |

```
APPLICATION lines checked : 21
valid single-line JSON    : 21 / 21
carrying a `scope`        : 21 / 21
failures                  : NONE
JSON without `scope`      : NONE
embedded raw newline      : 0
```

9 distinct scopes: `request` (10), `audit-prune` (2), `dedup-scan-cleanup` (2), `trash-prune` (2),
`email-processor`, `execution-processor`, `schedule-processor`, `sentry`, `webhook-processor`.

**T-42-57 — the `JSON.stringify(new Error())` trap:** `"err":{}` → **0**. `"err":{"` → **10**,
i.e. ten fully-serialized `{name, message, stack}` Error objects on real production errors. Plan 01's
serializer is reached.

**Redaction over all application lines:** `authorization`, `cookie`, `set-cookie`,
`authjs.session-token`, `password`, `apiKey`, `api_key`, `Bearer `, `DATABASE_URL`,
`postgresql://`, `sentry.io`, `"headers"` — **0 occurrences each**.

The eleven non-`request` lines, verbatim:

```json
{"level":"info","scope":"sentry","msg":"SENTRY_DSN unset — error tracking disabled, SDK not loaded","ts":"2026-08-23T22:50:10.090Z"}
{"level":"info","scope":"webhook-processor","msg":"Starting","ts":"2026-08-23T22:50:10.093Z","initialDelayMs":5000}
{"level":"info","scope":"email-processor","msg":"Starting","ts":"2026-08-23T22:50:10.095Z","initialDelayMs":15000}
{"level":"info","scope":"dedup-scan-cleanup","msg":"Starting","ts":"2026-08-23T22:50:10.366Z"}
{"level":"info","scope":"dedup-scan-cleanup","msg":"Done","ts":"2026-08-23T22:50:10.378Z","strandedMarkedError":0,"idleDeleted":0,"expiredDeleted":0}
{"level":"info","scope":"schedule-processor","msg":"Starting","ts":"2026-08-23T22:50:10.458Z","initialDelayMs":10000}
{"level":"info","scope":"execution-processor","msg":"Starting","ts":"2026-08-23T22:50:10.684Z","initialDelayMs":5000}
{"level":"info","scope":"audit-prune","msg":"Starting","ts":"2026-08-23T22:50:10.707Z","initialDelayMs":60000,"tickIntervalMs":86400000}
{"level":"info","scope":"trash-prune","msg":"Starting","ts":"2026-08-23T22:50:10.716Z","initialDelayMs":60000,"tickIntervalMs":86400000}
{"level":"info","scope":"audit-prune","msg":"deleted expired rows","ts":"2026-08-23T22:51:10.744Z","deleted":0,"retentionDays":90}
{"level":"info","scope":"trash-prune","msg":"purged expired records","ts":"2026-08-23T22:51:10.770Z","purged":0,"retentionDays":30}
```

#### Correction: "every line of the container app log is valid JSON" is FALSE as literally stated

Every line **our logger** emits is. But **Next.js prints its own plain-text error output into the
same stream** — `⨯ Error: The router state header was sent but could not be parsed.` followed by
indented `at …` frames, and `Error: Failed to find Server Action …`. 115 such lines appeared, all
from Next, **zero from `src/lib/log.ts`**.

Two things keep this from being a defect of this phase: those lines exist only because task 2
deliberately triggered 14 unhandled errors — the clean boot stream was 100% JSON apart from the
entrypoint and banner — and each one duplicates information the structured `"scope":"request"` line
already carries better. But a log shipper pointed at this container **will** see non-JSON lines
whenever an unhandled error occurs, and that is worth knowing before anyone configures a strict JSON
parser. Suppressing Next's own error output is not something this phase should attempt.

### A7 gate strings (carry-forward correction 5), verified against real output

| string | count |
|---|---|
| `"scope":"dedup-scan-cleanup"` | 2 |
| `"scope":"dedup-scan-cleanup","msg":"Starting"` | **1** — contiguous, as 42-12's `log.ts:97` key ordering promised |
| `"scope":"trash-prune","msg":"Starting"` | 1 |
| `"scope":"audit-prune","msg":"Starting"` | 1 |
| `[trash-prune] Starting` (retired by 42-06) | **0** |

### (d) A5 — env inside the container

```
LOG_LEVEL=
SENTRY_DSN=<empty>

LOG_LEVEL:  PRESENT, value_empty=yes
SENTRY_DSN: PRESENT, value_empty=yes
```

Both names **present**. `SENTRY_DSN` empty is correct and is the opt-out no-phone-home default; it
was left that way. `LOG_LEVEL` empty means the logger's `info` default applies. Since
`docker-compose.yml` has no `env_file:`, presence alone proves the declaration works — an unlisted
variable would not arrive at all.

### A6 / T-42-20 — the edge bundle, from compiled output

The edge copy of `instrumentation.ts` is `.next/server/edge/chunks/_87ddf5eb._.js`, **529 bytes**,
identified by `self._ENTRIES.middleware_instrumentation`. Its module `210977` in full:

```js
210977,e=>{"use strict";async function t(){}let n=async(e,t,n)=>{};e.s(["onRequestError",0,n,"register",()=>t])}
```

- `register` → **`async function t(){}`** — an empty async function, matching A6's baseline evidence
  exactly (the chunk hash moved from `_52aa5b93` because the file changed).
- `onRequestError` → **`let n=async(e,t,n)=>{}`** — also empty. Both exports compile away.

Turbopack resolves `process.env.NEXT_RUNTIME` as a build-time constant for the edge target, so both
guard bodies are dead-code-eliminated and every `await import()` target with them. The type-only
`import type { Instrumentation } from "next"` was erased as designed.

Leakage scan across **all** edge chunks (296 KB total):

```
sentry 0 · Sentry 0 · @sentry 0 · captureRequestError 0 · import-in-the-middle 0
require-in-the-middle 0 · node:fs 0 · node:http 0 · node:diagnostics_channel 0
initSentry 0 · reportRequestError 0 · beforeSend 0 · SENTRY_DSN 0
```

One `opentelemetry` hit exists, in `[root-of-the-server]__a4def060._.js` as `@opentelemetry/api` —
that is Next's own edge tracing shim in the **middleware** entry, not the instrumentation entry, and
unrelated to Sentry.

For contrast, the node side: `.next/server/instrumentation.js` is a 161-byte Turbopack loader stub
(`R.c("server/chunks/_78fab38c._.js")`) — which is exactly why the Dockerfile nft copy is
load-bearing: the real code lives in a chunk standalone tracing drops.

### `onRequestError` proven to be called by Next

42-17 listed this as owed: "registered, not exercised." Triggered with **no source change** — a
malformed RSC router-state header, which makes Next throw inside its own render path:

```
curl -H 'RSC: 1' -H 'Next-Router-State-Tree: %ZZ-not-valid' localhost:3001/   → 500
```

```json
{
  "level": "error",
  "scope": "request",
  "msg": "Unhandled server error",
  "ts": "2026-08-23T22:52:03.656Z",
  "err": {
    "name": "Error",
    "message": "The router state header was sent but could not be parsed.",
    "stack": "Error: The router state header was sent but could not be parsed.\n    at …app-page-turbo.runtime.prod.js:21:23108\n    …"
  },
  "path": "/",
  "method": "GET",
  "routePath": "/page",
  "routeType": "render"
}
```

Three things this proves at once, none of which a unit test could:

1. **Next really calls `onRequestError`** in the standalone production build, and the guarded dynamic
   import inside it resolves at runtime.
2. **A3's Error serializer works end-to-end** — `err` is a full `{name, message, stack}`, not `{}`.
   T-42-57 is closed on a real production error rather than a constructed one.
3. **T-42-18's redaction held** — `path`, `method`, `routePath`, `routeType` and nothing else. No
   `headers` map, no `authorization`, no `cookie`.

Note for future reference: the bogus `Next-Action` id probe returned **404**, not 500, and did not
reach `onRequestError`. The malformed router-state header is the reliable zero-source-change trigger.

---

## Task 3 — checkpoint: **PENDING**

Not attempted. No Sentry account was created, no DSN was obtained, `SENTRY_DSN` was not set, and
nothing was written to `.env`. Presented to the orchestrator for the user; awaiting "confirmed",
"skip", or a described failure.

DSN-leak check, as the task specifies:

```
git grep -nE 'https://[0-9a-f]+@[a-z0-9.]*sentry\.io' -- . ':!.planning' | wc -l  →  1
```

**The task's `<done>` condition expects 0. It reads 1, and will read 1 forever.** The single match is
a synthetic test fixture, not a credential:

```
src/lib/observability/sentry.test.ts:51
  "https://0123456789abcdef0123456789abcdef@o4507000000000000.ingest.de.sentry.io/4507000000000001"
```

Sequential-hex public key, round-number org and project ids, sitting under its own comment —
*"Syntactically valid and entirely fictitious. Never point a test at a real project."* — added by
plan 42-04 in commit `5d958af` to exercise the DSN-set branch against a mocked SDK. `git log -S`
confirms 42-18 did not introduce it.

The gate is mis-specified rather than failing: it matches DSN *shape*, so it cannot distinguish a
deliberate fixture from a real credential, and the fixture is required by the tests that prove
OBS-02's positive half. **Recorded so a future reader does not read `1` as a leak.** A gate that
means what it intends would exclude the test file, e.g.
`git grep -nE 'https://[0-9a-f]+@[a-z0-9.]*sentry\.io' -- . ':!.planning' ':!*sentry.test.ts'` → 0.

**Substantively: no real DSN value exists anywhere in the repository, in `.env` (`grep -c SENTRY_DSN
.env` → 0), in this summary, or in any command echoed to the user.** `.env.example:31` carries an
empty `SENTRY_DSN=""`, which is the documented opt-out default.

---

## The `[Pipedrive API]` scope — DEFERRED, with a recommendation

`src/lib/import/pipedrive-api-client.ts:42` is `log.warn("Pipedrive API", "Rate limited, retrying", …)`.

**First, the premise needs correcting.** STATE.md says "every other scope is lowercase-kebab". A
census of every `log.*` scope literal in the tree shows the taxonomy is actually two families:

- **harvested bracket prefixes** (73 sites) — lowercase-kebab: `webhook-processor`, `trash-prune`,
  `dedup-scan-cleanup`;
- **path-derived scopes** (~200 sites, A4) — slashes, brackets and camelCase:
  `api/v1/trash/[type]/[id]/restore`, `api/v1/notes/[noteId]`, `workflows/[id]/runs/[runId]`,
  `admin/import/pipedrive-api/pipedrive-api-wizard`.

So capitals and non-kebab characters are not unique to this scope. **What is unique is the space** —
`"Pipedrive API"` is the only scope in the codebase containing one.

**Recommendation: normalize to `pipedrive-api`.** The space is the one genuinely harmful property.
Every documented liveness gate in this phase has the form `grep -F '"scope":"<name>"'`, and a space
is the only character that forces quoting those gates differently from every other scope. Slashes and
brackets are shell-safe inside `grep -F`. The blast radius is one line: `grep -rn '"Pipedrive API"'
src/` returns exactly **1** occurrence, no test asserts it, and no comment gate names it. There is
already a sibling `pipedrive-api` segment in the path-derived family, so the name reads naturally and
stays operator-recognisable — which is all the "reuse the existing bracket prefix" harvesting rule
was protecting.

**Why deferred rather than done here:** the change is cosmetic and no criterion requires it, while
making it now would (a) invalidate the freshly-witnessed container, whose evidence is this plan's
central deliverable, since the running image would no longer match HEAD, and (b) touch a file outside
this plan's ownership for zero functional gain. One unavoidable source deviation (the Dockerfile)
was already necessary; a second, optional one is not worth the cost to the evidence. Logged in
`deferred-items.md` for phase 43.

---

## Carry-forward corrections — disposition

| # | Correction | Disposition |
|---|---|---|
| 1 | the broken scope gate matches nothing | **N/A to this plan** — 42-18 uses no scope gate. The census here is eslint-based. The multi-line-safe form `log\.(debug\|info\|warn\|error)\(\s*"[^"]+"` was used for the scope taxonomy census above and does match wrapped calls. |
| 2 | pin `log.error`'s two-required-arg typing | **Verified, pin deferred.** Signature confirmed at `log.ts:146-153` (`scope`, `msg` required; `ctx?` optional). Empirically re-proven by replacing `api-keys.ts:89`'s arrow with a bare `.catch(log.error)`: `error TS2345 … Target signature provides too few arguments. Expected 2 or more, but got 1.` Reverted. **`42-PATTERNS.md` §5(e)'s claim that TypeScript will not stop you is definitively wrong.** A permanent test is out of this plan's file ownership — recommended for phase 43. |
| 3 | the `ts` flake class, both directions | **No new assertions written by this plan**, so nothing to sweep. Not re-audited; wave 2 (42-12/15/16) owned it. |
| 4 | gate on lint errors, never a warning total | **Applied.** Gated on 0 errors; the 124 was recorded and unchased. Cause of the 124/122 split now pinned (see above). |
| 5 | A7's gate strings | **Verified live** against real container output — all contiguous, retired string absent. |
| 6 | count gates must exclude comments | **Hit twice, resolved twice.** `grep -c 'files:'` read 3 because the comment the plan itself mandated ("say there were zero overrides before") contains the token — and then read 3 again because the comment explaining *that* collision also contained it. Reworded both, per the phases 37-38 precedent "reword the comment, never weaken the gate". Now 2. |

---

## Requirements

| Req | Status | Evidence |
|---|---|---|
| **OBS-01** | met | `no-console: error`, 0 lint errors, negative check fires with exit 1; 21/21 container log lines valid JSON with a `scope`; `"err":{}` = 0 with 10 fully-serialized Errors |
| **OBS-02** | met, positive delivery leg pending | negative half fully automated (17 plans); `onRequestError` **proven called by Next** on a real error with correct field selection; edge bundle SDK-free; `SENTRY_DSN` visible and empty. Real-DSN delivery is task 3, **PENDING** |
| **OBS-03** | **met — first time in production** | freshly built image `c9cd5e47`, `/api/health` 200, `status: "ok"`, 10/10 workers alive, `db.ok` true; Dockerfile postcondition demonstrated firing |

## Baseline

| | result |
|---|---|
| `npm test` | **4524 passed / 32 skipped / 0 failed** (162 files passed, 2 skipped) |
| RSC project | **8 passed / 8** (2 files) |
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` | **0 errors** / 124 warnings, with `no-console: "error"` active |

## Deferred Issues

- **`[Pipedrive API]` scope** → normalize to `pipedrive-api` (see above).
- **A permanent test pinning `log.error`'s two-required-arg typing** → phase 43. Verified correct
  today and re-proven by probe; nothing enforces it against a future edit making `msg` optional.
- **Next.js emits non-JSON error output** into the same stream as the structured logger. Not fixable
  from this phase; relevant to anyone configuring a strict JSON log shipper.
- **`.planning` holds 29 untracked scratch files** that lint. Now exempted from `no-console`; they
  still contribute 2 non-`no-console` warnings and remain the cause of the 124/122 split.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change was introduced —
this plan modified one lint config entry and one Dockerfile `RUN` step. T-42-01, T-42-04, T-42-20,
T-42-55, T-42-56 and T-42-57 were all mitigated and are evidenced above; T-42-15 did not arise (no
503 was observed); T-42-06 and T-42-07 belong to the pending checkpoint.

## Next Phase Readiness

Phase 42's automatable surface is complete and, for the first time, witnessed in a container. One
human checkpoint is outstanding and is optional by design — "skip" is a valid pass.

The one thing a future phase should carry forward: **the test suite cannot see the container.** This
plan found a total build failure behind 4524 green tests. Any phase touching `instrumentation.ts`,
the `Dockerfile`, `next.config.ts` or a dependency that Next traces needs a real
`docker compose build` in its verification, not a unit test.

## Self-Check: PASSED

Files:

- `eslint.config.mjs` — FOUND
- `Dockerfile` — FOUND
- `.planning/phases/42-observability/42-18-SUMMARY.md` — FOUND
- `.planning/phases/42-observability/deferred-items.md` — FOUND

Commits:

- `6bcfb2c` — FOUND
- `a4d315f` — FOUND

Claims re-verified at HEAD `a4d315f` with a clean working tree:

- `npm run lint` → 0 errors / 124 warnings
- `npx tsc --noEmit` → 0 errors
- `npm test` → 4524 passed / 32 skipped / 0 failed, plus RSC 8/8
- `curl -sS -o /dev/null -w '%{http_code}' localhost:3001/api/health` → 200, 10/10 workers alive
- running container image `sha256:c9cd5e477273…`, matching HEAD's tree

One caveat, stated rather than hidden: task 3's `<done>` DSN grep returns **1**, not 0. Analysed
above — a synthetic fixture from 42-04, not a leak.

---
*Phase: 42-observability*
*Completed: 2026-08-23 — task 3 checkpoint PENDING*
