---
phase: 38-bulk-operations
plan: 10
subsystem: ui
tags: [react, nextjs, tailwind, next-intl, sonner, lucide-react, blob-download, source-gate]

# Dependency graph
requires:
  - phase: 38-bulk-operations (plan 38-01)
    provides: the 43-key `bulk.*` copy namespace in all three locales, plus REQUIRED_BULK_KEYS in locale-parity.test.ts
  - phase: 38-bulk-operations (plan 38-06)
    provides: BULK_MAX_IDS in src/lib/bulk/limits.ts and the closed BulkWriteResult / BulkOutcome / BulkErrorCode vocabulary in src/lib/bulk/types.ts
  - phase: 38-bulk-operations (plan 38-08)
    provides: BulkDeleteDialog and BulkReassignDialog, both controlled with no trigger of their own
  - phase: 37-trash
    provides: src/lib/trash/entity-types.ts (ENTITY_TO_TRASH_TAB, the client-safe sibling of the trash dispatch) and the trash-table.tsx toast idiom
  - phase: 34-export
    provides: the ExportResult shape and export-form.tsx's downloadFile helper pattern
provides:
  - BulkActionBar — the single integration point all four list surfaces mount, with the exact prop contract plans 38-15..38-18 consume
  - the fixed z-[60] bar, its h-20 in-flow spacer, and the five labelled controls
  - the in-flight state machine (one `pending` value), the advisory over-cap state, and the Escape-to-clear binding
  - the three action handlers with submit-time label capture and per-outcome toast severity
  - client-side CSV download using the server-generated filename, with no new route handler
  - a 24-test comment-blind source gate pinning layering against the measured ShortcutsHint z-index
affects: [38-15, 38-16, 38-17, 38-18, 38-20, 38-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Arbitrary-value z-index measured against a sibling fixed element's own source, asserted by a gate rather than copied into a comment"
    - "One `pending: null | 'delete' | 'reassign' | 'export'` value instead of three booleans, because one action at a time is the contract"
    - "Submit-time labelById capture (38-RESEARCH Pattern 3) so a record that no longer exists can still be named"
    - "Whole-call rejection switched on a closed error code; no arm renders server text"
    - "Escape bound through a document keydown listener registered in an effect, gated in the handler, so Radix keeps ownership while a dialog is open"

key-files:
  created:
    - src/components/bulk/bulk-action-bar.tsx
    - src/components/bulk/__tests__/bulk-action-bar-wiring.test.ts
  modified: []

key-decisions:
  - "The Trash deep link uses ?type=, not the plan's ?tab= — trash/page.tsx reads searchParams.type through parseTrashTab, which falls back to the default tab, so ?tab= would have silently landed on Deals for three of the four entity types"
  - "z-[60] measured against ShortcutsHint's z-50, and the gate reads that 50 from the hint's own source rather than hard-coding it"
  - "The dialog closes on confirm through the `finally` block, so success, whole-call rejection and a thrown request all converge on one close"
  - "The export handler captures ids but NOT labelById: it produces no BulkOutcome, so the map would be an unused local and a new lint warning"
  - "<Toaster /> left untouched (D-23); the gate asserts it carries no position prop so a future workaround edit fails loudly"

patterns-established:
  - "Layering gate: extract both z-index numbers from source and assert strict inequality, so either side moving goes red"
  - "Forbidden-hotkey vocabulary table, both quote flavours, iterated — the destructive-repurposing hazard is asserted rather than commented"

requirements-completed: [BULK-02, BULK-03, BULK-04]

# Metrics
duration: 82min
completed: 2026-08-17
---

# Phase 38 Plan 10: The Bulk Action Bar Summary

**One fixed `z-[60]` bulk action bar with an `h-20` spacer, five labelled non-filled controls, a single-slot in-flight state, an advisory `BULK_MAX_IDS` mirror, three handlers with submit-time label capture and per-outcome toast severity, a client-side CSV Blob download, and a 24-test comment-blind gate that pins the layering against `ShortcutsHint`'s own measured z-index.**

## Performance

- **Duration:** 82 min
- **Started:** 2026-08-17T13:36:00Z
- **Completed:** 2026-08-17T14:58:34Z
- **Tasks:** 3
- **Files modified:** 2 (both created)

## Accomplishments

- `BulkActionBar` emits the exact prop contract plans 38-15..38-18 mount, and returns `null` at zero selection so neither the bar nor its spacer exists in the DOM.
- The bar layers above every other fixed element in the app. `ShortcutsHint` is `fixed bottom-0 … z-50` for the first ten seconds of any session whose dismissal flag is unset, so the plan's D-22 correction was applied and is now **asserted against the hint's own source** rather than trusted: observed **bar 60 vs hint 50**.
- The 320px contract (`max-w-[calc(100%-2rem)]` + `flex-wrap`) is in place and gated, so a `fixed` element cannot contribute to `document.scrollWidth` — Phase 37's 37-UAT-G5 lesson applied before the defect.
- All three handlers capture `labelById` at submit time, and every outcome reports distinctly: full success, partial (warning + report), total per-record failure (error + report), whole-call rejection (error, selection intact, no report).
- The CSV downloads client-side through a local Blob/objectURL helper, using the server-generated filename. Zero new route handlers, zero new packages.
- Full suite went 1835 → 1859 passed (+24, exactly the new gate), 21 skipped unchanged, rsc 8 unchanged, typecheck 0, lint 0 errors / 125 warnings (the pre-existing baseline).

## Task Commits

1. **Task 1: The bar shell, its spacer, and the four controls** — `c88884f` (feat)
2. **Task 2: The three action handlers, the toasts, and the CSV download** — `3c9e807` (feat)
3. **Task 3: Comment-stripped source gate for the bar** — `069998c` (test)

## Files Created/Modified

- `src/components/bulk/bulk-action-bar.tsx` — the fixed bar, its `h-20` spacer, the five controls, the over-cap state, both dialogs, the three handlers, and the CSV download. 475 lines.
- `src/components/bulk/__tests__/bulk-action-bar-wiring.test.ts` — 24-test comment-blind source gate. 445 lines.

## The five resolved control copy keys

Read from the JSX, in left-to-right order. Every one carries a visible text label; there are no icon-only controls.

| # | Control | Variant | Icon | Resolved copy key | Progress key while acting |
|---|---------|---------|------|-------------------|---------------------------|
| 1 | Count | `<span>` Label 14/600 | none | `bulk.selected` | — |
| 2 | Reassign owner | `outline` `sm` | `UserPen h-4 w-4` | `bulk.reassignOwner` | `bulk.reassignDialog.reassigning` |
| 3 | Export CSV | `outline` `sm` | `Download h-4 w-4` | `bulk.exportCsv` | `bulk.exporting` |
| 4 | Delete | `ghost` `sm` + `text-destructive hover:text-destructive` | `Trash2 h-4 w-4` | `bulk.delete` | `bulk.deleteDialog.deleting` |
| 5 | Clear selection | `ghost` `sm` | `X h-4 w-4` | `bulk.clearSelection` | — (never busy-labelled) |

Over-cap line: `bulk.error.tooMany` in `text-xs text-destructive`, rendered immediately after the count span. The three action controls are `disabled={busy || overCap}`; `Clear selection` is `disabled={busy}` only.

## Every useEffect in the file, with its dependency array

There is exactly **one**:

```
useEffect(() => { … document keydown listener … }, [hasSelection, busy, deleteOpen, reassignOpen, onClear])
```

- `hasSelection` is a boolean derived from `selectedIds.length`, not the array itself.
- No dependency is a server-supplied array. T-38-33 holds: Phase 35 measured that `revalidatePath` re-renders the current client tree regardless of the path argument, and every bulk action calls it, so an effect keyed on `data`/`selectedIds`/`owners` would fire mid-action and wipe the failed-id selection SC-3 requires to survive. Succeeded ids are removed explicitly by the caller from `onOutcome`.
- The effect registers a listener; it performs no state update, so `react-hooks/set-state-in-effect` (an ERROR in this repo) is not engaged.

## Negative proofs (three demonstrated, all reverted; `git diff --stat` confirmed empty afterwards)

**Proof 1 — lower layer.** `z-[60]` → `z-30`. **4 tests failed.** Message recorded:

> the bar must declare z-[60]. Anything on the plain Tailwind scale collides with the global keyboard-shortcuts hint, which is fixed to the bottom of the viewport at its own layer for the first ten seconds of a fresh session

Plus the RECOGNISED table (`z-[60]` missing) and the LEFT-ALONE table (`z-30` present).

**Proof 1b — the measured comparison, run separately** with `z-[40]` so the arbitrary-value regex still matched. Message recorded, and this is where **both observed numbers** come from:

> the bar's layer (**40**) must be strictly greater than the shortcuts hint's (**50**). The hint is mounted globally in the root layout as a fixed bottom-0 element for the first ten seconds of any session whose dismissal flag is unset, so a bar at or below its layer renders BEHIND it — unreachable exactly when a new user first tries a bulk action, and unreachable specifically for the destructive control (T-38-31)

With the real value restored the comparison reads **60 > 50**, and the 50 is read from `shortcuts-hint.tsx` at test time, not copied.

**Proof 2 — removed width cap.** `max-w-[calc(100%-2rem)]` deleted from the class string. **2 tests failed.** Message recorded:

> the bar must cap its own width. A `fixed` element that exceeds the viewport STILL contributes to document.scrollWidth, so an uncapped bar gives every list page a horizontal scrollbar at narrow widths — the defect Phase 37 measured and this contract exists to prevent

**Proof 3 — comment-blindness.** A comment reading `// PROOF 3 SCRATCH: ExportFilters z-30 bg-destructive DropdownMenu api/export` was inserted into the bar. **All 24 tests still passed.** Five separately-gated tokens in prose changed nothing, which is the property the twelfth comment/grep collision of phases 37-38 would otherwise have cost. Comment removed.

## Decisions Made

- **`?type=`, not `?tab=`.** See Deviations #1. The map is the plan's; only the parameter name changed.
- **`z-[60]` asserted, not commented.** The gate reads `shortcuts-hint.tsx`, extracts its `z-` class and asserts strict inequality. A hard-coded 50 in the test would rot silently the day the hint changes; reading it means either side moving turns the gate red.
- **The dialog closes in `finally`.** The plan specified "close the dialog" on both the success and rejection arms. Putting `setDeleteOpen(false)` in `finally` covers those plus a thrown request, and the UI-SPEC's rule is unconditional ("the dialog closes on confirm"). Radix's own `onOpenChange` still refuses to close while `isDeleting`, so Escape and an overlay click cannot abandon in-flight writes; only this explicit set closes it.
- **A `catch` on each handler.** Not in the plan, but a server action is a network call and a throw would otherwise leave `pending` set and the bar permanently disabled. Each `catch` reports the same fallback sentence the whole-call rejection uses, and `finally` always releases `pending`. (Rule 2 — missing error handling.)
- **`const [, startTransition] = useTransition()`.** The repo's established idiom is `useTransition` (`trash-table.tsx:78`); the bar tracks its own `pending`, so the `isPending` slot is deliberately unread rather than replaced with a different mechanism.
- **`max ?? BULK_MAX_IDS` is not a numeric default.** The delete dialog's gate forbids `?? <number>` in that file; here the fallback is the shared constant, so the copy still cannot drift from the guard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The Trash deep link used a query parameter nothing reads**

- **Found during:** Task 2 (the three action handlers)
- **Issue:** The plan and its acceptance criterion specified `/trash?tab=${ENTITY_TO_TRASH_TAB[entityType]}`, and the acceptance criterion required the link to contain `?tab=`. But `src/app/trash/page.tsx:49,59` declares `searchParams: Promise<{ type?: string; page?: string }>` and calls `parseTrashTab(params.type)`, and `parseTrashTab` returns `DEFAULT_TRASH_TAB` (`"deals"`) for anything it does not recognise — including `undefined`. `trash-table.tsx:427` and `trash-tabs.tsx` both write `?type=`. So `?tab=people` would have loaded the **Deals** tab: a wrong destination for three of the four entity types, on the single link through which SC-2 ("records are actually in `/trash` under the right tab") is meant to be a one-click check rather than a hunt.
- **Fix:** The link is `/trash?type=${ENTITY_TO_TRASH_TAB[entityType]}`. The map is unchanged and is still the shared one. A comment at the call site names the plan's spelling, the parser's behaviour and the consequence, so the next reader does not "correct" it back.
- **Files modified:** `src/components/bulk/bulk-action-bar.tsx`
- **Verification:** The gate asserts `?type=` is present AND `?tab=` is absent (two assertions, plus `?type=` in RECOGNISED and `?tab=` in LEFT_ALONE), so a revert to the plan's spelling fails four times.
- **Committed in:** `3c9e807` (Task 2 commit; also stated in that commit message)

### Acceptance criteria interpreted rather than met literally

Neither is a code change; both are recorded so a verifier does not read them as gaps.

**2. `grep -c 'ENTITY_TO_TRASH_TAB'` is 2, not the criterion's 1.** The token necessarily appears on two lines: the import (line 58) and the single use in the deep link. `grep -c` counts matching **lines**, so 1 is unreachable for any imported symbol that is also used. There is exactly one use site, which is the criterion's evident intent. The same arithmetic applies to `BULK_MAX_IDS` (3 lines: import, `overCap`, `tooMany`), where the criterion correctly says "at least 2".

**3. The export handler captures `ids` but not `labelById`.** The plan's "shared preamble for all three" includes the label map, but the export path produces no `BulkOutcome` and renders no failure report, so the map has no consumer. An unused local would have added a `@typescript-eslint/no-unused-vars` warning above the 125-warning baseline. `Object.fromEntries` is present once (in the shared `captureLabels`, called by both write handlers before their `await`), satisfying the criterion.

---

**Total deviations:** 1 auto-fixed (1 bug), plus 1 unplanned hardening (`catch` blocks, Rule 2) and 2 criteria interpretations.
**Impact on plan:** The bug fix is confined to one query-parameter name and is now gated in both directions. No scope creep; no file outside the plan's `files_modified` was touched.

## Issues Encountered

- **A transient lint warning across the Task 1 commit.** `entityType` is destructured for the deep link, which lands in Task 2, so the Task 1 commit carried one extra `no-unused-vars` warning (126 vs the 125 baseline). Resolved by Task 2; the final count is exactly 125 with 0 errors. Recorded rather than avoided, because the alternative was to move the deep link into Task 1 and blur the commit boundary the plan drew.
- **No comment/grep collision this time.** The forbidden-token list was checked against the source before the gate was written, and every hazardous identifier (`bg-destructive`, `DropdownMenu`, `Tooltip`, the export option types, `api/export`, the plain-scale `z-` classes) was deliberately paraphrased in prose — e.g. "an overflow menu", "no hover-only hint primitive is vendored", "at its own layer". Proof 3 then demonstrated the gate would have survived a collision anyway.

## Known Stubs

None. Every branch of every handler reports an outcome, and no control renders placeholder data. The bar is not yet **mounted** anywhere — that is plans 38-15..38-18 by design, and `onDelete` / `onReassign` / `onExport` are props precisely so the server actions (38-11..38-14) and the mount sites can land independently.

## Threat Flags

None. The bar introduces no network endpoint, no auth path, no file access and no schema change. Its export surface is `ids` only and is gated at the source level (T-38-01); the cap mirror is explicitly advisory with the server as the enforcement (T-38-03); the whole-call `switch` renders no server-supplied text (T-38-07); `Escape` is the only new binding and the forbidden-hotkey table is iterated (T-38-30); the layering is asserted against a measured value (T-38-31); every outcome branch reports (T-38-32); and no effect is keyed on a server-supplied array (T-38-33). Zero packages installed (T-38-SC).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Ready for 38-15..38-18 (the four mount sites).** The prop contract is exactly as `<interfaces>` specified, with one interface-level note: `BulkOwnerOption` is re-exported through `bulk-reassign-dialog.tsx`, so a mount site imports it from there.
- **Ready for 38-09 (`BulkFailureReport`).** `onOutcome` fires on every success arm — including the zero-succeeded one — carrying `kind`, `succeeded`, `failed` and `labelById`, which is the full input the report needs. The bar deliberately does not render the report itself; it is placed above the table by the mount site, per UI-SPEC Surface 7.
- **Ready for 38-20 (browser UAT).** Three checklist items can only be closed in a browser and are explicitly left to it: the bar's own `scrollWidth === clientWidth` at 320px in a same-origin iframe (measured on the bar, NOT the document — the app `<header>`'s pre-existing 37-UAT-G5 overflow must not be attributed here); focus landing on the table wrapper rather than `<body>` after a full-success unmount; and the layering verified visually on a fresh profile within the hint's ten-second window.
- **One thing a mount site must not forget:** the bar renders its own `h-20` spacer, so it must be mounted as the **last** element of the list's stack. Mounted higher, the spacer inserts 80px in the middle of the page.

## Self-Check: PASSED

- `src/components/bulk/bulk-action-bar.tsx` — FOUND (475 lines)
- `src/components/bulk/__tests__/bulk-action-bar-wiring.test.ts` — FOUND (445 lines)
- `.planning/phases/38-bulk-operations/38-10-SUMMARY.md` — FOUND
- commit `c88884f` — FOUND
- commit `3c9e807` — FOUND
- commit `069998c` — FOUND
- `git status --porcelain src/app/layout.tsx src/components/keyboard/shortcuts-hint.tsx` — empty
- `git diff --stat` after the three reverted negative proofs — empty

---
*Phase: 38-bulk-operations*
*Completed: 2026-08-17*
