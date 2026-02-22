# Pipelite

## What This Is

A lightweight, self-hostable CRM inspired by Pipedrive. Built for mid-size companies (~50 users, thousands of deals) who want core CRM functionality without vendor lock-in. Container-deployable with a modern TypeScript stack.

## Core Value

API-complete CRM core that handles fundamentals well — pipelines, orgs, people, deals, activities, and custom fields. Advanced features (email sync, automation, reporting) can be built externally via the API.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Pipelines (funnels) with kanban-style deal management
- [ ] Organizations CRUD with custom fields
- [ ] People CRUD with custom fields, linked to organizations
- [ ] Deals CRUD with custom fields, linked to pipelines, organizations, people
- [ ] Activities CRUD linked to deals, with custom fields
- [ ] Full-featured custom fields: text, number, date, boolean, single/multi-select, files, lookups, formulas, links
- [ ] REST API with full CRUD on all entities
- [ ] User authentication with admin/member roles
- [ ] Single-tenant deployment model

### Out of Scope

- Email sync/integration — external tools via API
- Workflow automation — external tools via API
- Reporting/analytics dashboards — external tools via API
- Mobile app — web-first, responsive design
- Multi-tenancy — single company per deployment
- Native integrations (Slack, Zapier, etc.) — API allows external integration

## Context

Open-source project targeting teams who want a self-hosted alternative to SaaS CRMs. The API-first design means the core stays focused while integrations handle edge cases. Formula fields in custom fields add complexity but are essential for real CRM use cases.

## Constraints

- **Tech stack**: PostgreSQL, Next.js, Redis, TypeScript — modern, well-supported, container-friendly
- **Deployment**: Container-deployable (Docker) — single-command self-hosting
- **Scale**: Built for mid-size company from the start (~50 users, thousands of deals) — proper indexing, pagination
- **Single-tenant**: One organization per deployment — simplifies auth and data isolation

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| API-first design | Allows external tools to build advanced features | — Pending |
| Single-tenant | Simpler architecture, matches self-hosting use case | — Pending |
| Full-featured custom fields including formulas | Essential for real CRM flexibility | — Pending |
| Next.js full-stack | Single codebase, SSR for performance, API routes built-in | — Pending |

---
*Last updated: 2026-02-22 after initialization*
