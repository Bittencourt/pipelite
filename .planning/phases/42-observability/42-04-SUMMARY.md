---
phase: 42-observability
plan: 04
subsystem: infra
tags: [sentry, error-tracking, observability, dynamic-import, pii-redaction, tdd, vitest]

# Dependency graph
requires:
  - phase: 42-observability
    provides: "src/lib/log.ts (plan 42-01) — the structured logger this module logs through; @sentry/nextjs 10.70.0 declared and installed (plan 42-03)"
provides:
  - "src/lib/observability/sentry.ts — initSentry(), reportRequestError(), isNodeRuntime()"
  - "Opt-in server-side error tracking whose DISABLED state is a proven absence, not an assumed one"
  - "The guarded-dynamic-import wrapper that lets instrumentation.ts stay a thin delegator with zero top-level value imports (A6)"
  - "Two-layer PII scrubbing for Sentry egress: Sentry's dataCollection plus our own beforeSend, which runs last"
affects: [42-17, 42-18, observability, error-tracking, instrumentation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Env-gated dynamic import: the SDK is reached ONLY by await import() inside the DSN guard, so with no DSN it is never evaluated"
    - "Asserting a negative three independent ways, one of them with a mock factory that THROWS"
    - "globalThis singleton for a boolean feature flag, via accessor functions rather than a captured reference"

key-files:
  created:
    - src/lib/observability/sentry.ts
    - src/lib/observability/sentry.test.ts
  modified: []

key-decisions:
  - "NEXT_RUNTIME guard shape: exported as isNodeRuntime(): boolean — plan 42-17 delegates to this, and both initSentry() and reportRequestError() short-circuit on it internally"
  - "The enabled flag lives on globalThis.__pipeliteSentryEnabled, not in module scope, per amendment A2's four-instance finding"
  - "vi.doMock rather than vi.mock — vi.mock is hoisted, so two factories for one module path cannot coexist in a single test file"
  - "dataCollection.cookies is false, not { deny: ['*'] } — deny terms are substring-matched, so '*' matches no cookie name and would be a silent no-op"
  - "dataCollection.httpHeaders spells out both request and response — the installed type is not a bare CollectBehavior, and omitting response leaves it defaulting to true"
  - "Added stackFrameVariables: false and databaseQueryData: false — both default to TRUE and neither is reachable by beforeSend"
  - "reportRequestError's context parameter gained an optional routerKind, because @sentry/nextjs's ErrorContext requires it"

patterns-established:
  - "Three-layer negative proof: init-not-called, module-never-evaluated (throwing factory), no-outbound-fetch — plus a CONTROL case so the throwing factory cannot pass vacuously"
  - "beforeSend asserted on its RETURN VALUE, so a mutate-but-forget-to-return implementation fails"
  - "An optional integration's failure path degrades the integration, never the application (A9)"

requirements-completed: [OBS-02]

# Metrics
duration: 20min
completed: 2026-08-23
---

# Phase 42 Plan 04: Sentry Error Tracking Summary

**Opt-in server-side error tracking via `@sentry/nextjs` 10.70.0 reached only through two guarded `await import()` sites — with the DSN unset the SDK is never evaluated, proven three independent ways, and with it set every event is PII-scrubbed twice before it reaches the wire.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-23T19:31:00Z
- **Completed:** 2026-08-23T19:50:06Z
- **Tasks:** 2 (RED, GREEN)
- **Files created:** 2

## Accomplishments

- **`initSentry()` / `reportRequestError()` / `isNodeRuntime()`** in `src/lib/observability/sentry.ts` (255 lines), with **zero** top-level value imports of `@sentry/nextjs` and exactly two guarded `await import()` sites.
- **OBS-02's negative is proven, not inferred.** Three independent layers: `init` is never called; the SDK module is never even evaluated (a `vi.doMock` factory that throws); and no outbound `fetch` occurs. Layer 2 is the strong one — it demonstrates the `await import()` genuinely sits inside the DSN branch rather than being hoisted.
- **Layer 2 carries a CONTROL case**, which is what stops it being vacuous: with a DSN set, the guarded import *is* reached and the throwing factory *does* throw. Without that case a mis-resolved module path would make layer 2 pass for entirely the wrong reason.
- **That same control closes amendment A9.** `initSentry()` catches the throw, logs a warning through the new logger and returns `false`. A `SENTRY_DSN` an operator typo'd cannot abort `register()` and start zero workers — the observability feature cannot create the outage it exists to reveal.
- **PII filtered twice over (T-42-06).** Sentry's own `dataCollection` (userInfo off, `httpBodies: []`, cookies off outright, request *and* response header deny lists, query-param deny list, frame locals and DB query data off) plus our `beforeSend`, which runs last, deletes `user`, `request.data`, `request.cookies`, `request.headers`, redacts e-mail addresses out of `request.url`, and returns the event.
- **32 new tests, all green**, taking the suite from 4455 to 4487 passed with nothing broken.

## Task Commits

1. **Task 1: RED — the suite, module absent** — `5d958af` (test)
2. **Task 2: GREEN — the implementation** — `c3c5e14` (feat)

No REFACTOR commit: the GREEN implementation needed no cleanup, and churning it would have added risk without adding value.

## RED failure count (recorded per the plan's output spec)

`npx vitest run src/lib/observability/sentry.test.ts` at commit `5d958af`:

- **32 tests, 0 passed, 32 failed**, 7 suites, exit non-zero.
- Single failure reason: `Error: Cannot find module '/src/lib/observability/sentry'` — every case dynamically imports the module under test, so the absent module surfaces as 32 per-test failures instead of one collection error that would have hidden the assertion count.
- GREEN ran **32 passed / 0 failed** — the same count, so no test was added, removed or weakened to reach green.

## The NEXT_RUNTIME guard shape (plan 42-17 delegates to this)

```typescript
export function isNodeRuntime(): boolean   // true when NEXT_RUNTIME is unset or "nodejs"
```

- **Unset counts as node.** The variable is set by Next during a request; this module is also loaded by vitest and by plain node processes, neither of which is the edge.
- Both `initSentry()` and `reportRequestError()` short-circuit on it internally, so **plan 42-17 does not have to**. `instrumentation.ts` keeps its existing `NEXT_RUNTIME` branch and the module's guard is belt-and-braces.
- On the edge, `initSentry()` logs `"Edge runtime — error tracking initialises in the Node runtime only"` and returns `false` **without importing the SDK** — asserted with the throwing factory, so T-42-20 is proven rather than assumed.
- Exported rather than tested at the root because `vitest.config.ts:9` anchors `include` at `src/**`, so a root-level `instrumentation.test.ts` is never collected. Widening that config was the alternative and was rejected — its header explains its exclusions at length and they are load-bearing for three vitest projects.

## Interface delta for plan 42-17

The plan's declared signature gained **one optional field**:

```typescript
export async function reportRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routePath: string; routeType: string; routerKind?: string }   // ← routerKind added
): Promise<void>
```

`@sentry/nextjs`'s own `ErrorContext` **requires** `routerKind`
(`node_modules/@sentry/nextjs/build/types/common/captureRequestError.d.ts:6-10`), and Next's
`RequestErrorContext` always supplies it, so **42-17 can forward `onRequestError`'s third argument
untouched**. It stays optional so a caller with only a path and type still compiles; the default is
`"App Router"`, the only router this app has.

## Files Created

- `src/lib/observability/sentry.ts` (255 lines) — `initSentry()`, `reportRequestError()`, `isNodeRuntime()`. Imports only `@/lib/log`.
- `src/lib/observability/sentry.test.ts` (621 lines, 32 tests) — the three negative layers, the positive, the A2 module-reload proxy, PII scrubbing, and the A6 runtime guard.

## Decisions Made

1. **The `enabled` flag lives on `globalThis.__pipeliteSentryEnabled`, not in module scope.** Amendment A2 measured `src/lib/events/bus.ts` as four independent instances across nine chunks — two of them inside a single `register()` call. A module-level `let enabled` would read `false` in whichever instance `onRequestError` resolves to, and Sentry would be **configured but permanently silent** — an absence indistinguishable from the disabled path this whole plan works to prove. Same pattern as `heartbeat.ts:121-125`, `bus.ts` and `actor-context.ts`. A boolean cannot be captured by reference the way `heartbeat.ts` captures its `Map`, so it is reached through two private accessors.
2. **`vi.doMock` rather than the plan's `vi.mock`.** See deviation 1 — `vi.mock` is hoisted, so the plan's "one `vi.mock` factory per describe block" is not achievable as written.
3. **`await` retained on `captureRequestError`** even though the installed signature returns `void`: the SDK has changed this shape before, and an unawaited promise would report after the process moved on. No lint rule objects (the config is not type-aware).
4. **A second try/catch around `captureRequestError`.** This function is the last handler in the chain — it runs *because* something escaped every other one. A throw here would turn a reported error into an unhandled rejection inside the unhandled-error handler.
5. **`log.info("sentry", "Error tracking enabled")` on the success path.** The disabled path was already required to announce itself; the enabled path saying so symmetrically is what lets an operator distinguish "off" from "broken" from a single boot log. Asserted not to contain the DSN.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `vi.mock` cannot express one factory per describe block — switched to `vi.doMock`**
- **Found during:** Task 1 (RED)
- **Issue:** The plan specifies `vi.mock("@sentry/nextjs", …)` with "one `describe` per negative layer so each can own its `vi.mock` factory". `vi.mock` calls are **hoisted to the top of the module** regardless of where they appear, so two registrations for the same module path cannot coexist — the last one wins for the entire file. Layer 2's throwing factory would have poisoned layer 1, layer 3 and every positive case.
- **Fix:** `vi.doMock` inside each block's `beforeEach`, paired with `vi.resetModules()`, plus `vi.doUnmock` in the file-level `afterEach`. Not hoisted, applies to subsequent dynamic imports. Precedent in this repo: `src/lib/execution/actions/__tests__/http.test.ts:86-91`.
- **Files modified:** `src/lib/observability/sentry.test.ts`
- **Verification:** 32/32 green, and layer 2's control case proves the throwing factory is genuinely installed rather than silently absent.
- **Committed in:** `5d958af`

**2. [Rule 1 - Bug] RESEARCH's `httpHeaders: { deny: [...] }` does not typecheck**
- **Found during:** Task 2 (GREEN), from the installed types
- **Issue:** The installed `DataCollection.httpHeaders` is `{ request?: CollectBehavior; response?: CollectBehavior }` (`@sentry/core/build/types/types/datacollection.d.ts:35-38`), **not** a bare `CollectBehavior`. RESEARCH Pattern 5's proposed flat form is a TS error. Worse, a form that *did* compile by only setting `request` would leave **response** headers on their default of `true`.
- **Fix:** Both halves spelled out with their own deny lists; `set-cookie` added to the response list.
- **Files modified:** `src/lib/observability/sentry.ts`
- **Verification:** `npx tsc --noEmit` → 0 errors; a test asserts both `request.deny` and `response.deny`.
- **Committed in:** `c3c5e14`

**3. [Rule 2 - Missing Critical] `cookies: { deny: ["*"] }` is a silent no-op that collects every cookie**
- **Found during:** Task 2 (GREEN)
- **Issue:** RESEARCH proposes `cookies: { deny: ["*"] }`, which *reads* as "deny everything". The installed filter matches deny terms as case-insensitive **substrings** of the key (`@sentry/core/build/cjs/utils/data-collection/filterKeyValueData.js:20-28`) — there is no glob support. No cookie name contains a literal asterisk, so the deny list matches **nothing** and every cookie, including `authjs.session-token`, would have been collected. This is a session-token egress bug that would have passed a naive "a deny list is configured" review.
- **Fix:** `cookies: false`, which is the only encoding of "collect none" (`filterKeyValueData` returns `{}` for `false`). Comment records why the deny-list form is wrong so nobody restores it.
- **Files modified:** `src/lib/observability/sentry.ts`
- **Verification:** Dedicated test asserts `dataCollection.cookies === false`, with the reasoning in the assertion's comment.
- **Committed in:** `c3c5e14`

**4. [Rule 2 - Missing Critical] Added `stackFrameVariables: false` and `databaseQueryData: false`**
- **Found during:** Task 2 (GREEN)
- **Issue:** Both **default to `true`**, and neither is reachable by `beforeSend` — frame locals land under `exception.stacktrace.frames[].vars` and query data under span attributes, while `beforeSend` only reaches `event.request`. On this codebase a captured local is routinely a person or deal row straight out of drizzle, and the SDK's own docs describe `databaseQueryData` as covering "inline literal values within query text […] and returned result data". T-42-06's mitigation is incomplete without them.
- **Fix:** Both set to `false` in the `dataCollection` block.
- **Files modified:** `src/lib/observability/sentry.ts`
- **Verification:** Dedicated test asserts both.
- **Committed in:** `c3c5e14`

**5. [Rule 2 - Missing Critical] A9's try/catch, plus a second one around the report path**
- **Found during:** Task 2 (GREEN)
- **Issue:** The plan's task-2 action list does not mention try/catch, but CONTEXT amendment A9 makes it mandatory: `initSentry()` is the first statement of `register()`, so an `init()` that throws starts **zero** processors. CLAUDE.md/CONTEXT amendments take precedence over the task body.
- **Fix:** `await import` + `init()` inside try/catch; on failure `setEnabled(false)`, `log.warn`, return `false`. Separately, `captureRequestError` is also wrapped — this function runs *because* something already escaped every other handler, and a throw here would produce an unhandled rejection inside the unhandled-error handler.
- **Files modified:** `src/lib/observability/sentry.ts`
- **Verification:** Two tests (`CONTROL — …A9 keeps the throw contained`, `A9 — a failed init leaves reporting disabled instead of half-initialised`).
- **Committed in:** `c3c5e14`

**6. [Rule 3 - Blocking] `context` gained an optional `routerKind`**
- **Found during:** Task 2 (GREEN)
- **Issue:** The plan's declared `context: { routePath: string; routeType: string }` cannot be forwarded to `captureRequestError`, whose `ErrorContext` **requires** `routerKind` — a missing-required-property type error.
- **Fix:** `routerKind?: string` added to the parameter, defaulted to `"App Router"` at the call into the SDK. Optional, so the plan's original two-field call site still compiles. Documented above under "Interface delta for plan 42-17".
- **Files modified:** `src/lib/observability/sentry.ts`
- **Verification:** `npx tsc --noEmit` → 0 errors; test asserts `routerKind: expect.any(String)` reaches the SDK.
- **Committed in:** `c3c5e14`

**7. [Rule 2 - Missing Critical] `beforeSend` redacts e-mail addresses from `request.url`**
- **Found during:** Task 2 (GREEN)
- **Issue:** RESEARCH Pattern 5 calls `stripEmails(event.request.url)` but never defines it. `request.url` is deliberately KEPT (the route is the entire diagnostic value of an error event), and on a CRM a URL routinely carries a person's address in a path segment or a search query.
- **Fix:** A local `stripEmails` over `/[\w.+-]+(?:@|%40)[\w-]+(?:\.[\w-]+)+/gi`. The `%40` alternative matters because a query string carries the encoded form, which a naive `@`-only pattern misses entirely.
- **Files modified:** `src/lib/observability/sentry.ts`
- **Verification:** Two tests — one plain-`@` path segment, one percent-encoded query param — plus one asserting the route itself survives.
- **Committed in:** `c3c5e14`

---

**Total deviations:** 7 auto-fixed (4 missing-critical, 1 bug, 2 blocking)
**Impact on plan:** No scope creep — every one is inside `sentry.ts`/`sentry.test.ts`, and no file outside this plan's `files_modified` was touched. Three of them (2, 3, 6) are cases where RESEARCH's proposed source would not have compiled or would have silently leaked; #3 in particular would have shipped session cookies to a third party behind a deny list that looked correct.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change was introduced. The single egress surface (deployment → sentry.io) was already enumerated in the plan's threat model and is inert unless an operator sets `SENTRY_DSN`.

## Known Stubs

None. Both exported functions are fully wired to their real dependencies. `instrumentation.ts` does not yet call them — that is plan 42-17's task, declared in this plan's `depends_on` direction, not a stub here.

## Verification Numbers

Everything below was run inside the worktree at `c3c5e14`.

| Gate | Result |
|---|---|
| `npx vitest run src/lib/observability/sentry.test.ts` | **32 passed / 0 failed** (7 suites) |
| `npm test` | **4487 passed / 32 skipped (4519)**, 161 files passed / 2 skipped, **0 failed** |
| `npm test` (RSC project) | **8 passed / 0 failed** |
| `npx tsc --noEmit` | **0 errors** |
| `npx eslint` | **0 errors**, 122 warnings — `sentry.ts` and `sentry.test.ts` contribute **0 of each** |

Baseline was 4455 passed (per the wave-1 handoff). 4455 + 32 = **4487**, so this plan added its 32 tests and broke none.

**Source gates:**

| Gate | Expected | Actual |
|---|---|---|
| `grep -nE '^\s*import .*@sentry/nextjs' sentry.ts` | nothing, or `import type` only | **nothing** (no type-only import needed either — `beforeSend` is contextually typed) |
| `grep -c 'await import("@sentry/nextjs")' sentry.ts` | 2 | **2** (lines 119, 241) |
| `grep -v '^\s*[*/]' sentry.ts \| grep -c 'tracesSampleRate\|tracesSampler\|sendDefaultPii'` | 0 | **0** |

## Issues Encountered

- **The eslint warning count is 122 here, not the 124 the handoff quotes.** Neither of my files contributes a warning, and errors are 0 either way, so this is a pre-existing difference in where the two counts were measured. Not investigated — out of scope per the scope boundary.
- **The worktree base was stale, again — 16 for 16.** HEAD was `286c470` against an expected `bc5ea1c`; corrected with `git merge --ff-only` after confirming `286c470` is an ancestor. `src/lib/log.ts` and `heartbeat.ts` both present afterwards.

## Stale comments in files I own

None to fix. All five `Dockerfile:24` citations listed in `deferred-items.md` live in files outside this plan's ownership (`trash/prune.ts`, `trash/prune.test.ts`, `dedup/scan-cleanup.ts`, `dedup/scan-cleanup.test.ts`, `instrumentation.ts`).

## User Setup Required

None for this plan. `SENTRY_DSN` is genuinely optional — unset is a supported, tested configuration in which the SDK is never loaded. An operator who *wants* error tracking will need `SENTRY_DSN` added to `docker-compose.yml` (amendment A5) and `.env.example`, both of which belong to other plans in this phase.

## Next Phase Readiness

**Ready for plan 42-17.** It needs exactly three things from here, all stable:

1. `initSentry()` as the first statement of `register()`'s `nodejs` branch. It **cannot throw** (A9), so it needs no defensive wrapper at the call site.
2. `export const onRequestError` delegating to `reportRequestError(err, request, context)` — Next's `onRequestError` arguments can be forwarded **untouched**, `routerKind` included.
3. Reach both through `await import("@/lib/observability/sentry")`. `sentry.ts` imports only `@/lib/log` (zero imports itself), so the dynamic import drags nothing, but a **top-level** import of `sentry.ts` from `instrumentation.ts` would still be safe on the edge — `sentry.ts` has no `node:` dependency at module scope. Dynamic is preferred anyway for consistency with the existing guard.

**One caution for 42-18's container check:** every assertion here runs against a mocked SDK in a single vitest module registry. The A2 `globalThis` case is a **proxy** for the four-instance Turbopack hazard and is labelled as such in the test — vitest structurally cannot reproduce a graph split. If Sentry is ever enabled in a real deployment, "an error appears in the Sentry project" is the only assertion that closes that gap.

---
*Phase: 42-observability*
*Completed: 2026-08-23*
