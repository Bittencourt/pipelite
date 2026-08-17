---
phase: 38-bulk-operations
plan: 03
subsystem: database
tags: [drizzle, zod, mutations, audit, crm-bus, tdd, vitest]

# Dependency graph
requires:
  - phase: 34-formula-fields
    provides: ENTITY_NATIVE_ATTRIBUTES, the recalculation scoping that makes ownerId a zero-evaluation write
  - phase: 36-audit-log
    provides: buildEventPayload/crmBus capture, buildChanges' data-vs-previous contract, the per-function SC-5 gate
  - phase: 37-trash
    provides: the pre-read/emit/catch mutation skeleton and the no-mutation-coupling carve-out
provides:
  - updateDealOwnerMutation(id, ownerId, userId) — writes ownerId only, never the assignee join table
  - updateActivityOwnerMutation(id, ownerId, userId) — writes ownerId only, never the assignee column
  - the T-38-05 deal_assignees data-loss regression gate (spy + source-slice)
  - the T-38-09 audit-visibility gate for an activity owner change
affects: [38-04, 38-13, 38-14, 38-19, bulk-reassign-server-actions, bulk-dispatch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "narrow single-field mutation: pre-read, idempotent early return before the try, .returning() update, one emit, prose catch"
    - "declaration-slice source gate with an anti-vacuity anchor assertion and a gate-for-the-gate"

key-files:
  created: []
  modified:
    - src/lib/mutations/deals.ts
    - src/lib/mutations/deals.test.ts
    - src/lib/mutations/activities.ts
    - src/lib/mutations/activities.test.ts

key-decisions:
  - "updateDealMutation's unconditional deal_assignees teardown is NOT fixed — this phase routes around it and the bug stays open"
  - "The set() object is exactly { ownerId, updatedAt } on both entities; the assignee column is out of scope by D-11"
  - "data is the full .returning() row, never a hand-built { id, ownerId } — buildChanges skips native keys absent from data on an update"
  - "The same-owner request returns early before the try, so a same-owner reassign correctly produces no audit row"
  - "No newAssigneeUserIds on the result, which is what makes D-13 (no email on bulk reassign) structural rather than flag-based"

patterns-established:
  - "Narrow owner mutation: the shape plans 38-01/38-02 mirror for organizations and people, and the arm signature (id, ownerId, userId) the 38-04 dispatch map depends on"
  - "Raw (unstripped) declaration-slice assertions: a comment that trips the gate is reworded, never the gate weakened"

requirements-completed: [BULK-03]

# Metrics
duration: 15min
completed: 2026-08-17
---

# Phase 38 Plan 03: Narrow Owner Mutations (Deals + Activities) Summary

**`updateDealOwnerMutation` and `updateActivityOwnerMutation`: two-column `.returning()` writes that emit the full post-write row with `changedFields: ["ownerId"]`, gated by a spy plus a source-slice assertion proving the deal path never issues a delete against the assignee join table.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-17T13:45:00Z
- **Completed:** 2026-08-17T14:00:10Z
- **Tasks:** 2 (both TDD: RED → GREEN, no REFACTOR needed)
- **Files modified:** 4

## Accomplishments

- **`updateDealOwnerMutation` routes around a live data-loss bug.** `updateDealMutation(id, { ownerId })` deletes every assignee join row for the deal, because `dealSchema.partial()` preserves `assigneeIds`' `.default([])` and `deals.ts` deletes unconditionally before deciding what to re-insert. The new mutation references neither the join table nor any delete on any path.
- **`updateActivityOwnerMutation` closes a silent no-op.** `activitySchema` never declared `ownerId`, and Zod strips unknown keys, so the generic update path would have written only `updatedAt`, emitted an empty diff, and had the audit subscriber drop the row — with the whole suite green. A standing test now pins that `activitySchema` still omits `ownerId`, so this rationale cannot quietly expire.
- **The T-38-05 gate is two-layered.** `expect(db.delete).not.toHaveBeenCalled()` covers the happy, same-owner and not-found paths; a raw declaration-slice assertion covers every path there is, including ones nobody thought to test.
- **19 new tests, all green**, plus Phase 36's per-function SC-5 gate now covering both new functions for free (the `update` prefix is what puts them inside its regex).
- **Both source diffs are purely additive** — 72 and 68 insertions, **0 deletions**. `updateDealMutation`, `dealSchema`, `updateDealSchema`, `activitySchema` and `updateActivityMutation` are byte-identical to their pre-plan state.

## Task Commits

Each task was committed atomically, RED then GREEN:

1. **Task 1: updateDealOwnerMutation plus the deal_assignees regression gate**
   - `827dfcc` (test) — 10 failing tests, 13 assertions red
   - `e34f055` (feat) — implementation, 72 insertions / 0 deletions
2. **Task 2: updateActivityOwnerMutation**
   - `dd96806` (test) — 10 failing tests, 9 red
   - `db84adb` (feat) — implementation, 68 insertions / 0 deletions

_No REFACTOR commit on either task: both functions landed at their final shape, and there was nothing to clean up._

## Files Created/Modified

- `src/lib/mutations/deals.ts` — `+updateDealOwnerMutation`, placed immediately before `updateDealStageMutation` so the two narrow mutations sit together. Docblock states plainly that the generic update path's join-table teardown is a pre-existing bug this function routes around rather than fixes.
- `src/lib/mutations/deals.test.ts` — `+describe("updateDealOwnerMutation")`: 10 tests, reusing the file's existing mock header unchanged. Adds `node:fs` / `node:path` imports for the source-slice gate.
- `src/lib/mutations/activities.ts` — `+updateActivityOwnerMutation`, placed immediately before `toggleActivityCompletionMutation` (this file's narrow-mutation sibling).
- `src/lib/mutations/activities.test.ts` — `+describe("updateActivityOwnerMutation")`: 10 tests, same structure minus the join-table gate (activities has no join table), plus the `activitySchema` standing assertion.
- `.planning/phases/38-bulk-operations/deferred-items.md` — created; one out-of-scope entry (see Issues Encountered).

## Decisions Made

- **`.returning()` over the `{ ...row, ownerId }` spread `updateDealStageMutation` uses.** A real post-write row cannot drift from the table. The emit payload assertions use `toBe` (identity), not `toEqual`, so a rebuilt equal-looking object fails.
- **The source-slice gates read RAW source, comments included.** The Phase 36 slicer strips comments; these do not. That makes the gate stricter, and it forced the in-body comments to be written without the forbidden identifiers (no `dealAssignees`, no `db.delete`, no `recalc`, no `assigneeId` inside the function bodies — the fuller prose lives in the docblock above the declaration, which the slice deliberately excludes). Phase 37's nine comment/gate collisions are the reason this is stated out loud.
- **Every gate carries an anti-vacuity anchor.** Each slice assertion checks `body.length > 0` with a named message and `expect(body).toContain("crmBus.emit")` before asserting any negative, and a separate "the slicer does not widen to the module" test pins the slicer itself.
- **The idempotent early return sits outside the `try`.** Nothing to write means nothing to fail and nothing to report; the D-15 short-circuit cannot be swallowed by a catch.

## Deviations from Plan

None — plan executed exactly as written. All four `must_haves.truths`, all three `artifacts` and both `key_links` are satisfied, and every acceptance criterion in both tasks was verified mechanically (see Verification below).

Two additive judgements inside the plan's stated discretion, neither a deviation:

- The plan asked for "at least 6" deal tests and "at least 5" activity tests; 10 and 10 shipped. The extras are the isNull-predicate assertion, the no-formula-pass assertion, the prose-failure branch, the slicer gate-for-the-gate, and the `activitySchema` standing assertion.
- The `set()`-keys assertion the plan required only for activities (T-38-13) was also written for deals, since it is the cheapest possible proof that the write is genuinely two columns wide.

## Issues Encountered

- **No `node_modules` in the worktree.** Symlinked to the main checkout's (`ln -s /home/pedro/programming/pipelite/node_modules ./node_modules`); `.gitignore` keeps it out of the index. `process.cwd()` remains the worktree, so the source-slice gates read the worktree's source, not the main checkout's.
- **One unrelated test fails under full-suite parallel load.** `condition-evaluator.test.ts:616` (T-34-20 linearity) is a wall-clock ratio assertion with a 10x tolerance; it measured 13.34x under `npm test` and passes in isolation, twice each way. Out of scope for this plan — neither changed file is in its import graph. Logged to `.planning/phases/38-bulk-operations/deferred-items.md`; **not fixed, not touched**.

## Verification

| Check | Result |
|---|---|
| `vitest run deals.test.ts activities.test.ts no-mutation-coupling.test.ts` | 145 passed / 145 (3 files) |
| `npm run typecheck` | 0 errors, zero new `@ts-expect-error` |
| `npm run lint` | 0 errors; 125 pre-existing warnings, **none** in either changed file |
| `npm test` (full suite) | 1727 passed, 4 skipped, 1 unrelated timing-jitter failure (deferred above) |
| `grep -c 'export async function updateDealOwnerMutation' deals.ts` | 1 |
| `grep -c 'export async function updateActivityOwnerMutation' activities.ts` | 1 |
| `git diff --stat` on both source files | 72 and 68 insertions, **0 deletions** |

## Known Stubs

None. Both functions are fully wired: real pre-read, real write, real emit, real catch. No placeholder values, no hardcoded empties, no TODO markers.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. The four threats this plan owns are all mitigated as registered:

| Threat | Status | Evidence |
|---|---|---|
| T-38-05 (silent assignee destruction) | mitigated | `expect(db.delete).not.toHaveBeenCalled()` on 3 paths + raw declaration-slice assertion over all paths |
| T-38-09 (unaudited activity owner change) | mitigated | `changedFields: ["ownerId"]` with the full post-write row; identity-asserted `data` and `previous` |
| T-38-13 (assignee column written by the owner mutation) | mitigated | recorded `set()` argument has exactly 2 keys; declaration slice contains zero occurrences of the identifier |
| T-38-14 (unwanted assignee email) | mitigated | `Object.keys(result)` is exactly `["success"]`; no `newAssigneeUserIds`, no `dealTitle` |

## Open Item Carried Forward — NOT closed by this plan

`updateDealMutation` still destroys every `deal_assignees` row when handed a partial payload
(`src/lib/mutations/deals.ts`, the unconditional delete before the re-insert decision). Blast radius
is zero today (`deal_assignees` has 0 rows, verified live in 38-RESEARCH) and no caller in this phase
reaches it, because the bulk path uses the narrow mutation. **This plan routed around the bug; it did
not fix it.** Do not read plan 38-03 as having closed it.

## User Setup Required

None — no external service configuration, no migration, no environment variable. Both changes are pure application code over existing columns (`deals.owner_id`, `activities.owner_id`).

## Next Phase Readiness

- The `(id, ownerId, userId)` arm signature the **38-04** dispatch map needs is now uniform across deals and activities, matching what 38-01/38-02 deliver for organizations and people. RESEARCH assumption A2 holds for this plan's half.
- **38-13** (deals bulk server action) and **38-14** (activities bulk server action) can call these directly. Reminder from 38-PATTERNS: the ownership predicate is asymmetric — deals carries `&& session.user.role !== "admin"`, activities does not. Copy verbatim; do not unify.
- **38-19**'s comment-stripped source gates will see both functions. Both are already free of the forbidden identifiers in code AND in their in-body comments, so nothing there should need rewording.
- No blockers. One concern, stated above: the `deal_assignees` teardown in `updateDealMutation` remains live for any future caller that passes a partial payload.

## Self-Check: PASSED

- All 4 modified source files present on disk.
- Both created planning files present on disk.
- All 4 task commit hashes (`827dfcc`, `e34f055`, `dd96806`, `db84adb`) found in `git log --all`.
- Both source diffs verified additive via `git diff --stat` (0 deletions each).

---
*Phase: 38-bulk-operations*
*Completed: 2026-08-17*
