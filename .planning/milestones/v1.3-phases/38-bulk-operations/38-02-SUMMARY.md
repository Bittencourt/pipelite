---
phase: 38-bulk-operations
plan: 02
subsystem: database
tags: [drizzle, zod, vitest, crm-events, audit-log, tdd]

# Dependency graph
requires:
  - phase: 36-audit-log
    provides: "crmBus → subscribers/audit.ts capture path, buildChanges, and the per-function SC-5 decoupling gate the `update` prefix opts into"
  - phase: 37-trash-restore
    provides: "the isNull(deletedAt) pre-read discipline and the restore/purge carve-out that makes the SC-5 gate per-function rather than per-file"
  - phase: 34-formula-reactivity
    provides: "ENTITY_NATIVE_ATTRIBUTES, which excludes ownerId for all four entities and is why no recalculation is called"
provides:
  - "updateOrganizationOwnerMutation(id, ownerId, userId) — narrow single-field owner transfer"
  - "updatePersonOwnerMutation(id, ownerId, userId) — the same, mirrored"
  - "A pure buildChanges gate proving the owner-reassign emit shape yields a non-empty change map containing ownerId"
affects: [38-11 organizations bulk reassign action, 38-12 people bulk reassign action, 38-03 deals/activities owner mutations, 38-19 source gates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Narrow single-field mutation: pre-read → idempotent short-circuit BEFORE the try → .returning() write → one emit → catch"
    - "The `update{Entity}OwnerMutation` naming convention, chosen so the `update` prefix falls inside Phase 36's EVENT_EMITTING_MUTATION regex for free"
    - "Emit the FULL .returning() row as `data` (never a hand-built partial) because diff.ts skips native keys absent from `data` on updates"

key-files:
  created: []
  modified:
    - src/lib/mutations/organizations.ts
    - src/lib/mutations/organizations.test.ts
    - src/lib/mutations/people.ts
    - src/lib/mutations/people.test.ts
    - src/lib/audit/diff.test.ts

key-decisions:
  - "Two new narrow mutations instead of routing ownerId through the generic update mutations: ownerId is absent from organizationSchema/personSchema and zod strips unknown keys silently, so the generic path writes only updatedAt, emits an empty diff, and the audit subscriber drops the row"
  - "organizationSchema and personSchema were NOT widened with ownerId — doing so would let PATCH /api/v1/{organizations,people}/:id accept owner transfers from any authenticated REST caller (T-38-12)"
  - "The same-owner request short-circuits to { success: true } with no write and no emit (D-15), which is why the reassign picker need not exclude the current owner"
  - "No recalculateFormulas call: ownerId is absent from ENTITY_NATIVE_ATTRIBUTES for both entities, so the call would evaluate nothing and cost a definitions read"
  - "The set() payload is pinned to exactly { ownerId, updatedAt } by test, so a reassign cannot quietly grow into a general-purpose save"

patterns-established:
  - "Narrow single-field mutation shape: the idempotent equality check sits BEFORE the try block, so a no-op cannot reach a write or an emit"
  - "Pure diff.test.ts characterization gate: reproduce a mutation's real emit payload by hand and assert the change map is non-empty, naming the subscriber's drop rule in the assertion message"
  - "Test the absence of a formula recalculation against the REAL (importOriginal) ENTITY_NATIVE_ATTRIBUTES map, so the omission stays justified if the map ever grows"

requirements-completed: [BULK-03]

# Metrics
duration: 13min
completed: 2026-08-17
---

# Phase 38 Plan 02: Owner Reassign Mutations Summary

**Two narrow `update{Entity}OwnerMutation` functions that actually write `ownerId` and emit a full-row `organization.updated` / `person.updated` payload with `changedFields: ["ownerId"]`, replacing a generic-update path that would have silently written nothing — plus a pure `buildChanges` gate proving the change-history row lands.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-08-17T10:44:00Z
- **Completed:** 2026-08-17T10:57:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- `updateOrganizationOwnerMutation(id, ownerId, userId)` and `updatePersonOwnerMutation(id, ownerId, userId)` — the phase's core correctness fix. Both pre-read the live row, short-circuit idempotently on a same-owner request, write `{ ownerId, updatedAt }` via `.returning()`, and emit exactly one `{entity}.updated` event carrying the full post-write row as `data`, the untouched pre-read row as `previous`, and `changedFields: ["ownerId"]`.
- 16 new mutation tests (8 per entity) pinning every branch: the write payload's exact key set, the single emit, the full-row `data` / pre-read `previous` identity, the same-owner no-write/no-emit path, the `"Organization not found"` / `"Person not found"` miss strings, the `isNull(deletedAt)` pre-read predicate, the throw path, and the deliberate absence of a formula recalculation.
- 5 new pure `diff.test.ts` tests reproducing the real emit payload by hand and asserting the change map is **non-empty** and contains `ownerId` — the mechanical proof that `subscribers/audit.ts:63` (`if (payload.action === "updated" && Object.keys(changes).length === 0) return`) cannot drop the row.
- Both new functions are covered by Phase 36's per-function SC-5 gate for free via the `update` prefix, and are asserted uncoupled from the audit layer.
- Neither Zod schema nor either generic update mutation was touched, so the public REST write contract stays un-widened (T-38-12).

## Task Commits

Each task was committed atomically, RED then GREEN:

1. **Task 1: updateOrganizationOwnerMutation** — `344bd53` (test, RED: 8 failing) → `c0c2d4c` (feat, GREEN)
2. **Task 2: updatePersonOwnerMutation** — `7a8205a` (test, RED: 8 failing) → `5cf3082` (feat, GREEN)
3. **Task 3: buildChanges ownerId gate in diff.test.ts** — `035f138` (test)

No REFACTOR commit was needed — both implementations landed at their final shape.

## Files Created/Modified

- `src/lib/mutations/organizations.ts` — +66 lines: `updateOrganizationOwnerMutation`, placed immediately before `deleteOrganizationMutation` so a reader finds it beside `updateOrganizationMutation`. The doc comment records why the generic update path is a silent no-op and why widening the schema is rejected.
- `src/lib/mutations/organizations.test.ts` — +163 lines: `describe("updateOrganizationOwnerMutation")`, 8 tests, reusing the file's existing mock header unchanged.
- `src/lib/mutations/people.ts` — +66 lines: `updatePersonOwnerMutation`, an exact mirror.
- `src/lib/mutations/people.test.ts` — +167 lines: the mirrored describe block, 8 tests.
- `src/lib/audit/diff.test.ts` — +137 lines: an `organizationRow()` helper and `describe("buildChanges - the owner-reassign emit shape (BULK-03)")`, 5 tests. `src/lib/audit/diff.ts` itself is untouched (`git diff --stat` empty) and the file stays db-free (0 `vi.mock` calls, unchanged).

## Decisions Made

- **`.returning()` over a `{ ...row, ownerId }` spread.** `updateDealStageMutation` uses the spread; this plan does not. A real post-write row cannot drift from the table, and the test asserts `data` deep-equals the mocked `.returning()` row with the full native key set, so a narrowing regression fails loudly.
- **The `set()` key set is asserted exhaustively** (`Object.keys(written).sort()` equals `["ownerId", "updatedAt"]`). This was not required by the plan; it exists so a future edit cannot quietly turn a reassign into a general-purpose save.
- **A person-entity case was added to the `diff.test.ts` gate** beyond the four the plan required. `person` is one of the two entities carrying a snake_case key map (`owner_id -> ownerId`), so this pins that the map cannot split one reassign into a `ownerId` + `owner_id` two-entry diff.
- **Task 3 is a characterization gate, not a RED/GREEN cycle.** The plan explicitly forbids modifying `diff.ts`, so the new tests pass on first write by design. Anti-vacuity is structural rather than temporal: the same describe block asserts the map is non-empty for a real reassign AND deep-equals `{}` for a same-owner payload, so the non-empty assertion is proven discriminating rather than merely true.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Symlinked `node_modules` into the worktree**
- **Found during:** Task 1 (first `vitest` invocation)
- **Issue:** `./node_modules/.bin/vitest: No such file or directory` — a fresh git worktree carries no `node_modules`, so no verification command in the plan could run.
- **Fix:** `ln -s /home/pedro/programming/pipelite/node_modules <worktree>/node_modules`. **Zero packages were installed** — this reuses the existing main-checkout install. `/node_modules` is in `.gitignore`, so the symlink is untracked and cannot leak into a commit.
- **Files modified:** none tracked
- **Verification:** `vitest`, `npm run typecheck` and `npm run lint` all run from the worktree root, and `no-mutation-coupling.test.ts` (which resolves `process.cwd()`) correctly scanned the worktree's own `src/lib/mutations/`, not the main checkout's.
- **Committed in:** n/a (untracked)

**2. [Housekeeping] Worktree base correction**
- **Found during:** Startup branch check
- **Issue:** The worktree spawned at `cbf3229` (end of phase 34) rather than the phase-38 base `3e5de7a`, so `.planning/phases/38-bulk-operations/` did not exist and phases 35-37 source was absent.
- **Fix:** `git reset --hard 3e5de7a` — the sanctioned recovery inside the startup `<worktree_branch_check>` step. HEAD was verified on `worktree-agent-a86feaa1cba76a73e` (never a protected ref) before the reset.
- **Verification:** `git rev-parse HEAD` equals `3e5de7a7385e12c23fb97238aac6f5a7bcb5a211`; the phase 38 planning docs and the phase 36/37 audit and trash code are present.

---

**Total deviations:** 2 (1 Rule 3 blocking, 1 startup housekeeping)
**Impact on plan:** Neither touches the delivered code. No scope creep; no packages installed (T-38-SC holds — the phase's install input set stays empty).

## Issues Encountered

None. Both mutations landed on their first GREEN run with no debugging iteration, and no gate collided with an explanatory comment (the Phase 37 failure mode) — `no-mutation-coupling.test.ts` strips comments before matching, and the new doc comments name the audit layer only in prose, never in code.

## Verification Results

| Check | Result |
|-------|--------|
| `vitest run` on the four plan-named suites | 160 passed (organizations 54, people 51, diff 26, no-mutation-coupling 29) |
| `npm test` (full suite) | 1724 passed, 4 skipped, 84 files — exactly the 1703 baseline plus this plan's 21 new tests |
| `npm test` (RSC config) | 8 passed |
| `npm run typecheck` | 0 errors, 0 `@ts-expect-error` added |
| `npm run lint` | 0 errors; 125 pre-existing warnings, **none** in any file this plan touched |
| `grep -c 'export async function updateOrganizationOwnerMutation'` | 1 |
| `grep -c 'export async function updatePersonOwnerMutation'` | 1 |
| recalculation-call count, both mutation modules | 6 → 6 (unchanged; the new functions add none) |
| `git diff --stat src/lib/audit/diff.ts` | empty |
| `grep -c 'vi.mock' src/lib/audit/diff.test.ts` | 0 → 0 (unchanged; the file stays db-free) |

## Threat Model Dispositions

- **T-38-09 (Repudiation) — mitigated.** The narrow mutations exist precisely so a reassign is not a silent unattributed write, and Task 3's gate is the mechanical proof the change-history row lands.
- **T-38-12 (Tampering) — mitigated.** `organizationSchema` and `personSchema` are byte-identical to before; the REST write contract did not widen.
- **T-38-02 (Elevation of Privilege) — transferred as planned.** Neither mutation checks ownership; the doc comment on each says so explicitly and names the server action as the owner of that check. Plans 38-11 and 38-12 must copy each entity's existing predicate verbatim.
- **T-38-SC — accepted.** Zero packages installed.

## Next Phase Readiness

- **Ready for 38-11 and 38-12** (the organizations and people bulk reassign server actions). Both mutations are exported and fully covered; the callers must supply the actor and the per-record authorization predicate.
- **38-03 should mirror these two exactly** for `deals` and `activities`. Two entity-specific cautions carried forward from planning: `updateDealMutation` unconditionally deletes every `deal_assignees` row before deciding what to re-insert (`deals.ts:406`), and it carries an assignee-email side effect — a narrow `updateDealOwnerMutation` avoids both, which is how "no email on bulk reassign" stays true.
- **Not a stub, but not yet reachable:** neither new function has a caller in this commit range. That is the declared wave-1 boundary, not incomplete work — the two consuming plans are 38-11 and 38-12.
- **Note for 38-19's source gates:** the new doc comments discuss the audit layer and the word `ownerId` in prose. Any grep-based gate over these two files must strip comments (as `no-mutation-coupling.test.ts` already does) or it will collide with them.

## User Setup Required

None — no external service configuration, no migration, no environment variable. Both mutations write an existing `owner_id text NOT NULL REFERENCES users(id)` column.

## Self-Check: PASSED

All five modified files exist on disk. All five task commits (`344bd53`, `c0c2d4c`, `7a8205a`, `5cf3082`, `035f138`) are present in `git log` on `worktree-agent-a86feaa1cba76a73e`, based on `3e5de7a`. No `STATE.md` or `ROADMAP.md` write was made — the orchestrator owns those.

---
*Phase: 38-bulk-operations*
*Completed: 2026-08-17*
