---
phase: 42-observability
plan: 05
subsystem: api
tags: [health-check, observability, nextjs-route-handler, drizzle, postgres, vitest, tdd]

# Dependency graph
requires:
  - phase: 42-observability
    provides: "plan 42-02's src/lib/observability/heartbeat.ts — EXPECTED_WORKERS, snapshot(), registerProcessor/registerSubscriber/recordTick, _resetForTesting"
provides:
  - "GET /api/health — unauthenticated, uncached, roster-based liveness report for all ten background workers plus a bounded database probe"
  - "HTTP 200 healthy / 503 degraded, so a load balancer or uptime check can act on the status code without parsing the body"
  - "The empty-registry proof: a process where register() never ran answers 503 with all ten workers present and alive:false"
  - "A demonstrated-effective assertion: the registry-iterating bug was written on purpose and observed answering 200 with processors:{}"
affects: [42-18 container verification, 42-06 instrumentation heartbeat wiring, future uptime/load-balancer configuration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bounded db.execute via Promise.race with the timer handle hoisted and cleared in a finally (postgres.js/drizzle accept no AbortSignal, so the AbortController form is unavailable)"
    - "Roster-based health response: iterate a fixed name list, never the live registry, because every() on an empty collection is vacuously true"
    - "Dynamic import of the route module inside each test case, so a missing route reports N failing tests instead of one collection error"

key-files:
  created:
    - src/app/api/health/route.ts
    - src/app/api/health/__tests__/route.test.ts
  modified: []

key-decisions:
  - "processors is built from snapshot()'s ten-name roster, never from the live registry map — the phase's central design constraint (amendment A1, T-42-10)"
  - "The 2s DB-probe timer handle is hoisted and cleared in a finally, deviating from 42-RESEARCH Pattern 3's snippet, which leaks a live 2-second timer on every fast success"
  - "SELECT 1 is the probe: it exercises the real postgres.js pool and a more representative query would count rows, which is business data on an open endpoint"
  - "The probe failure is deliberately not logged at error level — an uptime check polling a downed database would emit one error line per poll interval forever"
  - "snapshot() is the only worker-layer import, so the six processor modules and their db/fetch/zod dependencies stay out of the route bundle"
  - "No rate limiting is accepted, not overlooked: the 2s bound caps how long one request can hold a pool connection, and a 1s memoisation is the named cheap mitigation if it is ever needed"
  - "The route header names the three forbidden literals descriptively rather than verbatim, so the plan's grep gate stays mechanically checkable at zero hits"

patterns-established:
  - "Vacuous-truth guard: when a health/aggregate response is derived from a collection that can legitimately be empty, iterate a fixed expected roster and prove it with a key-COUNT assertion"
  - "Adversarial RED: write the bug the central assertion exists to catch, record what it produced, then discard it — the assertion is only a proof if it has been seen to bite"
  - "Test headers state what the suite CANNOT prove (vitest's single module registry cannot reproduce the Turbopack module-graph split), so a green run is not mistaken for production evidence"

requirements-completed: [OBS-03]

# Metrics
duration: 22min
completed: 2026-08-23
---

# Phase 42 Plan 05: `/api/health` Summary

**`GET /api/health` returns 200 with ten live workers and 503 the moment any one is dead — including the case the phase exists for, where `register()` never ran at all and the registry is completely empty.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-08-23T19:28Z
- **Completed:** 2026-08-23T19:50Z
- **Tasks:** 3 (two of them RED gates; task 2 produces no commit by design)
- **Files created:** 2

## Accomplishments

- **The phase's central proof is in place and demonstrated to work.** An empty heartbeat registry
  returns **503** with **exactly ten** workers present and every one `{alive:false, lastTickAt:null}`.
  The key COUNT is asserted, not merely "some worker is dead", because a `processors` object with
  fewer than ten keys is the failure signature.
- **The assertion was proven to bite before it was allowed to pass.** Task 2 wrote the
  registry-iterating implementation on purpose. It answered **HTTP 200** with
  `{"status":"ok","db":{"ok":true,…},"processors":{}}` — zero keys — on an empty registry, which is
  the 2026-08-08 production failure reported as perfectly healthy, while passing **16 of the 19
  tests**. Details below; this is the single most important paragraph in this summary.
- **The DB probe is bounded at 2 s and leaks no timer.** A never-settling `db.execute` resolves to
  `{ok:false, latencyMs:null}` + 503 at the bound rather than hanging the request, and
  `vi.getTimerCount()` is 0 after a fast success.
- **The payload is closed, not merely currently-clean.** The exact top-level key set
  (`{status, db, processors}`), the exact `db` key set (`{ok, latencyMs}`) and each worker's key set
  (`{alive, lastTickAt}`) are asserted, so a future field cannot be added silently to an
  unauthenticated endpoint. A DB rejection carrying a host, an IP, a username and the word
  `password` produces a body containing none of them.
- **The verb surface is closed and input-free.** `GET` is the only export and `GET.length === 0`, so
  the handler reads no query string, no body and no header.

## Task Commits

1. **Task 1: RED — the route suite with the empty-registry proof** — `5008803` (test)
2. **Task 2: RED #2 — prove the assertion bites against a registry-iterating route** — *no commit by
   design; the wrong implementation was written, measured, and discarded per the plan*
3. **Task 3: GREEN — the route with a bounded, non-leaking DB probe** — `2710f73` (feat)

No REFACTOR commit: the GREEN implementation needed no cleanup pass beyond the comment reword
recorded as deviation 1, which landed inside the same commit.

## The two RED runs, recorded as the plan requires

### RED #1 — route absent

| | |
|---|---|
| Command | `npx vitest run "src/app/api/health/__tests__/route.test.ts"` |
| Total tests | **19** |
| Failing | **18** |
| Passing | **1** |
| Failure reason | `Error: Cannot find package '@/app/api/health/route'` — the route did not exist |

The single pass is the `fixture integrity` guard, which asserts the test's local processor/subscriber
fixture covers exactly `EXPECTED_WORKERS` and never touches the route. It passing at RED is correct:
it is a fixture check, not a contract check.

The plan's acceptance criterion required "N tests, N failed" with N ≥ 12. A top-level
`import * as healthRoute from "@/app/api/health/route"` would have produced a **collection error with
zero tests attributed**, which is a weaker RED — nothing would record that the 19 contract assertions
exist. The route is therefore loaded through a dynamic `await import()` inside each case, and the test
header says why. See deviation 2.

### RED #2 — the registry-iterating bug, written on purpose

The wrong implementation built `processors` by reading `globalThis.__pipeliteHeartbeats` and mapping
its `entries()`. Everything else was held identical to the final route: same bounded probe, same
`healthy` conjunction, same response shape.

**Observed on an empty registry:**

| Observation | Value |
|---|---|
| HTTP status | **200** |
| `body.status` | **`"ok"`** |
| `body.processors` | **`{}`** (0 keys) |

That is exactly the 2026-08-08 failure mode — all workers dead, `instrumentation.js` never loaded —
reported as healthy, because `Object.values({}).every(p => p.alive)` is vacuously `true`.

**Result across the suite: 16 passed, 3 failed.** The three failures were:

1. `empty registry returns 503 with all ten workers present and dead …` — `expected 200 to be 503`
2. `returns 503 on an empty registry even though the database probe succeeded` — `expected 200 to be 503`
3. `returns 503 when a single subscriber never registered, and names it` — `expected 200 to be 503`

**The point, made explicit:** a registry-iterating route passes **almost the whole suite** — every
healthy-path case, both bounded-probe cases, all three DB-failure cases, both payload-minimisation
cases, all three verb-surface cases, and even the "one dead worker" case where `execution-processor`
was registered-but-stale. It fails only where a worker is *absent from the map*. Without the
empty-registry assertion this endpoint would have shipped as decoration that passes its own tests.

Failure 3 is an unplanned bonus finding worth carrying forward: the bug's blast radius is wider than
the empty-registry case. **Any** worker that never registered simply *vanishes* from the response
rather than reporting dead, so a single dead `registerAuditSubscriber` — the 2026-08-16
`actor_kind = system` defect — also read as 200 ok. The roster is what makes a *partial*
registration failure visible too, not only a total one.

The wrong implementation and a temporary evidence-capture test were both deleted before the task
ended. Neither is on disk and neither was committed (`git log` shows only `5008803` and `2710f73`).

## Files Created

- `src/app/api/health/route.ts` (151 lines) — the endpoint. Bounded `SELECT 1` probe, roster-based
  worker report via `snapshot()`, 200/503, fixed minimal payload, `GET` only. The header records the
  production failures that motivate it, the unauthenticated-by-construction posture with its
  `middleware.ts:8` citation, the accepted no-rate-limiting residual, and — flagged as a deliberate
  deviation — why the timer is cleared in a `finally`.
- `src/app/api/health/__tests__/route.test.ts` (427 lines, 19 tests) — the OBS-03 route proof. Header
  states both what it proves and, in a section of its own, what it structurally **cannot**.

## Decisions Made

- **`snapshot()` and nothing else from the worker layer.** Importing a processor's `POLL_INTERVAL`
  would drag all six processor modules and their `db`/`fetch`/`zod` dependencies into the route
  bundle. The processors pass their own constants into `registerProcessor`, so the health check's
  staleness expectation cannot drift from the real cadence anyway.
- **Timer hoisted and cleared in a `finally`** (see deviations).
- **`SELECT 1`**, resolving the Claude's-discretion item: it exercises the real `postgres.js` pool
  from `src/db/index.ts:11`, costs ~1 ms, and a "more representative" query would count rows — and a
  count is business data on an unauthenticated endpoint.
- **The probe failure is not logged at error level.** An uptime check polling a downed database would
  otherwise emit one error line per poll interval forever, burying the actual incident. The 503 *is*
  the signal. A test asserts `console.error` is never called on the failure path, so this cannot
  regress into a log flood.
- **The "one dead worker" case uses a registered-but-stale processor**, not an unregistered one, so
  the per-worker staleness math (`execution-processor`: 1 s delay + 5 s interval + 60 s slack) is
  exercised against production constants. A second case covers the unregistered-subscriber shape
  separately — and that second case turned out to be one of the three that catch the RED #2 bug.
- **Test-local interval fixtures rather than imports.** The suite mirrors the real cadences
  (`execution-processor.ts:44` = 5 s; both pruners = 24 h) in a local table with a comment, so the
  test does not import processor modules either. A `fixture integrity` test asserts the table covers
  exactly `EXPECTED_WORKERS`, so a roster change breaks this file loudly instead of silently
  under-testing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] The plan's forbidden-literal grep gate was unsatisfiable as written**

- **Found during:** Task 3 (GREEN), while running the plan's own source gates
- **Issue:** The plan required `grep -c 'export const dynamic\|Cache-Control\|Access-Control'` to
  return **0**, while separately requiring the route to *document* that it sets no `Cache-Control`,
  no CORS headers, and no `export const dynamic`, and that `docs`'s `public, max-age=3600` is
  explicitly not copied. Documenting those verbatim put the literals in the file and the gate read
  **2** — both hits in prose comments, neither in code.
- **Fix:** Reworded the two comment lines to name the three things descriptively ("sets NO cache
  header and NO cross-origin headers", "`docs`'s one-hour public cache directive", "no `dynamic`
  route-segment export") so the documentation intent is fully preserved *and* the gate reads 0. Added
  a sentence saying why the wording is descriptive, so a future reader does not "improve" it back
  into a gate failure.
- **Why this way:** Weakening the gate to `grep` only non-comment lines would have made it fragile;
  dropping the documentation would have violated the plan's explicit instruction to "say so in a
  comment". Rewording satisfies both, and leaves the gate able to catch a real regression — if
  someone actually adds one of those three, the grep goes non-zero immediately.
- **Files modified:** `src/app/api/health/route.ts`
- **Verification:** `grep -cE 'export const dynamic|Cache-Control|Access-Control'` → **0**; the two
  behavioural tests (`response.headers.get("cache-control")` and
  `get("access-control-allow-origin")` both `null`) still pass, so the *substance* is asserted by
  test rather than by grep.
- **Committed in:** `2710f73` (Task 3 commit)

**2. [Rule 3 — Blocking] Dynamic route import instead of the plan's static `import * as healthRoute`**

- **Found during:** Task 1 (RED)
- **Issue:** The plan specified a top-level `import * as healthRoute from "@/app/api/health/route"`,
  but at RED the route does not exist, so vitest fails at **collection** — 0 tests run, and the RED
  evidence becomes a single unresolved-import error. The plan's own acceptance criterion demanded
  "N tests, N failed" with N ≥ 12, which a collection error cannot produce.
- **Fix:** The route is loaded via `await import("@/app/api/health/route")` inside each case, through
  two small helpers. RED #1 consequently reported the real number: 19 tests, 18 failed, each naming
  the contract it was checking. The final GREEN state is unaffected — same module, same namespace
  object, same assertions.
- **Files modified:** `src/app/api/health/__tests__/route.test.ts`
- **Verification:** RED #1 = 19 tests / 18 failed; GREEN = 19 / 0. The verb-surface case still
  inspects the module namespace object and asserts `POST`/`PUT`/`PATCH`/`DELETE` are `undefined`.
- **Committed in:** `5008803` (Task 1 commit)

### Added beyond the plan's enumerated cases

Three tests the plan did not list were added under Rule 2 (missing critical coverage), all inside the
plan's stated intent:

1. **`console.error` is never called on the DB-failure path.** The plan required a *comment*
   explaining why the probe failure is not logged at error level. A comment does not survive a
   refactor; this asserts it, so the log-flood regression fails the suite.
2. **No cache header and no CORS header on the response.** The plan forbade them in the source; this
   asserts them on the actual `Response`, which is what a caching proxy sees and is what still holds
   after deviation 1 removed the grep-able literals.
3. **`fixture integrity`** — the test's local worker table covers exactly `EXPECTED_WORKERS`. Without
   it, a roster change to nine or eleven workers would silently leave this suite testing the wrong
   set while still appearing green.

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking), plus 3 added tests (Rule 2).
**Impact on plan:** No scope change and no architectural deviation. Both Rule 3 fixes resolved direct
contradictions inside the plan's own acceptance criteria; the added tests convert three
comment-only guarantees into asserted ones. Every substantive requirement — the roster-based
response, the bounded non-leaking probe, the closed payload, the closed verb surface — is implemented
exactly as specified.

## Verification Results

| Gate | Required | Observed |
|---|---|---|
| `npx vitest run src/app/api/health/__tests__/route.test.ts` | 0 failures | **19 passed / 0 failed** |
| `npm test` (main project) | ≥ 4406 passed, 0 failed | **4474 passed / 32 skipped / 0 failed** |
| `npm test` (RSC project) | green | **8 passed / 0 failed** |
| `npx tsc --noEmit` | 0 errors | **0 errors** |
| `npx eslint src/app/api/health` | 0 errors | **0 errors, 0 warnings** |
| `clearTimeout` present, inside a `finally` | ≥ 1 | **3 mentions; the call sits at line 133 inside the `finally` at 132** |
| `export const dynamic` / `Cache-Control` / `Access-Control` | 0 | **0** |
| `POST`/`PUT`/`PATCH`/`DELETE` exports | 0 | **0** |
| Route imports | `next/server`, `drizzle-orm`, `@/db`, `@/lib/observability/heartbeat` only | **exactly those four** |

The 4474 figure is the wave-1 handoff baseline of 4455 plus exactly the 19 tests this plan added — no
pre-existing test was disturbed. `tsc` was run separately from vitest on purpose: vitest does not
typecheck, and wave 1 recorded a case of 24/24 green while `tsc` reported a real error.

## Issues Encountered

- **`--reporter=basic` does not exist in vitest 4.0.18** (`Failed to load custom Reporter from basic`).
  Used the default reporter; counts were read from the JSON run log.
- **Capturing the RED #2 evidence needed a workaround.** Assertion diffs are truncated in the run
  log, so a throwaway single-assertion test was used to surface `response.status` and
  `JSON.stringify(body.processors)` one at a time. Both values are recorded above; the throwaway file
  was deleted and never committed.

## Known Stubs

None. Every branch of the route is reached by a passing test, and the response contains no
placeholder or hardcoded value — `db` comes from a real (mocked-at-the-driver) probe and `processors`
from `snapshot()`.

## What this plan does NOT prove — read before trusting the green run

**OBS-03 remains unproven in production.** This suite proves the *handler's logic*. It proves nothing
about whether the heartbeat registry actually bridges Turbopack's module graphs, because vitest has a
**single module registry** and structurally cannot reproduce the four-instance split this repo's own
build exhibits (`src/lib/events/bus.ts` as module IDs `587400`, `117126`, `930245`, `947362` — two of
them inside the graph of a single `register()` call).

So "the route reads the same registry the processors write to" is **untested here at any number of
passing tests**, and both the route header and the test header say so in as many words. The only real
verification is **42-18's container check**. This is not a formality: `src/lib/audit/actor-context.ts`
had the identical hazard and **shipped green**.

There is a sharp corollary an operator should know: if the container's `/api/health` reports all ten
workers `alive:false` while the logs clearly show processors ticking, the bug is the module-graph
bridge, not the workers.

## Next Phase Readiness

**Ready for 42-06** (wiring `registerProcessor`/`registerSubscriber`/`recordTick` into
`instrumentation.ts` and the six processors). The consumer side is complete and asserts the contract,
so a missed `registerProcessor` call in that plan surfaces as a named `alive:false` worker rather than
as silence.

**Required by 42-18:**
1. Hit `/api/health` against the running container and assert **200** with all ten workers
   `alive:true`. That is the module-graph bridge check, and it is the only place the bridge is
   observable.
2. If it returns 503 with all ten dead while processors are visibly logging, that is the split-graph
   fingerprint — not a dead worker.
3. Per amendment A8, do **not** add an `app` healthcheck to `docker-compose.yml`. With
   `restart: unless-stopped`, a healthcheck on an endpoint that legitimately returns 503 when
   degraded could restart-loop the container and turn this observability feature into an outage.

**Note for whoever configures uptime monitoring:** the endpoint is unauthenticated and unrate-limited
by design. The operator's own reverse proxy is the rate-limiting layer; a 1-second memoisation of the
probe result is the named cheap mitigation if a flood ever becomes real (T-42-02, accepted residual).

**Untouched by this plan:** none of the five stale `Dockerfile:24` comments listed in
`deferred-items.md` live in files this plan owns, so none were edited. The route's own header
describes that failure without citing a line number, so it cannot go stale the same way.

---
*Phase: 42-observability*
*Completed: 2026-08-23*
