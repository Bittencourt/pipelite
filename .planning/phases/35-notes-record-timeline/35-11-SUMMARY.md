---
phase: 35-notes-record-timeline
plan: 11
subsystem: ui-components
tags: [react, client-components, next-intl, radix, shadcn, alert-dialog, optimistic-ui, accessibility, cfui-01, notes]

# Dependency graph
requires: ["35-02", "35-05", "35-09"]
provides:
  - "`DeleteNoteDialog({ open, onOpenChange, noteId, onDeleted })` — controlled, non-definer AlertDialog confirmation"
  - "`NoteEntry({ entry, canManage, onUpdated, onDeleted })` — note row with inline edit, delete trigger, edited marker and Migrated badge"
  - "`NoteComposer({ entityType, entityId, onAdded })` — textarea composer with Cmd/Ctrl+Enter submit and draft retention on failure"
  - "The `src/components/timeline/` directory, created here for plans 35-12 through 35-15"
affects: [35-12, 35-13, 35-14, 35-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deliberate CFUI-01 non-definer: a dialog that takes `open`/`onOpenChange` and renders no trigger stays out of the gate's definer set entirely, so the rule never engages for it or for anything that renders it"
    - "Nullable optimistic override (`optimisticContent: string | null`) instead of a mirrored copy of the prop: the server entry flows up through `onUpdated` and back down as a prop, and clearing the override lets it REPLACE local state rather than be merged into it"
    - "aria-live reset-then-set, so a second identical announcement still speaks"
    - "Native `title` for the Migrated badge hint, because `tooltip.tsx` is not vendored and `components.json` declares an empty `registries` object"

key-files:
  created:
    - src/components/timeline/delete-note-dialog.tsx
    - src/components/timeline/note-entry.tsx
    - src/components/timeline/note-composer.tsx
  modified: []

key-decisions:
  - "`DeleteNoteDialog` accepts no child element and renders no `AlertDialogTrigger`, grep-verified to zero occurrences of both, which is what keeps it out of the CFUI-01 definer set rather than merely on the right side of the rule"
  - "The `edited` marker is derived inline from `updatedAt.getTime() > createdAt.getTime()`; `NoteTimelineEntry` carries no stored boolean that could drift from the timestamps it describes"
  - "The inline `Save note` button is `variant=\"outline\"`, not `default`, because the UI-SPEC reserves `--primary` fill for the composer's `Add note` as the single filled element in the timeline card"
  - "The composer's sr-only `Label` reuses `notes.composerPlaceholder` rather than inventing a new key, which would have required edits to all three locale files"
  - "`getInitials` is copied byte-for-byte from `deal-card.tsx` (a fourth copy) and is never called for a null author, because its signature requires an email and an empty string would render meaningless initials"
  - "`DeleteNoteDialog` is mounted inside the `canManage` guard, so a non-manageable row does not mount a dialog it can never open"
  - "The word `dangerouslySetInnerHTML` was removed even from prose in `note-entry.tsx`, because the T-35-05 gate is a raw grep and a comment would have tripped it"

patterns-established:
  - "Failure handling triple used identically in all three files: a `success: false` result and a thrown action land in the same handler, and neither one touches the user's text"
  - "Client components own their own dialogs; nothing in this phase hands a trigger element across the RSC boundary"

requirements-completed: [NOTE-01, NOTE-03]

# Metrics
duration: 21min
completed: 2026-08-15
---

# Phase 35 Plan 11: Note Composer, Note Row and Delete Dialog Summary

**The three mutating components of the notes timeline now exist as client modules: a composer that never loses the user's text on failure, a note row that edits in place and derives its `edited` marker from the timestamps rather than a stored flag, and a delete confirmation built as a deliberate CFUI-01 non-definer so the repo-wide asChild gate can never engage for it.**

## Performance

- **Duration:** ~21 min
- **Tasks:** 3
- **Files created:** 3
- **Tests:** no new tests; the full suite stays green at 1016 passed / 4 skipped plus 8 RSC, and the CFUI-01 gate passes 14/14 after each new `.tsx`

## Accomplishments

### Task 1 — `delete-note-dialog.tsx` (`62b516d`)

A controlled `AlertDialog` copied structurally from `src/app/admin/webhooks/delete-dialog.tsx`. It takes `open` / `onOpenChange` / `noteId` / `onDeleted` and renders neither a trigger nor a forwarded child element — grep-verified to zero occurrences of `AlertDialogTrigger` and zero occurrences of `children`. That is not incidental: it is what keeps the file out of the definer set the Phase 44 gate builds, so the rule never has to be reasoned about for any future caller.

Copy comes entirely from the `notes` namespace: **Keep note** to dismiss and **Delete note** to confirm, never a bare `Cancel` / `Confirm` / `OK`. The confirm button carries the exact `bg-destructive text-destructive-foreground hover:bg-destructive/90` class string and a `Loader2 animate-spin` while in flight. Success is silent by design — the row disappearing is the confirmation — and only the failure path toasts, leaving the dialog open so the user can retry.

### Task 2 — `note-entry.tsx` (`afbb177`)

The row skeleton the UI-SPEC specifies: a `w-8 shrink-0` rail holding a `size-8` avatar, a `flex-1 min-w-0` content column whose first line is `flex flex-wrap items-center gap-2`, and a `shrink-0` action column.

- The body is a `<p className="text-sm leading-normal break-words whitespace-pre-wrap">` holding a React **text** child. Raw-HTML injection is grep-gated to zero occurrences (T-35-05).
- The `edited` marker sits behind `entry.updatedAt.getTime() > entry.createdAt.getTime()`.
- Migrated notes get `<Badge variant="secondary">` with a **native** `title` from `notes.migratedTooltip`; no Tooltip component is imported.
- The timestamp is a `<time dateTime={iso} title={absolute}>` wrapping the existing `RelativeTime`, whose SSR/CSR hydration guard and its load-bearing eslint-disable were left untouched (D-02).
- A null author renders `notes.unknownAuthor` with an initial-less avatar; `getInitials` is never called with an empty email.
- Inline edit swaps the paragraph for a textarea plus **Cancel edit** / **Save note** at `size="sm"`. The save is optimistic through a nullable override that is cleared on both outcomes: on success so the server's entry replaces it, on failure so the previous text is restored alongside `toast.error(notes.error.editFailed)`.
- Edit and Delete render only under `canManage`, and a module-level comment records that this is cosmetic — enforcement is `isAuthorOrAdmin` in `editNote`/`deleteNote` (35-09) and in the v1 routes (35-10) (T-35-03).

### Task 3 — `note-composer.tsx` (`40f8e15`)

An sr-only `Label` bound by `useId` to a `min-h-16` textarea, a right-aligned `mt-2 gap-2` row holding the single primary-filled **Add note** button, and an `aria-live="polite"` sr-only region.

All four interaction states from the spec are implemented: the button is disabled on an empty or whitespace-only draft (the disabled state is the message, no validation text); `Cmd/Ctrl+Enter` submits while a bare `Enter` still inserts a newline, because `preventDefault` fires only in the combined case; submitting shows `Loader2 animate-spin` with `notes.adding` and disables the textarea; success clears the draft, calls `onAdded` with the hydrated entry from 35-09, and announces `notes.announceAdded` with no toast. The draft is cleared in exactly one place — inside the success branch — so both a `success: false` result and a thrown action retain the user's text (T-31 / T-35-31).

The announcement is reset to `""` before each submit, because an `aria-live` region only speaks when its content actually changes and setting the identical string twice would be silent on the second add.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `dangerouslySetInnerHTML` appeared in prose and tripped its own gate**

- **Found during:** Task 2
- **Issue:** The module comment explaining *why* raw HTML must never be used contained the literal token, and the plan's verification is a raw `grep -c ... -eq 0`. The file failed its own safety gate while being maximally safe.
- **Fix:** Reworded the comment to "Raw-HTML injection props must never appear in this file — it is grep-gated to zero occurrences". The warning survives; the token does not.
- **Files modified:** `src/components/timeline/note-entry.tsx`
- **Commit:** `afbb177`

**2. [Rule 2 - Missing critical] `catch` arms added to all three action calls**

- **Found during:** Tasks 1-3
- **Issue:** The plan describes `success: false` handling; a thrown server action (network failure, a Next.js action-boundary error) would have produced an unhandled rejection, a permanently stuck `isPending`, and — in the composer — a frozen textarea holding text the user could not resubmit.
- **Fix:** Every call site wraps the action in `try`/`catch` and routes both outcomes to the identical handler, which is what the plan's own "handle a false result and a thrown error identically" instruction requires.
- **Files modified:** all three new files
- **Commits:** `62b516d`, `afbb177`, `40f8e15`

### Intentional Interpretations

- **`DeleteNoteDialog` moved inside the `canManage` guard.** The plan places it unconditionally in the row. Mounting a closed dialog for every note a user cannot manage is pointless work, and the guard changes no observable behaviour because only the guarded Trash button can open it.
- **Inline `Save note` is `variant="outline"`.** The plan does not name a variant; the UI-SPEC Color section reserves `--primary` fill for the composer's Add note as *the only filled button inside the timeline card*, so `default` would have violated the design contract.
- **The composer's sr-only label text is `notes.composerPlaceholder`.** No dedicated label key exists in the namespace 35-02 shipped, and adding one would have required matching edits to `es-ES.json` and `pt-BR.json` for a string no sighted user ever sees.

### Notes for Downstream Plans

- `NoteEntry` renders a plain `<div>`, not an `<li>`. The `<ol>`/`<li>` structure the Accessibility Contract requires belongs to the list component in 35-12.
- `NoteEntry` clears its optimistic override immediately after calling `onUpdated`, which assumes the parent applies the returned entry to its own state. 35-12's list must replace the entry by id rather than ignore the callback, or a successful edit will visibly snap back to the old text.

## Known Stubs

None. All three components are fully wired to the 35-09 server actions.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change was introduced; all three files are client-side callers of existing, already-authorized server actions.

## Verification

| Gate | Result |
|------|--------|
| `npm run typecheck` | clean after every task |
| `npx eslint <each new file>` | no issues found, on all three |
| `npm run lint` (repo) | 0 errors (128 pre-existing warnings, none in the new files) |
| CFUI-01 `rsc-boundary.test.tsx` | 14 passed / 0 failed, re-run after each new `.tsx` |
| `npm test` (both vitest projects) | 1016 passed / 4 skipped, plus 8 RSC — no regressions |
| Grep: `use client` first line | all three files |
| Grep: `AlertDialogTrigger`, `children` in the dialog | 0 and 0 |
| Grep: `dangerouslySetInnerHTML` in the row | 0 |
| Grep: `toast.success` in the composer | 0, with `toast.error` present |
| Grep: `whitespace-pre-wrap`, `break-words`, `min-h-16`, `sr-only`, `aria-live` | all present where required |

## UI-SPEC States Covered

| State | Where |
|-------|-------|
| Saving a note | composer — spinner + `notes.adding`, textarea disabled |
| Save failed | composer — text retained, `toast.error(saveFailed)` |
| Edited note | row — `notes.edited` behind `updatedAt > createdAt` |
| Migrated note | row — secondary Badge with native `title` |
| Unknown author | row — `notes.unknownAuthor`, initial-less avatar |
| Not permitted | row — Edit/Delete simply absent |
| Deleting | dialog — focus-trapped, spinner on confirm |
| Long content | row — `break-words` + `whitespace-pre-wrap` |

Empty, populated, has-more, loading-more and dark-mode verification belong to 35-12 / 35-13 / 35-15.

## Self-Check: PASSED

- `src/components/timeline/delete-note-dialog.tsx` — FOUND
- `src/components/timeline/note-entry.tsx` — FOUND
- `src/components/timeline/note-composer.tsx` — FOUND
- Commit `62b516d` — FOUND
- Commit `afbb177` — FOUND
- Commit `40f8e15` — FOUND
