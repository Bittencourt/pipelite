# Pipelite

## What This Is

A lightweight, self-hostable CRM inspired by Pipedrive. Built for mid-size companies (~50 users, thousands of deals) who want core CRM functionality without vendor lock-in. Container-deployable with a modern TypeScript stack. Ships with pipelines, organizations, people, deals (kanban), activities (calendar), custom fields with formulas, full REST API, keyboard navigation, localization, dashboard metrics, multi-user collaboration, Pipedrive API importer, durable webhook delivery, DB-backed import state, and production email notifications with user invites.

## Current Milestone: v1.2 Workflows

**Goal:** Add a server-side workflow automation engine with a visual linear/branching editor, deeply integrated with CRM events and external services.

**Target features:**
- Visual workflow editor (linear/branching node layout)
- Trigger nodes: CRM events, cron schedules, manual click, inbound webhooks
- Action nodes: generic HTTP with template library (user-extensible), CRM mutations
- Flow control nodes: conditions, splits, transforms, generic functions
- Server-side execution engine with run history and logging
- Built-in templates for common integrations (Planka, Apprise, Tally, Typeform, etc.)

## Core Value

API-complete CRM core that handles fundamentals well — pipelines, orgs, people, deals, activities, and custom fields. Advanced features (email sync, automation, reporting) can be built externally via the API.

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

### Active

- [ ] Workflow editor UI with linear/branching node layout
- [ ] Trigger system: CRM events, cron, manual, inbound webhooks
- [ ] Action system: generic HTTP node, CRM mutation nodes
- [ ] Flow control: conditions, splits, transforms, functions
- [ ] Execution engine with run history and logging
- [ ] HTTP template library (built-in + user-defined)

### Out of Scope

- Email sync/integration — external tools via API
- Workflow automation — external tools via API
- Multi-tenancy — single company per deployment
- Native integrations (Slack, Zapier, etc.) — API allows external integration
- Mobile app — web-first, responsive design sufficient
- Formula reactivity (server-side recalc on save) — deferred from v1.1, revisit when needed
- Bulk operations (select, delete, reassign, export) — deferred from v1.1, revisit when needed

## Context

**Shipped v1.1 on 2026-03-26.** 32 days total from project start to reliability milestone.

- ~39,520 lines TypeScript/TSX across ~500 files
- Tech stack: Next.js 16, PostgreSQL + Drizzle ORM, Auth.js, shadcn/ui, react-hotkeys-hook, next-intl, QuickJS (formula sandbox), @dnd-kit, Resend/Nodemailer (email)
- Docker-deployable: single `docker compose up` starts the full stack
- 85 plans executed across 21 phases (2 milestones)

Known issues / tech debt after v1.1:
- Formula fields don't recalculate on dependent field change (calculated once on page load)
- Phase 9, plan 3 (JSON import + Pipedrive CSV compatibility mode) was deferred — CSV/JSON export and Pipedrive API import shipped instead

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

---
*Last updated: 2026-03-26 after v1.2 milestone start*
