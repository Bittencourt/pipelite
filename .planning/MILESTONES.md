# Milestones

## v1.3 Foundation & CRM Depth (Shipped: 2026-08-24)

**Phases completed:** 14 phases (32-45), 190 plans · 1,274 commits · 1,077 files changed
(+317,433 / −3,377) · 2026-03-28 → 2026-08-24

**Key accomplishments:**

- **The record gained a memory** — field-level audit history with actor kind (user / workflow run / API key / import), a chronological per-record timeline, and append-only attributed notes, all fed by one `crmBus` event spine with four subscribers
- **Destructive actions became reversible** — soft delete surfaced as a real Trash with restore and an ordered transactional purge, plus a daily pruner and an admin-set retention window
- **Duplicates stopped being permanent** — detection warns before you create one; merge reparents children inside a transaction and audits both sides rather than orphaning anything
- **Operators got leverage** — bulk multi-select with delete and owner reassignment, saved and shared named filter sets with CSV/JSON export, and workflow replay + dry-run with failure alerting
- **Failure became visible** — structured JSON logging replaced ~273 bare `console.*` calls with `no-console` flipped to `error` so a 274th cannot land; opt-in Sentry that phones home to nobody until a DSN is set; and `/api/health` reporting ten workers from a hard-coded roster, so a dead `register()` is visible from the endpoint alone
- **The deployment became recoverable** — uploads persist in a named volume (proven by losing a file before the fix and surviving a forced container recreate after), and a backup/restore runbook covering Docker and bare metal whose restore was exercised against a real 34 MB dump
- **Type safety without suppressions** — `@ts-expect-error` went from 14 standing suppressions to 0 in non-test source via a single `TableMeta` module augmentation, with `Required<Pick<>>` consumer contracts so the win was not just relocated into optional members

**State at ship:** 4,605 tests passing / 32 skipped · RSC 8/8 · `tsc --noEmit` 0 errors · lint 0 errors · `/api/health` 200 with 10/10 workers alive · CI green on `master`

**Archive:** [roadmap](milestones/v1.3-ROADMAP.md) · [requirements](milestones/v1.3-REQUIREMENTS.md) · [audit](milestones/v1.3-MILESTONE-AUDIT.md) · [cross-phase integration](milestones/v1.3-INTEGRATION.md)

### Known Gaps

Seven items carried forward, all tracked in `BACKLOG.md`, none blocking. Two found by the closing audit:

1. **Merge does not recalculate the survivor's own formula fields** (phases 39 × 34 seam) — invisible to either phase's own verification. Dormant while zero `type='formula'` definitions exist.
2. **`formatters-live.test.ts` (24 tests) never runs in CI** — the export path it guards is unproven by any automated gate, and it has already gone red silently once.
3. WR-04 — a non-admin can export 44,254 of 46,054 organizations (96.1%) under the 50,000 row cap.
4. The trash pruner never deletes uploaded file blobs on purge (phases 37 × 43).
5. D-45-04 — swipe-to-dismiss on the admin drawer; a Radix `Dialog` limitation, never worked.
6. D-45-03 — `/deals` pipeline select label in dark mode; UNCONFIRMED, needs a human look.
7. D-45-02 — `ShortcutsHint` bar vertical occlusion; predates Phase 45.

### Lesson

Six gates were found that **could not fail** — a grep whose malformed bracket class matched nothing, a credential grep matching its own file paths, count gates counting prose the plan itself ordered written, a `docker compose --build` that hit the layer cache and never recreated the container, operator docs whose "authoritative" check printed the same line for 0 or 20 migrations, and a 24-test suite CI never runs. None was a product bug; every one was a bug in the *checking*. Requiring executors to mutate their own gate and watch it go red found four of the six.

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

- FORMULA-01, FORMULA-02: Formula reactivity (server-side recalc on save) — deferred, removed from v1.1 scope. Captured 2026-08-12 as backlog Phase 999.1.
- BULK-01 through BULK-04: Bulk operations (select, delete, reassign, export) — deferred, removed from v1.1 scope. Captured 2026-08-12 as backlog Phase 999.2.

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
