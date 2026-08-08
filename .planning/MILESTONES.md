# Milestones

## v1.2 Workflows (Shipped: 2026-03-28)

**Phases completed:** 8 phases, 26 plans, 52 tasks

**Key accomplishments:**

- Four workflow Drizzle tables with migration, typed CRM event bus (13 events), and webhook bus subscriber registered at startup
- Deal and people business logic extracted to shared mutation functions with CRM event emission on all write operations, eliminating direct triggerWebhook calls
- Full REST API at /api/v1/workflows with Zod-validated mutations, pagination, and server actions for editor UI
- Organization and activity mutations extracted with CRM event emission; all triggerWebhook calls eliminated from src/app/
- Trigger type Zod schemas (4 types), workflows trigger->triggers array migration, and createWorkflowRun utility with cron-parser installed
- CRM event trigger matcher with entity+action matching, deal stage from/to filters, and field-change filters, registered as event bus subscriber
- DB-backed schedule processor with atomic claim, cron/interval computation via cron-parser v5, and overlap queuing as pending runs
- Inbound webhook endpoint with timing-safe secret verification, REST API trigger endpoint with API auth, manual trigger mutation, and webhook secret regeneration
- Condition evaluator (14 operators, AND/OR groups) and delay resolver (3 modes, 30-day cap) with TDD and schema migration for execution state persistence
- Execution engine walks workflow node graphs with IF/ELSE branching and delay yielding, processor claims pending runs atomically with serial enforcement
- Workflow toggle server action with waiting-run cancellation and AsyncLocalStorage-based recursion depth tracking (max 5 levels)
- Variable interpolation engine, SSRF-protected HTTP handler with retry/backoff, action registry with 6 Zod config schemas, engine dispatch integration
- CRM create/update/delete actions via mutation dispatch, email with interpolated templates to dynamic/user recipients, and team notification handler
- QuickJS sandbox transform action with MATH/TEXT/DATE/LOGIC helpers and webhook response coordination for synchronous request-response patterns
- Graph converter with lossless DB round-trip, dagre auto-layout, zustand editor store, graph mutations, and variable schema builder for workflow visual editor
- ReactFlow canvas with 4 color-coded custom node types, add-button edges, toolbar with save, and workflow list page with navigation
- Side panel with type picker, reorder controls, and 9 config forms covering all workflow node types (trigger, HTTP, CRM, condition, email, notification, delay, transform, webhook-response)
- Autocomplete variable picker triggered by {{ with keyboard navigation, integrated into all template-supporting config forms
- Registered orphaned AddButtonEdge component as custom edge type via edgeTypes export and defaultEdgeOptions on ReactFlow
- 15 failing TDD test stubs covering serializeRun/Step, formatDuration, and runs API routes
- REST API endpoints for workflow run history with serializers, duration formatter, and status badge component -- 17 tests passing
- Runs list page with status filter/pagination and workflow overview page with aggregate stats card and recent runs mini-table
- Run detail page with expandable step list, per-node input/output JSON viewer, error display, and skipped branch node detection
- 6 HTTP templates, 4 workflow starters, export/import with secret stripping, http_templates table with CRUD mutations
- HTTP template selector with grouped built-in/custom items, save-as-template dialog, and create workflow dialog with 4 starter template cards
- Export/Import JSON buttons in editor toolbar with client-side serialization, plus full CRUD REST API for workflow templates

---

## v1.1 Reliability & Operations (Shipped: 2026-03-26)

**Phases completed:** 5 phases, 12 plans
**Timeline:** 2026-03-14 → 2026-03-26 (12 days)
**Commits:** 45 | **Files changed:** 97 | **Code:** ~39,520 lines TypeScript/TSX

**Key accomplishments:**

1. TypeScript build honesty — removed `ignoreBuildErrors`, `tsc --noEmit` exits clean
2. Durable webhook delivery — DB-backed retries surviving container restarts, admin delivery log, DLQ with manual replay
3. Admin webhook management — full CRUD UI with signing secrets, event selection, delivery history
4. DB-backed import state — Pipedrive import progress survives restarts, cancellation persists, stale session cleanup on boot
5. Production email infrastructure — Resend SMTP, safeSend wrapper, i18n templates in 3 locales
6. User invite flow — admin invites by email, token-based registration with auto-approval
7. Email notifications — deal assignment, activity reminders (cron every 5min), weekly digest (Mondays), per-user preference toggles

### Known Gaps

- FORMULA-01, FORMULA-02: Formula reactivity (server-side recalc on save) — deferred, removed from v1.1 scope
- BULK-01 through BULK-04: Bulk operations (select, delete, reassign, export) — deferred, removed from v1.1 scope

---

## v1.0 MVP (Shipped: 2026-03-14)

**Phases completed:** 16 phases, 73 plans
**Timeline:** 2026-02-22 → 2026-03-14 (20 days)
**Commits:** 396 | **Files changed:** 414 | **Code:** ~35,470 lines TypeScript/TSX

**Key accomplishments:**

1. Full authentication system — signup, email verification, admin approval workflow, JWT sessions, API keys
2. Core CRM entities — Organizations, People, Deals with kanban pipeline, Activities with calendar view
3. Custom fields system — 10 field types including formula engine (QuickJS sandbox), file uploads, lookups
4. REST API with OpenAPI docs, rate limiting, webhooks, and full CRUD on all entities
5. Full keyboard navigation — all screens keyboard-accessible with hotkeys, shortcuts overlay
6. Localization — en-US, pt-BR, es-ES with locale-aware currency, dates, and timezones
7. Comprehensive documentation — user guides, API reference, admin/deployment docs
8. Dashboard metrics — win rate, deal velocity, pipeline value by stage, activity completion
9. Multi-user collaboration — assignees on deals and activities, team view
10. Pipedrive API Importer — 5-step wizard, full entity import with custom field mapping

---
