# Stack Research

**Domain:** Self-hostable CRM (Pipedrive-inspired)
**Researched:** 2026-02-22
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.1+ | Full-stack framework | App Router with React Server Components, Turbopack (stable), built-in API routes, optimized for self-hosting with improved standalone output |
| TypeScript | 5.7+ | Type safety | Required by Zod 4, best-in-class developer experience, catches errors at compile time |
| PostgreSQL | 16+ | Primary database | Industry standard, excellent for relational CRM data, supports JSONB for flexible custom fields, full-text search built-in |
| Redis | 7.x | Caching & sessions | Session storage, query caching, rate limiting, pub/sub for real-time features |
| Drizzle ORM | 1.0+ | Database ORM | SQL-like API gives full control for complex CRM queries, lightweight (0 deps), TypeScript-first, better for self-hosting than Prisma's heavy client generation |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 4.x | Schema validation | API input validation, form validation, type inference from schemas |
| Auth.js | 5.x (next-auth) | Authentication | Credentials-based auth for self-hosted, supports database sessions with Drizzle adapter |
| ioredis | 5.x | Redis client | TypeScript-first, cluster support, Lua scripting for atomic operations |
| Tailwind CSS | 4.x | Styling | CSS-first configuration, automatic content detection, P3 color support |
| shadcn/ui | Latest | UI components | Not a library — copy/paste components you own, Radix primitives for accessibility, perfect for CRM data tables and forms |
| React Hook Form | 7.x | Form handling | Performant forms, Zod resolver integration, minimal re-renders |
| TanStack Query | 5.x | Server state | Caching, optimistic updates, perfect for CRM list/detail views |
| date-fns | 3.x | Date manipulation | Tree-shakeable, immutable, better than moment.js for bundle size |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest | Testing framework | Vite-native, faster than Jest, built-in coverage, TypeScript support |
| Playwright | E2E testing | For critical user flows (deal creation, pipeline movement) |
| Docker | Containerization | Multi-stage builds, standalone Next.js output |
| Biome | Linting/formatting | Faster than ESLint+Prettier, unified tool |

## Installation

```bash
# Core
npm install next@16 react@19 react-dom@19 typescript@5.7

# Database
npm install drizzle-orm postgres
npm install -D drizzle-kit

# Redis
npm install ioredis

# Auth
npm install next-auth@5 @auth/drizzle-adapter

# Validation
npm install zod

# UI
npm install tailwindcss @tailwindcss/postcss
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select
npm install class-variance-authority clsx tailwind-merge
npm install lucide-react

# Forms
npm install react-hook-form @hookform/resolvers

# Server state
npm install @tanstack/react-query

# Dates
npm install date-fns

# Dev dependencies
npm install -D vitest @vitest/coverage-v8
npm install -D @playwright/test
npm install -D @types/node
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Drizzle ORM | Prisma | When you need visual schema editor (Prisma Studio), more mature migrations, or prefer abstracted query API over SQL-like |
| Drizzle ORM | Kysely | When you want raw SQL with type safety but no schema management |
| ioredis | node-redis | When starting fresh and want official Redis-maintained client (but TypeScript DX is worse) |
| Auth.js | Better Auth | When you want the newer, more actively developed option (Auth.js joined Better Auth in 2026) |
| Auth.js | Lucia | When you need simpler, lighter auth without OAuth complexity |
| shadcn/ui | MUI | When you want a traditional component library with pre-built complex components |
| shadcn/ui | Chakra UI | When your team prefers styled-system approach over Tailwind |
| Vitest | Jest | When you have existing Jest setup or need specific Jest ecosystem plugins |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| TypeORM | Decorator-heavy, complex migrations, active record pattern leads to issues | Drizzle ORM |
| Sequelize | Legacy API, poor TypeScript support, magic methods | Drizzle ORM |
| Express.js (separate) | Next.js has built-in API routes, no need for separate server | Next.js API Routes |
| Redux | Overkill for server-side rendered Next.js, React Query handles server state | TanStack Query + React Context |
| moment.js | Large bundle size, mutable API | date-fns |
| Prisma (for this project) | Heavy client generation (not ideal for self-hosted), less SQL control | Drizzle ORM |
| Axios | Next.js has built-in fetch, adds unnecessary dependency | native fetch |

## Stack Patterns by Variant

**If you need real-time features (live pipeline updates):**
- Use Socket.io or Pusher for WebSocket connections
- Redis pub/sub for scaling across instances
- Because single-tenant CRM may not need this at 50 users

**If you need background jobs:**
- Use BullMQ with Redis for job queues
- For things like email reminders, report generation
- Because API-first design means heavy work can be external

**If you need file uploads:**
- Use S3-compatible storage (MinIO for self-hosted)
- Uploadthing or similar for managed option
- Because CRM needs file attachments on deals/activities

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| next@16 | react@19 | Next.js 16 requires React 19.2+ |
| drizzle-orm@1 | postgres@3 | Use postgres.js driver, not pg |
| zod@4 | typescript@5.5+ | Requires strict mode enabled |
| auth.js@5 | next@14+ | Works with App Router |
| tailwind@4 | @tailwindcss/postcss | New CSS-first configuration |

## Key Architecture Decisions

### Why Drizzle over Prisma for CRM

1. **SQL control**: Complex CRM queries (deals with activities, custom fields, organizations) benefit from SQL-like API
2. **Lightweight**: No heavy client generation, better for self-hosted Docker images
3. **Migrations**: Drizzle Kit handles schema migrations well enough
4. **Performance**: Direct SQL execution without ORM overhead

### Why Auth.js for Self-Hosted

1. **Database sessions**: Store sessions in PostgreSQL (via Drizzle adapter)
2. **Credentials provider**: Username/password auth for self-hosted deployments
3. **No external dependencies**: Doesn't require OAuth providers
4. **Single-tenant friendly**: No multi-tenancy complexity

### Why shadcn/ui for CRM UI

1. **Data tables**: Perfect for CRM list views with sorting, filtering, pagination
2. **Forms**: Composable form components work well with React Hook Form
3. **You own the code**: Customize for CRM-specific needs (kanban cards, pipeline stages)
4. **Accessibility**: Radix primitives ensure keyboard navigation and screen reader support

## Sources

- [Next.js Blog](https://nextjs.org/blog) — Current version: 16.1 (Dec 2025)
- [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview) — v1.0 stable, SQL-like TypeScript ORM
- [Prisma Docs](https://www.prisma.io/docs/orm) — v7, compared for decision
- [Zod Docs](https://zod.dev/) — v4 stable, TypeScript-first validation
- [Auth.js Docs](https://authjs.dev/getting-started) — v5, now part of Better Auth
- [ioredis GitHub](https://github.com/redis/ioredis) — v5, robust Redis client
- [Vitest Docs](https://vitest.dev/guide/) — v4, Vite-native testing
- [shadcn/ui Docs](https://ui.shadcn.com/docs) — Component distribution, not a library
- [Tailwind CSS Blog](https://tailwindcss.com/blog/tailwindcss-v4) — v4.0 (Jan 2025)

---
*Stack research for: Self-hostable CRM with PostgreSQL, Next.js, Redis, TypeScript*
*Researched: 2026-02-22*
