# Requirements: Pipelite

**Defined:** 2026-03-14
**Core Value:** API-complete CRM core that handles fundamentals well — pipelines, orgs, people, deals, activities, and custom fields. Advanced features can be built externally via the API.

## v1.1 Requirements

Requirements for Reliability & Operations milestone. Each maps to roadmap phases.

### TypeScript Hygiene

- [ ] **TSFIX-01**: Admin can build the project without suppressed TypeScript errors (`ignoreBuildErrors` removed from `next.config.ts`, `tsc --noEmit` passes clean)

### Webhooks

- [x] **WHOOK-01**: Webhook delivery retries survive container restarts (durable DB-backed delivery via `webhook_deliveries` table — replaces in-process `setTimeout` retries)
- [ ] **WHOOK-02**: Admin can view delivery history (success/failure log with HTTP status and timestamp) per webhook endpoint in the admin UI
- [ ] **WHOOK-03**: Admin can see dead-letter entries (exhausted retries) and manually replay a failed delivery from the admin UI

### Import State

- [ ] **IMPORT-01**: Pipedrive import progress survives container restarts (DB-backed `import_sessions` table replaces in-memory Map)
- [ ] **IMPORT-02**: User can cancel an in-progress import and have that cancellation persist across restarts

### Formula Reactivity

- [ ] **FORMULA-01**: Formula field values are recalculated server-side when any entity field is saved (values stored in JSONB; appear in API responses, exports, and webhook payloads)
- [ ] **FORMULA-02**: Formula recalculation only runs for formulas whose referenced source fields actually changed (dependency-aware, prevents fan-out during bulk saves)

### Bulk Operations

- [ ] **BULK-01**: User can select multiple records via checkbox column on Organizations, People, Deals, and Activities list pages (header select-all, individual row checkboxes)
- [ ] **BULK-02**: User can bulk delete selected records (count-aware confirmation modal; per-record permission check; partial failure surfaced)
- [ ] **BULK-03**: User can bulk reassign owner for selected records (member picker; partial failure surfaced per record)
- [ ] **BULK-04**: User can export only the currently selected records to CSV (scoped export, not full table)

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
| TSFIX-01 | Phase 17 | Pending |
| WHOOK-01 | Phase 19 | Complete |
| WHOOK-02 | Phase 19 | Pending |
| WHOOK-03 | Phase 19 | Pending |
| IMPORT-01 | Phase 20 | Pending |
| IMPORT-02 | Phase 20 | Pending |
| FORMULA-01 | Phase 21 | Pending |
| FORMULA-02 | Phase 21 | Pending |
| BULK-01 | Phase 22 | Pending |
| BULK-02 | Phase 22 | Pending |
| BULK-03 | Phase 22 | Pending |
| BULK-04 | Phase 22 | Pending |

**Coverage:**
- v1.1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

Note: Phase 18 (DB Infrastructure) is a prerequisite phase that contains no requirements of its own. It delivers the `webhook_deliveries` and `import_sessions` tables that WHOOK-01 and IMPORT-01 build upon.

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14 — traceability updated for v1.1 roadmap (Phases 17-22)*
