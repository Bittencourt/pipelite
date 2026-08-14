---
phase: 34-formula-reactivity
plan: 02
subsystem: database
tags: [drizzle, jsonb, zod, custom-fields, vitest, mutations]

# Dependency graph
requires:
  - phase: 33-custom-field-depth
    provides: the custom_fields JSONB column and the v1 route merge semantics copied here
provides:
  - customFields persisted on create in all four entity mutations (deals, people, organizations, activities), defaulting to {} when omitted
  - customFields shallow-merged onto the stored blob on update, and only when the caller supplies it
  - "customFields" pushed into changedFields on updates that carry custom fields, giving downstream scoping (FORMULA-02) a signal
  - a 20-test regression block (5 per entity) that fails if the drop returns
affects: [34-03-recalculation-helper, 34-06, 34-07, 34-08, 34-09, 34-10, formula-reactivity, workflow-crm-action]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Custom field writes use `validated.data.customFields ?? {}` on insert (Zod-parsed value, never the raw input, never NULL)"
    - "Custom field updates shallow-merge onto the already-fetched existence-check row: no second read, no blanket overwrite"

key-files:
  created: []
  modified:
    - src/lib/mutations/deals.ts
    - src/lib/mutations/people.ts
    - src/lib/mutations/organizations.ts
    - src/lib/mutations/activities.ts
    - src/lib/mutations/deals.test.ts
    - src/lib/mutations/people.test.ts
    - src/lib/mutations/organizations.test.ts
    - src/lib/mutations/activities.test.ts

key-decisions:
  - "changedFields gains \"customFields\" whenever the caller supplies the field, without deep-comparing against the stored blob — mirrors v1/deals/[id]/route.ts:245-251 exactly rather than inventing a second semantic"
  - "The update branch writes the column only when `validated.data.customFields !== undefined`, so an unrelated edit can never wipe stored (future formula) values — this is the T-34-07 mitigation and is pinned by a dedicated test"
  - "Merge is a plain object spread, so keys with spaces and punctuation (\"CNPJ / CPF\") round-trip; fixtures use such keys deliberately"
  - "Reused each test file's existing chain-stub style (local valuesFn/setFn consts read via .mock.calls[0][0]) instead of the mock.results accessor, per the plan's instruction to prefer the file's existing idiom"

patterns-established:
  - "Pattern: JSONB custom field persistence — insert with `?? {}`, update with conditional shallow merge onto the existence-check row + changedFields push"
  - "Pattern: per-entity `describe(\"customFields persistence (D-12)\")` regression block, 5 tests (create supplied, create omitted, update merge, changedFields signal, absent-input guard)"

requirements-completed: [FORMULA-01]

# Metrics
duration: 27min
completed: 2026-08-14
---

# Phase 34 Plan 02: Mutation-Layer customFields Persistence Summary

**All four entity mutations now actually write the `customFields` they already accepted in Zod — insert defaults to `{}`, update shallow-merges onto the stored blob and signals `changedFields` — closing the silent data loss on `POST /api/v1/organizations` and `POST /api/v1/activities`.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-08-14T02:07:00Z
- **Completed:** 2026-08-14T02:34:00Z
- **Tasks:** 2 (TDD: RED then GREEN)
- **Files modified:** 8

## Accomplishments

- Fixed the D-12 prerequisite defect: all four `db.insert(...).values({...})` calls (`deals.ts`, `people.ts`, `organizations.ts`, `activities.ts`) now include `customFields: validated.data.customFields ?? {}`. Before this, every mutation accepted the field in its Zod schema and its `Create*Input` interface, then discarded it.
- All four update mutations now shallow-merge `customFields` onto the row already fetched for the existence check (no extra query) and push `"customFields"` into `changedFields`, mirroring `src/app/api/v1/deals/[id]/route.ts:245-251`.
- The merge is conditional on the caller having supplied the field, so an unrelated edit cannot blank stored keys — the invariant plan 34-03's `recalculateFormulas` depends on.
- Added 20 regression tests (5 per entity). 16 failed before the fix and pass after; the remaining 4 are the absent-input guard, which must pass in both states and does.
- `POST /api/v1/organizations` and `POST /api/v1/activities`, which pass `custom_fields` straight into these mutations, no longer return 201 with an empty blob.

## Task Commits

1. **Task 1: RED — regression tests proving customFields is dropped** - `b4d1b5d` (test)
2. **Task 2: GREEN — persist customFields on create and merge on update** - `a75377b` (fix)

TDD gate sequence verified in git log: `test(34-02)` precedes `fix(34-02)`. No refactor commit was needed — the GREEN implementation is four four-line additions per entity with no cleanup debt.

## Files Created/Modified

- `src/lib/mutations/deals.ts` - insert now writes `customFields`; update merges it and pushes `changedFields`
- `src/lib/mutations/people.ts` - same, merging onto the `person` existence-check row
- `src/lib/mutations/organizations.ts` - same, merging onto the `organization` existence-check row
- `src/lib/mutations/activities.ts` - same, merging onto the `activity` existence-check row
- `src/lib/mutations/deals.test.ts` - `customFields persistence (D-12)` block (5 tests)
- `src/lib/mutations/people.test.ts` - same (5 tests)
- `src/lib/mutations/organizations.test.ts` - same (5 tests)
- `src/lib/mutations/activities.test.ts` - same (5 tests)

## Decisions Made

- **`changedFields` push is unconditional on supply, not on value change.** The plan pointed at `v1/deals/[id]/route.ts:245-251` as the semantics to copy, and that reference pushes whenever `custom_fields !== undefined`. Deep-comparing blobs to decide would create a second, subtly different semantic between the route and the mutation for no benefit.
- **`?? {}` rather than a bare spread on insert.** The column is `jsonb(...).$type<Record<string, unknown>>().default({})` and nullable at the type level; RESEARCH § "Stored Shape" measured that it is never SQL NULL in practice. Writing `{}` explicitly preserves that invariant instead of relying on the DB default only when the key is absent.
- **No cast needed on the merge.** All four schema columns are `$type<Record<string, unknown>>()`, so `...(row.customFields ?? {})` typechecks without the `as Record<string, unknown>` the v1 route uses.
- **Route files left untouched.** `src/app/api/v1/organizations/[id]/route.ts:120-130` performs its own redundant `custom_fields` merge after calling the mutation. It merges onto the same value and is therefore idempotent; plan 34-07 owns removing it. `git diff --name-only -- src/app` is empty.

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 deviations were triggered; no dependencies were added (`git diff --stat -- package.json package-lock.json` empty, satisfying T-34-SC).

## Issues Encountered

- **The base commit does not typecheck, and the full suite hangs — both caused by plan 34-01's in-flight RED tests, not by this plan.** This plan was based on `8bc994c`, which is 34-01's RED commit. At that commit `npx tsc --noEmit` already reported 3 errors, all in `src/lib/formula-engine.test.ts` (`L387/L401/L408: TS2554 Expected 1-3 arguments, but got 4` — the tests call `evaluateFormula` with a 4th resource-limit argument that plan 34-01's GREEN step will add). Separately, `npm test` never terminates, because those same RED tests exercise an unbounded loop that the not-yet-implemented resource limit is meant to stop.

  Both are strictly out of this plan's scope (`formula-engine.ts` and its test are owned by the concurrent 34-01 agent and were explicitly off-limits). Gates were therefore measured as follows, and the tsc error set is **byte-identical** before and after this plan's changes — zero new type errors from the eight files touched here:

  | Gate | Baseline at `8bc994c` | After `a75377b` |
  |------|----------------------|-----------------|
  | `npx vitest run src/lib/mutations/` | 48 pass / 0 fail | **68 pass / 0 fail** |
  | `npx vitest run --exclude src/lib/formula-engine.test.ts` | 398 pass / 0 fail | **418 pass / 0 fail** (+20, exactly the new tests) |
  | `npx tsc --noEmit` | 3 errors, all `formula-engine.test.ts` | 3 errors, all `formula-engine.test.ts` (unchanged) |
  | `npx eslint .` | 0 errors | **0 errors** (128 pre-existing warnings, none in touched files) |

  398 + 63 formula-engine tests = the 461 baseline the plan cites, so the exclusion accounts for the full suite. Once 34-01's GREEN lands on master, `npm test` and `tsc` should both go green with no further action here.

- **RED produced 16 failures, not 20.** Expected and correct: Test E (update without `customFields`) asserts the column is absent from the `set(...)` payload, which is trivially true before the fix. It is a guard against a future blanket-overwrite regression, so it must pass in both states. The 16 real failures were 4 entities × Tests A-D, every message reading `expected undefined to deeply equal ...` (missing key) or, for Test D, `changedFields` being `null` — none a mock-wiring `TypeError`.

## Threat Model Notes

- **T-34-07 (Tampering, update-path merge) — mitigated here.** The conditional shallow spread is implemented and pinned by the absent-input guard test in all four entities.
- **T-34-04 (Tampering, client-settable custom field keys) — remains open by design.** This plan makes the column writable from client input for the first time. `stripFormulaKeys` (plan 34-03), applied at every write path in plans 34-06 through 34-10, is the mitigation. The transient exposure is the accepted one from the plan's register: 0 of 169 live custom field definitions are of type `formula`, so no formula-typed key is reachable yet.
- **No new threat surface beyond the plan's register.** No new endpoint, auth path, file access, or schema change was introduced — only a column that was already declared, already validated, and already accepted at the trust boundary is now actually written.

## Known Stubs

None. No placeholder values, empty-literal data sources, or TODO/FIXME markers were introduced.

## Next Phase Readiness

- **Plan 34-03 is unblocked.** `recalculateFormulas` now has a real JSONB blob to merge into on both create and update, which was the D-01/D-02 precondition.
- **FORMULA-01 holds via the API path** for the mutation layer. Plans 34-06 through 34-10 still own wiring recalculation into these same call sites and applying `stripFormulaKeys`; this plan is persistence only and deliberately added no recalculation calls.
- **One cleanup handoff:** the now-redundant `custom_fields` merge in `src/app/api/v1/organizations/[id]/route.ts:120-130` should be removed by plan 34-07. It is harmless (idempotent) until then.
- **Merge-order note for the orchestrator:** this branch and 34-01's work touch disjoint files, so no conflict is expected. The `tsc`/`npm test` gates for the phase should be re-run after both land.

## Self-Check: PASSED

- All 8 modified files verified present on disk; `git diff --name-only 8bc994c HEAD` lists exactly those 8 and nothing else.
- Both claimed commits verified in `git log`: `b4d1b5d` (test), `a75377b` (fix).
- RED-before-GREEN ordering verified: `b4d1b5d` is the parent of `a75377b`.
- No file deletions in either commit (`git diff --diff-filter=D` empty for both).
- No untracked files left behind (`git status --porcelain -uall` shows 0 `??` entries).

---
*Phase: 34-formula-reactivity*
*Completed: 2026-08-14*
