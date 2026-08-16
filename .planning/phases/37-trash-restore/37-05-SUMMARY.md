---
phase: 37-trash-restore
plan: 05
subsystem: database
tags: [drizzle, postgres, soft-delete, audit-log, transactions, formula-recalc, vitest]

# Dependency graph
requires:
  - phase: 34-formula-fields
    provides: recalculateFormulas, ENTITY_NATIVE_ATTRIBUTES, CHANGED_FIELDS_CUSTOM_SENTINEL, the cascade
  - phase: 36-audit-log
    provides: audit_log schema, getCurrentActor/AuditActor, the direct-insert shape
provides:
  - restorePersonMutation and purgePersonMutation
  - restoreOrganizationMutation and purgeOrganizationMutation
  - the ordered purge teardown for the two parent CRM entities (detach, never destroy)
  - a per-function SC-5 no-coupling gate that admits event-less audit writers
affects: [37-06 dispatch, 37-07 server actions, 37-11 REST routes, 37-14 retention pruner, 37-15 trash-checks.sql]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Restore = one UPDATE clearing deletedAt + a broad recalculation + a directly-written audit row"
    - "Purge = one db.transaction: notes, detach children with .returning(), audit each unlink, delete, purge row"
    - "A purge is marked by `__purge` in `changes`, not by a fourth AuditAction literal"

key-files:
  created: []
  modified:
    - src/lib/mutations/people.ts
    - src/lib/mutations/people.test.ts
    - src/lib/mutations/organizations.ts
    - src/lib/mutations/organizations.test.ts
    - src/lib/audit/no-mutation-coupling.test.ts

key-decisions:
  - "Purge DETACHES live children rather than destroying them; every FK into the CRM tables is ON DELETE NO ACTION, so a bare DELETE raises SQLSTATE 23503"
  - "Restore passes changedFields = [CHANGED_FIELDS_CUSTOM_SENTINEL, ...Object.values(ENTITY_NATIVE_ATTRIBUTES[entity])]; an empty list or ['deletedAt'] evaluates zero formulas silently"
  - "Phase 36's SC-5 no-coupling gate was narrowed from per-file to per-function rather than deleted, because Phase 37's no-restore-event decision makes a mutation-layer audit write unavoidable"
  - "A recalculation failure and an audit-insert failure are both logged, never propagated: neither may roll back a restore the user can already see"

patterns-established:
  - "Event-less audit writer: a mutation that emits nothing on the bus writes its own audit_log row, with the actor captured synchronously at function entry"
  - "Purge audit trail: one audit_log row per detached child, inside the same transaction as the delete"

requirements-completed: [TRASH-02, TRASH-03]

# Metrics
duration: 42min
completed: 2026-08-16
---

# Phase 37 Plan 05: People & Organizations Restore/Purge Summary

**Restore and purge for the two parent CRM entities: restore clears `deleted_at` and re-runs the formula cascade top-down, purge is a single transaction that detaches `deals.person_id`, `deals.organization_id` and `people.organization_id`, audits every unlink, then deletes the row.**

## Performance

- **Duration:** ~42 min
- **Started:** 2026-08-16T14:07:00Z
- **Completed:** 2026-08-16T14:49:00Z
- **Tasks:** 2 (both TDD, RED → GREEN)
- **Files modified:** 5

## Accomplishments

- `restorePersonMutation` / `restoreOrganizationMutation`: one `UPDATE` setting exactly `{ deletedAt: null, updatedAt }`, an `isNotNull` existence check, the discriminated `"NOT_IN_TRASH"` miss code, a broad recalculation **after** the write, and a directly-written `audit_log` row. No bus event.
- `purgePersonMutation` / `purgeOrganizationMutation`: one `db.transaction` running notes → detach children (`.returning()`) → one audit row per unlink → delete the row (with `isNotNull` on the DELETE predicate itself) → the `__purge` audit row, all inside the transaction.
- The organization purge detaches **two** child tables and returns their summed `detached` count — the widest teardown in the phase.
- All four entity types now expose an identical restore/purge signature pair once plan 37-04 lands its half.
- 41 new tests (21 restore, 20 purge), asserting call **order** via `mock.invocationCallOrder` and the recalculation **argument** against the real `ENTITY_NATIVE_ATTRIBUTES` import.

## Task Commits

1. **Task 1: restore mutations (RED)** — `c82b31b` (test)
2. **Task 1: restore mutations (GREEN)** — `5cf0e2c` (feat)
3. **Task 2: purge teardown (RED)** — `3d0d283` (test)
4. **Task 2: purge teardown (GREEN)** — `49325c1` (feat)
5. **Deviation: SC-5 gate narrowing** — `86ee13f` (test)

## Files Created/Modified

- `src/lib/mutations/people.ts` — `restorePersonMutation`, `purgePersonMutation`, the `auditActorColumns` helper and the `PURGE_MARKER` constant
- `src/lib/mutations/people.test.ts` — `describe("restorePersonMutation")` and `describe("purgePersonMutation")`, plus `delete`/`transaction` on the `@/db` mock and a mock for `@/lib/audit/actor-context`
- `src/lib/mutations/organizations.ts` — `restoreOrganizationMutation`, `purgeOrganizationMutation`, same two helpers
- `src/lib/mutations/organizations.test.ts` — the matching two describe blocks
- `src/lib/audit/no-mutation-coupling.test.ts` — Phase 36's SC-5 gate, narrowed from per-file to per-function (see Deviations)

## Decisions Made

- **Recalculation and audit failures are contained, not propagated.** Both are wrapped in their own `try`/`catch` inside the restore's outer one. D-05 already forbids formula machinery blocking a user's write, and by the time either runs the `UPDATE` has landed — failing the restore would report a false negative for work the user can already see in the list. The plan mandated this for the audit insert; extending it to the recalculation is the same argument (Rule 2).
- **The detach audit rows for an organization are two inserts, not one.** One per child kind, each skipped entirely when its list is empty. This falls out of the "zero detached children produces no empty insert call" requirement without a conditional array concat.
- **`PURGE_MARKER` is a module constant** in both files rather than an inline literal, so the marker a future reader greps for has exactly one spelling per module.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Phase 36's SC-5 no-coupling gate forbids exactly what this plan mandates**

- **Found during:** Post-Task-2 full-suite verification
- **Issue:** `src/lib/audit/no-mutation-coupling.test.ts` asserts mechanically that **no** file under `src/lib/mutations/` references the audit layer in any shape — imports, the `auditLog` table, `getCurrentActor(`, or an `Audit*` type. It encodes Phase 36's SC-5: "audit capture required no edit to any mutation function." Two of its tests went red the moment `people.ts` and `organizations.ts` imported `auditLog`.

  This is not a mistake in either phase. Phase 37's CONTEXT.md locks that **no** new CRM bus event type is introduced (a `{entity}.restored` event means workflow-trigger UI work belonging to a later phase, and re-emitting `{entity}.created` would be a lie to every subscriber). With no event, there is nothing for the subscriber to hang off, so the restore/purge audit row **must** be written by the mutation. 37-RESEARCH.md § Pattern 1 states this outright. The only alternative is an unaudited purge — precisely the evidence the audit log exists to keep. Neither the plan nor the research identified this gate file.
- **Fix:** Narrowed the gate rather than deleting or blanket-exempting it. The whole-file negative assertion still runs verbatim over every module without an event-less writer. For a carve-out file, four checks replace it:
  1. the carve-out set is non-empty (anti-vacuity), and so is the remaining whole-file set;
  2. a carve-out file must still be a CRM mutation module that emits on the bus;
  3. its audit vocabulary is pinned to the table plus the actor read — `buildChanges`, `runWithActor`, `startAuditPruner` and `readRetentionDays` stay forbidden, and `@/lib/audit/actor-context` is the only importable audit module (`prune`, `diff`, `settings`, `present` are not);
  4. **every** `create`/`update`/`delete` mutation in the file is sliced out by declaration and asserted uncoupled **individually** — which is the actual content of SC-5, now checked per function instead of per file.

  A fifth test pins the slicer itself on a fixture, so a slicer that widened to the enclosing module could not quietly make check 4 meaningless. The slicer returns `""` on a missing anchor and every caller asserts non-empty by name first, per the WR-13 discipline the gate's own header mandates.
- **Files modified:** `src/lib/audit/no-mutation-coupling.test.ts`
- **Verification:** Injected `await db.insert(auditLog).values(...)` into `deletePersonMutation` and confirmed the gate goes red naming that exact function, then reverted. 29/29 tests in the file pass; the full suite is 1384 + 8 green.
- **Committed in:** `86ee13f`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep. The gate is strictly stronger inside a carve-out file than it was before (per-function instead of per-file) and unchanged everywhere else.

## Issues Encountered

- **Coordination risk with the wave-1 sibling 37-04.** That plan adds the same event-less audit writes to `deals.ts` and `activities.ts`, so it will hit the identical SC-5 failure. The narrowing committed here is deliberately **entity-agnostic** — it keys off `export async function (restore|purge)*Mutation` rather than a filename list — so it already covers 37-04's two files and the suite will be green after the merge whether or not 37-04 touched the gate. If 37-04 edited the same file, expect a textual conflict in `no-mutation-coupling.test.ts` whose resolution is "keep one copy of the narrowing".
- **A mocked `db.delete` cannot exercise a real foreign key.** Both test files carry a header note saying so. The purge tests pin the *order* and *shape* of the teardown; `scripts/trash-checks.sql` (plan 37-15) remains the only honest test that the constraint behaviour is right.

## Known Stubs

None. Both mutation pairs are fully wired; nothing returns placeholder data.

## Threat Flags

None. The plan's `<threat_model>` covers every surface touched: T-37-07 (purge audit row inside the transaction), T-37-10 (one audit row per detached child), T-37-15 (`isNotNull` on the delete predicate), T-37-16 (the teardown itself), T-37-08 (synchronous actor capture). No new network endpoint, auth path, file access or schema change was introduced — this plan is mutation-layer only and adds no migration.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The mutation layer is complete for people and organizations. Plan 37-06's dispatch can treat all four entity types interchangeably: `restore{Entity}Mutation(id) => { success } | { success: false, error: "NOT_IN_TRASH" }` and `purge{Entity}Mutation(id) => { success, detached } | { success: false, error }`.
- Ownership and admin gating are **not** implemented here, by design — the mutation layer only checks entity existence. Plan 37-07 (server actions) and 37-11 (REST routes) own the `session.user.role !== "admin"` gate on purge.
- Plan 37-14's retention pruner should call `purge{Entity}Mutation` directly and process leaves-first (activities → deals → people → organizations), so a parent is never purged while a sibling pass is still detaching from it.
- Plan 37-15's `scripts/trash-checks.sql` still owes the real constraint assertions; the unit tests here deliberately do not claim to cover them.

---
*Phase: 37-trash-restore*
*Completed: 2026-08-16*
