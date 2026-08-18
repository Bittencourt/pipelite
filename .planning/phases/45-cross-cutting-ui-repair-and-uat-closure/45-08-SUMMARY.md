---
phase: 45-cross-cutting-ui-repair-and-uat-closure
plan: 08
subsystem: testing
tags: [playwright, e2e, dnd-kit, next-themes, i18n, layout, trusted-input]

# Dependency graph
requires:
  - phase: 45-01
    provides: the theme.* message keys the theme spec reads its option labels from
  - phase: 45-02
    provides: playwright.config.ts (V-1 scrollbar flag, 320x640 chromium project), the seeded admin and the storageState every spec inherits
provides:
  - "e2e/viewport-320.spec.ts — 18 SC-1 assertions (6 routes x 3 locales), each anchored to locale-dependent content, OBSERVED RED with the measured numbers recorded"
  - "e2e/deals-drag.spec.ts — SC-5 drag-with-selection and the G1 Escape regression, both driven by trusted input, both GREEN"
  - "e2e/theme.spec.ts — SC-2 reload persistence plus a real third 'system' state, RED only because the provider is not yet in the running image"
  - "a self-cleaning deals fixture: creates and hard-deletes its own two deals, so no user record is ever read, moved or deleted"
affects: [45-09, 45-10, 45-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "one locale-dependent heading assertion closes BOTH e2e vacuity modes (page never rendered / locale cookie never applied)"
    - "e2e specs that mutate data create and destroy their own fixture rows instead of borrowing and restoring a user's"
    - "locators derived from data attributes and role+name; the single class-derived locator carries a width assertion so a Tailwind rename fails loudly"

key-files:
  created:
    - e2e/viewport-320.spec.ts
    - e2e/deals-drag.spec.ts
    - e2e/theme.spec.ts
  modified: []

key-decisions:
  - "The drag target is the LAST open stage, not the adjacent one — dnd-kit's auto-scroller compares the 264px dragged rect against a ~241px scroll container, so at 320px a rightward drag pins the board to its scroll extreme and the last column is the only stage the gesture can reach"
  - "The drag spec creates and hard-deletes its own two deals rather than borrowing a real card and putting it back — a purpose-built fixture cannot leave a user's record in the wrong stage if the run dies mid-drag"
  - "The user-menu trigger is located by data-slot, not by role: an open Radix dropdown marks the rest of the app aria-hidden and Playwright's role engine then stops resolving the trigger entirely"
  - "Comments in these specs avoid the literal tokens the plan's guards grep for (dispatchEvent, dragTo(, setViewportSize, viewport:) — the guards are substring scans, not comment-blind source scans"
  - "The column-width guard is polled rather than read once; a single boundingBox() can land on a node React has just replaced during hydration"

patterns-established:
  - "Anti-vacuity anchor first, measurement second — and the reason is written above the anchor, because the line looks redundant and a future reader will delete it"
  - "A retry-on-aria-expanded loop around a client-component trigger click, because Playwright's actionability checks cannot see React hydration"

requirements-completed: [SC-1, SC-2, SC-5]

# Metrics
duration: 95min
completed: 2026-08-18
---

# Phase 45 Plan 08: The Three E2E Specs Summary

**Three Playwright specs that close SC-1, SC-2 and SC-5 — with the 320px overflow claim measured RED in a real browser across six routes and three locales, and the kanban drag and G1 Escape regression both driven green by trusted pointer and key input.**

## Performance

- **Duration:** ~95 min
- **Started:** 2026-08-18T09:55:00Z
- **Completed:** 2026-08-18T11:30:00Z
- **Tasks:** 3
- **Files created:** 3

## Accomplishments

- **SC-1 is measured, not asserted.** `e2e/viewport-320.spec.ts` collects exactly 18 tests (6 routes x 3 locales) and every one of them failed on the *measurement*, not on its anchor — meaning all 18 reached a real authenticated page in the expected locale before measuring. `clientWidth` read **305** on all 18, exactly reproducing the recorded UAT baseline and confirming V-1's scrollbar flag is doing its job.
- **The es-ES-worse-than-pt-BR asymmetry reproduced.** `/admin/audit` measured 491 (en-US) < 518 (pt-BR) < 537 (es-ES) against a 305px client width. That ordering is the specific failure mode the original Phase 36 UAT item was written to catch, and it is now a standing automated check rather than a memory.
- **SC-5 and G1 are both green, against the currently-running image**, driven entirely by `page.mouse.*` and `page.keyboard.press`. The drag moves a card between stages while an unrelated card stays selected; one Escape closes the bulk delete dialog and leaves both selections and the bar intact. Run twice, stable both times.
- **No user data was touched.** The drag spec builds its own two deals in the emptiest live pipeline, resets them to a recorded stage and position before every test, and hard-deletes them plus their `deal_stage_history`, `deal_assignees`, `activities` and `audit_log` children afterwards. Verified after the runs: `0` fixture deals remain and `0` orphan stage-history rows exist.
- **A real dnd-kit finding, measured from source and from three live runs:** the board's auto-scroller compares the *dragged rect* (264px) against a threshold of 20% of the scroll container (~241px wide at this viewport), so the dragged rect straddles both edge thresholds for every reachable pointer position and `getScrollDirectionAndSpeed`'s `if (right…) else if (left…)` ordering makes RIGHT win. Scroll *intent* offers no escape either — it accumulates with `||` and is never cleared. The board therefore runs to its scroll extreme inside ~150ms and stays pinned there. This is written into the spec as the reason the drop target is the last open stage.
- `npm run test` still exits 0 (100 files passed / 1 skipped, plus 2 in the rsc project) — vitest's include glob is anchored at `src/`, so nothing under `e2e/` is collected.

## Task Commits

1. **Task 1: `e2e/viewport-320.spec.ts`, proved RED** — `9c88c15` (test)
2. **Task 2: `e2e/deals-drag.spec.ts` — trusted pointer drag + G1** — `abf4b57` (test)
3. **Task 3: `e2e/theme.spec.ts` — the choice survives a reload** — `05010d6` (test)

## The Recorded RED — SC-1, measured 2026-08-18 against the pre-fix image

`clientWidth` was **305** on every single one of the 18 runs.

| Route | en-US | pt-BR | es-ES |
|---|---|---|---|
| `/organizations` | 420 | 420 | 420 |
| `/people` | 420 | 420 | 420 |
| `/deals` | 420 | 420 | 420 |
| `/activities` | 420 | 425 | **430** |
| `/trash` | 420 | 420 | 420 |
| `/admin/audit` | 491 | 518 | **537** |

Two honest notes on this table:

1. **The main routes measure 420, not the baseline's 416,** and `/admin/audit` measures 518/537 rather than 508/526. The differences are 4px and 10-11px, and the shape of the evidence — a fixed ~420 on the five main routes, a much larger and locale-sensitive number on `/admin/audit`, and a 305px client width — matches the recorded baseline exactly. The absolute numbers depend on live content widths in a database that has grown since the UAT was recorded, which is precisely why the assertion is a *relation* (`scrollWidth <= clientWidth`) and hardcodes neither 305 nor 320.
2. **`/activities` is also locale-sensitive** (420 / 425 / 430), which the baseline did not record. Same direction as `/admin/audit`: es-ES is the worst.

**Anti-vacuity held.** All 18 failures are on line 126 — the measurement. Zero failed on the anchor assertion, so all 18 proved a locale-correct authenticated page had rendered before measuring. Had the storageState been stale, every test would have failed on the anchor instead, and the plan's acceptance criteria call that out as the signal to re-run the setup project.

## Honest Status of Each Spec, and Why

The plan asks for this to be reported rather than forced to an expected colour.

| Spec | Status now | Why |
|---|---|---|
| `viewport-320.spec.ts` | **RED, 18/18** | The defect it measures is real and predates this phase. 45-09 and 45-10 fix it at source; 45-11 rebuilds and turns it green. This is the deliverable. |
| `deals-drag.spec.ts` | **GREEN, 2/2** | Neither the kanban drag nor the G1 Escape gate depends on anything Phase 45 changed — the G1 fix landed in Phase 38 (`c413198`) and is in the running image. So this is a genuine pass, not a stale one. |
| `theme.spec.ts` | **RED, 2/2** | Correct and expected. The running image predates 45-03: the avatar menu opens (`aria-expanded="true"`) and renders API Keys / Trash / User Management / Logout — and **no theme rows at all**. Confirmed by direct DOM read. Nothing about the spec is wrong; the provider simply is not in the image yet (V-7). |

## Files Created

- **`e2e/viewport-320.spec.ts`** — a nested loop over three locales and six routes, with a per-route accessor reading the heading out of `../src/messages/*.json` so a copy change cannot leave a stale expectation. Sets the `locale` cookie from `baseURL`, asserts a locale-specific level-1 heading is visible, then measures `document.documentElement.scrollWidth` vs `clientWidth` and reports both numbers plus the overflow in the failure message. No viewport is declared or changed; no login.
- **`e2e/deals-drag.spec.ts`** — a `beforeAll` that picks the emptiest live pipeline with at least two open stages and inserts two fixture deals into its first open stage; a `beforeEach` that restores both to their recorded stage and position; an `afterAll` that purges them and their children. A `dndDrag` helper implementing the `PointerSensor` activation sequence (`move` → `down` → a `> 5px` move with `{ steps: 4 }` → an aim-and-settle loop → `up`). Test A drags the subject with the anchor checked; Test B opens the bulk delete dialog with two checked and presses Escape once.
- **`e2e/theme.spec.ts`** — opens the avatar menu (retrying on `aria-expanded`, because a click that lands before hydration does nothing), asserts all three radio rows are visible before clicking one, selects Dark, reloads, and asserts both the `dark` class and `localStorage.theme === "dark"`. A second test pins to Dark, switches to System, and flips `page.emulateMedia({ colorScheme })` in both directions to prove System tracks the OS rather than aliasing light.

## Decisions Made

- **The drag target is the last open stage, not the adjacent one.** See the dnd-kit finding above. Aiming at the adjacent column was measured three times: it oscillates between the two scroll extremes and drops into the last column anyway. Rather than fight the board with an ever-more-elaborate aiming loop, the spec drags where a 320px gesture can actually land, and the *reason* is written into the file so nobody "simplifies" it back.
- **A purpose-built fixture instead of borrow-and-restore.** The plan's constraint was to record where a real card started and put it back. A fixture the spec owns end to end is strictly stronger: if the run dies mid-drag there is no user record sitting in the wrong stage waiting for a restore step that never ran. The teardown deletes children first because `deal_stage_history`, `deal_assignees` and `activities` all reference `deals.id` with `NO ACTION`, and a stage change writes a history row — a bare `DELETE FROM deals` would have failed on the second run.
- **The loopback database guard is repeated, not imported.** `e2e/seed-admin.ts` already has one, but this file *inserts and deletes rows*, and a guard that lives somewhere else is a guard that can be refactored away from the thing it protects.
- **The user-menu trigger is located by `data-slot`, scoped to `header`.** Measured: opening a Radix dropdown is modal and marks the rest of the app `aria-hidden`; Playwright's role engine ignores `aria-hidden` subtrees, so a role-based trigger locator resolves fine before the click and then hangs on every read after it. The first version of the spec timed out at 30s for exactly this reason.
- **Comments avoid the literal tokens the plan's guards scan for.** The acceptance criteria are plain substring scans (`dispatchEvent`, `dragTo(`, `setViewportSize`, `viewport:`), not the comment-blind `readStrippedSource()` gates used under `src/`. Prose explaining *why those APIs are forbidden* would have tripped them. The explanations are all still there, worded around the tokens.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The planned adjacent-stage drop target is unreachable at a 320px viewport**

- **Found during:** Task 2
- **Issue:** The plan (and the fixture query it implied) targeted the *adjacent* open stage. Measured live three times: `@dnd-kit/core`'s auto-scroller drives the board to its scroll extreme within ~150ms of the drag activating, and the card lands in the **last** open column every time. The cause was read from `node_modules/@dnd-kit/core`: `getScrollDirectionAndSpeed` thresholds against the *dragged rect*, which at 264px is wider than the ~241px scroll container, so both edge conditions hold and the `if/else if` ordering picks RIGHT; `useScrollIntent` accumulates with `||` and never clears, so a leftward nudge cannot cancel it.
- **Fix:** The fixture now selects the FIRST open stage as source and the LAST open stage as target. The rationale, the measurement and the source references are written into the spec's `dndDrag` doc comment so the choice cannot be mistaken for laziness.
- **Files modified:** `e2e/deals-drag.spec.ts`
- **Verification:** both drag tests green, twice, in 1.8s and 1.3s.
- **Committed in:** `abf4b57`

**2. [Rule 2 - Missing critical functionality] Data safety for a spec that writes to the live dev database**

- **Found during:** Task 2
- **Issue:** The plan's Test A moves a card on a database holding ~25,000 real deals. A borrow-and-restore approach leaves a user's record in the wrong stage whenever a run dies between the drag and the restore.
- **Fix:** The spec creates its own two deals (`[e2e] Drag Anchor`, `[e2e] Drag Subject`), records their starting stage and position, restores them in `beforeEach`, and hard-deletes them and all their child rows in `afterAll`. Every write is scoped to those two ids or those two exact titles. A loopback-only `E2E_DATABASE_URL` guard refuses to run anywhere but `localhost` / `127.0.0.1`.
- **Files modified:** `e2e/deals-drag.spec.ts`
- **Verification:** after two full runs, `select count(*) from deals where title in (…)` returns 0 and there are 0 orphan `deal_stage_history` rows.
- **Committed in:** `abf4b57`

**3. [Rule 1 - Bug] A role-based trigger locator hangs once a Radix menu is open**

- **Found during:** Task 3
- **Issue:** `getByRole("button", { name: "PI" })` resolved before the click and then stopped resolving after it, timing both theme tests out at 30s. Radix's modal dropdown sets `aria-hidden` on the rest of the app, and Playwright's role engine excludes `aria-hidden` subtrees.
- **Fix:** `page.locator('header [data-slot="dropdown-menu-trigger"]')`, with a `toHaveText(AVATAR_INITIALS)` assertion to prove it is still the signed-in user's avatar menu.
- **Files modified:** `e2e/theme.spec.ts`
- **Verification:** the theme tests now fail in 6.5s on the genuinely-missing theme rows instead of timing out.
- **Committed in:** `05010d6`

**4. [Rule 3 - Blocking] Two flake sources found and closed**

- **Found during:** Tasks 2 and 3
- **Issue:** (a) a single `boundingBox()` on the kanban column returned `null` on the second test of a run — it can land on a node React has just replaced during hydration; (b) a click on the avatar issued immediately after `goto` did nothing at all, because `UserMenu` is a client component and Playwright's actionability checks cannot see React hydration. Both were reproduced directly.
- **Fix:** (a) `expect.poll` around the column-width guard; (b) a bounded retry loop on the trigger's `aria-expanded`.
- **Files modified:** `e2e/deals-drag.spec.ts`, `e2e/theme.spec.ts`
- **Verification:** the drag spec has since run green twice end to end; the theme spec fails deterministically on the right assertion.
- **Committed in:** `abf4b57`, `05010d6`

---

**Total deviations:** 4 auto-fixed (2 x Rule 1, 1 x Rule 2, 1 x Rule 3)
**Impact on plan:** No task was dropped or reshaped. Deviation 1 changes *which* stage the drag targets, and the plan's own behaviour clause ("dragging a DIFFERENT card by its body to another stage") is satisfied either way. Deviation 2 strengthens the plan's data-safety constraint. Deviations 3 and 4 are locator and timing corrections found by running the specs.

## Issues Encountered

- **`@playwright/test` cannot be required from outside the repo root.** All throwaway diagnostic scripts had to live at the repo root and were deleted afterwards; `git status` is clean of them.
- **The plan's acceptance guards are substring scans over the raw file.** Writing "never call `page.setViewportSize`" in a comment fails a check whose whole purpose is to prove the call is absent. Both Task 1 and Task 2 hit this and both were reworded rather than having the guard weakened.

## Verification Results

| Check | Result |
|---|---|
| `playwright test --list` — total | 23 tests in 4 files (1 setup + 18 + 2 + 2) |
| `viewport-320.spec.ts` collected | **18** |
| `deals-drag.spec.ts` collected | **2** |
| `theme.spec.ts` collected | **2** |
| `viewport-320.spec.ts` against the running container | **exit non-zero, 18 failed** |
| failure output contains `scrollWidth`, and `scrollWidth > clientWidth` for ≥ 6 tests | yes — for all 18 |
| failure output names `pt-BR` and `es-ES` | yes — 6 tests each, three distinct passes proven |
| anchor assertions that failed | **0** — every test reached a locale-correct authenticated page |
| `viewport-320.spec.ts` contains `305` / `320` inside an `expect(...)` | absent |
| `viewport-320.spec.ts` contains `setViewportSize` / `viewport:` | absent |
| `deals-drag.spec.ts` contains `dispatchEvent` / `dragTo(` / `dragAndDrop(` / `setViewportSize` | all absent |
| `deals-drag.spec.ts` contains `page.mouse.down`, `page.mouse.up`, `{ steps: N }`, `page.keyboard.press("Escape")` | all present |
| `deals-drag.spec.ts` run | **2 passed**, twice |
| fixture rows left in the database afterwards | **0**; 0 orphan `deal_stage_history` rows |
| `theme.spec.ts` contains `page.reload`, `emulateMedia`, `localStorage` | all present; `setViewportSize` absent |
| `theme.spec.ts` run | 2 failed on the absent theme rows (expected — provider not in the image) |
| `tsc --noEmit` | exit 0 |
| `eslint e2e` | exit 0 |
| `npm run test` | exit 0 — 100 files passed / 1 skipped, plus 2 in the rsc project |
| `.github/workflows/ci.yml` | untouched (V-3) |
| `git status` after cleanup | clean of diagnostic scripts |

## Known Stubs

None. No placeholder, empty-collection or TODO path was introduced. All three specs assert real behaviour against the running application.

## Threat Flags

None. This plan added no network endpoint, no auth path, no file access and no schema change. The one new privileged surface — a spec that INSERTs and DELETEs `deals` rows — is covered by the plan's register (T-45-30 / T-45-31) and mitigated by the loopback-only database guard, by scoping every write to two fixture ids, and by a teardown proven to leave zero rows behind.

## Security Notes

- No spec contains a password, a session token or a database URL. Authentication comes exclusively from the gitignored `storageState`; the database URL comes from `E2E_DATABASE_URL` in the gitignored `.env`.
- The drag fixture refuses to run against any host other than `localhost` / `127.0.0.1`, and the guard is repeated in the file that writes rather than imported from the file that seeds.

## Next Phase Readiness

- **45-09 and 45-10** now have a recorded, reproducible RED to fix against. The target is the relation, not a number: every route must satisfy `scrollWidth <= clientWidth` at `clientWidth == 305`, in all three locales. `/admin/audit` in es-ES is the hardest case at 537 (an overflow of 232px), and `/activities` in es-ES is also locale-sensitive — 430 vs 420 in en-US.
- **45-11** pays the phase's single `docker compose up -d --build` and then runs all 23 tests. Expect `viewport-320` to go green if 45-09 and 45-10 land, `theme` to go green because 45-03's provider will finally be in the image, and `deals-drag` to stay green.
- **A caution for 45-11:** the drag spec was proven against an image that predates 45-05's edit to `kanban-board.tsx` (the `stillSelected` prop on `BulkFailureReport`). That change does not touch the drag, the sensors or the Escape gate, but the rebuild is the first time the spec meets it.
- **A mobile-UX item worth recording somewhere other than this summary:** at a 320px viewport the kanban board's auto-scroll pins to its scroll extreme as soon as a drag starts moving right, which makes every open stage except the last one effectively unreachable by drag on a phone. That is out of scope for Phase 45 and is not a regression, but it is real.

---
*Phase: 45-cross-cutting-ui-repair-and-uat-closure*
*Completed: 2026-08-18*

## Self-Check: PASSED

All three created spec files exist on disk and all three task commits resolve in `git log --all`.
