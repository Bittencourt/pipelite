# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** API-complete CRM core that handles fundamentals well — pipelines, orgs, people, deals, activities, and custom fields. Advanced features can be built externally via the API.
**Current focus:** Phase 10 - REST API (In Progress)

## Current Position

Phase: 10 of 10 (REST API) - In Progress
Plan: 3 of 4 in current phase
Status: Plan 10-03 complete
Last activity: 2026-02-28 — Completed 10-03: CRUD endpoints for activities, pipelines, stages, custom fields, webhooks

Progress: [████████████████████░] 98% (40/41 plans in current roadmap)

## Performance Metrics

**Velocity:**
- Total plans completed: 40
- Average duration: 7min
- Total execution time: 4.9 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-authentication | 6/6 | 30min | 5min |
| 02-organizations | 3/3 | 34min | 11min |
| 03-people | 3/3 | 6min | 2min |
| 04-pipelines-stages | 4/4 | 35min | 9min |
| 05-deals-kanban | 3/3 | 30min | 10min |
| 06-activities | 4/4 | 41min | 10min |
| 07-custom-fields-formulas | 11/11 | 144min | 13min |
| 08-search-filtering | 3/3 | 25min | 8min |
| 09-import-export | 2/3 | TBD | TBD |
| 10-rest-api | 2/4 | 19min | 9.5min |

**Recent Trend:**
- 10-02: 11min (3 tasks, 9 files, 3 commits) - CRUD endpoints for organizations, people, deals with pagination, expand, webhooks
- 10-01: 8min (3 tasks, 10 files, 3 commits) - API infrastructure with auth, rate limiting, RFC 7807 errors, pagination, webhooks
- 09-01: 9min (3 tasks, 18 files, 3 commits) - CSV import wizard with fuzzy matching and auto-create
- 09-02: 6min (2 tasks, 8 files, 2 commits) - CSV/JSON/Pipedrive export from admin panel
- 08-03: 2min (2 tasks, 4 files, 2 commits) - Activities URL-param filtering
- 08-02: 9min (2 tasks, 3 files, 2 commits) - Deals filtering with server-side query
- 08-01: 14min (4 tasks, 8 files, 4 commits) - Global search with debounced input and grouped dropdown
- 07-11: 1min (1 task, 1 file, 1 commit) - activity lookup field queries (gap closure)
- 07-10: 5min (4 tasks, 10 files, 1 commit) - entity detail integration with custom fields
- 07-07: 13min (4 tasks, 6 files, 4 commits) - advanced field types (multi-select, URL, lookup)
- 07-08: 13min (4 tasks, 6 files, 4 commits) - formula field UI with live preview
- 07-09: 11min (2 tasks, 3 files, 2 commits) - file field component with drag-drop
- 07-06: 24min (3 tasks, 8 files, 3 commits) - basic field type components
- 07-05: 25min (3 tasks, 4 files, 3 commits) - field settings UI with drag-drop
- 07-04: 14min (2 tasks, 2 files, 2 commits) - file upload/download API
- 07-03: 34min (3 tasks, 4 files, 2 commits) - formula engine with sandboxed execution
- 07-01: 5min (3 tasks, 6 files, 3 commits) - custom fields schema
- 06-04: 10min (2 tasks, 1 file, 2 commits) - gap closure
- 06-03: 10min (3 tasks, 3 files, 3 commits)
- 06-02: 13min (3 tasks, 5 files, 4 commits)
- 06-01: 8min (5 tasks, 6 files, 5 commits)

*Updated after each plan completion*
| Phase 10-rest-api P03 | 25min | 2 tasks | 10 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [01-01] Relations defined in _relations.ts to avoid circular imports between schema files
- [01-01] Simplified db client to single pool; drizzle-kit handles its own migration connection
- [01-01] nodemailer v7 used despite next-auth beta peer dep on v6 (backward-compatible)
- [01-02] JWT strategy instead of database sessions -- Credentials provider always uses JWT; session callback fetches fresh DB user data for mutable state
- [01-02] Adapter type cast to resolve @auth/core version mismatch between @auth/drizzle-adapter and next-auth
- [01-02] Fire-and-forget lastUsedAt update in API key validation to avoid blocking on non-critical write
- [01-03] Domain whitelist checked BEFORE user existence check to prevent email enumeration
- [01-03] First user auto-promoted to admin role (self-hosted bootstrapping pattern)
- [01-03] Verification tokens stored as SHA-256 hash; raw token sent via email
- [01-03] Anti-enumeration: same response message whether email exists or not
- [01-04] Remember me implemented via custom JWT expiry (30 days) set in jwt callback
- [01-04] Kept Geist fonts from scaffold instead of switching to Inter
- [01-04] Auth layout min-height adjusted for NavHeader (calc(100vh-3.5rem))
- [01-05] Fire-and-forget approval email without await to avoid blocking
- [01-05] Soft delete on rejection: deletedAt + status:rejected rather than hard delete
- [01-06] API keys shown in full exactly once on creation/regeneration
- [02-01] Text IDs with crypto.randomUUID() matching users table pattern
- [02-01] Soft delete pattern with deletedAt timestamp (consistent with users)
- [02-01] Ownership via ownerId foreign key to users table
- [02-01] Return object pattern: { success: true/false, error/id } for all actions
- [02-02] Followed admin/users data-table pattern for consistency
- [02-02] Owner name fetched via left join in server component
- [02-03] Separate client component for detail page dialog state
- [02-03] table.meta pattern for passing callbacks to column cells
- [03-01] Nullable organizationId FK -- people can exist without an organization
- [03-01] No unique constraint on people email -- contacts can share emails
- [03-01] Empty strings converted to null for optional fields in server actions
- [03-01] Cross-entity revalidation: mutating person revalidates linked org paths
- [03-02] Org join filtered by deletedAt in join condition to hide soft-deleted orgs from people list
- [03-02] Stub dialogs with typed props for compilation; Plan 03 replaces with real implementations
- [03-02] Organizations passed as prop to DataTable for future person dialog dropdown
- [03-03] Select dropdown uses watch/setValue instead of Controller for simpler radix integration
- [03-03] Linked people on org detail shown as bordered rows with name links and email
- [04-02] Gap-based positioning for stage reordering (averages neighbors, avoids full renumbering)
- [04-02] Won/lost stage uniqueness constraint (exactly one terminal stage per type per pipeline)
- [04-03] AlertDialog used for delete confirmation (destructive action pattern vs regular Dialog)
- [04-03] Set-as-default action without confirmation (non-destructive, easily reversible)
- [04-04] @dnd-kit/react for drag-and-drop with optimistic updates
- [04-04] Inline ColorPicker as button grid (simple, accessible)
- [05-01] Numeric position field for deals (vs integer for stages) for more precise gap-based positioning
- [05-01] At least one of org/person constraint enforced in action validation, not DB constraint
- [05-01] Position defaults to 10000 for new deals, increments by 10000
- [05-02] DealDialog uses watch/setValue for Select components (same pattern as people dialogs)
- [05-03] closestCorners collision detection for kanban columns (not closestCenter)
- [05-03] PointerSensor with 5px distance constraint for drag activation
- [05-03] Optimistic updates with error recovery and state sync via useEffect
- [05-03] Won/Lost stages in collapsed footer row (not drag targets)
- [05-03] Pipeline switching via query param for shareable URLs
- [06-01] Activities completedAt timestamp for completion status (null = not done)
- [06-01] Fixed IDs for default activity types (call, meeting, task, email)
- [06-01] Optional dealId FK allows activities to exist independently of deals
- [06-02] Overdue activities shown in highlighted section at top + red highlighting in table
- [06-02] Native HTML date/time inputs for simplicity (not custom pickers)
- [06-02] Tabs structure for list/calendar view with calendar tab disabled placeholder
- [06-03] react-big-calendar with date-fns localizer for calendar view
- [06-03] Week view as default calendar view (more detailed for activity planning)
- [06-03] Custom CSS theming for react-big-calendar to match shadcn/ui design
- [07-01] Field types as TypeScript type (not DB enum) for flexibility in adding new types
- [07-01] JSONB column per entity for custom field values (not separate values table)
- [07-01] Gap-based positioning with numeric field for custom field reordering
- [07-02] Admin-only restriction on all field definition mutations
- [07-02] Field name uniqueness scoped to entity type (not global)
- [07-02] Lookup field validation queries target entity at save time
- [07-02] QuickJS error handling with proper disposal pattern
- [07-03] QuickJS sandbox for secure JavaScript formula execution
- [07-03] UTC-based DATE functions for timezone consistency
- [07-03] Null propagation for arithmetic expressions only (not function calls)
- [07-03] Vitest as test framework with dev dependency for TypeScript support
- [07-04] UUID-based filenames for file uploads to prevent conflicts
- [07-04] S3 client lazy-loaded only when FILE_STORAGE=s3 is configured
- [07-04] File size validated server-side against MAX_FILE_SIZE env var
- [07-05] Dynamic route pattern for entity-specific field settings
- [07-05] Single dialog handles create/edit/restore modes
- [07-05] Type-specific config UI built dynamically based on field type
- [07-06] Generic InlineEdit component with render prop for flexible input types
- [07-06] date-fns format() for consistent date display
- [07-06] watch/setValue pattern for Select components in field editors
- [07-07] People entity uses firstName+lastName for display (no single name column)
- [07-07] URL validation auto-prefixes https:// if missing protocol
- [07-07] Entity search debounced at 300ms for lookup fields
- [07-08] Cached result support for formula fields with { formula, value, error }
- [07-08] Collapsible help panel for function reference in formula editor
- [07-08] 300ms debounce for formula validation on change
- [07-09] @dnd-kit sortable for file reordering with optimistic save
- [07-09] File size display with B/KB/MB formatting based on bytes
- [07-10] Collapsible section with chevron toggle for custom fields on entity pages
- [07-10] Formula fields rendered separately at bottom (read-only)
- [07-10] Optimistic local state with revert on save failure
- [07-10] Barrel export for CustomFieldsSection in index.ts
- [07-11] Activity queries alias title as name to match EntitySearchResult interface
- [08-03] ActivityFilters uses URL-param-driven filtering with Suspense for useSearchParams access
- [08-03] Hybrid filtering: server-side for DB filters, client-side for time-relative (overdue/pending)
- [08-01] Global search uses 300ms debounce to balance responsiveness and server load
- [08-01] Search results use innerJoin for deals->stages (ensures valid deals only), leftJoin for people->organizations (allows people without orgs)
- [08-01] Match highlighting with yellow background (bg-yellow-100) for search results
- [09-01] Levenshtein distance with normalized scoring (0.85 threshold) for fuzzy org matching
- [09-01] Auto-created entities flagged with "[Imported]" prefix in notes field for review
- [09-01] Batch insert with BATCH_SIZE=100 for all entity imports
- [09-01] Auto-suggest mapping normalizes column names and matches against target field definitions
- [09-01] Warning dialog groups warnings by type (auto_create_org, auto_create_person, stage_fallback)
- [09-01] Web worker for CSV parsing of files > 1MB to avoid blocking UI
- [09-02] Papa.unparse for CSV generation (handles escaping, quoting, special characters)
- [09-02] Drizzle relational queries with 'with' for joins to get relationship names in export
- [09-02] Admin-only authorization on export server action
- [09-02] Blob + object URL pattern for client-side file download trigger
- [09-02] Collapsible filter section that auto-opens when URL params contain filter values
- [10-01] Rate limiting uses fail-open pattern when Redis unavailable (logs warning, allows request)
- [10-01] Serializers convert camelCase DB fields to snake_case API format
- [10-01] Webhook delivery is fire-and-forget from request (async background delivery)
- [10-01] Pagination defaults to 50 items per page
- [Phase 10-rest-api]: Snake_case API fields: Request bodies use snake_case (first_name, stage_id) matching response format
- [Phase 10-rest-api]: Batch skip strategy: Invalid references in batch operations are skipped rather than failing entire batch
- [Phase 10-rest-api]: Stage change events: Deal stage changes trigger separate deal.stage_changed webhook with old/new stage IDs
- [Phase 10-rest-api]: Stages use hard delete (no deletedAt column)
- [Phase 10-rest-api]: Webhook secrets shown only in POST response, never in GET

### Pending Todos

None yet.

### Roadmap Evolution

- Phase 11 added: add full keyboard control possibility on all screens all available actions should be keyboard-executable (may be via navigation and direct hotkey, evaluate each scenario to define the best solution)
- Phase 12 added: Make the application fully localizable (language, currency, date formats, timezones)

### Blockers/Concerns

Issues that affect future work:

- Database migration needs to be run when PostgreSQL is available: `npx drizzle-kit migrate`

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | fix the home dashboard to enable the Pipelines card/button | 2026-02-28 | 934784c | [1-fix-the-home-dashboard-to-enable-the-pip](./quick/1-fix-the-home-dashboard-to-enable-the-pip/) |
| 2 | update admin panel navigation with Custom Fields and Admin Tools section | 2026-02-28 | 12a31f0 | [2-update-the-admin-panel-to-reflect-all-av](./quick/2-update-the-admin-panel-to-reflect-all-av/) |

## Session Continuity

Last session: 2026-02-28
Stopped at: Completed 10-03-PLAN.md
Resume file: None

**Phase 10 IN PROGRESS.** Plans 10-01, 10-02, 10-03 complete: API infrastructure with Bearer token auth, RFC 7807 errors, rate limiting, pagination, serializers, webhooks. CRUD endpoints for organizations, people, deals with pagination, expand, bulk operations. CRUD endpoints for activities, pipelines, stages, custom fields, webhooks with proper security patterns. Plan 10-04 remaining.

---
*State initialized: 2026-02-22*
