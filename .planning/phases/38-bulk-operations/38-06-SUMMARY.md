---
phase: 38-bulk-operations
plan: 06
subsystem: api
tags: [typescript, satisfies, dispatch-map, vitest, entity-type, bulk-operations]

# Dependency graph
requires:
  - phase: 38-bulk-operations (plan 38-02)
    provides: updateOrganizationOwnerMutation, updatePersonOwnerMutation
  - phase: 38-bulk-operations (plan 38-03)
    provides: updateDealOwnerMutation, updateActivityOwnerMutation
  - phase: 37-trash-restore
    provides: src/lib/trash/dispatch.ts — the whole-file template, including its header rules and the measured `satisfies` behaviour
provides:
  - BULK_MAX_IDS = 100 in an import-free module the 'use client' bulk bar can import
  - The closed BulkFailureReason / BulkErrorCode / BulkWriteResult / BulkOutcome type contract, import-free
  - deleteRecordByType and updateRecordOwnerByType over all four entity types, server-only
  - BulkMutationResult — the per-record result type the bulk loops translate into a closed reason code
affects: [38-08, 38-09, 38-10, 38-11, 38-12, 38-13, 38-14, locale-parity, bulk-action-bar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-file split: import-free constant + import-free types + server-only dispatch, so a client component can mirror a server cap without pulling pg into the bundle"
    - "satisfies on BOTH arms of a two-map dispatch, with both compile directions measured rather than reasoned about"
    - "Exact-argument-array assertions where all parameters share one type and order is invisible to the type checker"

key-files:
  created:
    - src/lib/bulk/limits.ts
    - src/lib/bulk/types.ts
    - src/lib/bulk/dispatch.ts
    - src/lib/bulk/dispatch.test.ts
  modified: []

key-decisions:
  - "BULK_MAX_IDS = 100 is a shared constant, not per-mutation (38-CONTEXT left this to Claude's discretion) — it continues the pre-existing MAX_BATCH_SIZE = 100 in the /api/v1/*/batch routes and lets the bar's copy and the server's guard read one number"
  - "BulkMutationResult (dispatch.ts, carries the mutation's raw error string) is deliberately a DIFFERENT type from BulkWriteResult (types.ts, closed error codes only). The raw string stops at the dispatch boundary; translating it into a BulkFailureReason is each bulk action's job"
  - "alreadyDeleted stays in BulkFailureReason even though it is unreachable on the delete path today — the collapse must go towards notFound, never towards a permission failure being reported as 'Already in Trash'"
  - "Two separate map types (DeleteMap arity 2, OwnerMap arity 3) rather than one widened shape; 38-RESEARCH A2's no-wrapper assumption was typechecked and held for all eight mutations"
  - "Both maps stay module-private; exhaustiveness is asserted behaviourally, following trash/dispatch.test.ts:22-30, rather than widening exports to make a test convenient"

patterns-established:
  - "Import-free client-safe sibling of a server-only module: limits.ts/types.ts are to dispatch.ts what trash/entity-types.ts is to trash/dispatch.ts, and each states the rule in its own header"
  - "Both-direction satisfies proof: a missing arm must raise TS2741 on the annotation and an extra arm must raise TS2353 on the clause; both measured on both maps, plus the control showing the extra arm compiles clean once the clause is removed"
  - "Cross-map isolation assertion: expectOnlySpyCalled spans both spy tables, so a delete can never touch an owner mutation and vice versa"
  - "Anti-vacuity inside a test helper: ALL_SPIES length is pinned at 8 and membership of the target asserted, so an empty list cannot make every test pass silently"

requirements-completed: [BULK-02, BULK-03]

# Metrics
duration: 12min
completed: 2026-08-17
---

# Phase 38 Plan 06: Bulk Contract and Dispatch Summary

**`src/lib/bulk/` — a 100-id cap and a closed failure-reason contract in two import-free modules, plus a server-only dispatch routing soft-delete and owner-transfer over all four entity types behind two frozen `satisfies`-guarded maps, with both compile directions and a deliberate arm swap measured red.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-17T14:14:18Z
- **Completed:** 2026-08-17T14:25:55Z
- **Tasks:** 3
- **Files created:** 4 (0 modified)

## Accomplishments

- `BULK_MAX_IDS = 100` and the whole `BulkFailureReason` / `BulkErrorCode` / `BulkWriteResult` / `BulkOutcome` type contract now exist as two **import-free** modules, verified by an automated check, so the `"use client"` bulk bar can mirror the server's cap without a transitive `@/db` import putting `pg` in the browser bundle.
- `deleteRecordByType(entityType, id, userId)` and `updateRecordOwnerByType(entityType, id, ownerId, userId)` route to all eight mutations with no per-arm wrapper, no cast, and no authorization logic — 38-RESEARCH assumption A2 was typechecked rather than assumed and held.
- Both `satisfies` directions measured on **both** maps (not one measured and one reasoned about), plus the control run proving the clause is load-bearing: with `satisfies` removed, the extra `note:` arm compiles clean.
- 19 tests, including the assertion the type checker structurally cannot make: the exact argument array on an owner call, pinning `(id, ownerId, userId)` against a swap that would transfer every reassigned record to whoever clicked the button.

## Task Commits

1. **Task 1: limits.ts and types.ts, both import-free** — `dba9c17` (feat)
2. **Task 2: dispatch.ts — the delete map and the owner map** — `9dba413` (feat)
3. **Task 3: dispatch.test.ts — mis-wiring detection and behavioural exhaustiveness** — `5ecb742` (test)

## Files Created/Modified

- `src/lib/bulk/limits.ts` (created) — `BULK_MAX_IDS = 100`, one export and nothing else. Header records that 100 continues `MAX_BATCH_SIZE = 100` in the batch routes, that the module must never acquire an import, and that the client mirror is advisory because a client-only cap is not a cap.
- `src/lib/bulk/types.ts` (created) — `BulkFailureReason` (closed 4-member union, no string arm), `BulkFailure`, `BulkErrorCode`, `BulkWriteResult`, `BulkOperationKind`, `BulkOutcome`. Documents why `alreadyDeleted` is unreachable on the delete path and why it stays anyway, and why `labelById` is captured at submit time by the client.
- `src/lib/bulk/dispatch.ts` (created) — `BulkMutationResult`, module-private `DELETE_BY_TYPE` / `OWNER_BY_TYPE`, and the two no-fallback accessors. Header restates all three `trash/dispatch.ts` rules and notes this file sits outside `no-mutation-coupling.test.ts`'s `src/lib/mutations/` scope.
- `src/lib/bulk/dispatch.test.ts` (created) — 19 tests: per-type routing on both operations, exact argument arrays, cross-map isolation, result identity, promise pass-through, verbatim error forwarding, rejection propagation, behavioural exhaustiveness, and no runtime fallback for a fifth type.

No `index.ts` barrel was created; downstream plans import the concrete module paths.

## Verification Evidence

### Both `satisfies` directions, both maps

Measured by editing `dispatch.ts` and running `tsc --noEmit`, then restoring (`diff -q` against a pre-edit copy confirmed byte-identical restoration).

**Missing arm, `DELETE_BY_TYPE` (removed `person`):**
```
src/lib/bulk/dispatch.ts(98,7): error TS2741: Property 'person' is missing in type
'Readonly<{ deal: ...; organization: ...; activity: ... }>' but required in type
'Readonly<Record<EntityType, (id: string, userId: string) => Promise<BulkMutationResult>>>'.
src/lib/bulk/dispatch.ts(102,3): error TS1360: Type '{ deal: ...; organization: ...; activity: ... }'
does not satisfy the expected type 'Readonly<Record<EntityType, ...>>'.
```
TS2741 lands on the **annotation** (line 98, the const); the clause adds a corroborating TS1360.

**Extra arm, `DELETE_BY_TYPE` (added `note: deleteDealMutation`):**
```
src/lib/bulk/dispatch.ts(103,3): error TS2353: Object literal may only specify known properties,
and 'note' does not exist in type
'Readonly<Record<EntityType, (id: string, userId: string) => Promise<BulkMutationResult>>>'.
```

**Missing arm, `OWNER_BY_TYPE` (removed `activity`):**
```
src/lib/bulk/dispatch.ts(105,7): error TS2741: Property 'activity' is missing in type
'Readonly<{ deal: ...; person: ...; organization: ... }>' but required in type
'Readonly<Record<EntityType, (id: string, ownerId: string, userId: string) => Promise<BulkMutationResult>>>'.
src/lib/bulk/dispatch.ts(109,3): error TS1360: ... does not satisfy the expected type ...
```

**Extra arm, `OWNER_BY_TYPE` (added `note: updateDealOwnerMutation`):**
```
src/lib/bulk/dispatch.ts(110,3): error TS2353: Object literal may only specify known properties,
and 'note' does not exist in type
'Readonly<Record<EntityType, (id: string, ownerId: string, userId: string) => Promise<BulkMutationResult>>>'.
```

**Control — the clause is what catches the extra arm.** With `note: deleteDealMutation` present and `satisfies DeleteMap` deleted (annotation kept), `tsc --noEmit` reported **0 errors in `dispatch.ts`**. That is the Phase 37 lesson reproduced in this file: the bare `Readonly<Record<K, fn>>` annotation does not give excess-property checking, because the literal is an argument to the freeze call and is no longer fresh by the time it reaches the annotated const.

### Mis-wiring proof (deliberate arm swap)

`OWNER_BY_TYPE.person` and `.organization` were swapped to point at each other's mutation. This typechecks perfectly — the signatures are identical. The suite went red with **3 of 19 failures**:

```
× updateRecordOwnerByType > routes organization to its own owner mutation
× updateRecordOwnerByType > routes person to its own owner mutation
  AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
   ❯ src/lib/bulk/dispatch.test.ts:206:17

× updateRecordOwnerByType > propagates a rejected mutation instead of swallowing it
  AssertionError: promise resolved "{ success: true }" instead of rejecting
   ❯ src/lib/bulk/dispatch.test.ts:269:5
```
Restored; `git diff --stat src/lib/bulk/dispatch.ts` returned empty against the committed state.

### Suite state

- `npm run typecheck` — 0 errors
- `npm run lint` — 0 errors, 125 warnings (**exactly** the pre-existing baseline; no new warning)
- `npm test` — **1797 passed / 21 skipped** (main) + **8 passed** (rsc). Baseline after wave 1 was 1778/21 + 8, so the delta is exactly this plan's 19 new tests and nothing else.
- `./node_modules/.bin/vitest run src/lib/bulk/` — 19 passed
- Import-free check (`limits.ts` + `types.ts`, `/^\s*import\s/m`) — clean. Non-vacuous: the check `readFileSync`s both paths by name, so a missing or renamed file throws rather than passing.

## Decisions Made

- **Shared constant, not per-mutation.** 38-CONTEXT explicitly left "whether the 100-id cap is a shared constant or per-mutation" to Claude's discretion. Shared, in its own file: twelve bulk actions plus one client bar plus one copy key all need the same number, and a per-mutation cap would put the bar's advisory limit and the server's real limit in different files with nothing keeping them equal.
- **`BulkMutationResult` and `BulkWriteResult` are deliberately distinct types.** The first carries the mutation's own free-form `error` (written for a server log); the second is the closed-code shape that crosses the client boundary. Merging them is the shortest path to T-38-07, so the two are separated by file and the header of each says why.
- **`alreadyDeleted` retained despite being unreachable on the delete path.** Every `delete{Entity}Mutation` scopes its read with `isNull(deletedAt)`, so an already-trashed record is simply a miss and maps to `notFound`; distinguishing them needs a second per-record read (38-RESEARCH A6). The key stays for the reassign path and any future second-read variant, and because the collapse must go towards `notFound` — reporting a permission failure as "Already in Trash" would tell a user their colleague's record is deleted when it is not.
- **Two map types rather than one.** The arities genuinely differ; a single shared shape would have to widen to the looser one, and that would let an owner mutation sit in the delete map. Keeping them separate is what makes the type checker catch the worst cross-wiring (a reassign arm pointing at a soft-delete).
- **Both maps module-private, exhaustiveness behavioural.** Copied `trash/dispatch.test.ts:22-30`'s resolution verbatim in spirit: four types driven through both accessors, the reached sets compared, and a fifth type shown to have no entry — without exporting the maps to make a test convenient.

## Deviations from Plan

None — plan executed exactly as written. No deviation rule fired: no bug, no missing critical functionality, no blocker, no architectural change. Zero packages installed (38-RESEARCH § Package Legitimacy Audit: empty input set, T-38-SC).

Two **comment rewords** were required to keep the plan's own grep gates honest, which the environment notes explicitly call for ("if a gate trips on your own comment, REWORD THE COMMENT — never weaken the gate"). Neither changes behaviour:

1. `dispatch.ts` — the acceptance gate requires `grep -c 'Object.freeze'` to be exactly 2. The explanatory comment above the maps mentioned the call by name, making 3. The prose now says "an argument to the freeze call below" and records why it avoids the name.
2. `dispatch.test.ts` — the gate requires `grep -c 'satisfies Record<EntityType, unknown>'` to be exactly 2. The comment above the spy tables quoted the clause, making 3. The prose now refers to "the `satisfies` clause closing each literal below" and records why.

Both gates now report exactly the expected counts, with the real code unchanged. This is the tenth and eleventh instance of the comment/grep collision first catalogued in Phase 37 — worth noting for future gate authors: a gate whose target string is the natural way to *explain* the mechanism will collide with its own documentation, so either the gate should read stripped source (`readStrippedSource`) or the count should be stated as a minimum.

## Issues Encountered

- **Worktree forked from a stale commit, again.** `git merge-base HEAD 2dcfcb6` returned HEAD itself, i.e. the worktree was created behind the required base. Resolved by the mandated `git reset --hard 2dcfcb6` in the startup check, then confirmed `updateOrganizationOwnerMutation` was present in `src/lib/mutations/organizations.ts` before writing anything. This is the same Claude Code `isolation="worktree"` behaviour that hit all five wave-1 agents; the startup check caught it as designed.
- No `node_modules` in the worktree — symlinked the main checkout's per instruction. Nothing installed.

## Known Stubs

None. Every export in this plan is fully implemented; the four artifacts are a constant, a set of type declarations, two routing functions, and their tests. The downstream *consumers* (bulk bar, dialogs, twelve server actions) do not exist yet by design — this plan is the contract they import, and plans 38-08 onward build them.

## Threat Flags

None. No new network endpoint, auth path, file access pattern, or schema change. The one trust boundary this plan touches — the client bundle / server-only split — is handled by the register's own mitigation (T-38-21) and is asserted automatically.

Threat register dispositions discharged here:
- **T-38-03 (DoS via unbounded id list)** — `BULK_MAX_IDS = 100` exists as the single shared constant; server-side *enforcement* is plans 38-11..38-14's job, and `limits.ts`'s header states that the client mirror is advisory only so a future reader cannot mistake the bar's cap for the control.
- **T-38-07 (raw server error to client)** — `BulkFailureReason` has no string arm, so the leak is structurally impossible rather than review-dependent. `BulkMutationResult`'s doc comment names the boundary where the raw string must stop.
- **T-38-02 (authorization placement)** — transferred as planned. `grep`-verified: the comment-stripped source of `dispatch.ts` contains zero occurrences of `session`, `auth()` or `ownerId !==`, and the header explains that the asymmetric predicate (deals' admin bypass) cannot be unified into a dispatch map without a second predicate map.
- **T-38-20 (mis-wired arm)** — detector built and demonstrated red (3 failures on a deliberate swap).
- **T-38-21 (bundle leak)** — both client-safe modules asserted import-free by an automated, non-vacuous check.

## Next Phase Readiness

Everything plans 38-08 onward import by name now exists and is green:

- `import { BULK_MAX_IDS } from "@/lib/bulk/limits"` — safe from a `"use client"` component.
- `import type { BulkFailureReason, BulkFailure, BulkErrorCode, BulkWriteResult, BulkOperationKind, BulkOutcome } from "@/lib/bulk/types"` — safe from a `"use client"` component.
- `import { deleteRecordByType, updateRecordOwnerByType } from "@/lib/bulk/dispatch"` — **server only**.

Two things the consuming plans own and this one deliberately did not do:

1. **Server-side cap enforcement.** Nothing yet checks `ids.length` against `BULK_MAX_IDS`. Until a bulk action does, the constant is documentation. Each of 38-11..38-14 must refuse with `{ success: false, error: "too_many", max: BULK_MAX_IDS }`.
2. **The per-entity ownership predicate.** It must be copied verbatim per entity — deals carries `&& session.user.role !== "admin"`, the other three do not. Unifying it is a privilege escalation for three entities or a regression for deals.

Also for the copy contract: `bulk.reason.*` needs all four reason keys and `bulk.error.*` all four error codes in `REQUIRED_BULK_KEYS`, including `alreadyDeleted`, which is unreachable on today's delete path but part of the union.

## Self-Check: PASSED

All four created source files exist on disk (`limits.ts` 2.1K, `types.ts` 6.0K, `dispatch.ts` 8.1K, `dispatch.test.ts` 14.4K) and all three task commits are present in `git log` (`dba9c17`, `9dba413`, `5ecb742`). No files were deleted by any commit (`git diff --diff-filter=D` empty for each). No untracked files remain.

---
*Phase: 38-bulk-operations*
*Completed: 2026-08-17*
