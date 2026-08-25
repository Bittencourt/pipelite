# Pipelite

## What This Is

A lightweight, self-hostable CRM inspired by Pipedrive with a built-in workflow automation engine. Built for mid-size companies (~50 users, thousands of deals) who want core CRM functionality and automation without vendor lock-in. Container-deployable with a modern TypeScript stack. Ships with pipelines, organizations, people, deals (kanban), activities (calendar), custom fields with formulas, full REST API, keyboard navigation, localization, dashboard metrics, multi-user collaboration, Pipedrive API importer, durable webhook delivery, production email, and a visual workflow editor with triggers, conditions, delays, HTTP/CRM/email/notification actions, templates, and JSON import/export.

## Core Value

API-complete CRM core that handles fundamentals well — pipelines, orgs, people, deals, activities, and custom fields. Advanced features (email sync, automation, reporting) can be built externally via the API.

## Current State: v1.3 SHIPPED (2026-08-24)

**Latest shipped milestone:** v1.3 "Foundation & CRM Depth" — 14 phases (32-45), 190 plans,
42/42 requirements, 1,274 commits. Archive:
[v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md) ·
[requirements](milestones/v1.3-REQUIREMENTS.md) ·
[audit](milestones/v1.3-MILESTONE-AUDIT.md) ·
[integration](milestones/v1.3-INTEGRATION.md)

v1.3 took a CRM that worked and made it one you can operate: history you can read, deletions you can
undo, duplicates you can merge, filters you can share, workflows you can replay, and failures you can
actually see. It also made the deployment recoverable — uploads persist in a named volume, and the
backup/restore runbook's restore was exercised against a real 34 MB dump.

**State at ship:** 4,605 tests passing / 32 skipped · RSC 8/8 · `tsc --noEmit` 0 errors · lint 0
errors · `@ts-expect-error` down to 2 (both deliberate negative-test assertions) · `/api/health` 200
with 10/10 background workers alive · CI green on `master`.

## Current Milestone: v1.4 Debt Paydown

**Goal:** Make the product installable from its own repository, restore the export authorization
posture v1.3 regressed, and close the eight structural defects and eleven API/tooling items that v1.3
shipped around — with no new user-facing capability.

**Target features** (all remediation; scope is the 19 items in `ROADMAP.md` § *v1.4 seed*, with
evidence in `BACKLOG.md`):

- **A fresh database can be built from the migration chain** — `MIG-01`. Today it cannot: a run
  against an empty database dies `42P01` at migration `0006` and, because the run is transactional,
  leaves **0 tables**. No migration creates `import_sessions`.
- **Export is authorized, not merely attributable** — `WR-04`. A non-admin can still export 44,254 of
  46,054 organizations (96.1%) under the row cap.
- **`/deals` is paginated** — `PERF-01`. 15,415 deals on the busiest board, 88 s to first paint, and
  the named amplifier of suite flakiness.
- **Purge means purged** — `CR-01`. Uploaded blobs survive a "permanent" delete and stay downloadable.
- **The API authorizes every route** — `999.17` (activities IDOR), `999.15` (stages 403s its owner).
- **Modals and small viewports are reachable** — `F-39-07`, `F-39-08`.
- **Displayed numbers are true** — `STATS-01`, `FORM-01`, `999.23`.
- **Gates can fail, and CI runs them** — `999.28`+`D-45-01` (wall-clock assertions), `999.16` (audit
  policy), and the reachability assertion missing from `viewport-320.spec.ts`.

**Deliberately not in scope:** any new user-facing capability. This is a trust milestone; the case for
it is that `MIG-01` means nobody can install the product from the repo, `WR-04` is a live
authorization regression against v1.3's own Phase 38 decision, and `999.17` is an IDOR — building
features on top of those compounds them.

### What actually carried forward from v1.3 — corrected 2026-08-24

This section previously read *"Seven items carry forward, all tracked in `BACKLOG.md`, none
blocking."* **Every clause of that was wrong**, and the reconciliation that found it is worth
recording because the error was structural rather than careless: v1.3 kept deferred work in **five**
places — this file, `ROADMAP.md`'s `999.x` list, `BACKLOG.md`, the milestone audit's carry list, and
the archived phase artifacts — and no two agreed.

- **It was not seven.** It is **19 seeded items** plus a recorded remainder.
- **They were not all tracked in `BACKLOG.md`.** Four of the audit's seven were not in it at all
  (`CR-01`, `D-45-02`, `D-45-03`, `D-45-04`), and `D-45-01` was in neither.
- **One was already closed.** `D-45-03` was disproven by direct measurement on 2026-08-18, six days
  before the audit that lists it as open — the carry list was carrying a phantom.
- **One was missing entirely, and it was the worst one.** `MIG-01` appeared in `BACKLOG.md` but in no
  carry list, despite defeating v1.3's own "recoverable deployment" goal.
- **"None blocking" was a live override.** Phase 40's verifier wrote that `WR-04` *should* block
  milestone close; the audit carried it under "nothing blocking" and v1.3 shipped.

`BACKLOG.md` is now the single register of record and `ROADMAP.md` holds only the schedule.

**One process lesson from v1.3 worth carrying into how v1.4 is planned.** Six gates were found that
*could not fail* — a grep whose malformed bracket class matched nothing, a credential grep matching
its own file paths, count gates counting prose, a `--build` that hit the layer cache, operator docs
whose "authoritative" check printed the same line for 0 or 20 migrations, and a suite CI never runs.
None was a product bug; every one was a bug in the checking. What worked was requiring executors to
mutate their own gate and watch it go red before trusting it. **v1.4 is a milestone about trust, so
this is not optional here:** several of its items exist *because* a gate passed while the defect was
live, and `F-39-07` was reproduced in the very suite Phase 45 built to prevent it.

<details>
<summary>v1.3's original milestone brief (as written at kickoff)</summary>

### v1.3 Foundation & CRM Depth

**Goal:** Harden what v1.2 left soft and close the CRM gaps — make regressions unmergeable,
index the core, fix stale formula data, and add the notes, audit, and operational surfaces a
self-hosted CRM needs.

**Target features:**
- Test infrastructure & CI — 3 tests fail on master today with nothing running them
- Database indexes for the v1.0 CRM core — currently zero non-PK indexes on deals/people/orgs/activities
- Formula reactivity — server-side recalc so API, exports, and webhooks stop serving stale values
- Notes & activity timeline — replace the overwrite-in-place notes column with an attributed feed
- Audit log — fed by the existing crmBus, answers "did a human or a workflow change this?"
- Bulk operations — select, delete, reassign, export
- Duplicate detection & record merge
- Saved views & shared filters
- Trash & restore for soft-deleted records
- Workflow operator affordances — replay, dry-run, failure alerting
- Observability — structured logging, error tracking, health endpoint
- Type-safety & deployment-docs polish

**Sequencing note:** CI lands first. Three tests fail on `master` today, so every later phase's
verification is untrustworthy until the suite is green.

**Open design questions** (decide during phase discussion, do not assume):
- Audit-log retention and pruning — this table grows fastest of anything in the schema, on a
  self-hosted product where nobody may be watching disk
- Duplicate-detection heuristics — which field combinations constitute a match

</details>

## Requirements

### Validated

- ✓ Pipelines (funnels) with kanban-style deal management — v1.0
- ✓ Organizations CRUD with custom fields — v1.0
- ✓ People CRUD with custom fields, linked to organizations — v1.0
- ✓ Deals CRUD with custom fields, linked to pipelines, organizations, people — v1.0
- ✓ Activities CRUD linked to deals, with custom fields — v1.0
- ✓ Full-featured custom fields: text, number, date, boolean, single/multi-select, files, lookups, formulas, links — v1.0
- ✓ REST API with full CRUD on all entities — v1.0
- ✓ User authentication with admin/member roles — v1.0
- ✓ Single-tenant deployment model — v1.0
- ✓ TypeScript build honesty — `tsc --noEmit` passes clean — v1.1
- ✓ Webhook delivery reliability — durable DB-backed retries, delivery history UI, DLQ with replay — v1.1
- ✓ Import state robustness — DB-backed import sessions, survives restarts, cancellation persists — v1.1
- ✓ Production email — Resend SMTP, i18n templates, user invites, deal assignment, activity reminders, weekly digest — v1.1
- ✓ Visual workflow editor with linear/branching node layout — v1.2
- ✓ Trigger system: CRM events, cron schedules, manual, inbound webhooks — v1.2
- ✓ Action system: HTTP (with templates), CRM mutations, email, notifications, JS transforms, webhook response — v1.2
- ✓ Flow control: conditions with AND/OR groups, delays (fixed/until/field) — v1.2
- ✓ Execution engine with run history, per-node details, error display — v1.2
- ✓ HTTP template library (6 built-in + custom save/delete) and 4 workflow starter templates — v1.2
- ✓ Workflow JSON export/import with secret stripping and pipelite/v1 schema versioning — v1.2
- ✓ Workflow templates REST API (CRUD) — v1.2

### Active

v1.4's 19 seeded items are scoped from `ROADMAP.md` § *v1.4 seed*, with per-item evidence in
`BACKLOG.md`. REQ-IDs are defined in `.planning/REQUIREMENTS.md`; phase mapping in
`.planning/ROADMAP.md`.

### Out of Scope

- Free-form canvas editor (n8n/Make style) — linear/branching covers 95% of CRM use cases
- AI/LLM agent nodes — users can call AI APIs via HTTP node
- Native third-party integration nodes — generic HTTP + templates covers the need
- Multi-tenancy — single company per deployment
- Mobile app — web-first, responsive design sufficient

*(Formula reactivity and bulk operations were listed here as deferred through v1.2. Both moved
into scope for v1.3 — formula reactivity because stale JSONB values now feed workflow branching
decisions, not just display.)*

## Context

**Shipped v1.2 on 2026-03-28.** 34 days total from project start (v1.0 → v1.1 → v1.2).

- ~45,000+ lines TypeScript/TSX across ~550+ files
- Tech stack: Next.js 16, PostgreSQL + Drizzle ORM, Auth.js, shadcn/ui, react-hotkeys-hook, next-intl, QuickJS (formula sandbox + JS transforms), @dnd-kit, @xyflow/react (workflow editor), Resend/Nodemailer (email), cron-parser
- Docker-deployable: single `docker compose up` starts the full stack
- 111 plans executed across 29 phases (3 milestones)

Known issues / tech debt after v1.2:
- Formula fields don't recalculate on dependent field change (calculated once on page load)
- AddButtonEdge component registered but visual "+" between nodes not yet styled/positioned
- `isBlank` formula function test failing (pre-existing)

## Constraints

- **Tech stack**: PostgreSQL, Next.js, Redis (optional), TypeScript — modern, well-supported, container-friendly
- **Deployment**: Container-deployable (Docker) — single-command self-hosting
- **Scale**: Built for mid-size company (~50 users, thousands of deals) — proper indexing, pagination
- **Single-tenant**: One organization per deployment — simplifies auth and data isolation

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| API-first design | Allows external tools to build advanced features | ✓ Good — REST API is complete and used by Pipedrive importer |
| Single-tenant | Simpler architecture, matches self-hosting use case | ✓ Good — clean data isolation, no complexity |
| Full-featured custom fields including formulas | Essential for real CRM flexibility | ✓ Good — QuickJS sandbox works well; formula recalc on change deferred |
| Next.js full-stack | Single codebase, SSR for performance, API routes built-in | ✓ Good — fast dev velocity, no separate backend |
| JWT strategy (not DB sessions) | Credentials provider always uses JWT; fresh DB fetch in session callback | ✓ Good — stateless auth, works without Redis |
| JSONB per entity for custom field values | Avoids EAV table complexity | ✓ Good — simple queries, flexible schema |
| QuickJS sandbox for formula execution | Secure JS execution without eval | ✓ Good — no security issues; Emscripten load time acceptable |
| Gap-based positioning for stages/fields | Avoids full renumbering on reorder | ✓ Good — used consistently throughout |
| Cookie-based locale (not URL routing) | Simpler UX, no URL changes | ✓ Good — seamless locale switching |
| DB-backed import state (replaced in-memory Map) | Survives restarts, enables horizontal scaling | ✓ Good — resolved v1.0 tech debt cleanly |
| DB-backed webhook delivery (replaced setTimeout) | Durable retries survive container restarts | ✓ Good — no lost deliveries on restart |
| setTimeout chaining for cron processors | Prevents overlap, no external scheduler needed | ✓ Good — simple, reliable for single-instance |
| safeSend wrapper for all emails | Graceful degradation when SMTP not configured | ✓ Good — no crashes in dev/test without mail server |
| fire-and-forget import (server action) | Unblocks progress polling | ✓ Good — resolved import-stuck bug cleanly |
| Linear/branching editor (not free-form canvas) | Covers 95% of CRM automation patterns with simpler UX | ✓ Good — dagre auto-layout, node config panel |
| CRM event bus for trigger matching | Decouples trigger system from mutation code | ✓ Good — clean separation, 13 event types |
| QuickJS for JS transform nodes | Reuses formula sandbox, secure execution | ✓ Good — no eval, no security issues |
| Typed static template arrays (not DB-stored built-ins) | Simpler deployment, no seed migration needed | ✓ Good — 6 HTTP + 4 workflow templates ship with code |
| pipelite/v1 schema versioning for exports | Forward compatibility for workflow JSON format | ✓ Good — validation rejects unknown versions |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-24 — v1.4 Debt Paydown milestone started; the v1.3 carry list corrected after the five registers were reconciled into BACKLOG.md*
