---
phase: 41-workflow-operator-affordances
plan: 05
subsystem: workflow-execution
tags: [workflow-engine, dry-run, delay, quickjs, security, vitest, tdd]

# Dependency graph
requires:
  - phase: 41-workflow-operator-affordances
    provides: "41-01 — workflowRuns.dryRun column (migration 0019, applied) and ExecutionContext._dryRun declared in src/lib/execution/types.ts"
  - phase: 24-31-workflow-engine
    provides: "executeRun / executeRunGraph / executeBranch, the resume frame, resolveDelay, and the processor's serial-enforcement claim query"
provides:
  - "context._dryRun = run.dryRun === true — set on EVERY engine entry, below the context restore and above the resume read"
  - "the A2 delay no-op at BOTH delay sites: main-loop switch case and executeBranch"
  - "the exact skipped-delay output shape a dry run records: { delayed: false, skipped: true, simulated: true }"
  - "17 new gates in src/lib/execution/engine.test.ts — 8 dry-run-flag, 9 delay-under-dry-run"
affects: [41-06, 41-07, 41-08, 41-13, 41-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Observe the flag from inside the mocked executeAction, not from the engine's assignment — the only consumer that matters is a mutation several awaits deep"
    - "Anti-vacuity by snapshotting a mock's INPUT before the call, because the engine restores and mutates the very same context object in place"
    - "Sentinel initial value ('HANDLER_NEVER_RAN') so 'the handler observed undefined' cannot be confused with 'the handler never ran'"
    - "Count status: \"waiting\" writes across BOTH mocked tables for the whole invocation, so a third delay site added later is covered the day it is written"

key-files:
  created: []
  modified:
    - src/lib/execution/engine.ts
    - src/lib/execution/engine.test.ts

key-decisions:
  - "The run query at engine.ts:91-97 is a bare select() of the whole row — NO projection widening was needed for run.dryRun"
  - "context._dryRun sits at line 179, between _workflowUserId (164) and the _resume read (184); the offset ordering is asserted by a comment-blind source scan, each offset checked > -1 first"
  - "=== true, never !! and never a coercion — a pre-migration row reads undefined, and the handler gates plus 41-08's alert path compare against false, where falsy-but-not-false would slip through"
  - "The A2 guard reuses the existing resumeAt === null skip path (resumeAt === null || context._dryRun) rather than adding a third branch; simulated: true is the only behavioural difference"
  - "resolveDelay is still CALLED under dry run, so a MALFORMED delay config still throws and fails the node — what a dry run skips is the wait, not the parse. Recorded in the code comment so the accepted cost is stated accurately"
  - "The QuickJS key-set gate is behavioural, not a source scan: the real transform handler is reached through ./actions/registry (./actions itself is mocked file-wide) and user JS itself reports Object.keys(input)"
  - "resolveDelay and the processor's serial-enforcement clause were NOT touched — RESEARCH Q2 is explicit that exempting dry runs from serial enforcement is the wrong fix"

patterns-established:
  - "Pattern: for a two-site edit, pair a behavioural test per site with a structural occurrence count of the guard, so a refactor that collapses or duplicates a site has to be deliberate"
  - "Pattern: assert the real-run half of every dry-run gate in the same suite — those cases start GREEN and are the regression guard, not the feature"

requirements-completed: [WFOPS-02]

# Metrics
duration: 21min
completed: 2026-08-22
---

# Phase 41 Plan 05: Dry-Run Engine Gating Summary

**`context._dryRun` is now derived from the `workflow_runs.dry_run` COLUMN below the context restore — so a hand-edited context blob and a delay resume both lose to the row — and a delay node is a no-op at BOTH engine sites, recording `{ delayed: false, skipped: true, simulated: true }` instead of parking the run as `waiting` and blocking every real run of the workflow for up to 30 days.**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-08-22T20:38:00Z
- **Completed:** 2026-08-22T20:59:00Z
- **Tasks:** 2 of 2
- **Files modified:** 2 (0 created, 2 modified)

## What Was Built

### Task 1 — `_dryRun` from the column (commit `c745baf`)

`src/lib/execution/engine.ts:179`:

```ts
context._dryRun = run.dryRun === true
```

Placed immediately after `context._workflowUserId = workflow.createdBy` (line 164) and before
`const resume = context._resume` (line 184). The ordering is the security property, and it is
asserted structurally as well as behaviourally.

Eight gates in `engine.test.ts` (`describe("executeRun dry-run flag")`, every title contains
"dry-run" so `-t "dry-run"` selects the set):

1. column `true` → handler sees `true`, `typeof === "boolean"`
2. column `false` → handler sees `false`, `typeof === "boolean"`
3. row with NO `dryRun` key (pre-migration shape) → `false`, not `undefined`
4. persisted context `_dryRun: true` + column `false` → `false`
5. persisted context `_dryRun: false` + column `true` → `true`
6. resumed run (`_resume` frame, stale `_dryRun: false` in the blob, column `true`) → `true`, and
   only the resumed node runs
7. offset-ordering source scan (comment-blind, each offset asserted `> -1` first)
8. QuickJS: user JS sees exactly `["nodes", "trigger"]`, and `typeof input._dryRun` /
   `typeof input._workflowUserId` are both `"undefined"`

Claims 4 and 5 snapshot the blob with a deep clone BEFORE the call and assert the clone carried the
opposite flag. Without that the engine's in-place overwrite of the restored object would make an
empty-context test pass while proving nothing.

### Task 2 — the A2 delay no-op, both sites (commit `38641db`)

Both delay handlers now read:

```ts
if (resumeAt === null || context._dryRun) {
  const output = context._dryRun
    ? { delayed: false, skipped: true, simulated: true }
    : { delayed: false, skipped: true }
```

- `engine.ts:363` — the main loop's `case "delay"`, carrying the full A2 rationale comment
- `engine.ts:504` — inside `executeBranch`, cross-referencing site 1

Nine gates (`describe("executeRun delay under dry run")`). The branch-segment case is driven through
a real condition-branch workflow — `cond-1 --true--> b1 -> d1(delay) -> b2`, merging at `merge-1` —
and asserts the step sequence `["cond-1","b1","d1","b2","merge-1"]`. A fix applied to only the
main-loop site fails there, which is the entire point.

The dry-run cases assert zero `status: "waiting"` writes across BOTH mocked tables for the whole
invocation, zero `resumeAt` writes, and zero persisted `_resume` frames.

## THE OUTPUT SHAPE (for 41-13 / 41-14 — do not guess)

A dry run's skipped delay records, both as the step's `output` and as
`context.nodes[nodeId].output`:

```json
{ "delayed": false, "skipped": true, "simulated": true }
```

Both dry-run delay paths produce it — a future `resolveDelay` result AND an already-past one — so the
two are indistinguishable to a reader of the run detail page. Step status is `completed`.

A REAL run is unchanged: an already-past delay still records exactly `{ delayed: false, skipped: true }`
with no `simulated` key, and a future delay still records
`{ delayed: true, resumeAt: <ISO string> }` on a `waiting` step.

## TDD Gate Compliance

Plan type is `tdd`. Both tasks ran RED before GREEN, with the actual counts:

| Task | RED result | Notes |
|------|-----------|-------|
| 1 | **7 failed / 1 passed** of 8 | The QuickJS key-set gate (claim 8) starts GREEN — it is a regression guard on `transform.ts`'s existing `{ trigger, nodes }` injection (T-41-24), not a new behaviour. All seven flag-derivation claims failed as `expected undefined to be true/false`, plus the ordering scan at `expected -1 to be greater than -1`. |
| 2 | **6 failed / 3 passed** of 9 | The three passing are the real-run regression halves: future delay parks (main loop), future delay parks (branch), already-past real delay has no `simulated` key. Those SHOULD be green before and after — they are the "byte-identical" guarantee. |

Gate sequence: this plan's commits are both `feat(...)`, with the tests written and run RED inside
the same task before the implementation edit, then committed together. No separate `test(...)` commit
was made — the plan's tasks are `type="auto" tdd="true"` (per-task RED/GREEN inside one commit),
not the plan-level three-commit `type: tdd` cycle. RED counts recorded above in lieu of a RED commit.

No test passed unexpectedly during a RED phase in a way that indicated a pre-existing feature: every
unexpected pass is one of the four regression-half cases named above, and each was verified to be
asserting UNCHANGED behaviour.

## Verification Results

| Check | Result |
|-------|--------|
| `npx vitest run src/lib/execution/` | **228 passed / 0 failed** |
| `npm test` (full suite) | **4028 passed / 32 skipped** (baseline 4011 + 17 new) |
| `npm test` RSC project | **8 passed / 8** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors, 125 warnings** (≤127 baseline) |
| `context._dryRun = run.dryRun === true` present | line 179 |
| ordering: 164 (`_workflowUserId`) < 179 (`_dryRun`) < 184 (`_resume`) | strictly increasing |
| `resumeAt === null \|\| context._dryRun` occurrences | **2** (lines 363, 504) |
| `resolveDelay` / `execution-processor.ts` modified | **no** — `git diff` against the base touches only the two engine files |

## Answers the plan asked for explicitly

**Did the run projection at `engine.ts:91-97` need widening?** **No.** It is `db.select()` with no
column list, joined to `workflows` — the whole `workflow_runs` row comes back, `dryRun` included.
Nothing to change.

**Where does `_dryRun` come from on a resume?** The same single assignment. `executeRun` is the only
entry point and the processor re-invokes it for a waiting run, so the flag is re-derived from the row
every time. Gate 6 drives that path with a stale `_dryRun: false` in the persisted blob and a `true`
column and asserts the handler sees `true`.

## The accepted cost, as written into the code

Both the plan and CONTEXT A2 require this to live in the source, not only in planning docs. The
main-loop comment states it, and the wording is slightly more precise than A2's:

> a dry run does not exercise delay resolution, so a misconfigured delay is not caught by
> dry-running. (`resolveDelay` is still CALLED above, so a malformed config still throws and fails
> the node — what a dry run skips is the WAIT, not the parse.)

The parenthetical is a deliberate addition. `resolveDelay` throws on a missing `fieldPath`, an
unresolvable field path, a non-datetime `untilTime` and an unknown mode
(`src/lib/execution/delay-resolver.ts:65-78`), and it is evaluated before the guard. Stating the cost
without that qualification would have been inaccurate in the direction that matters — a reader would
conclude dry-running cannot surface ANY delay misconfiguration, when in fact it surfaces every
malformed config and skips only the elapsed time.

## Deviations from Plan

**None affecting behaviour.** Two presentational choices worth naming:

**1. [Rule 3 - Blocking] The QuickJS gate is behavioural, not a source scan.**
- **Found during:** Task 1
- **Issue:** `engine.test.ts` mocks `./actions` file-wide, so the transform handler is unreachable
  through the engine, and the plan's "exact key-set assertion on that object" had no object to
  assert on.
- **Fix:** reach the real handler through `./actions/registry` + a side-effect import of
  `./actions/transform` (neither is the mocked specifier), then let the sandboxed user JS report
  `Object.keys(input).sort()`. This is strictly stronger than a source scan: it asserts what user
  code can actually observe, not what the injection literal looks like.
- **Files modified:** `src/lib/execution/engine.test.ts`
- **Commit:** `c745baf`

**2. [Rule 2 - Missing critical functionality] The already-past REAL delay got its own exact-object gate.**
- **Found during:** Task 2
- **Issue:** the plan asked for `simulated: true` on the dry-run skip path but did not ask anyone to
  prove a REAL run's skip output stays free of it. The two paths share one code branch now, so
  nothing but a test stops `simulated: true` leaking onto real runs — which would misreport a delay
  that genuinely had nothing left to wait for.
- **Fix:** added "leaves an already-past REAL delay's output free of the dry-run marker", asserting
  `toEqual({ delayed: false, skipped: true })` exactly.
- **Files modified:** `src/lib/execution/engine.test.ts`
- **Commit:** `38641db`

`setupDbMocks`' inline run type gained `dryRun?: boolean`, which is mechanical.

## Known Stubs

None. Both engine sites are wired and exercised.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access and no schema change; the
three boundaries it touches are all already in the plan's threat register (T-41-23 through T-41-27),
and each has a named gate above.

## Notes for later plans

- **41-06 / 41-07 (handler gates):** read `context._dryRun` and compare `=== true` / `=== false`
  freely — it is guaranteed a boolean by the time any handler runs, on a fresh run and on a resume.
- **41-13 / 41-14 (run detail render):** the skipped-delay output shape is in the section above.
  There is no new copy and no new key beyond `simulated` — UI-SPEC F-41-1 forbids new dry-run copy,
  and `simulated: true` is the diagnosable signal in the existing `json-viewer.tsx`.
- **Anyone tempted to "fix" the delay skip:** read the comment at `engine.ts:340-361` first. The
  behaviour is A2, USER-APPROVED, and the alternative is a 30-day production stall.
- `engine.test.ts` now imports `readStrippedSource` from
  `src/components/custom-fields/__tests__/source-scan` — the third consumer outside the CFUI gates.

## Self-Check: PASSED

- `src/lib/execution/engine.ts` — FOUND
- `src/lib/execution/engine.test.ts` — FOUND
- commit `c745baf` — FOUND in `git log`
- commit `38641db` — FOUND in `git log`
- `context._dryRun = run.dryRun === true` — FOUND at line 179
- `resumeAt === null || context._dryRun` — FOUND, exactly 2 occurrences (363, 504)
- STATE.md / ROADMAP.md — NOT modified (orchestrator owns those writes)
