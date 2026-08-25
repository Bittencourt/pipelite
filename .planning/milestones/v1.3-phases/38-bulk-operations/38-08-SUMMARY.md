---
phase: 38-bulk-operations
plan: 08
subsystem: ui
tags: [react, radix, next-intl, alert-dialog, dialog, select, source-gate, vitest]

# Dependency graph
requires:
  - phase: 38-01
    provides: the `bulk` copy namespace in all three locale files (every key these dialogs call)
  - phase: 37-trash
    provides: the controlled-AlertDialog analog (`trash-table.tsx`), the destructive confirm class string, and the fail-closed `readTrashRetentionDays()` contract these dialogs must not defeat
  - phase: 44
    provides: the repo-wide `rsc-boundary.test.tsx` gate (CFUI-01) that both dialogs are shaped to satisfy
provides:
  - "BulkDeleteDialog — controlled, trigger-free, count- and retention-aware soft-delete confirmation"
  - "BulkReassignDialog — controlled, trigger-free owner reassignment form over the vendored Select"
  - "BulkOwnerOption / BulkDeleteDialogProps / BulkReassignDialogProps — the prop contracts plan 38-10 imports by name"
  - "bulk-dialogs-wiring.test.ts — a 21-assertion comment-blind source gate over both dialogs"
affects: [38-10 bulk action bar, 38-11..38-14 bulk mutations, 38-15..38-18 server pages supplying owners and retentionDays, 38-20 browser UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Controlled non-definer dialog: no trigger component in the file, caller owns `open` (CFUI-01 boundary)"
    - "Two-branch copy selection on a strict null check, with a source gate forbidding any numeric default"
    - "Reset-on-close via React's adjust-state-during-render pattern instead of a setState-in-effect"
    - "Comment-blind source gate with both a RECOGNISED and a LEFT-ALONE vocabulary table"

key-files:
  created:
    - src/components/bulk/bulk-delete-dialog.tsx
    - src/components/bulk/bulk-reassign-dialog.tsx
    - src/components/bulk/__tests__/bulk-dialogs-wiring.test.ts
  modified: []

key-decisions:
  - "The retention window is branched on `retentionDays === null` with no numeric default anywhere in the file — default in data, fail closed in code (Phase 37 T-37-05)"
  - "The owner picker is the vendored `Select`, not `EntityCombobox`, whose `EntityType` union is reused by two persisted columns and could not admit \"user\" without a schema change"
  - "The owner reset is keyed on the `open` transition and expressed as a render-time state adjustment, because this repo's React Compiler lint rule makes a synchronous setState inside an effect a build ERROR"
  - "No type-the-count gate on delete: the action is reversible, and friction proportionate to an irreversible purge would train users to click through Phase 37's purge dialog"
  - "No unassign item and no current-owner filtering: `owner_id` is NOT NULL on all four tables, and a mixed selection has no single current owner"

patterns-established:
  - "Non-definer dialog shape: a bulk dialog exports props + component only, never a trigger, so no React element crosses the RSC boundary into a Radix asChild slot"
  - "Retention-aware copy: any surface naming the trash window selects between two strings on a strict null check and is gated against `?? <number>` / `|| <number>`"
  - "Anti-vacuity source gate: non-empty proof, then a positive marker per file, then negatives, then two iterated vocabulary tables"

requirements-completed: [BULK-02, BULK-03]

# Metrics
duration: 17min
completed: 2026-08-17
---

# Phase 38 Plan 08: Bulk Dialogs Summary

**Two controlled, trigger-free `'use client'` dialogs — a count- and live-retention-aware soft-delete confirmation that refuses to invent a "30 days", and an owner reassignment form over the vendored `Select` that states in writing that nobody gets emailed — pinned by a 21-assertion comment-blind source gate.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-08-17T14:13:00Z
- **Completed:** 2026-08-17T14:29:30Z
- **Tasks:** 3
- **Files modified:** 3 created, 0 modified

## Accomplishments

- `BulkDeleteDialog` names both the record count and the **live** retention window, and says something structurally different (`deleteDialog.descriptionNoRetention`) when no window is configured. There is no `?? 30`, no `|| 30` and no other numeric default anywhere in the file, and the gate fails the build if one appears.
- `BulkReassignDialog` picks a single new owner through the vendored `Select` with a real `Label htmlFor="bulk-owner"` / `SelectTrigger id="bulk-owner"` pairing, renders `reassignDialog.noEmailNotice` directly under the field, offers no unassign item, and disables confirm until a choice exists.
- Both dialogs are controlled with **no trigger component of their own**, so neither can hand a React element across the RSC boundary into a Radix `asChild` slot. The pre-existing repo-wide `rsc-boundary.test.tsx` stays green (14 tests).
- Both refuse to close while a request is in flight, and the delete confirm prevents the default click so Radix cannot close the dialog out from under the running writes.
- All copy comes from the existing `bulk.*` keys merged in 38-01. **Zero strings were invented** and zero keys added — `locale-parity.test.ts` stays green (6 tests).
- Zero packages installed. Every primitive used (`alert-dialog`, `dialog`, `select`, `label`, `button`) was already vendored.

## Task Commits

1. **Task 1: BulkDeleteDialog** — `835428a` (feat)
2. **Task 2: BulkReassignDialog** — `be4da70` (feat)
3. **Task 3: Comment-stripped source gate over both dialogs** — `c9a21c9` (test)

## Files Created/Modified

- `src/components/bulk/bulk-delete-dialog.tsx` — controlled `AlertDialog`, no trigger; exports `BulkDeleteDialogProps` + `BulkDeleteDialog` exactly as the plan's `<interfaces>` specified.
- `src/components/bulk/bulk-reassign-dialog.tsx` — controlled `Dialog`, no trigger; exports `BulkOwnerOption`, `BulkReassignDialogProps` + `BulkReassignDialog` exactly as specified.
- `src/components/bulk/__tests__/bulk-dialogs-wiring.test.ts` — 21 assertions, all against `readStrippedSource` output; no `readFileSync` import.

**Recorded per acceptance criteria — the confirm button's exact disabled expression:**

```tsx
disabled={!ownerId || isReassigning}
```

## Decisions Made

- **The picker is the vendored `Select`.** Honoured as already-locked; no re-litigation. `EntityCombobox` routes through `searchEntities(entityType: EntityType)`, and `EntityType` is reused by two persisted columns plus `assertEntityType`, so admitting `"user"` would be a schema change.
- **`deals/page.tsx:159-163` was treated as an anti-analog and left untouched.** Its `deletedAt`-only predicate can offer a `pending_verification` or `rejected` user. The dialog documents in its `owners` prop JSDoc that the caller must filter on `deleted_at IS NULL` **AND** `status = 'approved'` — enforcement is the server pages' job (38-15..38-18) and is re-validated before the write loop (38-11..38-14). T-38-06 disposition `transfer`, as the threat register specified.
- **No comment in either dialog names a gated token.** Where the plan's own prose used a forbidden literal (`AlertDialog` in the "Dialog, not AlertDialog" rationale; `value="none"`; the picker filenames), the comment was reworded to carry the same reasoning without the token. Per the phase's standing instruction: reword the comment, never weaken the gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The specified `useEffect` owner reset is a lint ERROR in this repo**

- **Found during:** Task 2 (BulkReassignDialog)
- **Issue:** The plan specified resetting `ownerId` in an effect keyed on `open`. Written exactly as specified, `useEffect(() => { if (!open) setOwnerId("") }, [open])` produces
  `97:16 error Error: Calling setState synchronously within an effect can trigger cascading renders  react-hooks/set-state-in-effect`,
  taking `npm run lint` from 0 errors to 1 and breaking the plan's own `npm run lint` 0-errors verification gate. The three existing suppressions of this rule in the repo (`relative-time.tsx`, `profile-settings-form.tsx`, `reset-password/page.tsx`) are each explicitly logged as deferrals to a future UI phase, so a brand-new file adding a fourth would be debt created on purpose.
- **Fix:** Used React's documented adjust-state-when-a-prop-changes pattern instead of an effect:
  ```tsx
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) setOwnerId("")
  }
  ```
  The trigger and the guarantee are unchanged: it runs only on the render where `open` actually changed, and `owners` cannot reach it. `useEffect` was dropped from the imports.
- **Effect on the acceptance criterion:** "The owner-reset effect's dependency array contains `open` and does NOT contain `owners`" is now unsatisfiable as literally worded, because there is no effect. Its **intent** — the reset must never be keyed on the server-rebuilt `owners` prop, which `revalidatePath` can change mid-submit (Phase 35) — is preserved and, unlike the original criterion, is now enforced **automatically** rather than by reading: the gate asserts `wasOpen !== open` is present and that `[owners]` is absent.
- **Files modified:** `src/components/bulk/bulk-reassign-dialog.tsx`
- **Verification:** `npm run lint` back to 0 errors / 125 pre-existing warnings; `npm run typecheck` 0 errors; the gate's "keys the reset on the open transition and never on the owners array" test passes.
- **Committed in:** `be4da70` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation strengthened the plan's contract — a read-the-file criterion became an automated assertion. No scope creep; no other file touched.

## Negative Proofs (all three demonstrated and reverted)

**Proof 1 — a numeric default makes the gate red.** Temporarily changed the description branch to `days: retentionDays ?? 30`. Result: **1 test failed**, with the message

> no `?? <number>` and no `|| <number>` may appear in this file. Phase 37's rule is default in data, fail closed in code: the settings reader deliberately has no code-level fallback, so a numeric default here would make the dialog promise a window the deployment does not have: expected true to be false

Reverted; 21/21 green.

**Proof 2 — the gate is comment-blind, and a raw grep would NOT have been.** Temporarily added a comment to the reassign dialog reading
`{/* NEGATIVE PROOF 2: this comment names value="none" and an AlertDialog on purpose. */}`.
Result: the comment-blind gate **still passed 21/21**. The same file checked with a raw line-based grep (the Phase 37 approach) reported **2 spurious failures** — `AlertDialog: 1 (expected 0)` and `value="none": 1 (expected 0)`. This reproduces Phase 37's nine-collision defect exactly and demonstrates why `readStrippedSource` is mandatory rather than cosmetic. Comment removed.

**Proof 3 — a real unassign item makes the gate red.** Temporarily added `<SelectItem value="none">No owner</SelectItem>` inside `SelectContent`. Result: **2 tests failed** (the dedicated "offers no unassign item" test and the iterated LEFT-ALONE vocabulary test), with the message

> a SelectItem value="none" must not exist: owner_id is NOT NULL on all four tables and ownerId is how every list scopes visibility, so a bulk unassign would make up to a hundred records unreachable from the surface the user is standing on

Reverted; 21/21 green. Both dialogs were confirmed byte-identical to their commits afterwards (`git diff --stat` empty).

## Verification Results

| Check | Result |
|---|---|
| `vitest run src/components/bulk/__tests__/bulk-dialogs-wiring.test.ts` | 21 passed (≥12 required) |
| `vitest run "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"` | 14 passed |
| `vitest run src/messages/locale-parity.test.ts` | 6 passed |
| `npm test` (main project) | 1799 passed / 21 skipped — baseline 1778 + exactly the 21 added here |
| `npm test` (rsc project) | 8 passed — unchanged |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors / 125 warnings — identical to the wave-1 baseline |

All Task 1 and Task 2 acceptance greps were verified programmatically; every one matched its required count exactly (including `AlertDialogTrigger` 0, `retentionDays === null` 1, `descriptionNoRetention` 1, `event.preventDefault()` 1, `animate-spin` 1, the destructive class string 1, `htmlFor="bulk-owner"` 1, `id="bulk-owner"` 1, `noEmailNotice` 1, `value="none"` 0, `variant="default"` 1, and 0 for every prohibition).

## Threat Model Coverage

| Threat ID | Disposition | How it landed |
|---|---|---|
| T-38-10 | mitigate | Two separate strings on `retentionDays === null`; gate forbids any `?? <number>` / `\|\| <number>` in the file (proof 1) |
| T-38-11 | mitigate | `reassignDialog.noEmailNotice` rendered directly under the owner field; gate asserts presence |
| T-38-06 | transfer | Dialog renders what it is given; the `deleted_at IS NULL AND status = 'approved'` predicate is documented on the `owners` prop and enforced by 38-15..38-18 + re-validated by 38-11..38-14 |
| T-38-24 | mitigate | No unassign item; gate asserts absence in two independent tests (proof 3) |
| T-38-25 | mitigate | Both `onOpenChange` handlers early-return while in flight; both confirms are `disabled` in flight; delete confirm prevents the default click |
| T-38-26 | mitigate | Both files are `'use client'` with no trigger; asserted by this gate and by `rsc-boundary.test.tsx` |
| T-38-SC | accept | Zero packages installed; `node_modules` symlinked from the main checkout, never `npm install` |

No new threat surface was introduced — no endpoint, no auth path, no file access, no schema change. No `## Threat Flags` section is warranted.

## Issues Encountered

- The `react-hooks/set-state-in-effect` collision described under Deviations. Resolved without a suppression comment.
- The sandbox in this worktree refuses compound shell commands, so the acceptance-criteria greps were run through a small Node script in the scratchpad rather than a chained `grep` pipeline. Same patterns, same counts, no change to what was asserted.

## Known Stubs

None. Both dialogs are complete components. `owners` and `retentionDays` are **prop contracts by design**, not stubs: the plan explicitly assigns the queries that populate them to plans 38-15..38-18, and the plan forbids this file from querying or from calling the retention reader.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 38-10 (the bulk action bar) can import both dialogs by name right now.** The prop contracts match the plan's `<interfaces>` block character for character, including `BulkOwnerOption`.
- **Plans 38-15..38-18 owe both new props to their client components:** `retentionDays: number | null` (from `readTrashRetentionDays()`, never defaulted) and `owners: { id, name }[]` filtered on `deleted_at IS NULL` **AND** `status = 'approved'`. Do not copy `deals/page.tsx:159-163`.
- **Plan 38-20 (browser UAT) owns the rendering verification** these dialogs cannot get in tests: the no-email notice visible without scrolling, the indeterminate/spinner states, the delete dialog's two description variants, and the dialogs' behaviour at 320px.
- The one `variant="default"` button this phase is permitted has now been spent on the reassign confirm. Any later plan adding a second primary-filled button in this phase is out of contract.

## Self-Check: PASSED

- All three created files exist on disk, plus this SUMMARY.
- All three task commits exist in `git log --all`: `835428a`, `be4da70`, `c9a21c9`.
- Task 3's own acceptance greps verified on the gate file: `readStrippedSource` on 4 lines (≥2 required), `readFileSync` on 0 lines.

---
*Phase: 38-bulk-operations*
*Completed: 2026-08-17*
