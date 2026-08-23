---
phase: 42-observability
plan: 02
subsystem: infra
tags: [observability, health-check, heartbeat, globalThis, turbopack, module-graph, vitest]

# Dependency graph
requires: []
provides:
  - "src/lib/observability/heartbeat.ts — globalThis-backed worker registry, zero imports"
  - "EXPECTED_WORKERS — the hard-coded ten-name roster snapshot() iterates instead of the live map"
  - "registerProcessor(name, expectedIntervalMs, initialDelayMs) — processors pass their own timer constants in"
  - "registerSubscriber(name) — registration IS the liveness claim for event-driven subscribers"
  - "recordTick(name) — no-op on unknown names, never throws"
  - "snapshot(now?) — always exactly ten WorkerReport entries, per-worker staleness"
  - "_resetForTesting() — clears in place so handed-out globalThis references stay valid"
affects:
  - "42-05 (the /api/health route — consumes EXPECTED_WORKERS and snapshot(), never the map)"
  - "42-06 (the six processors — call registerProcessor + recordTick from their tick tails)"
  - "42-07 (the four subscribers — call registerSubscriber at attach, recordTick at handler entry)"
  - "42-17 (instrumentation wiring)"
  - "42-18 (the running-container check that is the REAL verification of the globalThis bridge)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Namespaced globalThis singleton (__pipeliteHeartbeats) — third instance of the module-graph bridge, first one namespaced"
    - "Private state + exported verbs (actor-context.ts shape), deliberately NOT the exported-singleton shape (bus.ts)"
    - "Hard-coded roster iteration as a defence against vacuous truth on an empty collection"
    - "Per-worker staleness thresholds supplied by the worker's own timer constants"
    - "RED #2: run the suite against deliberately wrong implementations to prove the assertions bite"

key-files:
  created:
    - "src/lib/observability/heartbeat.ts"
    - "src/lib/observability/heartbeat.test.ts"
  modified: []

key-decisions:
  - "Namespaced the globalThis key __pipeliteHeartbeats rather than matching the bare-key precedents (crmBus, auditActorStorage); the test asserts the literal string so a reviewer cannot normalise it back"
  - "The registry Map is never exported — only verbs are. An exported Map is the invitation to build the health response by iterating it, which IS the amendment A1 vacuous-truth bug"
  - "snapshot() returns a freshly built plain object, so a caller cannot flip a worker to alive (T-42-13)"
  - "WorkerReport carries exactly two fields (alive, lastTickAt) because it is serialized into an unauthenticated response (T-42-14)"
  - "Subscriber alive is unconditionally true once registered; lastTickAt is diagnostic and never feeds alive, so idle is never reported as dead"
  - "The globalThis-survival test is labelled a PROXY in the test header, in the module header and here — vitest has one module registry and structurally cannot reproduce the four-instance Turbopack split"

patterns-established:
  - "Pattern 1: a health report is built from a hard-coded roster, never from the live registry — Object.values({}).every(...) is true"
  - "Pattern 2: staleness thresholds are per-worker and supplied by the worker, so the check cannot drift from the real cadence"
  - "Pattern 3: liveness for event-driven components derives from registration, not from last activity"
  - "Pattern 4: RED twice — once against the absent module, once against a plausible-but-wrong implementation, recording which named tests each one fails"

requirements-completed: [OBS-03]

# Metrics
duration: 24min
completed: 2026-08-23
---

# Phase 42 Plan 02: Worker Heartbeat Registry Summary

**A zero-import, `globalThis`-backed worker registry whose `snapshot()` iterates a hard-coded ten-name roster rather than the live map — so a totally dead `register()` reports ten dead workers instead of an empty object that `every()` reads as healthy — with per-worker staleness spanning 5 s to 24 h and subscriber liveness derived from registration.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-08-23T15:27:00Z
- **Completed:** 2026-08-23T15:51:25Z
- **Tasks:** 3
- **Files modified:** 2 (both created)

## Accomplishments

- `src/lib/observability/heartbeat.ts` (234 lines, **zero imports**) — the registry all six processors, all four subscribers and `/api/health` will share.
- `snapshot()` iterates `EXPECTED_WORKERS`, so an unregistered worker is reported `{alive:false, lastTickAt:null}` — **present in the JSON and false**, never absent. This is the phase's central defence (amendment A1 / T-42-10) and it is proven twice: by the empty-registry key-count test, and by RED #2 wrong implementation A actually failing it.
- Per-worker staleness across a **17,280× cadence spread**: `audit-prune` stays alive 24 h (and 47 h) after its tick, `execution-processor` dies at +71 s, and one test asserts the two are independent at the *same instant* — the daily pruner alive while the 5-second worker is dead.
- Subscriber `alive` derives from registration alone; a subscriber is alive 30 days after registering with no event ever handled, and a year-old `lastTickAt` does not drag it to dead.
- The registry `Map` is **not exported**, asserted by reflecting over the module's own export surface for any `Map` value.
- `src/lib/observability/heartbeat.test.ts` (359 lines, 25 tests), whose header states plainly what it cannot prove.

## Task Commits

1. **Task 1: RED #1 — the contract against the absent module** — `3f9ecdf` (test)
2. **Task 2: RED #2 — prove the assertions bite** — no commit **by design**; the plan says "Do not commit either wrong implementation", so this task's artifact is the recorded evidence below rather than a file. Both wrong implementations were deleted before Task 3.
3. **Task 3: GREEN — implement heartbeat.ts** — `c5b1306` (feat)

No REFACTOR commit: the implementation went in clean and there was nothing to clean up.

## RED counts — observed, not assumed

### RED #1 (Task 1)

| Run | Result |
|---|---|
| Module genuinely absent (as the plan requires) | **Collection failure.** 1 suite failed, **0 tests collected**, 0 passed, 0 failed. Reason: `Cannot find module './heartbeat' imported from …/heartbeat.test.ts`. Exit non-zero. |
| Against a throwaway no-op stub (created, measured, deleted, **never committed**) | **25 tests, 24 failed, 1 passed.** |

The plan's acceptance criterion asked for an observed "N tests, N failed" with N ≥ 15. An **absent** module cannot produce that — vitest fails at collection, so the per-test count is structurally 0. Both numbers are therefore recorded rather than one being presented as the other. The stub run is what establishes N = 25 ≥ 15.

The single test that passed against the stub was *"the registry map is never exported — exports no Map"*. It is a negative assertion and a stub that exports nothing satisfies it vacuously. That it can pass on an empty module is exactly why it was re-checked in RED #2 wrong implementation C, where it fails as intended.

### RED #2 (Task 2) — 25 tests each run

**Wrong implementation A — the amendment A1 bug on purpose.** `snapshot()` iterates `workers.entries()` instead of `EXPECTED_WORKERS`; everything else correct. **6 failed / 19 passed.** Both mandated tests failed:

- ✅ *snapshot() — roster completeness (amendment A1) → returns exactly ten keys against a cleared registry, every one dead* — **REQUIRED, failed**
- ✅ *snapshot() — roster completeness (amendment A1) → still returns ten keys when only one worker registered, with the other nine dead* — **REQUIRED, failed**
- *snapshot() — roster completeness (amendment A1) → reports a never-registered worker as present-and-false, never as absent*
- *recordTick() (T-42-11) → is a no-op for a name that was never registered*
- *recordTick() (T-42-11) → does not create an entry for an unknown name*
- *_resetForTesting() → empties the registry, returning snapshot() to the all-dead ten-key object*

No strengthening of the tests was needed — both required assertions bit on the first attempt.

**Wrong implementation B — the Pitfall 3 bug on purpose.** A single global `now - lastTickAt <= 300_000` rule instead of per-worker `expectedIntervalMs`; roster iteration left correct so the two bugs stay isolated. **7 failed / 18 passed:**

- ✅ *processor staleness (Pitfall 3) → **audit-prune is STILL ALIVE twenty-four hours after its tick*** — **REQUIRED, failed**
- *processor staleness → audit-prune is dead past 48 h + 60 s*
- *processor staleness → trash-prune, the other daily worker, survives 24 hours the same way*
- *processor staleness → keeps two workers on different cadences independent of one another*
- *processor staleness → execution-processor with no tick yet is alive inside its first-tick budget and dead past it*
- *processor staleness → execution-processor that has ticked is alive at +60 s and dead at +71 s*
- *processor staleness → advances the tick clock so lastTickAt tracks the real tick, not registration*

**Wrong implementation C — added beyond the plan (three "a reviewer would normalise this" bugs at once).** Bare `heartbeats` globalThis key matching the existing precedents + the registry `Map` exported + subscriber `alive` derived from `lastTickAt`. Roster iteration and per-worker staleness left correct. **10 failed / 15 passed**, in three disjoint groups that map one-to-one onto the three defects:

| Defect | Failing tests |
|---|---|
| bare globalThis key | *stores registrations on globalThis.\_\_pipeliteHeartbeats*; *uses the NAMESPACED key, not a bare one*; *lets an independently captured reference to the slot see writes made through the verbs*; *keeps the same slot identity across \_resetForTesting*; (+ incidentally *recordTick → does not create an entry for an unknown name*, which reads through the bridge) |
| exported Map | *the registry map is never exported (T-42-13) → exports no Map* |
| subscriber alive from lastTickAt | all four *subscriber liveness — registration, not lastTickAt* cases |

This run is what upgrades three of this plan's success criteria from "asserted" to "demonstrated to bite".

## Verification

| Gate | Result |
|---|---|
| `npx vitest run src/lib/observability/heartbeat.test.ts` | **25 passed / 0 failed** |
| `npx tsc --noEmit` | **0 errors** |
| `npm test` | **4431 passed / 32 skipped / 0 failed** (baseline 4406 + the 25 new) + **RSC 8/8** |
| `npx eslint .` | **0 errors**, 122 pre-existing warnings; the two new files contribute **0 errors and 0 warnings** |
| `grep -c '^import' heartbeat.ts` | **0** |
| `grep -cE 'export const workers\|export \{ workers\|export let workers'` | **0** — the map is never exported |
| `grep -c 'for (const .* of EXPECTED_WORKERS)'` | **1** |
| `grep -cE 'workers\.(keys\|entries\|values)\(\)'` | **0** — nothing iterates the map |
| `grep -c '__pipeliteHeartbeats'` (code lines) | **2** (type widening + write-back), plus 1 header mention |
| Line counts | `heartbeat.ts` 234 (min 90), `heartbeat.test.ts` 359 (min 140) |

Baseline preserved exactly: **4406 → 4431 passed** is +25, matching the new test count with nothing else moved.

## Files Created/Modified

- `src/lib/observability/heartbeat.ts` — the registry. `EXPECTED_WORKERS` roster, `registerProcessor`/`registerSubscriber`/`recordTick`/`snapshot`/`_resetForTesting`, a private `Map` on `globalThis.__pipeliteHeartbeats`. Header carries both incident write-ups (2026-08-08 `Dockerfile:24`, 2026-08-16 `actor_kind = system`), the four Turbopack module IDs, the reason the key is namespaced, what a subscriber's `alive` proves and cannot prove, the module-graph-split fingerprint, and the `next dev` fork caveat.
- `src/lib/observability/heartbeat.test.ts` — 25 tests in seven groups: roster (2), roster completeness (3), processor staleness (7), `recordTick` safety (2), subscriber liveness (4), the globalThis bridge (4), never-exported map (2), reset (1).

## Decisions Made

- **Namespaced the key.** Both precedents are bare (`crmBus`, `auditActorStorage`). Deviating from a twice-established local convention needs a reason, and there are two: `__pipeliteHeartbeats` cannot collide with a dependency's or a future Next internal's global, and this module's slot is written by ten callers across three graphs rather than one. The divergence is stated in the module header *and* asserted as a literal string in the test, because an unexplained divergence from convention is exactly what a reviewer tidies away.
- **Copied `actor-context.ts`'s shape, not `bus.ts`'s.** Both use the singleton idiom identically; the difference is that `bus.ts` exports the singleton. Here that difference is load-bearing rather than aesthetic — an exported `Map` is the thing that invites a caller to write `Object.values(workers)`, which is the A1 bug. So the map is private and `snapshot()` is the only read path, asserted by reflecting over the export surface.
- **`snapshot(now?)` takes the clock as a parameter.** Makes every staleness boundary assertable to the millisecond without timer control. The suite pins both sides of each boundary (alive at exactly the threshold, dead at threshold + 1 ms) rather than sampling comfortably inside it, which is what makes the 24 h and 70 s cases meaningful.
- **Added wrong implementation C.** The plan required A and B. Three of this plan's binding constraints — the namespaced key, the never-exported map, and subscriber-liveness-from-registration — had assertions with no evidence they bit. C cost one file mutation and one test run and covered all three, in disjoint failure groups so each defect is individually attributable.
- **Fixed system time in `beforeEach` rather than capturing `Date.now()`.** The 70 s and 48 h + 60 s boundaries are asserted at exact millisecond thresholds; a few milliseconds of drift between `registerProcessor()` and a captured `t0` would make those tests flaky. `vi.setSystemTime(BASE)` makes `registeredAt` an exact known number. Timer *advancement*, where used, is the `await vi.advanceTimersByTimeAsync(n)` form as the plan requires.

## Deviations from Plan

No Rule 1/2/3 auto-fixes were needed — no bugs, no missing critical functionality, no blockers. Three procedural notes:

**1. [Procedural] RED #1's "N tests, N failed with N ≥ 15" is unobtainable from an absent module.**
- **Found during:** Task 1
- **Issue:** The task forbids creating `heartbeat.ts`, but with the module absent vitest fails at *collection* — 1 suite failed, **0** tests collected. There is no per-test failure count to record, so the acceptance criterion as literally written cannot be satisfied by the run the task mandates.
- **Resolution:** Recorded the honest module-absent result (collection failure, 0 collected), then ran the suite once against a throwaway no-op stub to obtain the real per-test count (25 tests, 24 failed, 1 passed). The stub was deleted and never committed. Both numbers are reported above rather than one being passed off as the other.
- **Files modified:** none persisted.

**2. [Procedural] Task 2 produced no commit.**
- The plan explicitly says "Do not commit either wrong implementation" and Task 2's only listed file is the one it must not commit. Its deliverable is the recorded failing-test evidence above, not an artifact. Noted here so the missing commit is not read as a skipped task.

**3. [Scope addition] Wrong implementation C, beyond the plan's A and B.** Rationale under Decisions Made. Zero persisted files.

---

**Total deviations:** 0 auto-fixed (0 bugs, 0 missing critical, 0 blocking). 2 procedural notes + 1 scope addition that strengthens verification.
**Impact on plan:** None on the delivered interface, which matches the plan's `<interfaces>` block exactly. No scope creep — the one addition was a throwaway measurement.

## Issues Encountered

- **`.planning/phases/42-observability/42-PATTERNS.md` does not exist**, though the plan's `<context>` block and Task 1's `<read_first>` both reference it. The phase directory contains `42-CONTEXT.md`, `42-RESEARCH.md` and `42-VALIDATION.md` only. Substituted `42-RESEARCH.md` § "Pattern 2: The heartbeat registry" (lines 414–566), which contains both singleton analogs, the full per-worker constants table and the proposed source — everything the plan attributes to PATTERNS. No information was lost, but **later plans in this phase reference the same missing file** and their executors will hit this too.
- The repo-root `CLAUDE.md` is empty (0 bytes), so no project-specific directives applied.

## Known Stubs

None. Every exported verb is fully implemented; no placeholder values, no TODO/FIXME, no unwired data paths.

## Threat Flags

None. The module introduces no network endpoint, no auth path, no file access and no schema change. `WorkerReport` was deliberately held to two fields precisely to avoid widening the unauthenticated surface that plan 05 will expose (T-42-14).

## What this plan does NOT prove — read before trusting it

The `globalThis` cases are a **PROXY**, and the module header, the test header and this section all say so.

Vitest has a **single module registry**. `heartbeat.ts` is instantiated exactly once under vitest no matter what the suite asserts, so the suite structurally *cannot* reproduce the four-instance Turbopack split (module IDs `587400`, `117126`, `930245`, `947362`) that this module exists to survive. The tests prove the bridge mechanism is present and that the key is the namespaced one; they do **not** prove the bridge works across module graphs.

This is not a theoretical caveat. `src/lib/audit/actor-context.ts:38-39` makes the identical statement about the identical hazard, and it makes it *because the defect it describes shipped green* — a deal created by a logged-in user in the browser produced `actor_kind = system` in the running container while the whole suite passed. A green run here means "the mechanism is present", never "the mechanism works".

**The real verification is plan 18's check against the running container.** Until that runs, OBS-03 is unproven in production regardless of this plan's 25 green tests.

## Next Phase Readiness

Ready. The `<interfaces>` contract is fixed as specified and downstream plans can code against it without renegotiation:

- **Plan 05 (`/api/health`)** — import `EXPECTED_WORKERS` and `snapshot()`. **Do not import the map; it is not exported.** Build the response from `snapshot()`'s output, which is already exactly ten keys, so `Object.values(...).every(...)` is safe. `heartbeat.ts` has zero imports, so this pulls nothing else into the route bundle.
- **Plan 06 (processors)** — `registerProcessor(name, INTERVAL, INITIAL_DELAY)` using the same constants the worker's own timer uses, plus `recordTick(name)` immediately before the existing `scheduleTick(...)` line and **outside** the try/catch.
- **Plan 07 (subscribers)** — `registerSubscriber(name)` at attach; `recordTick(name)` at handler entry, before any early return. **Never** read a subscriber's `let registered` flag from the route — that flag lives in a different module instance; the registry is the bridge.
- **Plan 18** — the container check is the only real verification of the bridge. Treat it as mandatory, not confirmatory.

One concern to carry forward: the missing `42-PATTERNS.md` will trip other executors in this phase.

## Self-Check: PASSED

- `src/lib/observability/heartbeat.ts` — FOUND
- `src/lib/observability/heartbeat.test.ts` — FOUND
- Commit `3f9ecdf` (test) — FOUND
- Commit `c5b1306` (feat) — FOUND

---
*Phase: 42-observability*
*Completed: 2026-08-23*
