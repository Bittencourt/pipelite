---
phase: 38-bulk-operations
plan: 14
subsystem: api
tags: [server-actions, authorization, bulk-operations, csv-export, vitest, drizzle]

# Dependency graph
requires:
  - phase: 38-bulk-operations (plan 38-03)
    provides: updateActivityOwnerMutation — the narrow owner-only write that emits a real diff
  - phase: 38-bulk-operations (plan 38-04)
    provides: ExportFilters.ids and fetchActivities' inArray branch
  - phase: 38-bulk-operations (plan 38-06)
    provides: BULK_MAX_IDS, the closed BulkWriteResult/BulkFailureReason vocabulary, and the
      deleteRecordByType / updateRecordOwnerByType dispatch maps
  - phase: 36-audit-log
    provides: runWithActor and the actor-scope-after-session-check rule (T-36-02)
provides:
  - bulkDeleteActivities(ids) — best-effort per-record soft delete with per-id failure codes
  - bulkReassignActivityOwner(ids, ownerId) — owner-only transfer, target validated once
  - exportSelectedActivities(ids) — selection-scoped CSV whose signature admits nothing else
  - src/app/activities/bulk-actions.test.ts — 45-case session-swapping suite plus a
    comment-blind source gate over the three declarations
affects: [38-17 bulk action bar wiring, 38-bulk-operations verification, activities UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bulk server action: session check -> runtime id narrowing + dedupe -> cap -> (target
      validation) -> ONE actor scope around a sequential loop -> ONE revalidatePath after it"
    - "Per-record authorization stays in the server action, verbatim per entity, never unified into
      the dispatch map"
    - "Scoped export takes ids and nothing else; ExportOptions is built server-side from literals"
    - "Anti-vacuity discipline: declaration slicer asserts its anchor > -1 and each slice shorter
      than the module; call-count assertions use a 12-id / 9-success batch"

key-files:
  created:
    - src/app/activities/bulk-actions.test.ts
  modified:
    - src/app/activities/actions.ts

key-decisions:
  - "Activities' predicate copied verbatim with NO admin bypass; an admin-non-owner test is the
    standing proof that a future unification of the four per-entity predicates breaks"
  - "The reassign target is narrowed at runtime and validated once against isNull(deletedAt) AND
    status = 'approved'; activities/page.tsx's deletedAt-only owner picker was neither copied nor
    modified"
  - "parseBulkIds dedupes BEFORE the cap check, so the same id twice cannot consume two of the
    caller's hundred, and refuses a malformed payload wholesale rather than silently dropping entries"
  - "Test fixture uses vi.resetAllMocks, not clearAllMocks: mockResolvedValueOnce queues survive
    mockClear and shifted a later ownership assertion onto the wrong row"
  - "Call-count assertions raised to a 12-id / 9-success batch after the 38-11 finding that a small
    batch makes 'wrapped once around the loop' indistinguishable from 'once per record'"

patterns-established:
  - "Negative-proof discipline: each authorization guarantee has a documented mutation that breaks a
    named test, demonstrated and reverted during execution"
  - "Export-signature gate is anti-vacuous by construction — the parameter list must normalise to
    exactly `ids: string[]`, so a second parameter nobody thought to ban still fails"

requirements-completed: [BULK-02, BULK-03, BULK-04]

# Metrics
duration: 22min
completed: 2026-08-17
---

# Phase 38 Plan 14: Activities Bulk Actions Summary

**Three Activities bulk server actions — best-effort delete, owner-only reassign, and a
selection-scoped CSV export whose signature cannot express "no filter" — with a 45-case
session-swapping suite whose central assertions are absences and whose source gate proves the
out-of-scope assignee column is never read as an authorization subject nor written as a payload.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-08-17T11:41:00Z
- **Completed:** 2026-08-17T12:03:00Z
- **Tasks:** 3 (5 commits — TDD RED/GREEN gates on tasks 1 and 2)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `bulkDeleteActivities` and `bulkReassignActivityOwner` refuse unauthenticated, malformed,
  empty, over-cap and invalid-target calls **before any actor scope opens and before any write**,
  each refusal proven by an absence assertion rather than only by its return value.
- Activities' ownership predicate is copied **verbatim** from `deleteActivity`
  (`src/app/activities/actions.ts:136`) into both bulk actions with **no admin clause**. An
  admin-caller test and a source assertion both fail if anyone adds one.
- The reassign writes the owner column only. Two independent gates prove the second user-valued
  column is untouched: a runtime assertion that every dispatch call is exactly four scalar
  arguments, and a comment-stripped source gate over the precisely-anchored declaration slices.
- `exportSelectedActivities(ids)` takes ids and nothing else. Its `ExportOptions` is built
  server-side from literals with no date window, asserted by a `toStrictEqual` deep-equal plus an
  `Object.keys(filters)` check, so an explicitly-`undefined` date key would still fail.
- Three negative proofs demonstrated and reverted, with one finding that corrects the plan's own
  expectation (see Deviations #4).

## Task Commits

1. **Task 1: bulk write actions — RED** — `a2ca530` (test)
2. **Task 1: bulk write actions — GREEN** — `141455e` (feat)
3. **Task 2: exportSelectedActivities — RED** — `17970cc` (test)
4. **Task 2: exportSelectedActivities — GREEN** — `64e5edc` (feat)
5. **Task 3: source gate + anti-vacuity hardening** — `dd2237a` (test)

## Files Created/Modified

- `src/app/activities/actions.ts` — adds `parseBulkIds` (runtime payload narrowing, 64-char
  ceiling, dedupe), `bulkDeleteActivities`, `bulkReassignActivityOwner`, `exportSelectedActivities`.
  The eight pre-existing exports are byte-identical; the only changed pre-existing line is the
  schema import, which gained `users`.
- `src/app/activities/bulk-actions.test.ts` — 45 tests: 14 delete cases, 15 reassign cases, 8
  export cases, 8 source-gate cases.

## Recorded Facts (acceptance evidence)

| Fact | Value |
|---|---|
| `grep -c 'runWithActor'` in `actions.ts`, before -> after | **5 -> 7** (exactly +2) |
| Verbatim predicate, delete action | `      if (activity.ownerId !== session.user.id) {` (line 252) |
| Verbatim predicate, reassign action | `      if (activity.ownerId !== session.user.id) {` (line 359) |
| Pre-existing sites it was copied from | lines 89, 136, 470 (`updateActivity`, `deleteActivity`, `toggleActivityCompletion`) |
| `revalidatePath` argument, all three pre-existing and both new call sites | `"/activities"` |
| Export signature line | `export async function exportSelectedActivities(ids: string[]): Promise<ExportResult> {` |
| `grep -c 'BULK_MAX_IDS'` | 5 (≥ 2) |
| `grep -c 'eq(users.status, "approved")'` | 1, inside the reassign action before its actor scope |
| `grep -c 'not.toHaveBeenCalled'` in the suite | 31 (≥ 11) |
| `grep -c 'readStrippedSource'` / `readFileSync` | 2 / 0 |
| `git status --porcelain src/app/activities/page.tsx` | empty |
| Admin-no-bypass test (A.7) | `A.7 refuses an ADMIN caller on a record owned by someone else — activities have no admin bypass` |
| Assignee-is-not-owner test (A.8) | `A.8 refuses a record the caller is only the second-column subject of, not the owner` |
| Assignee-boundary argument-shape test (B.9) | `B.9 smuggles no out-of-scope payload: every dispatch call is exactly four scalars` |

## Verification

| Check | Result |
|---|---|
| `vitest run src/app/activities/bulk-actions.test.ts` | **45 passed** |
| `vitest run src/lib/audit/no-mutation-coupling.test.ts` | 29 passed (no audit write added) |
| `npm test` (main project) | **1880 passed / 21 skipped** (baseline 1835 + 45 new) |
| `npm test` (rsc project) | 8 passed (baseline) |
| `npm run typecheck` | **0 errors**, no `@ts-expect-error` added |
| `npm run lint` | **0 errors**, 125 warnings (baseline exactly — no new warnings) |

### Negative proofs (demonstrated, then reverted)

**Proof 1 — predicate reads the out-of-scope column instead of the owner** (`row.assigneeId !==`):
7 tests failed. The discriminating ones:
- `A.8 …only the second-column subject of, not the owner` —
  `AssertionError: expected { success: true, …(2) } to deeply equal { success: true, succeeded: [], …(1) }`
- `D.4 neither write slice touches the out-of-scope column or an escape hatch` —
  `AssertionError: bulkDeleteActivities must not mention assigneeId`
- `D.6 … predicate, verbatim and without an admin clause` —
  `AssertionError: expected 'export async function bulkDeleteActiv…' to contain 'if (activity.ownerId !== session.user…'`

**Proof 2 — `&& session.user.role !== "admin"` added to the delete predicate**: 3 tests failed.
- `A.7 refuses an ADMIN caller …` —
  `AssertionError: expected { success: true, …(2) } to deeply equal { success: true, succeeded: [], …(1) }`
- `D.4 …` — `AssertionError: bulkDeleteActivities must not mention session.user.role`
- `D.6 …` — same verbatim-predicate failure as above.

**Proof 3 — `revalidatePath` moved inside the loop**: 2 tests failed.
- `A.12a revalidates exactly ONCE after a partially successful loop` —
  `AssertionError: expected "vi.fn()" to be called 1 times, but got 9 times`
- `D.5 each write slice has exactly one actor scope and exactly one revalidation, after the loop` —
  `AssertionError: expected 1227 to be greater than 1338`

## Decisions Made

- **`no_selection` for a malformed payload, `invalid_owner` for a malformed target.** A garbage id
  array means the selection never arrived; a garbage owner id means the selection was fine and the
  destination was not. Collapsing both into one code would tell the bar to blame the wrong thing.
- **Dedupe before the cap check.** `BULK_MAX_IDS` counts distinct records, so a duplicated id
  cannot consume two of the caller's hundred and cannot be dispatched twice.
- **`alreadyDeleted` left unreachable on both write paths.** Both per-record reads carry
  `isNull(activities.deletedAt)`, so a trashed record is reported `notFound`; distinguishing them
  would cost a second query per id purely for a nicer label (38-RESEARCH A6). Documented in the
  action's own comment.
- **Comments in `actions.ts` avoid spelling the banned identifiers at all**, describing them as
  "the second user-valued column D-11 scopes out" instead. The gate is comment-blind so prose could
  not trip it, but this keeps a future raw-source variant of the gate safe too — the twelfth
  potential comment/grep collision, avoided by construction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test fixture leaked `mockResolvedValueOnce` queues between tests**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** The scaffold copied from `src/app/trash/actions.test.ts` uses `vi.clearAllMocks()`.
  `mockClear` empties `mock.calls` but leaves queued `mockResolvedValueOnce` values in place. The
  reassign refusal cases (B.2–B.4) queue a row that is never consumed because the action returns
  before its loop, so three leftover owned rows accumulated and shifted B.5's queue by one — B.5
  then read an OWNED row and "succeeded" on a case that must be refused. A leaking queue makes a
  later negative assertion test the wrong row: exactly the silent self-invalidation class this file
  exists to prevent.
- **Fix:** `vi.resetAllMocks()` with all defaults re-established in `beforeEach`, plus a comment
  recording why `clearAllMocks` is wrong here.
- **Files modified:** `src/app/activities/bulk-actions.test.ts`
- **Verification:** B.5 and B.6 went from failing-for-the-wrong-reason to passing; full suite green.
- **Committed in:** `141455e`

**2. [Rule 2 - Missing Critical] Runtime narrowing of the reassign target id**
- **Found during:** Task 1
- **Issue:** The plan narrows `ids` (correctly, because a server action is a POST endpoint) but
  leaves `ownerId: string` as an unchecked annotation on the same endpoint. A non-string or
  megabyte-long value would flow into `eq(users.id, ownerId)`.
- **Fix:** The same shape test `parseBulkIds` applies, mapped to `invalid_owner` (not
  `no_selection`), placed before the target lookup. Covered by test `B.4c`.
- **Files modified:** `src/app/activities/actions.ts`
- **Verification:** `B.4c refuses a malformed target id as invalid_owner`; no dispatch, no lookup.
- **Committed in:** `141455e`

**3. [Coordinator directive] Anti-vacuity hardening carried over from plan 38-11**
- **Found during:** Task 3
- **Issue:** The plan specifies the `revalidatePath`-once and `runWithActor`-once assertions without
  fixing a batch size. Plan 38-11 found that with a small batch the two shapes are indistinguishable.
- **Fix:** A.11, A.12a and B.7 raised to 12 ids / 9 successes; `revalidatePath` argument now asserted
  as well; D.3 rewritten to pin the export parameter list to exactly `ids: string[]` **by
  construction** rather than relying on the token ban alone.
- **Files modified:** `src/app/activities/bulk-actions.test.ts`
- **Verification:** Proof 3 now fails with `called 1 times, but got 9 times` — unmistakable rather
  than the marginal `2 vs 1` a three-id batch would have produced.
- **Committed in:** `dd2237a`

**4. [Finding — plan expectation corrected] Negative proof 1 cannot fail case A.6**
- **Found during:** Task 3 (negative proof 1)
- **Issue:** The plan's acceptance criterion says swapping the predicate to the assignee column
  should make "cases A.6/A.8 FAIL". A.6's row is owned by someone else **and** assigned to nobody,
  so it is refused under either column — it cannot discriminate between them, by construction.
- **Outcome:** A.8 (owned by another user, assigned to the caller) is the only case that can, and it
  did fail, together with the D.4 and D.6 source gates. No code change: the suite already contains
  the discriminating case the criterion was reaching for. Recorded here so a verifier reading the
  criterion literally does not conclude the proof was under-run.

**5. [Sequencing] The test file was created across all three tasks, not solely in Task 3**
- Task 1's own `<action>` instructs writing the delete and reassign describes before implementing,
  so the file was created in Task 1's RED commit, extended in Task 2's RED commit, and completed
  with the source gate in Task 3. Net content matches the plan's Task 3 specification.

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 coordinator directive), plus 1
recorded finding and 1 sequencing note.
**Impact on plan:** No scope creep. Deviation #1 was load-bearing — without it an authorization
test passed on a row it was not meant to be testing.

## Issues Encountered

- Task 1's `npm run typecheck` initially failed on a forward reference: the RED suite imported
  `exportSelectedActivities`, which Task 2 had not yet created. Resolved by scoping Task 1's RED
  commit to the delete and reassign describes and adding the export import in Task 2's RED commit,
  which keeps each task's own verification gate (vitest + typecheck + lint) genuinely green.

## Known Stubs

None. All three actions are fully wired to real dispatch and export layers; no placeholder values,
no empty-collection returns, no TODOs.

## Threat Flags

None. No new endpoint, auth path, file access pattern or schema change was introduced — the three
actions route through the existing dispatch maps and export formatter, and the threat register's
`mitigate` dispositions (T-38-01, -02, -03, -04, -06, -07, -09, -13, -34, -35) are each carried by a
named test or source assertion in `bulk-actions.test.ts`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 38-17 can wire the bar: the three exports are stable and match the documented signatures
  (`bulkDeleteActivities(ids)`, `bulkReassignActivityOwner(ids, ownerId)`,
  `exportSelectedActivities(ids)`), all returning the shared `BulkWriteResult` / `ExportResult`
  shapes.
- The client must render `BulkFailureReason` codes through `bulk.reason.*`; the server never returns
  a display string and never returns record labels (`BulkOutcome.labelById` stays client-captured).
- No blockers. `assigneeId` reassignment remains deferred (D-11) and is now gated against, so a
  future phase that wants it must remove a named assertion rather than quietly widen the payload.

## Self-Check: PASSED

- Files claimed created/modified: all present on disk
  (`src/app/activities/actions.ts`, `src/app/activities/bulk-actions.test.ts`,
  `.planning/phases/38-bulk-operations/38-14-SUMMARY.md`).
- Commits claimed: all five present in `git log`
  (`a2ca530`, `141455e`, `17970cc`, `64e5edc`, `dd2237a`), each on
  `worktree-agent-aca5890fec72be632` and based on `80d6474`.
- No commit deleted a tracked file (`git diff --diff-filter=D` empty across the range).
- STATE.md and ROADMAP.md untouched, as required for a parallel worktree executor.

---
*Phase: 38-bulk-operations*
*Completed: 2026-08-17*
