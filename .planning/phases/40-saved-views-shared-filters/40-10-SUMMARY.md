---
phase: 40-saved-views-shared-filters
plan: 10
subsystem: ui
tags: [saved-views, dropdown-menu, radio-group, next-intl, export, csv, source-gate, vitest, suspense, parsed-interface]

# Dependency graph
requires:
  - phase: 40-01
    provides: "pickFilterParams / withViewEscape / VIEW_ESCAPE_VALUE, and the SavedViewsBarProps declaration itself"
  - phase: 40-03
    provides: "the 18 bar-level views.* keys plus views.export.* in all three locales"
  - phase: 40-05
    provides: "the server resolver whose eight-property return shape this component consumes, and the SQL predicate that makes the shared group a grouping rather than a control"
  - phase: 40-06
    provides: "createView / updateView, reached through SaveViewDialog"
  - phase: 40-07
    provides: "exportViewResults and its four-arm discriminated result"
  - phase: 40-08
    provides: "SaveViewDialog — slot 2's button and the menu's saveNew both open it"
  - phase: 40-09
    provides: "ManageViewsDialog, and the four JSX extractors as shared exports of source-scan.ts"
  - phase: 40-18
    provides: "withViewSelection — the ?view=<id> carrier that makes selectView a selection rather than a filter change, and views.saveChanges a live branch"
provides:
  - "SavedViewsBar — the phase's one new component: B-1..B-6, V-1..V-11, E-1..E-8, in 531 lines"
  - "V-40-5 — a 15-assertion gate whose two headline assertions are a PARSED interface read and a derives-nothing structural check"
  - "The two-push contract: withViewSelection opens a view, withViewEscape escapes to All records, and no expression contains both"
  - "A tag-anchored JSX text-run extractor, so a hardcoded English child cannot hide behind a TypeScript generic or an arrow function"
affects: [40-14, 40-15, saved-views-bar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-flight state as useTransition's isPending, so there is no setter for react-hooks/set-state-in-effect to catch and zero useEffect in the file"
    - "A parsed-interface gate: extract the declaration body, parse the property NAMES, assert the set — never grep for a property that might be in a comment"
    - "Bound a class assertion to the right element by asserting what the extracted REGION contains (the bar row must contain the trigger), not by trusting ordinal position"
    - "Identify which of two sibling call sites is which by what each helper is FED (view.filters + view.id versus new URLSearchParams()), not by a nearby comment"
    - "JSX text-run extraction anchored on real tags via openingTagAt, because `=>`, `length > 0` and `useState<boolean>` all produce a false `>` or `<`"

key-files:
  created:
    - src/components/views/saved-views-bar.tsx
    - src/components/views/__tests__/saved-views-bar-wiring.test.ts
  modified: []

key-decisions:
  - "The download idiom was COPIED IN SHAPE, not lifted — bulk-action-bar-wiring.test.ts asserts the literal URL.createObjectURL appears in THAT file, so extracting it would turn a Phase 38 gate red"
  - "Tasks 1 and 2 collapsed into ONE feat commit: the eight props are destructured together, so any commit rendering slot 1 without the export item leaves canExport unused — a new lint warning in a new file"
  - "The interface body in types.ts is bounded by a `}` at column ZERO rather than by brace counting, so this plan added no third brace matcher"
  - "text-primary IS on this spinner, unlike 40-08's: the row around it is the page background, not a bg-primary button"
  - "The radio items' horizontal padding is left exactly as the primitive ships it — pl-8 is the indicator gutter, and only the vertical half is overridden to py-2"
  - "DropdownMenuContent carries max-w-[calc(100vw-2rem)] and nothing else: a width cap is not a height cap, and the gate forbids only max-h- and overflow-"

patterns-established:
  - "A negative proof per HALF of a multi-part assertion: proof (b) fired the regex half, so proof (b2) removed the comparison and kept the declaration to prove the sharpest half is not vacuous"
  - "State the gate's own blind spot in the gate: assertion 13 documents that a string literal inside an unbalanced JSX-expression fragment is not examined"

requirements-completed: [VIEW-01, VIEW-02, VIEW-03]

# Metrics
duration: 26min
completed: 2026-08-22
---

# Phase 40 Plan 10: The Saved-Views Bar Summary

The phase's one new component now exists: a non-sticky two-slot row whose picker mints `?view=<id>`
through `withViewSelection` and whose second slot resolves to a spinner, a sentence, or one outline
button — held in place by a 15-assertion gate that PARSES the eight-property interface rather than
grepping for it.

## What Was Built

`src/components/views/saved-views-bar.tsx` — `"use client"`, 531 lines, one fragment with four
children (the bar row, the degraded notice, and the two dialogs as siblings).

- **B-2, the rule the plan exists for.** The eight props are **re-exported** from
  `src/lib/views/types.ts` (`export type { SavedViewsBarProps } from …`), never restated, and nothing
  named `isModified` or `droppedFilterKeys` is declared in the file. **There is no loading state
  anywhere in the component**, and the header says that absence is a decision: all four hosts already
  `await searchParams`, so a client-fetched picker would flash "All records" over the user's actual
  default view on every navigation.
- **B-3.** `SavedViewsBar` is a `<Suspense>` wrapper around a module-private `SavedViewsBarInner`
  (which calls `useSearchParams`, `usePathname`, `useRouter`). The fallback is the trigger in its
  disabled shape reading `views.allRecords` — the `activity-filters.tsx:356` precedent in shape.
- **B-4 / R-40-2f.** The row is `flex min-w-0 flex-wrap items-center gap-2`. **Not sticky, not fixed,
  no spacer.** `flex-wrap` is load-bearing: 200px + 8px + 139px is 347px against 241px, and there is
  no trigger width at which both fit with the Spanish label (M-10).
- **Slot 1, the picker.** Trigger is `Button variant="outline"` with `min-w-0 max-w-[200px]`,
  `aria-label={t("picker.label")}`, the name in a `truncate` span, a `Badge variant="secondary"
  shrink-0` on `isModified`, and a `shrink-0` `ChevronDown`. The menu is a `DropdownMenuRadioGroup`
  in V-3's exact order: All records → separator → (empty label) → My views → separator + Shared with
  me → separator → Save view (on `canSave`) → Export → Manage views. Each view item is **two stacked
  lines** at `py-2`: the name at `text-sm truncate`, then the state words at
  `text-xs text-muted-foreground` joined by ` · `. The default view is **not** floated to the top.
- **V-5, both branches live.** The owner segment is `ownedBy` when there is a label and
  `ownerUnavailable` **standalone** when there is not — never the nested form, which reads
  "de El propietario ya no está activo" in es-ES (40-09's finding, applied here without rediscovering
  it).
- **V-9, and why it is two functions.** `selectView` pushes
  `withViewSelection(entityType, view.filters, view.id)`; `selectAllRecords` pushes
  `withViewEscape(entityType, new URLSearchParams())`. `withViewEscape` deletes an unparsed `view`
  key, so using it for a selection would silently reinstate the exact state 40-05 measured. The
  branch is chosen by `value === VIEW_ESCAPE_VALUE` — the sentinel, never a translated label.
- **Slot 2, B-5's five resolutions**, in precedence: `isExporting` → `Loader2` + `views.exporting`;
  `!canSave` → `views.needsFilter` as a **sentence, not a disabled button**; no selection →
  `views.saveNew`; selected + modified → `views.saveChanges` or `views.saveNew` on
  `canUpdateSelected`; selected + clean → **nothing**.
- **E-1..E-8.** The export is a `DropdownMenuItem`, `disabled={!canExport}` with
  `views.export.disabledReason` as a second muted line. Its `onSelect` is **not** prevented and enters
  `startTransition` directly; the in-flight state is that transition's own `isPending`, so **there is
  no `useEffect` in the file at all**. `too_many` → `views.export.tooMany` with `{max}`, `refused` →
  `views.export.refused`, everything else → `bulk.error.exportFailed`, success →
  `bulk.exported` with `{count}`.
- **V-11 / C-40-4.** `views.degraded` is one `text-xs text-muted-foreground` line beneath the bar. No
  `Alert`, no `destructive`, no red — the gate asserts both words are absent from the file.

Catalog coverage: **all 18 bar-level `views.*` keys, all 3 `views.export.*` keys, and the 2 REUSED
`bulk` keys**, asserted exhaustively rather than counted by hand. Accent budget: **zero
`variant="default"`**, and the file's only `text-primary` is on the spinner.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 3 (RED) | The V-40-5 gate, written first | `4739824` | `__tests__/saved-views-bar-wiring.test.ts` |
| 1 + 2 (GREEN) | The bar: picker, resolver, export/save/manage wiring | `29e0dfc` | `saved-views-bar.tsx` |

## The RED Count

**15/15 failing**, every one with
`ENOENT: no such file or directory, open 'src/components/views/saved-views-bar.tsx'`. The gate was
written before the component existed and failed for the right reason — the absent file, not a typo in
a class name. After the component: **15/15 passing**.

## The Negative Proofs — FOUR REQUESTED, FIVE RUN

### Proof (a) — a ninth property on `SavedViewsBarProps` (assertion 1)

Added `urlFilters: ViewFilters` to the interface in `types.ts`. Result: **1 failed, 14 passed**, and
the failure NAMES the offending property:

```
AssertionError: src/lib/views/types.ts: SavedViewsBarProps must declare exactly 8 properties (B-2).
Found 9: entityType, views, selectedViewId, isModified, droppedFilterKeys, canSave, canExport,
canUpdateSelected, urlFilters. A NINTH property means a derivation moved to the client; a MISSING one
means the server stopped computing something the bar renders. B-2: isModified and droppedFilterKeys
BOTH manifest as "the URL differs from the stored blob", and only the server knows which — a key the
user changed, or a key the read-side validator dropped because its target no longer exists. A client
that compares the two labels every DEGRADED view "Modified" and invites the user to save the damage.
: expected 9 to be 8 // Object.is equality
```

That is the parsed read working as intended: the count moved AND the list is in the message, so the
failure tells you which property to remove without opening the file. Restored; 15/15 green.

### Proof (b) — the exact defect B-2 exists to prevent (assertion 2)

Added, verbatim from the plan:
`const urlFilters = filters` + `const isModified = urlFilters.stage === selectedView?.filters.stage`.
Result: **1 failed, 14 passed**:

```
AssertionError: src/components/views/saved-views-bar.tsx: the URL is compared against a stored
filters blob. B-2: isModified and droppedFilterKeys BOTH manifest as "the URL differs from the stored
blob", and only the server knows which — a key the user changed, or a key the read-side validator
dropped because its target no longer exists. A client that compares the two labels every DEGRADED
view "Modified" and invites the user to save the damage.: expected '"use client"\n\n\n\nimport {
ChevronD…' not to match /(searchParams|urlFilters)[^;\n]*(===|…/
```

This is the proof that makes the gate worth having. The defect it plants is invisible in every other
check in the repo: the component still compiles, the list still filters, and the only symptom is that
a view whose `stage` id was silently dropped on read gets labelled "Modified" and offered for
overwrite.

### Proof (b2) — the sharpest half, proved separately (NOT requested; run because it had to be)

Assertion 2 has three halves and vitest stops at the first failing `expect`, so proof (b) exercised
only the URL-versus-blob regex and left the `const isModified =` half unverified. Replaced the
comparison with a declaration that carries no comparison at all —
`const isModified = Boolean(filters.stage)`. Result: **1 failed, 14 passed**, and it was the other
half that fired:

```
AssertionError: src/components/views/saved-views-bar.tsx: isModified is DECLARED in this file. It is
a prop, computed on the server, and nothing here may recompute it. B-2: isModified and
droppedFilterKeys BOTH manifest as "the URL differs from the stored blob", and only the server knows
which — a key the user changed, or a key the read-side validator dropped because its target no longer
exists. A client that compares the two labels every DEGRADED view "Modified" and invites the user to
save the damage.: expected [ 2615 ] to deeply equal []
```

So neither half of assertion 2 is vacuous — the same gap 40-09 found in its own assertion 7 and
closed with proof (a2). Restored; 15/15 green.

### Proof (c) — a local clamp on the height-safe menu (assertion 7)

Added `max-h-96` to `DropdownMenuContent`'s className. Result: **1 failed, 14 passed**, and the
failure quotes the offending tag:

```
AssertionError: src/components/views/saved-views-bar.tsx: the <DropdownMenuContent> opening tag must
declare no max-h- class of its own (M-7, O-1). The primitive is height-safe BY CONSTRUCTION —
max-h-(--radix-dropdown-menu-content-available-height) + overflow-y-auto — and tailwind-merge would
silently drop the primitive's class in favour of a local one, turning the phase's one height-safe
overlay into an unbounded menu. That is also why the menu needs no cap and no paging (V-7). Tag:
<DropdownMenuContent align="start" className="max-h-96 max-w-[calc(100vw-2rem)]">
: expected '<DropdownMenuContent align="start" cl…' not to contain 'max-h-'
```

Note what this proof also establishes: the assertion is scoped tightly enough that the coexisting
`max-w-[calc(100vw-2rem)]` does **not** trip it. A width cap is not a height cap.

### Proof (d) — reinstating the 40-05 defect (assertion 3b)

Swapped `selectView`'s `withViewSelection(entityType, view.filters, view.id)` for
`withViewEscape(entityType, filtersToSearchParams(entityType, view.filters))`. Result: **1 failed, 14
passed**:

```
AssertionError: src/components/views/saved-views-bar.tsx: exactly one router.push must build its
query with withViewSelection( — the navigation that OPENS a view. Found 0. withViewEscape DELETES an
unparsed view key, so using it for a SELECTION silently drops the selection and returns the bar to the
state plan 40-05 measured: 10 URLs x 3 views, ZERO modified — a picker that can never report
"Modified", a dead views.saveChanges row, and a save dialog whose target RadioGroup can never appear.
It is invisible in a screenshot: the list filters correctly and only the badge is wrong.
: expected +0 to be 1 // Object.is equality
```

This is the defect the whole of plan 40-18 existed to remove, and it is the one a reviewer cannot see:
the list filters correctly, `?view=none` appears in the address bar, and only the picker's label and
badge are wrong.

All five restorations were done with `git checkout -- <file>`; `git status --porcelain` is empty and
`npx vitest run src/components/views/` is **38 passed, 0 failed** (15 + 13 + 10 across the three
40-* gates).

## Imported or Copied? (the plan asked twice)

**The four JSX extractors were IMPORTED. The download idiom was COPIED IN SHAPE. Zero brace matchers
and zero tag matchers entered the repo.**

- **Extractors — imported.** `openingTagAt`, `tagIndexes`, `elementRegion` and `callArguments` come
  from `@/components/custom-fields/__tests__/source-scan`, where 40-09 promoted them. This gate's six
  local helpers (`openingTags`, `soleOpeningTag`, `tagContaining`, `tagCarrying`, `offsetsOf`,
  `occurrences`, `hasClass`, `textRuns`) are one-line compositions over those four plus a `split` and
  a `matchAll`. `enclosingConditional` was the one promoted extractor this gate did **not** need — its
  assertions are all element-scoped rather than branch-scoped.
- **The one body this gate slices without them** is the `export interface SavedViewsBarProps { … }`
  block in `types.ts`, and it is bounded by a **`}` at column ZERO** — Prettier's shape for a
  top-level declaration in this repo — rather than by brace counting. A nested inline object type
  would be indented and therefore cannot close the region early. That choice is stated at the call
  site so the next reader does not "fix" it into a third brace matcher.
- **The downloader — copied, and the reason is a gate.**
  `src/components/bulk/__tests__/bulk-action-bar-wiring.test.ts:373` asserts the literal
  `URL.createObjectURL` appears in `bulk-action-bar.tsx` itself, in a vocabulary table AND in a
  dedicated test. Lifting the idiom into a shared helper and importing it from there would turn that
  Phase 38 gate **red** — which is squarely "touching `bulk-action-bar.tsx`'s behaviour" in the sense
  the plan meant. Lifting it while leaving the original in place would be a fourth downloader wearing
  a shared name. So: copied in shape, `downloadCsv` at module scope, revoke included, and the reason
  written into the function's own doc comment. There are now four copies of this ~10-line idiom
  (`admin/export/export-form.tsx`, `workflows/[id]/edit/components/toolbar.tsx`,
  `bulk-action-bar.tsx`, and this file); consolidating them means editing that Phase 38 gate, which
  belongs on `.planning/BACKLOG.md` beside the two brace matchers, not inside a plan about one bar.

## Deviations from Plan

### 1. [Scope] Tasks 1 and 2 are ONE commit, not two

- **Plan said:** task 1 is "the picker and the save resolver", task 2 is "export, save and manage
  wiring" — two tasks over one file.
- **Why they collapsed:** the eight props are destructured in a single parameter pattern. Any commit
  that renders slot 1 without the export item leaves `canExport` unused, which `npx eslint
  src/components/views` reports as `@typescript-eslint/no-unused-vars` — **a new warning in a new
  file**, which is precisely the bar 40-09 set ("0 errors, 125 warnings — all pre-existing, none in
  the new or modified files"). The alternatives were a commit with a new lint warning, or a commit
  with inert menu items — a stub. Measured, not assumed: the intermediate version was written,
  typechecked (0 errors) and linted, and produced exactly one warning on `canExport`.
- **What was NOT lost:** every item of both task lists is in `29e0dfc`, and both tasks' `<done>`
  criteria are verified below.
- **Precedent:** 40-08 and 40-09 each recorded the same collapse for the same structural reason.

### 2. [Rule 2 - Missing functionality] `handleSelect` ignores a value naming no view

- **Issue:** `onValueChange` hands back a string. If a view is deleted by its owner between the server
  render and the click — the exact race D-4 and the "default view was deleted" state matrix row
  describe — `views.find` returns `undefined` and a bare
  `selectView(views.find(…)!)` would throw in the browser, on a click, with no error boundary above
  these routes (M-14).
- **Fix:** `if (picked === undefined) return`. A stale value is a **no-op**, not a navigation to
  nowhere and not a crash. The menu stays open, the next server render drops the row.
- **Files:** `src/components/views/saved-views-bar.tsx`

### 3. [Deviation from the plan's literal wording] The radio items keep the primitive's horizontal padding

- **Plan said:** "Override the vertical half to `py-2`; keep `px-2` so a view item and `Manage views`
  share one left edge."
- **Issue:** those two clauses cannot both hold. `DropdownMenuItem` ships `px-2`, but
  `DropdownMenuRadioItem` ships `pr-2 pl-8` — the `pl-8` is the **radio indicator's gutter**. Adding
  `px-2` to a radio item would override `pl-8` and draw the indicator on top of the name; omitting it
  leaves the two item kinds on different left edges, which is what the second clause wanted to avoid.
- **Fix:** override **only** the vertical half (`py-2`, plus `flex-col items-start gap-0 min-w-0` for
  the two-line stack) and leave every horizontal class exactly as the primitive ships it. The
  indicator gutter is the primitive's own left edge and this component does not fight it. Recorded
  rather than silently resolved because the plan states the intent twice.
- **Gate impact:** none — assertion 8 asserts `py-2` on view radio items and says nothing about
  horizontal padding.
- **Files:** `src/components/views/saved-views-bar.tsx`

### 4. [Scope] The gate carries 15 assertions, not 14

The plan specified thirteen numbered items plus 3b. A fifteenth is not present — the count is 15
because **3b is its own `it`**, so the plan's own list is 14 `it` blocks and the file has 15. The
extra one is assertion **13's** split from 14: the plan folded "no hardcoded English" and "every key
referenced" into a single item 13, and they are separate `it`s here so a missing key and a hardcoded
sentence report as different failures. Nothing was added beyond the plan's list.

### 5. [Rule 2 - Missing functionality] The text-run extractor is anchored on real tags

- **Issue:** the plan says "Extract text nodes between `>` and `<`". Implemented literally that is
  **unsound in three ways** and I measured all three while writing it: `=>` in every arrow-function
  prop produces a `>`; `droppedFilterKeys.length > 0` produces a `>`; and a TypeScript generic such as
  `useState<boolean>` produces a `<` that is not a tag. Each one manufactures a phantom "text node"
  full of code, and `useTranslations("views")` inside such a run does **not** contain the literal
  `t("` — so the naive form false-positives on correct code.
- **Fix:** run boundaries are anchored on **real tags** — every `<Uppercase…` / `</Uppercase…` plus
  the three lowercase elements this file uses — with the promoted `openingTagAt` (string- and
  brace-aware) supplying the true end of each opening tag. A generic is never mistaken for a tag and a
  `>` inside a className string never ends a run. Then each run is checked two ways: no letters before
  its first brace or paren (a bare English child), and any run carrying a quote must also carry `t("`
  or `tBulk("` (a hardcoded literal in a child expression).
- **Known blind spot, stated in the gate rather than glossed:** a string literal inside an
  *unbalanced* JSX-expression fragment — `{cond ? "A" : <El/>}` — is not examined, because that run is
  code split across a tag boundary. Documented in assertion 13's own comment. Phase 39 shipped gates
  that claimed coverage they did not have; naming the gap is the alternative to repeating that.
- **Files:** `src/components/views/__tests__/saved-views-bar-wiring.test.ts`

### 6. [Note, not a deviation] `text-primary` IS on this spinner

40-08 removed `text-primary` from its submit spinner because that button is
`bg-primary text-primary-foreground`. This spinner sits in slot 2 on the **page background**, so the
plan's literal `Loader2 className="text-primary animate-spin"` is correct here and is kept. The
accent-budget assertion was written to require exactly this: every element carrying `text-primary`
must also carry `animate-spin`, paired with an anti-vacuity half requiring an `animate-spin` element
to exist.

## Authentication Gates

None. No CLI, no credential, no external service. The export action authorizes server-side; the bar
only asks.

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**, 125 warnings — all pre-existing, **none in the new files** |
| `npx eslint src/components/views` | "No issues found" |
| `npx vitest run` (full suite) | **3661 passed, 0 failed**, 28 skipped — 3646 baseline + the 15 new |
| `npx vitest run --config vitest.rsc.config.ts` | **8 passed, 0 failed** |
| The 40-10 gate | **15/15 green**, every assertion scoped to an extracted element or a parsed declaration |
| The 40-08 and 40-09 gates | **13/13 and 10/10 green** — unchanged, nothing adapted |
| Negative proofs | **all four RUN, plus a fifth**, verbatim above |
| `git diff e38f717 HEAD -- src/messages` | **empty** — `REQUIRED_BULK_KEYS` untouched, zero new keys |
| `git diff e38f717 HEAD -- src/components/ui` | **empty** — no primitive edited |
| `git diff e38f717 HEAD -- package.json package-lock.json` | **empty** — no `shadcn add`, no `cmdk`, no dependency bump (T-40-SC) |
| `git diff --diff-filter=D e38f717 HEAD` | **empty** — nothing deleted |
| Working tree after the proofs | clean (`git status --porcelain` empty) |
| Whole-plan diff | exactly two files, both new, 1369 insertions |

Task 1's `<done>`: typecheck 0, lint 0 errors, all 18 `views.*` bar keys referenced (asserted
exhaustively by assertion 14), and **zero** `Popover`, `DropdownMenuSubContent`, `sticky` or `fixed`
in the file (assertions 3 and 4). Task 2's `<done>`: `URL.revokeObjectURL` present exactly once, zero
`useEffect`, and `git diff` on `locale-parity.test.ts` empty.

Nothing was measured. **The 320px / 640px measurement of this bar belongs to plan 40-15**, and the
gate's header says so in its own words so it cannot be mistaken for that proof. No Docker rebuild was
run — 40-15 owns the phase's only one.

## What Plan 40-15 Must Still Prove

The gate knows the classes and wiring that make the right outcomes POSSIBLE. It does not know that:

1. the picker trigger is trial-clickable at 320x640 and the menu's box sits inside the viewport top
   and bottom (R-40-1 steps 2 and 4 — the two F-39-07 needed and lacked);
2. the two-line view items are legible and the state words survive at 241px, un-truncated;
3. the row's wrap to two lines actually happens in es-ES rather than producing horizontal scroll;
4. `views.exporting` is visible in slot 2 for the duration of a real export, and the CSV lands.

## What Plan 40-14 Must Still Do

This plan built the component and mounted nothing. The four host mount points, the server resolver
call that supplies the eight props, and the `key={search}` re-sync of the three search `<Input>`s
(B-6, measured M-9 as broken today) are all 40-14's.

## Known Stubs

None. The two branches this plan could plausibly have stubbed are both fully built: slot 2's
`views.saveChanges` row (structurally unreachable before 40-18, and assertion 3b is what keeps it
reachable) and the `!canExport` disabled export item with its adjacent reason. `views.emptyMenu`,
`views.degraded` and `views.needsFilter` — the three states a first-time user reaches before any view
exists — all render real copy from the catalog.

## Threat Flags

None. The bar adds no endpoint, no auth path, no file access and no schema change. Its three trust
boundaries were already in the register and are mitigated where the register says: the shared group is
a client-side GROUPING of an already-scoped list and the SQL predicate in 40-05 is the control
(T-40-44); every navigation goes through `withViewSelection` or `withViewEscape`, both of which narrow
the id and rewrite the whitelist (T-40-45); the local declaration of `isModified` is forbidden by the
gate (T-40-46); the in-flight state is a transition's `isPending` and every blob is revoked (T-40-47);
`DropdownMenuContent`'s clamp cannot be overridden (T-40-48); and no package was installed — the
picker is a `DropdownMenu`, not a `Command`, so **no `cmdk`** (T-40-SC).

## Self-Check: PASSED

| Claim | Verified |
|---|---|
| `src/components/views/saved-views-bar.tsx` | FOUND |
| `src/components/views/__tests__/saved-views-bar-wiring.test.ts` | FOUND |
| `src/lib/views/types.ts` declares `SavedViewsBarProps` with 8 properties | FOUND (parsed by assertion 1) |
| commit `4739824` (RED gate) | FOUND |
| commit `29e0dfc` (the bar) | FOUND |

Worktree mode: **`STATE.md` and `ROADMAP.md` were deliberately NOT touched** — the orchestrator owns
those writes after the wave merges.
