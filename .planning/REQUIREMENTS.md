# Requirements: Pipelite v1.2 Workflows

**Defined:** 2026-03-26
**Core Value:** API-complete CRM core that handles fundamentals well

## v1.2 Requirements

### Triggers

- [ ] **TRIG-01**: User can trigger a workflow when a CRM entity is created, updated, or deleted
- [ ] **TRIG-02**: User can trigger a workflow when a deal changes stage (with old/new stage data)
- [ ] **TRIG-03**: User can manually run a workflow with test data or a selected record
- [ ] **TRIG-04**: User can trigger a workflow on a cron/schedule (interval or cron expression)
- [ ] **TRIG-05**: User can trigger a workflow via an inbound webhook URL (external HTTP call)
- [ ] **TRIG-06**: User can filter triggers by field change detection ("only run if field X changed")

### Actions

- [ ] **ACT-01**: User can make HTTP requests (GET/POST/PUT/PATCH/DELETE) with variable interpolation in URL, headers, and body
- [ ] **ACT-02**: User can create/update CRM entities (deals, people, orgs, activities) as workflow actions
- [ ] **ACT-03**: User can send emails with template variables from trigger/node data
- [ ] **ACT-04**: User can send internal notifications to team members
- [ ] **ACT-05**: User can write custom JavaScript transforms in a QuickJS sandbox
- [ ] **ACT-06**: User can configure HTTP retry count (0-3) with backoff per HTTP node
- [ ] **ACT-07**: User can send a custom HTTP response back to inbound webhook callers

### Flow Control

- [ ] **FLOW-01**: User can add condition/IF nodes with field comparisons (equals, contains, greater than, is empty, etc.)
- [ ] **FLOW-02**: User can add delay/wait nodes to pause execution for N minutes/hours/days

### Editor

- [ ] **EDIT-01**: User can create and edit workflows in a visual linear/branching editor
- [ ] **EDIT-02**: User can configure each node's settings via a side panel
- [ ] **EDIT-03**: User can pick variables from trigger data and previous node outputs via autocomplete
- [ ] **EDIT-04**: User can add/remove/reorder nodes in the flow

### Execution

- [ ] **EXEC-01**: User can enable/disable workflows with an on/off toggle
- [ ] **EXEC-02**: User can view run history with status (success/failed/running/waiting)
- [ ] **EXEC-03**: User can view per-node execution details (input/output/error) for each run
- [ ] **EXEC-04**: User can see clear error messages on failed nodes

### Templates

- [ ] **TMPL-01**: User can use built-in HTTP templates for common services (Planka, Apprise, Slack, Discord, Tally, Typeform)
- [ ] **TMPL-02**: User can create and save custom HTTP templates for reuse
- [ ] **TMPL-03**: User can start a new workflow from built-in workflow templates (5-10)
- [ ] **TMPL-04**: User can import/export workflows as JSON

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
| TRIG-01 | — | Pending |
| TRIG-02 | — | Pending |
| TRIG-03 | — | Pending |
| TRIG-04 | — | Pending |
| TRIG-05 | — | Pending |
| TRIG-06 | — | Pending |
| ACT-01 | — | Pending |
| ACT-02 | — | Pending |
| ACT-03 | — | Pending |
| ACT-04 | — | Pending |
| ACT-05 | — | Pending |
| ACT-06 | — | Pending |
| ACT-07 | — | Pending |
| FLOW-01 | — | Pending |
| FLOW-02 | — | Pending |
| EDIT-01 | — | Pending |
| EDIT-02 | — | Pending |
| EDIT-03 | — | Pending |
| EDIT-04 | — | Pending |
| EXEC-01 | — | Pending |
| EXEC-02 | — | Pending |
| EXEC-03 | — | Pending |
| EXEC-04 | — | Pending |
| TMPL-01 | — | Pending |
| TMPL-02 | — | Pending |
| TMPL-03 | — | Pending |
| TMPL-04 | — | Pending |

**Coverage:**
- v1.2 requirements: 27 total
- Mapped to phases: 0
- Unmapped: 27 ⚠️

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after initial definition*
