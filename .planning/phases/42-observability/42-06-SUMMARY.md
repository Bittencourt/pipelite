---
phase: 42-observability
plan: 06
subsystem: observability
tags: [heartbeat, structured-logging, processors, OBS-01, OBS-03]
requires:
  - "src/lib/log.ts (42-01)"
  - "src/lib/observability/heartbeat.ts (42-02)"
provides:
  - "all six long-running processors registered in the heartbeat registry with their own cadences"
  - "recordTick on tick-body completion for all six processors"
  - "33 structured log call sites across the six processor files"
  - "behavioural proof that registration and tick-recording work, for the two pruners"
affects:
  - "GET /api/health (42-05) — six of its ten roster entries now have a live writer"
  - "42-18's container check — the write side it will verify end-to-end"
tech-stack:
  added: []
  patterns:
    - "42-PATTERNS.md §5 shape (a) — prefixed console.error in a swallow-and-log catch"
    - "42-PATTERNS.md §5 shape (c) — boot line + registration folded into one edit"
    - "constants passed IN to registerProcessor, never exported OUT to the health route"
key-files:
  created: []
  modified:
    - src/lib/audit/prune.ts
    - src/lib/trash/prune.ts
    - src/lib/audit/prune.test.ts
    - src/lib/trash/prune.test.ts
    - src/lib/webhook-processor.ts
    - src/lib/email-processor.ts
    - src/lib/triggers/schedule-processor.ts
    - src/lib/execution/execution-processor.ts
decisions:
  - "recordTick sits outside the try/catch in all six processors — liveness is 'the body completed', not 'the body succeeded', so a processor failing every tick reads alive-and-broken rather than dead"
  - "each processor passes its OWN interval constants to registerProcessor rather than exporting them for the health route to import, keeping the registry dependency-free and the staleness bound tied to the real cadence"
  - "the two pruner file headers and the two pruner test-file headers were rewritten to name /api/health as the liveness detector; the boot line is now an observation of the start, not the detector for its absence"
  - "added a fourth wiring assertion per pruner (alive across a full TICK_INTERVAL) beyond the three the plan specified, because 'a daily worker is not dead for not having ticked in an hour' is the property a global staleness threshold would break"
metrics:
  duration: "~17 min"
  completed: 2026-08-23
  tasks: 2
  commits: 2
  files_modified: 8
---

# Phase 42 Plan 06: Processor Heartbeat Wiring and Log Migration Summary

All six long-running processors now register themselves in the heartbeat registry with their own
interval constants and record a tick on every completed tick body — including one that threw — and
their 33 `console.*` call sites emit structured JSON with the 6 existing bracket scopes harvested
verbatim.

## What Was Built

**Task 1 — the two daily pruners (commit `33188ba`), TDD.**
`src/lib/audit/prune.ts` and `src/lib/trash/prune.ts` register as `audit-prune` / `trash-prune`
with their own 24-hour `TICK_INTERVAL` and 60-second `INITIAL_DELAY`, call `recordTick` outside the
`try`, and emit 12 migrated log lines. The wiring is proven behaviourally — these are the only two
processors whose suites actually drive their `start*` function.

**Task 2 — the four fast processors (commit `9c60971`).**
`webhook-processor` (60 s), `email-processor` (5 min), `schedule-processor` (30 s) and
`execution-processor` (5 s) get the same three edits and 21 migrated log lines. These four have no
suite that drives their `start*` function, so their wiring is a **source gate, not a behaviour
proof** — stated plainly rather than dressed up. The behavioural proof for all six together is plan
42-18's container check against `/api/health`.

## RED → GREEN (Task 1)

Pre-edit, with the new assertions written and the source untouched:

```
Test Files  2 failed (2)
     Tests  12 failed | 30 passed (42)
```

The 12 breaking down as: 4 bracket-string assertions the migration invalidates by design (2 audit,
2 trash) and 8 new heartbeat-wiring assertions (4 per pruner). Post-edit: **42 passed / 0 failed.**

## The six `registerProcessor` calls, verbatim

```
src/lib/webhook-processor.ts:25:      registerProcessor("webhook-processor", POLL_INTERVAL, INITIAL_DELAY)
src/lib/email-processor.ts:26:        registerProcessor("email-processor", POLL_INTERVAL, INITIAL_DELAY)
src/lib/triggers/schedule-processor.ts:32: registerProcessor("schedule-processor", POLL_INTERVAL, INITIAL_DELAY)
src/lib/execution/execution-processor.ts:80: registerProcessor("execution-processor", POLL_INTERVAL, INITIAL_DELAY)
src/lib/audit/prune.ts:62:            registerProcessor("audit-prune", TICK_INTERVAL, INITIAL_DELAY)
src/lib/trash/prune.ts:134:           registerProcessor("trash-prune", TICK_INTERVAL, INITIAL_DELAY)
```

Every call passes identifiers, never literal numbers, and all six names match `EXPECTED_WORKERS`
exactly (verified by grep against the roster, not by eye). Each interval is the one that file's own
timer uses, which is what makes the per-worker staleness bound correct across a factor of 17,280 —
the two pruners stay alive for a full day while `execution-processor` is judged against 5 seconds.

## `recordTick` is outside the `try` — observed line numbers

| File | `catch (error) {` | `}` closes catch | `recordTick(...)` | reschedule |
|---|---|---|---|---|
| `src/lib/audit/prune.ts` | 105 | 107 | **113** | 116 |
| `src/lib/trash/prune.ts` | 177 | 179 | **186** | 190 |
| `src/lib/webhook-processor.ts` | 55 | 57 | **62** | 65 |
| `src/lib/email-processor.ts` | 58 | 60 | **65** | 68 |
| `src/lib/triggers/schedule-processor.ts` | 43 | 45 | **50** | 53 |
| `src/lib/execution/execution-processor.ts` | 99 | 101 | **106** | 109 |

In every file `recordTick` sits between the closing brace of the `catch` and the reschedule call —
the same structural position, for the same reason, that `prune.test.ts` already asserts for the tail
`scheduleTick`. `src/lib/audit/prune.test.ts` and `src/lib/trash/prune.test.ts` each assert
`lastTickAt` advances when the tick body threw, so this placement is pinned by test and not only by
comment.

## `console.*` count, before and after

Two independent measurements, both reconciling exactly:

| Measure | Before | After | Delta |
|---|---|---|---|
| `grep -rn 'console\.' src instrumentation.ts`, non-test files | 286 | 253 | **−33** |
| `eslint --rule 'no-console: error'`, non-test files | 277 | 244 | **−33** |
| `eslint --rule 'no-console: error'`, non-test FILES with ≥1 violation | 97 | 91 | −6 (all six cleared) |
| `grep -rn 'console\.' src instrumentation.ts`, all files incl. tests | 322 | 291 | −31 |

The all-files delta is −31 rather than −33 because the two new "tick threw" tests each add an
`expect(console.error).toHaveBeenCalled()` reference: −33 source, +2 test. The eslint before-count of
277 is research's tool-verified 273 plus the 4 deliberate `console` delegations inside
`src/lib/log.ts` itself (wave 1), and 97 files is research's 96 plus `log.ts`. All six processor
files are now at **zero** `console.` references.

## `ctx` key collision check (wave 1's warning)

`ctx` keys land flat at the top level of the log line, so `level` / `scope` / `msg` / `ts` would
silently overwrite a base field. The 21 distinct keys introduced by this plan are:
`initialDelayMs`, `tickIntervalMs`, `processed`, `cleaned`, `status`, `err`, `reminders`, `digests`,
`pending`, `waiting`, `reclaimed`, `runId`, `reason`, `workflowId`, `deleted`, `retentionDays`,
`purged`, `entityType`, `id`, `expected`, `got`. **None of the four reserved names is used.**

## Redaction (T-42-04): nothing was widened

Every migrated line carries only values that were already in the string it replaced. Checked site by
site against the original:

- `trash/prune.ts` "Refused to purge record" and "Failed to purge record" keep `entityType` and `id`
  — both already in the old template literal — and nothing else. No record content, no field values.
- `email-processor.ts` "Processed queue" carries `reminders` and `digests`, counts only; no recipient
  address enters this module's log stream.
- `execution-processor.ts` carries run ids that were already interpolated, never run payloads.
- `trash/prune.ts` "unrecognised expiry-query result shape" still logs the SHAPE (`typeof result`)
  and never the value — that constraint was explicit in the original and is preserved.

No new threat surface: no new endpoint, no auth path, no file access, no schema change.

## Deviations from Plan

### Directed by the orchestrator, outside the plan text

**1. [Rule 2 - Stale documentation] Corrected the two false `Dockerfile:24` comments.**
- **Found during:** Task 1, per the orchestrator's `<stale_comments_you_may_own>` brief
- **Issue:** `src/lib/trash/prune.ts:14` and `src/lib/trash/prune.test.ts:132` both stated the build
  "still ends in a suppressed failure." Wave 1's 42-03 moved the Dockerfile copy block; it does not.
- **Fix:** Both rewritten. The trash pruner's header now explains that the suppressed-failure copy
  step is gone and that `/api/health` is the detector — "an absence you have to notice became a false
  you can poll." The test's header and test name were rewritten to match.
- **Also fixed, same class, not in the brief:** `src/lib/audit/prune.ts:12-15` claimed "No
  `[audit-prune]` line in `docker compose logs app` is how that is detected", and
  `src/lib/audit/prune.test.ts:104`'s test name said the line "is how a dead instrumentation module
  is detected". Both are superseded by `/api/health` in exactly the same way, and both are in files
  this plan owns. Left alone, they would have been two more comments asserting a detector that had
  been replaced.
- **Commit:** `33188ba`

### Corrections to the plan's own statements

**2. The plan's `<owned_test_files>` claim "None of these five suites calls a `start*` function" is
FALSE for one of them.** `src/lib/triggers/schedule-processor.test.ts:481-488` does call
`startScheduleProcessor()` (asserting `setTimeout` was called with `10_000`). Consequences, all
benign and all verified: the suite now emits one structured boot line to stdout (it already emitted
an unspied `console.log` before, so this is a change of format, not of noise), it registers
`schedule-processor` in the real heartbeat registry, and the 10-second assertion passes unchanged.
No edit was needed. This does not change the plan's conclusion that the four fast processors' wiring
is a source gate — one `setTimeout` assertion is not a heartbeat proof — but the premise was wrong
and a later plan should not rely on it.

**3. The plan's acceptance criterion `grep -c '\[audit-prune\]' src/lib/audit/prune.test.ts` returns
0 initially failed on my own prose.** The rewritten header used the literal bracketed form when
describing the *historical* grep. Rephrased to "the bracketed audit-prune prefix" in both test files
so the gate is literally 0 and stays a usable check rather than one a reader has to interpret.
Verified: both files now return 0.

**4. Added a fourth wiring assertion per pruner, beyond the three the plan specified.** "Stays alive
across a full day, because the staleness bound is its own TICK_INTERVAL" —
`snapshot(Date.now() + TICK_INTERVAL - 1)` still reports `alive: true`. The plan's three assertions
would all pass under a single global staleness threshold, which would report both daily pruners
permanently dead on a healthy container. That is the failure the "pass your own constants in" design
exists to prevent, so it is now pinned rather than only commented.

**5. Baseline numbers in the plan are stale.** The plan's verification block asks for "≥ 4406
passed"; wave 1's handoff supersedes that with 4455. Ended on 4463 (= 4455 + the 8 new wiring
assertions).

### Auto-fixed issues

None. No bugs, no missing functionality and no blockers were found in the six files. Every `catch`
kept its swallow behaviour, every `setTimeout` cadence and constant is byte-identical (verified by
grepping the full diff for `setTimeout`, `INITIAL_DELAY =`, `POLL_INTERVAL =`, `TICK_INTERVAL =`,
`BATCH_SIZE =`, `MAX_BATCHES` — zero hits on either side of the diff).

## Verification — exact numbers

| Check | Result |
|---|---|
| `npx vitest run src/lib/audit/prune.test.ts src/lib/trash/prune.test.ts` | **42 passed / 0 failed** (17 + 25) |
| `npx vitest run` the three fast-processor suites | **66 passed / 0 failed** (16 + 37 + 13), zero edits needed |
| `npm test` (unit project) | **4463 passed / 32 skipped / 0 failed**, 160 files passed / 2 skipped |
| `npm test` (RSC project) | **8 passed / 0 failed** |
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` | **0 errors / 122 warnings** |
| `npx eslint` on the 8 changed files | **0 errors / 0 warnings** |

**On the lint warning count: 122 here versus the handoff's 124, and this plan is not the cause.**
Checked directly rather than assumed: `git show bc5ea1c:<file> | npx eslint --stdin --stdin-filename
<file>` for all eight changed files reports **zero** warnings at the base commit, so there were no
warnings in these files for this plan to remove. The likeliest explanation is a measurement
difference between this worktree and the main checkout — a worktree receives only tracked files, so
gitignored files present in the main checkout are absent here. Worth a glance from whoever runs the
next full-repo lint; not worth blocking on.

## Notes for later plans

- **`/api/health` (42-05) now has real writers for 6 of its 10 roster entries.** The four subscribers
  are still unwritten, so a snapshot today reports 6 registered and 4 `alive: false`.
- **OBS-03 remains unproven in production** regardless of these passing tests, exactly as wave 1
  warned: vitest has a single module registry and structurally cannot reproduce the four-instance
  Turbopack split. 42-18's container check is the only real verification, and until it runs, "42
  passed" means the code is correct, not that the bridge works.
- **The three `grep -F '[scope] Starting'` comments in A7 are not in this plan's files.**
  `instrumentation.ts:40`, `scan-cleanup.ts:31` and `scan-cleanup.test.ts:17` are owned elsewhere and
  were not touched. `instrumentation.ts:40` specifically cites `grep -F '[trash-prune] Starting'`,
  which **this commit has just invalidated** — that string no longer appears in the log stream. Its
  owner must update it to `'"scope":"trash-prune"'` (or better, to `/api/health`) in this same phase,
  or the comment will document a verification that silently cannot pass.

## Known Stubs

None. No placeholder values, no unwired data paths, no TODOs introduced.

## Self-Check: PASSED

Files claimed as modified — all 8 exist and are committed:
`src/lib/audit/prune.ts`, `src/lib/trash/prune.ts`, `src/lib/audit/prune.test.ts`,
`src/lib/trash/prune.test.ts`, `src/lib/webhook-processor.ts`, `src/lib/email-processor.ts`,
`src/lib/triggers/schedule-processor.ts`, `src/lib/execution/execution-processor.ts`.

Commits claimed — both present in `git log`: `33188ba`, `9c60971`.

The three test files the plan listed as "expect no edit" (`email-processor.test.ts`,
`execution-processor.test.ts`, `schedule-processor.test.ts`) are correctly absent from the diff —
8 files changed, not 11.
