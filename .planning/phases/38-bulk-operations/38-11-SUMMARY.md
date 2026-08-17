---
phase: 38-bulk-operations
plan: 11
subsystem: api
tags: [server-actions, authorization, bulk-operations, csv-export, vitest, drizzle]

# Dependency graph
requires:
  - phase: 38-bulk-operations (plan 38-04)
    provides: "ExportFilters.ids and the id-scoped fetch path in src/lib/export/formatters.ts"
  - phase: 38-bulk-operations (plan 38-06)
    provides: "BULK_MAX_IDS, the BulkWriteResult/BulkFailureReason contract, and the delete/owner dispatch maps"
  - phase: 37-trash
    provides: "src/app/trash/actions.test.ts — the only session-swapping test scaffold in the repo"
provides:
  - "bulkDeleteOrganizations(ids) — best-effort per-record soft delete with closed failure codes"
  - "bulkReassignOrganizationOwner(ids, ownerId) — owner transfer with a once-validated approved target"
  - "exportSelectedOrganizations(ids) — non-admin CSV export that cannot express 'no filter'"
  - "The (ids: string[]) scoped-export source gate that plan 38-04 deferred as vacuous in wave 1"
  - "The per-entity bulk action template the People/Deals/Activities plans copy"
affects: [38-12, 38-13, 38-14, 38-15, bulk-action-bar, bulk-failure-report]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runtime id-list narrowing + dedupe before any cap check (parseIdList, mirroring trash/parseRecordId)"
    - "One actor scope around the whole loop; one revalidatePath after it, guarded on at least one success"
    - "Comment-blind declaration-slice source gate with positive anti-vacuity markers asserted first"

key-files:
  created:
    - src/app/organizations/bulk-actions.test.ts
  modified:
    - src/app/organizations/actions.ts

key-decisions:
  - "Organizations' ownership predicate copied verbatim with NO admin bypass; an admin-non-owner test pins the asymmetry"
  - "The scoped export signature is (ids: string[]) and nothing else — every ExportOptions field is a server-side literal"
  - "The export filename count comes from the fetch result, not the submitted id count, so name and rows cannot disagree"
  - "Reassign target validated ONCE before the loop against isNull(deletedAt) AND status = 'approved'"
  - "The delete revalidation count assertion uses a nine-success batch, because a single-success batch cannot detect a per-record revalidation"

patterns-established:
  - "Pattern 1: bulk write action shape — auth, narrow+dedupe, cap, (optional target validation), one actor scope, sequential best-effort loop, one revalidation"
  - "Pattern 2: scoped-export signature gate — ban the admin-gated vocabulary from the declaration slice behind a positive anchor"

requirements-completed: [BULK-02, BULK-03, BULK-04]

# Metrics
duration: 14min
completed: 2026-08-17
---

# Phase 38 Plan 11: Organizations Bulk Actions Summary

**Three Organizations bulk server actions — per-record soft delete, once-validated owner transfer, and an id-only CSV export — plus a 34-test session-swapping suite whose load-bearing assertions are absences, including the admin-no-bypass asymmetry and the scoped-export signature gate that wave 1 deferred.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-08-17T11:39:00Z
- **Completed:** 2026-08-17T11:53:00Z
- **Tasks:** 3
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `bulkDeleteOrganizations` and `bulkReassignOrganizationOwner` refuse unauthenticated, malformed, empty and over-cap calls **before** any read or write, then run a sequential best-effort loop that never breaks and reports each failure as a closed `BulkFailureReason` code.
- `BULK_MAX_IDS` is now **enforced**, not documentation: `ids.length` is checked server-side after dedupe and before the actor scope opens, and the refusal names the cap.
- The reassign target is validated exactly once, before the loop, against **both** `isNull(users.deletedAt)` and `eq(users.status, "approved")` — the defect no per-record failure could ever report, because handing rows to a `rejected` user succeeds.
- `exportSelectedOrganizations` closes the admin-gate bypass (T-38-01): its signature is `(ids: string[])`, every `ExportOptions` field is a server-side literal, and an empty selection is a refusal rather than an unfiltered fetch of all 46,054 organizations.
- 34 tests, 19 of them absence assertions, including the **admin-no-bypass** case and a comment-blind source gate that bans the admin-gated export vocabulary and the transaction/`Promise.all`/`session.user.role`/`updateOrganizationMutation`/`auditLog` tokens from the write slices.
- Both negative directions demonstrated and reverted (messages recorded below).

## Task Commits

Each task was committed atomically:

1. **Task 1: bulkDeleteOrganizations and bulkReassignOrganizationOwner** (tdd)
   - RED: `9b2fe35` — `test(38-11): add failing session-swapping tests for the organizations bulk writes` (20 tests, all failing: `bulkDeleteOrganizations is not a function`)
   - GREEN: `ea40cfd` — `feat(38-11): add bulkDeleteOrganizations and bulkReassignOrganizationOwner` (20/20 pass)
2. **Task 2: exportSelectedOrganizations** (tdd)
   - RED: `89e5026` — `test(38-11): add failing tests for the scoped organizations export` (6 failed / 20 passed)
   - GREEN: `fa32023` — `feat(38-11): add exportSelectedOrganizations, scoped to a capped id list` (26/26 pass)
3. **Task 3: bulk-actions.test.ts source gate** — `71d4ebc` — `test(38-11): add the comment-blind source gate for the three bulk actions` (34/34 pass)

_No REFACTOR commit was needed: neither GREEN step left duplication worth extracting beyond `parseIdList`, which was written shared from the start._

## Files Created/Modified

- `src/app/organizations/actions.ts` (145 → 399 lines) — adds `parseIdList` + `MAX_RECORD_ID_LENGTH`, `bulkDeleteOrganizations`, `bulkReassignOrganizationOwner`, `exportSelectedOrganizations`. `createOrganization`, `updateOrganization` and `deleteOrganization` are **unmodified** — the only diff hunks are the import block (`users`, dispatch, limits, types, formatters) and a pure append after line 145.
- `src/app/organizations/bulk-actions.test.ts` (new, 614 lines) — the session-swapping suite (describes A/B/C) plus the comment-blind source gate (describe D).

## Acceptance Criteria Evidence

**Task 1**

| Criterion | Measured |
|---|---|
| `grep -c 'export async function bulkDeleteOrganizations\|…bulkReassignOrganizationOwner'` | **2** |
| `grep -c 'runWithActor'` pre-task → post-task | **4 → 6** (+2 exactly) |
| `grep -c 'eq(users.status, "approved")'` | **1**, inside the reassign action before its actor scope |
| `grep -c 'BULK_MAX_IDS'` | **5** (≥ 2) |
| `git diff` touches the three existing actions | **No** — hunks are `@@ -5 +5 @@`, `@@ -9,0 +10,3 @@`, `@@ -145,0 +149,193 @@` |

The verbatim predicate, recorded as required — identical string in both bulk actions and in both single-record actions it mirrors:

- `src/app/organizations/actions.ts:234` — `if (organization.ownerId !== session.user.id) {` (bulk delete)
- `src/app/organizations/actions.ts:321` — `if (organization.ownerId !== session.user.id) {` (bulk reassign)
- pre-existing, for comparison: `:88` (`updateOrganization`) and `:135` (`deleteOrganization`) — the same string, confirming organizations' update and delete predicates match, as the plan asked to verify before copying.

**Task 2**

- `grep -c 'export async function exportSelectedOrganizations'` → **1**
- `grep -c 'organizations-selected-'` → **1**
- Exact signature line, `src/app/organizations/actions.ts:367`:
  `export async function exportSelectedOrganizations(ids: string[]): Promise<ExportResult> {`
- The source gate asserts the declaration's parameter list, whitespace-normalised, **is exactly** `ids: string[]` (via `callArguments`), which is stronger than an absence check: it cannot pass by matching nothing.

**Task 3**

| Criterion | Measured |
|---|---|
| suite size | **34 tests** (≥ 28) |
| `grep -c 'not.toHaveBeenCalled'` | **19** (≥ 10) |
| `grep -c 'toHaveBeenCalledTimes(1)'` | **7** (≥ 3) |
| `grep -c 'readStrippedSource'` | **3** (≥ 1) |
| `grep -c 'readFileSync'` | **0** |
| anchor asserted `> -1` before slicing | Yes — `declarationSlice` fails with `declaration anchor not found in actions.ts: …` (WR-13) |

Admin-no-bypass test name, recorded as required:
`bulkDeleteOrganizations > AUTHORIZATION ASYMMETRY: an admin who does not own the row is still refused, with no dispatch`

## Negative Proofs (demonstrated, then reverted)

**1. Admin bypass added to the bulk delete predicate** — `&& session.user.role !== "admin"` appended to `:234`. **2 tests failed:**

```
AssertionError: expected { success: true, …(2) } to deeply equal { success: true, succeeded: [], …(1) }
- "failed": [ { "id": "o1", "reason": "notPermitted" } ]  (expected)
+ "failed": [], "succeeded": [ "o1" ]                      (received)

AssertionError: bulkDeleteOrganizations must not mention session.user.role:
  expected 'export async function bulkDeleteOrgan…' not to contain 'session.user.role'
```

Both the runtime asymmetry case (A.7) and the source gate caught it — a unified predicate cannot land silently from either direction. Reverted; `git diff src/app/organizations/actions.ts` is empty.

**2. `revalidatePath` moved inside the loop** — the call moved into the per-record success branch and removed from after the scope. **2 tests failed:**

```
AssertionError: expected "vi.fn()" to be called 1 times, but got 9 times

AssertionError: bulkDeleteOrganizations revalidation position:
  expected 1256 to be greater than 1403
```

The first is the runtime call-count assertion, the second the source gate's position check. Reverted.

## Verification

- `./node_modules/.bin/vitest run src/app/organizations/bulk-actions.test.ts` — **34 passed**
- `./node_modules/.bin/vitest run src/lib/audit/no-mutation-coupling.test.ts` — **29 passed** (no audit write added)
- `./node_modules/.bin/vitest run` (main project) — **1869 passed / 21 skipped** vs. wave-2 baseline 1835 / 21 → **+34, exactly this plan's suite; no regression**
- `./node_modules/.bin/vitest run --config vitest.rsc.config.ts` — **8 passed** (baseline)
- `npm run typecheck` — **0 errors**, no `@ts-expect-error` added
- `npm run lint` — **0 errors, 125 warnings** (all pre-existing, baseline unchanged)

## Decisions Made

- **No admin bypass, and it is now pinned twice.** Organizations' predicate is the verbatim string from `deleteOrganization`. The asymmetry is enforced at runtime (an admin non-owner gets `notPermitted`) and in source (the gate bans `session.user.role` from both write slices), so unifying the four entity predicates fails loudly instead of shipping a privilege escalation as a bulk feature.
- **`alreadyDeleted` stays unreachable on the delete path.** The per-record read already carries `isNull(organizations.deletedAt)`, so a trashed row collapses to `notFound`. Distinguishing them needs a second read per id (38-RESEARCH A6), and the collapse must go in this direction: labelling a permission failure "Already in Trash" is a worse lie.
- **`parseIdList` dedupes as well as narrows**, so the cap counts DISTINCT ids and a client that submits the same row twice is not charged for it twice.
- **The filename is rewritten in the action, not in `fetchFilteredData`.** That keeps a widely shared function untouched while still generating the name server-side, and the count comes from `result.count` so a row trashed between list render and submit cannot make the name lie.
- **The export gate asserts an exact parameter list, not just absences.** Plan 38-04 deferred this gate precisely because a wave-1 version would have matched zero functions; asserting `callArguments(...)[0] === "ids: string[]"` is anti-vacuous by construction — it fails if the declaration is missing, renamed, or grows a second parameter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] The delete revalidation count assertion could not detect a per-record revalidation**

- **Found during:** Task 3 (negative proof 2)
- **Issue:** The plan's case A.11 used a 2-id batch with **one** success. With `revalidatePath` moved inside the loop, one success still produces exactly one call, so `toHaveBeenCalledTimes(1)` passed on the defective implementation — the assertion was vacuous for the very defect it exists to catch. Only the source gate's position check failed.
- **Fix:** Raised A.11's partial-success case to the 12-id mixed batch (9 successes). The count assertion now fails with `expected "vi.fn()" to be called 1 times, but got 9 times`, so the runtime and source directions each detect the defect independently.
- **Files modified:** `src/app/organizations/bulk-actions.test.ts`
- **Verification:** Negative proof 2 above — 2 failures instead of 1; both revert clean.
- **Committed in:** `71d4ebc` (Task 3 commit)

**2. [Rule 1 - Bug] Gate/comment collision on the unstripped-read helper name (the twelfth occurrence in phases 37-38)**

- **Found during:** Task 3
- **Issue:** The plan requires `grep -c 'readFileSync' src/app/organizations/bulk-actions.test.ts` to be **0**. My gate header explained the comment-blind rule by naming that helper in prose, so the count was 1 — the file failed its own acceptance criterion on a comment, not on code.
- **Fix:** Reworded the header to "never through a raw file read" and added a sentence recording that the comment moved and the gate did not. **The gate was not weakened.**
- **Files modified:** `src/app/organizations/bulk-actions.test.ts`
- **Verification:** `grep -c 'readFileSync' …` → 0; `grep -c 'readStrippedSource' …` → 3; suite still 34/34.
- **Committed in:** `71d4ebc` (Task 3 commit)

**3. [Rule 2 - Missing Critical] Added a write-slice distinctness assertion to the source gate**

- **Found during:** Task 3
- **Issue:** `declarationSlice` bounds on the next top-level `export `. If a future edit removed one bulk declaration or inserted a non-exported helper between them, one slice could silently widen to cover both write actions — and every "exactly one actor scope / exactly one revalidation" assertion in the gate would then be measuring the wrong text.
- **Fix:** The positive-marker test additionally asserts the delete slice does **not** contain `updateRecordOwnerByType` and the reassign slice does **not** contain `deleteRecordByType`, so a widened slice fails immediately.
- **Files modified:** `src/app/organizations/bulk-actions.test.ts`
- **Verification:** 34/34 pass; the assertion is in `sliced three real declarations, not empty strings`.
- **Committed in:** `71d4ebc` (Task 3 commit)

**4. [Rule 3 - Blocking] Worktree base was stale**

- **Found during:** Startup
- **Issue:** Claude Code's `isolation="worktree"` forked from `cbf3229` instead of the wave-3 base `80d6474`, so `src/lib/bulk/dispatch.ts` and the plan's dependencies were absent.
- **Fix:** `git reset --hard 80d647468194db5920cf426c2d71196be4b9224f` per the prompt's verbatim check, then symlinked the main checkout's `node_modules`. No package was installed.
- **Files modified:** none (worktree state only)
- **Verification:** `src/lib/bulk/dispatch.ts` present; `updateOrganizationOwnerMutation` present at `src/lib/mutations/organizations.ts:363`.
- **Committed in:** n/a

---

**Total deviations:** 4 auto-fixed (2 missing critical, 1 bug, 1 blocking)
**Impact on plan:** All four strengthen the gates the plan asked for rather than widening scope. Deviations 1 and 3 close two ways the plan's own assertions could have passed vacuously; deviation 2 is the documented reword-the-comment resolution. No new packages, no schema change, no UI change.

## Issues Encountered

- **`mockResolvedValueOnce` sequencing over a drizzle `where` object.** The per-record read is `findFirst({ where: and(eq(...), isNull(...)) })`, and the `where` value is a SQL chunk tree, not inspectable data — a mock cannot dispatch on the id. Resolved by relying on the loop's guaranteed sequential order: rows are queued with `mockResolvedValueOnce` in id order, which is exact and also implicitly asserts the loop is sequential (a `Promise.all` version would still consume the queue in order but the source gate bans it independently).
- **Vitest 4 mock-state reset.** `vi.clearAllMocks()` alone is ambiguous about queued once-implementations across versions, so `beforeEach` calls `mockReset()` explicitly on every mock that receives `…Once` values and then re-establishes each default, including the `runWithActor` passthrough.

## Known Stubs

None. All three actions are fully wired; the client surface that calls them is plan 38-15's scope, as designed.

## Threat Flags

None — no security-relevant surface outside the plan's `<threat_model>` was introduced. All of T-38-01, T-38-02, T-38-03, T-38-04, T-38-06, T-38-07, T-38-09 and T-38-34 have a passing assertion in `bulk-actions.test.ts`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The three exports match the interfaces plan 38-15 expects, so the bulk action bar can wire Organizations without further server work.
- Plans 38-12/13/14 (People, Deals, Activities) can copy `bulk-actions.test.ts` and the action skeleton directly. **Two things must change per entity:** the predicate string (`person.ownerId`/`activity.ownerId` with no bypass; **deals keeps `&& session.user.role !== "admin"`**, so the Deals suite's asymmetry test must assert the OPPOSITE outcome and its source gate must NOT ban `session.user.role`), and the `entityType` literal passed to the dispatch functions and the export options.
- The export filename slug is the English plural from `formatters.ts`'s own mapping: `people`, `deals`, `activities` — never translated.

## Self-Check: PASSED

- `src/app/organizations/actions.ts` — FOUND
- `src/app/organizations/bulk-actions.test.ts` — FOUND
- `.planning/phases/38-bulk-operations/38-11-SUMMARY.md` — FOUND
- Commits `9b2fe35`, `ea40cfd`, `89e5026`, `fa32023`, `71d4ebc`, `c439bb8` — all FOUND in `git log`
- `git diff --diff-filter=D HEAD~6 HEAD` — no file deletions
- `git status --short` — clean; STATE.md and ROADMAP.md untouched (orchestrator owns those)

---
*Phase: 38-bulk-operations*
*Completed: 2026-08-17*
