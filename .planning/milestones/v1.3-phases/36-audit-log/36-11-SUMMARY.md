---
phase: 36-audit-log
plan: 11
subsystem: backend
tags: [audit, crmbus, subscriber, eventemitter, fire-and-forget, asynclocalstorage, tdd, vitest, instrumentation]

# Dependency graph
requires:
  - phase: 36-audit-log
    provides: "36-01 getCurrentActor / runWithActor — the ALS actor read at handler entry"
  - phase: 36-audit-log
    provides: "36-02 buildChanges — the pure diff that produces the changes JSONB"
  - phase: 36-audit-log
    provides: "36-03 auditLog table — the insert target and its column contract"
  - phase: 26-workflow-execution
    provides: "crmBus, the synchronous in-process EventEmitter, and stage-history.ts as the fire-and-forget subscriber template"
provides:
  - "src/lib/events/subscribers/audit.ts — the SOLE capture path for every crmBus-emitting write"
  - "AUDITED_EVENTS — the twelve-event list every later audit plan reasons about, with deal.stage_changed deliberately excluded"
  - "registerAuditSubscriber / _resetForTesting — boot registration and the test-only teardown"
  - "Audit rows now exist at runtime, which is what 36-13 (timeline branch), 36-09 (run linked-records) and 36-18 (pruner) read"
affects: [36-05, 36-06, 36-09, 36-12, 36-13, 36-18, 36-20, instrumentation, timeline, workflow-run-detail]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One bus subscriber captures twelve events via a loop over a named event list, instead of twelve hand-written crmBus.on calls"
    - "Actor captured synchronously into a local at handler entry, before the fire-and-forget promise exists"
    - "Non-async handler + .catch on the insert: the emitter cannot await, so the catch is what keeps a DB failure off the user's write path"

key-files:
  created:
    - src/lib/events/subscribers/audit.ts
    - src/lib/events/subscribers/audit.test.ts
  modified:
    - instrumentation.ts

key-decisions:
  - "deal.stage_changed excluded from AUDITED_EVENTS — it is co-emitted with deal.updated at all four stage-change sites, so subscribing to both writes two rows per kanban drag; a test emits both and asserts exactly one insert"
  - "The no-op guard is scoped to action === 'updated' only — creates and deletes insert even with an empty change map, because a create records initial state and a delete records a tombstone, and without both ends 'who did this' has holes"
  - "The event payload's own userId is never read in this file; absence of an ALS actor records actorKind 'system' with a null actorUserId, and a grep gate plus a test enforce it"
  - "The comment naming the forbidden field is phrased as 'the event payload's own user id' so the grep gate cannot be tripped by its own warning — same trick as 36-01"
  - "Registered in instrumentation.ts inside the existing NEXT_RUNTIME === 'nodejs' guard; the guard is load-bearing because this module imports @/db"

patterns-established:
  - "Pattern 1: a multi-event subscriber's _resetForTesting loops the same exported event list it registers from, so the two can never drift"
  - "Pattern 2: the attribution-laundering test asserts on JSON.stringify(row) rather than a single field, so a leak through any column fails the test"

requirements-completed: [AUDIT-01, AUDIT-02]

# Metrics
duration: 14min
completed: 2026-08-15
---

# Phase 36 Plan 11: Audit Capture Subscriber Summary

The single `crmBus` subscriber that turns twelve CRM events into `audit_log` rows — actor read
synchronously from ALS, diff delegated to `buildChanges`, insert fired and forgotten — registered at
boot behind the Node-runtime guard.

## What Was Built

**`src/lib/events/subscribers/audit.ts`** — the sole capture path for AUDIT-02. A loop over
`AUDITED_EVENTS` attaches one non-async handler per event. Each handler, in order:

1. `getCurrentActor()` into a local, synchronously, at handler entry;
2. `buildChanges(payload)`;
3. returns early when the action is `updated` and the change map is empty;
4. `db.insert(auditLog).values({...}).catch((err) => console.error("[audit]", err))`.

`AUDITED_EVENTS` holds exactly twelve entries — create/update/delete across deal, person,
organization and activity. `deal.stage_changed` is absent, with the four co-emit sites named in the
comment so the omission cannot be misread as a miss.

**`src/lib/events/subscribers/audit.test.ts`** — 15 cases mirroring `stage-history.test.ts`
structurally: the hoisted `vi.mock("@/db")`, the `stubInsert` thenable helper, the `setImmediate`
flush, and the `unhandledRejection` block copied literally from the analog. `@/lib/audit/actor-context`
is deliberately not mocked — the actor cases run against the real `AsyncLocalStorage`.

**`instrumentation.ts`** — two lines, immediately after the stage-history registration, inside the
existing `NEXT_RUNTIME === "nodejs"` guard.

## Key Implementation Details

**Why the actor is captured before the promise.** `EventEmitter.emit` runs handlers inline in the
emitter's own stack, so the ALS context at handler entry is still the mutation's. Reading it inside
the `.then()` continuation was probed and does work on Node 20.20.2, but capturing first does not
depend on ALS continuation semantics surviving a Node upgrade. The comment in the file says so.

**Why the handler cannot be async.** `crmBus.emit` is synchronous and cannot await. An async handler
would return a floating promise with no `.catch` — an unhandled rejection and a silently lost row.
The test asserts `emit` does not throw, that the failure is logged with the `[audit]` prefix, and
that the `process.on("unhandledRejection")` array is empty.

**Why creates and deletes bypass the no-op guard.** `buildChanges` legitimately returns `{}` for a
create with no reported fields and for a delete whose `previous` is empty. Gating all three actions
on a non-empty diff would drop exactly the rows that answer "who created this" and "who deleted
this". Two separate tests assert an empty-diff create and an empty-diff delete still insert.

**`_resetForTesting` blast radius.** It calls `crmBus.removeAllListeners(event)` for all twelve
events, which also detaches the webhook and workflow-trigger listeners for every one of them. The
stage-history caveat is restated in full in both the module and the test file rather than
cross-referenced, because here it is twelve times larger.

## Deviations from Plan

None — plan executed as written.

## Threat Model Outcomes

| Threat ID | Disposition | How it landed |
|-----------|-------------|---------------|
| T-36-02 (attribution laundering) | mitigated | `actor?.kind ?? "system"`, `actor?.userId ?? null`. The event payload's user id appears zero times in the file (grep gate). The test emits with `userId: "victim-user"` and asserts `JSON.stringify(row)` does not contain it. |
| T-36-03 (audit-write suppression) | accepted — see limitation below | `.catch` logs to stderr; the row is lost. |
| T-36-23 (dead subscriber in Docker) | mitigated | Registered inside the `NEXT_RUNTIME` guard beside the other three; the standalone-build copy at `Dockerfile:22-28` still covers `instrumentation.js`. Behavioural proof is deferred to 36-20's browser verification, because a passing unit test does not exercise boot. |
| T-36-24 (double-write on a stage drag) | mitigated | `deal.stage_changed` excluded; grep-asserted to appear only inside a comment; a test co-emits both events and asserts exactly one insert. |
| T-36-SC (package installs) | accepted | Zero packages added. |

## Accepted Limitation (T-36-03)

**A failed audit insert loses the row.** Fire-and-forget means the `.catch` logs to stderr and
execution continues; there is no retry, no dead-letter queue, and no way for the user to know. This
is deliberate and it is the price of AUDIT-02: awaiting the insert inside the mutation would put the
audit table on the user's write path, so a database hiccup on `audit_log` would fail a legitimate CRM
write. Documenting the limitation IS the control. An operator who needs certainty should monitor
stderr for the `[audit]` prefix.

## Deferred Issues

One pre-existing, unrelated test failure was found by the full-suite run and deliberately not fixed —
logged to `.planning/phases/36-audit-log/deferred-items.md`:

- `src/lib/execution/condition-evaluator.test.ts:616` — a Phase 34 wall-clock perf-ratio assertion
  (`expected 33.2 to be less than 10`). Reproduces in isolation on an untouched file; this plan
  modifies only the two audit files and `instrumentation.ts`.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/lib/events/subscribers/audit.test.ts` (before implementation) | exit 1 — RED gate |
| `npx vitest run src/lib/events` | 28 passed, 0 failed |
| `npm run typecheck` | exit 0 |
| `npm test` | 1169 passed, 1 failed (pre-existing, unrelated — see Deferred Issues) |
| `grep -c "payload.userId" audit.ts` | 0 |
| `grep -c "stage_changed" audit.ts` | 1, comment-only (non-comment grep returns 0) |
| `grep -c "async (payload\|async(payload" audit.ts` | 0 |
| `grep -c 'console.error("\[audit\]"' audit.ts` | 1 |
| `grep -c '?? "system"' audit.ts` | 1 |
| `grep -c "registerAuditSubscriber" instrumentation.ts` | 2 |
| `grep -c "startAuditPruner" instrumentation.ts` | 0 (lands in 36-18) |

## TDD Gate Compliance

| Gate | Commit |
|------|--------|
| RED | `c617cd4` `test(36-11): add failing audit subscriber cases` — verified failing before implementation |
| GREEN | `e590fd4` `feat(36-11): add crmBus audit capture subscriber` |
| REFACTOR | not needed — no cleanup pass produced changes |

Sequence is correct: the `test(...)` commit precedes the `feat(...)` commit.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (RED) | `c617cd4` | 15 failing subscriber cases mirroring stage-history.test.ts |
| 2 (GREEN) | `e590fd4` | The subscriber: twelve events, ALS actor, fire-and-forget insert |
| 3 | `fe969d3` | Boot registration inside the NEXT_RUNTIME guard |

## Self-Check: PASSED

- `src/lib/events/subscribers/audit.ts` — FOUND
- `src/lib/events/subscribers/audit.test.ts` — FOUND
- `instrumentation.ts` — FOUND (modified)
- Commits `c617cd4`, `e590fd4`, `fe969d3` — all FOUND in git history
