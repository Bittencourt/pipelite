---
phase: 23
slug: resend-email-integration-for-production
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-23
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.0.18 |
| **Config file** | vitest.config.ts — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | EMAIL-01 | db-verify | `psql ... \d notification_preferences && tsc --noEmit` | N/A | pending |
| 23-01-02 | 01 | 1 | EMAIL-02 | unit | `npx vitest run src/lib/email/send.test.ts -t "safeSend"` | W0 | pending |
| 23-01-02 | 01 | 1 | EMAIL-03 | unit | `npx vitest run src/lib/email/templates/__tests__/templates.test.ts` | W0 | pending |
| 23-02-01 | 02 | 2 | EMAIL-04 | unit | `npx vitest run src/lib/email/templates/__tests__/templates.test.ts -t "new templates"` | W0 | pending |
| 23-02-02 | 02 | 2 | EMAIL-05 | unit | `npx vitest run src/lib/email/send.test.ts -t "sendInviteEmail"` | W0 | pending |
| 23-02-02 | 02 | 2 | EMAIL-06 | unit | `npx vitest run src/lib/email/send.test.ts -t "sendActivityReminderEmail"` | W0 | pending |
| 23-02-02 | 02 | 2 | EMAIL-07 | unit | `npx vitest run src/lib/email/send.test.ts -t "sendWeeklyDigestEmail"` | W0 | pending |
| 23-03-01 | 03 | 3 | EMAIL-04 | unit | `npx vitest run src/app/admin/users/actions.test.ts -t "inviteUser"` | W0 | pending |
| 23-03-02 | 03 | 3 | EMAIL-08 | unit | `npx vitest run src/app/settings/notifications/actions.test.ts` | W0 | pending |
| 23-04-01 | 04 | 4 | EMAIL-05 | unit | `npx vitest run src/app/deals/actions.test.ts -t "deal assignment"` | W0 | pending |
| 23-04-02 | 04 | 4 | EMAIL-06 | unit | `npx vitest run src/lib/email-processor.test.ts -t "reminders"` | W0 | pending |
| 23-04-02 | 04 | 4 | EMAIL-07 | unit | `npx vitest run src/lib/email-processor.test.ts -t "digest"` | W0 | pending |
| 23-04-02 | 04 | 4 | EMAIL-10 | unit | `npx vitest run src/lib/email-processor.test.ts -t "duplicate"` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — framework config with path aliases matching tsconfig
- [ ] `src/lib/email/send.test.ts` — safe send wrapper + send function test stubs
- [ ] `src/lib/email/templates/__tests__/templates.test.ts` — template i18n test stubs
- [ ] `src/lib/email-processor.test.ts` — activity reminder + weekly digest test stubs
- [ ] `src/app/settings/notifications/actions.test.ts` — notification preference CRUD test stubs
- [ ] `src/app/admin/users/actions.test.ts` — invite user action test stubs
- [ ] `src/app/deals/actions.test.ts` — deal assignment email trigger test stubs

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email renders correctly in mail client | N/A | Visual check | Send test email via Mailhog, verify layout in browser |
| Resend SMTP delivery in production | N/A | Requires live SMTP credentials | Configure Resend env vars, send test email, verify in Resend dashboard |
| Notification preferences UI toggles | N/A | UI interaction | Navigate to /settings/notifications, toggle each preference, verify saves |
| Invite dialog flow | N/A | UI interaction | Click "Invite User" on admin users page, enter email, verify toast feedback |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
