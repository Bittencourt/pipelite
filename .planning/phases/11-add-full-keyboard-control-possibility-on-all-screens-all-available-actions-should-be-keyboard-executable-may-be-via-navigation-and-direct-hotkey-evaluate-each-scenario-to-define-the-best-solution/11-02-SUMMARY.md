---
phase: 11-keyboard-control
plan: 02
subsystem: ui
tags: [keyboard-shortcuts, navigation-hotkeys, shortcuts-overlay, search-focus, react-hotkeys-hook]

# Dependency graph
requires:
  - phase: 11-keyboard-control plan 01
    provides: HotkeysProvider, SHORTCUTS config, useHotkeys hook, :focus-visible CSS
  - phase: 08-search-filtering plan 01
    provides: GlobalSearch component for / focus shortcut
provides:
  - ShortcutsOverlay dialog showing all shortcuts organized by category
  - Global navigation hotkeys (Alt+1/2/3/4) for major sections
  - Search focus shortcut (/) for GlobalSearch input
  - First-use ShortcutsHint banner with localStorage persistence
  - NavHeader converted to client component with user prop pattern
affects: [11-03, 11-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [global navigation hotkeys via useHotkeys, Dialog-based shortcuts overlay, lazy localStorage initializer for SSR-safe state]

key-files:
  created:
    - src/components/keyboard/shortcuts-overlay.tsx
    - src/components/keyboard/shortcuts-hint.tsx
  modified:
    - src/components/keyboard/index.ts
    - src/components/nav-header.tsx
    - src/app/layout.tsx
    - src/components/global-search/global-search.tsx

key-decisions:
  - "NavHeader converted to client component with user prop - auth() moved to layout.tsx server component"
  - "NavHeader moved inside HotkeysProvider to access useHotkeys context"
  - "Lazy localStorage initializer for ShortcutsHint to satisfy React effect lint rules"
  - "shift+/ for shortcuts overlay (consistent with hotkey-config from plan 01)"

patterns-established:
  - "Navigation hotkeys: Alt+N for section navigation registered in NavHeader with global scope"
  - "Shortcuts overlay: Dialog component reading from centralized SHORTCUTS config"
  - "Search focus: useHotkeys('/') with inputRef.current?.focus() pattern"
  - "First-use hint: localStorage flag with lazy initializer and auto-dismiss timer"

# Metrics
duration: 5min
completed: 2026-03-01
---

# Phase 11 Plan 02: Global Shortcuts & Navigation Summary

**Shortcuts overlay dialog, Alt+1/2/3/4 section navigation, / search focus, and first-use hint banner for keyboard shortcut discovery**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-01T23:38:58Z
- **Completed:** 2026-03-01T23:44:44Z
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments
- ShortcutsOverlay dialog displays all shortcuts from centralized config, organized by category with styled kbd elements
- Alt+1/2/3/4 navigate to Deals/People/Organizations/Activities from any page via global-scoped hotkeys
- Pressing / focuses the global search input with preventDefault to avoid typing / into the field
- First-use ShortcutsHint banner appears at bottom of screen, auto-dismisses after 10s, persists dismissal in localStorage

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ShortcutsOverlay component** - `b38c711` (feat)
2. **Task 2: Create ShortcutsHint component for first-use display** - `ec4658d` (feat)
3. **Task 3: Add global navigation shortcuts to NavHeader** - `f300990` (feat)
4. **Task 4: Add / shortcut to focus global search** - `02e827e` (feat)

**Lint fix:** `6d55e16` (fix) - Resolved lint errors in shortcuts-hint and nav-header

## Files Created/Modified
- `src/components/keyboard/shortcuts-overlay.tsx` - Dialog overlay showing all keyboard shortcuts by category
- `src/components/keyboard/shortcuts-hint.tsx` - First-use hint banner with localStorage persistence
- `src/components/keyboard/index.ts` - Barrel export updated with ShortcutsOverlay and ShortcutsHint
- `src/components/nav-header.tsx` - Converted to client component with Alt+1/2/3/4 navigation and ? overlay
- `src/app/layout.tsx` - Calls auth(), passes user to NavHeader, includes ShortcutsHint, NavHeader inside HotkeysProvider
- `src/components/global-search/global-search.tsx` - Added / hotkey for search focus with inputRef

## Decisions Made
- Converted NavHeader from server to client component -- auth() call moved to layout.tsx which passes user as prop; necessary for useHotkeys and useState
- Moved NavHeader inside HotkeysProvider in layout.tsx -- useHotkeys requires HotkeysProvider context, so NavHeader must be a child of it
- Used lazy initializer function for useState in ShortcutsHint to avoid calling setState inside useEffect (React compiler lint rule)
- Replaced `<a href="/">` with `<Link href="/">` in NavHeader for proper Next.js client navigation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Moved NavHeader inside HotkeysProvider**
- **Found during:** Task 3 (Add global navigation shortcuts to NavHeader)
- **Issue:** NavHeader was outside HotkeysProvider in layout.tsx, so useHotkeys would fail without provider context
- **Fix:** Restructured layout.tsx to place NavHeader inside HotkeysProvider
- **Files modified:** src/app/layout.tsx
- **Verification:** Build passes, hotkeys registered correctly
- **Committed in:** f300990 (Task 3 commit)

**2. [Rule 1 - Bug] Fixed lint errors in shortcuts-hint and nav-header**
- **Found during:** Overall verification (lint check)
- **Issue:** React compiler lint rule flagged setState inside useEffect; Next.js lint rule flagged `<a>` for internal navigation
- **Fix:** Used lazy initializer for useState; replaced `<a href="/">` with `<Link href="/">`
- **Files modified:** src/components/keyboard/shortcuts-hint.tsx, src/components/nav-header.tsx
- **Verification:** `npm run lint` passes for changed files, `npm run build` succeeds
- **Committed in:** 6d55e16 (separate fix commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All global shortcuts active: Alt+1/2/3/4 navigation, / search focus, ? shortcuts overlay
- ShortcutsHint guides first-time users to discover shortcuts
- Ready for plan 11-03 (list/kanban keyboard navigation) and plan 11-04 (form/dialog keyboard control)
- SHORTCUTS config provides categories that future plans can extend

## Self-Check: PASSED

All 6 created/modified files verified on disk. All 5 commit hashes found in git log.

---
*Phase: 11-keyboard-control*
*Completed: 2026-03-01*
