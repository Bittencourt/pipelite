---
phase: 45-cross-cutting-ui-repair-and-uat-closure
plan: 07
subsystem: ui
tags: [cmdk, radix, next-intl, react, search, source-gate]

# Dependency graph
requires:
  - phase: 45-01
    provides: the shell message keys (nav.searchDescription) the mobile search surface will pass to CommandDialog
provides:
  - CommandDialog forwards shouldFilter and loop to its inner Command, so a caller can turn cmdk's client-side filter off
  - SearchResults — the single copy of the three result groups and the no-results fallback
  - SearchResultsData — the /api/search payload type, now importable by any search surface
  - a behaviour-neutral global-search.tsx that consumes the shared tree
affects: [45-10 mobile search surface, any future command-palette caller]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "destructure-then-forward on CommandDialog, matching dialog.tsx's showCloseButton idiom"
    - "presentational tree shared by two surfaces, with the container-closing behaviour passed as onSelect"

key-files:
  created:
    - src/components/ui/__tests__/command-dialog-wiring.test.ts
    - src/components/global-search/search-results.tsx
  modified:
    - src/components/ui/command.tsx
    - src/components/global-search/global-search.tsx
    - src/components/global-search/index.tsx

key-decisions:
  - "shouldFilter/loop are destructured out of ...props rather than added to the type alone — the rest spread lands on the Radix Dialog root, so a declared-but-unforwarded prop reproduces the exact bug while looking correct in a diff"
  - "The SearchResultsData payload type moved into search-results.tsx because the component's name collides with the old local `interface SearchResults` — a same-name type and a same-name imported value cannot coexist in one module"
  - "hasResults is coerced at the JSX call site (Boolean(hasResults)) rather than by changing the popover's hasResults expression, keeping global-search.tsx behaviour-neutral"
  - "tNav was removed from global-search.tsx because both its uses travelled with the lifted tree; 45-10 re-adds it for the CommandDialog title/description props"
  - "SearchResults joins the directory barrel — nav-header.tsx imports through ./global-search, i.e. index.tsx, so the barrel is this directory's real module boundary"

patterns-established:
  - "Forwarding gate: extract the opening tag of the target element and assert the forwarded text INSIDE it, so a prop forwarded to the wrong element cannot pass"
  - "Move-not-copy gate: assert the moved-from file contains the moved token ZERO times — the only formulation that distinguishes a move from a copy"

requirements-completed: [SC-1, SC-3]

# Metrics
duration: 12min
completed: 2026-08-18
---

# Phase 45 Plan 07: CommandDialog Forwarding and the SearchResults Lift Summary

**`CommandDialog` can now disable cmdk's UUID-blind client-side filter, and the three search result groups live in one shared `SearchResults` component instead of inline in the desktop popover.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-18T09:35:00Z
- **Completed:** 2026-08-18T09:47:01Z
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Removed the blocker 45-UI-SPEC missed: `CommandDialog` spread `...props` onto the Radix `Dialog`
  root, so there was no path at all from a caller to cmdk's `shouldFilter`. Since cmdk defaults it
  to `true` and filters each item against that item's `value` — and every item in this app is
  `value={<uuid>}` — a mobile search dialog would have rendered its empty state for every query
  while the search request returned 200. Both `shouldFilter` and `loop` are now destructured out of
  the rest spread and passed explicitly to the inner `<Command>`.
- Lifted the entire results subtree (three `CommandGroup` blocks + the `CommandEmpty` fallback) out
  of `global-search.tsx` into `src/components/global-search/search-results.tsx` as a move, not a
  copy — `CommandGroup` now appears **zero** times in `global-search.tsx`.
- Gated both facts with a comment-blind source-scan test that distinguishes "prop declared on the
  type" from "prop forwarded to the right element", and "tree extracted" from "tree duplicated".
- The desktop popover is behaviour-neutral: same outer `<Command shouldFilter={false} loop>`, same
  `/` hotkey, same `w-64 pl-9 pr-9` input, same fetch, same groups, same copy.

## Task Commits

Each task was committed atomically:

1. **Task 1: Gate the forwarding and the extraction (RED)** — `a7a1eb5` (test)
2. **Task 2: Forward shouldFilter and loop from CommandDialog** — `4893810` (feat)
3. **Task 3: Lift the results tree into SearchResults** — `7af56c9` (refactor)

TDD gate sequence: RED at `a7a1eb5` (10 failed / 6 passed, failure output naming both
`search-results.tsx` and `shouldFilter`), GREEN across `4893810` (forwarding half green, 9/16) and
`7af56c9` (16/16).

## Files Created/Modified

- `src/components/ui/__tests__/command-dialog-wiring.test.ts` — **created.** The wiring gate. Reads
  all three sources through `readStrippedSource`, guards the new module with `existsSync` so a
  missing file cannot abort the `command.tsx` half, extracts `CommandDialog`'s destructure list and
  the inner `<Command>` opening tag separately, and iterates two vocabulary tables.
- `src/components/ui/command.tsx` — **modified.** `shouldFilter` / `loop` added to `CommandDialog`'s
  destructure and inline props type, forwarded to the inner `<Command>`. The `<Command>` tag was
  split across lines to take them; its className string is byte-identical (verified by extraction
  and comparison against `HEAD`, not by eye).
- `src/components/global-search/search-results.tsx` — **created.** `"use client"`, named export
  `SearchResults`, plus the exported `SearchResultsData` payload type. Holds no state, fetches
  nothing, imports no router, renders no `CommandList`.
- `src/components/global-search/global-search.tsx` — **modified.** Renders `<SearchResults …/>`
  inside its existing `<CommandList>`; imports trimmed to what it still uses.
- `src/components/global-search/index.tsx` — **modified.** Re-exports `SearchResults` and
  `SearchResultsData`.

## Decisions Made

- **The `SearchResults` name collided with itself.** `global-search.tsx` already declared a local
  `interface SearchResults` for its results state. An import declaration binds both a type and a
  value, so `import { SearchResults }` alongside `interface SearchResults` is a duplicate
  identifier. The payload type therefore moved into `search-results.tsx` as the exported
  `SearchResultsData` — which is also where it belongs, since that module is the only structural
  reader of it. `global-search.tsx` imports it back as a type-only import.
- **`hasResults` is coerced at the call site.** The popover's `hasResults` expression evaluates to
  `boolean | null` (`results && (…)` yields `null` when `results` is `null`). Rather than change
  that expression — the plan requires this file to be behaviour-neutral — the JSX passes
  `hasResults={Boolean(hasResults)}`. `SearchResults` keeps the plain `hasResults: boolean` prop the
  interface contract specifies, and still takes `results` as nullable so the moved `results!`
  assertions stay verbatim.
- **`tNav` left `global-search.tsx`.** Both of its uses (`tNav("organizations" | "people" | "deals")`)
  were inside the lifted subtree, so the binding became dead. `SearchResults` binds
  `useTranslations("common")` and `useTranslations("nav")` itself, per this repo's multiple-namespace
  convention. 45-10 re-adds a `nav` binding to `global-search.tsx` for the `CommandDialog`
  title/description props (rule S-7).
- **`SearchResults` joined the barrel.** `nav-header.tsx` imports `{ GlobalSearch } from "./global-search"`,
  which resolves to the directory's `index.tsx`. The barrel is this directory's real module
  boundary, so the plan's conditional resolved to yes.

## Deviations from Plan

None — plan executed exactly as written. The three items under "Decisions Made" are mechanical
consequences the plan explicitly delegated (the type-sharing question, the barrel question), not
departures from it.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

- `npm run test` cannot exit 0 at the end of Task 2, contrary to that task's acceptance criteria:
  the gate is deliberately red on its extraction half until Task 3 lands. That is the TDD sequence
  the same plan mandates, not a failure. Verified instead that the gate was the **only** failing
  file in the suite (7 failed / 2100 passed, all 7 inside `command-dialog-wiring.test.ts`, and the
  three forwarding assertions flipped green). Both projects are green after Task 3: 96 files passed
  / 1 skipped, plus the 2-file RSC project.
- Lint warning count unchanged at 127 warnings / 0 errors across all three tasks — no new warnings
  introduced.

## Verification

| Check | Result |
|---|---|
| `vitest run src/components/ui/__tests__/command-dialog-wiring.test.ts` | 16/16 pass (was 10 failed / 6 passed at RED) |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors, 127 warnings (unchanged) |
| `npm run test` | 96 files passed / 1 skipped; RSC project 2 passed |
| `grep -c CommandGroup global-search.tsx` | 0 |
| `grep -c CommandGroup search-results.tsx` | 7 (≥ 3) |
| `grep -c CommandList search-results.tsx` | 0 |
| `grep -c "shouldFilter={false}" global-search.tsx` | 1 |
| `git diff global-search.tsx` touching `useHotkeys` or `w-64 pl-9 pr-9` | 0 lines |
| inner `<Command>` className vs `HEAD` | byte-identical |

No Docker rebuild was performed — VALIDATION rule V-7 assigns the phase's single rebuild to wave 4
(45-11). Verification here is by source gate and unit test only, as the plan requires.

## Known Stubs

None. `SearchResults` is fully wired: the popover renders it with live data, and every prop it
declares is supplied.

## Threat Flags

None. This plan added no network endpoint, no auth path, no file access and no schema change. The
two threats it was assigned to mitigate are both closed: T-45-25 (both props destructured out of the
rest spread, so neither can reach the Radix `Dialog` root as an unknown DOM attribute; the gate
asserts they reach the inner `<Command>`, not merely that they exist in the type) and T-45-26 (the
gate asserts `CommandGroup` appears zero times in `global-search.tsx`). T-45-27 remains accepted and
deferred to 45-10 as planned: `CommandDialog` still carries the hardcoded English `title` /
`description` defaults, and `DialogHeader` is still a sibling of `DialogContent` rather than a
child — so those strings render into the page whenever a `CommandDialog` is mounted. No
`CommandDialog` is mounted anywhere in the app today; 45-10 mounts the first one and rule S-7
requires it to pass both props.

## Next Phase Readiness

45-10 has everything it needs:

- `<CommandDialog shouldFilter={false} loop title={…} description={…}>` is now a working call.
- `SearchResults` renders inside whatever `CommandList` the dialog provides, with `onSelect` closing
  the dialog instead of the popover.
- `SearchResultsData` is importable for the mobile surface's own results state.

Two notes 45-10 must act on, recorded here so they are not rediscovered:

1. `DialogHeader` is a **sibling** of `DialogContent` in `CommandDialog`, not a child. The sr-only
   title and description therefore render into the page whenever the component is mounted, open or
   not. That is why S-7 requires both props be passed, and why a Playwright anchor should prefer
   roles over those strings.
2. `global-search.tsx` no longer binds `tNav`. 45-10 re-adds `useTranslations("nav")` there for
   `tNav("searchDescription")`.

---
*Phase: 45-cross-cutting-ui-repair-and-uat-closure*
*Completed: 2026-08-18*

## Self-Check: PASSED

All 6 claimed files exist on disk; all 3 task commits (`a7a1eb5`, `4893810`, `7af56c9`) exist in the
git history.
