---
phase: 37-trash-restore
plan: 04
subsystem: mutations
tags: [trash, restore, purge, audit, formula-recalc, transaction]
status: blocked-on-decision
requires:
  - "src/lib/formula-recalc.ts (CHANGED_FIELDS_CUSTOM_SENTINEL, ENTITY_NATIVE_ATTRIBUTES, recalculateFormulas)"
  - "src/lib/audit/actor-context.ts (getCurrentActor)"
  - "src/db/schema/audit-log.ts (auditLog, AuditAction)"
provides:
  - "restoreDealMutation(id) -> { success: true } | { success: false; error }"
  - "purgeDealMutation(id) -> { success: true; detached } | { success: false; error }"
  - "restoreActivityMutation(id) -> { success: true } | { success: false; error }"
  - "purgeActivityMutation(id) -> { success: true; detached: 0 } | { success: false; error }"
affects:
  - "37-05 (people/organizations restore/purge — hits the same SC-5 gate)"
  - "37-06+ (dispatch, server actions, REST routes, pruner all call these four)"
tech-stack:
  added: []
  patterns:
    - "Ordered teardown inside one db.transaction, children handled by disposition"
    - "Direct audit_log insert from the mutation layer (no bus event exists for restore/purge)"
    - "Discriminated NOT_IN_TRASH code instead of prose, so the UI can distinguish already-purged"
key-files:
  created: []
  modified:
    - "src/lib/mutations/deals.ts"
    - "src/lib/mutations/deals.test.ts"
    - "src/lib/mutations/activities.ts"
    - "src/lib/mutations/activities.test.ts"
decisions:
  - "Restore passes CHANGED_FIELDS_CUSTOM_SENTINEL plus every ENTITY_NATIVE_ATTRIBUTES entry as changedFields, because deletedAt matches no formula ref and an empty list evaluates nothing in silence"
  - "Purge DETACHES activities rather than deleting them, and audits every detach"
  - "action: 'deleted' plus a __purge marker in changes, rather than a fourth AuditAction literal"
  - "A formula failure during restore is logged, not turned into a restore failure (D-05)"
metrics:
  duration_minutes: 16
  completed: 2026-08-16
  tasks_completed: 2
  tests_added: 37
  files_modified: 4
requirements: [TRASH-02, TRASH-03]
---

# Phase 37 Plan 04: Deal and Activity Restore/Purge Mutations Summary

Restore and purge for deals and activities: restore repairs formulas with a scope broad enough to
actually match, purge is an ordered transactional teardown that detaches independent children
rather than destroying them.

## What Was Built

### Task 1 — `restoreDealMutation` / `restoreActivityMutation`

The mirror of the existing soft delete, with three deliberate divergences:

1. The existence predicate inverts to `and(eq(table.id, id), isNotNull(table.deletedAt))`. A test
   renders the predicate through `PgDialect` and asserts it contains `is not null` and no bare
   `is null` — `isNull` vs `isNotNull` is a one-character difference with opposite meaning, and
   both compile and both return a row-or-undefined, so nothing weaker would catch it.
2. A miss returns the discriminated code `"NOT_IN_TRASH"` rather than prose, so the trash UI can
   say "already purged" instead of telling a user to retry a record that no longer exists.
3. Nothing is emitted on the CRM bus (37-CONTEXT locks that no `{entity}.restored` event type is
   introduced). Because there is no event, there is no audit subscriber, so the audit row is
   written directly by the mutation.

**The formula-scope trap, handled.** `scopeFormulasToChangedFields` admits a formula only when one
of its refs matches `changedFields`. `deletedAt` is not a referenceable attribute for any entity
type, so `[]` or `['deletedAt']` evaluates **zero** formulas in total silence — a green test and
stale values in production. Restore therefore passes
`[CHANGED_FIELDS_CUSTOM_SENTINEL, ...Object.values(ENTITY_NATIVE_ATTRIBUTES[entityType])]`, and the
test asserts on the **argument**, comparing against the real imported constant rather than a
hardcoded copy. The call is ordered **after** the update via `mock.invocationCallOrder`, because
`cascadeToChildren` filters `isNull(relation.deletedAt)` and children only re-enter the cascade
once the parent is live.

### Task 2 — `purgeDealMutation` / `purgeActivityMutation`

One `db.transaction`, with children handled by disposition rather than uniformly:

| Step | Table | Disposition | Why |
|------|-------|-------------|-----|
| 1 | `notes` | delete | Polymorphic, **no** foreign key — nothing enforces it, rows would dangle forever |
| 2 | `deal_assignees` | delete | Join row with no independent identity |
| 3 | `deal_stage_history` | delete | Immutable history *of* the deal; not the audit log |
| 4 | `activities` | **detach** (`dealId: null`) | An independent trashable entity with its own owner and trash tab |
| 5 | `audit_log` | insert (one per detached child) | So an unlinked activity is traceable (T-37-10) |
| 6 | `deals` | delete, guarded by `isNotNull(deletedAt)` | T-37-15 |
| 7 | `audit_log` | insert (the purge row) | Inside the tx, so a rollback cannot record a purge that did not happen (T-37-07) |

For an activity the teardown is steps 1, 6 and 7 only — `activities` is a true leaf.

The order is asserted with `mock.invocationCallOrder`, not just call counts, and the table
identities are asserted as an exact ordered list. A partial teardown leaves FK-orphaned child rows
with no parent left to purge them later, so ordering is the whole point. Tests also assert every
write went through the `tx` handle and never `db`, that zero detached children produces zero detach
audit rows and no `insert([])`, and that a not-in-trash record never opens a transaction at all.

## BLOCKER — a decision is required before this plan can be called done

**A Phase 36 repo-wide invariant now fails, and the fix belongs to neither wave-1 plan.**

`src/lib/audit/no-mutation-coupling.test.ts` encodes Phase 36's SC-5 as a mechanical gate: *nothing
under `src/lib/mutations/` may import, reference, or call into the audit layer.* Its premise is that
"capture happens entirely on the far side of `crmBus`".

This plan's locked design breaks that premise — deliberately. 37-CONTEXT forbids a
`{entity}.restored` event, so there is no event for a subscriber to hear, and this plan's own action
section mandates writing the audit row directly from the mutation. The two are irreconcilable as
written.

**Current state: `npm test` is RED — 2 failing tests, both in that one gate file.** Every other
check is green (see Verification below). The gate reports exactly 2 offenders: `deals.ts` and
`activities.ts`.

Why this was not resolved unilaterally:

- **It is a previous phase's success criterion.** Narrowing SC-5 changes what Phase 36 is understood
  to have proven. That is not this plan's call to make silently.
- **It is contended shared surface.** Plan 37-05 (`people.ts`, `organizations.ts`) is a wave-1
  sibling doing the identical direct audit write in a parallel worktree. It will hit the same gate
  and add 2 more offenders. Whichever agent edits `no-mutation-coupling.test.ts` creates a merge
  conflict with the other, and neither plan lists the file in `files_modified`.
- **The gate's own text asks for a review, not an edit.** Line 214: *"If this ever fails because a
  mutation module legitimately says 'audit' in CODE rather than in prose, that is a finding to
  review here — not a line to delete."* This is that finding.

Two of the three conceivable resolutions are already ruled out by locked decisions:

| Option | Verdict |
|--------|---------|
| Introduce `{entity}.restored` bus events so the subscriber writes the row | **Ruled out** — 37-CONTEXT locks that no such event type is introduced, and re-emitting `.created` would lie to every webhook and workflow subscriber |
| Move restore/purge out of `src/lib/mutations/` | **Ruled out** — breaks this plan's `must_haves.artifacts` contract and every downstream plan's import path |
| Amend SC-5's scope | **The only viable option — needs a decision on shape** |

**Recommended amendment** (not applied): scope the gate by FUNCTION rather than by file. Excise the
spans of the `restore*Mutation` / `purge*Mutation` functions plus the two allowed import specifiers
from the stripped source, then run the existing detector on the remainder. That is strictly
*stronger* than a file-level allowlist — `updateDealMutation` growing an `auditLog` reference would
still fail — and it matches the posture the gate's header already takes for the two importers, which
are documented as "OUT of scope, deliberately, and not leaks" for exactly the same reason (36-12
locked a direct write where per-record events were untenable). Anti-vacuity must be preserved: assert
each named function was actually found, and assert the excised spans *do* contain audit references so
the carve-out is proven live rather than dead.

Whoever applies it should do so **once**, covering all four CRM modules and all eight trash function
names, so 37-05 does not have to amend it a second time.

## Deviations from Plan

**1. [Rule 4 — Architectural] Phase 36's SC-5 gate conflicts with this plan's mandated direct audit write**

- **Found during:** Task 2 verification (`npm test`)
- **Issue:** `src/lib/audit/no-mutation-coupling.test.ts` fails with 2 offenders. Neither this plan,
  nor 37-CONTEXT, nor 37-RESEARCH, nor 37-PATTERNS mentions the gate — grepped and confirmed absent.
- **Action taken:** None. Escalated rather than resolved. See BLOCKER above.
- **Files that would be modified:** `src/lib/audit/no-mutation-coupling.test.ts` (owned by neither
  wave-1 plan)

**2. [Rule 2 — Missing critical behaviour] A formula failure during restore does not fail the restore**

- **Found during:** Task 1
- **Issue:** The plan specifies `recalculateFormulas` is called after the update but does not say what
  happens if it throws. Letting it propagate to the outer catch would return "Failed to restore deal"
  for a row that is already live — a lie to the user, and one that invites a retry loop.
- **Fix:** The recalculation sits in its own try/catch that logs and continues, matching D-05 and the
  existing `recalcCustomFields` posture elsewhere in both files.
- **Commit:** `063c2df`

**3. [Rule 2 — Missing critical behaviour] An audit-insert failure does not roll back a restore**

- **Found during:** Task 1
- **Issue:** Same shape as above — the restore has landed and the user can see it.
- **Fix:** The audit insert is in its own try/catch outside the write's. Covered by a test asserting
  `{ success: true }` plus a `console.error`. Note this is deliberately the *opposite* of the purge,
  where the audit row is inside the transaction on purpose (T-37-07).
- **Commit:** `063c2df`

**4. [Rule 1 — Bug] Test spy typing produced 7 typecheck errors and 11 lint warnings**

- **Found during:** Task 2 verification
- **Issue:** `vi.fn(() => ...)` with a zero-parameter arrow infers an empty call tuple, so every
  `mock.calls[n][0]` assertion was `TS2493`. Adding `_`-prefixed parameters fixed the types but the
  repo's ESLint has no `argsIgnorePattern`, so it traded 7 errors for 11 warnings.
- **Fix:** Annotated the spies `ReturnType<typeof vi.fn>` — the same posture the existing `mockDb`
  declarations already use in both files. Typecheck clean, lint back to its 125-warning baseline.
- **Commit:** `9629423`

**5. [Rule 3 — Blocking] Two doc comments defeated their own acceptance greps**

- **Found during:** Task 1 and Task 2 verification
- **Issue:** The acceptance criteria are literal greps. A comment reading ``No `crmBus.emit` ``
  pushed the `crmBus.emit` count from 9 to 10 ("unchanged from its pre-plan value" — verified 9 at
  `85cafea`), and a comment reading ``a fourth AuditAction literal: `'purged'` `` made the
  "returns 0" check return 1.
- **Fix:** Both comments reworded to say the same thing without the literal tokens.
- **Commits:** `063c2df`, `9629423`

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/lib/mutations/deals.test.ts src/lib/mutations/activities.test.ts` | **PASS** — 91 tests (54 pre-existing, all still green) |
| `npm run typecheck` | **PASS** — exits 0 |
| `npm run lint` | **PASS** — 0 errors, 125 warnings (baseline unchanged) |
| `grep -c 'crmBus.emit' deals.ts` | 9 — unchanged from pre-plan |
| `grep -c 'NOT_IN_TRASH'` | deals.ts 2, activities.ts 2 |
| `grep -c 'db.transaction'` | deals.ts 1, activities.ts 1 |
| `grep -c "action: \"purged\"\|'purged'"` | **0** in both |
| `grep -c '__purge'` | deals.ts 1, activities.ts 1 |
| No new `AuditAction` literal in the repo | Confirmed — both declarations still `created \| updated \| deleted` |
| `npm test` (full suite) | **FAIL — 2 tests**, both `src/lib/audit/no-mutation-coupling.test.ts`. See BLOCKER |

TDD gates: `test(...)` → `feat(...)` present for both tasks. No `refactor` commit — none was needed.

## What This Test Suite Cannot Prove

Recorded in both test file headers, and worth repeating: `db` is mocked, so a mocked `delete` cannot
exercise a real foreign key. These tests pin the SHAPE and the ORDER of the teardown. The only honest
test of the constraint behaviour — that a bare `DELETE` really does raise SQLSTATE 23503, and that
the ordered teardown really does avoid it — is `scripts/trash-checks.sql`, delivered by 37-15.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change was introduced. The
threat register's `mitigate` dispositions are all implemented and asserted:

| Threat | Where it is enforced |
|--------|----------------------|
| T-37-07 | Purge audit row inserted via `tx`, asserted by an order test and by `expect(mockDb.insert).not.toHaveBeenCalled()` |
| T-37-10 | One `audit_log` row per detached activity, asserted on the exact row array |
| T-37-15 | `isNotNull(deletedAt)` carried on the `DELETE` itself, asserted on the rendered predicate |
| T-37-16 | The ordered teardown exists; no bare `DELETE` on a parent |
| T-37-08 | `getCurrentActor()` read synchronously at function entry; a test asserts the actor is taken from the store and never from the record's `ownerId` |

**T-37-09 (accepted, restated as the plan requires):** `buildChanges` already diffs the whole previous
row on every delete, so a purged record's **full content** survives in `audit_log`. The purge
dialog's "Its change history is kept" should not be read as metadata-only — the tombstone carries the
record's field values. Not introduced by this plan, bounded by `audit.retention_days`, and
load-bearing for the log's purpose.

## Raised, Not Resolved

The detach mutates a **live** activity that the purging admin never selected. The locked purge-dialog
copy — "{name} and its notes will be permanently deleted. This can't be undone. Its change history is
kept." — does not mention this. The mitigation chosen here is the per-child audit row, so an unlinked
activity can be traced back to the deal purged out from under it. Whether the dialog copy should also
say so would require a UI-SPEC amendment and is out of this plan's scope.

## Self-Check: PASSED

Files:
- FOUND: `src/lib/mutations/deals.ts` (`restoreDealMutation` L543, `purgeDealMutation` L636)
- FOUND: `src/lib/mutations/activities.ts` (`restoreActivityMutation` L387, `purgeActivityMutation` L460)
- FOUND: `src/lib/mutations/deals.test.ts`
- FOUND: `src/lib/mutations/activities.test.ts`

Commits:
- FOUND: `b766a39` test(37-04): add failing tests for deal and activity restore
- FOUND: `063c2df` feat(37-04): add restore mutations for deals and activities
- FOUND: `d465b5c` test(37-04): add failing tests for the deal and activity purge teardown
- FOUND: `9629423` feat(37-04): add purge mutations with an ordered transactional teardown
