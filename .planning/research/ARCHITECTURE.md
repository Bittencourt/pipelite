# Architecture Research

**Domain:** Self-hostable CRM (Pipedrive-inspired)
**Researched:** 2026-02-22
**Confidence:** HIGH (based on well-established Next.js patterns, Drizzle ORM docs, and CRM domain knowledge)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Kanban     │  │   Tables     │  │   Forms      │  │   Dashboard  │    │
│  │   Views      │  │   Views      │  │   (RSC)      │  │   Widgets    │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                 │             │
│  ┌──────┴─────────────────┴─────────────────┴─────────────────┴──────┐     │
│  │                     React Client Components                        │     │
│  │              (Server Actions + tRPC Client)                        │     │
│  └────────────────────────────────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────────────────────────────┤
│                              API LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Next.js App Router                               │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │   │
│  │  │  /api/rest/*    │  │  Server Actions │  │  tRPC Routes        │  │   │
│  │  │  (External API) │  │  (Form Actions) │  │  (Internal API)     │  │   │
│  │  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │   │
│  └───────────┼─────────────────────┼─────────────────────┼─────────────┘   │
│              │                     │                     │                  │
├──────────────┴─────────────────────┴─────────────────────┴──────────────────┤
│                            SERVICE LAYER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────────┐    │
│  │  Pipeline  │  │   Deal     │  │  Custom    │  │    Formula         │    │
│  │  Service   │  │  Service   │  │  Fields    │  │    Evaluator       │    │
│  └──────┬─────┘  └──────┬─────┘  │  Service   │  │                    │    │
│         │               │        └──────┬─────┘  └─────────┬──────────┘    │
│         │               │               │                  │                │
│  ┌──────┴───────────────┴───────────────┴──────────────────┴──────────────┐ │
│  │                        Validation Layer (Zod)                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│                            DATA LAYER                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Drizzle ORM + PostgreSQL                          │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │   │
│  │  │ Entities │  │ Relations│  │Migrations│  │   Custom Field       │ │   │
│  │  │ Schema   │  │          │  │          │  │   Value Storage      │ │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌────────────────────┐              ┌────────────────────┐                  │
│  │      Redis         │              │   File Storage     │                  │
│  │   (Cache/Queue)    │              │   (Local/S3)       │                  │
│  └────────────────────┘              └────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Presentation Layer** | UI rendering, user interactions, optimistic updates | React Server Components + Client Components |
| **API Layer** | Request routing, authentication, rate limiting | Next.js Route Handlers + Server Actions |
| **Service Layer** | Business logic, validation, orchestration | TypeScript service classes |
| **Formula Evaluator** | Parse and evaluate custom field formulas | Expression parser + safe evaluator |
| **Custom Fields Service** | Manage field definitions and typed values | Polymorphic storage pattern |
| **Data Layer** | Persistence, queries, transactions | Drizzle ORM + PostgreSQL |
| **Cache Layer** | Session, query cache, job queues | Redis |

## Recommended Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── (dashboard)/              # Dashboard layout group
│   │   ├── pipelines/
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx      # Pipeline detail view
│   │   │   │   └── deals/
│   │   │   │       └── page.tsx  # Deal list for pipeline
│   │   │   └── page.tsx          # Pipeline list
│   │   ├── organizations/
│   │   ├── people/
│   │   ├── deals/
│   │   └── activities/
│   ├── (auth)/                   # Auth layout group
│   │   ├── login/
│   │   └── setup/                # Initial setup wizard
│   ├── api/                      # API routes
│   │   ├── rest/                 # External REST API
│   │   │   ├── v1/
│   │   │   │   ├── pipelines/
│   │   │   │   │   └── route.ts
│   │   │   │   ├── deals/
│   │   │   │   ├── organizations/
│   │   │   │   ├── people/
│   │   │   │   └── activities/
│   │   │   └── trpc/             # tRPC for internal use
│   │   │       └── [trpc]/
│   │   │           └── route.ts
│   │   └── webhooks/             # Future: external integrations
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home/dashboard
│
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── pipeline/                 # Pipeline-specific components
│   │   ├── kanban-board.tsx
│   │   ├── deal-card.tsx
│   │   └── stage-column.tsx
│   ├── forms/                    # Form components
│   │   ├── dynamic-form.tsx      # Renders forms from schema
│   │   └── custom-field-input.tsx
│   ├── tables/                   # Data tables
│   │   ├── data-table.tsx
│   │   └── filter-bar.tsx
│   └── layout/                   # Layout components
│       ├── sidebar.tsx
│       └── header.tsx
│
├── lib/
│   ├── db/                       # Database layer
│   │   ├── schema/               # Drizzle schema definitions
│   │   │   ├── users.ts
│   │   │   ├── pipelines.ts
│   │   │   ├── deals.ts
│   │   │   ├── organizations.ts
│   │   │   ├── people.ts
│   │   │   ├── activities.ts
│   │   │   ├── custom-fields.ts
│   │   │   └── index.ts          # Export all schemas
│   │   ├── migrations/           # Generated migrations
│   │   ├── index.ts              # Drizzle client
│   │   └── relations.ts          # Relation definitions
│   │
│   ├── api/                      # API utilities
│   │   ├── rest/                 # REST API handlers
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   └── rate-limit.ts
│   │   │   └── serializers/      # Response formatters
│   │   └── trpc/                 # tRPC setup
│   │       ├── router.ts
│   │       ├── context.ts
│   │       └── routers/
│   │           ├── pipelines.ts
│   │           ├── deals.ts
│   │           └── custom-fields.ts
│   │
│   ├── services/                 # Business logic
│   │   ├── pipeline.service.ts
│   │   ├── deal.service.ts
│   │   ├── organization.service.ts
│   │   ├── person.service.ts
│   │   ├── activity.service.ts
│   │   └── custom-fields/
│   │       ├── field.service.ts
│   │       ├── value.service.ts
│   │       └── formula.service.ts
│   │
│   ├── formulas/                 # Formula evaluation engine
│   │   ├── parser.ts             # Formula parser
│   │   ├── evaluator.ts          # Safe evaluator
│   │   ├── functions/            # Built-in functions
│   │   │   ├── date.ts
│   │   │   ├── math.ts
│   │   │   └── text.ts
│   │   └── types.ts
│   │
│   ├── auth/                     # Authentication
│   │   ├── session.ts
│   │   └── permissions.ts
│   │
│   └── utils/                    # Shared utilities
│       ├── validation.ts
│       └── pagination.ts
│
├── types/                        # TypeScript types
│   ├── api.ts                    # API types
│   ├── entities.ts               # Entity types
│   └── custom-fields.ts          # Custom field types
│
└── hooks/                        # React hooks
    ├── use-pipeline.ts
    ├── use-deal.ts
    └── use-custom-fields.ts
```

### Structure Rationale

- **`app/(dashboard)/`**: Layout group for authenticated pages, shares sidebar/header
- **`app/(auth)/`**: Separate layout for unauthenticated flows
- **`app/api/rest/v1/`**: Versioned REST API for external consumers
- **`app/api/trpc/`**: tRPC for internal frontend-backend communication
- **`lib/db/schema/`**: Separate files per entity for maintainability
- **`lib/services/`**: Business logic separate from API routes (testable, reusable)
- **`lib/formulas/`**: Isolated formula engine for safety and testability

## Architectural Patterns

### Pattern 1: Repository/Service Pattern

**What:** Separate data access (Drizzle queries) from business logic (services)

**When to use:** Always. Keeps API routes thin and logic testable.

**Trade-offs:** More boilerplate, but better testability and separation of concerns

```typescript
// lib/services/deal.service.ts
import { db } from '@/lib/db';
import { deals, customFieldValues } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export class DealService {
  async getById(id: string, userId: string) {
    const deal = await db.query.deals.findFirst({
      where: and(eq(deals.id, id), eq(deals.ownerId, userId)),
      with: {
        organization: true,
        person: true,
        activities: true,
      },
    });
    
    if (!deal) return null;
    
    // Attach custom field values
    const fieldValues = await this.getCustomFieldValues(id);
    return { ...deal, customFields: fieldValues };
  }
  
  async create(data: CreateDealInput, userId: string) {
    return db.transaction(async (tx) => {
      const [deal] = await tx.insert(deals).values({
        ...data,
        ownerId: userId,
      }).returning();
      
      // Create custom field values
      if (data.customFields) {
        await this.upsertCustomFieldValues(tx, deal.id, data.customFields);
      }
      
      return deal;
    });
  }
}
```

### Pattern 2: Custom Fields - Entity-Attribute-Value (EAV) Pattern

**What:** Store custom field definitions separately from values, with typed value columns

**When to use:** For flexible, user-defined fields on entities

**Trade-offs:** More complex queries, but maximum flexibility without schema migrations

```typescript
// lib/db/schema/custom-fields.ts
import { pgTable, uuid, varchar, integer, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

// Field definitions (created once per field)
export const customFields = pgTable('custom_fields', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: varchar('entity_type', { length: 50 }).notNull(), // 'deal', 'organization', etc.
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  fieldType: varchar('field_type', { length: 30 }).notNull(), // 'text', 'number', 'date', etc.
  config: jsonb('config').$type<FieldConfig>(), // options for selects, validation rules
  formula: text('formula'), // For formula fields
  order: integer('order').default(0),
  required: integer('required').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// Field values (one row per entity-field combination)
export const customFieldValues = pgTable('custom_field_values', {
  id: uuid('id').primaryKey().defaultRandom(),
  fieldId: uuid('field_id').notNull().references(() => customFields.id),
  entityId: uuid('entity_id').notNull(), // Polymorphic - deal_id, org_id, etc.
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  
  // Typed value columns (only one populated per row)
  valueText: text('value_text'),
  valueNumber: integer('value_number'),
  valueBoolean: integer('value_boolean'),
  valueDate: timestamp('value_date'),
  valueJson: jsonb('value_json'), // For multi-select, objects
  valueFileIds: jsonb('value_file_ids').$type<string[]>(), // File references
  
  // Computed value for formula fields (cached)
  computedValue: text('computed_value'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Type definitions
type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'single_select' 
  | 'multi_select' | 'file' | 'lookup' | 'formula' | 'link';

interface FieldConfig {
  options?: { label: string; value: string }[]; // For selects
  validation?: { min?: number; max?: number; pattern?: string };
  lookupEntity?: string; // For lookup fields
  formula?: string; // For formula fields
}
```

### Pattern 3: Formula Evaluation with AST

**What:** Parse formulas into an AST, then safely evaluate with a restricted context

**When to use:** Formula fields that reference other fields, dates, or functions

**Trade-offs:** Complex to implement, but safer than eval() and more maintainable

```typescript
// lib/formulas/parser.ts
import { z } from 'zod';

export interface FormulaNode {
  type: 'literal' | 'field_ref' | 'function_call' | 'binary_op';
  value?: string | number | boolean;
  field?: string; // e.g., 'deal_value', 'created_at'
  operator?: '+' | '-' | '*' | '/' | '&&' | '||' | '==' | '>' | '<';
  functionName?: string;
  args?: FormulaNode[];
}

export class FormulaParser {
  private tokens: string[];
  private pos = 0;
  
  constructor(formula: string) {
    this.tokens = this.tokenize(formula);
  }
  
  parse(): FormulaNode {
    return this.parseExpression();
  }
  
  private tokenize(formula: string): string[] {
    // Split into tokens: identifiers, numbers, operators, parentheses
    const regex = /([a-zA-Z_][a-zA-Z0-9_]*)|(\d+\.?\d*)|([+\-*/()=<>!&|,])|("(?:[^"\\]|\\.)*")/g;
    return formula.match(regex) || [];
  }
  
  private parseExpression(): FormulaNode {
    // Parse with operator precedence
    // ... implementation details
  }
}

// lib/formulas/evaluator.ts
export class FormulaEvaluator {
  private allowedFunctions = {
    // Date functions
    NOW: () => new Date(),
    DATE_ADD: (date: Date, days: number) => new Date(date.getTime() + days * 86400000),
    DATEDIF: (start: Date, end: Date) => Math.floor((end.getTime() - start.getTime()) / 86400000),
    
    // Math functions
    SUM: (...nums: number[]) => nums.reduce((a, b) => a + b, 0),
    ROUND: (num: number, decimals: number = 0) => Number(num.toFixed(decimals)),
    ABS: Math.abs,
    
    // Text functions
    CONCAT: (...texts: string[]) => texts.join(''),
    UPPER: (text: string) => text.toUpperCase(),
    LOWER: (text: string) => text.toLowerCase(),
    
    // Conditional
    IF: (condition: boolean, trueVal: any, falseVal: any) => condition ? trueVal : falseVal,
  };
  
  evaluate(ast: FormulaNode, context: Record<string, any>): any {
    switch (ast.type) {
      case 'literal':
        return ast.value;
        
      case 'field_ref':
        return this.resolveField(ast.field!, context);
        
      case 'binary_op':
        return this.evaluateBinaryOp(ast, context);
        
      case 'function_call':
        return this.evaluateFunction(ast, context);
    }
  }
  
  private resolveField(field: string, context: Record<string, any>): any {
    // Support dot notation: 'deal.value', 'organization.name'
    const parts = field.split('.');
    let value = context;
    for (const part of parts) {
      value = value?.[part];
    }
    return value;
  }
  
  private evaluateFunction(ast: FormulaNode, context: Record<string, any>): any {
    const fn = this.allowedFunctions[ast.functionName!];
    if (!fn) {
      throw new Error(`Unknown function: ${ast.functionName}`);
    }
    
    const args = ast.args!.map(arg => this.evaluate(arg, context));
    return fn(...args);
  }
}
```

### Pattern 4: API-First with Shared Types

**What:** Define types once, share between REST API and tRPC

**When to use:** When you need both external REST API and internal tRPC

**Trade-offs:** Slight complexity, but DRY and consistent

```typescript
// types/api.ts
import { z } from 'zod';

// Shared input schemas
export const DealCreateSchema = z.object({
  title: z.string().min(1).max(255),
  value: z.number().positive().optional(),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  personId: z.string().uuid().optional(),
  expectedCloseDate: z.coerce.date().optional(),
  customFields: z.record(z.string(), z.any()).optional(),
});

export const DealUpdateSchema = DealCreateSchema.partial();

export const DealResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  value: z.number().nullable(),
  // ... other fields
  customFields: z.record(z.string(), z.any()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Types derived from schemas
export type DealCreateInput = z.infer<typeof DealCreateSchema>;
export type DealUpdateInput = z.infer<typeof DealUpdateSchema>;
export type DealResponse = z.infer<typeof DealResponseSchema>;
```

## Data Flow

### Request Flow

```
[User Action: Create Deal]
         ↓
┌────────────────────────────────────────────────────────────────┐
│ [Client Component]                                              │
│  form.handleSubmit() → Server Action call                       │
└────────────────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────────────────┐
│ [Server Action]                                                 │
│  1. Validate input with Zod                                     │
│  2. Check user permissions                                      │
│  3. Call DealService.create()                                   │
└────────────────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────────────────┐
│ [DealService]                                                   │
│  1. Start transaction                                           │
│  2. Insert deal record                                          │
│  3. Upsert custom field values                                  │
│  4. Evaluate formula fields                                     │
│  5. Commit transaction                                          │
│  6. Return deal with relations                                  │
└────────────────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────────────────┐
│ [Drizzle ORM]                                                   │
│  1. Generate SQL queries                                        │
│  2. Execute against PostgreSQL                                  │
│  3. Map results to TypeScript types                             │
└────────────────────────────────────────────────────────────────┘
         ↓
[Response: Created Deal object]
         ↓
[Client: Optimistic update + revalidation]
```

### Custom Field Value Flow

```
[Deal with Custom Fields]
         ↓
┌────────────────────────────────────────────────────────────────┐
│ [CustomFieldService]                                            │
│  1. Fetch field definitions for 'deal' entity                   │
│  2. Fetch field values for this deal                            │
│  3. Merge definitions with values                               │
│  4. Evaluate formula fields                                     │
│  5. Return typed field map                                      │
└────────────────────────────────────────────────────────────────┘
         ↓
{
  'deal_value': { type: 'number', value: 50000 },
  'contract_type': { type: 'single_select', value: 'annual' },
  'commission': { type: 'formula', value: 5000, formula: 'deal_value * 0.1' }
}
```

### Key Data Flows

1. **Entity CRUD with Custom Fields:**
   - Fetch entity → Fetch field definitions → Fetch field values → Merge → Evaluate formulas → Return

2. **Pipeline Kanban View:**
   - Fetch pipeline with stages → For each stage, fetch deals with counts → Pre-compute custom field filters → Return grouped data

3. **API Request (REST):**
   - Authenticate via API key/session → Validate input → Route to service → Serialize response → Return JSON

4. **Formula Field Update:**
   - Detect dependent fields → Re-evaluate in dependency order → Cache computed values → Update display

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-50 users (current target) | Single Next.js instance, single PostgreSQL, Redis for sessions |
| 50-500 users | Add read replicas for PostgreSQL, enable query caching, optimize indexes |
| 500+ users | Consider microservices split (formula evaluation as separate service), horizontal scaling |

### Scaling Priorities

1. **First bottleneck: Database queries**
   - What breaks: Slow pipeline views with many deals
   - How to fix: Add proper indexes on frequently filtered fields, materialized views for aggregations

2. **Second bottleneck: Custom field queries**
   - What breaks: EAV pattern becomes slow with many fields
   - How to fix: Denormalize frequently-used custom fields into main tables, add composite indexes

3. **Third bottleneck: Formula evaluation**
   - What breaks: Complex formulas slow down list views
   - How to fix: Cache computed values, background recalculation, pre-compute on write

## Anti-Patterns

### Anti-Pattern 1: Using eval() for Formulas

**What people do:** `eval(formulaString)` to evaluate custom field formulas

**Why it's wrong:** Major security vulnerability - users could execute arbitrary code

**Do this instead:** Build a safe AST-based evaluator with whitelisted functions only

### Anti-Pattern 2: JSON Column for All Custom Fields

**What people do:** Store all custom field values in a single JSONB column on the entity

**Why it's wrong:** Can't index or query efficiently, can't enforce types, migrations are painful

**Do this instead:** Use EAV pattern with typed value columns for queryable fields

### Anti-Pattern 3: Fat API Routes

**What people do:** Put all business logic in route handlers

**Why it's wrong:** Routes become untestable, logic is duplicated between REST and Server Actions

**Do this instead:** Thin routes that call service methods, services contain all business logic

### Anti-Pattern 4: Fetching N+1 Custom Fields

**What people do:** Query custom field values one entity at a time in a loop

**Why it's wrong:** Creates O(n) queries, severely impacts performance on list views

**Do this instead:** Batch fetch all field values with `WHERE entity_id IN (...)`, then group in memory

### Anti-Pattern 5: Client-Side Formula Evaluation

**What people do:** Evaluate formulas in the browser

**Why it's wrong:** Security (exposes formula logic), inconsistency (different results), no audit trail

**Do this instead:** Always evaluate on server, cache results if needed

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| PostgreSQL | Drizzle ORM connection pool | Use connection pooling for production |
| Redis | ioredis client | For sessions, caching, job queues |
| File Storage | Abstract storage interface | Start with local filesystem, swap to S3 later |
| Email (future) | SMTP or API | Out of scope for MVP, API allows external tools |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Presentation ↔ API | Server Actions / tRPC | Type-safe, no HTTP overhead for internal |
| API ↔ Services | Direct method calls | Services are plain TypeScript classes |
| Services ↔ Data Layer | Drizzle ORM | Transactions, relations handled by Drizzle |
| Formula Engine ↔ Services | Dependency injection | Pass context to evaluator, no direct DB access |

## Build Order Implications

Based on the architecture, here's the recommended build order with dependencies:

### Phase 1: Foundation (No dependencies)
1. **Database Schema Setup**
   - Core entities (users, pipelines, stages)
   - Drizzle configuration and migrations
   - Basic seed data

2. **Authentication**
   - Session management
   - User model and auth middleware
   - Basic role system (admin/member)

### Phase 2: Core Entities (Depends on Phase 1)
3. **Organizations & People**
   - CRUD operations
   - Basic list/detail views
   - Services and validation

4. **Pipelines & Stages**
   - Pipeline management
   - Stage ordering
   - Pipeline settings

### Phase 3: Deals & Activities (Depends on Phase 2)
5. **Deals**
   - Deal CRUD with pipeline context
   - Stage movement
   - Relations to orgs/people

6. **Activities**
   - Activity CRUD linked to deals
   - Activity types
   - Due dates and completion

### Phase 4: Custom Fields (Depends on Phase 3)
7. **Custom Fields Infrastructure**
   - Field definition schema
   - Value storage (EAV)
   - Basic field types (text, number, date, select)

8. **Formula Fields**
   - Formula parser
   - Safe evaluator
   - Built-in functions
   - Dependency tracking

### Phase 5: API & Polish (Depends on Phase 4)
9. **REST API**
   - Versioned endpoints
   - Authentication (API keys)
   - Rate limiting
   - OpenAPI documentation

10. **UI Polish & Optimization**
    - Kanban drag-and-drop
    - Search and filtering
    - Performance optimization
    - Caching strategy

## Sources

- Drizzle ORM documentation: https://orm.drizzle.team/docs/overview (HIGH confidence)
- tRPC documentation: https://trpc.io/docs/quickstart (HIGH confidence)
- Full-stack FastAPI template (architecture reference): https://github.com/fastapi/full-stack-fastapi-template (MEDIUM confidence - different stack but similar patterns)
- CRM domain knowledge and best practices (HIGH confidence - established patterns)

---
*Architecture research for: Self-hostable CRM with Next.js*
*Researched: 2026-02-22*
