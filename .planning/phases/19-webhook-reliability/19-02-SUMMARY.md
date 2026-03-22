---
phase: 19-webhook-reliability
plan: 02
subsystem: ui
tags: [webhooks, admin, tanstack-table, crud, i18n, next-intl]

requires:
  - phase: 19-webhook-reliability
    provides: webhooks and webhook_deliveries schema tables
provides:
  - Admin webhook management page at /admin/webhooks with full CRUD
  - Sidebar navigation for webhooks admin
  - i18n support for webhooks admin in en-US, es-ES, pt-BR
affects: [19-webhook-reliability]

tech-stack:
  added: []
  patterns: [admin CRUD page with TanStack Table + server actions + dialog forms]

key-files:
  created:
    - src/app/admin/webhooks/page.tsx
    - src/app/admin/webhooks/columns.tsx
    - src/app/admin/webhooks/data-table.tsx
    - src/app/admin/webhooks/webhook-dialog.tsx
    - src/app/admin/webhooks/delete-dialog.tsx
    - src/app/admin/webhooks/webhooks-client.tsx
    - src/app/admin/webhooks/actions.ts
  modified:
    - src/components/admin-sidebar.tsx
    - src/messages/en-US.json
    - src/messages/es-ES.json
    - src/messages/pt-BR.json

key-decisions:
  - "Used Checkbox instead of Switch for active toggle (Switch component not available in project)"
  - "Separate webhooks-client.tsx wrapper for client-side create button state management"
  - "Secret shown once after creation with copy-to-clipboard, not stored client-side"

patterns-established:
  - "Admin CRUD page pattern: server page.tsx + client data-table + dialog forms + server actions"

requirements-completed: [WHOOK-02]

duration: 5min
completed: 2026-03-22
---

# Phase 19 Plan 02: Admin Webhook Management UI Summary

**Admin CRUD page for webhook subscriptions with TanStack Table, create/edit dialog, delete confirmation, and i18n in 3 locales**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-22T16:35:04Z
- **Completed:** 2026-03-22T16:39:36Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Full admin webhook management page at /admin/webhooks with all webhooks listed across users
- Create/edit dialog with URL, events selection (18 event types), owner dropdown, active toggle
- Signing secret displayed once after creation with copy-to-clipboard functionality
- Delete confirmation dialog warning about delivery history deletion
- Admin sidebar updated with Webhooks nav item using Radio icon

## Task Commits

Each task was committed atomically:

1. **Task 1: Create webhook CRUD server actions and admin sidebar update** - `4f68828` (feat)
2. **Task 2: Create webhook list page with data table and dialogs** - `0c91aad` (feat)

## Files Created/Modified
- `src/app/admin/webhooks/actions.ts` - Server actions for create/update/delete with admin auth and Zod validation
- `src/app/admin/webhooks/page.tsx` - Server component querying all webhooks with user join
- `src/app/admin/webhooks/columns.tsx` - TanStack Table column definitions with i18n
- `src/app/admin/webhooks/data-table.tsx` - Client data table with edit/delete dialog integration
- `src/app/admin/webhooks/webhook-dialog.tsx` - Create/edit dialog with react-hook-form + Zod
- `src/app/admin/webhooks/delete-dialog.tsx` - AlertDialog confirmation for webhook deletion
- `src/app/admin/webhooks/webhooks-client.tsx` - Client wrapper with create button state
- `src/components/admin-sidebar.tsx` - Added Webhooks nav item with Radio icon
- `src/messages/en-US.json` - Added admin.webhooks i18n namespace
- `src/messages/es-ES.json` - Added admin.webhooks i18n namespace (Spanish)
- `src/messages/pt-BR.json` - Added admin.webhooks i18n namespace (Portuguese)

## Decisions Made
- Used Checkbox instead of Switch for active toggle since Switch UI component is not available in the project
- Created separate webhooks-client.tsx wrapper to manage create dialog open state client-side while keeping page.tsx as a server component
- Signing secret is returned from createWebhook action and shown once, not persisted in client state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Zod error property access**
- **Found during:** Task 1
- **Issue:** Used `parsed.error.errors[0].message` but Zod uses `issues` not `errors`
- **Fix:** Changed to `parsed.error.issues[0].message`
- **Files modified:** src/app/admin/webhooks/actions.ts
- **Committed in:** 4f68828 (Task 1 commit)

**2. [Rule 3 - Blocking] Replaced missing Switch component with Checkbox**
- **Found during:** Task 2
- **Issue:** Plan specified Switch component but `@/components/ui/switch` does not exist in project
- **Fix:** Used existing Checkbox component for active toggle
- **Files modified:** src/app/admin/webhooks/webhook-dialog.tsx
- **Committed in:** 0c91aad (Task 2 commit)

**3. [Rule 1 - Bug] Fixed events null coercion from LEFT JOIN**
- **Found during:** Task 2
- **Issue:** LEFT JOIN with users makes events column nullable in TypeScript, causing type error
- **Fix:** Added `events: r.events ?? []` in the data mapping
- **Files modified:** src/app/admin/webhooks/page.tsx
- **Committed in:** 0c91aad (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admin webhook management complete, plan 19-03 (delivery history + DLQ) can proceed
- Each webhook row links to /admin/webhooks/[id] for the delivery detail page (plan 03)

---
*Phase: 19-webhook-reliability*
*Completed: 2026-03-22*
