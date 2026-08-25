---
phase: 35-notes-record-timeline
plan: 06
subsystem: api
tags: [event-bus, eventemitter, drizzle, instrumentation, tdd, vitest, deal-stage-history]

# Dependency graph
requires:
  - phase: 35-01
    provides: deal_stage_history table + dealStageHistory drizzle schema and relations
provides:
  - "crmBus subscriber that persists one deal_stage_history row per deal.stage_changed event"
  - "registerStageHistorySubscriber() wired into instrumentation.ts under the NEXT_RUNTIME=nodejs guard"
  - "_resetForTesting() helper matching the webhook/workflow-trigger subscriber convention"
  - "A populated stage-change source for the timeline assembler to read (plan 35-08)"
affects: [35-08, 35-15, phase-36-audit-log]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget bus subscriber writing to the DB with a mandatory .catch tag"
    - "Module-scope registered guard for idempotent subscriber registration"

key-files:
  created:
    - src/lib/events/subscribers/stage-history.ts
    - src/lib/events/subscribers/stage-history.test.ts
  modified:
    - instrumentation.ts

key-decisions:
  - "One bus subscriber captures all four deal.stage_changed emit sites; zero emit sites modified"
  - "Handler stays synchronous and does not await the insert — crmBus wraps a synchronous EventEmitter, so emit() cannot await"
  - ".catch(err => console.error('[stage-history]', err)) is mandatory: without it a failed insert is an unhandled rejection and the row is lost with no trace"
  - "Accepted secondary race: emit() returns before the insert resolves, so a stage drag immediately followed by a timeline read may not yet show the row. Do NOT fix by making the bus async"
  - "Unit tests cannot prove the subscriber is registered in the Docker standalone build — that risk is carried to plan 35-15's browser verification"

patterns-established:
  - "Subscriber shape: module-scope `let registered`, early return, single crmBus.on, tagged .catch, exported _resetForTesting"

requirements-completed: [NOTE-02]

# Metrics
duration: 12min
completed: 2026-08-15
---

# Phase 35 Plan 06: deal.stage_changed History Subscriber Summary

**A fire-and-forget crmBus subscriber that writes one `deal_stage_history` row per `deal.stage_changed` event from all four existing emit sites, with a mandatory `[stage-history]` error tag and an idempotent registration guard, wired into the Node runtime bootstrap.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 (TDD: RED then GREEN)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `deal.stage_changed` is now a persisted fact rather than an in-memory event, so SC-2's "interleaving … stage changes" is satisfied inside this phase instead of being deferred to Phase 36's audit log.
- All four existing emit sites feed the subscriber without a single line changed in any of them — the entire argument for routing through the bus rather than inlining an insert.
- A failed insert is now visible (`console.error("[stage-history]", err)`) instead of vanishing as an unhandled promise rejection.
- Double registration (hot reload, repeated `register()`) attaches exactly one listener, locked in by a test.

## TDD Cycle

### RED — `test(35-06)` `e74f6df`

`src/lib/events/subscribers/stage-history.test.ts` created with 6 tests, mocking `@/db` before importing the subscriber (vitest hoisting), mirroring `webhook.test.ts`'s `beforeEach(() => { vi.clearAllMocks(); _resetForTesting() })` scaffold:

1. `inserts one deal_stage_history row on deal.stage_changed`
2. `maps a missing oldStageId to a null fromStageId` (asserts `null`, not `undefined`, not `""`)
3. `maps a missing userId to a null changedBy`
4. `does not double-register on repeated calls`
5. `ignores other CRM events` (`deal.updated`, `activity.created`)
6. `logs and does not reject when the insert fails` — attaches a `process.on("unhandledRejection")` collector, asserts `emit()` does not throw, flushes with `setImmediate`, asserts `console.error` got `["[stage-history]", err]` and that the unhandled collector is empty.

Run failed as required: `Cannot find module '/src/lib/events/subscribers/stage-history'` — RED confirmed on the missing module, not on a wrong assertion.

### GREEN — `feat(35-06)` `93192ff`

`src/lib/events/subscribers/stage-history.ts` implements the `<interfaces>` contract, copying `workflow-trigger.ts`'s shape with the `ALL_EVENTS` loop replaced by a single `crmBus.on("deal.stage_changed", ...)`:

```
db.insert(dealStageHistory).values({
  dealId: payload.entityId,
  fromStageId: payload.oldStageId ?? null,
  toStageId: payload.newStageId,
  changedBy: payload.userId ?? null,
}).catch((err) => console.error("[stage-history]", err))
```

The handler is deliberately **not** `async` and does **not** `await` the insert. `instrumentation.ts` gained the registration immediately after `registerWorkflowTriggerSubscriber()`, inside the existing `NEXT_RUNTIME === "nodejs"` guard — appended only, existing registrations and processors untouched.

6/6 tests pass; the whole `src/lib/events` suite is green at 13/13 (no listener leakage into the webhook subscriber tests).

### REFACTOR

None needed — the implementation is 46 lines and already matches the established subscriber shape. No refactor commit.

## Task Commits

1. **Task 1: RED — stage-history subscriber test** — `e74f6df` (test)
2. **Task 2: GREEN — subscriber + instrumentation wiring** — `93192ff` (feat)

## TDD Gate Compliance

RED (`test(35-06)`) precedes GREEN (`feat(35-06)`) in git history. Both gates present. No test passed unexpectedly during RED.

## Emit Sites Inspected and Left Unchanged

All four were read to confirm payload field names, and none were modified (`git diff b3447ef..HEAD` touches only the three files listed above):

| # | File | Site |
|---|------|------|
| 1 | `src/lib/mutations/deals.ts:428` | update path (`stageId` changed within `updateDealMutation`) |
| 2 | `src/lib/mutations/deals.ts:561` | `updateDealStageMutation` |
| 3 | `src/lib/mutations/deals.ts:684` | `reorderDealsMutation` |
| 4 | `src/app/api/v1/deals/[id]/route.ts:352` | v1 REST PATCH, builds `stageChangedPayload` explicitly |

## Accepted Race: emit → read

`crmBus.emit()` returns before the insert resolves. A stage drag immediately followed by a timeline read can therefore observe a timeline that does not yet contain the new row. In practice the client round trip (mutation response → router refresh → timeline query) dwarfs a single INSERT, so the window is effectively unreachable from the UI. **This is accepted deliberately. Do NOT "fix" it by making the bus async** — `CrmEventBus.emit` wraps `EventEmitter.emit`, which is synchronous by contract; making it awaitable would change the latency profile of every one of the 13 CRM events to serve one subscriber.

## Docker Registration Risk — CARRIED FORWARD, NOT CLOSED

**A passing unit test proves the handler works. It does NOT prove the subscriber is alive in the container.**

This repo has already shipped exactly this bug: the Next.js standalone build omitted `instrumentation.js`, `register()` never ran in Docker, and all four processors were silently dead in production (STATE.md, 2026-08-08). The `Dockerfile` now post-build-copies the chunk (lines 22-41), but **that copy is guarded with `|| true` and therefore fails open** — if the copy silently fails, `instrumentation.js` is absent, `register()` never runs, and stage history is silently never written, with no error anywhere.

Threat `T-35-21` (Repudiation) is therefore mitigated by **browser verification in plan 35-15, not by this plan**: drag a deal to a new stage in the running Docker container at `http://localhost:3001`, reload, and confirm a stage-change entry appears in the timeline. If plan 35-15's verification is skipped, NOTE-02 is unverified in production regardless of this plan's green suite.

## Threat Model Dispositions

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-35-21 (subscriber never registered in Docker build) | mitigate | **Deferred to plan 35-15 browser verification** — cannot be closed by a unit test |
| T-35-22 (failed insert vanishing with no trace) | mitigate | Closed — `.catch` + `[stage-history]` tag, asserted by the "logs and does not reject" test |
| T-35-23 (duplicate rows from double registration) | mitigate | Closed — module-scope `registered` guard, asserted by the double-register test |
| T-35-SC (npm installs) | accept | Closed — zero packages installed |

## Files Created/Modified

- `src/lib/events/subscribers/stage-history.ts` (created) — `registerStageHistorySubscriber` + `_resetForTesting`; one listener, fire-and-forget tagged insert
- `src/lib/events/subscribers/stage-history.test.ts` (created, 157 lines) — 6 tests covering mapping, null coercion, idempotency, event isolation, and failure visibility
- `instrumentation.ts` (modified, +3 lines) — dynamic `await import` + call, appended after `registerWorkflowTriggerSubscriber()`

## Decisions Made

- **Deal-specific insert, no generic abstraction.** Matches the plan-35-01 table decision; pluggability lives in the timeline assembler's source interface, not here.
- **`?? null` rather than trusting the payload types.** `DealStageChangedPayload` types `oldStageId` and `userId` as required `string`, but the update path reads `oldStageId` off a row where it can be absent, and a `??` costs nothing while turning a silent `undefined` (which drizzle would omit from the INSERT) into an explicit `NULL`.
- **`_resetForTesting()` removes all `deal.stage_changed` listeners**, including the webhook and workflow-trigger ones, because the bus is a `globalThis`-pinned singleton. This matches the two existing helpers exactly, so it is consistent rather than novel — but a file-header comment in the test warns that a test which resets this subscriber and then asserts on webhook delivery for that event will get a confusing, silently empty result.

## Deviations from Plan

None — plan executed exactly as written. No auto-fixes were required.

## Issues Encountered

None. The `.catch` on `db.insert(...).values(...)` required the test's `values` stub to return a thenable rather than a plain value; this was anticipated in the test's `stubInsert` helper and did not cause a failure.

## Verification

- `npx vitest run src/lib/events/subscribers/stage-history.test.ts` — 6 passed, 0 failed
- `npx vitest run src/lib/events` — 13 passed, 0 failed
- `npm run typecheck` — clean (`tsc --noEmit`, no output)
- `npm run lint` — 0 errors (128 pre-existing warnings across unrelated files; none in the files this plan touched)
- `grep registerStageHistorySubscriber instrumentation.ts` — 2 matches (import + call), inside the nodejs guard, after `registerWorkflowTriggerSubscriber()`
- `git diff b3447ef..HEAD --name-only` — only the three intended files; zero changes to `src/lib/mutations/deals.ts` and `src/app/api/v1/deals/[id]/route.ts`
- No file deletions in either commit

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources introduced.

## Next Phase Readiness

- Plan 35-08 can read `deal_stage_history` and expect it to be populated for any stage change occurring after this deploys.
- **Blocker for phase sign-off, not for the next plan:** plan 35-15 MUST perform the real stage-drag browser verification in Docker. Until then, NOTE-02 is proven only at the unit level.

## Self-Check: PASSED

- Files verified present: `src/lib/events/subscribers/stage-history.ts`, `src/lib/events/subscribers/stage-history.test.ts`, `instrumentation.ts`, `.planning/phases/35-notes-record-timeline/35-06-SUMMARY.md`
- Commits verified in git log: `e74f6df` (test), `93192ff` (feat)

---
*Phase: 35-notes-record-timeline*
*Completed: 2026-08-15*
