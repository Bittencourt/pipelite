---
phase: 32-test-infrastructure-ci
plan: 03
subsystem: api
tags: [typescript, eslint, drizzle, vitest, next]

# Dependency graph
requires:
  - phase: 32-test-infrastructure-ci
    provides: "The D-01/D-03 lint-gate decisions this plan implements (no suppressions, hard-fail lint gate)"
provides:
  - "Zero eslint errors across the six v1 API route files (activities, pipelines, stages)"
  - "Derived Drizzle `with`-option and expanded-row types replacing the repeated `any` cast pattern"
  - "Typed vi.fn mock factories in toggle.test.ts / recursion.test.ts (no `as any`)"
  - "runs-routes.test.ts withApiAuth mock typed to the real (NextRequest, ApiAuthContext) => Promise<NextResponse> contract"
  - "Repo-wide eslint error count reduced from 28 to 14"
affects: [32-01, 32-02, 32-04, ci, lint-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derive Drizzle relational `with` types from the query builder: NonNullable<Parameters<typeof db.query.<table>.findFirst>[0]>[\"with\"]"
    - "Build expanded-row types as `typeof <table>.$inferSelect` intersected with optional relation properties derived from serializer parameter types"
    - "Give vi.fn an explicit generic call signature instead of casting the mock with `as any`"

key-files:
  created: []
  modified:
    - src/app/api/v1/activities/[id]/route.ts
    - src/app/api/v1/activities/route.ts
    - src/app/api/v1/pipelines/[id]/route.ts
    - src/app/api/v1/pipelines/route.ts
    - src/app/api/v1/stages/[id]/route.ts
    - src/app/api/v1/stages/route.ts
    - src/lib/execution/toggle.test.ts
    - src/lib/execution/recursion.test.ts
    - src/app/api/v1/workflows/__tests__/runs-routes.test.ts
    - src/lib/import/pipedrive-api-transformers.ts

key-decisions:
  - "Used `true as const` in the spread-guarded withOptions literals — a widened `boolean` does not satisfy Drizzle's `with` type"
  - "Typed the activity `type` relation as `typeof activityTypes.$inferSelect` rather than a hand-written column list, which also cleared the pre-existing unused-import warning for activityTypes"
  - "Declared a named `ownershipWith: StageWith` local in verifyStageOwnership so the inline `{ pipeline: true } as any` cast disappears without an inline assertion"
  - "Kept the pre-existing GET /stages/:id behaviour where ownership is checked against `stage.pipeline` that is only loaded when `?expand=pipeline` is present — a real fix would change runtime behaviour and is out of this plan's typing-only scope"

patterns-established:
  - "Drizzle dynamic-expand routes: derive `<Entity>With` from the query builder and `<Entity>Expanded` from $inferSelect + serializer parameter types; never `any`"
  - "vitest mock factories: `vi.fn<(table?: unknown) => Shape>(...)` so the mocked module can invoke them with arguments without casts"

requirements-completed: [CI-04]

# Metrics
duration: 22min
completed: 2026-08-14
---

# Phase 32 Plan 03: Non-JSX Lint Error Cleanup Summary

**14 of the repo's 28 eslint errors cleared by real typing — Drizzle `with`/row types derived from the query builder in six v1 API routes, generic call signatures on vitest mock factories, and the mocked `withApiAuth` handler bound to its real contract — with zero suppressions added.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-08-14T11:48Z
- **Completed:** 2026-08-14T12:10:20Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- All eight `@typescript-eslint/no-explicit-any` errors in `src/app/api/v1/{activities,pipelines,stages}` removed by deriving types from the Drizzle query builder rather than casting.
- Every `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment in those three route directories deleted — none repositioned (D-01). Four of them were already dead (`Unused eslint-disable directive` warnings) because they sat above the wrong line.
- The four `no-explicit-any` errors in `toggle.test.ts` / `recursion.test.ts` cleared by giving `vi.fn` explicit generic call signatures, adding **zero** new warnings (the unused-`_table`-parameter alternative was explicitly rejected by the plan for that reason).
- `runs-routes.test.ts`'s bare `Function` replaced with an `ApiRouteHandler` alias mirroring `src/lib/api/auth.ts`, imported via `import type` so the mocked module is not resurrected at runtime.
- `prefer-const` in `pipedrive-api-transformers.ts` cleared.
- Repo-wide eslint errors: **28 → 14**. The remaining 14 are exactly the ones owned by plans 32-02 (`prefer-const` ×1 in `formula-engine.ts`) and 32-04 (`react/no-unescaped-entities` ×8, `react-hooks/*` ×5).

## Task Commits

1. **Task 1: Replace the eight Drizzle `any` casts in the v1 API routes with derived types** — `adeeca3` (refactor)
2. **Task 2: Type the test mock factories and clear the last prefer-const** — `e7b5f77` (refactor)

**Plan metadata:** committed with this SUMMARY.

## Files Created/Modified

- `src/app/api/v1/activities/[id]/route.ts` — added `ActivityWith` / `ActivityExpanded`; `withOptions` is now a `const` spread-guarded literal; result cast is `ActivityExpanded | undefined`.
- `src/app/api/v1/activities/route.ts` — same pattern against `findMany`; result cast is `Promise<ActivityExpanded[]>`.
- `src/app/api/v1/pipelines/[id]/route.ts` — `PipelineWith` / `PipelineExpanded` (owner + stages relations).
- `src/app/api/v1/pipelines/route.ts` — list variant of the same.
- `src/app/api/v1/stages/[id]/route.ts` — `StageWith` / `StageExpanded`; `verifyStageOwnership` now uses a typed `ownershipWith` local instead of `{ pipeline: true } as any`.
- `src/app/api/v1/stages/route.ts` — list variant; `stageList` is `StageExpanded[]`.
- `src/lib/execution/toggle.test.ts` — `mockUpdate` / `mockInsert` given `vi.fn<(table?: unknown) => …>` signatures; three `as any` casts dropped from the `vi.mock("@/db")` factory.
- `src/lib/execution/recursion.test.ts` — same for `mockInsert`.
- `src/app/api/v1/workflows/__tests__/runs-routes.test.ts` — `ApiRouteHandler` type alias + `import type { ApiAuthContext }`.
- `src/lib/import/pipedrive-api-transformers.ts` — `let type` → `const type`.

## Decisions Made

- **`true as const` everywhere in the rebuilt `withOptions` literals.** A widened `boolean` does not satisfy Drizzle's relational `with` type; the plan flagged this and it held in practice.
- **`activityTypes.$inferSelect` for the activity `type` relation.** Deriving from the schema rather than restating `{ id, name, icon, color }` keeps the type honest and, as a side effect, turned the pre-existing `'activityTypes' is defined but never used` warning into a real usage.
- **Named `ownershipWith` local in `verifyStageOwnership`.** Annotating a `const` with `StageWith` is cleaner than an inline `satisfies`/assertion and keeps the call site cast-free.
- **Left the redundant `as Parameters<typeof serializeDeal>[0]`-style casts in place.** They are not lint errors, they still compile against the new precise types, and removing them was out of scope.
- **Did not "fix" the GET `/stages/:id` ownership quirk** (403 when `?expand=pipeline` is absent, because `stage.pipeline` is only loaded on expand). This is a pre-existing runtime behaviour; T-32-10 required the typing change to be behaviour-neutral, so it is logged here rather than changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Symlinked `node_modules` into the worktree**
- **Found during:** Task 1 (baseline verification)
- **Issue:** The git worktree has no `node_modules`, so `node ./node_modules/typescript/bin/tsc` and the eslint/vitest invocations in the plan's `<verify>` blocks failed with `MODULE_NOT_FOUND`. No verification command in the plan could run.
- **Fix:** `ln -s /home/pedro/programming/pipelite/node_modules ./node_modules`. No package was installed; the existing, already-audited dependency tree from the main checkout is reused. The symlink is gitignored and is not part of any commit.
- **Files modified:** none tracked
- **Verification:** `git status --short` shows no untracked entry for it; `git diff --name-only 12ba143..HEAD` lists exactly the ten `files_modified` paths.
- **Committed in:** n/a (untracked, gitignored)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Environment-only. No source or config change, no scope creep, no package installed.

## Issues Encountered

- The plan's error inventory listed 14 errors; the live baseline matched it exactly, line-for-line. Four *additional* `Unused eslint-disable directive` **warnings** were present, confirming the plan's observation that several disable comments were misplaced and were suppressing nothing. Deleting the comments (as D-01 requires) cleared those warnings too.
- No test imports any of the six v1 route modules (`grep -rln "api/v1/{pipelines,stages,activities}" src --include=*.test.ts` returns nothing), so Task 1 carries no test-coverage safety net beyond `tsc`. The precise `…Expanded` types are what now prove the ownership-check property accesses (`ownerId`, `pipeline.ownerId`, `pipeline.deletedAt`) compile against a real shape instead of `any`.

## Verification Results

| Check | Expected | Actual |
|-------|----------|--------|
| severity-2 eslint messages across the ten `files_modified` | 0 | **0** |
| `tsc --noEmit` | exit 0 | **exit 0** |
| `vitest run toggle.test.ts recursion.test.ts` | 14 passed | **14 passed** (9 + 5) |
| `vitest run runs-routes.test.ts` | exit 0 | **exit 0** (4 passed) |
| `grep -rn 'eslint-disable' src/app/api/v1/{activities,pipelines,stages}` | no output | **no output** |
| `grep -rnw 'any'` in those dirs | no output | only the English word "any" in two prose comments |
| eslint warnings: `toggle.test.ts` / `recursion.test.ts` | 0 / 1 | **0 / 1** (`mockValues` unused, pre-existing) |
| `git diff --name-only` includes `src/lib/formula-engine.ts` | no | **no** |
| `eslint.config.mjs` modified | no | **no** |
| repo-wide eslint errors | 28 → 14 | **14** (8 `no-unescaped-entities`, 5 `react-hooks/*`, 1 `prefer-const`) |

## Known Stubs

None.

## Threat Flags

None — no new network endpoint, auth path, file access pattern, or schema change was introduced. The three `mitigate` dispositions were honoured: ownership checks and `isNull(deletedAt)` filters are unchanged (T-32-10), the rebuilt `withOptions` literals enumerate exactly the relations the mutation-based versions did (T-32-11), and the `withApiAuth` mock now breaks at compile time if the auth contract changes (T-32-12).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The non-JSX half of the D-01 lint cleanup is done. The lint gate (D-03) can go green as soon as plans 32-02 (`formula-engine.ts` `prefer-const`) and 32-04 (the 13 React/JSX errors) land.
- No dependency on plan 32-01's `vitest.config.ts` / `package.json` work; all verification here used explicit file paths.
- Note for whoever wires CI: the worktree used a symlinked `node_modules`. CI will need a real `npm ci` step — nothing in this plan assumes otherwise.

---
*Phase: 32-test-infrastructure-ci*
*Completed: 2026-08-14*
