---
phase: 23-resend-email-integration-for-production
plan: 03
subsystem: auth, ui
tags: [invite, email, notifications, drizzle, zod, next-intl, server-actions]

# Dependency graph
requires:
  - phase: 23-01
    provides: user_invites and notification_preferences DB tables
  - phase: 23-02
    provides: sendInviteEmail function and email templates
provides:
  - inviteUser server action for admin invite flow
  - InviteDialog component on admin users page
  - Invite token validation API endpoint
  - Signup flow integration with invite auto-approval
  - Notification preferences page at /settings/notifications
  - getNotificationPreferences and updateNotificationPreferences server actions
affects: [23-04, email-cron-processors]

# Tech tracking
tech-stack:
  added: []
  patterns: [invite-token-flow, notification-preferences-upsert]

key-files:
  created:
    - src/app/admin/users/invite-dialog.tsx
    - src/app/api/invite/validate/route.ts
    - src/app/settings/notifications/actions.ts
    - src/app/settings/notifications/notification-form.tsx
    - src/app/settings/notifications/page.tsx
  modified:
    - src/app/admin/users/actions.ts
    - src/app/admin/users/page.tsx
    - src/app/(auth)/signup/page.tsx
    - src/app/api/signup/route.ts
    - src/app/settings/layout.tsx
    - src/messages/en-US.json
    - src/messages/pt-BR.json
    - src/messages/es-ES.json

key-decisions:
  - "Signup page at (auth)/signup used instead of /register (plan referenced non-existent path)"
  - "Invite token validated via separate GET API endpoint for client-side pre-fill"
  - "Invited users set to approved status at creation (skip pending_approval after email verification)"
  - "Domain whitelist check skipped for valid invited users"

patterns-established:
  - "Invite flow: admin creates invite -> email sent -> user clicks link -> signup with pre-filled email -> auto-approved"
  - "Notification preferences: upsert pattern with onConflictDoUpdate on userId PK"

requirements-completed: [EMAIL-04, EMAIL-08, EMAIL-09]

# Metrics
duration: 5min
completed: 2026-03-24
---

# Phase 23 Plan 03: Invite User Flow and Notification Preferences Summary

**Admin invite-by-email flow with token validation, auto-approval on registration, and notification preferences settings page with 3 toggles**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-24T01:18:05Z
- **Completed:** 2026-03-24T01:24:00Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Admin can invite users via email from the users page; invite record created with 7-day expiry token
- Signup page handles invite tokens: validates, pre-fills email (read-only), auto-approves user on registration
- Notification preferences page at /settings/notifications with 3 independent toggles (deal-assigned, activity-reminder, weekly-digest)
- All UI text i18n-ready in en-US, pt-BR, es-ES
- 12 passing tests covering email validation, token logic, and preference schema validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Invite user flow** - `c2cc0e9` (feat)
2. **Task 2: Notification preferences settings page** - `58344c5` (feat)

## Files Created/Modified
- `src/app/admin/users/actions.ts` - Added inviteUser server action with validation and duplicate checks
- `src/app/admin/users/invite-dialog.tsx` - Client dialog component for sending invites
- `src/app/admin/users/page.tsx` - Added InviteDialog to page header
- `src/app/api/invite/validate/route.ts` - GET endpoint to validate invite tokens
- `src/app/(auth)/signup/page.tsx` - Invite token handling, email pre-fill, warning for invalid tokens
- `src/app/api/signup/route.ts` - Invite-aware signup with auto-approval and invite acceptance
- `src/app/settings/notifications/actions.ts` - get/update notification preference server actions
- `src/app/settings/notifications/notification-form.tsx` - Client form with 3 checkbox toggles
- `src/app/settings/notifications/page.tsx` - Server page loading preferences
- `src/app/settings/layout.tsx` - Added Notifications nav item with Bell icon
- `src/messages/en-US.json` - Added invite and notification i18n keys
- `src/messages/pt-BR.json` - Added invite and notification i18n keys
- `src/messages/es-ES.json` - Added invite and notification i18n keys
- `src/app/admin/users/actions.test.ts` - Invite validation and token logic tests
- `src/app/settings/notifications/actions.test.ts` - Preference default and schema validation tests

## Decisions Made
- Used existing signup page at `(auth)/signup` instead of plan-referenced `/register/page.tsx` (path did not exist)
- Created separate `/api/invite/validate` GET endpoint for client-side token validation and email pre-fill
- Invited users get `approved` status directly at user creation (email verification still required)
- Domain whitelist check skipped for users with valid invite tokens
- Used Checkbox component for notification toggles (consistent with project pattern, no Switch component available)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Signup page path correction**
- **Found during:** Task 1 (Registration integration)
- **Issue:** Plan referenced `src/app/register/page.tsx` which does not exist; actual signup is at `src/app/(auth)/signup/page.tsx`
- **Fix:** Updated the actual signup page and API route instead
- **Files modified:** `src/app/(auth)/signup/page.tsx`, `src/app/api/signup/route.ts`
- **Verification:** TypeScript compiles clean, invite flow works end-to-end
- **Committed in:** c2cc0e9

**2. [Rule 2 - Missing Critical] Added invite validation API endpoint**
- **Found during:** Task 1 (Registration integration)
- **Issue:** Client-side signup page needs to validate invite token and pre-fill email before form submission
- **Fix:** Created `/api/invite/validate` GET endpoint returning email and validity
- **Files modified:** `src/app/api/invite/validate/route.ts`
- **Verification:** TypeScript compiles clean
- **Committed in:** c2cc0e9

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both fixes necessary for correct operation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Invite flow and notification preferences are ready for Plan 04's cron processors
- `getNotificationPreferences` action available for checking user preferences before sending notification emails
- `userInvites` table populated when admin sends invites, consumed by signup API

---
*Phase: 23-resend-email-integration-for-production*
*Completed: 2026-03-24*
