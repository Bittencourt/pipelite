---
phase: 45-cross-cutting-ui-repair-and-uat-closure
plan: 09
subsystem: admin-shell
tags: [responsive, i18n, radix-dialog, authorization, source-gate]
requires:
  - "45-01 (the 12 admin.nav.* keys in all three locales)"
  - "45-04 (src/components/ui/sheet.tsx, translated at creation)"
provides:
  - "a translated, shared admin nav item array and item renderer"
  - "a 256px left Sheet drawer behind an md:hidden hamburger bar"
  - "a min-w-0 admin content column"
  - "src/components/__tests__/admin-shell-wiring.test.ts (the admin-shell source gate)"
affects:
  - "/admin/* — every admin route now collapses at md"
tech-stack:
  added: []
  patterns:
    - "CSS-only responsive collapse (md:hidden / hidden md:flex), zero viewport state"
    - "message key stored in a data array, resolved through t() at render"
    - "one component file exports both the shared data and the shared renderer"
key-files:
  created:
    - src/components/__tests__/admin-shell-wiring.test.ts
    - src/components/admin-mobile-bar.tsx
  modified:
    - src/components/admin-sidebar.tsx
    - src/app/admin/layout.tsx
decisions:
  - "The eleven labels live in ONE array in admin-sidebar.tsx; the drawer imports it rather than restating it"
  - "`hidden md:flex` appears in both admin-sidebar.tsx and app/admin/layout.tsx deliberately"
  - "The Sheet's open state is user-interaction state; the collapse itself is pure CSS"
metrics:
  duration: 13min
  completed: 2026-08-18
---

# Phase 45 Plan 09: Admin Shell Collapse and Translation Summary

The admin shell now collapses to a hamburger-and-drawer below 768px and reads in the user's
language, with the eleven items declared exactly once and the server authorization gate untouched.

## What Was Built

**Task 1 — the source gate (RED).** `src/components/__tests__/admin-shell-wiring.test.ts`, a new
directory, reading all three sources comment-blind through `readStrippedSource`'s `stripComments`.
25 assertions across seven describes. RED at 18 failed / 7 passed, naming both `admin-mobile-bar.tsx`
(35 times) and the surviving English (`Audit Log`, 5 times).

Two assertions carry their reasoning in the message, as the plan required:

- **`min-w-0` on the content column.** A flex item defaults to `min-width: auto` and refuses to
  shrink below its own content. That is the whole mechanism behind 45-08's measured
  `document.scrollWidth` of 491 (en-US) / 518 (pt-BR) / 537 (es-ES) against a `clientWidth` of 305 on
  `/admin/audit`. Hiding the rail is only half the fix — removing `min-w-0` reintroduces the exact
  defect with the audit table playing the role the rail used to play.
- **The authorization assertions.** `session.user.role !== "admin"`, `auth()`, and a count of
  exactly TWO `redirect(` calls. The message states that the drawer changes presentation only, that
  `/admin/*` is gated twice (`middleware.ts`'s `authorized()` and this layout), and that this phase
  must not weaken either.

**Task 2 — the sidebar.** All eleven English literals replaced by `admin.nav.*` keys. The array's
`title` field became `labelKey` so a reader cannot mistake a key for copy. Three exports now exist
for the drawer to consume: `adminNavItems`, `AdminNavItems` (the renderer, with an optional
`onNavigate`) and `AdminBackToApp`. The active-item rule survives verbatim — exact match for
`/admin`, `startsWith` for the other ten.

**Task 3 — the drawer and the layout (GREEN).** New `"use client"` `admin-mobile-bar.tsx`:
`h-12 border-b px-4 flex items-center gap-2 md:hidden`, a ghost `size="icon-lg"` `Menu` trigger named
from `t("openMenu")`, and `<SheetContent side="left" className="w-64 gap-0 p-0"
aria-describedby={undefined}>` holding a visible `SheetTitle`, the SHARED `AdminNavItems` with
`onNavigate` wired to close, and the shared `AdminBackToApp`. `app/admin/layout.tsx` reshaped to
`<aside className="hidden md:flex w-64 border-r bg-background">` beside
`<div className="flex min-w-0 flex-1 flex-col">`, with the mobile bar above `<main>` and outside its
`p-6`. Gate GREEN 25/25.

## Key Decisions

**The eleven items are declared once, and the gate proves it by counting to zero.**
`countOccurrences(MOBILE_BAR, "pipedriveImport")` must be `0`, and each of the eight non-root hrefs
must total exactly `1` across the two files. A count of zero is the only formulation that
distinguishes a shared array from a copied one — a `toContain` on the sidebar would pass just as
happily with a second copy in the drawer, and a copy is how the rail and the drawer drift apart one
added menu entry at a time. This is the same formulation 45-07 used for its `CommandGroup` move.

**`hidden md:flex` appears in BOTH `admin-sidebar.tsx` and `app/admin/layout.tsx`, deliberately.**
The plan's task-1 contract lists the class as a RECOGNISED marker in each file, and the two
occurrences are not the same statement. In the layout it is on the `<aside>` and says *the flex row
has two children above md and one below*. In the component it is on the rail's own column, where
`md:flex` is load-bearing (the column needs a flex context for its `flex-1` nav to push the footer
down) and the `hidden` half is belt-and-braces: the rail is a fixed 256px block, so it must never
render below md regardless of which caller mounts it. Two CSS classes that agree cost nothing; the
alternative was weakening a committed gate to suit a code shape.

**The `<aside>` moved from the component into the layout.** `admin-sidebar.tsx` used to own its own
`<aside className="w-64 border-r bg-background">`. UI-SPEC R-2 locks the landmark and the collapse at
the layout level, so the component now renders the column and the layout renders the landmark. The
component keeps `w-64` so the intermediate commit (task 2, before the layout was reshaped) was not a
full-width rail.

**The open state is user-interaction state; the collapse is CSS.** `useState` for the Sheet, and
zero occurrences of `useMediaQuery`, `window.innerWidth` or `useEffect` in either component file —
asserted for both, iterated. A hook reading the viewport returns false on the server and the truth
after an effect, which is either a hydration mismatch or a `react-hooks/set-state-in-effect` error,
severity 2 in this repo. This follows 45-10's pattern exactly.

**Radix defaults are not overridden.** Escape, the overlay tap, the scroll lock and the return of
focus to the trigger on close all come from the Sheet primitive. The close label comes from
`common.close` inside `sheet.tsx`, already routed there by 45-04 — no hardcoded label was
reintroduced, and `sheet.tsx` was not edited.

**The stale justification is gone.** The comment arguing that "half-migrating a single entry would
read as a bug rather than as progress" was removed; migrating all eleven satisfies that argument
rather than violating it. The gate asserts its absence with the ONE deliberately RAW (non-stripped)
read in the file, because the target only ever lived in a comment — asserting it against
comment-stripped source would be vacuously true forever. That is the 45-06 lesson applied.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The gate's anti-vacuity marker pinned the pre-rename array name**

- **Found during:** Task 3, on the first GREEN run (24 passed / 1 failed).
- **Issue:** Task 1's contract names `sidebarItems` as the positive marker for `admin-sidebar.tsx`,
  qualified in the plan as "(or its renamed equivalent)". Task 2 then requires the field and the
  array to be renamed so a reader cannot mistake a key for copy. The gate as written only accepted
  the historical name, so the rename it mandated failed it.
- **Fix:** The marker became `/\b(adminNavItems|sidebarItems)\b/`, accepting either name, with the
  message naming both and saying why the rename happened. This is not a weakening — the array's
  identity is separately pinned by the export assertion
  (`/export\s+(const|function)\s+(adminNavItems|sidebarItems|AdminNavItems)/`), by the
  `pipedriveImport` zero-count in the drawer, and by the exactly-once href count.
- **Files modified:** `src/components/__tests__/admin-shell-wiring.test.ts`
- **Commit:** `830277a`

### Noted, not fixed

**Task 2's acceptance criterion "`npm run test` exits 0" is unsatisfiable by construction.** The
same plan states the gate "FAILS before task 2 and passes after task 3", and task 2 does not create
`admin-mobile-bar.tsx`. The suite at the task-2 commit was therefore 101 passed / 1 failed, with the
single failure confirmed by name to be `admin-shell-wiring.test.ts` and nothing else. Every other
task-2 criterion passed: typecheck 0, lint 0 errors, zero surviving literals, `grep -c
"half-migrating"` = 0. The full suite is green as of task 3.

## Verification

| Check | Result |
|---|---|
| `vitest run src/components/__tests__/admin-shell-wiring.test.ts` | RED 18 failed / 7 passed → **GREEN 25/25** |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors (127 warnings, unchanged) |
| `npm run test` | 102 files passed, 1 skipped; 2224 passed, 21 skipped. RSC project 2/2, 8 passed |
| `git diff src/app/admin/layout.tsx` on `auth()` / `redirect(` / `session.user.role` | **zero changed lines** |
| `git diff --stat middleware.ts` | empty |
| `grep -l '"pipedriveImport"' src/components/*.tsx` | exactly one path (`admin-sidebar.tsx`) |
| `src/components/admin-mobile-bar.tsx` opens with `"use client"`, named export | yes |

Behavioural proof at a real 320px viewport is `e2e/viewport-320.spec.ts`, run in **45-11** after the
phase's single Docker rebuild (V-7). No rebuild was performed here, so that spec stays RED by design.

## Threat Register Dispositions

| Threat ID | Disposition | How it landed |
|---|---|---|
| T-45-32 | mitigated | Both layout checks asserted present by the gate; `middleware.ts` diff empty; the layout's auth block has zero changed lines |
| T-45-33 | accepted | The drawer lists the same routes the rail listed, to the same already-authorized admin, and renders no data |
| T-45-34 | mitigated | `hidden md:flex` on the rail plus `min-w-0` on the content column; measured in 45-11 |
| T-45-35 | accepted | Focus trap, scroll lock, Escape, overlay click and focus return are Radix defaults, not overridden |
| T-45-36 | mitigated | All 11 literals in `admin.nav.*`; presence gated by 45-01's `REQUIRED_SHELL_KEYS`, absence by this plan's three-form literal table |
| T-45-SC | mitigated | Nothing installed. `package.json` and `package-lock.json` untouched |

## Known Stubs

None.

## Self-Check: PASSED

- `src/components/__tests__/admin-shell-wiring.test.ts` — FOUND
- `src/components/admin-mobile-bar.tsx` — FOUND
- `src/components/admin-sidebar.tsx` — FOUND
- `src/app/admin/layout.tsx` — FOUND
- Commit `3e3a00e` — FOUND
- Commit `d06f184` — FOUND
- Commit `830277a` — FOUND
