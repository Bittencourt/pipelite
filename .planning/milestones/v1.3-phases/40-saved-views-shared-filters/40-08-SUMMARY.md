---
phase: 40-saved-views-shared-filters
plan: 08
subsystem: ui
tags: [saved-views, dialog, radix, next-intl, radio-group, checkbox, source-gate, vitest, mobile-height]

# Dependency graph
requires:
  - phase: 40-01
    provides: "pickFilterParams — the whitelist that produced the `filters` map this dialog submits"
  - phase: 40-03
    provides: "the views.save.* catalog (22 keys) in all three locales"
  - phase: 40-06
    provides: "createView / updateView and their machine error codes (name_taken, name_required, no_filters, forbidden, failed)"
  - phase: 40-18
    provides: "the ?view=<id> carrier that made `selected && modified` reachable — without it the target RadioGroup would have been a stub"
provides:
  - "SaveViewDialog — the save/update surface, S-1 through S-15, with its own max-h-[calc(100dvh-2rem)] overflow-y-auto height clamp at the call site"
  - "The target RadioGroup, BUILT and defaulting to targetUpdate, gated on reachability rather than presence"
  - "The !canUpdateSelected refusal, naming the view AND its owner (ownerLabel, falling back to views.ownerUnavailable)"
  - "A 13-assertion scoped source gate whose every assertion reads an EXTRACTED element, with three negative proofs run and recorded"
  - "A reusable JSX tag/paren extraction shape for later 40-* wiring gates (openingTagAt / tagIndexes / elementRegion / enclosingConditional)"
affects: [40-09, 40-10, 40-14, 40-15, saved-views-bar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Height clamps declared at the DIALOG CALL SITE, never on the shared DialogContent primitive sixteen dialogs use"
    - "Reachability gates: assert the conditional's TEST references the props that make a branch reachable, not merely that the branch exists"
    - "The negative-proof pair for any class assertion: delete the class (must go RED) and then re-add it as a COMMENT (must STAY red) — the second half is what proves the gate is scoped rather than a token grep"
    - "In-flight state from useTransition's isPending, so no state is written from an effect body (react-hooks/set-state-in-effect is an ERROR here)"

key-files:
  created:
    - src/components/views/save-view-dialog.tsx
    - src/components/views/__tests__/save-view-dialog-wiring.test.ts
  modified:
    - src/components/ui/checkbox-indeterminate.test.ts

key-decisions:
  - "The tag extractor was COPIED IN SHAPE, not imported — reasoned below, because plan 40-09 depends on the answer"
  - "The clamp lives on this DialogContent call site; dialog.tsx is untouched"
  - "The submit spinner carries NO text-primary, against the plan's literal instruction: this button is bg-primary text-primary-foreground, so text-primary would draw primary-on-primary"
  - "overwriteTarget is a const-narrowed row rather than a boolean, so the non-null narrowing survives into the async transition callback and canUpdateSelected is re-checked at submit time"
  - "The name error clears on SUBMIT, never on keystroke, so a duplicate-name refusal survives while the user edits the name it names"
  - "The eleventh non-bulk Checkbox consumer was hand-checked and the phase-38 census count bumped 10 -> 11 rather than allow-listed"

patterns-established:
  - "A wiring gate's failure message carries the RULE ID, the FILE, and the consequence in user terms — assertion 10's message explains what a wrong default costs, not just that it is wrong"
  - "Anti-vacuity halves beside scoped assertions: 'every DialogTitle carries leading-tight' is paired with 'there is at least one DialogTitle'"

requirements-completed: [VIEW-01, VIEW-02]

# Metrics
duration: 41min
completed: 2026-08-21
---

# Phase 40 Plan 08: The Save / Update Dialog Summary

The save dialog now declares its own fits-or-scrolls height clamp at its call site, builds the
target RadioGroup that plan 40-18 made reachable (defaulting to Update), and is held in place by a
13-assertion source gate where every assertion reads an extracted JSX element rather than the file.

## What Was Built

`src/components/views/save-view-dialog.tsx` — `"use client"`, six props, one `<form>`:

- **O-1, the reason this plan existed.** `<DialogContent className="max-h-[calc(100dvh-2rem)]
  overflow-y-auto sm:max-w-lg">`. The primitive declares neither a `max-h-*` nor an `overflow-y-*`
  (measured, M-8) and `/organizations`' create dialog already leaves ~54px of headroom in a 640px
  viewport, so a taller dialog pushes its own submit off-screen with nothing to scroll — F-39-07
  verbatim. `dvh` not `vh`, because a mobile URL bar changes `vh`. `dialog.tsx` was **not** edited.
- **The target RadioGroup (S-3), built rather than stubbed.** Rendered on
  `selectedView !== null && canUpdateSelected`, defaulting to `targetUpdate`. Choosing
  `targetUpdate` seeds the name from `selectedView.name`; choosing `targetNew` clears it. Never a
  generated name.
- **The refusal (S-4).** On `selectedView !== null && !canUpdateSelected` the group is absent and
  `views.save.targetNewOnly` renders in its place, interpolating the view's name and
  `selectedView.ownerLabel ?? views.ownerUnavailable` — both branches are live in this deployment.
- **The name field (S-5/S-6/S-7).** `autoFocus`, `aria-invalid`, `aria-describedby`, and an inline
  `text-destructive text-xs` slot holding one of `nameRequired` / `nameTaken`. The submit is **never**
  disabled on an empty name; the refusal appears on submit, next to the field, and is announced.
- **Two checkboxes, not switches (S-8/S-10),** each with a helper line — `sharedHelp`/`privateHelp`
  resolving on state, and `defaultHelp` with no `{entity}` placeholder.
- **The footer (S-11/S-12).** Cancel (`common.cancel`, `variant="outline"`) FIRST in the DOM, submit
  LAST, `flex-col-reverse` untouched. One primary-filled button, and a comment saying so.
- **Submit.** `startTransition` around `updateView` or `createView`, both passing the **current**
  `filters` prop. Success toasts and closes; `name_taken`/`name_required` fill the inline slot;
  everything else toasts `views.save.failed` and keeps every field.

`views.save.*` usage: **21 of the catalog's 22 keys**. The one unused key is `noFilters`, which
belongs to the server's refusal path (S-15) — exactly the count the plan's done criterion specified.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | The scoped source gate, written first | `b941bac` | `src/components/views/__tests__/save-view-dialog-wiring.test.ts` |
| 1 (GREEN) | The dialog | `0005af0` | `src/components/views/save-view-dialog.tsx` |
| 2 | The eleventh Checkbox consumer, hand-checked | `5af829f` | `src/components/ui/checkbox-indeterminate.test.ts` |

Task 2's artifact is the test file, which TDD ordering required at RED — so it is in `b941bac`
rather than a fourth commit. Task 2's own work was the three negative proofs (below), which by
design change no source.

## The RED Count

`13/13 failing`, every one with
`ENOENT: no such file or directory, open 'src/components/views/save-view-dialog.tsx'`.
The gate was written before the component existed and failed for the right reason — the file, not a
typo in a class name. After the component: `13/13 passing`.

## The Negative Proofs — All Three RUN

### Proof A — the reachability default (assertion 10)

Flipped `useState<SaveTarget>("targetUpdate")` to `"targetNew"`. Result: **1 failed, 12 passed** —
only assertion 10 turned RED, naming S-3:

```
AssertionError: src/components/views/save-view-dialog.tsx: the target RadioGroup must default to
targetUpdate, not targetNew (S-3). "I opened my view, tweaked it and pressed save" means UPDATE far
more often than it means fork. This branch was structurally unreachable until plan 40-18 added the
?view=<id> carrier, so it has never been exercised by a user — and a wrong default here is the
difference between updating a view and silently accumulating forks of it.
: expected 'targetNew' to be 'targetUpdate'
```

Restored; 13/13 green again.

### Proof B — deleting the clamp (assertion 1)

Removed `max-h-[calc(100dvh-2rem)]` from the `DialogContent` className, leaving
`overflow-y-auto sm:max-w-lg`. Result: **1 failed, 12 passed** — nothing else moved:

```
AssertionError: src/components/views/save-view-dialog.tsx: the <DialogContent> opening tag must
carry max-h-[calc(100dvh-2rem)] (O-1). The primitive declares no max-h and no overflow-y (M-8), the
/organizations create dialog already leaves ~54px of headroom in a 640px viewport, and without this
class the submit button leaves the viewport with nothing to scroll — F-39-07 verbatim.
: expected '<DialogContent className="overflow-y-…' to contain 'max-h-[calc(100dvh-2rem)]'
```

### Proof C — the comment-only probe (assertion 1 must STAY red)

With the class still deleted, added
`{/* NEGATIVE PROBE: max-h-[calc(100dvh-2rem)] as prose only. */}` immediately above the tag. The
literal then appeared **twice** in the file as prose (the probe, plus line 15 of the component's own
header, which quotes the class while explaining it) — and assertion 1 stayed **RED with the
identical message**: still 1 failed, 12 passed.

That is the proof the gate reads an extracted element and not the file. It is the check Phase 39
lacked five times: a gate satisfied by the comment explaining the rule it was meant to enforce.
Both halves restored via `git checkout -- <file>`; working tree clean, 13/13 green.

## Imported or Copied? (the plan asked explicitly — plan 40-09 depends on this)

**COPIED IN SHAPE. Nothing new was imported, and no third brace matcher was added.**

- **Imported and reused as-is:** `readStrippedSource` and `callArguments` from
  `@/components/custom-fields/__tests__/source-scan`. `callArguments` is the repo's existing
  string-aware **paren** matcher, and assertion 12 (the `updateView`/`createView` argument read) uses
  it rather than reimplementing argument extraction.
- **Copied in shape from `src/app/organizations/__tests__/toolbar-wiring.test.ts`:** its
  `extractToolbarRegion` tag-depth walker became `elementRegion`, and its `extractAdminConditional`
  paren-depth walker became `enclosingConditional`.
- **Why copied and not imported.** Both functions are module-private in `toolbar-wiring.test.ts`
  **and** hard-wired to that file's marker, the literal `'<div className="flex flex-wrap'`. Importing
  them therefore means first exporting them and then generalising a helper that two gates use for
  two different shapes. That generalisation is precisely the consolidation
  `.planning/BACKLOG.md` already tracks under "Two brace matchers should be consolidated"
  (`duplicate-warning-wiring.test.ts` and `deleted-at-wiring.test.ts`), and doing it inside a plan
  about one dialog would smuggle a cross-file test refactor into an unrelated diff.
- **What that buys 40-09 and 40-14.** Four extractors exist here, written to be marker-agnostic and
  therefore copy-or-promote ready: `openingTagAt` (string- and brace-aware, so an arrow function in a
  prop cannot truncate a tag), `tagIndexes` (whole-tag-name boundary check, so `<Dialog` does not
  match `<DialogContent` and `<RadioGroup` does not match `<RadioGroupItem`), `elementRegion` (tag
  depth), and `enclosingConditional` (paren depth, with a containment check that refuses a
  conditional the marker does not actually live inside). **Recommendation for 40-09:** if a third
  40-* gate needs these, promote all four into `source-scan.ts` in ONE commit and delete both copies
  — that is the moment the BACKLOG consolidation becomes cheap, and it should include
  `toolbar-wiring.test.ts`.

## Deviations from Plan

### 1. [Rule 1 - Bug] The submit spinner carries no `text-primary`

- **Found during:** Task 1
- **Plan said:** `Loader2 className="text-primary animate-spin"`.
- **Issue:** the submit is the default `Button` variant, which resolves to
  `bg-primary text-primary-foreground` (`button.tsx:12`). `text-primary` on an icon inside it draws
  primary on primary — the in-flight indicator would be near-invisible on the one control whose
  in-flight state matters most.
- **Fix:** `<Loader2 className="size-4 animate-spin" />`, inheriting the button's own foreground.
  This is also the existing repo idiom (`bulk-reassign-dialog.tsx:167`).
- **Gate impact:** none, and assertion 7 was written to survive it rather than around it. It extracts
  every element carrying `text-primary` and requires each to also carry `animate-spin` — currently
  zero such elements — and is **paired with an anti-vacuity half** asserting an `animate-spin`
  element exists at all. So the gate still refuses `text-primary` as a text colour (F-39-06) and
  still refuses a submit button with no spinner.
- **Files:** `src/components/views/save-view-dialog.tsx`

### 2. [Rule 3 - Blocking] The phase-38 Checkbox census turned red

- **Found during:** Task 2's full-suite run
- **Issue:** `src/components/ui/checkbox-indeterminate.test.ts` asserts an EXACT count of non-bulk
  `Checkbox` importers, deliberately, so that a new consumer forces a hand-check for the
  indeterminate/mixed state. This dialog is the eleventh. `1 failed / 3663 passed`.
- **Hand-check performed:** both checkboxes are driven by `boolean` state seeded from `?? false`, and
  each `onCheckedChange` collapses Radix's `CheckedState` with `checked === true` before it reaches
  `setState`. `checked` is therefore a strict boolean at every render and the mixed branch is
  unreachable. The file contains zero occurrences of `indeterminate`.
- **Fix:** bumped `EXPECTED_CONSUMER_COUNT` 10 → 11 with the hand-check written into the constant's
  doc comment. **Deliberately NOT added to `PHASE_38_SELECTION_CONSUMERS`** — that allow-list is for
  phase-38 selection surfaces, and adding an unrelated file there would buy a free slot in the count
  instead of proving anything. Staying inside the count keeps it covered by the "never puts the Root
  into the mixed state" assertion.
- **Commit:** `5af829f`
- **Note on the plan's `git diff src/components/ui/` check:** this is a TEST in that directory, not a
  primitive. `git diff HEAD -- src/components/ui/*.tsx` is **empty** — no primitive was edited, which
  is what that check exists to protect.

### 3. [Rule 2 - Missing functionality] `overwriteTarget` re-checks `canUpdateSelected` at submit time

- **Found during:** Task 1
- **Issue:** `target` initialises to `"targetUpdate"` unconditionally, but the RadioGroup only renders
  when `canUpdateSelected`. A viewer who may not overwrite the selected view would therefore submit
  with `target === "targetUpdate"` still set and aim `updateView` at a row the server refuses —
  producing a `forbidden` toast where a successful create was intended.
- **Fix:** `const overwriteTarget = target === "targetUpdate" && canUpdateSelected ? selectedView : null`,
  and the submit branches on `overwriteTarget !== null`. As a `const`, its non-null narrowing also
  survives into the async transition callback.
- **Files:** `src/components/views/save-view-dialog.tsx`

### 4. [Scope] The gate carries 13 assertions, not 12

The plan specified twelve. A thirteenth was added asserting the two `useTranslations` namespace
bindings and that the Cancel button inside the extracted `DialogFooter` reads `("cancel")` — without
it, the eleven `save.*` key assertions prove only that a dot-path string appears, not that it is
resolved through the catalog (K-4: no new close word).

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors (125 pre-existing warnings, none in the new files; `npx eslint src/components/views` → "No issues found") |
| `npx vitest run` | 136 files, **3664 tests, 0 failed** |
| `npx vitest run --config vitest.rsc.config.ts` | 2 files, **8 tests, 0 failed** |
| The 40-08 gate | **13/13 green**, each assertion scoped to an extracted element |
| Negative proofs | all three RUN and recorded above, including the comment-only probe staying RED |
| `git diff HEAD -- src/components/ui/*.tsx` | empty — no primitive edited |
| `git diff HEAD -- package-lock.json` | empty — no `shadcn add`, no dependency bump (T-40-SC) |

Nothing was measured. **The 320px / 640px measurement of this dialog belongs to plan 40-15**, and
the gate's header says so in its own words so it cannot be mistaken for that proof.

## What Plan 40-15 Must Still Prove

The gate knows the classes that make fitting POSSIBLE are present. It does not know that:

1. the submit button is inside a 640px viewport (V-40-11's height measurement);
2. the submit is trial-clickable at the TOP of the stacked 320px `flex-col-reverse` footer;
3. Enter on the focused submit does not navigate the list behind the dialog — F-39-08 is accepted
   here (T-40-36), not fixed, and the `<form>` is the work-around rather than the cure.

## Known Stubs

None. The target RadioGroup — the one branch this plan could plausibly have stubbed, because it was
structurally unreachable until 40-18 — is fully built and is gated on the reachability of its own
conditional, not on its mere presence.

## Threat Flags

None. The dialog adds no endpoint, no auth path and no file access. Its two trust boundaries were
already in the register: the form → server-action boundary (re-derived by `guardSaveInput`,
authorization read from the stored row) and the portalled-dialog → page keyboard boundary (T-40-36,
accepted with the `<form>` work-around).

## Self-Check: PASSED

| Claim | Verified |
|---|---|
| `src/components/views/save-view-dialog.tsx` | FOUND |
| `src/components/views/__tests__/save-view-dialog-wiring.test.ts` | FOUND |
| `.planning/phases/40-saved-views-shared-filters/40-08-SUMMARY.md` | FOUND |
| commit `b941bac` (RED gate) | FOUND |
| commit `0005af0` (dialog) | FOUND |
| commit `5af829f` (Checkbox census) | FOUND |
| commit `3d2632e` (this SUMMARY) | FOUND |

Worktree mode: `STATE.md` and `ROADMAP.md` were deliberately NOT touched — the orchestrator owns
those writes after the wave merges.
