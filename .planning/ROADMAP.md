# Roadmap: Pipelite

## Overview

Build a lightweight, self-hostable CRM with kanban-style pipeline management. Start with authentication and core entities (organizations, people), then add pipeline/deal management with visual kanban views. Implement the key differentiator—custom fields with formulas—before adding search, import/export, and the external REST API that enables third-party integrations.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Authentication** - User accounts with admin approval workflow ✅
- [x] **Phase 2: Organizations** - Company management for B2B sales tracking ✅
- [ ] **Phase 3: People** - Contact management linked to organizations
- [ ] **Phase 4: Pipelines & Stages** - Sales pipeline configuration
- [ ] **Phase 5: Deals & Kanban** - Deal management with visual pipeline board
- [ ] **Phase 6: Activities** - Follow-up tracking with calendar view
- [ ] **Phase 7: Custom Fields & Formulas** - Extensible entities with calculated fields
- [ ] **Phase 8: Search & Filtering** - Finding and filtering records
- [ ] **Phase 9: Import/Export** - Data migration capabilities
- [ ] **Phase 10: REST API** - External integration via documented API

## Phase Details

### Phase 1: Foundation & Authentication
**Goal**: Users can securely access the system with appropriate role-based permissions
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06
**Success Criteria** (what must be TRUE):
  1. User can sign up with email/password and see "pending approval" status
  2. Admin can view pending signups and approve or reject them from an admin panel
  3. Approved user can log in and stay logged in across browser sessions
  4. User can log out from any page in the application
  5. Admin and member roles show different available actions in the UI
  6. User can generate, view, and regenerate their API key for external access
**Plans**: 6 plans in 4 waves

Plans:
- [x] 01-01-PLAN.md — Project scaffolding, dependencies, and database schema ✅
- [x] 01-02-PLAN.md — Auth.js configuration and core utilities ✅
- [x] 01-03-PLAN.md — Signup flow with email verification ✅
- [x] 01-04-PLAN.md — Login, session management, and password reset ✅
- [x] 01-05-PLAN.md — Admin approval workflow ✅
- [x] 01-06-PLAN.md — API key management ✅

### Phase 2: Organizations
**Goal**: Users can manage the companies they sell to
**Depends on**: Phase 1
**Requirements**: ORG-01, ORG-02
**Success Criteria** (what must be TRUE):
  1. User can create a new organization with name and basic details
  2. User can view a paginated list of all organizations
  3. User can view full details of a single organization
  4. User can edit organization details
  5. User can delete an organization with confirmation dialog
**Plans**: 3 plans in 3 waves

Plans:
- [x] 02-01-PLAN.md — Organizations schema and server actions ✅
- [x] 02-02-PLAN.md — Organizations list page and navigation ✅
- [x] 02-03-PLAN.md — Organization detail, create/edit dialog, delete ✅

### Phase 3: People
**Goal**: Users can manage contacts and link them to organizations
**Depends on**: Phase 2
**Requirements**: PPL-01, PPL-02, PPL-03
**Success Criteria** (what must be TRUE):
  1. User can create a new person with name, email, and phone
  2. User can link a person to an existing organization
  3. User can view a paginated list of all people
  4. User can view person details including their linked organization
  5. User can edit and delete people records
**Plans**: TBD

Plans:
- [ ] 03-01: People CRUD with organization linking

### Phase 4: Pipelines & Stages
**Goal**: Admins can configure sales pipelines with stages for deal progression
**Depends on**: Phase 1
**Requirements**: PIPE-01, PIPE-03
**Success Criteria** (what must be TRUE):
  1. Admin can create a new pipeline with a name
  2. Admin can add stages to a pipeline with custom names
  3. Admin can rename and delete stages within a pipeline
  4. User can view a list of all configured pipelines
  5. User can see all stages within each pipeline
**Plans**: TBD

Plans:
- [ ] 04-01: Pipeline and stage management

### Phase 5: Deals & Kanban
**Goal**: Users can manage deals through a visual pipeline board with drag-and-drop
**Depends on**: Phase 2, Phase 3, Phase 4
**Requirements**: PIPE-02, DEAL-01, DEAL-02, DEAL-03, DEAL-04, DEAL-05
**Success Criteria** (what must be TRUE):
  1. User can create a deal with title, value, linked to organization, person, and pipeline stage
  2. User can view all deals in a kanban board organized by pipeline stages
  3. User can drag and drop deals between stages to update their status
  4. Kanban board shows deal counts and total values per stage
  5. User can click a deal card to view and edit its full details
  6. User can delete a deal with confirmation
**Plans**: TBD

Plans:
- [ ] 05-01: Deals CRUD and entity linking
- [ ] 05-02: Kanban board with drag-drop interaction

### Phase 6: Activities
**Goal**: Users can track follow-up activities with a calendar view
**Depends on**: Phase 5
**Requirements**: ACT-01, ACT-02, ACT-03, ACT-04
**Success Criteria** (what must be TRUE):
  1. User can create activities (calls, meetings, tasks, emails) with due dates
  2. User can link activities to specific deals
  3. User can view a list of all activities with filtering by type and date
  4. User can view activities in a calendar view organized by due date
  5. User can edit and delete activities
  6. Activity views show context of their linked deals
**Plans**: TBD

Plans:
- [ ] 06-01: Activities CRUD and deal linking
- [ ] 06-02: Calendar view for activities

### Phase 7: Custom Fields & Formulas
**Goal**: Users can extend any entity with custom fields including calculated values
**Depends on**: Phase 6
**Requirements**: CF-01, CF-02, CF-03, CF-04, CF-05, CF-06, ORG-03, PPL-04, DEAL-06, ACT-05
**Success Criteria** (what must be TRUE):
  1. User can add text, number, date, boolean, and single-select fields to any entity
  2. User can add multi-select dropdown fields with configurable options
  3. User can add file attachment fields and upload files
  4. User can add URL/link fields to any entity
  5. User can add lookup fields that reference other entities (e.g., link deal to another deal)
  6. User can add formula fields that calculate values from other field values
  7. Custom fields appear on entity detail pages and can be edited
  8. Formula fields recalculate when dependent fields change
**Plans**: TBD

Plans:
- [ ] 07-01: Custom field definitions and basic types
- [ ] 07-02: Advanced field types (multi-select, files, lookups)
- [ ] 07-03: Formula field engine with safe evaluation

### Phase 8: Search & Filtering
**Goal**: Users can quickly find specific records and filter lists by criteria
**Depends on**: Phase 7
**Requirements**: SRCH-01, SRCH-02
**Success Criteria** (what must be TRUE):
  1. User can search by name/title across organizations, people, and deals from a global search bar
  2. User can filter deal lists by stage, owner, and date range
  3. User can filter activity lists by type, owner, and date range
  4. Search results are paginated and show matching entity type
**Plans**: TBD

Plans:
- [ ] 08-01: Global search across entities
- [ ] 08-02: List filtering by stage, owner, and date

### Phase 9: Import/Export
**Goal**: Users can migrate data in and out of the system
**Depends on**: Phase 8
**Requirements**: IMP-01, IMP-02, IMP-03, IMP-04
**Success Criteria** (what must be TRUE):
  1. User can import organizations, people, and deals from CSV with field mapping preview
  2. User can export any entity list to CSV format
  3. User can import data from JSON format
  4. User can export data to JSON format
  5. Import preview shows validation errors before committing
**Plans**: TBD

Plans:
- [ ] 09-01: CSV import with field mapping
- [ ] 09-02: CSV and JSON export
- [ ] 09-03: JSON import

### Phase 10: REST API
**Goal**: External tools can fully interact with the CRM via a documented API
**Depends on**: Phase 9
**Requirements**: API-01, API-02, API-03
**Success Criteria** (what must be TRUE):
  1. External client can authenticate using API key and perform full CRUD on all entities
  2. OpenAPI documentation is available showing all endpoints with request/response schemas
  3. Webhooks fire to configured URLs when deals change stages
  4. Webhooks fire when activities are created
  5. API returns proper HTTP status codes and error messages for invalid requests
**Plans**: TBD

Plans:
- [ ] 10-01: REST API endpoints for all entities
- [ ] 10-02: OpenAPI documentation
- [ ] 10-03: Webhook system

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Authentication | 6/6 | Complete | 2026-02-22 |
| 2. Organizations | 3/3 | Complete | 2026-02-22 |
| 3. People | 0/TBD | Not started | - |
| 4. Pipelines & Stages | 0/TBD | Not started | - |
| 5. Deals & Kanban | 0/TBD | Not started | - |
| 6. Activities | 0/TBD | Not started | - |
| 7. Custom Fields & Formulas | 0/TBD | Not started | - |
| 8. Search & Filtering | 0/TBD | Not started | - |
| 9. Import/Export | 0/TBD | Not started | - |
| 10. REST API | 0/TBD | Not started | - |

---
*Roadmap created: 2026-02-22*
*Depth: comprehensive (10 phases)*
