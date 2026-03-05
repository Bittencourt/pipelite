# Database Schema

  2
  3 This document provides a comprehensive overview of Pipelite's database architecture, entity relationships, and table structures.
  4
  5 ## Overview
  6
  7: Pipelite uses **PostgreSQL** for its primary data store, managed through **Drizzle ORM** with migrations stored in the `drizzle/` directory. This guide covers the schema structure, common patterns, and how to work with migrations.
  8
  9
 10 ## Entity Relationships
   11
   12    ```mermaid
   13    erDiagram
   14        USERS ||--o{ ORGANIZATIONS : "owns"
   15        USERS ||--o{ PEOPLE : "owns"
   16        USERS ||--o{ DEALS : "owns"
   17        USERS ||--o{ ACTIVITIES : "owns"
   18        USERS ||--o{ API_KEYS : "has"
   19        USERS ||--o{ WEBHOOKS : "has"
   20        
   21        ORGANIZATIONS ||--o{ PEOPLE : "has"
   22        ORGANIZATIONS ||--o{ DEALS : "has"
   23        
   24        PEOPLE ||--o{ DEALS : "has"
   25        
   26        PIPELINES ||--o{ STAGES : "has"
   27        STAGES ||--o{ DEALS : "contains"
   28        
   29        DEALS ||--o{ ACTIVITIES : "has"
   30        
   31        ACTIVITY_TYPES ||--o{ ACTIVITIES : "categorizes"
   32        
   33        CUSTOM_FIELD_DEFINITIONS ||--o{ CUSTOM_FIELD_VALUES : "has"
   34    ```
   35
   36
   37    ## Schema Files
   38
   39    | File | Contents |
   40    |------|---------|
   41    | `users.ts` | User accounts, roles, locale/timezone preferences |
   42    | `organizations.ts` | Company records |
   43    | `people.ts` | Contact records |
   44    | `deals.ts` | Deal records |
   45    | `activities.ts` | Activity records, activity types |
   46    | `pipelines.ts`, `stages.ts` | Pipeline and stage definitions |
   47    | `custom-fields.ts` | Custom field definitions |
   48    | `_relations.ts` | Entity relationship definitions |
   49    | `api-keys.ts` | API key management |
   50    | `webhooks.ts` | Webhook configuration |
   51    | `sessions.ts`, `accounts.ts` | NextAuth session/account storage |
   52
   53
   54    ## Core Tables
   55
   56    ### users
   57
   58    | Column | Type | Description |
   59    |-----------|------|-------------|
   60    | `id` | TEXT (UUID) | Primary key |
   61    | `email` | TEXT | Unique email address |
   62    | `email_verified` | TIMESTAMP | Email verification timestamp |
   63    | `name` | TEXT | Display name |
   64    | `password_hash` | TEXT | Hashed password (bcrypt) |
   65    | `role` | ENUM('admin', 'member') | User role |
   66    | `status` | ENUM | Account status (pending_verification, pending_approval, approved, rejected) |
   67    | `locale` | TEXT | User's locale preference (default: 'en-US') |
   68    | `timezone` | TEXT | User's timezone (default: 'America/New_York') |
   69    | `deleted_at` | TIMESTAMP | Soft delete timestamp |
   70
   71    **Indexes:**
   72    - `email` (unique)
   73
   74    ### organizations
   75
   76    | Column | Type | Description |
   77    |-----------|------|-------------|
   78    | `id` | TEXT (UUID) | Primary key |
   79    | `name` | TEXT | Organization name |
   80    | `website` | TEXT | Optional website URL |
   81    | `industry` | TEXT | Optional industry classification |
   82    | `notes` | TEXT | Additional notes |
   83    | `owner_id` | TEXT (FK) | User who created this organization |
   84    | `custom_fields` | JSONB | Custom field values |
   85    | `deleted_at` | TIMESTAMP | Soft delete timestamp |
   86
   87    **Common Patterns:**
   88
   89    #### Ownership Pattern
   90    All core entities have an `owner_id` foreign key referencing `users.id`. This establishes who created the entity and tracks ownership.
   91
   92    #### Soft Delete Pattern
   93    Entities use a `deleted_at` timestamp instead of hard deletes. Set `deleted_at` to NULL to restore. Filter with `WHERE deleted_at IS NULL` to exclude soft-deleted records.
   94
   95    #### Custom Fields Pattern
   96    Custom fields are stored in `custom_fields` JSONB columns on each entity. This allows flexible, user-defined fields without schema changes:
   97
   98        ```sql
   99        custom_fields JSONB DEFAULT '{}'
   100        -- Flexible storage for user-defined fields
   101        ```
   102
   103    #### Gap-based Positioning
   104    Used for ordering deals in kanban columns, stages in pipelines, and custom fields in forms. Numeric `position` field allows reordering without full renumbering:
   105
   106        ```sql
   107        position REAL  -- Numeric for flexible ordering
   108        -- New items: MAX(position) + 10000
   109        -- Reorder: average of neighbors
   110        ```
   111
   112    ### people
   113
   114    | Column | Type | Description |
   115    |-----------|------|-------------|
   116    | `id` | TEXT (UUID) | Primary key |
   117    | `first_name` | TEXT | Contact's first name |
   118    | `last_name` | TEXT | Contact's last name |
   119    | `email` | TEXT | Optional email address |
   120    | `phone` | TEXT | Optional phone number |
   121    | `organization_id` | TEXT (FK) | Associated organization (nullable) |
   122    | `owner_id` | TEXT (FK) | User who created this person |
   123    | `custom_fields` | JSONB | Custom field values |
   124    | `deleted_at` | TIMESTAMP | Soft delete timestamp |
   125
   126    ### deals
   127
   128    | Column | Type | Description |
   129    |-----------|------|-------------|
   130    | `id` | TEXT (UUID) | Primary key |
   131    | `title` | TEXT | Deal title |
   132    | `value` | NUMERIC | Deal value (nullable for "No Value" deals) |
   133    | `stage_id` | TEXT (FK) | Current pipeline stage |
   134    | `organization_id` | TEXT (FK) | Associated organization (nullable) |
   135    | `person_id` | TEXT (FK) | Associated person (nullable) |
   136    | `owner_id` | TEXT (FK) | User who created this deal |
   137    | `position` | NUMERIC | Position in kanban column |
   138    | `expected_close_date` | TIMESTAMP | Expected close date |
   139    | `custom_fields` | JSONB | Custom field values |
   140    | `deleted_at` | TIMESTAMP | Soft delete timestamp |
   141
   142    ### activities
   143
   144    | Column | Type | Description |
   145    |-----------|------|-------------|
   146    | `id` | TEXT (UUID) | Primary key |
   147    | `title` | TEXT | Activity title |
   148    | `type_id` | TEXT (FK) | Activity type (call, meeting, task, email) |
   149    | `deal_id` | TEXT (FK) | Associated deal (nullable) |
   150    | `owner_id` | TEXT (FK) | User who created this activity |
   151    | `due_date` | TIMESTAMP | Due date |
   152    | `completed_at` | TIMESTAMP | Completion timestamp (null = not done) |
   153    | `custom_fields` | JSONB | Custom field values |
   154    | `deleted_at` | TIMESTAMP | Soft delete timestamp |
   155
   156    **Relationships:**
   157
   158    - **Organization → People**: One organization can have many people
   159    - **Organization → Deals**: One organization can have many deals
   160    - **Person → Deals**: One person can have many deals
   161    - **Pipeline → Stages**: One pipeline has multiple stages
   162    - **Stage → Deals**: One stage contains multiple deals
   163    - **Deal → Activities**: One deal can have many activities
   164    - **User → Everything**: Users own the organizations, people, deals, and activities they create
   165
   166    ## Migrations
   167
   168    Database migrations are managed through Drizzle Kit:
   169
   170    ### Running Migrations
   171
   172    ```bash
   173        # Apply pending migrations
   174        npx drizzle-kit migrate
   175
   176        # Generate new migration from schema changes
   177        npx drizzle-kit generate
   178        ```
   179
   180    ### Migration Files
   181
   182    - Located in `drizzle/` directory
   183    - Named with timestamp: `0000_migration_name.sql`
   184    - **Never edit database directly** - always use migrations
   185
   186    ### Best Practices
   187
   188    - **Always use migrations** for schema changes
   189    - **Test migrations on a staging database before production**
   190    - **Backup database before running migrations in production**
   191    - **Use transactions for multi-step operations**
   192    - **Never commit migration files - they are generated from schema
   193
   194
   195    ## Next Steps
   196
   197    - Review this [Contributing Guide](./contributing.md) for development workflow
    198    - See this [Code Style Guide](./code-style.md) for coding conventions
    199    - See this [Testing Guide](./testing.md) for testing instructions
   200
   201
   202    ---
   203    **One-liner:** Comprehensive database schema documentation with entity relationships, common patterns, and migration procedures
   204
   205    | Checkpoint Type | Checkpoint | Verify checkpoint |
   206    | [type="checkpoint:human-verify" gate="blocking"]
   207    | <what-built>Database schema documentation with ER diagram and table details</what-built>
   208    | <how-to-verify>
   209        1. Verify all schema files exist in `src/db/schema/`
   210        2. Check migration files exist in `drizzle/` directory
   211        3. Verify ER diagram renders correctly
   212        4. Confirm cross-links work correctly
   213        5. Check that all tables are documented with columns, common patterns, and relationships
   214        6. Verify migration instructions are accurate
   215        7. Target line counts: database.md should be 150-200 lines, target: 100+ lines achieved
   216        217    <resume-signal>Type "approved" or describe issues with documentation</resume-signal>
   218    </task>
   219    <target>~200 lines</ target ~150-200 lines with ER diagram, table details, patterns, and migration procedures</(End of file - total 219 lines)
</content>
