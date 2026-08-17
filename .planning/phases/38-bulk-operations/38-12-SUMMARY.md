---
phase: 38-bulk-operations
plan: 12
subsystem: api
tags: [typescript, server-actions, authorization, vitest, source-gate, csv-export, bulk-operations, people]

# Dependency graph
requires:
  - phase: 38-bulk-operations (plan 38-06)
    provides: BULK_MAX_IDS, BulkFailureReason/BulkErrorCode/BulkWriteResult, deleteRecordByType, updateRecordOwnerByType
  - phase: 38-bulk-operations (plan 38-04)
    provides: ExportFilters.ids and its inArray branch in fetchFilteredData; deferred the export-signature source gate to this plan
  - phase: 37-trash-restore
    provides: src/app/trash/actions.test.ts — the only session-swapping test scaffold in the repo; parseRecordId's runtime-narrowing rationale
  - phase: 36-audit-log
    provides: runWithActor and the T-36-02 rule that the actor scope opens AFTER the session check
provides:
  - bulkDeletePeople(ids) — sequential best-effort soft delete returning { succeeded, failed }
  - bulkReassignPersonOwner(ids, ownerId) — same loop, target validated once against approved-and-not-deleted
  - exportSelectedPeople(ids) — scoped CSV whose signature admits nothing but ids
  - The export-signature source gate plan 38-04 deferred, now non-vacuous because the function it scans exists
affects: [38-16, 38-19, 38-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-entity ownership predicate copied VERBATIM into the bulk loop with a paired negative-proof test, so the four asymmetric predicates cannot be 'unified' without a red suite"
    - "Scoped export as a security control expressed in the SIGNATURE: (ids: string[]) and nothing else, with the options object built from server-side literals"
    - "Anti-vacuous-by-construction source gate: reads the declaration's parameter list rather than only banning tokens, so a renamed or deleted function fails the gate instead of passing it"
    - "Call-count assertions sized so the defect is detectable: a 9-success batch, because a 1-success batch cannot distinguish once-after-the-loop from once-per-record"
    - "Tombstone comment naming a forbidden identifier, paired with a gate-for-the-gate proving the stripper removes prose and keeps code"

key-files:
  created:
    - src/app/people/bulk-actions.test.ts
  modified:
    - src/app/people/actions.ts

key-decisions:
  - "People's predicate is `if (person.ownerId !== session.user.id) {` with NO admin bypass, copied character-for-character from deletePerson. Two tests fail if an admin bypass is added: the behavioural admin-non-owner case and the source gate's ban on session.user.role"
  - "parseBulkIds narrows AND dedupes in one pass, and a malformed argument maps to no_selection rather than a distinct error code — 'we cannot tell what you selected' and 'you selected nothing' are the same outcome from the browser, and neither may widen into 'everything'"
  - "BULK_MAX_IDS is checked AFTER dedupe and BEFORE the actor scope opens, so 101 copies of one id is a one-record call rather than an over-cap refusal"
  - "The reassign target is validated with a single query carrying BOTH isNull(users.deletedAt) AND eq(users.status, \"approved\"); deals/page.tsx's deletedAt-only allUsers query is explicitly not the analog"
  - "exportSelectedPeople rewrites result.filename rather than touching fetchFilteredData's own filename block, keeping a widely shared function unmodified; the count comes from result.count so the name cannot disagree with the contents"
  - "The source gate reads readStrippedSource only — no direct filesystem read appears in the test file at all, which the plan's own acceptance criterion counts to zero"

patterns-established:
  - "Negative-proof discipline extended to test SENSITIVITY, not just test presence: the revalidate assertion was measured at 1, 3 and 9 successes and only detected the defect from 3 upwards, so the batch size is itself part of the contract"
  - "Two independent detectors for one rule: the admin bypass is caught behaviourally (admin-non-owner returns notPermitted) AND structurally (session.user.role banned from the write slices), so a refactor that defeats one still trips the other"
  - "callArguments used as a scope-containment proof: asserting revalidatePath is absent from runWithActor's argument text proves it is outside the callback, which index ordering alone cannot"

requirements-completed: [BULK-02, BULK-03, BULK-04]

# Metrics
duration: 19min
completed: 2026-08-17
---

# Phase 38 Plan 12: People Bulk Actions Summary

**Three People bulk server actions — delete, reassign owner, scoped CSV export — whose every refusal is proven to happen BEFORE any write by 38 tests in which the load-bearing assertions are absences, including the admin-gets-no-bypass case that fails the moment anyone unifies the four asymmetric ownership predicates.**

## Performance

- **Duration:** 19 min
- **Tasks:** 3 (5 commits: 2 RED/GREEN pairs plus the gate)
- **Files created:** 1 — **modified:** 1

## Accomplishments

- `bulkDeletePeople`, `bulkReassignPersonOwner` and `exportSelectedPeople` exist with exactly the signatures plan 38-16 will wire into the bar. `createPerson`, `updatePerson` and `deletePerson` are untouched — the only line the diff removes from the pre-existing file is the `@/db/schema` import, widened to include `users`.
- **People's ownership predicate is copied verbatim, with no admin bypass**, and that is enforced from two directions at once. Both bulk loops carry, character for character, the string already at `actions.ts:78` and `:126`:

  ```ts
  actions.ts:233    if (person.ownerId !== session.user.id) {   // inside bulkDeletePeople
  actions.ts:325    if (person.ownerId !== session.user.id) {   // inside bulkReassignPersonOwner
  ```

  A behavioural test drives an `{ role: "admin" }` session at a person owned by someone else and asserts `notPermitted` **and** that the dispatch was never called; independently, the source gate bans `session.user.role` from both write slices. Adding `&& session.user.role !== "admin"` fails both (measured — see Negative Proofs).
- **The scoped export's signature is the security control, and the gate over it is no longer vacuous.** Plan 38-04 deferred this gate because in wave 1 it would have matched zero functions. The declaration is now:

  ```ts
  actions.ts:368    export async function exportSelectedPeople(ids: string[]): Promise<ExportResult> {
  ```

  The gate does not merely ban `ExportFilters` / `ExportOptions` / `ExportFormat` / `pipedrive` / `getExportData` / `role` from the declaration — a ban that is equally satisfied by a function that was deleted. It **reads the parameter list** via `callArguments` and asserts it normalises to exactly `ids: string[]` with no comma, so a rename, a deletion or a second parameter of any name fails the gate.
- **One actor scope, one revalidation, both measured by call count rather than by reading the code.** `runWithActor` wraps the whole loop once and is entered only after `await auth()` has returned (T-36-02); `revalidatePath("/people")` fires once after the loop and only when at least one record succeeded. The scope-containment proof uses `callArguments(slice, "runWithActor")` and asserts `revalidatePath` is absent from the call's argument text — which is what actually proves "outside the callback", where index ordering alone would not.
- **The cap is enforced after dedupe and before the actor scope opens.** 101 distinct ids return `{ success: false, error: "too_many", max: 100 }` with no read, no dispatch, no scope and no revalidation; on the reassign path it also returns before the target user is looked up at all.
- **The reassign target is validated exactly once, on both predicates.** A single `users.findFirst` carrying `and(eq(users.id, …), isNull(users.deletedAt), eq(users.status, "approved"))`. The test does not merely assert the mock was called — it walks the drizzle SQL chunk tree and asserts the condition references both the `status` and `deleted_at` columns, so a regression to a `deletedAt`-only predicate (the shape of `deals/page.tsx`'s `allUsers`) is caught structurally. Handing records to a `rejected` or unverified account is otherwise invisible, because each individual write succeeds.
- **Partial failure is an ordinary outcome and the loop never stops at one.** 12 ids with 9 owned yields 9 `succeeded` and 3 `failed`, all `notPermitted`; a mid-list dispatch refusal maps to `unknown` and the third id is still read and still dispatched. The mutation's own message never crosses the boundary — the test asserts the serialised result does not contain the Postgres error code the mock emitted (T-38-07).
- 38 tests, all green. Full suite 1873 passed / 21 skipped (baseline 1835/21 — exactly +38, no collateral change), rsc 8 unchanged, `npm run typecheck` 0 errors, `npm run lint` 0 errors and 125 warnings, matching the pre-existing baseline exactly. `no-mutation-coupling.test.ts` still green: no audit row is written here.

## Task Commits

| Task | Gate | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | RED | `8686638` | `src/app/people/bulk-actions.test.ts` (24 red cases) |
| 1 | GREEN | `d8ad644` | `src/app/people/actions.ts` (+210) |
| 2 | RED | `5cf6acd` | `src/app/people/bulk-actions.test.ts` (6 red cases) |
| 2 | GREEN | `3d7bfdb` | `src/app/people/actions.ts` (+53) |
| 3 | gate | `99c0c9c` | both files (source gate, tombstone, strengthened batch sizes) |

## Acceptance Criteria Measurements

| Criterion | Required | Measured |
| --- | --- | --- |
| `export async function bulkDeletePeople\|bulkReassignPersonOwner` | 2 | **2** |
| `runWithActor` line count, before → after | +2 exactly | **4 → 6** |
| `eq(users.status, "approved")` | 1 | **1** |
| `BULK_MAX_IDS` | ≥2 | **4** |
| `export async function exportSelectedPeople` | 1 | **1** |
| `people-selected-` | 1 | **1** |
| Tests in `bulk-actions.test.ts` | ≥28 | **38** |
| `not.toHaveBeenCalled` | ≥10 | **28** |
| `toHaveBeenCalledTimes(1)` | ≥3 | **9** |
| `readStrippedSource` | ≥1 | **3** |
| direct filesystem read in the test file | 0 | **0** |
| `npm run typecheck` | 0 errors | **0 errors, no new `@ts-expect-error`** |
| `npm run lint` | 0 errors | **0 errors / 125 pre-existing warnings** |

## Negative Proofs

Both mandated directions were demonstrated red and reverted. A third was found and fixed along the way.

**1. Admin bypass added to `bulkDeletePeople`'s predicate** (`&& session.user.role !== "admin"`). Two tests failed:

```
× AUTHORIZATION ASYMMETRY: an admin still gets notPermitted on a person they do not own
  AssertionError: expected { success: true, …(2) } to deeply equal { success: true, succeeded: [], …(1) }
  - "failed": [ { "id": "p1", "reason": "notPermitted" } ]   "succeeded": []
  + "failed": [],                                            "succeeded": [ "p1" ]

× keeps batching, transactions, role checks and hand-rolled audit writes out of both bulk writes
```

The record was **soft-deleted** under the bypass, which is the escalation stated plainly: an admin acquiring delete rights over every colleague's contacts as a side effect of shipping a bulk feature.

**2. `revalidatePath` moved inside the loop.** Both the source gate and the call-count assertion failed:

```
× revalidates once after the loop when at least one record succeeded
  AssertionError: expected "vi.fn()" to be called 1 times, but got 9 times

× revalidates once per bulk write, outside the actor scope rather than per record
  AssertionError: export async function bulkDeletePeople calls revalidatePath inside the
  runWithActor callback, so it would fire once per record:
  expected '{ kind: "user", userId: actorId }, as…' not to contain 'revalidatePath'
```

**3. (Found during proof 2 — the test itself was defective.)** As first written from the plan, that call-count case used a 2-id / 1-success batch. Under the defect it stayed **green**: with a single success, once-per-record and once-after-the-loop both produce exactly one call, so the assertion could not tell the two shapes apart. Raised to 3 successes it failed with `got 3 times`; the committed version uses the 9-success batch and fails with `got 9 times`. The batch size is therefore part of the contract, not an incidental fixture — recorded in the test's own comment so it is not "simplified" later.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical test coverage] The plan's `revalidatePath`-once assertion was vacuous as specified**

- **Found during:** Task 3, while running the plan's own mandated negative proof
- **Issue:** The plan specified case A.11 as "`revalidatePath` called once for a partially successful call". Implemented literally with 2 ids / 1 success, the assertion passes on defective code — a per-record `revalidatePath` inside the loop also yields exactly one call when exactly one record succeeds. The plan's acceptance criterion expected this assertion to fail under the negative proof; it did not.
- **Fix:** Raised the scenario to 12 ids / 9 successes so the defect reads as 9 calls, and recorded the measurement (green at 1, red at 3, red at 9) in the test's comment. Also confirmed the sibling `runWithActor`-once case was already at 12 ids and so was never exposed to this.
- **Files modified:** `src/app/people/bulk-actions.test.ts`
- **Commit:** `99c0c9c`
- **Note:** The orchestrator independently reported the identical finding from plan 38-11 (Organizations) mid-execution, which had failed with `got 9 times` at the same batch size. The two arrived at the same fix; this plan's version additionally records the 3-success intermediate measurement.

**2. [Rule 2 - Anti-vacuity] The export-signature gate strengthened from a token ban to a parameter-list read**

- **Found during:** Task 3
- **Issue:** The plan specified the gate as a list of forbidden tokens in the declaration slice. That form is satisfied just as well by a declaration that was renamed or deleted — precisely the vacuity plan 38-04 deferred the gate to avoid, reintroduced in a different shape.
- **Fix:** Added an assertion that reads the declaration's parameter list via `callArguments` and requires it to normalise to exactly `ids: string[]` with no comma, keeping the token ban as a second, independent check.
- **Files modified:** `src/app/people/bulk-actions.test.ts`
- **Commit:** `99c0c9c`

**3. [Rule 3 - Blocking] `getCurrentActor` had to be added to the `actor-context` mock factory**

- **Found during:** Task 1
- **Issue:** The plan's mock factory for `@/lib/audit/actor-context` lists `runWithActor` only. `people/actions.ts` imports `@/lib/mutations/people`, which imports `getCurrentActor` from the same module, so an ESM factory omitting it fails at link time.
- **Fix:** Added `getCurrentActor: vi.fn()` to the factory, and additionally mocked `@/lib/mutations/people` — which both shrinks the import surface and means a regression routing a reassign through `updatePersonMutation` could not quietly succeed.
- **Files modified:** `src/app/people/bulk-actions.test.ts`
- **Commit:** `8686638`

### Process Note (no code impact)

The plan's acceptance criterion "`grep -c 'readFileSync'` is 0" tripped on a **comment** in the test file's own gate header, which explained that the gate does not read raw text — by naming the banned function. Per the phase rule the comment was reworded and the gate left alone. This is the **twelfth** occurrence of the comment/grep collision across phases 37-38, and the second time it has fired on wording that described the very rule being enforced. The reworded comment now records the incident in place.

A second process note, worth carrying forward: reverting the first negative proof with `git checkout -- src/app/people/actions.ts` also discarded an unrelated **uncommitted** edit to the same file (the tombstone comment), which had to be re-applied. The second proof was reverted from an explicit file backup instead. A blanket path revert is not a safe undo for a probe when the same file carries uncommitted work.

## Interfaces Published

```ts
export async function bulkDeletePeople(ids: string[]): Promise<BulkWriteResult>
export async function bulkReassignPersonOwner(ids: string[], ownerId: string): Promise<BulkWriteResult>
export async function exportSelectedPeople(ids: string[]): Promise<ExportResult>
```

Plan 38-16 wires these three into the bulk action bar. Notes for that plan:

- `bulkReassignPersonOwner` needs a **new** owner query filtered on `and(isNull(users.deletedAt), eq(users.status, "approved"))` to populate its picker. `deals/page.tsx`'s `allUsers` filters on deletion alone and would offer unapproved users as targets; editing it would change existing dropdowns.
- The success arm is a **partial** result: `success: true` with a non-empty `failed` is ordinary and means the call ran. Render the failure report from `failed`, pairing ids with the labels captured at submit time — the server returns ids and closed codes only, never display text.
- `exportSelectedPeople` returns the CSV **in** the result (`data`, `filename`, `count`); there is no download route and none is needed.

## Known Stubs

None. All three actions are fully wired to real dispatch and export paths; nothing returns a placeholder.

## Threat Flags

None. Every file touched is covered by the plan's existing threat register: `T-38-01` (export signature), `T-38-02` (per-record ownership), `T-38-03` (cap), `T-38-04` (actor attribution), `T-38-06` (inactive-principal transfer), `T-38-07` (failure reporting), `T-38-09` (reassign routing) and `T-38-34` (loop control flow) are all mitigated as specified and each has at least one test asserting it. No new network endpoint, auth path, file access pattern or schema change was introduced.

## Verification

- `./node_modules/.bin/vitest run src/app/people/bulk-actions.test.ts` — **38 passed**
- `./node_modules/.bin/vitest run src/lib/audit/no-mutation-coupling.test.ts` — **29 passed**
- `npm test` — **1873 passed / 21 skipped** (main), **8 passed** (rsc). Baseline 1835/21 and 8; delta is exactly the 38 new tests.
- `npm run typecheck` — **0 errors**
- `npm run lint` — **0 errors**, 125 warnings (unchanged baseline)
- Both mandated negative proofs demonstrated red and reverted; messages recorded above.

## Self-Check: PASSED

- `src/app/people/actions.ts` — FOUND (405 lines)
- `src/app/people/bulk-actions.test.ts` — FOUND (773 lines)
- `.planning/phases/38-bulk-operations/38-12-SUMMARY.md` — FOUND
- Commits `8686638`, `d8ad644`, `5cf6acd`, `3d7bfdb`, `99c0c9c` — all present in `git log`
- No modification to `STATE.md` or `ROADMAP.md` (orchestrator-owned)
- No file deletions in any commit (`git diff --diff-filter=D` empty for each)
