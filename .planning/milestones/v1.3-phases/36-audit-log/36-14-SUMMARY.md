---
phase: 36-audit-log
plan: 14
subsystem: admin-retention-ui
tags: [audit-log, retention, admin, rsc-boundary, next-intl, alert-dialog, AUDIT-04]
requires:
  - "36-04 (the audit.retention.* and admin.dashboard.auditLog* locale keys)"
  - "36-08 (readRetentionDays / writeRetentionDays / readAuditStats)"
provides:
  - "/admin/audit — server page rendering the retention window and what it costs"
  - "saveRetention(days) — role-checked server action wrapping writeRetentionDays"
  - "RetentionForm — the client module owning input state, transition, toast and the shorten AlertDialog"
  - "Sidebar entry and admin-dashboard tile pointing at /admin/audit"
affects:
  - "36-18 (the pruner reads the window this page writes)"
tech-stack:
  added: []
  patterns:
    - "server page + sibling 'use client' form, only scalars crossing the boundary (CFUI-01)"
    - "controlled AlertDialog with no trigger component — the non-definer shape from delete-note-dialog.tsx"
    - "confirmation gated on the DIRECTION of the change, not on the action itself"
    - "server action re-checks the admin role because a layout redirect protects renders, not POSTs"
key-files:
  created:
    - src/app/admin/audit/page.tsx
    - src/app/admin/audit/actions.ts
    - src/app/admin/audit/retention-form.tsx
  modified:
    - src/components/admin-sidebar.tsx
    - src/app/admin/page.tsx
decisions:
  - "RetentionForm receives only `retentionDays: number | null`. The cost readouts stay in the server component, which makes 'never optimistically updated' structural instead of a rule someone has to remember."
  - "RETENTION_MIN / RETENTION_MAX are NOT imported into the client module — `src/lib/audit/settings.ts` imports `@/db`, and pulling it into a browser bundle to read two integers is the wrong trade. The bounds are mirrored as local constants with a comment; the server action + writeRetentionDays remain the only enforcement."
  - "The saved window is tracked in client state and advanced on success, so a second click cannot re-open the shorten confirmation for a shortening that already happened."
  - "The confirm button calls preventDefault so the dialog stays open while the save is in flight — otherwise Radix closes it and the spinner is never seen."
  - "parseDays uses a digits-only regex rather than Number()/parseInt, which is what rejects '1.5', '1e3', '-1' and ' ' instead of silently coercing them."
  - "saveRetention calls revalidatePath('/admin/audit') on success so a later navigation cannot serve a cached page whose input disagrees with storage."
metrics:
  duration: ~25 min
  completed: 2026-08-16
---

# Phase 36 Plan 14: Retention Admin Control Summary

`/admin/audit` — a server page that renders the retention window next to the two numbers
that say what it costs, a client form that confirms only when the window is **lowered**, and
a server action that re-checks the admin role because the layout redirect protects the page
render and not the POST.

## What Was Built

### `src/app/admin/audit/page.tsx` (server)

Reads `readRetentionDays()` and `readAuditStats()` concurrently — neither throws, both fail
closed inside 36-08's module, so the page renders even when the database is unhappy. Renders
the `space-y-6` shell, the `text-3xl font-bold` `<h1>` every admin page uses, the setting
card wrapping `<RetentionForm>`, and the "what this window costs" card.

**No `auth()` and no `redirect()` in this file.** `src/app/admin/layout.tsx` already
redirects a session-less or non-admin visitor away from every `/admin/*` render; a second
check here would be a second thing to keep in sync.

The two readouts render at the Label role (`text-sm leading-tight font-semibold`) over Meta
labels, not the dashboard's larger bold stat treatment — they are the cost of a setting shown
next to the setting, not KPIs.

The `retentionDays === null` branch renders `audit.retention.notSet` and is documented in
source as **reachable and not to be deleted**: a fresh install shows the seeded `90` from
migration 0014, and `null` still occurs when a row is cleared out of band, corrupted past the
zod parse, or restored from a pre-0014 dump. There is no "keep entries forever" control
anywhere on the page.

### `src/app/admin/audit/actions.ts`

`saveRetention(days)` re-checks `session.user.role !== "admin"` (T-36-30), delegates to
`writeRetentionDays` and returns its result unchanged — the range lives in exactly one place.
Adds `revalidatePath("/admin/audit")` on success (see Deviations).

### `src/app/admin/audit/retention-form.tsx` (client)

All seven interaction rows from the UI-SPEC's behaviour table:

| Row | Implementation |
|-----|----------------|
| Empty / non-integer / `<1` / `>3650` | `canSave` false; helper text always visible and neutral; no destructive colour anywhere on the input |
| Unchanged from saved | `changed` false → Save disabled |
| Raised, or set for the first time | saves directly; `Loader2 animate-spin` + `retention.saving`, `Input` disabled, `toast.success` |
| Lowered | `lowers` opens the controlled `AlertDialog` first; confirm runs the same `save()` |
| Dialog cancelled | `onOpenChange` writes only the open flag — the typed value is untouched |
| Save fails | rejected result and thrown action share one handler: input re-enabled, value retained, `toast.error` |
| After success | the readouts are in the server component and are unreachable from here |

The dialog and the button that opens it both live in this module, and only a `number | null`
crosses the boundary — CFUI-01. The dialog is controlled with no `AlertDialogTrigger`, the
non-definer shape `delete-note-dialog.tsx` documents, so the repo-wide gate never engages.

### `src/components/admin-sidebar.tsx` and `src/app/admin/page.tsx`

Sidebar gains `{ title: "Audit Log", href: "/admin/audit", icon: ScrollText }` after
Webhooks. **This is the one new user-visible English literal phase 36 writes**, and it is
deliberate: all five siblings in that array are literals and half-migrating one entry would
read as a bug. The Data Management grid gains a third translated tile using
`admin.dashboard.auditLog` / `admin.dashboard.auditLogDescription`.

## Verification

| Gate | Result |
|------|--------|
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors (125 pre-existing warnings, none in the files this plan touches) |
| `npm test` | 74 files, 1287 passed / 4 skipped, 0 failed |
| CFUI-01 rsc-boundary gate | 14 passed |

### Acceptance criteria — measured

| Criterion | Expected | Actual |
|-----------|----------|--------|
| `grep -c "auth()\|redirect(" page.tsx` | 0 | **0** |
| `grep -c 'getTranslations(.audit.)' page.tsx` | 1 | **1** |
| `grep -c "text-3xl font-bold" page.tsx` | 1 | **1** |
| `grep -c "text-2xl" page.tsx` | 0 | **0** |
| `grep -c "retention.notSet" page.tsx` | 1 | **1** |
| `grep -cE "role !== .admin.\|session" actions.ts` | ≥1 | **2** |
| `grep -c "writeRetentionDays" actions.ts` | 1 | **3 lines / 1 call site** — see below |
| `grep -c '"use client"' retention-form.tsx`, first non-empty line | 1 | **1**, line 1 |
| `grep -c "AlertDialog" retention-form.tsx` | ≥4 | **24** |
| `grep -c "htmlFor=" retention-form.tsx` | 1 | **1** |
| `grep -c "aria-describedby" retention-form.tsx` | 1 | **1** |
| `grep -c "max-w-32" retention-form.tsx` | 1 | **1** |
| `grep -cE "text-destructive\|bg-destructive" retention-form.tsx` | confirm button only | **1** — the `AlertDialogAction` className, verified by reading |
| `grep -cE ">Save<\|>Cancel<\|>Confirm<\|>OK<\|>Apply<" retention-form.tsx` | 0 | **0** |
| `grep -c "/admin/audit" admin-sidebar.tsx` | 1 | **1** |
| `grep -c "ScrollText" admin-sidebar.tsx` | 2 | **2** |
| `grep -c "/admin/audit" admin/page.tsx` | 1 | **1** |
| `grep -c "admin.dashboard.auditLog" admin/page.tsx` | ≥1 | **1** — see below |

**`writeRetentionDays` — 3 lines, 1 call site.** The known plan defect: `grep -c` counts
lines, and the import line plus two doc-comment references match alongside the single call.
`grep -c "writeRetentionDays(" actions.ts` returns **1**, which is the number the criterion
was actually reaching for. No import was aliased to make the stated number come out.

**`admin.dashboard.auditLog` — the fully-qualified key is not what the JSX contains.** The
file binds `getTranslations('admin.dashboard')` at the top and the tile reads `t('auditLog')`
/ `t('auditLogDescription')`, so the literal `admin.dashboard.auditLog` appears only in a
source comment above the tile naming the two keys it reads. That comment is genuinely useful
(it is how a reader finds them in the three locale files), but the gate as written can only
be satisfied by prose in this file, and that is worth recording rather than reporting as a
clean pass. No English literal was written in the tile.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `revalidatePath` after a successful save**

- **Found during:** Task 1
- **Issue:** The plan's action spec was "delegate to `writeRetentionDays` and return its
  result unchanged". Without a cache invalidation, a later navigation back to `/admin/audit`
  can be served from the Next.js router cache with the pre-save window in the input, so the
  page would show a number that disagrees with storage — on an audit-retention setting, that
  is a UI asserting a policy that is not in effect.
- **Fix:** `revalidatePath("/admin/audit")` on the success branch only. The returned result
  is still forwarded unchanged, so the "one source of truth for the range" rule is intact.
- **Files modified:** `src/app/admin/audit/actions.ts`
- **Commit:** bce37f1

**2. [Rule 3 - Blocking issue] The retention bounds are mirrored, not imported**

- **Found during:** Task 2
- **Issue:** `RETENTION_MIN` / `RETENTION_MAX` are exported from
  `src/lib/audit/settings.ts`, which imports `@/db`. Importing them from a `'use client'`
  module would pull a server-only database module into the browser bundle.
- **Fix:** Local `MIN_DAYS` / `MAX_DAYS` constants with a module-header note explaining why
  they are not imported and stating that the server action plus `writeRetentionDays` are the
  actual enforcement — the client bounds only decide whether the button is enabled.
- **Files modified:** `src/app/admin/audit/retention-form.tsx`
- **Commit:** d5b42f5
- **Note:** a db-free `retention-bounds.ts` would remove the duplication, but adding a file
  outside the plan's `files_modified` for two integers was the larger change. Recorded here
  so a later phase can make that call deliberately.

### Plan Defects Encountered

**Task 1's `npm run typecheck` gate is unsatisfiable at Task 1's boundary.** `page.tsx`
imports `./retention-form`, which Task 2 creates. At the Task 1 commit the only typecheck
error was `TS2307: Cannot find module './retention-form'` and nothing else; it cleared the
moment Task 2 landed. The task order was not changed and no stub was written — a placeholder
module would have been a worse artifact than a one-commit-long known-missing import.

### Threat Model

| Threat | Disposition | Where it landed |
|--------|-------------|-----------------|
| T-36-30 (non-admin invokes `saveRetention`) | mitigated | `actions.ts` re-checks `session.user.role !== "admin"` before any write; the disabled button is documented in source as cosmetic |
| T-36-07 (destructive retention value) | mitigated | `writeRetentionDays` validates before any DB call; the UI additionally confirms only when the window is LOWERED |
| T-36-31 (UI claiming deletion at save time) | mitigated | dialog copy says "the next time pruning runs"; the readouts live in the server component and cannot be optimistically updated |
| T-36-32 (React element crossing into an `asChild` slot) | mitigated | dialog and its opener are both in the client module; only `number \| null` crosses; the rsc-boundary gate passes (14 tests) |
| T-36-SC (package installs) | accepted | zero packages added, zero `shadcn add` |

## Known Stubs

None.

## Threat Flags

None — this plan adds one server action at an existing trust boundary already covered by
T-36-30, and no new network endpoint, file access path or schema change.

## Out-of-Scope Discoveries

Recorded here rather than in `deferred-items.md` (three wave-2 agents collided on that file).

1. **`src/lib/audit/settings.ts` cannot be imported from client code.** Any future client
   module needing `RETENTION_MIN` / `RETENTION_MAX` will hit the same wall. A three-line
   db-free constants module re-exported by `settings.ts` would fix it once.
2. **`admin-sidebar.tsx` is still fully untranslated** (seven English literals plus "Admin
   Panel" and "Back to App"). Explicitly out of scope for this phase; flagged because the new
   entry adds an eighth.

## Self-Check: PASSED

Files:

- FOUND: `src/app/admin/audit/page.tsx`
- FOUND: `src/app/admin/audit/actions.ts`
- FOUND: `src/app/admin/audit/retention-form.tsx`
- FOUND: `src/components/admin-sidebar.tsx` (modified)
- FOUND: `src/app/admin/page.tsx` (modified)

Commits:

- FOUND: `bce37f1` feat(36-14): add the /admin/audit retention page and its save action
- FOUND: `d5b42f5` feat(36-14): add the retention client form with the shorten confirmation
- FOUND: `63a72f3` feat(36-14): link /admin/audit from the sidebar and the admin dashboard

No file deletions in any commit (`git diff --diff-filter=D 081dfb3..HEAD` is empty). No
untracked files remain.
