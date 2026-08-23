---
phase: 41-workflow-operator-affordances
plan: 11
subsystem: api
tags: [server-actions, workflows, replay, dry-run, drizzle, zod-free-validation, source-scan]

# Dependency graph
requires:
  - phase: 41-01
    provides: "workflow_runs.dry_run (NOT NULL DEFAULT false) and workflow_runs.replayed_from_run_id, migration 0019 applied"
  - phase: 41-02
    provides: "src/lib/workflows/replay.ts — isRunReplayable, buildReplayRunInput, EMPTY_REPLAY_ENVELOPE"
provides:
  - "createWorkflowRun's additive 4th parameter (CreateWorkflowRunOptions), carried by BOTH insert branches"
  - "replayWorkflowRun(workflowId, runId) — session-gated, two-id scoped, failed-only"
  - "startDryRun(workflowId, triggerDataJson) — server-side JSON re-validation, server-set dryRun flag"
  - "getWorkflowRunStatus(workflowId, runId) — never-throwing poll target"
  - "functionRegion(): a TS function-body extractor for bounded source-scan assertions"
affects: [41-12, 41-13, 41-14, 41-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive options bag on a shared insert helper, spread conditionally so an absent option writes NO key (the NOT NULL DEFAULT can then apply)"
    - "Bounded per-function source-scan assertions over a `use server` module that cannot be unit-tested"

key-files:
  created: []
  modified:
    - src/lib/triggers/create-run.ts
    - src/lib/triggers/create-run.test.ts
    - src/lib/execution/recursion.test.ts
    - src/app/workflows/actions.ts
    - src/lib/workflows/__tests__/replay.test.ts

key-decisions:
  - "D-A4 upheld: auth on all three actions is SESSION-ONLY, deliberately not replayDelivery's admin gate. The missing role check is a decision, not an omission."
  - "Pitfall 8 upheld: startDryRun does NOT check workflow.active — the phase goal is 'a failed or UNPROVEN workflow', and an active check makes a never-activated draft untestable."
  - "The two trigger-data rejections are returned as the CODES \"invalidJson\" and \"notAnObject\", inline string literals rather than exported constants, because a `use server` module may only export async functions."
  - "A dry run's envelope uses trigger_type \"manual\" with trigger_id \"dry_run\": TriggerEnvelope's trigger_type is a closed 4-member union shared by every trigger path, and widening it was out of scope."
  - "Negative source-scan assertions (no role check, no admin literal, no active check) are scoped to individual function bodies, because removeHttpTemplate in the same file legitimately contains both a role read and the \"admin\" literal."

patterns-established:
  - "functionRegion(source, name): bounds a TS function BODY by brace depth AND asserts the signature reads `): Promise<NamedResult> {`, so a region can never silently be the return-type annotation"
  - "Conditional-spread options: build a local `extra` object, add a key only when the option is meaningfully present, spread it into every insert branch"

requirements-completed: [WFOPS-01, WFOPS-02]

# Metrics
duration: 42min
completed: 2026-08-22
---

# Phase 41 Plan 11: Replay and Dry-Run Server Actions Summary

**`createWorkflowRun` gained an additive options bag that both of its insert branches carry, and the three actions the phase's UI needs now exist behind a session gate, a two-id origin lookup, a failed-only predicate, and a server-side JSON re-validation that refuses `null`, arrays and scalars.**

## Performance

- **Duration:** ~42 min
- **Tasks:** 3 of 3
- **Files modified:** 5
- **Commits:** 6 (three RED/GREEN pairs)

## TDD Gate Compliance

Three RED/GREEN pairs, each RED run recorded before its implementation existed.

| Task | RED (actual) | GREEN | RED commit | GREEN commit |
|------|--------------|-------|------------|--------------|
| 1 — options bag on both insert branches | **4 failed / 21 passed** | 109 passed (`src/lib/triggers/` + `recursion.test.ts`) | `ba27bed` | `3a22d6f` |
| 2 — replayWorkflowRun + getWorkflowRunStatus | **13 failed / 62 passed** | 75 passed (`replay.test.ts`) | `64ecf5e` | `2f109bf` |
| 3 — startDryRun | **10 failed / 75 passed** | 181 passed (`replay.test.ts` + `src/lib/triggers/`) | `f64964a` | `908b323` |

No REFACTOR commit was needed; no test passed unexpectedly during any RED phase.

## Exact signatures — plans 41-13 and 41-14 must not guess these

```ts
// src/lib/triggers/create-run.ts
export interface CreateWorkflowRunOptions {
  dryRun?: boolean
  replayedFromRunId?: string
}

export async function createWorkflowRun(
  workflowId: string,
  triggerEnvelope: TriggerEnvelope,
  depth?: number,
  options?: CreateWorkflowRunOptions,       // ADDITIVE — all five existing call sites unchanged
): Promise<WorkflowRun>
```

```ts
// src/app/workflows/actions.ts  ("use server")
export type ReplayWorkflowRunResult =
  | { success: true; runId: string }
  | { success: false; error: string }

export type WorkflowRunStatusResult =
  | { success: true; status: WorkflowStatus | null; dryRun: boolean | null }
  | { success: false; error: string }

export type StartDryRunResult =
  | { success: true; runId: string }
  | { success: false; error: string }

export async function replayWorkflowRun(
  workflowId: string,
  runId: string,
): Promise<ReplayWorkflowRunResult>

export async function getWorkflowRunStatus(
  workflowId: string,
  runId: string,
): Promise<WorkflowRunStatusResult>

export async function startDryRun(
  workflowId: string,
  triggerDataJson: string,          // RAW JSON STRING, not a parsed object
): Promise<StartDryRunResult>
```

**Both id parameters are required on all three, in that order (`workflowId` first).** Deriving the
workflow id from the run inside the action would make the origin lookup single-keyed and defeat the
enumeration control (T-41-60).

### The error strings, verbatim

| Action | Condition | `error` value |
|--------|-----------|---------------|
| all three | no session | `"Not authenticated"` |
| `replayWorkflowRun` | no run matching BOTH ids | `"Run not found"` |
| `replayWorkflowRun` | origin status is not `failed` | `"Only failed runs can be replayed"` |
| `startDryRun` | no workflow with that id | `"Workflow not found"` |
| `startDryRun` | workflow has zero nodes | `"Workflow has no steps to test"` |
| `startDryRun` | **`JSON.parse` threw** | **`"invalidJson"`** → render `workflows.dryRun.invalidJson` |
| `startDryRun` | **parsed value is `null`, an array, or a scalar** | **`"notAnObject"`** → render `workflows.dryRun.notAnObject` |

The last two are the two DISTINCT codes the dialog must map. They are deliberately codes rather than
prose — the sentence is the client's to translate, and this module has no locale. They are inline
string literals, **not exported constants**: a `"use server"` module may only export async functions,
so a `export const DRY_RUN_INVALID_JSON` would fail the Next.js build.

`getWorkflowRunStatus` returns `{ success: true, status: null, dryRun: null }` for an absent row —
a SUCCESS, not an error, so the poller can stop rather than retry forever (T-41-67). It returns no
timestamp of any kind, so no `Date` crosses the server-action boundary.

## D-A4, restated so the verifier does not read the missing admin gate as an omission

**There is no role check in any of the three actions, and that is the recorded decision, not a gap.**

`replayDelivery` (`src/app/admin/webhooks/actions.ts:90-108`) is the named precedent for the SHAPE of
a replay action — its `revalidatePath` + `{ success, id }` return were taken. Its admin gate was
deliberately rejected, because:

- the run detail page has no role check, and `run-changed-records.tsx:117-120` documents that
  omission as deliberate: *"workflows are not owner-scoped in this product"*;
- STATE.md § Decisions records *"Workflows not owner-scoped; all authenticated users can CRUD any
  workflow"*;
- `triggerManualRun` has no role gate at all, so a user who can already edit and manually trigger any
  workflow gains no new capability from replaying one;
- an admin gate would 403 exactly the non-admin users the run detail page renders the replay button
  to.

This is T-41-61, disposition **accept**. The session gate is asserted by source scan to run BEFORE
any database read in all three actions, so a refusal costs zero reads whatever id is sent.

The header comment in `actions.ts` records all four pieces of evidence in code, and the test asserts
each new function's body contains neither `session.user.role` nor `admin`.

## Threat register dispositions actually implemented

| Threat | Control shipped | Asserted by |
|--------|-----------------|-------------|
| T-41-60 (info disclosure) | `and(eq(workflowRuns.id, runId), eq(workflowRuns.workflowId, workflowId))` in `replayWorkflowRun` and `getWorkflowRunStatus` | `scopedByBothIds()` over the bounded region, via `callArguments(region, "and")` |
| T-41-61 (auth posture) | session-only, gate before any read | offset of `auth()` < offset of `.select(` per region; no role/`admin` in region |
| T-41-62 (trigger-data tampering) | `JSON.parse` in try/catch, then `parsed === null \|\| typeof parsed !== "object" \|\| Array.isArray(parsed)` | region must contain `Array.isArray` and a `typeof`/`.object(` |
| T-41-63 (client-asserted dry-run) | `{ dryRun: true }` literal at the `createWorkflowRun` call; not a parameter of the action | every `dryRun:` binding in the region must be the literal `true` |
| T-41-64 (bypassing the recursion guard) | all three go through `createWorkflowRun` | region contains `createWorkflowRun`; whole file contains no `db.insert(workflowRuns` |
| T-41-65 (replay amplification) | failed-only predicate server-side, `depth: 0` re-bounding, `replayedFromRunId` audit trail, origin row never mutated | `isRunReplayable` offset < `buildReplayRunInput` offset |
| T-41-66 (unlimited dry runs) | accepted, recorded in a code comment | — |
| T-41-67 (throwing poll target) | absent row is `{ success: true, status: null, dryRun: null }` | whitespace-normalised region must contain that exact triple |
| T-41-SC | nothing installed | — |

## Wave-1 contracts honoured, not "tidied"

- `buildReplayRunInput`'s returned envelope is passed **straight into** `createWorkflowRun` by the
  same reference. No `structuredClone`, no JSON round-trip. A comment at the call site records that
  the caller must not mutate it.
- A `null`/`undefined` `triggerData` yields the frozen `EMPTY_REPLAY_ENVELOPE` (`{}`) untouched — no
  synthesised timestamp, no fabricated `trigger_type`.
- `isRunReplayable` is called, never re-derived; the `"failed"` literal appears nowhere in
  `actions.ts`.
- `MAX_PAGE_DIGITS` / `SHOW_DRY_RUNS_PARAM` / `SHOW_DRY_RUNS_VALUE` were not needed by these three
  actions (they are URL vocabulary, and none of these actions reads a URL), so nothing was re-typed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The whole-file `"admin"` negative assertion was unsatisfiable**

- **Found during:** Task 2 (writing the RED source scan)
- **Issue:** The plan specified *"the stripped source contains NO `session.user.role` and NO `"admin"`
  string"* over `src/app/workflows/actions.ts`. That file already contains
  `removeHttpTemplate`, which reads `(session.user as { role?: string }).role === "admin"` to decide
  whether a user may delete someone else's HTTP template. A whole-file negative would therefore have
  been impossible to satisfy without deleting an unrelated, correct authorization check.
- **Fix:** Every negative assertion is scoped to the body of the individual new function via
  `functionRegion`, and each is paired with `expect(region.length).toBeLessThan(source.length)` so a
  region-extraction failure that returned the whole file cannot make the negative pass by luck. The
  plan's own anti-vacuity requirement (assert `getHttpTemplates` is present first) is kept as a
  whole-file check.
- **Files modified:** `src/lib/workflows/__tests__/replay.test.ts`
- **Commit:** `64ecf5e`

**2. [Rule 3 - Blocking] No function-body region extractor existed**

- **Found during:** Task 2
- **Issue:** The plan said to bound regions with `elementRegion` or `callArguments` from
  `source-scan.ts`. `elementRegion` matches `<tag>…</tag>` and throws on a `.ts` file with no JSX;
  `callArguments` bounds an argument list, not a body. Neither can bound a TypeScript function.
- **Fix:** Added a module-private `functionRegion(source, name)` to `replay.test.ts` — brace-depth
  and string-aware — following the precedent `source-scan.ts`'s own header records (40-08 kept its
  extractors module-private until a third consumer justified promotion). It additionally **asserts
  the signature reads `): Promise<NamedResult> {`** and throws a self-explaining error otherwise, so
  an inline `Promise<{ success: true; … }>` return type can never cause the region to silently be the
  type annotation. That is the same property `src/app/duplicates/actions.ts:117-127` names its result
  types for, now enforced instead of documented.
- **Files modified:** `src/lib/workflows/__tests__/replay.test.ts`
- **Commit:** `64ecf5e`

**3. [Rule 3 - Blocking] `TriggerEnvelope.trigger_type` is a closed union**

- **Found during:** Task 3
- **Issue:** The plan said to build the envelope with *"a trigger type identifying it as a dry run"*.
  `TriggerEnvelope.trigger_type` is `"crm_event" | "schedule" | "webhook" | "manual"` — a closed
  4-member union in `src/lib/triggers/types.ts`, which is not in this plan's `files_modified` and is
  shared by every trigger path, the engine and the matcher.
- **Fix:** `trigger_type: "manual"` with `trigger_id: "dry_run"`, mirroring `manual-trigger.ts`'s
  `trigger_id: "manual"`. The authoritative marker of a test run is the `dry_run` column, which the
  engine re-derives on every entry; the `trigger_id` is for a human reading the run detail page.
- **Files modified:** `src/app/workflows/actions.ts`
- **Commit:** `908b323`

**4. [Rule 3 - Blocking] The two error codes cannot be exported constants**

- **Found during:** Task 3
- **Issue:** A `"use server"` module may only export async functions; `export const
  DRY_RUN_INVALID_JSON = "invalidJson"` would fail the Next.js build.
- **Fix:** The codes are inline literals at their return sites, each with a comment naming the
  message key the client maps it to. Recorded in this SUMMARY's table so 41-13/41-14 do not guess.
- **Files modified:** `src/app/workflows/actions.ts`
- **Commit:** `908b323`

### Also worth recording (not deviations)

- The worktree branched from the stale base `aa01de2` — **five for five now**. Corrected with
  `git reset --hard c747ed3` as the first action, before anything else.
- Zero-node guard reads `workflows.nodes` only (`db.select({ nodes: workflows.nodes })`), so
  `startDryRun` never loads the whole workflow row.
- `claimWorkflowRun` is untouched, as required.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change beyond the three
actions the plan's own threat model already covers.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/lib/triggers/ src/lib/execution/recursion.test.ts src/lib/workflows/` | green (181 passed on the task-3 GREEN run) |
| `npm test` | **4049 passed / 32 skipped**, RSC **8/8** — baseline 4011 + 38 new |
| `npm run typecheck` | **0 errors** (proves all five existing `createWorkflowRun` call sites still compile) |
| `npm run lint` | **0 errors, 124 warnings** (≤127) |
| `src/app/workflows/actions.ts` new functions | no `session.user.role`, no `admin`, no `db.insert(workflowRuns`, no `workflow.active` in `startDryRun` |
| Both `createWorkflowRun` insert branches | carry the options; asserted separately in `create-run.test.ts` (branch 2) and `recursion.test.ts` (branch 1) |

## Self-Check: PASSED

- `src/lib/triggers/create-run.ts` — FOUND
- `src/lib/triggers/create-run.test.ts` — FOUND
- `src/lib/execution/recursion.test.ts` — FOUND
- `src/app/workflows/actions.ts` — FOUND
- `src/lib/workflows/__tests__/replay.test.ts` — FOUND
- commits `ba27bed`, `3a22d6f`, `64ecf5e`, `2f109bf`, `f64964a`, `908b323` — all FOUND in `git log`

## Notes for the next plans

- **41-13 (run detail page):** call `replayWorkflowRun(workflowId, runId)`. The render site must stay
  written literally `{run.status === "failed" && ( … )}` for the reshaped UI-SPEC G-6 gate; do not
  import a status constant, there is none.
- **41-14 (dry-run dialog):** call `startDryRun(workflowId, triggerDataJson)` with the **raw string**
  from the textarea — do not parse it client-side and pass an object, the action's parameter is a
  string and the server parse is the boundary. Map `error === "invalidJson"` to
  `workflows.dryRun.invalidJson` and `error === "notAnObject"` to `workflows.dryRun.notAnObject`.
  Poll `getWorkflowRunStatus(workflowId, runId)` and stop on `status === null` as well as on a
  terminal status — a `null` means the row is gone, not that the request failed.
- **STATE.md / ROADMAP.md were NOT touched**, per the parallel-executor contract.
