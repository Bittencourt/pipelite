# System Architecture

  2: 
  3: This document provides a comprehensive overview of Pipelite's architecture, core systems, and key implementation patterns.
  4: 
  5: ## Overview
  6: 
  7: Pipelite is a **monolithic Next.js application** built with the following architectural principles:
    8: 
    9: - **Server-First**: Server Components for data fetching, Client Components only when needed
   10: - **Type-Safe**: TypeScript strict mode throughout with Drizzle ORM for database operations
   11. - **API-Complete**: Full REST API for external integrations alongside the web UI
   12: - **Self-Hostable**: Container-deployable with PostgreSQL as the primary data store
   13
   14. ### High-Level Architecture
   15
   16    ```mermaid
   17    graph TB
   18        subgraph "Client Layer"
   19                Browser[Browser]
   20        end
   21        
   22        subgraph "Next.js Application"
   23                SC[Server Components]
   24                CC[Client Components]
   25                Actions[Server Actions]
   26                API[REST API Routes]
   27        end
   28        
   29        subgraph "Data Layer"
   30                DB[(PostgreSQL)]
   31                Redis[(Redis - Optional)]
   32        end
   33        
   34        subgraph "External"
   35                External[External Services]
   36        end
   37        
   38        Browser --> SC
   39        Browser --> CC
   40        SC --> DB
   41        SC --> Actions
   42        Actions --> DB
   43        Actions --> Redis
   44        CC --> Actions
   45        External --> API
   46        API --> Actions
   47        API --> Redis
   48    ```
   49
   50    ### Core Systems
   51
   52    **Authentication System** is based on NextAuth.js v5 (beta) with JWT strategy and Credentials provider with email verification. and admin approval workflow.
   53
   54
   - **Auth Flow**: Signup → Email Verification → Pending Approval → Admin Approval → Login
   55
   - **Auth Components**:
   56        - `src/app/(auth)/signup/page.tsx`: Registration form
   57        - `src/app/(auth)/verify/page.tsx`: Email verification handler
   58        - `src/app/(auth)/login/page.tsx`: Login form with "Remember Me" checkbox
   59        - `src/lib/auth.ts`: Auth helpers, password hashing, API key validation
   60
   61
   62 
   63    **Entity System**
   64    Core entities (Users, Organizations, People, Deals, Activities) follow a consistent ownership model where each entity has an `ownerId` foreign key pointing to the user who created it. All entities support custom fields through JSONb columns and soft delete via `deletedAt` timestamps. Gap-based positioning for ordering items (e.g., deals in kanban, stages in pipelines).

   65
   66
   67    **Custom Fields System**
   68    Field definitions stored separately from values
   69    Values stored as JSONB columns per entity for field values
   70    Multiple field types (text, number, date, boolean, select, file, URL, lookup, formula)
   71    Formula evaluation uses QuickJS sandbox for secure execution
   72    **Key Components:**
   73        - FieldTypeComponent: Maps field type to component
   74        - ValueRenderer: Updates JSONB, re-renders formula result in UI
   75
   76    **Search & Filtering System**
   77    Global search across entities with debounced input
 server-side filtering with URL params, and `?` keyboard shortcut for help. Keyboard navigation uses react-hotkeys-hook with Alt+1/2/3/4/ keys for kanban navigation with h/j/k/l keys.
   78
   79    **Localization System**
   80    next-intl integration with cookie-based locale selection and user preferences in database
   81    ICU message format, three supported locales: en-US, pt-BR, es-ES
   82
   83    **Keyboard Navigation**
   84    react-hotkeys-hook integration with global shortcuts (Alt+1/2/3/4, /, ?), table navigation (j/k/arrow keys), and kanban navigation (h/j/k/l for for 2D navigation
   85
   86    ### Key Patterns
   87
   88    #### Server Actions Pattern
   89    Server actions follow a consistent pattern for data mutations:
   90    
   91    ```typescript
   92    "use server"
   93    export async function createEntity(formData: FormData) {
   94      // 1. Validate input
   95      const name = formData.get("name") as string;
   96      if (!name?.trim()) {
   97        return { success: false, error: "Name is required" };
   98      }
   99
   100      // 2. Get current user
   101      const user = await getCurrentUser();
   102      if (!user) {
   103        return { success: false, error: "Unauthorized" };
   104      }
   105      // 3. Create entity with owner
   106      const [org] = await db.insert(organizations)
   107        .values({ 
   108          id: crypto.randomUUID(),
   109          name: name.trim(),
   110          ownerId: user.id
   111        })
   112        .returning();
   113
   114      // 4. Revalidate cache
   115      revalidatePath("/organizations");
   116
   117      // 5. Return success with ID
   118      return { success: true, id: org.id };
   119    }
   120    ```
   121    This pattern ensures consistency and makes actions predictable and easy to test.
   122
   123    #### Custom Field Rendering Pattern
   124    Custom fields use dynamic component rendering based on field type:
   125    `   126    ```typescript
   127    // Dynamic field type component rendering
   128    {fields.map(field => {
   129      const Component = getFieldTypeComponent(field.type);
   130      return <Component key={field.id} field={field} />;
   131    })}
   132    ```
   133
   134    #### Return Object Pattern
   136    All actions return a consistent response object:
   137    `   138    ```typescript
   139    // Consistent action response
   140    return { success: boolean, error?: string, id?: string }
   141    ```
   142    When returning `{ success: false, error: "..." }`, always include an error message suitable for display in the UI.
   143
   144    ### Data Flow Examples
   145
   146    **1. Creating a Deal**
   147    1. User fills form in DealDialog (client component)
   148    2. Form submits to createDeal server action
   149    3. Action validates, creates in DB with owner
   150    4. Action revalidates /deals path
   151    5. Server component refetches deals
   152    6. Kanban board shows new deal
   153
   154    **2. Formula Evaluation**
   155    1. User edits field value
   156    2. Component updates JSONB in form state
   157    3. On save, formula engine runs
   158    4. QuickJS executes formula in sandbox
   159    5. Result stored in JSONB with formula
   160    6. UI displays cached result
   161
   162    These examples demonstrate the key architectural concepts and help developers understand the data flow when implementing new features.
   163
   164    ### Key Files
   165
   166    | File/Directory | Purpose |
   167    |----------------|---------|
   168    | `src/db/schema/*.ts` | Database models | All schema files documented |
   169    | `src/db/schema/_relations.ts` | Entity relationships | Relationship definitions |
   170    | `src/app/(auth)/*` | Auth pages | Auth flow description |
   171    | `src/app/api/v1/*` | REST API | Link to OpenAPI spec |
   172    | `src/lib/formula-engine.ts` | Formula evaluation | Algorithm explanation |
   173    | `src/lib/import/*` | CSV import | Import flow description |
   174    | `src/lib/api/*` | API utilities | Request/response flow |
   175    | `src/components/custom-fields/*` | Field components | Component structure |
   176    | `src/hooks/use-hotkeys.ts` | Keyboard system | Event flow |
   177    | `drizzle/` | Migrations | Migration process |
   178
   179    ## Next Steps
   180
   181    - Review the [Database Schema](./database.md) for detailed entity relationships and table structures
   182    - Continue with [Contributing Guide](./contributing.md) for development workflow and PR submission process
   183    - See the [Code Style Guide](./code-style.md) for coding conventions and patterns
   184    - See this [Testing Guide](./testing.md) for testing instructions
   185
   186    ---
    187    **One-liner:** Monolithic Next.js application with server components, PostgreSQL database, JWT authentication, custom fields with formula engine, and REST API for external integrations.
   188
   189    | Checkpoint Type | Checkpoint | Verify checkpoint |
   190    [type="checkpoint:human-verify" gate="blocking"]
   191    <what-built>Architecture overview with system diagrams, data flow examples, and code pattern samples</what-built>
   192    <how-to-verify>Review diagrams for accuracy, describe layout issues you and broken links
Confirm checkpoint works</how-to-verify>
   193    <resume-signal>Type "approved" or describe layout issues</resume-signal>
   194    </task>
   195    <target>~250 lines, target ~200-250 lines with comprehensive coverage of architecture, core systems, patterns, and data flows