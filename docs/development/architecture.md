# System Architecture

This document provides a comprehensive overview of Pipelite's architecture, core systems, and key implementation patterns.

## Overview

Pipelite is a **monolithic Next.js application** built with the following architectural principles:

- **Server-First**: Server Components for data fetching, Client Components only when needed
- **Type-Safe**: TypeScript strict mode throughout with Drizzle ORM for database operations
- **API-Complete**: Full REST API for external integrations alongside the web UI
- **Self-Hostable**: Container-deployable with PostgreSQL as the primary data store

### High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        Browser[Browser]
    end

    subgraph "Next.js Application"
        SC[Server Components]
        CC[Client Components]
        Actions[Server Actions]
        API[REST API Routes]
    end

    subgraph "Data Layer"
        DB[(PostgreSQL)]
        Redis[(Redis - Optional)]
    end

    subgraph "External"
        External[External Services]
    end

    Browser --> SC
    Browser --> CC
    SC --> DB
    SC --> Actions
    Actions --> DB
    Actions --> Redis
    CC --> Actions
    External --> API
    API --> Actions
    API --> Redis
```

### Core Systems

**Authentication System** is based on Auth.js (NextAuth.js v5) with JWT strategy and Credentials provider, email verification, and admin approval workflow.

- **Auth Flow**: Signup -> Email Verification -> Pending Approval -> Admin Approval -> Login
- **Auth Components**:
  - `src/app/(auth)/signup/page.tsx`: Registration form
  - `src/app/(auth)/verify/page.tsx`: Email verification handler
  - `src/app/(auth)/login/page.tsx`: Login form with "Remember Me" checkbox
  - `src/lib/auth.ts`: Auth helpers, password hashing, API key validation

**Entity System**

Core entities (Users, Organizations, People, Deals, Activities) follow a consistent ownership model where each entity has an `ownerId` foreign key pointing to the user who created it. All entities support custom fields through JSONB columns and soft delete via `deletedAt` timestamps. Gap-based positioning is used for ordering items (e.g., deals in kanban, stages in pipelines).

**Custom Fields System**

- Field definitions stored separately from values
- Values stored as JSONB columns per entity
- Multiple field types (text, number, date, boolean, select, file, URL, lookup, formula)
- Formula evaluation uses QuickJS sandbox for secure execution
- **Key Components:**
  - FieldTypeComponent: Maps field type to component
  - ValueRenderer: Updates JSONB, re-renders formula result in UI

**Search & Filtering System**

Global search across entities with debounced input, server-side filtering with URL params, and `?` keyboard shortcut for help.

**Localization System**

next-intl integration with cookie-based locale selection and user preferences stored in database. ICU message format with three supported locales: en-US, pt-BR, es-ES.

**Keyboard Navigation**

react-hotkeys-hook integration with global shortcuts (Alt+1/2/3/4, /, ?), table navigation (j/k/arrow keys), and kanban navigation (h/j/k/l for 2D navigation).

### Key Patterns

#### Server Actions Pattern

Server actions follow a consistent pattern for data mutations:

```typescript
"use server"
export async function createEntity(formData: FormData) {
  // 1. Validate input
  const name = formData.get("name") as string;
  if (!name?.trim()) {
    return { success: false, error: "Name is required" };
  }

  // 2. Get current user
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // 3. Create entity with owner
  const [org] = await db.insert(organizations)
    .values({
      id: crypto.randomUUID(),
      name: name.trim(),
      ownerId: user.id
    })
    .returning();

  // 4. Revalidate cache
  revalidatePath("/organizations");

  // 5. Return success with ID
  return { success: true, id: org.id };
}
```

This pattern ensures consistency and makes actions predictable and easy to test.

#### Custom Field Rendering Pattern

Custom fields use dynamic component rendering based on field type:

```typescript
// Dynamic field type component rendering
{fields.map(field => {
  const Component = getFieldTypeComponent(field.type);
  return <Component key={field.id} field={field} />;
})}
```

#### Return Object Pattern

All actions return a consistent response object:

```typescript
// Consistent action response
return { success: boolean, error?: string, id?: string }
```

When returning `{ success: false, error: "..." }`, always include an error message suitable for display in the UI.

### Data Flow Examples

**1. Creating a Deal**

1. User fills form in DealDialog (client component)
2. Form submits to createDeal server action
3. Action validates, creates in DB with owner
4. Action revalidates /deals path
5. Server component refetches deals
6. Kanban board shows new deal

**2. Formula Evaluation**

1. User edits field value
2. Component updates JSONB in form state
3. On save, formula engine runs
4. QuickJS executes formula in sandbox
5. Result stored in JSONB with formula
6. UI displays cached result

### Key Files

| File/Directory | Purpose |
|----------------|---------|
| `src/db/schema/*.ts` | Database models |
| `src/db/schema/_relations.ts` | Entity relationships |
| `src/app/(auth)/*` | Auth pages |
| `src/app/api/v1/*` | REST API |
| `src/lib/formula-engine.ts` | Formula evaluation |
| `src/lib/import/*` | CSV import |
| `src/lib/api/*` | API utilities |
| `src/components/custom-fields/*` | Field components |
| `src/hooks/use-hotkeys.ts` | Keyboard system |
| `drizzle/` | Migrations |

## Next Steps

- Review the [Database Schema](./database.md) for detailed entity relationships and table structures
- Continue with [Contributing Guide](./contributing.md) for development workflow and PR submission process
- See the [Code Style Guide](./code-style.md) for coding conventions and patterns
- See the [Testing Guide](./testing.md) for testing instructions

---

*Last updated: 2026-03-04*
