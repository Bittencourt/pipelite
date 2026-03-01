# Requirements: Pipelite

**Defined:** 2026-02-22
**Core Value:** API-complete CRM core that handles fundamentals well — pipelines, orgs, people, deals, activities, and custom fields. Advanced features can be built externally via the API.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication & Users

- [x] **AUTH-01**: User can sign up with email/password (pending admin approval) ✓
- [x] **AUTH-02**: Admin can approve or reject pending user signups ✓
- [x] **AUTH-03**: User can log in (only after approval) and stay logged in across sessions ✓
- [x] **AUTH-04**: User can log out ✓
- [x] **AUTH-05**: Admin and member roles with different permissions ✓
- [x] **AUTH-06**: User can generate API key for external API access ✓

### Organizations

- [x] **ORG-01**: User can create, edit, and delete organizations ✓
- [x] **ORG-02**: User can view organization list and single organization detail ✓
- [ ] **ORG-03**: User can add custom fields to organizations

### People

- [x] **PPL-01**: User can create, edit, and delete people ✓
- [x] **PPL-02**: User can link people to organizations ✓
- [x] **PPL-03**: User can view people list and single person detail ✓
- [ ] **PPL-04**: User can add custom fields to people

### Pipelines

- [x] **PIPE-01**: Admin can create pipelines with stages ✓
- [x] **PIPE-02**: User can view kanban board showing deals by stage ✓
- [x] **PIPE-03**: User can edit stage names ✓

### Deals

- [x] **DEAL-01**: User can create, edit, and delete deals ✓
- [x] **DEAL-02**: User can link deals to organizations and people ✓
- [x] **DEAL-03**: User can assign deals to pipeline stages ✓
- [x] **DEAL-04**: User can drag-drop deals between stages on kanban board ✓
- [x] **DEAL-05**: User can see deal counts and value totals per stage ✓
- [ ] **DEAL-06**: User can add custom fields to deals

### Activities

- [x] **ACT-01**: User can create, edit, and delete activities (calls, meetings, tasks, emails) ✓
- [x] **ACT-02**: User can link activities to deals ✓
- [x] **ACT-03**: User can view activity list ✓
- [x] **ACT-04**: User can view activities in calendar view ✓
- [ ] **ACT-05**: User can add custom fields to activities

### Custom Fields

- [ ] **CF-01**: User can create custom fields with basic types (text, number, date, boolean, single-select)
- [ ] **CF-02**: User can create multi-select dropdown fields
- [ ] **CF-03**: User can create file attachment fields
- [ ] **CF-04**: User can create link/URL fields
- [ ] **CF-05**: User can create lookup fields (reference to another entity)
- [ ] **CF-06**: User can create formula fields that calculate from other field values

### Search & Filtering

- [x] **SRCH-01**: User can search by name/title across entities ✓
- [x] **SRCH-02**: User can filter lists by stage, owner, and date range ✓

### Import/Export

- [ ] **IMP-01**: User can import data from CSV
- [ ] **IMP-02**: User can export data to CSV
- [ ] **IMP-03**: User can import data from JSON
- [ ] **IMP-04**: User can export data to JSON

### REST API

- [x] **API-01**: Full CRUD REST endpoints for all entities
- [ ] **API-02**: OpenAPI documentation available
- [x] **API-03**: Webhooks fire on events (deal stage change, activity creation)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Notifications

- **NOTF-01**: User receives email reminders for due activities
- **NOTF-02**: User receives in-app notifications

### Advanced Views

- **VIEW-01**: User can save filter combinations for reuse
- **VIEW-02**: User can share views with team members
- **VIEW-03**: User can combine multiple filter conditions

### Activity Enhancements

- **ACT-06**: User can create recurring activities (weekly, monthly)
- **ACT-07**: User can view activity timeline on person/deal/org

### Organization Enhancements

- **ORG-04**: User can create organization hierarchy (parent/child companies)

### Pipeline Enhancements

- **PIPE-04**: Stage win probability percentages
- **PIPE-05**: Pipeline templates for quick setup

### Deal Enhancements

- **DEAL-07**: User can add products/line items to deals

### API Enhancements

- **API-04**: Request rate limiting
- **API-05**: Bulk operations API

### Integration

- **INT-01**: OAuth login (Google, GitHub)
- **INT-02**: Two-factor authentication

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-tenancy | Single-tenant only; deploy multiple instances if needed |
| AI features | Adds complexity, not core to lightweight CRM value |
| Marketing automation | Different domain expertise; use external tools via API |
| Full ERP (invoicing, inventory) | CRM focus; integrate with ERP systems via API |
| Social media integration | API changes frequently, OAuth complexity |
| Real-time collaboration | WebSockets complexity, conflict resolution |
| Customer portal | Different UX needs, security surface |
| Native mobile apps | Mobile-responsive web app instead |
| Built-in telephony | VoIP integration complexity, regional differences |
| Email sync/integration | Complex, requires background jobs; external tools via API |
| Reporting/analytics dashboards | External tools can build via API |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete ✓ |
| AUTH-02 | Phase 1 | Complete ✓ |
| AUTH-03 | Phase 1 | Complete ✓ |
| AUTH-04 | Phase 1 | Complete ✓ |
| AUTH-05 | Phase 1 | Complete ✓ |
| AUTH-06 | Phase 1 | Complete ✓ |
| ORG-01 | Phase 2 | Complete ✓ |
| ORG-02 | Phase 2 | Complete ✓ |
| ORG-03 | Phase 7 | Pending |
| PPL-01 | Phase 3 | Complete ✓ |
| PPL-02 | Phase 3 | Complete ✓ |
| PPL-03 | Phase 3 | Complete ✓ |
| PPL-04 | Phase 7 | Pending |
| PIPE-01 | Phase 4 | Complete ✓ |
| PIPE-02 | Phase 5 | Complete ✓ |
| PIPE-03 | Phase 4 | Complete ✓ |
| DEAL-01 | Phase 5 | Complete ✓ |
| DEAL-02 | Phase 5 | Complete ✓ |
| DEAL-03 | Phase 5 | Complete ✓ |
| DEAL-04 | Phase 5 | Complete ✓ |
| DEAL-05 | Phase 5 | Complete ✓ |
| DEAL-06 | Phase 7 | Pending |
| ACT-01 | Phase 6 | Complete ✓ |
| ACT-02 | Phase 6 | Complete ✓ |
| ACT-03 | Phase 6 | Complete ✓ |
| ACT-04 | Phase 6 | Complete ✓ |
| ACT-05 | Phase 7 | Pending |
| CF-01 | Phase 7 | Pending |
| CF-02 | Phase 7 | Pending |
| CF-03 | Phase 7 | Pending |
| CF-04 | Phase 7 | Pending |
| CF-05 | Phase 7 | Pending |
| CF-06 | Phase 7 | Pending |
| SRCH-01 | Phase 8 | Complete ✓ |
| SRCH-02 | Phase 8 | Complete ✓ |
| IMP-01 | Phase 9 | Pending |
| IMP-02 | Phase 9 | Pending |
| IMP-03 | Phase 9 | Pending |
| IMP-04 | Phase 9 | Pending |
| API-01 | Phase 10 | Complete |
| API-02 | Phase 10 | Pending |
| API-03 | Phase 10 | Complete |

**Coverage:**
- v1 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-28 after Phase 8 completion*
