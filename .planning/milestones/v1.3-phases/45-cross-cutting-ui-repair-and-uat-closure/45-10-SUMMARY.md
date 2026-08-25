---
phase: 45-cross-cutting-ui-repair-and-uat-closure
plan: 10
subsystem: ui
tags: [responsive, cmdk, next-intl, flexbox, source-gate, header]

# Dependency graph
requires:
  - phase: 45-01
    provides: nav.workflows and nav.searchDescription in all three locales
  - phase: 45-07
    provides: CommandDialog forwarding shouldFilter/loop, and the shared SearchResults tree + SearchResultsData type
provides:
  - the header's 256px non-shrinkable search input leaves the flex row below md
  - a 40px icon trigger opening a translated, unfiltered CommandDialog search surface
  - min-w-0 on both header clusters, so justify-between can shrink
  - t("workflows") — the last hardcoded label in the main nav
affects: [45-11 rebuild and the viewport-320 e2e turn to green]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS-only responsive collapse: render both controls, `hidden md:block` / `md:hidden` choose between them"
    - "breakpoint read at EVENT TIME via window.matchMedia inside the handler — never in state, never in an effect"
    - "two surfaces, one results tree, separate query state"

key-files:
  created:
    - src/components/__tests__/header-shell-wiring.test.ts
  modified:
    - src/components/global-search/global-search.tsx
    - src/components/nav-header.tsx

key-decisions:
  - "The dialog keeps its OWN query/results/loading state rather than sharing the popover's — the popover is anchored to a wrapper that is display:none below md, so a shared query would drive Radix to position a floating panel against a zero-sized node"
  - "min-w-0 goes AFTER `hidden md:flex` on the nav, not between the two: that class pair is the single collapse point the whole responsive contract pins to, and splitting it broke the gate's own contiguity assertion"
  - "handleDialogOpenChange resets and cancels on BOTH edges, so a closed dialog never searches and a late response can never leave stale results behind an empty query"
  - "runSearch and hasAnyResult lifted to module scope so both surfaces issue the same request through one code path instead of two debounced copies"
  - "openingTag/countOccurrences duplicated locally in the new gate rather than promoted into source-scan.ts — a plan whose own gate depends on a helper is the worst place to refactor that helper, and source-scan.ts is outside this plan's three files"

patterns-established:
  - "Assert a responsive class PAIR as a contiguous string, so inserting a utility between the two halves fails loudly"
  - "Policing a label that is also a legitimate product noun: assert the JSX forms (>Label< and label-alone-on-a-line), never the bare word"

requirements-completed: [SC-1, SC-3]

# Metrics
duration: 12min
completed: 2026-08-18
---

# Phase 45 Plan 10: The Header Collapse and the Last Nav Literal Summary

**The 256px search input no longer sits in a 241px header: below `md` it leaves the flex row entirely for a 40px icon that opens a translated, unfiltered search dialog, both clusters can finally shrink, and the workflows link reads from the catalog like the six links beside it.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-18T08:33:00Z
- **Completed:** 2026-08-18T08:45:00Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- **The arithmetic behind the overflow is gone, not disguised.** `w-64` is 256px; the document
  reports a 305px client width at a 320px viewport and the global container gutter takes 64 of
  those, leaving 241 usable. 256 + 16 (`gap-4`) + 40 (avatar) never fit. The inline input's wrapper
  is now `relative hidden md:block`, so below `md` the whole control leaves the row rather than
  shrinking into an 84%-of-viewport strip. The `Input` itself is byte-identical at
  `className="w-64 pl-9 pr-9"`.
- **Search survives the collapse.** A ghost `size="icon-lg"` (40px) `Search` trigger, `md:hidden`,
  opens a `CommandDialog` carrying `title={t("search")}`, `description={tNav("searchDescription")}`,
  `showCloseButton={false}`, `shouldFilter={false}` and `loop` — the exact call 45-07 made possible.
  It renders the same `SearchResults` tree the popover renders, so the two surfaces cannot drift.
- **The `/` hotkey acquired a second target without acquiring any state.**
  `window.matchMedia("(min-width: 768px)").matches` is read inside the handler, at event time:
  above `md` it focuses the inline input, below it opens the dialog. The file contains zero
  `useEffect`, zero `useMediaQuery` and zero `window.innerWidth`, so it costs neither a hydration
  mismatch nor a `react-hooks/set-state-in-effect` error (severity 2 in this repo).
- **Both header clusters can shrink.** `min-w-0` now appears 5 times in `nav-header.tsx` — the two
  clusters plus the three direct flex children that carry a class. A flex item's default
  `min-width: auto` is what refused to shrink below its content and produced the measured
  `scrollWidth` of 420 against a `clientWidth` of 305 on every main route.
- **S-5 closed.** The last hardcoded nav label became `{t("workflows")}`.
- **A new gate that cannot be satisfied by prose.** `header-shell-wiring.test.ts` reads all three
  sources comment-blind, and asserts the dialog's four props on the SAME extracted opening tag — a
  `title` on one element and a `description` on another would satisfy a file-wide check while
  leaving one hardcoded English default in place.

## Task Commits

Each task was committed atomically:

1. **Task 1: the header-shell source gate (RED)** — `eb2aef5` (test)
2. **Task 2: collapse the header search below md** — `19ea3b4` (feat)
3. **Task 3: min-w-0 on both clusters and t("workflows") (GREEN)** — `c8b4999` (feat)

TDD gate sequence: RED at `eb2aef5` (10 failed / 11 passed, the failure output naming both
`CommandDialog` and `min-w-0`), GREEN across `19ea3b4` (search half green, 3 failed / 18 passed —
all three remaining failures in the nav-header half Task 3 owns) and `c8b4999` (21/21).

## Files Created/Modified

- `src/components/__tests__/header-shell-wiring.test.ts` — **created.** 21 assertions over
  `nav-header.tsx`, `global-search.tsx` and `search-results.tsx`, all read through
  `readStrippedSource`. Anti-vacuity first (three non-empty reads, then three positive markers),
  then the responsive pair, the shrink allowance, the four dialog props on one extracted tag, the
  hotkey's event-time read plus its three forbidden idioms, the label in its two JSX forms, the
  colour-token scan on both component files, the catalog lookups, and two iterated vocabulary
  tables.
- `src/components/global-search/global-search.tsx` — **modified.** Gained `tNav`, four pieces of
  dialog state, a second debounced fetch, the icon trigger and the `CommandDialog`; the popover's
  markup is unchanged apart from `hidden md:block` on its wrapper. `runSearch` and `hasAnyResult`
  moved to module scope so both surfaces share one request path.
- `src/components/nav-header.tsx` — **modified.** Six lines: five `min-w-0` insertions and the
  label. 6 insertions, 6 deletions.

## Decisions Made

- **The dialog does not share the popover's query state.** The popover's `PopoverAnchor` wraps the
  wrapper that is now `display: none` below `md`. A shared query would run
  `fetchResults` → `setOpen(true)` while the user typed in the dialog, and Radix would position a
  floating panel against a zero-sized node. Separate state is also what allows the dialog to reset
  itself on every open, which a shared query could not do without clobbering the desktop input.
- **The dialog is reset and cancelled on BOTH edges of `onOpenChange`.** Cancelling on close is what
  the plan asked for — a debounced call scheduled by the last keystroke must not fire after its
  surface is gone. Resetting on OPEN closes the mirror hole: a request already in flight when the
  dialog closed still resolves and writes to `dialogResults`, so without the inbound reset the next
  open would show the previous session's results under an empty query.
- **`runSearch` returns `null` on a non-OK response rather than throwing.** That preserves the
  desktop popover's long-standing behaviour exactly: a failed request leaves the previous results
  and the previous open state alone rather than blanking the list under the user's cursor.
- **The dialog's loading state replaces the results tree rather than overlaying it.** `SearchResults`
  renders `CommandEmpty` whenever it has nothing, so a spinner rendered beside it would print a
  spinner and "no results" simultaneously for the whole 300ms debounce window.
- **`min-w-0` sits after `hidden md:flex`, not inside it.** See Issues below — the gate caught this,
  which is the first thing this file's own contiguity assertion has ever been asked to do.
- **The two extraction helpers were copied, not promoted.** `openingTag` and `countOccurrences` also
  exist in `src/components/ui/__tests__/command-dialog-wiring.test.ts`. Promoting them into
  `source-scan.ts` would edit a fourth file, one that every source gate in the repo imports, inside
  the plan whose own gate depends on it. Recorded here as a known, deliberate duplication.

## Deviations from Plan

None — plan executed exactly as written. Every value in its `<interfaces>` block landed verbatim.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

- **The first `min-w-0` placement broke the gate's `hidden md:flex` assertion.** Writing
  `className="hidden min-w-0 md:flex …"` on the main nav split the class pair the whole responsive
  contract pins to, and the gate failed on the contiguity check written one commit earlier. Fixed in
  the source (`hidden md:flex min-w-0 items-center gap-4`), not in the gate — that assertion is
  doing exactly the job it was written for, and the two halves of a responsive pair being adjacent
  is how anyone greps for the app's collapse points.
- **`npm run test` cannot exit 0 at the end of Task 2**, contrary to that task's acceptance
  criteria: the gate is deliberately red on its nav-header half until Task 3 lands. That is the TDD
  sequence the same plan mandates. Verified instead that the gate was the ONLY failing file in the
  suite (100 files passed / 1 skipped, all 3 failures inside `header-shell-wiring.test.ts`, and all
  three naming a nav-header assertion). Green after Task 3.
- **Lint warning count unchanged at 127 warnings / 0 errors** across all three tasks. In particular
  `react-hooks/set-state-in-effect` never fires, because nothing in this change is in an effect.

## Verification

| Check | Result |
|---|---|
| `vitest run src/components/__tests__/header-shell-wiring.test.ts` | 21/21 pass (was 10 failed / 11 passed at RED) |
| `vitest run src/components/ui/__tests__/command-dialog-wiring.test.ts` | 16/16 still pass — `CommandGroup` is still zero in `global-search.tsx` |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors, 127 warnings (unchanged) |
| `npm run test` | 101 files passed / 1 skipped; RSC project 2 passed |
| `grep -c '>Workflows<' src/components/nav-header.tsx` | 0 |
| `grep -o 'min-w-0' src/components/nav-header.tsx \| wc -l` | 5 (≥ 2) |
| node source gate from the plan's `<verify>` block | `ok` |
| `git diff --stat src/app/globals.css` | empty |
| `git diff --stat src/app/trash` | empty |
| `git diff` touching the `useHotkeys` options object | 0 changed lines — the block moved below its handler, the object text is untouched |

No Docker rebuild was performed — VALIDATION rule V-7 assigns the phase's single rebuild to wave 4
(45-11). `e2e/viewport-320.spec.ts` therefore stays RED until then, which is correct: it measures
the running image, and the running image predates this change. Verification here is by source gate
and unit test only, as the plan requires.

## Known Stubs

None. Both search surfaces are fully wired: each has its own query state, its own request, and the
shared results tree with a working `onSelect`.

## Threat Flags

None. No network endpoint, no auth path, no file access and no schema change. Of this plan's four
assigned mitigations: T-45-37 is closed (`title` and `description` are asserted on the same
`CommandDialog` tag, so the hardcoded English defaults can never render); T-45-38 is addressed at
source and will be MEASURED closed by `e2e/viewport-320.spec.ts` after 45-11's rebuild; T-45-39 is
closed (`shouldFilter={false}` asserted on the dialog tag itself, not merely somewhere in the file);
T-45-40 remains accepted as planned — a resize with no re-render can leave the `/` hotkey acting on
the other surface for one keystroke, which is cosmetic.

## Next Phase Readiness

45-11 owns the phase's single rebuild. After `docker compose up -d --build app`:

- `e2e/viewport-320.spec.ts` should flip from 18/18 RED to green on the five main routes. The sixth
  route, `/admin/audit`, also depends on 45-09's admin drawer — its measured 491/518/537 is a
  different, larger overflow than the ~420 the header contributed.
- `e2e/theme.spec.ts` should flip green from 45-03.
- The mobile dialog is worth one manual look at 320px in es-ES: it is a brand-new surface, and the
  only surface in the app whose sr-only dialog header is supplied entirely from the catalog.

---
*Phase: 45-cross-cutting-ui-repair-and-uat-closure*
*Completed: 2026-08-18*

## Self-Check: PASSED

All 3 claimed files exist on disk; all 3 task commits (`eb2aef5`, `19ea3b4`, `c8b4999`) exist in the
git history.
