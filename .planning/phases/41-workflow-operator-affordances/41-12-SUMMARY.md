---
phase: 41-workflow-operator-affordances
plan: 12
subsystem: workflow-execution
tags: [wfops-03, wfops-04, execution-processor, failure-alert, multi-instance, a3, a4]
requires:
  - "src/lib/execution/failure-alert.ts (plan 41-08): maybeAlertOnRunFailure(runId)"
  - "src/lib/triggers/create-run.ts:65-73: the atomic-claim protocol this fix joins"
provides:
  - "three maybeAlertOnRunFailure call sites, one per terminal-failure path"
  - "processWaitingRuns: a transactional, status-guarded delay-resume claim (A3)"
  - "alertOnRunFailure: a tick-safe alert wrapper, one place, three callers"
affects:
  - "docs/admin/deployment/{docker,vercel}.md — the 'waiting resume' row's claim is now TRUE"
tech-stack:
  added: []
  patterns:
    - "guarded UPDATE ... RETURNING as the claim, matching claimWorkflowRun and processPendingRuns"
    - "db.transaction wrapping a SELECT ... FOR UPDATE SKIP LOCKED so its locks actually hold"
    - "await-inside-try-catch for fire-and-forget-safe side effects in a drain loop"
key-files:
  created: []
  modified:
    - src/lib/execution/execution-processor.ts
    - src/lib/execution/execution-processor.test.ts
decisions:
  - "A3 resolved with the db.transaction wrapper AND the guard, not the drop-the-clause alternative, because plan 41-04's shipped deployment docs already state 'Now wrapped in a transaction with that guard added'"
  - "One local alertOnRunFailure wrapper rather than three inline guards"
  - "executeRun moved OUTSIDE the transaction: the claim commits first, then the runs execute"
  - "The alert is awaited inside a try/catch rather than voided, so a synchronous throw is caught too"
metrics:
  duration: ~35 min
  tasks: 2
  files-modified: 2
  tests-added: 24
  completed: 2026-08-22
---

# Phase 41 Plan 12: Failure Alert Wiring + The A3 Delay-Resume Fix Summary

The execution processor now emails a workflow's author from all three places a run reaches a
terminal failed state — including the lease-killed run that never passes through `executeRun` — and
delay resume is a genuine atomic claim, so two replicas can no longer both resume the same delayed
run.

## What Was Built

**Task 1 — the A3 fix (`542490e`).** `processWaitingRuns` was the one claim path in this file that
was not multi-instance safe. Its `SELECT … FOR UPDATE SKIP LOCKED` ran through `db.execute` on a
transaction-free postgres-js client, so the row locks were released at the end of that statement,
and the follow-up step `UPDATE` carried no status predicate. Two instances could both select the
same ready step and both call `executeRun`, duplicating the run's remaining steps and every side
effect after the delay.

**Task 2 — three alert call sites (`cf6c0f2`).** `maybeAlertOnRunFailure` is now invoked from
`processPendingRuns`, `processWaitingRuns` and `reclaimStaleRuns`, in every case *after* the
`executeRun` try/catch and unconditionally.

## Recorded RED Counts

TDD mode was on and every RED was run before its GREEN. Per the tdd_mode instruction, task 1's RED
was run twice — once with the change absent, once against a plausible-but-wrong implementation — to
prove the assertions actually bite rather than passing on a technicality.

| Gate | Command | Result |
|------|---------|--------|
| Task 1 RED #1 (fix absent) | `vitest run execution-processor.test.ts` | **4 failed / 12 passed** |
| Task 1 RED #2 (guard + transaction present, zero-row back-off absent) | same | **2 failed / 14 passed** |
| Task 1 GREEN | same | 16 passed / 0 failed |
| Task 2 RED (call sites absent) | same | **10 failed / 23 passed** |
| Task 2 GREEN | same | 33 passed / 0 failed |

**RED #2 is the one worth keeping.** With the guard and the transaction in place but no zero-row
skip, exactly the two back-off assertions failed — the lost-claim test and the
`continue`-not-`break` test — while the guard and structural tests went green. That is the proof
that the zero-row assertions test the *back-off* and not merely the presence of an `and(...)`.

**Task 2's RED also exposed a vacuity trap the plan predicted.** Three of the four tick-resilience
tests *passed* in RED, because with no call site at all the rejecting and synchronously-throwing
alert mocks were never invoked and the drain trivially completed. Only the anti-vacuity
"happy path alerts a NON-zero number of times" assertions failed. Had the plan not mandated those,
a missing call site would have shipped behind four green resilience tests.

## Decisions Made

**A3: the `db.transaction` wrapper, not the drop-the-clause alternative.** The plan left this open
and asked for a choice plus a reason. The reason is external: plan 41-04's already-merged
`docs/admin/deployment/docker.md:263` states *"Now wrapped in a transaction with that guard added."*
Dropping the `FOR UPDATE SKIP LOCKED` instead would have been defensible on its own merits — the
guarded write is the load-bearing half — but it would have made a shipped operator-facing document
false. So both halves went in: the transaction makes the SELECT's locks hold until the claims are
written, and the `status = 'waiting'` predicate in the write is what a loser can detect. **41-04's
`waiting resume` doc row is accurate as written and needs no revision.**

**`executeRun` runs outside the transaction.** The claim phase collects the run ids and commits;
the execution loop then runs them. A run's execution takes seconds and issues its own writes, so
holding the step locks across it would serialize the whole table behind one slow workflow. This
reorders the work slightly relative to the old code (all claims, then all executions, rather than
interleaved) with no change in outcome.

**One `alertOnRunFailure` wrapper, three callers**, rather than three inline guards — the
resilience lives in exactly one place and cannot be re-implemented inconsistently.

**The alert is `await`ed inside a `try/catch`, not `void`ed.** This is the shape that survives both
failure modes: a rejected promise *and* a synchronous throw before a promise is ever returned. A
bare `void maybeAlertOnRunFailure(id)` with a `.catch` handles the first and not the second, which
is why the tests assert both mock shapes separately. The cost of awaiting is one extra `SELECT` per
completed run — `maybeAlertOnRunFailure` returns early on a non-failed run and never awaits
`safeSend` — which is negligible against a 5-second poll.

## Constraint Compliance

| Binding constraint | How it was met |
|---|---|
| There is no failure path to hook — DETECT (A4) | All three calls sit after the try/catch and are unconditional; the module re-reads terminal status. Asserted by the "alerts after executeRun returns successfully" cases |
| `reclaimStaleRuns`' returned ids must also alert | Site 3 loops the `RETURNING id` rows. Asserted once-per-row, zero for `[]`, and no-throw for `undefined` |
| An alert throw must not abort a tick | `alertOnRunFailure` wrapper. Asserted with a rejecting mock AND a synchronously-throwing mock, in pending, waiting and reclaim paths |
| A3: transaction wrapper AND `WHERE status = 'waiting'` | Both applied. **The fix landed — 41-04's docs stay true and need no rewrite** |
| A failed dry run must not alert | Consumed from wave 2's `failure-alert.ts` (`if (run.dryRun) return`), not re-implemented. The call sites pass only an id and check nothing themselves |
| Never `npm install` | Nothing installed |
| No schema/migration/Docker work | None |
| Do not touch `src/messages/*.json` or `locale-parity.test.ts` | Untouched |
| No real email / live SMTP | The alert module is mocked in every test; nothing sends |
| `create-run.ts` and the inbound webhook route unmodified | Untouched, and asserted structurally (the processor imports neither) |
| Do not modify STATE.md / ROADMAP.md | Untouched |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] My own structural-scan regex could never match the wrapper it was written to find**
- **Found during:** Task 2 GREEN
- **Issue:** The three-call-site assertion used
  `/\b[A-Za-z_$][A-Za-z0-9_$]*[Aa]lert[A-Za-z0-9_$]*\(/`. The required leading character class eats
  the `a` of `alertOnRunFailure`, so the pattern demanded a *second* occurrence of "alert" later in
  the same identifier and matched nothing. The symptom was a single failing test claiming
  `reclaimStaleRuns` had no alert call while the behavioural test for that exact call site passed —
  i.e. a false negative that, in the other direction, is exactly how a scan test rots into being
  unsatisfiable.
- **Fix:** Changed the leading class to `*`, and commented *why* it must be `*` and not `+` so the
  next reader does not "tighten" it back. Verified non-vacuous out-of-band: the corrected pattern
  matches both permitted shapes (`alertOnRunFailure(`, `maybeAlertOnRunFailure(`) and rejects
  alert-free processor code (`console.error(`, `executeRun(`, the old reclaim body).
- **Files modified:** `src/lib/execution/execution-processor.test.ts`
- **Commit:** `cf6c0f2`

**2. [Rule 3 — Blocking] Existing `processWaitingRuns` test mocks could not survive the fix**
- **Found during:** Task 1
- **Issue:** The three pre-existing tests mocked the update builder as
  `{ set, where: vi.fn().mockResolvedValue(undefined) }`. A claim that chains `.returning()` after
  `.where()` hits `undefined.returning`.
- **Fix:** Replaced with a `makeUpdateChain` factory — a thenable stand-in whose `set`/`where`
  return the chain, whose `returning` resolves a queued result per call (so a two-step batch can
  have the first win and the second lose), and which records every `.set(...)` and `.where(...)`
  argument for inspection. Also added `transaction: vi.fn()` to the db mock, running the callback
  inline against the same mock so every existing `tx.execute` / `tx.update` assertion still reads
  through the same two spies.
- **Files modified:** `src/lib/execution/execution-processor.test.ts`
- **Commit:** `542490e`

**3. [Rule 3 — Blocking] Stale worktree base**
- **Found during:** Setup
- **Issue:** The worktree branched from `aa01de2` rather than the required `6393fc1` — the twelfth
  for twelve. `src/lib/execution/failure-alert.ts` was absent, so task 2 had nothing to import.
- **Fix:** `git reset --hard 6393fc1`, re-verified the sanity file exists.
- **Commit:** n/a (pre-work)

### Housekeeping

Merged the file's two separate `drizzle-orm` import lines (`sql` on one, `eq` on another) into one
while adding `and`. Lint warnings went **125 → 123**; they were not restored.

## Files Changed

| File | Change |
|---|---|
| `src/lib/execution/execution-processor.ts` | +98/-… — the A3 claim fix, the `alertOnRunFailure` wrapper, three call sites, the A4 and coverage-gap rationale comments |
| `src/lib/execution/execution-processor.test.ts` | +327 — 24 new tests, plus the `makeUpdateChain` / `functionRegion` helpers |

`processPendingRuns`' claim SQL is byte-for-byte unmodified, and a new test pins it that way: it is
a single statement, so its `FOR UPDATE SKIP LOCKED` and atomic `UPDATE … RETURNING` were already
safe, and A3 was never about it.

## Verification

| Gate | Required | Result |
|------|----------|--------|
| `npx vitest run src/lib/execution/execution-processor.test.ts` | green | **33 passed / 0 failed** |
| `npx vitest run src/lib/execution/` | green | **330 passed / 0 failed** |
| `npm test` | baseline + additions | **4213 passed / 32 skipped** (baseline 4189 + 24 new) |
| `npm test` (RSC project) | 8/8 | **8 passed** |
| `npm run typecheck` | 0 errors | **0 errors** |
| `npm run lint` | 0 errors, ≤127 warnings | **0 errors / 123 warnings** (baseline 125) |

The +24 test delta matches the file exactly (9 → 33 tests), so nothing regressed and nothing
elsewhere was silently altered.

## Known Stubs

None.

## Deferred Issues

None.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change — the two files
touched are a background processor and its unit test, and the two trust boundaries in play
(replica-vs-replica on `workflow_run_steps`, and the alert path vs the drain loop) were both
mitigations delivered by this plan rather than new surface.

## TDD Gate Compliance

Plan type is `tdd`. Gate sequence in `git log`:

- **RED** — recorded in the table above. No standalone `test(...)` commit: both tasks modify one
  pre-existing test file alongside the source it covers, and the plan's own commit-type guidance
  makes each task one atomic commit. The RED-before-GREEN ordering is recorded here with actual
  counts, and RED #2 was run against a deliberately-wrong implementation to prove the assertions
  bite.
- **GREEN** — `542490e` (`fix`), `cf6c0f2` (`feat`).
- **REFACTOR** — not needed; no separate refactor commit.

## For The Next Plan / The Verifier

- **41-04's deployment docs need no change.** Both `docker.md:263` and `vercel.md:272` claim the
  waiting resume is *"Safe — repaired in this release"* with a transaction and a guard. Both halves
  shipped. That row is now true.
- **The two coverage gaps are still open, on purpose**, and are recorded in a comment at the top of
  `execution-processor.ts` as well as in 41-04's docs: recursion-limit failures (inserted
  already-`failed`, never claimed by the processor) and synchronous webhook-response runs (executed
  inline by the inbound webhook route). Anyone "completing" WFOPS-03 by alerting from
  `create-run.ts` or the webhook route would be putting email latency inside a live HTTP request,
  which is the reason the hook is in the processor at all.
- **The mock-hoisting trap is real and now documented in the file itself.** A header comment on
  `execution-processor.test.ts` records that the module under test must be loaded with
  `await import(...)` inside each test, because a static import is hoisted above the `mockDb`
  declarations and fails as a 0-test collection error that reads like a missing module.
