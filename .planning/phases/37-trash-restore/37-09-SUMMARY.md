---
phase: 37-trash-restore
plan: 09
subsystem: navigation
tags: [navigation, user-menu, admin-sidebar, admin-dashboard, copy, i18n, lucide]

# Dependency graph
requires:
  - phase: 37-trash-restore
    plan: 03
    provides: "nav.trash, admin.dashboard.trash and admin.dashboard.trashDescription in all three locale catalogues — the three keys this plan consumes"
  - phase: 36-audit-log
    provides: "The two-entry admin navigation pattern (English literal in the sidebar array + translated dashboard tile) and the source comment that justifies the asymmetry"
provides:
  - "The /trash entry in the user menu, visible to every authenticated user"
  - "The Trash entry in the admin sidebar, placed with Audit Log as the data-lifecycle pair"
  - "The translated /admin/trash tile in the admin dashboard's Data Management grid"
  - "Six CRM delete confirmations that no longer claim the delete is irreversible"
affects:
  [
    37-04-trash-page,
    37-08-retention-admin,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Third instance of the Phase 36 two-entry admin nav pattern: an English-literal sidebar array entry beside its translated dashboard tile, with the asymmetry explained in a source comment rather than half-migrated"
    - "Copy-honesty correction: when a phase makes an existing confirmation's claim false, the sentence is corrected in the same phase rather than left to drift"

key-files:
  created: []
  modified:
    - src/components/user-menu.tsx
    - src/components/admin-sidebar.tsx
    - src/app/admin/page.tsx
    - src/app/deals/deal-card.tsx
    - src/app/deals/deal-dialog.tsx
    - src/app/organizations/delete-dialog.tsx
    - src/app/people/delete-dialog.tsx
    - src/app/activities/activity-dialog.tsx
    - src/app/activities/activity-list.tsx

key-decisions:
  - "The /trash user-menu item is NOT role-gated — trash is owner-scoped and only purge is admin-only; visibility is not authorization, and /trash scopes its own query (37-07)"
  - "The /trash icon carries no destructive colour: sign-out remains the only red item in the user menu, because a route to a recovery page is not a danger"
  - "nav-header.tsx deliberately untouched — no new top-level nav item; trash is a recovery surface, not a daily one"
  - "The admin sidebar entry stays an English literal (matching all eight siblings) while the dashboard tile is translated — the established Phase 36 asymmetry, restated in a new comment that points at the existing justification rather than repeating it"
  - "The two workflow delete dialogs keep 'This action cannot be undone.' — both are hard deletes and the sentence is true there"
  - "No new i18n keys for the six copy corrections: those strings are English literals in the source today, and migrating them into the catalogues is unrelated debt"

patterns-established:
  - "A grep assertion pinning the destructive-colour count of a nav surface, so a later phase cannot quietly paint a recovery route red"

requirements-completed: [TRASH-01, TRASH-03]

# Metrics
duration: 14min
completed: 2026-08-16
---

# Phase 37 Plan 09: Navigation Entries and Delete-Dialog Honesty Summary

Wires `/trash` into the user menu and `/admin/trash` into both admin navigation surfaces, and corrects the six CRM delete confirmations that this phase would otherwise turn into lies.

## What Was Built

### Task 1 — Navigation entries (commit `7fbeefa`)

Three single-entry edits, each copying the shape of its established sibling verbatim:

- **`src/components/user-menu.tsx`** — a `DropdownMenuItem asChild` wrapping `<a href="/trash">` with a `Trash2` icon at `mr-2 h-4 w-4` and `{t("trash")}` (the file's `t` is already `useTranslations("nav")`, so this resolves to `nav.trash`). Placed after the API Keys item and before the admin-gated User Management block, inside the same group.
- **`src/components/admin-sidebar.tsx`** — the array entry `{ title: "Trash", href: "/admin/trash", icon: Trash2 }` immediately after Audit Log.
- **`src/app/admin/page.tsx`** — a `Card` in the Data Management grid, wrapped in `<Link href="/admin/trash">`, rendering `t('trash')` and `t('trashDescription')` from the already-scoped `admin.dashboard` namespace.

`Trash2` was added to each file's existing `lucide-react` import. Zero new lucide symbols enter the product — `Trash2` is already in use throughout.

### Task 2 — Delete-dialog honesty correction (commit `39b8faf`)

`This action cannot be undone.` replaced with `You can restore it from Trash.` in exactly six files. Three of them wrap the sentence across two source lines (`organizations/delete-dialog.tsx`, `people/delete-dialog.tsx`, `activities/activity-list.tsx`), so those were matched on the sentence and re-flowed rather than edited by line number.

Nothing else in any of the six dialogs changed: not the structure, not the buttons, not the `AlertTriangle` icons, not the destructive treatment. Only the claim about reversibility.

## Acceptance Criteria

| Criterion | Result |
|---|---|
| `grep -c 'href="/trash"' src/components/user-menu.tsx` | 1 |
| `text-destructive` + `text-red` count in `user-menu.tsx` | **2 before, 2 after** — unchanged |
| `/trash` item at a lower line than the `user.role === "admin"` block | line 71 vs line 76 |
| `grep -c '"/admin/trash"'` in sidebar / dashboard | 1 / 1 |
| `grep -c 'Trash2' src/components/nav-header.tsx` | 0 |
| `grep -rl 'restore it from Trash' src/app/` | exactly the six target files |
| `grep -rl 'cannot be undone' src/app/` | exactly the two workflow files, nothing else |
| No `src/messages/` path in the diff | confirmed |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors, 125 warnings (baseline) |
| `npm test` | 1549 passed / 4 skipped (baseline exactly) |
| `npx vitest run --config vitest.rsc.config.ts` | 8 passed |

The known load-sensitive flakes (`condition-evaluator.test.ts`, `toggle.test.ts`) did not fire on this run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Explanatory comment tripped its own grep assertion**

- **Found during:** Task 1, while checking acceptance criteria
- **Issue:** The comment written above the new `/trash` menu item explained that the icon is "deliberately not text-destructive". That literal token pushed the file's `text-destructive` + `text-red` occurrence count from 2 to 3, failing the criterion that the count be unchanged. The rendered UI was correct; the assertion designed to protect it was not.
- **Fix:** Reworded the comment to "carries no destructive colour", preserving the reasoning while keeping the grep a meaningful guard against a later phase painting the recovery route red.
- **Files modified:** `src/components/user-menu.tsx`
- **Commit:** `7fbeefa` (corrected before commit)

An acceptance criterion that a comment can break is a weak criterion, but the right response here was to keep the assertion sharp rather than loosen it — the thing it guards (a recovery route never rendered as a danger) is a real design constraint that this plan's own comment exists to state.

## Scope Judgement, Declared

`37-CONTEXT.md` scopes out "changing what the existing live list views show or filter". Task 2 was carried out anyway, on the reasoning the plan and `37-UI-SPEC.md § Surface 6` both record: a confirmation dialog's sentence is neither what a list shows nor how it filters, and shipping trash while six dialogs deny it exists is a defect this phase would itself create. Declared rather than assumed.

## Deliberately Not Done

- **`src/components/nav-header.tsx` untouched.** No top-level nav item. Trash is a recovery surface, and a persistent trash counter would make deleted records feel like an inbox.
- **`src/app/workflows/delete-workflow-dialog.tsx` and `src/app/workflows/[id]/edit/components/config-forms/http-config.tsx` untouched.** Workflows are hard-deleted with their run history; an HTTP config template is hard-deleted. Both are genuinely irreversible and changing them would make the app lie in the opposite direction.
- **No migration of the six English literals into the message catalogues.** Unrelated debt, explicitly not bundled in.

## Threat Model Dispositions

| Threat ID | Disposition | How it landed |
|---|---|---|
| T-37-24 | accept | The `/trash` item is visible to every authenticated user by design. The nav item is not the gate — `/trash` scopes its own query by owner-or-admin (37-07) and purge is gated separately (37-10, 37-13) |
| T-37-25 | mitigate | Both `/admin/trash` entries render only inside `/admin/*`, which `src/app/admin/layout.tsx` already redirects non-admins away from; the retention action re-checks the role itself (37-08) |
| T-37-26 | mitigate | The correction is scoped to exactly six files, and the grep assertion proving the two genuinely irreversible dialogs still say so passed |
| T-37-SC | accept | Nothing installed. Zero new lucide symbols |

## Known Stubs

None. Both routes referenced here (`/trash`, `/admin/trash`) are built by sibling plans in this phase (37-04 and 37-08). Until those land in the same phase, the three navigation entries point at routes that do not yet exist — this is wave ordering within a phase, not a stub, and the phase does not ship with either link dangling.

## Self-Check: PASSED

- `src/components/user-menu.tsx` — FOUND
- `src/components/admin-sidebar.tsx` — FOUND
- `src/app/admin/page.tsx` — FOUND
- All six delete-dialog files — FOUND
- Commit `7fbeefa` — FOUND
- Commit `39b8faf` — FOUND
