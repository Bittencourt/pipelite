---
phase: 38-bulk-operations
plan: 13
subsystem: api
tags: [server-actions, authorization, admin-bypass, csv-export, vitest, source-gate]

# Dependency graph
requires:
  - phase: 38-04
    provides: "ExportFilters.ids and the fetchFilteredData id-scoped read"
  - phase: 38-06
    provides: "BULK_MAX_IDS, the closed Bulk* type vocabulary, deleteRecordByType / updateRecordOwnerByType"
  - phase: 38-03
    provides: "updateDealOwnerMutation — the only owner-write path that leaves deal_assignees intact"
provides:
  - "bulkDeleteDeals(ids) — sequential best-effort soft delete with per-record authorization"
  - "bulkReassignDealOwner(ids, ownerId) — owner transfer with a once-per-call target validation and NO notification"
  - "exportSelectedDeals(ids) — non-admin scoped CSV export whose signature admits only ids"
  - "src/app/deals/bulk-actions.test.ts — 46 tests, including both directions of deals' admin bypass"
affects: [38-18, 38-14, 38-15, 38-16, bulk-action-bar, deals]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bulk server action: session check -> runtime id narrowing -> dedupe -> cap -> ONE runWithActor around the whole loop -> per-record read + verbatim ownership predicate + dispatch -> one revalidatePath"
    - "Scoped export as a narrow signature: (ids: string[]) only, ExportOptions built from server-side literals"
    - "Comment-stripped declaration-slice source gate with a WR-13 anchor assertion and positive markers asserted before absences"

key-files:
  created:
    - src/app/deals/bulk-actions.test.ts
  modified:
    - src/app/deals/actions.ts

key-decisions:
  - "Deals' predicate copied verbatim INCLUDING `&& session.user.role !== \"admin\"` — the count in deals/actions.ts went 4 -> 6, exactly +2, and both runtime directions are asserted"
  - "Reassign routes through updateRecordOwnerByType -> updateDealOwnerMutation; updateDealMutation is never imported into a bulk path because its .partial() schema clears every deal_assignees row"
  - "No email on any bulk path: two runtime absence assertions plus a source assertion, no suppression flag needed"
  - "Reassign target validated ONCE before the loop against isNull(users.deletedAt) AND eq(users.status, \"approved\"); deals/page.tsx:159-163 (deletedAt only) deliberately not copied and not touched"
  - "exportSelectedDeals takes ids and nothing else; no stage filter is passed even though ExportFilters has one"
  - "A shared parseBulkIds narrows the ids argument at runtime and doubles as the reassign target's narrower, since a server action is a POST endpoint"

patterns-established:
  - "Admin-bypass asymmetry is asserted from BOTH sides in the entity that has it, and the sibling suites assert the opposite"
  - "A revalidatePath call-count assertion must use an N-SUCCESS case: a 1-success run cannot distinguish 'after the loop' from 'inside it'"
  - "A signature gate is anti-vacuous BY CONSTRUCTION when the parameter list is extracted and compared for equality; a banned-token list alone cannot notice a renamed, removed or widened declaration"

requirements-completed: [BULK-02, BULK-03, BULK-04]

# Metrics
duration: 22min
completed: 2026-08-17
---

# Phase 38 Plan 13: Deals Bulk Actions Summary

**Three Deals bulk server actions — sequential best-effort delete, owner reassign through the assignee-preserving owner mutation, and an ids-only scoped CSV export — plus a 48-test session-swapping suite that pins deals' unique admin bypass from both directions and proves the no-email guarantee at runtime.**

## Performance

- **Duration:** ~28 min
- **Started:** 2026-08-17T14:34:00Z
- **Completed:** 2026-08-17T15:02:00Z
- **Tasks:** 3
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `bulkDeleteDeals` and `bulkReassignDealOwner` refuse unauthenticated, malformed, empty and over-cap calls **before any actor scope opens and before any read**, then run a sequential best-effort loop that continues past every per-record failure and reports closed reason codes only.
- **Deals' admin bypass is pinned from both sides.** `grep -c 'session.user.role !== "admin"' src/app/deals/actions.ts` went from **4 to 6** — exactly +2, one per new bulk write. An admin succeeds on a deal owned by someone else; a non-admin non-owner is refused with `notPermitted` and the dispatch is never called.
- The owner transfer routes through `updateRecordOwnerByType` -> `updateDealOwnerMutation`. `updateDealMutation` is never reachable from a bulk path, so no `deal_assignees` join row is destroyed and no `newAssigneeUserIds` list exists to notify from.
- `exportSelectedDeals(ids: string[])` builds the whole `ExportOptions` from server-side literals with **no `stage` filter**, and returns an untranslated `deals-selected-<count>-<date>.csv` whose count comes from the fetch result.
- Three negative proofs demonstrated and reverted, so every headline assertion is proven load-bearing rather than incidentally passing.

## Task Commits

1. **Task 1: bulkDeleteDeals and bulkReassignDealOwner** — `e0106e9` (test, RED) then `58cfc2d` (feat, GREEN)
2. **Task 2: exportSelectedDeals** — `fe682f1` (test, RED) then `8e64748` (feat, GREEN)
3. **Task 3: bulk-actions.test.ts source gate + negative proofs** — `9f90bed` (test)
4. **Cross-plan hardening** (mid-flight finding from plan 38-11) — `e0a8b68` (test)

RED was verified as genuinely red both times: 29 failures at `e0106e9` (`bulkDeleteDeals is not a function`), 8 further failures at `fe682f1`. No `refactor` commit was needed.

## Files Created/Modified

- `src/app/deals/actions.ts` — +253 lines, **purely additive** (`git diff` shows zero deleted lines, so `createDeal`, `updateDeal`, `deleteDeal`, `updateDealStage` and `reorderDeals` are provably unmodified). Adds `parseBulkIds` plus the three bulk actions, placed immediately after `deleteDeal` so each bulk predicate sits beside the single-record predicate it mirrors.
- `src/app/deals/bulk-actions.test.ts` — new, 48 tests: 17 on `bulkDeleteDeals`, 13 on `bulkReassignDealOwner`, 7 on `exportSelectedDeals`, 11 in the comment-stripped source gate. 28 `not.toHaveBeenCalled` assertions.
- `src/app/deals/page.tsx` — **untouched** (`git status --porcelain` empty), as the plan requires: its owner picker filters on `deletedAt` alone and is an anti-analog, not a fix target for this plan.

## Recorded Values (plan acceptance criteria)

**Admin clause count:** pre-task **4** (`deals/actions.ts:83, 155, 191, 228`) -> post-task **6** (adds `:253` in `bulkDeleteDeals`, `:346` in `bulkReassignDealOwner`). Each bulk write slice contains it **exactly once**, asserted positively by the source gate.

**Export signature line, verbatim (`src/app/deals/actions.ts:389`):**
```ts
export async function exportSelectedDeals(ids: string[]): Promise<ExportResult> {
```
No `format`, no `filters`, no `entityType`, no `includeCustomFields`, no options object, no object argument. The gate **extracts the parameter list and compares it for equality against `ids: string[]`** — anti-vacuous by construction, so a renamed, removed, widened or extra-parameter declaration fails it — and additionally forbids the tokens `ExportFilters`, `ExportOptions`, `ExportFormat`, `pipedrive`, `getExportData`, `role` and `stage` inside that slice as a second line of defence. The anti-vacuity anchor plan 38-04 deferred to this plan now matches a real function.

**Admin-bypass-PRESENT test names:**
- A.7 — `bulkDeleteDeals > ADMIN BYPASS PRESENT: an admin deletes a deal owned by someone else, and the dispatch runs`
- A.10 — `bulkDeleteDeals > the SAME 12 ids for an ADMIN: 12 succeeded, 0 failed — the asymmetry, in one place`
- B.6 — `bulkReassignDealOwner > ADMIN BYPASS PRESENT: an admin reassigns a deal owned by someone else`

**No-email absence assertions:** A.13 `sends NO email, even after a fully successful 12-id delete (D-13)` and B.10 `sends NO email, even after a fully successful 12-id reassign — the runtime half of D-13`.

**Other greps:** `BULK_MAX_IDS` 5 occurrences (>=2 required); `eq(users.status, "approved")` exactly 1, inside the reassign action and asserted to precede its `runWithActor`; `deals-selected-` exactly 1; `readStrippedSource` 2; `readFileSync` **0**.

## Negative Proofs (all three demonstrated, then reverted)

**Proof 1 — remove `&& session.user.role !== "admin"` from `bulkDeleteDeals`' predicate.** 3 tests went red:
- `ADMIN BYPASS PRESENT: an admin deletes a deal owned by someone else, and the dispatch runs` — `AssertionError: expected { success: true, succeeded: [], …(1) } to deeply equal { success: true, …(2) }`
- `the SAME 12 ids for an ADMIN: 12 succeeded, 0 failed` — `AssertionError: expected [] to have a length of 12 but got +0`
- source gate — `AssertionError: bulkDeleteDeals must carry deals' admin clause exactly once: expected +0 to be 1`

**Proof 2 — swap the reassign dispatch to `updateDealMutation(id, { ownerId: targetId }, session.user.id)`.** 7 tests went red, the source gate naming the function explicitly:
- `bulkReassignDealOwner must not reference updateDealMutation: expected 'export async function bulkReassignDea…' not to contain 'updateDealMutation'`
- plus the six runtime cases that assert `updateRecordOwnerByType` ran (e.g. `expected "vi.fn()" to be called with arguments: [ 'deal', 'd1', 'u9', 'u1' ]`).

**Proof 3 — move `revalidatePath("/deals")` inside the loop.** The structural half of the gate went red immediately:
- `bulkDeleteDeals must revalidate AFTER the loop callback returns, never inside the loop: expected 1183 to be greater than 1307`

This proof also surfaced a real weakness in the runtime half, which was fixed rather than accepted — see Deviations. After the fix, proof 3 was re-run and the runtime assertion fails too, with the message the 38-11 finding predicted:
- `revalidates once after a partially successful call, and not at all when nothing succeeded` — `AssertionError: expected "vi.fn()" to be called 1 times, but got 9 times`

**Proof 4 — grow the export declaration to `(ids: string[], includeArchived?: boolean)`.** The by-construction signature gate went red, which no banned-token list would have caught:
- `exportSelectedDeals must take a single ids parameter […]: expected 'ids: string[], includeArchived?: bool…' to be 'ids: string[]'`

## Decisions Made

- **`parseBulkIds` is shared by all three actions and also narrows the reassign target** (`parseBulkIds([ownerId])?.[0]`), so a hostile `ownerId` never reaches `eq(users.id, …)` and never triggers a query. A malformed argument maps to `no_selection` for the writes and `No records selected` for the export, matching the plan's stated mapping.
- **The `alreadyDeleted` reason stays unreachable on both paths**, as designed: the per-record read carries `isNull(deals.deletedAt)`, so a trashed record answers `undefined` and is reported `notFound`. Documented at the call site rather than left to be rediscovered.
- **The source gate proves its own stripping without `readFileSync`** (banned by the plan's acceptance criteria): it asserts a comment-only sentinel (`T-38-01`, present once in the raw file) is absent from the stripped text, asserts no `/**` opener survives, and unit-tests `stripComments` on a literal. Three independent ways for the gate to notice it has stopped being comment-blind.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Strengthened the `revalidatePath` call-count assertion to an N-success case**

- **Found during:** Task 3 (negative proof 3), independently confirmed by the coordinator's mid-flight finding from plan 38-11
- **Issue:** The plan's case A.12 specifies "`revalidatePath` called once for a partially successful call". As written, that partial case had exactly **one** succeeding id, so moving `revalidatePath` inside the loop still produced exactly one call and **the runtime assertion passed**. The plan explicitly requires proof 3 to make "the call-count assertion FAIL"; only the structural source gate was catching it, leaving the runtime guarantee unproven.
- **Fix:** Added a **9-of-12 success** scenario (the batch shape the 38-11 finding prescribes) plus a 12-of-12 scenario to the same test, with a comment stating why a 1-success run cannot distinguish the two placements. Re-ran proof 3: the runtime assertion now fails with `expected "vi.fn()" to be called 1 times, but got 9 times`, alongside the source gate.
- **Files modified:** `src/app/deals/bulk-actions.test.ts`
- **Verification:** Proof 3 red on both the runtime and structural assertions; reverted; suite green at 48 tests.
- **Committed in:** `9f90bed` (Task 3), hardened in `e0a8b68`

**1b. [Rule 2 - Missing Critical] Three further hardenings from the 38-11 cross-plan finding**

- **Found during:** post-Task-3, on the coordinator's mid-flight message
- **Issue:** Three gates were weaker than they read. (a) The export signature was checked by regex plus a banned-token list, neither of which notices a renamed or removed declaration in a way that says so. (b) Nothing asserted the cap is evaluated BEFORE the actor scope opens, only that it is present. (c) Nothing asserted the cap is counted AFTER deduping, so a smuggling path (5,000 entries repeating one id) and an over-strict refusal (101 entries carrying 100 distinct ids) were both untested.
- **Fix:** (a) The gate now extracts the parameter list and asserts it equals `ids: string[]` — proven load-bearing by negative proof 4. (b) A source assertion that `BULK_MAX_IDS` precedes `runWithActor` in both write slices. (c) A runtime case asserting `[...100 distinct, duplicate]` is a legal 100-record call.
- **`runWithActor`-once was already non-vacuous** and needed no change: both write suites assert it on a 12-id batch, where per-record wrapping would report 12 calls.
- **The 38-11 authorization gate was deliberately NOT copied.** Deals is the inverted case: it legitimately keeps `&& session.user.role !== "admin"`, so this gate asserts that clause **present exactly once** per write slice and the runtime cases assert the admin **succeeds**. Banning `session.user.role` here — as 38-11 correctly does for Organizations — would fail on correct code.
- **Files modified:** `src/app/deals/bulk-actions.test.ts`
- **Verification:** 48 tests green; typecheck 0 errors; lint unchanged at 0 errors / 125 warnings; proofs 3 and 4 both red before revert.
- **Committed in:** `e0a8b68`

**2. [Rule 3 - Blocking] Stubbed `getCurrentActor` in the `@/lib/audit/actor-context` mock**

- **Found during:** Task 1 (test scaffold)
- **Issue:** `deals/actions.ts` imports the real `@/lib/mutations/deals` (for the five pre-existing actions), and that module imports `getCurrentActor` from the same module the suite mocks for `runWithActor`. A factory exposing only `runWithActor` leaves the suite one refactor away from a "No export is defined on the mock" failure.
- **Fix:** Added `getCurrentActor: vi.fn()` to the mock factory with a one-line comment.
- **Files modified:** `src/app/deals/bulk-actions.test.ts`
- **Verification:** Suite imports and runs cleanly; the mutation layer can never reach the real `AsyncLocalStorage`.
- **Committed in:** `e0106e9` (Task 1 RED commit)

**3. [Rule 2 - Missing Critical] Four cases added beyond the plan's enumerated list**

- **Found during:** Tasks 1 and 2
- **Issue:** The plan enumerates the refusal cases but not their boundaries, and three gaps were worth closing: the cap is a ceiling (exactly 100 must be ACCEPTED, not refused — otherwise an off-by-one refusal passes every listed test), the closed reason union must actually stop a raw server message crossing the boundary, the malformed-argument narrowing needed a hostile-input table on each action, and the scoped export must work for a NON-admin (the whole reason it does not reuse the admin-gated `getExportData`).
- **Fix:** Added `accepts exactly BULK_MAX_IDS ids`, `never leaks the mutation's own error string across the client boundary`, two `refuses a malformed argument` cases, `validates the target ONCE for the whole call, not per record`, and `exports for a NON-ADMIN too`.
- **Files modified:** `src/app/deals/bulk-actions.test.ts`
- **Verification:** All pass; 48 tests total against the plan's floor of 32.
- **Committed in:** `e0106e9`, `fe682f1`, `9f90bed`

---

**Total deviations:** 4 auto-fixed (3 missing critical, 1 blocking)
**Impact on plan:** No scope creep — every change is inside the two files the plan names, and no production behaviour was altered by any of them (all four are test-side hardenings plus one mock stub). Deviations 1 and 1b closed gaps that would have shipped unproven guarantees.

## Issues Encountered

- **The comment/grep collision did not fire.** The gate reads `readStrippedSource`, so the action file's comments — which necessarily name `updateDealMutation`, the assignee join table and the email path in order to warn against them — cannot trip it. Raw-text `grep -c` acceptance counts were kept honest a second way: no comment in `actions.ts` spells `session.user.role !== "admin"`, `eq(users.status, "approved")` or `deals-selected-`, so those counts (6 / 1 / 1) measure code only. This is the twelfth exposure of the landmine in phases 37-38 and the first that cost nothing.
- No package was installed; no jsdom/happy-dom/@testing-library was added.

## Verification Results

- `./node_modules/.bin/vitest run src/app/deals/bulk-actions.test.ts` — **48 passed**
- `./node_modules/.bin/vitest run src/lib/audit/no-mutation-coupling.test.ts` — **29 passed** (no audit write added by this plan)
- `npm test` — main **1881 passed / 21 skipped** at `9f90bed` (baseline 1835 + 46 new); the two later hardening cases raise the plan's contribution to 48, so a full-suite re-run reports **1883 passed / 21 skipped**. rsc **8 passed**.
- `npm run typecheck` — **0 errors**, no `@ts-expect-error` added
- `npm run lint` — **0 errors / 125 warnings**, byte-identical to the pre-existing baseline
- `git status --porcelain src/app/deals/page.tsx` — **empty**
- `git diff` on `src/app/deals/actions.ts` — **insertions only**, so the five pre-existing actions are provably untouched

## Threat Model Coverage

| Threat | Status |
|---|---|
| T-38-01 (export widening / admin-gate bypass) | Mitigated — ids-only signature, deep-equal on the fetch argument, source gate bans the seven widening tokens |
| T-38-03 (privilege escalation by unifying predicates) | Mitigated — clause present exactly once per write slice, both runtime directions asserted, proven red when removed |
| T-38-02 (authorize-once-for-many) | Mitigated — per-record read + predicate inside the loop, no `WHERE id IN (…)` |
| T-38-05 (silent `deal_assignees` destruction) | Mitigated — routes to the owner-only mutation; gate bans `updateDealMutation` / `dealAssignees` / `assigneeIds`, proven red on a swap |
| T-38-14 (unwanted notification) | Mitigated — two runtime absences after FULLY SUCCESSFUL 12-id calls, plus a source absence |
| T-38-04 (actor attribution) | Mitigated — one scope, opened after the session check, actor deep-equals `{ kind: "user", userId }` |
| T-38-06 (transfer to an inactive principal) | Mitigated — both predicates in one lookup, once, before the actor scope; ordering asserted by the gate |
| T-38-07 (raw server message disclosure) | Mitigated — dispatch refusal collapses to `unknown`; a test asserts the mutation's string is absent from the serialized result |
| T-38-34 (transaction hides per-record failures) | Mitigated — gate bans `db.transaction` and `Promise.all`; a test proves the loop continues past a mid-list failure |
| T-38-08 (outbound fan-out) | Accepted, bounded by `BULK_MAX_IDS` |

No new security surface outside the plan's threat model was introduced, so there are no threat flags.

## Known Stubs

None. All three actions are fully wired to real dispatch and export paths; only the UI wiring (plan 38-18) remains, which is out of this plan's scope by design.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 38-18 can import `bulkDeleteDeals`, `bulkReassignDealOwner` and `exportSelectedDeals` from `@/app/deals/actions` with the exact signatures in the plan's `<interfaces>` block.
- The bar must render `BulkFailureReason` values through `bulk.reason.*`; the server never returns display text or a raw error string.
- Unchanged known gap, deliberately out of scope: `src/app/deals/page.tsx:159-163` still offers owners filtered on `deletedAt` alone, so its picker can list an unapproved user. The server action now refuses such a target with `invalid_owner`, so the failure is safe but the UI can still present the choice. Worth a follow-up in the page-wiring plan.

## Self-Check: PASSED

- `src/app/deals/actions.ts` — FOUND
- `src/app/deals/bulk-actions.test.ts` — FOUND
- `.planning/phases/38-bulk-operations/38-13-SUMMARY.md` — FOUND
- Commits `e0106e9`, `58cfc2d`, `fe682f1`, `8e64748`, `9f90bed`, `e0a8b68` — all FOUND on `worktree-agent-aee876d99639f725d`, based on `80d6474`
- `STATE.md` / `ROADMAP.md` — not modified (orchestrator-owned, per the wave contract)

---
*Phase: 38-bulk-operations*
*Completed: 2026-08-17*
