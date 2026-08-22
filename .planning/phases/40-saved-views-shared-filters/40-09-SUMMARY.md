---
phase: 40-saved-views-shared-filters
plan: 09
subsystem: ui
tags: [saved-views, dialog, alert-dialog, switch, radix, next-intl, source-gate, vitest, mobile-height, refactor]

# Dependency graph
requires:
  - phase: 40-01
    provides: "the filter whitelist behind `filterCount` — the number the row renders is the number the parser accepts"
  - phase: 40-02
    provides: "savedViewDefaults keyed (userId, entityType) — the reason ONE default override models the whole surface"
  - phase: 40-03
    provides: "the views.manage.* (13 keys) and views.delete.* (5 keys) catalogs in all three locales"
  - phase: 40-06
    provides: "setViewShared / setViewDefault / deleteView, and canMutateView vs canSeeView — the asymmetry G-7 renders"
  - phase: 40-08
    provides: "the four JSX extractors, and the SUMMARY that named the condition for promoting them"
provides:
  - "ManageViewsDialog — G-1..G-9 plus the D-1..D-5 delete confirmation, in one file"
  - "The DOUBLE height clamp: max-h-[calc(100dvh-2rem)] on the DialogContent AND max-h-[50vh] on the inner list, the second asserted to be an ANCESTOR of the row map"
  - "The default Switch LIVE on a row the viewer cannot edit, with a gate that catches its removal three different ways"
  - "A 10-assertion scoped source gate; every assertion reads an EXTRACTED element"
  - "openingTagAt / tagIndexes / elementRegion / enclosingConditional as NAMED EXPORTS of source-scan.ts — the BACKLOG consolidation, paid down"
affects: [40-10, 40-14, 40-15, saved-views-bar, source-scan]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promote a copied helper on its THIRD consumer, in its own commit, verified by re-running the previous consumer's suite unchanged — never adapt the older assertions to fit the move"
    - "A brace-aware `openingTagAt` makes the whole `<Switch …/>` opening tag the extractable unit, INCLUDING its multi-statement onCheckedChange handler, so a handler-body assertion needs no second walker"
    - "Revert-path assertion shape: `const previous` present AND the override setter called at least TWICE in the same extracted element — deleting the revert drops the count to one"
    - "Icon rules asserted as an ALLOW-LIST over the lucide-react import, never a deny-list of glyph names over the file (`Check` is a substring of `onCheckedChange`)"
    - "A single `{ viewId } | null` override for a per-(user,entityType) singleton, so moving the default from view A to B turns A's switch OFF the way the server's composite-key upsert does"

key-files:
  created:
    - src/components/views/manage-views-dialog.tsx
    - src/components/views/__tests__/manage-views-dialog-wiring.test.ts
  modified:
    - src/components/custom-fields/__tests__/source-scan.ts
    - src/components/views/__tests__/save-view-dialog-wiring.test.ts

key-decisions:
  - "The four extractors were PROMOTED, not copied a third time — orchestrator-authorized, and it deletes 40-08's copies rather than adding to them"
  - "The default override is ONE `{ viewId: string | null } | null`, not a per-row boolean map, because the default is a per-(user,entityType) singleton"
  - "One `useTransition` for the whole surface, so a second toggle cannot interleave with a write already in flight"
  - "`preventDefault` on the AlertDialogAction, so the confirmation survives the round trip and a REFUSED delete is attributable to the row it was pressed on"
  - "The owner state-word uses `ownedBy` OR standalone `ownerUnavailable`, never `ownedBy` interpolated with `ownerUnavailable` — es-ES would read \"de El propietario ya no está activo\""
  - "C-40-2 is an allow-list over the lucide import, after the deny-list form was measured to false-positive on `onCheckedChange`"

patterns-established:
  - "`regionAround(source, marker, tagName)` — slice the source at an element's own opening tag so `elementRegion` can scope to a `<div>` that is not the file's first, with no second walker"
  - "Guard a capability-granting absence (G-7) from THREE directions: not in existing branch A, not in existing branch B, and not inside any NEW conditional whose test mentions the flag"

requirements-completed: [VIEW-02]

# Metrics
duration: 38min
completed: 2026-08-21
---

# Phase 40 Plan 09: The Manage Views Dialog Summary

One dialog now owns share, unshare, set default, clear default and delete as stacked rows with two
height clamps instead of one, the default switch stays alive on a row the viewer cannot edit, and the
four JSX extractors plan 40-08 had to copy are now a single shared export that both gates import.

## What Was Built

`src/components/views/manage-views-dialog.tsx` — `"use client"`, four props, two dialogs in one file.

- **The DOUBLE clamp (O-1), the reason the plan called this its headline.**
  `<DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">` **and**
  `<div className="max-h-[50vh] overflow-y-auto">` around the rows. The second looks redundant and is
  not: the row list is the only unbounded region on the surface, and clamping only the dialog makes
  the dialog itself the scroll container at fifteen views, pushing everything after the list out of
  the viewport — F-39-07's shape again. `dvh` and not `vh`, because a mobile URL bar changes `vh`.
  `<AlertDialogContent>` carries the same clamp (O-1c). Neither `dialog.tsx` nor `alert-dialog.tsx`
  was touched.
- **Stacked rows, never a table (R-40-2e).** Name at `text-sm`, **wrapping and not truncated** — this
  dialog is where the full name lives — inside a `min-w-0` cluster (R-3). Then the state-words line at
  `text-xs text-muted-foreground`, then `views.manage.filterCount` from the server-computed count,
  then a `flex flex-wrap gap-2` action cluster. `border-border border-b p-4 last:border-b-0`.
- **The state words are WORDS (C-40-2).** `badgeShared`/`badgePrivate`, then `badgeDefault` only when
  it holds, then the owner, joined by ` · `. No glyph, no hue. The owner segment resolves to
  `ownedBy` ("by {owner}") when there is a label and to `ownerUnavailable` **standalone** when there
  is not — see the deviation below for why it is not the nested form the save dialog uses.
- **Two `Switch`es, not `Checkbox`es (G-4),** because they commit on toggle. Each captures its
  previous position, writes optimistically, and **puts it back in the failure branch** — `manage.saved`
  or `manage.failed`, and never an optimistic state a refused write leaves standing (T-40-40). Every
  write happens inside a `startTransition` callback; there is no `useEffect` in the file at all (K-7).
- **The default switch is rendered ALWAYS, including on a read-only row (G-7).** A default is per
  user, `setViewDefault` authorizes on visibility and deliberately not on ownership, and 40-CONTEXT
  is explicit that a user may default to someone else's shared view "otherwise sharing has little
  payoff". The component says so in a comment that begins "DO NOT move this inside the
  `view.canEdit &&` guard"; the gate says so three different ways.
- **The read-only row (G-7)** adds `views.manage.readOnly` with `{owner}`, substituting
  `ownerUnavailable` when the owner is soft-deleted — which then names an admin as the only remaining
  editor, and that is true.
- **The delete confirmation (D-1..D-5),** hosted in the same file. `views.delete.body` transcribed
  whole, all three clauses. `AlertDialogAction variant="destructive"` **passed explicitly**, because
  the primitive destructures `variant = "default"`. `AlertDialogCancel` with no override. Success
  toasts `{name}` from the action's return value and leaves the manage dialog open minus the row;
  failure toasts and **the row stays** — there is no optimistic removal anywhere in the file.
- **No rename (G-5), no confirmation on the switches (D-5), empty state with two lines (G-8),
  `entityType`-scoped list (G-9).**

Catalog coverage: **13/13 `views.manage.*` keys and 5/5 `views.delete.*` keys**, asserted
exhaustively by the gate rather than counted by hand.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| — (authorized deviation) | Promote the four JSX extractors | `11903c1` | `source-scan.ts`, `save-view-dialog-wiring.test.ts` |
| 1 (RED) | The scoped source gate, written first | `a35981e` | `manage-views-dialog-wiring.test.ts` |
| 2 | C-40-2 as an allow-list, after the deny-list false-positived | `187d90d` | `manage-views-dialog-wiring.test.ts` |
| 1 (GREEN) | The manage dialog | `9a071ed` | `manage-views-dialog.tsx` |

Task 2's artifact is the test file, which TDD ordering put in the RED commit — the same shape 40-08
recorded. `187d90d` is task 2's own correction and `9a071ed` is task 1's GREEN. Every commit in this
list leaves the working tree at a state whose own suite passes for the right reason: `a35981e` is
RED on a deliberately absent file, `187d90d` fixes a gate whose target still did not exist, and
`9a071ed` turns it green.

## The Extractor Promotion (orchestrator-authorized, exceeds `files_modified`)

The plan asked "If 40-08 put it in a shared helper, import it; if not, say so." 40-08 did **not** —
it copied four extractors in shape and its SUMMARY closed with the condition for undoing that: *"if a
third 40-* gate needs them, promote all four into `source-scan.ts` in one commit and delete both
copies."* This plan is that third consumer, and the orchestrator authorized the promotion.

What moved, in `11903c1`, as one atomic commit:

| Extractor | What it does | Now |
|---|---|---|
| `openingTagAt` | string- and brace-aware opening tag, so `onSubmit={(e) => …}` cannot truncate it | exported from `source-scan.ts` |
| `tagIndexes` | whole-tag-name boundary, so `<Dialog` does not match `<DialogContent` | exported |
| `elementRegion` | `<tag> … </tag>` by TAG DEPTH, not by a line range | exported |
| `enclosingConditional` | `{test && ( … )}` by PAREN DEPTH, with a containment check | exported |

40-08's gate now imports all four and its local copies are gone. **`toolbar-wiring.test.ts` was left
alone** — 40-08's SUMMARY recommended folding it in too, but that file is outside the authorized
scope here and its two walkers are hard-wired to a literal marker, so consolidating it is a real
change to a Phase-45 gate rather than a move. It stays on `.planning/BACKLOG.md`.

**Zero brace matchers entered the repo.** This gate's five local helpers — `openingTags`,
`soleOpeningTag`, `regionAround`, `offsetsOf`, `occurrences`, `tagContaining` — are one-line
compositions over the four promoted primitives, a `split`, and a `matchAll`.

### The one non-verbatim detail

The four referenced a module-level `COMPONENT` constant in their throw messages, which does not exist
in a shared module. They now take an **optional trailing `file` label**, defaulting to `""`, and every
40-08 call site passes `COMPONENT` — so those messages are byte-identical to before. The alternative
(dropping the file name from the diagnostics) would have made a malformed-source failure in a shared
helper unable to say which file it was reading.

**Verification that the move was pure:** 40-08's gate, re-run immediately after, **13/13 passing,
same thirteen names, no assertion adapted.** The four throw paths only fire on malformed source and
none of the thirteen exercises them.

## The RED Count

`10/10 failing`, every one with
`ENOENT: no such file or directory, open 'src/components/views/manage-views-dialog.tsx'`.
The gate was written before the component and failed for the right reason — the absent file, not a
typo in a class name. After the component: `10/10 passing`.

## The Negative Proofs — BOTH RUN, plus a third

### Proof (a) — the default switch moved inside `{view.canEdit && ( … )}` (assertion 7)

Nested the default `Switch`/`Label` block inside the share switch's existing `view.canEdit`
conditional. Result: **1 failed, 9 passed** — only assertion 7 moved:

```
AssertionError: src/components/views/manage-views-dialog.tsx: setViewDefault appears inside the
share switch's view.canEdit branch (G-7). A default is PER USER. 40-CONTEXT is explicit that a user
may set someone else's SHARED view as their own default — "otherwise sharing has little payoff" —
and UI-SPEC G-7 calls that asymmetry "the one thing this row must make legible". Moving the default
switch inside the view.canEdit guard alongside the share switch and the delete button LOOKS like
consistency and silently deletes a capability the feature was designed to grant. Nothing else in
the suite would notice.: expected 1 to be +0 // Object.is equality
```

Restored via `git checkout -- <file>`; 10/10 green.

### Proof (a2) — the default switch wrapped in a NEW `view.canEdit` branch (assertion 7's general half)

Not requested, run because assertion 7 has a second half whose reachability I could not otherwise
demonstrate: the checks in proof (a) catch a move into an **existing** branch, while this one catches
a **new** branch being wrapped around the switch. Wrapped the default block in its own
`{view.canEdit && ( … )}`. Result: **1 failed, 9 passed**, and it was the general half that fired,
not the two branch-scoped counts:

```
AssertionError: src/components/views/manage-views-dialog.tsx: setViewDefault is enclosed by a
conditional testing canEdit (G-7). Its test is: view.canEdit. [G-7's sentence] :
expected 'view.canEdit ' not to contain 'canEdit'
```

So neither half of assertion 7 is vacuous. Restored; 10/10 green.

### Proof (b) — `variant="destructive"` removed from `AlertDialogAction` (assertion 4)

Deleted the prop, leaving `disabled` and `onClick`. Result: **1 failed, 9 passed**:

```
AssertionError: src/components/views/manage-views-dialog.tsx: the <AlertDialogAction> must pass
variant="destructive" explicitly (C-40-3). The primitive destructures variant = "default"
(alert-dialog.tsx:149), so omitting the prop is SILENT — the button deletes a view for every
teammate while looking like "OK". Offending tag: <AlertDialogAction
              disabled={isWriting}
              onClick={(event) => {
                event.preventDefault()
                handleDelete()
```

This is the proof that matters most for this surface: the defect leaves a **working** button that
deletes a shared view for every teammate and renders identically to a primary "OK". Nothing else in
the suite, and no screenshot, distinguishes the two. Restored; 10/10 green, working tree clean.

## Deviations from Plan

### 1. [Authorized — exceeds `files_modified`] The extractors were promoted, not copied

Covered in full above. It touches `source-scan.ts` and 40-08's gate, both outside this plan's
declared `files_modified`. The orchestrator authorized it explicitly, and the alternative was a
**fourth** brace matcher in a repo whose BACKLOG already tracks two that should be consolidated.
40-08's gate was re-run unchanged, 13/13, as the condition of the move being pure.

### 2. [Rule 1 - Bug] C-40-2 as an allow-list, because the deny-list false-positived

- **Found during:** Task 1's GREEN run — 9 passed, 1 failed.
- **Issue:** the gate's first C-40-2 form counted forbidden glyph names file-wide, and the list
  included `Check`. `Check` is a substring of **`onCheckedChange`**, so the assertion reported
  `expected 2 to be +0` against the two Switch handlers G-4 *requires*. The component was correct;
  the assertion was unsound.
- **Fix:** assert an **allow-list over the `lucide-react` import** — exactly `["Loader2", "Trash2"]`.
  No substring collision is possible, and it is strictly stronger: it refuses *every* glyph rather
  than the handful somebody thought to enumerate. `Trash2` is permitted because G-6 pairs it with the
  word `views.manage.delete`; `Loader2` because it is an in-flight tint, not a state carrier.
- **Commit:** `187d90d`

### 3. [Deviation from the plan's literal wording] Assertion 6 extracts the `<Switch>` tag, not a paren-depth handler body

- **Plan said:** "Extract by paren depth from the `onCheckedChange={` marker."
- **Issue:** the handler body is delimited by **braces**, not parens — `onCheckedChange={(next) => { … }}`.
  Paren-matching from that marker returns the arrow's parameter list (`next`), not the body. Getting
  the body by paren depth is not possible; getting it by brace depth would have meant a **new brace
  matcher**, which is the one thing this plan was told not to add.
- **Fix:** the extracted unit is the whole `<Switch …/>` **opening tag**, via the promoted
  `openingTagAt`. That extractor is already brace-aware — every `>` inside an `=>` sits at brace
  depth ≥ 1 — so the tag it returns contains the entire multi-statement handler. The assertion is
  therefore still scoped to one element and reads the same text the plan wanted, with no walker added.
- **Files:** `src/components/views/__tests__/manage-views-dialog-wiring.test.ts`

### 4. [Rule 2 - Missing functionality] The owner state-word is two branches, not one interpolation

- **Issue:** the plan's phrasing allows reading the owner segment as `ownedBy` with
  `ownerLabel ?? ownerUnavailable`, which is what the save dialog does for `save.targetNewOnly`. On
  *this* line it produces broken prose: `ownedBy` is "by {owner}" / "de {owner}", and
  `ownerUnavailable` is a full sentence — "Owner no longer active" / "El propietario ya no está
  activo". Nesting them reads "de El propietario ya no está activo".
- **Fix:** `ownedBy` when there **is** a label, `ownerUnavailable` **standalone** when there is not.
  Both branches are live in this deployment (two of three active users have a NULL name; six users
  are soft-deleted). `views.manage.readOnly` keeps the interpolated form, because its sentence has
  only one slot and the plan states that outcome explicitly.
- **Files:** `src/components/views/manage-views-dialog.tsx`

### 5. [Rule 2 - Missing functionality] One default override, not a per-row boolean map

- **Issue:** the plan says "hold the pending value in local state". A per-row boolean map for the
  default switch would leave **two switches on** after moving the default from view A to view B —
  because `savedViewDefaults` is keyed `(userId, entityType)` and `upsertDefault` moves the single
  row rather than adding one. The optimistic UI would show a state the database cannot hold.
- **Fix:** one `{ viewId: string | null } | null` override for the whole surface. `null` means "no
  override, read the `views` prop"; the wrapper object distinguishes "cleared" from "not overridden".
  Sharing keeps a per-view map, because sharing genuinely is per view.
- **Files:** `src/components/views/manage-views-dialog.tsx`

### 6. [Scope] The gate carries 10 assertions, not 9

A tenth asserts the two `useTranslations` namespace bindings, all 13 `views.manage.*` keys, all 5
`views.delete.*` keys, `common.cancel` (K-4) and the four C-40-2 state-word keys. It is the plan's own
task-1 done criterion — "all 13 `views.manage.*` keys and all 5 `views.delete.*` keys are referenced"
— moved out of a hand-count and into the suite. An unreferenced key is a sentence that was written,
translated into three locales, and then never shown; `manage.emptyBody` and `manage.readOnly` are the
two most likely to be quietly dropped.

### 7. [Scope] A third negative proof was run

Proof (a2), above. Assertion 7 guards its rule from three directions and proofs (a) and (b) exercised
only one of them, leaving the general half unverified. It is verified now.

## Authentication Gates

None. No CLI, no credential, no external service.

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | **0 errors**, 125 warnings — all pre-existing, none in the new or modified files |
| `npx eslint src/components/views src/components/custom-fields/__tests__/source-scan.ts` | "No issues found" |
| `npx vitest run` (full suite) | 136 files, **3646 passed, 0 failed**, 28 skipped |
| `npx vitest run --config vitest.rsc.config.ts` | 2 files, **8 passed, 0 failed** |
| The 40-09 gate | **10/10 green**, every assertion scoped to an extracted element |
| The 40-08 gate, after the promotion | **13/13 green**, no assertion adapted |
| Negative proofs | **all three RUN and recorded verbatim above** |
| `git diff 919237b HEAD -- src/components/ui/` | **empty** — no primitive edited |
| `git diff 919237b HEAD -- package-lock.json package.json` | **empty** — no `shadcn add`, no dependency bump (T-40-SC) |
| `git diff --diff-filter=D 919237b HEAD` | empty — nothing deleted |
| Working tree after the proofs | clean (`git status --porcelain` empty) |

Nothing was measured. **The 320px / 640px measurement of this dialog — and of its footer surviving
≥8 seeded views — belongs to plan 40-15**, and the gate's header says so in its own words so it
cannot be mistaken for that proof. No Docker rebuild was run; plan 40-15 owns the phase's only one.

## What Plan 40-15 Must Still Prove

The gate knows the classes and wiring that make the right outcomes POSSIBLE. It does not know that:

1. the dialog and its footer fit a 640px viewport with ≥8 views seeded (T-40-41's measurement — the
   whole point of the double clamp);
2. the `flex flex-wrap` action cluster does not overflow 241px on a row that carries a share switch,
   a default switch **and** a delete button;
3. the delete confirmation's three-clause body plus its stacked 320px footer leaves the destructive
   action trial-clickable;
4. a refused toggle's revert is *visible* — the structure is asserted, the pixel is not.

## Known Stubs

None. The one branch this plan could plausibly have stubbed is the read-only row, since it needs a
second user's shared view to be seen at all. It is fully built: the sentence, the substituted
`ownerUnavailable`, and the live default switch beside it.

## Threat Flags

None. The dialog adds no endpoint, no auth path, no file access and no schema change. Its two trust
boundaries were already in the register and are mitigated where the register says: `view.canEdit`
governs **visibility only** and `canMutateView` / `canSeeView` in `write-guards.ts` are the
authorization (T-40-39); the switch revert is what stops the UI asserting a state the database
refused (T-40-40); `ownerLabel` is server-computed so no uuid reaches `manage.readOnly` (T-40-43).

## Self-Check: PASSED

| Claim | Verified |
|---|---|
| `src/components/views/manage-views-dialog.tsx` | FOUND |
| `src/components/views/__tests__/manage-views-dialog-wiring.test.ts` | FOUND |
| `src/components/custom-fields/__tests__/source-scan.ts` exports the four extractors | FOUND (imported by both 40-* gates) |
| commit `11903c1` (extractor promotion) | FOUND |
| commit `a35981e` (RED gate) | FOUND |
| commit `187d90d` (C-40-2 allow-list) | FOUND |
| commit `9a071ed` (the dialog) | FOUND |

Worktree mode: **`STATE.md` and `ROADMAP.md` were deliberately NOT touched** — the orchestrator owns
those writes after the wave merges.
