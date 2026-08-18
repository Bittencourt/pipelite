---
phase: 45-cross-cutting-ui-repair-and-uat-closure
plan: 04
subsystem: ui
tags: [next-intl, radix-ui, shadcn, i18n, accessibility, sheet, dialog, vitest]

# Dependency graph
requires:
  - phase: 45-01
    provides: the locale-gate contract lists and the three-locale message catalogs this plan reads common.close from
provides:
  - dialog.tsx close label defaulting from common.close at BOTH close sites, with a closeLabel override
  - src/components/ui/sheet.tsx — the shadcn Sheet primitive, translated at creation rather than retro-fitted
  - a source gate over dialog.tsx / sheet.tsx / alert-dialog.tsx pinning S-2, S-3 and S-4
affects: [45-09 admin drawer, 45-02 mobile search dialog, any future surface built on Sheet or Dialog]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared UI primitives bind their own useTranslations namespace and expose an optional label override, so no call site has to change"
    - "A registry block is translated in the same change that creates the file, before it has a first caller"

key-files:
  created:
    - src/components/ui/sheet.tsx
    - src/components/ui/__tests__/close-label-wiring.test.ts
  modified:
    - src/components/ui/dialog.tsx

key-decisions:
  - "The close-label default lives at the primitive, not at the ~16 call sites: one edit translates every dialog, and requiring each caller to pass a label is what let the English literal survive"
  - "DialogFooter got its own useTranslations binding and its own closeLabel prop rather than borrowing DialogContent's — they are two separate function components with two separate showCloseButton props"
  - "alert-dialog.tsx was NOT edited. S-3 is satisfied by asserting its current, correct absence of any hardcoded close string; adding an unrequested default would override translated copy its callers already pass"
  - "The unrequested radix-ui ^1.4.3 -> ^1.6.7 bump that `shadcn add sheet` wrote into package.json and package-lock.json was reverted per T-45-SC, and node_modules restored to the locked version"
  - "The shadcn block's export order and default classNames were left byte-faithful to the registry, so a future `shadcn diff` still compares cleanly"

patterns-established:
  - "Close-label pattern: `closeLabel?: string` intersected onto React.ComponentProps, destructured out of the rest spread, defaulted via `closeLabel ?? t(\"close\")`"
  - "Source-gate pattern extended: per-FUNCTION slices (sliceFunction) so one converted site cannot cover for a second site left untranslated"

requirements-completed: [SC-3]

# Metrics
duration: 12min
completed: 2026-08-18
---

# Phase 45 Plan 04: Dialog and Sheet Close Labels Summary

**Both dialog close controls and the newly added Sheet primitive now name themselves from `common.close` in the active locale, behind an optional `closeLabel` override, with a per-function source gate pinning all three primitives.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-18T06:59:40Z
- **Completed:** 2026-08-18T07:11:50Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `DialogContent`'s `sr-only` close label and `DialogFooter`'s visible outline Close button both read `closeLabel ?? t("close")`, so roughly sixteen existing call sites became translated with zero call-site edits.
- `src/components/ui/sheet.tsx` exists for the first time, added through the LOCAL `./node_modules/.bin/shadcn` devDependency, and shipped translated — the registry block's hardcoded `<span className="sr-only">Close</span>` never entered the repository's history in that form.
- `src/components/ui/__tests__/close-label-wiring.test.ts` (21 assertions) pins S-2, S-3 and S-4, the unified `radix-ui` import convention, the `use client` boundary, and the continued existence of `common.close` in the en-US catalog.
- The unrequested `radix-ui` major-ish bump the shadcn CLI performed was caught and reverted before it could reach a commit.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the close-label source gate (RED)** — `8749124` (test)
2. **Task 2: Default both dialog close sites from common.close** — `73f3234` (feat)
3. **Task 3: Add the Sheet primitive with the close label already routed (GREEN)** — `b469858` (feat)

_TDD gate sequence: `test(45-04)` → `feat(45-04)` → `feat(45-04)`. No refactor commit was needed; the GREEN implementation was already in the file shape the gate requires._

## Files Created/Modified

- `src/components/ui/__tests__/close-label-wiring.test.ts` — the source gate. Reads all three primitives through `readStrippedSource`, guards the (initially missing) `sheet.tsx` with `existsSync` so a missing file is reported by name instead of aborting the module, and slices `DialogContent` / `DialogFooter` / `SheetContent` separately so one translated site cannot cover for an untranslated sibling.
- `src/components/ui/dialog.tsx` — `closeLabel?: string` added to both `DialogContent` and `DialogFooter`, each with its own `useTranslations("common")` binding and `label` local. No className, `data-slot`, export or `showCloseButton` default was touched.
- `src/components/ui/sheet.tsx` — the official shadcn `sheet` block, with the close label routed through `common.close` and a load-bearing comment recording why that edit happened at creation time. Import is the unified `import { Dialog as SheetPrimitive } from "radix-ui"` as generated; default classNames (including `w-3/4 sm:max-w-sm`) are unchanged, so a caller's `className="w-64"` wins through tailwind-merge as the interface contract describes.

## Decisions Made

- **`alert-dialog.tsx` was deliberately not edited.** It ships no hardcoded close string today because `AlertDialogCancel` renders only its children, and all of its call sites already pass translated copy. The gate now asserts that Cancel renders no `<span>` of its own and that the file gains no `closeLabel` — S-3 satisfied by pinning, not by inventing a default.
- **Per-function assertions instead of per-file.** A whole-file check for `t("close")` in `dialog.tsx` would pass with `DialogContent` converted and `DialogFooter` left in English. The gate slices each function and asserts the full three-fragment chain (`closeLabel`, `useTranslations("common")`, `t("close")`) inside each slice, plus a count assertion that the namespace is bound at least twice.
- **Sheet's export order left as the registry emits it** (`Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription`) rather than alphabetised to match sibling primitives. The gate asserts the export *set*, not its order, and staying byte-faithful to the block keeps `shadcn diff` usable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reverted the radix-ui version bump written by `shadcn add sheet`**

- **Found during:** Task 3 (Add the Sheet primitive)
- **Issue:** `./node_modules/.bin/shadcn add sheet` did more than write a source file: it rewrote `package.json` (`"radix-ui": "^1.4.3"` → `"^1.6.7"`), regenerated `package-lock.json` (591 insertions / 593 deletions), and installed `radix-ui@1.6.7` into `node_modules`. That is an unrequested upgrade of the single package every primitive in `src/components/ui/` imports from, arriving in a plan whose stated dependency footprint is zero.
- **Fix:** `git checkout -- package.json package-lock.json` to restore the recorded `^1.4.3`, then `npm install` (no arguments) to reconcile `node_modules` with the restored lockfile. Verified `node_modules/radix-ui` is back at `1.4.3` and both manifest files are clean in `git status`.
- **Files modified:** none in the end — the point of the fix is that `package.json` and `package-lock.json` carry no diff from this plan.
- **Verification:** `node -p "require('./node_modules/radix-ui/package.json').version"` → `1.4.3`; `git status --short` shows neither manifest; `npm run test` / `typecheck` / `lint` all green against the restored version.
- **Committed in:** `b469858` (Task 3 commit — the revert means the commit touches only `src/components/ui/sheet.tsx`)

This is exactly the case threat **T-45-SC** anticipated ("if it modifies `package.json`, revert that hunk — `radix-ui@1.4.3` is already recorded"), so it is a mitigation applied rather than a surprise. No `npm install <pkg>` was run; the only npm invocation was the bare `npm install` that restores a lockfile.

---

**Total deviations:** 1 auto-fixed (1 bug / mitigation of a registered threat)
**Impact on plan:** No scope creep. The plan's three files are exactly the three files changed.

## Issues Encountered

- **`grep -rl '@radix-ui/react-' src/` returns two files, and that is correct.** The plan's acceptance criterion expects zero matches. Both hits are *gate vocabulary strings* inside test files — `command-dialog-wiring.test.ts` (pre-existing, added by plan 45-02, 3 occurrences at `HEAD~2`) and this plan's own `close-label-wiring.test.ts` — each of which asserts the token's ABSENCE from a primitive and therefore has to name it. The criterion's intent is zero per-package *imports*, and the import-shaped check is unambiguous: `grep -rn 'from "@radix-ui/react-\|require("@radix-ui/react-' src/` returns **0**. The gate was not weakened to accommodate this; the criterion was read as written in the interfaces block ("the count of per-package imports across `src/`").
- **Task 2's acceptance criterion `npm run test` exits 0 is unsatisfiable at that point by design.** The gate written in Task 1 asserts `sheet.tsx` exists, which is Task 3's work, so the suite is legitimately red between the two commits. After Task 3 the whole suite is green (2141 passed / 21 skipped in the main project, 8 passed in the RSC project). No assertion was relaxed to make Task 2 green early.

## Verification Results

| Check | Result |
|---|---|
| `vitest run src/components/ui/__tests__/close-label-wiring.test.ts` | 21/21 passed |
| `npm run test` | 98 files passed, 1 skipped; 2141 passed, 21 skipped — plus the RSC project, 2 files / 8 tests passed |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 (127 pre-existing warnings, 0 errors) |
| `git diff src/components/ui/alert-dialog.tsx` | empty — S-3 is an assertion, not an edit |
| `grep -rn 'from "@radix-ui/react-' src/` | 0 matches |
| `git status --porcelain components.json` | empty |
| `git status --porcelain package.json package-lock.json` | empty |

## Known Stubs

None. Both primitives are fully wired; `sheet.tsx` has no caller yet, which is the plan's intent — 45-09 builds the admin drawer on it.

## User Setup Required

None — no external service configuration required. No new message key was needed: `common.close` already ships as "Close" / "Fechar" / "Cerrar".

## Next Phase Readiness

- **45-09 can build the admin drawer immediately.** `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetTrigger`, `SheetClose`, `SheetDescription` and `SheetFooter` are exported. `<SheetContent side="left" className="w-64">` renders a 256px panel at every viewport: `w-64` beats the block's `w-3/4` through tailwind-merge's `w-` group, and the surviving `sm:max-w-sm` is inert because a 384px max-width never reduces a 256px element. `SheetHeader` is `flex flex-col gap-1.5 p-4` with no border — a caller wanting `p-4 border-b` supplies it via `className`.
- **No browser verification was performed and none was required.** The running container is a stale production build; 45-11 pays the phase's single rebuild (V-7), and that is where the translated `sr-only` text is confirmed in a real pt-BR / es-ES session.
- **No blockers.**

---
*Phase: 45-cross-cutting-ui-repair-and-uat-closure*
*Completed: 2026-08-18*

## Self-Check: PASSED

All three created/modified source files exist on disk and all three task commits are present in `git log`.
