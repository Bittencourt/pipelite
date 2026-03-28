---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Workflows
status: executing
last_updated: "2026-03-28T01:58:20.762Z"
last_activity: 2026-03-28 -- 26-03 complete (toggle workflow, recursion depth guard)
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 11
  completed_plans: 11
  percent: 37
---

# Session State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-26)

**Core value:** API-complete CRM core that handles fundamentals well
**Current focus:** Phase 25 - Workflow Trigger Engine (next phase)

## Position

Phase: 26 of 30 (Execution Engine)
Plan: 2 of 3 complete
Status: In progress
Last activity: 2026-03-28 -- 26-03 complete (toggle workflow, recursion depth guard)

Progress: [███░░░░░░░] 37% (10/27 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 85 (across v1.0 + v1.1)
- v1.2 plans completed: 6

## Decisions

- Used globalThis singleton pattern for CrmEventBus (hot-reload safety)
- Added removeAllListeners to bus for test isolation
- Split TDD task into two commits (event bus + tests, then schema + migration)
- Used z.input<> instead of z.infer<> for createWorkflow param type so Zod defaults work transparently
- Workflows not owner-scoped; all authenticated users can CRUD any workflow
- Introduced mutation layer pattern (src/lib/mutations/) for reusable DB operations
- updateDealMutation returns newAssigneeUserIds/dealTitle for email handling in server action
- API routes emit CRM events directly via crmBus (different auth patterns than server actions)
- Ownership checks remain in server actions/API routes; mutations only check entity existence
- Activity API route PUT emits events directly via crmBus (different field mapping than mutations)
- Pipeline/stage/custom-field-def triggerWebhook calls removed (config entities, not CRM data)
- Org batch route uses individual mutation calls for per-entity event emission
- Manual migration SQL for trigger->triggers array to safely wrap existing data
- Partial index on next_run_at WHERE active=true for schedule polling efficiency
- workflowTemplates keeps singular trigger column (separate concern)
- [Phase 25]: matchesTrigger is a pure function for testability; DB access only in matchAndFireTriggers
- [Phase 25]: Each createWorkflowRun wrapped in try-catch so one failure doesn't block other matches
- [Phase 25]: Secret in URL path as sole auth for inbound webhooks (no header auth required from callers)
- [Phase 25]: All webhook error states return 404 for zero information leakage
- [Phase 25]: Only workflow creator can regenerate webhook secret (authorization check)
- [Phase 25]: Overlap queuing: always create pending runs even if previous run is active (no skip, no parallel)
- [Phase 25]: Atomic claim via UPDATE...RETURNING sets nextRunAt to null to prevent duplicate processing
- [Phase 25]: cron-parser v5 API: CronExpressionParser.parse() with .next().toDate()
- [Phase 26]: String coercion for equals/contains operators enables flexible trigger data comparison
- [Phase 26]: Invalid regex patterns return false (graceful degradation for user-provided patterns)
- [Phase 26]: resolveFieldPath dot-notation walker reused across condition evaluator and delay resolver
- [Phase 26]: AsyncLocalStorage for recursion depth tracking -- propagates across async boundaries without parameter threading
- [Phase 26]: Recursion limit of 5 levels with immediate failed-status creation prevents runaway chains
- [Phase 26]: toggleWorkflow uses bulk UPDATE...RETURNING for atomic waiting-run cancellation with count
- [Phase 26]: Action nodes are stubs returning { type, status: "stub" } -- Phase 27 implements real actions
- [Phase 26]: 5s poll interval for execution processor (faster than 30s schedule processor for responsiveness)
- [Phase 26]: Drain loop claims all available pending runs per tick, not just one
- [Phase 26]: executeBranch walks linearly -- no nested conditions in v1

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 5 | Admin user management complete CRUD | 2026-03-23 | 42c8764 | [5-admin-user-management-complete-crud](./quick/5-admin-user-management-complete-crud/) |
| Phase 25 P02 | 2min | 2 tasks | 4 files |
| Phase 25 P04 | 2min | 2 tasks | 6 files |

## Accumulated Context

### Roadmap Evolution

- v1.0 MVP shipped 2026-03-14 (16 phases, 73 plans)
- v1.1 Reliability & Operations shipped 2026-03-26 (5 phases, 12 plans)
- Formula Reactivity and Bulk Operations deferred from v1.1 (removed from scope)
- v1.2 Workflows roadmap created 2026-03-26 (7 phases, 27 requirements)

### Research Flags

- Phase 26 (Execution Engine): Concurrency model and step yielding need careful design
- Phase 27 (Action Nodes): SSRF prevention requires DNS resolution checks for HTTP node
- Phase 28 (Visual Editor): @xyflow/react + shadcn/ui integration may need experimentation

### Blockers/Concerns

None yet.

## Session Log

- 2026-03-26: Milestone v1.2 Workflows started
- 2026-03-26: Research completed (HIGH confidence)
- 2026-03-26: Requirements defined (27 v1.2 requirements)
- 2026-03-26: Roadmap created (7 phases: 24-30)
- 2026-03-27: 24-01 complete -- workflow schema (4 tables), CRM event bus (13 events), webhook subscriber
- 2026-03-27: 24-02 complete -- deal & people mutations extracted with CRM event emission
- 2026-03-27: 24-03 complete -- workflow CRUD mutations, REST API (/api/v1/workflows), server actions, serializeWorkflow
- 2026-03-27: 24-04 complete -- org/activity mutations extracted, all triggerWebhook eliminated. Phase 24 COMPLETE.
- 2026-03-28: 25-01 complete -- trigger types (4 Zod schemas), schema migration (trigger->triggers array), createWorkflowRun utility, cron-parser installed
- 2026-03-28: 25-03 complete -- schedule processor (atomic claim, cron/interval utils, overlap queuing, instrumentation.ts)
- 2026-03-28: 26-01 complete -- execution types, condition evaluator (14 operators, AND/OR groups), delay resolver (3 modes, 30-day cap), schema migration
- 2026-03-28: 26-02 complete -- execution engine (graph walking, branching, delay yielding) + processor (atomic claim, serial enforcement, instrumentation bootstrap)
- 2026-03-28: 26-03 complete -- toggleWorkflow server action, AsyncLocalStorage recursion depth guard (max 5 levels), createWorkflowRun depth enforcement
