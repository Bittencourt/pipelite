---
phase: 41-workflow-operator-affordances
plan: 02
subsystem: testing
tags: [workflows, url-params, replay, dry-run, pure-functions, tdd, vitest]

# Dependency graph
requires:
  - phase: 40-saved-views
    provides: "src/lib/views/url-params.ts — the total, database-free URL-vocabulary module shape, and validate.test.ts' import-graph source-scan gate idiom"
provides:
  - "src/lib/workflows/runs-filter.ts — parseRunsSearchParams, the page/status/showDryRuns parse, total and with no runtime @/db import"
  - "VALID_RUN_STATUSES, SHOW_DRY_RUNS_PARAM, SHOW_DRY_RUNS_VALUE, MIN_RUNS_PAGE, MAX_PAGE_DIGITS — the constants both ends of the runs-list URL must share"
  - "src/lib/workflows/replay.ts — isRunReplayable (exactly \"failed\") and buildReplayRunInput (depth 0, lineage, verbatim envelope)"
  - "EMPTY_REPLAY_ENVELOPE — the frozen {} a replay of an envelope-less run carries"
  - "ReplayRunInput and ReplayOrigin — the named contracts plan 41-11's server action destructures"
  - "An import-graph source-scan gate that distinguishes type-only from runtime imports, reusable by any later plan asserting a module is browser-safe"
affects: [41-10-runs-list-dry-run-toggle, 41-11-replay-server-action, 41-runs-detail-replay-control]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "URL-vocabulary sibling module: one exported parser imported by both the server component that reads the params and the \"use client\" module that writes them"
    - "Type-only-import gate: an import-specifier parser that pairs each specifier with a typeOnly flag, so a module can import a schema TYPE while still failing on any runtime @/db import"

key-files:
  created:
    - src/lib/workflows/runs-filter.ts
    - src/lib/workflows/__tests__/runs-filter.test.ts
    - src/lib/workflows/replay.ts
    - src/lib/workflows/__tests__/replay.test.ts
  modified: []

key-decisions:
  - "MAX_PAGE_DIGITS = 9, matching parseDuplicatePage — it bounds the digit count before Number() sees it and is deliberately not a product ceiling on how many pages of runs exist"
  - "buildReplayRunInput returns the trigger envelope by the SAME REFERENCE, on purpose, and the test asserts the aliasing rather than a defensive copy — a structuredClone or JSON round-trip is exactly the normalisation that \"verbatim\" forbids, and it would throw on a non-cloneable blob"
  - "A null/undefined triggerData becomes EMPTY_REPLAY_ENVELOPE, a frozen {}, not a synthesised envelope: engine.ts:157-158 reads the blob as ?.trigger_type ?? \"unknown\" and ?.data ?? {}, so {} and NULL are byte-for-byte equivalent at the only place the engine reads it, and a fabricated timestamp would make the function impure"
  - "No constant is exported for the \"failed\" literal — the reshaped UI-SPEC G-6 gate scans for {run.status === \"failed\" && ( … )} at the render site, and a REPLAYABLE_RUN_STATUS constant would make that scan unsatisfiable while changing no behaviour"
  - "isRunReplayable takes `unknown`, not WorkflowStatus: the drizzle type is a $type<>() assertion over a text column, not a check constraint, so it describes what the writers do and not what the column holds"
  - "parseRunsSearchParams accepts URLSearchParams as well as the await-searchParams record, so plan 41-10's client toggle and the server component call one parser"

patterns-established:
  - "Pattern 1: the RunsFilter seam — this module returns the DECISION (page/status/showDryRuns) and the server component turns it into drizzle SQL, because and(eq(workflowRuns...)) needs a runtime @/db value that would cost the module its browser-safety"
  - "Pattern 2: authorization and construction are separate functions, asserted anti-vacuously — buildReplayRunInput builds a well-formed input for a completed origin, so the action's isRunReplayable check cannot look redundant and get deleted"

requirements-completed: [WFOPS-01, WFOPS-02]

# Metrics
duration: 26min
completed: 2026-08-22
---

# Phase 41 Plan 02: Runs-Filter and Replay Pure Modules Summary

**The two decisions WFOPS-01 and WFOPS-02 actually turn on — "does this URL want to see test runs" and "is this run replayable, and what does its replacement look like" — are now total, database-free functions with 135 assertions pinning them, including the `?dryRun=2` case and the four non-`failed` statuses by name.**

## Performance

- **Duration:** ~26 min
- **Started:** 2026-08-22T20:11:00Z
- **Completed:** 2026-08-22T20:37:00Z
- **Tasks:** 2 of 2
- **Files created:** 4 (2 modules, 2 unit gates)

## Accomplishments

- `parseRunsSearchParams` makes WFOPS-02's default assertable for the first time: `{}` → `showDryRuns === false`, and `?dryRun=2` → `false` via a strict equality against `SHOW_DRY_RUNS_VALUE`. A `Boolean(sp.dryRun)` implementation passes 74 of the 75 assertions in that file and fails exactly the one that matters.
- `isRunReplayable` reduces WFOPS-01's authorization to a single strict equality, and the four non-`failed` statuses are refused as a **loop over `VALID_RUN_STATUSES`** — so a sixth status added to the schema later is non-replayable by default rather than accidentally admitted. `VALID_RUN_STATUSES` is `satisfies readonly WorkflowStatus[]`, so a union member with no array entry is a compile error.
- `buildReplayRunInput` produces `depth: 0`, `replayedFromRunId: origin.id` and the origin's envelope verbatim — asserted by deep equality *and* by identity, and asserted not to be the workflow id or a new run id (T-41-12: that column is the only record a replay happened, because resetting depth blinds the recursion guard to the chain).
- Both modules carry a **type-only** `@/db`/`@/lib/triggers` reference and nothing else at runtime, gated structurally by an import-specifier parser that pairs each specifier with a `typeOnly` flag. The gate has a detector-fires proof, so it cannot pass vacuously, and it asserts on the import graph rather than grepping the file — deleting the header comment does not turn the light green.
- The plan's anti-vacuity requirement is met: `buildReplayRunInput` builds a well-formed input for a `completed` origin, and produces output identical to a `failed` origin's. Authorization has exactly one home, in plan 41-11's action.

## RED runs, recorded before each GREEN

| Task | RED command | RED result |
| --- | --- | --- |
| 1 | `npx vitest run src/lib/workflows/__tests__/runs-filter.test.ts` | **1 suite failed, 0 tests collected** — `Cannot find module '../runs-filter'` (`numFailedTestSuites: 1`, `numTotalTests: 0`) |
| 2 | `npx vitest run src/lib/workflows/__tests__/replay.test.ts` | **1 suite failed, 0 tests collected** — `Cannot find module '../replay'` (`numFailedTestSuites: 1`, `numTotalTests: 0`) |

GREEN after each: task 1 **75/75**, task 2 **60/60**, `src/lib/workflows/` as a whole **143/143** across 3 files.

## Task Commits

1. **Task 1 RED: the WFOPS-02 default-hidden runs filter gate** — `cfd2686` (test)
2. **Task 1 GREEN: `parseRunsSearchParams`, total and database-free** — `0de1c58` (feat)
3. **Task 2 RED: the WFOPS-01 failed-only replay gate** — `4a81a2d` (test)
4. **Task 2 GREEN: `isRunReplayable` and `buildReplayRunInput`** — `e16f795` (feat)

No REFACTOR commit for either task: both modules were written in their final shape and there was nothing to clean up without changing behaviour.

## Files Created

- `src/lib/workflows/runs-filter.ts` — the runs-list URL vocabulary. `parseRunsSearchParams(source)` → `{ page, status, showDryRuns }`. Exports `RunsFilter`, `RunsSearchParamSource`, `VALID_RUN_STATUSES`, `SHOW_DRY_RUNS_PARAM`, `SHOW_DRY_RUNS_VALUE`, `MIN_RUNS_PAGE`, `MAX_PAGE_DIGITS`. Accepts `URLSearchParams`, an `await searchParams` record, `null` or `undefined`.
- `src/lib/workflows/__tests__/runs-filter.test.ts` — 75 assertions: the `showDryRuns` table (T-41-07), frozen-array status membership with a `JSON.parse`-built own `__proto__` pollution probe (T-41-08), the page bound including a 1 MiB input and an exactly-at-the-cap anti-vacuity pair (T-41-09), a 15-row hostile-input totality table, and the import-graph gate (T-41-10).
- `src/lib/workflows/replay.ts` — `isRunReplayable(status: unknown)`, `buildReplayRunInput(origin)`, `EMPTY_REPLAY_ENVELOPE`, `ReplayRunInput`, `ReplayOrigin`.
- `src/lib/workflows/__tests__/replay.test.ts` — 60 assertions: the failed-only predicate over the union plus 21 junk inputs, the four `ReplayRunInput` fields, the verbatim/identity/aliasing trio, the `null`-triggerData substitution, the anti-vacuity construction-is-not-authorization block, and three structural scans (no runtime db import, no `dryRun`, no `.active` rejection, no chain-length guard).

## Decisions Made

Beyond the frontmatter's `key-decisions`, three worth naming for the plans downstream:

**The drizzle `where` accumulator is deliberately absent.** `and(eq(workflowRuns.workflowId, id), …)` needs the `workflowRuns` table, which is a runtime `@/db` value. Plan 41-10 builds the SQL in the server component from the returned `RunsFilter`. That separation is the only reason the decision is testable, and it is written into the module header so a later plan does not "simplify" it back inline.

**The throwing-getter totality row is IN CONTRACT, not documented away.** `readRawValue` reads each key through one guarded reader with a `try`, so a hostile accessor is caught and treated as absent. There is no `error.tsx` above `/workflows/[id]/runs`, so a throw there is a blank page rather than a degraded one — swallowing it is the correct end of that trade.

**No trimming and no case folding anywhere in either module.** `?status=" failed"`, `?dryRun="1 "` and `isRunReplayable("Failed")` are all refused. A parser that repairs its input is a parser that can be steered, and on this surface it would additionally let the filter chip's highlighted value and the query's applied value disagree.

## What plan 41-11 must not have to guess

- `MAX_PAGE_DIGITS` is **9**.
- `SHOW_DRY_RUNS_PARAM` is `"dryRun"`, `SHOW_DRY_RUNS_VALUE` is `"1"`. Import them; do not re-type them.
- `buildReplayRunInput` returns the envelope **by the same reference**. Treat it as read-only; hand it straight to `createWorkflowRun`.
- A `null`/`undefined` `triggerData` yields `EMPTY_REPLAY_ENVELOPE` — a frozen `{}`, exported from `replay.ts`.
- `ReplayRunInput.replayedFromRunId` is not a `createWorkflowRun` parameter yet. Plan 41-11 adds the options bag that carries it.
- Call `isRunReplayable(run.status)` **before** `buildReplayRunInput`. The builder will happily build for a `completed` run, and a test asserts it does.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The smuggled-`dryRun` test case failed to typecheck**
- **Found during:** Task 2 (replay), at the post-GREEN `npm run typecheck`
- **Issue:** The "does not accept or return a dryRun flag" case spread `{ dryRun: true } as Record<string, never>` into the origin literal. `tsc` rejected it — TS2352, `Type 'boolean' is not comparable to type 'never'`. The cast was also dishonest: it asserted the excess property away rather than actually presenting one.
- **Fix:** Rewrote it as a named variable, `const smuggled = { ...origin(), dryRun: true }`, passed positionally. TypeScript's excess-property check does not apply to a variable, so the extra key is genuinely present at the call and the assertion that it does not appear in the output is now a real test rather than a cast.
- **Files modified:** `src/lib/workflows/__tests__/replay.test.ts`
- **Verification:** `npm run typecheck` → 0 errors; the case still passes (60/60).
- **Committed in:** `e16f795` (part of the task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1x Rule 1).
**Impact on plan:** None on scope. The fix made one assertion stronger than the plan's own wording implied. No scope creep; the plan installed nothing (T-41-SC holds).

## Issues Encountered

**The worktree branched from a stale base.** `git merge-base HEAD dc377c5` returned `aa01de2`, i.e. HEAD was three commits behind the base the orchestrator specified. `aa01de2` is an ancestor of `dc377c5`, so this was a pure fast-forward: `git reset --hard dc377c5` per the mandated pre-flight, verified, then bootstrap. Recorded because it is the second occurrence of the "worktree stale base" pattern and the check is what caught it.

**The runs page's inline parse was NOT edited.** `src/app/workflows/[id]/runs/page.tsx:12,36-47` still carries its own `VALID_STATUSES` set and `parseInt` page parse. That is the plan's instruction (41-10 rewires it), but it means the duplicate briefly exists in the tree. Until 41-10 lands, the *page* still accepts `?page=1e9` as `1` by luck of `parseInt` and has no `dryRun` handling at all.

## Verification

| Gate | Result |
| --- | --- |
| `npx vitest run src/lib/workflows/` | 3 files, **143 passed** |
| `npx vitest run` (full unit project) | **3995 passed**, 0 failed (baseline 3860 + the 135 added here) |
| `npx vitest run --config vitest.rsc.config.ts` | **8 passed** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors, 125 warnings** (baseline ≤127; no new warnings from these four files — `npx eslint` on them reports "No issues found") |
| Runtime `@/db` import in either module | none — `grep 'from "@/db'` on `runs-filter.ts` returns only line 27, `import type { WorkflowStatus }` |
| `?dryRun=2` non-truthy | asserted by name |
| `{}` hides test runs | asserted by name |
| `isRunReplayable("completed") === false` | asserted by name, and as a loop over the union |

Baseline preserved: the unit count moved only by the 135 tests these two files add, and the lint warning count is unchanged.

## User Setup Required

None — no external service configuration, no migration, no container restart. This plan is pure TypeScript modules and unit tests, and touched neither Postgres nor Docker.

## Next Phase Readiness

- **Plan 41-10** (runs-list rewire + dry-run toggle) can import `parseRunsSearchParams`, `SHOW_DRY_RUNS_PARAM` and `SHOW_DRY_RUNS_VALUE` today. It owns deleting the inline parse at `runs/page.tsx:12,36-47` and translating `RunsFilter` into the drizzle `where` — including the `dry_run` predicate, which needs plan 41-01's column.
- **Plan 41-11** (replay server action) can import `isRunReplayable`, `buildReplayRunInput` and `ReplayRunInput` today. It owns the session-only auth gate, the `runId`+`workflowId`-scoped origin lookup, the `replayedFromRunId` options bag on `createWorkflowRun`, and `revalidatePath`.
- **Blocker for neither:** both modules are independent of plan 41-01's migration. `showDryRuns` is a decision about the URL; whether a `dry_run` column exists to filter on is 41-01's business.
- **One thing a later plan must not do:** add a replay-chain-length guard. `replayedFromRunId` is diagnostic, never a guard — `replay.ts` says so in prose and a structural test asserts the absence of `MAX_REPLAY`/`chainLength`.

## Threat Flags

None. No new network endpoint, auth path, file access or schema change — both modules are pure functions over values that already cross the boundaries the plan's register enumerates. Every `mitigate` disposition in the register (T-41-07 through T-41-12, T-41-SC) is implemented and asserted; the register needs no additions.

## Self-Check: PASSED

All four created files exist on disk. All four task commits resolve in `git log`:
`cfd2686`, `0de1c58`, `4a81a2d`, `e16f795`. Working tree clean. `STATE.md` and `ROADMAP.md`
untouched — the orchestrator owns those writes.

---
*Phase: 41-workflow-operator-affordances*
*Completed: 2026-08-22*
