---
phase: 37-trash-restore
plan: 08
subsystem: admin-settings
tags: [trash, retention, admin, rsc, authz]
requires:
  - "src/lib/trash/settings.ts (37-01): readTrashRetentionDays, writeTrashRetentionDays, readTrashStats, RETENTION_MIN/MAX"
  - "trash.retention.* i18n keys in all three locales (37-03)"
  - "src/app/admin/layout.tsx: the /admin/* non-admin redirect"
provides:
  - "/admin/trash — the operator surface for the trash retention window (TRASH-03)"
  - "saveTrashRetention: the one write path for trash.retention_days, admin-gated server-side"
  - "RetentionForm: the controlled input, transition, toast and shorten AlertDialog"
affects:
  - "src/components/admin-sidebar.tsx and src/app/admin/page.tsx will link here (not this plan's work)"
tech-stack:
  added: []
  patterns:
    - "Server action re-checks session.user.role even under an admin-gated layout"
    - "Validation forwarded from the settings module rather than re-implemented"
    - "Controlled AlertDialog with no trigger component (CFUI-01 boundary)"
key-files:
  created:
    - src/app/admin/trash/actions.ts
    - src/app/admin/trash/retention-form.tsx
    - src/app/admin/trash/page.tsx
  modified: []
decisions:
  - "The /admin/trash surface is a whole-file mirror of /admin/audit rather than a fresh design"
  - "Bounds are written out as 1..365 in the client module rather than imported from the server-only settings module"
  - "Only a lowered window opens the confirmation; raising or first-setting saves directly"
  - "No mass-purge control on the settings page, enforced by a grep gate"
metrics:
  duration: ~18 min
  completed: 2026-08-16
  tasks: 3
  files: 3
---

# Phase 37 Plan 08: /admin/trash Retention Surface Summary

Built `/admin/trash` as a structural mirror of `/admin/audit` — a validated retention-window input with a shorten confirmation, a cost readout, and a server action that re-checks the admin role rather than trusting a hidden button.

## What Was Built

Three new files under `src/app/admin/trash/`, no existing file touched.

**`actions.ts` (45 lines)** — `saveTrashRetention(days)`. The admin gate lives here, before the `days` argument is used, because `src/app/admin/layout.tsx` redirects non-admins away from every `/admin/*` *page render* and a server action is a POST endpoint the browser can invoke with no page involved. The action deliberately does not re-implement the range check: it forwards `writeTrashRetentionDays`' result unchanged, so `1..365` has exactly one definition. On success it revalidates `/admin/trash` so the next navigation cannot serve a window that disagrees with the input.

**`retention-form.tsx` (237 lines, client)** — the controlled input, the transition, the toast and the shorten `AlertDialog`. Copied whole from the audit form with the four planned substitutions: `MAX_DAYS = 365`, the two `trash-retention-days` element IDs, the `trash` translation namespace, and `saveTrashRetention` as the imported action. Everything else is unchanged, including the digits-only `parseDays` (the `/^\d+$/` test is what rejects `1.5`, `1e3`, `-1`, a bare space and the empty string, all of which `Number()` alone would accept or coerce to `0`), the `inRange`/`changed`/`canSave` enablement, and the `event.preventDefault()` on the confirm button that keeps the dialog open with its spinner while the save is in flight.

**`page.tsx` (149 lines, server)** — the bare-`<h1>` admin shell, the retention card, and the cost card. Two independent non-throwing reads run in parallel; `stats.oldestDeletedAt` is converted to an ISO string in the server component before it crosses anywhere. Only `retentionDays: number | null` crosses into `RetentionForm` — no element, no function.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two header comments reworded to avoid tripping this plan's own grep gates**

- **Found during:** Task 3 (and pre-emptively in Task 2)
- **Issue:** The plan asked for two comments to be "carried forward" whose natural wording contains the exact strings its own acceptance criteria assert are absent. Carrying forward the audit page's `which is 'use client'` phrasing would have made `grep -c "use client" page.tsx` return 1 (the shell strips the quotes, so the pattern is the bare substring and matches inside a comment). Writing the plan's own suggested sentence *"An empty trash has no oldest record"* made `grep -ci 'empty trash' page.tsx` return 1 — this one actually fired and was caught by the gate, not by inspection.
- **Fix:** Kept both meanings, changed the wording. `which is 'use client'` → `which is a client module`. `An empty trash has no oldest record` → `When nothing is in trash there is no oldest deletion, which is not the same as "now"`. Likewise the mass-purge prohibition reads `NO ONE-CLICK "PURGE EVERYTHING NOW" CONTROL` instead of naming the banned phrase.
- **Why this is the right resolution:** the gates exist to keep a client directive and a mass-destruction button out of the server page. Both intents are satisfied; only prose changed. Weakening either gate to accommodate a comment would have been the wrong direction.
- **Files modified:** `src/app/admin/trash/page.tsx`, `src/app/admin/trash/retention-form.tsx`
- **Commits:** 685d4a3, 93b0281

No other deviation. No architectural decision was required, no dependency was installed, and no existing file was modified.

## Verification

| Check | Result |
|-------|--------|
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors, 125 warnings — identical to the documented baseline |
| `npx vitest run --config vitest.rsc.config.ts` | 8 passed, including the repo-wide RSC boundary scan over both new `.tsx` files |
| `npm test` | 79 files, 1549 passed / 4 skipped — exactly the wave-1 baseline |
| `npx vitest run src/app/admin` | 36 passed |

The two known load-sensitive flakes (`condition-evaluator.test.ts`, `toggle.test.ts`) did not trip on this run.

### Acceptance gates

All eighteen grep assertions across the three tasks pass:

- `role !== "admin"` appears once in `actions.ts`; `safeParse|z\.` appears zero times; `revalidatePath("/admin/trash")` once; file opens with `"use server"`.
- `retention-form.tsx` opens with `"use client"`; `MAX_DAYS = 365` once; zero imports from the settings module; zero `AlertDialogTrigger`; `event.preventDefault()` present; zero generic CTA labels (`>Save<`, `>Cancel<`, `>Confirm<`, `>OK<`, `>Yes<`, `>Apply<`).
- `page.tsx` has zero `use client`, zero `auth()`, zero `bg-primary/10`, zero case-insensitive `empty trash`, and carries the `NO AUTH CODE HERE, DELIBERATELY` comment.

## Threat Model Coverage

| Threat | Disposition | How it is met |
|--------|-------------|---------------|
| T-37-01 Elevation of Privilege | mitigated | `session.user.role !== "admin"` re-checked inside `saveTrashRetention` before `days` is used. The disabled Save button is cosmetic and is documented as such in the source. |
| T-37-04 DoS / Tampering on the day count | mitigated | Three agreeing layers — `Input min={1} max={365}`, the client digits-only `parseDays`, and the only actual control, `writeTrashRetentionDays`' zod parse before any DB call. The action does not re-implement it. |
| T-37-21 Tampering by shortening | mitigated | Only `lowers` opens the `AlertDialog`; its copy says "the next time trash is emptied", not "immediately", because the pruner is a daily chain and nothing is deleted at save time. |
| T-37-13 Tampering on the unset state | mitigated | `retention.notSet` renders when the window is `null`; there is no code-level default anywhere on this surface. |
| T-37-22 DoS via a mass-purge control | mitigated | Not built; kept out by a grep gate and an explicit source comment saying it must not be added. |
| T-37-23 RSC boundary violation | mitigated | Dialog and state both inside the client module, controlled, no trigger component; the page passes only `number \| null`. The repo-wide scan passes. |
| T-37-SC Package legitimacy | accepted | Nothing installed. No `shadcn add`, no registry fetch. |

## Known Stubs

None. Every element on the page is wired to a real data source: the input to `readTrashRetentionDays`, the two readouts to `readTrashStats`, and the save path to `writeTrashRetentionDays` through the gated action.

## Notes for Later Plans

- **`/admin/trash` is not yet reachable from anywhere.** The UI-SPEC assigns the `AdminSidebar` entry (after "Audit Log") and the admin-dashboard "Data Management" card to other work; this plan's `files_modified` covers only the three new files, so neither navigation entry was added here. Until one lands, the route is direct-URL only.
- The `admin.dashboard.trash` / `admin.dashboard.trashDescription` keys exist already (wave 1) and are unused so far — that is expected, not dead copy.
- `retention-form.tsx` duplicates the `1` and `365` bounds by design. If `RETENTION_MIN` / `RETENTION_MAX` ever change in `src/lib/trash/settings.ts`, three places move together: those constants, this file, and the `trash.retention.windowHelp` copy in all three locales.

## Self-Check: PASSED

- `src/app/admin/trash/actions.ts` — FOUND
- `src/app/admin/trash/retention-form.tsx` — FOUND
- `src/app/admin/trash/page.tsx` — FOUND
- commit `618e10a` — FOUND
- commit `685d4a3` — FOUND
- commit `93b0281` — FOUND
