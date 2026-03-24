---
phase: 23-resend-email-integration-for-production
plan: 01
subsystem: database, email
tags: [drizzle, nodemailer, i18n, use-intl, email-templates]

# Dependency graph
requires:
  - phase: 23-00
    provides: skeleton test files and vitest config
provides:
  - notification_preferences table (per-user email toggles)
  - user_invites table (invite token tracking)
  - digest_log table (weekly digest dedup)
  - activities.reminderSentAt column for reminder dedup
  - safeSend wrapper (silent fail when SMTP_HOST absent)
  - getEmailTranslator helper (non-React i18n via use-intl/core)
  - 3 existing email templates converted to i18n (verify, approved, password-reset)
  - emails.* i18n keys in all 3 locales
affects: [23-02, 23-03, 23-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [getEmailTranslator for non-React email i18n, safeSend SMTP guard pattern]

key-files:
  created:
    - src/db/schema/notification-preferences.ts
    - src/db/schema/user-invites.ts
    - src/db/schema/digest-log.ts
    - src/lib/email/i18n.ts
    - drizzle/0007_faithful_sunfire.sql
  modified:
    - src/db/schema/activities.ts
    - src/db/schema/index.ts
    - src/db/schema/_relations.ts
    - src/lib/email/send.ts
    - src/lib/email/templates/verify-email.ts
    - src/lib/email/templates/approved.ts
    - src/lib/email/templates/password-reset.ts
    - src/messages/en-US.json
    - src/messages/pt-BR.json
    - src/messages/es-ES.json
    - src/lib/email/send.test.ts
    - src/lib/email/templates/__tests__/templates.test.ts

key-decisions:
  - "Cast createTranslator return type to avoid strict generic inference on dynamic namespace keys"
  - "Applied migration SQL directly via psql since drizzle-kit migrate fails on empty journal with existing schema"

patterns-established:
  - "getEmailTranslator(locale, namespace): async i18n for email templates outside React context"
  - "safeSend(to, template): SMTP guard that logs and skips when SMTP_HOST is not configured"

requirements-completed: [EMAIL-01, EMAIL-02, EMAIL-03]

# Metrics
duration: 6min
completed: 2026-03-24
---

# Phase 23 Plan 01: DB Foundation & Email Infrastructure Summary

**3 new DB tables (notification prefs, user invites, digest log), safeSend SMTP guard, and i18n conversion of all 3 existing email templates via use-intl/core**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-24T01:02:53Z
- **Completed:** 2026-03-24T01:09:26Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments
- Created notification_preferences, user_invites, and digest_log tables plus activities.reminderSentAt column
- Built safeSend wrapper that silently skips email when SMTP_HOST is not configured
- Created getEmailTranslator helper using use-intl/core createTranslator for non-React i18n
- Converted all 3 existing email templates (verify-email, approved, password-reset) to async i18n
- Added emails.* i18n keys with proper translations to en-US, pt-BR, and es-ES
- Implemented tests for safeSend and template i18n (14 tests passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create DB schemas and run migration** - `c01efed` (feat)
2. **Task 2: Safe send wrapper, i18n email helper, and i18n existing templates** - `153902c` (feat)

## Files Created/Modified
- `src/db/schema/notification-preferences.ts` - Per-user email notification toggles table
- `src/db/schema/user-invites.ts` - Invite token tracking table
- `src/db/schema/digest-log.ts` - Weekly digest dedup tracking table
- `src/db/schema/activities.ts` - Added reminderSentAt column
- `src/db/schema/index.ts` - Added new table exports
- `src/db/schema/_relations.ts` - Added notificationPreferences and userInvites relations
- `src/lib/email/i18n.ts` - Email translator helper using use-intl/core
- `src/lib/email/send.ts` - Refactored with safeSend wrapper and locale support
- `src/lib/email/templates/verify-email.ts` - Converted to async i18n
- `src/lib/email/templates/approved.ts` - Converted to async i18n
- `src/lib/email/templates/password-reset.ts` - Converted to async i18n
- `src/messages/en-US.json` - Added emails.* namespace
- `src/messages/pt-BR.json` - Added emails.* namespace with Portuguese translations
- `src/messages/es-ES.json` - Added emails.* namespace with Spanish translations
- `src/lib/email/send.test.ts` - Implemented safeSend tests
- `src/lib/email/templates/__tests__/templates.test.ts` - Implemented template i18n tests
- `drizzle/0007_faithful_sunfire.sql` - Migration for new tables and column

## Decisions Made
- Cast `createTranslator` return type to `(key: string, values?) => string` to avoid strict TypeScript generic inference issues with dynamic namespace keys passed as strings
- Applied migration SQL directly via psql because drizzle-kit migrate fails when __drizzle_migrations journal is empty but schema already exists from prior manual setup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- drizzle-kit migrate failed because the migrations journal table was empty while the actual DB schema already existed (enum types like user_role would fail to create). Resolved by applying the new migration SQL directly via psql.
- TypeScript `createTranslator` generic inference resolved namespace keys to `never` when messages typed as `Record<string, unknown>`. Fixed by using `AbstractIntlMessages` type and casting the translator return.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 3 new DB tables and the activities column are live in the database
- safeSend and getEmailTranslator are ready for use by new email types in Plan 02
- All existing templates already use i18n, establishing the pattern for new templates

---
*Phase: 23-resend-email-integration-for-production*
*Completed: 2026-03-24*
