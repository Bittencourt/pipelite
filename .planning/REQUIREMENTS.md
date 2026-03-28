# Requirements: Pipelite v1.2 Workflows

**Defined:** 2026-03-26
**Core Value:** API-complete CRM core that handles fundamentals well

## v1.2 Requirements

### Triggers

- [x] **TRIG-01**: User can trigger a workflow when a CRM entity is created, updated, or deleted
- [x] **TRIG-02**: User can trigger a workflow when a deal changes stage (with old/new stage data)
- [x] **TRIG-03**: User can manually run a workflow with test data or a selected record
- [x] **TRIG-04**: User can trigger a workflow on a cron/schedule (interval or cron expression)
- [x] **TRIG-05**: User can trigger a workflow via an inbound webhook URL (external HTTP call)
- [x] **TRIG-06**: User can filter triggers by field change detection ("only run if field X changed")

### Actions

- [x] **ACT-01**: User can make HTTP requests (GET/POST/PUT/PATCH/DELETE) with variable interpolation in URL, headers, and body
- [x] **ACT-02**: User can create/update CRM entities (deals, people, orgs, activities) as workflow actions
- [x] **ACT-03**: User can send emails with template variables from trigger/node data
- [x] **ACT-04**: User can send internal notifications to team members
- [x] **ACT-05**: User can write custom JavaScript transforms in a QuickJS sandbox
- [x] **ACT-06**: User can configure HTTP retry count (0-3) with backoff per HTTP node
- [x] **ACT-07**: User can send a custom HTTP response back to inbound webhook callers

### Flow Control

- [x] **FLOW-01**: User can add condition/IF nodes with field comparisons (equals, contains, greater than, is empty, etc.)
- [x] **FLOW-02**: User can add delay/wait nodes to pause execution for N minutes/hours/days

### Editor

- [x] **EDIT-01**: User can create and edit workflows in a visual linear/branching editor
- [x] **EDIT-02**: User can configure each node's settings via a side panel
- [x] **EDIT-03**: User can pick variables from trigger data and previous node outputs via autocomplete
- [x] **EDIT-04**: User can add/remove/reorder nodes in the flow

### Execution

- [x] **EXEC-01**: User can enable/disable workflows with an on/off toggle
- [x] **EXEC-02**: User can view run history with status (success/failed/running/waiting)
- [x] **EXEC-03**: User can view per-node execution details (input/output/error) for each run
- [x] **EXEC-04**: User can see clear error messages on failed nodes

### API

- [x] **API-01**: User can CRUD workflows via REST API (list, get, create, update, delete)
- [x] **API-02**: User can trigger a workflow execution via REST API
- [x] **API-03**: User can list workflow runs and view run details (including per-node results) via REST API
- [x] **API-04**: User can manage workflow templates via REST API (list, get, create, delete)

### Templates

- [x] **TMPL-01**: User can use built-in HTTP templates for common services (Planka, Apprise, Slack, Discord, Tally, Typeform)
- [x] **TMPL-02**: User can create and save custom HTTP templates for reuse
- [x] **TMPL-03**: User can start a new workflow from built-in workflow templates (4 per D-11)
- [x] **TMPL-04**: User can import/export workflows as JSON

## v2 Requirements

### Advanced Flow Control

- **FLOW-03**: User can execute parallel/concurrent branches with merge
- **FLOW-04**: User can call sub-workflows from within a workflow

### Versioning

- **VER-01**: User can view workflow version history and rollback to a previous version

## Out of Scope

| Feature | Reason |
|---------|--------|
| Free-form canvas editor (n8n/Make style) | Massive complexity; linear/branching covers 95% of CRM use cases |
| AI/LLM agent nodes | Requires LLM API key management, prompt UX, token costs; users can call AI APIs via HTTP node |
| Native third-party integration nodes | Maintaining 400+ nodes is a project in itself; generic HTTP + templates covers the need |
| Visual debugging / step-through execution | Complex to build; run history with per-node details is sufficient |
| Approval/human-in-the-loop nodes | Enterprise feature; delay + manual trigger pattern suffices |
| Marketplace for community workflows | Operational overhead; import/export JSON is sufficient |
| Real-time collaborative editing | WebSocket complexity for marginal value; last-save-wins |
| Rate limiting / quota management | Single-tenant, no billing concerns; log counts for visibility only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRIG-01 | Phase 25 | Complete |
| TRIG-02 | Phase 25 | Complete |
| TRIG-03 | Phase 25 | Complete |
| TRIG-04 | Phase 25 | Complete |
| TRIG-05 | Phase 25 | Complete |
| TRIG-06 | Phase 25 | Complete |
| ACT-01 | Phase 27 | Complete |
| ACT-02 | Phase 27 | Complete |
| ACT-03 | Phase 27 | Complete |
| ACT-04 | Phase 27 | Complete |
| ACT-05 | Phase 27 | Complete |
| ACT-06 | Phase 27 | Complete |
| ACT-07 | Phase 27 | Complete |
| FLOW-01 | Phase 26 | Complete |
| FLOW-02 | Phase 26 | Complete |
| EDIT-01 | Phase 28 | Complete |
| EDIT-02 | Phase 28 | Complete |
| EDIT-03 | Phase 28 | Complete |
| EDIT-04 | Phase 28 | Complete |
| EXEC-01 | Phase 26 | Complete |
| EXEC-02 | Phase 29 | Complete |
| EXEC-03 | Phase 29 | Complete |
| EXEC-04 | Phase 29 | Complete |
| TMPL-01 | Phase 30 | Complete |
| TMPL-02 | Phase 30 | Complete |
| TMPL-03 | Phase 30 | Complete |
| API-01 | Phase 24 | Complete |
| API-02 | Phase 25 | Complete |
| API-03 | Phase 29 | Complete |
| API-04 | Phase 30 | Complete |
| TMPL-04 | Phase 30 | Complete |

**Coverage:**
- v1.2 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after roadmap creation*
