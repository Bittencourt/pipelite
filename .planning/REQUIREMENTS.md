# Requirements: Pipelite

**Defined:** 2026-02-22
**Core Value:** API-complete CRM core that handles fundamentals well — pipelines, orgs, people, deals, activities, and custom fields. Advanced features can be built externally via the API.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication & Users

- [ ] **AUTH-01**: User can sign up with email/password (pending admin approval)
- [ ] **AUTH-02**: Admin can approve or reject pending user signups
- [ ] **AUTH-03**: User can log in (only after approval) and stay logged in across sessions
- [ ] **AUTH-04**: User can log out
- [ ] **AUTH-05**: Admin and member roles with different permissions
- [ ] **AUTH-06**: User can generate API key for external API access

### Organizations

- [ ] **ORG-01**: User can create, edit, and delete organizations
- [ ] **ORG-02**: User can view organization list and single organization detail
- [ ] **ORG-03**: User can add custom fields to organizations

### People

- [ ] **PPL-01**: User can create, edit, and delete people
- [ ] **PPL-02**: User can link people to organizations
- [ ] **PPL-03**: User can view people list and single person detail
- [ ] **PPL-04**: User can add custom fields to people

### Pipelines

- [ ] **PIPE-01**: Admin can create pipelines with stages
- [ ] **PIPE-02**: User can view kanban board showing deals by stage
- [ ] **PIPE-03**: User can edit stage names

### Deals

- [ ] **DEAL-01**: User can create, edit, and delete deals
- [ ] **DEAL-02**: User can link deals to organizations and people
- [ ] **DEAL-03**: User can assign deals to pipeline stages
- [ ] **DEAL-04**: User can drag-drop deals between stages on kanban board
- [ ] **DEAL-05**: User can see deal counts and value totals per stage
- [ ] **DEAL-06**: User can add custom fields to deals

### Activities

- [ ] **ACT-01**: User can create, edit, and delete activities (calls, meetings, tasks, emails)
- [ ] **ACT-02**: User can link activities to deals
- [ ] **ACT-03**: User can view activity list
- [ ] **ACT-04**: User can view activities in calendar view
- [ ] **ACT-05**: User can add custom fields to activities

### Custom Fields

- [ ] **CF-01**: User can create custom fields with basic types (text, number, date, boolean, single-select)
- [ ] **CF-02**: User can create multi-select dropdown fields
- [ ] **CF-03**: User can create file attachment fields
- [ ] **CF-04**: User can create link/URL fields
- [ ] **CF-05**: User can create lookup fields (reference to another entity)
- [ ] **CF-06**: User can create formula fields that calculate from other field values

### Search & Filtering

- [ ] **SRCH-01**: User can search by name/title across entities
- [ ] **SRCH-02**: User can filter lists by stage, owner, and date range

### Import/Export

- [ ] **IMP-01**: User can import data from CSV
- [ ] **IMP-02**: User can export data to CSV
- [ ] **IMP-03**: User can import data from JSON
- [ ] **IMP-04**: User can export data to JSON

### REST API

- [ ] **API-01**: Full CRUD REST endpoints for all entities
- [ ] **API-02**: OpenAPI documentation available
- [ ] **API-03**: Webhooks fire on events (deal stage change, activity creation)

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
| AUTH-01 | — | Pending |
| AUTH-02 | — | Pending |
| AUTH-03 | — | Pending |
| AUTH-04 | — | Pending |
| AUTH-05 | — | Pending |
| AUTH-06 | — | Pending |
| ORG-01 | — | Pending |
| ORG-02 | — | Pending |
| ORG-03 | — | Pending |
| PPL-01 | — | Pending |
| PPL-02 | — | Pending |
| PPL-03 | — | Pending |
| PPL-04 | — | Pending |
| PIPE-01 | — | Pending |
| PIPE-02 | — | Pending |
| PIPE-03 | — | Pending |
| DEAL-01 | — | Pending |
| DEAL-02 | — | Pending |
| DEAL-03 | — | Pending |
| DEAL-04 | — | Pending |
| DEAL-05 | — | Pending |
| DEAL-06 | — | Pending |
| ACT-01 | — | Pending |
| ACT-02 | — | Pending |
| ACT-03 | — | Pending |
| ACT-04 | — | Pending |
| ACT-05 | — | Pending |
| CF-01 | — | Pending |
| CF-02 | — | Pending |
| CF-03 | — | Pending |
| CF-04 | — | Pending |
| CF-05 | — | Pending |
| CF-06 | — | Pending |
| SRCH-01 | — | Pending |
| SRCH-02 | — | Pending |
| IMP-01 | — | Pending |
| IMP-02 | — | Pending |
| IMP-03 | — | Pending |
| IMP-04 | — | Pending |
| API-01 | — | Pending |
| API-02 | — | Pending |
| API-03 | — | Pending |

**Coverage:**
- v1 requirements: 41 total
- Mapped to phases: 0
- Unmapped: 41 ⚠️

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 after initial definition*
