---
phase: 45-cross-cutting-ui-repair-and-uat-closure
plan: 11
subsystem: ui-layout
tags: [playwright, e2e, docker, viewport-320, radix, dnd-kit, overflow, uat]

# Dependency graph
requires:
  - phase: 45-02
    provides: playwright.config.ts (V-1 scrollbar flag), the seeded admin and the storageState
  - phase: 45-03
    provides: the mounted ThemeProvider and the three-way toggle the theme spec measures
  - phase: 45-08
    provides: the three specs and the recorded RED baseline this plan had to move
  - phase: 45-09
    provides: the collapsing, translated admin shell that closed /admin/audit
  - phase: 45-10
    provides: the collapsing header that closed /organizations, /people and /trash
provides:
  - "the phase's single Docker rebuild, making plans 03-10 visible to the browser for the first time"
  - "23/23 green Playwright run: 18 viewport assertions across three locales, 2 drag/G1, 2 theme, 1 setup"
  - "the measured post-fix scrollWidth/clientWidth for all 18 route x locale pairs"
  - "two source fixes found by measurement rather than by the plan (toolbar wrapping, Radix bubble-input clipping) and one found beyond the spec's coverage (won/lost summary row)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "a horizontally scrolling row must be `relative` as well as `overflow-x-auto` when it contains Radix Checkbox — the hidden bubble input is position:absolute and otherwise resolves its containing block to <body>, escaping the clip"
    - "page toolbars wrap (flex-wrap + gap) with min-w-0 on the shrinkable cluster rather than relying on justify-between at every viewport"

key-files:
  created:
    - .planning/phases/45-cross-cutting-ui-repair-and-uat-closure/45-11-SUMMARY.md
  modified:
    - src/app/deals/kanban-board.tsx
    - src/app/activities/activities-client.tsx

key-decisions:
  - "The plan budgeted ONE rebuild; four were paid, and the extra three were the cost of honest measurement — each one followed a real defect the rebuild exposed, and the alternative was to report the suite red"
  - "The transient /deals overflow was fixed at the cause rather than waited out — it healed after ~2s only because dnd-kit's transforms eventually create a containing block, and a real phone shows a real scrollbar for those 2s"
  - "The won/lost summary row was fixed even though no spec measures it — it is the same defect class on the same route SC-1 owns, and it measured 608 vs 305 permanently"
  - "The SC-1 spec was left exactly as 45-08 wrote it — no assertion relaxed, no route removed, no anchor deleted, and the V-1 scrollbar flag untouched"

patterns-established:
  - "Diagnose an overflow by asking which elements ESCAPE the clip, not which are widest — a position:absolute descendant of an overflow-x-auto box is invisible to a naive widest-element scan"

requirements-completed: [SC-1, SC-3, SC-4, SC-5]
requirements-pending-human: [SC-2]

# Metrics
duration: 100min
completed: 2026-08-18
---

# Phase 45 Plan 11: Rebuild, Measure, Close Summary

**The phase's Docker rebuild made plans 03-10 real to the browser and turned the suite from 20 red assertions to 23/23 green — after three genuine layout defects the rebuild exposed were found by measurement and fixed, including one the spec cannot see.**

## Performance

- **Duration:** ~100 min
- **Started:** 2026-08-18T11:00:00Z
- **Completed:** 2026-08-18T12:39:20Z
- **Tasks:** 1 of 2 complete (Task 2 is a blocking human checkpoint, PENDING)
- **Files modified:** 2

## The Measurement — SC-1 closed, with the numbers

`clientWidth` read **305** on every one of the 18 pairs, in every run, confirming V-1's
`ignoreDefaultArgs: ["--hide-scrollbars"]` is still doing its job (default headless reports 320).

### Before → after, measured

| Route | 45-08 recorded RED (en / pt / es) | after this plan (all three locales) |
|---|---|---|
| `/organizations` | 420 / 420 / 420 | **305** |
| `/people` | 420 / 420 / 420 | **305** |
| `/deals` | 420 / 420 / 420 | **305** |
| `/activities` | 420 / 425 / 430 | **305** |
| `/trash` | 420 / 420 / 420 | **305** |
| `/admin/audit` | 491 / 518 / 537 | **305** |

### The two numbers the plan asked for by name

| Route | Locale | Recorded UAT baseline | 45-08 measured RED | **measured now** |
|---|---|---|---|---|
| `/admin/audit` | pt-BR | 508 vs 305 | 518 vs 305 | **scrollWidth 305 vs clientWidth 305** |
| `/admin/audit` | es-ES | 526 vs 305 | 537 vs 305 | **scrollWidth 305 vs clientWidth 305** |

The es-ES-worse-than-pt-BR asymmetry that the original Phase 36 UAT item was written to catch is
gone: es-ES and pt-BR now measure identically, and both equal en-US. Every one of the 18 pairs
measures `scrollWidth == clientWidth == 305` — not merely `<=`, but exactly equal, i.e. zero
residual overflow anywhere.

## What the rebuild actually proved, in order

The rebuild is the whole point of this plan, and it is worth recording that it did **not** produce a
green suite on the first try. The honest sequence:

| Rebuild | Result |
|---|---|
| 1 — after plans 03-10 | **17 passed, 6 failed.** All 6 viewport failures on `/deals` and `/activities`. `/admin/audit` went green in all three locales (537 → 305, the phase's hardest case), `/organizations` `/people` `/trash` green, theme spec green for the first time (45-03's provider finally in the image), drag/G1 still green. |
| 2 — after the toolbar wrapping fix | **16 passed, 3 failed.** `/activities` green in all three locales (430 → 305). `/deals` improved 412 → 351 but still red. |
| 3 — after the Radix bubble-input fix | **23 passed, 0 failed.** |
| 4 — after the won/lost row fix | **23 passed, 0 failed.** Won/lost pipeline 608 → 305. |

The plan budgeted one rebuild. Four were paid. Each extra one followed a real defect that the
previous rebuild exposed, and the alternative was to report the suite red and stop — which the plan
explicitly permits but which was not necessary, because every failure had a diagnosable cause and a
small fix.

## Defects Found and Fixed

### 1. `/deals` and `/activities` page toolbars did not wrap (412 / 356–430 → 351 / 305)

Both routes lay their title cluster and their primary action button out as
`flex items-center justify-between` with no wrapping. At a 305px client width the `container`
utility's `padding-inline: 2rem` leaves 241px of content, and the clusters measured:

- `/deals`: `Pipeline:` label + a `w-[200px]` SelectTrigger = 263px, then `Add Deal` at 115px pushed
  to `right = 412`.
- `/activities`: icon + heading + subtitle = 190px, then `Add Activity` at 133px (more in pt-BR and
  es-ES, which is why that route was locale-sensitive) pushed to `right = 356 / 425 / 430`.

Both rows now carry `flex-wrap` and a `gap`, their shrinkable clusters carry `min-w-0`, the fixed
`SelectTrigger` gained `min-w-0 max-w-full`, and the icon block gained `shrink-0`. The action button
drops to its own line below md instead of widening the document.

### 2. Radix Checkbox's bubble input escaped the kanban board's clip (351 → 305)

This one is worth reading carefully, because it presents as a hydration artefact and is not one.

After fix 1, `/deals` still measured 351. **No element on the page had a right edge past 305.**
`document.body.scrollWidth` was 305 while `document.documentElement.scrollWidth` was 351.

The cause: `@radix-ui/react-checkbox` renders a hidden `position: absolute` bubble
`<input type="checkbox">` beside its button. Measured, its `offsetParent` was **`<body>`** — the
kanban board's `overflow-x-auto` box is statically positioned, so it is not the containing block for
those inputs and therefore does not clip them. Every off-screen card checkbox in the board extended
the document. Measured positions: `left=338 right=351`, matching the reported scrollWidth exactly.

It "healed" ~2s after load, which is what makes it look like a hydration flicker: dnd-kit eventually
applies its own `transform`s, a transform creates a containing block, and the inputs are captured and
clipped from then on. For those ~2s a real 320px phone shows a real horizontal scrollbar.

Fix: the open-stage scroll container is now `relative`. It becomes the containing block, the bubble
inputs are clipped from the first paint, and the reason is written into the file above the class so
nobody deletes it as decoration.

### 3. The won/lost summary row had no scroll container at all (608 → 305) — found beyond the spec

While diagnosing, the Won/Lost footer row was noticed to be `flex gap-4 pt-4 border-t` with two
`min-w-[280px]` tiles and **no** `overflow-x-auto`, unlike the open-stage row above it. Rather than
speculate, it was measured:

- Of the 10 pipelines in this database, exactly one (`SaaS kill list`) defines both a won and a lost
  stage. The SC-1 spec loads `/deals` with no query string, i.e. the default pipeline, which defines
  neither — so the spec never renders this row.
- Loading `/deals?pipeline=<that id>` at 320px measured **scrollWidth 608 vs clientWidth 305**, both
  at anchor time and after settling. Permanent, not transient. The worst overflow measured anywhere
  in this phase.
- After adding `overflow-x-auto`: **305 vs 305**.

**This is an honest coverage boundary in the SC-1 spec and it is recorded rather than papered over:**
`e2e/viewport-320.spec.ts` proves the default pipeline. A pipeline-parameterised 19th assertion was
deliberately not added — it would pin a spec to a live database row that a user can rename or delete.

## Full Gate Results

| Gate | Result |
|---|---|
| `npm run typecheck` | **exit 0, 0 errors** |
| `npm run lint` | **exit 0, 0 errors** (127 warnings — unchanged from the phase base) |
| `npm run test` | **exit 0** — 102 files passed / 1 skipped, 2224 tests passed / 21 skipped; plus the rsc project 2 files / 8 tests. Identical to the 45-09 phase-base counts, so nothing regressed and nothing was silently dropped. |
| `docker compose up -d --build` | exit 0; `docker compose ps` shows `app Up`, `postgres Up (healthy)` |
| `./node_modules/.bin/playwright test --project=setup` | **1 passed** |
| `./node_modules/.bin/playwright test` | **23 passed, 0 failed** (37.3s) |
| viewport assertions collected and passing | **18** — 6 routes x 3 locales; test names contain `en-US`, `pt-BR`, `es-ES` (6 each) |
| `e2e/deals-drag.spec.ts` | **2 passed** — the drag-with-selection and the G1 Escape regression, both against the freshly built image for the first time |
| `e2e/theme.spec.ts` | **2 passed** — including the post-`page.reload()` assertion and the third `system` state, both of which were red for 45-08 because the provider was not yet in the image |
| `grep -c "ignoreDefaultArgs" playwright.config.ts` | **2** (>= 1 required) — the V-1 flag was not removed to force green |
| `grep -c "playwright" .github/workflows/ci.yml` | **0** — V-3 held, Playwright did not enter CI |
| `git status --porcelain e2e/.auth` | **empty** — V-2 held, the live session JWT stayed uncommitted |
| `git status --porcelain` after work | clean apart from the two committed source files |
| `[e2e] Drag …` fixture deals remaining | **0** |
| orphan `deal_stage_history` rows | **0** |

## Success Criteria

| SC | Status | Evidence |
|---|---|---|
| SC-1 | **CLOSED** | 18/18 viewport assertions green; all 18 measure scrollWidth 305 == clientWidth 305; the two `/admin/audit` numbers recorded above beside the 508/526 baselines |
| SC-2 | **automated half CLOSED, human half PENDING** | `theme.spec.ts` 2/2 green including reload persistence and a real `system` state. The dark-palette visual walk is Task 2 and is NOT self-certified — see below |
| SC-3 | **CLOSED** | Delivered and gated by 45-01/04/06/09/10; the anchor assertions in all 18 viewport tests additionally prove the admin shell and page headings render in pt-BR and es-ES against the built image |
| SC-4 | **CLOSED** | Delivered and gated by 45-05; `npm run test` green against this image's source |
| SC-5 | **CLOSED** | `deals-drag.spec.ts` 2/2 green, driven entirely by `page.mouse.*` and `page.keyboard.press` — trusted input, no `dispatchEvent`, no `dragTo()` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `/deals` and `/activities` toolbars overflowed at 320px**

- **Found during:** Task 1, after rebuild 1
- **Issue:** Non-wrapping `justify-between` header rows measured 412 (`/deals`) and 356/425/430 (`/activities`) against a 241px content width.
- **Fix:** `flex-wrap` + `gap`, `min-w-0` on the shrinkable clusters, `shrink-0` on the fixed-size children, `min-w-0 max-w-full` on the `w-[200px]` SelectTrigger.
- **Files modified:** `src/app/deals/kanban-board.tsx`, `src/app/activities/activities-client.tsx`
- **Verification:** `/activities` went green in all three locales; `/deals` improved 412 → 351.
- **Commit:** `68035ef`

**2. [Rule 1 - Bug] Radix bubble inputs escaped the kanban board's horizontal clip**

- **Found during:** Task 1, after rebuild 2
- **Issue:** `/deals` measured 351 with no element past 305 and `body.scrollWidth` at 305. The Radix Checkbox bubble `<input>` is `position: absolute` with `offsetParent = <body>`, so `overflow-x-auto` on a statically positioned box never clipped the board's off-screen card checkboxes.
- **Fix:** `relative` on the open-stage scroll container, with the measurement and the mechanism written into the file.
- **Files modified:** `src/app/deals/kanban-board.tsx`
- **Verification:** `/deals` 351 → 305 in all three locales; full suite 23/23.
- **Commit:** `68035ef`

**3. [Rule 1 - Bug] The won/lost summary row had no scroll container**

- **Found during:** Task 1, while diagnosing deviation 2
- **Issue:** Two `min-w-[280px]` tiles in a plain flex row. Measured on the one pipeline that defines both stages: 608 vs 305, permanently. Not covered by the SC-1 spec, which exercises the default pipeline.
- **Fix:** `overflow-x-auto` on that row, matching the open-stage row above it.
- **Files modified:** `src/app/deals/kanban-board.tsx`
- **Verification:** 608 → 305 at anchor time and after settling; full suite still 23/23.
- **Commit:** `0a70388`

**4. [Process deviation] Four Docker rebuilds instead of the budgeted one**

- **Found during:** Task 1
- **Why:** The plan's own instruction on a red viewport spec is "fix the layout, rebuild, re-run". Three defects were found in sequence, each only visible once the previous fix was in the image.
- **Impact:** ~8 minutes of build time. No assertion was weakened and no spec was edited to compensate.

---

**Total deviations:** 3 auto-fixed (all Rule 1) + 1 process deviation
**Impact on plan:** No task dropped or reshaped. All three fixes are layout-only and behaviour-neutral; the drag spec, which exercises the same kanban board that received two of them, passed after both.

## Issues Encountered

- **Playwright will not collect a spec outside `testDir`.** All throwaway diagnostic specs had to live under `e2e/`; each was deleted immediately after use and `git status` is clean of them.
- **`context.clearCookies()` in a diagnostic wiped the storageState session**, not just the locale cookie. The per-locale measurement was split into one test per locale instead, matching how the real spec isolates them.
- **A naive "widest element" overflow scan cannot find deviation 2.** The offending nodes are `position: absolute` descendants of a scroll container, so any scan that skips clipped subtrees skips them, and any scan that reports the widest element reports something else. The diagnosis needed a scan for *positioned* elements plus a read of `offsetParent`.

## Known Stubs

None. This plan added no placeholder, no empty-collection path and no TODO. Both source changes are
CSS-class-only and every claim in this document is backed by a recorded measurement.

## Threat Flags

None. No network endpoint, auth path, file access or schema change was introduced. The threat
register's four mitigations all held and are recorded in the gate table above: the rebuild preceded
every measurement (T-45-42), `ignoreDefaultArgs` survives at 2 occurrences (T-45-43), `e2e/.auth`
is clean in `git status` (T-45-44), and `ci.yml` contains zero occurrences of `playwright`
(T-45-08). No package was installed (T-45-SC). The `/admin` gate held throughout — all six
`/admin/audit` assertions reached the real authenticated admin page and passed their anchors
(T-45-45).

## Carried Forward

- **A mobile-UX finding from 45-08, unchanged and still true:** at a 320px viewport the kanban
  board's auto-scroller pins to its scroll extreme as soon as a drag starts moving right, making
  every open stage except the last effectively unreachable by drag on a phone. Out of Phase 45's
  scope, not a regression, and recorded here so it is not lost.
- **`/deals` carries hardcoded English** — `Pipeline:`, `Select pipeline`, `Add Deal`,
  `No results match your filters`, `Clear filters`. SC-3 was deliberately scoped to the admin
  sidebar, the header nav, and the dialog/sheet close controls, so this was **not** touched here.
  It is real untranslated copy on a user-facing route and belongs in a future i18n pass.

## Task 2 — Human Verification, PENDING

**This task is NOT complete and has NOT been self-certified.** The specs prove the layout does not
overflow, that the theme class flips and that the choice survives a reload. They cannot prove the
dark palette is *readable*. No screenshot baseline exists in this repo and this phase does not add
one. The app is rebuilt, healthy and waiting at `http://localhost:3001` for the walk described in
the plan's `how-to-verify` block.

Results will be recorded here verbatim, with a disposition for each issue reported.

---
*Phase: 45-cross-cutting-ui-repair-and-uat-closure*
*Completed (Task 1): 2026-08-18*

## Self-Check: PASSED

Both modified source files exist on disk, this SUMMARY exists, and both task commits
(`68035ef`, `0a70388`) resolve in `git log --all`.
