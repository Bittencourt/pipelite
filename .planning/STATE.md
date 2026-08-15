---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Foundation & CRM Depth
status: verifying
last_updated: "2026-08-15T16:06:07.804Z"
last_activity: 2026-08-15
progress:
  total_phases: 13
  completed_phases: 3
  total_plans: 31
  completed_plans: 27
  percent: 23
---

# Session State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-26)

**Core value:** API-complete CRM core that handles fundamentals well
**Current focus:** Phase 34 — Formula Reactivity

## Position

Phase: 44 - Custom Field UI Repair (executing — 5/9 plans)
Plan: Wave 1 complete (44-01..44-05); Wave 2 next (44-06, 44-07)
Status: Executing — reconciled 2026-08-15 after parallel Wave 1
Last activity: 2026-08-15

Progress: [█████████░] 87%

## Performance Metrics

**Velocity:**

- Total plans completed: 111 across 3 shipped milestones (v1.0: 73, v1.1: 12, v1.2: 26)
- v1.3 plans completed: 9 (Phases 32 and 33 complete)

| Phase / Plan | Duration | Tasks | Files |
|---|---|---|---|
| Phase 33 P01 | 12min | 2 tasks | 2 files |
| Phase 33 P02 | 9min | 2 tasks | 4 files |
| Phase 33 P03 | 21min | 3 tasks | 4 files |
| Phase 34 P11 | 70min | 3 tasks | 4 files |
| Phase 34 P13 | 13min | 2 tasks | 6 files |
| Phase 44 P03 | 5min | 2 tasks | 3 files |
| Phase 44 P05 | 9min | 2 tasks | 3 files |
| Phase 44 P02 | 16min | 2 tasks | 2 files |
| Phase 44 P04 | 17min | 2 tasks | 8 files |
| Phase 44 P01 | 17min | 2 tasks | 6 files |

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

- [Phase 27]: Separated registry.ts from index.ts to break circular dependency in action handler registration
- [Phase 27]: Static side-effect import for handler registration (deterministic loading vs async dynamic import)
- [Phase 27]: QuickJS runtime per invocation with dispose in finally block for sandbox isolation
- [Phase 27]: TRANSFORM_HELPERS duplicated from formula-engine (var for QuickJS compat, expanded API)
- [Phase 27]: In-memory Promise map for webhook response coordination (waitFor/send pattern)
- [Phase 27]: Synchronous executeRun() for webhook-response workflows; async processor for others
- [Phase 27]: Direct registry import pattern in action tests to avoid crm.ts DB chain
- [Phase 27]: SSRF validates resolved IPs via dns.resolve to catch DNS rebinding; falls back to direct IP check
- [Phase 27]: HTTP response parsed as JSON when content-type includes application/json, otherwise as text
- [Phase 27]: Mutation dispatch map uses type-cast wrappers to normalize varying mutation signatures
- [Phase 27]: Field lookup uses ilike for case-insensitive matching on text fields
- [Phase 27]: Email handler resolves user recipients via batch DB query with inArray
- [Phase 27]: Workflow email templates are simple (no i18n) since subject/body are user-authored

- [Phase 28]: workflowNodes as DB source of truth; RF nodes derived via reconversion on every mutation
- [Phase 28]: Static ACTION_OUTPUT_SCHEMAS map for variable autocomplete (not runtime introspection)
- [Phase 28]: Virtual trigger node (id="trigger") stores TriggerConfig[] in data, excluded from DB conversion
- [Phase 28]: Condition node nextNodeId for post-merge continuation; trueBranch/falseBranch for branch edges
- [Phase 28]: Fixed updateWorkflow action to use triggers (plural) matching mutation schema
- [Phase 28]: ReorderControls disable logic: up disabled when predecessor is trigger/condition, down disabled when next is null/condition
- [Phase 28]: Config forms shared pattern: {nodeId, config} props, onChange calls store.updateNodeConfig for immediate auto-save
- [Phase 28]: Trigger config manages triggers array via setTriggers separately from node config
- [Phase 28]: ConfigRouter in side-panel routes by nodeType then actionType for clean form selection
- [Phase 28]: forwardRef + useImperativeHandle for keyboard event forwarding from VariableField to VariablePicker
- [Phase 28]: onMouseDown (not onClick) on picker options prevents blur-before-click issue
- [Phase 28]: Transform code textarea excluded from variable picker (JS code, not template interpolation)
- [Phase 28]: Renamed layout.ts to dagre-layout.ts to avoid Next.js route file naming conflict
- [Phase 28]: Used defaultEdgeOptions on ReactFlow instead of modifying graph-converter edge creation
- [Phase 30]: Used db.select() instead of db.query for workflowTemplates (no relations defined for standalone table)
- [Phase 30]: Export is pure client-side via Blob/ObjectURL (no server round-trip)
- [Phase 33]: Indexes declared in the Drizzle schema files and generated, never hand-written into migration SQL (D-06) -- a hand-written index was silently dropped by a later generate in this repo (0009 -> 0010)
- [Phase 33]: All 11 CRM indexes are plain single-column btrees -- no partial (D-02, breaks the stage-delete guard and buys nothing measurable), no CONCURRENTLY (D-03, drizzle-kit wraps migrations in a transaction), no composite (stage_id, position) (D-04, measured to push the planner back to Seq Scan and actively fail SC-1)
- [Phase 33]: Bitmap Index Scan accepted as satisfying an "index scan" criterion (D-01) -- a plain Index Scan node is physically unachievable for a ~3,753-row scattered fetch at any selectivity where the index wins
- [Phase 33]: deals.owner_id is verified by pg_indexes catalog assertion only, never by EXPLAIN (D-05) -- n_distinct = 1 in this dataset, so the planner correctly ignores that index forever
- [Phase 33]: random_page_cost left at the Postgres default of 4 (D-08) -- it is why the deals selectivity crossover sits at 15-19%; tuning it for SSD is server config, not an index, and is deferred
- [Phase 33]: Corrected STATE.md's stale "partial index on next_run_at WHERE active=true" precedent -- that index no longer exists in the database (dropped by 0010); it is a cautionary tale, not a supporting pattern
- [Phase ?]: Phase 34: all 17 write paths dispositioned by source inspection; D-11 proven end to end in Docker with a real formula field
- [Phase ?]: SC-3 is mechanically delivered but only partially usable: bracket field paths work, no UI emits them, 152/169 field names require the syntax
- [Phase 44]: buildClientFieldValues mirrors buildFormulaFieldValues in a db-free module; a parity test enforces that the two change together
- [Phase 44]: Client natives are normalised with ?? null, matching the server's row?.[column] ?? null, so no undefined reaches the QuickJS sandbox
- [Phase 44]: Radix asChild guard is dev-only (D-44-03) -- a production throw would turn a degraded page into a hard crash
- [Phase 44]: Diagnostic guards must not also repair the render -- an in-component fallback masks the broken RSC boundary contract for the next asChild consumer
- [Phase 44]: The guard log never serializes children or prop values (T-44-18), asserted by test rather than by comment
- [Phase ?]: 44-02: saveFieldValues returns { success, values } — values is recalculateFormulas' customFields, falling back to the written blob when it throws (D-05 preserved)
- [Phase ?]: 44-02: the recalc result local is seeded with next BEFORE the try, so the D-05 catch block stays literally unchanged
- [Phase 44]: 44-04: bound constants live in the client-safe formula-engine.ts and are re-exported by formula-recalc.ts, so formula-recalc.test.ts's untouched 8 MiB / 500 ms assertions guard both client and server against drift
- [Phase ?]: 44-01: the react-server vitest project lives in a separate vitest.rsc.config.ts run by a compound test script; ssr.resolve.conditions (not resolve.conditions alone) is what applies the condition on vitest 4.0.18

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 5 | Admin user management complete CRUD | 2026-03-23 | 42c8764 | [5-admin-user-management-complete-crud](./quick/5-admin-user-management-complete-crud/) |
| 260328-rza | Add split node type for workflow parallel branching | 2026-03-28 | df34561 | [260328-rza-add-split-node-type-for-workflow-paralle](./quick/260328-rza-add-split-node-type-for-workflow-paralle/) |
| Phase 25 P02 | 2min | 2 tasks | 4 files |
| Phase 25 P04 | 2min | 2 tasks | 6 files |
| Phase 27 P02 | 6min | 2 tasks | 13 files |
| Phase 28 P02 | 6min | 2 tasks | 16 files |
| Phase 28 P05 | 3min | 1 tasks | 2 files |
| Phase 32 P06 | 13min | 3 tasks | 0 files |

## Accumulated Context

### Roadmap Evolution

- v1.0 MVP shipped 2026-03-14 (16 phases, 73 plans)
- v1.1 Reliability & Operations shipped 2026-03-26 (5 phases, 12 plans)
- Formula Reactivity and Bulk Operations deferred from v1.1 (removed from scope)
- v1.2 Workflows roadmap created 2026-03-26 (7 phases, 27 requirements)
- v1.2 Workflows shipped 2026-03-28 (8 phases incl. gap-closure Phase 31, 26 plans)
- Deferred v1.1 scope captured as backlog 2026-08-12: 999.1 formula reactivity, 999.2 bulk operations
- Post-v1.2 codebase review 2026-08-13: 10 findings captured as backlog 999.3-999.12 (CI, indexes, notes timeline, audit log, dedup, saved views, trash/restore, workflow ops, observability, polish)
- v1.3 roadmap created 2026-08-13: all 12 backlog items promoted into Phases 32-43, 37 requirements mapped, backlog now empty

### Research Flags

- Phase 26 (Execution Engine): Concurrency model and step yielding need careful design
- Phase 27 (Action Nodes): SSRF prevention requires DNS resolution checks for HTTP node
- Phase 28 (Visual Editor): @xyflow/react + shadcn/ui integration may need experimentation

### Blockers/Concerns

open. No pending todos, no UAT/verification debt (audit-uat: 0 items), working tree clean.

- CSV export drops every custom_* column unless the first exported row carries it (papaparse header derivation); pre-existing, affects all custom fields

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
- 2026-03-28: 27-01 complete -- variable interpolation engine, SSRF prevention, HTTP handler with retry/backoff, action registry with Zod schemas, engine dispatch integration (29 tests)
- 2026-03-28: 27-03 complete -- QuickJS sandbox transform (15 tests), webhook response coordination with synchronous execution path (11 tests). Phase 27 COMPLETE.
- 2026-03-28: 28-01 complete -- editor data layer: graph converter (lossless round-trip), dagre layout, zustand store, graph mutations, variable schema (25 tests)
- 2026-03-28: 28-03 complete -- side panel with type picker, reorder controls, 9 config forms (trigger, HTTP, CRM, condition, email, notification, delay, transform, webhook-response)
- 2026-03-28: 28-04 complete -- variable picker autocomplete with {{ detection, keyboard navigation, all config forms integrated with VariableInput/VariableTextarea
- 2026-03-28: Milestone v1.2 shipped (PR #7) -- phases 24-31, 26 plans, archived to .planning/milestones/
- 2026-08-08: Post-ship hardening merged -- PR #8 (workflow runtime: execution-engine resume, run-entry guards, schedule triggers, webhook response body, action handlers, wall-clock cycle budget), PR #9 (REST API workflow list/get/run/update/delete scoped to authed user)
- 2026-08-08: Debug workflow-engine-not-firing RESOLVED -- two root causes: reorderDealsMutation missing CRM event emission, and Next.js standalone build omitting instrumentation.js so register() never ran in Docker (all four processors dead in production). Fixed via Dockerfile post-build chunk copy. Verified end-to-end in browser: deal stage drag -> deal.stage_changed -> run completed in 298ms.
- 2026-08-13: Requirements defined (37 v1.3 requirements across 12 categories)
- 2026-08-13: Roadmap created (12 phases: 32-43), backlog 999.1-999.12 fully promoted
- 2026-08-12: Backlog review -- captured deferred v1.1 scope as 999.1 (formula reactivity) and 999.2 (bulk operations); removed stale 27-action-nodes/deferred-items.md (http.test.ts fixed, 14/14 pass)
- 2026-08-14: Phase 32 COMPLETE (6 plans) -- `npm test`/`typecheck` scripts, vitest scoped to src/, suite green (455 pass), 0 eslint errors, `.github/workflows/ci.yml`, and an active `master protection` ruleset (id 20851119) requiring the `ci` check. First CI run on GitHub hardware: 71s, success. Merge gate proven behaviourally via throwaway PR #10 (red `ci`, `mergeStateStatus: BLOCKED`), closed unmerged. Direct push to master retained via one repository-admin bypass actor (D-07 option B).
- 2026-08-14: Phase 33 COMPLETE (3 plans) -- 11 plain single-column btree indexes declared in `src/db/schema/{deals,activities,people,organizations}.ts` and delivered via one generated migration, `drizzle/0012_typical_radioactive_man.sql`. BEFORE plans captured and committed before any DDL (D-07). Kanban query (BDR - Base Fria default pipeline): `Seq Scan on deals` cost 2729.07 / 2414 buffers -> `Bitmap Heap Scan` fed by `Bitmap Index Scan on deals_stage_id_idx` cost 2613.98 / 426 buffers. Reminder cron: `Seq Scan on activities` cost 5072.02 / 3294 buffers -> literal `Index Scan using activities_due_date_idx` cost 12.21 / 5 buffers (415x cheaper, 659x fewer buffers). All 11 target columns catalog-proven `index_backed = t`. Cost: 7328 kB index storage, ~1.08s write-blocking ShareLock per deploy. Zero rows mutated on the 25,206-deal real-data DB, zero `*.test.ts` touched, all three gates green (41 files / 461 passed / 4 skipped).

## Current Position

Phase: 34 (Formula Reactivity) — EXECUTING
Plan: 1 of 11
Status: Phase complete — ready for verification
Last activity: 2026-08-15
