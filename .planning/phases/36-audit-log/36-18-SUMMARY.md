---
phase: 36-audit-log
plan: 18
subsystem: infra
tags: [postgres, drizzle, retention, background-processor, setTimeout, ctid, vitest, fake-timers]

# Dependency graph
requires:
  - phase: 36-08
    provides: readRetentionDays — the zod-validated retention window whose `null` means "delete nothing"
  - phase: 36-11
    provides: the audit capture subscriber and the NEXT_RUNTIME guard block in instrumentation.ts
provides:
  - "src/lib/audit/prune.ts — the only deletion path for audit_log, a daily self-scheduling setTimeout chain"
  - "Capped ctid batch delete: BATCH_SIZE=5000, MAX_BATCHES_PER_TICK=20, TICK_INTERVAL=24h, INITIAL_DELAY=60s"
  - "Fail-closed retention: a null window issues zero database calls in that tick"
  - "First fake-timer suite for a setTimeout chain in src/lib/audit"
  - "[audit-prune] startup log line — the operational evidence that instrumentation.ts is alive in the Docker standalone build"
affects: [36-20 browser verification, 36-19 timeline toggle, any future app_settings-driven background job]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capped ctid batch delete with the cutoff computed server-side by make_interval"
    - "Fail-closed background job: an unreadable setting means zero writes, not a defaulted write"
    - "Fake-timer coverage of a setTimeout chain, including reschedule-on-throw via vi.getTimerCount()"

key-files:
  created:
    - src/lib/audit/prune.ts
    - src/lib/audit/prune.test.ts
  modified:
    - instrumentation.ts

key-decisions:
  - "The retention cutoff is computed by Postgres (now() - make_interval(days => $1)); no JS Date is ever bound into the fragment"
  - "Deletion targets ctid, not id — measured 17.8 ms vs 311.5 ms per 5,000 rows at 1M rows, even with the created_at index"
  - "MAX_BATCHES_PER_TICK caps a tick at ~100k rows/day and accepts starvation, because the per-tick total is logged and therefore visible"
  - "affectedRows() degrades an unrecognised driver result to 0, which stops the batch loop rather than looping at a phantom full batch"
  - "scheduleTick stays module-private so no caller can start a second, overlapping chain"

patterns-established:
  - "Pattern: tail scheduleTick(TICK_INTERVAL) sits outside the try/catch under the comment `// Always schedule the next tick`"
  - "Pattern: assert fail-closed by the ABSENCE of the db call, never by a zero row count"

requirements-completed: [AUDIT-04]

# Metrics
duration: 17min
completed: 2026-08-16
---

# Phase 36 Plan 18: Audit Retention Pruner Summary

**A daily self-scheduling pruner that deletes expired `audit_log` rows in capped `ctid` batches, deletes nothing at all when the retention window is unreadable, and always reschedules — including after a throw.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-08-16T03:01:00Z
- **Completed:** 2026-08-16T03:18:04Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `src/lib/audit/prune.ts` (145 lines): a `setTimeout` chain — never a repeating interval timer — that reads the retention window, deletes in up to 20 batches of 5,000 rows by `ctid`, logs the total and the window every tick, and reschedules 24 h out from *outside* the `try`/`catch`.
- Fail-closed behaviour is real and tested by absence: `readRetentionDays()` resolving `null` produces **zero** `db.execute` calls in that tick. There is deliberately no `?? 90` fallback — the 90-day default is the seeded `app_settings` row from migration 0014 (36-03), and a code-level fallback would turn a tampered or cleared row back into an unbounded delete.
- `src/lib/audit/prune.test.ts` (13 cases): fake-timer coverage of the `INITIAL_DELAY`/`TICK_INTERVAL` cadence, the one-batch caught-up path, the exact `MAX_BATCHES_PER_TICK` cap, the tick log, the `ctid` SQL form, the `make_interval` binding with no JS `Date` in the params, and reschedule-on-throw for **both** a rejecting settings read and a rejecting delete.
- `instrumentation.ts` registers `startAuditPruner()` inside the existing `NEXT_RUNTIME === "nodejs"` guard, grouped with the other `start*Processor()` calls and leaving 36-11's `registerAuditSubscriber()` untouched.

## Task Commits

1. **Task 1 (RED): failing pruner suite** — `a577097` (test)
2. **Task 2 (GREEN): capped ctid pruner** — `42ba913` (feat)
3. **Task 3: instrumentation registration** — `df0ace1` (chore)

No REFACTOR commit: the GREEN implementation needed no cleanup beyond two in-commit comment rewordings (see Deviations).

## TDD Gate Compliance

- RED gate: `a577097` `test(36-18): …` — suite failed for the right reason (`Cannot find module '/src/lib/audit/prune'`), 0 tests collected, exit 1.
- GREEN gate: `42ba913` `feat(36-18): …` — 13/13 pass.
- REFACTOR gate: not required; no behaviour-preserving restructuring was needed.

Gate sequence `test(...)` → `feat(...)` is present and in order in `git log`.

## Files Created/Modified

- `src/lib/audit/prune.ts` — the pruner. Exports `startAuditPruner`, `INITIAL_DELAY`, `TICK_INTERVAL`, `BATCH_SIZE`, `MAX_BATCHES_PER_TICK`; keeps `scheduleTick`, `deleteBatch` and `affectedRows` module-private.
- `src/lib/audit/prune.test.ts` — 13 cases across four describes: `startAuditPruner`, `retention window`, `the delete statement`, `the chain always reschedules`.
- `instrumentation.ts` — three added lines registering the pruner last, after `startExecutionProcessor()`.

## Decisions Made

- **`ctid`, with the numbers written into the source.** The comment above `deleteBatch` carries all three measured strategies (17.8 ms / 311.5 ms / 395.7 ms) so the next reader does not "simplify" it to the `id IN (SELECT id …)` form, which is the second-worst option *even with* `audit_log_created_at_idx` because the planner turns it into a Hash Semi Join over a full Seq Scan.
- **Count comes off the result, not from `.returning()`.** The `ctid` form cannot use drizzle's `.returning({ id })` (which is how `import-session-cleanup.ts:26` counts), so a private `affectedRows()` reads postgres.js's `count`, falls back to `rowCount`, and otherwise returns `0`. Returning `0` on an unrecognised shape is the safe default: it *stops* the batch loop instead of reading as a full batch and burning all 20 iterations.
- **`INITIAL_DELAY = 60_000`, not the execution processor's `5_000`.** Nothing about retention is time-critical and the first tick can afford to wait out boot.
- **The tick log is a control, not cosmetics.** It is the only signal that the pruner is falling behind the write rate (T-36-09), so it is emitted every tick including at zero.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two acceptance greps were unsatisfiable as originally written**

- **Found during:** Task 2 (GREEN)
- **Issue:** `grep -c "setInterval" src/lib/audit/prune.ts` returned `1` and `grep -c "make_interval" src/lib/audit/prune.ts` returned `2`, against gates of `0` and `1`. Neither was a code problem — both extra matches were *prose in doc comments*: the module header said "a `setTimeout` chain, never `setInterval`", and the `deleteBatch` comment restated the expression `now() - make_interval(days => $1)` that the SQL eight lines below already contains verbatim. This is the same class of defect flagged in wave 2 (`grep -c` counts lines, so any mention anywhere in the file matches).
- **Fix:** Reworded both comments without loss of meaning. "never `setInterval`" became "rather than a repeating interval timer, so a slow tick can never overlap the next one — the next one is not scheduled until this one has finished" (strictly more informative). The duplicated SQL expression in the `deleteBatch` comment became a pointer to the statement below, which is now the single source of truth for that expression and can no longer drift out of sync with it. **No symbol was aliased and no code changed** — the executed statement still calls `make_interval` exactly once and the module still contains no `setInterval`.
- **Files modified:** `src/lib/audit/prune.ts`
- **Verification:** `grep -c "setInterval"` → `0`; `grep -c "make_interval"` → `1` (line 125, the statement). Both edits were made before the Task 2 commit, so the committed file passes every gate as written.
- **Committed in:** `42ba913` (Task 2 commit)

**2. [Informational] The plan's "no processor in this repo has a test" premise is stale**

- **Found during:** Task 1 (RED) and confirmed during Task 3 (`npm test`)
- **Issue:** `36-PATTERNS.md` § No Analog Found and the plan's `<read_first>` both assert that no processor in this repo has a test and that there is no `vi.useFakeTimers()` precedent for a `setTimeout` chain, instructing the executor to budget Task 1 as genuinely new ground. Both claims were already false at the base commit: `src/lib/execution/execution-processor.test.ts` (9 cases, added in `158f2f8`) and `src/lib/triggers/schedule-processor.test.ts` (13 cases, added in `21949df`, using `vi.useFakeTimers()` at line 39 and containing a case literally named *"starts the setTimeout chain with 10s initial delay"*) both exist.
- **Fix:** None required — no code was affected. Recorded here so the phase verifier and any future planner do not repeat the claim. `schedule-processor.test.ts` is a usable analog for the cadence cases; it is **not** an analog for the reschedule-on-throw or SQL-rendering cases, which remain new.
- **Files modified:** none
- **Verification:** `git log --oneline -1 -- src/lib/triggers/schedule-processor.test.ts` → `21949df` (predates this plan's base `081dfb3`).

---

**Total deviations:** 1 auto-fixed (1 blocking, comment-only) + 1 informational plan-premise correction
**Impact on plan:** None on behaviour. No scope creep — no file outside `files_modified` was touched.

## Acceptance Gate Results

| Gate | Expected | Actual |
|------|----------|--------|
| `it(` blocks in `prune.test.ts` | ≥ 9 | 13 |
| test names matching `/fails closed/` | present | 2 |
| test names matching `/ctid/` | present | 1 (+5 comment/assertion lines) |
| `grep -c "useFakeTimers" prune.test.ts` | 1 | 1 |
| `grep -c "advanceTimersByTimeAsync" prune.test.ts` | ≥ 3 | 16 |
| `grep -c "getTimerCount" prune.test.ts` | ≥ 2 | 3 |
| RED run exits non-zero | yes | exit 1, `Cannot find module` |
| `grep -c "ctid" prune.ts` | ≥ 2 | 6 (2 in the statement) |
| `grep -c "make_interval" prune.ts` | 1 | 1 |
| `grep -c "new Date" prune.ts` | 0 | 0 |
| `grep -c "setInterval" prune.ts` | 0 | 0 |
| `grep -c "// Always schedule the next tick" prune.ts` | 1 | 1 |
| `grep -c "export function scheduleTick" prune.ts` | 0 | 0 |
| `prune.ts` line count | ≥ 55 | 145 |
| `grep -c "startAuditPruner" instrumentation.ts` | 2 | 2 |
| `grep -c "registerAuditSubscriber" instrumentation.ts` | 2 | 2 |
| `npx vitest run src/lib/audit/prune.test.ts` | pass | 13 passed |
| `npm run typecheck` | exit 0 | exit 0 |
| `npm test` | pass | 1300 passed, 4 skipped (75 files) + 8 RSC |

## Issues Encountered

None beyond the two deviations above. The fake-timer chain behaved as expected: `advanceTimersByTimeAsync` flushes the async callback's awaits (the synchronous `advanceTimersByTime` would not), and because each tick schedules the next one 24 h out, advancing by exactly `INITIAL_DELAY` runs precisely one tick.

## Known Stubs

None. Every code path in `prune.ts` is wired: the settings read is the real `readRetentionDays`, the delete is a real statement against `audit_log`, and the registration is live in `instrumentation.ts`.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema change. The one new surface — a background timer issuing a bulk `DELETE` — is exactly the boundary already enumerated in the plan's threat model, and all six `mitigate` dispositions are implemented and tested:

| Threat ID | Where it is mitigated | Where it is asserted |
|-----------|----------------------|----------------------|
| T-36-09 (starvation) | `MAX_BATCHES_PER_TICK`, with the per-tick total logged unconditionally | "logs the total deleted and the window every tick" |
| T-36-39 (long write lock) | capped `ctid` batches, `RowExclusiveLock` only | "caps a single tick at exactly MAX_BATCHES_PER_TICK batches" |
| T-36-19 (silently disabled policy) | tail `scheduleTick` outside the `try` | both "leaves a pending timer …" cases |
| T-36-18 (unreadable setting ⇒ unbounded delete) | `days === null` short-circuits before any db call | "fails closed: a null retention window issues no database call at all" |
| T-36-37 (JS `Date` truncating the cutoff) | `now() - make_interval(days => $1)`, day count bound as a param | "computes the cutoff server-side with make_interval and binds no JS Date" |
| T-36-23 (dead pruner in the standalone build) | registered inside the `NEXT_RUNTIME` guard; `[audit-prune]` startup log | "announces itself on start"; browser check deferred to 36-20 |

## Deferred / Out of Scope

Nothing was deferred from this plan. Two observations for whoever runs the phase verification:

1. **The Docker-runtime half of T-36-23 is not verifiable from a unit test.** `36-20` must confirm `[audit-prune] Starting with initial delay of 60s, ticking daily` actually appears in `docker compose -p pipelite logs app`; its absence is the signature of Next.js standalone tracing dropping `instrumentation.js`, which has already happened to all four processors in this repo once.
2. **The measured `Bitmap Index Scan on audit_log_created_at_idx` claim needs real rows.** `scripts/audit-log-checks.sql` part 3 is the evidence for it; nothing in this plan proves the index is used, only that the statement is shaped to use it.

## Next Phase Readiness

- AUDIT-04's code half is complete: retention read (36-08), retention write (36-08), and now the pruner that acts on it.
- `startAuditPruner` is live on boot for the Node runtime; `36-20`'s browser verification can look for the startup line and, with retention set to 1 day in `/admin`, watch the count fall.
- No blockers for the remaining wave-4 plans. `instrumentation.ts` was touched with a 3-line append at the end of the existing guard, which is the lowest-conflict shape available if another wave-4 plan also registers something there.

---
*Phase: 36-audit-log*
*Completed: 2026-08-16*
