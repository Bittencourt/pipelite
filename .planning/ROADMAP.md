# Roadmap: Pipelite

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-16 (shipped 2026-03-14)
- ✅ **v1.1 Reliability & Operations** -- Phases 17-20, 23 (shipped 2026-03-26)
- [ ] **v1.2 Workflows** -- Phases 24-30 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-16) -- SHIPPED 2026-03-14</summary>

- [x] Phase 1: Foundation & Authentication (6/6 plans) -- completed 2026-02-22
- [x] Phase 2: Organizations (3/3 plans) -- completed 2026-02-22
- [x] Phase 3: People (3/3 plans) -- completed 2026-02-22
- [x] Phase 4: Pipelines & Stages (4/4 plans) -- completed 2026-02-23
- [x] Phase 5: Deals & Kanban (3/3 plans) -- completed 2026-02-24
- [x] Phase 6: Activities (4/4 plans) -- completed 2026-02-25
- [x] Phase 7: Custom Fields & Formulas (11/11 plans) -- completed 2026-02-28
- [x] Phase 8: Search & Filtering (3/3 plans) -- completed 2026-02-28
- [x] Phase 9: Import/Export (3/3 plans) -- completed 2026-02-28
- [x] Phase 10: REST API (4/4 plans) -- completed 2026-03-01
- [x] Phase 11: Keyboard Control (5/5 plans) -- completed 2026-03-02
- [x] Phase 12: Localization (5/5 plans) -- completed 2026-03-05
- [x] Phase 13: Comprehensive Documentation (4/4 plans) -- completed 2026-03-06
- [x] Phase 14: Dashboard Metrics (3/3 plans) -- completed 2026-03-07
- [x] Phase 15: Multi-user Collaboration (6/6 plans) -- completed 2026-03-07
- [x] Phase 16: Pipedrive API Importer (6/6 plans) -- completed 2026-03-08

Full archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>v1.1 Reliability & Operations (Phases 17-20, 23) -- SHIPPED 2026-03-26</summary>

- [x] Phase 17: TypeScript Cleanup (1/1 plan) -- completed 2026-03-14
- [x] Phase 18: DB Infrastructure (1/1 plan) -- completed 2026-03-14
- [x] Phase 19: Webhook Reliability (3/3 plans) -- completed 2026-03-22
- [x] Phase 20: Import State Reliability (2/2 plans) -- completed 2026-03-23
- [x] Phase 23: Resend Email Integration (5/5 plans) -- completed 2026-03-24

Full archive: `.planning/milestones/v1.1-ROADMAP.md`

</details>

### v1.2 Workflows (In Progress)

**Milestone Goal:** Add a server-side workflow automation engine with a visual linear/branching editor, deeply integrated with CRM events and external services.

- [x] **Phase 24: Schema & Event Infrastructure** - Database tables, in-process event bus, shared mutation functions, CRM event emission (completed 2026-03-27)
- [x] **Phase 25: Trigger System** - CRM event triggers, cron schedules, manual runs, inbound webhooks, field change filtering (completed 2026-03-28)
- [x] **Phase 26: Execution Engine & Flow Control** - Async graph walker, condition/IF nodes, delay nodes, workflow enable/disable (completed 2026-03-28)
- [x] **Phase 27: Action Nodes** - HTTP requests, CRM mutations, email sending, notifications, JS sandbox, webhook responses (completed 2026-03-28)
- [x] **Phase 28: Visual Editor** - Linear/branching node editor, node configuration panel, variable picker, node management (completed 2026-03-28)
- [x] **Phase 29: Run History & Observability** - Run list with status, per-node execution details, error display (completed 2026-03-28)
- [ ] **Phase 30: Templates & Portability** - Built-in HTTP templates, custom templates, workflow starter templates, JSON import/export

## Phase Details

### Phase 24: Schema & Event Infrastructure
**Goal**: All database tables and event plumbing exist so trigger, engine, and action code can be built on a stable foundation
**Depends on**: Nothing (first phase of v1.2)
**Requirements**: API-01
**Success Criteria** (what must be TRUE):
  1. Workflow, workflow_run, workflow_run_step, and workflow_template tables exist with correct schema and indexes
  2. An in-process event bus can emit and receive CRM events (create/update/delete on deals, people, orgs, activities)
  3. Existing server actions (createDeal, updateDeal, deleteDeal, etc.) emit events through the bus without breaking current behavior
  4. Shared mutation functions are extracted from server actions so they can be called from both server actions and the workflow engine (without HTTP request context)
  5. REST API endpoints for workflow CRUD (list, get, create, update, delete) are functional
**Plans**: 4 plans
Plans:
- [ ] 24-01-PLAN.md -- Workflow schema, event bus, and webhook subscriber
- [ ] 24-02-PLAN.md -- Deal and people mutation extraction with event emission
- [ ] 24-03-PLAN.md -- Workflow CRUD mutations, REST API, and server actions
- [ ] 24-04-PLAN.md -- Organization and activity mutations, remaining API route refactors

### Phase 25: Trigger System
**Goal**: Users can define what causes a workflow to run -- CRM events, schedules, manual clicks, or external HTTP calls
**Depends on**: Phase 24
**Requirements**: TRIG-01, TRIG-02, TRIG-03, TRIG-04, TRIG-05, TRIG-06, API-02
**Success Criteria** (what must be TRUE):
  1. User can configure a workflow to fire when a CRM entity is created, updated, or deleted, and a deal stage change provides both old and new stage data
  2. User can set a cron expression or interval on a workflow and it fires on schedule via the setTimeout-chaining processor
  3. User can manually run a workflow with test data or by selecting a specific CRM record
  4. User can generate a unique inbound webhook URL for a workflow that accepts external HTTP POST requests and triggers a run
  5. User can add field-change filters to a trigger so the workflow only runs when a specific field actually changed
  6. User can trigger a workflow execution via REST API
**Plans**: 4 plans
Plans:
- [ ] 25-01-PLAN.md -- Schema migration (trigger->triggers array), trigger types/Zod schemas, createWorkflowRun utility
- [ ] 25-02-PLAN.md -- CRM event trigger subscriber and matcher (entity CRUD, stage change, field-change filters)
- [ ] 25-03-PLAN.md -- Schedule processor with cron-parser, atomic DB claims, overlap prevention
- [ ] 25-04-PLAN.md -- Inbound webhook endpoint, manual trigger, REST API trigger endpoint

### Phase 26: Execution Engine & Flow Control
**Goal**: The workflow engine can walk a node graph, evaluate conditions, pause for delays, and be toggled on/off by the user
**Depends on**: Phase 25
**Requirements**: EXEC-01, FLOW-01, FLOW-02
**Success Criteria** (what must be TRUE):
  1. User can toggle a workflow on/off and disabled workflows do not fire even when their trigger conditions are met
  2. User can add condition/IF nodes that branch execution based on field comparisons (equals, contains, greater than, is empty, etc.)
  3. User can add delay/wait nodes that pause execution for a configured duration (minutes/hours/days) and resume automatically
  4. The engine enforces loop prevention (recursion depth limit) and concurrency caps from day one
**Plans**: 3 plans
Plans:
- [ ] 26-01-PLAN.md -- Execution types, schema migration, condition evaluator, delay resolver (TDD)
- [ ] 26-02-PLAN.md -- Execution engine core and processor with instrumentation bootstrap
- [ ] 26-03-PLAN.md -- Workflow toggle action and recursion depth tracking

### Phase 27: Action Nodes
**Goal**: Workflows can perform useful work -- make HTTP calls, mutate CRM data, send emails, notify team members, run custom code, and respond to webhook callers
**Depends on**: Phase 26
**Requirements**: ACT-01, ACT-02, ACT-03, ACT-04, ACT-05, ACT-06, ACT-07
**Success Criteria** (what must be TRUE):
  1. User can configure an HTTP node to make GET/POST/PUT/PATCH/DELETE requests with variable interpolation in URL, headers, and body, with configurable retry count (0-3) and backoff
  2. User can add CRM action nodes that create or update deals, people, organizations, and activities using data from previous nodes
  3. User can add email and notification nodes that send messages with template variables from trigger/node data
  4. User can add a JavaScript transform node that executes user-provided code in a QuickJS sandbox
  5. User can configure a webhook response node that sends a custom HTTP response back to the caller of an inbound webhook trigger
**Plans**: 3 plans
Plans:
- [ ] 27-01-PLAN.md -- Interpolation engine, action registry, config schemas, SSRF prevention, HTTP handler
- [ ] 27-02-PLAN.md -- CRM action, email, and notification handlers
- [ ] 27-03-PLAN.md -- JavaScript transform sandbox and webhook response coordination

### Phase 28: Visual Editor
**Goal**: Users can visually create, edit, and manage workflow node graphs in a linear/branching canvas with full node configuration
**Depends on**: Phase 24 (needs TypeScript types; can be built in parallel with phases 25-27)
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04
**Success Criteria** (what must be TRUE):
  1. User can create a new workflow and see a visual canvas with connected nodes in a linear or branching layout
  2. User can click a node to open a side panel where they configure that node's settings (trigger type, HTTP URL, condition fields, etc.)
  3. User can pick variables from trigger data and previous node outputs via an autocomplete dropdown when editing node fields
  4. User can add new nodes, remove existing nodes, and reorder nodes in the flow via the visual editor
**Plans**: 5 plans
Plans:
- [x] 28-01-PLAN.md -- Core lib layer: graph converter, layout engine, editor store, graph mutations, variable schema (TDD)
- [x] 28-02-PLAN.md -- Canvas with custom nodes, add-button edges, toolbar, editor page, workflow list
- [x] 28-03-PLAN.md -- Side panel with type picker and all node configuration forms
- [x] 28-04-PLAN.md -- Variable picker autocomplete and integration into config forms
- [x] 28-05-PLAN.md -- Gap closure: wire AddButtonEdge into canvas edgeTypes

### Phase 29: Run History & Observability
**Goal**: Users can see what happened when workflows ran -- success/failure status, per-node details, and clear error messages
**Depends on**: Phase 26
**Requirements**: EXEC-02, EXEC-03, EXEC-04, API-03
**Success Criteria** (what must be TRUE):
  1. User can view a list of workflow runs with status indicators (success, failed, running, waiting) and timestamps
  2. User can drill into a run and see per-node execution details including input data, output data, and duration
  3. Failed nodes display clear, actionable error messages that help the user diagnose what went wrong
  4. User can list workflow runs and view run details (including per-node results) via REST API
**Plans**: 3 plans
Plans:
- [ ] 29-01-PLAN.md -- Serializers, formatDuration, RunStatusBadge, and REST API routes for runs
- [ ] 29-02-PLAN.md -- Runs list page with filtering and workflow overview page with stats card
- [ ] 29-03-PLAN.md -- Run detail page with expandable step list and error display

### Phase 30: Templates & Portability
**Goal**: Users can bootstrap workflows quickly from templates and share them via JSON export/import
**Depends on**: Phase 28
**Requirements**: TMPL-01, TMPL-02, TMPL-03, TMPL-04, API-04
**Success Criteria** (what must be TRUE):
  1. User can pick from built-in HTTP templates for common services (Planka, Apprise, Slack, Discord, Tally, Typeform) when configuring an HTTP node
  2. User can save a configured HTTP node as a custom template and reuse it in other workflows
  3. User can start a new workflow from 5-10 built-in workflow templates covering common CRM automation patterns
  4. User can export a workflow as JSON and import a workflow from JSON to transfer between instances
  5. User can manage workflow templates via REST API (list, get, create, delete)
**Plans**: 3 plans
Plans:
- [ ] 30-01-PLAN.md -- Static template data, DB schema, export/import library, mutations
- [ ] 30-02-PLAN.md -- HTTP template selector, save-as-template, create workflow dialog
- [ ] 30-03-PLAN.md -- Export/import toolbar buttons, workflow templates REST API

## Progress

**Execution Order:**
Phases execute in numeric order: 24 -> 25 -> 26 -> 27 -> 28 -> 29 -> 30
Note: Phase 28 (Visual Editor) depends only on Phase 24 and can be built in parallel with 25-27 if desired.

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Foundation & Authentication | v1.0 | 6/6 | Complete | 2026-02-22 |
| 2. Organizations | v1.0 | 3/3 | Complete | 2026-02-22 |
| 3. People | v1.0 | 3/3 | Complete | 2026-02-22 |
| 4. Pipelines & Stages | v1.0 | 4/4 | Complete | 2026-02-23 |
| 5. Deals & Kanban | v1.0 | 3/3 | Complete | 2026-02-24 |
| 6. Activities | v1.0 | 4/4 | Complete | 2026-02-25 |
| 7. Custom Fields & Formulas | v1.0 | 11/11 | Complete | 2026-02-28 |
| 8. Search & Filtering | v1.0 | 3/3 | Complete | 2026-02-28 |
| 9. Import/Export | v1.0 | 3/3 | Complete | 2026-02-28 |
| 10. REST API | v1.0 | 4/4 | Complete | 2026-03-01 |
| 11. Keyboard Control | v1.0 | 5/5 | Complete | 2026-03-02 |
| 12. Localization | v1.0 | 5/5 | Complete | 2026-03-05 |
| 13. Documentation | v1.0 | 4/4 | Complete | 2026-03-06 |
| 14. Dashboard Metrics | v1.0 | 3/3 | Complete | 2026-03-07 |
| 15. Multi-user Collaboration | v1.0 | 6/6 | Complete | 2026-03-07 |
| 16. Pipedrive API Importer | v1.0 | 6/6 | Complete | 2026-03-08 |
| 17. TypeScript Cleanup | v1.1 | 1/1 | Complete | 2026-03-14 |
| 18. DB Infrastructure | v1.1 | 1/1 | Complete | 2026-03-14 |
| 19. Webhook Reliability | v1.1 | 3/3 | Complete | 2026-03-22 |
| 20. Import State Reliability | v1.1 | 2/2 | Complete | 2026-03-23 |
| 23. Resend Email Integration | v1.1 | 5/5 | Complete | 2026-03-24 |
| 24. Schema & Event Infrastructure | v1.2 | 4/4 | Complete | 2026-03-27 |
| 25. Trigger System | v1.2 | 4/4 | Complete | 2026-03-28 |
| 26. Execution Engine & Flow Control | v1.2 | 3/3 | Complete | 2026-03-28 |
| 27. Action Nodes | 3/3 | Complete    | 2026-03-28 | - |
| 28. Visual Editor | v1.2 | 5/5 | Complete | 2026-03-28 |
| 29. Run History & Observability | v1.2 | 0/3 | Complete    | 2026-03-28 |
| 30. Templates & Portability | v1.2 | 0/3 | Planning | - |

---
*Roadmap updated: 2026-03-28 -- Phase 30 planned (3 plans in 2 waves)*
