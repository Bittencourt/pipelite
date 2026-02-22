# Project Research Summary

**Project:** Pipelite — Lightweight Self-Hostable CRM
**Domain:** CRM / Sales Pipeline Management (Pipedrive-inspired)
**Researched:** 2026-02-22
**Confidence:** HIGH

## Executive Summary

This is a lightweight, self-hostable CRM focused on sales pipeline management—inspired by Pipedrive's kanban-centric approach but designed for single-tenant deployment. Experts build such systems using Next.js with React Server Components for the frontend, PostgreSQL with Drizzle ORM for data persistence, and Redis for caching/sessions. The recommended approach is API-first design with a service layer pattern, enabling both internal tRPC for the UI and external REST API for integrations.

The key differentiator for this project is **custom fields with formulas**—allowing users to extend the CRM without code while maintaining type safety. The primary risks are: (1) JSON column abuse for custom fields leading to query nightmares, (2) formula engine security vulnerabilities if using `eval()`, and (3) N+1 query patterns in kanban views. All three must be designed correctly from day one—retrofitting is expensive.

## Key Findings

### Recommended Stack

A modern TypeScript-first stack optimized for self-hosting simplicity and developer experience. Drizzle ORM over Prisma for SQL control and lighter Docker images. Auth.js for credentials-based auth that doesn't require external OAuth providers.

**Core technologies:**
- **Next.js 16.1+** — Full-stack framework with App Router, React Server Components, Turbopack — best for self-hosted deployments with standalone output
- **PostgreSQL 16+** — Primary database — supports JSONB for flexible fields, full-text search, excellent for relational CRM data
- **Drizzle ORM 1.0+** — TypeScript-first ORM with SQL-like API — lighter than Prisma, better for complex CRM queries and self-hosting
- **Redis 7.x** — Caching, sessions, rate limiting — essential for scaling beyond single-user
- **Auth.js 5.x** — Authentication — database sessions via Drizzle adapter, credentials provider for self-hosted
- **shadcn/ui + Tailwind 4.x** — UI components — copy/paste ownership, Radix primitives for accessibility, perfect for data tables and forms

### Expected Features

**Must have (table stakes) — P1:**
- Organizations — Core entity for B2B sales tracking
- People (Contacts) — Linked to organizations
- Deals/Opportunities — Linked to org + person, with value and stage
- Pipeline with Kanban View — Visual deal management (Pipedrive's signature feature)
- Activities/Tasks — Follow-ups linked to deals
- Users & Auth — Login, roles (admin/member)
- Basic Permissions — Owner-based visibility
- Search — Find records by name/title
- REST API — CRUD for all entities
- Import/Export — CSV for data migration

**Should have (differentiators) — P2:**
- Custom Fields with Formulas — Adapt CRM to unique business needs without code (key differentiator)
- Multiple Pipelines — Different sales processes (e.g., Sales vs Partnerships)
- Advanced Filters — Saved views, shareable views
- Activity Reminders — Email notifications for due tasks
- Bulk Actions — Efficiency for common operations
- Activity Timeline — Chronological history view
- Audit Log — Compliance tracking

**Defer (v2+):**
- Email Integration — Sync, send, track emails (complex, requires background jobs)
- Webhooks — External automation triggers
- Forecasting/Reports — Pipeline analytics dashboards
- Mobile App (PWA) — Progressive web app with offline

### Architecture Approach

Layered architecture with clear separation: Presentation (React RSC + Client Components) → API Layer (REST + Server Actions + tRPC) → Service Layer (business logic) → Data Layer (Drizzle + PostgreSQL). The critical architectural patterns are: EAV (Entity-Attribute-Value) for custom fields with typed value columns, and AST-based formula evaluation for security.

**Major components:**
1. **Presentation Layer** — React Server Components for initial render, Client Components for interactivity (kanban drag-drop, forms)
2. **Service Layer** — Business logic in TypeScript classes (DealService, CustomFieldService, FormulaEvaluator) — thin API routes, testable logic
3. **Formula Engine** — AST-based parser + safe evaluator with whitelisted functions (NOT eval())
4. **Custom Fields (EAV)** — Separate field definitions and typed value storage (value_text, value_number, value_date columns)
5. **REST API** — Versioned endpoints (/api/rest/v1/) with auth middleware, rate limiting, OpenAPI documentation

### Critical Pitfalls

1. **JSON Column Abuse for Custom Fields** — Using a single JSONB column for all custom field data makes querying impossible and indexing a nightmare. **Avoid by:** Using EAV pattern with typed value columns (value_number, value_text, value_date) and proper foreign keys.

2. **Formula Engine Security (eval())** — Using `eval()` or `new Function()` for formula evaluation allows arbitrary code execution. **Avoid by:** Building AST-based evaluator with whitelisted functions only, execution timeout, and recursion limits.

3. **Kanban N+1 Query Pattern** — Loading kanban with lazy-loading ORM queries triggers 500+ queries for one page. **Avoid by:** Single query with aggregation, batch-loading related data, cursor pagination for large pipelines.

4. **Missing Soft Delete Strategy** — Hard deletes break historical reports and audit trails. **Avoid by:** Adding `deleted_at` timestamp to all entities from day one, default scopes exclude deleted records.

5. **API-Frontend Coupling** — API endpoints returning UI-specific shapes make third-party integrations impossible. **Avoid by:** Resource-oriented API design from data model, API contract tests without frontend imports.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation & Core Entities
**Rationale:** Database schema, auth, and core entities must exist before anything else. Soft delete pattern must be established here—adding later requires data migration and query updates.
**Delivers:** Working authentication, core CRUD for organizations, people, pipelines, stages, deals, activities
**Addresses:** Table stakes features — Organizations, People, Deals, Pipelines, Activities, Users/Auth, Search
**Avoids:** Pitfall #4 (soft delete missing), Pitfall #3 (N+1 queries in lists)

### Phase 2: Kanban & Pipeline Views
**Rationale:** Kanban is the signature feature and primary UI. Must be designed for scale from day one.
**Delivers:** Visual pipeline management with drag-drop, deal counts per stage, value totals
**Uses:** React Client Components for interactivity, TanStack Query for optimistic updates
**Avoids:** Pitfall #3 (N+1 queries) — single query with aggregation, batch loads, cursor pagination

### Phase 3: Custom Fields & Formulas
**Rationale:** Key differentiator. Requires EAV data model and safe formula evaluation engine—both complex enough to warrant dedicated phase.
**Delivers:** User-defined fields on entities, formula fields that calculate from other values
**Implements:** EAV pattern with typed columns, AST-based formula parser, safe evaluator
**Avoids:** Pitfall #1 (JSONB abuse), Pitfall #2 (eval security)

### Phase 4: REST API & Polish
**Rationale:** External API enables integrations—core value proposition of self-hostable CRM. Polish ensures production readiness.
**Delivers:** Versioned REST API with auth, rate limiting, documentation; UI polish (inline edit, keyboard nav)
**Uses:** Zod for validation, shared types between API and internal
**Avoids:** Pitfall #5 (API coupling) — resource-oriented design, contract tests

### Phase 5: Import/Export & Final Polish
**Rationale:** Data migration is required for adoption. Import is complex (field mapping, duplicate detection, partial failure handling).
**Delivers:** CSV import/export with preview, validation, rollback on failure
**Addresses:** Remaining table stakes

### Phase Ordering Rationale

- **Auth first:** Everything depends on user context and permissions
- **Entities before views:** Kanban needs deals, deals need pipelines and organizations
- **Custom fields after entities:** Can't add fields to entities that don't exist
- **API last:** API contracts are easier to define when entities and business logic are stable
- **Soft delete in Phase 1:** Adding later requires full data migration and updating every query

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Custom Fields):** Formula parser implementation is specialized—consider using `expr-eval` or `jsep` library vs custom implementation
- **Phase 3 (Formulas):** Security review needed for AST evaluator—penetration testing for formula injection

Phases with standard patterns (skip research-phase):
- **Phase 1 (Core Entities):** Standard CRUD patterns, well-documented Drizzle ORM usage
- **Phase 2 (Kanban):** Established drag-drop patterns with dnd-kit, standard React patterns
- **Phase 4 (REST API):** Standard Next.js API routes, well-documented patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies are mature with stable versions; Next.js 16, Drizzle 1.0, Auth.js 5.x all production-ready |
| Features | HIGH | Clear CRM domain patterns; competitor analysis (Twenty, Monica, SuiteCRM, EspoCRM) confirms table stakes |
| Architecture | HIGH | Layered architecture with service pattern is well-established; EAV for custom fields is proven pattern |
| Pitfalls | HIGH | Pitfalls are domain-standard; recovery strategies documented from real-world issues |

**Overall confidence:** HIGH

### Gaps to Address

- **Formula parser implementation choice:** Research whether to use existing library (expr-eval, jsep) or build custom. Custom gives more control but more maintenance. Decision needed during Phase 3 planning.
- **File upload strategy:** Noted as future feature but storage abstraction (local vs S3/MinIO) should be decided in Phase 1 to avoid refactoring.
- **tRPC vs Server Actions:** Architecture shows both; need to decide primary pattern during Phase 1. tRPC for type safety vs Server Actions for simplicity.

## Sources

### Primary (HIGH confidence)
- **Next.js Blog** — nextjs.org/blog — Version 16.1 features, Turbopack stability
- **Drizzle ORM Docs** — orm.drizzle.team/docs/overview — v1.0 stable, SQL-like TypeScript ORM
- **Auth.js Docs** — authjs.dev/getting-started — v5 with database sessions, Drizzle adapter
- **shadcn/ui Docs** — ui.shadcn.com/docs — Component patterns for data tables, forms

### Secondary (MEDIUM confidence)
- **Twenty CRM** — github.com/twentyhq/twenty (40k stars) — Modern open-source CRM reference
- **Monica** — github.com/monicahq/monica (24k stars) — Personal CRM patterns
- **SuiteCRM** — github.com/SuiteCRM/SuiteCRM — Enterprise CRM feature comparison
- **Prisma Docs** — prisma.io/docs/orm — v7 comparison for Drizzle decision

### Tertiary (Context)
- **PostgreSQL 18 Documentation** — JSON types, full-text search, indexing strategies
- **Vercel Knowledge Base** — Next.js + Postgres deployment patterns
- **Reddit r/selfhosted** — CRM discussions and user needs

---
*Research completed: 2026-02-22*
*Ready for roadmap: yes*
