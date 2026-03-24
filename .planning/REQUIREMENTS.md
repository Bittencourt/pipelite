# Requirements: Pipelite

**Defined:** 2026-03-14
**Core Value:** API-complete CRM core that handles fundamentals well — pipelines, orgs, people, deals, activities, and custom fields. Advanced features can be built externally via the API.

## v1.1 Requirements

Requirements for Reliability & Operations milestone. Each maps to roadmap phases.

### TypeScript Hygiene

- [x] **TSFIX-01**: Admin can build the project without suppressed TypeScript errors (`ignoreBuildErrors` removed from `next.config.ts`, `tsc --noEmit` passes clean)

### Webhooks

- [x] **WHOOK-01**: Webhook delivery retries survive container restarts (durable DB-backed delivery via `webhook_deliveries` table — replaces in-process `setTimeout` retries)
- [x] **WHOOK-02**: Admin can view delivery history (success/failure log with HTTP status and timestamp) per webhook endpoint in the admin UI
- [x] **WHOOK-03**: Admin can see dead-letter entries (exhausted retries) and manually replay a failed delivery from the admin UI

### Import State

- [x] **IMPORT-01**: Pipedrive import progress survives container restarts (DB-backed `import_sessions` table replaces in-memory Map)
- [x] **IMPORT-02**: User can cancel an in-progress import and have that cancellation persist across restarts

### Formula Reactivity

- [ ] **FORMULA-01**: Formula field values are recalculated server-side when any entity field is saved (values stored in JSONB; appear in API responses, exports, and webhook payloads)
- [ ] **FORMULA-02**: Formula recalculation only runs for formulas whose referenced source fields actually changed (dependency-aware, prevents fan-out during bulk saves)

### Bulk Operations

- [ ] **BULK-01**: User can select multiple records via checkbox column on Organizations, People, Deals, and Activities list pages (header select-all, individual row checkboxes)
- [ ] **BULK-02**: User can bulk delete selected records (count-aware confirmation modal; per-record permission check; partial failure surfaced)
- [ ] **BULK-03**: User can bulk reassign owner for selected records (member picker; partial failure surfaced per record)
- [ ] **BULK-04**: User can export only the currently selected records to CSV (scoped export, not full table)

### Email & Notifications (Phase 23)

- [x] **EMAIL-01**: When SMTP_HOST is not configured, all email send functions log a warning and return without error (silent fail -- registration and other flows still complete)
- [x] **EMAIL-02**: All email templates render content in the recipient's profile language (en-US, pt-BR, es-ES) with app default locale as fallback
- [x] **EMAIL-03**: DB tables exist for notification preferences (per-user toggles) and user invites (token, email, invitedBy, expiresAt)
- [x] **EMAIL-04**: Admin can invite a user by email; invited user receives email with registration link; invited user who registers via invite link is auto-approved (skips pending_approval)
- [x] **EMAIL-05**: When a deal is assigned to a new user, that user receives a deal-assigned email (respecting notification preferences)
- [x] **EMAIL-06**: Activities due within 1 hour receive a single reminder email (cron checks every 5 minutes, reminderSentAt column prevents duplicates)
- [x] **EMAIL-07**: Monday morning, opted-in users receive a weekly digest email with deals summary (new, stage moves, won, lost) and activities due (overdue + upcoming week)
- [x] **EMAIL-08**: Users can toggle deal-assigned, activity-reminder, and weekly-digest notifications independently at /settings/notifications
- [x] **EMAIL-09**: Notification preferences default to all-enabled; users who never visit settings receive all notification types
- [x] **EMAIL-10**: Email cron processor starts automatically on server boot via instrumentation.ts using setTimeout chaining pattern

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Webhooks

- **WHOOK-04**: Admin can configure auto-disable of a webhook endpoint after N consecutive delivery failures
- **WHOOK-05**: Admin can view webhook delivery analytics (volume, success rate, latency over time)

### Bulk Operations

- **BULK-05**: User can bulk edit a single field value across selected records (HIGH complexity — requires formula recalculation coordination)

### Import

- **IMPORT-03**: Admin can view import history and audit trail (what was imported, when, by whom)

### Formula

- **FORMULA-03**: Formula fields show live preview while editing a record (client-side QuickJS evaluation remains optional, server-cached value displayed by default)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Email sync/integration | External tools via API |
| Workflow automation | External tools via API |
| Multi-tenancy | Single company per deployment — architectural constraint |
| Native integrations (Slack, Zapier, etc.) | API allows external integration |
| Mobile app | Web-first, responsive design sufficient |
| Redis as hard dependency | Must remain optional — all v1.1 features use PostgreSQL |
| Webhook retry backed by Redis/BullMQ | pg-boss covers the need without making Redis mandatory |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TSFIX-01 | Phase 17 | Complete |
| WHOOK-01 | Phase 19 | Complete |
| WHOOK-02 | Phase 19 | Complete |
| WHOOK-03 | Phase 19 | Complete |
| IMPORT-01 | Phase 20 | Complete |
| IMPORT-02 | Phase 20 | Complete |
| FORMULA-01 | Phase 21 | Pending |
| FORMULA-02 | Phase 21 | Pending |
| BULK-01 | Phase 22 | Pending |
| BULK-02 | Phase 22 | Pending |
| BULK-03 | Phase 22 | Pending |
| BULK-04 | Phase 22 | Pending |
| EMAIL-01 | Phase 23 | Complete |
| EMAIL-02 | Phase 23 | Complete |
| EMAIL-03 | Phase 23 | Complete |
| EMAIL-04 | Phase 23 | Complete |
| EMAIL-05 | Phase 23 | Complete |
| EMAIL-06 | Phase 23 | Complete |
| EMAIL-07 | Phase 23 | Complete |
| EMAIL-08 | Phase 23 | Complete |
| EMAIL-09 | Phase 23 | Complete |
| EMAIL-10 | Phase 23 | Complete |

**Coverage:**
- v1.1 requirements: 12 total
- Phase 23 requirements: 10 total
- Mapped to phases: 22
- Unmapped: 0

Note: Phase 18 (DB Infrastructure) is a prerequisite phase that contains no requirements of its own. It delivers the `webhook_deliveries` and `import_sessions` tables that WHOOK-01 and IMPORT-01 build upon.

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-23 — added EMAIL-01 through EMAIL-10 for Phase 23*
