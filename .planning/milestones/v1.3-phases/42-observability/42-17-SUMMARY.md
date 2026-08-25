---
phase: 42-observability
plan: 17
subsystem: infra
tags: [sentry, instrumentation, nextjs, edge-runtime, onRequestError, observability]

# Dependency graph
requires:
  - phase: 42-observability (plan 02)
    provides: the structured logger `src/lib/log.ts` that `reportRequestError` writes through
  - phase: 42-observability (plan 04)
    provides: "`initSentry()` and `reportRequestError()` in src/lib/observability/sentry.ts, both self-guarding on isNodeRuntime()"
  - phase: 42-observability (plan 06)
    provides: the trash pruner's migration onto the structured logger, which retired the old gate string
  - phase: 42-observability (plan 07)
    provides: "the heartbeat registry's ten-name EXPECTED_WORKERS roster and /api/health, the runtime detector the repaired comment now names"
  - phase: 42-observability (plan 03)
    provides: "Dockerfile:35-38's postcondition, the build-time detector the repaired comment now names"
provides:
  - "`onRequestError` exported from instrumentation.ts — the single seam through which every unhandled render, route, action and proxy error reaches the logger and Sentry"
  - "Sentry initialised as the first statement of register(), before any of the twelve worker blocks"
  - "instrumentation.ts's own verification comment repaired: it now names two detectors that exist (/api/health at runtime, Dockerfile:35-38 at build time)"
affects: [42-18, any future phase adding a worker to register(), any future phase touching the edge bundle]

# Tech tracking
tech-stack:
  added: []   # @sentry/nextjs 10.70.0 was already installed; this plan adds no dependency
  patterns:
    - "root-level bootstrap files carry exactly one top-level import and it is `import type` — value imports go behind `await import()` inside the NEXT_RUNTIME guard"
    - "Next.js error reporting via the onRequestError hook rather than per-call-site wrapping"

key-files:
  created: []
  modified:
    - instrumentation.ts

key-decisions:
  - "`await initSentry()` rather than a floating `initSentry()` — awaiting is what makes 'Sentry is initialised before any worker starts' literally true, and A9's try/catch inside initSentry means the await cannot abort the twelve blocks below it"
  - "The repaired gate line names `/api/health` and NOT the repaired log-grep `'\"scope\":\"trash-prune\",\"msg\":\"Starting\"'` that STATE.md's carry-forward suggested — the trash pruner is one of the ten workers in EXPECTED_WORKERS, so it has a strictly better, non-vacuous detector, unlike the two one-shot cleanups which are excluded from /api/health and therefore still need the grep"
  - "The stale `Dockerfile:24` citation was recast in past tense rather than kept verbatim (the plan said verbatim; STATE.md carry-forward item 2 and deferred-items.md's reconciliation both say fix it), matching how heartbeat.ts:14 and scan-cleanup.ts:27 already narrate the same incident"

patterns-established:
  - "Pattern: a bootstrap comment names one detector per lifecycle phase — build time (a Dockerfile postcondition that exits 1) and run time (/api/health) — and explicitly labels a boot-line log grep as vacuous"

requirements-completed: [OBS-02, OBS-03]

# Metrics
duration: 34min
completed: 2026-08-23
---

# Phase 42 Plan 17: instrumentation.ts Sentry Wiring Summary

**`onRequestError` exported as a three-line guarded delegator and `await initSentry()` promoted to the first statement of `register()`, with the file's own verification comment repaired from two false claims to two detectors that exist — all in +76/-5 lines of a single file, with the twelve existing `await import()` blocks byte-identical.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-08-23T19:03Z
- **Completed:** 2026-08-23T19:37Z
- **Tasks:** 2
- **Files modified:** 1 (`instrumentation.ts`, 44 lines → 115 lines)

## Accomplishments

- **`initSentry()` is the first statement of the `nodejs` branch.** `await initSentry()` at
  **line 28**; `startWebhookProcessor()` at **line 31**. A throw during processor startup is now
  captured rather than lost.
- **`onRequestError` exported at line 106**, typed `Instrumentation.onRequestError` against the
  installed `next@16.1.6` types, with `if (process.env.NEXT_RUNTIME !== "nodejs") return` as its
  first statement and all three arguments forwarded untouched to `reportRequestError` (line 114).
- **Exactly one top-level import and it is type-only** (`import type { Instrumentation } from "next"`,
  line 18). The A6 constraint that keeps the edge copy an empty function is now stated in capitals in
  a file header, with the verified edge-chunk evidence and the reason Sentry's documented one-liner
  is rejected.
- **Both false statements in the A7 gate comment are corrected** — see the verbatim diff below.
- **Baseline exactly preserved:** 4524 passed / 32 skipped, RSC 8/8, `tsc --noEmit` 0 errors,
  `eslint` 0 errors, `no-console` census still exactly 4 and all four still in `src/lib/log.ts`.

## Task Commits

1. **Task 1: Initialise Sentry first in the nodejs branch and export onRequestError** — `41ebb26` (feat)
2. **Task 2: Repair the A7 gate comment — site 1 of 3** — `ca190ba` (docs)

**Plan metadata:** committed with this SUMMARY.

## Files Created/Modified

- `instrumentation.ts` — added the NO-TOP-LEVEL-VALUE-IMPORTS header, the single type-only import,
  `await initSentry()` as the first statement inside the `NEXT_RUNTIME === "nodejs"` guard, the
  `onRequestError` export with its three-part doc comment (only-uniform-seam / guarded-and-dynamic /
  scope-and-what-is-not-captured), and the repaired A7 gate comment above `startTrashPruner`.

## The gate comment, verbatim

**Old (5 lines, both marked claims false):**

```
    // REGISTRATION HERE IS NOT EVIDENCE OF EXECUTION. `Dockerfile:24` copies the built
    // `instrumentation.js` into `.next/standalone/` with a step that ends in `2>/dev/null || true`,
    // so a build whose chunk layout changes fails silently and this whole function never runs. That
    // exact breakage killed all four processors in production on 2026-08-08 while every test passed.
    // The gate is behavioural: `docker compose logs app | grep -F '[trash-prune] Starting'`.
```

**New (15 lines):**

```
    // REGISTRATION HERE IS NOT EVIDENCE OF EXECUTION. `Dockerfile:35-38` copies the built
    // `instrumentation.js` into `.next/standalone/`. Until phase 42 that step lived at
    // `Dockerfile:24` and ended in `2>/dev/null || true`, so a build whose chunk layout changed
    // failed silently and this whole function never ran. That exact breakage killed all four
    // processors in production on 2026-08-08 while every test passed. Phase 42 replaced the
    // suppression with a postcondition that exits 1 — which closes that mechanism at BUILD time
    // and says nothing about whether `register()` ever executed.
    // The RUNTIME gate is `curl -s localhost:3001/api/health`: all ten workers — these six
    // processors plus the four subscribers — are reported from a HARD-CODED roster, so a
    // `register()` that never ran comes back 503 listing ten dead workers instead of as a log line
    // that is merely absent. Two detectors now, one per phase of the lifecycle. The old
    // `docker compose logs` grep for this pruner's bracketed startup prefix is retired twice over:
    // plan 06 turned that prefix into a structured `scope` field, and a boot-line grep was always
    // vacuous anyway — every build emits it, including a stale image a `docker restart` brought
    // back up.
```

The `2026-08-08` incident record and the `REGISTRATION HERE IS NOT EVIDENCE OF EXECUTION` warning are
preserved; the comment did not move and still sits directly above the `@/lib/trash/prune` import block.

## Verification

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npx eslint instrumentation.ts` | 0 errors |
| `npx eslint .` | **0 errors**, 122 warnings (the documented worktree value; 124 on the main checkout, cause unrelated to this phase) |
| `npm test` | **4524 passed / 32 skipped** (162 files passed, 2 skipped) |
| RSC project | **8 passed / 8** |
| `no-console` over `src` excluding tests | **4, all in `src/lib/log.ts` (131:26, 132:30, 133:31, 134:8)** — unchanged |
| `grep -cE '^import ' instrumentation.ts` | 1 |
| `grep -cE '^import type ' instrumentation.ts` | 1 |
| `await import(` code sites | **14** (12 existing + `initSentry` + `reportRequestError`) |
| `export const onRequestError` real export | 1 (line 106) |
| `grep -c "trash-prune"` | 0 |
| `grep -c "api/health"` | 1 |
| `grep -c "2026-08-08"` | 1 |
| `grep -c "Dockerfile:24"` | 1 |
| `git diff --exit-code next.config.ts` | passes (untouched) |
| Total diff vs base `797e3eb` | `instrumentation.ts` only, **+76 / -5** — and the 5 deletions are exactly the 5 old comment lines, so the twelve worker blocks are byte-identical |

## Decisions Made

1. **`await initSentry()`, not a floating call.** The plan's action text wrote `initSentry()`. Awaiting
   it is what makes the must-have truth ("Sentry is initialised before any worker starts") literally
   hold — a floating promise would let the workers start concurrently with SDK init, which is the exact
   window the ordering exists to close. Safe because `initSentry` cannot reject: `sentry.ts:118-204`
   puts the entire `await import("@sentry/nextjs")` + `Sentry.init()` path inside one try/catch (A9),
   and both early returns are plain `log.info` calls. Verified by reading the function, not assumed.

2. **The repaired gate names `/api/health`, not a repaired log grep.** STATE.md's carry-forward item 1
   proposed `grep -F '"scope":"trash-prune","msg":"Starting"'`; the plan's own acceptance criterion
   demanded zero `trash-prune` strings. Those are mutually exclusive, so it was a real decision, and
   the deciding fact is that `heartbeat.ts:100-111`'s `EXPECTED_WORKERS` **includes `trash-prune`** —
   verified. So this pruner's liveness is covered by `/api/health`, whereas
   `dedup-scan-cleanup` and `import-session-cleanup` are deliberately excluded from the roster and
   genuinely have nothing but their log line. Naming the endpoint here is therefore the stronger gate,
   and the comment explicitly records that a boot-line grep is vacuous regardless of its string —
   consistent with `scan-cleanup.ts:27-32`, which already says the same about build-time vs runtime
   evidence.

3. **`Dockerfile:24` recast to past tense rather than kept verbatim.** Now matches `heartbeat.ts:14`
   and `scan-cleanup.ts:27`, both of which already narrate the 2026-08-08 mechanism in the past tense
   while citing `Dockerfile:35-38` as current. Verified against the Dockerfile: line 35 is
   `RUN test -f .next/standalone/.next/server/instrumentation.js \` and the `exit 1` postcondition is
   on line 38.

## Deviations from Plan

### 1. [Rule 1 — Bug] The plan (and `42-PATTERNS.md` §5(f)) said keep the comment's first four lines verbatim; they contain a false statement

- **Found during:** Task 2
- **Issue:** Line 36's `Dockerfile:24` citation and its present-tense claim that the copy step "ends
  in `2>/dev/null || true`" stopped being true when plan 03 moved the block to `Dockerfile:35-38` and
  replaced the suppression with a postcondition. Keeping it verbatim would have shipped a comment that
  sends a reader to the wrong line and describes a mechanism that no longer exists.
- **Fix:** Recast the mechanism in past tense, cite `Dockerfile:35-38` as current, keep `Dockerfile:24`
  as the historical location, and name the postcondition as the build-time detector.
- **Authority:** STATE.md WAVE 2 CARRY-FORWARD item 2 for 42-17 ("stale since 42-03 … you own it") and
  `deferred-items.md`'s 2026-08-23 reconciliation ("it has TWO problems, not the one recorded here").
  This closes the last open item in that file.
- **Consequence:** the plan's criterion "`git diff` shows exactly one modified line inside that comment
  block" no longer holds — the block is 5 lines replaced by 15. `grep -c "Dockerfile:24"` is still 1
  and `grep -c "2026-08-08"` is still 1, as required.
- **Committed in:** `ca190ba`

### 2. [Rule 1 — Bug] Two of the plan's acceptance-criteria counts are self-contradicting and cannot both be met

Both are gate defects, not code defects — the plan asked for a count over the raw file while also
asking for prose that necessarily contains the counted string:

- **`grep -c 'await import(' instrumentation.ts` reads 15, not the required 14.** The 15th match is
  **line 7 of the file header**, which the plan itself instructed me to write ("every dependency sits
  behind `await import()` inside the runtime guard"). **Code sites are exactly 14**: lines 27, 30, 33,
  36, 39, 42, 45, 48, 51, 54, 57, 60, 68, 103.
- **`grep -c 'export const onRequestError' instrumentation.ts` reads 2, not the required 1.** The
  second match is **line 10**, where the header quotes Sentry's rejected one-liner
  `export const onRequestError = Sentry.captureRequestError` — again as the plan instructed. **Real
  exports: exactly 1**, line 106.
- **Fix:** none applied to the code; the code is correct. Reported here so 42-18 does not read these
  as regressions. A count gate over a file that contains prose about its own code needs to exclude
  comment lines.

### 3. [Rule 3 — Blocking] Worktree base was stale, as predicted

- HEAD was `286c470`, fast-forwarded to the expected base `797e3eb` before any work. That makes **28
  for 28** stale worktrees across phases 41 and 42. All four wave-1/2 modules confirmed present after
  the correction (`src/lib/log.ts`, `src/lib/observability/heartbeat.ts`,
  `src/lib/observability/sentry.ts`, `src/app/api/health/route.ts`).

---

**Total deviations:** 3 (1 stale-doc correction, 1 pair of vacuous/self-contradicting gates reported
rather than worked around, 1 environmental).
**Impact on plan:** No scope creep. One file touched, `next.config.ts` untouched, no dependency added,
no test modified.

## Premises checked before relying on them

Following the phase's record of wrong plan premises, every load-bearing claim was greped or read:

- `Instrumentation` **is** exported from `"next"` — `node_modules/next/dist/types.d.ts:18`. ✓
- `RequestErrorContext.routeType` **is** `'render' | 'route' | 'action' | 'proxy'`, and the installed
  16.1.6 types **do not** have the docs' `renderType` field. ✓ (`renderSource` and `revalidateReason`
  are present; extra properties are harmless because the forwarded object is not a fresh literal.)
- `errorRequest` is `Readonly<{path, method, headers: NodeJS.Dict<string | string[]>}>`, which is
  assignable to `reportRequestError`'s `{ path; method; headers: Record<string, string | string[] |
  undefined> }` — `NodeJS.Dict<T>` is that exact record type, and property-level `readonly` does not
  affect assignability. Confirmed by `tsc --noEmit` passing. ✓
- `reportRequestError`'s third parameter really does carry the optional `routerKind`
  (`sentry.ts:224`), so forwarding `context` untouched typechecks. ✓
- `initSentry` really is guarded (A9 satisfied inside the module) and really does return early with no
  DSN. ✓
- `EXPECTED_WORKERS` really is a hard-coded ten-name roster containing `trash-prune`, and
  `/api/health` really does return `503` when degraded (`route.ts:149`). ✓
- `@sentry/nextjs` resolves from the shared `node_modules` symlink — no install attempted. ✓
- `Dockerfile:35-38` really is the copy-and-assert block. ✓

## Issues Encountered

- `npx eslint --rule '{"no-console":"error"}' src` counts include test files, which the census
  excludes; re-run with `--ignore-pattern '**/*.test.ts' --ignore-pattern '**/*.test.tsx'
  --ignore-pattern '**/__tests__/**' --quiet` to reproduce the "4, all in log.ts" figure. Worth
  recording because a naive run of the census command looks like a large regression when it is not.
- The `rtk` wrapper summarises eslint output; `rtk proxy` is needed to see raw per-file lines.

## What this plan does NOT prove — for 42-18

- **The edge-bundle claim is unverified here.** That the edge copy of `instrumentation.ts` is still
  `async function t(){}` after this change is a claim about compiled output. Nothing in this plan
  compiles for the edge runtime. **42-18 must run `docker compose build` and inspect the compiled edge
  chunk** (`.next/server/edge/chunks/*`) to confirm the type-only import kept the SDK out. The
  exact-count import gate is a proxy for it, not a proof.
- **OBS-03 remains unproven.** Everything asserting that the ten workers are alive is a unit test
  against a single Vitest module registry, which by construction cannot reproduce either the
  missing-`instrumentation.js` case or the split-module case (`heartbeat.ts` says so in its own
  header). 42-18 still owes: a container build, a container start, `curl -s localhost:3001/api/health`
  returning **200 with all ten workers `alive: true`**, and the Dockerfile postcondition demonstrated
  to fail the build when `instrumentation.js` is absent. A `docker restart` does not rebuild and is
  not a freshness check.
- **`onRequestError` has no runtime proof either.** It is registered, not exercised. Triggering one
  genuinely unhandled error in the running container and seeing the
  `"scope":"request","msg":"Unhandled server error"` line is the only evidence that Next actually
  calls this export.
- **A7 sites 2 and 3** (`scan-cleanup.ts`, `scan-cleanup.test.ts`) were already repaired by plan 12 —
  verified by reading both files. Only site 1 was mine.
- **Still open for 42-18's judgment:** the `log.warn("Pipedrive API", …)` scope at
  `src/lib/import/pipedrive-api-client.ts:42`, the phase's only scope with a space and capitals.

## Next Phase Readiness

- OBS-02's seam is closed in code and typechecked; OBS-03's runtime proof is 42-18's container check.
- No blockers. No stubs. `next.config.ts` deliberately untouched (no `withSentryConfig`, per A6).

## Self-Check: PASSED

- `instrumentation.ts` — FOUND
- `.planning/phases/42-observability/42-17-SUMMARY.md` — FOUND
- commit `41ebb26` — FOUND
- commit `ca190ba` — FOUND

---
*Phase: 42-observability*
*Completed: 2026-08-23*
